import {
  describe, expect, it, vi,
} from 'vitest';
import { clearCityPlanCaches, getBlockPlan, getCityPlan, planBuilding, pois, roadNet, walkNet } from './cityPlan.js';
import { clearNetCaches } from './roadNet.js';
import { allLots } from './cityLots.js';
import { citySeed, digest, planDigest } from './cityPlanTestKit.js';

// qa5: 20 tohum × 3 sıra ≈ 13 sn; CPU doygunken 60 sn varsayılanına yaklaşabiliyordu
vi.setConfig({ testTimeout: 600000 });

function fresh() {
  clearCityPlanCaches();
  clearNetCaches();
}

describe('belirlenimcilik (20 tohum)', () => {
  it('aynı tohum → aynı plan; blok/bina çağrı sırası (artan, azalan, karışık) sonucu değiştirmez', () => {
    for (let i = 0; i < 20; i++) {
      const seed = citySeed(i);
      fresh();
      const a = planDigest(seed, 'asc');
      fresh();
      const b = planDigest(seed, 'desc');
      fresh();
      const c = planDigest(seed, 'shuffle');
      expect(b).toBe(a);
      expect(c).toBe(a);
    }
  });

  it('LRU tahliyesinden sonra yeniden üretilen blok planı birebir aynıdır', () => {
    const seed = citySeed(3);
    fresh();
    const first = digest(getBlockPlan(seed, 2, 2));
    // 96'dan fazla farklı blok iste → (2,2) tahliye edilir
    for (let bj = -9; bj <= 8; bj++) for (let bi = -9; bi <= 8; bi++) getBlockPlan(seed, bi, bj);
    const plan = getCityPlan(seed);
    expect(plan._blockPlans.size).toBeLessThanOrEqual(96);
    expect(digest(getBlockPlan(seed, 2, 2))).toBe(first);
  });

  it('farklı tohumlar farklı şehirler üretir (bölge çapaları, kesikler, parseller)', () => {
    const ds = new Set();
    for (let i = 0; i < 12; i++) ds.add(planDigest(citySeed(i), 'asc'));
    expect(ds.size).toBe(12);
  });

  it('blok planı ve bina planı structuredClone ile aynen kopyalanabilir (işçi ↔ ana iş parçacığı)', () => {
    const seed = citySeed(5);
    fresh();
    const bp = getBlockPlan(seed, 1, 1);
    const cl = structuredClone(bp);
    expect(digest(cl)).toBe(digest(bp));
    const lot = allLots(getCityPlan(seed))[40];
    const b = planBuilding(seed, lot);
    expect(digest(structuredClone(b))).toBe(digest(b));
  });

  it('roadNet / walkNet / pois belirlenimci ve önbellekten aynı nesne', () => {
    const seed = citySeed(7);
    fresh();
    const r1 = digest(roadNet(seed).edges);
    const w1 = digest([walkNet(seed).nodes, walkNet(seed).edges]);
    const p1 = digest(pois(seed));
    expect(roadNet(seed)).toBe(roadNet(seed));
    expect(pois(seed)).toBe(pois(seed));
    fresh();
    expect(digest(roadNet(seed).edges)).toBe(r1);
    expect(digest([walkNet(seed).nodes, walkNet(seed).edges])).toBe(w1);
    expect(digest(pois(seed))).toBe(p1);
  });

  it('tohum işareti (uint32 / int32) aynı şehri verir', () => {
    fresh();
    const s = 3000000000;
    const a = digest(getCityPlan(s).terminals);
    fresh();
    const b = digest(getCityPlan(s | 0).terminals);
    expect(b).toBe(a);
  });
});
