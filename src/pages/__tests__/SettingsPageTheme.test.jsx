// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const user = { username: 'ayse', name: 'Ayşe', email: 'a@b.c', gender: 'female', detail: {} };

vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ user, updateUser: vi.fn(), logout: vi.fn() }),
}));
vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../components/Widgets', () => ({ TopUsersWidget: () => null }));
vi.mock('../../services/api', () => ({
    usersAPI: {
        getMe: vi.fn(() => Promise.resolve({
            data: { data: { user: { email: 'a@b.c', detail: {} }, notification_preferences: {}, interests: [], username_changes_remaining: 3 } },
        })),
    },
    categoriesAPI: { getAll: vi.fn(() => Promise.resolve({ data: { data: { categories: [] } } })) },
}));

const themeApi = vi.hoisted(() => ({ overview: vi.fn(), buy: vi.fn(), toggle: vi.fn(), activate: vi.fn() }));
vi.mock('../../services/profileThemeApi', () => ({ profileThemeApi: themeApi, default: themeApi }));

import SettingsPage from '../SettingsPage';

const renderPage = () => render(<MemoryRouter><SettingsPage /></MemoryRouter>);

describe('SettingsPage › Profil Teması', () => {
    beforeEach(() => {
        themeApi.overview.mockReset();
        themeApi.overview.mockImplementation(() => Promise.resolve({
            themes: [{ key: 'ada', name: 'Ada Profili', price: 1000000, days: 15, owned: false, active: false, enabled: false, expires_at: null, unlimited: false, source: null, can_free: false }],
            wallet: { balance: 2000000 },
        }));
    });
    afterEach(() => window.history.replaceState(null, '', '/'));
    window.scrollTo = vi.fn();

    it('sayfa açılır; tema kartı ilk bölümde değil, bu yüzden tema isteği atılmaz', async () => {
        renderPage();
        expect(await screen.findByRole('heading', { name: 'Hesap' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Profil Teması/ })).toBeInTheDocument();
        expect(themeApi.overview).not.toHaveBeenCalled();
    });

    it('sekmeye tıklayınca kart açılır ve durum/fiyat sunucudan gelir', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('tab', { name: /Profil Teması/ }));
        const section = await screen.findByRole('tabpanel', { name: /Profil Teması/ });
        expect(section).toHaveAttribute('id', 'profil-temasi');
        expect(await within(section).findByTestId('theme-status')).toHaveTextContent('Sahip değilsin');
        expect(within(section).getByText('1.000.000')).toBeInTheDocument();
        expect(window.location.hash).toBe('#profil-temasi');
        expect(themeApi.overview).toHaveBeenCalledTimes(1);
    });

    it('#profil-temasi bağlantısı doğrudan kartı açar', async () => {
        window.history.replaceState(null, '', '/settings#profil-temasi');
        renderPage();
        const section = await screen.findByRole('tabpanel', { name: /Profil Teması/ });
        await waitFor(() => expect(within(section).getByTestId('theme-card')).toBeInTheDocument());
        expect(screen.queryByRole('heading', { name: 'Hesap' })).toBeNull();
    });

    it('anahtar başarısında sayfanın ortak bildirimi (role=status) görünür', async () => {
        window.history.replaceState(null, '', '/settings#profil-temasi');
        themeApi.overview.mockImplementation(() => Promise.resolve({
            themes: [{ key: 'ada', name: 'Ada Profili', price: 1, days: 15, owned: true, active: true, enabled: true, expires_at: new Date(Date.now() + 5 * 86400000).toISOString(), unlimited: false, source: 'purchase', can_free: false }],
            wallet: { balance: 5 },
        }));
        themeApi.toggle.mockImplementation(() => Promise.resolve({}));
        renderPage();
        const sw = await screen.findByRole('switch', { name: /Ada temasını göster/ });
        fireEvent.click(sw);
        expect(await screen.findByText(/Ada teması kapatıldı/)).toBeInTheDocument();
        expect(screen.queryByTestId('theme-notice')).toBeNull();
    });
});
