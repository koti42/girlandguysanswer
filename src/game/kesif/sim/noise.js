/*
 * KEŞİF sim — tohumlu gürültü fabrikası (saf, belirlenimci, sıcak yolda ayırma yok).
 *
 * createNoise(seed) → {
 *   simplex2(x,y), simplex3(x,y,z)         yaklaşık [-1,1]
 *   fbm2(x,y,oct?,lac?,gain?), fbm3(...)   normalize [-1,1] (varsayılan 4 oktav, 2.0, 0.5)
 *   ridged2(x,y,oct?,lac?,gain?), ridged3  [0,1] sırt (dağ) gürültüsü
 *   worley2(x,y)        en yakın öznokta uzaklığı F1 [0,1]
 *   worley2Edge(x,y)    F2-F1 (hücre kenarına yakınlık; küçük = kenar)
 *   worley2Cell(x,y)    en yakın hücrenin kararlı kimliği [0,1)
 * }
 * Permütasyon: Uint8Array; gradyanlar Float32Array tablolarında (tablo okuma, nesne yok).
 */
import { hash2, mulberry32, toSeedInt } from './rng.js';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

// 12 kenar gradyanı (Gustavson).
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const INV_2_32 = 1 / 4294967296;

export function createNoise(seed) {
  const s = toSeedInt(seed);
  const rnd = mulberry32(s ^ 0x5bd1e995);

  // Permütasyon (Fisher–Yates) ve mod-12 yansıması, 512'ye çiftlenmiş.
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = base[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  // Oktav başına ofsetler: orijin simetrisini ve oktavlar arası korelasyonu kırar.
  const OFFS = new Float32Array(16);
  for (let i = 0; i < 16; i++) OFFS[i] = rnd() * 1000 - 500;

  function simplex2(xin, yin) {
    const sk = (xin + yin) * F2;
    const i = Math.floor(xin + sk);
    const j = Math.floor(yin + sk);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = permMod12[ii + perm[jj]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = permMod12[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = permMod12[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  function simplex3(xin, yin, zin) {
    const sk = (xin + yin + zin) * F3;
    const i = Math.floor(xin + sk);
    const j = Math.floor(yin + sk);
    const k = Math.floor(zin + sk);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const g = permMod12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
  }

  function fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      const off = OFFS[o & 15];
      sum += amp * simplex2(x * f + off, y * f - off);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  function fbm3(x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      const off = OFFS[o & 15];
      sum += amp * simplex3(x * f + off, y * f - off, z * f + off * 0.5);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  function ridged2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      const off = OFFS[(o + 5) & 15];
      let n = 1 - Math.abs(simplex2(x * f + off, y * f - off));
      n *= n;
      sum += amp * n;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  function ridged3(x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      const off = OFFS[(o + 5) & 15];
      let n = 1 - Math.abs(simplex3(x * f + off, y * f - off, z * f + off * 0.5));
      n *= n;
      sum += amp * n;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  // Worley: sonuçlar kapanış değişkenlerinde (ayırma yok).
  let wF1 = 0;
  let wF2 = 0;
  let wId = 0;
  const wSeed = s ^ 0x2545f491;

  function worleyCompute(x, y) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let d1 = 1e9;
    let d2 = 1e9;
    let id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        const h = hash2(gx, gy, wSeed);
        const px = gx + (h & 0xffff) / 65536;
        const py = gy + (h >>> 16) / 65536;
        const ddx = px - x;
        const ddy = py - y;
        const d = ddx * ddx + ddy * ddy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = h;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    wF1 = Math.sqrt(d1);
    wF2 = Math.sqrt(d2);
    wId = id;
  }

  function worley2(x, y) {
    worleyCompute(x, y);
    return wF1 > 1 ? 1 : wF1;
  }

  function worley2Edge(x, y) {
    worleyCompute(x, y);
    return wF2 - wF1;
  }

  function worley2Cell(x, y) {
    worleyCompute(x, y);
    return wId * INV_2_32;
  }

  return {
    seed: s,
    simplex2,
    simplex3,
    fbm2,
    fbm3,
    ridged2,
    ridged3,
    worley2,
    worley2Edge,
    worley2Cell,
  };
}
