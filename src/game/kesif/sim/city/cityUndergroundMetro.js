/*
 * KEŞİF sim/city — METRO İÇERİĞİ (Faz 2, interiors_d). Saf, belirlenimci; yalnız pencere (chunk dilimi) içini yazar.
 * Kabuk (hat tünelleri, 17×56 istasyon salonları, 10+10 basamaklı girişler) olduğu gibi kalır; burada:
 *   - istasyon duvarı: koyu etek + hat rengi bant + camgöbeği kesik çizgi, İSTASYON ADI (3×5 piksel neon yazı) + hat etiketi
 *   - durmuş tren (voksel; 'metro_tren' dekoru): 28 uzun, 3 vagon, kapılar açık, içi yürünür (merkez istasyonda yok)
 *   - bilet kapıları (AÇIK): her giriş bağlantısının önünde iki direk, geçit 2 geniş
 *   - personel odası (dış 4 istasyon): salon yan duvarından 3×3 sürgülü kapı (239) + 7×9×4 oda; birinde Kart-1 okuyucu
 *
 *  emitMetroContent(w, plan)
 *  metroPropSpecs(plan, rect, out)        peron sırası, otomat, bilgi terminali, personel odası eşyaları
 *  metroStaffLockPlan(plan, st)           → {lock|null, reader?}
 *  METRO_NAMES                            istasyon adları (Türkçe)
 */
import { B } from '../blocks.js';
import { ID } from './cityEmit.js';
import { MS, sewerExtras } from './cityUndergroundExtra.js';
import {
  PSEUDO, UT, drawText, hh, mkLock, mkSpec, textWidth,
} from './cityContentKit.js';

const FY = MS.floorY; // 44 ayak
const CEIL = 51;
const LINE_BLOCK = Object.freeze({ mor: B.CONCRETE_PURPLE, turuncu: B.CONCRETE_ORANGE });
const LINE_NEON = Object.freeze({ mor: ID.NEON_PINK, turuncu: ID.NEON_AMBER });
const LINE_NAME = Object.freeze({ mor: 'M1', turuncu: 'M2' });

/** İstasyon adı: merkez, güney (z>0), kuzey, doğu, batı. */
export function stationName(st) {
  if (st.central) return 'MERKEZ';
  if (st.x === 0) return st.z > 0 ? 'GÜNEY' : 'KUZEY';
  return st.x > 0 ? 'DOĞU' : 'BATI';
}
export const METRO_NAMES = Object.freeze(['MERKEZ', 'GÜNEY', 'KUZEY', 'DOĞU', 'BATI']);

function hallAxis(b) {
  return b.x1 - b.x0 < b.z1 - b.z0 ? 'z' : 'x';
}

/** Yalnız FACADE_LIGHT (salon duvarı) hücresini boyar. */
function wallPaint(w, x, y, z, id) {
  if (w.get(x, y, z) === ID.FACADE_LIGHT) w.set(x, y, z, id);
}

/* ------------------------------------------------------------------------------------------------
 * Salon duvarı: etek + bant + kesik neon + isim levhası
 * ---------------------------------------------------------------------------------------------- */
function hallWalls(w, st, b, line) {
  const axis = hallAxis(b);
  const c = axis === 'z' ? st.x : st.z;
  const a0 = axis === 'z' ? b.z0 : b.x0;
  const a1 = axis === 'z' ? b.z1 : b.x1;
  const band = LINE_BLOCK[line] || B.CONCRETE_PURPLE;
  for (let sd = -1; sd <= 1; sd += 2) {
    const wc = c + sd * 9; // duvar sütunu (salonun içinden görünen kenar hücresi)
    for (let a = Math.max(a0, axis === 'z' ? w.z0 : w.x0); a < Math.min(a1, axis === 'z' ? w.z1 : w.x1); a++) {
      const x = axis === 'z' ? wc : a;
      const z = axis === 'z' ? a : wc;
      wallPaint(w, x, FY, z, ID.FACADE_DARK);
      wallPaint(w, x, FY + 1, z, ID.FACADE_DARK);
      wallPaint(w, x, FY + 2, z, band);
      if (((a - a0) & 3) < 2) wallPaint(w, x, FY + 3, z, ID.NEON_CYAN);
    }
  }
}

function signs(w, st, b, line) {
  const axis = hallAxis(b);
  const c = axis === 'z' ? st.x : st.z;
  const a0 = axis === 'z' ? b.z0 : b.x0;
  const a1 = axis === 'z' ? b.z1 : b.x1;
  const mid = Math.floor((a0 + a1) / 2);
  const entries = [
    { txt: stationName(st), at: mid, blk: LINE_NEON[line] || ID.NEON_CYAN },
    { txt: LINE_NAME[line] || 'M1', at: mid - 21, blk: LINE_NEON[line] || ID.NEON_CYAN },
    { txt: LINE_NAME[line] || 'M1', at: mid + 21, blk: LINE_NEON[line] || ID.NEON_CYAN },
  ];
  for (let sd = -1; sd <= 1; sd += 2) {
    const wc = c + sd * 9;
    // yazı yönü: izleyicinin sağı (bkz. üst yorum): batı duvarı −z, doğu +z, kuzey duvarı +x, güney −x
    const dir = axis === 'z' ? (sd < 0 ? -1 : 1) : (sd < 0 ? 1 : -1);
    for (let q = 0; q < entries.length; q++) {
      const e = entries[q];
      const wdt = textWidth(e.txt);
      const px0 = e.at - Math.floor(wdt / 2) - 2;
      const px1 = px0 + wdt + 4;
      if (axis === 'z' ? !w.touches(wc, px0, wc + 1, px1) : !w.touches(px0, wc, px1, wc + 1)) continue;
      // levha: y46..52 koyu zemin
      for (let a = Math.max(px0, axis === 'z' ? w.z0 : w.x0); a < Math.min(px1, axis === 'z' ? w.z1 : w.x1); a++) {
        const x = axis === 'z' ? wc : a;
        const z = axis === 'z' ? a : wc;
        for (let y = FY + 2; y <= FY + 8; y++) wallPaint(w, x, y, z, ID.FACADE_DARK);
      }
      const start = dir > 0 ? e.at - Math.floor(wdt / 2) : e.at + Math.floor(wdt / 2);
      drawText(w, e.txt, {
        x: axis === 'z' ? wc : start, y: FY + 2, z: axis === 'z' ? start : wc, axis: axis === 'z' ? 'z' : 'x', dir, block: e.blk, keep: (id) => id === 0,
      });
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Tren
 * ---------------------------------------------------------------------------------------------- */
export const TRAIN = Object.freeze({ len: 28, doors: [4, 5, 13, 14, 22, 23] });

/** Tren yerleşimi: {axis, c, a0 (başlangıç hücresi), len} | null (merkez istasyonda yok). */
export function trainOf(st, b) {
  if (st.central) return null;
  const axis = hallAxis(b);
  const c = axis === 'z' ? st.x : st.z;
  const a0 = (axis === 'z' ? b.z0 : b.x0) + 14;
  return { axis, c, a0, len: TRAIN.len };
}

function emitTrain(w, tr, line) {
  const ax = tr.axis === 'z';
  const lo = ax ? w.z0 : w.x0;
  const hi = ax ? w.z1 : w.x1;
  if (ax ? !w.touches(tr.c - 2, tr.a0, tr.c + 3, tr.a0 + tr.len) : !w.touches(tr.a0, tr.c - 2, tr.a0 + tr.len, tr.c + 3)) return;
  const stripe = LINE_BLOCK[line] || B.CONCRETE_PURPLE;
  const seat = line === 'turuncu' ? B.CLOTH_ORANGE : B.CLOTH_PURPLE;
  const doors = TRAIN.doors;
  for (let t = Math.max(0, lo - tr.a0); t < Math.min(tr.len, hi - tr.a0); t++) {
    const a = tr.a0 + t;
    const isDoor = doors.indexOf(t) >= 0;
    const nearDoor = isDoor || doors.indexOf(t - 1) >= 0 || doors.indexOf(t + 1) >= 0;
    const end = t === 0 || t === tr.len - 1;
    for (let d = -2; d <= 2; d++) {
      const x = ax ? tr.c + d : a;
      const z = ax ? a : tr.c + d;
      const side = d === -2 || d === 2;
      // zemin (y43): tren zemini
      if (Math.abs(d) <= 1) w.set(x, FY - 1, z, ID.FACADE_DARK);
      // çatı
      w.set(x, FY + 3, z, ID.FACADE_LIGHT);
      if (end) {
        for (let y = FY; y <= FY + 2; y++) w.set(x, y, z, ID.FACADE_DARK);
        if (Math.abs(d) === 1) w.set(x, FY + 1, z, t === 0 ? ID.NEON_CYAN : ID.NEON_PINK);
        continue;
      }
      if (side) {
        if (isDoor) {
          for (let y = FY; y <= FY + 2; y++) w.set(x, y, z, 0);
        } else {
          w.set(x, FY, z, ID.FACADE_DARK);
          w.set(x, FY + 1, z, stripe);
          w.set(x, FY + 2, z, (t >> 1) & 1 ? ID.WINDOW_WARM : ID.WINDOW_COOL);
        }
      } else {
        for (let y = FY; y <= FY + 2; y++) w.set(x, y, z, 0);
        // koltuklar (kapılardan uzakta; ortada 1 geniş koridor)
        if (Math.abs(d) === 1 && !nearDoor) w.set(x, FY, z, seat);
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Bilet kapıları (açık): giriş bağlantısının iki yanında direk
 * ---------------------------------------------------------------------------------------------- */
function gates(w, st) {
  for (let e = 0; e < st.entrances.length; e++) {
    const E = st.entrances[e];
    const ux = E.u === 'x';
    const edge = E.su > 0 ? (ux ? st.x : st.z) + 8 : (ux ? st.x : st.z) - 8; // salonun son temiz hücresi
    const u = edge - E.su; // bir hücre içeride
    const v0 = ux ? E.link.z0 : E.link.x0;
    const v1 = ux ? E.link.z1 : E.link.x1;
    for (let k = 0; k < 2; k++) {
      const v = k === 0 ? v0 - 1 : v1;
      const x = ux ? u : v;
      const z = ux ? v : u;
      if (x < w.x0 || x >= w.x1 || z < w.z0 || z >= w.z1) continue;
      if (w.get(x, FY, z) !== 0) continue;
      w.col(x, z, FY, FY + 2, ID.IRON);
      w.set(x, FY + 2, z, ID.NEON_LIME);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Personel odası
 * ---------------------------------------------------------------------------------------------- */
function emitStaff(w, S) {
  const bx = S.box;
  if (!w.touches(bx.x0, bx.z0, bx.x1, bx.z1) || !w.touchesY(bx.y0, bx.y1)) return;
  const R = S.clear;
  // kabuk: duvar halkası (ham taş → açık panel), tavan, temiz hacim, zemin
  const wr = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
  const o = wr(R.x0 - 1, R.z0 - 1, R.x1 + 1, R.z1 + 1);
  w.box(o.x0, FY - 1, o.z0, o.x1, FY + MS.h + 1, o.z1, ID.FACADE_LIGHT);
  w.box(R.x0, FY, R.z0, R.x1, FY + MS.h, R.z1, 0);
  w.box(R.x0, FY - 1, R.z0, R.x1, FY, R.z1, ID.POLISHED);
  // halı + bant
  const A = S.cell(12, -2);
  const A2 = S.cell(16, 2);
  const rx0 = Math.min(A[0], A2[0]);
  const rx1 = Math.max(A[0], A2[0]) + 1;
  const rz0 = Math.min(A[1], A2[1]);
  const rz1 = Math.max(A[1], A2[1]) + 1;
  w.box(rx0, FY - 1, rz0, rx1, FY, rz1, B.CLOTH_BLUE);
  // koridor hücresi (dış duvar kalınlığı) + kapı düzlemi (3×3 sürgülü kapı 239; kapalı)
  const cv = S.door.carve;
  w.box(cv.x0, FY, cv.z0, cv.x1, FY + 3, cv.z1, 0);
  w.box(cv.x0, FY - 1, cv.z0, cv.x1, FY, cv.z1, ID.POLISHED);
  const pl = S.door.plane;
  w.box(pl.x0, FY, pl.z0, pl.x1, FY + 3, pl.z1, ID.DOOR);
  w.box(pl.x0, FY - 1, pl.z0, pl.x1, FY, pl.z1, ID.POLISHED);
  // aydınlatma: 2 lamba (tavan satırına gömülü ışık bloğu)
  const l1 = S.cell(13, -2);
  const l2 = S.cell(16, 2);
  w.set(l1[0], FY + MS.h, l1[1], ID.LIGHT);
  w.set(l2[0], FY + MS.h, l2[1], ID.LIGHT);
  // arka duvar neon şeridi (hat rengi)
  const lineId = S.lineId === 'turuncu' ? ID.NEON_AMBER : ID.NEON_PINK;
  for (let t = -3; t <= 3; t++) {
    const p = S.cell(17, t);
    w.set(p[0], FY + 2, p[1], lineId);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Ana giriş
 * ---------------------------------------------------------------------------------------------- */
function lineOf(st, b) {
  if (st.central) return hallAxis(b) === 'z' ? 'mor' : 'turuncu';
  return st.lines[0];
}

export function emitMetroContent(w, plan) {
  if (!w.touchesY(FY - 2, CEIL + 2)) return;
  const sts = plan.underground.metro.stations;
  for (let s = 0; s < sts.length; s++) {
    const st = sts[s];
    for (let q = 0; q < st.boxes.length; q++) {
      const b = st.boxes[q];
      if (!w.touches(b.x0 - 2, b.z0 - 2, b.x1 + 2, b.z1 + 2)) continue;
      const line = lineOf(st, b);
      hallWalls(w, st, b, line);
      signs(w, st, b, line);
      const tr = trainOf(st, b);
      if (tr) emitTrain(w, tr, line);
    }
    gates(w, st);
  }
  const ex = sewerExtras(plan);
  const l = ex.itemsIn(w.x0, w.z0, w.x1, w.z1, 0);
  if (l) for (let q = 0; q < l.length; q++) if (l[q].type === 'ms') emitStaff(w, Object.assign(l[q].ref, { lineId: sts[l[q].ref.station].lines[0] }));
}

/* ------------------------------------------------------------------------------------------------
 * Kilit planı + proplar
 * ---------------------------------------------------------------------------------------------- */
/** Kart-1 okuyucusu hangi istasyonun personel odasında: dış istasyonlardan hash ile biri. */
export function kartStationId(plan) {
  const st = sewerExtras(plan).staff;
  let best = st[0];
  for (let i = 1; i < st.length; i++) if (hh(plan.seed, st[i].id, UT.MT_STAFF) < hh(plan.seed, best.id, UT.MT_STAFF)) best = st[i];
  return best.id;
}

export function metroStaffLockPlan(plan, S) {
  if (S.id !== kartStationId(plan)) return { lock: null };
  const z = S.axis === 'z';
  const plane = S.side > 0 ? S.c + 9 - 0.0625 : S.c - 8 + 0.0625;
  const al = S.ac + 2.5;
  const rx = z ? plane : al;
  const rz = z ? al : plane;
  const yaw = z ? (S.side > 0 ? 3 : 1) : (S.side > 0 ? 2 : 0);
  return {
    lock: mkLock('ms' + S.id, 'kart', 1, { card: 1, room: 'personel' + S.id, reader: { x: rx, y: FY + 1.25, z: rz } }),
    reader: { x: rx, y: FY + 1.25, z: rz, yaw },
  };
}

const PROP_CACHE = new WeakMap();

function hallProps(plan, st, b) {
  const out = [];
  const axis = hallAxis(b);
  const c = axis === 'z' ? st.x : st.z;
  const ac = axis === 'z' ? st.z : st.x;
  const a0 = axis === 'z' ? b.z0 : b.x0;
  const a1 = axis === 'z' ? b.z1 : b.x1;
  const base = PSEUDO.metro + st.id;
  let slot = axis === 'z' ? 0 : 200;
  // giriş bağlantılarının hat-boyu aralıkları (bank bunları kapatmasın) + merkez istasyonda kesişim alanı
  const linkSpans = [];
  for (let e = 0; e < st.entrances.length; e++) {
    const E = st.entrances[e];
    if ((E.u === 'x') !== (axis === 'z')) continue; // yalnız bu salona açılanlar
    const v0 = axis === 'z' ? E.link.z0 : E.link.x0;
    const v1 = axis === 'z' ? E.link.z1 : E.link.x1;
    linkSpans.push([v0 - 4, v1 + 4]);
  }
  if (st.central) linkSpans.push([ac - 10, ac + 11]);
  else linkSpans.push([ac - 4, ac + 5]); // personel odası kapısı önü
  const free = (lo, hi) => {
    for (let q = 0; q < linkSpans.length; q++) if (lo < linkSpans[q][1] && hi > linkSpans[q][0]) return false;
    return true;
  };
  const mk = (kind, a, d, y, yaw, variant) => {
    const x = axis === 'z' ? c + d : a;
    const z = axis === 'z' ? a : c + d;
    out.push(mkSpec(base, slot++, kind, x, y, z, yaw, variant));
  };
  const faceW = (sd) => (axis === 'z' ? (sd > 0 ? 3 : 1) : (sd > 0 ? 2 : 0)); // duvardan salon ortasına bakış
  const inner = (sd) => (sd > 0 ? 8.55 : -7.55); // duvara yaslı merkez (iç yüz düzlemi: +9 / −8; hat ortası c+0.5)
  for (let sd = -1; sd <= 1; sd += 2) {
    let n = 0;
    for (let a = a0 + 10; a + 3 < a1 - 8 && n < 4; a += 8) {
      if (!free(a - 1, a + 4)) continue;
      const hv = hh(plan.seed, st.id * 64 + a, UT.MT_PROP) % 4;
      if (hv === 3) continue;
      const centerA = a + 1.25;
      if (hv <= 1) mk('bekleme_sirasi', centerA, inner(sd), FY, faceW(sd), hv);
      else mk('ilan_panosu', centerA, sd > 0 ? 8.9375 : -7.9375, FY + 1.25, faceW(sd), 0);
      n++;
    }
  }
  // otomat + bilgi terminali: salon uçlarına yakın, duvar önünde
  const ends = [a0 + 3, a1 - 4];
  for (let q = 0; q < 2; q++) {
    const a = ends[q] + 0.5;
    if (!free(a - 2, a + 2)) continue;
    const sd = q === 0 ? 1 : -1;
    mk(q === 0 ? 'otomat_icecek' : 'otomat_atistirmalik', a, sd > 0 ? 8.45 : -7.45, FY, faceW(sd), 0);
    const at = a + (q === 0 ? 3 : -3);
    if (free(at - 2, at + 2)) mk('bilgi_terminali', at, sd > 0 ? 8.45 : -7.45, FY, faceW(sd), 0);
  }
  return out;
}

function staffProps(plan, S) {
  const out = [];
  const base = PSEUDO.metro + 50 + S.id;
  let slot = 0;
  const z = S.axis === 'z';
  // yerel sürekli koordinat: u = c'den dik uzaklık (hücre u, [u,u+1) ), t = hat boyunca (ac+t)
  const pt = (u, t) => (z ? [S.c + S.side * u + (S.side > 0 ? 0 : 1), S.ac + t] : [S.ac + t, S.c + S.side * u + (S.side > 0 ? 0 : 1)]);
  const toward = z ? (S.side > 0 ? 3 : 1) : (S.side > 0 ? 2 : 0); // kapıya (−u) bakış
  const back = (toward + 2) & 3;
  const facePlusT = z ? 0 : 1;
  const faceMinusT = z ? 2 : 3;
  const place = (kind, u, t, y, yaw, variant, extra) => {
    const p = pt(u, t);
    out.push(mkSpec(base, slot++, kind, p[0], y, p[1], yaw, variant, extra));
  };
  const holder = S.id === kartStationId(plan);
  place('dolap_sirali', 17.6, -2.5, FY, toward, 0, holder ? { gives: 'kart_2' } : null);
  place('dolap_sirali', 17.6, 0.5, FY, toward, 1);
  place('calisma_masasi', 14.0, 4.4, FY, faceMinusT, 0);
  place('sandalye', 14.0, 3.3, FY, facePlusT, 1);
  place('mini_robot', 12.4, -3.3, FY, back, 0);
  place('ilan_panosu', 14.0, -3.9375, FY + 1.25, facePlusT, 0);
  if (holder) place('kod_notu', 12.0, 4.9375, FY + 1.5, faceMinusT, 1);
  return out;
}

function overlapRect(a, r) {
  return a.x0 < r.x1 && a.x1 > r.x0 && a.z0 < r.z1 && a.z1 > r.z0;
}

export function metroPropSpecs(plan, rect, out) {
  const sts = plan.underground.metro.stations;
  for (let s = 0; s < sts.length; s++) {
    const st = sts[s];
    for (let q = 0; q < st.boxes.length; q++) {
      const b = st.boxes[q];
      if (!overlapRect({ x0: b.x0 - 1, z0: b.z0 - 1, x1: b.x1 + 1, z1: b.z1 + 1 }, rect)) continue;
      let list = PROP_CACHE.get(b);
      if (!list) {
        list = hallProps(plan, st, b);
        PROP_CACHE.set(b, list);
      }
      for (let k = 0; k < list.length; k++) out.push(list[k]);
    }
  }
  const ex = sewerExtras(plan);
  for (let i = 0; i < ex.staff.length; i++) {
    const S = ex.staff[i];
    if (!overlapRect(S.box, rect)) continue;
    let list = PROP_CACHE.get(S);
    if (!list) {
      list = staffProps(plan, S);
      const lp = metroStaffLockPlan(plan, S);
      if (lp.reader) list.push(mkSpec(PSEUDO.metro + 50 + S.id, 63, 'kart_okuyucu', lp.reader.x, lp.reader.y, lp.reader.z, lp.reader.yaw, 0, { lockId: lp.lock.id }));
      PROP_CACHE.set(S, list);
    }
    for (let k = 0; k < list.length; k++) out.push(list[k]);
  }
  return out;
}

export { emitStaff };
