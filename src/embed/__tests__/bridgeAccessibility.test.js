// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readNativeConfig, validateOutgoing } from '../bridge';

describe('köprü: erişilebilirlik bayrağı ve seslendirme mesajları', () => {
    afterEach(() => {
        delete window.__HS_NATIVE__;
    });

    it('native yapılandırmadan accessibility okunur (yalnızca true)', () => {
        expect(readNativeConfig({ __HS_NATIVE__: { v: 1, platform: 'android', accessibility: true } }).accessibility).toBe(true);
        expect(readNativeConfig({ __HS_NATIVE__: { v: 1, platform: 'android', accessibility: 'evet' } }).accessibility).toBe(false);
        expect(readNativeConfig({ __HS_NATIVE__: { v: 1, platform: 'ios' } }).accessibility).toBe(false);
    });

    it('tarayıcıda ?a11y=1 ile açılır', () => {
        expect(readNativeConfig({ location: { search: '?game=kosu&a11y=1' } }).accessibility).toBe(true);
        expect(readNativeConfig({ location: { search: '?game=kosu' } }).accessibility).toBe(false);
    });

    it('speak / speakStop giden mesaj şeması', () => {
        expect(validateOutgoing({ type: 'speak', text: 'Soru 1: Merhaba' })).toBe(true);
        expect(validateOutgoing({ type: 'speak', text: '   ' })).toBe(false);
        expect(validateOutgoing({ type: 'speak', text: 'x'.repeat(601) })).toBe(false);
        expect(validateOutgoing({ type: 'speak' })).toBe(false);
        expect(validateOutgoing({ type: 'speakStop' })).toBe(true);
    });
});
