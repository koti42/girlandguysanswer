import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeSky, createSkyState, sunDirection, moonDirection, createWeather,
} from '../sim/daynight.js';
import { createSky, getFogParams, srgbToLinear } from './sky.js';

function stateFor(phase, zone, weather) {
  const s = computeSky(phase, zone || 0, weather || null, createSkyState());
  s.sunDir = sunDirection(phase, { x: 0, y: 0, z: 0 });
  s.moonDir = moonDirection(phase, { x: 0, y: 0, z: 0 });
  s.phase = phase;
  s.zoneTint = zone || 0;
  s.weather = weather || null;
  return s;
}

describe('srgbToLinear', () => {
  it('uç değerler ve orta ton', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 3);
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 6);
  });
});

describe('getFogParams', () => {
  it('sis uzaklığı görüş mesafesine hizalı (v*16-6), fade eşikleri içinde', () => {
    const f = getFogParams(stateFor(0.3), 8);
    expect(f.fogFar).toBeCloseTo(8 * 16 - 6, 5);
    expect(f.fogNear).toBeLessThan(f.fogFar);
    expect(f.fadeStart).toBeLessThan(f.fadeEnd);
    expect(f.fadeEnd).toBeLessThan(f.fogFar);
    expect(f.fogNear).toBeGreaterThan(f.fogFar * 0.25);
  });

  it('yağışlı havada sis yaklaşır', () => {
    const w = createWeather(5);
    w.storm = 1;
    w.cloudCover = 1;
    w.intensity = 1;
    const clear = getFogParams(stateFor(0.3), 8);
    const rain = getFogParams(stateFor(0.3, 0, w), 8);
    expect(rain.fogFar).toBeLessThan(clear.fogFar * 0.8);
    expect(rain.fogNear).toBeLessThan(clear.fogNear);
  });

  it('mühür mesafesi verilince sis perdesi yaklaşır ve mühür rengine kayar', () => {
    const s = stateFor(0.3);
    const base = getFogParams(s, 10);
    const sealed = getFogParams(s, 10, { sealDistance: 60 });
    expect(sealed.fogFar).toBeLessThan(base.fogFar);
    expect(sealed.fogFar).toBeGreaterThanOrEqual(56);
    expect(sealed.fogColor[2]).not.toBeCloseTo(base.fogColor[2], 3);
    // çok uzaktaki mühür etkisiz
    expect(getFogParams(s, 10, { sealDistance: 5000 }).fogFar).toBeCloseTo(base.fogFar, 5);
  });

  it('gece yön ışığı aydır (yukarı bakar), rengi sönük ve soğuk; gündüz güneş', () => {
    const night = getFogParams(stateFor(0.78), 8);
    const day = getFogParams(stateFor(0.28), 8);
    expect(night.sunDir.y).toBeGreaterThan(0.1);
    expect(day.sunDir.y).toBeGreaterThan(0.8);
    expect(night.sunColor[2]).toBeGreaterThan(night.sunColor[0]);
    expect(day.sunColor[0]).toBeGreaterThan(night.sunColor[0] * 3);
    expect(night.dayFactor).toBeGreaterThanOrEqual(0.34);
    expect(day.dayFactor).toBeCloseTo(1, 5);
    expect(night.minLight).toBeGreaterThan(day.minLight);
    const l = Math.hypot(night.sunDir.x, night.sunDir.y, night.sunDir.z);
    expect(l).toBeCloseTo(1, 5);
  });

  it('out nesnesi yeniden kullanılır', () => {
    const out = getFogParams(stateFor(0.3), 6);
    const again = getFogParams(stateFor(0.5), 6, undefined, out);
    expect(again).toBe(out);
  });

  it('gece ortam rengi gündüzden koyu ama sıfır değil', () => {
    const night = getFogParams(stateFor(0.78), 8);
    const day = getFogParams(stateFor(0.28), 8);
    const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    expect(lum(night.ambient)).toBeGreaterThan(0.02);
    expect(lum(night.ambient)).toBeLessThan(lum(day.ambient));
  });
});

describe('createSky', () => {
  it('nesneler, uniform güncelleme ve dispose', () => {
    const sky = createSky(THREE, { quality: 'high' });
    expect(sky.object3D.children.length).toBe(2);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(10, 70, -5);
    cam.updateMatrixWorld();
    sky.update(0.016, stateFor(0.3), cam);
    const u = sky.object3D.children[0].material.uniforms;
    expect(u.uDay.value).toBeCloseTo(1, 5);
    expect(u.uCamXZ.value.x).toBe(10);
    expect(u.uCamXZ.value.y).toBe(-5);
    expect(u.uCloudH.value).toBeCloseTo(176 - 70, 5);
    expect(u.uSunVis.value).toBe(1);
    expect(u.uMoonVis.value).toBe(0);
    sky.update(0.016, stateFor(0.78), cam);
    expect(u.uDay.value).toBeLessThan(0.1);
    expect(u.uMoonVis.value).toBeGreaterThan(0.5);
    expect(u.uSunVis.value).toBe(0);
    sky.dispose();
    sky.update(0.016, stateFor(0.3), cam); // dispose sonrası sessiz
  });

  it('renkler doğrusal uzaya çevrilir (sRGB → linear)', () => {
    const sky = createSky(THREE, {});
    const s = stateFor(0.25);
    sky.update(0.016, s, null);
    const u = sky.object3D.children[0].material.uniforms;
    expect(u.uTop.value.r).toBeCloseTo(srgbToLinear(s.skyTop[0]), 5);
    expect(u.uFog.value.b).toBeCloseTo(srgbToLinear(s.fog[2]), 5);
    sky.dispose();
  });

  it('bulut modu kaliteye göre kademelenir ve shader yeniden derlenir', () => {
    const sky = createSky(THREE, { quality: 'high' });
    const mat = sky.object3D.children[0].material;
    expect(mat.defines.CLOUD_OCT).toBe(5);
    expect(mat.defines.CLOUD_CIRRUS).toBe(1);
    const v = mat.version;
    sky.setQuality('low');
    expect(sky.cloudMode).toBe('basit');
    expect(mat.defines.CLOUD_OCT).toBe(2);
    expect(mat.defines.CLOUD_SHADE).toBe(0);
    expect(mat.version).toBeGreaterThan(v);
    sky.setQuality({ clouds: 'orta' });
    expect(mat.defines.CLOUD_OCT).toBe(3);
    sky.dispose();
  });

  it('aurora yalnız Donmuş Zirveler/Çekirdek bölgesinde', () => {
    const sky = createSky(THREE, {});
    const u = sky.object3D.children[0].material.uniforms;
    sky.update(0.016, stateFor(0.78, 0), null);
    expect(u.uAurora.value).toBe(0);
    sky.update(0.016, stateFor(0.78, 3), null);
    expect(u.uAurora.value).toBeGreaterThan(0.9);
    sky.update(0.016, stateFor(0.78, 4), null);
    expect(u.uAurora.value).toBeGreaterThan(0.2);
    expect(u.uAurora.value).toBeLessThan(0.6);
    sky.dispose();
  });

  it('rüzgâr bulut kaymasını ilerletir; azaltılmış harekette hareket kapanır', () => {
    const sky = createSky(THREE, {});
    const u = sky.object3D.children[0].material.uniforms;
    const w = createWeather(3);
    w.wind.x = 1;
    w.wind.z = 0.5;
    const s = stateFor(0.3, 0, w);
    sky.update(1, s, null);
    const x1 = u.uCloudOff.value.x;
    expect(x1).toBeGreaterThan(0);
    sky.setReducedMotion(true);
    sky.update(1, s, null);
    expect(u.uMotion.value).toBe(0);
    expect(u.uCloudOff.value.x - x1).toBeLessThan(x1 * 0.5);
    sky.dispose();
  });
});
