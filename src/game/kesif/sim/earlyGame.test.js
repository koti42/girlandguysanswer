import { describe, expect, it } from 'vitest';
import { EARLY, earlyGrace, earlyTuning, hasIronGear } from './earlyGame.js';
import { Inventory } from './inventory.js';

const BASE = { hostileCap: 24, caveCap: 10, hostileEvery: 0.5, hostileMin: 18, hostileMax: 48 };

describe('earlyGrace', () => {
  it('yalnızca 0. bölge + demir yok; ilk gün tam koruma', () => {
    expect(earlyGrace({ zone: 0, day: 0, ironGear: false, dist: 0 })).toBe(1);
    expect(earlyGrace({ zone: 1, day: 0, ironGear: false, dist: 0 })).toBe(0);
    expect(earlyGrace({ zone: 0, day: 0, ironGear: true, dist: 0 })).toBe(0);
    expect(earlyGrace(null)).toBe(0);
  });

  it('gün ilerledikçe söner, 4. günden sonra yok', () => {
    const g = (day) => earlyGrace({ zone: 0, day, ironGear: false, dist: 0 });
    expect(g(0)).toBeGreaterThan(g(1));
    expect(g(1)).toBeGreaterThan(g(2));
    expect(g(2)).toBeGreaterThan(g(3));
    expect(g(3)).toBeGreaterThan(0);
    expect(g(4)).toBe(0);
    expect(g(99)).toBe(0);
    expect(g(-3)).toBe(1);
    expect(earlyGrace({ zone: 0, day: NaN, ironGear: false })).toBe(1);
  });

  it('başlangıçtan uzaklaştıkça azalır ama sıfırlanmaz (0. bölge içinde)', () => {
    const d = (dist) => earlyGrace({ zone: 0, day: 0, ironGear: false, dist });
    expect(d(EARLY.distFull)).toBe(1);
    expect(d(70)).toBeLessThan(1);
    expect(d(70)).toBeGreaterThan(d(EARLY.distFar));
    expect(d(EARLY.distFar)).toBeCloseTo(EARLY.distFloor, 6);
    expect(d(5000)).toBeCloseTo(EARLY.distFloor, 6);
    expect(earlyGrace({ zone: 0, day: 0, ironGear: false })).toBe(1);
  });
});

describe('earlyTuning', () => {
  it('koruma yokken taban değerler ve çarpanlar 1', () => {
    for (const g of [0, -1, NaN]) {
      const t = earlyTuning(g, 100, BASE);
      expect(t).toMatchObject({
        grace: 0, hostileCap: 24, caveCap: 10, hostileEvery: 0.5, hostileMin: 18, hostileMax: 48, dmgMul: 1, aggroMul: 1, hunt: false,
      });
    }
  });

  it('ilk gece (g=1, gece başı): tek düşman, uzun aralık, ≥ 24 blok doğma, sürü 1, hasar düşük', () => {
    const t = earlyTuning(1, 0, BASE);
    expect(t.hostileCap).toBe(1);
    expect(t.hostileEvery).toBeGreaterThanOrEqual(5);
    expect(t.hostileMin).toBeGreaterThanOrEqual(24);
    expect(t.hostileMax).toBeGreaterThan(t.hostileMin);
    expect(t.groupMax).toBe(1);
    expect(t.hunt).toBe(true);
    expect(t.dmgMul).toBeCloseTo(EARLY.dmgFirst, 6);
    expect(t.aggroMul).toBeGreaterThan(1);
  });

  it('tavan gece boyunca 1\'den capFirst\'e adım adım yükselir, asla aşmaz; hasar tırmanır', () => {
    let prevCap = 0;
    let prevDmg = 0;
    for (let s = 0; s <= 400; s += 5) {
      const t = earlyTuning(1, s, BASE);
      expect(t.hostileCap).toBeGreaterThanOrEqual(prevCap);
      expect(t.hostileCap).toBeLessThanOrEqual(EARLY.capFirst);
      expect(t.dmgMul).toBeGreaterThanOrEqual(prevDmg);
      prevCap = t.hostileCap;
      prevDmg = t.dmgMul;
    }
    expect(prevCap).toBe(EARLY.capFirst);
    expect(prevDmg).toBeCloseTo(EARLY.dmgLater, 6);
    expect(earlyTuning(1, 12, BASE).hostileCap).toBe(2);
  });

  it('gündüz (Infinity): tırmanma tamamlanmış sayılır', () => {
    const t = earlyTuning(1, Infinity, BASE);
    expect(t.hostileCap).toBe(EARLY.capFirst);
    expect(t.dmgMul).toBeCloseTo(EARLY.dmgLater, 6);
  });

  it('düşük koruma taban değerlere yakın, çarpanlar tek yönlü', () => {
    const lo = earlyTuning(0.15, Infinity, BASE);
    const hi = earlyTuning(1, Infinity, BASE);
    expect(lo.hostileCap).toBeGreaterThan(hi.hostileCap);
    expect(lo.hostileCap).toBeLessThanOrEqual(24);
    expect(lo.dmgMul).toBeGreaterThan(hi.dmgMul);
    expect(lo.dmgMul).toBeLessThanOrEqual(1);
    expect(lo.hunt).toBe(false);
    expect(lo.hostileEvery).toBeLessThan(hi.hostileEvery);
    expect(earlyTuning(0.4, 0, BASE).groupMax).toBe(2);
  });

  it('belirlenimci: aynı girdi → aynı çıktı', () => {
    expect(earlyTuning(0.7, 33, BASE)).toEqual(earlyTuning(0.7, 33, BASE));
  });
});

describe('hasIronGear', () => {
  it('boş/ahşap/taş: hayır; demir alet, elmas kılıç, demir zırh: evet', () => {
    expect(hasIronGear(null)).toBe(false);
    const inv = new Inventory({ size: 36, hotbar: 9, armor: 4 });
    expect(hasIronGear(inv)).toBe(false);
    inv.add('item:kazma_ahşap', 1);
    inv.add('item:kılıç_taş', 1);
    inv.add('item:demir_külçe', 5);
    inv.add('item:altın_külçe', 2);
    expect(hasIronGear(inv)).toBe(false);
    const a = new Inventory({ size: 36, hotbar: 9, armor: 4 });
    a.add('item:kılıç_demir', 1);
    expect(hasIronGear(a)).toBe(true);
    const b = new Inventory({ size: 36, hotbar: 9, armor: 4 });
    b.add('item:kazma_elmas', 1);
    expect(hasIronGear(b)).toBe(true);
    const c = new Inventory({ size: 36, hotbar: 9, armor: 4 });
    c.add('item:göğüslük_demir', 1);
    expect(hasIronGear(c)).toBe(true);
    const d = new Inventory({ size: 36, hotbar: 9, armor: 4 });
    d.add('item:göğüslük_deri', 1);
    d.add('item:kılıç_altın', 1);
    expect(hasIronGear(d)).toBe(false);
  });
});
