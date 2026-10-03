/*
 * Deterministik kule simülasyonu (şartname §B.1).
 *
 * Saf modül: DOM, three, zaman ya da Math.random yok; yalnızca tamsayı
 * aritmetiği. PHP karşılığı TowerSim.php satır satır bu dosyanın portudur:
 * aynı girdiler ⇒ iki tarafta bit-bit aynı durum (golden.json). Rastgelelik
 * yok; sunucunun verdiği seed yalnızca renk paleti içindir (görsel).
 *
 * Tick adımı (sırası SABİT):
 *  1. Girdiler geldiği sırayla:
 *     T → phase 'moving' ise yerleştir; değilse etkisiz (kayıtta kalır).
 *     A/B → phase 'question' ise şık 0/1 cevabı; değilse etkisiz.
 *  2. Bu tick'te yerleştirme ya da cevap OLMADIYSA faz ilerler:
 *     moving   → t++; off = offsetAt(t, v)
 *     spawn    → wait > 0 ise wait--; wait == 0 ise kat floor+1 doğar
 *                (t = 0, off = -R, v = speedFor(k), axis = k tekse x)
 *     question → qt++; qt >= QUESTION_TICKS ise cevapsız (choice -1)
 *  3. tick++ (çarpma olan adımda da).
 *
 * Şartnamenin açık bıraktığı ve burada seçilen yorumlar (PHP ile aynı olmalı):
 *  - Oyun 'spawn' fazında wait = 0 ile başlar: kat 1 ilk adımda (tick 0) doğar.
 *    Sonraki katlar yerleştirme/cevap adımından SPAWN_DELAY adım sonra doğar
 *    (yerleştirme tick P ise doğma P + SPAWN_DELAY).
 *  - Doğma adımındaki girdi o kata etki etmez (girdiler adımın başında işlenir,
 *    o anda faz hâlâ 'spawn'); kat ilk kez bir sonraki adımda t = 0, off = -R
 *    iken dokunulabilir.
 *  - Iska kontrolü mükemmelden ÖNCE: a >= s ise ıska (dar katta |off| <= 90
 *    olsa bile örtüşme yoksa kat oturmaz).
 *  - Büyüme merkezi tam korur: her yana g = min(GROW, floor((MAX_W - s) / 2)).
 *    Hızlar ve R çift olduğundan ofsetler, dolayısıyla boylar hep çifttir:
 *    floor yalnızca güvenlik içindir, yarım birim hiç oluşmaz.
 *  - Soru: yerleştirme adımında phase 'question', qt = 0. Aynı adımdaki sonraki
 *    girdi (A/B) cevap sayılır. Zaman aşımı soru katının tick'i + 480'de.
 *    answers[].tick = cevabın (ya da zaman aşımının) işlendiği adımın tick'i.
 *  - Iska: crashed = true, phase 'over', floor son yerleşen katta kalır,
 *    crashTick = ıskanın tick'i. MAX_TICKS'e ulaşınca step() hiçbir şey yapmaz.
 *  - off yerleştirmede dokunulan andaki değerinde kalır (motor ıskada düşen
 *    katı oradan çizer); mükemmelde kat yine de off = 0 kabul edilerek oturur.
 */
import { TC, axisFor, isQuestionFloor, offsetAt, speedFor } from './constants.js';
import { towerStateHash } from './hash.js';
import { decodeTowerInputs, encodeTowerInputs } from './inputs.js';

function checkQuestionCount(questionCount) {
    if (!Number.isInteger(questionCount) || questionCount < 0 || questionCount > TC.MAX_QUESTIONS) {
        throw new RangeError('Geçersiz soru sayısı.');
    }
}

function initialState() {
    const h = TC.BASE_HALF;
    return {
        tick: 0,
        phase: 'spawn', // 'spawn' | 'moving' | 'question' | 'over'
        floor: 0, // son yerleşen kat (taban 0)
        prev: { x0: -h, x1: h, z0: -h, z1: h }, // son yerleşen katın aralıkları
        axis: axisFor(1), // hareketli (ya da sıradaki) katın ekseni
        off: -TC.R, // hareketli katın ofseti
        v: speedFor(1), // hareketli (ya da sıradaki) katın hızı
        t: 0, // hareketli kat doğduğundan beri geçen tick (t')
        wait: 0, // doğmaya kalan tick
        qt: 0, // soru açıldığından beri geçen tick
        combo: 0,
        maxCombo: 0,
        perfects: 0,
        basePoints: 0,
        qIndex: 0,
        crashed: false,
        crashTick: null,
        answers: [], // [{index, choice, tick}]
    };
}

function copyState(s) {
    const answers = [];
    for (let i = 0; i < s.answers.length; i++) {
        const a = s.answers[i];
        answers.push({ index: a.index, choice: a.choice, tick: a.tick });
    }
    return {
        tick: s.tick,
        phase: s.phase,
        floor: s.floor,
        prev: { x0: s.prev.x0, x1: s.prev.x1, z0: s.prev.z0, z1: s.prev.z1 },
        axis: s.axis,
        off: s.off,
        v: s.v,
        t: s.t,
        wait: s.wait,
        qt: s.qt,
        combo: s.combo,
        maxCombo: s.maxCombo,
        perfects: s.perfects,
        basePoints: s.basePoints,
        qIndex: s.qIndex,
        crashed: s.crashed,
        crashTick: s.crashTick,
        answers,
    };
}

/**
 * Yeni kule oyunu.
 *  questionCount 0..255 (misafir antrenmanında 0: soru katı yok)
 */
export function createTowerSim({ questionCount = 0 } = {}) {
    checkQuestionCount(questionCount);
    return makeSim(questionCount, initialState(), [], []);
}

function makeSim(questionCount, state, recorded, pendingInit) {
    const s = state;

    // Bir sonraki step'te uygulanacak girdiler (en fazla MAX_INPUTS_PER_TICK).
    const pending = ['', ''];
    let pendingLen = 0;
    for (let i = 0; i < pendingInit.length; i++) pending[pendingLen++] = pendingInit[i];

    // Olay dizisi ve nesneleri yeniden kullanılır: step() içinde allocation yok
    // (yalnızca cevapta answers'a bir kayıt eklenir). Tüketici olayları bir
    // sonraki step'e kadar okumalı, referans saklamamalı.
    const events = [];
    const pool = [];
    const cuts = [];

    function emit(type) {
        const n = events.length;
        let e = pool[n];
        if (e === undefined) {
            e = { type: '', floor: -1, axis: null, perfect: false, combo: 0, grew: 0, cut: null, index: -1, choice: -1 };
            pool.push(e);
            cuts.push({ axis: 'x', from: 0, to: 0 });
        }
        e.type = type;
        e.floor = -1;
        e.axis = null;
        e.perfect = false;
        e.combo = 0;
        e.grew = 0;
        e.cut = null;
        e.index = -1;
        e.choice = -1;
        events.push(e);
        return e;
    }

    function spawn() {
        const k = s.floor + 1;
        s.phase = 'moving';
        s.axis = axisFor(k);
        s.v = speedFor(k);
        s.t = 0;
        s.off = -TC.R;
        const e = emit('spawn');
        e.floor = k;
        e.axis = s.axis;
    }

    function place(tick) {
        const p = s.prev;
        const isX = s.axis === 'x';
        const lo = isX ? p.x0 : p.z0;
        const hi = isX ? p.x1 : p.z1;
        const size = hi - lo;
        const off = s.off;
        const a = off < 0 ? -off : off;
        const k = s.floor + 1;

        if (a >= size) {
            s.crashed = true;
            s.crashTick = tick;
            s.phase = 'over';
            emit('miss').floor = k;
            return;
        }

        let nlo = lo;
        let nhi = hi;
        let grew = 0;
        const perfect = a <= TC.PERFECT;
        const e = emit('place');
        if (perfect) {
            s.combo++;
            s.perfects++;
            if (s.combo >= 2) {
                const room = Math.floor((TC.MAX_W - size) / 2);
                grew = room < TC.GROW ? room : TC.GROW; // boy ≤ 3000 → room ≥ 0
                nlo -= grew;
                nhi += grew;
            }
        } else {
            // Yeni aralık = önceki ∩ (önceki + off); dışarıda kalan parça düşer.
            s.combo = 0;
            const cut = cuts[events.length - 1];
            cut.axis = s.axis;
            if (off > 0) {
                nlo = lo + off;
                cut.from = hi;
                cut.to = hi + off;
            } else {
                nhi = hi + off;
                cut.from = lo + off;
                cut.to = lo;
            }
            e.cut = cut;
        }
        if (s.combo > s.maxCombo) s.maxCombo = s.combo;
        const capped = s.combo < TC.PERFECT_COMBO_CAP ? s.combo : TC.PERFECT_COMBO_CAP;
        s.basePoints += TC.FLOOR_POINTS + (perfect ? TC.PERFECT_POINTS * capped : 0);
        if (isX) {
            p.x0 = nlo;
            p.x1 = nhi;
        } else {
            p.z0 = nlo;
            p.z1 = nhi;
        }
        s.floor = k;

        e.floor = k;
        e.perfect = perfect;
        e.combo = s.combo;
        e.grew = grew;

        if (isQuestionFloor(k) && s.qIndex < questionCount) {
            s.phase = 'question';
            s.qt = 0;
            emit('question').index = s.qIndex;
        } else {
            s.phase = 'spawn';
            s.wait = TC.SPAWN_DELAY;
        }
    }

    function answer(choice, tick) {
        s.answers.push({ index: s.qIndex, choice, tick });
        const e = emit('answer');
        e.index = s.qIndex;
        e.choice = choice;
        s.qIndex++;
        s.phase = 'spawn';
        s.wait = TC.SPAWN_DELAY;
    }

    /** Bir tick (adım sırası SABİT, dosya başına bak). Olay dizisini döner. */
    function step() {
        events.length = 0;
        if (s.phase === 'over' || s.tick >= TC.MAX_TICKS) {
            pendingLen = 0;
            return events;
        }
        const tick = s.tick;

        // 1. Girdiler (geldiği sırayla)
        let acted = false;
        for (let i = 0; i < pendingLen; i++) {
            const code = pending[i];
            if (code === 'T') {
                if (s.phase === 'moving') {
                    place(tick);
                    acted = true;
                }
            } else if (s.phase === 'question') {
                answer(code === 'A' ? 0 : 1, tick);
                acted = true;
            }
        }
        pendingLen = 0;

        // 2. Faz ilerlemesi (bu tick'te yerleştirme/cevap olmadıysa)
        if (!acted) {
            if (s.phase === 'moving') {
                s.t++;
                s.off = offsetAt(s.t, s.v);
            } else if (s.phase === 'spawn') {
                if (s.wait > 0) s.wait--;
                if (s.wait === 0) spawn();
            } else if (s.phase === 'question') {
                s.qt++;
                if (s.qt >= TC.QUESTION_TICKS) answer(-1, tick);
            }
        }

        // 3.
        s.tick++;
        return events;
    }

    /**
     * 'T'|'A'|'B' → bir sonraki step'te uygulanır ve kayda girer.
     * Kabul edilmezse false: ıska/süre sonu sonrası, geçersiz kod, aynı tick'te
     * 2'den fazla ya da kayıt sınırı (6000) dolmuş. Kaydedilmeyen girdi
     * uygulanmaz da — yoksa sunucudaki replay istemciden ayrışırdı.
     * Etkisiz girdi (doğma beklemesinde T, soru dışında A/B) de kaydedilir;
     * motor yalnızca phase 'moving' iken T, 'question' iken A/B göndermeli.
     */
    function input(code) {
        if (s.phase === 'over' || s.tick >= TC.MAX_TICKS) return false;
        if (code !== 'T' && code !== 'A' && code !== 'B') return false;
        if (pendingLen >= TC.MAX_INPUTS_PER_TICK || recorded.length >= TC.MAX_INPUT_TOKENS) return false;
        pending[pendingLen++] = code;
        recorded.push([s.tick, code]);
        return true;
    }

    /**
     * Durumu ve bekleyen girdileri kopyalar (bot ileri bakışı).
     * { record: false } girdi kaydını kopyalamaz.
     */
    function clone(opts) {
        const rec = opts && opts.record === false ? [] : recorded.slice();
        return makeSim(questionCount, copyState(s), rec, pending.slice(0, pendingLen));
    }

    return {
        state: s,
        questionCount,
        input,
        step,
        clone,
        encodeInputs: () => encodeTowerInputs(recorded),
        inputCount: () => recorded.length,
    };
}

function toInputList(inputs, endTick) {
    if (typeof inputs === 'string') return decodeTowerInputs(inputs, endTick);
    if (Array.isArray(inputs)) return decodeTowerInputs(encodeTowerInputs(inputs), endTick);
    throw new RangeError('Girdi kaydı bozuk.');
}

/**
 * Sunucudaki doğrulamanın birebiri: endTick adım ya da ıskaya kadar koşturur.
 * Döner: {endTick (atılan adım), crashed, crashTick|null, floor, perfects,
 * maxCombo, basePoints, answers:[{index, choice, tick}], hash}.
 * inputs: girdi stringi ya da [[tick, kod], ...]. seed kabul edilir ama
 * kullanılmaz (yalnızca görsel). checkpointEvery verilirse her N tick'te
 * (adımdan sonra tick % N === 0) {tick, hash} kaydı döner (fikstürler).
 */
export function replayTower({ questionCount, inputs, endTick, checkpointEvery = 0 }) {
    if (!Number.isInteger(endTick) || endTick < 0 || endTick > TC.MAX_TICKS) {
        throw new RangeError('Oyun süresi geçersiz.');
    }
    const list = toInputList(inputs, endTick);
    const sim = createTowerSim({ questionCount });
    const s = sim.state;
    const checkpoints = [];
    let i = 0;
    while (s.tick < endTick && !s.crashed) {
        while (i < list.length && list[i][0] === s.tick) {
            sim.input(list[i][1]);
            i++;
        }
        sim.step();
        if (checkpointEvery > 0 && s.tick % checkpointEvery === 0) {
            checkpoints.push({ tick: s.tick, hash: towerStateHash(s) });
        }
    }
    const out = {
        endTick: s.tick,
        crashed: s.crashed,
        crashTick: s.crashTick,
        floor: s.floor,
        perfects: s.perfects,
        maxCombo: s.maxCombo,
        basePoints: s.basePoints,
        answers: s.answers.map((a) => ({ index: a.index, choice: a.choice, tick: a.tick })),
        hash: towerStateHash(s),
    };
    if (checkpointEvery > 0) out.checkpoints = checkpoints;
    return out;
}
