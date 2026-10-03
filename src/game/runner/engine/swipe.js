/*
 * Dokunmatik kaydırma tanıyıcı (saf mantık, DOM bağımsız).
 *
 * Parmak kalkmayı beklemez: hareket eşiği aşıldığı anda komut üretir ve
 * çapayı o noktaya taşır; böylece parmak kalkmadan ikinci bir kaydırma
 * (ör. sağa sonra yukarı) da tanınır.
 *
 * Aynı yönde devam eden hareket YENİ komut üretmez (çapa parmağı izler):
 * uzun bir sağa kaydırma oyuncuyu iki şerit birden atlatmasın. Aynı yönde
 * ikinci komut için parmak kaldırılır ya da önce başka yöne gidilir.
 * Aynı anda yalnızca ilk parmak izlenir, ikinci parmak yok sayılır.
 *
 * Dönen kodlar sim girdileriyle aynı: L, R, J (yukarı = zıpla), S (aşağı = kay).
 */

export const SWIPE_THRESHOLD_PX = 24;

export function createSwipeRecognizer({ threshold = SWIPE_THRESHOLD_PX } = {}) {
    let activeId = null;
    let ax = 0;
    let ay = 0;
    let lastDir = null;

    return {
        begin(id, x, y) {
            if (activeId !== null) return;
            activeId = id;
            ax = x;
            ay = y;
            lastDir = null;
        },

        /** Eşik aşıldıysa 'L'|'R'|'J'|'S', değilse null. */
        move(id, x, y) {
            if (id !== activeId) return null;
            const dx = x - ax;
            const dy = y - ay;
            const adx = Math.abs(dx);
            const ady = Math.abs(dy);
            if (adx < threshold && ady < threshold) return null;
            let dir;
            if (adx > ady) dir = dx < 0 ? 'L' : 'R';
            else dir = dy < 0 ? 'J' : 'S';
            // Yeniden çapala: sonraki komut bu noktadan itibaren ölçülür.
            ax = x;
            ay = y;
            if (dir === lastDir) return null;
            lastDir = dir;
            return dir;
        },

        end(id) {
            if (id === activeId) {
                activeId = null;
                lastDir = null;
            }
        },

        reset() {
            activeId = null;
            lastDir = null;
        },

        isTracking() {
            return activeId !== null;
        },
    };
}
