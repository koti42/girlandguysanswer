/*
 * KEŞİF render — ağaç (kütük/tahta/yaprak) ve bitki dokuları.
 * Biyom tonu alan (yaprak, ot, sarmaşık, yosun) dokular nötr açık gri/yeşilimsi boyanır; ton maskesi (tm) ile
 * ton almaması gereken parçalar (meyve, çiçek) ayrılır. Sprite dokuları alfa=0 zeminle başlar.
 */
import {
  N, rnd, ihash, vnoise, fbm, worley, W, hex, mixc, clamp, lerp, smooth, paintPixels, setMix, put, over, shade, setH,
  setE, setRo, setTm, disc, ellipse, ix, setSpriteClip,
} from './atlasKit.js';

export const WOODS = {
  meşe: {
    bark: [0x33241a, 0x70533a], ring: [0xb98f56, 0xd9b278], ringDark: 0x8a6538, planks: [0xa07a45, 0xc29a5e],
  },
  huş: {
    bark: [0xcfc9b8, 0xf0ece0], ring: [0xdcc88f, 0xf0e2b0], ringDark: 0xb09a62, planks: [0xcdb987, 0xe6d6a2],
  },
  çam: {
    bark: [0x4a2d20, 0x8a5a3c], ring: [0xc08650, 0xe0a870], ringDark: 0x8a5a30, planks: [0xb27a44, 0xd09a5c],
  },
  akasya: {
    bark: [0x4e4238, 0x8d7a68], ring: [0xd88e4e, 0xf0b070], ringDark: 0xa6602e, planks: [0xb85c34, 0xd77c4c],
  },
};

/* ------------------------------------------------------------------------------------------------
 * Kütük kabuğu (yan) ve halkalar (üst)
 * ---------------------------------------------------------------------------------------------- */
function barkPixel(o, x, y, seed, kind, pal) {
  const dark = hex(pal.bark[0]);
  const light = hex(pal.bark[1]);
  if (kind === 'huş') {
    const n = fbm(x, y, 3, 3, 3, seed);
    setMix(o, dark, light, clamp(0.45 + n * 0.9));
    o.h = 0.5 + n * 0.2;
    const peel = vnoise(x, y, 3, 12, seed + 4);
    if (peel > 0.72) {
      const k = smooth(0.72, 0.8, peel);
      o.r = lerp(o.r, 0.12, k * 0.92);
      o.g = lerp(o.g, 0.11, k * 0.92);
      o.b = lerp(o.b, 0.1, k * 0.92);
      o.h = 0.25;
    } else if (peel > 0.62) {
      o.r *= 0.82;
      o.g *= 0.82;
      o.b *= 0.8;
    }
    const fine = vnoise(x, y, 4, 24, seed + 8);
    if (fine > 0.84) {
      o.r *= 0.7;
      o.g *= 0.7;
      o.b *= 0.7;
    }
    o.ro = 0.8;
    return;
  }
  if (kind === 'çam') {
    worley(x, y, 3, 6, seed, 0.7);
    const edge = W.f2 - W.f1;
    const plate = clamp(edge / 3);
    const id = W.id;
    setMix(o, dark, light, clamp(0.25 + id * 0.55 + plate * 0.25));
    o.h = 0.2 + plate * 0.7;
    if (edge < 1.1) {
      o.r *= 0.42;
      o.g *= 0.4;
      o.b *= 0.4;
      o.h = 0.08;
      o.ao = 0.55;
    }
    const ridge = vnoise(x, y, 12, 4, seed + 3);
    o.r *= 0.9 + ridge * 0.2;
    o.g *= 0.9 + ridge * 0.2;
    o.b *= 0.9 + ridge * 0.2;
    o.ro = 0.95;
    return;
  }
  if (kind === 'akasya') {
    const d = vnoise(x + y, 0, 8, 1, seed) * 0.7 + vnoise(x + y * 2, y, 6, 4, seed + 2) * 0.3;
    const ridge = smooth(0.25, 0.75, d);
    setMix(o, dark, light, clamp(Math.pow(ridge, 1.6) * 1.05 + (rnd(x, y, seed + 1) - 0.5) * 0.12));
    o.h = 0.1 + ridge * 0.8;
    if (ridge < 0.2) {
      o.r *= 0.7;
      o.g *= 0.7;
      o.b *= 0.7;
      o.ao = 0.55;
    }
    if (vnoise(x, y, 5, 5, seed + 6) > 0.68) {
      o.r *= 1.12;
      o.g *= 1.0;
      o.b *= 0.9;
    }
    o.ro = 0.95;
    return;
  }
  // meşe: derin boyuna yarıklar
  const warp = vnoise(x, y, 2, 4, seed + 1) * 4;
  const r = vnoise(x + warp, y, 8, 3, seed) * 0.75 + vnoise(x + warp, y, 16, 6, seed + 9) * 0.25;
  const ridge = smooth(0.22, 0.7, r);
  setMix(o, dark, light, clamp(ridge * 0.95 + (rnd(x, y, seed + 1) - 0.5) * 0.12));
  o.h = 0.1 + ridge * 0.8;
  if (ridge < 0.1) o.ao = 0.55;
  o.ro = 0.95;
}

export function paintLogSide(t, seed, kind) {
  const pal = WOODS[kind];
  paintPixels(t, (x, y, o) => barkPixel(o, x, y, seed, kind, pal));
  t.bump = 1.5;
}

export function paintLogTop(t, seed, kind) {
  const pal = WOODS[kind];
  const rc = hex(pal.ring[0]);
  const rl = hex(pal.ring[1]);
  const rd = hex(pal.ringDark);
  paintPixels(t, (x, y, o) => {
    const dx = x + 0.5 - 16;
    const dy = y + 0.5 - 16;
    // süperelips: yuvarlak köşeli kare gövde
    const sq = Math.pow(Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dy), 4), 0.25);
    if (sq > 13.8) {
      barkPixel(o, x, y, seed + 5, kind, pal);
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
      // kabuk altı koyu halka
      o.r *= 0.65;
      o.g *= 0.62;
      o.b *= 0.58;
    }
    // merkez özek ve radyal çatlaklar
    if (r < 1.8) {
      o.r *= 0.7;
      o.g *= 0.62;
      o.b *= 0.52;
    }
    const ang = Math.atan2(dy, dx);
    const crack = Math.sin(ang * 5 + 1.3);
    if (crack > 0.985 && r > 2 && r < 9) {
      o.r *= 0.6;
      o.g *= 0.6;
      o.b *= 0.6;
      o.h -= 0.15;
    }
    o.ro = 0.88;
  });
  t.bump = 0.9;
}

/* ------------------------------------------------------------------------------------------------
 * Tahtalar
 * ---------------------------------------------------------------------------------------------- */
export function paintPlanks(t, seed, kind) {
  const pal = WOODS[kind];
  const dark = hex(pal.planks[0]);
  const light = hex(pal.planks[1]);
  paintPixels(t, (x, y, o) => {
    const row = y >> 3;
    const yin = y & 7;
    const shift = rnd(row, 3, seed);
    const gx = x + row * 11;
    const grain = vnoise(gx, y, 3, 16, seed + row * 3) * 0.6 + vnoise(gx, y, 6, 32, seed + 5) * 0.4;
    const n = fbm(gx, y, 4, 8, 2, seed + 12);
    const tone = clamp(0.25 + shift * 0.35 + grain * 0.45 + (n - 0.5) * 0.2);
    setMix(o, dark, light, tone);
    o.h = 0.55 + grain * 0.15;
    // çizgisel lif karanlığı
    if (vnoise(gx, y, 2, 32, seed + 17) > 0.8) {
      o.r *= 0.88;
      o.g *= 0.88;
      o.b *= 0.86;
    }
    const seam = 3 + Math.floor(rnd(row, 1, seed) * 26);
    if (x === seam || x === ((seam + 1) & 31)) {
      o.r *= 0.5;
      o.g *= 0.48;
      o.b *= 0.45;
      o.h = 0.15;
      o.ao = 0.6;
    }
    if (yin === 0) {
      o.r *= 0.45;
      o.g *= 0.42;
      o.b *= 0.4;
      o.h = 0.1;
      o.ao = 0.55;
    } else if (yin === 1) {
      o.r *= 1.1;
      o.g *= 1.08;
      o.b *= 1.06;
      o.h = 0.7;
    } else if (yin === 7) {
      o.r *= 0.86;
      o.g *= 0.84;
      o.b *= 0.82;
    }
    o.ro = 0.78;
  });
  // budaklar
  for (let i = 0; i < 2; i++) {
    const h = ihash(i, 21, seed);
    const cx = 4 + (h & 15) + 4;
    const row = (h >>> 5) & 3;
    const cy = row * 8 + 4;
    ellipse(cx, cy, 2.6, 1.7, (x, y, d) => {
      const k = Math.sin(d * 7) * 0.5 + 0.5;
      shade(t, x, y, 0.62 + k * 0.28);
      setH(t, x, y, 0.4 + d * 0.3);
    });
  }
  // çiviler (her tahta ucunda)
  for (let row = 0; row < 4; row++) {
    const seam = 3 + Math.floor(rnd(row, 1, seed) * 26);
    const ys = row * 8 + 4;
    [seam - 3, seam + 4].forEach((nx) => {
      put(t, nx, ys, 0.2, 0.18, 0.17, 1);
      over(t, nx, ys - 1, 0.78, 0.76, 0.72, 0.5);
      setH(t, nx, ys, 0.85);
      setRo(t, nx, ys, 0.35);
    });
  }
  t.bump = 1.2;
}

/* ------------------------------------------------------------------------------------------------
 * Yapraklar (kesik/alfa), ton öncesi nötr
 * ---------------------------------------------------------------------------------------------- */
const LEAF = {
  meşe: { cells: 6, r: 3.5, lum: 0.0, tint: [1, 1, 1], back: 5 },
  huş: { cells: 8, r: 2.6, lum: 0.1, tint: [1.06, 1.02, 0.84], back: 7 },
  çam: { cells: 7, r: 3.0, lum: -0.14, tint: [0.88, 0.98, 1.1], back: 6 },
  akasya: { cells: 9, r: 2.2, lum: 0.08, tint: [1.04, 1.0, 0.88], back: 8 },
};

export function paintLeaves(t, seed, kind) {
  const P = LEAF[kind];
  paintPixels(t, (x, y, o) => {
    // ön katman
    worley(x, y, P.cells, P.cells, seed, 0.9);
    const f1 = W.f1;
    const id = W.id;
    const dx = x + 0.5 - W.px;
    const dy = y + 0.5 - W.py;
    const ang = id * Math.PI * 2;
    const u = dx * Math.cos(ang) + dy * Math.sin(ang);
    const v = -dx * Math.sin(ang) + dy * Math.cos(ang);
    const ru = P.r * 1.2;
    const rv = P.r * (kind === 'akasya' ? 0.55 : 0.82);
    const e = (u * u) / (ru * ru) + (v * v) / (rv * rv);
    const front = e < 1 && f1 < P.r * 1.3;
    if (front) {
      let l = 0.62 + id * 0.34 + P.lum + (1 - e) * 0.1;
      if (Math.abs(v) < 0.45 && u > -ru * 0.8) l += 0.1; // orta damar
      if (e > 0.8) l -= 0.1;
      o.r = l * P.tint[0];
      o.g = l * P.tint[1];
      o.b = l * P.tint[2];
      o.h = 0.7 + (1 - e) * 0.2;
      o.ro = 0.8;
      o.a = 1;
      o.tm = 1;
      if (kind === 'çam') {
        // iğne ışınları
        const a2 = Math.atan2(dy, dx) * 9 + id * 20;
        if (Math.sin(a2) > 0.6) {
          o.r *= 0.82;
          o.g *= 0.86;
        }
      }
      return;
    }
    // arka katman
    worley(x + 3, y + 2, P.back, P.back, seed + 71, 0.9);
    const f2 = W.f1;
    const id2 = W.id;
    if (f2 < P.r * (kind === 'huş' ? 0.92 : 1.05)) {
      const l = 0.28 + id2 * 0.22 + P.lum * 0.6;
      o.r = l * P.tint[0];
      o.g = l * P.tint[1];
      o.b = l * P.tint[2];
      o.h = 0.35;
      o.ao = 0.7;
      o.ro = 0.9;
      o.a = 1;
      o.tm = 1;
      return;
    }
    o.a = 0;
  });
  t.bump = 1.0;
}

/* ------------------------------------------------------------------------------------------------
 * Sprite yardımcıları ve bitkiler
 * ---------------------------------------------------------------------------------------------- */
function clearSprite(t) {
  setSpriteClip(true); // paintTileByName boyama bitince kapatır: taşan yazımlar karşı kenara sarmaz
  for (let i = 0; i < N * N; i++) {
    t.c[i * 4 + 3] = 0;
    t.h[i] = 0.5;
    t.ro[i] = 0.85;
    t.tm[i] = 1;
  }
}

/** Yay şeklinde incelen sap/bıçak. colFn(s, side) → [r,g,b]. */
function blade(t, x0, y0, x1, y1, bend, w0, w1, colFn, hAmt = 0.4) {
  const steps = 28;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const off = Math.sin(Math.PI * s) * bend;
    const cx = x0 + dx * s + nx * off;
    const cy = y0 + dy * s + ny * off;
    const w = lerp(w0, w1, s);
    disc(cx, cy, Math.max(0.55, w), (x, y, d, ox) => {
      const c = colFn(s, ox);
      put(t, x, y, c[0], c[1], c[2], 1);
      setH(t, x, y, 0.6 + hAmt * (1 - d) * 0.5);
      setTm(t, x, y, 1);
    });
  }
}

export function paintTallGrass(t, seed) {
  clearSprite(t);
  const count = 11;
  for (let i = 0; i < count; i++) {
    const h = ihash(i, 2, seed);
    const x0 = 2 + (h % 28);
    const topY = 5 + ((h >>> 8) % 14);
    const lean = ((((h >>> 16) & 255) / 255) - 0.5) * 10;
    const tone = 0.62 + (((h >>> 4) & 15) / 15) * 0.3;
    blade(t, x0, 31.5, x0 + lean, topY, lean * 0.25 + ((h & 1) ? 1.5 : -1.5), 1.35, 0.4, (s, side) => {
      const l = tone * (0.72 + s * 0.34 + side * 0.06);
      return [l * 1.02, l, l * 0.86];
    }, 0.5);
  }
  // kök gölgesi
  for (let x = 0; x < N; x++) {
    for (let y = 29; y < N; y++) {
      const i = ix(x, y) * 4;
      if (t.c[i + 3] > 0) shade(t, x, y, 0.8);
    }
  }
  t.bump = 0.8;
}

export function paintPoppy(t, seed, yellow) {
  clearSprite(t);
  const stem = (s) => [0.22 + s * 0.06, 0.48 + s * 0.08, 0.17];
  blade(t, 16, 31.5, 15.5, 14, 1.4, 0.95, 0.7, (s, side) => {
    const c = stem(s);
    return [c[0] + side * 0.03, c[1] + side * 0.05, c[2]];
  });
  blade(t, 16, 27, 8, 20.5, -2.5, 1.5, 0.25, (s) => [0.2 + s * 0.08, 0.5 + s * 0.12, 0.16]);
  blade(t, 16, 24, 24, 19.5, 2.5, 1.4, 0.25, (s) => [0.22 + s * 0.08, 0.52 + s * 0.1, 0.17]);
  const cx = 15.5;
  const cy = 11;
  const petalCol = yellow ? [hex(0xffec7a), hex(0xf6c81e), hex(0xd89a10)] : [hex(0xff6a4a), hex(0xd62a2a), hex(0x8e1214)];
  const n = yellow ? 9 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n + 0.3;
    const pr = yellow ? 3.3 : 3.1;
    const px = cx + Math.cos(a) * pr;
    const py = cy + Math.sin(a) * pr;
    ellipse(px, py, yellow ? 2.0 : 3.1, yellow ? 1.3 : 3.1, (x, y, d) => {
      const dxy = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const k = clamp(dxy / 6.4);
      const c = k < 0.5 ? petalCol[2] : petalCol[1];
      const m = k < 0.5 ? mixc(petalCol[2], petalCol[1], k * 2) : mixc(petalCol[1], petalCol[0], (k - 0.5) * 2);
      const sh = 0.82 + (1 - d) * 0.25;
      put(t, x, y, (c === null ? m : m)[0] * sh, m[1] * sh, m[2] * sh, 1);
      setH(t, x, y, 0.7 + (1 - d) * 0.15);
      setTm(t, x, y, 0);
      setRo(t, x, y, 0.55);
    });
  }
  disc(cx, cy, yellow ? 2.3 : 1.9, (x, y) => {
    const c = yellow ? [0.88, 0.5, 0.1] : [0.1, 0.07, 0.07];
    put(t, x, y, c[0], c[1], c[2], 1);
    setH(t, x, y, 0.85);
    setTm(t, x, y, 0);
  });
  if (!yellow) {
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      put(t, Math.round(cx + Math.cos(a) * 2.5), Math.round(cy + Math.sin(a) * 2.5), 0.95, 0.8, 0.25, 1);
    }
  }
  t.bump = 1.0;
}

export function paintBush(t, seed) {
  clearSprite(t);
  // gövde dalları
  blade(t, 16, 31.5, 15, 22, 1.2, 1.4, 1.0, () => [0.34, 0.24, 0.16]);
  blade(t, 16, 28, 9, 23, -1.5, 0.9, 0.5, () => [0.34, 0.24, 0.16]);
  blade(t, 16, 28, 23, 22, 1.5, 0.9, 0.5, () => [0.34, 0.24, 0.16]);
  // yaprak kümeleri
  const clusters = 26;
  for (let i = 0; i < clusters; i++) {
    const h = ihash(i, 4, seed);
    const ang = ((h & 255) / 255) * Math.PI * 2;
    const rad = Math.sqrt(((h >>> 8) & 255) / 255) * 11;
    const cx = 16 + Math.cos(ang) * rad * 1.05;
    const cy = 18 + Math.sin(ang) * rad * 0.62;
    if (cy > 29.5) continue;
    const l = 0.5 + (((h >>> 16) & 255) / 255) * 0.42;
    const dir = ((h >>> 24) & 255) / 255 * Math.PI;
    ellipse(cx, cy, 3.5, 2.2, (x, y, d, nx, ny) => {
      const u = nx * Math.cos(dir) + ny * Math.sin(dir);
      const sh = l * (0.82 + (1 - d) * 0.22 + (Math.abs(ny) < 0.12 ? 0.12 : 0));
      put(t, x, y, sh * 1.02, sh, sh * 0.88, 1);
      setH(t, x, y, 0.55 + (1 - d) * 0.3 + u * 0.02);
      setTm(t, x, y, 1);
    });
  }
  // meyveler (ton almaz)
  for (let i = 0; i < 7; i++) {
    const h = ihash(i, 6, seed);
    const x = 8 + (h % 16);
    const y = 12 + ((h >>> 8) % 12);
    disc(x, y, 1.9, (px, py, d, nx, ny) => {
      const k = 0.72 + (1 - d) * 0.35 - (nx + ny) * 0.12;
      put(t, px, py, 0.88 * k, 0.1 * k, 0.12 * k, 1);
      setH(t, px, py, 0.8);
      setTm(t, px, py, 0);
      setRo(t, px, py, 0.25);
    });
    put(t, x - 1, y - 1, 1, 0.8, 0.8, 1);
    setTm(t, x - 1, y - 1, 0);
    put(t, x, y - 2, 0.3, 0.55, 0.2, 1);
    setTm(t, x, y - 2, 0);
  }
  t.bump = 1.0;
}

export function paintVine(t, seed) {
  clearSprite(t);
  for (let k = 0; k < 2; k++) {
    const x0 = 9 + k * 14;
    // dalgalı gövde
    let px = x0;
    for (let y = 31; y >= 0; y--) {
      const x = x0 + Math.sin((y / 31) * Math.PI * 2.4 + k * 2) * 2.2;
      px = x;
      disc(x, y + 0.5, 0.95, (xx, yy) => {
        put(t, xx, yy, 0.3, 0.27, 0.15, 1);
        setH(t, xx, yy, 0.62);
        setTm(t, xx, yy, 0.4);
      });
    }
    // yapraklar
    for (let i = 0; i < 6; i++) {
      const y = 3 + i * 5 + k * 2;
      const side = (i + k) % 2 ? 1 : -1;
      const x = x0 + Math.sin((y / 31) * Math.PI * 2.4 + k * 2) * 2.2 + side * 3.2;
      ellipse(x, y + 1, 3.3, 2.1, (xx, yy, d, nx, ny) => {
        const l = 0.62 + (rnd(i, k, seed) * 0.3) + (1 - d) * 0.12 + (Math.abs(ny) < 0.1 ? 0.08 : 0);
        put(t, xx, yy, l, l * 1.0, l * 0.84, 1);
        setH(t, xx, yy, 0.55 + (1 - d) * 0.25);
        setTm(t, xx, yy, 1);
      });
    }
    void px;
  }
  t.bump = 0.9;
}

export function paintMushroom(t, seed) {
  clearSprite(t);
  const mush = (cx, base, capR, capH, stemH, hueA, hueB) => {
    // sap
    for (let y = base - stemH; y <= base; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        const k = x === cx - 1 ? 0.85 : x === cx + 1 ? 0.7 : 1;
        put(t, x, y, 0.78 * k, 0.84 * k, 0.88 * k, 1);
        setH(t, x, y, 0.6);
        setE(t, x, y, 0.15);
        setTm(t, x, y, 0);
      }
    }
    // şapka
    ellipse(cx + 0.5, base - stemH, capR, capH, (x, y, d, nx, ny) => {
      if (ny > 0.25) return;
      const k = 0.7 + (1 - d) * 0.45 - nx * 0.1;
      const c = mixc(hueB, hueA, clamp(1 - d + ny * -0.3));
      put(t, x, y, c[0] * k, c[1] * k, c[2] * k, 1);
      setH(t, x, y, 0.6 + (1 - d) * 0.3);
      setE(t, x, y, 0.65 + (1 - d) * 0.3);
      setRo(t, x, y, 0.35);
      setTm(t, x, y, 0);
    });
    // benekler
    for (let i = 0; i < 4; i++) {
      const hh = ihash(i, cx, seed);
      const bx = Math.round(cx + ((hh & 7) - 3.5) * (capR / 4.2));
      const by = Math.round(base - stemH - 1 - ((hh >>> 4) & 3) * (capH / 4));
      put(t, bx, by, 0.85, 1, 1, 1);
      setE(t, bx, by, 1);
    }
  };
  mush(11, 30, 6.5, 5, 7, hex(0x7ee8ff), hex(0x3a7be0));
  mush(21, 31, 4.6, 3.6, 5, hex(0xa8f4ff), hex(0x5a9af0));
  // taban halesi
  for (let x = 4; x < 28; x++) {
    over(t, x, 31, 0.3, 0.7, 0.9, 0.0);
  }
  t.bump = 0.9;
}

export function paintMoss(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 4, seed);
    const fuzz = vnoise(x, y, 20, 20, seed + 5);
    const l = clamp(0.5 + n * 0.55 + (fuzz - 0.5) * 0.3, 0.35, 1);
    o.r = l * 0.98;
    o.g = l;
    o.b = l * 0.8;
    o.h = 0.4 + n * 0.45 + fuzz * 0.15;
    o.ro = 1;
    o.tm = 1;
    if (rnd(x, y, seed + 2) > 0.985) {
      o.r *= 0.6;
      o.g *= 0.6;
      o.b *= 0.5;
    }
    if (rnd(x, y, seed + 3) > 0.995) {
      o.r = 0.96;
      o.g = 0.94;
      o.b = 0.78;
      o.tm = 0;
    }
  });
  t.bump = 1.2;
}

export function paintCactusSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const rib = Math.sin(((x + 0.5) / N) * Math.PI * 2 * 4) * 0.5 + 0.5;
    const n = fbm(x, y, 3, 6, 3, seed);
    setMix(o, hex(0x1f5e2c), hex(0x4a9a48), clamp(0.2 + rib * 0.55 + n * 0.3));
    o.h = 0.35 + rib * 0.5;
    o.ao = 0.7 + rib * 0.3;
    o.ro = 0.65;
    o.tm = 0;
    // dikenler: tepe çizgilerinde seyrek 2 pikselli çizgiler
    const ribX = Math.round(((Math.floor(((x + 0.5) / N) * 4) + 0.5) / 4) * N);
    if (x === ribX && ((y + (x >> 2)) % 6 === 0)) {
      o.r = 0.96;
      o.g = 0.92;
      o.b = 0.7;
      o.h = 0.9;
    }
    if (x === ribX + 1 && ((y + (x >> 2)) % 6 === 1)) {
      o.r = 0.8;
      o.g = 0.78;
      o.b = 0.58;
    }
  });
  t.bump = 1.4;
}

export function paintCactusTop(t, seed, bottom) {
  paintPixels(t, (x, y, o) => {
    const dx = Math.abs(x + 0.5 - 16);
    const dy = Math.abs(y + 0.5 - 16);
    const sq = Math.max(dx, dy);
    const ring = Math.sin(sq * 1.3) * 0.5 + 0.5;
    const n = fbm(x, y, 4, 4, 3, seed);
    setMix(o, hex(0x1f5e2c), hex(0x4f9f4a), clamp(0.25 + ring * 0.45 + n * 0.3));
    o.h = 0.4 + ring * 0.3;
    o.ro = 0.65;
    o.tm = 0;
    if (!bottom && ((x + y) & 3) === 0 && (Math.abs(dx - 11) < 1.1 || Math.abs(dy - 11) < 1.1)) {
      o.r = 0.96;
      o.g = 0.92;
      o.b = 0.7;
    }
    if (sq > 13.5) {
      o.r *= 0.72;
      o.g *= 0.76;
      o.b *= 0.72;
    }
  });
  t.bump = 1.0;
}

