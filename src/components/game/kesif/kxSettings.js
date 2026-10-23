/*
 * KEŞİF oyun içi ayarlar: şema, varsayılanlar ve temizleme (saf mantık).
 * Menü (PauseSettings) bu şemayla çizilir; oturum `onChange(patch)` ile uygular/saklar.
 */

export const QUALITY_CHOICES = Object.freeze([
  Object.freeze({ value: 'auto', label: 'Otomatik' }),
  Object.freeze({ value: 'low', label: 'Düşük' }),
  Object.freeze({ value: 'medium', label: 'Orta' }),
  Object.freeze({ value: 'high', label: 'Yüksek' }),
]);

/** Sayısal ayar aralıkları: [min, max, adım]. */
export const SETTING_RANGES = Object.freeze({
  sensitivity: Object.freeze([0.2, 3, 0.05]),
  fov: Object.freeze([55, 100, 1]),
  viewDist: Object.freeze([3, 10, 1]),
  joystickScale: Object.freeze([0.6, 1.6, 0.1]),
  buttonOpacity: Object.freeze([0.3, 1, 0.05]),
});

export const DEFAULT_KESIF_SETTINGS = Object.freeze({
  sensitivity: 1,
  invertY: false,
  fov: 70,
  viewDist: 7,
  quality: 'auto',
  muted: false,
  music: true,
  haptics: true,
  easy: false,
  leftHanded: false,
  gyro: false,
  joystickScale: 1,
  buttonOpacity: 0.78,
  crouchToggle: false,
  accessibility: false,
});

const BOOL_KEYS = ['invertY', 'muted', 'music', 'haptics', 'easy', 'leftHanded', 'gyro', 'crouchToggle', 'accessibility'];

function rangeVal(key, v, def) {
  const r = SETTING_RANGES[key];
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return def;
  const c = Math.min(r[1], Math.max(r[0], n));
  const steps = Math.round((c - r[0]) / r[2]);
  const out = r[0] + steps * r[2];
  return Math.round(out * 1000) / 1000;
}

/** Ham nesneden temiz ayarlar; eksikler `base`ten (yoksa varsayılandan) gelir, bilinmeyenler atılır. */
export function normalizeKesifSettings(raw, base = DEFAULT_KESIF_SETTINGS) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const b = base || DEFAULT_KESIF_SETTINGS;
  const out = {};
  Object.keys(SETTING_RANGES).forEach((k) => {
    out[k] = Object.prototype.hasOwnProperty.call(r, k) ? rangeVal(k, r[k], b[k]) : b[k];
  });
  BOOL_KEYS.forEach((k) => {
    out[k] = typeof r[k] === 'boolean' ? r[k] : b[k];
  });
  out.quality = QUALITY_CHOICES.some((q) => q.value === r.quality) ? r.quality : b.quality;
  return out;
}

/** Tek bir ayar yamasını temizler (yalnız bilinen anahtarlar; geçersiz değerler atılır). */
export function sanitizePatch(patch) {
  const p = patch && typeof patch === 'object' ? patch : {};
  const out = {};
  Object.keys(SETTING_RANGES).forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(p, k)) {
      const v = rangeVal(k, p[k], null);
      if (v !== null) out[k] = v;
    }
  });
  BOOL_KEYS.forEach((k) => {
    if (typeof p[k] === 'boolean') out[k] = p[k];
  });
  if (QUALITY_CHOICES.some((q) => q.value === p.quality)) out.quality = p.quality;
  return out;
}

/** Panoya metin kopyalar (Clipboard API, olmazsa gizli textarea); başarıyı döner. */
export async function copyText(text) {
  const t = String(text == null ? '' : text);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    // izin verilmedi; yedek yola geç
  }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}
