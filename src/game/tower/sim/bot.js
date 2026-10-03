/*
 * Kule botları (şartname §B.1 "Bot/test").
 *
 * YALNIZCA testler ve fikstür üreticisi (scripts/tower-golden.mjs) içindir;
 * index.js'ten dışa aktarılmaz, üretim paketine girmez.
 *
 * Her katta "en iyi an" = katın ilk yaklaşmasında |off|'un en küçük olduğu t'.
 * Botlar dokunuşu bu ana göre planlar (dokunuş bir sonraki adımda o anki off
 * ile uygulanır, yani state.t === hedef iken input('T')):
 *  - perfect: tam o anda (off == 0 ya da ona en yakın; her zaman |off| <= 90)
 *  - late:    lateBy tick geç → her katta lateBy × v mm kırpılır, kule incelir
 *  - human:   en iyi ana ±jitter'lık üçgen dağılımlı sapma (insan zamanlaması)
 *  - random:  hareketli kat varken her tick 1/randomEvery olasılıkla dokunur
 * Sorular: answerAfter tick sonra seed'li rastgele şık; skipEvery > 0 ise her
 * skipEvery'inci soru cevapsız bırakılır (zaman aşımı).
 */
import { offsetAt } from './constants.js';

function prng(seed) {
    const x = seed >>> 0;
    return { x: x === 0 ? 0x6d2b79f5 : x };
}

function randInt(p, n) {
    let x = p.x;
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    p.x = x;
    return x % n;
}

/** Katın ilk yaklaşmasında |off|'un en küçük olduğu t' (t' = 0'dan taranır). */
export function bestTick(v) {
    let t = 0;
    let a = Math.abs(offsetAt(0, v));
    for (;;) {
        const b = Math.abs(offsetAt(t + 1, v));
        if (b >= a) return t;
        a = b;
        t++;
    }
}

/**
 * Botu sim üzerinde koşturur (sim değişir, girdiler kayda girer).
 * Durur: ıska, maxTicks, ya da floor >= maxFloors.
 */
export function runTowerBot(sim, {
    mode = 'perfect',
    botSeed = 1,
    maxTicks = Infinity,
    maxFloors = Infinity,
    lateBy = 3,
    jitter = 2,
    randomEvery = 40,
    answerAfter = 90,
    skipEvery = 0,
} = {}) {
    const s = sim.state;
    const rng = prng(botSeed);
    let target = -1; // bu kat için dokunuş t'si
    let targetFloor = -1;
    let questionsSeen = 0;
    let lastQ = -1;

    while (!s.crashed && s.tick < maxTicks && s.floor < maxFloors && s.tick < 108000) {
        if (s.phase === 'moving') {
            const k = s.floor + 1;
            if (targetFloor !== k) {
                targetFloor = k;
                const best = bestTick(s.v);
                if (mode === 'late') target = best + lateBy;
                else if (mode === 'human') target = best + randInt(rng, 2 * jitter + 1) - jitter + randInt(rng, 2 * jitter + 1) - jitter;
                else target = best;
                if (target < 0) target = 0;
            }
            if (mode === 'random') {
                if (randInt(rng, randomEvery) === 0) sim.input('T');
            } else if (s.t === target) {
                sim.input('T');
            }
        } else if (s.phase === 'question') {
            if (lastQ !== s.qIndex) {
                lastQ = s.qIndex;
                questionsSeen++;
            }
            const skip = skipEvery > 0 && questionsSeen % skipEvery === 0;
            if (!skip && s.qt === answerAfter) sim.input(randInt(rng, 2) === 0 ? 'A' : 'B');
        }
        sim.step();
    }
    return sim;
}
