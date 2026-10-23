/*
 * KEŞİF render — arazi, sıvı ve maden dokuları (prosedürel, 32×32, sarmalı/döşenebilir).
 *
 * Her boyayıcı (t, seed) alır; t.c (renk), t.h (yükseklik→normal), t.ro (pürüzlülük), t.e (emisyon), t.tm (ton maskesi).
 * Biyom tonu alan dokular (çimen, yaprak, su, yosun…) NÖTR/açık gri tonlarda boyanır; renk köşe renginden gelir.
 */
import {
  N, rnd, ihash, vnoise, fbm, worley, W, hex, mixc, clamp, lerp, smooth, paintPixels, setMix, setCol, shade, addH,
  line, strSeed,
} from './atlasKit.js';

const SEED_DIRT = strSeed('toprak');
const SEED_STONE = strSeed('taş');

/* ------------------------------------------------------------------------------------------------
 * Ortak piksel boyayıcılar
 * ---------------------------------------------------------------------------------------------- */
const STONE_DARK = hex(0x5e6165);
const STONE_LIGHT = hex(0x9b9ea3);
const STONE_WARM = hex(0x8c8579);

/** Katmanlı, çatlaklı, mineral benekli taş (o'yu doldurur). */
export function stonePixel(o, x, y, seed, pal = null) {
  const dark = pal ? pal.dark : STONE_DARK;
  const light = pal ? pal.light : STONE_LIGHT;
  const warm = pal ? pal.warm : STONE_WARM;
  const strata = pal && pal.strata !== undefined ? pal.strata : 0.07;
  const n1 = fbm(x, y, 4, 4, 4, seed);
  const n2 = vnoise(x, y, 8, 8, seed + 9);
  const warp = vnoise(x, y, 2, 2, seed + 3);
  const band = Math.sin((y / N) * Math.PI * 8 + warp * 4.5) * 0.5 + 0.5;
  let v = 0.18 + n1 * 0.85 + (band - 0.5) * strata;
  v = clamp(v);
  setMix(o, dark, light, v);
  const wv = smooth(0.35, 0.8, n2) * 0.45;
  o.r = lerp(o.r, warm[0] * (0.7 + v * 0.5), wv);
  o.g = lerp(o.g, warm[1] * (0.7 + v * 0.5), wv);
  o.b = lerp(o.b, warm[2] * (0.7 + v * 0.5), wv);
  let h = 0.35 + n1 * 0.5 + n2 * 0.15;
  // Çatlaklar: seyrek, hücre kenarlarında.
  worley(x, y, 3, 3, seed + 21, 0.9);
  const edge = W.f2 - W.f1;
  const gate = vnoise(x, y, 3, 3, seed + 5);
  if (!pal || pal.cracks !== false) {
    if (gate > 0.5 && edge < 1.15) {
      const k = 1 - edge / 1.15;
      o.r *= 1 - 0.5 * k;
      o.g *= 1 - 0.5 * k;
      o.b *= 1 - 0.46 * k;
      h -= 0.35 * k;
      o.ao *= 1 - 0.3 * k;
    }
  }
  // Mineral benekleri
  const rr = rnd(x, y, seed + 40);
  if (rr > 0.986) {
    o.r = lerp(o.r, 0.86, 0.55);
    o.g = lerp(o.g, 0.87, 0.55);
    o.b = lerp(o.b, 0.88, 0.55);
    o.ro = 0.4;
    h += 0.1;
  } else if (rr < 0.016) {
    o.r *= 0.62;
    o.g *= 0.62;
    o.b *= 0.66;
  }
  o.h = h;
  o.ro = Math.min(o.ro, 0.92);
}

export function dirtPixel(o, x, y, seed) {
  const n1 = fbm(x, y, 4, 4, 4, seed);
  const n2 = vnoise(x, y, 12, 12, seed + 4);
  const dark = hex(0x58391f);
  const light = hex(0x8d6642);
  setMix(o, dark, light, clamp(n1 * 1.15 + (n2 - 0.5) * 0.35));
  const clump = vnoise(x, y, 6, 6, seed + 13);
  if (clump > 0.68) {
    const k = (clump - 0.68) * 2.2;
    o.r *= 1 - 0.3 * k;
    o.g *= 1 - 0.3 * k;
    o.b *= 1 - 0.3 * k;
  }
  o.h = 0.3 + n1 * 0.45 + n2 * 0.15;
  // Çakıl taneleri
  worley(x, y, 5, 5, seed + 31, 0.9);
  if (W.id > 0.7 && W.f1 < 2.3) {
    const d = W.f1 / 2.3;
    const g = 0.42 + W.id * 0.25;
    o.r = lerp(o.r, g * 1.04, 0.85 - d * 0.35);
    o.g = lerp(o.g, g * 0.98, 0.85 - d * 0.35);
    o.b = lerp(o.b, g * 0.9, 0.85 - d * 0.35);
    o.h = 0.7 - d * 0.28;
    o.ro = 0.7;
    if (d > 0.82) {
      o.r *= 0.7;
      o.g *= 0.7;
      o.b *= 0.7;
    }
  } else {
    o.ro = 1;
  }
  // kök / çürük lifleri: ince koyu çizgiler
  const f = vnoise(x, y, 14, 3, seed + 55);
  if (f > 0.83) {
    o.r *= 0.72;
    o.g *= 0.7;
    o.b *= 0.7;
  }
  o.h = clamp(o.h);
}

/** Çim (ton öncesi, açık nötr): ince bıçak çizgileri ve öbek değişimi. */
export function grassPixel(o, x, y, seed) {
  const clump = fbm(x, y, 3, 3, 3, seed);
  const fine = vnoise(x, y, 16, 16, seed + 7);
  const streak = vnoise(x, y, 20, 5, seed + 19);
  let l = 0.66 + clump * 0.28 + (fine - 0.5) * 0.18 + (streak - 0.5) * 0.2;
  l = clamp(l, 0.4, 1);
  // sarımsı/kuru sapmalar
  const dry = vnoise(x, y, 5, 5, seed + 41);
  const yel = smooth(0.62, 0.86, dry) * 0.18;
  o.r = l * (1 + yel * 0.6);
  o.g = l * (1 - yel * 0.05);
  o.b = l * (0.9 - yel * 1.2);
  o.h = 0.35 + l * 0.4 + (streak - 0.5) * 0.15;
  o.ro = 0.95;
  o.tm = 1;
}

/* ------------------------------------------------------------------------------------------------
 * Arazi dokuları
 * ---------------------------------------------------------------------------------------------- */
export function paintStone(t, seed) {
  paintPixels(t, (x, y, o) => stonePixel(o, x, y, seed));
  t.bump = 1.15;
}

export function paintCobble(t, seed) {
  paintPixels(t, (x, y, o) => {
    worley(x, y, 4, 4, seed, 0.8);
    const edge = W.f2 - W.f1;
    const dome = clamp(edge / 5);
    const id = W.id;
    const n = fbm(x, y, 6, 6, 3, seed + 3);
    const base = 0.38 + id * 0.3 + (n - 0.5) * 0.18;
    const warm = (id * 7) % 1;
    o.r = base * (0.96 + warm * 0.1);
    o.g = base * (0.98 + warm * 0.04);
    o.b = base * (1.03 - warm * 0.1);
    const k = 0.72 + dome * 0.38;
    o.r *= k;
    o.g *= k;
    o.b *= k;
    o.h = 0.2 + dome * 0.7;
    if (edge < 1.3) {
      // derz: koyu toprak/harç
      const d = edge / 1.3;
      setMix(o, hex(0x2c2824), hex(0x4a443c), d * 0.7);
      o.h = 0.05 + d * 0.12;
      o.ao = 0.55;
    }
    const rr = rnd(x, y, seed + 9);
    if (rr > 0.985 && edge > 2) {
      o.r = lerp(o.r, 0.85, 0.4);
      o.g = lerp(o.g, 0.85, 0.4);
      o.b = lerp(o.b, 0.85, 0.4);
    }
    o.ro = 0.88;
  });
  t.bump = 1.5;
}

export function paintDirt(t, seed) {
  paintPixels(t, (x, y, o) => dirtPixel(o, x, y, seed));
  t.bump = 1.0;
}

export function paintGrassTop(t, seed) {
  paintPixels(t, (x, y, o) => grassPixel(o, x, y, seed));
  // Bıçak darbeleri: rastgele yönlü kısa çizgiler (açık uçlu, koyu tabanlı)
  for (let i = 0; i < 70; i++) {
    const h = ihash(i, 3, seed);
    const x0 = h & 31;
    const y0 = (h >>> 5) & 31;
    const a = ((h >>> 10) & 255) / 255 * Math.PI * 2;
    const len = 2.5 + ((h >>> 18) & 7) * 0.45;
    const light = (h >>> 22) & 1;
    line(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, 0.55, (x, y, d, s) => {
      const k = light ? 1.12 + s * 0.1 : 0.78 + s * 0.12;
      shade(t, x, y, k);
      addH(t, x, y, light ? 0.08 : -0.03);
    });
  }
  t.bump = 0.8;
}

export function paintGrassSide(t, seed) {
  const sd = SEED_DIRT;
  paintPixels(t, (x, y, o) => {
    // Üst sarkıntı: kıvrımlı alt sınır, bıçak uçları
    const prof = 5 + vnoise(x, 0, 8, 1, seed + 2) * 3.2 + vnoise(x, 0, 16, 1, seed + 6) * 2.2;
    const tip = rnd(x, 0, seed + 9) > 0.62 ? 1.4 : 0;
    const yy = y + 0.5;
    if (yy < prof + tip) {
      grassPixel(o, x, y, seed + 100);
      o.tm = 1;
      // sarkan bıçak şeridi: dikey çizgi aydınlık/karanlık
      const col = vnoise(x, y, 32, 3, seed + 12);
      const k = 0.8 + col * 0.3;
      o.r *= k;
      o.g *= k;
      o.b *= k;
      const dEdge = prof + tip - yy;
      if (dEdge < 1.1) {
        o.r *= 0.72;
        o.g *= 0.74;
        o.b *= 0.74;
      }
      o.h = 0.78 + (col - 0.5) * 0.15;
    } else {
      dirtPixel(o, x, y, sd);
      o.tm = 0;
      const below = yy - (prof + tip);
      if (below < 3) {
        const k = 0.72 + below * 0.09;
        o.r *= k;
        o.g *= k;
        o.b *= k;
        o.ao = 0.6 + below * 0.13;
      }
    }
  });
  t.bump = 1.1;
}

export function paintSnowGrassSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const prof = 7 + vnoise(x, 0, 6, 1, seed + 2) * 4 + vnoise(x, 0, 16, 1, seed + 8) * 2;
    const yy = y + 0.5;
    o.tm = 0;
    if (yy < prof) {
      const n = fbm(x, y, 6, 6, 3, seed);
      const base = hex(0xf0f6fc);
      const shadow = hex(0xbcd2ea);
      setMix(o, shadow, base, clamp(0.55 + n * 0.55));
      o.h = 0.82 + n * 0.1;
      if (prof - yy < 1.4) {
        o.r *= 0.88;
        o.g *= 0.92;
      }
      o.ro = 0.55;
      if (rnd(x, y, seed + 31) > 0.985) {
        o.r = 1;
        o.g = 1;
        o.b = 1;
        o.e = 0.1;
      }
    } else {
      dirtPixel(o, x, y, SEED_DIRT);
      const below = yy - prof;
      if (below < 3) {
        const k = 0.7 + below * 0.1;
        o.r *= k;
        o.g *= k;
        o.b *= k;
        o.ao = 0.6 + below * 0.13;
      }
    }
  });
  t.bump = 1.0;
}

export function paintSand(t, seed, pal) {
  const P = pal || { dark: hex(0xc0a468), mid: hex(0xdac38a), light: hex(0xefdca8) };
  paintPixels(t, (x, y, o) => {
    const warp = vnoise(x, y, 4, 2, seed + 3) * 3.4 + vnoise(x, y, 8, 4, seed + 4) * 0.8;
    const rip = Math.sin((y / N) * Math.PI * 8 + warp) * 0.5 + 0.5;
    const grain = rnd(x, y, seed) - 0.5;
    const n = fbm(x, y, 5, 5, 3, seed + 8);
    const v = clamp(0.1 + rip * 0.45 + n * 0.4 + grain * 0.14);
    if (v < 0.5) setMix(o, P.dark, P.mid, v * 2);
    else setMix(o, P.mid, P.light, (v - 0.5) * 2);
    o.h = 0.35 + rip * 0.3 + n * 0.2 + grain * 0.05;
    const r2 = rnd(x, y, seed + 21);
    if (r2 > 0.985) {
      o.r *= 0.65;
      o.g *= 0.62;
      o.b *= 0.58;
    } else if (r2 < 0.012) {
      o.r = lerp(o.r, 1, 0.4);
      o.g = lerp(o.g, 1, 0.4);
      o.b = lerp(o.b, 0.95, 0.4);
    }
    o.ro = 0.97;
  });
  t.bump = 0.7;
}

export function paintRedSand(t, seed) {
  paintSand(t, seed, { dark: hex(0x9a4a2a), mid: hex(0xbf6a3c), light: hex(0xd98b57) });
}

export function paintGravel(t, seed) {
  paintPixels(t, (x, y, o) => {
    worley(x, y, 6, 6, seed, 0.9);
    const edge = W.f2 - W.f1;
    const dome = clamp(edge / 3.4);
    const id = W.id;
    const tone = 0.34 + id * 0.42;
    const hueSel = (id * 13) % 1;
    if (hueSel < 0.3) setCol(o, [tone * 1.08, tone * 0.98, tone * 0.82]);
    else if (hueSel < 0.62) setCol(o, [tone, tone, tone * 1.04]);
    else setCol(o, [tone * 0.92, tone * 1.0, tone * 1.1]);
    const k = 0.62 + dome * 0.5;
    o.r *= k;
    o.g *= k;
    o.b *= k;
    const spec = rnd(x, y, seed + 5);
    if (spec > 0.97) {
      o.r = lerp(o.r, 0.95, 0.5);
      o.g = lerp(o.g, 0.95, 0.5);
      o.b = lerp(o.b, 0.95, 0.5);
    }
    o.h = 0.1 + dome * 0.85;
    o.ro = 0.8;
    if (edge < 1.1) {
      o.r *= 0.45;
      o.g *= 0.45;
      o.b *= 0.45;
      o.ao = 0.55;
    }
  });
  t.bump = 1.7;
}

export function paintSnow(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 3, 3, 4, seed);
    const m = vnoise(x, y, 10, 10, seed + 6);
    const lo = hex(0xc9dcf0);
    const hi = hex(0xffffff);
    setMix(o, lo, hi, clamp(0.5 + n * 0.6 + (m - 0.5) * 0.25));
    o.h = 0.4 + n * 0.5;
    o.ro = 0.6;
    const r = rnd(x, y, seed + 17);
    if (r > 0.986) {
      o.r = 1;
      o.g = 1;
      o.b = 1;
      o.e = 0.12;
      o.ro = 0.1;
    }
  });
  t.bump = 0.5;
}

/** Buz: yarı saydam, iki derinlikli çatlak ağı, buzlanma. */
export function paintIce(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 3, 3, 4, seed);
    const frost = vnoise(x, y, 10, 10, seed + 2);
    const deep = hex(0x7cc4e6);
    const shallow = hex(0xcdf1fb);
    setMix(o, deep, shallow, clamp(0.35 + n * 0.8));
    o.a = 0.62 + n * 0.18;
    o.h = 0.5 + n * 0.2;
    o.ro = 0.1 + frost * 0.15;
    // yüzeye yakın çatlaklar: parlak ince çizgiler
    worley(x, y, 4, 4, seed + 9, 0.95);
    const e1 = W.f2 - W.f1;
    if (e1 < 0.9) {
      const k = 1 - e1 / 0.9;
      o.r = lerp(o.r, 1, k * 0.7);
      o.g = lerp(o.g, 1, k * 0.7);
      o.b = lerp(o.b, 1, k * 0.7);
      o.a = Math.max(o.a, 0.9);
      o.h -= 0.2 * k;
    }
    // derin çatlaklar: daha koyu, geniş, kaymış
    worley(x + 5, y + 3, 3, 3, seed + 33, 0.95);
    const e2 = W.f2 - W.f1;
    if (e2 < 1.5) {
      const k = 1 - e2 / 1.5;
      o.r *= 1 - 0.35 * k;
      o.g *= 1 - 0.22 * k;
      o.b *= 1 - 0.1 * k;
      o.a = Math.min(1, o.a + 0.12 * k);
    }
    if (frost > 0.74) {
      const k = (frost - 0.74) * 3.2;
      o.r = lerp(o.r, 1, k * 0.45);
      o.g = lerp(o.g, 1, k * 0.45);
      o.b = lerp(o.b, 1, k * 0.45);
      o.a = Math.max(o.a, 0.78);
    }
  });
  t.bump = 0.7;
}

export function paintSlipperyIce(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 2, 4, 3, seed);
    const streak = vnoise(x, y, 3, 12, seed + 5);
    setMix(o, hex(0x5aa9d8), hex(0xb7e6f8), clamp(0.25 + n * 0.7 + (streak - 0.5) * 0.3));
    o.h = 0.55 + streak * 0.1;
    o.ro = 0.05;
    worley(x, y, 3, 3, seed + 7, 1);
    const e = W.f2 - W.f1;
    if (e < 0.8) {
      o.r = lerp(o.r, 1, 0.5);
      o.g = lerp(o.g, 1, 0.5);
      o.b = lerp(o.b, 1, 0.5);
    }
    if (rnd(x, y, seed + 8) > 0.99) {
      o.r = 1;
      o.g = 1;
      o.b = 1;
      o.e = 0.1;
    }
  });
  t.bump = 0.35;
}

export function paintClay(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 3, 3, 4, seed);
    const drag = vnoise(x, y, 2, 14, seed + 4);
    setMix(o, hex(0x8a95a4), hex(0xb0b8c2), clamp(n * 1.2 + (drag - 0.5) * 0.4));
    o.h = 0.4 + n * 0.3 + drag * 0.1;
    o.ro = 0.55 + n * 0.2;
    if (rnd(x, y, seed + 6) > 0.992) {
      o.r *= 0.75;
      o.g *= 0.75;
      o.b *= 0.78;
    }
  });
  t.bump = 0.5;
}

export function paintSandstoneTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 5, 5, 3, seed);
    const g = rnd(x, y, seed + 2) - 0.5;
    setMix(o, hex(0xc9ae78), hex(0xe6d29e), clamp(0.2 + n * 0.8 + g * 0.2));
    o.h = 0.4 + n * 0.3 + g * 0.1;
    if (rnd(x, y, seed + 3) > 0.985) {
      o.r *= 0.7;
      o.g *= 0.68;
      o.b *= 0.62;
    }
    worley(x, y, 3, 3, seed + 6, 0.9);
    const e = W.f2 - W.f1;
    if (e < 1.0 && vnoise(x, y, 3, 3, seed + 8) > 0.55) {
      o.r *= 0.78;
      o.g *= 0.76;
      o.b *= 0.7;
      o.h -= 0.2;
    }
    o.ro = 0.95;
  });
  t.bump = 0.9;
}

export function paintSandstoneBottom(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 3, seed);
    setMix(o, hex(0xa98e5e), hex(0xc7ae7c), clamp(n * 1.2 + (rnd(x, y, seed) - 0.5) * 0.15));
    o.h = 0.4 + n * 0.3;
    o.ro = 0.95;
  });
  t.bump = 0.7;
}

export function paintSandstoneSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const warp = vnoise(x, y, 2, 2, seed + 4) * 1.6;
    const bandF = (y / N) * 8 + warp * 0.35;
    const band = Math.floor(bandF);
    const bi = ((band % 8) + 8) % 8;
    const tone = 0.45 + rnd(bi, 1, seed) * 0.5;
    const pal = mixc(hex(0xb89c66), hex(0xe9d6a2), tone);
    const g = rnd(x, y, seed + 1) - 0.5;
    const n = fbm(x, y, 5, 5, 3, seed + 9);
    o.r = pal[0] * (0.9 + n * 0.2 + g * 0.08);
    o.g = pal[1] * (0.9 + n * 0.2 + g * 0.08);
    o.b = pal[2] * (0.9 + n * 0.2 + g * 0.08);
    const f = bandF - band;
    o.h = 0.45 + n * 0.25;
    if (f < 0.1 || f > 0.94) {
      o.r *= 0.82;
      o.g *= 0.8;
      o.b *= 0.72;
      o.h -= 0.15;
    }
    o.ro = 0.95;
  });
  t.bump = 1.0;
}

export function paintBasaltTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    worley(x, y, 3, 3, seed, 0.55);
    const edge = W.f2 - W.f1;
    const id = W.id;
    const n = fbm(x, y, 6, 6, 3, seed + 2);
    const base = 0.16 + id * 0.1 + n * 0.12;
    o.r = base;
    o.g = base * 1.02;
    o.b = base * 1.1;
    const dome = clamp(edge / 6);
    o.r *= 0.8 + dome * 0.3;
    o.g *= 0.8 + dome * 0.3;
    o.b *= 0.8 + dome * 0.3;
    o.h = 0.35 + dome * 0.5;
    if (edge < 1.3) {
      o.r *= 0.45;
      o.g *= 0.45;
      o.b *= 0.5;
      o.h = 0.12;
      o.ao = 0.6;
    }
    if (rnd(x, y, seed + 9) > 0.975) {
      o.r += 0.18;
      o.g += 0.2;
      o.b += 0.28;
      o.ro = 0.25;
    }
    o.ro = Math.min(o.ro, 0.55);
  });
  t.bump = 1.3;
}

export function paintBasaltSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const col = vnoise(x + vnoise(x, y, 3, 6, seed + 5) * 3, y, 8, 1, seed);
    const n = fbm(x, y, 8, 3, 3, seed + 2);
    const base = 0.14 + col * 0.12 + n * 0.1;
    o.r = base;
    o.g = base * 1.02;
    o.b = base * 1.1;
    o.h = 0.35 + col * 0.45;
    // dikey kolon aralıkları
    const gap = vnoise(x, y, 6, 1, seed + 33);
    if (gap < 0.12) {
      o.r *= 0.5;
      o.g *= 0.5;
      o.b *= 0.55;
      o.h = 0.1;
      o.ao = 0.6;
    }
    if (rnd(x, y, seed + 9) > 0.978) {
      o.r += 0.15;
      o.g += 0.17;
      o.b += 0.24;
      o.ro = 0.25;
    }
    o.ro = Math.min(o.ro, 0.6);
  });
  t.bump = 1.2;
}

export function paintMud(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 4, seed);
    const pud = fbm(x, y, 3, 3, 3, seed + 21);
    setMix(o, hex(0x3b2c20), hex(0x65503a), clamp(n * 1.1));
    o.h = 0.35 + n * 0.4;
    o.ro = 0.9;
    if (pud > 0.58) {
      const k = smooth(0.58, 0.68, pud);
      o.r *= 1 - 0.28 * k;
      o.g *= 1 - 0.28 * k;
      o.b *= 1 - 0.22 * k;
      o.ro = lerp(0.9, 0.12, k);
      o.h = lerp(o.h, 0.3, k);
    }
    const r = rnd(x, y, seed + 4);
    if (r > 0.99) {
      o.r = lerp(o.r, 0.6, 0.35);
      o.g = lerp(o.g, 0.55, 0.35);
      o.b = lerp(o.b, 0.5, 0.35);
    }
  });
  t.bump = 0.9;
}

export function paintCanyonTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 5, 5, 4, seed);
    setMix(o, hex(0xa84a2a), hex(0xd2814e), clamp(0.1 + n * 0.95));
    o.h = 0.4 + n * 0.3;
    worley(x, y, 4, 4, seed + 7, 0.9);
    const e = W.f2 - W.f1;
    if (e < 1.0) {
      const k = 1 - e / 1.0;
      o.r *= 1 - 0.5 * k;
      o.g *= 1 - 0.5 * k;
      o.b *= 1 - 0.45 * k;
      o.h -= 0.3 * k;
      o.ao = 1 - 0.3 * k;
    }
    if (rnd(x, y, seed + 2) > 0.98) {
      o.r = lerp(o.r, 0.95, 0.3);
      o.g = lerp(o.g, 0.78, 0.3);
      o.b = lerp(o.b, 0.6, 0.3);
    }
    o.ro = 0.95;
  });
  t.bump = 1.0;
}

const CANYON_BANDS = [0xa63e28, 0xcf7a45, 0xe4b078, 0x8a3a2c, 0xc2603a, 0xdc9a60, 0x9c4a30, 0xd88a50];
export function paintCanyonSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const warp = vnoise(x, y, 2, 2, seed + 4) * 2;
    const bf = (y / N) * 8 + warp * 0.3;
    const b = Math.floor(bf);
    const pal = hex(CANYON_BANDS[(((b + (seed & 3)) % 8) + 8) % 8]);
    const n = fbm(x, y, 6, 3, 3, seed);
    const streak = vnoise(x, y, 10, 1, seed + 8);
    const k = 0.84 + n * 0.3 + (streak - 0.5) * 0.12;
    o.r = pal[0] * k;
    o.g = pal[1] * k;
    o.b = pal[2] * k;
    o.h = 0.45 + n * 0.3 + (streak - 0.5) * 0.15;
    const f = bf - b;
    if (f < 0.08) {
      o.r *= 0.78;
      o.g *= 0.74;
      o.b *= 0.7;
      o.h -= 0.15;
    }
    if (rnd(x, y, seed + 2) > 0.985) {
      o.r *= 1.18;
      o.g *= 1.15;
      o.b *= 1.1;
    }
    o.ro = 0.95;
  });
  t.bump = 1.2;
}

/* ------------------------------------------------------------------------------------------------
 * Sıvılar
 * ---------------------------------------------------------------------------------------------- */
/** Su (ton öncesi, açık): kaustik ağ + dalgacıklar. Asıl animasyon shader'da. */
export function paintWater(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 3, 3, 4, seed);
    worley(x + n * 3, y - n * 2, 5, 5, seed + 3, 1);
    const e = W.f2 - W.f1;
    const caustic = 1 - smooth(0, 2.4, e);
    const l = 0.76 + n * 0.18 + caustic * 0.22;
    o.r = l * 0.9;
    o.g = l * 0.97;
    o.b = l;
    o.a = clamp(0.66 + n * 0.1 + caustic * 0.16);
    o.h = 0.45 + caustic * 0.3 + n * 0.2;
    o.ro = 0.05;
    o.tm = 1;
    if (caustic > 0.82) o.e = 0.06;
  });
  t.bump = 0.8;
}

export function paintWaterFlow(t, seed) {
  paintPixels(t, (x, y, o) => {
    const warp = vnoise(x, y, 4, 4, seed + 1) * 3;
    const streak = vnoise(x + warp, y, 10, 2, seed);
    const streak2 = vnoise(x - warp, y, 18, 4, seed + 5);
    const foam = smooth(0.62, 0.9, streak * 0.6 + streak2 * 0.5);
    const l = 0.74 + streak * 0.14 + foam * 0.2;
    o.r = l * 0.92;
    o.g = l * 0.98;
    o.b = l;
    o.a = clamp(0.68 + foam * 0.25);
    o.h = 0.4 + streak * 0.35 + foam * 0.15;
    o.ro = 0.06;
    o.tm = lerp(1, 0.4, foam);
  });
  t.bump = 1.0;
}

function lavaColor(g) {
  // g 0..1: koyu kızıl → turuncu → sarı → beyazımsı
  if (g < 0.4) return mixc(hex(0x6a1204), hex(0xd8400a), g / 0.4);
  if (g < 0.75) return mixc(hex(0xd8400a), hex(0xff9a1c), (g - 0.4) / 0.35);
  return mixc(hex(0xff9a1c), hex(0xffec9a), (g - 0.75) / 0.25);
}

export function paintLava(t, seed, flow = false) {
  paintPixels(t, (x, y, o) => {
    const wx = x + (vnoise(x, y, 3, 3, seed + 2) - 0.5) * 5;
    const wy = y + (vnoise(x, y, 3, 3, seed + 9) - 0.5) * 5;
    if (flow) worley(wx, wy, 4, 2, seed, 0.95);
    else worley(wx, wy, 4, 4, seed, 0.95);
    const edge = W.f2 - W.f1;
    const n = fbm(x, y, 4, 4, 3, seed + 4);
    const crust = smooth(0.7, 2.7, edge + (n - 0.5) * 1.7);
    const glow = 1 - crust;
    if (crust > 0.55) {
      const c = 0.05 + n * 0.12 + rnd(x, y, seed + 6) * 0.03;
      o.r = c * 1.7;
      o.g = c * 0.95;
      o.b = c * 0.7;
      o.e = 0.06 + (1 - crust) * 0.5;
      o.h = 0.7 + n * 0.2;
      o.ro = 0.95;
      const edgeGlow = smooth(0.55, 0.78, crust);
      if (edgeGlow < 1) {
        const lc = lavaColor(0.22 + (1 - edgeGlow) * 0.3);
        o.r = lerp(lc[0], o.r, edgeGlow);
        o.g = lerp(lc[1], o.g, edgeGlow);
        o.b = lerp(lc[2], o.b, edgeGlow);
        o.e = lerp(0.85, o.e, edgeGlow);
      }
    } else {
      const c = lavaColor(clamp(0.16 + glow * 0.66 + (n - 0.5) * 0.35));
      o.r = c[0];
      o.g = c[1];
      o.b = c[2];
      o.e = clamp(0.8 + glow * 0.2);
      o.h = 0.2 + n * 0.2;
      o.ro = 0.3;
    }
  });
  t.bump = 0.9;
}

