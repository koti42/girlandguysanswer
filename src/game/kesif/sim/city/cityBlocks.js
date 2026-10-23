/*
 * KEŞİF sim/city — BLOK PLANI: parseller + sokak donanımı + lambalar + açık blok (park/meydan/parkur/tepe) süslemesi. Saf, belirlenimci.
 *
 *  buildBlockPlan(plan, bi, bj) → {bi,bj,kind,rect,cell,district,lots:[Lot],props:[PropSpec],streetFurniture:[PropSpec],lamps:[PropSpec 'lamba'],
 *                                  manholes:[{i,j,x,z}],features:[…],corners:[…]}
 *   - Blok (bi,bj) = [bi·80,(bi+1)·80)×[bj·80,(bj+1)·80): iç dikdörtgen + sınırdaki yol yarı şeritleri + 4 kavşak çeyreği (kıyı bloklarında yalnız kara
 *     üzerindeki yol yarı şeridi ve köşe karesi). Her sokak donanımı tam olarak BİR bloğa aittir (sahiplik çakışmaz).
 *   - PropSpec = sim/props/propPlan.normalizeSpec girdisi: {kind (PROP_DEFS anahtarı), x,y,z (hücre merkezi; y ayak seviyesi), yaw (0 +Z, 1 +X, 2 −Z, 3 −X: prop ÖN
 *     yüzünün yönü), variant 0..7, lotId, slot (lotId içinde benzersiz), + district/brand (tabela), terminal (boyut terminali), junction/dir (trafik direği)}.
 *   - props: binaya bağlı (tabela/billboard; açık parsel ağaç/bank) ve açık blok/tepe süsleri. streetFurniture: sokak seviyesi (bank, çöp kutusu, otomat, saksı,
 *     ağaç, trafik direği, boyut terminali). propPlan ikisini birlikte alır.
 *   - lamps: sokak/meydan lambası konumları (kind 'lamba', side 'n'|'e'|'s'|'w'|'meydan'). propPlan bunları VARSAYILAN almaz: lamba demir direk + fener (89)
 *     BLOK olarak yazılır (cityemit); aralık ≥12 (aynı kenarda 16, kapı önü atlanır), iki yakada kaydırmalı, hendekte yok.
 *   - manholes: her kavşağın KD köşe karesinin dış hücresi (cityUndergroundPlan.manholeCell) — kanalizasyon ana tüneline iner.
 *   - features: açık blok/tepe süsleri: {kind:'yol'|'cesme'|'platform'|'teras'|'merdiven', …}.
 *  Tüm sokak donanımı yaya şeridinin DIŞ hücresindedir (≥1 hücre serbest yürüme şeridi kalır); kapı önü (3×2) ve Kapı Meydanı varış noktası çevresi boştur.
 */
import { planBuilding, mkProp } from './buildingPlan.js';
import { layoutBlock } from './cityLots.js';
import {
  BK, GRID, LAND, blockCell, hasCol, hasRow, isOpenKind, junctionLights, nodeId as nodeIdOf, segH, segV, tunnelAt,
} from './cityRoads.js';
import { manholeCell } from './cityUndergroundPlan.js';
import { FACE_YAW, TAG, blockKey, sh, stream, yawOfFacing } from './cityPlanKit.js';

const YAW_SIDE = FACE_YAW;
export const FURN_KINDS = Object.freeze(['bank', 'cop_kutusu', 'otomat', 'saksi', 'agac', 'cit']);

/* [bank, cop, otomat, saksi, agac, hiç] ağırlıkları */
const FURN_W = Object.freeze({
  merkez: [2, 2, 1, 3, 3, 5],
  gece_pazari: [2, 2, 3, 2, 1, 3],
  konteyner: [1, 3, 1, 0, 0, 7],
  liman: [1, 2, 0, 0, 0, 8],
  teknoloji: [2, 0, 1, 2, 3, 4],
  tepe: [2, 1, 0, 3, 4, 3],
});

/** Blok sınırındaki yolların kaldırım dış hücresi boyunca koşular (kara dışına taşan kısım kırpılır: kıyı bloklarının yol yarı şeritleri). */
function sideRuns(rect, bi, bj) {
  const runs = [];
  const add = (side, alongX, a, b, c) => {
    const lo = Math.max(a, -LAND);
    const hi = Math.min(b, LAND);
    if (hi - lo >= 4) runs.push({ side, alongX, a: lo, b: hi, c });
  };
  if (hasRow(bj)) add('n', true, rect.x0, rect.x1, rect.z0 - 1);
  if (hasRow(bj + 1)) add('s', true, rect.x0, rect.x1, rect.z1);
  if (hasCol(bi)) add('w', false, rect.z0, rect.z1, rect.x0 - 1);
  if (hasCol(bi + 1)) add('e', false, rect.z0, rect.z1, rect.x1);
  return runs;
}

/** Koşunun yol segmenti (kesik mi?) ve karşı blok türü. */
function runSegment(run, bi, bj) {
  const a = bj === 7 ? 6 : bj;
  if (run.side === 'n') return { sid: segH(bj, bi), across: [bi, bj - 1] };
  if (run.side === 's') return { sid: segH(bj + 1, bi), across: [bi, bj + 1] };
  if (run.side === 'w') return { sid: segV(bi, a), across: [bi - 1, bj] };
  return { sid: segV(bi + 1, a), across: [bi + 1, bj] };
}

function furnitureFor(plan, bi, bj, lay, out) {
  const seed = plan.seed;
  const R = plan.roads;
  const key = blockKey(bi, bj);
  const runs = sideRuns(lay.rect, bi, bj);
  const dk = lay.district || plan.districts.districtAt(bi * GRID + 40, bj * GRID + 40);
  const W = FURN_W[dk] || FURN_W.merkez;
  const density = dk === 'liman' || dk === 'konteyner' ? 0.7 : 1;
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    const sid = (key * 4 + r) | 0;
    // iki yanı da açık blok olan kesik koridor = tek meydan: koşuda donanım yok (meydan kendi lambalarını açık blok adımında alır)
    const rs = runSegment(run, bi, bj);
    if (R.cut[rs.sid] && isOpenKind(lay.kind) && isOpenKind(R.blocks.kindAt(rs.across[0], rs.across[1]))) continue;
    const inTrench = (x, z) => tunnelAt(R, Math.floor(x), Math.floor(z)) === 1;
    // kapı önleri (yürüme koordinatı u)
    const doors = [];
    for (let q = 0; q < lay.lots.length; q++) {
      const l = lay.lots[q];
      if (l.front === run.side && l.door) doors.push(run.alongX ? l.door.front.x : l.door.front.z);
    }
    const nearDoor = (u) => doors.some((d) => Math.abs(u - d) <= 3);
    const phase = sh(seed, sid, TAG.P_LAMP) % 6;
    const stagger = run.side === 'n' || run.side === 'w' ? 0 : 8;
    const lampU = [];
    for (let u = run.a + 2 + phase + stagger; u < run.b - 1; u += 16) {
      let uu = u;
      if (nearDoor(uu)) uu += 5;
      if (uu >= run.b - 1 || nearDoor(uu)) continue;
      u = uu; // sonraki lamba kaydırılmış konumdan 16 sonra: aralık hiç 16'nın altına düşmez
      const x = run.alongX ? uu + 0.5 : run.c + 0.5;
      const z = run.alongX ? run.c + 0.5 : uu + 0.5;
      if (inTrench(x, z)) continue;
      lampU.push(uu);
      out.lamps.push(mkProp(22000 + key, out.lampN++, 'lamba', x, 64, z, YAW_SIDE[run.side], 0, { side: run.side }));
    }
    const st = stream(seed, sid, TAG.P_FURN);
    for (let u = run.a + 3; u < run.b - 2; u += 5) {
      const uu = u + st.r(-1, 1);
      if (st.f() > density) continue;
      if (nearDoor(uu) || lampU.some((l) => Math.abs(l - uu) <= 2)) continue;
      const k = st.weighted(W);
      if (k < 0 || k > 4) continue;
      const kind = FURN_KINDS[k];
      const x = run.alongX ? uu + 0.5 : run.c + 0.5;
      const z = run.alongX ? run.c + 0.5 : uu + 0.5;
      if (inTrench(x, z)) continue;
      out.streetFurniture.push(mkProp(20000 + key, out.slotN++, kind, x, 64, z, YAW_SIDE[run.side], st.i(8)));
    }
  }
}

function cornerItems(plan, bi, bj, out) {
  const R = plan.roads;
  const key = blockKey(bi, bj);
  // [kavşak i,j, çeyrek sx,sz]: blok bu kavşağın hangi çeyreğinde
  const cs = [[bi, bj, 1, 1], [bi + 1, bj, -1, 1], [bi, bj + 1, 1, -1], [bi + 1, bj + 1, -1, -1]];
  for (let q = 0; q < 4; q++) {
    const [i, j, sx, sz] = cs[q];
    if (!hasCol(i) || !hasRow(j)) continue;
    const jl = junctionLights(R, i, j);
    for (let l = 0; l < jl.lights.length; l++) {
      const L = jl.lights[l];
      if (L.sx !== sx || L.sz !== sz) continue;
      out.streetFurniture.push(mkProp(20000 + key, out.slotN++, 'trafik_diregi', L.x, L.y, L.z, yawOfFacing(L.dir), L.dir, { junction: nodeIdOf(i, j), dir: L.dir }));
      out.corners.push({ i, j, dir: L.dir, kind: 'direk', x: L.x, z: L.z });
    }
    if (sx === 1 && sz === -1) {
      const x0 = i * GRID;
      const z0 = j * GRID;
      if (x0 * x0 + z0 * z0 >= 96 * 96) {
        const c = manholeCell(i, j);
        out.manholes.push({ i, j, x: c.x, z: c.z });
      }
    }
  }
}

function terminalItems(plan, bi, bj, out) {
  const ts = plan.terminals;
  for (let t = 0; t < ts.length; t++) {
    const T = ts[t];
    if (Math.floor(T.x / GRID) !== bi || Math.floor(T.z / GRID) !== bj) continue;
    out.streetFurniture.push(mkProp(20000 + blockKey(bi, bj), out.slotN++, 'boyut_terminali', T.x, T.y, T.z, yawOfFacing(T.facing), 0, { terminal: t }));
  }
}

function openBlock(plan, bi, bj, lay, out) {
  const seed = plan.seed;
  const key = blockKey(bi, bj);
  const kind = lay.kind;
  const R = lay.rect;
  const st = stream(seed, key, TAG.P_PLAZA);
  const dk = plan.districts.districtAt(bi * GRID + 40, bj * GRID + 40);
  const cx = Math.floor((R.x0 + R.x1) / 2);
  const cz = Math.floor((R.z0 + R.z1) / 2);
  const inGate = (x, z) => Math.abs(x) <= 18 && Math.abs(z) <= 18;
  const add = (k, x, z, yaw, variant, y) => {
    if (kind === BK.CENTRAL && inGate(x, z)) return;
    out.props.push(mkProp(21000 + key, out.slotN++, k, x + 0.5, y === undefined ? 64 : y, z + 0.5, yaw, variant));
  };
  if (kind !== BK.PARKUR) {
    // meydan/park aydınlatması: 24'lük ızgara (terminal/çeşme çevresi hariç)
    for (let gx = R.x0 + 12; gx < R.x1 - 6; gx += 24) {
      for (let gz = R.z0 + 12; gz < R.z1 - 6; gz += 24) {
        if (Math.abs(gx - cx) <= 3 && Math.abs(gz - cz) <= 3) continue;
        if (kind === BK.CENTRAL && inGate(gx, gz) && (Math.abs(gx) <= 4 && Math.abs(gz) <= 4)) continue;
        out.lamps.push(mkProp(22000 + key, out.lampN++, 'lamba', gx + 0.5, 64, gz + 0.5, st.i(4), 0, { side: 'meydan' }));
      }
    }
  }
  if (kind === BK.PARK) {
    out.features.push({ kind: 'yol', x0: cx - 1, x1: cx + 2, z0: R.z0, z1: R.z1 }, { kind: 'yol', x0: R.x0, x1: R.x1, z0: cz - 1, z1: cz + 2 });
    for (let gx = R.x0 + 3; gx < R.x1 - 2; gx += 7) {
      for (let gz = R.z0 + 3; gz < R.z1 - 2; gz += 7) {
        const x = gx + st.r(-1, 1);
        const z = gz + st.r(-1, 1);
        if (Math.abs(x - cx) <= 2 || Math.abs(z - cz) <= 2) continue;
        if (st.f() < 0.78) add('agac', x, z, st.i(4), st.i(8));
      }
    }
    for (let q = 0; q < 6; q++) {
      const horizontal = q % 2 === 0;
      const u = 8 + st.i(Math.max(1, (horizontal ? R.x1 - R.x0 : R.z1 - R.z0) - 16));
      const side = st.chance(0.5) ? 2 : -3;
      if (horizontal) add('bank', R.x0 + u, cz + side, side > 0 ? 0 : 2, st.i(8));
      else add('bank', cx + side, R.z0 + u, side > 0 ? 3 : 1, st.i(8));
    }
    for (let q = 0; q < 5; q++) add('saksi', R.x0 + 4 + st.i(R.x1 - R.x0 - 8), R.z0 + 4 + st.i(R.z1 - R.z0 - 8), 0, st.i(8));
    return;
  }
  if (kind === BK.PARKUR) {
    // 6×6 piramit platform ızgarası: basamaklı yükseklik 1,2,3 (komşu farkı ≤1), 7×7 platform, 3 boşluk
    const n = 6;
    const pitch = 10;
    const ox = Math.floor((R.x0 + R.x1) / 2 - (n * pitch - 3) / 2);
    const oz = Math.floor((R.z0 + R.z1) / 2 - (n * pitch - 3) / 2);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const h = 1 + Math.min(a, n - 1 - a, b, n - 1 - b);
        out.features.push({ kind: 'platform', x0: ox + a * pitch, z0: oz + b * pitch, x1: ox + a * pitch + 7, z1: oz + b * pitch + 7, h });
      }
    }
    add('bank', ox + 2 * pitch + 3, oz + 2 * pitch + 3, 0, 0, 64 + 3);
    return;
  }
  // PLAZA / DPLAZA / CENTRAL: çeşme + ağaç/saksı halkası + banklar
  if (kind !== BK.DPLAZA && kind !== BK.CENTRAL) out.features.push({ kind: 'cesme', x: cx, z: cz, r: 4 });
  for (let gx = R.x0 + 4; gx < R.x1 - 3; gx += 10) {
    for (let gz = R.z0 + 4; gz < R.z1 - 3; gz += 10) {
      if (Math.abs(gx - cx) < 6 && Math.abs(gz - cz) < 6) continue;
      const u = st.f();
      if (u < 0.45) add(dk === 'gece_pazari' ? 'saksi' : 'agac', gx + st.r(-1, 1), gz + st.r(-1, 1), st.i(4), st.i(8));
      else if (u < 0.6) add('saksi', gx, gz, 0, st.i(8));
    }
  }
  for (let q = 0; q < 4; q++) {
    const dx = q < 2 ? (q === 0 ? -5 : 5) : 0;
    const dz = q >= 2 ? (q === 2 ? -5 : 5) : 0;
    add('bank', cx + dx, cz + dz, q === 0 ? 1 : q === 1 ? 3 : q === 2 ? 0 : 2, st.i(8));
  }
  if (kind === BK.DPLAZA || kind === BK.CENTRAL) add('otomat', cx + 6, cz - 6, 3, 0);
}

function hillBlock(plan, bi, bj, out) {
  const seed = plan.seed;
  const hill = plan.hill;
  const st = stream(seed, blockKey(bi, bj), TAG.P_PLAZA + 3);
  hill.levels.forEach((l) => {
    out.features.push({ kind: 'teras', k: l.k, y: l.y, x0: l.x0, z0: l.z0, x1: l.x1, z1: l.z1 });
  });
  hill.stairs.forEach((s) => out.features.push({ kind: 'merdiven', k: s.k, x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, dir: s.dir, y0: s.y0, y1: s.y1 }));
  // her halka: ağaç/saksı/bank (halka genişliği 6; basamak şeridi ve duvar dibi serbest)
  for (let k = 1; k <= 3; k++) {
    const l = hill.levels[k - 1];
    const lo = hill.levels[k]; // bir iç teras
    for (let q = 0; q < 8; q++) {
      const side = q % 4;
      const t = 6 + st.i(Math.max(1, (l.x1 - l.x0) - 12));
      let x;
      let z;
      if (side === 0) { x = l.x0 + t; z = l.z0 + 1; } else if (side === 1) { x = l.x1 - 2; z = l.z0 + t % (l.z1 - l.z0 - 4) + 2; } else if (side === 2) { x = l.x0 + t; z = l.z1 - 2; } else { x = l.x0 + 1; z = l.z0 + t % (l.z1 - l.z0 - 4) + 2; }
      // iç terasın içine düşmesin, basamak şeridine değmesin
      if (x >= lo.x0 - 1 && x < lo.x1 + 1 && z >= lo.z0 - 1 && z < lo.z1 + 1) continue;
      if (hill.stairs.some((s) => x >= s.x0 - 1 && x < s.x1 + 1 && z >= s.z0 - 1 && z < s.z1 + 1)) continue;
      out.props.push(mkProp(21000 + blockKey(bi, bj), out.slotN++, q % 3 === 0 ? 'bank' : q % 3 === 1 ? 'saksi' : 'agac', x + 0.5, l.y, z + 0.5, st.i(4), st.i(8)));
    }
  }
  const top = hill.top;
  out.props.push(mkProp(21000 + blockKey(bi, bj), out.slotN++, 'bank', top.x + 0.5 - 4, top.y, top.z + 0.5, 1, 0));
  out.props.push(mkProp(21000 + blockKey(bi, bj), out.slotN++, 'saksi', top.x + 0.5 + 4, top.y, top.z + 0.5, 0, 1));
}

export function buildBlockPlan(plan, bi, bj) {
  const lay = layoutBlock(plan, bi, bj);
  const out = {
    bi, bj, kind: lay.kind, rect: lay.rect, cell: blockCell(bi, bj), district: lay.district, lots: lay.lots, props: [], streetFurniture: [], lamps: [],
    manholes: [], features: [], corners: [], slotN: 0, lampN: 0,
  };
  for (let q = 0; q < lay.lots.length; q++) {
    const bp = planBuilding(plan, lay.lots[q]);
    for (let p = 0; p < bp.props.length; p++) out.props.push(bp.props[p]);
  }
  furnitureFor(plan, bi, bj, lay, out);
  cornerItems(plan, bi, bj, out);
  terminalItems(plan, bi, bj, out);
  if (lay.kind === BK.PARK || lay.kind === BK.PLAZA || lay.kind === BK.PARKUR || lay.kind === BK.CENTRAL || lay.kind === BK.DPLAZA) openBlock(plan, bi, bj, lay, out);
  else if (lay.kind === BK.HILL) hillBlock(plan, bi, bj, out);
  delete out.slotN;
  delete out.lampN;
  return out;
}
