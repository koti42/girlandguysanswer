/*
 * Pist üretimi (şartname §3.3). Chunk c yalnızca (seed, gateCount, c) ile
 * belirlenir; her chunk kendi PRNG akışını kullanır, üretim sırası önemsiz.
 * PHP karşılığı TrackGenerator.php — aynı patterns.json'ı okur.
 *
 * Dönen chunk (sim.getChunk biçimi):
 *   { index, kind, obstacles:[{id,type,lane,z0,z1}], coins:[{id,lane,z,y,taken}],
 *     powers:[{id,kind,lane,z,y,taken}] }
 * Engel nesneleri değişmez; jeton/güçlendirme `taken` alanını simülasyon yazar.
 */
import { C } from './constants.js';
import { chunkPrng, randInt } from './prng.js';
import patternsFile from './patterns.json' with { type: 'json' };

const ITEM_TYPES = ['barrier', 'bar', 'block', 'coins', 'power'];

function isInt(v, min, max) {
    return Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Desen dosyasını bir kez doğrular: bozuk dosyayla sessizce yanlış pist
 * üretmek yerine modül yüklenirken hata verir (PHP de aynısını yapar).
 */
export function validatePatterns(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.patterns) || data.patterns.length === 0) {
        throw new Error('Koşu desen dosyası geçersiz.');
    }
    const ids = new Set();
    for (let i = 0; i < data.patterns.length; i++) {
        const p = data.patterns[i];
        const fail = (why) => {
            throw new Error('Koşu deseni #' + i + ' geçersiz: ' + why);
        };
        if (!p || typeof p.id !== 'string' || ids.has(p.id)) fail('id');
        ids.add(p.id);
        if (!isInt(p.minTier, 0, 4) || !isInt(p.weight, 1, 1000000) || !Array.isArray(p.items)) {
            fail('minTier/weight/items');
        }
        let obstacles = 0;
        let coins = 0;
        for (const it of p.items) {
            if (!it || ITEM_TYPES.indexOf(it.t) < 0 || !isInt(it.lane, 0, 2) || !isInt(it.z, 0, C.CHUNK_LEN - 1)) {
                fail('öğe türü/lane/z');
            }
            if (it.t === 'block' && !isInt(it.len, 1, 100000)) fail('blok uzunluğu');
            if (it.t === 'coins') {
                if (!isInt(it.n, 1, 64) || !isInt(it.step, 0, C.CHUNK_LEN)) fail('jeton hattı');
                if (it.arc !== undefined && typeof it.arc !== 'boolean') fail('jeton yayı');
                coins += it.n;
            }
            if (it.t === 'barrier' || it.t === 'bar' || it.t === 'block') obstacles++;
        }
        // id aralıkları (c*64+i, c*256+j) çakışmasın
        if (obstacles > C.OBSTACLE_ID_STRIDE || coins > C.COIN_ID_STRIDE) {
            fail('chunk başına en fazla 64 engel ve 256 jeton');
        }
    }
    return data.patterns;
}

export const PATTERNS = validatePatterns(patternsFile);

/** Zorluk katmanı: c < 12 → 0; c < 30 → 1; c < 60 → 2; c < 100 → 3; aksi 4. */
export function tierOf(c) {
    const s = C.TIER_STARTS;
    for (let t = 0; t < s.length; t++) {
        if (c < s[t]) return t;
    }
    return s.length;
}

// Katman başına uygun desenlerin dizin listesi ve toplam ağırlığı (dosya sırası).
const ELIGIBLE = [];
for (let tier = 0; tier <= C.TIER_STARTS.length; tier++) {
    const list = [];
    let total = 0;
    for (let i = 0; i < PATTERNS.length; i++) {
        if (PATTERNS[i].minTier <= tier) {
            list.push(i);
            total += PATTERNS[i].weight;
        }
    }
    if (total <= 0) throw new Error('Koşu desen kütüphanesinde katman ' + tier + ' için desen yok.');
    ELIGIBLE.push({ list, total });
}

/** 'start' | 'approach' | 'exit' | 'normal' */
export function chunkKind(c, gateCount) {
    if (c < C.START_CHUNKS) return 'start';
    // Kapı k'nin chunk'ı gc = 8 + 14k: gc-2 ve gc-1 yaklaşma, gc çıkış.
    const first = C.GATE_FIRST_CHUNK - 2;
    if (c >= first) {
        const k = Math.floor((c - first) / C.GATE_EVERY);
        if (k < gateCount) {
            const gc = C.GATE_FIRST_CHUNK + C.GATE_EVERY * k;
            if (c === gc - 2 || c === gc - 1) return 'approach';
            if (c === gc) return 'exit';
        }
    }
    return 'normal';
}

/** Ağırlıklı seçim: r = randInt(W), birikimli tarama (dosya sırası). */
function pickPattern(prng, tier) {
    const e = ELIGIBLE[tier];
    let r = randInt(prng, e.total);
    for (let i = 0; i < e.list.length; i++) {
        r -= PATTERNS[e.list[i]].weight;
        if (r < 0) return e.list[i];
    }
    return e.list[e.list.length - 1]; // erişilmez
}

function laneCoins(out, c, lane, z, n) {
    const base = c * C.CHUNK_LEN;
    for (let i = 0; i < n; i++) {
        out.coins.push({
            id: c * C.COIN_ID_STRIDE + out.coins.length,
            lane,
            z: base + z + i * 2500,
            y: C.COIN_Y_GROUND,
            taken: false,
        });
    }
}

/**
 * Chunk c'yi üretir. `override` yalnızca testler içindir (desen
 * geçilebilirliğini ve kuralları tek tek sınamak):
 *   (c) => ({ pattern, mirror, power } | { items, mirror, power }) | null
 * pattern: PATTERNS dizini; items: desen öğeleri (doğrulanmaz). Normal üretimde
 * hiç verilmez; PHP'de karşılığı yoktur.
 */
export function buildChunk(seed, gateCount, c, override) {
    const kind = chunkKind(c, gateCount);
    const out = { index: c, kind, obstacles: [], coins: [], powers: [] };

    // Özel chunk'lar PRNG kullanmaz.
    if (kind === 'start') {
        if (c === 1) laneCoins(out, c, 1, 5000, 8);
        return out;
    }
    if (kind === 'approach') {
        for (let lane = 0; lane < C.LANE_COUNT; lane++) laneCoins(out, c, lane, 2000, 11);
        return out;
    }
    if (kind === 'exit') return out;

    // Çağrı sırası SABİT: desen, mirror, güçlendirme.
    let items;
    let mirror;
    let power;
    const forced = override ? override(c) : null;
    if (forced) {
        items = Array.isArray(forced.items) ? forced.items : PATTERNS[forced.pattern].items;
        mirror = forced.mirror === true;
        power = forced.power || null;
    } else {
        const prng = chunkPrng(seed, c);
        items = PATTERNS[pickPattern(prng, tierOf(c))].items;
        mirror = randInt(prng, 2) === 1;
        const p = randInt(prng, C.POWER_ROLL);
        power = p < C.POWER_MAGNET_BELOW ? 'magnet' : (p < C.POWER_SHIELD_BELOW ? 'shield' : null);
    }

    const base = c * C.CHUNK_LEN;
    let slotUsed = false;
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const lane = mirror ? 2 - it.lane : it.lane;
        const z0 = base + it.z;
        if (it.t === 'barrier' || it.t === 'bar' || it.t === 'block') {
            const depth = it.t === 'block' ? it.len : (it.t === 'barrier' ? C.BARRIER_DEPTH : C.BAR_DEPTH);
            out.obstacles.push({
                id: c * C.OBSTACLE_ID_STRIDE + out.obstacles.length,
                type: it.t,
                lane,
                z0,
                z1: z0 + depth,
            });
        } else if (it.t === 'coins') {
            for (let j = 0; j < it.n; j++) {
                out.coins.push({
                    id: c * C.COIN_ID_STRIDE + out.coins.length,
                    lane,
                    z: z0 + j * it.step,
                    y: it.arc === true ? C.ARC[j < 7 ? j : 7] : C.COIN_Y_GROUND,
                    taken: false,
                });
            }
        } else {
            // Yalnızca İLK slot, zar tuttuysa güçlendirmeye dönüşür; diğerleri yok sayılır.
            if (!slotUsed && power !== null) {
                out.powers.push({
                    id: c * C.POWER_ID_STRIDE,
                    kind: power,
                    lane,
                    z: z0,
                    y: C.COIN_Y_GROUND,
                    taken: false,
                });
            }
            slotUsed = true;
        }
    }
    return out;
}
