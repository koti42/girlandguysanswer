/*
 * KEŞİF sim/city/ped — MEKÂN DAVRANIŞLARI: hedef atama (metro, dükkân kuyruğu, kafe, kulüp, fotoğraf noktası, yağmur barınağı), mekânda bekleme/kuyruk/dans/sohbet,
 * telefona bakma, yağmurda şemsiye/sığınma, oyuncuya tepki (kenara çekilme, el sallama, bakış). SAF, es2020. Aile dostu: korku/şiddet yok.
 */
import { SPOT } from './pedNav.js';
import { ROLE, ST } from './pedData.js';
import {
  R_PED, TAGS, enterEdge, gaitRate, rnd, wrapPi, yawOf,
} from './crowdCore.js';
import { GESTURE } from './crowdMove.js';
import { pointInVehicle } from './crowdVehicles.js';

const _rt = new Int32Array(64);
const _q = { x: 0, z: 0, yaw: 0 };
const ROLE_KINDS = Object.freeze({
  [ROLE.COMMUTE]: [SPOT.METRO],
  [ROLE.SHOP]: [SPOT.VENDOR, SPOT.DOOR],
  [ROLE.CAFE]: [SPOT.CAFE, SPOT.DOOR],
  [ROLE.CLUB]: [SPOT.CLUB],
  [ROLE.TOUR]: [SPOT.PHOTO],
});
const OFFS5 = [0, 0.95, -0.95, 1.9, -1.9];
const _best = new Int32Array(6);
const _bestD = new Float32Array(6);

/* ------------------------------------------------------------------------------------------------
 * Yuva konumu
 * ---------------------------------------------------------------------------------------------- */
/** spot + yuva k → {x, z, yaw}. Dışa bakış (ox,oz) = (−sin yaw, −cos yaw) (kapı/barınak yönü). */
export function slotPos(spot, k, out) {
  const ox = -Math.sin(spot.yaw);
  const oz = -Math.cos(spot.yaw);
  const ax = -oz;
  const az = ox;
  const sgn = (spot.id & 1) === 0 ? 1 : -1;
  switch (spot.kind) {
    case SPOT.SHELTER:
      out.x = spot.x + ax * OFFS5[k % 5] + ox * 0.3;
      out.z = spot.z + az * OFFS5[k % 5] + oz * 0.3;
      out.yaw = spot.yaw;
      break;
    case SPOT.VENDOR: {
      const d = 0.9 + 0.85 * k;
      out.x = spot.x + ax * sgn * d + ox * 0.9;
      out.z = spot.z + az * sgn * d + oz * 0.9;
      out.yaw = yawOf(spot.x - out.x, spot.z - out.z);
      break;
    }
    case SPOT.CAFE: {
      out.x = spot.x + ax * OFFS5[k % 5] * 0.9 + ox * 1.1;
      out.z = spot.z + az * OFFS5[k % 5] * 0.9 + oz * 1.1;
      out.yaw = yawOf(-ox * 0.4 + ax * (k % 2 === 0 ? -0.6 : 0.6), -oz * 0.4 + az * (k % 2 === 0 ? -0.6 : 0.6));
      break;
    }
    case SPOT.CLUB: {
      const ang = (k / 6) * Math.PI * 2 + spot.id;
      out.x = spot.x + ox * 2.6 + Math.cos(ang) * 1.9;
      out.z = spot.z + oz * 2.6 + Math.sin(ang) * 1.9;
      out.yaw = yawOf(spot.x + ox * 2.6 - out.x, spot.z + oz * 2.6 - out.z);
      break;
    }
    case SPOT.PHOTO:
      out.x = spot.x + ax * (k - 1) * 1.3;
      out.z = spot.z + az * (k - 1) * 1.3;
      out.yaw = spot.yaw;
      break;
    case SPOT.METRO:
      out.x = spot.x + ox * 0.6;
      out.z = spot.z + oz * 0.6;
      out.yaw = yawOf(-ox, -oz);
      break;
    default:
      out.x = spot.x + ox * 0.95 + ax * (k - 1) * 1.1;
      out.z = spot.z + oz * 0.95 + az * (k - 1) * 1.1;
      out.yaw = yawOf(-ox, -oz);
  }
  return out;
}

function lineFree(C, x0, z0, x1, z1) {
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    if (!C.probe.free(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, R_PED, false)) return false;
  }
  return true;
}

export function releaseSpot(C, p) {
  if (p.spot >= 0) {
    const occ = C.spotOcc[p.spot];
    if (occ && occ[p.slot] === p.i) occ[p.slot] = -1;
  }
  p.spot = -1;
  p.slot = -1;
  p.spotKind = -1;
}

/** Yuva ayır (geçerli konum + yoldan ulaşım denetimi). */
export function claimSpot(C, p, spotId) {
  const spot = C.nav.spots[spotId];
  const occ = C.spotOcc[spotId];
  if (!spot || !occ) return false;
  for (let k = 0; k < occ.length; k++) {
    if (occ[k] >= 0 && !C.peds[occ[k]].alive) occ[k] = -1;
  }
  for (let k = 0; k < occ.length; k++) {
    if (occ[k] !== -1) continue;
    slotPos(spot, k, _q);
    if (!C.probe.free(_q.x, _q.z, R_PED, false)) continue;
    if (!lineFree(C, p.x, p.z, _q.x, _q.z)) continue;
    if (C.veh.n > 0 && pointInVehicle(_q.x, _q.z, R_PED, C.veh.list, C.veh.n)) continue;
    occ[k] = p.i;
    p.spot = spotId;
    p.slot = k;
    p.slotX = _q.x;
    p.slotZ = _q.z;
    p.slotYaw = _q.yaw;
    p.spotKind = spot.kind;
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------------------------------------
 * Hedef seçimi + rota
 * ---------------------------------------------------------------------------------------------- */
function pickSpot(C, p, kinds, minD, maxD, tag) {
  const spots = C.nav.spots;
  let nb = 0;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    let ok = false;
    for (let k = 0; k < kinds.length; k++) if (s.kind === kinds[k]) ok = true;
    if (!ok) continue;
    if (C.time < C.spotNext[i]) continue;
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < minD || d > maxD) continue;
    // dolu mu
    const occ = C.spotOcc[i];
    let free = 0;
    for (let k = 0; k < occ.length; k++) if (occ[k] === -1) free++;
    if (free === 0) continue;
    // en yakın 5
    let w = nb < 5 ? nb : 4;
    if (nb >= 5 && d >= _bestD[4]) continue;
    if (nb < 5) nb++;
    while (w > 0 && _bestD[w - 1] > d) {
      _bestD[w] = _bestD[w - 1];
      _best[w] = _best[w - 1];
      w--;
    }
    _bestD[w] = d;
    _best[w] = i;
  }
  if (nb === 0) return -1;
  const k = Math.min(nb - 1, Math.floor(rnd(p, p.visits + 7, tag) * nb));
  return _best[k];
}

export function chooseGoalSpot(C, p, role, maxD) {
  const kinds = ROLE_KINDS[role];
  if (!kinds) return -1;
  return pickSpot(C, p, kinds, 12, maxD || 170, TAGS.goal);
}

/** Rota hesapla ve p.route/rn/rp/goal yaz. false: ulaşılamaz/çok uzak. */
export function assignGoal(C, p, spotId) {
  const nav = C.nav;
  const spot = nav.spots[spotId];
  if (!spot || p.e < 0) return false;
  const E = spot.edge;
  p.goalArrived = false;
  if (p.e === E) {
    const curAbs = p.dir > 0 ? p.s : nav.elen[E] - p.s;
    const want = spot.s >= curAbs ? 1 : -1;
    if (want !== p.dir) {
      p.dir = want;
      p.s = nav.elen[E] - p.s;
      p.lat = -p.lat;
      p.latT = -p.latT;
    }
    p.rn = 0;
    p.rp = 0;
    p.goal = spotId;
    return true;
  }
  const n1 = nav.nodeAt(p.e, p.dir);
  let bestCnt = -1;
  let bestLen = 1e9;
  let bestNode = -1;
  const tmp = _rt;
  for (let k = 0; k < 2; k++) {
    const T = k === 0 ? nav.ea[E] : nav.eb[E];
    const cnt = nav.route(n1, T, tmp, C.blocked);
    if (cnt < 0 || cnt > 20) continue;
    let len = 0;
    for (let i = 0; i < cnt; i++) len += nav.elen[tmp[i]];
    len += k === 0 ? spot.s : nav.elen[E] - spot.s;
    if (len < bestLen) {
      bestLen = len;
      bestCnt = cnt;
      bestNode = T;
    }
  }
  if (bestCnt < 0) return false;
  nav.route(n1, bestNode, tmp, C.blocked);
  // E rota içinde mi? ilk görüldüğü yerde kes
  let node = n1;
  let rn = 0;
  for (let i = 0; i < bestCnt; i++) {
    const e = tmp[i];
    if (e === E) break;
    p.route[rn++] = e;
    node = nav.ea[e] === node ? nav.eb[e] : nav.ea[e];
  }
  if (rn >= p.route.length) return false;
  p.route[rn++] = E;
  p.rn = rn;
  p.rp = 0;
  p.goal = spotId;
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Mekâna varış / çıkış
 * ---------------------------------------------------------------------------------------------- */
function dur(p, a, b, tag) {
  return a + rnd(p, p.visits + 3, tag) * (b - a);
}

export function beginSpot(C, p) {
  const spotId = p.goal;
  const spot = C.nav.spots[spotId];
  p.goalArrived = false;
  p.goal = -1;
  p.rp = p.rn;
  if (!spot || !claimSpot(C, p, spotId)) {
    p.spot = -1;
    return false;
  }
  C.spotNext[spotId] = C.time + 3;
  p.approach = 1;
  p.wait = 0;
  switch (spot.kind) {
    case SPOT.METRO:
      p.state = ST.ENTER;
      C.stats.enters++;
      break;
    case SPOT.SHELTER:
      p.state = ST.SHELTER;
      p.shelterOut = 0;
      C.stats.shelters++;
      break;
    case SPOT.VENDOR:
      p.state = ST.QUEUE;
      p.tmr = dur(p, 7, 13, TAGS.dur);
      C.stats.queues++;
      break;
    case SPOT.CAFE:
      p.state = ST.CHAT;
      p.tmr = dur(p, 14, 30, TAGS.dur);
      break;
    case SPOT.CLUB:
      p.state = C.reduced ? ST.CHAT : ST.DANCE;
      p.tmr = dur(p, 18, 40, TAGS.dur);
      break;
    case SPOT.PHOTO:
      p.state = ST.LOOK;
      p.tmr = dur(p, 8, 15, TAGS.dur);
      break;
    default:
      p.state = ST.IDLE;
      p.tmr = dur(p, 4, 9, TAGS.dur);
  }
  return true;
}

/** Mekândan çık ve yürümeye dön. */
export function resumeWalk(C, p) {
  const spot = p.spot >= 0 ? C.nav.spots[p.spot] : null;
  const e0 = spot ? spot.edge : p.e;
  releaseSpot(C, p);
  p.approach = 0;
  p.gesture = p.umb > 0.5 ? GESTURE.UMBRELLA : GESTURE.NONE;
  p.gestureT = 0;
  p.state = ST.WALK;
  p.goal = -1;
  p.rp = p.rn;
  p.sheltering = false;
  p.shelterWant = false;
  const nav = C.nav;
  let e = e0 >= 0 ? e0 : p.e;
  const near = nav.nearestEdge(p.x, p.z, 8, 5);
  if (near >= 0) e = near;
  if (e < 0) return;
  const dir = rnd(p, p.visits + 11, TAGS.dir) < 0.5 ? 1 : -1;
  p.e = e;
  p.dir = dir;
  enterEdge(C, p, e, dir > 0 ? nav.ea[e] : nav.eb[e]);
  p.blockedT = 0;
}

function moveToSlot(C, p, dt, speed) {
  const dx = p.slotX - p.x;
  const dz = p.slotZ - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.1) {
    p.x = p.slotX;
    p.z = p.slotZ;
    p.speed = 0;
    return true;
  }
  const v = Math.min(speed, d / dt);
  const nx = p.x + (dx / d) * v * dt;
  const nz = p.z + (dz / d) * v * dt;
  if (C.probe.free(nx, nz, R_PED, false)) {
    p.x = nx;
    p.z = nz;
    p.speed = v;
    p.yaw += wrapPi(yawOf(dx / d, dz / d) - p.yaw) * Math.min(1, 9 * dt);
  } else {
    p.blockedT += dt;
    p.speed = 0;
    if (p.blockedT > 2) return true; // vazgeç (konumda dur)
  }
  return false;
}

function turnTo(p, yaw, dt) {
  p.yaw += wrapPi(yaw - p.yaw) * Math.min(1, 6 * dt);
}

export function updateSpotState(C, p, dt) {
  const spot = p.spot >= 0 ? C.nav.spots[p.spot] : null;
  p.phaseRate = 0;
  if (p.approach) {
    const arrived = moveToSlot(C, p, dt, 1.25);
    p.phaseRate = gaitRate(p.speed, p.look.h);
    p.phase += p.phaseRate * dt;
    if (!arrived) return;
    p.approach = 0;
    p.speed = 0;
    if (p.state === ST.ENTER) {
      p.fadeDir = -1; // metroya iner
      return;
    }
  }
  p.speed = Math.max(0, p.speed - 4 * dt);
  switch (p.state) {
    case ST.ENTER:
      turnTo(p, p.slotYaw, dt);
      break;
    case ST.QUEUE: {
      turnTo(p, p.slotYaw, dt);
      p.gesture = p.slot === 0 ? GESTURE.POCKET : GESTURE.PHONE;
      if (p.slot > 0) {
        const occ = C.spotOcc[p.spot];
        if (occ[p.slot - 1] === -1) {
          occ[p.slot - 1] = p.i;
          occ[p.slot] = -1;
          p.slot--;
          slotPos(spot, p.slot, _q);
          p.slotX = _q.x;
          p.slotZ = _q.z;
          p.slotYaw = _q.yaw;
          p.approach = 1;
          p.gesture = GESTURE.NONE;
        }
      } else {
        p.tmr -= dt;
        if (p.tmr <= 0) resumeWalk(C, p);
      }
      break;
    }
    case ST.SHELTER:
      turnTo(p, p.slotYaw, dt);
      p.gesture = rnd(p, 5, TAGS.idle) < 0.5 ? GESTURE.POCKET : GESTURE.PHONE;
      if (!C.raining) {
        if (p.shelterOut === 0) p.shelterOut = C.time + 2 + 7 * rnd(p, p.visits + 5, TAGS.rain);
        else if (C.time >= p.shelterOut) resumeWalk(C, p);
      } else p.shelterOut = 0;
      break;
    case ST.CHAT:
      turnTo(p, p.slotYaw, dt);
      p.gesture = GESTURE.CHAT;
      p.tmr -= dt;
      if (p.tmr <= 0) resumeWalk(C, p);
      break;
    case ST.DANCE:
      turnTo(p, p.slotYaw, dt);
      p.gesture = GESTURE.DANCE;
      p.tmr -= dt;
      if (p.tmr <= 0) resumeWalk(C, p);
      break;
    case ST.LOOK:
      turnTo(p, p.slotYaw, dt);
      p.gesture = GESTURE.PHOTO;
      p.tmr -= dt;
      if (p.tmr <= 0) resumeWalk(C, p);
      break;
    case ST.IDLE:
    default:
      if (spot) turnTo(p, p.slotYaw, dt);
      p.tmr -= dt;
      if (p.tmr <= 0) {
        if (spot) resumeWalk(C, p);
        else {
          p.state = ST.WALK;
          p.gesture = p.umb > 0.5 ? GESTURE.UMBRELLA : GESTURE.NONE;
        }
      }
  }
}

/** Düğümde rastgele durma: telefon (tek) veya sohbet (çift). true: yürüyüş durdu. */
export function maybeIdle(C, p) {
  if (C.raining || p.goal >= 0 || p.umb > 0.3) return false;
  const nav = C.nav;
  if (nav.ekind[p.e] !== 0 && nav.ekind[p.e] !== 2) return false;
  if (p.look.type === 4 || p.look.type === 3) return false; // koşucu/kurye durmaz
  const h = rnd(p, p.visits + 21, TAGS.idle);
  if (p.partner >= 0) {
    const q = C.peds[p.partner];
    if (!q.alive || q.state !== ST.WALK || h > 0.1) return false;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    if (dx * dx + dz * dz > 9) return false;
    p.state = ST.CHAT;
    q.state = ST.CHAT;
    p.tmr = 7 + 8 * rnd(p, p.visits + 22, TAGS.dur);
    q.tmr = p.tmr;
    p.spot = -1;
    q.spot = -1;
    p.gesture = GESTURE.CHAT;
    q.gesture = GESTURE.CHAT;
    return true;
  }
  if (h > 0.07) return false;
  p.state = ST.IDLE;
  p.tmr = 4 + 5 * rnd(p, p.visits + 23, TAGS.dur);
  p.gesture = GESTURE.PHONE;
  p.spot = -1;
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Yağmur: şemsiye / sığınma
 * ---------------------------------------------------------------------------------------------- */
export function onRainChange(C) {
  const peds = C.peds;
  for (let i = 0; i < peds.length; i++) {
    const p = peds[i];
    if (!p.alive) continue;
    if (C.raining) rainStartPed(C, p);
    else {
      if (p.umbWant) p.umbAt = C.time + 3 + 5 * rnd(p, 31, TAGS.rain);
      // yağmur bitti: sığınmaya yürüyenler vazgeçer
      if (p.goal >= 0 && p.shelterWant && C.nav.spots[p.goal].kind === SPOT.SHELTER) {
        p.goal = -1;
        p.rp = p.rn;
        p.shelterWant = false;
      }
    }
  }
}

export function rainStartPed(C, p) {
  if (p.state === ST.ENTER || p.state === ST.EMERGE) return;
  const u = rnd(p, 17, TAGS.rain);
  if (u < 0.34 && p.state === ST.WALK && p.e >= 0 && !p.shelterWant) {
    const sp = pickSpot(C, p, [SPOT.SHELTER], 0, 48, TAGS.rain);
    if (sp >= 0 && assignGoal(C, p, sp)) {
      p.shelterWant = true;
      p.umbWant = 0;
      return;
    }
  }
  p.umbWant = u < 0.9 ? 1 : 0;
  p.umbAt = 0;
}

export function updateUmbrella(C, p, dt) {
  if (p.umbAt > 0 && C.time >= p.umbAt) {
    p.umbWant = 0;
    p.umbAt = 0;
  }
  const want = p.state === ST.SHELTER || p.state === ST.ENTER ? 0 : p.umbWant;
  if (p.umb < want) p.umb = Math.min(want, p.umb + 2.4 * dt);
  else if (p.umb > want) p.umb = Math.max(want, p.umb - 2.4 * dt);
}

/* ------------------------------------------------------------------------------------------------
 * Oyuncuya tepki (kenara çekilme, el sallama, bakış): yaya asla korkmaz/kaçmaz
 * ---------------------------------------------------------------------------------------------- */
export function reactPlayer(C, p, dt) {
  const pl = C.player;
  if (!pl.valid) {
    p.lookYaw *= 0.9;
    return;
  }
  const dx = pl.x - p.x;
  const dz = pl.z - p.z;
  const d2 = dx * dx + dz * dz;
  if (p.waveCd > 0) p.waveCd -= dt;
  if (p.gestureT > 0) {
    p.gestureT -= dt;
    if (p.gestureT <= 0 && (p.gesture === GESTURE.WAVE || p.gesture === GESTURE.HOP)) p.gesture = GESTURE.NONE;
  }
  if (d2 > 49 || pl.driving) {
    p.lookYaw *= Math.max(0, 1 - 4 * dt);
    return;
  }
  const d = Math.sqrt(d2);
  const toP = yawOf(dx, dz);
  const rel = wrapPi(toP - p.yaw);
  // bakış: ≤ 6 m, ön yarı küre
  const lookWant = Math.abs(rel) < 1.9 && d < 6 ? Math.max(-1.0, Math.min(1.0, rel)) : 0;
  p.lookYaw += (lookWant - p.lookYaw) * Math.min(1, 4 * dt);
  // el sallama
  if (p.look.friendly && p.waveCd <= 0 && d > 2.2 && d < 6.5 && Math.abs(rel) < 1.3 && p.gestureT <= 0 && (p.state === ST.WALK || p.state === ST.IDLE || p.state === ST.QUEUE)
    && p.umb < 0.5 && !C.reduced) {
    p.gesture = GESTURE.WAVE;
    p.gestureT = 1.7;
    p.waveCd = 28;
    C.stats.waves++;
  }
  // kenara çekilme: oyuncu önümüzden yaklaşıyorsa ve yakınsa
  if (d < 2.3 && (p.state === ST.WALK || p.state === ST.IDLE) && p.e >= 0) {
    const pvx = pl.vx;
    const pvz = pl.vz;
    const sp = Math.sqrt(pvx * pvx + pvz * pvz);
    if (sp > 0.6 && (pvx * -dx + pvz * -dz) < 0) {
      // oyuncu bize doğru: kendimize göre yan
      const hx = -Math.sin(p.yaw);
      const hz = -Math.cos(p.yaw);
      const lat = dx * -hz + dz * hx;
      p.avoid += lat >= 0 ? -0.5 : 0.5;
      p.avoidT = 1.0;
    }
  }
}
