/*
 * KEŞİF render — üretim genişletmesi dokuları (sim/craftData.js): taş kesici, dokuma tezgahı, merdiven.
 * Yeni blokların basamak/plaka türevleri mevcut dokuları (tahta, tuğla, kumtaşı, kırıktaş) yeniden kullanır.
 * `CRAFT_PAINTERS` atlas.js kayıt defterine yayılır (ad → (tile, seed) boyayıcı).
 */
import {
  N, rnd, vnoise, hex, clamp, paintPixels, setMix, put, over, setH, setRo, setTm, disc, rect, bevel,
} from './atlasKit.js';
import { stonePixel } from './atlasTilesTerrain.js';

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

function wood(o, x, y, seed, dark, light, horizontal) {
  const gx = horizontal ? x : y;
  const gy = horizontal ? y : x;
  const grain = vnoise(gx, gy, 3, 18, seed) * 0.6 + vnoise(gx, gy, 6, 34, seed + 2) * 0.4;
  setMix(o, dark, light, clamp(0.2 + grain * 0.7 + (rnd(x, y, seed + 4) - 0.5) * 0.1));
  o.h = 0.55 + grain * 0.15;
  o.ro = 0.8;
}

const STONE = { dark: hex(0x6a6d72), light: hex(0xa0a3a8), warm: hex(0x8a867c), cracks: false };

/** Testere dişli çelik disk (merkez cx,cy; yarıçap r): parlak kenar, koyu halka, turuncu göbek. */
function sawBlade(t, cx, cy, r, seed) {
  disc(cx, cy, r + 1.2, (x, y) => {
    put(t, x, y, 0.1, 0.1, 0.12, 1);
    setH(t, x, y, 0.2);
  });
  disc(cx, cy, r, (x, y, d) => {
    const ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    const tooth = Math.abs(Math.sin(ang * 8)) > 0.5;
    const rr = d * r;
    if (rr > r - 1.4 && !tooth) return;
    const ring = rr > r - 3 ? 1.08 : rr < r * 0.45 ? 0.62 : 0.92;
    const k = ring * (0.9 + rnd(x, y, seed) * 0.08);
    put(t, x, y, 0.84 * k, 0.87 * k, 0.93 * k, 1);
    setH(t, x, y, rr > r - 3 ? 0.95 : 0.78);
    setRo(t, x, y, 0.25);
    setTm(t, x, y, 0);
  });
  // göbek: turuncu cıvata
  disc(cx, cy, r * 0.3, (x, y, d) => {
    put(t, x, y, 0.95 - d * 0.25, 0.55 - d * 0.2, 0.15, 1);
    setH(t, x, y, 0.9);
    setRo(t, x, y, 0.3);
  });
}

export function paintStonecutterTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    stonePixel(o, x, y, seed, STONE);
    o.h = 0.5 + o.h * 0.25;
  });
  // orta yarık (koyu) ve içinden çıkan çelik bıçak (yandan ince çizgi)
  rect(3, 13, 26, 6, (x, y) => {
    put(t, x, y, 0.08, 0.08, 0.09, 1);
    setH(t, x, y, 0.1);
  });
  rect(7, 14, 18, 4, (x, y, u, v) => {
    const k = v < 0.34 ? 1.1 : v > 0.66 ? 0.7 : 0.92;
    put(t, x, y, 0.84 * k, 0.87 * k, 0.93 * k, 1);
    setH(t, x, y, 0.95);
    setRo(t, x, y, 0.25);
  });
  for (let x = 7; x < 25; x += 2) {
    put(t, x, 13, 0.7, 0.73, 0.8, 1);
    put(t, x, 18, 0.7, 0.73, 0.8, 1);
  }
  // köşe cıvataları
  [[5, 5], [26, 5], [5, 26], [26, 26]].forEach((p) => {
    disc(p[0] + 0.5, p[1] + 0.5, 1.5, (x, y, d) => {
      put(t, x, y, 0.55 - d * 0.2, 0.57 - d * 0.2, 0.62 - d * 0.2, 1);
      setH(t, x, y, 0.9);
    });
  });
  bevel(t, 2, 0.4, 0.2);
  t.bump = 1.1;
}

export function paintStonecutterSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    stonePixel(o, x, y, seed + 1, STONE);
    o.h = 0.5 + o.h * 0.25;
    if (y > 24) {
      // taban: koyu taş şerit
      o.r *= 0.78;
      o.g *= 0.78;
      o.b *= 0.8;
    }
  });
  // iki yanda ahşap çerçeve dikmeleri (makine gövdesi)
  [[2, 5], [26, 29]].forEach((b) => {
    rect(b[0], 3, b[1] - b[0] + 1, 22, (x, y, u) => {
      const k = u < 0.3 ? 1.1 : u > 0.7 ? 0.66 : 0.9;
      const g = rnd(x, y, seed) * 0.1;
      put(t, x, y, (0.55 + g) * k, (0.37 + g) * k, (0.2 + g) * k, 1);
      setH(t, x, y, 0.82);
      setRo(t, x, y, 0.8);
    });
  });
  // koyu pencere + disk
  rect(6, 4, 20, 20, (x, y) => {
    over(t, x, y, 0.05, 0.05, 0.06, 0.82);
    setH(t, x, y, 0.25);
  });
  sawBlade(t, 16, 14, 8, seed);
  // diskin altından çıkan kesim kanalı
  rect(8, 23, 16, 2, (x, y) => {
    put(t, x, y, 0.08, 0.08, 0.09, 1);
    setH(t, x, y, 0.15);
  });
  bevel(t, 1, 0.25, 0.1);
  t.bump = 1.3;
}

/** Dokuma tezgahı: üstten ahşap çerçeve ve gerili çözgü iplikleri. */
export function paintLoomTop(t, seed) {
  paintPixels(t, (x, y, o) => {
    wood(o, x, y, seed, hex(0x8c6034), hex(0xbb8a50), true);
    const d = Math.min(x, N - 1 - x, y, N - 1 - y);
    if (d < 3) {
      const k = d === 2 ? 0.75 : 0.55;
      o.r *= k;
      o.g *= k;
      o.b *= k;
      o.h = d === 2 ? 0.35 : 0.75;
    }
  });
  // gerili iplikler (dikey, açık krem) + renkli dokunmuş şerit
  for (let x = 6; x < 26; x += 2) {
    for (let y = 6; y < 26; y++) {
      const g = 0.9 + rnd(x, y, seed) * 0.1;
      put(t, x, y, 0.93 * g, 0.9 * g, 0.82 * g, 1);
      setH(t, x, y, 0.62);
      setRo(t, x, y, 0.9);
    }
  }
  const cols = [hex(0xc8312f), hex(0xf2c91e), hex(0x2f5fc8)];
  for (let i = 0; i < 3; i++) {
    const y0 = 8 + i * 5;
    rect(6, y0, 20, 3, (x, y) => {
      const c = cols[i];
      const g = 0.85 + (((x + y) & 1) ? 0.12 : 0) + rnd(x, y, seed + i) * 0.06;
      put(t, x, y, c[0] * g, c[1] * g, c[2] * g, 1);
      setH(t, x, y, 0.7);
      setRo(t, x, y, 0.95);
    });
  }
  t.bump = 1.1;
}

export function paintLoomSide(t, seed) {
  paintPixels(t, (x, y, o) => {
    wood(o, x, y, seed + 3, hex(0x8c6034), hex(0xbb8a50), false);
    if (x % 8 === 0) {
      o.r *= 0.6;
      o.g *= 0.57;
      o.b *= 0.55;
      o.h = 0.2;
    }
  });
  // üst ve alt kiriş (koyu), iki yan dikme
  [[0, 5], [26, 31]].forEach((b) => {
    rect(0, b[0], N, b[1] - b[0] + 1, (x, y, u, v) => {
      const k = v < 0.3 ? 1.1 : v > 0.7 ? 0.66 : 0.88;
      const g = rnd(x, y, seed + 9) * 0.1;
      put(t, x, y, (0.42 + g) * k, (0.27 + g) * k, (0.14 + g) * k, 1);
      setH(t, x, y, v < 0.3 ? 0.85 : 0.7);
      setRo(t, x, y, 0.8);
    });
  });
  [[0, 3], [28, 31]].forEach((b) => {
    rect(b[0], 6, b[1] - b[0] + 1, 20, (x, y, u) => {
      const k = u < 0.3 ? 1.1 : u > 0.7 ? 0.66 : 0.88;
      put(t, x, y, 0.42 * k, 0.27 * k, 0.14 * k, 1);
      setH(t, x, y, 0.8);
    });
  });
  // pencere: koyu zemin
  rect(4, 6, 24, 20, (x, y) => {
    over(t, x, y, 0.1, 0.07, 0.05, 0.85);
    setH(t, x, y, 0.3);
  });
  // gerili çözgü iplikleri (ince, dikey, açık krem)
  for (let x = 6; x < 27; x += 3) {
    for (let y = 6; y < 26; y++) {
      const g = 0.92 + rnd(x, y, seed) * 0.08;
      put(t, x, y, 0.93 * g, 0.9 * g, 0.8 * g, 1);
      setH(t, x, y, 0.6);
      setRo(t, x, y, 0.9);
    }
  }
  // dokunmuş kumaş: aşağıdan yukarı büyüyen yatay şeritler (mavi + sarı çizgi), alt kenarı saçaklı
  const cloth = [hex(0x2f5fc8), hex(0x2f5fc8), hex(0xf2c91e), hex(0x2f5fc8), hex(0xc8312f), hex(0x2f5fc8)];
  for (let i = 0; i < 6; i++) {
    const y0 = 24 - i * 3;
    for (let y = y0 - 2; y <= y0; y++) {
      for (let x = 5; x < 27; x++) {
        const c = cloth[i];
        const g = 0.82 + (((x + y) & 1) ? 0.16 : 0) + rnd(x, y, seed + i) * 0.05;
        put(t, x, y, c[0] * g, c[1] * g, c[2] * g, 1);
        setH(t, x, y, 0.72);
        setRo(t, x, y, 0.95);
      }
    }
  }
  // atkı mekiği
  rect(9, 5, 14, 2, (x, y, u) => {
    put(t, x, y, 0.75 * (1 - u * 0.15), 0.52 * (1 - u * 0.15), 0.28 * (1 - u * 0.15), 1);
    setH(t, x, y, 0.9);
  });
  bevel(t, 1, 0.2, 0.08);
  t.bump = 1.1;
}

/** Merdiven: iki dikey ray + yatay basamaklar; arası saydam (çapraz düzlem sprite). */
export function paintLadder(t, seed) {
  clearSprite(t);
  const rail = (x0) => {
    rect(x0, 0, 4, N, (x, y, u) => {
      const k = u < 0.3 ? 1.1 : u > 0.7 ? 0.7 : 0.92;
      const g = rnd(x, y, seed) * 0.1;
      put(t, x, y, (0.55 + g) * k, (0.37 + g) * k, (0.2 + g) * k, 1);
      setH(t, x, y, u < 0.3 ? 0.8 : u > 0.7 ? 0.5 : 0.65);
      setRo(t, x, y, 0.85);
    });
  };
  rail(4);
  rail(24);
  for (let y = 3; y < N; y += 8) {
    rect(8, y, 16, 3, (x, y2, u, v) => {
      const k = v < 0.34 ? 1.1 : v > 0.66 ? 0.7 : 0.92;
      const g = rnd(x, y2, seed + 1) * 0.1;
      put(t, x, y2, (0.62 + g) * k, (0.43 + g) * k, (0.24 + g) * k, 1);
      setH(t, x, y2, v < 0.34 ? 0.8 : 0.6);
      setRo(t, x, y2, 0.85);
    });
  }
  // rayların ucundaki çivi başları
  [[5, 4], [25, 4], [5, 20], [25, 20]].forEach((p) => {
    disc(p[0] + 0.5, p[1] + 0.5, 0.9, (x, y) => {
      put(t, x, y, 0.3, 0.3, 0.34, 1);
      setH(t, x, y, 0.95);
    });
  });
  t.bump = 1.0;
}

export const CRAFT_PAINTERS = Object.freeze({
  kesici_üst: paintStonecutterTop,
  kesici_yan: paintStonecutterSide,
  dokuma_üst: paintLoomTop,
  dokuma_yan: paintLoomSide,
  merdiven: paintLadder,
});
