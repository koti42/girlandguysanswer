/*
 * KEŞİF render — özel geometriler (saf).
 *
 * Bloklarda `meta` yok; yön/bağlantı komşulardan BELİRLENİMCİ türetilir:
 *   - Merdiven (stair): sırtı (yüksek yarı) N,E,S,W sırasıyla bakılan İLK opak komşu yönüne döner; opak komşu yoksa kuzey (-Z).
 *     Bu kural `stairFacing` ile dışa verilir; fizik aynı fonksiyonu kullanırsa görsel ve çarpışma örtüşür.
 *   - Çit: yan komşu çit ya da opak küp ise o yöne iki çıta (korkuluk) uzanır.
 *   - Meşale: yan komşu opaksa o duvara yaslanır ve üst uç dışa eğilir.
 *   - Sarmaşık: opak yan komşu duvarlarına yapışık düzlemler; duvar yoksa çapraz bitki gibi çizilir.
 *   - Kapı / plaka / döşeme / sandık / kaktüs: `collision[0]` kutusu (yaklaşık görsel = çarpışma).
 */
import { B, BLOCKS, OPAQUE_LUT } from '../sim/blocks.js';
import { TILE_REGIONS } from './atlasLayout.js';
import {
  S, P, SY, SZ, DN, CULL, FAMILY, FLAG, KIND_LUT, TINT_LUT, WIND_LUT, FLOW_LUT, LIQUID_DROP,
  emitFace, emitFree, FP, FUV, FA, hash3,
} from './mesherCore.js';

const NAXIS = [0, 0, 1, 1, 2, 2];
const NSIGN = [1, -1, 1, -1, 1, -1];
const EPS = 1e-5;

/** Yüz bu kutudan sızıyor mu (hücre sınırında ve komşu örtüyor mu) → çizilmemeli. */
function boxFaceHidden(d, plane, id) {
  const ns = NSIGN[d];
  const onBoundary = ns > 0 ? plane >= 1 - EPS : plane <= EPS;
  if (!onBoundary) return false;
  const nb = P[S.ci + DN[d]];
  if (CULL[id * 256 + nb]) return true;
  return nb === id && (d === 2 || d === 3);
}

const LO = new Float32Array(3);
const HI = new Float32Array(3);

/** Kutunun yüzlerini yayar. mask: bit d = yön d çizilsin. regionTB: 2/3 yönleri (üst/alt) için bölge-uv. */
export function emitBox(id, x0, y0, z0, x1, y1, z1, mask = 63, regionTB = null) {
  const rec = BLOCKS[id];
  LO[0] = x0;
  LO[1] = y0;
  LO[2] = z0;
  HI[0] = x1;
  HI[1] = y1;
  HI[2] = z1;
  for (let d = 0; d < 6; d++) {
    if (!((mask >> d) & 1)) continue;
    const ax = NAXIS[d];
    const plane = NSIGN[d] > 0 ? HI[ax] : LO[ax];
    if (boxFaceHidden(d, plane, id)) continue;
    const tile = d === 2 ? rec.tiles.top : d === 3 ? rec.tiles.bottom : rec.tiles.side;
    S.region = regionTB && (d === 2 || d === 3) ? regionTB : null;
    emitFace(d, x0, y0, z0, x1, y1, z1, tile);
  }
  S.region = null;
}

/** collision[0] kutusu (döşeme, kapı, sandık, kaktüs, yatak). */
export function emitCollisionBox(id) {
  const c = BLOCKS[id].collision[0];
  emitBox(id, c[0], c[1], c[2], c[3], c[4], c[5]);
}

export function emitPlate(id) {
  const hp = id === B.PRESSURE_PLATE_ON ? 0.03125 : 0.0625;
  emitBox(id, 0.0625, 0, 0.0625, 0.9375, hp, 0.9375);
}

/* ------------------------------------------------------------------------------------------------
 * Merdiven
 * ---------------------------------------------------------------------------------------------- */
/**
 * Merdiven sırt yönü: 0 = -Z (kuzey), 1 = +X (doğu), 2 = +Z (güney), 3 = -X (batı).
 * Girdi: dört yan komşunun kimliği (N,E,S,W) ve opak mı bilgisi olan `isOpaque(id)`.
 */
export function stairFacing(nbN, nbE, nbS, nbW, isOpaque = (id) => OPAQUE_LUT[id] === 1) {
  if (isOpaque(nbN)) return 0;
  if (isOpaque(nbE)) return 1;
  if (isOpaque(nbS)) return 2;
  if (isOpaque(nbW)) return 3;
  return 0;
}

// Kanonik (sırt -Z): [yön, x0,y0,z0, x1,y1,z1]
const STAIR_FACES = [
  [3, 0, 0, 0, 1, 0, 1],
  [5, 0, 0, 0, 1, 1, 0],
  [4, 0, 0, 1, 1, 0.5, 1],
  [4, 0, 0.5, 0.5, 1, 1, 0.5],
  [1, 0, 0, 0, 0, 0.5, 1],
  [1, 0, 0.5, 0, 0, 1, 0.5],
  [0, 1, 0, 0, 1, 0.5, 1],
  [0, 1, 0.5, 0, 1, 1, 0.5],
  [2, 0, 1, 0, 1, 1, 0.5],
  [2, 0, 0.5, 0.5, 1, 0.5, 1],
];
function rotDir(d) {
  if (d === 0) return 4;
  if (d === 4) return 1;
  if (d === 1) return 5;
  if (d === 5) return 0;
  return d;
}

export function emitStair(id, k) {
  const rec = BLOCKS[id];
  for (let f = 0; f < STAIR_FACES.length; f++) {
    const fc = STAIR_FACES[f];
    let d = fc[0];
    let ax0 = fc[1];
    let az0 = fc[3];
    let ax1 = fc[4];
    let az1 = fc[6];
    for (let r = 0; r < k; r++) {
      d = rotDir(d);
      // (x,z) → (1-z, x)
      const nx0 = 1 - az1;
      const nx1 = 1 - az0;
      const nz0 = ax0;
      const nz1 = ax1;
      ax0 = nx0;
      ax1 = nx1;
      az0 = nz0;
      az1 = nz1;
    }
    const y0 = fc[2];
    const y1 = fc[5];
    const ax = NAXIS[d];
    LO[0] = ax0;
    LO[1] = y0;
    LO[2] = az0;
    HI[0] = ax1;
    HI[1] = y1;
    HI[2] = az1;
    const plane = NSIGN[d] > 0 ? HI[ax] : LO[ax];
    if (boxFaceHidden(d, plane, id)) continue;
    const tile = d === 2 ? rec.tiles.top : d === 3 ? rec.tiles.bottom : rec.tiles.side;
    emitFace(d, ax0, y0, az0, ax1, y1, az1, tile);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Çit
 * ---------------------------------------------------------------------------------------------- */
export function emitFence(id) {
  emitBox(id, 0.375, 0, 0.375, 0.625, 1, 0.625);
  const ci = S.ci;
  const rails = [[0.375, 0.5625], [0.75, 0.9375]];
  const dirs = [0, 1, 4, 5];
  for (let i = 0; i < 4; i++) {
    const d = dirs[i];
    const nb = P[ci + DN[d]];
    if (nb !== id && !OPAQUE_LUT[nb]) continue;
    for (let r = 0; r < 2; r++) {
      const y0 = rails[r][0];
      const y1 = rails[r][1];
      let x0 = 0.4375;
      let x1 = 0.5625;
      let z0 = 0.4375;
      let z1 = 0.5625;
      if (d === 0) {
        x0 = 0.625;
        x1 = 1;
      } else if (d === 1) {
        x0 = 0;
        x1 = 0.375;
      } else if (d === 4) {
        z0 = 0.625;
        z1 = 1;
      } else {
        z0 = 0;
        z1 = 0.375;
      }
      // uç yüzleri çizme (komşuya/direğe değer); yalnız üst/alt/iki yan
      const mask = d === 0 || d === 1 ? 4 | 8 | 16 | 32 : 4 | 8 | 1 | 2;
      emitBox(id, x0, y0, z0, x1, y1, z1, mask);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Çapraz bitki, sarmaşık, meşale
 * ---------------------------------------------------------------------------------------------- */
function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, wa, wb, wc, wd) {
  FP[0] = ax;
  FP[1] = ay;
  FP[2] = az;
  FP[3] = bx;
  FP[4] = by;
  FP[5] = bz;
  FP[6] = cx;
  FP[7] = cy;
  FP[8] = cz;
  FP[9] = dx;
  FP[10] = dy;
  FP[11] = dz;
  FA[0] = wa;
  FA[1] = wb;
  FA[2] = wc;
  FA[3] = wd;
}
function setUv() {
  FUV[0] = 0;
  FUV[1] = 0;
  FUV[2] = 1;
  FUV[3] = 0;
  FUV[4] = 1;
  FUV[5] = 1;
  FUV[6] = 0;
  FUV[7] = 1;
}

/** Çapraz bitki: iki köşegen düzlem, çift yüz (4 dörtgen); küçük belirlenimci kayma/boy farkı. */
export function emitCross(id, wx, wy, wz) {
  const rec = BLOCKS[id];
  const tile = rec.tiles.side;
  const hh = hash3(wx, wy, wz);
  let ox = 0;
  let oz = 0;
  let ht = 1;
  if (id === B.TALL_GRASS || id === B.FLOWER_RED || id === B.FLOWER_YELLOW || id === B.MUSHROOM) {
    ox = ((hh & 255) / 255 - 0.5) * 0.14;
    oz = (((hh >>> 8) & 255) / 255 - 0.5) * 0.14;
    if (id === B.TALL_GRASS) ht = 0.78 + (((hh >>> 16) & 255) / 255) * 0.22;
  }
  const a = 0.08 + ox;
  const b = 0.92 + ox;
  const c = 0.08 + oz;
  const d = 0.92 + oz;
  const x = S.bx;
  const y = S.by;
  const z = S.bz;
  const h = y + ht;
  setUv();
  S.fbits |= FLAG.SOFT;
  // düzlem 1 (a,c)-(b,d): ön ve arka
  quad(x + b, y, z + d, x + a, y, z + c, x + a, h, z + c, x + b, h, z + d, 0, 0, 1, 1);
  emitFree(0, 1, 0, tile);
  quad(x + a, y, z + c, x + b, y, z + d, x + b, h, z + d, x + a, h, z + c, 0, 0, 1, 1);
  emitFree(0, 1, 0, tile);
  // düzlem 2 (a,d)-(b,c)
  quad(x + a, y, z + d, x + b, y, z + c, x + b, h, z + c, x + a, h, z + d, 0, 0, 1, 1);
  emitFree(0, 1, 0, tile);
  quad(x + b, y, z + c, x + a, y, z + d, x + a, h, z + d, x + b, h, z + c, 0, 0, 1, 1);
  emitFree(0, 1, 0, tile);
}

/** Sarmaşık: opak yan komşu duvarlarına yapışık düzlemler; duvar yoksa çapraz. */
export function emitVine(id, wx, wy, wz) {
  const rec = BLOCKS[id];
  const tile = rec.tiles.side;
  const ci = S.ci;
  let any = false;
  S.fbits |= FLAG.SOFT;
  const inset = 0.04;
  const dirs = [0, 1, 4, 5];
  for (let i = 0; i < 4; i++) {
    const d = dirs[i];
    if (!OPAQUE_LUT[P[ci + DN[d]]]) continue;
    any = true;
    // duvara bakan düzlem: duvar tarafı yüze karşı yöndeki (iç) yüz
    const inward = d === 0 ? 1 : d === 1 ? 0 : d === 4 ? 5 : 4;
    const wallPlane = d === 0 ? 1 - inset : d === 1 ? inset : d === 4 ? 1 - inset : inset;
    S.defA = 1;
    if (d === 0 || d === 1) emitFace(inward, wallPlane, 0, 0, wallPlane, 1, 1, tile, ci);
    else emitFace(inward, 0, 0, wallPlane, 1, 1, wallPlane, tile, ci);
    S.defA = 0;
  }
  if (!any) emitCross(id, wx, wy, wz);
}

/**
 * Meşale / kol: '+' biçimli iki düzlem, çift yüz. Duvara yaslı meşale (yalnız B.TORCH) duvara kayar, üst dışa eğilir.
 */
export function emitTorch(id) {
  const rec = BLOCKS[id];
  const tile = rec.tiles.side;
  const ci = S.ci;
  let sx = 0;
  let sz = 0;
  if (id === B.TORCH) {
    if (OPAQUE_LUT[P[ci + DN[0]]]) sx = 1;
    else if (OPAQUE_LUT[P[ci + DN[1]]]) sx = -1;
    else if (OPAQUE_LUT[P[ci + DN[4]]]) sz = 1;
    else if (OPAQUE_LUT[P[ci + DN[5]]]) sz = -1;
  }
  const bxc = S.bx + 0.5 + sx * 0.3;
  const bzc = S.bz + 0.5 + sz * 0.3;
  const txc = bxc - sx * 0.2;
  const tzc = bzc - sz * 0.2;
  const y = S.by;
  S.fbits |= FLAG.SOFT;
  setUv();
  // x-düzlemi (+Z'ye bakan) ve ters
  quad(bxc - 0.5, y, bzc, bxc + 0.5, y, bzc, txc + 0.5, y + 1, tzc, txc - 0.5, y + 1, tzc, 0, 0, 0, 0);
  emitFree(0, 1, 0, tile);
  quad(bxc + 0.5, y, bzc, bxc - 0.5, y, bzc, txc - 0.5, y + 1, tzc, txc + 0.5, y + 1, tzc, 0, 0, 0, 0);
  emitFree(0, 1, 0, tile);
  // z-düzlemi
  quad(bxc, y, bzc + 0.5, bxc, y, bzc - 0.5, txc, y + 1, tzc - 0.5, txc, y + 1, tzc + 0.5, 0, 0, 0, 0);
  emitFree(0, 1, 0, tile);
  quad(bxc, y, bzc - 0.5, bxc, y, bzc + 0.5, txc, y + 1, tzc + 0.5, txc, y + 1, tzc - 0.5, 0, 0, 0, 0);
  emitFree(0, 1, 0, tile);
}

/** Fener: gövde kutusu + üst kapak; kapaklar TILE_REGIONS.fenerCap bölgesini kullanır. */
export function emitLantern(id) {
  emitBox(id, 0.3125, 0, 0.3125, 0.6875, 0.5625, 0.6875, 63, TILE_REGIONS.fenerCap);
  emitBox(id, 0.4375, 0.5625, 0.4375, 0.5625, 0.6875, 0.5625, 63, TILE_REGIONS.fenerCap);
}

/* ------------------------------------------------------------------------------------------------
 * Sıvılar
 * ---------------------------------------------------------------------------------------------- */
const VP = new Float32Array(12);
const CORNER_SX = [-1, 1, 1, -1];
const CORNER_SZ = [1, 1, -1, -1]; // üst yüz: V = -Z → sv=1 → -Z

function columnDepth(idx, fam) {
  let n = 0;
  let j = idx;
  while (n < 8 && FAMILY[P[j]] === fam) {
    n++;
    j -= SY;
  }
  return n / 8;
}

function isSolidNotLiquid(idx) {
  const id = P[idx];
  return id !== 0 && FAMILY[id] === 0 && OPAQUE_LUT[id] === 1 ? 1 : 0;
}

function sideArgs(d, y0, y1) {
  if (d === 0) return [1, y0, 0, 1, y1, 1];
  if (d === 1) return [0, y0, 0, 0, y1, 1];
  if (d === 4) return [0, y0, 1, 1, y1, 1];
  return [0, y0, 0, 1, y1, 0];
}

/** Su/lav hücresi: üst 0.12 alçak, köpük kıyısı, derinlik, yüzey/alt yüz, aynı sıvı arası yüz kırpma + boşluk şeridi. */
export function emitLiquid(id, underside) {
  const rec = BLOCKS[id];
  const fam = FAMILY[id];
  const ci = S.ci;
  const above = P[ci + SY];
  const aboveSame = FAMILY[above] === fam;
  const h = aboveSame ? 1 : 1 - LIQUID_DROP;
  const water = fam === 1;
  S.fbits = (KIND_LUT[id] << FLAG.KIND_SHIFT) | (FLOW_LUT[id] ? FLAG.FLOW : 0) | (WIND_LUT[id] & 3);
  S.tint = TINT_LUT[id];
  S.aoOn = false;
  S.defA = 0;
  if (!CULL[id * 256 + above]) {
    if (water) {
      for (let k = 0; k < 4; k++) {
        const sx = CORNER_SX[k];
        const sz = CORNER_SZ[k];
        const i1 = ci + sx;
        const i2 = ci + sz * SZ;
        const i3 = i1 + sz * SZ;
        const dep = (columnDepth(ci, fam) + columnDepth(i1, fam) + columnDepth(i2, fam) + columnDepth(i3, fam)) * 0.25;
        const foam = isSolidNotLiquid(i1) || isSolidNotLiquid(i2) || isSolidNotLiquid(i3) ? 1 : 0;
        VP[k * 3] = 1;
        VP[k * 3 + 1] = dep;
        VP[k * 3 + 2] = foam;
      }
      S.vp = VP;
    }
    emitFace(2, 0, h, 0, 1, h, 1, rec.tiles.top);
    if (water && underside) emitFace(3, 0, h, 0, 1, h, 1, rec.tiles.top, ci);
    S.vp = null;
  }
  const dep0 = water ? columnDepth(ci, fam) : 0;
  const dirs = [0, 1, 4, 5];
  for (let i = 0; i < 4; i++) {
    const d = dirs[i];
    const nbIdx = ci + DN[d];
    const nb = P[nbIdx];
    let y0 = 0;
    if (FAMILY[nb] === fam) {
      const hN = FAMILY[P[nbIdx + SY]] === fam ? 1 : 1 - LIQUID_DROP;
      if (h <= hN + 1e-4) continue;
      y0 = hN;
    } else if (CULL[id * 256 + nb]) {
      continue;
    }
    if (water) {
      for (let k = 0; k < 4; k++) {
        const top = k >= 2;
        VP[k * 3] = top && !aboveSame ? 1 : y0 > 0 ? 1 : 0;
        VP[k * 3 + 1] = dep0;
        VP[k * 3 + 2] = 0;
      }
      S.vp = VP;
    }
    const a = sideArgs(d, y0, h);
    emitFace(d, a[0], a[1], a[2], a[3], a[4], a[5], rec.tiles.side);
    S.vp = null;
  }
}
