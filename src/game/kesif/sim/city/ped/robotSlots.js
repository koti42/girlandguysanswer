/*
 * KEŞİF sim/city/ped — ROBOT DOĞMA YUVALARI (belirlenimci). Saf; three/DOM/Math.random/Date.now yok; worker-güvenli.
 *
 *   robotSlotsForChunk(seed, cx, cz) → Slot[]      yalnızca (şehir tohumu, chunk) → aynı girdi aynı yuvalar; önbellekli
 *       Slot = {id, key, layer:'surface'|'sewer'|'metro'|'lab', x, y, z, yaw, cx, cz}   x,z = tamsayı+0.5, y = AYAK SEVİYESİ (ipucu; gerçek y doğma anında oturtulur)
 *   robotZoneOk(plan, x, z) → bool                 yuva/yürüyüş için GÜVENLİ konum (güvenli bölge/terminal/meydan değil)
 *
 * Güvenlik kuralı (sözleşme §1.25): `cityDistricts.safeAt` (Merkez, Gece Pazarı, Teknoloji Parkı, Tepe + terminal/meydan çevresi 24 blok) olan hiçbir yerde
 * yuva YOKTUR; üstelik yuvanın çevresindeki 8 blokluk halka da güvenli olmalı (dolaşan robot güvenli bölgeye taşmasın). Yeraltı yuvaları da aynı kuralı kullanır
 * (y verilmeden: sağlam taraf) → güvenli bir bölgenin altında robot yoktur. Bina/oda iç hacimleri yüzey yuvası olamaz (planZoneAt).
 * Yüzey: kaldırım/rıhtım/meydan/park/zemin hücreleri (asfalt ve zebra trafik içindir → yok), tünel/tepe terası dışı, y=64.
 * Yeraltı: kanalizasyon koridoru (y31), Mor/Turuncu metro tüneli (y44; istasyon kutuları ve çevresi hariç), laboratuvar odaları (kasa hariç).
 */
import { getCityPlan, planZoneAt } from '../cityPlan.js';
import { lotAt } from '../cityLots.js';
import { safeAt } from '../cityDistricts.js';
import {
  GRID, GRID_N, SURF, hasRow, roadYAt, surfaceAt,
} from '../cityRoads.js';
import { METRO, SEWER } from '../cityUndergroundPlan.js';
import { Lru, sh } from '../cityPlanKit.js';
import { ROBOT_LAYERS, ROBOT_LAYER_WEIGHTS } from './robotData.js';

/** Alt akış etiketleri (cityPlanKit.TAG ile çakışmaz: 0xc00 bandı). */
export const ROBOT_TAGS = Object.freeze({
  ROLL: 0xc01, ROLL2: 0xc02, LAYER: 0xc03, KIND: 0xc04, POSX: 0xc05, POSZ: 0xc06, AXIS: 0xc07, OFF: 0xc08, ROOM: 0xc09, ID: 0xc0a, YAW: 0xc0b, LAYER2: 0xc0c,
});
const T = ROBOT_TAGS;
const INV32 = 1 / 4294967296;
const RING = 8;
const CHUNK = 16;
const P_FIRST = 0.42;
const P_SECOND = 0.12;
const TRIES = 5;
const CACHE = new Lru(2400);

const f01 = (seed, id, tag) => sh(seed, id, tag) * INV32;
const chunkId = (cx, cz) => (cx + 64) * 256 + (cz + 64);

function pickWeighted(list, u) {
  let tot = 0;
  for (let i = 0; i < list.length; i++) tot += list[i][1];
  let r = u * tot;
  for (let i = 0; i < list.length; i++) {
    r -= list[i][1];
    if (r < 0) return list[i][0];
  }
  return list[list.length - 1][0];
}

/** Güvenli konum: nokta + 4 yönde 8 blok güvenli bölge dışında. */
export function robotZoneOk(plan, x, z) {
  if (safeAt(plan, x, z)) return false;
  if (safeAt(plan, x + RING, z) || safeAt(plan, x - RING, z) || safeAt(plan, x, z + RING) || safeAt(plan, x, z - RING)) return false;
  return true;
}

/** Kapı önü (≤4 blok Manhattan): robot kapıyı kapatmasın. */
function nearDoor(plan, x, z) {
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > 4) continue;
      const lot = lotAt(plan, x + dx, z + dz);
      if (!lot || !lot.door) continue;
      const fr = lot.door.front;
      if (Math.abs(fr.x - x) + Math.abs(fr.z - z) <= 4) return true;
    }
  }
  return false;
}

function surfaceOk(plan, x, z) {
  const hr = plan.hill.rect;
  if (x >= hr.x0 - 2 && x < hr.x1 + 2 && z >= hr.z0 - 2 && z < hr.z1 + 2) return false;
  const s = surfaceAt(plan.roads, x, z);
  if (s !== SURF.SIDEWALK && s !== SURF.QUAY && s !== SURF.PLAZA && s !== SURF.PARK && s !== SURF.GROUND) return false;
  const ry = roadYAt(plan.roads, x, z);
  if (ry === ry && ry !== 64) return false; // tünel/rampa yolu
  if (planZoneAt(plan, x, 64, z) !== null || planZoneAt(plan, x, 66, z) !== null) return false; // bina iç hacmi
  return !nearDoor(plan, x, z);
}

function candSurface(plan, seed, id, cx, cz) {
  const x = cx * CHUNK + Math.floor(f01(seed, id, T.POSX) * CHUNK);
  const z = cz * CHUNK + Math.floor(f01(seed, id, T.POSZ) * CHUNK);
  if (!surfaceOk(plan, x, z)) return null;
  return { x, z, y: 64 };
}

function candSewer(plan, seed, id, cx, cz) {
  const mx = cx * CHUNK + CHUNK / 2;
  const mz = cz * CHUNK + CHUNK / 2;
  const opts = [];
  const i = Math.round(mx / GRID);
  if (i >= -GRID_N && i <= GRID_N && Math.abs(i * GRID - mx) <= CHUNK / 2) opts.push(['z', i * GRID]);
  const j = Math.round(mz / GRID);
  if (j >= -GRID_N && j <= GRID_N && hasRow(j) && Math.abs(j * GRID - mz) <= CHUNK / 2) opts.push(['x', j * GRID]);
  if (opts.length === 0) return null;
  const o = opts[Math.floor(f01(seed, id, T.AXIS) * opts.length)];
  const off = Math.floor(f01(seed, id, T.OFF) * 3) - 1; // temiz kesit c−2..c+2: ortada ±1
  let x;
  let z;
  if (o[0] === 'z') {
    x = o[1] + off;
    z = cz * CHUNK + Math.floor(f01(seed, id, T.POSZ) * CHUNK);
  } else {
    z = o[1] + off;
    x = cx * CHUNK + Math.floor(f01(seed, id, T.POSX) * CHUNK);
  }
  if (Math.abs(x) > SEWER.extent - 6 || Math.abs(z) > SEWER.extent - 6) return null;
  if (x < cx * CHUNK || x >= (cx + 1) * CHUNK || z < cz * CHUNK || z >= (cz + 1) * CHUNK) return null;
  return { x, z, y: SEWER.floorY };
}

function candMetro(plan, seed, id, cx, cz) {
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const ext = METRO.lineExt - 8;
  const opts = [];
  if (x0 <= 2 && x0 + CHUNK > -2) opts.push('mor'); // x≈0 boyunca z ekseninde
  if (z0 <= 2 && z0 + CHUNK > -2) opts.push('turuncu'); // z≈0 boyunca x ekseninde
  if (opts.length === 0) return null;
  const line = opts[Math.floor(f01(seed, id, T.AXIS) * opts.length)];
  const off = Math.floor(f01(seed, id, T.OFF) * 5) - 2;
  let x;
  let z;
  if (line === 'mor') {
    x = off;
    z = z0 + Math.floor(f01(seed, id, T.POSZ) * CHUNK);
  } else {
    z = off;
    x = x0 + Math.floor(f01(seed, id, T.POSX) * CHUNK);
  }
  if (x < x0 || x >= x0 + CHUNK || z < z0 || z >= z0 + CHUNK) return null;
  const along = line === 'mor' ? z : x;
  if (Math.abs(along) > ext) return null;
  const sts = plan.underground.metro.stations;
  for (let k = 0; k < sts.length; k++) {
    const s = sts[k];
    const d = line === 'mor' ? Math.abs(z - s.z) : Math.abs(x - s.x);
    const off2 = line === 'mor' ? Math.abs(x - s.x) : Math.abs(z - s.z);
    if (d < METRO.stationLen / 2 + 14 && off2 < 24) return null; // istasyon + giriş bağlantıları
  }
  return { x, z, y: METRO.floorY };
}

function candLab(plan, seed, id, cx, cz) {
  const labs = plan.underground.labs;
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const hit = [];
  for (let a = 0; a < labs.length; a++) {
    const rooms = labs[a].rooms;
    for (let r = 0; r < rooms.length; r++) {
      const q = rooms[r];
      if (q.x0 + 2 < x0 + CHUNK && q.x1 - 2 > x0 && q.z0 + 2 < z0 + CHUNK && q.z1 - 2 > z0) hit.push(q);
    }
  }
  if (hit.length === 0) return null;
  const q = hit[Math.floor(f01(seed, id, T.ROOM) * hit.length)];
  const ax0 = Math.max(q.x0 + 2, x0);
  const ax1 = Math.min(q.x1 - 2, x0 + CHUNK);
  const az0 = Math.max(q.z0 + 2, z0);
  const az1 = Math.min(q.z1 - 2, z0 + CHUNK);
  if (ax1 <= ax0 || az1 <= az0) return null;
  return {
    x: ax0 + Math.floor(f01(seed, id, T.POSX) * (ax1 - ax0)),
    z: az0 + Math.floor(f01(seed, id, T.POSZ) * (az1 - az0)),
    y: q.y0,
  };
}

const CAND = Object.freeze({ surface: candSurface, sewer: candSewer, metro: candMetro, lab: candLab });
const RARE = Object.freeze(['metro', 'lab']);
const RARE_BIAS = 0.7;

function buildChunk(seed, cx, cz) {
  const plan = getCityPlan(seed);
  const cid = chunkId(cx, cz);
  const out = [];
  const n = f01(seed, cid, T.ROLL) < P_FIRST ? (f01(seed, cid, T.ROLL2) < P_SECOND / P_FIRST ? 2 : 1) : 0;
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < TRIES; t++) {
      const id = cid * 64 + k * 8 + t;
      let layer = pickWeighted(ROBOT_LAYER_WEIGHTS, f01(seed, id, T.LAYER));
      let c = null;
      // seyrek katmanlar (metro/laboratuvar): chunk onları barındırıyorsa çoğunlukla orada doğur (yoksa hiç görünmezlerdi)
      const rare = [];
      for (let q = 0; q < RARE.length; q++) {
        const rc = CAND[RARE[q]](plan, seed, id, cx, cz);
        if (rc && robotZoneOk(plan, rc.x + 0.5, rc.z + 0.5)) rare.push([RARE[q], rc]);
      }
      if (rare.length > 0 && f01(seed, id, T.LAYER2) < RARE_BIAS) {
        const pick = rare[Math.floor(f01(seed, id, T.ROOM) * rare.length)];
        layer = pick[0];
        c = pick[1];
      } else c = CAND[layer](plan, seed, id, cx, cz);
      if (!c || !robotZoneOk(plan, c.x + 0.5, c.z + 0.5)) continue;
      const key = pickWeighted(ROBOT_LAYERS[layer], f01(seed, id, T.KIND));
      let dup = false;
      for (let q = 0; q < out.length; q++) if (Math.abs(out[q].x - c.x - 0.5) + Math.abs(out[q].z - c.z - 0.5) < 6) dup = true;
      if (dup) continue;
      out.push(Object.freeze({
        id: sh(seed, id, T.ID) | 0,
        key,
        layer,
        x: c.x + 0.5,
        y: c.y,
        z: c.z + 0.5,
        yaw: Math.round((f01(seed, id, T.YAW) * Math.PI * 2 - Math.PI) * 1000) / 1000,
        cx,
        cz,
      }));
      break;
    }
  }
  return Object.freeze(out);
}

/** (şehir tohumu, chunk) → yuvalar (donmuş dizi; önbellekli). */
export function robotSlotsForChunk(seed, cx, cz) {
  const key = (seed >>> 0) + ':' + cx + ',' + cz;
  let v = CACHE.get(key);
  if (!v) v = CACHE.set(key, buildChunk(seed | 0, cx, cz));
  return v;
}

export function clearRobotSlotCache() {
  CACHE.clear();
}
