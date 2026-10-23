import { describe, expect, it } from 'vitest';
import {
    ISLAND_STOPS,
    badgeItems,
    canMessage,
    canViewContent,
    followState,
    questionItems,
    sceneProfile,
    themeBadge,
    wrapIndex,
} from '../islandUtils';

/*
 * Ada Profili saf yardımcıları (node ortamı). Kancalar ve DOM davranışı
 * ProfileIslandHero.test.jsx'te sınanır.
 */

const DAY = 86400000;

describe('ISLAND_STOPS', () => {
    it('beş durak, motor sözleşmesindeki anahtar sırasıyla', () => {
        expect(ISLAND_STOPS.map((s) => s.key)).toEqual(['hakkinda', 'sorular', 'cevaplar', 'rozetler', 'takip']);
        expect(ISLAND_STOPS.every((s) => s.label)).toBe(true);
    });
});

describe('wrapIndex', () => {
    it('baştan sona ve sondan başa sarar', () => {
        expect(wrapIndex(-1, 5)).toBe(4);
        expect(wrapIndex(5, 5)).toBe(0);
        expect(wrapIndex(7, 5)).toBe(2);
        expect(wrapIndex(2, 5)).toBe(2);
    });

    it('geçersiz girdide 0 döner', () => {
        expect(wrapIndex(NaN, 5)).toBe(0);
        expect(wrapIndex(3, 0)).toBe(0);
    });
});

describe('themeBadge', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');

    it('süresiz tema: Süresiz', () => {
        expect(themeBadge({ key: 'ada', active: true, expires_at: null }, now)).toEqual({ unlimited: true, label: 'Süresiz' });
    });

    it('kalan günü yukarı yuvarlar', () => {
        const at = new Date(now + 14 * DAY + 3600000).toISOString();
        expect(themeBadge({ expires_at: at }, now)).toMatchObject({ unlimited: false, days: 15, label: '15 gün kaldı' });
        const one = new Date(now + DAY + 1000).toISOString();
        expect(themeBadge({ expires_at: one }, now).label).toBe('2 gün kaldı');
    });

    it('son 24 saatte "Bugün bitiyor"', () => {
        const at = new Date(now + 5 * 3600000).toISOString();
        expect(themeBadge({ expires_at: at }, now).label).toBe('Bugün bitiyor');
    });

    it('süresi dolmuş, bozuk tarih ya da tema yok: rozet yok', () => {
        expect(themeBadge({ expires_at: new Date(now - 1000).toISOString() }, now)).toBeNull();
        expect(themeBadge({ expires_at: 'bozuk' }, now)).toBeNull();
        expect(themeBadge(null, now)).toBeNull();
    });

    it('ziyaretçi yükünde expires_at yok: bilinmiyor, "Süresiz" yazılmaz', () => {
        expect(themeBadge({ key: 'ada', active: true }, now)).toBeNull();
    });
});

describe('canViewContent', () => {
    it('gizli hesap yalnız sahibine ve takipçiye açık', () => {
        expect(canViewContent({ isPrivate: true, isFollowing: false }, false)).toBe(false);
        expect(canViewContent({ isPrivate: true, isFollowing: true }, false)).toBe(true);
        expect(canViewContent({ isPrivate: true }, true)).toBe(true);
        expect(canViewContent({ isPrivate: false }, false)).toBe(true);
    });
});

describe('canMessage', () => {
    it('ProfileActions kuralıyla aynı', () => {
        expect(canMessage({ allow_messaging: true, messaging_mode: 'everyone' })).toBe(true);
        expect(canMessage({ allow_messaging: false })).toBe(false);
        expect(canMessage({ messaging_mode: 'followers', isFollowing: false })).toBe(false);
        expect(canMessage({ messaging_mode: 'followers', isFollowing: true })).toBe(true);
        expect(canMessage({ allow_messaging: false }, true)).toBe(true);
        expect(canMessage({ hasBlocked: true }, true)).toBe(false);
        expect(canMessage(null)).toBe(false);
    });
});

describe('followState', () => {
    it('durum yazıları sayfadaki düğmeyle aynı', () => {
        expect(followState({}).label).toBe('Takip Et');
        expect(followState({ isPrivate: true }).label).toBe('Takip İsteği Gönder');
        expect(followState({ isFollowing: true })).toMatchObject({ label: 'Takip Ediliyor', active: true, disabled: false });
        expect(followState({ hasPendingRequest: true }).label).toBe('İstek Gönderildi');
        expect(followState({ allow_following: false })).toMatchObject({ label: 'Takip Kapalı', disabled: true });
        expect(followState({ hasBlocked: true })).toMatchObject({ label: 'Engellenmiş', disabled: true });
    });
});

describe('questionItems', () => {
    it('slug ya da id ile bağlantı, başlık kısaltma, limit', () => {
        const long = 'x'.repeat(120);
        const out = questionItems(
            [
                { id: 1, slug: 'ilk-soru', title: 'İlk soru' },
                { id: 2, title: long },
                { id: 3, content: 'Başlıksız içerik' },
                { id: 4, title: 'Dördüncü' },
            ],
            3
        );
        expect(out).toHaveLength(3);
        expect(out[0]).toEqual({ id: 1, to: '/question/ilk-soru', title: 'İlk soru' });
        expect(out[1].to).toBe('/question/2');
        expect(out[1].title.length).toBe(90);
        expect(out[1].title.endsWith('…')).toBe(true);
        expect(out[2].title).toBe('Başlıksız içerik');
    });

    it('bozuk girdi sessizce elenir', () => {
        expect(questionItems(null)).toEqual([]);
        expect(questionItems([null, 'x', {}, { title: 'kimliksiz' }])).toEqual([]);
        expect(questionItems([{ id: 9 }])[0].title).toBe('Başlıksız soru');
    });
});

describe('badgeItems', () => {
    it('ilk N rozet + kalan sayısı; adsız rozet atlanır', () => {
        const badges = Array.from({ length: 11 }, (_, i) => ({ id: i, name: `Rozet ${i}`, icon_url: i ? null : 'https://x/y.png' }));
        badges.push({ id: 99 });
        const { items, extra } = badgeItems(badges, 8);
        expect(items).toHaveLength(8);
        expect(extra).toBe(3);
        expect(items[0].icon).toBe('https://x/y.png');
        expect(badgeItems(undefined)).toEqual({ items: [], extra: 0 });
    });
});

describe('sceneProfile', () => {
    it('yalnız herkese açık sade özet', () => {
        expect(
            sceneProfile({ username: 'ayse', name: 'ayse', gender: 'female', level: { name: 'Usta' }, email: 'gizli@x.com' })
        ).toEqual({ username: 'ayse', name: 'ayse', gender: 'female', level: 'Usta' });
        expect(sceneProfile(undefined)).toEqual({ username: '', name: '', gender: null, level: null });
    });
});
