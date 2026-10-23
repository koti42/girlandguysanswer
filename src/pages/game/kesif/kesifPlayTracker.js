import { classifyKesifError } from '../../../components/game/kesif/kesifUtils';

/*
 * Keşif macera oyun oturumu izleyicisi (sunucu ödül kapısı; API: POST /game/kesif/play/start + /play/ping).
 *
 * Sunucu oyunu çalıştırmaz; ödül talebi için "bu dünyada gerçekten zaman geçti" ön koşulunu bu oturum sağlar
 * (bir CAYDIRICI, kanıt değil). İstemci tarafı:
 *   - begin(): macera başlayınca BİR kez `playStart(worldCode)` (yalnız üye), ağ/5xx/429'da geri çekilmeli yeniden deneme;
 *   - ilk ping ~20 sn sonra, sonra ~60 sn'de bir `playPing(worldCode, motor playTime)`; her başarılı ping `onPingOk`
 *     (ödül yürütücüsünün zamanı gelen erteli talepleri yeniden denemesi için);
 *   - ensureStarted(): ödül talebi `no_session` alırsa yürütücü bunu çağırır, söz oturumun hazır olup olmadığını döner;
 *   - kalıcı hatalar (401/403, 422: geçersiz kod / günlük yeni oturum sınırı) durdurur; ping'deki `no_session`
 *     (sunucu oturumu silmiş) oturumu yeniden başlatır.
 * Zamanlayıcılar enjekte edilebilir (testler); dispose() hepsini keser.
 */

export const PING_FIRST_MS = 20000;
export const PING_EVERY_MS = 60000;
export const START_RETRY_MS = [3000, 10000, 30000, 60000];

const safe = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

export function createPlayTracker({
    getApi,
    canTrack,
    getWorldCode,
    getPlayTime,
    onPingOk,
    startDelays = START_RETRY_MS,
    firstPingMs = PING_FIRST_MS,
    pingMs = PING_EVERY_MS,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
}) {
    let started = false;
    let stopped = false;
    let disposed = false;
    let startPromise = null;
    let timers = new Set();
    let pingTimer = null;
    let code = '';

    const later = (fn, ms) => {
        const id = setTimer(() => {
            timers.delete(id);
            fn();
        }, ms);
        timers.add(id);
        return id;
    };

    const supported = () => {
        const api = getApi();
        return Boolean(api && typeof api.playStart === 'function' && typeof api.playPing === 'function');
    };

    /** Bir başlatma turu: başarıda true; kalıcı hata / vazgeçme false. Yeniden denemeler içeride. */
    function runStart() {
        return new Promise((resolve) => {
            let tries = 0;
            const attempt = async () => {
                if (disposed || stopped || !canTrack() || !supported()) {
                    resolve(false);
                    return;
                }
                code = code || String(safe(getWorldCode) || '');
                if (!code) {
                    resolve(false);
                    return;
                }
                try {
                    await getApi().playStart(code);
                    if (disposed) {
                        resolve(false);
                        return;
                    }
                    started = true;
                    schedulePing(firstPingMs);
                    resolve(true);
                } catch (err) {
                    const { kind, status } = classifyKesifError(err);
                    if (kind === 'unauth' || kind === 'forbidden' || status === 422 || status === 400) {
                        // Kalıcı: giriş yok / geçersiz kod / günlük yeni oturum sınırı. Ödüller bekler, oyun sürer.
                        stopped = true;
                        resolve(false);
                        return;
                    }
                    if (tries >= startDelays.length || disposed) {
                        resolve(false);
                        return;
                    }
                    later(attempt, startDelays[tries++]);
                }
            };
            attempt();
        });
    }

    function schedulePing(ms) {
        if (pingTimer !== null) {
            clearTimer(pingTimer);
            timers.delete(pingTimer);
        }
        if (disposed || stopped) return;
        pingTimer = later(ping, ms);
    }

    async function ping() {
        pingTimer = null;
        if (disposed || stopped || !started) return;
        let ok = false;
        try {
            const seconds = Number(safe(getPlayTime));
            await getApi().playPing(code, Number.isFinite(seconds) ? seconds : 0);
            ok = true;
        } catch (err) {
            const { kind, status, data } = classifyKesifError(err);
            if (kind === 'unauth' || kind === 'forbidden') {
                stopped = true;
                return;
            }
            if (status === 422 && data && data.reason === 'no_session') {
                // Sunucu oturumu kaybetmiş: yeniden başlat; başarırsa ping zinciri runStart içinde kurulur.
                started = false;
                startPromise = null;
                tracker.ensureStarted();
                return;
            }
            // Ağ/5xx/429/diğer: bu ping atlanır, zincir sürer.
        }
        if (disposed || stopped) return;
        schedulePing(pingMs);
        if (ok && onPingOk) safe(() => onPingOk());
    }

    const tracker = {
        /** Oturumu başlatır (zaten başlamış/başlıyorsa bir şey yapmaz). Fire-and-forget. */
        begin() {
            tracker.ensureStarted();
        },
        /** Söz: sunucuda oturum hazır mı. Eşzamanlı çağrılar aynı turu paylaşır. */
        ensureStarted() {
            if (started) return Promise.resolve(true);
            if (!startPromise) {
                startPromise = runStart().then((ok) => {
                    startPromise = null;
                    return ok;
                });
            }
            return startPromise;
        },
        isStarted: () => started,
        isStopped: () => stopped,
        dispose() {
            disposed = true;
            timers.forEach((id) => clearTimer(id));
            timers = new Set();
            pingTimer = null;
        },
    };
    return tracker;
}
