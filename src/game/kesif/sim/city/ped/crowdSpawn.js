/*
 * KEŞİF sim/city/ped — DOĞMA / SİLME / HEDEF SAYI / KADEMELER. SAF, belirlenimci (tohum + zaman + oyuncu konumu), es2020.
 * Halka: oyuncudan [spawnMin, spawnMax] m, kamera konisi içinde yakın doğma yok (yeterince doluysa); uzaklaşan (> despawnR) soluk silinir.
 * Yoğunluk: yakındaki bölgelerin gün fazı çizelgesi (Gece Pazarı geceleri kalabalık, metro yoğun saatlerinde çıkış dalgaları).
 */
import { EK, SPOT } from './pedNav.js';
import {
  PED_TYPE, ROLE, ROLE_COUNT, ST, densityAt, pickType, rollLook, roleWeights, rushAt,
} from './pedData.js';
import {
  TAGS, edgeOk, placeOnEdge, rnd, yawOf,
} from './crowdCore.js';
import { subHash } from '../../dim/dimensions.js';
import { pointInVehicle } from './crowdVehicles.js';
import {
  assignGoal, chooseGoalSpot, rainStartPed, slotPos,
} from './crowdSpots.js';
import { GESTURE } from './crowdMove.js';
import { R_PED } from './crowdCore.js';

const _w = new Float32Array(ROLE_COUNT);
const _near = new Int32Array(512);
const _slot = { x: 0, z: 0, yaw: 0 };
const PAIR_CHANCE = 0.26;
const KIND_W = [0.45, 0, 1.0];

export function freePed(C) {
  for (let i = 0; i < C.peds.length; i++) if (!C.peds[i].alive) return C.peds[i];
  return null;
}

export function aliveCount(C) {
  let n = 0;
  for (let i = 0; i < C.peds.length; i++) if (C.peds[i].alive) n++;
  return n;
}

/** Yakın bölgelerin ortalama yoğunluğu (0..1) ve hedef sayı. */
export function updateTarget(C) {
  const pl = C.player;
  if (!pl.valid) {
    C.localDensity = 0.5;
    return;
  }
  const nav = C.nav;
  const n = nav.edgesNear(pl.x, pl.z, 100, _near);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const e = _near[i];
    if (!nav.eok[e] || nav.ekind[e] === EK.CROSS) continue;
    sum += densityAt(nav.districtKeys[nav.ndist[nav.ea[e]]], C.phase);
    cnt++;
  }
  C.localDensity = cnt > 0 ? sum / cnt : 0.15;
}

export function targetCount(C) {
  const caps = C.caps;
  const d = Math.max(0.2, C.localDensity === undefined ? 0.5 : C.localDensity) * (C.raining ? 0.82 : 1);
  const t = Math.round(Math.min(C.cap, caps.total) * Math.min(1, d + 0.04));
  return Math.max(Math.min(6, caps.total), t);
}

function density(C, e) {
  const nav = C.nav;
  const dk = nav.districtKeys[nav.ndist[nav.ea[e]]];
  return densityAt(dk, C.phase) * KIND_W[nav.ekind[e]] * (0.55 + nav.ehot[e]) / 1.1;
}

function initPed(C, p, o) {
  const nav = C.nav;
  const id = C.nextId++;
  p.alive = true;
  p.id = id;
  const type = o.type >= 0 ? o.type : pickType(subHash(C.seed, id, TAGS.type));
  p.type = type;
  const district = nav.districtKeys[nav.ndist[nav.ea[o.e]]];
  rollLook(C.seed, id, type, district, p.look);
  p.rseed = o.rseed ? o.rseed : subHash(C.seed, id, TAGS.route);
  p.vmax = o.vmax > 0 ? o.vmax : p.look.vmax;
  p.role = ROLE.STROLL;
  p.state = ST.WALK;
  p.t = 0;
  p.speed = p.vmax * 0.85;
  p.visits = 0;
  p.avoid = 0;
  p.avoidT = 0;
  p.rn = 0;
  p.rp = 0;
  p.goal = -1;
  p.goalArrived = false;
  p.wait = 0;
  p.walkSig = 0;
  p.partner = -1;
  p.gesture = GESTURE.NONE;
  p.gestureT = 0;
  p.phase = rnd(p, 1, TAGS.pos) * 6.28;
  p.phaseRate = 0;
  p.umb = 0;
  p.umbWant = 0;
  p.umbAt = 0;
  p.fade = o.initial ? 1 : 0;
  p.fadeDir = 1;
  p.tier = 2;
  p.acc = 0;
  p.spot = -1;
  p.slot = -1;
  p.spotKind = -1;
  p.tmr = 0;
  p.waveCd = 6 + 10 * rnd(p, 2, TAGS.wave);
  p.blockedT = 0;
  p.lookYaw = 0;
  p.sheltering = false;
  p.shelterWant = false;
  p.shelterOut = 0;
  p.approach = 0;
  p.age = 0;
  p.stuckN = 0;
  p.slowT = 0;
  p.ghostT = 0;
  p.vehWait = 0;
  p.laneT = 0;
  p.speed = 0;
  placeOnEdge(C, p, o.e, o.dir, o.s, o.lat);
  p.speed = p.vmax * 0.9;
  p.t0 = C.time - 0.05;
  p.t1 = C.time;
  C.stats.spawned++;
  return p;
}

function assignRole(C, p) {
  const nav = C.nav;
  const dk = nav.districtKeys[nav.ndist[nav.ea[p.e]]];
  roleWeights(dk, C.phase, C.raining ? 1 : 0, _w);
  if (p.look.type === PED_TYPE.sporcu) {
    p.role = ROLE.STROLL;
    return;
  }
  let tot = 0;
  for (let i = 0; i < ROLE_COUNT; i++) tot += _w[i];
  let x = rnd(p, 3, TAGS.role) * tot;
  let role = ROLE.STROLL;
  for (let i = 0; i < ROLE_COUNT; i++) {
    if (x < _w[i]) {
      role = i;
      break;
    }
    x -= _w[i];
  }
  if (p.look.type === PED_TYPE.turist && rnd(p, 4, TAGS.role) < 0.55) role = ROLE.TOUR;
  if (p.look.type === PED_TYPE.kurye && role !== ROLE.COMMUTE) role = ROLE.SHOP;
  p.role = role;
  if (role !== ROLE.STROLL) {
    const sp = chooseGoalSpot(C, p, role, 170);
    if (sp < 0 || !assignGoal(C, p, sp)) p.role = ROLE.STROLL;
  }
}

function spotClear(C, x, z, minD2) {
  const peds = C.peds;
  for (let i = 0; i < peds.length; i++) {
    const o = peds[i];
    if (!o.alive) continue;
    const dx = o.x - x;
    const dz = o.z - z;
    if (dx * dx + dz * dz < minD2) return false;
  }
  return true;
}

function viewCone(C, x, z) {
  const pl = C.player;
  const dx = x - pl.x;
  const dz = z - pl.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  return (dx * pl.fx + dz * pl.fz) / d;
}

/** Tek doğma denemesi (≤ 10 aday). Dönüş: doğan yaya sayısı (0/1/2). */
export function trySpawn(C, initial) {
  const nav = C.nav;
  const pl = C.player;
  if (!pl.valid) return 0;
  const caps = C.caps;
  const rMin = initial ? Math.min(14, caps.spawnMin) : caps.spawnMin;
  const rMax = caps.spawnMax;
  const alive = aliveCount(C);
  const n = C.nearN;
  if (n === 0) return 0;
  for (let att = 0; att < 24; att++) {
    const h = subHash(C.seed, ++C.spawnN, TAGS.spawn) >>> 0;
    const e = C.nearList[h % n];
    if (!nav.eok[e] || nav.ekind[e] === EK.CROSS) continue;
    if (C.blocked[e] && C.time - C.blockedAt[e] < 40) continue;
    if (edgeOk(C, e) < 0) continue;
    const u1 = (h >>> 8) / 16777216;
    const u2 = ((subHash(C.seed, C.spawnN, TAGS.spawn + 1) >>> 0) / 4294967296);
    const u3 = ((subHash(C.seed, C.spawnN, TAGS.spawn + 2) >>> 0) / 4294967296);
    if (u3 > density(C, e) * 1.05) continue;
    const len = nav.elen[e];
    const s = 0.5 + u1 * Math.max(0.1, len - 1);
    const hw = nav.ehw[e];
    const lat = (u2 * 2 - 1) * hw * 0.7;
    const dir = (h & 1) === 0 ? 1 : -1;
    const pos = nav.posOn(e, dir, s, lat, _slot);
    const dx = pos.x - pl.x;
    const dz = pos.z - pl.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < rMin || d > rMax) continue;
    const cosA = viewCone(C, pos.x, pos.z);
    if (!initial && cosA > 0.5 && d < rMax * 0.78 && alive >= Math.ceil(C.target * 0.4)) continue; // kamera önünde görünür belirme yok (uzak ucundan gelsinler)
    if ((subHash(C.seed, C.spawnN, TAGS.spawn + 3) >>> 0) / 4294967296 > 0.3 + 0.7 * Math.max(0, cosA + 0.15)) continue; // bakış yönüne güçlü eğilim (arkada az)
    if (!C.probe.loaded(pos.x, pos.z)) continue;
    if (!C.probe.free(pos.x, pos.z, R_PED + 0.1, false)) continue;
    if (C.veh.n > 0 && pointInVehicle(pos.x, pos.z, R_PED + 0.5, C.veh.list, C.veh.n)) continue;
    if (!spotClear(C, pos.x, pos.z, 1.3)) continue;
    const pairRoll = (subHash(C.seed, C.spawnN, TAGS.pair) >>> 0) / 4294967296;
    const typeRoll = subHash(C.seed, C.spawnN, TAGS.type) >>> 0;
    let type = pickType(typeRoll);
    const wantPair = pairRoll < PAIR_CHANCE || type === PED_TYPE.cocuk;
    const p1 = freePed(C);
    if (!p1) return 0;
    if (type === PED_TYPE.cocuk) type = PED_TYPE.halk;
    initPed(C, p1, {
      e, dir, s, lat, type, initial,
    });
    let spawned = 1;
    if (wantPair && alive + 1 < caps.total) {
      const s2 = s >= 1.2 ? s - 0.95 : s + 0.95;
      const lat2 = lat > 0 ? lat - 0.6 : lat + 0.6;
      const pos2 = nav.posOn(e, dir, s2, lat2, _slot);
      const p2 = freePed(C);
      if (p2 && C.probe.free(pos2.x, pos2.z, R_PED + 0.05, false)) {
        const kind = (subHash(C.seed, C.spawnN, TAGS.pair + 1) >>> 0) % 100;
        const t2 = kind < 22 ? PED_TYPE.cocuk : kind < 34 ? PED_TYPE.yasli : kind < 46 ? PED_TYPE.turist : PED_TYPE.halk;
        initPed(C, p2, {
          e, dir, s: s2, lat: lat2, type: t2, initial, rseed: p1.rseed, vmax: p1.vmax * (t2 === PED_TYPE.cocuk ? 0.98 : 0.97),
        });
        if (t2 === PED_TYPE.cocuk || t2 === PED_TYPE.yasli) p1.vmax = Math.min(p1.vmax, 1.25);
        p2.vmax = p1.vmax * 0.98;
        p1.partner = p2.i;
        p2.partner = p1.i;
        spawned = 2;
        finishSpawn(C, p1, initial);
        finishSpawn(C, p2, initial);
        // çift aynı rolü paylaşır (aynı tohum → aynı hedef)
        p2.role = p1.role;
        // çift yerinde sohbet ederek başlayabilir
        if (initial && rnd(p1, 5, TAGS.idle) < 0.16 && p1.goal < 0) {
          p1.state = ST.CHAT;
          p2.state = ST.CHAT;
          p1.tmr = 4 + 6 * rnd(p1, 6, TAGS.dur);
          p2.tmr = p1.tmr;
          p1.gesture = GESTURE.CHAT;
          p2.gesture = GESTURE.CHAT;
          p1.speed = 0;
          p2.speed = 0;
          p1.yaw = yawOf(p2.x - p1.x, p2.z - p1.z);
          p2.yaw = yawOf(p1.x - p2.x, p1.z - p2.z);
        }
        return spawned;
      }
    }
    finishSpawn(C, p1, initial);
    if (initial && p1.goal < 0 && rnd(p1, 7, TAGS.idle) < 0.07) {
      p1.state = ST.IDLE;
      p1.gesture = GESTURE.PHONE;
      p1.tmr = 3 + 5 * rnd(p1, 8, TAGS.dur);
      p1.speed = 0;
    }
    return spawned;
  }
  return 0;
}

function finishSpawn(C, p, initial) {
  assignRole(C, p);
  if (C.raining) {
    p.umb = initial ? 0 : 0;
    rainStartPed(C, p);
    if (initial && p.umbWant) p.umb = 1;
  }
  void initial;
}

/** Metro çıkışı: kapı noktasında yumuşakça belirir. */
export function spawnEmerge(C, spot) {
  const nav = C.nav;
  const pl = C.player;
  if (!pl.valid) return null;
  const p = freePed(C);
  if (!p) return null;
  slotPos(spot, 7, _slot);
  if (!C.probe.free(_slot.x, _slot.z, R_PED, false)) return null;
  if (!spotClear(C, _slot.x, _slot.z, 1.1)) return null;
  const e = spot.edge;
  const pr = nav.project(e, _slot.x, _slot.z, {});
  const dirRoll = (subHash(C.seed, C.spawnN + 1, TAGS.dir) >>> 0) & 1;
  const dir = dirRoll === 0 ? 1 : -1;
  initPed(C, p, {
    e, dir, s: pr.s, lat: pr.lat, type: -1, initial: false,
  });
  p.x = _slot.x;
  p.z = _slot.z;
  p.px = p.x;
  p.pz = p.z;
  p.yaw = spot.yaw;
  p.role = ROLE.COMMUTE;
  C.stats.emerges++;
  void SPOT;
  return p;
}

/** Metro yoğun saatinde istasyon çıkış dalgaları. */
export function updateEmerge(C, dt) {
  const rush = rushAt(C.phase);
  const pl = C.player;
  if (!pl.valid) return;
  const spots = C.nav.spots;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    if (s.kind !== SPOT.METRO) continue;
    const dx = s.x - pl.x;
    const dz = s.z - pl.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > C.caps.spawnMax * C.caps.spawnMax || d2 < 8 * 8) continue;
    if (C.emergeAt[i] === 0) C.emergeAt[i] = C.time + 3 + 10 * ((subHash(C.seed, i, TAGS.slot) >>> 0) / 4294967296);
    if (C.time < C.emergeAt[i]) continue;
    if (rush < 0.3) {
      C.emergeAt[i] = C.time + 6;
      continue;
    }
    if (aliveCount(C) >= C.caps.total) continue;
    // dalga: 3 yaya, 0,8 sn arayla (kuyruk)
    C.emergeQ.push(C.time + 0.0, i, C.time + 0.8, i, C.time + 1.6, i);
    C.emergeAt[i] = C.time + 12 + 14 * (1 - rush) + 4 * ((subHash(C.seed, i + 1000, TAGS.slot) >>> 0) / 4294967296);
  }
  const q = C.emergeQ;
  for (let k = 0; k < q.length; k += 2) {
    if (C.time >= q[k]) {
      const sp = spots[q[k + 1]];
      if (aliveCount(C) < C.caps.total) spawnEmerge(C, sp);
      q.splice(k, 2);
      k -= 2;
    }
  }
  void dt;
}

/** Her 0,25 sn: kademe ataması (yakın tam animasyon, orta ucuz, uzak afiş). */
const _ord = new Int32Array(80);
const _ordD = new Float32Array(80);
export function assignTiers(C) {
  const pl = C.player;
  const caps = C.caps;
  let n = 0;
  for (let i = 0; i < C.peds.length; i++) {
    const p = C.peds[i];
    if (!p.alive) continue;
    const dx = p.x - pl.x;
    const dz = p.z - pl.z;
    const d = pl.valid ? Math.sqrt(dx * dx + dz * dz) : 50;
    p.dist = d;
    let j = n++;
    while (j > 0 && _ordD[j - 1] > d) {
      _ordD[j] = _ordD[j - 1];
      _ord[j] = _ord[j - 1];
      j--;
    }
    _ordD[j] = d;
    _ord[j] = i;
  }
  let near = 0;
  let mid = 0;
  for (let k = 0; k < n; k++) {
    const p = C.peds[_ord[k]];
    const d = _ordD[k];
    if (near < caps.near && d <= caps.nearR) {
      p.tier = 0;
      near++;
    } else if (mid < caps.mid && d <= caps.midR) {
      p.tier = 1;
      mid++;
    } else p.tier = 2;
  }
  for (let k = 0; k < n; k++) C.order[k] = _ord[k];
  C.orderN = n;
  C.tierCount[0] = near;
  C.tierCount[1] = mid;
  C.tierCount[2] = n - near - mid;
}

/** Uzaklık/kopma silmesi: soluk. Tavan aşımı: en uzaktakiler önce (sert tavan aşılırsa hepsi aynı anda; hedef düşüşünde yumuşak, 0,25 sn'de bir). */
export function updateDespawn(C) {
  const pl = C.player;
  const caps = C.caps;
  const lim = caps.despawnR;
  let alive = 0;
  for (let i = 0; i < C.peds.length; i++) {
    const p = C.peds[i];
    if (p.alive && p.fadeDir > 0) alive++;
    if (!p.alive || p.fadeDir < 0 || !pl.valid) continue;
    if (p.dist > lim) {
      p.fadeDir = -1;
      alive--;
    }
  }
  // kalabalık bütçesi dolmuşken, oyuncunun ARKASINDAKİ (görünmeyen) uzak yayalar solarak silinir → önüne yeni yayalar doğabilir (kare başına ≤ 1)
  if (alive >= Math.ceil(C.target * 0.92) && pl.valid) {
    for (let k = C.orderN - 1; k >= 0; k--) {
      const p = C.peds[C.order[k]];
      if (!p.alive || p.fadeDir < 0 || p.state === ST.QUEUE || p.state === ST.SHELTER || p.state === ST.ENTER) continue;
      if (p.dist < 20) break;
      const dx = p.x - pl.x;
      const dz = p.z - pl.z;
      const d = p.dist || 1;
      if ((dx * pl.fx + dz * pl.fz) / d < -0.35) {
        p.fadeDir = -1;
        alive--;
        break;
      }
    }
  }
  const hard = alive - Math.min(C.cap, caps.total);
  let soft = alive - Math.ceil(C.target * 1.18);
  if (hard <= 0 && soft <= 0) return;
  let drop = hard > 0 ? hard : 1;
  if (soft < drop && hard <= 0) drop = Math.min(1, soft);
  for (let k = C.orderN - 1; k >= 0 && drop > 0; k--) {
    const p = C.peds[C.order[k]];
    if (!p.alive || p.fadeDir < 0 || p.state === ST.QUEUE) continue;
    p.fadeDir = -1;
    drop--;
  }
}

export function killPed(C, p) {
  if (!p.alive) return;
  if (p.spot >= 0) {
    const occ = C.spotOcc[p.spot];
    if (occ && occ[p.slot] === p.i) occ[p.slot] = -1;
  }
  if (p.partner >= 0) {
    const q = C.peds[p.partner];
    if (q.alive && q.partner === p.i) {
      q.partner = -1;
      if (q.state === ST.CHAT && q.spot < 0) {
        q.state = ST.WALK;
        q.gesture = GESTURE.NONE;
      }
    }
  }
  p.alive = false;
  p.spot = -1;
  p.slot = -1;
  p.partner = -1;
  C.stats.despawned++;
}
