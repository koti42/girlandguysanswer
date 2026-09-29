/*
 * Oyun Merkezi için bileşen olmayan yardımcılar.
 */

export const MODE_LABELS = {
    arena: 'Bilgi Arenası',
    daily: 'Günün Sorusu',
    duel: 'Bire Bir Düello',
};

export const LEAGUES = {
    bronz: { name: 'Bronz', className: 'from-amber-700 to-orange-500', ring: 'ring-amber-500/40', emoji: '🥉' },
    gumus: { name: 'Gümüş', className: 'from-slate-400 to-slate-200 text-slate-900', ring: 'ring-slate-300/50', emoji: '🥈' },
    altin: { name: 'Altın', className: 'from-yellow-500 to-amber-300 text-amber-950', ring: 'ring-yellow-400/50', emoji: '🥇' },
    platin: { name: 'Platin', className: 'from-cyan-500 to-teal-300 text-teal-950', ring: 'ring-cyan-300/50', emoji: '💠' },
    elmas: { name: 'Elmas', className: 'from-fuchsia-500 to-sky-400', ring: 'ring-fuchsia-400/50', emoji: '💎' },
};

export function leagueInfo(league) {
    const key = league?.key || 'bronz';
    const base = LEAGUES[key] || LEAGUES.bronz;
    return { ...base, key, name: league?.name || base.name };
}

export function formatNumber(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '0';
    return v.toLocaleString('tr-TR');
}

export function clampPct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

export function prefersReducedMotion() {
    try {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
        return false;
    }
}

/** Doğru/yanlışta kısa titreşim; destek yoksa sessizce geçer. */
export function vibrate(pattern) {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(pattern);
        }
    } catch {
        // Bazı tarayıcılar kullanıcı etkileşimi olmadan titreşimi reddeder.
    }
}

/*
 * Günlük soru ve haftalık lig Europe/Istanbul gününe göre dönüyor.
 * Türkiye 2016'dan beri yaz saati uygulamıyor, sabit UTC+3.
 */
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function nextIstanbulMidnight(now = Date.now()) {
    const local = now + ISTANBUL_OFFSET_MS;
    const startOfDay = local - (((local % DAY_MS) + DAY_MS) % DAY_MS);
    return startOfDay + DAY_MS - ISTANBUL_OFFSET_MS;
}

/** Bir sonraki Pazartesi 00:00 (İstanbul) - haftalık lig sıfırlaması. */
export function nextIstanbulMonday(now = Date.now()) {
    const midnight = nextIstanbulMidnight(now);
    // midnight anındaki İstanbul günü (0 = Pazar)
    const weekday = new Date(midnight + ISTANBUL_OFFSET_MS).getUTCDay();
    const daysToMonday = (8 - weekday) % 7;
    return midnight + daysToMonday * DAY_MS;
}

export function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (x) => String(x).padStart(2, '0');
    if (d > 0) return `${d}g ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Düelloda isteği atan kullanıcının kendi tarafı bitti mi? */
export function duelMine(duel) {
    if (!duel) return { finished: false, myScore: null, theirScore: null, rival: null };
    const amChallenger = duel.my_role !== 'opponent';
    return {
        finished: amChallenger ? Boolean(duel.challenger_finished) : Boolean(duel.opponent_finished),
        rivalFinished: amChallenger ? Boolean(duel.opponent_finished) : Boolean(duel.challenger_finished),
        myScore: amChallenger ? duel.challenger_score : duel.opponent_score,
        theirScore: amChallenger ? duel.opponent_score : duel.challenger_score,
        me: amChallenger ? duel.challenger : duel.opponent,
        rival: amChallenger ? duel.opponent : duel.challenger,
    };
}

export const DUEL_RESULT_LABELS = {
    win: { text: 'Galibiyet', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
    loss: { text: 'Mağlubiyet', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' },
    draw: { text: 'Berabere', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
};

export const DUEL_STATUS_LABELS = {
    pending: 'Davet bekliyor',
    active: 'Devam ediyor',
    finished: 'Bitti',
    declined: 'Reddedildi',
    expired: 'Süresi doldu',
};

/*
 * Profil ucu yalnızca kazanılmış rozetleri döner; overview ise tüm katalogu
 * (earned_at: null dahil). Koleksiyonu "kazanılmayanlar soluk" gösterebilmek
 * için katalog ile profildeki kazanımlar birleştirilir.
 */
export function mergeBadges(catalog, earned) {
    const earnedList = Array.isArray(earned) ? earned : [];
    if (!Array.isArray(catalog) || catalog.length === 0) return earnedList;
    const byKey = new Map(earnedList.map((b) => [b.key, b]));
    const merged = catalog.map((b) => ({ ...b, earned_at: byKey.get(b.key)?.earned_at ?? null }));
    const known = new Set(catalog.map((b) => b.key));
    return [...merged, ...earnedList.filter((b) => !known.has(b.key))];
}

export async function shareOrCopy({ title, text, url }) {
    try {
        if (typeof navigator !== 'undefined' && navigator.share) {
            await navigator.share({ title, text, url });
            return 'shared';
        }
    } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
    }
    try {
        await navigator.clipboard.writeText(`${text} ${url}`.trim());
        return 'copied';
    } catch {
        return 'failed';
    }
}
