// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-confetti', () => ({ default: () => <div data-testid="confetti" /> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});
vi.mock('../../../../services/towerApi', () => ({ towerApi: { finish: vi.fn(), leaderboard: vi.fn() } }));
vi.mock('../../../../services/gameApi', () => ({
    gameApi: {},
    gameErrorStatus: (err) => err?.response?.status ?? null,
    gameErrorMessage: (err, fallback) => err?.response?.data?.message || fallback || 'Hata',
}));

import toast from 'react-hot-toast';
import TowerQuestionPanel from '../TowerQuestionPanel';
import TowerHud from '../TowerHud';
import TowerResult from '../TowerResult';
import TowerPauseMenu from '../TowerPauseMenu';
import TowerPerfectPop from '../TowerPerfectPop';
import TowerCountdown from '../TowerCountdown';
import { createHudStore } from '../towerUtils';

const Q = {
    sessionKey: 1,
    index: 2,
    question: { text: 'Galata Kulesi hangi şehirde?', options: ['İstanbul', 'İzmir'], category: { name: 'Kültür' } },
    status: 'asking',
    seconds: 8,
    choice: null,
    correctChoice: null,
    reason: null,
};

describe('TowerQuestionPanel', () => {
    it('soru, kategori, süre çubuğu ve iki büyük şık', () => {
        const onAnswer = vi.fn();
        render(<TowerQuestionPanel question={Q} total={20} onAnswer={onAnswer} />);
        expect(screen.getByText('Soru 3 / 20 · Kültür')).toBeInTheDocument();
        expect(screen.getByTestId('tower-qpanel-q')).toHaveTextContent('Galata Kulesi hangi şehirde?');
        expect(screen.getByTestId('tower-q-timer')).toHaveStyle({ animationDuration: '8s', animationPlayState: 'running' });
        fireEvent.click(screen.getByRole('button', { name: 'A: İstanbul' }));
        expect(onAnswer).toHaveBeenCalledWith(0);
        fireEvent.click(screen.getByRole('button', { name: 'B: İzmir' }));
        expect(onAnswer).toHaveBeenLastCalledWith(1);
    });

    it('molada süre durur, şıklar kapanır ve panel gizlenir', () => {
        render(<TowerQuestionPanel question={Q} total={20} frozen hidden onAnswer={() => {}} />);
        expect(screen.getByTestId('tower-q-timer')).toHaveStyle({ animationPlayState: 'paused' });
        expect(screen.getByRole('button', { name: 'A: İstanbul' })).toBeDisabled();
        expect(screen.getByTestId('tower-qpanel-wrap')).toHaveClass('invisible');
    });

    it('cevap sonrası şıklar kalkar, sonuç rozeti gösterilir', () => {
        const { rerender } = render(<TowerQuestionPanel question={{ ...Q, status: 'sending', choice: 1 }} onAnswer={() => {}} />);
        expect(screen.queryByRole('button', { name: /İstanbul/ })).toBeNull();
        expect(screen.getByTestId('tower-answer-feedback')).toHaveTextContent('B · İzmir — kontrol ediliyor…');
        rerender(<TowerQuestionPanel question={{ ...Q, status: 'correct', choice: 0, correctChoice: 0 }} onAnswer={() => {}} />);
        expect(screen.getByText(/Doğru! \+150/)).toBeInTheDocument();
        rerender(<TowerQuestionPanel question={{ ...Q, status: 'wrong', choice: 1, correctChoice: 0 }} onAnswer={() => {}} />);
        expect(screen.getByText(/Yanlış — doğru cevap: A · İstanbul/)).toBeInTheDocument();
        rerender(<TowerQuestionPanel question={{ ...Q, status: 'wrong', choice: 1, correctChoice: null }} onAnswer={() => {}} />);
        expect(screen.getByText(/doğru cevap: \?/)).toBeInTheDocument();
        rerender(<TowerQuestionPanel question={{ ...Q, status: 'timeout' }} onAnswer={() => {}} />);
        expect(screen.getByText('Süre doldu')).toBeInTheDocument();
        rerender(<TowerQuestionPanel question={{ ...Q, status: 'unknown', reason: 'network' }} onAnswer={() => {}} />);
        expect(screen.getByText(/Bağlantı yavaş/)).toBeInTheDocument();
    });

    it('soru yoksa hiçbir şey çizmez', () => {
        const { container } = render(<TowerQuestionPanel question={null} onAnswer={() => {}} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('TowerHud', () => {
    it('depodan kat, skor ve kombo; butonlar', () => {
        const store = createHudStore();
        const onPause = vi.fn();
        const onToggleMute = vi.fn();
        render(<TowerHud store={store} muted onToggleMute={onToggleMute} onPause={onPause} practice />);
        expect(screen.getByTestId('tower-floor')).toHaveTextContent('0');
        expect(screen.queryByTestId('tower-combo')).toBeNull();
        expect(screen.getByText('Antrenman')).toBeInTheDocument();
        act(() => store.set({ score: 15230, floor: 104, combo: 7, perfect: 50, maxCombo: 12 }));
        expect(screen.getByTestId('tower-floor')).toHaveTextContent('104');
        expect(screen.getByTestId('tower-score')).toHaveTextContent('15.230');
        expect(screen.getByTestId('tower-combo')).toHaveTextContent('x7');
        fireEvent.click(screen.getByRole('button', { name: 'Sesi aç' }));
        fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
        expect(onToggleMute).toHaveBeenCalled();
        expect(onPause).toHaveBeenCalled();
    });
});

describe('TowerPerfectPop ve geri sayım', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('kombo büyüdükçe yazı coşar ve kendini kaldırır', () => {
        const { rerender } = render(<TowerPerfectPop fx={{ id: 1, combo: 1, grew: false }} />);
        expect(screen.getByText('Mükemmel!')).toBeInTheDocument();
        // Okunurluk: yazı koyu hap içinde; tek satırda tam yuvarlak, çok satırda köşeli hap.
        expect(screen.getByTestId('tower-perfect-pill')).toHaveAttribute('data-lines', 'single');
        expect(screen.getByText('Mükemmel!')).toHaveClass('tower-perfect-word');
        rerender(<TowerPerfectPop fx={{ id: 2, combo: 12, grew: true }} />);
        expect(screen.getByText('Efsane!')).toBeInTheDocument();
        expect(screen.getByText('x12 kombo')).toHaveClass('tower-perfect-combo');
        expect(screen.getByText('Kat büyüdü!')).toHaveClass('tower-perfect-grew');
        expect(screen.getByTestId('tower-perfect-pill')).toHaveAttribute('data-lines', 'multi');
        act(() => vi.advanceTimersByTime(1300));
        expect(screen.queryByText('Efsane!')).toBeNull();
    });

    it('3-2-1-YÜKSEL!', () => {
        const { rerender } = render(<TowerCountdown value={2} />);
        expect(screen.getByRole('status')).toHaveTextContent('2');
        rerender(<TowerCountdown value={0} />);
        expect(screen.getByRole('status')).toHaveTextContent('YÜKSEL!');
        rerender(<TowerCountdown value={null} />);
        expect(screen.queryByRole('status')).toBeNull();
    });
});

describe('TowerPauseMenu', () => {
    it('ilk butona odaklanır; anahtarlar ve eylemler', () => {
        const fns = { onResume: vi.fn(), onRestart: vi.fn(), onFinish: vi.fn(), onExit: vi.fn(), onToggleMute: vi.fn(), onToggleMusic: vi.fn() };
        render(<TowerPauseMenu ranked muted={false} musicEnabled={false} {...fns} />);
        expect(screen.getByRole('button', { name: /Devam et/ })).toHaveFocus();
        expect(screen.getByRole('switch', { name: 'Ses' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('switch', { name: 'Müzik' })).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(screen.getByRole('button', { name: /Bitir ve kaydet/ }));
        fireEvent.click(screen.getByRole('switch', { name: 'Müzik' }));
        fireEvent.click(screen.getByRole('button', { name: /Çık/ }));
        expect(fns.onFinish).toHaveBeenCalled();
        expect(fns.onToggleMusic).toHaveBeenCalled();
        expect(fns.onExit).toHaveBeenCalled();
        expect(screen.getByText(/bu kuleyi kaydetmez/)).toBeInTheDocument();
    });
});

describe('TowerResult', () => {
    const RANKED = {
        score: 2400,
        floors: 63,
        perfects: 30,
        max_combo: 14,
        correct_count: 4,
        questions_answered: 5,
        xp_earned: 63,
        coins_earned: 63,
        new_best: false,
        best_score: 3000,
        weekly_rank: 12,
        counted: true,
        badges_earned: [{ key: 'tower_50', name: 'Gökdelen', description: '50 kat', icon: 'building' }],
        questions: [{ index: 0, question: { text: 'Soru A' }, options: ['X', 'Y'], chosen: -1, correct_choice: 1, correct: false }],
    };

    it('dereceli: istatistikler, XP, jeton, rozet ve soru özeti', () => {
        render(
            <MemoryRouter>
                <TowerResult result={RANKED} onAgain={() => {}} onLobby={() => {}} />
            </MemoryRouter>
        );
        expect(screen.getByRole('heading', { name: 'Tam bir gökdelen! 🏙️' })).toHaveFocus();
        expect(screen.getByText('63')).toBeInTheDocument();
        expect(screen.getByText('x14')).toBeInTheDocument();
        expect(screen.getByText('4/5')).toBeInTheDocument();
        expect(screen.getByText('+63 XP')).toBeInTheDocument();
        expect(screen.getByText(/\+63 jeton/)).toBeInTheDocument();
        expect(screen.getByText('Haftalık sıran: #12')).toBeInTheDocument();
        expect(screen.getByText('Gökdelen')).toBeInTheDocument();
        expect(screen.getByText(/12\. kat · Soru A/)).toBeInTheDocument();
        expect(screen.getByText('cevapsız')).toBeInTheDocument();
        expect(screen.queryByTestId('confetti')).toBeNull();
    });

    it('sayılmayan kısa kule notu; jeton gösterilmez', () => {
        render(
            <MemoryRouter>
                <TowerResult result={{ ...RANKED, floors: 3, counted: false, coins_earned: undefined }} onAgain={() => {}} onLobby={() => {}} />
            </MemoryRouter>
        );
        expect(screen.getByText(/5 kattan kısa kuleler/)).toBeInTheDocument();
        expect(screen.queryByText(/jeton/)).toBeNull();
    });

    it('antrenman + misafir: yerel rekor ve giriş çağrısı (gömülü modda geri çağrı)', () => {
        const onLogin = vi.fn();
        render(
            <MemoryRouter>
                <TowerResult result={{ practice: true, score: 300, floors: 15, perfects: 4, max_combo: 3, new_best: false, best_score: 500, best_floor: 22 }} onAgain={() => {}} onLobby={() => {}} guest onLogin={onLogin} />
            </MemoryRouter>
        );
        expect(screen.getByText(/Bu cihazdaki rekorun/)).toHaveTextContent('500 puan · 22 kat');
        fireEvent.click(screen.getByRole('button', { name: /Giriş yap/ }));
        expect(onLogin).toHaveBeenCalled();
        expect(screen.queryByText(/\+\d+ XP/)).toBeNull();
    });

    it('yeni rekorda konfeti; paylaş panoya kopyalar (tek istek)', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const write = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
        render(
            <MemoryRouter>
                <TowerResult result={{ ...RANKED, new_best: true }} onAgain={() => {}} onLobby={() => {}} shareUrl="https://ornek.test/oyun/kule" />
            </MemoryRouter>
        );
        act(() => vi.advanceTimersByTime(400));
        expect(screen.getByTestId('confetti')).toBeInTheDocument();
        const btn = screen.getByRole('button', { name: /Paylaş/ });
        fireEvent.click(btn);
        fireEvent.click(btn);
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sonuç panoya kopyalandı!'));
        expect(write).toHaveBeenCalledTimes(1);
        expect(write.mock.calls[0][0]).toContain('63 katlı kule');
        expect(write.mock.calls[0][0]).toContain('https://ornek.test/oyun/kule');
        vi.useRealTimers();
    });
});
