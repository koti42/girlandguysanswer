import { describe, expect, it } from 'vitest';
import {
    FRAMES, MINIS, TITLES, KESIF, KESIF_SLOTS, KESIF_WAVE_KEYS, COSMETIC_SLOTS, SHOP_CATEGORIES, TICKET_MESSAGE_KEY,
    categoryOfKey, designKeys, emptyKesifLoadout, getDesign, isKesifWaveKey, kesifSlotOfKey, listByCategory,
    normalizeCosmetics, normalizeKesifLoadout, rarityOf, slotOfCategory, staticCatalog,
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

    it('misafir statik kataloğu GET /game/shop kategorileriyle aynı biçimde (Keşif dalgası varsayılan kapalı)', () => {
        const cats = staticCatalog();
        expect(cats.map((c) => c.key)).toEqual(SHOP_CATEGORIES.map((c) => c.key).filter((k) => k !== 'avatar_part' && k !== 'kesif'));
        const item = cats[0].items[0];
        expect(item).toMatchObject({ key: FRAMES[0].id, category: 'frame', price: null, owned: false });
        // dalga öğeleri (yeni çerçeve/mini/unvan dahil) sızmaz
        const keys = cats.flatMap((c) => c.items.map((i) => i.key));
        expect(keys.some((k) => isKesifWaveKey(k))).toBe(false);
        expect(cats.find((c) => c.key === 'frame').items).toHaveLength(15);
        expect(cats.find((c) => c.key === 'mini_avatar').items).toHaveLength(18);
        expect(cats.find((c) => c.key === 'title').items).toHaveLength(8);
    });

    it('staticCatalog({ wave: true }): Keşif sekmesi ve 46 dalga öğesi eklenir', () => {
        const cats = staticCatalog({ wave: true });
        expect(cats.map((c) => c.key)).toEqual(['frame', 'mini_avatar', 'title', 'kesif', 'consumable']);
        expect(cats.find((c) => c.key === 'kesif').items).toHaveLength(29);
        expect(cats.find((c) => c.key === 'frame').items).toHaveLength(20);
        expect(cats.find((c) => c.key === 'mini_avatar').items).toHaveLength(24);
        expect(cats.find((c) => c.key === 'title').items).toHaveLength(14);
    });
});

describe('Keşif Koleksiyonu kaydı', () => {
    it('kategori sırası title\'dan sonra; 29 öğe kayıt defterinde, kuşanma yuvaları 6', () => {
        expect(SHOP_CATEGORIES.map((c) => c.key)).toEqual(['frame', 'mini_avatar', 'title', 'kesif', 'avatar_part', 'consumable']);
        expect(SHOP_CATEGORIES.find((c) => c.key === 'kesif')).toMatchObject({ name: 'Keşif Koleksiyonu', icon: 'compass' });
        expect(listByCategory('kesif')).toHaveLength(29);
        expect(KESIF_SLOTS).toEqual(['portal', 'alet', 'asa', 'jet', 'arac', 'gecis']);
        for (const d of KESIF) expect(getDesign(d.id)).toBe(d);
        expect(designKeys().length).toBe(new Set(designKeys()).size);
    });

    it('COSMETIC_SLOTS değişmez; Keşif yuvası kuşanma gövdesindeki üç ortak yuvaya karışmaz', () => {
        expect(COSMETIC_SLOTS).toEqual(['frame', 'mini_avatar', 'title']);
        expect(slotOfCategory('kesif')).toBeNull();
        // Keşif yükü herkese açık kozmetik sunumuna sızmaz
        expect(normalizeCosmetics({ frame: null, mini_avatar: null, title: null, kesif: { portal: 'portal:neon-sokak' }, portal: 'portal:neon-sokak' })).toEqual({
            frame: null, mini_avatar: null, title: null,
        });
        expect(normalizeCosmetics({ frame: 'portal:neon-sokak', mini_avatar: 'alet:buz-mavisi', title: 'asa:mercan' })).toEqual({ frame: null, mini_avatar: null, title: null });
    });

    it('46 dalga anahtarı: 5 çerçeve + 6 mini + 6 unvan + 29 Keşif; hepsi kayıt defterinde', () => {
        expect(KESIF_WAVE_KEYS.size).toBe(46);
        for (const key of KESIF_WAVE_KEYS) expect(getDesign(key), key).not.toBeNull();
        expect([...KESIF_WAVE_KEYS].filter((k) => k.startsWith('frame:'))).toHaveLength(5);
        expect([...KESIF_WAVE_KEYS].filter((k) => k.startsWith('mini:'))).toHaveLength(6);
        expect([...KESIF_WAVE_KEYS].filter((k) => k.startsWith('title:'))).toHaveLength(6);
        expect(isKesifWaveKey('frame:gumus-inci')).toBe(false);
        expect(isKesifWaveKey('ticket:message')).toBe(false);
    });

    it('categoryOfKey ve kesifSlotOfKey: kayıtlı ve yalnız önekli anahtarlar', () => {
        expect(categoryOfKey('portal:neon-sokak')).toBe('kesif');
        expect(categoryOfKey('gecis:aurora-gecidi')).toBe('kesif');
        expect(categoryOfKey('arac:gelecekte-eklenecek')).toBe('kesif');
        expect(kesifSlotOfKey('portal:neon-sokak')).toBe('portal');
        expect(kesifSlotOfKey('jet:yildiz-izi')).toBe('jet');
        // kodda tasarımı olmayan ama biçimi geçerli Keşif anahtarı: önekten
        expect(kesifSlotOfKey('arac:gelecekte-eklenecek')).toBe('arac');
        expect(kesifSlotOfKey('frame:neon-meridyen')).toBeNull();
        expect(kesifSlotOfKey('portal:<script>')).toBeNull();
        expect(kesifSlotOfKey('x:y')).toBeNull();
        expect(kesifSlotOfKey(undefined)).toBeNull();
        expect(categoryOfKey('frame:neon-meridyen')).toBe('frame');
    });

    it('normalizeKesifLoadout: yalnız altı yuva, doğru yuvadaki bilinen anahtar; zarf ve bozuk girdi güvenli', () => {
        expect(normalizeKesifLoadout(null)).toEqual(emptyKesifLoadout());
        expect(Object.keys(emptyKesifLoadout())).toEqual(KESIF_SLOTS);
        expect(
            normalizeKesifLoadout({
                portal: 'portal:neon-sokak',
                alet: 'portal:altin-kapi', // yanlış yuva
                asa: 'asa:yok', // bilinmeyen
                jet: 'jet:yildiz-izi',
                arac: '<img src=x>',
                gecis: 42,
                extra: 'arac:limonata',
            })
        ).toEqual({ portal: 'portal:neon-sokak', alet: null, asa: null, jet: 'jet:yildiz-izi', arac: null, gecis: null });
        // GET /game/kesif/loadout zarfı
        expect(normalizeKesifLoadout({ loadout: { arac: 'arac:limonata' } }).arac).toBe('arac:limonata');
        for (const bad of [undefined, 'x', 5, [], { loadout: 'x' }]) expect(normalizeKesifLoadout(bad)).toEqual(emptyKesifLoadout());
    });
});
