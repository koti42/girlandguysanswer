/*
 * KEŞİF duyuru süreleri (saf): dokunmatik duyuru yığını üst-orta bölgeyi tuttuğu için daha kısa kalır;
 * erişilebilirlik modunda okumak için uzun. Masaüstü değerleri eskisiyle aynıdır.
 */
export const TOAST_MS = 5200;
export const QUIET_MS = 2400;
export const TOUCH_TOAST_MS = 3800;
export const TOUCH_QUIET_MS = 1800;
export const A11Y_TOAST_MS = 8000;

/** Duyurunun ekranda kalma süresi (ms). */
export function toastDuration(item, { touch = false, a11y = false } = {}) {
  if (a11y) return A11Y_TOAST_MS;
  if (touch) return item && item.quiet ? TOUCH_QUIET_MS : TOUCH_TOAST_MS;
  return item && item.quiet ? QUIET_MS : TOAST_MS;
}
