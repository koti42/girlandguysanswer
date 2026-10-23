/*
 * KEŞİF render — Neon Meridyen şehir dokuları (sim/cityData.js, bloklar 223–240): 20 yeni 32 px prosedürel doku.
 *
 *   asfalt, asfalt_yan, asfalt_çizgi_x/z, zebra_x/z, kaldırım (dokunsal plaka), kaldırım_yan,
 *   neon_camgöbeği/pembe/kehribar/limon (parlak çekirdekli tüp), pencere_karanlık/sıcak/soğuk, cephe_koyu/açık, holo_panel,
 *   kayar_kapı (kapalı), kayar_kapı_açık (orta boşluk = kesik doku).
 *
 * `CITY_PAINTERS` atlas.js kayıt defterine yayılır (ad → (tile, seed) boyayıcı). Hepsi belirlenimci ve saf (canvas yok).
 *
 * Görsel dil (mevcut atlas ile uyumlu: koyu mat gövde + az sayıda yüksek kontrastlı parlak detay):
 *  - Yol: mavimsi koyu asfalt; pürüzlülük kanalı "cilalı yama" (düşük pürüzlülük) taşır → ıslak shader bu yamalarda daha çok yansıtır
 *    (WET_SURFACE tanıtıcısı cityData.WET_TILE_NAMES; mesher üst yüze aCity.a bit7 yazar).
 *  - Neon: ışıma YALNIZCA doku emisyonunda (çekirdek 1.0, gövde 0.95, halka sönümlü) → HDR/bloom; renk körlüğü için tüp + kenetler şekli.
 *  - Pencere: 3 durum, ayrı iç mekân (perde/mobilya/ekran silüeti); yanık pencerede emisyon cam alanındadır, çerçeve karanlık kalır.
 *    Mesher şehir modunda pencereyi karma (yatay ayna) çizer → iki varyant.
 *  - Kapı: kapalı = parlak camgöbeği çerçeve + tehlike şeridi; açık = yeşil çerçeve + boşluk (şekil + renk ayrımı).
 */
import {
  N, rnd, vnoise, fbm, hex, lerp, clamp, smooth, paintPixels, put, shade, setH, setRo, disc, ix,
} from './atlasKit.js';

/* ------------------------------------------------------------------------------------------------
 * Ortak yardımcılar
 * ---------------------------------------------------------------------------------------------- */
function mix3(o, a, b, t) {
  o.r = a[0] + (b[0] - a[0]) * t;
  o.g = a[1] + (b[1] - a[1]) * t;
  o.b = a[2] + (b[2] - a[2]) * t;
}
function blend(o, c, k) {
  o.r += (c[0] - o.r) * k;
  o.g += (c[1] - o.g) * k;
  o.b += (c[2] - o.b) * k;
}
function lum(o) {
  return 0.2126 * o.r + 0.7152 * o.g + 0.0722 * o.b;
}
function scaleRgb(o, k) {
  o.r *= k;
  o.g *= k;
  o.b *= k;
}

/* ------------------------------------------------------------------------------------------------
 * Asfalt ve yol işaretleri
 * ---------------------------------------------------------------------------------------------- */
const ASPH_D = hex(0x1f2227);
const ASPH_M = hex(0x31353c);
const ASPH_L = hex(0x464b54);
const STONE_L = hex(0x7a7f89);

/** Ortak asfalt piksel: ince taneli kırma taş, bakım izi yamaları, seyrek çatlak; ro = cilalı yama haritası (ıslak yansıma verisi). */
function asphalt(o, x, y, seed) {
  const big = fbm(x, y, 3, 3, 3, seed + 1);
  const mid = vnoise(x, y, 8, 8, seed + 2);
  const fine = rnd(x, y, seed + 3);
  const v = clamp(0.24 + big * 0.36 + mid * 0.14 + (fine - 0.5) * 0.17);
  if (v < 0.5) mix3(o, ASPH_D, ASPH_M, v * 2);
  else mix3(o, ASPH_M, ASPH_L, (v - 0.5) * 2);
  const ag = rnd(x, y, seed + 4);
  let bump = 0;
  if (ag > 0.94) {
    blend(o, STONE_L, 0.35 + rnd(x, y, seed + 5) * 0.4);
    bump = 0.06;
  } else if (ag < 0.04) {
    scaleRgb(o, 0.62);
    bump = -0.05;
  }
  // cilalı yama (aşınmış, pürüzsüz): ıslak shader'da yansıma/su birikintisi öncelik alanı
  const sheen = smooth(0.54, 0.76, vnoise(x, y, 3, 3, seed + 9) * 0.7 + vnoise(x, y, 6, 6, seed + 10) * 0.3);
  scaleRgb(o, 1 + sheen * 0.1);
  o.ro = 0.9 - sheen * 0.2 + (fine - 0.5) * 0.05;
  o.h = 0.5 + (big - 0.5) * 0.04 + bump - sheen * 0.015;
  // seyrek zift çatlağı: düşük frekanslı gürültünün sıfır geçişi, yalnız maske içinde
  if (vnoise(x, y, 2, 2, seed + 21) > 0.58 && Math.abs(vnoise(x, y, 4, 4, seed + 20) - 0.5) < 0.014) {
    scaleRgb(o, 0.45);
    o.h -= 0.22;
    o.ro = 0.9;
  }
}

/** İşaret boyası: cov 0..1 kapsama, aşınma gürültüsüyle delik deşik; boya asfalttan daha pürüzsüz. */
function markPaint(o, x, y, seed, cov, col) {
  if (cov <= 0) return;
  const wear = fbm(x, y, 4, 4, 2, seed + 40) * 0.55 + rnd(x, y, seed + 41) * 0.45;
  const keep = smooth(0.14, 0.44, wear) * cov;
  const tone = 0.9 + rnd(x, y, seed + 42) * 0.1;
  o.r += (col[0] * tone - o.r) * keep;
  o.g += (col[1] * tone - o.g) * keep;
  o.b += (col[2] * tone - o.b) * keep;
  o.ro += (0.52 - o.ro) * keep;
  o.h += 0.07 * keep;
}

/** [a,b) aralığı için yumuşak kenarlı satır/sütun kapsaması (kenar 0.5 piksel titrek). */
function band(pos, a, b, jitter) {
  const p = pos + 0.5 + jitter;
  return clamp(Math.min(p - a, b - p) + 0.5);
}

const PAINT_WHITE = hex(0xe9e7dc);
const PAINT_YELLOW = hex(0xe5b92d);

export function paintAsphalt(t, seed) {
  paintPixels(t, (x, y, o) => asphalt(o, x, y, seed));
  t.bump = 0.65;
}

/** Yol kesiti (yan/alt): üstte ince asfalt, altında çakıl dolgu ve beton tabanı. Yatayda kusursuz döşenir. */
export function paintAsphaltSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 2, 3, seed + 1);
    const fine = rnd(x, y, seed + 2);
    if (y < 4) {
      asphalt(o, x, y + 6, seed + 90);
      scaleRgb(o, 0.9);
      o.h = 0.55;
    } else if (y < 22) {
      // çakıl dolgu: taneler
      const base = hex(0x4a4743);
      mix3(o, base, hex(0x6a655d), clamp(n * 1.2 + (fine - 0.5) * 0.5));
      const g = rnd(x >> 1, y >> 1, seed + 3);
      if (g > 0.78) scaleRgb(o, 0.72 + g * 0.3);
      o.ro = 0.95;
      o.h = 0.42 + n * 0.16 + (fine - 0.5) * 0.08;
    } else {
      mix3(o, hex(0x4f5257), hex(0x666a70), clamp(n * 1.1 + (fine - 0.5) * 0.3));
      o.ro = 0.9;
      o.h = 0.5 + (fine - 0.5) * 0.05;
      if (y === 22) scaleRgb(o, 0.7);
    }
  });
  t.bump = 1.1;
}

export function paintLane(t, seed, alongX) {
  paintPixels(t, (x, y, o) => {
    asphalt(o, x, y, seed);
    const along = alongX ? x : y;
    const across = alongX ? y : x;
    const cov = band(across, 13, 18, (rnd(along, 3, seed + 7) - 0.5) * 0.5);
    markPaint(o, x, y, seed, cov, PAINT_YELLOW);
  });
  t.bump = 0.65;
}

export function paintZebra(t, seed, alongX) {
  paintPixels(t, (x, y, o) => {
    asphalt(o, x, y, seed);
    const along = alongX ? x : y;
    const across = alongX ? y : x;
    const cov = band(across, 1, 15, (rnd(along, 5, seed + 7) - 0.5) * 0.6);
    markPaint(o, x, y, seed, cov, PAINT_WHITE);
  });
  t.bump = 0.65;
}

/* ------------------------------------------------------------------------------------------------
 * Kaldırım
 * ---------------------------------------------------------------------------------------------- */
/** Üst: 2×2 beton plaka (16 px); sol-alt plaka dokunsal kubbeli (4×4 kubbe). Derz 1 px (sarmalı). */
export function paintSidewalk(t, seed) {
  paintPixels(t, (x, y, o) => {
    const px = x >> 4;
    const py = y >> 4;
    const slab = rnd(px, py, seed + 11);
    const n = fbm(x, y, 4, 4, 3, seed + 1);
    const fine = rnd(x, y, seed + 2);
    const tone = 0.92 + slab * 0.14;
    mix3(o, hex(0x8c8e92), hex(0xb2b4b8), clamp(n * 1.1 + (fine - 0.5) * 0.18));
    scaleRgb(o, tone);
    o.ro = 0.9;
    o.h = 0.5 + (n - 0.5) * 0.05 + (fine - 0.5) * 0.03;
    if (fine > 0.965) scaleRgb(o, 0.7); // gözenek
    // kir lekesi
    const stain = smooth(0.62, 0.8, vnoise(x, y, 3, 3, seed + 14));
    scaleRgb(o, 1 - stain * 0.14);
    const lx = x & 15;
    const ly = y & 15;
    if (lx === 0 || ly === 0) {
      scaleRgb(o, 0.5);
      o.h = 0.25;
    } else if (lx === 1 || ly === 1) {
      scaleRgb(o, 1.08); // plaka kenar parlaklığı
      o.h = 0.56;
    }
    // dokunsal plaka: sol-alt (px 0, py 1)
    if (px === 0 && py === 1) {
      blend(o, hex(0xb7aa7a), 0.2); // hafif sarımsı
    }
  });
  // kubbeler (döngü dışı: dairesel gölge/vurgu)
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const cx = 3.5 + gx * 3.5;
      const cy = 16 + 3.5 + gy * 3.5;
      disc(cx, cy, 1.45, (x, y, d, nx, ny) => {
        const k = 1.05 + (1 - d) * 0.22 - (nx + ny) * 0.16;
        const i = ix(x, y) * 4;
        t.c[i] = clamp(t.c[i] * k * 1.05);
        t.c[i + 1] = clamp(t.c[i + 1] * k * 1.05);
        t.c[i + 2] = clamp(t.c[i + 2] * k);
        t.h[ix(x, y)] = 0.82 - d * 0.15;
      });
    }
  }
  t.bump = 1.35;
}

export function paintSidewalkSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 6, 2, 3, seed + 1);
    const fine = rnd(x, y, seed + 2);
    mix3(o, hex(0x80828a), hex(0xa2a4aa), clamp(n + (fine - 0.5) * 0.2));
    o.ro = 0.9;
    o.h = 0.5 + (fine - 0.5) * 0.04;
    if (y < 3) {
      scaleRgb(o, 1.16 - y * 0.04); // üst dudak aydınlık
      o.h = 0.6;
    }
    if (y > 25) scaleRgb(o, 0.62 + (31 - y) * 0.045); // alt kirli bant
    if ((x & 15) === 0) {
      scaleRgb(o, 0.62);
      o.h = 0.3;
    }
    if (fine > 0.97) scaleRgb(o, 0.7);
  });
  t.bump = 1;
}

/* ------------------------------------------------------------------------------------------------
 * Neon tüpler
 * ---------------------------------------------------------------------------------------------- */
export const NEON_COLORS = Object.freeze({
  camgöbeği: hex(0x28e8ff),
  pembe: hex(0xff3ca8),
  kehribar: hex(0xffa91e),
  limon: hex(0xb8ff2c),
});
const WHITE = [1, 1, 1];
const HOUSING_D = hex(0x0f1115);
const HOUSING_L = hex(0x252a31);
const CLIP = hex(0x2c3239);

/**
 * Yatay tüp (tam genişlik → şerit olarak sürekli), gövde koyu mat; 16 px'te bir kenet (dikey kaburgada boncuk gibi okunur).
 * Işıma: çekirdek 1.0 (beyaza yakın), gövde 0.95, dış halka 0.7, yayılım halesi ≤0.45; kenet ışımayı keser.
 */
export function paintNeon(t, seed, C) {
  const R = 5.2;
  paintPixels(t, (x, y, o) => {
    const dy = y + 0.5 - 16;
    const ady = Math.abs(dy);
    const metal = vnoise(x, y, 24, 2, seed + 3) * 0.6 + rnd(x, y, seed + 4) * 0.12;
    mix3(o, HOUSING_D, HOUSING_L, metal);
    o.ro = 0.5;
    o.h = 0.45 + metal * 0.05;
    const flick = 0.95 + 0.05 * Math.cos((x / 32) * Math.PI * 4 + (seed & 7));
    if (ady <= R) {
      const d = ady / R;
      if (d < 0.3) {
        mix3(o, C, WHITE, 0.8);
        o.e = 1;
      } else if (d < 0.64) {
        mix3(o, C, WHITE, 0.22);
        o.e = 0.97 * flick;
      } else {
        o.r = C[0] * 0.6;
        o.g = C[1] * 0.6;
        o.b = C[2] * 0.6;
        o.e = 0.72 * flick;
      }
      o.ro = 0.14;
      o.h = 0.78 + (1 - d) * 0.2;
    } else {
      const g = Math.max(0, 1 - (ady - R) / 7.5);
      const k = g * g;
      blend(o, C, k * 0.5);
      o.e = k * 0.46 * flick;
    }
    // kenet (x 0..1 ve 16..17): tüpü sarar
    const cx = x & 15;
    if (cx < 2 && ady < R + 2.2) {
      mix3(o, CLIP, hex(0x4a525c), cx === 0 ? 0.55 : 0.15);
      if (dy < -R) scaleRgb(o, 1.25);
      o.e = 0.02;
      o.ro = 0.35;
      o.h = 0.95;
    }
  });
  // plaka uç çizgileri
  for (let x = 0; x < N; x++) {
    shade(t, x, 0, 0.55);
    shade(t, x, N - 1, 0.55);
  }
  t.bump = 1.2;
}

/* ------------------------------------------------------------------------------------------------
 * Pencereler (3 durum)
 * ---------------------------------------------------------------------------------------------- */
const FRAME = hex(0x2a2f36);
const FRAME_HI = hex(0x4c5560);

function inPane(x, y) {
  return x >= 2 && x <= 29 && y >= 2 && y <= 28;
}

/** Çerçeve: koyu alüminyum, iç kenar aydınlık/dış gölge; sill alt şerit. light = cam renginin çerçeve iç kenarına sızması. */
function windowFrame(o, x, y, seed, spill) {
  const n = rnd(x, y, seed + 3);
  mix3(o, FRAME, FRAME_HI, 0.12 + n * 0.1);
  o.ro = 0.34;
  o.h = 0.85;
  if (y >= 29) {
    // denizlik
    scaleRgb(o, y === 29 ? 1.35 : 0.8);
    o.h = y === 29 ? 0.95 : 0.7;
  } else if (x === 0 || y === 0) {
    scaleRgb(o, 0.65);
  } else if (x === 1 || y === 1) {
    scaleRgb(o, 1.18);
  } else if (x === 30 || x === 31) {
    scaleRgb(o, 0.75);
  }
  if (spill) {
    // yakın cam ışığı çerçevenin iç kenarına yansır
    if (x === 1 || x === 30 || y === 1 || y === 29) {
      blend(o, spill, 0.2);
      o.e = 0.1;
    }
  }
}

/** Cam alanı koordinatı (u,v 0..1). */
function pane(x, y) {
  return [(x - 2) / 27, (y - 2) / 26];
}

/** Cam iç kenarında 1 px koyu derinlik (cam çerçeveye gömülü görünür). */
function paneInset(o, x, y) {
  const edge = Math.min(x - 2, 29 - x, y - 2, 28 - y);
  if (edge === 0) scaleRgb(o, 0.72);
  o.h = 0.3 + (edge > 0 ? 0.02 : 0);
}

export function paintWindowDark(t, seed) {
  paintPixels(t, (x, y, o) => {
    if (!inPane(x, y)) {
      windowFrame(o, x, y, seed, null);
      return;
    }
    const [u, v] = pane(x, y);
    // gökyüzü yansıması: üstte mavimsi, altta neredeyse siyah
    mix3(o, hex(0x1a2636), hex(0x06090f), smooth(0, 0.85, v));
    // çapraz parlama bandı (yumuşak, iki şerit)
    const q = (x + y * 0.7 + 38) % 38;
    const s1 = smooth(0, 1, 1 - Math.abs(q - 14) / 5.5);
    const s2 = smooth(0, 1, 1 - Math.abs(q - 24) / 2);
    const sheen = s1 * 0.34 + s2 * 0.16;
    o.r += 0.23 * sheen;
    o.g += 0.32 * sheen;
    o.b += 0.45 * sheen;
    // sönük iç mekân ipuçları: tavan çizgisi, mobilya, bekleme ışığı
    if (y === 8) scaleRgb(o, 1.35);
    if (u > 0.62 && u < 0.95 && v > 0.62 && v < 0.98) scaleRgb(o, 1.22);
    if (x === 6 && y === 25) {
      o.r = 0.2;
      o.g = 0.9;
      o.b = 0.55;
      o.e = 0.55;
    }
    o.ro = 0.1;
    paneInset(o, x, y);
  });
  t.bump = 1;
}

const WARM_CEIL = hex(0xfff3c4);
const WARM_MID = hex(0xf7b256);
const WARM_FLOOR = hex(0xa8571f);
const CURTAIN = hex(0xc24a2b);

export function paintWindowWarm(t, seed) {
  const spill = [1, 0.78, 0.4];
  paintPixels(t, (x, y, o) => {
    if (!inPane(x, y)) {
      windowFrame(o, x, y, seed, spill);
      return;
    }
    const [u, v] = pane(x, y);
    if (v < 0.45) mix3(o, WARM_CEIL, WARM_MID, v / 0.45);
    else mix3(o, WARM_MID, WARM_FLOOR, (v - 0.45) / 0.55);
    // tavan lambası
    const dl = Math.hypot((u - 0.3) * 1.2, v - 0.06);
    const lamp = Math.max(0, 1 - dl / 0.38);
    blend(o, [1, 1, 0.92], lamp * lamp * 0.8);
    let e = 0.5 + lum(o) * 0.5;
    // perde: solda dikey kıvrımlar
    if (u < 0.2 && v < 0.84) {
      const fold = 0.72 + 0.28 * Math.sin(u * 62 + 0.6);
      mix3(o, CURTAIN, hex(0x7c2a1a), 1 - fold);
      scaleRgb(o, 0.92 + rnd(x, 0, seed + 2) * 0.1);
      e = 0.38;
    }
    // mobilya (dolap/koltuk) ve bitki silüeti
    if (u > 0.56 && u < 0.96 && v > 0.74) {
      mix3(o, hex(0x3b2216), hex(0x5a3522), (v - 0.74) * 2);
      if (v < 0.78) scaleRgb(o, 1.5);
      e = 0.08;
    }
    const pd = Math.hypot((u - 0.42) * 1.4, v - 0.8);
    if (pd < 0.12) {
      o.r = 0.17;
      o.g = 0.29;
      o.b = 0.14;
      e = 0.06;
    }
    const g = (rnd(x, y, seed + 5) - 0.5) * 0.06;
    o.r = clamp(o.r + g);
    o.g = clamp(o.g + g);
    o.b = clamp(o.b + g);
    o.e = clamp(e);
    o.ro = 0.2;
    paneInset(o, x, y);
  });
  t.bump = 1;
}

const COOL_CEIL = hex(0xf2fbff);
const COOL_MID = hex(0x8fd0f2);
const COOL_FLOOR = hex(0x2a6592);

export function paintWindowCool(t, seed) {
  const spill = [0.62, 0.86, 1];
  paintPixels(t, (x, y, o) => {
    if (!inPane(x, y)) {
      windowFrame(o, x, y, seed, spill);
      return;
    }
    const [u, v] = pane(x, y);
    if (v < 0.42) mix3(o, COOL_CEIL, COOL_MID, v / 0.42);
    else mix3(o, COOL_MID, COOL_FLOOR, (v - 0.42) / 0.58);
    let e = 0.5 + lum(o) * 0.45;
    // jaluzi: üst %38 yatay lamel (3 px döngü: gölge çizgisi koyu, parlak bant)
    if (v < 0.38) {
      const m = (y - 2) % 3;
      if (m === 2) {
        scaleRgb(o, 0.5);
        e *= 0.45;
      } else if (m === 0) {
        scaleRgb(o, 1.08);
      }
    }
    // masa + monitör + sandalye
    if (v > 0.8) {
      mix3(o, hex(0x1b3047), hex(0x0f1f31), (v - 0.8) * 4);
      e = 0.05;
    }
    if (u > 0.3 && u < 0.62 && v > 0.5 && v < 0.7) {
      const bezel = u < 0.33 || u > 0.59 || v < 0.53 || v > 0.67;
      if (bezel) {
        mix3(o, hex(0x14202e), hex(0x24384c), 0.4);
        e = 0.06;
      } else {
        mix3(o, hex(0xdff7ff), hex(0x9fe4ff), (v - 0.53) * 7);
        e = 1;
      }
    }
    if (u > 0.43 && u < 0.5 && v > 0.7 && v <= 0.8) {
      o.r = 0.1;
      o.g = 0.16;
      o.b = 0.23;
      e = 0.04;
    }
    if (u > 0.72 && u < 0.9 && v > 0.55 && v <= 0.8) {
      o.r = 0.09;
      o.g = 0.15;
      o.b = 0.22;
      e = 0.04;
    }
    const g = (rnd(x, y, seed + 5) - 0.5) * 0.05;
    o.r = clamp(o.r + g);
    o.g = clamp(o.g + g);
    o.b = clamp(o.b + g);
    o.e = clamp(e);
    o.ro = 0.2;
    paneInset(o, x, y);
  });
  t.bump = 1;
}

/* ------------------------------------------------------------------------------------------------
 * Cephe panelleri
 * ---------------------------------------------------------------------------------------------- */
export function paintFacadeDark(t, seed) {
  paintPixels(t, (x, y, o) => {
    const tw = (((x + y) & 3) - 1.5) * 0.018; // dimi örgü
    const n = fbm(x, y, 4, 4, 2, seed + 1);
    const g = (rnd(x, y, seed + 2) - 0.5) * 0.05;
    mix3(o, hex(0x1d2026), hex(0x2c3038), clamp(n * 0.9 + tw * 4 + g));
    o.ro = 0.42 + (rnd(x, y, seed + 3) - 0.5) * 0.08;
    o.h = 0.55 + tw;
    // ince vurgu çizgisi (yatay) ve panel derzi
    if (y === 15 || y === 16) {
      mix3(o, hex(0x2b3846), hex(0x3a4c60), y === 15 ? 0.8 : 0.2);
      o.h = y === 15 ? 0.68 : 0.42;
    }
    if (x === 0 || y === 0) {
      scaleRgb(o, 0.5);
      o.h = 0.25;
    } else if (x === 1 || y === 1) {
      scaleRgb(o, 1.45);
      o.h = 0.65;
    }
  });
  const screw = (cx, cy) => disc(cx, cy, 1.3, (x, y, d, nx, ny) => {
    const k = 0.8 + (1 - d) * 0.45 - (nx + ny) * 0.2;
    put(t, x, y, 0.42 * k, 0.45 * k, 0.5 * k, 1);
    setH(t, x, y, 0.9);
    setRo(t, x, y, 0.3);
  });
  screw(4.5, 4.5);
  screw(27.5, 4.5);
  screw(4.5, 27.5);
  screw(27.5, 27.5);
  t.bump = 1.2;
}

export function paintFacadeLight(t, seed) {
  paintPixels(t, (x, y, o) => {
    const streak = vnoise(x, y, 30, 2, seed + 1) * 0.55 + vnoise(x, y, 44, 5, seed + 2) * 0.45;
    const n = fbm(x, y, 3, 3, 2, seed + 3);
    const grad = 1 - y * 0.004;
    mix3(o, hex(0xa6aeb7), hex(0xd2d8de), clamp(0.2 + streak * 0.6 + n * 0.25 + (rnd(x, y, seed + 4) - 0.5) * 0.06));
    scaleRgb(o, grad);
    o.ro = 0.34 + streak * 0.1;
    o.h = 0.55 + streak * 0.04;
    if (x === 0 || y === 0) {
      mix3(o, hex(0x4e555d), hex(0x6a727b), 0.5);
      o.h = 0.25;
    } else if (x === 1 || y === 1) {
      scaleRgb(o, 1.1);
      o.h = 0.62;
    }
  });
  const rivet = (cx, cy) => disc(cx, cy, 1.25, (x, y, d, nx, ny) => {
    const k = 0.78 + (1 - d) * 0.4 - (nx + ny) * 0.2;
    put(t, x, y, 0.8 * k, 0.83 * k, 0.87 * k, 1);
    setH(t, x, y, 0.95);
    setRo(t, x, y, 0.22);
  });
  [4.5, 15.5, 27.5].forEach((cx) => {
    rivet(cx, 4.5);
    rivet(cx, 27.5);
  });
  t.bump = 1.2;
}

/* ------------------------------------------------------------------------------------------------
 * Holo panel
 * ---------------------------------------------------------------------------------------------- */
export function paintHoloPanel(t, seed) {
  const TOP = [0.1, 0.72, 1];
  const BOT = [0.85, 0.22, 0.92];
  paintPixels(t, (x, y, o) => {
    const v = y / 31;
    const bgc = [lerp(TOP[0], BOT[0], v), lerp(TOP[1], BOT[1], v), lerp(TOP[2], BOT[2], v)];
    o.r = 0.016 + bgc[0] * 0.1;
    o.g = 0.04 + bgc[1] * 0.1;
    o.b = 0.075 + bgc[2] * 0.12;
    let e = 0.3 + bgc[1] * 0.08;
    o.ro = 0.2;
    o.h = 0.5;
    // ızgara (8 px)
    if (x % 8 === 0 || y % 8 === 0) {
      blend(o, bgc, 0.38);
      e = Math.max(e, 0.42);
    }
    // başlık parçaları (yazı benzeri): satır 5–6, hash'le uzunluk
    if (y === 5 || y === 6) {
      const seg = rnd(x >> 2, y, seed + 7);
      if (seg > 0.3 && x > 2 && x < 20) {
        blend(o, [0.85, 0.97, 1], 0.9);
        e = 0.95;
      }
    }
    // çubuk grafik (alt): her 3 px sütun, yükseklik hash'ten
    const bi = x >> 2;
    if (y > 20 && y < 29 && x > 2 && x < 29 && (x & 3) !== 3) {
      const hgt = 3 + Math.floor(rnd(bi, 1, seed + 8) * 8);
      if (29 - y <= hgt) {
        const c = bi % 2 === 0 ? [0.4, 0.95, 1] : [0.95, 0.5, 1];
        blend(o, c, 0.92);
        e = 0.9;
      }
    }
    // halka gösterge (sağ üst)
    const rr = Math.hypot(x + 0.5 - 24, y + 0.5 - 13);
    if (rr > 3.6 && rr < 5 && !(x > 24 && y < 12)) {
      blend(o, [1, 0.45, 0.95], 0.95);
      e = 0.95;
    }
    // tarama çizgileri: tek satırlar kararır
    if ((y & 1) === 1) {
      scaleRgb(o, 0.6);
      e *= 0.62;
    }
    // parıltı bandı
    if (y === 17 || y === 18) {
      scaleRgb(o, 1.5);
      e = Math.min(1, e * 1.35 + 0.1);
    }
    // çerçeve
    if (x === 0 || x === 31 || y === 0 || y === 31) {
      blend(o, [0.5, 0.95, 1], 0.9);
      e = 1;
    }
    o.e = clamp(e);
  });
  t.bump = 0.7;
}

/* ------------------------------------------------------------------------------------------------
 * Kayar kapı
 * ---------------------------------------------------------------------------------------------- */
const DOOR_FRAME_C = hex(0x52f0ff);
const DOOR_FRAME_O = hex(0x5dffa0);

function hazard(o, x, y) {
  const stripe = (x + y) % 8 < 4;
  if (stripe) mix3(o, hex(0xe6b422), hex(0xf2c94a), 0.3);
  else mix3(o, hex(0x1b1d22), hex(0x2c2f35), 0.3);
  o.ro = 0.55;
  o.h = 0.7;
  o.e = stripe ? 0.14 : 0;
}

function doorGlass(o, x, y) {
  const v = y / 31;
  mix3(o, hex(0x213242), hex(0x0b121a), smooth(0, 1, v));
  const q = (x + y * 0.7 + 38) % 38;
  const sheen = smooth(0, 1, 1 - Math.abs(q - 15) / 5) * 0.3 + smooth(0, 1, 1 - Math.abs(q - 25) / 1.8) * 0.14;
  o.r += 0.2 * sheen;
  o.g += 0.3 * sheen;
  o.b += 0.42 * sheen;
  o.ro = 0.1;
  o.h = 0.35;
  o.e = 0;
}

function doorFrame(o, x, y, c, glowE) {
  mix3(o, c, WHITE, 0.35);
  o.e = glowE;
  o.ro = 0.25;
  o.h = 0.9;
}

export function paintDoorClosed(t) {
  paintPixels(t, (x, y, o) => {
    if (x < 2 || x > 29 || y < 2 || y > 29) {
      doorFrame(o, x, y, DOOR_FRAME_C, 1);
      if (x === 0 || x === 31 || y === 0 || y === 31) {
        mix3(o, DOOR_FRAME_C, [0.1, 0.4, 0.5], 0.5);
        o.e = 0.7;
      }
      return;
    }
    if (y >= 26) {
      hazard(o, x, y);
      return;
    }
    doorGlass(o, x, y);
    // iç çerçeve derinliği
    if (x === 2 || x === 29 || y === 2) scaleRgb(o, 0.55);
    // algılayıcı göz (üst orta)
    if (Math.abs(x - 15.5) < 1.6 && y >= 4 && y <= 5) {
      o.r = 0.9;
      o.g = 1;
      o.b = 1;
      o.e = 1;
    }
  });
  t.bump = 1.1;
}

export function paintDoorOpen(t, seed) {
  paintPixels(t, (x, y, o) => {
    const frameEdge = x < 2 || x > 29 || y < 2 || y > 29;
    if (frameEdge) {
      doorFrame(o, x, y, DOOR_FRAME_O, 1);
      if (x === 0 || x === 31 || y === 0 || y === 31) {
        mix3(o, DOOR_FRAME_O, [0.12, 0.5, 0.3], 0.5);
        o.e = 0.7;
      }
      return;
    }
    if (y >= 26) {
      hazard(o, x, y);
      return;
    }
    // açıklık: orta boşluk (kesik); yanlarda geri çekilmiş camlar, üstte lento
    const open = x >= 8 && x <= 23 && y >= 7;
    if (open) {
      o.a = 0;
      o.e = 0;
      return;
    }
    if (y < 7) {
      mix3(o, hex(0x22262d), hex(0x3a414b), (rnd(x, y, seed + 2) - 0.5) * 0.4 + 0.35);
      o.ro = 0.35;
      o.h = 0.8;
      if (y === 6) {
        mix3(o, DOOR_FRAME_O, [0.2, 0.7, 0.45], 0.4);
        o.e = 0.55;
      }
      return;
    }
    doorGlass(o, x, y);
    scaleRgb(o, 0.85);
    if (x === 7 || x === 24) {
      mix3(o, hex(0x3a414b), hex(0x6a727b), 0.4);
      o.h = 0.8;
    }
  });
  t.bump = 1.1;
}

/* ------------------------------------------------------------------------------------------------
 * Kayıt
 * ---------------------------------------------------------------------------------------------- */
/** ad → (tile, seed) boyayıcı (atlas.js REG'e yayılır). */
export const CITY_PAINTERS = {
  asfalt: paintAsphalt,
  asfalt_yan: paintAsphaltSide,
  asfalt_çizgi_x: (t, s) => paintLane(t, s, true),
  asfalt_çizgi_z: (t, s) => paintLane(t, s, false),
  zebra_x: (t, s) => paintZebra(t, s, true),
  zebra_z: (t, s) => paintZebra(t, s, false),
  kaldırım: paintSidewalk,
  kaldırım_yan: paintSidewalkSide,
  neon_camgöbeği: (t, s) => paintNeon(t, s, NEON_COLORS.camgöbeği),
  neon_pembe: (t, s) => paintNeon(t, s, NEON_COLORS.pembe),
  neon_kehribar: (t, s) => paintNeon(t, s, NEON_COLORS.kehribar),
  neon_limon: (t, s) => paintNeon(t, s, NEON_COLORS.limon),
  pencere_karanlık: paintWindowDark,
  pencere_sıcak: paintWindowWarm,
  pencere_soğuk: paintWindowCool,
  cephe_koyu: paintFacadeDark,
  cephe_açık: paintFacadeLight,
  holo_panel: paintHoloPanel,
  kayar_kapı: paintDoorClosed,
  kayar_kapı_açık: paintDoorOpen,
};

/** Bu dosyanın tanımladığı doku adları (belge/test için). */
export const CITY_TILE_NAMES = Object.freeze(Object.keys(CITY_PAINTERS));
