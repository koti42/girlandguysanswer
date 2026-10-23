/*
 * KEŞİF render — teknoloji dokuları (sim/techData.js): laboratuvar, güneş paneli, jeneratör, pil, kablo, elektrikli ocak,
 * otomatik madenci, lamba, ışınlanma/asansör platformu, güç kapısı, düğme, sensör, şarj istasyonu (+ etkin/açık varyantları).
 * `TECH_PAINTERS` atlas.js kayıt defterine yayılır (ad → (tile, seed) boyayıcı). Hepsi belirlenimci ve saf (canvas yok).
 *
 * Görsel dil: fırçalanmış koyu çelik gövde + ince panel yivleri/perçinler; etkin durumlar yalnız EMİSYON ve renk kayması ile
 * ayrışır (etkin/pasif aynı silüet → renk körlüğünde şekil/parlaklık farkı: ışıklı pencere, dolu çubuk, dönen halka).
 */
import {
  N, rnd, vnoise, fbm, hex, mixc, clamp, paintPixels, setMix, setCol, put, over, shade, setH, setE, setRo, setTm,
  disc, line, rect, poly, bevel, ix, maxE, addH,
} from './atlasKit.js';

const STEEL_D = hex(0x1d2229);
const STEEL_M = hex(0x39424d);
const STEEL_L = hex(0x6a7684);
const CYAN = [0.35, 0.88, 1];
const AMBER = [1, 0.62, 0.18];
const GREEN = [0.3, 0.95, 0.5];
const RED = [1, 0.25, 0.22];
const VIOLET = [0.66, 0.5, 1];
const COPPER = hex(0xc9733a);
const YELLOW = [0.98, 0.8, 0.15];

/** Fırçalanmış çelik piksel (yatay tel izi). tone: 0.7..1.3 aydınlık çarpanı. */
function steelPixel(o, x, y, seed, tone = 1) {
  const streak = vnoise(x, y, 28, 2, seed) * 0.55 + vnoise(x, y, 40, 5, seed + 3) * 0.45;
  const n = fbm(x, y, 3, 3, 3, seed + 6);
  const v = clamp(0.15 + streak * 0.5 + n * 0.3 + (rnd(x, y, seed + 2) - 0.5) * 0.07);
  if (v < 0.5) setMix(o, STEEL_D, STEEL_M, v * 2);
  else setMix(o, STEEL_M, STEEL_L, (v - 0.5) * 2);
  o.r *= tone;
  o.g *= tone;
  o.b *= tone;
  o.h = 0.55 + streak * 0.08;
  o.ro = 0.34 + streak * 0.14;
}

function glow(t, x, y, c, e, k = 1) {
  put(t, x, y, c[0] * k, c[1] * k, c[2] * k, 1);
  setE(t, x, y, e);
}

function rivet(t, cx, cy) {
  disc(cx, cy, 1.25, (x, y, d, nx, ny) => {
    const k = 0.75 + (1 - d) * 0.35 - (nx + ny) * 0.18;
    put(t, x, y, STEEL_L[0] * k * 1.1, STEEL_L[1] * k * 1.1, STEEL_L[2] * k * 1.1, 1);
    setH(t, x, y, 0.95);
    setRo(t, x, y, 0.25);
  });
}

function rivets(t, inset) {
  const a = inset + 0.5;
  const b = N - inset - 0.5;
  rivet(t, a, a);
  rivet(t, b, a);
  rivet(t, a, b);
  rivet(t, b, b);
}

/** Dikdörtgen çukur (koyu pencere). */
function well(t, x0, y0, w, h, col, depth = 0.25) {
  rect(x0, y0, w, h, (x, y) => {
    put(t, x, y, col[0], col[1], col[2], 1);
    setH(t, x, y, depth);
    setRo(t, x, y, 0.2);
  });
  for (let i = 0; i < w; i++) {
    shade(t, x0 + i, y0 - 1, 1.3);
    shade(t, x0 + i, y0 + h, 0.6);
  }
  for (let j = 0; j < h; j++) {
    shade(t, x0 - 1, y0 + j, 0.7);
    shade(t, x0 + w, y0 + j, 1.25);
  }
}

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

function newMask() {
  return new Float32Array(N * N);
}

function clearSprite(t) {
  for (let i = 0; i < N * N; i++) {
    t.c[i * 4 + 3] = 0;
    t.tm[i] = 0;
    t.e[i] = 0;
    t.ao[i] = 1;
    t.h[i] = 0.5;
  }
}

/** Gövde: panel yivi çerçevesi + kenar pahı + perçinler. */
function bodyFinish(t, bevelW = 2) {
  bevel(t, bevelW, 0.4, 0.18);
  rivets(t, 3);
  t.bump = 1.15;
}

/* ------------------------------------------------------------------------------------------------
 * Laboratuvar
 * ---------------------------------------------------------------------------------------------- */
export function paintLabTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed, 0.95);
  });
  const mask = newMask();
  // orta cam çalışma yüzeyi: koyu cam + ızgara
  well(t, 6, 6, 20, 20, hex(0x0d2631), 0.28);
  for (let i = 0; i < 20; i += 5) {
    for (let k = 0; k < 20; k++) {
      over(t, 6 + i, 6 + k, 0.2, 0.55, 0.65, 0.35);
      over(t, 6 + k, 6 + i, 0.2, 0.55, 0.65, 0.35);
    }
  }
  // devre izi
  const pts = [[8, 22], [8, 17], [13, 17], [13, 11], [19, 11], [19, 15], [24, 15]];
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0] + 0.5, pts[i][1] + 0.5, pts[i + 1][0] + 0.5, pts[i + 1][1] + 0.5, 0.55, (x, y) => {
      glow(t, x, y, CYAN, 0.85, 1);
      mask[ix(x, y)] = 1;
    });
  }
  [[8, 22], [24, 15]].forEach((p) => disc(p[0] + 0.5, p[1] + 0.5, 1.7, (x, y) => { glow(t, x, y, [0.8, 1, 1], 1); mask[ix(x, y)] = 1; }));
  halo(t, mask, CYAN, 0.45, 0.25, 3);
  bodyFinish(t);
}

export function paintLabSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 11, 0.9);
    if (y > 25) {
      o.r *= 0.6;
      o.g *= 0.6;
      o.b *= 0.62;
    }
  });
  const mask = newMask();
  // ekran: koyu cam + atom simgesi
  well(t, 5, 6, 22, 15, hex(0x07161d), 0.25);
  for (let k = 0; k < 3; k++) {
    const ang = (k * Math.PI) / 3;
    for (let a = 0; a < 40; a++) {
      const th = (a / 40) * Math.PI * 2;
      const ex = 16 + Math.cos(th) * 8.2 * Math.cos(ang) - Math.sin(th) * 3.2 * Math.sin(ang);
      const ey = 13.5 + Math.cos(th) * 8.2 * Math.sin(ang) + Math.sin(th) * 3.2 * Math.cos(ang);
      const px = Math.floor(ex);
      const py = Math.floor(ey);
      if (px >= 6 && px <= 26 && py >= 7 && py <= 20) {
        glow(t, px, py, CYAN, 0.8, 0.9);
        mask[ix(px, py)] = 1;
      }
    }
  }
  disc(16, 13.5, 1.8, (x, y) => { glow(t, x, y, [1, 0.9, 0.5], 1); mask[ix(x, y)] = 1; });
  // alt şerit: üç gösterge ışığı
  [[9, GREEN], [14, AMBER], [19, CYAN]].forEach((l) => {
    rect(l[0], 23, 3, 2, (x, y) => glow(t, x, y, l[1], 0.8, 0.95));
  });
  halo(t, mask, CYAN, 0.35, 0.18, 3);
  bodyFinish(t);
}

/* ------------------------------------------------------------------------------------------------
 * Güneş paneli
 * ---------------------------------------------------------------------------------------------- */
export function paintSolarTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    const cx = (x % 8);
    const cy = (y % 8);
    // 4x4 fotovoltaik hücre
    const n = fbm(x, y, 4, 4, 2, seed + 4);
    const edge = cx === 0 || cy === 0 || cx === 7 || cy === 7;
    if (edge) {
      setMix(o, hex(0x8a94a2), hex(0xc8d0da), 0.4 + n * 0.3);
      o.ro = 0.25;
      o.h = 0.7;
    } else {
      const g = 0.5 + 0.5 * Math.sin((x * 0.5 + y * 0.28) + n * 3);
      setMix(o, hex(0x0d1d4a), hex(0x2e5fd0), clamp(0.2 + n * 0.5 + g * 0.18));
      o.ro = 0.12;
      o.h = 0.4;
      o.e = 0.05 + g * 0.05;
      if (cy === 3 || cy === 4) { // ince ağ teli
        o.r *= 1.25;
        o.g *= 1.25;
        o.b *= 1.2;
      }
    }
  });
  // parlama şeridi
  line(2, 28, 26, 4, 1.2, (x, y, d) => over(t, x, y, 0.7, 0.85, 1, (1 - d / 1.2) * 0.18));
  const k = 0.82;
  for (let i = 0; i < N; i++) {
    shade(t, i, 0, k);
    shade(t, i, N - 1, k);
    shade(t, 0, i, k);
    shade(t, N - 1, i, k);
  }
  bevel(t, 1, 0.3, 0.12);
  t.bump = 0.9;
}

export function paintSolarSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 21, 0.85);
    if (y < 4) setMix(o, hex(0x0d1d4a), hex(0x2e5fd0), 0.4 + rnd(x, y, seed) * 0.2);
  });
  for (let x = 0; x < N; x += 8) shade(t, x, 12, 0.6);
  bevel(t, 1, 0.3, 0.14);
  t.bump = 0.9;
}

/* ------------------------------------------------------------------------------------------------
 * Yakıt jeneratörü
 * ---------------------------------------------------------------------------------------------- */
export function paintGeneratorTop(t, seed) {
  paintPixels(t, (x, y, o) => steelPixel(o, x, y, seed + 31, 0.9));
  // fan ızgarası
  disc(16, 16, 11, (x, y, d) => {
    if (d > 0.9) {
      put(t, x, y, 0.55, 0.58, 0.62, 1);
      setH(t, x, y, 0.85);
    } else {
      put(t, x, y, 0.05, 0.05, 0.06, 1);
      setH(t, x, y, 0.2);
    }
  });
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + 0.3;
    line(16, 16, 16 + Math.cos(a) * 9.5, 16 + Math.sin(a) * 9.5, 1.3, (x, y, d) => {
      put(t, x, y, 0.26 - d * 0.05, 0.28, 0.32, 1);
      setH(t, x, y, 0.55);
    });
  }
  disc(16, 16, 2.4, (x, y, d) => { put(t, x, y, 0.7 - d * 0.3, 0.72 - d * 0.3, 0.78 - d * 0.3, 1); setH(t, x, y, 0.9); });
  bodyFinish(t);
}

function paintGeneratorSideBase(t, seed, on) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 41, 0.9);
    if (y >= 26) { // tehlike şeridi
      const s = ((x + y) >> 2) & 1;
      setCol(o, s ? [0.95, 0.75, 0.1] : [0.12, 0.12, 0.13]);
      o.ro = 0.5;
    }
  });
  const mask = newMask();
  // havalandırma yarıkları
  for (let i = 0; i < 5; i++) {
    const y0 = 6 + i * 3;
    rect(6, y0, 14, 1, (x, y) => {
      if (on) {
        glow(t, x, y, AMBER, 0.85, 0.7 + rnd(x, y, seed) * 0.3);
        mask[ix(x, y)] = 1;
      } else {
        put(t, x, y, 0.04, 0.04, 0.05, 1);
        setH(t, x, y, 0.2);
      }
    });
  }
  // gösterge kadranı
  disc(24, 12, 4, (x, y, d) => {
    put(t, x, y, 0.1 + d * 0.15, 0.11 + d * 0.15, 0.13 + d * 0.15, 1);
    setH(t, x, y, 0.3 + d * 0.5);
  });
  line(24, 12, on ? 27 : 21, on ? 9.4 : 9.4, 0.5, (x, y) => glow(t, x, y, on ? AMBER : [0.8, 0.8, 0.8], on ? 0.9 : 0, 1));
  if (on) {
    halo(t, mask, AMBER, 0.5, 0.22, 3);
  }
  bodyFinish(t);
}
export const paintGeneratorSide = (t, seed) => paintGeneratorSideBase(t, seed, false);
export const paintGeneratorSideOn = (t, seed) => paintGeneratorSideBase(t, seed, true);

/* ------------------------------------------------------------------------------------------------
 * Pil bankası
 * ---------------------------------------------------------------------------------------------- */
export function paintBatteryTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 51, 0.8);
    setMix(o, hex(0x1b2a28), hex(0x3a5a52), clamp(vnoise(x, y, 4, 4, seed) * 0.6));
  });
  // iki kutup başı: kırmızı (+) ve siyah (−)
  [[10, 16, RED, '+'], [22, 16, [0.12, 0.12, 0.14], '-']].forEach((p) => {
    disc(p[0], p[1], 5, (x, y, d, nx, ny) => {
      const k = 0.6 + (1 - d) * 0.5 - (nx + ny) * 0.15;
      put(t, x, y, p[2][0] * k + 0.05, p[2][1] * k + 0.05, p[2][2] * k + 0.05, 1);
      setH(t, x, y, 0.85 - d * 0.1);
      setRo(t, x, y, 0.3);
    });
    line(p[0] - 2.2, p[1], p[0] + 2.2, p[1], 0.5, (x, y) => put(t, x, y, 0.95, 0.95, 0.95, 1));
    if (p[3] === '+') line(p[0], p[1] - 2.2, p[0], p[1] + 2.2, 0.5, (x, y) => put(t, x, y, 0.95, 0.95, 0.95, 1));
  });
  bodyFinish(t);
}
export function paintBatterySide(t, seed) {
  paintPixels(t, (x, y, o) => {
    setMix(o, hex(0x1b2a28), hex(0x3a5a52), clamp(0.3 + vnoise(x, y, 4, 8, seed + 2) * 0.5));
    o.ro = 0.45;
    o.h = 0.55;
    if (y % 8 === 0) { // hücre ayracı
      o.r *= 0.5;
      o.g *= 0.5;
      o.b *= 0.5;
      o.h = 0.35;
    }
  });
  const mask = newMask();
  // dolu şarj çubukları (yeşil → sarı): açıkça sayılabilen 5 segment
  for (let i = 0; i < 5; i++) {
    const y0 = 5 + i * 5;
    const c = i < 3 ? GREEN : i < 4 ? YELLOW : AMBER;
    rect(8, y0, 16, 3, (x, y) => {
      glow(t, x, y, c, 0.7, 0.9);
      mask[ix(x, y)] = 1;
    });
  }
  halo(t, mask, GREEN, 0.3, 0.12, 2);
  bodyFinish(t);
}

/* ------------------------------------------------------------------------------------------------
 * Kablo (kanal bloğu)
 * ---------------------------------------------------------------------------------------------- */
export function paintCable(t, seed) {
  paintPixels(t, (x, y, o) => {
    const rib = (y % 8) < 2;
    const n = fbm(x, y, 4, 4, 2, seed);
    setMix(o, hex(0x14171c), hex(0x2a3038), clamp(0.2 + n * 0.5 + (rib ? 0.2 : 0)));
    o.ro = 0.55;
    o.h = rib ? 0.75 : 0.5;
    // bakır tel şeridi (ortadan geçen)
    if (x >= 13 && x <= 18) {
      const v = (x === 15 || x === 16) ? 1.1 : 0.8;
      setCol(o, COPPER, v * (0.85 + n * 0.3));
      o.ro = 0.3;
      o.h = 0.7 + (x === 15 || x === 16 ? 0.12 : 0);
    }
    if (y >= 13 && y <= 18 && !(x >= 13 && x <= 18)) { // yatay şerit (her yüzde kablo yönü okunsun)
      const v = (y === 15 || y === 16) ? 1.05 : 0.75;
      setCol(o, COPPER, v * (0.8 + n * 0.3));
      o.ro = 0.3;
      o.h = 0.65;
    }
  });
  disc(16, 16, 3.2, (x, y, d) => {
    put(t, x, y, 0.72 * (1 - d * 0.35), 0.42 * (1 - d * 0.35), 0.2, 1);
    setH(t, x, y, 0.95);
    setRo(t, x, y, 0.28);
  });
  bevel(t, 2, 0.3, 0.12);
  t.bump = 1.0;
}

/* ------------------------------------------------------------------------------------------------
 * Elektrikli ocak
 * ---------------------------------------------------------------------------------------------- */
export function paintEFurnaceTop(t, seed) {
  paintPixels(t, (x, y, o) => steelPixel(o, x, y, seed + 61, 0.9));
  // cam-seramik ocak gözü: koyu halka + sarmal bobin
  disc(16, 16, 12, (x, y, d) => {
    put(t, x, y, 0.06 + d * 0.04, 0.06 + d * 0.04, 0.08 + d * 0.04, 1);
    setH(t, x, y, 0.35);
    setRo(t, x, y, 0.12);
  });
  for (let k = 0; k < 4; k++) {
    const r = 3 + k * 2.3;
    disc(16, 16, r + 0.7, (x, y, d) => {
      if (d > 1 - 0.55 / (r + 0.7)) {
        put(t, x, y, 0.5, 0.2, 0.15, 1);
        setH(t, x, y, 0.55);
      }
    });
  }
  bodyFinish(t);
}
function paintEFurnaceSideBase(t, seed, on) {
  paintPixels(t, (x, y, o) => steelPixel(o, x, y, seed + 71, 0.92));
  const mask = newMask();
  // fırın kapağı penceresi
  well(t, 6, 8, 20, 15, on ? hex(0x2a0f04) : hex(0x08080a), 0.25);
  rect(7, 9, 18, 13, (x, y, u, v) => {
    if (on) {
      const f = 0.55 + 0.45 * Math.sin(u * 6 + rnd(x, y, seed) * 2) * (1 - v * 0.6);
      glow(t, x, y, mixc([0.9, 0.25, 0.05], [1, 0.85, 0.35], clamp(f * (1 - v * 0.5))), 0.55 + f * 0.4, 1);
      mask[ix(x, y)] = 1;
    } else {
      const g = 0.04 + rnd(x, y, seed) * 0.03;
      put(t, x, y, g, g, g + 0.015, 1);
    }
  });
  // tutamak + düğmeler
  line(9, 6, 23, 6, 0.6, (x, y) => { put(t, x, y, 0.7, 0.72, 0.78, 1); setH(t, x, y, 0.9); });
  [10, 16, 22].forEach((cx) => disc(cx, 27, 1.6, (x, y, d) => { put(t, x, y, 0.5 - d * 0.2, 0.52 - d * 0.2, 0.58 - d * 0.2, 1); setH(t, x, y, 0.9); }));
  if (on) halo(t, mask, AMBER, 0.5, 0.2, 3);
  bodyFinish(t);
}
export const paintEFurnaceSide = (t, seed) => paintEFurnaceSideBase(t, seed, false);
export const paintEFurnaceSideOn = (t, seed) => paintEFurnaceSideBase(t, seed, true);

/* ------------------------------------------------------------------------------------------------
 * Otomatik madenci
 * ---------------------------------------------------------------------------------------------- */
export function paintDrillTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 81, 0.9);
    const d = Math.min(x, N - 1 - x, y, N - 1 - y);
    if (d < 4) { // tehlike çerçevesi
      const s = ((x + y) >> 2) & 1;
      setCol(o, s ? [0.95, 0.75, 0.1] : [0.12, 0.12, 0.13]);
      o.ro = 0.5;
    }
  });
  // merkez: aşağı oklar
  rect(9, 9, 14, 14, (x, y) => { put(t, x, y, 0.1, 0.11, 0.13, 1); setH(t, x, y, 0.3); });
  poly([[16, 21], [11, 14], [14, 14], [14, 10], [18, 10], [18, 14], [21, 14]], (x, y) => {
    put(t, x, y, YELLOW[0], YELLOW[1], YELLOW[2], 1);
    setH(t, x, y, 0.7);
  });
  t.bump = 1.1;
  bevel(t, 1, 0.35, 0.16);
}
export function paintDrillBottom(t, seed) {
  paintPixels(t, (x, y, o) => steelPixel(o, x, y, seed + 91, 0.7));
  // matkap ucu: dişli disk
  disc(16, 16, 13, (x, y, d) => {
    const ang = Math.atan2(y + 0.5 - 16, x + 0.5 - 16);
    const tooth = Math.abs(Math.sin(ang * 6 + d * 3)) > 0.35;
    const k = tooth ? 0.95 - d * 0.35 : 0.35;
    put(t, x, y, 0.62 * k + 0.05, 0.64 * k + 0.05, 0.7 * k + 0.06, 1);
    setH(t, x, y, tooth ? 0.8 : 0.35);
    setRo(t, x, y, 0.28);
  });
  disc(16, 16, 3, (x, y) => { put(t, x, y, 0.12, 0.12, 0.14, 1); setH(t, x, y, 0.2); });
  t.bump = 1.2;
}
function paintDrillSideBase(t, seed, on) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 101, 0.88);
    if (y < 4) {
      const s = ((x + y) >> 2) & 1;
      setCol(o, s ? [0.95, 0.75, 0.1] : [0.12, 0.12, 0.13]);
      o.ro = 0.5;
    }
  });
  const mask = newMask();
  // dişli simgesi
  disc(16, 17, 8, (x, y, d) => {
    const ang = Math.atan2(y + 0.5 - 17, x + 0.5 - 16);
    const tooth = Math.sin(ang * 8) > 0 ? 1 : 0.84;
    if (d <= tooth) {
      put(t, x, y, 0.2, 0.22, 0.26, 1);
      setH(t, x, y, 0.7);
    }
  });
  disc(16, 17, 3.2, (x, y) => { put(t, x, y, 0.05, 0.05, 0.06, 1); setH(t, x, y, 0.2); });
  // çalışma lambası
  disc(26, 9, 2.6, (x, y) => {
    if (on) {
      glow(t, x, y, YELLOW, 0.95, 1);
      mask[ix(x, y)] = 1;
    } else {
      put(t, x, y, 0.25, 0.22, 0.1, 1);
      setH(t, x, y, 0.6);
    }
  });
  if (on) halo(t, mask, YELLOW, 0.5, 0.25, 3);
  bodyFinish(t);
}
export const paintDrillSide = (t, seed) => paintDrillSideBase(t, seed, false);
export const paintDrillSideOn = (t, seed) => paintDrillSideBase(t, seed, true);

/* ------------------------------------------------------------------------------------------------
 * Lamba paneli
 * ---------------------------------------------------------------------------------------------- */
function paintLampBase(t, seed, on) {
  paintPixels(t, (x, y, o) => {
    const d = Math.min(x, N - 1 - x, y, N - 1 - y);
    if (d < 3) { // çerçeve
      steelPixel(o, x, y, seed, 0.95);
      return;
    }
    const n = fbm(x, y, 4, 4, 2, seed + 4);
    if (on) {
      setMix(o, hex(0xfff2c0), hex(0xffffff), clamp(0.5 + n * 0.5));
      o.e = 0.95;
      o.ro = 0.4;
    } else {
      setMix(o, hex(0x8a8e92), hex(0xb6bbc0), clamp(0.2 + n * 0.5));
      o.ro = 0.55;
    }
    o.h = 0.4;
    // difüzör çizgileri
    if ((x + 1) % 6 === 0 || (y + 1) % 6 === 0) {
      o.r *= on ? 0.95 : 0.72;
      o.g *= on ? 0.95 : 0.72;
      o.b *= on ? 0.95 : 0.72;
      o.h = 0.55;
    }
  });
  if (on) {
    const mask = newMask();
    for (let y = 3; y < N - 3; y++) for (let x = 3; x < N - 3; x++) mask[ix(x, y)] = 1;
    // kenarlara ışık sızıntısı
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const d = Math.min(x, N - 1 - x, y, N - 1 - y);
        if (d < 3) {
          over(t, x, y, 1, 0.95, 0.75, 0.3);
          maxE(t, x, y, 0.5 - d * 0.1);
        }
      }
    }
  }
  bevel(t, 2, 0.35, 0.14);
  t.bump = 0.9;
}
export const paintLamp = (t, seed) => paintLampBase(t, seed, false);
export const paintLampOn = (t, seed) => paintLampBase(t, seed, true);

/* ------------------------------------------------------------------------------------------------
 * Işınlanma platformu
 * ---------------------------------------------------------------------------------------------- */
function paintTeleporterTopBase(t, seed, on) {
  paintPixels(t, (x, y, o) => steelPixel(o, x, y, seed + 111, 0.75));
  const mask = newMask();
  const ringCol = on ? VIOLET : [0.34, 0.3, 0.5];
  // eş merkezli halkalar + 4 sembol yuvası
  [11.5, 8.2, 4.8].forEach((r, i) => {
    disc(16, 16, r, (x, y, d) => {
      if (d > 1 - 0.9 / r) {
        glow(t, x, y, ringCol, on ? 0.9 - i * 0.12 : 0.1, on ? 1 : 0.8);
        mask[ix(x, y)] = on ? 1 : 0;
        setH(t, x, y, 0.6);
      }
    });
  });
  disc(16, 16, 2.2, (x, y) => {
    glow(t, x, y, on ? [0.95, 0.9, 1] : [0.25, 0.22, 0.38], on ? 1 : 0.05, 1);
    mask[ix(x, y)] = on ? 1 : 0;
  });
  [[5, 5], [26, 5], [5, 26], [26, 26]].forEach((p) => {
    rect(p[0] - 1, p[1] - 1, 3, 3, (x, y) => {
      glow(t, x, y, on ? [0.8, 0.7, 1] : [0.2, 0.18, 0.3], on ? 0.8 : 0.05, 1);
      mask[ix(x, y)] = on ? 1 : 0;
    });
  });
  if (on) halo(t, mask, VIOLET, 0.45, 0.25, 3);
  bevel(t, 2, 0.4, 0.18);
  t.bump = 1.0;
}
export const paintTeleporterTop = (t, seed) => paintTeleporterTopBase(t, seed, false);
export const paintTeleporterTopOn = (t, seed) => paintTeleporterTopBase(t, seed, true);
export function paintTeleporterSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 121, 0.85);
    if (y >= 12 && y <= 17) { // mor şerit
      setMix(o, hex(0x2a1a50), hex(0x6a4ad0), 0.4 + rnd(x, y, seed) * 0.3);
      o.e = 0.25;
    }
  });
  bevel(t, 2, 0.35, 0.16);
  t.bump = 1.0;
}

/* ------------------------------------------------------------------------------------------------
 * Asansör platformu
 * ---------------------------------------------------------------------------------------------- */
export function paintLiftTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 131, 0.85);
    const d = Math.min(x, N - 1 - x, y, N - 1 - y);
    if (d < 3) {
      const s = ((x + y) >> 2) & 1;
      setCol(o, s ? [0.95, 0.75, 0.1] : [0.12, 0.12, 0.13]);
      o.ro = 0.5;
    }
  });
  const mask = newMask();
  // yukarı ve aşağı ok
  poly([[16, 6], [22, 14], [18, 14], [18, 16], [14, 16], [14, 14], [10, 14]], (x, y) => {
    glow(t, x, y, CYAN, 0.7, 0.95);
    mask[ix(x, y)] = 1;
  });
  poly([[16, 26], [22, 18], [18, 18], [18, 16], [14, 16], [14, 18], [10, 18]], (x, y) => {
    glow(t, x, y, AMBER, 0.7, 0.95);
    mask[ix(x, y)] = 1;
  });
  halo(t, mask, CYAN, 0.25, 0.1, 2);
  bevel(t, 1, 0.35, 0.16);
  t.bump = 1.0;
}
export function paintLiftSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    steelPixel(o, x, y, seed + 141, 0.85);
    if (x % 8 < 2) { // dikey ray
      o.r *= 0.55;
      o.g *= 0.55;
      o.b *= 0.58;
      o.h = 0.35;
    }
  });
  bevel(t, 1, 0.3, 0.14);
  t.bump = 1.0;
}

/* ------------------------------------------------------------------------------------------------
 * Güç kapısı
 * ---------------------------------------------------------------------------------------------- */
export function paintPowerDoor(t, seed) {
  paintPixels(t, (x, y, o) => steelPixel(o, x, y, seed + 151, 0.8));
  const mask = newMask();
  // çift kanat çizgisi + merkezde kilit
  for (let y = 0; y < N; y++) {
    shade(t, 15, y, 0.5);
    shade(t, 16, y, 0.5);
    addH(t, 15, y, -0.3);
    addH(t, 16, y, -0.3);
  }
  // üst-alt tehlike şeridi
  [[0, 3], [N - 3, 3]].forEach((b) => {
    rect(0, b[0], N, b[1], (x, y) => {
      const s = ((x + y) >> 2) & 1;
      put(t, x, y, s ? 0.95 : 0.12, s ? 0.75 : 0.12, s ? 0.1 : 0.13, 1);
      setRo(t, x, y, 0.5);
    });
  });
  // kırmızı ışıklar (kapalı)
  [[8, 10], [8, 22], [23, 10], [23, 22]].forEach((p) => {
    disc(p[0], p[1], 2, (x, y) => { glow(t, x, y, RED, 0.9, 1); mask[ix(x, y)] = 1; });
  });
  halo(t, mask, RED, 0.45, 0.2, 3);
  bodyFinish(t);
}
export function paintPowerDoorOpen(t, seed) {
  clearSprite(t);
  const mask = newMask();
  // yalnız çerçeve: 4 px kalın çelik, içi boş (geçit); iç kenarda yeşil şerit
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < 4) {
        const o = { r: 0, g: 0, b: 0, h: 0, ro: 0 };
        steelPixel(o, x, y, seed + 161, 0.85);
        put(t, x, y, o.r, o.g, o.b, 1);
        setH(t, x, y, o.h);
        setRo(t, x, y, o.ro);
        setTm(t, x, y, 0);
        if (d === 3) {
          glow(t, x, y, GREEN, 0.8, 1);
          mask[ix(x, y)] = 1;
        }
      }
    }
  }
  // kanatlar kenarlara çekilmiş: iki yanda dar levha
  rect(0, 4, 3, N - 8, (x, y) => { put(t, x, y, 0.2, 0.23, 0.28, 1); setH(t, x, y, 0.6); });
  halo(t, mask, GREEN, 0.3, 0.1, 2);
  for (let i = 0; i < N * N; i++) if (t.c[i * 4 + 3] < 0.02 && t.e[i] > 0.05) t.c[i * 4 + 3] = clamp(t.e[i] * 0.4);
  t.bump = 1.0;
}

/* ------------------------------------------------------------------------------------------------
 * Düğme ve sensör (sprite)
 * ---------------------------------------------------------------------------------------------- */
function paintButtonBase(t, seed, on) {
  clearSprite(t);
  const mask = newMask();
  rect(8, 20, 16, 12, (x, y, u, v) => {
    const g = rnd(x, y, seed) * 0.1;
    const k = 0.42 + g + (1 - v) * 0.12;
    put(t, x, y, k, k * 1.03, k * 1.1, 1);
    setH(t, x, y, 0.6 + (1 - v) * 0.15);
    setRo(t, x, y, 0.5);
  });
  rivet(t, 10.5, 22.5);
  rivet(t, 21.5, 22.5);
  const c = on ? GREEN : RED;
  disc(16, on ? 25 : 23, 4.6, (x, y, d, nx, ny) => {
    const k = (on ? 0.85 : 0.65) + (1 - d) * 0.35 - (nx + ny) * 0.12;
    put(t, x, y, c[0] * k, c[1] * k, c[2] * k, 1);
    setH(t, x, y, on ? 0.7 : 0.95);
    setRo(t, x, y, 0.2);
    if (on) {
      setE(t, x, y, 0.9);
      mask[ix(x, y)] = 1;
    }
  });
  put(t, 14, on ? 23 : 21, 1, 1, 1, 1);
  if (on) {
    halo(t, mask, GREEN, 0.7, 0.45, 4);
    for (let i = 0; i < N * N; i++) if (t.c[i * 4 + 3] < 0.02 && t.e[i] > 0.05) t.c[i * 4 + 3] = clamp(t.e[i] * 0.5);
  }
  t.bump = 1.0;
}
export const paintButton = (t, seed) => paintButtonBase(t, seed, false);
export const paintButtonOn = (t, seed) => paintButtonBase(t, seed, true);

function paintSensorBase(t, seed, on) {
  clearSprite(t);
  const mask = newMask();
  // taban + gövde kubbesi
  rect(10, 24, 12, 8, (x, y, u, v) => {
    const k = 0.4 + (1 - v) * 0.15 + rnd(x, y, seed) * 0.06;
    put(t, x, y, k, k * 1.02, k * 1.08, 1);
    setH(t, x, y, 0.6);
    setRo(t, x, y, 0.5);
  });
  disc(16, 19, 8, (x, y, d, nx, ny) => {
    if (y > 24) return;
    const k = 0.55 + (1 - d) * 0.4 - (nx * 0.3 + ny * 0.3);
    put(t, x, y, 0.42 * k + 0.1, 0.45 * k + 0.1, 0.5 * k + 0.1, 1);
    setH(t, x, y, 0.5 + (1 - d) * 0.4);
    setRo(t, x, y, 0.3);
  });
  // mercek
  disc(16, 18, 4, (x, y, d) => {
    if (on) {
      glow(t, x, y, mixc(GREEN, [0.9, 1, 0.9], 1 - d), 0.9, 1);
      mask[ix(x, y)] = 1;
    } else {
      const k = 0.1 + (1 - d) * 0.15;
      put(t, x, y, k * 0.6, k * 0.7, k, 1);
      setH(t, x, y, 0.25);
      setRo(t, x, y, 0.1);
    }
  });
  put(t, 14, 16, 1, 1, 1, 1);
  if (on) {
    halo(t, mask, GREEN, 0.7, 0.45, 4);
    for (let i = 0; i < N * N; i++) if (t.c[i * 4 + 3] < 0.02 && t.e[i] > 0.05) t.c[i * 4 + 3] = clamp(t.e[i] * 0.5);
  }
  t.bump = 1.0;
}
export const paintSensor = (t, seed) => paintSensorBase(t, seed, false);
export const paintSensorOn = (t, seed) => paintSensorBase(t, seed, true);

/* ------------------------------------------------------------------------------------------------
 * Şarj istasyonu
 * ---------------------------------------------------------------------------------------------- */
function paintChargerTopBase(t, seed, on) {
  paintPixels(t, (x, y, o) => steelPixel(o, x, y, seed + 171, 0.85));
  const mask = newMask();
  disc(16, 16, 11.5, (x, y, d) => {
    put(t, x, y, 0.07 + d * 0.05, 0.09 + d * 0.05, 0.12 + d * 0.05, 1);
    setH(t, x, y, 0.3);
    setRo(t, x, y, 0.15);
  });
  const c = on ? CYAN : [0.2, 0.34, 0.4];
  disc(16, 16, 11.5, (x, y, d) => {
    if (d > 0.9) {
      glow(t, x, y, c, on ? 0.85 : 0.08, 1);
      mask[ix(x, y)] = on ? 1 : 0;
    }
  });
  // yıldırım
  poly([[18, 6], [11, 17], [15, 17], [13, 26], [21, 14], [17, 14]], (x, y) => {
    glow(t, x, y, on ? [1, 0.95, 0.5] : [0.3, 0.3, 0.2], on ? 1 : 0.05, 1);
    mask[ix(x, y)] = on ? 1 : 0;
  });
  if (on) halo(t, mask, CYAN, 0.45, 0.22, 3);
  bodyFinish(t);
}
export const paintChargerTop = (t, seed) => paintChargerTopBase(t, seed, false);
export const paintChargerTopOn = (t, seed) => paintChargerTopBase(t, seed, true);
function paintChargerSideBase(t, seed, on) {
  paintPixels(t, (x, y, o) => steelPixel(o, x, y, seed + 181, 0.9));
  const mask = newMask();
  // kablo girişleri
  [9, 23].forEach((cx) => {
    disc(cx, 22, 3, (x, y) => { put(t, x, y, 0.04, 0.04, 0.05, 1); setH(t, x, y, 0.2); });
    disc(cx, 22, 3.8, (x, y, d) => { if (d > 0.8) { put(t, x, y, COPPER[0], COPPER[1], COPPER[2], 1); setH(t, x, y, 0.8); } });
  });
  // doluluk ışığı (4 segment)
  for (let i = 0; i < 4; i++) {
    rect(6 + i * 5, 7, 4, 6, (x, y) => {
      if (on) {
        glow(t, x, y, i < 3 ? CYAN : [0.7, 1, 1], 0.8, 1);
        mask[ix(x, y)] = 1;
      } else {
        put(t, x, y, 0.1, 0.15, 0.18, 1);
        setH(t, x, y, 0.3);
      }
    });
  }
  if (on) halo(t, mask, CYAN, 0.4, 0.2, 3);
  bodyFinish(t);
}
export const paintChargerSide = (t, seed) => paintChargerSideBase(t, seed, false);
export const paintChargerSideOn = (t, seed) => paintChargerSideBase(t, seed, true);

/** atlas.js kayıt defterine yayılır. */
export const TECH_PAINTERS = {
  laboratuvar_üst: paintLabTop,
  laboratuvar_yan: paintLabSide,
  güneş_üst: paintSolarTop,
  güneş_yan: paintSolarSide,
  jeneratör_üst: paintGeneratorTop,
  jeneratör_yan: paintGeneratorSide,
  jeneratör_yan_etkin: paintGeneratorSideOn,
  pil_üst: paintBatteryTop,
  pil_yan: paintBatterySide,
  kablo: paintCable,
  elektrikli_ocak_üst: paintEFurnaceTop,
  elektrikli_ocak_yan: paintEFurnaceSide,
  elektrikli_ocak_yan_etkin: paintEFurnaceSideOn,
  matkap_üst: paintDrillTop,
  matkap_alt: paintDrillBottom,
  matkap_yan: paintDrillSide,
  matkap_yan_etkin: paintDrillSideOn,
  lamba: paintLamp,
  lamba_etkin: paintLampOn,
  ışınlayıcı_üst: paintTeleporterTop,
  ışınlayıcı_üst_etkin: paintTeleporterTopOn,
  ışınlayıcı_yan: paintTeleporterSide,
  asansör_üst: paintLiftTop,
  asansör_yan: paintLiftSide,
  güç_kapısı: paintPowerDoor,
  güç_kapısı_açık: paintPowerDoorOpen,
  düğme: paintButton,
  düğme_açık: paintButtonOn,
  sensör: paintSensor,
  sensör_etkin: paintSensorOn,
  şarj_üst: paintChargerTop,
  şarj_üst_etkin: paintChargerTopOn,
  şarj_yan: paintChargerSide,
  şarj_yan_etkin: paintChargerSideOn,
};
