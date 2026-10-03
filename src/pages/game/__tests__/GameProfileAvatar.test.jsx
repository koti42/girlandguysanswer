// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, render, screen, within } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = { isAuthenticated: true, user: { username: 'ayse' }, loading: false };
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../../services/gameApi', () => ({
    gameApi: { profile: vi.fn(), overview: vi.fn() },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (_err, fallback) => fallback || 'Hata',
}));
vi.mock('../../../components/game/avatar/viewerLoader', () => ({ loadAvatarViewer: vi.fn() }));

import { gameApi } from '../../../services/gameApi';
import GameProfilePage from '../GameProfilePage';

const AVATAR = {
    v: 1, body: 'kiz', skin: 1,
    hair: { style: 'topuz', color: 4 }, top: { style: 'kazak', color: 2 },
    bottom: { style: 'etek', color: 1 }, shoes: { style: 'bot', color: 10 },
    acc: 'kedi', trail: 'none',
};

const PLAYER = { level: 6, xp: 900, level_progress: { percent: 40, next_level_xp: 1200 }, league: null, daily_streak: 0, weekly_score: 0 };

const renderPage = (username) =>
    render(
        <MemoryRouter initialEntries={[`/oyun/profil/${username}`]}>
            <Routes>
                <Route path="/oyun/profil/:username" element={<GameProfilePage />} />
            </Routes>
        </MemoryRouter>
    );

describe('GameProfilePage — karakter kartı', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gameApi.overview.mockResolvedValue({ badges: [] });
    });

    it('kayıtlı karakteri gösterir; başkasının profilinde Düzenle yok', async () => {
        gameApi.profile.mockResolvedValue({ user: { username: 'mert', gender: 'male' }, game_avatar: AVATAR, player: PLAYER, badges: [], recent: [] });
        renderPage('mert');
        const card = await screen.findByTestId('game-avatar-card');
        expect(within(card).getByRole('img', { name: 'mert adlı oyuncunun karakteri' })).toBeInTheDocument();
        expect(within(card).getByText('Topuz')).toBeInTheDocument();
        expect(within(card).getByText('Kedi Kulağı')).toBeInTheDocument();
        expect(within(card).queryByRole('link', { name: /Düzenle/ })).toBeNull();
        // Oyuncu profilindeyiz: kendine bağlantı yok.
        expect(within(card).queryByRole('link', { name: /Oyun profili/ })).toBeNull();
    });

    it('başkasının karakteri yoksa kart gizli', async () => {
        gameApi.profile.mockResolvedValue({ user: { username: 'mert' }, game_avatar: null, player: PLAYER, badges: [], recent: [] });
        renderPage('mert');
        await screen.findByText('Rozetler', { exact: false });
        expect(screen.queryByTestId('game-avatar-card')).toBeNull();
    });

    it('kendi profilinde: kayıtlıysa Düzenle, değilse Karakterini oluştur', async () => {
        gameApi.profile.mockResolvedValue({ user: { username: 'ayse', gender: 'female' }, game_avatar: AVATAR, player: PLAYER, badges: [], recent: [] });
        const { unmount } = renderPage('ayse');
        const card = await screen.findByTestId('game-avatar-card');
        expect(within(card).getByRole('link', { name: /Düzenle/ })).toHaveAttribute('href', '/oyun/karakter');
        unmount();

        gameApi.profile.mockResolvedValue({ user: { username: 'ayse', gender: 'female' }, game_avatar: null, player: PLAYER, badges: [], recent: [] });
        renderPage('ayse');
        const cta = await screen.findByTestId('game-avatar-card');
        expect(within(cta).getByRole('link', { name: /Karakterini oluştur/ })).toHaveAttribute('href', '/oyun/karakter');
    });
});
