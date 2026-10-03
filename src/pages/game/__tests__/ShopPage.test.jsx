// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

/*
 * /oyun/magaza: yükleme, sekmeler, satın alma (başarı / yetersiz / 409),
 * kuşanma, misafir statik kataloğu, ?urun derin bağlantısı.
 */

const auth = { user: null, isAuthenticated: true, loading: false, updateUser: vi.fn() };
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../../services/shopApi', () => ({
    shopApi: { get: vi.fn(), buy: vi.fn(), equip: vi.fn(), transactions: vi.fn() },
}));

import { shopApi } from '../../../services/shopApi';
import ShopPage from '../ShopPage';
import { FRAMES, MINIS, TITLES } from '../../../game/shop';

const F1 = FRAMES[0];
const F2 = FRAMES.find((f) => f.rarity === 'legendary') || FRAMES[1];
const M1 = MINIS[0];
const T1 = TITLES[0];

const item = (design, extra = {}) => ({
    key: design.id,
    category: design.category,
    name: design.name,
    description: design.description,
    price: 500,
    rarity: design.rarity,
    unlock: { type: 'price', jeton: 500 },
    owned: false,
    quantity: 0,
    unlocked: true,
    available_until: null,
    is_featured: false,
    is_active: true,
    ...extra,
});

const ticket = (extra = {}) => ({
    key: 'ticket:message', category: 'consumable', name: 'Mesaj Bileti', description: 'Tek mesaj', price: 7500, rarity: 'epic',
    unlock: { type: 'price' }, owned: false, quantity: 0, unlocked: true, available_until: null, is_featured: false, is_active: true, ...extra,
});

const shopData = (over = {}) => ({
    wallet: { balance: 1000, earned_total: 1500, spent_total: 500 },
    featured: [item(F2, { is_featured: true, price: 900, available_until: '2099-01-01T00:00:00Z' })],
    categories: [
        { key: 'frame', name: 'Çerçeveler', items: [item(F1), item(F2, { price: 900 }), item(FRAMES[2], { price: 5000 })] },
        { key: 'mini_avatar', name: 'Mini Avatarlar', items: [item(M1, { owned: true })] },
        { key: 'title', name: 'Unvanlar', items: [item(T1, { owned: true })] },
        { key: 'consumable', name: 'Özel', items: [ticket()] },
    ],
    equipped: { frame: null, mini_avatar: null, title: T1.id },
    tickets: 0,
    player: { level: 4 },
    ...over,
});

const probe = { location: null };
const LocationProbe = () => {
    const location = useLocation();
    useEffect(() => {
        probe.location = location;
    }, [location]);
    return null;
};

const renderPage = (path = '/oyun/magaza') =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/oyun/magaza" element={<><ShopPage /><LocationProbe /></>} />
            </Routes>
        </MemoryRouter>
    );

const axiosError = (status, data = {}, message = 'Hata') => Object.assign(new Error(message), { response: { status, data: { success: false, message, data } } });

describe('ShopPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        auth.user = { id: 'u1', username: 'ayse', avatar: null, gender: 'female', detail: { game_cosmetics: null } };
        auth.isAuthenticated = true;
        auth.loading = false;
        shopApi.get.mockResolvedValue(shopData());
        shopApi.transactions.mockResolvedValue({ transactions: [], pagination: { current_page: 1, last_page: 1 } });
    });

    it('yüklenir: bakiye, vitrin geri sayımı, kategori sekmeleri', async () => {
        renderPage();
        expect(screen.getByText(/Mağaza yükleniyor/)).toBeInTheDocument();
        expect(await screen.findByTestId('shop-balance')).toHaveTextContent('1.000');
        expect(screen.getByText('Haftanın Vitrini')).toBeInTheDocument();
        expect(screen.getByTestId('featured-countdown').textContent).toMatch(/\d/);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map((t) => t.textContent)).toEqual([
            expect.stringContaining('Çerçeveler'),
            expect.stringContaining('Mini Avatarlar'),
            expect.stringContaining('Unvanlar'),
            expect.stringContaining('Özel'),
        ]);
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
        const panel = screen.getByRole('tabpanel');
        expect(within(panel).getByTestId(`shop-card-${F1.id}`)).toBeInTheDocument();
    });

    it('sekme değişir (tıklama ve ok tuşu), filtre sahip olunanları gösterir', async () => {
        renderPage();
        await screen.findByTestId('shop-balance');
        fireEvent.click(screen.getByRole('tab', { name: /Unvanlar/ }));
        const panel = screen.getByRole('tabpanel');
        const card = within(panel).getByTestId(`shop-card-${T1.id}`);
        expect(card).toHaveAccessibleName(/kuşanıldı/);
        expect(probe.location.search).toContain('kategori=title');

        fireEvent.keyDown(screen.getByRole('tab', { name: /Unvanlar/ }), { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: /Özel/ })).toHaveAttribute('aria-selected', 'true');

        fireEvent.click(screen.getByRole('tab', { name: /Çerçeveler/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Sahip olduklarım' }));
        expect(screen.getByText(/henüz senin bir şeyin yok/)).toBeInTheDocument();
    });

    it('satın alma başarılı: onay → kutlama, bakiye ve kart güncellenir, kuşan', async () => {
        shopApi.buy.mockResolvedValue({ wallet: { balance: 500, earned_total: 1500, spent_total: 1000 }, item: item(F1, { owned: true }), tickets: 0 });
        shopApi.equip.mockResolvedValue({ equipped: { frame: F1.id, mini_avatar: null, title: T1.id } });
        renderPage();
        fireEvent.click(await screen.findByTestId(`shop-card-${F1.id}`));
        const drawer = await screen.findByRole('dialog');
        expect(within(drawer).getByTestId('profile-preview')).toBeInTheDocument();
        // canlı önizleme: kendi adın + denenen çerçeve + kuşanılmış unvan
        expect(within(drawer).getAllByText('ayse').length).toBeGreaterThan(0);
        expect(within(drawer).getByTestId('profile-preview').querySelector(`[data-frame="${F1.id}"]`)).not.toBeNull();
        expect(within(drawer).getByTestId('title-pill')).toHaveAttribute('data-title-key', T1.id);

        fireEvent.click(within(drawer).getByRole('button', { name: /Satın al/ }));
        expect(within(drawer).getByTestId('buy-confirm')).toHaveTextContent('Sonra kalan');
        fireEvent.click(within(drawer).getByRole('button', { name: /jetona onayla/ }));

        await waitFor(() => expect(shopApi.buy).toHaveBeenCalledWith(F1.id));
        const celebration = await screen.findByTestId('buy-celebration');
        expect(celebration).toHaveTextContent(F1.name);
        expect(screen.getByTestId('shop-balance')).toHaveTextContent('500');

        fireEvent.click(within(celebration).getByRole('button', { name: /Hemen kuşan/ }));
        await waitFor(() => expect(shopApi.equip).toHaveBeenCalledWith({ frame: F1.id }));
        await waitFor(() => expect(screen.queryByTestId('buy-celebration')).toBeNull());
        expect(auth.updateUser).toHaveBeenCalledWith({ detail: { game_cosmetics: { frame: F1.id, mini_avatar: null, title: T1.id } } });
        expect(screen.getByTestId(`shop-card-${F1.id}`)).toHaveAccessibleName(/kuşanıldı/);
    });

    it('bakiye yetmiyor: onay kapalı, kazanma bağlantıları; sunucu insufficient dönerse mesaj', async () => {
        renderPage();
        fireEvent.click(await screen.findByTestId(`shop-card-${FRAMES[2].id}`));
        const drawer = await screen.findByRole('dialog');
        expect(within(drawer).getByText(/jeton daha gerekiyor/)).toBeInTheDocument();
        expect(within(drawer).getByRole('link', { name: /Koşuda jeton topla/ })).toHaveAttribute('href', '/oyun/kosu');
        expect(within(drawer).getByRole('link', { name: /Kulede yüksel/ })).toHaveAttribute('href', '/oyun/kule');
        fireEvent.click(within(drawer).getByRole('button', { name: /Satın al/ }));
        expect(within(drawer).getByRole('button', { name: /jetona onayla/ })).toBeDisabled();

        // Bakiye yetiyor görünürken sunucu reddederse (başka sekmede harcandı)
        shopApi.buy.mockRejectedValue(axiosError(422, { reason: 'insufficient' }, 'Yeterli jetonun yok.'));
        fireEvent.click(within(drawer).getByRole('button', { name: /Vazgeç/ }));
        act(() => {
            fireEvent.keyDown(document, { key: 'Escape' });
        });
        fireEvent.click(screen.getByTestId(`shop-card-${F1.id}`));
        const d2 = await screen.findByRole('dialog');
        fireEvent.click(within(d2).getByRole('button', { name: /Satın al/ }));
        fireEvent.click(within(d2).getByRole('button', { name: /jetona onayla/ }));
        expect(await within(d2).findByRole('alert')).toHaveTextContent(/Yeterli jetonun yok/);
        expect(screen.queryByTestId('buy-celebration')).toBeNull();
    });

    it('409: zaten sende → kart "Sende" olur, mesaj gösterilir', async () => {
        shopApi.buy.mockRejectedValue(axiosError(409, {}, 'Bu öğe zaten sende.'));
        renderPage();
        fireEvent.click(await screen.findByTestId(`shop-card-${F1.id}`));
        const drawer = await screen.findByRole('dialog');
        fireEvent.click(within(drawer).getByRole('button', { name: /Satın al/ }));
        fireEvent.click(within(drawer).getByRole('button', { name: /jetona onayla/ }));
        expect(await within(drawer).findByRole('alert')).toHaveTextContent('Bu öğe zaten sende.');
        expect(within(drawer).getByRole('button', { name: /Kuşan/ })).toBeInTheDocument();
    });

    it('kuşanılmış unvanı çıkar', async () => {
        shopApi.equip.mockResolvedValue({ equipped: { frame: null, mini_avatar: null, title: null } });
        renderPage(`/oyun/magaza?urun=${encodeURIComponent(T1.id)}`);
        const drawer = await screen.findByRole('dialog');
        fireEvent.click(within(drawer).getByRole('button', { name: /Çıkar/ }));
        await waitFor(() => expect(shopApi.equip).toHaveBeenCalledWith({ title: null }));
        await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Kuşan/ })).toBeInTheDocument());
    });

    it('Mesaj Bileti: çift tıklama tek istek, adet ve bilet sayısı güncellenir', async () => {
        shopApi.get.mockResolvedValue(shopData({ wallet: { balance: 20000, earned_total: 20000, spent_total: 0 } }));
        let resolve;
        shopApi.buy.mockReturnValue(new Promise((r) => { resolve = r; }));
        renderPage(`/oyun/magaza?urun=${encodeURIComponent('ticket:message')}`);
        const drawer = await screen.findByRole('dialog');
        fireEvent.click(within(drawer).getByRole('button', { name: /Satın al/ }));
        const confirm = within(drawer).getByRole('button', { name: /jetona onayla/ });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        expect(shopApi.buy).toHaveBeenCalledTimes(1);
        await act(async () => resolve({ wallet: { balance: 12500, earned_total: 20000, spent_total: 7500 }, item: ticket({ quantity: 1 }), tickets: 1 }));
        expect(await screen.findByTestId('buy-celebration')).toHaveTextContent(/Bilet cüzdanına eklendi/);
        expect(screen.getByTestId('shop-tickets')).toHaveTextContent('1');
    });

    describe('yanıt gelmezse (zaman aşımı / ağ) ikinci bilet körlemesine alınmaz', () => {
        const rich = { wallet: { balance: 20000, earned_total: 20000, spent_total: 0 } };
        const netError = () => Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' });
        const openTicket = async () => {
            renderPage(`/oyun/magaza?urun=${encodeURIComponent('ticket:message')}`);
            const drawer = await screen.findByRole('dialog');
            fireEvent.click(within(drawer).getByRole('button', { name: /Satın al/ }));
            return drawer;
        };
        const confirmBtn = (drawer) => within(drawer).getByRole('button', { name: /jetona onayla|Satın alınıyor/ });

        it('sunucu satın almayı işlemişse: durum yeniden sorulur, kutlama gösterilir, tek satın alma', async () => {
            shopApi.get.mockResolvedValueOnce(shopData(rich));
            let resolveGet;
            shopApi.get.mockReturnValueOnce(new Promise((r) => { resolveGet = r; }));
            shopApi.buy.mockRejectedValue(netError());
            const drawer = await openTicket();
            fireEvent.click(confirmBtn(drawer));
            expect(await within(drawer).findByRole('alert')).toHaveTextContent('Satın alma durumu kontrol ediliyor');
            // Kontrol sürerken düğme kilitli
            expect(confirmBtn(drawer)).toBeDisabled();
            fireEvent.click(confirmBtn(drawer));
            expect(shopApi.buy).toHaveBeenCalledTimes(1);
            await act(async () => resolveGet(shopData({
                wallet: { balance: 12500, earned_total: 20000, spent_total: 7500 },
                categories: shopData().categories.map((c) => (c.key === 'consumable' ? { ...c, items: [ticket({ quantity: 1 })] } : c)),
                tickets: 1,
            })));
            expect(await screen.findByTestId('buy-celebration')).toBeInTheDocument();
            expect(screen.getByTestId('shop-tickets')).toHaveTextContent('1');
            expect(screen.getByTestId('shop-balance')).toHaveTextContent('12.500');
            expect(shopApi.buy).toHaveBeenCalledTimes(1);
            expect(shopApi.get).toHaveBeenCalledTimes(2);
        });

        it('sunucu işlememişse: güncel durum gösterilir, sonraki dokunuş yeniden satın alır', async () => {
            shopApi.get.mockResolvedValue(shopData(rich));
            shopApi.buy.mockRejectedValueOnce(netError());
            const drawer = await openTicket();
            fireEvent.click(confirmBtn(drawer));
            expect(await within(drawer).findByText(/Satın alma tamamlanmadı. Bakiyen ve biletlerin güncellendi/)).toBeInTheDocument();
            expect(screen.queryByTestId('buy-celebration')).toBeNull();
            expect(shopApi.get).toHaveBeenCalledTimes(2);
            shopApi.buy.mockResolvedValueOnce({ wallet: { balance: 12500, earned_total: 20000, spent_total: 7500 }, item: ticket({ quantity: 1 }), tickets: 1 });
            await waitFor(() => expect(confirmBtn(drawer)).not.toBeDisabled());
            fireEvent.click(confirmBtn(drawer));
            expect(await screen.findByTestId('buy-celebration')).toBeInTheDocument();
            expect(shopApi.buy).toHaveBeenCalledTimes(2);
        });

        it('yenileme de başarısızsa: bakiye "doğrulanamadı", sonraki dokunuş satın almadan önce durum sorar', async () => {
            shopApi.get.mockResolvedValueOnce(shopData(rich));
            shopApi.get.mockRejectedValueOnce(netError());
            shopApi.buy.mockRejectedValue(netError());
            const drawer = await openTicket();
            fireEvent.click(confirmBtn(drawer));
            expect(await within(drawer).findByText(/Satın alma durumu doğrulanamadı/)).toBeInTheDocument();
            expect(screen.getByTestId('shop-balance-stale')).toBeInTheDocument();
            shopApi.get.mockResolvedValueOnce(shopData({
                wallet: { balance: 12500, earned_total: 20000, spent_total: 7500 },
                tickets: 1,
            }));
            await waitFor(() => expect(confirmBtn(drawer)).not.toBeDisabled());
            fireEvent.click(confirmBtn(drawer));
            expect(await screen.findByTestId('buy-celebration')).toBeInTheDocument();
            expect(screen.queryByTestId('shop-balance-stale')).toBeNull();
            expect(shopApi.buy).toHaveBeenCalledTimes(1);
            expect(shopApi.get).toHaveBeenCalledTimes(3);
        });
    });

    it('yükleme hatası: Tekrar dene', async () => {
        shopApi.get.mockRejectedValueOnce(axiosError(500, {}, 'Sunucu hatası'));
        renderPage();
        expect(await screen.findByText('Sunucu hatası')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        expect(await screen.findByTestId('shop-balance')).toBeInTheDocument();
        expect(shopApi.get).toHaveBeenCalledTimes(2);
    });

    it('misafir: statik katalog, istek yok, satın almak için giriş', async () => {
        auth.isAuthenticated = false;
        auth.user = null;
        renderPage();
        expect(screen.getByText('Jetonlarını tarzına dönüştür')).toBeInTheDocument();
        expect(screen.getByText('Öne çıkanlar')).toBeInTheDocument();
        expect(shopApi.get).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId(`shop-card-${F1.id}`));
        const drawer = await screen.findByRole('dialog');
        expect(within(drawer).getByRole('link', { name: /Satın almak için giriş yap/ })).toHaveAttribute('href', '/login');
    });
});
