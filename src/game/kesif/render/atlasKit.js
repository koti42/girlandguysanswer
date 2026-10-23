/*
 * KEŞİF render — prosedürel doku araç takımı (saf; three/DOM/canvas yok).
 *
 * Tüm dokular 32×32'lik "boyama alanında" RGBA Float32 tamponlarına çizilir (node'da test edilebilir);
 * atlas.js bunları yeniden örnekler, normal haritasını yükseklikten çıkarır ve atlas piksel tamponlarına paketler.
 *
 * Kurallar:
 *  - Tüm koordinatlar sarmalıdır (x & 31): her gürültü/çizim ilkeli periyodik → dokular kusursuz döşenir.
 *  - Hiçbir yerde Math.random yok; her şey tamsayı hash'inden (ihash) türetilir → belirlenimci.
 *  - Piksel kanalları: r,g,b (sRGB 0..1), a (kapsama/opaklık), h (yükseklik 0..1, normal haritası için),
 *    ro (pürüzlülük), e (emisyon 0..1), ao (boşluk/cavity), tm (renk tonu maskesi: 1 = biyom tonu uygulanır).
 */

export const N = 32;
const MASK = N - 1;
const INV32 = 1 / 4294967296;

/** Boş doku (opak, orta gri, pürüzlü). */
export function createTile() {
  const n2 = N * N;
  const t = {
    n: N,
    c: new Float32Array(n2 * 4),
    h: new Float32Array(n2),
    ro: new Float32Array(n2),
    e: new Float32Array(n2),
    ao: new Float32Array(n2),
    tm: new Float32Array(n2),
    bump: 1,
  };
  for (let i = 0; i < n2; i++) {
    t.c[i * 4] = 0.5;
    t.c[i * 4 + 1] = 0.5;
    t.c[i * 4 + 2] = 0.5;
    t.c[i * 4 + 3] = 1;
    t.h[i] = 0.5;
    t.ro[i] = 0.85;
    t.ao[i] = 1;
    t.tm[i] = 1;
  }
  return t;
}

/* ------------------------------------------------------------------------------------------------
 * Hash ve gürültü
 * ---------------------------------------------------------------------------------------------- */
export function ihash(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2f) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x632be5ab, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
/** [0,1) tamsayı kafes rastgelesi. */
export function rnd(x, y, s) {
  return ihash(x, y, s) * INV32;
}
/** Metinden tohum. */
export function strSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Periyodik değer gürültüsü [0,1]. (x,y) piksel koordinatı; cx×cy kafes hücresi doku boyunca tam döner.
 */
export function vnoise(x, y, cx, cy, seed) {
  const fx = (x * cx) / N;
  const fy = (y * cy) / N;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fade(fx - x0);
  const ty = fade(fy - y0);
  const xa = ((x0 % cx) + cx) % cx;
  const ya = ((y0 % cy) + cy) % cy;
  const xb = (xa + 1) % cx;
  const yb = (ya + 1) % cy;
  const a = rnd(xa, ya, seed);
  const b = rnd(xb, ya, seed);
  const c = rnd(xa, yb, seed);
  const d = rnd(xb, yb, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Periyodik fBm [0,1] (oktav başına hücre sayısı ikiye katlanır). */
export function fbm(x, y, cx, cy, oct, seed) {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let fx = cx;
  let fy = cy;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x, y, fx, fy, seed + o * 131);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

/** Worley sonucu (paylaşılan nesne; her çağrıda üzerine yazılır): f1,f2 piksel, id [0,1), px,py öznokta. */
export const W = { f1: 0, f2: 0, id: 0, px: 0, py: 0 };

/** Periyodik Worley/hücresel gürültü. cx×cy hücre; jitter 0..1. Mesafeler piksel cinsindendir. */
export function worley(x, y, cx, cy, seed, jitter = 1) {
  const sx = N / cx;
  const sy = N / cy;
  const fx = x / sx;
  const fy = y / sy;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let f1 = 1e9;
  let f2 = 1e9;
  let id = 0;
  let bx = 0;
  let by = 0;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const gx = ix + di;
      const gy = iy + dj;
      const wx = ((gx % cx) + cx) % cx;
      const wy = ((gy % cy) + cy) % cy;
      const hh = ihash(wx, wy, seed);
      const jx = 0.5 + (((hh & 0xffff) * (1 / 65536)) - 0.5) * jitter;
      const jy = 0.5 + ((((hh >>> 16) & 0xffff) * (1 / 65536)) - 0.5) * jitter;
      const ppx = (gx + jx) * sx;
      const ppy = (gy + jy) * sy;
      const ddx = x - ppx;
      const ddy = y - ppy;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hh * INV32;
        bx = ppx;
        by = ppy;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  W.f1 = f1;
  W.f2 = f2;
  W.id = id;
  W.px = bx;
  W.py = by;
}

/* ------------------------------------------------------------------------------------------------
 * Renk yardımcıları (sRGB 0..1 üçlüleri)
 * ---------------------------------------------------------------------------------------------- */
export function hex(h) {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}
export function mixc(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function scalec(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}
export function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* ------------------------------------------------------------------------------------------------
 * Piksel yazıcılar (sarmalı)
 * ---------------------------------------------------------------------------------------------- */
export const ix = (x, y) => (y & MASK) * N + (x & MASK);

// Sprite (tek dörtgenlik bitki) dokularında doku dışına taşan yazımlar karşı kenara SARMAMALI: uzun otun kök diski
// y=31.5'te taşıp dokunun ÜST satırlarına dolgu pikselleri bırakıyor, uzaktan "yüzen koyu X çizgileri" görünüyordu.
let spriteClip = false;
export function setSpriteClip(on) {
  spriteClip = !!on;
}

/** Renk + alfa yaz. */
export function put(t, x, y, r, g, b, a = 1) {
  if (spriteClip && (x < 0 || y < 0 || x >= N || y >= N)) return;
  const i = ix(x, y);
  t.c[i * 4] = r;
  t.c[i * 4 + 1] = g;
  t.c[i * 4 + 2] = b;
  t.c[i * 4 + 3] = a;
}
/** Mevcut rengi (r,g,b) yönüne k oranında kaydır (alfa dokunulmaz). */
export function over(t, x, y, r, g, b, k) {
  const i = ix(x, y) * 4;
  t.c[i] += (r - t.c[i]) * k;
  t.c[i + 1] += (g - t.c[i + 1]) * k;
  t.c[i + 2] += (b - t.c[i + 2]) * k;
}
/** Rengi çarp (aydınlat/karart). */
export function shade(t, x, y, k) {
  const i = ix(x, y) * 4;
  t.c[i] = clamp(t.c[i] * k);
  t.c[i + 1] = clamp(t.c[i + 1] * k);
  t.c[i + 2] = clamp(t.c[i + 2] * k);
}
export const setA = (t, x, y, a) => {
  t.c[ix(x, y) * 4 + 3] = a;
};
export const getA = (t, x, y) => t.c[ix(x, y) * 4 + 3];
export const setH = (t, x, y, v) => {
  t.h[ix(x, y)] = v;
};
export const addH = (t, x, y, v) => {
  t.h[ix(x, y)] += v;
};
export const getH = (t, x, y) => t.h[ix(x, y)];
export const setE = (t, x, y, v) => {
  t.e[ix(x, y)] = v;
};
export const maxE = (t, x, y, v) => {
  const i = ix(x, y);
  if (v > t.e[i]) t.e[i] = v;
};
export const setRo = (t, x, y, v) => {
  t.ro[ix(x, y)] = v;
};
export const setAo = (t, x, y, v) => {
  t.ao[ix(x, y)] = v;
};
export const setTm = (t, x, y, v) => {
  t.tm[ix(x, y)] = v;
};
export function getRGB(t, x, y) {
  const i = ix(x, y) * 4;
  return [t.c[i], t.c[i + 1], t.c[i + 2]];
}

/**
 * Piksel başına boyayıcı: fn(x, y, o) çağrılır; o'yu doldurur. Varsayılanlar her piksel için sıfırlanır:
 * r,g,b = 0.5, a = 1, h = 0.5, ro = 0.85, e = 0, ao = 1, tm = 1.
 */
export function paintPixels(t, fn) {
  const o = { r: 0.5, g: 0.5, b: 0.5, a: 1, h: 0.5, ro: 0.85, e: 0, ao: 1, tm: 1 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      o.r = 0.5;
      o.g = 0.5;
      o.b = 0.5;
      o.a = 1;
      o.h = 0.5;
      o.ro = 0.85;
      o.e = 0;
      o.ao = 1;
      o.tm = 1;
      fn(x, y, o);
      const i = y * N + x;
      t.c[i * 4] = clamp(o.r);
      t.c[i * 4 + 1] = clamp(o.g);
      t.c[i * 4 + 2] = clamp(o.b);
      t.c[i * 4 + 3] = clamp(o.a);
      t.h[i] = o.h;
      t.ro[i] = clamp(o.ro);
      t.e[i] = clamp(o.e);
      t.ao[i] = clamp(o.ao);
      t.tm[i] = clamp(o.tm);
    }
  }
}

/** o'ya a→b renk karışımı yaz. */
export function setMix(o, a, b, t) {
  o.r = a[0] + (b[0] - a[0]) * t;
  o.g = a[1] + (b[1] - a[1]) * t;
  o.b = a[2] + (b[2] - a[2]) * t;
}
/** o'ya rengi yaz. */
export function setCol(o, c, k = 1) {
  o.r = c[0] * k;
  o.g = c[1] * k;
  o.b = c[2] * k;
}

/* ------------------------------------------------------------------------------------------------
 * Şekiller: sınırlayıcı kutuyu gezip fn çağırır (yazım fn içinde, put/over ile sarmalı)
 * ---------------------------------------------------------------------------------------------- */
/** Disk; fn(x, y, d) d = merkezden uzaklık / r (0..1). */
export function disc(cx, cy, r, fn) {
  const x0 = Math.floor(cx - r - 1);
  const x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(cy - r - 1);
  const y1 = Math.ceil(cy + r + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      if (d <= 1) fn(x, y, d, dx / r, dy / r);
    }
  }
}
/** Elips; fn(x, y, d, nx, ny). */
export function ellipse(cx, cy, rx, ry, fn) {
  const x0 = Math.floor(cx - rx - 1);
  const x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(cy - ry - 1);
  const y1 = Math.ceil(cy + ry + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d <= 1) fn(x, y, d, nx, ny);
    }
  }
}
/** Dikdörtgen; fn(x, y, u, v) u,v 0..1. */
export function rect(x0, y0, w, h, fn) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) fn(x0 + x, y0 + y, (x + 0.5) / w, (y + 0.5) / h);
  }
}
/** Kalın doğru parçası; fn(x, y, d, s) d çizgiye uzaklık (piksel), s 0..1 boyunca konum. */
export function line(x0, y0, x1, y1, w, fn) {
  const minx = Math.floor(Math.min(x0, x1) - w - 1);
  const maxx = Math.ceil(Math.max(x0, x1) + w + 1);
  const miny = Math.floor(Math.min(y0, y1) - w - 1);
  const maxy = Math.ceil(Math.max(y0, y1) + w + 1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      const s = clamp((px * dx + py * dy) / len2);
      const qx = px - s * dx;
      const qy = py - s * dy;
      const d = Math.sqrt(qx * qx + qy * qy);
      if (d <= w) fn(x, y, d, s);
    }
  }
}
/** Nokta çokgenin içinde mi (even-odd). */
export function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Çokgen dolgu; fn(x, y, d) d = (yaklaşık) kenara uzaklık piksel. */
export function poly(pts, fn) {
  let minx = 1e9;
  let maxx = -1e9;
  let miny = 1e9;
  let maxy = -1e9;
  for (let i = 0; i < pts.length; i++) {
    minx = Math.min(minx, pts[i][0]);
    maxx = Math.max(maxx, pts[i][0]);
    miny = Math.min(miny, pts[i][1]);
    maxy = Math.max(maxy, pts[i][1]);
  }
  for (let y = Math.floor(miny); y <= Math.ceil(maxy); y++) {
    for (let x = Math.floor(minx); x <= Math.ceil(maxx); x++) {
      if (inPoly(pts, x + 0.5, y + 0.5)) fn(x, y, polyEdgeDist(pts, x + 0.5, y + 0.5));
    }
  }
}
function polyEdgeDist(pts, x, y) {
  let best = 1e9;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0];
    const ay = pts[j][1];
    const bx = pts[i][0];
    const by = pts[i][1];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const s = clamp(((x - ax) * dx + (y - ay) * dy) / l2);
    const qx = x - (ax + s * dx);
    const qy = y - (ay + s * dy);
    best = Math.min(best, Math.sqrt(qx * qx + qy * qy));
  }
  return best;
}

/** Düzgün çokgen köşeleri (n kenar, merkez, yarıçap, başlangıç açısı rad). */
export function regularPoly(cx, cy, r, n, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
/** Yıldız köşeleri (n uç). */
export function starPoly(cx, cy, rOut, rIn, n, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 === 0 ? rOut : rIn;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/* ------------------------------------------------------------------------------------------------
 * Bileşik etkiler
 * ---------------------------------------------------------------------------------------------- */
/**
 * Kenar pahı: kenara `w` pikselden yakın yükseklik düşer/yükselir ve renk aydınlanır/kararır.
 * (Yalnızca tek başına duran blok dokularında; döşenen dokularda kenar sürekliliği bozulur.)
 */
export function bevel(t, w, strength = 0.25, colorK = 0.14) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dl = x;
      const dr = N - 1 - x;
      const dt = y;
      const db = N - 1 - y;
      const d = Math.min(dl, dr, dt, db);
      if (d >= w) continue;
      const k = 1 - d / w;
      const i = y * N + x;
      t.h[i] -= strength * k * 0.5;
      // Üst/sol aydınlık, alt/sağ karanlık: ışığı sabit bir yöne bağlama; çerçeve iç/dış ayrımı verir.
      const horiz = Math.min(dl, dr) <= Math.min(dt, db);
      const kk = 1 - colorK * k * (horiz ? (dl < dr ? -0.6 : 0.9) : (dt < db ? -0.6 : 1.1));
      t.c[i * 4] = clamp(t.c[i * 4] * kk);
      t.c[i * 4 + 1] = clamp(t.c[i * 4 + 1] * kk);
      t.c[i * 4 + 2] = clamp(t.c[i * 4 + 2] * kk);
    }
  }
}

/** Kenara yaklaşan koyu çerçeve çizgisi (c rengi, 1 piksel kalınlık, n kez). */
export function frame(t, widthPx, col, k = 1, height = -0.12) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, N - 1 - x, y, N - 1 - y);
      if (d < widthPx) {
        over(t, x, y, col[0], col[1], col[2], k);
        addH(t, x, y, height);
      }
    }
  }
}

/** Ölçeklenebilir ince tane: her pikselde hash'e göre ±k aydınlık. */
export function grain(t, seed, k, density = 1) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (density < 1 && rnd(x, y, seed + 77) > density) continue;
      const v = (rnd(x, y, seed) - 0.5) * 2 * k;
      shade(t, x, y, 1 + v);
    }
  }
}

/**
 * Yükseklikten türetilen basit boşluk (cavity) AO'su: komşu ortalamasından çukur olan yerler kararır.
 * atlas.js her dokuya uygular; painter ao değerleriyle çarpılır.
 */
export function cavityFromHeight(t, gain = 3.2) {
  const n = N;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) s += t.h[ix(x + dx, y + dy)];
      }
      const avg = s / 9;
      const d = avg - t.h[y * n + x];
      out[y * n + x] = clamp(1 - Math.max(0, d) * gain, 0.45, 1);
    }
  }
  for (let i = 0; i < n * n; i++) t.ao[i] *= out[i];
}

/** Şeffaf piksellerin rengini en yakın opak komşudan yay (bilinear/mip kenar halkasını önler). */
export function dilateColors(t, passes = 3) {
  const n = N;
  for (let p = 0; p < passes; p++) {
    const src = t.c.slice();
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        if (src[i + 3] > 0.02) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let w = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = ix(x + dx, y + dy) * 4;
            if (src[j + 3] > 0.02) {
              r += src[j];
              g += src[j + 1];
              b += src[j + 2];
              w++;
            }
          }
        }
        if (w > 0) {
          t.c[i] = r / w;
          t.c[i + 1] = g / w;
          t.c[i + 2] = b / w;
          // Kapsam 0 kalır; yalnızca renk taşınır (bir sonraki geçişte kaynak sayılması için küçük alfa).
          t.c[i + 3] = Math.max(t.c[i + 3], 0.0201 * (p === passes - 1 ? 0 : 1));
        }
      }
    }
  }
  for (let i = 3; i < n * n * 4; i += 4) {
    if (t.c[i] < 0.0205 && t.c[i] > 0.02) t.c[i] = 0;
  }
}
