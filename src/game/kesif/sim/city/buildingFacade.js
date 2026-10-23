/*
 * KEŞİF sim/city — CEPHE planı ve cephe blok fonksiyonu (saf, O(1) hücre sorgusu, belirlenimci). design_city §4.3, sözleşme §1.17.
 *
 * Kat 4 blok: relY 0 = döşeme/denizlik (panel), relY 1..2 = pencere/duvar (2 yüksek), relY 3 = lento/denizlik paneli. Zemin kat ayak seviyesi y=64
 * (kat f taban bloğu y=63+4f). Bay genişliği style.bayW ∈ [3,5]; bay içi hücre `cell` ∈ [0,bayW): cell 0 = kolon, diğerleri pencere
 * ('curtain': tüm kalanlar; 'punched': ilk ve son hücre duvar, ortası pencere).
 *
 *  makeStyle(seed, lot, archetype) → style   {seed,pal,wall,walls[],panel,glass,bayW,mode,hues[],bandEvery,ribEvery,rib,band,crown,awning,
 *                                             shop,pub,container,winLit,warm}
 *  facadeBlock(style, face, floor, bay, relY, cell?, isTop?) → blok kimliği (isTop = binanın son katı: kule tacı neon) (229–238 şehir + 60/64–72/73–88 mevcut)
 *       face: 0 K(−z) 1 D(+x) 2 G(+z) 3 B(−x); bay = yüz boyunca global bay indeksi = floor(u / bayW); cell = u % bayW (varsayılan 1).
 *  windowState(style, face, floor, bay) → 0 sönük (233) · 1 sıcak (234) · 2 soğuk (235)          pencere ışığı gruba göre shader'dadır
 *  facadePlan(style, len, floors, faceIdx?) → {bays, bayW, edge: kalan hücre, signSlots:[{u0,u1,f0,f1}]}
 *  FACE_N/E/S/W
 */
import { CITY_BLOCK_IDS as B } from '../cityData.js';
import { DISTRICTS } from './archetypes.js';
import { TAG, sh, stream } from './cityPlanKit.js';

export const FACE_N = 0;
export const FACE_E = 1;
export const FACE_S = 2;
export const FACE_W = 3;
const NEON = Object.freeze([B.NEON_CYAN, B.NEON_PINK, B.NEON_AMBER, B.NEON_LIME]);

/* mevcut blok kimlikleri (blocks.js): tuğla 60, taş tuğla 61, cilalı 62, cam 64 (65–72 renkli), beton 73–80, kumaş 81–88, tahta 44–47 */
const CONCRETE_COLORS = Object.freeze([75, 76, 77, 78, 79, 80]); // kırmızı turuncu sarı yeşil mavi mor
const CLOTH_COLORS = Object.freeze([83, 84, 85, 86, 87, 88]);

const PAL = Object.freeze({
  merkez: { wall: [B.FACADE_DARK], panel: B.FACADE_DARK, glass: 71, mode: 'curtain', band: true, rib: true, crown: true, awning: false },
  gece_pazari: { wall: [60, 60, 61], panel: 62, glass: 64, mode: 'punched', band: false, rib: false, crown: false, awning: true },
  konteyner: { wall: CONCRETE_COLORS, panel: 74, glass: 64, mode: 'punched', band: false, rib: false, crown: false, awning: false },
  liman: { wall: [61, 62, 74], panel: 62, glass: 64, mode: 'punched', band: false, rib: false, crown: false, awning: false },
  teknoloji: { wall: [B.FACADE_LIGHT], panel: B.FACADE_LIGHT, glass: 64, mode: 'curtain', band: true, rib: true, crown: true, awning: false },
  tepe: { wall: [60, 44, 73], panel: 73, glass: 64, mode: 'punched', band: false, rib: false, crown: false, awning: true },
});

/** Stil: parsel + arketip + tohum → cephe parametreleri (kule/lab/ofis 'curtain', alçak binalar 'punched'). */
export function makeStyle(seed, lot, archetype, arch, blank) {
  const D0 = DISTRICTS[lot.district];
  const P = PAL[lot.district];
  const st = stream(seed, lot.id, TAG.B_STYLE);
  const tower = !!arch.tower;
  const office = archetype === 'ofis_blok' || archetype === 'lab_binasi' || tower;
  let mode = P.mode;
  if (lot.district === 'merkez' || lot.district === 'teknoloji') mode = office ? 'curtain' : 'punched';
  const bayW = 3 + st.i(3);
  const hueN = lot.district === 'merkez' ? 1 + st.i(2) : 1 + st.i(2);
  const hues = [];
  const base = st.i(D0.hues.length);
  for (let k = 0; k < hueN && k < 3; k++) hues.push(NEON[D0.hues[(base + k) % D0.hues.length]]);
  if (lot.district === 'merkez' && hues.length < 3 && st.chance(0.5)) hues.push(NEON[(D0.hues[0] + 2) % 4]);
  const walls = P.wall.slice();
  const wall = walls[st.i(walls.length)];
  const glassTint = lot.district === 'merkez' ? [71, 64, 71, 66][st.i(4)] : lot.district === 'tepe' || lot.district === 'gece_pazari' ? 64 : P.glass;
  const container = archetype === 'konteyner_yigini';
  return {
    seed: sh(seed, lot.id, TAG.B_STYLE) >>> 0,
    pal: lot.district,
    archetype,
    wall,
    walls,
    panel: P.panel,
    glass: glassTint,
    bayW,
    mode,
    hues,
    bandEvery: 8,
    ribEvery: 3,
    band: P.band && (tower || office),
    rib: P.rib && tower,
    crown: P.crown && tower,
    awning: P.awning && (archetype === 'dukkan_sirasi' || archetype === 'pazar_tezgahi' || archetype === 'kulup_binasi') ? CLOTH_COLORS[st.i(CLOTH_COLORS.length)] : 0,
    shop: archetype === 'dukkan_sirasi' || archetype === 'market' || archetype === 'kulup_binasi' || archetype === 'sinema_binasi',
    pub: arch.pub,
    container,
    winLit: 0.45,
    warm: 0.65,
    accent: hues[0],
    blank: blank || null,
  };
}

/** Pencere durumu: 0 sönük, 1 sıcak, 2 soğuk (belirlenimci; grup/eşik shader'da konum hash'inden). */
export function windowState(style, face, floor, bay) {
  const h = sh(style.seed, ((floor * 131 + bay) | 0) * 4 + face, TAG.F_LIT);
  const lit = (h & 1023) / 1024 < style.winLit;
  if (!lit) return 0;
  return ((h >>> 10) & 1023) / 1024 < style.warm ? 1 : 2;
}

function wallId(style, floor, bay) {
  const w = style.walls;
  if (style.container) {
    // her 2 bay ve kat için bir konteyner rengi
    return w[sh(style.seed, floor * 977 + (bay >> 1), TAG.F_PAL) % w.length];
  }
  return style.wall;
}

/**
 * Cephe bloğu. face 0..3, floor 0..F-1, bay ≥0, relY 0..3, cell 0..bayW-1. Yatay neon bandı her `bandEvery` katta (floor>0 && floor%8==7 → o katın
 * relY=0'ında DEĞİL, bir üstteki döşemede: floor%8==0 && floor>0), dikey kaburga her 3. bay kolonunda, tepe tacı `crownRow` ile (ctx).
 */
export function facadeBlock(style, face, floor, bay, relY, cell, isTop) {
  const c = cell === undefined ? 1 : cell;
  const bw = style.bayW;
  // grafiti için boş duvar bölgesi (zemin kat, ön yüz): pencere/kaburga yok
  if (floor === 0 && style.blank !== null && face === style.blank.faceIdx) {
    const u = bay * bw + c;
    if (u >= style.blank.u0 && u < style.blank.u1) return style.mode === 'curtain' ? style.panel : wallId(style, floor, bay);
  }
  // tepe tacı: kulenin son katının lento satırı neon (yalnız crown stilleri)
  if (isTop === true && style.crown && relY === 3) return style.hues[0];
  // yatay neon bandı: döşeme satırı
  if (relY === 0) {
    if (style.band && floor > 0 && floor % style.bandEvery === 0) return style.hues[(floor / style.bandEvery) % style.hues.length | 0];
    return style.mode === 'curtain' ? style.panel : wallId(style, floor, bay);
  }
  // dikey kaburga (kolon hücresi)
  if (style.rib && c === 0 && bay % style.ribEvery === 0 && floor >= style.pub) return style.hues[0];
  const pillar = c === 0;
  if (style.mode === 'curtain') {
    if (pillar) return style.panel;
    if (relY === 3) return style.panel;
    return windowOrGlass(style, face, floor, bay);
  }
  // punched
  const edge = c === 0 || c === bw - 1;
  if (edge) return wallId(style, floor, bay);
  if (relY === 3) {
    if (floor === 0 && style.awning) return style.awning;
    return wallId(style, floor, bay);
  }
  if (style.container) {
    // seyrek pencere: bay hash
    const h = sh(style.seed, floor * 37 + bay, TAG.F_BAY) & 3;
    if (h !== 0) return wallId(style, floor, bay);
  }
  return windowOrGlass(style, face, floor, bay);
}

function windowOrGlass(style, face, floor, bay) {
  if (floor < style.pub || (style.shop && floor === 0)) return style.glass;
  const s = windowState(style, face, floor, bay);
  return s === 0 ? B.WINDOW_DARK : s === 1 ? B.WINDOW_WARM : B.WINDOW_COOL;
}

/**
 * Bir yüzün cephe planı: len yüz uzunluğu (hücre), floors kat sayısı. Tabela yuvaları: ≥6 blok boş duvar (kolon/bay ritmine saygılı),
 * yüz başına ≤2 (arketip.signs). Boş duvar = üst katlarda pencereler arasında değil, zemin kat üstü kuşak (1. kat) ve çatı kuşağı.
 */
export function facadePlan(style, len, floors, maxSigns) {
  const bays = Math.ceil(len / style.bayW);
  const slots = [];
  const band = Math.min(8, Math.max(0, floors));
  if (len >= 8 && maxSigns > 0 && floors >= 1) {
    // yüzün üst-orta bandı (son katın döşemesi) ve zemin üstü: tabela uzunluğu 6..min(len-2, 14)
    const w = Math.min(14, len - 2);
    const u0 = Math.floor((len - w) / 2);
    slots.push({ u0, u1: u0 + w, f0: Math.min(floors - 1, 1), f1: Math.min(floors - 1, 1) });
    if (maxSigns > 1 && floors >= 3 && len >= 18) {
      slots.push({ u0: 2, u1: 2 + Math.min(8, len - 4), f0: floors - 1, f1: floors - 1 });
    }
  }
  return { bays, bayW: style.bayW, edge: len - (bays - 1) * style.bayW, signSlots: slots.slice(0, maxSigns), band };
}
