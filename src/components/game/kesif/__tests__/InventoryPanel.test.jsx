// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import InventoryPanel from '../InventoryPanel.jsx';
import { makeFakeApi } from './panelsTestKit.js';
import { TOUCH_DRAG_HOLD_MS } from '../panelHooks.js';

const slot = (addr) => screen.getByTestId(`slot-${addr}`);
const label = (addr) => slot(addr).getAttribute('aria-label');

afterEach(() => {
    vi.useRealTimers();
});

describe('InventoryPanel', () => {
    it('36 yuva + 4 zırh yuvası, hotbar numaraları ve elde tutulan vurgusu', () => {
        const api = makeFakeApi({ items: { 0: ['blok:taş', 12], 3: ['item:kazma_demir', 1] } });
        api._inv.selected = 3;
        render(<InventoryPanel api={api} onClose={() => {}} />);
        const dlg = screen.getByRole('dialog', { name: 'Envanter' });
        expect(dlg).toBeInTheDocument();
        expect(dlg.querySelectorAll('[data-slot-addr^="s"]').length).toBe(36);
        expect(dlg.querySelectorAll('[data-slot-addr^="a"]').length).toBe(4);
        expect(label('s0')).toBe('Hızlı çubuk 1: Taş ×12');
        expect(label('s9')).toBe('Çanta yuvası 1: boş');
        expect(label('a0')).toBe('Kafa zırhı: boş');
        expect(slot('s3')).toHaveClass('is-active');
        expect(slot('s0')).not.toHaveClass('is-active');
        // hotbar satırı çantadan ayrı grupta
        expect(within(dlg).getByRole('group', { name: 'Hızlı çubuk' }).querySelectorAll('button').length).toBe(9);
        expect(within(dlg).getByRole('group', { name: 'Çanta' }).querySelectorAll('button').length).toBe(27);
    });

    it('dokun-seç-dokun: eşyayı boş yuvaya taşır', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 5] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s9'));
        expect(slot('s9')).toHaveClass('is-selected');
        expect(slot('s9')).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(slot('s20'));
        expect(api.moveStack).toHaveBeenCalledWith('s9', 's20', { half: false });
        expect(label('s20')).toBe('Çanta yuvası 12: Taş ×5');
        expect(label('s9')).toContain('boş');
        expect(slot('s20')).not.toHaveClass('is-selected');
    });

    it('aynı yuvaya tekrar dokunmak seçimi kaldırır; boş yuva seçilmez', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 5] } });
        vi.useFakeTimers();
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s12'));
        expect(slot('s12')).not.toHaveClass('is-selected');
        fireEvent.click(slot('s9'));
        act(() => {
            vi.advanceTimersByTime(500);
        });
        fireEvent.click(slot('s9'));
        expect(slot('s9')).not.toHaveClass('is-selected');
        expect(api.moveStack).not.toHaveBeenCalled();
    });

    it('aynı eşyayı birleştirir (yığınlar)', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 5], 10: ['blok:taş', 20] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s9'));
        fireEvent.click(slot('s10'));
        expect(label('s10')).toBe('Çanta yuvası 2: Taş ×25');
        expect(label('s9')).toContain('boş');
    });

    it('yarıya böl: sağ tık seçer, hedefe dokununca yarısı taşınır', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 11] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.contextMenu(slot('s9'));
        expect(screen.getByTestId('live')).toHaveTextContent('yarısı seçildi');
        fireEvent.click(slot('s15'));
        expect(api.moveStack).toHaveBeenCalledWith('s9', 's15', { half: true });
        expect(label('s15')).toContain('×5');
        expect(label('s9')).toContain('×6');
    });

    it('yarıya böl: uzun basma (460 ms) yarıyı seçer ve sonraki sahte tıklamayı yutar', () => {
        vi.useFakeTimers();
        const api = makeFakeApi({ items: { 9: ['blok:taş', 8] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.pointerDown(slot('s9'), { pointerId: 1, clientX: 10, clientY: 10, button: 0, pointerType: 'touch' });
        act(() => {
            vi.advanceTimersByTime(500);
        });
        fireEvent.pointerUp(window, { pointerId: 1, clientX: 10, clientY: 10 });
        fireEvent.click(slot('s9')); // uzun basmanın ardından gelen tıklama
        expect(slot('s9')).toHaveClass('is-selected');
        expect(screen.getByRole('button', { name: 'Tamamını al' })).toBeInTheDocument();
        fireEvent.click(slot('s18'));
        expect(api.moveStack).toHaveBeenCalledWith('s9', 's18', { half: true });
    });

    it('eylem çubuğu: Yarısını al düğmesi seçimi yarıya çevirir', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 10] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s9'));
        fireEvent.click(screen.getByRole('button', { name: 'Yarısını al' }));
        fireEvent.click(slot('s11'));
        expect(api.moveStack).toHaveBeenCalledWith('s9', 's11', { half: true });
    });

    it('zırh: doğru yuvaya dokununca kuşanır', () => {
        const api = makeFakeApi({ items: { 12: ['item:miğfer_demir', 1] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s12'));
        fireEvent.click(slot('a0'));
        expect(api.equipArmor).toHaveBeenCalledWith('s12');
        expect(label('a0')).toContain('Demir Miğfer');
        expect(label('s12')).toContain('boş');
        expect(screen.getByTestId('defense')).toHaveTextContent('Savunma 2');
    });

    it('zırh: yanlış yuvaya takılmaz ve duyurulur', () => {
        const api = makeFakeApi({ items: { 12: ['item:miğfer_demir', 1] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s12'));
        fireEvent.click(slot('a1'));
        expect(api.equipArmor).not.toHaveBeenCalled();
        expect(screen.getByTestId('live')).toHaveTextContent('takılamaz');
        expect(label('a1')).toContain('boş');
    });

    it('eylem çubuğundan Kuşan, sonra Çıkar', () => {
        const api = makeFakeApi({ items: { 12: ['item:çizme_demir', 1] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s12'));
        fireEvent.click(screen.getByRole('button', { name: 'Kuşan' }));
        expect(api.equipArmor).toHaveBeenCalledWith('s12');
        expect(label('a3')).toContain('Demir Çizme');
        fireEvent.click(slot('a3'));
        fireEvent.click(screen.getByRole('button', { name: 'Çıkar' }));
        expect(api.unequipArmor).toHaveBeenCalledWith(3);
        expect(label('a3')).toContain('boş');
    });

    it('zırhı çantaya dokunarak çıkarma', () => {
        const api = makeFakeApi({ armor: { 0: ['item:miğfer_demir', 1] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('a0'));
        fireEvent.click(slot('s14'));
        expect(label('a0')).toContain('boş');
        expect(label('s14')).toContain('Demir Miğfer');
    });

    it('Shift+tık hızlı taşır: hotbar → çanta', () => {
        const api = makeFakeApi({ items: { 0: ['blok:taş', 4] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s0'), { shiftKey: true });
        expect(api.moveStack).toHaveBeenCalledWith('s0', 's9', { half: false });
        expect(label('s9')).toContain('Taş ×4');
    });

    it('çift dokunma hızlı taşır', () => {
        const api = makeFakeApi({ items: { 20: ['blok:taş', 4] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s20'));
        fireEvent.click(slot('s20'));
        expect(api.moveStack).toHaveBeenCalledWith('s20', 's0', { half: false });
        expect(slot('s20')).not.toHaveClass('is-selected');
    });

    it('yere bırak bölgesi: seçili yığının tamamını bırakır; seçim yoksa uyarır', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 7] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /Yere bırak/ }));
        expect(api.dropSlot).not.toHaveBeenCalled();
        expect(screen.getByTestId('live')).toHaveTextContent('önce bir eşya seç');
        fireEvent.click(slot('s9'));
        fireEvent.click(screen.getByRole('button', { name: /Yere bırak/ }));
        expect(api.dropSlot).toHaveBeenCalledWith('s9', 7);
        expect(label('s9')).toContain('boş');
    });

    it('1 tane bırak', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 7] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s9'));
        fireEvent.click(screen.getByRole('button', { name: '1 tane bırak' }));
        expect(api.dropSlot).toHaveBeenCalledWith('s9', 1);
        expect(label('s9')).toContain('×6');
    });

    it('yiyecek: Ye düğmesi useSlot çağırır; hotbar: Elime al', () => {
        const api = makeFakeApi({ items: { 2: ['item:elma', 3] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.click(slot('s2'));
        fireEvent.click(screen.getByRole('button', { name: 'Elime al' }));
        expect(api.selectHotbar).toHaveBeenCalledWith(2);
        expect(slot('s2')).toHaveClass('is-active');
        fireEvent.click(slot('s2'));
        fireEvent.click(screen.getByRole('button', { name: 'Ye' }));
        expect(api.useSlot).toHaveBeenCalledWith('s2');
    });

    it('eşya ipucu: ad, nadirlik, özellikler ve dayanıklılık', () => {
        const api = makeFakeApi({ items: { 9: ['item:kazma_demir', 1] } });
        api._inv.slots[9].dur = 100;
        render(<InventoryPanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('item-info')).toHaveTextContent('Bir eşyayı incelemek');
        fireEvent.mouseEnter(slot('s9'));
        const info = screen.getByTestId('item-info');
        expect(info).toHaveTextContent('Demir Kazma');
        expect(info).toHaveTextContent('Yaygın');
        expect(info).toHaveTextContent('Hasar');
        expect(info).toHaveTextContent('Dayanıklılık 100/250');
        expect(within(info).getByRole('progressbar', { name: 'Dayanıklılık' })).toHaveAttribute('aria-valuenow', '100');
        fireEvent.mouseLeave(slot('s9'));
    });

    it('klavye: ok tuşları yuvalar arasında gezinir (tek tab durağı), Q bırakır, H yarı seçer', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 6] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        // açılışta elde tutulan hotbar yuvası odaklanır (tek tab durağı oradadır)
        expect(document.activeElement).toBe(slot('s0'));
        expect(slot('s0')).toHaveAttribute('tabindex', '0');
        expect(slot('s9')).toHaveAttribute('tabindex', '-1');
        act(() => slot('s9').focus());
        expect(slot('s9')).toHaveAttribute('tabindex', '0');
        expect(slot('s0')).toHaveAttribute('tabindex', '-1');
        fireEvent.keyDown(slot('s9'), { key: 'ArrowRight' });
        expect(document.activeElement).toBe(slot('s10'));
        expect(slot('s10')).toHaveAttribute('tabindex', '0');
        fireEvent.keyDown(slot('s10'), { key: 'ArrowDown' });
        expect(document.activeElement).toBe(slot('s19'));
        fireEvent.keyDown(slot('s19'), { key: 'ArrowLeft' });
        fireEvent.keyDown(slot('s18'), { key: 'ArrowLeft' });
        slot('s9').focus();
        fireEvent.keyDown(slot('s9'), { key: 'q' });
        expect(api.dropSlot).toHaveBeenCalledWith('s9', 1);
        fireEvent.keyDown(slot('s9'), { key: 'h' });
        expect(slot('s9')).toHaveClass('is-selected');
    });

    it('klavye: son satırdan aşağı ok hotbar satırına geçer', () => {
        const api = makeFakeApi({});
        render(<InventoryPanel api={api} onClose={() => {}} />);
        slot('s27').focus();
        fireEvent.keyDown(slot('s27'), { key: 'ArrowDown' });
        expect(document.activeElement).toBe(slot('s0'));
    });

    it('sürükle-bırak: pointer olaylarıyla yuvadan yuvaya, hayalet gösterilir', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 5] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        const target = slot('s22');
        const original = document.elementFromPoint;
        document.elementFromPoint = vi.fn(() => target);
        fireEvent.pointerDown(slot('s9'), { pointerId: 7, clientX: 10, clientY: 10, button: 0, pointerType: 'mouse' });
        fireEvent.pointerMove(window, { pointerId: 7, clientX: 60, clientY: 80 });
        expect(screen.getByTestId('drag-ghost')).toBeInTheDocument();
        expect(slot('s9')).toHaveClass('is-dragging');
        expect(target).toHaveAttribute('data-drop-hover', '1');
        fireEvent.pointerUp(window, { pointerId: 7, clientX: 60, clientY: 80 });
        document.elementFromPoint = original;
        expect(api.moveStack).toHaveBeenCalledWith('s9', 's22', { half: false });
        expect(screen.queryByTestId('drag-ghost')).toBeNull();
        expect(label('s22')).toContain('Taş ×5');
        expect(target).not.toHaveAttribute('data-drop-hover');
        // sürükleme sonrası gelen tıklama seçim başlatmaz
        fireEvent.click(slot('s22'));
        expect(slot('s22')).not.toHaveClass('is-selected');
    });

    it('sürükle-bırak: yere bırak bölgesine bırakınca dropSlot', () => {
        vi.useFakeTimers();
        const api = makeFakeApi({ items: { 9: ['blok:taş', 5] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        const zone = screen.getByRole('button', { name: /Yere bırak/ });
        const original = document.elementFromPoint;
        document.elementFromPoint = vi.fn(() => zone);
        fireEvent.pointerDown(slot('s9'), { pointerId: 2, clientX: 0, clientY: 0, button: 0, pointerType: 'touch' });
        act(() => {
            vi.advanceTimersByTime(TOUCH_DRAG_HOLD_MS + 20); // dokunmatikte sürükleme basılı tutunca başlar
        });
        fireEvent.pointerMove(window, { pointerId: 2, clientX: 40, clientY: 40 });
        fireEvent.pointerUp(window, { pointerId: 2, clientX: 40, clientY: 40 });
        document.elementFromPoint = original;
        expect(api.dropSlot).toHaveBeenCalledWith('s9', 5);
    });

    it('küçük kıpırdama sürükleme sayılmaz (dokunuş tıklama olarak kalır)', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 5] } });
        render(<InventoryPanel api={api} onClose={() => {}} />);
        fireEvent.pointerDown(slot('s9'), { pointerId: 3, clientX: 10, clientY: 10, button: 0 });
        fireEvent.pointerMove(window, { pointerId: 3, clientX: 12, clientY: 11 });
        expect(screen.queryByTestId('drag-ghost')).toBeNull();
        fireEvent.pointerUp(window, { pointerId: 3, clientX: 12, clientY: 11 });
        fireEvent.click(slot('s9'));
        expect(slot('s9')).toHaveClass('is-selected');
    });

    it('version artınca anlık görüntü yeniden okunur', () => {
        const api = makeFakeApi({ items: { 9: ['blok:taş', 5] } });
        const { rerender } = render(<InventoryPanel api={api} onClose={() => {}} version={0} />);
        expect(label('s10')).toContain('boş');
        api._inv.setSlot(10, 'blok:kum', 3);
        rerender(<InventoryPanel api={api} onClose={() => {}} version={1} />);
        expect(label('s10')).toContain('Kum ×3');
    });

    it('Esc ve kapat düğmesi onClose çağırır; odak içeri taşınır', () => {
        const onClose = vi.fn();
        const api = makeFakeApi({ items: { 9: ['blok:taş', 5] } });
        render(<InventoryPanel api={api} onClose={onClose} />);
        const dlg = screen.getByRole('dialog');
        expect(dlg.contains(document.activeElement)).toBe(true);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('Tab son öğeden ilke döner (odak tuzağı)', () => {
        const api = makeFakeApi({});
        render(<InventoryPanel api={api} onClose={() => {}} />);
        const buttons = Array.from(screen.getByRole('dialog').querySelectorAll('button:not([disabled]),[tabindex]:not([tabindex="-1"])'));
        const last = buttons[buttons.length - 1];
        last.focus();
        fireEvent.keyDown(last, { key: 'Tab' });
        expect(document.activeElement).toBe(buttons[0]);
        fireEvent.keyDown(buttons[0], { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last);
    });

    it('yaratıcı mod bilgisi ve snapshot okunamazsa hata metni', () => {
        const api = makeFakeApi({ creative: true });
        const { unmount } = render(<InventoryPanel api={api} onClose={() => {}} />);
        expect(screen.getByText(/tükenmez/)).toBeInTheDocument();
        unmount();
        const bad = makeFakeApi({});
        bad.getInventorySnapshot.mockImplementation(() => {
            throw new Error('x');
        });
        render(<InventoryPanel api={bad} onClose={() => {}} />);
        expect(screen.getByText('Envanter okunamadı.')).toBeInTheDocument();
        expect(screen.getAllByRole('button').length).toBeGreaterThan(30);
    });

    it('erişilebilirlik modu sınıfı eklenir', () => {
        const api = makeFakeApi({});
        render(<InventoryPanel api={api} onClose={() => {}} accessibility />);
        expect(screen.getByTestId('inventory-panel-overlay')).toHaveClass('kp-a11y');
    });
});
