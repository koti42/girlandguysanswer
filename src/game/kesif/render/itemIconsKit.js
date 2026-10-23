/*
 * KEŞİF eşya simgesi çizim yardımcıları (canvas 2D bağlamı alır; DOM'a doğrudan dokunmaz).
 * Çizim uzayı 64×64 sanal birimdir; ana modül bağlamı size/64 ile ölçekler.
 */
import { cssColor, rgba, mixColor, shadeColor } from './heldItemsColor.js';

export { cssColor, rgba, mixColor, shadeColor };

/** Çokgen yolu açar (kapatır). */
export function poly(c, pts) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}

/** Yuvarlatılmış dikdörtgen yolu. */
export function rrect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr);
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr);
  c.quadraticCurveTo(x, y, x + rr, y);
  c.closePath();
}

export function circle(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}

/** Doğrusal gradyan (renkler 0xRRGGBB). */
export function lin(c, x0, y0, x1, y1, a, b, mid) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, cssColor(a));
  if (mid !== undefined) g.addColorStop(0.5, cssColor(mid));
  g.addColorStop(1, cssColor(b));
  return g;
}

/** Işıma (radyal, saydam): merkez rengi, yarıçap. */
export function glow(c, x, y, r, col, a = 0.55) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Dolgu + çerçeve. Mevcut yolu doldurur ve çizer. */
export function paint(c, fill, stroke, lw = 2) {
  c.fillStyle = typeof fill === 'number' ? cssColor(fill) : fill;
  c.fill();
  if (stroke !== null && stroke !== undefined) {
    c.lineWidth = lw;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = typeof stroke === 'number' ? cssColor(stroke) : stroke;
    c.stroke();
  }
}

/** İnce parlak vurgu çizgisi. */
export function hiline(c, x0, y0, x1, y1, col = 0xffffff, a = 0.55, lw = 1.6) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.strokeStyle = rgba(col, a);
  c.stroke();
}

/** Çizimi (cx,cy) merkezli, açıyla döndürülmüş yerel uzayda yapar. */
export function rotated(c, cx, cy, ang, fn) {
  c.save();
  c.translate(cx, cy);
  c.rotate(ang);
  fn();
  c.restore();
}

/** Yumuşak zemin gölgesi (eşya altı). */
export function groundShadow(c, y = 58, w = 20) {
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath();
  c.ellipse(32, y, w, 3.4, 0, 0, Math.PI * 2);
  c.fill();
}

export const OUT = 0x20222a; // genel çerçeve rengi
