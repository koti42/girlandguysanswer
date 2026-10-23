import { describe, expect, it } from 'vitest';
import {
    KESIF_CHIPS, SORTS, featuredDeadline, filterByKesifKind, findItem, guestKesifEnabled, itemState, lockHint, lockText, normalizeShop, replaceItem, shortLeft, sortItems, txLabel,
} from '../shopUtils';
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

describe('Keşif Koleksiyonu — itemState, kilit metinleri, sıralama', () => {
    const kbase = { key: 'portal:neon-sokak', category: 'kesif', price: 1600, rarity: 'rare', unlock: { type: 'price', jeton: 1600 }, owned: false, unlocked: false, quantity: 0, is_active: true, available_until: null };

    it('kuşanma durumu Keşif yükünden gelir; kategori eşitliğine bakılmaz', () => {
        const owned = { ...kbase, owned: true };
        expect(itemState(owned, {}, 0, NOW, { portal: 'portal:neon-sokak' })).toMatchObject({ kesif: true, kind: 'portal', owned: true, equipped: true, purchasable: false });
        expect(itemState(owned, {}, 0, NOW, { portal: 'portal:altin-kapi' }).equipped).toBe(false);
        expect(itemState(owned, {}, 0, NOW, null).equipped).toBe(false);
        // kesif yükü olmadan (eski çağrı biçimi) çökmez
        expect(itemState(owned, { frame: 'portal:neon-sokak' }, 0, NOW).equipped).toBe(false);
        // sahip olunmayan öğe kuşanılmış sayılmaz (bayat yük)
        expect(itemState(kbase, {}, 9999, NOW, { portal: 'portal:neon-sokak' })).toMatchObject({ owned: false, equipped: false, purchasable: true });
    });

    it('yeni çerçeve/mini/unvan öğeleri eski yuva kurallarıyla kuşanılır', () => {
        const f = { ...base, key: 'frame:neon-meridyen', owned: true };
        expect(itemState(f, { frame: 'frame:neon-meridyen' }, 0, NOW)).toMatchObject({ equipped: true, kesif: false, kind: null });
    });

    it('seviye/rozet kilidi: koşul sağlanınca sahip gibi kuşanılabilir, sağlanmayınca kilitli', () => {
        const lvl = { ...kbase, key: 'alet:neon-serit', price: null, unlock: { type: 'level', level: 8 } };
        expect(itemState({ ...lvl, unlocked: false }, {}, 9999, NOW)).toMatchObject({ locked: true, owned: false, purchasable: false });
        expect(itemState({ ...lvl, unlocked: true }, {}, 0, NOW, { alet: 'alet:neon-serit' })).toMatchObject({ locked: false, owned: true, equipped: true, purchasable: false });
        const badge = { ...base, key: 'title:cip-avcisi', category: 'title', price: null, unlock: { type: 'badge', badge: 'kesif_neon_cip_60' } };
        expect(itemState({ ...badge, unlocked: false }, {}, 9999, NOW)).toMatchObject({ locked: true, purchasable: false });
        expect(itemState({ ...badge, unlocked: true }, { title: 'title:cip-avcisi' }, 0, NOW)).toMatchObject({ owned: true, equipped: true });
    });

    it('kilit metinleri: seviye, rozet adı (bilinen/bilinmeyen)', () => {
        expect(lockText({ type: 'level', level: 8 })).toBe('Seviye 8');
        expect(lockText({ type: 'badge', badge: 'kesif_neon_cip_60' })).toBe('Rozetle açılır');
        expect(lockHint({ type: 'level', level: 12 })).toContain('12');
        expect(lockHint({ type: 'badge', badge: 'kesif_neon_cip_60' })).toBe('“Çip Koleksiyoncusu” rozetini kazanınca açılır.');
        expect(lockHint({ type: 'badge', badge: 'runner_5k' })).toBe('İlgili rozeti kazanınca açılır.');
        expect(lockHint({ type: 'badge', badge: 'constructor' })).toBe('İlgili rozeti kazanınca açılır.');
        expect(lockHint({ type: 'badge' })).toBe('İlgili rozeti kazanınca açılır.');
    });

    it('misafir Keşif vitrini yalnız VITE_SHOP_KESIF_GUEST=1 ile açılır (varsayılan kapalı)', () => {
        expect(guestKesifEnabled(undefined)).toBe(false);
        expect(guestKesifEnabled({})).toBe(false);
        expect(guestKesifEnabled({ VITE_SHOP_KESIF_GUEST: '' })).toBe(false);
        expect(guestKesifEnabled({ VITE_SHOP_KESIF_GUEST: 'true' })).toBe(false);
        expect(guestKesifEnabled({ VITE_SHOP_KESIF_GUEST: '1' })).toBe(true);
    });

    it('cüzdan işlem etiketleri: Keşif ödülü, harita hakkı, profil teması', () => {
        expect(txLabel('kesif_reward')).toBe('Keşif ödülü');
        expect(txLabel('kesif_slots')).toBe('Keşif harita hakkı');
        expect(txLabel('profile_theme')).toBe('Profil teması');
        expect(txLabel('bilinmeyen')).toBe('Cüzdan hareketi');
    });

    it('tür çipleri: Tümü + altı yuva; filterByKesifKind yerel ve girdiyi değiştirmez', () => {
        expect(KESIF_CHIPS.map((c) => c.key)).toEqual(['all', 'portal', 'alet', 'asa', 'jet', 'arac', 'gecis']);
        expect(KESIF_CHIPS.map((c) => c.label)).toEqual(['Tümü', 'Portal', 'Alet', 'Asa', 'Jetpack', 'Araç', 'Geçiş']);
        const items = [{ key: 'portal:a-b' }, { key: 'arac:limonata' }, { key: 'portal:neon-sokak' }, { key: 'bozuk' }];
        expect(filterByKesifKind(items, 'portal').map((i) => i.key)).toEqual(['portal:a-b', 'portal:neon-sokak']);
        expect(filterByKesifKind(items, 'all')).toBe(items);
        expect(filterByKesifKind(items, undefined)).toBe(items);
        expect(filterByKesifKind(items, 'jet')).toEqual([]);
        expect(filterByKesifKind(null, 'jet')).toEqual([]);
    });

    it('sıralama: önerilen sunucu sırası; fiyat artan (fiyatsız sonda); nadirlik en nadir önce; kararlı, girdi değişmez', () => {
        expect(SORTS.map((s) => s.key)).toEqual(['recommended', 'price', 'rarity']);
        const items = [
            { key: 'a', price: 900, rarity: 'rare' },
            { key: 'b', price: null, rarity: 'epic' },
            { key: 'c', price: 300, rarity: 'common' },
            { key: 'd', price: 900, rarity: 'legendary' },
            { key: 'e', price: 5000, rarity: 'rare' },
        ];
        const copy = JSON.stringify(items);
        expect(sortItems(items, 'recommended').map((i) => i.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(sortItems(items, 'bilinmeyen').map((i) => i.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(sortItems(items, 'price').map((i) => i.key)).toEqual(['c', 'a', 'd', 'e', 'b']);
        expect(sortItems(items, 'rarity').map((i) => i.key)).toEqual(['d', 'b', 'a', 'e', 'c']);
        expect(JSON.stringify(items)).toBe(copy);
        expect(sortItems(undefined, 'price')).toEqual([]);
    });

    it('normalizeShop: Keşif yükü yoksa boş ve bilinmiyor; varsa süzülür; kozmetik `equipped` Keşif içermez', () => {
        const none = normalizeShop({ wallet: {}, categories: [] });
        expect(none.kesifLoadout).toEqual({ portal: null, alet: null, asa: null, jet: null, arac: null, gecis: null });
        expect(none.kesifKnown).toBe(false);
        const some = normalizeShop({ categories: [], equipped: { frame: null, kesif: { portal: 'portal:neon-sokak' } }, kesif_loadout: { portal: 'portal:neon-sokak', alet: 'x:y' } });
        expect(some.kesifKnown).toBe(true);
        expect(some.kesifLoadout.portal).toBe('portal:neon-sokak');
        expect(some.kesifLoadout.alet).toBeNull();
        expect(Object.keys(some.equipped)).toEqual(['frame', 'mini_avatar', 'title']);
        const nested = normalizeShop({ categories: [], kesif: { loadout: { arac: 'arac:limonata' } } });
        expect(nested.kesifLoadout.arac).toBe('arac:limonata');
    });
});
