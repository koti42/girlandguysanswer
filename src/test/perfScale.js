/**
 * Başarım testleri için yük-bağışık zamanlayıcı ve eşik ölçeği.
 *
 * Paralel testler/ajanlar/CI makineyi doyurunca duvar saati (wall-clock) ölçümleri 10-30 kat
 * şişer (ölçüldü: 5e7 döngü 235 ms CPU / 8 sn duvar); bu yalancı kırmızı verir. Eşiği körü
 * körüne gevşetmek ise gerçek regresyonları da saklar. Çözüm:
 *  1) `cpuMs()` — bu sürecin CPU zamanı (process.cpuUsage). Zamanlayıcının bizi kuyruğa
 *     alması CPU zamanını şişirmez; tek iş parçacıklı CPU-bağlı ölçümler güvenilir kalır.
 *     (Vitest 'forks' havuzu: her test dosyası kendi sürecinde koşar.)
 *  2) `scaled(limit)` — kalan etki (önbellek/frekans baskısı) için sabit bir referans iş
 *     yükünü AYNI saatle ölçüp eşiği o oranda çarpar; yüksüz makinede ölçek ≈ 1'dir.
 */

const REF_ITERATIONS = 1500000;
const REF_MS = 9; // yüksüz geliştirici makinesinde (ısınmış JIT) ölçülen yaklaşık CPU süresi
const MAX_SCALE = 8;

/** Süreç CPU zamanı (ms, user+system). process.cpuUsage yoksa duvar saatine düşer. */
export function cpuMs() {
    const proc = globalThis.process;
    if (proc && typeof proc.cpuUsage === 'function') {
        const u = proc.cpuUsage();
        return (u.user + u.system) / 1000;
    }
    return performance.now();
}

function referenceWork() {
    let a = 1;
    let s = 0;
    for (let i = 0; i < REF_ITERATIONS; i++) {
        a = (a * 1664525 + 1013904223) >>> 0;
        s += Math.sqrt(a & 1023);
    }
    return s;
}

let worst = 1;

/**
 * Makinenin şu anki yavaşlık çarpanı (>= 1, <= 8). Her çağrıda yeniden ölçülür ve süreç
 * boyunca görülen EN YÜKSEK değer döner (ölçüm testten sonra yapıldığında test sırasındaki
 * yoğunluğu da kapsar). Yüksüz makinede ≈ 1 kalır.
 */
export function loadScale() {
    referenceWork(); // JIT ısınması
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
        const t0 = cpuMs();
        referenceWork();
        best = Math.min(best, cpuMs() - t0);
    }
    worst = Math.max(worst, Math.min(MAX_SCALE, best / REF_MS));
    return worst;
}

/** Eşiği yük ölçeğiyle çarpar: `scaled(2)` -> yüksüzde 2, yoğun yükte 2 × ölçek. */
export function scaled(limitMs) {
    return limitMs * loadScale();
}

/**
 * `fn()` bir ölçüm (ms) döndürür; en iyi (en küçük) `runs` sonucu verir. Geçici kesintiler
 * (GC, diğer süreçler) tek bir ölçümü şişirir ama en iyi sonucu bozmaz.
 */
export function bestOf(runs, fn) {
    loadScale(); // ölçümden ÖNCEKİ yoğunluğu da kaydet (scaled() sonradan en yükseği kullanır)
    let best = Infinity;
    for (let i = 0; i < runs; i++) best = Math.min(best, fn());
    return best;
}
