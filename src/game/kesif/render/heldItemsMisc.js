/*
 * KEŞİF eşya modelleri — yiyecek, malzeme, değerli taş, anahtar ve yedek (three, WebGL yok).
 * Her kurucu (spec, ctx) → THREE.Group; orijin modelin merkezidir. Boyutlar gerçek ölçekte (m).
 */
import {
  THREE, G, stdMat, basicMat, mesh, shapeGeo, rbox, lathe, tubeGeo, unitSphere, unitCyl, unitCone, unitBox, unitOcta, unitTorus,
  extrude, rrectShape, insetPts,
} from './heldItemsKit.js';
import { mixColor } from './heldItemsColor.js';

const PI = Math.PI;
const unitIco = () => G('u:ico', () => new THREE.IcosahedronGeometry(1, 1));
const flatIco = () => G('u:ico:flat', () => new THREE.IcosahedronGeometry(1, 0));

/* ---------------------------------- yiyecek ---------------------------------- */
function buildApple(spec) {
  const g = new THREE.Group();
  const gold = spec.sub === 'gold';
  const col = gold ? 0xf4c940 : 0xd8322f;
  const skin = stdMat(col, { rough: gold ? 0.22 : 0.4, metal: gold ? 0.2 : 0, emissive: gold ? 0xb8860b : 0, ei: gold ? 0.25 : 0 });
  g.add(mesh(lathe('apple', [[0, -0.05], [0.032, -0.046], [0.056, -0.018], [0.062, 0.018], [0.052, 0.046], [0.022, 0.054], [0.006, 0.04], [0, 0.044]], 18), skin));
  g.add(mesh(unitCyl(), stdMat(0x5a3a22, { rough: 0.9 }), 0, 0.058, 0, 0.12, 0, 0, 0.0035, 0.03, 0.0035));
  g.add(mesh(unitSphere(), stdMat(0x4f9a3a, { rough: 0.7 }), 0.016, 0.06, 0, 0, 0, -0.5, 0.02, 0.005, 0.01));
  g.add(mesh(unitSphere(), basicMat(0xffffff, { opacity: 0.35 }), -0.02, 0.02, -0.052, 0, 0, 0, 0.012, 0.02, 0.004));
  if (gold) g.add(mesh(unitSphere(), basicMat(0xffd84a, { add: true, opacity: 0.18 }), 0, 0, 0, 0, 0, 0, 0.11, 0.1, 0.11));
  g.userData.size = 0.13;
  return g;
}
function buildStrawberry() {
  const g = new THREE.Group();
  g.add(mesh(lathe('straw', [[0, -0.062], [0.016, -0.054], [0.04, -0.02], [0.05, 0.014], [0.042, 0.042], [0.016, 0.052], [0, 0.05]], 14), stdMat(0xe0386b, { rough: 0.45 })));
  const seed = stdMat(0xf6e27a, { rough: 0.6 });
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    const y = -0.045 + (i / 14) * 0.09;
    const r = 0.046 * Math.sqrt(1 - Math.pow((y - 0.0) / 0.065, 2)) + 0.002;
    g.add(mesh(unitSphere(), seed, Math.cos(a) * r, y, Math.sin(a) * r, 0, 0, 0, 0.004, 0.006, 0.004));
  }
  const leaf = stdMat(0x3f9a3a, { rough: 0.7 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    g.add(mesh(unitCone(), leaf, Math.cos(a) * 0.022, 0.05, Math.sin(a) * 0.022, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2, 0.01, 0.036, 0.004));
  }
  g.add(mesh(unitCyl(), leaf, 0, 0.065, 0, 0, 0, 0, 0.003, 0.025, 0.003));
  g.userData.size = 0.13;
  return g;
}
function buildCarrot() {
  const g = new THREE.Group();
  const orange = stdMat(0xee8a2a, { rough: 0.55 });
  g.add(mesh(unitCone(), orange, 0, -0.01, 0, PI, 0, 0.0, 0.03, 0.18, 0.03));
  for (let i = 0; i < 4; i++) g.add(mesh(unitTorus(), stdMat(0xc8701c, { rough: 0.6 }), 0, 0.03 - i * 0.04, 0, PI / 2, 0, 0, 0.026 - i * 0.004, 0.026 - i * 0.004, 0.012));
  const green = stdMat(0x3f9a3a, { rough: 0.7 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    g.add(mesh(unitCone(), green, Math.cos(a) * 0.01, 0.1, Math.sin(a) * 0.01, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4, 0.007, 0.07, 0.007));
  }
  g.userData.size = 0.2;
  return g;
}
function buildPotato(spec) {
  const g = new THREE.Group();
  const cooked = spec.sub === 'cooked';
  const m = stdMat(cooked ? 0xb88a3a : 0xc9a35a, { rough: cooked ? 0.5 : 0.85 });
  g.add(mesh(unitIco(), m, 0, 0, 0, 0.2, 0.3, 0, 0.062, 0.045, 0.048));
  g.add(mesh(unitIco(), m, 0.03, 0.012, 0.01, 0, 0.5, 0, 0.03, 0.026, 0.03));
  g.add(mesh(unitIco(), m, -0.03, -0.006, -0.012, 0, 0, 0.4, 0.028, 0.024, 0.028));
  const eye = stdMat(cooked ? 0x7a5a24 : 0x8a6a30, { rough: 0.9 });
  [[0.02, 0.03, 0.03], [-0.03, 0.02, 0.025], [0.0, -0.02, 0.04]].forEach((p) => g.add(mesh(unitSphere(), eye, p[0], p[1], p[2], 0, 0, 0, 0.006, 0.004, 0.006)));
  if (cooked) g.add(mesh(unitSphere(), basicMat(0xfff2b0, { opacity: 0.55 }), 0, 0.04, 0.0, 0, 0, 0, 0.022, 0.006, 0.014));
  g.userData.size = 0.14;
  return g;
}
function buildDrumstick(spec) {
  const g = new THREE.Group();
  const meat = stdMat(spec.color, { rough: spec.sub === 'cooked' ? 0.4 : 0.55 });
  const bone = stdMat(0xf0ead8, { rough: 0.6 });
  const leg = new THREE.Group();
  leg.rotation.z = -0.5;
  leg.add(mesh(unitSphere(), meat, 0, 0.02, 0, 0, 0, 0, 0.045, 0.062, 0.042));
  leg.add(mesh(unitCone(), meat, 0, -0.03, 0, PI, 0, 0, 0.032, 0.055, 0.03));
  leg.add(mesh(unitCyl(), bone, 0, -0.075, 0, 0, 0, 0, 0.008, 0.06, 0.008));
  leg.add(mesh(unitSphere(), bone, 0.007, -0.108, 0, 0, 0, 0, 0.012, 0.012, 0.012));
  leg.add(mesh(unitSphere(), bone, -0.007, -0.108, 0, 0, 0, 0, 0.012, 0.012, 0.012));
  if (spec.sub === 'cooked') leg.add(mesh(unitSphere(), basicMat(0xffd49a, { opacity: 0.4 }), -0.014, 0.04, -0.03, 0, 0, 0, 0.016, 0.026, 0.006));
  g.add(leg);
  g.userData.size = 0.2;
  return g;
}
function buildChop(spec) {
  const g = new THREE.Group();
  const meat = stdMat(spec.color, { rough: spec.sub === 'cooked' ? 0.4 : 0.55 });
  const fat = stdMat(0xf3e8de, { rough: 0.6 });
  const bone = stdMat(0xf0ead8, { rough: 0.6 });
  g.add(mesh(unitSphere(), fat, 0, 0, 0, 0, 0, 0, 0.074, 0.054, 0.028));
  g.add(mesh(unitSphere(), meat, 0, 0, 0.006, 0, 0, 0, 0.066, 0.046, 0.026));
  g.add(mesh(unitCyl(), bone, 0.06, 0.0, 0, 0, 0, PI / 2, 0.007, 0.08, 0.007));
  g.add(mesh(unitSphere(), bone, 0.1, 0.006, 0, 0, 0, 0, 0.011, 0.011, 0.011));
  g.add(mesh(unitSphere(), bone, 0.1, -0.006, 0, 0, 0, 0, 0.011, 0.011, 0.011));
  if (spec.sub === 'cooked') [-0.02, 0.01, 0.035].forEach((x) => g.add(mesh(unitBox(), stdMat(0x4a2a18, { rough: 0.8 }), x, 0.006, 0.0285, 0, 0, 0.5, 0.004, 0.034, 0.002)));
  g.userData.size = 0.2;
  return g;
}
function buildFish(spec) {
  const g = new THREE.Group();
  const cooked = spec.sub === 'cooked';
  const body = stdMat(spec.color, { rough: cooked ? 0.45 : 0.3, metal: cooked ? 0 : 0.12 });
  const belly = stdMat(cooked ? 0xe8c890 : 0xe8f0f6, { rough: 0.5 });
  g.add(mesh(unitSphere(), body, 0, 0.004, 0, 0, 0, 0, 0.095, 0.036, 0.02));
  g.add(mesh(unitSphere(), belly, 0, -0.012, 0, 0, 0, 0, 0.08, 0.02, 0.016));
  g.add(mesh(shapeGeo('fish:tail', [[0, 0], [0.05, 0.035], [0.04, 0], [0.05, -0.035]], 0.006, 0.002), body, -0.1, 0.0, 0.0, 0, 0, 0, -1, 1, 1));
  g.add(mesh(shapeGeo('fish:fin', [[0, 0], [0.04, 0.03], [0.05, 0.0]], 0.004, 0.001), body, 0.0, 0.032, 0.0));
  g.add(mesh(unitSphere(), stdMat(0x101015, { rough: 0.2 }), 0.062, 0.01, 0.015, 0, 0, 0, 0.006, 0.006, 0.004));
  g.add(mesh(unitSphere(), stdMat(0x101015, { rough: 0.2 }), 0.062, 0.01, -0.015, 0, 0, 0, 0.006, 0.006, 0.004));
  if (cooked) for (let i = 0; i < 3; i++) g.add(mesh(unitBox(), stdMat(0x6a4020, { rough: 0.8 }), -0.01 + i * 0.03, 0.01, 0.0, 0, 0, 0.4, 0.004, 0.03, 0.04));
  g.rotation.z = 0.35;
  g.userData.size = 0.22;
  return g;
}
function buildBowl(spec) {
  const g = new THREE.Group();
  const wood = stdMat(0xa87a45, { rough: 0.75 });
  g.add(mesh(lathe('bowl', [[0, -0.035], [0.03, -0.035], [0.06, -0.01], [0.075, 0.03], [0.07, 0.034], [0.056, 0.0], [0.03, -0.026], [0, -0.028]], 20), wood));
  if (spec.sub === 'soup') {
    g.add(mesh(unitCyl(), stdMat(0xb08a68, { rough: 0.35 }), 0, 0.012, 0, 0, 0, 0, 0.064, 0.006, 0.064));
    for (let i = 0; i < 5; i++) g.add(mesh(unitSphere(), stdMat(0xe8e0d0, { rough: 0.6 }), Math.cos(i * 1.3) * 0.03, 0.02, Math.sin(i * 1.3) * 0.03, 0, 0, 0, 0.012, 0.007, 0.012));
    g.add(mesh(unitSphere(), basicMat(0xffffff, { opacity: 0.12 }), 0, 0.06, 0, 0, 0, 0, 0.03, 0.03, 0.03));
  } else if (spec.sub === 'salad') {
    const cols = [0xf06a5a, 0xe0386b, 0x6fbf4a, 0xf2c91e, 0xd8322f, 0x6fbf4a];
    for (let i = 0; i < 9; i++) g.add(mesh(unitIco(), stdMat(cols[i % cols.length], { rough: 0.5 }), Math.cos(i * 0.9) * 0.034, 0.02 + (i % 3) * 0.008, Math.sin(i * 0.9) * 0.034, i, i, 0, 0.017, 0.015, 0.017));
  }
  g.userData.size = 0.16;
  return g;
}
function buildPotion(spec) {
  const g = new THREE.Group();
  const empty = spec.sub === 'empty';
  g.add(mesh(lathe('potion:glass', [[0, -0.06], [0.034, -0.058], [0.048, -0.03], [0.044, 0.0], [0.02, 0.02], [0.016, 0.06], [0.02, 0.07], [0.014, 0.07], [0.012, 0.062], [0.014, 0.02], [0.038, 0.0], [0.04, -0.03], [0.028, -0.052], [0, -0.052]], 16), stdMat(0xcfeaf5, { rough: 0.05, opacity: 0.4, metal: 0.0, side: THREE.DoubleSide })));
  if (!empty) {
    g.add(mesh(lathe('potion:liq', [[0, -0.05], [0.03, -0.048], [0.04, -0.028], [0.037, -0.004], [0.0, -0.004]], 16), basicMat(spec.color || 0xff5a8a, { bright: 1.05 })));
    g.add(mesh(unitSphere(), basicMat(spec.color || 0xff5a8a, { add: true, opacity: 0.18 }), 0, -0.025, 0, 0, 0, 0, 0.09, 0.09, 0.09));
  }
  g.add(mesh(unitCyl(), stdMat(0x8a5a33, { rough: 0.85 }), 0, 0.075, 0, 0, 0, 0, 0.0145, 0.026, 0.0145));
  g.add(mesh(unitSphere(), basicMat(0xffffff, { opacity: 0.4 }), -0.026, -0.02, -0.03, 0, 0, 0, 0.007, 0.022, 0.004));
  g.userData.size = 0.16;
  return g;
}

/* ---------------------------------- malzeme ---------------------------------- */
function buildStick() {
  const g = new THREE.Group();
  const m = stdMat(0xa87a45, { rough: 0.85 });
  g.add(mesh(unitCyl(), m, 0, 0, 0, 0, 0, 0.5, 0.012, 0.24, 0.012));
  g.add(mesh(unitSphere(), stdMat(0x7a5530, { rough: 0.9 }), 0.01, 0.0, 0.01, 0, 0, 0, 0.0145, 0.012, 0.0145));
  g.add(mesh(unitCyl(), stdMat(0xd6b788, { rough: 0.7 }), -0.057, 0.0585, 0, 0, 0, 0.5, 0.0095, 0.006, 0.0095));
  g.userData.size = 0.24;
  return g;
}
function buildCoal(spec) {
  const g = new THREE.Group();
  const charcoal = spec.sub === 'charcoal';
  const m = stdMat(charcoal ? 0x3a3430 : 0x2b2b30, { rough: charcoal ? 0.9 : 0.5, flat: true });
  g.add(mesh(flatIco(), m, 0, 0, 0, 0.3, 0.2, 0, 0.055, 0.045, 0.05));
  g.add(mesh(flatIco(), m, 0.04, -0.01, 0.02, 0.1, 0.8, 0, 0.032, 0.03, 0.03));
  g.add(mesh(flatIco(), m, -0.036, -0.012, -0.018, 0.5, 0.1, 0.3, 0.03, 0.028, 0.03));
  const glint = basicMat(charcoal ? 0x8a7a6a : 0x6a6a78, { opacity: 0.8 });
  [[0.02, 0.04, 0.03], [-0.03, 0.02, 0.035], [0.04, 0.012, -0.03]].forEach((p) => g.add(mesh(unitOcta(), glint, p[0], p[1], p[2], 0, 0, 0, 0.007, 0.007, 0.007)));
  g.userData.size = 0.13;
  return g;
}
function buildRaw(spec) {
  const g = new THREE.Group();
  const rock = stdMat(0x7e8087, { rough: 0.85, flat: true });
  const ore = stdMat(spec.color, { rough: 0.4, metal: 0.12, flat: true, emissive: spec.color, ei: 0.08 });
  g.add(mesh(flatIco(), rock, 0, 0, 0, 0.2, 0.4, 0, 0.06, 0.05, 0.055));
  g.add(mesh(flatIco(), rock, 0.04, -0.008, 0.02, 0.1, 0.8, 0, 0.03, 0.028, 0.03));
  [[0.03, 0.03, 0.04, 0.018], [-0.03, 0.02, 0.042, 0.014], [0.0, 0.045, 0.0, 0.016], [0.045, 0.0, -0.03, 0.012], [-0.04, -0.01, -0.035, 0.013]].forEach((p, i) => {
    g.add(mesh(flatIco(), ore, p[0], p[1], p[2], i, i * 2, 0, p[3], p[3], p[3]));
  });
  g.userData.size = 0.14;
  return g;
}
function buildIngot(spec) {
  const g = new THREE.Group();
  const col = spec.color;
  const m = stdMat(col, { rough: 0.28, metal: 0.2, emissive: spec.key.indexOf('kuantum') >= 0 ? col : 0, ei: spec.key.indexOf('kuantum') >= 0 ? 0.3 : 0 });
  const hi = stdMat(mixColor(col, 0xffffff, 0.45), { rough: 0.2, metal: 0.15 });
  const pts = [[-0.075, -0.026], [0.075, -0.026], [0.06, 0.026], [-0.06, 0.026]];
  g.add(mesh(shapeGeo('ingot', pts, 0.06, 0.007), m, 0, 0, 0, 0, 0, 0));
  g.add(mesh(shapeGeo('ingot:top', insetPts(pts, 0.7, 0, 0.014), 0.05, 0.004), hi, 0, 0, 0));
  g.rotation.y = 0.5;
  g.userData.size = 0.17;
  return g;
}
function buildGem(spec) {
  const g = new THREE.Group();
  const col = spec.color;
  const m = stdMat(col, { rough: 0.12, metal: 0.05, flat: true, emissive: col, ei: 0.4 });
  g.add(mesh(lathe('gem:' + spec.key, [[0, -0.07], [0.045, -0.005], [0.04, 0.018], [0.024, 0.032], [0, 0.034]], 8), m, 0, 0, 0, 0, PI / 8, 0));
  g.add(mesh(unitOcta(), basicMat(0xffffff, { opacity: 0.55 }), -0.01, 0.026, -0.02, 0, 0, 0, 0.008, 0.012, 0.008));
  g.add(mesh(unitSphere(), basicMat(col, { add: true, opacity: 0.16 }), 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1));
  g.userData.size = 0.14;
  return g;
}
function buildCrystal(spec) {
  const g = new THREE.Group();
  const col = spec.color;
  const m = stdMat(col, { rough: 0.15, flat: true, emissive: col, ei: 0.5 });
  const prism = (x, z, h, r, rx, rz) => {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    p.rotation.set(rx, 0, rz);
    p.add(mesh(G('cry:cyl', () => new THREE.CylinderGeometry(1, 1, 1, 6)), m, 0, h / 2, 0, 0, 0, 0, r, h, r));
    p.add(mesh(G('cry:cone', () => new THREE.ConeGeometry(1, 1, 6)), m, 0, h + r * 0.6, 0, 0, 0, 0, r, r * 1.2, r));
    g.add(p);
  };
  prism(0, 0, 0.1, 0.02, 0, 0);
  prism(0.032, 0.01, 0.07, 0.015, 0, -0.35);
  prism(-0.03, -0.01, 0.06, 0.014, 0.2, 0.4);
  g.position.y = -0.05;
  const wrap = new THREE.Group();
  wrap.add(g);
  wrap.add(mesh(unitSphere(), basicMat(col, { add: true, opacity: 0.16 }), 0, 0.03, 0, 0, 0, 0, 0.1, 0.1, 0.1));
  wrap.userData.size = 0.16;
  return wrap;
}
function buildDust(spec) {
  const g = new THREE.Group();
  const col = spec.color;
  g.add(mesh(unitCone(), stdMat(col, { rough: 0.8, flat: true, emissive: col, ei: 0.15 }), 0, -0.01, 0, 0, 0, 0, 0.065, 0.06, 0.065));
  const sp = basicMat(mixColor(col, 0xffffff, 0.5), { bright: 1.2 });
  for (let i = 0; i < 6; i++) g.add(mesh(unitOcta(), sp, Math.cos(i * 1.7) * 0.03, 0.025 + (i % 3) * 0.015, Math.sin(i * 1.7) * 0.03, 0, i, 0, 0.005, 0.007, 0.005));
  g.userData.size = 0.12;
  return g;
}
function buildString() {
  const g = new THREE.Group();
  const m = stdMat(0xe8e0d0, { rough: 0.9 });
  for (let i = 0; i < 5; i++) g.add(mesh(unitTorus(), m, 0, -0.03 + i * 0.014, 0, PI / 2, 0, i * 0.2, 0.036 - Math.abs(i - 2) * 0.004, 0.036 - Math.abs(i - 2) * 0.004, 0.04));
  g.add(mesh(unitCyl(), m, 0.03, 0.045, 0.02, 0.6, 0, 0.5, 0.004, 0.06, 0.004));
  g.userData.size = 0.1;
  return g;
}
function buildWool() {
  const g = new THREE.Group();
  const m = stdMat(0xf2f2ee, { rough: 0.95 });
  [[0, 0, 0, 0.05], [0.04, -0.01, 0.02, 0.036], [-0.04, -0.005, 0.015, 0.038], [0.01, 0.03, -0.015, 0.034], [-0.012, -0.012, 0.045, 0.03], [0.02, 0.008, -0.04, 0.03]].forEach((p) => g.add(mesh(unitIco(), m, p[0], p[1], p[2], 0, 0, 0, p[3], p[3] * 0.9, p[3])));
  g.userData.size = 0.13;
  return g;
}
function buildLeather(spec) {
  const g = new THREE.Group();
  const m = stdMat(spec.color, { rough: 0.8 });
  g.add(mesh(G('leather', () => rbox(0.14, 0.11, 0.014, 0.006)), m, 0, 0, 0, 0, 0, 0.1));
  g.add(mesh(G('leather:fold', () => rbox(0.1, 0.07, 0.012, 0.005)), stdMat(0xa87a4a, { rough: 0.75 }), 0.01, 0.005, 0.012, 0, 0, 0.2));
  [-0.05, 0.05].forEach((x) => g.add(mesh(unitSphere(), stdMat(0xd8c8a0, { rough: 0.6 }), x, 0.04, 0.008, 0, 0, 0, 0.004, 0.004, 0.004)));
  g.userData.size = 0.14;
  return g;
}
function buildFeather() {
  const g = new THREE.Group();
  const vane = stdMat(0xf5f5f0, { rough: 0.85, side: THREE.DoubleSide });
  const pts = [[0, -0.08], [0.03, -0.04], [0.04, 0.02], [0.02, 0.07], [0, 0.1], [-0.018, 0.07], [-0.032, 0.02], [-0.024, -0.04]];
  g.add(mesh(shapeGeo('feather', pts, 0.002, 0.001), vane, 0, 0, 0));
  g.add(mesh(unitCyl(), stdMat(0xd8d4c4, { rough: 0.7 }), 0.0, 0.0, 0.0015, 0, 0, 0.04, 0.0025, 0.2, 0.0025));
  g.add(mesh(unitBox(), stdMat(0xd0cdc0, { rough: 0.8 }), 0.012, 0.03, 0.0016, 0, 0, 0.5, 0.002, 0.06, 0.001));
  g.rotation.z = -0.5;
  g.userData.size = 0.2;
  return g;
}
function buildFlint() {
  const g = new THREE.Group();
  const m = stdMat(0x55575c, { rough: 0.4, flat: true });
  g.add(mesh(flatIco(), m, 0, 0, 0, 0.3, 0.5, 0.2, 0.04, 0.07, 0.025));
  g.add(mesh(flatIco(), stdMat(0x3a3c40, { rough: 0.4, flat: true }), 0.03, -0.01, 0.01, 0.1, 0.2, 0.7, 0.025, 0.04, 0.02));
  g.add(mesh(unitOcta(), basicMat(0x9aa0aa, { opacity: 0.7 }), -0.01, 0.03, 0.02, 0, 0, 0, 0.006, 0.01, 0.006));
  g.userData.size = 0.12;
  return g;
}
function buildBone() {
  const g = new THREE.Group();
  const m = stdMat(0xeeeadc, { rough: 0.65 });
  const b = new THREE.Group();
  b.rotation.z = 0.6;
  b.add(mesh(unitCyl(), m, 0, 0, 0, 0, 0, 0, 0.012, 0.13, 0.012));
  [[-1, 1], [1, 1]].forEach(([s]) => {
    b.add(mesh(unitSphere(), m, s * 0.011, 0.07, 0, 0, 0, 0, 0.017, 0.017, 0.017));
    b.add(mesh(unitSphere(), m, s * 0.011, -0.07, 0, 0, 0, 0, 0.017, 0.017, 0.017));
  });
  g.add(b);
  g.userData.size = 0.16;
  return g;
}
function buildClay(spec) {
  const g = new THREE.Group();
  g.add(mesh(unitIco(), stdMat(spec.color, { rough: 0.7 }), 0, 0, 0, 0, 0, 0, 0.055, 0.05, 0.055));
  g.add(mesh(unitSphere(), basicMat(0xffffff, { opacity: 0.25 }), -0.02, 0.025, -0.035, 0, 0, 0, 0.012, 0.016, 0.006));
  g.userData.size = 0.11;
  return g;
}
function buildBrick(spec) {
  const g = new THREE.Group();
  g.add(mesh(G('brick', () => rbox(0.12, 0.052, 0.06, 0.008)), stdMat(spec.color, { rough: 0.85 }), 0, 0, 0, 0, 0.3, 0));
  g.add(mesh(unitBox(), stdMat(0xd8a090, { rough: 0.9 }), 0.0, 0.0265, 0.0, 0, 0.3, 0, 0.1, 0.002, 0.045));
  g.userData.size = 0.14;
  return g;
}
function buildPaper() {
  const g = new THREE.Group();
  const m = stdMat(0xf0ead8, { rough: 0.9, side: THREE.DoubleSide });
  g.add(mesh(G('paper', () => rbox(0.1, 0.13, 0.003, 0.002)), m, 0, 0, 0, 0, 0, 0.1));
  g.add(mesh(G('paper', () => rbox(0.1, 0.13, 0.003, 0.002)), m, 0.012, -0.006, 0.006, 0, 0, -0.08));
  for (let i = 0; i < 4; i++) g.add(mesh(unitBox(), stdMat(0x8a8a90, { rough: 0.9 }), 0.012, 0.04 - i * 0.022, 0.0085, 0, 0, -0.08, 0.07, 0.003, 0.001));
  g.userData.size = 0.14;
  return g;
}
function buildBook(spec) {
  const g = new THREE.Group();
  const cover = stdMat(spec.color, { rough: 0.7 });
  g.add(mesh(G('book:cover', () => rbox(0.1, 0.14, 0.036, 0.006)), cover, 0, 0, 0));
  g.add(mesh(unitBox(), stdMat(0xf3ecd8, { rough: 0.85 }), 0.005, 0, 0, 0, 0, 0, 0.09, 0.128, 0.03));
  g.add(mesh(unitBox(), stdMat(0x5e2f18, { rough: 0.7 }), -0.048, 0, 0, 0, 0, 0, 0.008, 0.142, 0.038));
  g.add(mesh(unitSphere(), stdMat(0xf4c940, { rough: 0.3, metal: 0.2 }), 0.0, 0.0, 0.019, 0, 0, 0, 0.016, 0.016, 0.003));
  g.rotation.set(0.0, 0.4, 0.0);
  g.userData.size = 0.15;
  return g;
}
function buildOrb(spec) {
  const g = new THREE.Group();
  const col = spec.color;
  g.add(mesh(unitSphere(), stdMat(col, { rough: 0.15, emissive: col, ei: 0.6 }), 0, 0, 0, 0, 0, 0, 0.045, 0.045, 0.045));
  g.add(mesh(unitSphere(), basicMat(col, { add: true, opacity: 0.22 }), 0, 0, 0, 0, 0, 0, 0.085, 0.085, 0.085));
  const r1 = mesh(unitTorus(), basicMat(mixColor(col, 0xffffff, 0.4), { bright: 1.2 }), 0, 0, 0, PI / 2.4, 0, 0, 0.066, 0.066, 0.066);
  const r2 = mesh(unitTorus(), basicMat(mixColor(col, 0xffffff, 0.4), { bright: 1.2 }), 0, 0, 0, 0.3, 0, PI / 3, 0.075, 0.075, 0.075);
  g.add(r1, r2);
  g.userData.update = (t) => {
    r1.rotation.z = t * 1.4;
    r2.rotation.y = -t * 1.1;
  };
  g.userData.size = 0.16;
  return g;
}
function buildStar() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2 + PI / 2;
    const r = i % 2 ? 0.032 : 0.075;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  g.add(mesh(shapeGeo('star', pts, 0.022, 0.006), stdMat(0xffe066, { rough: 0.25, metal: 0.15, emissive: 0xffc83a, ei: 0.5 })));
  g.add(mesh(shapeGeo('star:in', insetPts(pts, 0.55), 0.03, 0.004), stdMat(0xfff4b0, { rough: 0.2, emissive: 0xffe066, ei: 0.7 })));
  g.add(mesh(unitSphere(), basicMat(0xffd84a, { add: true, opacity: 0.2 }), 0, 0, 0, 0, 0, 0, 0.11, 0.11, 0.05));
  g.userData.update = (t) => { g.rotation.y = Math.sin(t * 1.5) * 0.4; };
  g.userData.size = 0.16;
  return g;
}
function buildDye(spec) {
  const g = new THREE.Group();
  const col = spec.color;
  g.add(mesh(lathe('dye', [[0, -0.05], [0.026, -0.045], [0.04, -0.02], [0.036, 0.008], [0.016, 0.034], [0, 0.058]], 14), stdMat(col, { rough: 0.18, emissive: col, ei: 0.12 })));
  g.add(mesh(unitSphere(), basicMat(0xffffff, { opacity: 0.5 }), -0.016, 0.0, -0.032, 0, 0, 0, 0.007, 0.018, 0.004));
  g.userData.size = 0.12;
  return g;
}

/* ---------------------------------- anahtarlar ---------------------------------- */
const ZONE_KEY_COLORS = [0x7fe8ff, 0x7fffa8, 0xffb070, 0xcfe8ff, 0xd48cff];
function buildCrystalKey(spec) {
  const g = new THREE.Group();
  const col = ZONE_KEY_COLORS[(spec.sub || 0) % ZONE_KEY_COLORS.length];
  const m = stdMat(col, { rough: 0.1, flat: true, emissive: col, ei: 0.7 });
  g.add(mesh(G('ck:cyl', () => new THREE.CylinderGeometry(1, 1, 1, 6)), m, 0, 0, 0, 0, 0, 0, 0.026, 0.1, 0.026));
  g.add(mesh(G('ck:cone', () => new THREE.ConeGeometry(1, 1, 6)), m, 0, 0.085, 0, 0, 0, 0, 0.026, 0.07, 0.026));
  g.add(mesh(G('ck:cone', () => new THREE.ConeGeometry(1, 1, 6)), m, 0, -0.085, 0, PI, 0, 0, 0.026, 0.07, 0.026));
  g.add(mesh(unitSphere(), basicMat(col, { add: true, opacity: 0.2 }), 0, 0, 0, 0, 0, 0, 0.1, 0.16, 0.1));
  const r1 = mesh(unitTorus(), basicMat(col, { bright: 1.3 }), 0, 0, 0, PI / 2, 0, 0, 0.05, 0.05, 0.05);
  const r2 = mesh(unitTorus(), basicMat(col, { bright: 1.3 }), 0, 0.02, 0, PI / 2.5, 0, 0, 0.062, 0.062, 0.062);
  g.add(r1, r2);
  g.userData.update = (t) => {
    r1.rotation.z = t * 1.6;
    r2.rotation.z = -t * 1.1;
    g.rotation.y = t * 0.8;
  };
  g.userData.size = 0.24;
  return g;
}
function keyGeo(g, mat, bowMat, big) {
  const s = big ? 1.35 : 1;
  g.add(mesh(unitTorus(), bowMat, 0, 0.09 * s, 0, 0, 0, 0, 0.034 * s, 0.034 * s, 0.034 * s));
  g.add(mesh(unitCyl(), mat, 0, -0.01 * s, 0, 0, 0, 0, 0.011 * s, 0.17 * s, 0.011 * s));
  [[0.0, 0.05], [0.028, 0.034], [0.022, 0.018]].forEach((t, i) => g.add(mesh(unitBox(), mat, t[0] * s + 0.012 * s, -0.062 * s + i * 0.026 * s, 0, 0, 0, 0, 0.032 * s, 0.014 * s, 0.014 * s)));
}
function buildKey(spec) {
  const g = new THREE.Group();
  const m = stdMat(spec.color, { rough: 0.3, metal: 0.2 });
  keyGeo(g, m, m, false);
  g.rotation.z = 0.5;
  g.userData.size = 0.2;
  return g;
}
function buildBossKey(spec) {
  const g = new THREE.Group();
  const m = stdMat(0x3a2a30, { rough: 0.35, metal: 0.2 });
  const gold = stdMat(spec.color, { rough: 0.3, metal: 0.2, emissive: spec.color, ei: 0.3 });
  keyGeo(g, m, gold, true);
  g.add(mesh(unitOcta(), basicMat(spec.color, { bright: 1.5 }), 0, 0.122, 0, 0, 0, 0, 0.016, 0.026, 0.016));
  g.add(mesh(unitSphere(), basicMat(spec.color, { add: true, opacity: 0.2 }), 0, 0.06, 0, 0, 0, 0, 0.12, 0.16, 0.08));
  g.userData.update = (t) => { g.rotation.y = Math.sin(t * 1.4) * 0.3; };
  g.userData.size = 0.28;
  return g;
}

/* ---------------------------------- yedek ---------------------------------- */
function buildFlat(spec) {
  const g = new THREE.Group();
  const col = spec.color;
  g.add(mesh(G('flat:a', () => extrude(rrectShape(0.13, 0.13, 0.03), 0.02, 0.006)), stdMat(mixColor(col, 0x000000, 0.35), { rough: 0.6 })));
  g.add(mesh(G('flat:b', () => extrude(rrectShape(0.1, 0.1, 0.024), 0.026, 0.005)), stdMat(col, { rough: 0.45 })));
  g.add(mesh(G('flat:c', () => extrude(rrectShape(0.04, 0.04, 0.012), 0.03, 0.003)), stdMat(mixColor(col, 0xffffff, 0.5), { rough: 0.3 }), -0.02, 0.022, 0));
  g.userData.size = 0.14;
  return g;
}

export const MISC_BUILDERS = {
  apple: buildApple,
  strawberry: buildStrawberry,
  carrot: buildCarrot,
  potato: buildPotato,
  drumstick: buildDrumstick,
  chop: buildChop,
  fish: buildFish,
  bowl: buildBowl,
  potion: buildPotion,
  stick: buildStick,
  coal: buildCoal,
  raw: buildRaw,
  ingot: buildIngot,
  gem: buildGem,
  crystal: buildCrystal,
  dust: buildDust,
  string: buildString,
  wool: buildWool,
  leather: buildLeather,
  feather: buildFeather,
  flint: buildFlint,
  bone: buildBone,
  clay: buildClay,
  brick: buildBrick,
  paper: buildPaper,
  book: buildBook,
  orb: buildOrb,
  star: buildStar,
  dye: buildDye,
  crystalkey: buildCrystalKey,
  key: buildKey,
  bosskey: buildBossKey,
  flat: buildFlat,
};

export { tubeGeo };
