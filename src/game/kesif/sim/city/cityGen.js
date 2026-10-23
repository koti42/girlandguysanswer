/*
 * KEŞİF sim/city — NEON MERİDYEN ÜRETİCİSİ (chunk/kesit yazıcısı + kurallar). Saf, belirlenimci, worker-güvenli. Sözleşme §7.
 *
 *  generateCityChunk(seed, cx, cz, opts)       → Chunk (worldgen.generateChunk ile aynı imza/dönüş; macera düzeni 48 kesit, y −400..367)
 *  generateCitySection(seed, cx, cz, si, opts) → {blocks:Uint8Array(4096)|null, uniform}   (derin kesitler tembel; si ≥ 25 chunk'tan alınır)
 *  canGenerateCity(cx, cz)                     → bool   (chunk −50..49)
 *  cityRulesFor(seed) → {isNaturalFill(x,y,z), isNoBuild(x,y,z), zoneAt(x,y,z)}    O(1) kurallar (genRegistry.getCityRules bunu çağırır)
 *  isNaturalFill(x,y,z,seed?) · isNoBuild(x,y,z,seed?) · cityZoneAt(x,y,z,seed?)   (registry (x,y,z,seed) sırası; seed yoksa son üretim tohumu)
 *  warmCity(seed, opts) → cityWarm.js (plan önbellekleri) · warmCityChunk(seed,cx,cz)
 *
 * Yazma sırası (sözleşme §7; her yazıcı tüm planı çalıştırır, yalnız bu chunk'ın dilimini yazar, üst üste yazma sırası sabit):
 *   temel (taş 0–60, beton 61–62) → yüzey (yol/şerit/zebra/kaldırım, meydan, park, avlu, kıyı, tepe, kanal+köprü, tünel) → blok süsleri
 *   (park yolu, çeşme, parkur) + meydan neon halkaları → parsel zeminleri → bina kabukları / pazar tezgâhları (+ Faz 2 iç mekân kancası) →
 *   alt şehir kabuğu (kanalizasyon, menhol, metro, istasyon girişleri) → sokak lambaları.
 * Derin kesitler (y<0): tek tip taş (+ ana kaya tabanı); laboratuvar/kasa kabukları ve servis bacaları `cityUndergroundShell`.
 */
import { Chunk } from '../chunk.js';
import {
  GEN_TOP_Y, SECTION_H, SURFACE_BAND_MIN_Y, WORLD_Y_MIN,
} from '../constants.js';
import { acquireDense } from '../denseChunk.js';
import { computeChunkLight } from '../lighting.js';
import { toSeedInt } from '../rng.js';
import { bedrockTopY } from '../worldgenDeep.js';
import { B } from '../blocks.js';
import { planBuilding } from './buildingPlan.js';
import { getCityPlan } from './cityPlan.js';
import { CityWriter, ID, Y } from './cityEmit.js';
import { emitOpenLot, emitBuilding } from './cityBuildings.js';
import {
  emitBase, emitBlockFeatures, emitLotGrounds, emitPlazaInlays, emitSurface,
} from './cityTerrain.js';
import { emitUnderground } from './cityUndergroundShell.js';
import { emitUndergroundContent } from './cityUnderground.js';
import { emitRoofContent, emitRoofWindow } from './cityRoofs.js';
import { noteSeed } from './cityZone.js';

export { cityRulesFor, cityZoneAt, isNaturalFill, isNoBuild } from './cityZone.js';
export { warmCity } from './cityWarm.js';

/** JIT/yazma penceresi ısıtma: bir chunk'ı üretip atar (ışıksız). */
export function warmCityChunk(seed, cx, cz) {
  generateCityChunk(seed, cx | 0, cz | 0, { light: false });
}

const CS = 16;
/** Yüzey bandının ilk kesit indeksi (y ≥ 0): chunk ile birlikte üretilir; altı tembel. */
export const CITY_SURFACE_SECTION = (SURFACE_BAND_MIN_Y - WORLD_Y_MIN) >> 4;
const BOUNDS = Object.freeze({ minCx: -50, maxCx: 49, minCz: -50, maxCz: 49 });

export function canGenerateCity(cx, cz) {
  return cx >= BOUNDS.minCx && cx <= BOUNDS.maxCx && cz >= BOUNDS.minCz && cz <= BOUNDS.maxCz;
}

/* Faz 2 iç mekân kancası: interior/index.js `emitBuildingInterior(w, buildingPlan, lot)` dışa açarsa çağrılır (Vite glob; düz node'da yok). */
let INTERIOR_MODS = null;
try {
  INTERIOR_MODS = import.meta.glob('./interior/index.js', { eager: true });
} catch {
  INTERIOR_MODS = null;
}
let interiorFn;
function interiorHook() {
  if (interiorFn !== undefined) return interiorFn;
  interiorFn = null;
  if (INTERIOR_MODS) {
    const ks = Object.keys(INTERIOR_MODS);
    const m = ks.length > 0 ? INTERIOR_MODS[ks[0]] : null;
    if (m && typeof m.emitBuildingInterior === 'function') interiorFn = m.emitBuildingInterior;
  }
  return interiorFn;
}

/* ------------------------------------------------------------------------------------------------
 * Sokak lambaları: demir direk (çit ×4) + fener (emisyon 14), blok olarak yazılır (lamba aralığı ≥ 12)
 * ---------------------------------------------------------------------------------------------- */
function emitLamps(w, bp) {
  if (!bp || !bp.lamps) return;
  // aynı hücreyi paylaşan prop (bank, ağaç, otomat…) varsa lamba direği atlanır (tabela/billboard duvar çıpalarıdır, hücre dışı)
  const taken = new Set();
  const mark = (list) => {
    for (let q = 0; q < list.length; q++) {
      const p = list[q];
      const x = Math.floor(p.x);
      const z = Math.floor(p.z);
      if (x >= w.x0 && x < w.x1 && z >= w.z0 && z < w.z1 && Math.floor(p.y) <= Y.FOOT + 3) taken.add(x + ',' + z);
    }
  };
  mark(bp.props);
  mark(bp.streetFurniture);
  const ls = bp.lamps;
  for (let q = 0; q < ls.length; q++) {
    const L = ls[q];
    const x = Math.floor(L.x);
    const z = Math.floor(L.z);
    if (x < w.x0 || x >= w.x1 || z < w.z0 || z >= w.z1) continue;
    if (taken.has(x + ',' + z)) continue;
    const under = w.get(x, Y.SURFACE, z);
    if (under === 0 || under === ID.WATER || w.get(x, Y.FOOT, z) !== 0) continue;
    w.col(x, z, Y.FOOT, Y.FOOT + 4, ID.FENCE);
    w.set(x, Y.FOOT + 4, z, ID.LANTERN);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Chunk
 * ---------------------------------------------------------------------------------------------- */
function blockOf(plan, cx, cz) {
  const bi = Math.floor(cx / 5);
  const bj = Math.floor(cz / 5);
  if (bi < -10 || bi > 9 || bj < -10 || bj > 9) return { bi, bj, lay: null, bp: null };
  return { bi, bj, lay: plan.lotsIndex.layout(bi, bj), bp: plan.lotsIndex.blockPlan(bi, bj) };
}

/** Yüzey bandı (y 0..367) bloklarını verilen pencereye yazar. */
function fillSurfaceBand(w, plan, cx, cz) {
  const { bi, bj, lay, bp } = blockOf(plan, cx, cz);
  const ctx = { cx, cz, bi, bj, lay, bp };
  emitBase(w);
  emitSurface(w, plan, ctx);
  emitBlockFeatures(w, plan, ctx);
  emitPlazaInlays(w, plan);
  const hook = interiorHook();
  if (lay) {
    const lots = lay.lots;
    const mine = [];
    for (let q = 0; q < lots.length; q++) {
      const l = lots[q];
      if (w.touches(l.x0 - 8, l.z0 - 8, l.x1 + 8, l.z1 + 8)) mine.push(l);
    }
    const bpOf = (l) => planBuilding(plan, l);
    emitLotGrounds(w, mine, bpOf);
    for (let q = 0; q < mine.length; q++) {
      const l = mine[q];
      if (l.hill) continue;
      const b = bpOf(l);
      if (b.open) emitOpenLot(w, l, b);
      else {
        emitBuilding(w, l, b, hook);
        emitRoofContent(w, plan, l, b);
      }
    }
  }
  emitRoofWindow(w, plan);
  emitUnderground(w, plan);
  emitUndergroundContent(w, plan);
  emitLamps(w, bp);
}

export function generateCityChunk(seed, cx, cz, opts = {}) {
  const s = toSeedInt(seed);
  noteSeed(s);
  const plan = getCityPlan(s);
  const dense = acquireDense(cx, cz, GEN_TOP_Y);
  const w = new CityWriter(dense.blocks, cx * CS, cz * CS, 0, GEN_TOP_Y);
  fillSurfaceBand(w, plan, cx, cz);
  dense.recomputeHeightMap();
  const chunk = new Chunk(cx, cz, { lazy: true });
  chunk.loadDense(dense.blocks, SURFACE_BAND_MIN_Y, dense.maxTop() + 1);
  chunk.heightMap.set(dense.heightMap);
  chunk.recomputeHeightMap();
  chunk.generated = true;
  chunk.dirty = true;
  chunk.version = 1;
  chunk.secVersion.fill(1);
  if (opts.sections === 'all') {
    for (let si = 0; si < CITY_SURFACE_SECTION; si++) {
      const d = deepSection(s, plan, cx, cz, si);
      chunk.setSection(si, d.blocks, d.uniform);
    }
  }
  if (opts.light !== false) computeChunkLight(chunk);
  return chunk;
}

/* ------------------------------------------------------------------------------------------------
 * Derin kesitler (y<0)
 * ---------------------------------------------------------------------------------------------- */
const SB = new Uint8Array(4096);

function deepSection(s, plan, cx, cz, si) {
  const y0 = WORLD_Y_MIN + si * SECTION_H;
  SB.fill(ID.STONE);
  const w = new CityWriter(SB, cx * CS, cz * CS, y0, SECTION_H);
  emitUnderground(w, plan);
  emitUndergroundContent(w, plan);
  if (y0 <= WORLD_Y_MIN + 4) {
    const x0 = cx * CS;
    const z0 = cz * CS;
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) {
        const top = bedrockTopY(s, x0 + lx, z0 + lz);
        const col = (lz << 4) + lx;
        for (let ly = 0; ly < SECTION_H; ly++) {
          if (y0 + ly > top) break;
          SB[(ly << 8) + col] = B.BEDROCK;
        }
      }
    }
  }
  const v = SB[0];
  for (let i = 1; i < 4096; i++) {
    if (SB[i] !== v) return { blocks: SB.slice(), uniform: 0 };
  }
  return { blocks: null, uniform: v };
}

/**
 * Tek kesit üretir. Derin kesitler (si < 25) bağımsız; yüzey bandı kesitleri chunk üretiminden alınır (worldgen.generateSection ile aynı sözleşme).
 * Döner {blocks: Uint8Array(4096) (sahiplik çağırana) | null, uniform}.
 */
export function generateCitySection(seed, cx, cz, si, opts = {}) {
  const s = toSeedInt(seed);
  if (si >= 0 && si < CITY_SURFACE_SECTION) {
    noteSeed(s);
    return deepSection(s, getCityPlan(s), cx, cz, si);
  }
  const c = generateCityChunk(s, cx, cz, Object.assign({}, opts, { light: false, sections: undefined }));
  if (si < 0 || si >= c.sectionCount || c.secGen[si] === 0) return { blocks: null, uniform: 0 };
  if (c.secBlocks[si] === null) return { blocks: null, uniform: c.secUniform[si] };
  return { blocks: c.secBlocks[si], uniform: 0 };
}
