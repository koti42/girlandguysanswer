/*
 * Ada sahnesi görünüm kaydırması (saf; three yok, node'da sınanır).
 *
 * Telefonda bilgi kartı alt sayfa olarak sahnenin büyük kısmını kaplar. Motor,
 * ada merkezini kartın üstündeki görünür bölgenin ortasına kaydırır ve (ada
 * sığsın diye) kamerayı o bölgeye göre uzaklaştırır.
 *
 *  y = ada merkezinin yukarı kayma oranı (sahne yüksekliğinin kesri). Kart
 *      alttan c kesrini kaplıyorsa görünür bölge 1 - c, ortası 0.5 - c/2:
 *      y = c / 2 ve görünür kesir v = 1 - 2y.
 */

/** En çok yüksekliğin %36'sı: görünür bölge hiçbir zaman %28'in altına inmez. */
export const MAX_VIEW_OFFSET = 0.36;

/** Geçişin zaman sabiti (sn); ~0.4 sn'de oturur. */
export const VIEW_OFFSET_TAU = 0.12;

const EPS = 0.0008;

/** Geçersiz/negatif/NaN -> 0; üst sınır MAX_VIEW_OFFSET. */
export function clampViewOffset(y) {
    const n = Number(y);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(MAX_VIEW_OFFSET, n);
}

/** Adanın sığması gereken görünür yükseklik kesri. */
export function visibleFraction(y) {
    return 1 - 2 * clampViewOffset(y);
}

/**
 * Kartın kapladığı alandan kaydırma oranı.
 * coveredPx: sahnenin altından kartın üst kenarına kadar yükseklik; heightPx: sahne yüksekliği.
 */
export function coverToViewOffset(coveredPx, heightPx) {
    const c = Number(coveredPx);
    const h = Number(heightPx);
    if (!Number.isFinite(c) || !Number.isFinite(h) || h <= 0 || c <= 0) return 0;
    return clampViewOffset(Math.min(1, c / h) / 2);
}

/**
 * Üstel yumuşatma: cur -> target. immediate ya da dt <= 0 değilse anında
 * hedefe atlar (azaltılmış hareket). Hedefe EPS'den yakınsa tam hedefi döndürür
 * (döngü sonsuza kadar sürmesin).
 */
export function stepViewOffset(cur, target, dt, { immediate = false, tau = VIEW_OFFSET_TAU } = {}) {
    const to = clampViewOffset(target);
    if (immediate) return to;
    const from = Number.isFinite(cur) ? cur : 0;
    if (!(dt > 0)) return from;
    const k = 1 - Math.exp(-Math.min(dt, 0.25) / Math.max(1e-3, tau));
    const next = from + (to - from) * k;
    return Math.abs(to - next) < EPS ? to : next;
}
