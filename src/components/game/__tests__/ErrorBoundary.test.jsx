// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import { isChunkLoadError, reloadOnceForChunkError } from '../chunkReload';

const Boom = ({ error }) => {
    throw error;
};

describe('ErrorBoundary', () => {
    let reload;
    let consoleError;

    beforeEach(() => {
        sessionStorage.clear();
        reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true, writable: true });
        // React ve sınır hatayı konsola yazar; test çıktısı kirlenmesin.
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it('çocuk bileşen hata fırlatınca beyaz ekran yerine yedek ekranı gösterir', () => {
        render(
            <ErrorBoundary>
                <Boom error={new Error('beklenmedik rozet')} />
            </ErrorBoundary>
        );
        expect(screen.getByRole('heading', { name: 'Bir şeyler ters gitti' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ana sayfaya dön' })).toHaveAttribute('href', '/');
        fireEvent.click(screen.getByRole('button', { name: 'Sayfayı yenile' }));
        expect(reload).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalled();
    });

    it('lobi bağlantısı verilebilir; resetKey değişince hata durumu sıfırlanır', () => {
        const { rerender } = render(
            <ErrorBoundary resetKey="/oyun/kosu/oyna" homeHref="/oyun/kosu" homeLabel="Lobiye dön">
                <Boom error={new Error('x')} />
            </ErrorBoundary>
        );
        expect(screen.getByRole('link', { name: 'Lobiye dön' })).toHaveAttribute('href', '/oyun/kosu');
        rerender(
            <ErrorBoundary resetKey="/oyun" homeHref="/oyun/kosu">
                <p>Hub</p>
            </ErrorBoundary>
        );
        expect(screen.getByText('Hub')).toBeInTheDocument();
        expect(screen.queryByText('Bir şeyler ters gitti')).toBeNull();
    });

    it('parça yükleme hatasında sayfayı bir kez yeniler; 10 sn içinde ikinci kez yenilemez', () => {
        const chunkErr = new TypeError('Failed to fetch dynamically imported module: https://x/assets/RunnerPlayPage-abc.js');
        expect(isChunkLoadError(chunkErr)).toBe(true);
        expect(isChunkLoadError(new Error('başka hata'))).toBe(false);
        const { unmount } = render(
            <ErrorBoundary>
                <Boom error={chunkErr} />
            </ErrorBoundary>
        );
        expect(reload).toHaveBeenCalledTimes(1);
        unmount();
        render(
            <ErrorBoundary>
                <Boom error={chunkErr} />
            </ErrorBoundary>
        );
        expect(reload).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('heading', { name: 'Bir şeyler ters gitti' })).toBeInTheDocument();
        expect(reloadOnceForChunkError()).toBe(false);
    });
});
