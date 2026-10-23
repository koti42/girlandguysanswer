/*
 * KEŞİF sim/city/vehicle — KAVŞAK MODELİ (Neon Meridyen Faz 3, paket traffic_ai). SAF: three/DOM/Math.random/Date.now yok, worker-güvenli, es2020.
 * roadNet(seed) grafından (düğüm + kenar + kavşak planı) trafik ağı kurar: YÖNLÜ KENARLAR (şeritli), her düğümde KAVŞAK (kollar, hareketler,
 * çatışma matrisi, ışık planı). Sağdan trafik: şerit 0 orta çizgiye en yakın, şerit n−1 kaldırıma en yakın.
 *
 *   buildTrafficNet(net, opts?) → tnet           net: roadNet benzeri {nodes, edges, intersections, nearest?}; opts {seed, halfWidth(node, 'v'|'h'), minPhase}
 *   trafficNet(seed) → tnet                      roadNet(seed) üzerinden, önbellekli (LRU 4)
 *   tnet = {seed, dedges[], junctions[] (düğüm kimliğine göre), edgeCount, deOf(edgeId, dir), stats}
 *   DEdge   {id, edge, dir, from, to, armFrom, armTo, x0,z0, hx,hz, rx,rz, yaw, D, s0, s1, lanes, laneW, limit, kind, bridge, tunnel, ps, py, rev, nextMoves[lane][]}
 *           yönlü kenar kimliği = edge*2 + dir (dir 0: a→b, 1: b→a). s: from düğüm merkezinden eksen boyunca (m); şerit alanı [s0, s1]; s1 = DUR çizgisi
 *   Junction {id, node, x,y,z, arms[4]{present, out, in, clear}, plan (trafficLights), moves[], movesBy[arm][lane][], deadEnd}
 *   Move     {id, local, j, inArm, inLane, outArm, outLane, turn, deIn, deOut, len, vmax, preferred, N, px, pz, pyaw, cum, yIn, yOut}   (kavşak içi yol: düz+yay+düz)
 *   lanePose(de, lane, s, out) · yAt(de, s) · movePose(mv, p, out) · movesConflict(J, a, b) · hasPriority(a, b) · rightArm(arm)
 *   dedgeSuccessors(tnet, deId) → [deId…]        routeDedges(tnet, from, to) → deId[] | null (en kısa yol, U dönüşü yok)
 *   nearestDedges(tnet, net, x, z) → [deId,deId]  (roadNet.nearest kenarının iki yönü)
 *
 * Kollar: 0 K (−z), 1 D (+x), 2 G (+z), 3 B (−x). Dönüş: f_in = −kol vektörü; çapraz = f×g > 0 → sağa, < 0 → sola, 0 → düz (U dönüşü yok).
 * Dur çizgisi: gelen kolda düğüm merkezinden (dik yolun yarı genişliği + 3,4) m — zebra [hw, hw+3) aralığındadır, çizgi onun dışındadır.
 */
import { Lru } from '../cityPlanKit.js';
import { roadNet } from '../roadNet.js';
import { halfWidth } from '../cityRoads.js';
import { makeSignalPlan } from './trafficLights.js';

export const ARM_VEC = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0]]);
export const TURN = Object.freeze({ STRAIGHT: 0, RIGHT: 1, LEFT: 2 });
export const CONFLICT_DIST = 3.2;
/** Dönen araçların gövdesi yolun dışına savrulur (arka süpürme): FARKLI kollardan, dönüş içeren çiftlerde daha geniş güvenlik payı. */
export const CONFLICT_DIST_TURN = 4.1;
export const STOP_MARGIN = 3.4;
const V_RIGHT = 4.8;
const V_LEFT = 6.6;
const AXIS_EPS = 1e-3;

export function rightArm(arm) {
  return (arm + 3) & 3;
}

function armOfVec(dx, dz) {
  if (Math.abs(dx) < AXIS_EPS && dz < 0) return 0;
  if (Math.abs(dz) < AXIS_EPS && dx > 0) return 1;
  if (Math.abs(dx) < AXIS_EPS && dz > 0) return 2;
  if (Math.abs(dz) < AXIS_EPS && dx < 0) return 3;
  return -1;
}

function defaultHalf(tn, node, axis, dedgesAt) {
  // eksendeki bir kenardan: arter (2 şerit) 10, sokak 6
  const l = dedgesAt[node.id];
  let w = 0;
  if (l) {
    for (let i = 0; i < l.length; i++) {
      const e = l[i];
      const vertical = e.arm === 0 || e.arm === 2;
      if ((axis === 'v') === vertical) w = Math.max(w, e.lanes >= 2 ? 10 : 6);
    }
  }
  return w || 6;
}

/* ------------------------------------------------------------------------------------------------
 * Yönlü kenar geometrisi
 * ---------------------------------------------------------------------------------------------- */
export function yAt(de, s) {
  const ps = de.ps;
  const py = de.py;
  const n = ps.length;
  if (s <= ps[0]) return py[0];
  if (s >= ps[n - 1]) return py[n - 1];
  for (let i = 1; i < n; i++) {
    if (s <= ps[i]) {
      const t = (s - ps[i - 1]) / (ps[i] - ps[i - 1] || 1);
      return py[i - 1] + (py[i] - py[i - 1]) * t;
    }
  }
  return py[n - 1];
}

/** Şerit ekseni üstünde konum: yan kayma = (şerit+0,5)·şerit genişliği (sağa). out {x,y,z,yaw}. */
export function lanePose(de, lane, s, out) {
  const off = (lane + 0.5) * de.laneW;
  out.x = de.x0 + de.hx * s + de.rx * off;
  out.z = de.z0 + de.hz * s + de.rz * off;
  out.y = yAt(de, s);
  out.yaw = de.yaw;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Hareket (kavşak içi yol): düz parça + daire yayı + düz parça (dönüşlerde); düz geçişte yumuşak yanal kayma.
 * Yaylar yolun asfalt bölgesinde kalır (sağ dönüş yarıçapı 5, sol 9): iç köşe kaldırımına taşmaz.
 * ---------------------------------------------------------------------------------------------- */
const ARC_STEPS = 8;
const R_RIGHT = 5;
const R_LEFT = 9;
const HALF_PI = Math.PI / 2;

function smooth3(u) {
  return u * u * (3 - 2 * u);
}

function yawOfDir(dx, dz) {
  return Math.atan2(-dx, -dz);
}

function pushLine(pts, x0, z0, x1, z1, yaw, skipFirst) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / 4));
  for (let i = skipFirst ? 1 : 0; i <= n; i++) {
    const u = i / n;
    pts.push([x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, yaw]);
  }
}

/** Hareket örnekleri [x,z,yaw][]: (x0,z0) yönü (fx,fz) ile gelir, (x1,z1) yönü (gx,gz) ile çıkar. */
function buildPath(x0, z0, fx, fz, x1, z1, gx, gz, turn) {
  const pts = [];
  const dx = x1 - x0;
  const dz = z1 - z0;
  const a = dx * fx + dz * fz;
  const b = dx * gx + dz * gz;
  if (turn === TURN.STRAIGHT || a < 0.5 || b < 0.5) {
    const rx = -fz;
    const rz = fx;
    const Ld = a;
    const lat = dx * rx + dz * rz;
    const n = Math.max(6, Math.ceil(Math.hypot(dx, dz) / 3));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const w = smooth3(u);
      const dw = 6 * u * (1 - u);
      const x = x0 + fx * Ld * u + rx * lat * w;
      const z = z0 + fz * Ld * u + rz * lat * w;
      const tx = fx * Ld + rx * lat * dw;
      const tz = fz * Ld + rz * lat * dw;
      pts.push([x, z, yawOfDir(tx, tz)]);
    }
    return pts;
  }
  const R = Math.max(2.5, Math.min(turn === TURN.RIGHT ? R_RIGHT : R_LEFT, a - 0.3, b - 0.3));
  const xx = x0 + fx * a;
  const xz = z0 + fz * a;
  const t0x = xx - fx * R;
  const t0z = xz - fz * R;
  const t1x = xx + gx * R;
  const t1z = xz + gz * R;
  const nx = turn === TURN.RIGHT ? -fz : fz;
  const nz = turn === TURN.RIGHT ? fx : -fx;
  const cx = t0x + nx * R;
  const cz = t0z + nz * R;
  const v0x = t0x - cx;
  const v0z = t0z - cz;
  const v1x = t1x - cx;
  const v1z = t1z - cz;
  const y0 = yawOfDir(fx, fz);
  pushLine(pts, x0, z0, t0x, t0z, y0, false);
  for (let i = 1; i <= ARC_STEPS; i++) {
    const th = (i / ARC_STEPS) * HALF_PI;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const tx = -v0x * sn + v1x * c;
    const tz = -v0z * sn + v1z * c;
    pts.push([cx + v0x * c + v1x * sn, cz + v0z * c + v1z * sn, yawOfDir(tx, tz)]);
  }
  pushLine(pts, t1x, t1z, x1, z1, yawOfDir(gx, gz), true);
  return pts;
}

function buildMove(tn, J, inArm, inLane, outArm, outLane, turn) {
  const dIn = tn.dedges[J.arms[inArm].in];
  const dOut = tn.dedges[J.arms[outArm].out];
  const offIn = (inLane + 0.5) * dIn.laneW;
  const offOut = (outLane + 0.5) * dOut.laneW;
  const x0 = dIn.x0 + dIn.hx * dIn.s1 + dIn.rx * offIn;
  const z0 = dIn.z0 + dIn.hz * dIn.s1 + dIn.rz * offIn;
  const x3 = dOut.x0 + dOut.hx * dOut.s0 + dOut.rx * offOut;
  const z3 = dOut.z0 + dOut.hz * dOut.s0 + dOut.rz * offOut;
  const pts = buildPath(x0, z0, dIn.hx, dIn.hz, x3, z3, dOut.hx, dOut.hz, turn);
  const N = pts.length - 1;
  const px = new Float32Array(N + 1);
  const pz = new Float32Array(N + 1);
  const pyaw = new Float32Array(N + 1);
  const cum = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    px[i] = pts[i][0];
    pz[i] = pts[i][1];
    pyaw[i] = pts[i][2];
    if (i > 0) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
  }
  const wantLane = turn === TURN.RIGHT ? dIn.lanes - 1 : turn === TURN.LEFT ? 0 : -1;
  return {
    id: J.id * 64 + J.moves.length,
    local: J.moves.length,
    j: J.id,
    inArm,
    inLane,
    outArm,
    outLane,
    turn,
    deIn: dIn.id,
    deOut: dOut.id,
    len: cum[N],
    vmax: turn === TURN.RIGHT ? V_RIGHT : turn === TURN.LEFT ? V_LEFT : 99,
    preferred: wantLane < 0 || wantLane === inLane,
    N,
    px,
    pz,
    pyaw,
    cum,
    yIn: yAt(dIn, dIn.s1),
    yOut: yAt(dOut, dOut.s0),
  };
}

/** p: durak çizgisinden itibaren yay uzunluğu (m). out {x,y,z,yaw}. */
export function movePose(mv, p, out) {
  const cum = mv.cum;
  const N = mv.N;
  let q = p;
  if (q < 0) q = 0;
  else if (q > cum[N]) q = cum[N];
  let k = 0;
  while (k < N - 1 && cum[k + 1] < q) k++;
  const span = cum[k + 1] - cum[k];
  const t = span > 0 ? (q - cum[k]) / span : 0;
  out.x = mv.px[k] + (mv.px[k + 1] - mv.px[k]) * t;
  out.z = mv.pz[k] + (mv.pz[k + 1] - mv.pz[k]) * t;
  out.y = mv.yIn + (mv.yOut - mv.yIn) * (cum[N] > 0 ? q / cum[N] : 0);
  let dy = mv.pyaw[k + 1] - mv.pyaw[k];
  if (dy > Math.PI) dy -= Math.PI * 2;
  else if (dy < -Math.PI) dy += Math.PI * 2;
  out.yaw = mv.pyaw[k] + dy * t;
  return out;
}

function segSegDist2(ax, az, bx, bz, cx, cz, dx, dz) {
  // iki doğru parçası arası en küçük uzaklığın karesi
  const ux = bx - ax;
  const uz = bz - az;
  const vx = dx - cx;
  const vz = dz - cz;
  const den = ux * vz - uz * vx;
  if (Math.abs(den) > 1e-9) {
    const t = ((cx - ax) * vz - (cz - az) * vx) / den;
    const s = ((cx - ax) * uz - (cz - az) * ux) / den;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return 0;
  }
  return Math.min(ptSeg2(ax, az, cx, cz, dx, dz), ptSeg2(bx, bz, cx, cz, dx, dz), ptSeg2(cx, cz, ax, az, bx, bz), ptSeg2(dx, dz, ax, az, bx, bz));
}

function ptSeg2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px;
  const z = az + dz * t - pz;
  return x * x + z * z;
}

function pathsClose(a, b, thr) {
  const t2 = thr * thr;
  const N = a.N;
  for (let i = 0; i < N; i++) {
    const ax = a.px[i];
    const az = a.pz[i];
    const bx = a.px[i + 1];
    const bz = a.pz[i + 1];
    const mnx = Math.min(ax, bx) - thr;
    const mxx = Math.max(ax, bx) + thr;
    const mnz = Math.min(az, bz) - thr;
    const mxz = Math.max(az, bz) + thr;
    for (let j = 0; j < b.N; j++) {
      const cx = b.px[j];
      const cz = b.pz[j];
      const dx = b.px[j + 1];
      const dz = b.pz[j + 1];
      if ((cx < mnx && dx < mnx) || (cx > mxx && dx > mxx) || (cz < mnz && dz < mnz) || (cz > mxz && dz > mxz)) continue;
      if (segSegDist2(ax, az, bx, bz, cx, cz, dx, dz) < t2) return true;
    }
  }
  return false;
}

/** Çatışma: aynı çıkış şeridine birleşme ya da yolların kesişmesi/yakınlığı (< CONFLICT_DIST). Aynı giriş şeridindeki hareketler çatışmaz (arka arkaya). */
export function movesConflict(J, a, b) {
  if (a === b) return false;
  const nm = J.moves.length;
  if (!J.conf) J.conf = new Uint8Array(nm * nm);
  const key = a * nm + b;
  const hit = J.conf[key];
  if (hit !== 0) return hit === 2;
  const A = J.moves[a];
  const B = J.moves[b];
  let c;
  if (A.inArm === B.inArm && A.inLane === B.inLane) c = false;
  else if (A.outArm === B.outArm && A.outLane === B.outLane) c = true;
  else {
    // farklı kollardan dönüş içeren çiftler ve aynı koldan iki DÖNÜŞ (sol+sağ, yan yana başlar, gövdeler savrulur) geniş payla; aynı koldan düz+dönüş / düz+düz paralel şeritler (3,4 m) dar payla
    const bothTurn = A.turn !== TURN.STRAIGHT && B.turn !== TURN.STRAIGHT;
    const anyTurn = A.turn !== TURN.STRAIGHT || B.turn !== TURN.STRAIGHT;
    c = pathsClose(A, B, (A.inArm !== B.inArm && anyTurn) || (A.inArm === B.inArm && bothTurn) ? CONFLICT_DIST_TURN : CONFLICT_DIST);
  }
  const v = c ? 2 : 1;
  J.conf[key] = v;
  J.conf[b * nm + a] = v;
  return c;
}

/** a, b çatışıyorsa: a'nın b'ye göre önceliği var mı (sağdan gelene öncelik; eşitlikte düz geçen; sonra düşük kol). */
export function hasPriority(a, b) {
  if (a.inArm === rightArm(b.inArm)) return true;
  if (b.inArm === rightArm(a.inArm)) return false;
  if (a.turn !== b.turn) return a.turn === TURN.STRAIGHT || (a.turn === TURN.RIGHT && b.turn === TURN.LEFT);
  return a.inArm < b.inArm;
}

/* ------------------------------------------------------------------------------------------------
 * Ağ kurulumu
 * ---------------------------------------------------------------------------------------------- */
export function buildTrafficNet(net, opts) {
  const o = opts || {};
  const seed = o.seed | 0;
  const nodes = net.nodes;
  const edges = net.edges;
  const dedges = new Array(edges.length * 2);
  const junctions = new Array(nodes.length);
  const interByNode = new Map();
  const inters = net.intersections || [];
  for (let i = 0; i < inters.length; i++) interByNode.set(inters[i].id, inters[i]);
  const dedgesAt = {};
  const stats = { dedges: 0, junctions: 0, moves: 0, skipped: 0 };

  // 1) yönlü kenarlar (geometri)
  for (let e = 0; e < edges.length; e++) {
    const ed = edges[e];
    const na = nodes[ed.a];
    const nb = nodes[ed.b];
    if (!na || !nb) {
      stats.skipped++;
      continue;
    }
    const dx = nb.x - na.x;
    const dz = nb.z - na.z;
    const D = Math.hypot(dx, dz);
    const armF = armOfVec(dx, dz);
    if (armF < 0 || D < 1) {
      stats.skipped++;
      continue; // eksene hizalı olmayan kenar desteklenmez
    }
    const lanes = ed.lanesPerDir > 0 ? ed.lanesPerDir | 0 : 1;
    const laneW = ed.laneW > 0 ? ed.laneW : 3.4;
    // y profili (a'dan)
    const pts = ed.pts;
    const np = pts && pts.length >= 6 ? (pts.length / 3) | 0 : 0;
    const psA = new Float32Array(np > 1 ? np : 2);
    const pyA = new Float32Array(np > 1 ? np : 2);
    if (np > 1) {
      for (let k = 0; k < np; k++) {
        psA[k] = Math.hypot(pts[k * 3] - na.x, pts[k * 3 + 2] - na.z);
        pyA[k] = pts[k * 3 + 1];
      }
    } else {
      psA[0] = 0; psA[1] = D; pyA[0] = na.y; pyA[1] = nb.y;
    }
    for (let dir = 0; dir < 2; dir++) {
      const id = e * 2 + dir;
      const from = dir === 0 ? ed.a : ed.b;
      const to = dir === 0 ? ed.b : ed.a;
      const nf = dir === 0 ? na : nb;
      const hx = dir === 0 ? dx / D : -dx / D;
      const hz = dir === 0 ? dz / D : -dz / D;
      const ps = new Float32Array(psA.length);
      const py = new Float32Array(psA.length);
      for (let k = 0; k < psA.length; k++) {
        const kk = dir === 0 ? k : psA.length - 1 - k;
        ps[k] = dir === 0 ? psA[kk] : D - psA[kk];
        py[k] = pyA[kk];
      }
      const armFrom = dir === 0 ? armF : (armF + 2) & 3;
      const de = {
        id,
        edge: e,
        dir,
        from,
        to,
        armFrom,
        armTo: 0,
        x0: nf.x,
        z0: nf.z,
        hx,
        hz,
        rx: -hz,
        rz: hx,
        yaw: Math.atan2(-hx, -hz),
        D,
        s0: 0,
        s1: D,
        lanes,
        laneW,
        limit: ed.limit > 0 ? ed.limit : 12,
        kind: ed.kind || 'street',
        bridge: !!ed.bridge,
        tunnel: !!ed.tunnel,
        ps,
        py,
        rev: dir === 0 ? id + 1 : id - 1,
        nextMoves: null,
        arm: armFrom,
      };
      // `to` düğümüne GELİŞ kolu: to düğümünden bakınca bu kenar, gidiş yönünün tersi koldadır
      de.armTo = armOfVec(-hx, -hz);
      dedges[id] = de;
      if (!dedgesAt[from]) dedgesAt[from] = [];
      dedgesAt[from].push({ arm: armFrom, lanes });
      if (!dedgesAt[to]) dedgesAt[to] = [];
      dedgesAt[to].push({ arm: de.armTo, lanes });
      stats.dedges++;
    }
  }

  const tn = {
    seed, dedges, junctions, edgeCount: edges.length, nodes, stats, net,
    deOf(edgeId, dir) {
      return dedges[edgeId * 2 + dir];
    },
  };
  const hwOf = (node, axis) => {
    if (typeof o.halfWidth === 'function') return o.halfWidth(node, axis);
    if (node.hw && node.hw[axis]) return node.hw[axis];
    return defaultHalf(tn, node, axis, dedgesAt);
  };

  // 2) kavşaklar: kollar + dur çizgisi mesafeleri
  for (let n = 0; n < nodes.length; n++) {
    const node = nodes[n];
    if (!node) continue;
    const J = {
      id: node.id,
      node,
      x: node.x,
      y: node.y,
      z: node.z,
      arms: [{ present: false, out: -1, in: -1, clear: 0 }, { present: false, out: -1, in: -1, clear: 0 },
        { present: false, out: -1, in: -1, clear: 0 }, { present: false, out: -1, in: -1, clear: 0 }],
      plan: null,
      moves: [],
      movesBy: [[], [], [], []],
      conf: null,
      deadEnd: false,
      armMask: 0,
    };
    junctions[node.id] = J;
  }
  // Kol başına out (düğümden çıkan yönlü kenar) ve in (düğüme gelen yönlü kenar) eşleşmesi
  for (let id = 0; id < dedges.length; id++) {
    const de = dedges[id];
    if (!de) continue;
    junctions[de.from].arms[de.armFrom].out = id;
    junctions[de.to].arms[de.armTo].in = id;
  }
  for (let n = 0; n < junctions.length; n++) {
    const J = junctions[n];
    if (!J) continue;
    let mask = 0;
    let cnt = 0;
    for (let a = 0; a < 4; a++) {
      const A = J.arms[a];
      A.present = A.out >= 0 && A.in >= 0;
      if (A.present) {
        mask |= 1 << a;
        cnt++;
        const perp = a === 0 || a === 2 ? 'h' : 'v';
        A.clear = hwOf(J.node, perp) + STOP_MARGIN;
      }
    }
    J.armMask = mask;
    J.deadEnd = cnt === 1;
    J.plan = makeSignalPlan(interByNode.get(J.id) || null, mask, seed);
    if (cnt > 0) stats.junctions++;
  }
  // s0/s1
  for (let id = 0; id < dedges.length; id++) {
    const de = dedges[id];
    if (!de) continue;
    de.s0 = junctions[de.from].arms[de.armFrom].clear;
    de.s1 = de.D - junctions[de.to].arms[de.armTo].clear;
    if (de.s1 - de.s0 < 8) {
      de.s0 = Math.min(de.s0, de.D * 0.3);
      de.s1 = Math.max(de.D - de.s0, de.s0 + 8);
    }
    de.nextMoves = [];
    for (let l = 0; l < de.lanes; l++) de.nextMoves.push([]);
  }

  // 3) hareketler
  for (let n = 0; n < junctions.length; n++) {
    const J = junctions[n];
    if (!J || J.armMask === 0) continue;
    for (let a = 0; a < 4; a++) {
      const A = J.arms[a];
      if (!A.present) continue;
      const dIn = dedges[A.in];
      const fx = -ARM_VEC[a][0];
      const fz = -ARM_VEC[a][1];
      for (let l = 0; l < dIn.lanes; l++) J.movesBy[a][l] = [];
      for (let b = 0; b < 4; b++) {
        if (b === a || !J.arms[b].present) continue;
        const gx = ARM_VEC[b][0];
        const gz = ARM_VEC[b][1];
        const cross = fx * gz - fz * gx;
        const dot = fx * gx + fz * gz;
        if (cross === 0 && dot < 0) continue;
        const turn = cross > 0 ? TURN.RIGHT : cross < 0 ? TURN.LEFT : TURN.STRAIGHT;
        const dOut = dedges[J.arms[b].out];
        for (let l = 0; l < dIn.lanes; l++) {
          const outLane = turn === TURN.STRAIGHT ? Math.min(l, dOut.lanes - 1) : turn === TURN.RIGHT ? dOut.lanes - 1 : 0;
          const mv = buildMove(tn, J, a, l, b, outLane, turn);
          J.moves.push(mv);
          J.movesBy[a][l].push(mv);
          dIn.nextMoves[l].push(mv);
          stats.moves++;
        }
      }
    }
  }
  return tn;
}

/* ------------------------------------------------------------------------------------------------
 * Şehir önbelleği
 * ---------------------------------------------------------------------------------------------- */
const CACHE = new Lru(4);

export function trafficNet(seed) {
  const key = seed >>> 0;
  let t = CACHE.get(key);
  if (!t) {
    const net = roadNet(seed);
    t = CACHE.set(key, buildTrafficNet(net, { seed, halfWidth: (node, axis) => halfWidth(axis === 'v' ? node.i : node.j) }));
  }
  return t;
}

export function clearTrafficNetCache() {
  CACHE.clear();
}

/* ------------------------------------------------------------------------------------------------
 * Yönlendirme (testler / görev rotaları)
 * ---------------------------------------------------------------------------------------------- */
export function dedgeSuccessors(tn, deId) {
  const de = tn.dedges[deId];
  const out = [];
  if (!de) return out;
  const J = tn.junctions[de.to];
  for (let l = 0; l < de.lanes; l++) {
    const ms = de.nextMoves[l];
    for (let i = 0; i < ms.length; i++) if (out.indexOf(ms[i].deOut) < 0) out.push(ms[i].deOut);
  }
  void J;
  return out;
}

/** Yönlü kenarlar arasında en kısa yol (uzunluk ağırlıklı; Dijkstra, ikili yığın yerine basit tarama — test/görev sıklığında yeterli). */
export function routeDedges(tn, from, to) {
  const n = tn.dedges.length;
  if (!tn.dedges[from] || !tn.dedges[to]) return null;
  if (from === to) return [from];
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[from] = 0;
  const heap = [[0, from]];
  const push = (k, v) => {
    heap.push([k, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      const t = heap[p]; heap[p] = heap[i]; heap[i] = t;
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
        if (heap[c][0] >= heap[i][0]) break;
        const t = heap[c]; heap[c] = heap[i]; heap[i] = t;
        i = c;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) break;
    const succ = dedgeSuccessors(tn, u);
    for (let i = 0; i < succ.length; i++) {
      const v = succ[i];
      const w = d + tn.dedges[v].D;
      if (w < dist[v]) {
        dist[v] = w;
        prev[v] = u;
        push(w, v);
      }
    }
  }
  if (!isFinite(dist[to])) return null;
  const path = [];
  for (let c = to; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  return path;
}

/** roadNet.nearest(x,z)'nin kenarının iki yönü. */
export function nearestDedges(tn, x, z) {
  const net = tn.net;
  if (!net || typeof net.nearest !== 'function') return [];
  const n = net.nearest(x, z);
  if (!n || n.edge === undefined) return [];
  return [n.edge * 2, n.edge * 2 + 1].filter((id) => !!tn.dedges[id]);
}
