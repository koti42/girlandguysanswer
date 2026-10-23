/*
 * KEŞİF render — ağaç devirme genişletmesi dokuları (sim/treeData.js): dört fidan (meşe, huş, çam, akasya).
 * `TREE_PAINTERS` atlas.js kayıt defterine yayılır (ad → (tile, seed) boyayıcı). Belirlenimci ve saf (canvas yok).
 * Fidanlar çapraz bitki sprite'ıdır: alfa=0 zeminde ince gövde + türe özgü taç; taç biyom tonu alır (tm=1), gövde almaz.
 */
import {
  N, ihash, clamp, hex, lerp, put, setH, setRo, setTm, disc, ellipse, setSpriteClip,
} from './atlasKit.js';

function clearSprite(t) {
  setSpriteClip(true);
  for (let i = 0; i < N * N; i++) {
    t.c[i * 4 + 3] = 0;
    t.h[i] = 0.5;
    t.ro[i] = 0.85;
    t.tm[i] = 1;
  }
}

function trunk(t, x, y0, y1, w, col0, col1) {
  for (let y = Math.floor(y1); y <= Math.floor(y0); y++) {
    const k = clamp((y - y1) / Math.max(1, y0 - y1));
    const c = [lerp(col1[0], col0[0], k), lerp(col1[1], col0[1], k), lerp(col1[2], col0[2], k)];
    for (let dx = 0; dx < w; dx++) {
      const px = Math.floor(x) + dx - (w >> 1);
      const sh = dx === 0 ? 1.06 : dx === w - 1 ? 0.8 : 0.94;
      put(t, px, y, c[0] * sh, c[1] * sh, c[2] * sh, 1);
      setH(t, px, y, 0.62 + (dx === 0 ? 0.06 : 0));
      setTm(t, px, y, 0);
      setRo(t, px, y, 0.8);
    }
  }
}

/** Yaprak topağı: yumuşak parlak üst, koyu alt. */
function leafBlob(t, cx, cy, rx, ry, seed, tone) {
  ellipse(cx, cy, rx, ry, (x, y, d, nx, ny) => {
    const h = ihash(x, y, seed);
    const speck = ((h & 15) / 15 - 0.5) * 0.18;
    const sh = clamp(tone * (0.84 + (1 - d) * 0.2 - ny * 0.16 + speck), 0, 1.2);
    put(t, x, y, sh * 1.02, sh, sh * 0.86, 1);
    setH(t, x, y, 0.55 + (1 - d) * 0.3);
    setTm(t, x, y, 1);
    setRo(t, x, y, 0.8);
  });
}

function sapOak(t, seed) {
  clearSprite(t);
  const bark = [hex(0x70533a), hex(0x4a3524)];
  trunk(t, 16, 31, 17, 2, bark[0], bark[1]);
  leafBlob(t, 16, 12, 8.2, 6.4, seed + 1, 0.86);
  leafBlob(t, 10.5, 16, 4.6, 3.6, seed + 2, 0.74);
  leafBlob(t, 21.5, 15.5, 4.8, 3.8, seed + 3, 0.78);
  leafBlob(t, 15, 7.2, 4.4, 3.2, seed + 4, 0.96);
  t.bump = 1.0;
}

function sapBirch(t, seed) {
  clearSprite(t);
  const bark = [hex(0xf0ece0), hex(0xcfc9b8)];
  trunk(t, 16, 31, 12, 2, bark[0], bark[1]);
  for (let y = 15; y < 31; y += 4) {
    const k = ihash(y, 3, seed);
    put(t, 15 + (k & 1), y, 0.14, 0.13, 0.12, 1);
    setTm(t, 15 + (k & 1), y, 0);
  }
  leafBlob(t, 16, 9, 6.4, 6.8, seed + 5, 0.98);
  leafBlob(t, 11.5, 13.5, 3.8, 3.2, seed + 6, 0.88);
  leafBlob(t, 20.5, 13, 3.8, 3.4, seed + 7, 0.9);
  t.bump = 1.0;
}

function sapPine(t, seed) {
  clearSprite(t);
  const bark = [hex(0x8a5a3c), hex(0x4a2d20)];
  trunk(t, 16, 31, 24, 2, bark[0], bark[1]);
  const tiers = [[26, 9.2], [20.5, 7.4], [15, 5.6], [9.6, 3.8], [4.6, 2.2]];
  tiers.forEach((row, i) => {
    const cy = row[0];
    const w = row[1];
    const tone = 0.62 + i * 0.07;
    for (let y = Math.floor(cy - 3); y <= Math.floor(cy + 2); y++) {
      const k = clamp((y - (cy - 3)) / 5);
      const half = w * (0.2 + k * 0.8);
      for (let x = Math.floor(16 - half); x <= Math.floor(16 + half - 0.01); x++) {
        const h = ihash(x, y, seed + i);
        const sh = tone * (0.8 + k * 0.1 + ((h & 7) / 7 - 0.5) * 0.2 - (x < 16 ? 0 : 0.05));
        put(t, x, y, sh * 0.8, sh, sh * 0.78, 1);
        setH(t, x, y, 0.5 + (1 - Math.abs(x + 0.5 - 16) / (half + 0.5)) * 0.3);
        setTm(t, x, y, 1);
      }
    }
  });
  t.bump = 1.0;
}

function sapAcacia(t, seed) {
  clearSprite(t);
  const bark = [hex(0x8d7a68), hex(0x4e4238)];
  trunk(t, 17, 31, 17, 2, bark[0], bark[1]);
  trunk(t, 14, 22, 15, 2, bark[0], bark[1]);
  disc(15, 14.5, 1.2, (x, y) => {
    put(t, x, y, bark[0][0], bark[0][1], bark[0][2], 1);
    setTm(t, x, y, 0);
  });
  leafBlob(t, 14.5, 11.2, 11, 3.6, seed + 8, 0.9);
  leafBlob(t, 14.5, 8.4, 6.6, 2.4, seed + 9, 1.0);
  leafBlob(t, 7.5, 13, 3.4, 1.9, seed + 10, 0.74);
  leafBlob(t, 22.5, 13, 3.2, 1.8, seed + 11, 0.78);
  t.bump = 1.0;
}

export const TREE_PAINTERS = Object.freeze({
  fidan_meşe: sapOak,
  fidan_huş: sapBirch,
  fidan_çam: sapPine,
  fidan_akasya: sapAcacia,
});
