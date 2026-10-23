/*
 * KEŞİF karakter giysi/saç/aksesuar geometrisi (katalogdaki HER stil için ayrı geometri).
 *
 * Stil anahtarı → kurucu tabloları (HAIR_BUILDERS, TOP_BUILDERS, BOTTOM_BUILDERS, SHOE_BUILDERS,
 * ACC_BUILDERS). Bilinmeyen stil güvenli varsayılana düşer (kısa saç, tişört, kot, spor, aksesuarsız).
 * Giysi, çıplak gövdenin üstünde 6-14 mm şişirilmiş kabuktur ve aynı yumuşak ağırlıkları kullanır;
 * böylece dirsek/diz/omuz bükülürken kumaş da yumuşakça gerilir.
 */
import {
  sweep, tube, ellipsoid, softBox, smooth01, lerp, clamp, shade, mixHex, chainWeights, TAU,
} from './characterGeo.js';
import { SHOE_BUILDERS } from './characterShoes.js';
import {
  torsoKeys, legKeys, armKeys, headKeys, bustBump, sliceKeys, offsetKeys, shiftKeys, headSection, headFaceZ, headBackZ, E, headNormalAt,
} from './characterBody.js';

const GOLD = 0xf2c14e;
const ACC = {
  capMain: 0xe5483f, capPanel: 0xfff4ec, beanie: 0xe2b94c, beanieCuff: 0xc79a33, pom: 0xfff4dd,
  frame: 0x2a2440, lens: 0x16121f, phone: 0xf4f1ff, phoneCushion: 0xff6b9e, earInner: 0xffa8c5,
  gems: [0xff3b6b, 0x38bdf8, 0x34f5a0],
};

/* ------------------------------------------------------------------------------------------------
 * Ortak yardımcılar
 * ---------------------------------------------------------------------------------------------- */
/** Dikey kemer/bileklik bandı: [y0,y1] aralığında ofsetli silindirik kabuk. */
function band(b, ctx, keys, y0, y1, off, o) {
  const k = sliceKeys(keys, y0, y1, 2);
  const piece = sweep(offsetKeys(k, off), { seg: o.seg || ctx.seg.torso, sub: 1 });
  if (o.bump) bustBump(piece, ctx, o.bump);
  b.add(piece, { color: o.color, weights: o.weights, mesh: o.mesh || 'body', colorFn: o.colorFn });
}

/** Kapalı halka boru (bilezik, toka, yaka). */
function loop(b, o) {
  const n = o.n || 14;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    pts.push([o.c[0] + Math.cos(a) * o.rx, o.c[1] + (o.tilt || 0) * Math.sin(a), o.c[2] + Math.sin(a) * o.rz]);
  }
  b.add(tube(pts, o.r, { seg: o.seg || 5, cap: 'none' }), { color: o.color, weights: o.weights, mesh: o.mesh || 'body' });
}

function foldShade(hemY, topY, dark = 0.88, hi = 1.04) {
  return (x, y, z, nx, ny, nz, c) => {
    const k = clamp((y - hemY) / (topY - hemY), 0, 1);
    c.multiplyScalar(lerp(dark, hi, k));
    if (ny < -0.5) c.multiplyScalar(0.85);
  };
}

/* ------------------------------------------------------------------------------------------------
 * ÜSTLER
 * ---------------------------------------------------------------------------------------------- */
/** Gövde kesitinin y yüksekliğindeki ön yüzü (z, -ileri) ve yarı genişliği; ofset kabuk kalınlığıdır. */
function torsoFront(ctx, y, off) {
  const k = sliceKeys(torsoKeys(ctx.kiz), y, y, 2)[0];
  return (k.cz || 0) - (k.rz + off);
}
function torsoBack(ctx, y, off) {
  const k = sliceKeys(torsoKeys(ctx.kiz), y, y, 2)[0];
  return (k.cz || 0) + (k.rz + off);
}
function torsoSide(ctx, y, off) {
  return sliceKeys(torsoKeys(ctx.kiz), y, y, 2)[0].rx + off;
}

function shirtBody(b, ctx, o) {
  const { kiz, W } = ctx;
  const keys = sliceKeys(torsoKeys(kiz), o.hem, 1.452, o.rings || (ctx.hi ? 11 : 6)).map((k) => ({ ...k, flare: 0.014 * clamp((1.0 - k.y) / 0.16, 0, 1) }));
  const hipFloor = (y) => (y < 1.0 ? ctx.d.legX + sliceKeys(legKeys(kiz), y, y, 2)[0].rx + 0.024 : 0);
  const piece = sweep(keys.map((k) => ({ ...k, rx: Math.max(k.rx + o.off + k.flare, hipFloor(k.y)), rz: k.rz + o.off + k.flare })), { seg: ctx.seg.torso, sub: 1, capBottom: false, capTop: false });
  if (o.bust !== false) bustBump(piece, ctx, o.off * 0.9 + 0.006);
  b.add(piece, {
    color: o.color, weights: W.torso, mesh: o.mesh || 'body', colorFn: o.colorFn || foldShade(o.hem, 1.45, 0.86, 1.05),
  });
}

function sleeves(b, ctx, o) {
  const { kiz, d } = ctx;
  [['L', -1], ['R', 1]].forEach(([n, s]) => {
    const keys = shiftKeys(sliceKeys(armKeys(kiz), o.end, 1.4, o.rings || (ctx.hi ? 7 : 4)), s * d.shX);
    b.add(sweep(offsetKeys(keys, o.off), { seg: ctx.seg.body, sub: 1, capBottom: false, capTop: true }), {
      color: o.color, weights: ctx.W['arm' + n], mesh: o.mesh || 'body', colorFn: foldShade(o.end, 1.4, 0.88, 1.03),
    });
    b.add(E(ctx, 0.05 + o.off, 0.047 + o.off, 0.049 + o.off, 1), {
      color: o.color, weights: ctx.W['arm' + n], mesh: o.mesh || 'body', xf: { pos: [s * d.shX, 1.352, 0] },
    });
    if (o.cuff) {
      const ck = shiftKeys(armKeys(kiz), s * d.shX);
      band(b, ctx, ck, o.end - 0.004, o.end + o.cuff, o.off + 0.003, { color: o.cuffColor, weights: ctx.W['arm' + n], mesh: o.mesh });
    }
  });
}

function collar(b, ctx, o) {
  const f = ctx.kiz ? 0.92 : 1;
  b.add(sweep([{ y: o.y0, rx: o.r * f, rz: o.r * f * 1.03 }, { y: o.y1, rx: (o.r2 || o.r) * f, rz: (o.r2 || o.r) * f * 1.03 }], { seg: ctx.seg.body, sub: 1, capBottom: false, capTop: false }), {
    color: o.color, weights: ctx.W.neck, mesh: o.mesh || 'body',
  });
}

/** Üst stiline göre kol kabuğu parametreleri (karakter ve birinci şahıs kolları paylaşır). */
const SLEEVE_SPECS = {
  hoodie: (ctx) => ({ end: 0.84, off: 0.016, color: ctx.col.top, cuff: 0.04, cuffColor: shade(ctx.col.top, 0.74) }),
  tisort: (ctx) => ({ end: 1.17, off: 0.012, color: ctx.col.top, cuff: 0.012, cuffColor: shade(ctx.col.top, 0.85) }),
  ceket: (ctx) => { const c = shade(ctx.col.top, 0.62); return { end: 0.85, off: 0.015, color: c, cuff: 0.035, cuffColor: shade(c, 0.7), mesh: 'gloss' }; },
  forma: (ctx) => ({ end: 1.15, off: 0.012, color: ctx.col.top, cuff: 0.016, cuffColor: 0xffffff }),
  kazak: (ctx) => ({ end: 0.84, off: 0.018, color: ctx.col.top, cuff: 0.045, cuffColor: shade(ctx.col.top, 0.76) }),
};

const TOP_BUILDERS = {
  hoodie(b, ctx) {
    const c = ctx.col.top;
    const dark = shade(c, 0.74);
    const light = mixHex(c, 0xffffff, 0.6);
    const OFF = 0.02;
    shirtBody(b, ctx, { hem: 0.83, off: OFF, color: c });
    band(b, ctx, torsoKeys(ctx.kiz), 0.82, 0.87, OFF + 0.019, { color: dark, weights: ctx.W.torso });
    sleeves(b, ctx, SLEEVE_SPECS.hoodie(ctx));
    // kapüşon: ensede yığılmış
    b.add(E(ctx, 0.088, 0.05, 0.062, 2), { color: c, weights: ctx.W.neck, xf: { pos: [0, 1.455, 0.066], rot: [0.5, 0, 0] } });
    b.add(E(ctx, 0.062, 0.036, 0.04, 1), { color: dark, weights: ctx.W.neck, xf: { pos: [0, 1.466, 0.092], rot: [0.5, 0, 0] } });
    collar(b, ctx, { y0: 1.44, y1: 1.475, r: 0.066, color: dark });
    // kanguru cebi
    b.add(softBox(0.078, 0.052, 0.012, { seg: 10, rings: 6, power: 3.5 }), {
      color: shade(c, 0.9), weights: ctx.W.torso, xf: { pos: [0, 1.0, torsoFront(ctx, 1.0, OFF) - 0.002], rot: [-0.06, 0, 0] },
    });
    // iplikler
    [-1, 1].forEach((s) => {
      const z2 = torsoFront(ctx, 1.27, OFF);
      b.add(tube([[s * 0.026, 1.43, torsoFront(ctx, 1.4, OFF) - 0.004], [s * 0.03, 1.36, torsoFront(ctx, 1.36, OFF) - 0.004], [s * 0.028, 1.27, z2 - 0.004]], 0.0035, { seg: 4 }), { color: 0xfff4ec, weights: ctx.W.torso });
      b.add(E(ctx, 0.005, 0.005, 0.005, 0), { color: 0xfff4ec, weights: ctx.W.torso, xf: { pos: [s * 0.028, 1.268, z2 - 0.004] } });
    });
    b.add(softBox(0.06, 0.012, 0.004, { seg: 8, rings: 4 }), { color: light, weights: ctx.W.torso, xf: { pos: [0, 1.17, torsoFront(ctx, 1.17, OFF) - 0.002] } });
  },
  tisort(b, ctx) {
    const c = ctx.col.top;
    const light = mixHex(c, 0xffffff, 0.5);
    const OFF = 0.016;
    shirtBody(b, ctx, { hem: 0.85, off: OFF, color: c });
    sleeves(b, ctx, SLEEVE_SPECS.tisort(ctx));
    collar(b, ctx, { y0: 1.44, y1: 1.47, r: 0.06, color: shade(c, 0.8) });
    // göğüste yıldız baskısı
    const fz = torsoFront(ctx, 1.2, OFF) - 0.002;
    for (let i = 0; i < 2; i++) {
      b.add(softBox(0.026, 0.026, 0.003, { seg: 6, rings: 4 }), { color: light, weights: ctx.W.torso, xf: { pos: [0, 1.2, fz], rot: [0, 0, (i * Math.PI) / 4 + Math.PI / 8] } });
    }
  },
  ceket(b, ctx) {
    const c = shade(ctx.col.top, 0.62);
    const edge = shade(c, 0.7);
    const OFF = 0.019;
    // deri: parlak 'gloss' ağı
    shirtBody(b, ctx, { hem: 0.9, off: OFF, color: c, mesh: 'gloss' });
    band(b, ctx, torsoKeys(ctx.kiz), 0.89, 0.935, OFF + 0.013, { color: edge, weights: ctx.W.torso, mesh: 'gloss' });
    sleeves(b, ctx, SLEEVE_SPECS.ceket(ctx));
    // içte beyaz tişört yakası
    collar(b, ctx, { y0: 1.44, y1: 1.47, r: 0.059, color: 0xf6f3ff });
    // yaka klapaları
    [-1, 1].forEach((s) => {
      b.add(softBox(0.04, 0.052, 0.008, { seg: 8, rings: 5 }), { color: shade(c, 1.1), weights: ctx.W.torso, mesh: 'gloss', xf: { pos: [s * 0.056, 1.405, torsoFront(ctx, 1.405, OFF) + 0.014], rot: [-0.35, s * 0.35, s * 0.55] } });
      b.add(softBox(0.04, 0.052, 0.008, { seg: 8, rings: 5 }), { color: shade(c, 1.1), weights: ctx.W.neck, mesh: 'gloss', xf: { pos: [s * 0.056, 1.435, 0.062], rot: [0.5, -s * 0.5, s * 0.5] } });
    });
    // fermuar + cepler
    b.add(tube([[0.0, 1.38, torsoFront(ctx, 1.38, OFF) - 0.002], [0.004, 1.2, torsoFront(ctx, 1.2, OFF) - 0.002], [0.006, 0.94, torsoFront(ctx, 0.94, OFF) - 0.002]], 0.0032, { seg: 4 }), { color: 0xe3e6f0, weights: ctx.W.torso, mesh: 'gloss' });
    [-1, 1].forEach((s) => {
      const z = torsoFront(ctx, 1.02, OFF) + 0.012;
      b.add(tube([[s * 0.075, 1.04, z], [s * 0.1, 1.0, z + 0.01]], 0.0028, { seg: 4 }), { color: 0xe3e6f0, weights: ctx.W.torso, mesh: 'gloss' });
    });
  },
  forma(b, ctx) {
    const c = ctx.col.top;
    const trim = 0xffffff;
    const OFF = 0.016;
    shirtBody(b, ctx, { hem: 0.86, off: OFF, color: c });
    sleeves(b, ctx, SLEEVE_SPECS.forma(ctx));
    // V yaka: ten üçgeni + beyaz şerit
    b.add(softBox(0.026, 0.034, 0.004, { seg: 6, rings: 4 }), { color: ctx.col.skin, weights: ctx.W.torso, skin: 1, xf: { pos: [0, 1.4, torsoFront(ctx, 1.4, OFF) + 0.006], rot: [-0.18, 0, 0] } });
    [-1, 1].forEach((s) => {
      b.add(tube([[s * 0.036, 1.435, torsoFront(ctx, 1.435, OFF) - 0.001], [s * 0.012, 1.385, torsoFront(ctx, 1.385, OFF) - 0.003], [0, 1.368, torsoFront(ctx, 1.368, OFF) - 0.003]], 0.0034, { seg: 4 }), { color: trim, weights: ctx.W.torso });
      // yan şerit
      const rr = (y) => torsoSide(ctx, y, OFF) + 0.001;
      b.add(tube([[s * rr(1.28), 1.28, 0.0], [s * rr(1.1), 1.1, 0.0], [s * rr(0.9), 0.9, 0.0]], 0.0055, { seg: 4 }), { color: trim, weights: ctx.W.torso });
    });
    collar(b, ctx, { y0: 1.445, y1: 1.47, r: 0.06, color: trim });
    // sırtta "10"
    const bz = torsoBack(ctx, 1.22, OFF) + 0.001;
    const plate = (x, y, w, h, rot) => b.add(softBox(w, h, 0.003, { seg: 6, rings: 4 }), { color: trim, weights: ctx.W.torso, xf: { pos: [x, y, bz], rot: [0, 0, rot || 0] } });
    plate(-0.026, 1.22, 0.005, 0.034);
    plate(-0.034, 1.248, 0.014, 0.005, -0.6);
    [[0.026, 1.185, 0.016, 0.005], [0.026, 1.256, 0.016, 0.005]].forEach((p) => plate(p[0], p[1], p[2], p[3]));
    [0.01, 0.042].forEach((x) => plate(x, 1.22, 0.0045, 0.037));
    // göğüs arması
    b.add(E(ctx, 0.016, 0.016, 0.004, 1), { color: trim, weights: ctx.W.torso, xf: { pos: [0.055, 1.27, torsoFront(ctx, 1.27, OFF) - 0.001] } });
  },
  kazak(b, ctx) {
    const c = ctx.col.top;
    const dark = shade(c, 0.76);
    const light = mixHex(c, 0xffffff, 0.45);
    const OFF = 0.022;
    const knit = (x, y, z, nx, ny, nz, col) => {
      col.multiplyScalar(0.9 + 0.1 * Math.sign(Math.sin(Math.atan2(x, z) * 22)));
      if (ny < -0.5) col.multiplyScalar(0.85);
    };
    shirtBody(b, ctx, { hem: 0.83, off: OFF, color: c, colorFn: knit });
    band(b, ctx, torsoKeys(ctx.kiz), 0.82, 0.87, OFF + 0.02, { color: dark, weights: ctx.W.torso });
    sleeves(b, ctx, SLEEVE_SPECS.kazak(ctx));
    // balıkçı yaka
    collar(b, ctx, { y0: 1.44, y1: 1.525, r: 0.068, r2: 0.06, color: dark });
    // göğüs örgü bantları
    [1.16, 1.2, 1.24].forEach((y, i) => {
      band(b, ctx, torsoKeys(ctx.kiz), y, y + 0.014, OFF + 0.005, { color: i === 1 ? light : dark, weights: ctx.W.torso, bump: OFF * 0.9 + 0.006 });
    });
  },
};

/* ------------------------------------------------------------------------------------------------
 * ALTLAR
 * ---------------------------------------------------------------------------------------------- */
function pelvisShell(b, ctx, o) {
  const keys = sliceKeys(torsoKeys(ctx.kiz), o.y0, o.y1, ctx.hi ? 10 : 5);
  b.add(sweep(offsetKeys(keys, o.off + 0.003), { seg: ctx.seg.torso, sub: 1, capBottom: o.capBottom !== false, capTop: false }), {
    color: o.color, weights: ctx.W.torso, colorFn: o.colorFn,
  });
}
function legShell(b, ctx, o) {
  const { kiz, d } = ctx;
  [['L', -1], ['R', 1]].forEach(([n, s]) => {
    const keys = shiftKeys(sliceKeys(legKeys(kiz), o.hem, 0.985, o.rings || (ctx.hi ? 11 : 6)), s * d.legX);
    b.add(sweep(offsetKeys(keys, o.off), { seg: ctx.seg.body, sub: 1, capBottom: false, capTop: false }), {
      color: o.color, weights: ctx.W['leg' + n], colorFn: o.colorFn,
    });
    if (o.cuff) {
      band(b, ctx, shiftKeys(legKeys(kiz), s * d.legX), o.hem - 0.004, o.hem + o.cuff, o.off + 0.003, { color: o.cuffColor, weights: ctx.W['leg' + n] });
    }
  });
}
/** Bacak dış kenarının x'i (y yüksekliğinde, ofsetli). */
function legOuter(ctx, y, off) {
  return ctx.d.legX + sliceKeys(legKeys(ctx.kiz), y, y, 2)[0].rx + off;
}
function waistFront(ctx, y, off) {
  const k = sliceKeys(torsoKeys(ctx.kiz), y, y, 2)[0];
  return (k.cz || 0) - k.rz - off;
}

const BOTTOM_BUILDERS = {
  jean(b, ctx) {
    const c = ctx.col.bottom;
    const dark = shade(c, 0.7);
    const wash = (x, y, z, nx, ny, nz, col) => {
      const k = Math.exp(-Math.pow((y - 0.52) / 0.09, 2)) * 0.1 + Math.exp(-Math.pow((y - 0.8) / 0.12, 2)) * 0.05;
      col.multiplyScalar(1 + k);
      if (ny < -0.5) col.multiplyScalar(0.85);
    };
    pelvisShell(b, ctx, { y0: 0.8, y1: 1.07, off: 0.004, color: c, colorFn: wash });
    legShell(b, ctx, { hem: 0.075, off: 0.013, color: c, colorFn: wash, cuff: 0.022, cuffColor: mixHex(c, 0xffffff, 0.25) });
    band(b, ctx, torsoKeys(ctx.kiz), 1.035, 1.075, 0.01, { color: dark, weights: ctx.W.torso });
    // kemer tokası + dikiş (turuncu iplik)
    b.add(softBox(0.016, 0.013, 0.004, { seg: 6, rings: 4 }), { color: 0xd4d8e2, mesh: 'gloss', weights: ctx.W.torso, xf: { pos: [0, 1.055, waistFront(ctx, 1.055, 0.012)] } });
    [-1, 1].forEach((s) => {
      b.add(tube([[s * legOuter(ctx, 0.12, 0.0105), 0.12, 0.0], [s * legOuter(ctx, 0.5, 0.0105), 0.5, 0.0], [s * legOuter(ctx, 0.94, 0.0105), 0.94, 0.0]], 0.0018, { seg: 3 }), {
        color: 0xe0983a, weights: ctx.W['leg' + (s < 0 ? 'L' : 'R')],
      });
    });
  },
  esofman(b, ctx) {
    const c = ctx.col.bottom;
    const dark = shade(c, 0.72);
    pelvisShell(b, ctx, { y0: 0.8, y1: 1.08, off: 0.005, color: c });
    legShell(b, ctx, { hem: 0.09, off: 0.018, color: c, cuff: 0.05, cuffColor: dark, colorFn: foldShade(0.1, 1.0, 0.9, 1.02) });
    band(b, ctx, torsoKeys(ctx.kiz), 1.03, 1.085, 0.011, { color: dark, weights: ctx.W.torso });
    // yan şerit + bel ipi
    [-1, 1].forEach((s) => {
      b.add(tube([[s * legOuter(ctx, 0.16, 0.0175), 0.16, 0.0], [s * legOuter(ctx, 0.55, 0.0175), 0.55, 0.0], [s * legOuter(ctx, 0.97, 0.0175), 0.97, 0.0]], 0.0045, { seg: 4 }), { color: 0xf3f4f6, weights: ctx.W['leg' + (s < 0 ? 'L' : 'R')] });
      b.add(tube([[s * 0.012, 1.06, waistFront(ctx, 1.06, 0.012)], [s * 0.022, 0.99, waistFront(ctx, 0.99, 0.01)]], 0.0028, { seg: 4 }), { color: 0xf3f4f6, weights: ctx.W.torso });
    });
  },
  sort(b, ctx) {
    const c = ctx.col.bottom;
    pelvisShell(b, ctx, { y0: 0.8, y1: 1.07, off: 0.004, color: c });
    legShell(b, ctx, { hem: 0.56, off: 0.016, color: c, cuff: 0.025, cuffColor: shade(c, 0.8), rings: 5, colorFn: foldShade(0.56, 1.0, 0.88, 1.02) });
    band(b, ctx, torsoKeys(ctx.kiz), 1.03, 1.08, 0.01, { color: shade(c, 0.75), weights: ctx.W.torso });
    [-1, 1].forEach((s) => b.add(tube([[s * 0.012, 1.06, waistFront(ctx, 1.06, 0.012)], [s * 0.02, 1.0, waistFront(ctx, 1.0, 0.01)]], 0.003, { seg: 4 }), { color: 0xf3f4f6, weights: ctx.W.torso }));
  },
  etek(b, ctx) {
    const c = ctx.col.bottom;
    const { kiz, hi } = ctx;
    pelvisShell(b, ctx, { y0: 0.9, y1: 1.07, off: 0.004, color: c, capBottom: false });
    const seg = hi ? 24 : 12;
    const keys = [
      { y: 0.5, rx: 0.285, rz: 0.265 }, { y: 0.62, rx: 0.245, rz: 0.228 }, { y: 0.76, rx: 0.205, rz: 0.19 },
      { y: 0.92, rx: kiz ? 0.152 : 0.164, rz: kiz ? 0.114 : 0.126 }, { y: 1.06, rx: kiz ? 0.122 : 0.15, rz: kiz ? 0.098 : 0.112 },
    ];
    const piece = sweep(keys, { seg, sub: hi ? 2 : 1, capBottom: false, capTop: false });
    // pileler: halkaları radyal olarak dalgalandır (alt halkalarda belirgin)
    const secs = piece.pos.length / 3 / seg;
    for (let i = 0; i < secs; i++) {
      const yy = piece.pos[i * seg * 3 + 1];
      const amp = 0.1 * Math.min(1, Math.max(0, (0.84 - yy) / 0.35));
      for (let j = 0; j < seg; j++) {
        const v = (i * seg + j) * 3;
        const k = 1 + amp * Math.sin((j / seg) * TAU * (hi ? 10 : 5));
        piece.pos[v] *= k;
        piece.pos[v + 2] *= k;
      }
    }
    const lateral = (x, y) => {
      const lg = smooth01((0.95 - y) / 0.4) * 0.55;
      const s = x < 0 ? 'L' : 'R';
      return [['leg' + s, lg], ['hips', 1 - lg]];
    };
    b.add(piece, {
      color: c, weights: (x, y, z) => (y > 0.95 ? ctx.W.torso(x, y, z) : lateral(x, y)),
      colorFn: (x, y, z, nx, ny, nz, col) => {
        col.multiplyScalar(lerp(0.82, 1.04, clamp((y - 0.5) / 0.6, 0, 1)) * (0.94 + 0.06 * Math.sin(Math.atan2(x, z) * (hi ? 10 : 5))));
      },
    });
    band(b, ctx, torsoKeys(kiz), 1.04, 1.085, 0.012, { color: shade(c, 0.72), weights: ctx.W.torso });
    b.add(E(ctx, 0.013, 0.013, 0.005, 1), { color: GOLD, mesh: 'gloss', weights: ctx.W.torso, xf: { pos: [0, 1.062, waistFront(ctx, 1.062, 0.013)] } });
  },
};

/* ------------------------------------------------------------------------------------------------
 * SAÇ
 * ---------------------------------------------------------------------------------------------- */
const hairChain = chainWeights([
  { bone: 'head' }, { bone: 'hair1', y: 1.66, band: 0.05 }, { bone: 'hair2', y: 1.52, band: 0.07 }, { bone: 'hair3', y: 1.36, band: 0.08 },
]);
/** Arka tarafta sallanan, önde sabit ağırlık. */
function swayWeights(backStart = 0.0, backBand = 0.07) {
  return (x, y, z) => {
    const w = hairChain(x, y, z);
    const k = smooth01((z - backStart) / backBand + 0.5);
    let moved = 0;
    const out = [];
    for (let i = 0; i < w.length; i++) {
      if (w[i][0] === 'head') out.push([w[i][0], w[i][1]]);
      else { out.push([w[i][0], w[i][1] * k]); moved += w[i][1] * (1 - k); }
    }
    out.push(['head', moved]);
    return out;
  };
}
const fullSway = (x, y, z) => hairChain(x, y, z);

/** Baş yüzeyinde (açı, yükseklik, ofset) noktası. phi: x=cos, z=sin (ön = -π/2). */
function surf(kiz, phi, y, t) {
  const s = headSection(kiz, y);
  return [(s.rx + t) * Math.cos(phi), y, s.cz + (s.rz + t) * Math.sin(phi)];
}

function hairHairline(style) {
  const P = {
    kisa: { back: 1.585, side: 1.625, front: 1.695 },
    dalgali: { back: 1.57, side: 1.615, front: 1.7 },
    atkuyrugu: { back: 1.62, side: 1.665, front: 1.7 },
    uzun: { back: 1.56, side: 1.605, front: 1.7 },
    topuz: { back: 1.64, side: 1.675, front: 1.705 },
    orgu: { back: 1.6, side: 1.65, front: 1.705 },
    kivircik: { back: 1.59, side: 1.635, front: 1.7 },
  }[style] || { back: 1.585, side: 1.625, front: 1.695 };
  return (phi) => {
    const s = -Math.sin(phi);
    return s <= 0 ? lerp(P.back, P.side, smooth01(s + 1)) : lerp(P.side, P.front, Math.pow(s, 1.5));
  };
}

function hairCap(ctx, o) {
  const kiz = ctx.kiz;
  const seg = o.seg;
  const R = o.rings;
  const top = o.top || 1.746;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= R; i++) {
    const u = i / R;
    for (let j = 0; j < seg; j++) {
      const phi = (j / seg) * TAU;
      const yb = o.hairline(phi);
      const y = lerp(yb, top, u);
      const t = o.thick(phi, u, y);
      const p = surf(kiz, phi, y, t);
      pos.push(p[0], p[1] + (u >= 1 ? t * 0.4 : 0), p[2]);
    }
  }
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b2 = i * seg + ((j + 1) % seg);
      const c = (i + 1) * seg + j;
      const d2 = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b2, b2, c, d2);
    }
  }
  const ci = pos.length / 3;
  const ts = o.thick(0, 1, top);
  const sec = headSection(kiz, top);
  pos.push(0, top + ts * 1.1, sec.cz);
  for (let j = 0; j < seg; j++) idx.push(ci, R * seg + ((j + 1) % seg), R * seg + j);
  return { pos, idx };
}

function hairShade(base) {
  return (x, y, z, nx, ny, nz, c) => {
    c.multiplyScalar(0.84 + 0.3 * clamp(ny * 0.7 + 0.3, 0, 1) * clamp((y - 1.55) / 0.2 + 0.5, 0.6, 1.1));
    if (base && ((x * 53 + z * 31) % 0.02) < 0.006) c.multiplyScalar(0.93);
  };
}

/** Tek tutam: başın üstünden saç çizgisine inen kıvrık boru. */
const headNormal = (kiz) => (x, y, z, out) => headNormalAt(kiz, x, y, z, out);
const backNormal = (x, y, z, out) => { out[0] = 0; out[1] = 0.1; out[2] = 1; };

function strand(b, ctx, o) {
  const kiz = ctx.kiz;
  const pts = [];
  const n = o.n || 5;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const y = lerp(o.yTop, o.yEnd, u);
    const phi = lerp(o.phi0, o.phi1, u);
    const p = surf(kiz, phi, y, o.t + (o.bulge || 0) * Math.sin(u * Math.PI));
    pts.push([p[0] + (o.dx || 0) * u, p[1], p[2] + (o.dz || 0) * u]);
  }
  b.add(tube(pts, (u) => lerp(o.r0 * 1.15, o.r1, u), { seg: o.seg || 6, cap: 'round', normalAt: headNormal(kiz), flat: 0.5 }), { mesh: 'hair', color: o.color, weights: o.weights || 'head', colorFn: hairShade(false) });
}

function capDefaults(ctx, style, volume) {
  const hl = hairHairline(style);
  const top = volume ? 0.012 : 0.0;
  return {
    seg: ctx.hi ? 22 : 12, rings: ctx.hi ? 8 : 4, hairline: hl,
    thick: (phi, u) => 0.0105 + top * smooth01((u - 0.3) / 0.7) + 0.003 * (1 - u),
  };
}

function fringe(b, ctx, c, dark, o = {}) {
  const hi = ctx.hi;
  const n = hi ? (o.n || 9) : 4;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const phi0 = -Math.PI / 2 + (u - 0.5) * 2.1 + (o.shift || 0);
    const side = o.sweepTo === undefined ? 1 : o.sweepTo;
    b.add(tube(
      (() => {
        const pts = [];
        for (let k = 0; k < 5; k++) {
          const t = k / 4;
          const y = lerp(1.742, hairHairline('kisa')(phi0) - (o.drop || 0.004), t);
          const phi = phi0 + side * t * 0.55 * (1 - Math.abs(u - 0.5));
          const p = surf(ctx.kiz, phi, y, 0.011 + 0.006 * Math.sin(t * Math.PI) + (o.vol || 0));
          pts.push([p[0], p[1] + (t > 0.8 ? 0.004 : 0), p[2]]);
        }
        return pts;
      })(),
      (t) => lerp(0.0125, 0.0045, t), { seg: hi ? 6 : 4, cap: 'round', normalAt: headNormal(ctx.kiz), flat: 0.5 },
    ), { mesh: 'hair', color: i % 2 ? dark : c, weights: 'head', colorFn: hairShade(false) });
  }
}

/**
 * Arka/yan saç perdesi: baş çevresinde yay boyunca ızgara yüzey (yukarıdan aşağı). phi: x=cos, z=sin
 * (arka = π/2). yBot(v) uç çizgisi (v 0..1 yay boyunca) — dalgalı/sivri uçlar için.
 */
function hairSheet(b, ctx, o) {
  const kiz = ctx.kiz;
  const rows = o.rows;
  const cols = o.cols;
  const pos = [];
  const idx = [];
  for (let r = 0; r <= rows; r++) {
    const u = r / rows;
    for (let c = 0; c <= cols; c++) {
      const v = c / cols;
      const phi = lerp(o.phi0, o.phi1, v);
      const y = lerp(o.yTop, o.yBot(v), u);
      const sec = headSection(kiz, clamp(y, 1.575, 1.73));
      const t = 0.012 + o.flare * Math.pow(u, 1.15);
      const down = clamp((1.575 - y) / 0.25, 0, 1); // başın altında boyuna yaklaş
      let x = (sec.rx + t) * Math.cos(phi) * lerp(1, o.narrow || 0.9, down);
      let z = sec.cz + (sec.rz + t) * Math.sin(phi) * lerp(1, 0.78, down) + down * 0.018;
      if (o.wave) x += Math.sin(y * 21 + v * 9) * o.wave * u;
      if (o.wave) z += Math.cos(y * 17 + v * 7) * o.wave * 0.5 * u;
      pos.push(x, y, z);
    }
  }
  const W1 = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * W1 + c;
      const bb = a + 1;
      const cc = a + W1;
      const dd = cc + 1;
      idx.push(a, bb, cc, bb, dd, cc);
    }
  }
  b.add({ pos, idx }, {
    mesh: 'hair', color: o.color, weights: o.weights || fullSway,
    colorFn: (x, y, z, nx, ny, nz, c) => {
      const ang = Math.atan2(z, x);
      const stripes = 0.9 + 0.1 * Math.sin(ang * 36 + y * 3.2) + 0.04 * Math.sin(ang * 71 - y * 5);
      const tip = lerp(0.82, 1.06, clamp((1.72 - y) / 0.5, 0, 1));
      const ring = 1 + 0.2 * Math.exp(-Math.pow((y - 1.6) / 0.04, 2)) * clamp(nz * 0.8 + 0.4, 0, 1);
      c.multiplyScalar(stripes * tip * ring);
    },
  });
}

const HAIR_BUILDERS = {
  kisa(b, ctx, hat) {
    const c = ctx.col.hair;
    const dark = shade(c, 0.8);
    b.add(hairCap(ctx, capDefaults(ctx, 'kisa', !hat)), { mesh: 'hair', color: c, weights: swayWeights(0.04), colorFn: hairShade(true) });
    if (!hat) fringe(b, ctx, c, dark, { n: 8, sweepTo: 1, vol: 0.004 });
    // ense kırpığı yanları
    [-1, 1].forEach((s) => strand(b, ctx, { yTop: 1.69, yEnd: 1.605, phi0: s > 0 ? -0.15 : Math.PI + 0.15, phi1: s > 0 ? 0.0 : Math.PI, t: 0.01, r0: 0.01, r1: 0.006, color: dark, n: 4 }));
  },
  dalgali(b, ctx, hat) {
    const c = ctx.col.hair;
    const dark = shade(c, 0.78);
    b.add(hairCap(ctx, capDefaults(ctx, 'dalgali', !hat)), { mesh: 'hair', color: c, weights: swayWeights(0.02), colorFn: hairShade(true) });
    if (!hat) fringe(b, ctx, c, dark, { n: 7, sweepTo: -1, vol: 0.003 });
    hairSheet(b, ctx, {
      phi0: -0.22, phi1: Math.PI + 0.22, yTop: 1.64, flare: 0.05, wave: 0.011, color: c, rows: ctx.hi ? 10 : 5, cols: ctx.hi ? 26 : 12,
      yBot: (v) => lerp(1.5, 1.36, Math.sin(v * Math.PI)) + 0.022 * Math.sin(v * Math.PI * 9),
    });
  },
  atkuyrugu(b, ctx, hat) {
    const c = ctx.col.hair;
    const dark = shade(c, 0.8);
    b.add(hairCap(ctx, capDefaults(ctx, 'atkuyrugu', !hat)), { mesh: 'hair', color: c, weights: swayWeights(0.03), colorFn: hairShade(true) });
    if (!hat) fringe(b, ctx, c, dark, { n: 6, sweepTo: 1, vol: 0.002 });
    const px = 0;
    const pz = headBackZ(ctx.kiz, 0, 1.69) + 0.022;
    // toka
    b.add(sweep([{ y: 1.676, rx: 0.026, rz: 0.026, cz: pz }, { y: 1.696, rx: 0.026, rz: 0.026, cz: pz }], { seg: 10, sub: 1 }), { mesh: 'gloss', color: ctx.col.top, weights: 'head' });
    const tail = [[px, 1.69, pz - 0.01], [px, 1.66, pz + 0.045], [px, 1.58, pz + 0.075], [px, 1.47, pz + 0.07], [px, 1.37, pz + 0.05], [px, 1.3, pz + 0.04]];
    const prof = (t) => lerp(0.03, 0.004, Math.pow(t, 1.4)) * (1 + 0.5 * Math.sin(t * Math.PI));
    b.add(tube(tail, prof, { seg: ctx.hi ? 8 : 5, cap: 'round' }), { mesh: 'hair', color: c, weights: fullSway, colorFn: hairShade(false) });
    [-1, 1].forEach((s) => {
      b.add(tube(tail.map((p, i) => [p[0] + s * 0.016 * Math.sin((i / 5) * Math.PI), p[1], p[2] + 0.004]), (t) => lerp(0.016, 0.003, t), { seg: ctx.hi ? 5 : 4, cap: 'round' }), {
        mesh: 'hair', color: dark, weights: fullSway, colorFn: hairShade(false),
      });
    });
  },
  uzun(b, ctx, hat) {
    const c = ctx.col.hair;
    const dark = shade(c, 0.78);
    b.add(hairCap(ctx, capDefaults(ctx, 'uzun', !hat)), { mesh: 'hair', color: c, weights: swayWeights(0.0), colorFn: hairShade(true) });
    if (!hat) fringe(b, ctx, c, dark, { n: 8, sweepTo: -1, vol: 0.003 });
    hairSheet(b, ctx, {
      phi0: -0.2, phi1: Math.PI + 0.2, yTop: 1.64, flare: 0.03, color: c, rows: ctx.hi ? 10 : 5, cols: ctx.hi ? 26 : 12,
      yBot: (v) => lerp(1.3, 1.14, Math.sin(v * Math.PI)) + 0.012 * Math.sin(v * Math.PI * 13),
    });
    // omuz önüne düşen tutamlar
    [-1, 1].forEach((s) => {
      const pts = [[s * 0.082, 1.62, -0.022], [s * 0.098, 1.52, 0.0], [s * 0.118, 1.43, -0.025], [s * 0.126, 1.37, -0.075], [s * 0.118, 1.29, -0.095], [s * 0.112, 1.22, -0.1]];
      b.add(tube(pts, (t) => lerp(0.022, 0.008, t), { seg: ctx.hi ? 6 : 4, cap: 'round', normalAt: backNormal, flat: 0.75 }), {
        mesh: 'hair', color: c, weights: (x, y, z) => hairChain(x, y, z), colorFn: hairShade(false),
      });
    });
  },
  topuz(b, ctx, hat) {
    const c = ctx.col.hair;
    const dark = shade(c, 0.78);
    b.add(hairCap(ctx, capDefaults(ctx, 'topuz', false)), { mesh: 'hair', color: c, weights: 'head', colorFn: hairShade(true) });
    if (!hat) fringe(b, ctx, c, dark, { n: 6, sweepTo: 1, vol: 0.001 });
    const z = headBackZ(ctx.kiz, 0, 1.73) - 0.03;
    if (!hat) {
      b.add(E(ctx, 0.05, 0.046, 0.05, 2), { mesh: 'hair', color: c, weights: 'head', xf: { pos: [0, 1.79, z] }, colorFn: hairShade(true) });
      b.add(E(ctx, 0.028, 0.02, 0.03, 1), { mesh: 'hair', color: dark, weights: 'head', xf: { pos: [0.02, 1.812, z - 0.008] }, colorFn: hairShade(false) });
      loop(b, { c: [0, 1.753, z], rx: 0.04, rz: 0.04, r: 0.0055, color: ctx.col.top, mesh: 'gloss', weights: 'head' });
    } else {
      b.add(E(ctx, 0.04, 0.036, 0.04, 1), { mesh: 'hair', color: c, weights: 'head', xf: { pos: [0, 1.68, z + 0.05] } });
    }
    // yüz kenarında kaçmış tutamlar
    [-1, 1].forEach((s) => strand(b, ctx, { yTop: 1.68, yEnd: 1.585, phi0: s > 0 ? -0.5 : Math.PI + 0.5, phi1: s > 0 ? -0.1 : Math.PI + 0.1, t: 0.012, r0: 0.007, r1: 0.003, color: dark, n: 4 }));
  },
  orgu(b, ctx, hat) {
    const c = ctx.col.hair;
    const dark = shade(c, 0.78);
    b.add(hairCap(ctx, capDefaults(ctx, 'orgu', !hat)), { mesh: 'hair', color: c, weights: swayWeights(0.04), colorFn: hairShade(true) });
    if (!hat) fringe(b, ctx, c, dark, { n: 6, sweepTo: -1, vol: 0.002 });
    const z0 = headBackZ(ctx.kiz, 0, 1.64) + 0.012;
    const n = ctx.hi ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = lerp(1.64, 1.2, t);
      const z = z0 + Math.sin(t * 1.6) * 0.045 + t * 0.012;
      const r = lerp(0.027, 0.014, t);
      const sx = i % 2 ? 1 : -1;
      b.add(E(ctx, r, r * 1.32, r * 1.0, 1), { mesh: 'hair', color: i % 2 ? dark : c, weights: fullSway, xf: { pos: [sx * r * 0.42, y, z], rot: [0.25, 0, sx * 0.5] }, colorFn: hairShade(false) });
      if (ctx.hi) b.add(E(ctx, r * 0.8, r * 1.2, r * 0.9, 0), { mesh: 'hair', color: i % 2 ? c : dark, weights: fullSway, xf: { pos: [-sx * r * 0.42, y - r * 0.55, z], rot: [0.25, 0, -sx * 0.5] }, colorFn: hairShade(false) });
    }
    const zE = z0 + Math.sin(1.6) * 0.045 + 0.012;
    loop(b, { c: [0, 1.19, zE], rx: 0.012, rz: 0.012, r: 0.0042, color: ctx.col.top, mesh: 'gloss', weights: fullSway, n: 8 });
    b.add(tube([[0, 1.19, zE], [0, 1.15, zE + 0.004], [0, 1.115, zE + 0.006]], (t) => lerp(0.009, 0.002, t), { seg: 5, cap: 'round' }), { mesh: 'hair', color: c, weights: fullSway });
  },
  kivircik(b, ctx, hat) {
    const c = ctx.col.hair;
    const dark = shade(c, 0.76);
    b.add(hairCap(ctx, { ...capDefaults(ctx, 'kivircik', false), thick: (p, u) => 0.012 + 0.006 * (1 - u) }), { mesh: 'hair', color: c, weights: swayWeights(0.05), colorFn: hairShade(true) });
    const n = ctx.hi ? 26 : 12;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const yv = 1 - (i / (n - 1)) * 1.1; // 1 .. -0.1 (tepeden yan/arkaya)
      const rad = Math.sqrt(Math.max(0, 1 - yv * yv));
      const th = i * golden;
      const x = Math.cos(th) * rad;
      const z = Math.sin(th) * rad;
      if (z < -0.3 && yv < 0.72) continue; // yüz açık
      const R = 0.088;
      const y = 1.665 + yv * 0.082;
      if (hat && y > 1.69) continue;
      const rr = 0.03 + (i % 3) * 0.004;
      const sec = headSection(ctx.kiz, clamp(y, 1.6, 1.745));
      b.add(ellipsoid(rr, rr * 0.92, rr, ctx.hi ? { seg: 6, rings: 4 } : { seg: 5, rings: 3 }), {
        mesh: 'hair', color: i % 3 ? c : dark, weights: swayWeights(0.05), xf: { pos: [x * (sec.rx + 0.014) * (R / 0.088), y, sec.cz + z * (sec.rz + 0.014)] }, colorFn: hairShade(false),
      });
    }
  },
  mohawk(b, ctx, hat) {
    const c = ctx.col.hair;
    const dark = shade(c, 0.78);
    const hl = (phi) => {
      const cx = Math.abs(Math.cos(phi));
      if (cx > 0.3) return 1.76; // şerit dışı çökür (alan sıfır)
      return -Math.sin(phi) > 0 ? 1.68 : 1.6;
    };
    b.add(hairCap(ctx, { seg: ctx.hi ? 28 : 16, rings: ctx.hi ? 6 : 3, hairline: hl, thick: () => 0.01 }), { mesh: 'hair', color: c, weights: swayWeights(0.05), colorFn: hairShade(true) });
    // kenarlar kısa tıraşlı: koyu ince kaplama
    b.add(hairCap(ctx, { seg: ctx.hi ? 22 : 12, rings: 3, hairline: (phi) => lerp(1.64, 1.68, smooth01(-Math.sin(phi) * 0.5 + 0.5)), thick: () => 0.0035 }), { mesh: 'hair', color: shade(c, 0.55), weights: 'head' });
    // sivri sırt
    const n = ctx.hi ? 11 : 6;
    if (!hat) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const z = lerp(-0.058, 0.098, u);
        const h = 0.07 * (1 - Math.pow(Math.abs(u - 0.5) * 1.5, 2)) + 0.03;
        const baseY = 1.735 - Math.pow(u - 0.45, 2) * 0.12;
        const lean = (u - 0.35) * 0.9;
        b.add(tube([[0, baseY, z], [0, baseY + h * 0.55, z + lean * h * 0.18], [0, baseY + h, z + lean * h * 0.38]], (t) => lerp(0.017, 0.002, t), { seg: ctx.hi ? 6 : 4, cap: 'round' }), {
          mesh: 'hair', color: i % 2 ? dark : c, weights: i > n * 0.65 ? swayWeights(0.0) : 'head', colorFn: hairShade(false),
        });
      }
    }
  },
};

/* ------------------------------------------------------------------------------------------------
 * AKSESUARLAR
 * ---------------------------------------------------------------------------------------------- */
function domeKeys(kiz, y0, y1, off) {
  return offsetKeys(sliceKeys(
    // başın süpürme anahtarı: sliceKeys yoğun yeniden örnekleme yapar
    headKeysCache(kiz), y0, y1, 5,
  ), off);
}
const hkCache = {};
function headKeysCache(kiz) {
  const k = kiz ? 'k' : 'e';
  if (!hkCache[k]) hkCache[k] = headKeys(kiz);
  return hkCache[k];
}

const ACC_BUILDERS = {
  none() {},
  sapka(b, ctx) {
    const { kiz } = ctx;
    const dome = sweep(domeKeys(kiz, 1.655, 1.75, 0.016), { seg: ctx.hi ? 20 : 12, sub: 1, capBottom: false });
    b.add(dome, { mesh: 'body', color: ACC.capMain, weights: 'head', colorFn: hairShade(false) });
    // ön panel + siperlik
    const fz = headFaceZ(kiz, 0, 1.7) - 0.018;
    b.add(E(ctx, 0.07, 0.05, 0.03, 1), { color: ACC.capPanel, weights: 'head', xf: { pos: [0, 1.71, fz + 0.012], rot: [-0.35, 0, 0] } });
    b.add(softBox(0.068, 0.0045, 0.075, { seg: 12, rings: 6, power: 2.6 }), { mesh: 'gloss', color: ACC.capMain, weights: 'head', xf: { pos: [0, 1.682, fz - 0.058], rot: [0.2, 0, 0] } });
    b.add(E(ctx, 0.011, 0.011, 0.011, 0), { color: ACC.capPanel, weights: 'head', xf: { pos: [0, 1.775, headSection(kiz, 1.74).cz] } });
    b.add(sweep(domeKeys(kiz, 1.655, 1.668, 0.02), { seg: ctx.hi ? 20 : 12, sub: 1 }), { color: shade(ACC.capMain, 0.72), weights: 'head' });
  },
  bere(b, ctx) {
    const { kiz } = ctx;
    b.add(sweep(domeKeys(kiz, 1.655, 1.752, 0.024), { seg: ctx.hi ? 20 : 12, sub: 1, capBottom: false }), {
      color: ACC.beanie, weights: 'head', colorFn: (x, y, z, nx, ny, nz, c) => c.multiplyScalar(0.93 + 0.07 * Math.sign(Math.sin(Math.atan2(x, z) * 18))),
    });
    b.add(sweep(domeKeys(kiz, 1.648, 1.69, 0.034), { seg: ctx.hi ? 20 : 12, sub: 1 }), { color: ACC.beanieCuff, weights: 'head' });
    b.add(E(ctx, 0.032, 0.03, 0.032, 2), { color: ACC.pom, weights: 'head', xf: { pos: [0, 1.795, headSection(kiz, 1.74).cz] } });
  },
  gozluk(b, ctx) {
    const { kiz, d } = ctx;
    const r = kiz ? 0.0215 : 0.02;
    [-1, 1].forEach((s) => {
      const x = s * d.eyeX;
      const z = headFaceZ(kiz, x, d.eyeY) - 0.014;
      loop(b, { c: [x, d.eyeY, z], rx: r, rz: 0.0001, r: 0.0017, color: ACC.frame, mesh: 'gloss', weights: 'head', n: 14, tilt: r });
      b.add(tube([[s * (d.eyeX + r), d.eyeY + 0.004, z + 0.002], [s * 0.078, d.eyeY + 0.006, z + 0.05], [s * 0.081, d.eyeY + 0.002, z + 0.105]], 0.0016, { seg: 4 }), { color: ACC.frame, mesh: 'gloss', weights: 'head' });
      // cam parıltısı
      b.add(tube([[x - r * 0.45, d.eyeY + r * 0.6, z - 0.001], [x + r * 0.1, d.eyeY + r * 0.85, z - 0.001]], 0.0009, { seg: 3 }), { color: 0xdbeaff, mesh: 'glow', weights: 'head' });
    });
    b.add(tube([[-d.eyeX + 0.02, d.eyeY + 0.004, headFaceZ(kiz, 0.0, d.eyeY) - 0.015], [0, d.eyeY + 0.008, headFaceZ(kiz, 0, d.eyeY) - 0.019], [d.eyeX - 0.02, d.eyeY + 0.004, headFaceZ(kiz, 0.0, d.eyeY) - 0.015]], 0.0016, { seg: 4 }), { color: ACC.frame, mesh: 'gloss', weights: 'head' });
  },
  gunes(b, ctx) {
    const { kiz, d } = ctx;
    [-1, 1].forEach((s) => {
      const x = s * d.eyeX;
      const z = headFaceZ(kiz, x, d.eyeY) - 0.012;
      b.add(softBox(0.0245, 0.0185, 0.004, { seg: 10, rings: 6, power: 2.6 }), { mesh: 'gloss', color: ACC.lens, weights: 'head', xf: { pos: [x, d.eyeY, z], rot: [0, s * 0.16, 0] } });
      b.add(tube([[x - s * 0.01, d.eyeY + 0.012, z - 0.005], [x + s * 0.005, d.eyeY + 0.016, z - 0.005]], 0.0011, { seg: 3 }), { color: 0xc8d8ff, mesh: 'glow', weights: 'head' });
      b.add(tube([[s * (d.eyeX + 0.025), d.eyeY + 0.006, z + 0.004], [s * 0.079, d.eyeY + 0.008, z + 0.05], [s * 0.081, d.eyeY + 0.003, z + 0.105]], 0.0018, { seg: 4 }), { color: GOLD, mesh: 'gloss', weights: 'head' });
    });
    b.add(tube([[-0.01, d.eyeY + 0.008, headFaceZ(kiz, 0, d.eyeY) - 0.017], [0.01, d.eyeY + 0.008, headFaceZ(kiz, 0, d.eyeY) - 0.017]], 0.002, { seg: 4 }), { color: GOLD, mesh: 'gloss', weights: 'head' });
  },
  kulaklik(b, ctx) {
    const { kiz, d } = ctx;
    const rx = headSection(kiz, d.eyeY).rx;
    const cz = (headFaceZ(kiz, 0, d.eyeY) + headBackZ(kiz, 0, d.eyeY)) / 2 + 0.012;
    const pts = [];
    const m = ctx.hi ? 12 : 7;
    for (let i = 0; i <= m; i++) {
      const a = (i / m) * Math.PI;
      pts.push([Math.cos(a) * (rx + 0.016), d.eyeY - 0.004 + Math.sin(a) * 0.14, cz - Math.sin(a) * 0.008]);
    }
    b.add(tube(pts, 0.0065, { seg: 6, cap: 'round' }), { mesh: 'gloss', color: ACC.phone, weights: 'head' });
    [-1, 1].forEach((s) => {
      b.add(E(ctx, 0.016, 0.037, 0.031, 2), { mesh: 'gloss', color: ACC.phone, weights: 'head', xf: { pos: [s * (rx + 0.021), d.eyeY - 0.004, cz] } });
      b.add(E(ctx, 0.01, 0.031, 0.026, 1), { color: ACC.phoneCushion, weights: 'head', xf: { pos: [s * (rx + 0.012), d.eyeY - 0.004, cz] } });
      b.add(E(ctx, 0.004, 0.017, 0.017, 0), { mesh: 'glow', color: ACC.phoneCushion, weights: 'head', xf: { pos: [s * (rx + 0.036), d.eyeY - 0.004, cz] } });
    });
  },
  kedi(b, ctx) {
    const { kiz } = ctx;
    const hc = ctx.col.hair;
    [-1, 1].forEach((s) => {
      const base = [s * 0.056, 1.728, headSection(kiz, 1.73).cz - 0.005];
      const tip = [s * 0.082, 1.8, base[2] + 0.004];
      b.add(tube([base, [(base[0] + tip[0]) / 2, 1.765, base[2] + 0.002], tip], (t) => lerp(0.032, 0.002, Math.pow(t, 0.8)), { seg: ctx.hi ? 8 : 5, cap: 'round' }), {
        mesh: 'hair', color: hc, weights: 'head', colorFn: hairShade(false),
      });
      b.add(tube([[base[0], 1.732, base[2] - 0.016], [tip[0] - s * 0.004, 1.79, base[2] - 0.012]], (t) => lerp(0.02, 0.0015, t), { seg: 6, cap: 'round' }), {
        color: ACC.earInner, weights: 'head',
      });
    });
    b.add(sweep(domeKeys(kiz, 1.66, 1.668, 0.012), { seg: ctx.hi ? 20 : 12, sub: 1 }), { mesh: 'gloss', color: shade(hc, 0.6), weights: 'head' });
  },
  tac(b, ctx) {
    const { kiz } = ctx;
    const sec = headSection(kiz, 1.72);
    const rim = sweep(domeKeys(kiz, 1.7, 1.726, 0.016), { seg: ctx.hi ? 20 : 12, sub: 1, capBottom: false, capTop: false });
    b.add(rim, { mesh: 'gloss', color: GOLD, weights: 'head' });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.PI / n;
      const px = Math.cos(a) * (sec.rx + 0.012);
      const pz = sec.cz + Math.sin(a) * (sec.rz + 0.012);
      const h = i % 2 ? 0.04 : 0.055;
      b.add(tube([[px, 1.72, pz], [px * 1.02, 1.72 + h, pz + (pz - sec.cz) * 0.02]], (t) => lerp(0.0125, 0.0015, t), { seg: 5, cap: 'round' }), { mesh: 'gloss', color: GOLD, weights: 'head' });
      b.add(E(ctx, 0.0075, 0.0075, 0.0075, 0), { mesh: 'glow', color: ACC.gems[i % 3], weights: 'head', xf: { pos: [px * 1.02, 1.713, pz + (pz - sec.cz) * 0.06] } });
    }
  },
};

/* ------------------------------------------------------------------------------------------------
 * Dışa aktarım
 * ---------------------------------------------------------------------------------------------- */
export const WEAR_TABLES = {
  hair: HAIR_BUILDERS, top: TOP_BUILDERS, bottom: BOTTOM_BUILDERS, shoes: SHOE_BUILDERS, acc: ACC_BUILDERS,
};
export const WEAR_DEFAULTS = { hair: 'kisa', top: 'tisort', bottom: 'jean', shoes: 'spor', acc: 'none' };

/** Katalog stil kimliğini kurucu fonksiyona çevirir (bulunamazsa güvenli varsayılan). */
export function resolveBuilder(slot, style) {
  const t = WEAR_TABLES[slot];
  return t[style] || t[WEAR_DEFAULTS[slot]];
}

/** Yalnızca kol giysisi (birinci şahıs kolları için). */
export function buildArmWear(b, ctx) {
  const spec = SLEEVE_SPECS[ctx.cfg.top.style] || SLEEVE_SPECS[WEAR_DEFAULTS.top];
  sleeves(b, ctx, spec(ctx));
}

export function buildWear(b, ctx) {
  const a = ctx.cfg;
  const hat = a.acc === 'sapka' || a.acc === 'bere';
  resolveBuilder('top', a.top.style)(b, ctx);
  resolveBuilder('bottom', a.bottom.style)(b, ctx);
  resolveBuilder('shoes', a.shoes.style)(b, ctx);
  resolveBuilder('hair', a.hair.style)(b, ctx, hat);
  resolveBuilder('acc', a.acc)(b, ctx);
}
