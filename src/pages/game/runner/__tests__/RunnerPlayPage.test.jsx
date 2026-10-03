// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// CI / yoğun makinede jsdom render'ı yavaşlayabiliyor.
configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

const auth = { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' }, loading: false };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-confetti', () => ({ default: () => <div data-testid="confetti" /> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});
vi.mock('../../../../services/gameApi', () => ({
    gameApi: {
        startRunner: vi.fn(),
        runnerGate: vi.fn(),
        finishRunner: vi.fn(),
        abandonRunner: vi.fn(),
    },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (err, fallback) => err?.response?.data?.message || fallback || 'Hata',
}));
vi.mock('../engineLoader', () => ({ loadRunnerEngine: vi.fn() }));

import { gameApi } from '../../../../services/gameApi';
import { loadRunnerEngine } from '../engineLoader';
import RunnerPlayPage from '../RunnerPlayPage';
import { RUNNER_RETRY, RUNNER_SIM_VERSION, STORAGE_KEYS, finishRunOnce, loadPending } from '../../../../components/game/runner/runnerUtils';
import { defaultAvatar } from '../../../../game/avatar/catalog';

const RUN = {
    id: 'run-1',
    seed: 123456,
    sim_version: RUNNER_SIM_VERSION,
    gate_count: 2,
    started_at: '2026-10-02T10:00:00Z',
    gates: [
        { index: 0, question: { id: 11, text: 'Türkiye’nin başkenti neresidir?', options: ['İzmir', 'İstanbul', 'Ankara'], category: { name: 'Coğrafya' }, difficulty: 1 } },
        { index: 1, question: { id: 12, text: 'Suyun kimyasal formülü?', options: ['H2O', 'CO2', 'O2'], category: null, difficulty: 1 } },
    ],
};

const RESULT = {
    run: { id: 'run-1', status: 'finished' },
    score: 4321,
    distance_m: 870,
    coins: 42,
    correct_count: 1,
    gates_passed: 1,
    max_multiplier: 2,
    crashed: true,
    breakdown: { dist_points: 3500, coin_points: 420, gate_points: 401 },
    xp_earned: 29,
    level_before: 3,
    level_after: 3,
    level_up: false,
    new_best: true,
    best_score: 4321,
    weekly_rank: 7,
    badges_earned: [{ key: 'runner_first', name: 'İlk Koşu', description: 'İlk dereceli koşunu tamamla', icon: 'flag' }],
    player: null,
    gates: [{ index: 0, question: 'Türkiye’nin başkenti neresidir?', options: ['İzmir', 'İstanbul', 'Ankara'], chosen_lane: 2, correct_lane: 2, correct: true }],
};

let engine;
let opts;

function makeEngine({ webgl = true, snapshot } = {}) {
    // Motor gibi: pause/resume duraklatma durumunu değiştirir (isPaused ile okunur).
    let enginePaused = false;
    const controls = {
        start: vi.fn(),
        pause: vi.fn(() => {
            enginePaused = true;
        }),
        resume: vi.fn(() => {
            enginePaused = false;
        }),
        quit: vi.fn(() => opts.callbacks.onEnd({ endTick: 600, inputs: '75J', crashed: false, distance: 120, coins: 3, gates: [], localScore: 150 })),
        destroy: vi.fn(),
        setMuted: vi.fn(),
        setMusicEnabled: vi.fn(),
        setGateResult: vi.fn(),
        isPaused: vi.fn(() => enginePaused),
    };
    // Yeni motor: oyunu bitirmeden anlık görüntü (sayfa kapanırken kayıt için).
    if (snapshot !== undefined) controls.snapshot = vi.fn(() => snapshot);
    const mod = {
        isWebGLAvailable: vi.fn(() => webgl),
        createRunnerGame: vi.fn(async (o) => {
            opts = o;
            return controls;
        }),
    };
    return { controls, mod };
}

const netErr = () => Object.assign(new Error('Network Error'), { response: undefined });
const httpErr = (status, message) => Object.assign(new Error('http'), { response: { status, data: { message } } });

const LobbyProbe = () => {
    const loc = useLocation();
    return <div>LOBİ {loc.pathname}</div>;
};

function renderPlay(state, { strict = false } = {}) {
    const tree = (
        <MemoryRouter initialEntries={[{ pathname: '/oyun/kosu/oyna', state }]}>
            <Routes>
                <Route path="/oyun/kosu/oyna" element={<RunnerPlayPage />} />
                <Route path="/oyun/kosu" element={<LobbyProbe />} />
            </Routes>
        </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

async function startCountdown() {
    await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalled());
    await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
    act(() => opts.callbacks.onCountdown(3));
    act(() => opts.callbacks.onCountdown(0));
}

describe('RunnerPlayPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(gameApi).forEach((fn) => fn.mockReset());
        gameApi.abandonRunner.mockResolvedValue({ run: { id: 'run-1', status: 'abandoned' } });
        localStorage.clear();
        RUNNER_RETRY.gate = [0, 0];
        RUNNER_RETRY.finish = [0, 0];
        RUNNER_RETRY.settle = 4000;
        engine = makeEngine();
        loadRunnerEngine.mockResolvedValue(engine.mod);
        opts = null;
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
    });

    afterEach(async () => {
        // Sökülen sayfanın ertelenmiş "terk et" kararı bir sonraki teste sızmasın.
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        vi.restoreAllMocks();
        document.querySelectorAll('meta[name="viewport"]').forEach((m) => m.remove());
    });

    it('geçiş durumu yoksa lobiye yönlendirir', async () => {
        renderPlay(undefined);
        expect(await screen.findByText('LOBİ /oyun/kosu')).toBeInTheDocument();
        expect(loadRunnerEngine).not.toHaveBeenCalled();
    });

    it('motoru seed, kapılar ve karakterle kurar; gövde kaydırmasını kilitler', async () => {
        // v1'in yerel karakter seçimi artık motoru etkilemez: karakter avatar sisteminden.
        localStorage.setItem(STORAGE_KEYS.character, JSON.stringify({ body: 'erkek', palette: 2 }));
        localStorage.setItem(STORAGE_KEYS.muted, '1');
        renderPlay({ mode: 'ranked', run: RUN });
        await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(1));
        expect(opts.seed).toBe(123456);
        expect(opts.gates).toHaveLength(2);
        expect(opts.gates[0].question.options).toEqual(['İzmir', 'İstanbul', 'Ankara']);
        expect(opts.avatar).toEqual(defaultAvatar('female'));
        expect(opts.character).toBeUndefined();
        expect(opts.muted).toBe(true);
        expect(typeof opts.reducedMotion).toBe('boolean');
        expect(opts.container).toBe(screen.getByTestId('runner-stage'));
        expect(Object.keys(opts.callbacks).sort()).toEqual(['onCountdown', 'onCrash', 'onEnd', 'onError', 'onGateApproach', 'onGateCross', 'onHaptic', 'onHud']);
        expect(document.body.style.overflow).toBe('hidden');
        expect(document.documentElement.style.overscrollBehavior).toBe('none');
    });

    it('üyenin kayıtlı avatarı motora normalize edilerek verilir (bozuk alan varsayılana düşer)', async () => {
        const saved = { ...defaultAvatar('male'), hair: { style: 'mohawk', color: 8 }, acc: 'tac', trail: 'bilinmeyen' };
        Object.assign(auth, { user: { id: 'u1', username: 'mert', gender: 'male', detail: { game_avatar: saved } } });
        renderPlay({ mode: 'practice' });
        await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(1));
        expect(opts.avatar).toEqual({ ...saved, trail: 'none' });
    });

    it('motorun titreşim bildirimi SPA\'da tarayıcı titreşimine dönmez; kapı sonucu ve çarpma titreşir', async () => {
        const vib = vi.fn();
        Object.defineProperty(navigator, 'vibrate', { value: vib, configurable: true, writable: true });
        gameApi.runnerGate.mockResolvedValue({ gate: { index: 0, chosen_lane: 2, correct: true, correct_lane: 2 } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onHaptic('light'));
        expect(vib).not.toHaveBeenCalled();
        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));
        await waitFor(() => expect(vib).toHaveBeenCalledWith(30));
        act(() => opts.callbacks.onCrash());
        expect(vib).toHaveBeenLastCalledWith([90, 50, 90]);
        delete navigator.vibrate;
    });

    it('StrictMode çift bağlamada tek motor kurar, terk etmez; çıkışta destroy + abandon', async () => {
        const view = renderPlay({ mode: 'ranked', run: RUN }, { strict: true });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 20));
        expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(1);
        expect(engine.controls.destroy).not.toHaveBeenCalled();
        expect(gameApi.abandonRunner).not.toHaveBeenCalled();

        view.unmount();
        expect(engine.controls.destroy).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-1'));
        expect(document.body.style.overflow).toBe('');
    });

    it('kapıya yaklaşınca soruyu gösterir, geçişte kapıyı bildirir ve sonucu motora iletir', async () => {
        gameApi.runnerGate.mockResolvedValue({ gate: { index: 0, chosen_lane: 2, correct: true, correct_lane: 2, explanation: 'Ankara 1923’ten beri başkent.' } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();

        act(() => opts.callbacks.onHud({ score: 1234, distance: 350, coins: 12, multiplier: 1, speedKmh: 40, magnetPct: 50, shield: true, stumbling: false, tick: 900 }));
        expect(screen.getByTestId('runner-score')).toHaveTextContent('1.234');
        expect(screen.getByText('Kalkan aktif')).toBeInTheDocument();

        act(() => opts.callbacks.onGateApproach({ index: 0, seconds: 7 }));
        expect(screen.getByRole('heading', { name: 'Türkiye’nin başkenti neresidir?' })).toBeInTheDocument();
        expect(screen.getByText('Ankara')).toBeInTheDocument();
        // Soru sayfanın duyuru bölgesinde bir kez okunur; panelde canlı olan yalnızca geri bildirim.
        expect(document.querySelector('.sr-only[aria-live="polite"]')).toHaveTextContent('Kapı 1: Türkiye’nin başkenti neresidir? Sol: İzmir. Orta: İstanbul. Sağ: Ankara.');
        expect(screen.getByLabelText('Soru kapısı')).not.toHaveAttribute('aria-live');
        expect(screen.getByTestId('runner-gate-feedback')).toHaveAttribute('aria-live', 'polite');

        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));
        // Aynı kapı iki kez bildirilse de tek istek.
        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));

        expect(gameApi.runnerGate).toHaveBeenCalledTimes(1);
        expect(gameApi.runnerGate).toHaveBeenCalledWith('run-1', { gate: 0, lane: 2 });
        await waitFor(() => expect(engine.controls.setGateResult).toHaveBeenCalledWith(0, true, 2));
        expect(await screen.findByText(/Doğru! x2/)).toBeInTheDocument();
        expect(screen.getByTestId('runner-gate-feedback')).toHaveTextContent('Doğru! x2');
    });

    it('kapı çağrısını sessizce 2 kez yeniden dener; olmazsa "?" bırakır, setGateResult çağrılmaz', async () => {
        gameApi.runnerGate.mockRejectedValue(netErr());
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onGateApproach({ index: 0, seconds: 7 }));
        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 1 }));
        await waitFor(() => expect(gameApi.runnerGate).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(within(screen.getByLabelText('Soru kapısı')).getByText(/Bağlantı yavaş: bu kapı koşu sonunda değerlendirilecek/)).toBeInTheDocument());
        expect(engine.controls.setGateResult).not.toHaveBeenCalled();
    });

    it('kapı 5xx / 429 dönerse yeniden dener ve sonradan gelen sonucu uygular', async () => {
        gameApi.runnerGate
            .mockRejectedValueOnce(httpErr(503))
            .mockRejectedValueOnce(httpErr(429))
            .mockResolvedValueOnce({ gate: { index: 0, chosen_lane: 1, correct: false, correct_lane: 2, explanation: null } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 1 }));
        await waitFor(() => expect(engine.controls.setGateResult).toHaveBeenCalledWith(0, false, 2));
        expect(gameApi.runnerGate).toHaveBeenCalledTimes(3);
        expect(await screen.findByText(/Yanlış — doğru cevap: Sağ · Ankara/)).toBeInTheDocument();
    });

    it.each([
        [409, 'Çok erken.'],
        [422, 'Geçersiz kapı.'],
    ])('kapı %i dönerse yeniden denemez, "?" gösterir; sonraki kapı normal çalışır', async (status, msg) => {
        gameApi.runnerGate
            .mockRejectedValueOnce(httpErr(status, msg))
            .mockResolvedValueOnce({ gate: { index: 1, chosen_lane: 0, correct: true, correct_lane: 0, explanation: 'H2O.' } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();

        act(() => opts.callbacks.onGateApproach({ index: 0, seconds: 7 }));
        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 1 }));
        const panel = screen.getByLabelText('Soru kapısı');
        await waitFor(() => expect(within(panel).getByText(/Sonuç bekleniyor: bu kapı koşu sonunda değerlendirilecek/)).toBeInTheDocument());
        expect(within(panel).getByText('?')).toBeInTheDocument();
        expect(within(panel).queryByText(/Bağlantı yavaş/)).toBeNull();
        await new Promise((r) => setTimeout(r, 10));
        expect(gameApi.runnerGate).toHaveBeenCalledTimes(1);
        expect(engine.controls.setGateResult).not.toHaveBeenCalled();

        // Önceki kapı cevapsız kalsa da sonraki kapı gönderilir ve sonucu motora gider.
        act(() => opts.callbacks.onGateApproach({ index: 1, seconds: 7 }));
        expect(screen.getByRole('heading', { name: 'Suyun kimyasal formülü?' })).toBeInTheDocument();
        await act(async () => opts.callbacks.onGateCross({ index: 1, lane: 0 }));
        expect(gameApi.runnerGate).toHaveBeenLastCalledWith('run-1', { gate: 1, lane: 0 });
        await waitFor(() => expect(engine.controls.setGateResult).toHaveBeenCalledWith(1, true, 0));
        // Bilinmeyen kapı çarpanı değiştirmez: yalnızca kapı 1 doğru -> x2.
        expect(await screen.findByText(/Doğru! x2/)).toBeInTheDocument();
        expect(gameApi.runnerGate).toHaveBeenCalledTimes(2);
    });

    it('oyun bittiğinde yoldaki kapı isteği bitişi kilitlemez', async () => {
        RUNNER_RETRY.settle = 20;
        gameApi.runnerGate.mockReturnValue(new Promise(() => {}));
        gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));
        await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
        await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledTimes(1));
        expect(await screen.findByText('4.321 puan')).toBeInTheDocument();
    });

    it('oyun bittikten sonra gelen kapı sonucu motora uygulanmaz; açıklama sonuçta görünür', async () => {
        let resolveGate;
        gameApi.runnerGate.mockReturnValue(new Promise((r) => (resolveGate = r)));
        let resolveFinish;
        gameApi.finishRunner.mockReturnValue(new Promise((r) => (resolveFinish = r)));
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));
        await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
        expect(screen.getByText(/Koşun doğrulanıyor/)).toBeInTheDocument();
        expect(gameApi.finishRunner).not.toHaveBeenCalled();

        await act(async () => resolveGate({ gate: { index: 0, chosen_lane: 2, correct: true, correct_lane: 2, explanation: 'Ankara 1923’ten beri başkent.' } }));
        await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledTimes(1));
        expect(engine.controls.setGateResult).not.toHaveBeenCalled();
        await act(async () => resolveFinish({ result: { ...RESULT, new_best: false } }));
        expect(await screen.findByText('Ankara 1923’ten beri başkent.')).toBeInTheDocument();
    });

    it('oyun bitince finish gönderir, sonuç ekranını gösterir; koşu terk edilmez', async () => {
        gameApi.runnerGate.mockResolvedValue({ gate: { index: 0, chosen_lane: 2, correct: true, correct_lane: 2, explanation: 'Ankara 1923’ten beri başkent.' } });
        gameApi.finishRunner.mockResolvedValue({ result: RESULT });
        const view = renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));

        await act(async () =>
            opts.callbacks.onEnd({ endTick: 3120, inputs: '75J,40L', crashed: true, distance: 870, coins: 42, gates: [{ index: 0, lane: 2 }], localScore: 4321 })
        );

        await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledWith('run-1', { end_tick: 3120, inputs: '75J,40L', client_score: 4321 }));
        expect(await screen.findByRole('heading', { name: /Yeni rekor/ })).toBeInTheDocument();
        expect(screen.getByText('4.321 puan')).toBeInTheDocument();
        expect(screen.getByText('870 m')).toBeInTheDocument();
        expect(screen.getByText('1/1')).toBeInTheDocument();
        expect(screen.getByText('x2')).toBeInTheDocument();
        expect(screen.getByText('+29 XP')).toBeInTheDocument();
        expect(screen.getByText('Haftalık sıran: #7')).toBeInTheDocument();
        expect(screen.getByText('İlk Koşu')).toBeInTheDocument();
        expect(screen.getByText('Ankara 1923’ten beri başkent.')).toBeInTheDocument();
        // Motor sonuç ekranında kapatılır, bekleyen kayıt temizlenir.
        expect(engine.controls.destroy).toHaveBeenCalled();
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();

        view.unmount();
        await new Promise((r) => setTimeout(r, 10));
        expect(gameApi.abandonRunner).not.toHaveBeenCalled();
    });

    it('finish 3 denemede de başarısızsa bekleyen kaydı saklar, "Tekrar dene" ile gönderir', async () => {
        gameApi.finishRunner.mockRejectedValueOnce(netErr()).mockRejectedValueOnce(httpErr(503)).mockRejectedValueOnce(netErr());
        const view = renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '10L', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));

        expect(await screen.findByRole('heading', { name: 'Koşun gönderilemedi' })).toBeInTheDocument();
        expect(gameApi.finishRunner).toHaveBeenCalledTimes(3);
        const pending = JSON.parse(localStorage.getItem(STORAGE_KEYS.pending));
        expect(pending).toMatchObject({ run_id: 'run-1', end_tick: 1200, inputs: '10L', client_score: 500, user_id: 'u1' });

        gameApi.finishRunner.mockResolvedValueOnce({ result: { ...RESULT, new_best: false, score: 500 } });
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        expect(await screen.findByText('500 puan')).toBeInTheDocument();
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();

        view.unmount();
        await new Promise((r) => setTimeout(r, 10));
        expect(gameApi.abandonRunner).not.toHaveBeenCalled();
    });

    it('sayfadan çıkılırsa finish bekleyen koşu terk edilmez', async () => {
        gameApi.finishRunner.mockRejectedValue(netErr());
        const view = renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
        await screen.findByRole('heading', { name: 'Koşun gönderilemedi' });
        view.unmount();
        await new Promise((r) => setTimeout(r, 10));
        expect(gameApi.abandonRunner).not.toHaveBeenCalled();
        expect(localStorage.getItem(STORAGE_KEYS.pending)).not.toBeNull();
    });

    it('422 reddinde anlaşılır mesaj gösterir ve bekleyen kaydı siler, yeniden denemez', async () => {
        gameApi.finishRunner.mockRejectedValue(httpErr(422, 'Koşu doğrulanamadı: zaman tutarsız.'));
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '10L', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
        expect(await screen.findByRole('heading', { name: 'Koşu kaydedilmedi' })).toBeInTheDocument();
        expect(screen.getByText('Koşu doğrulanamadı: zaman tutarsız.')).toBeInTheDocument();
        expect(gameApi.finishRunner).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
    });

    it('Esc ile duraklatır ve devam eder; menüden "Bitir ve kaydet" koşuyu bitirir', async () => {
        gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false, score: 150 } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('dialog', { name: 'Mola' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Devam et/ })).toHaveFocus();

        fireEvent.keyDown(window, { key: 'p' });
        expect(engine.controls.resume).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
        fireEvent.click(screen.getByRole('button', { name: /Bitir ve kaydet/ }));
        expect(engine.controls.quit).toHaveBeenCalled();
        await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledWith('run-1', { end_tick: 600, inputs: '75J', client_score: 150 }));
    });

    it('sekme gizlenince duraklatma menüsünü açar', async () => {
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => {
            window.dispatchEvent(new Event('blur'));
        });
        expect(engine.controls.pause).toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Mola' })).toBeInTheDocument();
    });

    it('çarpma animasyonunda (motor duraklamıyor) mola menüsü açılmaz', async () => {
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        // Motor 'crashing' aşamasında pause() etkisizdir; ~1 sn sonra onEnd gelir.
        engine.controls.pause.mockImplementation(() => {});
        fireEvent.keyDown(window, { key: 'Escape' });
        act(() => {
            window.dispatchEvent(new Event('blur'));
        });
        expect(engine.controls.pause).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('dialog', { name: 'Mola' })).toBeNull();
    });

    it('menüden "Çık" lobiye döner ve açık koşuyu sessizce terk eder', async () => {
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
        fireEvent.click(screen.getByRole('button', { name: /Çık/ }));
        expect(await screen.findByText('LOBİ /oyun/kosu')).toBeInTheDocument();
        expect(engine.controls.destroy).toHaveBeenCalled();
        await waitFor(() => expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-1'));
    });

    it('ses butonu motoru ve tercihi günceller', async () => {
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        fireEvent.click(screen.getByRole('button', { name: 'Sesi kapat' }));
        expect(engine.controls.setMuted).toHaveBeenCalledWith(true);
        expect(localStorage.getItem(STORAGE_KEYS.muted)).toBe('1');
        expect(screen.getByRole('button', { name: 'Sesi aç' })).toBeInTheDocument();
    });

    it('WebGL yoksa anlaşılır mesaj gösterir ve dereceli koşuyu kapatır', async () => {
        engine = makeEngine({ webgl: false });
        loadRunnerEngine.mockResolvedValue(engine.mod);
        renderPlay({ mode: 'ranked', run: RUN });
        expect(await screen.findByRole('heading', { name: '3D desteklenmiyor' })).toBeInTheDocument();
        expect(screen.getByText(/WebGL/)).toBeInTheDocument();
        expect(engine.mod.createRunnerGame).not.toHaveBeenCalled();
        expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-1');
    });

    it('dereceli koşuda grafik bağlamı kaybolursa koşu bitirilip kaydedilir (düşürülmez)', async () => {
        gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false, score: 150 } });
        const view = renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onError(new Error('context lost')));
        expect(engine.controls.quit).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledWith('run-1', { end_tick: 600, inputs: '75J', client_score: 150 }));
        expect(await screen.findByText('Grafik durdu, koşun kaydedildi.')).toBeInTheDocument();
        expect(screen.getByText('150 puan')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Bir aksilik oldu' })).toBeNull();
        view.unmount();
        await new Promise((r) => setTimeout(r, 10));
        expect(gameApi.abandonRunner).not.toHaveBeenCalled();
    });

    it('antrenmanda bağlam kaybı hata ekranı ve yeniden başlatma sunar', async () => {
        Object.assign(auth, { isAuthenticated: false, user: null });
        renderPlay({ mode: 'practice' });
        await startCountdown();
        act(() => opts.callbacks.onError(new Error('context lost')));
        expect(await screen.findByRole('heading', { name: 'Bir aksilik oldu' })).toBeInTheDocument();
        expect(engine.controls.quit).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Yeniden başlat/ }));
        await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(2));
    });

    it('bağlam kaybında quit çalışmazsa hata ekranı; yeniden başlatma yeni koşu açar', async () => {
        gameApi.startRunner.mockResolvedValue({ run: { ...RUN, id: 'run-2', seed: 999 } });
        engine.controls.quit.mockImplementation(() => {
            throw new Error('gl');
        });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onError(new Error('context lost')));
        expect(await screen.findByRole('heading', { name: 'Bir aksilik oldu' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Yeniden başlat/ }));
        await waitFor(() => expect(gameApi.startRunner).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(2));
        expect(opts.seed).toBe(999);
    });

    it('motor modülü indi ama kurulum (WebGL bağlamı) başarısızsa "3D desteklenmiyor" der ve koşuyu kapatır', async () => {
        engine.mod.createRunnerGame.mockImplementation(async (o) => {
            opts = o;
            // Gerçek motor gibi: önce onError, sonra fırlat.
            o.callbacks.onError(new Error('Oyun başlatılamadı'));
            throw new Error('Oyun başlatılamadı');
        });
        renderPlay({ mode: 'ranked', run: RUN });
        expect(await screen.findByRole('heading', { name: '3D desteklenmiyor' })).toBeInTheDocument();
        expect(screen.queryByText(/Bağlantını kontrol/)).toBeNull();
        expect(screen.getByText(/iOS 15/)).toBeInTheDocument();
        expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-1');
    });

    it('motor parçası inemezse (ağ) bağlantı hatası gösterir', async () => {
        loadRunnerEngine.mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
        renderPlay({ mode: 'practice' });
        expect(await screen.findByText('Oyun yüklenemedi. Bağlantını kontrol edip tekrar dene.')).toBeInTheDocument();
    });

    it('antrenman: sunucuya gitmez, rastgele tohum ve kapısız koşar, yerel rekoru saklar', async () => {
        Object.assign(auth, { isAuthenticated: false, user: null });
        const view = renderPlay({ mode: 'practice' });
        await startCountdown();
        expect(opts.gates).toEqual([]);
        expect(Number.isInteger(opts.seed) && opts.seed > 0).toBe(true);
        expect(screen.getByText('Antrenman')).toBeInTheDocument();

        await act(async () => opts.callbacks.onEnd({ endTick: 900, inputs: '1J', crashed: true, distance: 260, coins: 9, gates: [], localScore: 610 }));
        expect(await screen.findByRole('heading', { name: /Yeni rekor/ })).toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.guestBest))).toEqual({ score: 610, distance: 260 });
        expect(screen.getByRole('link', { name: /Giriş yap/ })).toHaveAttribute('href', '/login');
        expect(gameApi.finishRunner).not.toHaveBeenCalled();
        expect(gameApi.startRunner).not.toHaveBeenCalled();

        // Tekrar koş: yeni tohumla yeni motor.
        fireEvent.click(screen.getByRole('button', { name: /Tekrar Koş/ }));
        await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(2));
        view.unmount();
        await new Promise((r) => setTimeout(r, 10));
        expect(gameApi.abandonRunner).not.toHaveBeenCalled();
    });

    it('sonuç ekranında paylaş: Web Share yoksa panoya kopyalar', async () => {
        const toast = (await import('react-hot-toast')).default;
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
        fireEvent.click(await screen.findByRole('button', { name: /Paylaş/ }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        expect(writeText.mock.calls[0][0]).toContain('870 m');
        expect(writeText.mock.calls[0][0]).toContain('/oyun/kosu');
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sonuç panoya kopyalandı!'));
    });

    describe('çentikli ekran (viewport-fit=cover)', () => {
        const ORIGINAL = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, interactive-widget=resizes-content';
        const addMeta = (content) => {
            const m = document.createElement('meta');
            m.setAttribute('name', 'viewport');
            m.setAttribute('content', content);
            document.head.appendChild(m);
            return m;
        };

        it('oyun açıkken ekler, çıkınca orijinal içeriği aynen geri yükler (StrictMode)', async () => {
            const meta = addMeta(ORIGINAL);
            const view = renderPlay({ mode: 'ranked', run: RUN }, { strict: true });
            await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
            expect(meta.getAttribute('content')).toBe(`${ORIGINAL}, viewport-fit=cover`);
            view.unmount();
            expect(meta.getAttribute('content')).toBe(ORIGINAL);
        });

        it('var olan viewport-fit değerini değiştirir; meta yoksa ekleyip çıkışta kaldırır', async () => {
            const meta = addMeta('width=device-width, viewport-fit=auto');
            const view = renderPlay({ mode: 'practice' });
            await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
            expect(meta.getAttribute('content')).toBe('width=device-width, viewport-fit=cover');
            view.unmount();
            expect(meta.getAttribute('content')).toBe('width=device-width, viewport-fit=auto');
            meta.remove();

            const view2 = renderPlay({ mode: 'practice' });
            await waitFor(() => expect(document.querySelector('meta[name="viewport"]')).not.toBeNull());
            expect(document.querySelector('meta[name="viewport"]').getAttribute('content')).toBe('viewport-fit=cover');
            view2.unmount();
            expect(document.querySelector('meta[name="viewport"]')).toBeNull();
        });

        it('HUD, mola menüsü ve hata panelleri güvenli alan dolgusu kullanır', async () => {
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
            const overlay = screen.getByRole('dialog', { name: 'Mola' }).parentElement;
            expect(overlay.className).toContain('env(safe-area-inset-bottom)');
            expect(overlay.className).toContain('env(safe-area-inset-left)');
            expect(screen.getByTestId('runner-score').closest('.pointer-events-none').className).toContain('env(safe-area-inset-top)');
        });
    });

    describe('bitiş kalıcı hataları', () => {
        it('finish 409 (koşu kapanmış): yeniden denemez, bekleyen kaydı siler, anlaşılır mesaj gösterir', async () => {
            gameApi.finishRunner.mockRejectedValue(httpErr(409, 'Koşu yarıda bırakılmış.'));
            const view = renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '10L', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
            expect(await screen.findByRole('heading', { name: 'Koşu kaydedilmedi' })).toBeInTheDocument();
            expect(screen.getByText('Koşu yarıda bırakılmış.')).toBeInTheDocument();
            expect(screen.getByText(/puan ve XP eklenmedi/)).toBeInTheDocument();
            expect(gameApi.finishRunner).toHaveBeenCalledTimes(1);
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
            // Panel açılınca odak ilk eyleme.
            expect(screen.getByRole('button', { name: /Tekrar Koş/ })).toHaveFocus();
            view.unmount();
            await new Promise((r) => setTimeout(r, 10));
            expect(gameApi.abandonRunner).not.toHaveBeenCalled();
        });

        it('finish 409 mesajsız gelirse genel açıklama gösterir', async () => {
            gameApi.finishRunner.mockRejectedValue(httpErr(409));
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
            expect(await screen.findByText(/sunucuda kapanmış/)).toBeInTheDocument();
        });

        it('kayıt başarılı ama sonuç okunamazsa "kaydedilmedi" demez', async () => {
            gameApi.finishRunner.mockResolvedValue({});
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
            expect(await screen.findByRole('heading', { name: 'Koşun kaydedildi' })).toBeInTheDocument();
            expect(screen.queryByText('Koşu kaydedilmedi')).toBeNull();
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        it('bitiş gönderilirken sayfadan çıkılırsa istek tamamlanır, kayıt temizlenir, koşu terk edilmez', async () => {
            let resolveFinish;
            gameApi.finishRunner.mockReturnValue(new Promise((r) => (resolveFinish = r)));
            const view = renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
            await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledTimes(1));
            expect(localStorage.getItem(STORAGE_KEYS.pending)).not.toBeNull();
            view.unmount();
            await act(async () => resolveFinish({ result: RESULT }));
            await new Promise((r) => setTimeout(r, 10));
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
            expect(gameApi.abandonRunner).not.toHaveBeenCalled();
        });
    });

    describe('yarış durumları', () => {
        it('"Yeniden başlat"a çift tıklama tek start gönderir', async () => {
            let resolveStart;
            gameApi.startRunner.mockReturnValue(new Promise((r) => (resolveStart = r)));
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
            const btn = screen.getByRole('button', { name: /Yeniden başlat/ });
            // Aynı act içinde: React henüz yeniden çizmedi, busy state hâlâ false.
            act(() => {
                btn.click();
                btn.click();
            });
            expect(gameApi.startRunner).toHaveBeenCalledTimes(1);
            await act(async () => resolveStart({ run: { ...RUN, id: 'run-2', seed: 999 } }));
            await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(2));
            expect(opts.seed).toBe(999);
        });

        it('yeniden başlatınca eski motorun geri çağrıları yeni koşuyu etkilemez', async () => {
            gameApi.startRunner.mockResolvedValue({ run: { ...RUN, id: 'run-2', seed: 999 } });
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            const old = opts.callbacks;
            act(() => old.onHud({ score: 700, distance: 10, coins: 0, multiplier: 1, tick: 60 }));
            fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
            fireEvent.click(screen.getByRole('button', { name: /Yeniden başlat/ }));
            await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(2));
            expect(engine.controls.destroy).toHaveBeenCalled();
            await waitFor(() => expect(engine.controls.start).toHaveBeenCalledTimes(2));
            act(() => opts.callbacks.onCountdown(0));
            expect(screen.getByTestId('runner-score')).toHaveTextContent('0');

            act(() => {
                old.onHud({ score: 99999, distance: 999, coins: 9, multiplier: 1, tick: 9000 });
                old.onGateApproach({ index: 0, seconds: 7 });
                old.onGateCross({ index: 0, lane: 2 });
                old.onEnd({ endTick: 9000, inputs: '', crashed: true, distance: 999, coins: 9, gates: [], localScore: 99999 });
            });
            await new Promise((r) => setTimeout(r, 10));
            expect(screen.getByTestId('runner-score')).toHaveTextContent('0');
            expect(screen.queryByLabelText('Soru kapısı')).toBeNull();
            expect(gameApi.runnerGate).not.toHaveBeenCalled();
            expect(gameApi.finishRunner).not.toHaveBeenCalled();
        });

        it('yeni koşu açılırken sayfadan çıkılırsa açılan koşu terk edilir', async () => {
            let resolveStart;
            gameApi.startRunner.mockReturnValue(new Promise((r) => (resolveStart = r)));
            const view = renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
            fireEvent.click(screen.getByRole('button', { name: /Yeniden başlat/ }));
            view.unmount();
            await act(async () => resolveStart({ run: { ...RUN, id: 'run-2', seed: 999 } }));
            await waitFor(() => expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-2'));
            expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(1);
        });
    });

    describe('dayanıklılık ve erişilebilirlik', () => {
        it('localStorage erişimi hata fırlatsa da (Safari gizli sekme) oyun oynanır', async () => {
            vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
                throw new DOMException('denied', 'SecurityError');
            });
            vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new DOMException('quota', 'QuotaExceededError');
            });
            vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
                throw new DOMException('denied', 'SecurityError');
            });
            Object.assign(auth, { isAuthenticated: false, user: null });
            renderPlay({ mode: 'practice' });
            await startCountdown();
            // Misafir: varsayılan karakter.
            expect(opts.avatar).toEqual(defaultAvatar());
            expect(opts.muted).toBe(false);
            fireEvent.click(screen.getByRole('button', { name: 'Sesi kapat' }));
            expect(engine.controls.setMuted).toHaveBeenCalledWith(true);
            await act(async () => opts.callbacks.onEnd({ endTick: 900, inputs: '', crashed: true, distance: 260, coins: 9, gates: [], localScore: 610 }));
            expect(await screen.findByRole('heading', { name: /Yeni rekor/ })).toBeInTheDocument();
        });

        it('dereceli bitiş: depolama kapalıysa da finish gönderilir', async () => {
            vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new DOMException('quota', 'QuotaExceededError');
            });
            gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false } });
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
            expect(await screen.findByText('4.321 puan')).toBeInTheDocument();
        });

        it('paylaşım iptali (AbortError) hata gibi gösterilmez, panoya da kopyalanmaz', async () => {
            const toast = (await import('react-hot-toast')).default;
            const share = vi.fn(() => Promise.reject(new DOMException('cancel', 'AbortError')));
            const writeText = vi.fn(() => Promise.resolve());
            Object.defineProperty(navigator, 'share', { value: share, configurable: true });
            Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
            try {
                gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false } });
                renderPlay({ mode: 'ranked', run: RUN });
                await startCountdown();
                await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
                fireEvent.click(await screen.findByRole('button', { name: /Paylaş/ }));
                await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
                await waitFor(() => expect(screen.getByRole('button', { name: /Paylaş/ })).not.toBeDisabled());
                expect(writeText).not.toHaveBeenCalled();
                expect(toast.error).not.toHaveBeenCalled();
                expect(toast.success).not.toHaveBeenCalled();
            } finally {
                delete navigator.share;
            }
        });

        it('paylaşım sayfası açıkken ikinci dokunuş yeni paylaşım başlatmaz', async () => {
            let finishShare;
            const share = vi.fn(() => new Promise((r) => (finishShare = r)));
            Object.defineProperty(navigator, 'share', { value: share, configurable: true });
            try {
                gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false } });
                renderPlay({ mode: 'ranked', run: RUN });
                await startCountdown();
                await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
                const btn = await screen.findByRole('button', { name: /Paylaş/ });
                act(() => {
                    btn.click();
                    btn.click();
                });
                expect(share).toHaveBeenCalledTimes(1);
                expect(btn).toBeDisabled();
                await act(async () => finishShare());
                expect(btn).not.toBeDisabled();
            } finally {
                delete navigator.share;
            }
        });

        it('mola menüsü odağı alır; "Devam et" ile odak oyun alanına döner', async () => {
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            expect(screen.getByTestId('runner-stage')).toHaveFocus();
            fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
            expect(screen.getByRole('button', { name: /Devam et/ })).toHaveFocus();
            fireEvent.click(screen.getByRole('button', { name: /Devam et/ }));
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(screen.getByTestId('runner-stage')).toHaveFocus();
        });

        it('geri sayım biterken mola menüsü açıksa odağı menüden çalmaz', async () => {
            renderPlay({ mode: 'ranked', run: RUN });
            await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
            act(() => opts.callbacks.onCountdown(3));
            fireEvent.keyDown(window, { key: 'Escape' });
            const resumeBtn = screen.getByRole('button', { name: /Devam et/ });
            expect(resumeBtn).toHaveFocus();
            act(() => opts.callbacks.onCountdown(0));
            expect(resumeBtn).toHaveFocus();
        });

        it('oyun alanı ekran okuyucuya adıyla tanıtılır; sonuç ekranında odak başlığa gider', async () => {
            gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false } });
            renderPlay({ mode: 'ranked', run: RUN });
            expect(screen.getByRole('application', { name: /Oyun alanı/ })).toBe(screen.getByTestId('runner-stage'));
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
            const heading = await screen.findByRole('heading', { level: 1 });
            expect(heading).toHaveFocus();
        });

        it('bitiş gönderilemezse "Tekrar dene" odak alır', async () => {
            gameApi.finishRunner.mockRejectedValue(netErr());
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
            await screen.findByRole('heading', { name: 'Koşun gönderilemedi' });
            expect(screen.getByRole('button', { name: /Tekrar dene/ })).toHaveFocus();
        });
    });

    describe('soru açıkken mola (dereceli)', () => {
        it('Esc ile mola: soru gizlenir, süre çubuğu durur; ceza yok, kapı normal gider', async () => {
            gameApi.runnerGate.mockResolvedValue({ gate: { index: 0, chosen_lane: 2, correct: false, correct_lane: 2, explanation: null } });
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            act(() => opts.callbacks.onGateApproach({ index: 0, seconds: 6.8 }));
            const timer = screen.getByTestId('runner-gate-timer');
            expect(timer.style.animationDuration).toBe('6.8s');
            expect(timer.style.animationPlayState).toBe('running');

            fireEvent.keyDown(window, { key: 'Escape' });
            const dialog = screen.getByRole('dialog', { name: 'Mola' });
            expect(dialog).not.toHaveTextContent(/yanlış sayıl/);
            expect(screen.getByTestId('runner-qpanel-wrap').className).toContain('invisible');
            expect(screen.getByTestId('runner-gate-timer').style.animationPlayState).toBe('paused');

            fireEvent.keyDown(window, { key: 'Escape' });
            // Devam geri sayımında da çubuk durur; sayaç bitince akar.
            act(() => opts.callbacks.onCountdown(3));
            expect(screen.getByTestId('runner-qpanel-wrap').className).not.toContain('invisible');
            expect(screen.getByTestId('runner-gate-timer').style.animationPlayState).toBe('paused');
            act(() => opts.callbacks.onCountdown(0));
            expect(screen.getByTestId('runner-gate-timer').style.animationPlayState).toBe('running');

            await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));
            expect(gameApi.runnerGate).toHaveBeenCalledWith('run-1', { gate: 0, lane: 2 });
            expect(await screen.findByText(/Yanlış — doğru cevap: Sağ · Ankara/)).toBeInTheDocument();
            expect(screen.queryByText(/Molada soru açıktı/)).toBeNull();
        });

        it('sekme değiştirme (blur) ile otomatik mola kapıyı etkilemez', async () => {
            gameApi.runnerGate.mockResolvedValue({ gate: { index: 0, chosen_lane: 2, correct: true, correct_lane: 2 } });
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            act(() => opts.callbacks.onGateApproach({ index: 0, seconds: 7 }));
            act(() => {
                window.dispatchEvent(new Event('blur'));
            });
            expect(screen.getByRole('dialog', { name: 'Mola' })).toBeInTheDocument();
            expect(screen.getByTestId('runner-qpanel-wrap').className).toContain('invisible');
            fireEvent.click(screen.getByRole('button', { name: /Devam et/ }));
            await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));
            expect(gameApi.runnerGate).toHaveBeenCalledWith('run-1', { gate: 0, lane: 2 });
            expect(await screen.findByText(/Doğru! x2/)).toBeInTheDocument();
        });
    });

    describe('müzik', () => {
        it('motor kayıtlı müzik tercihiyle başlar (varsayılan açık)', async () => {
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            expect(opts.musicEnabled).toBe(true);
        });

        it('kapalı kaydedilmişse motor müziksiz başlar', async () => {
            localStorage.setItem(STORAGE_KEYS.music, '0');
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            expect(opts.musicEnabled).toBe(false);
        });

        it('mola menüsündeki anahtar müziği kapatıp açar, tercihi saklar; ses ayarına dokunmaz', async () => {
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            fireEvent.keyDown(window, { key: 'Escape' });
            const sw = screen.getByRole('switch', { name: 'Müzik' });
            expect(sw).toHaveAttribute('aria-checked', 'true');
            expect(sw).toHaveTextContent('Müzik: Açık');
            fireEvent.click(sw);
            expect(engine.controls.setMusicEnabled).toHaveBeenLastCalledWith(false);
            expect(screen.getByRole('switch', { name: 'Müzik' })).toHaveAttribute('aria-checked', 'false');
            expect(screen.getByRole('switch', { name: 'Müzik' })).toHaveTextContent('Müzik: Kapalı');
            expect(localStorage.getItem(STORAGE_KEYS.music)).toBe('0');
            fireEvent.click(screen.getByRole('switch', { name: 'Müzik' }));
            expect(engine.controls.setMusicEnabled).toHaveBeenLastCalledWith(true);
            expect(localStorage.getItem(STORAGE_KEYS.music)).toBe('1');
            expect(engine.controls.setMuted).not.toHaveBeenCalled();
        });
    });

    describe('sayfa kapanması / geri hareketi', () => {
        it('dereceli koşu girdilerle sürerken sayfa sökülürse koşu bitirilip gönderilir, terk edilmez', async () => {
            engine = makeEngine({ snapshot: { endTick: 2400, inputs: '75J,40L', localScore: 900 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            gameApi.finishRunner.mockResolvedValue({ result: RESULT });
            const view = renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            view.unmount();
            await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledWith('run-1', { end_tick: 2400, inputs: '75J,40L', client_score: 900 }));
            await new Promise((r) => setTimeout(r, 10));
            expect(gameApi.abandonRunner).not.toHaveBeenCalled();
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        it('sökülürken anlık görüntü motor kapanmadan (destroy öncesi) alınır', async () => {
            engine = makeEngine({ snapshot: { endTick: 2400, inputs: '75J,40L', localScore: 900 } });
            // Gerçek motor gibi: destroy'dan sonra alınan görüntü işe yaramaz sayılsın.
            let destroyed = false;
            engine.controls.destroy.mockImplementation(() => {
                destroyed = true;
            });
            engine.controls.snapshot.mockImplementation(() => (destroyed ? null : { endTick: 2400, inputs: '75J,40L', localScore: 900 }));
            loadRunnerEngine.mockResolvedValue(engine.mod);
            gameApi.finishRunner.mockResolvedValue({ result: RESULT });
            const view = renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            view.unmount();
            expect(engine.controls.snapshot).toHaveBeenCalled();
            expect(engine.controls.destroy).toHaveBeenCalled();
            expect(engine.controls.snapshot.mock.invocationCallOrder[0]).toBeLessThan(engine.controls.destroy.mock.invocationCallOrder[0]);
            await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledWith('run-1', { end_tick: 2400, inputs: '75J,40L', client_score: 900 }));
            expect(gameApi.abandonRunner).not.toHaveBeenCalled();
        });

        it('StrictMode altında da sökülünce koşu bitirilip gönderilir', async () => {
            engine = makeEngine({ snapshot: { endTick: 3000, inputs: '10R', localScore: 1200 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            gameApi.finishRunner.mockResolvedValue({ result: RESULT });
            const view = renderPlay({ mode: 'ranked', run: RUN }, { strict: true });
            await startCountdown();
            view.unmount();
            await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledWith('run-1', { end_tick: 3000, inputs: '10R', client_score: 1200 }));
            await new Promise((r) => setTimeout(r, 10));
            expect(gameApi.finishRunner).toHaveBeenCalledTimes(1);
            expect(gameApi.abandonRunner).not.toHaveBeenCalled();
        });

        it('sökülürken bitiş gönderilemezse kayıt lobide gönderilmek üzere kalır', async () => {
            engine = makeEngine({ snapshot: { endTick: 2400, inputs: '75J', localScore: 900 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            gameApi.finishRunner.mockRejectedValue(netErr());
            const view = renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            view.unmount();
            await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalledTimes(3));
            await new Promise((r) => setTimeout(r, 10));
            expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pending))).toMatchObject({ run_id: 'run-1', end_tick: 2400, inputs: '75J', client_score: 900 });
            expect(gameApi.abandonRunner).not.toHaveBeenCalled();
        });

        it('koşu henüz başlamadıysa (endTick 0) sökülünce terk edilir', async () => {
            engine = makeEngine({ snapshot: { endTick: 0, inputs: '', localScore: 0 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            const view = renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            view.unmount();
            await waitFor(() => expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-1'));
            expect(gameApi.finishRunner).not.toHaveBeenCalled();
        });

        it('menüden "Çık" bilerek çıkıştır: girdi olsa da koşu kaydedilmez, ara kayıt silinir', async () => {
            engine = makeEngine({ snapshot: { endTick: 2400, inputs: '75J', localScore: 900 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            act(() => {
                window.dispatchEvent(new Event('pagehide'));
            });
            expect(localStorage.getItem(STORAGE_KEYS.pending)).not.toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
            fireEvent.click(screen.getByRole('button', { name: /Çık/ }));
            expect(await screen.findByText('LOBİ /oyun/kosu')).toBeInTheDocument();
            await waitFor(() => expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-1'));
            expect(gameApi.finishRunner).not.toHaveBeenCalled();
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        it('pagehide / sekme gizlenince o anki girdiler bekleyen kayıt olarak saklanır, koşu bitmez', async () => {
            engine = makeEngine({ snapshot: { endTick: 1800, inputs: '12L', localScore: 640 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            act(() => {
                window.dispatchEvent(new Event('pagehide'));
            });
            expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pending))).toMatchObject({ run_id: 'run-1', end_tick: 1800, inputs: '12L', client_score: 640, user_id: 'u1' });
            expect(engine.controls.quit).not.toHaveBeenCalled();
            expect(gameApi.finishRunner).not.toHaveBeenCalled();

            engine.controls.snapshot.mockReturnValue({ endTick: 2000, inputs: '12L,5J', localScore: 700 });
            const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
            act(() => {
                document.dispatchEvent(new Event('visibilitychange'));
            });
            vis.mockRestore();
            expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pending))).toMatchObject({ end_tick: 2000, inputs: '12L,5J' });
        });

        it('antrenmanda pagehide hiçbir şey saklamaz', async () => {
            Object.assign(auth, { isAuthenticated: false, user: null });
            engine = makeEngine({ snapshot: { endTick: 1800, inputs: '12L', localScore: 640 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            renderPlay({ mode: 'practice' });
            await startCountdown();
            act(() => {
                window.dispatchEvent(new Event('pagehide'));
            });
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        /*
         * Gerçek lobi gibi: bağlanınca bekleyen kaydı finishRunOnce ile gönderir.
         * Lobinin effect'i oyun sayfasının sökülme temizliğiyle aynı commit'te
         * (setTimeout'tan önce) çalışır; eski ara kayıt orada okunmamalı.
         */
        const PendingLobbyProbe = () => {
            React.useEffect(() => {
                const p = loadPending('u1');
                if (p) finishRunOnce(p.run_id, { end_tick: p.end_tick, inputs: p.inputs, client_score: p.client_score ?? undefined }).catch(() => {});
            }, []);
            return <div>LOBİ</div>;
        };
        const navHolder = { current: null };
        const NavGrab = () => {
            const navigate = useNavigate();
            React.useEffect(() => {
                navHolder.current = navigate;
            }, [navigate]);
            return null;
        };
        const renderWithLobby = () =>
            render(
                <MemoryRouter initialEntries={[{ pathname: '/oyun/kosu/oyna', state: { mode: 'ranked', run: RUN } }]}>
                    <NavGrab />
                    <Routes>
                        <Route path="/oyun/kosu/oyna" element={<RunnerPlayPage />} />
                        <Route path="/oyun/kosu" element={<PendingLobbyProbe />} />
                    </Routes>
                </MemoryRouter>
            );

        it('gizlenince saklanan eski ara kayıt, sökülünce lobiden eski girdilerle gönderilmez (tek finish, güncel girdi)', async () => {
            engine = makeEngine({ snapshot: { endTick: 1800, inputs: '12L', localScore: 640 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            // Gerçek ağ gibi: yanıt bir sonraki tura kalmaz (sayfanın ertelenmiş kararı istek sürerken çalışır).
            gameApi.finishRunner.mockImplementation(() => new Promise((r) => setTimeout(() => r({ result: RESULT }), 20)));
            renderWithLobby();
            await startCountdown();
            act(() => {
                window.dispatchEvent(new Event('pagehide'));
            });
            expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pending))).toMatchObject({ end_tick: 1800 });
            // Oyuncu döndü, oynamaya devam etti; sonra başka sayfaya gitti.
            engine.controls.snapshot.mockReturnValue({ endTick: 2400, inputs: '12L,5J', localScore: 900 });
            act(() => navHolder.current('/oyun/kosu'));
            expect(await screen.findByText('LOBİ')).toBeInTheDocument();
            await waitFor(() => expect(gameApi.finishRunner).toHaveBeenCalled());
            await new Promise((r) => setTimeout(r, 40));
            expect(gameApi.finishRunner).toHaveBeenCalledTimes(1);
            expect(gameApi.finishRunner).toHaveBeenCalledWith('run-1', { end_tick: 2400, inputs: '12L,5J', client_score: 900 });
            expect(gameApi.abandonRunner).not.toHaveBeenCalled();
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        it('gizlenince ara kayıt saklansa da "Çık" sonrası lobi o koşuyu bitirmez', async () => {
            engine = makeEngine({ snapshot: { endTick: 1800, inputs: '12L', localScore: 640 } });
            loadRunnerEngine.mockResolvedValue(engine.mod);
            renderWithLobby();
            await startCountdown();
            act(() => {
                window.dispatchEvent(new Event('pagehide'));
            });
            expect(localStorage.getItem(STORAGE_KEYS.pending)).not.toBeNull();
            fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
            fireEvent.click(screen.getByRole('button', { name: /Çık/ }));
            expect(await screen.findByText('LOBİ')).toBeInTheDocument();
            await waitFor(() => expect(gameApi.abandonRunner).toHaveBeenCalledWith('run-1'));
            expect(gameApi.finishRunner).not.toHaveBeenCalled();
            expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        });

        it('geri hareketi koşu sırasında sayfadan çıkarmaz: koruma kaydı eklenir, oyun duraklar', async () => {
            const push = vi.spyOn(window.history, 'pushState');
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            expect(push).toHaveBeenCalledTimes(1);
            expect(push.mock.calls[0][0]).toMatchObject({ runnerGuard: true });

            act(() => {
                window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
            });
            expect(screen.getByRole('dialog', { name: 'Mola' })).toBeInTheDocument();
            expect(engine.controls.pause).toHaveBeenCalled();
            // Koruma yeniden eklendi: bir sonraki geri hareketi de yakalanır.
            expect(push).toHaveBeenCalledTimes(2);
            expect(screen.queryByText(/LOBİ/)).toBeNull();
            expect(gameApi.abandonRunner).not.toHaveBeenCalled();
        });

        it('sonuç ekranında geri hareketi lobiye götürür', async () => {
            gameApi.finishRunner.mockResolvedValue({ result: { ...RESULT, new_best: false } });
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
            await screen.findByText('4.321 puan');
            act(() => {
                window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
            });
            expect(await screen.findByText('LOBİ /oyun/kosu')).toBeInTheDocument();
        });
    });

    describe('takılan istekler', () => {
        it('bitiş isteği zaman aşımına uğrarsa (ECONNABORTED) "Koşun gönderilemedi" ekranı gelir', async () => {
            const timeout = Object.assign(new Error('timeout of 20000ms exceeded'), { code: 'ECONNABORTED' });
            gameApi.finishRunner.mockRejectedValue(timeout);
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '10L', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
            expect(await screen.findByRole('heading', { name: 'Koşun gönderilemedi' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Tekrar dene/ })).toBeInTheDocument();
            expect(localStorage.getItem(STORAGE_KEYS.pending)).not.toBeNull();
        });

        it('"Koşun doğrulanıyor" uzarsa birkaç saniye sonra "Lobiye dön" çıkar; koşu terk edilmez', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });
            // Askıdaki istek test sonunda düşürülür: finishRunOnce'ın koşu başına kaydı sonraki testlere sızmasın.
            let failFinish;
            try {
                gameApi.finishRunner.mockReturnValue(new Promise((_, rej) => (failFinish = rej)));
                renderPlay({ mode: 'ranked', run: RUN });
                await startCountdown();
                await act(async () => opts.callbacks.onEnd({ endTick: 1200, inputs: '10L', crashed: true, distance: 300, coins: 4, gates: [], localScore: 500 }));
                expect(screen.getByText(/Koşun doğrulanıyor/)).toBeInTheDocument();
                expect(screen.queryByRole('button', { name: 'Lobiye dön' })).toBeNull();
                act(() => vi.advanceTimersByTime(5100));
                expect(screen.getByText(/lobide otomatik gönderilecek/)).toBeInTheDocument();
                fireEvent.click(screen.getByRole('button', { name: 'Lobiye dön' }));
                expect(await screen.findByText('LOBİ /oyun/kosu')).toBeInTheDocument();
                act(() => vi.advanceTimersByTime(50));
                expect(gameApi.abandonRunner).not.toHaveBeenCalled();
                expect(localStorage.getItem(STORAGE_KEYS.pending)).not.toBeNull();
            } finally {
                vi.useRealTimers();
                failFinish?.(httpErr(409));
                await new Promise((r) => setTimeout(r, 5));
            }
        });

        it('"Yeni koşu hazırlanıyor" uzarsa "Lobiye dön" çıkar', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true });
            try {
                gameApi.startRunner.mockReturnValue(new Promise(() => {}));
                renderPlay({ mode: 'ranked', run: RUN });
                await startCountdown();
                fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
                fireEvent.click(screen.getByRole('button', { name: /Yeniden başlat/ }));
                expect(screen.getByText(/Yeni koşu hazırlanıyor/)).toBeInTheDocument();
                expect(screen.queryByRole('button', { name: 'Lobiye dön' })).toBeNull();
                act(() => vi.advanceTimersByTime(5100));
                fireEvent.click(screen.getByRole('button', { name: 'Lobiye dön' }));
                expect(await screen.findByText('LOBİ /oyun/kosu')).toBeInTheDocument();
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('kapı açıklaması ve kontrol ipucu', () => {
        it('önceki koşunun geç gelen kapı açıklaması yeni koşunun sonucuna yazılmaz', async () => {
            let resolveOld;
            gameApi.runnerGate.mockReturnValueOnce(new Promise((r) => (resolveOld = r)));
            gameApi.finishRunner.mockResolvedValueOnce({ result: { ...RESULT, new_best: false } });
            gameApi.startRunner.mockResolvedValue({ run: { ...RUN, id: 'run-2', seed: 999 } });
            RUNNER_RETRY.settle = 10;
            renderPlay({ mode: 'ranked', run: RUN });
            await startCountdown();
            await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));
            await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
            await screen.findByText('4.321 puan');

            fireEvent.click(screen.getByRole('button', { name: /Tekrar Koş/ }));
            await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(2));
            await waitFor(() => expect(engine.controls.start).toHaveBeenCalledTimes(2));
            act(() => opts.callbacks.onCountdown(0));
            // Eski koşunun kapı yanıtı şimdi geliyor.
            await act(async () => resolveOld({ gate: { index: 0, correct: true, correct_lane: 2, explanation: 'ESKİ KOŞUNUN AÇIKLAMASI' } }));

            gameApi.runnerGate.mockRejectedValue(httpErr(422));
            gameApi.finishRunner.mockResolvedValueOnce({
                result: { ...RESULT, new_best: false, gates: [{ index: 0, question: 'Yeni soru?', options: ['a', 'b', 'c'], chosen_lane: 0, correct_lane: 0, correct: true, explanation: 'Yeni koşunun açıklaması' }] },
            });
            await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 0 }));
            await act(async () => opts.callbacks.onEnd({ endTick: 3000, inputs: '1L', crashed: true, distance: 800, coins: 1, gates: [], localScore: 4000 }));
            expect(await screen.findByText('Yeni koşunun açıklaması')).toBeInTheDocument();
            expect(screen.queryByText('ESKİ KOŞUNUN AÇIKLAMASI')).toBeNull();
        });

        it('ilk koşularda geri sayımda kontrol ipucu çıkar, sayaç artar; ilk harekette kalkar', async () => {
            renderPlay({ mode: 'ranked', run: RUN });
            await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
            act(() => opts.callbacks.onCountdown(3));
            const hint = screen.getByTestId('runner-controls-hint');
            expect(hint).toHaveAttribute('aria-hidden', 'true');
            expect(hint).toHaveTextContent('← → şerit · ↑/Boşluk zıpla · ↓ kay · Esc duraklat');
            expect(localStorage.getItem(STORAGE_KEYS.hintSeen)).toBe('1');
            act(() => opts.callbacks.onCountdown(2));
            expect(localStorage.getItem(STORAGE_KEYS.hintSeen)).toBe('1');
            act(() => opts.callbacks.onCountdown(0));
            expect(screen.getByTestId('runner-controls-hint')).toBeInTheDocument();
            fireEvent.keyDown(window, { key: 'ArrowLeft' });
            expect(screen.queryByTestId('runner-controls-hint')).toBeNull();
        });

        it('dokunmatik cihazda kaydırma ipucu; 3 koşudan sonra gösterilmez', async () => {
            const prev = window.matchMedia;
            window.matchMedia = vi.fn((q) => ({ matches: q.includes('coarse'), addListener() {}, removeListener() {} }));
            try {
                localStorage.setItem(STORAGE_KEYS.hintSeen, '2');
                const view = renderPlay({ mode: 'ranked', run: RUN });
                await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
                act(() => opts.callbacks.onCountdown(3));
                expect(screen.getByTestId('runner-controls-hint')).toHaveTextContent('◀ ▶ kaydır: şerit · ▲ yukarı: zıpla · ▼ aşağı: kay');
                expect(localStorage.getItem(STORAGE_KEYS.hintSeen)).toBe('3');
                view.unmount();
                await new Promise((r) => setTimeout(r, 5));

                renderPlay({ mode: 'ranked', run: RUN });
                await waitFor(() => expect(engine.controls.start).toHaveBeenCalledTimes(2));
                act(() => opts.callbacks.onCountdown(3));
                expect(screen.queryByTestId('runner-controls-hint')).toBeNull();
            } finally {
                window.matchMedia = prev;
            }
        });
    });
});
