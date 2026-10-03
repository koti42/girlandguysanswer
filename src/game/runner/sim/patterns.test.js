import { describe, expect, it } from 'vitest';
import { C } from './constants.js';
import { PATTERNS, validatePatterns } from './generator.js';

/*
 * Desen kütüphanesinin tasarım kuralları (statik). Gerçek geçilebilirlik
 * kanıtı bot testleridir (passability.test.js); bu kurallar yeni bir desen
 * eklenirken en sık yapılan hataları anında yakalar:
 *
 *  R1  Öğeler chunk içinde z ∈ [3000, 27000]; blok sonu ≤ 27000. Engeller
 *      chunk sınırını aşmaz (çarpışma yalnızca yakın chunk'lara bakar).
 *  R2  Giriş bölgesi (z0 < 9000): yalnızca bariyer/tabela, en fazla bir şerit.
 *      Önceki desenden hangi şeritte gelinirse gelinsin yer değiştirmeye yer kalsın.
 *  R3  Çıkış bölgesi (z1 > 25000): en fazla bir şerit.
 *  R4  Aynı şeritte art arda engeller: bariyer → tabela arası ≥ 22 m (havada
 *      kalma 40 tick × 420 ≈ 16.8 m + pay); diğer çiftlerde boşluk ≥ 8 m.
 *  R5  Jeton/güçlendirme blok içinde ya da dibinde değil (±1 m); yerdeki jeton
 *      ve güçlendirme bariyerin üstünde değil (±0.6 m).
 *  R6  İki şeridi kapatan bloklar arasında şerit geçişi için ≥ 8 m.
 */

const OBST = new Set(['barrier', 'bar', 'block']);

function depth(it) {
    if (it.t === 'block') return it.len;
    return it.t === 'barrier' ? C.BARRIER_DEPTH : C.BAR_DEPTH;
}

function obstacles(p) {
    return p.items.filter((it) => OBST.has(it.t)).map((it) => ({ ...it, z0: it.z, z1: it.z + depth(it) }));
}

function pickups(p) {
    const out = [];
    for (const it of p.items) {
        if (it.t === 'coins') {
            for (let i = 0; i < it.n; i++) out.push({ lane: it.lane, z: it.z + i * it.step, ground: it.arc !== true });
        } else if (it.t === 'power') {
            out.push({ lane: it.lane, z: it.z, ground: true });
        }
    }
    return out;
}

describe('patterns.json', () => {
    it('şema geçerli, en az 30 desen, her katmanda yeni desen', () => {
        expect(() => validatePatterns({ version: 1, patterns: PATTERNS })).not.toThrow();
        expect(PATTERNS.length).toBeGreaterThanOrEqual(30);
        for (let tier = 0; tier <= 4; tier++) {
            expect(PATTERNS.filter((p) => p.minTier === tier).length).toBeGreaterThanOrEqual(5);
        }
        for (const p of PATTERNS) expect(p.id).toMatch(/^[a-z0-9-]+$/);
    });

    it('bozuk desen dosyası reddedilir', () => {
        const ok = { t: 'barrier', lane: 1, z: 5000 };
        const bad = (items, extra = {}) => ({ version: 1, patterns: [{ id: 'x', minTier: 0, weight: 1, items, ...extra }] });
        expect(() => validatePatterns(bad([ok]))).not.toThrow();
        expect(() => validatePatterns(bad([{ ...ok, lane: 3 }]))).toThrow();
        expect(() => validatePatterns(bad([{ ...ok, z: 30000 }]))).toThrow();
        expect(() => validatePatterns(bad([{ ...ok, t: 'duvar' }]))).toThrow();
        expect(() => validatePatterns(bad([{ t: 'block', lane: 0, z: 1 }]))).toThrow();
        expect(() => validatePatterns(bad([{ t: 'coins', lane: 0, z: 1, n: 0, step: 1 }]))).toThrow();
        expect(() => validatePatterns(bad([ok], { weight: 0 }))).toThrow();
        expect(() => validatePatterns(bad([ok], { minTier: 5 }))).toThrow();
        expect(() => validatePatterns({ version: 2, patterns: [] })).toThrow();
        const dup = bad([ok]);
        dup.patterns.push({ ...dup.patterns[0] });
        expect(() => validatePatterns(dup)).toThrow();
    });

    it('her desende en fazla bir güçlendirme yuvası ve çoğunda var', () => {
        let withSlot = 0;
        for (const p of PATTERNS) {
            const n = p.items.filter((it) => it.t === 'power').length;
            expect(n, p.id).toBeLessThanOrEqual(1);
            if (n === 1) withSlot++;
        }
        expect(withSlot).toBeGreaterThanOrEqual(PATTERNS.length - 3);
    });

    for (const p of PATTERNS) {
        describe(p.id, () => {
            const obs = obstacles(p);

            it('R1 chunk içinde', () => {
                for (const it of p.items) {
                    expect(it.z).toBeGreaterThanOrEqual(3000);
                    expect(it.z).toBeLessThanOrEqual(27000);
                }
                for (const o of obs) {
                    expect(o.z1).toBeLessThanOrEqual(27000);
                    if (o.t === 'block') {
                        expect(o.len).toBeGreaterThanOrEqual(4000);
                        expect(o.len).toBeLessThanOrEqual(16000);
                    }
                }
                for (const c of pickups(p)) {
                    expect(c.z).toBeGreaterThanOrEqual(3000);
                    expect(c.z).toBeLessThanOrEqual(27000);
                }
            });

            it('R2/R3 giriş ve çıkış bölgeleri', () => {
                const entry = obs.filter((o) => o.z0 < 9000);
                for (const o of entry) expect(o.t, 'girişte blok').not.toBe('block');
                expect(new Set(entry.map((o) => o.lane)).size).toBeLessThanOrEqual(1);
                const exit = obs.filter((o) => o.z1 > 25000);
                expect(new Set(exit.map((o) => o.lane)).size).toBeLessThanOrEqual(1);
            });

            it('R4 aynı şeritte aralıklar', () => {
                for (let lane = 0; lane < 3; lane++) {
                    const list = obs.filter((o) => o.lane === lane).sort((a, b) => a.z0 - b.z0);
                    for (let i = 1; i < list.length; i++) {
                        const a = list[i - 1];
                        const b = list[i];
                        if (a.t === 'barrier' && b.t === 'bar') {
                            expect(b.z0 - a.z0, `${lane}: bariyer→tabela`).toBeGreaterThanOrEqual(22000);
                        } else {
                            expect(b.z0 - a.z1, `${lane}: ${a.t}→${b.t}`).toBeGreaterThanOrEqual(8000);
                        }
                    }
                }
            });

            it('R5 jeton ve güçlendirme yerleşimi', () => {
                for (const c of pickups(p)) {
                    for (const o of obs) {
                        if (o.lane !== c.lane) continue;
                        if (o.t === 'block') {
                            expect(c.z < o.z0 - 1000 || c.z > o.z1 + 1000, `blokta jeton z=${c.z}`).toBe(true);
                        } else if (o.t === 'barrier' && c.ground) {
                            expect(c.z < o.z0 - 600 || c.z > o.z1 + 600, `bariyerde jeton z=${c.z}`).toBe(true);
                        }
                    }
                }
            });

            it('R6 iki şerit kapalıyken geçiş payı', () => {
                // z ekseninde iki şeridin bloklarla kapalı olduğu aralıkları bul.
                const blocks = obs.filter((o) => o.t === 'block');
                const spans = [];
                for (let z = 0; z < 30000; z += 250) {
                    const shut = new Set(blocks.filter((o) => z >= o.z0 && z < o.z1).map((o) => o.lane));
                    if (shut.size === 3) throw new Error(`${p.id}: üç şerit birden kapalı (z=${z})`);
                    const key = shut.size === 2 ? [0, 1, 2].find((l) => !shut.has(l)) : -1;
                    const last = spans[spans.length - 1];
                    if (last && last.key === key) last.z1 = z + 250;
                    else spans.push({ key, z0: z, z1: z + 250 });
                }
                const forced = spans.filter((s) => s.key >= 0);
                for (let i = 1; i < forced.length; i++) {
                    const a = forced[i - 1];
                    const b = forced[i];
                    if (a.key !== b.key) {
                        const gap = b.z0 - a.z1;
                        expect(gap, `${a.key}→${b.key}`).toBeGreaterThanOrEqual(Math.abs(a.key - b.key) === 2 ? 16000 : 8000);
                    }
                }
            });
        });
    }
});

describe('katman dağılımı', () => {
    it('üst katmanlarda zor desenlerin payı artar', () => {
        const share = (tier) => {
            const pool = PATTERNS.filter((p) => p.minTier <= tier);
            const total = pool.reduce((a, p) => a + p.weight, 0);
            const hard = pool.filter((p) => p.minTier >= 2).reduce((a, p) => a + p.weight, 0);
            return hard / total;
        };
        expect(share(1)).toBe(0);
        expect(share(2)).toBeGreaterThan(0.3);
        expect(share(4)).toBeGreaterThan(share(2));
        expect(share(4)).toBeGreaterThan(0.55);
    });
});
