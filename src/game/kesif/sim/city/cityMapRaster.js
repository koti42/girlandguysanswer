/*
 * KEŞİF sim/city — ŞEHİR HARİTASI RASTERI (saf; DOM/three yok; belirlenimci; tohum başına önbellekli). Sözleşme §11 (`getMapInfo()` şehir katmanı).
 *
 *   CITY_MAP_CELL = 8 blok, CITY_MAP_GRID = 200 hücre (1600×1600 boyut sınırı: x,z ∈ [−800, 800))
 *   cityMapRaster(seed) → { w, h, cell, data:Uint8Array(w·h), palette:[hex], paletteBase:1 }
 *     değer 0 = harita dışı; 1 zemin · 2 asfalt · 3 kaldırım/meydan · 4 park · 5 su (kanal/deniz) · 6 bina · 7 rıhtım
 *     (renk = palette[değer]; harita ekranı ve mini harita aynı sözleşmeyi okur). Yol/bina/park/su tümüyle görünür (sis yok): işaretler ayrıca keşfe bağlıdır.
 *   cityMapSpec → sabitler (bounds, palette)
 */
import { SURF, surfaceAt } from './cityRoads.js';
import { getCityPlan, lotAt } from './cityPlan.js';
import { footprintOf } from './cityLots.js';

export const CITY_MAP_CELL = 8;
export const CITY_MAP_GRID = 200;
export const CITY_MAP_HALF = CITY_MAP_GRID / 2;
export const CITY_MAP_SIZE = CITY_MAP_CELL * CITY_MAP_GRID;
export const CITY_MAP_PALETTE = Object.freeze([
  '#0b0f20', '#1c2140', '#4b5272', '#8d93b5', '#2f8f5a', '#2f6fb0', '#c04fa0', '#d8b878',
]);
export const CITY_MAP_BOUNDS = Object.freeze({
  minX: -CITY_MAP_SIZE / 2, minZ: -CITY_MAP_SIZE / 2, maxX: CITY_MAP_SIZE / 2, maxZ: CITY_MAP_SIZE / 2,
});

const CACHE = new Map();

function cellValue(seed, roads, x, z) {
  const s = surfaceAt(roads, x, z);
  switch (s) {
    case SURF.EDGE:
    case SURF.WATER:
      return 5;
    case SURF.ASPHALT:
    case SURF.LANE_X:
    case SURF.LANE_Z:
    case SURF.ZEBRA_X:
    case SURF.ZEBRA_Z:
      return 2;
    case SURF.SIDEWALK:
    case SURF.PLAZA:
      return 3;
    case SURF.PARK:
      return 4;
    case SURF.QUAY:
      return 7;
    default: {
      const lot = lotAt(seed, x, z);
      const fp = lot ? footprintOf(lot) : null;
      return fp && x >= fp.x0 && x < fp.x1 && z >= fp.z0 && z < fp.z1 ? 6 : 1;
    }
  }
}

export function cityMapRaster(seed) {
  const key = seed >>> 0;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const roads = getCityPlan(seed).roads;
  const n = CITY_MAP_GRID;
  const data = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = (j - CITY_MAP_HALF) * CITY_MAP_CELL + CITY_MAP_CELL / 2;
    for (let i = 0; i < n; i++) {
      const x = (i - CITY_MAP_HALF) * CITY_MAP_CELL + CITY_MAP_CELL / 2;
      data[j * n + i] = cellValue(seed, roads, Math.floor(x), Math.floor(z));
    }
  }
  const out = {
    w: n, h: n, cell: CITY_MAP_CELL, data, palette: CITY_MAP_PALETTE, paletteBase: 1,
  };
  if (CACHE.size >= 4) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, out);
  return out;
}
