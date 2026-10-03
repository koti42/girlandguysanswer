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

describe('GameOverview - Herkesler Yükseliyor (kule)', () => {
    beforeEach(() => api.stats.mockReset());

    it('kule sayılarını, en yüksek skorları, reddedilen ve şüpheli oyunları gösterir', async () => {
        api.stats.mockImplementation(() => ok({
            ...base,
            totals: { ...base.totals, tower_runs: 820, tower_runs_today: 14 },
            tower: {
                top: [{ user: { id: 'u3', username: 'kuleci' }, run_id: 't1', score: 45678, floors: 87, correct_count: 6, at: '2026-10-02T10:00:00Z' }],
                rejected: [{ user: { id: 'u4', username: 'zamanci' }, run_id: 't2', reason: 'answer', at: '2026-10-02T11:00:00Z' }],
                suspicious: [{ user: { id: 'u5', username: 'kombocu' }, run_id: 't3', score: 99000, floors: 140, perfects: 120, max_combo: 95, reasons: ['combo', 'yeni_kod'], at: '2026-10-02T12:00:00Z' }],
            },
        }));
        mount();
        const totals = await screen.findByTestId('game-totals');
        expect(within(totals).getByText('Kule')).toBeInTheDocument();
        expect(within(totals).getByText('14 bugün')).toBeInTheDocument();

        const tower = screen.getByTestId('game-tower');
        expect(within(tower).getByText('@kuleci')).toBeInTheDocument();
        expect(within(tower).getByText('45.678 puan')).toBeInTheDocument();
        expect(within(tower).getByText('87 kat')).toBeInTheDocument();
        const rejected = screen.getByTestId('game-tower-rejected');
        expect(within(rejected).getByText('@zamanci')).toBeInTheDocument();
        expect(within(rejected).getByText('Cevap uyuşmazlığı')).toBeInTheDocument();
        const sus = screen.getByTestId('game-tower-suspicious');
        expect(within(sus).getByText('@kombocu')).toBeInTheDocument();
        expect(within(sus).getByText('Aşırı uzun kombo')).toBeInTheDocument();
        expect(within(sus).getByText('yeni_kod')).toBeInTheDocument(); // bilinmeyen kod olduğu gibi
        expect(within(sus).getByText('95 kombo')).toBeInTheDocument();
    });

    it('eski API kule alanlarını göndermiyorsa bölümü çizmez; bozuk alanlarda boş durum', async () => {
        api.stats.mockImplementation(() => ok(base));
        const { unmount } = mount();
        const totals = await screen.findByTestId('game-totals');
        expect(within(totals).queryByText('Kule')).toBeNull();
        expect(screen.queryByTestId('game-tower')).toBeNull();
        unmount();

        api.stats.mockImplementation(() => ok({ ...base, tower: { top: 'x', rejected: null, suspicious: {} } }));
        mount();
        expect(await screen.findByText('Henüz bitmiş kule oyunu yok.')).toBeInTheDocument();
        expect(screen.getByText('Reddedilen kule oyunu yok.')).toBeInTheDocument();
        expect(screen.getByText('Şüpheli kule oyunu yok.')).toBeInTheDocument();
    });
});
