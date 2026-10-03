import { describe, expect, it } from 'vitest';
import { computeScore, createSim, replay, stateHash } from '../sim/index.js';
import { runSnapshot } from './runSnapshot.js';

/*
 * Motorun snapshot() / finish() yükü: oyunu bitirmeden alınan anlık görüntü
 * sunucunun replay'iyle aynı duruma varmalı ve sim'i değiştirmemeli.
 */

function playTo(sim, ticks, inputs = {}) {
    while (sim.state.tick < ticks && !sim.state.crashed) {
        const code = inputs[sim.state.tick];
        if (code) sim.input(code);
        sim.step();
    }
}

describe('koşu anlık görüntüsü (runSnapshot)', () => {
    it('{ endTick, inputs, localScore } döner; replay aynı duruma varır', () => {
        const sim = createSim({ seed: 424242, gateCount: 0 });
        playTo(sim, 180, { 20: 'L', 70: 'R', 120: 'J' });
        const snap = runSnapshot(sim);
        expect(Object.keys(snap).sort()).toEqual(['endTick', 'inputs', 'localScore']);
        expect(snap.endTick).toBe(sim.state.tick);
        expect(snap.inputs).toBe(sim.encodeInputs());
        expect(snap.inputs).not.toBe('');
        const st = sim.state;
        expect(snap.localScore).toBe(computeScore({ segMm: st.segMm, coins: st.coins, gates: st.gates, correct: [] }).score);

        const r = replay({ seed: 424242, gateCount: 0, inputs: snap.inputs, endTick: snap.endTick });
        expect(r.endTick).toBe(snap.endTick);
        expect(r.hash).toBe(stateHash(sim.state));
    });

    it('bu tick içinde kaydedilmiş (henüz adımlanmamış) girdi kaydı geçersiz kılmaz', () => {
        const sim = createSim({ seed: 99, gateCount: 0 });
        playTo(sim, 90);
        sim.input('L');
        const snap = runSnapshot(sim);
        // Girdi tick'i == endTick: sunucu kabul eder (tick <= endTick), uygulanmadan biter.
        expect(() => replay({ seed: 99, gateCount: 0, inputs: snap.inputs, endTick: snap.endTick })).not.toThrow();
        expect(replay({ seed: 99, gateCount: 0, inputs: snap.inputs, endTick: snap.endTick }).hash).toBe(stateHash(sim.state));
    });

    it("sim'i değiştirmez: görüntü alınan ve alınmayan koşu aynı devam eder", () => {
        const a = createSim({ seed: 7, gateCount: 0 });
        const b = createSim({ seed: 7, gateCount: 0 });
        const inputs = { 15: 'R', 40: 'J', 95: 'L' };
        playTo(a, 60, inputs);
        playTo(b, 60, inputs);
        const first = runSnapshot(a);
        expect(runSnapshot(a)).toEqual(first);
        playTo(a, 150, inputs);
        playTo(b, 150, inputs);
        expect(stateHash(a.state)).toBe(stateHash(b.state));
        expect(a.encodeInputs()).toBe(b.encodeInputs());
        // Sonraki görüntü yeni girdileri de içerir.
        expect(runSnapshot(a).endTick).toBeGreaterThan(first.endTick);
        expect(runSnapshot(a).inputs.startsWith(first.inputs)).toBe(true);
    });

});
