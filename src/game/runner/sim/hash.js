/*
 * FNV-1a 32 bit (şartname §3.6). Girdi ASCII olduğundan (rakam, '-', '|')
 * charCodeAt bir bayta karşılık gelir; desen dosyasının kanonik JSON'u gibi
 * UTF-8 metinler için fnv1aBytes kullanılır.
 */

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/** ASCII string özeti. */
export function fnv1a(str) {
    let h = FNV_OFFSET;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i) & 0xff;
        h = Math.imul(h, FNV_PRIME) >>> 0;
    }
    return h >>> 0;
}

/** Bayt dizisi (Uint8Array) özeti — dosya içeriği için. */
export function fnv1aBytes(bytes) {
    let h = FNV_OFFSET;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, FNV_PRIME) >>> 0;
    }
    return h >>> 0;
}

/**
 * Durum özeti (v2 §A.5): şu tamsayıların ondalık yazımlarının '|' ile birleşimi.
 * tick|z|x|lane|y|vy|grounded(0/1)|slideTicks|jumpBuffer|stumbleTicks|
 * invulnTicks|magnetTicks|superTicks|shield(0/1)|crashed(0/1)|coins|gates.length
 */
export function stateHash(s) {
    return fnv1a(
        s.tick + '|' + s.z + '|' + s.x + '|' + s.lane + '|' + s.y + '|' + s.vy + '|'
        + (s.grounded ? 1 : 0) + '|' + s.slideTicks + '|' + s.jumpBuffer + '|'
        + s.stumbleTicks + '|' + s.invulnTicks + '|' + s.magnetTicks + '|' + s.superTicks + '|'
        + (s.shield ? 1 : 0) + '|' + (s.crashed ? 1 : 0) + '|' + s.coins + '|' + s.gates.length,
    );
}
