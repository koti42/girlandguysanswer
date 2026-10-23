/*
 * KEŞİF render/props — İÇ MEKÂN GEOMETRİ KAYDI ve ŞABLONLARI (three'siz; node'da test edilir).
 *
 *   INTERIOR_BUILDERS[key] → (b: IGeo, v, h: IGeo|null, x) → void       101 katalog anahtarının tamamı (4 dosya)
 *   buildTemplate(def, variant, extra?) → Template                        modeli kurar ve BAYT biçimine paketler
 *   getTemplate(def, variant, extra?) → Template                          önbellekli (LRU 400); varyant def.variants'a indirgenir
 *   Template = {key, def, v, n (köşe), tris, pos Float32[n*3], nor Float32[n*3], uv Uint16[n*2] (normalize), col Uint8[n*4] (sRGB rgb + AO),
 *              mat Uint8[n*4], anim Int8[n*4] (yön/2 · 127), bounds {min[3],max[3]}, holo: {n,tris,pos,nor,uv,col,mat}|null, dynamic: bool}
 *   templateKeyOf(def, variant, extra) · clearTemplates() · templateCount()
 *
 * Paketleme (propBake.js ve propShadersBaked.js ile sözleşme): aMat bayt = [yayma·255, tür, grup, kapalı-yayma·255]; AO (col.a) tabandan yüksekliğe
 * göre (zemin props: 0.62 → 1.0, 0.5 blokta); duvar/tavan/yüzey propları AO'suz (255).
 */
import { IGeo } from './propGeoKit.js';
import { FURNITURE_BUILDERS } from './propGeoFurniture.js';
import { TECH_BUILDERS } from './propGeoTech.js';
import { DECOR_BUILDERS } from './propGeoDecor.js';
import { DOOR_BUILDERS } from './propGeoDoors.js';

export const INTERIOR_BUILDERS = Object.freeze(Object.assign({}, FURNITURE_BUILDERS, TECH_BUILDERS, DECOR_BUILDERS, DOOR_BUILDERS));

const CACHE = new Map();
const CACHE_MAX = 400;

function linToSrgb8(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
}

const clamp255 = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

function pack(g, mount, withAnim) {
  const n = g.pos.length / 3;
  const pos = new Float32Array(g.pos);
  const nor = new Float32Array(g.nor);
  const uv = new Uint16Array(n * 2);
  const col = new Uint8Array(n * 4);
  const mat = new Uint8Array(n * 4);
  const anim = withAnim ? new Int8Array(n * 4) : null;
  const floor = mount === 'floor';
  let x0 = Infinity; let y0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const px = pos[i * 3]; const py = pos[i * 3 + 1]; const pz = pos[i * 3 + 2];
    if (px < x0) x0 = px; if (px > x1) x1 = px;
    if (py < y0) y0 = py; if (py > y1) y1 = py;
    if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
    uv[i * 2] = Math.round(Math.max(0, Math.min(1, g.uv[i * 2])) * 65535);
    uv[i * 2 + 1] = Math.round(Math.max(0, Math.min(1, g.uv[i * 2 + 1])) * 65535);
    col[i * 4] = linToSrgb8(g.col[i * 3]);
    col[i * 4 + 1] = linToSrgb8(g.col[i * 3 + 1]);
    col[i * 4 + 2] = linToSrgb8(g.col[i * 3 + 2]);
    const t = Math.max(0, Math.min(1, py / 0.5));
    col[i * 4 + 3] = floor ? Math.round((0.62 + 0.38 * (t * t * (3 - 2 * t))) * 255) : 255;
    mat[i * 4] = clamp255(g.mat[i * 4] * 255);
    mat[i * 4 + 1] = clamp255(g.mat[i * 4 + 1]);
    mat[i * 4 + 2] = clamp255(g.mat[i * 4 + 2]);
    mat[i * 4 + 3] = clamp255(g.mat[i * 4 + 3] * 255);
    if (anim) {
      anim[i * 4] = Math.round(Math.max(-2, Math.min(2, g.anim[i * 3])) * 63.5);
      anim[i * 4 + 1] = Math.round(Math.max(-2, Math.min(2, g.anim[i * 3 + 1])) * 63.5);
      anim[i * 4 + 2] = Math.round(Math.max(-2, Math.min(2, g.anim[i * 3 + 2])) * 63.5);
    }
  }
  return {
    n, tris: n / 3, pos, nor, uv, col, mat, anim, bounds: { min: [x0, y0, z0], max: [x1, y1, z1] },
  };
}

export function templateKeyOf(def, variant, extra) {
  const v = def.variants > 1 ? (variant & 7) % def.variants : 0;
  const d = extra && extra.digits && extra.digits.length ? ':' + extra.digits.join('') : '';
  return def.key + ':' + v + d;
}

export function buildTemplate(def, variant, extra) {
  const fn = INTERIOR_BUILDERS[def.key];
  if (typeof fn !== 'function') throw new Error('propGeoInterior: model yok ' + def.key);
  const v = def.variants > 1 ? (variant & 7) % def.variants : 0;
  const b = new IGeo();
  const h = def.holo ? new IGeo() : null;
  fn(b, v, h, extra || null);
  const body = pack(b, def.mount, true);
  let dynamic = false;
  for (let i = 0; i < body.n; i++) {
    const z = body.mat[i * 4 + 2];
    if (z >= 32) { dynamic = true; break; }
  }
  const out = {
    key: templateKeyOf(def, variant, extra), def, v, dynamic, holo: null, ...body,
  };
  if (h && h.tris > 0) {
    const ph = pack(h, def.mount, false);
    out.holo = {
      n: ph.n, tris: ph.tris, pos: ph.pos, nor: ph.nor, uv: ph.uv, col: ph.col, mat: ph.mat,
    };
  }
  return out;
}

export function getTemplate(def, variant, extra) {
  const k = templateKeyOf(def, variant, extra);
  let t = CACHE.get(k);
  if (t) return t;
  t = buildTemplate(def, variant, extra);
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(k, t);
  return t;
}

export function clearTemplates() {
  CACHE.clear();
}

export function templateCount() {
  return CACHE.size;
}
