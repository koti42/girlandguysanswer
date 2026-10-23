/*
 * KEŞİF render/props — İÇ MEKÂN GEOMETRİSİ 3/4: bitki, ışık, akvaryum, müzik, sanat, buhar (20 model). Model (b, v, h, x) → void.
 */
import {
  C, M, SKIP, bar, chamfBox, cyl, extrudeZ, face, wd,
} from './propGeoKit.js';

const POTS = [0x7d4e8a, 0x35456b, 0xb4663f, 0x3d8b78, 0xe9dfcf, 0x4a5a90, 0xc08a3e, 0x2f7a66];

function saksiBuyuk(b, v) {
  const pot = POTS[v & 7];
  b.prism(0, 0, 0, 0.5, 0.36, 0.44, 8, pot, M.body, false, true, 0.2);
  b.prism(0, 0, 0.5, 0.56, 0.46, 0.46, 8, C.steelDark, M.body, true, false, 0.2);
  b.prism(0, 0, 0.5, 0.52, 0.4, 0.4, 8, C.soil, M.body, true, false, 0.2);
  const kind = v % 4;
  if (kind === 0) {
    // geniş yapraklı: eğik koniler
    const leaves = [[0, 0, 1.45, 0.16], [0.18, 0.08, 1.2, 0.14], [-0.18, 0.1, 1.25, 0.14], [0.1, -0.18, 1.1, 0.13], [-0.12, -0.14, 1.15, 0.13], [0.0, 0.2, 1.0, 0.12]];
    leaves.forEach((l, i) => {
      b.cone(l[0], l[1], 0.52, l[2], l[3], 5, i % 2 ? C.leafA : C.leafB, M.body, false, i);
      b.ico(l[0] * 1.6, l[2] - 0.12, l[1] * 1.6, 0.17, i % 2 ? C.leafC : C.leafA, M.body, 0.35);
    });
  } else if (kind === 1) {
    // bambu: ince dikey gövdeler
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 0.12 + (i % 2) * 0.08;
      const h = 1.2 + ((i * 5) % 4) * 0.1;
      cyl(b, Math.cos(a) * r, Math.sin(a) * r, 0.52, h, 0.028, 5, C.leafB, M.body, true);
      b.box(Math.cos(a) * r - 0.035, 0.9 + (i % 3) * 0.12, Math.sin(a) * r - 0.035, Math.cos(a) * r + 0.035, 0.93 + (i % 3) * 0.12, Math.sin(a) * r + 0.035, C.leafC, M.body);
    }
    b.cone(0, 0, 1.2, 1.5, 0.3, 6, C.leafA, M.body, false, 0.3);
  } else if (kind === 2) {
    // bonsai: kıvrık gövde + tepe
    b.box(-0.04, 0.52, -0.04, 0.04, 0.9, 0.04, C.woodDark, M.body, SKIP.NY);
    b.box(0.0, 0.9, -0.04, 0.28, 0.96, 0.04, C.woodDark, M.body);
    b.box(0.24, 0.96, -0.04, 0.3, 1.2, 0.04, C.woodDark, M.body);
    b.ico(0.22, 1.32, 0, 0.28, C.leafA, M.body, 0.72);
    b.ico(-0.1, 1.0, 0.05, 0.2, C.leafB, M.body, 0.7);
    b.ico(0.38, 1.1, 0.1, 0.14, C.leafC, M.body, 0.7);
  } else {
    // palmiye: yelpaze yapraklar
    b.prism(0, 0, 0.52, 1.25, 0.06, 0.04, 6, C.woodDark, M.body, false, false);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.cone(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 1.1, 1.3, 0.1, 3, i % 2 ? C.leafB : C.leafA, M.body, false, a);
      b.box(Math.cos(a) * 0.1 - 0.03, 1.2, Math.sin(a) * 0.1 - 0.03, Math.cos(a) * 0.4 + 0.03, 1.26, Math.sin(a) * 0.4 + 0.03, C.leafA, M.body, SKIP.NY);
    }
    b.cone(0, 0, 1.24, 1.5, 0.12, 5, C.leafC, M.body, false, 0.1);
  }
  b.octa(0.28, 0.6, 0.3, 0.035, C.warm, M.glow(0.9));
}

function bitkiDuvar(b, v) {
  b.box(-1.0, 0.0, -0.1875, 1.0, 2.0, -0.12, C.panel, M.body);
  b.box(-1.0, 0.0, -0.1875, 1.0, 0.07, 0.1, C.steelMid, M.body);
  b.box(-1.0, 1.93, -0.1875, 1.0, 2.0, 0.1, C.steelMid, M.body);
  const cols = [C.leafA, C.leafB, C.leafC];
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 5; k++) {
      const x = -0.72 + k * 0.36 + (r % 2) * 0.1;
      const y = 0.3 + r * 0.42;
      b.box(x - 0.11, y - 0.06, -0.12, x + 0.11, y + 0.06, 0.0, C.clay, M.body, SKIP.NZ | SKIP.NY | SKIP.NX | SKIP.PX);
      b.ico(x, y + 0.13, 0.02, 0.17 + ((r + k + v) % 3) * 0.03, cols[(r + k + v) % 3], M.body, 0.75);
    }
  }
  b.box(-0.96, 0.05, 0.1, -0.9, 1.95, 0.14, C.black, M.body);
  bar(b, -0.9, 1.9, 0.0, 0.9, 1.92, 0.08, C.pink, M.neon(0.8));
  bar(b, -0.9, 0.07, 0.0, 0.9, 0.09, 0.08, C.purple, M.neon(0.8));
}

function sarkikBitki(b, v) {
  b.box(-0.02, 0.9, -0.02, 0.02, 1.25, 0.02, C.steelMid, M.body);
  b.box(-0.13, 1.2, -0.13, 0.13, 1.25, 0.13, C.steelDark, M.body);
  b.box(-0.01, 0.8, -0.2, 0.01, 1.2, -0.14, C.chrome, M.body);
  b.box(-0.01, 0.8, 0.14, 0.01, 1.2, 0.2, C.chrome, M.body);
  b.prism(0, 0, 0.55, 0.8, 0.22, 0.14, 8, POTS[v & 7], M.body, false, true);
  b.prism(0, 0, 0.78, 0.82, 0.22, 0.22, 8, C.soil, M.body, true, false);
  b.ico(0, 0.9, 0, 0.26, C.leafA, M.body, 0.7);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const h = 0.0 + (i % 3) * 0.2;
    b.cone(Math.cos(a) * 0.25, Math.sin(a) * 0.25, h, 0.7, 0.06, 4, i % 2 ? C.leafB : C.leafC, M.body, false, a);
  }
}

function seraRafi(b, v) {
  b.box(-1.0, 0, -0.5, -0.94, 1.25, 0.5, C.steelMid, M.body);
  b.box(0.94, 0, -0.5, 1.0, 1.25, 0.5, C.steelMid, M.body);
  for (let i = 0; i < 2; i++) {
    const y = 0.1 + i * 0.5;
    b.box(-0.94, y, -0.48, 0.94, y + 0.04, 0.48, C.woodLight, M.body);
    for (let k = 0; k < 4; k++) {
      const x = -0.85 + k * 0.45;
      b.box(x, y + 0.04, -0.4, x + 0.38, y + 0.12, 0.4, C.clay, M.body, SKIP.NY);
      b.box(x + 0.03, y + 0.12, -0.37, x + 0.35, y + 0.125, 0.37, C.soil, M.body, SKIP.NY);
      for (let q = 0; q < 3; q++) b.cone(x + 0.1 + q * 0.09, -0.15 + ((q + k + v) % 3) * 0.15, y + 0.125, y + 0.28 + ((q + k) % 2) * 0.05, 0.05, 4, (q + k) % 2 ? C.leafB : C.leafA, M.body, false, q);
    }
  }
  b.box(-0.98, 1.12, -0.5, 0.98, 1.17, -0.4, C.steelDark, M.body, SKIP.NY);
  bar(b, -0.95, 1.1, -0.48, 0.95, 1.12, -0.42, C.pink, M.neon(1));
  bar(b, -0.95, 1.1, 0.4, 0.95, 1.12, 0.46, C.purple, M.neon(1));
  b.box(-0.98, 1.12, 0.38, 0.98, 1.17, 0.5, C.steelDark, M.body, SKIP.NY);
}

function havuzDekor(b, v) {
  b.box(-1.5, 0, -1.0, 1.5, 0.34, 1.0, 0x5c6478, M.body, SKIP.NY);
  b.box(-1.44, 0.34, -0.94, 1.44, 0.5, -0.82, 0x6a7388, M.body);
  b.box(-1.44, 0.34, 0.82, 1.44, 0.5, 0.94, 0x6a7388, M.body);
  b.box(-1.44, 0.34, -0.82, -1.32, 0.5, 0.82, 0x6a7388, M.body);
  b.box(1.32, 0.34, -0.82, 1.44, 0.5, 0.82, 0x6a7388, M.body);
  b.box(-1.32, 0.34, -0.82, 1.32, 0.38, 0.82, C.blue, M.glow(0.55), SKIP.NY);
  b.box(-1.3, 0.36, -0.8, 1.3, 0.385, 0.8, C.cyan, M.glow(0.35), SKIP.NY);
  for (let i = 0; i < 4; i++) {
    b.prism(-0.9 + i * 0.6, ((i * 5 + v) % 3 - 1) * 0.3, 0.385, 0.395, 0.17, 0.17, 6, C.leafB, M.body, true, false);
    b.cone(-0.9 + i * 0.6, ((i * 5 + v) % 3 - 1) * 0.3, 0.395, 0.44, 0.04, 4, C.pink, M.neon(0.5), false, i);
  }
  b.ico(0.7, 0.5, 0.2, 0.22, 0x7b8499, M.body, 0.7);
  b.ico(1.0, 0.45, -0.1, 0.14, 0x6a7388, M.body, 0.7);
  bar(b, -1.3, 0.37, -0.8, 1.3, 0.39, -0.78, C.cyan, M.neon(0.9));
  // küçük çeşme
  cyl(b, -0.2, 0, 0.38, 0.62, 0.06, 6, 0x7b8499, M.body, true);
  b.box(-0.22, 0.6, -0.02, -0.18, 0.64, 0.02, C.cyan, M.glow(1));
}

function akvaryum(b, v) {
  const water = [C.blue, C.cyan, C.mint][v % 3];
  chamfBox(b, -1.0, 0.0, -0.5, 1.0, 0.6, 0.5, C.woodDark, M.body, 0.03);
  b.box(-0.9, 0.08, 0.5, 0.9, 0.52, 0.51, C.steelDark, M.body);
  // tank: koyu çerçeve, su (parlayan), cam yüz
  b.box(-1.0, 0.6, -0.5, 1.0, 0.66, 0.5, C.black, M.body, SKIP.NY);
  b.box(-0.96, 0.66, -0.46, 0.96, 1.4, -0.42, water, M.glow(0.55), SKIP.NZ);
  b.box(-0.96, 0.66, -0.46, -0.92, 1.4, 0.46, C.glassDark, M.body, SKIP.NY);
  b.box(0.92, 0.66, -0.46, 0.96, 1.4, 0.46, C.glassDark, M.body, SKIP.NY);
  b.box(-0.92, 0.66, -0.42, 0.92, 0.86, 0.42, 0xd9c79a, M.body, SKIP.NY); // kum
  b.box(-0.92, 0.86, -0.42, 0.92, 0.88, 0.42, water, M.glow(0.35), SKIP.NY);
  b.box(-0.92, 1.38, -0.46, 0.92, 1.4, 0.46, water, M.glow(0.45), SKIP.NY);
  b.box(-0.96, 1.4, -0.5, 0.96, 1.5, 0.5, C.black, M.body, SKIP.NY);
  bar(b, -0.9, 1.4, 0.2, 0.9, 1.405, 0.46, C.warm, M.neon(0.8));
  // bitkiler + kayalar
  b.cone(-0.7, -0.1, 0.88, 1.3, 0.09, 4, C.leafA, M.body, false, 1);
  b.cone(-0.55, -0.15, 0.88, 1.15, 0.07, 4, C.leafB, M.body, false, 2);
  b.cone(0.65, -0.2, 0.88, 1.25, 0.08, 4, C.leafC, M.body, false, 3);
  b.ico(0.1, 0.96, 0.0, 0.16, 0x7b8499, M.body, 0.6);
  b.ico(0.35, 0.93, 0.15, 0.1, 0x6a7388, M.body, 0.6);
  // balıklar
  const fish = [[-0.4, 1.12, 0.1, C.orange], [0.2, 1.25, -0.1, C.yellow], [0.55, 1.05, 0.2, C.pink], [-0.1, 1.0, 0.25, C.red]];
  fish.forEach((f, i) => {
    b.ico(f[0], f[1], f[2], 0.07, f[3], M.glow(0.55), 0.8);
    b.cone(f[0] + (i % 2 ? 0.1 : -0.1), f[2], f[1] - 0.05, f[1] + 0.05, 0.05, 3, f[3], M.glow(0.5), false, 0);
  });
  b.octa(-0.7, 1.2, 0.2, 0.03, C.white, M.glow(1));
}

function asiliLamba(b, v) {
  const hue = [C.warm, C.pink, C.cyan, C.yellow][v & 3];
  b.box(-0.015, 0.62, -0.015, 0.015, 1.0, 0.015, C.black, M.body);
  b.box(-0.07, 0.96, -0.07, 0.07, 1.0, 0.07, C.steelDark, M.body);
  const k = v & 3;
  if (k === 0) {
    b.prism(0, 0, 0.3, 0.62, 0.3, 0.06, 8, C.steelMid, M.body, false, false);
    b.prism(0, 0, 0.3, 0.32, 0.29, 0.29, 8, hue, M.glow(1), false, true);
    b.octa(0, 0.38, 0, 0.07, C.white, M.glow(1));
  } else if (k === 1) {
    b.ico(0, 0.42, 0, 0.26, hue, M.glow(0.85), 1.1);
    b.prism(0, 0, 0.64, 0.7, 0.07, 0.07, 6, C.black, M.body, true, true);
  } else if (k === 2) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.17;
      b.box(x - 0.008, 0.3 + i * 0.05, -0.008, x + 0.008, 0.64, 0.008, C.black, M.body);
      b.octa(x, 0.3 + i * 0.05, 0, 0.07, hue, M.glow(1));
    }
  } else {
    b.prism(0, 0, 0.35, 0.4, 0.3, 0.3, 12, C.black, M.body, true, true);
    b.prism(0, 0, 0.36, 0.39, 0.298, 0.298, 12, hue, M.neon(1), false, false);
    b.box(-0.2, 0.4, -0.01, 0.2, 0.64, 0.01, C.black, M.body);
  }
}

function ayakliLamba(b, v) {
  const shade = [C.warm, C.pink, C.cyan][v % 3];
  b.prism(0, 0, 0, 0.04, 0.2, 0.19, 8, C.steelDark, M.body, true, true);
  if (v % 3 === 1) {
    // kavisli kol
    b.box(-0.015, 0.04, -0.015, 0.015, 1.5, 0.015, C.chrome, M.body);
    b.box(-0.015, 1.5, -0.015, 0.015, 1.56, 0.2, C.chrome, M.body);
    b.prism(0.0, 0.2, 1.4, 1.56, 0.17, 0.05, 8, shade, M.glow(0.9), false, true);
  } else {
    b.box(-0.015, 0.04, -0.015, 0.015, 1.4, 0.015, C.chrome, M.body);
    b.prism(0, 0, 1.35, 1.7, 0.1, 0.25, 8, C.steelMid, M.body, false, false);
    b.prism(0, 0, 1.36, 1.69, 0.098, 0.245, 8, shade, M.glow(0.9), false, true);
    b.octa(0, 1.45, 0, 0.06, C.white, M.glow(1));
  }
}

function masaLambasi(b, v) {
  const shade = [C.warm, C.cyan, C.pink][v % 3];
  b.prism(0, 0, 0, 0.03, 0.14, 0.13, 8, C.steelDark, M.body, true, true);
  b.box(-0.01, 0.03, -0.01, 0.01, 0.32, 0.01, C.chrome, M.body);
  b.box(-0.01, 0.3, -0.01, 0.01, 0.34, 0.1, C.chrome, M.body);
  b.prism(0.0, 0.1, 0.18, 0.34, 0.06, 0.15, 8, C.steelMid, M.body, false, false);
  b.prism(0.0, 0.1, 0.19, 0.335, 0.058, 0.145, 8, shade, M.glow(1), false, true);
}

function isikDemeti(b, v) {
  const hue = [C.pink, C.cyan, C.yellow, C.purple][v & 3];
  b.box(-0.02, 0.4, -0.02, 0.02, 0.5, 0.02, C.steelMid, M.body);
  b.box(-0.12, 0.44, -0.12, 0.12, 0.5, 0.12, C.steelDark, M.body);
  b.prism(0, 0, 0.2, 0.44, 0.12, 0.2, 8, C.black, M.body, false, false);
  b.prism(0, 0, 0.16, 0.2, 0.2, 0.2, 8, hue, M.neon(1), false, true);
  b.prism(0, 0, 0.12, 0.16, 0.12, 0.18, 8, hue, M.glow(0.9), false, true);
  b.octa(0, 0.1, 0, 0.05, C.white, M.glow(1));
}

function hoparlor(b, v) {
  const hue = [C.purple, C.cyan][v & 1];
  chamfBox(b, -0.375, 0.0, -0.3, 0.375, 1.5, 0.3, C.black, M.body, 0.04);
  b.box(-0.375, 0.0, -0.3, 0.375, 0.06, 0.3, C.steelDark, M.body, SKIP.NY);
  [[0.4, 0.2], [1.05, 0.15]].forEach((d) => {
    b.prism(0, 0.3, d[0] - 0.02, d[0] + 0.02, d[1] + 0.06, d[1] + 0.06, 10, C.steelMid, M.body, true, false);
    b.prism(0, 0.3, d[0] - 0.05, d[0] - 0.02, d[1], d[1] * 0.6, 10, C.steel, M.body, false, false);
    b.prism(0, 0.3, d[0] - 0.04, d[0] - 0.03, d[1] * 0.6, d[1] * 0.6, 10, hue, M.pulse(0.7), true, false);
  });
  bar(b, -0.3, 1.38, 0.301, 0.3, 1.42, 0.305, hue, M.neon(0.9));
  bar(b, -0.3, 0.1, 0.301, 0.3, 0.13, 0.305, hue, M.neon(0.9));
  b.box(-0.38, 0.6, 0.0, -0.375, 0.9, 0.2, hue, M.neon(0.6));
}

function djStandi(b, v) {
  void v;
  chamfBox(b, -1.25, 0.0, -0.5, 1.25, 0.9, 0.5, C.panel, M.body, 0.03);
  for (let i = 0; i < 12; i++) {
    const hh = 0.2 + ((i * 7) % 5) * 0.1;
    b.box(-1.05 + i * 0.18, 0.1, 0.5, -0.93 + i * 0.18, 0.1 + hh, 0.52, [C.cyan, C.pink, C.purple][i % 3], M.pulse(0.9));
  }
  chamfBox(b, -1.27, 0.9, -0.52, 1.27, 1.0, 0.52, C.steelMid, M.body, 0.02);
  // plak çalar ×2
  [-0.7, 0.7].forEach((x) => {
    b.box(x - 0.36, 1.0, -0.4, x + 0.36, 1.05, 0.38, C.steelDark, M.body, SKIP.NY);
    b.prism(x, 0.0, 1.05, 1.07, 0.3, 0.3, 14, C.black, M.body, true, false);
    b.prism(x, 0.0, 1.07, 1.075, 0.1, 0.1, 14, C.pink, M.neon(0.8), true, false);
    b.prism(x, 0.0, 1.075, 1.08, 0.02, 0.02, 6, C.chrome, M.body, true, false);
    b.box(x + 0.22, 1.05, -0.34, x + 0.3, 1.1, 0.1, C.chrome, M.body);
  });
  // mikser
  b.box(-0.28, 1.0, -0.38, 0.28, 1.1, 0.38, C.black, M.body, SKIP.NY);
  for (let i = 0; i < 4; i++) {
    b.box(-0.2 + i * 0.13, 1.1, -0.2, -0.17 + i * 0.13, 1.12, 0.2, C.steelLight, M.body);
    b.box(-0.21 + i * 0.13, 1.12, 0.0 + (i % 2) * 0.08, -0.16 + i * 0.13, 1.14, 0.06 + (i % 2) * 0.08, C.cyan, M.neon(1));
  }
  bar(b, -0.25, 1.1, 0.3, 0.25, 1.115, 0.34, C.green, M.pulse(0.9));
  // dizüstü
  b.box(0.2, 1.0, -0.46, 0.46, 1.01, -0.3, C.steelLight, M.body, SKIP.NY);
  b.box(0.2, 1.0, -0.5, 0.46, 1.2, -0.48, C.black, M.body);
  face(b, 0.22, 1.02, 0.44, 1.18, -0.478, 1, C.pink, M.screen(undefined, 0.8));
}

function sovale(b, v) {
  // A-şekilli ayaklık
  const w = wd(v);
  b.box(-0.55, 0, -0.45, -0.5, 1.9, -0.4, w, M.body, SKIP.NY);
  b.box(0.5, 0, -0.45, 0.55, 1.9, -0.4, w, M.body, SKIP.NY);
  b.box(-0.03, 0, 0.3, 0.03, 1.5, 0.36, w, M.body, SKIP.NY);
  b.box(-0.55, 0.6, -0.4, 0.55, 0.66, -0.34, w, M.body);
  b.box(-0.6, 1.88, -0.45, 0.6, 1.95, -0.38, w, M.body);
  // tuval + resim
  b.box(-0.5, 0.75, -0.34, 0.5, 1.75, -0.3, C.cream, M.body);
  const pal = [[C.pink, C.cyan, C.yellow], [C.orange, C.purple, C.blue], [C.green, C.pink, C.cream], [C.blue, C.yellow, C.red]][v & 3];
  b.box(-0.44, 0.82, -0.3, 0.44, 1.68, -0.298, pal[0], M.body);
  b.box(-0.44, 0.82, -0.298, 0.44, 1.1, -0.296, pal[1], M.body);
  b.ico(0.1, 1.38, -0.29, 0.2, pal[2], M.body, 1);
  b.box(-0.3, 1.2, -0.296, -0.1, 1.5, -0.292, pal[1], M.body);
  // boya tablası
  b.box(0.45, 0.66, -0.36, 0.7, 0.7, -0.1, C.woodLight, M.body);
  [C.red, C.blue, C.yellow].forEach((c, i) => b.prism(0.52 + i * 0.07, -0.2 + (i % 2) * 0.1, 0.7, 0.73, 0.03, 0.03, 6, c, M.body, true, false));
  b.prism(-0.45, 0.2, 0.0, 0.3, 0.1, 0.1, 6, C.steelMid, M.body, true, false);
  b.box(-0.46, 0.2, 0.1, -0.44, 0.5, 0.12, C.woodLight, M.body);
}

const ART = [
  [C.pink, C.purple, C.cyan, C.yellow],
  [C.blue, C.cyan, C.white, C.orange],
  [C.green, C.leafB, C.yellow, C.glass],
  [C.orange, C.red, C.yellow, C.purple],
  [C.purple, C.pink, C.blue, C.cream],
  [C.cyan, C.green, C.pink, C.black],
  [C.yellow, C.orange, C.pink, C.blue],
  [C.mint, C.blue, C.cream, C.pink],
];

/** +Z'ye bakan sekizgen disk (sanat eseri güneşi). */
function disc(b, cx, cy, z, r, color, mat) {
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push([cx + Math.cos((i / 8) * Math.PI * 2 + Math.PI / 8) * r, cy + Math.sin((i / 8) * Math.PI * 2 + Math.PI / 8) * r]);
  extrudeZ(b, z, z + 0.006, pts, color, mat, 1);
}

function artworkQuads(b, cx, y0, x0, x1, y1, z, v) {
  const p = ART[v & 7];
  b.box(x0, y0, z, x1, y1, z + 0.003, p[0], M.body);
  const w = x1 - x0;
  const h = y1 - y0;
  const k = v & 3;
  if (k === 0) {
    b.box(x0, y0, z + 0.003, x1, y0 + h * 0.4, z + 0.006, p[1], M.body);
    disc(b, cx, y0 + h * 0.7, z + 0.003, Math.min(w, h) * 0.2, p[3], M.glow(0.35));
  } else if (k === 1) {
    b.box(x0 + w * 0.1, y0 + h * 0.1, z + 0.003, x0 + w * 0.5, y1 - h * 0.1, z + 0.006, p[1], M.body);
    b.box(x0 + w * 0.55, y0 + h * 0.3, z + 0.003, x1 - w * 0.1, y1 - h * 0.1, z + 0.006, p[3], M.body);
  } else if (k === 2) {
    for (let i = 0; i < 4; i++) b.box(x0, y0 + h * i * 0.25, z + 0.003, x1, y0 + h * (i * 0.25 + 0.12), z + 0.006, p[1 + (i % 3)], M.body);
  } else {
    b.box(x0 + w * 0.2, y0 + h * 0.2, z + 0.003, x1 - w * 0.2, y1 - h * 0.2, z + 0.006, p[1], M.body);
    b.box(x0 + w * 0.35, y0 + h * 0.35, z + 0.006, x1 - w * 0.35, y1 - h * 0.35, z + 0.009, p[2], M.body);
  }
}

function tuval(b, v) {
  b.box(-0.625, 0.0, -0.0625, 0.625, 1.5, 0.0, wd(v), M.body);
  b.box(-0.58, 0.05, 0.0, 0.58, 1.45, 0.012, C.cream, M.body);
  artworkQuads(b, 0, 0.1, -0.52, 0.52, 1.4, 0.012, v);
  bar(b, -0.5, 1.42, 0.012, 0.5, 1.44, 0.016, C.warm, M.neon(0.25));
}

function heykel(b, v) {
  b.box(-0.45, 0, -0.45, 0.45, 0.6, 0.45, 0xcfd4de, M.body, SKIP.NY);
  b.box(-0.5, 0.58, -0.5, 0.5, 0.64, 0.5, 0xe6e9ef, M.body, SKIP.NY);
  const hue = [C.pink, C.cyan, C.yellow, C.purple][v & 3];
  const k = v & 3;
  if (k === 0) {
    b.octa(0, 1.1, 0, 0.4, hue, M.glow(0.5));
    b.octa(0, 1.7, 0, 0.22, C.white, M.body);
    b.ico(0, 0.8, 0, 0.18, C.steelLight, M.body, 1);
  } else if (k === 1) {
    for (let i = 0; i < 6; i++) b.prism(0, 0, 0.64 + i * 0.22, 0.64 + (i + 1) * 0.22, 0.38 - i * 0.04, 0.34 - i * 0.04, 6, i % 2 ? hue : C.steelLight, i % 2 ? M.neon(0.7) : M.body, false, false, i * 0.5);
    b.octa(0, 2.0, 0, 0.1, C.white, M.glow(1));
  } else if (k === 2) {
    b.box(-0.25, 0.64, -0.25, 0.25, 1.3, 0.25, C.steelMid, M.body, SKIP.NY);
    b.ico(0, 1.55, 0, 0.3, C.cream, M.body, 1);
    b.box(-0.25, 1.5, 0.28, -0.08, 1.58, 0.31, hue, M.neon(1));
    b.box(0.08, 1.5, 0.28, 0.25, 1.58, 0.31, hue, M.neon(1));
    b.box(-0.5, 0.9, -0.1, -0.25, 1.1, 0.1, C.steelMid, M.body);
    b.box(0.25, 0.9, -0.1, 0.5, 1.1, 0.1, C.steelMid, M.body);
  } else {
    // neon halka kemer
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI;
      const x = Math.cos(a) * 0.4;
      const y = 1.2 + Math.sin(a) * 0.5;
      b.box(x - 0.045, y - 0.045, -0.045, x + 0.045, y + 0.045, 0.045, hue, M.neon(1));
    }
    b.box(-0.45, 0.64, -0.05, -0.35, 1.2, 0.05, C.steelMid, M.body);
    b.box(0.35, 0.64, -0.05, 0.45, 1.2, 0.05, C.steelMid, M.body);
  }
}

function boyaRafi(b, v) {
  chamfBox(b, -0.5, 0, -0.25, 0.5, 0.8, 0.25, wd(v), M.body, 0.02);
  b.box(-0.5, 0.75, -0.25, 0.5, 0.8, 0.25, C.cream, M.body, SKIP.NY);
  const cols = [C.red, C.blue, C.yellow, C.green, C.pink, C.orange, C.purple, C.cyan];
  for (let i = 0; i < 4; i++) {
    b.prism(-0.34 + i * 0.22, -0.05 + (i % 2) * 0.1, 0.8, 0.98, 0.07, 0.07, 8, cols[(i + v) % 8], M.body, true, false);
    b.prism(-0.34 + i * 0.22, -0.05 + (i % 2) * 0.1, 0.96, 0.99, 0.072, 0.07, 8, C.steelLight, M.body, true, false);
  }
  b.prism(0.35, 0.05, 0.8, 1.12, 0.09, 0.09, 8, C.glass, M.body, false, true);
  [0, 1, 2].forEach((k) => b.box(0.3 + k * 0.03, 1.0, 0.0 + k * 0.02, 0.32 + k * 0.03, 1.46, 0.02 + k * 0.02, [C.red, C.blue, C.yellow][k], M.body));
  for (let i = 0; i < 3; i++) b.box(-0.45, 0.1 + i * 0.22, 0.25, 0.45, 0.28 + i * 0.22, 0.26, cols[(i + v + 2) % 8], M.body);
  b.box(-0.45, 0.78, 0.0, -0.1, 0.81, 0.2, cols[v % 8], M.body);
  b.prism(0.2, 0.15, 0.8, 0.86, 0.07, 0.07, 6, C.cream, M.body, true, false);
}

function manken(b, v) {
  const cloth = [C.pink, C.cyan, C.yellow, C.purple][v & 3];
  b.prism(0, 0, 0, 0.04, 0.3, 0.3, 8, C.steelDark, M.body, true, true);
  cyl(b, 0, 0, 0.04, 0.9, 0.03, 6, C.chrome, M.body, false);
  chamfBox(b, -0.2, 0.85, -0.12, 0.2, 1.55, 0.12, cloth, M.body, 0.06);
  b.box(-0.2, 0.85, -0.12, 0.2, 0.95, 0.12, C.steelDark, M.body, SKIP.NY);
  b.prism(0, 0, 0.9, 1.0, 0.2, 0.14, 8, cloth, M.body, false, false);
  b.box(-0.32, 1.1, -0.06, -0.2, 1.52, 0.06, cloth, M.body);
  b.box(0.2, 1.1, -0.06, 0.32, 1.52, 0.06, cloth, M.body);
  b.ico(-0.26, 1.06, 0, 0.07, C.cream, M.body, 1);
  b.ico(0.26, 1.06, 0, 0.07, C.cream, M.body, 1);
  cyl(b, 0, 0, 1.55, 1.65, 0.05, 6, C.cream, M.body, false);
  b.ico(0, 1.82, 0, 0.17, C.cream, M.body, 1.15);
  b.box(-0.22, 1.5, 0.1, 0.22, 1.56, 0.13, C.cyan, M.neon(0.7));
}

function cerceve(b, v) {
  const w = [wd(v), C.steelMid, C.black, C.chrome][v & 3];
  b.box(-0.5, 0.0, -0.0625, 0.5, 1.25, 0.0, w, M.body);
  b.box(-0.43, 0.07, 0.0, 0.43, 1.18, 0.008, C.cream, M.body);
  artworkQuads(b, 0, 0.14, -0.36, 0.36, 1.11, 0.008, v);
}

function kitapYigini(b, v) {
  const cols = [C.red, C.blue, C.green, C.orange, C.purple, C.cyan];
  const n = 3 + (v % 3);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = 0.06 + ((i + v) % 3) * 0.02;
    const dx = ((i * 3 + v) % 3 - 1) * 0.04;
    b.box(-0.28 + dx, y, -0.2, 0.28 + dx + (i % 2) * 0.02, y + h, 0.2, cols[(i + v) % 6], M.body, SKIP.NY);
    b.box(-0.27 + dx, y + 0.01, 0.2, 0.27 + dx, y + h - 0.01, 0.206, C.paper, M.body);
    y += h;
  }
  if (v & 1) b.prism(0.05, 0.0, y, y + 0.1, 0.08, 0.07, 6, C.cream, M.body, true, false);
}

function buharCikisi(b) {
  b.box(-0.3, 0.0, -0.3, 0.3, 0.08, 0.3, C.steelDark, M.body, SKIP.NY);
  for (let i = 0; i < 5; i++) b.box(-0.26, 0.08, -0.26 + i * 0.12, 0.26, 0.1, -0.2 + i * 0.12, C.black, M.body, SKIP.NY);
  b.prism(0, 0, 0.1, 0.5, 0.13, 0.11, 8, C.steelMid, M.body, false, false);
  b.prism(0, 0, 0.5, 0.56, 0.17, 0.17, 8, C.steelLight, M.body, true, false);
  bar(b, -0.17, 0.52, -0.17, 0.17, 0.54, -0.15, C.orange, M.neon(0.5));
  // buhar topakları
  b.ico(0, 0.72, 0, 0.14, C.white, M.glow(0.35), 0.8);
  b.ico(0.08, 0.9, 0.04, 0.11, C.white, M.glow(0.28), 0.8);
  b.ico(-0.04, 1.0, -0.04, 0.07, C.white, M.glow(0.2), 0.8);
}

export const DECOR_BUILDERS = Object.freeze({
  saksi_buyuk: saksiBuyuk,
  bitki_duvar: bitkiDuvar,
  sarkik_bitki: sarkikBitki,
  sera_rafi: seraRafi,
  havuz_dekor: havuzDekor,
  akvaryum,
  asili_lamba: asiliLamba,
  ayakli_lamba: ayakliLamba,
  masa_lambasi: masaLambasi,
  isik_demeti: isikDemeti,
  hoparlor,
  dj_standi: djStandi,
  sovale,
  tuval,
  heykel,
  boya_rafi: boyaRafi,
  manken,
  cerceve,
  kitap_yigini: kitapYigini,
  buhar_cikisi: buharCikisi,
});
