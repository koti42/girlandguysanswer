// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import BrewPanel from '../BrewPanel.jsx';
import { makeMagicApi } from './magicTestKit.js';

const SIFA = { 0: ['item:cam_şişe', 3], 1: ['item:çilek', 4], 2: ['item:kızıltaş_tozu', 2] };

afterEach(() => {
    vi.useRealTimers();
});

describe('BrewPanel', () => {
    it('tarif defteri: keşfedilenler adıyla, kilitliler "Bilinmeyen tarif" olarak; görülen malzeme sayısı yazılır', () => {
        const api = makeMagicApi({ items: SIFA, discovered: ['sifa'], seen: ['item:tüy'] });
        render(<BrewPanel api={api} onClose={() => {}} />);
        const book = screen.getByTestId('brew-book');
        expect(within(book).getByText('Şifa İksiri')).toBeInTheDocument();
        expect(within(book).getAllByText('Bilinmeyen tarif').length).toBe(9);
        expect(screen.getByTestId('brew-recipe-sifa')).toHaveTextContent('Malzemeler hazır');
        expect(screen.getByTestId('brew-recipe-hiz')).toHaveTextContent(/malzeme görüldü/);
        expect(screen.getByRole('dialog')).toHaveTextContent('1/10 tarif keşfedildi');
    });

    it('keşfedilmiş tarif: malzeme yuvaları (var/gerek), şişe adedi seçimi, Demle api.startBrew çağırır', () => {
        const api = makeMagicApi({ items: SIFA, discovered: ['sifa'] });
        render(<BrewPanel api={api} onClose={() => {}} />);
        const detail = screen.getByTestId('brew-detail');
        expect(detail).toHaveTextContent('Çilek');
        expect(detail).toHaveTextContent('4/2');
        expect(detail).toHaveTextContent('3/3');
        fireEvent.click(screen.getByTestId('brew-bottles-2'));
        expect(screen.getByTestId('brew-bottles-2')).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByTestId('brew-start'));
        expect(api.startBrew).toHaveBeenCalledWith('sifa', 2);
        expect(api._magic.brew.has(api._ui.cauldronPos)).toBe(true);
        expect(api._inv.count('item:cam_şişe')).toBe(1);
        expect(screen.getByTestId('brew-active')).toHaveAttribute('data-state', 'demleniyor');
        expect(screen.getByTestId('brew-progress')).toHaveAttribute('aria-valuenow', '0');
        expect(screen.getByTestId('live').textContent).toMatch(/demlenmeye başladı/);
    });

    it('malzeme ya da şişe eksikse Demle devre dışı ve neden söylenir; şişe adedi eldeki şişeyle sınırlı', () => {
        const api = makeMagicApi({ items: { 0: ['item:cam_şişe', 1], 1: ['item:çilek', 1] }, discovered: ['sifa'] });
        render(<BrewPanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('brew-start')).toBeDisabled();
        expect(screen.getByTestId('brew-detail').textContent).toMatch(/Eksik malzemeler var/);
        expect(screen.getByTestId('brew-bottles-2')).toBeDisabled();
        expect(screen.getByTestId('brew-bottles-3')).toBeDisabled();
        const none = makeMagicApi({ items: { 1: ['item:çilek', 4], 2: ['item:kızıltaş_tozu', 2] }, discovered: ['sifa'] });
        render(<BrewPanel api={none} onClose={() => {}} />);
        expect(screen.getAllByTestId('brew-start')[1]).toBeDisabled();
    });

    it('kilitli tarif seçilince ipucu kartı; Demle yok', () => {
        const api = makeMagicApi({ items: SIFA, discovered: ['sifa'] });
        render(<BrewPanel api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId('brew-recipe-hiz'));
        expect(screen.getByTestId('brew-locked')).toBeInTheDocument();
        expect(screen.queryByTestId('brew-start')).toBeNull();
    });

    it('demleme ilerler: halka yüzdesi, geri sayım; bitince "Hazır" ve Şişeleri al çantaya koyar', () => {
        vi.useFakeTimers();
        const api = makeMagicApi({ items: SIFA, discovered: ['sifa'] });
        render(<BrewPanel api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId('brew-start'));
        act(() => {
            api._magic.brew.tick(15);
            vi.advanceTimersByTime(300);
        });
        expect(screen.getByTestId('brew-progress')).toHaveAttribute('aria-valuenow', '50');
        expect(screen.getByTestId('brew-active')).toHaveTextContent('0:15');
        expect(screen.getByTestId('brew-collect')).toBeDisabled();
        act(() => {
            api._magic.brew.tick(16);
            vi.advanceTimersByTime(300);
        });
        expect(screen.getByTestId('brew-active')).toHaveAttribute('data-state', 'hazir');
        expect(screen.getByTestId('brew-collect')).not.toBeDisabled();
        fireEvent.click(screen.getByTestId('brew-collect'));
        expect(api._inv.count('item:şifa_iksiri')).toBe(3);
        expect(screen.getByTestId('brew-detail')).toBeInTheDocument();
    });

    it('kazan bilgisi yoksa yönerge gösterir; Esc kapatır', () => {
        const onClose = vi.fn();
        const api = makeMagicApi({ items: SIFA });
        api.getBrewInfo.mockReturnValue(null);
        render(<BrewPanel api={api} onClose={onClose} />);
        expect(screen.getByTestId('brew-closed')).toBeInTheDocument();
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(onClose).toHaveBeenCalled();
    });
});
