/*
 * "Herkesler Koşuyor" desen kütüphanesi v2 (şartname v1 §3.3, v2 §A.1, §A.7).
 *
 * JSON değil JS modülü: `with { type: 'json' }` Metro'da (mobil) çalışmıyor.
 * PHP tarafı (TrackGenerator) bunun kanonik JSON kopyasını okur:
 * `node scripts/runner-golden.mjs` JSON.stringify(bu nesne) metnini backend'e
 * patterns.json olarak yazar; golden.json.patternsHash o metnin FNV-1a'sıdır.
 * Anahtar sırası kanonik metnin parçası: değiştirirsen fikstürleri yeniden üret.
 *
 * Öğeler (chunk içi z ofseti, mm):
 *   {t:'barrier'|'bar'|'car', lane, z}     araba derinliği 4200, üstü 1200
 *   {t:'bus', lane, z, len}                otobüs/tramvay, üstü 2700 (len 8000..20000)
 *   {t:'ramp', lane, z}                    6000 mm; hemen ardından aynı şeritte bus (z + 6000)
 *   {t:'coins', lane, z, n, step, arc, base?}  y = base + 900 (arc: base + ARC[i])
 *   {t:'power', lane, z}                   güçlendirme yuvası (yalnızca ilki, zar tutarsa)
 *
 * Tasarım kuralları patterns.test.js'te (R1–R9); geçilebilirlik bot testlerinde.
 * Dönüştürülen v1 desenleri: block → bus; otobüs sığmayan kısa bloklar araba oldu.
 */
export default {
    version: 2,
    patterns: [
        // ── Katman 0 ─────────────────────────────────────────────────────────
        { id: 'jeton-hatti', minTier: 0, weight: 4, items: [
            { t: 'coins', lane: 1, z: 4000, n: 9, step: 2500, arc: false },
            { t: 'power', lane: 0, z: 15000 },
        ] },
        { id: 'yan-hat', minTier: 0, weight: 3, items: [
            { t: 'coins', lane: 0, z: 4000, n: 9, step: 2500, arc: false },
            { t: 'power', lane: 2, z: 15000 },
        ] },
        { id: 'tek-bariyer', minTier: 0, weight: 5, items: [
            { t: 'barrier', lane: 1, z: 14000 },
            { t: 'coins', lane: 1, z: 9000, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 2, z: 14000 },
        ] },
        { id: 'tek-tabela', minTier: 0, weight: 4, items: [
            { t: 'coins', lane: 1, z: 5000, n: 3, step: 2500, arc: false },
            { t: 'bar', lane: 1, z: 14000 },
            { t: 'coins', lane: 1, z: 13000, n: 3, step: 1000, arc: false },
            { t: 'power', lane: 0, z: 20000 },
        ] },
        { id: 'yan-blok', minTier: 0, weight: 4, items: [
            { t: 'bus', lane: 1, z: 9000, len: 10000 },
            { t: 'coins', lane: 0, z: 8000, n: 5, step: 2500, arc: false },
            { t: 'power', lane: 2, z: 13000 },
        ] },
        { id: 'cift-bariyer', minTier: 0, weight: 3, items: [
            { t: 'barrier', lane: 0, z: 14000 },
            { t: 'barrier', lane: 2, z: 14000 },
            { t: 'coins', lane: 1, z: 6000, n: 8, step: 2500, arc: false },
            { t: 'power', lane: 1, z: 26500 },
        ] },
        { id: 'jeton-zikzak', minTier: 0, weight: 3, items: [
            { t: 'coins', lane: 0, z: 4000, n: 3, step: 2000, arc: false },
            { t: 'coins', lane: 1, z: 11000, n: 3, step: 2000, arc: false },
            { t: 'coins', lane: 2, z: 18000, n: 4, step: 2000, arc: false },
            { t: 'power', lane: 1, z: 24000 },
        ] },
        { id: 'kisa-blok', minTier: 0, weight: 3, items: [
            { t: 'bus', lane: 0, z: 10000, len: 8000 },
            { t: 'barrier', lane: 2, z: 12000 },
            { t: 'coins', lane: 1, z: 8000, n: 6, step: 2000, arc: false },
            { t: 'power', lane: 0, z: 22000 },
        ] },
        // Tek araba: yavaşken çatısına inilir, hızlıyken üstünden aşılır.
        { id: 'araba-atla', minTier: 0, weight: 4, items: [
            { t: 'coins', lane: 1, z: 5000, n: 3, step: 2000, arc: false },
            { t: 'car', lane: 1, z: 12000 },
            { t: 'coins', lane: 1, z: 12500, n: 3, step: 1500, arc: false, base: 1200 },
            { t: 'power', lane: 0, z: 20000 },
        ] },
        // İlk rampa: otobüs çatısına tırman, çatıda jetonlar. Katman 0'da: Koşu 2.0'ın
        // ana yeniliği ilk ~30 sn'de de görülsün (üretici ayrıca chunk 3-5'ten birine
        // bunu zorla koyar, bkz. C.INTRO_RAMP_*).
        { id: 'rampa-cati', minTier: 0, weight: 5, items: [
            { t: 'ramp', lane: 1, z: 9000 },
            { t: 'bus', lane: 1, z: 15000, len: 9000 },
            { t: 'coins', lane: 1, z: 15500, n: 4, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 0, z: 5000, n: 4, step: 2500, arc: false },
            { t: 'power', lane: 0, z: 18000 },
        ] },

        // ── Katman 1 ─────────────────────────────────────────────────────────
        { id: 'bariyer-duvari', minTier: 1, weight: 5, items: [
            { t: 'barrier', lane: 0, z: 14000 },
            { t: 'barrier', lane: 1, z: 14000 },
            { t: 'barrier', lane: 2, z: 14000 },
            { t: 'coins', lane: 1, z: 9000, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 0, z: 22000 },
        ] },
        { id: 'tabela-duvari', minTier: 1, weight: 4, items: [
            { t: 'bar', lane: 0, z: 14000 },
            { t: 'bar', lane: 1, z: 14000 },
            { t: 'bar', lane: 2, z: 14000 },
            { t: 'coins', lane: 1, z: 12000, n: 5, step: 1000, arc: false },
            { t: 'power', lane: 2, z: 22000 },
        ] },
        { id: 'tren-koridoru', minTier: 1, weight: 5, items: [
            { t: 'bus', lane: 0, z: 9000, len: 12000 },
            { t: 'bus', lane: 2, z: 9000, len: 12000 },
            { t: 'coins', lane: 1, z: 9500, n: 5, step: 2500, arc: false },
            { t: 'power', lane: 1, z: 24000 },
        ] },
        { id: 'uclu-secim', minTier: 1, weight: 5, items: [
            { t: 'bar', lane: 0, z: 12000 },
            { t: 'barrier', lane: 1, z: 12000 },
            { t: 'bus', lane: 2, z: 10000, len: 8000 },
            { t: 'coins', lane: 1, z: 7000, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 0, z: 20000 },
        ] },
        { id: 'blok-slalom', minTier: 1, weight: 4, items: [
            { t: 'bus', lane: 1, z: 9000, len: 8000 },
            { t: 'car', lane: 0, z: 20000 },
            { t: 'coins', lane: 0, z: 9000, n: 3, step: 2000, arc: false },
            { t: 'coins', lane: 1, z: 18500, n: 3, step: 2000, arc: false },
            { t: 'power', lane: 2, z: 15000 },
        ] },
        { id: 'yayli-blok', minTier: 1, weight: 4, items: [
            { t: 'bus', lane: 1, z: 9000, len: 10000 },
            { t: 'barrier', lane: 0, z: 14000 },
            { t: 'barrier', lane: 2, z: 14000 },
            { t: 'coins', lane: 0, z: 9000, n: 8, step: 1500, arc: true },
            { t: 'coins', lane: 2, z: 9000, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 1, z: 24000 },
        ] },
        { id: 'merdiven', minTier: 1, weight: 3, items: [
            { t: 'bus', lane: 0, z: 9000, len: 8000 },
            { t: 'bus', lane: 1, z: 16000, len: 8000 },
            { t: 'coins', lane: 1, z: 9500, n: 2, step: 2500, arc: false },
            { t: 'coins', lane: 0, z: 18500, n: 3, step: 2500, arc: false },
            { t: 'power', lane: 2, z: 9500 },
        ] },
        { id: 'guc-cebi', minTier: 1, weight: 3, items: [
            { t: 'barrier', lane: 1, z: 9000 },
            { t: 'coins', lane: 1, z: 4000, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 1, z: 17000 },
            { t: 'bus', lane: 0, z: 12000, len: 8000 },
            { t: 'bar', lane: 2, z: 16000 },
        ] },
        { id: 'miknatis-yolu', minTier: 1, weight: 3, items: [
            { t: 'coins', lane: 0, z: 4000, n: 5, step: 5000, arc: false },
            { t: 'coins', lane: 2, z: 4000, n: 5, step: 5000, arc: false },
            { t: 'coins', lane: 1, z: 6500, n: 4, step: 5000, arc: false },
            { t: 'power', lane: 1, z: 14000 },
        ] },
        // Üç arabalık sıra: üstüne çık, çatılarda jeton topla.
        { id: 'araba-sirasi', minTier: 1, weight: 4, items: [
            { t: 'car', lane: 0, z: 9000 },
            { t: 'car', lane: 0, z: 13200 },
            { t: 'car', lane: 0, z: 17400 },
            { t: 'coins', lane: 0, z: 9500, n: 7, step: 2000, arc: false, base: 1200 },
            { t: 'coins', lane: 1, z: 4000, n: 4, step: 2500, arc: false },
            { t: 'power', lane: 2, z: 14000 },
        ] },
        { id: 'araba-slalom', minTier: 1, weight: 3, items: [
            { t: 'car', lane: 0, z: 9000 },
            { t: 'car', lane: 2, z: 9000 },
            { t: 'car', lane: 1, z: 18000 },
            { t: 'coins', lane: 1, z: 9500, n: 4, step: 2000, arc: false },
            { t: 'coins', lane: 0, z: 18500, n: 3, step: 1500, arc: false },
            { t: 'power', lane: 2, z: 20000 },
        ] },
        { id: 'araba-dizisi', minTier: 1, weight: 3, items: [
            { t: 'car', lane: 0, z: 9000 },
            { t: 'car', lane: 1, z: 14000 },
            { t: 'car', lane: 2, z: 19000 },
            { t: 'coins', lane: 0, z: 9500, n: 2, step: 2000, arc: false, base: 1200 },
            { t: 'coins', lane: 1, z: 14500, n: 2, step: 2000, arc: false, base: 1200 },
            { t: 'coins', lane: 2, z: 19500, n: 2, step: 2000, arc: false, base: 1200 },
            { t: 'power', lane: 1, z: 24000 },
        ] },

        // ── Katman 2 ─────────────────────────────────────────────────────────
        { id: 'zikzak', minTier: 2, weight: 6, items: [
            { t: 'bar', lane: 0, z: 4500 },
            { t: 'bus', lane: 1, z: 9000, len: 8000 },
            { t: 'bus', lane: 2, z: 9000, len: 8000 },
            { t: 'car', lane: 0, z: 20000 },
            { t: 'coins', lane: 0, z: 9500, n: 2, step: 2500, arc: false },
            { t: 'coins', lane: 1, z: 18500, n: 4, step: 2000, arc: false },
            { t: 'power', lane: 2, z: 24000 },
        ] },
        { id: 'odul-yolu', minTier: 2, weight: 4, items: [
            { t: 'barrier', lane: 2, z: 9000 },
            { t: 'coins', lane: 2, z: 4000, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 2, z: 15000 },
            { t: 'barrier', lane: 2, z: 20500 },
            { t: 'coins', lane: 2, z: 15500, n: 8, step: 1500, arc: true },
            { t: 'bus', lane: 1, z: 12000, len: 8000 },
        ] },
        { id: 'uc-sira', minTier: 2, weight: 4, items: [
            { t: 'barrier', lane: 0, z: 9000 },
            { t: 'barrier', lane: 1, z: 9000 },
            { t: 'barrier', lane: 2, z: 9000 },
            { t: 'barrier', lane: 0, z: 21500 },
            { t: 'barrier', lane: 1, z: 21500 },
            { t: 'barrier', lane: 2, z: 21500 },
            { t: 'coins', lane: 1, z: 4000, n: 8, step: 1500, arc: true },
            { t: 'coins', lane: 1, z: 16500, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 0, z: 15500 },
        ] },
        { id: 'capraz', minTier: 2, weight: 4, items: [
            { t: 'bus', lane: 1, z: 9000, len: 8000 },
            { t: 'barrier', lane: 0, z: 10000 },
            { t: 'bar', lane: 2, z: 10000 },
            { t: 'barrier', lane: 0, z: 23000 },
            { t: 'coins', lane: 0, z: 5000, n: 8, step: 1500, arc: true },
            { t: 'coins', lane: 2, z: 13000, n: 4, step: 2500, arc: false },
            { t: 'power', lane: 1, z: 19000 },
        ] },
        { id: 'tren-bariyer', minTier: 2, weight: 5, items: [
            { t: 'bus', lane: 0, z: 9000, len: 12000 },
            { t: 'bus', lane: 2, z: 9000, len: 12000 },
            { t: 'barrier', lane: 1, z: 14000 },
            { t: 'coins', lane: 1, z: 9000, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 1, z: 23000 },
        ] },
        { id: 'tren-tabela', minTier: 2, weight: 5, items: [
            { t: 'bus', lane: 0, z: 9000, len: 12000 },
            { t: 'bus', lane: 2, z: 9000, len: 12000 },
            { t: 'bar', lane: 1, z: 15000 },
            { t: 'coins', lane: 1, z: 13000, n: 5, step: 1000, arc: false },
            { t: 'power', lane: 1, z: 23000 },
        ] },
        { id: 'neon-sokak', minTier: 2, weight: 4, items: [
            { t: 'barrier', lane: 0, z: 9000 },
            { t: 'barrier', lane: 1, z: 15000 },
            { t: 'barrier', lane: 2, z: 21000 },
            { t: 'coins', lane: 0, z: 13000, n: 4, step: 2500, arc: false },
            { t: 'coins', lane: 1, z: 4000, n: 4, step: 2500, arc: false },
            { t: 'coins', lane: 2, z: 4000, n: 4, step: 2500, arc: false },
            { t: 'power', lane: 1, z: 22000 },
        ] },
        { id: 'kiosk-dizisi', minTier: 2, weight: 4, items: [
            { t: 'bus', lane: 0, z: 9000, len: 8000 },
            { t: 'bus', lane: 2, z: 9000, len: 8000 },
            { t: 'car', lane: 1, z: 21000 },
            { t: 'coins', lane: 1, z: 9500, n: 2, step: 2500, arc: false },
            { t: 'coins', lane: 0, z: 18500, n: 3, step: 2500, arc: false },
            { t: 'power', lane: 2, z: 19000 },
        ] },
        // Rampa → çatı → çatıda jeton → çatıdan atlayıp havadaki yayı topla.
        { id: 'cati-atlayisi', minTier: 2, weight: 4, items: [
            { t: 'ramp', lane: 1, z: 9000 },
            { t: 'bus', lane: 1, z: 15000, len: 8000 },
            { t: 'coins', lane: 1, z: 15500, n: 3, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 1, z: 21000, n: 5, step: 1500, arc: true, base: 2700 },
            { t: 'car', lane: 2, z: 14000 },
            { t: 'power', lane: 0, z: 12000 },
        ] },
        // Araba çatısından otobüs çatısına zıpla (1200 + 1470 ≥ 2700 - 200).
        { id: 'araba-otobus-zinciri', minTier: 2, weight: 4, items: [
            { t: 'car', lane: 2, z: 5000 },
            { t: 'car', lane: 2, z: 9200 },
            { t: 'bus', lane: 2, z: 16000, len: 8000 },
            { t: 'coins', lane: 2, z: 5500, n: 4, step: 2000, arc: false, base: 1200 },
            { t: 'coins', lane: 2, z: 16500, n: 4, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 1, z: 6000, n: 6, step: 2500, arc: false },
            { t: 'power', lane: 0, z: 14000 },
        ] },
        // Süper Zıplama ödülü: rampasız otobüsün önünde yüksek yay ve çatıda jetonlar.
        { id: 'super-yay', minTier: 2, weight: 3, items: [
            { t: 'power', lane: 1, z: 4000 },
            { t: 'bus', lane: 1, z: 12000, len: 10000 },
            { t: 'coins', lane: 1, z: 9000, n: 6, step: 1000, arc: true, base: 1500 },
            { t: 'coins', lane: 1, z: 15500, n: 3, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 0, z: 9000, n: 5, step: 2500, arc: false },
        ] },
        // Yan yana iki çatı: rampadan çık, komşu otobüsün çatısına geç.
        { id: 'cati-gecidi', minTier: 2, weight: 3, items: [
            { t: 'ramp', lane: 0, z: 9000 },
            { t: 'bus', lane: 0, z: 15000, len: 9000 },
            { t: 'bus', lane: 1, z: 15000, len: 9000 },
            { t: 'coins', lane: 0, z: 15500, n: 2, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 1, z: 18000, n: 3, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 2, z: 9000, n: 6, step: 2500, arc: false },
            { t: 'power', lane: 2, z: 5000 },
        ] },
        // Araba basamağı: arabanın çatısından otobüse (yavaşken).
        { id: 'basamak', minTier: 2, weight: 3, items: [
            { t: 'car', lane: 1, z: 3000 },
            { t: 'bus', lane: 1, z: 9200, len: 8000 },
            { t: 'coins', lane: 1, z: 3500, n: 2, step: 2000, arc: false, base: 1200 },
            { t: 'coins', lane: 1, z: 10000, n: 4, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 2, z: 9000, n: 5, step: 2500, arc: false },
            { t: 'power', lane: 0, z: 14000 },
        ] },

        // ── Katman 3 ─────────────────────────────────────────────────────────
        { id: 'satranc', minTier: 3, weight: 5, items: [
            { t: 'barrier', lane: 0, z: 9000 },
            { t: 'bar', lane: 1, z: 9000 },
            { t: 'bar', lane: 2, z: 9000 },
            { t: 'car', lane: 0, z: 18000 },
            { t: 'barrier', lane: 1, z: 18000 },
            { t: 'bar', lane: 2, z: 18000 },
            { t: 'coins', lane: 2, z: 11000, n: 3, step: 2000, arc: false },
            { t: 'power', lane: 1, z: 13500 },
        ] },
        { id: 'cift-tren', minTier: 3, weight: 5, items: [
            { t: 'bus', lane: 0, z: 9000, len: 15000 },
            { t: 'bus', lane: 1, z: 9000, len: 8000 },
            { t: 'car', lane: 2, z: 20000 },
            { t: 'coins', lane: 2, z: 9500, n: 3, step: 2000, arc: false },
            { t: 'coins', lane: 1, z: 18500, n: 3, step: 2000, arc: false },
            { t: 'power', lane: 1, z: 22500 },
        ] },
        { id: 'ritim-koridor', minTier: 3, weight: 5, items: [
            { t: 'barrier', lane: 1, z: 4000 },
            { t: 'bus', lane: 0, z: 9000, len: 12000 },
            { t: 'bus', lane: 2, z: 9000, len: 12000 },
            { t: 'bar', lane: 1, z: 26000 },
            { t: 'coins', lane: 1, z: 9500, n: 5, step: 2500, arc: false },
            { t: 'power', lane: 1, z: 22000 },
        ] },
        { id: 'slalom-hizli', minTier: 3, weight: 5, items: [
            { t: 'bus', lane: 1, z: 9000, len: 8000 },
            { t: 'car', lane: 0, z: 20000 },
            { t: 'car', lane: 2, z: 20000 },
            { t: 'coins', lane: 0, z: 9500, n: 2, step: 2500, arc: false },
            { t: 'coins', lane: 1, z: 18500, n: 3, step: 2500, arc: false },
            { t: 'power', lane: 2, z: 12000 },
        ] },
        { id: 'cift-bariyer-ritim', minTier: 3, weight: 5, items: [
            { t: 'bus', lane: 0, z: 9000, len: 14000 },
            { t: 'bus', lane: 2, z: 9000, len: 14000 },
            { t: 'barrier', lane: 1, z: 9500 },
            { t: 'barrier', lane: 1, z: 21500 },
            { t: 'coins', lane: 1, z: 4500, n: 8, step: 1500, arc: true },
            { t: 'coins', lane: 1, z: 16500, n: 8, step: 1500, arc: true },
            { t: 'power', lane: 1, z: 15800 },
        ] },
        { id: 'kayma-koridor', minTier: 3, weight: 4, items: [
            { t: 'bus', lane: 0, z: 9000, len: 14000 },
            { t: 'bus', lane: 2, z: 9000, len: 14000 },
            { t: 'bar', lane: 1, z: 11000 },
            { t: 'bar', lane: 1, z: 20000 },
            { t: 'coins', lane: 1, z: 10000, n: 5, step: 1000, arc: false },
            { t: 'coins', lane: 1, z: 19000, n: 4, step: 1000, arc: false },
            { t: 'power', lane: 1, z: 15500 },
        ] },
        { id: 'karisik-duvar', minTier: 3, weight: 5, items: [
            { t: 'barrier', lane: 0, z: 9000 },
            { t: 'bar', lane: 1, z: 9000 },
            { t: 'barrier', lane: 2, z: 9000 },
            { t: 'barrier', lane: 0, z: 21000 },
            { t: 'bar', lane: 1, z: 21000 },
            { t: 'barrier', lane: 2, z: 21000 },
            { t: 'coins', lane: 0, z: 4000, n: 8, step: 1500, arc: true },
            { t: 'coins', lane: 2, z: 16000, n: 8, step: 1500, arc: true },
            { t: 'coins', lane: 1, z: 7500, n: 3, step: 1500, arc: false },
            { t: 'power', lane: 1, z: 15000 },
        ] },
        // Tramvay hattı: iki yanda uzun tramvaylar, ortada rampa — tek yol çatıdan.
        { id: 'tramvay-hatti', minTier: 3, weight: 5, items: [
            { t: 'ramp', lane: 1, z: 9000 },
            { t: 'bus', lane: 1, z: 15000, len: 9000 },
            { t: 'bus', lane: 0, z: 12000, len: 12000 },
            { t: 'bus', lane: 2, z: 12000, len: 12000 },
            { t: 'coins', lane: 1, z: 15500, n: 4, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 0, z: 14000, n: 4, step: 2500, arc: false, base: 2700 },
            { t: 'coins', lane: 2, z: 14000, n: 4, step: 2500, arc: false, base: 2700 },
            { t: 'power', lane: 1, z: 5000 },
        ] },
        { id: 'kavsak', minTier: 3, weight: 4, items: [
            { t: 'bus', lane: 0, z: 9000, len: 8000 },
            { t: 'car', lane: 1, z: 12000 },
            { t: 'barrier', lane: 2, z: 12000 },
            { t: 'barrier', lane: 2, z: 22000 },
            { t: 'coins', lane: 1, z: 12500, n: 3, step: 1500, arc: false, base: 1200 },
            { t: 'coins', lane: 2, z: 16000, n: 3, step: 2000, arc: false },
            { t: 'power', lane: 0, z: 21000 },
        ] },
        { id: 'cift-rampa', minTier: 3, weight: 4, items: [
            { t: 'ramp', lane: 0, z: 9000 },
            { t: 'bus', lane: 0, z: 15000, len: 9000 },
            { t: 'ramp', lane: 2, z: 9000 },
            { t: 'bus', lane: 2, z: 15000, len: 9000 },
            { t: 'barrier', lane: 1, z: 12000 },
            { t: 'car', lane: 1, z: 21000 },
            { t: 'coins', lane: 0, z: 16000, n: 4, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 2, z: 16000, n: 4, step: 2000, arc: false, base: 2700 },
            { t: 'power', lane: 1, z: 5000 },
        ] },
        // Süper Zıplamayla tramvayların arasından yükseğe: yay yalnızca süperle tam toplanır.
        { id: 'super-cati', minTier: 3, weight: 3, items: [
            { t: 'power', lane: 1, z: 5000 },
            { t: 'bus', lane: 0, z: 9000, len: 12000 },
            { t: 'bus', lane: 2, z: 9000, len: 12000 },
            { t: 'bar', lane: 1, z: 11000 },
            { t: 'bar', lane: 1, z: 20000 },
            { t: 'coins', lane: 1, z: 13500, n: 5, step: 1000, arc: true, base: 1500 },
            { t: 'coins', lane: 0, z: 12000, n: 4, step: 2500, arc: false, base: 2700 },
        ] },

        // ── Katman 4 ─────────────────────────────────────────────────────────
        { id: 'tren-zikzak', minTier: 4, weight: 7, items: [
            { t: 'bar', lane: 0, z: 4000 },
            { t: 'bus', lane: 1, z: 9000, len: 8000 },
            { t: 'bus', lane: 2, z: 9000, len: 8000 },
            { t: 'barrier', lane: 0, z: 13000 },
            { t: 'car', lane: 0, z: 21500 },
            { t: 'coins', lane: 0, z: 9500, n: 2, step: 2500, arc: false },
            { t: 'coins', lane: 1, z: 18500, n: 3, step: 2500, arc: false },
            { t: 'power', lane: 0, z: 16500 },
        ] },
        { id: 'kapan', minTier: 4, weight: 6, items: [
            { t: 'bus', lane: 0, z: 9000, len: 15000 },
            { t: 'bus', lane: 2, z: 12000, len: 12000 },
            { t: 'bar', lane: 1, z: 13000 },
            { t: 'barrier', lane: 1, z: 23000 },
            { t: 'coins', lane: 1, z: 12500, n: 4, step: 1000, arc: false },
            { t: 'coins', lane: 1, z: 17500, n: 3, step: 1500, arc: false },
            { t: 'power', lane: 2, z: 9500 },
        ] },
        { id: 'tam-gaz', minTier: 4, weight: 6, items: [
            { t: 'bus', lane: 0, z: 9000, len: 8000 },
            { t: 'barrier', lane: 1, z: 9000 },
            { t: 'bus', lane: 2, z: 16000, len: 8000 },
            { t: 'barrier', lane: 1, z: 20000 },
            { t: 'coins', lane: 2, z: 9500, n: 3, step: 2000, arc: false },
            { t: 'coins', lane: 0, z: 18500, n: 3, step: 2500, arc: false },
            { t: 'power', lane: 1, z: 14500 },
        ] },
        { id: 'bariyer-kosusu', minTier: 4, weight: 6, items: [
            { t: 'barrier', lane: 0, z: 4000 },
            { t: 'bus', lane: 1, z: 9000, len: 10000 },
            { t: 'bar', lane: 2, z: 10000 },
            { t: 'barrier', lane: 0, z: 15000 },
            { t: 'barrier', lane: 2, z: 21000 },
            { t: 'barrier', lane: 0, z: 26000 },
            { t: 'coins', lane: 0, z: 10000, n: 8, step: 1500, arc: true },
            { t: 'coins', lane: 2, z: 12500, n: 3, step: 2000, arc: false },
            { t: 'power', lane: 1, z: 22000 },
        ] },
        { id: 'mega-odul', minTier: 4, weight: 5, items: [
            { t: 'bar', lane: 1, z: 4500 },
            { t: 'coins', lane: 1, z: 3500, n: 3, step: 1000, arc: false },
            { t: 'power', lane: 1, z: 8000 },
            { t: 'barrier', lane: 1, z: 15000 },
            { t: 'coins', lane: 1, z: 10000, n: 8, step: 1500, arc: true },
            { t: 'barrier', lane: 1, z: 26000 },
            { t: 'coins', lane: 1, z: 22000, n: 2, step: 1500, arc: false },
            { t: 'bus', lane: 0, z: 9000, len: 8000 },
        ] },
        { id: 'rampa-zikzak', minTier: 4, weight: 5, items: [
            { t: 'ramp', lane: 0, z: 9000 },
            { t: 'bus', lane: 0, z: 15000, len: 9000 },
            { t: 'bus', lane: 2, z: 9000, len: 12000 },
            { t: 'bar', lane: 1, z: 12000 },
            { t: 'car', lane: 1, z: 21000 },
            { t: 'coins', lane: 0, z: 15500, n: 4, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 1, z: 4000, n: 3, step: 2000, arc: false },
            { t: 'power', lane: 1, z: 17000 },
        ] },
        // Tramvay kavşağı: ortadaki rampa tek çıkış; çatıdan çatıya geçerek tüm jetonlar.
        { id: 'tramvay-kavsagi', minTier: 4, weight: 5, items: [
            { t: 'ramp', lane: 1, z: 9000 },
            { t: 'bus', lane: 1, z: 15000, len: 9000 },
            { t: 'bus', lane: 0, z: 9000, len: 12000 },
            { t: 'bus', lane: 2, z: 11000, len: 13000 },
            { t: 'coins', lane: 1, z: 15500, n: 4, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 0, z: 16000, n: 3, step: 2000, arc: false, base: 2700 },
            { t: 'coins', lane: 2, z: 17000, n: 3, step: 2000, arc: false, base: 2700 },
            { t: 'power', lane: 1, z: 4000 },
        ] },
        { id: 'trafik', minTier: 4, weight: 5, items: [
            { t: 'car', lane: 0, z: 9000 },
            { t: 'car', lane: 1, z: 9000 },
            { t: 'bus', lane: 2, z: 9000, len: 10000 },
            { t: 'car', lane: 1, z: 21500 },
            { t: 'coins', lane: 0, z: 9500, n: 2, step: 2000, arc: false, base: 1200 },
            { t: 'coins', lane: 1, z: 22000, n: 2, step: 1500, arc: false, base: 1200 },
            { t: 'coins', lane: 0, z: 16000, n: 4, step: 2500, arc: false },
            { t: 'power', lane: 0, z: 26000 },
        ] },
    ],
};
