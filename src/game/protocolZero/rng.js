/** Tohumlu, deterministik RNG (mulberry32). Testlerde tekrar üretilebilir simülasyon için. */
export function createRng(seed = Date.now()) {
    let a = (Number(seed) >>> 0) || 0x9e3779b9;
    return function rng() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** [lo, hi] aralığında rastgele reel sayı. */
export const between = (rng, lo, hi) => lo + (hi - lo) * rng();

/** Diziden rastgele öğe (boşsa undefined). */
export const pick = (rng, arr) => (arr.length ? arr[Math.floor(rng() * arr.length) % arr.length] : undefined);
