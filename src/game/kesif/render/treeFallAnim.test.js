import { describe, expect, it } from 'vitest';
import {
  crownPoint, fallDuration, fallPose, pathState, popOrder, shakeAmplitude, tipPoint,
} from './treeFallAnim.js';

describe('treeFallAnim', () => {
  it('süre 1,2–1,8 sn aralığında ve boyla artar', () => {
    expect(fallDuration(3)).toBeCloseTo(1.2, 6);
    expect(fallDuration(30)).toBeCloseTo(1.8, 6);
    expect(fallDuration(12)).toBeGreaterThan(fallDuration(6));
    for (let h = 1; h < 60; h++) {
      expect(fallDuration(h)).toBeGreaterThanOrEqual(1.2);
      expect(fallDuration(h)).toBeLessThanOrEqual(1.8);
    }
  });

  it('açı: dikten başlar, ease-in ile hızlanır, %80\'de yatar, sekip durur', () => {
    const T = 1.5;
    expect(Math.abs(fallPose(0, T).angle)).toBeLessThan(0.02);
    const a1 = fallPose(0.3 * T, T).angle;
    const a2 = fallPose(0.6 * T, T).angle;
    expect(a2).toBeGreaterThan(a1);
    // ease-in: ikinci yarı daha çok yol alır
    const d1 = fallPose(0.4 * T, T).angle - fallPose(0.2 * T, T).angle;
    const d2 = fallPose(0.8 * T - 1e-6, T).angle - fallPose(0.6 * T, T).angle;
    expect(d2).toBeGreaterThan(d1);
    expect(fallPose(0.8 * T - 1e-6, T).angle).toBeCloseTo(Math.PI / 2, 2);
    expect(fallPose(0.9 * T, T).phase).toBe('bounce');
    expect(fallPose(0.9 * T, T).angle).toBeLessThan(Math.PI / 2);
    expect(fallPose(T, T)).toMatchObject({ phase: 'done', angle: Math.PI / 2 });
    expect(fallPose(5, T).phase).toBe('done');
    // hiçbir anda yatıktan fazla dönmez
    for (let i = 0; i <= 100; i++) expect(fallPose((i / 100) * T, T).angle).toBeLessThanOrEqual(Math.PI / 2 + 0.02);
  });

  it('tepe ve iz noktası menteşe + yön * boy', () => {
    const hinge = { x: 10, y: 5, z: -3 };
    const dir = { dx: 1, dz: 0 };
    const o = { x: 0, y: 0, z: 0 };
    expect(crownPoint(hinge, dir, 8, 0, o)).toMatchObject({ x: 10, y: 13, z: -3 });
    const c = crownPoint(hinge, dir, 8, Math.PI / 2, o);
    expect(c.x).toBeCloseTo(18, 6);
    expect(c.y).toBeCloseTo(5, 6);
    expect(tipPoint(hinge, { dx: 0, dz: -1 }, 6, o)).toMatchObject({ x: 10, y: 5, z: -9 });
  });

  it('koridor: boyuna ve yana konum', () => {
    const hinge = { x: 0, y: 0, z: 0 };
    const s = pathState(5, 1, hinge, { dx: 1, dz: 0 }, 8);
    expect(s.along).toBeCloseTo(5, 6);
    expect(Math.abs(s.lateral)).toBeCloseTo(1, 6);
    const s2 = pathState(0, -4, hinge, { dx: 0, dz: -1 }, 8);
    expect(s2.along).toBeCloseTo(4, 6);
    expect(Math.abs(s2.lateral)).toBeCloseTo(0, 6);
  });

  it('sarsıntı uzaklıkla söner ve 0,05\'i aşmaz', () => {
    expect(shakeAmplitude(10, 0)).toBeGreaterThan(shakeAmplitude(10, 20));
    expect(shakeAmplitude(10, 40)).toBe(0);
    expect(shakeAmplitude(200, 0)).toBeLessThanOrEqual(0.05);
    expect(shakeAmplitude(10, -1)).toBe(0);
  });

  it('dev ağaç çöküşü üstten alta, belirlenimci', () => {
    const cells = [{ x: 0, y: 1, z: 0 }, { x: 1, y: 5, z: 0 }, { x: 0, y: 5, z: 0 }, { x: 2, y: 3, z: 1 }];
    expect(popOrder(cells)).toEqual([2, 1, 3, 0]);
    expect(popOrder(cells)).toEqual(popOrder(cells));
  });
});
