/*
 * KEŞİF render — yapı blokları: metal, tuğla, cilalı taş, sütun, cam, beton, kumaş, ışıklar, eşya (sandık, tezgah, ocak…).
 */
import {
  N, rnd, ihash, vnoise, fbm, worley, W, hex, mixc, clamp, lerp, smooth, paintPixels, setMix, put, over, shade, setH,
  addH, setE, maxE, setRo, disc, rect, poly, bevel, ix,
} from './atlasKit.js';
import { stonePixel } from './atlasTilesTerrain.js';

/* ------------------------------------------------------------------------------------------------
 * Metal bloklar
 * ---------------------------------------------------------------------------------------------- */
const METAL = {
  bakır: { dark: 0x8a4a26, base: 0xc8743c, light: 0xeaa070, rough: 0.34 },
  demir: { dark: 0x9a9da3, base: 0xd0d3d8, light: 0xf2f4f6, rough: 0.3 },
  altın: { dark: 0xc08e1c, base: 0xf6c640, light: 0xfff0a0, rough: 0.2 },
};

export function rivet(t, cx, cy, r, base) {
  disc(cx, cy, r, (x, y, d, nx, ny) => {
    const k = 0.7 + (1 - d) * 0.3 - (nx + ny) * 0.18;
    put(t, x, y, base[0] * k, base[1] * k, base[2] * k, 1);
    setH(t, x, y, 0.85 + (1 - d) * 0.1);
    setRo(t, x, y, 0.25);
  });
}

export function paintMetal(t, seed, kind) {
  if (kind === 'elmas') return paintDiamondBlock(t, seed);
  if (kind === 'kuantum') return paintQuantumBlock(t, seed);
  const P = METAL[kind];
  const dark = hex(P.dark);
  const base = hex(P.base);
  const light = hex(P.light);
  paintPixels(t, (x, y, o) => {
    const streak = vnoise(x, y, 2, 28, seed) * 0.6 + vnoise(x, y, 4, 40, seed + 3) * 0.4;
    const n = fbm(x, y, 3, 3, 3, seed + 6);
    const v = clamp(0.28 + streak * 0.5 + n * 0.3 + (rnd(x, y, seed + 2) - 0.5) * 0.06);
    if (v < 0.5) setMix(o, dark, base, v * 2);
    else setMix(o, base, light, (v - 0.5) * 2);
    o.h = 0.55 + streak * 0.1;
    o.ro = P.rough + streak * 0.12;
    if (kind === 'bakır') {
      const pat = vnoise(x, y, 6, 6, seed + 9);
      if (pat > 0.72) {
        const k = smooth(0.72, 0.85, pat);
        o.r = lerp(o.r, 0.26, k * 0.8);
        o.g = lerp(o.g, 0.7, k * 0.8);
        o.b = lerp(o.b, 0.6, k * 0.8);
        o.ro = lerp(o.ro, 0.8, k);
        o.h += 0.08 * k;
      }
    }
  });
  // panel yivleri
  for (let i = 0; i < N; i++) {
    for (let w = 0; w < 2; w++) {
      shade(t, 15 + w, i, 0.62);
      addH(t, 15 + w, i, -0.3);
      shade(t, i, 15 + w, 0.62);
      addH(t, i, 15 + w, -0.3);
    }
  }
  bevel(t, 2, 0.4, 0.2);
  [[4, 4], [27, 4], [4, 27], [27, 27], [11, 11], [20, 11], [11, 20], [20, 20]].forEach((p) => rivet(t, p[0] + 0.5, p[1] + 0.5, 1.4, light));
  t.bump = 1.2;
}

function paintDiamondBlock(t, seed) {
  paintPixels(t, (x, y, o) => {
    worley(x, y, 3, 3, seed, 0.75);
    const edge = W.f2 - W.f1;
    const id = W.id;
    const dx = x + 0.5 - W.px;
    const dy = y + 0.5 - W.py;
    const dir = (dx * 0.7 + dy * 0.7) / 6;
    const k = clamp(0.62 + id * 0.3 - dir * 0.3);
    const c = mixc(hex(0x2db6bf), hex(0xb9fff6), k);
    o.r = c[0];
    o.g = c[1];
    o.b = c[2];
    o.h = 0.5 + clamp(edge / 6) * 0.35 + id * 0.1;
    o.ro = 0.06;
    o.e = 0.14 + k * 0.08;
    if (edge < 1.0) {
      o.r = lerp(o.r, 1, 0.65);
      o.g = lerp(o.g, 1, 0.65);
      o.b = lerp(o.b, 1, 0.65);
      o.e = 0.35;
      o.h = 0.3;
    }
    if (rnd(x, y, seed + 7) > 0.99) {
      o.r = 1;
      o.g = 1;
      o.b = 1;
      o.e = 0.9;
    }
  });
  bevel(t, 2, 0.4, 0.22);
  t.bump = 1.2;
}

function paintQuantumBlock(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 3, seed);
    setMix(o, hex(0x120a24), hex(0x35205e), n);
    o.h = 0.5 + n * 0.2;
    o.ro = 0.3;
    const hot = vnoise(x, y, 5, 5, seed + 4);
    if (hot > 0.68) o.e = (hot - 0.68) * 0.9;
  });
  // devre izleri: 8 px ızgara, hash ile bağlanan yollar
  const cyan = [0.35, 0.95, 1];
  const mag = [0.9, 0.35, 1];
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const h = ihash(gx, gy, seed + 9);
      const col = h & 1 ? cyan : mag;
      const cx = gx * 8 + 4;
      const cy = gy * 8 + 4;
      const conns = [(h >>> 1) & 1, (h >>> 2) & 1, (h >>> 3) & 1, (h >>> 4) & 1]; // sağ,aşağı,sol,yukarı
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      let any = false;
      for (let d = 0; d < 4; d++) {
        if (!conns[d]) continue;
        any = true;
        for (let s = 0; s <= 4; s++) {
          const px = cx + dirs[d][0] * s;
          const py = cy + dirs[d][1] * s;
          put(t, px, py, col[0], col[1], col[2], 1);
          maxE(t, px, py, 0.85);
          setH(t, px, py, 0.35);
        }
      }
      if (any) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            put(t, cx + dx - 0, cy + dy - 0, 1, 1, 1, 1);
            maxE(t, cx + dx, cy + dy, 1);
            setH(t, cx + dx, cy + dy, 0.9);
          }
        }
      }
    }
  }
  bevel(t, 2, 0.4, 0.2);
  t.bump = 1.0;
}

/* ------------------------------------------------------------------------------------------------
 * Işıklar
 * ---------------------------------------------------------------------------------------------- */
export function paintLightBlock(t, seed) {
  paintPixels(t, (x, y, o) => {
    const dx = (x + 0.5 - 16) / 16;
    const dy = (y + 0.5 - 16) / 16;
    const r = Math.sqrt(dx * dx + dy * dy);
    const n = fbm(x, y, 4, 4, 3, seed);
    const g = clamp(1 - r * 0.75 + (n - 0.5) * 0.15);
    const c = mixc(hex(0xffb340), hex(0xfffbe0), g);
    o.r = c[0];
    o.g = c[1];
    o.b = c[2];
    o.e = 0.85 + g * 0.15;
    o.h = 0.45;
    o.ro = 0.4;
    // difüzör ızgarası
    if (x % 8 === 0 || y % 8 === 0) {
      o.r *= 0.85;
      o.g *= 0.8;
      o.b *= 0.62;
      o.e *= 0.8;
      o.h = 0.35;
    }
  });
  // altın çerçeve
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < 3) {
        const k = d === 2 ? 0.8 : d === 1 ? 1.0 : 0.62;
        put(t, x, y, 0.8 * k + 0.1, 0.58 * k + 0.05, 0.16 * k, 1);
        setE(t, x, y, 0.15);
        setH(t, x, y, d === 0 ? 0.6 : 0.8);
        setRo(t, x, y, 0.3);
      }
    }
  }
  t.bump = 1.0;
}

export function paintBounceTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 3, seed);
    const dx = Math.abs(x + 0.5 - 16);
    const dy = Math.abs(y + 0.5 - 16);
    const sq = Math.max(dx, dy);
    const ring = Math.sin(sq * 0.9) * 0.5 + 0.5;
    setMix(o, hex(0x1f9a4a), hex(0x68e07a), clamp(0.35 + ring * 0.4 + n * 0.25));
    o.h = 0.55 + ring * 0.2;
    o.ro = 0.35;
    o.e = 0.12;
  });
  // yukarı oklar
  const arrow = [[16, 6], [24, 15], [19, 15], [19, 24], [13, 24], [13, 15], [8, 15]];
  poly(arrow, (x, y, d) => {
    put(t, x, y, 0.92, 1, 0.9, 1);
    setE(t, x, y, 0.45);
    setH(t, x, y, d < 1 ? 0.7 : 0.85);
  });
  bevel(t, 2, 0.5, 0.25);
  t.bump = 1.2;
}

export function paintBounceBottom(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 5, 5, 3, seed);
    setMix(o, hex(0x24262c), hex(0x4a4e58), n);
    o.h = 0.5 + n * 0.2;
    o.ro = 0.5;
  });
  bevel(t, 3, 0.5, 0.25);
  t.bump = 1.0;
}

export function paintBounceSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 5, 5, 3, seed);
    setMix(o, hex(0x2c2f36), hex(0x585d68), n);
    o.h = 0.5;
    o.ro = 0.45;
  });
  // üst yeşil dudak
  rect(0, 0, N, 5, (x, y, u, v) => {
    const c = mixc(hex(0x2fb855), hex(0x6be37e), 1 - v);
    put(t, x, y, c[0], c[1], c[2], 1);
    setE(t, x, y, 0.15);
    setH(t, x, y, 0.8 - v * 0.2);
  });
  // yay sarmalı: üç tur, önde parlak/arkada koyu
  for (let x = 3; x < 29; x++) {
    const ph = ((x - 3) / 26) * Math.PI * 6;
    const yy = 16.5 + Math.sin(ph) * 5.5;
    const front = Math.cos(ph) > 0;
    for (let w = -1; w <= 1; w++) {
      const k = (front ? 1.0 : 0.55) * (0.85 + (1 - Math.abs(w)) * 0.3);
      put(t, x, Math.round(yy) + w, 0.78 * k, 0.8 * k, 0.86 * k, 1);
      setH(t, x, Math.round(yy) + w, front ? 0.85 : 0.55);
      setRo(t, x, Math.round(yy) + w, 0.2);
    }
  }
  // taban
  rect(0, 27, N, 5, (x, y) => {
    over(t, x, y, 0.12, 0.13, 0.16, 0.7);
    setH(t, x, y, 0.65);
  });
  bevel(t, 1, 0.4, 0.2);
  t.bump = 1.1;
}

/* ------------------------------------------------------------------------------------------------
 * Tuğla, cilalı taş, sütun
 * ---------------------------------------------------------------------------------------------- */
export function paintBricks(t, seed) {
  const mort = hex(0xb8b2a2);
  paintPixels(t, (x, y, o) => {
    const row = y >> 3;
    const off = (row & 1) * 8;
    const bx = ((x + off) & 31) >> 4;
    const brickId = ihash(bx, row, seed);
    const lx = ((x + off) & 15);
    const ly = y & 7;
    const inMortar = ly === 0 || lx === 0;
    const n = fbm(x, y, 8, 8, 3, seed + 3);
    if (inMortar) {
      const g = rnd(x, y, seed + 4);
      o.r = mort[0] * (0.88 + g * 0.18);
      o.g = mort[1] * (0.88 + g * 0.18);
      o.b = mort[2] * (0.88 + g * 0.18);
      o.h = 0.2;
      o.ao = 0.7;
      o.ro = 1;
      return;
    }
    const tone = (brickId & 255) / 255;
    const c = mixc(hex(0x8e3326), hex(0xc0603f), clamp(tone * 0.8 + (n - 0.5) * 0.5));
    const gr = rnd(x, y, seed + 6) - 0.5;
    o.r = c[0] * (1 + gr * 0.1);
    o.g = c[1] * (1 + gr * 0.12);
    o.b = c[2] * (1 + gr * 0.12);
    // tuğla kenarlarına yakın pah (yükseklik + hafif gölge)
    const edgeD = Math.min(lx - 1, 14 - lx, ly - 1, 6 - ly);
    o.h = 0.6 + clamp(edgeD / 2) * 0.3 + n * 0.1;
    if (edgeD === 0) {
      o.r *= 0.88;
      o.g *= 0.86;
      o.b *= 0.86;
    }
    if (rnd(x, y, seed + 8) > 0.985) {
      o.r *= 0.7;
      o.g *= 0.66;
      o.b *= 0.64;
    }
    o.ro = 0.9;
  });
  t.bump = 1.4;
}

export function paintStoneBrick(t, seed) {
  paintPixels(t, (x, y, o) => {
    const row = y >> 4;
    const off = (row & 1) * 8;
    const bx = ((x + off) & 31) >> 4;
    const id = ihash(bx, row, seed);
    const lx = ((x + off) & 15);
    const ly = y & 15;
    const edge = Math.min(lx, 15 - lx, ly, 15 - ly);
    stonePixel(o, x + bx * 7, y + row * 5, seed + (id & 7), null);
    const tone = 0.88 + ((id >>> 3) & 15) / 15 * 0.28;
    o.r *= tone;
    o.g *= tone;
    o.b *= tone;
    // yosunlu / çatlak tuğlalar
    if ((id >>> 8) % 5 === 0) {
      const mv = vnoise(x, y, 6, 6, seed + 11);
      if (mv > 0.5) {
        const k = smooth(0.5, 0.7, mv) * 0.5;
        o.r = lerp(o.r, 0.28, k);
        o.g = lerp(o.g, 0.5, k);
        o.b = lerp(o.b, 0.22, k);
      }
    }
    if (ly === 0 || lx === 0) {
      // derz
      o.r *= 0.36;
      o.g *= 0.36;
      o.b *= 0.38;
      o.h = 0.1;
      o.ao = 0.6;
    } else {
      o.h = 0.55 + clamp((edge - 1) / 2.5) * 0.35 + (o.h - 0.5) * 0.3;
      if (edge === 1) {
        o.r *= 0.9;
        o.g *= 0.9;
        o.b *= 0.9;
      }
    }
  });
  t.bump = 1.5;
}

export function paintPolished(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 2, 2, 4, seed);
    const vein = Math.abs(vnoise(x, y, 3, 3, seed + 5) - 0.5) + Math.abs(vnoise(x, y, 6, 6, seed + 6) - 0.5) * 0.4;
    setMix(o, hex(0x7c828c), hex(0xb2b8c2), clamp(0.15 + n * 0.9));
    o.h = 0.5 + n * 0.05;
    o.ro = 0.22 + n * 0.2;
    if (vein < 0.035) {
      const k = 1 - vein / 0.035;
      o.r = lerp(o.r, 0.93, k * 0.55);
      o.g = lerp(o.g, 0.95, k * 0.55);
      o.b = lerp(o.b, 0.97, k * 0.55);
    }
    const g = rnd(x, y, seed + 2) - 0.5;
    o.r += g * 0.025;
    o.g += g * 0.025;
    o.b += g * 0.025;
  });
  // iç panel: 1 piksel oluk (kenar) — döşenirken ince bir derz çizgisi
  for (let i = 0; i < N; i++) {
    [0, 31].forEach((e) => {
      shade(t, e, i, 0.72);
      shade(t, i, e, 0.72);
      addH(t, e, i, -0.2);
      addH(t, i, e, -0.2);
    });
  }
  t.bump = 0.5;
}

export function paintPillarTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    stonePixel(o, x, y, seed, { dark: hex(0x8d9096), light: hex(0xc2c5ca), warm: hex(0xb2aa9c), strata: 0.03, cracks: false });
    const dx = Math.abs(x + 0.5 - 16);
    const dy = Math.abs(y + 0.5 - 16);
    const r = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(r - 11) < 0.9 || Math.abs(r - 6) < 0.7) {
      o.r *= 0.7;
      o.g *= 0.7;
      o.b *= 0.72;
      o.h -= 0.3;
    }
  });
  bevel(t, 2, 0.5, 0.2);
  t.bump = 1.0;
}

export function paintPillarSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    stonePixel(o, x, y, seed, { dark: hex(0x8d9096), light: hex(0xc2c5ca), warm: hex(0xb2aa9c), strata: 0.02, cracks: false });
    // yivli gövde
    const fl = Math.sin(((x + 0.5) / N) * Math.PI * 2 * 4);
    const k = 0.84 + (fl * 0.5 + 0.5) * 0.28;
    o.r *= k;
    o.g *= k;
    o.b *= k;
    o.h = 0.4 + (fl * 0.5 + 0.5) * 0.45;
    // başlık ve kaide bantları
    if (y < 5 || y > 26) {
      const edge = y < 5 ? y : 31 - y;
      o.h = 0.7 + (edge === 4 || edge === 0 ? 0.0 : 0.2);
      const kk = edge === 4 ? 0.7 : edge === 0 ? 0.9 : 1.06;
      o.r = (o.r / k) * kk;
      o.g = (o.g / k) * kk;
      o.b = (o.b / k) * kk;
    }
  });
  t.bump = 1.3;
}

/* ------------------------------------------------------------------------------------------------
 * Cam, beton, kumaş
 * ---------------------------------------------------------------------------------------------- */
export function paintGlass(t, seed, colorHex) {
  const tint = colorHex === null ? hex(0xdff4ff) : hex(colorHex);
  const clear = colorHex === null;
  paintPixels(t, (x, y, o) => {
    const d = Math.min(x, N - 1 - x, y, N - 1 - y);
    const n = vnoise(x, y, 6, 6, seed);
    o.r = clear ? 0.82 + n * 0.1 : tint[0] * (0.82 + n * 0.2);
    o.g = clear ? 0.93 + n * 0.05 : tint[1] * (0.82 + n * 0.2);
    o.b = clear ? 1 : tint[2] * (0.82 + n * 0.2);
    o.a = clear ? 0.1 + n * 0.04 : 0.42 + n * 0.1;
    o.h = 0.5;
    o.ro = 0.03;
    if (d < 2) {
      const k = d === 0 ? 0.78 : 1;
      const f = clear ? [0.85, 0.94, 1] : mixc(tint, [1, 1, 1], 0.35);
      o.r = f[0] * k;
      o.g = f[1] * k;
      o.b = f[2] * k;
      o.a = d === 0 ? 0.95 : 0.8;
      o.h = d === 0 ? 0.9 : 0.7;
    } else if (d === 2) {
      o.a = Math.max(o.a, 0.32);
      o.h = 0.35;
    }
  });
  // çapraz parlama şeritleri
  for (let y = 3; y < 29; y++) {
    for (let x = 3; x < 29; x++) {
      const s = x + y;
      if ((s >= 16 && s <= 19) || (s >= 22 && s <= 23)) {
        const i = ix(x, y) * 4;
        t.c[i] = lerp(t.c[i], 1, 0.7);
        t.c[i + 1] = lerp(t.c[i + 1], 1, 0.7);
        t.c[i + 2] = lerp(t.c[i + 2], 1, 0.7);
        t.c[i + 3] = Math.max(t.c[i + 3], clear ? 0.36 : 0.62);
      }
    }
  }
  // köşe parlaması
  [[4, 4], [5, 4], [4, 5]].forEach((p) => {
    put(t, p[0], p[1], 1, 1, 1, 0.9);
  });
  t.bump = 0.4;
}

export function paintConcrete(t, seed, colorHex) {
  const base = hex(colorHex);
  paintPixels(t, (x, y, o) => {
    const mott = fbm(x, y, 3, 3, 3, seed);
    const fine = rnd(x, y, seed + 2) - 0.5;
    const k = 0.93 + mott * 0.14 + fine * 0.07;
    o.r = base[0] * k;
    o.g = base[1] * k;
    o.b = base[2] * k;
    o.h = 0.5 + mott * 0.2 + fine * 0.1;
    o.ro = 0.88;
    const r = rnd(x, y, seed + 9);
    if (r > 0.975) {
      o.r *= 0.8;
      o.g *= 0.8;
      o.b *= 0.8;
      o.h -= 0.15;
    } else if (r < 0.01) {
      o.r = lerp(o.r, 1, 0.1);
      o.g = lerp(o.g, 1, 0.1);
      o.b = lerp(o.b, 1, 0.1);
    }
  });
  t.bump = 0.6;
}

export function paintCloth(t, seed, colorHex) {
  const base = hex(colorHex);
  paintPixels(t, (x, y, o) => {
    const cx = x >> 1;
    const cy = y >> 1;
    const over = (cx + cy) & 1; // 1: yatay iplik üstte
    const lx = x & 1;
    const ly = y & 1;
    const thread = rnd(over ? cy : cx, over ? 0 : 1, seed + (over ? 3 : 5));
    const fuzz = rnd(x, y, seed + 7) - 0.5;
    let k = 0.9 + thread * 0.14 + fuzz * 0.09;
    // ipliğin yuvarlak kesiti: iplik boyunca orta parlak
    const across = over ? ly : lx;
    k *= across === 0 ? 1.07 : 0.93;
    const along = over ? lx : ly;
    k *= along === 0 ? 0.97 : 1.03;
    o.r = base[0] * k;
    o.g = base[1] * k;
    o.b = base[2] * k;
    o.h = over ? 0.72 : 0.5;
    o.ro = 1;
    o.ao = over ? 1 : 0.84;
  });
  // geniş ölçekli kırışıklık
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      shade(t, x, y, 0.96 + vnoise(x, y, 3, 3, seed + 12) * 0.08);
    }
  }
  t.bump = 0.9;
}

