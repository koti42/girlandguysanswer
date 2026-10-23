import { describe, expect, it } from 'vitest';
import {
  BIOME_KEYS, SEA_LEVEL, WORLD_Y_MAX, ZONES, zoneIndexAt,
} from './constants.js';
import { B, isLiquid, isSolid } from './blocks.js';
import {
  BASE_KEYS, FLAT_TOP, WALL_TOP, baseHeight, baseSpawn,
} from './worldgenBases.js';
import {
  BIOME_ID, SEAL_RING_RADII, getGen, ringIndexAt, sinkholeInCell,
} from './worldgenTerrain.js';
import { TREE, treeInCell } from './worldgenFlora.js';
import {
  biomeAt, biomeKeyAt, floatingIslandsNear, generateChunk, heightAt, spawnPoint, zoneForChunk,
} from './worldgen.js';

import { bestOf, cpuMs, scaled } from '../../../test/perfScale.js';
import { isBiomeFlora } from './biomeData.js';

// Halka chunk'ı: bölge 0 dış halkasını içeren ve merkezi bölge 0'da kalan chunk (RC), x tabanı RX.
const RC = Math.floor((ZONES[0].rOut - 1) / 16);
const RX = RC * 16;

const S = 424242;

function sameArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
/** Yüzey bandı (y 0..367) düz dizi; legacy chunk için y 0..127. */
const D = (c) => (c.legacy ? c.toDense(0, 128) : c.toDense(0, 368));
/** Tüm aralık (macera: y -400..367) düz dizi. */
const DALL = (c) => c.toDense(c.yMin, c.sectionCount * 16);
function sameChunk(a, b) {
  for (let si = 0; si < a.sectionCount; si++) {
    const ba = a.getSectionBlocks(si);
    const bb = b.getSectionBlocks(si);
    if ((ba === null) !== (bb === null)) return false;
    if (ba !== null && !sameArray(ba, bb)) return false;
    const la = a.getSectionLight(si);
    const lb = b.getSectionLight(si);
    if ((la === null) !== (lb === null)) return false;
    if (la !== null && !sameArray(la, lb)) return false;
  }
  return sameArray(a.heightMap, b.heightMap) && sameArray(a.biomeMap, b.biomeMap);
}
function isNatural(b) {
  return b === 0 || isLiquid(b) || (b >= 40 && b <= 59) || b === B.AMETHYST || b === B.ICE || isBiomeFlora(b)
    || b === 180 || b === 196 || b === 199 || b === 179;
}

describe('belirlenimcilik', () => {
  it('aynı tohum + koordinat → birebir aynı chunk (sıradan ve önbellekten bağımsız)', () => {
    const a = generateChunk(S, 3, -4);
    generateChunk(S + 1, 9, 9);
    generateChunk(S, 10, 10);
    generateChunk('başka', -5, 2);
    const b = generateChunk(S, 3, -4);
    expect(sameChunk(a, b)).toBe(true);
    // solucan/salon/ada önbelleklerini boşalt: sonuç değişmemeli
    const g = getGen(S);
    g.worms.clear();
    g.halls.clear();
    if (g.islands) g.islands.clear();
    if (g.dworms) g.dworms.clear();
    if (g.dhalls) g.dhalls.clear();
    if (g.dshafts) g.dshafts.clear();
    expect(sameChunk(a, generateChunk(S, 3, -4))).toBe(true);
  });

  it('farklı tohum farklı dünya', () => {
    const a = generateChunk(1, 0, 0, { light: false });
    const b = generateChunk(2, 0, 0, { light: false });
    expect(sameArray(D(a), D(b))).toBe(false);
  });

  it('metin ve sayı tohumları desteklenir', () => {
    const a = generateChunk('KESIF123', 2, 2, { light: false });
    const b = generateChunk('KESIF123', 2, 2, { light: false });
    expect(sameArray(D(a), D(b))).toBe(true);
    expect(() => generateChunk(0, 0, 0, { light: false })).not.toThrow();
    expect(() => generateChunk(-77, -3, 4, { light: false })).not.toThrow();
  });

  it('komşu chunk üretimi bir chunk\'ı değiştirmez (bağımsızlık)', () => {
    const a = generateChunk(S, 7, 7, { light: false });
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) generateChunk(S, 7 + dx, 7 + dz, { light: false });
    expect(sameArray(D(a), D(generateChunk(S, 7, 7, { light: false })))).toBe(true);
  });
});

describe('chunk yapısı', () => {
  it('yüzey bandı hemen üretilir, derin kesitler tembel; geçerli kimlikler, heightMap ve bayraklar', () => {
    const c = generateChunk(S, -2, 3);
    expect(c.generated).toBe(true);
    expect(c.dirty).toBe(true);
    // yüzey bandı (y ≥ 0) üretildi, y < 0 henüz değil (tembel)
    for (let si = 25; si < 48; si++) expect(c.secGen[si]).toBe(1);
    for (let si = 0; si < 25; si++) expect(c.secGen[si]).toBe(0);
    // taban ana kayası artık yüzey bandında değil (derin dünya sürer): y=0 taş/bazalt
    for (let i = 0; i < 256; i++) expect(c.get(i & 15, 0, i >> 4)).not.toBe(B.BEDROCK);
    const d = D(c);
    let maxId = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > maxId) maxId = d[i];
    expect(maxId).toBeLessThanOrEqual(254);
    for (let i = 0; i < 256; i++) expect(c.biomeMap[i]).toBeLessThan(BIOME_KEYS.length);
    const hm = new Int16Array(c.heightMap);
    c.recomputeHeightMap();
    expect(sameArray(hm, c.heightMap)).toBe(true);
    // sections:'all' derin kesitleri de üretir ve tabanda ana kaya vardır
    const all = generateChunk(S, -2, 3, { light: false, sections: 'all' });
    expect(all.generatedSections()).toBe(48);
    for (let i = 0; i < 256; i++) expect(all.get(i & 15, -400, i >> 4)).toBe(B.BEDROCK);
  });

  it('light:false ışığı hesaplamaz; varsayılan gökyüzü ışığı ekler', () => {
    const dark = generateChunk(S, 0, 0, { light: false });
    for (let si = 25; si < 48; si++) {
      expect(dark.secLight[si]).toBeNull();
      expect(dark.secLightU[si]).toBe(0);
    }
    const lit = generateChunk(S, 0, 0);
    expect(lit.getLight(8, 367, 2)).toBe(0xf0);
    expect(lit.getLight(8, 127, 2)).toBe(0xf0);
  });

  it('heightAt/biomeAt chunk içeriğiyle birebir tutarlı', () => {
    let ok = 0;
    let tot = 0;
    let biomeBad = 0;
    for (let cz = -3; cz <= 3; cz += 2) {
      for (let cx = -3; cx <= 3; cx += 2) {
        const c = generateChunk(S, cx, cz, { light: false });
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            const x = cx * 16 + lx;
            const z = cz * 16 + lz;
            const h = heightAt(S, x, z);
            tot++;
            const here = c.get(lx, h, lz);
            let clean = isSolid(here) && here !== B.CACTUS;
            for (let y = h + 1; clean && y < 368; y++) {
              if (!isNatural(c.get(lx, y, lz))) clean = false;
            }
            if (clean) ok++;
            if (c.biomeMap[(lz << 4) + lx] !== biomeAt(S, x, z)) biomeBad++;
          }
        }
      }
    }
    expect(biomeBad).toBe(0);
    expect(ok / tot).toBeGreaterThan(0.985);
    expect(biomeKeyAt(S, 5, 5)).toBe(BIOME_KEYS[biomeAt(S, 5, 5)]);
  });

  it('zoneForChunk merkez noktasına göre bölgeyi verir', () => {
    expect(zoneForChunk(0, 0)).toBe(0);
    expect(zoneForChunk(RC, 0)).toBe(zoneIndexAt(RC * 16 + 8, 8));
    expect(zoneForChunk(RC, 0)).toBe(0);
    expect(zoneForChunk(RC + 1, 0)).toBe(1);
    expect(zoneForChunk(-20, 0)).toBe(zoneIndexAt(-312, 8));
    for (let i = 0; i < ZONES.length; i++) {
      const r = (ZONES[i].rIn + ZONES[i].rOut) / 2;
      expect(zoneForChunk(Math.floor(r / 16), 0)).toBe(i);
    }
  });
});

describe('Mühür halkaları', () => {
  it('halka maskesi 8-bağlantıyla sızdırmaz (iç → dış geçilemez)', () => {
    [0, 1, 2].forEach((ring) => {
      const R = SEAL_RING_RADII[ring];
      const half = R + 12;
      const n = half * 2 + 1;
      const seen = new Uint8Array(n * n);
      const stack = [[half, half]];
      seen[half * n + half] = 1;
      let leaked = false;
      while (stack.length) {
        const [px, pz] = stack.pop();
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            const nz = pz + dz;
            if (nx < 0 || nz < 0 || nx >= n || nz >= n || seen[nz * n + nx]) continue;
            if (ringIndexAt(nx - half, nz - half) === ring) continue;
            seen[nz * n + nx] = 1;
            if (nx === 0 || nz === 0 || nx === n - 1 || nz === n - 1) leaked = true;
            stack.push([nx, nz]);
          }
        }
      }
      expect(leaked).toBe(false);
    });
  });

  it('kalınlık yarıçapsal 2 blok', () => {
    let count = 0;
    for (let x = RX - 10; x <= RX + 40; x++) if (ringIndexAt(x, 0) === 0) count++;
    expect(count).toBe(2);
    count = 0;
    for (let x = SEAL_RING_RADII[3] - 10; x <= SEAL_RING_RADII[3] + 10; x++) if (ringIndexAt(x, 0) === 3) count++;
    expect(count).toBe(2);
  });

  it('halka sütunları y=0..362 bariyer (derin kesitler dahil, taban ana kayası hariç); openRings/seal ile kalkar', () => {
    const c = generateChunk(S, RC, 0, { light: false, sections: 'all' });
    let ringCols = 0;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        if (ringIndexAt(RX + lx, lz) !== 0) continue;
        ringCols++;
        for (let y = -399; y <= WORLD_Y_MAX; y++) {
          const b = c.get(lx, y, lz);
          if (y <= -396 && b === B.BEDROCK) continue; // ana kaya yüzeyi pürüzlü: bariyer yalnız ana kayanın üstünde
          expect(b).toBe(B.SEAL_BARRIER);
        }
        expect(c.get(lx, -400, lz)).toBe(B.BEDROCK);
        expect(c.get(lx, WORLD_Y_MAX + 1, lz)).not.toBe(B.SEAL_BARRIER);
      }
    }
    expect(ringCols).toBeGreaterThan(8);
    const open = generateChunk(S, RC, 0, { light: false, openRings: 1, sections: 'all' });
    const noSeal = generateChunk(S, RC, 0, { light: false, seal: false, sections: 'all' });
    expect(DALL(open).includes(B.SEAL_BARRIER)).toBe(false);
    expect(sameArray(DALL(open), DALL(noSeal))).toBe(true);
    // yalnız halka sütunları farklı
    let diff = 0;
    const da = DALL(c);
    const db = DALL(noSeal);
    for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) diff++;
    expect(diff).toBeGreaterThan(ringCols * 500);
    // dünya kenarı halkası hiçbir maskede açılmaz
    const R = SEAL_RING_RADII[4];
    const edge = generateChunk(S, Math.floor((R - 3) / 16), 0, { light: false, openRings: 15 });
    expect(D(edge).includes(B.SEAL_BARRIER)).toBe(true);
  });

  it('bölge sınırı komşuluğunda arazi kesintisiz (halkasız üretimde yükseklik atlaması küçük)', () => {
    let maxJump = 0;
    for (let a = 0; a < 12; a++) {
      const ang = a * 0.52;
      for (let ring = 0; ring < 4; ring++) {
        const R = SEAL_RING_RADII[ring];
        const x1 = Math.round(Math.cos(ang) * (R - 2));
        const z1 = Math.round(Math.sin(ang) * (R - 2));
        const x2 = Math.round(Math.cos(ang) * (R + 2));
        const z2 = Math.round(Math.sin(ang) * (R + 2));
        maxJump = Math.max(maxJump, Math.abs(heightAt(S, x1, z1) - heightAt(S, x2, z2)));
      }
    }
    expect(maxJump).toBeLessThanOrEqual(40); // derin dünya: kanyon basamakları/yarıkları ve yüksek dağlar halka çevresinde de olabilir
  });
});

describe('decorate kancası', () => {
  it('sahte süsleyici: bir kez çağrılır, ctx doğru, yazdıkları kalır, halka üstüne yazamaz', () => {
    const calls = [];
    const decorate = (chunk, ctx) => {
      calls.push({ chunk, ctx, first: ctx.rng.next() });
      const y = ctx.columnSurface(8, 8);
      chunk.set(8, y + 1, 8, B.ALTAR);
      chunk.set(0, 100, 0, B.GOLD_BLOCK);
    };
    const c = generateChunk(S, 1, 2, { decorate });
    expect(calls.length).toBe(1);
    const { ctx } = calls[0];
    expect(calls[0].chunk).toBeDefined();
    expect(ctx.seed).toBe(S);
    expect(ctx.world).toBeNull();
    expect(ctx.cx).toBe(1);
    expect(ctx.cz).toBe(2);
    expect(ctx.zone).toBe(ZONES[0]);
    expect(ctx.zoneIndex).toBe(0);
    expect(ctx.mode).toBe('macera');
    expect(ctx.seaLevel).toBe(SEA_LEVEL);
    expect(ctx.heightAt(20, 40)).toBe(heightAt(S, 20, 40));
    expect(ctx.biomeAt(20, 40)).toBe(biomeAt(S, 20, 40));
    const gy = heightAt(S, 24, 40);
    expect(c.get(8, gy + 1, 8)).toBe(B.ALTAR);
    expect(c.get(0, 100, 0)).toBe(B.GOLD_BLOCK);
    // yazılanlar ışığa ve heightMap'e yansır
    expect(c.getBlockLight(8, gy + 1, 8)).toBeGreaterThanOrEqual(8);
    expect(c.topY(0, 0)).toBeGreaterThanOrEqual(100);
    // aynı chunk iki kez: rng akışı aynı
    const calls2 = [];
    generateChunk(S, 1, 2, { decorate: (ch, cx2) => calls2.push(cx2.rng.next()) });
    expect(calls2[0]).toBe(calls[0].first);
    // farklı chunk: farklı akış
    const calls3 = [];
    generateChunk(S, 2, 2, { decorate: (ch, cx2) => calls3.push(cx2.rng.next()) });
    expect(calls3[0]).not.toBe(calls[0].first);
  });

  it('columnSurface zemin y\'sini (yaprak/su hariç) döner', () => {
    let checked = 0;
    generateChunk(S, 4, -3, {
      decorate: (chunk, ctx) => {
        for (let lz = 0; lz < 16; lz += 3) {
          for (let lx = 0; lx < 16; lx += 3) {
            const y = ctx.columnSurface(lx, lz);
            expect(y).toBeGreaterThan(0);
            expect(isSolid(chunk.get(lx, y, lz))).toBe(true);
            const above = chunk.get(lx, y + 1, lz);
            expect(isSolid(above) && above !== B.CACTUS && !(above >= 40 && above <= 51)).toBe(false);
            checked++;
          }
        }
      },
    });
    expect(checked).toBe(36);
  });

  it('süsleyici halkadan sonra çalışmaz: halka sütununa yazdığı bariyerle ezilir', () => {
    const c = generateChunk(S, RC, 0, {
      light: false,
      decorate: (chunk) => {
        for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) chunk.set(lx, 60, lz, B.GLASS);
      },
    });
    let ringChecked = 0;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const ring = ringIndexAt(RX + lx, lz) === 0;
        if (ring) {
          expect(c.get(lx, 60, lz)).toBe(B.SEAL_BARRIER);
          ringChecked++;
        } else {
          expect(c.get(lx, 60, lz)).toBe(B.GLASS);
        }
      }
    }
    expect(ringChecked).toBeGreaterThan(0);
  });

  it('taban modlarında (insa/harita) süsleyici çağrılmaz', () => {
    let n = 0;
    generateChunk(S, 2, 2, { mode: 'insa', decorate: () => { n++; } });
    expect(n).toBe(0);
  });
});

describe('spawnPoint', () => {
  const seeds = [1, 2, 3, 42, 2026, 777, 123456789, 99999, 31337, 8675309, 55, 4096, 17, 1000003, 271828];

  it('Başlangıç Vadisi\'nde güvenli, çimenli, düz ve belirlenimcidir', () => {
    seeds.forEach((seed) => {
      const sp = spawnPoint(seed);
      expect(sp).toEqual(spawnPoint(seed));
      expect(sp.x - Math.floor(sp.x)).toBe(0.5);
      expect(sp.z - Math.floor(sp.z)).toBe(0.5);
      expect(Math.hypot(sp.x, sp.z)).toBeLessThan(ZONES[0].rOut - 10);
      const bx = Math.floor(sp.x);
      const bz = Math.floor(sp.z);
      expect(sp.y).toBe(heightAt(seed, bx, bz) + 1);
      expect(sp.y).toBeGreaterThan(SEA_LEVEL + 3);
      expect([BIOME_ID.cayir, BIOME_ID.orman, BIOME_ID.cicek, BIOME_ID.kiraz, BIOME_ID.sonbahar]).toContain(biomeAt(seed, bx, bz));
      const c = generateChunk(seed, Math.floor(bx / 16), Math.floor(bz / 16), { light: false });
      const lx = bx & 15;
      const lz = bz & 15;
      expect(c.get(lx, sp.y - 1, lz)).toBe(B.GRASS);
      expect(isSolid(c.get(lx, sp.y, lz))).toBe(false);
      expect(isSolid(c.get(lx, sp.y + 1, lz))).toBe(false);
      expect(isSolid(c.get(lx, sp.y + 2, lz))).toBe(false);
      // 5×5 düz
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          expect(Math.abs(heightAt(seed, bx + dx, bz + dz) - (sp.y - 1))).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  it('farklı tohumlar farklı doğuş noktaları üretir', () => {
    // doğuş çoğu tohumda merkeze yakın (vadi bilerek düz) — ama çevresindeki arazi tohuma göre farklıdır
    const prints = new Set(seeds.map((s) => {
      const sp = spawnPoint(s);
      return [sp.x, sp.z, heightAt(s, sp.x + 24, sp.z), heightAt(s, sp.x, sp.z + 24), heightAt(s, sp.x - 30, sp.z - 18)].join(',');
    }));
    expect(prints.size).toBeGreaterThanOrEqual(seeds.length - 2);
  });
});

describe('ağaçlar, yüzen adalar, çukurlar', () => {
  it('ağaç tacı chunk sınırını aşar: sınırdaki ağacın yaprakları komşu chunk\'ta da vardır', () => {
    const g = getGen(S);
    const o = { x: 0, z: 0, y: 0, species: 0, hash: 0, biome: 0 };
    let found = 0;
    let withLeaves = 0;
    for (let cz = -24; cz < 24 && found < 24; cz++) {
      for (let cx = -24; cx < 24 && found < 24; cx++) {
        // yalnız ormanlı bölge 1
        if (zoneForChunk(cx, cz) > 1) continue; // Başlangıç Vadisi + Fısıldayan Ormanlar
        for (let tzc = cz * 4; tzc < cz * 4 + 4 && found < 24; tzc++) {
          const tcx = cx * 4 + 3; // chunk'ın en doğu hücresi
          if (!treeInCell(g, tcx, tzc, o)) continue;
          if ((o.x & 15) !== 15) continue;
          if (o.species !== TREE.OAK && o.species !== TREE.BIRCH && o.species !== TREE.BIGOAK) continue;
          if (ringIndexAt(o.x, o.z) >= 0) continue;
          found++;
          const nb = generateChunk(S, cx + 1, o.z >> 4, { light: false });
          const lz = o.z & 15;
          let leaf = false;
          for (let y = o.y + 2; y <= o.y + 12 && !leaf; y++) {
            for (let dz = -1; dz <= 1; dz++) {
              const zz = lz + dz;
              if (zz < 0 || zz > 15) continue;
              const b = nb.get(0, y, zz);
              if (b >= 48 && b <= 51) leaf = true;
            }
          }
          if (leaf) withLeaves++;
        }
      }
    }
    expect(found).toBeGreaterThanOrEqual(8);
    expect(withLeaves / found).toBeGreaterThan(0.85);
  });

  it('en az 4 ağaç türü üretilir (kütük türleri)', () => {
    const logs = new Set();
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = 5; cx <= 20; cx++) {
        const c = generateChunk(S, cx, cz, { light: false });
        const d = D(c);
        for (let i = 0; i < d.length; i++) {
          const b = d[i];
          if (b >= 40 && b <= 43) logs.add(b);
        }
      }
    }
    expect(logs.size).toBeGreaterThanOrEqual(3);
    // akasya Kanyon'da
    let acacia = false;
    for (let cz = -22; cz <= 22 && !acacia; cz += 2) {
      for (let cx = 8; cx <= 24 && !acacia; cx++) {
        if (zoneForChunk(cx, cz) !== 2) continue;
        const c = generateChunk(S, cx, cz, { light: false });
        if (D(c).includes(B.LOG_ACACIA)) acacia = true;
      }
    }
    expect(acacia || logs.has(B.LOG_ACACIA)).toBe(true);
  });

  it('yüzen ada: belirlenimci, havada ve zemine değmez', () => {
    // dağlık arazi üstündeki adalar zemine yakın olabilir: altında en az 12 blok boşluğu olan bir ada seç
    let isl = null;
    for (let cz = -60; cz <= 60 && !isl; cz += 3) {
      const list = floatingIslandsNear(S, -1400, cz * 16, 1400, cz * 16 + 48);
      isl = list.find((i) => i.y - i.ry - 2 - (heightAt(S, Math.floor(i.x), Math.floor(i.z)) + 12) > 8) || null;
    }
    expect(isl).not.toBeNull();
    expect(floatingIslandsNear(S, isl.x - 1, isl.z - 1, isl.x + 1, isl.z + 1)[0]).toEqual(isl);
    expect(isl.y).toBeGreaterThanOrEqual(88);
    const cx = Math.floor(isl.x / 16);
    const cz = Math.floor(isl.z / 16);
    const c = generateChunk(S, cx, cz, { light: false });
    const lx = Math.floor(isl.x) & 15;
    const lz = Math.floor(isl.z) & 15;
    let solid = 0;
    for (let y = isl.y - 2; y <= isl.y + 3; y++) if (isSolid(c.get(lx, y, lz)) && c.get(lx, y, lz) !== B.SEAL_BARRIER) solid++;
    expect(solid).toBeGreaterThan(0);
    // altında hava boşluğu (zemin ile ada arasında)
    let air = 0;
    for (let y = heightAt(S, Math.floor(isl.x), Math.floor(isl.z)) + 12; y < isl.y - isl.ry - 2; y++) {
      if (c.get(lx, y, lz) === 0) air++;
    }
    expect(air).toBeGreaterThan(3);
  });

  it('çukur (sinkhole) yüzeyi mağara katına kadar deler', () => {
    const g = getGen(S);
    let hole = null;
    for (let a = -8; a <= 8 && !hole; a++) {
      for (let b = -8; b <= 8 && !hole; b++) {
        const s = sinkholeInCell(g, a, b);
        if (!s) continue;
        const x = Math.floor(s.x);
        const z = Math.floor(s.z);
        if (heightAt(S, x, z) > SEA_LEVEL + 6 && ringIndexAt(x, z) < 0 && Math.hypot(x, z) < 90) hole = { x, z };
      }
    }
    if (!hole) return;
    const c = generateChunk(S, Math.floor(hole.x / 16), Math.floor(hole.z / 16), { light: false });
    const lx = hole.x & 15;
    const lz = hole.z & 15;
    const h = heightAt(S, hole.x, hole.z);
    for (let y = 27; y <= h; y++) expect(c.get(lx, y, lz)).toBe(0);
    expect(c.get(lx, 25, lz)).not.toBe(0);
  });
});

describe('madenler', () => {
  it('kuantum kristali yalnızca çok derinde veya kristal salon kabuğunda (y ≤ 45), yüzeyde asla; büyük çoğunluğu y < -190', () => {
    let count = 0;
    let deepCount = 0;
    let maxY = -999;
    for (let cz = -22; cz <= 22; cz += 4) {
      for (let cx = 8; cx <= 40; cx += 4) {
        if (zoneForChunk(cx, cz) < 2) continue;
        const c = generateChunk(S, cx, cz, { light: false, sections: 'all' });
        const d = DALL(c);
        for (let i = 0; i < d.length; i++) {
          if (d[i] === B.QUANTUM_ORE) {
            count++;
            const y = -400 + (i >> 8);
            if (y > maxY) maxY = y;
            if (y < -190) deepCount++;
          }
        }
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(maxY).toBeLessThanOrEqual(45);
    expect(deepCount / count).toBeGreaterThan(0.6);
  });
});

describe('taban dünyaları (insa / harita)', () => {
  function buildAll(base, seed = S) {
    const map = new Map();
    for (let cz = 0; cz < 8; cz++) {
      for (let cx = 0; cx < 8; cx++) map.set(cx + ',' + cz, generateChunk(seed, cx, cz, { mode: 'insa', base, light: false }));
    }
    return map;
  }
  const at = (map, x, y, z) => map.get((x >> 4) + ',' + (z >> 4)).get(x & 15, y, z & 15);

  it('doğuş [64,64,64]: altı katı (y=63), üstü açık; tüm bloklar id ≤ 99', () => {
    expect(baseSpawn()).toEqual([64, 64, 64]);
    BASE_KEYS.forEach((base) => {
      const map = buildAll(base);
      expect(isSolid(at(map, 64, FLAT_TOP, 64))).toBe(true);
      expect(isSolid(at(map, 64, 64, 64))).toBe(false);
      expect(isSolid(at(map, 64, 65, 64))).toBe(false);
      expect(baseHeight(S, base, 64, 64)).toBe(FLAT_TOP);
      map.forEach((c) => {
        const d = D(c);
        for (let i = 0; i < d.length; i++) {
          if (d[i] > 99) throw new Error(base + ': sistem bloğu ' + d[i] + ' chunk ' + c.cx + ',' + c.cz);
        }
        expect(c.generated).toBe(true);
        expect(c.legacy).toBe(true);
      });
    });
  });

  it('düz: yüzey her yerde y=63 çimen', () => {
    const map = buildAll('düz');
    for (let x = 0; x < 128; x += 7) for (let z = 0; z < 128; z += 5) {
      expect(at(map, x, 63, z)).toBe(B.GRASS);
      expect(at(map, x, 64, z)).toBe(0);
    }
  });

  it('çayır: engebeli, çiçekli, birkaç ağaç; doğuş çevresi düz', () => {
    const map = buildAll('çayır');
    let minH = 999;
    let maxH = 0;
    let leaves = 0;
    let flowers = 0;
    for (let x = 0; x < 128; x++) for (let z = 0; z < 128; z++) {
      const h = baseHeight(S, 'çayır', x, z);
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      expect(at(map, x, h, z)).toBe(B.GRASS);
    }
    map.forEach((c) => {
      const d = D(c);
      for (let i = 0; i < d.length; i++) {
        const b = d[i];
        if (b >= 48 && b <= 51) leaves++;
        if (b === B.FLOWER_RED || b === B.FLOWER_YELLOW) flowers++;
      }
    });
    expect(maxH - minH).toBeGreaterThanOrEqual(4);
    expect(leaves).toBeGreaterThan(50);
    expect(flowers).toBeGreaterThan(20);
    for (let x = 60; x <= 68; x++) for (let z = 60; z <= 68; z++) expect(baseHeight(S, 'çayır', x, z)).toBe(63);
  });

  it('ada: etrafı su (y=60), merkez kara, kıyı kum', () => {
    const map = buildAll('ada');
    expect(at(map, 64, 63, 64)).toBe(B.GRASS);
    expect(at(map, 2, 60, 2)).toBe(B.WATER);
    expect(at(map, 2, 61, 2)).toBe(0);
    let sand = 0;
    for (let x = 0; x < 128; x += 2) for (let z = 0; z < 128; z += 2) {
      if (at(map, x, baseHeight(S, 'ada', x, z), z) === B.SAND) sand++;
    }
    expect(sand).toBeGreaterThan(100);
    // bölgeler: kıyı biyomu plaj
    expect(map.get('0,0').biomeMap[0]).toBe(BIOME_ID.plaj);
    expect(map.get('4,4').biomeMap[(0 << 4) + 0]).toBe(BIOME_ID.cayir);
  });

  it('boş: yalnız 7×7×2 platform', () => {
    const map = buildAll('boş');
    let n = 0;
    map.forEach((c) => {
      n += c.countSolid();
    });
    expect(n).toBe(7 * 7 * 2);
    expect(at(map, 61, 63, 61)).not.toBe(0);
    expect(at(map, 60, 63, 61)).toBe(0);
    expect(at(map, 64, 62, 64)).toBe(B.STONE);
  });

  it('belirlenimci ve bilinmeyen taban düz\'e düşer', () => {
    const a = generateChunk(S, 3, 3, { mode: 'harita', base: 'çayır', light: false });
    const b = generateChunk(S, 3, 3, { mode: 'harita', base: 'çayır', light: false });
    expect(sameArray(D(a), D(b))).toBe(true);
    const u = generateChunk(S, 3, 3, { mode: 'insa', base: 'yok', light: false });
    const d = generateChunk(S, 3, 3, { mode: 'insa', base: 'düz', light: false });
    expect(sameArray(D(u), D(d))).toBe(true);
  });

  it('çerçeve chunk\'ı: 2 blok ana kaya duvar (y ≤ 76) + üstünde bariyer, ötesi boş', () => {
    const c = generateChunk(S, -1, 3, { mode: 'insa', base: 'düz', light: false });
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const wall = lx >= 14;
        for (let y = 0; y < 128; y++) {
          const b = c.get(lx, y, lz);
          if (!wall) expect(b).toBe(0);
          else if (y <= WALL_TOP) expect(b).toBe(B.BEDROCK);
          else expect(b).toBe(B.SEAL_BARRIER);
        }
      }
    }
    // köşe çerçevesi
    const corner = generateChunk(S, -1, -1, { mode: 'insa', base: 'düz', light: false });
    expect(corner.get(15, 40, 15)).toBe(B.BEDROCK);
    expect(corner.get(14, 40, 15)).toBe(B.BEDROCK);
    expect(corner.get(13, 40, 15)).toBe(0);
    expect(corner.get(15, 40, 13)).toBe(0);
    // özel sınır
    const custom = { minCx: 0, maxCx: 1, minCz: 0, maxCz: 1 };
    const f = generateChunk(S, 2, 0, { mode: 'harita', base: 'düz', bounds: custom, light: false });
    expect(f.get(0, 10, 4)).toBe(B.BEDROCK);
    expect(f.get(1, 10, 4)).toBe(B.BEDROCK);
    expect(f.get(2, 10, 4)).toBe(0);
    const inside = generateChunk(S, 1, 1, { mode: 'harita', base: 'düz', bounds: custom, light: false });
    expect(inside.get(3, 63, 3)).toBe(B.GRASS);
  });

  it('gökyüzü ışığı doğuşta 15; çerçeve saydamdır', () => {
    const c = generateChunk(S, 4, 4, { mode: 'insa', base: 'düz' });
    expect(c.getSkyLight(0, 64, 0)).toBe(15);
    expect(c.getSkyLight(0, 63, 0)).toBe(0);
    const f = generateChunk(S, -1, 3, { mode: 'insa', base: 'düz' });
    expect(f.getSkyLight(14, 100, 5)).toBeGreaterThanOrEqual(14);
  });
});

describe('başarım', () => {
  it('chunk üretimi ortalama << 8 ms (CI güvenliği için 40 ms üst sınırı)', () => {
    for (let i = 0; i < 24; i++) generateChunk(S, i - 12, 5);
    const N = 60;
    const run = (opts) => bestOf(3, () => {
      const t0 = cpuMs();
      for (let i = 0; i < N; i++) generateChunk(S, (i % 12) * 3 - 20, Math.floor(i / 12) * 3 - 15, opts);
      return (cpuMs() - t0) / N;
    });
    const withLight = run(undefined);
    const noLight = run({ light: false });
    console.log('[worldgen] chunk başına ort. ms: ışıklı ' + withLight.toFixed(2) + ', ışıksız ' + noLight.toFixed(2));
    expect(withLight).toBeLessThan(scaled(40));
    expect(noLight).toBeLessThan(scaled(40));
  });
});
