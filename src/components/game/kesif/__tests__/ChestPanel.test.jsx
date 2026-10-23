// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import ChestPanel from '../ChestPanel.jsx';
import { makeFakeApi } from './panelsTestKit.js';

const slot = (addr) => screen.getByTestId(`slot-${addr}`);
const label = (addr) => slot(addr).getAttribute('aria-label');

afterEach(() => {
    vi.useRealTimers();
});

describe('ChestPanel', () => {
    it('27 sandık + 36 envanter yuvası', () => {
        const api = makeFakeApi({ chest: { 0: ['blok:kum', 10] }, items: { 0: ['blok:taş', 3] } });
        render(<ChestPanel api={api} onClose={() => {}} />);
        const dlg = screen.getByRole('dialog', { name: 'Sandık' });
        expect(dlg.querySelectorAll('[data-slot-addr^="c"]').length).toBe(27);
        expect(dlg.querySelectorAll('[data-slot-addr^="s"]').length).toBe(36);
        expect(label('c0')).toBe('Sandık yuvası 1: Kum ×10');
        expect(screen.getByText(/Konum 3, 64, -8/)).toBeInTheDocument();
    });

    it('açık sandık yoksa bilgi gösterir', () => {
        const api = makeFakeApi({});
        render(<ChestPanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('chest-closed')).toBeInTheDocument();
        expect(screen.queryByTestId('slot-c0')).toBeNull();
    });

    it('envanterden sandığa dokun-seç-dokun aktarım', () => {
        const api = makeFakeApi({ chest: {}, items: { 9: ['blok:taş', 5] } });
        render(<ChestPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s9'));
        fireEvent.click(slot('c4'));
        expect(api.moveStack).toHaveBeenCalledWith('s9', 'c4', { half: false });
        expect(label('c4')).toBe('Sandık yuvası 5: Taş ×5');
        expect(label('s9')).toContain('boş');
    });

    it('sandıktan envantere aktarım ve aynı eşyayı birleştirme', () => {
        const api = makeFakeApi({ chest: { 2: ['blok:taş', 8] }, items: { 9: ['blok:taş', 10] } });
        render(<ChestPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('c2'));
        fireEvent.click(slot('s9'));
        expect(label('s9')).toContain('Taş ×18');
        expect(label('c2')).toContain('boş');
    });

    it('Shift+tık hızlı aktarım: envanter → sandık, sandık → envanter', () => {
        const api = makeFakeApi({ chest: { 0: ['blok:taş', 60] }, items: { 9: ['blok:taş', 3] } });
        render(<ChestPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s9'), { shiftKey: true });
        expect(api.moveStack).toHaveBeenLastCalledWith('s9', 'c0', { half: false });
        expect(label('c0')).toContain('Taş ×63');
        fireEvent.click(slot('c0'), { shiftKey: true });
        expect(api.moveStack).toHaveBeenLastCalledWith('c0', 's9', { half: false });
        expect(label('s9')).toContain('Taş ×63');
    });

    it('çift dokunma ve Aktar düğmesi', () => {
        const api = makeFakeApi({ chest: {}, items: { 9: ['blok:taş', 3], 10: ['blok:kum', 4] } });
        render(<ChestPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s9'));
        fireEvent.click(slot('s9'));
        expect(label('c0')).toContain('Taş ×3');
        fireEvent.click(slot('s10'));
        fireEvent.click(screen.getByRole('button', { name: 'Aktar' }));
        expect(label('c1')).toContain('Kum ×4');
    });

    it('yarısını sandığa koy (sağ tık)', () => {
        const api = makeFakeApi({ chest: {}, items: { 9: ['blok:taş', 9] } });
        render(<ChestPanel api={api} onClose={() => {}} />);
        fireEvent.contextMenu(slot('s9'));
        fireEvent.click(slot('c10'));
        expect(api.moveStack).toHaveBeenCalledWith('s9', 'c10', { half: true });
        expect(label('c10')).toContain('×4');
        expect(label('s9')).toContain('×5');
    });

    it('Hepsini koy: çantadaki her şey sandığa, hızlı çubuk yerinde kalır', () => {
        const api = makeFakeApi({
            chest: { 0: ['blok:taş', 60] },
            items: { 0: ['blok:taş', 5], 9: ['blok:taş', 10], 10: ['blok:kum', 3], 20: ['item:elma', 2] },
        });
        render(<ChestPanel api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Hepsini koy' }));
        expect(label('s0')).toContain('Taş ×5');
        expect(label('s9')).toContain('boş');
        expect(label('s10')).toContain('boş');
        expect(label('s20')).toContain('boş');
        expect(label('c0')).toContain('Taş ×64');
        const names = [1, 2, 3].map((i) => label('c' + i));
        expect(names.join('|')).toMatch(/Taş ×6/);
        expect(names.join('|')).toMatch(/Kum ×3/);
        expect(names.join('|')).toMatch(/Elma ×2/);
        expect(screen.getByTestId('live')).toHaveTextContent('Çanta sandığa konuldu');
    });

    it('Hepsini al: sandık boşalır; yer yoksa kalanı bırakır ve uyarır', () => {
        const api = makeFakeApi({ chest: { 0: ['blok:taş', 10], 1: ['blok:kum', 4] }, items: {} });
        render(<ChestPanel api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Hepsini al' }));
        expect(label('c0')).toContain('boş');
        expect(label('c1')).toContain('boş');
        expect(api._inv.count('blok:taş')).toBe(10);
        expect(api._inv.count('blok:kum')).toBe(4);
        expect(screen.getByTestId('live')).toHaveTextContent('Sandıktakiler çantaya alındı');
    });

    it('Hepsini al: çanta doluysa hiçbir şey taşınmaz ve duyurulur', () => {
        const items = {};
        for (let i = 0; i < 36; i++) items[i] = ['blok:toprak', 64];
        const api = makeFakeApi({ chest: { 0: ['blok:taş', 10] }, items });
        render(<ChestPanel api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Hepsini al' }));
        expect(label('c0')).toContain('Taş ×10');
        expect(screen.getByTestId('live')).toHaveTextContent('yer yok');
    });

    it('version ile sandık içeriği yeniden okunur; Esc kapatır', () => {
        const onClose = vi.fn();
        const api = makeFakeApi({ chest: {}, items: {} });
        const { rerender } = render(<ChestPanel api={api} onClose={onClose} version={0} />);
        api._chest().slots[5] = { item: 'blok:kum', count: 2 };
        rerender(<ChestPanel api={api} onClose={onClose} version={1} />);
        expect(label('c5')).toContain('Kum ×2');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
