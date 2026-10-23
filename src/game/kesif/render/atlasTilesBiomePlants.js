/*
 * KEŞİF render — BİYOM genişletmesi: çapraz bitki ve sprite dokuları (sim/biomeData.js, kimlik 160–199).
 * Bambu, mercan yelpazesi, eğrelti, çiçekler (papatya, çan çiçeği, lavanta, lale, şakayık), kuru çalı, kamış, parlak meyve.
 * Alfa=0 zeminli sprite'lardır; saf ve belirlenimcidir (canvas/Math.random yok).
 */
import {
  N, rnd, ihash, hex, mixc, clamp, lerp, put, over, setH, setE, setRo, setTm, disc, ellipse, setSpriteClip, ix,
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

/** Yay şeklinde incelen sap/bıçak (atlasTilesFlora.blade ile aynı). colFn(s, side) → [r,g,b]. tm: ton maskesi. */
function blade(t, x0, y0, x1, y1, bend, w0, w1, colFn, hAmt, tm) {
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
      setH(t, x, y, 0.6 + (hAmt === undefined ? 0.4 : hAmt) * (1 - d) * 0.5);
      setTm(t, x, y, tm === undefined ? 1 : tm);
    });
  }
}


/* ================================================================================================
 * BAMBU (sprite + tahta)
 * ============================================================================================== */
function paintBamboo(t, seed) {
  clearSprite(t);
  const cx = 16;
  const w = 3; // yarı genişlik
  const nodes = [3, 11, 19, 27];
  for (let y = 0; y < N; y++) {
    for (let x = cx - w; x <= cx + w - 1; x++) {
      const k = (x - (cx - w)) / (2 * w - 1); // 0..1 silindir
      const light = 0.62 + Math.sin(k * Math.PI) * 0.4 - (k > 0.7 ? 0.08 : 0);
      let r = 0.42 * light;
      let g = 0.64 * light;
      let b = 0.2 * light;
      const fiber = (ihash(x, y >> 2, seed) & 7) / 7;
      r *= 0.94 + fiber * 0.1;
      g *= 0.94 + fiber * 0.1;
      let h = 0.65 + Math.sin(k * Math.PI) * 0.2;
      for (let n = 0; n < nodes.length; n++) {
        const d = y - nodes[n];
        if (d === 0 || d === 1) {
          r = lerp(r, 0.55, 0.45);
          g = lerp(g, 0.66, 0.4);
          b = lerp(b, 0.24, 0.4);
          h = 0.85;
        } else if (d === 2) {
          r *= 0.7;
          g *= 0.72;
          b *= 0.7;
          h = 0.5;
        }
      }
      put(t, x, y, r, g, b, 1);
      setH(t, x, y, h);
      setTm(t, x, y, 0);
      setRo(t, x, y, 0.55);
    }
  }
  // boğumlardan çıkan yapraklar
  const leaf = (x0, y0, dirx, len) => {
    blade(t, x0, y0, x0 + dirx * len, y0 - len * 0.3, -dirx * 1.2, 1.2, 0.2, (s, side) => {
      const l = 0.55 + s * 0.35 + side * 0.04;
      return [l * 0.55, l * 0.85, l * 0.3];
    }, 0.4, 0);
  };
  leaf(cx + w, 11, 1, 9);
  leaf(cx - w, 19, -1, 9);
  leaf(cx + w, 3, 1, 7);
  leaf(cx - w, 27, -1, 6);
  leaf(cx + w, 25, 1, 5);
  t.bump = 0.9;
}


function paintCoralFan(t, seed) {
  clearSprite(t);
  const rays = 13;
  for (let i = 0; i < rays; i++) {
    const a = -Math.PI / 2 + ((i / (rays - 1)) - 0.5) * 2.5;
    const len = 16 + (ihash(i, 3, seed) & 3);
    const x1 = 16 + Math.cos(a) * len;
    const y1 = 30 + Math.sin(a) * len;
    blade(t, 16, 30.5, x1, y1, ((ihash(i, 5, seed) & 7) - 3.5) * 0.4, 1.2, 0.55, (s, side) => {
      const l = 0.7 + s * 0.3 + side * 0.05;
      return [0.95 * l, (0.35 + s * 0.2) * l, (0.6 + s * 0.15) * l];
    }, 0.5, 0);
  }
  // yelpaze zarı: ışınlar arası dolgu
  for (let y = 4; y < 30; y++) {
    for (let x = 4; x < 28; x++) {
      const dx = x + 0.5 - 16;
      const dy = y + 0.5 - 30;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dx, -dy);
      if (r < 17 && r > 4 && Math.abs(a) < 1.25) {
        const i = ix(x, y) * 4;
        if (t.c[i + 3] > 0) continue;
        const web = Math.sin(a * 26 + r * 0.3) * 0.5 + 0.5;
        if (web > 0.45 && r < 15.5 - Math.abs(a) * 1.5) {
          put(t, x, y, 0.88 - r * 0.012, 0.28 + web * 0.12, 0.52 + r * 0.01, 0.92);
          setH(t, x, y, 0.55);
          setTm(t, x, y, 0);
        }
      }
    }
  }
  t.bump = 0.9;
}


/* ================================================================================================
 * ÇAPRAZ BİTKİLER: eğrelti, çiçekler, kuru çalı, kamış, parlak meyve
 * ============================================================================================== */
function paintFern(t, seed) {
  clearSprite(t);
  const fronds = [[-1.1, 13], [-0.65, 18], [-0.2, 21], [0.25, 21], [0.7, 18], [1.15, 13]];
  fronds.forEach((fr, i) => {
    const ang = fr[0];
    const len = fr[1];
    const x1 = 16 + Math.sin(ang) * len;
    const y1 = 31 - Math.cos(ang) * len * 0.95;
    const bend = Math.sin(ang) * 3.4;
    blade(t, 16 + Math.sin(ang) * 1.5, 31.5, x1, y1, bend, 1.0, 0.4, (s) => [0.32 + s * 0.06, 0.52 + s * 0.1, 0.24], 0.45, 1);
    // küçük yaprakçıklar
    const leaflets = 8;
    for (let k = 1; k <= leaflets; k++) {
      const s = k / (leaflets + 1);
      const off = Math.sin(Math.PI * s) * bend;
      const dx = x1 - 16;
      const dy = y1 - 31.5;
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = 16 + dx * s + (-dy / l) * off;
      const py = 31.5 + dy * s + (dx / l) * off;
      const sz = (1 - s * 0.7) * 3.3 + 0.5;
      [-1, 1].forEach((side) => {
        const ex = px + side * sz * Math.cos(ang + 0.6 * side) * 0.9;
        const ey = py - sz * 0.35;
        ellipse(ex, ey, sz * 0.7, 0.95, (x, y, d) => {
          const tone = 0.62 + (1 - d) * 0.3 + rnd(i, k, seed) * 0.12;
          put(t, x, y, tone * 0.78, tone, tone * 0.62, 1);
          setH(t, x, y, 0.55 + (1 - d) * 0.25);
          setTm(t, x, y, 1);
        });
      });
    }
  });
  t.bump = 0.9;
}

function petalFlower(t, cx, cy, n, pr, rx, ry, cols, centre, rot) {
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n + rot;
    const px = cx + Math.cos(a) * pr;
    const py = cy + Math.sin(a) * pr;
    ellipse(px, py, rx, ry, (x, y, d) => {
      const dxy = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const k = clamp(dxy / (pr + rx));
      const m = k < 0.5 ? mixc(cols[2], cols[1], k * 2) : mixc(cols[1], cols[0], (k - 0.5) * 2);
      const sh = 0.84 + (1 - d) * 0.22;
      put(t, x, y, m[0] * sh, m[1] * sh, m[2] * sh, 1);
      setH(t, x, y, 0.7 + (1 - d) * 0.15);
      setTm(t, x, y, 0);
      setRo(t, x, y, 0.55);
    });
  }
  disc(cx, cy, centre.r, (x, y, d) => {
    const m = centre.c;
    put(t, x, y, m[0] * (0.85 + (1 - d) * 0.2), m[1] * (0.85 + (1 - d) * 0.2), m[2], 1);
    setH(t, x, y, 0.85);
    setTm(t, x, y, 0);
  });
}
function stemAndLeaves(t, x0, topX, topY, bend) {
  blade(t, x0, 31.5, topX, topY, bend, 0.95, 0.7, (s, side) => [0.22 + s * 0.06 + side * 0.03, 0.48 + s * 0.08, 0.17], 0.4, 1);
  blade(t, x0, 27, x0 - 8, 20.5, -2.5, 1.5, 0.25, (s) => [0.2 + s * 0.08, 0.5 + s * 0.12, 0.16], 0.4, 1);
  blade(t, x0, 24, x0 + 8, 19.5, 2.5, 1.4, 0.25, (s) => [0.22 + s * 0.08, 0.52 + s * 0.1, 0.17], 0.4, 1);
}

function paintDaisy(t) {
  clearSprite(t);
  stemAndLeaves(t, 16, 15.5, 13, 1.4);
  petalFlower(t, 15.5, 11, 12, 3.9, 1.1, 2.7, [hex(0xf2f6f8), hex(0xffffff), hex(0xe4eaee)], { r: 2.2, c: [0.95, 0.72, 0.12] }, 0.2);
  put(t, 15, 10, 0.6, 0.4, 0.05, 1);
  t.bump = 1.0;
}
function paintBluebell(t) {
  clearSprite(t);
  blade(t, 16, 31.5, 18, 9, 3.2, 0.95, 0.65, (s) => [0.22 + s * 0.05, 0.46 + s * 0.08, 0.2], 0.4, 1);
  blade(t, 16, 28, 8, 22, -2.2, 1.4, 0.25, (s) => [0.2 + s * 0.08, 0.5 + s * 0.12, 0.16], 0.4, 1);
  blade(t, 16, 26, 24, 21, 2.2, 1.4, 0.25, (s) => [0.22 + s * 0.08, 0.52 + s * 0.1, 0.17], 0.4, 1);
  // sarkan çanlar
  [[16.5, 12], [19.5, 14.5], [13.5, 15.5], [18.5, 8], [15, 9.5]].forEach((b, i) => {
    ellipse(b[0], b[1] + 1.4, 2.0, 2.7, (x, y, d, nx) => {
      const k = 0.7 + (1 - d) * 0.32 - nx * 0.08;
      put(t, x, y, 0.3 * k + 0.1, 0.4 * k + 0.1, 0.95 * k, 1);
      setH(t, x, y, 0.75 + (1 - d) * 0.15);
      setTm(t, x, y, 0);
      setRo(t, x, y, 0.5);
    });
    put(t, Math.round(b[0]), Math.round(b[1] + 3.8), 0.78, 0.84, 1, 1);
    setTm(t, Math.round(b[0]), Math.round(b[1] + 3.8), 0);
    void i;
  });
  t.bump = 1.0;
}
function paintLavender(t, seed) {
  clearSprite(t);
  [[12, 7], [16, 4], [20, 8]].forEach((s, si) => {
    blade(t, 16 + (s[0] - 16) * 0.3, 31.5, s[0], s[1] + 8, (si - 1) * 1.2, 0.9, 0.55, (u) => [0.28 + u * 0.05, 0.48 + u * 0.08, 0.26], 0.4, 1);
    for (let k = 0; k < 9; k++) {
      const y = s[1] + k * 1.6;
      const w = 1.2 + (k < 3 ? k * 0.2 : 0.6);
      [-1, 1].forEach((side) => {
        const e = ihash(si, k * 2 + (side > 0 ? 1 : 0), seed);
        disc(s[0] + side * (w * 0.55), y + 1, 1.35, (x, yy, d) => {
          const tone = 0.72 + (1 - d) * 0.3 + (e & 7) * 0.02;
          put(t, x, yy, 0.62 * tone, 0.4 * tone, 0.9 * tone, 1);
          setH(t, x, yy, 0.7 + (1 - d) * 0.15);
          setTm(t, x, yy, 0);
        });
      });
    }
  });
  blade(t, 16, 28, 9, 23, -1.5, 1.3, 0.25, (s) => [0.25 + s * 0.05, 0.5 + s * 0.1, 0.2], 0.4, 1);
  blade(t, 16, 28, 23, 23, 1.5, 1.3, 0.25, (s) => [0.25 + s * 0.05, 0.5 + s * 0.1, 0.2], 0.4, 1);
  t.bump = 1.0;
}
function paintTulip(t) {
  clearSprite(t);
  blade(t, 16, 31.5, 16, 14, 0.8, 1.0, 0.8, (s) => [0.2 + s * 0.05, 0.5 + s * 0.08, 0.18], 0.4, 1);
  blade(t, 16, 29, 8, 16, -3, 2.0, 0.3, (s) => [0.2 + s * 0.08, 0.52 + s * 0.12, 0.18], 0.4, 1);
  blade(t, 16, 27, 24, 17, 3, 2.0, 0.3, (s) => [0.22 + s * 0.08, 0.54 + s * 0.1, 0.19], 0.4, 1);
  // çanak şeklinde taç
  const cols = [hex(0xffb458), hex(0xf0771c), hex(0xb8480e)];
  ellipse(16, 10.5, 4.4, 5.2, (x, y, d, nx, ny) => {
    if (ny < -0.2 && Math.abs(nx) < 0.25) return; // üst çentik
    const k = clamp(0.35 + (1 - d) * 0.5 + (nx > 0 ? -0.15 : 0.1));
    const m = k < 0.5 ? mixc(cols[2], cols[1], k * 2) : mixc(cols[1], cols[0], (k - 0.5) * 2);
    put(t, x, y, m[0], m[1], m[2], 1);
    setH(t, x, y, 0.75 + (1 - d) * 0.2);
    setTm(t, x, y, 0);
    setRo(t, x, y, 0.5);
  });
  for (let y = 7; y < 15; y++) {
    over(t, 16, y, 0.7, 0.28, 0.06, 0.5);
    setTm(t, 16, y, 0);
  }
  t.bump = 1.0;
}
function paintPeony(t) {
  clearSprite(t);
  stemAndLeaves(t, 16, 15.5, 14, 1.2);
  petalFlower(t, 15.5, 10.5, 8, 4.0, 3.2, 3.2, [hex(0xffd6e4), hex(0xf27aa6), hex(0xb8386a)], { r: 1.6, c: [0.98, 0.78, 0.2] }, 0.2);
  petalFlower(t, 15.5, 10.5, 6, 2.1, 2.2, 2.2, [hex(0xffe4ee), hex(0xff9ec0), hex(0xd04c82)], { r: 1.4, c: [0.98, 0.8, 0.22] }, 0.55);
  t.bump = 1.0;
}

function paintDeadBush(t) {
  clearSprite(t);
  const br = [[16, 31.5, 15, 14, 1.2], [15.5, 24, 8, 17, -1.5], [16, 21, 24, 15, 1.8], [15, 17, 10, 8, -1.2], [16.5, 18, 21, 8, 1.2], [14, 27, 6, 25, -1], [17, 27, 26, 24, 1]];
  br.forEach((b, i) => {
    blade(t, b[0], b[1], b[2], b[3], b[4], i === 0 ? 1.3 : 0.85, 0.35, (s, side) => {
      const l = 0.5 + s * 0.22 + side * 0.04;
      return [0.5 * l + 0.1, 0.36 * l + 0.06, 0.2 * l + 0.03];
    }, 0.5, 0);
  });
  t.bump = 1.0;
}

function paintReed(t) {
  clearSprite(t);
  const stems = [[8, 4, 0.5], [13, 9, -0.4], [17, 3, 0.2], [22, 7, -0.6], [26, 12, 0.7]];
  stems.forEach((s, i) => {
    blade(t, s[0] + (16 - s[0]) * 0.15, 31.5, s[0], s[1] + 5, s[2] * 1.8, 0.85, 0.5, (u) => [0.34 + u * 0.1, 0.52 + u * 0.1, 0.22], 0.4, 1);
    // kahverengi püskül (kamış başı)
    if (i % 2 === 0) {
      ellipse(s[0], s[1] + 2.5, 1.35, 3.6, (x, y, d) => {
        const k = 0.6 + (1 - d) * 0.35;
        put(t, x, y, 0.45 * k, 0.28 * k, 0.14 * k, 1);
        setH(t, x, y, 0.8);
        setTm(t, x, y, 0);
      });
    }
  });
  // uzun şerit yapraklar
  blade(t, 16, 31.5, 4, 14, -3, 1.4, 0.2, (s) => [0.3 + s * 0.06, 0.52 + s * 0.1, 0.22], 0.4, 1);
  blade(t, 16, 31.5, 28, 16, 3, 1.4, 0.2, (s) => [0.3 + s * 0.06, 0.52 + s * 0.1, 0.22], 0.4, 1);
  t.bump = 0.9;
}

function paintGlowBerries(t, seed) {
  clearSprite(t);
  // yukarıdan sarkan sarmaşık + parlayan meyveler
  for (let k = 0; k < 2; k++) {
    const x0 = 10 + k * 12;
    for (let y = 0; y < N; y++) {
      const x = x0 + Math.sin((y / 31) * Math.PI * 2.2 + k * 2.2) * 2;
      disc(x, y + 0.5, 0.9, (xx, yy) => {
        put(t, xx, yy, 0.25, 0.4, 0.16, 1);
        setH(t, xx, yy, 0.6);
        setTm(t, xx, yy, 0);
      });
    }
    for (let i = 0; i < 5; i++) {
      const y = 2 + i * 6 + k * 3;
      const side = (i + k) % 2 ? 1 : -1;
      const x = x0 + Math.sin((y / 31) * Math.PI * 2.2 + k * 2.2) * 2 + side * 3;
      ellipse(x, y + 1, 3, 1.9, (xx, yy, d) => {
        const l = 0.45 + (1 - d) * 0.2 + rnd(i, k, seed) * 0.12;
        put(t, xx, yy, l * 0.45, l * 0.9, l * 0.35, 1);
        setH(t, xx, yy, 0.55 + (1 - d) * 0.2);
        setTm(t, xx, yy, 0);
      });
    }
    // meyveler
    for (let i = 0; i < 3; i++) {
      const y = 7 + i * 9 + k * 4;
      const x = x0 + Math.sin((y / 31) * Math.PI * 2.2 + k * 2.2) * 2 + ((i + k) % 2 ? 2.4 : -2.4);
      disc(x, y, 2.1, (xx, yy, d, nx, ny) => {
        const kk = 0.8 + (1 - d) * 0.35 - (nx + ny) * 0.1;
        put(t, xx, yy, 1 * kk, 0.72 * kk, 0.18 * kk, 1);
        setH(t, xx, yy, 0.85);
        setE(t, xx, yy, 0.7 + (1 - d) * 0.3);
        setTm(t, xx, yy, 0);
        setRo(t, xx, yy, 0.3);
      });
      put(t, Math.round(x) - 1, Math.round(y) - 1, 1, 0.96, 0.7, 1);
      setE(t, Math.round(x) - 1, Math.round(y) - 1, 1);
    }
  }
  t.bump = 0.9;
}

export const BIOME_PLANT_PAINTERS = Object.freeze({
  bambu: paintBamboo,
  mercan_yelpaze: paintCoralFan,
  eğrelti: paintFern,
  papatya: paintDaisy,
  çan_çiçeği: paintBluebell,
  lavanta: paintLavender,
  lale: paintTulip,
  şakayık: paintPeony,
  parlak_meyve: paintGlowBerries,
  kuru_çalı: paintDeadBush,
  kamış: paintReed,
});
