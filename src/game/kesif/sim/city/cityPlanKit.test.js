import { describe, expect, it } from 'vitest';
import { subHash } from '../dim/dimensions.js';
import {
  FACE_YAW, Lru, TAG, blockKey, clamp, imod, lerp, rectContains, rectsOverlap, sh, shf, shi, stream, yawOfFacing,
} from './cityPlanKit.js';

describe('alt akışlar (subHash)', () => {
  it('TAG değerleri benzersiz ve tam sayı; donmuş', () => {
    const vals = Object.keys(TAG).map((k) => TAG[k]);
    expect(new Set(vals).size).toBe(vals.length);
    vals.forEach((v) => expect(Number.isInteger(v)).toBe(true));
    expect(Object.isFrozen(TAG)).toBe(true);
  });

  it('sh/shf/shi = subHash(seed,id,tag); aralıklar; farklı id/tag farklı akış', () => {
    for (let i = 0; i < 500; i++) {
      expect(sh(12345, i, 7)).toBe(subHash(12345, i, 7) >>> 0);
      const f = shf(12345, i, 7);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const k = shi(12345, i, 7, 10);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(10);
    }
    expect(sh(1, 2, 3)).not.toBe(sh(1, 2, 4));
    expect(sh(1, 2, 3)).not.toBe(sh(1, 3, 3));
    expect(sh(1, 2, 3)).not.toBe(sh(2, 2, 3));
  });

  it('stream: aynı (seed,id,tag) → aynı dizi; yerel (başka akışı etkilemez); dağılım düzgün', () => {
    const a = stream(9, 4, TAG.LOT_SPLIT);
    const b = stream(9, 4, TAG.LOT_SPLIT);
    const other = stream(9, 5, TAG.LOT_SPLIT);
    const sa = [];
    const sb = [];
    for (let i = 0; i < 50; i++) {
      other.f(); // başka akışı ilerletmek etkilemez
      sa.push(a.u());
      sb.push(b.u());
    }
    expect(sa).toEqual(sb);
    const s = stream(1, 1, 1);
    let sum = 0;
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = s.f();
      sum += v;
      buckets[Math.floor(v * 10)]++;
    }
    expect(Math.abs(sum / 20000 - 0.5)).toBeLessThan(0.01);
    buckets.forEach((c) => expect(Math.abs(c - 2000)).toBeLessThan(220));
    const t = stream(2, 2, 2);
    for (let i = 0; i < 1000; i++) {
      const r = t.r(3, 7);
      expect(r >= 3 && r <= 7 && Number.isInteger(r)).toBe(true);
      expect(t.i(4)).toBeLessThan(4);
    }
    expect(t.pick([5])).toBe(5);
    expect(t.weighted([0, 0])).toBe(-1);
    const w = stream(3, 3, 3);
    const cnt = [0, 0, 0];
    for (let i = 0; i < 6000; i++) cnt[w.weighted([1, 0, 2])]++;
    expect(cnt[1]).toBe(0);
    expect(cnt[2] / cnt[0]).toBeGreaterThan(1.7);
    expect(cnt[2] / cnt[0]).toBeLessThan(2.3);
  });
});

describe('küçük yardımcılar', () => {
  it('clamp/lerp/imod/rect/blockKey', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(imod(-1, 3)).toBe(2);
    expect(imod(7, 3)).toBe(1);
    expect(rectsOverlap({ x0: 0, z0: 0, x1: 2, z1: 2 }, { x0: 1, z0: 1, x1: 3, z1: 3 })).toBe(true);
    expect(rectsOverlap({ x0: 0, z0: 0, x1: 2, z1: 2 }, { x0: 2, z0: 0, x1: 4, z1: 2 })).toBe(false);
    expect(rectContains({ x0: 0, z0: 0, x1: 2, z1: 2 }, 1, 1)).toBe(true);
    expect(rectContains({ x0: 0, z0: 0, x1: 2, z1: 2 }, 2, 1)).toBe(false);
    const keys = new Set();
    for (let bj = -10; bj <= 9; bj++) for (let bi = -10; bi <= 9; bi++) keys.add(blockKey(bi, bj));
    expect(keys.size).toBe(400);
    expect(Math.min(...keys)).toBe(0);
    expect(Math.max(...keys)).toBe(399);
  });

  it('prop yönü (sim/props sözleşmesi): yaw 0 +Z, 1 +X, 2 −Z, 3 −X', () => {
    expect(FACE_YAW).toEqual({ n: 2, e: 1, s: 0, w: 3 });
    expect([0, 1, 2, 3].map(yawOfFacing)).toEqual([2, 1, 0, 3]);
  });

  it('Lru: en eski atılır, get erişileni korur, istatistik', () => {
    const l = new Lru(3);
    l.set('a', 1);
    l.set('b', 2);
    l.set('c', 3);
    expect(l.get('a')).toBe(1); // a artık en yeni
    l.set('d', 4); // b atılır
    expect(l.has('b')).toBe(false);
    expect(l.has('a') && l.has('c') && l.has('d')).toBe(true);
    expect(l.size).toBe(3);
    expect(l.get('zzz')).toBeUndefined();
    expect(l.hits).toBe(1);
    expect(l.misses).toBe(1);
    l.delete('a');
    expect(l.size).toBe(2);
    l.clear();
    expect(l.size).toBe(0);
    expect(new Lru(0).max).toBe(1);
  });
});
