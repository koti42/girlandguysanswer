/*
 * KEŞİF sim/city — YARIŞ ROTALARI (8) ve ÇATI PARKURU (8) İSKELETLERİ. Saf, belirlenimci. Sözleşme §1.8, §7.
 *
 *  raceTemplates(seed, districts) → {paths:[{id,key,kind,laps,closed,vertices:[[i,j]…],nodes:[[i,j]…],sids:[…]}], protect:Set<sid>}
 *      Kafes yolları (tohum + bölge çapalarından); kesik kuralı bu segmentleri asla kesmez (race loop = yol grafında HER ZAMAN var).
 *  buildRaces(plan) → Race[8]: {id,key,kind:'circuit'|'sprint',laps,closed,nodes:[nodeId],sids,length,district,
 *      gates:[{index,x,y,z,r:7,dx,dz,s}], start:{x,y,z,yaw}}      kapı sayısı 6–14, ardışık kapı aralığı ≥60 blok, yarıçap 7
 *  buildRoofRoutes(plan) → RoofRoute[8]: {id,district,bi,bj,floors,pads:[{lot,x,y,z,w,d,x0,z0,x1,z1}] (6–10 kontrol),
 *      start:{x,y,z,lot,stair}, end:{x,y,z,lot}, jumps:[{a,b,gap,dy}], maxGap}
 *      Kurallar: komşu çatı boşluğu ≤3 (yürüme) / ≤4 (koşu), fark ≤+1 (zıplama 1.25), hepsi aynı kat sayısı (+0/1 yükseltme).
 *  RACE_KEYS: sıra = cityNames.RACE_NAMES sırası (0 Çevreyolu Turu, 1 Merkez Halkası, 2 Pazar Zigzag Turu, 3 Konteyner Kupası, 4 Liman Turu,
 *      5 Teknopark Halkası, 6 Kanal Sprinti, 7 Tepe Sprinti)
 */
import { DISTRICT_KEYS } from './archetypes.js';
import {
  GRID, GRID_N, PLAZA, SEGMENTS, hasRow, nextRow, nodeId, nodeY, prevRow, segH, segMinR, segTunnelOf, segV,
} from './cityRoads.js';
import { footprintOf, layoutBlock } from './cityLots.js';
import { TAG, clamp, sh } from './cityPlanKit.js';

export const RACE_KEYS = Object.freeze(['cevreyolu', 'merkez', 'pazar', 'konteyner', 'liman', 'teknopark', 'kanal', 'tepe']);
const GATE_R = 7;

/* kafes adımı: (i0,j0) → (i1,j1) aynı çizgide; ara düğümleri verir (j=7 atlanır). */
function lineNodes(a, b) {
  const out = [];
  if (a[0] === b[0]) {
    let j = a[1];
    const dir = b[1] > j ? 1 : -1;
    for (let guard = 0; guard < 40; guard++) {
      out.push([a[0], j]);
      if (j === b[1]) break;
      j = dir > 0 ? nextRow(j) : prevRow(j);
    }
  } else {
    let i = a[0];
    const dir = b[0] > i ? 1 : -1;
    for (let guard = 0; guard < 40; guard++) {
      out.push([i, a[1]]);
      if (i === b[0]) break;
      i += dir;
    }
  }
  return out;
}

function expandPath(vertices, closed) {
  const nodes = [];
  const n = vertices.length;
  const last = closed ? n : n - 1;
  for (let v = 0; v < last; v++) {
    const seg = lineNodes(vertices[v], vertices[(v + 1) % n]);
    for (let k = 0; k < seg.length - 1; k++) nodes.push(seg[k]);
    if (!closed && v === last - 1) nodes.push(seg[seg.length - 1]);
  }
  return nodes;
}

function sidOf(a, b) {
  if (a[0] === b[0]) {
    const lo = b[1] === nextRow(a[1]) ? a[1] : b[1];
    return segV(a[0], lo);
  }
  const lo = Math.min(a[0], b[0]);
  return segH(a[1], lo);
}

/** Yol geçerli mi: her kenar tünel/çevre diski dışında, kafes sınırları içinde ve kanal/satır-7 geçmiyor. */
function pathSids(nodes, closed, allowBridge) {
  const sids = [];
  const n = nodes.length;
  const m = closed ? n : n - 1;
  for (let k = 0; k < m; k++) {
    const a = nodes[k];
    const b = nodes[(k + 1) % n];
    if (!hasRow(a[1]) || !hasRow(b[1]) || Math.abs(a[0]) > GRID_N || Math.abs(b[0]) > GRID_N) return null;
    if (Math.abs(a[1]) > GRID_N || Math.abs(b[1]) > GRID_N) return null;
    const stepOk = (a[0] === b[0] && (b[1] === nextRow(a[1]) || a[1] === nextRow(b[1]))) || (a[1] === b[1] && Math.abs(a[0] - b[0]) === 1);
    if (!stepOk) return null;
    const sid = sidOf(a, b);
    const g = SEGMENTS[sid];
    if (!g) return null;
    if (segTunnelOf(g) || segMinR(g) < PLAZA.padR) return null;
    if (!allowBridge && g.axis === 'v' && g.k === 6) return null;
    sids.push(sid);
  }
  return sids;
}

const clampI = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function rectVerts(i0, j0, i1, j1) {
  return [[i0, j0], [i1, j0], [i1, j1], [i0, j1]];
}
function lVerts(i0, j0, w, h, nw, nh) {
  return [[i0, j0], [i0 + w, j0], [i0 + w, j0 + nh], [i0 + w - nw, j0 + nh], [i0 + w - nw, j0 + h], [i0, j0 + h]];
}

function siteLattice(districts, key) {
  const s = districts.sites[DISTRICT_KEYS.indexOf(key)];
  return [Math.round(s.x / GRID), Math.round(s.z / GRID)];
}

export function raceTemplates(seed, districts) {
  const paths = [];
  const protect = new Set();
  const add = (id, kind, laps, closed, candidates, fallback) => {
    let chosen = null;
    const all = candidates.concat(fallback ? [fallback] : []);
    for (let c = 0; c < all.length && !chosen; c++) {
      const verts = all[c];
      const nodes = expandPath(verts, closed);
      const sids = pathSids(nodes, closed, false);
      if (sids) chosen = { vertices: verts, nodes, sids };
    }
    if (!chosen) throw new Error('Yarış rotası bulunamadı: ' + RACE_KEYS[id]);
    paths.push({
      id, key: RACE_KEYS[id], kind, laps, closed, vertices: chosen.vertices, nodes: chosen.nodes, sids: chosen.sids,
    });
    chosen.sids.forEach((s) => protect.add(s));
  };
  const pick = (id, n) => sh(seed, id, TAG.RACE_VAR) % n;
  const off = (id, tag) => (sh(seed, id, TAG.RACE_OFF + tag) % 3) - 1;

  // 0 Çevreyolu (i=±6, j=±6) — arter halkası
  add(0, 'circuit', 1, true, [rectVerts(-6, -6, 6, 6)], null);

  // 1 Merkez halkası
  const mv = [[2, 2], [2, 3], [3, 2]][pick(1, 3)];
  add(1, 'circuit', 2, true, [rectVerts(-mv[0], -mv[1], mv[0], mv[1])], rectVerts(-2, -2, 2, 2));

  // 2 Pazar zigzag: L biçimi, çapa çevresinde
  const [pi, pj] = siteLattice(districts, 'gece_pazari');
  const pc = [];
  for (let a = 0; a < 9; a++) {
    const oi = off(2, a * 2) + (a % 3 === 0 ? 0 : 0);
    const oj = off(2, a * 2 + 1);
    pc.push(lVerts(clampI(pi - 2 + oi, -8, 4), clampI(pj - 2 + oj, -8, 2), 4, 4, 2, 2));
  }
  add(2, 'circuit', 2, true, pc, rectVerts(clampI(pi - 1, -8, 5), clampI(pj - 1, -8, 3), clampI(pi - 1, -8, 5) + 3, clampI(pj - 1, -8, 3) + 3));

  // 3 Konteyner kupası
  const [ki, kj] = siteLattice(districts, 'konteyner');
  const kc = [];
  const ksz = [[4, 3], [3, 4], [4, 4]][pick(3, 3)];
  for (let a = 0; a < 9; a++) {
    const oi = off(3, a * 2);
    const oj = off(3, a * 2 + 1);
    const i0 = clampI(ki - 2 + oi, -8, 8 - ksz[0]);
    const j0 = clampI(kj - 1 + oj, -8, 5 - ksz[1]);
    kc.push(rectVerts(i0, j0, i0 + ksz[0], j0 + ksz[1]));
  }
  add(3, 'circuit', 2, true, kc, rectVerts(3, -6, 6, -3));

  // 4 Liman turu: satır 8–9 dikdörtgeni (kanalın güneyi)
  const [li] = siteLattice(districts, 'liman');
  const lw = [5, 6, 7][pick(4, 3)];
  const lc = [];
  for (let a = 0; a < 3; a++) {
    const i0 = clampI(li - Math.floor(lw / 2) + a - 1, -9, 9 - lw);
    lc.push(rectVerts(i0, 8, i0 + lw, 9));
  }
  add(4, 'circuit', 2, true, lc, rectVerts(-3, 8, 3, 9));

  // 5 Teknopark halkası
  const [ti, tj] = siteLattice(districts, 'teknoloji');
  const tc = [];
  const tsz = [[3, 3], [4, 3], [3, 4]][pick(5, 3)];
  for (let a = 0; a < 9; a++) {
    const oi = off(5, a * 2);
    const oj = off(5, a * 2 + 1);
    const i0 = clampI(ti - 1 + oi, -9, 9 - tsz[0]);
    const j0 = clampI(tj - 1 + oj, -8, 5 - tsz[1]);
    tc.push(rectVerts(i0, j0, i0 + tsz[0], j0 + tsz[1]));
  }
  add(5, 'circuit', 2, true, tc, rectVerts(-8, -3, -5, 0));

  // 6 Kanal sprinti: j=8 yolu boyunca (kanalın güney kıyısı), açık
  add(6, 'sprint', 1, false, [[[-7, 8], [7, 8]]], [[-6, 8], [6, 8]]);

  // 7 Tepe sprinti: Tepe çapasından L biçimli açık yol (12 segment)
  const [hi, hj] = siteLattice(districts, 'tepe');
  const hc = [];
  for (let a = 0; a < 9; a++) {
    const oi = off(7, a * 2);
    const oj = off(7, a * 2 + 1);
    const i0 = clampI(hi - 3 + oi, -9, 3);
    const j0 = clampI(hj - 3 + oj, -9, -1);
    hc.push([[i0, j0], [i0 + 6, j0], [i0 + 6, j0 + 6]]);
  }
  add(7, 'sprint', 1, false, hc, [[-9, -9], [-3, -9], [-3, -3]]);
  return { paths, protect };
}

/* ------------------------------------------------------------------------------------------------
 * Kapılar
 * ---------------------------------------------------------------------------------------------- */
export function buildRaces(plan) {
  const out = [];
  const T = plan.raceTemplates.paths;
  for (let r = 0; r < T.length; r++) {
    const p = T[r];
    // polyline
    const pts = [];
    const nn = p.nodes.length;
    const tot = p.closed ? nn : nn;
    for (let k = 0; k < tot; k++) {
      const nd = p.nodes[k];
      pts.push([nd[0] * GRID, nodeY(nd[0], nd[1]), nd[1] * GRID]);
    }
    if (p.closed) pts.push(pts[0]);
    let length = 0;
    const cum = [0];
    for (let k = 1; k < pts.length; k++) {
      const dx = pts[k][0] - pts[k - 1][0];
      const dz = pts[k][2] - pts[k - 1][2];
      length += Math.sqrt(dx * dx + dz * dz);
      cum.push(length);
    }
    const ngate = clamp(Math.round(length / 150), 6, 14);
    const gates = [];
    const spacing = p.closed ? length / ngate : length / (ngate - 1);
    for (let g = 0; g < ngate; g++) {
      const s = Math.min(length - 1e-6, g * spacing);
      let k = 1;
      while (k < cum.length - 1 && cum[k] < s) k++;
      const seg = cum[k] - cum[k - 1];
      const t = seg > 0 ? (s - cum[k - 1]) / seg : 0;
      const ax = pts[k - 1][0];
      const az = pts[k - 1][2];
      const bx = pts[k][0];
      const bz = pts[k][2];
      const l = seg > 0 ? seg : 1;
      gates.push({
        index: g, x: ax + (bx - ax) * t, y: pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t, z: az + (bz - az) * t, r: GATE_R,
        dx: (bx - ax) / l, dz: (bz - az) / l, s,
      });
    }
    const g0 = gates[0];
    const dk = plan.districts.districtAt(g0.x, g0.z);
    out.push({
      id: p.id, key: p.key, kind: p.kind, laps: p.laps, closed: p.closed, nodes: p.nodes.map((q) => nodeId(q[0], q[1])), sids: p.sids.slice(),
      length, district: dk, gates, start: { x: g0.x, y: g0.y, z: g0.z, yaw: Math.atan2(-g0.dx, -g0.dz) },
    });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Çatı parkuru
 * ---------------------------------------------------------------------------------------------- */
function rectGap(a, b) {
  const gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const gz = Math.max(0, Math.max(a.z0, b.z0) - Math.min(a.z1, b.z1));
  return { gx, gz };
}

export function buildRoofRoutes(plan) {
  const routes = [];
  const rb = plan.roads.blocks.routeBlocks;
  for (let r = 0; r < rb.length; r++) {
    const lay = layoutBlock(plan, rb[r].bi, rb[r].bj);
    const lots = lay.lots.filter((l) => l.roof && l.roof.route === rb[r].route).sort((a, b) => a.roof.order - b.roof.order);
    const pads = [];
    for (let q = 0; q < lots.length; q++) {
      const l = lots[q];
      const fp = footprintOf(l);
      const y = 64 + 4 * l.floors + l.roof.lift;
      const pad = {
        lot: l.id, x: (fp.x0 + fp.x1) / 2, y, z: (fp.z0 + fp.z1) / 2, w: fp.x1 - fp.x0, d: fp.z1 - fp.z0, x0: fp.x0, z0: fp.z0, x1: fp.x1, z1: fp.z1,
      };
      pads.push(pad);
    }
    // 6–10 kontrol: fazlaysa ilk 10; azsa büyük çatılarda ikinci kontrol noktası
    const sel = pads.slice(0, 10);
    for (let q = 0; sel.length < 6 && q < sel.length; q++) {
      const p = sel[q];
      if (p.w >= 18 || p.d >= 18) {
        const alongX = p.w >= p.d;
        const a = Object.assign({}, p, alongX ? { x: p.x0 + p.w * 0.25 } : { z: p.z0 + p.d * 0.25 });
        const b = Object.assign({}, p, alongX ? { x: p.x0 + p.w * 0.75 } : { z: p.z0 + p.d * 0.75 });
        sel.splice(q, 1, a, b);
        q++;
      }
    }
    const jumps = [];
    let maxGap = 0;
    for (let q = 1; q < sel.length; q++) {
      const A = sel[q - 1];
      const B = sel[q];
      const g = rectGap(A, B);
      const gap = Math.max(g.gx, g.gz);
      jumps.push({ a: q - 1, b: q, gap, dy: B.y - A.y });
      maxGap = Math.max(maxGap, gap);
    }
    const first = lots[0];
    const door = first ? first.door : null;
    const last = sel[sel.length - 1];
    routes.push({
      id: rb[r].route, district: rb[r].district, bi: rb[r].bi, bj: rb[r].bj, floors: lots.length ? lots[0].floors : 0, pads: sel,
      start: door
        ? { x: door.front.x + 0.5, y: 64, z: door.front.z + 0.5, lot: first.id, stair: true }
        : { x: sel[0].x, y: 64, z: sel[0].z, lot: first ? first.id : -1, stair: false },
      end: { x: last.x, y: last.y, z: last.z, lot: last.lot },
      jumps, maxGap,
    });
  }
  return routes;
}
