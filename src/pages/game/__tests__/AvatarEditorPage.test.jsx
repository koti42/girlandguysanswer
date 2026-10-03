// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// CI / yoğun makinede jsdom render'ı yavaşlayabiliyor.
configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = { isAuthenticated: true, user: null, loading: false, setGameAvatar: vi.fn() };
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});
vi.mock('../../../services/avatarApi', () => ({
    avatarApi: { get: vi.fn(), save: vi.fn(), buy: vi.fn() },
}));
vi.mock('../../../services/gameApi', () => ({
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorData: (err) => err?.response?.data?.data ?? null,
    gameErrorMessage: (err, fallback) => err?.response?.data?.message || fallback || 'Hata',
}));
vi.mock('../../../components/game/avatar/viewerLoader', () => ({ loadAvatarViewer: vi.fn() }));

import toast from 'react-hot-toast';
import { avatarApi } from '../../../services/avatarApi';
import { loadAvatarViewer } from '../../../components/game/avatar/viewerLoader';
import AvatarEditorPage from '../AvatarEditorPage';
import { STYLES } from '../../../game/avatar/catalog';

const PRICES = {
    'hair:topuz': 300, 'hair:orgu': 400, 'hair:kivircik': 400, 'hair:mohawk': 900,
    'top:kazak': 500, 'top:forma': 600, 'top:ceket': 800, 'bottom:sort': 300, 'bottom:etek': 300,
    'shoes:bot': 500, 'shoes:neon': 1200, 'acc:bere': 400, 'acc:gunes': 600, 'acc:kulaklik': 700, 'acc:kedi': 900,
    'trail:kalp': 1500, 'trail:yildiz': 1500, 'trail:neon': 2500,
};
const LEVELS = { 'acc:tac': 10, 'trail:gokkusagi': 15 };

function items(owned = []) {
    return Object.entries(STYLES).flatMap(([slot, styles]) =>
        styles.map(({ id }) => {
            const key = `${slot}:${id}`;
            if (PRICES[key]) return { key, slot, style: id, unlock: { type: 'price', jeton: PRICES[key] }, owned: owned.includes(key), unlocked: owned.includes(key) };
            if (LEVELS[key]) return { key, slot, style: id, unlock: { type: 'level', level: LEVELS[key] }, owned: false, unlocked: false };
            return { key, slot, style: id, unlock: { type: 'free' }, owned: false, unlocked: true };
        })
    );
}

const SAVED = {
    v: 1, body: 'kiz', skin: 2,
    hair: { style: 'atkuyrugu', color: 1 }, top: { style: 'hoodie', color: 0 },
    bottom: { style: 'jean', color: 3 }, shoes: { style: 'spor', color: 11 },
    acc: 'none', trail: 'none',
};

const overview = (over = {}) => ({
    avatar: SAVED,
    is_default: false,
    wallet: { balance: 1000, earned_total: 1500, spent_total: 500 },
    items: items(),
    player: { level: 4 },
    ...over,
});

const err = (status, message, data) => Object.assign(new Error(message), { response: { status, data: { message, data } } });

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/oyun/karakter']}>
            <Routes>
                <Route path="/oyun/karakter" element={<AvatarEditorPage />} />
                <Route path="/oyun" element={<div>HUB</div>} />
                <Route path="/login" element={<div>GİRİŞ</div>} />
            </Routes>
        </MemoryRouter>
    );

const loaded = async () => {
    renderPage();
    await screen.findByRole('tablist', { name: 'Karakter parçaları' });
};
const tab = (name) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const saveBtn = () => screen.getByRole('button', { name: /Kaydet/ });
const pick = (label) => fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }));

describe('AvatarEditorPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(auth, {
            isAuthenticated: true,
            loading: false,
            user: { id: 'u1', username: 'ayse', gender: 'female', detail: { game_avatar: SAVED } },
            setGameAvatar: vi.fn(),
        });
        avatarApi.get.mockResolvedValue(overview());
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('misafire giriş çağrısı gösterir, API çağırmaz', () => {
        Object.assign(auth, { isAuthenticated: false, user: null });
        renderPage();
        expect(screen.getByRole('heading', { name: 'Kendi karakterini tasarla' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Giriş yap/ })).toHaveAttribute('href', '/login');
        expect(screen.getByRole('link', { name: 'Üye ol' })).toHaveAttribute('href', '/signup');
        expect(screen.getByRole('link', { name: 'antrenmanda' })).toHaveAttribute('href', '/oyun/kosu');
        expect(avatarApi.get).not.toHaveBeenCalled();
    });

    it('yükler: sekmeler, cüzdan, seviye, 2D önizleme; değişiklik yokken Kaydet pasif', async () => {
        renderPage();
        expect(screen.getByText(/Karakter yükleniyor/)).toBeInTheDocument();
        await screen.findByRole('tablist', { name: 'Karakter parçaları' });
        expect(screen.getAllByRole('tab')).toHaveLength(8);
        expect(tab('Vücut')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('wallet-balance')).toHaveAccessibleName('Cüzdan: 1.000 jeton');
        expect(screen.getByText('Seviye 4')).toBeInTheDocument();
        expect(screen.getByTestId('avatar-preview')).toHaveAttribute('data-mode', '2d');
        expect(loadAvatarViewer).not.toHaveBeenCalled();
        expect(saveBtn()).toBeDisabled();
        expect(screen.getByRole('button', { name: /Geri al/ })).toBeDisabled();
        expect(screen.getByText('Tüm değişiklikler kayıtlı.')).toBeInTheDocument();
        // Vücut seçimi Kız
        expect(screen.getByRole('radio', { name: 'Kız' })).toBeChecked();
    });

    it('sekmeler tıklama ve ok tuşlarıyla değişir; panel sekmeye bağlıdır', async () => {
        await loaded();
        fireEvent.click(tab('Saç'));
        expect(tab('Saç')).toHaveAttribute('aria-selected', 'true');
        const panel = screen.getByRole('tabpanel');
        expect(panel).toHaveAttribute('aria-labelledby', tab('Saç').id);
        expect(within(panel).getByRole('group', { name: 'Saç stili' })).toBeInTheDocument();
        expect(within(panel).getByRole('group', { name: 'Saç rengi' })).toBeInTheDocument();
        expect(within(panel).getByRole('radio', { name: 'At Kuyruğu' })).toBeChecked();
        expect(within(panel).getByRole('radio', { name: 'Koyu kahve' })).toBeChecked();
        // Kilitli öğenin erişilebilir adı nasıl açılacağını söyler.
        expect(within(panel).getByRole('radio', { name: 'Mohawk, kilitli, 900 jetonla açılır.' })).toBeInTheDocument();

        fireEvent.keyDown(tab('Saç'), { key: 'ArrowRight' });
        expect(tab('Üst')).toHaveAttribute('aria-selected', 'true');
        expect(tab('Üst')).toHaveFocus();
        fireEvent.keyDown(tab('Üst'), { key: 'End' });
        expect(tab('Koşu İzi')).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(tab('Koşu İzi'), { key: 'Home' });
        expect(tab('Vücut')).toHaveAttribute('aria-selected', 'true');
    });

    it('ücretsiz seçim ve renk değişikliği Kaydet\'i açar; Geri al eski hale döndürür', async () => {
        await loaded();
        fireEvent.click(tab('Saç'));
        pick('Dalgalı');
        expect(screen.getByRole('radio', { name: 'Dalgalı' })).toBeChecked();
        expect(screen.getByText('Kaydedilmemiş değişikliklerin var.')).toBeInTheDocument();
        expect(saveBtn()).toBeEnabled();
        pick('Mor');
        expect(screen.getByRole('radio', { name: 'Mor' })).toBeChecked();

        fireEvent.click(screen.getByRole('button', { name: /Geri al/ }));
        expect(screen.getByRole('radio', { name: 'At Kuyruğu' })).toBeChecked();
        expect(saveBtn()).toBeDisabled();
        // Aynı değere geri seçmek de "değişiklik yok" sayılır.
        pick('Uzun');
        pick('At Kuyruğu');
        expect(saveBtn()).toBeDisabled();
    });

    it('kaydeder: PUT gövdesi, AuthContext güncellemesi, bildirim; sonra Kaydet yine pasif', async () => {
        await loaded();
        fireEvent.click(tab('Üst'));
        pick('Tişört');
        pick('Yeşil');
        const stored = { ...SAVED, top: { style: 'tisort', color: 6 } };
        avatarApi.save.mockResolvedValue({ avatar: stored });
        fireEvent.click(saveBtn());
        expect(screen.getByRole('button', { name: /Kaydediliyor/ })).toBeDisabled();
        await waitFor(() => expect(auth.setGameAvatar).toHaveBeenCalledWith(stored));
        expect(avatarApi.save).toHaveBeenCalledWith(stored);
        expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/kaydedildi/));
        await waitFor(() => expect(saveBtn()).toBeDisabled());
        expect(screen.getByRole('radio', { name: 'Tişört' })).toBeChecked();
        expect(screen.getByText('Tüm değişiklikler kayıtlı.')).toBeInTheDocument();
    });

    it('kilitli öğe: önizlemede denenir, Kaydet kapalı; satın alma onayı -> jeton düşer -> kaydedilir', async () => {
        await loaded();
        fireEvent.click(tab('Saç'));
        pick('Mohawk');
        const strip = screen.getByTestId('lock-strip');
        expect(strip).toHaveTextContent('Mohawk kilitli. 900 jetonla açılır.');
        expect(saveBtn()).toBeDisabled();
        expect(screen.getByText(/Kilitli parça seçili: Mohawk/)).toBeInTheDocument();
        expect(tab('Saç')).toHaveAccessibleName(/kilitli seçim var/);

        fireEvent.click(within(strip).getByRole('button', { name: /Satın al/ }));
        const dialog = screen.getByRole('dialog', { name: 'Mohawk satın alınsın mı?' });
        expect(within(dialog).getByText('Sonra kalan').nextSibling).toHaveTextContent('100');
        avatarApi.buy.mockResolvedValue({ wallet: { balance: 100, earned_total: 1500, spent_total: 1400 }, owned_keys: ['hair:mohawk'] });
        fireEvent.click(within(dialog).getByRole('button', { name: '900 jetona satın al' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(avatarApi.buy).toHaveBeenCalledWith('hair:mohawk');
        expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Mohawk artık senin/));
        expect(screen.getByTestId('wallet-balance')).toHaveAccessibleName('Cüzdan: 100 jeton');
        expect(screen.queryByTestId('lock-strip')).toBeNull();
        expect(screen.getByRole('radio', { name: 'Mohawk, sende' })).toBeChecked();
        expect(saveBtn()).toBeEnabled();

        avatarApi.save.mockImplementation(async (a) => ({ avatar: a }));
        fireEvent.click(saveBtn());
        await waitFor(() => expect(avatarApi.save).toHaveBeenCalledWith({ ...SAVED, hair: { style: 'mohawk', color: 1 } }));
    });

    it('bakiye yetmezse eksik miktarı söyler, onay düğmesi yerine jeton kazanma bağlantısı', async () => {
        avatarApi.get.mockResolvedValue(overview({ wallet: { balance: 200, earned_total: 200, spent_total: 0 } }));
        await loaded();
        fireEvent.click(tab('Saç'));
        pick('Mohawk');
        fireEvent.click(within(screen.getByTestId('lock-strip')).getByRole('button', { name: /Satın al/ }));
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent('Yeterli jetonun yok: 700 jeton daha gerekiyor.');
        expect(within(dialog).queryByRole('button', { name: /jetona satın al/ })).toBeNull();
        expect(within(dialog).getByRole('link', { name: 'Jeton kazanmaya git' })).toHaveAttribute('href', '/oyun/kosu');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(avatarApi.buy).not.toHaveBeenCalled();
    });

    it('satın alma hatası pencerede gösterilir; 409 (zaten sahip) öğeyi açar', async () => {
        await loaded();
        fireEvent.click(tab('Aksesuar'));
        pick('Kedi Kulağı');
        fireEvent.click(within(screen.getByTestId('lock-strip')).getByRole('button', { name: /Satın al/ }));
        avatarApi.buy.mockRejectedValueOnce(err(422, 'Yeterli jetonun yok.'));
        fireEvent.click(screen.getByRole('button', { name: '900 jetona satın al' }));
        expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Yeterli jetonun yok.');

        avatarApi.buy.mockRejectedValueOnce(err(409, 'Bu öğe zaten sende.'));
        fireEvent.click(screen.getByRole('button', { name: '900 jetona satın al' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(toast.success).toHaveBeenCalledWith('Kedi Kulağı zaten sende.');
        expect(screen.queryByTestId('lock-strip')).toBeNull();
        expect(saveBtn()).toBeEnabled();
    });

    it('seviye kilidinde satın alma yok, gereken seviyeyi söyler', async () => {
        await loaded();
        fireEvent.click(tab('Aksesuar'));
        pick('Taç');
        const strip = screen.getByTestId('lock-strip');
        expect(strip).toHaveTextContent('Taç kilitli. Oyun seviyesi 10 olunca açılır. Şu an seviye 4.');
        expect(within(strip).queryByRole('button')).toBeNull();
        expect(saveBtn()).toBeDisabled();
    });

    it('kaydetme hatasını gösterir; 422 kilitli öğe yanıtı öğeyi kilitler', async () => {
        avatarApi.get.mockResolvedValue(overview({ items: items(['hair:topuz']) }));
        await loaded();
        fireEvent.click(tab('Saç'));
        pick('Topuz, sende');
        avatarApi.save.mockRejectedValueOnce(err(422, 'Saç: Topuz kilitli; mağazadan 300 jetona açabilirsin.', { item: 'hair:topuz' }));
        fireEvent.click(saveBtn());
        expect(await screen.findByRole('alert')).toHaveTextContent('Saç: Topuz kilitli');
        expect(screen.getByTestId('lock-strip')).toHaveTextContent('Topuz kilitli.');
        expect(saveBtn()).toBeDisabled();
        expect(auth.setGameAvatar).not.toHaveBeenCalled();

        // Ağ hatası: genel ileti, seçim korunur.
        pick('Kısa');
        avatarApi.save.mockRejectedValueOnce(Object.assign(new Error('Network'), { response: undefined }));
        fireEvent.click(saveBtn());
        expect(await screen.findByRole('alert')).toHaveTextContent('Karakter kaydedilemedi');
        expect(screen.getByRole('radio', { name: 'Kısa' })).toBeChecked();
    });

    it('yükleme hatası: hata kartı ve Tekrar dene', async () => {
        avatarApi.get.mockRejectedValueOnce(err(500, 'Sunucu hatası'));
        renderPage();
        expect(await screen.findByText('Sunucu hatası')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        await screen.findByRole('tablist');
        expect(avatarApi.get).toHaveBeenCalledTimes(2);
    });

    it('hiç kaydetmemiş kullanıcı: varsayılan karakter değişiklik olmadan da kaydedilebilir', async () => {
        Object.assign(auth.user, { detail: { game_avatar: null } });
        avatarApi.get.mockResolvedValue(overview({ is_default: true }));
        await loaded();
        expect(screen.getByText(/Bu varsayılan karakter/)).toBeInTheDocument();
        expect(saveBtn()).toBeEnabled();
        avatarApi.save.mockImplementation(async (a) => ({ avatar: a }));
        fireEvent.click(saveBtn());
        await waitFor(() => expect(auth.setGameAvatar).toHaveBeenCalledWith(SAVED));
        await waitFor(() => expect(saveBtn()).toBeDisabled());
    });

    it('sunucudaki karakter oturumdakinden farklıysa (başka cihaz) oturumu tazeler', async () => {
        Object.assign(auth.user, { detail: { game_avatar: null } });
        await loaded();
        expect(auth.setGameAvatar).toHaveBeenCalledWith(SAVED);
    });

    it('kaydedilmemiş değişiklikle site içi bağlantıya tıklayınca onay ister', async () => {
        await loaded();
        fireEvent.click(tab('Saç'));
        pick('Uzun');
        window.confirm.mockReturnValueOnce(false);
        fireEvent.click(screen.getByRole('link', { name: /Oyun Merkezi/ }));
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('HUB')).toBeNull();

        window.confirm.mockReturnValueOnce(true);
        fireEvent.click(screen.getByRole('link', { name: /Oyun Merkezi/ }));
        expect(await screen.findByText('HUB')).toBeInTheDocument();
    });

    it('değişiklik yokken bağlantılar onaysız çalışır', async () => {
        await loaded();
        fireEvent.click(screen.getByRole('link', { name: /Oyun Merkezi/ }));
        expect(await screen.findByText('HUB')).toBeInTheDocument();
        expect(window.confirm).not.toHaveBeenCalled();
    });
});
