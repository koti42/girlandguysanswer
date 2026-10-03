/*
 * Yeni sürüm yayınlanınca eski sekmedeki hash'li parça dosyaları 404 olur.
 * Böyle bir yükleme hatasında sayfa bir kez kendiliğinden yenilenir;
 * sessionStorage'daki zaman damgası sonsuz yenileme döngüsünü önler.
 */

const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;
const RELOAD_KEY = 'chunk-reload-at';
const RELOAD_WINDOW_MS = 10000;

export const isChunkLoadError = (error) => CHUNK_ERROR_RE.test(String(error?.message || error || ''));

/** Son 10 sn içinde denenmediyse sayfayı bir kez yeniler; yenilediyse true. */
export function reloadOnceForChunkError() {
    try {
        const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last <= RELOAD_WINDOW_MS) return false;
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return true;
    } catch {
        // Depolama kapalıysa döngü riskine girmeyelim: yedek ekran gösterilir.
        return false;
    }
}

/*
 * Vite, dinamik import ön yüklemesi düşünce `vite:preloadError` yayar.
 * Dinleyici bir kez kurulur (App modülü yüklenirken).
 */
let installed = false;
export function installChunkReloadHandler() {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    window.addEventListener('vite:preloadError', (e) => {
        if (reloadOnceForChunkError()) e.preventDefault();
    });
}
