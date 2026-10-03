/*
 * Ortam (saf mantık): gün/gece döngüsü ve tünel karartması.
 *
 *  - nightAmount: 0 = altın saat (gündüz), 1 = derin gece. 'auto' kipinde
 *    koşu alacakaranlıkta başlar, geceye döner, sonra altın saate açılır
 *    (mesafeye bağlı yavaş bir döngü; ani geçiş yok).
 *  - tunnelBlend: oyuncunun tünel içindeki "karanlık" payı (0..1). Girişte
 *    kademeli kararır, çıkışta açılır; gözün alışması gibi.
 *
 * Görsel çeşitlilik içindir; simülasyonu etkilemez.
 */
import { clamp, smoothstep } from './mathUtils.js';

export const DAY_CYCLE_M = 2600;
export const TIME_MODES = ['auto', 'day', 'dusk', 'night'];
const FIXED = { day: 0.08, dusk: 0.55, night: 1 };

export function normalizeTimeMode(mode) {
    return TIME_MODES.includes(mode) ? mode : 'auto';
}

/** distM: oyuncunun metre cinsinden mesafesi. */
export function nightAmount(distM, mode = 'auto') {
    const m = normalizeTimeMode(mode);
    if (m !== 'auto') return FIXED[m];
    const d = Number.isFinite(distM) && distM > 0 ? distM : 0;
    // 0 m: alacakaranlık (0.55) -> ~650 m: gece -> ~1950 m: altın saat -> 2600 m: başa
    return clamp(0.55 + 0.45 * Math.sin((d / DAY_CYCLE_M) * Math.PI * 2), 0, 1);
}

export const CHUNK_M = 30;
const RAMP_IN_M = 14;
const PRE_M = 10;

/**
 * zM: oyuncunun dünya z'si (m); isTunnel(c): chunk c tünel mi. Yalnızca
 * oyuncunun çevresindeki birkaç chunk'a bakar.
 */
export function tunnelBlend(zM, isTunnel) {
    if (!Number.isFinite(zM) || zM < 0) return 0;
    const c = Math.floor(zM / CHUNK_M);
    if (isTunnel(c)) {
        // Koşunun başlangıcı ve bitişi: en fazla 6 chunk geriye/ileriye bak.
        let s = c;
        while (s > c - 6 && isTunnel(s - 1)) s--;
        let e = c;
        while (e < c + 6 && isTunnel(e + 1)) e++;
        const dIn = zM - s * CHUNK_M;
        const dOut = (e + 1) * CHUNK_M - zM;
        const d = Math.min(dIn, dOut);
        return 0.45 + 0.55 * smoothstep(0, RAMP_IN_M, d);
    }
    // Girişe yaklaşırken hafifçe kararmaya başla.
    const next = (c + 1) * CHUNK_M;
    if (isTunnel(c + 1) && next - zM < PRE_M) return 0.45 * smoothstep(PRE_M, 0, next - zM);
    const prev = c * CHUNK_M;
    if (c > 0 && isTunnel(c - 1) && zM - prev < PRE_M) return 0.45 * smoothstep(PRE_M, 0, zM - prev);
    return 0;
}
