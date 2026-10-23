// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import CraftingPanel from '../CraftingPanel.jsx';
import InventoryPanel from '../InventoryPanel.jsx';
import { makeFakeApi } from './panelsTestKit.js';

const row = (id) => screen.getByTestId(`recipe-${id}`);
const rowsNow = () => Array.from(document.querySelectorAll('.kp-recipe-row'));
const card = (id) => row(id).querySelector('.kp-recipe');
const craftBtn = (id) => within(row(id)).getByRole('button', { name: /üret$/ });
const search = (q) => fireEvent.change(screen.getByRole('searchbox', { name: 'Tarif ara' }), { target: { value: q } });

describe('Envanter | Üret çalışma alanı', () => {
    beforeEach(() => {
        try {
            window.localStorage.clear();
        } catch (_e) {
            /* depolama yok */
        }
    });

    it('Üret: onSwitch verilince başlıkta sekmeler çizilir; Envanter sekmesi geçiş ister', () => {
        const onSwitch = vi.fn();
        render(<CraftingPanel api={makeFakeApi({})} onClose={() => {}} onSwitch={onSwitch} />);
        const work = screen.getByRole('tablist', { name: 'Çalışma alanı' });
        const tabs = within(work).getAllByRole('tab');
        expect(tabs.map((t) => t.getAttribute('data-work-tab'))).toEqual(['inventory', 'crafting']);
        expect(within(work).getByRole('tab', { name: /Üret/ })).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(within(work).getByRole('tab', { name: /Envanter/ }));
        expect(onSwitch).toHaveBeenCalledWith('inventory');
        fireEvent.click(within(work).getByRole('tab', { name: /Üret/ }));
        expect(onSwitch).toHaveBeenCalledTimes(1); // zaten açık sekme geçiş istemez
        fireEvent.keyDown(work, { key: 'ArrowLeft' });
        expect(onSwitch).toHaveBeenLastCalledWith('inventory');
    });

    it('onSwitch yoksa çalışma alanı sekmeleri çizilmez', () => {
        render(<CraftingPanel api={makeFakeApi({})} onClose={() => {}} />);
        expect(screen.queryByTestId('work-tabs')).toBeNull();
    });

    it('Envanter: sekmeler, Üret rozeti (yapılabilir tarif sayısı) ve R ipucu; Üret sekmesi geçiş ister', () => {
        const onSwitch = vi.fn();
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] } });
        render(<InventoryPanel api={api} onClose={() => {}} onSwitch={onSwitch} />);
        const work = screen.getByRole('tablist', { name: 'Çalışma alanı' });
        expect(within(work).getByRole('tab', { name: /Envanter/ })).toHaveAttribute('aria-selected', 'true');
        const craftTab = within(work).getByRole('tab', { name: /Üret/ });
        const craftable = api.getRecipes({}).filter((r) => r.craftable).length;
        expect(craftable).toBeGreaterThan(2);
        expect(within(craftTab).getByLabelText(`${craftable} tarif yapılabilir`)).toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Klavye kısayolları' })).toHaveTextContent('Üret sekmesi');
        fireEvent.click(craftTab);
        expect(onSwitch).toHaveBeenCalledWith('crafting');
    });

    it('Envanter: onSwitch yoksa sekme ve rozet yok', () => {
        render(<InventoryPanel api={makeFakeApi({})} onClose={() => {}} />);
        expect(screen.queryByTestId('work-tabs')).toBeNull();
    });

    it('istasyon göstergeleri: tezgah/ocak/örs/taş kesici/dokuma; yakındaki açık, ipucu başlıkta', () => {
        const api = makeFakeApi({ stations: ['el', 'kesici', 'dokuma'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('station-kesici')).toHaveTextContent('Taş Kesici yakınında');
        expect(screen.getByTestId('station-dokuma')).toHaveTextContent('Dokuma Tezgahı yakınında');
        expect(screen.getByTestId('station-tezgah')).toHaveTextContent('Tezgah yok');
        expect(screen.getByTestId('station-tezgah')).toHaveAttribute('title', expect.stringContaining('4 Meşe Tahta'));
        expect(screen.getByTestId('station-örs')).toHaveTextContent('Örs yok');
    });

    it('sıradaki adım rehberi: boş çantada ağaç kır; 4 tahtada tezgah tarifini gösterir', () => {
        const empty = render(<CraftingPanel api={makeFakeApi({})} onClose={() => {}} />);
        expect(screen.getByTestId('craft-guide')).toHaveTextContent('Sıradaki adım');
        expect(screen.getByTestId('craft-guide')).toHaveTextContent('bir ağaca yaklaş');
        expect(screen.queryByRole('button', { name: 'Tarifi göster' })).toBeNull();
        empty.unmount();
        render(<CraftingPanel api={makeFakeApi({ items: { 0: ['blok:meşe_tahta', 4] } })} onClose={() => {}} />);
        expect(screen.getByTestId('craft-guide')).toHaveTextContent('4 Meşe Tahta');
        fireEvent.click(screen.getByRole('button', { name: 'Tarifi göster' }));
        expect(within(screen.getByTestId('recipe-detail')).getByRole('heading', { name: 'Üretim Tezgahı' })).toBeInTheDocument();
    });

    it('rehber temel zincir bitince kaybolur', () => {
        const api = makeFakeApi({ items: { 0: ['item:kazma_taş', 1] }, stations: ['el', 'tezgah'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        expect(screen.queryByTestId('craft-guide')).toBeNull();
    });

    it('eksik malzeme satırda sayıyla yazılır; yapılabilir satırda yazılmaz', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 1] }, stations: ['el'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        expect(row('sopa').querySelector('.kp-missing')).toHaveTextContent('Eksik: 1 Meşe Tahta');
        expect(row('tezgah').querySelector('.kp-missing')).toHaveTextContent('Eksik: 3 Meşe Tahta');
        search('ahşap kazma');
        expect(row('kazma_ahşap').querySelector('.kp-missing').textContent).toContain('Tezgah yakınında olmalı');
        expect(card('kazma_ahşap').getAttribute('aria-label')).toContain('Eksik');
    });

    it('tarifi sabitle: ayrı sabit şeridinde görünür, ana liste yerinde kalır, tercih kalıcıdır', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] } });
        const first = render(<CraftingPanel api={api} onClose={() => {}} />);
        const strip = screen.getByTestId('pin-strip');
        expect(strip).toHaveTextContent('Sabit tarif yok');
        const before = rowsNow().map((r) => r.getAttribute('data-testid'));
        search('kase');
        fireEvent.click(card('kase'));
        fireEvent.click(within(screen.getByTestId('recipe-detail')).getByRole('button', { name: /Tarifi sabitle/ }));
        expect(screen.getByTestId('live')).toHaveTextContent('Kase sabitlendi');
        expect(window.localStorage.getItem('kesif.craft.pins')).toContain('kase');
        expect(within(strip).getByTestId('pin-kase')).toBeInTheDocument();
        search('');
        expect(rowsNow().map((r) => r.getAttribute('data-testid'))).toEqual(before); // sabitleme ana listeyi oynatmadı
        first.unmount();
        render(<CraftingPanel api={makeFakeApi({})} onClose={() => {}} />);
        expect(within(screen.getByTestId('pin-strip')).getByTestId('pin-kase')).toBeInTheDocument(); // yeniden açılışta korunur
        fireEvent.click(screen.getByTestId('pin-kase'));
        expect(within(screen.getByTestId('recipe-detail')).getByRole('heading', { name: /^Kase/ })).toBeInTheDocument();
        fireEvent.click(within(screen.getByTestId('recipe-detail')).getByRole('button', { name: /Sabitlemeyi kaldır/ }));
        expect(screen.getByTestId('pin-strip')).toHaveTextContent('Sabit tarif yok');
        expect(screen.queryByRole('tab', { name: /Sabit/ })).toBeNull();
    });

    it('Shift + Üret en çok adedi üretir', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 14] } });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        fireEvent.click(craftBtn('sopa'), { shiftKey: true });
        expect(api.craft).toHaveBeenLastCalledWith('sopa', { times: 7 });
        expect(api._inv.count('blok:meşe_tahta')).toBe(0);
    });

    it('üretince tost çıkar (ad ve toplam adet); başarısızlıkta uyarı tostu', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 6] } });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        fireEvent.click(craftBtn('sopa'));
        expect(screen.getByTestId('craft-toast')).toHaveTextContent('Sopa ×4 üretildi');
        api.craft.mockImplementation(() => false);
        fireEvent.click(craftBtn('sopa'));
        expect(screen.getByTestId('craft-toast')).toHaveTextContent('Sopa üretilemedi');
    });

    it('varsayılan seçili tarif: geniş ekranda sağ panel boş kalmaz', () => {
        render(<CraftingPanel api={makeFakeApi({ items: { 0: ['blok:meşe_tahta', 6] } })} onClose={() => {}} />);
        const detail = screen.getByTestId('recipe-detail');
        expect(detail.querySelector('.kp-detail-name')).toBeTruthy();
        expect(detail).not.toHaveTextContent('Ayrıntı görmek için');
    });

    it('istasyon eksikken ayrıntı nasıl yapılacağını söyler', () => {
        const api = makeFakeApi({ items: { 0: ['item:ham_demir', 2] }, stations: ['el'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        search('ham demir');
        fireEvent.click(card('ocak:demir'));
        expect(screen.getByTestId('recipe-detail')).toHaveTextContent('Ocak: Tezgahta 8 Kırık Taş ile yap');
    });

    it('istasyon göstergesine tıklamak o istasyonun tariflerini süzer; tekrar tıklamak kaldırır', () => {
        const api = makeFakeApi({ stations: ['el', 'tezgah', 'ocak'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        const before = rowsNow().length;
        const btn = within(screen.getByTestId('station-ocak')).getByRole('button');
        fireEvent.click(btn);
        expect(btn).toHaveAttribute('aria-pressed', 'true');
        expect(rowsNow().length).toBeGreaterThan(5);
        expect(rowsNow().length).toBeLessThan(before);
        expect(rowsNow().every((r) => /Ocak/.test(r.textContent) || r.querySelector('.kp-badge') === null || /Ocak/.test(r.querySelector('.kp-badge').textContent))).toBe(true);
        expect(screen.getByRole('dialog')).toHaveTextContent('Ocak:');
        fireEvent.click(btn);
        expect(btn).toHaveAttribute('aria-pressed', 'false');
        expect(rowsNow().length).toBe(before);
    });

    it('ocağa sağ tıklayıp açınca (getStationFocus) ocak tarifleri süzülü gelir; tezgah süzmez', () => {
        const api = makeFakeApi({ stations: ['el', 'ocak'], items: { 0: ['item:ham_demir', 2], 1: ['item:kömür', 2] } });
        api.getStationFocus = vi.fn(() => 'ocak');
        const first = render(<CraftingPanel api={api} onClose={() => {}} />);
        expect(within(screen.getByTestId('station-ocak')).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
        expect(rowsNow().every((r) => r.querySelector('.kp-badge') && /Ocak/.test(r.querySelector('.kp-badge').textContent))).toBe(true);
        expect(screen.getByTestId('heat')).toBeInTheDocument();
        first.unmount();
        api.getStationFocus = vi.fn(() => 'tezgah');
        render(<CraftingPanel api={api} onClose={() => {}} />);
        expect(within(screen.getByTestId('station-tezgah')).getByRole('button')).toHaveAttribute('aria-pressed', 'false');
        expect(rowsNow().length).toBeGreaterThan(40);
    });
});
