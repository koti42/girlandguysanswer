import { describe, expect, it } from 'vitest';
import { TC, createTowerSim, offsetAt } from '../sim/index.js';
import { ASSIST_FLOORS, ASSIST_MIN_OVERLAP, GUIDE_FLOORS, alignment, judgeTap, tapDecision } from './tapAssist.js';

const SIZE = 2 * TC.BASE_HALF; // 3000

function gate(over = {}) {
    return {
        phase: 'running',
        paused: false,
        ended: false,
        simPhase: 'moving',
        tick: 10,
        lastTapTick: -1,
        floor: 0,
        off: 0,
        size: SIZE,
        t: 75,
        v: 60,
        R: TC.R,
        ...over,
    };
}

describe('kule dokunuş kararı (tapDecision)', () => {
    it('geri sayımda, başlamadan, duraklamada ve bitişte basış yok sayılır', () => {
        expect(tapDecision(gate({ phase: 'idle' }))).toBe('ignore');
        expect(tapDecision(gate({ phase: 'countdown' }))).toBe('ignore');
        expect(tapDecision(gate({ phase: 'crashing' }))).toBe('ignore');
        expect(tapDecision(gate({ paused: true }))).toBe('ignore');
        expect(tapDecision(gate({ ended: true }))).toBe('ignore');
    });

    it('kat kaymıyorken (doğma beklemesi, soru) yok sayılır', () => {
        expect(tapDecision(gate({ simPhase: 'spawn' }))).toBe('ignore');
        expect(tapDecision(gate({ simPhase: 'question' }))).toBe('ignore');
        expect(tapDecision(gate({ simPhase: 'over' }))).toBe('ignore');
    });

    it('aynı tick içinde ikinci dokunuş (pointer + tuş çift sayımı) yok sayılır', () => {
        expect(tapDecision(gate({ tick: 10, lastTapTick: 10 }))).toBe('ignore');
        expect(tapDecision(gate({ tick: 11, lastTapTick: 10 }))).toBe('send');
    });

    it('ortadaki kat sim\'e gider', () => {
        expect(tapDecision(gate({ off: 0 }))).toBe('send');
        expect(tapDecision(gate({ floor: 7, off: -2900, t: 26 }))).toBe('send'); // yardım yalnızca ilk katlarda
    });
});

describe('ilk kat yardımı (judgeTap)', () => {
    it('yalnızca ilk katlarda; örtüşme boyun üçte birinden azsa', () => {
        expect(ASSIST_FLOORS).toBe(2);
        expect(GUIDE_FLOORS).toBeGreaterThanOrEqual(ASSIST_FLOORS);
        // kat 1 doğduğu an: off = -R (ıska bölgesi), kuleye yaklaşıyor
        expect(judgeTap(1, -TC.R, SIZE, 0, 60, TC.R)).toBe('early');
        expect(judgeTap(2, -TC.R, SIZE, 0, 60, TC.R)).toBe('early');
        expect(judgeTap(3, -TC.R, SIZE, 0, 60, TC.R)).toBeNull();
        expect(judgeTap(0, -TC.R, SIZE, 0, 60, TC.R)).toBeNull();
        // sınır: örtüşme tam 1/3 → serbest
        const edge = SIZE - SIZE * ASSIST_MIN_OVERLAP; // 2000
        expect(edge).toBeCloseTo(2000, 6);
        expect(judgeTap(1, 2000, SIZE, 0, 60, TC.R)).toBeNull();
        expect(judgeTap(1, 2002, SIZE, 0, 60, TC.R)).not.toBeNull();
        expect(judgeTap(1, 0, SIZE, 75, 60, TC.R)).toBeNull();
        expect(judgeTap(1, 100, 0, 75, 60, TC.R)).toBeNull();
    });

    it('erken / geç: kat kuleye yaklaşırken erken, uzaklaşırken geç', () => {
        const v = 60;
        // t = 10 → off -3900, artıyor (yaklaşıyor)
        expect(judgeTap(1, offsetAt(10, v), SIZE, 10, v, TC.R)).toBe('early');
        // t = 140 → off +3900, hâlâ artıyor (uzaklaşıyor)
        expect(judgeTap(1, offsetAt(140, v), SIZE, 140, v, TC.R)).toBe('late');
        // t = 160 → off +3900, azalıyor (geri dönüyor, yaklaşıyor)
        expect(judgeTap(1, offsetAt(160, v), SIZE, 160, v, TC.R)).toBe('early');
        // t = 290 → off -3900, azalıyor (uzaklaşıyor)
        expect(judgeTap(1, offsetAt(290, v), SIZE, 290, v, TC.R)).toBe('late');
    });

    it('sim ile: yardım katlarında gönderilen hiçbir dokunuş ıska olmaz, kat en az 1/3 boyla oturur', () => {
        // Kat 1'in tam bir gidiş-dönüşü boyunca her tick'te dokunmayı dene.
        const cycle = (4 * TC.R) / 60;
        let sent = 0;
        let held = 0;
        for (let tapAt = 1; tapAt <= cycle + 1; tapAt++) {
            const sim = createTowerSim({ questionCount: 0 });
            const s = sim.state;
            while (!(s.phase === 'moving' && s.t === tapAt)) sim.step();
            const size = s.prev.x1 - s.prev.x0;
            const d = tapDecision(gate({ tick: s.tick, floor: s.floor, off: s.off, size, t: s.t, v: s.v }));
            if (d !== 'send') {
                held++;
                continue;
            }
            sent++;
            sim.input('T');
            sim.step();
            expect(s.crashed).toBe(false);
            expect(s.floor).toBe(1);
            expect(s.prev.x1 - s.prev.x0).toBeGreaterThanOrEqual(SIZE * ASSIST_MIN_OVERLAP);
        }
        expect(sent).toBeGreaterThan(0);
        expect(held).toBeGreaterThan(0);
    });

    it('yardım sim\'i değiştirmez: tutulan dokunuş kayda girmez, replay aynı kalır', () => {
        const sim = createTowerSim({ questionCount: 0 });
        sim.step(); // kat 1 doğar (off -R)
        const s = sim.state;
        const d = tapDecision(gate({ tick: s.tick, floor: s.floor, off: s.off, size: SIZE, t: s.t, v: s.v }));
        expect(d).toBe('early');
        // motor bu durumda sim.input çağırmaz
        expect(sim.inputCount()).toBe(0);
        expect(sim.encodeInputs()).toBe('');
    });
});

describe('hedef vurgusu (alignment)', () => {
    it('ortada 1, yarım boyda ve ötesinde 0, arada tekdüze', () => {
        expect(alignment(0, SIZE)).toBe(1);
        expect(alignment(SIZE / 2, SIZE)).toBe(0);
        expect(alignment(-SIZE, SIZE)).toBe(0);
        expect(alignment(100, 0)).toBe(0);
        expect(alignment(300, SIZE)).toBeGreaterThan(alignment(600, SIZE));
        expect(alignment(-300, SIZE)).toBe(alignment(300, SIZE));
    });
});
