/*
 * KEŞİF eşya 3D modelleri — TEKNOLOJİ cihazları: 'jetpack' (iki yakıt silindiri + sırt çerçevesi) ve 'scanner' (elde tutulan tarayıcı).
 * heldItems.js BUILDERS tablosuna katılır. Model yerel uzayı: +Y eşya uzunluğu, orijin tutma noktası.
 * userData.update(t): jetpack ışıl göstergesi + tarayıcı ekranında dönen tarama çizgisi.
 */
import {
  THREE, G, stdMat, basicMat, mesh, unitSphere, unitCyl, unitBox, unitCone, unitTorus, rbox,
} from './heldItemsKit.js';

const PI = Math.PI;

function buildJetpack(spec) {
  const col = spec.color || 0xff9a3a; // Keşif görünümü (spec.skin): tank rengi spec.color'a, alev rengi aşağıda skin'den
  const sk = spec.skin && spec.skin.slot === 'jet' ? spec.skin : null;
  const g = new THREE.Group();
  const frame = stdMat(0x59626f, { rough: 0.45, metal: 0.3 });
  const tank = stdMat(col, { rough: 0.35, metal: 0.2 });
  const band = stdMat(0x2a303a, { rough: 0.5, metal: 0.2 });
  const nozzle = stdMat(0xa8b2c2, { rough: 0.3, metal: 0.45 });
  const flame = basicMat(sk ? sk.flame[1] : 0x8fd8ff, { bright: 1.4 });
  const flameHalo = basicMat(sk ? sk.flame[2] : 0x6fc8ff, { add: true, opacity: 0.35 });
  g.add(mesh(G('jet:frame', () => rbox(0.1, 0.17, 0.05, 0.012)), frame, 0, 0.1, 0));
  [-1, 1].forEach((s) => {
    g.add(mesh(unitCyl(), tank, s * 0.056, 0.1, 0, 0, 0, 0, 0.034, 0.2, 0.034));
    g.add(mesh(unitSphere(), tank, s * 0.056, 0.2, 0, 0, 0, 0, 0.034, 0.02, 0.034));
    [0.05, 0.1, 0.15].forEach((y) => g.add(mesh(unitCyl(), band, s * 0.056, y, 0, 0, 0, 0, 0.0365, 0.012, 0.0365)));
    g.add(mesh(unitCone(), nozzle, s * 0.056, -0.012, 0, PI, 0, 0, 0.026, 0.04, 0.026));
    g.add(mesh(unitCone(), flame, s * 0.056, -0.05, 0, PI, 0, 0, 0.018, 0.05, 0.018));
    g.add(mesh(unitSphere(), flameHalo, s * 0.056, -0.04, 0, 0, 0, 0, 0.03, 0.045, 0.03));
  });
  g.add(mesh(unitBox(), stdMat(0xb8c2d2, { rough: 0.35, metal: 0.4 }), 0, 0.2, 0, 0, 0, 0, 0.05, 0.02, 0.03));
  const lamp = mesh(unitSphere(), basicMat(0x7affea, { bright: 1.5 }), 0, 0.11, 0.028, 0, 0, 0, 0.011, 0.011, 0.008);
  g.add(lamp);
  g.userData.size = 0.26;
  g.userData.update = (t) => {
    const k = 0.8 + 0.2 * Math.sin(t * 5);
    lamp.scale.set(0.011 * k, 0.011 * k, 0.008);
  };
  return g;
}

function buildScanner(spec) {
  const col = spec.color || 0x5ad7ff;
  const g = new THREE.Group();
  const body = stdMat(0x2d3441, { rough: 0.4, metal: 0.25 });
  const rim = stdMat(0x59626f, { rough: 0.4, metal: 0.3 });
  const screen = stdMat(0x061620, { rough: 0.2, emissive: 0x0a3a4a, ei: 0.7 });
  const ring = basicMat(0x7affea, { bright: 1.3 });
  const dot = basicMat(0xffe27a, { bright: 1.4 });
  g.add(mesh(G('scan:body', () => rbox(0.082, 0.118, 0.026, 0.01)), body, 0, 0.04, 0));
  g.add(mesh(G('scan:rim', () => rbox(0.09, 0.126, 0.014, 0.01)), rim, 0, 0.04, -0.004));
  g.add(mesh(G('scan:screen', () => rbox(0.064, 0.06, 0.006, 0.006)), screen, 0, 0.062, 0.0145));
  [0.012, 0.022, 0.032].forEach((r, i) => {
    g.add(mesh(unitTorus(), ring, 0, 0.062, 0.0178, 0, 0, 0, r, r, 0.4 - i * 0.05));
  });
  const sweep = mesh(unitBox(), basicMat(0xbefff5, { bright: 1.3 }), 0.014, 0.062, 0.0185, 0, 0, 0, 0.032, 0.0022, 0.002);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.062, 0);
  sweep.position.set(0.016, 0, 0.0185);
  pivot.add(sweep);
  g.add(pivot);
  [[-0.014, 0.07], [0.014, 0.052], [-0.006, 0.05]].forEach((p) => g.add(mesh(unitSphere(), dot, p[0], p[1], 0.0185, 0, 0, 0, 0.003, 0.003, 0.002)));
  [-0.022, 0, 0.022].forEach((x, i) => g.add(mesh(unitCyl(), i === 1 ? basicMat(col, { bright: 1.2 }) : rim, x, 0.0, 0.0145, PI / 2, 0, 0, 0.007, 0.006, 0.007)));
  // anten
  g.add(mesh(unitCyl(), rim, 0.034, 0.128, -0.002, 0, 0, 0, 0.0035, 0.07, 0.0035));
  g.add(mesh(unitSphere(), basicMat(col, { bright: 1.4 }), 0.034, 0.166, -0.002, 0, 0, 0, 0.007, 0.007, 0.007));
  g.userData.size = 0.2;
  g.userData.update = (t) => {
    pivot.rotation.z = -t * 2.4;
  };
  return g;
}

export const TECH_BUILDERS = { jetpack: buildJetpack, scanner: buildScanner };
