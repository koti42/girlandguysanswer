/*
 * "Herkesler Koşuyor" altın fikstür üreticisi (şartname §3.10).
 *
 *   node scripts/runner-golden.mjs [backend-dizini]
 *
 * JS simülasyonunun ürettiği koşuları ve pist içeriğini golden.json'a yazar;
 * PHP portu (RunnerSim) aynı dosyayı birebir geçmek zorunda. Yazılanlar:
 *   - src/game/runner/sim/__fixtures__/golden.json
 *   - <backend>/tests/Fixtures/runner/golden.json            (birebir kopya)
 *   - <backend>/app/Services/Game/Runner/patterns.json       (desenlerin birebir kopyası)
 * Backend dizini verilmezse frontend'in kardeşi ../girlsandguys-api-v10 denenir;
 * yoksa yalnızca frontend dosyası yazılır.
 *
 * Çıktı tamamen deterministiktir (zaman/rastgelelik yok): aynı kod ve aynı
 * patterns.json ile yeniden üretmek bayt bayt aynı dosyayı verir — golden testi
 * bunu doğrular. Simülasyon ya da desenler değişirse bu betik yeniden çalıştırılır.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { C, SIM_VERSION, computeScore, createSim, encodeInputs, replay } from '../src/game/runner/sim/index.js';
import { runBot } from '../src/game/runner/sim/bot.js';
import { fnv1aBytes } from '../src/game/runner/sim/hash.js';
import { createPrng, randInt } from '../src/game/runner/sim/prng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIM_DIR = resolve(ROOT, 'src/game/runner/sim');
export const PATTERNS_PATH = resolve(SIM_DIR, 'patterns.json');
export const GOLDEN_PATH = resolve(SIM_DIR, '__fixtures__/golden.json');
const CHECKPOINT_EVERY = 600;

/** Bot koşusu: sim'i bot oynar, sonra isteğe bağlı "girdisiz" kuyruk. */
function botRun({ seed, gateCount, botSeed, until, stop, idleAfter = 0, extraTicks = 0 }) {
    const sim = createSim({ seed, gateCount });
    runBot(sim, { botSeed, untilZ: until?.z, maxTicks: until?.tick, stop });
    if (stop && !stop(sim)) throw new Error('Altın koşu koşulu sağlanmadı (seed ' + seed + ').');
    // Bot bırakınca oyuncu tuşa basmıyormuş gibi devam (kalkan/çarpma senaryoları).
    let guard = 0;
    while (idleAfter > 0 && !sim.state.crashed && guard++ < idleAfter) sim.step();
    return { inputs: sim.encodeInputs(), endTick: sim.state.tick + extraTicks, sim };
}

/** Bağımsız rastgele girdi listesi; bazı tick'lerde 2-4 girdi (aynı tick kuralları). */
function randomInputs(seed, endTick) {
    const rng = createPrng(seed);
    const list = [];
    for (let t = 0; t < endTick; t++) {
        if (randInt(rng, 14) !== 0) continue;
        const n = randInt(rng, 6) === 0 ? 1 + randInt(rng, 4) : 1;
        for (let i = 0; i < n; i++) list.push([t, 'LRJS'[randInt(rng, 4)]]);
    }
    return encodeInputs(list);
}

/** Kapı sonuçları: seed'e bağlı, çoğu doğru (çarpan x5'e ulaşabilsin). */
function corrects(seed, n) {
    const rng = createPrng(seed ^ 0x9e3779b9);
    const out = [];
    for (let k = 0; k < n; k++) out.push(randInt(rng, 5) !== 0);
    return out;
}

function runSpecs() {
    return [
        {
            name: 'bot-20-kapi',
            note: 'bot, 21 kapı geçer (VMAX dahil), x5 çarpan',
            seed: 424242,
            gateCount: 30,
            make: (s) => botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: 7, stop: (sim) => sim.state.gates.length >= 21 }),
        },
        {
            name: 'bot-kalkan',
            note: 'bot kalkanı alır, sonra girdisiz: kalkan kırılır, dokunulmazlık, sonra çarpma',
            seed: 1001,
            gateCount: 30,
            make: (s) => botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: s.seed, stop: (sim) => sim.state.shield, idleAfter: 20000, extraTicks: 120 }),
            check: (sim) => sim.state.shieldBreaks > 0 && sim.state.crashed,
        },
        {
            name: 'bot-miknatis',
            note: 'bot mıknatıs alır, 900 tick daha oynar',
            seed: 2001,
            gateCount: 30,
            make: (s) => {
                const r = botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: s.seed, stop: (sim) => sim.state.magnetTicks > 0 });
                runBot(r.sim, { botSeed: 99, maxTicks: r.sim.state.tick + 900 });
                return { inputs: r.sim.encodeInputs(), endTick: r.sim.state.tick, sim: r.sim };
            },
        },
        {
            name: 'bot-antrenman',
            note: 'kapısız (misafir) koşu, 2500 m',
            seed: 7,
            gateCount: 0,
            make: (s) => botRun({ seed: s.seed, gateCount: 0, botSeed: 3, until: { z: 2500000 } }),
        },
        {
            name: 'bot-5-kapi',
            note: '5 kapılı koşu; son kapıdan sonra normal pist',
            seed: 0xfffffffe,
            gateCount: 5,
            make: (s) => botRun({ seed: s.seed, gateCount: 5, botSeed: 11, until: { tick: 16000 } }),
        },
        {
            name: 'bot-carpma',
            note: 'bot 4000 tick oynar, sonra girdisiz çarpar; endTick çarpmadan sonra',
            seed: 0xdeadbeef,
            gateCount: 30,
            make: (s) => botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: 5, until: { tick: 4000 }, idleAfter: 20000, extraTicks: 600 }),
            check: (sim) => sim.state.crashed,
        },
        {
            name: 'bot-kisa',
            note: 'kısa koşu, crash yok, çarpma sınırında kesilir',
            seed: 1,
            gateCount: 30,
            make: (s) => botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: 1, until: { tick: 1800 } }),
        },
        {
            name: 'girdisiz',
            note: 'hiç girdi yok: ilk orta şerit engelinde erken ölüm',
            seed: 31337,
            gateCount: 30,
            make: () => ({ inputs: '', endTick: 6000 }),
        },
        {
            name: 'kenar-durumlar',
            note: 'aynı tick J+S, yeniden zıplama tick\'inde S, çift kaydırma, tampon, 4 girdi/tick',
            seed: 55,
            gateCount: 30,
            make: () => ({
                inputs: '30J,0S,20J,36J,5S,8J,0S,0L,0L,30R,0R,0R,0R,40J,30J,10S,40L,20R,0J,15S',
                endTick: 600,
            }),
        },
        { name: 'rastgele-1', note: 'rastgele girdi, yan çarpmayla ölüm', seed: 3032, gateCount: 30, make: (s) => ({ inputs: randomInputs(s.seed, 6000), endTick: 6000 }) },
        { name: 'rastgele-2', note: 'rastgele girdi', seed: 3002, gateCount: 30, make: (s) => ({ inputs: randomInputs(s.seed, 6000), endTick: 6000 }) },
        { name: 'rastgele-3', note: 'rastgele girdi, çok sendeleme', seed: 3016, gateCount: 30, make: (s) => ({ inputs: randomInputs(s.seed, 6000), endTick: 6000 }) },
        { name: 'rastgele-4', note: 'rastgele girdi, kapısız', seed: 3052, gateCount: 0, make: (s) => ({ inputs: randomInputs(s.seed, 5000), endTick: 5000 }) },
    ];
}

function buildRun(spec) {
    const made = spec.make(spec);
    if (spec.check && !spec.check(made.sim)) {
        throw new Error('Altın koşu "' + spec.name + '" beklenen senaryoyu üretmedi.');
    }
    const endTick = Math.min(made.endTick, C.MAX_TICKS);
    const r = replay({ seed: spec.seed, gateCount: spec.gateCount, inputs: made.inputs, endTick, checkpointEvery: CHECKPOINT_EVERY });
    const correct = corrects(spec.seed, r.gates.length);
    const score = computeScore({ segMm: r.segMm, coins: r.coins, gates: r.gates, correct });
    return {
        name: spec.name,
        note: spec.note,
        seed: spec.seed,
        gateCount: spec.gateCount,
        inputs: made.inputs,
        endTick,
        expected: {
            endTick: r.endTick,
            crashed: r.crashed,
            crashTick: r.crashTick,
            z: r.z,
            distanceM: r.distanceM,
            coins: r.coins,
            gates: r.gates,
            segMm: r.segMm,
            hash: r.hash,
            checkpoints: r.checkpoints,
        },
        correct,
        expectedScore: score,
    };
}

function buildGenerator(seed, gateCount, count) {
    const sim = createSim({ seed, gateCount });
    const chunks = [];
    for (let c = 0; c < count; c++) {
        const ch = sim.getChunk(c);
        chunks.push({
            index: ch.index,
            kind: ch.kind,
            obstacles: ch.obstacles.map((o) => ({ id: o.id, type: o.type, lane: o.lane, z0: o.z0, z1: o.z1 })),
            coins: ch.coins.map((o) => ({ id: o.id, lane: o.lane, z: o.z, y: o.y, taken: false })),
            powers: ch.powers.map((o) => ({ id: o.id, kind: o.kind, lane: o.lane, z: o.z, y: o.y, taken: false })),
        });
    }
    return { seed, gateCount, chunks };
}

/** golden.json içeriği (nesne). */
export function buildGolden() {
    return {
        simVersion: SIM_VERSION,
        patternsHash: fnv1aBytes(readFileSync(PATTERNS_PATH)),
        checkpointEvery: CHECKPOINT_EVERY,
        about: 'Herkesler Koşuyor altın fikstürleri — scripts/runner-golden.mjs üretir, elle düzenlemeyin. '
            + 'checkpoints: her adımdan sonra tick % checkpointEvery == 0 ise {tick, hash}. '
            + 'patternsHash: patterns.json baytlarının FNV-1a 32 özeti. '
            + 'generator: chunk 0..59, sim.getChunk biçiminde (taken hep false).',
        runs: runSpecs().map(buildRun),
        generator: [
            buildGenerator(1, 30, 60),
            buildGenerator(0xdeadbeef, 0, 60),
            buildGenerator(0xffffffff, 5, 60),
        ],
    };
}

/** Okunabilir ama küçük: üst düzey anahtarlar, koşular ve chunk'lar satır satır. */
export function serializeGolden(g) {
    const lines = ['{'];
    lines.push('"simVersion":' + JSON.stringify(g.simVersion) + ',');
    lines.push('"patternsHash":' + JSON.stringify(g.patternsHash) + ',');
    lines.push('"checkpointEvery":' + JSON.stringify(g.checkpointEvery) + ',');
    lines.push('"about":' + JSON.stringify(g.about) + ',');
    lines.push('"runs":[');
    lines.push(g.runs.map((r) => JSON.stringify(r)).join(',\n'));
    lines.push('],');
    lines.push('"generator":[');
    lines.push(g.generator.map((gen) => '{"seed":' + gen.seed + ',"gateCount":' + gen.gateCount + ',"chunks":[\n'
        + gen.chunks.map((ch) => JSON.stringify(ch)).join(',\n') + '\n]}').join(',\n'));
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
    const fixture = resolve(backend, 'tests/Fixtures/runner/golden.json');
    mkdirSync(dirname(fixture), { recursive: true });
    writeFileSync(fixture, text);
    console.log('yazıldı: ' + fixture);
    const patterns = resolve(backend, 'app/Services/Game/Runner/patterns.json');
    mkdirSync(dirname(patterns), { recursive: true });
    copyFileSync(PATTERNS_PATH, patterns);
    console.log('kopyalandı: ' + patterns);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main();
}
