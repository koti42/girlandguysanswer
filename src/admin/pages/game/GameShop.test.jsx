// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../panel/hooks/useToast';

const api = vi.hoisted(() => ({ shopItems: vi.fn(), createShopItem: vi.fn(), updateShopItem: vi.fn() }));
vi.mock('../../gameAdminApi', () => ({ gameAdminApi: api, default: api }));

import GameShop from './GameShop';

const ok = (data) => Promise.resolve({ data: { success: true, message: '', data } });
const fail = (status, message, errors) => Promise.reject({ response: { status, data: { success: false, message, ...(errors ? { errors } : {}) } } });

const neon = {
    key: 'frame:neon-gece', category: 'frame', name: 'Neon Gece', description: 'Parlak bir gece.', price: 2500, rarity: 'epic',
    unlock: { type: 'price', jeton: 2500 }, is_active: true, is_featured: false, sort_order: 3,
    available_from: null, available_until: null, max_per_user: null, sold_count: 1234,
};
const ticket = {
    key: 'ticket:message', category: 'consumable', name: 'Mesaj Bileti', description: '', price: 7500, rarity: 'epic',
    unlock: { type: 'price', jeton: 7500 }, is_active: false, is_featured: true, sort_order: 1,
    available_from: null, available_until: '2020-01-01T00:00:00Z', max_per_user: null, sold_count: 3,
};
const tac = {
    key: 'acc:tac', category: 'avatar_part', name: 'Aksesuar: Taç', price: 0, rarity: 'common',
    unlock: { type: 'level', level: 10 }, is_active: true, is_featured: false, sort_order: 0, sold_count: 0,
};

const mount = () => render(<MemoryRouter><ToastProvider><GameShop /></ToastProvider></MemoryRouter>);
const rowOf = (name) => screen.getAllByTestId('table-row').find((r) => within(r).queryByText(name));

describe('GameShop', () => {
    beforeEach(() => {
        Object.values(api).forEach((f) => f.mockReset());
        api.shopItems.mockImplementation(() => ok({ items: [neon, ticket, tac], pagination: { current_page: 1, last_page: 2, per_page: 20, total: 23 } }));
    });

    it('ürün tablosunu önizleme, nadirlik, satış adedi, kilit ve satış durumu ile gösterir', async () => {
        mount();
        const rows = await screen.findAllByTestId('table-row');
        expect(rows).toHaveLength(3);
        const n = rowOf('Neon Gece');
        expect(within(n).getByRole('img', { name: 'Önizleme: Neon Gece' })).toBeInTheDocument();
        expect(within(n).getByText('Epik')).toBeInTheDocument();
        expect(within(n).getByText('1.234')).toBeInTheDocument();
        expect(within(n).getByLabelText('Fiyat: Neon Gece')).toHaveValue(2500);
        expect(within(n).getByText('Süresiz')).toBeInTheDocument();
        const t = rowOf('Mesaj Bileti');
        expect(within(t).getByText('Süresi doldu')).toBeInTheDocument();
        expect(within(t).getByRole('switch', { name: 'Aktif: Mesaj Bileti' })).toHaveAttribute('aria-checked', 'false');
        expect(within(t).getByRole('switch', { name: 'Vitrin: Mesaj Bileti' })).toHaveAttribute('aria-checked', 'true');
        expect(within(rowOf('Aksesuar: Taç')).getByText('Seviye 10')).toBeInTheDocument();
        expect(screen.getByText(/sayfa 1\/2/)).toBeInTheDocument();
        expect(api.shopItems).toHaveBeenCalledWith({ search: '', category: '', rarity: '', active: '', page: 1 });
    });

    it('Keşif dalgası kapalıysa ürün satırında "Dalga kapalı" uyarısı; açıkken yok; Keşif önizlemesi çizilir', async () => {
        const closed = { key: 'portal:neon-sokak', category: 'kesif', name: 'Neon Sokak', price: 1600, rarity: 'rare', unlock: { type: 'price', jeton: 1600 }, is_active: true, is_featured: true, sort_order: 0, sold_count: 0, wave: 'kesif1', wave_open: false };
        const open = { ...closed, key: 'arac:limonata', name: 'Limonata Kiti', rarity: 'common', price: 800, wave_open: true };
        api.shopItems.mockImplementation(() => ok({ items: [closed, open, neon], pagination: { current_page: 1, last_page: 1, per_page: 20, total: 3 } }));
        mount();
        await screen.findAllByTestId('table-row');
        const c = rowOf('Neon Sokak');
        expect(within(c).getByText('Dalga kapalı')).toBeInTheDocument();
        expect(within(c).getByText('Keşif Koleksiyonu')).toBeInTheDocument();
        expect(within(c).getByRole('img', { name: 'Önizleme: Neon Sokak' })).toBeInTheDocument();
        expect(within(rowOf('Limonata Kiti')).queryByText('Dalga kapalı')).toBeNull();
        expect(within(rowOf('Neon Gece')).queryByText('Dalga kapalı')).toBeNull();
    });

    it('filtre değişince ilk sayfadan yeniden sorgular', async () => {
        mount();
        await screen.findAllByTestId('table-row');
        fireEvent.click(screen.getByLabelText('Sonraki'));
        await waitFor(() => expect(api.shopItems).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
        fireEvent.change(screen.getByLabelText('Kategori'), { target: { value: 'frame' } });
        await waitFor(() => expect(api.shopItems).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'frame', page: 1 })));
        fireEvent.change(screen.getByLabelText('Nadirlik'), { target: { value: 'legendary' } });
        fireEvent.change(screen.getByLabelText('Durum'), { target: { value: '0' } });
        await waitFor(() => expect(api.shopItems).toHaveBeenLastCalledWith({ search: '', category: 'frame', rarity: 'legendary', active: '0', page: 1 }));
    });

    it('satır içi düzenleme: yalnızca değişen alanları kaydeder ve listeyi tazeler', async () => {
        api.updateShopItem.mockImplementation(() => ok({ item: { ...neon, price: 3000 } }));
        mount();
        await screen.findAllByTestId('table-row');
        const n = rowOf('Neon Gece');
        fireEvent.change(within(n).getByLabelText('Fiyat: Neon Gece'), { target: { value: '3000' } });
        fireEvent.click(within(n).getByRole('switch', { name: 'Vitrin: Neon Gece' }));
        expect(screen.getByTestId('shop-bulk-bar')).toHaveTextContent('1 üründe kaydedilmemiş değişiklik');

        fireEvent.click(within(n).getByRole('button', { name: 'Kaydet: Neon Gece' }));
        await waitFor(() => expect(api.updateShopItem).toHaveBeenCalledWith('frame:neon-gece', { price: 3000, is_featured: true }));
        await waitFor(() => expect(screen.queryByTestId('shop-bulk-bar')).toBeNull());
        expect(api.shopItems).toHaveBeenCalledTimes(2);
        expect(await screen.findByText('Ürün kaydedildi.')).toBeInTheDocument();
    });

    it('geçersiz satır içi değer kaydedilmez; geri al eski değere döner', async () => {
        mount();
        await screen.findAllByTestId('table-row');
        const n = rowOf('Neon Gece');
        const price = within(n).getByLabelText('Fiyat: Neon Gece');
        fireEvent.change(price, { target: { value: '-5' } });
        expect(price).toHaveAttribute('aria-invalid', 'true');
        fireEvent.click(within(n).getByRole('button', { name: 'Kaydet: Neon Gece' }));
        await screen.findByText('Ürün kaydedilemedi; satırdaki hatayı düzeltin.');
        expect(api.updateShopItem).not.toHaveBeenCalled();

        fireEvent.click(within(n).getByRole('button', { name: 'Geri al: Neon Gece' }));
        expect(within(rowOf('Neon Gece')).getByLabelText('Fiyat: Neon Gece')).toHaveValue(2500);
        expect(screen.queryByTestId('shop-bulk-bar')).toBeNull();
    });

    it('toplu kaydet: başarısız satır taslağını ve sunucu mesajını korur', async () => {
        api.updateShopItem.mockImplementation((key) => (key === 'ticket:message' ? fail(422, 'Fiyat çok yüksek.') : ok({})));
        mount();
        await screen.findAllByTestId('table-row');
        fireEvent.change(within(rowOf('Neon Gece')).getByLabelText('Sıra: Neon Gece'), { target: { value: '9' } });
        fireEvent.change(within(rowOf('Mesaj Bileti')).getByLabelText('Fiyat: Mesaj Bileti'), { target: { value: '999999' } });
        expect(screen.getByTestId('shop-bulk-bar')).toHaveTextContent('2 üründe kaydedilmemiş değişiklik');

        fireEvent.click(screen.getByText('Tümünü kaydet'));
        expect(await screen.findByText('1 ürün kaydedildi, 1 ürün kaydedilemedi.')).toBeInTheDocument();
        expect(api.updateShopItem).toHaveBeenCalledWith('frame:neon-gece', { sort_order: 9 });
        expect(api.updateShopItem).toHaveBeenCalledWith('ticket:message', { price: 999999 });
        expect(screen.getByTestId('shop-bulk-bar')).toHaveTextContent('1 üründe kaydedilmemiş değişiklik');
        expect(within(rowOf('Mesaj Bileti')).getByRole('alert')).toHaveTextContent('Fiyat çok yüksek.');
    });

    it('düzenleme penceresi: değişiklikleri PUT eder, sunucu doğrulama hatasını alanda gösterir', async () => {
        api.updateShopItem
            .mockImplementationOnce(() => fail(422, 'Geçersiz.', { name: ['Bu ad kullanılıyor.'] }))
            .mockImplementationOnce(() => ok({ item: neon }));
        mount();
        await screen.findAllByTestId('table-row');
        fireEvent.click(within(rowOf('Neon Gece')).getByRole('button', { name: 'Düzenle: Neon Gece' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByRole('img', { name: 'Önizleme: Neon Gece' })).toBeInTheDocument();
        expect(within(dialog).queryByLabelText('Kişi başı en fazla')).toBeNull(); // kozmetikte yok

        fireEvent.change(within(dialog).getByTestId('item-name'), { target: { value: '  Neon Gece 2  ' } });
        fireEvent.change(within(dialog).getByLabelText('Satış bitişi'), { target: { value: '2026-10-10T21:00' } });
        fireEvent.click(within(dialog).getByTestId('item-save'));
        expect(await within(dialog).findByText('Bu ad kullanılıyor.')).toBeInTheDocument();
        expect(api.updateShopItem).toHaveBeenLastCalledWith('frame:neon-gece', { name: 'Neon Gece 2', available_until: new Date('2026-10-10T21:00').toISOString() });

        fireEvent.click(within(dialog).getByTestId('item-save'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(api.updateShopItem).toHaveBeenCalledTimes(2);
    });

    it('düzenleme penceresi: istemci doğrulaması ve geri al', async () => {
        mount();
        await screen.findAllByTestId('table-row');
        fireEvent.click(within(rowOf('Mesaj Bileti')).getByRole('button', { name: 'Düzenle: Mesaj Bileti' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Kişi başı en fazla'), { target: { value: '0' } });
        fireEvent.change(within(dialog).getByLabelText('Satış başlangıcı'), { target: { value: '2026-12-01T10:00' } });
        fireEvent.change(within(dialog).getByLabelText('Satış bitişi'), { target: { value: '2026-11-01T10:00' } });
        fireEvent.click(within(dialog).getByTestId('item-save'));
        expect(within(dialog).getByText('Bitiş, başlangıçtan sonra olmalı.')).toBeInTheDocument();
        expect(within(dialog).getByText(/1–1\.000 arası tam sayı/)).toBeInTheDocument();
        expect(api.updateShopItem).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByText('Geri al'));
        expect(within(dialog).getByLabelText('Satış başlangıcı')).toHaveValue('');
        expect(within(dialog).getByLabelText('Kişi başı en fazla')).toHaveValue(null);
    });

    it('yeni ürün: yalnızca mağazada olmayan tasarımlar seçilebilir ve POST gövdesi tasarımdan dolar', async () => {
        api.createShopItem.mockImplementation(() => ok({ item: {} }));
        mount();
        await screen.findAllByTestId('table-row');
        fireEvent.click(screen.getByText('Yeni ürün'));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(api.shopItems).toHaveBeenCalledWith({ page: 1, per_page: 100 }));
        const select = within(dialog).getByLabelText('Tasarım anahtarı');
        await waitFor(() => expect(select).not.toBeDisabled());
        const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);
        expect(values).not.toContain('frame:neon-gece');
        expect(values).not.toContain('ticket:message');
        expect(values).toContain('frame:yildiz-tozu');
        expect(values).toContain('mini:ejderha');

        fireEvent.change(select, { target: { value: 'frame:yildiz-tozu' } });
        expect(within(dialog).getByTestId('item-name')).toHaveValue('Yıldız Tozu');
        fireEvent.change(within(dialog).getByTestId('item-price'), { target: { value: '9000' } });
        fireEvent.click(within(dialog).getByTestId('item-create'));
        await waitFor(() => expect(api.createShopItem).toHaveBeenCalledTimes(1));
        expect(api.createShopItem.mock.calls[0][0]).toMatchObject({
            key: 'frame:yildiz-tozu', category: 'frame', name: 'Yıldız Tozu', price: 9000, rarity: 'legendary', is_active: true, is_featured: false, sort_order: 0, available_from: null, available_until: null,
        });
        expect(api.createShopItem.mock.calls[0][0]).not.toHaveProperty('max_per_user');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('liste hatasında tekrar dene düğmesi çıkar', async () => {
        api.shopItems.mockImplementation(() => fail(500, 'Sunucu hatası'));
        mount();
        expect(await screen.findByText('Sunucu hatası')).toBeInTheDocument();
        expect(screen.getByText('Tekrar dene')).toBeInTheDocument();
    });
});
