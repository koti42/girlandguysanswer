/*
 * KEŞİF sim — biyom ağaçları ve büyük bitkiler (saf, belirlenimci; worldgenFlora.buildTree yönlendirir).
 *
 * Her kurucu (tx, ty, tz, th): tx,tz = gövde tabanı, ty = ilk gövde bloğunun y'si, th = konum özeti (hash). Yazımlar worldgenTreeKit'in
 * kırpılan yazıcılarıyla yapılır (taç chunk sınırını aşar; her chunk kendi kesitini yazar).
 * Ağaç devirme uyumu: tüm kütükler 26 komşulukla TEK bileşen, her yaprak bir kütüğe ≤ 4 adımda bağlı (testle doğrulanır).
 *
 * Türler (kimlik = TREE2.*; worldgenFlora.TREE ile aynı sayı uzayı, 7'den başlar).
 */
import { B } from './blocks.js';
import { hash3 } from './rng.js';
import {
  DIRS, DIRS8, hv, lf, lg, ls, lw, leafBlob, peek,
} from './worldgenTreeKit.js';

export const TREE2 = Object.freeze({
  AUTUMN_OAK: 7,
  AUTUMN_BIG: 8,
  AUTUMN_BIRCH: 9,
  CHERRY: 10,
  CHERRY_BIG: 11,
  JUNGLE: 12,
  JUNGLE_GIANT: 13,
  MANGROVE: 14,
  SAVANNA: 15,
  BAOBAB: 16,
  SNOWPINE: 17,
  SNOWPINE_TALL: 18,
  MUSH_RED: 19,
  MUSH_PURPLE: 20,
  BAMBOO: 21,
  PALM: 22,
  DARK_OAK: 23,
  ICE_SPIKE: 24,
  CORAL: 25,
  DEAD_TREE: 26,
  MUSH_RED_BIG: 27,
});
export const TREE2_MIN = 7;
export const TREE2_MAX = 27;

/** Türün kütük/yaprak/gövde bloğu özet tablosu: test + treeGrow gibi tüketiciler için. */
export const TREE2_NAMES = Object.freeze({
  7: 'sonbahar meşesi', 8: 'büyük sonbahar meşesi', 9: 'sonbahar hüşü', 10: 'kiraz', 11: 'büyük kiraz', 12: 'cangıl', 13: 'dev cangıl',
  14: 'mangrov', 15: 'savan akasyası', 16: 'baobab', 17: 'karlı çam', 18: 'uzun karlı çam', 19: 'dev mantar', 20: 'mor mantar',
  21: 'bambu', 22: 'palmiye', 23: 'gölge meşesi', 24: 'buz dikeni', 25: 'mercan', 26: 'kavruk ağaç', 27: 'büyük dev mantar',
});

const LEAF_AUTUMN = [B.LEAVES_AUTUMN_ORANGE, B.LEAVES_AUTUMN_RED, B.LEAVES_AUTUMN_YELLOW];

/** Sonbahar yaprak rengi: ağaç başına baskın renk + 2×2×2'lik yama gürültüsü. */
function autumnLeafId(x, y, z, th, dom) {
  const q = hash3(x >> 1, y >> 1, z >> 1, th ^ 0x51);
  if ((q & 7) < 5) return LEAF_AUTUMN[dom];
  return LEAF_AUTUMN[((q >>> 4) + dom + 1) % 3];
}

function autumnBlob(cx, cy, cz, R, th, dom, flat) {
  const ri = Math.ceil(R);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dz = -ri; dz <= ri; dz++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d2 = dx * dx + dy * dy * flat + dz * dz;
        if (d2 > R * R) continue;
        if (d2 > R * R - 2.2 && (hash3(cx + dx, cy + dy, cz + dz, th) & 3) === 0) continue;
        lf(cx + dx, cy + dy, cz + dz, autumnLeafId(cx + dx, cy + dy, cz + dz, th, dom));
      }
    }
  }
}

function treeAutumn(tx, ty, tz, th, big) {
  const dom = th % 3;
  const H = big ? 8 + ((th >>> 3) % 4) : 5 + ((th >>> 3) % 3);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_OAK);
  const top = ty + H - 1;
  if (!big) {
    autumnBlob(tx, top - 1, tz, 3.0, th, dom, 1.5);
    autumnBlob(tx + 1, top + 1, tz, 1.8, th + 3, dom, 1.2);
    return;
  }
  for (let k = 0; k < 3; k++) {
    const d = DIRS8[(th >>> (4 + k * 3)) & 7];
    const y = top - 3 + (k & 1);
    lg(tx + d[0], y, tz + d[1], B.LOG_OAK);
    lg(tx + d[0] * 2, y + 1, tz + d[1] * 2, B.LOG_OAK);
    autumnBlob(tx + d[0] * 2, y + 1, tz + d[1] * 2, 2.7, th + k, dom, 1.4);
  }
  autumnBlob(tx, top - 1, tz, 3.8, th, dom, 1.4);
}

function treeAutumnBirch(tx, ty, tz, th) {
  const H = 7 + ((th >>> 3) % 3);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_BIRCH);
  const top = ty + H - 1;
  for (let dy = -4; dy <= 1; dy++) {
    const r = dy === -4 || dy === 1 ? 1 : 2;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        if (dy === -4 && dx === 0 && dz === 0) continue;
        const q = hash3(tx + dx, top + dy, tz + dz, th);
        if (r === 2 && (q & 7) === 0) continue;
        lf(tx + dx, top + dy, tz + dz, (q >>> 5) % 5 === 0 ? B.LEAVES_AUTUMN_ORANGE : B.LEAVES_AUTUMN_YELLOW);
      }
    }
  }
}

/** Kiraz: hafif eğri gövde, çatallanan dallar, geniş şemsiye taç. */
function treeCherry(tx, ty, tz, th, big) {
  const H = big ? 7 + ((th >>> 3) % 3) : 4 + ((th >>> 3) % 3);
  const lean = DIRS[(th >>> 6) & 3];
  let x = tx;
  let z = tz;
  for (let i = 0; i < H; i++) {
    if (i === (H >> 1)) {
      x += lean[0];
      z += lean[1];
    }
    lg(x, ty + i, z, B.LOG_CHERRY);
  }
  const top = ty + H - 1;
  const arms = big ? 3 : 2;
  for (let k = 0; k < arms; k++) {
    const d = DIRS8[((th >>> (9 + k * 3)) + k * 3) & 7];
    const len = 2 + ((th >>> (12 + k)) & 1) + (big ? 1 : 0);
    let ax = x;
    let az = z;
    let ay = top - 1;
    for (let s = 1; s <= len; s++) {
      ax += d[0];
      az += d[1];
      if (s !== 2) ay += 1;
      lg(ax, ay, az, B.LOG_CHERRY);
    }
    leafBlob(ax, ay, az, big ? 3.3 : 2.8, B.LEAVES_CHERRY, th + k * 7, 2.2);
  }
  leafBlob(x, top + 1, z, big ? 3.2 : 2.6, B.LEAVES_CHERRY, th, 1.9);
}

function hangVines(cx, cy, cz, n, th, maxLen) {
  for (let i = 0; i < n; i++) {
    const a = hv(i, 11, cx, th) * 6.2832;
    const rad = 1.5 + hv(i, 12, cz, th) * 2.6;
    const vx = Math.round(cx + Math.cos(a) * rad);
    const vz = Math.round(cz + Math.sin(a) * rad);
    const len = 2 + Math.floor(hv(i, 13, cy, th) * maxLen);
    for (let k = 1; k <= len; k++) lf(vx, cy - k, vz, B.VINE);
  }
}

function treeJungle(tx, ty, tz, th) {
  const H = 10 + ((th >>> 3) % 7);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_JUNGLE);
  const top = ty + H - 1;
  // gövde sarmaşıkları
  for (let i = 0; i < 4; i++) {
    const d = DIRS[(th >>> (4 + i)) & 3];
    const y0 = ty + 2 + ((th >>> (8 + i)) % 5);
    const len = 3 + ((th >>> (12 + i)) % 5);
    for (let k = 0; k < len; k++) lf(tx + d[0], y0 + k, tz + d[1], B.VINE);
  }
  // dallar + katmanlı taç
  for (let k = 0; k < 3; k++) {
    const d = DIRS8[(th >>> (3 + k * 3)) & 7];
    const y = top - 4 - k * 2;
    if (y <= ty + 4) continue;
    lg(tx + d[0], y, tz + d[1], B.LOG_JUNGLE);
    lg(tx + d[0] * 2, y + 1, tz + d[1] * 2, B.LOG_JUNGLE);
    leafBlob(tx + d[0] * 2, y + 1, tz + d[1] * 2, 2.5, B.LEAVES_JUNGLE, th + k, 1.6);
  }
  leafBlob(tx, top, tz, 3.6, B.LEAVES_JUNGLE, th, 1.9);
  leafBlob(tx, top + 2, tz, 2.0, B.LEAVES_JUNGLE, th + 9, 1.2);
  hangVines(tx, top - 1, tz, 7, th, 4);
}

/** Dev yağmur ormanı ağacı: 2×2 gövde, kök payandaları, katman katman yayvan taç, sarmaşık perdeleri. */
function treeJungleGiant(tx, ty, tz, th) {
  const H = 28 + ((th >>> 3) % 14);
  for (let i = 0; i < H; i++) {
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) lg(tx + dx, ty + i, tz + dz, B.LOG_JUNGLE);
  }
  const top = ty + H - 1;
  // kök payandaları (taban genişler)
  for (let k = 0; k < 8; k++) {
    const d = DIRS8[k];
    const ox = d[0] > 0 ? 1 : 0;
    const oz = d[1] > 0 ? 1 : 0;
    const len = 2 + ((th >>> (3 + k)) & 1);
    for (let s = 1; s <= len; s++) {
      const x = tx + ox + d[0] * s;
      const z = tz + oz + d[1] * s;
      for (let y = ty - 1; y <= ty + (len - s) + 1; y++) lw(x, y, z, B.LOG_JUNGLE);
    }
  }
  // gövde sarmaşıkları
  for (let i = 0; i < 12; i++) {
    const d = DIRS[i & 3];
    const bx = tx + (d[0] > 0 ? 2 : (d[0] < 0 ? -1 : (i & 4 ? 1 : 0)));
    const bz = tz + (d[1] > 0 ? 2 : (d[1] < 0 ? -1 : (i & 8 ? 1 : 0)));
    const y0 = ty + 3 + ((th >>> (i % 9)) % 14);
    const len = 4 + ((th >>> (i + 2)) % 9);
    for (let k = 0; k < len; k++) lf(bx, y0 + k, bz, B.VINE);
  }
  // alt dallar (orta seviyede küçük yan taçlar)
  for (let k = 0; k < 5; k++) {
    const d = DIRS8[(th >>> (2 + k * 2) ^ k * 3) & 7];
    const y = ty + Math.floor(H * (0.5 + 0.09 * k));
    let x = tx + (d[0] > 0 ? 1 : 0);
    let z = tz + (d[1] > 0 ? 1 : 0);
    for (let s = 1; s <= 4; s++) {
      x += d[0];
      z += d[1];
      lg(x, y + (s > 2 ? 1 : 0), z, B.LOG_JUNGLE);
    }
    leafBlob(x, y + 2, z, 3.3, B.LEAVES_JUNGLE, th + k * 5, 1.7);
  }
  // üst taç: dallar + iki katmanlı geniş disk
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * 6.2832 + hv(k, 3, tx, th) * 0.6;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    for (let s = 1; s <= 6; s++) {
      lg(tx + Math.round(dx * s) + (dx > 0 ? 1 : 0), top - 3 + (s > 3 ? 1 : 0), tz + Math.round(dz * s) + (dz > 0 ? 1 : 0), B.LOG_JUNGLE);
    }
    leafBlob(tx + Math.round(dx * 6) + 1, top - 2, tz + Math.round(dz * 6) + 1, 3.6, B.LEAVES_JUNGLE, th + 40 + k, 2.2);
  }
  leafBlob(tx + 1, top, tz + 1, 5.2, B.LEAVES_JUNGLE, th, 2.6);
  leafBlob(tx + 1, top + 3, tz + 1, 3.0, B.LEAVES_JUNGLE, th + 3, 1.6);
  hangVines(tx + 1, top - 3, tz + 1, 22, th, 7);
}

function treeMangrove(tx, ty, tz, th) {
  const H = 4 + ((th >>> 3) % 4);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_MANGROVE);
  const top = ty + H - 1;
  // payanda kökler: gövde tabanından dışarı + aşağı, suya/zemine uzanır
  const nRoots = 5 + ((th >>> 5) & 3);
  for (let k = 0; k < nRoots; k++) {
    const d = DIRS8[(k + (th >>> 8)) & 7];
    const reach = 2 + ((th >>> (10 + k)) & 1);
    lw(tx + d[0], ty + 1, tz + d[1], B.MANGROVE_ROOTS);
    for (let s = 1; s <= reach; s++) {
      const x = tx + d[0] * s;
      const z = tz + d[1] * s;
      const yTop = ty + (s === 1 ? 0 : -1);
      for (let y = yTop; y >= ty - 6; y--) {
        const b = peek(x, y, z);
        if (b > 0 && b !== 20 && b !== 21 && b !== B.VINE) break; // zemine değdi
        lw(x, y, z, B.MANGROVE_ROOTS);
      }
    }
  }
  leafBlob(tx, top, tz, 3.1, B.LEAVES_MANGROVE, th, 1.8);
  leafBlob(tx + 1, top + 1, tz - 1, 2.0, B.LEAVES_MANGROVE, th + 5, 1.4);
  hangVines(tx, top - 1, tz, 3, th, 3);
}

function treeSavanna(tx, ty, tz, th) {
  const H = 5 + ((th >>> 3) % 3);
  const d = DIRS8[(th >>> 6) & 7];
  for (let i = 0; i < H - 2; i++) lg(tx, ty + i, tz, B.LOG_ACACIA);
  const bx = tx + d[0];
  const bz = tz + d[1];
  for (let i = H - 3; i < H; i++) lg(bx, ty + i, bz, B.LOG_ACACIA);
  const top = ty + H - 1;
  // ikinci dal (ters yöne)
  lg(tx - d[0], ty + H - 3, tz - d[1], B.LOG_ACACIA);
  lg(tx - d[0] * 2, ty + H - 2, tz - d[1] * 2, B.LOG_ACACIA);
  const disc = (cx, cy, cz, R, th2) => {
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R + 1 || (d2 > R * R - 2 && (hash3(dx, cy, dz, th2) & 1))) continue;
        lf(cx + dx, cy, cz + dz, B.LEAVES_ACACIA);
        if (d2 <= (R - 1) * (R - 1)) lf(cx + dx, cy + 1, cz + dz, B.LEAVES_ACACIA);
      }
    }
  };
  disc(bx, top, bz, 4, th);
  disc(tx - d[0] * 2, ty + H - 1, tz - d[1] * 2, 3, th + 1);
}

function treeBaobab(tx, ty, tz, th) {
  const H = 9 + ((th >>> 3) % 4);
  for (let i = 0; i < H; i++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (i > H - 4 && (dx !== 0 || dz !== 0)) continue;
        if (i < 2 || Math.abs(dx) + Math.abs(dz) < 2 || i < H - 5) lg(tx + dx, ty + i, tz + dz, B.LOG_ACACIA);
      }
    }
  }
  const top = ty + H - 1;
  for (let k = 0; k < 5; k++) {
    const d = DIRS8[(th >>> (3 + k * 2) ^ k * 3) & 7];
    let x = tx;
    let z = tz;
    let y = top - 1;
    for (let s = 1; s <= 3; s++) {
      x += d[0];
      z += d[1];
      if (s > 1) y += 1;
      lg(x, y, z, B.LOG_ACACIA);
    }
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > 9 || (d2 > 6 && (hash3(dx, y, dz, th + k) & 1))) continue;
        lf(x + dx, y + 1, z + dz, B.LEAVES_ACACIA);
        if (d2 <= 5) lf(x + dx, y + 2, z + dz, B.LEAVES_ACACIA);
      }
    }
  }
  leafBlob(tx, top + 2, tz, 3.0, B.LEAVES_ACACIA, th, 2.0);
}

const SNOWPINE_R = [0, 1, 1, 2, 1, 2, 2, 2, 2, 3, 2, 3, 3, 3, 3, 3, 3];
function treeSnowPine(tx, ty, tz, th, tall) {
  const H = tall ? 14 + ((th >>> 3) % 6) : 9 + ((th >>> 3) % 5);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_PINE);
  const top = ty + H - 1;
  const bottom = ty + (tall ? 4 : 3);
  for (let y = top + 1, k = 0; y >= bottom; y--, k++) {
    const r = SNOWPINE_R[k < SNOWPINE_R.length ? k : SNOWPINE_R.length - 1] + (tall && k > 11 ? 1 : 0);
    const lim = r * r + (r > 1 ? 1 : 0);
    // her ikinci katman daha geniş: çam dalı katmanları
    const rr = (k % 3 === 2) ? Math.max(1, r - 1) : r;
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dz * dz > (k % 3 === 2 ? rr * rr + 1 : lim)) continue;
        lf(tx + dx, y, tz + dz, B.LEAVES_SNOWPINE);
      }
    }
  }
}

/** Dev mantar: kırmızı beneklı kubbe (big: daha yüksek/geniş) */
function mushRed(tx, ty, tz, th, big) {
  const H = big ? 8 + ((th >>> 3) % 5) : 4 + ((th >>> 3) % 4);
  const R = big ? 5 : 3 + ((th >>> 6) & 1);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.MUSHROOM_STEM);
  if (big) for (let i = 0; i < 3; i++) for (const d of DIRS) lg(tx + d[0], ty + i, tz + d[1], B.MUSHROOM_STEM);
  const top = ty + H;
  const disc = (y, r, hollow) => {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r + 1) continue;
        if (hollow && d2 < (r - 1) * (r - 1)) continue;
        lf(tx + dx, y, tz + dz, B.MUSHROOM_CAP_RED);
      }
    }
  };
  disc(top, R - 2, false);
  disc(top - 1, R - 1, false);
  disc(top - 2, R, true);
  if (big) disc(top - 3, R, true);
}

function mushPurple(tx, ty, tz, th) {
  const H = 9 + ((th >>> 3) % 6);
  const R = 5 + ((th >>> 6) & 1);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.MUSHROOM_STEM);
  const top = ty + H;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R + 1) continue;
      if (d2 <= (R - 2) * (R - 2)) lf(tx + dx, top + 1, tz + dz, B.MUSHROOM_CAP_PURPLE);
      lf(tx + dx, top, tz + dz, B.MUSHROOM_CAP_PURPLE);
      if (d2 >= (R - 1) * (R - 1) - 2 && (hash3(dx, top, dz, th) & 3) !== 0) lf(tx + dx, top - 1, tz + dz, B.MUSHROOM_CAP_PURPLE);
    }
  }
}

/** Bambu öbeği: 3–6 dik sap. */
function bambooCluster(tx, ty, tz, th) {
  const n = 3 + ((th >>> 3) % 4);
  for (let k = 0; k < n; k++) {
    const ox = ((th >>> (k * 2)) & 3) - 1 + (k > 3 ? 1 : 0);
    const oz = ((th >>> (k * 2 + 1)) & 3) - 1;
    const h = 8 + ((hash3(ox, oz, k, th) & 255) % 11);
    for (let y = 0; y < h; y++) lf(tx + ox, ty + y, tz + oz, B.BAMBOO);
  }
}

function treePalm(tx, ty, tz, th) {
  const H = 7 + ((th >>> 3) % 5);
  const d = DIRS8[(th >>> 6) & 7];
  let x = tx;
  let z = tz;
  for (let i = 0; i < H; i++) {
    // gövde yavaşça eğilir
    if (i > 1 && i % 3 === 0) {
      x += d[0];
      z += d[1];
    }
    lg(x, ty + i, z, B.LOG_ACACIA);
  }
  const top = ty + H - 1;
  for (let k = 0; k < 8; k++) {
    const f = DIRS8[k];
    const len = 4 + ((th >>> k) & 1);
    for (let s = 1; s <= len; s++) {
      const y = top + (s <= 2 ? 1 : 0) - (s > 3 ? 1 : 0);
      lf(x + f[0] * s, y, z + f[1] * s, B.LEAVES_JUNGLE);
      if (s % 2 === 1) {
        lf(x + f[0] * s + f[1], y, z + f[1] * s + f[0], B.LEAVES_JUNGLE);
        lf(x + f[0] * s - f[1], y - 1, z + f[1] * s - f[0], B.LEAVES_JUNGLE);
      }
    }
  }
  lf(x, top + 1, z, B.LEAVES_JUNGLE);
  lf(x, top + 2, z, B.LEAVES_JUNGLE);
  lf(x + 1, top, z, B.LEAVES_JUNGLE);
  lf(x - 1, top, z, B.LEAVES_JUNGLE);
}

function treeDarkOak(tx, ty, tz, th) {
  const H = 6 + ((th >>> 3) % 4);
  for (let i = 0; i < H; i++) {
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) lg(tx + dx, ty + i, tz + dz, B.LOG_PINE);
  }
  const top = ty + H - 1;
  for (let k = 0; k < 4; k++) {
    const d = DIRS8[((th >>> (2 + k * 3)) + k * 2) & 7];
    let x = tx + (d[0] > 0 ? 1 : 0);
    let z = tz + (d[1] > 0 ? 1 : 0);
    for (let s = 1; s <= 3; s++) {
      x += d[0];
      z += d[1];
      lg(x, top - 1 + (s > 1 ? 1 : 0), z, B.LOG_PINE);
    }
    leafBlob(x, top + 1, z, 3.0, B.LEAVES_OAK, th + k, 2.4);
  }
  leafBlob(tx + 1, top + 1, tz + 1, 4.2, B.LEAVES_OAK, th, 2.6);
}

function iceSpike(tx, ty, tz, th) {
  const H = 5 + ((th >>> 3) % 12);
  for (let i = 0; i < H; i++) {
    lf(tx, ty + i, tz, B.PACKED_ICE);
    if (i < 2 || (i < H / 3 && (th >>> i) & 1)) {
      for (const d of DIRS) lf(tx + d[0], ty + i, tz + d[1], B.PACKED_ICE);
    }
  }
  if (H > 10) {
    const d = DIRS8[(th >>> 5) & 7];
    for (let i = 0; i < 4; i++) lf(tx + d[0] * 2, ty + i + 1, tz + d[1] * 2, B.PACKED_ICE);
  }
}

const CORALS = [B.CORAL_PINK, B.CORAL_PURPLE, B.CORAL_YELLOW];
function coralCluster(tx, ty, tz, th) {
  const base = th % 3;
  const n = 3 + ((th >>> 3) % 6);
  for (let k = 0; k < n; k++) {
    const ox = ((hash3(k, 1, tx, th) & 7) % 5) - 2;
    const oz = ((hash3(k, 2, tz, th) & 7) % 5) - 2;
    const h = 1 + ((hash3(k, 3, tx + tz, th) & 7) % 3);
    const id = CORALS[(hash3(k, 4, tx, th) & 3) === 0 ? (base + 1) % 3 : base];
    for (let y = 0; y < h; y++) lw(tx + ox, ty + y, tz + oz, id);
    if ((hash3(k, 5, tz, th) & 1) === 0) lw(tx + ox, ty + h, tz + oz, B.CORAL_FAN);
  }
}

function deadTree(tx, ty, tz, th) {
  const H = 4 + ((th >>> 3) % 5);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_PINE);
  const d = DIRS[(th >>> 6) & 3];
  lg(tx + d[0], ty + H - 2, tz + d[1], B.LOG_PINE);
  lg(tx + d[0] * 2, ty + H - 1, tz + d[1] * 2, B.LOG_PINE);
  const e = DIRS[((th >>> 6) + 2) & 3];
  if (H > 5) lg(tx + e[0], ty + H - 3, tz + e[1], B.LOG_PINE);
}

/** Biyom türü kurucusu (species ∈ [TREE2_MIN, TREE2_MAX]). */
export function buildBiomeTree(species, tx, ty, tz, th) {
  switch (species) {
    case TREE2.AUTUMN_OAK: treeAutumn(tx, ty, tz, th, false); break;
    case TREE2.AUTUMN_BIG: treeAutumn(tx, ty, tz, th, true); break;
    case TREE2.AUTUMN_BIRCH: treeAutumnBirch(tx, ty, tz, th); break;
    case TREE2.CHERRY: treeCherry(tx, ty, tz, th, false); break;
    case TREE2.CHERRY_BIG: treeCherry(tx, ty, tz, th, true); break;
    case TREE2.JUNGLE: treeJungle(tx, ty, tz, th); break;
    case TREE2.JUNGLE_GIANT: treeJungleGiant(tx, ty, tz, th); break;
    case TREE2.MANGROVE: treeMangrove(tx, ty, tz, th); break;
    case TREE2.SAVANNA: treeSavanna(tx, ty, tz, th); break;
    case TREE2.BAOBAB: treeBaobab(tx, ty, tz, th); break;
    case TREE2.SNOWPINE: treeSnowPine(tx, ty, tz, th, false); break;
    case TREE2.SNOWPINE_TALL: treeSnowPine(tx, ty, tz, th, true); break;
    case TREE2.MUSH_RED: mushRed(tx, ty, tz, th, false); break;
    case TREE2.MUSH_RED_BIG: mushRed(tx, ty, tz, th, true); break;
    case TREE2.MUSH_PURPLE: mushPurple(tx, ty, tz, th); break;
    case TREE2.BAMBOO: bambooCluster(tx, ty, tz, th); break;
    case TREE2.PALM: treePalm(tx, ty, tz, th); break;
    case TREE2.DARK_OAK: treeDarkOak(tx, ty, tz, th); break;
    case TREE2.ICE_SPIKE: iceSpike(tx, ty, tz, th); break;
    case TREE2.CORAL: coralCluster(tx, ty, tz, th); break;
    case TREE2.DEAD_TREE: deadTree(tx, ty, tz, th); break;
    default: break;
  }
}

/** Taç yarıçapı üst sınırı (blok): yerleşim marjı + test. Dev cangıl ayrıca ızgarada ele alınır. */
export const CROWN_REACH = Object.freeze({
  7: 4, 8: 6, 9: 3, 10: 7, 11: 8, 12: 6, 13: 13, 14: 5, 15: 6, 16: 8, 17: 4, 18: 4, 19: 5, 20: 7, 21: 3, 22: 7, 23: 7, 24: 3, 25: 3, 26: 3, 27: 6,
});

void ls;
