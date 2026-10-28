/*
 * Skor. Backend tavanı (config/game_protocol_zero.php):
 *   max = base[d] + days*60 + decrypt*40 + nodesSaved*300 (+ victoryBonus[d] zaferde)
 * Buradaki formül her girdide bu tavanın ALTINDA kalır; aşarsa sunucu 422 verir.
 */

export const SCORE_BASE = Object.freeze({ easy: 500, normal: 1000, hard: 2000, nightmare: 3500 });
export const VICTORY_BONUS = Object.freeze({ easy: 2000, normal: 4000, hard: 7000, nightmare: 12000 });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} r  { difficulty, outcome: 'victory'|'defeat', days, decrypt (0-100), nodesSaved (0-14), techs (0-9), breachesWon }
 */
export function computeScore(r) {
    const d = SCORE_BASE[r.difficulty] != null ? r.difficulty : 'normal';
    const victory = r.outcome === 'victory';
    const days = clamp(Math.floor(Number(r.days) || 0), 1, 365);
    const decrypt = clamp(Math.round(Number(r.decrypt) || 0), 0, 100);
    const nodesSaved = clamp(Math.floor(Number(r.nodesSaved) || 0), 0, 14);
    const techs = clamp(Math.floor(Number(r.techs) || 0), 0, 9);
    const breaches = clamp(Math.floor(Number(r.breachesWon) || 0), 0, 99);

    let score = SCORE_BASE[d];
    // Yenilgide uzun dayanmak ödül; zaferde hız ödül (gün puanı küçük, bonus güne göre erir).
    score += days * (victory ? 4 : 25);
    score += decrypt * 30;
    score += nodesSaved * 200;
    if (victory) {
        // Hızlı zafer daha çok bonus: 1. günde tam, 300. günden sonra dörtte bir.
        score += Math.round(VICTORY_BONUS[d] * (1 - Math.min(days, 300) / 400));
    }
    // Ek bonuslar tavanın bıraktığı paya sığdırılır (days*20 + decrypt*10 + nodes*100 pay).
    const slack = days * 20 + decrypt * 10 + nodesSaved * 100;
    score += Math.min(techs * 40 + breaches * 60, slack);

    return Math.max(0, Math.floor(score));
}

/** Backend tavanı (test ve istemci-sunucu tutarlılığı için). */
export function maxScore(r) {
    const d = SCORE_BASE[r.difficulty] != null ? r.difficulty : 'normal';
    const victory = r.outcome === 'victory';
    return SCORE_BASE[d] + r.days * 60 + r.decrypt * 40 + r.nodesSaved * 300 + (victory ? VICTORY_BONUS[d] : 0);
}
