// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Eski hash'li parça (deploy sonrası / eski WebView önbelleği) yüklenemeyince
 * sayfa BİR kez yenilenir, döngüye girmez. Her testte modülü taze yükleriz
 * (installChunkReloadHandler tek seferlik bayrak tutar).
 */
const load = async () => {
    vi.resetModules();
    return import('../chunkReload');
};

describe('chunkReload', () => {
    let reload;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
        sessionStorage.clear();
        reload = vi.fn();
        Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true, writable: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('tarayıcıya göre değişen modül yükleme hatası metinlerini tanır', async () => {
        const { isChunkLoadError } = await load();
        expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a-1.js'))).toBe(true);
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
        expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true);
        expect(isChunkLoadError(new Error('Network Error'))).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
    });

    it('vite:preloadError gelince bir kez yeniler ve olayı yutar', async () => {
        const { installChunkReloadHandler } = await load();
        installChunkReloadHandler();
        const ev = new Event('vite:preloadError', { cancelable: true });
        window.dispatchEvent(ev);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(ev.defaultPrevented).toBe(true);
    });

    it('dinleyici ikinci kurulumda çoğalmaz (tek olay = tek yenileme)', async () => {
        const { installChunkReloadHandler } = await load();
        installChunkReloadHandler();
        installChunkReloadHandler();
        window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('10 sn içinde ikinci hata yenilemez (döngü yok), olay yutulmaz', async () => {
        const { installChunkReloadHandler } = await load();
        installChunkReloadHandler();
        window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
        expect(reload).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(4000);
        const again = new Event('vite:preloadError', { cancelable: true });
        window.dispatchEvent(again);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(again.defaultPrevented).toBe(false); // hata görünür kalır: yedek ekran
    });

    it('pencere dolunca (yeni oturum anı) yeniden denemeye izin verir', async () => {
        const { reloadOnceForChunkError } = await load();
        expect(reloadOnceForChunkError()).toBe(true);
        vi.advanceTimersByTime(10001);
        expect(reloadOnceForChunkError()).toBe(true);
        expect(reload).toHaveBeenCalledTimes(2);
    });

    it('sessionStorage erişilemezse yenilemez (döngü riski almaz)', async () => {
        const { reloadOnceForChunkError } = await load();
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        expect(reloadOnceForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
