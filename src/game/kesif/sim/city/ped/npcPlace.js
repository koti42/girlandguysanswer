/*
 * KEŞİF sim/city/ped — SOKAK NPC YERLEŞİMİ (npc_vendors). SAF, belirlenimci (yalnız POI listesi + tohum; Math.random yok), önbellekli.
 *
 *   placeStreetNpcs(seed, pois?) → [{id, x, y, z, yaw, poi, anchor}]       ham yerler (POI + kayma; boşluk denetimi YOK). Çözülemeyen NPC atlanır.
 *   findFreeSpot(probe, x, y, z, opts?) → {x,y,z} | null                    spiral arama: ayak hücresi + baş hücresi boş, zemin katı
 *       probe: {getBlock(x,y,z), isBlocked?(x,y,z,w,h) (ColliderIndex/diğer NPC)}   opts: {maxR (6), step (0.5)}
 *   adjustSpots(probe, spots, opts?) → spots[]                              her yeri sırayla boşluğa oturtur; aralarında ≥ 1,6 m bırakır
 *   ownerSpot(seed, ownerId) → {id,x,y,z,yaw,room,lot,station} | null        sahibin duracağı yer = iç mekân planının `ownerPost`u (yaw: figür yaw'ı); station: kendi prop'u (robot doktor,
 *       onarım/kurye tezgâhı) olan sahip → figür yok (prop zaten NPC'dir)         ownerLotCenter(seed, ownerId) → {x,z} | null (ucuz; etkinleştirme mesafesi için)
 *   ownerSpots(seed) → [ownerSpot…] (null olmayanlar)     OWNER_STATION_KINDS
 *   facingYaw(fromX, fromZ, toX, toZ) → yaw (0 = −z'ye bakar; ileri = (−sin yaw, −cos yaw))
 * Çıpa türleri (npcData.A): terminal(k) · rental(k) · courier(k) · stall(sıra; Pazar terminaline yakınlık + ≥9 m aralık) · race(id) · garage(near) · photo(n) · near(npc).
 */
import { collisionBoxes, isSolid } from '../../blocks.js';
import {
  getCityPlan, getLot, planBuilding, pois as cityPois, surface,
} from '../cityPlan.js';
import { planInterior } from '../interior/index.js';
import { SURF } from '../cityRoads.js';
import { OWNER_NPCS, STREET_NPCS } from './npcData.js';

const MIN_SEP = 1.6;
const WALKABLE = Object.freeze([SURF.SIDEWALK, SURF.PLAZA, SURF.GROUND, SURF.PARK, SURF.QUAY]);
const isWalkSurf = (sf) => WALKABLE.indexOf(sf) >= 0;

/** Yol (asfalt/şerit/zebra) üstündeki yeri en yakın kaldırım/meydan hücresine taşır (≤16 blok); bulunamazsa olduğu gibi bırakır. */
function offRoad(seed, x, z) {
  if (isWalkSurf(surface(seed, x, z))) return [x, z];
  for (let r = 1; r <= 16; r++) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = Math.floor(x + Math.cos(a) * r) + 0.5;
      const pz = Math.floor(z + Math.sin(a) * r) + 0.5;
      if (isWalkSurf(surface(seed, px, pz))) return [px, pz];
    }
  }
  return [x, z];
}
const STALL_SEP = 9;

export function facingYaw(fx, fz, tx, tz) {
  const dx = tx - fx;
  const dz = tz - fz;
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return Math.atan2(-dx, -dz);
}

const cache = new Map();

function byType(list, type) {
  return list.filter((p) => p.type === type);
}

function dist2(a, x, z) {
  return (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z);
}

/** Pazar tezgâhları: verilen terminale yakınlık sırası, greedy ≥9 m aralık. */
function pickStalls(list, near, count) {
  const stalls = list.filter((p) => p.type === 'vendor' && p.stall);
  const t = list.find((p) => p.type === 'portal_terminal' && p.terminal === near);
  if (!t) return [];
  stalls.sort((a, b) => dist2(a, t.x, t.z) - dist2(b, t.x, t.z) || a.id - b.id);
  const out = [];
  for (let i = 0; i < stalls.length && out.length < count; i++) {
    const s = stalls[i];
    let ok = true;
    for (let j = 0; j < out.length && ok; j++) if (dist2(out[j], s.x, s.z) < STALL_SEP * STALL_SEP) ok = false;
    if (ok) out.push(s);
  }
  return out;
}

function resolvePoi(list, a, stallCache) {
  switch (a.t) {
    case 'terminal': return list.find((p) => p.type === 'portal_terminal' && p.terminal === a.k) || null;
    case 'rental': return list.find((p) => p.type === 'rental' && p.terminal === a.k) || null;
    case 'courier': return list.find((p) => p.type === 'courier_desk' && p.terminal === a.k) || null;
    case 'race': return list.find((p) => p.type === 'race_gate' && p.raceId === a.id) || null;
    case 'photo': return byType(list, 'photo_spot')[a.nth] || null;
    case 'garage': {
      const t = list.find((p) => p.type === 'portal_terminal' && p.terminal === a.near);
      if (!t) return null;
      const g = list.filter((p) => p.type === 'garage' && !p.owner);
      g.sort((x, y) => dist2(x, t.x, t.z) - dist2(y, t.x, t.z) || x.id - y.id);
      return g[0] || null;
    }
    case 'stall': {
      if (!stallCache.list) stallCache.list = pickStalls(list, a.near, 8);
      return stallCache.list[a.pick] || null;
    }
    default: return null;
  }
}

/** Ham yerleşim (POI + kayma + bakış). Sonuç tohum başına önbelleklenir (donmuş). */
export function placeStreetNpcs(seed, poiList) {
  const key = seed | 0;
  if (!poiList && cache.has(key)) return cache.get(key);
  const list = poiList || cityPois(key);
  const stallCache = {};
  const out = [];
  const by = {};
  const later = [];
  STREET_NPCS.forEach((n) => {
    const a = n.anchor;
    if (!a) return;
    if (a.t === 'near') { later.push(n); return; }
    const poi = resolvePoi(list, a, stallCache);
    if (!poi) return;
    const p0 = offRoad(key, poi.x + a.off[0], poi.z + a.off[1]);
    const x = p0[0];
    const z = p0[1];
    const rec = {
      id: n.id, x, y: poi.y, z, yaw: facingYaw(x, z, poi.x, poi.z), poi: poi.id, anchor: a.t,
    };
    out.push(rec);
    by[n.id] = rec;
  });
  later.forEach((n) => {
    const base = by[n.anchor.npc];
    if (!base) return;
    const p0 = offRoad(key, base.x + n.anchor.off[0], base.z + n.anchor.off[1]);
    const x = p0[0];
    const z = p0[1];
    out.push({
      id: n.id, x, y: base.y, z, yaw: facingYaw(x, z, base.x, base.z), poi: base.poi, anchor: 'near',
    });
  });
  const res = Object.freeze(out.map((r) => Object.freeze(r)));
  if (!poiList) {
    if (cache.size >= 6) cache.delete(cache.keys().next().value);
    cache.set(key, res);
  }
  return res;
}

export function clearPlaceCache() {
  cache.clear();
}

/* ---------------------------------------------------------------------------------------------- boşluk araması */
const TOP = new Float32Array(256);
for (let id = 0; id < 256; id++) {
  if (!isSolid(id)) continue;
  let t = 0;
  const boxes = collisionBoxes(id) || [];
  for (let i = 0; i < boxes.length; i++) if (boxes[i][4] > t) t = boxes[i][4];
  TOP[id] = t > 0 ? t : 1;
}
const topOf = (id) => TOP[id & 255];

/**
 * Ayakta durulacak yükseklik (≥ gy−0,5): ayak hücresi boş + altı katı ise zemin üstü; ayak hücresinde yarım blok (plaka) varsa üstü (gy+0,5);
 * tam blok ya da baş boşluğu yoksa null. 1,8 m boy için ayak ve baş hücresi geçilebilir olmalı.
 */
export function standHeight(probe, x, y, z) {
  const gx = Math.floor(x);
  const gz = Math.floor(z);
  const gy = Math.floor(y);
  const t0 = topOf(probe.getBlock(gx, gy, gz));
  if (t0 > 0.5) return null;
  if (t0 > 0) {
    if (topOf(probe.getBlock(gx, gy + 1, gz)) > 0 || topOf(probe.getBlock(gx, gy + 2, gz)) > 0) return null;
    return gy + t0;
  }
  const tm = topOf(probe.getBlock(gx, gy - 1, gz));
  if (tm <= 0) return null;
  if (topOf(probe.getBlock(gx, gy + 1, gz)) > 0) return null;
  return gy - 1 + tm;
}

function okSpot(probe, x, y, z) {
  const sy = standHeight(probe, x, y, z);
  if (sy === null) return null;
  if (probe.isBlocked && probe.isBlocked(x, sy, z, 0.6, 1.8)) return null;
  return sy;
}

export function findFreeSpot(probe, x, y, z, opts) {
  const o = opts || {};
  const maxR = o.maxR === undefined ? 6 : o.maxR;
  const step = o.step || 0.5;
  const cx = Math.floor(x) + 0.5;
  const cz = Math.floor(z) + 0.5;
  const yy = Math.floor(y);
  const y0 = okSpot(probe, cx, yy, cz);
  if (y0 !== null) return { x: cx, y: y0, z: cz };
  for (let r = step; r <= maxR + 1e-9; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.floor(cx + Math.cos(a) * r) + 0.5;
      const pz = Math.floor(cz + Math.sin(a) * r) + 0.5;
      const yr = okSpot(probe, px, yy, pz);
      if (yr !== null) return { x: px, y: yr, z: pz };
    }
  }
  return null;
}

/** Her yeri sırayla boşluğa oturtur; öncekilerle ≥ MIN_SEP. Bulunamayan yer atılır. Girdi değişmez. */
export function adjustSpots(probe, spots, opts) {
  const placed = [];
  spots.forEach((s) => {
    const near = (px, pz) => placed.some((q) => (q.x - px) * (q.x - px) + (q.z - pz) * (q.z - pz) < MIN_SEP * MIN_SEP);
    const wrapped = {
      getBlock: probe.getBlock,
      isBlocked: (px, py, pz, w, h) => near(px, pz) || (probe.isBlocked ? probe.isBlocked(px, py, pz, w, h) : false),
    };
    const f = findFreeSpot(wrapped, s.x, s.y, s.z, opts);
    if (!f) return;
    placed.push(Object.assign({}, s, { x: f.x, y: f.y, z: f.z }));
  });
  return placed;
}

/* ---------------------------------------------------------------------------------------------- sahipler (iç mekân) */
/** Kendi etkileşimli propu (dialog) olan iç mekân kökleri: o sahipler için figür çizilmez. Test: yalnız dr_bolt, cikrik, sule. */
export const OWNER_STATION_KINDS = Object.freeze(['robot_doktor_istasyonu', 'servo_tezgahi', 'kurye_tezgahi']);
const PROP_FX = [0, 1, 0, -1];
const PROP_FZ = [1, 0, -1, 0];
const ownerCache = new Map();

export function ownerLotCenter(seed, ownerId) {
  const rec = getCityPlan(seed | 0).owners.get(ownerId);
  if (!rec) return null;
  const lot = getLot(seed | 0, rec.lotId);
  if (!lot) return null;
  return { x: (lot.x0 + lot.x1) / 2, z: (lot.z0 + lot.z1) / 2 };
}

export function ownerSpot(seed, ownerId) {
  const key = (seed | 0) + ':' + ownerId;
  if (ownerCache.has(key)) return ownerCache.get(key);
  let out = null;
  try {
    const rec = getCityPlan(seed | 0).owners.get(ownerId);
    const lot = rec ? getLot(seed | 0, rec.lotId) : null;
    const bp = lot ? planBuilding(seed | 0, lot) : null;
    const it = bp ? planInterior(bp, lot) : null;
    const post = it ? it.ownerPost : null;
    if (post && Number.isFinite(post.x + post.y + post.z)) {
      const k = (post.yaw | 0) & 3;
      out = Object.freeze({
        id: ownerId,
        x: post.x,
        y: post.y,
        z: post.z,
        yaw: Math.atan2(-PROP_FX[k], -PROP_FZ[k]),
        propYaw: k,
        room: post.room || '',
        lot: rec.lotId,
        station: (it.props || []).some((p) => OWNER_STATION_KINDS.indexOf(p.kind) >= 0),
      });
    }
  } catch {
    out = null;
  }
  if (ownerCache.size >= 64) ownerCache.delete(ownerCache.keys().next().value);
  ownerCache.set(key, out);
  return out;
}

export function ownerSpots(seed) {
  const out = [];
  OWNER_NPCS.forEach((o) => {
    const s = ownerSpot(seed, o.id);
    if (s) out.push(s);
  });
  return out;
}

export function clearOwnerCache() {
  ownerCache.clear();
}
