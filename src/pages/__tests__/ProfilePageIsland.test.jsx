// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

/*
 * Ada Profili entegrasyonu: ProfilePage kahramanı yalnız `profile_theme.active`
 * iken (ve WebGL2 var, erişilebilirlik modu/hareket azaltma kapalıyken) kapak
 * bandının yerine çizer; aksi halde sayfa eskisi gibidir. Standart başlık ve
 * sekmeler her durumda yerinde kalır. Kahraman bileşeni sahte (kendi testi var).
 */

const env = vi.hoisted(() => ({ webgl: true, reduced: false }));
vi.mock('../../components/game/avatar/avatarUtils', async (importOriginal) => ({
    ...(await importOriginal()),
    hasWebGL2: () => env.webgl,
    prefersReducedMotion: () => env.reduced,
}));

const auth = { user: null, updateUser: vi.fn(), permissions: {}, canModerate: false, isAdmin: false };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../services/api', () => ({
    usersAPI: { getProfile: vi.fn(), getUserAnswers: vi.fn(), getFollowers: vi.fn(), getFollowing: vi.fn(), follow: vi.fn(), unfollow: vi.fn() },
    questionsAPI: { getMyQuestions: vi.fn() },
    opinionsAPI: { getAll: vi.fn() },
}));
const { stub, heroProps } = vi.hoisted(() => ({
    stub: (name) => ({ default: () => <div data-testid={name} /> }),
    heroProps: { current: null },
}));
vi.mock('../../components/ProfileCover', () => stub('cover'));
vi.mock('../../components/ProfileAvatar', () => stub('photo'));
vi.mock('../../components/Toast', () => stub('toast'));
vi.mock('../ErrorPage', () => ({ default: ({ title }) => <div>{title}</div> }));
vi.mock('../../components/Profile/BlockedUserView', () => ({ default: () => null }));
vi.mock('../../components/Profile/ProfileHeaderInfo', () => ({ default: ({ profileData }) => <h1>{profileData.username}</h1> }));
vi.mock('../../components/Profile/ProfileActions', () => stub('actions'));
vi.mock('../../components/Profile/ProfileTabs', () => ({
    default: ({ setActiveTab }) => (
        <button type="button" onClick={() => setActiveTab('answers')}>
            sekme-cevaplar
        </button>
    ),
}));
vi.mock('../../components/Profile/ProfileTabContent', () => ({ default: ({ activeTab }) => <div data-testid="tab-content">{activeTab}</div> }));
vi.mock('../../components/Moderation/ModerationActionsPanel', () => stub('moderation'));
vi.mock('../../components/AccountStatusBanner', () => stub('status'));
vi.mock('../../components/SEO', () => ({ default: () => null }));
vi.mock('../../components/game/avatar/AvatarCard', () => stub('avatar-card'));
vi.mock('../../utils/userColor', () => ({ getThemeStyles: () => ({ shellBg: '#fff', accentColor: '#ff6b6b' }), getViewerPrefs: () => ({}) }));
vi.mock('../../components/Profile/island/ProfileIslandHero', () => ({
    default: (props) => {
        heroProps.current = props;
        return (
            <div data-testid="island-hero-stub">
                <button type="button" onClick={() => props.onSelectTab('opinions')}>
                    hero-sekme
                </button>
                <button type="button" onClick={props.tabsActions.onFollowToggle}>
                    hero-takip
                </button>
            </div>
        );
    },
}));

import { questionsAPI, usersAPI } from '../../services/api';
import { resetIslandSupportCache } from '../../components/Profile/island/islandUtils';
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

const THEME = { key: 'ada', active: true, expires_at: null };

describe('ProfilePage — Ada Profili', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        env.webgl = true;
        env.reduced = false;
        heroProps.current = null;
        resetIslandSupportCache();
        auth.user = { id: 'id-ayse', username: 'ayse', gender: 'female', detail: { game_avatar: null } };
        auth.isAdmin = false;
        usersAPI.getUserAnswers.mockResolvedValue({ data: { data: { answers: [], count: 0 } } });
        usersAPI.follow.mockResolvedValue({ data: { data: {} } });
        questionsAPI.getMyQuestions.mockResolvedValue({ data: { data: { questions: [{ id: 1, slug: 'benim', title: 'Benim sorum' }], count: 1 } } });
    });

    it('profile_theme.active: kahraman kapak yerine çizilir, başlık ve sekmeler yerinde kalır', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', { game_avatar: AVATAR, profile_theme: THEME }));
        renderProfile('mert');
        expect(await screen.findByTestId('island-hero-stub')).toBeInTheDocument();
        expect(screen.queryByTestId('cover')).toBeNull();
        expect(screen.getByRole('heading', { name: 'mert' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'sekme-cevaplar' })).toBeInTheDocument();
        expect(screen.getByTestId('tab-content')).toBeInTheDocument();
        expect(heroProps.current.avatar).toEqual(AVATAR);
        expect(heroProps.current.isOwnProfile).toBe(false);
        expect(heroProps.current.profile.profile_theme).toEqual(THEME);
        // Yedek kapak kahramana verilir (WebGL/yükleme hatasında o çizilir).
        expect(heroProps.current.fallback).toBeTruthy();
        // Ek API çağrısı yok: profil bir kez, cevap sayısı bir kez.
        expect(usersAPI.getProfile).toHaveBeenCalledTimes(1);
    });

    it('kahraman eylemleri sayfanın işleyicilerine bağlı: sekme seçimi ve takip', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', { profile_theme: THEME }));
        renderProfile('mert');
        fireEvent.click(await screen.findByRole('button', { name: 'hero-sekme' }));
        expect(screen.getByTestId('tab-content')).toHaveTextContent('opinions');
        fireEvent.click(screen.getByRole('button', { name: 'hero-takip' }));
        await vi.waitFor(() => expect(usersAPI.follow).toHaveBeenCalledWith('mert'));
    });

    it('kendi profilinde sahibin soruları ve oturumdaki karakteri kahramana geçer', async () => {
        auth.user = { ...auth.user, detail: { game_avatar: AVATAR } };
        usersAPI.getProfile.mockResolvedValue(profile('ayse', { profile_theme: THEME }));
        renderProfile('ayse');
        await screen.findByTestId('island-hero-stub');
        expect(heroProps.current.isOwnProfile).toBe(true);
        expect(heroProps.current.avatar).toEqual(AVATAR);
        expect(heroProps.current.questions.map((q) => q.title)).toEqual(['Benim sorum']);
    });

    it.each([
        ['tema yok (null)', { profile_theme: null }],
        ['tema alanı yok (eski sunucu)', {}],
        ['aktif değil', { profile_theme: { key: 'ada', active: false, expires_at: null } }],
    ])('%s: standart kapak, kahraman yok', async (_n, extra) => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', extra));
        renderProfile('mert');
        expect(await screen.findByTestId('cover')).toBeInTheDocument();
        expect(screen.queryByTestId('island-hero-stub')).toBeNull();
        expect(screen.queryByTestId('island-placeholder')).toBeNull();
    });

    it('WebGL2 yoksa tema aktif olsa da standart kapak', async () => {
        env.webgl = false;
        usersAPI.getProfile.mockResolvedValue(profile('mert', { profile_theme: THEME }));
        renderProfile('mert');
        expect(await screen.findByTestId('cover')).toBeInTheDocument();
        expect(screen.queryByTestId('island-hero-stub')).toBeNull();
    });

    it('hareket azaltma açıksa standart kapak', async () => {
        env.reduced = true;
        usersAPI.getProfile.mockResolvedValue(profile('mert', { profile_theme: THEME }));
        renderProfile('mert');
        expect(await screen.findByTestId('cover')).toBeInTheDocument();
        expect(screen.queryByTestId('island-hero-stub')).toBeNull();
    });

    it('erişilebilirlik modu (oturum ayarı) açıksa standart kapak', async () => {
        auth.user = { ...auth.user, accessibility_mode: true };
        usersAPI.getProfile.mockResolvedValue(profile('mert', { profile_theme: THEME }));
        renderProfile('mert');
        expect(await screen.findByTestId('cover')).toBeInTheDocument();
        expect(screen.queryByTestId('island-hero-stub')).toBeNull();
    });

    it('erişilebilirlik modu (html data-a11y) açıksa standart kapak', async () => {
        document.documentElement.setAttribute('data-a11y', '1');
        try {
            usersAPI.getProfile.mockResolvedValue(profile('mert', { profile_theme: THEME }));
            renderProfile('mert');
            expect(await screen.findByTestId('cover')).toBeInTheDocument();
            expect(screen.queryByTestId('island-hero-stub')).toBeNull();
        } finally {
            document.documentElement.removeAttribute('data-a11y');
        }
    });

    it('kendi profilinde tema yoksa (null) "Profilini adaya taşı" daveti, kapak yerinde', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('ayse', { profile_theme: null }));
        renderProfile('ayse');
        expect(await screen.findByTestId('cover')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Profilini adaya taşı' })).toHaveAttribute('href', '/settings#profil-temasi');
    });

    it('başkasının profilinde davet görünmez; kendi profilinde alan yoksa da görünmez', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('mert', { profile_theme: null }));
        const first = renderProfile('mert');
        await screen.findByTestId('cover');
        expect(screen.queryByRole('link', { name: 'Profilini adaya taşı' })).toBeNull();
        first.unmount();

        usersAPI.getProfile.mockResolvedValue(profile('ayse', {}));
        renderProfile('ayse');
        await screen.findByTestId('cover');
        expect(screen.queryByRole('link', { name: 'Profilini adaya taşı' })).toBeNull();
    });

    it('sahibin aktif teması varken davet çizilmez (kahraman yönet bağlantısını taşır)', async () => {
        usersAPI.getProfile.mockResolvedValue(profile('ayse', { profile_theme: THEME }));
        renderProfile('ayse');
        await screen.findByTestId('island-hero-stub');
        expect(screen.queryByRole('link', { name: 'Profilini adaya taşı' })).toBeNull();
    });
});
