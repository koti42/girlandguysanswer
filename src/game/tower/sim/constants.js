/*
 * "Herkesler Yükseliyor" kule simülasyonu sabitleri (şartname §B.1).
 *
 * Birimler: uzunluk milimetre, zaman tick (60 tick = 1 sn), hız mm/tick.
 * Hepsi tamsayı: aynı girdi JS'te ve PHP'de (TowerSim.php) bit-bit aynı
 * sonucu vermeli. Buradaki bir değer değişirse PHP karşılığı ve golden.json
 * da değişmek zorunda; TOWER_SIM_VERSION artırılır.
 */

export const TOWER_SIM_VERSION = 1;

export const TC = Object.freeze({
    TICK_RATE: 60,

    // Taban kat (floor 0): x ve z'de [-1500, 1500]
    BASE_HALF: 1500,
    MAX_W: 3000, // büyüme bir eksende en fazla bu boya kadar

    // Hareket: off(t') = -R ↔ +R ping-pong, s = t' * v
    R: 4500,
    V0_T: 60, // v(k) = min(VMAX_T, V0_T + SPEED_STEP * floor((k - 1) / SPEED_EVERY))
    VMAX_T: 170,
    SPEED_STEP: 2,
    SPEED_EVERY: 3,

    // Şartnamede 6; 12'ye çıkarıldı: 100 ms arayla gelen çift dokunuş (dokunmatik
    // ekranda sık) yeni katı doğduğu tick'te, kulenin 1,5 m dışındayken
    // yakalayıp oyunu bitiriyordu. 200 ms çift dokunuşların çoğunu yutar,
    // kameranın bir kat yükselmesine de zaman tanır.
    SPAWN_DELAY: 12,

    PERFECT: 90, // |off| <= 90 → mükemmel
    GROW: 60, // combo >= 2 iken mükemmelde her iki yana

    // Soru katları: k % 12 == 0 ve qIndex < questionCount
    QUESTION_EVERY: 12,
    QUESTION_TICKS: 480, // 8 sn içinde cevap yoksa cevapsız (choice -1)
    MAX_QUESTIONS: 255, // game_tower_runs.question_count üst sınırı

    // Puan: kat başına 10 + mükemmelde 5 × min(combo, 10); doğru cevap 150
    FLOOR_POINTS: 10,
    PERFECT_POINTS: 5,
    PERFECT_COMBO_CAP: 10,
    CORRECT_POINTS: 150,

    MAX_TICKS: 108000, // 30 dk

    // Girdi kaydı sınırları: token ≤ 6 hane + kod + virgül → 6000 × 8 karakter
    MAX_INPUT_TOKENS: 6000,
    MAX_INPUT_CHARS: 48000,
    MAX_INPUTS_PER_TICK: 2,
});

// Türetilmiş (sıcak döngüde tekrar çarpılmasın)
const TWO_R = 2 * TC.R;
const THREE_R = 3 * TC.R;
const FOUR_R = 4 * TC.R;

/**
 * Hareketli katın ofseti: s = t' * v; ph = s mod 4R;
 * off = ph <= 2R ? -R + ph : 3R - ph  (−R → +R → −R).
 * t' ≤ MAX_TICKS ve v ≤ VMAX_T olduğundan çarpım 2^31'in çok altında.
 */
export function offsetAt(tPrime, v) {
    const ph = (tPrime * v) % FOUR_R;
    return ph <= TWO_R ? ph - TC.R : THREE_R - ph;
}

/** v(k) = min(VMAX_T, V0_T + 2 * floor((k - 1) / 3)); k ≥ 1. */
export function speedFor(floor) {
    const k = floor < 1 ? 1 : floor;
    const v = TC.V0_T + TC.SPEED_STEP * Math.floor((k - 1) / TC.SPEED_EVERY);
    return v < TC.VMAX_T ? v : TC.VMAX_T;
}

/** Kat k'nin hareket ekseni: tek → 'x', çift → 'z'. */
export function axisFor(floor) {
    return floor % 2 === 1 ? 'x' : 'z';
}

/** Kat k yerleşince soru gelir mi (soru kotası dolmamışsa). */
export function isQuestionFloor(floor) {
    return floor > 0 && floor % TC.QUESTION_EVERY === 0;
}
