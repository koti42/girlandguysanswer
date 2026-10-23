/*
 * KEŞİF sim/city — ALT ŞEHİR KABUĞU (Faz 1): kanalizasyon, menhol bacaları, metro hatları + istasyonlar + giriş merdivenleri, laboratuvar kabukları
 * ve kasa. Saf, belirlenimci; pencerenin (chunk ya da derin kesit) y aralığına kırpılarak yazar. Sözleşme §7 yazma sırası 4, "Yeraltı".
 * İç içerik (tren, raf, kilit, ekipman) Faz 2'dir (cityUnderground.js); burada yalnız yürünebilir kabuk + aydınlatma.
 *
 *  emitUnderground(w, plan)   tek çağrı: sewer → menholler → metro → istasyon girişleri → labs → kasa (her biri önce kaplama sonra oyuk)
 *
 * Geometri (cityUndergroundPlan): kanalizasyon zemin bloğu y30 / temiz y31..34 (5 geniş) / tavan y35, kaplama y29..36;
 * metro zemin bloğu y43 / temiz y44..50 / tavan y51; istasyon 17×56; giriş 10+10 basamak (switchback) 64→44;
 * lab odaları 16×12×6 (y −24/−18/−12), servis bacası kanalizasyondan −12'ye; kasa y −110..−90, bacası lab en derin odasından.
 */
import { ID } from './cityEmit.js';
import { LAB, METRO, SEWER } from './cityUndergroundPlan.js';

const CLEAR_H = 3; // basamaklı geçitlerde baş boşluğu (oyuncu 1.8)

/* ------------------------------------------------------------------------------------------------
 * Kanalizasyon
 * ---------------------------------------------------------------------------------------------- */
function sewerLines(w, plan) {
  const lines = plan.underground.sewer.lines;
  const near = [];
  for (let q = 0; q < lines.length; q++) {
    const l = lines[q];
    const a = l.a - 4;
    const b = l.b + 5;
    if (l.axis === 'z') {
      if (w.touches(l.c - 3, a, l.c + 4, b)) near.push(l);
    } else if (w.touches(a, l.c - 3, b, l.c + 4)) near.push(l);
  }
  if (near.length === 0) return;
  const fy = SEWER.floorY;
  const cy = SEWER.ceilY;
  for (let q = 0; q < near.length; q++) {
    const l = near[q];
    if (l.axis === 'z') w.box(l.c - 3, fy - 2, l.a - 4, l.c + 4, cy + 2, l.b + 5, ID.STONE_BRICK);
    else w.box(l.a - 4, fy - 2, l.c - 3, l.b + 5, cy + 2, l.c + 4, ID.STONE_BRICK);
  }
  for (let q = 0; q < near.length; q++) {
    const l = near[q];
    if (l.axis === 'z') {
      w.box(l.c - 2, fy - 1, l.a, l.c + 3, fy, l.b + 1, ID.COBBLE);
      w.box(l.c - 2, fy, l.a, l.c + 3, cy, l.b + 1, ID.AIR);
    } else {
      w.box(l.a, fy - 1, l.c - 2, l.b + 1, fy, l.c + 3, ID.COBBLE);
      w.box(l.a, fy, l.c - 2, l.b + 1, cy, l.c + 3, ID.AIR);
    }
  }
  // tavan ışıkları: eksen üzerinde 16 blokta bir
  for (let q = 0; q < near.length; q++) {
    const l = near[q];
    if (l.axis === 'z') {
      for (let z = w.z0; z < w.z1; z++) if (z >= l.a && z <= l.b && (z & 15) === 8) w.set(l.c, cy, z, ID.LIGHT);
    } else {
      for (let x = w.x0; x < w.x1; x++) if (x >= l.a && x <= l.b && (x & 15) === 8) w.set(x, cy, l.c, ID.LIGHT);
    }
  }
}

/**
 * Menhol bacaları: kavşağın KD köşesinden sokak yüzeyinden kanalizasyon zeminine (y31..63) merdivenli baca; dipte ana tünele 1 genişlikli bağlantı.
 * Bacanın 3×3 çevresi plan.engineeredAt hacmindedir; bağlantı koridorunun bacadan uzak kısmı mühendislik hacmi DIŞINDA kalır → yalnız hava oyulur
 * (ham taş duvar/zemin; doğal dolgu kuralıyla tutarlı), kaplama yazılmaz.
 */
function manholes(w, plan) {
  const ms = plan.underground.sewer.manholes;
  const fy = SEWER.floorY;
  const cy = SEWER.ceilY;
  for (let q = 0; q < ms.length; q++) {
    const m = ms[q];
    if (!w.touches(m.x, m.stub.z0, m.x + 1, m.stub.z1)) continue;
    w.box(m.x, fy, m.stub.z0, m.x + 1, cy, m.stub.z1, ID.AIR);
  }
  for (let q = 0; q < ms.length; q++) {
    const m = ms[q];
    if (!w.touches(m.x, m.z, m.x + 1, m.z + 1)) continue;
    w.col(m.x, m.z, fy, m.topY, ID.LADDER);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Metro
 * ---------------------------------------------------------------------------------------------- */
const MF = METRO.floorY - 1; // zemin bloğu y43
const MC = METRO.ceilY; // tavan bloğu y51
const LINE_COLOR = Object.freeze({ mor: ID.PURPLE, turuncu: ID.ORANGE });

function boxAxis(b) {
  return b.x1 - b.x0 < b.z1 - b.z0 ? 'z' : 'x';
}

function metroShell(w, plan) {
  const m = plan.underground.metro;
  const lines = [];
  for (let q = 0; q < m.lines.length; q++) {
    const l = m.lines[q];
    const hit = l.axis === 'z' ? w.touches(l.c - 7, l.a - 3, l.c + 8, l.b + 4) : w.touches(l.a - 3, l.c - 7, l.b + 4, l.c + 8);
    if (hit) lines.push(l);
  }
  const boxes = [];
  for (let s = 0; s < m.stations.length; s++) {
    const st = m.stations[s];
    for (let b = 0; b < st.boxes.length; b++) {
      const bx = st.boxes[b];
      if (w.touches(bx.x0 - 3, bx.z0 - 3, bx.x1 + 3, bx.z1 + 3)) boxes.push(bx);
    }
  }
  if (lines.length === 0 && boxes.length === 0) return { lines, boxes };
  const lo = MF - 1;
  const hi = MC + 2;
  const tw = Math.floor(METRO.tunnelW / 2); // 4
  // 1) kaplama blokları + hat rengi şeridi (duvar hücrelerine; istasyon oyuğu sonra onları keser)
  for (let q = 0; q < lines.length; q++) {
    const l = lines[q];
    const col = LINE_COLOR[l.id] || ID.PURPLE;
    if (l.axis === 'z') {
      w.box(l.c - tw - 2, lo, l.a - 2, l.c + tw + 3, hi, l.b + 3, ID.FACADE_LIGHT);
      w.box(l.c - tw - 1, 46, l.a, l.c - tw, 48, l.b + 1, col);
      w.box(l.c + tw + 1, 46, l.a, l.c + tw + 2, 48, l.b + 1, col);
    } else {
      w.box(l.a - 2, lo, l.c - tw - 2, l.b + 3, hi, l.c + tw + 3, ID.FACADE_LIGHT);
      w.box(l.a, 46, l.c - tw - 1, l.b + 1, 48, l.c - tw, col);
      w.box(l.a, 46, l.c + tw + 1, l.b + 1, 48, l.c + tw + 2, col);
    }
  }
  for (let q = 0; q < boxes.length; q++) {
    const b = boxes[q];
    w.box(b.x0 - 2, lo, b.z0 - 2, b.x1 + 2, hi, b.z1 + 2, ID.FACADE_LIGHT);
  }
  // 2) oyuklar (temiz hacim y44..50)
  for (let q = 0; q < lines.length; q++) {
    const l = lines[q];
    if (l.axis === 'z') w.box(l.c - tw, METRO.floorY, l.a, l.c + tw + 1, MC, l.b + 1, ID.AIR);
    else w.box(l.a, METRO.floorY, l.c - tw, l.b + 1, MC, l.c + tw + 1, ID.AIR);
  }
  for (let q = 0; q < boxes.length; q++) {
    const b = boxes[q];
    w.box(b.x0, METRO.floorY, b.z0, b.x1, MC, b.z1, ID.AIR);
  }
  return { lines, boxes };
}

function metroDetails(w, lines, boxes) {
  const tw = Math.floor(METRO.tunnelW / 2);
  for (let q = 0; q < lines.length; q++) {
    const l = lines[q];
    if (l.axis === 'z') {
      w.box(l.c - tw, MF, l.a, l.c + tw + 1, MF + 1, l.b + 1, ID.POLISHED);
      w.box(l.c - 1, MF, l.a, l.c + 2, MF + 1, l.b + 1, ID.BLACK);
      w.box(l.c - 1, MF, l.a, l.c, MF + 1, l.b + 1, ID.IRON);
      w.box(l.c + 1, MF, l.a, l.c + 2, MF + 1, l.b + 1, ID.IRON);
      for (let z = w.z0; z < w.z1; z++) if (z >= l.a && z <= l.b && (z & 7) === 0) w.set(l.c, MC, z, ID.LIGHT);
    } else {
      w.box(l.a, MF, l.c - tw, l.b + 1, MF + 1, l.c + tw + 1, ID.POLISHED);
      w.box(l.a, MF, l.c - 1, l.b + 1, MF + 1, l.c + 2, ID.BLACK);
      w.box(l.a, MF, l.c - 1, l.b + 1, MF + 1, l.c, ID.IRON);
      w.box(l.a, MF, l.c + 1, l.b + 1, MF + 1, l.c + 2, ID.IRON);
      for (let x = w.x0; x < w.x1; x++) if (x >= l.a && x <= l.b && (x & 7) === 0) w.set(x, MC, l.c, ID.LIGHT);
    }
  }
  for (let q = 0; q < boxes.length; q++) {
    const b = boxes[q];
    const ax = boxAxis(b);
    if (ax === 'z') {
      const c = (b.x0 + b.x1 - 1) / 2;
      w.box(b.x0, MF, b.z0, b.x1, MF + 1, b.z1, ID.POLISHED);
      w.box(c - 1, MF, b.z0, c + 2, MF + 1, b.z1, ID.BLACK);
      w.box(c - 1, MF, b.z0, c, MF + 1, b.z1, ID.IRON);
      w.box(c + 1, MF, b.z0, c + 2, MF + 1, b.z1, ID.IRON);
      w.box(c - 3, MF, b.z0, c - 2, MF + 1, b.z1, ID.YELLOW);
      w.box(c + 3, MF, b.z0, c + 4, MF + 1, b.z1, ID.YELLOW);
      for (let z = w.z0; z < w.z1; z++) {
        if (z < b.z0 || z >= b.z1) continue;
        const k = (z - b.z0) & 7;
        if (k === 4) {
          w.col(c - 6, z, METRO.floorY, MC, ID.FACADE_LIGHT);
          w.col(c + 6, z, METRO.floorY, MC, ID.FACADE_LIGHT);
        }
        if (k === 0) {
          w.set(c - 4, MC, z, ID.LIGHT);
          w.set(c + 4, MC, z, ID.LIGHT);
        }
      }
    } else {
      const c = (b.z0 + b.z1 - 1) / 2;
      w.box(b.x0, MF, b.z0, b.x1, MF + 1, b.z1, ID.POLISHED);
      w.box(b.x0, MF, c - 1, b.x1, MF + 1, c + 2, ID.BLACK);
      w.box(b.x0, MF, c - 1, b.x1, MF + 1, c, ID.IRON);
      w.box(b.x0, MF, c + 1, b.x1, MF + 1, c + 2, ID.IRON);
      w.box(b.x0, MF, c - 3, b.x1, MF + 1, c - 2, ID.YELLOW);
      w.box(b.x0, MF, c + 3, b.x1, MF + 1, c + 4, ID.YELLOW);
      for (let x = w.x0; x < w.x1; x++) {
        if (x < b.x0 || x >= b.x1) continue;
        const k = (x - b.x0) & 7;
        if (k === 4) {
          w.col(x, c - 6, METRO.floorY, MC, ID.FACADE_LIGHT);
          w.col(x, c + 6, METRO.floorY, MC, ID.FACADE_LIGHT);
        }
        if (k === 0) {
          w.set(x, MC, c - 4, ID.LIGHT);
          w.set(x, MC, c + 4, ID.LIGHT);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * İstasyon girişleri: 10+10 basamak switchback (kiosk parseli içinde)
 * ---------------------------------------------------------------------------------------------- */
function stepAt(w, uAxisX, u, v, foot, clear) {
  const x = uAxisX ? u : v;
  const z = uAxisX ? v : u;
  w.set(x, foot - 1, z, ID.POLISHED);
  w.col(x, z, foot, foot + clear, ID.AIR);
}

function entrance(w, E) {
  const ux = E.u === 'x';
  const f1 = E.flights[0];
  const f2 = E.flights[1];
  const uLo = Math.min(E.uNear, E.uNear + E.su * 12) - 2;
  const uHi = Math.max(E.uNear, E.uNear + E.su * 12) + 3;
  const vLo = E.vRow.v0 - 1;
  const vHi = E.vRow.v1 + 1;
  const hit = ux ? w.touches(uLo, vLo, uHi, vHi) : w.touches(vLo, uLo, vHi, uHi);
  if (!hit) return;
  // 1. kol: ayak 64−k, k=0..9 (dirU = su)
  for (let k = 0; k < 10; k++) {
    const u = f1.u0 + f1.dirU * k;
    const foot = f1.y0 - k;
    for (let v = f1.v0; v < f1.v1; v++) stepAt(w, ux, u, v, foot, CLEAR_H);
  }
  // kiosk duvarındaki merdiven ağzının üstüne neon başlık (istasyon girişi geceleyin okunur)
  for (let v = f1.v0; v < f1.v1; v++) {
    const hx = ux ? f1.u0 : v;
    const hz = ux ? v : f1.u0;
    w.set(hx, f1.y0 + CLEAR_H, hz, ID.NEON_PINK);
  }
  // sahanlık
  for (let v = E.landing.v0; v < E.landing.v1; v++) stepAt(w, ux, E.landing.u, v, E.landing.y, CLEAR_H);
  // 2. kol: ayak 53−k, k=0..9 (dirU = −su)
  for (let k = 0; k < 10; k++) {
    const u = f2.u0 + f2.dirU * k;
    const foot = f2.y0 - 1 - k;
    for (let v = f2.v0; v < f2.v1; v++) stepAt(w, ux, u, v, foot, CLEAR_H);
  }
  // dip hücreleri
  for (let v = f2.v0; v < f2.v1; v++) stepAt(w, ux, E.uNear, v, E.bottom.y, CLEAR_H);
  // istasyon salonuna bağlantı
  const L = E.link;
  for (let z = L.z0; z < L.z1; z++) {
    for (let x = L.x0; x < L.x1; x++) {
      w.set(x, L.y - 1, z, ID.POLISHED);
      w.col(x, z, L.y, L.y + CLEAR_H + 1, ID.AIR);
    }
  }
  // aydınlatma: tavana gömülü ışık blokları
  const lightAt = (u, v, foot) => {
    const x = ux ? u : v;
    const z = ux ? v : u;
    w.set(x, foot + CLEAR_H, z, ID.LIGHT);
  };
  lightAt(f1.u0 + f1.dirU * 5, f1.v0, f1.y0 - 5);
  lightAt(f1.u0 + f1.dirU * 8, f1.v0, f1.y0 - 8);
  lightAt(E.landing.u, E.landing.v0 + 2, E.landing.y);
  lightAt(f2.u0 + f2.dirU * 2, f2.v0, f2.y0 - 3);
  lightAt(f2.u0 + f2.dirU * 6, f2.v0, f2.y0 - 7);
}

/* ------------------------------------------------------------------------------------------------
 * Laboratuvarlar ve kasa
 * ---------------------------------------------------------------------------------------------- */
function labBoxHit(w, L) {
  const b = L.box;
  return w.touches(b.x0 - 3, b.z0 - 3, b.x1 + 3, b.z1 + 3) && w.touchesY(LAB.y0 - 2, LAB.y0 + LAB.rooms * LAB.step + 2);
}

function labShell(w, L) {
  const rs = L.rooms;
  for (let q = 0; q < rs.length; q++) {
    const r = rs[q];
    w.box(r.x0 - 1, r.y0 - 1, r.z0 - 1, r.x1 + 1, r.y1 + 1, r.z1 + 1, ID.FACADE_LIGHT);
  }
  for (let q = 0; q < rs.length; q++) {
    const r = rs[q];
    w.box(r.x0, r.y0 - 1, r.z0, r.x1, r.y0, r.z1, ID.POLISHED);
    w.box(r.x0, r.y0, r.z0, r.x1, r.y1, r.z1, ID.AIR);
  }
  // odalar arası inen merdiven: üst oda U → alt oda L (L'nin U'ya bitişik 6 hücresi, tam oda genişliği)
  const alongX = L.axis === 'z'; // zincir x yönünde
  for (let k = LAB.rooms - 1; k >= 1; k--) {
    const U = rs.find((r) => r.k === k);
    const D = rs.find((r) => r.k === k - 1);
    if (!U || !D) continue;
    const rise = U.y0 - D.y0;
    for (let i = 0; i < rise; i++) {
      const foot = U.y0 - 1 - i;
      let a0;
      let a1;
      let b0;
      let b1;
      if (alongX) {
        const towardPlus = D.x0 >= U.x1;
        a0 = towardPlus ? D.x0 + i : D.x1 - 1 - i;
        a1 = a0 + 1;
        b0 = D.z0;
        b1 = D.z1;
        w.box(a0, D.y0, b0, a1, foot, b1, ID.POLISHED);
        w.box(a0, foot, b0, a1, U.y1, b1, ID.AIR);
      } else {
        const towardPlus = D.z0 >= U.z1;
        a0 = towardPlus ? D.z0 + i : D.z1 - 1 - i;
        a1 = a0 + 1;
        b0 = D.x0;
        b1 = D.x1;
        w.box(b0, D.y0, a0, b1, foot, a1, ID.POLISHED);
        w.box(b0, foot, a0, b1, U.y1, a1, ID.AIR);
      }
    }
  }
  // tavan ışıkları (oda başına 4)
  for (let q = 0; q < rs.length; q++) {
    const r = rs[q];
    const xs = [r.x0 + 3, r.x1 - 4];
    const zs = [r.z0 + 3, r.z1 - 4];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) w.set(xs[a], r.y1, zs[b], ID.LIGHT);
  }
}

/** yBot..yTop (dahil) tek hücrelik baca: merdiven bloğu hava hücresini de açar (merdiven çarpışmasız, tırmanılabilir). */
function shaftColumn(w, x, z, yBot, yTop) {
  w.col(x, z, yBot, yTop + 1, ID.LADDER);
}

function labs(w, plan) {
  const u = plan.underground;
  const hits = [];
  for (let q = 0; q < u.labs.length; q++) if (labBoxHit(w, u.labs[q])) hits.push(u.labs[q]);
  for (let q = 0; q < hits.length; q++) labShell(w, hits[q]);
  // servis bacaları (kanalizasyon → en yüzeye yakın oda): sütun boyunca
  for (let q = 0; q < u.labs.length; q++) {
    const L = u.labs[q];
    const s = L.shaft;
    if (!w.touches(s.x, s.z, s.x + 1, s.z + 1)) continue;
    shaftColumn(w, s.x, s.z, s.yBot, s.yTop);
  }
}

function vault(w, plan) {
  const V = plan.underground.vault;
  const near = w.touches(V.x0 - 3, V.z0 - 3, V.x1 + 3, V.z1 + 3) && w.touchesY(V.y0 - 3, V.y1 + 3);
  const sh = V.shaft;
  const shaftNear = w.touches(sh.x, sh.z, sh.x + 1, sh.z + 1) && w.touchesY(sh.yBot, sh.yTop + 1);
  if (near) {
    w.box(V.x0 - 1, V.y0 - 1, V.z0 - 1, V.x1 + 1, V.y1 + 1, V.z1 + 1, ID.FACADE_DARK);
    w.box(V.x0, V.y0 - 1, V.z0, V.x1, V.y0, V.z1, ID.IRON);
    w.box(V.x0, V.y0, V.z0, V.x1, V.y1, V.z1, ID.AIR);
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        w.set(V.x0 + 4 + a * 8, V.y1, V.z0 + 4 + b * 8, ID.LIGHT);
      }
    }
  }
  if (shaftNear) shaftColumn(w, sh.x, sh.z, sh.yBot, sh.yTop);
}

/** Tüm alt şehir kabuğu (pencereye kırpılır). */
export function emitUnderground(w, plan) {
  if (w.touchesY(SEWER.floorY - 2, SEWER.ceilY + 2)) sewerLines(w, plan);
  if (w.touchesY(SEWER.floorY - 2, 65)) manholes(w, plan);
  if (w.touchesY(MF - 1, MC + 3)) {
    const m = metroShell(w, plan);
    metroDetails(w, m.lines, m.boxes);
  }
  if (w.touchesY(42, 65)) {
    const st = plan.underground.metro.stations;
    for (let s = 0; s < st.length; s++) {
      const en = st[s].entrances;
      for (let e = 0; e < en.length; e++) entrance(w, en[e]);
    }
  }
  if (w.touchesY(LAB.y0 - 2, SEWER.floorY + 1)) labs(w, plan);
  if (w.touchesY(-112, LAB.y0 + 1)) vault(w, plan);
}

