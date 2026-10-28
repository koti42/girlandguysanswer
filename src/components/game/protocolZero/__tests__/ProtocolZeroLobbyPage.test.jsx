// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const auth = { isAuthenticated: false, user: null, loading: false };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../../../components/SEO', () => ({ default: () => null }));

import ProtocolZeroLobbyPage from '../../../../pages/game/protocolZero/ProtocolZeroLobbyPage';

const OVERVIEW = {
    leaderboard: { entries: [], period: 'all', difficulty: null },
    difficulties: [{ key: 'easy' }, { key: 'normal' }, { key: 'hard' }, { key: 'nightmare' }],
    discussion: { id: 'q1', slug: 'protocol-zero-oynadin-mi', title: 'PROTOCOL: ZERO oynadın mı?', path: '/question/protocol-zero-oynadin-mi' },
    me: null,
    player_name: null,
};

const ENTRIES = [
    { rank: 1, id: 1, player_name: 'Komutan Ayşe', user: null, guest: true, difficulty: 'hard', outcome: 'victory', score: 14500, survival_days: 42 },
    { rank: 2, id: 2, player_name: 'siber', user: { id: 'u1', username: 'siber', avatar: null, gender: 'male' }, guest: false, difficulty: 'normal', outcome: 'defeat', score: 3200, survival_days: 17 },
];

const PlayProbe = () => {
    const { state } = useLocation();
    return <div data-testid="play-state">{JSON.stringify(state)}</div>;
};

const renderLobby = (api) =>
    render(
        <MemoryRouter initialEntries={['/oyun/protocol-zero']}>
            <Routes>
                <Route path="/oyun/protocol-zero" element={<ProtocolZeroLobbyPage api={api} />} />
                <Route path="/oyun/protocol-zero/oyna" element={<PlayProbe />} />
            </Routes>
        </MemoryRouter>
    );

describe('ProtocolZeroLobbyPage', () => {
    let api;
    beforeEach(() => {
        auth.isAuthenticated = false;
        auth.user = null;
        window.localStorage.clear();
        api = {
            overview: vi.fn().mockResolvedValue(OVERVIEW),
            leaderboard: vi.fn().mockResolvedValue({ entries: ENTRIES, period: 'all', difficulty: null }),
            submitScore: vi.fn(),
        };
        // jsdom'da WebGL yok; lobi uyarı gösterir. Testte var sayalım.
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
        window.WebGLRenderingContext = function WebGLRenderingContext() {};
    });

    it('misafire kahraman, zorluk seçimi, liderlik ve tartışma çağrısını gösterir', async () => {
        renderLobby(api);
        expect(screen.getByRole('heading', { level: 1, name: /PROTOCOL: ZERO/ })).toBeInTheDocument();
        expect(screen.getByRole('radiogroup', { name: 'Zorluk' })).toBeInTheDocument();
        expect(screen.getByText(/Üyelik gerekmez/)).toBeInTheDocument();

        expect(await screen.findByText('Komutan Ayşe')).toBeInTheDocument();
        expect(screen.getByText('siber')).toBeInTheDocument();
        expect(screen.getByText('14.500')).toBeInTheDocument();
        expect(screen.getByText(/misafir/i)).toBeInTheDocument();

        const cta = await screen.findByRole('link', { name: /Bu simülasyon hakkında ne düşünüyorsun/ });
        expect(cta).toHaveAttribute('href', '/question/protocol-zero-oynadin-mi');
        expect(api.leaderboard).toHaveBeenCalledWith({ difficulty: undefined, period: 'all', limit: 10 });
    });

    it('zorluk seçimi kaydedilir ve oyun seçilen zorlukla başlar', async () => {
        renderLobby(api);
        fireEvent.click(screen.getByRole('radio', { name: /Kâbus/ }));
        expect(screen.getByRole('radio', { name: /Kâbus/ })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByTestId('pz-start'));
        await waitFor(() => expect(screen.getByTestId('play-state')).toBeInTheDocument());
        const state = JSON.parse(screen.getByTestId('play-state').textContent);
        expect(state.entry.difficulty).toBe('nightmare');
        expect(state.entry.v).toBe(1);
        expect(typeof state.entry.seed).toBe('number');
        expect(window.localStorage.getItem('hs_pz_difficulty')).toBe('nightmare');
    });

    it('zorluk filtresi liderliği yeniden çeker', async () => {
        renderLobby(api);
        await screen.findByText('Komutan Ayşe');
        fireEvent.click(screen.getByRole('button', { name: 'Zor' }));
        await waitFor(() => expect(api.leaderboard).toHaveBeenLastCalledWith({ difficulty: 'hard', period: 'all', limit: 10 }));
    });

    it('üyeye karnesini gösterir', async () => {
        auth.isAuthenticated = true;
        auth.user = { id: 'u1', username: 'siber' };
        api.overview.mockResolvedValue({ ...OVERVIEW, me: { games: 3, victories: 1, best_score: 9000, best_difficulty: 'hard', best_days: 42, max_days: 61 }, player_name: 'siber' });
        renderLobby(api);
        expect(await screen.findByText('Komutan karnen')).toBeInTheDocument();
        expect(await screen.findByText('9.000')).toBeInTheDocument();
        expect(screen.getByText('42 gün')).toBeInTheDocument();
        expect(screen.queryByText(/Üyelik gerekmez/)).not.toBeInTheDocument();
    });

    it('liderlik yüklenemezse tekrar dene gösterir', async () => {
        api.leaderboard.mockRejectedValue(new Error('x'));
        renderLobby(api);
        expect(await screen.findByText(/Liderlik yüklenemedi/)).toBeInTheDocument();
    });
});
