/*
 * KEŞİF render — sistem ve bulmaca blokları: rün taşları (renk körlüğü için FARKLI ŞEKİLLER), mühür bariyeri,
 * plakalar, kol, mantık kapısı, alıcı, ayna, ışın kaynağı, itilebilir blok, platform, kilitli kapı, parkur plakaları,
 * portallar, boss kapısı, sunak, portal çerçevesi, ana kaya.
 *
 * Şekil kuralı (rün): kırmızı=üçgen, mavi=daire(halka), yeşil=kare, sarı=yıldız, mor=baklava.
 */
import {
  N, rnd, ihash, vnoise, fbm, worley, W, hex, mixc, clamp, lerp, paintPixels, setMix, put, over, shade, setH, addH,
  setE, maxE, setRo, disc, line, rect, poly, bevel, regularPoly, starPoly, ix,
} from './atlasKit.js';
import { stonePixel } from './atlasTilesTerrain.js';

const SLATE = { dark: hex(0x1f2229), light: hex(0x3d424e), warm: hex(0x34323c), strata: 0.03, cracks: false };

function slateBase(t, seed, pal = SLATE) {
  paintPixels(t, (x, y, o) => {
    stonePixel(o, x, y, seed, pal);
    o.ro = 0.5;
  });
}

/** Maske → bulanıklaştırılmış hale: emisyon ve renk katkısı. */
function halo(t, mask, col, emitK, colK, radius = 3) {
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

function newMask() {
  return new Float32Array(N * N);
}

/* ------------------------------------------------------------------------------------------------
 * Rün taşları
 * ---------------------------------------------------------------------------------------------- */
export function paintRune(t, seed, shape, colorHex) {
  slateBase(t, seed);
  const col = hex(colorHex);
  const rim = mixc(col, [1, 1, 1], 0.55);
  const deep = mixc(col, [0, 0, 0], 0.45);
  const mask = newMask();
  const fillShape = (pts, inner) => {
    poly(pts, (x, y, d) => {
      const c = d < 1.1 ? rim : inner ? deep : col;
      put(t, x, y, c[0], c[1], c[2], 1);
      setE(t, x, y, d < 1.1 ? 1 : inner ? 0.55 : 0.88);
      setH(t, x, y, d < 1.1 ? 0.3 : 0.45);
      setRo(t, x, y, 0.2);
      mask[ix(x, y)] = 1;
    });
  };
  if (shape === 'üçgen') {
    fillShape(regularPoly(16, 18, 11.5, 3, -Math.PI / 2), false);
    fillShape(regularPoly(16, 19, 5, 3, -Math.PI / 2), true);
  } else if (shape === 'daire') {
    disc(16, 16, 10, (x, y, d) => {
      const dd = (1 - d) * 10;
      const ringZone = d > 0.55 || d < 0.3;
      if (!ringZone) return;
      const c = dd < 1.1 || (d > 0.55 && d < 0.62) ? rim : d < 0.3 ? deep : col;
      put(t, x, y, c[0], c[1], c[2], 1);
      setE(t, x, y, 0.9);
      setH(t, x, y, 0.4);
      setRo(t, x, y, 0.2);
      mask[ix(x, y)] = 1;
    });
  } else if (shape === 'kare') {
    const sq = [[7, 7], [25, 7], [25, 25], [7, 25]];
    fillShape(sq, false);
    fillShape([[12, 12], [20, 12], [20, 20], [12, 20]], true);
  } else if (shape === 'yıldız') {
    fillShape(starPoly(16, 16.5, 12, 5.2, 5), false);
    fillShape(starPoly(16, 16.5, 5, 2.4, 5), true);
  } else {
    fillShape([[16, 4], [27, 16], [16, 28], [5, 16]], false);
    fillShape([[16, 10], [21, 16], [16, 22], [11, 16]], true);
  }
  halo(t, mask, col, 0.55, 0.35, 4);
  bevel(t, 3, 0.5, 0.22);
  // köşe vidaları
  [[3, 3], [28, 3], [3, 28], [28, 28]].forEach((p) => {
    put(t, p[0], p[1], 0.55, 0.58, 0.64, 1);
    setH(t, p[0], p[1], 0.9);
  });
  t.bump = 1.1;
}

/* ------------------------------------------------------------------------------------------------
 * Mühür bariyeri
 * ---------------------------------------------------------------------------------------------- */
export function paintBarrier(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 3, 3, 3, seed);
    const grad = y / N;
    const c = mixc(hex(0x4a2ad8), hex(0xa070ff), clamp(0.2 + n * 0.7 + (1 - grad) * 0.15));
    o.r = c[0];
    o.g = c[1];
    o.b = c[2];
    o.a = 0.26 + n * 0.16;
    o.e = 0.28 + n * 0.2;
    o.h = 0.5;
    o.ro = 0.1;
    worley(x, y, 4, 4, seed + 3, 0.5);
    const edge = W.f2 - W.f1;
    if (edge < 1.25) {
      const k = 1 - edge / 1.25;
      o.r = lerp(o.r, 0.86, k * 0.85);
      o.g = lerp(o.g, 0.78, k * 0.85);
      o.b = lerp(o.b, 1, k * 0.85);
      o.a = Math.max(o.a, 0.4 + k * 0.5);
      o.e = Math.max(o.e, 0.55 + k * 0.45);
      o.h = 0.7;
    }
  });
  // merkez mühür: halka + 5 çentik
  const mask = newMask();
  disc(16, 16, 9.5, (x, y, d) => {
    if (d > 0.72 && d < 0.88) {
      put(t, x, y, 0.95, 0.88, 1, 0.9);
      setE(t, x, y, 1);
      mask[ix(x, y)] = 1;
    }
  });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const px = 16 + Math.cos(a) * 9.5;
    const py = 16 + Math.sin(a) * 9.5;
    disc(px, py, 1.9, (x, y) => {
      put(t, x, y, 1, 0.96, 1, 0.95);
      setE(t, x, y, 1);
      mask[ix(x, y)] = 1;
    });
  }
  poly(starPoly(16, 16.5, 5, 2.2, 5), (x, y) => {
    put(t, x, y, 0.9, 0.82, 1, 0.8);
    setE(t, x, y, 0.9);
    mask[ix(x, y)] = 1;
  });
  t.bump = 0.7;
}

/* ------------------------------------------------------------------------------------------------
 * Plaka, kol, mantık kapısı, alıcı
 * ---------------------------------------------------------------------------------------------- */
export function paintPlate(t, seed, pressed) {
  slateBase(t, seed, { dark: hex(0x4a4f5a), light: hex(0x8a909c), warm: hex(0x70707c), strata: 0.02, cracks: false });
  const mask = newMask();
  // dış çerçeve çukuru + iç yükseltilmiş panel
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < 3) {
        over(t, x, y, 0.2, 0.22, 0.26, 0.55);
        setH(t, x, y, d === 0 ? 0.65 : 0.8);
      }
      const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
      if (r < 10.5 && r > 8) {
        const c = pressed ? [0.3, 0.95, 1] : [0.22, 0.25, 0.3];
        put(t, x, y, c[0], c[1], c[2], 1);
        setH(t, x, y, 0.3);
        if (pressed) {
          setE(t, x, y, 1);
          mask[ix(x, y)] = 1;
        }
      } else if (r <= 8) {
        const k = pressed ? 0.78 : 1.12;
        shade(t, x, y, k);
        setH(t, x, y, pressed ? 0.35 : 0.72);
      }
    }
  }
  if (pressed) {
    halo(t, mask, [0.3, 0.95, 1], 0.5, 0.3, 3);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      put(t, Math.round(16 + Math.cos(a) * 4.2), Math.round(16 + Math.sin(a) * 4.2), 0.7, 1, 1, 1);
      setE(t, Math.round(16 + Math.cos(a) * 4.2), Math.round(16 + Math.sin(a) * 4.2), 1);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      put(t, Math.round(16 + Math.cos(a) * 4.2), Math.round(16 + Math.sin(a) * 4.2), 0.18, 0.2, 0.24, 1);
    }
  }
  t.bump = 1.1;
}

export function paintLever(t, seed, on) {
  for (let i = 0; i < N * N; i++) {
    t.c[i * 4 + 3] = 0;
    t.tm[i] = 0;
  }
  // taban: taş plaka
  rect(7, 25, 18, 7, (x, y, u, v) => {
    const g = rnd(x, y, seed) * 0.12;
    const k = 0.5 + g + (1 - v) * 0.1;
    put(t, x, y, k, k * 1.02, k * 1.08, 1);
    setH(t, x, y, 0.6 + (1 - v) * 0.15);
    setRo(t, x, y, 0.7);
  });
  // eksen
  disc(16, 26, 2.3, (x, y, d) => {
    put(t, x, y, 0.62 - d * 0.25, 0.64 - d * 0.25, 0.7 - d * 0.25, 1);
    setH(t, x, y, 0.9);
    setRo(t, x, y, 0.25);
  });
  // kol çubuğu
  const tx = on ? 23 : 9;
  line(16, 26, tx, 9, 1.35, (x, y, d, s) => {
    const k = 0.92 - d * 0.35 + s * 0.05;
    put(t, x, y, 0.58 * k + 0.1, 0.6 * k + 0.1, 0.66 * k + 0.1, 1);
    setH(t, x, y, 0.8 - d * 0.1);
    setRo(t, x, y, 0.3);
  });
  // topuz
  const kc = on ? [0.25, 0.9, 0.4] : [0.85, 0.22, 0.2];
  disc(tx, 8.5, 3.3, (x, y, d, nx, ny) => {
    const k = 0.7 + (1 - d) * 0.4 - (nx + ny) * 0.2;
    put(t, x, y, kc[0] * k, kc[1] * k, kc[2] * k, 1);
    setH(t, x, y, 0.9);
    setRo(t, x, y, 0.2);
    if (on) setE(t, x, y, 0.9);
  });
  put(t, Math.round(tx - 1), 7, 1, 1, 1, 1);
  if (on) {
    const mask = newMask();
    disc(tx, 8.5, 3.3, (x, y) => {
      mask[ix(x, y)] = 1;
    });
    halo(t, mask, kc, 0.8, 0.5, 4);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = ix(x, y) * 4;
        if (t.c[i + 3] < 0.02 && t.e[ix(x, y)] > 0.05) t.c[i + 3] = clamp(t.e[ix(x, y)] * 0.5);
      }
    }
  }
  t.bump = 1.0;
}

export function paintLogicGate(t, seed) {
  slateBase(t, seed);
  const cyan = [0.3, 0.92, 0.95];
  const mask = newMask();
  const trace = (x, y) => {
    put(t, x, y, cyan[0], cyan[1], cyan[2], 1);
    setE(t, x, y, 0.9);
    setH(t, x, y, 0.3);
    mask[ix(x, y)] = 1;
  };
  // girişler, çıkış
  for (let x = 3; x <= 10; x++) {
    trace(x, 12);
    trace(x, 20);
  }
  for (let x = 22; x <= 28; x++) trace(x, 16);
  // VE kapısı: düz sol kenar + yarım daire
  for (let y = 8; y <= 24; y++) trace(10, y);
  for (let x = 10; x <= 16; x++) {
    trace(x, 8);
    trace(x, 24);
  }
  for (let y = 8; y <= 24; y++) {
    for (let x = 16; x <= 23; x++) {
      const r = Math.hypot(x + 0.5 - 16.5, y + 0.5 - 16.5);
      if (Math.abs(r - 8) < 0.75) trace(x, y);
    }
  }
  // devre düğümleri
  [[3, 12], [3, 20], [28, 16]].forEach((p) => {
    disc(p[0] + 0.5, p[1] + 0.5, 1.8, (x, y) => {
      put(t, x, y, 1, 1, 1, 1);
      setE(t, x, y, 1);
      mask[ix(x, y)] = 1;
    });
  });
  // dekoratif izler
  for (let i = 0; i < 6; i++) {
    const hh = ihash(i, 3, seed);
    const x = 3 + (hh % 24);
    const y = i < 3 ? 3 + (hh % 3) : 27 - (hh % 3);
    for (let k = 0; k < 4; k++) {
      put(t, x + k, y, cyan[0] * 0.6, cyan[1] * 0.6, cyan[2] * 0.6, 1);
      setE(t, x + k, y, 0.45);
    }
  }
  halo(t, mask, cyan, 0.4, 0.2, 3);
  bevel(t, 2, 0.5, 0.2);
  t.bump = 1.0;
}

export function paintReceiver(t, seed, active) {
  slateBase(t, seed);
  const mask = newMask();
  const col = active ? [0.3, 0.95, 1] : [0.38, 0.38, 0.5];
  // oyuk
  disc(16, 16, 11, (x, y, d) => {
    const k = 0.32 + d * 0.5;
    shade(t, x, y, k);
    setH(t, x, y, 0.25 + d * 0.2);
  });
  // kristal (sekizgen)
  const pts = regularPoly(16, 16, 7.5, 8, Math.PI / 8);
  poly(pts, (x, y, d) => {
    const dx = x + 0.5 - 16;
    const dy = y + 0.5 - 16;
    let k = 0.75 + (-dx - dy) * 0.03;
    const rr = Math.hypot(dx, dy);
    if (rr < 3) k += 0.25;
    if (d < 1.0) k *= 0.8;
    put(t, x, y, Math.min(1, col[0] * k), Math.min(1, col[1] * k), Math.min(1, col[2] * k), 1);
    setH(t, x, y, 0.8 + (7.5 - rr) * 0.02);
    setRo(t, x, y, 0.1);
    setE(t, x, y, active ? 0.8 + (rr < 3 ? 0.2 : 0) : 0.04);
    mask[ix(x, y)] = 1;
  });
  if (active) {
    // ışınlar
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      line(16 + Math.cos(a) * 8.5, 16 + Math.sin(a) * 8.5, 16 + Math.cos(a) * 12.5, 16 + Math.sin(a) * 12.5, 0.55, (x, y) => {
        put(t, x, y, 0.8, 1, 1, 1);
        setE(t, x, y, 1);
        mask[ix(x, y)] = 1;
      });
    }
    halo(t, mask, col, 0.7, 0.4, 4);
  }
  bevel(t, 2, 0.5, 0.2);
  t.bump = 1.1;
}

/* ------------------------------------------------------------------------------------------------
 * Ayna, ışın kaynağı, itilebilir blok, hareketli platform, kilitli kapı
 * ---------------------------------------------------------------------------------------------- */
export function paintMirror(t, seed) {
  paintPixels(t, (x, y, o) => {
    const g = (x + y) / (2 * N);
    const n = vnoise(x, y, 3, 3, seed);
    const c = mixc(hex(0xf0f6ff), hex(0x8ea2bd), clamp(g * 1.1 + (n - 0.5) * 0.12));
    o.r = c[0];
    o.g = c[1];
    o.b = c[2];
    o.ro = 0.02;
    o.h = 0.5;
    // çapraz parlak şeritler
    const s = x - y;
    if ((s >= -9 && s <= -6) || (s >= 5 && s <= 6)) {
      o.r = lerp(o.r, 1, 0.75);
      o.g = lerp(o.g, 1, 0.75);
      o.b = lerp(o.b, 1, 0.75);
      o.e = 0.12;
    }
  });
  // çelik çerçeve
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < 3) {
        const k = d === 0 ? 0.55 : d === 1 ? 1.05 : 0.8;
        const g = rnd(x, y, seed) * 0.08;
        put(t, x, y, 0.4 * k + g, 0.43 * k + g, 0.5 * k + g, 1);
        setH(t, x, y, d === 1 ? 0.9 : 0.7);
        setRo(t, x, y, 0.3);
        setE(t, x, y, 0);
      }
    }
  }
  [[2, 2], [29, 2], [2, 29], [29, 29]].forEach((p) => {
    put(t, p[0], p[1], 0.15, 0.16, 0.18, 1);
  });
  t.bump = 0.8;
}

export function paintBeamSource(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 3, seed);
    setMix(o, hex(0x1d1f24), hex(0x4a4e58), n);
    o.h = 0.5;
    o.ro = 0.4;
  });
  const mask = newMask();
  disc(16, 16, 12, (x, y, d) => {
    const rings = [0.98, 0.82, 0.6, 0.38];
    let c;
    let e = 0;
    if (d > 0.82) c = [0.3, 0.32, 0.36];
    else if (d > 0.62) {
      c = [0.1, 0.1, 0.12];
    } else if (d > 0.4) {
      c = mixc(hex(0xb83a0a), hex(0xff8a1a), 1 - (d - 0.4) / 0.22);
      e = 0.75;
    } else {
      c = mixc(hex(0xfff6c0), hex(0xffc060), d / 0.4);
      e = 1;
    }
    void rings;
    put(t, x, y, c[0], c[1], c[2], 1);
    setE(t, x, y, e);
    setH(t, x, y, d > 0.82 ? 0.85 : d > 0.62 ? 0.3 : 0.4);
    setRo(t, x, y, d > 0.82 ? 0.3 : 0.05);
    if (e > 0) mask[ix(x, y)] = 1;
  });
  halo(t, mask, [1, 0.6, 0.2], 0.4, 0.25, 3);
  // yarım ışıma kanatları
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    for (let k = 13; k <= 17; k++) {
      const x = Math.round(16 + Math.cos(a) * k);
      const y = Math.round(16 + Math.sin(a) * k);
      put(t, x, y, 0.35, 0.37, 0.42, 1);
      setH(t, x, y, 0.8);
    }
  }
  bevel(t, 2, 0.5, 0.2);
  t.bump = 1.0;
}

export function paintPushBlock(t, seed) {
  paintPixels(t, (x, y, o) => {
    stonePixel(o, x, y, seed, { dark: hex(0x6a5c48), light: hex(0xa8957a), warm: hex(0x9a7c58), strata: 0.04, cracks: false });
  });
  // metal kenar çerçeve (4 px)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < 3) {
        const k = d === 0 ? 0.55 : d === 1 ? 1.0 : 0.75;
        const g = rnd(x, y, seed) * 0.08;
        put(t, x, y, 0.5 * k + g, 0.52 * k + g, 0.58 * k + g, 1);
        setH(t, x, y, d === 1 ? 0.9 : 0.7);
        setRo(t, x, y, 0.3);
      }
    }
  }
  const amber = [1, 0.62, 0.18];
  const mask = newMask();
  const arrow = (cx, cy, dx, dy) => {
    // 5 px yükseklikte ok (uç yönü dx,dy)
    const pts = [];
    const px = -dy;
    const py = dx;
    pts.push([cx + dx * 4, cy + dy * 4]);
    pts.push([cx - dx * 2 + px * 3.4, cy - dy * 2 + py * 3.4]);
    pts.push([cx - dx * 0.5, cy - dy * 0.5]);
    pts.push([cx - dx * 2 - px * 3.4, cy - dy * 2 - py * 3.4]);
    poly(pts, (x, y, d) => {
      put(t, x, y, amber[0], amber[1], amber[2], 1);
      setE(t, x, y, d < 0.9 ? 0.6 : 0.85);
      setH(t, x, y, 0.35);
      mask[ix(x, y)] = 1;
    });
  };
  arrow(16, 8.5, 0, -1);
  arrow(16, 23.5, 0, 1);
  arrow(8.5, 16, -1, 0);
  arrow(23.5, 16, 1, 0);
  disc(16, 16, 2.6, (x, y, d, nx, ny) => {
    const k = 0.7 + (1 - d) * 0.35 - (nx + ny) * 0.15;
    put(t, x, y, 0.62 * k, 0.64 * k, 0.7 * k, 1);
    setH(t, x, y, 0.9);
    setRo(t, x, y, 0.25);
  });
  halo(t, mask, amber, 0.25, 0.12, 2);
  t.bump = 1.2;
}

export function paintMovingPlatform(t, seed) {
  paintPixels(t, (x, y, o) => {
    const streak = vnoise(x, y, 2, 24, seed);
    setMix(o, hex(0x3c4658), hex(0x6a7890), clamp(0.2 + streak * 0.6));
    o.h = 0.5;
    o.ro = 0.4;
  });
  // tehlike şeritleri çerçevesi
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < 4) {
        const stripe = ((x + y) >> 2) & 1;
        const c = stripe ? [0.96, 0.78, 0.12] : [0.12, 0.12, 0.14];
        const k = d === 3 ? 0.75 : 1;
        put(t, x, y, c[0] * k, c[1] * k, c[2] * k, 1);
        setH(t, x, y, d === 3 ? 0.6 : 0.8);
        setRo(t, x, y, 0.5);
      }
    }
  }
  // yön okları (iki yönlü)
  const teal = [0.25, 0.95, 0.9];
  const mask = newMask();
  const chev = (cx, dir) => {
    for (let i = 0; i < 5; i++) {
      const y1 = 16 - i;
      const y2 = 16 + i;
      const x = cx - dir * i;
      [[x, y1], [x, y2], [x + dir * 0, y1], [x + dir, y1], [x + dir, y2]].forEach((p) => {
        put(t, p[0], p[1], teal[0], teal[1], teal[2], 1);
        setE(t, p[0], p[1], 0.85);
        setH(t, p[0], p[1], 0.35);
        mask[ix(p[0], p[1])] = 1;
      });
    }
  };
  chev(10, 1);
  chev(22, -1);
  halo(t, mask, teal, 0.3, 0.12, 2);
  t.bump = 1.0;
}

export function paintLockedDoor(t, seed) {
  paintPixels(t, (x, y, o) => {
    const streak = vnoise(x, y, 2, 20, seed);
    setMix(o, hex(0x2e3138), hex(0x585d68), clamp(0.2 + streak * 0.7));
    o.h = 0.5;
    o.ro = 0.4;
  });
  // 4 panel yiv + perçin
  for (let i = 0; i < N; i++) {
    shade(t, i, 15, 0.55);
    shade(t, i, 16, 0.55);
    shade(t, 15, i, 0.55);
    shade(t, 16, i, 0.55);
    addH(t, i, 15, -0.3);
    addH(t, 15, i, -0.3);
  }
  bevel(t, 2, 0.5, 0.2);
  [[5, 5], [26, 5], [5, 26], [26, 26], [11, 5], [20, 5], [11, 26], [20, 26]].forEach((p) => {
    disc(p[0] + 0.5, p[1] + 0.5, 1.2, (x, y, d, nx, ny) => {
      const k = 0.7 + (1 - d) * 0.3 - (nx + ny) * 0.15;
      put(t, x, y, 0.6 * k, 0.62 * k, 0.68 * k, 1);
      setH(t, x, y, 0.9);
    });
  });
  // altın asma kilit
  rect(10, 14, 12, 11, (x, y, u, v) => {
    const edge = u < 0.1 || u > 0.9 || v < 0.1 || v > 0.9;
    const k = edge ? 0.7 : 0.95 + (1 - v) * 0.15;
    put(t, x, y, 0.98 * k, 0.78 * k, 0.2 * k, 1);
    setH(t, x, y, edge ? 0.8 : 0.9);
    setRo(t, x, y, 0.22);
    setE(t, x, y, 0.1);
  });
  for (let y = 8; y < 14; y++) {
    for (let x = 12; x < 20; x++) {
      const r = Math.hypot(x + 0.5 - 16, y + 0.5 - 14);
      if (r > 3.2 && r < 4.8 && y < 14) {
        put(t, x, y, 0.82, 0.84, 0.9, 1);
        setH(t, x, y, 0.88);
        setRo(t, x, y, 0.2);
      }
    }
  }
  disc(16, 18.5, 1.8, (x, y) => {
    put(t, x, y, 0.07, 0.05, 0.04, 1);
    setH(t, x, y, 0.1);
  });
  rect(15, 19, 2, 4, (x, y) => {
    put(t, x, y, 0.07, 0.05, 0.04, 1);
  });
  t.bump = 1.2;
}

/* ------------------------------------------------------------------------------------------------
 * Parkur plakaları
 * ---------------------------------------------------------------------------------------------- */
export function paintParkour(t, seed, kind) {
  const base = kind === 'başlangıç' ? [0.1, 0.62, 0.28] : kind === 'bitiş' ? [0.12, 0.12, 0.14] : [0.12, 0.35, 0.78];
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 3, seed);
    o.r = base[0] * (0.8 + n * 0.4);
    o.g = base[1] * (0.8 + n * 0.4);
    o.b = base[2] * (0.8 + n * 0.4);
    o.h = 0.5;
    o.ro = 0.35;
    o.e = 0.1;
  });
  const mask = newMask();
  if (kind === 'başlangıç') {
    poly([[11, 8], [24, 16], [11, 24]], (x, y, d) => {
      put(t, x, y, 0.95, 1, 0.95, 1);
      setE(t, x, y, d < 1 ? 1 : 0.8);
      setH(t, x, y, 0.35);
      mask[ix(x, y)] = 1;
    });
    disc(16, 16, 13.5, (x, y, d) => {
      if (d > 0.88) {
        put(t, x, y, 0.8, 1, 0.82, 1);
        setE(t, x, y, 0.85);
        mask[ix(x, y)] = 1;
      }
    });
  } else if (kind === 'bitiş') {
    rect(4, 4, 24, 24, (x, y) => {
      const c = ((((x - 4) >> 2) + ((y - 4) >> 2)) & 1) ? 0.95 : 0.06;
      put(t, x, y, c, c, c * 1.02, 1);
      setH(t, x, y, c > 0.5 ? 0.6 : 0.5);
      setE(t, x, y, c > 0.5 ? 0.18 : 0);
    });
  } else {
    // bayrak: direk + üçgen flama
    for (let y = 6; y < 26; y++) {
      put(t, 11, y, 0.95, 0.96, 1, 1);
      put(t, 12, y, 0.7, 0.72, 0.8, 1);
      setH(t, 11, y, 0.8);
      setE(t, 11, y, 0.5);
      mask[ix(11, y)] = 1;
    }
    poly([[13, 7], [25, 11.5], [13, 16]], (x, y, d) => {
      put(t, x, y, 1, 0.92, 0.35, 1);
      setE(t, x, y, d < 1 ? 1 : 0.85);
      setH(t, x, y, 0.4);
      mask[ix(x, y)] = 1;
    });
  }
  halo(t, mask, kind === 'başlangıç' ? [0.6, 1, 0.7] : [1, 0.95, 0.5], 0.3, 0.12, 2);
  // metal çerçeve
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < 2) {
        const k = d === 0 ? 0.5 : 0.95;
        const g = rnd(x, y, seed) * 0.06;
        put(t, x, y, 0.62 * k + g, 0.64 * k + g, 0.7 * k + g, 1);
        setH(t, x, y, d === 0 ? 0.65 : 0.85);
        setRo(t, x, y, 0.3);
        setE(t, x, y, 0);
      }
    }
  }
  t.bump = 1.0;
}

/* ------------------------------------------------------------------------------------------------
 * Portallar
 * ---------------------------------------------------------------------------------------------- */
export function paintPortal(t, seed, orange) {
  const dark = orange ? hex(0x7a2200) : hex(0x08227a);
  const mid = orange ? hex(0xff7a14) : hex(0x2a86ff);
  const hot = orange ? hex(0xfff0b4) : hex(0xcaf2ff);
  paintPixels(t, (x, y, o) => {
    const dx = x + 0.5 - 16;
    const dy = y + 0.5 - 16;
    const r = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx);
    const swirl = Math.sin(ang * 3 + r * 0.62) * 0.5 + 0.5;
    const n = fbm(x, y, 4, 4, 3, seed);
    const arms = clamp(swirl * 0.8 + n * 0.5 - r * 0.012);
    const core = clamp(1 - r / 16);
    const k = clamp(arms * 0.75 + core * 0.55);
    let c;
    if (k < 0.5) c = mixc(dark, mid, k * 2);
    else c = mixc(mid, hot, (k - 0.5) * 2);
    o.r = c[0];
    o.g = c[1];
    o.b = c[2];
    o.a = clamp(0.4 + arms * 0.35 + core * 0.35);
    o.e = 0.6 + k * 0.4;
    o.h = 0.5 + arms * 0.2;
    o.ro = 0.05;
    if (rnd(x, y, seed + 9) > 0.985) {
      o.r = 1;
      o.g = 1;
      o.b = 1;
      o.a = 1;
    }
  });
  t.bump = 0.6;
}

/* ------------------------------------------------------------------------------------------------
 * Boss kapısı, sunak, portal çerçevesi, ana kaya
 * ---------------------------------------------------------------------------------------------- */
export function paintBossDoor(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 3, seed);
    setMix(o, hex(0x14111a), hex(0x3a3340), n);
    o.h = 0.5 + n * 0.1;
    o.ro = 0.3;
  });
  const red = [1, 0.32, 0.12];
  const mask = newMask();
  // mühürlü halka
  disc(16, 16, 11.5, (x, y, d) => {
    if ((d > 0.84 && d < 0.96) || (d > 0.46 && d < 0.54)) {
      put(t, x, y, red[0], red[1], red[2], 1);
      setE(t, x, y, 0.95);
      setH(t, x, y, 0.3);
      mask[ix(x, y)] = 1;
    }
  });
  // iç ters üçgen + boynuzlar (soyut)
  poly(regularPoly(16, 15, 6, 3, Math.PI / 2), (x, y, d) => {
    put(t, x, y, red[0], red[1] * 0.8, red[2], 1);
    setE(t, x, y, d < 1 ? 1 : 0.8);
    setH(t, x, y, 0.35);
    mask[ix(x, y)] = 1;
  });
  poly([[6, 5], [10, 8], [8, 11]], (x, y) => {
    put(t, x, y, red[0], red[1], red[2], 1);
    setE(t, x, y, 0.9);
    mask[ix(x, y)] = 1;
  });
  poly([[26, 5], [22, 8], [24, 11]], (x, y) => {
    put(t, x, y, red[0], red[1], red[2], 1);
    setE(t, x, y, 0.9);
    mask[ix(x, y)] = 1;
  });
  disc(16, 15, 1.4, (x, y) => {
    put(t, x, y, 1, 0.9, 0.6, 1);
    setE(t, x, y, 1);
  });
  halo(t, mask, red, 0.5, 0.25, 4);
  bevel(t, 3, 0.55, 0.25);
  [[3, 3], [28, 3], [3, 28], [28, 28]].forEach((p) => {
    put(t, p[0], p[1], 0.55, 0.5, 0.58, 1);
    setH(t, p[0], p[1], 0.9);
  });
  t.bump = 1.2;
}

export function paintAltarTop(t, seed) {
  paintPixels(t, (x, y, o) => stonePixel(o, x, y, seed, { dark: hex(0x6e727a), light: hex(0xb4b8c0), warm: hex(0x9c9488), strata: 0.03, cracks: false }));
  const teal = [0.3, 0.95, 0.9];
  const mask = newMask();
  disc(16, 16, 13, (x, y, d) => {
    if ((d > 0.9 && d < 1) || (d > 0.55 && d < 0.63)) {
      put(t, x, y, teal[0], teal[1], teal[2], 1);
      setE(t, x, y, 0.95);
      setH(t, x, y, 0.3);
      mask[ix(x, y)] = 1;
    }
  });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const cx = 16 + Math.cos(a) * 9;
    const cy = 16 + Math.sin(a) * 9;
    poly([[cx, cy - 2.4], [cx + 2.2, cy], [cx, cy + 2.4], [cx - 2.2, cy]], (x, y, d) => {
      put(t, x, y, 0.8, 1, 0.98, 1);
      setE(t, x, y, d < 1 ? 1 : 0.85);
      setH(t, x, y, 0.35);
      mask[ix(x, y)] = 1;
    });
  }
  poly(starPoly(16, 16.4, 5.2, 2.3, 5), (x, y) => {
    put(t, x, y, 0.9, 1, 1, 1);
    setE(t, x, y, 1);
    setH(t, x, y, 0.3);
    mask[ix(x, y)] = 1;
  });
  halo(t, mask, teal, 0.45, 0.2, 3);
  bevel(t, 2, 0.5, 0.2);
  t.bump = 1.0;
}

export function paintAltarSide(t, seed) {
  paintPixels(t, (x, y, o) => stonePixel(o, x, y, seed, { dark: hex(0x6e727a), light: hex(0xb4b8c0), warm: hex(0x9c9488), strata: 0.03, cracks: false }));
  const teal = [0.3, 0.95, 0.9];
  const mask = newMask();
  // oyma panel
  for (let y = 4; y < 28; y++) {
    for (let x = 6; x < 26; x++) {
      const edge = x === 6 || x === 25 || y === 4 || y === 27;
      if (edge) {
        shade(t, x, y, 0.62);
        setH(t, x, y, 0.2);
      } else {
        shade(t, x, y, 0.94);
        setH(t, x, y, 0.55);
      }
    }
  }
  // parlayan dikey hat ve düğümler
  for (let y = 7; y < 25; y++) {
    put(t, 15, y, teal[0], teal[1], teal[2], 1);
    put(t, 16, y, teal[0], teal[1], teal[2], 1);
    setE(t, 15, y, 0.9);
    setE(t, 16, y, 0.9);
    setH(t, 15, y, 0.3);
    setH(t, 16, y, 0.3);
    mask[ix(15, y)] = 1;
    mask[ix(16, y)] = 1;
  }
  [[8, 12], [22, 12], [8, 20], [22, 20]].forEach((p) => {
    for (let x = Math.min(p[0], 15); x <= Math.max(p[0], 16); x++) {
      if (x < 15 || x > 16) {
        put(t, x, p[1], teal[0] * 0.8, teal[1] * 0.8, teal[2] * 0.8, 1);
        setE(t, x, p[1], 0.8);
        mask[ix(x, p[1])] = 1;
      }
    }
    disc(p[0] + 0.5, p[1] + 0.5, 1.5, (x, y) => {
      put(t, x, y, 0.85, 1, 0.98, 1);
      setE(t, x, y, 1);
      mask[ix(x, y)] = 1;
    });
  });
  halo(t, mask, teal, 0.4, 0.15, 3);
  t.bump = 1.1;
}

export function paintPortalFrame(t, seed) {
  paintPixels(t, (x, y, o) => {
    const n = fbm(x, y, 4, 4, 3, seed);
    setMix(o, hex(0x120a1c), hex(0x35224c), n);
    o.h = 0.5 + n * 0.12;
    o.ro = 0.25;
    worley(x, y, 3, 3, seed + 4, 0.8);
    const edge = W.f2 - W.f1;
    if (edge < 1.0) {
      o.r *= 0.5;
      o.g *= 0.5;
      o.b *= 0.55;
      o.h -= 0.15;
    }
  });
  const vio = [0.7, 0.4, 1];
  const mask = newMask();
  // parlayan rün çizgileri: iç çerçeve + köşe ok uçları
  for (let i = 4; i < 28; i++) {
    [[i, 4], [i, 27], [4, i], [27, i]].forEach((p) => {
      put(t, p[0], p[1], vio[0], vio[1], vio[2], 1);
      setE(t, p[0], p[1], 0.85);
      setH(t, p[0], p[1], 0.3);
      mask[ix(p[0], p[1])] = 1;
    });
  }
  poly([[16, 9], [22, 16], [16, 23], [10, 16]], (x, y, d) => {
    if (d < 1.2) {
      put(t, x, y, 0.95, 0.8, 1, 1);
      setE(t, x, y, 1);
      mask[ix(x, y)] = 1;
    }
  });
  halo(t, mask, vio, 0.45, 0.2, 3);
  bevel(t, 3, 0.55, 0.22);
  t.bump = 1.2;
}

export function paintBedrock(t, seed) {
  paintPixels(t, (x, y, o) => {
    stonePixel(o, x, y, seed, { dark: hex(0x15161a), light: hex(0x3c3e46), warm: hex(0x2c2a30), strata: 0.02, cracks: true });
    worley(x, y, 4, 4, seed + 77, 0.95);
    const edge = W.f2 - W.f1;
    // keskin kırık yüzeyler
    const k = 0.82 + W.id * 0.36;
    o.r *= k;
    o.g *= k;
    o.b *= k;
    o.h = 0.3 + clamp(edge / 6) * 0.5 + W.id * 0.15;
    if (edge < 0.9) {
      o.r *= 0.5;
      o.g *= 0.5;
      o.b *= 0.5;
      o.ao = 0.55;
    }
    if (rnd(x, y, seed + 5) > 0.985) {
      o.r += 0.12;
      o.g += 0.13;
      o.b += 0.2;
      o.ro = 0.2;
    }
    o.ro = Math.min(o.ro, 0.7);
  });
  t.bump = 1.6;
}

