/*
 * KEŞİF render/city — şehir shader'ı için PERİYODİK GÜRÜLTÜ DOKUSU (saf veri üretimi + three dokusu).
 * Neden: chunk shader'ındaki ıslak yol/neon çizgisi/yağmur halkası kodu değer gürültüsünü ALU ile hesaplıyordu (≈12 çağrı × 4 hash); ANGLE/D3D11
 * derlemesi şehir varyantında ~+420 ms ek maliyet yaratıyordu (3 geçiş). Bunun yerine tek 256×256 RGBA8 doku (4 bağımsız kanal) örneklenir.
 *
 *   Doku: 32×32 kafes hücresi, hücre başına 8 texel, periyodik (RepeatWrapping). Kanal başına bağımsız rastgele kafes değerleri; aradeğer
 *         smoothstep (eski ALU gürültüsüyle aynı yumuşaklık), texel merkezi kafes noktasına denk gelir → lineer süzgeçle kafes noktasında TAM değer.
 *   GLSL: kVnoise(p) = texture2D(uCityNoise, (p·8 + 0.5)/256).r      (p birimi = bir kafes hücresi; periyot 32)
 *         kHash4(id) = texture2D(uCityNoise, (floor(id)·8 + 0.5)/256) (kafes noktasında 4 bağımsız rastgele sayı)
 *
 *   buildCityNoiseData(size?, cell?) → Uint8Array(size·size·4)     belirlenimci (hash32 tabanlı)
 *   latticeValue(i, j, c) → 0..255                                 periyot-32 kafes değeri (i,j tamsayı; negatif/taşan sarılır)
 *   createCityNoiseTexture(THREE) → DataTexture
 */
import { hash32 } from '../../sim/rng.js';

export const CITY_NOISE_SIZE = 256;
export const CITY_NOISE_CELL = 8;
export const CITY_NOISE_CELLS = CITY_NOISE_SIZE / CITY_NOISE_CELL; // 32

function wrapCell(i, n) {
  const m = i % n;
  return m < 0 ? m + n : m;
}

/** Kafes noktası (i,j), kanal c için 0..255 rastgele değer; periyot CITY_NOISE_CELLS. */
export function latticeValue(i, j, c, cells) {
  const n = cells || CITY_NOISE_CELLS;
  const a = wrapCell(i, n);
  const b = wrapCell(j, n);
  return hash32(Math.imul(a + 1, 0x27d4eb2f) ^ Math.imul(b + 1, 0x165667b1) ^ Math.imul(c + 1, 0x9e3779b1)) >>> 24;
}

/** RGBA8 gürültü verisi (4 kanal bağımsız). size = hücre × cell; periyodik. */
export function buildCityNoiseData(size, cell) {
  const S = size || CITY_NOISE_SIZE;
  const K = cell || CITY_NOISE_CELL;
  const cells = S / K;
  const data = new Uint8Array(S * S * 4);
  const lat = new Float32Array(cells * cells * 4);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      for (let c = 0; c < 4; c++) lat[(j * cells + i) * 4 + c] = latticeValue(i, j, c, cells);
    }
  }
  const fade = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    const t = k / K;
    fade[k] = t * t * (3 - 2 * t);
  }
  for (let y = 0; y < S; y++) {
    const cy = Math.floor(y / K);
    const fy = fade[y - cy * K];
    const cy1 = (cy + 1) % cells;
    for (let x = 0; x < S; x++) {
      const cx = Math.floor(x / K);
      const fx = fade[x - cx * K];
      const cx1 = (cx + 1) % cells;
      const o = (y * S + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = lat[(cy * cells + cx) * 4 + c];
        const v10 = lat[(cy * cells + cx1) * 4 + c];
        const v01 = lat[(cy1 * cells + cx) * 4 + c];
        const v11 = lat[(cy1 * cells + cx1) * 4 + c];
        const top = v00 + (v10 - v00) * fx;
        const bot = v01 + (v11 - v01) * fx;
        data[o + c] = Math.round(top + (bot - top) * fy);
      }
    }
  }
  return data;
}

/** three DataTexture: RGBA8, lineer süzgeç, mipmap YOK, periyodik sarma; doğrusal renk (veri dokusu). */
export function createCityNoiseTexture(THREE) {
  const tex = new THREE.DataTexture(buildCityNoiseData(), CITY_NOISE_SIZE, CITY_NOISE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  tex.name = 'kesif-sehir-gurultu';
  return tex;
}
