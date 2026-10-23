/*
 * KEŞİF sim/city/ped — YAYA ÇEKİRDEĞİ: bağlam, yaya nesnesi, kenar izleme (yönlendirme), engel kaçınma. SAF, tahsissiz sıcak yol, es2020.
 * crowd.js / crowdCross.js / crowdSpots.js / crowdSpawn.js / crowdReact.js bu modülü paylaşır.
 *
 * Hareket modeli: yaya bir YAYA KENARI üstünde ilerler (nav.posOn(edge, dir, s, lat)); konum serbest (x,z) tutulur, her adımda hedef = kenar üstünde
 * `LOOK` metre ilerideki nokta (köşelerde doğal yuvarlanma). Her aday konum `probe.free` ile denetlenir (statik katı/prop/su/asfalt) → yaya KATIYA girmez.
 * Aday engellenirse yanal kaçınma (±0,4/0,8 m) denenir; tıkalıysa durur, 1,4 sn sonra kenarda geri döner. Sağdan yürüme (karşılıklı akış).
 */
import { subHash } from '../../dim/dimensions.js';
import { newLook } from './pedData.js';
import { EK } from './pedNav.js';

export const TICK = 1 / 20;
export const R_PED = 0.23;
export const LOOK = 1.15;
export const POOL = 72;
export const TAGS = Object.freeze({
  spawn: 0xf001, edge: 0xf002, route: 0xf003, role: 0xf004, goal: 0xf005, dur: 0xf006, pair: 0xf007, idle: 0xf008, rain: 0xf009, wave: 0xf00a, pos: 0xf00b,
  dir: 0xf00c, type: 0xf00d, slot: 0xf00e,
});
const ROUTE_CAP = 24;

export function newPed(i) {
  return {
    i, alive: false, id: 0, rseed: 0, look: newLook(), type: 0, role: 0, state: 0, t: 0,
    x: 0, y: 64, z: 0, px: 0, pz: 0, yaw: 0, pyaw: 0, speed: 0, vmax: 1.3,
    e: -1, dir: 1, s: 0, lat: 0, latT: 0, avoid: 0, avoidT: 0, visits: 0, node: -1,
    route: new Int32Array(ROUTE_CAP), rn: 0, rp: 0, goal: -1, goalS: 0,
    wait: 0, partner: -1, pairLead: false, gesture: 0, gestureT: 0, phase: 0, phaseRate: 0, umb: 0, umbWant: 0, umbAt: 0,
    fade: 0, fadeDir: 1, tier: 2, acc: 0, spot: -1, slot: -1, tmr: 0, tmr2: 0, waveCd: 0, hopT: 0, blockedT: 0, lookYaw: 0, dodgeT: 0, sx: 0, sz: 0,
    sheltering: false, shelterOut: 0, rainSeen: 0, slotX: 0, slotZ: 0, slotYaw: 0, approach: 0, stuckT: 0, walkSig: 0, patience: 0, age: 0, sky: 1, blk: 0,
    goalArrived: false, t0: 0, t1: 0, spotKind: -1, shelterWant: false, idleVisit: -1, dist: 0, stuckN: 0, stepLock: false, slowT: 0, ghostT: 0, vehWait: 0, laneT: 0,
  };
}

export function createCtx(nav, o) {
  const peds = new Array(POOL);
  for (let i = 0; i < POOL; i++) peds[i] = newPed(i);
  return {
    nav, probe: null, seed: (o.seed | 0), peds, time: 0, phase: 0.25, rain: 0, raining: false, night: false, reduced: false,
    player: {
      valid: false, x: 0, y: 64, z: 0, yaw: 0, vx: 0, vz: 0, driving: false, fx: 0, fz: -1,
    },
    veh: { list: [], n: 0 }, signals: null, caps: null, cap: 60, nextId: 1, spawnN: 0,
    cross: { occ: new Int16Array(nav.crossings.length), key: null, touched: [] },
    blocked: new Uint8Array(nav.ne), blockedAt: new Float32Array(nav.ne), edgeOK: new Int8Array(nav.ne), sweeps: 0,
    spotOcc: nav.spots.map((s) => new Int32Array(s.cap).fill(-1)),
    spotNext: new Float32Array(nav.spots.length),
    grid: new Map(), tick: 0, scratch: new Int32Array(512),
    stats: {
      spawned: 0, despawned: 0, crossings: 0, dodges: 0, waves: 0, enters: 0, emerges: 0, stuck: 0, shelters: 0, queues: 0, blockedSteps: 0, vehicleHits: 0, probeFails: 0,
    },
    events: [],
  };
}

/** Belirlenimci [0,1) — yaya tohumundan. */
export function rnd(p, k, tag) {
  return (subHash(p.rseed, k | 0, tag | 0) >>> 0) / 4294967296;
}

export function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Yön (fx,fz) → yaw (0 = −Z, ileri = (−sin, −cos)). */
export function yawOf(fx, fz) {
  return Math.atan2(-fx, -fz);
}

/* ------------------------------------------------------------------------------------------------
 * Kenara yerleştirme
 * ---------------------------------------------------------------------------------------------- */
const _pos = { x: 0, z: 0 };
const _pr = { s: 0, lat: 0, d: 0 };

export function placeOnEdge(C, p, e, dir, s, lat) {
  const nav = C.nav;
  p.e = e;
  p.dir = dir;
  p.s = s;
  p.lat = lat;
  const q = nav.posOn(e, dir, s, lat, _pos);
  p.x = q.x;
  p.z = q.z;
  p.px = q.x;
  p.pz = q.z;
  p.latT = baseLat(C, p, e);
  const fx = nav.eux[e] * dir;
  const fz = nav.euz[e] * dir;
  p.yaw = yawOf(fx, fz);
  p.pyaw = p.yaw;
  p.node = nav.nodeAt(e, -dir);
}

/** Sağ el yanal hedef: |tercih|·yarı genişlik (yön başına sağ). */
export function baseLat(C, p, e) {
  const hw = C.nav.ehw[e];
  return p.look.latPref * hw * (C.nav.ekind[e] === EK.CROSS ? 0.4 : 0.85);
}

/** (x,z) → kenar üstü s (seyir yönünde), lat (seyir yönüne göre sağ +). */
export function projectTravel(C, p, e, out) {
  const nav = C.nav;
  const pr = nav.project(e, p.x, p.z, _pr);
  const len = nav.elen[e];
  out.s = p.dir > 0 ? pr.s : len - pr.s;
  out.lat = pr.lat * p.dir;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Kenar geçilebilirliği (tembel tarama): her 0,5 m'de 0,5 m aralıklı yanal yuvalar; yuva yolu ardışık örnekler arasında ≤ 1 yuva kayar (≤ 45°). Tıkalıysa kalıcı işaretlenir.
 * ---------------------------------------------------------------------------------------------- */
const MAX_SLOTS = 41;
const _reach = new Uint8Array(MAX_SLOTS);
const _free = new Uint8Array(MAX_SLOTS);
const _next = new Uint8Array(MAX_SLOTS);

/** 1 geçilebilir, -1 tıkalı; 0 bilinmiyor (yüklenmemiş/bütçe). Bütçe: adım başına 1 tarama. */
export function edgeOk(C, e) {
  const v = C.edgeOK[e];
  if (v !== 0) return v;
  if (C.sweeps >= 1) return 0;
  const nav = C.nav;
  const probe = C.probe;
  const len = nav.elen[e];
  const hw = Math.min(nav.ehw[e] * 0.92, 9.9);
  const allowRoad = nav.ekind[e] === EK.CROSS;
  const half = Math.max(1, Math.floor(hw / 0.5));
  const SL = half * 2 + 1;
  const ax = nav.nx[nav.ea[e]];
  const az = nav.nz[nav.ea[e]];
  const ux = nav.eux[e];
  const uz = nav.euz[e];
  C.sweeps++;
  const n = Math.max(1, Math.ceil(len / 0.5));
  for (let k = 0; k <= n; k++) {
    const s = Math.min(len, k * 0.5);
    const bx = ax + ux * s;
    const bz = az + uz * s;
    if (!probe.loaded(bx, bz)) return 0;
    for (let q = 0; q < SL; q++) {
      const lat = (q - half) * 0.5;
      _free[q] = probe.free(bx - uz * lat, bz + ux * lat, R_PED + 0.03, allowRoad) ? 1 : 0;
    }
    let any = 0;
    for (let q = 0; q < SL; q++) {
      let r = 0;
      if (_free[q]) {
        if (k === 0) r = 1;
        else if (_reach[q] || (q > 0 && _reach[q - 1]) || (q < SL - 1 && _reach[q + 1])) r = 1;
      }
      _next[q] = r;
      any |= r;
    }
    for (let q = 0; q < SL; q++) _reach[q] = _next[q];
    if (!any) {
      C.edgeOK[e] = -1;
      C.blocked[e] = 1;
      C.blockedAt[e] = 1e9;
      return -1;
    }
  }
  C.edgeOK[e] = 1;
  return 1;
}

/* ------------------------------------------------------------------------------------------------
 * Sonraki kenar seçimi (belirlenimci: p.rseed + ziyaret sayısı; çiftler aynı tohumu paylaşır)
 * ---------------------------------------------------------------------------------------------- */
const _cand = new Int32Array(12);
const _candW = new Float32Array(12);

export function pickNextEdge(C, p, node, fromEdge) {
  const nav = C.nav;
  let nc = 0;
  let tot = 0;
  const pf = C.player;
  // gelen yön: fromEdge boyunca seyir yönü (dir) → (eux*dir, euz*dir)
  const ix = fromEdge >= 0 ? nav.eux[fromEdge] * p.dir : 0;
  const iz = fromEdge >= 0 ? nav.euz[fromEdge] * p.dir : 0;
  for (let k = nav.adjStart[node]; k < nav.adjStart[node + 1] && nc < 12; k++) {
    const e = nav.adjEdge[k];
    if (e === fromEdge) continue;
    if (C.blocked[e] && C.time - C.blockedAt[e] < 40) continue;
    if (edgeOk(C, e) < 0) continue;
    const away = nav.ea[e] === node ? 1 : -1;
    const ox = nav.eux[e] * away;
    const oz = nav.euz[e] * away;
    let w = 1;
    const dot = ox * ix + oz * iz;
    w = dot > 0.7 ? 2.6 : dot > -0.3 ? 1.0 : 0.15;
    if (nav.ekind[e] === EK.CROSS) w *= 0.7;
    if (pf.valid) {
      const far = nav.ea[e] === node ? nav.eb[e] : nav.ea[e];
      const dx = nav.nx[far] - pf.x;
      const dz = nav.nz[far] - pf.z;
      if (dx * dx + dz * dz > 150 * 150) w *= 0.35;
    }
    _cand[nc] = e;
    _candW[nc] = w;
    tot += w;
    nc++;
  }
  if (nc === 0) {
    return fromEdge; // çıkmaz: geri dön
  }
  const h = rnd(p, p.visits, TAGS.edge) * tot;
  let acc = 0;
  for (let i = 0; i < nc; i++) {
    acc += _candW[i];
    if (h < acc) return _cand[i];
  }
  return _cand[nc - 1];
}

/** Düğümde yeni kenara gir: dir = düğüm a ise +1. */
export function enterEdge(C, p, e, node) {
  const nav = C.nav;
  const dir = nav.ea[e] === node ? 1 : -1;
  p.e = e;
  p.dir = dir;
  p.node = node;
  const pr = projectTravel(C, p, e, _pt);
  p.s = pr.s < 0 ? 0 : pr.s;
  p.lat = pr.lat;
  p.latT = baseLat(C, p, e);
  p.blockedT = 0;
}
const _pt = { s: 0, lat: 0 };

/* ------------------------------------------------------------------------------------------------
 * Yürüme adımı: hedef noktaya doğru yönel, engel/kaçınma, konum güncelle. Dönüş: bu adımda kat edilen mesafe.
 * vTarget: istenen hız (çağıran kuyruk/geçit/yavaşlama sınırlarını verir). Kenar sonuna gelince p.s >= len − 0.3 olur (çağıran düğümü işler).
 * ---------------------------------------------------------------------------------------------- */
export function stepFollow(C, p, dt, vTarget) {
  const nav = C.nav;
  const e = p.e;
  const len = nav.elen[e];
  const dir = p.dir;
  const probe = C.probe;
  const allowRoad = nav.ekind[e] === EK.CROSS;
  // hız
  const acc = vTarget > p.speed ? 1.9 : 4.2;
  p.speed += Math.max(-acc * dt, Math.min(acc * dt, vTarget - p.speed));
  if (p.speed < 0.001 && vTarget <= 0) p.speed = 0;
  if (p.avoidT > 0) {
    p.avoidT -= dt;
    if (p.avoidT <= 0) p.avoid = 0;
  }
  // hedef: kenar üstünde LOOK ilerisi
  let sT = p.s + LOOK;
  let tx;
  let tz;
  const hwl = hwOf(nav, e);
  const lat = Math.max(-hwl, Math.min(hwl, p.latT + p.avoid));
  if (sT >= len) {
    // düğümü hedefle (köşe yuvarlanması: düğüm merkezine +0,15)
    const nd = dir > 0 ? nav.eb[e] : nav.ea[e];
    tx = nav.nx[nd];
    tz = nav.nz[nd];
    sT = len;
  } else {
    const q = nav.posOn(e, dir, sT, lat, _pos);
    tx = q.x;
    tz = q.z;
  }
  let dx = tx - p.x;
  let dz = tz - p.z;
  let dl = Math.sqrt(dx * dx + dz * dz);
  if (dl < 1e-4) {
    dx = nav.eux[e] * dir;
    dz = nav.euz[e] * dir;
    dl = 1;
  }
  const hx = dx / dl;
  const hz = dz / dl;
  // yaw (yumuşak)
  const wantYaw = yawOf(hx, hz);
  p.yaw += wrapPi(wantYaw - p.yaw) * Math.min(1, 8 * dt);
  if (p.speed <= 0.0005) return 0;
  const step = p.speed * dt;
  let nx = p.x + hx * step;
  let nz = p.z + hz * step;
  // ileri bakış: 0,5 ve 1,0 m; engel varsa serbest bir yanal şerit ara
  // Şerit değiştirme canlı kilidi (QA4-006): ileri bakış engel görür, şerit araması "başarılı" der ama yön (hedef şeride bakış) hâlâ engele çarpar → yaya yerinde döner,
  // blockedT artmaz (geçitte CROSS yayası geri dönemez; pedBlocked trafiği sonsuza dek tutar). 1,2 sn'den uzun süren aramada ileri bakış atlanır: yalnız gerçek adım konumu
  // denetlenir (aşağıdaki eksen kayması engelin kenarından geçirir).
  const blockedAhead = !probe.free(p.x + hx * 0.5, p.z + hz * 0.5, R_PED, allowRoad) || !probe.free(p.x + hx * 1.0, p.z + hz * 1.0, R_PED, allowRoad);
  if (blockedAhead && p.laneT < 1.2) {
    p.laneT += dt;
    if (!laneSearch(C, p, e, allowRoad)) {
      p.speed = Math.max(0, p.speed - 3 * dt);
      p.blockedT += dt;
      C.stats.blockedSteps++;
      return 0;
    }
    return 0;
  }
  if (!blockedAhead) p.laneT = 0;
  else if (p.laneT < 4) p.laneT += dt;
  else p.laneT = 0;
  if (!probe.free(nx, nz, R_PED, allowRoad)) {
    if (probe.free(nx, p.z, R_PED, allowRoad)) nz = p.z;
    else if (probe.free(p.x, nz, R_PED, allowRoad)) nx = p.x;
    else {
      p.blockedT += dt;
      C.stats.blockedSteps++;
      return 0;
    }
  } else {
    p.blockedT = 0;
  }
  const mdx = nx - p.x;
  const mdz = nz - p.z;
  p.x = nx;
  p.z = nz;
  const pr = projectTravel(C, p, e, _pt);
  p.s = pr.s;
  p.lat = pr.lat;
  return Math.sqrt(mdx * mdx + mdz * mdz);
}

function hwOf(nav, e) {
  return nav.ehw[e] * 0.92;
}

const LANE_OFFS = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.3, -2.3, 3.2, -3.2];
const LANE_AHEAD = [0.5, 1.0, 1.7];

/** Engel önünde: kenar boyunca ilerisi serbest olan en yakın yanal şeridi seç (p.latT). */
function laneSearch(C, p, e, allowRoad) {
  const nav = C.nav;
  const probe = C.probe;
  const hwu = hwOf(nav, e);
  const flip = (p.i & 1) === 0 ? 1 : -1;
  for (let k = 0; k < LANE_OFFS.length; k++) {
    const cand = p.lat + LANE_OFFS[k] * flip;
    if (cand > hwu || cand < -hwu) continue;
    let ok = true;
    for (let q = 0; q < LANE_AHEAD.length && ok; q++) {
      const sq = Math.min(nav.elen[e], p.s + LANE_AHEAD[q]);
      const pos = nav.posOn(e, p.dir, sq, cand, _pos);
      ok = probe.free(pos.x, pos.z, R_PED, allowRoad);
    }
    if (!ok) continue;
    // geçiş: mevcut konumdan 0,5 m ilerideki şerit noktasına
    const pos = nav.posOn(e, p.dir, Math.min(nav.elen[e], p.s + 0.5), cand, _pos);
    const mx = (p.x + pos.x) / 2;
    const mz = (p.z + pos.z) / 2;
    if (!probe.free(mx, mz, R_PED, allowRoad)) continue;
    p.latT = cand;
    p.avoid = 0;
    p.avoidT = 0;
    return true;
  }
  return false;
}

/** Yürüyüş döngüsü hızı (rad/s): adım uzunluğu boya göre. */
export function gaitRate(speed, h) {
  if (speed < 0.05) return 0;
  const stride = (1.35 + 0.3 * Math.max(0, speed - 1.5)) * h;
  return (Math.PI * 2 * speed) / stride;
}
