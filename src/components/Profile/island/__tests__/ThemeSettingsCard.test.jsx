// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ overview: vi.fn(), buy: vi.fn(), toggle: vi.fn(), activate: vi.fn() }));
vi.mock('../../../../services/profileThemeApi', () => ({ profileThemeApi: api, default: api }));

// Canlı sahne (islandui ajanının dosyası) burada sahte: test ona bağlı değil.
vi.mock('../IslandPreview', () => ({
    default: ({ avatar, gender, className }) => (
        <div data-testid="island-preview-mock" data-gender={gender} data-hair={avatar?.hair} className={className} />
    ),
}));

import ThemeSettingsCard from '../ThemeSettingsCard';

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const ada = (over = {}) => ({
    key: 'ada', name: 'Ada Profili', price: 1000000, days: 15,
    owned: false, active: false, enabled: false, expires_at: null, unlimited: false, source: null, can_free: false,
    ...over,
});
const overview = (theme, balance = 1500000) => ({ themes: [theme], wallet: { balance } });
const ok = (data) => Promise.resolve(data);
const fail = (status, message, data = {}) => Promise.reject({ response: { status, data: { success: false, message, data } } });
const deferred = () => {
    let resolve; let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const mount = (props = {}) => render(
    <MemoryRouter>
        <ThemeSettingsCard user={{ username: 'ayse', gender: 'female', detail: { game_avatar: { hair: 3 } } }} {...props} />
    </MemoryRouter>
);
const card = () => screen.findByTestId('theme-card');

describe('ThemeSettingsCard', () => {
    beforeEach(() => {
        Object.values(api).forEach((f) => f.mockReset());
        api.overview.mockImplementation(() => ok(overview(ada())));
    });

    it('sahip olmayan: durum, fiyat/gün sunucudan, bakiye, satın al; anahtar kapalı ve pasif', async () => {
        mount();
        expect(screen.getByTestId('theme-loading')).toBeInTheDocument();
        const el = await card();
        expect(screen.getByTestId('theme-status')).toHaveTextContent('Sahip değilsin');
        expect(within(el).getByText('1.000.000')).toBeInTheDocument();
        expect(within(el).getByText('15 gün')).toBeInTheDocument();
        expect(within(el).getByLabelText('Cüzdan: 1.500.000 jeton')).toBeInTheDocument();
        expect(within(el).getByRole('button', { name: /Satın al/ })).toBeInTheDocument();
        const sw = within(el).getByRole('switch');
        expect(sw).toHaveAttribute('aria-checked', 'false');
        expect(sw).toBeDisabled();
        expect(within(el).queryByText(/Ücretsiz ve süresiz/)).toBeNull();
    });

    it('fiyat ve gün sayısı sabit değil: sunucudaki değer gösterilir', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ price: 750000, days: 7 }))));
        mount();
        const el = await card();
        expect(within(el).getByText('750.000')).toBeInTheDocument();
        expect(within(el).getByText('7 gün')).toBeInTheDocument();
    });

    it('aktif tema: kalan gün, bitiş tarihi, "uzat" düğmesi, anahtar açık', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ owned: true, active: true, enabled: true, expires_at: iso(Date.now() + 12 * DAY - 3600000), source: 'purchase' }))));
        mount();
        const el = await card();
        expect(screen.getByTestId('theme-status')).toHaveTextContent('Aktif · kalan 12 gün');
        expect(within(el).getByText(/Bitiş:/)).toBeInTheDocument();
        expect(within(el).getByRole('button', { name: /15 gün uzat/ })).toBeInTheDocument();
        const sw = within(el).getByRole('switch');
        expect(sw).toHaveAttribute('aria-checked', 'true');
        expect(sw).not.toBeDisabled();
    });

    it('süresi dolmuş tema: "Süresi doldu", yeniden satın alınır, anahtar pasif', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ owned: true, active: false, enabled: true, expires_at: iso(Date.now() - DAY) }))));
        mount();
        const el = await card();
        expect(screen.getByTestId('theme-status')).toHaveTextContent('Süresi doldu');
        expect(within(el).getByRole('button', { name: /Satın al/ })).toBeInTheDocument();
        expect(within(el).getByRole('switch')).toBeDisabled();
    });

    it('yönetici (can_free): satın alma yok, ücretsiz etkinleştirir; jeton harcanmaz', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ can_free: true }))));
        api.activate.mockImplementation(() => ok({ theme: ada({ can_free: true, owned: true, active: true, enabled: true, unlimited: true, source: 'admin' }) }));
        const onNotify = vi.fn();
        mount({ onNotify });
        const el = await card();
        expect(within(el).queryByRole('button', { name: /^Satın al/ })).toBeNull();
        expect(within(el).queryByText('Fiyat')).toBeNull();
        fireEvent.click(within(el).getByRole('button', { name: 'Ücretsiz ve süresiz etkinleştir' }));
        await waitFor(() => expect(api.activate).toHaveBeenCalledWith('ada'));
        await waitFor(() => expect(screen.getByTestId('theme-status')).toHaveTextContent('Süresiz (yönetici)'));
        expect(api.buy).not.toHaveBeenCalled();
        expect(onNotify).toHaveBeenCalledWith('Ada Profili ücretsiz ve süresiz etkinleştirildi.', 'success');
        expect(within(el).getByRole('button', { name: 'Süresiz etkin' })).toBeDisabled();
        expect(within(el).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });

    it('ücretsiz etkinleştirme çift dokunuşta tek istek atar ve hatayı bildirir', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ can_free: true }))));
        const d = deferred();
        api.activate.mockImplementation(() => d.promise);
        const onNotify = vi.fn();
        mount({ onNotify });
        const el = await card();
        const btn = within(el).getByRole('button', { name: 'Ücretsiz ve süresiz etkinleştir' });
        fireEvent.click(btn);
        fireEvent.click(btn);
        expect(api.activate).toHaveBeenCalledTimes(1);
        d.reject({ response: { status: 403, data: { message: 'Yasak' } } });
        await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Bu işlem için yetkin yok.', 'error'));
        expect(within(el).getByRole('button', { name: 'Ücretsiz ve süresiz etkinleştir' })).not.toBeDisabled();
    });

    it('süresiz (yönetici verdi) tema sahibi kullanıcıda satın alma düğmesi çıkmaz', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ owned: true, active: true, enabled: true, unlimited: true, source: 'admin' }))));
        mount();
        const el = await card();
        expect(screen.getByTestId('theme-status')).toHaveTextContent('Süresiz (yönetici)');
        expect(within(el).queryByRole('button', { name: /Satın al|uzat/ })).toBeNull();
    });

    it('anahtar iyimser: hemen değişir, başarıda sunucu yanıtı işlenir', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ owned: true, active: true, enabled: true, expires_at: iso(Date.now() + 5 * DAY) }))));
        const d = deferred();
        api.toggle.mockImplementation(() => d.promise);
        const onNotify = vi.fn();
        mount({ onNotify });
        const el = await card();
        const sw = within(el).getByRole('switch');
        fireEvent.click(sw);
        expect(sw).toHaveAttribute('aria-checked', 'false'); // sunucu yanıtı beklenmeden
        expect(api.toggle).toHaveBeenCalledWith('ada', false);
        expect(sw).toBeDisabled(); // istek sürerken ikinci dokunuş yok
        d.resolve({ theme: ada({ owned: true, active: true, enabled: false, expires_at: iso(Date.now() + 5 * DAY) }) });
        await waitFor(() => expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/kapatıldı/), 'success'));
        expect(sw).toHaveAttribute('aria-checked', 'false');
        expect(sw).not.toBeDisabled();
    });

    it('anahtar hata verirse eski değere döner ve Türkçe hata bildirir', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ owned: true, active: true, enabled: false, expires_at: iso(Date.now() + 5 * DAY) }))));
        api.toggle.mockImplementation(() => fail(500, undefined));
        const onNotify = vi.fn();
        mount({ onNotify });
        const el = await card();
        const sw = within(el).getByRole('switch');
        expect(sw).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(sw);
        expect(sw).toHaveAttribute('aria-checked', 'true');
        await waitFor(() => expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/Sunucuda bir sorun/), 'error'));
        expect(sw).toHaveAttribute('aria-checked', 'false');
        expect(api.overview).toHaveBeenCalledTimes(1);
    });

    it('toggle 422 (hak yok): geri alır ve durumu sunucudan tazeler', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ owned: true, active: true, enabled: true, expires_at: iso(Date.now() + 5 * DAY) }))));
        api.toggle.mockImplementation(() => fail(422, 'Önce temayı satın almalısın.', { reason: 'not_entitled' }));
        const onNotify = vi.fn();
        mount({ onNotify });
        const el = await card();
        fireEvent.click(within(el).getByRole('switch'));
        await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Önce temayı satın almalısın.', 'error'));
        await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2));
    });

    it('onNotify yoksa bildirim kartın içinde (role=status / alert) görünür', async () => {
        api.overview.mockImplementation(() => ok(overview(ada({ owned: true, active: true, enabled: true, expires_at: iso(Date.now() + 5 * DAY) }))));
        api.toggle.mockImplementation(() => ok({}));
        mount();
        const el = await card();
        fireEvent.click(within(el).getByRole('switch'));
        const note = await screen.findByTestId('theme-notice');
        expect(note).toHaveAttribute('role', 'status');
        expect(note).toHaveTextContent('kapatıldı');
    });

    it('satın alma akışı: pencere açılır, onaylanınca durum ve bakiye güncellenir', async () => {
        api.buy.mockImplementation(() => ok({
            theme: ada({ owned: true, active: true, enabled: true, source: 'purchase', expires_at: iso(Date.now() + 15 * DAY - 1000) }),
            wallet: { balance: 500000 },
        }));
        const onNotify = vi.fn();
        mount({ onNotify });
        const el = await card();
        fireEvent.click(within(el).getByRole('button', { name: /Satın al/ }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('Ada Profili satın alınsın mı?');
        fireEvent.click(within(dialog).getByRole('button', { name: /1\.000\.000 jetona satın al/ }));
        expect(await screen.findByTestId('theme-celebration')).toBeInTheDocument();
        expect(api.buy).toHaveBeenCalledTimes(1);
        expect(api.buy).toHaveBeenCalledWith('ada');
        expect(onNotify).toHaveBeenCalledWith('Ada Profili senin oldu.', 'success');
        expect(screen.getByTestId('theme-status')).toHaveTextContent('Aktif · kalan 15 gün');
        expect(within(el).getByLabelText('Cüzdan: 500.000 jeton')).toBeInTheDocument();
        expect(within(el).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
        expect(within(el).getByRole('button', { name: /15 gün uzat/ })).toBeInTheDocument();
    });

    it('Önizle: canlı sahne tembel yüklenir; avatar ve cinsiyet iletilir; kapanır', async () => {
        mount();
        const el = await card();
        expect(screen.queryByTestId('theme-preview')).toBeNull();
        const btn = within(el).getByRole('button', { name: 'Önizle' });
        expect(btn).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(btn);
        const live = await screen.findByTestId('island-preview-mock');
        expect(live).toHaveAttribute('data-gender', 'female');
        expect(live).toHaveAttribute('data-hair', '3');
        expect(within(el).getByRole('button', { name: 'Önizlemeyi kapat' })).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(within(el).getByRole('button', { name: 'Önizlemeyi kapat' }));
        expect(screen.queryByTestId('theme-preview')).toBeNull();
    });

    it('overview hatası: Türkçe mesaj ve "Tekrar dene"', async () => {
        api.overview.mockImplementationOnce(() => fail(500, undefined));
        mount();
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/Sunucuda bir sorun/);
        fireEvent.click(within(alert).getByRole('button', { name: 'Tekrar dene' }));
        expect(await card()).toBeInTheDocument();
        expect(api.overview).toHaveBeenCalledTimes(2);
    });

    it('sunucu temayı listelemiyorsa kullanılamıyor notu çıkar', async () => {
        api.overview.mockImplementation(() => ok({ themes: [], wallet: { balance: 0 } }));
        mount();
        expect(await screen.findByText('Profil teması şu an kullanılamıyor.')).toBeInTheDocument();
    });

    it('erişilebilirlik: anahtar ve düğmeler en az 44px dokunma alanı sınıfı taşır', async () => {
        mount();
        const el = await card();
        expect(within(el).getByRole('switch').className).toMatch(/min-h-\[44px\]/);
        expect(within(el).getByRole('button', { name: /Satın al/ }).className).toMatch(/min-h-\[44px\]/);
        expect(within(el).getByRole('button', { name: 'Önizle' }).className).toMatch(/min-h-\[44px\]/);
    });
});
