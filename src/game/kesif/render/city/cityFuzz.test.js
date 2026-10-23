/*
 * citylook fuzz: rastgele/bozuk girdilerle hiçbir şehir görünümü modülü atmaz, uniform/öznitelik değerleri hep sonlu kalır.
 * (__proto__/constructor anahtarları, NaN/Infinity, aşırı büyük sayılar, yanlış tipler.)
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateAtlasPixels, createAtlasTextures } from '../atlas.js';
import { createChunkMaterials } from '../materials.js';
import { normalizeSkylineBox, buildSkylineInstances, createSkylineImpostor } from './skylineImpostor.js';
import { pickHoloAnchors, createHoloAds, selectVisible } from './holoAds.js';
import { createCityWeather, ventsNear } from './cityWeather.js';
import { createCityLook } from './cityLook.js';
import { stepWet, neonUniformFor, wetTargetFor } from './cityLookMath.js';
import { layerLevels, planLayers, createCityAmbience } from '../../audioCity.js';
import { computeSky, createSkyState, createWeather, updateWeather, setWeatherTime, restoreWeather, serializeWeather } from '../../sim/daynight.js';
import { NEON_PALETTE } from '../../sim/daynightNeon.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const WEIRD = [NaN, Infinity, -Infinity, 0, -0, 1, -1, 1e-30, 1e30, -1e30, 2 ** 53, '5', 'x', null, undefined, true, false, [], {}, [1, 2], () => 1];
const KEYS = ['__proto__', 'constructor', 'prototype', 'cx', 'cz', 'w', 'd', 'h', 'y0', 'x', 'z', 'x0', 'z0', 'hue', 'seed', 'id', 'district', 'floors', 'top', 'y1'];

function junk(r) {
  const pick = () => WEIRD[Math.floor(r() * WEIRD.length)];
  const t = r();
  if (t < 0.2) return pick();
  if (t < 0.35) return [pick(), pick(), pick(), pick(), pick(), pick(), pick()];
  const o = {};
  const n = Math.floor(r() * 9);
  // JSON.parse gibi ÖZ özellik olarak yaz ('__proto__' prototipi değiştirmesin; kayıt/ağ verisi böyle gelir)
  for (let i = 0; i < n; i++) Object.defineProperty(o, KEYS[Math.floor(r() * KEYS.length)], { value: pick(), enumerable: true, writable: true, configurable: true });
  return o;
}

describe('fuzz: siluet', () => {
  it('2000 bozuk kutu: normalize atmaz; geçerli çıkanlar sonlu ve sınırlı; build/setBoxes atmaz', () => {
    const r = lcg(5);
    const list = [];
    for (let i = 0; i < 2000; i++) {
      const j = junk(r);
      let n = null;
      expect(() => { n = normalizeSkylineBox(j); }).not.toThrow();
      if (n) {
        ['cx', 'cz', 'w', 'd', 'h', 'y0'].forEach((k) => expect(Number.isFinite(n[k])).toBe(true));
        expect(n.w).toBeGreaterThanOrEqual(2);
        expect(n.w).toBeLessThanOrEqual(240);
        expect(n.h).toBeGreaterThanOrEqual(4);
        expect(n.h).toBeLessThanOrEqual(340);
      }
      list.push(j);
    }
    const b = buildSkylineInstances(list, 600);
    expect(b.boxCount).toBeLessThanOrEqual(600);
    for (let i = 0; i < b.a.length; i++) expect(Number.isFinite(b.a[i])).toBe(true);
    for (let i = 0; i < b.b.length; i++) expect(Number.isFinite(b.b[i])).toBe(true);
    const sky = createSkylineImpostor(THREE, {});
    expect(() => sky.setBoxes(list)).not.toThrow();
    expect(sky.getCount()).toBeLessThanOrEqual(600);
    [NaN, -5, 1e9, 'x', null].forEach((m) => expect(() => sky.setMax(m)).not.toThrow());
    sky.dispose();
  });

  it('prototip kirliliği olmaz', () => {
    normalizeSkylineBox(JSON.parse('{"__proto__":{"polluted":1},"cx":1,"cz":1,"w":5,"d":5,"h":20}'));
    buildSkylineInstances([JSON.parse('{"__proto__":{"polluted":1},"cx":1,"cz":1,"w":5,"d":5,"h":20}')], 10);
    expect({}.polluted).toBeUndefined();
  });
});

describe('fuzz: holo reklam, hava parçacıkları, menhol', () => {
  it('holo: pick/select/create bozuk girdilerle atmaz; görünür ≤ 8, toplam ≤ 24', () => {
    const r = lcg(9);
    const list = [];
    for (let i = 0; i < 400; i++) list.push(junk(r));
    for (let i = 0; i < 100; i++) list.push(normalizeSkylineBox({ cx: (r() - 0.5) * 1500, cz: (r() - 0.5) * 1500, w: 10 + r() * 30, d: 10 + r() * 30, h: 40 + r() * 280 }));
    const a = pickHoloAnchors(list, junk(r), 24);
    expect(a.length).toBeLessThanOrEqual(24);
    const ads = createHoloAds(THREE, {});
    expect(() => ads.setAnchors(a.concat(list))).not.toThrow();
    const cam = new THREE.PerspectiveCamera();
    cam.updateMatrixWorld(true);
    for (let i = 0; i < 20; i++) {
      cam.position.set((r() - 0.5) * 1600, 64 + r() * 300, (r() - 0.5) * 1600);
      cam.rotation.set(0, r() * 6.28, 0);
      cam.updateMatrixWorld(true);
      expect(() => ads.update(0.3, cam)).not.toThrow();
      expect(ads.getVisibleCount()).toBeLessThanOrEqual(8);
    }
    const out = [];
    expect(() => selectVisible(list, { x: NaN, y: 0, z: 0 }, null, 8, out)).not.toThrow();
    expect(() => ads.update(NaN, null)).not.toThrow();
    ads.dispose();
  });

  it('şehir havası: bozuk durum/kamera/kalite girdisi atmaz, uniform değerleri sonlu', () => {
    const r = lcg(3);
    const w = createCityWeather(THREE, {});
    const u = w.object3D.material.uniforms;
    const cam = new THREE.PerspectiveCamera();
    for (let i = 0; i < 400; i++) {
      cam.position.set((r() - 0.5) * 4000, (r() - 0.2) * 400, (r() - 0.5) * 4000);
      cam.updateMatrixWorld(true);
      const st = r() < 0.3 ? junk(r) : {
        rain: junk(r), night: junk(r), wind: junk(r), light: junk(r), shelter: junk(r), underwater: r() < 0.1,
      };
      expect(() => w.update(r() < 0.1 ? junk(r) : r() * 0.3, st, r() < 0.1 ? null : cam)).not.toThrow();
      if (i % 50 === 0) expect(() => w.setQuality(junk(r))).not.toThrow();
      ['uRain', 'uNight', 'uPlaneFade', 'uTime', 'uGround', 'uBox'].forEach((k) => expect(Number.isFinite(u[k].value), k).toBe(true));
      u.uVis.value.toArray().forEach((v) => expect(Number.isFinite(v)).toBe(true));
      u.uVent.value.forEach((v) => v.toArray().forEach((c) => expect(Number.isFinite(c)).toBe(true)));
    }
    w.setSeed(junk(r));
    w.dispose();
    const out = new Float32Array(128);
    for (let i = 0; i < 200; i++) expect(() => ventsNear(junk(r), junk(r), junk(r), junk(r), junk(r), out, junk(r))).not.toThrow();
  });
});

describe('fuzz: matematik, ses, gökyüzü', () => {
  it('stepWet/neonUniformFor/wetTargetFor/layerLevels bozuk girdide atmaz ve sınırlı kalır', () => {
    const r = lcg(1);
    const out = new Float32Array(4);
    for (let i = 0; i < 3000; i++) {
      const a = junk(r);
      const b = junk(r);
      const c = junk(r);
      const v = stepWet(a, b, c);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      neonUniformFor(out, a, b, c);
      out.forEach((x) => expect(Number.isFinite(x)).toBe(true));
      const wt = wetTargetFor(junk(r));
      expect(wt).toBeGreaterThanOrEqual(0);
      expect(wt).toBeLessThanOrEqual(1);
      const l = layerLevels({ night: a, rain: b, shelter: c });
      Object.keys(l).forEach((k) => {
        expect(Number.isFinite(l[k])).toBe(true);
        expect(l[k]).toBeGreaterThanOrEqual(0);
        expect(l[k]).toBeLessThanOrEqual(1);
      });
      expect(Array.isArray(planLayers(l, junk(r)))).toBe(true);
    }
  });

  it('ambiyans zamanlayıcısı bozuk durum/kare süresi ve bozuk play ile atmaz', () => {
    const r = lcg(2);
    const bad = createCityAmbience({ play: () => { throw new Error('ses hatası'); } });
    expect(() => bad.update(0.1, { night: 1, rain: 0, shelter: 0 })).toThrow(); // play atarsa çağıran yakalar (G.sound zaten try/catch)
    const amb = createCityAmbience({ play: () => ({ stop() { throw new Error('x'); } }), nodeCap: junk(r) });
    for (let i = 0; i < 500; i++) {
      expect(() => amb.update(junk(r), r() < 0.2 ? junk(r) : { night: junk(r), rain: junk(r), shelter: junk(r), underwater: r() < 0.1 })).not.toThrow();
    }
    expect(() => amb.stop()).not.toThrow();
    expect(() => amb.dispose()).not.toThrow();
  });

  it('computeSky (şehir paleti) + hava çizelgesi: rastgele faz/hava/zaman ile atmaz, her değer sonlu ve 0..1', () => {
    const r = lcg(4);
    const w = createWeather(7, { table: 'neon' });
    const o = createSkyState();
    for (let i = 0; i < 3000; i++) {
      const fake = r() < 0.4 ? { cloudCover: junk(r), intensity: junk(r), smog: junk(r) } : w;
      expect(() => computeSky(r() < 0.1 ? junk(r) : r() * 4 - 1, junk(r), fake, o, NEON_PALETTE)).not.toThrow();
      ['skyTop', 'skyHorizon', 'fog', 'sun', 'ambient', 'cityGlow'].forEach((k) => o[k].forEach((v) => expect(Number.isFinite(v), k).toBe(true)));
      ['skyTop', 'skyHorizon', 'fog', 'sun', 'ambient'].forEach((k) => o[k].forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }));
      expect(Number.isFinite(o.fogDensity)).toBe(true);
      expect(o.fogDensity).toBeGreaterThan(0);
      expect(o.fogDensity).toBeLessThanOrEqual(2.4 + 1e-9);
    }
    for (let i = 0; i < 400; i++) {
      updateWeather(w, r() * 40, {});
      expect(w.storm).toBeGreaterThanOrEqual(0);
      expect(w.storm).toBeLessThanOrEqual(1);
      expect(w.smog).toBeGreaterThanOrEqual(0);
      expect(w.smog).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < 100; i++) {
      expect(() => setWeatherTime(w, junk(r))).not.toThrow();
      expect(() => restoreWeather({ seed: junk(r), t: junk(r) }, { table: 'neon' })).not.toThrow();
    }
    expect(serializeWeather(w)).toEqual({ seed: w.seed, t: w.t });
  });
});

describe('fuzz: cityLook çerçevesi', () => {
  it('rastgele hava/saat/kalite/G alanlarıyla 1500 kare: atmaz, uniform değerleri sonlu', () => {
    const r = lcg(6);
    const pixels = generateAtlasPixels({ quality: 'low' });
    const atlas = createAtlasTextures(THREE, pixels);
    const materials = createChunkMaterials(THREE, atlas, undefined, { quality: 'high' });
    const camera = new THREE.PerspectiveCamera(70, 1.7, 0.06, 288);
    const G = {
      THREE,
      scene: new THREE.Scene(),
      camera,
      materials,
      postfx: { setGrade() {}, setGradeRain() {} },
      weatherLayer: { setStyle() {} },
      weatherSim: createWeather(2, { table: 'neon' }),
      clock: { dayLengthSec: 600, time: 400, day: 0, origin: 0.25 },
      world: { dim: 'neon', seed: 99, getLight: () => 0xf0 },
      eye: { x: 0, y: 65, z: 0 },
      quality: { settings: { effTier: 'high' } },
      chunkManager: { getViewDist: () => 7 },
      sound: () => ({ stop() {} }),
      dim: 'neon',
    };
    const look = createCityLook(G);
    look.apply('neon');
    for (let i = 0; i < 1500; i++) {
      const t = r();
      if (t < 0.05) G.weatherSim = { table: 'neon', intensity: junk(r), wind: junk(r), cloudCover: junk(r), smog: junk(r), cityState: 'x' };
      else if (t < 0.1) G.weatherSim = createWeather(2, { table: 'neon' });
      else if (t < 0.15) G.clock.time = junk(r);
      else if (t < 0.2) G.quality = r() < 0.5 ? junk(r) : { settings: { effTier: ['low', 'medium', 'high', 'x', junk(r)][Math.floor(r() * 5)] } };
      else if (t < 0.25) G.dim = r() < 0.5 ? 'overworld' : 'neon';
      else if (t < 0.3) G.reducedMotion = r() < 0.5;
      else if (t < 0.33) G.eye = junk(r);
      else if (t < 0.36) G.world.getLight = () => junk(r);
      if (r() < 0.3 && G.weatherSim.cycle) updateWeather(G.weatherSim, r() * 0.2, {});
      camera.position.set((r() - 0.5) * 3000, r() * 340, (r() - 0.5) * 3000);
      camera.updateMatrixWorld(true);
      expect(() => look.frame(r() < 0.1 ? junk(r) : r() * 0.1)).not.toThrow();
      const u = materials.uniforms;
      expect(Number.isFinite(u.uWet.value)).toBe(true);
      expect(Number.isFinite(u.uRain.value)).toBe(true);
      u.uNeon.value.toArray().forEach((v) => expect(Number.isFinite(v)).toBe(true));
    }
    look.dispose();
    materials.dispose();
  });
});
