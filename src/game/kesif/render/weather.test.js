import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWeatherLayer, WEATHER_BOX } from './weather.js';

const cam = new THREE.PerspectiveCamera();
cam.position.set(3, 60, 9);
cam.updateMatrixWorld();

function run(layer, state, secs) {
  const n = Math.ceil(secs / 0.05);
  for (let i = 0; i < n; i++) layer.update(0.05, state, cam);
}

describe('createWeatherLayer', () => {
  it('yağış yokken görünmez, intensity artınca parçacık sayısı artar', () => {
    const w = createWeatherLayer(THREE, { quality: 'high' });
    run(w, { kind: null, intensity: 0 }, 1);
    expect(w.object3D.visible).toBe(false);
    expect(w.getVisibleCount()).toBe(0);
    run(w, { kind: 'rain', intensity: 0.3, wind: { x: 0.2, z: 0 } }, 4);
    const low = w.getVisibleCount();
    run(w, { kind: 'rain', intensity: 1, wind: { x: 0.2, z: 0 } }, 4);
    const high = w.getVisibleCount();
    expect(low).toBeGreaterThan(100);
    expect(high).toBeGreaterThan(low);
    expect(w.object3D.visible).toBe(true);
    w.dispose();
  });

  it('kameraya göre konumlanır ve kutu boyutu uniform olarak verilir', () => {
    const w = createWeatherLayer(THREE, {});
    run(w, { kind: 'snow', intensity: 1 }, 3);
    const u = w.object3D.material.uniforms;
    expect(u.uCam.value.x).toBe(3);
    expect(u.uCam.value.y).toBe(60);
    expect(u.uBox.value.x).toBe(WEATHER_BOX.x);
    expect(u.uKind.value).toBe(1);
    w.dispose();
  });

  it('tür değişince önce eskisi söner sonra yenisi gelir', () => {
    const w = createWeatherLayer(THREE, {});
    const u = w.object3D.material.uniforms;
    run(w, { kind: 'rain', intensity: 1 }, 4);
    expect(u.uKind.value).toBe(0);
    w.update(0.05, { kind: 'snow', intensity: 1 }, cam);
    expect(u.uKind.value).toBe(0); // hemen geçmez
    run(w, { kind: 'snow', intensity: 1 }, 8);
    expect(u.uKind.value).toBe(1);
    expect(w.getVisibleCount()).toBeGreaterThan(100);
    w.dispose();
  });

  it('sığınak (shelter) ve su altı yağışı keser', () => {
    const w = createWeatherLayer(THREE, {});
    run(w, { kind: 'rain', intensity: 1 }, 4);
    const open = w.getVisibleCount();
    run(w, { kind: 'rain', intensity: 1, shelter: 1 }, 6);
    expect(w.getVisibleCount()).toBeLessThan(open * 0.2);
    run(w, { kind: 'rain', intensity: 1, shelter: 0 }, 6);
    expect(w.getVisibleCount()).toBeGreaterThan(open * 0.8);
    run(w, { kind: 'rain', intensity: 1, underwater: true }, 8);
    expect(w.getVisibleCount()).toBe(0);
    w.dispose();
  });

  it('kalite çarpanı ve reducedMotion yoğunluğu düşürür', () => {
    const hi = createWeatherLayer(THREE, { quality: 'high' });
    const lo = createWeatherLayer(THREE, { quality: 'low' });
    const rm = createWeatherLayer(THREE, { quality: 'high', reducedMotion: true });
    [hi, lo, rm].forEach((w) => run(w, { kind: 'rain', intensity: 1 }, 5));
    expect(lo.getVisibleCount()).toBeLessThan(hi.getVisibleCount() * 0.6);
    expect(rm.getVisibleCount()).toBeLessThan(hi.getVisibleCount() * 0.6);
    expect(rm.object3D.material.uniforms.uMotion.value).toBe(0);
    lo.setQuality('high');
    run(lo, { kind: 'rain', intensity: 1 }, 1);
    expect(lo.getVisibleCount()).toBe(hi.getVisibleCount());
    [hi, lo, rm].forEach((w) => w.dispose());
  });

  it('bilinmeyen tür ve dispose sonrası güvenli', () => {
    const w = createWeatherLayer(THREE, {});
    run(w, { kind: 'lazer', intensity: 1 }, 2);
    expect(w.getVisibleCount()).toBe(0);
    w.dispose();
    w.update(0.05, { kind: 'rain', intensity: 1 }, cam);
  });
});
