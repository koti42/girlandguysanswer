// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../panel/hooks/useToast';

const api = vi.hoisted(() => ({ shopSummary: vi.fn(), searchWallets: vi.fn(), wallet: vi.fn(), adjustWallet: vi.fn(), themes: vi.fn(), grantTheme: vi.fn(), revokeTheme: vi.fn() }));
vi.mock('../../gameAdminApi', () => ({ gameAdminApi: api, default: api }));

import GameCoins from './GameCoins';

const ok = (data, message = '') => Promise.resolve({ data: { success: true, message, data } });
const fail = (status, message, extra = {}) => Promise.reject({ response: { status, data: { success: false, message, ...extra } } });

const summary = {
    circulation: 1234567, earned_today: 4200, spent_today: 1500, earned_7d: 30500, spent_7d: 12000,
    top_items: [{ key: 'frame:neon-gece', name: 'Neon Gece', category: 'frame', sold_count: 321, revenue: 802500 }],
    ticket_log: [{ sender: { id: 'u1', username: 'gonderen' }, recipient: { id: 'u2', username: 'alici' }, at: '2026-10-02T12:00:00Z', body: 'Merhaba, <b>sorun</b> hakkında yazdım.' }],
};
const ayse = { id: 'u9', username: 'ayse', avatar: null };
const walletBody = (balance = 300) => ({
    user: ayse,
    wallet: { balance, earned_total: 900, spent_total: 600 },
    transactions: [
        { id: 1, amount: 120, balance_after: 300, type: 'earn_runner', item_key: null, note: null, created_at: '2026-10-02T10:00:00Z' },
        { id: 2, amount: -600, balance_after: 180, type: 'purchase', item_key: 'frame:neon-gece', note: null, created_at: '2026-10-01T10:00:00Z' },
    ],
    pagination: { current_page: 1, last_page: 2, per_page: 20, total: 25 },
});

const mount = (url = '/cpl-manage/game/coins') => render(<MemoryRouter initialEntries={[url]}><ToastProvider><GameCoins /></ToastProvider></MemoryRouter>);

describe('GameCoins', () => {
    beforeEach(() => {
        Object.values(api).forEach((f) => f.mockReset());
        api.shopSummary.mockImplementation(() => ok(summary));
        api.searchWallets.mockImplementation(() => ok([{ user: ayse, wallet: { balance: 300, earned_total: 900, spent_total: 600 } }]));
        api.wallet.mockImplementation(() => ok(walletBody()));
        api.themes.mockImplementation(() => ok({ items: [] }));
    });

    it('özet kartlarını, en çok satanları ve Mesaj Bileti kaydını gösterir', async () => {
        mount();
        const cards = await screen.findByTestId('coin-summary');
        expect(within(cards).getByText('1.234.567')).toBeInTheDocument();
        expect(within(cards).getByText('4.200')).toBeInTheDocument();
        expect(within(cards).getByText('12.000')).toBeInTheDocument();
        const top = screen.getByTestId('coin-top-items');
        expect(within(top).getByText('Neon Gece')).toBeInTheDocument();
        expect(within(top).getByText('321 satış')).toBeInTheDocument();
        const log = screen.getByTestId('coin-ticket-log');
        expect(within(log).getByText('@gonderen')).toBeInTheDocument();
        expect(within(log).getByText('@alici')).toBeInTheDocument();
        // İçerik metin olarak çizilir (HTML yorumlanmaz).
        expect(within(log).getByText('Merhaba, <b>sorun</b> hakkında yazdım.')).toBeInTheDocument();
        expect(log.querySelector('b')).toBeNull();
    });

    it('kullanıcı arar, cüzdanı ve sayfalı işlem geçmişini açar', async () => {
        mount();
        await screen.findByTestId('coin-summary');
        fireEvent.change(screen.getByLabelText('Kullanıcı adı ara'), { target: { value: 'ay' } });
        const results = await screen.findByTestId('wallet-results');
        await waitFor(() => expect(api.searchWallets).toHaveBeenCalledWith('ay'));
        fireEvent.click(await within(results).findByText('@ayse'));

        const card = await screen.findByTestId('wallet-card');
        expect(api.wallet).toHaveBeenCalledWith('u9', { page: 1 });
        expect(within(card).getByText('Güncel bakiye').parentElement).toHaveTextContent('300');
        expect(within(card).getByText('Toplam kazanılan').parentElement).toHaveTextContent('900');
        const tx = screen.getByTestId('wallet-transactions');
        expect(within(tx).getByText('Koşu kazancı')).toBeInTheDocument();
        expect(within(tx).getByText('Satın alma')).toBeInTheDocument();
        expect(within(tx).getByText('+120')).toBeInTheDocument();
        expect(within(tx).getByText('-600')).toBeInTheDocument();
        fireEvent.click(within(tx).getByLabelText('Sonraki'));
        await waitFor(() => expect(api.wallet).toHaveBeenLastCalledWith('u9', { page: 2 }));
    });

    it('jeton ver: onay penceresinde kullanıcı ve miktar yazar, onayla POST atar', async () => {
        api.adjustWallet.mockImplementation(() => ok({ wallet: { balance: 800, earned_total: 1400, spent_total: 600 } }, 'Jeton verildi.'));
        mount('/cpl-manage/game/coins?user=u9');
        const card = await screen.findByTestId('wallet-card');
        const form = within(card).getByTestId('wallet-adjust');

        // Gerekçesiz gönderilemez.
        fireEvent.change(within(form).getByLabelText('Miktar'), { target: { value: '500' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Jeton ver' }));
        expect(within(form).getByText('Gerekçe zorunlu.')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.change(within(form).getByLabelText('Gerekçe'), { target: { value: 'Etkinlik ödülü' } });
        expect(within(form).getByText('Yeni bakiye: 800')).toBeInTheDocument();
        fireEvent.click(within(form).getByRole('button', { name: 'Jeton ver' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('@ayse kullanıcısına 500 jeton verilecek.');
        expect(api.adjustWallet).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByTestId('confirm-button'));
        await waitFor(() => expect(api.adjustWallet).toHaveBeenCalledWith('u9', { amount: 500, reason: 'Etkinlik ödülü' }));
        expect(await screen.findByText('Jeton verildi.')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(api.wallet).toHaveBeenCalledTimes(2); // işlem geçmişi tazelenir
        expect(api.shopSummary).toHaveBeenCalledTimes(2); // özet tazelenir
        expect(within(form).getByLabelText('Miktar')).toHaveValue(null);
    });

    it('jeton kes: bakiyeden fazlası istemcide engellenir, negatif miktar sunucuya eksi gider', async () => {
        api.adjustWallet.mockImplementation(() => ok({ wallet: { balance: 200, earned_total: 900, spent_total: 600 } }));
        mount('/cpl-manage/game/coins?user=u9');
        const form = within(await screen.findByTestId('wallet-card')).getByTestId('wallet-adjust');
        fireEvent.click(within(form).getByRole('radio', { name: 'Jeton kes' }));
        fireEvent.change(within(form).getByLabelText('Miktar'), { target: { value: '301' } });
        fireEvent.change(within(form).getByLabelText('Gerekçe'), { target: { value: 'Hatalı ödül' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Jeton kes' }));
        expect(within(form).getByText(/Bakiye yetersiz: en fazla 300 jeton kesilebilir/)).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.change(within(form).getByLabelText('Miktar'), { target: { value: '100' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Jeton kes' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('@ayse kullanıcısından 100 jeton kesilecek.');
        fireEvent.click(within(dialog).getByTestId('confirm-button'));
        await waitFor(() => expect(api.adjustWallet).toHaveBeenCalledWith('u9', { amount: -100, reason: 'Hatalı ödül' }));
    });

    it('sunucu "bakiye yetersiz" derse hatayı alanda ve bildirimde gösterir, form korunur', async () => {
        api.adjustWallet.mockImplementation(() => fail(422, 'Bakiye negatife düşemez.', { data: { reason: 'insufficient' } }));
        mount('/cpl-manage/game/coins?user=u9');
        const form = within(await screen.findByTestId('wallet-card')).getByTestId('wallet-adjust');
        fireEvent.click(within(form).getByRole('radio', { name: 'Jeton kes' }));
        fireEvent.change(within(form).getByLabelText('Miktar'), { target: { value: '250' } });
        fireEvent.change(within(form).getByLabelText('Gerekçe'), { target: { value: 'Düzeltme' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Jeton kes' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('confirm-button'));

        expect(await screen.findByText('Bakiye negatife düşemez.')).toBeInTheDocument();
        expect(within(form).getByText(/kesinti bakiyeyi negatife düşüremez/)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(within(form).getByLabelText('Miktar')).toHaveValue(250);
        expect(api.wallet).toHaveBeenCalledTimes(1);
    });

    it('özet hatasında tekrar dene çıkar; cüzdan yoksa yönlendirme metni görünür', async () => {
        api.shopSummary.mockImplementation(() => fail(500, 'Özet alınamadı'));
        mount();
        expect(await screen.findByText('Özet alınamadı')).toBeInTheDocument();
        expect(screen.getByText('Tekrar dene')).toBeInTheDocument();
        expect(screen.getByText('Bir kullanıcı seçin.')).toBeInTheDocument();
        expect(api.wallet).not.toHaveBeenCalled();
    });
});
describe('GameCoins › Profil teması', () => {
    const entitlement = (over = {}) => ({
        user: ayse, user_id: 'u9', theme: 'ada', source: 'admin', enabled: true, active: true,
        expires_at: null, unlimited: true, price_paid: 0, purchases: 0, ...over,
    });
    const openUser = async () => {
        mount('/cpl-manage/game/coins?user=u9');
        return within(await screen.findByTestId('wallet-card')).getByTestId('theme-admin');
    };

    beforeEach(() => {
        Object.values(api).forEach((f) => f.mockReset());
        api.shopSummary.mockImplementation(() => ok(summary));
        api.wallet.mockImplementation(() => ok(walletBody()));
        api.themes.mockImplementation(() => ok({ items: [], pagination: { current_page: 1, last_page: 1, total: 0 } }));
    });

    it('seçili kullanıcı için hakları kullanıcı kimliğiyle sorgular; hak yoksa "Hakkı yok" ve kaldır düğmesi çıkmaz', async () => {
        const panel = await openUser();
        await waitFor(() => expect(api.themes).toHaveBeenCalledWith({ user_id: 'u9', per_page: 50 }));
        expect(await within(panel).findByText('Hakkı yok')).toBeInTheDocument();
        expect(within(panel).queryByRole('button', { name: 'Temayı kaldır' })).toBeNull();
    });

    it('başka kullanıcıya ait satırı (süzgeç yok sayılsa bile) bu kullanıcının hakkı sanmaz', async () => {
        api.themes.mockImplementation(() => ok({ items: [entitlement({ user_id: 'u1', user: { id: 'u1', username: 'baska' } })] }));
        const panel = await openUser();
        expect(await within(panel).findByText('Hakkı yok')).toBeInTheDocument();
    });

    it('mevcut hak: durum, kaynak, bitiş ve harcanan gösterilir', async () => {
        api.themes.mockImplementation(() => ok({ items: [entitlement({ source: 'purchase', unlimited: false, expires_at: '2026-11-01T12:00:00Z', price_paid: 2000000, purchases: 2 })] }));
        const panel = await openUser();
        const details = await within(panel).findByTestId('theme-admin-details');
        expect(within(panel).getByTestId('theme-admin-status')).toHaveTextContent(/Aktif · kalan \d+ gün|Süresi doldu/);
        expect(details).toHaveTextContent('Satın alma');
        expect(details).toHaveTextContent('2.000.000 jeton · 2 alım');
        expect(details).toHaveTextContent('Açık');
    });

    it('süresiz yönetici hakkı etiketi', async () => {
        api.themes.mockImplementation(() => ok({ items: [entitlement()] }));
        const panel = await openUser();
        expect(await within(panel).findByText('Süresiz (yönetici)')).toBeInTheDocument();
        expect(within(panel).getByTestId('theme-admin-details')).toHaveTextContent('Süresiz');
    });

    it('gün ver: gerekçe zorunlu; onay penceresi kullanıcıyı ve süreyi yazar; onayla POST atar ve liste tazelenir', async () => {
        api.grantTheme.mockImplementation(() => ok({ theme: entitlement({ unlimited: false, expires_at: '2026-11-01T00:00:00Z' }) }, 'Tema verildi.'));
        const panel = await openUser();
        const form = within(panel).getByTestId('theme-grant-form');
        await waitFor(() => expect(api.themes).toHaveBeenCalledTimes(1));

        fireEvent.click(within(form).getByRole('button', { name: 'Temayı ver' }));
        expect(within(form).getByText('Gerekçe zorunlu.')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.change(within(form).getByLabelText('Gün'), { target: { value: '0' } });
        fireEvent.change(within(form).getByLabelText('Tema gerekçesi'), { target: { value: 'Yarışma ödülü' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Temayı ver' }));
        expect(within(form).getByText('1 ile 365 arasında tam sayı girin.')).toBeInTheDocument();

        fireEvent.change(within(form).getByLabelText('Gün'), { target: { value: '30' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Temayı ver' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('@ayse kullanıcısına Ada Profili 30 gün verilecek.');
        expect(dialog).toHaveTextContent('Yarışma ödülü');
        expect(api.grantTheme).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByTestId('confirm-button'));
        await waitFor(() => expect(api.grantTheme).toHaveBeenCalledWith({ user_id: 'u9', days: 30, reason: 'Yarışma ödülü' }));
        expect(await screen.findByText('Tema verildi.')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(api.themes).toHaveBeenCalledTimes(2);
        expect(within(form).getByLabelText('Tema gerekçesi')).toHaveValue('');
    });

    it('süresiz ver: days null gider, gün alanı kalkar', async () => {
        api.grantTheme.mockImplementation(() => ok({}, 'Verildi.'));
        const panel = await openUser();
        const form = within(panel).getByTestId('theme-grant-form');
        fireEvent.click(within(form).getByRole('radio', { name: 'Süresiz ver' }));
        expect(within(form).queryByLabelText('Gün')).toBeNull();
        fireEvent.change(within(form).getByLabelText('Tema gerekçesi'), { target: { value: 'Ekip üyesi' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Temayı ver' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('Ada Profili süresiz verilecek.');
        fireEvent.click(within(dialog).getByTestId('confirm-button'));
        await waitFor(() => expect(api.grantTheme).toHaveBeenCalledWith({ user_id: 'u9', days: null, reason: 'Ekip üyesi' }));
    });

    it('kaldır: onay penceresi sonrası DELETE atar', async () => {
        api.themes.mockImplementation(() => ok({ items: [entitlement()] }));
        api.revokeTheme.mockImplementation(() => ok({}, 'Tema kaldırıldı.'));
        const panel = await openUser();
        fireEvent.click(await within(panel).findByRole('button', { name: 'Temayı kaldır' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('@ayse kullanıcısının Ada Profili hakkı kaldırılacak');
        expect(api.revokeTheme).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByTestId('confirm-button'));
        await waitFor(() => expect(api.revokeTheme).toHaveBeenCalledWith('u9'));
        expect(await screen.findByText('Tema kaldırıldı.')).toBeInTheDocument();
        await waitFor(() => expect(api.themes).toHaveBeenCalledTimes(2));
    });

    it('vazgeçilirse hiçbir istek atılmaz', async () => {
        api.themes.mockImplementation(() => ok({ items: [entitlement()] }));
        const panel = await openUser();
        fireEvent.click(await within(panel).findByRole('button', { name: 'Temayı kaldır' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(api.revokeTheme).not.toHaveBeenCalled();
        expect(api.grantTheme).not.toHaveBeenCalled();
    });

    it('sunucu hatası: bildirim çıkar, alan hatası gösterilir, form korunur', async () => {
        api.grantTheme.mockImplementation(() => fail(422, 'Doğrulama hatası', { errors: { reason: ['Gerekçe çok kısa.'] } }));
        const panel = await openUser();
        const form = within(panel).getByTestId('theme-grant-form');
        fireEvent.change(within(form).getByLabelText('Tema gerekçesi'), { target: { value: 'x' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Temayı ver' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('confirm-button'));
        expect(await screen.findByText('Doğrulama hatası Gerekçe çok kısa.')).toBeInTheDocument();
        expect(within(form).getAllByText('Gerekçe çok kısa.').length).toBeGreaterThan(0);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(within(form).getByLabelText('Tema gerekçesi')).toHaveValue('x');
    });

    it('hak listesi alınamazsa tekrar dene çıkar; jeton formu yine çalışır durumda kalır', async () => {
        api.themes.mockImplementation(() => fail(500, 'Liste alınamadı'));
        const panel = await openUser();
        expect(await within(panel).findByText('Liste alınamadı')).toBeInTheDocument();
        expect(within(panel).getByText('Tekrar dene')).toBeInTheDocument();
        expect(screen.getByTestId('wallet-adjust')).toBeInTheDocument();
    });
});
