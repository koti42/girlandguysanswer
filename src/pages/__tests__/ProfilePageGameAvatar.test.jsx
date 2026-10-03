// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, render, screen, within } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/*
 * Site profilindeki "Oyun Karakteri" kartı (var / yok / kendi / başkası).
 * Profil sayfasının diğer parçaları sahte: yalnızca kartın yeri ve kuralları
 * sınanır.
 */

const auth = { user: null, updateUser: vi.fn(), permissions: {}, canModerate: false };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../services/api', () => ({
    usersAPI: { getProfile: vi.fn(), getUserAnswers: vi.fn(), getFollowers: vi.fn(), getFollowing: vi.fn() },
    questionsAPI: { getMyQuestions: vi.fn() },
    opinionsAPI: { getAll: vi.fn() },
}));
const { stub } = vi.hoisted(() => ({ stub: (name) => ({ default: () => <div data-testid={name} /> }) }));
vi.mock('../../components/ProfileCover', () => stub('cover'));
vi.mock('../../components/ProfileAvatar', () => stub('photo'));
vi.mock('../../components/Toast', () => stub('toast'));
vi.mock('../ErrorPage', () => ({ default: ({ title }) => <div>{title}</div> }));
vi.mock('../../components/Profile/BlockedUserView', () => ({ default: () => null }));
vi.mock('../../components/Profile/ProfileHeaderInfo', () => ({ default: ({ profileData }) => <h1>{profileData.username}</h1> }));
vi.mock('../../components/Profile/ProfileActions', () => stub('actions'));
vi.mock('../../components/Profile/ProfileTabs', () => stub('tabs'));
vi.mock('../../components/Profile/ProfileTabContent', () => stub('tab-content'));
vi.mock('../../components/Moderation/ModerationActionsPanel', () => stub('moderation'));
vi.mock('../../components/AccountStatusBanner', () => stub('status'));
vi.mock('../../components/SEO', () => ({ default: () => null }));
vi.mock('../../utils/userColor', () => ({ getThemeStyles: () => ({ shellBg: '#fff', accentColor: '#ff6b6b' }), getViewerPrefs: () => ({}) }));
vi.mock('../../components/game/avatar/viewerLoader', () => ({ loadAvatarViewer: vi.fn() }));

import { questionsAPI, usersAPI } from '../../services/api';
import ProfilePage from '../ProfilePage';

const AVATAR = {
    v: 1, body: 'erkek', skin: 3,
    hair: { style: 'kivircik', color: 0 }, top: { style: 'forma', color: 6 },
    bottom: { style: 'sort', color: 10 }, shoes: { style: 'neon', color: 2 },
    acc: 'kulaklik', trail: 'yildiz',
};

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

describe('ProfilePage — Oyun Karakteri kartı', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        auth.user = { id: 'id-ayse', username: 'ayse', gender: 'female', detail: { game_avatar: null } };
        usersAPI.getUserAnswers.mockResolvedValue({ data: { data: { answers: [], count: 0 } } });
        questionsAPI.getMyQuestions.mockResolvedValue({ data: { data: { questions: [], count: 0 } } });
    });

    it('başkasının kayıtlı karakteri: portre + Oyun profili, Düzenle yok', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', { game_avatar: AVATAR }));
        renderProfile('mert');
        const card = await screen.findByTestId('game-avatar-card');
        expect(within(card).getByRole('img', { name: 'mert adlı oyuncunun karakteri' })).toBeInTheDocument();
        expect(within(card).getByText('Kıvırcık')).toBeInTheDocument();
        expect(within(card).getByRole('link', { name: /Oyun profili/ })).toHaveAttribute('href', '/oyun/profil/mert');
        expect(within(card).queryByRole('link', { name: /Düzenle/ })).toBeNull();
    });

    it('başkasının karakteri yoksa kart hiç görünmez', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', { game_avatar: null }));
        renderProfile('mert');
        expect(await screen.findByRole('heading', { name: 'mert' })).toBeInTheDocument();
        expect(screen.queryByTestId('game-avatar-card')).toBeNull();
    });

    it('kendi profilinde kayıtlı karakter: Düzenle -> /oyun/karakter', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('ayse', { game_avatar: AVATAR }));
        renderProfile('ayse');
        const card = await screen.findByTestId('game-avatar-card');
        expect(within(card).getByRole('link', { name: /Düzenle/ })).toHaveAttribute('href', '/oyun/karakter');
        expect(within(card).getByRole('button', { name: /3D gör/ })).toBeInTheDocument();
    });

    it('kendi profilinde karakter yoksa Karakterini oluştur çağrısı', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('ayse', { game_avatar: null }));
        renderProfile('ayse');
        const card = await screen.findByTestId('game-avatar-card');
        expect(within(card).getByRole('link', { name: /Karakterini oluştur/ })).toHaveAttribute('href', '/oyun/karakter');
    });

    it('kendi profilinde sunucu alanı yoksa oturumdaki karakter kullanılır', async () => {
        auth.user = { ...auth.user, detail: { game_avatar: AVATAR } };
        usersAPI.getProfile.mockResolvedValue(profile('ayse'));
        renderProfile('ayse');
        const card = await screen.findByTestId('game-avatar-card');
        expect(within(card).getByText('Forma')).toBeInTheDocument();
        expect(within(card).getByRole('link', { name: /Düzenle/ })).toBeInTheDocument();
    });
});
