// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen , configure } from '@testing-library/react';

// CI / yoğun makinede jsdom render'ı yavaşlayabiliyor; varsayılan 1 sn / 5 sn
// sınırları kararsız sonuç veriyordu.
configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../../services/gameApi', () => ({
    gameApi: {
        getSession: vi.fn(),
        getQuestion: vi.fn(),
        answer: vi.fn(),
        abandon: vi.fn(),
    },
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (_err, fallback) => fallback || 'Hata',
    gameErrorData: (err) => err?.response?.data?.data ?? null,
}));
vi.mock('../../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});

import { gameApi } from '../../../services/gameApi';
import GamePlayPage from '../../../pages/game/GamePlayPage';

const session = (over = {}) => ({
    session: {
        id: 's1',
        mode: 'arena',
        status: 'active',
        category: null,
        total_questions: 10,
        current_index: 0,
        score: 0,
        correct_count: 0,
        streak: 0,
        time_limit_ms: 15000,
        duel_id: null,
        ...over,
    },
});

const served = (index = 0, remaining = 14000) => ({
    question: {
        index,
        total: 10,
        question: {
            id: 100 + index,
            text: `Soru metni ${index + 1}`,
            options: ['İstanbul', 'İzmir', 'Ankara', 'Bursa'],
            category: { id: 1, slug: 'cografya', name: 'Coğrafya' },
            difficulty: 1,
        },
        time_limit_ms: 15000,
        remaining_ms: remaining,
    },
});

const answer = (over = {}) => ({
    answer: {
        correct: true,
        timed_out: false,
        chosen_index: 2,
        correct_index: 2,
        points: 187,
        time_ms: 4210,
        explanation: 'Ankara 1923ten beri başkent.',
        score: 187,
        correct_count: 1,
        streak: 1,
        finished: false,
        result: null,
        ...over,
    },
});

function resetApi() {
    vi.clearAllMocks();
    Object.values(gameApi).forEach((fn) => fn.mockReset());
}

const ResultProbe = () => {
    const loc = useLocation();
    return <div>SONUÇ EKRANI {loc.state?.result?.score ?? 'yok'}</div>;
};

function renderPlay() {
    return render(
        <MemoryRouter initialEntries={['/oyun/oyna/s1']}>
            <Routes>
                <Route path="/oyun/oyna/:sessionId" element={<GamePlayPage />} />
                <Route path="/oyun/sonuc/:sessionId" element={<ResultProbe />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('GamePlayPage - cevap akışı', () => {
    beforeEach(() => {
        resetApi();
        gameApi.getSession.mockResolvedValue(session());
        gameApi.getQuestion.mockResolvedValueOnce(served(0)).mockResolvedValueOnce(served(1));
    });

    it('şıkka basınca cevabı bir kez gönderir, doğruyu vurgular, puanı ve açıklamayı gösterir', async () => {
        let resolveAnswer;
        gameApi.answer.mockImplementation(() => new Promise((r) => (resolveAnswer = r)));
        renderPlay();

        expect(await screen.findByText('Soru metni 1')).toBeInTheDocument();
        const ankara = screen.getByRole('button', { name: /3\. şık: Ankara/ });

        // Çift tıklama: yalnızca bir istek.
        fireEvent.click(ankara);
        fireEvent.click(ankara);
        fireEvent.click(screen.getByRole('button', { name: /1\. şık: İstanbul/ }));
        expect(gameApi.answer).toHaveBeenCalledTimes(1);
        expect(gameApi.answer).toHaveBeenCalledWith('s1', { index: 0, choice: 2 });

        await act(async () => resolveAnswer(answer()));

        expect(screen.getByText('Doğru!')).toBeInTheDocument();
        expect(screen.getAllByText('+187').length).toBeGreaterThan(0);
        expect(screen.getByText('Ankara 1923ten beri başkent.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /3\. şık: Ankara \(doğru cevap\)/ })).toHaveAttribute('data-state', 'correct');
        // aria-live duyurusu
        expect(screen.getByText('Doğru! +187 puan.')).toBeInTheDocument();
        // Skor güncellendi
        expect(screen.getByLabelText('Skor 187')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Sonraki soru/ }));
        expect(await screen.findByText('Soru metni 2')).toBeInTheDocument();
        expect(gameApi.getQuestion).toHaveBeenCalledTimes(2);
    });

    it('yanlış cevapta seçileni yanlış, doğru şıkkı doğru olarak işaretler', async () => {
        gameApi.answer.mockResolvedValue(answer({ correct: false, chosen_index: 0, points: 0, score: 0, correct_count: 0, streak: 0, explanation: null }));
        renderPlay();
        await screen.findByText('Soru metni 1');

        fireEvent.click(screen.getByRole('button', { name: /1\. şık: İstanbul/ }));

        expect(await screen.findByText('Yanlış!')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /1\. şık: İstanbul/ })).toHaveAttribute('data-state', 'wrong');
        expect(screen.getByRole('button', { name: /3\. şık: Ankara/ })).toHaveAttribute('data-state', 'correct');
    });

    it('klavyede 1-4 tuşlarıyla cevap verilir', async () => {
        gameApi.answer.mockResolvedValue(answer({ chosen_index: 1, correct: false, correct_index: 2, points: 0 }));
        renderPlay();
        await screen.findByText('Soru metni 1');

        fireEvent.keyDown(window, { key: '2' });
        expect(gameApi.answer).toHaveBeenCalledWith('s1', { index: 0, choice: 1 });
        await screen.findByText('Yanlış!');
    });

    it('son soruda sonuç ekranına sonucu taşıyarak geçer', async () => {
        gameApi.answer.mockResolvedValue(answer({ finished: true, score: 1840, result: { score: 1840, total: 10 } }));
        renderPlay();
        await screen.findByText('Soru metni 1');

        fireEvent.click(screen.getByRole('button', { name: /3\. şık: Ankara/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Sonuçları gör/ }));

        expect(await screen.findByText('SONUÇ EKRANI 1840')).toBeInTheDocument();
    });

    it('409 gelirse oturumu yeniden çekip kaldığı yerden devam eder', async () => {
        gameApi.getQuestion.mockReset();
        gameApi.getQuestion.mockResolvedValueOnce(served(0)).mockResolvedValueOnce(served(3, 9000));
        gameApi.answer.mockRejectedValue({ response: { status: 409, data: { success: false, message: 'index' } } });
        renderPlay();
        await screen.findByText('Soru metni 1');

        fireEvent.click(screen.getByRole('button', { name: /2\. şık: İzmir/ }));

        expect(await screen.findByText('Soru metni 4')).toBeInTheDocument();
        expect(gameApi.getSession).toHaveBeenCalledTimes(2);
        // Yeni soruda şıklar yeniden tıklanabilir
        expect(screen.getByRole('button', { name: /1\. şık: İstanbul/ })).not.toBeDisabled();
    });

    it('oturum bitmişse doğrudan sonuç ekranına gider', async () => {
        gameApi.getSession.mockResolvedValue(session({ status: 'finished' }));
        renderPlay();
        expect(await screen.findByText(/SONUÇ EKRANI/)).toBeInTheDocument();
        expect(gameApi.getQuestion).not.toHaveBeenCalled();
    });

    it('yükleme hatasında dostça mesaj ve tekrar dene butonu gösterir', async () => {
        gameApi.getSession.mockRejectedValueOnce(new Error('ağ')).mockResolvedValue(session());
        renderPlay();
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        expect(await screen.findByText('Soru metni 1')).toBeInTheDocument();
    });
});

describe('GamePlayPage - geri sayım', () => {
    beforeEach(() => {
        resetApi();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('sunucunun remaining_ms değerinden sayar ve süre bitince choice: null gönderir', async () => {
        gameApi.getSession.mockResolvedValue(session());
        gameApi.getQuestion.mockResolvedValue(served(0, 5000));
        gameApi.answer.mockResolvedValue(answer({ correct: false, timed_out: true, chosen_index: null, points: 0, score: 0, correct_count: 0, streak: 0 }));

        renderPlay();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10);
        });
        expect(screen.getByText('Soru metni 1')).toBeInTheDocument();
        expect(screen.getByRole('timer')).toHaveAttribute('aria-label', 'Kalan süre 5 saniye');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(gameApi.answer).not.toHaveBeenCalled();
        expect(screen.getByRole('timer')).toHaveAttribute('aria-label', 'Kalan süre 2 saniye');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2100);
        });
        expect(gameApi.answer).toHaveBeenCalledTimes(1);
        expect(gameApi.answer).toHaveBeenCalledWith('s1', { index: 0, choice: null });
        expect(screen.getByText('Süre doldu!')).toBeInTheDocument();
    });
});
