import { describe, it, expect } from 'vitest';
import { B, BLOCKS } from '../sim/blocks.js';
import { meshChunk } from './mesher.js';
import { MESH_DEFAULTS, meshFromWire } from './chunkMgrCore.js';
import { DARKGROW, DARKINSET, NEAR_MAX_BLK } from './mesherDark.js';

const VOL = 16 * 16 * 128;
const idx = (x, y, z) => ((y * 16) + z) * 16 + x;

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Taş dolu 0..top, rastgele mağara (hava): çoğu karanlık, bazıları blok ışıklı, tavan açık gökyüzü. */
function caveChunk(seed, opts = {}) {
  const rnd = lcg(seed);
  const c = {
    cx: 0, cz: 0, blocks: new Uint8Array(VOL), light: new Uint8Array(VOL), biomeMap: new Uint8Array(256),
  };
  const top = opts.top || 40;
  for (let y = 0; y < top; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.blocks[idx(x, y, z)] = B.STONE;
  for (let y = top; y < top + 6; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.light[idx(x, y, z)] = 0xf0;
  const blobs = opts.blobs || 14;
  for (let n = 0; n < blobs; n++) {
    const bx = 2 + Math.floor(rnd() * 12);
    const by = 6 + Math.floor(rnd() * (top - 12));
    const bz = 2 + Math.floor(rnd() * 12);
    const r = 2 + Math.floor(rnd() * 4);
    const glow = rnd() < (opts.glowFrac === undefined ? 0.3 : opts.glowFrac) ? 1 + Math.floor(rnd() * 15) : 0;
    for (let y = by - r; y <= by + r; y++) for (let z = bz - r; z <= bz + r; z++) for (let x = bx - r; x <= bx + r; x++) {
      if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y >= top) continue;
      if ((x - bx) ** 2 + ((y - by) * 1.3) ** 2 + (z - bz) ** 2 > r * r) continue;
      c.blocks[idx(x, y, z)] = 0;
      c.light[idx(x, y, z)] = glow;
    }
  }
  // birkaç emisyonlu cevher (kuantum) duvarlara
  if (opts.ore) {
    for (let n = 0; n < 12; n++) {
      const x = Math.floor(rnd() * 16);
      const y = 2 + Math.floor(rnd() * (top - 4));
      const z = Math.floor(rnd() * 16);
      if (c.blocks[idx(x, y, z)] === B.STONE) c.blocks[idx(x, y, z)] = B.QUANTUM_ORE;
    }
  }
  return c;
}

/** Opak geçişteki dörtgenlerin kapladığı (yön, düzlem, u, v) birim hücre kümesi. */
function coverage(mesh) {
  const p = mesh.opaque;
  const cells = new Map();
  const nf = p.vertexCount / 4;
  for (let f = 0; f < nf; f++) {
    const v = f * 4;
    const nx = p.normal[v * 3];
    const ny = p.normal[v * 3 + 1];
    const nz = p.normal[v * 3 + 2];
    const a = nx !== 0 ? 0 : ny !== 0 ? 1 : 2;
    const sign = (nx + ny + nz) > 0 ? 1 : -1;
    const lo = [1e9, 1e9, 1e9];
    const hi = [-1e9, -1e9, -1e9];
    for (let k = 0; k < 4; k++) {
      for (let q = 0; q < 3; q++) {
        const val = p.pos[(v + k) * 3 + q];
        if (val < lo[q]) lo[q] = val;
        if (val > hi[q]) hi[q] = val;
      }
    }
    const plane = Math.round((lo[a] + hi[a]) / 2);
    const u = (a + 1) % 3;
    const w = (a + 2) % 3;
    for (let i = Math.round(lo[u]); i < Math.round(hi[u]); i++) {
      for (let j = Math.round(lo[w]); j < Math.round(hi[w]); j++) {
        const key = `${a}${sign}:${plane}:${i}:${j}`;
        cells.set(key, (cells.get(key) || 0) + 1);
      }
    }
  }
  return cells;
}

const nb = {};
const run = (c, o) => meshChunk(c, nb, null, Object.assign({ nullNeighbor: 'air' }, o));

describe('mesherDark: karanlık yüz birleştirme', () => {
  it('birleşik ağ, saf ağla AYNI yüzey kapsamını verir (rastgele mağaralar, her iki mod)', { timeout: 120000 }, () => {
    for (let seed = 1; seed <= 4; seed++) {
      const c = caveChunk(seed * 977, { ore: seed % 2 === 0 });
      const naive = coverage(run(c, {}));
      const merged = run(c, { mergeDark: true, darkLod: 0 });
      const cov = coverage(merged);
      expect(cov.size).toBe(naive.size);
      naive.forEach((_, key) => expect(cov.has(key)).toBe(true));
      cov.forEach((n) => expect(n).toBe(1)); // aynı hücre iki kez örtülmez
    }
  });

  it('uzak mod (sanal taş): ışıklı havaya bakan her yüz korunur; yeni yüzler yalnız ışıklı havaya bakar (kapak, delik yok)', { timeout: 120000 }, () => {
    for (let seed = 1; seed <= 3; seed++) {
      const c = caveChunk(seed * 1237, { blobs: 18, glowFrac: 0 });
      // mağara ağzı: üst katmanı oyup gökyüzü ışığını içeri taşı (yanal sızma benzetimi)
      for (let y = 30; y < 40; y++) {
        for (let z = 6; z < 10; z++) {
          for (let x = 6; x < 10; x++) {
            c.blocks[idx(x, y, z)] = 0;
            c.light[idx(x, y, z)] = Math.max(1, 15 - (39 - y)) << 4;
          }
        }
      }
      const naive = coverage(run(c, {}));
      const far = coverage(run(c, { mergeDark: true, darkLod: 1 }));
      const U = [1, 2, 0];
      const W = [2, 0, 1];
      const frontCell = (key) => {
        const [ad, plane, i, j] = key.split(':');
        const a = Number(ad[0]);
        const cell = [0, 0, 0];
        cell[a] = ad.slice(1) === '1' ? Number(plane) : Number(plane) - 1;
        cell[U[a]] = Number(i);
        cell[W[a]] = Number(j);
        return cell;
      };
      const skyAt = (cell) => {
        const [x, y, z] = cell;
        if (x < 0 || x > 15 || z < 0 || z > 15 || y >= 128) return 15; // dışarı: hava + tam gökyüzü (nullNeighbor 'air')
        if (y < 0) return 0;
        return c.light[idx(x, y, z)] >> 4;
      };
      naive.forEach((_, key) => {
        if (skyAt(frontCell(key)) > 0) expect(far.has(key)).toBe(true);
      });
      far.forEach((_, key) => {
        if (!naive.has(key)) expect(skyAt(frontCell(key))).toBeGreaterThan(0);
      });
      expect(far.size).toBeLessThan(naive.size);
    }
  });

  it('mağaralı chunk\'ta üçgen sayısı belirgin azalır; çıktı tutarlı', () => {
    const c = caveChunk(4242, { blobs: 24, glowFrac: 0 });
    const a = run(c, {});
    const b = run(c, { mergeDark: true });
    const far = run(c, { mergeDark: true, darkLod: 1 });
    expect(b.stats.triangles).toBeLessThan(a.stats.triangles * 0.9);
    expect(far.stats.triangles).toBeLessThan(a.stats.triangles * 0.6);
    for (const m of [a, b, far]) {
      const p = m.opaque;
      expect(p.index.length).toBe(p.indexCount);
      for (let i = 0; i < p.indexCount; i++) expect(p.index[i]).toBeLessThan(p.vertexCount);
      for (let i = 0; i < p.pos.length; i++) expect(Number.isFinite(p.pos[i])).toBe(true);
    }
  });

  it('gökyüzü ışıklı ya da parlak blok ışıklı yüzler birleşmez; birleşenlerin ışığı eşik altında', () => {
    const c = caveChunk(99, { blobs: 20 });
    const m = run(c, { mergeDark: true });
    const p = m.opaque;
    const nf = p.vertexCount / 4;
    let bigQuads = 0;
    for (let f = 0; f < nf; f++) {
      const v = f * 4;
      const sky = p.light[v * 2];
      const blk = p.light[v * 2 + 1];
      // birleşik (büyük) dörtgen: kenar uzunluğu > 1
      const du = Math.abs(p.pos[(v + 1) * 3] - p.pos[v * 3]) + Math.abs(p.pos[(v + 1) * 3 + 1] - p.pos[v * 3 + 1]) + Math.abs(p.pos[(v + 1) * 3 + 2] - p.pos[v * 3 + 2]);
      const dv = Math.abs(p.pos[(v + 3) * 3] - p.pos[v * 3]) + Math.abs(p.pos[(v + 3) * 3 + 1] - p.pos[v * 3 + 1]) + Math.abs(p.pos[(v + 3) * 3 + 2] - p.pos[v * 3 + 2]);
      if (du > 1.5 || dv > 1.5) {
        bigQuads++;
        expect(sky).toBe(0);
        expect(blk * 15).toBeLessThanOrEqual(NEAR_MAX_BLK + 1e-4);
      }
    }
    expect(bigQuads).toBeGreaterThan(0);
  });

  it('emisyonlu cevher yüzleri birleştirilmez (karanlıkta bile parlar)', () => {
    expect(BLOCKS[B.QUANTUM_ORE].emission).toBeGreaterThan(0);
    const c = {
      cx: 0, cz: 0, blocks: new Uint8Array(VOL), light: new Uint8Array(VOL), biomeMap: new Uint8Array(256),
    };
    for (let y = 0; y < 12; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.blocks[idx(x, y, z)] = B.STONE;
    for (let y = 5; y < 10; y++) for (let z = 3; z < 12; z++) for (let x = 3; x < 12; x++) c.blocks[idx(x, y, z)] = 0;
    // ortadaki yan duvara cevher
    c.blocks[idx(2, 7, 7)] = B.QUANTUM_ORE;
    const m = run(c, { mergeDark: true });
    // cevherin +X yüzü (düzlem x=3) ayrı bir birim dörtgen olarak durmalı
    const p = m.opaque;
    let single = 0;
    for (let f = 0; f < p.vertexCount / 4; f++) {
      const v = f * 4;
      if (p.normal[v * 3] !== 1) continue;
      const x = p.pos[v * 3];
      const y = p.pos[v * 3 + 1];
      const z = p.pos[v * 3 + 2];
      if (Math.abs(x - 3) < 0.01 && y > 6.9 && y < 8.1 && z > 6.9 && z < 8.1) single++;
    }
    expect(single).toBeGreaterThan(0);
    // gizli yüz sayısı mantıklı: tüm duvar tek dörtgene çökmedi
    expect(m.stats.faces).toBeGreaterThan(6);
  });

  it('birleşik dörtgenler düzlemin içine itilir ve komşuya taşar (T-kavşağı çatlağı olmaz)', () => {
    const c = {
      cx: 0, cz: 0, blocks: new Uint8Array(VOL), light: new Uint8Array(VOL), biomeMap: new Uint8Array(256),
    };
    for (let y = 0; y < 14; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.blocks[idx(x, y, z)] = B.STONE;
    for (let y = 4; y < 10; y++) for (let z = 3; z < 13; z++) for (let x = 3; x < 13; x++) c.blocks[idx(x, y, z)] = 0;
    const m = run(c, { mergeDark: true });
    const p = m.opaque;
    // tabandaki (+Y bakan) tek büyük dörtgen: y = 4 - inset
    let found = false;
    for (let f = 0; f < p.vertexCount / 4; f++) {
      const v = f * 4;
      if (p.normal[v * 3 + 1] !== 1) continue;
      const y = p.pos[v * 3 + 1];
      if (Math.abs(y - (4 - DARKINSET)) < 1e-4) {
        found = true;
        let minX = 1e9;
        let maxX = -1e9;
        for (let k = 0; k < 4; k++) {
          minX = Math.min(minX, p.pos[(v + k) * 3]);
          maxX = Math.max(maxX, p.pos[(v + k) * 3]);
        }
        expect(minX).toBeCloseTo(3 - DARKGROW, 4);
        expect(maxX).toBeCloseTo(13 + DARKGROW, 4);
      }
    }
    expect(found).toBe(true);
  });

  it('MESH_DEFAULTS karanlık birleştirme açık; meshFromWire darkLod iletir; belirlenimci', () => {
    expect(MESH_DEFAULTS.mergeDark).toBe(true);
    const c = caveChunk(31337, { blobs: 20 });
    const a = meshFromWire(c, {}, null, { nullNeighbor: 'air' }, 0);
    const b = meshFromWire(c, {}, null, { nullNeighbor: 'air' }, 0);
    const far = meshFromWire(c, {}, null, { nullNeighbor: 'air' }, 1);
    expect(Array.from(a.opaque.pos)).toEqual(Array.from(b.opaque.pos));
    expect(far.stats.triangles).toBeLessThanOrEqual(a.stats.triangles);
  });
});
