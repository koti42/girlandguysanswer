/*
 * xorshift32 (şartname §3.2). Durum her zaman 0..2^32-1 aralığında işaretsiz
 * tamsayı; `>>> 0` her adımda işaretsize çevirir. PHP karşılığı Prng.php.
 */

const ZERO_SEED = 0x6d2b79f5; // s == 0 olursa xorshift sonsuza dek 0 üretir
const CHUNK_MUL = 2654435761;

export function createPrng(seed) {
    const s = seed >>> 0;
    return { x: s === 0 ? ZERO_SEED : s };
}

export function nextU32(p) {
    let x = p.x;
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    p.x = x;
    return x;
}

/** 0..n-1 (n > 0). */
export function randInt(p, n) {
    return nextU32(p) % n;
}

/**
 * Chunk c'nin kendi akışı: üretim sırası sonucu değiştirmesin.
 * `(c * 2654435761) >>> 0` c ≤ 3.4M için tam (çarpım 2^53 altında kalır).
 */
export function chunkPrng(seed, c) {
    const p = createPrng(((seed >>> 0) ^ ((c * CHUNK_MUL) >>> 0)) >>> 0);
    for (let i = 0; i < 4; i++) nextU32(p);
    return p;
}
