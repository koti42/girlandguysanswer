import { describe, expect, it } from 'vitest';
import { createNoise } from './noise.js';

function sample(fn, n = 20000) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    const v = fn(i);
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sum2 += v * v;
  }
  const mean = sum / n;
  return { min, max, mean, std: Math.sqrt(sum2 / n - mean * mean) };
}

describe('createNoise belirlenimcilik', () => {
  it('aynı tohum aynı değerler (tüm fonksiyonlar)', () => {
    const a = createNoise(1234);
    const b = createNoise(1234);
    for (let i = 0; i < 300; i++) {
      const x = i * 0.173 - 20;
      const y = i * 0.091 + 3;
      const z = i * 0.057 - 7;
      expect(a.simplex2(x, y)).toBe(b.simplex2(x, y));
      expect(a.simplex3(x, y, z)).toBe(b.simplex3(x, y, z));
      expect(a.fbm2(x, y)).toBe(b.fbm2(x, y));
      expect(a.fbm3(x, y, z, 3)).toBe(b.fbm3(x, y, z, 3));
      expect(a.ridged2(x, y)).toBe(b.ridged2(x, y));
      expect(a.ridged3(x, y, z)).toBe(b.ridged3(x, y, z));
      expect(a.worley2(x, y)).toBe(b.worley2(x, y));
      expect(a.worley2Edge(x, y)).toBe(b.worley2Edge(x, y));
      expect(a.worley2Cell(x, y)).toBe(b.worley2Cell(x, y));
    }
  });
  it('çağrı sırası sonucu etkilemez (durumsuz)', () => {
    const a = createNoise(5);
    const first = a.worley2(1.3, 2.7);
    a.worley2(50, 50);
    a.simplex2(9, 9);
    expect(a.worley2(1.3, 2.7)).toBe(first);
  });
  it('farklı tohum farklı alan; metin tohumu çalışır', () => {
    const a = createNoise(1);
    const b = createNoise(2);
    let diff = 0;
    for (let i = 0; i < 200; i++) if (a.simplex2(i * 0.31, i * 0.17) !== b.simplex2(i * 0.31, i * 0.17)) diff++;
    expect(diff).toBeGreaterThan(190);
    expect(createNoise('dünya').simplex2(1.1, 2.2)).toBe(createNoise('dünya').simplex2(1.1, 2.2));
  });
});

describe('createNoise değer aralıkları', () => {
  const n = createNoise(99);
  it('simplex2 ~[-1,1], ortalama ~0, gerçekten değişken', () => {
    const s = sample((i) => n.simplex2(i * 0.37 - 3000, i * 0.113 + 17));
    expect(s.min).toBeGreaterThanOrEqual(-1.02);
    expect(s.max).toBeLessThanOrEqual(1.02);
    expect(Math.abs(s.mean)).toBeLessThan(0.05);
    expect(s.std).toBeGreaterThan(0.2);
    expect(s.min).toBeLessThan(-0.7);
    expect(s.max).toBeGreaterThan(0.7);
  });
  it('simplex3 ~[-1,1]', () => {
    const s = sample((i) => n.simplex3(i * 0.37, i * 0.113 - 40, i * 0.071 + 9));
    expect(s.min).toBeGreaterThanOrEqual(-1.02);
    expect(s.max).toBeLessThanOrEqual(1.02);
    expect(Math.abs(s.mean)).toBeLessThan(0.05);
    expect(s.std).toBeGreaterThan(0.2);
  });
  it('fbm2/fbm3 normalize [-1,1]', () => {
    const s2 = sample((i) => n.fbm2(i * 0.07, i * 0.031, 5));
    expect(s2.min).toBeGreaterThanOrEqual(-1.02);
    expect(s2.max).toBeLessThanOrEqual(1.02);
    const s3 = sample((i) => n.fbm3(i * 0.07, i * 0.031, i * 0.013, 4, 2.1, 0.45));
    expect(s3.min).toBeGreaterThanOrEqual(-1.02);
    expect(s3.max).toBeLessThanOrEqual(1.02);
    expect(n.fbm2(1, 2, 0)).toBe(0);
  });
  it('ridged [0,1]', () => {
    const s = sample((i) => n.ridged2(i * 0.05, i * 0.021, 4));
    expect(s.min).toBeGreaterThanOrEqual(0);
    expect(s.max).toBeLessThanOrEqual(1.0001);
    expect(s.std).toBeGreaterThan(0.05);
    const s3 = sample((i) => n.ridged3(i * 0.05, i * 0.021, i * 0.033, 3));
    expect(s3.min).toBeGreaterThanOrEqual(0);
    expect(s3.max).toBeLessThanOrEqual(1.0001);
  });
  it('worley2 [0,1], kenar ≥ 0, hücre kimliği [0,1)', () => {
    const s = sample((i) => n.worley2(i * 0.19, i * 0.083 - 5));
    expect(s.min).toBeGreaterThanOrEqual(0);
    expect(s.max).toBeLessThanOrEqual(1);
    expect(s.mean).toBeGreaterThan(0.2);
    expect(s.mean).toBeLessThan(0.7);
    const e = sample((i) => n.worley2Edge(i * 0.19, i * 0.083 - 5));
    expect(e.min).toBeGreaterThanOrEqual(0);
    const c = sample((i) => n.worley2Cell(i * 0.19, i * 0.083 - 5));
    expect(c.min).toBeGreaterThanOrEqual(0);
    expect(c.max).toBeLessThan(1);
  });
  it('negatif ve çok büyük koordinatlarda NaN yok', () => {
    for (const v of [-1e5, -3.7, 0, 123456.789, 1e6]) {
      expect(Number.isFinite(n.simplex2(v, -v))).toBe(true);
      expect(Number.isFinite(n.simplex3(v, -v, v * 0.5))).toBe(true);
      expect(Number.isFinite(n.fbm2(v, v))).toBe(true);
      expect(Number.isFinite(n.worley2(v, -v))).toBe(true);
    }
  });
});

describe('createNoise süreklilik', () => {
  const n = createNoise(7);
  it('küçük adım küçük fark (simplex ve fbm)', () => {
    let worst = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.41;
      const y = i * 0.27;
      worst = Math.max(worst, Math.abs(n.simplex2(x, y) - n.simplex2(x + 0.001, y)));
      worst = Math.max(worst, Math.abs(n.fbm2(x, y) - n.fbm2(x, y + 0.001)));
    }
    expect(worst).toBeLessThan(0.05);
  });
  it('worley2 sürekli (F1 hücre içinde sıçramaz)', () => {
    let worst = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.137;
      const y = i * 0.059;
      worst = Math.max(worst, Math.abs(n.worley2(x, y) - n.worley2(x + 0.001, y + 0.001)));
    }
    expect(worst).toBeLessThan(0.01);
  });
  it('worley2Cell bir bölgede sabit, bölgeler arasında değişir', () => {
    const ids = new Set();
    for (let i = 0; i < 4000; i++) ids.add(n.worley2Cell(i * 0.05, 0.5));
    expect(ids.size).toBeGreaterThan(20);
    expect(n.worley2Cell(2.5, 2.5)).toBe(n.worley2Cell(2.5001, 2.5));
  });
});
