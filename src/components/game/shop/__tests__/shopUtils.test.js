import { describe, expect, it } from 'vitest';
import { featuredDeadline, findItem, itemState, normalizeShop, replaceItem, shortLeft } from '../shopUtils';
import { ticketReasonText, normalizeTicketCheck } from '../ticketUtils';

const NOW = Date.parse('2026-10-03T12:00:00Z');
// Gerçek sunucu biçimi: jetonlu öğe sahip değilken unlocked: false gelir.
const base = { key: 'frame:x', category: 'frame', price: 500, unlock: { type: 'price', jeton: 500 }, owned: false, unlocked: false, quantity: 0, is_active: true, available_until: null };

describe('itemState', () => {
    it('satın alınabilir / bakiye yetmiyor', () => {
        expect(itemState(base, {}, 600, NOW)).toMatchObject({ purchasable: true, affordable: true, owned: false });
        expect(itemState(base, {}, 100, NOW)).toMatchObject({ purchasable: true, affordable: false });
    });
    it('sahip + kuşanılmış kozmetik bir daha alınamaz', () => {
        const s = itemState({ ...base, owned: true }, { frame: 'frame:x' }, 9999, NOW);
        expect(s).toMatchObject({ owned: true, equipped: true, purchasable: false });
    });
    it('tüketilebilir adetle sahip sayılır ve tekrar alınabilir', () => {
        const s = itemState({ ...base, key: 'ticket:message', category: 'consumable', quantity: 2 }, {}, 9999, NOW);
        expect(s).toMatchObject({ owned: true, quantity: 2, purchasable: true, consumable: true });
    });
    it('kilitli, süresi geçmiş, aktif olmayan', () => {
        expect(itemState({ ...base, price: 0, unlocked: false, unlock: { type: 'level', level: 10 } }, {}, 9999, NOW)).toMatchObject({ locked: true, purchasable: false });
        expect(itemState({ ...base, available_until: '2026-10-01T00:00:00Z' }, {}, 9999, NOW)).toMatchObject({ expired: true, purchasable: false });
        expect(itemState({ ...base, is_active: false }, {}, 9999, NOW)).toMatchObject({ inactive: true, purchasable: false });
        expect(itemState({ ...base, price: null }, {}, 9999, NOW).purchasable).toBe(false);
    });
});

describe('itemState gerçek sunucu kilitleri', () => {
    it('jetonlu öğe sahip değilken unlocked:false gelse de kilitli DEĞİL, alınabilir', () => {
        expect(itemState(base, {}, 600, NOW)).toMatchObject({ locked: false, purchasable: true, owned: false });
        expect(itemState({ ...base, key: 'ticket:message', category: 'consumable', price: 7500, unlock: { type: 'price', jeton: 7500 } }, {}, 9000, NOW)).toMatchObject({ locked: false, purchasable: true });
    });
    it('seviyesi tutan öğe sahip sayılır, satın alınmaz', () => {
        const s = itemState({ ...base, key: 'acc:tac', category: 'avatar_part', price: 0, unlock: { type: 'level', level: 10 }, unlocked: true }, {}, 0, NOW);
        expect(s).toMatchObject({ locked: false, owned: true, purchasable: false });
    });
    it('rozet kilidi', () => {
        expect(itemState({ ...base, unlock: { type: 'badge', badge: 'runner_5k' }, unlocked: false }, {}, 9999, NOW)).toMatchObject({ locked: true, purchasable: false });
    });
});

describe('mağaza durumu', () => {
    const shop = normalizeShop({
        wallet: { balance: '1200', earned_total: 3000, spent_total: -5 },
        featured: [base, null],
        categories: [{ key: 'frame', items: [base, { nope: 1 }] }, { bad: true }],
        equipped: { frame: 'frame:yok' },
        tickets: 2,
    });
    it('normalizeShop bozuk girdileri ayıklar', () => {
        expect(shop.wallet).toEqual({ balance: 1200, earned_total: 3000, spent_total: 0 });
        expect(shop.featured).toHaveLength(1);
        expect(shop.categories).toHaveLength(1);
        expect(shop.categories[0].name).toBe('Profil Çerçeveleri');
        expect(shop.categories[0].items).toHaveLength(1);
        expect(shop.equipped.frame).toBeNull();
        expect(shop.player.level).toBe(1);
    });
    it('replaceItem vitrin ve kategoride yerinde günceller', () => {
        const next = replaceItem(shop, { key: 'frame:x', owned: true });
        expect(next.featured[0].owned).toBe(true);
        expect(findItem(next, 'frame:x').owned).toBe(true);
        expect(findItem(next, 'yok')).toBeNull();
    });
    it('vitrin geri sayımı ve kısa süre', () => {
        expect(featuredDeadline([{ available_until: '2026-10-05T00:00:00Z' }, { available_until: '2026-10-04T00:00:00Z' }, {}], NOW)).toBe(Date.parse('2026-10-04T00:00:00Z'));
        expect(featuredDeadline([], NOW)).toBeNull();
        expect(shortLeft(3 * 86400000)).toBe('3 gün');
        expect(shortLeft(5 * 3600000)).toBe('5 sa');
        expect(shortLeft(1000)).toBe('1 dk');
    });
});

describe('Mesaj Bileti metinleri', () => {
    it('her neden için Türkçe açıklama ve güvenli normalizasyon', () => {
        for (const r of ['blocked', 'not_needed', 'recipient_opted_out', 'already_used', 'daily_limit', 'account_too_new', 'recipient_unavailable', 'no_ticket', 'zzz']) {
            expect(ticketReasonText(r, 'ayse').length).toBeGreaterThan(10);
        }
        expect(normalizeTicketCheck({ needs_ticket: 1, can_use: 0, tickets: '3', price: -1, recipient: { username: 'a' } }))
            .toEqual({ needs_ticket: true, can_use: false, reason: null, tickets: 3, price: 0, recipient: { username: 'a', avatar: null } });
    });
});

describe('pickShowcase (hub Mağaza kartı)', () => {
    it('vitrinin ilk çizilebilir ürünü; karakter parçası ve bilinmeyen anahtar atlanır', async () => {
        const { pickShowcase } = await import('../shopUtils');
        const pick = pickShowcase([{ key: 'hair:topuz' }, { key: 'frame:yok-boyle' }, { key: 'title:efsane' }, { key: 'mini:tac' }]);
        expect(pick).toMatchObject({ key: 'title:efsane', live: true });
        expect(pick.design.category).toBe('title');
    });

    it('vitrin boş / bozuksa sabit tasarım (çizilebilir)', async () => {
        const { pickShowcase } = await import('../shopUtils');
        for (const input of [undefined, null, [], [{ key: '<svg>' }], 'x']) {
            const pick = pickShowcase(input);
            expect(pick.live).toBe(false);
            expect(pick.design?.art).toBeTruthy();
        }
    });
});

describe('ticketUtils sohbet yolu', () => {
    it('TICKET_MESSAGE_KEY kayıt defterindekiyle aynı; mağaza bağlantısı bu anahtarı taşır', async () => {
        const { TICKET_MESSAGE_KEY, TICKET_SHOP_URL } = await import('../ticketUtils');
        const shop = await import('../../../../game/shop');
        expect(TICKET_MESSAGE_KEY).toBe(shop.TICKET_MESSAGE_KEY);
        expect(shop.getDesign(TICKET_MESSAGE_KEY)).not.toBeNull();
        expect(TICKET_SHOP_URL).toContain(encodeURIComponent(shop.TICKET_MESSAGE_KEY));
    });

    it('shopError ayrı modülde; shopUtils aynı fonksiyonu yeniden dışa aktarır', async () => {
        const a = await import('../shopError');
        const b = await import('../shopUtils');
        expect(b.shopError).toBe(a.shopError);
        const err = { response: { status: 403, data: { message: 'Kapalı', data: { reason: 'blocked' } } } };
        expect(a.shopError(err, 'x')).toEqual({ status: 403, reason: 'blocked', message: 'Kapalı' });
        expect(a.shopError(new Error('ağ'), 'x').message).toMatch(/Sunucuya ulaşılamadı/);
    });
});
