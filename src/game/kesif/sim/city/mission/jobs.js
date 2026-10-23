/*
 * KEŞİF sim/city/mission — İŞLER: kurye, taksi, kapsül (çok duraklı) teslimat, tamir al-teslim et. SAF, belirlenimci (yalnız subHash), es2020. Aile dostu: şiddet/suç yok;
 * yolcu da paket de zarar görmez (kırılgan paket bile yalnız "kırıldı" sonucu verir, cezası yoktur: yeniden denenir).
 *
 *   TIERS                                  çaylak 150–300 m · usta 300–700 m · efsane 700–1400 m (kırılgan paket)
 *   genJobs(seed, net, board, dayN, deskIdx, near?) → Job[3]      board 'kurye' | 'taksi'; kurye masası = pois(seed) 'courier_desk' sırası (0..6); taksi near {x,z}
 *   Job {id, board, kind:'kurye'|'tamir'|'pod'|'taksi', tier, name, from:{x,y,z,lot}, to:{x,y,z,lot}, stops:[…]|null, dist, route, fragile, passenger, base}
 *   jobId(...) / parseJobId(id) → {board,day,desk,slot,near?}     kayıt anahtarı (≤ 40 karakter, [a-z0-9_]) — etkin görev bu kimlikle yeniden üretilir
 *   jobLimitFor(job, cls) → sn | 0 (0 = süresiz)     canWalk(job) → bool     jobRunDef(job, cls) → run tanımı (run.js)
 *   jobReward(job, timeLeft, limit, decay) → {kredi, items}      repeatDecay(log, nowSec) → çarpan (1 − 0,15·son 10 dk işi, taban 0,4)      pushLog(log, nowSec)
 *   taxiTip(base, bumps) → bahşiş     JOB_NAMES
 * Ödül: (20 + 0,12·mesafe + {0,40,110}) · clamp(0,5 + 0,5·kalanSüre/limit, 0,6, 1) · tekrar bozunumu; araç belgesi §5 aynen.
 */
import { pois } from '../cityPlan.js';
import { JOB_PACKAGES } from '../cityNames.js';
import { jobLimit } from '../vehicle/vehicleBot.js';
import { isVehicleClass } from '../vehicle/vehicleData.js';
import { sh } from '../cityPlanKit.js';
import { JOB_LIMITS, TAG } from './missionData.js';

export const TIERS = Object.freeze([
  Object.freeze({
    key: 'caylak', name: 'Çaylak', min: 150, max: 300, bonus: 0, fragile: false,
  }),
  Object.freeze({
    key: 'usta', name: 'Usta', min: 300, max: 700, bonus: 40, fragile: false,
  }),
  Object.freeze({
    key: 'efsane', name: 'Efsane', min: 700, max: 1400, bonus: 110, fragile: true,
  }),
]);
export const JOB_NAMES = JOB_PACKAGES;
export const DOOR_R = 14; // araçla: kaldırım kenarı kapı önüne ≤ ~12 m (iç şerit + karşı yön)
export const DOOR_R_FOOT = 7.5;
export const PICKUP_R = 12;
export const KINDS = Object.freeze(['kurye', 'tamir', 'pod', 'taksi']);
const BOARD_LETTER = Object.freeze({ kurye: 'k', taksi: 't' });
const ID_RE = /^j([kt])_([0-9]{1,6})_([0-9]{1,2})_([0-2])(?:_([0-9a-z]{1,8}))?$/;
const POI_CACHE = new Map();

/** Araçla ulaşılabilir uç nokta: yol ekseni en çok bu kadar uzakta (DOOR_R içinde kalır, şerit payı bırakır). */
export const ROAD_NEAR = 11;

function poiIndex(seed, net) {
  const key = seed | 0;
  let h = POI_CACHE.get(key);
  if (h) return h;
  const list = pois(key);
  const near = (p) => {
    const n = net.nearest(p.x, p.z);
    return !!n && n.dist <= ROAD_NEAR;
  };
  h = {
    desks: list.filter((p) => p.type === 'courier_desk'),
    doors: list.filter((p) => p.type === 'door' && near(p)),
    shelters: list.filter((p) => p.type === 'shelter' && near(p)),
    garages: list.filter((p) => p.type === 'garage' && near(p)),
  };
  POI_CACHE.set(key, h);
  if (POI_CACHE.size > 3) POI_CACHE.delete(POI_CACHE.keys().next().value);
  return h;
}

export function jobId(board, day, desk, slot, near) {
  return 'j' + BOARD_LETTER[board] + '_' + (day | 0) + '_' + (desk | 0) + '_' + (slot | 0) + (near ? '_' + near : '');
}

export function parseJobId(id) {
  const m = typeof id === 'string' ? ID_RE.exec(id) : null;
  if (!m) return null;
  return {
    board: m[1] === 'k' ? 'kurye' : 'taksi', day: Number(m[2]), desk: Number(m[3]), slot: Number(m[4]), near: m[5] || '',
  };
}

/** Taksi teklifleri yakın duraktan türediği için "yakınlık" anahtarı: 40 blokluk hücre hash'i. */
export function nearKey(x, z) {
  const cx = Math.floor(x / 80) + 20;
  const cz = Math.floor(z / 80) + 20;
  return (cx * 41 + cz).toString(36);
}

function routeLen(net, ax, az, bx, bz) {
  const na = net.nearest(ax, az);
  const nb = net.nearest(bx, bz);
  if (!na || !nb) return -1;
  const r = na.node === nb.node ? [] : net.route(na.node, nb.node);
  if (!r) return -1;
  let len = na.dist + nb.dist;
  for (let i = 0; i < r.length; i++) len += net.edges[r[i]].len;
  return len;
}

function pickFar(seed, pool, from, tier, salt, net, avoidLot) {
  const cand = [];
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (p.lot === avoidLot) continue;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d >= tier.min && d <= tier.max) cand.push({ p, h: sh(seed, p.id, salt) });
  }
  cand.sort((a, b) => a.h - b.h || a.p.id - b.p.id);
  for (let k = 0; k < cand.length && k < 24; k++) {
    const p = cand[k].p;
    const len = routeLen(net, from.x, from.z, p.x, p.z);
    if (len > 0 && len <= Math.hypot(p.x - from.x, p.z - from.z) * 1.9 + 60) return { p, len };
  }
  return null;
}

function pickNear(seed, pool, from, lo, hi, salt, avoidLot) {
  const cand = [];
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (p.lot === avoidLot) continue;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d >= lo && d <= hi) cand.push({ p, h: sh(seed, p.id, salt) });
  }
  cand.sort((a, b) => a.h - b.h || a.p.id - b.p.id);
  return cand.length ? cand[0].p : null;
}

const pt = (p) => ({
  x: p.x, y: 64, z: p.z, lot: p.lot === undefined ? -1 : p.lot,
});

function pkgName(seed, key, slot) {
  return JOB_PACKAGES[sh(seed, key * 7 + slot, TAG.JOB_NAME) % JOB_PACKAGES.length];
}

/**
 * 3 teklif üretir (kurye masasının yaşına göre `dayN`). Bir teklif üretilemezse (olasılık çok düşük) yedek kademeyle aynı yuvada daha yakın çift aranır;
 * her çağrı için null dönen yuva olmaz (test: 200 tohum × 7 masa).
 */
export function genJobs(seedIn, net, board, dayN, deskIdx, near) {
  const seed = seedIn | 0;
  const idx = poiIndex(seed, net);
  const out = [];
  const day = Math.max(0, dayN | 0);
  const desk = idx.desks.length ? idx.desks[((deskIdx | 0) % idx.desks.length + idx.desks.length) % idx.desks.length] : null;
  const origin = board === 'taksi' && near ? near : desk;
  if (!origin) return out;
  const nkey = board === 'taksi' ? nearKey(origin.x, origin.z) : '';
  for (let slot = 0; slot < JOB_LIMITS.offers; slot++) {
    const tier = TIERS[slot];
    const base = (day * 131 + (deskIdx | 0) * 17) | 0;
    const key = base + slot + (board === 'taksi' ? 977 : 0);
    const roll = sh(seed, key, TAG.JOB_TIER) % 100;
    let kind = board === 'taksi' ? 'taksi' : 'kurye';
    if (board === 'kurye') {
      if (slot === 0 && roll < 30) kind = 'tamir';
      else if (slot === 1 && roll < 30) kind = 'pod';
    }
    // başlangıç noktası A
    let A;
    if (board === 'taksi') {
      A = pickNear(seed, idx.shelters.concat(idx.doors), origin, 40, 260 + slot * 120, TAG.TAXI + key, -2);
    } else {
      A = pickNear(seed, idx.doors, origin, 30, 150, TAG.JOB_A + key, -2);
    }
    if (!A) A = idx.doors[sh(seed, key, TAG.JOB_A) % idx.doors.length];
    let job = null;
    if (kind === 'pod') {
      // üç durak: A'dan sırayla 100–260 m ötede
      const stops = [];
      let from = A;
      for (let s = 0; s < 3; s++) {
        const nx = pickNear(seed, idx.doors, from, 110, 260, TAG.POD + key * 3 + s, from.lot);
        if (!nx) break;
        stops.push(nx);
        from = nx;
      }
      if (stops.length === 3) {
        let route = 0;
        let prev = A;
        let ok = true;
        for (let s = 0; s < 3; s++) {
          const l = routeLen(net, prev.x, prev.z, stops[s].x, stops[s].z);
          if (l <= 0) ok = false;
          route += l;
          prev = stops[s];
        }
        if (ok) {
          job = {
            kind, tier: tier.key, from: pt(A), to: pt(stops[2]), stops: stops.map(pt), dist: Math.hypot(stops[2].x - A.x, stops[2].z - A.z) + 200, route, fragile: false,
          };
        }
      }
      if (!job) kind = 'kurye';
    }
    if (!job) {
      const pool = kind === 'tamir' ? idx.garages.concat(idx.doors) : idx.doors;
      const far = pickFar(seed, kind === 'tamir' ? (idx.garages.length ? idx.garages : pool) : pool, A, kind === 'tamir' ? TIERS[0] : tier, TAG.JOB_B + key, net, A.lot);
      let B = far;
      if (!B) {
        // yedek: kademeyi gevşet (en yakın uygun kapı)
        const relaxed = { min: 60, max: tier.max * 1.6 };
        B = pickFar(seed, idx.doors, A, relaxed, TAG.JOB_B + key + 1, net, A.lot);
      }
      if (!B) {
        const alt = idx.doors[(sh(seed, key, TAG.JOB_B) + 7) % idx.doors.length];
        B = { p: alt, len: Math.max(60, routeLen(net, A.x, A.z, alt.x, alt.z)) };
      }
      job = {
        kind,
        tier: kind === 'tamir' ? 'caylak' : tier.key,
        from: pt(A),
        to: pt(B.p),
        stops: null,
        dist: Math.hypot(B.p.x - A.x, B.p.z - A.z),
        route: B.len,
        fragile: kind === 'kurye' && tier.fragile,
      };
    }
    job.id = jobId(board, day, deskIdx, slot, nkey);
    job.board = board;
    job.slot = slot;
    job.name = kind === 'taksi' ? 'Yolcu: ' + passengerName(seed, key) : kind === 'tamir' ? 'Yedek parça' : kind === 'pod' ? 'Kapsül teslimatı' : pkgName(seed, key, slot);
    job.passenger = kind === 'taksi';
    job.base = baseReward(job);
    out.push(Object.freeze(job));
  }
  return out;
}

const PASSENGERS = Object.freeze([
  'Bayan Nehir', 'Küçük Mert', 'Dede Hasan', 'Öğretmen Ayla', 'Turist Pınar', 'Sanatçı Ece', 'Teknisyen Orhan', 'Aşçı Selin',
  'Müzisyen Kaan', 'Bahçıvan Güler', 'Fotoğrafçı Deniz', 'Kütüphaneci Yağız', 'Kurye Melek', 'Çırak Barış', 'Doktor Elif', 'Gezgin Tolga',
]);

export function passengerName(seed, key) {
  return PASSENGERS[sh(seed, key, TAG.PASSENGER) % PASSENGERS.length];
}
export { PASSENGERS };

function tierOf(key) {
  for (let i = 0; i < TIERS.length; i++) if (TIERS[i].key === key) return TIERS[i];
  return TIERS[0];
}

export function baseReward(job) {
  const t = tierOf(job.tier);
  const stops = job.kind === 'pod' ? 1.6 : 1;
  return Math.round((20 + 0.12 * job.dist + t.bonus) * stops);
}

/** Yaya olarak yapılabilir mi? Çaylak kademesi ve tamir işi; taksi ve kapsül araç ister. */
export function canWalk(job) {
  return job.kind === 'tamir' || (job.kind === 'kurye' && job.tier === 'caylak');
}

/** Süre sınırı (sn); araçla routeLen/(0,55·azami hız)+25, yayayla ≥ 1,6× ve yürüme hızına göre; tamir süresiz (0). */
export function jobLimitFor(job, cls) {
  if (job.kind === 'tamir') return 0;
  const c = isVehicleClass(cls) ? cls : 'taksi';
  const car = jobLimit(job.route, c);
  if (!isVehicleClass(cls)) return Math.ceil(Math.max(car * 1.6, (job.route * 1.35) / 4.5 + 30));
  return Math.ceil(car);
}

export function repeatDecay(log, nowSec) {
  const L = Array.isArray(log) ? log : [];
  let n = 0;
  for (let i = 0; i < L.length; i++) if (nowSec - L[i] >= 0 && nowSec - L[i] <= JOB_LIMITS.decayWindow) n++;
  return Math.max(JOB_LIMITS.decayFloor, 1 - JOB_LIMITS.decayStep * n);
}

export function pushLog(log, nowSec) {
  const L = Array.isArray(log) ? log : [];
  L.push(Math.floor(nowSec));
  while (L.length > JOB_LIMITS.logMax) L.shift();
  return L;
}

export function taxiTip(base, bumps) {
  const comfort = Math.max(0, 1 - 0.25 * (bumps | 0));
  return Math.round(base * 0.25 * comfort);
}

/**
 * Ödül: {kredi, items}. timeLeft/limit hız çarpanı (limit 0 → 1), decay tekrar bozunumu. Tamir işi küçük malzeme verir.
 */
export function jobReward(job, timeLeft, limit, decay, bumps) {
  // qa5: düşmanca/bozuk sayılar (NaN, Infinity, metin) ödülü NaN yapmasın: sonlu değilse güvenli varsayılan
  const tl = Number.isFinite(timeLeft) ? timeLeft : 0;
  const lim = Number.isFinite(limit) ? limit : 0;
  const frac = lim > 0 ? Math.max(0, Math.min(1, tl / lim)) : 1;
  const speed = Math.max(0.6, Math.min(1, 0.5 + 0.5 * frac));
  let kredi = job.base * speed * (Number.isFinite(decay) && decay > 0 ? Math.min(1, decay) : 1);
  if (job.kind === 'taksi') kredi += taxiTip(job.base, bumps || 0);
  const items = [];
  if (job.kind === 'tamir') items.push({ item: 'item:bakır_tel', n: 2 });
  return { kredi: Number.isFinite(kredi) ? Math.max(1, Math.round(kredi)) : 1, items };
}

/** Run tanımı (run.js): A'ya git → (yolcu bindir/paket al) → B'ye git. cls: sürülen sınıf | null (yaya). */
export function jobRunDef(job, cls) {
  const limit = jobLimitFor(job, cls);
  const rDoor = isVehicleClass(cls) ? DOOR_R : DOOR_R_FOOT;
  const steps = [];
  const stop = job.kind === 'taksi' ? { maxSpeed: 3.5 } : null;
  const aLabel = job.kind === 'taksi' ? 'Yolcuyu al' : job.kind === 'tamir' ? 'Parçayı al' : 'Paketi al';
  steps.push({
    type: 'goto', label: aLabel, x: job.from.x, y: job.from.y, z: job.from.z, r: job.kind === 'taksi' ? PICKUP_R : rDoor, mode: job.kind === 'taksi' ? 'vehicle' : 'any', ...(stop || {}),
  });
  if (job.kind === 'pod') {
    job.stops.forEach((s, i) => steps.push({
      type: 'goto', label: 'Kapsülü bırak ' + (i + 1) + '/3', x: s.x, y: s.y, z: s.z, r: rDoor, mode: 'any',
    }));
  } else {
    steps.push({
      type: 'goto', label: job.kind === 'taksi' ? 'Yolcuyu bırak' : job.kind === 'tamir' ? 'Parçayı teslim et' : 'Teslim et', x: job.to.x, y: job.to.y, z: job.to.z, r: job.kind === 'taksi' ? PICKUP_R : rDoor, mode: job.kind === 'taksi' ? 'vehicle' : 'any', ...(stop || {}),
    });
  }
  return {
    id: job.id,
    kind: job.kind,
    title: (job.kind === 'taksi' ? 'Taksi' : job.kind === 'tamir' ? 'Tamir' : job.kind === 'pod' ? 'Kapsül' : 'Kurye') + ': ' + job.name,
    steps,
    limit,
    minTime: Math.max(0, Math.floor(job.dist / 60)),
    noTeleport: true,
    fragile: !!job.fragile,
    meta: { tier: job.tier, base: job.base },
  };
}
