// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

vi.mock('react-confetti', () => ({ default: () => <div data-testid="confetti" /> }));
vi.mock('../../pages/game/runner/engineLoader', () => ({ loadRunnerEngine: vi.fn() }));

import { loadRunnerEngine } from '../../pages/game/runner/engineLoader';
import EmbedApp from '../EmbedApp';
import { __resetBridgeForTests, receiveFromNative } from '../bridge';
import { RUNNER_RETRY, RUNNER_SIM_VERSION, STORAGE_KEYS, savePending } from '../../components/game/runner/runnerUtils';
import { defaultAvatar, normalizeAvatar } from '../../game/avatar/catalog';

const RUN = {
    id: 'run-1',
    seed: 123456,
    sim_version: RUNNER_SIM_VERSION,
    gate_count: 1,
    started_at: '2026-10-03T10:00:00Z',
    gates: [{ index: 0, question: { id: 11, text: 'Türkiye’nin başkenti neresidir?', options: ['İzmir', 'İstanbul', 'Ankara'], category: null, difficulty: 1 } }],
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
    counted: true,
    coins_earned: 42,
    wallet: { balance: 1042, earned_total: 1500, spent_total: 458 },
    badges_earned: [],
    player: null,
    gates: [],
};

const AVATAR = { v: 1, body: 'kiz', skin: 3, hair: { style: 'mohawk', color: 7 }, top: { style: 'ceket', color: 2 }, bottom: { style: 'etek', color: 1 }, shoes: { style: 'neon', color: 6 }, acc: 'tac', trail: 'kalp' };

let engine;
let opts;
let posted;

function makeEngine({ webgl = true } = {}) {
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
        snapshot: vi.fn(() => ({ endTick: 300, inputs: '10J', localScore: 50 })),
    };
    const mod = {
        isWebGLAvailable: vi.fn(() => webgl),
        createRunnerGame: vi.fn(async (o) => {
            opts = o;
            return controls;
        }),
    };
    return { controls, mod };
}

const makeApi = () => ({
    startRunner: vi.fn(),
    runnerGate: vi.fn(),
    finishRunner: vi.fn(),
    abandonRunner: vi.fn(() => Promise.resolve({ run: { status: 'abandoned' } })),
});

const memberConfig = (over = {}) => ({
    v: 1,
    platform: 'android',
    token: '12|tok',
    user: { id: 'u1', username: 'ayse', gender: 'female' },
    safeArea: { top: 30, right: 0, bottom: 20, left: 0 },
    muted: false,
    music: true,
    haptics: true,
    avatar: AVATAR,
    native: true,
    ...over,
});

const guestConfig = (over = {}) => memberConfig({ token: null, user: null, avatar: null, ...over });

const httpErr = (status, message) => Object.assign(new Error('http'), { response: { status, data: { message } } });
const types = () => posted.map((m) => m.type);
const lastOf = (type) => [...posted].reverse().find((m) => m.type === type);

function renderEmbed(config, api, { strict = false } = {}) {
    const tree = <EmbedApp config={config} game="kosu" api={api} />;
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

async function startCountdown() {
    await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
    act(() => opts.callbacks.onCountdown(3));
    act(() => opts.callbacks.onCountdown(0));
}

describe('Embed: koşu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetBridgeForTests();
        localStorage.clear();
        RUNNER_RETRY.gate = [0, 0];
        RUNNER_RETRY.finish = [0, 0];
        RUNNER_RETRY.settle = 4000;
        engine = makeEngine();
        loadRunnerEngine.mockResolvedValue(engine.mod);
        opts = null;
        posted = [];
        window.ReactNativeWebView = { postMessage: (json) => posted.push(JSON.parse(json)) };
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => null }));
    });

    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
        delete window.ReactNativeWebView;
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        vi.restoreAllMocks();
    });

    it('misafir: antrenman açılır, varsayılan karakter; titreşim ve sonuç native\'e gider, sunucuya gidilmez', async () => {
        const api = makeApi();
        renderEmbed(guestConfig(), api);
        await startCountdown();
        expect(types()).toContain('ready');
        expect(lastOf('ready')).toEqual({ type: 'ready', game: 'kosu' });
        expect(opts.gates).toEqual([]);
        expect(opts.avatar).toEqual(defaultAvatar());
        expect(Object.keys(opts.callbacks)).toContain('onHaptic');

        act(() => opts.callbacks.onHaptic('light'));
        act(() => opts.callbacks.onHaptic('light')); // aynı an: tek titreşim
        act(() => opts.callbacks.onHaptic('nope'));
        expect(posted.filter((m) => m.type === 'haptic')).toEqual([{ type: 'haptic', style: 'light' }]);

        await act(async () => opts.callbacks.onEnd({ endTick: 900, inputs: '1J', crashed: true, distance: 260, coins: 9, gates: [], localScore: 610 }));
        expect(await screen.findByRole('heading', { name: /Yeni rekor/ })).toBeInTheDocument();
        expect(lastOf('result')).toMatchObject({ type: 'result', game: 'kosu', practice: true, score: 610, distance_m: 260, coins: 9, new_best: true });
        // Mobilde paylaş yok; misafir çağrısı native girişe gider.
        expect(screen.queryByRole('button', { name: /Paylaş/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Giriş yap/ }));
        expect(lastOf('login')).toEqual({ type: 'login' });
        expect(Object.values(api).every((fn) => fn.mock.calls.length === 0)).toBe(true);
        expect(localStorage.getItem('token')).toBeNull();
    });

    it('üye: yarım kalan koşu önce gönderilir, sonra dereceli koşu açılır; kapı ve bitiş kendi API istemcisiyle', async () => {
        const api = makeApi();
        savePending({ userId: 'u1', runId: 'old-run', endTick: 1200, inputs: '5L', clientScore: 300 });
        const order = [];
        api.finishRunner.mockImplementation((id) => {
            order.push(`finish:${id}`);
            return Promise.resolve({ result: id === 'old-run' ? { ...RESULT, score: 300 } : RESULT });
        });
        api.startRunner.mockImplementation(() => {
            order.push('start');
            return Promise.resolve({ run: RUN });
        });
        api.runnerGate.mockResolvedValue({ gate: { index: 0, chosen_lane: 2, correct: true, correct_lane: 2 } });
        renderEmbed(memberConfig(), api, { strict: true });

        await startCountdown();
        expect(order.slice(0, 2)).toEqual(['finish:old-run', 'start']);
        expect(api.startRunner).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        expect(posted.find((m) => m.type === 'result')).toMatchObject({ game: 'kosu', score: 300 });
        expect(opts.seed).toBe(123456);
        expect(opts.avatar).toEqual(normalizeAvatar(AVATAR, 'female'));

        await act(async () => opts.callbacks.onGateCross({ index: 0, lane: 2 }));
        expect(api.runnerGate).toHaveBeenCalledWith('run-1', { gate: 0, lane: 2 });
        await waitFor(() => expect(engine.controls.setGateResult).toHaveBeenCalledWith(0, true, 2));

        await act(async () => opts.callbacks.onEnd({ endTick: 3120, inputs: '75J', crashed: true, distance: 870, coins: 42, gates: [], localScore: 4321 }));
        await waitFor(() => expect(api.finishRunner).toHaveBeenCalledWith('run-1', { end_tick: 3120, inputs: '75J', client_score: 4321 }));
        expect(await screen.findByText('4.321 puan')).toBeInTheDocument();
        expect(lastOf('result')).toEqual({
            type: 'result',
            game: 'kosu',
            practice: false,
            score: 4321,
            distance_m: 870,
            coins: 42,
            xp_earned: 29,
            weekly_rank: 7,
            new_best: true,
            level_up: false,
            coins_earned: 42,
            balance: 1042,
        });
        expect(screen.getByRole('button', { name: /Oyundan çık/ })).toBeInTheDocument();
        // Jeton ödülü: "Mağazaya git" Router'sız buton, native mağaza ekranını açar.
        expect(screen.getByTestId('coin-reward')).toHaveTextContent('+42 jeton kazandın');
        fireEvent.click(screen.getByRole('button', { name: /Mağazaya git/ }));
        expect(lastOf('openUrl')).toEqual({ type: 'openUrl', url: '/oyun/magaza' });
        expect(api.abandonRunner).not.toHaveBeenCalled();
    });

    it('native geri tuşu: oyunda mola menüsü, menüdeyse çıkış (açık koşu terk edilir)', async () => {
        const api = makeApi();
        api.startRunner.mockResolvedValue({ run: RUN });
        renderEmbed(memberConfig(), api);
        await startCountdown();

        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('dialog', { name: 'Mola' })).toBeInTheDocument();
        expect(types()).not.toContain('exit');

        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        expect(api.abandonRunner).toHaveBeenCalledWith('run-1');
        expect(engine.controls.destroy).toHaveBeenCalled();
        expect(await screen.findByText('Oyundan çıkıldı.')).toBeInTheDocument();
        expect(api.finishRunner).not.toHaveBeenCalled();
    });

    it('native pause molayı açar; resume menüyü kapatmaz; setMuted motora uygulanır ama geri bildirilmez', async () => {
        renderEmbed(guestConfig({ muted: true, music: false }), makeApi());
        await startCountdown();
        expect(opts.muted).toBe(true);
        expect(opts.musicEnabled).toBe(false);

        act(() => {
            receiveFromNative({ type: 'pause' });
        });
        expect(screen.getByRole('dialog', { name: 'Mola' })).toBeInTheDocument();
        act(() => {
            receiveFromNative({ type: 'resume' });
        });
        expect(screen.getByRole('dialog', { name: 'Mola' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Devam et/ }));
        expect(engine.controls.resume).toHaveBeenCalled();

        act(() => {
            receiveFromNative({ type: 'setMuted', muted: false });
        });
        expect(engine.controls.setMuted).toHaveBeenLastCalledWith(false);
        expect(types()).not.toContain('settings');

        // Oyuncu HUD'dan kapatınca native'e bildirilir; site tercihine (localStorage) yazılmaz.
        fireEvent.click(screen.getByRole('button', { name: 'Sesi kapat' }));
        expect(engine.controls.setMuted).toHaveBeenLastCalledWith(true);
        expect(lastOf('settings')).toEqual({ type: 'settings', muted: true, music: false });
        expect(localStorage.getItem(STORAGE_KEYS.muted)).toBeNull();
    });

    it('oturum düşmüşse (401) giriş ister; antrenmana geçilebilir', async () => {
        const api = makeApi();
        api.startRunner.mockRejectedValue(httpErr(401, 'Unauthenticated.'));
        renderEmbed(memberConfig(), api);
        expect(await screen.findByRole('heading', { name: 'Oturumun sona ermiş' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Giriş yap/ }));
        expect(lastOf('login')).toEqual({ type: 'login' });
        fireEvent.click(screen.getByRole('button', { name: /Antrenman modunda oyna/ }));
        await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(1));
        expect(opts.gates).toEqual([]);
    });

    it('başlatma hatasında "Tekrar dene" yeni istek atar', async () => {
        const api = makeApi();
        api.startRunner.mockRejectedValueOnce(httpErr(503, 'Bakımdayız.')).mockResolvedValueOnce({ run: RUN });
        renderEmbed(memberConfig(), api);
        expect(await screen.findByText('Bakımdayız.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(1));
        expect(api.startRunner).toHaveBeenCalledTimes(2);
        expect(opts.seed).toBe(123456);
    });

    it('farklı simülasyon sürümündeki koşu oynanmaz, terk edilir', async () => {
        const api = makeApi();
        api.startRunner.mockResolvedValue({ run: { ...RUN, sim_version: 1 } });
        renderEmbed(memberConfig(), api);
        expect(await screen.findByText(/Oyun güncellendi/)).toBeInTheDocument();
        expect(api.abandonRunner).toHaveBeenCalledWith('run-1');
        expect(engine.mod.createRunnerGame).not.toHaveBeenCalled();
    });

    it('WebGL 2 yoksa sunucuda koşu açılmaz', async () => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
        const api = makeApi();
        renderEmbed(memberConfig(), api);
        expect(await screen.findByRole('heading', { name: '3D desteklenmiyor' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Oyundan çık/ }));
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        expect(api.startRunner).not.toHaveBeenCalled();
    });

    it('koşu açılırken geri tuşu çıkış yapar; geç gelen koşu terk edilir', async () => {
        const api = makeApi();
        let resolveStart;
        api.startRunner.mockReturnValue(new Promise((r) => (resolveStart = r)));
        renderEmbed(memberConfig(), api);
        expect(await screen.findByText(/Koşu hazırlanıyor/)).toBeInTheDocument();
        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        await act(async () => resolveStart({ run: RUN }));
        await waitFor(() => expect(api.abandonRunner).toHaveBeenCalledWith('run-1'));
        expect(engine.mod.createRunnerGame).not.toHaveBeenCalled();
    });

    it('setAvatar bir sonraki koşunun karakterini değiştirir', async () => {
        renderEmbed(guestConfig(), makeApi());
        await startCountdown();
        expect(opts.avatar.hair.style).toBe('kisa');
        act(() => {
            receiveFromNative({ type: 'setAvatar', avatar: AVATAR });
        });
        await act(async () => opts.callbacks.onEnd({ endTick: 900, inputs: '', crashed: true, distance: 100, coins: 1, gates: [], localScore: 100 }));
        fireEvent.click(await screen.findByRole('button', { name: /Tekrar Koş/ }));
        await waitFor(() => expect(engine.mod.createRunnerGame).toHaveBeenCalledTimes(2));
        expect(opts.avatar).toEqual(normalizeAvatar(AVATAR));
    });

    it('güvenli alan native değerleriyle CSS değişkenlerine yazılır', async () => {
        renderEmbed(guestConfig({ safeArea: { top: 44, right: 0, bottom: 34, left: 0 } }), makeApi());
        await startCountdown();
        expect(document.documentElement.style.getPropertyValue('--hs-safe-top')).toBe('44px');
        expect(document.documentElement.style.getPropertyValue('--hs-safe-bottom')).toBe('34px');
        expect(screen.getByTestId('runner-score').closest('.pointer-events-none').className).toContain('var(--hs-safe-top,env(safe-area-inset-top))');
    });
});
