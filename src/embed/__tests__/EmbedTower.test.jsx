// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

vi.mock('react-confetti', () => ({ default: () => <div data-testid="confetti" /> }));
vi.mock('../../pages/game/tower/engineLoader', () => ({ loadTowerEngine: vi.fn() }));
// Site istemcisi gömmede asla kullanılmamalı: çağrılırsa test düşer.
vi.mock('../../services/towerApi', () => {
    const boom = () => {
        throw new Error('site towerApi gömmede kullanılmamalı');
    };
    return { towerApi: { overview: boom, start: boom, answer: boom, finish: boom, abandon: boom, leaderboard: boom } };
});

import { loadTowerEngine } from '../../pages/game/tower/engineLoader';
import EmbedApp from '../EmbedApp';
import { __resetBridgeForTests, receiveFromNative } from '../bridge';
import { summarizeTowerResult } from '../embedResult';
import { STORAGE_KEYS, TOWER_RETRY, savePending } from '../../components/game/tower/towerUtils';
import { defaultAvatar, normalizeAvatar } from '../../game/avatar/catalog';

const RUN = {
    id: 'tower-1',
    seed: 4242,
    sim_version: 1,
    question_count: 1,
    started_at: '2026-10-03T10:00:00Z',
    questions: [{ index: 0, question: { id: 11, text: 'Türkiye’nin başkenti neresidir?', options: ['İstanbul', 'Ankara'], category: null } }],
};

const RESULT = {
    run: { id: 'tower-1', status: 'finished' },
    score: 1830,
    floors: 41,
    perfects: 17,
    max_combo: 9,
    correct_count: 1,
    xp_earned: 28,
    coins_earned: 41,
    wallet: { balance: 1541, earned_total: 2000, spent_total: 459 },
    level_before: 4,
    level_after: 4,
    level_up: false,
    new_best: false,
    best_score: 2000,
    weekly_rank: 3,
    counted: true,
    badges_earned: [],
    player: null,
    questions: [],
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
        quit: vi.fn(() => opts.callbacks.onEnd({ endTick: 900, inputs: '80T', crashed: false, floor: 7, perfects: 2, maxCombo: 2, localScore: 95 })),
        destroy: vi.fn(),
        setMuted: vi.fn(),
        setMusicEnabled: vi.fn(),
        setAnswerResult: vi.fn(),
        setAvatar: vi.fn(),
        answer: vi.fn(() => true),
        isPaused: vi.fn(() => enginePaused),
        snapshot: vi.fn(() => ({ endTick: 300, inputs: '10T', localScore: 50 })),
    };
    const mod = {
        isWebGLAvailable: vi.fn(() => webgl),
        createTowerGame: vi.fn(async (o) => {
            opts = o;
            return controls;
        }),
    };
    return { controls, mod };
}

const makeApi = () => ({
    tower: {
        start: vi.fn(),
        answer: vi.fn(),
        finish: vi.fn(),
        abandon: vi.fn(() => Promise.resolve({ run: { status: 'abandoned' } })),
    },
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
    const tree = <EmbedApp config={config} game="kule" api={api} />;
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

async function startCountdown() {
    await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
    act(() => opts.callbacks.onCountdown(3));
    act(() => opts.callbacks.onCountdown(0));
}

describe('Embed: kule', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetBridgeForTests();
        localStorage.clear();
        TOWER_RETRY.answer = [0, 0];
        TOWER_RETRY.finish = [0, 0];
        engine = makeEngine();
        loadTowerEngine.mockResolvedValue(engine.mod);
        opts = null;
        posted = [];
        window.ReactNativeWebView = { postMessage: (json) => posted.push(JSON.parse(json)) };
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => null }));
        window.WebGL2RenderingContext = function WebGL2RenderingContext() {};
    });

    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
        delete window.ReactNativeWebView;
        delete window.WebGL2RenderingContext;
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        vi.restoreAllMocks();
    });

    it('misafir: antrenman açılır, varsayılan karakter; titreşim ve sonuç native\'e gider, sunucuya gidilmez', async () => {
        const api = makeApi();
        renderEmbed(guestConfig(), api);
        await startCountdown();
        expect(lastOf('ready')).toEqual({ type: 'ready', game: 'kule' });
        expect(opts.questions).toEqual([]);
        expect(opts.avatar).toEqual(normalizeAvatar(null, undefined));
        expect(opts.avatar).toEqual(defaultAvatar());

        act(() => opts.callbacks.onHaptic('success'));
        expect(posted.filter((m) => m.type === 'haptic')).toEqual([{ type: 'haptic', style: 'success' }]);

        await act(async () => opts.callbacks.onEnd({ endTick: 900, inputs: '80T', crashed: true, floor: 12, perfects: 3, maxCombo: 2, localScore: 240 }));
        expect(await screen.findByRole('heading', { name: /Yeni rekor/ })).toBeInTheDocument();
        expect(lastOf('result')).toMatchObject({ type: 'result', game: 'kule', practice: true, score: 240, floor: 12, new_best: true });
        // Mobilde paylaş yok; çıkış metni "Oyundan çık"; misafir çağrısı native girişe gider.
        expect(screen.queryByRole('button', { name: /Paylaş/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Oyundan çık/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Giriş yap/ }));
        expect(lastOf('login')).toEqual({ type: 'login' });
        expect(Object.values(api.tower).every((fn) => fn.mock.calls.length === 0)).toBe(true);
        expect(localStorage.getItem('token')).toBeNull();
    });

    it('üye: yarım kalan kule önce gönderilir, sonra dereceli kule açılır; cevap, bitiş ve mağaza bağlantısı', async () => {
        const api = makeApi();
        savePending({ userId: 'u1', runId: 'old-tower', endTick: 1200, inputs: '5T', clientScore: 300 });
        const order = [];
        api.tower.finish.mockImplementation((id) => {
            order.push(`finish:${id}`);
            return Promise.resolve({ result: id === 'old-tower' ? { ...RESULT, score: 300 } : RESULT });
        });
        api.tower.start.mockImplementation(() => {
            order.push('start');
            return Promise.resolve({ run: RUN });
        });
        api.tower.answer.mockResolvedValue({ answer: { q: 0, choice: 1, correct: true, correct_choice: 1 } });
        renderEmbed(memberConfig(), api, { strict: true });

        await startCountdown();
        expect(order.slice(0, 2)).toEqual(['finish:old-tower', 'start']);
        expect(api.tower.start).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        expect(posted.find((m) => m.type === 'result')).toMatchObject({ game: 'kule', score: 300 });
        expect(opts.seed).toBe(4242);
        expect(opts.avatar).toEqual(normalizeAvatar(AVATAR, 'female'));

        await act(async () => opts.callbacks.onQuestion({ index: 0 }));
        await act(async () => opts.callbacks.onAnswer({ index: 0, choice: 1 }));
        expect(api.tower.answer).toHaveBeenCalledWith('tower-1', { q: 0, choice: 1 });
        await waitFor(() => expect(engine.controls.setAnswerResult).toHaveBeenCalledWith(0, true, 1));

        await act(async () => opts.callbacks.onEnd({ endTick: 4321, inputs: '70T,0B', crashed: true, floor: 41, perfects: 17, maxCombo: 9, localScore: 1830 }));
        await waitFor(() => expect(api.tower.finish).toHaveBeenCalledWith('tower-1', { end_tick: 4321, inputs: '70T,0B', client_score: 1830 }));
        expect(await screen.findByText('1.830 puan')).toBeInTheDocument();
        expect(lastOf('result')).toEqual({ type: 'result', ...summarizeTowerResult(RESULT) });
        expect(lastOf('result')).toMatchObject({ floor: 41, coins_earned: 41, balance: 1541 });

        // Jeton ödülü + "Mağazaya git" native mağaza ekranını açar (Router yok).
        expect(screen.getByTestId('coin-reward')).toHaveTextContent('+41 jeton kazandın');
        expect(screen.getByTestId('coin-reward')).toHaveTextContent('1.541');
        fireEvent.click(screen.getByRole('button', { name: /Mağazaya git/ }));
        expect(lastOf('openUrl')).toEqual({ type: 'openUrl', url: '/oyun/magaza' });
        expect(api.tower.abandon).not.toHaveBeenCalled();
    });

    it('native geri tuşu: oyunda mola menüsü, menüdeyse çıkış (açık kule terk edilir)', async () => {
        const api = makeApi();
        api.tower.start.mockResolvedValue({ run: RUN });
        renderEmbed(memberConfig(), api);
        await startCountdown();

        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        expect(types()).not.toContain('exit');

        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        await waitFor(() => expect(api.tower.abandon).toHaveBeenCalledWith('tower-1'));
        expect(engine.controls.destroy).toHaveBeenCalled();
        expect(await screen.findByText('Oyundan çıkıldı.')).toBeInTheDocument();
        expect(api.tower.finish).not.toHaveBeenCalled();
    });

    it('native pause molayı açar; setMuted / setMusic motora uygulanır ama geri bildirilmez; setAvatar canlı', async () => {
        renderEmbed(guestConfig({ muted: true, music: false }), makeApi());
        await startCountdown();
        expect(opts.muted).toBe(true);
        expect(opts.music).toBe(false);

        act(() => {
            receiveFromNative({ type: 'pause' });
        });
        expect(engine.controls.pause).toHaveBeenCalled();
        act(() => {
            receiveFromNative({ type: 'resume' });
        });
        expect(engine.controls.resume).not.toHaveBeenCalled();

        act(() => {
            receiveFromNative({ type: 'setMuted', muted: false });
        });
        expect(engine.controls.setMuted).toHaveBeenLastCalledWith(false);
        act(() => {
            receiveFromNative({ type: 'setMusic', music: true });
        });
        expect(engine.controls.setMusicEnabled).toHaveBeenLastCalledWith(true);
        expect(types()).not.toContain('settings');
        expect(localStorage.getItem(STORAGE_KEYS.muted)).toBeNull();

        act(() => {
            receiveFromNative({ type: 'setAvatar', avatar: AVATAR });
        });
        await waitFor(() => expect(engine.controls.setAvatar).toHaveBeenLastCalledWith(normalizeAvatar(AVATAR, undefined)));
    });

    it('oturum düşmüşse (401) giriş ister; antrenmana geçilebilir', async () => {
        const api = makeApi();
        api.tower.start.mockRejectedValue(httpErr(401, 'Unauthenticated.'));
        renderEmbed(memberConfig(), api);
        expect(await screen.findByRole('heading', { name: 'Oturumun sona ermiş' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Giriş yap/ }));
        expect(lastOf('login')).toEqual({ type: 'login' });
        fireEvent.click(screen.getByRole('button', { name: /Antrenman modunda oyna/ }));
        await waitFor(() => expect(engine.mod.createTowerGame).toHaveBeenCalledTimes(1));
        expect(opts.questions).toEqual([]);
    });

    it('başlatma hatasında "Tekrar dene" yeni istek atar; farklı sürüm terk edilir', async () => {
        const api = makeApi();
        api.tower.start
            .mockRejectedValueOnce(httpErr(503, 'Bakımdayız.'))
            .mockResolvedValueOnce({ run: { ...RUN, sim_version: 99 } })
            .mockResolvedValueOnce({ run: RUN });
        renderEmbed(memberConfig(), api);
        expect(await screen.findByText('Bakımdayız.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        expect(await screen.findByText(/Oyun güncellendi/)).toBeInTheDocument();
        expect(api.tower.abandon).toHaveBeenCalledWith('tower-1');
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        await waitFor(() => expect(engine.mod.createTowerGame).toHaveBeenCalledTimes(1));
        expect(api.tower.start).toHaveBeenCalledTimes(3);
    });

    it('WebGL 2 yoksa sunucuda kule açılmaz; geri tuşu çıkar', async () => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
        const api = makeApi();
        renderEmbed(memberConfig(), api);
        expect(await screen.findByRole('heading', { name: '3D desteklenmiyor' })).toBeInTheDocument();
        expect(api.tower.start).not.toHaveBeenCalled();
        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(lastOf('exit')).toEqual({ type: 'exit' });
    });

    it('kule açılırken geri tuşu çıkış yapar; geç gelen kule terk edilir', async () => {
        const api = makeApi();
        let resolveStart;
        api.tower.start.mockImplementation(() => new Promise((r) => (resolveStart = r)));
        renderEmbed(memberConfig(), api);
        await waitFor(() => expect(api.tower.start).toHaveBeenCalled());
        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        await act(async () => resolveStart({ run: RUN }));
        await waitFor(() => expect(api.tower.abandon).toHaveBeenCalledWith('tower-1'));
        expect(engine.mod.createTowerGame).not.toHaveBeenCalled();
    });
});

describe('summarizeTowerResult', () => {
    it('düz değerler; null sonuç "kaydedildi"', () => {
        expect(summarizeTowerResult(null)).toEqual({ game: 'kule', score: null, saved: true });
        const s = summarizeTowerResult({ ...RESULT, score: -5, wallet: null });
        expect(s.score).toBe(0);
        expect(s.balance).toBeNull();
        expect(Object.values(s).every((v) => v === null || ['number', 'boolean', 'string'].includes(typeof v))).toBe(true);
    });
});
