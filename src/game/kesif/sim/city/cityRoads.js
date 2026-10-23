/*
 * KEŞİF sim/city — YOL ÇİZGELERİ ve YÜZEY HARİTASI (saf, belirlenimci, worker-güvenli). Sözleşme §7 "Yapı".
 *
 * Izgara: dikey yollar x=i·80 (i∈[-9,9]), yatay yollar z=j·80 (j∈[-9,9], j=7 YOK: kanal). Arter (i%3==0 / j%3==0) genişlik 20
 * (asfalt 14 + kaldırım 3×2), ara sokak 12 (asfalt 8 + kaldırım 2×2). Yol, çizgi koordinatından [c−hw, c+hw) blok hücrelerini kaplar.
 * Çevreyolu i=±6/j=±6. Kara |x|,|z|<730; ötesi kıyı bandı (doğu/güney deniz, kuzey/batı uçurum — cityemit).
 *
 * KANAL: eksen z = CANAL.z0 + 30·sin(x/130) (**z0=560**, sözleşmedeki "≈480" Çevreyolu'nun j=+6 ayağıyla (z=480) çakıştığı için Çevreyolu
 * ile j=8 yolu (z=640) arasının ortasına alındı), genişlik 40 (su y44..58; tabliye y64), iki yanda 6 blok rıhtım (quay). j=7 yatay yolu
 * kanalın yerini alır; dikey yollar kanalı KÖPRÜYLE geçer (V_i segment (6→8)).
 * MERKEZ MEYDANI: r=90 disk; x=0 / z=0 arterleri r≤90'da tünel (y64→56, 48 blokta; r≤60 kapalı, 60<r≤90 açık hendek, r≤42 düz).
 *
 * Bu modül yalnız GEOMETRİ ve BLOK TÜRLERİ üretir: yol grafı roadNet.js, parsel cityLots.js. Dışa açık:
 *   GRID, LAND, GROUND_Y, isArterial/halfWidth/asphaltHalf/hasRow/hasCol/nextRow/prevRow/rowIdx, nodeId, segV/segH, CANAL, PLAZA
 *   canalCenterZ(x) · canalAt(x,z) · bridgeSpan(i) · tunnelRoadY(r) · tunnelZone(r)
 *   BK (blok türleri) · assignBlocks(seed, districts) · buildRoadLayout(seed, blocks, protect) → roads
 *   surfaceAt(roads, x, z) → SURF.* (sokak seviyesi y64 yüzeyi; kapalı tünel üstü = PLAZA)   bridgeAt(roads,x,z)   tunnelAt(roads,x,z) → 0|1|2|3   roadYAt(roads,x,z)
 *   segmentPts(roads, sid) → Float32Array(xyz…)   armsOf(roads,i,j) → bitmask N1 E2 S4 W8
 */
import { DISTRICTS } from './archetypes.js';
import { TAG, blockKey, imod, sh, shf } from './cityPlanKit.js';

export const GRID = 80;
export const GRID_N = 9;
export const LAND = 730;
export const WORLD_HALF = 800;
export const GROUND_Y = 64;
export const ROWS = Object.freeze([-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8, 9]);

export function isArterial(k) {
  return imod(k, 3) === 0;
}
export function halfWidth(k) {
  return imod(k, 3) === 0 ? 10 : 6;
}
export function asphaltHalf(k) {
  return imod(k, 3) === 0 ? 7 : 4;
}
export function hasCol(i) {
  return i >= -GRID_N && i <= GRID_N;
}
export function hasRow(j) {
  return j >= -GRID_N && j <= GRID_N && j !== 7;
}
export function nextRow(j) {
  return j === 6 ? 8 : j + 1;
}
export function prevRow(j) {
  return j === 8 ? 6 : j - 1;
}
export function rowIdx(j) {
  return j <= 6 ? j + 9 : j + 8;
}
export function nodeId(i, j) {
  return rowIdx(j) * 19 + (i + 9);
}
export const NODE_COUNT = 19 * 18;
export const SEG_V_COUNT = 19 * 17;
export const SEG_COUNT = SEG_V_COUNT + 18 * 18;
/** Dikey segment (x=i·80, a satırından nextRow(a)'ya). */
export function segV(i, a) {
  return (i + 9) * 17 + rowIdx(a);
}
/** Yatay segment (z=j·80, i'den i+1'e). */
export function segH(j, i) {
  return SEG_V_COUNT + rowIdx(j) * 18 + (i + 9);
}

export const CANAL = Object.freeze({
  z0: 560, amp: 30, period: 130, half: 20, quay: 6, floorY: 44, waterY: 58, deckY: 64,
});
export function canalCenterZ(x) {
  return CANAL.z0 + CANAL.amp * Math.sin(x / CANAL.period);
}
/** (x,z) hücre merkezi kanal suyu üstünde mi (köprü altı dahil). */
export function canalAt(x, z) {
  return Math.abs(z + 0.5 - canalCenterZ(x + 0.5)) < CANAL.half;
}

/** Köprü açıklığı: dikey yol i için tabliye z aralığı [z0,z1] (yol genişliği boyunca kanal suyu + 1 blok dayanak). Belirlenimci, tohumsuz. */
const BRIDGES = [];
for (let i = -GRID_N; i <= GRID_N; i++) {
  const c = i * GRID;
  const hw0 = halfWidth(i);
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = c - hw0; x < c + hw0; x++) {
    const zc = canalCenterZ(x + 0.5);
    lo = Math.min(lo, zc - CANAL.half);
    hi = Math.max(hi, zc + CANAL.half);
  }
  BRIDGES.push(Object.freeze({
    id: i + GRID_N, i, x: c, hw: hw0, z0: Math.floor(lo) - 1, z1: Math.ceil(hi) + 1, deckY: CANAL.deckY, arterial: isArterial(i),
  }));
}
export const BRIDGE_LIST = Object.freeze(BRIDGES);
export function bridgeSpan(i) {
  return BRIDGES[i + GRID_N] || null;
}

export const PLAZA = Object.freeze({
  cx: 0, cz: 0, r: 90, rCover: 60, rFlat: 42, yBot: 56, ceilY: 62, gateHalf: 17, padR: 96,
});
/** Tünel yol yüzeyi (ayak seviyesi) — merkeze uzaklık r. */
export function tunnelRoadY(r) {
  if (r >= PLAZA.r) return GROUND_Y;
  if (r <= PLAZA.rFlat) return PLAZA.yBot;
  return PLAZA.yBot + ((GROUND_Y - PLAZA.yBot) * (r - PLAZA.rFlat)) / (PLAZA.r - PLAZA.rFlat);
}
/** 0 yok · 1 açık hendek (60<r≤90) · 2 kapalı rampa (42<r≤60) · 3 düz tünel (r≤42). */
export function tunnelZone(r) {
  if (r > PLAZA.r) return 0;
  if (r > PLAZA.rCover) return 1;
  if (r > PLAZA.rFlat) return 2;
  return 3;
}

/* ------------------------------------------------------------------------------------------------
 * Yüzey kodları → blok kimliği tablosu (cityData.CITY_BLOCK_IDS ile aynı: 223 asfalt … 228 kaldırım)
 * ---------------------------------------------------------------------------------------------- */
export const SURF = Object.freeze({
  GROUND: 0, ASPHALT: 1, LANE_X: 2, LANE_Z: 3, ZEBRA_X: 4, ZEBRA_Z: 5, SIDEWALK: 6, PLAZA: 7, WATER: 8, QUAY: 9, PARK: 10, EDGE: 11,
});
/** SURF kodu → blok kimliği (0 = zemin/özel: cityemit karar verir). */
export const SURF_BLOCK = Object.freeze([0, 223, 224, 225, 226, 227, 228, 0, 0, 0, 0, 0]);

/* Blok türleri */
export const BK = Object.freeze({
  LOTS: 0, PARK: 1, PLAZA: 2, PARKUR: 3, EDGE: 4, HILL: 5, CANAL_N: 6, CANAL_S: 7, CENTRAL: 8, DPLAZA: 9,
});
export function isOpenKind(k) {
  return k === BK.PARK || k === BK.PLAZA || k === BK.PARKUR || k === BK.CENTRAL || k === BK.DPLAZA;
}
export const BLOCK_N = 20;

const STATIONS = Object.freeze([[0, 0], [0, 4], [0, -4], [4, 0], [-4, 0]]);
/** Metro istasyonu çapraz noktaları (kafes i,j). */
export function stationLattice() {
  return STATIONS;
}

/** Bloğun (bi,bj) tam hücre dikdörtgeni [bi·80,(bi+1)·80) × [bj·80,(bj+1)·80). */
export function blockCell(bi, bj) {
  return { x0: bi * GRID, z0: bj * GRID, x1: (bi + 1) * GRID, z1: (bj + 1) * GRID };
}

/**
 * Bloğun İÇ dikdörtgeni (yolların kaldırım dış kenarları arası). Kıyı bloklarında dış sınır dünya sınırıdır (±800); kanal bloklarında
 * kanalın bulunduğu kenarda yol yoktur (bj=6: güney kenarı hücre sınırı z=560, bj=7: kuzey kenarı z=560; kanal kırpmasını cityLots yapar).
 */
export function blockRect(bi, bj) {
  const x0 = bi >= -GRID_N ? bi * GRID + halfWidth(bi) : -WORLD_HALF;
  const x1 = bi + 1 <= GRID_N ? (bi + 1) * GRID - halfWidth(bi + 1) : WORLD_HALF;
  const top = hasRow(bj);
  const bot = hasRow(bj + 1);
  const z0 = top ? bj * GRID + halfWidth(bj) : bj * GRID;
  const z1 = bot ? (bj + 1) * GRID - halfWidth(bj + 1) : (bj + 1) * GRID;
  return { x0, z0, x1, z1 };
}

/** Bloğun en yakın noktasının orijine uzaklığı. */
function blockMinDist(bi, bj) {
  const c = blockCell(bi, bj);
  const nx = c.x0 > 0 ? c.x0 : c.x1 < 0 ? c.x1 : 0;
  const nz = c.z0 > 0 ? c.z0 : c.z1 < 0 ? c.z1 : 0;
  return Math.sqrt(nx * nx + nz * nz);
}

/* ------------------------------------------------------------------------------------------------
 * Blok türü ataması
 * ---------------------------------------------------------------------------------------------- */
const ROUTE_WANT = Object.freeze([['konteyner', 3], ['gece_pazari', 3], ['tepe', 2]]);

function blockCenterDistrict(districts, bi, bj) {
  return districts.districtAt(bi * GRID + GRID / 2, bj * GRID + GRID / 2);
}

/** Bloğun 4 köşesi + merkezi aynı bölgede mi (çatı parkuru bloğu için). */
function blockPure(districts, bi, bj, key) {
  const c = blockCell(bi, bj);
  const pts = [[c.x0 + 6, c.z0 + 6], [c.x1 - 6, c.z0 + 6], [c.x0 + 6, c.z1 - 6], [c.x1 - 6, c.z1 - 6], [c.x0 + 40, c.z0 + 40]];
  for (let k = 0; k < pts.length; k++) if (districts.districtAt(pts[k][0], pts[k][1]) !== key) return false;
  return true;
}

/**
 * assignBlocks(seed, districts) → {kind: Uint8Array(400), kindAt(bi,bj), dplaza:[{district,bi,bj}] (6), hill:{bi,bj}, routeBlocks:[{route,bi,bj,district}] (8),
 *   stationBlocks:Set}. Belirlenimci; yalnız bölge haritası + hash akışları. Sıra: kıyı → merkez haç → kanal → istasyon köşeleri → bölge meydanları →
 *   tepe → çatı parkuru blokları → rastgele açık hücreler (park/meydan/parkur; Merkez %15, diğerleri %8).
 */
export function assignBlocks(seed, districts) {
  const kind = new Uint8Array(BLOCK_N * BLOCK_N);
  const taken = new Uint8Array(BLOCK_N * BLOCK_N); // 1 = özel amaçlı (rastgele açık hücre olamaz)
  const kindAt = (bi, bj) => (bi < -10 || bi > 9 || bj < -10 || bj > 9 ? BK.EDGE : kind[blockKey(bi, bj)]);
  const set = (bi, bj, k, lock) => {
    kind[blockKey(bi, bj)] = k;
    if (lock) taken[blockKey(bi, bj)] = 1;
  };
  for (let bj = -10; bj <= 9; bj++) {
    for (let bi = -10; bi <= 9; bi++) {
      if (bi === -10 || bi === 9 || bj === -10 || bj === 9) set(bi, bj, BK.EDGE, true);
      else if (blockMinDist(bi, bj) < PLAZA.padR) set(bi, bj, BK.CENTRAL, true);
      else if (bj === 6) set(bi, bj, BK.CANAL_N, true);
      else if (bj === 7) set(bi, bj, BK.CANAL_S, true);
    }
  }
  const stationBlocks = new Set();
  for (let s = 0; s < STATIONS.length; s++) {
    const i = STATIONS[s][0];
    const j = STATIONS[s][1];
    for (let a = -1; a <= 0; a++) for (let b = -1; b <= 0; b++) {
      stationBlocks.add(blockKey(i + a, j + b));
      taken[blockKey(i + a, j + b)] = 1;
    }
  }
  const free = (bi, bj) => {
    if (bi < -9 || bi > 8 || bj < -9 || bj > 8) return false;
    const key = blockKey(bi, bj);
    return kind[key] === BK.LOTS && !taken[key];
  };
  const nearestFree = (px, pz) => {
    let best = null;
    let bd = Infinity;
    for (let bj = -9; bj <= 8; bj++) {
      for (let bi = -9; bi <= 8; bi++) {
        if (!free(bi, bj)) continue;
        const dx = bi * GRID + 40 - px;
        const dz = bj * GRID + 40 - pz;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = { bi, bj };
        }
      }
    }
    return best;
  };

  const dplaza = new Array(6);
  // Merkez bölge meydanı: orijine çapraz komşu 4 bloktan biri (hash)
  const diag = [[1, 1], [-2, 1], [1, -2], [-2, -2]];
  const dp = diag[Math.floor(shf(seed, 0, TAG.MPLAZA) * 4)];
  set(dp[0], dp[1], BK.DPLAZA, true);
  dplaza[0] = { district: 'merkez', bi: dp[0], bj: dp[1] };
  const sites = districts.sites;
  for (let k = 1; k < 6; k++) {
    const p = nearestFree(sites[k].x, sites[k].z);
    set(p.bi, p.bj, BK.DPLAZA, true);
    dplaza[k] = { district: sites[k].key, bi: p.bi, bj: p.bj };
  }
  // Tepe terası: Tepe çapasına en yakın serbest blok
  const hp = nearestFree(sites[5].x, sites[5].z);
  set(hp.bi, hp.bj, BK.HILL, true);

  // çatı parkuru blokları
  const routeBlocks = [];
  for (let w = 0; w < ROUTE_WANT.length; w++) {
    const key = ROUTE_WANT[w][0];
    const need = ROUTE_WANT[w][1];
    const cand = [];
    for (let bj = -8; bj <= 8; bj++) {
      for (let bi = -8; bi <= 8; bi++) {
        if (!free(bi, bj)) continue;
        if (!blockPure(districts, bi, bj, key)) continue;
        cand.push({ bi, bj, h: sh(seed, blockKey(bi, bj), TAG.ROOF_PICK) });
      }
    }
    cand.sort((a, b) => a.h - b.h || blockKey(a.bi, a.bj) - blockKey(b.bi, b.bj));
    let got = 0;
    for (let c = 0; c < cand.length && got < need; c++) {
      const cb = cand[c];
      // aynı türden iki rota blok komşusu olmasın
      let near = false;
      for (let r = 0; r < routeBlocks.length; r++) {
        if (Math.abs(routeBlocks[r].bi - cb.bi) <= 1 && Math.abs(routeBlocks[r].bj - cb.bj) <= 1) near = true;
      }
      if (near) continue;
      taken[blockKey(cb.bi, cb.bj)] = 1;
      routeBlocks.push({ route: routeBlocks.length, bi: cb.bi, bj: cb.bj, district: key });
      got++;
    }
  }
  // kalan eksik rota (bölge çok küçük çıkarsa) → komşu bölge türlerinden doldur
  const fallbackKeys = ['konteyner', 'gece_pazari', 'tepe', 'teknoloji', 'liman', 'merkez'];
  for (let f = 0; routeBlocks.length < 8 && f < fallbackKeys.length * 4; f++) {
    const key = fallbackKeys[f % fallbackKeys.length];
    for (let bj = -8; bj <= 8 && routeBlocks.length < 8; bj++) {
      for (let bi = -8; bi <= 8 && routeBlocks.length < 8; bi++) {
        if (!free(bi, bj) || !blockPure(districts, bi, bj, key)) continue;
        taken[blockKey(bi, bj)] = 1;
        routeBlocks.push({ route: routeBlocks.length, bi, bj, district: key });
      }
    }
  }

  // rastgele açık hücreler
  for (let bj = -9; bj <= 8; bj++) {
    for (let bi = -9; bi <= 8; bi++) {
      if (!free(bi, bj)) continue;
      const key = blockKey(bi, bj);
      const dk = blockCenterDistrict(districts, bi, bj);
      const rate = dk === 'merkez' ? 0.15 : 0.08;
      if (shf(seed, key, TAG.BLOCK_OPEN) >= rate) continue;
      const u = shf(seed, key, TAG.BLOCK_OPEN_KIND);
      set(bi, bj, u < 0.55 ? BK.PARK : u < 0.8 ? BK.PLAZA : BK.PARKUR, false);
    }
  }
  return { kind, kindAt, dplaza, hill: hp, routeBlocks, stationBlocks };
}

/* ------------------------------------------------------------------------------------------------
 * Yol ızgarası: segmentler, kesikler, kollar
 * ---------------------------------------------------------------------------------------------- */
const N_ARM = 1;
const E_ARM = 2;
const S_ARM = 4;
const W_ARM = 8;
export const ARM = Object.freeze({ N: N_ARM, E: E_ARM, S: S_ARM, W: W_ARM });

/** Segment tanımı tablosu (tohumsuz): {sid, axis:'v'|'h', line, k (başlangıç satırı/sütunu), a:{i,j}, b:{i,j}, arterial}. */
const SEGS = [];
for (let i = -GRID_N; i <= GRID_N; i++) {
  for (let r = 0; r < ROWS.length - 1; r++) {
    const j = ROWS[r];
    SEGS[segV(i, j)] = { sid: segV(i, j), axis: 'v', line: i, k: j, ai: i, aj: j, bi: i, bj: nextRow(j), arterial: isArterial(i) };
  }
}
for (let r = 0; r < ROWS.length; r++) {
  const j = ROWS[r];
  for (let i = -GRID_N; i < GRID_N; i++) {
    SEGS[segH(j, i)] = { sid: segH(j, i), axis: 'h', line: j, k: i, ai: i, aj: j, bi: i + 1, bj: j, arterial: isArterial(j) };
  }
}
export const SEGMENTS = Object.freeze(SEGS);

/** Segmentin merkeze en yakın noktası (bu < 96 ⇒ plaza diskine değer). */
export function segMinR(s) {
  const ax = s.ai * GRID;
  const az = s.aj * GRID;
  const bx = s.bi * GRID;
  const bz = s.bj * GRID;
  if (s.axis === 'v') {
    const lo = Math.min(az, bz);
    const hi = Math.max(az, bz);
    const dz = lo > 0 ? lo : hi < 0 ? hi : 0;
    return Math.sqrt(ax * ax + dz * dz);
  }
  const lo = Math.min(ax, bx);
  const hi = Math.max(ax, bx);
  const dx = lo > 0 ? lo : hi < 0 ? hi : 0;
  return Math.sqrt(dx * dx + az * az);
}

/** Segmentin tünel/hendek bölgesine girip girmediği (yalnız x=0 / z=0 arterleri). */
export function segTunnelOf(s) {
  if (!s.arterial) return false;
  if (s.line !== 0) return false;
  return segMinR(s) < PLAZA.r;
}

/** Segmentin bir ucu kanal köprüsü mü (V_i, 6→8). */
function segBridge(s) {
  return s.axis === 'v' && s.k === 6;
}

/** Bir segmentin iki yanındaki blok indeksleri [[bi,bj],[bi,bj]]. */
export function segSides(s) {
  if (s.axis === 'v') {
    // x=line; segment satırı k..nextRow(k) → blok satırı bj=k (6→8 ise bj=6 ve 7: iki blok; ilkini ve ikincisini döneriz)
    return [[s.line - 1, s.k], [s.line, s.k]];
  }
  return [[s.k, s.line - 1], [s.k, s.line]];
}

function degreeInit() {
  const deg = new Uint8Array(NODE_COUNT);
  for (let s = 0; s < SEGS.length; s++) {
    const g = SEGS[s];
    deg[nodeId(g.ai, g.aj)]++;
    deg[nodeId(g.bi, g.bj)]++;
  }
  return deg;
}

function connected(cut) {
  const adj = new Array(NODE_COUNT);
  for (let n = 0; n < NODE_COUNT; n++) adj[n] = [];
  for (let s = 0; s < SEGS.length; s++) {
    if (cut[s]) continue;
    const g = SEGS[s];
    const a = nodeId(g.ai, g.aj);
    const b = nodeId(g.bi, g.bj);
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Uint8Array(NODE_COUNT);
  const stack = [0];
  seen[0] = 1;
  let cnt = 1;
  while (stack.length) {
    const n = stack.pop();
    const l = adj[n];
    for (let k = 0; k < l.length; k++) {
      if (!seen[l[k]]) {
        seen[l[k]] = 1;
        cnt++;
        stack.push(l[k]);
      }
    }
  }
  return cnt === NODE_COUNT;
}

/**
 * buildRoadLayout(seed, blocks, protect) → roads
 *   protect: Set<sid> — kesilemez segmentler (yarış rotaları). Kesik kuralları:
 *   • ZORUNLU: merkez diskine (r<96) değen ara sokak segmentleri;
 *   • İSTEĞE BAĞLI: iki yanından en az biri açık blok (park/meydan/parkur/haç/bölge meydanı) olan ara sokak segmentleri (iki yan açıksa %100,
 *     tek yan %55), bağlılık ve "her düğüm derecesi ≥2" korunarak (hash sırasıyla). Arterler, köprüler, tüneller, korunanlar asla kesilmez.
 *   Kesik segmentin koridoru yürüyüş meydanı (SURF.PLAZA) olur — parsellerin ön cephesi yine kaldırım/meydana bakar.
 */
export function buildRoadLayout(seed, blocks, protect) {
  const cut = new Uint8Array(SEGS.length);
  const deg = degreeInit();
  const prot = protect || new Set();
  const cand = [];
  for (let s = 0; s < SEGS.length; s++) {
    const g = SEGS[s];
    if (g.arterial || prot.has(s) || segBridge(g) || segTunnelOf(g)) continue;
    if (segMinR(g) < PLAZA.padR) {
      cand.push({ s, mandatory: true, p: 1 });
      continue;
    }
    const sd = segSides(g);
    let open = 0;
    for (let q = 0; q < 2; q++) if (isOpenKind(blocks.kindAt(sd[q][0], sd[q][1]))) open++;
    if (open === 0) continue;
    cand.push({ s, mandatory: false, p: open === 2 ? 1 : 0.55 });
  }
  cand.sort((a, b) => (a.mandatory === b.mandatory ? sh(seed, a.s, TAG.CUT) - sh(seed, b.s, TAG.CUT) : a.mandatory ? -1 : 1));
  for (let c = 0; c < cand.length; c++) {
    const e = cand[c];
    const g = SEGS[e.s];
    if (!e.mandatory && shf(seed, e.s, TAG.CUT + 7) >= e.p) continue;
    const na = nodeId(g.ai, g.aj);
    const nb = nodeId(g.bi, g.bj);
    if (deg[na] <= 2 || deg[nb] <= 2) continue;
    cut[e.s] = 1;
    deg[na]--;
    deg[nb]--;
    if (!connected(cut)) {
      cut[e.s] = 0;
      deg[na]++;
      deg[nb]++;
    }
  }
  const arms = new Uint8Array(NODE_COUNT);
  for (let s = 0; s < SEGS.length; s++) {
    if (cut[s]) continue;
    const g = SEGS[s];
    const na = nodeId(g.ai, g.aj);
    const nb = nodeId(g.bi, g.bj);
    if (g.axis === 'v') {
      arms[na] |= S_ARM;
      arms[nb] |= N_ARM;
    } else {
      arms[na] |= E_ARM;
      arms[nb] |= W_ARM;
    }
  }
  return {
    seed, blocks, cut, arms, deg, protect: prot, segments: SEGS, rows: ROWS,
    canal: CANAL, plaza: PLAZA, bridges: BRIDGE_LIST,
  };
}

export function armsOf(roads, i, j) {
  return roads.arms[nodeId(i, j)];
}

/** Kol dir (0 K, 1 D, 2 G, 3 B) → ışık direğinin köşesi: o koldan gelen trafiğin sağındaki ileri köşe. */
export const POLE_CORNER = Object.freeze([{ sx: -1, sz: 1 }, { sx: -1, sz: -1 }, { sx: 1, sz: -1 }, { sx: 1, sz: 1 }]);

/**
 * Kavşak ışık planı: {type:'ar'|'ara'|'yan', lights:[{x,y,z,dir,sx,sz}]} — arter×arter tüm kollar, arter×yan yalnız arter kolları, yan×yan yok.
 * (x,z) direk hücresinin merkezi; direk hücresi köşe karesinin asfalta en yakın hücresidir.
 */
export function junctionLights(roads, i, j) {
  const arms = roads.arms[nodeId(i, j)];
  const aV = isArterial(i);
  const aH = isArterial(j);
  const type = aV && aH ? 'ar' : aV || aH ? 'ara' : 'yan';
  const lights = [];
  let n = 0;
  for (let b = arms; b; b &= b - 1) n++;
  if (type === 'yan' || n < 3) return { type, lights };
  const bits = [N_ARM, E_ARM, S_ARM, W_ARM];
  for (let dir = 0; dir < 4; dir++) {
    if (!(arms & bits[dir])) continue;
    const armIsV = dir === 0 || dir === 2;
    if (type === 'ara' && (armIsV ? !aV : !aH)) continue;
    const pc = POLE_CORNER[dir];
    lights.push({
      x: i * GRID + pc.sx * (asphaltHalf(i) + 0.5), y: nodeY(i, j), z: j * GRID + pc.sz * (asphaltHalf(j) + 0.5), dir, sx: pc.sx, sz: pc.sz,
    });
  }
  return { type, lights };
}

export function segExists(roads, sid) {
  return roads.cut[sid] === 0;
}

/** Düğümün yol yüzeyi y'si (tünel hattında r'ye göre, aksi 64). */
export function nodeY(i, j) {
  if (i === 0 || j === 0) {
    const r = Math.sqrt((i * GRID) * (i * GRID) + (j * GRID) * (j * GRID));
    return tunnelRoadY(r);
  }
  return GROUND_Y;
}

/** Segmentin merkez çizgisi (x,y,z üçlüleri; tünel kırılma noktaları dahil). */
export function segmentPts(roads, sid) {
  const g = SEGS[sid];
  const ax = g.ai * GRID;
  const az = g.aj * GRID;
  const bx = g.bi * GRID;
  const bz = g.bj * GRID;
  const pts = [[ax, nodeY(g.ai, g.aj), az]];
  if (segTunnelOf(g)) {
    // eksen boyunca r = |koordinat|; kırılmalar r=42 ve r=90
    const along = g.axis === 'v' ? 'z' : 'x';
    const a = along === 'z' ? az : ax;
    const b = along === 'z' ? bz : bx;
    const dir = Math.sign(b - a);
    const cps = [];
    [PLAZA.rFlat, PLAZA.r].forEach((rr) => {
      [rr, -rr].forEach((v) => {
        if ((v - a) * dir > 0 && (b - v) * dir > 0) cps.push(v);
      });
    });
    cps.sort((p, q) => (p - q) * dir);
    for (let c = 0; c < cps.length; c++) {
      const v = cps[c];
      const y = tunnelRoadY(Math.abs(v));
      pts.push(along === 'z' ? [ax, y, v] : [v, y, az]);
    }
  }
  pts.push([bx, nodeY(g.bi, g.bj), bz]);
  const out = new Float32Array(pts.length * 3);
  for (let p = 0; p < pts.length; p++) {
    out[p * 3] = pts[p][0];
    out[p * 3 + 1] = pts[p][1];
    out[p * 3 + 2] = pts[p][2];
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Yüzey sorguları (O(1))
 * ---------------------------------------------------------------------------------------------- */
function nearestCol(x) {
  const i = Math.round((x + 0.5) / GRID);
  return i < -GRID_N ? -GRID_N : i > GRID_N ? GRID_N : i;
}

/** Hücre (x,z) dikey yol koridorunda mı → i | null. */
function inRoadV(x) {
  const i = nearestCol(x);
  const d = x - i * GRID;
  const h = halfWidth(i);
  return d >= -h && d < h ? i : null;
}
/** Hücre yatay yol koridorunda mı → j | null (j=7 yok). */
function inRoadH(z) {
  const j = nearestCol(z);
  if (j === 7) return null;
  const d = z - j * GRID;
  const h = halfWidth(j);
  return d >= -h && d < h ? j : null;
}

/** Dikey koridor hücresi (junction dışı) hangi segmente ait (z → başlangıç satırı). */
function rowOfZ(zc) {
  let a = Math.floor(zc / GRID);
  if (a === 7) a = 6;
  if (a < -GRID_N) a = -GRID_N;
  if (a > 8) a = 8;
  return a;
}
function colOfX(xc) {
  let a = Math.floor(xc / GRID);
  if (a < -GRID_N) a = -GRID_N;
  if (a > GRID_N - 1) a = GRID_N - 1;
  return a;
}

/** Koridor boyunca kavşağa mesafe (hücre): zebra ve şerit kararı. dEnd = en yakın kavşak dikdörtgeninin kenarına uzaklık. */
function dEndV(i, z, a) {
  const b = nextRow(a);
  const d0 = z - (a * GRID + halfWidth(a));
  const d1 = b * GRID - halfWidth(b) - 1 - z;
  return d0 < d1 ? { d: d0, near: a } : { d: d1, near: b };
}

/**
 * Yüzey kodu (SURF.*). x,z tamsayı blok hücresi. Köprü altı su yoktur: köprü tabliyesi hücreleri yol kodu döndürür, `bridgeAt` true olur.
 * Blok içi: kanal suyu/rıhtım, açık blok (park → PARK, meydan → PLAZA), aksi GROUND (parsel/avlu; malzemeyi cityemit seçer).
 */
export function surfaceAt(roads, x, z) {
  if (x < -LAND || x >= LAND || z < -LAND || z >= LAND) return SURF.EDGE;
  // kapalı tünel (r≤60) üstü: meydan tabliyesi (yaya meydanı, y64); açık hendek (60<r≤90) tabanı yol olarak kalır (tunnelAt/roadYAt)
  if (x >= -62 && x < 62 && z >= -62 && z < 62 && tunnelAt(roads, x, z) >= 2) return SURF.PLAZA;
  const iV = inRoadV(x);
  const jH = inRoadH(z);
  const xc = x + 0.5;
  const zc = z + 0.5;
  if (iV !== null && jH !== null) {
    const aV = Math.abs(xc - iV * GRID) <= asphaltHalf(iV);
    const aH = Math.abs(zc - jH * GRID) <= asphaltHalf(jH);
    const arms = roads.arms[nodeId(iV, jH)];
    const hasV = (arms & (N_ARM | S_ARM)) !== 0;
    const hasH = (arms & (E_ARM | W_ARM)) !== 0;
    if (hasV && hasH) return aV || aH ? SURF.ASPHALT : SURF.SIDEWALK;
    if (hasV) return aV ? SURF.ASPHALT : SURF.SIDEWALK;
    if (hasH) return aH ? SURF.ASPHALT : SURF.SIDEWALK;
    return SURF.PLAZA;
  }
  if (iV !== null) {
    const a = rowOfZ(zc);
    const sid = segV(iV, a);
    if (SEGS[sid] === undefined) return SURF.PLAZA;
    if (roads.cut[sid]) return SURF.PLAZA;
    const dxc = xc - iV * GRID;
    if (Math.abs(dxc) > asphaltHalf(iV)) return SURF.SIDEWALK;
    const dx = x - iV * GRID;
    const e = dEndV(iV, z, a);
    if (e.d < 3) return (dx & 1) === 0 ? SURF.ZEBRA_Z : SURF.ASPHALT;
    if (e.d < 6) return SURF.ASPHALT;
    if (isArterial(iV)) {
      if (dx === -1 || dx === 0) return SURF.LANE_Z;
      if ((dx === 3 || dx === -4) && imod(z, 8) < 4) return SURF.LANE_Z;
    } else if (dx === 0 && imod(z, 8) < 4) return SURF.LANE_Z;
    return SURF.ASPHALT;
  }
  if (jH !== null) {
    const a = colOfX(xc);
    const sid = segH(jH, a);
    if (SEGS[sid] === undefined) return SURF.PLAZA;
    if (roads.cut[sid]) return SURF.PLAZA;
    const dzc = zc - jH * GRID;
    if (Math.abs(dzc) > asphaltHalf(jH)) return SURF.SIDEWALK;
    const dz = z - jH * GRID;
    const b = a + 1;
    const d0 = x - (a * GRID + halfWidth(a));
    const d1 = b * GRID - halfWidth(b) - 1 - x;
    const d = d0 < d1 ? d0 : d1;
    if (d < 3) return (dz & 1) === 0 ? SURF.ZEBRA_X : SURF.ASPHALT;
    if (d < 6) return SURF.ASPHALT;
    if (isArterial(jH)) {
      if (dz === -1 || dz === 0) return SURF.LANE_X;
      if ((dz === 3 || dz === -4) && imod(x, 8) < 4) return SURF.LANE_X;
    } else if (dz === 0 && imod(x, 8) < 4) return SURF.LANE_X;
    return SURF.ASPHALT;
  }
  // blok içi
  const zcan = canalCenterZ(xc);
  const dz = Math.abs(zc - zcan);
  if (dz < CANAL.half) return SURF.WATER;
  if (dz < CANAL.half + CANAL.quay) return SURF.QUAY;
  const bi = Math.floor(x / GRID);
  const bj = Math.floor(z / GRID);
  const k = roads.blocks.kindAt(bi, bj);
  if (k === BK.PARK) return SURF.PARK;
  if (k === BK.PLAZA || k === BK.PARKUR || k === BK.CENTRAL || k === BK.DPLAZA) return SURF.PLAZA;
  return SURF.GROUND;
}

/** Hücre köprü tabliyesi mi (V_i koridoru ∩ kanal açıklığı). */
export function bridgeAt(roads, x, z) {
  const i = inRoadV(x);
  if (i === null) return false;
  const b = BRIDGES[i + GRID_N];
  return z >= b.z0 && z < b.z1 && inRoadH(z) === null;
}

/** Tünel durumu (V_0/H_0 koridoru, r=√(x²+z²)): 0 yok · 1 açık hendek · 2 kapalı rampa · 3 düz tünel. */
export function tunnelAt(roads, x, z) {
  const xc = x + 0.5;
  const zc = z + 0.5;
  const r = Math.sqrt(xc * xc + zc * zc);
  if (r > PLAZA.r + 12) return 0;
  const inX = xc >= -10 && xc < 10 && Math.abs(zc) <= PLAZA.r;
  const inZ = zc >= -10 && zc < 10 && Math.abs(xc) <= PLAZA.r;
  if (!inX && !inZ) return 0;
  const rr = inX ? Math.abs(zc) : Math.abs(xc);
  return tunnelZone(rr);
}

/** Yol koridoru hücresinin yüzey (ayak) yüksekliği; koridor değilse NaN. */
export function roadYAt(roads, x, z) {
  const t = tunnelAt(roads, x, z);
  if (t > 0) {
    const xc = x + 0.5;
    const zc = z + 0.5;
    const rr = xc >= -10 && xc < 10 && Math.abs(zc) <= PLAZA.r ? Math.abs(zc) : Math.abs(xc);
    return tunnelRoadY(rr);
  }
  const s = surfaceAt(roads, x, z);
  return s >= SURF.ASPHALT && s <= SURF.SIDEWALK ? GROUND_Y : NaN;
}

/** Yol koridoru (asfalt/şerit/zebra/kaldırım) mı. */
export function isRoadSurf(s) {
  return s >= SURF.ASPHALT && s <= SURF.SIDEWALK;
}

/** Bölge paleti için kısayol (blok merkezi bölge parametreleri). */
export function districtParams(key) {
  return DISTRICTS[key];
}

