/*
 * Sabit zaman adımı biriktiricisi (saf mantık).
 *
 * Simülasyon her zaman 60 Hz'de ilerler; render ekran hızında çalışır ve iki
 * tick arasını alpha ile karıştırır. Kare süresi 250 ms ile sınırlı: sekmeye
 * dönüşte ya da takılmada oyuncu "ışınlanmaz". Bu, sim'in gerçek zamandan
 * asla hızlı koşmaması demek (sunucunun süre kontrolü buna dayanıyor).
 */

export const TICK_MS = 1000 / 60;
export const MAX_FRAME_MS = 250;

export function createFixedStepper({ stepMs = TICK_MS, maxFrameMs = MAX_FRAME_MS } = {}) {
    let acc = 0;
    return {
        /** Kare süresini ekler, atılması gereken adım sayısını döner. */
        advance(frameMs) {
            const dt = Number.isFinite(frameMs) ? Math.min(Math.max(frameMs, 0), maxFrameMs) : 0;
            acc += dt;
            let steps = 0;
            while (acc >= stepMs) {
                acc -= stepMs;
                steps += 1;
            }
            return steps;
        },
        /** Son tick ile bir sonraki arası konum (0..1). */
        get alpha() {
            return acc / stepMs;
        },
        reset() {
            acc = 0;
        },
    };
}
