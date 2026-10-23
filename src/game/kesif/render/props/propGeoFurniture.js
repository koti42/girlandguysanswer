/*
 * KEŞİF render/props — İÇ MEKÂN MOBİLYA GEOMETRİSİ 1/4: yatak, oturma, masa, depolama, raf, koli, halı (34 model).
 * Her model (b, v) → void: b GeoBuilder (yerel koordinat, taban merkezi çapa, ön yüz +Z), v varyant 0..7 (renk/biçim). Boyutlar propCatalog.js
 * kutusuyla birebir hizalıdır (testler: sınır kutusu ≈ size, çarpışma kutusu modelin içinde). Alçak poli, pahlı kenarlar, neon vurgu.
 */
import {
  C, M, SKIP, bar, bookRow, chamfBox, cyl, extrudeZ, face, fab, legs, wd,
} from './propGeoKit.js';

const ARCH = [[-0.75, 0.42], [0.75, 0.42], [0.75, 1.0], [0.5, 1.34], [0, 1.48], [-0.5, 1.34], [-0.75, 1.0]];

function kapsulYatak(b, v) {
  const f = fab(v);
  chamfBox(b, -0.75, 0, -1.25, 0.75, 0.42, 1.25, C.steelDark, M.body, 0.04);
  bar(b, -0.77, 0.07, -1.1, -0.75, 0.1, 1.1, C.purple, M.neon(1));
  bar(b, 0.75, 0.07, -1.1, 0.77, 0.1, 1.1, C.purple, M.neon(1));
  chamfBox(b, -0.66, 0.42, -1.1, 0.66, 0.55, 0.8, f, M.body, 0.035);
  chamfBox(b, -0.42, 0.55, -1.06, 0.42, 0.66, -0.7, C.cream, M.body, 0.035);
  chamfBox(b, -0.64, 0.55, -0.2, 0.64, 0.58, 0.78, C.pink, M.body, 0.01);
  extrudeZ(b, -1.25, -0.45, ARCH, C.steelMid, M.body, 2);
  face(b, -0.45, 0.62, 0.45, 0.66, -0.44, 1, C.purple, M.neon(1));
  // kapak (durum 1): koyu cam + mor ışıklı kenarlar
  extrudeZ(b, -0.45, 1.25, ARCH.map((p) => [p[0] * 0.985, p[1] > 0.45 ? p[1] * 0.995 : 0.5]), C.glassDark, M.vis(0b10), 0);
  face(b, -0.55, 1.28, 0.55, 1.34, 1.252, 1, C.purple, M.visNeon(0b10, 1));
  bar(b, -0.745, 0.5, 1.2, -0.72, 1.0, 1.25, C.purple, M.visNeon(0b10, 1));
  bar(b, 0.72, 0.5, 1.2, 0.745, 1.0, 1.25, C.purple, M.visNeon(0b10, 1));
  // üst durum ışığı (açıkken yeşil nabız)
  b.box(-0.12, 1.4, -0.9, 0.12, 1.46, -0.7, C.green, M.neon(0.9));
}

function yatak(b, v) {
  const f = fab(v);
  const w = wd(v);
  chamfBox(b, -0.75, 0.1, -1.12, 0.75, 0.38, 1.12, w, M.body, 0.03);
  b.box(-0.7, 0, -1.08, -0.6, 0.1, -0.98, C.steelDark, M.body, SKIP.NY);
  b.box(0.6, 0, -1.08, 0.7, 0.1, -0.98, C.steelDark, M.body, SKIP.NY);
  b.box(-0.7, 0, 0.98, -0.6, 0.1, 1.08, C.steelDark, M.body, SKIP.NY);
  b.box(0.6, 0, 0.98, 0.7, 0.1, 1.08, C.steelDark, M.body, SKIP.NY);
  chamfBox(b, -0.72, 0.38, -1.1, 0.72, 0.62, 1.06, C.cream, M.body, 0.045);
  chamfBox(b, -0.72, 0.5, -0.1, 0.72, 0.64, 1.06, f, M.body, 0.035);
  b.box(-0.72, 0.52, 0.55, 0.72, 0.545, 0.62, v & 1 ? C.cyan : C.yellow, M.neon(0.5));
  chamfBox(b, -0.78, 0.38, -1.12, 0.78, 0.75, -1.0, w, M.body, 0.03);
  chamfBox(b, -0.55, 0.62, -0.98, -0.1, 0.72, -0.5, C.white, M.body, 0.04);
  chamfBox(b, 0.1, 0.62, -0.98, 0.55, 0.72, -0.5, C.white, M.body, 0.04);
}

function kanepe(b, v) {
  const f = fab(v);
  const fl = fab(v + 3);
  chamfBox(b, -1.25, 0.14, -0.5, 1.25, 0.46, 0.5, f, M.body, 0.04);
  [-1.15, 1.07].forEach((x) => {
    b.box(x, 0, -0.42, x + 0.08, 0.14, -0.34, C.steelDark, M.body, SKIP.NY);
    b.box(x, 0, 0.34, x + 0.08, 0.14, 0.42, C.steelDark, M.body, SKIP.NY);
  });
  chamfBox(b, -1.25, 0.46, -0.5, 1.25, 0.98, -0.2, f, M.body, 0.05);
  chamfBox(b, -1.25, 0.46, -0.5, -1.0, 0.74, 0.5, f, M.body, 0.05);
  chamfBox(b, 1.0, 0.46, -0.5, 1.25, 0.74, 0.5, f, M.body, 0.05);
  for (let i = 0; i < 3; i++) {
    const x0 = -1.0 + i * 0.667 + 0.015;
    chamfBox(b, x0, 0.46, -0.2, x0 + 0.637, 0.6, 0.5, fl, M.body, 0.035);
    chamfBox(b, x0 + 0.03, 0.6, -0.2, x0 + 0.607, 0.94, -0.06, fl, M.body, 0.035);
  }
  if (v & 1) bar(b, -1.1, 0.1, 0.43, 1.1, 0.13, 0.46, C.cyan, M.neon(0.8));
  chamfBox(b, -0.9, 0.6, 0.0, -0.55, 0.7, 0.3, C.cream, M.body, 0.03);
}

function koltuk(b, v) {
  const f = fab(v);
  chamfBox(b, -0.5, 0.14, -0.5, 0.5, 0.46, 0.5, f, M.body, 0.04);
  [[-0.4, -0.4], [0.32, -0.4], [-0.4, 0.32], [0.32, 0.32]].forEach((p) => b.box(p[0], 0, p[1], p[0] + 0.08, 0.14, p[1] + 0.08, C.steelDark, M.body, SKIP.NY));
  chamfBox(b, -0.5, 0.46, -0.5, 0.5, 0.98, -0.2, f, M.body, 0.05);
  chamfBox(b, -0.5, 0.46, -0.5, -0.3, 0.72, 0.5, f, M.body, 0.045);
  chamfBox(b, 0.3, 0.46, -0.5, 0.5, 0.72, 0.5, f, M.body, 0.045);
  chamfBox(b, -0.3, 0.46, -0.2, 0.3, 0.6, 0.5, fab(v + 3), M.body, 0.035);
  bar(b, -0.5, 0.38, 0.5, 0.5, 0.41, 0.505, C.warm, M.neon(0.4));
}

function puf(b, v) {
  const f = fab(v);
  b.prism(0, 0, 0.04, 0.4, 0.37, 0.36, 8, f, M.body, false, false, 0.2);
  b.prism(0, 0, 0.4, 0.46, 0.36, 0.3, 8, fab(v + 2), M.body, true, false, 0.2);
  b.prism(0, 0, 0, 0.05, 0.3, 0.3, 8, C.steelDark, M.body, false, true, 0.2);
  if (v & 1) b.prism(0, 0, 0.18, 0.205, 0.372, 0.372, 8, C.cyan, M.neon(0.7), false, false, 0.2);
}

function sandalye(b, v) {
  const w = v % 3 === 0 ? wd(v) : v % 3 === 1 ? C.steelMid : fab(v);
  const seatY = 0.5;
  chamfBox(b, -0.27, seatY - 0.06, -0.27, 0.27, seatY, 0.27, w, M.body, 0.02);
  legs(b, -0.27, -0.27, 0.27, 0.27, seatY - 0.06, 0.05, C.steelDark, M.body, 0.01);
  b.box(-0.27, seatY, -0.27, 0.27, 0.98, -0.22, w, M.body, SKIP.NY);
  b.box(-0.27, 0.72, -0.27, 0.27, 0.8, -0.22, C.steelMid, M.body, SKIP.NY);
  b.box(-0.27, seatY, -0.27, -0.22, 0.74, -0.21, C.steelDark, M.body, SKIP.NY);
  b.box(0.22, seatY, -0.27, 0.27, 0.74, -0.21, C.steelDark, M.body, SKIP.NY);
  if (v & 1) bar(b, -0.22, 0.97, -0.275, 0.22, 0.985, -0.215, C.cyan, M.neon(0.7));
}

function tabure(b, v) {
  b.prism(0, 0, 0.66, 0.72, 0.235, 0.235, 8, wd(v), M.body, true, false, 0.1);
  b.prism(0, 0, 0.72, 0.745, 0.2, 0.2, 8, fab(v), M.body, true, false, 0.1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    b.box(Math.cos(a) * 0.17 - 0.025, 0, Math.sin(a) * 0.17 - 0.025, Math.cos(a) * 0.17 + 0.025, 0.66, Math.sin(a) * 0.17 + 0.025, C.steelMid, M.body, SKIP.NY);
  }
  b.prism(0, 0, 0.26, 0.29, 0.2, 0.2, 8, C.chrome, M.body, false, false, 0.1);
}

function oyuncuKoltugu(b, v) {
  const acc = [C.pink, C.cyan, C.green][v % 3];
  b.prism(0, 0, 0.04, 0.12, 0.36, 0.3, 5, C.steelDark, M.body, false, false, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.box(Math.cos(a) * 0.3 - 0.03, 0, Math.sin(a) * 0.3 - 0.03, Math.cos(a) * 0.3 + 0.03, 0.05, Math.sin(a) * 0.3 + 0.03, C.steelDark, M.body, SKIP.NY);
  }
  cyl(b, 0, 0, 0.12, 0.42, 0.045, 6, C.chrome, M.body, false);
  chamfBox(b, -0.4, 0.42, -0.34, 0.4, 0.56, 0.4, C.black, M.body, 0.04);
  chamfBox(b, -0.34, 0.56, -0.4, 0.34, 1.12, -0.24, C.black, M.body, 0.04);
  chamfBox(b, -0.43, 0.56, -0.42, -0.3, 0.9, -0.18, acc === C.pink ? C.steelMid : C.steel, M.body, 0.03);
  chamfBox(b, 0.3, 0.56, -0.42, 0.43, 0.9, -0.18, acc === C.pink ? C.steelMid : C.steel, M.body, 0.03);
  chamfBox(b, -0.2, 1.12, -0.38, 0.2, 1.24, -0.26, acc === C.pink ? C.steelMid : C.steel, M.body, 0.03);
  bar(b, -0.025, 0.58, -0.241, 0.025, 1.1, -0.235, acc, M.neon(0.9));
  b.box(-0.44, 0.52, -0.1, -0.32, 0.6, 0.36, C.steel, M.body, SKIP.NY);
  b.box(0.32, 0.52, -0.1, 0.44, 0.6, 0.36, C.steel, M.body, SKIP.NY);
}

function sinemaKoltugu(b, v) {
  const f = [0x8a2d4a, 0x4a2d8a, 0x2d4a8a][v % 3];
  chamfBox(b, -0.5, 0.1, -0.5, 0.5, 0.46, 0.5, f, M.body, 0.045);
  chamfBox(b, -0.5, 0.46, -0.5, 0.5, 1.0, -0.2, f, M.body, 0.06);
  chamfBox(b, -0.5, 0.46, -0.5, -0.32, 0.72, 0.5, C.steelDark, M.body, 0.03);
  chamfBox(b, 0.32, 0.46, -0.5, 0.5, 0.72, 0.5, C.steelDark, M.body, 0.03);
  b.prism(-0.41, 0.15, 0.72, 0.76, 0.06, 0.06, 6, C.chrome, M.body, true, false);
  b.prism(0.41, 0.15, 0.72, 0.76, 0.06, 0.06, 6, C.chrome, M.body, true, false);
  b.box(-0.5, 0, -0.45, 0.5, 0.1, 0.45, C.black, M.body, SKIP.NY);
  bar(b, -0.5, 0.04, 0.45, 0.5, 0.06, 0.455, C.purple, M.neon(0.8));
  chamfBox(b, -0.3, 0.46, -0.2, 0.3, 0.58, 0.5, f, M.body, 0.04);
}

function beklemeSirasi(b, v) {
  b.box(-1.2, 0.18, -0.3, 1.2, 0.26, 0.3, C.steelMid, M.body);
  b.box(-1.15, 0, -0.06, -1.05, 0.18, 0.06, C.steelDark, M.body, SKIP.NY);
  b.box(1.05, 0, -0.06, 1.15, 0.18, 0.06, C.steelDark, M.body, SKIP.NY);
  const f = [C.mint, C.cyan][v & 1];
  for (let i = 0; i < 3; i++) {
    const x0 = -1.2 + i * 0.8 + 0.03;
    chamfBox(b, x0, 0.26, -0.3, x0 + 0.74, 0.42, 0.3, f, M.body, 0.035);
    chamfBox(b, x0, 0.42, -0.34, x0 + 0.74, 0.82, -0.2, f, M.body, 0.04);
  }
  b.box(-1.25, 0.26, -0.34, -1.2, 0.56, 0.3, C.steelDark, M.body, SKIP.NY);
  b.box(1.2, 0.26, -0.34, 1.25, 0.56, 0.3, C.steelDark, M.body, SKIP.NY);
}

function masa(b, v) {
  const w = wd(v);
  chamfBox(b, -1.0, 0.8, -0.5, 1.0, 0.875, 0.5, w, M.body, 0.02);
  legs(b, -1.0, -0.5, 1.0, 0.5, 0.8, 0.08, v & 1 ? C.steelMid : wd(v + 1), M.body, 0.05);
  b.box(-0.9, 0.62, -0.4, 0.9, 0.67, -0.35, C.steelMid, M.body, SKIP.NY);
  if (v & 2) b.box(-0.5, 0.875, -0.12, 0.5, 0.885, 0.12, C.paper, M.body, SKIP.NY);
  if (v & 4) {
    b.prism(0.55, 0.15, 0.875, 0.98, 0.07, 0.065, 6, C.white, M.body, true, false);
    b.prism(0.55, 0.15, 1.0, 1.0, 0.0, 0.0, 3, C.leafB, M.body, false, false);
  }
}

function alcakMasa(b, v) {
  chamfBox(b, -0.75, 0.38, -0.5, 0.75, 0.45, 0.5, C.glassDark, M.body, 0.02);
  b.box(-0.75, 0.45, -0.5, 0.75, 0.5, -0.46, v & 1 ? C.cyan : C.pink, M.neon(0.8), SKIP.NY);
  b.box(-0.75, 0.45, 0.46, 0.75, 0.5, 0.5, v & 1 ? C.cyan : C.pink, M.neon(0.8), SKIP.NY);
  legs(b, -0.75, -0.5, 0.75, 0.5, 0.38, 0.07, C.steelMid, M.body, 0.04);
  b.box(-0.6, 0.12, -0.35, 0.6, 0.14, 0.35, wd(v), M.body);
}

function kafeMasasi(b, v) {
  b.prism(0, 0, 0.8, 0.86, 0.5, 0.5, 10, wd(v), M.body, true, false);
  b.prism(0, 0, 0.78, 0.8, 0.46, 0.46, 10, C.steelDark, M.body, false, false);
  cyl(b, 0, 0, 0.06, 0.78, 0.055, 6, C.steelMid, M.body, false);
  b.prism(0, 0, 0, 0.06, 0.36, 0.32, 10, C.steelDark, M.body, true, false);
  if (v & 1) b.prism(0, 0, 0.86, 0.9, 0.04, 0.03, 6, C.leafB, M.body, true, false);
}

function katlanirMasa(b, v) {
  const w = wd(v);
  // açık (durum 0)
  const o = M.vis(0b01);
  chamfBox(b, -0.75, 0.8, -0.375, 0.75, 0.875, 0.375, w, o, 0.02);
  b.box(-0.7, 0, 0.3, -0.63, 0.8, 0.37, C.steelMid, o, SKIP.NY);
  b.box(0.63, 0, 0.3, 0.7, 0.8, 0.37, C.steelMid, o, SKIP.NY);
  b.box(-0.7, 0, -0.35, -0.63, 0.8, -0.28, C.steelMid, o, SKIP.NY);
  b.box(0.63, 0, -0.35, 0.7, 0.8, -0.28, C.steelMid, o, SKIP.NY);
  b.box(-0.69, 0.4, -0.34, 0.69, 0.43, -0.3, C.steelDark, o, SKIP.NY);
  // katlı (durum 1): duvara yatmış panel
  const c = M.vis(0b10);
  chamfBox(b, -0.74, 0.1, -0.375, 0.74, 0.86, -0.3, w, c, 0.02);
  b.box(-0.7, 0.12, -0.3, -0.64, 0.84, -0.27, C.steelMid, c, SKIP.NY);
  b.box(0.64, 0.12, -0.3, 0.7, 0.84, -0.27, C.steelMid, c, SKIP.NY);
  b.box(-0.2, 0.7, -0.3, 0.2, 0.76, -0.27, C.chrome, c, SKIP.NY);
}

function calismaMasasi(b, v) {
  const w = wd(v);
  chamfBox(b, -1.0, 0.8, -0.5, 1.0, 0.875, 0.5, w, M.body, 0.02);
  legs(b, -1.0, -0.5, 0.0, 0.5, 0.8, 0.07, C.steelMid, M.body, 0.04);
  chamfBox(b, 0.3, 0.05, -0.46, 0.96, 0.8, 0.46, C.steel, M.body, 0.02);
  for (let i = 0; i < 3; i++) {
    b.box(0.34, 0.1 + i * 0.23, 0.455, 0.92, 0.3 + i * 0.23, 0.465, C.steelMid, M.body);
    b.box(0.58, 0.19 + i * 0.23, 0.466, 0.68, 0.21 + i * 0.23, 0.476, C.chrome, M.body);
  }
  b.box(-0.8, 0.875, -0.3, -0.2, 0.885, 0.0, C.paper, M.body, SKIP.NY);
  b.prism(-0.75, 0.3, 0.875, 0.96, 0.05, 0.04, 6, C.white, M.body, true, false);
  if (v & 1) bar(b, -0.95, 0.65, -0.46, -0.05, 0.67, -0.44, C.cyan, M.neon(0.6));
}

function cokEkranliMasa(b, v) {
  chamfBox(b, -1.25, 0.8, -0.5, 1.25, 0.875, 0.5, C.panel, M.body, 0.02);
  legs(b, -1.25, -0.5, 1.25, 0.5, 0.8, 0.07, C.steelMid, M.body, 0.04);
  bar(b, -1.2, 0.72, 0.44, 1.2, 0.74, 0.46, C.blue, M.neonP(0b01, 0.8, 0.3));
  // üç monitör (durum 0 açık; yan ekranlar hafif içe)
  [[-0.74, -0.18, 0.7, 0.46], [0, 0, 0.78, 0.5], [0.74, -0.18, 0.7, 0.46]].forEach((m, i) => {
    const cx = m[0];
    const cz = m[1];
    b.box(cx - m[2] / 2 - 0.03, 0.875 + 0.11, cz - 0.04, cx + m[2] / 2 + 0.03, 0.875 + 0.17 + m[3] + 0.03, cz + 0.02, C.black, M.body, SKIP.NY);
    b.quad([cx - m[2] / 2, 0.875 + 0.17, cz + 0.0215], [cx + m[2] / 2, 0.875 + 0.17, cz + 0.0215], [cx + m[2] / 2, 0.875 + 0.17 + m[3], cz + 0.0215], [cx - m[2] / 2, 0.875 + 0.17 + m[3], cz + 0.0215], [0, 0, 1], [C.cyan, C.pink, C.green][(v + i) % 3], M.screen(0b01, 1));
    b.box(cx - 0.05, 0.875, cz - 0.03, cx + 0.05, 0.875 + 0.12, cz + 0.01, C.steelMid, M.body, SKIP.NY);
    b.box(cx - 0.16, 0.875, cz - 0.1, cx + 0.16, 0.885, cz + 0.02, C.steelDark, M.body, SKIP.NY);
  });
  b.box(-0.35, 0.875, 0.12, 0.35, 0.9, 0.34, C.steelDark, M.body, SKIP.NY);
  bar(b, -0.33, 0.9, 0.14, 0.33, 0.905, 0.32, C.pink, M.neonP(0b01, 0.5, 0.2));
  b.box(0.45, 0.875, 0.2, 0.55, 0.9, 0.3, C.steelMid, M.body, SKIP.NY);
  b.box(-1.15, 0.875, 0.1, -0.85, 0.95, 0.35, C.steelMid, M.body, SKIP.NY);
}

function isTezgahi(b, v) {
  chamfBox(b, -1.0, 0.8, -0.5, 1.0, 0.875, 0.5, C.steelLight, M.body, 0.02);
  b.box(-1.0, 0.72, -0.5, 1.0, 0.8, 0.5, C.steel, M.body, SKIP.NY);
  legs(b, -1.0, -0.5, 1.0, 0.5, 0.72, 0.09, C.steelDark, M.body, 0.02);
  b.box(-0.9, 0.2, -0.45, 0.9, 0.24, 0.45, C.steel, M.body);
  // mengene
  b.box(-0.9, 0.875, -0.1, -0.65, 0.98, 0.15, C.orange, M.body, SKIP.NY);
  b.box(-0.85, 0.98, -0.05, -0.7, 1.02, 0.1, C.chrome, M.body, SKIP.NY);
  // aletler / kutular
  b.box(0.2, 0.875, -0.3, 0.55, 0.96, 0.05, C.wood, M.body, SKIP.NY);
  b.box(0.65, 0.875, 0.05, 0.9, 0.93, 0.4, [C.red, C.blue, C.green][v % 3], M.body, SKIP.NY);
  b.prism(0.0, 0.3, 0.875, 0.95, 0.04, 0.04, 6, C.yellow, M.body, true, false);
  b.box(-0.35, 0.875, -0.35, -0.05, 0.885, -0.15, C.paper, M.body, SKIP.NY);
}

function servoTezgahi(b) {
  chamfBox(b, -1.25, 0.9, -0.62, 1.25, 1.0, 0.62, C.steelLight, M.body, 0.02);
  b.box(-1.25, 0.1, -0.6, 1.25, 0.9, 0.6, C.steel, M.body, SKIP.NY);
  b.box(-1.2, 0, -0.55, 1.2, 0.1, 0.55, C.steelDark, M.body, SKIP.NY);
  for (let i = 0; i < 4; i++) {
    b.box(-1.15 + i * 0.6, 0.3, 0.605, -0.65 + i * 0.6, 0.78, 0.62, C.steelMid, M.body);
    b.box(-1.0 + i * 0.6, 0.52, 0.622, -0.8 + i * 0.6, 0.56, 0.628, C.chrome, M.body);
  }
  bar(b, -1.2, 0.86, 0.608, 1.2, 0.89, 0.616, C.cyan, M.neon(0.8));
  // yarım kalmış robot kolu + servo
  b.prism(-0.6, 0.0, 1.0, 1.1, 0.2, 0.2, 8, C.steelDark, M.body, true, false);
  b.box(-0.68, 1.1, -0.08, -0.52, 1.5, 0.08, C.steelMid, M.body);
  b.box(-0.55, 1.5, -0.06, 0.05, 1.58, 0.06, C.steelMid, M.body);
  b.prism(-0.62, 0.0, 1.5, 1.6, 0.08, 0.08, 6, C.orange, M.body, true, false);
  b.octa(0.1, 1.54, 0, 0.07, C.cyan, M.neon(1));
  // parça kutuları
  b.box(0.45, 1.0, -0.4, 0.95, 1.12, -0.05, C.steelDark, M.body, SKIP.NY);
  bar(b, 0.5, 1.12, -0.38, 0.9, 1.125, -0.07, C.green, M.neon(0.6));
  b.box(0.7, 1.0, 0.1, 1.15, 1.08, 0.45, C.paper, M.body, SKIP.NY);
  b.prism(0.95, 0.28, 1.08, 1.16, 0.06, 0.06, 6, C.red, M.body, true, false);
}

function rafUnitesi(b, v) {
  b.box(-1.0, 0, -0.25, -0.94, 2.0, 0.25, C.steelMid, M.body);
  b.box(0.94, 0, -0.25, 1.0, 2.0, 0.25, C.steelMid, M.body);
  b.box(-0.94, 0, -0.25, 0.94, 2.0, -0.22, C.steelDark, M.body, SKIP.NZ);
  const cols = [C.clay, C.blue, C.yellow, C.green, C.pink, C.cream, C.orange, C.purple];
  for (let i = 0; i < 4; i++) {
    const y = 0.02 + i * 0.47;
    b.box(-0.94, y, -0.25, 0.94, y + 0.045, 0.25, C.wood, M.body);
    // eşyalar
    const n = 2 + ((v + i) % 2);
    for (let k = 0; k < n; k++) {
      const x0 = -0.85 + k * (1.7 / n);
      const w = 0.38 + ((k + i) % 2) * 0.08;
      const h = 0.16 + (((k * 3 + i + v) % 3) * 0.08);
      b.box(x0, y + 0.045, -0.18, x0 + w, y + 0.045 + h, 0.14, cols[(v + i * 3 + k) % 8], M.body, SKIP.NY);
    }
  }
  b.box(-0.94, 1.95, -0.25, 0.94, 2.0, 0.25, C.wood, M.body, SKIP.NY);
}

function kitaplik(b, v) {
  const w = wd(v);
  b.box(-1.0, 0, -0.25, -0.94, 2.5, 0.25, w, M.body);
  b.box(0.94, 0, -0.25, 1.0, 2.5, 0.25, w, M.body);
  b.box(-0.94, 0, -0.25, 0.94, 2.5, -0.21, C.woodDeep, M.body, SKIP.NZ);
  b.box(-1.02, 2.46, -0.27, 1.02, 2.5, 0.27, w, M.body, SKIP.NY);
  b.box(-0.94, 0, 0.1, 0.94, 0.3, 0.25, w, M.body, SKIP.NY); // alt kapaklı bölme
  for (let i = 0; i < 5; i++) {
    const y = 0.3 + i * 0.44;
    b.box(-0.94, y, -0.25, 0.94, y + 0.04, 0.25, w, M.body);
    if (i < 4) bookRow(b, -0.88, 0.88, y + 0.04, -0.17, 0.18, v * 5 + i * 3, 0.36);
  }
  b.box(-0.2, 0.12, 0.252, 0.2, 0.16, 0.262, C.chrome, M.body);
  bar(b, -0.9, 2.42, 0.2, 0.9, 2.44, 0.24, C.warm, M.neon(0.35));
}

function dolap(b, v) {
  const w = [C.cream, C.steelMid, wd(v), fab(v)][v % 4];
  // gövde (kapı düzlemi hariç iç ve yan)
  b.box(-0.5, 0, -0.375, 0.5, 2.0, 0.375 - 0.04, w, M.body, SKIP.PZ);
  b.box(-0.5, 0, 0.335, -0.46, 2.0, 0.375, w, M.body, SKIP.PX);
  b.box(0.46, 0, 0.335, 0.5, 2.0, 0.375, w, M.body, SKIP.NX);
  b.box(-0.46, 1.96, 0.335, 0.46, 2.0, 0.375, w, M.body, SKIP.NY);
  b.box(-0.46, 0, 0.335, 0.46, 0.06, 0.375, C.steelDark, M.body, SKIP.NY);
  // iç
  b.box(-0.46, 0.06, -0.33, 0.46, 1.96, -0.3, C.steelDark, M.visGlow(0b10, 0), SKIP.NZ);
  b.box(-0.46, 1.0, -0.3, 0.46, 1.03, 0.33, w, M.vis(0b10), SKIP.NY);
  b.box(-0.04, 1.03, -0.28, 0.04, 1.9, -0.2, C.steelMid, M.vis(0b10));
  // kapı kapalı
  b.box(-0.46, 0.06, 0.335, 0.46, 1.96, 0.375, w, M.vis(0b01), SKIP.NY | SKIP.PX | SKIP.NX);
  b.box(0.3, 0.9, 0.376, 0.34, 1.2, 0.396, C.chrome, M.vis(0b01));
  b.box(-0.01, 0.06, 0.376, 0.01, 1.96, 0.38, w === C.cream ? C.steelMid : C.steelDark, M.vis(0b01));
  // kapı açık (menteşede yana)
  b.box(0.46, 0.06, -0.04, 0.52, 1.96, 0.46, w, M.vis(0b10));
  b.box(0.5, 0.9, 0.38, 0.54, 1.2, 0.4, C.chrome, M.vis(0b10));
}

function saglikDolabi(b) {
  b.box(-0.5, 0, -0.25, 0.5, 2.0, 0.21, C.white, M.body, SKIP.PZ);
  b.box(-0.5, 0, 0.21, -0.46, 2.0, 0.25, C.white, M.body, SKIP.PX);
  b.box(0.46, 0, 0.21, 0.5, 2.0, 0.25, C.white, M.body, SKIP.NX);
  b.box(-0.46, 0, 0.21, 0.46, 0.06, 0.25, C.steelMid, M.body, SKIP.NY);
  b.box(-0.46, 1.96, 0.21, 0.46, 2.0, 0.25, C.white, M.body, SKIP.NY);
  b.box(-0.46, 0.06, -0.21, 0.46, 1.96, -0.18, C.mint, M.vis(0b10), SKIP.NZ);
  for (let i = 0; i < 4; i++) b.box(-0.46, 0.5 + i * 0.4, -0.18, 0.46, 0.53 + i * 0.4, 0.21, C.glassDark, M.vis(0b10), SKIP.NY);
  b.box(-0.2, 0.55, -0.1, 0.0, 0.8, 0.1, C.cream, M.vis(0b10));
  b.box(0.05, 0.93, -0.1, 0.25, 1.2, 0.1, C.mint, M.vis(0b10));
  // kapalı kapı + artı işareti
  b.box(-0.46, 0.06, 0.21, 0.46, 1.96, 0.25, C.white, M.vis(0b01), SKIP.NY | SKIP.PX | SKIP.NX);
  b.box(-0.07, 1.4, 0.251, 0.07, 1.84, 0.262, C.mint, M.visNeon(0b01, 0.9));
  b.box(-0.22, 1.56, 0.251, 0.22, 1.68, 0.262, C.mint, M.visNeon(0b01, 0.9));
  b.box(0.3, 0.92, 0.251, 0.34, 1.22, 0.27, C.chrome, M.vis(0b01));
  // açık kapı
  b.box(0.46, 0.06, -0.04, 0.5, 1.96, 0.46, C.white, M.vis(0b10));
}

function dolapSirali(b, v) {
  const c = [C.steelMid, C.blue, C.orange, C.green][v % 4];
  b.box(-1.0, 0, -0.3125, 1.0, 2.0, 0.28, C.steelDark, M.body, SKIP.PZ);
  b.box(-1.0, 0, 0.28, -0.97, 2.0, 0.3125, C.steelDark, M.body, SKIP.PX);
  b.box(0.97, 0, 0.28, 1.0, 2.0, 0.3125, C.steelDark, M.body, SKIP.NX);
  b.box(-0.97, 1.97, 0.28, 0.97, 2.0, 0.3125, C.steelDark, M.body, SKIP.NY);
  b.box(-0.97, 0, 0.28, 0.97, 0.05, 0.3125, C.black, M.body, SKIP.NY);
  b.box(-0.97, 0.05, -0.28, 0.97, 1.97, -0.25, C.panel, M.vis(0b10), SKIP.NZ);
  for (let i = 0; i < 3; i++) {
    const x0 = -0.97 + i * 0.6467;
    const x1 = x0 + 0.6467;
    // kapalı kapılar
    b.box(x0 + 0.01, 0.05, 0.28, x1 - 0.01, 1.97, 0.3125, c, i === 1 ? M.vis(0b11) : M.vis(0b01), SKIP.NY | SKIP.PX | SKIP.NX);
    for (let k = 0; k < 4; k++) b.box(x0 + 0.12, 1.55 + k * 0.07, 0.3126, x1 - 0.12, 1.58 + k * 0.07, 0.318, C.black, i === 1 ? M.vis(0b11) : M.vis(0b01));
    b.box(x1 - 0.14, 0.9, 0.3126, x1 - 0.1, 1.15, 0.33, C.chrome, i === 1 ? M.vis(0b11) : M.vis(0b01));
    if (i === 0) {
      // açık kapı (durum 1): yana açık
      b.box(x0 - 0.03, 0.05, 0.28, x0, 1.97, 0.7, c, M.vis(0b10));
    }
    if (i === 0) b.box(x0 + 0.03, 0.4, -0.2, x1 - 0.03, 0.44, 0.27, C.steelMid, M.vis(0b10));
  }
}

function takimDolabi(b, v) {
  const c = [C.red, C.orange, C.blue, C.green][v % 4];
  b.box(-0.5, 0, -0.375, 0.5, 1.5, 0.375, c, M.body, SKIP.NY);
  b.box(-0.47, 1.46, -0.35, 0.47, 1.5, 0.35, C.steelDark, M.body, SKIP.NY);
  b.box(-0.5, 0, 0.375, 0.5, 0.1, 0.4, C.black, M.body);
  for (let i = 0; i < 4; i++) {
    const y0 = 0.14 + i * 0.3;
    const open = i === 1;
    b.box(-0.45, y0, 0.375, 0.45, y0 + 0.26, 0.395, C.steelMid, open ? M.vis(0b01) : M.body, SKIP.NY);
    b.box(-0.18, y0 + 0.1, 0.396, 0.18, y0 + 0.14, 0.42, C.chrome, open ? M.vis(0b01) : M.body);
    if (open) {
      b.box(-0.43, y0, 0.2, 0.43, y0 + 0.06, 0.72, C.steelMid, M.vis(0b10));
      b.box(-0.43, y0, 0.7, 0.43, y0 + 0.24, 0.72, C.steelLight, M.vis(0b10));
      b.box(-0.3, y0 + 0.06, 0.3, 0.3, y0 + 0.12, 0.6, C.chrome, M.vis(0b10));
    }
  }
  b.box(-0.5, 0.0, -0.375, 0.5, 0.05, -0.34, C.black, M.body);
}

function aletDuvari(b) {
  b.box(-1.0, 0.0, -0.125, 1.0, 2.0, -0.09, C.wood, M.body);
  // delikli pano: ince koyu çizgi ızgarası
  for (let y = 0.1; y < 1.95; y += 0.2) face(b, -0.97, y - 0.012, 0.97, y + 0.012, -0.0895, 1, C.woodDeep, M.body);
  for (let x = -0.9; x < 0.95; x += 0.2) face(b, x - 0.012, 0.02, x + 0.012, 1.98, -0.0894, 1, C.woodDeep, M.body);
  const t = [[-0.8, 1.4, 0.1, 0.5, C.red], [-0.5, 1.5, 0.08, 0.4, C.yellow], [-0.2, 1.3, 0.12, 0.6, C.blue], [0.1, 1.45, 0.1, 0.45, C.orange], [0.45, 1.3, 0.1, 0.55, C.green], [0.75, 1.5, 0.08, 0.35, C.red]];
  t.forEach((q, i) => {
    b.box(q[0], q[1] - q[3], -0.09, q[0] + q[2], q[1], -0.02, q[4], M.body);
    b.box(q[0] + q[2] * 0.2, q[1] - q[3] - 0.12, -0.09, q[0] + q[2] * 0.8, q[1] - q[3], -0.04, C.chrome, M.body);
    void i;
  });
  b.box(-0.8, 0.45, -0.09, -0.1, 0.5, -0.0, C.steelMid, M.body);
  b.box(0.0, 0.35, -0.09, 0.8, 0.4, 0.0, C.steelMid, M.body);
  b.prism(-0.55, 0.0, 0.5, 0.6, 0.12, 0.12, 6, C.chrome, M.body, true, false);
  b.box(0.1, 0.4, -0.09, 0.5, 0.65, -0.0, C.orange, M.body, SKIP.NY);
  bar(b, -0.98, 1.92, -0.09, 0.98, 1.95, -0.07, C.yellow, M.neon(0.3));
}

function parcaRafi(b, v) {
  b.box(-1.0, 0, -0.3, -0.95, 2.0, 0.3, C.steelMid, M.body);
  b.box(0.95, 0, -0.3, 1.0, 2.0, 0.3, C.steelMid, M.body);
  b.box(-0.95, 0, -0.3, 0.95, 2.0, -0.26, C.steelDark, M.body, SKIP.NZ);
  for (let i = 0; i < 4; i++) {
    const y = 0.1 + i * 0.5;
    b.box(-0.95, y, -0.3, 0.95, y + 0.04, 0.3, C.steel, M.body);
    for (let k = 0; k < 4; k++) {
      const x = -0.8 + k * 0.42;
      const j = (v + i + k) % 4;
      if (j === 0) { b.prism(x, 0.0, y + 0.04, y + 0.3, 0.1, 0.1, 6, C.steelLight, M.body, true, false); b.octa(x, y + 0.2, 0.12, 0.05, C.cyan, M.glow(0.9)); }
      else if (j === 1) { b.box(x - 0.14, y + 0.04, -0.12, x + 0.14, y + 0.2, 0.12, C.orange, M.body, SKIP.NY); b.box(x - 0.06, y + 0.2, -0.05, x + 0.06, y + 0.3, 0.05, C.chrome, M.body, SKIP.NY); }
      else if (j === 2) { b.ico(x, y + 0.2, 0, 0.12, C.steelLight, M.body, 0.9); b.octa(x, y + 0.2, 0.1, 0.045, C.green, M.glow(1)); }
      else { b.box(x - 0.18, y + 0.04, -0.1, x + 0.18, y + 0.12, 0.1, C.green, M.body, SKIP.NY); b.box(x - 0.1, y + 0.12, -0.04, x + 0.1, y + 0.16, 0.04, C.black, M.body, SKIP.NY); }
    }
  }
}

function dronRafi(b, v) {
  b.box(-1.0, 0, -0.44, -0.94, 2.5, 0.44, C.steelMid, M.body);
  b.box(0.94, 0, -0.44, 1.0, 2.5, 0.44, C.steelMid, M.body);
  b.box(-0.94, 0, -0.44, 0.94, 2.5, -0.4, C.steelDark, M.body, SKIP.NZ);
  b.box(-1.0, 2.46, -0.44, 1.0, 2.5, 0.44, C.steelMid, M.body, SKIP.NY);
  for (let i = 0; i < 3; i++) {
    const y = 0.15 + i * 0.8;
    b.box(-0.94, y, -0.44, 0.94, y + 0.05, 0.44, C.steel, M.body);
    bar(b, -0.94, y + 0.05, 0.4, 0.94, y + 0.07, 0.43, C.orange, M.neon(0.7));
    for (let k = 0; k < 2; k++) {
      const x = -0.47 + k * 0.94;
      // yuva halkası + dron gövdesi
      b.prism(x, 0.0, y + 0.05, y + 0.1, 0.3, 0.3, 8, C.orange, M.glow(0.8), true, false);
      if ((v + i + k) % 4 !== 3) {
        b.ico(x, y + 0.26, 0, 0.14, [C.white, C.cream, C.mint][(i + k) % 3], M.body, 0.75);
        b.octa(x, y + 0.26, 0.12, 0.035, C.cyan, M.glow(1));
        b.box(x - 0.34, y + 0.34, -0.03, x + 0.34, y + 0.36, 0.03, C.steelLight, M.body);
        b.prism(x - 0.34, 0.0, y + 0.36, y + 0.38, 0.08, 0.08, 6, C.black, M.body, true, false);
        b.prism(x + 0.34, 0.0, y + 0.36, y + 0.38, 0.08, 0.08, 6, C.black, M.body, true, false);
      }
    }
  }
}

function marketRafi(b, v) {
  const cols = [[C.red, C.yellow, C.green], [C.blue, C.pink, C.cream], [C.orange, C.mint, C.purple], [C.green, C.red, C.white], [C.yellow, C.blue, C.pink], [C.cream, C.orange, C.cyan]][v % 6];
  b.box(-1.0, 0, -0.375, -0.96, 1.75, 0.375, C.steelMid, M.body);
  b.box(0.96, 0, -0.375, 1.0, 1.75, 0.375, C.steelMid, M.body);
  b.box(-0.96, 0.2, -0.04, 0.96, 1.75, 0.04, C.steel, M.body);
  b.box(-0.96, 0, -0.375, 0.96, 0.2, 0.375, C.steelDark, M.body, SKIP.NY);
  b.box(-1.0, 1.7, -0.375, 1.0, 1.75, 0.375, C.steelMid, M.body, SKIP.NY);
  bar(b, -0.9, 1.62, 0.37, 0.9, 1.67, 0.375, C.warm, M.neon(0.45));
  for (let i = 0; i < 4; i++) {
    const y = 0.24 + i * 0.36;
    b.box(-0.96, y, -0.375, 0.96, y + 0.03, 0.375, C.steelLight, M.body);
    for (let k = 0; k < 6; k++) {
      const x = -0.9 + k * 0.3;
      const c = cols[(k + i) % 3];
      const h = 0.14 + ((k + i + v) % 3) * 0.04;
      b.box(x, y + 0.03, 0.05, x + 0.24, y + 0.03 + h, 0.32, c, M.body, SKIP.NY | SKIP.NZ | SKIP.NX | SKIP.PX);
      b.box(x, y + 0.03, -0.32, x + 0.24, y + 0.03 + h, -0.05, cols[(k + i + 1) % 3], M.body, SKIP.NY | SKIP.PZ | SKIP.NX | SKIP.PX);
      b.box(x + 0.03, y + 0.03 + h * 0.5, 0.321, x + 0.21, y + 0.03 + h * 0.8, 0.325, C.white, M.body);
    }
  }
}

function vitrin(b, v) {
  const w = [C.steelMid, wd(v), C.black][v % 3];
  b.box(-1.0, 0, -0.375, 1.0, 0.5, 0.375, w, M.body, SKIP.NY);
  b.box(-1.0, 0.5, -0.375, -0.96, 1.75, 0.375, w, M.body);
  b.box(0.96, 0.5, -0.375, 1.0, 1.75, 0.375, w, M.body);
  b.box(-0.96, 0.5, -0.375, 0.96, 1.75, -0.34, w, M.body, SKIP.NZ);
  b.box(-1.0, 1.7, -0.375, 1.0, 1.75, 0.375, w, M.body, SKIP.NY);
  // cam (koyu) + vitrin ışığı
  b.box(-0.96, 0.5, 0.35, 0.96, 1.7, 0.36, C.glassDark, M.body, SKIP.NY | SKIP.PY);
  b.box(-0.96, 0.9, -0.3, 0.96, 0.93, 0.34, C.glass, M.body, SKIP.NY);
  b.box(-0.96, 1.3, -0.3, 0.96, 1.33, 0.34, C.glass, M.body, SKIP.NY);
  bar(b, -0.94, 1.66, -0.3, 0.94, 1.69, 0.3, C.warm, M.neon(0.9));
  [[-0.6, 0.93, C.cyan], [0.0, 0.93, C.pink], [0.6, 0.93, C.yellow]].forEach((q, i) => {
    b.octa(q[0], q[1] + 0.14, 0, 0.12, q[2], M.glow(0.9));
    b.box(q[0] - 0.06, q[1], -0.06, q[0] + 0.06, q[1] + 0.03, 0.06, C.steelDark, M.body, SKIP.NY);
    void i;
  });
  b.prism(-0.4, 0.0, 0.5, 0.82, 0.1, 0.12, 6, C.cream, M.body, true, false);
  b.ico(0.45, 1.5, 0, 0.14, C.pink, M.body, 0.9);
  b.box(0.25, 1.33, -0.1, 0.65, 1.38, 0.1, C.steelDark, M.body);
}

function koli(b, v) {
  const c = [C.woodLight, 0xa87f4e, 0xc49a62][v % 3];
  b.box(-0.5, 0, -0.5, 0.5, 1.0, 0.5, c, M.body, SKIP.NY);
  b.box(-0.06, 0.995, -0.5, 0.06, 1.002, 0.5, C.cream, M.body, SKIP.NY);
  b.box(-0.06, 0.2, 0.5, 0.06, 0.995, 0.505, C.cream, M.body, SKIP.NY);
  b.box(0.12, 0.3, 0.5, 0.34, 0.5, 0.505, C.white, M.body);
  b.box(0.16, 0.34, 0.505, 0.3, 0.38, 0.507, C.black, M.body);
  if (v === 2) b.box(-0.5, 0.45, -0.51, 0.5, 0.5, 0.51, C.yellow, M.body);
}

function koliYigini(b, v) {
  const c = (i) => [C.woodLight, 0xa87f4e, 0xc49a62][(v + i) % 3];
  b.box(-0.7, 0, -0.7, 0.7, 0.9, 0.7, c(0), M.body, SKIP.NY);
  b.box(-0.06, 0.895, -0.7, 0.06, 0.902, 0.7, C.cream, M.body, SKIP.NY);
  b.box(-0.55, 0.9, -0.5, 0.45, 1.5, 0.5, c(1), M.body, SKIP.NY);
  b.box(-0.06, 1.495, -0.5, 0.06, 1.502, 0.5, C.cream, M.body, SKIP.NY);
  b.box(0.0, 1.5, -0.35, 0.65, 2.0, 0.2, c(2), M.body, SKIP.NY);
  b.box(0.05, 0.9, 0.5, 0.7, 1.35, 0.72, c(2), M.body, SKIP.NY);
  b.box(-0.7, 0, 0.7, -0.3, 0.45, 0.75, c(1), M.body, SKIP.NY);
  b.box(-0.3, 0.3, 0.7, -0.1, 0.5, 0.705, C.white, M.body);
}

function muayeneYatagi(b) {
  chamfBox(b, -0.55, 0.3, -1.1, 0.55, 0.55, 1.1, C.white, M.body, 0.04);
  chamfBox(b, -0.52, 0.55, -1.05, 0.52, 0.72, 0.15, C.mint, M.body, 0.045);
  chamfBox(b, -0.52, 0.55, 0.15, 0.52, 0.65, 1.05, C.mint, M.body, 0.04);
  b.box(-0.58, 0.62, -1.0, -0.55, 0.75, 1.0, C.chrome, M.body);
  b.box(0.55, 0.62, -1.0, 0.58, 0.75, 1.0, C.chrome, M.body);
  b.box(-0.2, 0.05, -0.2, 0.2, 0.3, 0.2, C.steelMid, M.body, SKIP.NY);
  b.box(-0.55, 0, -0.6, 0.55, 0.05, 0.6, C.steelDark, M.body, SKIP.NY);
  bar(b, -0.5, 0.31, -1.1, 0.5, 0.34, -1.105, C.mint, M.neon(0.7));
  chamfBox(b, -0.3, 0.72, -1.0, 0.3, 0.8, -0.65, C.cream, M.body, 0.03);
  b.box(0.55, 0.35, -0.5, 0.62, 0.45, -0.3, C.steelDark, M.body);
  b.box(0.58, 0.45, -0.46, 0.6, 0.55, -0.34, C.mint, M.neon(0.8));
}

const RUG = [C.pink, C.cyan, C.yellow, C.purple, C.green, C.orange];

function hali(b, v) {
  const c = RUG[v % 6];
  const c2 = RUG[(v + 3) % 6];
  b.box(-1.5, 0, -1.0, 1.5, 0.05, 1.0, C.steelDark, M.body, SKIP.NY);
  b.box(-1.44, 0.05, -0.94, 1.44, 0.1, 0.94, c, M.body, SKIP.NY);
  b.box(-1.3, 0.1, -0.8, 1.3, 0.115, 0.8, C.cream, M.body, SKIP.NY);
  b.box(-1.15, 0.115, -0.65, 1.15, 0.125, 0.65, c2, M.body, SKIP.NY);
  if (v % 2 === 0) {
    b.prism(0, 0, 0.125, 0.131, 0.5, 0.5, 8, c, M.body, true, false, 0.4);
    b.prism(0, 0, 0.131, 0.137, 0.3, 0.3, 8, C.cream, M.body, true, false, 0.4);
  } else {
    for (let i = -2; i <= 2; i++) b.box(i * 0.4 - 0.05, 0.125, -0.5, i * 0.4 + 0.05, 0.131, 0.5, c, M.body, SKIP.NY);
  }
  b.box(-1.5, 0, -1.0, 1.5, 0.002, -0.98, C.black, M.body);
}

function dansZemini(b, v) {
  b.box(-1.5, 0, -1.5, 1.5, 0.06, 1.5, C.black, M.body, SKIP.NY);
  const cols = [C.pink, C.cyan, C.purple, C.yellow, C.green, C.orange];
  for (let i = 0; i < 6; i++) {
    for (let k = 0; k < 6; k++) {
      const x0 = -1.45 + i * 0.5;
      const z0 = -1.45 + k * 0.5;
      const c = cols[(i * 2 + k * 3 + v) % 6];
      b.box(x0, 0.06, z0, x0 + 0.46, 0.115, z0 + 0.46, c, (i + k) % 3 === 0 ? M.pulse(0.9) : M.neon(0.55), SKIP.NY);
    }
  }
}

export const FURNITURE_BUILDERS = Object.freeze({
  kapsul_yatak: kapsulYatak,
  yatak,
  kanepe,
  koltuk,
  puf,
  sandalye,
  tabure,
  oyuncu_koltugu: oyuncuKoltugu,
  sinema_koltugu: sinemaKoltugu,
  bekleme_sirasi: beklemeSirasi,
  masa,
  alcak_masa: alcakMasa,
  kafe_masasi: kafeMasasi,
  katlanir_masa: katlanirMasa,
  calisma_masasi: calismaMasasi,
  cok_ekranli_masa: cokEkranliMasa,
  is_tezgahi: isTezgahi,
  servo_tezgahi: servoTezgahi,
  raf_unitesi: rafUnitesi,
  kitaplik,
  dolap,
  saglik_dolabi: saglikDolabi,
  dolap_sirali: dolapSirali,
  takim_dolabi: takimDolabi,
  alet_duvari: aletDuvari,
  parca_rafi: parcaRafi,
  dron_rafi: dronRafi,
  market_rafi: marketRafi,
  vitrin,
  koli,
  koli_yigini: koliYigini,
  muayene_yatagi: muayeneYatagi,
  hali,
  dans_zemini: dansZemini,
});
