/*
 * KEŞİF eşya simgeleri — yiyecek, malzeme, değerli taş, anahtar, yedek (vektör görünüm; 64×64 uzay).
 */
import {
  poly, rrect, circle, lin, glow, paint, hiline, rotated, cssColor, rgba, mixColor, shadeColor  , groundShadow,
} from './itemIconsKit.js';

const PI = Math.PI;
const lightOf = (col) => mixColor(col, 0xffffff, 0.45);
const darkOf = (col) => shadeColor(col, 0.6);

function apple(c, spec) {
  const gold = spec.sub === 'gold';
  const col = gold ? 0xf4c940 : 0xd8322f;
  if (gold) glow(c, 32, 34, 26, 0xffd84a, 0.5);
  groundShadow(c, 57, 16);
  c.beginPath();
  c.moveTo(32, 18);
  c.bezierCurveTo(46, 8, 60, 22, 54, 38);
  c.bezierCurveTo(50, 54, 38, 58, 32, 54);
  c.bezierCurveTo(26, 58, 14, 54, 10, 38);
  c.bezierCurveTo(4, 22, 18, 8, 32, 18);
  c.closePath();
  paint(c, lin(c, 12, 14, 52, 58, lightOf(col), darkOf(col), col), darkOf(col), 2.2);
  c.beginPath();
  c.moveTo(32, 18);
  c.quadraticCurveTo(34, 10, 38, 6);
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.strokeStyle = cssColor(0x5a3a22);
  c.stroke();
  c.beginPath();
  c.ellipse(42, 10, 8, 4, -0.5, 0, PI * 2);
  paint(c, 0x6fbf4a, 0x2f6a2a, 1.4);
  hiline(c, 17, 24, 22, 17, 0xffffff, 0.6, 2.4);
}

function strawberry(c) {
  groundShadow(c, 58, 14);
  c.beginPath();
  c.moveTo(32, 58);
  c.bezierCurveTo(14, 46, 8, 28, 14, 20);
  c.bezierCurveTo(22, 14, 42, 14, 50, 20);
  c.bezierCurveTo(56, 28, 50, 46, 32, 58);
  c.closePath();
  paint(c, lin(c, 12, 16, 52, 56, 0xff6a8a, 0xb01c44, 0xe0386b), 0x6a0f28, 2.2);
  [[24, 28], [34, 26], [42, 32], [20, 38], [30, 38], [38, 42], [27, 48], [34, 52], [44, 40]].forEach((p) => {
    c.beginPath();
    c.ellipse(p[0], p[1], 1.5, 2.2, 0.3, 0, PI * 2);
    c.fillStyle = cssColor(0xf6e27a);
    c.fill();
  });
  [[-14, 0.7], [-6, 0.2], [2, -0.2], [10, -0.7], [18, -1.1]].forEach(([dx, rot]) => {
    c.save();
    c.translate(32 + dx * 0.9, 17);
    c.rotate(rot);
    c.beginPath();
    c.ellipse(0, -4, 3.2, 8, 0, 0, PI * 2);
    paint(c, 0x4fae3a, 0x1f5a1c, 1.2);
    c.restore();
  });
  hiline(c, 17, 26, 20, 36, 0xffffff, 0.5, 2.2);
}

function carrot(c) {
  groundShadow(c, 59, 14);
  rotated(c, 32, 33, PI / 4, () => {
    c.beginPath();
    c.moveTo(-7, -16);
    c.quadraticCurveTo(0, -20, 7, -16);
    c.quadraticCurveTo(8, 6, 0, 30);
    c.quadraticCurveTo(-8, 6, -7, -16);
    c.closePath();
    paint(c, lin(c, -8, 0, 8, 0, 0xffb060, 0xd8701c, 0xee8a2a), 0x7a3a0c, 2);
    [-8, -1, 6, 13].forEach((y, i) => hiline(c, -5 + i, y, 3 - i * 0.8, y + 1.6, 0xb85a10, 0.8, 1.4));
    [-1, 0, 1].forEach((k) => {
      c.beginPath();
      c.moveTo(k * 2, -17);
      c.quadraticCurveTo(k * 8, -30, k * 11, -38);
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.strokeStyle = cssColor(0x2f7a2a);
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = cssColor(0x5ab83a);
      c.stroke();
    });
  });
}

function potato(c, spec) {
  const cooked = spec.sub === 'cooked';
  const col = cooked ? 0xb88a3a : 0xc9a35a;
  groundShadow(c, 55, 18);
  c.beginPath();
  c.moveTo(10, 36);
  c.bezierCurveTo(8, 20, 24, 12, 38, 14);
  c.bezierCurveTo(54, 16, 58, 32, 52, 44);
  c.bezierCurveTo(46, 56, 22, 56, 10, 36);
  c.closePath();
  paint(c, lin(c, 10, 14, 54, 56, lightOf(col), darkOf(col), col), darkOf(col), 2.2);
  [[22, 28], [36, 38], [28, 46], [44, 26]].forEach((p) => {
    circle(c, p[0], p[1], 1.8);
    c.fillStyle = cssColor(darkOf(col));
    c.fill();
  });
  if (cooked) hiline(c, 18, 22, 30, 18, 0xfff2b0, 0.7, 3);
  else hiline(c, 16, 26, 22, 20, 0xffffff, 0.35, 2.4);
}

function drumstick(c, spec) {
  const col = spec.color;
  rotated(c, 32, 32, -PI / 4, () => {
    rrect(c, -3.5, 8, 7, 22, 3);
    paint(c, 0xf0ead8, 0x7a7466, 1.6);
    [-3.4, 3.4].forEach((x) => { circle(c, x, 31, 4.2); paint(c, 0xf0ead8, 0x7a7466, 1.6); });
    c.beginPath();
    c.moveTo(0, -30);
    c.bezierCurveTo(20, -30, 22, -2, 6, 10);
    c.lineTo(-6, 10);
    c.bezierCurveTo(-22, -2, -20, -30, 0, -30);
    c.closePath();
    paint(c, lin(c, -18, -30, 18, 10, lightOf(col), darkOf(col), col), darkOf(col), 2.2);
    hiline(c, -10, -22, -3, -26, 0xffffff, 0.5, 2.6);
  });
}

function chop(c, spec) {
  const col = spec.color;
  groundShadow(c, 56, 20);
  c.beginPath();
  c.moveTo(8, 34);
  c.bezierCurveTo(6, 14, 34, 10, 48, 20);
  c.bezierCurveTo(54, 32, 46, 48, 30, 50);
  c.bezierCurveTo(16, 50, 10, 44, 8, 34);
  c.closePath();
  paint(c, 0xf3e8de, darkOf(col), 2.2);
  c.beginPath();
  c.moveTo(12, 34);
  c.bezierCurveTo(10, 18, 32, 15, 44, 22);
  c.bezierCurveTo(48, 32, 42, 44, 30, 46);
  c.bezierCurveTo(18, 46, 14, 42, 12, 34);
  c.closePath();
  paint(c, lin(c, 12, 18, 44, 46, lightOf(col), darkOf(col), col), null);
  rrect(c, 44, 28, 14, 6, 3);
  paint(c, 0xf0ead8, 0x7a7466, 1.6);
  circle(c, 59, 26, 4);
  paint(c, 0xf0ead8, 0x7a7466, 1.4);
  circle(c, 59, 36, 4);
  paint(c, 0xf0ead8, 0x7a7466, 1.4);
}

function fish(c, spec) {
  const cooked = spec.sub === 'cooked';
  const col = spec.color;
  rotated(c, 32, 32, -0.5, () => {
    poly(c, [[-18, 0], [-30, -12], [-27, 0], [-30, 12]]);
    paint(c, darkOf(col), darkOf(col), 2);
    c.beginPath();
    c.moveTo(-20, 0);
    c.bezierCurveTo(-8, -18, 18, -16, 30, 0);
    c.bezierCurveTo(18, 14, -8, 16, -20, 0);
    c.closePath();
    paint(c, lin(c, 0, -16, 0, 14, lightOf(col), darkOf(col), col), darkOf(col), 2.2);
    c.beginPath();
    c.moveTo(-14, 4);
    c.bezierCurveTo(-4, 12, 14, 10, 24, 2);
    c.bezierCurveTo(12, 6, -4, 8, -14, 4);
    c.fillStyle = cssColor(cooked ? 0xe8c890 : 0xe8f0f6);
    c.fill();
    poly(c, [[-2, -13], [8, -22], [14, -12]]);
    paint(c, darkOf(col), darkOf(col), 1.6);
    circle(c, 21, -3, 2.6);
    paint(c, 0xffffff, 0x101015, 1.2);
    circle(c, 21.6, -3, 1.2);
    c.fillStyle = '#101015';
    c.fill();
    if (cooked) [-6, 2, 10].forEach((x) => hiline(c, x, -10, x + 3, 6, 0x6a4020, 0.7, 2));
  });
}

function bowl(c, spec) {
  c.beginPath();
  c.moveTo(6, 30);
  c.quadraticCurveTo(8, 56, 32, 56);
  c.quadraticCurveTo(56, 56, 58, 30);
  c.closePath();
  paint(c, lin(c, 6, 0, 58, 0, 0xc89860, 0x7a5028, 0xa87a45), 0x4a2c14, 2.2);
  if (spec.sub === 'soup') {
    c.beginPath();
    c.ellipse(32, 30, 26, 8, 0, 0, PI * 2);
    paint(c, lin(c, 0, 22, 0, 38, 0xd8b088, 0xa07850), 0x6a4a28, 1.8);
    [[24, 30], [34, 28], [40, 32]].forEach((p) => { circle(c, p[0], p[1], 2.6); paint(c, 0xe8e0d0, 0x8a826a, 1); });
    c.beginPath();
    c.moveTo(24, 20);
    c.quadraticCurveTo(20, 12, 25, 6);
    c.moveTo(34, 20);
    c.quadraticCurveTo(30, 12, 35, 6);
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.stroke();
  } else if (spec.sub === 'salad') {
    c.beginPath();
    c.ellipse(32, 30, 26, 8, 0, 0, PI * 2);
    paint(c, 0x6a4a28, 0x4a2c14, 1.6);
    [[16, 26, 0xf06a5a], [26, 22, 0x78c04a], [36, 22, 0xf2c91e], [46, 26, 0xe0386b], [22, 30, 0xd8322f], [32, 29, 0x78c04a], [42, 31, 0xf06a5a]].forEach((p) => {
      circle(c, p[0], p[1], 5.2);
      paint(c, lin(c, p[0], p[1] - 5, p[0], p[1] + 5, lightOf(p[2]), p[2]), darkOf(p[2]), 1.2);
    });
  } else {
    c.beginPath();
    c.ellipse(32, 30, 26, 8, 0, 0, PI * 2);
    paint(c, 0x6a4424, 0x4a2c14, 1.8);
  }
  hiline(c, 12, 38, 16, 46, 0xffffff, 0.35, 2);
}

function potion(c, spec) {
  const empty = spec.sub === 'empty';
  const col = spec.color || 0xff5a8a;
  if (!empty) glow(c, 32, 40, 26, col, 0.4);
  c.beginPath();
  c.moveTo(26, 8);
  c.lineTo(38, 8);
  c.lineTo(38, 22);
  c.bezierCurveTo(54, 28, 56, 56, 32, 58);
  c.bezierCurveTo(8, 56, 10, 28, 26, 22);
  c.closePath();
  paint(c, 'rgba(210,235,248,0.4)', 0x7a98a8, 2.2);
  if (!empty) {
    c.beginPath();
    c.moveTo(18, 40);
    c.bezierCurveTo(16, 50, 22, 56, 32, 56);
    c.bezierCurveTo(42, 56, 48, 50, 46, 40);
    c.bezierCurveTo(38, 36, 26, 44, 18, 40);
    c.closePath();
    paint(c, lin(c, 0, 36, 0, 56, lightOf(col), col), null);
  }
  rrect(c, 25, 3, 14, 8, 2);
  paint(c, 0x8a5a33, 0x4a2c14, 1.6);
  hiline(c, 18, 36, 20, 48, 0xffffff, 0.7, 2.6);
}

function stick(c) {
  groundShadow(c, 56, 14);
  rotated(c, 32, 32, PI / 4, () => {
    rrect(c, -3.2, -26, 6.4, 52, 3);
    paint(c, lin(c, -3, 0, 3, 0, 0x7a5530, 0xc99a5a, 0xa87a45), 0x4a2c14, 2);
    [-14, 6].forEach((y) => hiline(c, -3, y, 3, y + 1.4, 0x5a3a1a, 0.7, 1.4));
    circle(c, 0, -26, 3);
    paint(c, 0xd6b788, 0x6a4a28, 1.4);
  });
}

function coal(c, spec) {
  const charcoal = spec.sub === 'charcoal';
  const base = charcoal ? 0x4a423c : 0x34343a;
  groundShadow(c, 56, 18);
  poly(c, [[10, 40], [14, 22], [26, 12], [42, 14], [54, 26], [52, 44], [38, 54], [20, 52]]);
  paint(c, lin(c, 10, 12, 54, 54, mixColor(base, 0xffffff, 0.3), shadeColor(base, 0.45), base), 0x0c0c10, 2.2);
  poly(c, [[14, 22], [26, 12], [30, 28], [20, 34]]);
  paint(c, mixColor(base, 0xffffff, 0.22), null);
  poly(c, [[30, 28], [42, 14], [54, 26], [44, 34]]);
  paint(c, shadeColor(base, 0.8), null);
  hiline(c, 18, 24, 26, 18, 0xffffff, 0.35, 2);
  hiline(c, 40, 20, 48, 26, charcoal ? 0xc4a88a : 0x9a9aa8, 0.5, 1.6);
}

function raw(c, spec) {
  const col = spec.color;
  groundShadow(c, 56, 18);
  poly(c, [[8, 38], [14, 20], [28, 10], [44, 14], [56, 28], [52, 46], [36, 56], [18, 52]]);
  paint(c, lin(c, 8, 10, 56, 56, 0xa2a4ac, 0x5a5c64, 0x7e8087), 0x1c1e24, 2.2);
  [[24, 28, 7], [38, 22, 6], [44, 38, 7], [26, 44, 6], [34, 34, 5]].forEach((n) => {
    poly(c, [[n[0] - n[2], n[1]], [n[0], n[1] - n[2]], [n[0] + n[2], n[1]], [n[0], n[1] + n[2]]]);
    paint(c, lin(c, n[0] - n[2], n[1] - n[2], n[0] + n[2], n[1] + n[2], lightOf(col), darkOf(col), col), darkOf(col), 1.3);
  });
}

function ingot(c, spec) {
  const col = spec.color;
  groundShadow(c, 54, 22);
  poly(c, [[6, 38], [58, 38], [50, 20], [14, 20]]);
  paint(c, lin(c, 0, 20, 0, 38, lightOf(col), col), darkOf(col), 2.2);
  poly(c, [[6, 38], [58, 38], [58, 48], [6, 48]]);
  paint(c, lin(c, 0, 38, 0, 48, col, darkOf(col)), darkOf(col), 2.2);
  poly(c, [[18, 24], [46, 24], [50, 31], [14, 31]]);
  paint(c, lin(c, 0, 24, 0, 31, mixColor(col, 0xffffff, 0.75), lightOf(col)), null);
  hiline(c, 10, 41, 54, 41, 0xffffff, 0.35, 1.6);
}

function gem(c, spec) {
  const col = spec.color;
  glow(c, 32, 34, 28, col, 0.5);
  poly(c, [[10, 24], [20, 10], [44, 10], [54, 24], [32, 56]]);
  paint(c, lin(c, 10, 10, 54, 56, lightOf(col), darkOf(col), col), darkOf(col), 2.2);
  poly(c, [[20, 10], [26, 24], [32, 56], [10, 24]]);
  paint(c, mixColor(col, 0xffffff, 0.3), null);
  poly(c, [[44, 10], [38, 24], [32, 56], [54, 24]]);
  paint(c, shadeColor(col, 0.7), null);
  poly(c, [[26, 24], [38, 24], [32, 56]]);
  paint(c, lin(c, 0, 24, 0, 56, col, lightOf(col)), null);
  c.beginPath();
  c.moveTo(10, 24);
  c.lineTo(54, 24);
  c.moveTo(20, 10);
  c.lineTo(26, 24);
  c.moveTo(44, 10);
  c.lineTo(38, 24);
  c.lineWidth = 1.4;
  c.strokeStyle = rgba(0xffffff, 0.6);
  c.stroke();
  hiline(c, 22, 14, 30, 14, 0xffffff, 0.9, 2.4);
}

function crystal(c, spec) {
  const col = spec.color;
  glow(c, 32, 34, 28, col, 0.5);
  const shard = (x, y, w, h, tilt, lt) => {
    c.save();
    c.translate(x, y);
    c.rotate(tilt);
    poly(c, [[-w / 2, 0], [-w / 2, -h * 0.7], [0, -h], [w / 2, -h * 0.7], [w / 2, 0]]);
    paint(c, lin(c, -w / 2, 0, w / 2, 0, lt ? lightOf(col) : col, darkOf(col), col), darkOf(col), 2);
    poly(c, [[0, 0], [0, -h], [-w / 2, -h * 0.7], [-w / 2, 0]]);
    c.fillStyle = rgba(0xffffff, 0.22);
    c.fill();
    c.restore();
  };
  shard(20, 56, 14, 30, -0.35, false);
  shard(44, 56, 13, 26, 0.4, false);
  shard(32, 58, 18, 46, 0, true);
}

function dust(c, spec) {
  const col = spec.color;
  glow(c, 32, 36, 24, col, 0.35);
  groundShadow(c, 56, 20);
  c.beginPath();
  c.moveTo(8, 54);
  c.quadraticCurveTo(18, 54, 22, 40);
  c.quadraticCurveTo(28, 22, 32, 20);
  c.quadraticCurveTo(36, 22, 42, 40);
  c.quadraticCurveTo(46, 54, 56, 54);
  c.closePath();
  paint(c, lin(c, 0, 20, 0, 54, lightOf(col), darkOf(col), col), darkOf(col), 2);
  [[24, 46], [34, 40], [44, 48], [30, 30], [38, 50]].forEach((p, i) => {
    circle(c, p[0], p[1], 1.5 + (i % 2));
    c.fillStyle = rgba(0xffffff, 0.8);
    c.fill();
  });
}

function string(c) {
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.ellipse(32, 38 - i * 3.4 + 10, 22 - Math.abs(i - 2.5) * 2, 9, 0, 0, PI * 2);
    c.lineWidth = 3;
    c.strokeStyle = cssColor(i % 2 ? 0xd8d0c0 : 0xf0e8d8);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(48, 22);
  c.bezierCurveTo(60, 14, 56, 4, 46, 6);
  c.lineWidth = 3;
  c.strokeStyle = cssColor(0xf0e8d8);
  c.stroke();
}

function wool(c) {
  groundShadow(c, 56, 20);
  [[20, 38, 14], [44, 38, 14], [32, 28, 16], [26, 48, 12], [40, 48, 12], [32, 42, 14]].forEach((b) => {
    circle(c, b[0], b[1], b[2]);
    paint(c, lin(c, b[0] - b[2], b[1] - b[2], b[0] + b[2], b[1] + b[2], 0xffffff, 0xcfd2d8, 0xf2f2ee), 0x9a9ca4, 1.6);
  });
}

function leather(c, spec) {
  const col = spec.color;
  poly(c, [[8, 18], [30, 12], [56, 20], [54, 46], [34, 54], [10, 46]]);
  paint(c, lin(c, 8, 12, 56, 54, lightOf(col), darkOf(col), col), darkOf(col), 2.2);
  poly(c, [[18, 24], [38, 20], [46, 30], [40, 44], [22, 42]]);
  paint(c, lin(c, 18, 20, 46, 44, mixColor(col, 0xffe0b0, 0.3), col), null);
  [[14, 22], [50, 24], [48, 44], [14, 44]].forEach((p) => { circle(c, p[0], p[1], 1.6); c.fillStyle = cssColor(0xd8c8a0); c.fill(); });
}

function feather(c) {
  rotated(c, 32, 32, PI / 4, () => {
    c.beginPath();
    c.moveTo(0, 30);
    c.bezierCurveTo(-16, 8, -14, -20, 0, -34);
    c.bezierCurveTo(16, -20, 18, 8, 0, 30);
    c.closePath();
    paint(c, lin(c, -14, 0, 18, 0, 0xffffff, 0xcfd0d0, 0xf5f5f0), 0x8a8c90, 2);
    c.beginPath();
    c.moveTo(0, 34);
    c.lineTo(0, -32);
    c.lineWidth = 2;
    c.strokeStyle = cssColor(0xb0aca0);
    c.stroke();
    for (let i = 0; i < 6; i++) hiline(c, 0, 18 - i * 9, i % 2 ? 10 : -10, 10 - i * 9, 0xb8b4aa, 0.6, 1);
  });
}

function flint(c) {
  groundShadow(c, 56, 16);
  poly(c, [[14, 52], [10, 30], [24, 8], [36, 20], [52, 34], [44, 54]]);
  paint(c, lin(c, 10, 8, 52, 54, 0x8a8e98, 0x2a2c32, 0x55575c), 0x0c0c10, 2.2);
  poly(c, [[24, 8], [36, 20], [28, 32], [18, 26]]);
  paint(c, 0x9aa0aa, null);
  hiline(c, 26, 14, 32, 22, 0xffffff, 0.7, 2);
}

function bone(c) {
  rotated(c, 32, 32, -PI / 4, () => {
    rrect(c, -4, -22, 8, 44, 3);
    paint(c, lin(c, -4, 0, 4, 0, 0xffffff, 0xcfc8b4, 0xeeeadc), 0x7a7466, 2);
    [[-4.4, -25], [4.4, -25], [-4.4, 25], [4.4, 25]].forEach((p) => { circle(c, p[0], p[1], 5); paint(c, lin(c, p[0] - 5, 0, p[0] + 5, 0, 0xffffff, 0xd4cdb8), 0x7a7466, 1.8); });
  });
}

function clay(c, spec) {
  const col = spec.color;
  groundShadow(c, 55, 18);
  circle(c, 32, 34, 20);
  paint(c, lin(c, 14, 14, 50, 54, lightOf(col), darkOf(col), col), darkOf(col), 2.2);
  hiline(c, 20, 26, 26, 20, 0xffffff, 0.5, 2.6);
}

function brick(c, spec) {
  const col = spec.color;
  groundShadow(c, 56, 22);
  poly(c, [[6, 32], [36, 22], [58, 30], [28, 42]]);
  paint(c, lin(c, 6, 22, 58, 42, lightOf(col), col), darkOf(col), 2);
  poly(c, [[6, 32], [28, 42], [28, 54], [6, 44]]);
  paint(c, col, darkOf(col), 2);
  poly(c, [[28, 42], [58, 30], [58, 42], [28, 54]]);
  paint(c, shadeColor(col, 0.72), darkOf(col), 2);
  hiline(c, 14, 31, 34, 25, 0xffffff, 0.4, 1.6);
}

function paper(c) {
  rotated(c, 32, 32, -0.18, () => {
    rrect(c, -18, -24, 36, 48, 3);
    paint(c, lin(c, -18, -24, 18, 24, 0xffffff, 0xe0d8c0, 0xf4eedc), 0x8a826a, 2);
    for (let i = 0; i < 5; i++) hiline(c, -11, -14 + i * 8, 11 - (i % 2) * 6, -14 + i * 8, 0x8a8a90, 0.8, 1.6);
    poly(c, [[10, 24], [18, 16], [18, 24]]);
    paint(c, 0xc8c0a8, 0x8a826a, 1.2);
  });
}

function book(c, spec) {
  const col = spec.color;
  rrect(c, 12, 8, 42, 50, 4);
  paint(c, lin(c, 12, 8, 54, 58, lightOf(col), darkOf(col), col), 0x2a1408, 2.2);
  rrect(c, 12, 8, 8, 50, 3);
  paint(c, darkOf(col), 0x2a1408, 1.6);
  rrect(c, 22, 52, 30, 4, 1.5);
  paint(c, 0xf3ecd8, 0x8a7a5a, 1);
  circle(c, 36, 28, 8);
  paint(c, lin(c, 28, 20, 44, 36, 0xffe58a, 0xc2901c), 0x6a4a10, 1.4);
  hiline(c, 24, 14, 50, 14, 0xffffff, 0.3, 1.6);
}

function orb(c, spec) {
  const col = spec.color;
  glow(c, 32, 32, 30, col, 0.6);
  circle(c, 32, 32, 18);
  paint(c, lin(c, 14, 14, 50, 50, mixColor(col, 0xffffff, 0.7), darkOf(col), col), darkOf(col), 2.2);
  c.beginPath();
  c.ellipse(32, 32, 27, 8, -0.5, 0, PI * 2);
  c.lineWidth = 2.4;
  c.strokeStyle = rgba(mixColor(col, 0xffffff, 0.5), 0.95);
  c.stroke();
  hiline(c, 24, 22, 28, 18, 0xffffff, 0.9, 3);
}

function star(c) {
  glow(c, 32, 33, 30, 0xffd84a, 0.5);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2 - PI / 2;
    const r = i % 2 ? 11 : 27;
    pts.push([32 + Math.cos(a) * r, 34 + Math.sin(a) * r]);
  }
  poly(c, pts);
  paint(c, lin(c, 8, 8, 56, 56, 0xfff4b0, 0xe0a010, 0xffe066), 0x8a5a08, 2.4);
  const inner = pts.map((p) => [32 + (p[0] - 32) * 0.55, 34 + (p[1] - 34) * 0.55]);
  poly(c, inner);
  c.fillStyle = rgba(0xffffff, 0.4);
  c.fill();
}

function dye(c, spec) {
  const col = spec.color;
  glow(c, 32, 38, 22, col, 0.3);
  c.beginPath();
  c.moveTo(32, 6);
  c.bezierCurveTo(34, 20, 52, 30, 52, 42);
  c.bezierCurveTo(52, 54, 42, 58, 32, 58);
  c.bezierCurveTo(22, 58, 12, 54, 12, 42);
  c.bezierCurveTo(12, 30, 30, 20, 32, 6);
  c.closePath();
  paint(c, lin(c, 12, 6, 52, 58, lightOf(col), darkOf(col), col), darkOf(col), 2.2);
  hiline(c, 22, 38, 24, 48, 0xffffff, 0.65, 3);
}

const ZONE_KEY_COLORS = [0x7fe8ff, 0x7fffa8, 0xffb070, 0xcfe8ff, 0xd48cff];
function crystalkey(c, spec) {
  const col = ZONE_KEY_COLORS[(spec.sub || 0) % ZONE_KEY_COLORS.length];
  glow(c, 32, 32, 30, col, 0.6);
  poly(c, [[32, 2], [46, 22], [46, 42], [32, 62], [18, 42], [18, 22]]);
  paint(c, lin(c, 18, 2, 46, 62, mixColor(col, 0xffffff, 0.7), darkOf(col), col), darkOf(col), 2.2);
  poly(c, [[32, 2], [32, 62], [18, 42], [18, 22]]);
  c.fillStyle = rgba(0xffffff, 0.28);
  c.fill();
  c.beginPath();
  c.moveTo(18, 22);
  c.lineTo(46, 22);
  c.moveTo(18, 42);
  c.lineTo(46, 42);
  c.lineWidth = 1.4;
  c.strokeStyle = rgba(0xffffff, 0.6);
  c.stroke();
  c.beginPath();
  c.ellipse(32, 32, 26, 7, -0.4, 0, PI * 2);
  c.lineWidth = 2;
  c.strokeStyle = rgba(col, 0.95);
  c.stroke();
}

function keyShape(c, col, bowCol, big) {
  rotated(c, 32, 32, -PI / 4, () => {
    const s = big ? 1.15 : 1;
    c.beginPath();
    c.arc(0, -20 * s, 10 * s, 0, PI * 2);
    c.arc(0, -20 * s, 4.6 * s, 0, PI * 2, true);
    paint(c, lin(c, -10, -30, 10, -10, lightOf(bowCol), darkOf(bowCol), bowCol), darkOf(bowCol), 2);
    rrect(c, -3, -11 * s, 6, 40 * s, 2);
    paint(c, lin(c, -3, 0, 3, 0, lightOf(col), darkOf(col), col), darkOf(col), 1.8);
    [[8, 14], [6, 21], [9, 28]].forEach((t) => {
      rrect(c, 2, t[1] * s, t[0] + 2, 5, 1.5);
      paint(c, col, darkOf(col), 1.4);
    });
  });
}

function key(c, spec) {
  keyShape(c, spec.color, spec.color, false);
}
function bosskey(c, spec) {
  glow(c, 32, 32, 30, spec.color, 0.5);
  keyShape(c, 0x3a2a30, spec.color, true);
}

function flat(c, spec) {
  const col = spec.color;
  rrect(c, 10, 10, 44, 44, 9);
  paint(c, lin(c, 10, 10, 54, 54, lightOf(col), darkOf(col), col), darkOf(col), 2.4);
  rrect(c, 16, 16, 32, 32, 6);
  c.fillStyle = rgba(0xffffff, 0.14);
  c.fill();
  hiline(c, 16, 16, 30, 16, 0xffffff, 0.7, 2.6);
}

export const MISC_PAINTERS = {
  apple, strawberry, carrot, potato, drumstick, chop, fish, bowl, potion, stick, coal, raw, ingot, gem, crystal, dust,
  string, wool, leather, feather, flint, bone, clay, brick, paper, book, orb, star, dye, crystalkey, key, bosskey, flat,
};
