/*
 * KEŞİF sim/city/vehicle — BETİKLİ SÜRÜCÜ (vehicle_ui, Neon Meridyen Faz 3). SAF sim yardımcısı (three/DOM/Math.random/Date.now yok; belirlenimci).
 * Faz 4 görev tasarımcıları ALTIN SÜRELERİ buna dayandırır: sözleşme §11 "altın = 1,08 × betikli sürücü süresi, gümüş ×1,12, bronz ×1,25; < 0,8×altın reddedilir".
 *
 *   nodePath(net, nodeIds, closed)            → [[x,y,z]…]  düğüm dizisinin gerçek yol merkez çizgisi (kenar noktaları, yönlendirilmiş)
 *   laneOffsetPath(pts, off, opts)            → [[x,y,z]…]  sağ şeride kaydırılmış, köşeleri yumuşatılmış (yay) çizgi (adım ≈ 2 m)
 *   planSpeeds(path, def, opts)               → {s[], v[]}   eğriliğe göre hız planı (köşe yarıçapı + yanal ivme + fren mesafesi geriye taramasıyla)
 *   createBot(cls, path, opts)                → {control(v) → input, state}   saf takipçi: yön (pure pursuit) + hız PI + (isteğe bağlı) nitro
 *   runBot(world, cls, path, opts)            → {done, time, steps, gates, stats:{…}}   world: getBlock/ensureChunk, ctx: stepVehicle
 *   raceRoute(net, race) → {path, gates}      yarışın tüm turları (kapı sırası dahil)    botRace(world, net, race, cls, opts) → sonuç + {gold, silver, bronze}
 *   goldTimes(botTime) → {gold, silver, bronze}   jobLimit(routeLen, cls) → sn (sözleşme: routeLen/(0.55·sınıf azami hız)+25)
 *   jobRoute(net, fromNode, toNode) → path | null     botJob(world, net, fromNode, toNode, cls, opts)
 *
 * Seçenekler: opts.lane (m, sağ şerit ofseti, varsayılan 1,7) · opts.pace (hız çarpanı, 1 = betikli sürücü; <1 özensiz oyuncu) · opts.nitro (nitro kullan: "uzman")
 *             opts.maxSec (zaman aşımı) · opts.look (bakış çarpanı) · opts.startOffset (m, başlangıç yanal kayması)
 */
import { VEHICLE_DEFS, isVehicleClass } from './vehicleData.js';
import { createVehicle, stepVehicle } from './vehiclePhysics.js';

export const LANE_OFFSET = 1.7;
export const GOLD_K = 1.08;
export const SILVER_K = 1.12;
export const BRONZE_K = 1.25;
const DT = 1 / 60;
const STEP = 2; // yol örnekleme adımı (m)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function goldTimes(botTime) {
  const t = Number.isFinite(botTime) ? botTime : 0;
  const r = (k) => Math.round(t * k * 10) / 10;
  return { gold: r(GOLD_K), silver: r(SILVER_K), bronze: r(BRONZE_K) };
}

/** Kurye işi süre sınırı (sn): routeLen/(0.55·sınıf azami hızı) + 25 (araç belgesi §5). */
export function jobLimit(routeLen, cls) {
  const d = VEHICLE_DEFS[cls];
  return routeLen / (0.55 * d.max) + 25;
}

/* ------------------------------------------------------------------------------------------------
 * Yol
 * ---------------------------------------------------------------------------------------------- */
const EDGE_MAP = new WeakMap();
function edgeBetween(net, a, b) {
  let m = EDGE_MAP.get(net);
  if (!m) {
    m = new Map();
    for (let i = 0; i < net.edges.length; i++) {
      const e = net.edges[i];
      m.set(e.a * 4096 + e.b, e);
      m.set(e.b * 4096 + e.a, e);
    }
    EDGE_MAP.set(net, m);
  }
  return m.get(a * 4096 + b) || null;
}

export function nodePath(net, nodeIds, closed) {
  const out = [];
  const n = nodeIds.length;
  const m = closed ? n : n - 1;
  for (let k = 0; k < m; k++) {
    const a = nodeIds[k];
    const b = nodeIds[(k + 1) % n];
    const e = edgeBetween(net, a, b);
    if (!e) return null;
    const p = e.pts;
    const fwd = e.a === a;
    const cnt = p.length / 3;
    for (let q = 0; q < cnt; q++) {
      const idx = fwd ? q : cnt - 1 - q;
      if (k > 0 && q === 0) continue; // ortak uç
      out.push([p[idx * 3], p[idx * 3 + 1], p[idx * 3 + 2]]);
    }
  }
  if (closed && out.length > 0) out.push(out[0].slice());
  return out;
}

function dirOf(a, b) {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const l = Math.sqrt(dx * dx + dz * dz) || 1;
  return [dx / l, dz / l, l];
}

/** Sağ şerit ofsetli, köşeleri ikinci derece Bezier ile yumuşatılmış çizgi; ardından STEP aralıklı yeniden örnekleme. */
export function laneOffsetPath(pts, off, opts) {
  const o = opts || {};
  const TdLeft = o.fillet || 13; // dışa dönen (sol) köşe: geniş yay
  const TdRight = o.filletRight || 9; // içe dönen (sağ) köşe: yay köşe kapısına (r=7) ≤ 5,6 m yaklaşır
  const Q = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - Q[Q.length - 1][0];
    const dz = pts[i][2] - Q[Q.length - 1][2];
    if (dx * dx + dz * dz > 0.01) Q.push(pts[i]);
  }
  if (Q.length < 2) return null;
  const R = [];
  const right = (d) => [-d[1], d[0]];
  const d0 = dirOf(Q[0], Q[1]);
  const r0 = right(d0);
  R.push([Q[0][0] + r0[0] * off, Q[0][1], Q[0][2] + r0[1] * off]);
  for (let k = 1; k < Q.length - 1; k++) {
    const a = dirOf(Q[k - 1], Q[k]);
    const b = dirOf(Q[k], Q[k + 1]);
    const cos = a[0] * b[0] + a[1] * b[1];
    const ra = right(a);
    const rb = right(b);
    const y = Q[k][1];
    if (cos > 0.9997) {
      R.push([Q[k][0] + ra[0] * off, y, Q[k][2] + ra[1] * off]);
      continue;
    }
    const k1 = off / (1 + cos);
    const C = [Q[k][0] + (ra[0] + rb[0]) * k1, Q[k][2] + (ra[1] + rb[1]) * k1];
    const turnRight = b[0] * ra[0] + b[1] * ra[1] > 0;
    const T = Math.min(turnRight ? TdRight : TdLeft, a[2] * 0.45, b[2] * 0.45);
    const A = [C[0] - a[0] * T, C[1] - a[1] * T];
    const B = [C[0] + b[0] * T, C[1] + b[1] * T];
    const N = 10;
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      const u = 1 - t;
      R.push([u * u * A[0] + 2 * u * t * C[0] + t * t * B[0], y, u * u * A[1] + 2 * u * t * C[1] + t * t * B[1]]);
    }
  }
  const e0 = dirOf(Q[Q.length - 2], Q[Q.length - 1]);
  const re = right(e0);
  R.push([Q[Q.length - 1][0] + re[0] * off, Q[Q.length - 1][1], Q[Q.length - 1][2] + re[1] * off]);
  // STEP aralıklı yeniden örnekleme (y doğrusal)
  const out = [];
  let acc = 0;
  let nextS = 0;
  out.push(R[0].slice());
  for (let i = 1; i < R.length; i++) {
    const dx = R[i][0] - R[i - 1][0];
    const dz = R[i][2] - R[i - 1][2];
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l <= 0) continue;
    while (acc + l >= nextS + STEP) {
      nextS += STEP;
      const t = (nextS - acc) / l;
      out.push([R[i - 1][0] + dx * t, R[i - 1][1] + (R[i][1] - R[i - 1][1]) * t, R[i - 1][2] + dz * t]);
    }
    acc += l;
  }
  out.push(R[R.length - 1].slice());
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Hız planı
 * ---------------------------------------------------------------------------------------------- */
function steerLockAt(def, u) {
  const rad = (def.steerDeg * Math.PI) / 180;
  return rad / (1 + (u / 14) * (u / 14));
}
/** Yarıçap R (m) için sınıfın güvenle geçebileceği en yüksek hız (m/sn). */
export function cornerSpeed(def, R) {
  const margin = def.hover > 0 ? 0.55 : 0.78;
  let best = 3;
  for (let u = 3; u <= def.max + 0.5; u += 0.5) {
    const rmin = def.wheelbase / Math.tan(steerLockAt(def, u));
    const lat = (u * u) / R;
    if (rmin <= R * margin && lat <= def.latG * 24 * 0.42) best = u;
  }
  return best;
}

export function planSpeeds(path, def, opts) {
  const o = opts || {};
  const n = path.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const dx = path[i][0] - path[i - 1][0];
    const dz = path[i][2] - path[i - 1][2];
    s[i] = s[i - 1] + Math.sqrt(dx * dx + dz * dz);
  }
  const v = new Float64Array(n);
  const cap = def.max * (o.pace > 0 ? o.pace : 1);
  const K = 3; // 3 nokta eğriliği için ±6 m
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - K)];
    const b = path[i];
    const c = path[Math.min(n - 1, i + K)];
    const abx = b[0] - a[0];
    const abz = b[2] - a[2];
    const bcx = c[0] - b[0];
    const bcz = c[2] - b[2];
    const cross = abx * bcz - abz * bcx;
    const lab = Math.sqrt(abx * abx + abz * abz);
    const lbc = Math.sqrt(bcx * bcx + bcz * bcz);
    const lac = Math.sqrt((c[0] - a[0]) ** 2 + (c[2] - a[2]) ** 2);
    const kappa = lab > 0.01 && lbc > 0.01 && lac > 0.01 ? (2 * Math.abs(cross)) / (lab * lbc * lac) : 0;
    v[i] = kappa > 1e-4 ? Math.min(cap, cornerSpeed(def, 1 / kappa) * (o.pace > 0 ? o.pace : 1)) : cap;
  }
  v[n - 1] = Math.min(v[n - 1], cap);
  const dec = def.brake * 0.5;
  for (let i = n - 2; i >= 0; i--) {
    const ds = s[i + 1] - s[i];
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * dec * ds));
  }
  return { s, v };
}

/* ------------------------------------------------------------------------------------------------
 * Takipçi
 * ---------------------------------------------------------------------------------------------- */
export function createBot(cls, path, opts) {
  if (!isVehicleClass(cls)) throw new Error('bilinmeyen sınıf: ' + cls);
  const o = opts || {};
  const def = VEHICLE_DEFS[cls];
  const plan = planSpeeds(path, def, o);
  const n = path.length;
  const st = { i: 0, done: false, maxI: 0 };
  const look = o.look > 0 ? o.look : 1;
  const inp = { steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false, steerDirect: true };
  function control(v) {
    // ilerleme: en yakın nokta (ileri pencerede)
    let best = st.i;
    let bd = Infinity;
    const hi = Math.min(n - 1, st.i + 25);
    for (let k = st.i; k <= hi; k++) {
      const dx = path[k][0] - v.x;
      const dz = path[k][2] - v.z;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    st.i = best;
    const sp = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
    const ld = clamp((5 + 0.42 * sp) * look, 5, 28);
    let t = best;
    while (t < n - 1 && plan.s[t] - plan.s[best] < ld) t++;
    const dx = path[t][0] - v.x;
    const dz = path[t][2] - v.z;
    let diff = Math.atan2(-dx, -dz) - v.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const L = Math.max(2, Math.sqrt(dx * dx + dz * dz));
    const dLeft = Math.atan(2 * def.wheelbase * Math.sin(diff) / L);
    inp.steer = clamp(-dLeft / steerLockAt(def, Math.abs(v.u)), -1, 1);
    // hedef hız: önümüzdeki 0,45 sn'lik yol üzerindeki en düşük plan hızı
    let tgt = plan.v[best];
    const look2 = Math.max(6, sp * 0.45);
    for (let k = best; k < n && plan.s[k] - plan.s[best] <= look2; k++) if (plan.v[k] < tgt) tgt = plan.v[k];
    if (best >= n - 3) tgt = Math.max(tgt, 6);
    inp.nitro = false;
    if (o.nitro && v.onGround && Math.abs(inp.steer) < 0.12 && v.nitro > (v.nitroOn ? 0.5 : 20)) {
      // "uzman": önümüzdeki 120 m düz ve serbestse nitro (tank 4 sn yanar, 1 sn boşta kalınca dolar)
      let straight = true;
      const lim = (o.pace > 0 ? o.pace : 1) * def.max * 0.97;
      for (let k = best; k < n && plan.s[k] - plan.s[best] <= 120; k++) if (plan.v[k] < lim) straight = false;
      if (straight) {
        inp.nitro = true;
        tgt = Math.max(tgt, def.max * def.nitro.spd);
      }
    }
    inp.throttle = sp < tgt ? clamp(0.3 + (tgt - sp) * 0.7, 0, 1) : 0;
    inp.brake = sp > tgt + 0.6 ? clamp((sp - tgt - 0.6) * 0.35, 0, 1) : 0;
    if (best >= n - 2 && sp > 0) st.done = true;
    return inp;
  }
  return { control, state: st, plan, def };
}

/* ------------------------------------------------------------------------------------------------
 * Koşucu
 * ---------------------------------------------------------------------------------------------- */
function ensureAround(world, x, z, r) {
  if (!world || typeof world.ensureChunk !== 'function') return;
  const cx0 = Math.floor((x - r) / 16);
  const cx1 = Math.floor((x + r) / 16);
  const cz0 = Math.floor((z - r) / 16);
  const cz1 = Math.floor((z + r) / 16);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) world.ensureChunk(cx, cz);
}

/**
 * path: [[x,y,z]…] (sağ şerit ofsetli, STEP aralıklı). opts.gates: [{x,y,z,r}] sıralı (isteğe bağlı) — hepsi sırayla geçilince biter.
 * Dönüş: {done, time (sn), steps, gates:{passed,total}, stats:{bumps, scrapes, resets, unsticks, water, maxSpeed, nitroUsed, minY, maxY, stuck}, failed (neden|'')}
 */
export function runBot(world, cls, path, opts) {
  const o = opts || {};
  const bot = createBot(cls, path, o);
  const p0 = path[0];
  const p1 = path[Math.min(path.length - 1, 4)];
  const yaw0 = Math.atan2(-(p1[0] - p0[0]), -(p1[2] - p0[2]));
  const rx = Math.cos(yaw0);
  const rz = -Math.sin(yaw0);
  const off = o.startOffset || 0;
  ensureAround(world, p0[0], p0[2], 48);
  const v = createVehicle(cls, { x: p0[0] + rx * off, y: p0[1], z: p0[2] + rz * off, yaw: yaw0 });
  const gates = o.gates || null;
  let gi = 0;
  const stats = {
    bumps: 0, scrapes: 0, resets: 0, unsticks: 0, water: 0, maxSpeed: 0, nitroUsed: 0, minY: Infinity, maxY: -Infinity, stuck: 0,
  };
  const maxSteps = Math.round((o.maxSec || 900) * 60);
  let steps = 0;
  let lastProg = 0;
  let lastProgStep = 0;
  let failed = '';
  const ctx = o.ctx || {};
  while (steps < maxSteps) {
    if (steps % 30 === 0) ensureAround(world, v.x + v.vx * 0.8, v.z + v.vz * 0.8, 40);
    const inp = bot.control(v);
    const ev = stepVehicle(v, inp, world, DT, ctx);
    steps++;
    for (let k = 0; k < ev.length; k++) {
      const t = ev[k].type;
      if (t === 'bump') stats.bumps++;
      else if (t === 'scrape') stats.scrapes++;
      else if (t === 'resetRoad' || t === 'recover' || t === 'fell') stats.resets++;
      else if (t === 'unstick') stats.unsticks++;
      else if (t === 'waterRespawn' || t === 'splash') stats.water++;
      else if (t === 'nitroStart') stats.nitroUsed++;
    }
    const sp = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
    if (sp > stats.maxSpeed) stats.maxSpeed = sp;
    if (v.y < stats.minY) stats.minY = v.y;
    if (v.y > stats.maxY) stats.maxY = v.y;
    if (gates) {
      while (gi < gates.length) {
        const g = gates[gi];
        const dx = v.x - g.x;
        const dz = v.z - g.z;
        if (dx * dx + dz * dz <= g.r * g.r && Math.abs(v.y - g.y) < 8) gi++;
        else break;
      }
      if (gi >= gates.length) {
        return finish(true);
      }
    } else if (bot.state.done) return finish(true);
    // takılma: 8 sn içinde yol ilerlemesi yok
    if (bot.state.i > lastProg + 2) {
      lastProg = bot.state.i;
      lastProgStep = steps;
    } else if (steps - lastProgStep > 480) {
      stats.stuck++;
      failed = 'takıldı';
      break;
    }
    if (!Number.isFinite(v.x + v.y + v.z)) {
      failed = 'NaN';
      break;
    }
  }
  if (!failed) failed = 'zaman aşımı';
  return finish(false);

  function finish(done) {
    return {
      done, time: steps / 60, steps, gates: { passed: gi, total: gates ? gates.length : 0 }, stats, failed: done ? '' : failed, pose: { x: v.x, y: v.y, z: v.z, yaw: v.yaw },
    };
  }
}

/* ------------------------------------------------------------------------------------------------
 * Yarış / iş
 * ---------------------------------------------------------------------------------------------- */
/** Tüm turlar için yol + sıralı kapı listesi (kapı yarıçapı r=7). */
export function raceRoute(net, race, opts) {
  const o = opts || {};
  const base = nodePath(net, race.nodes, race.closed);
  if (!base) return null;
  const lane = o.lane === undefined ? LANE_OFFSET : o.lane;
  let one = laneOffsetPath(base, lane, o);
  if (!one) return null;
  let path = one;
  if (race.closed) {
    for (let l = 1; l < race.laps; l++) path = path.concat(one.slice(1));
  }
  const gates = [];
  const G = race.gates.length;
  const gate = (g) => ({ x: g.x, y: g.y, z: g.z, r: g.r });
  for (let l = 0; l < race.laps; l++) {
    for (let g = 1; g < G; g++) gates.push(gate(race.gates[g]));
    if (race.closed) gates.push(gate(race.gates[0]));
  }
  one = null;
  return { path, gates };
}

export function botRace(world, net, race, cls, opts) {
  const r = raceRoute(net, race, opts);
  if (!r) return null;
  const res = runBot(world, cls, r.path, Object.assign({}, opts || null, { gates: r.gates }));
  return Object.assign(res, { times: goldTimes(res.time), length: race.length * race.laps });
}

/** Düğümden düğüme iş rotası (merkez çizgi, sağ şerit). */
export function jobRoute(net, fromNode, toNode, opts) {
  const nodes = net.routeNodes(fromNode, toNode);
  if (!nodes || nodes.length < 2) return null;
  const base = nodePath(net, nodes, false);
  if (!base) return null;
  const path = laneOffsetPath(base, opts && opts.lane !== undefined ? opts.lane : LANE_OFFSET, opts);
  if (!path) return null;
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]);
  return { path, length: len };
}

export function botJob(world, net, fromNode, toNode, cls, opts) {
  const r = jobRoute(net, fromNode, toNode, opts);
  if (!r) return null;
  const res = runBot(world, cls, r.path, opts);
  return Object.assign(res, { length: r.length, limit: jobLimit(r.length, cls) });
}
