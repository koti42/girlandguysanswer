import { describe, expect, it } from 'vitest';
import {
    TC,
    TOWER_SIM_VERSION,
    axisFor,
    computeTowerScore,
    decodeTowerInputs,
    encodeTowerInputs,
    fnv1a,
    isQuestionFloor,
    offsetAt,
    speedFor,
    towerStateHash,
    TowerInputError,
} from './index.js';
import { bestTick } from './bot.js';

describe('sabitler', () => {
    it('sürüm 1, hepsi tamsayı', () => {
        expect(TOWER_SIM_VERSION).toBe(1);
        for (const [k, v] of Object.entries(TC)) {
            expect(Number.isInteger(v), k).toBe(true);
        }
        expect(Object.isFrozen(TC)).toBe(true);
    });
});

describe('offsetAt (ping-pong)', () => {
    it('−R\'den başlar, +R\'ye gider, geri döner', () => {
        expect(offsetAt(0, 60)).toBe(-4500);
        expect(offsetAt(75, 60)).toBe(0);
        expect(offsetAt(150, 60)).toBe(4500); // ph == 2R → üst uç
        expect(offsetAt(151, 60)).toBe(4440);
        expect(offsetAt(225, 60)).toBe(0);
        expect(offsetAt(300, 60)).toBe(-4500); // tam tur
        expect(offsetAt(301, 60)).toBe(-4440);
    });

    it('her zaman [−R, R] içinde, adım başına en fazla v değişir', () => {
        const bad = [];
        for (const v of [60, 61, 97, 126, 170]) {
            let prev = offsetAt(0, v);
            for (let t = 1; t < 5000; t++) {
                const o = offsetAt(t, v);
                if (!Number.isInteger(o) || o < -TC.R || o > TC.R || Math.abs(o - prev) > v) bad.push([v, t, o]);
                prev = o;
            }
        }
        expect(bad).toEqual([]);
    });

    it('şartname formülüyle birebir (ph = t·v mod 4R)', () => {
        for (let t = 0; t < 3000; t += 7) {
            const v = 60 + (t % 111);
            const ph = (t * v) % 18000;
            expect(offsetAt(t, v)).toBe(ph <= 9000 ? -4500 + ph : 13500 - ph);
        }
    });

    it('her hızda ilk yaklaşmada |off| ≤ PERFECT olan bir an vardır', () => {
        for (let v = TC.V0_T; v <= TC.VMAX_T; v++) {
            const t = bestTick(v);
            expect(Math.abs(offsetAt(t, v))).toBeLessThanOrEqual(TC.PERFECT);
            expect(Math.abs(offsetAt(t, v))).toBeLessThanOrEqual(v / 2);
        }
    });

    it('MAX_TICKS × VMAX_T taşmaz', () => {
        expect(TC.MAX_TICKS * TC.VMAX_T).toBeLessThan(2 ** 31);
        expect(Number.isInteger(offsetAt(TC.MAX_TICKS, TC.VMAX_T))).toBe(true);
    });
});

describe('speedFor', () => {
    it('3 katta bir 2 mm/tick artar, 170\'te durur', () => {
        expect(speedFor(1)).toBe(60);
        expect(speedFor(3)).toBe(60);
        expect(speedFor(4)).toBe(62);
        expect(speedFor(10)).toBe(66);
        expect(speedFor(30)).toBe(78);
        expect(speedFor(60)).toBe(98);
        expect(speedFor(100)).toBe(126);
        expect(speedFor(165)).toBe(168);
        expect(speedFor(166)).toBe(170);
        expect(speedFor(1000)).toBe(170);
        expect(speedFor(0)).toBe(60);
    });

    it('eksen ve soru katı', () => {
        expect(axisFor(1)).toBe('x');
        expect(axisFor(2)).toBe('z');
        expect(axisFor(13)).toBe('x');
        expect(isQuestionFloor(0)).toBe(false);
        expect(isQuestionFloor(12)).toBe(true);
        expect(isQuestionFloor(13)).toBe(false);
        expect(isQuestionFloor(24)).toBe(true);
    });
});

describe('girdi kodlama', () => {
    it('kodlar ve geri çözer', () => {
        const list = [[80, 'T'], [175, 'T'], [175, 'A'], [900, 'T'], [900, 'T']];
        const str = encodeTowerInputs(list);
        expect(str).toBe('80T,95T,0A,725T,0T');
        expect(decodeTowerInputs(str, 900)).toEqual(list);
        expect(decodeTowerInputs('')).toEqual([]);
        expect(encodeTowerInputs([])).toBe('');
        expect(decodeTowerInputs('007B')).toEqual([[7, 'B']]);
    });

    it('bozuk biçimleri reddeder', () => {
        const bad = ['T', '1', '1X', '1J', '1L', ',1T', '1T,', '1T,,2T', '-1T', '1 T', '1t', '1234567T', '1.5T', '1T;2T', '1T\n'];
        for (const s of bad) {
            expect(() => decodeTowerInputs(s), s).toThrow(TowerInputError);
        }
        expect(() => decodeTowerInputs(null)).toThrow(TowerInputError);
        expect(() => decodeTowerInputs(42)).toThrow(TowerInputError);
    });

    it('tick başına en fazla 2 girdi', () => {
        expect(decodeTowerInputs('5T,0A')).toEqual([[5, 'T'], [5, 'A']]);
        expect(() => decodeTowerInputs('5T,0A,0B')).toThrow('Aynı anda');
        expect(decodeTowerInputs('5T,0A,1B,0T')).toHaveLength(4);
    });

    it('en fazla 6000 token ve endTick sınırı', () => {
        const ok = new Array(6000).fill('1T').join(',');
        expect(decodeTowerInputs(ok)).toHaveLength(6000);
        expect(() => decodeTowerInputs(ok + ',1T')).toThrow('çok fazla');
        expect(() => decodeTowerInputs('x'.repeat(48001))).toThrow('çok uzun');
        expect(() => decodeTowerInputs('10T', 9)).toThrow('aşıyor');
        expect(decodeTowerInputs('10T', 10)).toEqual([[10, 'T']]);
        expect(() => decodeTowerInputs('', -1)).toThrow(TowerInputError);
        expect(() => decodeTowerInputs('', TC.MAX_TICKS + 1)).toThrow(TowerInputError);
        expect(() => decodeTowerInputs('', 1.5)).toThrow(TowerInputError);
    });

    it('geçersiz liste kodlanmaz', () => {
        expect(() => encodeTowerInputs([[5, 'T'], [4, 'T']])).toThrow(TowerInputError);
        expect(() => encodeTowerInputs([[5, 'J']])).toThrow(TowerInputError);
        expect(() => encodeTowerInputs([[5.5, 'T']])).toThrow(TowerInputError);
        expect(() => encodeTowerInputs([[-1, 'T']])).toThrow(TowerInputError);
    });
});

describe('hash', () => {
    it('FNV-1a 32 bilinen değerler', () => {
        expect(fnv1a('')).toBe(2166136261);
        expect(fnv1a('a')).toBe(0xe40c292c);
        expect(fnv1a('foobar')).toBe(0xbf9cf968);
    });

    it('şartnamedeki alan sırası', () => {
        const s = {
            tick: 7, phase: 'moving', floor: 3, prev: { x0: -1500, x1: 1200, z0: -1400, z1: 1500 },
            combo: 2, basePoints: 45, qIndex: 0, crashed: false,
        };
        expect(towerStateHash(s)).toBe(fnv1a('7|moving|3|-1500|1200|-1400|1500|2|45|0|0'));
        expect(towerStateHash({ ...s, crashed: true })).toBe(fnv1a('7|moving|3|-1500|1200|-1400|1500|2|45|0|1'));
    });
});

describe('computeTowerScore', () => {
    const answers = [{ index: 0, choice: 1, tick: 900 }, { index: 1, choice: -1, tick: 2000 }, { index: 2, choice: 0, tick: 3000 }];

    it('doğru başına 150', () => {
        expect(computeTowerScore({ basePoints: 400, answers, correct: [true, true, true] })).toEqual({ score: 700, correctCount: 2 });
        expect(computeTowerScore({ basePoints: 400, answers, correct: [false, null, true] })).toEqual({ score: 550, correctCount: 1 });
    });

    it('doğru şık indeksiyle de çalışır, bilinmeyen sayılmaz', () => {
        expect(computeTowerScore({ basePoints: 10, answers, correct: [1, 0, 1] })).toEqual({ score: 160, correctCount: 1 });
        expect(computeTowerScore({ basePoints: 10, answers, correct: [] })).toEqual({ score: 10, correctCount: 0 });
        expect(computeTowerScore({ basePoints: 10, answers: [], correct: undefined })).toEqual({ score: 10, correctCount: 0 });
    });
});
