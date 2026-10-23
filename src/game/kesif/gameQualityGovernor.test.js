import { describe, it, expect } from 'vitest';
import {
  createDrawGovernor, CITY_DRAW_HARD, CITY_DRAW_SOFT, CITY_DRAW_BUDGET, CITY_DRAW_TARGET, CITY_TRIS_HARD, CITY_TRIS_SOFT, triangleBudget,
} from './gameQuality.js';

describe('şehir çizim çağrısı yöneticisi (perf_tuner, Faz 5)', () => {
  it('eşikler: soft < hard < hedef < sözleşme tavanı (250); hard ≤ 235 (pay)', () => {
    expect(CITY_DRAW_SOFT).toBeLessThan(CITY_DRAW_HARD);
    expect(CITY_DRAW_HARD).toBeLessThanOrEqual(235);
    expect(CITY_DRAW_HARD).toBeLessThan(CITY_DRAW_TARGET);
    expect(CITY_DRAW_TARGET).toBeLessThan(CITY_DRAW_BUDGET);
  });

  it('bütçe içindeyken çarpan 1 kalır', () => {
    const g = createDrawGovernor();
    for (let i = 0; i < 600; i++) expect(g.update(1 / 60, CITY_DRAW_HARD)).toBe(1);
  });

  it('hard aşılınca çarpan düşer; aşım büyüdükçe daha hızlı düşer; alt sınırda durur', () => {
    const a = createDrawGovernor();
    const b = createDrawGovernor();
    for (let i = 0; i < 10; i++) { a.update(1 / 60, CITY_DRAW_HARD + 4); b.update(1 / 60, CITY_DRAW_HARD + 12); }
    expect(a.scale).toBeLessThan(1);
    expect(b.scale).toBeLessThan(a.scale);
    const c = createDrawGovernor({ minScale: 0.7 });
    for (let i = 0; i < 6000; i++) c.update(1 / 60, 400);
    expect(c.scale).toBeCloseTo(0.7, 6);
  });

  it('soft altına inince yavaşça 1’e döner; ölü bölgede (soft..hard) sabit kalır', () => {
    const g = createDrawGovernor();
    for (let i = 0; i < 30; i++) g.update(1 / 60, CITY_DRAW_HARD + 10);
    const low = g.scale;
    expect(low).toBeLessThan(1);
    for (let i = 0; i < 120; i++) g.update(1 / 60, (CITY_DRAW_SOFT + CITY_DRAW_HARD) / 2);
    expect(g.scale).toBe(low);
    let prev = low;
    for (let i = 0; i < 2000; i++) {
      const s = g.update(1 / 60, CITY_DRAW_SOFT - 20);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(g.scale).toBe(1);
  });

  it('kare hızından bağımsız (30 fps ve 120 fps aynı sürede aynı sonuca yakın)', () => {
    const a = createDrawGovernor();
    const b = createDrawGovernor();
    for (let i = 0; i < 30; i++) a.update(1 / 30, CITY_DRAW_HARD + 6);
    for (let i = 0; i < 120; i++) b.update(1 / 120, CITY_DRAW_HARD + 6);
    expect(Math.abs(a.scale - b.scale)).toBeLessThan(0.01);
  });

  it('NaN / negatif / sonsuz girdi çarpanı bozmaz; reset 1’e döndürür', () => {
    const g = createDrawGovernor();
    for (let i = 0; i < 20; i++) g.update(1 / 60, CITY_DRAW_HARD + 10);
    const s = g.scale;
    [NaN, -1, 0, Infinity].forEach((dt) => expect(g.update(dt, 300)).toBe(s));
    [NaN, Infinity, undefined].forEach((c) => expect(g.update(1 / 60, c)).toBe(s));
    g.reset();
    expect(g.scale).toBe(1);
  });

  it('tek uzun kare (dt büyük) çarpanı sınırlı düşürür (dt ≤ 0,1 sn sayılır)', () => {
    const g = createDrawGovernor();
    g.update(5, CITY_DRAW_HARD + 10);
    expect(g.scale).toBeGreaterThan(0.62);
  });

  it('kapalı döngü: çağrı = taban − 40·(1−çarpan) benzetimi hard çevresinde yerleşir ve titremez', () => {
    const g = createDrawGovernor();
    const base = 246; // sahnenin çarpansız çağrısı
    let calls = base;
    let flips = 0;
    let last = 1;
    for (let i = 0; i < 1800; i++) {
      const s = g.update(1 / 60, calls);
      calls = Math.round(base - 120 * (1 - s));
      if (i > 600 && Math.sign(s - last) !== 0) flips++;
      last = s;
    }
    expect(calls).toBeLessThanOrEqual(CITY_DRAW_HARD + 1);
    expect(calls).toBeGreaterThanOrEqual(CITY_DRAW_SOFT - 2);
    expect(g.scale).toBeGreaterThan(0.8);
    expect(flips).toBeLessThan(40);
  });

  it('üçgen yöneticisi: yüzde birimiyle aynı denetleyici; eşikler bütçenin altında (%88 < %95 < %100); tüm kademelerde bütçe aşımında çarpan düşer', () => {
    expect(CITY_TRIS_SOFT).toBeLessThan(CITY_TRIS_HARD);
    expect(CITY_TRIS_HARD).toBeLessThan(100);
    ['low', 'medium', 'high'].forEach((tier) => {
      const g = createDrawGovernor({ hard: CITY_TRIS_HARD, soft: CITY_TRIS_SOFT, minScale: 0.7 });
      const b = triangleBudget(tier);
      for (let i = 0; i < 20; i++) expect(g.update(1 / 60, (100 * b * 0.9) / b)).toBe(1); // %90: ölü bölge
      for (let i = 0; i < 20; i++) g.update(1 / 60, (100 * b * 1.05) / b); // %105
      expect(g.scale).toBeLessThan(1);
      expect(g.scale).toBeGreaterThanOrEqual(0.7);
    });
  });
});
