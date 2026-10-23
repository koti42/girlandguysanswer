import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ventsNear, createCityWeather, VENT_MAX, CITY_WEATHER_BOX, CITY_WEATHER_VERTEX, CITY_WEATHER_FRAGMENT,
} from './cityWeather.js';
import { CITY_QUALITY } from '../quality.js';

function camAt(x, y, z) {
  const c = new THREE.PerspectiveCamera(70, 1.7, 0.06, 1600);
  c.position.set(x, y, z);
  c.updateMatrixWorld(true);
  return c;
}
const base = (o) => Object.assign({
  rain: 0, night: 1, wind: { x: 0.1, z: 0 }, light: [0.2, 0.22, 0.35], shelter: 0, underwater: false,
}, o || {});
function run(w, st, cam, secs) {
  const n = Math.ceil(secs / 0.05);
  for (let i = 0; i < n; i++) w.update(0.05, st, cam);
}

describe('ventsNear (menhol/buhar kaynakları)', () => {
  it('belirlenimci; en çok 32; en yakından uzağa sıralı; radius içinde', () => {
    const a = new Float32Array(VENT_MAX * 4);
    const b = new Float32Array(VENT_MAX * 4);
    const n1 = ventsNear(7, 120, -40, 110, VENT_MAX, a);
    const n2 = ventsNear(7, 120, -40, 110, VENT_MAX, b);
    expect(n1).toBe(n2);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(n1).toBeGreaterThan(8);
    expect(n1).toBeLessThanOrEqual(VENT_MAX);
    let prev = -1;
    for (let i = 0; i < n1; i++) {
      const d = Math.hypot(a[i * 4] - 120, a[i * 4 + 2] + 40);
      expect(d).toBeLessThanOrEqual(110 + 1e-6);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = d;
    }
  });

  it('kaynaklar yol ızgarası (x=i·80 / z=j·80, ±2,5 blok) üzerinde, sokak düzleminde; şiddet 0,6..1,0', () => {
    const out = new Float32Array(VENT_MAX * 4);
    for (const seed of [1, 99, -5, 123456]) {
      const n = ventsNear(seed, 0, 0, 120, VENT_MAX, out, 64);
      for (let i = 0; i < n; i++) {
        const x = out[i * 4];
        const z = out[i * 4 + 2];
        const dx = Math.abs(x - Math.round(x / 80) * 80);
        const dz = Math.abs(z - Math.round(z / 80) * 80);
        expect(Math.min(dx, dz)).toBeLessThanOrEqual(2.5 + 1e-6);
        expect(out[i * 4 + 1]).toBeCloseTo(64.1, 4);
        expect(out[i * 4 + 3]).toBeGreaterThanOrEqual(0.6);
        expect(out[i * 4 + 3]).toBeLessThanOrEqual(1.0 + 1e-9);
      }
    }
  });

  it('şehir sınırı dışında (i,j ∈ [−9,9]) kaynak yok; max<32 ve bozuk girdi güvenli; fazlası sıfırlanır', () => {
    const out = new Float32Array(VENT_MAX * 4).fill(7);
    expect(ventsNear(1, 5000, 5000, 60, VENT_MAX, out)).toBe(0);
    expect(out.every((v) => v === 0)).toBe(true);
    expect(ventsNear(1, 0, 0, 120, 5, out)).toBe(5);
    expect(ventsNear(NaN, NaN, NaN, NaN, NaN, out)).toBeGreaterThanOrEqual(0);
    expect(ventsNear(1, 0, 0, -5, 3, out)).toBeLessThanOrEqual(3);
  });

  it('farklı tohum farklı yerleşim; aynı tohumda komşu merkezler tutarlı (ortak kaynaklar aynı koordinat)', () => {
    const a = new Float32Array(VENT_MAX * 4);
    const b = new Float32Array(VENT_MAX * 4);
    ventsNear(1, 0, 0, 120, VENT_MAX, a);
    ventsNear(2, 0, 0, 120, VENT_MAX, b);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    const c = new Float32Array(VENT_MAX * 4);
    ventsNear(1, 20, 20, 120, VENT_MAX, c);
    const set = new Set();
    for (let i = 0; i < VENT_MAX; i++) if (a[i * 4 + 3] > 0) set.add(a[i * 4].toFixed(3) + ',' + a[i * 4 + 2].toFixed(3));
    let common = 0;
    for (let i = 0; i < VENT_MAX; i++) if (c[i * 4 + 3] > 0 && set.has(c[i * 4].toFixed(3) + ',' + c[i * 4 + 2].toFixed(3))) common++;
    expect(common).toBeGreaterThan(10);
  });
});

describe('createCityWeather', () => {
  it('TEK çizim çağrısı; tek InstancedMesh; örnek sayısı sabit (kalite örnek kırpar, geometri değişmez)', () => {
    const w = createCityWeather(THREE, { quality: 'high' });
    expect(w.object3D.isMesh).toBe(true);
    expect(w.object3D.geometry.isInstancedBufferGeometry).toBe(true);
    const total = CITY_QUALITY.high.rings + CITY_QUALITY.high.steam + CITY_QUALITY.high.sparks + CITY_QUALITY.high.dust;
    expect(w.object3D.geometry.instanceCount).toBe(total);
    expect(w.object3D.geometry.getAttribute('aSeed').count).toBe(total);
    w.setQuality('low');
    expect(w.object3D.geometry.instanceCount).toBe(total);
    w.dispose();
  });

  it('yağmur yokken halka yok; yağmurla halka sayısı artar; kalite kademesi sayıları böler', () => {
    const w = createCityWeather(THREE, { quality: 'high', seed: 3 });
    const cam = camAt(0, 65.7, 0);
    run(w, base({ rain: 0 }), cam, 1);
    expect(w.getStats().rings).toBe(0);
    run(w, base({ rain: 0.3 }), cam, 1);
    const lo = w.getStats().rings;
    run(w, base({ rain: 1 }), cam, 1);
    const hi = w.getStats().rings;
    expect(hi).toBeGreaterThan(lo);
    expect(hi).toBe(CITY_QUALITY.high.rings);
    w.setQuality('medium');
    run(w, base({ rain: 1 }), cam, 1);
    expect(w.getStats().rings).toBe(CITY_QUALITY.medium.rings);
    w.setQuality('low');
    run(w, base({ rain: 1 }), cam, 1);
    const s = w.getStats();
    expect(s.rings).toBe(CITY_QUALITY.low.rings);
    expect(s.steam).toBe(CITY_QUALITY.low.steam);
    expect(s.sparks).toBe(CITY_QUALITY.low.sparks);
    expect(s.dust).toBe(CITY_QUALITY.low.dust);
    w.dispose();
  });

  it('kamera çatıda/yeraltında sokak halkaları solar; sığınakta kesilir; su altında hiçbir şey görünmez', () => {
    const w = createCityWeather(THREE, { quality: 'high' });
    const u = w.object3D.material.uniforms;
    run(w, base({ rain: 1 }), camAt(0, 65.7, 0), 0.3);
    expect(u.uPlaneFade.value).toBeCloseTo(1, 6);
    run(w, base({ rain: 1 }), camAt(0, 200, 0), 0.3);
    expect(u.uPlaneFade.value).toBe(0);
    run(w, base({ rain: 1 }), camAt(0, 40, 0), 0.3);
    expect(u.uPlaneFade.value).toBe(0);
    run(w, base({ rain: 1, shelter: 1 }), camAt(0, 65.7, 0), 0.3);
    expect(u.uPlaneFade.value).toBeLessThan(0.1);
    run(w, base({ rain: 1, underwater: true }), camAt(0, 65.7, 0), 0.3);
    expect(w.object3D.visible).toBe(false);
    expect(w.drawCalls).toBe(0);
    w.dispose();
  });

  it('reducedMotion: sayı ×0,4, kıvılcım kapalı, hareket 0; kapatınca geri gelir', () => {
    const w = createCityWeather(THREE, { quality: 'high', reducedMotion: true });
    const cam = camAt(0, 65.7, 0);
    run(w, base({ rain: 1 }), cam, 0.5);
    const s = w.getStats();
    expect(s.sparks).toBe(0);
    expect(s.rings).toBe(Math.round(CITY_QUALITY.high.rings * 0.4));
    expect(w.object3D.material.uniforms.uMotion.value).toBe(0);
    w.setReducedMotion(false);
    run(w, base({ rain: 1 }), cam, 0.5);
    expect(w.getStats().sparks).toBe(CITY_QUALITY.high.sparks);
    expect(w.object3D.material.uniforms.uMotion.value).toBe(1);
    w.dispose();
  });

  it('menholler kameraya göre yenilenir (14 blok kayınca / 6 sn); uniform dizisi 32 girişli', () => {
    const w = createCityWeather(THREE, { quality: 'high', seed: 5 });
    const vent = w.object3D.material.uniforms.uVent.value;
    expect(vent.length).toBe(VENT_MAX);
    run(w, base(), camAt(0, 65.7, 0), 0.2);
    const first = vent.filter((v) => v.w > 0).length;
    expect(first).toBeGreaterThan(5);
    const before = vent[0].x;
    run(w, base(), camAt(300, 65.7, 300), 2);
    expect(vent[0].x).not.toBe(before);
    expect(w.getStats().vents).toBeGreaterThan(0);
    w.setSeed(6);
    run(w, base(), camAt(300, 65.7, 300), 0.1);
    expect(vent.filter((v) => v.w > 0).length).toBeGreaterThan(0);
    w.dispose();
  });

  it('girdiler sonlu olmasa da uniform değerleri sonlu kalır; dispose çift çağrıda güvenli', () => {
    const w = createCityWeather(THREE, { quality: 'high' });
    const u = w.object3D.material.uniforms;
    w.update(NaN, { rain: NaN, night: Infinity, wind: { x: NaN, z: Infinity }, light: [NaN, 1, 2], shelter: -3, underwater: false }, camAt(0, 65, 0));
    w.update(0.1, null, null);
    ['uRain', 'uNight', 'uPlaneFade', 'uTime'].forEach((k) => expect(Number.isFinite(u[k].value), k).toBe(true));
    ['uWind', 'uCam', 'uVis', 'uLight'].forEach((k) => {
      const v = u[k].value;
      const comps = v.isColor ? [v.r, v.g, v.b] : v.toArray();
      comps.forEach((c) => expect(Number.isFinite(c), k).toBe(true));
    });
    w.dispose();
    w.dispose();
  });

  it('onBeforeRender kamera konumunu yazar; kutu boyutu uniform olarak verilir', () => {
    const w = createCityWeather(THREE, {});
    const cam = camAt(12, 70, -9);
    w.object3D.onBeforeRender(null, null, cam);
    const c = w.object3D.material.uniforms.uCam.value;
    expect([c.x, c.y, c.z]).toEqual([12, 70, -9]);
    expect(w.object3D.material.uniforms.uBox.value).toBe(CITY_WEATHER_BOX);
    w.dispose();
  });

  it('ön-çarpılmış alfa harmanlama, derinlik testi açık/yazma kapalı', () => {
    const w = createCityWeather(THREE, {});
    const m = w.object3D.material;
    expect(m.blending).toBe(THREE.CustomBlending);
    expect(m.blendSrc).toBe(THREE.OneFactor);
    expect(m.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(m.depthWrite).toBe(false);
    expect(m.depthTest).toBe(true);
    w.dispose();
  });
});

describe('şehir hava shader kaynağı', () => {
  it('pow yok, NaN üreten işlemler yok; parantez dengeli; ton eşleme/renk uzayı parçaları var', () => {
    [CITY_WEATHER_VERTEX, CITY_WEATHER_FRAGMENT].forEach((src) => {
      const count = (ch) => src.split(ch).length - 1;
      expect(count('{')).toBe(count('}'));
      expect(count('(')).toBe(count(')'));
      expect(src).not.toMatch(/\bpow\(/);
      expect(src).not.toMatch(/\blog\(/);
      expect(src).not.toMatch(/\bsqrt\(/);
    });
    expect(CITY_WEATHER_FRAGMENT).toContain('#include <tonemapping_fragment>');
    expect(CITY_WEATHER_FRAGMENT).toContain('#include <colorspace_fragment>');
    expect(CITY_WEATHER_VERTEX).toContain('uVent[32]');
  });

  it('yalnız su buharı, kıvılcım, ışık tozu ve halka: yasak/aile dışı sözcük yok', () => {
    const src = (CITY_WEATHER_VERTEX + CITY_WEATHER_FRAGMENT).toLowerCase();
    ['blood', 'kan', 'fire', 'smoke bomb', 'siren', 'gun'].forEach((w) => expect(src.includes(w)).toBe(false));
  });
});
