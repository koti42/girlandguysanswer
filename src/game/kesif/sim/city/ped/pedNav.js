/*
 * KEŞİF sim/city/ped — YAYA GEZİNTİ AĞI (Neon Meridyen Faz 4, paket crowd_ai). SAF, belirlenimci, önbellekli, worker-güvenli, es2020.
 * roadNet.walkNet(seed) grafını (köşe düğümleri, zebra geçitleri, meydan kenarları, kaldırım kenarları) yayaya uygun yapı dizilerine çevirir:
 * tür/genişlik/yön, geçit kayıtları, mekân noktaları (barınak, satıcı kuyruğu, kafe, kulüp, fotoğraf, metro girişi), uzamsal kovalar, rota bulucu.
 *
 *   pedNav(seed) → nav
 *     nav.n, nav.ne, nav.nx/nz (Float32Array), nav.ndist (Uint8Array bölge idx), nav.districtKeys
 *     nav.ea/eb (Int32Array), nav.elen, nav.ehw (yarı kullanılabilir yanal genişlik), nav.eux/euz (a→b birim), nav.ekind (EK.*), nav.ejun (kavşak düğüm kimliği | −1),
 *     nav.earm (geçit kolu 0 K 1 D 2 G 3 B | −1), nav.ecross (geçit kimliği | −1), nav.eok (0 = yaya kullanmaz: merdiven/rıhtım/tepe)
 *     nav.adjStart, nav.adjEdge (CSR)            nav.crossings[{id, edge, jun, arm, x, z, ux, uz, len, roadA, roadB, hw}]    roadA..roadB = asfalt aralığı (kenar boyunca s)
 *     nav.spots[{id, kind, x, z, yaw, edge, s, lat, cap, district, lot}]    SPOT.*
 *     nav.edgesNear(x, z, r, out) → n          out: Int32Array; kovalardan yarıçap içindeki kenarlar (kenar orta noktası ≤ r + uzunluk/2)
 *     nav.nearestEdge(x, z, maxD) → edge | −1  nav.project(edge, x, z, out) → {s, lat, d}
 *     nav.posOn(edge, dir, s, lat, out) → {x, z}      nav.nodeAt(edge, dir) → bitiş düğümü
 *     nav.route(from, to, out, blocked?) → n kenar (out: Int32Array), −1 yok   (düğüm → düğüm en kısa; geçitler +6 ceza; blocked: Uint8Array kenar)
 *     nav.districtOfNode(i) → bölge anahtarı
 * Dönüş değerleri paylaşılan nesnelerdir. Yön dir=+1: a→b; sağ el = (−uz, ux)·dir.
 */
import { walkNet } from '../roadNet.js';
import { getCityPlan, pois } from '../cityPlan.js';
import { DISTRICT_KEYS } from '../archetypes.js';
import { BK, GRID, hasRow, nodeId, segH, segV } from '../cityRoads.js';
import { Lru } from '../cityPlanKit.js';

export const EK = Object.freeze({ SIDE: 0, CROSS: 1, PLAZA: 2 });
export const SPOT = Object.freeze({
  SHELTER: 0, VENDOR: 1, CAFE: 2, CLUB: 3, PHOTO: 4, METRO: 5, DOOR: 6,
});
export const SPOT_NAMES = Object.freeze(['shelter', 'vendor', 'cafe', 'club', 'photo', 'metro', 'door']);

const BUCKET = 40;
const CROSS_PENALTY = 6;
const CAFE_INTERIORS = Object.freeze({ ramen_bari: 1, kitap_kafe: 1 });

function bkey(bx, bz) {
  return ((bx + 512) << 10) | (bz + 512);
}

function armOf(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

export function buildPedNav(seed) {
  const plan = getCityPlan(seed);
  const wn = walkNet(seed);
  const lat = plazaLattice(plan, wn);
  const nodesAll = wn.nodes.concat(lat.nodes);
  const edgesAll = wn.edges.concat(lat.edges);
  const n = nodesAll.length;
  const ne = edgesAll.length;
  const nx = new Float32Array(n);
  const nz = new Float32Array(n);
  const ndist = new Uint8Array(n);
  const nokay = new Uint8Array(n);
  const dIdx = {};
  for (let i = 0; i < DISTRICT_KEYS.length; i++) dIdx[DISTRICT_KEYS[i]] = i;
  for (let i = 0; i < n; i++) {
    const nd = nodesAll[i];
    nx[i] = nd.x;
    nz[i] = nd.z;
    ndist[i] = dIdx[plan.districts.districtAt(nd.x, nd.z)] | 0;
    nokay[i] = nd.tag === 'hill' || nd.tag === 'hilltop' ? 0 : 1;
  }
  const ea = new Int32Array(ne);
  const eb = new Int32Array(ne);
  const elen = new Float32Array(ne);
  const ehw = new Float32Array(ne);
  const eux = new Float32Array(ne);
  const euz = new Float32Array(ne);
  const ekind = new Uint8Array(ne);
  const ejun = new Int32Array(ne).fill(-1);
  const earm = new Int8Array(ne).fill(-1);
  const ecross = new Int32Array(ne).fill(-1);
  const eok = new Uint8Array(ne);
  const crossings = [];
  const centerJ = nodeId(0, 0);
  for (let e = 0; e < ne; e++) {
    const E = edgesAll[e];
    ea[e] = E.a;
    eb[e] = E.b;
    const dx = nx[E.b] - nx[E.a];
    const dz = nz[E.b] - nz[E.a];
    const len = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    elen[e] = len;
    eux[e] = dx / len;
    euz[e] = dz / len;
    eok[e] = E.tag === 'stair' || E.tag === 'quay' || !nokay[E.a] || !nokay[E.b] ? 0 : 1;
    ejun[e] = E.junction === undefined ? -1 : E.junction;
    const mx = (nx[E.a] + nx[E.b]) / 2;
    const mz = (nz[E.a] + nz[E.b]) / 2;
    if (E.tag === 'crossing' && E.junction !== centerJ) {
      ekind[e] = EK.CROSS;
      const i = Math.round(mx / GRID);
      const j = Math.round(mz / GRID);
      const arm = armOf(mx - i * GRID, mz - j * GRID);
      earm[e] = arm;
      const road = len > 13 ? 7 : 4; // artery asfalt yarı genişliği 7, sokak 4
      const cs0 = (len - 2 * road) / 2;
      ehw[e] = len > 13 ? 1.1 : 0.8;
      ecross[e] = crossings.length;
      crossings.push({
        id: crossings.length, edge: e, jun: E.junction, arm, x: mx, z: mz, ux: eux[e], uz: euz[e], len, roadA: cs0, roadB: len - cs0, hw: ehw[e],
      });
    } else if (E.tag === 'crossing' || E.tag === 'plaza') {
      ekind[e] = EK.PLAZA;
      ehw[e] = len > 70 ? 8 : len > 22 ? 5 : 2.6;
    } else {
      ekind[e] = EK.SIDE;
      const vertical = Math.abs(euz[e]) > Math.abs(eux[e]);
      const off = vertical ? Math.abs(mx - GRID * Math.round(mx / GRID)) : Math.abs(mz - GRID * Math.round(mz / GRID));
      ehw[e] = off > 7 ? 1.2 : 0.72;
    }
  }
  // CSR komşuluk
  const deg = new Int32Array(n + 1);
  for (let e = 0; e < ne; e++) {
    if (!eok[e]) continue;
    deg[ea[e] + 1]++;
    deg[eb[e] + 1]++;
  }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const adjStart = deg;
  const adjEdge = new Int32Array(adjStart[n]);
  const fill = new Int32Array(n);
  for (let e = 0; e < ne; e++) {
    if (!eok[e]) continue;
    adjEdge[adjStart[ea[e]] + fill[ea[e]]++] = e;
    adjEdge[adjStart[eb[e]] + fill[eb[e]]++] = e;
  }
  // kovalar
  const bucketMap = new Map();
  for (let e = 0; e < ne; e++) {
    if (!eok[e]) continue;
    const steps = Math.max(1, Math.ceil(elen[e] / (BUCKET / 4)));
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const x = nx[ea[e]] + (nx[eb[e]] - nx[ea[e]]) * u;
      const z = nz[ea[e]] + (nz[eb[e]] - nz[ea[e]]) * u;
      const key = bkey(Math.floor(x / BUCKET), Math.floor(z / BUCKET));
      let l = bucketMap.get(key);
      if (!l) {
        l = [];
        bucketMap.set(key, l);
      }
      if (l[l.length - 1] !== e) l.push(e);
    }
  }
  const stamp = new Int32Array(ne);
  let stampN = 0;
  const _pr = { s: 0, lat: 0, d: 0 };
  const _pos = { x: 0, z: 0 };

  const nav = {
    seed, plan, n, ne, nx, nz, ndist, districtKeys: DISTRICT_KEYS, ea, eb, elen, ehw, eux, euz, ekind, ejun, earm, ecross, eok, adjStart, adjEdge, crossings,
    spots: [], nComp: 0,
    districtOfNode(i) {
      return DISTRICT_KEYS[ndist[i]];
    },
    edgesNear(x, z, r, out) {
      const b0x = Math.floor((x - r - 12) / BUCKET);
      const b1x = Math.floor((x + r + 12) / BUCKET);
      const b0z = Math.floor((z - r - 12) / BUCKET);
      const b1z = Math.floor((z + r + 12) / BUCKET);
      stampN++;
      let c = 0;
      for (let bx = b0x; bx <= b1x; bx++) {
        for (let bz = b0z; bz <= b1z; bz++) {
          const l = bucketMap.get(bkey(bx, bz));
          if (!l) continue;
          for (let i = 0; i < l.length; i++) {
            const e = l[i];
            if (stamp[e] === stampN) continue;
            stamp[e] = stampN;
            const mx = (nx[ea[e]] + nx[eb[e]]) / 2 - x;
            const mz = (nz[ea[e]] + nz[eb[e]]) / 2 - z;
            const rr = r + elen[e] / 2;
            if (mx * mx + mz * mz <= rr * rr && c < out.length) out[c++] = e;
          }
        }
      }
      return c;
    },
    project(e, x, z, out) {
      const o = out || _pr;
      const ax = nx[ea[e]];
      const az = nz[ea[e]];
      const dx = x - ax;
      const dz = z - az;
      let s = dx * eux[e] + dz * euz[e];
      if (s < 0) s = 0;
      else if (s > elen[e]) s = elen[e];
      const px = ax + eux[e] * s;
      const pz = az + euz[e] * s;
      const lx = x - px;
      const lz = z - pz;
      o.s = s;
      o.lat = lx * -euz[e] + lz * eux[e];
      o.d = Math.sqrt(lx * lx + lz * lz);
      return o;
    },
    nearestEdge(x, z, maxD, kinds) {
      // genişleyen yarıçap: ilk bulunan halkada en yakını (arabellek taşmasın)
      const tmp = _nearBuf;
      for (let r = 14; ; r *= 2.4) {
        const rr = r > maxD ? maxD : r;
        let best = -1;
        let bd = rr * rr;
        const c = nav.edgesNear(x, z, rr, tmp);
        for (let i = 0; i < c; i++) {
          const e = tmp[i];
          if (kinds !== undefined && ((kinds >> ekind[e]) & 1) === 0) continue;
          const p = nav.project(e, x, z, _pr);
          const d2 = p.d * p.d;
          if (d2 < bd) {
            bd = d2;
            best = e;
          }
        }
        if (best >= 0 || rr >= maxD) return best;
      }
    },
    posOn(e, dir, s, lat, out) {
      const o = out || _pos;
      const sa = dir > 0 ? s : elen[e] - s;
      const ax = nx[ea[e]] + eux[e] * sa;
      const az = nz[ea[e]] + euz[e] * sa;
      // lat: seyir yönüne göre sağ (+): sağ vektör = (−uz, ux)·dir
      o.x = ax + -euz[e] * lat * dir;
      o.z = az + eux[e] * lat * dir;
      return o;
    },
    nodeAt(e, dir) {
      return dir > 0 ? eb[e] : ea[e];
    },
    route(from, to, out, blocked) {
      return dijkstra(nav, from, to, out, blocked);
    },
  };
  const _nearBuf = new Int32Array(1024);
  nav.nComp = components(nav);
  buildSpots(nav, plan, seed);
  nav.ehot = hotspots(nav);
  return nav;
}

/**
 * Meydan örgüsü: komşu iki açık blok (park/meydan/merkez) arasındaki yol kesikse (meydan koridoru) blok merkezlerini birbirine bağlar → büyük meydanlar köşegen yıldızı yerine
 * ızgara şeritleriyle de gezilir (kalabalık meydanın her yerine dağılır). Kenar: {a, b, tag:'plaza', len, junction:-1}.
 */
function plazaLattice(plan, wn) {
  const out = [];
  const nodes = [];
  const base = wn.nodes.length;
  const R = plan.roads;
  const centers = wn.blockCenters;
  const add = (a, b) => {
    if (a === undefined || b === undefined) return;
    const na = a >= base ? nodes[a - base] : wn.nodes[a];
    const nb = b >= base ? nodes[b - base] : wn.nodes[b];
    const dx = na.x - nb.x;
    const dz = na.z - nb.z;
    out.push({ id: -1, a, b, tag: 'plaza', len: Math.sqrt(dx * dx + dz * dz), junction: -1 });
  };
  for (let bj = -9; bj <= 8; bj++) {
    for (let bi = -9; bi <= 8; bi++) {
      const c0 = centers.get(bi + ',' + bj);
      if (c0 === undefined) continue;
      const kind = R.blocks.kindAt(bi, bj);
      if (kind === BK.CENTRAL || kind === BK.DPLAZA || kind === BK.PLAZA) {
        // büyük meydan: merkez çevresinde 4 çeyrek düğümü + halka
        const ctr = wn.nodes[c0];
        const q = [];
        for (let k = 0; k < 4; k++) {
          const id = base + nodes.length;
          nodes.push({ id, x: ctr.x + (k & 1 ? 22 : -22), y: 64, z: ctr.z + (k & 2 ? 22 : -22), tag: 'plaza' });
          q.push(id);
        }
        add(q[0], q[1]); add(q[1], q[3]); add(q[3], q[2]); add(q[2], q[0]);
        for (let k = 0; k < 4; k++) add(c0, q[k]);
      }
      if (bi + 1 <= 8 && centers.get(bi + 1 + ',' + bj) !== undefined && hasRow(bj) && R.cut[segV(bi + 1, bj)]) add(c0, centers.get(bi + 1 + ',' + bj));
      if (bj + 1 <= 8 && bj + 1 !== 7 && centers.get(bi + ',' + (bj + 1)) !== undefined && hasRow(bj + 1) && R.cut[segH(bj + 1, bi)]) add(c0, centers.get(bi + ',' + (bj + 1)));
    }
  }
  return { nodes, edges: out };
}

/* ------------------------------------------------------------------------------------------------
 * Bağlı bileşenler (yalnız yaya kenarları)
 * ---------------------------------------------------------------------------------------------- */
function components(nav) {
  const seen = new Uint8Array(nav.n);
  let comps = 0;
  const st = [];
  for (let s = 0; s < nav.n; s++) {
    if (seen[s] || nav.adjStart[s + 1] === nav.adjStart[s]) continue;
    comps++;
    seen[s] = 1;
    st.push(s);
    while (st.length) {
      const u = st.pop();
      for (let k = nav.adjStart[u]; k < nav.adjStart[u + 1]; k++) {
        const e = nav.adjEdge[k];
        const v = nav.ea[e] === u ? nav.eb[e] : nav.ea[e];
        if (!seen[v]) {
          seen[v] = 1;
          st.push(v);
        }
      }
    }
  }
  return comps;
}

/* ------------------------------------------------------------------------------------------------
 * Rota (Dijkstra, ikili yığın; düğüm başına tek)
 * ---------------------------------------------------------------------------------------------- */
let _dist = null;
let _prevE = null;
let _heapK = null;
let _heapV = null;
let _seenAt = null;
let _runId = 0;

function dijkstra(nav, from, to, out, blocked) {
  const n = nav.n;
  if (from < 0 || to < 0 || from >= n || to >= n) return -1;
  if (from === to) return 0;
  if (!_dist || _dist.length < n) {
    _dist = new Float32Array(n);
    _prevE = new Int32Array(n);
    _seenAt = new Int32Array(n);
    _heapK = new Float32Array(n * 6 + 8);
    _heapV = new Int32Array(n * 6 + 8);
  }
  const run = ++_runId;
  let hs = 0;
  const push = (k, v) => {
    let i = hs++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (_heapK[p] <= k) break;
      _heapK[i] = _heapK[p];
      _heapV[i] = _heapV[p];
      i = p;
    }
    _heapK[i] = k;
    _heapV[i] = v;
  };
  _seenAt[from] = run;
  _dist[from] = 0;
  _prevE[from] = -1;
  push(0, from);
  let found = false;
  while (hs > 0) {
    const u = _heapV[0];
    const ku = _heapK[0];
    hs--;
    if (hs > 0) {
      const lk = _heapK[hs];
      const lv = _heapV[hs];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= hs) break;
        if (c + 1 < hs && _heapK[c + 1] < _heapK[c]) c++;
        if (_heapK[c] >= lk) break;
        _heapK[i] = _heapK[c];
        _heapV[i] = _heapV[c];
        i = c;
      }
      _heapK[i] = lk;
      _heapV[i] = lv;
    }
    if (ku > _dist[u]) continue;
    if (u === to) {
      found = true;
      break;
    }
    for (let k = nav.adjStart[u]; k < nav.adjStart[u + 1]; k++) {
      const e = nav.adjEdge[k];
      if (blocked && blocked[e]) continue;
      const v = nav.ea[e] === u ? nav.eb[e] : nav.ea[e];
      const w = ku + nav.elen[e] + (nav.ekind[e] === EK.CROSS ? CROSS_PENALTY : 0);
      if (_seenAt[v] !== run || w < _dist[v]) {
        _seenAt[v] = run;
        _dist[v] = w;
        _prevE[v] = e;
        if (hs < _heapK.length - 1) push(w, v);
      }
    }
  }
  if (!found) return -1;
  let cnt = 0;
  let v = to;
  while (v !== from) {
    const e = _prevE[v];
    if (cnt >= out.length) return -1;
    out[cnt++] = e;
    v = nav.ea[e] === v ? nav.eb[e] : nav.ea[e];
  }
  for (let i = 0, j = cnt - 1; i < j; i++, j--) {
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return cnt;
}

/* ------------------------------------------------------------------------------------------------
 * Mekân noktaları (POI → en yakın yaya kenarı)
 * ---------------------------------------------------------------------------------------------- */
function buildSpots(nav, plan, seed) {
  const list = pois(seed);
  const interiorOf = new Map();
  plan.owners.forEach((v) => interiorOf.set(v.lotId, v.interior));
  const kinds = (1 << EK.SIDE) | (1 << EK.PLAZA);
  const spots = nav.spots;
  const add = (kind, p, cap, extra) => {
    const e = nav.nearestEdge(p.x, p.z, 9, kinds);
    if (e < 0) return;
    const pr = nav.project(e, p.x, p.z, {});
    if (Math.abs(pr.lat) > nav.ehw[e] + 5.5) return;
    spots.push(Object.assign({
      id: spots.length, kind, x: p.x, z: p.z, yaw: p.yaw || 0, edge: e, s: pr.s, lat: pr.lat, cap, district: nav.districtOfNode(nav.ea[e]), lot: p.lot === undefined ? -1 : p.lot,
    }, extra || null));
  };
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.type === 'shelter') add(SPOT.SHELTER, p, 5);
    else if (p.type === 'vendor') add(SPOT.VENDOR, p, 4, { stall: !!p.stall });
    else if (p.type === 'photo_spot') add(SPOT.PHOTO, p, 3);
    else if (p.type === 'door') {
      const it = interiorOf.get(p.lot);
      if (p.archetype === 'istasyon_girisi') add(SPOT.METRO, p, 8);
      else if (p.archetype === 'kulup_binasi' || it === 'kulup') add(SPOT.CLUB, p, 6);
      else if (it && CAFE_INTERIORS[it] === 1) add(SPOT.CAFE, p, 5);
      else if (p.archetype === 'dukkan_sirasi' || p.archetype === 'ofis_blok' || it) add(SPOT.DOOR, p, 3);
    }
  }
  // metro girişleri: kiosk parseli kapısı yoksa yedek olarak yüzey çıkışı (merdiven üst noktası)
  const st = plan.underground.metro.stations;
  let metroN = 0;
  for (let i = 0; i < spots.length; i++) if (spots[i].kind === SPOT.METRO) metroN++;
  if (metroN === 0) {
    for (let s = 0; s < st.length; s++) {
      for (let q = 0; q < st[s].entrances.length; q++) {
        const t = st[s].entrances[q].top;
        add(SPOT.METRO, { x: t.x + 0.5, z: t.z + 0.5, yaw: 0 }, 8);
      }
    }
  }
}

const HOT_W = [0.3, 1.0, 0.8, 1.5, 0.5, 1.2, 0.25];

/** Kenar başına ilgi puanı (0..1,5): yakındaki mekânlar (satıcı/kulüp/kafe/metro…) → doğma ağırlığı, kalabalık odakları. */
function hotspots(nav) {
  const hot = new Float32Array(nav.ne);
  const buf = new Int32Array(256);
  for (let i = 0; i < nav.spots.length; i++) {
    const s = nav.spots[i];
    const n = nav.edgesNear(s.x, s.z, 34, buf);
    for (let k = 0; k < n; k++) {
      const e = buf[k];
      const mx = (nav.nx[nav.ea[e]] + nav.nx[nav.eb[e]]) / 2 - s.x;
      const mz = (nav.nz[nav.ea[e]] + nav.nz[nav.eb[e]]) / 2 - s.z;
      const d = Math.sqrt(mx * mx + mz * mz);
      if (d < 36) hot[e] += HOT_W[s.kind] * (1 - d / 36);
    }
  }
  for (let e = 0; e < nav.ne; e++) if (hot[e] > 1.5) hot[e] = 1.5;
  return hot;
}

const NAV_CACHE = new Lru(4);

export function pedNav(seed) {
  const key = seed >>> 0;
  let v = NAV_CACHE.get(key);
  if (!v) v = NAV_CACHE.set(key, buildPedNav(seed));
  return v;
}

export function clearPedNavCache() {
  NAV_CACHE.clear();
}
