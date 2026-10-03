// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

const auth = { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' }, loading: false };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-confetti', () => ({ default: () => <div data-testid="confetti" /> }));
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
vi.mock('../engineLoader', () => ({ loadTowerEngine: vi.fn() }));

import { towerApi } from '../../../../services/towerApi';
import { loadTowerEngine } from '../engineLoader';
import TowerPlayPage from '../TowerPlayPage';
import { STORAGE_KEYS, TOWER_RETRY, loadPending } from '../../../../components/game/tower/towerUtils';

const RUN = {
    id: 'run-1',
    seed: 4242,
    sim_version: 1,
    question_count: 2,
    started_at: '2026-10-03T10:00:00Z',
    questions: [
        { index: 0, question: { id: 11, text: 'Türkiye’nin başkenti neresidir?', options: ['İstanbul', 'Ankara'], category: { name: 'Coğrafya' } } },
        { index: 1, question: { id: 12, text: 'Suyun formülü nedir?', options: ['H2O', 'CO2'], category: null } },
    ],
};

const RESULT = {
    run: { id: 'run-1', status: 'finished' },
    score: 1830,
    floors: 41,
    perfects: 17,
    max_combo: 9,
    correct_count: 1,
    questions_answered: 2,
    xp_earned: 28,
    coins_earned: 41,
    level_before: 4,
    level_after: 5,
    level_up: true,
    new_best: true,
    best_score: 1830,
    weekly_rank: 3,
    counted: true,
    badges_earned: [{ key: 'tower_first', name: 'İlk Kat', description: 'İlk kuleni dik', icon: 'building' }],
    player: null,
    questions: [
        { index: 0, question: 'Türkiye’nin başkenti neresidir?', options: ['İstanbul', 'Ankara'], chosen: 1, correct_choice: 1, correct: true },
        { index: 1, question: 'Suyun formülü nedir?', options: ['H2O', 'CO2'], chosen: 1, correct_choice: 0, correct: false },
    ],
};

let engine;
let opts;

function makeEngine({ webgl = true, snapshot, answerOk = true } = {}) {
    let enginePaused = false;
    const controls = {
        start: vi.fn(),
        pause: vi.fn(() => {
            enginePaused = true;
        }),
        resume: vi.fn(() => {
            enginePaused = false;
        }),
        quit: vi.fn(() => opts.callbacks.onEnd({ endTick: 900, inputs: '80T,95T', crashed: false, floor: 7, perfects: 2, maxCombo: 2, localScore: 95 })),
        destroy: vi.fn(),
        setMuted: vi.fn(),
        setMusicEnabled: vi.fn(),
        setAnswerResult: vi.fn(),
        setAvatar: vi.fn(),
        answer: vi.fn(() => answerOk),
        isPaused: vi.fn(() => enginePaused),
    };
    if (snapshot !== undefined) controls.snapshot = vi.fn(() => snapshot);
    const mod = {
        isWebGLAvailable: vi.fn(() => webgl),
        createTowerGame: vi.fn(async (o) => {
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
        <MemoryRouter initialEntries={[{ pathname: '/oyun/kule/oyna', state }]}>
            <Routes>
                <Route path="/oyun/kule/oyna" element={<TowerPlayPage />} />
                <Route path="/oyun/kule" element={<LobbyProbe />} />
            </Routes>
        </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

async function startCountdown() {
    await waitFor(() => expect(engine.mod.createTowerGame).toHaveBeenCalled());
    await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
    act(() => opts.callbacks.onCountdown(3));
    act(() => opts.callbacks.onCountdown(0));
}

const END = { endTick: 4321, inputs: '70T,90T,0B', crashed: true, floor: 41, perfects: 17, maxCombo: 9, localScore: 1680 };

describe('TowerPlayPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(towerApi).forEach((fn) => fn.mockReset());
        towerApi.abandon.mockResolvedValue({ run: { id: 'run-1', status: 'abandoned' } });
        localStorage.clear();
        TOWER_RETRY.answer = [0, 0];
        TOWER_RETRY.finish = [0, 0];
        TOWER_RETRY.settle = 4000;
        engine = makeEngine();
        loadTowerEngine.mockResolvedValue(engine.mod);
        opts = null;
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female' } });
    });

    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        vi.restoreAllMocks();
        document.querySelectorAll('meta[name="viewport"]').forEach((m) => m.remove());
    });

    it('geçiş durumu yoksa lobiye yönlendirir', async () => {
        renderPlay(undefined);
        expect(await screen.findByText('LOBİ /oyun/kule')).toBeInTheDocument();
        expect(loadTowerEngine).not.toHaveBeenCalled();
    });

    it('bozuk / eski sürüm kule verisinde lobiye döner', async () => {
        renderPlay({ mode: 'ranked', run: { ...RUN, sim_version: 99 } });
        expect(await screen.findByText('LOBİ /oyun/kule')).toBeInTheDocument();
        cleanup();
        renderPlay({ mode: 'ranked', run: { ...RUN, questions: [{ index: 0, question: { text: 'x', options: ['a', 'b', 'c'] } }] } });
        expect(await screen.findByText('LOBİ /oyun/kule')).toBeInTheDocument();
    });

    it('motoru sorular, tohum, karakter ve ses ayarıyla kurar; gövde kaydırmasını kilitler', async () => {
        localStorage.setItem(STORAGE_KEYS.muted, '1');
        localStorage.setItem(STORAGE_KEYS.music, '0');
        auth.user = { ...auth.user, detail: { game_avatar: { v: 1, body: 'kiz', skin: 3, hair: { style: 'mohawk', color: 7 } } } };
        renderPlay({ mode: 'ranked', run: RUN });
        await waitFor(() => expect(engine.mod.createTowerGame).toHaveBeenCalledTimes(1));
        expect(opts.questions).toHaveLength(2);
        expect(opts.questions[0].question.options).toEqual(['İstanbul', 'Ankara']);
        expect(opts.seed).toBe(4242);
        expect(opts.avatar.hair).toEqual({ style: 'mohawk', color: 7 });
        expect(opts.avatar.skin).toBe(3);
        // Eksik alanlar varsayılana düşer (normalizeAvatar)
        expect(opts.avatar.top.style).toBe('hoodie');
        expect(opts.muted).toBe(true);
        expect(opts.music).toBe(false);
        expect(opts.container).toBe(screen.getByTestId('tower-stage'));
        expect(Object.keys(opts.callbacks).sort()).toEqual(['onAnswer', 'onCountdown', 'onEnd', 'onError', 'onHaptic', 'onHud', 'onPlace', 'onQuestion']);
        expect(document.body.style.overflow).toBe('hidden');
        expect(document.documentElement.style.overscrollBehavior).toBe('none');
    });

    it('StrictMode çift bağlamada tek motor kurar; çıkışta destroy + abandon', async () => {
        const view = renderPlay({ mode: 'ranked', run: RUN }, { strict: true });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 20));
        expect(engine.mod.createTowerGame).toHaveBeenCalledTimes(1);
        expect(engine.controls.destroy).not.toHaveBeenCalled();
        expect(towerApi.abandon).not.toHaveBeenCalled();
        view.unmount();
        expect(engine.controls.destroy).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(towerApi.abandon).toHaveBeenCalledWith('run-1'));
        expect(document.body.style.overflow).toBe('');
    });

    it('HUD, kombo ve mükemmel yazısı', async () => {
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onHud({ score: 1234, floor: 27, combo: 4, perfect: 9 }));
        expect(screen.getByTestId('tower-floor')).toHaveTextContent('27');
        expect(screen.getByTestId('tower-score')).toHaveTextContent('1.234');
        expect(screen.getByTestId('tower-combo')).toHaveTextContent('x4');
        act(() => opts.callbacks.onPlace({ perfect: true, combo: 4, floor: 27, grew: true }));
        expect(screen.getByText('Harika!')).toBeInTheDocument();
        expect(screen.getByText('Kat büyüdü!')).toBeInTheDocument();
    });

    it('soru katında panel açılır; şık motora gider, cevap sunucuya kilitlenir ve sonuç motora iletilir', async () => {
        towerApi.answer.mockResolvedValue({ answer: { q: 0, choice: 1, correct: true, correct_choice: 1 } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onQuestion({ index: 0, seconds: 8 }));
        expect(screen.getByTestId('tower-qpanel-q')).toHaveTextContent('Türkiye’nin başkenti neresidir?');
        expect(screen.getByText(/Coğrafya/)).toBeInTheDocument();
        expect(screen.getByTestId('tower-q-timer')).toHaveStyle({ animationDuration: '8s' });

        fireEvent.click(screen.getByRole('button', { name: 'B: Ankara' }));
        expect(engine.controls.answer).toHaveBeenCalledWith(1);
        // Motor kaydı alana kadar "kontrol ediliyor"
        expect(screen.getByTestId('tower-answer-feedback')).toHaveTextContent('kontrol ediliyor');
        expect(towerApi.answer).not.toHaveBeenCalled();

        act(() => opts.callbacks.onAnswer({ index: 0, choice: 1 }));
        await waitFor(() => expect(towerApi.answer).toHaveBeenCalledWith('run-1', { q: 0, choice: 1 }));
        await waitFor(() => expect(engine.controls.setAnswerResult).toHaveBeenCalledWith(0, true, 1));
        expect(await screen.findByText(/Doğru! \+150/)).toBeInTheDocument();
        // Aynı sorunun ikinci bildirimi yeniden gönderilmez
        act(() => opts.callbacks.onAnswer({ index: 0, choice: 1 }));
        expect(towerApi.answer).toHaveBeenCalledTimes(1);
    });

    it('yanlış cevapta doğru şık yazılır', async () => {
        towerApi.answer.mockResolvedValue({ answer: { q: 1, choice: 1, correct: false, correct_choice: 0 } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onQuestion({ index: 1, seconds: 8 }));
        act(() => opts.callbacks.onAnswer({ index: 1, choice: 1 }));
        expect(await screen.findByText(/Yanlış — doğru cevap: A · H2O/)).toBeInTheDocument();
        expect(engine.controls.setAnswerResult).toHaveBeenCalledWith(1, false, 0);
    });

    it('süre dolunca sunucuya gitmez', async () => {
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onQuestion({ index: 0, seconds: 8 }));
        act(() => opts.callbacks.onAnswer({ index: 0, choice: -1 }));
        expect(screen.getByText('Süre doldu')).toBeInTheDocument();
        expect(towerApi.answer).not.toHaveBeenCalled();
    });

    it('cevap ağ hatasında 2 kez yeniden denenir, sonra "?" kalır; 409 denenmez', async () => {
        towerApi.answer.mockRejectedValue(netErr());
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onQuestion({ index: 0, seconds: 8 }));
        act(() => opts.callbacks.onAnswer({ index: 0, choice: 0 }));
        expect(await screen.findByText(/Bağlantı yavaş/)).toBeInTheDocument();
        expect(towerApi.answer).toHaveBeenCalledTimes(3);
        expect(engine.controls.setAnswerResult).not.toHaveBeenCalled();

        towerApi.answer.mockReset();
        towerApi.answer.mockRejectedValue(httpErr(409, 'Çok erken.'));
        act(() => opts.callbacks.onQuestion({ index: 1, seconds: 8 }));
        act(() => opts.callbacks.onAnswer({ index: 1, choice: 0 }));
        expect(await screen.findByText(/Sonuç bekleniyor/)).toBeInTheDocument();
        expect(towerApi.answer).toHaveBeenCalledTimes(1);
    });

    it('oyun bitince replay yükünü gönderir ve sonucu gösterir', async () => {
        towerApi.finish.mockResolvedValue({ result: RESULT });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onEnd(END));
        await waitFor(() => expect(towerApi.finish).toHaveBeenCalledWith('run-1', { end_tick: 4321, inputs: '70T,90T,0B', client_score: 1680 }));
        expect(await screen.findByText('Yeni rekor! 🏆')).toBeInTheDocument();
        expect(screen.getByText('+28 XP')).toBeInTheDocument();
        expect(screen.getByText(/\+41 jeton/)).toBeInTheDocument();
        expect(screen.getByText('1/2')).toBeInTheDocument();
        expect(screen.getByText('x9')).toBeInTheDocument();
        expect(screen.getByText(/Seviye atladın! 4 → 5/)).toBeInTheDocument();
        expect(screen.getByText('İlk Kat')).toBeInTheDocument();
        expect(screen.getByText(/12\. kat · Türkiye/)).toBeInTheDocument();
        expect(screen.getByText('B · CO2')).toHaveClass('text-rose-300');
        expect(loadPending('u1')).toBeNull();
        expect(towerApi.abandon).not.toHaveBeenCalled();
    });

    it('bitiş ağ hatasında 3 dener, kaydı saklar; "Tekrar dene" ile gönderir', async () => {
        towerApi.finish.mockRejectedValue(netErr());
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onEnd(END));
        expect(await screen.findByText('Kulen gönderilemedi')).toBeInTheDocument();
        expect(towerApi.finish).toHaveBeenCalledTimes(3);
        const pending = loadPending('u1');
        expect(pending).toMatchObject({ run_id: 'run-1', end_tick: 4321, inputs: '70T,90T,0B', client_score: 1680 });

        towerApi.finish.mockReset();
        towerApi.finish.mockResolvedValue({ result: { ...RESULT, new_best: false } });
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        expect(await screen.findByText(/Harika kule!/)).toBeInTheDocument();
        expect(loadPending('u1')).toBeNull();
    });

    it('sunucu reddederse (422) bekleyen kayıt silinir', async () => {
        towerApi.finish.mockRejectedValue(httpErr(422, 'Kule doğrulanamadı; skor kaydedilmedi.'));
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onEnd(END));
        expect(await screen.findByText('Kule kaydedilmedi')).toBeInTheDocument();
        expect(screen.getByText('Kule doğrulanamadı; skor kaydedilmedi.')).toBeInTheDocument();
        expect(towerApi.finish).toHaveBeenCalledTimes(1);
        expect(loadPending('u1')).toBeNull();
    });

    it('bozuk sonuç yanıtında "kaydedildi" paneli', async () => {
        towerApi.finish.mockResolvedValue({});
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onEnd(END));
        expect(await screen.findByText('Kulen kaydedildi')).toBeInTheDocument();
    });

    it('misafir antrenmanı: soru yok, sonuç yerel rekorla ve giriş çağrısıyla', async () => {
        Object.assign(auth, { isAuthenticated: false, user: null });
        renderPlay({ mode: 'practice' });
        await startCountdown();
        expect(opts.questions).toEqual([]);
        expect(Number.isInteger(opts.seed)).toBe(true);
        expect(opts.avatar.body).toBe('erkek');
        act(() => opts.callbacks.onEnd({ ...END, floor: 12, localScore: 240 }));
        // Cihazdaki ilk antrenman da rekordur
        expect(await screen.findByText('Yeni rekor! 🏆')).toBeInTheDocument();
        expect(screen.getByText(/Bu cihazdaki rekorun/)).toHaveTextContent('240 puan · 12 kat');
        expect(screen.getByText(/Soru katları, XP, jeton/)).toBeInTheDocument();
        expect(towerApi.finish).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.guestBest))).toEqual({ score: 240, floor: 12 });
    });

    it('WebGL yoksa dereceli kule terk edilir', async () => {
        engine = makeEngine({ webgl: false });
        loadTowerEngine.mockResolvedValue(engine.mod);
        renderPlay({ mode: 'ranked', run: RUN });
        expect(await screen.findByText('3D desteklenmiyor')).toBeInTheDocument();
        await waitFor(() => expect(towerApi.abandon).toHaveBeenCalledWith('run-1'));
        expect(engine.mod.createTowerGame).not.toHaveBeenCalled();
    });

    it('mola: buton ve Esc; molada soru gizlenir; devam motoru sürdürür', async () => {
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onQuestion({ index: 0, seconds: 8 }));
        fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
        expect(engine.controls.pause).toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Mola' })).toBeInTheDocument();
        expect(screen.getByTestId('tower-qpanel-wrap')).toHaveClass('invisible');
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(engine.controls.resume).toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: 'Mola' })).toBeNull();
        expect(screen.getByTestId('tower-qpanel-wrap')).not.toHaveClass('invisible');
    });

    it('moladan "Çık": kule terk edilir, kaydedilmez', async () => {
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
        fireEvent.click(screen.getByRole('button', { name: /Çık/ }));
        expect(await screen.findByText('LOBİ /oyun/kule')).toBeInTheDocument();
        await waitFor(() => expect(towerApi.abandon).toHaveBeenCalledWith('run-1'));
        expect(towerApi.finish).not.toHaveBeenCalled();
    });

    it('moladan "Bitir ve kaydet": motor bitirir, sonuç gönderilir', async () => {
        towerApi.finish.mockResolvedValue({ result: { ...RESULT, new_best: false, floors: 7 } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
        fireEvent.click(screen.getByRole('button', { name: /Bitir ve kaydet/ }));
        expect(engine.controls.quit).toHaveBeenCalled();
        await waitFor(() => expect(towerApi.finish).toHaveBeenCalledWith('run-1', { end_tick: 900, inputs: '80T,95T', client_score: 95 }));
        expect(await screen.findByText(/Bir dahaki sefere/)).toBeInTheDocument();
    });

    it('sayfa gizlenince açık kulenin anlık görüntüsü bekleyen kayıt olur; ayrılınca bitirilir', async () => {
        engine = makeEngine({ snapshot: { endTick: 700, inputs: '60T', localScore: 10 } });
        loadTowerEngine.mockResolvedValue(engine.mod);
        towerApi.finish.mockResolvedValue({ result: RESULT });
        const view = renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => window.dispatchEvent(new Event('pagehide')));
        expect(loadPending('u1')).toMatchObject({ run_id: 'run-1', end_tick: 700, inputs: '60T' });
        view.unmount();
        await waitFor(() => expect(towerApi.finish).toHaveBeenCalledWith('run-1', { end_tick: 700, inputs: '60T', client_score: 10 }));
        expect(towerApi.abandon).not.toHaveBeenCalled();
    });

    it('"Tekrar Oyna" yeni dereceli kule açar ve motoru yeniden kurar', async () => {
        towerApi.finish.mockResolvedValue({ result: RESULT });
        towerApi.start.mockResolvedValue({ run: { ...RUN, id: 'run-2', seed: 9 } });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onEnd(END));
        fireEvent.click(await screen.findByRole('button', { name: /Tekrar Oyna/ }));
        await waitFor(() => expect(engine.mod.createTowerGame).toHaveBeenCalledTimes(2));
        expect(towerApi.start).toHaveBeenCalledTimes(1);
        expect(opts.seed).toBe(9);
    });

    it('yeni kule açılamazsa antrenman önerilir', async () => {
        towerApi.finish.mockResolvedValue({ result: RESULT });
        towerApi.start.mockRejectedValue(httpErr(429, 'Çok hızlı gidiyorsun.'));
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => opts.callbacks.onEnd(END));
        fireEvent.click(await screen.findByRole('button', { name: /Tekrar Oyna/ }));
        expect(await screen.findByText('Yeni kule başlatılamadı')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Antrenman modunda oyna/ }));
        await waitFor(() => expect(engine.mod.createTowerGame).toHaveBeenCalledTimes(2));
        expect(opts.questions).toEqual([]);
    });

    it('motor titreşim isteklerini seyreltir', async () => {
        const vib = vi.fn();
        Object.defineProperty(navigator, 'vibrate', { value: vib, configurable: true });
        renderPlay({ mode: 'ranked', run: RUN });
        await startCountdown();
        act(() => {
            opts.callbacks.onHaptic('medium');
            opts.callbacks.onHaptic('light');
            opts.callbacks.onHaptic('heavy');
        });
        expect(vib).toHaveBeenCalledTimes(2);
        expect(vib).toHaveBeenNthCalledWith(1, 24);
        expect(vib).toHaveBeenNthCalledWith(2, [70, 40, 90]);
    });
});
