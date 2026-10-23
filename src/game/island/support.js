/*
 * Ada sahnesi destek kontrolü (three yüklemeden çağrılabilir; tarayıcı dışında false).
 *
 * WebGL2 gerekir. Yalnızca yazılımla çizen sürücüler (SwiftShader, llvmpipe...)
 * ve çok düşük bellekli cihazlar "desteklenmiyor" sayılır: orada 3D ada akıcı
 * çalışmaz, standart profil başlığı gösterilir. allowSoftware: test/geliştirme.
 */

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i;
const cache = {};

export function isCoarsePointer() {
    try {
        return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    } catch {
        return false;
    }
}

export function prefersReducedMotion() {
    try {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
        return false;
    }
}

export function isIslandSupported({ allowSoftware = false } = {}) {
    const k = allowSoftware ? 'soft' : 'hard';
    if (k in cache) return cache[k];
    let ok = false;
    try {
        if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.WebGL2RenderingContext) {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2');
            if (gl) {
                ok = true;
                if (!allowSoftware) {
                    const ext = gl.getExtension('WEBGL_debug_renderer_info');
                    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
                    if (SOFTWARE_RE.test(name)) ok = false;
                    const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
                    if (typeof mem === 'number' && mem > 0 && mem < 2) ok = false;
                }
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            }
        }
    } catch {
        ok = false;
    }
    cache[k] = ok;
    return ok;
}

/** Testler için önbelleği sıfırlar. */
export function resetIslandSupportCache() {
    delete cache.soft;
    delete cache.hard;
}
