/*
 * KEŞİF render — yaratık modelleri için saf matematik/yardımcılar (three yok).
 */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
/** Hex renk karışımı (sRGB bileşenleri üzerinden). */
export function lerpHex(a, b, t) {
  const ar = (a >> 16) & 255; const ag = (a >> 8) & 255; const ab = a & 255;
  const br = (b >> 16) & 255; const bg = (b >> 8) & 255; const bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
/** Üstel yumuşatma (kare süresinden bağımsız). */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
/** 0..1 kararlı sahte rastgele (sin tabanlı). */
export function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Tohumlu PRNG (mulberry32) → () => [0,1). */
export function rng(seed) {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Dize → tamsayı tohum. */
export function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}

export const DETAIL_Q = [0.55, 0.8, 1];
export const DETAIL_NAMES = ['low', 'medium', 'high'];
/** 'low'|'medium'|'high' (veya 0..2) → 0..2. Bilinmeyen → 1. */
export function detailLevel(q) {
  if (q === 0 || q === 1 || q === 2) return q;
  if (q === 'low' || q === 'düşük') return 0;
  if (q === 'high' || q === 'yüksek') return 2;
  return 1;
}
