/*
 * KEŞİF sim/city/ped — YAYA YÜRÜYÜŞÜ: kenar izleme, düğümde sonraki kenar/hedef rotası, zebra geçidi (ışık + boşluk), komşu yavaşlama, araç kaçınma. SAF, es2020.
 * Durumlar: WALK (kenarda yürür), WAIT (kaldırım kenarında bekler), CROSS (zebrada). Diğer durumlar crowdSpots.js'tedir.
 */
import { EK } from './pedNav.js';
import { PED } from '../vehicle/trafficLights.js';
import { ST } from './pedData.js';
import {
  R_PED, TAGS, enterEdge, gaitRate, pickNextEdge, rnd, stepFollow, wrapPi, yawOf,
} from './crowdCore.js';
import { crossingConflict, pointInVehicle, vehicleThreat } from './crowdVehicles.js';

export const GESTURE = Object.freeze({
  NONE: 0, PHONE: 1, WAVE: 2, PHOTO: 3, UMBRELLA: 4, POCKET: 5, DANCE: 6, CHAT: 7, HOP: 8, CARRY: 9,
});
const KERB_BACK = 0.55;
const _sig = { state: 0, left: 0, walkIn: 0 };
const _thr = {
  t: 99, ex: 0, ez: 0, d: 0, lat: 0,
};

/* ------------------------------------------------------------------------------------------------
 * Komşu yavaşlama / kaçınma (uzamsal karma)
 * ---------------------------------------------------------------------------------------------- */
export function gridCell(x, z) {
  return (((Math.floor(x / 2.5) * 73856093) ^ (Math.floor(z / 2.5) * 19349663)) >>> 0) & 1023;
}

function neighborLimit(C, p, hx, hz) {
  const G = C.grid;
  let lim = 99;
  const cx = Math.floor(p.x / 2.5);
  const cz = Math.floor(p.z / 2.5);
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      let q = G.head[((((cx + ix) * 73856093) ^ ((cz + iz) * 19349663)) >>> 0) & 1023];
      while (q >= 0) {
        const o = C.peds[q];
        q = G.next[q];
        if (o === p || o.fade < 0.2) continue;
        const rx = o.x - p.x;
        const rz = o.z - p.z;
        const d2 = rx * rx + rz * rz;
        if (d2 > 5.8) continue;
        const f = rx * hx + rz * hz;
        const l = rx * -hz + rz * hx;
        if (o.i === p.partner) {
          if (f < -2.2) lim = Math.min(lim, 0.45); // partneri bekle
          continue;
        }
        if (f > 0.05 && f < 1.9 && Math.abs(l) < 0.62) {
          const ohx = -Math.sin(o.yaw);
          const ohz = -Math.cos(o.yaw);
          const same = ohx * hx + ohz * hz;
          if (o.speed < 0.25 && Math.abs(l) < 0.5) {
            // duran biri: yanından geç
            p.avoid += l >= 0 ? -0.45 : 0.45;
            p.avoidT = 0.9;
            lim = Math.min(lim, 0.5 + 0.4 * Math.min(1, f / 1.2));
          } else if (same > 0.3) {
            lim = Math.min(lim, Math.max(0.2, o.speed) * Math.min(1, Math.max(0.35, (f - 0.45) / 1.2)));
            if (o.speed < p.vmax - 0.35) {
              p.avoid += l >= 0 ? -0.3 : 0.3;
              p.avoidT = 0.7;
            }
          } else {
            p.avoid += 0.35; // karşıdan gelen: sağa
            p.avoidT = 0.8;
            lim = Math.min(lim, p.vmax * 0.75);
          }
        } else if (d2 < 0.2) {
          // iç içe: hafif ayır
          const dd = Math.sqrt(d2) || 0.1;
          const px = p.x - (rx / dd) * 0.04;
          const pz = p.z - (rz / dd) * 0.04;
          if (C.probe.free(px, pz, R_PED, C.nav.ekind[p.e] === EK.CROSS)) {
            p.x = px;
            p.z = pz;
          }
        }
      }
    }
  }
  return lim;
}

/** Oyuncu yürüyorsa yolundaki yayaya yer ver (yan adım) ya da bekle; hız sınırı döner. */
function playerLimit(C, p, hx, hz) {
  const pl = C.player;
  if (!pl.valid || pl.driving) return 99;
  const rx = pl.x - p.x;
  const rz = pl.z - p.z;
  const f = rx * hx + rz * hz;
  if (f < -0.2 || f > 1.9) return 99;
  const l = rx * -hz + rz * hx;
  if (Math.abs(l) > 0.7) return 99;
  p.avoid += l >= 0 ? -0.55 : 0.55;
  p.avoidT = 0.9;
  return f < 0.75 ? 0 : 0.45;
}

/** Her durumda araç tehdidi: mekânda duran/konuşan/dans eden yaya da kenara atlar (asla vurulmaz). true: yan adıma geçti. */
export function dodgeVehicle(C, p) {
  if (C.veh.n === 0 || p.state === ST.STEP || p.state === ST.ENTER) return false;
  if (!vehicleThreat(p.x, p.z, C.veh.list, C.veh.n, _thr, p.i & 1 ? 1 : -1) || _thr.t >= 1.6) return false;
  C.stats.dodges++;
  if (p.spot >= 0) {
    const occ = C.spotOcc[p.spot];
    if (occ && occ[p.slot] === p.i) occ[p.slot] = -1;
    p.spot = -1;
    p.slot = -1;
    p.spotKind = -1;
  }
  p.approach = 0;
  startStep(C, p, _thr.ex, _thr.ez, _thr.t);
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Zebra geçidi
 * ---------------------------------------------------------------------------------------------- */
function sigOf(C, c) {
  if (!C.signals) return null;
  const r = C.signals(c.jun, c.arm, C.time, _sig);
  return r || null;
}

/** Kaldırım kenarında: geçebilir mi? */
export function canCross(C, p, c) {
  const need = (c.roadB - c.roadA + 1.2) / Math.max(1.15, p.vmax);
  const sig = sigOf(C, c);
  let T = need + 1.0;
  if (sig && sig.left !== Infinity) {
    if (sig.state !== PED.WALK) return false;
    T = 2.4; // ışık kontrollü: yalnız geç kalan/dönen araçlar
  } else if (p.wait > 7) {
    T = Math.max(1.6, need * 0.45); // sabır: araçlar yaya engelini görür ve yavaşlar
  }
  if (C.veh.n > 0 && crossingConflict(c, C.veh.list, C.veh.n, T, 0.4)) return false;
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Yaya adımı (WALK/WAIT/CROSS)
 * ---------------------------------------------------------------------------------------------- */
export function nextEdgeAtNode(C, p, node, fromEdge) {
  if (p.goal >= 0 && p.rp < p.rn) return p.route[p.rp++];
  return pickNextEdge(C, p, node, fromEdge);
}

function gestureAuto(p) {
  if (p.gestureT > 0) return;
  if (p.umb > 0.5) p.gesture = GESTURE.UMBRELLA;
  else if (p.look.acc === 4) p.gesture = GESTURE.CARRY;
  else if (p.gesture !== GESTURE.NONE && p.gesture !== GESTURE.UMBRELLA && p.gesture !== GESTURE.CARRY && p.gesture !== GESTURE.PHONE) p.gesture = GESTURE.NONE;
}

export function updateWalker(C, p, dt) {
  const nav = C.nav;
  let e = p.e;
  if (e < 0) {
    p.state = ST.WALK;
    return;
  }
  const len = nav.elen[e];
  const kind = nav.ekind[e];
  let vT = p.vmax;
  if (p.umb > 0.5) vT *= 0.93;
  if (p.gesture === GESTURE.PHONE && p.state === ST.WALK) vT *= 0.78;
  const hx = -Math.sin(p.yaw);
  const hz = -Math.cos(p.yaw);
  p.age += dt;
  let c = null;
  if (kind === EK.CROSS) {
    c = nav.crossings[nav.ecross[e]];
    if (p.state === ST.WALK && p.s < c.roadA + 0.1 && p.s + vT * dt >= c.roadA - KERB_BACK) {
      // kaldırım kenarı: karar
      p.wait = 0;
      p.walkSig = 0;
      p.state = ST.WAIT;
      p.speed = Math.min(p.speed, 0.6);
    } else if (p.state === ST.WALK && p.s >= c.roadA + 0.1 && p.s <= c.roadB + 0.3) {
      p.state = ST.CROSS; // yolun ortasında (geri dönen/çıkan)
    }
  }
  if (p.state === ST.WAIT) {
    vT = 0;
    p.speed = Math.max(0, p.speed - 5 * dt);
    p.wait += dt;
    if (c) {
      p.walkSig -= dt;
      if (p.walkSig <= 0) {
        p.walkSig = 0.2 + 0.05 * rnd(p, p.visits, TAGS.wave);
        if (canCross(C, p, c)) {
          p.state = ST.CROSS;
          C.stats.crossings++;
        }
      }
    } else p.state = ST.WALK;
    if (p.state === ST.WAIT) {
      // kenara dönük bekle
      const wy = yawOf(nav.eux[e] * p.dir, nav.euz[e] * p.dir);
      p.yaw += wrapPi(wy - p.yaw) * Math.min(1, 6 * dt);
      p.phaseRate = 0;
      gestureAuto(p);
      return;
    }
  }
  if (p.state === ST.CROSS && c) {
    // geçit hızı: yanıp sönerken/süre azken hızlan
    vT = Math.max(vT, 1.35);
    const sig = sigOf(C, c);
    if (sig && sig.left !== Infinity && sig.state !== PED.WALK) vT = Math.max(vT, 1.9);
    if (p.s >= c.roadB + 0.4) p.state = ST.WALK;
  }
  // araç tehdidi (yaya kenara kaçar / hızlanır; hiçbir zaman çarpılmaz)
  if (C.veh.n > 0 && (p.state === ST.CROSS || (C.tick + p.i) % 2 === 0)) {
    if (vehicleThreat(p.x, p.z, C.veh.list, C.veh.n, _thr, p.i & 1 ? 1 : -1) && _thr.t < 1.6) {
      C.stats.dodges++;
      if (p.state === ST.CROSS) {
        vT = Math.max(vT, 2.9);
        if (_thr.t < 0.6) {
          p.gesture = GESTURE.HOP;
          p.gestureT = 0.55;
        }
      } else {
        startStep(C, p, _thr.ex, _thr.ez, _thr.t);
        return;
      }
    }
  }
  // kilitlenme supabı (QA4-002): 4 sn'den uzun süre sürünen yürüyen yaya 3 sn komşu sınırını yok sayar (yayalar fiziksel değil; karşıt akış düğümünde yığılma çözülür)
  if (p.ghostT > 0) p.ghostT -= dt;
  else if (p.state === ST.WALK && p.speed < 0.15) {
    p.slowT += dt;
    if (p.slowT > 4) {
      p.ghostT = 3;
      p.slowT = 0;
    }
  } else p.slowT = 0;
  const lim = p.ghostT > 0 ? playerLimit(C, p, hx, hz) : Math.min(neighborLimit(C, p, hx, hz), playerLimit(C, p, hx, hz));
  if (lim < vT) vT = lim;
  // araç gövdesine yürüme (park/duran araç): önce bak, bekle
  // araç yüzünden 2,5 sn'den uzun bekleyen yaya "tıkalı" sayılıp geri döner (park etmiş araç yolu kapatınca sonsuza dek beklemesin: QA4-005)
  if (C.veh.n > 0 && pointInVehicle(p.x + hx * 0.7, p.z + hz * 0.7, R_PED, C.veh.list, C.veh.n)) {
    vT = 0;
    p.vehWait += dt;
    if (p.vehWait > 2.5) {
      p.blockedT = 1.1;
      p.vehWait = 0;
    }
  } else p.vehWait = 0;
  if (p.blockedT > 1.0) {
    // tıkalı: kenarda geri dön
    if (kind !== EK.CROSS || p.state !== ST.CROSS) {
      p.dir = -p.dir;
      p.s = len - p.s;
      p.lat = -p.lat;
      p.latT = p.lat * 0.4; // cepten çıkış: merkeze yakın şeride dön
      p.avoid = 0;
      p.avoidT = 0;
      p.blockedT = 0;
      p.visits++;
      p.rp = p.rn; // rota iptal
      p.goal = -1;
      C.stats.stuck++;
      p.stuckN++;
      if (p.stuckN >= 2 && p.fadeDir > 0) p.fadeDir = -1; // iki geri dönüşte de tıkalı: soluk sil (yaya çıkmaza sıkışmasın)
      // tıkanan kenar 40 sn yaya rotalarında seçilmez
      C.blocked[e] = 1;
      C.blockedAt[e] = C.time;
    }
  }
  stepFollow(C, p, dt, vT);
  p.phaseRate = gaitRate(p.speed, p.look.h);
  p.phase += p.phaseRate * dt;
  if (p.phase > 6283) p.phase -= 6283;
  gestureAuto(p);
  // hedefe varış
  if (p.goal >= 0 && p.rp >= p.rn && p.e === C.nav.spots[p.goal].edge) {
    const sp = C.nav.spots[p.goal];
    const target = p.dir > 0 ? sp.s : nav.elen[e] - sp.s;
    if (p.s >= target - 0.2) {
      p.goalArrived = true;
      return;
    }
  }
  if (p.s >= len - 0.32) {
    e = p.e;
    const node = p.dir > 0 ? nav.eb[e] : nav.ea[e];
    if (p.state === ST.CROSS) p.state = ST.WALK;
    p.visits++;
    const nxt = nextEdgeAtNode(C, p, node, e);
    enterEdge(C, p, nxt, node);
  }
}

/** Araçtan kaçış: yan adım (hızlı) + sıçrama. */
export function startStep(C, p, ex, ez, t) {
  p.state = ST.STEP;
  p.stepLock = false;
  p.sx = ex;
  p.sz = ez;
  p.tmr = 0.85;
  p.gesture = t < 0.7 ? GESTURE.HOP : p.gesture;
  p.gestureT = t < 0.7 ? 0.5 : p.gestureT;
}

export function updateStep(C, p, dt) {
  p.tmr -= dt;
  // tehdit sürüyorsa yönü güncelle ve süreyi uzat
  let thrT = 99;
  let thrLat = 0;
  if (C.veh.n > 0 && vehicleThreat(p.x, p.z, C.veh.list, C.veh.n, _thr, p.i & 1 ? 1 : -1)) {
    thrT = _thr.t;
    thrLat = _thr.lat;
  }
  if (thrT < 1.2) {
    // yön değiştirme: yalnız araç ekseninin öbür yanına gerçekten geçtiyse (titreme/çözülme yok)
    if (!p.stepLock && _thr.ex * p.sx + _thr.ez * p.sz < 0 && Math.abs(_thr.lat) > 0.5) {
      p.sx = _thr.ex;
      p.sz = _thr.ez;
    }
    if (p.tmr < 0.45) p.tmr = 0.45;
    if (_thr.t < 0.5) {
      p.gesture = GESTURE.HOP;
      p.gestureT = 0.4;
    }
  }
  const v = 3.8;
  const nx = p.x + p.sx * v * dt;
  const nz = p.z + p.sz * v * dt;
  const road = C.nav.ekind[p.e] === EK.CROSS;
  if (C.probe.free(nx, nz, R_PED, road)) {
    p.x = nx;
    p.z = nz;
    p.speed = v;
  } else {
    // bu yan tıkalı: öbür yana dene (aksi halde yerinde sıçra; araç tarafı yumuşak kutuyla savuşturur)
    const ox = p.x - p.sx * v * dt;
    const oz = p.z - p.sz * v * dt;
    // öbür yana geçmek aracın önünden geçmek demektir: yalnız araç yeterince uzaksa (koridoru aşacak süre var)
    const canCross = thrT === 99 || thrT > (Math.abs(thrLat) + 1.9) / v + 0.35;
    if (canCross && C.probe.free(ox, oz, R_PED, road)) {
      p.sx = -p.sx;
      p.sz = -p.sz;
      p.stepLock = true;
      p.x = ox;
      p.z = oz;
      p.speed = v;
    } else {
      p.speed = 0;
      if (p.gesture !== GESTURE.HOP) {
        p.gesture = GESTURE.HOP;
        p.gestureT = 0.4;
        C.stats.vehicleHits++;
      }
    }
  }
  p.phaseRate = gaitRate(Math.min(p.speed, 3), p.look.h);
  p.phase += p.phaseRate * dt;
  if (p.tmr <= 0) {
    p.state = ST.WALK;
    p.blockedT = 0;
    // kenara yeniden bağla (aynı yön)
    enterEdge(C, p, p.e, p.dir > 0 ? C.nav.ea[p.e] : C.nav.eb[p.e]);
  }
}
