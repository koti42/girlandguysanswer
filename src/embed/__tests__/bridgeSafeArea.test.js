// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBridgeForTests, onNativeMessage, parseIncoming, receiveFromNative } from '../bridge';

/*
 * Native (GameWebViewScreen) yatay döndürmeden sonra { type:'safeArea', top, right, bottom, left } yollar.
 * Betik CSS değişkenlerini kendisi yazar; ama alıcıya doğrudan gelen mesaj da uygulanmalı ve "alındı" (true)
 * dönmeli — aksi halde geçersiz sayılır ve çentik/gezinme çubuğu payı yenilenmezdi.
 */
describe('köprü: native -> web safeArea', () => {
    beforeEach(() => {
        __resetBridgeForTests();
        document.documentElement.removeAttribute('style');
    });
    afterEach(() => vi.restoreAllMocks());

    it('şemayı doğrular (kenar başına 0-200 sayı)', () => {
        expect(parseIncoming({ type: 'safeArea', top: 0, right: 48, bottom: 20, left: 48 })).not.toBeNull();
        expect(parseIncoming({ type: 'safeArea', top: 0, right: 48, bottom: 20 })).toBeNull();
        expect(parseIncoming({ type: 'safeArea', top: -1, right: 0, bottom: 0, left: 0 })).toBeNull();
        expect(parseIncoming({ type: 'safeArea', top: 0, right: 201, bottom: 0, left: 0 })).toBeNull();
        expect(parseIncoming({ type: 'safeArea', top: '5', right: 0, bottom: 0, left: 0 })).toBeNull();
        expect(parseIncoming(JSON.stringify({ type: 'safeArea', top: 1, right: 2, bottom: 3, left: 4 }))).toMatchObject({ type: 'safeArea', left: 4 });
    });

    it('doğrudan çağrıda --hs-safe-* yazılır, resize tetiklenir, true döner; dinleyicilere gitmez', () => {
        const resize = vi.fn();
        window.addEventListener('resize', resize);
        const seen = vi.fn();
        const off = onNativeMessage(seen);
        const ok = receiveFromNative({ type: 'safeArea', top: 30.4, right: 48, bottom: 20, left: 47.6 });
        expect(ok).toBe(true);
        const st = document.documentElement.style;
        expect(st.getPropertyValue('--hs-safe-top')).toBe('30px');
        expect(st.getPropertyValue('--hs-safe-right')).toBe('48px');
        expect(st.getPropertyValue('--hs-safe-bottom')).toBe('20px');
        expect(st.getPropertyValue('--hs-safe-left')).toBe('48px');
        expect(resize).toHaveBeenCalledTimes(1);
        expect(seen).not.toHaveBeenCalled();
        off();
        window.removeEventListener('resize', resize);
    });

    it('geçersiz safeArea yok sayılır (false, değişken yazılmaz)', () => {
        expect(receiveFromNative({ type: 'safeArea', top: 999, right: 0, bottom: 0, left: 0 })).toBe(false);
        expect(document.documentElement.style.getPropertyValue('--hs-safe-top')).toBe('');
    });
});
