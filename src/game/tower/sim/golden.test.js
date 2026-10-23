import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TC, TOWER_SIM_VERSION, computeTowerScore, createTowerSim, decodeTowerInputs, replayTower } from './index.js';
import { buildGolden, GOLDEN_PATH, serializeGolden } from '../../../../scripts/tower-golden.mjs';

/*
 * Altın fikstürler (şartname §B.1): PHP portu (TowerSim) aynı golden.json'ı
 * geçer. Burada JS tarafı dosyayla birebir eşleşmeli; simülasyon, sabitler ya
 * da botlar değişirse `node scripts/tower-golden.mjs` ile yeniden üretilir
 * (backend kopyası da yazılır, PHP testleri yeni dosyayla koşar).
 */

// Windows'ta git autocrlf dosyayı CRLF yazar; içerik aynıysa satır sonu farkı sayılmaz.
const text = readFileSync(GOLDEN_PATH, 'utf8').split('\r\n').join('\n');
const golden = JSON.parse(text);

describe('tower golden.json', () => {
    it('sürüm, sabitler ve checkpoint aralığı güncel', () => {
        expect(golden.towerSimVersion).toBe(TOWER_SIM_VERSION);
        expect(golden.constants).toEqual({ ...TC });
        expect(golden.checkpointEvery).toBe(600);
    });

    it('şartnamedeki senaryoları kapsıyor', () => {
        const runs = golden.runs;
        const ex = (r) => r.expected;
        expect(runs.length).toBeGreaterThanOrEqual(8);
        expect(runs.filter((r) => ex(r).crashed).length).toBeGreaterThanOrEqual(5); // ıska ile biten
        expect(runs.some((r) => ex(r).answers.some((a) => a.choice >= 0))).toBe(true); // cevaplı
        expect(runs.some((r) => ex(r).answers.some((a) => a.choice === -1))).toBe(true); // cevapsız
        expect(runs.some((r) => ex(r).maxCombo >= 300)).toBe(true); // uzun mükemmel seri
        expect(runs.some((r) => ex(r).endTick === TC.MAX_TICKS)).toBe(true);
        expect(runs.some((r) => r.inputs === '')).toBe(true);
        expect(runs.some((r) => r.questionCount === 0)).toBe(true);
        expect(runs.some((r) => r.expectedScore.correctCount > 0)).toBe(true);
        for (const r of runs) {
            expect(ex(r).checkpoints.length).toBe(Math.floor(ex(r).endTick / 600));
        }
    });

    for (const run of golden.runs) {
        it('koşu: ' + run.name, () => {
            const r = replayTower({
                questionCount: run.questionCount,
                inputs: run.inputs,
                endTick: run.endTick,
                checkpointEvery: golden.checkpointEvery,
            });
            expect(r).toEqual(run.expected);
            const score = computeTowerScore({ basePoints: r.basePoints, answers: r.answers, correct: run.correct });
            expect(score).toEqual(run.expectedScore);
        });
    }

    it('büyüme sınırı ve kenar durumlar gerçekten oluşuyor', () => {
        const play = (name) => {
            const run = golden.runs.find((r) => r.name === name);
            const list = decodeTowerInputs(run.inputs, run.endTick);
            const sim = createTowerSim({ questionCount: run.questionCount });
            const seen = { grewPartial: false, sameTickAnswer: false, ignored: 0 };
            let i = 0;
            while (sim.state.tick < run.endTick && !sim.state.crashed) {
                const s = sim.state;
                while (i < list.length && list[i][0] === s.tick) {
                    const code = list[i][1];
                    if ((code === 'T' && s.phase !== 'moving') || (code !== 'T' && s.phase !== 'question')) seen.ignored++;
                    sim.input(code);
                    i++;
                }
                const ev = sim.step();
                for (let k = 0; k < ev.length; k++) {
                    if (ev[k].type === 'place' && ev[k].grew > 0 && ev[k].grew < TC.GROW) seen.grewPartial = true;
                    if (ev[k].type === 'answer' && k > 0 && ev[k - 1].type === 'question') seen.sameTickAnswer = true;
                }
            }
            return seen;
        };
        expect(play('buyume-siniri').grewPartial).toBe(true);
        const edge = play('kenar-durumlar');
        expect(edge.sameTickAnswer).toBe(true);
        expect(edge.ignored).toBeGreaterThan(20);
    });

    it('yeniden üretildiğinde bayt bayt aynı', () => {
        expect(serializeGolden(buildGolden())).toBe(text);
    }, 60000);
});
