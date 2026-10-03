/*
 * "Herkesler Koşuyor" simülasyon sabitleri (şartname §3.1).
 *
 * Birimler: uzunluk milimetre, zaman tick (60 tick = 1 sn), hız mm/tick.
 * Hepsi tamsayı: aynı seed + aynı girdi JS'te ve PHP'de bit-bit aynı sonucu
 * vermeli. Buradaki bir değer değişirse PHP'deki karşılığı (RunnerSim.php)
 * ve golden.json da değişmek zorunda; SIM_VERSION artırılır.
 */

export const SIM_VERSION = 1;

export const C = Object.freeze({
    TICK_RATE: 60,
    LANE_COUNT: 3, // 0 sol, 1 orta, 2 sağ
    LANE_WIDTH: 2500, // laneX(l) = (l - 1) * 2500
    LANE_SPEED: 250, // x hedefe tick başına en fazla bu kadar yaklaşır
    V0: 180,
    VMAX: 420,
    SPEED_STEP_TICKS: 80, // speed(t) = min(VMAX, V0 + floor(t / 80))
    JUMP_V: 140,
    GRAVITY: 7,
    FAST_FALL_V: 42,
    JUMP_BUFFER: 8,
    SLIDE_TICKS: 40,
    STUMBLE_TICKS: 90,
    INVULN_TICKS: 90,
    MAGNET_TICKS: 600,
    MAGNET_REACH_BACK: 900,
    MAGNET_REACH_AHEAD: 7000,
    PLAYER_HALF_W: 400,
    PLAYER_HALF_D: 300,
    STAND_H: 1700,
    SLIDE_H: 700,
    OBST_HALF_W: 1050,
    BARRIER_DEPTH: 500,
    BARRIER_TOP: 900,
    BAR_DEPTH: 500,
    BAR_BOTTOM: 1100,
    COIN_REACH_Z: 900,
    COIN_REACH_X: 1000,
    COIN_REACH_Y: 800,
    COIN_Y_GROUND: 900,
    CHUNK_LEN: 30000,
    GATE_FIRST_CHUNK: 8, // kapı k: zGate(k) = (8 + 14k) * 30000
    GATE_EVERY: 14,
    MAX_TICKS: 108000, // 30 dk
    MULT_MAX: 5,
    COIN_POINTS: 10,
    GATE_POINTS: 200,

    // Girdi kaydı sınırları (§2, §3.5)
    MAX_INPUT_TOKENS: 12000,
    MAX_INPUT_CHARS: 100000,
    MAX_INPUTS_PER_TICK: 4,

    // Kapı sayısı üst sınırı (game_runner_runs.gate_count unsignedTinyInteger)
    MAX_GATES: 255,

    // Pist üretimi (§3.3)
    START_CHUNKS: 2, // c ∈ {0, 1}
    TIER_STARTS: Object.freeze([12, 30, 60, 100]), // c < 12 → 0, c < 30 → 1 ...
    POWER_ROLL: 1000,
    POWER_MAGNET_BELOW: 30, // p < 30 → mıknatıs
    POWER_SHIELD_BELOW: 55, // p < 55 → kalkan
    OBSTACLE_ID_STRIDE: 64, // engel id = c * 64 + i
    COIN_ID_STRIDE: 256, // jeton id = c * 256 + j
    POWER_ID_STRIDE: 4, // güçlendirme id = c * 4 + 0

    // Zıplama yayını izleyen jeton yükseklikleri (arc=true hatlarda i. jeton)
    ARC: Object.freeze([1100, 1600, 2000, 2200, 2200, 2000, 1600, 1100]),
});

// Türetilmiş eşikler (sıcak döngüde tekrar toplanmasın)
export const HIT_X = C.PLAYER_HALF_W + C.OBST_HALF_W; // 1450
export const GATE_LANE_EDGE = C.LANE_WIDTH / 2; // 1250

export function laneX(lane) {
    return (lane - 1) * C.LANE_WIDTH;
}

/** speed(t) = min(VMAX, V0 + floor(t / 80)); t negatif olamaz. */
export function speedAt(t) {
    const v = C.V0 + Math.floor(t / C.SPEED_STEP_TICKS);
    return v < C.VMAX ? v : C.VMAX;
}

/** Kapı k'nin z'si (chunk başı). */
export function zGate(k) {
    return (C.GATE_FIRST_CHUNK + C.GATE_EVERY * k) * C.CHUNK_LEN;
}

/**
 * Kapı k'nin geçildiği tick: z 0'dan başlayıp `z += speed(t)` ile ilerlerken
 * `prevZ < zGate(k) <= z` olan t. Hız girdiden bağımsız olduğundan sunucu bunu
 * girdi olmadan hesaplar. Hız 80 tick boyunca sabit: blok blok ilerleriz.
 */
export function gateTick(k) {
    if (!Number.isInteger(k) || k < 0 || k > C.MAX_GATES) {
        throw new RangeError('Geçersiz kapı.');
    }
    const target = zGate(k);
    let z = 0;
    let t = 0;
    for (;;) {
        const v = speedAt(t);
        const span = v * C.SPEED_STEP_TICKS;
        if (z + span < target) {
            z += span;
            t += C.SPEED_STEP_TICKS;
            continue;
        }
        // Bu blokta: en küçük i, z + (i + 1) * v >= target. (target - z >= 1)
        return t + Math.floor((target - z - 1) / v);
    }
}
