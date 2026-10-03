import { describe, expect, it } from 'vitest';
import { C, createSim, tierOf } from './index.js';
import { PATTERNS } from './generator.js';
import { runBot } from './bot.js';

/*
 * Zor bölge ve desen sınırları (şartname §3.9): VMAX'ta (startTick 19200)
 * katman 4 bölgesinden başlayan koşular ve her desenin tek başına / zor
 * desenlerin ikili birleşimlerinin chunk sınırında geçilebilirliği.
 * debug seçenekleri yalnızca testler içindir (pist içeriği aynı kurallarla üretilir).
 */

const VMAX_TICK = (C.VMAX - C.V0) * C.SPEED_STEP_TICKS; // 19200
const FILLER = PATTERNS.findIndex((p) => p.id === 'jeton-hatti');

function clean(r) {
    return !r.crashed && r.stumbles === 0 && r.shieldBreaks === 0;
}

describe('katman 4 bölgesi, VMAX', () => {
    it('chunk 100\'den itibaren 4 km, 10 seed', () => {
        expect(tierOf(100)).toBe(4);
        const bad = [];
        for (let i = 0; i < 10; i++) {
            const seed = (0x9e3779b9 * (i + 1)) >>> 0;
            const startZ = 100 * C.CHUNK_LEN;
            const sim = createSim({ seed, gateCount: 0, debug: { startTick: VMAX_TICK, startZ } });
            const r = runBot(sim, { untilZ: startZ + 4000000, botSeed: i });
            expect(sim.speed()).toBe(C.VMAX);
            if (!clean(r) || sim.state.z < startZ + 4000000) bad.push({ seed, z: sim.state.z, ...r });
        }
        expect(bad).toEqual([]);
    }, 120000);

    it('30 dk sınırında (MAX_TICKS) bot ve simülasyon durur', () => {
        const startTick = C.MAX_TICKS - 300;
        const sim = createSim({ seed: 77, gateCount: 0, debug: { startTick, startZ: 300 * C.CHUNK_LEN } });
        const r = runBot(sim, { botSeed: 1 });
        expect(r.crashed).toBe(false);
        expect(sim.state.tick).toBe(C.MAX_TICKS);
    }, 30000);
});

describe('desen sınırları', () => {
    // A chunk 2'de, B chunk 3'te; öncesi ve sonrası engelsiz. opts: { lane,
    // power, lazy } — lazy: bot şerit seçmez (yalnızca gerektiğinde kaçar),
    // desene `lane` şeridinden girer ve rampalara kendiliğinden tırmanmaz.
    function pair(a, ma, b, mb, startTick, opts = {}) {
        const override = (c) => {
            if (c === 2) return { pattern: a, mirror: ma, power: opts.power || null };
            if (c === 3) return { pattern: b, mirror: mb };
            return { pattern: FILLER };
        };
        const startZ = opts.lazy ? 2 * C.CHUNK_LEN - 1000 : 20000;
        const sim = createSim({ seed: 7, gateCount: 0, debug: { startTick, startZ, startLane: opts.lane ?? 1, override } });
        const r = runBot(sim, opts.lazy
            ? { untilZ: 4 * C.CHUNK_LEN + 5000, botSeed: 3, homeLane: -1, roofs: false, chase: false }
            : { untilZ: 4 * C.CHUNK_LEN + 5000, botSeed: 3 });
        return clean(r) && sim.state.z >= 4 * C.CHUNK_LEN + 5000;
    }

    it('her desene her şeritten girilerek (kendiliğinden şerit seçmeden) geçilir', () => {
        const bad = [];
        for (let a = 0; a < PATTERNS.length; a++) {
            for (const m of [false, true]) {
                for (const t of [0, VMAX_TICK]) {
                    for (const lane of [0, 1, 2]) {
                        if (!pair(a, m, FILLER, false, t, { lane, lazy: true })) {
                            bad.push(PATTERNS[a].id + (m ? '*' : '') + '@' + t + '/' + lane);
                        }
                    }
                }
            }
        }
        expect(bad).toEqual([]);
    }, 120000);

    it('Süper Zıplama varken her desen V0 ve VMAX\'ta geçilir', () => {
        const bad = [];
        for (let a = 0; a < PATTERNS.length; a++) {
            if (!PATTERNS[a].items.some((it) => it.t === 'power')) continue;
            for (const m of [false, true]) {
                for (const t of [0, VMAX_TICK]) {
                    if (!pair(a, m, FILLER, false, t, { power: 'superjump' })) bad.push(PATTERNS[a].id + (m ? '*' : '') + '@' + t);
                }
            }
        }
        expect(bad).toEqual([]);
    }, 120000);

    it('her desen (iki yönüyle) V0, orta hız ve VMAX\'ta tek başına geçilir', () => {
        const bad = [];
        for (let a = 0; a < PATTERNS.length; a++) {
            for (const m of [false, true]) {
                for (const t of [0, 9000, VMAX_TICK]) {
                    if (!pair(a, m, FILLER, false, t)) bad.push(PATTERNS[a].id + (m ? '*' : '') + '@' + t);
                }
            }
        }
        expect(bad).toEqual([]);
    }, 120000);

    it('katman ≥ 3 desenlerin tüm ikili birleşimleri VMAX\'ta geçilir', () => {
        const hard = [];
        for (let i = 0; i < PATTERNS.length; i++) if (PATTERNS[i].minTier >= 3) hard.push(i);
        expect(hard.length).toBeGreaterThanOrEqual(10);
        const bad = [];
        for (const a of hard) {
            for (const b of hard) {
                for (const ma of [false, true]) {
                    for (const mb of [false, true]) {
                        if (!pair(a, ma, b, mb, VMAX_TICK)) {
                            bad.push(PATTERNS[a].id + (ma ? '*' : '') + '→' + PATTERNS[b].id + (mb ? '*' : ''));
                        }
                    }
                }
            }
        }
        expect(bad).toEqual([]);
    }, 180000);
});
