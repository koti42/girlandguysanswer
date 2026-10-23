/*
 * KEŞİF elde tutulan eşya modelleri — alet, silah, ışık, donanım, zırh (three, WebGL yok).
 *
 * Aletler/kılıçlar düz sprite değil: pahlı ekstrüzyonla katmanlanmış silüetlerdir (kenar / gövde /
 * vurgu) ve 7 kademenin her biri ayrı palet kullanır (itemPalette.TIER_PALETTES). Elmas ve kuantum
 * kademeleri ışıyan kenar ve kıymık parıltıları taşır.
 * Her kurucu (spec, ctx) → THREE.Group döner; userData: {size, update?, anchors…}.
 */
import {
  THREE, G, stdMat, basicMat, mesh, shapeGeo, insetPts, rbox, lathe, tubeGeo, unitSphere, unitCyl, unitCone, unitBox,
  unitOcta, unitTorus, stretchBetween, extrude,
} from './heldItemsKit.js';
import { getBlock } from '../sim/blocks.js';
import { blockFallbackColor } from './itemPalette.js';

const PI = Math.PI;
const taperCyl = () => G('u:cyl:taper', () => new THREE.CylinderGeometry(0.8, 1, 1, 12, 1));

/** Kademe malzemeleri. */
function toolMats(P) {
  const glowOn = P.glow ? 1 : 0;
  return {
    head: stdMat(P.head, { rough: P.rough, metal: P.metal, emissive: P.glow || 0, ei: glowOn * 0.22 }),
    light: stdMat(P.light, { rough: Math.max(0.12, P.rough - 0.1), metal: P.metal, emissive: P.glow || 0, ei: glowOn * 0.4 }),
    dark: stdMat(P.dark, { rough: P.rough, metal: P.metal }),
    edge: stdMat(P.edge, { rough: P.rough + 0.1, metal: P.metal * 0.5, emissive: P.glow || 0, ei: glowOn * 0.55 }),
    handle: stdMat(P.handle, { rough: 0.82 }),
    handleDark: stdMat(P.handleDark, { rough: 0.8 }),
    wrap: stdMat(P.wrap, { rough: 0.7, emissive: P.glow || 0, ei: glowOn * 0.5 }),
    // Keşif görünümü paletleri (emitOnly) yalnız emissive rengi taşır: ek halo/kıymık MESH'i eklemez (çizim çağrısı sayısı değişmez)
    halo: P.glow && !P.emitOnly ? basicMat(P.glow, { add: true, opacity: 0.22 }) : null,
    spark: P.glow && !P.emitOnly ? basicMat(P.glow, { bright: 1.5 }) : null,
  };
}

function handle(g, P, M, y0 = -0.14, y1 = 0.46) {
  g.add(mesh(taperCyl(), M.handle, 0, (y0 + y1) / 2, 0, 0, 0, 0, 0.0185, y1 - y0, 0.0185));
  for (let i = 0; i < 4; i++) g.add(mesh(unitCyl(), M.wrap, 0, y0 + 0.04 + i * 0.027, 0, 0, 0, 0, 0.0215, 0.015, 0.0215));
  g.add(mesh(unitSphere(), M.handleDark, 0, y0 - 0.004, 0, 0, 0, 0, 0.024, 0.024, 0.024));
}

/** Parıldayan kıymık (elmas/kuantum vurgusu). */
function shard(g, M, x, y, z, s, rot = 0) {
  if (!M.spark) return;
  g.add(mesh(unitOcta(), M.spark, x, y, z, 0, rot, rot * 0.5, s * 0.55, s, s * 0.55));
  g.add(mesh(unitSphere(), M.halo, x, y, z, 0, 0, 0, s * 1.5, s * 1.5, s * 1.5));
}

/** Üç katmanlı silüet: kenar (koyu), gövde, vurgu. */
function layered(g, M, key, pts, depth, o = {}) {
  g.add(mesh(shapeGeo(key + ':a', pts, depth, 0.007), M.edge, 0, 0, 0));
  g.add(mesh(shapeGeo(key + ':b', insetPts(pts, o.body || 0.88), depth * 1.12, 0.006), M.head, 0, 0, 0));
  g.add(mesh(shapeGeo(key + ':c', insetPts(pts, o.hi || 0.5, 0, o.hiShift === undefined ? 0.012 : o.hiShift), depth * 1.22, 0.004), M.light, 0, 0, 0));
  if (M.halo) g.add(mesh(shapeGeo(key + ':h', insetPts(pts, 1.1), depth * 0.6, 0.002), M.halo, 0, 0, 0));
}

/** Hilal biçimli başlık çokgeni (kazma). */
function crescentPts(w, thick, droop, yc, n = 14) {
  const top = [];
  const bot = [];
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n;
    const k = Math.max(0, 1 - u * u);
    const base = yc - droop * u * u;
    top.push([u * w, base + thick * 0.62 * Math.pow(k, 0.75)]);
    bot.push([u * w, base - thick * 0.38 * Math.pow(k, 0.75)]);
  }
  const pts = top.slice();
  for (let i = n - 1; i >= 1; i--) pts.push(bot[i]);
  return pts;
}

/* ------------------------------------------------------------------------------------------------
 * ALETLER
 * ---------------------------------------------------------------------------------------------- */
function buildPick(spec) {
  const P = spec.palette;
  const M = toolMats(P);
  const g = new THREE.Group();
  handle(g, P, M);
  layered(g, M, 'pick', crescentPts(0.215, 0.085, 0.075, 0.425), 0.05, { hi: 0.55, hiShift: 0.014 });
  g.add(mesh(G('pick:socket', () => rbox(0.06, 0.1, 0.07, 0.01)), M.dark, 0, 0.43, 0));
  shard(g, M, 0.205, 0.37, 0, 0.018, 0.4);
  shard(g, M, -0.205, 0.37, 0, 0.018, -0.4);
  g.userData.size = 0.5;
  return g;
}

function buildAxe(spec) {
  const P = spec.palette;
  const M = toolMats(P);
  const g = new THREE.Group();
  handle(g, P, M);
  const blade = [
    [0.015, 0.505], [0.07, 0.54], [0.14, 0.55], [0.2, 0.53], [0.228, 0.47], [0.234, 0.4], [0.224, 0.335], [0.19, 0.27],
    [0.13, 0.245], [0.07, 0.27], [0.015, 0.31],
  ];
  layered(g, M, 'axe', blade, 0.04, { hi: 0.55, hiShift: 0.015 });
  g.add(mesh(G('axe:poll', () => rbox(0.055, 0.1, 0.05, 0.01)), M.dark, -0.03, 0.41, 0));
  g.add(mesh(G('axe:collar', () => rbox(0.05, 0.05, 0.05, 0.008)), M.dark, 0.012, 0.455, 0));
  shard(g, M, 0.232, 0.4, 0, 0.02, 0.2);
  g.userData.size = 0.52;
  return g;
}

function buildShovel(spec) {
  const P = spec.palette;
  const M = toolMats(P);
  const g = new THREE.Group();
  handle(g, P, M, -0.14, 0.36);
  // T tutacak
  g.add(mesh(unitCyl(), M.handleDark, 0, -0.145, 0, PI / 2, 0, 0, 0.016, 0.1, 0.016));
  const spade = [
    [-0.072, 0.34], [0.072, 0.34], [0.096, 0.42], [0.09, 0.5], [0.062, 0.57], [0, 0.625], [-0.062, 0.57], [-0.09, 0.5], [-0.096, 0.42],
  ];
  layered(g, M, 'shovel', spade, 0.02, { hi: 0.5, hiShift: 0.02, body: 0.9 });
  g.add(mesh(unitCyl(), M.dark, 0, 0.345, 0, 0, 0, 0, 0.026, 0.05, 0.026));
  // orta kaburga
  g.add(mesh(G('shovel:rib', () => rbox(0.018, 0.2, 0.026, 0.006)), M.light, 0, 0.46, 0));
  shard(g, M, 0, 0.62, 0, 0.018, 0.3);
  g.userData.size = 0.62;
  return g;
}

function buildSword(spec) {
  const P = spec.palette;
  const M = toolMats(P);
  const g = new THREE.Group();
  const blade = [[-0.034, 0.115], [0.034, 0.115], [0.031, 0.5], [0, 0.605], [-0.031, 0.5]];
  g.add(mesh(shapeGeo('sword:a', blade, 0.014, 0.004), M.edge));
  g.add(mesh(shapeGeo('sword:b', insetPts(blade, 0.8, 0, -0.002), 0.017, 0.003), M.head));
  // kan oluğu + kenar parlaklığı
  g.add(mesh(shapeGeo('sword:f', [[-0.008, 0.14], [0.008, 0.14], [0.008, 0.48], [0, 0.52], [-0.008, 0.48]], 0.019, 0.002), M.dark));
  [-1, 1].forEach((s) => g.add(mesh(shapeGeo('sword:e', [[0, 0.12], [0.006, 0.12], [0.004, 0.5], [0, 0.55]], 0.018, 0.002), M.light, s * 0.026, 0, 0, 0, s < 0 ? PI : 0, 0)));
  if (M.halo) g.add(mesh(shapeGeo('sword:h', insetPts(blade, 1.3), 0.008, 0.002), M.halo));
  // balçak
  g.add(mesh(G('sword:guard', () => rbox(0.17, 0.028, 0.036, 0.009)), M.dark, 0, 0.1, 0));
  [-1, 1].forEach((s) => g.add(mesh(unitSphere(), M.head, s * 0.088, 0.1, 0, 0, 0, 0, 0.016, 0.016, 0.016)));
  g.add(mesh(unitCyl(), M.handle, 0, -0.005, 0, 0, 0, 0, 0.0165, 0.2, 0.0165));
  for (let i = 0; i < 4; i++) g.add(mesh(unitCyl(), M.wrap, 0, -0.06 + i * 0.036, 0, 0, 0, 0, 0.019, 0.014, 0.019));
  g.add(mesh(unitSphere(), M.head, 0, -0.112, 0, 0, 0, 0, 0.028, 0.028, 0.028));
  shard(g, M, 0, 0.3, 0.02, 0.014, 0.3);
  shard(g, M, 0, 0.46, 0.02, 0.012, 0.9);
  g.userData.size = 0.72;
  return g;
}

/* ------------------------------------------------------------------------------------------------
 * YAY VE OK
 * ---------------------------------------------------------------------------------------------- */
const ARROW_LEN = 0.56;
function arrowParts(g, y0, scale = 1) {
  const wood = stdMat(0xc9b48a, { rough: 0.8 });
  const tipM = stdMat(0x6b6e76, { rough: 0.45, metal: 0.15 });
  const fl = [stdMat(0xe5483f, { rough: 0.9, side: THREE.DoubleSide }), stdMat(0xf6f3ff, { rough: 0.9, side: THREE.DoubleSide })];
  const L = ARROW_LEN * scale;
  g.add(mesh(unitCyl(), wood, 0, y0 + L / 2, 0, 0, 0, 0, 0.0055 * scale, L, 0.0055 * scale));
  g.add(mesh(unitCone(), tipM, 0, y0 + L + 0.022 * scale, 0, 0, 0, 0, 0.0135 * scale, 0.05 * scale, 0.0135 * scale));
  g.add(mesh(unitCyl(), stdMat(0x3a3a44, { rough: 0.6 }), 0, y0 + 0.012 * scale, 0, 0, 0, 0, 0.0075 * scale, 0.024 * scale, 0.0075 * scale));
  const fg = G('arrow:fletch', () => extrude((() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.03, 0.01);
    s.lineTo(0.03, 0.085);
    s.lineTo(0, 0.1);
    s.closePath();
    return s;
  })(), 0.0012, 0));
  for (let i = 0; i < 3; i++) {
    const m = mesh(fg, fl[i % 2], 0, y0 + 0.02 * scale, 0, 0, (i * 2 * PI) / 3, 0, scale, scale, scale);
    g.add(m);
  }
}
function buildArrow() {
  const g = new THREE.Group();
  arrowParts(g, -ARROW_LEN / 2 - 0.01);
  g.userData.size = ARROW_LEN + 0.07;
  return g;
}

function buildBow() {
  const g = new THREE.Group();
  const wood = stdMat(0x8a5a33, { rough: 0.7 });
  const woodLight = stdMat(0xb27a46, { rough: 0.6 });
  const leather = stdMat(0x3a2a20, { rough: 0.85 });
  const stringM = stdMat(0xf1ead8, { rough: 0.8 });
  const half = 0.4;
  const top = [];
  const bot = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const y = u * half;
    const z = 0.115 * Math.pow(u, 2.2) - 0.0;
    top.push([0, y, z + (u > 0.85 ? (u - 0.85) * -0.12 : 0)]);
    bot.push([0, -y, z + (u > 0.85 ? (u - 0.85) * -0.12 : 0)]);
  }
  g.add(mesh(tubeGeo('bow:top', top, 0.0125, 20, 8), wood));
  g.add(mesh(tubeGeo('bow:bot', bot, 0.0125, 20, 8), wood));
  g.add(mesh(tubeGeo('bow:topIn', top.slice(0, 6), 0.0145, 14, 8), woodLight));
  g.add(mesh(tubeGeo('bow:botIn', bot.slice(0, 6), 0.0145, 14, 8), woodLight));
  g.add(mesh(unitCyl(), leather, 0, 0, 0, 0, 0, 0, 0.0215, 0.12, 0.0215));
  for (let i = 0; i < 3; i++) g.add(mesh(unitCyl(), stdMat(0x7a5a3a, { rough: 0.8 }), 0, -0.04 + i * 0.04, 0, 0, 0, 0, 0.0228, 0.01, 0.0228));
  const tipTop = top[top.length - 1];
  const tipBot = bot[bot.length - 1];
  [tipTop, tipBot].forEach((t) => g.add(mesh(unitSphere(), stdMat(0xe8dcc0, { rough: 0.6 }), t[0], t[1], t[2], 0, 0, 0, 0.0165, 0.0165, 0.0165)));
  const s1 = mesh(unitCyl(), stringM, 0, 0, 0);
  const s2 = mesh(unitCyl(), stringM, 0, 0, 0);
  const bead = mesh(unitSphere(), stdMat(0xc4b48a, { rough: 0.6 }), 0, 0, 0.12, 0, 0, 0, 0.007, 0.007, 0.007);
  g.add(s1, s2, bead);
  const arrow = new THREE.Group();
  arrowParts(arrow, -0.02, 1);
  arrow.rotation.x = -PI / 2;
  g.add(arrow);
  const restZ = tipTop[2];
  const api = {
    draw: 0,
    nocked: false,
    bead,
    /** a: 0..1 germe, nocked: ok yayda mı. */
    setDraw(a, nocked) {
      api.draw = Math.max(0, Math.min(1, a));
      if (nocked !== undefined) api.nocked = !!nocked;
      const zN = restZ + 0.36 * api.draw;
      const tz = tipTop[2] + 0.025 * api.draw;
      stretchBetween(s1, [0, tipTop[1], tz], [0, 0, zN], 0.0026);
      stretchBetween(s2, [0, tipBot[1], tz], [0, 0, zN], 0.0026);
      bead.position.set(0, 0, zN);
      arrow.visible = api.nocked;
      arrow.position.set(0, 0, zN);
    },
  };
  api.setDraw(0, false);
  g.userData.bow = api;
  g.userData.size = 0.82;
  return g;
}

/* ------------------------------------------------------------------------------------------------
 * IŞIN TÜFEĞİ, PORTAL TABANCASI, ENERJİ HÜCRESİ
 * ---------------------------------------------------------------------------------------------- */
function buildGun(spec, ctx, portal) {
  const g = new THREE.Group();
  const mk2 = !portal && spec.sub === 'mk2'; // Işın Tüfeği Mk2: yeşil-turkuaz çekirdek, koyu gövde, 6 bobin
  // Keşif mağaza görünümü (yalnız portal tabancası): yalnız renk parametresi; skin yoksa eski sabitler. a = mavi portal, b = turuncu portal.
  const sk = portal && spec.skin && spec.skin.slot === 'portal' ? spec.skin : null;
  const accent = sk ? sk.b.c : portal ? 0xff9a3a : mk2 ? 0x7affd8 : 0x5ad7ff;
  const accent2 = sk ? sk.a.c : portal ? 0x3aa0ff : mk2 ? 0x2fe8a0 : 0x5ad7ff;
  const body = stdMat(sk ? sk.body : portal ? 0xf2f4f8 : mk2 ? 0x3a455a : 0xdde4ee, { rough: 0.3, metal: mk2 ? 0.3 : 0.12 });
  const panel = stdMat(0x2b3340, { rough: 0.45, metal: 0.2 });
  const trim = stdMat(sk ? sk.trim : 0x8a96a8, { rough: 0.35, metal: 0.2 });
  const glowM = basicMat(accent, { bright: 1.5 });
  const glowM2 = basicMat(accent2, { bright: 1.5 });
  const halo = basicMat(accent, { add: true, opacity: 0.28 });
  g.add(mesh(G('gun:body', () => rbox(0.054, 0.078, 0.3, 0.012)), body, 0, 0.0, -0.04));
  g.add(mesh(G('gun:top', () => rbox(0.03, 0.02, 0.2, 0.006)), panel, 0, 0.048, -0.05));
  g.add(mesh(G('gun:rear', () => rbox(0.05, 0.06, 0.07, 0.01)), panel, 0, 0.004, 0.115));
  // çekirdek penceresi
  g.add(mesh(G('gun:win', () => rbox(0.01, 0.034, 0.14, 0.004)), stdMat(0x0d1a24, { rough: 0.2 }), 0.0278, 0.006, -0.03));
  g.add(mesh(G('gun:win', () => rbox(0.01, 0.034, 0.14, 0.004)), stdMat(0x0d1a24, { rough: 0.2 }), -0.0278, 0.006, -0.03));
  const core = mesh(G('gun:core', () => new THREE.CapsuleGeometry(0.0105, 0.115, 4, 10)), glowM, 0, 0.006, -0.03, PI / 2, 0, 0);
  g.add(core);
  g.add(mesh(unitSphere(), halo, 0, 0.006, -0.03, 0, 0, 0, 0.05, 0.04, 0.1));
  // namlu + bobinler
  g.add(mesh(unitCyl(), panel, 0, 0.01, -0.27, PI / 2, 0, 0, 0.0185, 0.24, 0.0185));
  const rings = [];
  const nRings = mk2 ? 6 : 4;
  for (let i = 0; i < nRings; i++) {
    const r = mesh(unitTorus(), i % 2 ? glowM : glowM2, 0, 0.01, -0.19 - i * (mk2 ? 0.034 : 0.045), 0, 0, 0, 0.03, 0.03, 0.05);
    rings.push(r);
    g.add(r);
  }
  g.add(mesh(unitSphere(), glowM, 0, 0.01, -0.395, 0, 0, 0, 0.016, 0.016, 0.022));
  g.add(mesh(unitSphere(), halo, 0, 0.01, -0.4, 0, 0, 0, 0.04, 0.04, 0.04));
  if (portal) {
    // üç dişli ağız
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + PI / 2;
      g.add(mesh(unitCone(), trim, Math.cos(a) * 0.028, 0.01 + Math.sin(a) * 0.028, -0.37, -PI / 2, 0, 0, 0.007, 0.07, 0.007));
    }
  } else {
    // soğutma kanatçıkları
    for (let i = 0; i < 4; i++) g.add(mesh(unitBox(), trim, 0, 0.044, -0.16 - i * 0.03, 0, 0, 0, 0.044, 0.014, 0.008));
  }
  // kabza, tetik
  g.add(mesh(G('gun:grip', () => rbox(0.042, 0.115, 0.054, 0.01)), panel, 0, -0.088, 0.062, 0.28, 0, 0));
  g.add(mesh(unitBox(), trim, 0, -0.03, -0.012, 0.3, 0, 0, 0.008, 0.032, 0.008));
  g.add(mesh(unitTorus(), trim, 0, -0.04, -0.03, 0, PI / 2, 0, 0.026, 0.026, 0.01));
  // yan şeritler
  [-1, 1].forEach((s) => g.add(mesh(unitBox(), glowM, s * 0.028, -0.03, 0.04, 0, 0, 0, 0.003, 0.012, 0.08)));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.41);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.update = (t) => {
    const p = 0.75 + 0.25 * Math.sin(t * 6);
    core.scale.set(p, 1, p);
    rings.forEach((r, i) => r.scale.set(0.03 * (0.9 + 0.1 * Math.sin(t * 8 - i)), 0.03 * (0.9 + 0.1 * Math.sin(t * 8 - i)), 0.05));
  };
  g.userData.size = 0.5;
  return g;
}

function buildCell(spec) {
  const g = new THREE.Group();
  const dark = stdMat(0x2a3340, { rough: 0.4, metal: 0.2 });
  const cap = stdMat(0x9aa4b4, { rough: 0.35, metal: 0.2 });
  const glow = basicMat(spec.color || 0x5ad7ff, { bright: 1.5 });
  g.add(mesh(unitCyl(), dark, 0, 0, 0, 0, 0, 0, 0.024, 0.09, 0.024));
  [-1, 1].forEach((s) => g.add(mesh(unitCyl(), cap, 0, s * 0.05, 0, 0, 0, 0, 0.028, 0.016, 0.028)));
  g.add(mesh(unitCyl(), glow, 0, 0, 0, 0, 0, 0, 0.0165, 0.07, 0.0165));
  g.add(mesh(unitCyl(), stdMat(0x9ad8ff, { rough: 0.15, opacity: 0.35 }), 0, 0, 0, 0, 0, 0, 0.0255, 0.074, 0.0255));
  [-1, 0, 1].forEach((s) => g.add(mesh(unitTorus(), cap, 0, s * 0.026, 0, PI / 2, 0, 0, 0.0255, 0.0255, 0.0255)));
  g.add(mesh(unitSphere(), basicMat(spec.color || 0x5ad7ff, { add: true, opacity: 0.25 }), 0, 0, 0, 0, 0, 0, 0.05, 0.07, 0.05));
  g.userData.size = 0.12;
  return g;
}

/* ------------------------------------------------------------------------------------------------
 * KALKAN
 * ---------------------------------------------------------------------------------------------- */
function buildShield() {
  const g = new THREE.Group();
  const kite = [[-0.17, 0.2], [0.17, 0.2], [0.18, 0.04], [0.12, -0.12], [0, -0.26], [-0.12, -0.12], [-0.18, 0.04]];
  const metal = stdMat(0xaab1ba, { rough: 0.35, metal: 0.2 });
  const metalDark = stdMat(0x6a717b, { rough: 0.45, metal: 0.2 });
  const wood = stdMat(0x8a5a33, { rough: 0.78 });
  const woodDark = stdMat(0x6a4224, { rough: 0.8 });
  g.add(mesh(shapeGeo('shield:rim', kite, 0.034, 0.008), metal, 0, 0, 0));
  g.add(mesh(shapeGeo('shield:panel', insetPts(kite, 0.84), 0.04, 0.006), wood, 0, 0, 0));
  // kalas tahtaları
  for (let i = -2; i <= 2; i++) g.add(mesh(unitBox(), woodDark, i * 0.055, 0, 0.0215, 0, 0, 0, 0.004, 0.42, 0.003));
  g.add(mesh(unitBox(), metalDark, 0, 0.06, 0.024, 0, 0, 0, 0.3, 0.025, 0.006));
  g.add(mesh(unitBox(), metalDark, 0, -0.07, 0.024, 0, 0, 0, 0.012, 0.3, 0.006));
  g.add(mesh(unitSphere(), metal, 0, 0.0, 0.026, 0, 0, 0, 0.052, 0.052, 0.03));
  g.add(mesh(unitSphere(), stdMat(0xf4c940, { rough: 0.3, metal: 0.2 }), 0, 0.0, 0.04, 0, 0, 0, 0.022, 0.022, 0.014));
  // arka kayış
  g.add(mesh(unitCyl(), stdMat(0x3a2a20, { rough: 0.85 }), 0, 0.02, -0.035, 0, 0, PI / 2, 0.012, 0.12, 0.012));
  g.userData.size = 0.46;
  return g;
}

/* ------------------------------------------------------------------------------------------------
 * MEŞALE VE FENER
 * ---------------------------------------------------------------------------------------------- */
function buildTorch() {
  const g = new THREE.Group();
  const wood = stdMat(0x7a4a26, { rough: 0.85 });
  const char = stdMat(0x2b1d14, { rough: 0.95 });
  g.add(mesh(G('torch:stick', () => new THREE.CylinderGeometry(0.016, 0.02, 0.3, 8)), wood, 0, 0.0, 0));
  g.add(mesh(unitCyl(), char, 0, 0.165, 0, 0, 0, 0, 0.0245, 0.05, 0.0245));
  g.add(mesh(unitCyl(), stdMat(0x4a3322, { rough: 0.9 }), 0, 0.134, 0, 0, 0, 0, 0.0225, 0.012, 0.0225));
  const flame = new THREE.Group();
  flame.position.set(0, 0.19, 0);
  const outer = mesh(unitCone(), basicMat(0xff7a1c, { add: true, opacity: 0.85 }), 0, 0.045, 0, 0, 0, 0, 0.034, 0.1, 0.034);
  const mid = mesh(unitCone(), basicMat(0xffb43a, { add: true, opacity: 0.9 }), 0, 0.038, 0, 0, 0, 0, 0.022, 0.075, 0.022);
  const inner = mesh(unitCone(), basicMat(0xfff2b0, { add: true, opacity: 0.95 }), 0, 0.028, 0, 0, 0, 0, 0.012, 0.045, 0.012);
  const glow = mesh(unitSphere(), basicMat(0xff9a3a, { add: true, opacity: 0.18 }), 0, 0.04, 0, 0, 0, 0, 0.09, 0.09, 0.09);
  flame.add(outer, mid, inner, glow);
  g.add(flame);
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0.24, 0);
  g.add(anchor);
  g.userData.flameAnchor = anchor;
  g.userData.update = (t) => {
    const f = 1 + 0.12 * Math.sin(t * 17) + 0.07 * Math.sin(t * 31 + 1.3);
    const w = 1 + 0.08 * Math.sin(t * 23 + 0.4);
    flame.scale.set(w, f, w);
    flame.rotation.z = Math.sin(t * 9) * 0.07;
    flame.rotation.x = Math.sin(t * 7.3 + 1) * 0.06;
    glow.scale.setScalar(0.09 * (0.9 + 0.2 * Math.sin(t * 13)));
  };
  g.userData.size = 0.4;
  return g;
}

function buildLantern() {
  const g = new THREE.Group();
  const iron = stdMat(0x2a2a30, { rough: 0.5, metal: 0.2 });
  g.add(mesh(G('lantern:base', () => rbox(0.1, 0.1, 0.02, 0.008)), iron, 0, -0.085, 0, PI / 2, 0, 0));
  g.add(mesh(G('lantern:top', () => rbox(0.11, 0.11, 0.02, 0.008)), iron, 0, 0.09, 0, PI / 2, 0, 0));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((p) => g.add(mesh(unitCyl(), iron, p[0] * 0.04, 0, p[1] * 0.04, 0, 0, 0, 0.007, 0.17, 0.007)));
  const glass = mesh(unitBox(), basicMat(0xffd27a, { opacity: 0.55, bright: 1.2 }), 0, 0.0, 0, 0, 0, 0, 0.075, 0.16, 0.075);
  g.add(glass);
  const flameM = mesh(unitCone(), basicMat(0xffb43a, { add: true, opacity: 0.95 }), 0, -0.01, 0, 0, 0, 0, 0.02, 0.07, 0.02);
  g.add(flameM);
  g.add(mesh(unitSphere(), basicMat(0xffc760, { add: true, opacity: 0.25 }), 0, 0, 0, 0, 0, 0, 0.12, 0.12, 0.12));
  g.add(mesh(tubeGeo('lantern:arc', [[-0.04, 0.1, 0], [-0.03, 0.15, 0], [0, 0.175, 0], [0.03, 0.15, 0], [0.04, 0.1, 0]], 0.004, 14, 6), iron));
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 0, 0);
  g.add(anchor);
  g.userData.flameAnchor = anchor;
  g.userData.update = (t) => {
    const f = 1 + 0.1 * Math.sin(t * 15) + 0.05 * Math.sin(t * 27);
    flameM.scale.set(0.02 * f, 0.07 * f, 0.02 * f);
  };
  g.userData.size = 0.36;
  return g;
}

/* ------------------------------------------------------------------------------------------------
 * BLOK KÜPÜ (atlas dokulu) ve BİTKİ
 * ---------------------------------------------------------------------------------------------- */
const atlasTex = new WeakMap();
const atlasGeo = new WeakMap();
const atlasMat = new WeakMap();

function atlasTexture(atlas) {
  if (atlas.map) return atlas.map;
  if (atlas.texture) return atlas.texture;
  let t = atlasTex.get(atlas);
  if (!t && atlas.canvasColor) {
    t = new THREE.CanvasTexture(atlas.canvasColor);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    atlasTex.set(atlas, t);
  }
  return t || null;
}

const FACE_SHADE = [0.82, 0.7, 1.0, 0.5, 0.9, 0.76]; // +x -x +y -y +z -z

function cubeGeometry(blockId, atlas) {
  const b = getBlock(blockId);
  const tint = b.tint === 'grass' ? [0.47, 0.74, 0.29] : b.tint === 'foliage' ? [0.37, 0.65, 0.23] : b.tint === 'water' ? [0.23, 0.56, 0.85] : null;
  const build = (fallbackColor) => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const col = new Float32Array(24 * 3);
    const c = new THREE.Color(fallbackColor === undefined ? 0xffffff : fallbackColor);
    for (let f = 0; f < 6; f++) {
      const sh = FACE_SHADE[f];
      for (let v = 0; v < 4; v++) {
        const i = (f * 4 + v) * 3;
        let r = c.r * sh;
        let gg = c.g * sh;
        let bb = c.b * sh;
        if (tint && fallbackColor === undefined && (b.tintFaces === 'all' || f === 2)) { r *= tint[0]; gg *= tint[1]; bb *= tint[2]; }
        col[i] = r; col[i + 1] = gg; col[i + 2] = bb;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  if (!atlas || !atlas.uvFor) return G(`cube:flat:${blockId}`, () => build(blockFallbackColor(b)));
  let m = atlasGeo.get(atlas);
  if (!m) { m = new Map(); atlasGeo.set(atlas, m); }
  let geo = m.get(blockId);
  if (!geo) {
    geo = build(undefined);
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const tile = f === 2 ? b.tiles.top : f === 3 ? b.tiles.bottom : b.tiles.side;
      const r = atlas.uvFor(tile);
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, r[0] + (r[2] - r[0]) * uv.getX(i), r[1] + (r[3] - r[1]) * uv.getY(i));
      }
    }
    m.set(blockId, geo);
  }
  return geo;
}

function cubeMaterial(spec, atlas) {
  const b = getBlock(spec.blockId);
  const transparent = b.layer === 'transparent' || (b.layer === 'cutout' && false);
  const emissive = b.emission > 0 ? blockFallbackColor(b) : 0x000000;
  const ei = Math.min(0.7, b.emission / 22);
  const tex = atlas ? atlasTexture(atlas) : null;
  if (tex) {
    let m = atlasMat.get(atlas);
    if (!m) { m = new Map(); atlasMat.set(atlas, m); }
    const key = (transparent ? 't' : 'o') + b.emission;
    let mat = m.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.92, metalness: 0, emissive, emissiveIntensity: ei, transparent, opacity: transparent ? 0.72 : 1 });
      m.set(key, mat);
    }
    return mat;
  }
  return stdMat(0xffffff, { rough: 0.9, emissive, ei, opacity: transparent ? 0.72 : undefined });
}

function buildBlock(spec, ctx) {
  const g = new THREE.Group();
  const atlas = ctx && ctx.atlas;
  const geo = cubeGeometry(spec.blockId, atlas);
  const mat = cubeMaterial(spec, atlas);
  const sub = spec.sub;
  const m = mesh(geo, mat);
  // Yarım/basamak/çit/kapı vb. şekiller küp olarak gösterilir; ölçek şekle göre kabaca ayarlanır.
  const S = 0.2;
  if (sub === 'slab') m.scale.set(S, S * 0.5, S);
  else if (sub === 'plate') m.scale.set(S, S * 0.2, S);
  else if (sub === 'fence') m.scale.set(S * 0.4, S, S * 0.4);
  else if (sub === 'door') m.scale.set(S, S, S * 0.25);
  else m.scale.set(S, S, S);
  g.add(m);
  if (sub === 'stair') {
    const up = mesh(geo, mat, 0, S * 0.25, -S * 0.25, 0, 0, 0, S, S * 0.5, S * 0.5);
    m.scale.set(S, S * 0.5, S);
    m.position.y = -S * 0.25;
    g.add(up);
  }
  g.userData.size = S * 1.3;
  return g;
}

function buildPlant(spec) {
  const g = new THREE.Group();
  const key = spec.key;
  const green = stdMat(0x4f9a3a, { rough: 0.85, flat: true });
  const green2 = stdMat(0x6fbf4a, { rough: 0.85, flat: true });
  const col = stdMat(spec.color, { rough: 0.7 });
  const has = (s) => key.indexOf(s) >= 0;
  if (has('mantar')) {
    const stem = stdMat(0xe8e0d0, { rough: 0.8 });
    const glow = basicMat(0x7ad8ff, { bright: 1.2 });
    [[0, 0, 1], [0.05, -0.03, 0.7], [-0.045, 0.02, 0.6]].forEach((p) => {
      g.add(mesh(unitCyl(), stem, p[0], 0.04 * p[2], p[1], 0, 0, 0, 0.012 * p[2], 0.09 * p[2], 0.012 * p[2]));
      g.add(mesh(G('cap', () => new THREE.SphereGeometry(1, 12, 6, 0, PI * 2, 0, PI / 2)), glow, p[0], 0.082 * p[2], p[1], 0, 0, 0, 0.05 * p[2], 0.035 * p[2], 0.05 * p[2]));
    });
    g.add(mesh(unitSphere(), basicMat(0x7ad8ff, { add: true, opacity: 0.2 }), 0, 0.06, 0, 0, 0, 0, 0.12, 0.09, 0.12));
  } else if (has('çalı')) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      g.add(mesh(unitIco(), i % 2 ? green : green2, Math.cos(a) * 0.05, 0.05 + (i % 3) * 0.015, Math.sin(a) * 0.05, a, a, 0, 0.055, 0.05, 0.055));
    }
  } else if (has('sarmaşık')) {
    g.add(mesh(tubeGeo('vine', [[0, 0.16, 0], [0.03, 0.08, 0.01], [-0.02, 0.0, 0.0], [0.03, -0.08, -0.01], [0, -0.16, 0]], 0.007, 20, 6), green));
    for (let i = 0; i < 6; i++) g.add(mesh(unitSphere(), i % 2 ? green : green2, (i % 2 ? 1 : -1) * 0.035, 0.13 - i * 0.052, 0, 0, 0, 0, 0.035, 0.02, 0.012));
  } else {
    // otlar / çiçekler: bıçak demeti
    const n = has('uzun_ot') ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      const lean = 0.18 + (i % 3) * 0.1;
      g.add(mesh(unitCone(), i % 2 ? green : green2, Math.cos(a) * 0.012, 0.09, Math.sin(a) * 0.012, Math.sin(a) * lean, 0, -Math.cos(a) * lean, 0.011, 0.22 - (i % 3) * 0.03, 0.011));
    }
    if (has('gelincik') || has('çiçek')) {
      g.add(mesh(unitCyl(), green, 0, 0.1, 0, 0, 0, 0, 0.006, 0.2, 0.006));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        g.add(mesh(unitSphere(), col, Math.cos(a) * 0.028, 0.205, Math.sin(a) * 0.028, 0, -a, 0.5, 0.026, 0.012, 0.018));
      }
      g.add(mesh(unitSphere(), stdMat(has('gelincik') ? 0x2b2b30 : 0xd88a1c, { rough: 0.6 }), 0, 0.208, 0, 0, 0, 0, 0.014, 0.012, 0.014));
    }
  }
  g.userData.size = 0.3;
  return g;
}
const unitIco = () => G('u:ico', () => new THREE.IcosahedronGeometry(1, 1));

/* ------------------------------------------------------------------------------------------------
 * ÖZEL: BOTLAR, KANCA, PLANÖR, PUSULA
 * ---------------------------------------------------------------------------------------------- */
function bootPair(g, color, glowColor, wing) {
  const body = stdMat(color, { rough: 0.4, metal: 0.1 });
  const sole = stdMat(0xf3f1ff, { rough: 0.5 });
  const glow = basicMat(glowColor, { bright: 1.5 });
  const wingM = stdMat(0xffffff, { rough: 0.5, side: THREE.DoubleSide, emissive: glowColor, ei: 0.25 });
  [-1, 1].forEach((s) => {
    const b = new THREE.Group();
    b.position.set(s * 0.065, 0, 0);
    b.rotation.y = s * 0.12;
    b.add(mesh(G('boot:sole', () => rbox(0.085, 0.032, 0.27, 0.012)), sole, 0, -0.07, 0.0));
    b.add(mesh(unitSphere(), body, 0, -0.035, -0.05, 0, 0, 0, 0.044, 0.04, 0.115));
    b.add(mesh(unitCyl(), body, 0, 0.02, 0.055, 0, 0, 0, 0.048, 0.15, 0.052));
    b.add(mesh(unitBox(), glow, 0, -0.085, 0.0, 0, 0, 0, 0.088, 0.006, 0.262));
    b.add(mesh(unitCyl(), stdMat(0xffffff, { rough: 0.5 }), 0, 0.09, 0.055, 0, 0, 0, 0.052, 0.014, 0.056));
    if (wing) {
      const wp = [[0, 0], [0.09, 0.03], [0.14, 0.1], [0.07, 0.085], [0.09, 0.14], [0.02, 0.1], [0, 0.12]];
      b.add(mesh(shapeGeo('boot:wing', wp, 0.004, 0.002), wingM, s * 0.05, 0.0, 0.06, 0, s > 0 ? PI / 2 : -PI / 2, 0));
    }
    g.add(b);
  });
}
function buildBoots(spec) {
  const g = new THREE.Group();
  bootPair(g, 0x2d3a52, spec.color || 0x5ad7ff, true);
  g.userData.size = 0.36;
  return g;
}

function buildHook() {
  const g = new THREE.Group();
  const steel = stdMat(0xd6d9dd, { rough: 0.32, metal: 0.2 });
  const dark = stdMat(0x5a5f68, { rough: 0.45, metal: 0.2 });
  const rope = stdMat(0xc9a35a, { rough: 0.9 });
  g.add(mesh(unitCyl(), steel, 0, 0.0, 0, 0, 0, 0, 0.016, 0.3, 0.016));
  g.add(mesh(unitSphere(), dark, 0, 0.16, 0, 0, 0, 0, 0.03, 0.026, 0.03));
  for (let i = 0; i < 3; i++) {
    const m = mesh(tubeGeo('hook:prong', [[0.012, 0.16, 0], [0.06, 0.19, 0], [0.105, 0.26, 0], [0.095, 0.32, 0]], 0.0125, 16, 8), steel);
    m.rotation.y = (i * 2 * PI) / 3;
    g.add(m);
    const tip = mesh(unitCone(), dark, 0, 0, 0, 0, 0, 0, 0.0145, 0.05, 0.0145);
    tip.position.set(Math.cos((i * 2 * PI) / 3) * 0.093, 0.345, -Math.sin((i * 2 * PI) / 3) * 0.093);
    tip.rotation.z = Math.sin(i) * 0.0;
    g.add(tip);
  }
  g.add(mesh(unitTorus(), dark, 0, -0.16, 0, PI / 2, 0, 0, 0.03, 0.03, 0.03));
  for (let i = 0; i < 4; i++) g.add(mesh(unitTorus(), rope, 0, -0.2 - i * 0.012, 0, PI / 2, 0, 0, 0.04, 0.04, 0.04));
  g.userData.size = 0.6;
  return g;
}

function buildGlider() {
  const g = new THREE.Group();
  const fabric = stdMat(0xf4f4f0, { rough: 0.75, side: THREE.DoubleSide });
  const stripe = stdMat(0xff7a3a, { rough: 0.75, side: THREE.DoubleSide });
  const alu = stdMat(0xc8ccd2, { rough: 0.4, metal: 0.15 });
  const wing = [[-0.42, 0.0], [-0.06, 0.58], [0.0, 0.62], [0.06, 0.58], [0.42, 0.0], [0.2, 0.06], [0.0, 0.0], [-0.2, 0.06]];
  const lift = 0.4;
  g.add(mesh(shapeGeo('glider:w', wing, 0.004, 0.001), fabric, 0, lift, 0, -PI / 2 + 0.06, 0, 0));
  g.add(mesh(shapeGeo('glider:s', [[-0.2, 0.06], [0, 0.0], [0.2, 0.06], [0.06, 0.3], [0, 0.34], [-0.06, 0.3]], 0.0045, 0.001), stripe, 0, lift + 0.003, 0, -PI / 2 + 0.06, 0, 0));
  // sırıklar
  [-1, 1].forEach((s) => {
    const a = [s * 0.42, lift, 0.0];
    const b = [0, lift + 0.035, -0.62];
    const m = mesh(unitCyl(), alu, 0, 0, 0);
    stretchBetween(m, a, b, 0.008);
    g.add(m);
    const st = mesh(unitCyl(), alu, 0, 0, 0);
    stretchBetween(st, [s * 0.02, 0.0, 0.0], [s * 0.2, lift, -0.02], 0.007);
    g.add(st);
  });
  g.add(mesh(unitCyl(), alu, 0, lift + 0.02, -0.28, PI / 2, 0, 0, 0.01, 0.6, 0.01));
  // kontrol çubuğu (tutma noktası)
  g.add(mesh(unitCyl(), stdMat(0x3a2a20, { rough: 0.85 }), 0, 0, 0, 0, 0, PI / 2, 0.016, 0.22, 0.016));
  g.userData.size = 0.9;
  return g;
}

function buildCompass() {
  const g = new THREE.Group();
  const silver = stdMat(0xd6d9dd, { rough: 0.3, metal: 0.2 });
  const face = stdMat(0x1c2a44, { rough: 0.5 });
  g.add(mesh(unitCyl(), silver, 0, 0, 0, PI / 2, 0, 0, 0.056, 0.022, 0.056));
  g.add(mesh(unitTorus(), silver, 0, 0, 0.0, 0, 0, 0, 0.056, 0.056, 0.056));
  g.add(mesh(unitCyl(), face, 0, 0, 0.0105, PI / 2, 0, 0, 0.046, 0.004, 0.046));
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2;
    g.add(mesh(unitBox(), stdMat(0xf4f1e8, { rough: 0.5 }), Math.sin(a) * 0.037, Math.cos(a) * 0.037, 0.0135, 0, 0, -a, 0.004, 0.012, 0.002));
  }
  const needle = new THREE.Group();
  needle.position.z = 0.015;
  needle.add(mesh(unitCone(), stdMat(0xe5483f, { rough: 0.4 }), 0, 0.02, 0, 0, 0, 0, 0.009, 0.044, 0.004));
  needle.add(mesh(unitCone(), stdMat(0xf4f1e8, { rough: 0.4 }), 0, -0.02, 0, 0, 0, PI, 0.009, 0.044, 0.004));
  g.add(needle);
  g.add(mesh(unitSphere(), stdMat(0xffffff, { rough: 0.05, opacity: 0.18 }), 0, 0, 0.012, 0, 0, 0, 0.05, 0.05, 0.016));
  g.add(mesh(unitTorus(), silver, 0, 0.07, 0, 0, 0, 0, 0.016, 0.016, 0.016));
  g.userData.update = (t) => {
    needle.rotation.z = Math.sin(t * 1.3) * 0.5 + Math.sin(t * 3.1) * 0.08;
  };
  g.userData.size = 0.14;
  return g;
}

/* ------------------------------------------------------------------------------------------------
 * ZIRH PARÇALARI (kafa, göğüs, bacak, ayak)
 * ---------------------------------------------------------------------------------------------- */
function buildArmor(spec) {
  const P = spec.palette;
  const M = toolMats(P);
  const g = new THREE.Group();
  const slot = spec.sub;
  const leather = spec.tier === 'deri';
  if (slot === 'kafa') {
    const dome = lathe('helm:dome', [[0.0, -0.09], [0.082, -0.09], [0.098, -0.04], [0.1, 0.02], [0.088, 0.075], [0.055, 0.108], [0.0, 0.12]], 20);
    g.add(mesh(dome, M.head, 0, 0, 0));
    g.add(mesh(G('helm:brow', () => new THREE.CylinderGeometry(0.104, 0.102, 0.03, 20, 1, true)), M.dark, 0, 0.0, 0, 0, 0, 0, 1, 1, 1));
    g.add(mesh(unitCyl(), M.dark, 0, -0.088, 0, 0, 0, 0, 0.1, 0.014, 0.1));
    g.add(mesh(unitBox(), stdMat(0x0d0f14, { rough: 0.3 }), 0, -0.03, -0.098, 0, 0, 0, 0.07, 0.016, 0.01));
    // tepelik
    g.add(mesh(G('helm:crest', () => rbox(0.016, 0.1, 0.17, 0.006)), M.light, 0, 0.1, 0.0));
    [-1, 1].forEach((s) => g.add(mesh(G('helm:cheek', () => shapeGeo('helm:cheekS', [[0, 0], [0.04, -0.02], [0.05, -0.08], [0.0, -0.1]], 0.01, 0.003)), M.dark, s * 0.1, -0.03, -0.01, 0, s * PI / 2, 0)));
    if (P.glow) shard(g, M, 0, 0.035, -0.105, 0.016, 0.3);
    else if (!leather) g.add(mesh(unitSphere(), M.light, 0, 0.035, -0.1, 0, 0, 0, 0.013, 0.013, 0.01));
    g.userData.size = 0.26;
  } else if (slot === 'göğüs') {
    const torso = [[-0.13, 0.14], [0.13, 0.14], [0.17, 0.1], [0.17, 0.0], [0.125, -0.08], [0.11, -0.16], [-0.11, -0.16], [-0.125, -0.08], [-0.17, 0.0], [-0.17, 0.1]];
    layered(g, M, 'chest', torso, 0.05, { body: 0.9, hi: 0.5, hiShift: 0.03 });
    [-1, 1].forEach((s) => {
      g.add(mesh(unitSphere(), M.head, s * 0.19, 0.12, 0, 0, 0, 0, 0.075, 0.06, 0.07));
      g.add(mesh(unitSphere(), M.light, s * 0.19, 0.145, 0, 0, 0, 0, 0.05, 0.03, 0.05));
    });
    g.add(mesh(unitCyl(), M.dark, 0, -0.14, 0, 0, 0, 0, 0.115, 0.03, 0.06));
    if (leather) {
      for (let i = 0; i < 3; i++) g.add(mesh(unitBox(), stdMat(0xc9a35a, { rough: 0.7 }), 0, 0.07 - i * 0.07, 0.036, 0, 0, 0, 0.26, 0.012, 0.006));
    } else {
      g.add(mesh(unitSphere(), M.spark || M.light, 0, 0.03, 0.04, 0, 0, 0, 0.032, 0.04, 0.016));
      if (M.halo) g.add(mesh(unitSphere(), M.halo, 0, 0.03, 0.04, 0, 0, 0, 0.07, 0.08, 0.04));
    }
    g.userData.size = 0.4;
  } else if (slot === 'bacak') {
    g.add(mesh(unitCyl(), M.dark, 0, 0.14, 0, 0, 0, 0, 0.13, 0.05, 0.075));
    [-1, 1].forEach((s) => {
      g.add(mesh(G('leg:tap', () => new THREE.CylinderGeometry(0.7, 1, 1, 12)), M.head, s * 0.065, -0.02, 0, 0, 0, 0, 0.062, 0.3, 0.062));
      g.add(mesh(unitSphere(), M.light, s * 0.065, -0.03, -0.03, 0, 0, 0, 0.05, 0.045, 0.03));
      g.add(mesh(unitCyl(), M.dark, s * 0.065, -0.17, 0, 0, 0, 0, 0.052, 0.025, 0.052));
    });
    g.add(mesh(unitBox(), M.light, 0, 0.14, -0.076, 0, 0, 0, 0.05, 0.04, 0.006));
    if (M.spark) shard(g, M, 0, 0.14, -0.082, 0.012, 0.3);
    g.userData.size = 0.4;
  } else {
    bootPair(g, P.head, P.glow || P.light, false);
    g.userData.size = 0.3;
  }
  return g;
}

export const TOOL_BUILDERS = {
  block: buildBlock,
  plant: buildPlant,
  lantern: buildLantern,
  torch: buildTorch,
  pick: buildPick,
  axe: buildAxe,
  shovel: buildShovel,
  sword: buildSword,
  bow: buildBow,
  arrow: buildArrow,
  gun: (spec, ctx) => buildGun(spec, ctx, false),
  portalgun: (spec, ctx) => buildGun(spec, ctx, true),
  cell: buildCell,
  shield: buildShield,
  boots: buildBoots,
  hook: buildHook,
  glider: buildGlider,
  compass: buildCompass,
  armor: buildArmor,
};

