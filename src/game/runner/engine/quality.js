/*
 * Uyarlamalı kalite: kare süresine bakıp pixel ratio'yu ve efekt düzeyini
 * ayarlar (saf mantık).
 *
 * Kademeler bir merdiven: cihaz dpr'ından (en fazla 2) 0.25'lik adımlarla
 * 1.0'a kadar inilir (dpr 1'den küçükse taban dpr). 1.0'da hâlâ yavaşsa
 * "düşük" kademeye geçilir: oran 0.85 ve 0.75'e iner ve pahalı efektler
 * (lite: hız çizgileri, partiküller, haleler, silüetler, görüş mesafesi)
 * kapanır/azalır.
 *
 * Ekran yenileme hızına kilitli (vsync) bir döngüde "ne kadar boşluk var"
 * ölçülemez; bu yüzden düşürmek kolay, yükseltmek temkinli:
 *  - normal kademelerde ortalama kare süresi 20 ms'yi (≈ 50 fps) aşarsa bir
 *    kademe düşür; düşük kademelere inmek için eşik 24 ms (≈ 42 fps):
 *    görüntüden ancak gerçekten yavaşsa ödün verilir,
 *  - yükseltme yalnızca daha önce düşürülmüşse, uzun süre rahat koşulduysa
 *    ve toplamda en fazla 2 kez denenir; deneme yine yavaşlamayla biterse
 *    kilitlenir (gidip gelme/titreme olmasın),
 *  - ortalama 40 ms'yi (≈ 25 fps) aşıyorsa iki kademe birden inilir: çok
 *    yavaş cihaz düşük kademeye 15 sn yerine birkaç saniyede ulaşsın,
 *  - 100 ms'den uzun tekil kareler (sekme takılması) sayılmaz; ama arka arkaya
 *    geliyorsa cihaz gerçekten yavaştır: 100 ms olarak sayılır (yoksa çok
 *    yavaş cihazda hiç düşürülmezdi).
 */

export const SLOW_FRAME_MS = 20;
export const LOW_TIER_FRAME_MS = 24;
export const LOW_TIER_RATIOS = [0.85, 0.75];
const FAST_FRAME_MS = 17.5;
const WINDOW_MS = 1500;
const UPGRADE_AFTER_MS = 9000;
const WARMUP_MS = 1200;
const SETTLE_MS = 500;
const LOCK_WINDOW_MS = 8000;
const STEP = 0.25;
const MAX_UPGRADES = 2;
const SPIKE_MS = 100;
const SPIKE_RUN = 3;
const VERY_SLOW_FRAME_MS = 40;

export function initialPixelRatio(dpr) {
    const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    return Math.min(d, 2);
}

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Kademe merdiveni (yüksekten düşüğe): [{ ratio, lite }].
 * Normal kademeler: max, max-0.25, ..., min. Düşük (lite) kademeler:
 * LOW_TIER_RATIOS'tan min'in altında kalanlar; hiçbiri kalmıyorsa (dpr ≤ 0.75)
 * oran aynı kalır, yalnızca efektler azalır.
 */
export function buildQualityLadder(dpr) {
    const max = initialPixelRatio(dpr);
    const min = Math.min(1, max);
    const ladder = [];
    for (let r = max; r > min + 1e-6; r = round2(r - STEP)) ladder.push({ ratio: r, lite: false });
    ladder.push({ ratio: min, lite: false });
    const low = LOW_TIER_RATIOS.filter((r) => r < min - 1e-6);
    if (low.length === 0) low.push(min);
    for (const r of low) ladder.push({ ratio: r, lite: true });
    return ladder;
}

export function createQualityController({ dpr = 1, start } = {}) {
    const ladder = buildQualityLadder(dpr);
    // İlk düşük kademenin indeksi: oraya ve ötesine inmek için 24 ms eşiği geçerli.
    const firstLow = ladder.findIndex((l) => l.lite);
    let level = 0;
    if (start != null) {
        // Verilen orana en yakın normal kademeden başla (düşük kademeden başlanmaz).
        while (level < firstLow - 1 && ladder[level].ratio > start + 1e-6) level++;
    }
    let warmup = WARMUP_MS;
    let winTime = 0;
    let winFrames = 0;
    let goodTime = 0;
    let upgrades = 0;
    let locked = false;
    let sinceUpgrade = Infinity; // son yükseltmeden beri geçen ölçülen süre (ms)
    let spikeRun = 0;

    function resetWindow() {
        winTime = 0;
        winFrames = 0;
    }

    function setLevel(next) {
        level = next;
        // Yeniden boyutlandırmanın kendi takılması bir sonraki pencereye girmesin.
        warmup = SETTLE_MS;
        return ladder[level].ratio;
    }

    return {
        get ratio() {
            return ladder[level].ratio;
        },
        /** Düşük kademede mi (pahalı efektler kapalı/azaltılmış)? */
        get lite() {
            return ladder[level].lite;
        },
        /** Titreşim kilidi devrede mi (artık yükseltme denenmez)? */
        get locked() {
            return locked;
        },

        /** Duraklatma/sekme dönüşü gibi kesintilerden sonra ilk kareleri sayma. */
        warmup(ms = WARMUP_MS) {
            warmup = ms;
            spikeRun = 0;
            resetWindow();
        },

        /**
         * Bir kare süresi besle. Kademe değiştiyse yeni oranı döner (yalnızca
         * lite değişip oran aynı kalsa da); değişmediyse null.
         */
        sample(frameMs) {
            if (!(frameMs > 0)) return null;
            if (warmup > 0) {
                warmup -= frameMs;
                return null;
            }
            let ms = frameMs;
            if (ms > SPIKE_MS) {
                spikeRun += 1;
                if (spikeRun < SPIKE_RUN) return null;
                ms = SPIKE_MS;
            } else {
                spikeRun = 0;
            }
            winTime += ms;
            winFrames += 1;
            sinceUpgrade += ms;
            if (winTime < WINDOW_MS) return null;
            const avg = winTime / winFrames;
            resetWindow();

            if (avg > SLOW_FRAME_MS) {
                goodTime = 0;
                // Yükseltmeden kısa süre sonra yine yavaşladıysa: gidip gelme, kilitle.
                if (sinceUpgrade < LOCK_WINDOW_MS) locked = true;
                const next = Math.min(ladder.length - 1, level + (avg > VERY_SLOW_FRAME_MS ? 2 : 1));
                const threshold = next >= firstLow ? LOW_TIER_FRAME_MS : SLOW_FRAME_MS;
                if (next > level && avg > threshold) return setLevel(next);
                return null;
            }
            if (avg <= FAST_FRAME_MS && level > 0 && !locked && upgrades < MAX_UPGRADES) {
                goodTime += WINDOW_MS;
                if (goodTime >= UPGRADE_AFTER_MS) {
                    goodTime = 0;
                    upgrades += 1;
                    sinceUpgrade = 0;
                    return setLevel(level - 1);
                }
            } else {
                goodTime = 0;
            }
            return null;
        },
    };
}
