/*
 * KEŞİF sim/city — NEON MERİDYEN ŞEHİR PLANI (cephe API). Saf, belirlenimci (yalnız subHash akışları), önbellekli, worker-güvenli.
 * Sözleşme: KESIF_CITY_CONTRACT §1.2–1.4, §7. Girdi `seed` = dimSeed(worldSeed,'neon') (şehir dünyasının tohumu).
 *
 * ── API (hepsi bu dosyadan) ──────────────────────────────────────────────────────────────────────────────────────────
 *  getCityPlan(seed) → CityPlan   (≤40 ms, LRU 6)
 *      {seed, bounds:{land:730,world:800}, districts, roads, intersections, terminals[16], races[8], roofRoutes[8], underground, hill,
 *       skyline[≤600] (tembel), lotsIndex, owners (Map ownerId→{lotId,bi,bj,k,archetype,interior}), canal, plaza, blocks, edge}
 *       districts : {sites, districtAt(x,z)→key, districtIdx}      roads : cityRoads.buildRoadLayout sonucu (surfaceAt(roads,x,z) …)
 *       terminals[i] : {index,x,y,z,facing(0..3),yaw,kind:'plaza'|'district'|'ring'|'terrace',district,districtId,bi,bj,i?,j?}
 *           0 Kapı Meydanı (0,64,0) · 1–6 bölge merkezleri (DISTRICT_KEYS sırası) · 7–14 Çevreyolu kavşakları (K,KD,D,GD,G,GB,B,KB) · 15 Tepe Terası (y112)
 *  getBlockPlan(seed, bi, bj) → blok planı (cityBlocks)       LRU 96, soğuk ≤4 ms.   bi,bj ∈ [-10,9]; blok = [bi·80,(bi+1)·80)×[bj·80,…)
 *  planBuilding(seed, lotOrId) → BuildingPlan (buildingPlan)  LRU 256
 *  roadNet(seed) / walkNet(seed)                              (roadNet.js)
 *  pois(seed) → [{id,type,x,y,z,yaw,districtId,…}]            (cityPois.js; tembel + önbellekli)
 *  isNoBuild(seed,x,y,z) · isNaturalFill(seed,x,y,z) · cityZoneAt(seed,x,y,z)→{building,room:null}|null     O(1) (x,y,z tamsayı hücre)
 *  districtAt(seed,x,z,y?) (y<60 → 'alt_sehir') · safeAt(seed,x,z,y?) · surface(seed,x,z) → SURF.* · groundY(seed,x,z) (tepe/tünel dahil ayak seviyesi)
 *  getLot(seed,id) · lotAt(seed,x,z) · lotsInRect(seed,x0,z0,x1,z1) · clearCityPlanCaches()
 *
 * ── cityemit (chunk yazıcısı) için ───────────────────────────────────────────────────────────────────────────────────
 *  Koordinatlar: dünya bloğu; x doğu, z güney (kuzey −z); "y" = AYAK SEVİYESİ (sokak 64 → asfalt bloğu y=63). Izgara/kanal/meydan geometrisi tohumdan bağımsız, bölgeler/kesikler/parseller `seed`ten türer.
 *  Yüzey sütunu:  cityRoads.surfaceAt(plan.roads,x,z) → SURF.* (SURF_BLOCK: 223 asfalt, 224/225 şerit x/z, 226/227 zebra x/z, 228 kaldırım; PLAZA/PARK/QUAY/GROUND
 *      malzemesini yazıcı seçer; WATER kanal; EDGE kara dışı). bridgeAt (köprü tabliyesi y64, altı su), tunnelAt (0/1 açık hendek/2 kapalı rampa/3 düz) ve
 *      roadYAt (tünel yol y'si) cityRoads'tadır; kapalı tünel (r≤60) üstü SURF.PLAZA'dır (güverte y64). Kanal ekseni z=560+30·sin(x/130) (j=6 Çevreyolu z=480
 *      ile çakıştığı için sözleşmedeki ≈480 yerine 560).
 *  Binalar:  lotsInRect(seed,…) → parseller; planBuilding(seed,lot) → tiers[] (iç içe kademeler, parça=part), doors[], volumes[] (iç hacim rezervi),
 *      core[], bridges[], roof, style; cephe hücresi için buildingFacade.facadeBlock(style, face, floor, bay, relY, cell, isTop). Kat 4 blok: relY0 döşeme
 *      (y=63+4f), 1–3 hava; zirve ≤ y300, anten ≤ y340. Gökdelen iç katları kapalı ofis (volumes.role 'ofis_kapali': sızıntı yok).
 *  Yeraltı:  plan.underground (kanalizasyon, metro+istasyon girişleri, 12 lab, kasa) ve cityUndergroundPlan.engineeredAt (isNaturalFill = y≤60 ∧ ¬engineered).
 *  Tepe terası: plan.hill (4 teras + 4 basamak şeridi); yüzey y'si cityHill.hillSurfaceY. Proplar: getBlockPlan → props/streetFurniture (+ lamps: blok olarak yazılır).
 */
import { UNDERGROUND_KEY, buildDistricts, safeAt as safeAtPlan } from './cityDistricts.js';
import { ARCHETYPES, DISTRICTS } from './archetypes.js';
import { buildHill, hillSurfaceY } from './cityHill.js';
import { buildBlockPlan } from './cityBlocks.js';
import { buildRaces, buildRoofRoutes, raceTemplates } from './cityRaces.js';
import {
  CANAL, GRID, GRID_N, GROUND_Y, LAND, PLAZA, SURF, WORLD_HALF, assignBlocks, blockRect, bridgeAt, buildRoadLayout, hasRow, junctionLights, nodeId,
  nodeY, roadYAt, stationLattice, surfaceAt, tunnelAt,
} from './cityRoads.js';
import {
  allLots, footprintOf, layoutBlock, lotAt as lotAtPlan, lotById, newLotCaches, ownerMap,
} from './cityLots.js';
import { planBuilding as planBuildingPlan } from './buildingPlan.js';
import { buildUnderground, engineeredAt, stationEntrance } from './cityUndergroundPlan.js';
import { buildPois } from './cityPois.js';
import { Lru, TAG, sh } from './cityPlanKit.js';
import { roadNet, walkNet } from './roadNet.js';

export { roadNet, walkNet };

const PLAN_CACHE = new Lru(6);
const MAX_SKYLINE = 600;

/* ------------------------------------------------------------------------------------------------
 * Terminaller (16)
 * ---------------------------------------------------------------------------------------------- */
/** Bakış yönü indeksi (0 K, 1 D, 2 G, 3 B): (dx,dz) vektörüne en yakın eksen. */
function facingOf(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}
const YAW_RAD = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const COMPASS = Object.freeze([[0, -6], [6, -6], [6, 0], [6, 6], [0, 6], [-6, 6], [-6, 0], [-6, -6]]);

function buildTerminals(plan) {
  const ts = [];
  const push = (t) => {
    t.index = ts.length;
    t.yaw = YAW_RAD[t.facing];
    t.districtId = DISTRICTS[t.district].idx;
    ts.push(t);
  };
  // 0 Kapı Meydanı: (0,64,0), güneye (+z) bakar (varış noktası terminalin 2 blok güneyindedir)
  push({
    x: 0, y: 64, z: 0, facing: 2, kind: 'plaza', district: 'merkez', bi: 0, bj: 0,
  });
  for (let k = 0; k < 6; k++) {
    const dp = plan.roads.blocks.dplaza[k];
    const x = dp.bi * GRID + 40;
    const z = dp.bj * GRID + 40;
    push({
      x, y: 64, z, facing: facingOf(-x, -z), kind: 'district', district: dp.district, bi: dp.bi, bj: dp.bj,
    });
  }
  for (let c = 0; c < 8; c++) {
    const i = COMPASS[c][0];
    const j = COMPASS[c][1];
    const cx = i * GRID;
    const cz = j * GRID;
    // orijine en yakın köşe karesinin orta hücresi (3×3 köşede orta = asfalttan 1,5 uzak → ±8,5)
    const sx = cx > 0 ? -1 : 1;
    const sz = cz > 0 ? -1 : 1;
    const x = cx + sx * 8.5;
    const z = cz + sz * 8.5;
    push({
      x, y: 64, z, facing: facingOf(-sx, -sz) === 0 || facingOf(-sx, -sz) === 2 ? (sz > 0 ? 0 : 2) : (sx > 0 ? 3 : 1), kind: 'ring',
      district: plan.districts.districtAt(x, z), bi: Math.floor(x / GRID), bj: Math.floor(z / GRID), i, j,
    });
  }
  const top = plan.hill.top;
  push({
    x: top.x, y: top.y, z: top.z, facing: 2, kind: 'terrace', district: 'tepe', bi: plan.roads.blocks.hill.bi, bj: plan.roads.blocks.hill.bj,
  });
  return ts;
}

/* ------------------------------------------------------------------------------------------------
 * Plan kurulumu
 * ---------------------------------------------------------------------------------------------- */
function buildIntersections(plan) {
  const out = [];
  const R = plan.roads;
  for (let j = -GRID_N; j <= GRID_N; j++) {
    if (!hasRow(j)) continue;
    for (let i = -GRID_N; i <= GRID_N; i++) {
      const id = nodeId(i, j);
      const arms = R.arms[id];
      let n = 0;
      for (let b = arms; b; b &= b - 1) n++;
      if (n < 3) continue;
      const jl = junctionLights(R, i, j);
      out.push({
        id, i, j, x: i * GRID, y: nodeY(i, j), z: j * GRID, type: jl.type, arms,
        lights: jl.lights.map((l) => ({ x: l.x, y: l.y, z: l.z, dir: l.dir })), phase0: sh(plan.seed, id, TAG.P_PHASE) % 27, cycle: 27,
      });
    }
  }
  return out;
}

function fillStations(plan) {
  const st = plan.underground.metro.stations;
  const S = stationLattice();
  for (let s = 0; s < S.length; s++) {
    const i = S[s][0];
    const j = S[s][1];
    for (let a = -1; a <= 0; a++) {
      for (let b = -1; b <= 0; b++) {
        const lay = layoutBlock(plan, i + a, j + b);
        for (let q = 0; q < lay.lots.length; q++) {
          const lot = lay.lots[q];
          if (lot.station && lot.station.id === s) st[s].entrances.push(stationEntrance(st[s], lot));
        }
      }
    }
  }
}

function buildPlan(seed) {
  const s32 = seed | 0;
  const plan = { seed: s32, version: 1, bounds: { land: LAND, world: WORLD_HALF }, canal: CANAL, plaza: PLAZA };
  plan.districts = buildDistricts(s32);
  const blocks = assignBlocks(s32, plan.districts);
  plan.blocks = blocks;
  plan.raceTemplates = raceTemplates(s32, plan.districts);
  plan.roads = buildRoadLayout(s32, blocks, plan.raceTemplates.protect);
  const caches = newLotCaches();
  plan._base = caches.base;
  plan._layout = caches.layout;
  plan._bplans = new Lru(256);
  plan._blockPlans = new Lru(96);
  const hb = blocks.hill;
  plan.hill = buildHill(blockRect(hb.bi, hb.bj), hb.bi, hb.bj);
  plan.intersections = buildIntersections(plan);
  plan.terminals = buildTerminals(plan);
  plan.underground = buildUnderground(plan);
  fillStations(plan);
  plan.owners = ownerMap(plan);
  plan.races = buildRaces(plan);
  plan.roofRoutes = buildRoofRoutes(plan);
  plan.edge = Object.freeze({ inner: LAND, outer: WORLD_HALF, sea: ['e', 's'], cliff: ['n', 'w'] });
  plan.lotsIndex = {
    blockPlan: (bi, bj) => getBlockPlanOf(plan, bi, bj),
    layout: (bi, bj) => layoutBlock(plan, bi, bj),
    lotAt: (x, z) => lotAtPlan(plan, x, z),
    lotById: (id) => lotById(plan, id),
    all: () => allLots(plan),
  };
  Object.defineProperty(plan, 'skyline', {
    enumerable: true,
    configurable: true,
    get() {
      const v = buildSkyline(plan);
      Object.defineProperty(plan, 'skyline', { value: v, enumerable: true, configurable: true, writable: true });
      return v;
    },
  });
  plan.pois = null;
  return plan;
}

function buildSkyline(plan) {
  const lots = allLots(plan);
  const cand = [];
  for (let q = 0; q < lots.length; q++) {
    const l = lots[q];
    const A0 = ARCHETYPES[l.archetype];
    if (!A0.building || A0.special || l.floors < 2) continue;
    const fp = footprintOf(l);
    const lift = l.roof ? l.roof.lift : 0;
    cand.push({
      id: l.id, x0: fp.x0, z0: fp.z0, w: fp.x1 - fp.x0, d: fp.z1 - fp.z0, h: l.floors * 4 + lift, y0: 64, district: DISTRICTS[l.district].idx,
      tower: A0.tower ? 1 : 0, key: sh(plan.seed, l.id, TAG.SKY),
    });
  }
  cand.sort((a, b) => b.h - a.h || a.key - b.key);
  return cand.slice(0, MAX_SKYLINE).map((c) => ({
    id: c.id, cx: c.x0 + c.w / 2, cz: c.z0 + c.d / 2, x0: c.x0, z0: c.z0, w: c.w, d: c.d, h: c.h, y0: c.y0, top: c.y0 + c.h, hue: c.district, seed: c.id,
    district: c.district, tower: c.tower,
  }));
}

export function getCityPlan(seed) {
  const key = seed >>> 0;
  let p = PLAN_CACHE.get(key);
  if (!p) p = PLAN_CACHE.set(key, buildPlan(seed));
  return p;
}

export function clearCityPlanCaches() {
  PLAN_CACHE.clear();
}

function getBlockPlanOf(plan, bi, bj) {
  const key = (bj + 10) * 20 + (bi + 10);
  let bp = plan._blockPlans.get(key);
  if (!bp) bp = plan._blockPlans.set(key, buildBlockPlan(plan, bi, bj));
  return bp;
}

export function getBlockPlan(seed, bi, bj) {
  if (bi < -10 || bi > 9 || bj < -10 || bj > 9) return null;
  return getBlockPlanOf(getCityPlan(seed), bi, bj);
}

export function planBuilding(seed, lotOrId) {
  const plan = getCityPlan(seed);
  const lot = typeof lotOrId === 'number' ? lotById(plan, lotOrId) : lotOrId;
  if (!lot) return null;
  return planBuildingPlan(plan, lot);
}

export function pois(seed) {
  const plan = getCityPlan(seed);
  if (!plan.pois) plan.pois = buildPois(plan);
  return plan.pois;
}

export function getLot(seed, id) {
  return lotById(getCityPlan(seed), id);
}

export function lotAt(seed, x, z) {
  return lotAtPlan(getCityPlan(seed), Math.floor(x), Math.floor(z));
}

/** Bölge anahtarı; y verilir ve y<60 ise yeraltı katmanı 'alt_sehir'. */
export function districtAt(seed, x, z, y) {
  if (y !== undefined && y !== null && y < 60) return UNDERGROUND_KEY;
  return getCityPlan(seed).districts.districtAt(x, z);
}

/** [x0,x1)×[z0,z1) dikdörtgeniyle kesişen parseller (bloklar bi,bj sırasıyla; chunk üreticisi için). */
export function lotsInRect(seed, x0, z0, x1, z1) {
  const plan = getCityPlan(seed);
  const out = [];
  const bi0 = Math.max(-9, Math.floor(x0 / GRID));
  const bi1 = Math.min(8, Math.floor((x1 - 1) / GRID));
  const bj0 = Math.max(-9, Math.floor(z0 / GRID));
  const bj1 = Math.min(8, Math.floor((z1 - 1) / GRID));
  for (let bj = bj0; bj <= bj1; bj++) {
    for (let bi = bi0; bi <= bi1; bi++) {
      const lots = layoutBlock(plan, bi, bj).lots;
      for (let q = 0; q < lots.length; q++) {
        const l = lots[q];
        if (l.x0 < x1 && l.x1 > x0 && l.z0 < z1 && l.z1 > z0) out.push(l);
      }
    }
  }
  return out;
}

export function safeAt(seed, x, z, y) {
  return safeAtPlan(getCityPlan(seed), x, z, y);
}

export function surface(seed, x, z) {
  return surfaceAt(getCityPlan(seed).roads, Math.floor(x), Math.floor(z));
}

/** Zemin (ayak) seviyesi: sokak/lot 64; tepe terasları ve basamaklar; tünel yol y'si; kanal tabanı 44. */
export function groundY(seed, x, z) {
  const plan = getCityPlan(seed);
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const hb = plan.hill;
  if (cx >= hb.rect.x0 && cx < hb.rect.x1 && cz >= hb.rect.z0 && cz < hb.rect.z1) return hillSurfaceY(hb, cx, cz);
  const ry = roadYAt(plan.roads, cx, cz);
  if (ry === ry) return ry;
  if (surfaceAt(plan.roads, cx, cz) === SURF.WATER) return CANAL.floorY;
  return GROUND_Y;
}

/* ------------------------------------------------------------------------------------------------
 * Kanca sorguları (O(1)) — cityemit isNaturalFill / isNoBuild / cityZoneAt bunları sarar
 * ---------------------------------------------------------------------------------------------- */
export function planZoneAt(plan, x, y, z) {
  const lot = lotAtPlan(plan, x, z);
  if (!lot || lot.hill) return null;
  const A0 = ARCHETYPES[lot.archetype];
  if (!A0 || !A0.building) return null;
  const fp = footprintOf(lot);
  if (!fp || x < fp.x0 || x >= fp.x1 || z < fp.z0 || z >= fp.z1) return null;
  const top = 64 + 4 * lot.floors + (lot.roof ? lot.roof.lift : 0) + 1;
  if (y < 64 || y > top) return null;
  return { building: lot.id, room: null };
}

function doorApronHit(plan, x, y, z) {
  if (y < 64 || y > 67) return false;
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > 3) continue;
      const lot = lotAtPlan(plan, x + dx, z + dz);
      if (!lot || !lot.door) continue;
      const d = lot.door;
      const f = d.face;
      // kapı önü 3 geniş × 2 derin
      const along = d.axis === 'x';
      const fx = d.front.x;
      const fz = d.front.z;
      const vx = f === 'e' ? 1 : f === 'w' ? -1 : 0;
      const vz = f === 's' ? 1 : f === 'n' ? -1 : 0;
      for (let dep = 0; dep < 2; dep++) {
        for (let w = -1; w <= 1; w++) {
          const px = fx + vx * dep + (along ? w : 0);
          const pz = fz + vz * dep + (along ? 0 : w);
          if (px === x && pz === z) return true;
        }
      }
    }
  }
  return false;
}

export function planIsNoBuild(plan, x, y, z) {
  const R = plan.roads;
  // Kapı Meydanı (33×33 + kenar): tüm yükseklik
  if (x >= -17 && x < 17 && z >= -17 && z < 17 && y >= 56 && y <= 90) return true;
  // yol koridoru y64..68, tünel/hendek, köprü
  if (y >= 56 && y <= 68) {
    const t = tunnelAt(R, x, z);
    if (t > 0) return true;
  }
  if (y >= 64 && y <= 68) {
    const s = surfaceAt(R, x, z);
    if (s >= SURF.ASPHALT && s <= SURF.QUAY && s !== SURF.WATER) return true;
    if (s === SURF.WATER && bridgeAt(R, x, z)) return true;
    if (bridgeAt(R, x, z)) return true;
  }
  // bina iç hacmi
  if (planZoneAt(plan, x, y, z)) return true;
  // tepe terası gövdesi ve basamaklar
  const hr = plan.hill.rect;
  if (x >= hr.x0 && x < hr.x1 && z >= hr.z0 && z < hr.z1 && y >= 64 && y <= plan.hill.maxY + 4) return true;
  return doorApronHit(plan, x, y, z);
}

export function planIsNaturalFill(plan, x, y, z) {
  if (y > 60) return false;
  return !engineeredAt(plan, x, y, z);
}

export function isNoBuild(seed, x, y, z) {
  return planIsNoBuild(getCityPlan(seed), Math.floor(x), Math.floor(y), Math.floor(z));
}
export function isNaturalFill(seed, x, y, z) {
  return planIsNaturalFill(getCityPlan(seed), Math.floor(x), Math.floor(y), Math.floor(z));
}
export function cityZoneAt(seed, x, y, z) {
  return planZoneAt(getCityPlan(seed), Math.floor(x), Math.floor(y), Math.floor(z));
}

