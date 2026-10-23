/*
 * KEŞİF sim/city — ÇATI PARKURU İÇERİĞİ (8 rota; Faz 2, interiors_d). Saf, belirlenimci; yalnız pencere (chunk dilimi) içini yazar.
 * cityRaces.buildRoofRoutes iskelet verir (6–10 kontrol, boşluk ≤3, fark ≤+1, aynı kat sayısı); burada fizikle kanıtlanan hâli:
 *   - SIÇRAMA kuralı (gerçek fizik, PLAYER sabitleri): yürüyerek boşluk ≤2 (fark ≤0) / ≤1 (fark +1); daha geniş boşluklar TAHTA PLAK çıkıntıyla
 *     daraltılır (kenardan e = boşluk − (fark>0 ? 1 : 2) hücre, 3 geniş, çatı seviyesinde) → her sıçrama sprintsiz de geçilebilir
 *   - kontrol noktası: kat zemini yerine neon karo (3×3 halka) ; bitişte ödül sandığı (119) + ışık sütunu + kemer
 *   - rezerv şeritleri: kontrol merkezinden komşu çatıya 3 geniş boş şerit (süsler asla kapatmaz)
 *   - isteğe bağlı KISAYOLLAR: kanca kristali (hedef çatının üstünde 4 blok, ametist+neon) ve süzülme kulesi (bitiş çatısında 8 yüksek, merdivenli, 3×3 güverte)
 *
 *  roofRouteContent(plan) → [{id, lots, start:{x,y,z,top}, pads[], hops[], finish, alt:{grapple[], glide}, lanes:Map(lotId → rect[])}]
 *  emitRouteLot(w, plan, lot, bp)    bir parselin rota öğeleri (karo, çıkıntı, bitiş, kule); parsel dışına ≤4 taşar (ledge)
 *  reachHop(gap, dy, mode)           analitik sıçrama modeli (testlerde fizik sonucuyla karşılaştırılır)
 *  ledgeLen(gap, dy)                 gereken çıkıntı hücre sayısı
 */
import { B } from '../blocks.js';
import { ID } from './cityEmit.js';
import { planBuilding } from './buildingPlan.js';
import { lotById } from './cityLots.js';

/** Yürüyerek geçilebilir etkin boşluk: fark ≤0 → ≤2; fark +1 → ≤1. */
export function reachHop(gap, dy, mode) {
  if (dy > 1) return false;
  if (mode === 'run') return gap <= (dy > 0 ? 2 : 3);
  return gap <= (dy > 0 ? 1 : 2);
}

export function ledgeLen(gap, dy) {
  return Math.max(0, gap - (dy > 0 ? 1 : 2));
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function rectOfBp(bp) {
  return { x0: bp.x0, z0: bp.z0, x1: bp.x0 + bp.w, z1: bp.z0 + bp.d };
}

/** Düz L şerit: a→b (hücre merkezleri), önce x sonra z; genişlik 3 (±1). Dikdörtgen listesi [x0,z0,x1,z1) döner. */
function laneL(ax, az, bx, bz) {
  const rs = [];
  const x0 = Math.min(ax, bx);
  const x1 = Math.max(ax, bx);
  const z0 = Math.min(az, bz);
  const z1 = Math.max(az, bz);
  rs.push({ x0, x1: x1 + 1, z0: az - 1, z1: az + 2 });
  rs.push({ x0: bx - 1, x1: bx + 2, z0, z1: z1 + 1 });
  return rs;
}

/** Merkezden komşu yönündeki kenara düz şerit (3 geniş). */
function laneTo(fp, cx, cz, tx, tz) {
  const dx = tx - cx;
  const dz = tz - cz;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? { x0: cx - 1, x1: fp.x1, z0: cz - 1, z1: cz + 2 } : { x0: fp.x0, x1: cx + 2, z0: cz - 1, z1: cz + 2 };
  }
  return dz >= 0 ? { x0: cx - 1, x1: cx + 2, z0: cz - 1, z1: fp.z1 } : { x0: cx - 1, x1: cx + 2, z0: fp.z0, z1: cz + 2 };
}

/**
 * Sıçrama şeridi (3 geniş): merkezden yanal koordinata (lat) yürü, sonra kenara dik (eksen yönü dir) kenara varana dek. fp: parsel ayak izi.
 * axis 'x': kenar = dir>0 ? fp.x1−1 : fp.x0; yanal koordinat z. axis 'z': tersi.
 */
function laneHop(fp, cx, cz, axis, dir, lat) {
  const rs = [];
  if (axis === 'x') {
    const edge = dir > 0 ? fp.x1 - 1 : fp.x0;
    rs.push({ x0: cx - 1, x1: cx + 2, z0: Math.min(cz, lat) - 1, z1: Math.max(cz, lat) + 2 });
    rs.push({ x0: Math.min(cx, edge), x1: Math.max(cx, edge) + 1, z0: lat - 1, z1: lat + 2 });
  } else {
    const edge = dir > 0 ? fp.z1 - 1 : fp.z0;
    rs.push({ x0: Math.min(cx, lat) - 1, x1: Math.max(cx, lat) + 2, z0: cz - 1, z1: cz + 2 });
    rs.push({ x0: lat - 1, x1: lat + 2, z0: Math.min(cz, edge), z1: Math.max(cz, edge) + 1 });
  }
  return rs;
}

/** İki çatı arasındaki sıçrama: {axis, sgn, gap, dy, ledge:{cells[], y}|null} — A'dan B'ye. */
function hopOf(A, B2) {
  const gx = Math.max(0, Math.max(A.x0, B2.x0) - Math.min(A.x1, B2.x1));
  const gz = Math.max(0, Math.max(A.z0, B2.z0) - Math.min(A.z1, B2.z1));
  const dy = B2.y - A.y;
  if (gx === 0 && gz === 0) return { axis: null, sgn: 0, gap: 0, dy, ledge: null, same: A.lot === B2.lot, diag: false };
  if (gx > 0 && gz > 0) return { axis: null, sgn: 0, gap: Math.max(gx, gz), dy, ledge: null, same: false, diag: true };
  const axis = gx > 0 ? 'x' : 'z';
  const gap = gx > 0 ? gx : gz;
  const sgn = axis === 'x' ? (B2.x0 >= A.x1 ? 1 : -1) : (B2.z0 >= A.z1 ? 1 : -1);
  const e = ledgeLen(gap, dy);
  let ledge = null;
  const lo = axis === 'x' ? Math.max(A.z0, B2.z0) : Math.max(A.x0, B2.x0);
  const hi = axis === 'x' ? Math.min(A.z1, B2.z1) : Math.min(A.x1, B2.x1);
  const mid = Math.floor((lo + hi) / 2);
  if (e > 0) {
    const a0 = clamp(mid - 1, lo, hi - 1);
    const a1 = clamp(mid + 2, lo + 1, hi);
    const edge = axis === 'x' ? (sgn > 0 ? A.x1 : A.x0 - 1) : (sgn > 0 ? A.z1 : A.z0 - 1);
    const cells = [];
    for (let k = 0; k < e; k++) {
      const c = edge + sgn * k;
      for (let a = a0; a < a1; a++) cells.push(axis === 'x' ? { x: c, z: a } : { x: a, z: c });
    }
    ledge = { cells, y: A.y - 1, axis, sgn, e };
  }
  return {
    axis, sgn, gap, dy, ledge, same: false, diag: false, lat: mid,
  };
}

/** Bitiş: son çatının merkezine göre gelen yönün karşısında sandık, yanında ışık sütunu; kule köşede. */
function finishOf(fp, prev, y) {
  const cx = Math.floor((fp.x0 + fp.x1) / 2);
  const cz = Math.floor((fp.z0 + fp.z1) / 2);
  const dx = prev ? cx - Math.floor((prev.x0 + prev.x1) / 2) : 1;
  const dz = prev ? cz - Math.floor((prev.z0 + prev.z1) / 2) : 0;
  const inAxisX = Math.abs(dx) >= Math.abs(dz);
  const sx = inAxisX ? (dx >= 0 ? 1 : -1) : 0; // gelişin yönü (A→B) — sandık ileride
  const sz = inAxisX ? 0 : (dz >= 0 ? 1 : -1);
  const reach = Math.min((fp.x1 - fp.x0) / 2 - 2, (fp.z1 - fp.z0) / 2 - 2);
  const off = Math.max(2, Math.min(3, Math.floor(reach)));
  const chest = { x: cx + sx * off, y, z: cz + sz * off };
  const beacon = { x: cx + sx * off + (inAxisX ? 0 : 2), z: cz + sz * off + (inAxisX ? 2 : 0) };
  // süzülme kulesi: köşede (gelen şerit ve sandık dışında): geri köşe, ön yüzü açık
  const tx = inAxisX ? (sx > 0 ? fp.x0 + 3 : fp.x1 - 4) : fp.x0 + 3;
  const tz = inAxisX ? fp.z0 + 3 : (sz > 0 ? fp.z0 + 3 : fp.z1 - 4);
  return {
    chest, beacon, center: { x: cx, z: cz }, dir: { x: sx, z: sz }, pylon: { x: tx, z: tz, y },
  };
}

function build(plan) {
  const routes = [];
  for (let r = 0; r < plan.roofRoutes.length; r++) {
    const R = plan.roofRoutes[r];
    const lotIds = [];
    R.pads.forEach((p) => { if (lotIds.indexOf(p.lot) < 0) lotIds.push(p.lot); });
    const bps = {};
    lotIds.forEach((id) => { bps[id] = planBuilding(plan, lotById(plan, id)); });
    const lanes = new Map();
    const addLane = (id, rect) => {
      let l = lanes.get(id);
      if (!l) {
        l = [];
        lanes.set(id, l);
      }
      l.push(rect);
    };
    const hops = [];
    for (let i = 0; i + 1 < R.pads.length; i++) {
      const A = R.pads[i];
      const B2 = R.pads[i + 1];
      const h = hopOf(A, B2);
      h.a = i;
      h.b = i + 1;
      hops.push(h);
      const fa = rectOfBp(bps[A.lot]);
      const fb = rectOfBp(bps[B2.lot]);
      const ca = { x: Math.floor(A.x), z: Math.floor(A.z) };
      const cb = { x: Math.floor(B2.x), z: Math.floor(B2.z) };
      if (A.lot !== B2.lot) {
        if (h.axis) {
          laneHop(fa, ca.x, ca.z, h.axis, h.sgn, h.lat).forEach((rc) => addLane(A.lot, rc));
          laneHop(fb, cb.x, cb.z, h.axis, -h.sgn, h.lat).forEach((rc) => addLane(B2.lot, rc));
        } else {
          addLane(A.lot, laneTo(fa, ca.x, ca.z, cb.x, cb.z));
          addLane(B2.lot, laneTo(fb, cb.x, cb.z, ca.x, ca.z));
        }
      } else {
        addLane(A.lot, { x0: Math.min(ca.x, cb.x) - 1, x1: Math.max(ca.x, cb.x) + 2, z0: Math.min(ca.z, cb.z) - 1, z1: Math.max(ca.z, cb.z) + 2 });
      }
    }
    // başlangıç: dış merdiven tepesi → merkez
    const first = R.pads[0];
    const bp0 = bps[first.lot];
    const stair = bp0.extStair;
    const top = stair ? { x: stair.top.x, z: stair.top.z, y: stair.top.y } : null;
    if (top) {
      const c0 = { x: Math.floor(first.x), z: Math.floor(first.z) };
      laneL(top.x, top.z, c0.x, c0.z).forEach((rc) => addLane(first.lot, rc));
    }
    // bitiş
    const last = R.pads[R.pads.length - 1];
    const prevPad = R.pads.length > 1 ? R.pads[R.pads.length - 2] : null;
    const bpl = bps[last.lot];
    const fin = finishOf(rectOfBp(bpl), prevPad, last.y);
    // kısayollar
    const grapple = [];
    let best = -1;
    for (let i = 0; i < hops.length; i++) {
      const h = hops[i];
      if (!h.same && !h.diag && h.gap >= 2 && (best < 0 || h.gap > hops[best].gap)) best = i;
    }
    if (best >= 0) {
      const h = hops[best];
      const A = R.pads[h.a];
      const B2 = R.pads[h.b];
      // anchor: hedef çatının A'ya bakan kenarından 3 içeride, yanal olarak ortak aralığın ortasında, çatıdan 4 yukarıda
      const lo = h.axis === 'x' ? Math.max(A.z0, B2.z0) : Math.max(A.x0, B2.x0);
      const hi2 = h.axis === 'x' ? Math.min(A.z1, B2.z1) : Math.min(A.x1, B2.x1);
      const mid = Math.floor((lo + hi2) / 2);
      const ax = h.axis === 'x' ? (h.sgn > 0 ? B2.x0 + 3 : B2.x1 - 4) : mid;
      const az = h.axis === 'x' ? mid : (h.sgn > 0 ? B2.z0 + 3 : B2.z1 - 4);
      grapple.push({ hop: best, from: h.a, to: h.b, anchor: { x: ax, y: B2.y + 4, z: az } });
    }
    routes.push({
      id: R.id, district: R.district, lots: lotIds, bps, start: { x: R.start.x, y: R.start.y, z: R.start.z, top, lot: first.lot }, pads: R.pads, hops, finish: Object.assign(fin, { lot: last.lot }),
      alt: { grapple, glide: { pylon: fin.pylon, lot: last.lot, toStart: { x: R.start.x, y: R.start.y, z: R.start.z } } }, lanes,
    });
  }
  return routes;
}

export function roofRouteContent(plan) {
  if (plan._ugRoutes) return plan._ugRoutes;
  const v = build(plan);
  Object.defineProperty(plan, '_ugRoutes', { value: v, enumerable: false, configurable: true, writable: true });
  return v;
}

/** Parsel kimliği → {route, index(ler)}; yazıcı hızlı arama. */
export function routeOfLot(plan, lotId) {
  let m = plan._ugRouteIdx;
  if (!m) {
    m = new Map();
    roofRouteContent(plan).forEach((R) => R.lots.forEach((id) => m.set(id, R)));
    Object.defineProperty(plan, '_ugRouteIdx', { value: m, enumerable: false, configurable: true, writable: true });
  }
  return m.get(lotId) || null;
}

/* ------------------------------------------------------------------------------------------------
 * Emisyon
 * ---------------------------------------------------------------------------------------------- */
function padTile(w, cx, cz, y, finish) {
  // y: kat zemini bloğu (çatı bloğu satırı). 3×3: halka koyu, merkez neon
  if (!w.touches(cx - 1, cz - 1, cx + 2, cz + 2)) return;
  w.box(cx - 1, y, cz - 1, cx + 2, y + 1, cz + 2, ID.FACADE_DARK);
  w.set(cx, y, cz, finish ? ID.NEON_PINK : ID.NEON_CYAN);
  w.set(cx - 1, y, cz, ID.NEON_LIME);
  w.set(cx + 1, y, cz, ID.NEON_LIME);
  w.set(cx, y, cz - 1, ID.NEON_LIME);
  w.set(cx, y, cz + 1, ID.NEON_LIME);
}

function emitLedge(w, led) {
  for (let i = 0; i < led.cells.length; i++) {
    const c = led.cells[i];
    if (c.x < w.x0 || c.x >= w.x1 || c.z < w.z0 || c.z >= w.z1) continue;
    w.set(c.x, led.y, c.z, B.PLANKS_OAK);
    // alttan demir braket (görsel)
    w.set(c.x, led.y - 1, c.z, ID.IRON);
  }
}

function emitFinish(w, fin, y) {
  const c = fin.chest;
  if (w.touches(c.x - 2, c.z - 2, c.x + 3, c.z + 3)) {
    w.box(c.x - 1, y - 1, c.z - 1, c.x + 2, y, c.z + 2, ID.POLISHED);
    w.set(c.x, y - 1, c.z, ID.NEON_PINK);
    w.set(c.x, y, c.z, B.REWARD_CHEST);
  }
  const b = fin.beacon;
  if (w.touches(b.x, b.z, b.x + 1, b.z + 1)) {
    w.col(b.x, b.z, y, y + 3, ID.IRON);
    w.col(b.x, b.z, y + 3, y + 7, ID.NEON_PINK);
  }
}

function emitPylon(w, fin, y) {
  const p = fin.pylon;
  if (!w.touches(p.x - 2, p.z - 2, p.x + 3, p.z + 3)) return;
  const H = 8; // güverte bloğu y+H−1; ayakta durulan seviye y+H (y: ayak seviyesi)
  w.col(p.x, p.z, y, y + H, ID.IRON);
  // merdiven: batı yüzünde (x−1), güverteyi delerek y+H'ye kadar
  w.col(p.x - 1, p.z, y, y + H + 1, B.LADDER);
  w.box(p.x - 1, y + H - 1, p.z - 1, p.x + 2, y + H, p.z + 2, B.PLANKS_OAK);
  w.set(p.x - 1, y + H - 1, p.z, B.LADDER);
  // korkuluk: kuzey, güney, batı köşeleri; doğu yüzü AÇIK (süzülme çıkışı)
  for (let k = -1; k <= 1; k++) {
    w.set(p.x + k, y + H, p.z - 1, B.FENCE);
    w.set(p.x + k, y + H, p.z + 1, B.FENCE);
  }
  w.set(p.x - 1, y + H, p.z - 1, ID.NEON_CYAN);
  w.set(p.x - 1, y + H, p.z + 1, ID.NEON_CYAN);
}

const FACE_VEC = Object.freeze({ n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] });

/** Parkur başlangıcı: dış merdivenin sokak tarafındaki ilk basamağın önüne 3 hücrelik neon zemin işareti (kaldırım/zemin bloğunun yerine). */
function emitStartMarker(w, bp) {
  const st = bp.extStair;
  if (!st || !st.flights.length) return;
  const f0 = st.flights[0];
  const fv = FACE_VEC[st.face];
  if (!fv) return;
  const cx = f0.x + fv[0] * 2;
  const cz = f0.z + fv[1] * 2;
  if (!w.touches(cx - 1, cz - 1, cx + 2, cz + 2)) return;
  for (let k = -1; k <= 1; k++) {
    const x = fv[0] !== 0 ? cx : cx + k;
    const z = fv[0] !== 0 ? cz + k : cz;
    if (x < w.x0 || x >= w.x1 || z < w.z0 || z >= w.z1) continue;
    const under = w.get(x, 63, z);
    if (under === 0 || under === B.WATER || w.get(x, 64, z) !== 0) continue;
    w.set(x, 63, z, k === 0 ? ID.NEON_LIME : ID.NEON_CYAN);
  }
}

/** Bir rota parselinin öğeleri: kat karoları, çıkıntılar, bitiş, süzülme kulesi, kanca kristalleri; çatı eğimlerini düzler. */
export function emitRouteLot(w, plan, lot, bp) {
  const R = routeOfLot(plan, lot.id);
  if (!R) return;
  const y = bp.roof.y - 1; // çatı bloğu satırı
  const fp = rectOfBp(bp);
  // eğimli çatı (ev) düzlenir: kabuğun kırmızı kademeleri kaldırılır
  if (bp.roof.kind === 'egimli' && w.touches(fp.x0, fp.z0, fp.x1, fp.z1)) w.box(fp.x0, y + 1, fp.z0, fp.x1, y + 3, fp.z1, 0);
  if (R.pads[0].lot === lot.id) emitStartMarker(w, bp);
  for (let i = 0; i < R.pads.length; i++) {
    const p = R.pads[i];
    if (p.lot !== lot.id) continue;
    padTile(w, Math.floor(p.x), Math.floor(p.z), y, p === R.pads[R.pads.length - 1]);
  }
  for (let i = 0; i < R.hops.length; i++) {
    const h = R.hops[i];
    if (h.ledge && R.pads[h.a].lot === lot.id) emitLedge(w, h.ledge);
  }
  if (R.finish.lot === lot.id) {
    emitFinish(w, R.finish, y + 1);
    emitPylon(w, R.finish, y + 1);
  }
  for (let i = 0; i < R.alt.grapple.length; i++) {
    const g = R.alt.grapple[i];
    if (R.pads[g.to].lot !== lot.id) continue;
    const a = g.anchor;
    if (!w.touches(a.x, a.z, a.x + 1, a.z + 1)) continue;
    w.set(a.x, a.y, a.z, B.AMETHYST);
    w.set(a.x, a.y + 1, a.z, ID.NEON_CYAN);
  }
}
