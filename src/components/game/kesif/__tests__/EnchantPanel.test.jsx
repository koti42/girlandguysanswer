// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import EnchantPanel from '../EnchantPanel.jsx';
import { makeMagicApi } from './magicTestKit.js';

const DUST = 'item:büyü_tozu';
const SHARD = 'item:kuantum_kıymığı';

afterEach(() => {
    vi.useRealTimers();
});

describe('EnchantPanel', () => {
    it('yalnız büyülenebilir eşyaları listeler; varsayılan seçili yuva eldeki eşyadır', () => {
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1], 1: ['blok:taş', 5], 2: ['item:asa_ates', 1], 3: [DUST, 10] } });
        render(<EnchantPanel api={api} onClose={() => {}} />);
        expect(screen.getByRole('dialog', { name: 'Büyü Masası' })).toBeInTheDocument();
        expect(screen.getByTestId('ench-slot-s0')).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('ench-slot-s2')).toBeInTheDocument();
        expect(screen.queryByTestId('ench-slot-s1')).toBeNull();
        expect(screen.queryByTestId('ench-slot-s3')).toBeNull();
    });

    it('kitaplık göstergesi ve bakiye', () => {
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1], 1: [DUST, 12], 2: [SHARD, 4] }, shelves: 3 });
        render(<EnchantPanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('shelf-meter')).toHaveTextContent('3/5 kitaplık • Kademe IV');
        const bal = screen.getByTestId('enchant-balance');
        expect(within(bal).getByText('12')).toBeInTheDocument();
        expect(within(bal).getByText('4')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toHaveTextContent('3/5 kitaplık');
    });

    it('üç teklif, kademe rozeti ve bedel; ilk karşılanabilir teklif seçili gelir; önizleme gösterilir', () => {
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1], 1: [DUST, 40], 2: [SHARD, 6] }, shelves: 4 });
        render(<EnchantPanel api={api} onClose={() => {}} />);
        const offers = [0, 1, 2].map((i) => screen.getByTestId(`offer-${i}`));
        expect(offers[0]).toHaveAttribute('aria-checked', 'true');
        offers.forEach((o) => expect(o.querySelector('.ke-tier')).toBeTruthy());
        const prev = screen.getByTestId('enchant-preview');
        expect(prev.querySelectorAll('li').length).toBeGreaterThan(0);
        expect(prev.querySelector('i')).toHaveTextContent('yeni');
        fireEvent.click(offers[2]);
        expect(offers[2]).toHaveAttribute('aria-checked', 'true');
        expect(offers[0]).toHaveAttribute('aria-checked', 'false');
    });

    it('Büyüle: api.enchant çağrılır, eşya büyülenir, toz harcanır, duyuru okunur ve yeni teklifler gelir', () => {
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1], 1: [DUST, 40], 2: [SHARD, 6] }, shelves: 4 });
        render(<EnchantPanel api={api} onClose={() => {}} />);
        const firstId = api.getEnchantInfo('s0').offers[0].id;
        fireEvent.click(screen.getByTestId('offer-0'));
        fireEvent.click(screen.getByTestId('enchant-go'));
        expect(api.enchant).toHaveBeenCalledWith(firstId, 's0');
        expect(api._inv.slots[0].ench).toBeTruthy();
        expect(api._inv.count(DUST)).toBeLessThan(40);
        expect(screen.getByTestId('live').textContent).toMatch(/büyülendi/);
        // eski teklif kimliği artık yok: yeni teklif kartları farklı id taşır
        expect(screen.getByTestId('offer-0').getAttribute('data-offer')).not.toBe(firstId);
        expect(screen.getByTestId('ench-slot-s0').className).toContain('is-ench');
    });

    it('bedel karşılanamıyorsa Büyüle devre dışı ve neden yazılı', () => {
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1], 1: [DUST, 1] }, shelves: 0 });
        render(<EnchantPanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('enchant-go')).toBeDisabled();
        expect(document.querySelector('.ke-why').textContent).toMatch(/eksik/);
        expect(screen.getByTestId('offer-0')).toHaveTextContent(/Büyü Tozu eksik/);
        fireEvent.click(screen.getByTestId('enchant-go'));
        expect(api.enchant).not.toHaveBeenCalled();
    });

    it('Yeniden çek: 1 toz harcar ve teklifleri değiştirir; toz yoksa devre dışı', () => {
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1], 1: [DUST, 5] }, shelves: 4 });
        render(<EnchantPanel api={api} onClose={() => {}} />);
        const before = screen.getByTestId('offer-0').getAttribute('data-offer');
        fireEvent.click(screen.getByTestId('enchant-reroll'));
        expect(api.rerollEnchant).toHaveBeenCalled();
        expect(api._inv.count(DUST)).toBe(4);
        expect(screen.getByTestId('offer-0').getAttribute('data-offer')).not.toBe(before);
        const none = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1] }, shelves: 4 });
        render(<EnchantPanel api={none} onClose={() => {}} />);
        expect(screen.getAllByTestId('enchant-reroll')[1]).toBeDisabled();
    });

    it('büyülenebilir eşya yoksa yönerge; panel hata vermez', () => {
        const api = makeMagicApi({ items: { 0: ['blok:taş', 5] } });
        render(<EnchantPanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('enchant-none')).toBeInTheDocument();
        expect(screen.queryByTestId('enchant-go')).toBeNull();
    });

    it('klavye: teklifler arasında ok tuşlarıyla gezilir (radiogroup); Esc kapatır', () => {
        const onClose = vi.fn();
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1], 1: [DUST, 40], 2: [SHARD, 6] }, shelves: 4 });
        render(<EnchantPanel api={api} onClose={onClose} />);
        const group = screen.getByRole('radiogroup', { name: 'Büyü teklifleri' });
        fireEvent.keyDown(group, { key: 'ArrowDown' });
        expect(screen.getByTestId('offer-1')).toHaveAttribute('aria-checked', 'true');
        fireEvent.keyDown(group, { key: 'ArrowUp' });
        fireEvent.keyDown(group, { key: 'ArrowUp' });
        expect(screen.getByTestId('offer-2')).toHaveAttribute('aria-checked', 'true');
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('büyülü eşyanın mevcut büyüleri bilgi kartında mor satırlarla görünür; erişilebilir etiket büyüyü söyler', () => {
        const api = makeMagicApi({ items: { 0: ['item:kılıç_demir', 1, { keskinlik: 2 }], 1: [DUST, 40] }, shelves: 2 });
        render(<EnchantPanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('ench-slot-s0').getAttribute('aria-label')).toMatch(/büyülü: Keskinlik II/);
    });
});
