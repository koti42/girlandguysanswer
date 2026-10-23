import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateAtlasPixels, createAtlasTextures } from './atlas.js';
import {
  createMaterialUniforms, createChunkMaterials, updateMaterialsFrame, createChunkGeometry, cityDefinesFor,
} from './materials.js';
import { createWeatherLayer, WEATHER_FRAG, WEATHER_VERT } from './weather.js';
import { createSky } from './sky.js';
import { SKY_FRAGMENT } from './skyShaders.js';
import { createSkyState, computeSky, createWeather } from '../sim/daynight.js';
import { meshChunk } from './mesher.js';
import { B } from '../sim/blocks.js';

const pixels = generateAtlasPixels({ quality: 'low' });
const atlas = createAtlasTextures(THREE, pixels);

describe('chunk malzemesi: şehir varyantı', () => {
  it('varsayılan ana diyar (CITY yok); yeni uniform’lar tanımlı ve sıfır/etkisiz', () => {
    const m = createChunkMaterials(THREE, atlas, null, { quality: 'high' });
    expect(m.city).toBe(false);
    ['opaque', 'cutout', 'transparent'].forEach((k) => {
      ['CITY', 'CITY_PUDDLE', 'CITY_RINGS', 'CITY_WINDOW_A_OFF'].forEach((d) => expect(d in m[k].defines).toBe(false));
    });
    expect(m.uniforms.uWet.value).toBe(0);
    expect(m.uniforms.uRain.value).toBe(0);
    expect(m.uniforms.uNeon.value.toArray()).toEqual([0, 0.45, 0, 0]);
    m.dispose();
  });

  it('setCity: değişince true döner + shader yeniden derlenir (version artar), değişmezse false ve yeniden derleme yok', () => {
    const m = createChunkMaterials(THREE, atlas, null, { quality: 'high' });
    const v0 = m.opaque.version;
    expect(m.setCity(false)).toBe(false);
    expect(m.opaque.version).toBe(v0);
    expect(m.setCity(true)).toBe(true);
    expect(m.city).toBe(true);
    expect(m.opaque.version).toBeGreaterThan(v0);
    ['opaque', 'cutout', 'transparent'].forEach((k) => expect('CITY' in m[k].defines).toBe(true));
    const v1 = m.opaque.version;
    expect(m.setCity(true)).toBe(false);
    expect(m.opaque.version).toBe(v1);
    expect(m.setCity(false)).toBe(true);
    expect('CITY' in m.cutout.defines).toBe(false);
    m.dispose();
  });

  it('kalite tanımları şehir modunda kademeyle değişir ve setQuality şehir bayrağını korur', () => {
    expect(cityDefinesFor('low')).toEqual({ CITY_PUDDLE: false, CITY_RINGS: false, CITY_WINDOW_A_OFF: true, CITY_LDR: true });
    expect(cityDefinesFor('medium')).toEqual({ CITY_PUDDLE: true, CITY_RINGS: false, CITY_WINDOW_A_OFF: false, CITY_LDR: false });
    expect(cityDefinesFor('high')).toEqual({ CITY_PUDDLE: true, CITY_RINGS: true, CITY_WINDOW_A_OFF: false, CITY_LDR: false });
    expect(cityDefinesFor('bilinmeyen')).toEqual(cityDefinesFor('high'));
    const m = createChunkMaterials(THREE, atlas, null, { quality: 'high' });
    m.setCity(true);
    m.setQuality('low');
    expect('CITY' in m.opaque.defines).toBe(true);
    expect('CITY_RINGS' in m.opaque.defines).toBe(false);
    expect('CITY_WINDOW_A_OFF' in m.opaque.defines).toBe(true);
    m.setQuality('high');
    expect('CITY_RINGS' in m.transparent.defines).toBe(true);
    m.setCity(false);
    m.setQuality('medium');
    expect('CITY_PUDDLE' in m.opaque.defines).toBe(false); // ana diyarda şehir tanımı sızmaz
    m.dispose();
  });

  it('ana diyar tanımları (USE_NORMAL_MAP/HIGH_DETAIL/PASS) şehir bayrağından etkilenmez', () => {
    const m = createChunkMaterials(THREE, atlas, null, { quality: 'medium' });
    const before = JSON.stringify([m.opaque.defines, m.cutout.defines, m.transparent.defines]);
    m.setCity(true);
    m.setCity(false);
    expect(JSON.stringify([m.opaque.defines, m.cutout.defines, m.transparent.defines])).toBe(before);
    expect(m.opaque.defines.PASS).toBe(0);
    expect(m.cutout.defines.PASS).toBe(1);
    expect(m.transparent.defines.PASS).toBe(2);
    m.dispose();
  });

  it('createChunkMaterials({city:true}) doğrudan şehir varyantı kurar', () => {
    const m = createChunkMaterials(THREE, atlas, null, { quality: 'low', city: true });
    expect(m.city).toBe(true);
    expect('CITY' in m.opaque.defines).toBe(true);
    m.dispose();
  });

  it('updateMaterialsFrame şehir uniform’larına dokunmaz (cityLook yazar); createChunkGeometry ana diyar yolu aCity eklemez', () => {
    const m = createChunkMaterials(THREE, atlas, null, { quality: 'high' });
    m.uniforms.uWet.value = 0.7;
    m.uniforms.uNeon.value.set(1, 1.25, 0.5, 1);
    updateMaterialsFrame(m, { time: 3, dayFactor: 0.5, fogNear: 10, fogFar: 99 });
    expect(m.uniforms.uWet.value).toBe(0.7);
    expect(m.uniforms.uNeon.value.toArray()).toEqual([1, 1.25, 0.5, 1]);
    const VOL = 16 * 16 * 128;
    const c = { cx: 0, cz: 0, blocks: new Uint8Array(VOL), light: new Uint8Array(VOL).fill(0xf0), biomeMap: new Uint8Array(256) };
    c.blocks[((10 * 16) + 4) * 16 + 4] = B.STONE;
    const mesh = meshChunk(c, {}, pixels.uvTable, { nullNeighbor: 'air', city: true });
    expect(mesh.opaque.city).toBeDefined();
    const g = createChunkGeometry(THREE, mesh.opaque, mesh.bounds);
    expect(g.getAttribute('aCity')).toBeUndefined();
    m.dispose();
  });
});

describe('weather.js şehir stili', () => {
  it('varsayılan ana diyar (uStyle 0); setStyle(city) 1, başka her şey 0', () => {
    const w = createWeatherLayer(THREE, {});
    const u = w.object3D.material.uniforms;
    expect(u.uStyle.value).toBe(0);
    w.setStyle('city');
    expect(u.uStyle.value).toBe(1);
    w.setStyle('overworld');
    expect(u.uStyle.value).toBe(0);
    w.setStyle('city');
    w.setStyle(undefined);
    expect(u.uStyle.value).toBe(0);
    w.dispose();
  });

  it('şehir dalları uStyle > 0.5 koruması altında (ana diyar aritmetiği değişmez)', () => {
    expect(WEATHER_VERT).toContain('if (uStyle > 0.5) {');
    expect(WEATHER_FRAG).toContain('if (uStyle > 0.5) {');
    // ana diyar yağmur rengi satırı korunur
    expect(WEATHER_FRAG).toContain('col = vec3(0.66, 0.74, 0.86) * uLight;');
    expect(WEATHER_VERT).toContain('float len = 0.5 + 0.025 * fall;');
    expect(WEATHER_VERT).toContain('float wid = 0.022;');
  });

  it('şehir stilinde de yağış aynı kurallarla görünür/kaybolur', () => {
    const cam = new THREE.PerspectiveCamera();
    cam.updateMatrixWorld();
    const w = createWeatherLayer(THREE, {});
    w.setStyle('city');
    for (let i = 0; i < 80; i++) w.update(0.05, { kind: 'rain', intensity: 1, wind: { x: 0.1, z: 0 } }, cam);
    expect(w.getVisibleCount()).toBeGreaterThan(100);
    for (let i = 0; i < 160; i++) w.update(0.05, { kind: null, intensity: 0 }, cam);
    expect(w.getVisibleCount()).toBe(0);
    w.dispose();
  });
});

describe('gökyüzü: şehir parıltısı (uCityGlow)', () => {
  it('shader ana diyarda (uCityGlow = 0) ek işlem yapmaz; uniform varsayılan 0', () => {
    expect(SKY_FRAGMENT).toContain('uniform vec3 uCityGlow;');
    expect(SKY_FRAGMENT).toContain('if (uCityGlow.r + uCityGlow.g + uCityGlow.b > 0.0) {');
    const sky = createSky(THREE, { quality: 'high' });
    const g = sky.object3D.children[0].material.uniforms.uCityGlow.value;
    expect([g.r, g.g, g.b]).toEqual([0, 0, 0]);
    sky.dispose();
  });

  it('skyState.cityGlow doğrusal rgb olarak yazılır; yoksa/bozuksa sıfırlanır; şehir gecesi parıltı verir', () => {
    const sky = createSky(THREE, { quality: 'high' });
    const mat = sky.object3D.children[0].material;
    const cam = new THREE.PerspectiveCamera();
    cam.updateMatrixWorld();
    const w = createWeather(2, { table: 'neon' });
    const s = createSkyState();
    s.sunDir = { x: 0, y: -1, z: 0 };
    s.moonDir = { x: 0, y: 1, z: 0 };
    computeSky(0.75, 0, w, s);
    expect(s.cityGlow.some((v) => v > 0)).toBe(true);
    sky.update(0.016, s, cam);
    const g = mat.uniforms.uCityGlow.value;
    expect(g.r).toBeCloseTo(s.cityGlow[0], 9);
    expect(g.g).toBeCloseTo(s.cityGlow[1], 9);
    expect(g.b).toBeCloseTo(s.cityGlow[2], 9);
    s.cityGlow = [NaN, 1, 2];
    sky.update(0.016, s, cam);
    expect([g.r, g.g, g.b]).toEqual([0, 0, 0]);
    delete s.cityGlow;
    sky.update(0.016, s, cam);
    expect([g.r, g.g, g.b]).toEqual([0, 0, 0]);
    computeSky(0.25, 0, createWeather(2), s);
    sky.update(0.016, s, cam);
    expect([g.r, g.g, g.b]).toEqual([0, 0, 0]);
    sky.dispose();
  });
});

describe('createMaterialUniforms: şehir uniform’ları', () => {
  it('uWet/uNeon/uRain verilen override ile değiştirilebilir ve paylaşılan nesnede kalır', () => {
    const u = createMaterialUniforms(THREE, { uWet: { value: 0.3 } });
    expect(u.uWet.value).toBe(0.3);
    expect(u.uNeon.value.isVector4).toBe(true);
    const shared = {};
    const m = createChunkMaterials(THREE, atlas, shared);
    expect(shared.uWet).toBeDefined();
    expect(shared.uNeon).toBeDefined();
    expect(shared.uRain).toBeDefined();
    m.dispose();
  });
});
