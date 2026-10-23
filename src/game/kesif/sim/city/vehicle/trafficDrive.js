/*
 * KEŞİF sim/city/vehicle — TRAFİK SÜRÜŞ KARARLARI (Neon Meridyen Faz 3, paket traffic_ai; trafficAI.js'in parçası). SAF, tahsissiz sıcak yol, es2020.
 * Her araç için bu adımın İVMESİ: serbest yol + öndeki araç (IDM) + DUR çizgisi sanal engeli (kırmızı/sarı/rezervasyon) + kavşak içi/çıkış şeridi öncüleri +
 * engeller (oyuncu aracı, park araç, oyuncu) + yan şeride geçerken yol verme. Durum TS (trafficAI) ve env üzerinden okunur; araç alanları yerinde güncellenir.
 *
 *   decideLane(TS, env, c, dt) → ivme · decideBox(TS, env, c, dt) → ivme
 *   updateYield(TS, c, dt)         oyuncu aracı hızla arkadan gelirse kenara kay (0,7 m) + korna olayı (20 sn bekleme)
 *   maybeLaneChange(TS, c, dt)     hedef harekete uygun şeride (tercihli şerit) kısıtlı şerit değişimi
 */
import { SIG, armSignal, armSignalLeft } from './trafficLights.js';
import {
  B_MAX, PASS_SLOW_SPEED, idmAcc, obstacleAcc, obstacleInfo,
} from './trafficFollow.js';
import {
  dropTicket, laneList, releaseGrant, rtOf, tryGrant,
} from './trafficReserve.js';

const MAX_LANES = 3;

function accFree(c, v0) {
  const r = c.v / v0;
  const r2 = r * r;
  return c.aMax * (1 - r2 * r2);
}

function beyondLeader(TS, c, J, mv, dc, acc, v0) {
  // dc: merkezden DUR çizgisine uzaklık (şerit kipi)
  const dedges = TS.tn.dedges;
  const rt = rtOf(TS, J);
  let a = acc;
  const bc = rt.boxCars;
  let best = null;
  let bg = Infinity;
  for (let i = 0; i < bc.length; i++) {
    const q = bc[i];
    if (q.mv.inArm !== mv.inArm || q.mv.inLane !== mv.inLane) continue;
    const g = dc + q.p - c.halfLen - q.halfLen;
    if (g < bg) {
      bg = g;
      best = q;
    }
  }
  if (best) a = Math.min(a, idmAcc(c.v, v0, bg, best.v, c.aMax, c.bComf, c.T, c.s0));
  const dOut = dedges[mv.deOut];
  const ol = laneList(TS, mv.deOut, mv.outLane);
  if (ol.length > 0) {
    const f = ol[0];
    const g = dc + mv.len + (f.s - dOut.s0) - c.halfLen - f.halfLen;
    a = Math.min(a, idmAcc(c.v, v0, g, f.v, c.aMax, c.bComf, c.T, c.s0));
  }
  return a;
}

export function decideLane(TS, env, c, dt) {
  const dedges = TS.tn.dedges;
  const junctions = TS.tn.junctions;
  const de = dedges[c.de];
  const J = junctions[de.to];
  const list = TS.lanes[c.de * MAX_LANES + c.lane];
  const idx = list.indexOf(c);
  const mv = c.mv;
  let v0 = de.limit * c.v0f * env.speedMul;
  if (c.yieldT > 0) v0 *= 0.8;
  const dLine = de.s1 - (c.s + c.halfLen);
  if (mv && mv.vmax < v0) v0 = Math.min(v0, Math.sqrt(mv.vmax * mv.vmax + 4 * Math.max(dLine, 0)));
  let acc = accFree(c, v0);
  let sigWait = false;
  const leader = idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
  if (leader) {
    const gap = leader.s - c.s - c.halfLen - leader.halfLen;
    acc = Math.min(acc, idmAcc(c.v, v0, gap, leader.v, c.aMax, c.bComf, c.T, c.s0));
    if (leader.v < 0.3 && leader.sigWait) sigWait = true;
    if (c.ticketJ >= 0 && dLine > 0) dropTicket(TS, c);
    // önünde (henüz geçmeyen) araç varken kavşak rezervasyonu tutulmaz: öncü kırmızıda/kuyrukta duruyorsa çapraz trafik beklemesin
    if (c.clear && c.relS === 0 && !leader.clear && dLine > 0) {
      releaseGrant(TS, c);
      c.clear = false;
      TS.stats.revokes++;
    }
  } else {
    let wall = false;
    if (!mv) {
      wall = true;
    } else {
      const arm = de.armTo;
      const st = armSignal(J.plan, arm, TS.t);
      // sarıda "geç" yalnız varış süresi yetiyorsa ya da güvenle durulamıyorsa; kırmızıda yalnız sert frenle de durulamıyorsa (taahhüt)
      let go;
      if (st === SIG.GREEN || st === SIG.YIELD) go = true;
      else if (st === SIG.YELLOW) {
        const yl = armSignalLeft(J.plan, arm, TS.t);
        go = dLine <= 0.3 || dLine < Math.max(c.v, 0.3) * (yl - 0.25) || dLine < (c.v * c.v) / 12 + 0.3;
      } else go = dLine <= 0 || dLine < (c.v * c.v) / 18 + 0.1;
      if (c.clear && !go && dLine > 0) {
        releaseGrant(TS, c);
        c.clear = false;
        TS.stats.revokes++;
      }
      if (!c.clear) {
        if (!go) {
          // bilet SİLİNMEZ (varış sırası korunur: kırmızıdan sonra eski biletliler önce gider); yalnız etkin değil
          c.ticketActive = false;
          c.denyWhy = ''; // kırmızıda beklerken eski "boşluk yok" nedeni kalıp başkalarını engellemesin
          wall = true;
          sigWait = true;
        } else {
          if (st === SIG.YIELD && dLine < 28) v0 = Math.min(v0, 3 + dLine * 0.25);
          if (c.holdJ < 0 && dLine <= (c.v * c.v) / 6 + 7) tryGrant(TS, c, J, mv, st);
          if (!c.clear && (st !== SIG.GREEN || dLine <= (c.v * c.v) / 7 + 3.5)) wall = true;
        }
      }
      if (c.clear) {
        if (c.holdJ < 0) c.clear = false;
        else acc = Math.min(acc, beyondLeader(TS, c, J, mv, de.s1 - c.s, acc, v0));
      }
    }
    if (wall) {
      const gW = dLine + (c.s0 - 0.4);
      acc = Math.min(acc, idmAcc(c.v, v0, gW, 0, c.aMax, c.bComf, c.T, c.s0));
      // kinematik alt sınır: çizgide tam durmak için gereken ivme (IDM'den yumuşak ama geç kalmaz)
      // (yalnız gerçekten fren gerektiğinde: uzaktaki kırmızıya doğru sürünmesin)
      const gs = dLine - 0.4;
      if (c.v > 1.0) {
        if (gs <= 0.05) acc = -B_MAX;
        else {
          const kin = (-c.v * c.v * 1.04) / (2 * gs);
          if (kin < -1.5) acc = Math.min(acc, kin);
        }
      }
    }
  }
  if (TS.nObs > 0) {
    const oa = obstacleAcc(c, TS.obstacles, TS.nObs, v0);
    if (oa < acc) {
      acc = oa;
      if (c.v < 0.5) c.obsWait += dt;
    } else if (c.obsWait > 0) c.obsWait = Math.max(0, c.obsWait - dt);
    if (obstacleInfo().slow && c.v > PASS_SLOW_SPEED) {
      const r = c.v / PASS_SLOW_SPEED;
      acc = Math.min(acc, c.aMax * (1 - r * r * r * r));
    }
  }
  c.sigWait = sigWait;
  return acc;
}

export function decideBox(TS, env, c, dt) {
  const dedges = TS.tn.dedges;
  const junctions = TS.tn.junctions;
  const mv = c.mv;
  const J = junctions[mv.j];
  const rt = rtOf(TS, J);
  const dIn = dedges[mv.deIn];
  let v0 = Math.min(dIn.limit * c.v0f * env.speedMul, mv.vmax);
  let acc = accFree(c, v0);
  const bc = rt.boxCars;
  for (let i = 0; i < bc.length; i++) {
    const q = bc[i];
    if (q === c || q.mv.inArm !== mv.inArm || q.mv.inLane !== mv.inLane || q.p <= c.p) continue;
    const g = q.p - c.p - c.halfLen - q.halfLen;
    acc = Math.min(acc, idmAcc(c.v, v0, g, q.v, c.aMax, c.bComf, c.T, c.s0));
  }
  const dOut = dedges[mv.deOut];
  const ol = laneList(TS, mv.deOut, mv.outLane);
  if (ol.length > 0) {
    const f = ol[0];
    const g = mv.len - c.p + (f.s - dOut.s0) - c.halfLen - f.halfLen;
    acc = Math.min(acc, idmAcc(c.v, v0, g, f.v, c.aMax, c.bComf, c.T, c.s0));
  }
  if (TS.nObs > 0) {
    const oa = obstacleAcc(c, TS.obstacles, TS.nObs, v0);
    if (oa < acc) {
      acc = oa;
      if (c.v < 0.5) c.obsWait += dt;
    } else if (c.obsWait > 0) c.obsWait = Math.max(0, c.obsWait - dt);
  }
  c.sigWait = false;
  return acc;
}

/* ---------------------------------------------------------------- oyuncuya yol ver */
export function updateYield(TS, c, dt) {
  if (c.mode !== 1) {
    c.yieldT = 0;
    return;
  }
  if (c.yieldT > 0) c.yieldT -= dt;
  if (c.honkCd > 0) c.honkCd -= dt;
  let target = 0;
  if (c.yieldT > 0) target = 0.7;
  else if (TS.nObs > 0 && c.v > 0.5) {
    const sy = Math.sin(c.yaw);
    const cy = Math.cos(c.yaw);
    for (let i = 0; i < TS.nObs; i++) {
      const o2 = TS.obstacles[i];
      if (o2.kind !== 1) continue; // yalnız sürülen oyuncu aracı
      const dx = o2.x - c.x;
      const dz = o2.z - c.z;
      const fwd = dx * -sy + dz * -cy;
      if (fwd > -1 || fwd < -12) continue;
      const lat = dx * cy + dz * -sy;
      if (Math.abs(lat) > 2.4) continue;
      const rel = o2.vx * -sy + o2.vz * -cy - c.v;
      if (rel > 5) {
        c.yieldT = 2.2;
        target = 0.7;
        if (c.honkCd <= 0) {
          c.honkCd = 20;
          TS.stats.honks++;
          TS.events.push({
            type: 'honk', id: c.id, x: c.x, y: c.y, z: c.z,
          });
        }
        break;
      }
    }
  }
  c.lat += (target - c.lat) * Math.min(1, 4 * dt);
  if (Math.abs(c.lat) < 0.002) c.lat = 0;
}

/* ---------------------------------------------------------------- şerit değiştirme (isteğe bağlı, sınırlı) */
export function maybeLaneChange(TS, c, dt) {
  const dedges = TS.tn.dedges;
  if (c.lcP < 1) {
    c.lcP = Math.min(1, c.lcP + dt / 1.6);
    // şerit değiştirirken araç iki şeridin de listesinde kalır (ikisindeki takipçiler ve doğma onu görür); neredeyse bitince (≥ %90) eski listeden çıkar
    if (c.lcP >= 0.9 && c.laneFrom !== c.lane) {
      const old = laneList(TS, c.de, c.laneFrom);
      const oi = old.indexOf(c);
      if (oi >= 0) old.splice(oi, 1);
    }
    return;
  }
  if (c.lcCool > 0) {
    c.lcCool -= dt;
    return;
  }
  const de = dedges[c.de];
  const mv = c.mv;
  if (de.lanes < 2 || !mv || mv.preferred || c.clear || c.v < 2) return;
  if (c.s < de.s0 + 10 || c.s > de.s1 - 36) return;
  const want = mv.turn === 1 ? de.lanes - 1 : 0;
  if (want === c.lane) return;
  const to = c.lane + (want > c.lane ? 1 : -1);
  const list = laneList(TS, c.de, to);
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    const rel = q.s - c.s;
    if (rel > -(14 + c.halfLen + q.halfLen) && rel < 22 + c.halfLen + q.halfLen) {
      c.lcCool = 1.2;
      return;
    }
    if (rel > 0 && q.v + 2 < c.v && rel < 38) {
      c.lcCool = 1.2;
      return;
    }
  }
  let i = 0;
  while (i < list.length && list[i].s < c.s) i++;
  list.splice(i, 0, c);
  c.laneFrom = c.lane;
  c.lane = to;
  c.lcP = 0;
  c.lcCool = 4;
  // yeni şeritten hedef harekete yeniden eşle
  const alt = de.nextMoves[to];
  for (let k = 0; k < alt.length; k++) if (alt[k].outArm === mv.outArm) c.mv = alt[k];
  TS.stats.laneChanges++;
}
