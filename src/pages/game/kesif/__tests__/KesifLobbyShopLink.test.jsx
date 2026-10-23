// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = { isAuthenticated: false, user: null, loading: false };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});
vi.mock('../../../../components/game/kesif/kesifUtils', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, detectWebGL: () => true };
});

import KesifLobbyPage from '../KesifLobbyPage';
import { fakeApi } from '../../../../components/game/kesif/__tests__/kesifTestKit';

/*
 * Keşif lobisi → Jeton Mağazası "Keşif Koleksiyonu" bağlantısı: üyeye "Görünümler",
 * misafire yok (kuşanma üye işi); yol mağazanın ?kategori=kesif derin bağlantısıdır.
 */

const renderLobby = () =>
    render(
        <MemoryRouter initialEntries={['/oyun/kesif']}>
            <KesifLobbyPage api={fakeApi()} loadSaves={() => Promise.resolve([])} />
        </MemoryRouter>
    );

describe('KesifLobbyPage — mağaza bağlantısı', () => {
    beforeEach(() => {
        Object.assign(auth, { isAuthenticated: false, user: null, loading: false });
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('üyede "Görünümler" bağlantısı mağazanın Keşif sekmesine gider', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ben', gender: 'male' } });
        renderLobby();
        const link = await screen.findByTestId('kesif-shop-link');
        expect(link).toHaveAccessibleName('Görünümler');
        expect(link.getAttribute('href')).toBe('/oyun/magaza?kategori=kesif');
    });

    it('misafirde bağlantı yok', async () => {
        renderLobby();
        await screen.findByRole('heading', { level: 1, name: 'Herkesler Keşfediyor' });
        expect(screen.queryByTestId('kesif-shop-link')).toBeNull();
    });
});
