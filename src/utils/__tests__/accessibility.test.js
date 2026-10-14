// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyAccessibilityAttr, isAccessibilityOn } from '../accessibility';

describe('erişilebilirlik modu yardımcıları', () => {
    it('kullanıcı bayrağını üst alandan ya da detail içinden okur', () => {
        expect(isAccessibilityOn(null)).toBe(false);
        expect(isAccessibilityOn({})).toBe(false);
        expect(isAccessibilityOn({ accessibility_mode: true })).toBe(true);
        expect(isAccessibilityOn({ accessibility_mode: false, detail: { accessibility_mode: true } })).toBe(false);
        expect(isAccessibilityOn({ detail: { accessibility_mode: true } })).toBe(true);
        expect(isAccessibilityOn({ detail: { accessibility_mode: 0 } })).toBe(false);
    });

    it('html data-a11y özniteliğini açıp kapatır', () => {
        const root = document.createElement('div');
        applyAccessibilityAttr(true, root);
        expect(root.getAttribute('data-a11y')).toBe('1');
        applyAccessibilityAttr(false, root);
        expect(root.hasAttribute('data-a11y')).toBe(false);
        expect(() => applyAccessibilityAttr(true, null)).not.toThrow();
    });
});
