/*
 * KEŞİF render — eşya ve ışık sprite'ları: meşale, fener, sandık, tezgah, ocak, kapı, yatak, kitaplık, levha.
 */
import {
  N, rnd, ihash, vnoise, fbm, hex, mixc, clamp, lerp, paintPixels, setMix, put, over, shade, setH, addH, setE,
  setRo, setTm, disc, rect, poly, bevel, frame,
} from './atlasKit.js';
import { stonePixel } from './atlasTilesTerrain.js';
import { TILE_REGIONS } from './atlasLayout.js';
import { rivet } from './atlasTilesBuild.js';

/* ------------------------------------------------------------------------------------------------
 * Meşale, fener
 * ---------------------------------------------------------------------------------------------- */
function clearSprite(t) {
  for (let i = 0; i < N * N; i++) {
    t.c[i * 4 + 3] = 0;
    t.h[i] = 0.5;
    t.ro[i] = 0.85;
    t.tm[i] = 0;
    t.ao[i] = 1;
    t.e[i] = 0;
  }
}

export function paintTorch(t, seed) {
  clearSprite(t);
  // sap (4 px): x 14..17, y 13..31
  for (let y = 13; y < N; y++) {
    for (let x = 14; x <= 17; x++) {
      const k = x === 14 ? 1.12 : x === 17 ? 0.7 : 0.95;
      const g = rnd(x, y, seed) * 0.12;
      put(t, x, y, (0.55 + g) * k, (0.38 + g) * k, (0.2 + g) * k, 1);
      setH(t, x, y, x === 14 ? 0.7 : x === 17 ? 0.5 : 0.62);
      setRo(t, x, y, 0.9);
    }
  }
  // kömürleşmiş uç
  for (let y = 13; y < 16; y++) {
    for (let x = 14; x <= 17; x++) {
      put(t, x, y, 0.16, 0.12, 0.1, 1);
    }
  }
  // alev: gözyaşı biçimi, çekirdek beyaz-sarı, kenar turuncu; yumuşak hale (alfa ile)
  const cx = 15.5;
  const cy = 9.5;
  for (let y = 0; y < 16; y++) {
    for (let x = 6; x < 26; x++) {
      const dx = (x + 0.5 - cx) / (1 + Math.max(0, (y - 2)) * 0.08);
      const dy = y + 0.5 - cy;
      // gözyaşı: üstte sivri
      const widthAt = dy < 0 ? Math.max(0, 3.4 * (1 + dy / 7.5)) : 3.4 * Math.sqrt(Math.max(0, 1 - (dy / 5.5) * (dy / 5.5)));
      const d = Math.abs(dx) / Math.max(0.01, widthAt);
      if (widthAt > 0 && d <= 1 && dy > -7.5 && dy < 5.5) {
        const k = 1 - d;
        const core = clamp(k * 1.4 - (dy + 7.5) / 26);
        const c = mixc(hex(0xff7a14), hex(0xfff2a8), core);
        put(t, x, y, c[0], c[1], c[2], 1);
        setE(t, x, y, 0.8 + core * 0.2);
        setH(t, x, y, 0.7);
      } else {
        // hale
        const rr = Math.sqrt(dx * dx + dy * dy * 0.7);
        if (rr < 8.5) {
          const k = (1 - rr / 8.5);
          const a = k * k * 0.32;
          if (a > 0.02) {
            put(t, x, y, 1, 0.55, 0.15, a);
            setE(t, x, y, 0.9 * k);
          }
        }
      }
    }
  }
  t.bump = 0.8;
}

export function paintLantern(t, seed) {
  // Yan sanat: x 10..22 (12 px) ve alt 18 satır; üst/alt kapak sanatı sol-üst 12×12 (TILE_REGIONS.fenerCap).
  paintPixels(t, (x, y, o) => {
    o.a = 1;
    const n = fbm(x, y, 4, 4, 2, seed);
    setMix(o, hex(0x22242a), hex(0x4a4d56), n);
    o.ro = 0.35;
    o.h = 0.55;
  });
  const cap = TILE_REGIONS.fenerCap;
  const cx0 = Math.round(cap[0] * N);
  const cy0 = Math.round((1 - cap[3]) * N);
  const cw = Math.round((cap[2] - cap[0]) * N);
  const ch = Math.round((cap[3] - cap[1]) * N);
  // kapak: koyu demir + halka
  rect(cx0, cy0, cw, ch, (x, y, u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy);
    const k = 0.7 + (r < 0.28 ? 0.35 : 0) - (Math.abs(r - 0.42) < 0.05 ? 0.3 : 0);
    put(t, x, y, 0.2 * k + 0.08, 0.2 * k + 0.08, 0.22 * k + 0.09, 1);
    setH(t, x, y, r < 0.28 ? 0.8 : 0.6);
  });
  // yan: cam gövde x 10..21, y (üstten) 14..31
  for (let y = 14; y < N; y++) {
    for (let x = 10; x <= 21; x++) {
      const edgeL = x === 10 || x === 21;
      const edgeT = y === 14 || y === 15;
      const edgeB = y >= 29;
      if (edgeL || edgeT || edgeB) {
        const k = edgeL ? (x === 10 ? 1.15 : 0.8) : 1;
        put(t, x, y, 0.3 * k, 0.28 * k, 0.26 * k, 1);
        setH(t, x, y, 0.85);
        setRo(t, x, y, 0.35);
        continue;
      }
      const gy = (y - 16) / 13;
      const gx = (x - 15.5) / 5.5;
      const g = clamp(1 - (gx * gx * 0.5 + (gy - 0.5) * (gy - 0.5) * 1.2));
      const c = mixc(hex(0xff9a24), hex(0xfff3b0), g);
      put(t, x, y, c[0], c[1], c[2], 1);
      setE(t, x, y, 0.8 + g * 0.2);
      setH(t, x, y, 0.4);
      setRo(t, x, y, 0.15);
      // orta çubuk
      if (x === 15 || x === 16) {
        put(t, x, y, 0.3, 0.27, 0.24, 1);
        setE(t, x, y, 0.15);
        setH(t, x, y, 0.8);
      }
    }
  }
  // alev
  for (let y = 22; y < 29; y++) {
    const w = y < 24 ? 1 : y < 27 ? 2 : 1;
    for (let x = 16 - w; x < 16 + w; x++) {
      put(t, x, y, 1, 0.97, 0.7, 1);
      setE(t, x, y, 1);
    }
  }
  t.bump = 1.0;
}

/* ------------------------------------------------------------------------------------------------
 * Eşyalar: sandık, tezgah, ocak, kapı, yatak, kitaplık, levha
 * ---------------------------------------------------------------------------------------------- */
function woodField(o, x, y, seed, dark, light, horizontal = true) {
  const gx = horizontal ? x : y;
  const gy = horizontal ? y : x;
  const grain = vnoise(gx, gy, 3, 18, seed) * 0.6 + vnoise(gx, gy, 6, 34, seed + 2) * 0.4;
  setMix(o, dark, light, clamp(0.2 + grain * 0.7 + (rnd(x, y, seed + 4) - 0.5) * 0.1));
  o.h = 0.55 + grain * 0.15;
  o.ro = 0.8;
}

export function paintChestSide(t, seed, rich) {
  const dark = rich ? hex(0x4a2a14) : hex(0x6e4826);
  const light = rich ? hex(0x7a4a24) : hex(0xa6783e);
  const metal = rich ? hex(0xf0c040) : hex(0x8c9097);
  const metalD = rich ? hex(0xa8781c) : hex(0x50545c);
  paintPixels(t, (x, y, o) => {
    // y: sanat satırı (0 üst). Kutu yüksekliği 28/32 (alttan) → üst 4 satır görünmez.
    const fromBottom = N - 1 - y;
    const lid = fromBottom >= 15;
    if (lid) {
      woodField(o, x, y, seed + 1, dark, light, true);
      // kapak eğrisi: üste doğru aydınlık
      const k = 0.88 + clamp((fromBottom - 15) / 13) * 0.2;
      o.r *= k;
      o.g *= k;
      o.b *= k;
    } else {
      woodField(o, x, y, seed + 3, dark, light, false);
      // dikey tahta aralıkları
      if (x % 8 === 3) {
        o.r *= 0.55;
        o.g *= 0.55;
        o.b *= 0.55;
        o.h = 0.2;
      }
    }
    if (fromBottom === 15 || fromBottom === 14) {
      o.r *= fromBottom === 15 ? 0.45 : 0.7;
      o.g *= fromBottom === 15 ? 0.45 : 0.7;
      o.b *= fromBottom === 15 ? 0.45 : 0.7;
      o.h = 0.2;
    }
  });
  // dikey metal şeritler ve köşeler
  [[3, 6], [25, 28]].forEach((band) => {
    for (let y = 0; y < N; y++) {
      for (let x = band[0]; x <= band[1]; x++) {
        const edge = x === band[0] || x === band[1];
        const m = edge ? metalD : metal;
        const g = rnd(x, y, seed) * 0.12;
        put(t, x, y, m[0] * (0.92 + g), m[1] * (0.92 + g), m[2] * (0.92 + g), 1);
        setH(t, x, y, edge ? 0.7 : 0.85);
        setRo(t, x, y, 0.3);
        if (rich) setE(t, x, y, 0.08);
      }
    }
  });
  // kilit plakası
  rect(13, 10, 7, 11, (x, y, u, v) => {
    const edge = u < 0.15 || u > 0.85 || v < 0.1 || v > 0.9;
    const m = edge ? metalD : metal;
    put(t, x, y, m[0], m[1], m[2], 1);
    setH(t, x, y, edge ? 0.8 : 0.9);
    setRo(t, x, y, 0.25);
    if (rich) setE(t, x, y, 0.15);
  });
  // anahtar deliği
  disc(16.5, 15, 1.4, (x, y) => {
    put(t, x, y, 0.06, 0.05, 0.05, 1);
    setH(t, x, y, 0.1);
  });
  rect(16, 16, 1, 3, (x, y) => {
    put(t, x, y, 0.06, 0.05, 0.05, 1);
  });
  if (rich) {
    // kilit üstünde mücevher
    disc(16.5, 11.5, 1.6, (x, y, d) => {
      put(t, x, y, 0.4 + (1 - d) * 0.5, 0.95, 0.9, 1);
      setE(t, x, y, 0.9);
    });
  }
  t.bump = 1.2;
}

export function paintChestTop(t, seed, rich) {
  const dark = rich ? hex(0x4a2a14) : hex(0x6e4826);
  const light = rich ? hex(0x7a4a24) : hex(0xa6783e);
  const metal = rich ? hex(0xf0c040) : hex(0x8c9097);
  const metalD = rich ? hex(0xa8781c) : hex(0x50545c);
  paintPixels(t, (x, y, o) => {
    woodField(o, x, y, seed + 1, dark, light, true);
    if (y % 8 === 0) {
      o.r *= 0.55;
      o.g *= 0.55;
      o.b *= 0.55;
      o.h = 0.2;
    }
  });
  [[3, 6], [25, 28]].forEach((band) => {
    for (let y = 0; y < N; y++) {
      for (let x = band[0]; x <= band[1]; x++) {
        const edge = x === band[0] || x === band[1];
        const m = edge ? metalD : metal;
        put(t, x, y, m[0], m[1], m[2], 1);
        setH(t, x, y, edge ? 0.7 : 0.85);
        setRo(t, x, y, 0.3);
        if (rich) setE(t, x, y, 0.08);
      }
    }
  });
  if (rich) {
    // altın süs: orta elmas
    poly([[16, 10], [22, 16], [16, 22], [10, 16]], (x, y, d) => {
      const m = d < 1 ? metalD : metal;
      put(t, x, y, m[0], m[1], m[2], 1);
      setE(t, x, y, 0.25);
      setH(t, x, y, 0.85);
    });
    disc(16, 16, 2, (x, y, d) => {
      put(t, x, y, 0.5 + (1 - d) * 0.45, 1, 0.95, 1);
      setE(t, x, y, 0.95);
    });
  }
  t.bump = 1.1;
}

export function paintWorkbenchTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    woodField(o, x, y, seed, hex(0x8c6034), hex(0xbb8a50), true);
    if (y % 8 === 0) {
      o.r *= 0.55;
      o.g *= 0.52;
      o.b *= 0.5;
      o.h = 0.2;
    }
  });
  // koyu çerçeve
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < 3) {
        const k = d === 2 ? 0.7 : 0.5;
        over(t, x, y, 0.2, 0.12, 0.07, 1 - k * 0.5);
        setH(t, x, y, d === 2 ? 0.35 : 0.75);
      }
    }
  }
  // üretim ızgarası (3×3, çelik çizgiler)
  for (let i = 0; i < 4; i++) {
    const p = 7 + i * 6;
    for (let k = 7; k <= 25; k++) {
      put(t, p, k, 0.22, 0.2, 0.2, 1);
      put(t, k, p, 0.22, 0.2, 0.2, 1);
      setH(t, p, k, 0.25);
      setH(t, k, p, 0.25);
    }
  }
  t.bump = 1.2;
}

export function paintWorkbenchSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    woodField(o, x, y, seed + 3, hex(0x8c6034), hex(0xbb8a50), y > 14);
    if (y > 14 && y % 8 === 0) {
      o.r *= 0.55;
      o.g *= 0.52;
      o.b *= 0.5;
      o.h = 0.2;
    }
  });
  // üst kuşak: koyu şerit
  rect(0, 0, N, 4, (x, y) => {
    over(t, x, y, 0.2, 0.12, 0.07, 0.65);
    setH(t, x, y, 0.8);
  });
  // delikli pano (koyu zemin)
  rect(2, 5, 28, 12, (x, y) => {
    over(t, x, y, 0.28, 0.2, 0.14, 0.78);
    setH(t, x, y, 0.35);
    if ((x + y) % 4 === 0) put(t, x, y, 0.13, 0.09, 0.06, 1);
  });
  // çekiç
  rect(5, 9, 8, 3, (x, y, u) => {
    put(t, x, y, 0.62 * (1 - u * 0.2), 0.64 * (1 - u * 0.2), 0.7 * (1 - u * 0.2), 1);
    setH(t, x, y, 0.9);
    setRo(t, x, y, 0.3);
  });
  rect(8, 11, 2, 6, (x, y) => {
    put(t, x, y, 0.5, 0.33, 0.18, 1);
    setH(t, x, y, 0.8);
  });
  // testere
  poly([[16, 8], [27, 8], [27, 13], [16, 12]], (x, y) => {
    put(t, x, y, 0.72, 0.74, 0.8, 1);
    setH(t, x, y, 0.85);
    setRo(t, x, y, 0.25);
  });
  for (let x = 17; x <= 26; x += 2) {
    put(t, x, 13, 0.55, 0.57, 0.62, 1);
    setH(t, x, 13, 0.8);
  }
  rect(26, 7, 3, 5, (x, y) => {
    put(t, x, y, 0.5, 0.33, 0.18, 1);
    setH(t, x, y, 0.8);
  });
  t.bump = 1.1;
}

export function paintFurnaceSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const row = y >> 3;
    const off = (row & 1) * 8;
    const bx = ((x + off) & 31) >> 4;
    const id = ihash(bx, row, seed);
    stonePixel(o, x + bx * 5, y + row * 3, seed + (id & 3), { dark: hex(0x5a5c60), light: hex(0x8d9096), warm: hex(0x80796e), cracks: false });
    const lx = (x + off) & 15;
    const ly = y & 7;
    if (ly === 0 || lx === 0) {
      o.r *= 0.5;
      o.g *= 0.5;
      o.b *= 0.52;
      o.h = 0.12;
      o.ao = 0.65;
    } else {
      o.h = 0.5 + o.h * 0.3;
    }
  });
  // ağız: kemerli, kor
  for (let y = 12; y < 28; y++) {
    for (let x = 7; x < 25; x++) {
      const dx = (x + 0.5 - 16) / 9;
      const top = 12 + (1 - Math.sqrt(Math.max(0, 1 - dx * dx))) * 5;
      if (y + 0.5 < top) continue;
      const depth = (y - 12) / 16;
      const c = 0.05 + depth * 0.02;
      put(t, x, y, c, c * 0.9, c * 0.85, 1);
      setH(t, x, y, 0.15);
      setE(t, x, y, 0);
      const ember = clamp((y - 19) / 9) * (0.55 + vnoise(x, y, 6, 6, seed + 2) * 0.6);
      if (ember > 0.12) {
        const ec = mixc(hex(0x8a1a06), hex(0xff9a28), clamp(ember));
        over(t, x, y, ec[0], ec[1], ec[2], clamp(ember * 1.2));
        setE(t, x, y, clamp(ember * 1.1));
      }
    }
  }
  // demir ızgara çubukları + çerçeve
  for (let x = 9; x <= 23; x += 3) {
    for (let y = 16; y < 27; y++) {
      put(t, x, y, 0.22, 0.22, 0.25, 1);
      setH(t, x, y, 0.9);
      setRo(t, x, y, 0.3);
    }
  }
  for (let x = 6; x < 26; x++) {
    const dx = (x + 0.5 - 16) / 9;
    const top = 12 + (1 - Math.sqrt(Math.max(0, 1 - Math.min(1, dx * dx)))) * 5;
    const yy = Math.round(top) - 1;
    put(t, x, yy, 0.2, 0.2, 0.22, 1);
    setH(t, x, yy, 0.9);
  }
  t.bump = 1.4;
}

export function paintFurnaceTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    stonePixel(o, x, y, seed, { dark: hex(0x5a5c60), light: hex(0x8d9096), warm: hex(0x80796e), cracks: false });
    const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    if (r < 6.5) {
      const k = clamp((r - 3) / 3.5);
      o.r = lerp(0.05, o.r * 0.6, k);
      o.g = lerp(0.045, o.g * 0.6, k);
      o.b = lerp(0.045, o.b * 0.6, k);
      o.h = 0.12 + k * 0.3;
    } else if (r < 8) {
      o.r *= 0.7;
      o.g *= 0.7;
      o.b *= 0.7;
      o.h = 0.7;
    }
  });
  bevel(t, 2, 0.4, 0.2);
  t.bump = 1.1;
}

export function paintDoor(t, seed) {
  paintPixels(t, (x, y, o) => {
    woodField(o, x, y, seed, hex(0x7a5230), hex(0xb08050), false);
    if (x % 8 === 0) {
      o.r *= 0.5;
      o.g *= 0.48;
      o.b *= 0.45;
      o.h = 0.15;
      o.ao = 0.65;
    } else if (x % 8 === 1) {
      o.r *= 1.1;
      o.g *= 1.08;
      o.b *= 1.05;
    }
  });
  // demir bantlar
  [[3, 6], [14, 17], [25, 28]].forEach((b) => {
    for (let y = b[0]; y <= b[1]; y++) {
      for (let x = 0; x < N; x++) {
        const edge = y === b[0] || y === b[1];
        const g = rnd(x, y, seed) * 0.1;
        const k = edge ? 0.55 : 0.9 + g;
        put(t, x, y, 0.34 * k, 0.35 * k, 0.4 * k, 1);
        setH(t, x, y, edge ? 0.65 : 0.82);
        setRo(t, x, y, 0.35);
      }
    }
    [4, 12, 20, 28].forEach((rx) => rivet(t, rx + 0.5, (b[0] + b[1]) / 2 + 0.5, 1.1, [0.55, 0.57, 0.62]));
  });
  // kol ve arka plaka
  rect(24, 13, 5, 7, (x, y) => {
    put(t, x, y, 0.26, 0.27, 0.3, 1);
    setH(t, x, y, 0.82);
    setRo(t, x, y, 0.35);
  });
  disc(26.5, 16.5, 1.6, (x, y, d) => {
    put(t, x, y, 0.65 - d * 0.3, 0.66 - d * 0.3, 0.7 - d * 0.3, 1);
    setH(t, x, y, 0.95);
    setRo(t, x, y, 0.2);
  });
  t.bump = 1.3;
}

export function paintBedTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    const quilt = (Math.abs(((x + y) % 8) - 4) < 0.6 || Math.abs((((x - y) % 8) + 8) % 8 - 4) < 0.6) ? 0.84 : 1;
    const n = vnoise(x, y, 5, 5, seed);
    setMix(o, hex(0x8f1c24), hex(0xc43a3a), clamp(0.25 + n * 0.6));
    o.r *= quilt;
    o.g *= quilt;
    o.b *= quilt;
    o.h = 0.55 + (quilt < 1 ? -0.15 : 0.1);
    o.ro = 1;
  });
  // yastık (üst bölüm)
  rect(3, 3, 26, 9, (x, y, u, v) => {
    const k = 0.9 + (1 - Math.abs(v - 0.5) * 2) * 0.15 + (1 - Math.abs(u - 0.5) * 2) * 0.05;
    const g = rnd(x, y, seed + 2) * 0.05;
    put(t, x, y, (0.96 + g) * k, (0.95 + g) * k, (0.92 + g) * k, 1);
    setH(t, x, y, 0.85 + (1 - Math.abs(v - 0.5) * 2) * 0.1);
    setRo(t, x, y, 1);
  });
  // yastık kenarı çizgisi
  for (let x = 3; x < 29; x++) {
    shade(t, x, 11, 0.8);
  }
  // çarşaf kıvrımı
  for (let x = 0; x < N; x++) {
    over(t, x, 15, 1, 0.95, 0.92, 0.9);
    setH(t, x, 15, 0.8);
    shade(t, x, 16, 0.78);
  }
  t.bump = 1.0;
}

export function paintBedSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    const fromBottom = N - 1 - y;
    if (fromBottom < 7) {
      woodField(o, x, y, seed, hex(0x6e4826), hex(0xa6783e), true);
    } else if (fromBottom < 9) {
      setMix(o, hex(0xe8e2d8), hex(0xffffff), rnd(x, y, seed));
      o.h = 0.7;
      o.ro = 1;
    } else {
      const n = vnoise(x, y, 5, 3, seed);
      setMix(o, hex(0x8f1c24), hex(0xc43a3a), clamp(0.3 + n * 0.6));
      o.h = 0.5;
      o.ro = 1;
    }
  });
  t.bump = 1.0;
}

export function paintBookshelfSide(t, seed) {
  const bookCols = [0x8a2a2a, 0x2a4a8a, 0x2a7a3c, 0x8a6a1e, 0x5a2a7a, 0x7a3a1e, 0x1e6a7a, 0x9a3a5a, 0x4a4a52];
  paintPixels(t, (x, y, o) => {
    woodField(o, x, y, seed, hex(0x7a5230), hex(0xb08050), true);
  });
  // iki raf (her biri 14 px yüksek), raflar arası 2 px tahta
  [[2, 13], [17, 28]].forEach((shelf, si) => {
    let x = 2;
    let bi = 0;
    while (x < 30) {
      const h = ihash(bi, si, seed);
      const w = 2 + (h & 1) + (((h >>> 1) & 3) === 0 ? 1 : 0);
      const top = shelf[0] + ((h >>> 4) & 3);
      const col = hex(bookCols[(h >>> 8) % bookCols.length]);
      const tilt = ((h >>> 12) & 7) === 0;
      for (let xx = x; xx < Math.min(30, x + w); xx++) {
        for (let y = top; y <= shelf[1]; y++) {
          const edge = xx === x ? 0.78 : xx === x + w - 1 ? 0.62 : 1;
          const g = rnd(xx, y, seed) * 0.1;
          put(t, xx, y, col[0] * edge * (0.95 + g), col[1] * edge * (0.95 + g), col[2] * edge * (0.95 + g), 1);
          setH(t, xx, y, xx === x ? 0.85 : 0.7);
          setRo(t, xx, y, 0.85);
          setTm(t, xx, y, 0);
        }
        // altın yazı çizgisi
        const gy = top + 2 + ((h >>> 16) & 3);
        if (gy < shelf[1] - 1 && xx === x + (w >> 1)) {
          put(t, xx, gy, 0.92, 0.78, 0.35, 1);
          put(t, xx, gy + 1, 0.92, 0.78, 0.35, 1);
        }
      }
      x += w + (tilt ? 1 : 0);
      bi++;
    }
    // raf gölgesi
    for (let xx = 0; xx < N; xx++) {
      shade(t, xx, shelf[0], 0.7);
      addH(t, xx, shelf[0], -0.2);
    }
  });
  frame(t, 2, hex(0x4a2e18), 0.6, 0.15);
  t.bump = 1.2;
}

export function paintBookshelfTop(t, seed) {
  paintPlanksLike(t, seed);
}

function paintPlanksLike(t, seed) {
  paintPixels(t, (x, y, o) => {
    woodField(o, x, y, seed, hex(0x8c6034), hex(0xbb8a50), true);
    if (y % 8 === 0) {
      o.r *= 0.55;
      o.g *= 0.52;
      o.b *= 0.5;
      o.h = 0.2;
    }
  });
  frame(t, 2, hex(0x4a2e18), 0.55, 0.15);
  t.bump = 1.0;
}

export function paintSign(t, seed) {
  paintPixels(t, (x, y, o) => {
    woodField(o, x, y, seed, hex(0xa07a45), hex(0xc9a266), true);
    if (y % 8 === 0) {
      o.r *= 0.7;
      o.g *= 0.68;
      o.b *= 0.64;
    }
  });
  // yazı satırları
  for (let row = 0; row < 4; row++) {
    const y = 6 + row * 6;
    let x = 4;
    while (x < 27) {
      const h = ihash(x, row, seed);
      const w = 2 + (h % 5);
      for (let xx = x; xx < Math.min(28, x + w); xx++) {
        put(t, xx, y, 0.16, 0.1, 0.07, 1);
        put(t, xx, y + 1, 0.2, 0.13, 0.09, 1);
        setH(t, xx, y, 0.3);
      }
      x += w + 2;
    }
  }
  frame(t, 2, hex(0x5a3a1e), 0.8, 0.2);
  [[3, 3], [28, 3], [3, 28], [28, 28]].forEach((p) => {
    put(t, p[0], p[1], 0.3, 0.28, 0.28, 1);
    setH(t, p[0], p[1], 0.9);
  });
  t.bump = 1.0;
}

