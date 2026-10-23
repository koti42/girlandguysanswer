import { describe, expect, it } from 'vitest';
import { bestOf, loadScale, scaled } from './perfScale.js';

describe('perfScale', () => {
    it('ölçek >= 1 ve üst sınırlı; scaled eşiği çarpar', () => {
        const s = loadScale();
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(25);
        expect(scaled(2)).toBeGreaterThanOrEqual(2);
    });

    it('bestOf en küçük ölçümü döndürür (geçici sıçramaları yok sayar)', () => {
        const seq = [9, 3, 7];
        let i = 0;
        expect(bestOf(3, () => seq[i++])).toBe(3);
    });

    it('ölçek yalnızca artar (süreç boyunca en yüksek değer)', () => {
        const a = loadScale();
        const b = loadScale();
        expect(b).toBeGreaterThanOrEqual(a);
    });
});
