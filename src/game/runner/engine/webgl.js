/*
 * WebGL desteği kontrolü (three yüklemeden çağrılabilir).
 *
 * three r163+ yalnızca WebGL2 ile çalışıyor; bu yüzden webgl2 bağlamı
 * aranır. Deneme bağlamı hemen bırakılır ki tarayıcının bağlam sınırını
 * (genelde 16) boşuna doldurmasın.
 */

export function isWebGLAvailable() {
    try {
        if (typeof document === 'undefined' || typeof window === 'undefined') return false;
        if (!window.WebGL2RenderingContext) return false;
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return false;
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return true;
    } catch {
        return false;
    }
}

/** Kaba pointer (dokunmatik) cihaz mı? Antialias ve kalite kararları için. */
export function isCoarsePointer() {
    try {
        return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
    } catch {
        return false;
    }
}
