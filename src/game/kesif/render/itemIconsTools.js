/*
 * KEŞİF eşya simgeleri — alet, silah, ışık, donanım, zırh (elle boyanmış vektör görünüm).
 * Her çizici (ctx, spec) çağrılır; çizim uzayı 64×64, merkez (32,32). Kademe renkleri itemPalette'ten.
 */
import {
  poly, rrect, circle, lin, glow, paint, hiline, rotated, cssColor, rgba, mixColor, shadeColor, OUT,
} from './itemIconsKit.js';
import { TIER_PALETTES } from './itemPalette.js';

const PI = Math.PI;
const pal = (spec) => spec.palette || TIER_PALETTES.ahşap;

function drawHandle(c, P, y0, y1) {
  rrect(c, -2.9, y0, 5.8, y1 - y0, 2.4);
  paint(c, lin(c, -3, 0, 3, 0, P.handleDark, P.handle, shadeColor(P.handle, 1.25)), shadeColor(P.handleDark, 0.55), 1.6);
  for (let i = 0; i < 3; i++) hiline(c, -2.6, y1 - 9 - i * 5, 2.6, y1 - 7 - i * 5, P.wrap, 0.9, 1.5);
}

function headFill(c, P, x0, x1) {
  return lin(c, x0, 0, x1, 0, P.light, P.dark, P.head);
}

function glowHalo(c, P, x, y, r) {
  if (P.glow) glow(c, x, y, r, P.glow, 0.45);
}

function pick(c, spec) {
  const P = pal(spec);
  rotated(c, 29, 35, PI / 4, () => {
    drawHandle(c, P, -16, 27);
    glowHalo(c, P, 0, -20, 24);
    c.beginPath();
    c.moveTo(-26, -9);
    c.quadraticCurveTo(-14, -30, 0, -28);
    c.quadraticCurveTo(14, -30, 26, -9);
    c.quadraticCurveTo(14, -21, 3.4, -20);
    c.lineTo(3.4, -13);
    c.lineTo(-3.4, -13);
    c.lineTo(-3.4, -20);
    c.quadraticCurveTo(-14, -21, -26, -9);
    c.closePath();
    paint(c, headFill(c, P, -26, 26), P.edge, 2);
    hiline(c, -20, -15, -4, -24.5, 0xffffff, 0.6, 1.6);
    hiline(c, 4, -24.5, 18, -18, 0xffffff, 0.3, 1.2);
  });
}

function axe(c, spec) {
  const P = pal(spec);
  rotated(c, 29, 35, PI / 4, () => {
    drawHandle(c, P, -16, 27);
    glowHalo(c, P, 10, -14, 22);
    poly(c, [[3, -24], [12, -29], [22, -26], [27, -15], [25, -5], [17, 1], [8, 0], [3, -5]]);
    paint(c, headFill(c, P, 3, 27), P.edge, 2);
    c.beginPath();
    c.moveTo(25, -22);
    c.quadraticCurveTo(30, -12, 24, -3);
    c.lineWidth = 2.6;
    c.strokeStyle = rgba(P.light, 0.9);
    c.stroke();
    rrect(c, -9, -19, 10, 11, 2);
    paint(c, P.dark, P.edge, 1.6);
    hiline(c, 6, -24, 18, -26, 0xffffff, 0.5, 1.4);
  });
}

function shovel(c, spec) {
  const P = pal(spec);
  rotated(c, 29, 35, PI / 4, () => {
    drawHandle(c, P, -6, 27);
    rrect(c, -7, 27, 14, 3.4, 1.6);
    paint(c, P.handleDark, shadeColor(P.handleDark, 0.55), 1.4);
    glowHalo(c, P, 0, -20, 22);
    c.beginPath();
    c.moveTo(-8.5, -8);
    c.lineTo(8.5, -8);
    c.lineTo(11, -17);
    c.quadraticCurveTo(10.5, -29, 0, -36);
    c.quadraticCurveTo(-10.5, -29, -11, -17);
    c.closePath();
    paint(c, headFill(c, P, -11, 11), P.edge, 2);
    hiline(c, -4, -12, -4, -28, 0xffffff, 0.45, 1.8);
    rrect(c, -4, -11, 8, 5, 1.5);
    paint(c, P.dark, P.edge, 1.4);
  });
}

function sword(c, spec) {
  const P = pal(spec);
  rotated(c, 29, 35, PI / 4, () => {
    glowHalo(c, P, 0, -18, 26);
    poly(c, [[-4.4, -6], [4.4, -6], [4, -34], [0, -42], [-4, -34]]);
    paint(c, lin(c, -5, 0, 5, 0, P.light, P.dark, P.head), P.edge, 2);
    hiline(c, 0, -8, 0, -34, P.dark, 0.7, 1.4);
    hiline(c, -2.6, -9, -2.4, -33, 0xffffff, 0.5, 1);
    rrect(c, -12, -6.4, 24, 5, 2.2);
    paint(c, lin(c, 0, -7, 0, -1, P.light, P.dark), P.edge, 1.6);
    rrect(c, -2.9, -1.4, 5.8, 17, 2);
    paint(c, lin(c, -3, 0, 3, 0, P.handleDark, P.handle), shadeColor(P.handleDark, 0.55), 1.4);
    for (let i = 0; i < 3; i++) hiline(c, -2.6, 2 + i * 4.5, 2.6, 3.4 + i * 4.5, P.wrap, 0.9, 1.4);
    circle(c, 0, 18.4, 3.6);
    paint(c, lin(c, -3, 15, 3, 22, P.light, P.dark), P.edge, 1.5);
  });
}

function bow(c) {
  c.save();
  c.translate(32, 32);
  c.rotate(-0.28);
  c.translate(-32, -32);
  c.beginPath();
  c.moveTo(25, 5);
  c.quadraticCurveTo(2, 32, 25, 59);
  c.lineWidth = 5.4;
  c.lineCap = 'round';
  c.strokeStyle = cssColor(0x4a2c14);
  c.stroke();
  c.lineWidth = 3.4;
  c.strokeStyle = lin(c, 6, 8, 20, 56, 0xb27a46, 0x8a5a33, 0xc99060);
  c.stroke();
  c.lineWidth = 6;
  c.strokeStyle = cssColor(0x3a2a20);
  c.beginPath();
  c.moveTo(9.4, 28);
  c.lineTo(9.4, 36);
  c.stroke();
  c.beginPath();
  c.moveTo(25, 5);
  c.lineTo(25, 59);
  c.lineWidth = 1.2;
  c.strokeStyle = 'rgba(245,238,218,0.95)';
  c.stroke();
  // oku
  c.beginPath();
  c.moveTo(25, 32);
  c.lineTo(52, 32);
  c.lineWidth = 2.2;
  c.strokeStyle = cssColor(0xc9b48a);
  c.stroke();
  poly(c, [[52, 28.6], [58, 32], [52, 35.4]]);
  paint(c, 0x8a8e96, 0x40434a, 1);
  c.restore();
}

function arrow(c) {
  c.save();
  c.translate(32, 32);
  c.rotate(PI / 4);
  c.beginPath();
  c.moveTo(0, 22);
  c.lineTo(0, -18);
  c.lineWidth = 3.4;
  c.lineCap = 'round';
  c.strokeStyle = cssColor(0x4a3a20);
  c.stroke();
  c.lineWidth = 2;
  c.strokeStyle = lin(c, -1, 0, 1, 0, 0xe0cfa0, 0xb09a68);
  c.stroke();
  poly(c, [[-5, -17], [0, -29], [5, -17]]);
  paint(c, lin(c, -5, 0, 5, 0, 0xc4c8d0, 0x686c76), 0x30333a, 1.6);
  [[-1, 0xe5483f], [1, 0xf6f3ff]].forEach(([s, col]) => {
    poly(c, [[0, 14], [s * 7, 18], [s * 7, 26], [0, 22]]);
    paint(c, col, 0x30333a, 1.2);
  });
  c.restore();
}

function gun(c, spec, portal) {
  const mk2 = !portal && spec.sub === 'mk2'; // Işın Tüfeği Mk2: yeşil-turkuaz çekirdek, koyu gövde, ek namlu kılıfı
  const accent = portal ? 0xff9a3a : mk2 ? 0x7affd8 : 0x5ad7ff;
  const accent2 = portal ? 0x3aa0ff : mk2 ? 0x2fe8a0 : 0x5ad7ff;
  c.save();
  c.translate(32, 32);
  c.rotate(-0.12);
  c.translate(-32, -32);
  glow(c, 50, 31, 14, accent, 0.5);
  rrect(c, 7, 24, 38, 14, 5);
  paint(c, lin(c, 0, 24, 0, 38, portal ? 0xffffff : mk2 ? 0x56627a : 0xeef2f8, portal ? 0xc4cad4 : mk2 ? 0x2b3446 : 0xa8b4c6), 0x2b3340, 2);
  if (mk2) {
    rrect(c, 30, 21.5, 22, 5, 2);
    paint(c, lin(c, 0, 21, 0, 27, 0x8a96aa, 0x3a4458), 0x15202c, 1.2);
  }
  rrect(c, 14, 27.5, 18, 7, 3);
  paint(c, lin(c, 14, 0, 32, 0, mixColor(accent, 0xffffff, 0.5), accent), 0x15202c, 1.4);
  rrect(c, 44, 28, 14, 7, 2.5);
  paint(c, 0x2b3340, 0x15202c, 1.6);
  [47, 50.5, 54].forEach((x, i) => {
    c.beginPath();
    c.moveTo(x, 26.5);
    c.lineTo(x, 36.5);
    c.lineWidth = 2;
    c.strokeStyle = cssColor(i % 2 ? accent : accent2);
    c.stroke();
  });
  circle(c, 59, 31.5, 2.6);
  paint(c, mixColor(accent, 0xffffff, 0.6), accent, 1.2);
  poly(c, [[13, 38], [24, 38], [21, 54], [11, 54]]);
  paint(c, lin(c, 11, 0, 24, 0, 0x2b3340, 0x4a5568), 0x15202c, 1.8);
  c.beginPath();
  c.arc(27, 40, 5, 0.1, PI * 0.9);
  c.lineWidth = 1.8;
  c.strokeStyle = cssColor(0x15202c);
  c.stroke();
  hiline(c, 10, 26.5, 40, 26.5, 0xffffff, 0.6, 1.4);
  c.restore();
}

function cell(c, spec) {
  const col = spec.color || 0x5ad7ff;
  glow(c, 32, 32, 26, col, 0.4);
  rrect(c, 22, 7, 20, 50, 7);
  paint(c, lin(c, 22, 0, 42, 0, 0x2a3340, 0x56637a, 0x3a4658), 0x15202c, 2);
  rrect(c, 27, 13, 10, 38, 4);
  paint(c, lin(c, 0, 13, 0, 51, mixColor(col, 0xffffff, 0.7), col), shadeColor(col, 0.4), 1.4);
  [10, 54].forEach((y) => {
    rrect(c, 20, y - 3, 24, 6, 2.4);
    paint(c, lin(c, 0, y - 3, 0, y + 3, 0xcfd6e2, 0x7a8598), 0x30384a, 1.4);
  });
  hiline(c, 24, 16, 24, 48, 0xffffff, 0.4, 1.4);
}

function shield(c) {
  c.beginPath();
  c.moveTo(32, 5);
  c.lineTo(53, 11);
  c.quadraticCurveTo(54, 36, 32, 59);
  c.quadraticCurveTo(10, 36, 11, 11);
  c.closePath();
  paint(c, lin(c, 11, 0, 53, 0, 0xc8ced6, 0x7a828c, 0xaab1ba), 0x30343c, 2.4);
  c.beginPath();
  c.moveTo(32, 10);
  c.lineTo(48, 14.5);
  c.quadraticCurveTo(49, 34, 32, 53);
  c.quadraticCurveTo(15, 34, 16, 14.5);
  c.closePath();
  paint(c, lin(c, 16, 0, 48, 0, 0xa87a45, 0x6a4224, 0x8a5a33), 0x4a2c14, 1.6);
  [24, 32, 40].forEach((x) => hiline(c, x, 14, x, 48, 0x4a2c14, 0.5, 1));
  rrect(c, 17, 25, 30, 5, 1.5);
  paint(c, 0x7a828c, 0x30343c, 1.2);
  circle(c, 32, 30, 6.4);
  paint(c, lin(c, 27, 25, 37, 35, 0xffe58a, 0xc2901c), 0x6a4a10, 1.6);
  hiline(c, 14, 14, 22, 12, 0xffffff, 0.6, 1.6);
}

function torch(c) {
  glow(c, 32, 18, 24, 0xff9a3a, 0.55);
  c.save();
  c.translate(32, 33);
  c.rotate(0.35);
  rrect(c, -4, -2, 8, 30, 2.5);
  paint(c, lin(c, -4, 0, 4, 0, 0x5e3c20, 0x8a5a33, 0x7a4a26), 0x3a2410, 1.8);
  rrect(c, -5.4, -7, 10.8, 8, 2.2);
  paint(c, 0x2b1d14, 0x14100a, 1.6);
  // alev
  c.beginPath();
  c.moveTo(0, -30);
  c.quadraticCurveTo(10, -18, 7, -9);
  c.quadraticCurveTo(0, -3, -7, -9);
  c.quadraticCurveTo(-10, -18, 0, -30);
  c.closePath();
  paint(c, lin(c, 0, -30, 0, -6, 0xffe27a, 0xff5a1c, 0xff9a2c), 0xb03a10, 1.4);
  c.beginPath();
  c.moveTo(0, -20);
  c.quadraticCurveTo(4.5, -13, 3, -9.4);
  c.quadraticCurveTo(0, -7, -3, -9.4);
  c.quadraticCurveTo(-4.5, -13, 0, -20);
  c.closePath();
  paint(c, lin(c, 0, -20, 0, -8, 0xffffff, 0xffe27a), null);
  c.restore();
}

function lantern(c) {
  glow(c, 32, 34, 26, 0xffc760, 0.5);
  c.beginPath();
  c.arc(32, 14, 7, PI, 0);
  c.lineWidth = 2.4;
  c.strokeStyle = cssColor(0x2a2a30);
  c.stroke();
  rrect(c, 17, 14, 30, 6, 2);
  paint(c, lin(c, 0, 14, 0, 20, 0x56565e, 0x2a2a30), 0x14141a, 1.6);
  rrect(c, 19, 20, 26, 28, 3);
  paint(c, lin(c, 0, 20, 0, 48, 0xffe9a0, 0xffa83a), 0x2a2a30, 1.8);
  [26, 38].forEach((x) => hiline(c, x, 20, x, 48, 0x2a2a30, 0.9, 2));
  c.beginPath();
  c.moveTo(32, 42);
  c.quadraticCurveTo(38, 36, 34, 28);
  c.quadraticCurveTo(32, 34, 28, 30);
  c.quadraticCurveTo(26, 38, 32, 42);
  c.fillStyle = cssColor(0xfff6d0);
  c.fill();
  rrect(c, 16, 48, 32, 6, 2);
  paint(c, lin(c, 0, 48, 0, 54, 0x56565e, 0x2a2a30), 0x14141a, 1.6);
}

function plant(c, spec) {
  const name = spec.key;
  const has = (s) => name.indexOf(s) >= 0;
  const green = 0x4f9a3a;
  const green2 = 0x78c04a;
  if (has('mantar')) {
    glow(c, 32, 34, 24, 0x7ad8ff, 0.5);
    [[32, 56, 1, 0], [18, 58, 0.7, -0.2], [46, 58, 0.62, 0.2]].forEach((m) => {
      c.save();
      c.translate(m[0], m[1]);
      c.rotate(m[3]);
      c.scale(m[2], m[2]);
      rrect(c, -4, -22, 8, 22, 3);
      paint(c, lin(c, -4, 0, 4, 0, 0xcfc8b8, 0xf0e8d8), 0x6a665a, 1.6);
      c.beginPath();
      c.moveTo(-17, -22);
      c.quadraticCurveTo(-14, -42, 0, -42);
      c.quadraticCurveTo(14, -42, 17, -22);
      c.quadraticCurveTo(0, -17, -17, -22);
      c.closePath();
      paint(c, lin(c, 0, -42, 0, -20, 0xc8f4ff, 0x38a8d8), 0x1c5a78, 1.8);
      c.restore();
    });
    return;
  }
  if (has('çalı')) {
    [[22, 40, 14], [42, 40, 14], [32, 30, 16], [26, 48, 12], [40, 48, 12]].forEach((b) => {
      circle(c, b[0], b[1], b[2]);
      paint(c, lin(c, b[0], b[1] - b[2], b[0], b[1] + b[2], green2, shadeColor(green, 0.8)), 0x24501c, 1.6);
    });
    return;
  }
  if (has('sarmaşık')) {
    c.beginPath();
    c.moveTo(34, 4);
    c.bezierCurveTo(20, 20, 46, 34, 30, 60);
    c.lineWidth = 3;
    c.strokeStyle = cssColor(0x2a6a2a);
    c.stroke();
    [[30, 14], [38, 24], [28, 34], [36, 44], [30, 54]].forEach((p, i) => {
      c.save();
      c.translate(p[0], p[1]);
      c.rotate(i % 2 ? 0.6 : -0.6);
      c.beginPath();
      c.ellipse(i % 2 ? 7 : -7, 0, 8, 4.4, 0, 0, PI * 2);
      paint(c, i % 2 ? green2 : green, 0x24501c, 1.4);
      c.restore();
    });
    return;
  }
  const n = has('uzun_ot') ? 9 : 6;
  for (let i = 0; i < n; i++) {
    const x = 32 + (i - (n - 1) / 2) * 4.4;
    const lean = (i - (n - 1) / 2) * 3.4;
    c.beginPath();
    c.moveTo(x - 2.4, 58);
    c.quadraticCurveTo(x + lean * 0.4, 36, x + lean, 10 + (i % 3) * 5);
    c.quadraticCurveTo(x + lean * 0.4 + 2, 36, x + 2.4, 58);
    c.closePath();
    paint(c, lin(c, x, 58, x + lean, 10, shadeColor(green, 0.8), green2), 0x24501c, 1.2);
  }
  if (has('gelincik') || has('çiçek')) {
    c.beginPath();
    c.moveTo(32, 58);
    c.lineTo(32, 26);
    c.lineWidth = 2.6;
    c.strokeStyle = cssColor(0x2f7a2a);
    c.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      circle(c, 32 + Math.cos(a) * 8, 22 + Math.sin(a) * 8, 6.4);
      paint(c, lin(c, 0, 14, 0, 30, mixColor(spec.color, 0xffffff, 0.3), spec.color), shadeColor(spec.color, 0.5), 1.2);
    }
    circle(c, 32, 22, 4.4);
    paint(c, has('gelincik') ? 0x2b2b30 : 0xd88a1c, 0x14100a, 1.2);
  }
}

function boots(c, spec, colorOverride) {
  const base = colorOverride || 0x2d3a52;
  const glowC = spec.color || 0x5ad7ff;
  const wing = colorOverride === undefined;
  c.save();
  c.translate(2, 6);
  c.scale(0.84, 0.84);
  [[4, 2], [26, 12]].forEach(([x, y]) => {
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.moveTo(2, 4);
    c.lineTo(20, 4);
    c.lineTo(20, 24);
    c.quadraticCurveTo(34, 26, 40, 34);
    c.lineTo(40, 42);
    c.lineTo(0, 42);
    c.closePath();
    paint(c, lin(c, 0, 4, 0, 42, mixColor(base, 0xffffff, 0.25), shadeColor(base, 0.7)), OUT, 2);
    rrect(c, 0, 39, 40, 5, 2);
    paint(c, glowC, shadeColor(glowC, 0.5), 1.2);
    rrect(c, 2, 2, 18, 6, 2);
    paint(c, 0xf3f1ff, OUT, 1.4);
    hiline(c, 5, 10, 5, 30, 0xffffff, 0.35, 1.6);
    if (wing) {
      poly(c, [[2, 12], [-8, 8], [-4, 16], [-9, 20], [2, 20]]);
      paint(c, 0xffffff, mixColor(glowC, 0x000000, 0.4), 1.2);
    }
    c.restore();
  });
  c.restore();
}

function hook(c) {
  c.lineCap = 'round';
  c.strokeStyle = cssColor(0x40444c);
  c.lineWidth = 6.2;
  [[32, 20, 12, 6, 14, 20], [32, 20, 52, 6, 50, 20]].forEach((p) => {
    c.beginPath();
    c.moveTo(p[0], p[1]);
    c.quadraticCurveTo(p[2], p[3] + 14, p[4], p[5] - 8);
    c.stroke();
  });
  c.beginPath();
  c.moveTo(32, 54);
  c.lineTo(32, 8);
  c.stroke();
  c.strokeStyle = lin(c, 10, 6, 54, 54, 0xf0f2f6, 0x8a8e98);
  c.lineWidth = 3.8;
  [[32, 20, 12, 6, 14, 20], [32, 20, 52, 6, 50, 20]].forEach((p) => {
    c.beginPath();
    c.moveTo(p[0], p[1]);
    c.quadraticCurveTo(p[2], p[3] + 14, p[4], p[5] - 8);
    c.stroke();
  });
  c.beginPath();
  c.moveTo(32, 54);
  c.lineTo(32, 8);
  c.stroke();
  [[14, 12], [50, 12], [32, 6]].forEach((t) => {
    circle(c, t[0], t[1], 3);
    paint(c, 0xdfe2e8, OUT, 1.4);
  });
  circle(c, 32, 56, 4.6);
  paint(c, 0x9aa0aa, OUT, 1.6);
  c.beginPath();
  c.arc(32, 60, 4.4, 0, PI * 1.6);
  c.lineWidth = 2.4;
  c.strokeStyle = cssColor(0xc9a35a);
  c.stroke();
}

function glider(c) {
  poly(c, [[3, 48], [32, 7], [61, 48], [41, 43], [32, 52], [23, 43]]);
  paint(c, lin(c, 3, 0, 61, 0, 0xe4e4e0, 0xffffff, 0xf4f4f0), 0x50545c, 2);
  poly(c, [[23, 43], [32, 12], [41, 43], [32, 52]]);
  paint(c, lin(c, 0, 12, 0, 52, 0xffa060, 0xff6a2a), 0x8a3a10, 1.4);
  hiline(c, 3, 48, 32, 7, 0xb8bcc4, 1, 1.6);
  hiline(c, 61, 48, 32, 7, 0xb8bcc4, 1, 1.6);
  hiline(c, 32, 7, 32, 52, 0xb8bcc4, 0.9, 1.4);
  c.beginPath();
  c.moveTo(24, 46);
  c.lineTo(22, 58);
  c.moveTo(40, 46);
  c.lineTo(42, 58);
  c.moveTo(21, 58);
  c.lineTo(43, 58);
  c.lineWidth = 2.2;
  c.strokeStyle = cssColor(0x6a6e78);
  c.stroke();
}

function compass(c) {
  circle(c, 32, 33, 24);
  paint(c, lin(c, 10, 10, 54, 56, 0xf0f2f6, 0x7a808a), 0x30343c, 2);
  circle(c, 32, 33, 19.5);
  paint(c, lin(c, 0, 14, 0, 52, 0x2c4a7a, 0x16264a), 0x0c1630, 1.4);
  for (let i = 0; i < 8; i++) {
    const a = (i * PI) / 4;
    const l = i % 2 ? 2 : 4;
    c.beginPath();
    c.moveTo(32 + Math.sin(a) * 16, 33 - Math.cos(a) * 16);
    c.lineTo(32 + Math.sin(a) * (16 - l), 33 - Math.cos(a) * (16 - l));
    c.lineWidth = 1.4;
    c.strokeStyle = cssColor(0xf4f1e8);
    c.stroke();
  }
  c.save();
  c.translate(32, 33);
  c.rotate(-0.7);
  poly(c, [[0, -15], [4, 0], [-4, 0]]);
  paint(c, 0xe5483f, 0x601410, 1.2);
  poly(c, [[0, 15], [4, 0], [-4, 0]]);
  paint(c, 0xf4f1e8, 0x60605a, 1.2);
  c.restore();
  circle(c, 32, 33, 2.2);
  paint(c, 0xd6d9dd, 0x30343c, 1);
  hiline(c, 16, 18, 26, 12, 0xffffff, 0.55, 2);
  rrect(c, 29, 4, 6, 6, 2);
  paint(c, 0xc4c8d0, 0x30343c, 1.2);
}

function armor(c, spec) {
  const P = spec.palette;
  const slot = spec.sub;
  if (P.glow) glow(c, 32, 32, 28, P.glow, 0.35);
  const fillG = (x0, x1) => lin(c, x0, 0, x1, 0, P.light, P.dark, P.head);
  if (slot === 'kafa') {
    c.beginPath();
    c.moveTo(11, 44);
    c.quadraticCurveTo(10, 10, 32, 9);
    c.quadraticCurveTo(54, 10, 53, 44);
    c.lineTo(53, 52);
    c.lineTo(43, 52);
    c.lineTo(43, 40);
    c.lineTo(21, 40);
    c.lineTo(21, 52);
    c.lineTo(11, 52);
    c.closePath();
    paint(c, fillG(11, 53), P.edge, 2.2);
    rrect(c, 21, 28, 22, 6, 2);
    paint(c, 0x0d0f14, P.edge, 1.4);
    rrect(c, 29, 5, 6, 30, 3);
    paint(c, P.light, P.edge, 1.6);
    hiline(c, 16, 24, 24, 14, 0xffffff, 0.55, 2);
    if (P.glow) { circle(c, 32, 22, 3); paint(c, mixColor(P.glow, 0xffffff, 0.6), P.glow, 1); }
  } else if (slot === 'göğüs') {
    c.beginPath();
    c.moveTo(14, 12);
    c.lineTo(24, 8);
    c.quadraticCurveTo(32, 15, 40, 8);
    c.lineTo(50, 12);
    c.lineTo(58, 22);
    c.lineTo(49, 28);
    c.lineTo(48, 54);
    c.lineTo(16, 54);
    c.lineTo(15, 28);
    c.lineTo(6, 22);
    c.closePath();
    paint(c, fillG(6, 58), P.edge, 2.2);
    c.beginPath();
    c.moveTo(24, 12);
    c.quadraticCurveTo(32, 20, 40, 12);
    c.lineWidth = 2;
    c.strokeStyle = rgba(P.edge, 0.9);
    c.stroke();
    rrect(c, 17, 46, 30, 6, 2);
    paint(c, P.dark, P.edge, 1.4);
    circle(c, 32, 33, 5);
    paint(c, P.glow ? mixColor(P.glow, 0xffffff, 0.5) : P.light, P.edge, 1.4);
    hiline(c, 19, 24, 19, 42, 0xffffff, 0.4, 2);
  } else if (slot === 'bacak') {
    rrect(c, 12, 8, 40, 9, 3);
    paint(c, P.dark, P.edge, 2);
    [[14, 17], [34, 17]].forEach(([x]) => {
      c.beginPath();
      c.moveTo(x, 17);
      c.lineTo(x + 16, 17);
      c.lineTo(x + 14, 56);
      c.lineTo(x + 2, 56);
      c.closePath();
      paint(c, lin(c, x, 0, x + 16, 0, P.light, P.dark, P.head), P.edge, 2);
      rrect(c, x + 2, 34, 12, 8, 3);
      paint(c, P.light, P.edge, 1.4);
    });
    hiline(c, 17, 20, 17, 54, 0xffffff, 0.4, 2);
  } else {
    boots(c, { color: P.glow || P.light }, P.head);
  }
}

export const TOOL_PAINTERS = {
  pick, axe, shovel, sword, bow, arrow, shield, torch, lantern, plant, hook, glider, compass, armor, cell,
  gun: (c, s) => gun(c, s, false),
  portalgun: (c, s) => gun(c, s, true),
  boots: (c, s) => boots(c, s),
};
