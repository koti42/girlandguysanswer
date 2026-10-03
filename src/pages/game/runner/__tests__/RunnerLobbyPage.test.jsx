// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// CI / yoğun makinede jsdom render'ı yavaşlayabiliyor.
configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const auth = { isAuthenticated: false, user: null, loading: false };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});
vi.mock('../../../../services/gameApi', () => ({
    gameApi: {
        runnerOverview: vi.fn(),
        runnerLeaderboard: vi.fn(),
        startRunner: vi.fn(),
        finishRunner: vi.fn(),
        abandonRunner: vi.fn(),
    },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (err, fallback) => err?.response?.data?.message || fallback || 'Hata',
}));

import toast from 'react-hot-toast';
import { gameApi } from '../../../../services/gameApi';
import RunnerLobbyPage from '../RunnerLobbyPage';
import { RUNNER_RETRY, STORAGE_KEYS } from '../../../../components/game/runner/runnerUtils';

const RUN = {
    id: 'run-9',
    seed: 77,
    sim_version: 1,
    gate_count: 1,
    started_at: '2026-10-02T10:00:00Z',
    gates: [{ index: 0, question: { id: 1, text: 'Soru?', options: ['A', 'B', 'C'], category: null, difficulty: 1 } }],
};

const OVERVIEW = {
    stats: { best_score: 9876, best_distance: 2100, total_runs: 14, total_distance_m: 15400, total_coins: 900, total_gates_correct: 37, weekly_best: 5400 },
    weekly_rank: 3,
    top: [],
    sim_version: 1,
};

const BOARD = (period) => ({
    period,
    entries: [
        { rank: 1, user: { id: 'a', username: period === 'all' ? 'efsane' : 'hizli_ayse' }, score: 12000, distance: 3000 },
        { rank: 2, user: { id: 'b', username: 'mert' }, score: 8000, distance: 2100 },
    ],
    me: { rank: 3, score: 5400 },
});

const PlayProbe = () => {
    const loc = useLocation();
    return (
        <div>
            OYUN {loc.state?.mode} {loc.state?.run?.id ?? ''}
        </div>
    );
};

const renderLobby = () =>
    render(
        <MemoryRouter initialEntries={['/oyun/kosu']}>
            <Routes>
                <Route path="/oyun/kosu" element={<RunnerLobbyPage />} />
                <Route path="/oyun/kosu/oyna" element={<PlayProbe />} />
            </Routes>
        </MemoryRouter>
    );

describe('RunnerLobbyPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(gameApi).forEach((fn) => fn.mockReset());
        localStorage.clear();
        RUNNER_RETRY.finish = [0, 0];
        Object.assign(auth, { isAuthenticated: false, user: null, loading: false });
        // jsdom'da WebGL yok; lobi yalnızca bağlam alınabiliyor mu diye bakıyor.
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => null }));
    });

    it('misafire antrenman modunu, yerel rekoru ve giriş çağrısını gösterir; auth uçlarını çağırmaz', async () => {
        localStorage.setItem(STORAGE_KEYS.guestBest, JSON.stringify({ score: 750, distance: 410 }));
        renderLobby();

        expect(screen.getByRole('heading', { name: 'Herkesler Koşuyor', level: 1 })).toBeInTheDocument();
        expect(screen.getByText(/Antrenman modunda oynuyorsun/)).toBeInTheDocument();
        expect(screen.getByText('750')).toBeInTheDocument();
        expect(screen.getByText('410 m')).toBeInTheDocument();
        const lb = screen.getByRole('heading', { name: /Koşu Liderliği/ }).closest('section');
        expect(within(lb).getByRole('link', { name: /Giriş yap/ })).toHaveAttribute('href', '/login');

        fireEvent.click(screen.getByRole('button', { name: /Antrenmana Başla/ }));
        expect(await screen.findByText(/OYUN practice/)).toBeInTheDocument();
        expect(gameApi.startRunner).not.toHaveBeenCalled();
        expect(gameApi.runnerOverview).not.toHaveBeenCalled();
        expect(gameApi.runnerLeaderboard).not.toHaveBeenCalled();
    });

    it('karakter ve ses tercihini saklar', () => {
        renderLobby();
        fireEvent.click(screen.getByLabelText('Erkek'));
        fireEvent.click(screen.getByLabelText('Nane renk'));
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.character))).toEqual({ body: 'erkek', palette: 2 });
        fireEvent.click(screen.getByRole('button', { name: 'Oyun sesini kapat' }));
        expect(localStorage.getItem(STORAGE_KEYS.muted)).toBe('1');
        expect(screen.getByRole('button', { name: 'Oyun sesini aç' })).toBeInTheDocument();
        // Müzik ayrı anahtar: ses ayarına dokunmaz, varsayılan açık.
        const music = screen.getByRole('switch', { name: 'Müzik' });
        expect(music).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(music);
        expect(screen.getByRole('switch', { name: 'Müzik' })).toHaveAttribute('aria-checked', 'false');
        expect(localStorage.getItem(STORAGE_KEYS.music)).toBe('0');
        expect(localStorage.getItem(STORAGE_KEYS.muted)).toBe('1');
    });

    it('WebGL yoksa uyarır ve başlatmayı kapatır', () => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
        renderLobby();
        expect(screen.getByText(/WebGL/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Antrenmana Başla/ })).toBeDisabled();
    });

    it('yalnızca WebGL1 olan cihazda (motor WebGL2 istiyor) uyarır ve başlatmayı kapatır', () => {
        HTMLCanvasElement.prototype.getContext = vi.fn((t) => (t === 'webgl2' ? null : { getExtension: () => null }));
        renderLobby();
        expect(screen.getByText(/WebGL 2/)).toBeInTheDocument();
        expect(screen.getByText(/iOS 15 veya üstüne/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Antrenmana Başla/ })).toBeDisabled();
    });

    it('ana düğme dar ekranda iki satıra kırılmaz', () => {
        renderLobby();
        const btn = screen.getByRole('button', { name: /Antrenmana Başla/ });
        expect(btn.className).toContain('whitespace-nowrap');
        expect(btn.className).toContain('text-base');
        expect(btn.className).toContain('sm:text-lg');
    });

    it('mobilde "Nasıl oynanır?" kartına kaydıran kısayol var', () => {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        renderLobby();
        fireEvent.click(screen.getByRole('button', { name: 'Nasıl oynanır? ↓' }));
        expect(scrollIntoView).toHaveBeenCalled();
        expect(screen.getByText(/Antrenmanda soru kapısı yok/)).toBeInTheDocument();
    });

    describe('üye', () => {
        beforeEach(() => {
            Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
            gameApi.runnerOverview.mockResolvedValue(OVERVIEW);
            gameApi.runnerLeaderboard.mockImplementation(({ period }) => Promise.resolve(BOARD(period)));
        });

        it('karneyi ve haftalık / tüm zamanlar liderliğini gösterir', async () => {
            renderLobby();
            expect(await screen.findByText('9.876')).toBeInTheDocument();
            const card = screen.getByRole('heading', { name: /Koşu karnen/ }).closest('section');
            expect(within(card).getByText('2.100 m')).toBeInTheDocument();
            expect(within(card).getByText('Haftalık sıran #3')).toBeInTheDocument();
            expect(within(card).getByText('14 koşu')).toBeInTheDocument();
            expect(screen.queryByText(/Antrenman modunda oynuyorsun/)).toBeNull();

            expect(await screen.findByText('hizli_ayse')).toBeInTheDocument();
            expect(screen.getByText('Senin sıran: #3 · 5.400 puan')).toBeInTheDocument();
            expect(gameApi.runnerLeaderboard).toHaveBeenCalledWith({ period: 'weekly', gender: 'all', limit: 5 });

            fireEvent.click(screen.getByRole('tab', { name: 'Tüm zamanlar' }));
            expect(await screen.findByText('efsane')).toBeInTheDocument();
            expect(gameApi.runnerLeaderboard).toHaveBeenCalledWith({ period: 'all', gender: 'all', limit: 5 });
        });

        it('kurallarda mola cezası yazmaz (mola kapıyı etkilemiyor)', async () => {
            renderLobby();
            expect(await screen.findByText(/Soru kapısı yaklaşınca soru ekranın üstünde belirir/)).toBeInTheDocument();
            expect(screen.queryByText(/mola verirsen/)).toBeNull();
            expect(screen.queryByText(/yanlış sayılır/)).toBeNull();
        });

        it('"Koşmaya Başla" dereceli koşu açar ve oyun ekranına koşu durumuyla geçer', async () => {
            gameApi.startRunner.mockResolvedValue({ run: RUN });
            renderLobby();
            fireEvent.click(screen.getByRole('button', { name: /Koşmaya Başla/ }));
            expect(await screen.findByText(/OYUN ranked run-9/)).toBeInTheDocument();
            expect(gameApi.startRunner).toHaveBeenCalledTimes(1);
        });

        it('başlatma başarısızsa mesaj gösterir ve antrenman önerir', async () => {
            gameApi.startRunner.mockRejectedValue({ response: { status: 422, data: { message: 'Yeterli soru yok.' } } });
            renderLobby();
            fireEvent.click(screen.getByRole('button', { name: /Koşmaya Başla/ }));
            expect(await screen.findByText('Yeterli soru yok.')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: /antrenman modunda oyna/ }));
            expect(await screen.findByText(/OYUN practice/)).toBeInTheDocument();
        });

        it('sunucu farklı simülasyon sürümü bildirirse dereceli başlatmayı kapatır', async () => {
            gameApi.runnerOverview.mockResolvedValue({ ...OVERVIEW, sim_version: 2 });
            renderLobby();
            expect(await screen.findByText(/Oyun güncellendi/)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Koşmaya Başla/ })).toBeDisabled();
        });

        it('bekleyen bitişi (2 saatten yeni) otomatik gönderir ve bildirir', async () => {
            localStorage.setItem(
                STORAGE_KEYS.pending,
                JSON.stringify({ v: 1, user_id: 'u1', run_id: 'run-5', end_tick: 1800, inputs: '10L,5J', client_score: 900, saved_at: Date.now() - 60_000 })
            );
            gameApi.finishRunner.mockResolvedValue({ result: { score: 900, distance_m: 420 } });
            renderLobby();
            await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledWith('run-5', { end_tick: 1800, inputs: '10L,5J', client_score: 900 }));
            expect(gameApi.finishRunner).toHaveBeenCalledTimes(1);
            await waitFor(() => expect(toast.success).toHaveBeenCalled());
            expect(toast.success.mock.calls[0][0]).toContain('900 puan');
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        it('süresi geçmiş ya da başka kullanıcıya ait bekleyen kaydı göndermez', async () => {
            localStorage.setItem(
                STORAGE_KEYS.pending,
                JSON.stringify({ v: 1, user_id: 'u1', run_id: 'old', end_tick: 10, inputs: '', client_score: 1, saved_at: Date.now() - 3 * 60 * 60 * 1000 })
            );
            renderLobby();
            await screen.findByText('9.876');
            expect(gameApi.finishRunner).not.toHaveBeenCalled();
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();

            localStorage.setItem(
                STORAGE_KEYS.pending,
                JSON.stringify({ v: 1, user_id: 'baska', run_id: 'x', end_tick: 10, inputs: '', client_score: 1, saved_at: Date.now() })
            );
            renderLobby();
            await new Promise((r) => setTimeout(r, 10));
            expect(gameApi.finishRunner).not.toHaveBeenCalled();
        });

        it('bekleyen gönderim ağ hatasıyla düşerse "Tekrar dene" sunar, kayıt kalır', async () => {
            localStorage.setItem(
                STORAGE_KEYS.pending,
                JSON.stringify({ v: 1, user_id: 'u1', run_id: 'run-6', end_tick: 600, inputs: '', client_score: null, saved_at: Date.now() })
            );
            gameApi.finishRunner.mockRejectedValue(new Error('Network Error'));
            renderLobby();
            expect(await screen.findByText(/henüz gönderilemedi/)).toBeInTheDocument();
            expect(gameApi.finishRunner).toHaveBeenCalledTimes(3);
            expect(gameApi.finishRunner).toHaveBeenCalledWith('run-6', { end_tick: 600, inputs: '', client_score: undefined });
            expect(localStorage.getItem(STORAGE_KEYS.pending)).not.toBeNull();

            gameApi.finishRunner.mockResolvedValue({ result: { score: 10, distance_m: 60 } });
            fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
            await waitFor(() => expect(toast.success).toHaveBeenCalled());
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        it('bekleyen koşu reddedilirse kaydı siler ve hatayı bildirir', async () => {
            localStorage.setItem(
                STORAGE_KEYS.pending,
                JSON.stringify({ v: 1, user_id: 'u1', run_id: 'run-7', end_tick: 600, inputs: '', client_score: 5, saved_at: Date.now() })
            );
            gameApi.finishRunner.mockRejectedValue({ response: { status: 422, data: { message: 'Koşu doğrulanamadı.' } } });
            renderLobby();
            await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Yarım kalan koşun kaydedilemedi: Koşu doğrulanamadı.', expect.any(Object)));
            expect(gameApi.finishRunner).toHaveBeenCalledTimes(1);
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        it('bekleyen koşu sunucuda kapanmışsa (409) yeniden denemez, kaydı siler ve nedenini söyler', async () => {
            localStorage.setItem(
                STORAGE_KEYS.pending,
                JSON.stringify({ v: 1, user_id: 'u1', run_id: 'run-8', end_tick: 600, inputs: '', client_score: 5, saved_at: Date.now() })
            );
            gameApi.finishRunner.mockRejectedValue({ response: { status: 409, data: { message: 'Koşu yarıda bırakılmış.' } } });
            renderLobby();
            await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Yarım kalan koşun kaydedilemedi: Koşu yarıda bırakılmış.', expect.any(Object)));
            expect(gameApi.finishRunner).toHaveBeenCalledTimes(1);
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
            expect(screen.queryByText(/henüz gönderilemedi/)).toBeNull();
        });

        it('"Koşmaya Başla"ya çift tıklama tek koşu açar', async () => {
            let resolveStart;
            gameApi.startRunner.mockReturnValue(new Promise((r) => (resolveStart = r)));
            renderLobby();
            const btn = screen.getByRole('button', { name: /Koşmaya Başla/ });
            act(() => {
                btn.click();
                btn.click();
            });
            expect(gameApi.startRunner).toHaveBeenCalledTimes(1);
            await act(async () => resolveStart({ run: RUN }));
            expect(await screen.findByText(/OYUN ranked run-9/)).toBeInTheDocument();
        });

        it('başlatma yanıtı gelmeden lobiden çıkılırsa oyuna geri çekmez, açılan koşuyu terk eder', async () => {
            let resolveStart;
            gameApi.startRunner.mockReturnValue(new Promise((r) => (resolveStart = r)));
            gameApi.abandonRunner.mockResolvedValue({});
            const view = renderLobby();
            fireEvent.click(screen.getByRole('button', { name: /Koşmaya Başla/ }));
            view.unmount();
            await act(async () => resolveStart({ run: RUN }));
            await waitFor(() => expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-9'));
        });

        it('localStorage hata fırlatsa da lobi açılır ve koşu başlatılır', async () => {
            const spies = ['getItem', 'setItem', 'removeItem'].map((m) =>
                vi.spyOn(Storage.prototype, m).mockImplementation(() => {
                    throw new DOMException('denied', 'SecurityError');
                })
            );
            try {
                gameApi.startRunner.mockResolvedValue({ run: RUN });
                renderLobby();
                fireEvent.click(screen.getByRole('button', { name: /Koşmaya Başla/ }));
                expect(await screen.findByText(/OYUN ranked run-9/)).toBeInTheDocument();
            } finally {
                spies.forEach((sp) => sp.mockRestore());
            }
        });
    });
});
