/*
 * HUD için küçük dış depo.
 *
 * Motor HUD'u saniyede ~10 kez bildiriyor. Bunu sayfa state'ine yazmak tüm
 * oyun ekranını (soru paneli, menüler) her seferinde yeniden çizerdi; depo
 * sayesinde yalnızca HUD bileşeni useSyncExternalStore ile güncellenir.
 */

export const EMPTY_HUD = Object.freeze({
    score: 0,
    distance: 0,
    coins: 0,
    multiplier: 1,
    speedKmh: 0,
    magnetPct: 0,
    shield: false,
    stumbling: false,
    tick: 0,
});

const num = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
};

/*
 * Motor, render döngüsünde nesne üretmemek için aynı HUD nesnesini yeniden
 * kullanabilir: kopyalamadan saklasak anlık görüntü kimliği değişmez ve HUD
 * donardı. Değerler de burada sınırlanır.
 */
export function sanitizeHud(h) {
    if (!h || typeof h !== 'object') return EMPTY_HUD;
    return {
        score: Math.floor(num(h.score)),
        distance: Math.floor(num(h.distance)),
        coins: Math.floor(num(h.coins)),
        multiplier: Math.floor(num(h.multiplier, 1, 5)) || 1,
        speedKmh: Math.round(num(h.speedKmh, 0, 999)),
        magnetPct: Math.round(num(h.magnetPct, 0, 100)),
        shield: Boolean(h.shield),
        stumbling: Boolean(h.stumbling),
        tick: Math.floor(num(h.tick)),
    };
}

export function createHudStore(initial = EMPTY_HUD) {
    let state = initial;
    const listeners = new Set();
    return {
        get: () => state,
        set(next) {
            state = next;
            listeners.forEach((l) => l());
        },
        reset() {
            this.set(EMPTY_HUD);
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
