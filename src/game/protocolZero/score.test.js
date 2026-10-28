import { describe, expect, it } from 'vitest';
import { computeScore, maxScore } from './score';
import { createRng } from './rng';

describe('computeScore', () => {
    it('zafer yenilgiden, yüksek zorluk düşükten fazla puan verir', () => {
        const base = { days: 42, decrypt: 100, nodesSaved: 11, techs: 5, breachesWon: 2 };
        const v = computeScore({ ...base, difficulty: 'normal', outcome: 'victory' });
        const d = computeScore({ ...base, difficulty: 'normal', outcome: 'defeat', decrypt: 60 });
        expect(v).toBeGreaterThan(d);
        expect(computeScore({ ...base, difficulty: 'nightmare', outcome: 'victory' })).toBeGreaterThan(v);
        expect(computeScore({ ...base, difficulty: 'easy', outcome: 'victory' })).toBeLessThan(v);
    });

    it('hızlı zafer daha çok bonus alır', () => {
        const a = computeScore({ difficulty: 'hard', outcome: 'victory', days: 20, decrypt: 100, nodesSaved: 14 });
        const b = computeScore({ difficulty: 'hard', outcome: 'victory', days: 120, decrypt: 100, nodesSaved: 14 });
        expect(a).toBeGreaterThan(b);
    });

    it('rastgele girdilerde sunucu tavanını hiç aşmaz', () => {
        const rng = createRng(2026);
        const diffs = ['easy', 'normal', 'hard', 'nightmare'];
        for (let i = 0; i < 3000; i++) {
            const r = {
                difficulty: diffs[Math.floor(rng() * 4)],
                outcome: rng() < 0.5 ? 'victory' : 'defeat',
                days: 1 + Math.floor(rng() * 365),
                decrypt: Math.floor(rng() * 101),
                nodesSaved: Math.floor(rng() * 15),
                techs: Math.floor(rng() * 10),
                breachesWon: Math.floor(rng() * 12),
            };
            expect(computeScore(r)).toBeLessThanOrEqual(maxScore(r));
        }
    });

    it('bozuk girdiler sınırlanır', () => {
        expect(computeScore({ difficulty: 'x', outcome: 'defeat', days: -5, decrypt: 900, nodesSaved: 99 })).toBeLessThanOrEqual(
            maxScore({ difficulty: 'normal', outcome: 'defeat', days: 1, decrypt: 100, nodesSaved: 14 })
        );
        expect(Number.isInteger(computeScore({}))).toBe(true);
    });
});
