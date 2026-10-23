/*
 * KEŞİF eşya simgeleri — BÜYÜ asası ('staff'). Çizim uzayı 64×64; sol-alttan sağ-üste uzanan gövde, üstte parlayan kristal.
 * ICON_PAINTERS tablosuna itemIcons.js ekler (itemPalette.MODEL_KINDS ile birebir).
 */
import {
  poly, rrect, circle, lin, glow, paint, shadeColor, mixColor, rotated, groundShadow, hiline, OUT,
} from './itemIconsKit.js';

function paintStaff(c, spec) {
  const col = spec.color || 0xb25cff;
  groundShadow(c, 59, 14);
  // ışıma (kristalin arkası)
  glow(c, 46, 17, 24, col, 0.45);
  rotated(c, 32, 34, Math.PI / 4, () => {
    // gövde: dikey çizilir, +45° döner (üst sağ köşeye bakar)
    rrect(c, -3.4, -26, 6.8, 54, 3);
    paint(c, lin(c, -4, 0, 4, 0, 0x7c5430, 0x4a2e18, 0x5e3c20), OUT, 1.6);
    for (let i = 0; i < 5; i++) {
      rrect(c, -4.1, 10 + i * 3.6, 8.2, 2.4, 1);
      paint(c, 0x3a2a52, null);
    }
    hiline(c, -1.4, -18, -1.4, 22, 0xd2a367, 0.5, 1.2);
    // bilezikler
    rrect(c, -4.6, -17, 9.2, 3.4, 1.4);
    paint(c, lin(c, -5, 0, 5, 0, 0xe8ecf2, 0x8e949e), OUT, 1.2);
    // pençeler
    [-1, 1].forEach((s) => {
      poly(c, [[s * 3.4, -17], [s * 8.4, -31], [s * 6.2, -35], [s * 2.2, -23]]);
      paint(c, lin(c, 0, -35, 0, -17, 0xf2f4f8, 0x8e949e), OUT, 1.2);
    });
    poly(c, [[-2.2, -17], [0, -37], [2.2, -17]]);
    paint(c, lin(c, 0, -37, 0, -17, 0xe8ecf2, 0x9aa0aa), OUT, 1.2);
    // kristal
    poly(c, [[0, -44], [6.6, -31], [0, -20], [-6.6, -31]]);
    paint(c, lin(c, -6, -44, 6, -22, mixColor(col, 0xffffff, 0.55), shadeColor(col, 0.75), col), shadeColor(col, 0.4), 1.6);
    poly(c, [[0, -41], [2.6, -32], [0, -26], [-2.6, -32]]);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fill();
  });
  // kıvılcımlar
  c.fillStyle = 'rgba(255,255,255,0.9)';
  [[52, 8, 1.6], [56, 20, 1.2], [40, 6, 1.1]].forEach((p) => {
    circle(c, p[0], p[1], p[2]);
    c.fill();
  });
}

export const MAGIC_PAINTERS = { staff: paintStaff };
