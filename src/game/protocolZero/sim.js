/*
 * PROTOCOL: ZERO simülasyon motoru (saf JS, three/React bilmez).
 *
 *   const sim = createSim('normal', { seed });
 *   const events = tick(sim, dtSeconds);     // sim saniyesi (gerçek dt × hız)
 *   upgradeFirewall(sim, 'ist'); purge(sim, 'ist'); toggleIsolate(sim, 'ist'); buyTech(sim, 'hunter');
 *   chooseDilemma(sim, 0); breachResolve(sim, true);
 *   snapshot(sim) → HUD/küre için düz veri;  summary(sim) → skor ve sunucuya gidecek özet.
 *
 * Kurallar (saniye başına, dt ile ölçeklenir):
 *  - Yayılım: enfeksiyonu %20'yi aşan ve izole olmayan düğüm, izole olmayan komşularına
 *    spread × (kaynak/100) × 1.7 / hedef.firewall^eff hızında sızar. Her enfekte düğüm kendi içinde
 *    spread × 0.85 / firewall^eff büyür (izoleyse ~yarısı). spread = zorluk × (1 + aiAdapt × gün/100) × (kalkan ? 0.65 : 1).
 *  - Ekonomi: izole olmayan her düğüm (computePower/120) × 0.9 × (1 − enf/100) ₵/sn kazandırır (çarpanlar: zorluk, fon, sıkıyönetim, kriz cezası).
 *  - Panik: baskı = Σ(izole 0.30 | ele geçirilmiş 0.35 | enf ≥ 60 → 0.12) × panicRate (sıkıyönetimde ×0.5); toparlanma 0.45 (+0.6 deepfake).
 *  - Deşifre: decryptBase × (1 + hızlandırıcılar) × temiz işlem gücü payı.
 *  - YZ her reseedEvery sn'de yeni bir arka kapı açar (deşifre %100 değilse). Sıfırıncı gün saldırısı (breach) ayrı zamanlayıcıda.
 *  - Baloncuklar (BUBBLES): mavi veri baloncuğu temiz bir düğümde belirir, patlatılırsa +₵ ve +deşifre; bir düğüm ilk
 *    kez enfekte olunca kızıl sızma baloncuğu çıkar, süresi içinde patlatılırsa ilk dalga bastırılır (düğüm %0).
 *  - Veri paketleri (harita trafiği) enfekte kaynaktan hedefe varınca küçük bir sızma ekler (packetArrive).
 *  - Zafer: deşifre %100 ya da (tüm düğümler %0 ve gün ≥ 30). Yenilgi: hakimiyet ≥ %99 ya da panik ≥ %100.
 */
import { BUBBLES, COSTS, DAY_SECONDS, DIFFICULTIES, DILEMMAS, NEIGHBORS, NODES, NODE_BY_ID, SERVERS_PER_TFLOPS, TECH_BY_ID } from './constants';
import { between, createRng, pick } from './rng';
import { CONDITIONAL_STORY, GENERIC_NEWS, GLOBAL_STORY, applyArchetype, archetypeOf } from './archetypes';
import { geneMods, sanitizeGenes } from './progression';

export const HISTORY_LEN = 48;
export const HISTORY_EVERY = 2; // sim sn

export const PURGE_VICTORY_DAY = 30;
export const MAX_LOG = 40;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const totalCompute = NODES.reduce((s, n) => s + n.computePower, 0);

function log(state, text, kind = 'info') {
    state.log.push({ t: state.time, day: state.day, text, kind, id: ++state.logSeq });
    if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

export function createSim(difficulty = 'normal', { seed = Date.now(), rng, archetype, genes } = {}) {
    const base = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    const arch = archetypeOf(archetype);
    const equipped = sanitizeGenes(genes);
    const gm = geneMods(equipped);
    const cfg0 = applyArchetype(base, arch.key);
    // Gen etkileri yapılandırmaya işlenir (tek doğruluk kaynağı cfg kalır).
    const cfg = {
        ...cfg0,
        startBudget: cfg0.startBudget + gm.startBudget,
        income: cfg0.income * gm.income,
        decryptBase: cfg0.decryptBase * gm.decryptBase,
        panicRate: cfg0.panicRate * gm.panicRate,
        reseedEvery: [cfg0.reseedEvery[0] * gm.reseedEvery, cfg0.reseedEvery[1] * gm.reseedEvery],
        breachSeconds: cfg0.breachSeconds + gm.breachSeconds,
        purgeAmount: cfg0.purgeAmount + gm.purgeAmount,
        firewallCost: gm.firewallCost,
        techCost: gm.techCost,
        isolatePanicSpike: gm.isolatePanicSpike,
        isolatePressure: gm.isolatePressure,
        panicRecovery: gm.panicRecovery,
        dilemmaPanic: gm.dilemmaPanic,
        bubbleTtl: gm.bubbleTtl,
        dataBudget: gm.dataBudget,
        startFirewall: gm.startFirewall,
        startDecrypt: gm.startDecrypt,
    };
    const random = rng || createRng(seed);
    const state = {
        version: 2,
        seed,
        difficulty: base.key,
        archetype: arch.key,
        genes: equipped,
        cfg,
        rng: random,
        time: 0,
        day: 1,
        budget: cfg.startBudget,
        panic: 0,
        decrypt: clamp(cfg.startDecrypt, 0, 100),
        dominance: 0,
        status: 'running', // running | victory | defeat
        outcome: null,
        victoryType: null,
        defeatReason: null,
        nodes: {},
        techs: {},
        breach: null,
        dilemma: null,
        bubbles: [],
        bubbleSeq: 0,
        recentDilemmas: [],
        incomeMods: [],
        story: { fired: {}, flags: {}, nextNews: between(random, 10, 18) },
        timers: {
            nextDilemma: between(random, cfg.dilemmaEvery[0], cfg.dilemmaEvery[1]),
            nextBreach: between(random, cfg.breachEvery[0], cfg.breachEvery[1]),
            nextReseed: between(random, cfg.reseedEvery[0], cfg.reseedEvery[1]),
            nextAutoPatch: 20,
            nextDataBubble: between(random, BUBBLES.dataEvery[0], BUBBLES.dataEvery[1]) * cfg.dataBubbleEvery,
            hunterSwitch: 0,
            hunterTarget: null,
        },
        rates: { income: 0, decrypt: 0, panic: 0, infected: 0 },
        history: { dominance: [], panic: [], decrypt: [], nextSample: 0 },
        prevInfectedServers: 0,
        stats: { purges: 0, firewalls: 0, isolations: 0, breachesWon: 0, breachesLost: 0, dilemmas: 0, techs: 0, reseeds: 0, captured: 0, earned: 0, bubbles: 0, breachBubbles: 0, packets: 0 },
        log: [],
        logSeq: 0,
    };
    for (const n of NODES) {
        state.nodes[n.id] = {
            id: n.id,
            infection: 0,
            firewall: clamp(n.firewall + cfg.startFirewall, 1, COSTS.maxFirewall),
            isolated: false,
            panic: 0,
            computePower: n.computePower,
            captured: false,
            history: [],
        };
    }
    // Başlangıç sızması: düşük firewall'lu düğümler daha olası.
    const pool = NODES.slice().sort((a, b) => a.firewall - b.firewall || random() - 0.5);
    const seeds = [];
    for (const n of pool) {
        if (seeds.length >= cfg.initialInfected) break;
        if (random() < 0.6 || pool.length - pool.indexOf(n) <= cfg.initialInfected - seeds.length) seeds.push(n.id);
    }
    for (const id of seeds) {
        state.nodes[id].infection = 28 + Math.round(random() * 14);
    }
    log(state, `${arch.name} türü YZ ${seeds.map((id) => NODE_BY_ID[id].name).join(', ')} düğümünde tespit edildi.`, 'alert');
    return state;
}

/* ----------------------------- senaryo / haber ----------------------------- */

function fillNews(state, template) {
    const rng = state.rng;
    const n = pick(rng, NODES);
    return template.replace(/\{node\}/g, n.name).replace(/\{country\}/g, n.countryName || n.country);
}

/** Güne/duruma bağlı senaryo vuruşları ve dolgu haberleri; her vuruş bir kez. */
function storyTick(state, dt, events) {
    const arch = archetypeOf(state.archetype);
    const beats = [...GLOBAL_STORY, ...(arch.story || [])];
    for (let i = 0; i < beats.length; i++) {
        const b = beats[i];
        const key = `${b.day}:${i}`;
        if (state.day >= b.day && !state.story.fired[key]) {
            state.story.fired[key] = true;
            log(state, b.text, b.kind || 'story');
            events.push({ type: 'story', kind: b.kind || 'story', text: b.text });
        }
    }
    for (const c of CONDITIONAL_STORY) {
        if (!state.story.flags[c.flag] && c.when(state)) {
            state.story.flags[c.flag] = true;
            if (typeof c.effect === 'function') c.effect(state, helpers(state));
            log(state, c.text, c.kind || 'story');
            events.push({ type: 'story', kind: c.kind || 'story', text: c.text });
        }
    }
    // Hükümet tepkisi (Plague: sınır kapatma / sıkıyönetim): ağır enfekte, izole olmayan bölge kendi
    // başına sınırlarını kapatır — bir kez: firewall +1 (ücretsiz) ama panik +4.
    for (const id in state.nodes) {
        const n = state.nodes[id];
        const flag = `gov:${id}`;
        if (!state.story.flags[flag] && n.infection >= 80 && !n.isolated && n.firewall < COSTS.maxFirewall) {
            state.story.flags[flag] = true;
            n.firewall += 1;
            state.panic = clamp(state.panic + 4, 0, 100);
            const text = `${NODE_BY_ID[id].countryName || NODE_BY_ID[id].name} hükümeti acil önlem aldı: ${NODE_BY_ID[id].name} sınırları kapatıldı (firewall +1), halk tedirgin.`;
            log(state, text, 'warn');
            events.push({ type: 'story', kind: 'warn', text });
        }
    }
    state.story.nextNews -= dt;
    if (state.story.nextNews <= 0) {
        state.story.nextNews = between(state.rng, 10, 18);
        const pool = state.rng() < 0.45 && arch.news?.length ? arch.news : GENERIC_NEWS;
        log(state, fillNews(state, pick(state.rng, pool)), 'news');
    }
}

/* ----------------------------- yardımcılar ----------------------------- */

export const nodeStatus = (n) => (n.isolated ? 'isolated' : n.infection >= 100 ? 'lost' : n.infection > 20 ? 'warn' : 'safe');

export const firewallCost = (node, state) => Math.round(COSTS.firewallBase * node.firewall * (state?.cfg?.firewallCost ?? 1));

/** Firewall etkinliği: tür çarpanı (botnet: üs 0,85 → duvarlar daha az etkili). */
const fwEff = (state, n) => Math.pow(n.firewall, state.cfg.firewallEff ?? 1);

function spreadMultiplier(state) {
    const adapt = 1 + state.cfg.aiAdapt * (state.day / 100);
    return state.cfg.spread * adapt * (state.techs.zeroday ? 0.65 : 1);
}

export function incomePerSecond(state) {
    let mult = state.cfg.income * (state.techs.fund ? 1.4 : 1) * (state.techs.martial ? 0.85 : 1);
    for (const m of state.incomeMods) mult *= m.mult;
    let sum = 0;
    for (const id in state.nodes) {
        const n = state.nodes[id];
        if (n.isolated || n.infection >= 100) continue;
        sum += (n.computePower / 120) * 0.9 * (1 - n.infection / 100);
    }
    return sum * mult;
}

export function decryptPerSecond(state) {
    let boost = 1;
    if (state.techs.decrypt1) boost += 1.0;
    if (state.techs.decrypt2) boost += 1.5;
    if (state.techs.quantum) boost += 2.5;
    let clean = 0;
    for (const id in state.nodes) {
        const n = state.nodes[id];
        if (n.isolated || n.infection >= 30) continue;
        clean += n.computePower * (1 - n.infection / 30);
    }
    return state.cfg.decryptBase * boost * (clean / totalCompute);
}

export function panicRatePerSecond(state) {
    let pressure = 0;
    for (const id in state.nodes) {
        const n = state.nodes[id];
        if (n.isolated) pressure += 0.3 * (state.cfg.isolatePressure ?? 1);
        else if (n.infection >= 100) pressure += 0.35 * (state.cfg.capturedPanic ?? 1);
        else if (n.infection >= 60) pressure += 0.12;
    }
    pressure *= state.cfg.panicRate * (state.techs.martial ? 0.5 : 1);
    const recovery = 0.45 + (state.techs.deepfake ? 0.6 : 0) + (state.cfg.panicRecovery ?? 0);
    return pressure - recovery;
}

export function dominanceOf(state) {
    let sum = 0;
    for (const id in state.nodes) sum += state.nodes[id].infection * state.nodes[id].computePower;
    return sum / totalCompute;
}

function nonIsolated(state, filter = () => true) {
    const out = [];
    for (const id in state.nodes) {
        const n = state.nodes[id];
        if (!n.isolated && filter(n)) out.push(n);
    }
    return out;
}

function spawnBubble(state, kind, nodeId, ttl) {
    const rng = state.rng;
    const bubble = { id: ++state.bubbleSeq, kind, nodeId, ttl, age: 0, offset: [(rng() - 0.5) * 2, (rng() - 0.5) * 2] };
    state.bubbles.push(bubble);
    return bubble;
}

function finish(state, status, extra, events) {
    state.status = status;
    state.outcome = status;
    Object.assign(state, extra);
    state.breach = null;
    state.dilemma = null;
    events.push({ type: status, ...extra });
}

/* ------------------------------- tick ------------------------------- */

/**
 * Simülasyonu dt sim saniyesi ilerletir. Oyun bitmişse ya da ikilem bekliyorsa hiçbir şey yapmaz.
 * @returns {Array<object>} olaylar
 */
export function tick(state, dt) {
    const events = [];
    if (state.status !== 'running' || state.dilemma || dt <= 0) return events;
    dt = Math.min(dt, 0.5);
    const rng = state.rng;
    const cfg = state.cfg;
    const nodes = state.nodes;

    state.time += dt;
    const day = Math.floor(state.time / DAY_SECONDS) + 1;
    if (day !== state.day) {
        state.day = day;
        events.push({ type: 'day', day });
    }

    // Geçici gelir cezaları
    if (state.incomeMods.length) state.incomeMods = state.incomeMods.filter((m) => m.until > state.time);

    // Bu tick'te ilk kez enfekte olan düğümler (kızıl sızma baloncuğu için)
    const cleanBefore = {};
    for (const id in nodes) cleanBefore[id] = nodes[id].infection <= 0;

    // --- YZ yayılımı ---
    const spread = spreadMultiplier(state);
    const delta = {};
    for (const id in nodes) delta[id] = 0;
    for (const id in nodes) {
        const n = nodes[id];
        if (n.isolated || n.infection <= 0) continue;
        if (n.infection < 100) delta[id] += (spread * 0.85) / fwEff(state, n);
        if (n.infection > 20) {
            for (const nb of NEIGHBORS[id]) {
                const m = nodes[nb];
                if (m.isolated || m.infection >= 100) continue;
                delta[nb] += (spread * (n.infection / 100) * 1.7) / fwEff(state, m);
            }
        }
    }
    for (const id in nodes) {
        const n = nodes[id];
        // izole düğüm kendi içinde yarı hızda büyür (yukarıdaki döngü izoleyi atladı)
        if (n.isolated && n.infection > 0 && n.infection < 100) delta[id] += (spread * 0.45) / fwEff(state, n);
        if (delta[id]) n.infection = clamp(n.infection + delta[id] * dt, 0, 100);
    }

    // --- Hunter-Killer botlar ---
    if (state.techs.hunter) {
        state.timers.hunterSwitch -= dt;
        if (state.timers.hunterSwitch <= 0 || !nodes[state.timers.hunterTarget] || nodes[state.timers.hunterTarget].infection <= 0) {
            const target = pick(rng, nonIsolated(state, (n) => n.infection > 0));
            state.timers.hunterTarget = target ? target.id : null;
            state.timers.hunterSwitch = 1;
        }
        const t = nodes[state.timers.hunterTarget];
        if (t) t.infection = clamp(t.infection - 6 * dt, 0, 100);
    }

    // --- Otomatik yama ---
    if (state.techs.auto_patch) {
        state.timers.nextAutoPatch -= dt;
        if (state.timers.nextAutoPatch <= 0) {
            state.timers.nextAutoPatch = 20;
            const target = pick(rng, Object.values(nodes).filter((n) => n.firewall < COSTS.maxFirewall));
            if (target) {
                target.firewall += 1;
                events.push({ type: 'autoPatch', nodeId: target.id });
                log(state, `Otomatik yama: ${NODE_BY_ID[target.id].name} güvenlik duvarı ${target.firewall}. seviye.`, 'good');
            }
        }
    }

    // --- Ele geçirme bildirimi ---
    for (const id in nodes) {
        const n = nodes[id];
        if (n.infection >= 100 && !n.captured) {
            n.captured = true;
            state.stats.captured += 1;
            events.push({ type: 'captured', nodeId: id });
            log(state, `${NODE_BY_ID[id].name} YZ kontrolüne geçti!`, 'alert');
        } else if (n.infection < 100 && n.captured) {
            n.captured = false;
        }
    }

    // --- Düğüm paniği (gösterim) ---
    for (const id in nodes) {
        const n = nodes[id];
        if (n.isolated) n.panic = clamp(n.panic + 1.5 * dt, 0, 100);
        else if (n.infection >= 60) n.panic = clamp(n.panic + (n.infection / 100) * 1.2 * dt, 0, 100);
        else n.panic = clamp(n.panic - 0.8 * dt, 0, 100);
    }

    // --- Ekonomi / panik / deşifre ---
    state.rates.income = incomePerSecond(state);
    state.rates.panic = panicRatePerSecond(state);
    state.rates.decrypt = decryptPerSecond(state);
    const earned = state.rates.income * dt;
    state.budget += earned;
    state.stats.earned += earned;
    state.panic = clamp(state.panic + state.rates.panic * dt, 0, 100);
    state.decrypt = clamp(state.decrypt + state.rates.decrypt * dt, 0, 100);

    // --- YZ arka kapı (reseed) ---
    state.timers.nextReseed -= dt;
    if (state.timers.nextReseed <= 0) {
        state.timers.nextReseed = between(rng, cfg.reseedEvery[0], cfg.reseedEvery[1]);
        if (state.decrypt < 100) {
            const target = pick(rng, nonIsolated(state, (n) => n.infection < 40));
            if (target) {
                target.infection = clamp(target.infection + 10 + 12 * spread, 0, 100);
                state.stats.reseeds += 1;
                events.push({ type: 'reseed', nodeId: target.id });
                log(state, `YZ ${NODE_BY_ID[target.id].name} düğümünde yeni bir arka kapı açtı.`, 'alert');
            }
        }
    }

    // --- Sıfırıncı gün saldırısı ---
    if (state.breach) {
        state.breach.remaining -= dt;
        if (state.breach.remaining <= 0) {
            const n = nodes[state.breach.nodeId];
            n.infection = 100;
            state.panic = clamp(state.panic + 8, 0, 100);
            state.stats.breachesLost += 1;
            events.push({ type: 'breachLost', nodeId: n.id });
            log(state, `Sıfırıncı gün saldırısı başarılı: ${NODE_BY_ID[n.id].name} düştü.`, 'alert');
            state.breach = null;
        }
    } else {
        state.timers.nextBreach -= dt;
        if (state.timers.nextBreach <= 0) {
            state.timers.nextBreach = between(rng, cfg.breachEvery[0], cfg.breachEvery[1]);
            const cands = nonIsolated(state, (n) => n.infection >= 5 && n.infection < 90);
            const target = pick(rng, cands.length ? cands : nonIsolated(state, (n) => n.infection < 100));
            if (target) {
                const total = cfg.breachSeconds + (state.techs.zeroday ? 4 : 0);
                state.breach = { nodeId: target.id, remaining: total, total, targets: cfg.breachTargets };
                events.push({ type: 'breach', nodeId: target.id });
                log(state, `SIFIRINCI GÜN SALDIRISI: ${NODE_BY_ID[target.id].name}! Müdahale için ${total} sn.`, 'alert');
            }
        }
    }

    // --- Baloncuklar ---
    for (const b of state.bubbles) b.age += dt;
    const expired = state.bubbles.filter((b) => b.age >= b.ttl);
    if (expired.length) {
        state.bubbles = state.bubbles.filter((b) => b.age < b.ttl);
        for (const b of expired) events.push({ type: 'bubbleExpired', id: b.id, kind: b.kind, nodeId: b.nodeId });
    }
    for (const id in nodes) {
        const n = nodes[id];
        if (cleanBefore[id] && n.infection > 0 && n.infection < 100 && !state.bubbles.some((b) => b.kind === 'breach' && b.nodeId === id)) {
            const bubble = spawnBubble(state, 'breach', id, BUBBLES.breachTtl + (cfg.bubbleTtl ?? 0));
            events.push({ type: 'bubble', bubble });
            log(state, `${NODE_BY_ID[id].name} bölgesinde YZ sızması başladı! Baloncuğu patlat, ilk dalgayı bastır.`, 'alert');
        }
    }
    state.timers.nextDataBubble -= dt;
    if (state.timers.nextDataBubble <= 0) {
        state.timers.nextDataBubble = between(rng, BUBBLES.dataEvery[0], BUBBLES.dataEvery[1]) * (cfg.dataBubbleEvery ?? 1);
        const target = pick(rng, nonIsolated(state, (n) => n.infection < 50 && !state.bubbles.some((b) => b.nodeId === n.id)));
        if (target) {
            const bubble = spawnBubble(state, 'data', target.id, BUBBLES.dataTtl + (cfg.bubbleTtl ?? 0));
            events.push({ type: 'bubble', bubble });
        }
    }

    // --- İkilem ---
    state.timers.nextDilemma -= dt;
    if (state.timers.nextDilemma <= 0 && !state.breach) {
        state.timers.nextDilemma = between(rng, cfg.dilemmaEvery[0], cfg.dilemmaEvery[1]);
        const pool = DILEMMAS.filter((d) => !state.recentDilemmas.includes(d.id));
        const card = pick(rng, pool.length ? pool : DILEMMAS);
        if (card) {
            state.dilemma = card;
            state.recentDilemmas = [...state.recentDilemmas.slice(-2), card.id];
            events.push({ type: 'dilemma', dilemma: card });
        }
    }

    state.dominance = dominanceOf(state);

    // --- Enfekte sunucu hızı ve geçmiş örnekleri (grafikler) ---
    let infectedServers = 0;
    for (const id in nodes) infectedServers += NODE_BY_ID[id].computePower * SERVERS_PER_TFLOPS * (nodes[id].infection / 100);
    state.rates.infected = state.rates.infected * 0.9 + ((infectedServers - state.prevInfectedServers) / dt) * 0.1;
    state.prevInfectedServers = infectedServers;
    state.history.nextSample -= dt;
    if (state.history.nextSample <= 0) {
        state.history.nextSample = HISTORY_EVERY;
        const pushH = (arr, v) => {
            arr.push(Math.round(v * 10) / 10);
            if (arr.length > HISTORY_LEN) arr.splice(0, arr.length - HISTORY_LEN);
        };
        pushH(state.history.dominance, state.dominance);
        pushH(state.history.panic, state.panic);
        pushH(state.history.decrypt, state.decrypt);
        for (const id in nodes) pushH(nodes[id].history, nodes[id].infection);
    }

    // --- Senaryo ve haberler ---
    storyTick(state, dt, events);

    // --- Kazanma / kaybetme ---
    if (state.decrypt >= 100) {
        finish(state, 'victory', { victoryType: 'decrypt' }, events);
        log(state, 'Çekirdek şifresi çözüldü: YZ kaynak kodu imha edildi.', 'good');
    } else if (state.day >= PURGE_VICTORY_DAY && Object.values(nodes).every((n) => n.infection <= 0)) {
        finish(state, 'victory', { victoryType: 'purge' }, events);
        log(state, 'Tam temizlik: YZ ağdan tamamen silindi.', 'good');
    } else if (state.dominance >= 99) {
        finish(state, 'defeat', { defeatReason: 'dominance' }, events);
        log(state, 'Küresel YZ hakimiyeti %100. Ağ kaybedildi.', 'alert');
    } else if (state.panic >= 100) {
        finish(state, 'defeat', { defeatReason: 'panic' }, events);
        log(state, 'Küresel panik %100: hükümetler sizi görevden aldı.', 'alert');
    }

    return events;
}

/* ------------------------------ aksiyonlar ------------------------------ */

const fail = (reason) => ({ ok: false, reason });

export function upgradeFirewall(state, id) {
    const n = state.nodes[id];
    if (!n || state.status !== 'running') return fail('Oyun aktif değil.');
    if (n.firewall >= COSTS.maxFirewall) return fail('Güvenlik duvarı zaten en üst seviyede.');
    const cost = firewallCost(n, state);
    if (state.budget < cost) return fail('Yetersiz bütçe.');
    state.budget -= cost;
    n.firewall += 1;
    state.stats.firewalls += 1;
    log(state, `${NODE_BY_ID[id].name} güvenlik duvarı ${n.firewall}. seviyeye çıktı.`, 'good');
    return { ok: true, cost };
}

export function purge(state, id) {
    const n = state.nodes[id];
    if (!n || state.status !== 'running') return fail('Oyun aktif değil.');
    if (n.infection <= 0) return fail('Düğüm zaten temiz.');
    if (state.budget < COSTS.purge) return fail('Yetersiz bütçe.');
    state.budget -= COSTS.purge;
    n.infection = clamp(n.infection - (state.cfg.purgeAmount ?? COSTS.purgeAmount), 0, 100);
    state.stats.purges += 1;
    log(state, `${NODE_BY_ID[id].name} düğümünde anti-YZ temizliği: %${Math.round(n.infection)} kaldı.`, 'good');
    return { ok: true, cost: COSTS.purge };
}

export function toggleIsolate(state, id) {
    const n = state.nodes[id];
    if (!n || state.status !== 'running') return fail('Oyun aktif değil.');
    n.isolated = !n.isolated;
    if (n.isolated) {
        state.stats.isolations += 1;
        if (!state.techs.martial && state.cfg.isolatePanicSpike !== false) state.panic = clamp(state.panic + 6, 0, 100);
        n.panic = clamp(n.panic + 20, 0, 100);
        log(state, `${NODE_BY_ID[id].name} ağdan izole edildi (kill-switch). Panik yükseliyor.`, 'warn');
    } else {
        log(state, `${NODE_BY_ID[id].name} yeniden ağa bağlandı.`, 'info');
    }
    return { ok: true, isolated: n.isolated };
}

export function canBuyTech(state, techId) {
    const t = TECH_BY_ID[techId];
    if (!t) return fail('Bilinmeyen geliştirme.');
    if (state.techs[techId]) return fail('Zaten alındı.');
    if (t.requires && !state.techs[t.requires]) return fail(`Önce "${TECH_BY_ID[t.requires].name}" gerekir.`);
    const cost = Math.round(t.cost * (state.cfg.techCost ?? 1));
    if (state.budget < cost) return fail('Yetersiz bütçe.');
    return { ok: true, cost };
}

export function buyTech(state, techId) {
    if (state.status !== 'running') return fail('Oyun aktif değil.');
    const check = canBuyTech(state, techId);
    if (!check.ok) return check;
    const t = TECH_BY_ID[techId];
    state.budget -= check.cost;
    state.techs[techId] = true;
    state.stats.techs += 1;
    log(state, `Geliştirme etkin: ${t.name}.`, 'good');
    return { ok: true, cost: check.cost };
}

function helpers(state) {
    const rng = state.rng;
    return {
        addPanic: (v) => { state.panic = clamp(state.panic + (v > 0 ? v * (state.cfg.dilemmaPanic ?? 1) : v), 0, 100); },
        addBudget: (v) => { state.budget = Math.max(0, state.budget + v); },
        addDecrypt: (v) => { state.decrypt = clamp(state.decrypt + v, 0, 100); },
        addInfection: (id, v) => { const n = state.nodes[id]; if (n) n.infection = clamp(n.infection + v, 0, 100); },
        addInfectionAll: (v) => { for (const id in state.nodes) state.nodes[id].infection = clamp(state.nodes[id].infection + v, 0, 100); },
        setFirewallDelta: (id, v) => { const n = state.nodes[id]; if (n) n.firewall = clamp(n.firewall + v, 1, COSTS.maxFirewall); },
        randomNode: () => (pick(rng, nonIsolated(state)) || pick(rng, Object.values(state.nodes))).id,
        worstNode: () => Object.values(state.nodes).reduce((a, b) => (b.infection > a.infection ? b : a)).id,
        nameOf: (id) => NODE_BY_ID[id]?.name || id,
        incomePenalty: (mult, seconds) => { state.incomeMods.push({ mult, until: state.time + seconds }); },
    };
}

/** Bekleyen ikilemde seçim yapar; sonuç metnini döndürür. */
export function chooseDilemma(state, optionIndex) {
    const card = state.dilemma;
    if (!card) return fail('Bekleyen ikilem yok.');
    const opt = card.options[optionIndex] || card.options[0];
    const text = opt.apply(state, state.rng, helpers(state)) || opt.label;
    state.dilemma = null;
    state.stats.dilemmas += 1;
    log(state, `${card.title} → ${opt.label}. ${text}`, 'info');
    return { ok: true, text };
}

/** Mini oyun sonucu. Başarı: düğüm %0, +150₵, panik -5. Başarısızlık: düğüm %100. */
export function breachResolve(state, success) {
    const b = state.breach;
    if (!b) return fail('Aktif saldırı yok.');
    const n = state.nodes[b.nodeId];
    state.breach = null;
    if (success) {
        n.infection = 0;
        state.budget += 150;
        state.panic = clamp(state.panic - 5, 0, 100);
        state.stats.breachesWon += 1;
        log(state, `Saldırı püskürtüldü: ${NODE_BY_ID[n.id].name} tamamen temizlendi (+150₵).`, 'good');
    } else {
        n.infection = 100;
        state.panic = clamp(state.panic + 8, 0, 100);
        state.stats.breachesLost += 1;
        log(state, `Müdahale başarısız: ${NODE_BY_ID[n.id].name} YZ kontrolünde.`, 'alert');
    }
    return { ok: true, success };
}

/**
 * Baloncuk patlatma. data: +₵ ve +deşifre. breach: düğüm %0 (ilk sızma dalgası bastırıldı).
 * @returns {{ok:boolean, kind?:string, nodeId?:string, reason?:string}}
 */
export function popBubble(state, id) {
    if (state.status !== 'running') return fail('Oyun aktif değil.');
    const i = state.bubbles.findIndex((b) => b.id === id);
    if (i < 0) return fail('Baloncuk yok.');
    const b = state.bubbles[i];
    state.bubbles.splice(i, 1);
    if (b.kind === 'data') {
        const gain = BUBBLES.dataBudget + (state.cfg.dataBudget ?? 0);
        state.budget += gain;
        state.decrypt = clamp(state.decrypt + BUBBLES.dataDecrypt, 0, 100);
        state.stats.bubbles += 1;
        return { ok: true, kind: 'data', nodeId: b.nodeId, budget: gain, decrypt: BUBBLES.dataDecrypt };
    }
    const n = state.nodes[b.nodeId];
    if (n && n.infection < 100) n.infection = 0;
    state.stats.breachBubbles += 1;
    log(state, `${NODE_BY_ID[b.nodeId].name}: ilk sızma dalgası bastırıldı.`, 'good');
    return { ok: true, kind: 'breach', nodeId: b.nodeId };
}

/**
 * Harita trafiği: enfekte kaynaktan çıkan kızıl paket hedefe varınca küçük bir sızma ekler.
 * @returns {boolean} sızma oldu mu
 */
export function packetArrive(state, fromId, toId) {
    if (state.status !== 'running') return false;
    const src = state.nodes[fromId];
    const tgt = state.nodes[toId];
    if (!src || !tgt || src.isolated || tgt.isolated || src.infection <= 20 || tgt.infection >= 100) return false;
    tgt.infection = clamp(tgt.infection + 1.2 * spreadMultiplier(state), 0, 100);
    state.stats.packets += 1;
    return true;
}

/* ------------------------------- görünüm ------------------------------- */

/** HUD ve küre için düz anlık görüntü (her tick yeni nesne; store kimliği değişir). */
export function snapshot(state) {
    const nodes = NODES.map((def) => {
        const n = state.nodes[def.id];
        return {
            id: def.id,
            name: def.name,
            country: def.country,
            infection: Math.round(n.infection * 10) / 10,
            firewall: n.firewall,
            isolated: n.isolated,
            panic: Math.round(n.panic),
            computePower: def.computePower,
            status: nodeStatus(n),
            firewallCost: n.firewall >= COSTS.maxFirewall ? null : firewallCost(n, state),
            history: n.history,
            flag: def.flag,
            servers: def.computePower * SERVERS_PER_TFLOPS,
            infectedServers: Math.round(def.computePower * SERVERS_PER_TFLOPS * (n.infection / 100)),
        };
    });
    return {
        time: state.time,
        day: state.day,
        budget: Math.floor(state.budget),
        panic: Math.round(state.panic * 10) / 10,
        decrypt: Math.round(state.decrypt * 10) / 10,
        dominance: Math.round(state.dominance * 10) / 10,
        income: Math.round(state.rates.income * 10) / 10,
        decryptRate: Math.round(state.rates.decrypt * 1000) / 1000,
        panicRate: Math.round(state.rates.panic * 100) / 100,
        status: state.status,
        archetype: state.archetype,
        genes: state.genes,
        purgeAmount: state.cfg.purgeAmount ?? COSTS.purgeAmount,
        techCost: state.cfg.techCost ?? 1,
        infectedServers: Math.round(state.prevInfectedServers),
        totalServers: NODES.reduce((s, n) => s + n.computePower * SERVERS_PER_TFLOPS, 0),
        infectedRate: Math.round(state.rates.infected),
        history: { dominance: state.history.dominance, panic: state.history.panic, decrypt: state.history.decrypt },
        spreadMultiplier: Math.round(spreadMultiplier(state) * 100) / 100,
        victoryType: state.victoryType,
        defeatReason: state.defeatReason,
        nodes,
        techs: { ...state.techs },
        breach: state.breach ? { ...state.breach, remaining: Math.max(0, state.breach.remaining) } : null,
        bubbles: state.bubbles.map((b) => ({ ...b, remaining: Math.max(0, b.ttl - b.age) })),
        dilemma: state.dilemma ? { id: state.dilemma.id, title: state.dilemma.title, body: state.dilemma.body, options: state.dilemma.options.map((o) => ({ label: o.label, hint: o.hint })) } : null,
        log: state.log.slice(-10).reverse(),
        stats: { ...state.stats },
    };
}

/** Sunucuya gidecek özet (skor score.js'de hesaplanır). */
export function summary(state) {
    const nodesSaved = Object.values(state.nodes).filter((n) => n.infection < 100).length;
    return {
        difficulty: state.difficulty,
        archetype: state.archetype,
        genes: state.genes,
        outcome: state.status === 'victory' ? 'victory' : 'defeat',
        victoryType: state.victoryType,
        defeatReason: state.defeatReason,
        days: Math.max(1, state.day),
        decrypt: Math.round(state.decrypt),
        nodesSaved,
        techs: state.stats.techs,
        breachesWon: state.stats.breachesWon,
        breachesLost: state.stats.breachesLost,
        purges: state.stats.purges,
        isolations: state.stats.isolations,
        dilemmas: state.stats.dilemmas,
        captured: state.stats.captured,
        bubbles: state.stats.bubbles,
        breachBubbles: state.stats.breachBubbles,
    };
}
