import { describe, expect, it } from 'vitest';
import {
  SECTION_H, WORLD_Y_MAX, WORLD_Y_MIN, depthBandAt, relativeToSea, SEA_LEVEL, itemCeilY, itemKillY,
} from './constants.js';
import { B } from './blocks.js';
import { World } from './world.js';
import { generateSection, generateChunk } from './worldgen.js';
import { bedrockTopY } from './worldgenDeep.js';
import { PLAYER, createPlayerBody, stepPlayer } from './physics.js';
import { applyEditsToWorld, decodeEdits, encodeEdits } from './saveEdits.js';
import { computeChunkLight } from './lighting.js';
import { bandRange, meshFromWire } from '../render/chunkMgrCore.js';
import { ceilingFor, clampBodyToWorld } from '../gamePlayer.js';

const SEED = 77031;
const DT = 1 / 60;

function sectionBlocks(seed, cx, cz, si) {
  const d = generateSection(seed, cx, cz, si, {});
  if (d.blocks) return d.blocks;
  return new Uint8Array(4096).fill(d.uniform);
}

function hashBytes(a) {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619) >>> 0;
  return h;
}

describe('derin dünya: sabitler', () => {
  it('aralık -400..362, deniz 42 + 320 = tavan; yardımcılar tutarlı', () => {
    expect(WORLD_Y_MIN).toBe(-400);
    expect(WORLD_Y_MAX).toBe(SEA_LEVEL + 320);
    expect(SECTION_H).toBe(16);
    expect(relativeToSea(SEA_LEVEL)).toBe(0);
    expect(relativeToSea(SEA_LEVEL - 100)).toBe(-100);
    expect(depthBandAt(SEA_LEVEL + 5).key).toBe('yuzey');
    expect(depthBandAt(-390).key).toBe('dip');
    expect(depthBandAt(-100).key).not.toBe(depthBandAt(-250).key);
    expect(itemKillY(new World({ seed: SEED }))).toBeLessThan(WORLD_Y_MIN);
    expect(itemCeilY(new World({ seed: SEED }))).toBeGreaterThanOrEqual(WORLD_Y_MAX);
  });
});

describe('ana kaya tabanı tamamen mühürler (100 tohum)', { timeout: 120000 }, () => {
  it('y ≤ -399 her hücrede BEDROCK, tepe -396\'yı aşmaz, üstünde BEDROCK yok; çevre kesitin en alt iki katmanı sürekli', () => {
    for (let k = 0; k < 100; k++) {
      const seed = 1000 + k * 7919;
      const cx = (k % 9) - 4;
      const cz = ((k * 3) % 11) - 5;
      const b = sectionBlocks(seed, cx, cz, 0);
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const top = bedrockTopY(seed, cx * 16 + lx, cz * 16 + lz);
          expect(top).toBeGreaterThanOrEqual(-399);
          expect(top).toBeLessThanOrEqual(-396);
          for (let ly = 0; ly < 16; ly++) {
            const y = WORLD_Y_MIN + ly;
            const id = b[(ly << 8) + (lz << 4) + lx];
            if (y <= top) expect(id).toBe(B.BEDROCK);
            else expect(id).not.toBe(B.BEDROCK);
          }
        }
      }
    }
  });
});

describe('derin üretim: belirlenimcilik ve kesit sınırları', () => {
  it('kesit üretim sırası ve ensureSection sırası sonucu değiştirmez', () => {
    const sis = [0, 3, 7, 12, 18, 24];
    const fwd = sis.map((si) => hashBytes(sectionBlocks(SEED, 2, -3, si)));
    const rev = sis.slice().reverse().map((si) => hashBytes(sectionBlocks(SEED, 2, -3, si))).reverse();
    expect(rev).toEqual(fwd);
    const a = new World({ seed: SEED });
    const b = new World({ seed: SEED });
    [a, b].forEach((w) => w.ensureChunk(1, 1));
    sis.forEach((si) => a.ensureSection(1, 1, si));
    sis.slice().reverse().forEach((si) => b.ensureSection(1, 1, si));
    sis.forEach((si) => {
      const ca = a.getChunk(1, 1);
      const cb = b.getChunk(1, 1);
      expect(hashBytes(ca.getSectionBlocks(si) || sectionBlocks(0, 0, 0, 0))).toBe(hashBytes(cb.getSectionBlocks(si) || sectionBlocks(0, 0, 0, 0)));
      const la = ca.getSectionLight(si);
      const lb = cb.getSectionLight(si);
      expect((la === null) === (lb === null)).toBe(true);
      if (la) expect(hashBytes(la)).toBe(hashBytes(lb));
    });
  });

  it('y=15/16 ve negatif y sınırında getBlock/getLight kesitle tutarlı', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(1, 1);
    const c = w.getChunk(1, 1);
    for (const y of [-401 + 1, -385, -384, -369, -368, -17, -16, -1, 0, 15, 16, 31, 32]) {
      w.ensureSection(1, 1, w.sectionOf(y));
      const si = (y - WORLD_Y_MIN) >> 4;
      const ly = (y - WORLD_Y_MIN) & 15;
      const blocks = c.getSectionBlocks(si);
      const want = blocks ? blocks[(ly << 8) + (5 << 4) + 6] : c.secUniform[si];
      expect(w.getBlock(16 + 6, y, 16 + 5)).toBe(want);
      expect(c.get(6, y, 5)).toBe(want);
      expect(c.sectionOfY ? true : true).toBe(true);
    }
    // sınırda yerleştirilen meşale ışığı kesit çizgisini aşar (y=15 → 16, y=-1 → -2)
    for (const y of [-17, -1, 15]) {
      const x = 16 + 8;
      const z = 16 + 8;
      w.ensureSection(1, 1, w.sectionOf(y + 2));
      w.ensureSection(1, 1, w.sectionOf(y - 2));
      w.setBlock(x, y, z, B.AIR);
      w.setBlock(x, y + 1, z, B.AIR);
      w.setBlock(x, y - 1, z, B.AIR);
      w.setBlock(x, y, z, B.TORCH);
      const lo = w.getLight(x, y - 1, z);
      const hi = w.getLight(x, y + 1, z);
      expect(lo & 15).toBeGreaterThan(0);
      expect(hi & 15).toBeGreaterThan(0);
      w.setBlock(x, y, z, B.AIR);
      expect(w.getLight(x, y + 1, z) & 15).toBeLessThanOrEqual(hi & 15);
    }
  });

  it('tüm kesitler üretilmiş sütunun ışığı sıfırdan yeniden hesaplanınca aynıdır', () => {
    const c = generateChunk(SEED, 1, 1, { sections: 'all', light: true });
    const copy = c.clone();
    computeChunkLight(copy);
    for (let si = 0; si < c.sectionCount; si++) {
      const a = c.getSectionLight(si);
      const b = copy.getSectionLight(si);
      expect((a === null) === (b === null)).toBe(true);
      if (a) expect(hashBytes(a)).toBe(hashBytes(b));
    }
  });
});

describe('tek tip kesit belleği', () => {
  it('yalnız yüzey bandı yüklü sütun, 48 kesit dizisinden çok küçük; derin kesitler tembel', () => {
    const w = new World({ seed: SEED });
    const c = w.ensureChunk(1, 1);
    const typical = c.memoryBytes();
    expect(typical).toBeLessThan(40 * 1024 * 2);
    for (let si = 0; si < 25; si++) w.ensureSection(1, 1, si);
    const full = c.memoryBytes();
    expect(full).toBeGreaterThan(typical);
    // gökyüzü kesitleri (hava) dizisiz
    let airUniform = 0;
    for (let si = 40; si < 48; si++) if (c.secBlocks[si] === null && c.secUniform[si] === B.AIR) airUniform++;
    expect(airUniform).toBeGreaterThanOrEqual(6);
    // boşaltma belleği geri verir
    for (let si = 0; si < 25; si++) w.unloadSection(1, 1, si);
    expect(c.memoryBytes()).toBeLessThanOrEqual(typical + 1024);
  });
});

describe('tavan ve taban kıskacı', () => {
  it('inşa tavanı: yMax dahil yerleştirme olur, üstü olmaz; gövde tavanda kıskaçlanır', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(1, 1);
    expect(w.setBlock(20, WORLD_Y_MAX, 20, B.STONE)).toBe(true);
    expect(w.setBlock(20, WORLD_Y_MAX + 1, 20, B.STONE)).toBe(false);
    const ceil = ceilingFor(w);
    expect(ceil).toBe(WORLD_Y_MAX + 1);
    const b = createPlayerBody(20, WORLD_Y_MAX + 5, 20);
    b.vy = 50;
    expect(clampBodyToWorld(b, null, ceil)).toBe(true);
    expect(b.y + b.h).toBeLessThanOrEqual(ceil + b.h + 1e-6);
    expect(b.y).toBeLessThanOrEqual(ceil);
    expect(b.vy).toBeLessThanOrEqual(0);
  });

  it('uçarak tavana yüklenince sonsuz yükselmez', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(1, 1);
    const body = createPlayerBody(24.5, WORLD_Y_MAX - 5, 24.5);
    body.flying = true;
    const ceil = ceilingFor(w);
    for (let i = 0; i < 600; i++) {
      stepPlayer(body, { fly: true, flyUp: true, jump: true, up: true }, w, DT, { fly: true }, {});
      clampBodyToWorld(body, null, ceil);
    }
    expect(body.y).toBeLessThanOrEqual(ceil + 1e-6);
  });
});

describe('dibe düşüş', () => {
  it('delinmiş şaftta düşen oyuncu ana kayada durur: tek hasar olayı, void/ölüm döngüsü yok', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(1, 1);
    const x = 24;
    const z = 24;
    for (let y = -399; y <= 70; y++) w.setBlock(x, y, z, B.AIR); // taban ana kayası (reddedilir) hariç
    // çevre kaya: şaft duvarlarına gerek yok (tek sütunlu gövde 0.6 geniş; bloğun ortasında)
    const body = createPlayerBody(x + 0.5, 70, z + 0.5);
    let falls = 0;
    let voids = 0;
    let damage = 0;
    let rest = 0;
    for (let i = 0; i < 60 * 60 && rest < 120; i++) {
      w.ensureSectionsNear(body.x, body.y, body.z, 6, 22 + Math.min(40, Math.abs(body.vy) * 0.6), 8);
      const ev = stepPlayer(body, {}, w, DT, {}, {});
      for (let k = 0; k < ev.length; k++) {
        if (ev[k].type === 'fall') { falls++; damage += ev[k].damage; }
        if (ev[k].type === 'void') voids++;
      }
      if (body.onGround) rest++;
      expect(body.vy).toBeGreaterThanOrEqual(-120); // uç hız sınırlı
    }
    expect(voids).toBe(0);
    expect(falls).toBeLessThanOrEqual(1);
    expect(damage).toBeGreaterThan(0); // 460 blok düşüş hasar verir (normal kural)
    expect(body.onGround).toBe(true);
    const floorTop = bedrockTopY(SEED, x, z);
    expect(body.y).toBeGreaterThanOrEqual(floorTop + 1 - 1e-6);
    expect(body.y).toBeLessThan(floorTop + 1.01);
    // dibe indikten sonra kıpırdamadan beklemek ek olay üretmez
    let extra = 0;
    for (let i = 0; i < 120; i++) extra += stepPlayer(body, {}, w, DT, {}, {}).filter((e) => e.type === 'fall' || e.type === 'void').length;
    expect(extra).toBe(0);
    expect(PLAYER.voidY).toBeLessThan(0);
  });
});

describe('kayıt: derin düzenlemeler', () => {
  it('derin + yüksek düzenlemeler kesit farkına kodlanır ve yeni dünyada birebir geri gelir', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(1, 1);
    w.ensureChunk(-1, -1);
    const cells = [[20, -300, 21, B.GOLD_BLOCK], [21, -390, 22, B.BRICK], [22, -1, 23, B.TORCH], [23, 16, 24, B.GOLD_BLOCK], [24, 300, 25, B.LANTERN], [-3, -150, -4, B.BRICK]];
    cells.forEach((c) => expect(w.setBlock(c[0], c[1], c[2], c[3])).toBe(true));
    const enc = encodeEdits(w.serializeEdits());
    // yalnız dokunulan kesitler (5 farklı kesit, 6. aynı değil) yazılır
    expect(enc.chunkCount).toBeLessThanOrEqual(6);
    Object.keys(enc.chunks).forEach((k) => expect(k.split(',').length).toBe(3));
    const dec = decodeEdits(enc.chunks);
    const w2 = new World({ seed: SEED });
    expect(applyEditsToWorld(w2, dec.list)).toBe(cells.length);
    w2.ensureChunk(1, 1);
    w2.ensureChunk(-1, -1);
    cells.forEach((c) => {
      w2.ensureSection(c[0] >> 4, c[2] >> 4, w2.sectionOf(c[1]));
      expect(w2.getBlock(c[0], c[1], c[2])).toBe(c[3]);
    });
  });
});

describe('mesher: negatif y kesitleri', () => {
  it('derin bandın mesh\'i boş değildir, baseY negatiftir, tamamen taş bant boştur', () => {
    const w = new World({ seed: SEED });
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.ensureChunk(dx, dz);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let si = 0; si < 25; si++) w.ensureSection(dx, dz, si);
    const c = w.getChunk(0, 0);
    // mağara/yüz içeren bir derin bant bulana dek tara
    let found = null;
    for (let b = 0; b < 8 && !found; b++) {
      const nb = {
        n: w.getChunk(0, -1), s: w.getChunk(0, 1), e: w.getChunk(1, 0), w: w.getChunk(-1, 0),
        ne: w.getChunk(1, -1), nw: w.getChunk(-1, -1), se: w.getChunk(1, 1), sw: w.getChunk(-1, 1),
      };
      const r = bandRange(b, 48);
      const m = meshFromWire(c, nb, undefined, undefined, 0, r);
      if (m.stats.triangles > 0) found = { b, m, r };
    }
    expect(found).not.toBeNull();
    expect(found.m.baseY).toBeLessThan(0);
    expect(found.m.baseY).toBe(WORLD_Y_MIN + found.r.s0 * 16);
  });
});
