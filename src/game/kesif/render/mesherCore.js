/*
 * KEŞİF render — mesher çekirdeği (saf; three/DOM yok, worker-güvenli).
 *
 * Paylaşılan durum (modül düzeyinde, çağrılar arasında yeniden kullanılır → kare başına ayırma yok), arama tabloları,
 * dolgulu (18×130×18) blok/ışık kopyası, biyom ton ızgarası ve iki yüz üreticisi:
 *   emitFace  : eksen hizalı dörtgen; köşe başına yumuşak ışık + klasik 4-köşe AO + anizotropi düzeltmeli çapraz seçimi
 *   emitFree  : serbest dörtgen (çapraz bitki, meşale, sarmaşık)
 * Dolgulu indeks: ((y+1)*18 + (z+1))*18 + (x+1)  (x,z yerel -1..16, y = bant-yerel -1..ns*16; bant = ns kesit, ns ≤ MAX_BAND_SECTIONS).
 */
import {
  B, BLOCKS, OPAQUE_LUT, FILTER_LUT,
} from '../sim/blocks.js';
import { BIOME_KEYS, CHUNK_SIZE, SECTION_H } from '../sim/constants.js';
import { BIOME_INFO } from '../sim/biomeData.js';
import { fillCityFace, zeroCityVerts } from './mesherCity.js';

/** Bir mesh "bandı" en çok bu kadar 16'lık kesit yüksekliğinde olur (mesh bandı = chunk sütununun dikey dilimi). */
export const MAX_BAND_SECTIONS = 9;
export const PW = CHUNK_SIZE + 2; // 18
export const PH = MAX_BAND_SECTIONS * SECTION_H + 2; // 146
export const SX = 1;
export const SZ = PW;
export const SY = PW * PW; // 324
export const P = new Uint8Array(PW * PH * PW);
export const L = new Uint8Array(PW * PH * PW);

/* ------------------------------------------------------------------------------------------------
 * Sabitler ve bayrak kodlaması
 * ---------------------------------------------------------------------------------------------- */
/** `flags[0]` bitleri: 0-1 rüzgâr sınıfı, 2-4 malzeme türü, 5 akış, 6 yumuşak (normal harita yok). */
export const FLAG = Object.freeze({
  WIND_MASK: 3, KIND_SHIFT: 2, KIND_MASK: 7, FLOW: 32, SOFT: 64,
});
export const WIND = Object.freeze({ NONE: 0, LEAVES: 1, PLANT: 2, VINE: 3 });
export const KIND = Object.freeze({
  SOLID: 0, WATER: 1, LAVA: 2, SEAL: 3, PORTAL: 4, GLASS: 5, ICE: 6, GLOW: 7,
});
export const SHAPE_ID = Object.freeze({
  CUBE: 0, CROSS: 1, BOX: 2, STAIR: 3, FENCE: 4, TORCH: 5, PLATE: 6, LANTERN: 7, LIQUID: 8, VINE: 9,
});
export const PASS = Object.freeze({ OPAQUE: 0, CUTOUT: 1, TRANSPARENT: 2 });

/** Sıvı üst yüzeyi bu kadar alçaktır. */
export const LIQUID_DROP = 0.12;

// Yön tabloları: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
export const NX = new Float32Array([1, -1, 0, 0, 0, 0]);
export const NY = new Float32Array([0, 0, 1, -1, 0, 0]);
export const NZ = new Float32Array([0, 0, 0, 0, 1, -1]);
export const DN = new Int32Array([SX, -SX, SY, -SY, SZ, -SZ]);
const NAX = [0, 0, 1, 1, 2, 2];
const NSG = [1, -1, 1, -1, 1, -1];
const UAX = [2, 2, 0, 0, 0, 0];
const USG = [-1, 1, 1, 1, 1, -1];
const VAX = [1, 1, 2, 2, 1, 1];
const VSG = [1, 1, -1, 1, 1, 1];
const STRIDE = [SX, SY, SZ];
const DU = new Int32Array(6);
const DV = new Int32Array(6);
for (let d = 0; d < 6; d++) {
  DU[d] = USG[d] * STRIDE[UAX[d]];
  DV[d] = VSG[d] * STRIDE[VAX[d]];
}
const SU = [0, 1, 1, 0];
const SV = [0, 0, 1, 1];

/* ------------------------------------------------------------------------------------------------
 * Arama tabloları (blok kimliği 0..255)
 * ---------------------------------------------------------------------------------------------- */
export const HAS = new Uint8Array(256);
export const PASS_LUT = new Uint8Array(256);
export const SHAPE_LUT = new Uint8Array(256);
export const OCC_LUT = new Uint8Array(256); // AO engelleyici
export const SOLID_ANY = new Uint8Array(256);
export const KIND_LUT = new Uint8Array(256);
export const WIND_LUT = new Uint8Array(256);
export const TINT_LUT = new Uint8Array(256); // 0 yok, 1 çimen, 2 yaprak, 3 su
export const NOTOP_TINT = new Uint8Array(256); // 1: tintFaces 'top' (alt yüz tonlanmaz)
export const NATURAL_LUT = new Uint8Array(256); // rastgele döndürme/parlaklık
export const FAMILY = new Uint8Array(256); // 1 su, 2 lav
export const CULL = new Uint8Array(65536); // CULL[a*256+b]=1 → a'nın b'ye bakan tam yüzü çizilmez
export const FLOW_LUT = new Uint8Array(256);

const TINT_CODE = { grass: 1, foliage: 2, water: 3 };

(function buildLuts() {
  for (let id = 1; id < BLOCKS.length; id++) {
    const r = BLOCKS[id];
    if (!r) continue;
    HAS[id] = 1;
    let pass = r.layer === 'opaque' ? 0 : r.layer === 'cutout' ? 1 : 2;
    if (r.liquid && (id === B.LAVA || id === B.LAVA_FLOW)) pass = 0;
    PASS_LUT[id] = pass;
    let sh = SHAPE_ID.CUBE;
    if (r.liquid) sh = SHAPE_ID.LIQUID;
    else if (r.shape === 'cross') sh = id === B.VINE ? SHAPE_ID.VINE : SHAPE_ID.CROSS;
    else if (r.shape === 'torch') sh = id === B.LANTERN ? SHAPE_ID.LANTERN : SHAPE_ID.TORCH;
    else if (r.shape === 'plate') sh = SHAPE_ID.PLATE;
    else if (r.shape === 'stair') sh = SHAPE_ID.STAIR;
    else if (r.shape === 'fence') sh = SHAPE_ID.FENCE;
    else if (r.shape === 'slab' || r.shape === 'door') sh = SHAPE_ID.BOX;
    else if (r.shape === 'cube') sh = r.cube || r.collision.length !== 1 ? SHAPE_ID.CUBE : SHAPE_ID.BOX;
    SHAPE_LUT[id] = sh;
    OCC_LUT[id] = r.opaque || sh === SHAPE_ID.STAIR || sh === SHAPE_ID.BOX ? 1 : 0;
    SOLID_ANY[id] = r.solid ? 1 : 0;
    FAMILY[id] = id === B.WATER || id === B.WATER_FLOW ? 1 : id === B.LAVA || id === B.LAVA_FLOW ? 2 : 0;
    FLOW_LUT[id] = id === B.WATER_FLOW || id === B.LAVA_FLOW ? 1 : 0;
    let kind = KIND.SOLID;
    if (FAMILY[id] === 1) kind = KIND.WATER;
    else if (FAMILY[id] === 2) kind = KIND.LAVA;
    else if (id === B.SEAL_BARRIER) kind = KIND.SEAL;
    else if (id === B.PORTAL_BLUE || id === B.PORTAL_ORANGE) kind = KIND.PORTAL;
    else if (id === B.ICE || id === B.SLIPPERY_ICE) kind = KIND.ICE;
    else if (r.layer === 'transparent' && r.sound === 'cam') kind = KIND.GLASS;
    else if (r.emission >= 4) kind = KIND.GLOW;
    KIND_LUT[id] = kind;
    TINT_LUT[id] = r.tint ? TINT_CODE[r.tint] : 0;
    NOTOP_TINT[id] = r.tint && r.tintFaces === 'top' ? 1 : 0;
    NATURAL_LUT[id] = (r.category === 'arazi' && id !== B.BOOKSHELF && id !== B.SIGN) || (id >= B.COAL_ORE && id <= B.EMERALD_ORE) ? 1 : 0;
    let wind = WIND.NONE;
    if (r.tint === 'foliage' && sh === SHAPE_ID.CUBE && r.layer === 'cutout') wind = WIND.LEAVES;
    else if (sh === SHAPE_ID.CROSS) wind = WIND.PLANT;
    else if (sh === SHAPE_ID.VINE) wind = WIND.VINE;
    WIND_LUT[id] = wind;
  }
  for (let a = 1; a < BLOCKS.length; a++) {
    const ra = BLOCKS[a];
    if (!ra) continue;
    for (let b = 1; b < BLOCKS.length; b++) {
      const rb = BLOCKS[b];
      if (!rb) continue;
      let hide = false;
      if (ra.liquid) {
        hide = (rb.liquid && FAMILY[a] === FAMILY[b]) || rb.opaque || rb.solid;
      } else if (rb.opaque) {
        hide = true;
      } else if (ra.cullSame && a === b) {
        hide = true;
      } else if (ra.layer === 'transparent' && rb.layer === 'transparent' && !rb.liquid && a !== b) {
        hide = a > b; // iki farklı şeffaf katı: yalnız küçük kimlik ortak yüzü çizer (z-çakışması yok)
      }
      CULL[a * 256 + b] = hide ? 1 : 0;
    }
  }
})();

/* ------------------------------------------------------------------------------------------------
 * Biyom tonları
 * ---------------------------------------------------------------------------------------------- */
function srgb2lin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hexLin(h) {
  return [srgb2lin(((h >> 16) & 255) / 255), srgb2lin(((h >> 8) & 255) / 255), srgb2lin((h & 255) / 255)];
}

/** Biyom indeksi (constants.js BIOMES sırası) → [çimen, yaprak, su] sRGB hex (sim/biomeData.js BIOME_INFO.tint). */
export const BIOME_TINTS = Object.freeze({
  grass: Object.freeze(BIOME_KEYS.map((k) => BIOME_INFO[k].tint.grass)),
  foliage: Object.freeze(BIOME_KEYS.map((k) => BIOME_INFO[k].tint.foliage)),
  water: Object.freeze(BIOME_KEYS.map((k) => BIOME_INFO[k].tint.water)),
});

const tintLin = { grass: null, foliage: null, water: null };
let tintSource = null;
function prepareTints(over) {
  const src = over || BIOME_TINTS;
  if (tintSource === src) return;
  tintSource = src;
  ['grass', 'foliage', 'water'].forEach((k) => {
    const arr = (src[k] || BIOME_TINTS[k]);
    tintLin[k] = arr.map(hexLin);
  });
}

/** Ton yumuşatma: köşe başına 4×4 örnek, 4 blok aralıklı (−6,−2,+2,+6) → ~12 blokluk geçiş; biyom ızgarası −6..22 (komşu chunk'lar). */
const TINT_REACH = 6;
const BG = CHUNK_SIZE + 2 * TINT_REACH + 1; // 29 (−6..22)
const biomeGrid = new Uint8Array(BG * BG);
const TG = CHUNK_SIZE + 1; // 17 köşe
export const tintGrid = new Float32Array(TG * TG * 9);

/** Köşe başına (17×17) yumuşatılmış biyom tonları: [çimen rgb, yaprak rgb, su rgb] (doğrusal). */
export function buildTintGrid(grid, center, tintsOverride) {
  prepareTints(tintsOverride);
  for (let gz = -TINT_REACH; gz <= CHUNK_SIZE + TINT_REACH; gz++) {
    const dz = gz < 0 ? -1 : gz > 15 ? 1 : 0;
    for (let gx = -TINT_REACH; gx <= CHUNK_SIZE + TINT_REACH; gx++) {
      const dx = gx < 0 ? -1 : gx > 15 ? 1 : 0;
      let ch = grid[(dz + 1) * 3 + dx + 1];
      let lx = gx - dx * 16;
      let lz = gz - dz * 16;
      if (!ch || !ch.biomeMap) {
        ch = center;
        lx = gx < 0 ? 0 : gx > 15 ? 15 : gx;
        lz = gz < 0 ? 0 : gz > 15 ? 15 : gz;
      }
      biomeGrid[(gz + TINT_REACH) * BG + gx + TINT_REACH] = ch.biomeMap ? ch.biomeMap[lz * 16 + lx] : 0;
    }
  }
  const kinds = ['grass', 'foliage', 'water'];
  for (let cz = 0; cz < TG; cz++) {
    for (let cx = 0; cx < TG; cx++) {
      for (let k = 0; k < 3; k++) {
        const tbl = tintLin[kinds[k]];
        let r = 0;
        let g = 0;
        let b = 0;
        for (let oz = 0; oz < 4; oz++) {
          for (let ox = 0; ox < 4; ox++) {
            const bi = biomeGrid[(cz + oz * 4) * BG + cx + ox * 4];
            const c = tbl[bi] || tbl[0];
            r += c[0];
            g += c[1];
            b += c[2];
          }
        }
        const o = (cz * TG + cx) * 9 + k * 3;
        tintGrid[o] = r / 16;
        tintGrid[o + 1] = g / 16;
        tintGrid[o + 2] = b / 16;
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Dolgulu kopya
 * ---------------------------------------------------------------------------------------------- */
const NSEC = MAX_BAND_SECTIONS + 2;
const MISSING = -1;
const COLB = [];
const COLL = [];
for (let i = 0; i < 9; i++) {
  COLB.push(new Array(NSEC).fill(MISSING));
  COLL.push(new Array(NSEC).fill(MISSING));
}

/**
 * Bir sütunun (Chunk ya da tel nesnesi) s0-1 .. s0+ns kesitlerini çözer: her girdi Uint8Array(4096) | tek tip sayı (0..255);
 * sütun yoksa MISSING. Dünya tabanı altı = ana kaya (+ ışık 0), tavan üstü = hava (+ ışık 0xF0), üretilmemiş kesit = taş (+ ışık 0).
 * Tel nesnesi (işçi): {sectionCount, s0, sb:[…], sl:[…]} — sb/sl girdileri Uint8Array | sayı | null.
 */
function loadCol(c, s0, ns, outB, outL) {
  if (!c) {
    for (let k = 0; k < ns + 2; k++) {
      outB[k] = MISSING;
      outL[k] = MISSING;
    }
    return;
  }
  // eski düz biçim ({blocks, light?}: y 0..): testler / basit araçlar — kesit görünümleri çıkarılır
  const dense = c.sb === undefined && c.secGen === undefined && c.blocks !== undefined;
  const n = dense ? c.blocks.length >> 12 : c.sectionCount;
  for (let k = 0; k < ns + 2; k++) {
    const si = s0 - 1 + k;
    if (si < 0) {
      outB[k] = 100;
      outL[k] = 0;
      continue;
    }
    if (si >= n) {
      outB[k] = 0;
      outL[k] = 0xf0;
      continue;
    }
    let b;
    let l;
    if (dense) {
      b = c.blocks.subarray(si << 12, (si << 12) + 4096);
      l = c.light ? c.light.subarray(si << 12, (si << 12) + 4096) : 0xf0;
    } else if (c.sb) {
      const j = si - c.s0;
      b = j >= 0 && j < c.sb.length ? c.sb[j] : null;
      l = j >= 0 && j < c.sl.length ? c.sl[j] : null;
    } else if (c.secGen[si] === 0) {
      b = null;
      l = null;
    } else {
      b = c.secBlocks[si] !== null ? c.secBlocks[si] : c.secUniform[si];
      l = c.secLight[si] !== null ? c.secLight[si] : c.secLightU[si];
    }
    outB[k] = b === null || b === undefined ? 1 : b;
    outL[k] = l === null || l === undefined ? 0 : l;
  }
}

/** Satırdan n hücreyi (kesit dizisi bv/lv, kaynak indeks src; tek tip sayıysa sabit) dolgulu P/L'ye yazar. */
function putSeg(dst, bv, lv, src, n) {
  if (typeof bv === 'number') P.fill(bv, dst, dst + n);
  else for (let i = 0; i < n; i++) P[dst + i] = bv[src + i];
  if (typeof lv === 'number') L.fill(lv, dst, dst + n);
  else for (let i = 0; i < n; i++) L[dst + i] = lv[src + i];
}

/**
 * Merkez + 8 komşu chunk sütunundan dolgulu blok/ışık kopyası (bir mesh BANDI: kesit s0 .. s0+ns-1). grid: 3×3
 * (indeks (dz+1)*3+dx+1), merkez = grid[4]. mode (yatay komşu sütun yok): 'replicate' (merkezin kenar hücresini yay) |
 * 'air' (hava, tam gökyüzü) | 'solid' (taş). Dikey komşu kesit üretilmemişse taş sayılır (yüz çizilmez; gelince yeniden mesh'lenir).
 * @returns {number} bant-yerel en yüksek boş olmayan y (merkez sütun; yoksa -1)
 */
export function fillPadded(grid, mode, s0, ns) {
  const center = grid[4];
  for (let i = 0; i < 9; i++) loadCol(grid[i], s0, ns, COLB[i], COLL[i]);
  const rows = ns * SECTION_H;
  // merkez sütundaki en yüksek dolu satır
  let maxY = -1;
  const cbk = COLB[4];
  for (let k = ns; k >= 1 && maxY < 0; k--) {
    const bv = cbk[k];
    if (typeof bv === 'number') {
      if (bv !== 0) maxY = (k - 1) * SECTION_H + SECTION_H - 1;
      continue;
    }
    for (let ly = SECTION_H - 1; ly >= 0 && maxY < 0; ly--) {
      const o = ly << 8;
      for (let i = 0; i < 256; i++) {
        if (bv[o + i] !== 0) {
          maxY = (k - 1) * SECTION_H + ly;
          break;
        }
      }
    }
  }
  const top = Math.min(rows, maxY + 2);
  const topRow = top + 1;
  for (let yp = 0; yp <= topRow; yp++) {
    const r = yp - 1;
    const k = (r >> 4) + 1;
    const ly = r & 15;
    const yo = ly << 8;
    const rowBase = yp * SY;
    for (let pz = 0; pz < PW; pz++) {
      const lz = pz - 1;
      const dz = lz < 0 ? -1 : lz > 15 ? 1 : 0;
      const zl = lz - dz * 16;
      const dst = rowBase + pz * PW;
      for (let dxi = -1; dxi <= 1; dxi++) {
        const ci = (dz + 1) * 3 + dxi + 1;
        let bv = COLB[ci][k];
        let lv = COLL[ci][k];
        let zz = zl;
        let xl = dxi < 0 ? 15 : 0;
        if (bv === MISSING) {
          if (mode === 'air') {
            if (dxi === 0) {
              P.fill(0, dst + 1, dst + 17);
              L.fill(0xf0, dst + 1, dst + 17);
            } else {
              const di = dst + (dxi < 0 ? 0 : 17);
              P[di] = 0;
              L[di] = 0xf0;
            }
            continue;
          }
          if (mode === 'solid') {
            if (dxi === 0) {
              P.fill(1, dst + 1, dst + 17);
              L.fill(0, dst + 1, dst + 17);
            } else {
              const di = dst + (dxi < 0 ? 0 : 17);
              P[di] = 1;
              L[di] = 0;
            }
            continue;
          }
          // replicate: merkez sütunun kenar hücreleri
          bv = COLB[4][k];
          lv = COLL[4][k];
          zz = lz < 0 ? 0 : lz > 15 ? 15 : lz;
          xl = dxi < 0 ? 0 : 15;
        }
        const src = yo + (zz << 4);
        if (dxi === 0) {
          putSeg(dst + 1, bv, lv, src, 16);
        } else {
          const di = dst + (dxi < 0 ? 0 : 17);
          P[di] = typeof bv === 'number' ? bv : bv[src + xl];
          L[di] = typeof lv === 'number' ? lv : lv[src + xl];
        }
      }
    }
  }
  // üst satırlar: hava + tam gökyüzü (maxY+2'nin üstü hiçbir yüzün örnek hücresi değildir)
  const topStart = (topRow + 1) * SY;
  P.fill(0, topStart);
  L.fill(0xf0, topStart);
  if (center === null) return -1;
  return maxY;
}

/* ------------------------------------------------------------------------------------------------
 * Çıkış tamponları
 * ---------------------------------------------------------------------------------------------- */
function makePass() {
  const cap = 4096;
  return {
    cap,
    icap: cap * 3,
    pos: new Float32Array(cap * 3),
    nrm: new Float32Array(cap * 3),
    uv: new Float32Array(cap * 2),
    col: new Float32Array(cap * 4),
    lit: new Float32Array(cap * 2),
    flg: new Float32Array(cap * 4),
    cty: null, // aCity (Uint8×4): yalnız opts.city ile
    cty32: null, // aynı tamponun Uint32 görünümü (köşe başına tek yazım)
    idx: new Uint32Array(cap * 3),
    vc: 0,
    ic: 0,
    faces: 0,
  };
}
export const passes = [makePass(), makePass(), makePass()];

function grow(a, n, Ctor) {
  const b = new Ctor(n);
  b.set(a);
  return b;
}
function ensure(p, nv, ni) {
  if (p.vc + nv > p.cap) {
    let cap = p.cap;
    while (p.vc + nv > cap) cap *= 2;
    p.pos = grow(p.pos, cap * 3, Float32Array);
    p.nrm = grow(p.nrm, cap * 3, Float32Array);
    p.uv = grow(p.uv, cap * 2, Float32Array);
    p.col = grow(p.col, cap * 4, Float32Array);
    p.lit = grow(p.lit, cap * 2, Float32Array);
    p.flg = grow(p.flg, cap * 4, Float32Array);
    if (p.cty) {
      p.cty = grow(p.cty, cap * 4, Uint8Array);
      p.cty32 = new Uint32Array(p.cty.buffer);
    }
    p.cap = cap;
  }
  if (p.ic + ni > p.icap) {
    let icap = p.icap;
    while (p.ic + ni > icap) icap *= 2;
    p.idx = grow(p.idx, icap, Uint32Array);
    p.icap = icap;
  }
}
export function resetPasses(city) {
  for (let i = 0; i < 3; i++) {
    if (city && (!passes[i].cty || passes[i].cty.length < passes[i].cap * 4)) {
      passes[i].cty = new Uint8Array(passes[i].cap * 4);
      passes[i].cty32 = new Uint32Array(passes[i].cty.buffer);
    }
    passes[i].vc = 0;
    passes[i].ic = 0;
    passes[i].faces = 0;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Durum
 * ---------------------------------------------------------------------------------------------- */
export const S = {
  baseY: 0, // bandın mutlak taban y'si (rastgele sapma/rüzgâr fazı mutlak y'ye bağlı → bant bölümlemesinden bağımsız)
  pass: null, // geçerli geçiş tamponu
  ci: 0, // bloğun dolgulu indeksi
  bx: 0,
  by: 0,
  bz: 0,
  id: 0,
  uvT: null, // Float32Array doku uv tablosu
  fbits: 0,
  tint: 0, // 0..3
  tintTop: false, // yalnız üst + yan (alt yüz tonlanmaz)
  aoOn: true,
  smooth: true,
  jit: 1,
  rot: 0,
  mir: 0,
  defA: 0,
  city: false, // opts.city: aCity yaz
  cMode: 0, // blok şehir kipi (cityMesher CITY_MODE)
  cWin: 0, // pencere grubu
  cHue: false, // chunk'ta neon/holo yayıcı var mı
  region: null,
  vp: null, // Float32Array(12): köşe başına [a,b,c] (null → defA,0,0)
  aoCurve: new Float32Array([0.46, 0.64, 0.82, 1]),
  bounds: new Float32Array([1e9, 1e9, 1e9, -1e9, -1e9, -1e9]),
};

const BR = new Float32Array(4);
const AOv = new Float32Array(4);
const SKv = new Float32Array(5);
const BKv = new Float32Array(5);

const LO = new Float32Array(3);
const HI = new Float32Array(3);
const CP = new Float32Array(3);

function holds(id) {
  return FILTER_LUT[id] < 15;
}

/** Hücrenin kendisi ışık tutmuyorsa çevresindeki en parlak komşuyu kullan. */
function fallbackLight(base, d) {
  let s = 0;
  let b = 0;
  const around = [DU[d], -DU[d], DV[d], -DV[d], DU[d] + DV[d], DU[d] - DV[d], -DU[d] + DV[d], -DU[d] - DV[d]];
  for (let i = 0; i < 8; i++) {
    const j = base + around[i];
    if (holds(P[j])) {
      const v = L[j];
      if (v >> 4 > s) s = v >> 4;
      if ((v & 15) > b) b = v & 15;
    }
  }
  SKv[4] = s;
  BKv[4] = b;
}

/**
 * Eksen hizalı yüz. d: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z; (x0..z1) hücre-yerel kutu (yüz düzlemi normal ekseninde).
 * ob: ışık/AO örnek merkezinin dolgulu indeksi (verilmezse dış komşu hücre).
 */
export function emitFace(d, x0, y0, z0, x1, y1, z1, tile, ob) {
  const p = S.pass;
  ensure(p, 4, 6);
  const nax = NAX[d];
  const ns = NSG[d];
  const ua = UAX[d];
  const us = USG[d];
  const va = VAX[d];
  const vs = VSG[d];
  LO[0] = x0;
  LO[1] = y0;
  LO[2] = z0;
  HI[0] = x1;
  HI[1] = y1;
  HI[2] = z1;
  const plane = ns > 0 ? HI[nax] : LO[nax];
  const base = ob === undefined ? S.ci + DN[d] : ob;
  const dU = DU[d];
  const dV = DV[d];
  const uvt = S.uvT;
  const o4 = tile * 4;
  const tu0 = uvt[o4];
  const tv0 = uvt[o4 + 1];
  const du = uvt[o4 + 2] - tu0;
  const dv = uvt[o4 + 3] - tv0;
  const region = S.region;
  const aoOn = S.aoOn;
  const curve = S.aoCurve;
  const vbase = p.vc;
  const horizontal = d >= 4 || d < 2;
  const rot = horizontal ? 0 : S.rot;
  const mir = S.mir;
  const b = S.bounds;
  const tintKind = S.tint && !(S.tintTop && d === 3) ? S.tint : 0;
  const bxx = S.bx;
  const byy = S.by;
  const bzz = S.bz;
  const hasVp = S.vp !== null;
  const vp = S.vp;
  for (let k = 0; k < 4; k++) {
    const su = SU[k];
    const sv = SV[k];
    CP[nax] = plane;
    CP[ua] = us > 0 ? (su ? HI[ua] : LO[ua]) : (su ? LO[ua] : HI[ua]);
    CP[va] = vs > 0 ? (sv ? HI[va] : LO[va]) : (sv ? LO[va] : HI[va]);
    // uv (doku uzayı 0..1)
    let ut;
    let vt;
    if (region) {
      ut = su;
      vt = sv;
    } else {
      ut = us > 0 ? CP[ua] : 1 - CP[ua];
      vt = vs > 0 ? CP[va] : 1 - CP[va];
    }
    if (rot !== 0) {
      const tu = ut;
      const tvv = vt;
      if (rot === 1) {
        ut = 1 - tvv;
        vt = tu;
      } else if (rot === 2) {
        ut = 1 - tu;
        vt = 1 - tvv;
      } else {
        ut = tvv;
        vt = 1 - tu;
      }
    }
    if (mir) ut = 1 - ut;
    // ışık + AO
    const sx = su ? 1 : -1;
    const sy = sv ? 1 : -1;
    const i1 = base + sx * dU;
    const i2 = base + sy * dV;
    const ic = i1 + sy * dV;
    let ao = 3;
    if (aoOn) {
      const o1 = OCC_LUT[P[i1]];
      const o2 = OCC_LUT[P[i2]];
      const oc = OCC_LUT[P[ic]];
      ao = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
    }
    let sk = 0;
    let bk = 0;
    let cnt = 0;
    const idB = P[base];
    if (holds(idB)) {
      const v = L[base];
      sk += v >> 4;
      bk += v & 15;
      cnt++;
    }
    if (S.smooth) {
      const id1 = P[i1];
      const id2 = P[i2];
      const h1 = holds(id1);
      const h2 = holds(id2);
      if (h1) {
        const v = L[i1];
        sk += v >> 4;
        bk += v & 15;
        cnt++;
      }
      if (h2) {
        const v = L[i2];
        sk += v >> 4;
        bk += v & 15;
        cnt++;
      }
      if ((h1 || h2) && holds(P[ic])) {
        const v = L[ic];
        sk += v >> 4;
        bk += v & 15;
        cnt++;
      }
    }
    if (cnt === 0) {
      fallbackLight(base, d);
      sk = SKv[4];
      bk = BKv[4];
    } else {
      sk /= cnt;
      bk /= cnt;
    }
    const aoc = curve[ao];
    AOv[k] = aoc;
    SKv[k] = sk;
    BKv[k] = bk;
    BR[k] = aoc * (0.35 + 0.65 * (sk > bk ? sk : bk) / 15);
    // yazım
    const vi = vbase + k;
    const px = bxx + CP[0];
    const py = byy + CP[1];
    const pz = bzz + CP[2];
    p.pos[vi * 3] = px;
    p.pos[vi * 3 + 1] = py;
    p.pos[vi * 3 + 2] = pz;
    p.nrm[vi * 3] = NX[d];
    p.nrm[vi * 3 + 1] = NY[d];
    p.nrm[vi * 3 + 2] = NZ[d];
    if (region) {
      // bölge doku-uzayında (0..1) → atlas uv
      p.uv[vi * 2] = tu0 + du * (region[0] + (region[2] - region[0]) * ut);
      p.uv[vi * 2 + 1] = tv0 + dv * (region[1] + (region[3] - region[1]) * vt);
    } else {
      p.uv[vi * 2] = tu0 + du * ut;
      p.uv[vi * 2 + 1] = tv0 + dv * vt;
    }
    let cr = S.jit;
    let cg = S.jit;
    let cb = S.jit;
    if (tintKind) {
      const tx = Math.round(px);
      const tz = Math.round(pz);
      const gi = ((tz < 0 ? 0 : tz > 16 ? 16 : tz) * TG + (tx < 0 ? 0 : tx > 16 ? 16 : tx)) * 9 + (tintKind - 1) * 3;
      cr *= tintGrid[gi];
      cg *= tintGrid[gi + 1];
      cb *= tintGrid[gi + 2];
    }
    p.col[vi * 4] = cr * aoc;
    p.col[vi * 4 + 1] = cg * aoc;
    p.col[vi * 4 + 2] = cb * aoc;
    p.col[vi * 4 + 3] = aoc;
    p.lit[vi * 2] = sk / 15;
    p.lit[vi * 2 + 1] = bk / 15;
    p.flg[vi * 4] = S.fbits;
    if (hasVp) {
      p.flg[vi * 4 + 1] = vp[k * 3];
      p.flg[vi * 4 + 2] = vp[k * 3 + 1];
      p.flg[vi * 4 + 3] = vp[k * 3 + 2];
    } else {
      p.flg[vi * 4 + 1] = S.defA;
      p.flg[vi * 4 + 2] = 0;
      p.flg[vi * 4 + 3] = 0;
    }
    if (px < b[0]) b[0] = px;
    if (py < b[1]) b[1] = py;
    if (pz < b[2]) b[2] = pz;
    if (px > b[3]) b[3] = px;
    if (py > b[4]) b[4] = py;
    if (pz > b[5]) b[5] = pz;
  }
  if (S.city) {
    // hızlı yol: sıradan yüz (kipsiz, ışık < 8 ya da chunk'ta ton yayıcı yok) → sıfır; gerisi mesherCity.fillCityFace
    const c32 = p.cty32;
    if (S.cMode === 0 && (!S.cHue || (BKv[0] < 8 && BKv[1] < 8 && BKv[2] < 8 && BKv[3] < 8))) {
      c32[vbase] = 0;
      c32[vbase + 1] = 0;
      c32[vbase + 2] = 0;
      c32[vbase + 3] = 0;
    } else {
      fillCityFace(c32, vbase, S.cMode, S.cWin, P, S.ci, base, BKv, d === 2, S.cHue);
    }
  }
  // çapraz: en az parlaklık toplamlı köşegen (anizotropi düzeltmesi)
  const ii = p.ic;
  if (BR[0] + BR[2] > BR[1] + BR[3]) {
    p.idx[ii] = vbase + 1;
    p.idx[ii + 1] = vbase + 2;
    p.idx[ii + 2] = vbase + 3;
    p.idx[ii + 3] = vbase + 1;
    p.idx[ii + 4] = vbase + 3;
    p.idx[ii + 5] = vbase;
  } else {
    p.idx[ii] = vbase;
    p.idx[ii + 1] = vbase + 1;
    p.idx[ii + 2] = vbase + 2;
    p.idx[ii + 3] = vbase;
    p.idx[ii + 4] = vbase + 2;
    p.idx[ii + 5] = vbase + 3;
  }
  p.vc += 4;
  p.ic += 6;
  p.faces++;
}

/** emitFace'in son çağrısındaki köşe AO değerleri (test için). */
export function lastFaceAO() {
  return Array.from(AOv);
}

/** Serbest dörtgen: pos (12, chunk-yerel), uv (8, doku uzayı), sway (4). Normal (nx,ny,nz); ışık hücrenin kendisinden. */
export const FP = new Float32Array(12);
export const FUV = new Float32Array(8);
export const FA = new Float32Array(4);

export function emitFree(nx, ny, nz, tile) {
  const p = S.pass;
  ensure(p, 4, 6);
  const uvt = S.uvT;
  const o4 = tile * 4;
  const tu0 = uvt[o4];
  const tv0 = uvt[o4 + 1];
  const du = uvt[o4 + 2] - tu0;
  const dv = uvt[o4 + 3] - tv0;
  const v = L[S.ci];
  const sk = (v >> 4) / 15;
  const bk = (v & 15) / 15;
  const vbase = p.vc;
  const b = S.bounds;
  for (let k = 0; k < 4; k++) {
    const vi = vbase + k;
    const px = FP[k * 3];
    const py = FP[k * 3 + 1];
    const pz = FP[k * 3 + 2];
    p.pos[vi * 3] = px;
    p.pos[vi * 3 + 1] = py;
    p.pos[vi * 3 + 2] = pz;
    p.nrm[vi * 3] = nx;
    p.nrm[vi * 3 + 1] = ny;
    p.nrm[vi * 3 + 2] = nz;
    p.uv[vi * 2] = tu0 + du * FUV[k * 2];
    p.uv[vi * 2 + 1] = tv0 + dv * FUV[k * 2 + 1];
    let cr = S.jit;
    let cg = S.jit;
    let cb = S.jit;
    if (S.tint) {
      const tx = Math.round(px);
      const tz = Math.round(pz);
      const gi = ((tz < 0 ? 0 : tz > 16 ? 16 : tz) * TG + (tx < 0 ? 0 : tx > 16 ? 16 : tx)) * 9 + (S.tint - 1) * 3;
      cr *= tintGrid[gi];
      cg *= tintGrid[gi + 1];
      cb *= tintGrid[gi + 2];
    }
    p.col[vi * 4] = cr;
    p.col[vi * 4 + 1] = cg;
    p.col[vi * 4 + 2] = cb;
    p.col[vi * 4 + 3] = 1;
    p.lit[vi * 2] = sk;
    p.lit[vi * 2 + 1] = bk;
    p.flg[vi * 4] = S.fbits;
    p.flg[vi * 4 + 1] = FA[k];
    p.flg[vi * 4 + 2] = 0;
    p.flg[vi * 4 + 3] = 0;
    if (px < b[0]) b[0] = px;
    if (py < b[1]) b[1] = py;
    if (pz < b[2]) b[2] = pz;
    if (px > b[3]) b[3] = px;
    if (py > b[4]) b[4] = py;
    if (pz > b[5]) b[5] = pz;
  }
  if (S.city) zeroCityVerts(p.cty32, vbase);
  const ii = p.ic;
  p.idx[ii] = vbase;
  p.idx[ii + 1] = vbase + 1;
  p.idx[ii + 2] = vbase + 2;
  p.idx[ii + 3] = vbase;
  p.idx[ii + 4] = vbase + 2;
  p.idx[ii + 5] = vbase + 3;
  p.vc += 4;
  p.ic += 6;
  p.faces++;
}

export { OPAQUE_LUT };

/** Dünya koordinatından 32-bit kafes hash'i (belirlenimci rastgele varyasyon). */
export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}
