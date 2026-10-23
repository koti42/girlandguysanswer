import { describe, expect, it } from 'vitest';
import {
    MAX_VIEW_OFFSET,
    clampViewOffset,
    coverToViewOffset,
    stepViewOffset,
    visibleFraction,
} from './viewOffset.js';
import { frameMetrics } from './scene.js';

describe('clampViewOffset / visibleFraction', () => {
    it('geçersiz değerler 0; üst sınır uygulanır', () => {
        for (const v of [undefined, null, NaN, Infinity, -0.2, 0, 'abc', {}]) {
            // Infinity sınırlanır (sonlu sayı değil -> 0)
            expect(clampViewOffset(v)).toBe(0);
        }
        expect(clampViewOffset(0.2)).toBe(0.2);
        expect(clampViewOffset('0.1')).toBe(0.1);
        expect(clampViewOffset(9)).toBe(MAX_VIEW_OFFSET);
    });

    it('görünür kesir = 1 - 2y ve hiçbir zaman 0.28 altına inmez', () => {
        expect(visibleFraction(0)).toBe(1);
        expect(visibleFraction(0.25)).toBeCloseTo(0.5, 10);
        expect(visibleFraction(5)).toBeCloseTo(1 - 2 * MAX_VIEW_OFFSET, 10);
        expect(visibleFraction(5)).toBeGreaterThanOrEqual(0.28 - 1e-9);
    });
});

describe('coverToViewOffset', () => {
    it('kartın kapladığı kesrin yarısı (görünür bölgenin ortası)', () => {
        expect(coverToViewOffset(300, 600)).toBeCloseTo(0.25, 10); // alttan %50 kapalı -> merkez %25 yukarı
        expect(coverToViewOffset(120, 600)).toBeCloseTo(0.1, 10);
    });

    it('örtü yok / geçersiz ölçü -> 0; çok büyük örtü sınırlanır', () => {
        expect(coverToViewOffset(0, 600)).toBe(0);
        expect(coverToViewOffset(-5, 600)).toBe(0);
        expect(coverToViewOffset(100, 0)).toBe(0);
        expect(coverToViewOffset(NaN, 600)).toBe(0);
        expect(coverToViewOffset(100, NaN)).toBe(0);
        expect(coverToViewOffset(900, 600)).toBe(MAX_VIEW_OFFSET);
    });
});

describe('stepViewOffset', () => {
    it('hedefe monoton yaklaşır ve tam hedefte durur', () => {
        let cur = 0;
        let prev = -1;
        for (let i = 0; i < 400; i++) {
            cur = stepViewOffset(cur, 0.25, 1 / 60);
            expect(cur).toBeGreaterThanOrEqual(prev);
            expect(cur).toBeLessThanOrEqual(0.25);
            prev = cur;
        }
        expect(cur).toBe(0.25);
        // geri dönüş (sıfırlama) de yumuşak
        const down = stepViewOffset(0.25, 0, 1 / 60);
        expect(down).toBeLessThan(0.25);
        expect(down).toBeGreaterThan(0);
    });

    it('immediate hedefe atlar; dt <= 0 yerinde bırakır; geçersiz girdi güvenli', () => {
        expect(stepViewOffset(0, 0.2, 0.016, { immediate: true })).toBe(0.2);
        expect(stepViewOffset(0.1, 0.2, 0)).toBe(0.1);
        expect(stepViewOffset(NaN, 0.2, 0.016)).toBeGreaterThan(0);
        expect(stepViewOffset(0, 99, 0.016, { immediate: true })).toBe(MAX_VIEW_OFFSET);
    });

    it('uzun kare süresi kırpılır, hedefi aşmaz', () => {
        const jump = stepViewOffset(0, 0.2, 5);
        expect(jump).toBeLessThanOrEqual(0.2);
        expect(jump).toBeGreaterThan(0.15);
    });
});

describe('frameMetrics: görünür bölgeye göre kamera uzaklığı', () => {
    it('visible=1 öncekiyle aynı; küçük görünür bölge ada sığsın diye uzaklaşır', () => {
        const base = frameMetrics(390, 591);
        expect(frameMetrics(390, 591, 1)).toEqual(base);
        const half = frameMetrics(390, 591, 0.5);
        expect(half.dist).toBeGreaterThanOrEqual(base.dist);
        // Ada yüksekliği (≈ 2*4.3) görünür bölgeye sığar
        expect(half.visibleHeight * 0.5).toBeGreaterThanOrEqual(2 * 4.3 - 1e-6);
    });

    it('geniş ekranda (yükseklik belirleyici) görünür bölge küçülünce dist büyür', () => {
        const base = frameMetrics(1200, 560);
        const small = frameMetrics(1200, 560, 0.5);
        expect(small.dist).toBeGreaterThan(base.dist);
    });

    it('aşırı küçük / geçersiz visible güvenle sınırlanır', () => {
        for (const v of [0, -1, NaN, 5]) {
            const m = frameMetrics(390, 591, v);
            expect(Number.isFinite(m.dist) && m.dist > 0).toBe(true);
        }
    });
});
