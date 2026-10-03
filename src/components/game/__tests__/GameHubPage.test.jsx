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

import { gameApi } from '../../../services/gameApi';
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

        // Yeni 3D koşu kartı misafirde de kilitsiz: antrenmana götürür.
        const runner = screen.getByRole('link', { name: /Herkesler Koşuyor/ });
        expect(runner).toHaveAttribute('href', '/oyun/kosu');
        expect(within(runner).getByText('Yeni · 3D')).toBeInTheDocument();
        expect(within(runner).getByText('Antrenmana başla')).toBeInTheDocument();

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
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse' } });
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
    });

    it('GameNav 7 sekme içerir, Koşu sekmesi lobiye gider; dar ekran kısa etiketi erişilebilir adı bozmaz', async () => {
        gameApi.categories.mockResolvedValue({ categories: [] });
        renderHub();
        const nav = screen.getByRole('navigation', { name: 'Oyun Merkezi bölümleri' });
        const links = within(nav).getAllByRole('link');
        expect(links).toHaveLength(7);
        expect(within(nav).getByRole('link', { name: 'Koşu' })).toHaveAttribute('href', '/oyun/kosu');
        expect(within(nav).getByRole('link', { name: 'Liderlik' })).toHaveAttribute('href', '/oyun/liderlik');
        expect(within(nav).getByRole('link', { name: 'Merkez' })).toHaveAttribute('aria-current', 'page');
    });
});
