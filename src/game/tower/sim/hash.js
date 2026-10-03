/*
 * FNV-1a 32 bit durum özeti (şartname §B.1). Girdi ASCII (rakam, harf, '-',
 * '|') olduğundan charCodeAt bir bayta karşılık gelir.
 * PHP: h = 2166136261; her bayt için h ^= b; h = (h * 16777619) & 0xFFFFFFFF.
 */

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function fnv1a(str) {
    let h = FNV_OFFSET;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i) & 0xff;
        h = Math.imul(h, FNV_PRIME) >>> 0;
    }
    return h >>> 0;
}

/**
 * Şu değerlerin ondalık yazımlarının '|' ile birleşimi:
 * tick|phase|floor|x0|x1|z0|z1|combo|basePoints|qIndex|crashed(0/1)
 * phase metin olarak girer ('spawn' | 'moving' | 'question' | 'over');
 * x0..z1 son yerleşen katın aralıkları (şartnamedeki L0|R0|L1|R1).
 */
export function towerStateHash(s) {
    const p = s.prev;
    return fnv1a(
        s.tick + '|' + s.phase + '|' + s.floor + '|' + p.x0 + '|' + p.x1 + '|' + p.z0 + '|' + p.z1 + '|'
        + s.combo + '|' + s.basePoints + '|' + s.qIndex + '|' + (s.crashed ? 1 : 0),
    );
}
