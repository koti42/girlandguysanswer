/*
 * Deterministik koşu simülasyonu (şartname v1 §3.4, §3.6 + v2 §A.2–§A.5).
 *
 * Saf modül: DOM, three, zaman ya da Math.random yok; yalnızca tamsayı
 * aritmetiği. PHP karşılığı RunnerSim.php satır satır bu dosyanın portudur:
 * aynı seed + aynı girdiler ⇒ iki tarafta bit-bit aynı durum (golden.json).
 *
 * v2: y "ayak yüksekliği"; zemin 0 ya da üzerinde durulan araba/otobüs/rampa
 * yüzeyi (groundAt). Arabaya zıplayıp çıkılır, otobüse rampadan, araba
 * çatısından ya da Süper Zıplamayla; çatıda koşulur, çatı bitince düşülür.
 *
 * Şartnamenin açık bıraktığı ve burada seçilen yorumlar (PHP ile aynı olmalı):
 *  - Adım 4 (groundAt) ve 6–7'deki chunk aralığı: floor((z-1000)/30000) ..
 *    floor((z+7000)/30000), alt sınır 0'a kırpılır. Engeller chunk sınırını
 *    aşmadığından (desen kuralı) bu aralık her şeyi kapsar.
 *  - groundAt'te ignoreObstacleId dikkate alınmaz (yalnızca destroyed): yandan
 *    sürtünen otobüs de çatısına iniş için destek verir.
 *  - Crash olunca adımın geri kalanı (toplama VE sayaçlar) atlanır, yalnızca tick artar.
 *  - Toplamada önce aralıktaki tüm jetonlar (id sırasıyla), sonra güçlendirmeler:
 *    aynı tick'te alınan mıknatıs o tick'in jetonlarını etkilemez.
 *  - crashTick = çarpmanın olduğu adımın tick'i (artıştan önceki); endTick = atılan adım.
 *  - ŞARTNAMEDEN SAPMA (§A.4 adım 4): iniş koşulu `y <= g && prevY >= g - LAND_TOL`
 *    (şartnamede ayrıca `y <= prevY`). Neden: rampada ya da rampanın hemen önünde
 *    zıplayınca yüksek hızda (> 311 mm/tick) rampa yüzeyi tick başına zıplamadan
 *    hızlı yükselir (0,45 × hız); `y <= prevY` ile oyuncu rampanın "içine" girip
 *    rampa önden çarpmadığı için orada kalıyor, ardından otobüsün önüne çarpıp
 *    ölüyordu. Bu koşulla yüzey oyuncuyu yakalar (zıplama yutulur). Başka tek
 *    fark: yükselirken üst yüzeyin en fazla 200 mm altındaki oyuncu (araba ya da
 *    otobüs kenarını yükselirken yakalama) hemen çatıya iner; eski kuralla tepe
 *    noktasından sonra inecekti. Zıplamanın ilk tick'inde y = g + vy > g
 *    olduğundan zıplama kendi yüzeyine geri inmez.
 *  - Rampa yan çarpma dışında çarpmaz; yan çarpma değilse aramaya devam edilir
 *    (sonraki engel yine çarpabilir), "ilk çarpmada dur" yalnızca gerçek çarpmalar için.
 *  - MAX_TICKS'e ulaşınca step() hiçbir şey yapmaz (motor koşuyu bitirir).
 *  - prevLane başlangıçta 0 (şartname: "hepsi 0"); yalnızca bir şerit değişiminden
 *    sonra okunduğundan sonuca etkisi yoktur.
 */
import { C, GATE_LANE_EDGE, HIT_X, laneX, rampHeight, speedAt, zGate } from './constants.js';
import { buildChunk, tunnelAt } from './generator.js';
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
        y: 0, // ayak yüksekliği
        vy: 0,
        grounded: true, // bir yüzeyde (zemin ya da çatı) duruyor
        slideTicks: 0,
        slideBuffer: false,
        jumpBuffer: 0,
        stumbleTicks: 0,
        invulnTicks: 0,
        magnetTicks: 0,
        superTicks: 0, // Süper Zıplama kalan süresi
        shield: false,
        ignoreObstacleId: -1,
        crashed: false,
        crashTick: null,
        coins: 0,
        gates: [], // [{index, lane, tick}]
        segMm: [0],
        destroyed: new Set(),
        // Hash'e girmeyen alanlar (motor, bot, testler ve HUD için)
        ground: 0, // son adımdaki destek yüksekliği (groundAt): gölge/kamera
        stumbles: 0,
        shieldBreaks: 0,
        roofLandings: 0,
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
        grounded: s.grounded,
        slideTicks: s.slideTicks,
        slideBuffer: s.slideBuffer,
        jumpBuffer: s.jumpBuffer,
        stumbleTicks: s.stumbleTicks,
        invulnTicks: s.invulnTicks,
        magnetTicks: s.magnetTicks,
        superTicks: s.superTicks,
        shield: s.shield,
        ignoreObstacleId: s.ignoreObstacleId,
        crashed: s.crashed,
        crashTick: s.crashTick,
        coins: s.coins,
        gates,
        segMm: s.segMm.slice(),
        destroyed: new Set(s.destroyed),
        ground: s.ground,
        stumbles: s.stumbles,
        shieldBreaks: s.shieldBreaks,
        roofLandings: s.roofLandings,
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
            if (s.grounded) {
                const sup = s.superTicks > 0;
                s.vy = sup ? C.SUPER_JUMP_V : C.JUMP_V;
                s.grounded = false;
                s.slideTicks = 0;
                s.slideBuffer = false;
                emit('jump').kind = sup ? 'super' : null;
            } else {
                s.jumpBuffer = C.JUMP_BUFFER;
            }
        } else {
            // 'S'
            if (s.grounded) {
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

    // groundAt'in son çağrısında desteği veren engelin türü ('ground' = zemin).
    let groundType = 'ground';

    /**
     * Destek yüksekliği (§A.3): z menzilindeki, yok edilmemiş car/bus/ramp
     * nesnelerinden |x - laneX| < 1450 ve z örtüşmesi (±300) olanların yüzey
     * yüksekliklerinin en büyüğü; hiçbiri yoksa 0. Allocation yok.
     */
    function groundAt(x, z, cFrom, cTo) {
        let g = 0;
        groundType = 'ground';
        for (let c = cFrom; c <= cTo; c++) {
            const obs = chunkAt(c).obstacles;
            for (let i = 0; i < obs.length; i++) {
                const o = obs[i];
                const t = o.type;
                if (t === 'barrier' || t === 'bar') continue;
                if (!(z - C.PLAYER_HALF_D < o.z1 && z + C.PLAYER_HALF_D > o.z0)) continue;
                if (Math.abs(x - laneX(o.lane)) >= HIT_X || s.destroyed.has(o.id)) continue;
                const top = t === 'ramp' ? rampHeight(o, z) : o.top;
                if (top > g) {
                    g = top;
                    groundType = t;
                }
            }
        }
        return g;
    }

    /**
     * Motor için (gölge, kamera): (x, z)'deki destek yüksekliği (mm). Simülasyon
     * durumunu değiştirmez; ara değerli (kesirli) x/z de kabul edilir.
     */
    function groundAtPublic(x, z) {
        if (!Number.isFinite(x) || !Number.isFinite(z) || z < 0) return 0;
        const cFrom = z >= 1000 ? Math.floor((z - 1000) / C.CHUNK_LEN) : 0;
        const cTo = Math.floor((z + C.PLAYER_HALF_D) / C.CHUNK_LEN);
        // Atılmış (çok geride) chunk'ı yalnızca gölge için yeniden üretme.
        if (cTo > MAX_CHUNK || cFrom < Math.floor(s.z / C.CHUNK_LEN) - 2) return 0;
        const saved = groundType;
        const g = groundAt(x, z, cFrom, cTo);
        groundType = saved;
        return g;
    }

    function crash(tick, id, kind) {
        s.crashed = true;
        s.crashTick = tick;
        const e = emit('crash');
        e.id = id;
        e.kind = kind;
    }

    /**
     * Bir tick (adım sırası SABİT, §A.4). Olay dizisini döner (yeniden kullanılır):
     *   {type:'jump', kind: 'super'|null}   zıplama (yerden, çatıdan ya da tamponla inişte)
     *   {type:'land', kind: 'ground'|'car'|'bus'|'ramp'}  havadan bir yüzeye iniş
     *   {type:'fall'}                       yüzey bitti (çatı/araba sonu), düşüş başlıyor
     *   {type:'slide'} {type:'lane',from,to} {type:'coin',id}
     *   {type:'power',kind:'magnet'|'shield'|'superjump',id}
     *   {type:'stumble',id} {type:'shieldBreak',id} {type:'crash',id,kind:'head'|'side'}
     *   {type:'gate',index,lane}
     * Rampadan çatıya çıkış yüzey takibidir: 'land' olayı üretmez.
     */
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

        // 2. Yatay
        const prevX = s.x;
        const tx = laneX(s.lane);
        if (s.x < tx) {
            s.x = s.x + C.LANE_SPEED < tx ? s.x + C.LANE_SPEED : tx;
        } else if (s.x > tx) {
            s.x = s.x - C.LANE_SPEED > tx ? s.x - C.LANE_SPEED : tx;
        }
        if (s.x === tx) s.ignoreObstacleId = -1;
        const x = s.x;

        // 3. İleri
        const v = speedAt(tick);
        const prevZ = s.z;
        s.z += v;
        const z = s.z;
        s.segMm[s.segMm.length - 1] += v;

        // Adım 4 ve 6–7 yalnızca yakın chunk'lara bakar (alt sınır 0'a kırpılır).
        // Destek için z + 300'ün ötesine bakmak gerekmez (sonuç aynı, iş az).
        const cFrom = z >= 1000 ? Math.floor((z - 1000) / C.CHUNK_LEN) : 0;
        const cTo = Math.floor((z + C.MAGNET_REACH_AHEAD) / C.CHUNK_LEN);

        // 4. Dikey
        const g = groundAt(x, z, cFrom, Math.floor((z + C.PLAYER_HALF_D) / C.CHUNK_LEN));
        s.ground = g;
        let landed = false;
        if (s.grounded) {
            if (g > s.y) {
                // Rampa/basamak takibi; daha yüksek yüzey (duvar) adım 6'da çarpar.
                if (g - s.y <= C.STEP_UP) s.y = g;
            } else if (g < s.y) {
                // Yüzey bitti: bu tick y değişmez, düşüş sonraki tick başlar.
                s.grounded = false;
                s.vy = 0;
                emit('fall');
            }
        } else {
            const prevY = s.y;
            s.y += s.vy;
            s.vy -= C.GRAVITY;
            // İniş koşulunda şartnamedeki `y <= prevY` (düşüyor olma) şartı YOK:
            // dosya başındaki nota bak.
            if (s.y <= g && prevY >= g - C.LAND_TOL) {
                s.y = g;
                s.vy = 0;
                s.grounded = true;
                landed = true;
            }
        }
        if (landed) {
            emit('land').kind = groundType;
            if (g > 0) s.roofLandings++;
            if (s.jumpBuffer > 0) {
                // Yeniden zıplama: y = g kalır, sonraki tick yükselir.
                const sup = s.superTicks > 0;
                s.vy = sup ? C.SUPER_JUMP_V : C.JUMP_V;
                s.grounded = false;
                s.jumpBuffer = 0;
                s.slideBuffer = false;
                emit('jump').kind = sup ? 'super' : null;
            } else if (s.slideBuffer) {
                s.slideTicks = C.SLIDE_TICKS;
                s.slideBuffer = false;
            }
        }
        if (s.jumpBuffer > 0) s.jumpBuffer--;
        if (s.slideTicks > 0) s.slideTicks--;
        const y = s.y;

        // 5. Kapı
        const k = s.gates.length;
        if (k < gateCount) {
            const zg = zGate(k);
            if (prevZ < zg && zg <= z) {
                const gl = x <= -GATE_LANE_EDGE ? 0 : (x >= GATE_LANE_EDGE ? 2 : 1);
                s.gates.push({ index: k, lane: gl, tick });
                s.segMm.push(0);
                const e = emit('gate');
                e.index = k;
                e.lane = gl;
            }
        }

        // 6. Çarpışma (id sırasıyla, ilk çarpmada dur)
        const h = (s.slideTicks > 0 || s.slideBuffer) ? C.SLIDE_H : C.STAND_H;
        let stop = false;
        for (let c = cFrom; c <= cTo && !stop && s.invulnTicks === 0; c++) {
            const obs = chunkAt(c).obstacles;
            for (let i = 0; i < obs.length; i++) {
                const o = obs[i];
                if (o.id === s.ignoreObstacleId || s.destroyed.has(o.id)) continue;
                if (!(z - C.PLAYER_HALF_D < o.z1 && z + C.PLAYER_HALF_D > o.z0)) continue;
                const ox = laneX(o.lane);
                if (Math.abs(x - ox) >= HIT_X) continue;
                let hit;
                if (o.type === 'barrier') hit = y < C.BARRIER_TOP;
                else if (o.type === 'bar') hit = y < C.BAR_TOP && y + h > C.BAR_BOTTOM;
                else if (o.type === 'ramp') hit = y < rampHeight(o, z) - C.STEP_UP;
                else hit = y < o.top - C.LAND_TOL; // car / bus
                if (!hit) continue;

                // Yan çarpma: önceki tick'te z örtüşmesi vardı, önceki x'te x örtüşmesi yoktu.
                const side = prevZ - C.PLAYER_HALF_D < o.z1 && prevZ + C.PLAYER_HALF_D > o.z0
                    && Math.abs(prevX - ox) >= HIT_X;
                // Rampaya önden girilir (yüzey takibi); yalnızca yandan çarpılabilir.
                if (o.type === 'ramp' && !side) continue;
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
                    else if (o.kind === 'superjump') s.superTicks = C.SUPER_TICKS;
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
        if (s.superTicks > 0) s.superTicks--;

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
        groundAt: groundAtPublic,
        tunnelAt: (c) => tunnelAt(c, gateCount),
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
