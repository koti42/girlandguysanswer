/*
 * KEŞİF render — büyü sistemi dokuları (sim/magicData.js): Büyü Masası (parlayan rün halkası) ve Simya Kazanı (kaynayan sıvı).
 * `MAGIC_PAINTERS` atlas.js kayıt defterine yayılır (ad → (tile, seed) boyayıcı). Hepsi belirlenimci ve saf (canvas yok).
 *
 *   büyü_masası_üst   koyu mor kumaş + altın kenar + çift parlayan rün halkası, sekiz rün çentiği, orta mücevher
 *   büyü_masası_yan   koyu mor taş + altın şerit + parlayan rün
 *   simya_kazanı_üst  demir çerçeve + zümrüt yeşili kaynayan sıvı (kabarcıklar, girdap, parlama)
 *   simya_kazanı_yan  perçinli kara demir + üst halka + alt köz ışığı + damlama izleri
 */
import {
  N, rnd, vnoise, fbm, hex, mixc, clamp, lerp, paintPixels, setMix, setCol, put, over, setH, setE, setRo, disc, line, poly,
  bevel, ix, maxE,
} from './atlasKit.js';

const GOLD = hex(0xd9b24a);
const GLOW = [0.66, 0.52, 1];
const GLOW_HOT = [0.9, 0.84, 1];

function halo(t, mask, col, emitK, colK, radius) {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      let w = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > radius) continue;
          const k = 1 - d / (radius + 0.5);
          s += mask[((y + dy) & 31) * N + ((x + dx) & 31)] * k;
          w += k;
        }
      }
      out[y * N + x] = s / w;
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = out[y * N + x];
      if (v > 0.01 && mask[y * N + x] < 0.5) {
        over(t, x, y, col[0], col[1], col[2], v * colK);
        maxE(t, x, y, v * emitK);
      }
    }
  }
}

function glowPixel(t, mask, x, y, col, e, h) {
  put(t, x, y, col[0], col[1], col[2], 1);
  setE(t, x, y, e);
  setH(t, x, y, h);
  setRo(t, x, y, 0.25);
  mask[ix(x, y)] = 1;
}

/** Koyu mor, ince dokuma kumaş/taş alanı. */
function violetField(o, x, y, seed, darkK) {
  const n = fbm(x, y, 4, 4, 3, seed);
  const weave = (x + y) & 1 ? 0.025 : -0.025;
  const v = clamp(0.18 + n * 0.62 + weave);
  setMix(o, [0.09 * darkK, 0.06 * darkK, 0.17 * darkK], [0.24 * darkK, 0.15 * darkK, 0.42 * darkK], v);
  o.ro = 0.72;
  o.h = 0.5 + n * 0.12;
}

export function paintMagicTableTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    violetField(o, x, y, seed, 1);
    const d = Math.min(x, N - 1 - x, y, N - 1 - y);
    if (d < 2) {
      setCol(o, GOLD, d === 0 ? 0.62 : 1);
      o.ro = 0.3;
      o.h = 0.82;
    } else if (d === 2) {
      o.r *= 0.45;
      o.g *= 0.4;
      o.b *= 0.5;
      o.h = 0.3;
    }
  });
  const mask = new Float32Array(N * N);
  // dış ve iç rün halkası
  disc(16, 16, 12.6, (x, y, d) => {
    if (d > 0.88 && d <= 1) glowPixel(t, mask, x, y, GLOW, 0.92, 0.32);
    else if (d > 0.5 && d < 0.58) glowPixel(t, mask, x, y, GLOW, 0.82, 0.3);
  });
  // iki halka arasında sekiz rün çentiği (sırayla uzun/kısa → okunaklı, simetrik)
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const r0 = 8.4;
    const r1 = i % 2 === 0 ? 10.8 : 10.0;
    const cx = 16;
    const cy = 16;
    line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 0.62, (x, y) => {
      glowPixel(t, mask, x, y, GLOW_HOT, 1, 0.3);
    });
  }
  // merkezde elmas biçimli mücevher
  poly([[16, 11.4], [20.2, 16], [16, 20.6], [11.8, 16]], (x, y, dist) => {
    const k = dist < 1 ? 1 : 0.9;
    glowPixel(t, mask, x, y, mixc(GLOW, GLOW_HOT, k * 0.8), 1, 0.4);
  });
  // mücevherin içinde ışık parıltısı
  put(t, 15, 14, 1, 1, 1, 1);
  put(t, 16, 14, 1, 1, 1, 1);
  halo(t, mask, GLOW, 0.5, 0.22, 3);
  bevel(t, 2, 0.45, 0.16);
  t.bump = 1.1;
}

export function paintMagicTableSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    violetField(o, x, y, seed + 7, 0.9);
    // dikey kıvrım/kumaş sarkması
    const fold = Math.sin((x / N) * Math.PI * 6 + vnoise(x, y, 2, 2, seed) * 2) * 0.5 + 0.5;
    o.r *= 0.82 + fold * 0.3;
    o.g *= 0.82 + fold * 0.3;
    o.b *= 0.82 + fold * 0.3;
    // üstte altın şerit, altta altın saçak
    if (y < 3) {
      setCol(o, GOLD, y === 0 ? 0.65 : 1);
      o.ro = 0.3;
      o.h = 0.82;
    } else if (y === 3) {
      o.r *= 0.45;
      o.g *= 0.4;
      o.b *= 0.5;
    } else if (y > N - 3) {
      setCol(o, GOLD, 0.8 + rnd(x, y, seed) * 0.2);
      o.ro = 0.35;
      o.h = 0.7;
    }
  });
  const mask = new Float32Array(N * N);
  // ortada parlayan rün: daire içinde üçgen + dikey çizgi
  disc(16, 17, 6.4, (x, y, d) => {
    if (d > 0.8 && d <= 1) glowPixel(t, mask, x, y, GLOW, 0.9, 0.32);
  });
  poly([[16, 12.6], [20, 19.4], [12, 19.4]], (x, y, d) => {
    if (d > 0.62) glowPixel(t, mask, x, y, GLOW_HOT, 1, 0.3);
  });
  line(16, 11.6, 16, 21.6, 0.5, (x, y) => glowPixel(t, mask, x, y, GLOW_HOT, 1, 0.3));
  halo(t, mask, GLOW, 0.4, 0.2, 3);
  bevel(t, 2, 0.3, 0.14);
  t.bump = 0.9;
}

/* ------------------------------------------------------------------------------------------------
 * Simya Kazanı
 * ---------------------------------------------------------------------------------------------- */
const IRON_DARK = hex(0x1f2328);
const IRON_LIGHT = hex(0x59626c);
const LIQUID_DEEP = hex(0x0b5a43);
const LIQUID_MID = hex(0x2bd694);
const LIQUID_HOT = hex(0xd8ffe8);

function ironPixel(o, x, y, seed) {
  const n = fbm(x, y, 5, 5, 3, seed);
  setMix(o, IRON_DARK, IRON_LIGHT, clamp(0.12 + n * 0.62));
  o.ro = 0.38 + n * 0.2;
  o.h = 0.55 + n * 0.1;
  if (rnd(x, y, seed + 3) > 0.985) {
    o.r *= 1.5;
    o.g *= 1.4;
    o.b *= 1.3;
  }
}

export function paintCauldronTop(t, seed) {
  const mask = new Float32Array(N * N);
  paintPixels(t, (x, y, o) => {
    ironPixel(o, x, y, seed);
    const dx = x + 0.5 - 16;
    const dy = y + 0.5 - 16;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < 11.8) {
      // sıvı: girdap + gürültü; merkeze doğru parlak, kenarda koyu
      const ang = Math.atan2(dy, dx);
      const swirl = Math.sin(ang * 2 + r * 0.55 + fbm(x, y, 4, 4, 2, seed + 5) * 3) * 0.5 + 0.5;
      const k = clamp(0.3 + swirl * 0.3 + (1 - r / 11.8) * 0.3);
      const c = k < 0.55 ? mixc(LIQUID_DEEP, LIQUID_MID, k / 0.55) : mixc(LIQUID_MID, LIQUID_HOT, (k - 0.55) / 0.45);
      o.r = c[0];
      o.g = c[1];
      o.b = c[2];
      o.e = 0.35 + k * 0.5;
      o.ro = 0.08;
      o.h = 0.32 + swirl * 0.06;
      mask[ix(x, y)] = 0.6;
    } else if (r < 13.6) {
      // demir halka: iç kenarı parlak
      const k = 1 - Math.abs(r - 12.7) / 0.95;
      o.r = lerp(o.r, 0.62, clamp(k) * 0.55);
      o.g = lerp(o.g, 0.66, clamp(k) * 0.55);
      o.b = lerp(o.b, 0.72, clamp(k) * 0.55);
      o.h = 0.85;
      o.ro = 0.28;
    } else if (r < 14.6) {
      o.r *= 0.5;
      o.g *= 0.5;
      o.b *= 0.52;
      o.h = 0.45;
    }
  });
  // kabarcıklar: yumuşak diskler (açık kenar halkası, iç dolgu, sol üstte tek parlak nokta); sabit ama tohumla hafif kaydırılır
  const spots = [[10.5, 11.5, 2.6], [20.5, 10, 1.8], [21, 20, 2.2], [12, 21, 1.7], [16.5, 16, 1.3]];
  for (let i = 0; i < spots.length; i++) {
    const jx = (rnd(i, 1, seed) - 0.5) * 1.4;
    const jy = (rnd(i, 2, seed) - 0.5) * 1.4;
    const s0 = spots[i];
    const cx = s0[0] + jx;
    const cy = s0[1] + jy;
    disc(cx, cy, s0[2], (x, y, d) => {
      if (d > 0.62) {
        over(t, x, y, 0.62, 1, 0.82, 0.78);
        setE(t, x, y, 0.8);
      } else {
        over(t, x, y, 0.35, 0.95, 0.68, 0.42);
        setE(t, x, y, 0.55);
      }
      setH(t, x, y, 0.62 - d * 0.14);
      mask[ix(x, y)] = 1;
    });
    const hx = Math.round(cx - s0[2] * 0.35 - 0.5);
    const hy = Math.round(cy - s0[2] * 0.35 - 0.5);
    put(t, hx, hy, 0.92, 1, 0.96, 1);
    setE(t, hx, hy, 1);
  }
  halo(t, mask, LIQUID_MID, 0.45, 0.16, 2);
  bevel(t, 2, 0.4, 0.14);
  t.bump = 1.0;
}

export function paintCauldronSide(t, seed) {
  const mask = new Float32Array(N * N);
  paintPixels(t, (x, y, o) => {
    ironPixel(o, x, y, seed + 11);
    // karnı: yan duvar hafif bombeli görünsün (orta aydınlık, kenar koyu)
    const bulge = 1 - Math.pow(Math.abs((x + 0.5) / N - 0.5) * 2, 2) * 0.45;
    o.r *= bulge;
    o.g *= bulge;
    o.b *= bulge;
    if (y < 5) {
      // üst halka
      const k = y === 0 ? 0.7 : y < 4 ? 1.25 : 0.55;
      o.r = clamp(o.r * k + 0.05);
      o.g = clamp(o.g * k + 0.05);
      o.b = clamp(o.b * k + 0.06);
      o.h = y < 4 ? 0.86 : 0.35;
      o.ro = 0.26;
    }
    // alttan köz ışığı (ateş altta yanıyormuş gibi)
    if (y > 24) {
      const k = (y - 24) / 8;
      const flick = vnoise(x, y, 6, 3, seed + 21);
      const glow = clamp(k * (0.6 + flick * 0.7) - 0.12);
      o.r = lerp(o.r, 1, glow * 0.7);
      o.g = lerp(o.g, 0.45, glow * 0.6);
      o.b = lerp(o.b, 0.1, glow * 0.7);
      o.e = glow * 0.75;
    }
  });
  // perçinler
  [[5, 11], [26, 11], [5, 20], [26, 20], [16, 8]].forEach((p) => {
    disc(p[0], p[1], 1.9, (x, y, d) => {
      const k = 0.55 + (1 - d) * 0.4;
      put(t, x, y, 0.5 * k + 0.1, 0.54 * k + 0.1, 0.6 * k + 0.1, 1);
      setH(t, x, y, 0.9 - d * 0.25);
      setRo(t, x, y, 0.3);
    });
  });
  // sıvı damlama izleri üst halkadan aşağı (yeşil, hafif parlak)
  [[9, 14], [21, 10], [27, 15]].forEach((s, i) => {
    const len = s[1] + Math.floor(rnd(i, 5, seed) * 4);
    for (let y = 5; y < len; y++) {
      const k = 1 - (y - 5) / (len - 5 + 1);
      over(t, s[0], y, 0.2, 0.85, 0.55, 0.35 + k * 0.35);
      maxE(t, s[0], y, 0.3 + k * 0.3);
      mask[ix(s[0], y)] = 0.6;
    }
    put(t, s[0], len, 0.5, 1, 0.75, 1);
    setE(t, s[0], len, 0.8);
  });
  halo(t, mask, LIQUID_MID, 0.3, 0.1, 2);
  bevel(t, 2, 0.3, 0.14);
  t.bump = 1.0;
}

export const MAGIC_PAINTERS = Object.freeze({
  büyü_masası_üst: paintMagicTableTop,
  büyü_masası_yan: paintMagicTableSide,
  simya_kazanı_üst: paintCauldronTop,
  simya_kazanı_yan: paintCauldronSide,
});
