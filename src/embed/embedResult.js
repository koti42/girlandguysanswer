import { clampInt } from '../components/game/runner/runnerUtils';

/*
 * Oyun sonucunun native'e giden `result` özeti (köprü şeması: düz değerler).
 * Native bununla yalnızca lobiyi tazeler ve isterse kısa bir bildirim
 * gösterir; puanın doğrusu her zaman sunucudadır.
 */

const intOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? clampInt(v, 0, Number.MAX_SAFE_INTEGER, 0) : null);

/** Sonuç -> native `result` özeti (lobi tazelenir). result null: kaydedildi ama yanıt okunamadı. */
export function summarizeRunnerResult(r) {
    if (!r || typeof r !== 'object') return { game: 'kosu', score: null, saved: true };
    return {
        game: 'kosu',
        practice: Boolean(r.practice),
        score: clampInt(r.score, 0, Number.MAX_SAFE_INTEGER, 0),
        distance_m: intOrNull(r.distance_m),
        coins: intOrNull(r.coins),
        xp_earned: intOrNull(r.xp_earned),
        weekly_rank: intOrNull(r.weekly_rank),
        new_best: Boolean(r.new_best),
        level_up: Boolean(r.level_up),
        coins_earned: intOrNull(r.coins_earned),
        balance: intOrNull(r.wallet?.balance),
    };
}

/** Kule sonucu -> native `result` özeti. result null: kaydedildi ama yanıt okunamadı. */
export function summarizeTowerResult(r) {
    if (!r || typeof r !== 'object') return { game: 'kule', score: null, saved: true };
    return {
        game: 'kule',
        practice: Boolean(r.practice),
        score: clampInt(r.score, 0, Number.MAX_SAFE_INTEGER, 0),
        floor: intOrNull(r.floors),
        perfects: intOrNull(r.perfects),
        max_combo: intOrNull(r.max_combo),
        correct_count: intOrNull(r.correct_count),
        xp_earned: intOrNull(r.xp_earned),
        weekly_rank: intOrNull(r.weekly_rank),
        coins_earned: intOrNull(r.coins_earned),
        balance: intOrNull(r.wallet?.balance),
        new_best: Boolean(r.new_best),
        level_up: Boolean(r.level_up),
    };
}
