import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeScore, createSim, replay, SIM_VERSION } from './index.js';
import { fnv1aBytes } from './hash.js';
import { buildGolden, GOLDEN_PATH, PATTERNS_PATH, serializeGolden } from '../../../../scripts/runner-golden.mjs';

/*
 * Altın fikstürler (şartname §3.10): PHP portu aynı golden.json'ı geçer.
 * Burada JS tarafı dosyayla birebir eşleşmeli; simülasyon, desenler ya da
 * bot değişirse `node scripts/runner-golden.mjs` ile yeniden üretilir (PHP
 * testleri o zaman yeni dosyayla koşar).
 */

const text = readFileSync(GOLDEN_PATH, 'utf8');
const golden = JSON.parse(text);

describe('golden.json', () => {
    it('sürüm ve desen özeti güncel', () => {
        expect(golden.simVersion).toBe(SIM_VERSION);
        expect(golden.patternsHash).toBe(fnv1aBytes(readFileSync(PATTERNS_PATH)));
        expect(golden.checkpointEvery).toBe(600);
    });

    it('şartnamedeki senaryoları kapsıyor', () => {
        const runs = golden.runs;
        expect(runs.length).toBeGreaterThanOrEqual(12);
        expect(runs.some((r) => r.expected.crashed)).toBe(true);
        expect(runs.some((r) => r.inputs === '' && r.expected.crashed)).toBe(true);
        expect(runs.some((r) => r.expected.gates.length >= 20)).toBe(true);
        expect(runs.filter((r) => r.name.startsWith('rastgele')).length).toBe(4);
        expect(runs.some((r) => r.expectedScore.maxMult === 5)).toBe(true);
        expect(golden.generator).toHaveLength(3);
        for (const g of golden.generator) expect(g.chunks).toHaveLength(60);
    });

    for (const run of golden.runs) {
        it('koşu: ' + run.name, () => {
            const r = replay({
                seed: run.seed,
                gateCount: run.gateCount,
                inputs: run.inputs,
                endTick: run.endTick,
                checkpointEvery: golden.checkpointEvery,
            });
            expect(r).toEqual(run.expected);
            const score = computeScore({ segMm: r.segMm, coins: r.coins, gates: r.gates, correct: run.correct });
            expect(score).toEqual(run.expectedScore);
        });
    }

    it('kalkan ve mıknatıs senaryoları gerçekten oluşuyor', () => {
        const play = (name) => {
            const run = golden.runs.find((r) => r.name === name);
            const sim = createSim({ seed: run.seed, gateCount: run.gateCount });
            const list = run.inputs === '' ? [] : run.inputs.split(',');
            let tick = 0;
            let i = 0;
            const seen = new Set();
            const inputs = list.map((tok) => {
                tick += parseInt(tok, 10);
                return [tick, tok[tok.length - 1]];
            });
            while (sim.state.tick < run.endTick && !sim.state.crashed) {
                while (i < inputs.length && inputs[i][0] === sim.state.tick) sim.input(inputs[i++][1]);
                for (const e of sim.step()) seen.add(e.type + (e.kind ? ':' + e.kind : ''));
            }
            return seen;
        };
        expect(play('bot-kalkan').has('shieldBreak')).toBe(true);
        expect(play('bot-miknatis').has('power:magnet')).toBe(true);
        expect(play('rastgele-1').has('crash:side')).toBe(true);
        expect(play('girdisiz').has('crash:head')).toBe(true);
    });

    it('pist üretimi (3 seed × 60 chunk)', () => {
        for (const g of golden.generator) {
            const sim = createSim({ seed: g.seed, gateCount: g.gateCount });
            for (const expected of g.chunks) {
                expect(sim.getChunk(expected.index)).toEqual(expected);
            }
        }
    });

    it('yeniden üretildiğinde bayt bayt aynı', () => {
        expect(serializeGolden(buildGolden())).toBe(text);
    }, 120000);
});
