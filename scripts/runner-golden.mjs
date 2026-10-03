/*
 * "Herkesler Koşuyor" altın fikstür üreticisi (şartname v1 §3.10, v2 §A.7).
 *
 *   node scripts/runner-golden.mjs [backend-dizini]
 *
 * JS simülasyonunun ürettiği koşuları ve pist içeriğini golden.json'a yazar;
 * PHP portu (RunnerSim) aynı dosyayı birebir geçmek zorunda. Yazılanlar:
 *   - src/game/runner/sim/__fixtures__/golden.json
 *   - <backend>/tests/Fixtures/runner/golden.json            (birebir kopya)
 *   - <backend>/app/Services/Game/Runner/patterns.json       (desenlerin kanonik JSON'u)
 * Backend dizini verilmezse frontend'in kardeşi ../girlsandguys-api-v10 denenir;
 * yoksa yalnızca frontend dosyası yazılır.
 *
 * Desenler JS modülünde (src/game/runner/sim/patterns.js); PHP için kanonik
 * serileştirme JSON.stringify(nesne) — boşluksuz, anahtar sırası dosyadaki gibi —
 * patterns.json'a SONDA SATIR SONU OLMADAN yazılır. Böylece PHP dosya baytlarının
 * FNV-1a'sını alınca golden.json.patternsHash ile aynı sayıyı bulur.
 *
 * Çıktı tamamen deterministiktir (zaman/rastgelelik yok): aynı kod ve aynı
 * desenlerle yeniden üretmek bayt bayt aynı dosyayı verir — golden testi
 * bunu doğrular. Simülasyon ya da desenler değişirse bu betik yeniden çalıştırılır.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { C, SIM_VERSION, computeScore, createSim, encodeInputs, replay } from '../src/game/runner/sim/index.js';
import { runBot } from '../src/game/runner/sim/bot.js';
import { PATTERN_FILE } from '../src/game/runner/sim/generator.js';
import { fnv1aBytes } from '../src/game/runner/sim/hash.js';
import { createPrng, randInt } from '../src/game/runner/sim/prng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIM_DIR = resolve(ROOT, 'src/game/runner/sim');
export const GOLDEN_PATH = resolve(SIM_DIR, '__fixtures__/golden.json');
const CHECKPOINT_EVERY = 600;

/** Desen dosyasının kanonik JSON metni (PHP'ye giden patterns.json'un birebir içeriği). */
export function canonicalPatterns() {
    return JSON.stringify(PATTERN_FILE);
}

/** Kanonik metnin FNV-1a 32 özeti (UTF-8 baytları üzerinden). */
export function patternsHash() {
    return fnv1aBytes(new TextEncoder().encode(canonicalPatterns()));
}

/*
 * Durum gözcüleri: bot oynarken her tick çağrılır, senaryonun gerçekten
 * oluştuğunu (çatıya çıkış, süper zıplama ...) kaydeder.
 */
function watcher() {
    const w = { busRoof: 0, carRoof: 0, superJumps: 0, roofFalls: 0, wasRoof: false };
    w.see = (sim) => {
        const s = sim.state;
        const onBus = s.grounded && s.y === C.BUS_TOP;
        if (onBus && !w.wasRoof) w.busRoof++;
        if (s.grounded && s.y === C.CAR_TOP) w.carRoof++;
        if (!s.grounded && s.vy === C.SUPER_JUMP_V - C.GRAVITY) w.superJumps++;
        if (w.wasRoof && s.grounded && s.y === 0) w.roofFalls++;
        if (onBus) w.wasRoof = true;
        else if (s.grounded && s.y === 0) w.wasRoof = false;
        return false;
    };
    return w;
}

/** Bot koşusu: sim'i bot oynar, sonra isteğe bağlı "girdisiz" kuyruk. */
function botRun({ seed, gateCount, botSeed, until, stop, idleAfter = 0, extraTicks = 0 }) {
    const sim = createSim({ seed, gateCount });
    const w = watcher();
    runBot(sim, { botSeed, untilZ: until?.z, maxTicks: until?.tick, stop: (s) => w.see(s) || (stop ? stop(s) : false) });
    if (stop && !stop(sim)) throw new Error('Altın koşu koşulu sağlanmadı (seed ' + seed + ').');
    // Bot bırakınca oyuncu tuşa basmıyormuş gibi devam (kalkan/çarpma/düşme senaryoları).
    let guard = 0;
    while (idleAfter > 0 && !sim.state.crashed && guard++ < idleAfter) {
        sim.step();
        w.see(sim);
    }
    return { inputs: sim.encodeInputs(), endTick: sim.state.tick + extraTicks, sim, w };
}

/** Bot devam eder (aynı sim, kayıt sürer). */
function continueBot(r, botSeed, ticks) {
    runBot(r.sim, { botSeed, maxTicks: r.sim.state.tick + ticks, stop: (s) => r.w.see(s) });
    return { inputs: r.sim.encodeInputs(), endTick: r.sim.state.tick, sim: r.sim, w: r.w };
}

/** Oyuncunun önündeki (z, şerit) rampası; yoksa null. */
function rampNear(sim, lane, z) {
    const c0 = Math.floor(z / C.CHUNK_LEN);
    for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (c < 0) continue;
        for (const o of sim.getChunk(c).obstacles) {
            if (o.type === 'ramp' && o.lane === lane && z - C.PLAYER_HALF_D < o.z1 && z + C.PLAYER_HALF_D > o.z0) return o;
        }
    }
    return null;
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
            note: 'bot, 21 kapı geçer (VMAX dahil), x5 çarpan, çatılara tırmanır',
            seed: 424242,
            gateCount: 30,
            make: (s) => botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: 7, stop: (sim) => sim.state.gates.length >= 21 }),
            check: (r) => r.w.busRoof >= 5,
        },
        {
            name: 'bot-kalkan',
            note: 'bot kalkanı alır, sonra girdisiz: kalkan kırılır, dokunulmazlık, sonra çarpma',
            seed: 1001,
            gateCount: 30,
            make: (s) => botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: s.seed, stop: (sim) => sim.state.shield, idleAfter: 20000, extraTicks: 120 }),
            check: (r) => r.sim.state.shieldBreaks > 0 && r.sim.state.crashed,
        },
        {
            name: 'bot-miknatis',
            note: 'bot mıknatıs alır, 900 tick daha oynar',
            seed: 2001,
            gateCount: 30,
            make: (s) => continueBot(botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: s.seed, stop: (sim) => sim.state.magnetTicks > 0 }), 99, 900),
        },
        {
            name: 'bot-super-ziplama',
            note: 'bot Süper Zıplama alır, yerdeyken bir kez süper zıplar (keyfine), 700 tick daha oynar',
            seed: 5001,
            gateCount: 30,
            make: (s) => {
                const r = botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: 4, stop: (sim) => sim.state.superTicks > 0 && sim.state.grounded });
                r.sim.input('J');
                return continueBot(r, 4, 700);
            },
            check: (r) => r.w.superJumps > 0 && !r.sim.state.crashed,
        },
        {
            name: 'bot-cati-kosusu',
            note: 'kapısız, 2500 m: bot rampalardan otobüs çatılarına çıkar, çatıda koşar, düşüp yere iner',
            seed: 7,
            gateCount: 0,
            make: (s) => botRun({ seed: s.seed, gateCount: 0, botSeed: 3, until: { z: 2500000 } }),
            check: (r) => r.w.busRoof >= 3 && r.w.roofFalls >= 3,
        },
        {
            name: 'bot-araba',
            note: 'bot bir arabanın çatısına zıplayıp çıkar, 600 tick daha oynar',
            seed: 6001,
            gateCount: 30,
            make: (s) => continueBot(botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: 2, stop: (sim) => sim.state.grounded && sim.state.y === C.CAR_TOP }), 2, 600),
            check: (r) => r.w.carRoof > 0,
        },
        {
            name: 'catidan-dusus',
            note: 'bot otobüs çatısına çıkar, sonra girdisiz: çatı bitince düşer, yere iner, ileride çarpar',
            seed: 8001,
            gateCount: 30,
            make: (s) => botRun({ seed: s.seed, gateCount: s.gateCount, botSeed: 8, stop: (sim) => sim.state.grounded && sim.state.y === C.BUS_TOP, idleAfter: 20000, extraTicks: 60 }),
            check: (r) => r.w.roofFalls > 0 && r.sim.state.crashed,
        },
        {
            name: 'yan-rampa',
            note: 'komşu şeritteki rampanın ortasına yandan girilir: sendeleme (rampa yalnızca yandan çarpar)',
            seed: 9001,
            gateCount: 30,
            make: (s) => {
                const r = botRun({
                    seed: s.seed,
                    gateCount: s.gateCount,
                    botSeed: 9,
                    stop: (sim) => {
                        const st = sim.state;
                        if (!st.grounded || st.y !== 0 || st.x !== (st.lane - 1) * C.LANE_WIDTH || st.stumbleTicks > 0) return false;
                        for (const nl of [st.lane - 1, st.lane + 1]) {
                            if (nl < 0 || nl > 2) continue;
                            // 5 tick sonra rampa hâlâ yüksek ve uzun: yandan girişte çarpar.
                            const o = rampNear(sim, nl, st.z + 5 * sim.speed());
                            if (o && st.z + 5 * sim.speed() > o.z0 + 2500 && st.z + 8 * sim.speed() < o.z1) return true;
                        }
                        return false;
                    },
                });
                const st = r.sim.state;
                const nl = rampNear(r.sim, st.lane - 1, st.z + 5 * r.sim.speed()) ? st.lane - 1 : st.lane + 1;
                r.sim.input(nl < st.lane ? 'L' : 'R');
                const before = st.stumbles;
                for (let i = 0; i < 10 && st.stumbles === before; i++) r.sim.step();
                r.rampStumble = st.stumbles > before && rampNear(r.sim, nl, st.z) !== null;
                return { ...continueBot(r, 9, 600), rampStumble: r.rampStumble };
            },
            check: (r) => r.rampStumble === true,
        },
        {
            name: 'rampada-ziplama',
            note: 'yüksek hızda (>330 mm/tick) rampanın başında zıplanır: yüzey oyuncuyu yakalar, çatıya çıkılır',
            seed: 10001,
            gateCount: 0,
            make: (s) => {
                const r = botRun({
                    seed: s.seed,
                    gateCount: 0,
                    botSeed: 10,
                    stop: (sim) => sim.speed() >= 330 && sim.state.superTicks === 0 && sim.state.grounded && sim.state.y > 0 && sim.state.y < 600
                        && rampNear(sim, sim.state.lane, sim.state.z) !== null,
                });
                r.sim.input('J');
                const ev = r.sim.step();
                r.absorbed = ev.some((e) => e.type === 'jump') && ev.some((e) => e.type === 'land');
                r.w.see(r.sim);
                return { ...continueBot(r, 10, 400), absorbed: r.absorbed };
            },
            check: (r) => r.absorbed === true && !r.sim.state.crashed && r.w.busRoof > 0,
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
            check: (r) => r.sim.state.crashed,
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
        { name: 'rastgele-1', note: 'rastgele girdi: arabaya iner, otobüse yandan ikinci kez sürtünüp ölür', seed: 3098, gateCount: 30, make: (s) => ({ inputs: randomInputs(s.seed, 6000), endTick: 6000 }) },
        { name: 'rastgele-2', note: 'rastgele girdi: otobüs çatısına iner, bariyere çarpar', seed: 3116, gateCount: 30, make: (s) => ({ inputs: randomInputs(s.seed, 6000), endTick: 6000 }) },
        { name: 'rastgele-3', note: 'rastgele girdi: çok sendeleme, otobüse önden çarpma', seed: 3176, gateCount: 30, make: (s) => ({ inputs: randomInputs(s.seed, 6000), endTick: 6000 }) },
        { name: 'rastgele-4', note: 'rastgele girdi, kapısız: arabaya yandan çarpma', seed: 3135, gateCount: 0, make: (s) => ({ inputs: randomInputs(s.seed, 5000), endTick: 5000 }) },
    ];
}

function buildRun(spec) {
    const made = spec.make(spec);
    if (spec.check && !spec.check(made)) {
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
            obstacles: ch.obstacles.map((o) => ({ id: o.id, type: o.type, lane: o.lane, z0: o.z0, z1: o.z1, top: o.top })),
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
        patternsHash: patternsHash(),
        checkpointEvery: CHECKPOINT_EVERY,
        about: 'Herkesler Koşuyor altın fikstürleri (sim v2) — scripts/runner-golden.mjs üretir, elle düzenlemeyin. '
            + 'checkpoints: her adımdan sonra tick % checkpointEvery == 0 ise {tick, hash}. '
            + 'patternsHash: patterns.json baytlarının (desenlerin kanonik JSON metni, sonda satır sonu yok) FNV-1a 32 özeti. '
            + 'generator: chunk 0..59, sim.getChunk biçiminde (taken hep false; engellerde top).',
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
    writeFileSync(patterns, canonicalPatterns());
    console.log('yazıldı: ' + patterns + ' (kanonik, patternsHash ' + patternsHash() + ')');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main();
}
