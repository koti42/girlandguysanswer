// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from './useToast';

const Pusher = () => {
    const toast = useToast();
    return (
        <>
            <button type="button" onClick={() => toast.success('Kaydedildi')}>başarı</button>
            <button type="button" onClick={() => toast.error('Olmadı')}>hata</button>
        </>
    );
};

const mount = () => render(<ToastProvider><Pusher /></ToastProvider>);

describe('ToastProvider', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('bildirimi süresi dolunca kaldırır (başarı 4 sn, hata 6 sn)', () => {
        mount();
        fireEvent.click(screen.getByRole('button', { name: 'başarı' }));
        fireEvent.click(screen.getByRole('button', { name: 'hata' }));
        expect(screen.getByText('Kaydedildi')).toBeInTheDocument();
        expect(screen.getByText('Olmadı')).toBeInTheDocument();

        act(() => vi.advanceTimersByTime(4000));
        expect(screen.queryByText('Kaydedildi')).toBeNull();
        expect(screen.getByText('Olmadı')).toBeInTheDocument();

        act(() => vi.advanceTimersByTime(2000));
        expect(screen.queryByText('Olmadı')).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('sökülünce bekleyen tüm kapanış zamanlayıcılarını temizler', () => {
        const view = mount();
        fireEvent.click(screen.getByRole('button', { name: 'başarı' }));
        fireEvent.click(screen.getByRole('button', { name: 'hata' }));
        expect(vi.getTimerCount()).toBe(2);

        view.unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('sağlayıcı dışında kullanılırsa açıklayıcı hata verir', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<Pusher />)).toThrow('ToastProvider içinde');
        spy.mockRestore();
    });
});
