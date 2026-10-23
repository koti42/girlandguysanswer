/*
 * KEŞİF render/props — İÇ MEKÂN GEOMETRİSİ 2/4: cihaz, tezgâh, otomat, ekran/holo, arcade, sunucu, robot, araç, tarayıcı (37 model).
 * Model (b, v, h, x) → void: b gövde GeoBuilder, v varyant 0..7, h holo GeoBuilder (yalnız def.holo), x ek bağlam ({digits}).
 * Durumlu parçalar propGeoKit.M grup kodlarıyla işaretlenir (GÜÇ/GÖRÜNÜR maskeleri); ekranlar M.screen ile desenli neon.
 */
import {
  C, M, SKIP, SIGN_UV, bar, chamfBox, dicePips, extrudeZ, face, fab, wd,
} from './propGeoKit.js';

function buzdolabi(b, v) {
  const body = [C.white, C.steelLight, C.mint][v % 3];
  b.box(-0.5, 0, -0.4375, 0.5, 2.0, 0.3, body, M.body, SKIP.PZ | SKIP.NY);
  b.box(-0.5, 0, 0.3, -0.46, 2.0, 0.4375, body, M.body, SKIP.PX);
  b.box(0.46, 0, 0.3, 0.5, 2.0, 0.4375, body, M.body, SKIP.NX);
  b.box(-0.46, 1.96, 0.3, 0.46, 2.0, 0.4375, body, M.body, SKIP.NY);
  b.box(-0.46, 0, 0.3, 0.46, 0.08, 0.4375, C.steelDark, M.body, SKIP.NY);
  // iç (açıkken görünür, ışıklı)
  b.box(-0.46, 0.08, -0.4, 0.46, 1.96, -0.37, C.cream, M.visGlow(0b10, 0.5), SKIP.NZ);
  for (let i = 0; i < 4; i++) b.box(-0.46, 0.4 + i * 0.4, -0.37, 0.46, 0.43 + i * 0.4, 0.3, C.glass, M.vis(0b10), SKIP.NY);
  b.box(-0.35, 0.43, -0.3, -0.1, 0.65, -0.05, C.orange, M.vis(0b10));
  b.box(0.05, 1.23, -0.3, 0.38, 1.4, 0.05, C.green, M.vis(0b10));
  // kapalı
  b.box(-0.46, 0.08, 0.3, 0.46, 1.96, 0.4375, body, M.vis(0b01), SKIP.NY | SKIP.PX | SKIP.NX);
  b.box(-0.46, 1.18, 0.4376, 0.46, 1.2, 0.4385, C.black, M.vis(0b01));
  b.box(0.34, 1.3, 0.4376, 0.38, 1.8, 0.46, C.chrome, M.vis(0b01));
  b.box(0.34, 0.5, 0.4376, 0.38, 1.0, 0.46, C.chrome, M.vis(0b01));
  b.box(-0.35, 1.55, 0.4376, -0.15, 1.62, 0.442, C.cyan, M.neon(0.7));
  // açık kapı
  b.box(0.46, 0.08, 0.0, 0.52, 1.96, 0.8, body, M.vis(0b10));
  b.box(0.52, 0.5, 0.3, 0.54, 1.0, 0.34, C.chrome, M.vis(0b10));
}

function mutfakTezgahi(b, v) {
  const c = [wd(v), C.cream, C.steelMid, fab(v)][v % 4];
  b.box(-1.0, 0.06, -0.5, 1.0, 0.92, 0.5, c, M.body, SKIP.NY);
  b.box(-1.0, 0, -0.45, 1.0, 0.06, 0.45, C.black, M.body, SKIP.NY);
  chamfBox(b, -1.02, 0.92, -0.52, 1.02, 1.0, 0.52, C.steelLight, M.body, 0.02);
  for (let i = 0; i < 3; i++) {
    b.box(-0.9 + i * 0.62, 0.16, 0.5, -0.38 + i * 0.62, 0.84, 0.51, i === 1 ? C.steelDark : c, M.body, SKIP.NY);
    b.box(-0.78 + i * 0.62, 0.7, 0.511, -0.5 + i * 0.62, 0.73, 0.516, C.chrome, M.body);
  }
  // lavabo
  b.box(-0.8, 0.93, -0.25, -0.2, 0.935, 0.25, C.steelDark, M.body, SKIP.NY);
  b.prism(-0.5, -0.3, 0.94, 1.18, 0.025, 0.025, 6, C.chrome, M.body, true, false);
  b.box(-0.52, 1.14, -0.3, -0.48, 1.18, -0.1, C.chrome, M.body, SKIP.NY);
  // ocak (indüksiyon halkaları)
  b.box(0.2, 1.0, -0.3, 0.85, 1.01, 0.3, C.black, M.body, SKIP.NY);
  bar(b, 0.3, 1.01, -0.2, 0.5, 1.02, 0.0, C.cyan, M.neon(0.6));
  bar(b, 0.55, 1.01, 0.05, 0.75, 1.02, 0.25, C.cyan, M.neon(0.6));
  b.prism(0.4, 0.1, 1.0, 1.12, 0.1, 0.09, 8, C.steelLight, M.body, true, false);
}

function dusKabini(b) {
  b.box(-0.5, 0, -0.5, 0.5, 0.08, 0.5, C.white, M.body, SKIP.NY);
  b.box(-0.5, 0.08, -0.5, 0.5, 2.25, -0.46, C.mint, M.body, SKIP.NZ);
  b.box(-0.5, 0.08, -0.46, -0.46, 2.25, 0.5, C.glassDark, M.body, SKIP.NY);
  b.box(0.46, 0.08, -0.46, 0.5, 2.25, 0.5, C.glassDark, M.body, SKIP.NY);
  b.box(-0.5, 2.2, -0.5, 0.5, 2.25, 0.5, C.steelMid, M.body, SKIP.NY);
  b.box(-0.5, 0.08, 0.46, 0.5, 2.2, 0.5, C.glassDark, M.body, SKIP.NY | SKIP.PY);
  b.box(-0.52, 0.0, 0.46, -0.46, 2.25, 0.52, C.chrome, M.body, SKIP.NY);
  b.box(0.46, 0.0, 0.46, 0.52, 2.25, 0.52, C.chrome, M.body, SKIP.NY);
  b.box(-0.02, 0.9, 0.5, 0.02, 1.2, 0.54, C.chrome, M.body);
  // duş başlığı + su çizgileri (açıkken)
  b.box(-0.03, 1.9, -0.46, 0.03, 2.1, -0.4, C.chrome, M.body);
  b.prism(0, -0.2, 2.1, 2.14, 0.16, 0.16, 8, C.chrome, M.body, true, true);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.box(Math.cos(a) * 0.1 - 0.008, 0.2, -0.2 + Math.sin(a) * 0.1 - 0.008, Math.cos(a) * 0.1 + 0.008, 2.08, -0.2 + Math.sin(a) * 0.1 + 0.008, C.glass, M.glowP(0b10, 0.7));
  }
  bar(b, -0.4, 0.08, 0.2, 0.4, 0.1, 0.4, C.cyan, M.neonP(0b10, 0.9));
  b.box(-0.35, 0.6, -0.455, 0.35, 1.7, -0.452, C.white, M.glowP(0b10, 0.35));
}

function marketBuzluk(b, v) {
  b.box(-1.0, 0, -0.5, 1.0, 1.0, 0.5, C.white, M.body, SKIP.NY | SKIP.PY);
  b.box(-1.0, 0, -0.5, 1.0, 0.1, 0.5, C.steelDark, M.body, SKIP.NY);
  b.box(-0.96, 1.0, -0.46, 0.96, 1.01, 0.46, C.cyan, M.glow(0.35), SKIP.NY);
  for (let k = 0; k < 6; k++) {
    const c = [C.red, C.yellow, C.mint, C.pink, C.orange, C.blue][(k + v) % 6];
    b.box(-0.92 + k * 0.31, 1.01, -0.4, -0.7 + k * 0.31, 1.1 + ((k + v) % 3) * 0.05, -0.05, c, M.body, SKIP.NY);
    b.box(-0.92 + k * 0.31, 1.01, 0.05, -0.7 + k * 0.31, 1.08, 0.4, [C.cream, C.green, C.purple][(k + v) % 3], M.body, SKIP.NY);
  }
  b.box(-1.0, 1.0, -0.5, 1.0, 1.25, -0.46, C.steelMid, M.body, SKIP.NY);
  b.box(-1.0, 1.0, 0.46, 1.0, 1.15, 0.5, C.steelMid, M.body, SKIP.NY);
  b.box(-1.0, 1.0, -0.46, -0.96, 1.15, 0.46, C.steelMid, M.body, SKIP.NY);
  b.box(0.96, 1.0, -0.46, 1.0, 1.15, 0.46, C.steelMid, M.body, SKIP.NY);
  bar(b, -0.96, 0.96, 0.5, 0.96, 0.99, 0.51, C.cyan, M.neon(0.9));
  b.box(-0.9, 1.15, 0.46, 0.9, 1.25, 0.5, C.glass, M.body, SKIP.NY);
}

function sarjIstasyonu(b) {
  b.box(-0.5, 0, -0.375, 0.5, 0.1, 0.375, C.steelDark, M.body, SKIP.NY);
  chamfBox(b, -0.4, 0.1, -0.3, 0.4, 1.625, 0.2, C.steelMid, M.body, 0.04);
  b.box(-0.35, 0.3, 0.2, 0.35, 0.95, 0.3, C.black, M.body); // iki yuva
  b.box(-0.3, 0.35, 0.3, -0.04, 0.9, 0.31, C.panel, M.body);
  b.box(0.04, 0.35, 0.3, 0.3, 0.9, 0.31, C.panel, M.body);
  bar(b, -0.28, 0.36, 0.312, -0.06, 0.38, 0.316, C.orange, M.neonP(0b01, 0.9));
  bar(b, 0.06, 0.36, 0.312, 0.28, 0.38, 0.316, C.orange, M.neonP(0b01, 0.9));
  for (let i = 0; i < 5; i++) {
    bar(b, -0.28, 0.45 + i * 0.09, 0.312, -0.06, 0.5 + i * 0.09, 0.316, C.green, M.neonP(0b10, 0.9));
    bar(b, 0.06, 0.45 + i * 0.09, 0.312, 0.28, 0.5 + i * 0.09, 0.316, C.green, M.neonP(0b10, 0.9));
  }
  b.box(-0.3, 1.1, 0.2, 0.3, 1.5, 0.22, C.black, M.body);
  face(b, -0.26, 1.14, 0.26, 1.46, 0.222, 1, C.green, M.screen(0b11, 0.8));
  b.box(-0.05, 1.575, -0.1, 0.05, 1.625, 0.0, C.green, M.neonP(0b10, 1));
}

function cayOcagi(b) {
  chamfBox(b, -0.5, 0, -0.375, 0.5, 0.85, 0.375, wd(1), M.body, 0.03);
  b.box(-0.45, 0.1, 0.375, 0.45, 0.75, 0.385, C.woodDark, M.body);
  b.box(-0.1, 0.4, 0.386, 0.1, 0.44, 0.392, C.chrome, M.body);
  b.box(-0.5, 0.85, -0.375, 0.5, 0.9, 0.375, C.steelLight, M.body, SKIP.NY);
  // çaydanlık takımı
  b.prism(0, 0, 0.9, 1.2, 0.2, 0.17, 10, C.steelLight, M.body, false, false);
  b.prism(0, 0, 1.2, 1.24, 0.17, 0.17, 10, C.chrome, M.body, true, false);
  b.prism(0, 0, 1.24, 1.32, 0.1, 0.09, 10, C.steelLight, M.body, true, false);
  b.prism(0, 0, 1.32, 1.36, 0.05, 0.03, 8, C.red, M.body, true, false);
  b.prism(0, 0, 0.9, 1.04, 0.2, 0.2, 10, C.teal || 0x2b8a8a, M.body, false, false);
  bar(b, -0.3, 0.78, 0.3, 0.3, 0.8, 0.37, C.orange, M.neonP(0b10, 0.8, 0.12));
  b.prism(0.3, 0.1, 0.9, 1.0, 0.08, 0.07, 8, C.cream, M.body, true, false);
  b.prism(0.3, 0.1, 1.0, 1.02, 0.065, 0.065, 8, C.clay, M.body, true, false);
  // buhar (çalışırken)
  b.box(-0.02, 1.38, -0.02, 0.02, 1.62, 0.02, C.white, M.glowP(0b10, 0.5));
}

function ramenTezgahi(b, v) {
  chamfBox(b, -1.5, 0, -0.5, 1.5, 0.95, 0.5, C.woodDark, M.body, 0.03);
  for (let i = 0; i < 6; i++) b.box(-1.4 + i * 0.5, 0.1, 0.5, -1.15 + i * 0.5, 0.85, 0.515, i % 2 ? C.wood : C.woodLight, M.body);
  chamfBox(b, -1.52, 0.95, -0.52, 1.52, 1.025, 0.55, C.steelLight, M.body, 0.02);
  bar(b, -1.45, 0.88, 0.516, 1.45, 0.92, 0.53, C.orange, M.neon(0.9));
  // tencere / kazanlar
  b.prism(-1.0, -0.1, 1.025, 1.125, 0.28, 0.26, 10, C.steelMid, M.body, false, false);
  b.prism(-1.0, -0.1, 1.125, 1.13, 0.26, 0.26, 10, C.cream, M.glow(0.35), true, false);
  b.prism(-0.2, -0.1, 1.025, 1.1, 0.22, 0.2, 10, C.steelMid, M.body, false, false);
  b.prism(-0.2, -0.1, 1.1, 1.105, 0.2, 0.2, 10, C.orange, M.glow(0.3), true, false);
  // kaseler
  for (let k = 0; k < 4; k++) {
    const x = 0.35 + k * 0.28;
    b.prism(x, 0.1, 1.025, 1.1, 0.1, 0.075, 8, k % 2 ? C.cream : C.clay, M.body, false, false);
    b.prism(x, 0.1, 1.09, 1.1, 0.085, 0.085, 8, C.orange, M.glow(0.35), true, false);
  }
  b.box(0.2, 1.025, 0.35, 1.3, 1.04, 0.45, C.woodLight, M.body, SKIP.NY);
  // noren / askılık fener
  b.box(-1.5, 1.0, -0.5, 1.5, 1.025, -0.45, C.steelDark, M.body, SKIP.NY);
  void v;
}

function meyveBari(b, v) {
  chamfBox(b, -1.5, 0, -0.5, 1.5, 0.95, 0.5, C.white, M.body, 0.03);
  const cols = [C.red, C.orange, C.yellow, C.green, C.pink, C.purple];
  for (let i = 0; i < 6; i++) {
    const x = -1.25 + i * 0.5;
    b.box(x - 0.17, 0.3, 0.5, x + 0.17, 0.66, 0.516, cols[(i + v) % 6], M.body);
    b.box(x - 0.02, 0.66, 0.5, x + 0.04, 0.74, 0.516, C.leafB, M.body);
    b.box(x + 0.04, 0.68, 0.5, x + 0.1, 0.72, 0.516, C.leafA, M.body);
  }
  bar(b, -1.45, 0.1, 0.5, 1.45, 0.15, 0.52, C.pink, M.neon(1));
  bar(b, -1.45, 0.82, 0.5, 1.45, 0.87, 0.52, C.cyan, M.neon(1));
  chamfBox(b, -1.52, 0.95, -0.52, 1.52, 1.02, 0.55, C.steelLight, M.body, 0.02);
  // sıkacaklar
  for (let k = 0; k < 3; k++) {
    const x = -0.9 + k * 0.7;
    b.box(x - 0.14, 1.02, -0.2, x + 0.14, 1.12, 0.08, C.steelDark, M.body, SKIP.NY);
    b.prism(x, -0.06, 1.12, 1.46, 0.13, 0.15, 8, C.glass, M.glow(0.3), false, false);
    b.prism(x, -0.06, 1.12, 1.3, 0.125, 0.14, 8, cols[(k * 2 + v) % 6], M.body, true, false);
    b.prism(x, -0.06, 1.46, 1.5, 0.15, 0.15, 8, C.steelLight, M.body, true, false);
  }
  b.box(1.0, 1.02, -0.3, 1.4, 1.2, 0.2, C.woodLight, M.body, SKIP.NY);
  b.ico(1.1, 1.3, 0.0, 0.1, C.orange, M.body, 1);
  b.ico(1.25, 1.28, -0.05, 0.09, C.yellow, M.body, 1);
}

function kasaMasasi(b, v) {
  chamfBox(b, -1.0, 0, -0.5, 1.0, 1.0, 0.5, C.steelMid, M.body, 0.03);
  b.box(-0.95, 0.05, 0.5, 0.95, 0.9, 0.52, C.steelDark, M.body);
  bar(b, -0.9, 0.1, 0.52, 0.9, 0.14, 0.54, [C.cyan, C.pink, C.green][v % 3], M.neon(0.9));
  chamfBox(b, -1.02, 1.0, -0.52, 1.02, 1.125, 0.5, C.white, M.body, 0.02);
  // bant
  b.box(-0.95, 1.125, 0.05, 0.1, 1.145, 0.45, C.black, M.body, SKIP.NY);
  bar(b, -0.95, 1.145, 0.05, 0.1, 1.15, 0.07, C.yellow, M.neon(0.5));
  // kasa terminali
  b.box(0.3, 1.125, -0.3, 0.8, 1.2, 0.1, C.steelDark, M.body, SKIP.NY);
  b.box(0.35, 1.2, -0.3, 0.75, 1.55, -0.24, C.black, M.body);
  face(b, 0.38, 1.25, 0.72, 1.52, -0.238, 1, C.cyan, M.screen(undefined, 0.9));
  b.box(0.45, 1.145, 0.12, 0.7, 1.175, 0.3, C.steel, M.body, SKIP.NY);
  b.box(0.9, 1.125, 0.0, 0.98, 1.3, 0.1, C.steelMid, M.body, SKIP.NY);
  b.box(0.5, 1.2, 0.12, 0.58, 1.215, 0.2, C.green, M.neon(0.6));
  b.prism(-0.7, -0.4, 1.125, 1.5, 0.03, 0.03, 6, C.chrome, M.body, true, false);
  b.prism(-0.7, -0.4, 1.5, 1.56, 0.12, 0.05, 6, C.warm, M.glow(0.8), true, false);
}

function odulTezgahi(b, v) {
  chamfBox(b, -1.0, 0, -0.5, 1.0, 0.5, 0.5, C.panel, M.body, 0.03);
  bar(b, -0.95, 0.12, 0.5, 0.95, 0.16, 0.52, C.pink, M.pulse(0.9));
  bar(b, -0.95, 0.34, 0.5, 0.95, 0.38, 0.52, C.cyan, M.pulse(0.9));
  // cam vitrin
  b.box(-1.0, 0.5, -0.5, -0.96, 1.125, 0.5, C.steelMid, M.body);
  b.box(0.96, 0.5, -0.5, 1.0, 1.125, 0.5, C.steelMid, M.body);
  b.box(-0.96, 0.5, -0.5, 0.96, 1.125, -0.46, C.steelDark, M.body, SKIP.NZ);
  b.box(-1.0, 1.08, -0.5, 1.0, 1.125, 0.5, C.steelMid, M.body, SKIP.NY);
  b.box(-0.96, 0.8, -0.46, 0.96, 0.83, 0.46, C.glass, M.body, SKIP.NY);
  b.box(-0.96, 0.5, 0.46, 0.96, 1.08, 0.5, C.glassDark, M.body, SKIP.NY | SKIP.PY);
  const cols = [C.red, C.yellow, C.cyan, C.green, C.pink, C.orange];
  for (let i = 0; i < 6; i++) {
    const x = -0.75 + i * 0.3;
    b.ico(x, 0.62, 0.0, 0.1, cols[(i + v) % 6], M.body, 1);
    b.box(x - 0.1, 0.83, -0.1, x + 0.1, 0.99, 0.1, cols[(i + 2 + v) % 6], M.body, SKIP.NY);
    b.octa(x, 1.03, 0.0, 0.05, C.white, M.glow(0.8));
  }
  bar(b, -0.95, 1.1, -0.44, 0.95, 1.12, 0.44, C.warm, M.neon(0.6));
}

function kuryeTezgahi(b) {
  chamfBox(b, -1.0, 0, -0.5, 1.0, 1.0, 0.5, C.steelMid, M.body, 0.03);
  b.box(-0.95, 0.06, 0.5, 0.95, 0.9, 0.52, C.orange, M.body);
  bar(b, -0.95, 0.12, 0.52, 0.95, 0.16, 0.54, C.orange, M.neon(1));
  chamfBox(b, -1.02, 1.0, -0.52, 1.02, 1.125, 0.52, C.white, M.body, 0.02);
  // paketler
  b.box(-0.9, 1.125, -0.35, -0.45, 1.4, 0.05, C.woodLight, M.body, SKIP.NY);
  b.box(-0.88, 1.4, -0.3, -0.5, 1.58, 0.0, C.clay, M.body, SKIP.NY);
  b.box(-0.2, 1.125, -0.3, 0.2, 1.3, 0.1, C.woodLight, M.body, SKIP.NY);
  b.box(-0.2, 1.31, -0.28, 0.2, 1.315, -0.25, C.cream, M.body);
  // tarayıcı
  b.box(0.45, 1.125, -0.2, 0.8, 1.22, 0.2, C.steelDark, M.body, SKIP.NY);
  b.box(0.5, 1.22, -0.14, 0.75, 1.46, -0.1, C.black, M.body);
  face(b, 0.52, 1.25, 0.73, 1.43, -0.098, 1, C.green, M.screen(undefined, 0.8));
  bar(b, 0.52, 1.126, 0.1, 0.78, 1.14, 0.12, C.red, M.neon(0.8));
  // dron iniş pedi
  b.prism(0.85, 0.3, 1.125, 1.145, 0.14, 0.14, 8, C.orange, M.glow(0.7), true, false);
  b.ico(0.85, 1.28, 0.3, 0.1, C.white, M.body, 0.7);
  b.box(0.7, 1.31, 0.28, 1.0, 1.325, 0.32, C.steelLight, M.body);
}

function vendingBody(b, c) {
  chamfBox(b, -0.5, 0, -0.4375, 0.5, 2.0, 0.4375, C.steelDark, M.body, 0.03);
  b.box(-0.5, 0, -0.4375, 0.5, 0.12, 0.4375, C.black, M.body, SKIP.NY);
  bar(b, -0.46, 1.9, 0.438, 0.46, 1.96, 0.442, c, M.neon(1));
  bar(b, -0.48, 0.12, 0.438, -0.45, 1.9, 0.442, c, M.neon(0.8));
  bar(b, 0.45, 0.12, 0.438, 0.48, 1.9, 0.442, c, M.neon(0.8));
  // arkadan aydınlatmalı vitrin penceresi (cam yok: ürünler görünür)
  face(b, -0.44, 0.5, 0.24, 1.84, 0.4385, 1, C.cream, M.glow(0.5));
  b.frameZ(-0.44, 0.5, 0.24, 1.84, 0.03, 0.4392, 1, C.steelDark, M.body);
  b.box(-0.4, 0.2, 0.43, 0.25, 0.4, 0.4375, C.black, M.body); // verme çıkışı
  face(b, -0.35, 0.22, 0.2, 0.38, 0.4385, 1, C.panel, M.body);
  b.box(0.3, 1.0, 0.43, 0.46, 1.7, 0.4375, C.steel, M.body); // tuş paneli
  for (let i = 0; i < 4; i++) face(b, 0.34, 1.1 + i * 0.13, 0.42, 1.17 + i * 0.13, 0.4385, 1, C.cream, M.body);
  face(b, 0.33, 1.52, 0.43, 1.66, 0.4386, 1, c, M.screen(undefined, 0.7));
  b.box(0.33, 0.55, 0.43, 0.43, 0.65, 0.4375, C.black, M.body);
  bar(b, 0.345, 0.58, 0.4376, 0.415, 0.6, 0.441, C.green, M.neon(0.8));
}

function otomatAtistirmalik(b) {
  vendingBody(b, C.orange);
  const cols = [C.red, C.yellow, C.green, C.pink, C.blue, C.orange];
  for (let r = 0; r < 5; r++) {
    const y = 0.56 + r * 0.26;
    face(b, -0.43, y - 0.02, 0.23, y, 0.4398, 1, C.steelMid, M.body);
    for (let k = 0; k < 4; k++) {
      const x = -0.4 + k * 0.165;
      face(b, x, y, x + 0.135, y + 0.2, 0.4399, 1, cols[(r * 2 + k) % 6], M.body);
      face(b, x + 0.02, y + 0.08, x + 0.115, y + 0.13, 0.44, 1, C.white, M.body);
    }
  }
}

function otomatIcecek(b) {
  vendingBody(b, C.cyan);
  const cols = [C.red, C.cyan, C.green, C.yellow, C.purple, C.orange];
  for (let r = 0; r < 4; r++) {
    const y = 0.58 + r * 0.32;
    face(b, -0.43, y - 0.02, 0.23, y, 0.4398, 1, C.steelMid, M.body);
    for (let k = 0; k < 4; k++) {
      const x = -0.38 + k * 0.165;
      face(b, x, y, x + 0.1, y + 0.27, 0.4399, 1, cols[(r + k * 2) % 6], M.body);
      face(b, x, y + 0.25, x + 0.1, y + 0.29, 0.44, 1, C.chrome, M.body);
      face(b, x + 0.02, y + 0.09, x + 0.08, y + 0.17, 0.44, 1, C.white, M.body);
    }
  }
}

function otomatEnerji(b) {
  vendingBody(b, C.green);
  for (let r = 0; r < 4; r++) {
    const y = 0.58 + r * 0.32;
    face(b, -0.43, y - 0.02, 0.23, y, 0.4398, 1, C.steelMid, M.body);
    for (let k = 0; k < 3; k++) {
      const x = -0.38 + k * 0.22;
      face(b, x, y, x + 0.16, y + 0.26, 0.4399, 1, C.steelDark, M.body);
      face(b, x + 0.02, y + 0.02, x + 0.14, y + 0.24, 0.44, 1, C.green, M.neon(0.9));
      face(b, x + 0.06, y + 0.07, x + 0.1, y + 0.19, 0.4401, 1, C.white, M.body);
    }
  }
}

function kaseSeti(b, v) {
  const c = [C.cream, C.clay, C.white][v % 3];
  b.prism(0, 0, 0, 0.2, 0.17, 0.25, 8, c, M.body, false, true);
  b.prism(0, 0, 0.17, 0.19, 0.25, 0.25, 8, C.orange, M.glow(0.25), true, false);
  b.prism(0.18, 0.1, 0.0, 0.1, 0.07, 0.1, 6, C.cream, M.body, false, false);
}

function holoEkran(b, v, h) {
  const hue = [C.cyan, C.pink, C.green][v % 3];
  chamfBox(b, -1.0, 0.0, -0.125, 1.0, 1.25, 0.0, C.steelDark, M.body, 0.03);
  face(b, -0.92, 0.08, 0.92, 1.17, 0.0015, 1, hue, M.screen(0b011, 0.9));
  bar(b, -0.95, 0.04, 0.002, 0.95, 0.07, 0.01, hue, M.neon(0.8));
  b.box(-0.2, 0, -0.125, 0.2, 0.06, 0.1, C.steelMid, M.body, SKIP.NY);
  if (h) {
    h.quad([-0.8, 0.2, 0.12], [0.8, 0.2, 0.12], [0.8, 1.05, 0.12], [-0.8, 1.05, 0.12], [0, 0, 1], hue, M.holo(1, 0b011));
  }
}

function devHoloEkran(b, v, h) {
  const hue = [C.cyan, C.pink, C.purple][v % 3];
  chamfBox(b, -1.5, 0.0, -0.125, 1.5, 2.0, 0.0, C.steelDark, M.body, 0.03);
  face(b, -1.4, 0.1, 1.4, 1.9, 0.0015, 1, hue, M.screen(0b011, 0.9));
  bar(b, -1.45, 0.05, 0.002, 1.45, 0.09, 0.012, hue, M.neon(0.9));
  bar(b, -1.45, 1.92, 0.002, 1.45, 1.96, 0.012, hue, M.neon(0.9));
  b.box(-1.5, 0, -0.125, -1.32, 2.0, 0.1, C.steelMid, M.body);
  b.box(1.32, 0, -0.125, 1.5, 2.0, 0.1, C.steelMid, M.body);
  for (let i = 0; i < 6; i++) {
    b.box(-1.47, 0.2 + i * 0.3, 0.1, -1.35, 0.26 + i * 0.3, 0.102, C.black, M.body);
    b.box(1.35, 0.2 + i * 0.3, 0.1, 1.47, 0.26 + i * 0.3, 0.102, C.black, M.body);
  }
  if (h) {
    h.quad([-1.2, 0.3, 0.14], [1.2, 0.3, 0.14], [1.2, 1.7, 0.14], [-1.2, 1.7, 0.14], [0, 0, 1], hue, M.holo(1, 0b011));
  }
}

function televizyon(b, v) {
  chamfBox(b, -0.75, 0.0, -0.125, 0.75, 1.0, 0.0, C.black, M.body, 0.02);
  face(b, -0.7, 0.05, 0.7, 0.95, 0.0015, 1, [C.cyan, C.pink, C.yellow][v % 3], M.screen(0b10, 0.85));
  b.box(-0.2, 0, -0.125, 0.2, 0.05, 0.05, C.steelMid, M.body, SKIP.NY);
  b.box(-0.04, 0.0, 0.0015, 0.04, 0.025, 0.006, C.green, M.neonP(0b01, 0.6));
}

function holoPerde(b, v, h) {
  b.box(-1.5, 2.85, -0.125, 1.5, 3.0, 0.1, C.steelDark, M.body);
  b.box(-1.5, 0.0, -0.125, 1.5, 0.12, 0.1, C.steelDark, M.body);
  b.box(-1.5, 0.12, -0.1, -1.44, 2.85, 0.0, C.steelMid, M.body);
  b.box(1.44, 0.12, -0.1, 1.5, 2.85, 0.0, C.steelMid, M.body);
  face(b, -1.44, 0.12, 1.44, 2.85, 0.001, 1, C.purple, M.screen(0b01, 0.7));
  bar(b, -1.5, 2.8, 0.1, 1.5, 2.84, 0.104, C.purple, M.neon(0.9));
  bar(b, -1.5, 0.12, 0.1, 1.5, 0.16, 0.104, C.purple, M.neon(0.9));
  if (h) {
    h.quad([-1.4, 0.2, 0.16], [1.4, 0.2, 0.16], [1.4, 2.8, 0.16], [-1.4, 2.8, 0.16], [0, 0, 1], v & 1 ? C.cyan : C.purple, M.holo(1, 0b01));
  }
}

function projektor(b) {
  // tavana monte: üstü (y = 0.5) tavana değer
  b.box(-0.03, 0.4, -0.03, 0.03, 0.5, 0.03, C.steelMid, M.body);
  b.box(-0.2, 0.4, -0.3, 0.2, 0.44, 0.3, C.steelDark, M.body);
  chamfBox(b, -0.2, 0.08, -0.3, 0.2, 0.4, 0.3, C.steelLight, M.body, 0.03);
  b.prism(0, 0.3, 0.06, 0.14, 0.09, 0.07, 8, C.black, M.body, false, false);
  b.prism(0, 0.3, 0.04, 0.06, 0.07, 0.07, 8, C.purple, M.glow(1), true, true);
  bar(b, -0.15, 0.2, -0.3, 0.15, 0.24, -0.298, C.purple, M.neon(0.8));
  b.box(-0.18, 0.12, -0.3, -0.12, 0.18, -0.296, C.green, M.neon(0.8));
}

function arcadeMakinesi(b, v, h, x) {
  void h; void x;
  const art = [C.pink, C.cyan, C.yellow, C.green, C.orange, C.purple][v % 6];
  const art2 = [C.cyan, C.pink, C.purple, C.orange, C.blue, C.yellow][v % 6];
  // yan profil (z,y): gövde + kontrol masası çıkıntısı
  const sideProfile = [[-0.4375, 0], [0.3, 0], [0.4375, 0.9], [0.4375, 1.05], [0.2, 1.15], [0.2, 1.7], [-0.4375, 1.7]];
  b.extrude(-0.5, 0.5, sideProfile, C.steelDark, M.body);
  b.extrude(-0.5, -0.46, [[-0.4375, 0.02], [0.3, 0.02], [0.4375, 0.9], [0.4375, 1.05], [0.2, 1.15], [0.2, 1.7], [-0.4375, 1.7]], art, M.body, 2);
  b.extrude(0.46, 0.5, [[-0.4375, 0.02], [0.3, 0.02], [0.4375, 0.9], [0.4375, 1.05], [0.2, 1.15], [0.2, 1.7], [-0.4375, 1.7]], art, M.body, 1);
  // ekran bölmesi (eğik)
  b.quad([-0.4, 1.2, 0.205], [0.4, 1.2, 0.205], [0.4, 1.66, 0.205], [-0.4, 1.66, 0.205], [0, 0, 1], C.black, M.body);
  face(b, -0.36, 1.24, 0.36, 1.62, 0.2062, 1, art2, M.screen(undefined, 0.95));
  // kontrol masası (eğimli üst)
  b.quad([-0.5, 1.05, 0.2], [0.5, 1.05, 0.2], [0.5, 0.9, 0.4375], [-0.5, 0.9, 0.4375], [0, 0.7, 0.7], C.steelMid, M.body);
  b.prism(-0.18, 0.31, 0.9, 0.96, 0.02, 0.02, 6, C.chrome, M.body, false, false);
  b.ico(-0.18, 1.0, 0.31, 0.05, C.red, M.body, 1);
  [[0.05, C.yellow], [0.17, C.green], [0.29, C.cyan]].forEach((q) => {
    b.prism(q[0], 0.34, 0.96, 0.99, 0.04, 0.035, 6, q[1], M.pulse(0.8), true, false);
  });
  // tabela (üst)
  b.box(-0.5, 1.7, -0.4375, 0.5, 2.0, 0.3, C.steelDark, M.body, SKIP.NY);
  b.box(-0.46, 1.74, 0.3, 0.46, 1.96, 0.32, C.black, M.body);
  bar(b, -0.42, 1.78, 0.32, 0.42, 1.82, 0.326, art, M.pulse(1));
  bar(b, -0.42, 1.88, 0.32, 0.18, 1.92, 0.326, art2, M.neon(1));
  bar(b, -0.2, 1.84, 0.32, 0.42, 1.87, 0.326, art, M.neon(0.8));
  // jeton yuvası
  b.box(-0.2, 0.5, 0.4, 0.2, 0.68, 0.4375, C.black, M.body);
  bar(b, -0.12, 0.56, 0.438, 0.12, 0.6, 0.441, C.yellow, M.pulse(0.8));
  bar(b, -0.5, 0.0, 0.2, 0.5, 0.03, 0.22, art, M.neon(0.5));
}

function oyunBilgisayari(b, v) {
  const acc = [C.pink, C.cyan, C.green][v % 3];
  // monitör (sol)
  b.box(-0.2, 0, -0.1, -0.06, 0.035, 0.1, C.steelDark, M.body, SKIP.NY);
  b.box(-0.15, 0.035, -0.04, -0.11, 0.2, 0.0, C.steelMid, M.body);
  b.box(-0.37, 0.2, -0.06, 0.04, 0.6, 0.0, C.black, M.body);
  face(b, -0.35, 0.22, 0.02, 0.58, 0.0015, 1, acc, M.screen(0b10, 0.85));
  bar(b, -0.37, 0.185, 0.0, 0.04, 0.195, 0.004, acc, M.neonP(0b10, 0.7, 0.2));
  // kasa (sağ, ince kule)
  chamfBox(b, 0.12, 0.0, -0.25, 0.37, 0.7, 0.2, C.black, M.body, 0.02);
  face(b, 0.14, 0.05, 0.35, 0.66, 0.2002, 1, acc, M.neonP(0b10, 0.55, 0.15));
  b.prism(0.245, 0.0, 0.22, 0.62, 0.095, 0.095, 10, C.black, M.body, false, false);
  b.prism(0.245, 0.0, 0.62, 0.6205, 0.09, 0.09, 10, acc, M.neonP(0b10, 1, 0.2), false, false);
  b.prism(0.245, 0.0, 0.4, 0.4005, 0.09, 0.09, 10, acc, M.neonP(0b10, 1, 0.2), false, false);
  // klavye (RGB) + fare
  b.box(-0.3, 0.0, 0.2, 0.08, 0.035, 0.42, C.black, M.body, SKIP.NY);
  bar(b, -0.28, 0.035, 0.22, 0.06, 0.04, 0.4, acc, M.neonP(0b10, 0.65, 0.12));
  b.box(0.14, 0.0, 0.26, 0.22, 0.03, 0.36, C.steelMid, M.body, SKIP.NY);
}

function sunucuRafi(b, v) {
  chamfBox(b, -0.5, 0, -0.5, 0.5, 2.5, 0.5, C.panel, M.body, 0.03);
  b.box(-0.5, 0, -0.5, 0.5, 0.1, 0.5, C.black, M.body, SKIP.NY);
  const hue = [C.green, C.cyan][v & 1];
  for (let r = 0; r < 9; r++) {
    const y = 0.2 + r * 0.24;
    b.box(-0.44, y, 0.5, 0.44, y + 0.2, 0.52, C.steelDark, M.body, SKIP.NY | SKIP.NX | SKIP.PX | SKIP.NZ);
    face(b, -0.4, y + 0.04, 0.12, y + 0.16, 0.5215, 1, C.black, M.body); // ızgara
    for (let k = 0; k < 4; k++) {
      const on = ((r * 3 + k * 5 + v) % 5) !== 0;
      face(b, 0.2 + k * 0.055, y + 0.07, 0.245 + k * 0.055, y + 0.13, 0.5222, 1, on ? hue : C.orange, on ? M.pulse(0.9) : M.neon(0.6));
    }
  }
  bar(b, -0.46, 2.3, 0.52, 0.46, 2.34, 0.522, C.blue, M.neon(0.8));
  face(b, -0.4, 2.36, 0.0, 2.46, 0.521, 1, hue, M.screen(undefined, 0.8));
  // kablolar
  for (let k = 0; k < 5; k++) b.box(-0.45 + k * 0.2, 0.0, -0.52, -0.42 + k * 0.2, 2.4, -0.5, [C.blue, C.green, C.orange, C.pink, C.cyan][k], M.body, SKIP.NY);
}

function bilgiTerminali(b, v) {
  const hue = [C.cyan, C.mint][v & 1];
  b.box(-0.4375, 0, -0.3, 0.4375, 0.15, 0.3, C.steelDark, M.body, SKIP.NY);
  chamfBox(b, -0.34, 0.15, -0.22, 0.34, 1.2, 0.22, C.steelMid, M.body, 0.03);
  b.extrude(-0.4, 0.4, [[0.3, 1.2], [0.14, 1.72], [-0.22, 1.72], [-0.22, 1.2]], C.steelDark, M.body);
  const zAt = (y) => 0.3 - (y - 1.2) * (0.16 / 0.52) + 0.004;
  b.quad([-0.34, 1.26, zAt(1.26)], [0.34, 1.26, zAt(1.26)], [0.34, 1.68, zAt(1.68)], [-0.34, 1.68, zAt(1.68)], [0, 0.16, 0.52], hue, M.screen(0b11, 0.9));
  bar(b, -0.32, 1.22, 0.28, 0.32, 1.25, 0.29, hue, M.neon(0.9));
  b.box(-0.2, 0.7, 0.221, 0.2, 0.95, 0.226, C.black, M.body);
  bar(b, -0.15, 0.78, 0.226, 0.15, 0.8, 0.23, hue, M.neon(0.6));
  b.prism(0, 0.1, 1.72, 1.78, 0.04, 0.04, 6, C.chrome, M.body, true, false);
  b.box(-0.045, 1.72, -0.2, 0.045, 1.76, -0.1, C.steelLight, M.body);
}

function boardFace(b, w, h, z, dir, border, mat) {
  const hw = w / 2;
  const u = SIGN_UV;
  if (dir > 0) b.quad([-hw, 0, z], [hw, 0, z], [hw, h, z], [-hw, h, z], [0, 0, 1], C.white, mat, u);
  else b.quad([hw, 0, z], [-hw, 0, z], [-hw, h, z], [hw, h, z], [0, 0, -1], C.white, mat, u);
  void border;
}

function skorTablosu(b) {
  b.box(-1.5, 0.0, -0.125, 1.5, 1.5, 0.0625, C.panel, M.body);
  boardFace(b, 2.84, 1.34, 0.0635, 1, C.pink, M.board(2.84 / 1.34));
  b.frameZ(-1.46, 0.04, 1.46, 1.46, 0.06, 0.0645, 1, C.pink, M.pulse(0.9));
  b.box(-1.5, 1.42, 0.0625, 1.5, 1.5, 0.12, C.steelDark, M.body, SKIP.NY);
  bar(b, -1.3, 1.45, 0.12, 1.3, 1.48, 0.124, C.cyan, M.neon(0.9));
}

function menuTahtasi(b, v) {
  b.box(-0.75, 0.0, -0.0625, 0.75, 1.25, 0.0, C.wood, M.body);
  b.box(-0.69, 0.06, 0.0, 0.69, 1.19, 0.015, C.panel, M.body);
  boardFace(b, 1.3, 1.02, 0.0155, 1, C.warm, M.board(1.3 / 1.02));
  b.frameZ(-0.7, 0.05, 0.7, 1.2, 0.04, 0.0165, 1, [C.orange, C.cyan, C.yellow][v % 3], M.neon(0.7));
  b.box(-0.75, 1.25, -0.0625, 0.75, 1.3, 0.0, C.woodDark, M.body, SKIP.NY);
  void v;
}

function ilanPanosu(b, v, h, x) {
  void h;
  b.box(-0.75, 0.0, -0.0625, 0.75, 1.125, 0.0, C.woodDark, M.body);
  b.box(-0.69, 0.06, 0.0, 0.69, 1.065, 0.012, 0xb98a5a, M.body);
  boardFace(b, 1.06, 0.62, 0.0125, 1, C.cream, M.board(1.06 / 0.62));
  b.box(-0.69, 0.06, 0.0125, 0.69, 0.065, 0.0135, C.woodDark, M.body);
  const note = (cx, cy, w, hh, c) => {
    b.box(cx - w / 2, cy - hh / 2, 0.0125, cx + w / 2, cy + hh / 2, 0.0145, c, M.body);
    b.octa(cx, cy + hh / 2 - 0.03, 0.02, 0.018, C.red, M.body);
  };
  note(-0.56, 0.9, 0.2, 0.22, C.paper);
  note(0.58, 0.88, 0.22, 0.2, C.yellow);
  note(-0.55, 0.28, 0.2, 0.18, C.mint);
  const d = x && x.digits;
  if (d && d.length) {
    // ipucu kâğıdı: zar yüzleri
    const n = d.length;
    const w = 0.12 * n + 0.04;
    b.box(0.69 - w, 0.12, 0.0125, 0.69, 0.3, 0.0145, C.paper, M.body);
    for (let i = 0; i < n; i++) dicePips(b, 0.69 - w + 0.08 + i * 0.12, 0.21, 0.0148, 0.1, d[i], C.black);
  } else note(0.58, 0.26, 0.22, 0.18, C.pink);
}

function neonTabelaIc(b, v) {
  const frame = [C.pink, C.cyan, C.yellow, C.green][v & 3];
  b.box(-1.25, 0.0, -0.125, 1.25, 0.875, 0.0, C.panel, M.body);
  b.quad([-1.18, 0.07, 0.0015], [1.18, 0.07, 0.0015], [1.18, 0.805, 0.0015], [-1.18, 0.805, 0.0015], [0, 0, 1], C.white, M.sign(2.36 / 0.735), SIGN_UV);
  b.frameZ(-1.22, 0.03, 1.22, 0.845, 0.04, 0.0025, 1, frame, M.neon(1));
  b.box(-0.9, 0.0, -0.125, -0.84, 0.03, 0.05, C.steelMid, M.body);
  b.box(0.84, 0.0, -0.125, 0.9, 0.03, 0.05, C.steelMid, M.body);
}

function neonRaf(b, v) {
  const hue = [C.pink, C.cyan, C.purple][v % 3];
  b.box(-1.0, 0.0, -0.1875, 1.0, 0.06, 0.1875, C.panel, M.body);
  bar(b, -0.98, 0.0, 0.17, 0.98, 0.04, 0.19, hue, M.neon(1));
  bar(b, -0.98, -0.0, -0.18, 0.98, 0.02, -0.16, hue, M.neon(0.5));
  b.box(-0.95, 0.06, -0.18, -0.9, 0.24, 0.0, C.steelMid, M.body);
  b.box(0.9, 0.06, -0.18, 0.95, 0.24, 0.0, C.steelMid, M.body);
  b.box(-0.8, 0.06, -0.1, -0.5, 0.22, 0.1, [C.cream, C.red, C.blue][v % 3], M.body, SKIP.NY);
  b.prism(0.1, 0.0, 0.06, 0.3, 0.07, 0.05, 6, C.leafB, M.body, true, false);
  b.ico(0.1, 0.34, 0, 0.1, C.leafA, M.body, 0.8);
  b.box(0.45, 0.06, -0.08, 0.7, 0.12, 0.1, C.cream, M.body, SKIP.NY);
  b.box(0.52, 0.12, -0.05, 0.64, 0.3, 0.05, hue, M.glow(0.7), SKIP.NY);
}

function kabloDemeti(b) {
  const cols = [C.blue, C.green, C.orange, C.pink, C.cyan];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.1;
    const x = Math.cos(a) * 0.22;
    const z = Math.sin(a) * 0.22;
    b.prism(x, z, 0, 0.1 + (i % 2) * 0.05, 0.22, 0.18, 8, cols[i], M.body, true, false, a);
  }
  b.prism(0, 0, 0.14, 0.2, 0.16, 0.1, 8, C.black, M.body, true, false);
  b.box(-0.45, 0.0, 0.2, 0.0, 0.05, 0.28, C.blue, M.body, SKIP.NY);
  b.box(0.1, 0.0, -0.45, 0.16, 0.05, 0.1, C.green, M.body, SKIP.NY);
  b.box(0.3, 0.0, 0.1, 0.5, 0.045, 0.17, C.orange, M.body, SKIP.NY);
  b.box(-0.2, 0.2, -0.1, 0.1, 0.3, 0.1, C.black, M.body, SKIP.NY);
  bar(b, -0.15, 0.3, -0.05, 0.05, 0.31, 0.05, C.green, M.pulse(0.8));
}

function robotKol(b) {
  b.prism(0, 0, 0, 0.18, 0.46, 0.4, 10, C.steelMid, M.body, false, true);
  b.prism(0, 0, 0.18, 0.3, 0.4, 0.3, 10, C.orange, M.body, true, false);
  bar(b, -0.2, 0.15, 0.2, 0.2, 0.17, 0.4, C.cyan, M.neon(0.9));
  b.box(-0.1, 0.3, -0.1, 0.1, 1.45, 0.1, C.white, M.body);
  b.ico(0, 1.5, 0, 0.16, C.orange, M.body, 1);
  b.box(-0.1, 0.9, 0.1, 0.1, 1.0, 0.12, C.steelDark, M.body);
  // poz A (durum 0): kol öne uzanmış, tutucu aşağı
  const A = M.vis(0b01);
  b.box(-0.07, 1.46, 0.0, 0.07, 1.54, 0.38, C.white, A);
  b.ico(0, 1.5, 0.4, 0.1, C.orange, A, 1);
  b.box(-0.05, 1.1, 0.35, 0.05, 1.5, 0.45, C.steelLight, A);
  b.box(-0.1, 1.05, 0.33, -0.05, 1.2, 0.47, C.chrome, A);
  b.box(0.05, 1.05, 0.33, 0.1, 1.2, 0.47, C.chrome, A);
  // poz B (durum 1): kol yukarı, tutucu öne
  const Bm = M.vis(0b10);
  b.box(-0.07, 1.5, -0.07, 0.07, 2.05, 0.07, C.white, Bm);
  b.ico(0, 2.08, 0, 0.1, C.orange, Bm, 1);
  b.box(-0.07, 2.04, 0.0, 0.07, 2.12, 0.34, C.white, Bm);
  b.box(-0.1, 1.95, 0.3, -0.05, 2.15, 0.45, C.chrome, Bm);
  b.box(0.05, 1.95, 0.3, 0.1, 2.15, 0.45, C.chrome, Bm);
  b.octa(0, 2.2, 0.1, 0.05, C.green, M.neon(1));
  bar(b, -0.2, 0.1, 0.4, 0.2, 0.12, 0.42, C.green, M.neon(0.9));
}

function dronIstasyonu(b, v) {
  b.prism(0, 0, 0, 0.18, 0.46, 0.38, 10, C.steelMid, M.body, false, true);
  b.prism(0, 0, 0.18, 0.26, 0.4, 0.4, 10, C.steelDark, M.body, true, false);
  b.prism(0, 0, 0.26, 0.3, 0.4, 0.4, 10, C.orange, M.neonP(0b10, 1, 0.5), true, false);
  b.prism(0, 0, 0.18, 0.2, 0.47, 0.47, 10, C.orange, M.neon(0.5), false, false);
  // dron (durum 0: istasyonda)
  const D = M.vis(0b01);
  const hue = [C.white, C.mint, C.cream][v % 3];
  b.ico(0, 0.52, 0, 0.17, hue, D, 0.6);
  b.octa(0, 0.52, 0.15, 0.04, C.cyan, M.visGlow(0b01, 1));
  b.box(-0.4, 0.58, -0.03, 0.4, 0.6, 0.03, C.steelLight, D);
  b.box(-0.03, 0.58, -0.4, 0.03, 0.6, 0.4, C.steelLight, D);
  [[-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4]].forEach((q) => b.prism(q[0], q[1], 0.6, 0.63, 0.09, 0.09, 8, C.black, D, true, false));
  // sinyal direği
  b.box(0.38, 0.3, -0.45, 0.42, 1.25, -0.41, C.steelMid, M.body);
  b.octa(0.4, 1.2, -0.43, 0.06, C.orange, M.neonP(0b10, 1, 0.3));
}

function robotDoktorIstasyonu(b) {
  b.prism(0, 0, 0, 0.12, 0.42, 0.4, 10, C.white, M.body, false, true);
  b.prism(0, 0, 0.12, 0.2, 0.4, 0.4, 10, C.mint, M.body, true, false);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    b.prism(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.0, 0.1, 0.07, 0.07, 6, C.black, M.body, true, false);
  }
  chamfBox(b, -0.3, 0.2, -0.22, 0.3, 1.1, 0.22, C.white, M.body, 0.06);
  b.box(-0.2, 0.4, 0.22, 0.2, 0.9, 0.235, C.mint, M.body);
  b.box(-0.07, 0.5, 0.236, 0.07, 0.8, 0.245, C.mint, M.neon(0.9));
  b.box(-0.2, 0.62, 0.236, 0.2, 0.68, 0.245, C.mint, M.neon(0.9));
  // kafa
  b.ico(0, 1.38, 0, 0.3, C.white, M.body, 0.95);
  b.box(-0.2, 1.3, 0.24, 0.2, 1.5, 0.262, C.black, M.body);
  b.box(-0.15, 1.38, 0.263, -0.06, 1.46, 0.268, C.cyan, M.neon(1));
  b.box(0.06, 1.38, 0.263, 0.15, 1.46, 0.268, C.cyan, M.neon(1));
  b.box(-0.08, 1.32, 0.263, 0.08, 1.345, 0.268, C.cyan, M.neon(0.8));
  b.box(-0.03, 1.66, -0.03, 0.03, 1.85, 0.03, C.chrome, M.body);
  b.octa(0, 1.9, 0, 0.07, C.green, M.neon(1));
  // kollar + steteskop
  b.box(-0.42, 0.55, -0.1, -0.3, 1.0, 0.1, C.white, M.body);
  b.box(0.3, 0.55, -0.1, 0.42, 1.0, 0.1, C.white, M.body);
  b.ico(-0.36, 0.5, 0, 0.08, C.mint, M.body, 1);
  b.ico(0.36, 0.5, 0, 0.08, C.mint, M.body, 1);
  b.prism(0.36, 0.1, 0.3, 0.42, 0.04, 0.04, 6, C.chrome, M.body, true, false);
}

function robotKedi(b, v) {
  const body = [C.cream, C.steelLight, C.pink][v % 3];
  const eye = [C.cyan, C.green, C.yellow][v % 3];
  b.ico(0, 0.32, -0.05, 0.27, body, M.body, 0.75);
  b.ico(0, 0.46, 0.3, 0.2, body, M.body, 0.95);
  b.cone(-0.12, 0.3, 0.57, 0.77, 0.07, 3, body, M.body, true, 0.6);
  b.cone(0.12, 0.3, 0.57, 0.77, 0.07, 3, body, M.body, true, 0.6);
  b.box(-0.1, 0.46, 0.46, -0.04, 0.5, 0.5, eye, M.neon(1));
  b.box(0.04, 0.46, 0.46, 0.1, 0.5, 0.5, eye, M.neon(1));
  b.box(-0.015, 0.42, 0.48, 0.015, 0.44, 0.5, C.pink, M.body);
  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? -0.14 : 0.14;
    const z = i % 2 ? 0.1 : -0.2;
    b.box(x - 0.04, 0.0, z - 0.04, x + 0.04, 0.2, z + 0.04, C.steelMid, M.body, SKIP.NY);
  }
  // kuyruk (anten) + parlak ucu
  b.box(-0.02, 0.3, -0.36, 0.02, 0.4, -0.3, C.steelMid, M.body);
  b.box(-0.02, 0.4, -0.42, 0.02, 0.6, -0.36, C.steelMid, M.body);
  b.octa(0, 0.62, -0.4, 0.045, eye, M.neon(1));
  bar(b, -0.2, 0.3, -0.05, 0.2, 0.32, 0.0, eye, M.neon(0.5));
}

function miniRobot(b, v) {
  const body = [C.orange, C.cyan, C.green][v % 3];
  b.prism(-0.18, 0.0, 0.0, 0.14, 0.12, 0.12, 8, C.black, M.body, true, true);
  b.prism(0.18, 0.0, 0.0, 0.14, 0.12, 0.12, 8, C.black, M.body, true, true);
  chamfBox(b, -0.24, 0.12, -0.2, 0.24, 0.5, 0.2, body, M.body, 0.04);
  b.box(-0.14, 0.24, 0.2, 0.14, 0.42, 0.21, C.black, M.body);
  bar(b, -0.08, 0.3, 0.21, 0.08, 0.34, 0.215, C.white, M.neon(0.9));
  b.ico(0, 0.64, 0, 0.18, C.white, M.body, 0.9);
  b.box(-0.12, 0.62, 0.15, 0.12, 0.72, 0.18, C.black, M.body);
  b.box(-0.09, 0.65, 0.181, -0.03, 0.7, 0.185, C.cyan, M.neon(1));
  b.box(0.03, 0.65, 0.181, 0.09, 0.7, 0.185, C.cyan, M.neon(1));
  b.box(-0.01, 0.8, -0.01, 0.01, 0.86, 0.01, C.chrome, M.body);
  b.octa(0, 0.86, 0, 0.03, C.pink, M.neon(1));
  b.box(-0.32, 0.25, -0.04, -0.24, 0.45, 0.04, body, M.body);
  b.box(0.24, 0.25, -0.04, 0.32, 0.45, 0.04, body, M.body);
}

function aracLifti(b, v) {
  void v;
  const post = (x, z) => {
    b.box(x - 0.125, 0, z - 0.125, x + 0.125, 2.5, z + 0.125, C.orange, M.body, SKIP.NY);
    b.box(x - 0.15, 0, z - 0.15, x + 0.15, 0.08, z + 0.15, C.steelDark, M.body, SKIP.NY);
    b.box(x - 0.09, 2.2, z - 0.09, x + 0.09, 2.5, z + 0.09, C.steelMid, M.body);
    bar(b, x - 0.126, 1.2, z - 0.05, x - 0.123, 1.8, z + 0.05, C.yellow, M.neon(0.6));
  };
  post(-1.3125, -1.3125);
  post(1.3125, -1.3125);
  post(-1.3125, 1.3125);
  post(1.3125, 1.3125);
  b.box(-1.3125, 2.35, -1.3125, 1.3125, 2.45, -1.2, C.steelDark, M.body);
  // iki kızak + 4 kol (yükseltilmiş)
  b.box(-0.9, 1.0, -1.3, -0.6, 1.1, 1.3, C.steelMid, M.body);
  b.box(0.6, 1.0, -1.3, 0.9, 1.1, 1.3, C.steelMid, M.body);
  [-1.2, 1.2].forEach((z) => {
    b.box(-1.3125, 1.0, z - 0.05, -0.9, 1.1, z + 0.05, C.steelLight, M.body);
    b.box(0.9, 1.0, z - 0.05, 1.3125, 1.1, z + 0.05, C.steelLight, M.body);
  });
  b.box(-0.9, 1.1, -1.3, 0.9, 1.115, -1.28, C.yellow, M.neon(0.5));
  bar(b, -0.8, 1.02, 1.3, 0.8, 1.04, 1.32, C.orange, M.neon(0.8));
  b.box(-1.3125, 0, -1.3125, -1.2, 0.01, 1.3125, C.black, M.body);
}

function aracGovdesi(b, v) {
  const c = [C.pink, C.cyan, C.yellow, C.purple][v & 3];
  // araç +X'e bakar; gövde x −1.5..1.5, z −0.7..0.7
  b.box(-1.5, 0.3, -0.7, 1.5, 0.78, 0.7, c, M.body, SKIP.NY);
  extrudeZ(b, -0.58, 0.58, [[-0.9, 0.78], [-0.55, 1.2], [0.35, 1.2], [0.85, 0.78]], C.steelDark, M.body);
  extrudeZ(b, -0.585, 0.585, [[-0.78, 0.8], [-0.5, 1.14], [0.3, 1.14], [0.72, 0.8]], C.glassDark, M.body, 3);
  b.box(1.5, 0.5, -0.6, 1.52, 0.64, -0.3, C.warm, M.glow(0.9));
  b.box(1.5, 0.5, 0.3, 1.52, 0.64, 0.6, C.warm, M.glow(0.9));
  b.box(-1.52, 0.5, -0.6, -1.5, 0.64, 0.6, C.red, M.neon(0.9));
  bar(b, -1.5, 0.3, -0.704, 1.5, 0.34, -0.7, C.cyan, M.neon(0.8));
  bar(b, -1.5, 0.3, 0.7, 1.5, 0.34, 0.704, C.cyan, M.neon(0.8));
  const wheel = (cx, z0) => {
    const r = 0.3;
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      pts.push([cx + Math.cos(a) * r, 0.3 + Math.sin(a) * r]);
    }
    extrudeZ(b, z0, z0 + 0.22, pts, C.black, M.body);
    extrudeZ(b, z0 < 0 ? z0 - 0.003 : z0 + 0.222, z0 < 0 ? z0 : z0 + 0.2225, pts.map((p) => [cx + (p[0] - cx) * 0.5, 0.3 + (p[1] - 0.3) * 0.5]), C.chrome, M.body, z0 < 0 ? 2 : 1);
  };
  wheel(-0.95, -0.72);
  wheel(0.95, -0.72);
  wheel(-0.95, 0.5);
  wheel(0.95, 0.5);
  b.box(-1.2, 0.0, -0.1, -1.0, 0.3, 0.1, C.steelDark, M.body, SKIP.NY);
  b.box(1.0, 0.0, -0.1, 1.2, 0.3, 0.1, C.steelDark, M.body, SKIP.NY);
}

function tarayiciCihaz(b) {
  // yatak
  chamfBox(b, -0.3, 0.4, -0.75, 0.3, 0.62, 0.75, C.white, M.body, 0.04);
  b.box(-0.22, 0.0, -0.6, 0.22, 0.4, 0.6, C.steelMid, M.body, SKIP.NY);
  // halka (sekiz kutu)
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const r0 = 0.75;
    const r1 = 0.5;
    const p = (r, a) => [Math.cos(a) * r, 1.0 + Math.sin(a) * r];
    const o0 = p(r0, a0); const o1 = p(r0, a1); const i0 = p(r1, a0); const i1 = p(r1, a1);
    const zf = 0.3;
    const zb = -0.3;
    b.quad([o0[0], o0[1], zf], [o1[0], o1[1], zf], [i1[0], i1[1], zf], [i0[0], i0[1], zf], [0, 0, 1], i % 2 ? C.white : C.mint, M.body);
    b.quad([o1[0], o1[1], zb], [o0[0], o0[1], zb], [i0[0], i0[1], zb], [i1[0], i1[1], zb], [0, 0, -1], C.white, M.body);
    b.quad([o0[0], o0[1], zb], [o1[0], o1[1], zb], [o1[0], o1[1], zf], [o0[0], o0[1], zf], [(o0[0] + o1[0]) / 2, (o0[1] + o1[1]) / 2 - 1.0, 0], C.steelLight, M.body);
    b.quad([i1[0], i1[1], zb], [i0[0], i0[1], zb], [i0[0], i0[1], zf], [i1[0], i1[1], zf], [-(i0[0] + i1[0]) / 2, -((i0[1] + i1[1]) / 2 - 1.0), 0], C.black, M.body);
    b.quad([i0[0] * 1.02, 1.0 + (i0[1] - 1.0) * 1.02, zf + 0.002], [i1[0] * 1.02, 1.0 + (i1[1] - 1.0) * 1.02, zf + 0.002], [i1[0] * 1.07, 1.0 + (i1[1] - 1.0) * 1.07, zf + 0.002], [i0[0] * 1.07, 1.0 + (i0[1] - 1.0) * 1.07, zf + 0.002], [0, 0, 1], C.mint, M.neonP(0b10, 1, 0.35));
  }
  b.box(-0.45, 0.0, -0.75, 0.45, 0.2, -0.45, C.steelDark, M.body, SKIP.NY);
}

export const TECH_BUILDERS = Object.freeze({
  buzdolabi,
  mutfak_tezgahi: mutfakTezgahi,
  dus_kabini: dusKabini,
  market_buzluk: marketBuzluk,
  sarj_istasyonu: sarjIstasyonu,
  cay_ocagi: cayOcagi,
  ramen_tezgahi: ramenTezgahi,
  meyve_bari: meyveBari,
  kasa_masasi: kasaMasasi,
  odul_tezgahi: odulTezgahi,
  kurye_tezgahi: kuryeTezgahi,
  otomat_atistirmalik: otomatAtistirmalik,
  otomat_icecek: otomatIcecek,
  otomat_enerji: otomatEnerji,
  kase_seti: kaseSeti,
  holo_ekran: holoEkran,
  dev_holo_ekran: devHoloEkran,
  televizyon,
  holo_perde: holoPerde,
  projektor,
  arcade_makinesi: arcadeMakinesi,
  oyun_bilgisayari: oyunBilgisayari,
  sunucu_rafi: sunucuRafi,
  bilgi_terminali: bilgiTerminali,
  skor_tablosu: skorTablosu,
  menu_tahtasi: menuTahtasi,
  ilan_panosu: ilanPanosu,
  neon_tabela_ic: neonTabelaIc,
  neon_raf: neonRaf,
  kablo_demeti: kabloDemeti,
  robot_kol: robotKol,
  dron_istasyonu: dronIstasyonu,
  robot_doktor_istasyonu: robotDoktorIstasyonu,
  robot_kedi: robotKedi,
  mini_robot: miniRobot,
  arac_lifti: aracLifti,
  arac_govdesi: aracGovdesi,
  tarayici_cihaz: tarayiciCihaz,
});
