import { describe, expect, it } from 'vitest';
import { C, rampHeight } from './constants.js';
import { buildChunk, introRampChunk, PATTERNS, tierOf, validatePatterns } from './generator.js';

/*
 * Desen kütüphanesinin tasarım kuralları (statik, v2). Gerçek geçilebilirlik
 * kanıtı bot testleridir (passability*.test.js); bu kurallar yeni bir desen
 * eklenirken en sık yapılan hataları anında yakalar:
 *
 *  R1  Öğeler chunk içinde z ∈ [3000, 27000]; engel sonu ≤ 27000 (çarpışma
 *      yalnızca yakın chunk'lara bakar). Otobüs 8..20 m ve sonu ≤ 24000:
 *      çatıdan düşen oyuncu sonraki chunk'ın giriş engellerine havada girmesin.
 *  R2  Giriş bölgesi (z0 < 9000): yalnızca bariyer/tabela/araba, en fazla bir şerit.
 *  R3  Çıkış bölgesi (z1 > 25000): en fazla bir şerit.
 *  R4  Aynı şeritte art arda engeller:
 *        rampa → otobüs bitişik (rampanın sonu = otobüsün başı);
 *        otobüs → otobüs ≤ 1 m (vagon) ya da ≥ 12 m; otobüs → diğer ≥ 12 m
 *          (iniş alanı: 2700 mm'den düşüş VMAX'ta ≈ 11.8 m sürer; şartname ≥ 8 m);
 *        araba → araba bitişik (sıra) ya da ≥ 8 m; araba → otobüs ≤ 4 m (zincir) ya da ≥ 8 m;
 *        bariyer → tabela ≥ 22 m (z0'dan z0'a); diğer çiftler ≥ 8 m; örtüşme yok.
 *  R5  Jeton araba/otobüs/rampa içinde değil (±1 m'de yüzeyin ≥ 600 mm üstünde);
 *      yerdeki jeton bariyerin üstünde değil (±0.6 m); güçlendirme (y 900) aracın
 *      içinde ya da dibinde değil.
 *  R6  İki şeridi kapatan duvarlar (rampasız otobüs) arasında şerit geçişi payı.
 *  R7  Her şeritten girilince çıkışa ulaşılabilir (duvar = rampasız otobüs;
 *      rampalı hatta yalnızca rampanın önünden girilir; şerit değişimi 4.5 m).
 *  R8  Çatı üstünde bariyer/tabela/araba yok (otobüs ve rampa boyunca aynı şerit).
 *  R9  Her rampanın ardında aynı şeritte otobüs başlar (doğrulayıcı da bakar).
 */

const OBST = new Set(['barrier', 'bar', 'car', 'bus', 'ramp']);
const SOLID = new Set(['car', 'bus', 'ramp']);
const SWITCH_LEN = 4500; // VMAX'ta şerit değişimi ≈ 10 tick × 420 mm + pay

function depth(it) {
    if (it.t === 'bus') return it.len;
    if (it.t === 'car') return C.CAR_DEPTH;
    if (it.t === 'ramp') return C.RAMP_LEN;
    return it.t === 'barrier' ? C.BARRIER_DEPTH : C.BAR_DEPTH;
}

function obstacles(p) {
    return p.items.filter((it) => OBST.has(it.t)).map((it) => ({ ...it, z0: it.z, z1: it.z + depth(it) }));
}

function surface(o, z) {
    if (o.t === 'car') return C.CAR_TOP;
    if (o.t === 'bus') return C.BUS_TOP;
    return rampHeight(o, z);
}

function pickups(p) {
    const out = [];
    for (const it of p.items) {
        if (it.t === 'coins') {
            const base = it.base || 0;
            for (let i = 0; i < it.n; i++) {
                const y = base + (it.arc === true ? C.ARC[i < 7 ? i : 7] : C.COIN_Y_GROUND);
                out.push({ lane: it.lane, z: it.z + i * it.step, y, power: false });
            }
        } else if (it.t === 'power') {
            out.push({ lane: it.lane, z: it.z, y: C.COIN_Y_GROUND, power: true });
        }
    }
    return out;
}

/** Rampayla başlayan otobüs zincirleri (vagonlar dahil): bu otobüsler duvar değil. */
function rampChains(obs) {
    const chains = [];
    for (const r of obs.filter((o) => o.t === 'ramp')) {
        let end = r.z1;
        const lane = obs.filter((o) => o.lane === r.lane && o.t === 'bus').sort((a, b) => a.z0 - b.z0);
        for (const b of lane) if (b.z0 >= end && b.z0 - end <= 1000) end = b.z1;
        chains.push({ lane: r.lane, z0: r.z0, z1: end });
    }
    return chains;
}

function isWallAt(obs, chains, lane, z) {
    for (const o of obs) {
        if (o.t !== 'bus' || o.lane !== lane) continue;
        if (z < o.z0 - C.PLAYER_HALF_D || z >= o.z1 + C.PLAYER_HALF_D) continue;
        if (chains.some((c) => c.lane === lane && o.z0 >= c.z0 && o.z1 <= c.z1)) continue;
        return true;
    }
    return false;
}

function chainAt(chains, lane, z) {
    return chains.find((c) => c.lane === lane && z >= c.z0 - C.PLAYER_HALF_D && z < c.z1 + C.PLAYER_HALF_D) || null;
}

/**
 * R7: (şerit, z) üzerinde derinlik öncelikli arama; z adımı 250 mm. Şerit
 * değişimi: hedef şerit 4.5 m boyunca boş (duvar ya da rampa hattı yok), çıkılan
 * şerit ilk yarısında duvarsız. Dönen: çıkışa ulaşamayan başlangıç şeritleri.
 */
function unreachableLanes(p) {
    const obs = obstacles(p);
    const chains = rampChains(obs);
    const STEP = 250;
    const N = C.CHUNK_LEN / STEP;
    const W = SWITCH_LEN / STEP;
    const wall = (lane, zi) => isWallAt(obs, chains, lane, zi * STEP);
    const blocked = (lane, zi) => wall(lane, zi) || chainAt(chains, lane, zi * STEP) !== null;
    const bad = [];
    for (let start = 0; start < 3; start++) {
        const seen = new Set();
        const stack = [[start, 0]];
        let ok = false;
        while (stack.length > 0) {
            const [lane, zi] = stack.pop();
            if (zi >= N) {
                ok = true;
                break;
            }
            const key = lane * 1000 + zi;
            if (seen.has(key)) continue;
            seen.add(key);
            const ch = chainAt(chains, lane, zi * STEP);
            if (ch) {
                // Rampa hattına yalnızca önden (aynı şeritte ilerleyerek) girilir: çatı boyunca sonuna.
                stack.push([lane, Math.ceil((ch.z1 + C.PLAYER_HALF_D) / STEP)]);
                continue;
            }
            if (wall(lane, zi)) continue;
            stack.push([lane, zi + 1]);
            for (const nl of [lane - 1, lane + 1]) {
                if (nl < 0 || nl > 2) continue;
                let clear = true;
                for (let k = 0; k <= W && clear; k++) {
                    if (zi + k < N && blocked(nl, zi + k)) clear = false;
                    if (k <= W / 2 && zi + k < N && wall(lane, zi + k)) clear = false;
                }
                if (clear) stack.push([nl, zi + W]);
            }
        }
        if (!ok) bad.push(start);
    }
    return bad;
}

describe('patterns.js', () => {
    it('şema geçerli, en az 50 desen, her katmanda en az 5 desen', () => {
        expect(() => validatePatterns({ version: 2, patterns: PATTERNS })).not.toThrow();
        expect(PATTERNS.length).toBeGreaterThanOrEqual(50);
        for (let tier = 0; tier <= 4; tier++) {
            expect(PATTERNS.filter((p) => p.minTier === tier).length).toBeGreaterThanOrEqual(5);
        }
        for (const p of PATTERNS) expect(p.id).toMatch(/^[a-z0-9-]+$/);
    });

    it('v2 öğeleri: araba, rampa, çatı jetonları ve süper yaylar yaygın', () => {
        const uses = (t) => PATTERNS.filter((p) => p.items.some((it) => it.t === t)).length;
        expect(uses('block')).toBe(0);
        expect(uses('car')).toBeGreaterThanOrEqual(12);
        expect(uses('ramp')).toBeGreaterThanOrEqual(7);
        expect(uses('bus')).toBeGreaterThanOrEqual(25);
        const roofCoins = PATTERNS.filter((p) => p.items.some((it) => it.t === 'coins' && it.base === C.BUS_TOP));
        expect(roofCoins.length).toBeGreaterThanOrEqual(8);
        const superArcs = PATTERNS.filter((p) => p.items.some((it) => it.t === 'coins' && it.arc && it.base >= 1500 && it.base < C.BUS_TOP));
        expect(superArcs.length).toBeGreaterThanOrEqual(2);
    });

    it('bozuk desen dosyası reddedilir', () => {
        const ok = { t: 'barrier', lane: 1, z: 5000 };
        const bad = (items, extra = {}) => ({ version: 2, patterns: [{ id: 'x', minTier: 0, weight: 1, items, ...extra }] });
        expect(() => validatePatterns(bad([ok]))).not.toThrow();
        expect(() => validatePatterns(bad([{ ...ok, lane: 3 }]))).toThrow();
        expect(() => validatePatterns(bad([{ ...ok, z: 30000 }]))).toThrow();
        expect(() => validatePatterns(bad([{ ...ok, t: 'duvar' }]))).toThrow();
        expect(() => validatePatterns(bad([{ ...ok, t: 'block', len: 5000 }]))).toThrow();
        expect(() => validatePatterns(bad([{ t: 'bus', lane: 0, z: 1 }]))).toThrow();
        expect(() => validatePatterns(bad([{ t: 'coins', lane: 0, z: 1, n: 0, step: 1 }]))).toThrow();
        expect(() => validatePatterns(bad([{ t: 'coins', lane: 0, z: 1, n: 1, step: 1, base: -5 }]))).toThrow();
        expect(() => validatePatterns(bad([{ t: 'coins', lane: 0, z: 1, n: 1, step: 1, base: 2700 }]))).not.toThrow();
        // Rampanın ardında aynı şeritte, tam z + 6000'de otobüs olmalı.
        expect(() => validatePatterns(bad([{ t: 'ramp', lane: 1, z: 9000 }]))).toThrow(/otobüs/);
        expect(() => validatePatterns(bad([{ t: 'ramp', lane: 1, z: 9000 }, { t: 'bus', lane: 2, z: 15000, len: 8000 }]))).toThrow();
        expect(() => validatePatterns(bad([{ t: 'ramp', lane: 1, z: 9000 }, { t: 'bus', lane: 1, z: 15500, len: 8000 }]))).toThrow();
        expect(() => validatePatterns(bad([{ t: 'ramp', lane: 1, z: 9000 }, { t: 'bus', lane: 1, z: 15000, len: 8000 }]))).not.toThrow();
        expect(() => validatePatterns(bad([ok], { weight: 0 }))).toThrow();
        expect(() => validatePatterns(bad([ok], { minTier: 5 }))).toThrow();
        expect(() => validatePatterns({ version: 1, patterns: [{ id: 'x', minTier: 0, weight: 1, items: [ok] }] })).toThrow();
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
                    if (o.t === 'bus') {
                        expect(o.len).toBeGreaterThanOrEqual(8000);
                        expect(o.len).toBeLessThanOrEqual(20000);
                        expect(o.z1, 'otobüs sonu').toBeLessThanOrEqual(24000);
                    }
                }
                for (const c of pickups(p)) {
                    expect(c.z).toBeGreaterThanOrEqual(3000);
                    expect(c.z).toBeLessThanOrEqual(27000);
                }
            });

            it('R2/R3 giriş ve çıkış bölgeleri', () => {
                const entry = obs.filter((o) => o.z0 < 9000);
                for (const o of entry) expect(['barrier', 'bar', 'car'], 'girişte ' + o.t).toContain(o.t);
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
                        const gap = b.z0 - a.z1;
                        const tag = `${lane}: ${a.t}@${a.z0}→${b.t}@${b.z0}`;
                        expect(gap, tag + ' örtüşüyor').toBeGreaterThanOrEqual(0);
                        if (a.t === 'ramp') {
                            expect(b.t === 'bus' && gap === 0, tag + ' rampa ardından otobüs').toBe(true);
                        } else if (a.t === 'bus') {
                            const ok = b.t === 'bus' ? gap <= 1000 || gap >= 12000 : gap >= 12000;
                            expect(ok, tag + ' otobüs sonrası iniş alanı').toBe(true);
                        } else if (a.t === 'car' && b.t === 'car') {
                            expect(gap === 0 || gap >= 8000, tag).toBe(true);
                        } else if (a.t === 'car' && b.t === 'bus') {
                            expect(gap <= 4000 || gap >= 8000, tag).toBe(true);
                        } else if (a.t === 'barrier' && b.t === 'bar') {
                            expect(b.z0 - a.z0, tag + ' bariyer→tabela').toBeGreaterThanOrEqual(22000);
                        } else {
                            expect(gap, tag).toBeGreaterThanOrEqual(8000);
                        }
                    }
                }
            });

            it('R5 jeton ve güçlendirme yerleşimi', () => {
                for (const c of pickups(p)) {
                    for (const o of obs) {
                        if (o.lane !== c.lane) continue;
                        const near = c.z >= o.z0 - 1000 && c.z <= o.z1 + 1000;
                        if (SOLID.has(o.t) && near) {
                            expect(c.power, `güçlendirme ${o.t} yanında z=${c.z}`).toBe(false);
                            expect(c.y, `${o.t} içinde jeton z=${c.z}`).toBeGreaterThanOrEqual(surface(o, c.z) + 600);
                        } else if (o.t === 'barrier' && c.y <= 1100) {
                            expect(c.z < o.z0 - 600 || c.z > o.z1 + 600, `bariyerde jeton z=${c.z}`).toBe(true);
                        }
                    }
                }
            });

            it('R6 iki şerit kapalıyken geçiş payı', () => {
                const chains = rampChains(obs);
                const spans = [];
                for (let z = 0; z < 30000; z += 250) {
                    const shut = new Set([0, 1, 2].filter((l) => isWallAt(obs, chains, l, z)));
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

            it('R7 her şeritten çıkışa yol var', () => {
                expect(unreachableLanes(p)).toEqual([]);
            });

            it('R8 çatı üstünde engel yok', () => {
                for (const roof of obs.filter((o) => o.t === 'bus' || o.t === 'ramp')) {
                    for (const o of obs) {
                        if (o.lane !== roof.lane || o.t === 'bus' || o.t === 'ramp') continue;
                        expect(o.z1 <= roof.z0 || o.z0 >= roof.z1, `${o.t}@${o.z0} çatıda`).toBe(true);
                    }
                }
            });

            it('R9 rampanın ardında otobüs', () => {
                for (const r of obs.filter((o) => o.t === 'ramp')) {
                    expect(obs.some((b) => b.t === 'bus' && b.lane === r.lane && b.z0 === r.z1)).toBe(true);
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

describe('giriş rampası (v3)', () => {
    it('rampa-cati katman 0\'da; ilk ~30 sn\'de her koşuda bir rampa var', () => {
        const intro = PATTERNS.find((p) => p.id === C.INTRO_RAMP_PATTERN);
        expect(intro.minTier).toBe(0);
        expect(intro.items.some((it) => it.t === 'ramp')).toBe(true);
        // Katman 0 havuzunda rampalı desen var (rastgele de düşebilsin).
        expect(PATTERNS.filter((p) => p.minTier === 0 && p.items.some((it) => it.t === 'ramp')).length).toBeGreaterThanOrEqual(1);
        for (const seed of [0, 1, 2, 3, 77, 987654321, 4294967295]) {
            const c = introRampChunk(seed);
            expect(c).toBe(3 + (seed % 3));
            expect(tierOf(c)).toBe(0);
            for (const gates of [0, 1, 30]) {
                const chunk = buildChunk(seed, gates, c);
                expect(chunk.kind).toBe('normal');
                const ramps = chunk.obstacles.filter((o) => o.type === 'ramp');
                expect(ramps).toHaveLength(1);
                const bus = chunk.obstacles.find((o) => o.type === 'bus' && o.lane === ramps[0].lane);
                expect(bus.z0).toBe(ramps[0].z1);
            }
        }
    });

    it('override verilen chunk\'a giriş rampası karışmaz', () => {
        const seed = 4;
        const c = introRampChunk(seed);
        const chunk = buildChunk(seed, 30, c, () => ({ items: [{ t: 'barrier', lane: 1, z: 14000 }] }));
        expect(chunk.obstacles.map((o) => o.type)).toEqual(['barrier']);
    });
});

describe('R7 araması kendini doğrular', () => {
    it('kapana kısılmış şerit yakalanır, açık yollar geçer', () => {
        // Orta şerit 6..17 m, sol şerit 9..17 m duvar: soldan gelen orta şeride
        // ancak 1 m'den önce geçebilir ama orta şeritten de çıkamaz.
        const trap = { items: [
            { t: 'bus', lane: 1, z: 6000, len: 11000 },
            { t: 'bus', lane: 0, z: 9000, len: 8000 },
        ] };
        expect(unreachableLanes(trap)).toContain(0);
        const open = { items: [{ t: 'bus', lane: 1, z: 9000, len: 8000 }] };
        expect(unreachableLanes(open)).toEqual([]);
        // Rampalı hat tek çıkış: yalnızca önden girilir, yine de her şeritten ulaşılır.
        const ramp = { items: [
            { t: 'ramp', lane: 1, z: 9000 },
            { t: 'bus', lane: 1, z: 15000, len: 9000 },
            { t: 'bus', lane: 0, z: 9000, len: 12000 },
            { t: 'bus', lane: 2, z: 9000, len: 12000 },
        ] };
        expect(unreachableLanes(ramp)).toEqual([]);
        // Rampa çok erken başlarsa yandan yetişilemez.
        const late = { items: [
            { t: 'ramp', lane: 1, z: 1000 },
            { t: 'bus', lane: 1, z: 7000, len: 9000 },
            { t: 'bus', lane: 0, z: 1000, len: 12000 },
            { t: 'bus', lane: 2, z: 1000, len: 12000 },
        ] };
        expect(unreachableLanes(late)).toEqual([0, 2]);
    });
});
