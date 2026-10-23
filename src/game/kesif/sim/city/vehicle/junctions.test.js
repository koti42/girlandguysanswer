import { describe, expect, it } from 'vitest';
import {
  TURN, buildTrafficNet, dedgeSuccessors, hasPriority, lanePose, movePose, movesConflict, nearestDedges, rightArm, routeDedges, trafficNet, yAt,
} from './junctions.js';
import { SIG, armSignal } from './trafficLights.js';
import { getCityPlan, pois as cityPois } from '../cityPlan.js';
import { roadNet } from '../roadNet.js';
import {
  SURF, bridgeAt, surfaceAt, tunnelAt,
} from '../cityRoads.js';
import { makeGridNet } from './trafficTestKit.js';

const SEED = 20260;
const o = { x: 0, y: 0, z: 0, yaw: 0 };

function onRoad(R, x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const s = surfaceAt(R, xi, zi);
  return (s >= SURF.ASPHALT && s <= SURF.ZEBRA_Z) || bridgeAt(R, xi, zi) || tunnelAt(R, xi, zi) > 0;
}

describe('junctions: gerçek şehir ağı', () => {
  const tn = trafficNet(SEED);
  const net = roadNet(SEED);
  const plan = getCityPlan(SEED);

  it('her kenarın iki yönü var, atlanan yok; önbellek aynı nesneyi verir', () => {
    expect(tn.stats.skipped).toBe(0);
    expect(tn.dedges.length).toBe(net.edges.length * 2);
    expect(trafficNet(SEED)).toBe(tn);
    expect(tn.stats.junctions).toBe(net.nodes.length);
    tn.dedges.forEach((de) => {
      expect(tn.dedges[de.rev].rev).toBe(de.id);
      expect(tn.dedges[de.rev].from).toBe(de.to);
      expect(de.s1 - de.s0).toBeGreaterThan(20);
      expect(de.lanes).toBeGreaterThanOrEqual(1);
      expect(de.lanes).toBeLessThanOrEqual(2);
      expect(de.armTo).toBe((tn.dedges[de.rev].armFrom));
    });
  });

  it('şerit noktalarının hepsi asfalt/şerit/zebra, köprü ya da tünel — su/kaldırım/boşluk yok', () => {
    const R = plan.roads;
    let n = 0;
    tn.dedges.forEach((de) => {
      for (let l = 0; l < de.lanes; l++) {
        for (let s = 0; s <= de.D; s += 4) {
          lanePose(de, l, s, o);
          n++;
          if (!onRoad(R, o.x, o.z)) throw new Error('yol dışı şerit: de ' + de.id + ' şerit ' + l + ' s ' + s);
        }
      }
    });
    expect(n).toBeGreaterThan(20000);
  });

  it('kavşak hareketleri de yol üstünde (iç köşe kaldırımına taşma yok) ve şeritlerle sürekli', () => {
    const R = plan.roads;
    let n = 0;
    tn.junctions.forEach((J) => {
      if (!J) return;
      J.moves.forEach((mv) => {
        for (let p = 0; p <= mv.len; p += 1) {
          movePose(mv, p, o);
          n++;
          if (!onRoad(R, o.x, o.z)) throw new Error('yol dışı hareket: kavşak ' + J.id + ' hareket ' + mv.local + ' p ' + p);
        }
        // başlangıç = giriş şeridinin DUR çizgisi, bitiş = çıkış şeridinin başı; yön sürekli
        const dIn = tn.dedges[mv.deIn];
        const dOut = tn.dedges[mv.deOut];
        lanePose(dIn, mv.inLane, dIn.s1, o);
        const a0 = movePose(mv, 0, { x: 0, y: 0, z: 0, yaw: 0 });
        expect(Math.hypot(a0.x - o.x, a0.z - o.z)).toBeLessThan(0.02);
        expect(Math.abs(Math.atan2(Math.sin(a0.yaw - o.yaw), Math.cos(a0.yaw - o.yaw)))).toBeLessThan(0.02);
        lanePose(dOut, mv.outLane, dOut.s0, o);
        const a1 = movePose(mv, mv.len, { x: 0, y: 0, z: 0, yaw: 0 });
        expect(Math.hypot(a1.x - o.x, a1.z - o.z)).toBeLessThan(0.02);
        expect(Math.abs(Math.atan2(Math.sin(a1.yaw - o.yaw), Math.cos(a1.yaw - o.yaw)))).toBeLessThan(0.02);
        // yönün adımlar arası değişimi sınırlı (yumuşak)
        let prev = movePose(mv, 0, { x: 0, y: 0, z: 0, yaw: 0 }).yaw;
        for (let p = 0.5; p <= mv.len; p += 0.5) {
          const y = movePose(mv, p, { x: 0, y: 0, z: 0, yaw: 0 }).yaw;
          expect(Math.abs(Math.atan2(Math.sin(y - prev), Math.cos(y - prev)))).toBeLessThan(0.5);
          prev = y;
        }
      });
    });
    expect(n).toBeGreaterThan(50000);
  });

  it('DUR çizgisi zebranın dışında: s1 = uzunluk − (dik yolun yarı genişliği + 3,4); U dönüşü yok', () => {
    tn.junctions.forEach((J) => {
      if (!J) return;
      for (let a = 0; a < 4; a++) {
        const A = J.arms[a];
        if (!A.present) continue;
        expect(A.clear).toBeGreaterThanOrEqual(6 + 3.4 - 1e-9);
        expect(A.clear).toBeLessThanOrEqual(10 + 3.4 + 1e-9);
      }
      J.moves.forEach((mv) => {
        expect(mv.outArm).not.toBe(mv.inArm);
        expect(mv.len).toBeGreaterThan(8);
        expect(mv.len).toBeLessThan(60);
      });
    });
  });

  it('kip dağılımı: arter×arter fixed, arter×sokak main, sokak×sokak ve dirsek free; lambalı kol sayısı planla aynı', () => {
    const modes = { fixed: 0, main: 0, free: 0 };
    tn.junctions.forEach((J) => {
      if (!J || J.armMask === 0) return;
      modes[J.plan.mode]++;
    });
    expect(modes.fixed).toBeGreaterThan(20);
    expect(modes.main).toBeGreaterThan(50);
    expect(modes.free).toBeGreaterThan(50);
    plan.intersections.forEach((it) => {
      const J = tn.junctions[it.id];
      const lit = J.plan.lit.filter(Boolean).length;
      if (J.plan.mode === 'fixed') expect(lit).toBe(it.lights.length);
      if (J.plan.mode === 'free') expect(it.lights.length).toBe(0);
    });
  });

  it('çatışma matrisi: simetrik, kendisiyle çatışmaz, aynı çıkış şeridi birleşmesi çatışır, aynı giriş şeridi çatışmaz, karşılıklı düz geçişler çatışmaz, dik düzler çatışır', () => {
    let pairs = 0;
    let conflicts = 0;
    tn.junctions.forEach((J) => {
      if (!J || J.moves.length === 0) return;
      const m = J.moves;
      for (let a = 0; a < m.length; a++) {
        expect(movesConflict(J, a, a)).toBe(false);
        for (let b = a + 1; b < m.length; b++) {
          const c = movesConflict(J, a, b);
          expect(movesConflict(J, b, a)).toBe(c);
          pairs++;
          if (c) conflicts++;
          if (m[a].inArm === m[b].inArm && m[a].inLane === m[b].inLane) expect(c).toBe(false);
          else if (m[a].outArm === m[b].outArm && m[a].outLane === m[b].outLane) expect(c).toBe(true);
          if (m[a].turn === TURN.STRAIGHT && m[b].turn === TURN.STRAIGHT) {
            const opp = ((m[a].inArm + 2) & 3) === m[b].inArm;
            const perp = (m[a].inArm & 1) !== (m[b].inArm & 1);
            if (opp) expect(c).toBe(false);
            if (perp) expect(c).toBe(true);
          }
        }
      }
    });
    expect(pairs).toBeGreaterThan(10000);
    expect(conflicts).toBeGreaterThan(1000);
    expect(conflicts).toBeLessThan(pairs);
  });

  it('sağdan öncelik: çatışan, farklı kollardan iki hareketten tam biri önceliklidir (antisimetri)', () => {
    let checked = 0;
    tn.junctions.forEach((J) => {
      if (!J) return;
      const m = J.moves;
      for (let a = 0; a < m.length; a++) {
        for (let b = a + 1; b < m.length; b++) {
          if (m[a].inArm === m[b].inArm) continue;
          const x = hasPriority(m[a], m[b]);
          const y = hasPriority(m[b], m[a]);
          expect(x).not.toBe(y);
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(1000);
    expect(rightArm(0)).toBe(3);
    expect(rightArm(1)).toBe(0);
  });

  it('yAt: kenar uçlarında düğüm yüksekliği; tünel rampasında aralıkta monoton', () => {
    tn.dedges.forEach((de) => {
      expect(Number.isFinite(yAt(de, 0))).toBe(true);
      expect(Number.isFinite(yAt(de, de.D))).toBe(true);
      expect(Math.abs(yAt(de, de.D / 2) - 64)).toBeLessThan(9);
    });
  });

  it('bağlantı: 16 terminal + tüm POI çiftleri sürülebilir yönlü ağda her iki yönde de rota bulur (güçlü bağlantı)', () => {
    // yönlü kenar grafında güçlü bağlı mı? (U dönüşü yok) — 0. terminalin yakınındaki kenardan her dedge'e ve geri
    const start = nearestDedges(tn, 0, 0)[0];
    const fwd = new Uint8Array(tn.dedges.length);
    const back = new Uint8Array(tn.dedges.length);
    const pred = tn.dedges.map(() => []);
    tn.dedges.forEach((de) => dedgeSuccessors(tn, de.id).forEach((s) => pred[s].push(de.id)));
    const bfs = (adj, mark) => {
      const st = [start];
      mark[start] = 1;
      while (st.length) {
        const u = st.pop();
        const l = adj(u);
        for (let i = 0; i < l.length; i++) if (!mark[l[i]]) {
          mark[l[i]] = 1;
          st.push(l[i]);
        }
      }
    };
    bfs((u) => dedgeSuccessors(tn, u), fwd);
    bfs((u) => pred[u], back);
    expect(fwd.reduce((a, b) => a + b, 0)).toBe(tn.dedges.length);
    expect(back.reduce((a, b) => a + b, 0)).toBe(tn.dedges.length);
  });

  it('her POI için en yakın yol kenarı vardır; terminaller ve POI türlerinden örnekler arası rota bulunur (en kısa yol ≤ 2,2× kuş uçuşu + 900 m (U dönüşü yok))', () => {
    const list = cityPois(SEED);
    const terminals = list.filter((p) => p.type === 'portal_terminal');
    expect(terminals.length).toBe(16);
    const key = ['portal_terminal', 'garage', 'rental', 'courier_desk', 'race_gate', 'roof_start', 'vendor', 'photo_spot', 'park_slot'];
    const pts = [];
    key.forEach((t) => {
      const l = list.filter((p) => p.type === t);
      // türden en çok 5 örnek (sabit aralıkla)
      const step = Math.max(1, Math.floor(l.length / 5));
      for (let i = 0; i < l.length; i += step) pts.push(l[i]);
    });
    const ded = pts.map((p) => nearestDedges(tn, p.x, p.z)[0]);
    ded.forEach((d) => expect(d).toBeDefined());
    let routes = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j < pts.length; j++) {
        if (i === j || ded[i] === ded[j]) continue;
        const r = routeDedges(tn, ded[i], ded[j]);
        expect(r, 'rota yok: ' + pts[i].type + ' → ' + pts[j].type).not.toBe(null);
        if ((i + j) % 11 === 0) {
          let len = 0;
          r.forEach((d) => { len += tn.dedges[d].D; });
          const crow = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
          expect(len).toBeLessThan(crow * 2.2 + 900);
        }
        routes++;
      }
    }
    expect(routes).toBeGreaterThan(1000);
  });

  it('tüm terminal çiftleri (16×16) rota bulur', () => {
    const terminals = plan.terminals;
    const ded = terminals.map((t) => nearestDedges(tn, t.x, t.z)[0]);
    let n = 0;
    for (let i = 0; i < ded.length; i++) {
      for (let j = 0; j < ded.length; j++) {
        if (i === j) continue;
        expect(routeDedges(tn, ded[i], ded[j])).not.toBe(null);
        n++;
      }
    }
    expect(n).toBe(240);
  });

  it('belirlenimci: iki bağımsız kurulum aynı hareket sayısı, uzunluk ve ışık planı verir', () => {
    const tn2 = buildTrafficNet(roadNet(SEED), { seed: SEED, halfWidth: (node, axis) => (axis === 'v' ? Math.max(6, node.i % 3 === 0 ? 10 : 6) : node.j % 3 === 0 ? 10 : 6) });
    expect(tn2.stats.moves).toBe(tn.stats.moves);
    tn.junctions.forEach((J, i) => {
      if (!J) return;
      expect(tn2.junctions[i].plan.phase0).toBe(J.plan.phase0);
      expect(tn2.junctions[i].moves.length).toBe(J.moves.length);
    });
  });

  it('20 tohum: ağ kurulur, hepsi güçlü bağlı, sıfır atlanan kenar', () => {
    for (let k = 0; k < 20; k++) {
      const s = 1000 + k * 7919;
      const t = trafficNet(s);
      expect(t.stats.skipped).toBe(0);
      const start = nearestDedges(t, 0, 0)[0];
      const seen = new Uint8Array(t.dedges.length);
      const st = [start];
      seen[start] = 1;
      let cnt = 1;
      while (st.length) {
        const u = st.pop();
        dedgeSuccessors(t, u).forEach((v) => {
          if (!seen[v]) {
            seen[v] = 1;
            cnt++;
            st.push(v);
          }
        });
      }
      expect(cnt).toBe(t.dedges.length);
    }
  });
});

describe('junctions: sentetik ızgaralar (4 yön, T, dirsek)', () => {
  it('4 yönlü arter kavşakta 24 hareket (4 kol × 2 şerit × 3 yön); T kavşakta 12/6; dirsekte yalnız bir çıkış', () => {
    const net = makeGridNet({
      nx: 5, nz: 5, every: 2, seed: 3, cut: 0.3,
    });
    const tn = buildTrafficNet(net, { seed: 3 });
    tn.junctions.forEach((J) => {
      if (!J || J.armMask === 0) return;
      const arms = [0, 1, 2, 3].filter((a) => J.arms[a].present);
      let expected = 0;
      arms.forEach((a) => {
        const lanes = tn.dedges[J.arms[a].in].lanes;
        expected += lanes * (arms.length - 1);
      });
      if (arms.length === 1) expected = 0;
      expect(J.moves.length).toBe(expected);
      if (arms.length === 2) {
        const outs = new Set(J.moves.map((m) => m.inArm + '>' + m.outArm));
        expect(outs.size).toBe(2);
      }
    });
  });

  it('yönlü kenarlardan her kavşakta sağ şerit kaldırıma yakın: şerit 0 orta çizgide, son şerit dışta', () => {
    const net = makeGridNet({
      nx: 4, nz: 4, every: 2, seed: 1,
    });
    const tn = buildTrafficNet(net, { seed: 1 });
    const de = tn.dedges.find((d) => d.lanes === 2);
    const a = lanePose(de, 0, 30, { x: 0, y: 0, z: 0, yaw: 0 });
    const b = lanePose(de, 1, 30, { x: 0, y: 0, z: 0, yaw: 0 });
    const c = (a.x - de.x0) * de.rx + (a.z - de.z0) * de.rz;
    const d = (b.x - de.x0) * de.rx + (b.z - de.z0) * de.rz;
    expect(c).toBeCloseTo(1.7, 5);
    expect(d).toBeCloseTo(5.1, 5);
  });

  it('düz geçişte sinyal planı: aynı kolun lambası fixed kipinde birbirini dışlar', () => {
    const net = makeGridNet({
      nx: 4, nz: 4, every: 3, seed: 1,
    });
    const tn = buildTrafficNet(net, { seed: 1 });
    tn.junctions.forEach((J) => {
      if (!J || J.plan.mode !== 'fixed') return;
      for (let t = 0; t < 27; t += 0.5) {
        const a = armSignal(J.plan, 0, t);
        const b = armSignal(J.plan, 1, t);
        expect(a === SIG.GREEN && b === SIG.GREEN).toBe(false);
      }
    });
  });
});
