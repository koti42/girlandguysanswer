/*
 * İleriye bakan arama botu (şartname §3.9, v2 §A.7).
 *
 * YALNIZCA testler ve fikstür üreticisi (scripts/runner-golden.mjs) içindir;
 * index.js'ten dışa aktarılmaz, üretim paketine girmez.
 *
 * Yöntem: mevcut planı sim.clone() üzerinde H tick ileri koşturur. Kötü bir
 * olay (çarpma, sendeleme ya da kalkan kırılması) görürse o andan başlayarak
 * {L, R, J, S, L+J, R+J, L+S, R+S, L+L, R+R} eylemlerini farklı tick'lerde klonlayıp dener;
 * derinlik 1'den 3'e artan aramayla (iterative deepening) ufka kadar temiz
 * geçen ilk planı seçer. Bulamazsa en uzun hayatta kalanı uygular. Boşta orta
 * şeride döner (iki yana da kaçabilsin), güçlendirme görürse onun şeridine,
 * kapı yaklaşırken seed'li rastgele bir şeride geçer.
 *
 * v2: arama aynı (arabaya zıplayıp çıkmak, araba çatısından otobüse ya da
 * Süper Zıplamayla otobüse çıkmak da birer J zamanlamasıdır). Ek olarak
 * `roofs` açıkken (varsayılan) öndeki rampanın şeridine geçip çatıya tırmanır,
 * çatıdayken şerit değiştirmez: geçilebilirlik testleri çatı düşüşlerini ve
 * iniş alanlarını da sınasın. Süper Zıplama varken tepe daha geç geldiğinden
 * zıplama penceresi genişler.
 */
import { C, laneX, zGate } from './constants.js';
import { createPrng, randInt } from './prng.js';

// Aynı tick'te iki kaydırma (LL/RR) iki şerit birden geçmek içindir.
const ACTIONS = [['L'], ['R'], ['J'], ['S'], ['L', 'J'], ['R', 'J'], ['L', 'S'], ['R', 'S'], ['L', 'L'], ['R', 'R']];
const NO_RECORD = { record: false };
const NONE = [];
// J'nin işe yarayabileceği en erken an (kötü andan geriye, tick): normal tepe
// ≈ 20, otobüs çatısına Süper Zıplama 18..40 tick sonra yetişir.
const JUMP_WINDOW = 36;
const SUPER_WINDOW = 44;
// Rampa arama aralığı (mm, oyuncunun önü).
const ROOF_MIN_AHEAD = 6000;
const ROOF_MAX_AHEAD = 40000;

/**
 * Planı (sıralı [tick, kod] listesi, pi'den itibaren) untilTick'e kadar uygular.
 * İlk kötü olayın tick'ini, temizse -1 döner. Simülasyonu değiştirir.
 */
function rollout(sim, plan, pi, untilTick) {
    const s = sim.state;
    const st0 = s.stumbles;
    const sb0 = s.shieldBreaks;
    // MAX_TICKS'te step etkisizdir: tick ilerlemezse döngü sonsuza kadar sürerdi.
    const end = untilTick < C.MAX_TICKS ? untilTick : C.MAX_TICKS;
    while (s.tick < end) {
        while (pi < plan.length && plan[pi][0] < s.tick) pi++;
        while (pi < plan.length && plan[pi][0] === s.tick) {
            sim.input(plan[pi][1]);
            pi++;
        }
        const t = s.tick;
        sim.step();
        if (s.crashed || s.stumbles !== st0 || s.shieldBreaks !== sb0) return t;
    }
    return -1;
}

function actionAllowed(a, lane, t, bad, jumpWin) {
    let l = lane;
    for (let i = 0; i < a.length; i++) {
        if (a[i] === 'L') {
            if (l === 0) return false;
            l--;
        } else if (a[i] === 'R') {
            if (l === C.LANE_COUNT - 1) return false;
            l++;
        }
    }
    const hasJ = a.indexOf('J') >= 0;
    const hasS = a.indexOf('S') >= 0;
    // Zıplama ancak tepe penceresi kötü ana denk gelirse işe yarar; kayma 40 tick sürer.
    if (hasJ && (t < bad - jumpWin || t > bad - 1)) return false;
    if (hasS && t < bad - 40) return false;
    return true;
}

function candidateTimes(t0, bad, win) {
    const out = [];
    const near = bad - win - 4 > t0 ? bad - win - 4 : t0;
    for (let t = t0; t < near; t += 4) out.push(t);
    for (let t = near; t <= bad; t += 2) out.push(t);
    return out;
}

/**
 * base: karar anındaki simülasyon (değiştirilmez). floorBad: üst seviyenin
 * kötü anı — bu eylem durumu kötüleştirdiyse derine inmeye değmez.
 */
function search(base, hEnd, depth, ctx, floorBad) {
    ctx.budget--;
    const bad = rollout(base.clone(NO_RECORD), NONE, 0, hEnd);
    if (bad < 0) return { plan: [], reach: hEnd, partial: [] };
    const best = { plan: null, reach: bad, partial: [] };
    if (depth === 0 || bad < floorBad || ctx.budget <= 0) return best;

    const t0 = base.state.tick;
    const cur = base.clone(NO_RECORD);
    const times = candidateTimes(t0, bad, base.state.superTicks > 0 ? SUPER_WINDOW : JUMP_WINDOW);
    for (let ti = 0; ti < times.length; ti++) {
        const t = times[ti];
        while (cur.state.tick < t && !cur.state.crashed && cur.state.tick < C.MAX_TICKS) cur.step();
        if (cur.state.crashed || cur.state.tick !== t) break;
        for (let ai = 0; ai < ACTIONS.length; ai++) {
            const a = ACTIONS[ai];
            const jumpWin = cur.state.superTicks > 0 ? SUPER_WINDOW : JUMP_WINDOW;
            if (!actionAllowed(a, cur.state.lane, t, bad, jumpWin)) continue;
            const c = cur.clone(NO_RECORD);
            for (let k = 0; k < a.length; k++) c.input(a[k]);
            const sub = search(c, hEnd, depth - 1, ctx, bad);
            const head = a.map((code) => [t, code]);
            if (sub.plan) return { plan: head.concat(sub.plan), reach: hEnd, partial: [] };
            if (sub.reach > best.reach) {
                best.reach = sub.reach;
                best.partial = head.concat(sub.partial);
            }
            if (ctx.budget <= 0) return best;
        }
    }
    return best;
}

/**
 * Derinlik 1'den 3'e artan arama. Ufka kadar temiz plan yoksa, sorunu
 * `goodEnough` tick'ten daha ileri iten en iyi kısmi plan da kabul edilir:
 * bot o sorun yaklaşınca zaten yeniden arar (ufuk o zaman daha ileride olur).
 */
function findPlan(sim, horizon, goodEnough) {
    const t0 = sim.state.tick;
    const hEnd = t0 + horizon;
    let best = null;
    for (let depth = 1; depth <= 3; depth++) {
        const ctx = { budget: 2000 * depth };
        const r = search(sim, hEnd, depth, ctx, -1);
        if (r.plan) return { plan: r.plan, ok: true };
        if (best === null || r.reach > best.reach) best = r;
        if (best.reach - t0 > goodEnough) return { plan: best.partial, ok: true };
    }
    return { plan: best.partial, ok: false };
}

/** Boştayken gidilmek istenen şerit (-1: fark etmez). */
function desiredLane(sim, bot) {
    const s = sim.state;
    const k = s.gates.length;
    if (k < sim.gateCount && zGate(k) - s.z <= 2 * C.CHUNK_LEN) {
        if (bot.gateFor !== k) {
            bot.gateFor = k;
            bot.gateLane = randInt(bot.rng, C.LANE_COUNT);
        }
        return bot.gateLane;
    }
    // Çatıdayken yerinde kal: çatının sonunda kendiliğinden düşer.
    if (s.grounded && s.y > 0) return -1;
    if (bot.roofs) {
        const c0 = Math.floor(s.z / C.CHUNK_LEN);
        for (let c = c0; c <= c0 + 1; c++) {
            const obs = sim.getChunk(c).obstacles;
            for (let i = 0; i < obs.length; i++) {
                const o = obs[i];
                // Şerit değiştirip rampanın önüne yetişecek kadar uzaktaki ilk rampa.
                if (o.type === 'ramp' && o.z0 - s.z > ROOF_MIN_AHEAD && o.z0 - s.z < ROOF_MAX_AHEAD) return o.lane;
            }
        }
    }
    if (bot.chase) {
        const c0 = Math.floor(s.z / C.CHUNK_LEN);
        for (let c = c0; c <= c0 + 1; c++) {
            const ch = sim.getChunk(c);
            for (let i = 0; i < ch.powers.length; i++) {
                const p = ch.powers[i];
                if (!p.taken && p.z > s.z && p.z - s.z < 40000) return p.lane;
            }
        }
    }
    return bot.homeLane;
}

/**
 * Botu sim üzerinde koşturur. Durma koşulları: crash, maxTicks, untilZ ya da
 * stop(sim) true. Girdiler sim'in kaydına normal yoldan (sim.input) girer.
 * Seçenekler: horizon, checkEvery, replanWithin, botSeed, chase (güçlendirme
 * kovala), roofs (rampalara tırman), homeLane (boştayken dönülen şerit, -1:
 * olduğu yerde kal), stop, stopOnFail.
 * Dönen: { crashed, stumbles, shieldBreaks, replans, failedPlans, roofLandings }.
 */
export function runBot(sim, opts = {}) {
    const s = sim.state;
    const maxTicks = opts.maxTicks ?? C.MAX_TICKS;
    const untilZ = opts.untilZ ?? Infinity;
    const horizon = opts.horizon ?? 100;
    const checkEvery = opts.checkEvery ?? 5;
    const replanWithin = opts.replanWithin ?? 60;
    const stop = opts.stop || null;
    const bot = {
        rng: createPrng(opts.botSeed ?? 1),
        chase: opts.chase !== false,
        roofs: opts.roofs !== false,
        homeLane: opts.homeLane ?? 1,
        gateFor: -1,
        gateLane: 1,
    };
    let plan = [];
    let pi = 0;
    let nextCheck = s.tick;
    let replans = 0;
    let failedPlans = 0;

    while (!s.crashed && s.tick < maxTicks && s.tick < C.MAX_TICKS && s.z < untilZ) {
        if (stop && stop(sim)) break;
        const t = s.tick;
        // İleri bakışta klonlar aynı chunk'ları yeniden üretmesin.
        const ahead = Math.floor((s.z + horizon * C.VMAX + C.MAGNET_REACH_AHEAD) / C.CHUNK_LEN);
        for (let c = Math.floor(s.z / C.CHUNK_LEN); c <= ahead; c++) sim.getChunk(c);

        while (pi < plan.length && plan[pi][0] < t) pi++;
        if (t >= nextCheck) {
            nextCheck = t + checkEvery;
            const bad = rollout(sim.clone(NO_RECORD), plan, pi, t + horizon);
            // Uzaktaki sorun için henüz arama yapma: ufuk ilerledikçe daha iyi plan bulunur.
            if (bad >= 0 && bad - t <= replanWithin) {
                const r = findPlan(sim, horizon, replanWithin + 10);
                replans++;
                if (!r.ok) {
                    failedPlans++;
                    nextCheck = t + 1;
                    if (opts.stopOnFail) break;
                }
                plan = r.plan;
                pi = 0;
            } else if (bad < 0 && pi >= plan.length && s.x === laneX(s.lane)) {
                const want = desiredLane(sim, bot);
                if (want >= 0 && want !== s.lane) {
                    const cand = [[t, want < s.lane ? 'L' : 'R']];
                    if (rollout(sim.clone(NO_RECORD), cand, 0, t + horizon) < 0) {
                        plan = cand;
                        pi = 0;
                    }
                }
            }
        }
        while (pi < plan.length && plan[pi][0] === t) {
            sim.input(plan[pi][1]);
            pi++;
        }
        sim.step();
    }
    return {
        crashed: s.crashed,
        stumbles: s.stumbles,
        shieldBreaks: s.shieldBreaks,
        replans,
        failedPlans,
        roofLandings: s.roofLandings,
    };
}
