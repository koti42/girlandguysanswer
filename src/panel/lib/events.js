/**
 * Panel içi küçük olay yayını. Bir yerde şikâyet kapatılınca üst çubuktaki
 * rozet 30-60 saniye eski sayıyı gösteriyordu; artık işlem biter bitmez
 * shell'e haber gider, sayaç anında tazelenir.
 */
const listeners = new Map();

export function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
    listeners.get(event)?.forEach((fn) => {
        try { fn(payload); } catch { /* dinleyici hatası yayını bozmasın */ }
    });
}

/** Moderasyon verisi değişti (şikâyet karara bağlandı, içerik gizlendi, kullanıcı banlandı). */
export const MOD_DATA_CHANGED = 'mod:changed';
