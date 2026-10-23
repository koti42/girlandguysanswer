// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

const auth = { isAuthenticated: true, user: { username: 'ayse' }, loading: false };
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../../services/gameApi', () => ({
    gameApi: { profile: vi.fn(), overview: vi.fn() },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (_err, fallback) => fallback || 'Hata',
}));
vi.mock('../../../components/game/avatar/viewerLoader', () => ({ loadAvatarViewer: vi.fn() }));

import { LuAward, LuCompass } from 'react-icons/lu';
import { badgeIcon } from '../../../components/game/gameIcons';
import { gameApi } from '../../../services/gameApi';
import GameProfilePage from '../GameProfilePage';

const PLAYER = { level: 6, xp: 900, level_progress: { percent: 40, next_level_xp: 1200 }, league: null, daily_streak: 0, weekly_score: 0 };

const renderPage = (username) =>
    render(
        <MemoryRouter initialEntries={[`/oyun/profil/${username}`]}>
            <Routes>
                <Route path="/oyun/profil/:username" element={<GameProfilePage />} />
            </Routes>
        </MemoryRouter>
    );

const CATALOG = [
    { key: 'runner_5k', name: 'Koşucu', description: '5 bin metre', icon: 'footprints' },
    { key: 'kesif_ilk_adim', name: 'İlk Keşif', description: 'Keşif’te bir dünyada en az 5 dakika oyna', icon: 'compass', group: 'kesif' },
    { key: 'kesif_bolge_1', name: 'Vadi Kâşifi', description: '1. bölgenin ödülünü al', icon: 'mountain', group: 'kesif' },
];

describe('GameProfilePage — Keşif rozetleri bölümü', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('group:"kesif" rozetleri ayrı "Keşif Rozetleri" bölümünde, kendi sayacıyla; ana liste onları saymaz', async () => {
        gameApi.overview.mockResolvedValue({ badges: CATALOG });
        gameApi.profile.mockResolvedValue({
            user: { username: 'mert' },
            player: PLAYER,
            badges: [{ key: 'kesif_ilk_adim', earned_at: '2026-10-20T10:00:00Z' }, { key: 'runner_5k', earned_at: '2026-10-01T10:00:00Z' }],
            recent: [],
        });
        renderPage('mert');
        const section = await screen.findByTestId('game-profile-kesif-badges');
        expect(within(section).getByRole('heading', { name: /Keşif Rozetleri/ })).toHaveTextContent('(1/2)');
        expect(within(section).getByText('İlk Keşif')).toBeInTheDocument();
        expect(within(section).getByText('Vadi Kâşifi')).toBeInTheDocument();
        expect(within(section).queryByText('Koşucu')).toBeNull();
        const main = screen.getByRole('heading', { name: /^Rozetler/ });
        expect(main).toHaveTextContent('(1/1)');
        expect(screen.getAllByText('Koşucu')).toHaveLength(1);
    });

    it('eski sunucu (group alanı yok): tek rozet listesi, Keşif bölümü çizilmez', async () => {
        gameApi.overview.mockResolvedValue({ badges: CATALOG.map(({ group: _g, ...b }) => b) });
        gameApi.profile.mockResolvedValue({ user: { username: 'mert' }, player: PLAYER, badges: [{ key: 'runner_5k', earned_at: '2026-10-01T10:00:00Z' }], recent: [] });
        renderPage('mert');
        const main = await screen.findByRole('heading', { name: /^Rozetler/ });
        expect(main).toHaveTextContent('(1/3)');
        expect(screen.queryByTestId('game-profile-kesif-badges')).toBeNull();
    });

    it('profil rozet adı olarak Keşif rozetleri çizelge dışında ikon yedeğiyle de çizilir (bilinmeyen ikon çökmez)', async () => {
        gameApi.overview.mockResolvedValue({ badges: [{ key: 'kesif_x', name: 'Yeni', description: 'd', icon: 'bilinmeyen-ikon', group: 'kesif' }] });
        gameApi.profile.mockResolvedValue({ user: { username: 'mert' }, player: PLAYER, badges: [], recent: [] });
        renderPage('mert');
        const section = await screen.findByTestId('game-profile-kesif-badges');
        expect(within(section).getByText('Yeni')).toBeInTheDocument();
    });
});

describe('Keşif rozet ikonları', () => {
    it('18 Keşif rozetinin ikonu beyaz listede (compass dahil); bilinmeyen ad Ödül ikonuna düşer', () => {
        const icons = ['compass', 'globe', 'mountain', 'leaf', 'flame', 'rocket', 'gem', 'footprints', 'medal', 'crown', 'bike', 'trophy', 'cpu', 'sparkles', 'star', 'building', 'heart', 'map'];
        expect(badgeIcon('compass')).toBe(LuCompass);
        for (const name of icons) expect(badgeIcon(name), name).not.toBe(LuAward);
        expect(badgeIcon('bilinmeyen-ikon')).toBe(LuAward);
        expect(badgeIcon('constructor')).toBe(LuAward);
    });
});
