import { describe, expect, it } from 'vitest';
import {
  hash2, hash2f, hash3, hash3f, hash32, makeWorldCode, mulberry32, normalizeWorldCode, parseWorldCode,
  seedFromInput, seededRandom, stringSeedToInt, toSeedInt,
} from './rng.js';

describe('mulberry32', () => {
  it('belirlenimci ve [0,1)', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('farklı tohum farklı dizi; ortalama ~0,5', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let same = 0;
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const x = a();
      if (x === b()) same++;
      sum += x;
    }
    expect(same).toBe(0);
    expect(sum / 5000).toBeGreaterThan(0.47);
    expect(sum / 5000).toBeLessThan(0.53);
  });
  it("negatif/ondalık tohum uint32'ye katlanır", () => {
    expect(mulberry32(-1)()).toBe(mulberry32(4294967295)());
    expect(mulberry32(7.9)()).toBe(mulberry32(7)());
  });
});

describe('hash', () => {
  it('hash32 belirlenimci, uint32 ve sıfırı sıfırlamaz', () => {
    expect(hash32(0)).not.toBe(0);
    expect(hash32(5)).toBe(hash32(5));
    for (let i = 0; i < 200; i++) {
      const h = hash32(i);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(4294967296);
    }
  });
  it('hash32 çığ etkisi: 1 bit değişimi ~16 bit çevirir', () => {
    let total = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      let d = hash32(i) ^ hash32(i ^ 1);
      let bits = 0;
      while (d) {
        bits += d & 1;
        d >>>= 1;
      }
      total += bits;
    }
    const avg = total / N;
    expect(avg).toBeGreaterThan(13);
    expect(avg).toBeLessThan(19);
  });
  it('hash2/hash3 belirlenimci, tohum ve eksene duyarlı', () => {
    expect(hash2(3, 4, 9)).toBe(hash2(3, 4, 9));
    expect(hash2(3, 4, 9)).not.toBe(hash2(3, 4, 10));
    expect(hash2(3, 4)).not.toBe(hash2(4, 3));
    expect(hash3(1, 2, 3, 7)).toBe(hash3(1, 2, 3, 7));
    expect(hash3(1, 2, 3)).not.toBe(hash3(3, 2, 1));
    expect(hash3(1, 2, 3)).not.toBe(hash3(1, 3, 2));
    expect(hash2(-5, -9, 1)).toBe(hash2(-5, -9, 1));
  });
  it('hash2f/hash3f [0,1) ve düzgün dağılım', () => {
    let sum = 0;
    let n = 0;
    const bins = new Array(10).fill(0);
    for (let x = -50; x < 50; x++) {
      for (let z = -50; z < 50; z++) {
        const f = hash2f(x, z, 42);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(1);
        sum += f;
        n++;
        bins[Math.floor(f * 10)]++;
      }
    }
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
    for (const b of bins) expect(b).toBeGreaterThan((n / 10) * 0.8);
    expect(hash3f(1, 2, 3)).toBeLessThan(1);
  });
});

describe('seededRandom', () => {
  it('aynı tohum aynı akış; metin tohumu', () => {
    const a = seededRandom('merhaba');
    const b = seededRandom('merhaba');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    expect(seededRandom('a').next()).not.toBe(seededRandom('b').next());
  });
  it('int iki ucu da kapsar ve aralıkta kalır', () => {
    const r = seededRandom(1);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(r.int(5, 5)).toBe(5);
    expect(r.int(5, 2)).toBe(5);
    const v = r.int(4);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(4);
    for (let i = 0; i < 200; i++) {
      const w = r.int(-3, 3);
      expect(w).toBeGreaterThanOrEqual(-3);
      expect(w).toBeLessThanOrEqual(3);
    }
  });
  it('float, pick, chance', () => {
    const r = seededRandom(9);
    for (let i = 0; i < 200; i++) {
      const f = r.float(2, 4);
      expect(f).toBeGreaterThanOrEqual(2);
      expect(f).toBeLessThan(4);
    }
    expect(r.pick([])).toBeUndefined();
    expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (r.chance(0.25)) hits++;
    expect(hits / 4000).toBeGreaterThan(0.21);
    expect(hits / 4000).toBeLessThan(0.29);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });
  it('shuffle yerinde, permütasyon ve belirlenimci', () => {
    const base = Array.from({ length: 30 }, (_, i) => i);
    const a = seededRandom(5).shuffle(base.slice());
    const b = seededRandom(5).shuffle(base.slice());
    expect(a).toEqual(b);
    expect(a.slice().sort((x, y) => x - y)).toEqual(base);
    expect(a).not.toEqual(base);
    const arr = [1, 2, 3];
    expect(seededRandom(1).shuffle(arr)).toBe(arr);
  });
  it('weighted', () => {
    const r = seededRandom(3);
    expect(r.weighted([0, 0])).toBe(-1);
    for (let i = 0; i < 100; i++) expect(r.weighted([0, 5, 0])).toBe(1);
    const c = [0, 0];
    for (let i = 0; i < 4000; i++) c[r.weighted([1, 3])]++;
    expect(c[1] / 4000).toBeGreaterThan(0.71);
    expect(c[1] / 4000).toBeLessThan(0.79);
  });
  it('fork ana akışı ilerletmez ve etikete bağlıdır', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const f1 = a.fork('x');
    const f2 = b.fork('x');
    expect(f1.next()).toBe(f2.next());
    expect(a.next()).toBe(b.next());
    expect(seededRandom(7).fork('x').next()).not.toBe(seededRandom(7).fork('y').next());
  });
  it('durum al/yükle', () => {
    const r = seededRandom(11);
    r.next();
    const s = r.getState();
    const x = r.next();
    r.setState(s);
    expect(r.next()).toBe(x);
  });
});

describe('tohum dönüşümü', () => {
  it('stringSeedToInt belirlenimci uint32', () => {
    expect(stringSeedToInt('abc')).toBe(stringSeedToInt('abc'));
    expect(stringSeedToInt('abc')).not.toBe(stringSeedToInt('abd'));
    expect(stringSeedToInt('')).toBeGreaterThanOrEqual(0);
    expect(stringSeedToInt(123)).toBe(stringSeedToInt('123'));
  });
  it('toSeedInt', () => {
    expect(toSeedInt(5)).toBe(5);
    expect(toSeedInt(NaN)).toBe(0);
    expect(toSeedInt(Infinity)).toBe(0);
    expect(toSeedInt(null)).toBe(0);
    expect(toSeedInt('x')).toBe(stringSeedToInt('x'));
  });
});

describe('Dünya Kodu', () => {
  it('8 hane base36, belirlenimci', () => {
    const c1 = makeWorldCode(seededRandom(77));
    const c2 = makeWorldCode(seededRandom(77));
    expect(c1).toMatch(/^[0-9A-Z]{8}$/);
    expect(c1).toBe(c2);
    expect(makeWorldCode(seededRandom(78))).not.toBe(c1);
    expect(makeWorldCode(mulberry32(5))).toMatch(/^[0-9A-Z]{8}$/);
    expect(makeWorldCode(() => 0.999999999)).toBe('ZZZZZZZZ');
    expect(makeWorldCode(() => 0)).toBe('00000000');
  });
  it('parseWorldCode seed üretir, büyük/küçük harf ve ayraç duyarsız', () => {
    const code = makeWorldCode(seededRandom(1));
    const s = parseWorldCode(code);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(4294967296);
    expect(parseWorldCode(code.toLowerCase())).toBe(s);
    expect(parseWorldCode(code.slice(0, 4) + '-' + code.slice(4))).toBe(s);
    expect(parseWorldCode(' ' + code + ' ')).toBe(s);
    expect(normalizeWorldCode(code.toLowerCase())).toBe(code);
  });
  it('geçersiz kodlar null', () => {
    for (const bad of ['', 'abc', '1234567', '123456789', 'ABCD-EF!1', null, undefined, 42, 'ÇÇÇÇÇÇÇÇ']) {
      expect(parseWorldCode(bad)).toBeNull();
    }
  });
  it('farklı kodlar çoğunlukla farklı tohum verir', () => {
    const seeds = new Set();
    const r = seededRandom(2024);
    for (let i = 0; i < 500; i++) seeds.add(parseWorldCode(makeWorldCode(r)));
    expect(seeds.size).toBeGreaterThan(495);
  });
  it('seedFromInput', () => {
    expect(seedFromInput(12)).toBe(12);
    expect(seedFromInput('ABCD1234')).toBe(parseWorldCode('ABCD1234'));
    expect(seedFromInput('42')).toBe(42);
    expect(seedFromInput('selam dünya')).toBe(stringSeedToInt('selam dünya'));
    expect(seedFromInput(null)).toBe(0);
  });
});
