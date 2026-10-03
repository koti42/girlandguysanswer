// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, configure, fireEvent, render, screen, within } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-confetti', () => ({
    default: ({ width, height, numberOfPieces }) => <div data-testid="confetti" data-w={width} data-h={height} data-n={numberOfPieces} />,
}));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});
vi.mock('../../../services/gameApi', () => ({
    gameApi: { finishRunner: vi.fn() },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (_err, fallback) => fallback || 'Hata',
}));

import RunnerResult from '../runner/RunnerResult';
import QuestionPanel from '../runner/QuestionPanel';
import RunnerHud from '../runner/RunnerHud';
import PauseMenu from '../runner/PauseMenu';
import RunnerControlsHint from '../runner/RunnerControlsHint';
import { createHudStore, sanitizeHud } from '../runner/hudStore';
import { withViewportFitCover } from '../runner/useViewportFitCover';
import { badgeIcon } from '../gameIcons';
import { LuAward, LuBrain, LuFootprints, LuRocket, LuRoute, LuZap } from 'react-icons/lu';
import {
    LANES,
    MULT_STYLES,
    STORAGE_KEYS,
    classifyFinishError,
    controlsHintText,
    detectWebGL,
    markControlsHintShown,
    shouldShowControlsHint,
    clearPending,
    finishFailureText,
    gateFailureReason,
    isRetryable,
    loadCharacter,
    loadMusicEnabled,
    loadPending,
    multiplierFrom,
    normalizeRun,
    randomSeed,
    recordGuestRun,
    saveMusicEnabled,
    savePending,
    withRetry,
} from '../runner/runnerUtils';

const matchMedia = (reduced) => {
    window.matchMedia = vi.fn((q) => ({ matches: reduced && q.includes('reduce'), addListener() {}, removeListener() {} }));
};

const RESULT = {
    score: 2500,
    distance_m: 640,
    coins: 18,
    correct_count: 2,
    gates_passed: 3,
    max_multiplier: 3,
    crashed: true,
    breakdown: { dist_points: 1900, coin_points: 180, gate_points: 420 },
    xp_earned: 32,
    level_before: 4,
    level_after: 5,
    level_up: true,
    new_best: true,
    best_score: 2500,
    weekly_rank: null,
    badges_earned: [],
    player: { xp: 1600, level: 5, level_progress: { percent: 10, next_level_xp: 2500 } },
    gates: [
        { index: 0, question: 'Başkent?', options: ['İzmir', 'İstanbul', 'Ankara'], chosen_lane: 2, correct_lane: 2, correct: true },
        { index: 1, question: '2+2?', options: ['3', '4', '5'], chosen_lane: 0, correct_lane: 1, correct: false },
    ],
};

const renderResult = (props) =>
    render(
        <MemoryRouter>
            <RunnerResult onAgain={() => {}} onLobby={() => {}} {...props} />
        </MemoryRouter>
    );

describe('RunnerResult', () => {
    beforeEach(() => matchMedia(true));

    it('azaltılmış harekette skoru doğrudan gösterir, konfeti yok; kapı özetini listeler', () => {
        renderResult({ result: RESULT });
        expect(screen.getByRole('heading', { name: /Yeni rekor/ })).toBeInTheDocument();
        expect(screen.getByText('2.500')).toBeInTheDocument();
        expect(screen.getByText('Kişisel rekor')).toBeInTheDocument();
        expect(screen.getByText('2/3')).toBeInTheDocument();
        expect(screen.getByText('x3')).toBeInTheDocument();
        expect(screen.getByText(/Seviye atladın! 4 → 5/)).toBeInTheDocument();
        expect(screen.queryByTestId('confetti')).toBeNull();

        const summary = screen.getByRole('heading', { name: 'Kapı kapı özet' }).closest('section');
        const items = within(summary).getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(within(items[1]).getByText('Orta · 4')).toBeInTheDocument();
        expect(within(items[1]).getByText('Sol · 3')).toBeInTheDocument();
    });

    it('kapı açıklaması: canlı yanıttaki öncelikli, yoksa bitiş yanıtındaki gösterilir', () => {
        const result = {
            ...RESULT,
            gates: [
                { ...RESULT.gates[0], explanation: 'Sunucu açıklaması 0' },
                { ...RESULT.gates[1], explanation: 'Sunucu açıklaması 1' },
            ],
        };
        renderResult({ result, explanations: { 0: 'Canlı açıklama 0' } });
        expect(screen.getByText('Canlı açıklama 0')).toBeInTheDocument();
        expect(screen.queryByText('Sunucu açıklaması 0')).toBeNull();
        expect(screen.getByText('Sunucu açıklaması 1')).toBeInTheDocument();
    });

    it('yeni rekorda konfeti patlatır ve skor sayarak artar', async () => {
        matchMedia(false);
        let rafCb = [];
        const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rafCb.push(cb);
            return rafCb.length;
        });
        vi.useFakeTimers();
        try {
            renderResult({ result: RESULT });
            expect(screen.getByText('0')).toBeInTheDocument();
            act(() => {
                const cbs = rafCb;
                rafCb = [];
                cbs.forEach((cb) => cb(0));
            });
            act(() => {
                const cbs = rafCb;
                rafCb = [];
                cbs.forEach((cb) => cb(5000));
            });
            expect(screen.getByText('2.500')).toBeInTheDocument();
            act(() => vi.advanceTimersByTime(400));
            const c = screen.getByTestId('confetti');
            // Tuval görünür alan kadar (kaydırma çubuğu hariç), parça sayısı genişliğe göre sınırlı.
            expect(Number(c.dataset.w)).toBe(document.documentElement.clientWidth || window.innerWidth);
            expect(Number(c.dataset.h)).toBe(window.innerHeight);
            expect(Number(c.dataset.n)).toBeGreaterThanOrEqual(120);
            expect(Number(c.dataset.n)).toBeLessThanOrEqual(380);
        } finally {
            vi.useRealTimers();
            raf.mockRestore();
        }
    });

    it('antrenman sonucunda misafire giriş çağrısı, üyeye değil', () => {
        const practice = { practice: true, score: 300, distance_m: 150, coins: 4, new_best: false, best_score: 900, best_distance: 400 };
        const { unmount } = renderResult({ result: practice, guest: true });
        expect(screen.getByText(/Bu cihazdaki rekorun/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Giriş yap/ })).toHaveAttribute('href', '/login');
        expect(screen.queryByText(/Doğru kapı/)).toBeNull();
        unmount();
        renderResult({ result: practice, guest: false });
        expect(screen.queryByRole('link', { name: /Giriş yap/ })).toBeNull();
    });

    it('kısa koşu (counted: false) için nazik not gösterir; alan yoksa göstermez', () => {
        const { unmount } = renderResult({ result: { ...RESULT, counted: false } });
        expect(screen.getByText('50 metreden kısa koşular istatistiklere sayılmaz.')).toBeInTheDocument();
        unmount();
        renderResult({ result: RESULT });
        expect(screen.queryByText(/50 metreden kısa/)).toBeNull();
    });

    it('Tekrar Koş ve Lobiye dön butonları geri çağrıları tetikler', () => {
        const onAgain = vi.fn();
        const onLobby = vi.fn();
        renderResult({ result: RESULT, onAgain, onLobby });
        fireEvent.click(screen.getByRole('button', { name: /Tekrar Koş/ }));
        fireEvent.click(screen.getByRole('button', { name: /Lobiye dön/ }));
        expect(onAgain).toHaveBeenCalledTimes(1);
        expect(onLobby).toHaveBeenCalledTimes(1);
    });
});

describe('QuestionPanel', () => {
    const q = { text: 'Çok uzun bir soru metni '.repeat(8), options: ['Sol cevap', 'Orta cevap', 'Sağ cevap'], category: { name: 'Genel' } };

    it('soruyu üç şeritle gösterir; uzun metinde küçük font', () => {
        render(<QuestionPanel gate={{ index: 2, question: q, status: 'asking', seconds: 7 }} total={30} />);
        expect(screen.getByText(/Kapı 3 \/ 30 · Genel/)).toBeInTheDocument();
        const h = screen.getByRole('heading');
        expect(h.className).toContain('text-[13px]');
        expect(screen.getByText('◀ Sol')).toBeInTheDocument();
        expect(screen.getByText('▲ Orta')).toBeInTheDocument();
        expect(screen.getByText('Sağ ▶')).toBeInTheDocument();
        expect(screen.getByText('Şeridini seç!')).toBeInTheDocument();
    });

    it('güvenlik ağı: soru mobilde 4 satırda kırpılır, panel ekranın %45 yüksekliğini aşmaz; şıklar kırpılmaz', () => {
        const longQ = { text: 'Uzun soru '.repeat(40), options: ['Ç'.repeat(90), 'kısa', 'orta uzunlukta bir şık'], category: null };
        render(<QuestionPanel gate={{ index: 0, question: longQ, status: 'asking', seconds: 7 }} />);
        const h = screen.getByTestId('runner-qpanel-q');
        expect(h.className).toContain('line-clamp-4');
        // Tam metin DOM'da (kırpma yalnızca görsel).
        expect(h.textContent).toBe(longQ.text);
        const panel = screen.getByLabelText('Soru kapısı');
        expect(panel.className).toContain('max-h-[45vh]');
        expect(panel.className).toContain('supports-[height:1svh]:max-h-[45svh]');
        expect(panel.className).toContain('overflow-hidden');
        const longOpt = screen.getByText('Ç'.repeat(90));
        expect(longOpt.className).not.toMatch(/line-clamp|truncate/);
        // Font küçültme sürüyor: en uzun şıkka göre üçü de küçük.
        expect(longOpt.className).toContain('text-[11px]');
        expect(screen.getByText('kısa').className).toContain('text-[11px]');
    });

    it('yanlışta doğru cevabı şerit adıyla yazar', () => {
        render(<QuestionPanel gate={{ index: 0, question: q, status: 'wrong', chosenLane: 0, correctLane: 1 }} total={30} />);
        expect(screen.getByText(/Yanlış — doğru cevap: Orta · Orta cevap/)).toBeInTheDocument();
    });

    it('"?" durumu: ağ sorunu ile sunucunun karar vermemesi ayrı anlatılır', () => {
        const { rerender } = render(<QuestionPanel gate={{ index: 0, question: q, status: 'unknown', reason: 'network', chosenLane: 1 }} />);
        expect(screen.getByText(/Bağlantı yavaş: bu kapı koşu sonunda değerlendirilecek/)).toBeInTheDocument();
        expect(screen.queryByText('?')).toBeNull();
        rerender(<QuestionPanel gate={{ index: 0, question: q, status: 'unknown', reason: 'pending', chosenLane: 1 }} />);
        expect(screen.getByText(/Sonuç bekleniyor: bu kapı koşu sonunda değerlendirilecek/)).toBeInTheDocument();
        expect(screen.getByText('?')).toBeInTheDocument();
        expect(screen.getByTestId('runner-gate-feedback')).toHaveAttribute('aria-live', 'polite');
    });

    it('frozen: süre çubuğu durur; hidden: panel sökülmeden görünmez olur', () => {
        const gate = { index: 0, question: q, status: 'asking', seconds: 6.8 };
        const { rerender } = render(<QuestionPanel gate={gate} />);
        const timer = screen.getByTestId('runner-gate-timer');
        expect(timer.style.animationDuration).toBe('6.8s');
        expect(timer.style.animationPlayState).toBe('running');
        expect(screen.getByTestId('runner-qpanel-wrap').className).not.toContain('invisible');
        rerender(<QuestionPanel gate={gate} frozen hidden />);
        // Aynı eleman: animasyon sıfırlanmaz, kaldığı yerden sürer.
        expect(screen.getByTestId('runner-gate-timer')).toBe(timer);
        expect(timer.style.animationPlayState).toBe('paused');
        expect(screen.getByTestId('runner-qpanel-wrap').className).toContain('invisible');
    });

    it('cevaplanınca panel "answered" sınıfı alır (yatayda soru ve şıklar gizlenir)', () => {
        const { rerender } = render(<QuestionPanel gate={{ index: 0, question: q, status: 'asking', seconds: 7 }} />);
        expect(screen.getByLabelText('Soru kapısı').className).not.toContain('runner-qpanel--answered');
        rerender(<QuestionPanel gate={{ index: 0, question: q, status: 'correct', chosenLane: 1, correctLane: 1, multiplier: 2 }} />);
        expect(screen.getByLabelText('Soru kapısı').className).toContain('runner-qpanel--answered');
    });

    it('şık ve geri bildirim renkleri AA kontrastlı tonlarda', () => {
        const { rerender } = render(<QuestionPanel gate={{ index: 0, question: q, status: 'correct', chosenLane: 1, correctLane: 1, multiplier: 2 }} />);
        expect(screen.getByText(/Doğru! x2/).className).toContain('bg-emerald-700');
        expect(screen.getByText('◀ Sol').className).toContain('text-white');
        expect(screen.getByText('◀ Sol').className).not.toContain('text-white/85');
        rerender(<QuestionPanel gate={{ index: 0, question: q, status: 'wrong', chosenLane: 0, correctLane: 1 }} />);
        expect(screen.getByText(/Yanlış/).className).toContain('bg-rose-600');
        expect(LANES.map((l) => l.className)).toEqual(['from-pink-600 to-rose-600', 'from-violet-600 to-purple-600', 'from-sky-700 to-blue-700']);
        expect([MULT_STYLES[2], MULT_STYLES[3], MULT_STYLES[4]]).toEqual(['bg-sky-700 text-white', 'bg-violet-600 text-white', 'bg-fuchsia-700 text-white']);
    });

    it('soru metnini HTML olarak yorumlamaz', () => {
        const evil = { text: '<img src=x onerror=alert(1)>', options: ['<b>a</b>', 'b', 'c'] };
        const { container } = render(<QuestionPanel gate={{ index: 0, question: evil, status: 'asking' }} />);
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('b')).toBeNull();
        expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    });
});

describe('PauseMenu', () => {
    const props = { onResume() {}, onRestart() {}, onFinish() {}, onExit() {} };

    it('mola cezası uyarısı göstermez', () => {
        render(<PauseMenu ranked {...props} />);
        expect(screen.getByRole('dialog', { name: 'Mola' })).not.toHaveTextContent(/yanlış sayıl/);
    });

    it('müzik anahtarı: role=switch, aria-checked ve metin durumu yansıtır', () => {
        const onToggleMusic = vi.fn();
        const { rerender } = render(<PauseMenu ranked musicEnabled onToggleMusic={onToggleMusic} {...props} />);
        const sw = screen.getByRole('switch', { name: 'Müzik' });
        expect(sw).toHaveAttribute('aria-checked', 'true');
        expect(sw).toHaveTextContent('Müzik: Açık');
        fireEvent.click(sw);
        expect(onToggleMusic).toHaveBeenCalledTimes(1);
        rerender(<PauseMenu ranked musicEnabled={false} onToggleMusic={onToggleMusic} {...props} />);
        expect(screen.getByRole('switch', { name: 'Müzik' })).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('switch', { name: 'Müzik' })).toHaveTextContent('Müzik: Kapalı');
        // Odak hâlâ ilk butonda (Devam et) başlar.
        expect(screen.getByRole('button', { name: /Devam et/ })).toHaveFocus();
    });

    it('onToggleMusic verilmezse anahtar çizilmez', () => {
        render(<PauseMenu ranked={false} {...props} />);
        expect(screen.queryByRole('switch')).toBeNull();
    });
});

describe('RunnerControlsHint', () => {
    it('dokunmatik ve klavye için kısa ipucu; ekran okuyucudan gizli', () => {
        const { rerender } = render(<RunnerControlsHint touch />);
        expect(screen.getByTestId('runner-controls-hint')).toHaveTextContent('◀ ▶ kaydır: şerit · ▲ yukarı: zıpla · ▼ aşağı: kay');
        expect(screen.getByTestId('runner-controls-hint')).toHaveAttribute('aria-hidden', 'true');
        rerender(<RunnerControlsHint />);
        expect(screen.getByTestId('runner-controls-hint')).toHaveTextContent('← → şerit · ↑/Boşluk zıpla · ↓ kay · Esc duraklat');
    });
});

describe('RunnerHud', () => {
    it('depodan okur; motorun yeniden kullandığı nesne değişse de güncellenir', () => {
        const store = createHudStore();
        const reused = { score: 10, distance: 5, coins: 1, multiplier: 2, magnetPct: 0, shield: false, stumbling: false, tick: 1 };
        render(<RunnerHud store={store} muted={false} onToggleMute={() => {}} onPause={() => {}} />);
        act(() => store.set(sanitizeHud(reused)));
        expect(screen.getByTestId('runner-score')).toHaveTextContent('10');
        reused.score = 99999;
        reused.multiplier = 9; // sınır dışı: 5'e kırpılır
        act(() => store.set(sanitizeHud(reused)));
        expect(screen.getByTestId('runner-score')).toHaveTextContent('99.999');
        expect(screen.getByText('x5')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Duraklat' })).toBeInTheDocument();
    });
});

describe('runnerUtils', () => {
    beforeEach(() => localStorage.clear());

    it('müzik tercihi: varsayılan açık, kaydedilir; depolama kapalıysa açık sayılır', () => {
        expect(STORAGE_KEYS.music).toBe('hs_runner_music');
        expect(loadMusicEnabled()).toBe(true);
        saveMusicEnabled(false);
        expect(localStorage.getItem('hs_runner_music')).toBe('0');
        expect(loadMusicEnabled()).toBe(false);
        saveMusicEnabled(true);
        expect(loadMusicEnabled()).toBe(true);
        localStorage.setItem('hs_runner_music', 'bozuk');
        expect(loadMusicEnabled()).toBe(true);
        const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceeded');
        });
        try {
            expect(loadMusicEnabled()).toBe(true);
            expect(() => saveMusicEnabled(false)).not.toThrow();
        } finally {
            get.mockRestore();
            set.mockRestore();
        }
    });

    it('çarpan: bilinmeyen kapı çarpanı değiştirmez, en fazla x5', () => {
        expect(multiplierFrom({})).toBe(1);
        expect(multiplierFrom({ 0: true, 1: true })).toBe(3);
        expect(multiplierFrom({ 0: true, 2: true })).toBe(3);
        expect(multiplierFrom({ 0: true, 1: false, 2: true })).toBe(2);
        expect(multiplierFrom({ 0: true, 1: true, 2: true, 3: true, 4: true, 5: true })).toBe(5);
    });

    it('normalizeRun bozuk koşuyu reddeder, kapı sayısı tutarlı olmalı', () => {
        const ok = { id: 'r', seed: 5, sim_version: 1, gate_count: 1, gates: [{ index: 0, question: { text: 'S', options: ['a', 'b', 'c'] } }] };
        expect(normalizeRun(ok)).toMatchObject({ id: 'r', seed: 5, gates: [{ index: 0 }] });
        expect(normalizeRun({ ...ok, seed: 0 })).toBeNull();
        expect(normalizeRun({ ...ok, seed: 2 ** 32 })).toBeNull();
        expect(normalizeRun({ ...ok, gate_count: 2 })).toBeNull();
        expect(normalizeRun({ ...ok, gates: [{ index: 1, question: ok.gates[0].question }], gate_count: 1 })).toBeNull();
        expect(normalizeRun({ ...ok, gates: [{ index: 0, question: { text: 'S', options: ['a', 'b'] } }] })).toBeNull();
        expect(normalizeRun(null)).toBeNull();
    });

    it('karakter: bozuk kayıt varsayılana düşer, cinsiyete göre tip', () => {
        localStorage.setItem(STORAGE_KEYS.character, '{bozuk');
        expect(loadCharacter('male')).toEqual({ body: 'erkek', palette: 0 });
        localStorage.setItem(STORAGE_KEYS.character, JSON.stringify({ body: 'kiz', palette: 7 }));
        expect(loadCharacter('female')).toEqual({ body: 'kiz', palette: 0 });
        localStorage.setItem(STORAGE_KEYS.character, JSON.stringify({ body: 'kiz', palette: 3 }));
        expect(loadCharacter('male')).toEqual({ body: 'kiz', palette: 3 });
    });

    it('misafir rekoru yalnızca aşılınca yenilenir', () => {
        expect(recordGuestRun({ score: 100, distance: 50 })).toEqual({ best: { score: 100, distance: 50 }, newBest: true });
        expect(recordGuestRun({ score: 80, distance: 90 })).toEqual({ best: { score: 100, distance: 90 }, newBest: false });
    });

    it('bekleyen kayıt: kaydet, oku, kullanıcı ve süre kontrolü, sil', () => {
        savePending({ userId: 'u1', runId: 'r1', endTick: 60, inputs: '1J', clientScore: 5e12 });
        expect(loadPending('u1')).toMatchObject({ run_id: 'r1', end_tick: 60, inputs: '1J', client_score: 2000000000 });
        expect(loadPending('u2')).toBeNull();
        expect(loadPending('u1', Date.now() + 3 * 60 * 60 * 1000)).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.pending)).toBeNull();
        savePending({ userId: 'u1', runId: 'r1', endTick: 60, inputs: '' });
        clearPending('baska');
        expect(loadPending('u1')).not.toBeNull();
        clearPending('r1');
        expect(loadPending('u1')).toBeNull();
    });

    it('rastgele tohum 1..2^32-1 aralığında', () => {
        for (let i = 0; i < 20; i += 1) {
            const s = randomSeed();
            expect(Number.isInteger(s) && s >= 1 && s <= 0xffffffff).toBe(true);
        }
    });

    it('yeniden deneme yalnızca ağ / 5xx / 429 hatalarında', async () => {
        expect(isRetryable(new Error('ağ'))).toBe(true);
        expect(isRetryable({ response: { status: 503 } })).toBe(true);
        expect(isRetryable({ response: { status: 429 } })).toBe(true);
        expect(isRetryable({ response: { status: 409 } })).toBe(false);
        expect(classifyFinishError({ response: { status: 422 } })).toBe('rejected');
        expect(classifyFinishError({ response: { status: 409 } })).toBe('gone');
        expect(classifyFinishError({ response: { status: 401 } })).toBe('auth');
        expect(classifyFinishError(new Error('ağ'))).toBe('retry');

        const fn = vi.fn().mockRejectedValueOnce(new Error('ağ')).mockResolvedValueOnce('tamam');
        await expect(withRetry(fn, [0, 0])).resolves.toBe('tamam');
        expect(fn).toHaveBeenCalledTimes(2);
        const bad = vi.fn().mockRejectedValue({ response: { status: 409 } });
        await expect(withRetry(bad, [0, 0])).rejects.toEqual({ response: { status: 409 } });
        expect(bad).toHaveBeenCalledTimes(1);
    });

    it('rozet ikonları: koşu rozetleri eşlenir, bilinmeyen ve prototip adları varsayılana düşer', () => {
        expect(badgeIcon('footprints')).toBe(LuFootprints);
        expect(badgeIcon('route')).toBe(LuRoute);
        expect(badgeIcon('rocket')).toBe(LuRocket);
        expect(badgeIcon('brain')).toBe(LuBrain);
        expect(badgeIcon('ZAP')).toBe(LuZap);
        expect(badgeIcon('yok-boyle-ikon')).toBe(LuAward);
        expect(badgeIcon('constructor')).toBe(LuAward);
        expect(badgeIcon('__proto__')).toBe(LuAward);
        expect(badgeIcon(null)).toBe(LuAward);
    });

    it('zaman aşımı (ECONNABORTED, yanıt yok) yeniden denenir ve "Tekrar dene"ye düşer', () => {
        const timeout = Object.assign(new Error('timeout of 20000ms exceeded'), { code: 'ECONNABORTED' });
        expect(isRetryable(timeout)).toBe(true);
        expect(classifyFinishError(timeout)).toBe('retry');
        expect(gateFailureReason(timeout)).toBe('network');
    });

    it('WebGL kontrolü yalnızca WebGL2 kabul eder (motor gibi)', () => {
        const prev = HTMLCanvasElement.prototype.getContext;
        try {
            HTMLCanvasElement.prototype.getContext = vi.fn((t) => (t === 'webgl2' ? null : { getExtension: () => null }));
            expect(detectWebGL()).toBe(false);
            HTMLCanvasElement.prototype.getContext = vi.fn((t) => (t === 'webgl2' ? { getExtension: () => null } : null));
            expect(detectWebGL()).toBe(true);
        } finally {
            HTMLCanvasElement.prototype.getContext = prev;
        }
    });

    it('kontrol ipucu sayacı: 3 koşudan sonra gösterilmez; depolama kapalıysa gösterilir', () => {
        expect(shouldShowControlsHint()).toBe(true);
        markControlsHintShown();
        markControlsHintShown();
        expect(shouldShowControlsHint()).toBe(true);
        markControlsHintShown();
        expect(localStorage.getItem(STORAGE_KEYS.hintSeen)).toBe('3');
        expect(shouldShowControlsHint()).toBe(false);
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('denied', 'SecurityError');
        });
        try {
            expect(shouldShowControlsHint()).toBe(true);
            expect(() => markControlsHintShown()).not.toThrow();
        } finally {
            spy.mockRestore();
        }
        expect(controlsHintText(false)).toContain('Esc duraklat');
    });

    it('kapı hatası nedeni: ağ / 5xx / 429 -> network, 409 / 422 -> pending', () => {
        expect(gateFailureReason(new Error('ağ'))).toBe('network');
        expect(gateFailureReason({ response: { status: 502 } })).toBe('network');
        expect(gateFailureReason({ response: { status: 429 } })).toBe('network');
        expect(gateFailureReason({ response: { status: 409 } })).toBe('pending');
        expect(gateFailureReason({ response: { status: 422 } })).toBe('pending');
    });

    it('kalıcı bitiş hatası metni: 409 için kapanmış koşu açıklaması', () => {
        expect(finishFailureText({ response: { status: 409 } })).toMatch(/sunucuda kapanmış/);
        expect(finishFailureText({ response: { status: 404 } })).toBe('Bu koşu artık kaydedilemiyor.');
        expect(finishFailureText({ response: { status: 422 } })).toMatch(/doğrulanamadı/);
    });

    it('viewport-fit=cover ekleme: mevcut değeri değiştirir, çift eklemez', () => {
        expect(withViewportFitCover('width=device-width, initial-scale=1.0')).toBe('width=device-width, initial-scale=1.0, viewport-fit=cover');
        expect(withViewportFitCover('width=device-width,')).toBe('width=device-width, viewport-fit=cover');
        expect(withViewportFitCover('width=device-width, viewport-fit=contain')).toBe('width=device-width, viewport-fit=cover');
        expect(withViewportFitCover('width=device-width, viewport-fit=cover')).toBe('width=device-width, viewport-fit=cover');
        expect(withViewportFitCover('')).toBe('viewport-fit=cover');
        expect(withViewportFitCover(null)).toBe('viewport-fit=cover');
    });
});
