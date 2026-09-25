import { describe, expect, it } from 'vitest';
import { resolveTheme } from './usePanelTheme';

describe('resolveTheme', () => {
    it('açık tercih sistemi yok sayar', () => {
        expect(resolveTheme('light', true)).toBe('light');
        expect(resolveTheme('dark', false)).toBe('dark');
    });
    it('system tercihi işletim sistemini izler', () => {
        expect(resolveTheme('system', true)).toBe('dark');
        expect(resolveTheme('system', false)).toBe('light');
    });
    it('bilinmeyen tercih system gibi davranır', () => {
        expect(resolveTheme(undefined, false)).toBe('light');
    });
});
