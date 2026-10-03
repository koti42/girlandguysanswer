import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeScore, createSim, replay, SIM_VERSION } from './index.js';
import { fnv1aBytes } from './hash.js';
import { PATTERN_FILE } from './generator.js';
import { buildGolden, canonicalPatterns, GOLDEN_PATH, patternsHash, serializeGolden } from '../../../../scripts/runner-golden.mjs';

/*
 * Altın fikstürler (şartname §3.10, v2 §A.7): PHP portu aynı golden.json'ı
 * geçer. Burada JS tarafı dosyayla birebir eşleşmeli; simülasyon, desenler ya
 * da bot değişirse `node scripts/runner-golden.mjs` ile yeniden üretilir (PHP
 * testleri o zaman yeni dosyayla ve yeni patterns.json ile koşar).
 */

const text = readFileSync(GOLDEN_PATH, 'utf8');
const golden = JSON.parse(text);

describe('golden.json', () => {
    it('sürüm ve desen özeti güncel', () => {
        expect(golden.simVersion).toBe(SIM_VERSION);
        expect(SIM_VERSION).toBe(3);
        expect(golden.patternsHash).toBe(patternsHash());
        expect(golden.checkpointEvery).toBe(600);
    });

    it('kanonik desen metni: boşluksuz JSON, geri okununca aynı nesne, ASCII', () => {
        const text = canonicalPatterns();
        expect(text).toBe(JSON.stringify(JSON.parse(text)));
        expect(JSON.parse(text)).toEqual(PATTERN_FILE);
        expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
        expect(text.endsWith('\n')).toBe(false);
        expect(patternsHash()).toBe(fnv1aBytes(new TextEncoder().encode(text)));
    });

    it('şartnamedeki senaryoları kapsıyor', () => {
        const runs = golden.runs;
        expect(runs.length).toBeGreaterThanOrEqual(14);
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
            const typeOf = (id) => sim.getChunk(Math.floor(id / 64)).obstacles[id % 64].type;
            while (sim.state.tick < run.endTick && !sim.state.crashed) {
                while (i < inputs.length && inputs[i][0] === sim.state.tick) sim.input(inputs[i++][1]);
                for (const e of sim.step()) {
                    seen.add(e.type + (e.kind ? ':' + e.kind : ''));
                    if (e.type === 'stumble' || e.type === 'crash' || e.type === 'shieldBreak') seen.add(e.type + '@' + typeOf(e.id));
                }
                // Rampadan çıkışta 'land' olayı yok (yüzey takibi): çatıda koşmayı durumdan oku.
                if (sim.state.grounded && sim.state.y === 2700) seen.add('roof');
            }
            return seen;
        };
        expect(play('bot-kalkan').has('shieldBreak')).toBe(true);
        expect(play('bot-miknatis').has('power:magnet')).toBe(true);
        const sup = play('bot-super-ziplama');
        expect(sup.has('power:superjump')).toBe(true);
        expect(sup.has('jump:super')).toBe(true);
        const roof = play('bot-cati-kosusu');
        expect(roof.has('roof')).toBe(true);
        expect(roof.has('fall')).toBe(true);
        expect(play('rampada-ziplama').has('roof')).toBe(true);
        expect(play('bot-araba').has('land:car')).toBe(true);
        const fall = play('catidan-dusus');
        expect(fall.has('fall') && fall.has('land:ground')).toBe(true);
        expect(play('yan-rampa').has('stumble@ramp')).toBe(true);
        expect(play('girdisiz').has('crash:head')).toBe(true);
        const any = golden.runs.map((r) => play(r.name));
        expect(any.some((s) => s.has('crash:side'))).toBe(true);
        expect(any.some((s) => s.has('crash@bus') || s.has('crash@car'))).toBe(true);
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
