/*
 * KEŞİF render — maden dokuları (cevherler, kristaller, ametist). Taş zemin atlasTilesTerrain.stonePixel ile aynıdır.
 */
import {
  N, rnd, ihash, vnoise, hex, clamp, paintPixels, put, over, setH, addH, setE, maxE, setRo, setAo, setTm, disc,
  line, poly, regularPoly, strSeed, ix,
} from './atlasKit.js';
import { stonePixel } from './atlasTilesTerrain.js';

const SEED_STONE = strSeed('taş');

/** Işıldayan kristal kümesi parçası: dikey altıgen prizma görünümü. */
export function crystalShard(t, cx, cy, len, wid, ang, pal, emit) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  // prizma: taban genişliği wid, uç sivri
  const bx = cx - sa * 0; // taban merkez
  const by = cy;
  const tipX = bx + ca * 0 + Math.sin(ang) * len;
  const tipY = by - Math.cos(ang) * len;
  const px = Math.cos(ang) * wid;
  const py = Math.sin(ang) * wid;
  const shoulderX = bx + (tipX - bx) * 0.75;
  const shoulderY = by + (tipY - by) * 0.75;
  const pts = [
    [bx - px, by - py],
    [shoulderX - px * 0.92, shoulderY - py * 0.92],
    [tipX, tipY],
    [shoulderX + px * 0.92, shoulderY + py * 0.92],
    [bx + px, by + py],
  ];
  poly(pts, (x, y, d) => {
    // yüz: tabana göre yan konum
    const rx = x + 0.5 - bx;
    const ry = y + 0.5 - by;
    const side = (rx * px + ry * py) / (wid * wid);
    let c;
    if (side < -0.34) c = pal.light;
    else if (side < 0.2) c = pal.mid;
    else c = pal.dark;
    const k = d < 0.9 ? 0.78 : 1;
    put(t, x, y, c[0] * k, c[1] * k, c[2] * k, 1);
    setH(t, x, y, 0.75 + Math.min(d, 2) * 0.08);
    setRo(t, x, y, 0.12);
    maxE(t, x, y, emit * (0.5 + 0.5 * (side < 0.2 ? 1 : 0.55)));
    setTm(t, x, y, 0);
    setAo(t, x, y, 1);
  });
  // iç parlak çekirdek çizgisi
  line(bx, by - 1, tipX * 0.2 + bx * 0.8, tipY * 0.2 + by * 0.8 + 1, 0.45, (x, y) => {
    over(t, x, y, pal.core[0], pal.core[1], pal.core[2], 0.7);
    maxE(t, x, y, Math.min(1, emit * 1.4));
  });
}

export function paintCrystalRock(t, seed) {
  paintPixels(t, (x, y, o) =>
    stonePixel(o, x, y, seed, {
      dark: hex(0x2f3350), light: hex(0x6a6f96), warm: hex(0x59508a), strata: 0.05,
    }));
  const pal = {
    light: hex(0xa8fff2), mid: hex(0x5be0e0), dark: hex(0x2a8fc4), core: hex(0xeaffff),
  };
  const pal2 = {
    light: hex(0xe6b8ff), mid: hex(0xb06cf5), dark: hex(0x6a3ab8), core: hex(0xfff2ff),
  };
  const spots = [
    [8, 26, 8, 2.2, -0.15, pal], [14, 29, 6, 1.6, 0.4, pal2], [22, 27, 10, 2.4, 0.18, pal2],
    [27, 18, 6, 1.6, 0.5, pal], [5, 12, 5, 1.5, -0.35, pal2], [18, 11, 5, 1.4, 0.05, pal],
  ];
  // Işıma halesi
  for (let s = 0; s < spots.length; s++) {
    const sp = spots[s];
    disc(sp[0], sp[1] - sp[2] * 0.5, sp[2] * 1.1, (x, y, d) => {
      maxE(t, x, y, 0.25 * (1 - d));
      over(t, x, y, sp[5].mid[0], sp[5].mid[1], sp[5].mid[2], 0.18 * (1 - d));
    });
  }
  for (let s = 0; s < spots.length; s++) {
    const sp = spots[s];
    crystalShard(t, sp[0], sp[1], sp[2], sp[3], sp[4], sp[5], 0.75);
  }
  t.bump = 1.2;
}

/* ------------------------------------------------------------------------------------------------
 * Madenler
 * ---------------------------------------------------------------------------------------------- */
function stoneBase(t) {
  paintPixels(t, (x, y, o) => stonePixel(o, x, y, SEED_STONE));
  t.bump = 1.15;
}

/** Düzensiz damar kütleleri maskesi (0..1) — deterministik. */
function blobMask(seed, count, rMin, rMax) {
  const m = new Float32Array(N * N);
  for (let i = 0; i < count; i++) {
    const h = ihash(i, 5, seed);
    const cx = h & 31;
    const cy = (h >>> 5) & 31;
    const r = rMin + (((h >>> 10) & 255) / 255) * (rMax - rMin);
    disc(cx, cy, r + 1, (x, y, d) => {
      const nz = vnoise(x, y, 8, 8, seed + i) * 0.55 + 0.45;
      const v = clamp((1 - d * (1.1 / nz)) * 3);
      const idx = ix(x, y);
      if (v > m[idx]) m[idx] = v;
    });
  }
  return m;
}

function gem(t, cx, cy, rw, rh, pal, emit, hexa) {
  const pts = hexa
    ? regularPoly(cx, cy, rw, 6, Math.PI / 6)
    : [[cx, cy - rh], [cx + rw, cy], [cx, cy + rh], [cx - rw, cy]];
  poly(pts, (x, y, d) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    let c;
    if (dx < 0 && dy < 0) c = pal.light;
    else if (dx >= 0 && dy < 0) c = pal.mid;
    else if (dx < 0) c = pal.mid2;
    else c = pal.dark;
    if (d < 0.85) c = pal.edge;
    put(t, x, y, c[0], c[1], c[2], 1);
    setH(t, x, y, 0.7 + Math.min(d, 1.5) * 0.1);
    setRo(t, x, y, 0.12);
    setE(t, x, y, emit);
    setTm(t, x, y, 0);
  });
  const sx = Math.round(cx - rw * 0.35);
  const sy = Math.round(cy - rh * 0.45);
  put(t, sx, sy, 1, 1, 1, 1);
  setE(t, sx, sy, Math.min(1, emit + 0.4));
}

export function paintOre(t, seed, kind) {
  stoneBase(t);
  const s = seed;
  switch (kind) {
    case 'kömür': {
      const m = blobMask(s, 6, 2.2, 3.4);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const v = m[y * N + x];
          if (v <= 0.15) continue;
          const nz = rnd(x, y, s + 1);
          const c = 0.07 + nz * 0.09;
          over(t, x, y, c * 0.95, c, c * 1.15, clamp(v * 1.4));
          addH(t, x, y, 0.28 * v);
          setRo(t, x, y, 0.35);
          if (rnd(x, y, s + 5) > 0.93) over(t, x, y, 0.5, 0.52, 0.6, 0.8);
        }
      }
      break;
    }
    case 'bakır': {
      const m = blobMask(s, 6, 2, 3.2);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const v = m[y * N + x];
          if (v <= 0.15) continue;
          const nz = rnd(x, y, s + 1);
          const patina = vnoise(x, y, 8, 8, s + 3) > 0.62;
          if (patina) over(t, x, y, 0.2 + nz * 0.1, 0.68 + nz * 0.12, 0.58, clamp(v * 1.3));
          else over(t, x, y, 0.82 + nz * 0.12, 0.42 + nz * 0.1, 0.18, clamp(v * 1.3));
          addH(t, x, y, 0.22 * v);
          setRo(t, x, y, 0.38);
          if (rnd(x, y, s + 5) > 0.95) over(t, x, y, 1, 0.78, 0.55, 0.7);
        }
      }
      break;
    }
    case 'demir': {
      const m = blobMask(s, 7, 1.8, 3);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const v = m[y * N + x];
          if (v <= 0.15) continue;
          const nz = rnd(x, y, s + 1);
          over(t, x, y, 0.86 + nz * 0.08, 0.64 + nz * 0.08, 0.52 + nz * 0.06, clamp(v * 1.3));
          addH(t, x, y, 0.2 * v);
          setRo(t, x, y, 0.5);
          if (rnd(x, y, s + 5) > 0.92) over(t, x, y, 0.5, 0.26, 0.16, 0.8);
        }
      }
      break;
    }
    case 'altın': {
      const m = blobMask(s, 6, 1.8, 3);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const v = m[y * N + x];
          if (v <= 0.15) continue;
          const nz = rnd(x, y, s + 1);
          const dome = v;
          over(t, x, y, 1, 0.78 + nz * 0.14 + dome * 0.05, 0.12 + nz * 0.12, clamp(v * 1.4));
          addH(t, x, y, 0.3 * v);
          setRo(t, x, y, 0.22);
          setE(t, x, y, 0.1 + nz * 0.08);
          if (rnd(x, y, s + 5) > 0.93) {
            over(t, x, y, 1, 1, 0.8, 0.9);
            setE(t, x, y, 0.5);
          }
        }
      }
      break;
    }
    case 'elmas': {
      const pal = {
        light: hex(0xcafffb), mid: hex(0x5ef2e8), mid2: hex(0x36cbcf), dark: hex(0x1e8a9e), edge: hex(0x167080),
      };
      gem(t, 9, 9, 4, 5, pal, 0.25);
      gem(t, 22, 12, 3, 4, pal, 0.25);
      gem(t, 13, 23, 3.4, 4.2, pal, 0.25);
      gem(t, 26, 26, 2.2, 2.8, pal, 0.25);
      break;
    }
    case 'zümrüt': {
      const pal = {
        light: hex(0xb4ffca), mid: hex(0x3fdc78), mid2: hex(0x24ad54), dark: hex(0x137a3a), edge: hex(0x0d5c2b),
      };
      gem(t, 9, 10, 4.2, 4.2, pal, 0.2, true);
      gem(t, 23, 9, 3.2, 3.2, pal, 0.2, true);
      gem(t, 15, 23, 4, 4, pal, 0.2, true);
      gem(t, 27, 25, 2.4, 2.4, pal, 0.2, true);
      break;
    }
    case 'kuantum': {
      const pal = {
        light: hex(0xc9f7ff), mid: hex(0x7a8cff), dark: hex(0x6a2fd0), core: hex(0xffffff),
      };
      const pal2 = {
        light: hex(0xf0c2ff), mid: hex(0xc060ff), dark: hex(0x5a22b0), core: hex(0xfff0ff),
      };
      const spots = [[9, 26, 9, 2.2, -0.1, pal], [16, 28, 7, 1.7, 0.45, pal2], [22, 26, 11, 2.5, 0.12, pal],
        [27, 20, 6, 1.6, 0.55, pal2], [5, 17, 6, 1.6, -0.4, pal2], [14, 15, 5, 1.4, 0.2, pal]];
      for (let i = 0; i < spots.length; i++) {
        const sp = spots[i];
        disc(sp[0], sp[1] - sp[2] * 0.5, sp[2] * 1.3, (x, y, d) => {
          maxE(t, x, y, 0.55 * (1 - d) * (1 - d));
          over(t, x, y, 0.55, 0.45, 1, 0.3 * (1 - d));
        });
      }
      for (let i = 0; i < spots.length; i++) {
        const sp = spots[i];
        crystalShard(t, sp[0], sp[1], sp[2], sp[3], sp[4], sp[5], 0.95);
      }
      // ışıltı yıldızları
      for (let i = 0; i < 5; i++) {
        const hh = ihash(i, 8, s);
        const x = hh & 31;
        const y = (hh >>> 5) & 31;
        put(t, x, y, 1, 1, 1, 1);
        maxE(t, x, y, 1);
        over(t, x + 1, y, 0.8, 0.9, 1, 0.6);
        over(t, x - 1, y, 0.8, 0.9, 1, 0.6);
        over(t, x, y + 1, 0.8, 0.9, 1, 0.6);
        over(t, x, y - 1, 0.8, 0.9, 1, 0.6);
      }
      break;
    }
    case 'kızıltaş': {
      const patch = blobMask(s, 5, 2.5, 4);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const v = patch[y * N + x];
          if (v > 0.1) {
            over(t, x, y, 0.42, 0.1, 0.1, v * 0.55);
            maxE(t, x, y, v * 0.18);
          }
        }
      }
      for (let i = 0; i < 26; i++) {
        const hh = ihash(i, 9, s);
        const x = hh & 31;
        const y = (hh >>> 5) & 31;
        const big = (hh >>> 12) & 1;
        const pts = big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]];
        for (let k = 0; k < pts.length; k++) {
          const hot = 0.85 + rnd(i, k, s) * 0.15;
          put(t, x + pts[k][0], y + pts[k][1], hot, 0.1 + rnd(x, y, s) * 0.12, 0.08, 1);
          maxE(t, x + pts[k][0], y + pts[k][1], 0.75);
          setRo(t, x + pts[k][0], y + pts[k][1], 0.5);
          addH(t, x + pts[k][0], y + pts[k][1], 0.15);
        }
      }
      break;
    }
    default:
      break;
  }
}

/** Ametist kümesi (tüm yüzey kristal). */
export function paintAmethyst(t, seed) {
  paintPixels(t, (x, y, o) =>
    stonePixel(o, x, y, seed, { dark: hex(0x2a1d45), light: hex(0x5a4486), warm: hex(0x4a3470), strata: 0.04 }));
  const p1 = { light: hex(0xf3c8ff), mid: hex(0xc47cff), dark: hex(0x7a3ec6), core: hex(0xffffff) };
  const p2 = { light: hex(0xe6a8ff), mid: hex(0xa65af0), dark: hex(0x5e2aa8), core: hex(0xf6e0ff) };
  const shards = [
    [6, 31, 14, 2.6, -0.38, p2], [26, 31, 15, 2.8, 0.34, p2], [16, 31, 20, 3.4, 0.0, p1],
    [11, 31, 12, 2.4, -0.16, p1], [21, 31, 13, 2.6, 0.17, p1], [3, 31, 8, 1.8, -0.55, p1], [29, 31, 9, 2, 0.5, p1],
  ];
  for (let i = 0; i < shards.length; i++) {
    const sp = shards[i];
    disc(sp[0] + Math.sin(sp[4]) * sp[2] * 0.4, sp[1] - sp[2] * 0.55, sp[2] * 0.9, (x, y, d) => {
      maxE(t, x, y, 0.2 * (1 - d));
    });
  }
  for (let i = 0; i < shards.length; i++) {
    const sp = shards[i];
    crystalShard(t, sp[0], sp[1], sp[2], sp[3], sp[4], sp[5], 0.55);
  }
  t.bump = 1.3;
}
