import { describe, expect, it } from 'vitest';
import {
    DAY_MS, daysLeft, formatDateTR, mergeTheme, normalizeTheme, pickTheme, purchaseSummary, themeErrorInfo, themeStatus,
} from '../themeUtils';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const base = { key: 'ada', name: 'Ada Profili', price: 1000000, days: 15, owned: false, active: false, enabled: false, expires_at: null, unlimited: false, source: null, can_free: false };
const err = (status, data = {}, message = undefined) => ({ response: { status, data: { success: false, message, data } } });

describe('normalizeTheme / pickTheme / mergeTheme', () => {
    it('eksik alanları doldurur, geçersizi reddeder', () => {
        expect(normalizeTheme(null)).toBeNull();
        expect(normalizeTheme({})).toBeNull();
        const t = normalizeTheme({ key: 'ada', price: '1000000', days: 15, owned: 1 });
        expect(t).toMatchObject({ key: 'ada', name: 'Ada Profili', price: 1000000, days: 15, owned: true, active: false, enabled: false, unlimited: false, can_free: false, expires_at: null });
    });

    it('overview içinden anahtarla bulur', () => {
        expect(pickTheme({ themes: [{ ...base, key: 'x' }, { ...base, price: 5 }] }).price).toBe(5);
        expect(pickTheme({ themes: [] })).toBeNull();
        expect(pickTheme(null)).toBeNull();
    });

    it('mergeTheme kısmi yanıtı mevcut kayda işler', () => {
        const prev = normalizeTheme({ ...base, owned: true, active: true, enabled: true, expires_at: iso(NOW + DAY_MS) });
        const next = mergeTheme(prev, { enabled: false });
        expect(next.enabled).toBe(false);
        expect(next.price).toBe(1000000);
        expect(mergeTheme(null, null)).toBeNull();
    });
});

describe('daysLeft / formatDateTR', () => {
    it('yukarı yuvarlar; süresizde null', () => {
        expect(daysLeft(iso(NOW + 15 * DAY_MS), NOW)).toBe(15);
        expect(daysLeft(iso(NOW + 3600 * 1000), NOW)).toBe(1);
        expect(daysLeft(iso(NOW - 1000), NOW)).toBe(0);
        expect(daysLeft(null, NOW)).toBeNull();
        expect(daysLeft('bozuk', NOW)).toBeNull();
    });

    it('tarihi Türkçe yazar', () => {
        expect(formatDateTR('2026-11-01T12:00:00Z')).toMatch(/1 Kasım 2026/);
        expect(formatDateTR(null)).toBe('');
    });
});

describe('themeStatus', () => {
    it('sahip değil', () => {
        expect(themeStatus(normalizeTheme(base), NOW)).toMatchObject({ kind: 'none', entitled: false, label: 'Sahip değilsin' });
        expect(themeStatus(null, NOW).kind).toBe('none');
    });

    it('süreli aktif: kalan gün', () => {
        const t = normalizeTheme({ ...base, owned: true, active: true, enabled: true, expires_at: iso(NOW + 12 * DAY_MS) });
        expect(themeStatus(t, NOW)).toMatchObject({ kind: 'active', entitled: true, daysLeft: 12, label: 'Aktif · kalan 12 gün' });
    });

    it('kapalı ama süresi içindeki tema "doldu" sayılmaz (active alanı enabled ile karışsa bile)', () => {
        const t = normalizeTheme({ ...base, owned: true, active: false, enabled: false, expires_at: iso(NOW + 2 * DAY_MS) });
        expect(themeStatus(t, NOW).kind).toBe('active');
    });

    it('süresi dolmuş', () => {
        const t = normalizeTheme({ ...base, owned: true, active: true, enabled: true, expires_at: iso(NOW - 1000) });
        expect(themeStatus(t, NOW)).toMatchObject({ kind: 'expired', entitled: false, label: 'Süresi doldu' });
    });

    it('bitiş tarihi yoksa active alanına bakar', () => {
        expect(themeStatus(normalizeTheme({ ...base, owned: true, active: false }), NOW).kind).toBe('expired');
        expect(themeStatus(normalizeTheme({ ...base, owned: true, active: true }), NOW).kind).toBe('active');
    });

    it('süresiz: yönetici kaynaklıysa etiket belirtir', () => {
        const a = normalizeTheme({ ...base, owned: true, active: true, enabled: true, unlimited: true, source: 'admin' });
        expect(themeStatus(a, NOW)).toMatchObject({ kind: 'unlimited', label: 'Süresiz (yönetici)', daysLeft: null });
        expect(themeStatus({ ...a, source: 'purchase' }, NOW).label).toBe('Süresiz');
    });
});

describe('purchaseSummary', () => {
    it('ilk alım: bakiye yeter, sonra kalan ve bitiş', () => {
        const s = purchaseSummary(normalizeTheme(base), 1500000, NOW);
        expect(s).toMatchObject({ price: 1000000, days: 15, enough: true, missing: 0, after: 500000, extending: false, blocked: false, buyLabel: 'Satın al' });
        expect(s.newExpiresAt).toBe(iso(NOW + 15 * DAY_MS));
    });

    it('yetersiz bakiye: eksik miktar', () => {
        const s = purchaseSummary(normalizeTheme(base), 250000, NOW);
        expect(s).toMatchObject({ enough: false, missing: 750000, after: 0 });
    });

    it('süre varken uzatma mevcut bitişin üstüne ekler', () => {
        const exp = NOW + 5 * DAY_MS;
        const t = normalizeTheme({ ...base, owned: true, active: true, enabled: true, expires_at: iso(exp) });
        const s = purchaseSummary(t, 2000000, NOW);
        expect(s.extending).toBe(true);
        expect(s.buyLabel).toBe('15 gün uzat');
        expect(s.newExpiresAt).toBe(iso(exp + 15 * DAY_MS));
    });

    it('süresiz hakta satın alma engellenir', () => {
        const t = normalizeTheme({ ...base, owned: true, active: true, unlimited: true, source: 'admin' });
        const s = purchaseSummary(t, 9999999, NOW);
        expect(s.blocked).toBe(true);
        expect(s.newExpiresAt).toBeNull();
    });

    it('bozuk bakiye 0 sayılır', () => {
        expect(purchaseSummary(normalizeTheme(base), 'x', NOW).balance).toBe(0);
    });
});

describe('themeErrorInfo', () => {
    it('yetersiz bakiye: sayılar metne girer', () => {
        const i = themeErrorInfo(err(422, { reason: 'insufficient', balance: 250000, price: 1000000 }, 'x'));
        expect(i.kind).toBe('insufficient');
        expect(i.balance).toBe(250000);
        expect(i.message).toBe('Yeterli jetonun yok: bakiyen 250.000, gereken 1.000.000 jeton.');
    });

    it('yetersiz bakiye: sayı yoksa kısa metin', () => {
        const i = themeErrorInfo(err(422, { reason: 'insufficient' }));
        expect(i).toMatchObject({ kind: 'insufficient', balance: null, message: 'Yeterli jetonun yok.' });
    });

    it('süresiz: 409 ve 422 aynı', () => {
        expect(themeErrorInfo(err(409, { reason: 'unlimited' })).kind).toBe('unlimited');
        expect(themeErrorInfo(err(422, { reason: 'unlimited' })).message).toMatch(/zaten süresiz/);
    });

    it('reason gövde kökünde de olabilir', () => {
        const e = { response: { status: 409, data: { success: false, reason: 'unlimited' } } };
        expect(themeErrorInfo(e).kind).toBe('unlimited');
    });

    it('üst sınır: sunucu metni korunur', () => {
        const i = themeErrorInfo(err(422, { reason: 'max_stack' }, 'En fazla 365 gün biriktirebilirsin.'));
        expect(i).toMatchObject({ kind: 'cap', message: 'En fazla 365 gün biriktirebilirsin.' });
    });

    it('yetki, hız sınırı, ağ, sunucu hatası', () => {
        expect(themeErrorInfo(err(403, {}, 'Forbidden')).message).toBe('Bu işlem için yetkin yok.');
        expect(themeErrorInfo(err(429)).kind).toBe('rate');
        expect(themeErrorInfo({}).kind).toBe('network');
        expect(themeErrorInfo(err(500)).message).toMatch(/Sunucuda bir sorun/);
    });

    it('bilinmeyen 409/422: sunucunun Türkçe metni, yoksa yedek', () => {
        expect(themeErrorInfo(err(422, {}, 'Önce temaya sahip olmalısın.')).message).toBe('Önce temaya sahip olmalısın.');
        expect(themeErrorInfo(err(409)).message).toMatch(/Sayfayı yenileyip/);
        expect(themeErrorInfo(err(422), 'Yedek').message).toBe('Yedek');
    });
});
