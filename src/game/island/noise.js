/*
 * Tohumlu, deterministik değer gürültüsü (saf; node'da test edilir).
 * Adanın şekli ve renk lekeleri her açılışta aynı çıksın diye kullanılır.
 */
import { hash32 } from '../runner/engine/mathUtils.js';

function lattice(ix, iy, seed) {
    return hash32((Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) ^ Math.imul(seed | 0, 2246822519)) / 4294967296;
}

/** 0..1 aralığında yumuşak 2B değer gürültüsü. */
export function valueNoise2(x, y, seed = 0) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = lattice(ix, iy, seed);
    const b = lattice(ix + 1, iy, seed);
    const c = lattice(ix, iy + 1, seed);
    const d = lattice(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** 0..1 aralığında çok katmanlı gürültü. */
export function fbm2(x, y, seed = 0, octaves = 3) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
        sum += amp * valueNoise2(x * f, y * f, seed + i * 17);
        norm += amp;
        amp *= 0.5;
        f *= 2.03;
    }
    return sum / norm;
}

export function smoothstep(e0, e1, x) {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

export function mix(a, b, t) {
    return a + (b - a) * t;
}
