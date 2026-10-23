import { gameErrorData, gameErrorMessage, gameErrorStatus } from '../../../services/gameErrors';

/*
 * Profil Teması (Ada Profili) için bileşen olmayan yardımcılar: sunucudan
 * gelen kaydı normalleştirme, durum metni, satın alma özeti ve hata eşleme.
 * Saf fonksiyonlar (node ortamında test edilir).
 *
 * Fiyat ve gün sayısı HİÇBİR yerde sabit yazılmaz; sunucunun `overview`
 * yanıtından gelir.
 */

export const THEME_KEY = 'ada';
export const DAY_MS = 86400000;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const parseTime = (iso) => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
};

/** Ham tema kaydı -> her alanı tanımlı nesne. Geçersizse null. */
export function normalizeTheme(raw) {
    if (!raw || typeof raw !== 'object' || !raw.key) return null;
    return {
        key: String(raw.key),
        name: typeof raw.name === 'string' && raw.name ? raw.name : 'Ada Profili',
        price: Math.max(0, Math.round(num(raw.price))),
        days: Math.max(0, Math.round(num(raw.days))),
        owned: !!raw.owned,
        active: !!raw.active,
        enabled: !!raw.enabled,
        expires_at: raw.expires_at || null,
        unlimited: !!raw.unlimited,
        source: raw.source || null,
        can_free: !!raw.can_free,
    };
}

/** Sunucunun döndürdüğü (kısmi olabilen) tema kaydını mevcut kayda işler. */
export function mergeTheme(prev, patch) {
    return normalizeTheme({ ...(prev || {}), ...(patch || {}) }) || prev || null;
}

/** `overview` yanıtından temayı bulur (yoksa null). */
export function pickTheme(overview, key = THEME_KEY) {
    const list = Array.isArray(overview?.themes) ? overview.themes : [];
    return normalizeTheme(list.find((t) => t?.key === key));
}

/** Kalan tam gün (yukarı yuvarlanır); süresizse null. */
export function daysLeft(expiresAt, now = Date.now()) {
    const t = parseTime(expiresAt);
    if (t === null) return null;
    return Math.max(0, Math.ceil((t - now) / DAY_MS));
}

/** "1 Kasım 2026" */
export function formatDateTR(iso) {
    const t = parseTime(iso);
    if (t === null) return '';
    try {
        return new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
        return '';
    }
}

/**
 * Hak sahipliği durumu. `active` alanı sunucuda "süresi dolmadı" ya da
 * "süresi dolmadı VE açık" anlamına gelebileceğinden, bitiş tarihi varsa
 * karar tarihten verilir (kapalı ama süresi içindeki tema "doldu" sayılmaz).
 *
 * kind: 'none' | 'active' | 'unlimited' | 'expired'
 */
export function themeStatus(theme, now = Date.now()) {
    if (!theme || !theme.owned) {
        return { kind: 'none', entitled: false, daysLeft: null, label: 'Sahip değilsin', tone: 'neutral' };
    }
    if (theme.unlimited) {
        return {
            kind: 'unlimited',
            entitled: true,
            daysLeft: null,
            label: theme.source === 'admin' ? 'Süresiz (yönetici)' : 'Süresiz',
            tone: 'success',
        };
    }
    const exp = parseTime(theme.expires_at);
    const entitled = exp !== null ? exp > now : theme.active;
    if (!entitled) {
        return { kind: 'expired', entitled: false, daysLeft: 0, label: 'Süresi doldu', tone: 'warning' };
    }
    const d = daysLeft(theme.expires_at, now);
    return {
        kind: 'active',
        entitled: true,
        daysLeft: d,
        label: d === null ? 'Aktif' : `Aktif · kalan ${d} gün`,
        tone: 'success',
    };
}

/** Satın alma penceresinin hesapları: bakiye yeter mi, sonra kalan, yeni bitiş. */
export function purchaseSummary(theme, balance, now = Date.now()) {
    const price = theme?.price ?? 0;
    const days = theme?.days ?? 0;
    const bal = Math.max(0, num(balance));
    const status = themeStatus(theme, now);
    const extending = status.kind === 'active';
    const blocked = status.kind === 'unlimited';
    const base = extending ? parseTime(theme.expires_at) ?? now : now;
    const newExpiresAt = blocked ? null : new Date(base + days * DAY_MS).toISOString();
    return {
        price,
        days,
        balance: bal,
        enough: bal >= price,
        missing: Math.max(0, price - bal),
        after: Math.max(0, bal - price),
        extending,
        blocked,
        newExpiresAt,
        buyLabel: extending ? `${days} gün uzat` : 'Satın al',
    };
}

const nf = (n) => num(n).toLocaleString('tr-TR');

/**
 * API hatasını arayüzün anlayacağı biçime çevirir.
 * kind: 'insufficient' | 'unlimited' | 'cap' | 'not_entitled' | 'forbidden' | 'rate' | 'network' | 'other'
 * Sunucu metni Türkçedir ama bilinen durumlar için kendi metnimizi veririz.
 */
export function themeErrorInfo(err, fallback = 'İşlem tamamlanamadı. Lütfen tekrar dene.') {
    const status = gameErrorStatus(err);
    const data = gameErrorData(err) || {};
    const reason = data.reason ?? err?.response?.data?.reason ?? null;

    if (!err?.response) {
        return { kind: 'network', status, reason, data, message: gameErrorMessage(err, fallback) };
    }
    if (reason === 'insufficient') {
        const hasNums = Number.isFinite(Number(data.balance)) && Number.isFinite(Number(data.price));
        return {
            kind: 'insufficient',
            status,
            reason,
            data,
            balance: hasNums ? Number(data.balance) : null,
            message: hasNums
                ? `Yeterli jetonun yok: bakiyen ${nf(data.balance)}, gereken ${nf(data.price)} jeton.`
                : 'Yeterli jetonun yok.',
        };
    }
    if (reason === 'unlimited') {
        return { kind: 'unlimited', status, reason, data, message: 'Bu tema sende zaten süresiz; ek ücret ödemene gerek yok.' };
    }
    if (reason === 'max_stack' || reason === 'cap' || reason === 'stack_cap') {
        return { kind: 'cap', status, reason, data, message: gameErrorMessage(err, 'Biriktirebileceğin en uzun süreye ulaştın.') };
    }
    if (reason === 'not_entitled') {
        return { kind: 'not_entitled', status, reason, data, message: 'Önce temayı satın almalısın.' };
    }
    if (status === 403) {
        return { kind: 'forbidden', status, reason, data, message: 'Bu işlem için yetkin yok.' };
    }
    if (status === 429) {
        return { kind: 'rate', status, reason, data, message: 'Çok hızlı gidiyorsun, birkaç saniye bekleyip tekrar dene.' };
    }
    if (status === 409) {
        return { kind: 'other', status, reason, data, message: gameErrorMessage(err, 'İşlem şu an tamamlanamadı. Sayfayı yenileyip tekrar dene.') };
    }
    return { kind: 'other', status, reason, data, message: gameErrorMessage(err, fallback) };
}
