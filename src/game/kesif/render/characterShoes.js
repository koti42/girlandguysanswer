/*
 * KEŞİF karakter ayakkabıları: katalogdaki 3 stil (spor, bot, neon) için z boyunca kesitli geometri.
 * characterWear.js tarafından WEAR_TABLES.shoes olarak kullanılır.
 */
import { sweep, tube, ellipsoid, softBox, lerp, shade, mixHex } from './characterGeo.js';
import { E } from './characterBody.js';

const GOLD = 0xf2c14e;

/* ------------------------------------------------------------------------------------------------
 * AYAKKABILAR (z boyunca kesitli, tek parça gövde + taban; bilek yakası/konç ayrı)
 * ---------------------------------------------------------------------------------------------- */
// [z, yarıGenişlik, yarıYükseklik, merkezY] — burundan topuğa
const SHOE_UPPER = [
  [-0.228, 0.011, 0.012, 0.03], [-0.205, 0.03, 0.022, 0.04], [-0.15, 0.043, 0.033, 0.05], [-0.08, 0.043, 0.04, 0.058],
  [-0.01, 0.04, 0.048, 0.066], [0.04, 0.037, 0.05, 0.068], [0.078, 0.024, 0.038, 0.058],
];
const SHOE_SOLE = [
  [-0.236, 0.014, 0.012, 0.012], [-0.21, 0.036, 0.014, 0.014], [-0.15, 0.047, 0.015, 0.015], [0.0, 0.045, 0.015, 0.015],
  [0.05, 0.043, 0.016, 0.016], [0.088, 0.027, 0.014, 0.014],
];
/** Gövde üst yüzeyinin y'si (bağcık yerleşimi için), z'de doğrusal aradeğer. */
function shoeTop(z) {
  const k = SHOE_UPPER;
  for (let i = 0; i < k.length - 1; i++) {
    if (z <= k[i + 1][0]) {
      const u = (z - k[i][0]) / (k[i + 1][0] - k[i][0]);
      return lerp(k[i][3] + k[i][2], k[i + 1][3] + k[i + 1][2], u);
    }
  }
  return k[k.length - 1][3] + k[k.length - 1][2];
}
function loftZ(ctx, rows, k, o = {}) {
  const keys = rows.map((r) => ({ y: r[0] * k, rx: r[1] * k * (o.wide || 1), rz: r[2] * (o.tall || 1), cz: -r[3] }));
  return sweep(keys, { seg: ctx.hi ? 10 : 6, sub: 1 });
}

function shoeBase(b, ctx, s, o) {
  const { d, kiz, W } = ctx;
  const n = s < 0 ? 'L' : 'R';
  const x = s * d.legX;
  const k = kiz ? 0.94 : 1;
  const wF = W['foot' + n];
  const rot = [Math.PI / 2, 0, 0];
  b.add(loftZ(ctx, SHOE_SOLE, k, { tall: o.sole || 1 }), {
    color: o.soleColor, mesh: o.soleMesh || 'body', weights: wF, xf: { pos: [x, 0, 0], rot },
    colorFn: (px, py, pz, nx, ny, nz, c) => { if (ny < -0.4) c.multiplyScalar(0.8); },
  });
  if (o.glowColor) {
    b.add(loftZ(ctx, SHOE_SOLE.map((r) => [r[0], r[1] * 1.012, 0.0035, r[3] + 0.014]), k), {
      color: o.glowColor, mesh: 'glow', weights: wF, xf: { pos: [x, 0, 0], rot },
    });
  }
  b.add(loftZ(ctx, SHOE_UPPER, k), { color: o.color, mesh: o.mesh || 'body', weights: wF, xf: { pos: [x, 0, 0], rot }, colorFn: o.colorFn });
  // bilek yakası / konç
  const topY = o.shaft || 0.145;
  const r0 = (o.shaftR || 0.043) * k;
  b.add(sweep([
    { y: 0.075, rx: 0.039 * k, rz: 0.047, cz: 0.014 }, { y: 0.11, rx: r0, rz: r0 + 0.005, cz: 0.012 }, { y: topY, rx: r0 * 1.03, rz: r0 * 1.03 + 0.005, cz: 0.006 },
  ], { seg: ctx.seg.body, sub: 1, capBottom: false, capTop: false }), {
    color: o.color, mesh: o.mesh || 'body', weights: wF, xf: { pos: [x, 0, 0] }, colorFn: o.colorFn,
  });
  b.add(sweep([{ y: topY - 0.012, rx: r0 * 1.07, rz: r0 * 1.07 + 0.006, cz: 0.006 }, { y: topY + 0.005, rx: r0 * 1.07, rz: r0 * 1.07 + 0.006, cz: 0.006 }], { seg: ctx.seg.body, sub: 1 }), {
    color: o.trim, mesh: o.mesh || 'body', weights: wF, xf: { pos: [x, 0, 0] },
  });
  return { x, k, wF, n, s, hi: ctx.hi };
}

function laces(b, r, color, zs, width = 0.023) {
  if (!r.hi) return;
  zs.forEach((z) => {
    const y = shoeTop(z * (1 / r.k)) + 0.0025;
    b.add(tube([[r.x - width, y - 0.004, z], [r.x, y + 0.002, z], [r.x + width, y - 0.004, z]], 0.0028, { seg: 4 }), { color, weights: r.wF });
  });
}

export const SHOE_BUILDERS = {
  spor(b, ctx) {
    const c = ctx.col.shoes;
    [-1, 1].forEach((s) => {
      const r = shoeBase(b, ctx, s, { color: c, soleColor: 0xf6f4ef, trim: shade(c, 0.85), shaft: 0.13 });
      const k = r.k;
      // burun kapağı, yan şerit, bağcık, dil
      b.add(ellipsoid(0.0415 * k, 0.0215, 0.05 * k, { seg: ctx.hi ? 10 : 6, rings: ctx.hi ? 6 : 3 }), { color: 0xf6f4ef, weights: r.wF, xf: { pos: [r.x, 0.044, -0.168 * k], rot: [0.14, 0, 0] } });
      b.add(tube([[r.x + s * 0.0435, 0.052, 0.045 * k], [r.x + s * 0.0445, 0.058, -0.05 * k], [r.x + s * 0.041, 0.05, -0.14 * k]], 0.0034, { seg: 4 }), { color: 0xffffff, weights: r.wF });
      laces(b, r, 0xffffff, [-0.02 * k, -0.05 * k, -0.08 * k, -0.11 * k]);
      if (!ctx.hi) return;
      b.add(softBox(0.019, 0.03, 0.006, { seg: 8, rings: 5 }), { color: shade(c, 1.08), weights: r.wF, xf: { pos: [r.x, 0.133, -0.02 * k], rot: [-0.5, 0, 0] } });
      b.add(softBox(0.012, 0.016, 0.006, { seg: 6, rings: 4 }), { color: 0xffffff, weights: r.wF, xf: { pos: [r.x, 0.082, 0.082 * k], rot: [-0.3, 0, 0] } });
    });
  },
  bot(b, ctx) {
    const c = ctx.col.shoes;
    const leather = (x, y, z, nx, ny, nz, col) => { if (ny < -0.5) col.multiplyScalar(0.8); };
    [-1, 1].forEach((s) => {
      const r = shoeBase(b, ctx, s, { color: c, soleColor: 0x2a2421, sole: 1.5, trim: shade(c, 0.7), shaft: 0.27, shaftR: 0.052, mesh: 'gloss', colorFn: leather });
      const k = r.k;
      b.add(softBox(0.04 * k, 0.017, 0.034, { seg: 8, rings: 5 }), { color: 0x1d1917, weights: r.wF, xf: { pos: [r.x, 0.014, 0.05 * k] } });
      laces(b, r, shade(c, 1.45), [-0.02 * k, -0.05 * k, -0.08 * k]);
      for (let i = 0; i < (ctx.hi ? 4 : 0); i++) {
        b.add(tube([[r.x - 0.036, 0.13 + i * 0.034, -0.038 + i * 0.0], [r.x, 0.13 + i * 0.034, -0.054], [r.x + 0.036, 0.13 + i * 0.034, -0.038]], 0.003, { seg: 4 }), { color: shade(c, 1.45), weights: r.wF });
      }
      if (!ctx.hi) return;
      b.add(softBox(0.045 * k, 0.03, 0.018, { seg: 8, rings: 5 }), { color: shade(c, 0.78), weights: r.wF, mesh: 'gloss', xf: { pos: [r.x, 0.05, -0.2 * k] } });
      b.add(ellipsoid(0.011, 0.011, 0.011, { seg: 8, rings: 5 }), { color: GOLD, mesh: 'gloss', weights: r.wF, xf: { pos: [r.x + s * 0.054 * k, 0.2, 0.0] } });
    });
  },
  neon(b, ctx) {
    const c = ctx.col.shoes;
    const neonC = mixHex(c, 0xffffff, 0.15);
    [-1, 1].forEach((s) => {
      const r = shoeBase(b, ctx, s, { color: 0x1e1b2a, soleColor: 0xf3f1ff, trim: shade(c, 0.9), shaft: 0.14, glowColor: neonC, soleMesh: 'body' });
      const k = r.k;
      b.add(ellipsoid(0.0415 * k, 0.0215, 0.05 * k, { seg: ctx.hi ? 10 : 6, rings: ctx.hi ? 6 : 3 }), { color: neonC, mesh: 'glow', weights: r.wF, xf: { pos: [r.x, 0.043, -0.168 * k], rot: [0.14, 0, 0] } });
      laces(b, r, neonC, [-0.03 * k, -0.07 * k, -0.11 * k]);
      b.add(tube([[r.x + s * 0.0445, 0.062, 0.07 * k], [r.x + s * 0.0445, 0.12, 0.052 * k]], 0.0036, { seg: 4 }), { color: neonC, mesh: 'glow', weights: r.wF });
      b.add(tube([[r.x + s * 0.0435, 0.05, 0.03 * k], [r.x + s * 0.0445, 0.055, -0.1 * k]], 0.003, { seg: 4 }), { color: neonC, mesh: 'glow', weights: r.wF });
    });
  },
};

