// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../../panel/hooks/useToast';

const api = vi.hoisted(() => ({ stats: vi.fn() }));
vi.mock('../../gameAdminApi', () => ({ gameAdminApi: api, default: api }));

import GameOverview from './GameOverview';

const ok = (data) => Promise.resolve({ data: { success: true, message: '', data } });
const mount = () => render(<MemoryRouter><ToastProvider><GameOverview /></ToastProvider></MemoryRouter>);
const base = {
    totals: { questions: 10, active_questions: 9, dilemmas: 1, sessions: 5, sessions_today: 1, players: 3, duels: 0 },
    by_category: [],
    hardest: [],
    suspicious: [],
};

describe('GameOverview - Herkesler Koşuyor', () => {
    beforeEach(() => api.stats.mockReset());

    it('koşu sayılarını, en yüksek skorları ve reddedilen koşuları gösterir', async () => {
        api.stats.mockImplementation(() => ok({
            ...base,
            totals: { ...base.totals, runner_runs: 1234, runner_runs_today: 56 },
            runner: {
                top: [{ user: { id: 'u1', username: 'kosucu' }, run_id: 'r1', score: 98765, distance_m: 4321, correct_count: 9, at: '2026-10-01T10:00:00Z' }],
                rejected: [{ user: { id: 'u2', username: 'hileci' }, run_id: 'r2', reason: 'lane', at: '2026-10-01T11:00:00Z' }],
            },
        }));
        mount();
        const totals = await screen.findByTestId('game-totals');
        expect(within(totals).getByText('Koşu')).toBeInTheDocument();
        expect(within(totals).getByText('56 bugün')).toBeInTheDocument();

        const runner = screen.getByTestId('game-runner');
        expect(within(runner).getByText('@kosucu')).toBeInTheDocument();
        expect(within(runner).getByText('98.765 puan')).toBeInTheDocument();
        const rejected = screen.getByTestId('game-runner-rejected');
        expect(within(rejected).getByText('@hileci')).toBeInTheDocument();
        expect(within(rejected).getByText('Şerit uyuşmazlığı')).toBeInTheDocument();
    });

    it('eski API koşu alanlarını göndermiyorsa çökmez, bölümü çizmez', async () => {
        api.stats.mockImplementation(() => ok(base));
        mount();
        const totals = await screen.findByTestId('game-totals');
        expect(within(totals).queryByText('Koşu')).toBeNull();
        expect(screen.queryByTestId('game-runner')).toBeNull();
    });

    it('bozuk koşu alanlarında boş durum gösterir', async () => {
        api.stats.mockImplementation(() => ok({ ...base, runner: { top: null, rejected: 'x' } }));
        mount();
        expect(await screen.findByText('Henüz bitmiş koşu yok.')).toBeInTheDocument();
        expect(screen.getByText('Reddedilen koşu yok.')).toBeInTheDocument();
    });
});
