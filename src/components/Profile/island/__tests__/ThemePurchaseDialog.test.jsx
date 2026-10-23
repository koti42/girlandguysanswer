// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Gerçek istemci kullanılır; yalnız HTTP katmanı sahte (başlıkları doğrulamak için).
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../../../../services/api', () => ({ default: http }));

import ThemePurchaseDialog from '../ThemePurchaseDialog';

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const theme = (over = {}) => ({
    key: 'ada', name: 'Ada Profili', price: 1000000, days: 15,
    owned: false, active: false, enabled: false, expires_at: null, unlimited: false, source: null, can_free: false,
    ...over,
});
const envelope = (data) => Promise.resolve({ data: { success: true, message: 'ok', data } });
const failure = (status, message, data = {}) => Promise.reject({ response: { status, data: { success: false, message, data } } });
const deferred = () => {
    let resolve; let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const mount = (props = {}) => {
    const handlers = { onClose: vi.fn(), onSuccess: vi.fn(), onRefresh: vi.fn() };
    const utils = render(
        <MemoryRouter>
            <ThemePurchaseDialog open theme={theme()} balance={1500000} username="ayse" {...handlers} {...props} />
        </MemoryRouter>
    );
    return { ...utils, ...handlers };
};
const dialog = () => screen.getByRole('dialog');
const buyBtn = () => within(dialog()).getByRole('button', { name: /jetona (satın al|uzat)/ });

describe('ThemePurchaseDialog', () => {
    beforeEach(() => {
        Object.values(http).forEach((f) => f.mockReset());
    });

    it('ne alındığını açıkça anlatır: yalnız web, mobil etkilenmez, N gün, üstüne eklenir; fiyat ve bakiye', () => {
        mount();
        const d = dialog();
        expect(d).toHaveTextContent('Ada Profili satın alınsın mı?');
        expect(d).toHaveTextContent('Yalnızca web profilinde görünür');
        expect(d).toHaveTextContent('mobil uygulamada hiçbir şey değişmez');
        expect(d).toHaveTextContent('15 günlüktür');
        expect(d).toHaveTextContent('üstüne eklenir');
        expect(within(d).getByText('1.000.000')).toBeInTheDocument();
        expect(within(d).getByText('1.500.000')).toBeInTheDocument();
        // Sonra kalan
        expect(within(d).getByText('500.000')).toBeInTheDocument();
        expect(screen.getByTestId('theme-new-expiry')).toHaveTextContent(/Bitiş: \d+ \p{L}+ \d{4}/u);
        expect(buyBtn()).toHaveTextContent('1.000.000 jetona satın al');
    });

    it('süresi dolmadan alınırsa "uzat" der ve yeni bitişi mevcut bitişin üstüne hesaplar', () => {
        const exp = Date.now() + 5 * DAY;
        mount({ theme: theme({ owned: true, active: true, enabled: true, expires_at: iso(exp) }) });
        expect(dialog()).toHaveTextContent('Ada Profili süresi uzatılsın mı?');
        expect(buyBtn()).toHaveTextContent('1.000.000 jetona uzat');
        const label = screen.getByTestId('theme-new-expiry');
        expect(label).toHaveTextContent('Yeni bitiş:');
        expect(label.textContent).toContain(new Date(exp + 15 * DAY).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }));
    });

    it('bakiye yetmiyorsa onay düğmesi yok; eksik miktar ve /oyun bağlantısı var', () => {
        mount({ balance: 250000 });
        const d = dialog();
        expect(screen.getByTestId('theme-insufficient')).toHaveTextContent('Yeterli jetonun yok');
        expect(screen.getByTestId('theme-insufficient')).toHaveTextContent('750.000');
        expect(within(d).queryByRole('button', { name: /jetona/ })).toBeNull();
        expect(within(d).queryByText('Sonra kalan')).toBeNull();
        expect(within(d).getByRole('link', { name: 'Jeton kazanmaya git' })).toHaveAttribute('href', '/oyun');
        expect(http.post).not.toHaveBeenCalled();
    });

    it('onay: taze Idempotency-Key ile POST atar; başarıda kutlama gösterir ve onSuccess çağırır', async () => {
        const res = { theme: theme({ owned: true, active: true, enabled: true, source: 'purchase', expires_at: iso(Date.now() + 15 * DAY) }), wallet: { balance: 500000 } };
        http.post.mockImplementation(() => envelope(res));
        const { onSuccess } = mount();
        fireEvent.click(buyBtn());
        expect(await screen.findByTestId('theme-celebration')).toBeInTheDocument();
        expect(http.post).toHaveBeenCalledTimes(1);
        const [url, body, config] = http.post.mock.calls[0];
        expect(url).toBe('/game/themes/ada/buy');
        expect(body).toEqual({});
        expect(config.headers['Idempotency-Key']).toEqual(expect.any(String));
        expect(config.headers['Idempotency-Key'].length).toBeGreaterThan(8);
        expect(onSuccess).toHaveBeenCalledWith(res);
        expect(dialog()).toHaveTextContent('Senin oldu!');
        expect(dialog()).toHaveTextContent('tarihine kadar geçerli');
        expect(within(dialog()).getByRole('link', { name: /Profilimi gör/ })).toHaveAttribute('href', '/profile/ayse');
    });

    it('çift dokunma güvenli: istek sürerken ikinci tıklama yeni istek atmaz', async () => {
        const d = deferred();
        http.post.mockImplementation(() => d.promise);
        mount();
        const btn = buyBtn();
        fireEvent.click(btn);
        fireEvent.click(btn);
        fireEvent.click(btn);
        expect(http.post).toHaveBeenCalledTimes(1);
        expect(btn).toBeDisabled();
        expect(btn).toHaveTextContent('İşleniyor…');
        expect(within(dialog()).getByRole('button', { name: 'Vazgeç' })).toBeDisabled();
        d.resolve({ data: { data: { theme: theme({ owned: true, active: true, enabled: true, expires_at: iso(Date.now() + 15 * DAY) }), wallet: { balance: 1 } } } });
        await screen.findByTestId('theme-celebration');
        expect(http.post).toHaveBeenCalledTimes(1);
    });

    it('sunucu "yetersiz" derse (bakiye bu arada değişti) açıklayıcı hata ve /oyun yönlendirmesi', async () => {
        http.post.mockImplementation(() => failure(422, 'Yetersiz bakiye', { reason: 'insufficient', balance: 400000, price: 1000000 }));
        mount();
        fireEvent.click(buyBtn());
        expect(await screen.findByTestId('theme-error')).toHaveTextContent('Yeterli jetonun yok: bakiyen 400.000, gereken 1.000.000 jeton.');
        const d = dialog();
        expect(within(d).queryByRole('button', { name: /jetona/ })).toBeNull();
        expect(within(d).getByRole('link', { name: 'Jeton kazanmaya git' })).toBeInTheDocument();
        expect(within(d).getByText('400.000')).toBeInTheDocument(); // güncel bakiye
    });

    it('"süresiz" (409): ücret alınmadığını söyler, pencere açık kalır, durum tazelenir', async () => {
        http.post.mockImplementation(() => failure(409, 'Zaten süresiz', { reason: 'unlimited' }));
        const { onRefresh, onSuccess, onClose } = mount();
        fireEvent.click(buyBtn());
        expect(await screen.findByTestId('theme-error')).toHaveTextContent('zaten süresiz; ek ücret ödemene gerek yok');
        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.queryByTestId('theme-celebration')).toBeNull();
    });

    it('sunucu hatasında Türkçe metin; tekrar denenebilir ve her denemede farklı anahtar gider', async () => {
        http.post.mockImplementationOnce(() => failure(500, undefined));
        http.post.mockImplementationOnce(() => envelope({ theme: theme({ owned: true, active: true, enabled: true, expires_at: iso(Date.now() + 15 * DAY) }), wallet: { balance: 5 } }));
        mount();
        fireEvent.click(buyBtn());
        expect(await screen.findByTestId('theme-error')).toHaveTextContent('Sunucuda bir sorun oluştu');
        await waitFor(() => expect(buyBtn()).not.toBeDisabled());
        fireEvent.click(buyBtn());
        await screen.findByTestId('theme-celebration');
        expect(http.post).toHaveBeenCalledTimes(2);
        const k1 = http.post.mock.calls[0][2].headers['Idempotency-Key'];
        const k2 = http.post.mock.calls[1][2].headers['Idempotency-Key'];
        expect(k1).not.toBe(k2);
    });

    it('sunucunun 422 metni (ör. süre üst sınırı) olduğu gibi gösterilir', async () => {
        http.post.mockImplementation(() => failure(422, 'En fazla 365 gün biriktirebilirsin.', { reason: 'max_stack' }));
        mount();
        fireEvent.click(buyBtn());
        expect(await screen.findByTestId('theme-error')).toHaveTextContent('En fazla 365 gün biriktirebilirsin.');
    });

    it('ağ hatası: bağlantı mesajı', async () => {
        http.post.mockImplementation(() => Promise.reject(new Error('Network Error')));
        mount();
        fireEvent.click(buyBtn());
        expect(await screen.findByTestId('theme-error')).toHaveTextContent('Sunucuya ulaşılamadı');
    });

    it('Vazgeç ve Esc pencereyi kapatır; kapat düğmesi 44px dokunma alanı taşır', () => {
        const { onClose } = mount();
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Vazgeç' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
        expect(within(dialog()).getByRole('button', { name: 'Kapat' }).className).toMatch(/h-11 w-11/);
        expect(buyBtn().className).toMatch(/min-h-\[48px\]/);
    });

    it('yeniden açılınca temiz başlar (eski hata ve kutlama kalmaz)', async () => {
        http.post.mockImplementation(() => failure(500, undefined));
        const handlers = { onClose: vi.fn(), onSuccess: vi.fn(), onRefresh: vi.fn() };
        const ui = (open) => (
            <MemoryRouter><ThemePurchaseDialog open={open} theme={theme()} balance={1500000} {...handlers} /></MemoryRouter>
        );
        const { rerender } = render(ui(true));
        fireEvent.click(buyBtn());
        await screen.findByTestId('theme-error');
        rerender(ui(false));
        expect(screen.queryByRole('dialog')).toBeNull();
        rerender(ui(true));
        expect(screen.queryByTestId('theme-error')).toBeNull();
        expect(buyBtn()).not.toBeDisabled();
    });
});
