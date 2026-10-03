// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

const auth = { isAuthenticated: false, user: null, loading: false };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});
vi.mock('../../../../services/towerApi', () => ({
    towerApi: {
        overview: vi.fn(),
        start: vi.fn(),
        answer: vi.fn(),
        finish: vi.fn(),
        abandon: vi.fn(),
        leaderboard: vi.fn(),
    },
}));
vi.mock('../../../../services/gameApi', () => ({
    gameApi: {},
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (err, fallback) => err?.response?.data?.message || fallback || 'Hata',
}));

import toast from 'react-hot-toast';
import { towerApi } from '../../../../services/towerApi';
import TowerLobbyPage from '../TowerLobbyPage';
import { STORAGE_KEYS, TOWER_RETRY, savePending } from '../../../../components/game/tower/towerUtils';

const RUN = {
    id: 'run-9',
    seed: 77,
    sim_version: 1,
    question_count: 1,
    started_at: '2026-10-03T10:00:00Z',
    questions: [{ index: 0, question: { id: 1, text: 'Soru?', options: ['Evet', 'Hayır'], category: null } }],
};

const OVERVIEW = {
    stats: { best_score: 5120, best_floor: 88, total_runs: 23, total_floors: 910, weekly_best: 3100 },
    weekly_rank: 4,
    top: [],
    sim_version: 1,
};

const BOARD = (period) => ({
    period,
    entries: [
        { rank: 1, user: { id: 'a', username: period === 'all' ? 'efsane' : 'kuleci_ayse' }, score: 9000, floors: 160 },
        { rank: 2, user: { id: 'b', username: 'mert' }, score: 7000, floors: 120 },
    ],
    me: { rank: 4, score: 3100 },
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
        <MemoryRouter initialEntries={['/oyun/kule']}>
            <Routes>
                <Route path="/oyun/kule" element={<TowerLobbyPage />} />
                <Route path="/oyun/kule/oyna" element={<PlayProbe />} />
            </Routes>
        </MemoryRouter>
    );

// jsdom'da WebGL yok: lobi kontrolünü (canvas.getContext('webgl2')) taklit et.
function mockWebGL(ok) {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type) {
        if (type === 'webgl2') return ok ? { getExtension: () => ({ loseContext() {} }) } : null;
        return orig ? orig.call(this, type) : null;
    };
    return () => {
        HTMLCanvasElement.prototype.getContext = orig;
    };
}

describe('TowerLobbyPage', () => {
    let restoreGL;
    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(towerApi).forEach((fn) => fn.mockReset());
        localStorage.clear();
        TOWER_RETRY.finish = [0, 0];
        Object.assign(auth, { isAuthenticated: false, user: null, loading: false });
        restoreGL?.();
        restoreGL = mockWebGL(true);
        towerApi.overview.mockResolvedValue(OVERVIEW);
        towerApi.leaderboard.mockImplementation(({ period }) => Promise.resolve(BOARD(period)));
        towerApi.abandon.mockResolvedValue({});
    });

    it('misafir: antrenman, yerel rekor, giriş çağrısı; sunucuya istek yok', async () => {
        localStorage.setItem(STORAGE_KEYS.guestBest, JSON.stringify({ score: 420, floor: 21 }));
        renderLobby();
        expect(screen.getByRole('heading', { name: 'Herkesler Yükseliyor' })).toBeInTheDocument();
        expect(screen.getByText(/Antrenman modunda oynuyorsun/)).toBeInTheDocument();
        expect(screen.getByText('420')).toBeInTheDocument();
        expect(screen.getByText('21 kat')).toBeInTheDocument();
        expect(screen.getByText(/Antrenmanda soru katı yok/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Antrenmana Başla/ }));
        expect(await screen.findByText(/OYUN practice/)).toBeInTheDocument();
        expect(towerApi.start).not.toHaveBeenCalled();
        expect(towerApi.overview).not.toHaveBeenCalled();
        expect(towerApi.leaderboard).not.toHaveBeenCalled();
    });

    it('üye: karne, haftalık liderlik ve dönem sekmesi', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
        renderLobby();
        expect(await screen.findByText('5.120')).toBeInTheDocument();
        expect(screen.getByText('88 kat')).toBeInTheDocument();
        expect(screen.getByText('Haftalık sıran #4')).toBeInTheDocument();
        expect(screen.getByText('910 kat')).toBeInTheDocument();
        expect(await screen.findByText('kuleci_ayse')).toBeInTheDocument();
        expect(screen.getByText('160 kat')).toBeInTheDocument();
        expect(screen.getByText(/Senin sıran: #4/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Tüm zamanlar' }));
        expect(await screen.findByText('efsane')).toBeInTheDocument();
        expect(towerApi.leaderboard).toHaveBeenLastCalledWith({ period: 'all', gender: 'all', limit: 5 });
        expect(screen.getByRole('link', { name: /Karakterini düzenle/ })).toHaveAttribute('href', '/oyun/karakter');
    });

    it('üye başlatınca sunucuda kule açılır ve oyuna geçilir (çift tıklamada tek istek)', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
        let resolve;
        towerApi.start.mockReturnValue(new Promise((r) => (resolve = r)));
        renderLobby();
        const btn = await screen.findByRole('button', { name: /Yükselmeye Başla/ });
        fireEvent.click(btn);
        fireEvent.click(btn);
        expect(towerApi.start).toHaveBeenCalledTimes(1);
        resolve({ run: RUN });
        expect(await screen.findByText(/OYUN ranked run-9/)).toBeInTheDocument();
    });

    it('başlatma hatasında mesaj ve antrenman bağlantısı; bozuk kule terk edilir', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
        towerApi.start.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 429, data: { message: 'Çok hızlı gidiyorsun.' } } }));
        renderLobby();
        fireEvent.click(await screen.findByRole('button', { name: /Yükselmeye Başla/ }));
        const alert = await screen.findByText('Çok hızlı gidiyorsun.');
        expect(alert).toBeInTheDocument();

        towerApi.start.mockResolvedValueOnce({ run: { ...RUN, questions: [{ index: 0, question: { text: 'x', options: ['a'] } }] } });
        fireEvent.click(screen.getByRole('button', { name: /Yükselmeye Başla/ }));
        expect(await screen.findByText('Oyun verisi okunamadı. Birazdan tekrar dene.')).toBeInTheDocument();
        expect(towerApi.abandon).toHaveBeenCalledWith('run-9');

        fireEvent.click(screen.getByRole('button', { name: /antrenman modunda oyna/ }));
        expect(await screen.findByText(/OYUN practice/)).toBeInTheDocument();
    });

    it('sunucu sim sürümü farklıysa dereceli başlatma kapalı', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
        towerApi.overview.mockResolvedValue({ ...OVERVIEW, sim_version: 2 });
        renderLobby();
        expect(await screen.findByText(/Oyun güncellendi/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Yükselmeye Başla/ })).toBeDisabled();
    });

    it('WebGL yoksa uyarı ve başlatma kapalı', async () => {
        restoreGL();
        restoreGL = mockWebGL(false);
        renderLobby();
        expect(screen.getByText(/WebGL 2/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Antrenmana Başla/ })).toBeDisabled();
    });

    it('yarım kalan kule lobide otomatik gönderilir', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
        savePending({ userId: 'u1', runId: 'run-old', endTick: 1200, inputs: '50T', clientScore: 80 });
        towerApi.finish.mockResolvedValue({ result: { score: 80, floors: 6 } });
        renderLobby();
        await waitFor(() => expect(towerApi.finish).toHaveBeenCalledWith('run-old', { end_tick: 1200, inputs: '50T', client_score: 80 }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Yarım kalan kulen kaydedildi: 80 puan, 6 kat', { duration: 5000 }));
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
    });

    it('bekleyen gönderim ağ hatasında kalır ve "Tekrar dene" sunar; 409 kaydı siler', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
        savePending({ userId: 'u1', runId: 'run-old', endTick: 1200, inputs: '50T', clientScore: 80 });
        towerApi.finish.mockRejectedValue(Object.assign(new Error('net'), { response: undefined }));
        renderLobby();
        const box = await screen.findByText('Yarım kalan kulen henüz gönderilemedi.');
        expect(localStorage.getItem(STORAGE_KEYS.pending)).not.toBeNull();

        towerApi.finish.mockReset();
        towerApi.finish.mockRejectedValue(Object.assign(new Error('gone'), { response: { status: 409, data: { message: 'Kule yarıda bırakılmış.' } } }));
        fireEvent.click(within(box.parentElement).getByRole('button', { name: 'Tekrar dene' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Yarım kalan kulen kaydedilemedi: Kule yarıda bırakılmış.', { duration: 6000 }));
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
    });

    it('başka kullanıcının bekleyen kaydı gönderilmez', async () => {
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u2', username: 'mert', gender: 'male' } });
        savePending({ userId: 'u1', runId: 'run-old', endTick: 1200, inputs: '50T', clientScore: 80 });
        renderLobby();
        await screen.findByText('5.120');
        expect(towerApi.finish).not.toHaveBeenCalled();
    });
});
