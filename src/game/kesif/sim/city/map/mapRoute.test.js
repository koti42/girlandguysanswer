import { describe, expect, it } from 'vitest';
import { routePolyline } from './mapRoute.js';
import { getCityPlan } from '../cityPlan.js';
import { dimSeed } from '../../dim/dimensions.js';
import { mulberry32 } from '../../rng.js';

const SEED = dimSeed(77, 'neon');

describe('harita rotası', () => {
  it('uçlar korunur; rota sonlu ve düz çizgiden kısa değildir', () => {
    const plan = getCityPlan(SEED);
    const a = { x: 3, y: 64, z: 4 };
    const t = plan.terminals[8];
    const r = routePolyline(SEED, a, t);
    expect(r.straight).toBe(false);
    expect(r.pts[0]).toEqual([3, 4]);
    expect(r.pts[r.pts.length - 1]).toEqual([t.x, t.z]);
    expect(r.length).toBeGreaterThanOrEqual(Math.hypot(t.x - 3, t.z - 4) - 1e-6);
    r.pts.forEach((p) => expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true));
  });

  it('belirlenimci; yeraltı hedefi düz çizgi; bozuk girdi null; nokta sınırı', () => {
    const t = getCityPlan(SEED).terminals[10];
    expect(routePolyline(SEED, { x: 0, z: 0 }, t)).toEqual(routePolyline(SEED, { x: 0, z: 0 }, t));
    const m = routePolyline(SEED, { x: 0, y: 64, z: 0 }, { x: 0, y: 45, z: 320 });
    expect(m.straight).toBe(true);
    expect(m.pts.length).toBe(2);
    expect(routePolyline(SEED, null, t)).toBeNull();
    expect(routePolyline(SEED, { x: NaN, z: 0 }, t)).toBeNull();
    const far = routePolyline(SEED, { x: -700, z: -700 }, { x: 700, z: 500 }, 8);
    expect(far.pts.length).toBeLessThanOrEqual(8);
    expect(far.pts[0]).toEqual([-700, -700]);
  });

  it('fuzz: 60 rastgele çift için rota üretilir', () => {
    const r = mulberry32(4);
    for (let i = 0; i < 60; i++) {
      const res = routePolyline(SEED, { x: (r() - 0.5) * 1400, y: 64, z: (r() - 0.5) * 1400 }, { x: (r() - 0.5) * 1400, y: 64, z: (r() - 0.5) * 1400 });
      expect(res).not.toBeNull();
      expect(res.pts.length).toBeGreaterThanOrEqual(2);
      expect(Number.isFinite(res.length)).toBe(true);
    }
  });
});
