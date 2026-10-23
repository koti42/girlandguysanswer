/*
 * KEŞİF sim/city — YOL AĞI (araç) ve YÜRÜME AĞI (yaya) grafları + kavşak (trafik ışığı) planı. Saf, belirlenimci, önbellekli.
 *
 *  roadNet(seed) → RoadNet {
 *     nodes:[{id,i,j,x,y,z,kind:'x'|'t'|'bend'|'end',light:bool,arms}],        id = cityRoads.nodeId(i,j) (tohumdan bağımsız, 342 düğüm)
 *     edges:[{id,sid,a,b,kind:'avenue'|'street',lanesPerDir,laneW:3.4,limit,pts:Float32Array(x,y,z…),len,bridge,tunnel,axis:'v'|'h',line:i|j}],
 *     intersections:[{id,x,y,z,type:'ar'|'ara'|'yan',arms,lights:[{x,y,z,dir}],phase0,cycle:27}],
 *     route(a,b) → edgeId[] | null     (a,b düğüm kimlikleri; a===b → [])        routeNodes(a,b) → nodeId[] | null
 *     nearest(x,z) → {edge,node,x,y,z,t,dist}     nodeAt(i,j) → node | null     edgeOf(sid) → edge | null
 *  }
 *  walkNet(seed) → WalkNet { nodes:[{id,x,y,z,tag}], edges:[{id,a,b,tag:'sidewalk'|'crossing'|'plaza'|'quay'|'stair',len,junction}],
 *     adj, route(a,b) → nodeId[] | null, nearest(x,z) → nodeId, components() → sayı }
 *  buildRoadNet(plan) / buildWalkNet(plan)   (önbelleksiz; cityPlan sarar)
 *
 * Işık dir: 0 K kolu, 1 D kolu, 2 G kolu, 3 B kolu (o koldan GELEN trafiği yönetir); direk, gelen trafiğin sağındaki ileri köşede durur
 * (K kolu → GB köşesi, D kolu → KB, G kolu → KD, B kolu → GD). Faz: 4 yön döngüsü 27 sn (yeşil 10, sarı 2, hepsi kırmızı 1.5 ×2); phase0 ∈ [0,27).
 * Yaya ağı: kavşak köşe düğümleri (4/kavşak), bloklarda açık-blok merkezi, köprü/rıhtım düğümleri; tünel kavşakları (r<90, merkez hariç) yok.
 */
import { getCityPlan } from './cityPlan.js';
import {
  BK, BRIDGE_LIST, GRID, GRID_N, GROUND_Y, NODE_COUNT, ROWS, SEGMENTS, SEG_COUNT, asphaltHalf, halfWidth, hasRow,
  isOpenKind, nodeId, nodeY, prevRow, segH, segTunnelOf, segmentPts, segV,
} from './cityRoads.js';
import { Lru } from './cityPlanKit.js';

export const LANE_W = 3.4;
export const LIGHT_CYCLE = 27;
const LIMIT = Object.freeze({ avenue: 18, street: 12, tunnel: 14 });

/* ------------------------------------------------------------------------------------------------
 * küçük ikili yığın (Dijkstra)
 * ---------------------------------------------------------------------------------------------- */
class MinHeap {
  constructor() {
    this.k = [];
    this.v = [];
  }

  get size() {
    return this.k.length;
  }

  push(key, val) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }

  pop() {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop();
    const lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

function dijkstra(adj, n, a, b, weight) {
  if (a === b) return [a];
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const h = new MinHeap();
  dist[a] = 0;
  h.push(0, a);
  while (h.size) {
    const u = h.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === b) break;
    const l = adj[u];
    for (let q = 0; q < l.length; q++) {
      const e = l[q];
      const w = dist[u] + weight(e);
      if (w < dist[e.to]) {
        dist[e.to] = w;
        prev[e.to] = u;
        h.push(w, e.to);
      }
    }
  }
  if (!isFinite(dist[b])) return null;
  const out = [];
  for (let c = b; c !== -1; c = prev[c]) out.push(c);
  out.reverse();
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Yol ağı
 * ---------------------------------------------------------------------------------------------- */
const CORNER = Object.freeze([
  { q: 0, sx: -1, sz: -1 }, // NW
  { q: 1, sx: 1, sz: -1 }, // NE
  { q: 2, sx: -1, sz: 1 }, // SW
  { q: 3, sx: 1, sz: 1 }, // SE
]);

function popcount(v) {
  let c = 0;
  for (let b = v; b; b &= b - 1) c++;
  return c;
}

export function buildRoadNet(plan) {
  const R = plan.roads;
  const nodes = new Array(NODE_COUNT);
  for (let j = -GRID_N; j <= GRID_N; j++) {
    if (!hasRow(j)) continue;
    for (let i = -GRID_N; i <= GRID_N; i++) {
      const id = nodeId(i, j);
      const arms = R.arms[id];
      const c = popcount(arms);
      nodes[id] = {
        id, i, j, x: i * GRID, y: nodeY(i, j), z: j * GRID, kind: c >= 4 ? 'x' : c === 3 ? 't' : c === 2 ? 'bend' : 'end', light: false, arms,
      };
    }
  }
  const edges = [];
  const edgeBySid = new Int32Array(SEG_COUNT).fill(-1);
  const adj = new Array(NODE_COUNT);
  for (let n = 0; n < NODE_COUNT; n++) adj[n] = [];
  for (let sid = 0; sid < SEG_COUNT; sid++) {
    if (R.cut[sid]) continue;
    const g = SEGMENTS[sid];
    const a = nodeId(g.ai, g.aj);
    const b = nodeId(g.bi, g.bj);
    const tunnel = segTunnelOf(g);
    const pts = segmentPts(R, sid);
    let len = 0;
    for (let p = 3; p < pts.length; p += 3) {
      const dx = pts[p] - pts[p - 3];
      const dy = pts[p + 1] - pts[p - 2];
      const dz = pts[p + 2] - pts[p - 1];
      len += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    const kind = g.arterial ? 'avenue' : 'street';
    const e = {
      id: edges.length, sid, a, b, kind, lanesPerDir: g.arterial ? 2 : 1, laneW: LANE_W, limit: tunnel ? LIMIT.tunnel : LIMIT[kind], pts, len,
      bridge: g.axis === 'v' && g.k === 6, tunnel, axis: g.axis, line: g.line,
    };
    edges.push(e);
    edgeBySid[sid] = e.id;
    adj[a].push({ to: b, edge: e.id, len });
    adj[b].push({ to: a, edge: e.id, len });
  }

  // kavşaklar ve ışıklar (plan.intersections ile aynı kayıtlar)
  const intersections = plan.intersections;
  for (let q = 0; q < intersections.length; q++) {
    const nd = nodes[intersections[q].id];
    if (nd) nd.light = intersections[q].lights.length > 0;
  }

  function route(a, b) {
    if (!nodes[a] || !nodes[b]) return null;
    if (a === b) return [];
    const path = dijkstra(adj, NODE_COUNT, a, b, (e) => e.len);
    if (!path) return null;
    const out = [];
    for (let p = 1; p < path.length; p++) {
      const u = path[p - 1];
      const v = path[p];
      const l = adj[u];
      let best = -1;
      let bl = Infinity;
      for (let q = 0; q < l.length; q++) if (l[q].to === v && l[q].len < bl) {
        bl = l[q].len;
        best = l[q].edge;
      }
      out.push(best);
    }
    return out;
  }
  function routeNodes(a, b) {
    if (!nodes[a] || !nodes[b]) return null;
    return dijkstra(adj, NODE_COUNT, a, b, (e) => e.len);
  }

  /** (x,z)'ye en yakın yol merkez çizgisi noktası. */
  function nearest(x, z) {
    let best = null;
    let bd = Infinity;
    const i0 = Math.round(x / GRID);
    const j0 = Math.round(z / GRID);
    const test = (sid) => {
      const eid = edgeBySid[sid];
      if (eid < 0) return;
      const e = edges[eid];
      const p = e.pts;
      let acc = 0;
      for (let k = 3; k < p.length; k += 3) {
        const ax = p[k - 3];
        const ay = p[k - 2];
        const az = p[k - 1];
        const bx = p[k];
        const by = p[k + 1];
        const bz = p[k + 2];
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t;
        const pz = az + dz * t;
        const d = (x - px) * (x - px) + (z - pz) * (z - pz);
        const segLen = Math.sqrt(l2 + (by - ay) * (by - ay));
        if (d < bd) {
          bd = d;
          best = { edge: eid, x: px, y: ay + (by - ay) * t, z: pz, t: e.len > 0 ? (acc + segLen * t) / e.len : 0, dist: 0 };
        }
        acc += segLen;
      }
    };
    for (let di = -2; di <= 2; di++) {
      const i = i0 + di;
      if (i < -GRID_N || i > GRID_N) continue;
      for (let r = 0; r < ROWS.length - 1; r++) test(segV(i, ROWS[r]));
    }
    for (let dj = -2; dj <= 2; dj++) {
      const j = j0 + dj;
      if (!hasRow(j)) continue;
      for (let i = -GRID_N; i < GRID_N; i++) {
        if (Math.abs(i * GRID + 40 - x) > 170) continue;
        test(segH(j, i));
      }
    }
    if (best === null) {
      for (let sid = 0; sid < SEG_COUNT; sid++) test(sid);
    }
    best.dist = Math.sqrt(bd);
    // en yakın düğüm
    const e = edges[best.edge];
    const na = nodes[e.a];
    const nb = nodes[e.b];
    const da = (na.x - best.x) * (na.x - best.x) + (na.z - best.z) * (na.z - best.z);
    const db = (nb.x - best.x) * (nb.x - best.x) + (nb.z - best.z) * (nb.z - best.z);
    best.node = da <= db ? na.id : nb.id;
    return best;
  }

  return {
    nodes, edges, intersections, route, routeNodes, nearest, edgeBySid,
    nodeAt(i, j) {
      return hasRow(j) && i >= -GRID_N && i <= GRID_N ? nodes[nodeId(i, j)] : null;
    },
    edgeOf(sid) {
      return edgeBySid[sid] >= 0 ? edges[edgeBySid[sid]] : null;
    },
    nodeCount: NODE_COUNT,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Yürüme ağı
 * ---------------------------------------------------------------------------------------------- */
export function buildWalkNet(plan) {
  const R = plan.roads;
  const nodes = [];
  const edges = [];
  const adj = [];
  const addNode = (x, y, z, tag) => {
    const id = nodes.length;
    nodes.push({ id, x, y, z, tag });
    adj.push([]);
    return id;
  };
  const addEdge = (a, b, tag, junction) => {
    if (a === b || a < 0 || b < 0) return;
    const na = nodes[a];
    const nb = nodes[b];
    const dx = na.x - nb.x;
    const dy = na.y - nb.y;
    const dz = na.z - nb.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const id = edges.length;
    edges.push({ id, a, b, tag, len, junction: junction === undefined ? -1 : junction });
    adj[a].push({ to: b, edge: id, len });
    adj[b].push({ to: a, edge: id, len });
  };

  // kol segmenti: junction (i,j) için dir 0 K, 1 D, 2 G, 3 B → segment kimliği | -1 (ızgara dışı)
  const armSid = (i, j, dir) => {
    if (dir === 0) return j > -GRID_N ? segV(i, prevRow(j)) : -1;
    if (dir === 2) return j < GRID_N ? segV(i, j) : -1;
    if (dir === 1) return i < GRID_N ? segH(j, i) : -1;
    return i > -GRID_N ? segH(j, i - 1) : -1;
  };
  const CORNER_ARMS = [[0, 3], [0, 1], [2, 3], [2, 1]]; // NW NE SW SE köşelerini sınırlayan kollar
  // köşe düğümleri
  const corner = new Int32Array(NODE_COUNT * 4).fill(-1);
  const skipped = new Uint8Array(NODE_COUNT);
  for (let j = -GRID_N; j <= GRID_N; j++) {
    if (!hasRow(j)) continue;
    for (let i = -GRID_N; i <= GRID_N; i++) {
      const n = nodeId(i, j);
      const x = i * GRID;
      const z = j * GRID;
      const r2 = x * x + z * z;
      if (r2 > 0 && r2 < 90 * 90 && (i === 0 || j === 0)) {
        skipped[n] = 1; // tünel kavşakları
        continue;
      }
      const hwV = halfWidth(i);
      const hwH = halfWidth(j);
      const ahV = asphaltHalf(i);
      const ahH = asphaltHalf(j);
      for (let c = 0; c < 4; c++) {
        // iki sınır kolu da yoksa (harita köşesi dışı) köşe karesi yetim kalır → düğüm yok
        if (armSid(i, j, CORNER_ARMS[c][0]) < 0 && armSid(i, j, CORNER_ARMS[c][1]) < 0) continue;
        const cn = CORNER[c];
        const cx = x + cn.sx * (ahV + (hwV - ahV) / 2);
        const cz = z + cn.sz * (ahH + (hwH - ahH) / 2);
        corner[n * 4 + c] = addNode(cx, GROUND_Y, cz, 'corner');
      }
    }
  }
  const cn = (i, j, q) => (hasRow(j) && i >= -GRID_N && i <= GRID_N ? corner[nodeId(i, j) * 4 + q] : -1);
  // kavşak kolları: geçit (çizgi varsa) / meydan (kesikse)
  const ARMQ = [[0, 1], [1, 3], [3, 2], [2, 0]]; // N: NW-NE, E: NE-SE, S: SE-SW, W: SW-NW
  for (let j = -GRID_N; j <= GRID_N; j++) {
    if (!hasRow(j)) continue;
    for (let i = -GRID_N; i <= GRID_N; i++) {
      const n = nodeId(i, j);
      if (skipped[n]) continue;
      for (let dir = 0; dir < 4; dir++) {
        const sid = armSid(i, j, dir);
        if (sid < 0) continue;
        const a = corner[n * 4 + ARMQ[dir][0]];
        const b = corner[n * 4 + ARMQ[dir][1]];
        if (R.cut[sid]) addEdge(a, b, 'plaza', n);
        else addEdge(a, b, 'crossing', n);
      }
    }
  }
  // kenar boyunca kaldırım (köprüde rıhtım düğümleriyle bölünür)
  const quayN = new Map();
  const quayS = new Map();
  for (let sid = 0; sid < SEG_COUNT; sid++) {
    const g = SEGMENTS[sid];
    const na = nodeId(g.ai, g.aj);
    const nb = nodeId(g.bi, g.bj);
    if (skipped[na] || skipped[nb]) continue;
    if (segTunnelOf(g)) continue;
    const tag = R.cut[sid] ? 'plaza' : 'sidewalk';
    if (g.axis === 'v') {
      const west = [cn(g.ai, g.aj, 2), cn(g.bi, g.bj, 0)];
      const east = [cn(g.ai, g.aj, 3), cn(g.bi, g.bj, 1)];
      if (g.k === 6) {
        const br = BRIDGE_LIST[g.line + GRID_N];
        const hw = halfWidth(g.line);
        const ah = asphaltHalf(g.line);
        const wx = g.line * GRID - (ah + (hw - ah) / 2);
        const ex = g.line * GRID + (ah + (hw - ah) / 2);
        const wN = addNode(wx, GROUND_Y, br.z0, 'quay');
        const wS = addNode(wx, GROUND_Y, br.z1, 'quay');
        const eN = addNode(ex, GROUND_Y, br.z0, 'quay');
        const eS = addNode(ex, GROUND_Y, br.z1, 'quay');
        addEdge(west[0], wN, tag);
        addEdge(wN, wS, tag);
        addEdge(wS, west[1], tag);
        addEdge(east[0], eN, tag);
        addEdge(eN, eS, tag);
        addEdge(eS, east[1], tag);
        quayN.set(g.line, [wN, eN]);
        quayS.set(g.line, [wS, eS]);
      } else {
        addEdge(west[0], west[1], tag);
        addEdge(east[0], east[1], tag);
      }
    } else {
      addEdge(cn(g.ai, g.aj, 1), cn(g.bi, g.bj, 0), tag);
      addEdge(cn(g.ai, g.aj, 3), cn(g.bi, g.bj, 2), tag);
    }
  }
  // rıhtım: komşu köprüler arasında iki yakada
  for (let i = -GRID_N; i < GRID_N; i++) {
    const a = quayN.get(i);
    const b = quayN.get(i + 1);
    if (a && b) addEdge(a[1], b[0], 'quay');
    const c = quayS.get(i);
    const d = quayS.get(i + 1);
    if (c && d) addEdge(c[1], d[0], 'quay');
  }
  // açık bloklar ve tepe: merkez düğümü + 4 köşe
  const blockCenters = new Map();
  const blocks = R.blocks;
  for (let bj = -9; bj <= 8; bj++) {
    for (let bi = -9; bi <= 8; bi++) {
      const k = blocks.kindAt(bi, bj);
      if (!isOpenKind(k) && k !== BK.HILL) continue;
      const cx = bi * GRID + GRID / 2;
      const cz = bj * GRID + GRID / 2;
      const id = addNode(cx, GROUND_Y, cz, k === BK.HILL ? 'hill' : 'plaza');
      blockCenters.set(bi + ',' + bj, id);
      const corners = [cn(bi, bj, 3), cn(bi + 1, bj, 2), cn(bi, bj + 1, 1), cn(bi + 1, bj + 1, 0)];
      for (let q = 0; q < 4; q++) addEdge(id, corners[q], 'plaza');
    }
  }
  // Tepe terası (HILL): zirve düğümü, merkezden merdivenle
  const hill = blocks.hill;
  let hillTop = -1;
  if (plan.hill) {
    hillTop = addNode(plan.hill.top.x, plan.hill.top.y, plan.hill.top.z, 'hilltop');
    addEdge(blockCenters.get(hill.bi + ',' + hill.bj), hillTop, 'stair');
  }

  // en yakın düğüm için kova
  const buckets = new Map();
  const BS = 40;
  for (let n = 0; n < nodes.length; n++) {
    const key = Math.floor(nodes[n].x / BS) * 4096 + Math.floor(nodes[n].z / BS);
    let l = buckets.get(key);
    if (!l) {
      l = [];
      buckets.set(key, l);
    }
    l.push(n);
  }
  function nearest(x, z) {
    const bx = Math.floor(x / BS);
    const bz = Math.floor(z / BS);
    let best = -1;
    let bd = Infinity;
    for (let ring = 0; ring < 40; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const l = buckets.get((bx + dx) * 4096 + (bz + dz));
          if (!l) continue;
          for (let q = 0; q < l.length; q++) {
            const nd = nodes[l[q]];
            const d = (nd.x - x) * (nd.x - x) + (nd.z - z) * (nd.z - z);
            if (d < bd) {
              bd = d;
              best = l[q];
            }
          }
        }
      }
      if (best >= 0 && bd <= (ring * BS) * (ring * BS)) break;
    }
    return best;
  }
  function route(a, b) {
    if (a < 0 || b < 0 || a >= nodes.length || b >= nodes.length) return null;
    return dijkstra(adj, nodes.length, a, b, (e) => e.len);
  }
  function components() {
    const seen = new Uint8Array(nodes.length);
    let comps = 0;
    for (let s = 0; s < nodes.length; s++) {
      if (seen[s]) continue;
      comps++;
      const st = [s];
      seen[s] = 1;
      while (st.length) {
        const u = st.pop();
        const l = adj[u];
        for (let q = 0; q < l.length; q++) {
          if (!seen[l[q].to]) {
            seen[l[q].to] = 1;
            st.push(l[q].to);
          }
        }
      }
    }
    return comps;
  }
  return {
    nodes, edges, adj, nearest, route, components, hillTop, blockCenters, cornerNode: cn,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Tohum düzeyinde sarmalayıcılar (sözleşme §7)
 * ---------------------------------------------------------------------------------------------- */
const NET_CACHE = new Lru(6);
const WALK_CACHE = new Lru(6);

export function roadNet(seed) {
  const key = seed >>> 0;
  let n = NET_CACHE.get(key);
  if (!n) n = NET_CACHE.set(key, buildRoadNet(getCityPlan(seed)));
  return n;
}

export function walkNet(seed) {
  const key = seed >>> 0;
  let n = WALK_CACHE.get(key);
  if (!n) n = WALK_CACHE.set(key, buildWalkNet(getCityPlan(seed)));
  return n;
}

export function clearNetCaches() {
  NET_CACHE.clear();
  WALK_CACHE.clear();
}
