/*
 * KEŞİF render — BİYOM genişletmesi dokuları (sim/biomeData.js, kimlik 160–199).
 * `BIOME_PAINTERS` atlas.js kayıt defterine yayılır (ad → (tile, seed) boyayıcı). Saf, belirlenimci (canvas/Math.random yok).
 *
 * Yapraklar: sonbahar/kiraz/karlı çam dokuları SABİT renklidir (ton maskesi tm=0: biyom tonu uygulanmaz, yine de blok 'foliage'
 * tonlu sayıldığı için rüzgârda sallanır). Cangıl/mangrov yaprakları nötr boyanır (tm=1) ve biyom tonunu alır.
 * Çapraz bitkiler (bambu, çiçekler, eğrelti, mercan yelpazesi…) alfa=0 zeminli sprite'tır.
 */
import {
  rnd, ihash, vnoise, fbm, worley, W, hex, mixc, clamp, lerp, smooth, paintPixels, setMix, put, setH, setTm,
} from './atlasKit.js';
import { WOODS, paintPlanks } from './atlasTilesFlora.js';
import { BIOME_PLANT_PAINTERS } from './atlasTilesBiomePlants.js';

/* ahşap paletleri: paintPlanks (WOODS[kind]) yeni türleri de tanısın */
WOODS.kiraz = {
  bark: [0x4a2a2e, 0x8a5a58], ring: [0xd8a090, 0xefbfae], ringDark: 0xa86a64, planks: [0xc98f86, 0xe3aea2],
};
WOODS.cangıl = {
  bark: [0x4a3a28, 0x8a7458], ring: [0xc8864e, 0xe0a470], ringDark: 0x8e5a30, planks: [0xa8683c, 0xc98a56],
};
WOODS.mangrov = {
  bark: [0x2a1a1c, 0x5a3a3a], ring: [0xb8524a, 0xd8736a], ringDark: 0x7a2e2c, planks: [0x8a3a36, 0xaa5650],
};
WOODS.bambu = {
  bark: [0x6a7a2c, 0xa8b84a], ring: [0xe0d078, 0xf2e8a0], ringDark: 0xb0a048, planks: [0xcdb860, 0xe6d27e],
};

/* ================================================================================================
 * YAPRAKLAR
 * ============================================================================================== */
/**
 * Genel yaprak dokusu (kesik/alfa). cfg: {cells, r, back, aspect, pal:[koyu, orta, açık] (hex), tone: ton maskesi 0/1, vein,
 * mix: [hex, olasılık] ikinci renk serpintisi}
 */
function leafTile(t, seed, cfg) {
  const dark = hex(cfg.pal[0]);
  const mid = hex(cfg.pal[1]);
  const light = hex(cfg.pal[2]);
  const alt = cfg.mix ? hex(cfg.mix[0]) : null;
  paintPixels(t, (x, y, o) => {
    worley(x, y, cfg.cells, cfg.cells, seed, 0.9);
    const f1 = W.f1;
    const id = W.id;
    const dx = x + 0.5 - W.px;
    const dy = y + 0.5 - W.py;
    const ang = id * Math.PI * 2;
    const u = dx * Math.cos(ang) + dy * Math.sin(ang);
    const v = -dx * Math.sin(ang) + dy * Math.cos(ang);
    const ru = cfg.r * 1.25;
    const rv = cfg.r * (cfg.aspect || 0.82);
    const e = (u * u) / (ru * ru) + (v * v) / (rv * rv);
    if (e < 1 && f1 < cfg.r * 1.35) {
      const k = clamp(0.2 + id * 0.75 + (1 - e) * 0.12 + (u > 0 ? 0.06 : -0.04));
      let c = k < 0.5 ? mixc(dark, mid, k * 2) : mixc(mid, light, (k - 0.5) * 2);
      if (alt && rnd(x >> 1, y >> 1, seed + 91) < cfg.mix[1]) c = mixc(c, alt, 0.7);
      o.r = c[0];
      o.g = c[1];
      o.b = c[2];
      if (cfg.vein && Math.abs(v) < 0.4 && u > -ru * 0.8) {
        o.r = Math.min(1, o.r * 1.12);
        o.g = Math.min(1, o.g * 1.1);
        o.b = Math.min(1, o.b * 1.06);
      }
      if (e > 0.82) {
        o.r *= 0.88;
        o.g *= 0.88;
        o.b *= 0.9;
      }
      o.h = 0.7 + (1 - e) * 0.2;
      o.ro = 0.78;
      o.a = 1;
      o.tm = cfg.tone;
      return;
    }
    worley(x + 3, y + 2, cfg.back, cfg.back, seed + 71, 0.9);
    if (W.f1 < cfg.r * 1.05) {
      const k = 0.1 + W.id * 0.35;
      const c = mixc(dark, mid, k);
      o.r = c[0] * 0.78;
      o.g = c[1] * 0.78;
      o.b = c[2] * 0.8;
      o.h = 0.35;
      o.ao = 0.7;
      o.ro = 0.9;
      o.a = 1;
      o.tm = cfg.tone;
      return;
    }
    o.a = 0;
  });
  t.bump = 1.0;
}

const AUTUMN = {
  turuncu: { pal: [0xa83c14, 0xe0731c, 0xf8aa3c], mix: [0xc8281c, 0.1] },
  kırmızı: { pal: [0x6e1414, 0xc02a22, 0xe85a38], mix: [0xe0731c, 0.1] },
  sarı: { pal: [0xa07a14, 0xe2bc26, 0xfce46a], mix: [0xe0731c, 0.09] },
};
function paintAutumn(t, seed, k) {
  leafTile(t, seed, {
    cells: 7, r: 3.1, back: 6, aspect: 0.8, pal: AUTUMN[k].pal, tone: 0, vein: true, mix: AUTUMN[k].mix,
  });
}

function paintCherryLeaves(t, seed) {
  leafTile(t, seed, {
    cells: 7, r: 3.0, back: 6, aspect: 0.85, pal: [0xc8688a, 0xf2a2c0, 0xffd9e6], tone: 0, vein: false, mix: [0xfff2f6, 0.2],
  });
  // çiçek kümeleri: beş taçlı küçük çiçekler
  for (let i = 0; i < 6; i++) {
    const h = ihash(i, 17, seed);
    const cx = (h & 31) + 0.5;
    const cy = ((h >>> 5) & 31) + 0.5;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + (h & 7);
      const px = Math.round(cx + Math.cos(a) * 1.4);
      const py = Math.round(cy + Math.sin(a) * 1.4);
      put(t, px, py, 1, 0.82 + (k & 1) * 0.1, 0.88, 1);
      setTm(t, px, py, 0);
      setH(t, px, py, 0.9);
    }
    put(t, Math.round(cx), Math.round(cy), 0.9, 0.34, 0.5, 1);
    setTm(t, Math.round(cx), Math.round(cy), 0);
  }
}

function paintJungleLeaves(t, seed) {
  leafTile(t, seed, {
    cells: 5, r: 4.4, back: 5, aspect: 0.7, pal: [0x484848, 0x808080, 0xc8c8c8], tone: 1, vein: true,
  });
}

function paintMangroveLeaves(t, seed) {
  leafTile(t, seed, {
    cells: 8, r: 2.5, back: 7, aspect: 0.62, pal: [0x40403a, 0x70706a, 0xa4a49a], tone: 1, vein: true,
  });
}

function paintSnowPineLeaves(t, seed) {
  paintPixels(t, (x, y, o) => {
    worley(x, y, 7, 7, seed, 0.85);
    const f1 = W.f1;
    const id = W.id;
    const dx = x + 0.5 - W.px;
    const dy = y + 0.5 - W.py;
    const a2 = Math.atan2(dy, dx) * 8 + id * 20;
    const needle = f1 < 3.5 && (Math.sin(a2) > -0.2 || f1 < 1.2);
    if (needle) {
      const k = 0.18 + id * 0.3 + (1 - f1 / 3.5) * 0.15;
      setMix(o, hex(0x1c3e2a), hex(0x3a7a52), clamp(k * 1.6));
      // kar tozu: üst-sağ yönlü benekler + rastgele kar
      const snow = vnoise(x, y, 9, 9, seed + 4) * 0.7 + (dy < 0 ? 0.22 : 0) + (rnd(x, y, seed + 9) > 0.8 ? 0.15 : 0);
      if (snow > 0.74) {
        const s = clamp((snow - 0.74) * 4);
        o.r = lerp(o.r, 0.93, s);
        o.g = lerp(o.g, 0.96, s);
        o.b = lerp(o.b, 1.0, s);
        o.h = 0.9;
      } else {
        o.h = 0.6 + id * 0.2;
      }
      o.ro = 0.8;
      o.tm = 0;
      o.a = 1;
      return;
    }
    worley(x + 2, y + 3, 6, 6, seed + 71, 0.9);
    if (W.f1 < 3.2) {
      setMix(o, hex(0x10261a), hex(0x2a5a3c), W.id * 0.6);
      o.h = 0.3;
      o.ao = 0.65;
      o.tm = 0;
      o.a = 1;
      return;
    }
    o.a = 0;
  });
  t.bump = 1.0;
}

/* ================================================================================================
 * KÜTÜK / TAHTA
 * ============================================================================================== */
function paintCherryBark(t, seed) {
  paintPixels(t, (x, y, o) => {
    const lens = vnoise(x, y, 2, 14, seed + 3);
    const grain = vnoise(x, y, 6, 3, seed) * 0.6 + vnoise(x, y, 12, 6, seed + 9) * 0.4;
    setMix(o, hex(0x3a2024), hex(0x8e5a5a), clamp(0.3 + grain * 0.55 + (lens - 0.5) * 0.3));
    o.h = 0.4 + grain * 0.3;
    // yatay lentiseller (kiraz kabuğu)
    const row = (y + Math.floor(rnd(x >> 3, 3, seed) * 4)) % 8;
    if (row === 0 && vnoise(x, y, 5, 4, seed + 1) > 0.45) {
      o.r = lerp(o.r, 0.82, 0.55);
      o.g = lerp(o.g, 0.62, 0.55);
      o.b = lerp(o.b, 0.6, 0.55);
      o.h = 0.7;
    }
    if (vnoise(x, y, 3, 28, seed + 6) > 0.8) {
      o.r *= 0.7;
      o.g *= 0.66;
      o.b *= 0.66;
      o.ao = 0.7;
    }
    o.ro = 0.55;
  });
  t.bump = 1.3;
}

function paintJungleBark(t, seed) {
  paintPixels(t, (x, y, o) => {
    const warp = vnoise(x, y, 2, 4, seed + 1) * 3;
    const r = vnoise(x + warp, y, 7, 3, seed) * 0.7 + vnoise(x + warp, y, 14, 6, seed + 9) * 0.3;
    const ridge = smooth(0.25, 0.72, r);
    setMix(o, hex(0x3a2f20), hex(0x93805c), clamp(ridge * 0.9 + (rnd(x, y, seed + 1) - 0.5) * 0.12));
    o.h = 0.1 + ridge * 0.8;
    if (ridge < 0.15) o.ao = 0.55;
    // yosun lekeleri (yeşilimsi)
    const moss = vnoise(x, y, 4, 4, seed + 12);
    if (moss > 0.66 && ridge > 0.3) {
      const m = smooth(0.66, 0.8, moss) * 0.7;
      o.r = lerp(o.r, 0.28, m);
      o.g = lerp(o.g, 0.5, m);
      o.b = lerp(o.b, 0.2, m);
    }
    o.ro = 0.9;
  });
  t.bump = 1.5;
}

function paintMangroveBark(t, seed) {
  paintPixels(t, (x, y, o) => {
    const warp = vnoise(x, y, 3, 5, seed + 1) * 4;
    const r = vnoise(x + warp, y, 6, 3, seed) * 0.7 + vnoise(x + warp, y, 12, 5, seed + 9) * 0.3;
    const ridge = smooth(0.3, 0.7, r);
    setMix(o, hex(0x24141a), hex(0x704048), clamp(ridge * 0.95 + (rnd(x, y, seed + 1) - 0.5) * 0.14));
    o.h = 0.1 + ridge * 0.85;
    if (ridge < 0.15) o.ao = 0.5;
    if (vnoise(x, y, 4, 9, seed + 7) > 0.82) {
      o.r *= 1.18;
      o.g *= 0.96;
      o.b *= 0.9;
    }
    o.ro = 0.95;
  });
  t.bump = 1.6;
}

function ringTop(t, seed, pal, barkFn) {
  const rc = hex(pal.ring[0]);
  const rl = hex(pal.ring[1]);
  const rd = hex(pal.ringDark);
  paintPixels(t, (x, y, o) => {
    const dx = x + 0.5 - 16;
    const dy = y + 0.5 - 16;
    const sq = Math.pow(Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dy), 4), 0.25);
    if (sq > 13.8) {
      barkFn(o, x, y, seed + 5);
      o.h = Math.max(0.35, o.h * 0.8);
      return;
    }
    const r = Math.sqrt(dx * dx + dy * dy);
    const warp = vnoise(x, y, 3, 3, seed + 2) * 2.4 + vnoise(x, y, 6, 6, seed + 3) * 0.7;
    const ring = Math.sin((r + warp) * (Math.PI * 2 / 3.3)) * 0.5 + 0.5;
    const n = fbm(x, y, 6, 6, 3, seed + 8);
    const base = clamp(0.35 + ring * 0.5 + n * 0.25);
    setMix(o, rd, rc, base);
    if (base > 0.82) {
      o.r = lerp(o.r, rl[0], (base - 0.82) * 4);
      o.g = lerp(o.g, rl[1], (base - 0.82) * 4);
      o.b = lerp(o.b, rl[2], (base - 0.82) * 4);
    }
    o.h = 0.45 + ring * 0.25;
    if (sq > 12.2) {
      o.r *= 0.65;
      o.g *= 0.62;
      o.b *= 0.58;
    }
    if (r < 1.8) {
      o.r *= 0.7;
      o.g *= 0.62;
      o.b *= 0.52;
    }
    o.ro = 0.88;
  });
  t.bump = 0.9;
}

/** Kabuk piksel fonksiyonu (üst dokunun dış çerçevesi için): yan boyayıcının tek pikseli. */
function barkPx(kind) {
  return (o, x, y, seed) => {
    const tmp = { r: 0, g: 0, b: 0, a: 1, h: 0.5, ro: 0.85, e: 0, ao: 1, tm: 1 };
    const pal = WOODS[kind];
    const dark = hex(pal.bark[0]);
    const light = hex(pal.bark[1]);
    const r = vnoise(x, y, 6, 3, seed) * 0.7 + vnoise(x, y, 12, 6, seed + 9) * 0.3;
    setMix(tmp, dark, light, clamp(r));
    o.r = tmp.r;
    o.g = tmp.g;
    o.b = tmp.b;
    o.h = 0.3 + r * 0.4;
    o.ro = 0.9;
  };
}

/* ================================================================================================
 * MANGROV KÖKÜ (kesik küp; dolaşık kök ağı)
 * ============================================================================================== */
function paintMangroveRoots(t, seed) {
  paintPixels(t, (x, y, o) => {
    worley(x, y, 4, 4, seed, 0.95);
    const edge = W.f2 - W.f1;
    const warp = vnoise(x, y, 6, 6, seed + 3) * 0.9;
    if (edge + warp * 0.6 < 2.9) {
      const k = clamp(0.25 + (1 - edge / 3) * 0.5 + (vnoise(x, y, 8, 8, seed + 4) - 0.5) * 0.35);
      setMix(o, hex(0x2a181a), hex(0x7a4a4a), k);
      if (vnoise(x, y, 3, 14, seed + 9) > 0.78) {
        o.r *= 1.2;
        o.g *= 1.05;
        o.b *= 0.95;
      }
      o.h = 0.55 + (1 - edge / 3) * 0.4;
      o.ro = 0.92;
      o.a = 1;
      o.tm = 0;
      return;
    }
    // gövde gölgesi: arka plan kökleri
    worley(x + 5, y + 3, 3, 3, seed + 77, 0.9);
    if (W.f2 - W.f1 < 1.7) {
      setMix(o, hex(0x1a0e10), hex(0x4a2c2e), W.id * 0.7);
      o.h = 0.3;
      o.ao = 0.6;
      o.tm = 0;
      o.a = 1;
      return;
    }
    o.a = 0;
  });
  t.bump = 1.4;
}

/* ================================================================================================
 * MANTAR BLOKLARI
 * ============================================================================================== */
function paintMushStemSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const fib = vnoise(x, y, 14, 3, seed) * 0.6 + vnoise(x, y, 28, 5, seed + 3) * 0.4;
    setMix(o, hex(0xc8bca0), hex(0xf4ecd8), clamp(0.35 + fib * 0.7));
    o.h = 0.45 + fib * 0.25;
    if (vnoise(x, y, 3, 10, seed + 8) > 0.8) {
      o.r *= 0.82;
      o.g *= 0.8;
      o.b *= 0.76;
    }
    o.ro = 0.7;
    o.tm = 0;
  });
  t.bump = 0.8;
}
function paintMushStemTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    const dx = x + 0.5 - 16;
    const dy = y + 0.5 - 16;
    const r = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.sin(r * 1.15 + vnoise(x, y, 3, 3, seed) * 2) * 0.5 + 0.5;
    setMix(o, hex(0xd8cbaa), hex(0xf8f0dc), clamp(0.3 + ring * 0.5 + (rnd(x, y, seed) - 0.5) * 0.15));
    o.h = 0.5 + ring * 0.15;
    o.ro = 0.7;
    o.tm = 0;
  });
  t.bump = 0.6;
}
function paintMushGills(t) {
  paintPixels(t, (x, y, o) => {
    const dx = x + 0.5 - 16;
    const dy = y + 0.5 - 16;
    const a = Math.atan2(dy, dx);
    const gill = Math.sin(a * 22 + Math.sqrt(dx * dx + dy * dy) * 0.2) * 0.5 + 0.5;
    setMix(o, hex(0xb8a888), hex(0xe8dcc0), clamp(gill * 0.9));
    o.h = 0.35 + gill * 0.4;
    o.ao = 0.7 + gill * 0.3;
    o.ro = 0.8;
    o.tm = 0;
  });
}
function capTile(t, seed, base, hi, spot, spotGlow) {
  const b0 = hex(base[0]);
  const b1 = hex(base[1]);
  const sp = hex(spot);
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 3, seed);
    const fine = vnoise(x, y, 18, 18, seed + 5);
    setMix(o, b0, b1, clamp(0.3 + n * 0.7 + (fine - 0.5) * 0.18));
    o.h = 0.5 + n * 0.3;
    o.ro = 0.45;
    o.tm = 0;
    // beneklar (döşenebilir, worley hücre merkezli)
    worley(x, y, 4, 4, seed + 21, 0.8);
    const sr = 2.1 + W.id * 1.6;
    if (W.id > 0.35 && W.f1 < sr) {
      const k = smooth(sr, sr - 0.9, W.f1);
      o.r = lerp(o.r, sp[0], k);
      o.g = lerp(o.g, sp[1], k);
      o.b = lerp(o.b, sp[2], k);
      o.h = 0.62 + k * 0.25;
      o.e = spotGlow * k;
    }
    // parlak ton (üst yüz için hafif)
    if (hi) {
      const h2 = hex(hi);
      const v = vnoise(x, y, 6, 6, seed + 31);
      if (v > 0.72) {
        o.r = lerp(o.r, h2[0], 0.35);
        o.g = lerp(o.g, h2[1], 0.35);
        o.b = lerp(o.b, h2[2], 0.35);
      }
    }
  });
  t.bump = 0.9;
}

/* ================================================================================================
 * ARAZİ BLOKLARI: paketli buz, kül, volkanik cam, magma, kalsit, sarkıt taşı, miselyum, çiçekli yosun
 * ============================================================================================== */
function paintPackedIce(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 3, 3, 4, seed);
    const swirl = vnoise(x + vnoise(x, y, 3, 3, seed + 1) * 6, y, 5, 5, seed + 2);
    setMix(o, hex(0x7ab4e8), hex(0xd6efff), clamp(0.3 + n * 0.7 + (swirl - 0.5) * 0.35));
    o.h = 0.5 + n * 0.25;
    // çatlak ağı (worley kenarları)
    worley(x, y, 4, 4, seed + 3, 0.9);
    const e = W.f2 - W.f1;
    if (e < 0.9) {
      o.r = lerp(o.r, 0.9, 0.4);
      o.g = lerp(o.g, 0.97, 0.4);
      o.b = 1;
      o.h = 0.25;
    }
    if (rnd(x, y, seed + 9) > 0.992) {
      o.r = 1;
      o.g = 1;
      o.b = 1;
    }
    o.ro = 0.25;
    o.tm = 0;
  });
  t.bump = 0.8;
}

function paintAsh(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 5, 5, 4, seed);
    const f = vnoise(x, y, 16, 16, seed + 4);
    const k = clamp(0.25 + n * 0.6 + (f - 0.5) * 0.3);
    o.r = 0.2 + k * 0.38;
    o.g = 0.2 + k * 0.37;
    o.b = 0.21 + k * 0.36;
    o.h = 0.4 + n * 0.35;
    if (rnd(x, y, seed + 2) > 0.94) {
      o.r *= 0.45;
      o.g *= 0.45;
      o.b *= 0.45;
    }
    if (rnd(x, y, seed + 3) > 0.985) {
      o.r = 0.75;
      o.g = 0.32;
      o.b = 0.14;
      o.e = 0.35;
    }
    o.ro = 1;
    o.tm = 0;
  });
  t.bump = 0.9;
}

function paintVolcanicGlass(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 3, 3, 3, seed);
    const streak = vnoise(x + y * 0.6, y, 4, 9, seed + 2);
    const k = clamp(n * 0.7 + streak * 0.5);
    o.r = 0.06 + k * 0.1;
    o.g = 0.05 + k * 0.07;
    o.b = 0.1 + k * 0.17;
    o.h = 0.55 + n * 0.1;
    // mor-mavi yansıma çizgileri
    const sh = Math.sin((x + y) * 0.55 + n * 5) * 0.5 + 0.5;
    if (sh > 0.88) {
      o.r += 0.18;
      o.g += 0.1;
      o.b += 0.34;
      o.h = 0.7;
    }
    worley(x, y, 3, 3, seed + 6, 0.9);
    if (W.f2 - W.f1 < 0.7) {
      o.r *= 0.55;
      o.g *= 0.55;
      o.b *= 0.6;
      o.h = 0.2;
    }
    o.ro = 0.12;
    o.tm = 0;
  });
  t.bump = 0.8;
}

function paintMagmaRock(t, seed) {
  paintPixels(t, (x, y, o) => {
    worley(x, y, 4, 4, seed, 0.95);
    const e = W.f2 - W.f1;
    const n = fbm(x, y, 4, 4, 3, seed + 5);
    if (e < 1.35 + n * 0.6) {
      const g = clamp(1 - e / 1.9);
      o.r = 0.95;
      o.g = 0.32 + g * 0.5;
      o.b = 0.05 + g * 0.18;
      o.e = 0.6 + g * 0.4;
      o.h = 0.2;
      o.ro = 0.4;
      o.tm = 0;
      return;
    }
    const k = clamp(0.2 + n * 0.5 + W.id * 0.2);
    o.r = 0.12 + k * 0.17;
    o.g = 0.1 + k * 0.12;
    o.b = 0.1 + k * 0.1;
    o.h = 0.6 + W.id * 0.3;
    // kor lekeleri
    if (e < 2.2) o.e = (2.2 - e) * 0.12;
    o.ro = 0.9;
    o.tm = 0;
  });
  t.bump = 1.5;
}

function paintCalcite(t, seed) {
  paintPixels(t, (x, y, o) => {
    worley(x, y, 4, 4, seed, 0.9);
    const id = W.id;
    const e = W.f2 - W.f1;
    const n = fbm(x, y, 3, 3, 3, seed + 4);
    const k = clamp(0.5 + id * 0.35 + n * 0.2);
    o.r = 0.8 + k * 0.18;
    o.g = 0.82 + k * 0.16;
    o.b = 0.86 + k * 0.13;
    o.h = 0.45 + id * 0.4;
    if (e < 0.8) {
      o.r *= 0.82;
      o.g *= 0.84;
      o.b *= 0.9;
      o.h = 0.2;
    }
    if (rnd(x, y, seed + 7) > 0.975) {
      o.r = 1;
      o.g = 1;
      o.b = 1;
      o.e = 0.35;
    }
    o.ro = 0.35;
    o.tm = 0;
  });
  t.bump = 1.0;
}

function paintDripstone(t, seed) {
  // gri-bej kaya: çatlak ağı (worley) + dikey damla çizgileri + kireç birikintisi (odun gibi görünmesin diye ışık/çatlak ağırlıklı)
  paintPixels(t, (x, y, o) => {
    worley(x, y, 5, 5, seed, 0.9);
    const id = W.id;
    const edge = W.f2 - W.f1;
    const streak = vnoise(x, y, 14, 3, seed + 3) * 0.6 + vnoise(x, y, 7, 5, seed + 5) * 0.4;
    const n = fbm(x, y, 4, 4, 3, seed + 6);
    setMix(o, hex(0x4e4640), hex(0x9c9185), clamp(0.28 + id * 0.3 + streak * 0.28 + n * 0.22));
    o.h = 0.35 + id * 0.25 + streak * 0.3;
    if (edge < 0.7) {
      o.r *= 0.66;
      o.g *= 0.66;
      o.b *= 0.68;
      o.h = 0.15;
      o.ao = 0.7;
    }
    // sarkıt akıntısı: ince açık dikey çizgiler (kireç)
    if (vnoise(x, y, 3, 20, seed + 11) > 0.8) {
      o.r = lerp(o.r, 0.86, 0.38);
      o.g = lerp(o.g, 0.82, 0.38);
      o.b = lerp(o.b, 0.76, 0.38);
      o.h += 0.12;
    }
    if (rnd(x, y, seed + 13) > 0.975) {
      o.r = 0.9;
      o.g = 0.88;
      o.b = 0.82;
    }
    o.ro = 0.88;
    o.tm = 0;
  });
  t.bump = 1.3;
}

function paintMyceliumTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 4, seed);
    worley(x, y, 6, 6, seed + 3, 0.9);
    const web = W.f2 - W.f1 < 1.1 ? 1 : 0;
    setMix(o, hex(0x5a4a68), hex(0x9a86a8), clamp(0.2 + n * 0.8));
    o.h = 0.4 + n * 0.4;
    if (web) {
      o.r = lerp(o.r, 0.84, 0.5);
      o.g = lerp(o.g, 0.78, 0.5);
      o.b = lerp(o.b, 0.9, 0.5);
      o.h = 0.7;
    }
    if (rnd(x, y, seed + 2) > 0.97) {
      o.r = 0.78;
      o.g = 0.5;
      o.b = 0.95;
      o.e = 0.3;
    }
    o.ro = 0.95;
    o.tm = 0;
  });
  t.bump = 1.0;
}
function paintMyceliumSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const dn = fbm(x, y, 4, 4, 4, seed + 1);
    // toprak gövde
    setMix(o, hex(0x4a3524), hex(0x7a5636), clamp(0.2 + dn * 0.7));
    o.h = 0.4 + dn * 0.3;
    o.ro = 1;
    o.tm = 0;
    // üst saçak (miselyum)
    const fringe = 5 + Math.floor(vnoise(x, 0, 8, 1, seed + 8) * 5);
    if (y < fringe) {
      const n = fbm(x, y, 4, 4, 3, seed);
      setMix(o, hex(0x5a4a68), hex(0x9a86a8), clamp(0.2 + n * 0.8));
      o.h = 0.6;
      if (y === fringe - 1) {
        o.r *= 0.82;
        o.g *= 0.8;
      }
    }
  });
  t.bump = 1.0;
}

function paintFloweringMoss(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 4, seed);
    const fuzz = vnoise(x, y, 20, 20, seed + 5);
    const l = clamp(0.45 + n * 0.6 + (fuzz - 0.5) * 0.3, 0.3, 1);
    o.r = 0.2 * l + 0.1;
    o.g = 0.55 * l + 0.1;
    o.b = 0.18 * l + 0.04;
    o.h = 0.4 + n * 0.45 + fuzz * 0.15;
    o.ro = 1;
    o.tm = 0;
    const hh = ihash(x, y, seed + 13);
    if ((hh & 63) === 0) {
      const pink = (hh >>> 8) & 1;
      o.r = pink ? 0.95 : 0.98;
      o.g = pink ? 0.55 : 0.92;
      o.b = pink ? 0.75 : 0.5;
      o.h = 0.85;
      o.e = 0.1;
    }
  });
  t.bump = 1.2;
}

/* ================================================================================================
 * MERCAN
 * ============================================================================================== */
function coralBlock(t, seed, pal) {
  const c0 = hex(pal[0]);
  const c1 = hex(pal[1]);
  const c2 = hex(pal[2]);
  paintPixels(t, (x, y, o) => {
    // beyin mercanı: kıvrımlı yivler
    const warp = vnoise(x, y, 4, 4, seed + 2) * 3.5;
    const g = Math.sin((x + warp) * 0.95) * 0.5 + 0.5;
    const g2 = Math.sin((y + warp * 0.8) * 0.95 + g * 1.5) * 0.5 + 0.5;
    const ridge = clamp(g * 0.55 + g2 * 0.55);
    const n = fbm(x, y, 4, 4, 3, seed);
    setMix(o, c0, c1, clamp(ridge * 0.9 + n * 0.3 - 0.1));
    if (ridge > 0.82) {
      o.r = lerp(o.r, c2[0], 0.7);
      o.g = lerp(o.g, c2[1], 0.7);
      o.b = lerp(o.b, c2[2], 0.7);
    }
    o.h = 0.25 + ridge * 0.7;
    o.ao = 0.7 + ridge * 0.3;
    // gözenek noktaları
    worley(x, y, 5, 5, seed + 7, 0.9);
    if (W.f1 < 1.0) {
      o.r *= 0.55;
      o.g *= 0.55;
      o.b *= 0.6;
      o.h = 0.15;
    }
    o.ro = 0.75;
    o.tm = 0;
  });
  t.bump = 1.5;
}

/* ------------------------------------------------------------------------------------------------
 * Kayıt
 * ---------------------------------------------------------------------------------------------- */
export const BIOME_PAINTERS = Object.freeze({
  ...BIOME_PLANT_PAINTERS,
  yaprak_sonbahar_turuncu: (t, s) => paintAutumn(t, s, 'turuncu'),
  yaprak_sonbahar_kırmızı: (t, s) => paintAutumn(t, s, 'kırmızı'),
  yaprak_sonbahar_sarı: (t, s) => paintAutumn(t, s, 'sarı'),
  kütük_kiraz_üst: (t, s) => ringTop(t, s, WOODS.kiraz, barkPx('kiraz')),
  kütük_kiraz_yan: paintCherryBark,
  yaprak_kiraz: paintCherryLeaves,
  tahta_kiraz: (t, s) => paintPlanks(t, s, 'kiraz'),
  kütük_cangıl_üst: (t, s) => ringTop(t, s, WOODS.cangıl, barkPx('cangıl')),
  kütük_cangıl_yan: paintJungleBark,
  yaprak_cangıl: paintJungleLeaves,
  tahta_cangıl: (t, s) => paintPlanks(t, s, 'cangıl'),
  kütük_mangrov_üst: (t, s) => ringTop(t, s, WOODS.mangrov, barkPx('mangrov')),
  kütük_mangrov_yan: paintMangroveBark,
  yaprak_mangrov: paintMangroveLeaves,
  mangrov_kök: paintMangroveRoots,
  tahta_mangrov: (t, s) => paintPlanks(t, s, 'mangrov'),
  tahta_bambu: (t, s) => paintPlanks(t, s, 'bambu'),
  yaprak_karlı_çam: paintSnowPineLeaves,
  mantar_gövde_üst: paintMushStemTop,
  mantar_gövde_yan: paintMushStemSide,
  mantar_şapka_kırmızı: (t, s) => capTile(t, s, [0x9a1418, 0xe0342c], 0xff8a6a, 0xfff4ea, 0),
  mantar_alt: paintMushGills,
  mantar_şapka_mor: (t, s) => capTile(t, s, [0x4a1a78, 0x9a52d8], 0xd890ff, 0xaef4ff, 0.8),
  paketli_buz: paintPackedIce,
  kül: paintAsh,
  volkanik_cam: paintVolcanicGlass,
  magma_taşı: paintMagmaRock,
  mercan_pembe: (t, s) => coralBlock(t, s, [0xb8346a, 0xf06a9c, 0xffc0d8]),
  mercan_mor: (t, s) => coralBlock(t, s, [0x5a2a98, 0x9a5ae0, 0xd8b8ff]),
  mercan_sarı: (t, s) => coralBlock(t, s, [0xc88a10, 0xf6c42a, 0xfff08a]),
  sarkıt_taşı: paintDripstone,
  kalsit: paintCalcite,
  miselyum_üst: paintMyceliumTop,
  miselyum_yan: paintMyceliumSide,
  çiçekli_yosun: paintFloweringMoss,
});

