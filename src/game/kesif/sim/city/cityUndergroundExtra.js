/*
 * KEŞİF sim/city — YERALTI EK MÜHENDİSLİK HACİMLERİ (kanalizasyon kavşak odaları + gizli odalar). Saf, belirlenimci. Paket interiors_d.
 *
 * cityUndergroundPlan.engineeredAt kabuğun (kanalizasyon ±4, metro, lab, kasa) dışına taşan ek hacimleri bu modülden öğrenir
 * (`plan.underground.extraAt(x,y,z)`); böylece "y≤60 taş dışı her blok doğal dolgu DEĞİLDİR" kuralı (cityShell.test) korunur.
 * Bu modül cityUndergroundPlan.js'i İÇE AKTARMAZ (döngü olmasın): sabitler burada ayrıca tutulur, testle eşitlik doğrulanır.
 *
 *  JR = kavşak odası (11×11 temiz, 6 yüksek, kavşak merkezli): tünel kolları açık kalır
 *  HR = gizli oda (30): tünel duvarından yana açılan 8×7×5 oda; kapı 2×3 gizli duvar paneli
 *
 *  sewerExtras(plan) -> {junctions[], hidden[30], boxes[], inside(x,y,z)}     (plan üstünde önbellekli: plan._ugx)
 *  makeExtraAt(plan) -> (x,y,z) => bool
 *
 * Junction = {id, i, j, x, z, clear:{x0,z0,x1,z1}, box:{x0,z0,x1,z1,y0,y1}}                   (yarı açık dikdörtgenler)
 * Hidden   = {id, district, axis:'x'|'z' (hat ekseni), line, side:±1, p, theme, unlock:'tarayici'|'dugme'|'kod',
 *             clear:{x0,z0,x1,z1,y0,y1}, box, door:{u0,cells:[{x,y,z}],axis}, center:{x,y,z}}
 */
import { DISTRICT_KEYS } from './archetypes.js';
import { GRID, GRID_N, hasRow, nodeId } from './cityRoads.js';
import { UT, hh, hi } from './cityContentKit.js';

export const XS = Object.freeze({
  floorY: 31, ceilY: 35, jrHalf: 5, jrH: 6, minR: 130, hrCount: 30, hrW: 8, hrD: 7, hrH: 5, hrMargin: 20, bound: 690,
});
export const HR_THEMES = Object.freeze([
  Object.freeze({ key: 'depo', name: 'Eski Depo' }),
  Object.freeze({ key: 'atolye', name: 'Gizli Atölye' }),
  Object.freeze({ key: 'sera', name: 'Yeraltı Serası' }),
  Object.freeze({ key: 'arsiv', name: 'Kayıt Arşivi' }),
  Object.freeze({ key: 'calisma', name: 'Düşünme Odası' }),
  Object.freeze({ key: 'muzik', name: 'Müzik Kulübesi' }),
]);
/** Metro personel odası: istasyon salonunun yan duvarından açılan 7×9×4 oda (dış 4 istasyon; merkez hariç). */
export const MS = Object.freeze({ floorY: 44, ceilY: 51, w: 7, d: 9, h: 4 });

export const HR_UNLOCKS = Object.freeze(['tarayici', 'dugme', 'kod']);

function junctionsOf(plan) {
  const seed = plan.seed;
  const labs = plan.underground ? plan.underground.labs : [];
  const out = [];
  for (let j = -GRID_N; j <= GRID_N; j++) {
    if (!hasRow(j)) continue;
    for (let i = -GRID_N; i <= GRID_N; i++) {
      const x = i * GRID;
      const z = j * GRID;
      if (x * x + z * z < XS.minR * XS.minR) continue;
      const id = nodeId(i, j);
      if (hh(seed, id, UT.JR_PICK) % 100 >= 40) continue;
      let shaft = false; // lab servis bacası kavşak odasının içine/yakınına düşmesin (oda oyması bacayı silerdi)
      for (let q = 0; q < labs.length && !shaft; q++) if (Math.abs(labs[q].shaft.x - x) <= 9 && Math.abs(labs[q].shaft.z - z) <= 9) shaft = true;
      if (shaft) continue;
      const h = XS.jrHalf;
      out.push({
        id, i, j, x, z,
        clear: { x0: x - h, z0: z - h, x1: x + h + 1, z1: z + h + 1 },
        box: { x0: x - h - 2, z0: z - h - 2, x1: x + h + 3, z1: z + h + 3, y0: XS.floorY - 2, y1: XS.floorY + XS.jrH + 2 },
      });
    }
  }
  return out;
}

/** Hat çizgisi c, hat-boyu konum p, yan s → pocket kutuları (yarı açık). */
export function pocketRects(axis, c, p, s) {
  // v: hat merkezinden dik uzaklık. Kapı hücresi v=3, oda temiz v=4..10; u: p-3 .. p+4
  const vLo = s > 0 ? c + 4 : c - 10;
  const vHi = s > 0 ? c + 11 : c - 3;
  const dLo = s > 0 ? c + 3 : c - 11;
  const dHi = s > 0 ? c + 12 : c - 2;
  const u0 = p - 3;
  const u1 = p + 5;
  const mk = (a0, a1, b0, b1) => (axis === 'z' ? { x0: a0, x1: a1, z0: b0, z1: b1 } : { x0: b0, x1: b1, z0: a0, z1: a1 });
  return {
    clear: mk(vLo, vHi, u0, u1),
    box: mk(dLo, dHi, u0 - 1, u1 + 1),
    doorCells: [0, 1].map((k) => (axis === 'z' ? { x: c + s * 3, z: p + k } : { x: p + k, z: c + s * 3 })),
  };
}

function boxesOverlap(a, b, pad) {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.z0 < b.z1 + pad && b.z0 < a.z1 + pad;
}

function awayFromCrossLines(p) {
  const k = Math.round(p / GRID);
  return Math.abs(p - k * GRID) >= XS.hrMargin;
}

function hiddenOf(plan, junctions) {
  const seed = plan.seed;
  const labs = plan.underground ? plan.underground.labs : [];
  const out = [];
  const taken = [];
  // %40 tarayıcı (12), %30 düğme (9), %30 kod (9): oda sırası hash ile karışır
  const order = [];
  for (let k = 0; k < XS.hrCount; k++) order.push({ k, h: hh(seed, k, UT.HR_UNLOCK) });
  order.sort((a, b) => a.h - b.h || a.k - b.k);
  const kinds = new Array(XS.hrCount);
  order.forEach((e, rank) => { kinds[e.k] = rank < 12 ? 'tarayici' : rank < 21 ? 'dugme' : 'kod'; });
  for (let h = 0; h < XS.hrCount; h++) {
    const want = DISTRICT_KEYS[h % DISTRICT_KEYS.length];
    let got = null;
    for (let t = 0; t < 1600 && !got; t++) {
      const relax = t >= 1200; // son çare: bölge şartsız
      const base = h * 4096 + t;
      const axis = (hh(seed, base, UT.HR_LINE) & 1) === 0 ? 'z' : 'x';
      const li = (hh(seed, base, UT.HR_LINE + 7) % 17) - 8;
      if (axis === 'x' && !hasRow(li)) continue;
      const c = li * GRID;
      const p = -680 + (hh(seed, base, UT.HR_POS) % 1360);
      if (!awayFromCrossLines(p)) continue;
      const s = (hh(seed, base, UT.HR_SIDE) & 1) === 0 ? 1 : -1;
      const R = pocketRects(axis, c, p, s);
      const cx = (R.clear.x0 + R.clear.x1) / 2;
      const cz = (R.clear.z0 + R.clear.z1) / 2;
      if (cx * cx + cz * cz < XS.minR * XS.minR) continue;
      const bx = R.box;
      if (bx.x0 < -XS.bound || bx.x1 > XS.bound || bx.z0 < -XS.bound || bx.z1 > XS.bound) continue;
      const dk = plan.districts.districtAt(cx, cz);
      if (!relax && dk !== want) continue;
      let bad = false;
      for (let q = 0; q < taken.length && !bad; q++) if (boxesOverlap(bx, taken[q], 6)) bad = true;
      // kavşak odalarına çarpmasın (kutular çakışırsa elenir)
      for (let q = 0; q < junctions.length && !bad; q++) if (boxesOverlap(bx, junctions[q].box, 1)) bad = true;
      // lab servis bacaları aynı hatta yakın olmasın
      for (let q = 0; q < labs.length && !bad; q++) {
        const L = labs[q];
        const along = axis === 'z' ? L.shaft.z : L.shaft.x;
        const across = axis === 'z' ? L.shaft.x : L.shaft.z;
        if (Math.abs(across - c) <= 6 && Math.abs(along - p) < 9) bad = true;
      }
      if (bad) continue;
      got = { axis, c, p, s, R, dk };
    }
    if (!got) throw new Error('gizli oda yerleştirilemedi: #' + h);
    const R = got.R;
    taken.push(R.box);
    out.push({
      id: h,
      district: got.dk,
      axis: got.axis,
      line: got.c,
      side: got.s,
      p: got.p,
      theme: (h + hi(seed, h, UT.HR_THEME, 6)) % HR_THEMES.length,
      unlock: kinds[h],
      clear: Object.assign({ y0: XS.floorY, y1: XS.floorY + XS.hrH }, R.clear),
      box: Object.assign({ y0: XS.floorY - 2, y1: XS.floorY + XS.hrH + 2 }, R.box),
      door: { cells: R.doorCells.map((q) => ({ x: q.x, z: q.z })), axis: got.axis },
      center: { x: Math.floor((R.clear.x0 + R.clear.x1) / 2), y: XS.floorY, z: Math.floor((R.clear.z0 + R.clear.z1) / 2) },
    });
  }
  return out;
}

function staffOf(plan) {
  const seed = plan.seed;
  const sts = plan.underground.metro.stations;
  const out = [];
  for (let k = 0; k < sts.length; k++) {
    const st = sts[k];
    if (st.central || !st.boxes.length) continue;
    const b = st.boxes[0];
    const axis = b.x1 - b.x0 < b.z1 - b.z0 ? 'z' : 'x';
    const c = axis === 'z' ? st.x : st.z; // hat ekseni sabit koordinatı
    const ac = axis === 'z' ? st.z : st.x; // salon ortası (hat boyunca)
    const s = (hh(seed, st.id, UT.MT_SIDE) & 1) === 0 ? 1 : -1;
    const cell = (u, t) => (axis === 'z' ? [c + s * u, ac + t] : [ac + t, c + s * u]);
    const rect = (u0, u1, t0, t1) => {
      const a = cell(u0, t0);
      const b2 = cell(u1 - 1, t1 - 1);
      return { x0: Math.min(a[0], b2[0]), x1: Math.max(a[0], b2[0]) + 1, z0: Math.min(a[1], b2[1]), z1: Math.max(a[1], b2[1]) + 1 };
    };
    out.push({
      id: st.id,
      station: st.id,
      axis,
      c,
      ac,
      side: s,
      cell,
      clear: Object.assign({ y0: MS.floorY, y1: MS.floorY + MS.h }, rect(11, 18, -4, 5)),
      box: Object.assign({ y0: MS.floorY - 2, y1: MS.floorY + MS.h + 2 }, rect(10, 19, -5, 6)),
      door: { plane: rect(9, 10, -1, 2), carve: rect(10, 11, -1, 2), axis },
    });
  }
  return out;
}

function buildSpatial(items) {
  const m = new Map();
  for (let i = 0; i < items.length; i++) {
    const b = items[i].box;
    const cx0 = Math.floor(b.x0 / 16);
    const cx1 = Math.floor((b.x1 - 1) / 16);
    const cz0 = Math.floor(b.z0 / 16);
    const cz1 = Math.floor((b.z1 - 1) / 16);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = cx + ',' + cz;
        let l = m.get(k);
        if (!l) {
          l = [];
          m.set(k, l);
        }
        l.push(items[i]);
      }
    }
  }
  return m;
}

/** Kavşak odaları + gizli odalar + engineered kutuları; plan üstünde önbellekli. chunkIndex: Map("cx,cz") → [{type:'jr'|'hr', ref, box}]. */
export function sewerExtras(plan) {
  if (plan._ugx) return plan._ugx;
  const junctions = junctionsOf(plan);
  const hidden = hiddenOf(plan, junctions);
  const boxes = [];
  const items = [];
  for (let i = 0; i < junctions.length; i++) {
    boxes.push(junctions[i].box);
    items.push({ type: 'jr', ref: junctions[i], box: junctions[i].box });
  }
  for (let i = 0; i < hidden.length; i++) {
    boxes.push(hidden[i].box);
    items.push({ type: 'hr', ref: hidden[i], box: hidden[i].box });
  }
  const staff = staffOf(plan);
  for (let i = 0; i < staff.length; i++) {
    boxes.push(staff[i].box);
    items.push({ type: 'ms', ref: staff[i], box: staff[i].box });
  }
  const sp = buildSpatial(items);
  const insideFn = (x, y, z) => {
    const l = sp.get((x >> 4) + ',' + (z >> 4));
    if (!l) return false;
    for (let q = 0; q < l.length; q++) {
      const b = l[q].box;
      if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1 && y >= b.y0 && y < b.y1) return true;
    }
    return false;
  };
  /** [x0,x1)×[z0,z1) (+pad) penceresine değen öğeler (yinesiz, sabit sıra). Pencere birden çok chunk olabilir (testlerdeki büyük yazıcı). */
  const itemsIn = (x0, z0, x1, z1, pad) => {
    const p = pad || 0;
    const out = [];
    const seen = new Set();
    for (let cz = (z0 - p) >> 4; cz <= (z1 - 1 + p) >> 4; cz++) {
      for (let cx = (x0 - p) >> 4; cx <= (x1 - 1 + p) >> 4; cx++) {
        const l = sp.get(cx + ',' + cz);
        if (!l) continue;
        for (let q = 0; q < l.length; q++) {
          if (!seen.has(l[q])) {
            seen.add(l[q]);
            out.push(l[q]);
          }
        }
      }
    }
    return out;
  };
  const ex = { junctions, hidden, staff, boxes, inside: insideFn, chunkIndex: sp, itemsIn };
  Object.defineProperty(plan, '_ugx', { value: ex, enumerable: false, configurable: true, writable: true });
  return ex;
}

/** engineeredAt kancası: plan.underground.extraAt = makeExtraAt(plan). Hesap ilk çağrıda yapılır (tembel). */
export function makeExtraAt(plan) {
  return (x, y, z) => {
    if (y < XS.floorY - 2 || y > MS.floorY + MS.h + 2) return false;
    if (y > XS.floorY + XS.jrH + 2 && y < MS.floorY - 2) return false;
    return sewerExtras(plan).inside(x, y, z);
  };
}
