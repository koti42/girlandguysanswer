import { describe, expect, it } from 'vitest';
import { GRID, MAX_MISSES, advance, createBreachState, shuffle, tap } from './breach';

describe('breach mini oyunu', () => {
    it('başlangıçta 2-4 bozuk hücre, süre ve hedef ayarlanır', () => {
        const st = createBreachState({ seed: 1, targets: 8, seconds: 12 });
        expect(st.bad.size).toBeGreaterThanOrEqual(2);
        expect(st.bad.size).toBeLessThanOrEqual(4);
        for (const i of st.bad) expect(i).toBeLessThan(GRID * GRID);
        expect(st.remaining).toBe(12);
        expect(st.done).toBeNull();
    });

    it('hedef sayıda bozuk hücre yakalanınca başarı', () => {
        const st = createBreachState({ seed: 2, targets: 3 });
        let kind;
        while (!st.done) {
            const idx = [...st.bad][0];
            kind = tap(st, idx);
            expect(kind).toBe('hit');
        }
        expect(st.done).toBe('success');
        expect(st.hits).toBe(3);
        expect(tap(st, 0)).toBeNull();
    });

    it('üç yanlış dokunuş başarısızlık', () => {
        const st = createBreachState({ seed: 3, targets: 8 });
        let misses = 0;
        for (let i = 0; i < GRID * GRID && misses < MAX_MISSES; i++) {
            if (!st.bad.has(i)) {
                expect(tap(st, i)).toBe('miss');
                misses++;
            }
        }
        expect(st.misses).toBe(MAX_MISSES);
        expect(st.done).toBe('fail');
    });

    it('süre bitince başarısız; hücreler periyodik yer değiştirir', () => {
        const st = createBreachState({ seed: 4, targets: 8, seconds: 3, shuffleEvery: 1 });
        const first = [...st.bad].join(',');
        expect(advance(st, 1.05)).toBeNull();
        const second = [...st.bad].join(',');
        expect(second).not.toBe(first);
        expect(advance(st, 2.5)).toBe('fail');
        expect(st.remaining).toBe(0);
    });

    it('tüm bozuklar yakalanıp hedef dolmadıysa yeni dalga gelir', () => {
        const st = createBreachState({ seed: 5, targets: 50 });
        for (const idx of [...st.bad]) tap(st, idx);
        expect(st.bad.size).toBeGreaterThan(0);
        shuffle(st);
        expect(st.bad.size).toBeGreaterThanOrEqual(2);
    });
});
