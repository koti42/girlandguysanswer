// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import BuildPalette from '../BuildPalette.jsx';
import { makeFakeApi } from './panelsTestKit.js';

const PALETTE = [
    { id: 1, key: 'taş', name: 'Taş', category: 'arazi', group: 'taş', item: 'blok:taş' },
    { id: 4, key: 'çimen', name: 'Çimen', category: 'arazi', group: 'doğa', item: 'blok:çimen' },
    { id: 5, key: 'kum', name: 'Kum', category: 'arazi', group: 'doğa', item: 'blok:kum' },
    { id: 62, key: 'cam', name: 'Cam', category: 'yapı', group: 'cam', item: 'blok:cam' },
    { id: 100, key: 'ana_kaya', name: 'Ana Kaya', category: 'sistem', group: 'mekanizma', item: 'blok:ana_kaya' },
    { id: 105, key: 'kol', name: 'Kol', category: 'sistem', group: 'mekanizma', item: 'blok:kol' },
];
const blk = (item) => screen.getByTestId(`block-${item}`);
const slot = (addr) => screen.getByTestId(`slot-${addr}`);

function mk(extra = {}) {
    return makeFakeApi({ creative: true, palette: PALETTE, items: { 0: ['blok:taş', 64], 1: ['blok:toprak', 64] }, ...extra });
}

beforeEach(() => {
    try {
        window.localStorage.clear();
    } catch (_e) { /* yok */ }
});
afterEach(() => {
    vi.useRealTimers();
});

describe('BuildPalette', () => {
    it('kategori sekmeleri, bloklar ve sistem bloklarının gizliliği', () => {
        render(<BuildPalette api={mk()} onClose={() => {}} />);
        expect(screen.getByRole('dialog', { name: 'İnşa paleti' })).toBeInTheDocument();
        const tabs = within(screen.getByRole('tablist', { name: 'Blok kategorileri' })).getAllByRole('tab').map((t) => t.textContent);
        expect(tabs).toEqual(['Tümü', 'Favoriler', 'Son kullanılan', 'Doğa', 'Taş ve Tuğla', 'Cam']);
        expect(screen.getAllByTestId(/^block-/).map((b) => b.getAttribute('data-testid'))).toEqual(
            ['block-blok:taş', 'block-blok:çimen', 'block-blok:kum', 'block-blok:cam'],
        );
        expect(screen.queryByText(/Ana Kaya|Kol|sistem/i)).toBeNull();
    });

    it('sekme ve arama süzer', () => {
        render(<BuildPalette api={mk()} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Doğa' }));
        expect(screen.getAllByTestId(/^block-/)).toHaveLength(2);
        fireEvent.click(screen.getByRole('tab', { name: 'Tümü' }));
        fireEvent.change(screen.getByRole('searchbox', { name: 'Blok ara' }), { target: { value: 'cimen' } });
        expect(screen.getAllByTestId(/^block-/)).toHaveLength(1);
        fireEvent.change(screen.getByRole('searchbox', { name: 'Blok ara' }), { target: { value: 'zzz' } });
        expect(screen.getByTestId('build-empty')).toHaveTextContent('Eşleşen blok yok');
    });

    it('bloğa dokunmak seçili hotbar yuvasına atar', () => {
        const api = mk();
        api._inv.selected = 2;
        render(<BuildPalette api={api} onClose={() => {}} />);
        fireEvent.click(blk('blok:cam'));
        expect(api.setCreativeSlot).toHaveBeenCalledWith(2, 'blok:cam');
        expect(api.selectHotbar).toHaveBeenCalledWith(2);
        expect(slot('s2').getAttribute('aria-label')).toContain('Cam');
        expect(screen.getByTestId('live')).toHaveTextContent('Cam hızlı çubuğun 3. yuvasına konuldu');
    });

    it('önce yuvayı seç, sonra bloğa dokun', () => {
        const api = mk();
        render(<BuildPalette api={api} onClose={() => {}} />);
        fireEvent.click(slot('s5'));
        expect(slot('s5')).toHaveClass('is-selected');
        expect(slot('s5').getAttribute('aria-label')).toContain('hedef yuva');
        fireEvent.click(blk('blok:kum'));
        expect(api.setCreativeSlot).toHaveBeenCalledWith(5, 'blok:kum');
        expect(slot('s5').getAttribute('aria-label')).toContain('Kum');
    });

    it('yuvayı boşalt hedef yuvaya clearSlot çağırır', () => {
        const api = mk();
        render(<BuildPalette api={api} onClose={() => {}} />);
        fireEvent.click(slot('s1'));
        fireEvent.click(screen.getByRole('button', { name: 'Yuvayı boşalt' }));
        expect(api.clearSlot).toHaveBeenCalledWith('s1');
        expect(slot('s1').getAttribute('aria-label')).toContain('boş');
    });

    it('sürükleyerek hotbar yuvasına bırakma', () => {
        const api = mk();
        render(<BuildPalette api={api} onClose={() => {}} />);
        const target = slot('s6');
        const original = document.elementFromPoint;
        document.elementFromPoint = vi.fn(() => target);
        fireEvent.pointerDown(blk('blok:çimen'), { pointerId: 4, clientX: 5, clientY: 5, button: 0, pointerType: 'mouse' });
        fireEvent.pointerMove(window, { pointerId: 4, clientX: 80, clientY: 90 });
        expect(screen.getByTestId('drag-ghost')).toBeInTheDocument();
        fireEvent.pointerUp(window, { pointerId: 4, clientX: 80, clientY: 90 });
        document.elementFromPoint = original;
        expect(api.setCreativeSlot).toHaveBeenCalledWith(6, 'blok:çimen');
        // sürükleme sonrası sahte tıklama ikinci atama yapmaz
        fireEvent.click(blk('blok:çimen'));
        expect(api.setCreativeSlot).toHaveBeenCalledTimes(1);
    });

    it('favori: sağ tık ve düğme; Favoriler sekmesi ve yerel depoya kayıt', () => {
        render(<BuildPalette api={mk()} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Favoriler' }));
        expect(screen.getByTestId('build-empty')).toHaveTextContent('Henüz favori yok');
        fireEvent.click(screen.getByRole('tab', { name: 'Tümü' }));
        fireEvent.contextMenu(blk('blok:cam'));
        expect(blk('blok:cam').getAttribute('aria-label')).toContain('favori');
        fireEvent.mouseEnter(blk('blok:taş'));
        fireEvent.click(screen.getByRole('button', { name: /Favori/ }));
        fireEvent.click(screen.getByRole('tab', { name: 'Favoriler' }));
        expect(screen.getAllByTestId(/^block-/).map((b) => b.getAttribute('data-testid'))).toEqual(['block-blok:taş', 'block-blok:cam']);
        expect(JSON.parse(window.localStorage.getItem('kesif.build.fav'))).toEqual(['blok:cam', 'blok:taş']);
        // favoriden çıkar
        fireEvent.contextMenu(blk('blok:cam'));
        expect(screen.getAllByTestId(/^block-/)).toHaveLength(1);
    });

    it('uzun basma favori yapar ve sahte tıklamayı yutar', () => {
        vi.useFakeTimers();
        const api = mk();
        render(<BuildPalette api={api} onClose={() => {}} />);
        fireEvent.pointerDown(blk('blok:kum'), { pointerId: 9, clientX: 1, clientY: 1, button: 0, pointerType: 'touch' });
        act(() => {
            vi.advanceTimersByTime(520);
        });
        fireEvent.pointerUp(window, { pointerId: 9, clientX: 1, clientY: 1 });
        fireEvent.click(blk('blok:kum'));
        expect(api.setCreativeSlot).not.toHaveBeenCalled();
        expect(blk('blok:kum').getAttribute('aria-label')).toContain('favori');
    });

    it('son kullanılanlar atamadan sonra dolar; kayıtlı tercihler açılışta okunur', () => {
        const api = mk();
        const { unmount } = render(<BuildPalette api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Son kullanılan' }));
        expect(screen.getByTestId('build-empty')).toHaveTextContent('Henüz blok seçmedin');
        fireEvent.click(screen.getByRole('tab', { name: 'Tümü' }));
        fireEvent.click(blk('blok:cam'));
        fireEvent.click(blk('blok:kum'));
        fireEvent.click(screen.getByRole('tab', { name: 'Son kullanılan' }));
        expect(screen.getAllByTestId(/^block-/).map((b) => b.getAttribute('data-testid'))).toEqual(['block-blok:kum', 'block-blok:cam']);
        unmount();
        render(<BuildPalette api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Son kullanılan' }));
        expect(screen.getAllByTestId(/^block-/)).toHaveLength(2);
    });

    it('depolama kapalıyken çökmez', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('engelli');
        });
        const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('engelli');
        });
        render(<BuildPalette api={mk()} onClose={() => {}} />);
        fireEvent.contextMenu(blk('blok:cam'));
        expect(blk('blok:cam').getAttribute('aria-label')).toContain('favori');
        spy.mockRestore();
        spy2.mockRestore();
    });

    it('klavye: oklarla gezinme ve F ile favori; Esc kapatır', () => {
        const onClose = vi.fn();
        render(<BuildPalette api={mk()} onClose={onClose} />);
        blk('blok:taş').focus();
        fireEvent.keyDown(blk('blok:taş'), { key: 'ArrowRight' });
        expect(document.activeElement).toBe(blk('blok:çimen'));
        fireEvent.keyDown(blk('blok:çimen'), { key: 'f' });
        expect(blk('blok:çimen').getAttribute('aria-label')).toContain('favori');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('palet okunamazsa boş durum gösterir', () => {
        const api = mk();
        api.getBuildPalette.mockImplementation(() => {
            throw new Error('x');
        });
        render(<BuildPalette api={api} onClose={() => {}} />);
        expect(screen.getByTestId('build-empty')).toBeInTheDocument();
    });
});
