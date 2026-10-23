// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import CraftingPanel from '../CraftingPanel.jsx';
import { makeFakeApi } from './panelsTestKit.js';

const row = (id) => screen.getByTestId(`recipe-${id}`);
const rowsNow = () => Array.from(document.querySelectorAll('.kp-recipe-row'));
const card = (id) => row(id).querySelector('.kp-recipe');
const craftBtn = (id) => within(row(id)).getByRole('button', { name: /üret$/ });
const search = (q) => fireEvent.change(screen.getByRole('searchbox', { name: 'Tarif ara' }), { target: { value: q } });

describe('CraftingPanel', () => {
    it('tarifler sabit ilerleme sırasında; yapılamayanlar yerinde soluk; istasyon göstergeleri', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] }, stations: ['el', 'tezgah'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        expect(screen.getByRole('dialog', { name: 'Üretim' })).toBeInTheDocument();
        expect(screen.getByTestId('station-tezgah')).toHaveTextContent('Tezgah yakınında');
        expect(screen.getByTestId('station-ocak')).toHaveTextContent('Ocak yok');
        const rows = rowsNow();
        // sıra motorun sabit sırasıdır (tahta, sopa, tezgah…); yapılabilirlik sırayı değiştirmez
        expect(rows.slice(0, 4).map((r) => r.getAttribute('data-testid'))).toEqual(['recipe-tahta_meşe', 'recipe-tahta_huş', 'recipe-tahta_çevir_huş', 'recipe-tahta_çam']);
        expect(row('tahta_meşe').classList.contains('is-craftable')).toBe(false); // kütük yok: yerinde, soluk
        expect(row('sopa').classList.contains('is-craftable')).toBe(true);
        const firstNon = rows.findIndex((r) => !r.classList.contains('is-craftable'));
        expect(rows.slice(firstNon).some((r) => r.classList.contains('is-craftable'))).toBe(true); // yapılabilirler araya serpilmiş kalır
    });

    it('istasyon süzgeci açıkken liste süzgeç niteliği taşır (kart başına rozet görsel olarak gizlenir, metni kalır)', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] }, stations: ['el', 'tezgah'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        const list = screen.getByRole('list', { name: 'Tarifler' });
        expect(list).not.toHaveAttribute('data-station-filter');
        fireEvent.click(within(screen.getByTestId('station-tezgah')).getByRole('button'));
        expect(screen.getByRole('list', { name: 'Tarifler' })).toHaveAttribute('data-station-filter', 'tezgah');
        expect(document.querySelectorAll('.kp-recipe-row .kp-badge').length).toBeGreaterThan(0);
    });

    it('sekme sayacı yapılabilir tarif sayısını gösterir; sekme süzer', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] }, stations: ['el', 'tezgah'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        const tablist = screen.getByRole('tablist', { name: 'Tarif kategorileri' });
        expect(within(tablist).getAllByRole('tab').map((t) => t.getAttribute('data-tab'))).toEqual(
            ['tumu', 'alet', 'silah', 'zırh', 'yapı', 'yiyecek', 'malzeme', 'ocak', 'teknoloji', 'özel'],
        );
        fireEvent.click(within(tablist).getByRole('tab', { name: /Silahlar/ }));
        expect(screen.getByRole('tab', { name: /Silahlar/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByTestId('recipe-sopa')).toBeNull();
        expect(row('kılıç_ahşap')).toBeInTheDocument();
        fireEvent.click(within(tablist).getByRole('tab', { name: /Malzeme/ }));
        expect(row('sopa')).toBeInTheDocument();
    });

    it('arama Türkçe harf duyarsız; sonuç yoksa mesaj', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] } });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        const input = screen.getByRole('searchbox', { name: 'Tarif ara' });
        fireEvent.change(input, { target: { value: 'kilic' } });
        expect(rowsNow().length).toBeGreaterThan(0);
        expect(rowsNow().every((el) => /Kılıç/.test(el.textContent))).toBe(true);
        fireEvent.change(input, { target: { value: 'asdfgh' } });
        expect(screen.getByTestId('craft-empty')).toBeInTheDocument();
    });

    it('Yapılabilirler süzgeci yalnız yapılabilirleri bırakır', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] } });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        const before = rowsNow().length;
        const chip = screen.getByRole('button', { name: 'Yapılabilirler' });
        fireEvent.click(chip);
        expect(chip).toHaveAttribute('aria-pressed', 'true');
        const rows = rowsNow();
        expect(rows.length).toBeLessThan(before);
        expect(rows.every((r) => r.classList.contains('is-craftable'))).toBe(true);
    });

    it('Üret düğmesi api.craft çağırır, envanter güncellenir ve duyurulur', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] } });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        fireEvent.click(craftBtn('sopa'));
        expect(api.craft).toHaveBeenCalledWith('sopa', { times: 1 });
        expect(api._inv.count('item:sopa')).toBe(4);
        expect(api._inv.count('blok:meşe_tahta')).toBe(10);
        expect(screen.getByTestId('live')).toHaveTextContent('Sopa üretildi: 4 adet');
        // malzeme sayacı canlı güncellendi
        fireEvent.click(card('sopa'));
        expect(within(screen.getByTestId('recipe-detail')).getByText(/10\/2/)).toBeInTheDocument();
    });

    it('devre dışı durumlar: istasyon yok ve malzeme eksik', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12], 1: ['item:sopa', 10], 2: ['blok:kırıktaş', 1] }, stations: ['el'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        search('ahşap kazma');
        const btn = craftBtn('kazma_ahşap');
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('title', 'Tezgah gerekli');
        fireEvent.click(btn);
        expect(api.craft).not.toHaveBeenCalled();
        fireEvent.click(card('kazma_ahşap'));
        const detail = screen.getByTestId('recipe-detail');
        expect(detail).toHaveTextContent('Tezgah yakınında olmalısın');
        expect(detail).toHaveTextContent('Tezgah gerekli');
        expect(within(detail).getByRole('button', { name: '×1' })).toBeDisabled();
        expect(within(detail).getByRole('button', { name: /Maks/ })).toBeDisabled();
    });

    it('malzeme eksikse detayda nereden bulunur ipucu gösterilir', () => {
        const api = makeFakeApi({ items: { 0: ['item:sopa', 10] }, stations: ['el', 'tezgah'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        search('taş kazma');
        fireEvent.click(card('kazma_taş'));
        const detail = screen.getByTestId('recipe-detail');
        expect(detail).toHaveTextContent('Malzeme eksik');
        expect(detail).toHaveTextContent('Kazarak çıkar');
        expect(detail).toHaveTextContent('0/3');
        expect(detail).toHaveTextContent('10/2');
    });

    it('×5 ve Maks: azami adet envantere göre', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 14] } });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        fireEvent.click(card('sopa'));
        const detail = screen.getByTestId('recipe-detail');
        const max = within(detail).getByRole('button', { name: /Maks \(7\)/ });
        fireEvent.click(within(detail).getByRole('button', { name: '×5' }));
        expect(api.craft).toHaveBeenLastCalledWith('sopa', { times: 5 });
        expect(api._inv.count('blok:meşe_tahta')).toBe(4);
        expect(within(detail).getByRole('button', { name: '×5' })).toBeDisabled(); // 2 kez yetecek kadar kaldı
        expect(within(detail).getByRole('button', { name: /Maks \(2\)/ })).toBeInTheDocument();
        fireEvent.click(within(detail).getByRole('button', { name: /Maks \(2\)/ }));
        expect(api.craft).toHaveBeenLastCalledWith('sopa', { times: 2 });
        expect(api._inv.count('blok:meşe_tahta')).toBe(0);
        expect(max).toBeDefined();
        expect(within(detail).getByRole('button', { name: '×1' })).toBeDisabled();
    });

    it('çoklu üretim reddedilirse tek tek dener', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 6] }, craftMulti: false });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        fireEvent.click(card('sopa'));
        fireEvent.click(within(screen.getByTestId('recipe-detail')).getByRole('button', { name: /Maks \(3\)/ }));
        expect(api._inv.count('item:sopa')).toBe(12);
        expect(screen.getByTestId('live')).toHaveTextContent('12 adet');
    });

    it('üretilemezse hata duyurulur', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 6] } });
        api.craft.mockImplementation(() => false);
        render(<CraftingPanel api={api} onClose={() => {}} />);
        fireEvent.click(craftBtn('sopa'));
        expect(screen.getByTestId('live')).toHaveTextContent('Sopa üretilemedi');
    });

    it('ocak: ısı/yakıt göstergesi ve eritme', () => {
        const api = makeFakeApi({ items: { 0: ['item:ham_demir', 2], 1: ['item:kömür', 2] }, stations: ['el', 'ocak'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: /Ocak/ }));
        const heat = screen.getByTestId('heat');
        expect(heat).toHaveTextContent('Ocak ısısı: 160');
        expect(heat).toHaveTextContent('16 eritme');
        expect(heat).toHaveTextContent('Kömür ×2');
        expect(within(heat).getByRole('progressbar', { name: 'Ocak ısısı' })).toBeInTheDocument();
        fireEvent.click(craftBtn('ocak:demir'));
        expect(api._inv.count('item:demir_külçe')).toBe(1);
        expect(api._inv.count('item:ham_demir')).toBe(1);
        expect(screen.getByTestId('heat')).toHaveTextContent('Ocak ısısı: 150');
    });

    it('ocak yoksa ve ocak sekmesi kapalıysa ısı göstergesi gizli; yakıtsız uyarı', () => {
        const api = makeFakeApi({ items: { 0: ['item:ham_demir', 2] }, stations: ['el'] });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        expect(screen.queryByTestId('heat')).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: /Ocak/ }));
        expect(screen.getByTestId('heat')).toHaveTextContent('Yakıtın yok');
    });

    it('ok tuşları tarif kartları arasında gezinir', () => {
        const api = makeFakeApi({ items: { 0: ['blok:meşe_tahta', 12] } });
        render(<CraftingPanel api={api} onClose={() => {}} />);
        const cards = Array.from(document.querySelectorAll('.kp-recipe'));
        cards[0].focus();
        fireEvent.keyDown(cards[0], { key: 'ArrowDown' });
        expect(document.activeElement).toBe(cards[1]);
        expect(cards[1]).toHaveAttribute('tabindex', '0');
        expect(cards[0]).toHaveAttribute('tabindex', '-1');
    });

    it('çok tarif varsa sayfalanır ve Daha fazla göster çalışır', () => {
        const api = makeFakeApi({});
        render(<CraftingPanel api={api} onClose={() => {}} />);
        const first = rowsNow().length;
        expect(first).toBe(48);
        fireEvent.click(screen.getByRole('button', { name: /Daha fazla göster/ }));
        expect(rowsNow().length).toBeGreaterThan(first);
    });

    it('Esc paneli kapatır', () => {
        const onClose = vi.fn();
        render(<CraftingPanel api={makeFakeApi({})} onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
