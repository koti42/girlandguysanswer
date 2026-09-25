import { describe, expect, it } from 'vitest';
import { emptySelection, pageState, pruneMissing, toggleOne, togglePage } from './selection';

describe('tablo seçimi', () => {
    it('tek satır aç/kapa', () => {
        let s = emptySelection();
        s = toggleOne(s, 'a');
        expect([...s]).toEqual(['a']);
        s = toggleOne(s, 'a');
        expect(s.size).toBe(0);
    });

    it('sayfa seçimi: hiçbiri seçili değilse hepsini seçer, hepsi seçiliyse kaldırır', () => {
        let s = togglePage(emptySelection(), ['a', 'b', 'c']);
        expect(s.size).toBe(3);
        s = togglePage(s, ['a', 'b', 'c']);
        expect(s.size).toBe(0);
    });

    it('kısmi seçimde sayfa seçimi eksikleri tamamlar', () => {
        const s = togglePage(new Set(['a']), ['a', 'b']);
        expect([...s].sort()).toEqual(['a', 'b']);
    });

    it('sayfa seçimi diğer sayfaların seçimine dokunmaz', () => {
        const s = togglePage(new Set(['z']), ['a', 'b']);
        expect(s.has('z')).toBe(true);
        expect(s.size).toBe(3);
    });

    it('pageState none/some/all', () => {
        expect(pageState(emptySelection(), ['a'])).toBe('none');
        expect(pageState(new Set(['a']), ['a', 'b'])).toBe('some');
        expect(pageState(new Set(['a', 'b']), ['a', 'b'])).toBe('all');
        expect(pageState(new Set(['a']), [])).toBe('none');
    });

    it('pruneMissing artık listede olmayanları düşürür', () => {
        const s = pruneMissing(new Set(['a', 'gone']), ['a', 'b']);
        expect([...s]).toEqual(['a']);
    });

    it('girdi Set değişmez (saf)', () => {
        const orig = new Set(['a']);
        toggleOne(orig, 'b');
        expect(orig.size).toBe(1);
    });
});
