// @vitest-environment jsdom
/*
 * YER SABİTLİĞİ regresyonu: oyuncu "Meşe Tahta"ya basarken satır kaymamalı (yanlışlıkla başka şey üretmesin).
 * Sahte motor: envanter / istasyon / tarif listesi render'lar arasında değişir; sıra, düğüm kimliği, seçili tarif, kaydırma korunur.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import CraftingPanel from '../CraftingPanel.jsx';
import InventoryPanel from '../InventoryPanel.jsx';
import BrewPanel from '../BrewPanel.jsx';
import EnchantPanel from '../EnchantPanel.jsx';
import { RECIPES } from '../../../../game/kesif/sim/items.js';
import { BREW_RECIPES } from '../../../../game/kesif/sim/magicRecipes.js';
import { makeFakeApi } from './panelsTestKit.js';
import { makeMagicApi } from './magicTestKit.js';

const OAK = 'tahta_meşe';
const row = (id) => screen.getByTestId(`recipe-${id}`);
const ids = () => Array.from(document.querySelectorAll('.kp-recipe-row')).map((r) => r.getAttribute('data-testid').slice('recipe-'.length));
const craftBtn = (id) => within(row(id)).getByRole('button', { name: /üret$/ });
const chip = (re) => screen.getAllByRole('button').find((b) => re.test(b.textContent));

/** Paneli çizer; refresh() sürüm sayacını artırıp (motorun inventoryChanged/yoklama etkisi) yeniden okutur. */
function mount(opts) {
    const api = makeFakeApi(opts);
    let v = 0;
    const view = render(<CraftingPanel api={api} version={v} onClose={() => {}} />);
    const refresh = () => {
        v += 1;
        view.rerender(<CraftingPanel api={api} version={v} onClose={() => {}} />);
    };
    return { api, refresh, view };
}

describe('Üret listesi: tarif yeri kaymaz', () => {
    beforeEach(() => {
        try {
            window.localStorage.clear();
        } catch (_e) {
            /* depolama yok */
        }
    });

    it('envanter değişimi (üretim, toplama), istasyon değişimi ve yeni tarifler sırayı ve düğümleri oynatmaz', () => {
        const { api, refresh } = mount({ items: { 0: ['blok:meşe_kütük', 12] }, stations: ['el'] });
        const baseline = ids();
        const oakNode = row(OAK);
        const oakIndex = baseline.indexOf(OAK);
        expect(oakIndex).toBe(0);
        const same = (why) => {
            expect(ids(), why).toEqual(baseline);
            expect(row(OAK), why).toBe(oakNode); // aynı DOM düğümü: yeniden oluşturulmadı
        };
        // 10 kez üret: tüketim + üretim
        for (let i = 0; i < 10; i++) {
            fireEvent.click(craftBtn(OAK));
            same('üretim #' + (i + 1));
        }
        // kütük topla
        api._inv.add('blok:meşe_kütük', 5);
        api._inv.add('blok:huş_kütük', 3);
        refresh();
        same('kütük toplandı');
        // çok sayıda tarif yapılabilir olur (yeni açılanlar)
        [['item:sopa', 20], ['blok:taş', 12], ['blok:kırıktaş', 12], ['item:bakır_külçe', 3], ['item:ip', 10], ['blok:huş_tahta', 12], ['blok:çam_tahta', 8]].forEach((p) => api._inv.add(p[0], p[1]));
        refresh();
        same('yeni tarifler açıldı');
        // tezgah yakınında / uzakta / ocak
        api.getStations.mockImplementation(() => ['el', 'tezgah']);
        refresh();
        same('tezgah yakınında');
        api.getStations.mockImplementation(() => ['el', 'tezgah', 'ocak', 'kesici', 'dokuma', 'örs']);
        refresh();
        same('tüm istasyonlar yakınında');
        api.getStations.mockImplementation(() => ['el']);
        refresh();
        same('istasyondan uzaklaşıldı');
        // her şey tükenir
        api._inv.slots.forEach((_s, i) => api._inv.setSlot(i, null));
        refresh();
        same('envanter boşaldı');
        expect(row(OAK).classList.contains('is-craftable')).toBe(false); // satır yerinde, yalnız soluk
        expect(within(row(OAK)).getByRole('button', { name: /üret$/ })).toBeDisabled();
        expect(row(OAK).querySelector('.kp-missing')).toHaveTextContent('Eksik: 1 Meşe Kütüğü');
    });

    it('motor tarifleri başka sırada ya da eksik/fazla döndürse de ilk görülen sıra korunur; yeni gelenler sona eklenir', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_kütük', 4] } });
        const full = api.getRecipes.getMockImplementation();
        const subset = (list) => list.filter((r) => RECIPES.findIndex((x) => x.id === r.id) < 60);
        let mode = 'subset';
        api.getRecipes.mockImplementation((...a) => {
            const list = full(...a);
            if (mode === 'subset') return subset(list); // başlangıçta yalnız ilk 60 tarif "açık"
            if (mode === 'craftable-first') return list.slice().sort((x, y) => Number(y.craftable) - Number(x.craftable)).reverse();
            return list;
        });
        let v = 0;
        const view = render(<CraftingPanel api={api} version={v} onClose={() => {}} />);
        const refresh = () => {
            v += 1;
            view.rerender(<CraftingPanel api={api} version={v} onClose={() => {}} />);
        };
        const before = ids();
        expect(before[0]).toBe(OAK);
        mode = 'craftable-first'; // motor listeyi ters/yapılabilir-önce döndürür
        refresh();
        expect(ids()).toEqual(before);
        mode = 'all'; // 140+ yeni tarif "açıldı"
        refresh();
        const after = ids();
        expect(after.slice(0, before.length)).toEqual(before); // eskiler birebir aynı yerde
        fireEvent.click(screen.getByRole('button', { name: /Daha fazla göster/ }));
        fireEvent.click(screen.getByRole('button', { name: /Daha fazla göster/ }));
        fireEvent.click(screen.getByRole('button', { name: /Daha fazla göster/ }));
        const all = ids();
        expect(all.slice(0, before.length)).toEqual(before);
        expect(all.length).toBeGreaterThan(before.length);
    });

    it('başka bir tarifi sabitlemek ana listeyi oynatmaz; sabitler ayrı şeritte', () => {
        const { api, refresh } = mount({ items: { 0: ['blok:meşe_kütük', 6] } });
        const baseline = ids();
        fireEvent.click(row('sopa').querySelector('.kp-recipe'));
        fireEvent.click(within(screen.getByTestId('recipe-detail')).getByRole('button', { name: /Tarifi sabitle/ }));
        expect(ids()).toEqual(baseline);
        expect(within(screen.getByTestId('pin-strip')).getByTestId('pin-sopa')).toBeInTheDocument();
        fireEvent.click(row('kazma_ahşap').querySelector('.kp-recipe'));
        fireEvent.click(within(screen.getByTestId('recipe-detail')).getByRole('button', { name: /Tarifi sabitle/ }));
        refresh();
        expect(ids()).toEqual(baseline);
        expect(within(screen.getByTestId('pin-strip')).getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual(['pin-sopa', 'pin-kazma_ahşap']);
        fireEvent.click(within(screen.getByTestId('recipe-detail')).getByRole('button', { name: /Sabitlemeyi kaldır/ }));
        expect(ids()).toEqual(baseline);
        expect(api.craft).not.toHaveBeenCalled();
    });

    it('"Yapılabilirler": basıldığı anın görüntüsü; sonra tüketim/yeni malzeme listeyi daraltmaz/genişletmez; yeniden basınca kalkar', () => {
        const { api, refresh } = mount({ items: { 0: ['blok:meşe_kütük', 1], 1: ['item:ham_demir', 1] }, stations: ['el'] });
        const all = ids();
        fireEvent.click(chip(/^Yapılabilirler$/));
        const snap = ids();
        expect(snap).toContain(OAK);
        expect(snap.length).toBeLessThan(all.length);
        // son kütük harcanır: Meşe Tahta artık yapılamaz AMA satırı kaybolmaz
        fireEvent.click(craftBtn(OAK));
        expect(ids()).toEqual(snap);
        expect(row(OAK).classList.contains('is-craftable')).toBe(false);
        // yeni malzeme: başka tarifler yapılabilir olur, listeye girmez
        api._inv.add('blok:huş_kütük', 4);
        api._inv.add('item:sopa', 10);
        refresh();
        expect(ids()).toEqual(snap);
        fireEvent.click(chip(/^Yapılabilirler$/));
        expect(ids()).toEqual(all);
    });

    it('"Yapılabilir önce": varsayılan KAPALI; açılınca yalnız o an yeniden dizer, sonra kıpırdamaz; kapanınca kanonik sıraya döner', () => {
        const { api, refresh } = mount({ items: { 0: ['item:sopa', 8], 1: ['blok:meşe_tahta', 6] }, stations: ['el'] });
        const canonical = ids();
        const toggle = chip(/Yapılabilir önce/);
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
        const first = ids();
        expect(first).not.toEqual(canonical);
        const craftableNow = Array.from(document.querySelectorAll('.kp-recipe-row.is-craftable')).map((r) => r.getAttribute('data-testid').slice(7));
        expect(first.slice(0, craftableNow.length).sort()).toEqual(craftableNow.slice().sort()); // yapılabilirler başta
        // sonrasında envanter ve istasyon değişir
        api._inv.slots.forEach((_s, i) => api._inv.setSlot(i, null));
        api._inv.add('blok:meşe_kütük', 9);
        api.getStations.mockImplementation(() => ['el', 'tezgah']);
        refresh();
        expect(ids()).toEqual(first);
        fireEvent.click(toggle);
        expect(ids()).toEqual(canonical);
    });

    it('arama/sekme yalnız kullanıcı değiştirince süzer; yenilemeler süzgeci ve satır yerini bozmaz', () => {
        const { api, refresh } = mount({ items: { 0: ['blok:meşe_kütük', 3] } });
        fireEvent.change(screen.getByRole('searchbox', { name: 'Tarif ara' }), { target: { value: 'tahta' } });
        const filtered = ids();
        expect(filtered.length).toBeGreaterThan(3);
        api._inv.add('blok:huş_kütük', 5);
        api._inv.add('item:sopa', 5);
        refresh();
        expect(ids()).toEqual(filtered);
        fireEvent.click(screen.getByRole('tab', { name: /Yapı/ }));
        const tabbed = ids();
        refresh();
        expect(ids()).toEqual(tabbed);
    });

    it('seçili tarif ve liste kaydırması yenilemelerde korunur', () => {
        const { api, refresh } = mount({ items: { 0: ['blok:meşe_kütük', 6], 1: ['blok:meşe_tahta', 6] } });
        fireEvent.click(row('sopa').querySelector('.kp-recipe'));
        expect(row('sopa').classList.contains('is-sel')).toBe(true);
        const wrap = document.querySelector('.kp-craft-listwrap');
        wrap.scrollTop = 137;
        const wrapRef = wrap;
        api._inv.add('item:ip', 4);
        api.getStations.mockImplementation(() => ['el', 'tezgah']);
        refresh();
        expect(row('sopa').classList.contains('is-sel')).toBe(true);
        expect(screen.getByTestId('recipe-detail').querySelector('.kp-detail-name')).toHaveTextContent(/^Sopa/);
        expect(document.querySelector('.kp-craft-listwrap')).toBe(wrapRef); // kaydırma kapsayıcısı yeniden kurulmadı
        expect(document.querySelector('.kp-craft-listwrap').scrollTop).toBe(137);
    });

    it('üret düğmeleri hep aynı tarif kimliğini hedefler (yenileme/sıra değişse de)', () => {
        const { api, refresh } = mount({ items: { 0: ['blok:meşe_kütük', 8] } });
        const btn = craftBtn(OAK);
        for (let i = 0; i < 4; i++) {
            fireEvent.click(btn);
            api._inv.add('item:sopa', 1);
            refresh();
        }
        expect(api.craft.mock.calls.every((c) => c[0] === OAK)).toBe(true);
        expect(api.craft).toHaveBeenCalledTimes(4);
        fireEvent.click(row(OAK).querySelector('.kp-recipe'));
        const detail = screen.getByTestId('recipe-detail');
        fireEvent.click(within(detail).getByRole('button', { name: '×1' }));
        refresh();
        fireEvent.click(within(detail).getByRole('button', { name: '×1' }));
        expect(api.craft.mock.calls.map((c) => c[0]).every((id) => id === OAK)).toBe(true);
    });

    it('düzen kaydırıcıları: rehber altbilgide, ısı göstergesi ayrıntıda, Üret düğmeleri ayrıntı alt çubuğunda (listeyi itmez)', () => {
        const { api, refresh } = mount({ items: {}, stations: ['el'] });
        const guide = screen.getByTestId('craft-guide');
        expect(guide.closest('.kp-foot')).not.toBeNull(); // üstte değil altbilgide
        expect(guide.closest('.kp-body')).toBeNull();
        const baseline = ids();
        // rehber değişir ve kaybolur: liste kıpırdamaz; yeri ayrılı kalır
        api._inv.add('item:kazma_taş', 1);
        api.getStations.mockImplementation(() => ['el', 'tezgah']);
        refresh();
        expect(screen.queryByTestId('craft-guide')).toBeNull();
        expect(document.querySelector('.kp-guide-slot')).not.toBeNull();
        expect(ids()).toEqual(baseline);
        // ocak yaklaşınca ısı göstergesi listeyi değil ayrıntıyı etkiler
        api.getStations.mockImplementation(() => ['el', 'tezgah', 'ocak']);
        refresh();
        const heat = screen.getByTestId('heat');
        expect(heat.closest('.kp-detail-scroll')).not.toBeNull();
        expect(heat.closest('.kp-craft-top')).toBeNull();
        expect(ids()).toEqual(baseline);
        // alt çubuk ayrıntı kaydırma alanının DIŞINDA (içerik uzayıp kısalsa da düğmeler yerinde)
        const bar = document.querySelector('.kp-craft-actions');
        expect(bar.closest('.kp-detail-scroll')).toBeNull();
        expect(bar.parentElement).toBe(screen.getByTestId('recipe-detail'));
    });

    it('sekme sayaçları sekmeye asılı rozet: sayı 0 iken de aynı sekme düğümleri', () => {
        const { api, refresh } = mount({ items: {} });
        const tabs = () => screen.getAllByRole('tab');
        const before = tabs();
        expect(before.length).toBe(10);
        api._inv.add('blok:meşe_kütük', 3);
        refresh();
        const after = tabs();
        after.forEach((t, i) => expect(t).toBe(before[i]));
    });
});

describe('Envanter yuvaları kendiliğinden yer değiştirmez', () => {
    it('başka yuvaya eşya girince mevcut yuvalar aynı adreste ve aynı düğümde kalır', () => {
        const api = makeFakeApi({ items: { 0: ['item:kazma_taş', 1], 5: ['blok:meşe_tahta', 12], 9: ['item:sopa', 4] } });
        let v = 0;
        const view = render(<InventoryPanel api={api} version={v} onClose={() => {}} />);
        const addrs = () => Array.from(document.querySelectorAll('[data-slot-addr^="s"]')).map((e) => e.getAttribute('data-slot-addr'));
        const before = addrs();
        const n0 = screen.getByTestId('slot-s0');
        const n5 = screen.getByTestId('slot-s5');
        const text5 = n5.textContent;
        api._inv.add('item:ip', 10);
        api._inv.add('blok:taş', 30);
        api._inv.remove('item:sopa', 4);
        v += 1;
        view.rerender(<InventoryPanel api={api} version={v} onClose={() => {}} />);
        expect(addrs()).toEqual(before);
        expect(screen.getByTestId('slot-s0')).toBe(n0);
        expect(screen.getByTestId('slot-s5')).toBe(n5);
        expect(screen.getByTestId('slot-s5').textContent).toBe(text5);
        expect(api.moveStack).not.toHaveBeenCalled();
    });
});

describe('Büyü panelleri: seçim kendiliğinden atlamaz', () => {
    it('Simya Kazanı: ilk varsayılan seçili tarif, malzeme toplanınca başka tarife kaymaz', () => {
        const a = BREW_RECIPES[0];
        const b = BREW_RECIPES[1];
        const stock = (r, n) => r.in.map((p, i) => [p.item, p.count * n, i]);
        const items = {};
        let slot = 0;
        stock(b, 1).concat([['item:cam_şişe', 3]]).forEach((e) => {
            items[slot++] = [e[0], e[1]];
        });
        const api = makeMagicApi({ items, discovered: [a.id, b.id] });
        let v = 0;
        const view = render(<BrewPanel api={api} version={v} onClose={() => {}} />);
        expect(screen.getByTestId(`brew-recipe-${b.id}`)).toHaveAttribute('aria-pressed', 'true'); // ilk yapılabilir
        expect(screen.getByTestId(`brew-recipe-${a.id}`)).toHaveAttribute('aria-pressed', 'false');
        // listedeki daha önceki tarifin malzemeleri toplanır → varsayılan olsaydı seçim ona atlardı
        stock(a, 1).forEach((e) => api._inv.add(e[0], e[1]));
        v += 1;
        view.rerender(<BrewPanel api={api} version={v} onClose={() => {}} />);
        expect(screen.getByTestId(`brew-recipe-${a.id}`)).toHaveAttribute('data-testid');
        expect(screen.getByTestId(`brew-recipe-${b.id}`)).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId(`brew-recipe-${a.id}`)).toHaveAttribute('aria-pressed', 'false');
        // liste sırası da sabit
        const order = Array.from(screen.getByTestId('brew-book').querySelectorAll('[data-testid^="brew-recipe-"]')).map((e) => e.getAttribute('data-testid'));
        expect(order).toEqual(BREW_RECIPES.map((r) => `brew-recipe-${r.id}`));
    });

    it('Büyü Masası: eldeki eşya değişse de seçili hedef eşya kendiliğinden atlamaz', () => {
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1], 2: ['item:asa_ates', 1], 3: ['item:büyü_tozu', 30] } });
        let v = 0;
        const view = render(<EnchantPanel api={api} version={v} onClose={() => {}} />);
        expect(screen.getByTestId('ench-slot-s0')).toHaveAttribute('aria-selected', 'true');
        api._inv.selected = 2; // elde başka eşya
        v += 1;
        view.rerender(<EnchantPanel api={api} version={v} onClose={() => {}} />);
        expect(screen.getByTestId('ench-slot-s0')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('ench-slot-s2')).toHaveAttribute('aria-selected', 'false');
    });
});
