/*
 * KEŞİF sim/city — BİNA KABUKLARI (cephe, döşeme, çatı, kapı, çekirdek, anten, helipad, gökyüzü köprüsü, dış merdiven, pazar tezgâhı).
 * Saf, belirlenimci; yalnız chunk dilimini yazar. Sözleşme §7 yazma sırası 5, §1.17.
 *
 *  emitBuilding(w, lot, bp)      kabuk: bp = planBuilding sonucu. Sıra: zemin/döşeme/çatı satırı → duvarlar (buildingFacade.facadeBlock) →
 *                                çekirdek → kapı → çatı süsleri → gökyüzü köprüleri → dış merdiven → salon ışıkları
 *  emitOpenLot(w, lot, bp)       açık parsel: pazar tezgâhları (park çimi/yolu cityTerrain.emitLotGrounds)
 *
 * Kat düzeni: kat f taban bloğu y=63+4f (döşeme/denizlik, relY0), pencere satırları y=64+4f, 65+4f (relY1–2), lento y=66+4f (relY3); çatı döşemesi
 * y=63+4F+lift. Kule fuayesi (kat 0–2) tek hacimdir (kat 1–2 döşemesi yok); kule iç katları kapalı ofis: döşeme+çevre cephe+çekirdek, KAPI YOK.
 * Pencereler opak 233–235 (yanık/sönük gen sırasında seçilir); yalnız halka açık alt katlarda (style.pub) ve sky-lobi katlarında gerçek cam.
 */
import { ARCHETYPES } from './archetypes.js';
import { facadeBlock } from './buildingFacade.js';
import { ID, NEON_BY_HUE } from './cityEmit.js';

const SLAB = ID.WHITE;
const ROOF = ID.BLACK;
const FACE_N = 0;
const FACE_E = 1;
const FACE_S = 2;
const FACE_W = 3;

function isWindowId(id) {
  return id === ID.WINDOW_DARK || id === ID.WINDOW_WARM || id === ID.WINDOW_COOL;
}

/** Bir parçanın (part) zirve kat sayısı. */
function partTops(tiers) {
  const m = {};
  for (let q = 0; q < tiers.length; q++) {
    const t = tiers[q];
    if (m[t.part] === undefined || t.f1 > m[t.part]) m[t.part] = t.f1;
  }
  return m;
}

/* ------------------------------------------------------------------------------------------------
 * Cephe sütunu
 * ---------------------------------------------------------------------------------------------- */
class Facade {
  constructor(style, F, tower, lobbyOf) {
    this.style = style;
    this.F = F;
    this.tower = tower;
    this.lobbyOf = lobbyOf;
    this.cap = style.mode === 'curtain' ? style.panel : style.wall;
  }

  /** (face,u) sütununun 4 satırlık deseni [relY0, relY1(=relY2), relY3] kat ff için. */
  pattern(face, u, ff, out, partIdx) {
    const st = this.style;
    if (ff >= this.F) {
      out[0] = this.cap;
      out[1] = this.cap;
      out[2] = this.cap;
      return;
    }
    const bw = st.bayW;
    const bay = Math.floor(u / bw);
    const cell = u - bay * bw;
    const top = ff === this.F - 1;
    out[0] = facadeBlock(st, face, ff, bay, 0, cell, top);
    out[1] = facadeBlock(st, face, ff, bay, 1, cell, top);
    out[2] = facadeBlock(st, face, ff, bay, 3, cell, top);
    if (this.tower && isWindowId(out[1]) && this.lobbyOf(partIdx, ff)) out[1] = st.glass;
  }

  /** Köşe sütunu deseni (kolon; kaburgalı stillerde neon). */
  corner(ff, out) {
    const st = this.style;
    if (ff >= this.F) {
      out[0] = this.cap;
      out[1] = this.cap;
      out[2] = this.cap;
      return;
    }
    const bay = st.rib ? 0 : 1;
    const top = ff === this.F - 1;
    out[0] = facadeBlock(st, FACE_N, ff, bay, 0, 0, top);
    out[1] = facadeBlock(st, FACE_N, ff, bay, 1, 0, top);
    out[2] = facadeBlock(st, FACE_N, ff, bay, 3, 0, top);
  }
}

const PAT = [0, 0, 0];

/** x,z sütununa yFrom..yTo (dahil) satırlarını yazar; face<0 → köşe. */
function wallColumn(w, fa, face, x, z, u, yFrom, yTo, partIdx) {
  if (x < w.x0 || x >= w.x1 || z < w.z0 || z >= w.z1) return;
  const y0 = yFrom < w.yBase ? w.yBase : yFrom;
  const y1 = yTo >= w.yEnd ? w.yEnd - 1 : yTo;
  if (y0 > y1) return;
  let lastF = -1;
  for (let y = y0; y <= y1; y++) {
    const ff = (y - 63) >> 2;
    const ry = (y - 63) & 3;
    if (ff !== lastF) {
      if (face < 0) fa.corner(ff, PAT);
      else fa.pattern(face, u, ff, PAT, partIdx);
      lastF = ff;
    }
    w.set(x, y, z, ry === 0 ? PAT[0] : ry === 3 ? PAT[2] : PAT[1]);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Ana yazıcı
 * ---------------------------------------------------------------------------------------------- */
/** Kademeleri f0'a göre (eşitlikte plan sırası) sıralar; plan nesnelerine dokunmaz (paylaşılan önbellek). */
function sortedTiers(bp) {
  const idx = bp.tiers.map((_, i) => i);
  idx.sort((a, b) => bp.tiers[a].f0 - bp.tiers[b].f0 || a - b);
  return idx.map((i) => bp.tiers[i]);
}

function coveredAbove(tiers, t, x, z) {
  for (let q = 0; q < tiers.length; q++) {
    const o = tiers[q];
    if (o.f0 !== t.f1 || o.part !== t.part) continue;
    if (x >= o.x0 && x < o.x0 + o.w && z >= o.z0 && z < o.z0 + o.d) return true;
  }
  return false;
}

function rimCells(t, cb) {
  const x1 = t.x0 + t.w;
  const z1 = t.z0 + t.d;
  for (let x = t.x0; x < x1; x++) {
    cb(x, t.z0);
    cb(x, z1 - 1);
  }
  for (let z = t.z0 + 1; z < z1 - 1; z++) {
    cb(t.x0, z);
    cb(x1 - 1, z);
  }
}

export function emitBuilding(w, lot, bp, interiorHook) {
  const A0 = ARCHETYPES[bp.archetype];
  if (!A0 || !A0.building || bp.hill || !bp.tiers || bp.tiers.length === 0) return;
  const fx0 = bp.x0;
  const fz0 = bp.z0;
  if (!w.touches(fx0 - 1, fz0 - 1, fx0 + bp.w + 1, fz0 + bp.d + 1) && !(bp.extStair && w.touches(fx0 - 8, fz0 - 8, fx0 + bp.w + 8, fz0 + bp.d + 8))) return;
  const F = bp.floors;
  const lift = bp.roof ? bp.roof.lift : 0;
  const style = bp.style;
  const tiers = sortedTiers(bp);
  const tops = partTops(tiers);
  const towerPart = {};
  Object.keys(tops).forEach((k) => {
    towerPart[k] = A0.tower && tops[k] >= 8;
  });
  const lobbyOf = (part, f) => {
    if (!towerPart[part]) return false;
    const top = tops[part];
    for (let lf = 14; lf < top - 1; lf += 15) if (lf === f) return true;
    return false;
  };
  const fa = new Facade(style, F, A0.tower, lobbyOf);
  const roofKind = bp.roof ? bp.roof.kind : 'duz';

  // 1) zemin satırı, kat döşemeleri, çatı satırı
  for (let q = 0; q < tiers.length; q++) {
    const t = tiers[q];
    const ax1 = t.x0 + t.w;
    const az1 = t.z0 + t.d;
    if (!w.touches(t.x0, t.z0, ax1, az1)) continue;
    const top = t.f1 === F;
    if (t.f0 === 0) w.box(t.x0 + 1, 63, t.z0 + 1, ax1 - 1, 64, az1 - 1, ID.POLISHED);
    for (let f = Math.max(1, t.f0); f < t.f1; f++) {
      if (towerPart[t.part] && (f === 1 || f === 2)) continue;
      w.box(t.x0, 63 + 4 * f, t.z0, ax1, 64 + 4 * f, az1, SLAB);
    }
    const ry = 63 + 4 * t.f1 + (top ? lift : 0);
    const roofMat = top && roofKind === 'bahce' ? ID.GRASS : ROOF;
    w.box(t.x0, ry, t.z0, ax1, ry + 1, az1, roofMat);
  }

  // 2) duvarlar
  for (let q = 0; q < tiers.length; q++) {
    const t = tiers[q];
    const ax1 = t.x0 + t.w;
    const az1 = t.z0 + t.d;
    if (!w.touches(t.x0, t.z0, ax1, az1)) continue;
    const yFrom = 63 + 4 * t.f0;
    const yTo = 63 + 4 * t.f1 + (t.f1 === F ? lift : 0);
    const part = t.part;
    for (let x = t.x0; x < ax1; x++) {
      if (x < w.x0 || x >= w.x1) continue;
      const u = x - fx0;
      if (x === t.x0 || x === ax1 - 1) {
        wallColumn(w, fa, -1, x, t.z0, 0, yFrom, yTo, part);
        wallColumn(w, fa, -1, x, az1 - 1, 0, yFrom, yTo, part);
      } else {
        wallColumn(w, fa, FACE_N, x, t.z0, u, yFrom, yTo, part);
        wallColumn(w, fa, FACE_S, x, az1 - 1, u, yFrom, yTo, part);
      }
    }
    for (let z = t.z0 + 1; z < az1 - 1; z++) {
      if (z < w.z0 || z >= w.z1) continue;
      const u = z - fz0;
      wallColumn(w, fa, FACE_W, t.x0, z, u, yFrom, yTo, part);
      wallColumn(w, fa, FACE_E, ax1 - 1, z, u, yFrom, yTo, part);
    }
  }

  // 3) çekirdek (asansör bacası): 4×4 halka, 2×2 boşluk; kapı yok (Faz 2 asansör kapılarını açar). Yalnız çekirdeğin duvarlara değmeden
  //    içine sığdığı kademelerde çizilir (spiral kulede üst kademeler köşeye kayar: çekirdek orada yoktur)
  for (let q = 0; q < bp.core.length; q++) {
    const c = bp.core[q];
    if (!w.touches(c.x0, c.z0, c.x1, c.z1)) continue;
    for (let k = 0; k < tiers.length; k++) {
      const t = tiers[k];
      if (t.part !== c.part) continue;
      if (c.x0 < t.x0 + 1 || c.x1 > t.x0 + t.w - 1 || c.z0 < t.z0 + 1 || c.z1 > t.z0 + t.d - 1) continue;
      const y0 = t.f0 === 0 ? 64 : 63 + 4 * t.f0;
      const yTop = 63 + 4 * t.f1;
      w.box(c.x0, y0, c.z0, c.x1, yTop, c.z1, ID.FACADE_DARK);
      w.box(c.x0 + 1, y0, c.z0 + 1, c.x1 - 1, yTop, c.z1 - 1, ID.AIR);
    }
  }

  // 4) cephe girişi: kayar kapı 3×3 + neon başlık
  const door = bp.doors && bp.doors[0];
  if (door) emitDoor(w, door, style);

  // 5) çatı süsleri
  emitRoof(w, bp, tiers, A0, F, lift, roofKind);

  // 6) gökyüzü köprüleri (ikiz kule)
  for (let q = 0; q < bp.bridges.length; q++) emitSkybridge(w, bp.bridges[q], style);

  // 7) dış merdiven (çatı parkuru başlangıcı)
  if (bp.extStair) emitExtStair(w, bp.extStair);

  // 8) salon ışıkları
  hallLights(w, tiers, bp.core, towerPart);

  // 9) Faz 2 iç mekân kancası (interior/index.js emitBuildingInterior)
  if (interiorHook) interiorHook(w, bp, lot);
}

/* ------------------------------------------------------------------------------------------------
 * Kapı
 * ---------------------------------------------------------------------------------------------- */
function emitDoor(w, d, style) {
  const alongX = d.axis === 'x';
  const hue = NEON_BY_HUE[0];
  const head = style && style.hues && style.hues.length ? style.hues[0] : hue;
  for (let o = -1; o <= 1; o++) {
    const x = alongX ? d.x + o : d.x;
    const z = alongX ? d.z : d.z + o;
    w.set(x, 63, z, ID.POLISHED);
    for (let y = 64; y <= 66; y++) w.set(x, y, z, ID.DOOR);
  }
  for (let o = -2; o <= 2; o++) {
    const x = alongX ? d.x + o : d.x;
    const z = alongX ? d.z : d.z + o;
    w.set(x, 67, z, head);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Çatı
 * ---------------------------------------------------------------------------------------------- */
function emitRoof(w, bp, tiers, A0, F, lift, roofKind) {
  const roof = bp.roof;
  if (!roof) return;
  const towerLike = A0.tower;
  const parapet = roof.parapet === 1;
  for (let q = 0; q < tiers.length; q++) {
    const t = tiers[q];
    if (!w.touches(t.x0, t.z0, t.x0 + t.w, t.z0 + t.d)) continue;
    const top = t.f1 === F;
    const ry = 63 + 4 * t.f1 + (top ? lift : 0);
    if (parapet || !top) {
      rimCells(t, (x, z) => {
        if (coveredAbove(tiers, t, x, z)) return;
        w.set(x, ry + 1, z, bp.style.panel);
        if (towerLike) w.set(x, ry + 2, z, ID.FENCE);
      });
    }
    if (top && roofKind === 'egimli') {
      // iki kademe eğimli çatı (kiremit kırmızısı): çatı döşemesinin üstüne 1 ve 2 hücre içeriden
      for (let k = 1; k <= 2; k++) {
        if (t.w - 2 * k < 3 || t.d - 2 * k < 3) break;
        w.box(t.x0 + k, ry + k, t.z0 + k, t.x0 + t.w - k, ry + k + 1, t.z0 + t.d - k, ID.RED);
      }
    }
  }
  if (roof.helipad) helipad(w, roof.helipad);
  if (roof.antenna) {
    const a = roof.antenna;
    const x = Math.floor(a.x);
    const z = Math.floor(a.z);
    if (w.touches(x, z, x + 1, z + 1)) {
      w.col(x, z, a.y, a.y + 3, ID.IRON);
      w.col(x, z, a.y + 3, a.y + a.h, ID.FENCE);
      w.set(x, a.y + a.h, z, ID.NEON_PINK);
    }
  }
}

function helipad(w, h) {
  if (!w.touches(h.x0, h.z0, h.x1, h.z1)) return;
  const y = h.y - 1;
  w.box(h.x0, y, h.z0, h.x1, y + 1, h.z1, ID.BLACK);
  // sarı çerçeve + beyaz H
  w.box(h.x0, y, h.z0, h.x1, y + 1, h.z0 + 1, ID.YELLOW);
  w.box(h.x0, y, h.z1 - 1, h.x1, y + 1, h.z1, ID.YELLOW);
  w.box(h.x0, y, h.z0, h.x0 + 1, y + 1, h.z1, ID.YELLOW);
  w.box(h.x1 - 1, y, h.z0, h.x1, y + 1, h.z1, ID.YELLOW);
  const cx = Math.floor((h.x0 + h.x1) / 2);
  const cz = Math.floor((h.z0 + h.z1) / 2);
  w.box(cx - 3, y, cz - 4, cx - 2, y + 1, cz + 5, ID.WHITE);
  w.box(cx + 3, y, cz - 4, cx + 4, y + 1, cz + 5, ID.WHITE);
  w.box(cx - 2, y, cz, cx + 3, y + 1, cz + 1, ID.WHITE);
  // köşe neon işaretleri
  w.set(h.x0, h.y, h.z0, ID.NEON_PINK);
  w.set(h.x1 - 1, h.y, h.z0, ID.NEON_PINK);
  w.set(h.x0, h.y, h.z1 - 1, ID.NEON_PINK);
  w.set(h.x1 - 1, h.y, h.z1 - 1, ID.NEON_PINK);
}

/* ------------------------------------------------------------------------------------------------
 * Gökyüzü köprüsü (ikiz kule): 5 geniş cam tüp, orta 3 hücre yürünür; iki kulenin cephesinde 3×2 geçit.
 * Plan: boşluk ekseni boyunca uzunluk g=6..10 (b.x1−b.x0 ≥ 6 → x ekseni), enine 3 hücre.
 * ---------------------------------------------------------------------------------------------- */
function emitSkybridge(w, b, style) {
  const alongX = b.x1 - b.x0 >= 6;
  const xa = alongX ? b.x0 : b.x0 - 1;
  const xb = alongX ? b.x1 : b.x1 + 1;
  const za = alongX ? b.z0 - 1 : b.z0;
  const zb = alongX ? b.z1 + 1 : b.z1;
  if (!w.touches(xa - 1, za - 1, xb + 1, zb + 1)) return;
  const y0 = b.y0;
  w.box(xa, y0, za, xb, y0 + 1, zb, ID.POLISHED);
  w.box(xa, y0 + 3, za, xb, y0 + 4, zb, ID.FACADE_DARK);
  w.box(xa, y0 + 1, za, xb, y0 + 3, zb, style.glass);
  if (alongX) {
    w.box(xa, y0 + 1, b.z0, xb, y0 + 3, b.z1, ID.AIR);
    w.box(xa - 1, y0 + 1, b.z0, xa, y0 + 3, b.z1, ID.AIR);
    w.box(xb, y0 + 1, b.z0, xb + 1, y0 + 3, b.z1, ID.AIR);
  } else {
    w.box(b.x0, y0 + 1, za, b.x1, y0 + 3, zb, ID.AIR);
    w.box(b.x0, y0 + 1, za - 1, b.x1, y0 + 3, za, ID.AIR);
    w.box(b.x0, y0 + 1, zb, b.x1, y0 + 3, zb + 1, ID.AIR);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Dış merdiven (çatı parkuru başlangıcı)
 * ---------------------------------------------------------------------------------------------- */
function stairCell(w, x, z, foot) {
  if (foot > 64) w.col(x, z, 64, foot - 1, ID.BLACK);
  w.set(x, foot - 1, z, ID.POLISHED);
}

function emitExtStair(w, es) {
  for (let i = 0; i < es.flights.length; i++) stairCell(w, es.flights[i].x, es.flights[i].z, es.flights[i].y);
  for (let i = 0; i < es.landing.cells.length; i++) stairCell(w, es.landing.cells[i].x, es.landing.cells[i].z, es.landing.y);
  if (es.landing2) for (let i = 0; i < es.landing2.cells.length; i++) stairCell(w, es.landing2.cells[i].x, es.landing2.cells[i].z, es.landing2.y);
  stairCell(w, es.top.x, es.top.z, es.top.y);
}

/* ------------------------------------------------------------------------------------------------
 * Salon ışıkları: zemin kat salonunun tavanına en çok 9 ışık (üstünde kat varsa ilk tavan döşemesine gömülü; tek katlı binada asılı fener).
 * Çekirdek hücrelerine konmaz.
 * ---------------------------------------------------------------------------------------------- */
function inCore(core, x, z) {
  for (let i = 0; i < core.length; i++) {
    const c = core[i];
    if (x >= c.x0 - 1 && x < c.x1 + 1 && z >= c.z0 - 1 && z < c.z1 + 1) return true;
  }
  return false;
}

/** [a, a+len) aralığında eşit aralıklı en çok 3 ışık konumu (kenarlardan ≥4). */
function spread(a, len) {
  const n = Math.max(1, Math.min(3, Math.floor((len - 2) / 9)));
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + Math.floor(((i + 0.5) * len) / n));
  return out;
}

function hallLights(w, tiers, core, towerPart) {
  for (let q = 0; q < tiers.length; q++) {
    const t = tiers[q];
    if (t.f0 !== 0) continue;
    if (!w.touches(t.x0, t.z0, t.x0 + t.w, t.z0 + t.d)) continue;
    const ceilF = towerPart[t.part] === true ? 3 : 1;
    const embed = t.f1 > ceilF;
    const xs = spread(t.x0, t.w);
    const zs = spread(t.z0, t.d);
    for (let a = 0; a < xs.length; a++) {
      for (let b = 0; b < zs.length; b++) {
        if (inCore(core, xs[a], zs[b])) continue;
        if (embed) w.set(xs[a], 63 + 4 * ceilF, zs[b], ID.LIGHT);
        else w.set(xs[a], 66, zs[b], ID.LANTERN);
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Açık parsel: pazar tezgâhları
 * ---------------------------------------------------------------------------------------------- */
export function emitOpenLot(w, lot, bp) {
  const stalls = bp.stalls;
  if (!stalls || stalls.length === 0) return;
  const alongX = lot.front === 'n' || lot.front === 's';
  const mx = (lot.x0 + lot.x1) / 2;
  const mz = (lot.z0 + lot.z1) / 2;
  for (let q = 0; q < stalls.length; q++) {
    const s = stalls[q];
    if (!w.touches(s.x0, s.z0, s.x1, s.z1)) continue;
    const y0 = 64;
    // tente (kumaş) ve dört direk
    w.box(s.x0, y0 + s.h, s.z0, s.x1, y0 + s.h + 1, s.z1, s.cloth);
    const posts = [[s.x0, s.z0], [s.x1 - 1, s.z0], [s.x0, s.z1 - 1], [s.x1 - 1, s.z1 - 1]];
    for (let p = 0; p < 4; p++) w.col(posts[p][0], posts[p][1], y0, y0 + s.h, ID.FENCE);
    // tezgâh: koridora bakan kenar boyunca ahşap sıra
    if (alongX) {
      const cz = (s.z0 + s.z1) / 2;
      const zz = cz < mz ? s.z1 - 1 : s.z0;
      w.box(s.x0 + 1, y0, zz, s.x1 - 1, y0 + 1, zz + 1, ID.BRICK);
    } else {
      const cx = (s.x0 + s.x1) / 2;
      const xx = cx < mx ? s.x1 - 1 : s.x0;
      w.box(xx, y0, s.z0 + 1, xx + 1, y0 + 1, s.z1 - 1, ID.BRICK);
    }
    // asılı fener
    w.set(Math.floor((s.x0 + s.x1) / 2), y0 + s.h - 1, Math.floor((s.z0 + s.z1) / 2), ID.LANTERN);
  }
}
