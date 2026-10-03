// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-confetti', () => ({ default: () => <div data-testid="confetti" /> }));
vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});

import RunnerResult from '../runner/RunnerResult';
import TowerResult from '../tower/TowerResult';
import ResultReviewNote from '../ResultReviewNote';
import { isUnderReview } from '../resultReview';
import useResultGuard, { RESULT_GUARD_MS, setResultGuardDefault } from '../useResultGuard';

const matchMedia = (reduced) => {
    window.matchMedia = vi.fn((q) => ({ matches: reduced && q.includes('reduce'), addListener() {}, removeListener() {} }));
};

const RUN = { score: 1200, distance_m: 640, coins: 30, coins_earned: 30, wallet: { balance: 500 }, xp_earned: 12, counted: true, gates: [] };
const TOWER = { score: 900, floors: 22, perfects: 4, max_combo: 3, correct_count: 1, questions_answered: 1, coins_earned: 22, wallet: { balance: 90 }, counted: true };

const advance = (ms) =>
    act(() => {
        vi.advanceTimersByTime(ms);
    });

describe('Sonuç ekranı dokunuş koruması (600 ms)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setResultGuardDefault(RESULT_GUARD_MS);
        matchMedia(true);
    });
    afterEach(() => {
        setResultGuardDefault(0);
        vi.useRealTimers();
    });

    it('koşu: ilk 600 ms Tekrar Koş / Lobiye dön / Mağazaya git tıklanmaz, sonra çalışır', () => {
        const onAgain = vi.fn();
        const onLobby = vi.fn();
        const onShop = vi.fn();
        const { container } = render(<RunnerResult result={RUN} onAgain={onAgain} onLobby={onLobby} onShop={onShop} share={false} />);
        const root = container.firstChild;
        expect(root).toHaveAttribute('data-result-guard', 'on');

        const again = screen.getByRole('button', { name: /Tekrar Koş/ });
        const lobby = screen.getByRole('button', { name: /Lobiye dön/ });
        const shop = screen.getByRole('button', { name: /Mağazaya git/ });
        fireEvent.click(again);
        fireEvent.click(lobby);
        fireEvent.click(shop);
        advance(RESULT_GUARD_MS - 1);
        fireEvent.click(again);
        expect(onAgain).not.toHaveBeenCalled();
        expect(onLobby).not.toHaveBeenCalled();
        expect(onShop).not.toHaveBeenCalled();
        expect(root).toHaveAttribute('data-result-guard', 'on');

        advance(1);
        expect(root).toHaveAttribute('data-result-guard', 'off');
        fireEvent.click(again);
        fireEvent.click(lobby);
        fireEvent.click(shop);
        expect(onAgain).toHaveBeenCalledTimes(1);
        expect(onLobby).toHaveBeenCalledTimes(1);
        expect(onShop).toHaveBeenCalledTimes(1);
    });

    it('kule: koruma sürerken "Mağazaya git" bağlantısı gezinmez; süre dolunca gezinir', () => {
        const onAgain = vi.fn();
        render(
            <MemoryRouter initialEntries={['/oyun/kule/oyna']}>
                <Routes>
                    <Route path="/oyun/kule/oyna" element={<TowerResult result={TOWER} onAgain={onAgain} onLobby={() => {}} share={false} />} />
                    <Route path="/oyun/magaza" element={<p>Mağaza sayfası</p>} />
                </Routes>
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole('link', { name: /Mağazaya git/ }));
        fireEvent.click(screen.getByRole('button', { name: /Tekrar Oyna/ }));
        expect(screen.queryByText('Mağaza sayfası')).toBeNull();
        expect(onAgain).not.toHaveBeenCalled();

        advance(RESULT_GUARD_MS);
        fireEvent.click(screen.getByRole('button', { name: /Tekrar Oyna/ }));
        expect(onAgain).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('link', { name: /Mağazaya git/ }));
        expect(screen.getByText('Mağaza sayfası')).toBeInTheDocument();
    });

    it('kule (gömme): misafir giriş düğmesi de korunur', () => {
        const onLogin = vi.fn();
        render(<TowerResult result={{ ...TOWER, practice: true, best_score: 900, best_floor: 22 }} guest onLogin={onLogin} onAgain={() => {}} onLobby={() => {}} share={false} />);
        const login = screen.getByRole('button', { name: /Giriş yap/ });
        fireEvent.click(login);
        expect(onLogin).not.toHaveBeenCalled();
        advance(RESULT_GUARD_MS);
        fireEvent.click(login);
        expect(onLogin).toHaveBeenCalledTimes(1);
    });

    it('azaltılmış harekette görsel geçiş yok ama koruma aynen sürer', () => {
        matchMedia(true);
        const onAgain = vi.fn();
        const { container } = render(<RunnerResult result={RUN} onAgain={onAgain} onLobby={() => {}} onShop={() => {}} share={false} />);
        fireEvent.click(screen.getByRole('button', { name: /Tekrar Koş/ }));
        expect(onAgain).not.toHaveBeenCalled();
        expect(container.firstChild).toHaveAttribute('data-result-guard', 'on');
        advance(RESULT_GUARD_MS);
        fireEvent.click(screen.getByRole('button', { name: /Tekrar Koş/ }));
        expect(onAgain).toHaveBeenCalledTimes(1);
    });

    it('hareketli modda da aynı; klavyeden gelen tıklama (detail 0) da korunur', () => {
        matchMedia(false);
        const onAgain = vi.fn();
        render(<RunnerResult result={RUN} onAgain={onAgain} onLobby={() => {}} onShop={() => {}} share={false} />);
        const again = screen.getByRole('button', { name: /Tekrar Koş/ });
        again.focus();
        fireEvent.click(again, { detail: 0 });
        expect(onAgain).not.toHaveBeenCalled();
        advance(RESULT_GUARD_MS);
        fireEvent.click(again, { detail: 0 });
        expect(onAgain).toHaveBeenCalledTimes(1);
    });

    it('hook: sökülünce zamanlayıcı temizlenir; süre 0 ise koruma hiç yok', () => {
        const { result, unmount } = renderHook(() => useResultGuard());
        expect(result.current.guarded).toBe(true);
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);

        const off = renderHook(() => useResultGuard(0));
        expect(off.result.current.guarded).toBe(false);
        expect(off.result.current.guardProps['data-result-guard']).toBe('off');
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('Şüpheli oyun bilgi şeridi (flagged / review)', () => {
    beforeEach(() => matchMedia(true));

    it('isUnderReview: yalnızca sunucu işaretlediyse true', () => {
        expect(isUnderReview(null)).toBe(false);
        expect(isUnderReview({})).toBe(false);
        expect(isUnderReview({ flagged: false, review: null })).toBe(false);
        expect(isUnderReview({ flagged: true })).toBe(true);
        expect(isUnderReview({ review: true })).toBe(true);
        expect(isUnderReview({ review: 'pending' })).toBe(true);
        expect(isUnderReview({ review: '' })).toBe(false);
        expect(isUnderReview({ review: 'cleared' })).toBe(false);
        expect(isUnderReview({ review: { status: 'pending' } })).toBe(true);
        expect(isUnderReview({ review: { status: 'cleared' } })).toBe(false);
        expect(isUnderReview({ review: false })).toBe(false);
    });

    it('alan yoksa hiçbir şey çizilmez', () => {
        const { container } = render(<ResultReviewNote result={{ score: 1 }} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('koşu sonucu: flagged → nazik şerit; sunucu metni basılmaz', () => {
        render(<RunnerResult result={{ ...RUN, flagged: true, review: { status: 'pending', message: '<b>hile</b>' } }} onAgain={() => {}} onLobby={() => {}} onShop={() => {}} share={false} />);
        const note = screen.getByTestId('result-review-note');
        expect(note).toHaveAttribute('role', 'note');
        expect(note).toHaveTextContent('kısa bir incelemeye alındı');
        // Sunucu işaretli oyuna ödül vermez; şerit "bekleyebilir" diye yanlış umut vermez.
        expect(note).toHaveTextContent('jeton ve sıralama puanı verilmedi');
        expect(note).not.toHaveTextContent('bekleyebilir');
        expect(note).not.toHaveTextContent('hile');
    });

    it('kule sonucu: review → şerit; işaretsiz sonuçta şerit yok', () => {
        const { rerender } = render(<TowerResult result={{ ...TOWER, review: 'pending' }} onAgain={() => {}} onLobby={() => {}} onShop={() => {}} share={false} />);
        expect(screen.getByTestId('result-review-note')).toBeInTheDocument();
        rerender(<TowerResult result={TOWER} onAgain={() => {}} onLobby={() => {}} onShop={() => {}} share={false} />);
        expect(screen.queryByTestId('result-review-note')).toBeNull();
    });
});
