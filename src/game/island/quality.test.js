import { describe, expect, it } from 'vitest';
import { SLOW_MS, VERY_SLOW_MS, buildIslandTiers, createIslandQuality, resolveQualityOption } from './quality.js';

function feed(q, ms, frames) {
    let changed = null;
    for (let i = 0; i < frames; i++) {
        const r = q.sample(ms);
        if (r) changed = r;
    }
    return changed;
}

describe('buildIslandTiers', () => {
    it('oran azalan, ayrıntı artan; dpr üst sınırı (masaüstü 1.5, dokunmatik 1)', () => {
        const t = buildIslandTiers({ dpr: 3, coarse: false });
        expect(t[0].ratio).toBe(1.5);
        const c = buildIslandTiers({ dpr: 3, coarse: true });
        expect(c[0].ratio).toBe(1);
        for (const tiers of [t, c]) {
            for (let i = 1; i < tiers.length; i++) {
                expect(tiers[i].ratio).toBeLessThanOrEqual(tiers[i - 1].ratio);
                expect(tiers[i].detail).toBe(i);
            }
            expect(tiers.every((x) => x.ratio > 0)).toBe(true);
        }
    });
    it('düşük dpr taban oranı aşmaz; geçersiz dpr 1 sayılır', () => {
        const t = buildIslandTiers({ dpr: 1 });
        expect(t[0].ratio).toBe(1);
        expect(t[3].ratio).toBeLessThanOrEqual(1);
        expect(buildIslandTiers({ dpr: NaN })[0].ratio).toBe(1);
        expect(buildIslandTiers({ dpr: 0.5 })[0].ratio).toBe(0.5);
    });
});

describe('resolveQualityOption', () => {
    it('seçenekleri başlangıç kademesine çevirir', () => {
        expect(resolveQualityOption('high')).toEqual({ start: 0, adaptive: false });
        expect(resolveQualityOption('medium')).toEqual({ start: 1, adaptive: true });
        expect(resolveQualityOption('low')).toEqual({ start: 2, adaptive: true });
        expect(resolveQualityOption('auto')).toEqual({ start: 0, adaptive: true });
        expect(resolveQualityOption(undefined)).toEqual({ start: 0, adaptive: true });
        expect(resolveQualityOption('bilinmeyen')).toEqual({ start: 0, adaptive: true });
    });
});

describe('createIslandQuality', () => {
    it('hızlı kareler kademeyi düşürmez', () => {
        const q = createIslandQuality({ dpr: 2 });
        expect(feed(q, 16.7, 2000)).toBeNull();
        expect(q.level).toBe(0);
        expect(q.ema).toBeCloseTo(16.7, 1);
    });

    it('uzun süre yavaş kareler bir kademe düşürür; ısınma ve bekleme süresi var', () => {
        const q = createIslandQuality({ dpr: 2 });
        // ısınma: ilk 40 karede asla değişmez
        expect(feed(q, 30, 39)).toBeNull();
        const changed = feed(q, 30, 70); // 109 kare: ilk kademe düşüşü (bekleme süresi ≈ 75 kare)
        expect(changed).not.toBeNull();
        expect(q.level).toBe(1);
        expect(changed.detail).toBe(1);
    });

    it('çok yavaşsa iki kademe birden iner; en alt kademede durur', () => {
        const q = createIslandQuality({ dpr: 2 });
        feed(q, VERY_SLOW_MS + 10, 300);
        expect(q.level).toBeGreaterThanOrEqual(2);
        feed(q, 60, 5000);
        expect(q.level).toBe(q.tiers.length - 1);
        expect(feed(q, 60, 500)).toBeNull();
    });

    it('yükseltme yok: hızlanınca kademe geri gelmez', () => {
        const q = createIslandQuality({ dpr: 2 });
        feed(q, 30, 300);
        const level = q.level;
        feed(q, 8, 5000);
        expect(q.level).toBe(level);
    });

    it('tek tük takılma (spike) ve duraklama sayılmaz', () => {
        const q = createIslandQuality({ dpr: 2 });
        feed(q, 16, 100);
        for (let i = 0; i < 20; i++) {
            q.sample(500); // sekme gizliyken uzun aralık
            feed(q, 16, 10);
        }
        expect(q.level).toBe(0);
        expect(q.sample(0)).toBeNull();
        expect(q.sample(-5)).toBeNull();
        expect(q.sample(NaN)).toBeNull();
    });

    it('eşik civarı: SLOW_MS altında kalan ortalama düşürmez', () => {
        const q = createIslandQuality({ dpr: 2 });
        expect(feed(q, SLOW_MS - 2, 3000)).toBeNull();
    });

    it("quality 'high' uyarlanmaz; 'low' kademe 2'den başlar", () => {
        const h = createIslandQuality({ dpr: 2, quality: 'high' });
        expect(feed(h, 80, 2000)).toBeNull();
        expect(h.level).toBe(0);
        const l = createIslandQuality({ dpr: 2, quality: 'low' });
        expect(l.level).toBe(2);
        expect(l.tier.detail).toBe(2);
    });

    it('reset ölçümü sıfırlar (ısınma yeniden başlar)', () => {
        const q = createIslandQuality({ dpr: 2 });
        feed(q, 16, 100);
        q.reset();
        expect(q.ema).toBe(0);
        expect(feed(q, 40, 39)).toBeNull();
    });

    it('deterministik', () => {
        const run = () => {
            const q = createIslandQuality({ dpr: 2 });
            const levels = [];
            for (let i = 0; i < 600; i++) {
                q.sample(i % 3 === 0 ? 40 : 18);
                levels.push(q.level);
            }
            return levels;
        };
        expect(run()).toEqual(run());
    });
});
