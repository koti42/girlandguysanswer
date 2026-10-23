import { describe, expect, it } from 'vitest';
import {
  CHUNK_VOLUME, WORLD_H, WORLD_Y_MAX, WORLD_Y_MIN, ZONES,
} from './constants.js';
import { B } from './blocks.js';
import { World } from './world.js';
import { computeChunkLight, stitchChunk } from './lighting.js';
import { mulberry32 } from './rng.js';
import {
  SEAL_RING_RADII, generateChunk, ringIndexAt,
} from './worldgen.js';

const SEED = 20261016;

function stoneWorld(opts) {
  return new World(Object.assign({ seed: SEED }, opts));
}

/** Chunk'ın y 0..367 aralığı düz dizi (testler için). */
const denseOf = (c) => c.toDense(0, 368);

describe('World temel erişim', () => {
  it('üretilmemiş chunk için getBlock null; ensureChunk sonrası dolu', () => {
    const w = new World({ seed: SEED });
    expect(w.getBlock(3, 40, 3)).toBeNull();
    expect(w.getChunk(0, 0)).toBeNull();
    const c = w.ensureChunk(0, 0);
    expect(c).not.toBeNull();
    expect(c.generated).toBe(true);
    expect(w.getBlock(3, 0, 3)).not.toBe(B.BEDROCK); // yüzey bandının dibi artık taş/bazalt: derin dünya sürer
    expect(w.getBlock(3, 0, 3)).toBeGreaterThan(0);
    expect(w.getBlock(3, 40, 3)).not.toBeNull();
    // derin kesitler tembel: ensureSection'a kadar null; sonra dolu
    expect(w.getBlock(3, -100, 3)).toBeNull();
    expect(w.ensureSection(0, 0, w.sectionOf(-100))).toBe(true);
    expect(w.getBlock(3, -100, 3)).not.toBeNull();
    expect(w.ensureChunk(0, 0)).toBe(c);
    expect(w.chunkCount).toBe(1);
  });

  it('negatif koordinatlar doğru chunk ve yerel indekse düşer', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(-1, -1);
    const c = w.getChunk(-1, -1);
    expect(c.cx).toBe(-1);
    w.setBlock(-1, 300, -1, B.LANTERN);
    expect(c.get(15, 300, 15)).toBe(B.LANTERN);
    expect(w.getBlock(-1, 300, -1)).toBe(B.LANTERN);
    expect(w.getBlock(-17, 300, -1)).toBeNull();
  });

  it('y aralığı: macera -400..362; taban altı ana kaya, tavan üstü hava; aralık dışı setBlock false', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    expect(w.yMin).toBe(WORLD_Y_MIN);
    expect(w.yMax).toBe(WORLD_Y_MAX);
    expect(w.yTop).toBe(WORLD_Y_MAX + 1);
    expect(w.sectionCount).toBe(48);
    expect(w.getBlock(1, WORLD_Y_MIN - 1, 1)).toBe(B.BEDROCK);
    expect(w.getBlock(1, -5000, 1)).toBe(B.BEDROCK);
    expect(w.getBlock(1, WORLD_Y_MAX + 1, 1)).toBe(B.AIR);
    expect(w.getBlock(1, 9999, 1)).toBe(B.AIR);
    expect(w.setBlock(1, WORLD_Y_MIN - 1, 1, B.STONE)).toBe(false);
    expect(w.setBlock(1, WORLD_Y_MAX + 1, 1, B.STONE)).toBe(false);
    expect(w.setBlock(1, WORLD_Y_MAX, 1, B.STONE)).toBe(true); // tavan dahil
    expect(w.setBlock(1, 60, 1, 255)).toBe(false); // 255 kayıt farkı işaretidir
    expect(w.setBlock(1, 60, 1, -1)).toBe(false);
    // üretilmemiş derin kesite yazma kesidi önce üretir
    expect(w.setBlock(1, -77, 1, B.BRICK)).toBe(true);
    expect(w.getBlock(1, -77, 1)).toBe(B.BRICK);
  });

  it('taban ana kayası silinemez / değiştirilemez; legacy modlarda aralık dışı hava', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    expect(w.ensureSection(0, 0, 0)).toBe(true);
    expect(w.getBlock(3, WORLD_Y_MIN, 3)).toBe(B.BEDROCK);
    expect(w.getBlock(3, -399, 3)).toBe(B.BEDROCK);
    expect(w.setBlock(3, WORLD_Y_MIN, 3, B.AIR)).toBe(false);
    expect(w.setBlock(3, -399, 3, B.STONE)).toBe(false);
    expect(w.getBlock(3, -399, 3)).toBe(B.BEDROCK);
    const l = new World({ seed: SEED, mode: 'insa', base: 'düz' });
    l.ensureChunk(0, 0);
    expect(l.yMin).toBe(0);
    expect(l.yMax).toBe(127);
    expect(l.getBlock(1, -5, 1)).toBe(B.AIR);
    expect(l.getBlock(1, WORLD_H, 1)).toBe(B.AIR);
  });

  it('setBlock: değer aynıysa veya chunk yoksa false', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    const cur = w.getBlock(2, 3, 2);
    expect(w.setBlock(2, 3, 2, cur)).toBe(false);
    expect(w.setBlock(999, 60, 999, B.STONE)).toBe(false);
  });

  it('setBlock edits, edited, dirty ve sürüm', () => {
    const w = new World({ seed: SEED });
    const c = w.ensureChunk(0, 0);
    c.dirty = false;
    const v = c.version;
    expect(w.setBlock(4, 300, 4, B.GLASS)).toBe(true);
    expect(w.getBlock(4, 300, 4)).toBe(B.GLASS);
    expect(w.edits.get('4,300,4')).toBe(B.GLASS);
    expect(c.edited).toBe(true);
    expect(c.dirty).toBe(true);
    expect(c.version).toBeGreaterThan(v);
    // record:false kayıt tutmaz
    w.setBlock(5, 300, 4, B.GLASS, { record: false });
    expect(w.edits.has('5,300,4')).toBe(false);
  });

  it('chunk kenarındaki değişim komşuyu kirletir', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    const n = w.ensureChunk(1, 0);
    const d = w.ensureChunk(1, 1);
    n.dirty = false;
    d.dirty = false;
    w.setBlock(15, 300, 15, B.STONE);
    expect(n.dirty).toBe(true);
    expect(d.dirty).toBe(true);
  });

  it('blockChange olayı ve abonelikten çıkma', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    const got = [];
    const off = w.onBlockChange((e) => got.push(e));
    w.setBlock(6, 300, 6, B.BRICK);
    w.setBlock(6, 301, 6, B.BRICK, { silent: true });
    expect(got.length).toBe(1);
    expect(got[0]).toMatchObject({ type: 'blockChange', x: 6, y: 300, z: 6, id: B.BRICK, oldId: 0 });
    off();
    w.setBlock(6, 302, 6, B.BRICK);
    expect(got.length).toBe(1);
  });

  it('chunkLoad / chunkUnload olayları', () => {
    const w = new World({ seed: SEED });
    const log = [];
    w.on('chunkLoad', (e) => log.push('L' + e.chunk.cx + ',' + e.chunk.cz));
    w.on('chunkUnload', (e) => log.push('U' + e.cx + ',' + e.cz));
    w.ensureChunk(2, 3);
    w.unloadChunk(2, 3);
    expect(w.unloadChunk(2, 3)).toBe(false);
    expect(log).toEqual(['L2,3', 'U2,3']);
    expect(w.getBlock(32, 5, 48)).toBeNull();
  });
});

describe('yükseklik ve yüzey', () => {
  it('heightMap/surfaceY blok koymada ve kırmada güncellenir', () => {
    const w = new World({ seed: SEED });
    const c = w.ensureChunk(0, 0);
    const y0 = w.surfaceY(7, 7);
    expect(y0).toBeGreaterThan(20);
    w.setBlock(7, 310, 7, B.STONE);
    expect(c.heightMap[(7 << 4) + 7]).toBe(310);
    expect(w.surfaceY(7, 7)).toBe(310);
    w.setBlock(7, 310, 7, B.AIR);
    expect(c.heightMap[(7 << 4) + 7]).toBeLessThan(310);
    expect(w.surfaceY(7, 7)).toBe(y0);
    expect(w.surfaceY(9999, 9999)).toBe(WORLD_Y_MIN - 1); // yüklü değil: yMin - 1
  });

  it('surfaceY ignoreFoliage yaprak ve kütüğü atlar, liquid sıvıda durur', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    const y0 = w.surfaceY(2, 2, { ignoreFoliage: true });
    w.setBlock(2, y0 + 1, 2, B.LOG_OAK);
    w.setBlock(2, y0 + 2, 2, B.LEAVES_OAK);
    expect(w.surfaceY(2, 2)).toBe(y0 + 2);
    expect(w.surfaceY(2, 2, { ignoreFoliage: true })).toBe(y0);
    w.setBlock(2, y0 + 3, 2, B.WATER);
    expect(w.surfaceY(2, 2)).toBe(y0 + 2);
    expect(w.surfaceY(2, 2, { liquid: true })).toBe(y0 + 3);
  });
});

describe('ışık', () => {
  it('getLight yüklenmemiş chunk ve tavan üstü gökyüzü sayılır', () => {
    const w = new World({ seed: SEED });
    expect(w.getLight(0, 70, 0)).toBe(0xf0);
    w.ensureChunk(0, 0);
    expect(w.getLight(0, WORLD_Y_MAX + 5, 0)).toBe(0xf0);
    expect(w.getLight(0, WORLD_Y_MIN - 3, 0)).toBe(0); // taban altı karanlık
    expect(w.getLight(0, -3, 0)).toBe(0); // üretilmemiş derin kesit karanlık
    w.ensureSection(0, 0, w.sectionOf(-3));
    expect(w.getSkyLight(0, -3, 0)).toBe(0); // yer altı: gökyüzü ışığı yok
  });

  it('meşale blok ışığı yayar, kırılınca söner; gökyüzü yüzeyde 15', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    const y = w.surfaceY(8, 8, { ignoreFoliage: true });
    expect(w.getSkyLight(8, 300, 8)).toBe(15);
    w.setBlock(8, 300, 8, B.TORCH);
    expect(w.getBlockLight(8, 300, 8)).toBe(14);
    expect(w.getBlockLight(9, 300, 8)).toBe(13);
    w.setBlock(8, 300, 8, B.AIR);
    expect(w.getBlockLight(8, 300, 8)).toBe(0);
    expect(w.getBlockLight(9, 300, 8)).toBe(0);
    expect(y).toBeGreaterThan(0);
  });

  it('chunk sınırında ışık komşu chunk\'a geçer', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    w.ensureChunk(1, 0);
    w.setBlock(15, 300, 8, B.TORCH);
    expect(w.getBlockLight(16, 300, 8)).toBe(13);
    w.setBlock(15, 300, 8, B.AIR);
    expect(w.getBlockLight(16, 300, 8)).toBe(0);
  });

  it('sonradan üretilen komşu mevcut ışıkla dikilir', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    w.setBlock(15, 300, 8, B.TORCH);
    expect(w.getBlockLight(16, 300, 8)).toBe(0); // komşu yok → okuma 0 (chunk yok: getLight gökyüzü)
    w.ensureChunk(1, 0);
    expect(w.getBlockLight(16, 300, 8)).toBe(13);

    // derin kesit sınırı: yer altındaki meşale ışığı kesit sınırından geçer
    const d = new World({ seed: SEED });
    d.ensureChunk(0, 0);
    d.ensureChunk(1, 0);
    d.ensureSection(0, 0, d.sectionOf(-17));
    d.ensureSection(0, 0, d.sectionOf(-16));
    d.setBlock(15, -17, 8, B.TORCH); // kesit sınırı (y=-17 / -16)
    expect(d.getBlockLight(15, -17, 8)).toBe(14);
  });
});

describe('düzenleme kaydı', () => {
  it('üretilmemiş chunk için applyEdits üretimde uygulanır', () => {
    const w = new World({ seed: SEED });
    expect(w.applyEdits({ '40,300,40': B.GOLD_BLOCK, '41,300,40': B.IRON_BLOCK, '42,-250,40': B.DIAMOND_BLOCK })).toBe(3);
    expect(w.getBlock(40, 300, 40)).toBeNull();
    const c = w.ensureChunk(2, 2);
    expect(c.edited).toBe(true);
    expect(w.getBlock(40, 300, 40)).toBe(B.GOLD_BLOCK);
    expect(w.getBlock(41, 300, 40)).toBe(B.IRON_BLOCK);
    // derin kesit hâlâ üretilmemiş: düzenleme bekler, kesit üretilince uygulanır
    expect(w.getBlock(42, -250, 40)).toBeNull();
    w.ensureSection(2, 2, w.sectionOf(-250));
    expect(w.getBlock(42, -250, 40)).toBe(B.DIAMOND_BLOCK);
  });

  it('applyEdits Map, dizi ve nesne biçimlerini kabul eder; geçersizleri atlar', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    expect(w.applyEdits(new Map([['1,300,1', B.BRICK]]))).toBe(1);
    expect(w.applyEdits([[2, 300, 2, B.BRICK], [3, 300, 3]])).toBe(1);
    expect(w.applyEdits({ '4,300,4': B.BRICK, 'bozuk': 3, '5,500,5': 1, '6,300,6': 999, '7,-401,7': 1 })).toBe(1);
    expect(w.getBlock(1, 300, 1)).toBe(B.BRICK);
    expect(w.getBlock(2, 300, 2)).toBe(B.BRICK);
    expect(w.getBlock(4, 300, 4)).toBe(B.BRICK);
    expect(w.edits.size).toBe(3);
  });

  it('serializeEdits → applyEdits yeni dünyada aynı chunk\'ı üretir', () => {
    const a = new World({ seed: SEED });
    a.ensureChunk(0, 0);
    a.ensureChunk(-1, 0);
    for (let i = 0; i < 40; i++) a.setBlock(-8 + i, 300 + (i % 7), 3, i % 3 === 0 ? B.STONE : B.TORCH);
    for (let i = 0; i < 10; i++) a.setBlock(-4 + i, -120 - (i % 3), 5, i % 2 === 0 ? B.BRICK : B.TORCH); // derin düzenlemeler
    const ser = a.serializeEdits();
    const b = new World({ seed: SEED });
    b.applyEdits(ser);
    b.ensureChunk(0, 0);
    b.ensureChunk(-1, 0);
    [-1, 0].forEach((cx) => {
      [-120, -121, -122].forEach((y) => b.ensureSection(cx, 0, b.sectionOf(y)));
    });
    [[0, 0], [-1, 0]].forEach(([cx, cz]) => {
      const ca = a.getChunk(cx, cz);
      const cb = b.getChunk(cx, cz);
      expect(Array.from(cb.toDense(0, 368))).toEqual(Array.from(denseOf(ca)));
      for (let si = 0; si < 48; si++) {
        if (ca.secGen[si] === 0 || cb.secGen[si] === 0) continue;
        expect(Array.from(cb.getSectionBlocks(si))).toEqual(Array.from(ca.getSectionBlocks(si)));
      }
      expect(Array.from(cb.getSectionLight(cb.sectionOfY(300)))).toEqual(Array.from(ca.getSectionLight(ca.sectionOfY(300))));
    });
  });

  it('chunk boşaltılıp yeniden üretilince düzenlemeler geri gelir', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    w.setBlock(3, 299, 3, B.DIAMOND_BLOCK);
    w.setBlock(4, -99, 3, B.GOLD_BLOCK); // derin
    w.unloadChunk(0, 0);
    expect(w.getBlock(3, 299, 3)).toBeNull();
    w.ensureChunk(0, 0);
    expect(w.getBlock(3, 299, 3)).toBe(B.DIAMOND_BLOCK);
    w.ensureSection(0, 0, w.sectionOf(-99));
    expect(w.getBlock(4, -99, 3)).toBe(B.GOLD_BLOCK);
    // kesit boşaltılıp yeniden üretilince de düzenleme geri gelir
    expect(w.unloadSection(0, 0, w.sectionOf(-99))).toBe(true);
    expect(w.getBlock(4, -99, 3)).toBeNull();
    w.ensureSection(0, 0, w.sectionOf(-99));
    expect(w.getBlock(4, -99, 3)).toBe(B.GOLD_BLOCK);
  });

  it('aynı tohum iki dünya aynı chunk (belirlenimcilik)', () => {
    const a = new World({ seed: SEED });
    const b = new World({ seed: SEED });
    b.ensureChunk(3, -2);
    a.ensureChunk(1, 1);
    a.ensureChunk(3, -2);
    expect(Array.from(denseOf(a.getChunk(3, -2)))).toEqual(Array.from(denseOf(b.getChunk(3, -2))));
  });

  it('setChunkBlocks farkları kaydeder ve ışığı düzeltir', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    const c = w.getChunk(0, 0);
    const copy = c.toDense(0, 128);
    const t = w.surfaceY(5, 5) + 3;
    copy[(t << 8) + (5 << 4) + 5] = B.TORCH;
    copy[((t + 1) << 8) + (5 << 4) + 5] = B.STONE;
    expect(w.setChunkBlocks(0, 0, copy)).toBe(2);
    expect(w.getBlock(5, t, 5)).toBe(B.TORCH);
    expect(w.edits.get('5,' + (t + 1) + ',5')).toBe(B.STONE);
    expect(w.getBlockLight(5, t, 5)).toBe(14);
    expect(w.setChunkBlocks(0, 0, new Uint8Array(5))).toBe(-1);
    expect(CHUNK_VOLUME).toBe(copy.length);
  });
});

function referenceLight(world, coords) {
  const ref = new Map();
  coords.forEach(([cx, cz]) => {
    const n = world.getChunk(cx, cz).clone();
    n.recomputeHeightMap();
    n.generated = true;
    ref.set(cx + ',' + cz, n);
  });
  const get = (cx, cz) => ref.get(cx + ',' + cz) || null;
  ref.forEach((n) => computeChunkLight(n));
  for (let pass = 0; pass < 2; pass++) ref.forEach((n) => stitchChunk(get, n));
  return ref;
}

function expectWorldLightMatchesReference(world, coords) {
  const ref = referenceLight(world, coords);
  coords.forEach(([cx, cz]) => {
    const ca = world.getChunk(cx, cz);
    const cb = ref.get(cx + ',' + cz);
    for (let si = 0; si < ca.sectionCount; si++) {
      const a = ca.getSectionLight(si);
      const b = cb.getSectionLight(si);
      if (a === null || b === null) {
        if (a !== b) throw new Error('kesit üretim durumu farklı chunk ' + cx + ',' + cz + ' si=' + si);
        continue;
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          throw new Error('ışık uyuşmazlığı chunk ' + cx + ',' + cz + ' si=' + si + ' i=' + i + ' y=' + (ca.sectionBase(si) + (i >> 8))
            + ' dünya=' + a[i].toString(16) + ' ref=' + b[i].toString(16));
        }
      }
    }
  });
}

describe('gerçek arazide ışık tutarlılığı', () => {
  const coords = [];
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) coords.push([cx, cz]);

  it('chunk üretim sırası sonucu değiştirmez ve tam hesapla aynıdır', () => {
    const a = new World({ seed: SEED });
    coords.forEach(([cx, cz]) => a.ensureChunk(cx, cz));
    const b = new World({ seed: SEED });
    coords.slice().reverse().forEach(([cx, cz]) => b.ensureChunk(cx, cz));
    coords.forEach(([cx, cz]) => {
      const ca = a.getChunk(cx, cz);
      const cb = b.getChunk(cx, cz);
      for (let si = 25; si < 48; si++) expect(Array.from(ca.getSectionLight(si))).toEqual(Array.from(cb.getSectionLight(si)));
    });
    expectWorldLightMatchesReference(a, coords);
  });

  it('rastgele kırma/koyma sonrası ışık tam hesapla birebir aynıdır (mağaralar dahil)', () => {
    const w = new World({ seed: SEED });
    coords.forEach(([cx, cz]) => w.ensureChunk(cx, cz));
    const rnd = mulberry32(99);
    const palette = [0, 0, B.STONE, B.TORCH, B.GLASS, B.LANTERN, B.WATER, B.LEAVES_OAK, B.DIRT];
    for (let i = 0; i < 90; i++) {
      const x = -16 + Math.floor(rnd() * 48);
      const z = -16 + Math.floor(rnd() * 48);
      const y = 10 + Math.floor(rnd() * 80);
      w.setBlock(x, y, z, palette[Math.floor(rnd() * palette.length)]);
    }
    // derin kesitlerde de (kesit sınırları dahil): üret + düzenle
    for (let i = 0; i < 70; i++) {
      const x = -16 + Math.floor(rnd() * 48);
      const z = -16 + Math.floor(rnd() * 48);
      const y = -80 + Math.floor(rnd() * 100);
      w.setBlock(x, y, z, palette[Math.floor(rnd() * palette.length)]);
    }
    expectWorldLightMatchesReference(w, coords);
  });
});

// Halka chunk'ı: bölge 0 dış halkasını (r = ZONES[0].rOut) içeren, merkezi bölge 0'da kalan chunk; RC+1 bölge 1'de.
const R0 = ZONES[0].rOut;
const RC = Math.floor((R0 - 1) / 16);
const RX = RC * 16; // halka chunk'ının x tabanı
const RC2 = Math.floor(ZONES[1].rOut / 16); // merkezi bölge 2'de olan ilk chunk

describe('bölge mührü', () => {
  it('bölge 1 kilitliyken merkezi bölge 1\'de kalan chunk üretilmez', () => {
    const w = new World({ seed: SEED, zoneUnlocked: () => false });
    // merkez ((RC+1)*16+8) > ZONES[0].rOut → bölge 1
    expect(w.canGenerate(RC + 1, 0)).toBe(false);
    expect(w.ensureChunk(RC + 1, 0)).toBeNull();
    expect(w.getChunk(RC + 1, 0)).toBeNull();
    expect(w.ensureChunk(RC2, 0)).toBeNull();
    expect(w.ensureChunk(-(RC + 4), 3)).toBeNull();
    // bölge 0'daki chunk'lar sorunsuz
    expect(w.ensureChunk(RC, 0)).not.toBeNull();
    expect(w.ensureChunk(0, -(RC - 1))).not.toBeNull();
  });

  it('halka chunk\'ları bariyer içerir; tam yükseklik, kalınlık 2', () => {
    const w = new World({ seed: SEED, zoneUnlocked: () => false });
    const c = w.ensureChunk(RC, 0);
    let cols = 0;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const ring = ringIndexAt(RX + lx, lz);
        const top = c.get(lx, 127, lz);
        if (ring === 0) {
          cols++;
          expect(top).toBe(B.SEAL_BARRIER);
          expect(c.get(lx, 1, lz)).toBe(B.SEAL_BARRIER);
          expect(c.get(lx, 0, lz)).toBe(B.SEAL_BARRIER); // derin dünya: halka tüm aralığı kapsar
          expect(c.get(lx, WORLD_Y_MAX, lz)).toBe(B.SEAL_BARRIER);
          expect(c.get(lx, WORLD_Y_MAX + 1, lz)).not.toBe(B.SEAL_BARRIER);
        } else {
          expect(top).not.toBe(B.SEAL_BARRIER);
        }
      }
    }
    expect(cols).toBeGreaterThan(8);
    // derin kesitler: halka sütununda bariyer (taban ana kayası hariç), taban ana kaya yerinde
    w.ensureSection(RC, 0, 0);
    w.ensureSection(RC, 0, w.sectionOf(-100));
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        if (ringIndexAt(RX + lx, lz) !== 0) continue;
        expect(c.get(lx, -100, lz)).toBe(B.SEAL_BARRIER);
        expect(c.get(lx, WORLD_Y_MIN, lz)).toBe(B.BEDROCK);
        expect(c.get(lx, -399, lz)).toBe(B.BEDROCK);
      }
    }
  });

  it('unlockZone halkayı açar: bariyer kalmaz, doğal arazi döner, dış chunk\'lar üretilebilir', () => {
    const w = new World({ seed: SEED, zoneUnlocked: () => false });
    const loaded = [];
    for (let cz = -3; cz <= 3; cz++) {
      for (let cx = RC - 1; cx <= RC; cx++) {
        const c = w.ensureChunk(cx, cz);
        if (c) loaded.push(c);
      }
    }
    const barrierCells = [];
    loaded.forEach((c) => {
      const d = denseOf(c);
      for (let i = 0; i < d.length; i++) {
        if (d[i] === B.SEAL_BARRIER) {
          barrierCells.push([c.cx * 16 + (i & 15), i >> 8, c.cz * 16 + ((i >> 4) & 15)]);
        }
      }
    });
    expect(barrierCells.length).toBeGreaterThan(500);
    const events = [];
    w.on('sealOpen', (e) => events.push(e));
    loaded.forEach((c) => {
      c.dirty = false;
    });
    expect(w.isZoneUnlocked(1)).toBe(false);
    const n = w.unlockZone(1);
    expect(n).toBeGreaterThan(5);
    expect(w.unlockZone(1)).toBe(0);
    expect(w.isZoneUnlocked(1)).toBe(true);
    expect(events.length).toBe(1);
    expect(events[0].ring).toBe(0);
    // bariyer kalmadı ve etkilenen chunk'lar kirli
    let still = 0;
    barrierCells.forEach(([x, y, z]) => {
      if (w.getBlock(x, y, z) === B.SEAL_BARRIER) still++;
    });
    expect(still).toBe(0);
    expect(events[0].chunks.every((c) => c.dirty)).toBe(true);
    // doğal arazi: mührün açtığı hücreler saf üretimle aynı
    const pure = generateChunk(SEED, RC, 0, { seal: false, light: false });
    const live = w.getChunk(RC, 0);
    expect(Array.from(denseOf(live))).toEqual(Array.from(denseOf(pure)));
    // dış bölge artık üretilebilir ve halkasızdır
    const out = w.ensureChunk(RC + 1, 0);
    expect(out).not.toBeNull();
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        expect(out.get(lx, 127, lz)).not.toBe(B.SEAL_BARRIER);
      }
    }
    expect(w.ensureChunk(RC2, 0)).toBeNull(); // bölge 2 hâlâ kilitli
    // ışık tutarlı: açılan hücre üstünde gökyüzü ışığı var
    const x = R0;
    const sy = w.surfaceY(x, 0) + 2;
    expect(w.getSkyLight(x, sy, 0)).toBeGreaterThanOrEqual(14);
  });

  it('dış durumdan (zoneUnlocked) açılan bölge sonraki ensure\'da senkronlanır', () => {
    let open = false;
    const w = new World({ seed: SEED, zoneUnlocked: (i) => open && i === 1 });
    const c = w.ensureChunk(RC, 0);
    expect(denseOf(c).includes(B.SEAL_BARRIER)).toBe(true);
    expect(w.ensureChunk(RC + 1, 0)).toBeNull();
    open = true;
    expect(w.ensureChunk(RC + 1, 0)).not.toBeNull();
    expect(denseOf(w.getChunk(RC, 0)).includes(B.SEAL_BARRIER)).toBe(false);
  });

  it('başlangıçtan açık bölge ile üretilen chunk halkasızdır', () => {
    const w = new World({ seed: SEED, zoneUnlocked: (i) => i <= 1 });
    const c = w.ensureChunk(RC, 0);
    expect(denseOf(c).includes(B.SEAL_BARRIER)).toBe(false);
    expect(w.ensureChunk(RC + 1, 0)).not.toBeNull();
  });

  it('dünya kenarı kalıcıdır ve dışarısı üretilmez', () => {
    const w = new World({ seed: SEED, zoneUnlocked: () => true });
    const R = SEAL_RING_RADII[4];
    expect(R).toBe(ZONES[4].rOut);
    expect(w.canGenerate(Math.floor(R / 16) + 3, 0)).toBe(false);
    expect(w.canGenerate(Math.floor(R / 16) - 2, 0)).toBe(true);
    const c = w.ensureChunk(Math.floor((R - 2) / 16), 0);
    expect(denseOf(c).includes(B.SEAL_BARRIER)).toBe(true);
    expect(w.unlockZone(5)).toBe(0);
    expect(w.unlockZone(0)).toBe(0);
  });

  it('openSeal(i) = unlockZone(i+1)', () => {
    const w = new World({ seed: SEED, zoneUnlocked: () => false });
    w.ensureChunk(RC, 0);
    expect(w.openSeal(0)).toBeGreaterThan(0);
    expect(w.isZoneUnlocked(1)).toBe(true);
  });
});

describe('sınırlı modlar (insa / harita)', () => {
  it('insa: 8×8 chunk sınır, çerçeve duvar ve kaçış yok', () => {
    const w = new World({ seed: SEED, mode: 'insa', base: 'düz' });
    expect(w.bounds).toEqual({ minCx: 0, maxCx: 7, minCz: 0, maxCz: 7 });
    expect(w.ensureChunk(0, 0)).not.toBeNull();
    expect(w.ensureChunk(7, 7)).not.toBeNull();
    const f = w.ensureChunk(-1, 3);
    expect(f).not.toBeNull(); // çerçeve
    expect(w.ensureChunk(-2, 3)).toBeNull();
    expect(w.ensureChunk(8, 8)).not.toBeNull();
    expect(w.ensureChunk(9, 8)).toBeNull();
    // çerçeve: x=-1,-2 duvar (ana kaya + üstte bariyer), x=-3.. hava
    expect(w.getBlock(-1, 10, 50)).toBe(B.BEDROCK);
    expect(w.getBlock(-2, 76, 50)).toBe(B.BEDROCK);
    expect(w.getBlock(-1, 77, 50)).toBe(B.SEAL_BARRIER);
    expect(w.getBlock(-1, 127, 50)).toBe(B.SEAL_BARRIER);
    expect(w.getBlock(-5, 70, 50)).toBe(B.AIR);
    // çerçevenin ötesi ana kaya sayılır
    expect(w.getBlock(-100, 70, 40)).toBe(B.BEDROCK);
    expect(w.getBlock(500, 70, 40)).toBe(B.BEDROCK);
    // çerçeve değiştirilemez
    expect(w.setBlock(-1, 70, 50, B.AIR)).toBe(false);
    expect(w.setBlock(-1, 70, 50, B.STONE)).toBe(false);
    expect(w.isBlockInBounds(-1, 40)).toBe(false);
    expect(w.isBlockInBounds(0, 0)).toBe(true);
    expect(w.isBlockInBounds(127, 127)).toBe(true);
    expect(w.isBlockInBounds(128, 127)).toBe(false);
    expect(w.killPlaneY).toBeLessThan(0);
  });

  it('insa: doğuş noktasının altı katı, üstü açık; sınır içi düzenleme kaydedilir', () => {
    const w = new World({ seed: SEED, mode: 'insa', base: 'düz' });
    w.ensureChunk(4, 4);
    expect(w.getBlock(64, 63, 64)).toBe(B.GRASS);
    expect(w.getBlock(64, 64, 64)).toBe(B.AIR);
    expect(w.setBlock(64, 64, 64, B.BRICK)).toBe(true);
    expect(w.edits.get('64,64,64')).toBe(B.BRICK);
    expect(w.zoneForChunk(0, 0)).toBe(0);
  });

  it('insa: mühür mantığı devre dışıdır', () => {
    const w = new World({ seed: SEED, mode: 'insa', base: 'ada' });
    expect(w.unlockZone(1)).toBe(0);
    expect(w.canGenerate(3, 3)).toBe(true);
  });

  it('harita: mapChunks bir chunk\'ın tamamını değiştirir', () => {
    const blocks = new Uint8Array(CHUNK_VOLUME);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) blocks[(40 << 8) + (z << 4) + x] = B.CLOTH_RED;
    const w = new World({
      seed: SEED, mode: 'harita', base: 'boş', mapChunks: new Map([['2,3', blocks]]),
    });
    w.ensureChunk(2, 3);
    expect(w.getBlock(40, 40, 56)).toBe(B.CLOTH_RED);
    expect(w.getBlock(40, 63, 56)).toBe(B.AIR);
    w.ensureChunk(4, 4);
    expect(w.getBlock(64, 63, 64)).toBe(B.COBBLE);
    expect(w.getBlock(40, 40, 0)).toBeNull();
  });

  it('dispose belleği boşaltır', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    w.setBlock(1, 100, 1, B.STONE);
    w.dispose();
    expect(w.chunkCount).toBe(0);
    expect(w.edits.size).toBe(0);
  });
});

describe('özel üretici', () => {
  it('worldgen seçeneği kullanılır', () => {
    let calls = 0;
    const w = stoneWorld({
      worldgen: (seed, cx, cz, opts) => {
        calls++;
        return generateChunk(seed, cx, cz, opts);
      },
    });
    expect(w.ensureChunk(2, 2)).not.toBeNull();
    expect(calls).toBe(1);
    expect(w.getBlock(40, 20, 40)).not.toBeNull();
  });
});
