/*
 * KEŞİF sim/city/vehicle — TRAFİK TEST KİTİ (yalnız testler/ölçümler içe aktarır). Sentetik ızgara yol ağları (roadNet biçiminde) ve bağımsız denetleyiciler.
 *
 *   makeGridNet({nx, nz, spacing=80, every=3, seed, cut=0, flat=false}) → roadNet benzeri {nodes, edges, intersections, nearest}
 *        every: arter aralığı (i%every==0 / j%every==0 çizgileri arter, 2 şerit); cut: kenar kesme olasılığı (T kavşak/dirsek; derece ≥ 2 ve bağlantılı korunur)
 *        flat: tüm yollar sokak (ışıksız, sağdan öncelik)
 *   obbGap(a, b) → iki dikdörtgen (araç) arası en kısa uzaklık (çakışıyorsa 0)
 *   carRect(c) → {cx,cz,fx,fz,hl,hw}
 *   runClosed(tn, opts) → sonuç özeti: araç çiftleri arası asgari boşluk, kırmızı ihlali, takılma, kavşak canlılığı…
 */
import { subHash } from '../../dim/dimensions.js';
import { createTraffic } from './trafficAI.js';
import { buildTrafficNet, movesConflict } from './junctions.js';
import { SIG, armSignal } from './trafficLights.js';

const TAG_GRID = 0xd001;

function mod(a, m) {
  return ((a % m) + m) % m;
}

export function makeGridNet(o) {
  const nx = o.nx || 6;
  const nz = o.nz || 6;
  const sp = o.spacing || 80;
  const every = o.every || 3;
  const seed = o.seed | 0;
  const cutP = o.cut || 0;
  const flat = !!o.flat;
  const isArt = (k) => !flat && mod(k, every) === 0;
  const half = (k) => (isArt(k) ? 10 : 6);
  const nodes = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      nodes.push({
        id, i, j, x: i * sp, y: 64, z: j * sp, kind: 'x', light: false, arms: 0, hw: { v: half(i), h: half(j) },
      });
    }
  }
  const segs = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (i + 1 < nx) segs.push({ a: j * nx + i, b: j * nx + i + 1, axis: 'h', line: j });
      if (j + 1 < nz) segs.push({ a: j * nx + i, b: (j + 1) * nx + i, axis: 'v', line: i });
    }
  }
  const cut = new Uint8Array(segs.length);
  const deg = new Uint8Array(nodes.length);
  segs.forEach((s) => { deg[s.a]++; deg[s.b]++; });
  const connected = () => {
    const adj = nodes.map(() => []);
    segs.forEach((s, k) => {
      if (cut[k]) return;
      adj[s.a].push(s.b);
      adj[s.b].push(s.a);
    });
    const seen = new Uint8Array(nodes.length);
    const st = [0];
    seen[0] = 1;
    let n = 1;
    while (st.length) {
      const u = st.pop();
      adj[u].forEach((v) => {
        if (!seen[v]) {
          seen[v] = 1;
          n++;
          st.push(v);
        }
      });
    }
    return n === nodes.length;
  };
  if (cutP > 0) {
    const order = segs.map((s, k) => k).sort((p, q) => (subHash(seed, p, TAG_GRID) >>> 0) - (subHash(seed, q, TAG_GRID) >>> 0));
    order.forEach((k) => {
      const s = segs[k];
      if (isArt(s.line)) return;
      if ((subHash(seed, k, TAG_GRID + 1) >>> 0) / 4294967296 >= cutP) return;
      if (deg[s.a] <= 2 || deg[s.b] <= 2) return;
      cut[k] = 1;
      deg[s.a]--;
      deg[s.b]--;
      if (!connected()) {
        cut[k] = 0;
        deg[s.a]++;
        deg[s.b]++;
      }
    });
  }
  const edges = [];
  segs.forEach((s, k) => {
    if (cut[k]) return;
    const na = nodes[s.a];
    const nb = nodes[s.b];
    const art = isArt(s.line);
    const pts = new Float32Array([na.x, na.y, na.z, nb.x, nb.y, nb.z]);
    const e = {
      id: edges.length, sid: k, a: s.a, b: s.b, kind: art ? 'avenue' : 'street', lanesPerDir: art ? 2 : 1, laneW: 3.4, limit: art ? 18 : 12, pts, len: sp, axis: s.axis, line: s.line,
    };
    edges.push(e);
    const bitA = s.axis === 'h' ? 2 : 4;
    const bitB = s.axis === 'h' ? 8 : 1;
    na.arms |= bitA;
    nb.arms |= bitB;
  });
  const intersections = [];
  nodes.forEach((n) => {
    let c = 0;
    for (let b = n.arms; b; b &= b - 1) c++;
    n.kind = c >= 4 ? 'x' : c === 3 ? 't' : c === 2 ? 'bend' : 'end';
    if (c < 3) return;
    const aV = isArt(n.i);
    const aH = isArt(n.j);
    const type = aV && aH ? 'ar' : aV || aH ? 'ara' : 'yan';
    const lights = [];
    if (type !== 'yan') {
      const bits = [1, 2, 4, 8];
      for (let dir = 0; dir < 4; dir++) {
        if (!(n.arms & bits[dir])) continue;
        const armIsV = dir === 0 || dir === 2;
        if (type === 'ara' && (armIsV ? !aV : !aH)) continue;
        lights.push({ x: n.x, y: n.y, z: n.z, dir });
      }
    }
    n.light = lights.length > 0;
    intersections.push({
      id: n.id, i: n.i, j: n.j, x: n.x, y: n.y, z: n.z, type, arms: n.arms, lights, phase0: (subHash(seed, n.id, TAG_GRID + 2) >>> 0) % 27, cycle: 27,
    });
  });
  const net = {
    nodes, edges, intersections, nodeCount: nodes.length,
    nearest(x, z) {
      let best = null;
      let bd = Infinity;
      edges.forEach((e) => {
        const a = nodes[e.a];
        const b = nodes[e.b];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const l2 = dx * dx + dz * dz;
        let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        const d = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (d < bd) {
          bd = d;
          best = { edge: e.id, x: px, y: 64, z: pz, t, dist: Math.sqrt(d), node: t < 0.5 ? e.a : e.b };
        }
      });
      return best;
    },
  };
  return net;
}

/* ------------------------------------------------------------------------------------------------
 * Dikdörtgen uzaklığı
 * ---------------------------------------------------------------------------------------------- */
export function carRect(c) {
  const sy = Math.sin(c.yaw);
  const cy = Math.cos(c.yaw);
  return {
    cx: c.x, cz: c.z, fx: -sy, fz: -cy, hl: c.halfLen, hw: c.halfWid,
  };
}

function corners(r) {
  const rx = -r.fz;
  const rz = r.fx;
  const out = [];
  [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(([a, b]) => {
    out.push([r.cx + r.fx * r.hl * a + rx * r.hw * b, r.cz + r.fz * r.hl * a + rz * r.hw * b]);
  });
  return out;
}

function ptSegDist(px, pz, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

function inside(r, px, pz) {
  const dx = px - r.cx;
  const dz = pz - r.cz;
  const f = dx * r.fx + dz * r.fz;
  const l = dx * -r.fz + dz * r.fx;
  return Math.abs(f) <= r.hl && Math.abs(l) <= r.hw;
}

export function obbGap(ra, rb) {
  const ca = corners(ra);
  const cb = corners(rb);
  for (let i = 0; i < 4; i++) if (inside(rb, ca[i][0], ca[i][1]) || inside(ra, cb[i][0], cb[i][1])) return 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      best = Math.min(best, ptSegDist(ca[i][0], ca[i][1], cb[j], cb[(j + 1) & 3]), ptSegDist(cb[i][0], cb[i][1], ca[j], ca[(j + 1) & 3]));
    }
  }
  // kenarlar kesişiyor ama köşe içeride değilse (haç)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (segCross(ca[i], ca[(i + 1) & 3], cb[j], cb[(j + 1) & 3])) return 0;
    }
  }
  return best;
}

function segCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/**
 * Bağımsız izleyici: trafik sayaçlarına güvenmeden her adımdan sonra değişmezleri denetler.
 *   mon.step(traffic, dt, gapEvery) · mon.result() → {minGap, nearPairs, maxStill, redViolations, conflictViolations}
 * redViolations: ön tampon DUR çizgisini, ışık ≥ 0,25 sn'dir kırmızıyken geçti · conflictViolations: aynı kavşakta aynı anda çatışan iki hareketin sahibi ·
 * maxStill: bir aracın en uzun sürekli duruşu (sn) · minGap: araç çiftleri OBB uzaklığı (≤ 10 m uzaktakiler).
 */
export function createMonitor(tn) {
  const dedges = tn.dedges;
  const stillT = new Map();
  const prevFront = new Map();
  const occ = [];
  const m = {
    minGap: Infinity, nearPairs: 0, maxStill: 0, redViolations: 0, conflictViolations: 0, n: 0,
  };
  return {
    step(traffic, dt, gapEvery) {
      const t = traffic.time;
      m.n++;
      if (m.n % (gapEvery || 2) === 0) {
        const cs = [];
        for (let i = 0; i < traffic.cars.length; i++) if (traffic.cars[i].alive) cs.push(traffic.cars[i]);
        for (let i = 0; i < cs.length; i++) {
          const a = cs[i];
          const ra = carRect(a);
          for (let j = i + 1; j < cs.length; j++) {
            const b = cs[j];
            const dx = a.x - b.x;
            const dz = a.z - b.z;
            if (dx * dx + dz * dz > 100) continue;
            const g = obbGap(ra, carRect(b));
            m.nearPairs++;
            if (g < m.minGap) m.minGap = g;
          }
        }
      }
      occ.length = 0;
      for (let i = 0; i < traffic.cars.length; i++) {
        const c = traffic.cars[i];
        if (!c.alive) continue;
        if (c.v < 0.05) {
          const t0 = (stillT.get(c.id) || 0) + dt;
          stillT.set(c.id, t0);
          if (t0 > m.maxStill && c.hold <= 0 && c.obsWait === 0) m.maxStill = t0;
        } else if (stillT.has(c.id)) stillT.delete(c.id);
        if (c.mode === 1) {
          const de = dedges[c.de];
          const front = de.s1 - (c.s + c.halfLen);
          const pf = prevFront.get(c.id);
          if (pf !== undefined && pf.de === c.de && pf.v > 0 && front <= 0) {
            const J = tn.junctions[de.to];
            if (armSignal(J.plan, de.armTo, t) === SIG.RED && armSignal(J.plan, de.armTo, t - 0.25) === SIG.RED) m.redViolations++;
          }
          prevFront.set(c.id, { de: c.de, v: front });
          if (front < 0 && c.grantMv) occ.push(c, c.grantMv, de.to);
        } else {
          prevFront.delete(c.id);
          occ.push(c, c.mv, c.mv.j);
        }
      }
      for (let i = 0; i < occ.length; i += 3) {
        for (let k = i + 3; k < occ.length; k += 3) {
          if (occ[i + 2] !== occ[k + 2]) continue;
          const J = tn.junctions[occ[i + 2]];
          if (movesConflict(J, occ[i + 1].local, occ[k + 1].local)) m.conflictViolations++;
        }
      }
    },
    result() {
      return m;
    },
  };
}

/**
 * Kapalı ağ koşusu: tn üzerinde `cars` araç, `seconds` sn; createMonitor ile bağımsız denetim.
 *   dönüş: {minGap, nearPairs, maxStill, maxTicket, traffic, crossings, redViolations, conflictViolations, redRuns, watchdog, wallClamps, gapClamps, stats}
 */
export function runClosed(tn, o) {
  const dt = 0.05;
  const traffic = createTraffic(tn, { seed: o.seed | 0, cap: o.cars, closed: true, hooks: o.hooks });
  traffic.setTime(o.t0 || 0);
  traffic.setEnv({ phase: 0.25, rain: !!o.rain, night: false });
  if (o.obstacles) traffic.setObstacles(o.obstacles, o.obstacles.length);
  traffic.populate();
  const steps = Math.round(o.seconds / dt);
  const mon = createMonitor(tn);
  for (let n = 0; n < steps; n++) {
    traffic.step(dt);
    mon.step(traffic, dt, o.gapEvery || 2);
  }
  const m = mon.result();
  const st = traffic.stats;
  return {
    minGap: m.minGap,
    nearPairs: m.nearPairs,
    maxStill: m.maxStill,
    maxTicket: st.maxTicketAge,
    traffic,
    crossings: st.crossings,
    redViolations: m.redViolations,
    conflictViolations: m.conflictViolations,
    redRuns: st.redRuns,
    watchdog: st.watchdog,
    wallClamps: st.wallClamps,
    gapClamps: st.gapClamps,
    stats: st,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Soak yardımcıları (trafficSoak*.test.js ortak): 20 üretilmiş ızgara varyantı
 * ---------------------------------------------------------------------------------------------- */
export function gridCfg(k) {
  return {
    nx: 4 + (k % 4),
    nz: 4 + ((k >> 1) % 3),
    every: 2 + (k % 2),
    seed: 500 + k,
    cut: [0, 0.15, 0.3][k % 3],
    flat: k === 19,
  };
}

export function soakGrid(k, density, cycles) {
  const cfg = gridCfg(k);
  const net = makeGridNet(cfg);
  const tn = buildTrafficNet(net, { seed: cfg.seed });
  const cars = Math.max(6, Math.round(net.nodes.length * density));
  return runClosed(tn, {
    seed: cfg.seed, cars, seconds: cycles * 27, gapEvery: 2,
  });
}
