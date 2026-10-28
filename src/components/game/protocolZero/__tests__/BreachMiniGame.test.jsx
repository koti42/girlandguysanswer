// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BreachMiniGame from '../BreachMiniGame';

describe('BreachMiniGame', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb((now += 16)), 16));
        vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('kapalıyken hiçbir şey çizmez', () => {
        const { container } = render(<BreachMiniGame open={false} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('bozuk hücreler yakalanınca başarıyla biter ve onDone(true) çağrılır', () => {
        const onDone = vi.fn();
        const onSound = vi.fn();
        render(<BreachMiniGame open nodeName="İstanbul" seconds={12} targets={3} seed={7} onDone={onDone} onSound={onSound} />);
        expect(screen.getByRole('dialog', { name: /İstanbul/ })).toBeInTheDocument();
        expect(screen.getAllByRole('gridcell')).toHaveLength(25);

        for (let i = 0; i < 3; i++) {
            const bad = document.querySelector('[data-bad="1"]');
            expect(bad).not.toBeNull();
            fireEvent.pointerDown(bad);
        }
        expect(screen.getByRole('status')).toHaveTextContent(/püskürtüldü/);
        expect(onSound).toHaveBeenCalledWith('hit');
        expect(onSound).toHaveBeenCalledWith('success');
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(onDone).toHaveBeenCalledWith(true);
    });

    it('üç yanlış dokunuş başarısızlık, onDone(false)', () => {
        const onDone = vi.fn();
        render(<BreachMiniGame open nodeName="Tokyo" seconds={12} targets={8} seed={3} onDone={onDone} />);
        for (let i = 0; i < 3; i++) {
            const good = document.querySelector('[data-bad="0"]');
            fireEvent.pointerDown(good);
        }
        expect(screen.getByRole('status')).toHaveTextContent(/başarısız/);
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(onDone).toHaveBeenCalledWith(false);
    });

    it('süre bitince başarısız olur', () => {
        const onDone = vi.fn();
        render(<BreachMiniGame open nodeName="Londra" seconds={2} targets={50} seed={5} onDone={onDone} />);
        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(onDone).toHaveBeenCalledWith(false);
    });
});
