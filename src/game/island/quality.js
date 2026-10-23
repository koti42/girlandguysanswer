/*
 * Ada sahnesi uyarlamalı kalite (saf mantık).
 *
 * Kademe merdiveni: piksel oranı + görsel ayrıntı düzeyi. Kare süresinin
 * üstel hareketli ortalaması (EMA) uzun süre eşiğin üstünde kalırsa bir
 * kademe inilir; çok yavaşsa iki kademe birden. Yükseltme YOK: gidip gelme
 * (titreme) olmasın; ada sahnesi zaten hafif, düşüş nadir bir güvenlik ağıdır.
 *
 * Örnekler "RAF-RAF aralığı"dır (render atlanan kareler dahil); böylece
 * boşta 30 fps sınırı yavaşlık sanılmaz. Uzun duraklamalar (sekme gizli)
 * sayılmaz.
 */

export const EMA_ALPHA = 0.08;
export const SLOW_MS = 24;
export const VERY_SLOW_MS = 38;
const SPIKE_MS = 120;
const WARMUP_FRAMES = 40;
const COOLDOWN_FRAMES = 75;
const NEED_SLOW_FRAMES = 24;

/**
 * Kademeler: detail 0 = tam, 1 = bulut/kuş azalır, 2 = sis/ışıltı/rüzgâr kapalı,
 * 3 = en sade (bulut 3, kuş 1, balon/uçak yok).
 */
export function buildIslandTiers({ dpr = 1, coarse = false } = {}) {
    const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    const cap = coarse ? 1 : 1.5;
    const r0 = Math.min(d, cap);
    const ratio = (f, floor) => Math.round(Math.max(Math.min(floor, r0), r0 * f) * 100) / 100;
    return [
        { ratio: r0, detail: 0 },
        { ratio: ratio(0.85, 0.9), detail: 1 },
        { ratio: ratio(0.75, 0.8), detail: 2 },
        { ratio: ratio(0.6, 0.65), detail: 3 },
    ];
}

/** 'auto' | 'high' | 'medium' | 'low' (ya da bilinmeyen) -> başlangıç kademesi + uyarlama açık mı. */
export function resolveQualityOption(quality) {
    switch (quality) {
        case 'high':
            return { start: 0, adaptive: false };
        case 'medium':
            return { start: 1, adaptive: true };
        case 'low':
            return { start: 2, adaptive: true };
        default:
            return { start: 0, adaptive: true };
    }
}

export function createIslandQuality({ dpr = 1, coarse = false, quality = 'auto' } = {}) {
    const tiers = buildIslandTiers({ dpr, coarse });
    const opt = resolveQualityOption(quality);
    let level = Math.min(opt.start, tiers.length - 1);
    let ema = 0;
    let frames = 0;
    let sinceChange = 0;
    let slowRun = 0;

    return {
        tiers,
        get level() {
            return level;
        },
        get tier() {
            return tiers[level];
        },
        get ema() {
            return ema;
        },
        /** Kare aralığı besle (ms); kademe değiştiyse yeni kademeyi, yoksa null döner. */
        sample(ms) {
            if (!(ms > 0) || ms > SPIKE_MS) return null;
            frames += 1;
            sinceChange += 1;
            ema = ema === 0 ? ms : ema + (ms - ema) * EMA_ALPHA;
            if (!opt.adaptive || frames < WARMUP_FRAMES || sinceChange < COOLDOWN_FRAMES) return null;
            if (level >= tiers.length - 1) return null;
            if (ema > SLOW_MS) slowRun += 1;
            else slowRun = Math.max(0, slowRun - 2);
            if (slowRun < NEED_SLOW_FRAMES) return null;
            level = Math.min(tiers.length - 1, level + (ema > VERY_SLOW_MS ? 2 : 1));
            slowRun = 0;
            sinceChange = 0;
            return tiers[level];
        },
        /** Duraklatma/sekme dönüşü: ölçümü sıfırdan başlat (ilk kareler sayılmasın). */
        reset() {
            frames = 0;
            sinceChange = 0;
            slowRun = 0;
            ema = 0;
        },
    };
}
