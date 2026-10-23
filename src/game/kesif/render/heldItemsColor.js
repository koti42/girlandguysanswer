/*
 * Saf renk yardımcıları (0xRRGGBB tamsayıları; three/DOM yok). heldItems ve itemIcons paylaşır.
 */

/** İki rengi t (0..1) oranında karıştırır. */
export function mixColor(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Rengi f ile çarpar (karartma/aydınlatma), 255'te kırpar. */
export function shadeColor(c, f) {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

/** 0xRRGGBB → '#rrggbb'. */
export function cssColor(c) {
  return '#' + ((c & 0xffffff) | 0x1000000).toString(16).slice(1);
}

/** 0xRRGGBB → 'rgba(r,g,b,a)'. */
export function rgba(c, a) {
  return 'rgba(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ',' + a + ')';
}
