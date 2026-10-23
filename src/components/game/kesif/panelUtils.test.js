import { describe, expect, it } from 'vitest';
import {
    CRAFT_TABS, RARITY_COLORS, filterRecipes, findRoom, fmtNum, fuelStatus, gridNavTarget, isHotbarAddr, makeAddr, matchesQuery,
    normalizePalette, paletteTabs, filterPalette, parseAddr, pushRecent, quickMovePlan, recipeView, rarityColor, rarityLabel,
    sameAddr, slotAriaLabel, slotAtAddr, tabOfCategory, toggleInList, tooltipModel, tooltipText, whereToFind, armorIndexOf, isUsable,
} from './panelUtils.js';

function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

const emptySlots = () => new Array(36).fill(null);

describe('adresler', () => {
    it('s/a/c adreslerini ayrıştırır, uzun biçimleri de okur', () => {
        expect(parseAddr('s12')).toEqual({ kind: 's', index: 12 });
        expect(parseAddr('a0')).toEqual({ kind: 'a', index: 0 });
        expect(parseAddr('c26')).toEqual({ kind: 'c', index: 26 });
        expect(parseAddr('slot5')).toEqual({ kind: 's', index: 5 });
        expect(parseAddr('armor3')).toEqual({ kind: 'a', index: 3 });
        expect(parseAddr('chest1')).toEqual({ kind: 'c', index: 1 });
    });
    it('geçersiz adresleri reddeder', () => {
        ['', 's', 'x3', 's-1', 's1234', 's1.5', null, undefined, 12, 'S3', 's 3'].forEach((v) => expect(parseAddr(v)).toBeNull());
    });
    it('makeAddr / isHotbarAddr / sameAddr', () => {
        expect(makeAddr('s', 7)).toBe('s7');
        expect(makeAddr('armor', 2)).toBe('a2');
        expect(isHotbarAddr('s8')).toBe(true);
        expect(isHotbarAddr('s9')).toBe(false);
        expect(isHotbarAddr('c3')).toBe(false);
        expect(sameAddr('s3', 'slot3')).toBe(true);
        expect(sameAddr('s3', 'a3')).toBe(false);
        expect(sameAddr('s3', 'bad')).toBe(false);
    });
    it('slotAtAddr üç kaynaktan okur, boşu null verir', () => {
        const inv = { slots: emptySlots(), armor: [null, { item: 'item:miğfer_demir', count: 1, dur: 5 }, null, null] };
        inv.slots[4] = { item: 'blok:taş', count: 3, dur: null };
        const chest = { slots: [{ item: 'blok:kum', count: 2 }] };
        expect(slotAtAddr('s4', inv, chest).count).toBe(3);
        expect(slotAtAddr('a1', inv, chest).item).toBe('item:miğfer_demir');
        expect(slotAtAddr('c0', inv, chest).item).toBe('blok:kum');
        expect(slotAtAddr('s5', inv, chest)).toBeNull();
        expect(slotAtAddr('c0', inv, null)).toBeNull();
        expect(slotAtAddr('zzz', inv, chest)).toBeNull();
    });
    it('slotAriaLabel konumu, adı ve adedi söyler', () => {
        expect(slotAriaLabel('s0', { item: 'blok:taş', count: 12 })).toBe('Hızlı çubuk 1: Taş ×12');
        expect(slotAriaLabel('s9', null)).toBe('Çanta yuvası 1: boş');
        expect(slotAriaLabel('a0', null)).toBe('Kafa zırhı: boş');
        expect(slotAriaLabel('c4', { item: 'blok:kum', count: 1 })).toBe('Sandık yuvası 5: Kum');
        expect(slotAriaLabel('s1', { item: 'item:kazma_demir', count: 1, dur: 100 })).toContain('dayanıklılık 100/250');
    });
});

describe('nadirlik ve ipucu', () => {
    it('nadirlik renkleri koyu zeminde okunur (>= 4.5:1)', () => {
        Object.keys(RARITY_COLORS).forEach((k) => {
            expect(contrast(RARITY_COLORS[k], '#151a36'), k).toBeGreaterThanOrEqual(4.5);
        });
    });
    it('bilinmeyen nadirlik yaygına düşer', () => {
        expect(rarityColor('???')).toBe(RARITY_COLORS.yaygın);
        expect(rarityLabel('efsanevi')).toBe('Efsanevi');
        expect(rarityLabel(undefined)).toBe('Yaygın');
    });
    it('fmtNum Türkçe ondalık yazar', () => {
        expect(fmtNum(5.5)).toBe('5,5');
        expect(fmtNum(6)).toBe('6');
        expect(fmtNum(NaN)).toBe('0');
        expect(fmtNum(4.04)).toBe('4');
    });
    it('alet: hasar, hız, hasat seviyesi ve dayanıklılık', () => {
        const m = tooltipModel({ item: 'item:kazma_demir', count: 1, dur: 200 });
        expect(m.name).toBe('Demir Kazma');
        const labels = m.lines.map((l) => l.label);
        expect(labels).toEqual(expect.arrayContaining(['Hasar', 'Menzil', 'Kazma hızı', 'Hasat seviyesi']));
        expect(m.durability).toMatchObject({ cur: 200, max: 250, pct: 80, level: 'ok' });
        expect(tooltipText({ item: 'item:kazma_demir', count: 1, dur: 200 })).toContain('dayanıklılık 200/250');
    });
    it('zırh: savunma ve hangi yuvaya takıldığı', () => {
        const m = tooltipModel({ item: 'item:göğüslük_demir', count: 1, dur: 10 });
        expect(m.lines.find((l) => l.label === 'Savunma').value).toBe('+6');
        expect(m.lines.find((l) => l.label === 'Takılır').value).toBe('Göğüs');
        expect(m.durability.level).toBe('crit');
        expect(armorIndexOf({ item: 'item:çizme_deri' })).toBe(3);
        expect(armorIndexOf({ item: 'blok:taş' })).toBe(-1);
    });
    it('yiyecek: açlık ve can; kullanılabilir mi', () => {
        const m = tooltipModel({ item: 'item:pişmiş_tavuk', count: 4 });
        expect(m.lines.find((l) => l.label === 'Açlık').value).toBe('+6');
        expect(m.lines.find((l) => l.label === 'Can').value).toBe('+1');
        expect(m.count).toBe(4);
        expect(isUsable({ item: 'item:elma' })).toBe(true);
        expect(isUsable({ item: 'blok:taş' })).toBe(false);
    });
    it('boş yuva ve bilinmeyen eşya güvenli', () => {
        expect(tooltipModel(null)).toBeNull();
        expect(tooltipText(null)).toBe('');
        const m = tooltipModel({ item: 'item:yok_boyle_sey', count: 2 });
        expect(m.name).toBe('item:yok_boyle_sey');
        expect(m.lines).toEqual([]);
    });
    it('efsanevi eşya rengini taşır', () => {
        expect(tooltipModel({ item: 'item:kanca', count: 1 }).color).toBe(RARITY_COLORS.efsanevi);
    });
});

describe('hızlı taşıma planı', () => {
    const inv = (map) => {
        const slots = emptySlots();
        Object.keys(map).forEach((i) => {
            slots[i] = map[i];
        });
        return { slots, armor: [null, null, null, null] };
    };
    it('hotbar → çanta: dolmamış aynı yığına, yoksa ilk boşa', () => {
        const i = inv({ 0: { item: 'blok:taş', count: 5 }, 12: { item: 'blok:taş', count: 10 } });
        expect(quickMovePlan('s0', i, null)).toEqual({ action: 'move', to: 's12' });
        const j = inv({ 0: { item: 'blok:taş', count: 5 }, 9: { item: 'blok:kum', count: 1 } });
        expect(quickMovePlan('s0', j, null)).toEqual({ action: 'move', to: 's10' });
    });
    it('çanta → hotbar', () => {
        const i = inv({ 20: { item: 'blok:taş', count: 5 }, 0: { item: 'blok:kum', count: 1 } });
        expect(quickMovePlan('s20', i, null)).toEqual({ action: 'move', to: 's1' });
    });
    it('dolu yığına birleştirmez (stack sınırı)', () => {
        const i = inv({ 20: { item: 'blok:taş', count: 5 }, 0: { item: 'blok:taş', count: 64 } });
        expect(quickMovePlan('s20', i, null)).toEqual({ action: 'move', to: 's1' });
    });
    it('dayanıklılıklı eşya birleşmez', () => {
        expect(findRoom([{ item: 'item:kazma_demir', count: 1, dur: 5 }, null], 'item:kazma_demir', 0, 2)).toBe(1);
    });
    it('zırh parçası sandık yokken kuşanılır', () => {
        const i = inv({ 12: { item: 'item:miğfer_demir', count: 1, dur: 100 } });
        expect(quickMovePlan('s12', i, null)).toEqual({ action: 'equip' });
    });
    it('sandık açıkken çanta → sandık, sandık → çanta', () => {
        const i = inv({ 12: { item: 'blok:taş', count: 3 } });
        const chest = { slots: new Array(27).fill(null) };
        chest.slots[0] = { item: 'blok:taş', count: 60 };
        expect(quickMovePlan('s12', i, chest)).toEqual({ action: 'move', to: 'c0' });
        chest.slots[3] = { item: 'blok:kum', count: 4 };
        expect(quickMovePlan('c3', i, chest)).toEqual({ action: 'move', to: 's9' });
    });
    it('zırhtan çıkarma çantaya gider; yer yoksa null', () => {
        const i = { slots: emptySlots(), armor: [{ item: 'item:miğfer_demir', count: 1, dur: 3 }, null, null, null] };
        expect(quickMovePlan('a0', i, null)).toEqual({ action: 'move', to: 's9' });
        i.slots = i.slots.map(() => ({ item: 'blok:kum', count: 64 }));
        expect(quickMovePlan('a0', i, null)).toBeNull();
    });
    it('boş yuva ve geçersiz adres null', () => {
        expect(quickMovePlan('s3', inv({}), null)).toBeNull();
        expect(quickMovePlan('zz', inv({}), null)).toBeNull();
    });
});

describe('üretim yardımcıları', () => {
    const recipes = [
        { id: 'sopa', out: { item: 'item:sopa', count: 4 }, in: [{ item: 'blok:meşe_tahta', count: 2, have: 6 }], station: 'el', category: 'malzeme', craftable: true },
        { id: 'tezgah', out: { item: 'blok:tezgah', count: 1 }, in: [{ item: 'blok:meşe_tahta', count: 4, have: 6 }], station: 'el', category: 'dekor', craftable: true },
        { id: 'kazma_taş', out: { item: 'item:kazma_taş', count: 1 }, in: [{ item: 'blok:kırıktaş', count: 3, have: 0 }, { item: 'item:sopa', count: 2, have: 0 }], station: 'tezgah', category: 'alet', craftable: false },
        { id: 'kılıç_ahşap', out: { item: 'item:kılıç_ahşap', count: 1 }, in: [{ item: 'blok:meşe_tahta', count: 2, have: 6 }, { item: 'item:sopa', count: 1, have: 4 }], station: 'tezgah', category: 'silah', craftable: false },
        { id: 'ocak:demir', out: { item: 'item:demir_külçe', count: 1 }, in: [{ item: 'item:ham_demir', count: 1, have: 3 }], station: 'ocak', category: 'ocak', heat: 10, craftable: true },
    ];
    it('kategori → sekme', () => {
        expect(tabOfCategory('alet')).toBe('alet');
        expect(tabOfCategory('dekor')).toBe('özel');
        expect(tabOfCategory('ışık')).toBe('özel');
        expect(tabOfCategory('bilinmeyen')).toBe('özel');
        expect(CRAFT_TABS.map((t) => t.name)).toEqual(expect.arrayContaining(['Araçlar', 'Silahlar', 'Zırh', 'Yapı', 'Yiyecek', 'Malzeme', 'Özel']));
    });
    it('recipeView: istasyon, eksik malzeme, azami adet', () => {
        const fuel = { total: 0, carried: 0, fuels: [], smelts: 0 };
        const sopa = recipeView(recipes[0], ['el'], fuel);
        expect(sopa).toMatchObject({ craftable: true, maxTimes: 3, reason: '' });
        const kazma = recipeView(recipes[2], ['el'], fuel);
        expect(kazma).toMatchObject({ craftable: false, stationOk: false, maxTimes: 0, reason: 'Tezgah gerekli' });
        const kazma2 = recipeView(recipes[2], ['el', 'tezgah'], fuel);
        expect(kazma2.reason).toBe('Malzeme eksik');
        expect(kazma2.in.every((p) => !p.ok)).toBe(true);
    });
    it('ocak tarifi yakıt ister; azami adet ısıyla sınırlı', () => {
        const noFuel = recipeView(recipes[4], ['ocak'], { total: 0, fuels: [], carried: 0, smelts: 0 });
        expect(noFuel.craftable).toBe(false);
        expect(noFuel.reason).toBe('Yakıt yetersiz');
        const fuel = recipeView(recipes[4], ['ocak'], { total: 20, fuels: [], carried: 20, smelts: 2 });
        expect(fuel.craftable).toBe(true);
        expect(fuel.maxTimes).toBe(2);
    });
    it('filterRecipes SIRALAMAZ: girdi sırası korunur (envanter/istasyon değişse de aynı sıra)', () => {
        const noHeat = { total: 0, fuels: [], carried: 0, smelts: 0 };
        const a = filterRecipes(recipes.map((r) => recipeView(r, ['el', 'tezgah', 'ocak'], { total: 50, fuels: [], carried: 50, smelts: 5 })), {});
        const b = filterRecipes(recipes.map((r) => recipeView(r, ['el'], noHeat)), {});
        expect(a.map((v) => v.id)).toEqual(recipes.map((r) => r.id));
        expect(b.map((v) => v.id)).toEqual(recipes.map((r) => r.id));
        expect(a.some((v, i) => i > 0 && !a[i - 1].craftable && v.craftable)).toBe(true); // yapılabilir, yapılamayanın ardından da durabilir
    });
    it('onlyIds anlık görüntüsü craftableOnly\'yi ezer', () => {
        const views = recipes.map((r) => recipeView(r, ['el', 'tezgah'], { total: 50, fuels: [], carried: 50, smelts: 5 }));
        expect(filterRecipes(views, { onlyIds: new Set(['sopa', 'kazma_taş']), craftableOnly: true }).map((v) => v.id)).toEqual(['sopa', 'kazma_taş']);
        expect(filterRecipes(views, { onlyIds: new Set() }).length).toBe(0);
        expect(filterRecipes(views, { onlyIds: new Set(['sopa', 'tezgah']), tab: 'malzeme' }).map((v) => v.id)).toEqual(['sopa']);
    });
    it('sekme, arama (Türkçe harf duyarsız) ve yapılabilir süzgeci', () => {
        const views = recipes.map((r) => recipeView(r, ['el', 'tezgah'], { total: 50, fuels: [], carried: 50, smelts: 5 }));
        expect(filterRecipes(views, { tab: 'silah' }).map((v) => v.id)).toEqual(['kılıç_ahşap']);
        expect(filterRecipes(views, { query: 'kilic' }).map((v) => v.id)).toEqual(['kılıç_ahşap']);
        expect(filterRecipes(views, { query: 'ham demir' }).map((v) => v.id)).toEqual(['ocak:demir']);
        expect(filterRecipes(views, { query: 'yok boyle' })).toEqual([]);
        expect(filterRecipes(views, { craftableOnly: true }).every((v) => v.craftable)).toBe(true);
        expect(filterRecipes(views, { tab: 'özel' }).map((v) => v.id)).toEqual(['tezgah']);
    });
    it('matchesQuery', () => {
        expect(matchesQuery('Kılıç', 'KILIÇ')).toBe(true);
        expect(matchesQuery('Demir Kazma', 'demir kaz')).toBe(true);
        expect(matchesQuery('Demir Kazma', 'taş')).toBe(false);
        expect(matchesQuery('x', '')).toBe(true);
    });
    it('fuelStatus: taşınan ısı + yakıt eşyaları', () => {
        const slots = emptySlots();
        slots[0] = { item: 'item:kömür', count: 3 };
        slots[1] = { item: 'blok:meşe_kütük', count: 2 };
        slots[2] = { item: 'blok:taş', count: 9 };
        const f = fuelStatus({ slots, heat: 20 });
        expect(f.total).toBe(20 + 3 * 80 + 2 * 15);
        expect(f.fuels[0].item).toBe('item:kömür');
        expect(f.smelts).toBe(Math.floor(f.total / 10));
        expect(fuelStatus(null).total).toBe(0);
    });
    it('whereToFind: ocak, kazma ve üretim ipuçları', () => {
        expect(whereToFind('item:demir_külçe').join(' ')).toMatch(/Ocakta/);
        expect(whereToFind('item:ham_demir').join(' ')).toMatch(/Kazarak/);
        expect(whereToFind('item:sopa').join(' ')).toMatch(/Elle/);
        expect(whereToFind('item:kuantum_külçe').length).toBeGreaterThan(0);
        expect(whereToFind('item:yok').length).toBe(0);
        expect(whereToFind('item:anahtar_kristali_z0')[0]).toMatch(/Tapınak/);
    });
});

describe('inşa paleti', () => {
    const raw = [
        { id: 1, key: 'taş', name: 'Taş', category: 'arazi', group: 'taş', item: 'blok:taş' },
        { id: 4, key: 'çimen', name: 'Çimen', category: 'arazi', group: 'doğa', item: 'blok:çimen' },
        { id: 62, key: 'cam', name: 'Cam', category: 'yapı', group: 'cam', item: 'blok:cam' },
        { id: 100, key: 'ana_kaya', name: 'Ana Kaya', category: 'sistem', group: 'mekanizma', item: 'blok:ana_kaya' },
        { id: 120, key: 'portal', name: 'Portal', category: 'sistem', group: 'mekanizma' },
        { id: 1, key: 'taş', name: 'Taş', group: 'taş', item: 'blok:taş' },
        null,
        { id: 'x' },
    ];
    it('sistem blokları ve kopyalar atılır', () => {
        const p = normalizePalette(raw);
        expect(p.map((e) => e.item)).toEqual(['blok:taş', 'blok:çimen', 'blok:cam']);
        expect(normalizePalette(null)).toEqual([]);
    });
    it('item yoksa key\'den türetilir', () => {
        expect(normalizePalette([{ id: 5, key: 'kum', name: 'Kum', group: 'doğa' }])[0].item).toBe('blok:kum');
    });
    it('sekmeler BUILD_GROUPS sırasında, özel sekmeler başta', () => {
        const tabs = paletteTabs(normalizePalette(raw));
        expect(tabs.map((t) => t.key)).toEqual(['tumu', 'fav', 'son', 'doğa', 'taş', 'cam']);
        expect(tabs[3].name).toBe('Doğa');
    });
    it('süzme: grup, favori, son kullanılan, arama', () => {
        const p = normalizePalette(raw);
        expect(filterPalette(p, { tab: 'taş' }).map((e) => e.item)).toEqual(['blok:taş']);
        expect(filterPalette(p, { tab: 'fav', favs: ['blok:cam'] }).map((e) => e.item)).toEqual(['blok:cam']);
        expect(filterPalette(p, { tab: 'son', recents: ['blok:cam', 'blok:taş', 'blok:yok'] }).map((e) => e.item)).toEqual(['blok:cam', 'blok:taş']);
        expect(filterPalette(p, { query: 'cimen' }).map((e) => e.item)).toEqual(['blok:çimen']);
    });
    it('pushRecent / toggleInList', () => {
        expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
        expect(pushRecent(['a'], 'z', 2)).toEqual(['z', 'a']);
        expect(pushRecent(['a', 'b'], 'c', 2)).toEqual(['c', 'a']);
        expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
        expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
    });
});

describe('gridNavTarget', () => {
    it('ok tuşları ızgarada gezinir, kenarda durur', () => {
        expect(gridNavTarget('ArrowRight', 0, 9, 36)).toBe(1);
        expect(gridNavTarget('ArrowLeft', 0, 9, 36)).toBe(0);
        expect(gridNavTarget('ArrowDown', 3, 9, 36)).toBe(12);
        expect(gridNavTarget('ArrowDown', 30, 9, 36)).toBe(30);
        expect(gridNavTarget('ArrowUp', 12, 9, 36)).toBe(3);
        expect(gridNavTarget('Home', 20, 9, 36)).toBe(0);
        expect(gridNavTarget('End', 3, 9, 36)).toBe(35);
        expect(gridNavTarget('a', 3, 9, 36)).toBe(-1);
        expect(gridNavTarget('ArrowRight', 0, 9, 0)).toBe(-1);
    });
});
