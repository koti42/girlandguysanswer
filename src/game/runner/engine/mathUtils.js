/*
 * Motorun saf matematik yardımcıları (three bağımsız, node'da test edilir).
 *
 * Buradaki rastgelelik YALNIZCA görsel çeşitlilik içindir (bina boyu,
 * pencere ışığı...). Simülasyonun PRNG'siyle hiçbir ilgisi yok; oyunun
 * sonucunu etkileyemez.
 */

export function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Kare hızından bağımsız yumuşak yaklaşım (üstel sönüm). */
export function damp(current, target, lambda, dt) {
    return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
}

export function easeOutCubic(t) {
    const u = 1 - clamp(t, 0, 1);
    return 1 - u * u * u;
}

export function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const u = clamp(t, 0, 1) - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
}

/** 0..1 aralığında kesir (negatiflerde de pozitif döner). */
export function fract(v) {
    return v - Math.floor(v);
}

/**
 * Tamsayı karması (lowbias32). Segment indeksinden bina/ağaç çeşidi seçmek
 * gibi "her seferinde aynı görünsün" gereken yerlerde kullanılır.
 */
export function hash32(n) {
    let x = (n | 0) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
}

/** hash32 tabanlı küçük, tohumlu üreteç: () => [0, 1). */
export function seededRandom(seed) {
    let s = hash32(seed) || 1;
    return function next() {
        s = (s + 0x6D2B79F5) >>> 0;
        return hash32(s) / 4294967296;
    };
}
