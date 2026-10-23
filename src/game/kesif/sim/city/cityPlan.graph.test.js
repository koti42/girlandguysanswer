import { describe, expect, it } from 'vitest';
import { clearCityPlanCaches, getCityPlan } from './cityPlan.js';
import { buildRoadNet, buildWalkNet } from './roadNet.js';
import { BK, GRID, NODE_COUNT, SEG_COUNT } from './cityRoads.js';
import { bfsWalk, citySeed } from './cityPlanTestKit.js';

const N = 1000;

function components(net) {
  const adj = new Array(NODE_COUNT);
  for (let i = 0; i < NODE_COUNT; i++) adj[i] = [];
  net.edges.forEach((e) => {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  });
  const seen = new Uint8Array(NODE_COUNT);
  let comps = 0;
  for (let s = 0; s < NODE_COUNT; s++) {
    if (seen[s]) continue;
    comps++;
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const u = st.pop();
      for (let k = 0; k < adj[u].length; k++) if (!seen[adj[u][k]]) {
        seen[adj[u][k]] = 1;
        st.push(adj[u][k]);
      }
    }
  }
  return { comps, adj };
}

describe('yol grafı (1000 tohum)', () => {
  it('tek bağlı bileşen, her düğüm derecesi ≥2, yarış kenarları kesilmemiş', () => {
    clearCityPlanCaches();
    for (let i = 0; i < N; i++) {
      const plan = getCityPlan(citySeed(i));
      const net = buildRoadNet(plan);
      const { comps, adj } = components(net);
      expect(comps).toBe(1);
      for (let n = 0; n < NODE_COUNT; n++) {
        if (adj[n].length < 2) throw new Error('düğüm derecesi <2: seed#' + i + ' düğüm ' + n);
      }
      for (let r = 0; r < plan.races.length; r++) {
        for (let q = 0; q < plan.races[r].sids.length; q++) {
          if (plan.roads.cut[plan.races[r].sids[q]]) throw new Error('yarış kenarı kesilmiş: seed#' + i + ' yarış ' + r);
        }
      }
    }
  });

  it('düğüm/kenar tablosu: kimlikler tutarlı, kenar uzunluğu = polylinein toplamı, arter 2 şerit, ara sokak 1 şerit', () => {
    const plan = getCityPlan(citySeed(11));
    const net = buildRoadNet(plan);
    expect(net.nodes.length).toBe(NODE_COUNT);
    expect(NODE_COUNT).toBe(342);
    net.nodes.forEach((n, id) => {
      expect(n.id).toBe(id);
      expect(['x', 't', 'bend', 'end']).toContain(n.kind);
    });
    expect(net.edges.length).toBeLessThanOrEqual(SEG_COUNT);
    net.edges.forEach((e, id) => {
      expect(e.id).toBe(id);
      expect(e.laneW).toBe(3.4);
      expect(e.lanesPerDir).toBe(e.kind === 'avenue' ? 2 : 1);
      expect(e.pts).toBeInstanceOf(Float32Array);
      expect(e.pts.length).toBeGreaterThanOrEqual(6);
      let len = 0;
      for (let p = 3; p < e.pts.length; p += 3) len += Math.hypot(e.pts[p] - e.pts[p - 3], e.pts[p + 1] - e.pts[p - 2], e.pts[p + 2] - e.pts[p - 1]);
      expect(Math.abs(len - e.len)).toBeLessThan(1e-3);
      expect(e.limit).toBeGreaterThan(5);
      expect(e.axis === 'v' || e.axis === 'h').toBe(true);
      expect(Number.isInteger(e.line)).toBe(true);
      expect(e.kind === 'avenue').toBe(e.line % 3 === 0);
    });
    // en az bir köprü kenarı (kanal) ve tünel kenarları
    expect(net.edges.filter((e) => e.bridge).length).toBe(19);
    expect(net.edges.filter((e) => e.tunnel).length).toBeGreaterThanOrEqual(8);
  });

  it('route(a,b): her düğüm çifti örneği için yol var, kenarlar zincir oluşturur; nearest() yol üstünde', () => {
    const plan = getCityPlan(citySeed(21));
    const net = buildRoadNet(plan);
    for (let k = 0; k < 120; k++) {
      const a = (k * 37) % NODE_COUNT;
      const b = (k * 101 + 7) % NODE_COUNT;
      const r = net.route(a, b);
      expect(r).not.toBeNull();
      if (a === b) {
        expect(r.length).toBe(0);
        continue;
      }
      const nodes = net.routeNodes(a, b);
      expect(nodes[0]).toBe(a);
      expect(nodes[nodes.length - 1]).toBe(b);
      expect(r.length).toBe(nodes.length - 1);
      for (let q = 0; q < r.length; q++) {
        const e = net.edges[r[q]];
        expect((e.a === nodes[q] && e.b === nodes[q + 1]) || (e.b === nodes[q] && e.a === nodes[q + 1])).toBe(true);
      }
    }
    expect(net.route(0, 99999)).toBeNull();
    for (let k = 0; k < 60; k++) {
      const x = ((k * 53) % 1400) - 700;
      const z = ((k * 91) % 1400) - 700;
      const q = net.nearest(x, z);
      expect(Number.isFinite(q.dist)).toBe(true);
      const e = net.edges[q.edge];
      // projeksiyon noktası kenar polylini üzerinde: x ya da z koordinatı kenar çizgisine eşit
      const onLine = Math.abs(q.x - Math.round(q.x / GRID) * GRID) < 1e-6 || Math.abs(q.z - Math.round(q.z / GRID) * GRID) < 1e-6;
      expect(onLine).toBe(true);
      expect(q.t).toBeGreaterThanOrEqual(-1e-9);
      expect(q.t).toBeLessThanOrEqual(1 + 1e-9);
      expect(e).toBeTruthy();
    }
  });

  it('kavşaklar: arter×arter 4 yön ışığı, arter×yan yalnız arter yönü, yan×yan ışıksız; faz ∈ [0,27)', () => {
    const plan = getCityPlan(citySeed(31));
    const net = buildRoadNet(plan);
    expect(net.intersections.length).toBeGreaterThan(250);
    let ar = 0;
    let ara = 0;
    let yan = 0;
    net.intersections.forEach((it) => {
      expect(it.phase0).toBeGreaterThanOrEqual(0);
      expect(it.phase0).toBeLessThan(27);
      expect(it.cycle).toBe(27);
      if (it.type === 'ar') {
        ar++;
        const armsN = [1, 2, 4, 8].filter((b) => it.arms & b).length;
        expect(it.lights.length).toBe(armsN);
      } else if (it.type === 'ara') {
        ara++;
        expect(it.lights.length).toBeLessThanOrEqual(2);
      } else {
        yan++;
        expect(it.lights.length).toBe(0);
      }
      const dirs = it.lights.map((l) => l.dir);
      expect(new Set(dirs).size).toBe(dirs.length);
    });
    expect(ar).toBeGreaterThan(20);
    expect(ara).toBeGreaterThan(100);
    expect(yan).toBeGreaterThan(20);
    // ışık direkleri yalnız 'light' düğümlerinde
    net.nodes.forEach((n) => {
      const it = net.intersections.find((q) => q.id === n.id);
      expect(n.light).toBe(!!it && it.lights.length > 0);
    });
  });
});

describe('yürüme ağı ve Kapı Meydanı (1000 tohum)', () => {
  it('yaya ağı tek bileşen; terminal 0 ve meydan blokları BFS ile erişilebilir; 16 terminalin hepsi', () => {
    for (let i = 0; i < N; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      const walk = buildWalkNet(plan);
      const t0 = plan.terminals[0];
      const start = walk.nearest(t0.x + 0.5, t0.z + 2.5);
      const seen = bfsWalk(walk, start);
      for (let n = 0; n < walk.nodes.length; n++) {
        if (!seen[n]) throw new Error('erişilemeyen yaya düğümü: seed#' + i + ' (' + walk.nodes[n].x + ',' + walk.nodes[n].z + ') ' + walk.nodes[n].tag);
      }
      for (let t = 0; t < 16; t++) {
        const T = plan.terminals[t];
        const nn = walk.nearest(T.x, T.z);
        expect(seen[nn]).toBe(1);
      }
      // merkez meydan blokları (haç) merkez düğümleri
      plan.roads.blocks.kind.forEach((k, key) => {
        if (k !== BK.CENTRAL) return;
        const bi = (key % 20) - 10;
        const bj = Math.floor(key / 20) - 10;
        const id = walk.blockCenters.get(bi + ',' + bj);
        if (id === undefined || !seen[id]) throw new Error('meydan bloğu erişilemez: seed#' + i + ' ' + bi + ',' + bj);
      });
      if (walk.hillTop < 0 || !seen[walk.hillTop]) throw new Error('tepe terası erişilemez: seed#' + i);
    }
  });

  it('walkNet.route ve nearest; tünel kavşakları ağda yok ama meydan geçilir', () => {
    const plan = getCityPlan(citySeed(2));
    const walk = buildWalkNet(plan);
    const a = walk.nearest(0, 0);
    const b = walk.nearest(440, 200);
    const r = walk.route(a, b);
    expect(r).not.toBeNull();
    expect(r[0]).toBe(a);
    expect(r[r.length - 1]).toBe(b);
    expect(walk.route(-5, 3)).toBeNull();
    expect(walk.components()).toBe(1);
    // r<90 içinde yalnız merkez kavşağın köşeleri ve plaza merkezleri düğümdür (tünel hattı kavşakları yok)
    walk.nodes.forEach((n) => {
      if (n.tag !== 'corner') return;
      const r2 = n.x * n.x + n.z * n.z;
      if (r2 < 90 * 90) {
        expect(Math.abs(n.x) < 12 && Math.abs(n.z) < 12).toBe(true);
      }
    });
  });
});
