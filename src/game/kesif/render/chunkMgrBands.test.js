import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { World } from '../sim/world.js';
import {
  KEEP_ABOVE, KEEP_BELOW, MESH_ABOVE, MESH_BELOW, affectedBandsOfCell, bandTrivial, columnSurfaceRange, neededSections,
  verticalWindow,
} from './chunkMgrBands.js';
import { bandOfSection } from './chunkMgrCore.js';

describe('chunkMgrBands', () => {
  it('verticalWindow göz çevresinde asimetrik mesh + bellek pencereleri verir', () => {
    const w = verticalWindow(100);
    expect(w).toEqual({
      lo: 100 - MESH_BELOW, hi: 100 + MESH_ABOVE, keepLo: 100 - KEEP_BELOW, keepHi: 100 + KEEP_ABOVE,
    });
    expect(w.keepLo).toBeLessThan(w.lo);
    expect(w.keepHi).toBeGreaterThan(w.hi);
  });

  it('neededSections dikey komşuları ekler ve dünya aralığına kırpar', () => {
    expect(neededSections(48, 3, 3)).toEqual([2, 6]);
    expect(neededSections(48, 0, 3)).toEqual([0, 3]);
    expect(neededSections(48, 45, 3)).toEqual([44, 47]);
  });

  it('affectedBandsOfCell: kesit ve bant sınırındaki hücre komşu bantları da kirletir (negatif y dahil)', () => {
    const w = new World({ seed: 5 });
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.ensureChunk(dx, dz);
    // iç hücre: tek bant
    const mid = affectedBandsOfCell(w, 8, -392, 8); // si 0 içinde, ly 8
    expect(mid).toEqual([[0, 0, 0]]);
    // y = -353 → si 2 (ly 15) ve komşu si 3 farklı bantta (band 0: si 0-2, band 1: si 3-5)
    const edge = affectedBandsOfCell(w, 8, -353, 8);
    expect(edge.map((e) => e[2]).sort()).toEqual([0, 1]);
    // chunk köşesi: dört yatay komşu sütun
    const corner = affectedBandsOfCell(w, 0, -392, 0);
    expect(corner.length).toBe(4);
    expect(bandOfSection(0)).toBe(0);
  });

  it('bandTrivial: gömülü katı kaya ve gökyüzü havası çizim üretmez; yüzey bandı üretir', () => {
    const w = new World({ seed: 5 });
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.ensureChunk(dx, dz);
    const c = w.getChunk(0, 0);
    // gökyüzü (si 45..46, y 320..351) hava
    expect(bandTrivial(w, c, 45, 2)).toBe(true);
    // yüzey bandı (y 32..79 → si 27..29) çizim ister
    expect(bandTrivial(w, c, 27, 3)).toBe(false);
    // üretilmemiş derin kesit trivial sayılmaz (önce üretilmeli)
    expect(bandTrivial(w, c, 3, 3)).toBe(false);
    // bütün derin kesitleri tek tip taşa çevir → tamamen gömülü: trivial
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ch = w.getChunk(dx, dz);
        for (let si = 0; si < 25; si++) {
          if (ch.secGen[si] === 0) w.ensureSection(dx, dz, si);
          ch.setSection(si, null, B.STONE);
        }
      }
    }
    expect(bandTrivial(w, c, 3, 3)).toBe(true);
    // bir kesite delik açılırsa artık trivial değil
    w.setBlock(8, -330, 8, B.AIR);
    expect(bandTrivial(w, c, 3, 3)).toBe(false);
  });

  it('columnSurfaceRange heightMap min/max verir', () => {
    const w = new World({ seed: 5 });
    const c = w.ensureChunk(0, 0);
    const r = columnSurfaceRange(c, { min: 0, max: 0 });
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < 256; i++) { mn = Math.min(mn, c.heightMap[i]); mx = Math.max(mx, c.heightMap[i]); }
    expect(r.min).toBe(mn);
    expect(r.max).toBe(mx);
  });
});
