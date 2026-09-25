// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmDialog from './ConfirmDialog';
import ReasonDialog from './ReasonDialog';

describe('ConfirmDialog', () => {
    it('kapalıyken hiçbir şey çizmez', () => {
        render(<ConfirmDialog open={false} title="x" message="y" onClose={() => {}} onConfirm={() => {}} />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('onay metni yazılmadan onaylanamaz', () => {
        const onConfirm = vi.fn();
        render(<ConfirmDialog open title="Sil" message="Emin misin?" confirmText="ahmet" onClose={() => {}} onConfirm={onConfirm} />);
        const btn = screen.getByTestId('confirm-button');
        expect(btn).toBeDisabled();
        fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'ahme' } });
        expect(btn).toBeDisabled();
        fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'ahmet' } });
        expect(btn).toBeEnabled();
        fireEvent.click(btn);
        expect(onConfirm).toHaveBeenCalledOnce();
    });

    it('ESC kapatır', () => {
        const onClose = vi.fn();
        render(<ConfirmDialog open title="x" message="y" onClose={onClose} onConfirm={() => {}} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});

describe('ReasonDialog', () => {
    it('sebep 3 karakterden kısaysa gönderilemez', () => {
        const onSubmit = vi.fn();
        render(<ReasonDialog open title="Gizle" onClose={() => {}} onSubmit={onSubmit} />);
        const btn = screen.getByTestId('reason-submit');
        expect(btn).toBeDisabled();
        fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'ab' } });
        expect(btn).toBeDisabled();
        fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'Spam' } });
        expect(btn).toBeEnabled();
    });

    it('hızlı sebep düğmesi metni doldurur ve süre ön ayarıyla gönderir', () => {
        const onSubmit = vi.fn();
        render(<ReasonDialog open title="Banla" withDuration onClose={() => {}} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByText('Spam / reklam'));
        expect(screen.getByTestId('reason-input')).toHaveValue('Spam / reklam');
        fireEvent.click(screen.getByText('1 hafta'));
        fireEvent.click(screen.getByTestId('reason-submit'));
        expect(onSubmit).toHaveBeenCalledWith({ reason: 'Spam / reklam', minutes: 10080 });
    });

    it('süre kapalıyken minutes null gönderir', () => {
        const onSubmit = vi.fn();
        render(<ReasonDialog open title="Uyar" onClose={() => {}} onSubmit={onSubmit} />);
        fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'Dil kullanımı' } });
        fireEvent.click(screen.getByTestId('reason-submit'));
        expect(onSubmit).toHaveBeenCalledWith({ reason: 'Dil kullanımı', minutes: null });
    });
});
