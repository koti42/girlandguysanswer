import { describe, expect, it } from 'vitest';
import { TC, createTowerSim, replayTower } from './index.js';
import { runTowerBot } from './bot.js';

/*
 * Bot testleri: mükemmel bot uzun kuleyi kurabilmeli (oyun her hızda
 * kusursuz oynanabilir), rastgele ve geç kalan bot kaybetmeli. "İnsan" botu
 * zorluk eğrisini korur: ilk 10 kat rahat, 30-60 gergin, 100+ ustalık.
 */

describe('mükemmel bot', () => {
    it('≥ 300 kat, her kat mükemmel, 20 soru cevaplı; replay aynı', () => {
        const sim = runTowerBot(createTowerSim({ questionCount: 20 }), { mode: 'perfect', maxFloors: 320, botSeed: 9 });
        const s = sim.state;
        expect(s.floor).toBe(320);
        expect(s.crashed).toBe(false);
        expect(s.perfects).toBe(320);
        expect(s.maxCombo).toBe(320);
        expect(s.prev).toEqual({ x0: -1500, x1: 1500, z0: -1500, z1: 1500 });
        expect(s.answers).toHaveLength(20);
        expect(s.answers.every((a) => a.choice === 0 || a.choice === 1)).toBe(true);
        expect(s.v).toBe(TC.VMAX_T);
        const r = replayTower({ questionCount: 20, inputs: sim.encodeInputs(), endTick: s.tick });
        expect(r.floor).toBe(320);
        expect(r.basePoints).toBe(s.basePoints);
        expect(r.basePoints).toBe(320 * 10 + 5 * (1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9) + 5 * 10 * (320 - 9));
    });

    it('30 dakikada (MAX_TICKS) kayıt sınırına takılmaz', () => {
        const sim = runTowerBot(createTowerSim({ questionCount: 20 }), { mode: 'perfect' });
        expect(sim.state.tick).toBe(TC.MAX_TICKS);
        expect(sim.state.floor).toBeGreaterThan(2000);
        expect(sim.inputCount()).toBeLessThan(TC.MAX_INPUT_TOKENS);
    });
});

describe('kaybeden botlar', () => {
    it('rastgele bot erken ıskalar', () => {
        let total = 0;
        for (let seed = 1; seed <= 40; seed++) {
            const sim = runTowerBot(createTowerSim({ questionCount: 20 }), { mode: 'random', botSeed: seed });
            expect(sim.state.crashed).toBe(true);
            total += sim.state.floor;
            const r = replayTower({ questionCount: 20, inputs: sim.encodeInputs(), endTick: sim.state.tick });
            expect(r.floor).toBe(sim.state.floor);
            expect(r.crashed).toBe(true);
        }
        expect(total / 40).toBeLessThan(5);
    });

    it('geç kalan bot kuleyi inceltir ve ıskalar', () => {
        const floors = [];
        for (const lateBy of [2, 3, 5]) {
            const sim = runTowerBot(createTowerSim({ questionCount: 20 }), { mode: 'late', lateBy });
            expect(sim.state.crashed).toBe(true);
            expect(sim.state.perfects).toBeLessThan(sim.state.floor);
            floors.push(sim.state.floor);
        }
        expect(floors[0]).toBeGreaterThan(floors[1]);
        expect(floors[1]).toBeGreaterThan(floors[2]);
        expect(floors[2]).toBeGreaterThanOrEqual(10); // 5 tick (83 ms) geç bile ilk 10 kat geçilir
    });
});

describe('zorluk eğrisi (insan botu)', () => {
    const median = (jitter) => {
        const fl = [];
        for (let seed = 1; seed <= 60; seed++) {
            fl.push(runTowerBot(createTowerSim({ questionCount: 20 }), { mode: 'human', jitter, botSeed: seed }).state.floor);
        }
        fl.sort((a, b) => a - b);
        return { min: fl[0], med: fl[30] };
    };

    it('özensiz oyuncu da ilk 10 katı geçer, ortalama oyuncu 30-60, usta 100+', () => {
        const sloppy = median(5); // σ ≈ 68 ms
        const avg = median(3); // σ ≈ 41 ms
        const good = median(2); // σ ≈ 27 ms
        const master = median(1); // σ ≈ 14 ms
        expect(sloppy.min).toBeGreaterThanOrEqual(10);
        expect(avg.med).toBeGreaterThanOrEqual(30);
        expect(avg.med).toBeLessThanOrEqual(60);
        expect(good.med).toBeGreaterThan(avg.med);
        expect(master.med).toBeGreaterThanOrEqual(100);
    });
});
