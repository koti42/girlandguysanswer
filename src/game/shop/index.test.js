import { describe, expect, it } from 'vitest';
import {
    FRAMES, MINIS, TITLES, SHOP_CATEGORIES, TICKET_MESSAGE_KEY,
    categoryOfKey, designKeys, getDesign, listByCategory, normalizeCosmetics, rarityOf, slotOfCategory, staticCatalog,
} from './index.js';

describe('mağaza tasarım kayıt defteri', () => {
    it('her tasarım anahtarıyla bulunur; bilinmeyen/garip girdi null', () => {
        for (const d of [...FRAMES, ...MINIS, ...TITLES]) expect(getDesign(d.id)).toBe(d);
        expect(getDesign('frame:yok')).toBeNull();
        expect(getDesign(undefined)).toBeNull();
        expect(getDesign({})).toBeNull();
        expect(getDesign('x'.repeat(100))).toBeNull();
        expect(getDesign(TICKET_MESSAGE_KEY)?.category).toBe('consumable');
    });

    it('anahtarlar benzersiz ve kategoriler doğru', () => {
        const keys = designKeys();
        expect(new Set(keys).size).toBe(keys.length);
        expect(listByCategory('frame')).toHaveLength(FRAMES.length);
        expect(listByCategory('mini_avatar').every((d) => d.id.startsWith('mini:'))).toBe(true);
        expect(listByCategory('avatar_part')).toEqual([]);
        expect(categoryOfKey('hair:mohawk')).toBe('avatar_part');
        expect(categoryOfKey(FRAMES[0].id)).toBe('frame');
        expect(categoryOfKey('ticket:message')).toBe('consumable');
        expect(categoryOfKey('zzz')).toBeNull();
        expect(slotOfCategory('title')).toBe('title');
        expect(slotOfCategory('consumable')).toBeNull();
        expect(rarityOf('nope').label).toBe('Sıradan');
    });

    it('normalizeCosmetics yalnız doğru kategorideki bilinen anahtarları tutar', () => {
        const c = normalizeCosmetics({ frame: MINIS[0].id, mini_avatar: MINIS[0].id, title: '<script>', extra: 'x' });
        expect(c).toEqual({ frame: null, mini_avatar: MINIS[0].id, title: null });
        expect(normalizeCosmetics(null)).toEqual({ frame: null, mini_avatar: null, title: null });
    });

    it('misafir statik kataloğu GET /game/shop kategorileriyle aynı biçimde', () => {
        const cats = staticCatalog();
        expect(cats.map((c) => c.key)).toEqual(SHOP_CATEGORIES.map((c) => c.key).filter((k) => k !== 'avatar_part'));
        const item = cats[0].items[0];
        expect(item).toMatchObject({ key: FRAMES[0].id, category: 'frame', price: null, owned: false });
    });
});
