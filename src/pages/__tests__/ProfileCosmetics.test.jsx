// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

/*
 * Profil kozmetikleri (F.1/F.5): site profilinde çerçeveli fotoğraf + mini
 * avatar + unvan, oyun profilinde "Profil görünümü", mesajları kapalı
 * kişide "Mesaj Bileti" düğmesi.
 */

const auth = { user: null, updateUser: vi.fn(), permissions: {}, canModerate: false, isAuthenticated: true };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../services/api', () => ({
    usersAPI: { getProfile: vi.fn(), getUserAnswers: vi.fn(), getFollowers: vi.fn(), getFollowing: vi.fn() },
    questionsAPI: { getMyQuestions: vi.fn() },
    opinionsAPI: { getAll: vi.fn() },
}));
vi.mock('../../services/gameApi', () => ({
    gameApi: { profile: vi.fn(), overview: vi.fn() },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorData: (err) => err?.response?.data?.data ?? null,
    gameErrorMessage: (_err, fallback) => fallback || 'Hata',
}));
vi.mock('../../services/shopApi', () => ({ shopApi: { checkMessageTicket: vi.fn(), sendTicketMessage: vi.fn() } }));
const { stub } = vi.hoisted(() => ({ stub: (name) => ({ default: () => <div data-testid={name} /> }) }));
vi.mock('../../components/ProfileCover', () => stub('cover'));
vi.mock('../../components/ProfileAvatar', () => stub('photo'));
vi.mock('../../components/Toast', () => stub('toast'));
vi.mock('../ErrorPage', () => ({ default: ({ title }) => <div>{title}</div> }));
vi.mock('../../components/Profile/BlockedUserView', () => ({ default: () => null }));
vi.mock('../../components/Profile/ProfileTabs', () => stub('tabs'));
vi.mock('../../components/Profile/ProfileTabContent', () => stub('tab-content'));
vi.mock('../../components/Moderation/ModerationActionsPanel', () => stub('moderation'));
vi.mock('../../components/AccountStatusBanner', () => stub('status'));
vi.mock('../../components/ProfileBadges', () => stub('badges'));
vi.mock('../../components/SEO', () => ({ default: () => null }));
vi.mock('../../components/game/avatar/AvatarCard', () => stub('avatar-card'));
vi.mock('../../utils/userColor', () => ({
    getThemeStyles: () => ({ shellBg: '#fff', accentColor: '#ff6b6b' }),
    getViewerPrefs: () => ({}),
    getProfileColor: () => '#ff6b6b',
}));

import { questionsAPI, usersAPI } from '../../services/api';
import { gameApi } from '../../services/gameApi';
import { shopApi } from '../../services/shopApi';
import ProfilePage from '../ProfilePage';
import GameProfilePage from '../game/GameProfilePage';
import { FRAMES, MINIS, TITLES } from '../../game/shop';

const COS = { frame: FRAMES[1].id, mini_avatar: MINIS[2].id, title: TITLES[0].id };

const profile = (username, extra = {}) => ({
    data: { data: { id: `id-${username}`, username, gender: 'male', badges: [], stats: {}, ...extra } },
});

const renderProfile = (username) =>
    render(
        <MemoryRouter initialEntries={[`/profile/${username}`]}>
            <Routes>
                <Route path="/profile/:username" element={<ProfilePage />} />
            </Routes>
        </MemoryRouter>
    );

describe('Site profili — mağaza kozmetikleri', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        auth.user = { id: 'id-ayse', username: 'ayse', gender: 'female', detail: { game_cosmetics: null } };
        usersAPI.getUserAnswers.mockResolvedValue({ data: { data: { answers: [], count: 0 } } });
        questionsAPI.getMyQuestions.mockResolvedValue({ data: { data: { questions: [], count: 0 } } });
    });

    it('çerçeve fotoğrafı sarar, mini avatar adın yanında, unvan altında', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', { cosmetics: COS }));
        renderProfile('mert');
        const frame = await screen.findByTestId('profile-frame');
        expect(frame).toHaveAttribute('data-frame', COS.frame);
        expect(within(frame).getByTestId('photo')).toBeInTheDocument(); // fotoğraf çerçevenin içinde
        expect(within(frame).getByRole('img', { name: `${FRAMES[1].name} çerçevesi` })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: `Mini avatar: ${MINIS[2].name}` })).toBeInTheDocument();
        const pill = screen.getByTestId('title-pill');
        expect(pill).toHaveTextContent(TITLES[0].style.text);
        expect(pill).toHaveAttribute('data-title-key', TITLES[0].id);
    });

    it('kozmetik yoksa düzen değişmez; bilinmeyen anahtarlar çizilmez', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', { cosmetics: { frame: 'frame:yok', mini_avatar: TITLES[0].id, title: null } }));
        renderProfile('mert');
        expect(await screen.findByTestId('photo')).toBeInTheDocument();
        expect(screen.queryByTestId('profile-frame')).toBeNull();
        expect(screen.queryByRole('img', { name: /Mini avatar/ })).toBeNull();
        expect(screen.queryByTestId('title-pill')).toBeNull();
    });

    it('kendi profilinde sunucu alanı yoksa oturumdaki kozmetikler', async () => {
        auth.user = { ...auth.user, detail: { game_cosmetics: { frame: null, mini_avatar: MINIS[0].id, title: null } } };
        usersAPI.getProfile.mockResolvedValue(profile('ayse'));
        renderProfile('ayse');
        expect(await screen.findByRole('img', { name: `Mini avatar: ${MINIS[0].name}` })).toBeInTheDocument();
    });

    it('mesajları kapalı kişide "Mesaj Bileti" → bilet penceresi', async () => {
        shopApi.checkMessageTicket.mockResolvedValue({ needs_ticket: true, can_use: false, reason: 'no_ticket', tickets: 0, price: 7500, recipient: { username: 'mert' } });
        usersAPI.getProfile.mockResolvedValue(profile('mert', { allow_messaging: false }));
        renderProfile('mert');
        const btn = await screen.findByRole('button', { name: /Mesaj Bileti kullan/ });
        expect(screen.queryByRole('button', { name: 'Mesaj' })).toBeNull();
        fireEvent.click(btn);
        expect(await screen.findByRole('dialog', { name: 'Mesaj Bileti' })).toBeInTheDocument();
        expect(await screen.findByRole('link', { name: /Mağazadan bilet al/ })).toBeInTheDocument();
        expect(shopApi.checkMessageTicket).toHaveBeenCalledWith('mert');
    });

    it('yalnız takipçilere açık + takip etmiyorsa bilet; takip ediyorsa normal Mesaj', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', { allow_messaging: true, messaging_mode: 'followers', isFollowing: true }));
        renderProfile('mert');
        expect(await screen.findByRole('button', { name: 'Mesaj' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Mesaj Bileti/ })).toBeNull();
    });
});

describe('Oyun profili — Profil görünümü', () => {
    const PLAYER = { level: 6, xp: 900, level_progress: { percent: 40, next_level_xp: 1200 }, league: null, daily_streak: 0, weekly_score: 0 };
    const renderGame = (username) =>
        render(
            <MemoryRouter initialEntries={[`/oyun/profil/${username}`]}>
                <Routes>
                    <Route path="/oyun/profil/:username" element={<GameProfilePage />} />
                </Routes>
            </MemoryRouter>
        );

    beforeEach(() => {
        vi.clearAllMocks();
        auth.user = { id: 'id-ayse', username: 'ayse', detail: {} };
        gameApi.overview.mockResolvedValue({ badges: [] });
    });

    it('başkasının kozmetiklerini gösterir (mağaza bağlantısı yok)', async () => {
        gameApi.profile.mockResolvedValue({ user: { username: 'mert', avatar: null }, cosmetics: COS, player: PLAYER, badges: [], recent: [] });
        renderGame('mert');
        const box = await screen.findByTestId('game-profile-cosmetics');
        expect(within(box).getByTestId('framed-avatar')).toHaveAttribute('data-frame', COS.frame);
        expect(within(box).getByTestId('title-pill')).toBeInTheDocument();
        expect(within(box).queryByRole('link', { name: /Mağaza/ })).toBeNull();
    });

    it('kozmetiği olmayan başkasında bölüm yok; kendi profilinde mağaza çağrısı', async () => {
        gameApi.profile.mockResolvedValue({ user: { username: 'mert' }, cosmetics: null, player: PLAYER, badges: [], recent: [] });
        const { unmount } = renderGame('mert');
        await screen.findByText('Site profili');
        expect(screen.queryByTestId('game-profile-cosmetics')).toBeNull();
        unmount();

        gameApi.profile.mockResolvedValue({ user: { username: 'ayse' }, cosmetics: null, player: PLAYER, badges: [], recent: [] });
        renderGame('ayse');
        const box = await screen.findByTestId('game-profile-cosmetics');
        expect(within(box).getByRole('link', { name: 'Mağazaya göz at' })).toHaveAttribute('href', '/oyun/magaza');
    });
});
