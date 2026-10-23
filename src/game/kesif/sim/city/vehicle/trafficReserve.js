/*
 * KEŞİF sim/city/vehicle — KAVŞAK REZERVASYONU (Neon Meridyen Faz 3, paket traffic_ai). SAF, es2020, tahsissiz sıcak yol.
 * Sözleşme §9: kavşak rezervasyonu FIFO + çıkış şeridi boşluğu (kutu tıkama yok). Bir araç kavşağa girmek için bir HAREKET (giriş şeridi → çıkış şeridi) ister;
 * istek ancak (1) verilmiş hiçbir çatışan rezervasyon yoksa, (2) daha eski bekleyen çatışan istek yoksa (FIFO; açlık yok), (3) yol vermesi gereken
 * yaklaşan öncelikli araç yoksa, (4) çıkış şeridinde araç boyu + 2 m yer varsa, (5) hareket yolunda engel yoksa verilir. Rezervasyon aracın kuyruğu
 * kavşaktan çıkana dek tutulur. Beklemeler yalnız ÖNCE verilmiş rezervasyonlara/eski isteklere bağlıdır → döngü yok → kilitlenme yok.
 *
 *   rtOf(TS, J) → {grants[], queue[], boxCars[], ticketSeq}                    kavşak çalışma zamanı durumu
 *   tryGrant(TS, c, J, mv, st) → bool        TS.deny: son reddedilme nedeni ('conflict'|'queue'|'approach'|'space'|'obstacle'|'ped')
 *   releaseGrant(TS, c) · dropTicket(TS, c) · purgeCar(TS, c)
 *   laneList(TS, deId, lane) → car[] (s artan)     pathBlocked(mv, obs, n, halfWid) → bool
 */
import { SIG, armSignal } from './trafficLights.js';
import { hasPriority, movesConflict } from './junctions.js';

const APPROACH_ETA = 3.2;
const APPROACH_SPEED = 1.5;
const STARVE_S = 10;

export function rtOf(TS, J) {
  let r = TS.rt[J.id];
  if (!r) {
    r = {
      grants: [], queue: [], boxCars: [], ticketSeq: 0,
    };
    TS.rt[J.id] = r;
  }
  return r;
}

export function laneList(TS, deId, lane) {
  return TS.lanes[deId * 3 + lane];
}

/** Hareket yolu engele (oyuncu aracı, park araç, oyuncu) yakın mı? Engel kutusu yerel çerçevesinde uzaklık < halfWid + 0,55. */
export function pathBlocked(mv, obs, n, halfWid) {
  const px = mv.px;
  const pz = mv.pz;
  const lim = halfWid + 0.55;
  for (let i = 0; i < n; i++) {
    const o = obs[i];
    if (o.y !== undefined && Math.abs(o.y - mv.yIn) > 3.5) continue;
    const cy = Math.cos(o.yaw);
    const sy = Math.sin(o.yaw);
    // yön vektörleri: ileri (−sin, −cos), sağ (cos, −sin)
    for (let k = 0; k <= mv.N; k += 1) {
      const dx = px[k] - o.x;
      const dz = pz[k] - o.z;
      const f = -(dx * sy + dz * cy);
      const r = dx * cy - dz * sy;
      const ex = Math.max(Math.abs(f) - o.hl, 0);
      const ez = Math.max(Math.abs(r) - o.hw, 0);
      if (ex * ex + ez * ez < lim * lim) return true;
    }
  }
  return false;
}

function removeFrom(arr, c) {
  const i = arr.indexOf(c);
  if (i >= 0) arr.splice(i, 1);
  return i >= 0;
}

export function dropTicket(TS, c) {
  if (c.ticketJ < 0) return;
  const J = TS.tn.junctions[c.ticketJ];
  if (J) removeFrom(rtOf(TS, J).queue, c);
  c.ticketJ = -1;
  c.ticketActive = false;
  c.ticket = 0;
  c.denyWhy = '';
}

export function releaseGrant(TS, c) {
  if (c.holdJ < 0) return;
  const J = TS.tn.junctions[c.holdJ];
  if (J) removeFrom(rtOf(TS, J).grants, c);
  c.holdJ = -1;
  c.grantMv = null;
}

/** Araç havuza dönerken tüm kavşak/şerit yapılarından çıkarılır. */
export function purgeCar(TS, c) {
  dropTicket(TS, c);
  releaseGrant(TS, c);
  if (c.J >= 0) {
    const J = TS.tn.junctions[c.J];
    if (J) removeFrom(rtOf(TS, J).boxCars, c);
    c.J = -1;
  }
  if (c.de >= 0) {
    const l = TS.lanes[c.de * 3 + c.lane];
    if (l) removeFrom(l, c);
    if (c.lcP < 1 && c.laneFrom !== c.lane) {
      const l2 = TS.lanes[c.de * 3 + c.laneFrom];
      if (l2) removeFrom(l2, c);
    }
  }
}

function deny(TS, why, active, c) {
  TS.deny = why;
  c.denyWhy = why;
  c.ticketActive = active;
  TS.stats.denials[why]++;
  return false;
}

/**
 * c: araç (lane kipi, J'ye yaklaşıyor), mv: istenen hareket, st: aracın kolundaki ışık durumu (SIG).
 * Başarılıysa c.clear = true, c.holdJ = J.id, c.grantMv = mv.
 */
export function tryGrant(TS, c, J, mv, st) {
  const rt = rtOf(TS, J);
  const tn = TS.tn;
  // bilet (FIFO sırası)
  if (c.ticketJ !== J.id) {
    c.ticketJ = J.id;
    c.ticket = ++rt.ticketSeq;
    c.ticketT = TS.t;
    rt.queue.push(c);
  }
  const grants = rt.grants;
  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];
    if (g === c) continue;
    if (movesConflict(J, mv.local, g.grantMv.local)) return deny(TS, 'conflict', true, c);
  }
  const queue = rt.queue;
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    if (q === c) break;
    // çıkış şeridi yüzünden bekleyen (etkin olmayan) bilet, 10 sn'i aşınca da sıra korur: aksi halde çatışan araçlar sürekli öne geçip onu aç bırakır
    if (q.grantMv !== null || !q.mv) continue;
    if (!q.ticketActive && !(q.denyWhy === 'space' && TS.t - q.ticketT > STARVE_S)) continue;
    if (movesConflict(J, mv.local, q.mv.local)) return deny(TS, 'queue', true, c);
  }
  // yol ver: öncelikli yaklaşan araç
  if (st === SIG.YIELD) {
    const moves = J.moves;
    for (let i = 0; i < moves.length; i++) {
      const m2 = moves[i];
      if (m2.inArm === mv.inArm) continue;
      if (!movesConflict(J, mv.local, m2.local)) continue;
      const st2 = armSignal(J.plan, m2.inArm, TS.t);
      const prio = J.plan.mode === 'free' ? hasPriority(m2, mv) : st2 === SIG.GREEN || st2 === SIG.YELLOW;
      if (!prio) continue;
      const list = TS.lanes[m2.deIn * 3 + m2.inLane];
      if (list.length === 0) continue;
      const q = list[list.length - 1];
      if (q.clear || q.mode !== 1 || q.v < APPROACH_SPEED) continue;
      const de2 = tn.dedges[q.de];
      const d = de2.s1 - (q.s + q.halfLen);
      if (d < 0 || d > 70) continue;
      if (d / q.v < APPROACH_ETA) return deny(TS, 'approach', true, c);
    }
  }
  // çıkış şeridi boşluğu
  const dOut = tn.dedges[mv.deOut];
  const outList = TS.lanes[mv.deOut * 3 + mv.outLane];
  let free = dOut.s1 - dOut.s0;
  if (outList.length > 0) {
    const f = outList[0];
    free = f.s - f.halfLen - dOut.s0; // hareketli öncü için pay YOK: kutu tıkama (öncü aniden durursa araç kavşakta kalırdı) sıfır olmalı
  }
  let pending = 0;
  for (let i = 0; i < grants.length; i++) {
    const g = grants[i];
    if (g === c) continue;
    const gm = g.grantMv;
    if (gm.deOut === mv.deOut && gm.outLane === mv.outLane) pending += g.len + 2;
  }
  if (free - pending < c.len + 2) return deny(TS, 'space', false, c);
  // yol üstünde engel / yaya geçidi
  if (TS.nObs > 0 && pathBlocked(mv, TS.obstacles, TS.nObs, c.halfWid)) return deny(TS, 'obstacle', false, c);
  if (TS.hooks.pedBlocked && (TS.hooks.pedBlocked(J.id, mv.inArm) || TS.hooks.pedBlocked(J.id, mv.outArm))) return deny(TS, 'ped', false, c);
  // verildi
  removeFrom(queue, c);
  c.ticketJ = -1;
  c.ticketActive = false;
  grants.push(c);
  c.holdJ = J.id;
  c.grantMv = mv;
  c.clear = true;
  TS.stats.grants++;
  return true;
}
