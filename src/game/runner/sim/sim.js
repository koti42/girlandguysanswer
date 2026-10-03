/*
 * Deterministik koşu simülasyonu (şartname §3.4, §3.6).
 *
 * Saf modül: DOM, three, zaman ya da Math.random yok; yalnızca tamsayı
 * aritmetiği. PHP karşılığı RunnerSim.php satır satır bu dosyanın portudur:
 * aynı seed + aynı girdiler ⇒ iki tarafta bit-bit aynı durum (golden.json).
 *
 * Şartnamenin açık bıraktığı ve burada seçilen yorumlar (PHP ile aynı olmalı):
 *  - Adım 6–7'deki chunk aralığının alt sınırı 0'a kırpılır (z küçükken -1 çıkar).
 *  - Crash olunca adımın geri kalanı (toplama VE sayaçlar) atlanır, yalnızca tick artar.
 *  - Toplamada önce aralıktaki tüm jetonlar (id sırasıyla), sonra güçlendirmeler:
 *    aynı tick'te alınan mıknatıs o tick'in jetonlarını etkilemez.
 *  - crashTick = çarpmanın olduğu adımın tick'i (artıştan önceki); endTick = atılan adım.
 *  - Dikey adımın koşulu `y > 0 || vy !== 0` (şartnamede `vy > 0`). Neden: aynı
 *    tick'te J sonra S (ya da yeniden zıplama tick'inde S) gelirse y = 0 iken
 *    vy = -42 kalıyordu; `vy > 0` ile bu durumdan hiç çıkılamıyor, oyuncu koşunun
 *    geri kalanında bir daha zıplayamıyordu. `vy !== 0` ile aynı tick'te yere
 *    "iner" ve tamponlanan kaymaya geçer. Başka hiçbir durumda fark yaratmaz
 *    (yerdeyken vy her zaman 0'dır).
 *  - MAX_TICKS'e ulaşınca step() hiçbir şey yapmaz (motor koşuyu bitirir).
 *  - prevLane başlangıçta 0 (şartname: "hepsi 0"); yalnızca bir şerit değişiminden
 *    sonra okunduğundan sonuca etkisi yoktur.
 */
import { C, GATE_LANE_EDGE, HIT_X, laneX, speedAt, zGate } from './constants.js';
import { buildChunk } from './generator.js';
import { stateHash } from './hash.js';
import { decodeInputs, encodeInputs } from './inputs.js';

// getChunk'ın kabul ettiği en büyük chunk: 30 dk VMAX'ta ~1513; pay bırakıldı.
const MAX_CHUNK = 4096;

function checkSeed(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new RangeError('Geçersiz koşu tohumu.');
    }
}

function checkGateCount(gateCount) {
    if (!Number.isInteger(gateCount) || gateCount < 0 || gateCount > C.MAX_GATES) {
        throw new RangeError('Geçersiz kapı sayısı.');
    }
}

function initialState() {
    return {
        tick: 0,
        z: 0,
        x: 0,
        lane: 1, // hedef şerit
        prevLane: 0,
        y: 0,
        vy: 0,
        slideTicks: 0,
        slideBuffer: false,
        jumpBuffer: 0,
        stumbleTicks: 0,
        invulnTicks: 0,
        magnetTicks: 0,
        shield: false,
        ignoreObstacleId: -1,
        crashed: false,
        crashTick: null,
        coins: 0,
        gates: [], // [{index, lane, tick}]
        segMm: [0],
        destroyed: new Set(),
        // Hash'e girmeyen sayaçlar (bot, testler ve HUD için)
        stumbles: 0,
        shieldBreaks: 0,
    };
}

function copyState(s) {
    const gates = [];
    for (let i = 0; i < s.gates.length; i++) {
        const g = s.gates[i];
        gates.push({ index: g.index, lane: g.lane, tick: g.tick });
    }
    return {
        tick: s.tick,
        z: s.z,
        x: s.x,
        lane: s.lane,
        prevLane: s.prevLane,
        y: s.y,
        vy: s.vy,
        slideTicks: s.slideTicks,
        slideBuffer: s.slideBuffer,
        jumpBuffer: s.jumpBuffer,
        stumbleTicks: s.stumbleTicks,
        invulnTicks: s.invulnTicks,
        magnetTicks: s.magnetTicks,
        shield: s.shield,
        ignoreObstacleId: s.ignoreObstacleId,
        crashed: s.crashed,
        crashTick: s.crashTick,
        coins: s.coins,
        gates,
        segMm: s.segMm.slice(),
        destroyed: new Set(s.destroyed),
        stumbles: s.stumbles,
        shieldBreaks: s.shieldBreaks,
    };
}

function copyChunk(ch) {
    const coins = [];
    for (let i = 0; i < ch.coins.length; i++) {
        const o = ch.coins[i];
        coins.push({ id: o.id, lane: o.lane, z: o.z, y: o.y, taken: o.taken });
    }
    const powers = [];
    for (let i = 0; i < ch.powers.length; i++) {
        const o = ch.powers[i];
        powers.push({ id: o.id, kind: o.kind, lane: o.lane, z: o.z, y: o.y, taken: o.taken });
    }
    // Engeller değişmez (yok edilenler state.destroyed'da): paylaşılabilir.
    return { index: ch.index, kind: ch.kind, obstacles: ch.obstacles, coins, powers };
}

/**
 * Yeni koşu.
 *  seed      0..2^32-1 tamsayı (sunucu 1..2^32-1 üretir)
 *  gateCount 0..255 (misafir antrenmanında 0: kapı yok)
 *  debug     YALNIZCA testler: { startTick, startZ, startLane, override }.
 *            Üretim kodu ve sunucu bunu hiç kullanmaz; PHP'de karşılığı yoktur.
 */
export function createSim({ seed, gateCount = 0, debug } = {}) {
    checkSeed(seed);
    checkGateCount(gateCount);
    const state = initialState();
    let override = null;
    if (debug) {
        if (Number.isInteger(debug.startTick) && debug.startTick >= 0) state.tick = debug.startTick;
        if (Number.isInteger(debug.startZ) && debug.startZ >= 0) state.z = debug.startZ;
        if (Number.isInteger(debug.startLane) && debug.startLane >= 0 && debug.startLane < C.LANE_COUNT) {
            state.lane = debug.startLane;
            state.x = laneX(debug.startLane);
        }
        if (typeof debug.override === 'function') override = debug.override;
    }
    return makeSim(seed, gateCount, override, state, new Map(), [], []);
}

function makeSim(seed, gateCount, override, state, chunks, recorded, pendingInit) {
    const s = state;

    // Bir sonraki step'te uygulanacak girdiler (en fazla MAX_INPUTS_PER_TICK).
    const pending = ['', '', '', ''];
    let pendingLen = 0;
    for (let i = 0; i < pendingInit.length; i++) pending[pendingLen++] = pendingInit[i];

    // Olay dizisi ve nesneleri yeniden kullanılır: step() içinde allocation yok.
    // Tüketici olayları bir sonraki step'e kadar okumalı, referans saklamamalı.
    const events = [];
    const pool = [];

    function emit(type) {
        let e = pool[events.length];
        if (e === undefined) {
            e = { type: '', id: -1, kind: null, from: -1, to: -1, index: -1, lane: -1 };
            pool.push(e);
        }
        e.type = type;
        e.id = -1;
        e.kind = null;
        e.from = -1;
        e.to = -1;
        e.index = -1;
        e.lane = -1;
        events.push(e);
        return e;
    }

    /** Geride kalan chunk'ları at (c < floor(z / 30000) - 2). */
    function pruneBehind() {
        const behind = Math.floor(s.z / C.CHUNK_LEN) - 2;
        for (const c of chunks.keys()) {
            if (c < behind) chunks.delete(c);
        }
    }

    function chunkAt(c) {
        let ch = chunks.get(c);
        if (ch === undefined) {
            // Yeni chunk üretilirken eskileri de at: uzun replay'de bellek sabit kalsın.
            pruneBehind();
            ch = buildChunk(seed, gateCount, c, override);
            chunks.set(c, ch);
        }
        return ch;
    }

    function applyInput(code) {
        const grounded = s.y === 0 && s.vy === 0;
        if (code === 'L' || code === 'R') {
            const nl = s.lane + (code === 'L' ? -1 : 1);
            if (nl >= 0 && nl < C.LANE_COUNT) {
                const e = emit('lane');
                e.from = s.lane;
                e.to = nl;
                s.prevLane = s.lane;
                s.lane = nl;
            }
        } else if (code === 'J') {
            if (grounded) {
                s.vy = C.JUMP_V;
                s.slideTicks = 0;
                s.slideBuffer = false;
                emit('jump');
            } else {
                s.jumpBuffer = C.JUMP_BUFFER;
            }
        } else {
            // 'S'
            if (grounded) {
                s.slideTicks = C.SLIDE_TICKS;
                s.jumpBuffer = 0;
            } else {
                s.vy = s.vy < -C.FAST_FALL_V ? s.vy : -C.FAST_FALL_V;
                s.slideBuffer = true;
                s.jumpBuffer = 0;
            }
            emit('slide');
        }
    }

    function crash(tick, id, kind) {
        s.crashed = true;
        s.crashTick = tick;
        const e = emit('crash');
        e.id = id;
        e.kind = kind;
    }

    /** Bir tick (adım sırası SABİT). Olay dizisini döner (yeniden kullanılır). */
    function step() {
        events.length = 0;
        if (s.crashed || s.tick >= C.MAX_TICKS) {
            pendingLen = 0;
            return events;
        }
        const tick = s.tick;

        // 1. Girdiler (geldiği sırayla)
        for (let i = 0; i < pendingLen; i++) applyInput(pending[i]);
        pendingLen = 0;
        const prevX = s.x;

        // 2. Yatay
        const tx = laneX(s.lane);
        if (s.x < tx) {
            s.x = s.x + C.LANE_SPEED < tx ? s.x + C.LANE_SPEED : tx;
        } else if (s.x > tx) {
            s.x = s.x - C.LANE_SPEED > tx ? s.x - C.LANE_SPEED : tx;
        }
        if (s.x === tx) s.ignoreObstacleId = -1;

        // 3. Dikey (koşul neden `vy !== 0`: dosya başındaki nota bak)
        let landed = false;
        if (s.y > 0 || s.vy !== 0) {
            s.y += s.vy;
            s.vy -= C.GRAVITY;
            if (s.y <= 0) {
                s.y = 0;
                s.vy = 0;
                landed = true;
            }
        }
        if (landed) {
            emit('land');
            if (s.jumpBuffer > 0) {
                // Yeniden zıplama: y = 0 kalır, sonraki tick yükselir.
                s.vy = C.JUMP_V;
                s.jumpBuffer = 0;
                s.slideBuffer = false;
                emit('jump');
            } else if (s.slideBuffer) {
                s.slideTicks = C.SLIDE_TICKS;
                s.slideBuffer = false;
            }
        }
        if (s.jumpBuffer > 0) s.jumpBuffer--;
        if (s.slideTicks > 0) s.slideTicks--;

        // 4. İleri
        const v = speedAt(tick);
        const prevZ = s.z;
        s.z += v;
        const z = s.z;
        s.segMm[s.segMm.length - 1] += v;

        // 5. Kapı
        const k = s.gates.length;
        if (k < gateCount) {
            const zg = zGate(k);
            if (prevZ < zg && zg <= z) {
                const gl = s.x <= -GATE_LANE_EDGE ? 0 : (s.x >= GATE_LANE_EDGE ? 2 : 1);
                s.gates.push({ index: k, lane: gl, tick });
                s.segMm.push(0);
                const e = emit('gate');
                e.index = k;
                e.lane = gl;
            }
        }

        // Adım 6–7 yalnızca yakın chunk'lara bakar (alt sınır 0'a kırpılır).
        const cFrom = z >= 1000 ? Math.floor((z - 1000) / C.CHUNK_LEN) : 0;
        const cTo = Math.floor((z + C.MAGNET_REACH_AHEAD) / C.CHUNK_LEN);
        const x = s.x;
        const y = s.y;

        // 6. Çarpışma (id sırasıyla, ilk çarpmada dur)
        const h = (s.slideTicks > 0 || s.slideBuffer) ? C.SLIDE_H : C.STAND_H;
        let stop = false;
        for (let c = cFrom; c <= cTo && !stop; c++) {
            const obs = chunkAt(c).obstacles;
            for (let i = 0; i < obs.length; i++) {
                const o = obs[i];
                if (o.id === s.ignoreObstacleId || s.destroyed.has(o.id)) continue;
                if (!(z - C.PLAYER_HALF_D < o.z1 && z + C.PLAYER_HALF_D > o.z0)) continue;
                const ox = laneX(o.lane);
                if (Math.abs(x - ox) >= HIT_X) continue;
                let hit;
                if (o.type === 'barrier') hit = y < C.BARRIER_TOP;
                else if (o.type === 'bar') hit = y + h > C.BAR_BOTTOM;
                else hit = true;
                if (!hit || s.invulnTicks > 0) continue;

                // Yan çarpma: önceki tick'te z örtüşmesi vardı, önceki x'te x örtüşmesi yoktu.
                const side = prevZ - C.PLAYER_HALF_D < o.z1 && prevZ + C.PLAYER_HALF_D > o.z0
                    && Math.abs(prevX - ox) >= HIT_X;
                if (side) {
                    if (s.stumbleTicks > 0) {
                        crash(tick, o.id, 'side');
                    } else {
                        s.stumbleTicks = C.STUMBLE_TICKS;
                        s.lane = s.prevLane;
                        s.ignoreObstacleId = o.id;
                        s.stumbles++;
                        emit('stumble').id = o.id;
                    }
                } else if (s.shield) {
                    // Kalkan yalnızca kafa kafaya çarpmada harcanır.
                    s.shield = false;
                    s.invulnTicks = C.INVULN_TICKS;
                    s.destroyed.add(o.id);
                    s.shieldBreaks++;
                    emit('shieldBreak').id = o.id;
                } else {
                    crash(tick, o.id, 'head');
                }
                stop = true;
                break;
            }
        }

        if (s.crashed) {
            // Adımın geri kalanı (toplama ve sayaçlar) atlanır; tick yine artar.
            s.tick++;
            return events;
        }

        // 7. Toplama: önce jetonlar, sonra güçlendirmeler (ikisi de id sırasıyla).
        const magnet = s.magnetTicks > 0;
        const headY = y + 800;
        for (let c = cFrom; c <= cTo; c++) {
            const coins = chunkAt(c).coins;
            for (let i = 0; i < coins.length; i++) {
                const o = coins[i];
                if (o.taken) continue;
                const dz = o.z - z;
                if ((Math.abs(dz) <= C.COIN_REACH_Z && Math.abs(laneX(o.lane) - x) <= C.COIN_REACH_X
                    && Math.abs(o.y - headY) <= C.COIN_REACH_Y)
                    || (magnet && dz >= -C.MAGNET_REACH_BACK && dz <= C.MAGNET_REACH_AHEAD)) {
                    o.taken = true;
                    s.coins++;
                    emit('coin').id = o.id;
                }
            }
        }
        for (let c = cFrom; c <= cTo; c++) {
            const powers = chunkAt(c).powers;
            for (let i = 0; i < powers.length; i++) {
                const o = powers[i];
                if (o.taken) continue;
                if (Math.abs(o.z - z) <= C.COIN_REACH_Z && Math.abs(laneX(o.lane) - x) <= C.COIN_REACH_X
                    && Math.abs(o.y - headY) <= C.COIN_REACH_Y) {
                    o.taken = true;
                    if (o.kind === 'magnet') s.magnetTicks = C.MAGNET_TICKS;
                    else s.shield = true;
                    const e = emit('power');
                    e.kind = o.kind;
                    e.id = o.id;
                }
            }
        }

        // 8. Sayaçlar
        if (s.stumbleTicks > 0) s.stumbleTicks--;
        if (s.invulnTicks > 0) s.invulnTicks--;
        if (s.magnetTicks > 0) s.magnetTicks--;

        // 9.
        s.tick++;
        return events;
    }

    /**
     * 'L'|'R'|'J'|'S' → bir sonraki step'te uygulanır ve kayda girer.
     * Kabul edilmezse false: crash/süre sonu sonrası, geçersiz kod, aynı tick'te
     * 4'ten fazla ya da kayıt sınırı (12000) dolmuş. Kaydedilmeyen girdi
     * uygulanmaz da — yoksa sunucudaki replay istemciden ayrışırdı.
     */
    function input(code) {
        if (s.crashed || s.tick >= C.MAX_TICKS) return false;
        if (code !== 'L' && code !== 'R' && code !== 'J' && code !== 'S') return false;
        if (pendingLen >= C.MAX_INPUTS_PER_TICK || recorded.length >= C.MAX_INPUT_TOKENS) return false;
        pending[pendingLen++] = code;
        recorded.push([s.tick, code]);
        return true;
    }

    /** Render ve testler için chunk; c geçersizse null. Geride atılmış chunk yeniden üretilir. */
    function getChunk(c) {
        if (!Number.isInteger(c) || c < 0 || c > MAX_CHUNK) return null;
        return chunkAt(c);
    }

    /**
     * Durumu, bekleyen girdileri ve chunk önbelleğini kopyalar (bot ileri bakışı).
     * { record: false } girdi kaydını kopyalamaz (hızlı; klonun encodeInputs'u
     * yalnızca kendi girdilerini içerir).
     */
    function clone(opts) {
        const copy = new Map();
        for (const [c, ch] of chunks) copy.set(c, copyChunk(ch));
        const rec = opts && opts.record === false ? [] : recorded.slice();
        return makeSim(seed, gateCount, override, copyState(s), copy, rec, pending.slice(0, pendingLen));
    }

    return {
        state: s,
        gateCount,
        seed,
        input,
        step,
        getChunk,
        pruneBehind,
        clone,
        gateZ: zGate,
        isDestroyed: (id) => s.destroyed.has(id),
        encodeInputs: () => encodeInputs(recorded),
        inputCount: () => recorded.length,
        speed: () => speedAt(s.tick),
    };
}

function toInputList(inputs, endTick) {
    if (typeof inputs === 'string') return decodeInputs(inputs, endTick);
    if (Array.isArray(inputs)) return decodeInputs(encodeInputs(inputs), endTick);
    throw new RangeError('Girdi kaydı bozuk.');
}

/**
 * Sunucudaki doğrulamanın birebiri: endTick adım ya da crash'e kadar koşturur.
 * inputs: §3.5 stringi ya da [[tick, kod], ...]. checkpointEvery verilirse her
 * N tick'te (adımdan sonra tick % N === 0) {tick, hash} kaydı döner (fikstürler).
 */
export function replay({ seed, gateCount, inputs, endTick, checkpointEvery = 0 }) {
    if (!Number.isInteger(endTick) || endTick < 0 || endTick > C.MAX_TICKS) {
        throw new RangeError('Koşu süresi geçersiz.');
    }
    const list = toInputList(inputs, endTick);
    const sim = createSim({ seed, gateCount });
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
            checkpoints.push({ tick: s.tick, hash: stateHash(s) });
        }
    }
    const out = {
        endTick: s.tick,
        crashed: s.crashed,
        crashTick: s.crashTick,
        z: s.z,
        distanceM: Math.floor(s.z / 1000),
        coins: s.coins,
        gates: s.gates.map((g) => ({ index: g.index, lane: g.lane, tick: g.tick })),
        segMm: s.segMm.slice(),
        hash: stateHash(s),
    };
    if (checkpointEvery > 0) out.checkpoints = checkpoints;
    return out;
}
