/*
 * KEŞİF sim/city — KANALİZASYON İÇERİĞİ (Faz 2, interiors_d). Saf, belirlenimci; yalnız pencere (chunk dilimi) içini yazar.
 * Kabuk (cityUndergroundShell: 5×4 tünel, menhol bacaları) olduğu gibi kalır; burada yalnız DÜZENLEME + ODALAR:
 *   - tünel giydirmesi: sönük kehribar lambalar (16'da bir, kabuğun LIGHT'ı değiştirilir), yan duvar borusu + bakır halkalar, yosun lekeleri
 *   - kavşak odaları (JR, ~%40): 11×11×6, 4 sütun + 4 lamba (≤4 ışık/oda), zemin deseni, ızgara, duvar resimleri/servis panosu, grafiti duvarları
 *   - gizli odalar (HR, 30): tünel duvarından yana 8×7×5 oda; kapı 2×3 gizli panel (duvar bloğuyla aynı), 6 tema
 *
 *  emitSewerContent(w, plan)
 *  sewerPropSpecs(plan, rect, out)    PropSpec'ler (katalog anahtarları; çapa ayak seviyesi)
 *  junctionAnchors(plan) / hiddenAnchors(plan)   keşif çapaları (grafiti duvarı, gizli oda tetikleyici)
 *  hiddenLockPlan(plan, H)  → {lock, button?, pad?, clue?}   (cityUndergroundLocks kilit grafını kurar)
 */
import { B } from '../blocks.js';
import { ID, cellHash } from './cityEmit.js';
import { GRID } from './cityRoads.js';
import { getCatalogDef } from '../props/propCatalog.js';
import { getPropDef } from '../props/propDefs.js';
import { HR_THEMES, XS, sewerExtras } from './cityUndergroundExtra.js';
import {
  PSEUDO, UT, codeOf, dirYaw, hh, hi, mkLock, mkSpec,
} from './cityContentKit.js';

const FY = XS.floorY; // 31 ayak
const AIR = 0;

/* ------------------------------------------------------------------------------------------------
 * Yardımcılar
 * ---------------------------------------------------------------------------------------------- */
/** Yalnız ham taş (STONE) hücrelerini duvar tuğlasına çevirir (merdiven/hava/kabuk tuğlası korunur). */
function stoneToBrick(w, xa, ya, za, xb, yb, zb, id) {
  const x0 = Math.max(xa, w.x0);
  const x1 = Math.min(xb, w.x1);
  const z0 = Math.max(za, w.z0);
  const z1 = Math.min(zb, w.z1);
  const y0 = Math.max(ya, w.yBase);
  const y1 = Math.min(yb, w.yEnd);
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) if (w.get(x, y, z) === ID.STONE) w.set(x, y, z, id);
    }
  }
}

/** Yalnız tuğla duvar hücresini boyar (merdiven/hava/başka yapı korunur). */
function wallSet(w, x, y, z, id) {
  if (w.get(x, y, z) === ID.STONE_BRICK) w.set(x, y, z, id);
}

function nearNode(v) {
  const k = Math.round(v / GRID);
  return Math.abs(v - k * GRID);
}

/* ------------------------------------------------------------------------------------------------
 * Tünel giydirmesi
 * ---------------------------------------------------------------------------------------------- */
function dressLine(w, l, plan, ex) {
  const c = l.c;
  const alongZ = l.axis === 'z';
  const a = l.a;
  const b = l.b;
  const seed = plan.seed;
  const ps = hh(seed, c * 2 + (alongZ ? 1 : 0), UT.JR_PROP) & 1 ? 1 : -1; // boru yanı
  const lo = alongZ ? w.z0 : w.x0;
  const hi2 = alongZ ? w.z1 : w.x1;
  for (let t = Math.max(lo, a); t < Math.min(hi2, b + 1); t++) {
    const cross = nearNode(t) <= 3;
    // lamba: kabuğun LIGHT'ı → sönük kehribar neon (16'da bir); aradaki (32'de bir) soğuk holo panel (zayıf mavi ışık: yol okunur)
    if ((t & 15) === 8) {
      const lx = alongZ ? c : t;
      const lz = alongZ ? t : c;
      if (w.get(lx, 35, lz) === ID.LIGHT) w.set(lx, 35, lz, ID.NEON_AMBER);
    } else if ((t & 31) === 0 && nearNode(t) > 8) {
      const lx = alongZ ? c : t;
      const lz = alongZ ? t : c;
      if (w.get(lx, 35, lz) === ID.STONE_BRICK) w.set(lx, 35, lz, ID.HOLO);
    }
    if (cross) continue;
    // boru (üst sıra, yan hücre): demir, 8'de bir bakır halka
    const px = alongZ ? c + ps * 2 : t;
    const pz = alongZ ? t : c + ps * 2;
    if (w.get(px, 34, pz) === AIR) w.set(px, 34, pz, (t & 7) === 0 ? B.COPPER_BLOCK : ID.IRON);
    // zemin yosunu (orta sütun hariç) ve duvar yosunu
    for (let o = -2; o <= 2; o++) {
      if (o === 0) continue;
      const fx = alongZ ? c + o : t;
      const fz = alongZ ? t : c + o;
      if (cellHash(fx, fz, 0x5e1) % 100 < 7 && w.get(fx, 30, fz) === B.COBBLE) w.set(fx, 30, fz, B.MOSS);
    }
    for (let sd = -1; sd <= 1; sd += 2) {
      const wx = alongZ ? (sd > 0 ? c + 3 : c - 3) : t;
      const wz = alongZ ? t : (sd > 0 ? c + 3 : c - 3);
      if (cellHash(wx, wz, 0x5e2) % 100 < 9 && w.get(wx, 32, wz) === ID.STONE_BRICK && !ex.inside(wx, 32, wz)) w.set(wx, 32, wz, B.MOSS);
    }
  }
}

function dressTunnels(w, plan) {
  const ex = sewerExtras(plan);
  const lines = plan.underground.sewer.lines;
  for (let q = 0; q < lines.length; q++) {
    const l = lines[q];
    if (l.axis === 'z' ? !w.touches(l.c - 3, l.a, l.c + 4, l.b + 1) : !w.touches(l.a, l.c - 3, l.b + 1, l.c + 4)) continue;
    dressLine(w, l, plan, ex);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Kavşak odası
 * ---------------------------------------------------------------------------------------------- */
const SPRITES = Object.freeze([
  // 3×4 piksel resimler ('#' = renk A, 'o' = renk B); üstten alta
  ['#.#', '.#.', '.#.', '#.#'], // çiçek-yıldız
  ['###', '#o#', '###', '.#.'], // gülen yüz
  ['.#.', '###', '.#.', '.#.'], // ok
  ['.#.', '###', '###', '.#.'], // elmas
  ['#.#', '###', '#.#', '###'], // dalga
  ['.o.', 'o#o', '.o.', '.#.'], // yıldız
]);
const MURAL_A = Object.freeze([B.CONCRETE_ORANGE, B.CONCRETE_PURPLE, B.CONCRETE_GREEN, B.CONCRETE_BLUE, B.CONCRETE_YELLOW, B.CONCRETE_RED]);
const MURAL_B = Object.freeze([B.CONCRETE_YELLOW, B.CONCRETE_WHITE, B.CONCRETE_WHITE, B.CONCRETE_WHITE, B.CONCRETE_BLACK, B.CONCRETE_YELLOW]);

/** Kavşak odasının duvar dilimleri: 4 duvar × 2 yan (kolun iki yanında 3 hücrelik şerit). */
function wallSegments() {
  const out = [];
  for (let d = 0; d < 4; d++) {
    // d: 0 K(−z), 1 D(+x), 2 G(+z), 3 B(−x)
    for (let sd = 0; sd < 2; sd++) out.push({ d, sd, id: d * 2 + sd });
  }
  return out;
}

/** (d, sd, k=0..2 şerit içi, y) → duvar yüzü hücresi (halka |d|=6) ve içe bakış yönü. */
function segCell(J, seg, k, y) {
  const off = seg.sd === 0 ? 3 + k : -(3 + k); // kolun yanı: +3..+5 ya da −3..−5
  switch (seg.d) {
    case 0: return { x: J.x + off, y, z: J.z - 6, nx: 0, nz: 1 };
    case 1: return { x: J.x + 6, y, z: J.z + off, nx: -1, nz: 0 };
    case 2: return { x: J.x + off, y, z: J.z + 6, nx: 0, nz: -1 };
    default: return { x: J.x - 6, y, z: J.z + off, nx: 1, nz: 0 };
  }
}

function segKind(seed, J, seg) {
  const r = hh(seed, J.id * 8 + seg.id, UT.JR_GRAF) % 100;
  if (r < 45) return 'mural';
  if (r < 62) return 'servis';
  return 'duz';
}

function emitJunction(w, J, plan) {
  const b = J.box;
  if (!w.touches(b.x0, b.z0, b.x1, b.z1) || !w.touchesY(b.y0, b.y1)) return;
  const seed = plan.seed;
  const cx = J.x;
  const cz = J.z;
  const top = FY + XS.jrH; // 37 tavan bloğu
  // 1) ham taşı tuğlaya: duvar halkası |d|=6 (y31..36), tavan, zemin
  stoneToBrick(w, cx - 6, FY, cz - 6, cx + 7, top, cz + 7, ID.STONE_BRICK);
  stoneToBrick(w, cx - 6, top, cz - 6, cx + 7, top + 1, cz + 7, ID.STONE_BRICK);
  // 2) temiz hacim 11×11×6 (kollar açık kalır: oyma kolları da kapsar)
  w.box(cx - 5, FY, cz - 5, cx + 6, top, cz + 6, AIR);
  // 3) zemin deseni
  const x0 = Math.max(cx - 5, w.x0);
  const x1 = Math.min(cx + 6, w.x1);
  const z0 = Math.max(cz - 5, w.z0);
  const z1 = Math.min(cz + 6, w.z1);
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      const dx = Math.abs(x - cx);
      const dz = Math.abs(z - cz);
      const m = Math.max(dx, dz);
      let id = B.COBBLE;
      if (dx <= 1 && dz <= 1) id = ID.IRON; // ızgara
      else if (m <= 3 && ((dx + dz) & 1) === 0) id = ID.POLISHED;
      else if (m === 5) id = ID.STONE_BRICK;
      w.set(x, FY - 1, z, id);
    }
  }
  // 4) süpürgelik (koyu bant) + duvar şeritleri
  for (let d = 0; d < 4; d++) {
    for (let k = -5; k <= 5; k++) {
      const wx = d === 1 ? cx + 6 : d === 3 ? cx - 6 : cx + k;
      const wz = d === 0 ? cz - 6 : d === 2 ? cz + 6 : cz + k;
      if (Math.abs(k) <= 2) continue; // kol açıklığı
      wallSet(w, wx, FY, wz, ID.FACADE_DARK);
    }
  }
  const segs = wallSegments();
  for (let q = 0; q < segs.length; q++) {
    const seg = segs[q];
    const kind = segKind(seed, J, seg);
    const spr = hi(seed, J.id * 8 + seg.id, UT.JR_GRAF + 5, SPRITES.length);
    for (let k = 0; k < 3; k++) {
      for (let y = FY + 1; y <= FY + 4; y++) {
        const c = segCell(J, seg, k, y);
        if (c.x < w.x0 || c.x >= w.x1 || c.z < w.z0 || c.z >= w.z1) continue;
        let id = ID.STONE_BRICK;
        if (kind === 'mural') {
          const row = SPRITES[spr][FY + 4 - y];
          const ch = row[seg.sd === 0 ? k : 2 - k];
          id = ch === '#' ? MURAL_A[spr] : ch === 'o' ? MURAL_B[spr] : ID.FACADE_DARK;
        } else if (kind === 'servis') {
          id = ((k + y) & 1) === 0 ? B.CONCRETE_YELLOW : B.CONCRETE_BLACK;
        }
        wallSet(w, c.x, c.y, c.z, id);
      }
    }
  }
  // 5) sütunlar (±3,±3): koyu gövde + camgöbeği halka + tepede lamba (4 lamba)
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      const px = cx + sx * 3;
      const pz = cz + sz * 3;
      w.col(px, pz, FY, FY + 5, ID.FACADE_DARK);
      w.set(px, FY + 2, pz, ID.NEON_CYAN);
      w.set(px, FY + 5, pz, ID.NEON_AMBER);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Grafiti duvarı: kolun 8..14. hücrelerinde, yan duvarın (|d|=3) y31..33 boş beton paneli (7×3) + neon çerçeve (üst)
 * ---------------------------------------------------------------------------------------------- */
export function panelOf(seed, J, k) {
  let arm = hh(seed, J.id * 4 + k, UT.JR_GRAF + 9) & 3;
  for (let t = 0; t < 4; t++) {
    const ax = arm === 1 ? J.x + 14 : arm === 3 ? J.x - 14 : J.x;
    const az = arm === 2 ? J.z + 14 : arm === 0 ? J.z - 14 : J.z;
    if (Math.abs(ax) <= 720 && Math.abs(az) <= 720 && (arm === 0 || arm === 2 || Math.abs(J.z) <= 720)) break;
    arm = (arm + 1) & 3;
  }
  const sgn = (hh(seed, J.id * 4 + k, UT.JR_GRAF + 11) & 1) === 0 ? 1 : -1;
  const dx = arm === 1 ? 1 : arm === 3 ? -1 : 0;
  const dz = arm === 2 ? 1 : arm === 0 ? -1 : 0;
  // yan duvar hücresi: kol x boyunca ise z = J.z ± 3 (+ tarafı z+3, − tarafı z−3), z boyunca ise x benzer
  const wallX = dz !== 0 ? J.x + (sgn > 0 ? 3 : -3) : null;
  const wallZ = dx !== 0 ? J.z + (sgn > 0 ? 3 : -3) : null;
  const t0 = 8;
  const rect = dx !== 0
    ? { x0: Math.min(J.x + dx * t0, J.x + dx * (t0 + 6)), x1: Math.max(J.x + dx * t0, J.x + dx * (t0 + 6)) + 1, z0: wallZ, z1: wallZ + 1 }
    : { x0: wallX, x1: wallX + 1, z0: Math.min(J.z + dz * t0, J.z + dz * (t0 + 6)), z1: Math.max(J.z + dz * t0, J.z + dz * (t0 + 6)) + 1 };
  return { rect, arm, sgn, dx, dz };
}

function emitPanels(w, plan, ex) {
  const l = ex.itemsIn(w.x0, w.z0, w.x1, w.z1, 16); // panel merkezden ≤15 uzakta: komşu chunk öğeleri de
  for (let q = 0; q < l.length; q++) {
    if (l[q].type !== 'jr') continue;
    const J = l[q].ref;
    for (let k = 0; k < 2; k++) {
      const P = panelOf(plan.seed, J, k);
      const r = P.rect;
      if (!w.touches(r.x0, r.z0, r.x1, r.z1)) continue;
      for (let z = Math.max(r.z0, w.z0); z < Math.min(r.z1, w.z1); z++) {
        for (let x = Math.max(r.x0, w.x0); x < Math.min(r.x1, w.x1); x++) {
          wallSet(w, x, FY, z, B.CONCRETE_WHITE);
          wallSet(w, x, FY + 1, z, B.CONCRETE_WHITE);
          wallSet(w, x, FY + 2, z, B.CONCRETE_WHITE);
          wallSet(w, x, FY + 3, z, k === 0 ? ID.NEON_PINK : ID.NEON_CYAN);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Gizli oda
 * ---------------------------------------------------------------------------------------------- */
const TH = Object.freeze([
  { floor: B.PLANKS_PINE, wall: ID.STONE_BRICK, trim: ID.IRON, skirt: B.PLANKS_OAK },
  { floor: ID.FACADE_DARK, wall: ID.FACADE_LIGHT, trim: B.COPPER_BLOCK, skirt: ID.FACADE_DARK },
  { floor: B.GRASS, wall: ID.STONE_BRICK, trim: B.MOSS, skirt: B.MOSS },
  { floor: B.PLANKS_OAK, wall: ID.STONE_BRICK, trim: B.PLANKS_ACACIA, skirt: B.PLANKS_ACACIA },
  { floor: B.CLOTH_BLUE, wall: ID.STONE_BRICK, trim: ID.WHITE, skirt: B.PLANKS_BIRCH },
  { floor: B.PLANKS_ACACIA, wall: ID.STONE_BRICK, trim: ID.NEON_PINK, skirt: ID.FACADE_DARK },
]);

/** Gizli odanın yerel koordinatları: u 0..7 (hat boyunca), v 4..10 (hattan uzaklık). */
function hloc(H) {
  const s = H.side;
  const c = H.line;
  const p = H.p;
  const z = H.axis === 'z';
  return {
    cell(u, v) {
      return z ? [c + s * v, p - 3 + u] : [p - 3 + u, c + s * v];
    },
    /** yerel [u0,u1)×[v0,v1) → dünya yarı açık dikdörtgen */
    rect(u0, v0, u1, v1) {
      const a = this.cell(u0, v0);
      const b2 = this.cell(u1 - 1, v1 - 1);
      return { x0: Math.min(a[0], b2[0]), x1: Math.max(a[0], b2[0]) + 1, z0: Math.min(a[1], b2[1]), z1: Math.max(a[1], b2[1]) + 1 };
    },
    /** süreklirenk nokta (u,v ondalık; hücre merkezi u+.5) → [x,z] */
    pt(u, v) {
      return z ? [c + s * v + (s > 0 ? 0 : 1), p - 3 + u] : [p - 3 + u, c + s * v + (s > 0 ? 0 : 1)];
    },
    towardYaw: z ? (s > 0 ? 3 : 1) : (s > 0 ? 2 : 0),
    backYaw: z ? (s > 0 ? 1 : 3) : (s > 0 ? 0 : 2),
    alongYaw: z ? [2, 0] : [3, 1], // u azalan / u artan yönüne bakış
  };
}

function emitHidden(w, H, plan) {
  const b = H.box;
  if (!w.touches(b.x0, b.z0, b.x1, b.z1) || !w.touchesY(b.y0, b.y1)) return;
  const th = TH[H.theme];
  const L = hloc(H);
  // duvar kabuğu (kapı katmanı v=3 tünel tuğlası olarak KALIR)
  for (let u = -1; u <= 8; u++) {
    for (let v = 4; v <= 11; v++) {
      const edge = u === -1 || u === 8 || v === 11;
      if (!edge) continue;
      const cell = L.cell(u, v);
      w.col(cell[0], cell[1], FY - 1, FY + XS.hrH + 1, th.wall);
    }
  }
  // tavan, temiz hacim, zemin
  const R = L.rect(0, 4, 8, 11);
  w.box(R.x0, FY + XS.hrH, R.z0, R.x1, FY + XS.hrH + 1, R.z1, ID.STONE_BRICK);
  w.box(R.x0, FY, R.z0, R.x1, FY + XS.hrH, R.z1, AIR);
  w.box(R.x0, FY - 1, R.z0, R.x1, FY, R.z1, th.floor);
  // iç duvar bantları (tema): duvar halkası hücrelerinde (oda havasına girmez): alt etek + üst şerit
  for (let u = -1; u <= 8; u++) {
    for (let v = 4; v <= 11; v++) {
      if (!(u === -1 || u === 8 || v === 11)) continue;
      const cell = L.cell(u, v);
      w.set(cell[0], FY, cell[1], th.skirt);
      w.set(cell[0], FY + 3, cell[1], th.trim);
    }
  }
  // tema süsü
  themeFeatures(w, H, L, plan);
  // aydınlatma: 2 fener (ışık ≤ 4/oda)
  const l1 = L.cell(1, 9);
  const l2 = L.cell(6, 9);
  w.set(l1[0], FY + XS.hrH - 1, l1[1], ID.LANTERN);
  w.set(l2[0], FY + XS.hrH - 1, l2[1], H.theme === 2 ? ID.NEON_LIME : ID.LANTERN);
  // kapı kapalı hâli: tünel tuğlası (zaten yazılı); ele veren işaret: yosun (tarayıcı/düğme)
  if (H.unlock !== 'kod') {
    const t = L.cell(2, 3);
    w.set(t[0], FY + 1, t[1], B.MOSS);
  }
}

function themeFeatures(w, H, L) {
  switch (H.theme) {
    case 3: { // arşiv: kitaplık duvarı (arka sıra v=10, y31..33) + okuma halısı
      for (let u = 0; u < 8; u++) {
        const cell = L.cell(u, 10);
        for (let y = FY; y < FY + 3; y++) w.set(cell[0], y, cell[1], B.BOOKSHELF);
      }
      const R = L.rect(2, 5, 6, 9);
      w.box(R.x0, FY - 1, R.z0, R.x1, FY, R.z1, B.CLOTH_RED);
      break;
    }
    case 4: { // çalışma: halı
      const R = L.rect(1, 5, 7, 9);
      w.box(R.x0, FY - 1, R.z0, R.x1, FY, R.z1, B.CLOTH_BLUE);
      break;
    }
    case 5: { // müzik: sahne platformu (plaka, 2 derin) + neon şerit
      const R = L.rect(1, 9, 7, 11);
      w.box(R.x0, FY, R.z0, R.x1, FY + 1, R.z1, B.SLAB);
      for (let u = 1; u < 7; u++) {
        const cell = L.cell(u, 11);
        w.set(cell[0], FY + 2, cell[1], ID.NEON_PINK);
      }
      break;
    }
    default:
  }
}

/* ------------------------------------------------------------------------------------------------
 * Ana giriş
 * ---------------------------------------------------------------------------------------------- */
export function emitSewerContent(w, plan) {
  if (!w.touchesY(XS.floorY - 3, XS.floorY + XS.jrH + 3)) return;
  dressTunnels(w, plan);
  const ex = sewerExtras(plan);
  emitPanels(w, plan, ex);
  const l = ex.itemsIn(w.x0, w.z0, w.x1, w.z1, 0);
  // sabit sıra: önce kavşak odaları, sonra gizli odalar
  for (let q = 0; q < l.length; q++) if (l[q].type === 'jr') emitJunction(w, l[q].ref, plan);
  for (let q = 0; q < l.length; q++) if (l[q].type === 'hr') emitHidden(w, l[q].ref, plan);
}

/* ------------------------------------------------------------------------------------------------
 * Keşif çapaları ve kilit planı
 * ---------------------------------------------------------------------------------------------- */
/** Kavşak odalarındaki grafiti duvarları (7×3 boş beton panel; kolun 8..14. hücreleri) — 2 panel / oda. */
export function junctionAnchors(plan) {
  const ex = sewerExtras(plan);
  const out = [];
  for (let q = 0; q < ex.junctions.length; q++) {
    const J = ex.junctions[q];
    for (let k = 0; k < 2; k++) {
      const P = panelOf(plan.seed, J, k);
      const r = P.rect;
      out.push({
        id: 'jg' + J.id + '_' + k, junction: J.id, arm: P.arm, side: P.sgn,
        x: (r.x0 + r.x1) / 2, y: FY + 1, z: (r.z0 + r.z1) / 2, w: 7, h: 3, rect: r,
      });
    }
  }
  return out;
}

export function hiddenAnchors(plan) {
  return sewerExtras(plan).hidden.map((H) => ({
    id: H.id, district: H.district, theme: HR_THEMES[H.theme].name, unlock: H.unlock,
    x: H.center.x + 0.5, y: FY, z: H.center.z + 0.5, trigger: H.clear,
  }));
}

/** Gizli odanın kilidi + (düğme/kod) çapaları. Kilit kimliği 'h<k>'. */
export function hiddenLockPlan(plan, H) {
  const id = 'h' + H.id;
  const wallIn = (s) => (H.axis === 'z' ? (s > 0 ? H.line + 3 : H.line - 2) : (s > 0 ? H.line + 3 : H.line - 2));
  // duvar üstü prop: tünel iç yüzü (kapı tarafı: +side, karşı: −side)
  const onWall = (sideSign, along, y) => {
    const plane = wallIn(sideSign) + (sideSign > 0 ? -0.0625 : 0.0625);
    const x = H.axis === 'z' ? plane : along + 0.5;
    const z = H.axis === 'z' ? along + 0.5 : plane;
    const yaw = H.axis === 'z' ? (sideSign > 0 ? 3 : 1) : (sideSign > 0 ? 2 : 0);
    return { x, y, z, yaw };
  };
  const door = H.door.cells.map((c) => ({ x: c.x, y: FY, z: c.z }));
  if (H.unlock === 'tarayici') {
    return { lock: mkLock(id, 'serbest', 0, { reveal: 'tarayici', range: 12, room: H.id }) };
  }
  if (H.unlock === 'dugme') {
    const along = H.p + (hh(plan.seed, H.id, UT.HR_CLUE) & 1 ? 6 : -5);
    const pad = onWall(-H.side, along, FY + 1.25);
    return { lock: mkLock(id, 'serbest', 0, { trigger: 'dugme', room: H.id, button: { x: pad.x, y: pad.y, z: pad.z } }), button: pad, door };
  }
  // kod: tuş takımı kapının yanında, ipucu notu karşı duvarda 9–14 hücre ötede
  const pad = onWall(H.side, H.p - 2, FY + 1.25);
  let q = H.p + 11;
  if (nearNode(q) < 6) q = H.p - 11;
  if (nearNode(q) < 6) q = H.p + 9;
  const note = onWall(-H.side, q, FY + 1.5);
  const digits = 3 + (hh(plan.seed, H.id, UT.HR_CODE + 1) & 1);
  const code = codeOf(plan.seed, H.id, digits);
  return {
    lock: mkLock(id, 'kod', 1, {
      room: H.id, digits, code, pad: { x: pad.x, y: pad.y, z: pad.z }, clue: { x: note.x, y: note.y, z: note.z, text: 'Bakım defteri: kapı kodu ' + code.split('').join('-') + '.' },
    }),
    pad,
    note,
    door,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Proplar
 * ---------------------------------------------------------------------------------------------- */
const PROP_CACHE = new WeakMap();

/** Kart-1 sağlayıcısı: kilidi kod gerektirmeyen (tarayıcı/düğme) gizli odalardan, Merkez bölgesinde tohumdan en küçük hash'li olan. */
export function kart1RoomId(plan) {
  const ex = sewerExtras(plan);
  let best = null;
  for (let i = 0; i < ex.hidden.length; i++) {
    const H = ex.hidden[i];
    if (H.unlock === 'kod') continue;
    const key = (H.district === 'merkez' ? 0 : 1) * 4294967296 + hh(plan.seed, H.id, UT.HR_CLUE + 5);
    if (best === null || key < best.key) best = { key, id: H.id };
  }
  return best.id;
}

function junctionProps(plan, J) {
  const hit = PROP_CACHE.get(J);
  if (hit) return hit;
  const seed = plan.seed;
  const out = [];
  let slot = 0;
  const base = PSEUDO.sewer + (J.id % 400);
  const ox = J.x + 0.5;
  const oz = J.z + 0.5;
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      const r = hh(seed, J.id * 4 + (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0), UT.JR_PROP) % 5;
      if (r >= 3) continue;
      // odanın sürekli merkezi (cx+0.5, cz+0.5); temiz hacim ±5.5, kollar ±2.5, sütun ofset [2.5,3.5]²
      if (r === 0) { // sıra: doğu/batı duvarı boyunca
        out.push(mkSpec(base, slot++, 'bekleme_sirasi', ox + sx * 5.05, FY, oz + sz * 4.1, dirYaw(-sx, 0), r));
      } else if (r === 1) { // tezgâh: kuzey/güney duvarı boyunca
        out.push(mkSpec(base, slot++, 'is_tezgahi', ox + sx * 4.1, FY, oz + sz * 4.95, dirYaw(0, -sz), r));
      } else {
        out.push(mkSpec(base, slot++, 'koli_yigini', ox + sx * 4.45, FY, oz + sz * 4.45, dirYaw(-sx, -sz), r));
      }
    }
  }
  PROP_CACHE.set(J, out);
  return out;
}

/*
 * Tema başına prop tablosu: [anahtar, bağ, konum, varyant, yOfset?]
 *  bağ 'B' arka duvar (v=11 düzlemi; konum = u merkezi; hatta bakar) · 'L' sol duvar (u=0; konum = v; +u'ya bakar) · 'R' sağ duvar (u=8; konum = v; −u'ya bakar)
 *  bağ 'C' serbest zemin (konum = [u,v]; 'back' = arka duvara bakar)
 * Derinlik prop tanımından hesaplanır (duvara yaslı); arka sıra v=10 yalnız arşivde kitaplık bloğudur.
 */
const THEME_PROPS = Object.freeze([
  [['koli_yigini', 'B', 1.3, 0], ['koli_yigini', 'B', 6.7, 1], ['raf_unitesi', 'B', 4.0, 0], ['koli', 'L', 8.4, 2], ['koli', 'R', 8.0, 1]],
  [['is_tezgahi', 'B', 1.6, 0], ['robot_kol', 'B', 6.5, 0], ['alet_duvari', 'B', 4.0, 0, 1.0], ['takim_dolabi', 'L', 8.6, 0], ['takim_dolabi', 'R', 8.2, 0]],
  [['sera_rafi', 'B', 1.7, 0], ['sera_rafi', 'B', 6.3, 1], ['saksi_buyuk', 'L', 8.6, 1], ['saksi_buyuk', 'R', 8.6, 2], ['saksi_buyuk', 'B', 4.0, 3]],
  [['calisma_masasi', 'C', [4.0, 8.7, 'back'], 0], ['sandalye', 'C', [4.0, 7.5, 'back'], 1], ['kitap_yigini', 'L', 8.5, 2, 0], ['saksi_buyuk', 'R', 8.6, 3]],
  [['calisma_masasi', 'B', 4.0, 0], ['sandalye', 'C', [4.0, 9.3, 'back'], 1], ['akvaryum', 'B', 6.9, 0], ['saksi_buyuk', 'L', 8.6, 3], ['saksi_buyuk', 'R', 8.6, 1]],
  [['dj_standi', 'B', 4.0, 0, 0.5], ['hoparlor', 'B', 1.4, 0, 0.5], ['hoparlor', 'B', 6.6, 1, 0.5], ['puf', 'C', [6.2, 6.2, 'line'], 2], ['puf', 'C', [1.8, 6.2, 'line'], 1]],
]);

function hiddenProps(plan, H) {
  const hit = PROP_CACHE.get(H);
  if (hit) return hit;
  const L = hloc(H);
  const out = [];
  const base = PSEUDO.hidden + H.id;
  let slot = 0;
  const T = THEME_PROPS[H.theme];
  for (let q = 0; q < T.length; q++) {
    const [key, anchor, pos, variant, yoff] = T[q];
    const d = getCatalogDef(key) || getPropDef(key);
    const depth = d.size[2];
    let u;
    let v;
    let yaw;
    if (anchor === 'B') {
      u = pos;
      v = 11 - depth / 2 - 0.02;
      yaw = L.towardYaw;
    } else if (anchor === 'L') {
      u = depth / 2 + 0.02;
      v = pos;
      yaw = L.alongYaw[1];
    } else if (anchor === 'R') {
      u = 8 - depth / 2 - 0.02;
      v = pos;
      yaw = L.alongYaw[0];
    } else {
      u = pos[0];
      v = pos[1];
      yaw = pos[2] === 'back' ? L.backYaw : L.towardYaw;
    }
    const p = L.pt(u, v);
    out.push(mkSpec(base, slot++, key, p[0], FY + (yoff || 0), p[1], yaw, variant));
  }
  const lp = hiddenLockPlan(plan, H);
  if (lp.pad) out.push(mkSpec(base, slot++, 'kod_paneli', lp.pad.x, FY + 1.25, lp.pad.z, lp.pad.yaw, H.unlock === 'dugme' ? 1 : 0, { lockId: lp.lock.id }));
  if (lp.button) out.push(mkSpec(base, slot++, 'kod_paneli', lp.button.x, lp.button.y, lp.button.z, lp.button.yaw, 1, { lockId: lp.lock.id }));
  if (lp.note) out.push(mkSpec(base, slot++, 'kod_notu', lp.note.x, lp.note.y, lp.note.z, lp.note.yaw, 0, { lockId: lp.lock.id }));
  if (H.id === kart1RoomId(plan)) {
    const dd = getCatalogDef('dolap');
    const p = L.pt(dd.size[2] / 2 + 0.02, 6.0);
    out.push(mkSpec(base, slot++, 'dolap', p[0], FY, p[1], L.alongYaw[1], 0, { gives: 'kart_1' }));
  }
  PROP_CACHE.set(H, out);
  return out;
}

function overlapRect(a, r) {
  return a.x0 < r.x1 && a.x1 > r.x0 && a.z0 < r.z1 && a.z1 > r.z0;
}

export function sewerPropSpecs(plan, rect, out) {
  const ex = sewerExtras(plan);
  const seen = new Set();
  const cx0 = Math.floor(rect.x0 / 16);
  const cx1 = Math.floor((rect.x1 - 1) / 16);
  const cz0 = Math.floor(rect.z0 / 16);
  const cz1 = Math.floor((rect.z1 - 1) / 16);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const l = ex.chunkIndex.get(cx + ',' + cz);
      if (!l) continue;
      for (let q = 0; q < l.length; q++) {
        const it = l[q];
        if (it.type === 'ms' || seen.has(it.ref) || !overlapRect(it.box, rect)) continue;
        seen.add(it.ref);
        const list = it.type === 'jr' ? junctionProps(plan, it.ref) : hiddenProps(plan, it.ref);
        for (let k = 0; k < list.length; k++) out.push(list[k]);
      }
    }
  }
  return out;
}

export { hloc };
