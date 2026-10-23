import { describe, expect, it } from 'vitest';
import {
    DESIGN_CATALOG, SHOP_CATEGORIES, availableDesigns, categoryLabel, designOf, formToBody, fromLocalInput, itemPatch, itemToForm, pagedList, saleWindowState,
    signedAmount, toInt, toLocalInput, txTypeOf, unlockLabel, unlockOf, validateAdjust, validateItemForm,
} from './shopUtils';

const item = {
    key: 'frame:neon-gece', category: 'frame', name: 'Neon Gece', description: 'Parlak.', price: 2500, rarity: 'epic',
    is_active: true, is_featured: false, sort_order: 3, available_from: null, available_until: '2026-10-10T18:00:00Z', max_per_user: null, sold_count: 7,
};

describe('tasarım kataloğu', () => {
    it('çerçeve, mini avatar, unvan, Mesaj Bileti ve karakter parçalarını içerir; anahtarlar benzersiz', () => {
        const keys = DESIGN_CATALOG.map((d) => d.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(designOf('frame:neon-gece')).toMatchObject({ category: 'frame', name: 'Neon Gece' });
        expect(designOf('ticket:message')).toMatchObject({ category: 'consumable' });
        expect(designOf('hair:mohawk')).toMatchObject({ category: 'avatar_part' });
        expect(designOf('acc:none')).toBeNull(); // "Yok" satılamaz
        expect(DESIGN_CATALOG.filter((d) => d.category === 'frame').length).toBeGreaterThanOrEqual(12);
        expect(DESIGN_CATALOG.filter((d) => d.category === 'mini_avatar').length).toBeGreaterThanOrEqual(16);
        expect(DESIGN_CATALOG.filter((d) => d.category === 'title').length).toBeGreaterThanOrEqual(8);
    });

    it('availableDesigns mağazadaki anahtarları dışarıda bırakır', () => {
        const groups = availableDesigns(['frame:neon-gece', 'ticket:message']);
        const keys = groups.flatMap((g) => g.items.map((d) => d.key));
        expect(keys).not.toContain('frame:neon-gece');
        expect(groups.find((g) => g.key === 'consumable')).toBeUndefined();
    });
});

describe('ürün formu', () => {
    it('toInt yalnızca tam sayıyı kabul eder', () => {
        expect(toInt('12')).toBe(12);
        expect(toInt(' -3 ')).toBe(-3);
        expect(toInt('1.5')).toBeNaN();
        expect(toInt('')).toBeNaN();
        expect(toInt('1e3')).toBeNaN();
    });

    it('datetime-local dönüşümü gidiş-dönüş aynı anı verir', () => {
        const local = toLocalInput('2026-10-10T18:00:00Z');
        expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
        expect(fromLocalInput(local)).toBe('2026-10-10T18:00:00.000Z');
        expect(fromLocalInput('')).toBeNull();
        expect(fromLocalInput('bozuk')).toBeUndefined();
        expect(toLocalInput(null)).toBe('');
    });

    it('doğrulama: negatif/ondalık fiyat, ters satış aralığı, tüketilebilirde max_per_user', () => {
        const f = itemToForm(item);
        expect(validateItemForm(f, { category: 'frame' })).toEqual({});
        expect(validateItemForm({ ...f, price: '-1' }).price).toBeTruthy();
        expect(validateItemForm({ ...f, price: '2.5' }).price).toBeTruthy();
        expect(validateItemForm({ ...f, price: '1000001' }).price).toBeTruthy();
        expect(validateItemForm({ ...f, name: '  ' }).name).toBe('Ad gerekli.');
        expect(validateItemForm({ ...f, available_from: '2026-10-12T10:00', available_until: '2026-10-11T10:00' }).available_until).toBeTruthy();
        expect(validateItemForm({ ...f, max_per_user: '0' }, { category: 'consumable' }).max_per_user).toBeTruthy();
        expect(validateItemForm({ ...f, max_per_user: '0' }, { category: 'frame' }).max_per_user).toBeUndefined();
        expect(validateItemForm({ ...f, max_per_user: '' }, { category: 'consumable' }).max_per_user).toBeUndefined();
        // Satır içi: yalnızca istenen alanlar.
        expect(validateItemForm({ price: 'x', sort_order: '1' }, { fields: ['price', 'sort_order'] })).toEqual({ price: expect.any(String) });
    });

    it('itemPatch yalnızca değişen alanları gönderir', () => {
        const f = itemToForm(item);
        expect(itemPatch(item, f)).toEqual({});
        expect(itemPatch(item, { ...f, price: '3000', is_featured: true })).toEqual({ price: 3000, is_featured: true });
        expect(itemPatch(item, { ...f, available_until: '' })).toEqual({ available_until: null });
        expect(itemPatch(item, { ...f, description: '' })).toEqual({ description: null });
    });

    it('formToBody max_per_user alanını yalnızca tüketilebilire ekler', () => {
        const f = { ...itemToForm(item), max_per_user: '5' };
        expect(formToBody(f, { category: 'frame' })).not.toHaveProperty('max_per_user');
        expect(formToBody(f, { category: 'consumable' }).max_per_user).toBe(5);
        expect(formToBody({ ...f, max_per_user: '' }, { category: 'consumable' }).max_per_user).toBeNull();
    });

    it('satış aralığı durumu ve kilit etiketi', () => {
        const now = Date.parse('2026-10-05T00:00:00Z');
        expect(saleWindowState(item, now)).toBe('live');
        expect(saleWindowState({ available_until: '2026-10-01T00:00:00Z' }, now)).toBe('expired');
        expect(saleWindowState({ available_from: '2026-10-06T00:00:00Z' }, now)).toBe('scheduled');
        expect(saleWindowState({}, now)).toBeNull();
        expect(unlockLabel(unlockOf({ unlock_type: 'level', unlock_value: '10' }))).toBe('Seviye 10');
        expect(unlockLabel(unlockOf({ unlock: { type: 'badge', badge: 'runner_5k' } }))).toBe('Rozet: runner_5k');
        expect(unlockLabel(unlockOf({ unlock: { type: 'price', jeton: 100 } }))).toBeNull();
    });
});

describe('cüzdan', () => {
    it('jeton ver/kes doğrulaması: pozitif tam sayı, üst sınır, bakiye, zorunlu gerekçe', () => {
        expect(validateAdjust({ mode: 'grant', amount: '500', reason: 'Etkinlik ödülü' }, 0)).toEqual({});
        expect(validateAdjust({ mode: 'grant', amount: '0', reason: 'x' }).amount).toBeTruthy();
        expect(validateAdjust({ mode: 'grant', amount: '-5', reason: 'x' }).amount).toBeTruthy();
        expect(validateAdjust({ mode: 'grant', amount: '50000001', reason: 'x' }).amount).toBeTruthy();
        expect(validateAdjust({ mode: 'grant', amount: '50000000', reason: 'x' }).amount).toBeFalsy();
        expect(validateAdjust({ mode: 'deduct', amount: '101', reason: 'x' }, 100).amount).toMatch(/Bakiye yetersiz/);
        expect(validateAdjust({ mode: 'deduct', amount: '100', reason: 'x' }, 100)).toEqual({});
        expect(validateAdjust({ mode: 'grant', amount: '1', reason: '   ' }).reason).toBe('Gerekçe zorunlu.');
        expect(validateAdjust({ mode: 'grant', amount: '1', reason: 'a'.repeat(256) }).reason).toBeTruthy();
    });

    it('işaretli miktar ve işlem türü etiketleri', () => {
        expect(signedAmount('grant', '50')).toBe(50);
        expect(signedAmount('deduct', '50')).toBe(-50);
        expect(txTypeOf('admin_grant').label).toBe('Yönetici verdi');
        expect(txTypeOf('profile_theme').label).toBe('Profil teması');
        expect(txTypeOf('kesif_slots').label).toBe('Keşif harita yuvası');
        expect(txTypeOf('kesif_reward').label).toBe('Keşif ödülü');
        expect(txTypeOf('bilinmeyen')).toEqual({ label: 'bilinmeyen', tone: 'neutral' });
        expect(txTypeOf('__proto__').label).toBe('__proto__');
    });

    it('pagedList düz ve iç içe sayfalı biçimleri okur', () => {
        expect(pagedList({ transactions: [{ id: 1 }], pagination: { current_page: 1, last_page: 2 } }, 'transactions'))
            .toEqual({ rows: [{ id: 1 }], pagination: { current_page: 1, last_page: 2 } });
        expect(pagedList({ transactions: { data: [{ id: 2 }], pagination: { current_page: 2, last_page: 3 } } }, 'transactions').rows).toEqual([{ id: 2 }]);
        expect(pagedList({ transactions: { data: [], current_page: 1, last_page: 1, total: 0 } }, 'transactions').pagination).toMatchObject({ last_page: 1 });
        expect(pagedList(null, 'transactions')).toEqual({ rows: [], pagination: null });
    });
});

describe('Keşif Koleksiyonu (yönetim)', () => {
    it('kategori ve 29 Keşif tasarımı ile 17 yeni çerçeve/mini/unvan yönetimde seçilebilir', () => {
        expect(SHOP_CATEGORIES.map((c) => c.key)).toEqual(['frame', 'mini_avatar', 'title', 'kesif', 'avatar_part', 'consumable']);
        expect(categoryLabel('kesif')).toBe('Keşif Koleksiyonu');
        expect(DESIGN_CATALOG.filter((d) => d.category === 'kesif')).toHaveLength(29);
        expect(designOf('portal:neon-sokak')).toMatchObject({ category: 'kesif', name: 'Neon Sokak', rarity: 'rare' });
        expect(designOf('frame:neon-meridyen')).toMatchObject({ category: 'frame', rarity: 'epic' });
        expect(designOf('mini:holo-balina')).toMatchObject({ category: 'mini_avatar', rarity: 'legendary' });
        expect(designOf('title:diyar-kasifi')).toMatchObject({ category: 'title', rarity: 'legendary' });
        const keys = DESIGN_CATALOG.map((d) => d.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('availableDesigns Keşif grubunu verir, mağazadakileri çıkarır', () => {
        const groups = availableDesigns(['portal:neon-sokak']);
        const kesif = groups.find((g) => g.key === 'kesif');
        expect(kesif.items).toHaveLength(28);
        expect(kesif.items.map((d) => d.key)).not.toContain('portal:neon-sokak');
    });
});
