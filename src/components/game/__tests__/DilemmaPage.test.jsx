// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within , configure } from '@testing-library/react';

// CI / yoğun makinede jsdom render'ı yavaşlayabiliyor; varsayılan 1 sn / 5 sn
// sınırları kararsız sonuç veriyordu.
configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});
vi.mock('../../../services/gameApi', () => ({
    gameApi: {
        dilemmaToday: vi.fn(),
        dilemmaNext: vi.fn(),
        dilemmaHistory: vi.fn(),
        voteDilemma: vi.fn(),
    },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (_err, fallback) => fallback || 'Hata',
}));

import toast from 'react-hot-toast';
import { gameApi } from '../../../services/gameApi';
import DilemmaPage from '../../../pages/game/DilemmaPage';

const base = { id: 7, option_a: 'Deniz tatili', option_b: 'Dağ evi', topic: 'yasam', my_vote: null, results: null };
const voted = {
    ...base,
    my_vote: 'a',
    results: {
        total: 1340,
        a_pct: 62,
        b_pct: 38,
        by_gender: {
            female: { total: 700, a_pct: 55, b_pct: 45 },
            male: { total: 640, a_pct: 70, b_pct: 30 },
        },
    },
};

const renderPage = () =>
    render(
        <MemoryRouter>
            <DilemmaPage />
        </MemoryRouter>
    );

describe('DilemmaPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(gameApi).forEach((fn) => fn.mockReset());
        gameApi.dilemmaHistory.mockResolvedValue({ dilemmas: [], pagination: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    });

    it('oydan önce yüzde göstermez; oydan sonra topluluk ve kadın/erkek yüzdelerini gösterir', async () => {
        gameApi.dilemmaToday.mockResolvedValue({ dilemma: base });
        gameApi.voteDilemma.mockResolvedValue({ dilemma: voted, xp_earned: 2 });
        renderPage();

        const a = await screen.findByRole('button', { name: /A seçeneği: Deniz tatili/ });
        expect(screen.queryByText('%62')).toBeNull();
        expect(screen.queryByText('Kadınlar')).toBeNull();

        fireEvent.click(a);
        expect(gameApi.voteDilemma).toHaveBeenCalledWith(7, 'a');

        const optA = await screen.findByRole('button', { name: /A seçeneği: Deniz tatili, yüzde 62, senin seçimin/ });
        const optB = screen.getByRole('button', { name: /B seçeneği: Dağ evi, yüzde 38/ });
        expect(within(optA).getByText('%62')).toBeInTheDocument();
        expect(within(optB).getByText('%38')).toBeInTheDocument();
        expect(optA).toBeDisabled();
        expect(optB).toBeDisabled();

        expect(screen.getByText('Kadınlar')).toBeInTheDocument();
        expect(screen.getByText('Erkekler')).toBeInTheDocument();
        expect(screen.getByLabelText('Kadınlar: A yüzde 55, B yüzde 45')).toHaveTextContent('A %55 · B %45');
        expect(screen.getByLabelText('Erkekler: A yüzde 70, B yüzde 30')).toHaveTextContent('A %70 · B %30');
        expect(screen.getByText('1.340')).toBeInTheDocument();
        expect(toast.success).toHaveBeenCalledWith('+2 XP', expect.anything());
    });

    it('daha önce oy verilmiş ikilemi doğrudan sonuçlarla açar', async () => {
        gameApi.dilemmaToday.mockResolvedValue({ dilemma: voted });
        renderPage();
        expect(await screen.findByRole('button', { name: /A seçeneği: Deniz tatili, yüzde 62/ })).toBeDisabled();
        expect(screen.getByText('Erkekler')).toBeInTheDocument();
    });

    it('hiç ikilem yoksa (404) hata değil boş durum gösterir', async () => {
        gameApi.dilemmaToday.mockRejectedValue({ response: { status: 404, data: { success: false, message: 'yok' } } });
        renderPage();
        expect(await screen.findByText('Bugün için ikilem yok')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('sıradaki ikilem yoksa bilgi verir', async () => {
        gameApi.dilemmaToday.mockResolvedValue({ dilemma: voted });
        gameApi.dilemmaNext.mockResolvedValue({ dilemma: null });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /Sıradaki ikilem/ }));
        expect(await screen.findByText('Şimdilik oylanacak ikilem kalmadı')).toBeInTheDocument();
    });
});
