// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, configure } from '@testing-library/react';

// CI / yoğun makinede jsdom render'ı yavaşlayabiliyor; varsayılan 1 sn / 5 sn
// sınırları kararsız sonuç veriyordu.
configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter } from 'react-router-dom';

const auth = { isAuthenticated: false, user: null, loading: false };
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../../services/gameApi', () => ({
    gameApi: {
        categories: vi.fn(),
        overview: vi.fn(),
        leaderboard: vi.fn(),
    },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (_err, fallback) => fallback || 'Hata',
}));

vi.mock('../../../services/shopApi', () => ({ shopApi: { get: vi.fn() } }));

import { gameApi } from '../../../services/gameApi';
import { shopApi } from '../../../services/shopApi';
import GameHubPage from '../../../pages/game/GameHubPage';

const CATEGORIES = [
    { id: 1, slug: 'tarih', name: 'Tarih', icon: 'landmark', color: '#F59E0B', question_count: 120 },
    { id: 2, slug: 'bilim', name: 'Bilim', icon: 'atom', color: '#3B82F6', question_count: 80 },
];

const renderHub = () =>
    render(
        <MemoryRouter initialEntries={['/oyun']}>
            <GameHubPage />
        </MemoryRouter>
    );

describe('GameHubPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(gameApi).forEach((fn) => fn.mockReset());
        shopApi.get.mockReset();
        Object.assign(auth, { isAuthenticated: false, user: null, loading: false });
    });

    it('giriş yapmamış ziyaretçiye hub\'ı ve giriş/üye ol çağrısını gösterir', async () => {
        gameApi.categories.mockResolvedValue({ categories: CATEGORIES });
        renderHub();

        expect(screen.getByRole('heading', { name: 'Oyun Merkezi' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Giriş yap ve oyna' })).toHaveAttribute('href', '/login');
        expect(screen.getByRole('link', { name: 'Üye ol' })).toHaveAttribute('href', '/signup');

        // Herkese açık kategoriler yüklenir
        expect(await screen.findByText('Tarih')).toBeInTheDocument();
        expect(screen.getByText('Bilim')).toBeInTheDocument();

        // Mod kartları kilitli: girişe götürür
        const locked = screen.getAllByText('Giriş yap ve oyna');
        expect(locked.length).toBeGreaterThan(1);
        expect(screen.getByText('Bilgi Arenası').closest('a')).toHaveAttribute('href', '/login');

        // 3D oyun kartları misafirde de kilitsiz: antrenmana götürür.
        const runner = screen.getByRole('link', { name: /Herkesler Koşuyor 2\.0/ });
        expect(runner).toHaveAttribute('href', '/oyun/kosu');
        expect(within(runner).getByText('2.0 · Yeni')).toBeInTheDocument();
        expect(within(runner).getByText('Antrenmana başla')).toBeInTheDocument();
        const tower = screen.getByRole('link', { name: /Herkesler Yükseliyor/ });
        expect(tower).toHaveAttribute('href', '/oyun/kule');
        expect(within(tower).getByText('Antrenmana başla')).toBeInTheDocument();
        // Üçüncü 3D oyun (Keşif): misafire de açık, iki sütunu kaplayan geniş kart.
        const kesif = screen.getByRole('link', { name: /Herkesler Keşfediyor/ });
        expect(kesif).toHaveAttribute('href', '/oyun/kesif');
        expect(kesif).toHaveClass('lg:col-span-2');
        expect(within(kesif).getByText('Keşfetmeye başla')).toBeInTheDocument();

        // Mağaza (sabit vitrin ürünü) ve Karakterim kartları misafire de görünür.
        const shop = screen.getByRole('link', { name: /^Mağaza:/ });
        expect(shop).toHaveAttribute('href', '/oyun/magaza');
        expect(within(shop).getByText('Yıldız Tozu')).toBeInTheDocument();
        expect(within(shop).getAllByTestId('shop-art').length).toBeGreaterThan(0);
        expect(screen.getByRole('link', { name: /^Karakterim:/ })).toHaveAttribute('href', '/oyun/karakter');
        expect(shopApi.get).not.toHaveBeenCalled();

        // Auth isteyen uçlar çağrılmaz
        expect(gameApi.overview).not.toHaveBeenCalled();
        expect(gameApi.leaderboard).not.toHaveBeenCalled();
    });

    it('kategoriler yüklenemezse sayfa çökmez, tekrar dene sunar', async () => {
        gameApi.categories.mockRejectedValue(new Error('ağ'));
        renderHub();
        expect(await screen.findByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Üye ol' })).toBeInTheDocument();
    });

    it('giriş yapmış oyuncuya oyuncu kartı, günlük durum ve bekleyen davetleri gösterir', async () => {
        Object.assign(auth, {
            isAuthenticated: true,
            user: {
                id: 'u1',
                username: 'ayse',
                gender: 'female',
                detail: { game_avatar: { v: 1, body: 'kiz', skin: 1, hair: { style: 'mohawk', color: 2 }, top: { style: 'hoodie', color: 0 }, bottom: { style: 'jean', color: 0 }, shoes: { style: 'spor', color: 0 }, acc: 'none', trail: 'none' } },
            },
        });
        shopApi.get.mockResolvedValue({
            wallet: { balance: 4321, earned_total: 5000, spent_total: 679 },
            featured: [
                { key: 'hair:topuz', category: 'avatar_part', name: 'Topuz', price: 300 },
                { key: 'mini:ejderha', category: 'mini_avatar', name: 'Ejderha', price: 9000, rarity: 'legendary' },
            ],
            categories: [],
            equipped: {},
            tickets: 0,
        });
        gameApi.overview.mockResolvedValue({
            player: {
                xp: 1240,
                level: 5,
                level_progress: { current_level_xp: 1000, next_level_xp: 1500, percent: 48 },
                weekly_score: 2350,
                league: { key: 'gumus', name: 'Gümüş' },
                total_games: 31,
                accuracy: 70,
                best_arena_score: 2140,
                daily_streak: 4,
                duel_wins: 6,
                duel_losses: 3,
                duel_draws: 1,
            },
            daily: { played_today: true, streak: 4, session_id: 'd1' },
            dilemma_today: { id: 7, option_a: 'Deniz', option_b: 'Dağ', my_vote: null, results: null },
            pending_duels: 2,
            categories: CATEGORIES,
            badges: [{ key: 'first_game', name: 'İlk Adım', description: 'İlk oyununu tamamla', icon: 'footprints', earned_at: '2026-09-01T10:00:00Z' }],
        });
        gameApi.leaderboard.mockResolvedValue({ period: 'weekly', entries: [], me: { rank: null, score: 0 } });
        renderHub();

        expect(await screen.findByText('ayse')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Seviye ilerlemesi' })).toHaveAttribute('aria-valuenow', '48');
        expect(screen.getAllByText('Gümüş').length).toBeGreaterThan(0);
        expect(screen.getByText(/Bugün tamam!/)).toBeInTheDocument();
        expect(screen.getByText('2 davet')).toBeInTheDocument();
        expect(screen.getByText('Deniz')).toBeInTheDocument();
        expect(screen.getByText('İlk Adım')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Üye ol' })).toBeNull();
        expect(screen.getByRole('link', { name: /Herkesler Koşuyor/ })).toHaveAttribute('href', '/oyun/kosu');
        expect(screen.getByRole('link', { name: /Herkesler Yükseliyor/ })).toHaveAttribute('href', '/oyun/kule');

        // Mağaza kartı: bakiye + vitrinin ilk çizilebilir ürünü (karakter parçası atlanır).
        const shop = await screen.findByRole('link', { name: /Cüzdanında 4321 jeton var/ });
        expect(within(shop).getByText(/Vitrinde:/)).toHaveTextContent('Ejderha');
        expect(screen.getByRole('link', { name: /^Karakterim:.*Karakteri düzenle/ })).toHaveAttribute('href', '/oyun/karakter');
    });

    it('mağaza isteği düşerse kart sabit vitrinle çizilir, hub çalışır', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse' } });
        gameApi.overview.mockResolvedValue({ player: { level: 1 }, daily: {}, categories: [], badges: [] });
        gameApi.leaderboard.mockResolvedValue({ entries: [], me: null });
        shopApi.get.mockRejectedValue(new Error('ağ'));
        renderHub();
        const shop = await screen.findByRole('link', { name: /^Mağaza:/ });
        expect(within(shop).getByText('Yıldız Tozu')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^Karakterim:.*Karakterini oluştur/ })).toBeInTheDocument();
    });

    it('GameNav 11 sekme içerir (Koşu, Kule, PROTOCOL: ZERO, Mağaza, Karakter dahil); dar ekran kısa etiketi erişilebilir adı bozmaz', async () => {
        gameApi.categories.mockResolvedValue({ categories: [] });
        renderHub();
        const nav = screen.getByRole('navigation', { name: 'Oyun Merkezi bölümleri' });
        const links = within(nav).getAllByRole('link');
        expect(links).toHaveLength(11);
        expect(within(nav).getByRole('link', { name: 'Koşu' })).toHaveAttribute('href', '/oyun/kosu');
        expect(within(nav).getByRole('link', { name: 'Kule' })).toHaveAttribute('href', '/oyun/kule');
        expect(within(nav).getByRole('link', { name: 'PROTOCOL: ZERO' })).toHaveAttribute('href', '/oyun/protocol-zero');
        expect(within(nav).getByRole('link', { name: 'Mağaza' })).toHaveAttribute('href', '/oyun/magaza');
        expect(within(nav).getByRole('link', { name: 'Karakter' })).toHaveAttribute('href', '/oyun/karakter');
        expect(within(nav).getByRole('link', { name: 'Liderlik' })).toHaveAttribute('href', '/oyun/liderlik');
        expect(within(nav).getByRole('link', { name: 'Merkez' })).toHaveAttribute('aria-current', 'page');
    });
});
