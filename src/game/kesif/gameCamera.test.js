import { describe, expect, it } from 'vitest';
import {
  CAM, cameraFar, fovTarget, boomLength, boomDirection, stepBoom, bobOffsets, dampTo, stepSpring,
} from './gameCamera.js';

describe('cameraFar', () => {
  it('≥ (viewDist+2)·24 ve en az 256', () => {
    for (let v = 3; v <= 12; v++) expect(cameraFar(v)).toBeGreaterThanOrEqual((v + 2) * 24);
    expect(cameraFar(3)).toBeGreaterThanOrEqual(256);
    expect(cameraFar(undefined)).toBeGreaterThanOrEqual(256);
    expect(cameraFar(10)).toBe(288);
  });
});

describe('fovTarget', () => {
  it('koşarken +8, uçuş koşusunda +10, planörde +6, su altında −4', () => {
    expect(fovTarget(70, {})).toBe(70);
    expect(fovTarget(70, { sprinting: true })).toBe(78);
    expect(fovTarget(70, { sprinting: true, flying: true })).toBe(80);
    expect(fovTarget(70, { gliding: true })).toBe(76);
    expect(fovTarget(70, { underwater: true })).toBe(66);
  });
  it('kısıtlı hareket etkiyi azaltır; temel değer sıkıştırılır', () => {
    expect(fovTarget(70, { sprinting: true, reduced: true })).toBeCloseTo(73.2, 5);
    expect(fovTarget(500, {})).toBe(120);
    expect(fovTarget(NaN, {})).toBe(70);
  });
});

describe('TP bom matematiği', () => {
  it('isabet yoksa istenen uzunluk, varsa isabetin marj kadar önünde (en az min)', () => {
    expect(boomLength(null, 4)).toBe(4);
    expect(boomLength(10, 4)).toBe(4);
    expect(boomLength(3, 4, 0.3)).toBeCloseTo(2.7, 5);
    expect(boomLength(0.2, 4, 0.3, 0.35)).toBe(0.35);
    expect(boomLength(0.2, 0.2, 0.3, 0.35)).toBe(0.2);
  });
  it('yön: tp bakışın tersi, tpf bakış yönü; birim uzunlukta', () => {
    const o = { x: 0, y: 0, z: 0 };
    boomDirection('tp', 0, 0, o);
    expect(o.z).toBeCloseTo(1, 5);
    boomDirection('tpf', 0, 0, o);
    expect(o.z).toBeCloseTo(-1, 5);
    boomDirection('tp', 1.1, 0.4, o);
    expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(1, 5);
  });
  it('stepBoom: engelde anında kısalır, serbestte yumuşak uzar', () => {
    expect(stepBoom(4, 1.5, 0.016)).toBe(1.5);
    const v = stepBoom(1.5, 4, 0.016);
    expect(v).toBeGreaterThan(1.5);
    expect(v).toBeLessThan(4);
    let c = 1;
    for (let i = 0; i < 300; i++) c = stepBoom(c, 4, 1 / 60);
    expect(c).toBeCloseTo(4, 2);
  });
});

describe('sallanma / yay', () => {
  it('bob genliği 0 ise dikey sapma yok; genlikle büyür', () => {
    const o = {};
    bobOffsets(1, 0, o);
    expect(o.y).toBe(0);
    bobOffsets(1, 1, o);
    expect(Math.abs(o.y)).toBeGreaterThan(0);
    expect(Math.abs(o.x)).toBeLessThan(0.05);
  });
  it('dampTo hedefe yaklaşır, dt 0 değiştirmez', () => {
    expect(dampTo(0, 10, 5, 0)).toBe(0);
    let v = 0;
    for (let i = 0; i < 120; i++) v = dampTo(v, 10, 8, 1 / 60);
    expect(v).toBeGreaterThan(9.9);
  });
  it('iniş yayı sönümlenir ve kararlıdır', () => {
    const s = { x: 0, v: -1.2 };
    let min = 0;
    for (let i = 0; i < 240; i++) {
      stepSpring(s, 1 / 60);
      min = Math.min(min, s.x);
      expect(Number.isFinite(s.x)).toBe(true);
    }
    expect(min).toBeLessThan(-0.01);
    expect(min).toBeGreaterThan(-0.4);
    expect(Math.abs(s.x)).toBeLessThan(1e-3);
  });
  it('sabitler tutarlı', () => {
    expect(CAM.minBoom).toBeLessThan(CAM.tpDistance);
    expect(CAM.pitchLimit).toBeLessThan(Math.PI / 2);
  });
});
