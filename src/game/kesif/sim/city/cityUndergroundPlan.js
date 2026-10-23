/*
 * KEŞİF sim/city — ALT ŞEHİR PLANI (yeraltı): kanalizasyon, metro, laboratuvarlar, kasa. Saf, belirlenimci. Sözleşme §7 "Yeraltı".
 * (Bloklara yazmak cityemit/cityUnderground'un işidir; burada yalnız YER ve ÖLÇÜ.) y değerleri AYAK SEVİYESİDİR (zemin bloğunun üst yüzü).
 *
 * buildUnderground(plan) → {
 *   sewer:{floorY:31, ceilY:35, clearW:5, clear:4, lines:[{axis:'x'|'z', c, a, b}], manholes:[{i,j,x,z,topY:64,botY:31,stub:{x0,z0,x1,z1}}]}
 *       Temiz kesit: 5 genişlik (c−2..c+2 hücre), 4 yükseklik (y31..34); tavan bloğu y35, zemin bloğu y30; duvar 1. Yollar altında tüm çizgiler [−720,720].
 *       Menhol: her kavşağın KD köşesinde (merkez diski r<96 hariç); merdiven 138 y31→63; `stub` = dipte ana tünele 1 genişlikli bağlantı.
 *   metro:{floorY:44, ceilY:51, tunnelW:9, stationW:17, platform:4, stationLen:56,
 *          lines:[{id:'mor',axis:'z',c:0,a:-348,b:348},{id:'turuncu',axis:'x',c:0,a:-348,b:348}],
 *          stations:[{id,x,z,lines,axis,len,box:{x0,z0,x1,z1},entrances:[Entrance]}]}      istasyonlar (0,0), (0,±320), (±320,0)
 *       Entrance = {station,lot,top:{x,z,y:64},u:'x'|'z',su:±1,uNear,vRow:{v0,v1},flights:[{u0,u1,v0,v1,dirU,y0,y1}],landing:{…,y:54},
 *                   bottom:{x,z,y:44},link:{x0,z0,x1,z1,y:44}}     10+10 basamaklı switchback; hat tarafına dönük kapı
 *   labs:[{id,district,axis,side,line,v,rooms:[{k,x0,z0,x1,z1,y0,y1}] (3 oda 16×12×6, yükselti −24/−18/−12),shaft:{x,z,yTop:31,yBot:-12},entry:{kind:'gizli'|'kod',x,z,y:31}}]  (12)
 *   vault:{id,district:'teknoloji',x0,z0,x1,z1,y0:-110,y1:-90,labId,shaft:{x,z,yTop:-24,yBot:-110},cardTier:3}
 *   boxes()  → engineeredAt(x,y,z) için AABB listesi
 * }
 * engineeredAt(plan,x,y,z) → bool        (cityemit isNaturalFill = !engineered && yeraltı taş bandı)
 */
import { DISTRICT_KEYS } from './archetypes.js';
import { GRID, GRID_N, PLAZA, hasRow, halfWidth, asphaltHalf, nodeId, stationLattice, canalCenterZ, CANAL } from './cityRoads.js';
import { TAG, sh, shf } from './cityPlanKit.js';
import { makeExtraAt } from './cityUndergroundExtra.js';

export const SEWER = Object.freeze({ floorY: 31, ceilY: 35, clearW: 5, clear: 4, extent: 720 });
export const METRO = Object.freeze({
  floorY: 44, ceilY: 51, tunnelW: 9, stationW: 17, platform: 4, stationLen: 56, lineExt: 348, entranceRun: 12,
});
export const LAB = Object.freeze({
  count: 12, rooms: 3, roomW: 16, roomD: 12, roomH: 6, y0: -24, step: 6, perDistrict: 2,
});
export const VAULT = Object.freeze({ y0: -110, y1: -90, w: 24, d: 24 });

/** Menhol/direk için köşe hücresi: a = asfalt kenarından x'te, b = z'de uzaklık (0..w-1). */
export function cornerCell(i, j, sx, sz, a, b) {
  const cx = i * GRID;
  const cz = j * GRID;
  const ahV = asphaltHalf(i);
  const ahH = asphaltHalf(j);
  return {
    x: sx > 0 ? cx + ahV + a : cx - ahV - 1 - a,
    z: sz > 0 ? cz + ahH + b : cz - ahH - 1 - b,
  };
}

/**
 * Menhol hücresi: kavşağın KD (kuzeydoğu) köşe karesinin DIŞ köşe hücresi (x = cx + hwV − 1, z = cz − hwH). Dış köşe, istasyon kutusunun (±9 duvar)
 * Turuncu hat yönündeki duvarının dışında kalır (Mor hat kavşaklarında baca duvar sütununa denk gelir: bakım merdiveni nişi).
 */
export function manholeCell(i, j) {
  return { x: i * GRID + halfWidth(i) - 1, z: j * GRID - halfWidth(j) };
}

function manholes() {
  const out = [];
  for (let j = -GRID_N; j <= GRID_N; j++) {
    if (!hasRow(j)) continue;
    for (let i = -GRID_N; i <= GRID_N; i++) {
      const x = i * GRID;
      const z = j * GRID;
      if (x * x + z * z < PLAZA.padR * PLAZA.padR) continue;
      const c = manholeCell(i, j);
      // dipte H ana tüneline (z = cz; temiz kesit z∈[cz−2,cz+3)) dik 1 genişlikli bağlantı
      const stub = { x0: c.x, z0: c.z, x1: c.x + 1, z1: z - 2 };
      out.push({ i, j, id: nodeId(i, j), x: c.x, z: c.z, topY: 64, botY: SEWER.floorY, stub });
    }
  }
  return out;
}

function sewerLines() {
  const lines = [];
  for (let i = -GRID_N; i <= GRID_N; i++) lines.push({ axis: 'z', c: i * GRID, a: -SEWER.extent, b: SEWER.extent });
  for (let j = -GRID_N; j <= GRID_N; j++) if (hasRow(j)) lines.push({ axis: 'x', c: j * GRID, a: -SEWER.extent, b: SEWER.extent });
  return lines;
}

/** Kiosk parseli için switchback geometrisi. lot: {id,x0,z0,x1,z1}; hat ekseni 'z' (Mor, x=0) ya da 'x' (Turuncu, z=0). */
export function stationEntrance(station, lot) {
  const lineAxis = station.axis; // hat boyunca eksen
  const uAxis = lineAxis === 'z' ? 'x' : 'z'; // merdiven yürüyüş ekseni (hatta dik)
  const centerU = lineAxis === 'z' ? station.x : station.z;
  const lo = uAxis === 'x' ? lot.x0 : lot.z0;
  const hi = uAxis === 'x' ? lot.x1 : lot.z1;
  const su = (lo + hi) / 2 > centerU ? 1 : -1;
  const uNear = su > 0 ? lo : hi - 1; // hatta en yakın hücre
  const vlo = lineAxis === 'z' ? lot.z0 : lot.x0;
  const v0 = vlo + 2;
  const flights = [];
  // uzaklaşan: uNear+su*1 .. uNear+su*10 (y 63→54), dönen: uNear+su*10 .. uNear+su*1 (y 53→44)
  const f1 = { u0: uNear + su * 1, u1: uNear + su * 10, v0, v1: v0 + 2, dirU: su, y0: 64, y1: 54 };
  const f2 = { u0: uNear + su * 10, u1: uNear + su * 1, v0: v0 + 3, v1: v0 + 5, dirU: -su, y0: 54, y1: 44 };
  flights.push(f1, f2);
  const landing = { u: uNear + su * 11, v0, v1: v0 + 5, y: 54 };
  const mk = (u, v) => (uAxis === 'x' ? { x: u, z: v } : { x: v, z: u });
  const top = mk(f1.u0, v0);
  const bottom = mk(uNear, v0 + 3);
  // bağlantı: dipten istasyon kutusunun kenarına (hücre uNear−su*1 … kutu kenarı)
  const boxEdge = su > 0 ? centerU + 8 : centerU - 8; // kutunun son temiz hücresi
  const linkLo = Math.min(uNear - su, boxEdge + su);
  const linkHi = Math.max(uNear - su, boxEdge + su);
  const link = uAxis === 'x'
    ? { x0: Math.min(linkLo, linkHi), x1: Math.max(linkLo, linkHi) + 1, z0: v0 + 3, z1: v0 + 5, y: 44 }
    : { z0: Math.min(linkLo, linkHi), z1: Math.max(linkLo, linkHi) + 1, x0: v0 + 3, x1: v0 + 5, y: 44 };
  return {
    station: station.id, lot: lot.id, top: { x: top.x, z: top.z, y: 64 }, u: uAxis, su, uNear, vRow: { v0, v1: v0 + 5 }, flights, landing,
    bottom: { x: bottom.x, z: bottom.z, y: 44 }, link,
  };
}

function metroPlan() {
  const lines = [
    { id: 'mor', axis: 'z', c: 0, a: -METRO.lineExt, b: METRO.lineExt },
    { id: 'turuncu', axis: 'x', c: 0, a: -METRO.lineExt, b: METRO.lineExt },
  ];
  const S = stationLattice();
  const stations = [];
  for (let s = 0; s < S.length; s++) {
    const x = S[s][0] * GRID;
    const z = S[s][1] * GRID;
    const central = x === 0 && z === 0;
    const axis = central ? 'z' : x === 0 ? 'z' : 'x';
    const half = METRO.stationLen / 2;
    const w = Math.floor(METRO.stationW / 2);
    const boxes = [];
    const mor = (central || x === 0) ? { x0: x - w, x1: x + w + 1, z0: z - half, z1: z + half } : null;
    const tur = (central || z === 0) ? { x0: x - half, x1: x + half, z0: z - w, z1: z + w + 1 } : null;
    if (mor) boxes.push(mor);
    if (tur) boxes.push(tur);
    stations.push({
      id: s, x, z, central, lines: central ? ['mor', 'turuncu'] : [x === 0 ? 'mor' : 'turuncu'], axis, len: METRO.stationLen, boxes, entrances: [],
    });
  }
  return { lines, stations };
}

/* ------------------------------------------------------------------------------------------------
 * Laboratuvarlar
 * ---------------------------------------------------------------------------------------------- */
function boxOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
}

function labGeometry(axis, line, v, side) {
  // axis: yolun uzandığı eksen ('z' = dikey yol x=line, zincir x yönünde; 'x' = yatay yol z=line, zincir z yönünde)
  const rooms = [];
  const u0 = 1; // yol çizgisinden zincir başı (room2, shaft sütunu u=2 burada)
  for (let k = LAB.rooms - 1, n = 0; k >= 0; k--, n++) {
    // room index k: 0 = en derin (y −24) … 2 = yüzeye en yakın (y −12)
    const ua = u0 + n * LAB.roomW;
    const ub = ua + LAB.roomW;
    const y0 = LAB.y0 + k * LAB.step;
    const du0 = side > 0 ? ua : -ub + 1;
    const du1 = side > 0 ? ub : -ua + 1;
    const dv0 = v - LAB.roomD / 2;
    const dv1 = v + LAB.roomD / 2;
    if (axis === 'z') rooms.push({ k, x0: line + du0, x1: line + du1, z0: dv0, z1: dv1, y0, y1: y0 + LAB.roomH });
    else rooms.push({ k, z0: line + du0, z1: line + du1, x0: dv0, x1: dv1, y0, y1: y0 + LAB.roomH });
  }
  rooms.sort((a, b) => a.k - b.k);
  return rooms;
}

/** Aday laboratuvar (hash h'den): sınırlar/merkez diski/çakışma denetimli; `want` verilirse zincir merkezi o bölgede olmalı. */
function labCandidate(plan, h, taken, want) {
  const axis = (h & 1) === 0 ? 'z' : 'x';
  const li = ((h >>> 1) % 17) - 8; // çizgi indeksi −8..8
  const line = li * GRID;
  if (axis === 'x' && !hasRow(li)) return null;
  const v = Math.round((-640 + ((h >>> 8) % 1280)) / 4) * 4;
  const side = ((h >>> 20) & 1) === 0 ? 1 : -1;
  const rooms = labGeometry(axis, line, v, side);
  const bb = {
    x0: Math.min.apply(null, rooms.map((r) => r.x0)), x1: Math.max.apply(null, rooms.map((r) => r.x1)),
    z0: Math.min.apply(null, rooms.map((r) => r.z0)), z1: Math.max.apply(null, rooms.map((r) => r.z1)),
  };
  if (bb.x0 < -690 || bb.x1 > 690 || bb.z0 < -690 || bb.z1 > 690) return null;
  const cxm = (bb.x0 + bb.x1) / 2;
  const czm = (bb.z0 + bb.z1) / 2;
  if (cxm * cxm + czm * czm < 120 * 120) return null; // merkez meydanı altı boş kalsın (tünel/istasyon)
  const dk = plan.districts.districtAt(cxm, czm);
  if (want && dk !== want) return null;
  for (let q = 0; q < taken.length; q++) {
    const o = { x0: taken[q].x0 - 4, x1: taken[q].x1 + 4, z0: taken[q].z0 - 4, z1: taken[q].z1 + 4 };
    if (boxOverlap(bb, o)) return null;
  }
  return { axis, line, v, side, rooms, bb, district: dk };
}

function labsPlan(plan) {
  const seed = plan.seed;
  const labs = [];
  const taken = [];
  const push = (c, tag) => {
    taken.push(c.bb);
    const shaftU = c.side * 2;
    const shaft = c.axis === 'z' ? { x: c.line + shaftU, z: c.v, yTop: SEWER.floorY, yBot: LAB.y0 + 2 * LAB.step }
      : { x: c.v, z: c.line + shaftU, yTop: SEWER.floorY, yBot: LAB.y0 + 2 * LAB.step };
    const kind = shf(seed, tag, TAG.U_KIND) < 0.5 ? 'gizli' : 'kod';
    labs.push({
      id: labs.length, district: c.district, axis: c.axis, side: c.side, line: c.line, v: c.v, rooms: c.rooms, box: c.bb, shaft,
      entry: { kind, x: shaft.x, z: shaft.z, y: SEWER.floorY },
    });
  };
  // bölge başına 2 (zincir merkezi o bölgede)
  for (let d = 0; d < DISTRICT_KEYS.length; d++) {
    let got = 0;
    for (let t = 0; t < 800 && got < LAB.perDistrict; t++) {
      const c = labCandidate(plan, sh(seed, d * 1000 + t, TAG.U_LAB), taken, DISTRICT_KEYS[d]);
      if (!c) continue;
      push(c, d * 1000 + t);
      got++;
    }
  }
  // güvence: bir bölge 800 denemede dolmadıysa (çok küçük bölge) kalan labı bölge şartsız yerleştir; toplam her zaman 12
  for (let t = 0; labs.length < LAB.count && t < 4000; t++) {
    const c = labCandidate(plan, sh(seed, 9000000 + t, TAG.U_LAB), taken, null);
    if (c) push(c, 9000000 + t);
  }
  return labs;
}

function vaultPlan(plan, labs) {
  const tech = labs.filter((l) => l.district === 'teknoloji');
  const lab = tech[0] || labs[0]; // Teknoloji Parkı labı yoksa (olağandışı) ilk lab
  const r0 = lab.rooms[0]; // en derin oda
  const cx = Math.floor((r0.x0 + r0.x1) / 2);
  const cz = Math.floor((r0.z0 + r0.z1) / 2);
  return {
    id: 0, district: lab.district, x0: cx - VAULT.w / 2, x1: cx + VAULT.w / 2, z0: cz - VAULT.d / 2, z1: cz + VAULT.d / 2, y0: VAULT.y0, y1: VAULT.y1,
    labId: lab.id, shaft: { x: cx, z: cz, yTop: LAB.y0, yBot: VAULT.y0 }, cardTier: 3,
  };
}

export function buildUnderground(plan) {
  const metro = metroPlan();
  const labs = labsPlan(plan);
  const vault = vaultPlan(plan, labs);
  const sewer = {
    floorY: SEWER.floorY, ceilY: SEWER.ceilY, clearW: SEWER.clearW, clear: SEWER.clear, lines: sewerLines(), manholes: manholes(),
  };
  return {
    sewer,
    metro: {
      floorY: METRO.floorY, ceilY: METRO.ceilY, tunnelW: METRO.tunnelW, stationW: METRO.stationW, platform: METRO.platform, stationLen: METRO.stationLen,
      lines: metro.lines, stations: metro.stations,
    },
    labs, vault,
    extraAt: makeExtraAt(plan),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Mühendislik hacmi sorgusu (isNaturalFill için)
 * ---------------------------------------------------------------------------------------------- */
function inRange(v, a, b) {
  return v >= a && v < b;
}

/** (x,y,z) mühendislik yapısının (kabuğu dahil, +1) içinde mi: kanalizasyon, menhol, metro, istasyon, laboratuvar, kasa, tünel, kanal yatağı. */
export function engineeredAt(plan, x, y, z) {
  const u = plan.underground;
  // kanalizasyon (y 29..36 kabuk)
  if (y >= SEWER.floorY - 2 && y <= SEWER.ceilY + 1) {
    const ci = Math.round(x / GRID);
    if (ci >= -GRID_N && ci <= GRID_N && Math.abs(z) <= SEWER.extent + 4 && inRange(x - ci * GRID, -4, 5)) return true;
    const cj = Math.round(z / GRID);
    if (hasRow(cj) && Math.abs(x) <= SEWER.extent + 4 && inRange(z - cj * GRID, -4, 5)) return true;
  }
  // menhol dikey mili ve bağlantı
  if (y >= SEWER.floorY - 2 && y <= 64) {
    const bi = Math.round(x / GRID);
    const bj = Math.round(z / GRID);
    if (bi >= -GRID_N && bi <= GRID_N && hasRow(bj)) {
      const dx = x - bi * GRID;
      const dz = z - bj * GRID;
      const mx = halfWidth(bi) - 1;
      const mz = -halfWidth(bj);
      if (dx >= mx - 1 && dx <= mx + 1 && dz >= mz - 1 && dz <= mz + 1) return true;
    }
  }
  // metro
  if (y >= METRO.floorY - 2 && y <= METRO.ceilY + 1) {
    if (Math.abs(x) <= 6 + METRO.tunnelW / 2 && Math.abs(z) <= METRO.lineExt + 2) return true;
    if (Math.abs(z) <= 6 + METRO.tunnelW / 2 && Math.abs(x) <= METRO.lineExt + 2) return true;
    const st = u.metro.stations;
    for (let s = 0; s < st.length; s++) {
      for (let b = 0; b < st[s].boxes.length; b++) {
        const q = st[s].boxes[b];
        if (x >= q.x0 - 2 && x < q.x1 + 2 && z >= q.z0 - 2 && z < q.z1 + 2) return true;
      }
    }
  }
  // istasyon giriş merdivenleri (y 43..64) — parsel/kiosk altı
  if (y >= METRO.floorY - 2 && y <= 66) {
    const st = u.metro.stations;
    for (let s = 0; s < st.length; s++) {
      const en = st[s].entrances;
      for (let e = 0; e < en.length; e++) {
        const E = en[e];
        const uc = E.u === 'x' ? x : z;
        const vc = E.u === 'x' ? z : x;
        const ulo = Math.min(E.uNear, E.uNear + E.su * 12) - 2;
        const uhi = Math.max(E.uNear, E.uNear + E.su * 12) + 3;
        if (uc >= ulo && uc < uhi && vc >= E.vRow.v0 - 1 && vc < E.vRow.v1 + 1) return true;
      }
    }
  }
  // merkez meydanı tüneli (V_0 / H_0, r≤96) y 54..64
  if (y >= PLAZA.yBot - 3 && y <= 64) {
    const r2 = x * x + z * z;
    if (r2 <= (PLAZA.r + 6) * (PLAZA.r + 6)) {
      if (Math.abs(x) <= 11 || Math.abs(z) <= 11) return true;
    }
  }
  // kanal yatağı (y 42..59)
  if (y >= CANAL.floorY - 2 && y <= CANAL.waterY + 2) {
    if (Math.abs(z + 0.5 - canalCenterZ(x + 0.5)) < CANAL.half + 2) return true;
  }
  // laboratuvarlar ve servis bacaları
  if (y <= SEWER.floorY && y >= LAB.y0 - 2) {
    for (let l = 0; l < u.labs.length; l++) {
      const L = u.labs[l];
      const bb = L.box;
      if (y <= LAB.y0 + LAB.rooms * LAB.step + 2 && x >= bb.x0 - 2 && x < bb.x1 + 2 && z >= bb.z0 - 2 && z < bb.z1 + 2) return true;
      if (Math.abs(x - L.shaft.x) <= 1 && Math.abs(z - L.shaft.z) <= 1) return true;
    }
  }
  // kasa ve kasa bacası
  const V = u.vault;
  if (y >= V.y0 - 2 && y <= V.y1 + 2 && x >= V.x0 - 2 && x < V.x1 + 2 && z >= V.z0 - 2 && z < V.z1 + 2) return true;
  if (y >= V.y0 - 2 && y <= LAB.y0 + 2 && Math.abs(x - V.shaft.x) <= 1 && Math.abs(z - V.shaft.z) <= 1) return true;
  // ek hacimler (kavşak odaları, gizli odalar): cityUndergroundExtra
  if (u.extraAt !== undefined && u.extraAt(x, y, z)) return true;
  return false;
}
