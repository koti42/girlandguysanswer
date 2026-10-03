/*
 * "Herkesler Yükseliyor" altın fikstür üreticisi (şartname §B.1).
 *
 *   node scripts/tower-golden.mjs [backend-dizini]
 *
 * JS kule simülasyonunun ürettiği oyunları golden.json'a yazar; PHP portu
 * (TowerSim) aynı dosyayı birebir geçmek zorunda. Yazılanlar:
 *   - src/game/tower/sim/__fixtures__/golden.json
 *   - <backend>/tests/Fixtures/tower/golden.json   (birebir kopya)
 * Backend dizini verilmezse frontend'in kardeşi ../girlsandguys-api-v10 denenir;
 * yoksa yalnızca frontend dosyası yazılır.
 *
 * Çıktı tamamen deterministiktir (zaman/rastgelelik yok): yeniden üretmek bayt
 * bayt aynı dosyayı verir — golden testi bunu doğrular. Simülasyon ya da
 * sabitler değişirse bu betik yeniden çalıştırılır.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    TC,
    TOWER_SIM_VERSION,
    computeTowerScore,
    createTowerSim,
    replayTower,
} from '../src/game/tower/sim/index.js';
import { runTowerBot } from '../src/game/tower/sim/bot.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const GOLDEN_PATH = resolve(ROOT, 'src/game/tower/sim/__fixtures__/golden.json');
const CHECKPOINT_EVERY = 600;

/** Bot zinciri: her adım [seçenekler] sırayla aynı sim üzerinde koşar. */
function botChain(questionCount, chain, extraTicks = 0) {
    const sim = createTowerSim({ questionCount });
    for (let i = 0; i < chain.length; i++) runTowerBot(sim, chain[i]);
    return { inputs: sim.encodeInputs(), endTick: sim.state.tick + extraTicks, sim };
}

/** Küçük xorshift (bot.js'tekinin aynısı; yalnızca kenar durum üretimi için). */
function rng(seed) {
    const p = { x: seed >>> 0 || 0x6d2b79f5 };
    return (n) => {
        let x = p.x;
        x = (x ^ (x << 13)) >>> 0;
        x = (x ^ (x >>> 17)) >>> 0;
        x = (x ^ (x << 5)) >>> 0;
        p.x = x;
        return x % n;
    };
}

/**
 * Kenar durumlar: doğma beklemesinde T, soru dışında A/B, yerleştirme ile
 * aynı tick'te cevap, soru sırasında T, tick başına 2 girdi, son tick'te cevap.
 * Oyuncu iyi oynar (en iyi ana ±1 tick), arada "gürültü" girdileri gönderir.
 */
function edgeCases() {
    const sim = createTowerSim({ questionCount: 6 });
    const s = sim.state;
    const r = rng(4242);
    let lastQ = -1;
    let qMode = 0;
    while (!s.crashed && s.floor < 80) {
        if (s.phase === 'moving') {
            const a = Math.abs(s.off);
            if (a <= TC.PERFECT + s.v && r(3) === 0) {
                sim.input('T');
                // Soru katında aynı tick'te cevap, diğerlerinde ikinci (etkisiz) T
                if ((s.floor + 1) % TC.QUESTION_EVERY === 0 && qMode % 3 === 0) sim.input('B');
                else if (r(4) === 0) sim.input('T');
            } else if (a <= TC.PERFECT + s.v && a <= TC.PERFECT) {
                sim.input('T');
            } else if (r(97) === 0) {
                sim.input(r(2) === 0 ? 'A' : 'B'); // soru dışında: etkisiz
            }
        } else if (s.phase === 'spawn') {
            if (r(5) === 0) sim.input('T'); // beklemede: etkisiz
        } else if (s.phase === 'question') {
            if (lastQ !== s.qIndex) {
                lastQ = s.qIndex;
                qMode++;
            }
            if (r(20) === 0) sim.input('T'); // soru sırasında: etkisiz
            if (qMode % 3 === 1 && s.qt === TC.QUESTION_TICKS - 1) sim.input('A'); // son tick
            if (qMode % 3 === 2 && s.qt === 40) {
                sim.input('B');
                sim.input('A'); // aynı tick'te ikinci cevap: etkisiz
            }
        }
        sim.step();
    }
    // Sonra bilerek ıska: kat doğar doğmaz dokun
    while (!s.crashed) {
        if (s.phase === 'moving') sim.input('T');
        sim.step();
    }
    return { inputs: sim.encodeInputs(), endTick: s.tick + 100, sim };
}

/** Soru sonuçları: seed'e bağlı karışık doğru/yanlış/bilinmeyen. */
function corrects(seed, answers) {
    const r = rng(seed ^ 0x9e3779b9);
    const out = [];
    for (let i = 0; i < answers.length; i++) {
        const k = r(5);
        out[answers[i].index] = k === 0 ? false : (k === 1 ? null : true);
    }
    return out;
}

function runSpecs() {
    return [
        {
            name: 'mukemmel-uzun',
            note: 'mükemmel bot 320 kat, 20 soru cevaplı, VMAX hızında uzun seri',
            questionCount: 20,
            make: () => botChain(20, [{ mode: 'perfect', maxFloors: 320, botSeed: 3, answerAfter: 75 }]),
            check: (sim) => sim.state.floor === 320 && sim.state.answers.length === 20 && !sim.state.crashed,
        },
        {
            name: 'buyume-siniri',
            note: '6 kat geç dokunuşla incelme, sonra mükemmel seri: iki eksen de 3000\'e büyür ve orada kalır',
            questionCount: 3,
            make: () => botChain(3, [
                { mode: 'late', lateBy: 3, maxFloors: 6 },
                { mode: 'perfect', maxFloors: 90, botSeed: 8, answerAfter: 200 },
            ], 300),
            check: (sim) => sim.state.prev.x1 - sim.state.prev.x0 === 3000 && sim.state.prev.z1 - sim.state.prev.z0 === 3000,
        },
        {
            name: 'insan-iyi',
            note: 'insan benzeri (±2 tick) oyuncu, sorular cevaplı, ıskayla biter',
            questionCount: 20,
            make: () => botChain(20, [{ mode: 'human', jitter: 2, botSeed: 11, answerAfter: 150 }]),
            check: (sim) => sim.state.crashed && sim.state.answers.length >= 3,
        },
        {
            name: 'insan-orta-cevapsiz',
            note: 'insan benzeri (±3 tick), her ikinci soru cevapsız (zaman aşımı), ıskayla biter',
            questionCount: 20,
            make: () => botChain(20, [{ mode: 'human', jitter: 3, botSeed: 21, answerAfter: 300, skipEvery: 2 }]),
            check: (sim) => sim.state.crashed && sim.state.answers.some((a) => a.choice === -1) && sim.state.answers.some((a) => a.choice >= 0),
        },
        {
            name: 'hep-cevapsiz',
            note: 'mükemmel 40 kat, 3 sorunun hepsi zaman aşımı, sonra geç kalan bot ıskalar',
            questionCount: 20,
            make: () => botChain(20, [
                { mode: 'perfect', maxFloors: 40, skipEvery: 1 },
                { mode: 'late', lateBy: 4, skipEvery: 1 },
            ]),
            check: (sim) => sim.state.crashed && sim.state.answers.length >= 3 && sim.state.answers.every((a) => a.choice === -1),
        },
        {
            name: 'gec-kalan',
            note: 'her katta 3 tick geç: kule incelir, ıska',
            questionCount: 20,
            make: () => botChain(20, [{ mode: 'late', lateBy: 3, answerAfter: 30 }]),
            check: (sim) => sim.state.crashed,
        },
        {
            name: 'rastgele-1',
            note: 'rastgele dokunuş, erken ıska',
            questionCount: 20,
            make: () => botChain(20, [{ mode: 'random', botSeed: 37 }]),
            check: (sim) => sim.state.crashed && sim.state.floor >= 2,
        },
        {
            name: 'rastgele-2',
            note: 'rastgele dokunuş (sık), ilk katta ıska',
            questionCount: 20,
            make: () => botChain(20, [{ mode: 'random', botSeed: 2, randomEvery: 12 }]),
            check: (sim) => sim.state.crashed,
        },
        {
            name: 'kenar-durumlar',
            note: 'beklemede T, soru dışında A/B, yerleştirmeyle aynı tick\'te cevap, soru sırasında T, son tick\'te cevap, 2 girdi/tick',
            questionCount: 6,
            make: edgeCases,
            check: (sim) => sim.state.crashed && sim.state.answers.length === 6,
        },
        {
            name: 'dogar-dogmaz-iska',
            note: 'kat 1 doğduktan hemen sonra dokunuş: off = −4500, ıska; endTick sonrası boş',
            questionCount: 20,
            make: () => ({ inputs: '1T', endTick: 50 }),
        },
        {
            name: 'girdisiz',
            note: 'hiç girdi yok: kat 1 gider gelir, oyun bitmez',
            questionCount: 20,
            make: () => ({ inputs: '', endTick: 3000 }),
        },
        {
            name: 'antrenman-30-dk',
            note: 'sorusuz (misafir) mükemmel oyun MAX_TICKS\'e kadar',
            questionCount: 0,
            make: () => botChain(0, [{ mode: 'perfect' }]),
            check: (sim) => sim.state.tick === TC.MAX_TICKS && !sim.state.crashed,
        },
    ];
}

function buildRun(spec) {
    const made = spec.make(spec);
    if (spec.check && !spec.check(made.sim)) {
        throw new Error('Altın koşu "' + spec.name + '" beklenen senaryoyu üretmedi.');
    }
    const endTick = Math.min(made.endTick, TC.MAX_TICKS);
    const r = replayTower({ questionCount: spec.questionCount, inputs: made.inputs, endTick, checkpointEvery: CHECKPOINT_EVERY });
    const correct = corrects(spec.name.length * 7919 + spec.questionCount, r.answers);
    const score = computeTowerScore({ basePoints: r.basePoints, answers: r.answers, correct });
    return {
        name: spec.name,
        note: spec.note,
        questionCount: spec.questionCount,
        inputs: made.inputs,
        endTick,
        expected: r,
        correct,
        expectedScore: score,
    };
}

/** golden.json içeriği (nesne). */
export function buildGolden() {
    return {
        towerSimVersion: TOWER_SIM_VERSION,
        checkpointEvery: CHECKPOINT_EVERY,
        about: 'Herkesler Yükseliyor altın fikstürleri — scripts/tower-golden.mjs üretir, elle düzenlemeyin. '
            + 'expected = replayTower çıktısı; checkpoints: her adımdan sonra tick % checkpointEvery == 0 ise {tick, hash}. '
            + 'hash: tick|phase|floor|x0|x1|z0|z1|combo|basePoints|qIndex|crashed (phase metin). '
            + 'correct[index]: true/false/null (null = bilinmiyor, sayılmaz). '
            + 'constants: JS sabitleri (TC); PHP sabitleri bunlarla aynı olmalı.',
        constants: { ...TC },
        runs: runSpecs().map(buildRun),
    };
}

/** Okunabilir ama küçük: üst düzey anahtarlar ve koşular satır satır. */
export function serializeGolden(g) {
    const lines = ['{'];
    lines.push('"towerSimVersion":' + JSON.stringify(g.towerSimVersion) + ',');
    lines.push('"checkpointEvery":' + JSON.stringify(g.checkpointEvery) + ',');
    lines.push('"about":' + JSON.stringify(g.about) + ',');
    lines.push('"constants":' + JSON.stringify(g.constants) + ',');
    lines.push('"runs":[');
    lines.push(g.runs.map((r) => JSON.stringify(r)).join(',\n'));
    lines.push(']');
    lines.push('}');
    return lines.join('\n') + '\n';
}

function main() {
    const text = serializeGolden(buildGolden());
    JSON.parse(text); // kendi kendini doğrula
    mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
    writeFileSync(GOLDEN_PATH, text);
    console.log('yazıldı: ' + GOLDEN_PATH + ' (' + text.length + ' bayt)');

    const backend = resolve(process.argv[2] || resolve(ROOT, '../girlsandguys-api-v10'));
    if (!existsSync(resolve(backend, 'artisan'))) {
        console.warn('backend bulunamadı (' + backend + '): yalnızca frontend fikstürü yazıldı.');
        return;
    }
    const fixture = resolve(backend, 'tests/Fixtures/tower/golden.json');
    mkdirSync(dirname(fixture), { recursive: true });
    writeFileSync(fixture, text);
    console.log('yazıldı: ' + fixture);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main();
}
