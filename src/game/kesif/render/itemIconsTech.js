/*
 * KEŞİF eşya simgeleri — TEKNOLOJİ cihazları: 'jetpack' ve 'scanner'. Çizim uzayı 64×64. ICON_PAINTERS tablosuna itemIcons.js ekler
 * (itemPalette.MODEL_KINDS ile birebir).
 */
import {
  poly, rrect, circle, lin, glow, paint, shadeColor, mixColor, groundShadow, hiline, OUT,
} from './itemIconsKit.js';

/** Jetpack: iki turuncu yakıt silindiri + gri sırt çerçevesi + mavi alev uçları. */
function paintJetpack(c, spec) {
  const col = spec.color || 0xff9a3a;
  groundShadow(c, 59, 17);
  glow(c, 32, 50, 20, 0x8fd8ff, 0.35);
  // sırt çerçevesi
  rrect(c, 21, 14, 22, 34, 6);
  paint(c, lin(c, 21, 0, 43, 0, 0x6a7482, 0x39414d, 0x525b69), OUT, 1.8);
  // iki silindir
  [[14, 'L'], [36, 'R']].forEach(([x]) => {
    rrect(c, x, 10, 14, 38, 7);
    paint(c, lin(c, x, 0, x + 14, 0, shadeColor(col, 1.15), shadeColor(col, 0.6), col), shadeColor(col, 0.35), 1.8);
    rrect(c, x + 2.5, 14, 4, 26, 2);
    c.fillStyle = 'rgba(255,255,255,0.42)';
    c.fill();
    // bantlar
    [20, 31].forEach((y) => {
      rrect(c, x - 0.5, y, 15, 3, 1.2);
      paint(c, 0x2a303a, null);
    });
    // lüle
    poly(c, [[x + 2, 48], [x + 12, 48], [x + 10, 54], [x + 4, 54]]);
    paint(c, lin(c, x, 0, x + 14, 0, 0xa8b2c2, 0x4a5262), OUT, 1.4);
    // alev
    poly(c, [[x + 4, 54], [x + 10, 54], [x + 7, 62]]);
    paint(c, lin(c, 0, 54, 0, 62, 0xffffff, 0x4ab0ff), null);
    glow(c, x + 7, 56, 7, 0x6fc8ff, 0.7);
  });
  // üst bağlantı + gösterge
  rrect(c, 26, 8, 12, 8, 3);
  paint(c, lin(c, 0, 8, 0, 16, 0xb8c2d2, 0x5a6474), OUT, 1.4);
  circle(c, 32, 30, 3.4);
  paint(c, mixColor(0x7affea, 0xffffff, 0.45), 0x0c4a40, 1.2);
  hiline(c, 24, 18, 24, 44, 0xffffff, 0.25, 1.2);
}

/** Tarayıcı: elde tutulan cihaz — gövde, parlak ekranda halka ve noktalar, anten. */
function paintScanner(c, spec) {
  const col = spec.color || 0x5ad7ff;
  groundShadow(c, 59, 14);
  glow(c, 32, 30, 24, col, 0.32);
  // anten
  poly(c, [[43, 12], [46, 12], [46, 24], [43, 24]]);
  paint(c, 0x8e98a8, OUT, 1.2);
  circle(c, 44.5, 11, 3);
  paint(c, mixColor(col, 0xffffff, 0.6), shadeColor(col, 0.5), 1.2);
  // gövde
  rrect(c, 14, 20, 36, 38, 7);
  paint(c, lin(c, 14, 0, 50, 0, 0x4a5362, 0x232933, 0x353d4a), OUT, 2);
  // ekran
  rrect(c, 18, 24, 28, 22, 4);
  paint(c, lin(c, 0, 24, 0, 46, 0x0b2a3a, 0x061620), 0x0a1a24, 1.6);
  c.save();
  c.beginPath();
  c.rect(18, 24, 28, 22);
  c.clip();
  [4.5, 8.5, 12.5].forEach((r, i) => {
    c.beginPath();
    c.arc(32, 35, r, 0, Math.PI * 2);
    c.lineWidth = 1.3;
    c.strokeStyle = `rgba(122, 255, 234, ${0.85 - i * 0.22})`;
    c.stroke();
  });
  c.beginPath();
  c.moveTo(32, 35);
  c.lineTo(42, 28);
  c.lineWidth = 1.6;
  c.strokeStyle = 'rgba(190, 255, 245, 0.95)';
  c.stroke();
  [[26, 31], [38, 40], [29, 41]].forEach((p) => {
    circle(c, p[0], p[1], 1.5);
    c.fillStyle = '#ffe27a';
    c.fill();
  });
  c.restore();
  // düğmeler
  [[22, 52], [32, 52], [42, 52]].forEach((p, i) => {
    circle(c, p[0], p[1], 2.4);
    paint(c, i === 1 ? mixColor(col, 0xffffff, 0.4) : 0x7a8496, OUT, 1.1);
  });
  hiline(c, 17, 22, 47, 22, 0xffffff, 0.3, 1.2);
}

export const TECH_PAINTERS = { jetpack: paintJetpack, scanner: paintScanner };
