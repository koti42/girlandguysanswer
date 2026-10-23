import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { generateAtlasPixels, createAtlasTextures } from '../atlas.js';
import { createChunkMaterials } from '../materials.js';
import {
  createCityLook, createCityLookSystem, getCityLook, applyDimensionLook, CITY_LOOK_SYSTEM_NAME, CITY_LOOK_SYSTEM_ORDER,
} from './cityLook.js';
import { createClock, createWeather, updateWeather, clockPhase, setWeatherTime } from '../../sim/daynight.js';
import { CITY_CAMERA_FAR } from './cityLookMath.js';
import { CITY_QUALITY } from '../quality.js';
import { cameraFar } from '../../gameCamera.js';

const pixels = generateAtlasPixels({ quality: 'low' });
const atlas = createAtlasTextures(THREE, pixels);

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function skylineList(n) {
  const r = lcg(11);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ cx: (r() - 0.5) * 1500, cz: (r() - 0.5) * 1500, w: 12 + r() * 30, d: 12 + r() * 30, h: 40 + r() * 280, y0: 64 });
  return out;
}

function makeG(over) {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 288);
  camera.position.set(10, 65.7, 10);
  camera.updateMatrixWorld(true);
  const materials = createChunkMaterials(THREE, atlas, undefined, { quality: 'high' });
  const calls = { sounds: [], stops: 0 };
  const weatherSim = createWeather(3, { table: 'neon' });
  const clock = createClock({ dayLengthSec: 600, startPhase: 0.8125 });
  const G = {
    THREE,
    scene: new THREE.Scene(),
    camera,
    materials,
    postfx: { setGrade: vi.fn(), setGradeRain: vi.fn() },
    weatherLayer: { setStyle: vi.fn() },
    weatherSim,
    clock,
    world: { dim: 'overworld', seed: 4242, getLight: () => 0xf0 },
    eye: { x: 10, y: 65.7, z: 10 },
    quality: { settings: { effTier: 'high' } },
    chunkManager: { getViewDist: () => 7 },
    renderer: {},
    reducedMotion: false,
    accessibility: false,
    sound: (name, pos, opts) => {
      calls.sounds.push({ name, pos, opts });
      return { stop() { calls.stops++; } };
    },
    registry: null,
    systems: [],
    addSystem(sys) { this.systems.push(sys); return sys; },
    getSystem(name) { return this.systems.find((s) => s.name === name) || null; },
    _calls: calls,
  };
  return Object.assign(G, over || {});
}

function frames(look, secs, dt) {
  const d = dt || 1 / 60;
  const n = Math.round(secs / d);
  for (let i = 0; i < n; i++) look.frame(d);
}

describe('applyDimensionLook / createCityLook', () => {
  it('neon: CITY malzeme varyantı, şehir derecelendirmesi, şehir yağmuru, saat origin, kamera far 1600, 3 katman sahnede', () => {
    const G = makeG();
    const look = createCityLook(G);
    expect(G.materials.city).toBe(false);
    const r = look.apply('neon');
    expect(r).toEqual({ dim: 'neon', changed: true });
    expect(G.materials.city).toBe(true);
    ['opaque', 'cutout', 'transparent'].forEach((k) => expect('CITY' in G.materials[k].defines).toBe(true));
    expect(G.postfx.setGrade).toHaveBeenCalledWith('neon');
    expect(G.weatherLayer.setStyle).toHaveBeenCalledWith('city');
    expect(G.clock.origin).toBe(0.25);
    expect(clockPhase(G.clock)).toBeCloseTo(0.5625, 9);
    expect(G.camera.far).toBe(CITY_CAMERA_FAR);
    const names = G.scene.children.map((c) => c.name);
    expect(names).toContain('kesif-siluet-kutular');
    expect(names).toContain('kesif-holo-reklamlar');
    expect(names).toContain('kesif-sehir-hava-parcaciklari');
    expect(look.dim).toBe('neon');
    look.dispose();
  });

  it('overworld geri dönüşü: varyant kapanır, derecelendirme/yağmur stili geri, katmanlar gizli, uWet/uRain 0, kamera far eski formül', () => {
    const G = makeG();
    const look = createCityLook(G);
    look.apply('neon');
    G.materials.uniforms.uWet.value = 0.7;
    G.materials.uniforms.uRain.value = 0.5;
    const r = look.apply('overworld');
    expect(r).toEqual({ dim: 'overworld', changed: true });
    expect(G.materials.city).toBe(false);
    ['opaque', 'cutout', 'transparent'].forEach((k) => expect('CITY' in G.materials[k].defines).toBe(false));
    expect(G.postfx.setGrade).toHaveBeenLastCalledWith('overworld');
    expect(G.weatherLayer.setStyle).toHaveBeenLastCalledWith('overworld');
    expect(G.materials.uniforms.uWet.value).toBe(0);
    expect(G.materials.uniforms.uRain.value).toBe(0);
    expect(look.skyline.object3D.visible).toBe(false);
    expect(look.holo.object3D.visible).toBe(false);
    expect(look.weather.object3D.visible).toBe(false);
    expect(G.camera.far).toBe(cameraFar(7));
    look.dispose();
  });

  it('idempotent: aynı boyutu tekrar uygulamak hiçbir şey yapmaz (yeniden derleme yok)', () => {
    const G = makeG();
    const look = createCityLook(G);
    look.apply('neon');
    const v = G.materials.opaque.version;
    const grades = G.postfx.setGrade.mock.calls.length;
    expect(look.apply('neon')).toEqual({ dim: 'neon', changed: false });
    expect(G.materials.opaque.version).toBe(v);
    expect(G.postfx.setGrade.mock.calls.length).toBe(grades);
    expect(look.apply('overworld').changed).toBe(true);
    expect(look.apply('overworld').changed).toBe(false);
    expect(look.apply({ id: 'neon' }).changed).toBe(true);
    expect(look.apply({ id: 'bilinmeyen' }).dim).toBe('overworld');
    look.dispose();
  });

  it('50 gidiş-dönüş: sahne nesne sayısı sabit, bellek sızıntısı yok (geometri/malzeme tek kez)', () => {
    const G = makeG();
    const look = createCityLook(G);
    look.apply('neon');
    const n = G.scene.children.length;
    for (let i = 0; i < 50; i++) {
      look.apply('overworld');
      look.apply('neon');
    }
    expect(G.scene.children.length).toBe(n);
    expect(G.camera.far).toBe(CITY_CAMERA_FAR);
    look.apply('overworld');
    look.dispose();
    expect(G.scene.children.length).toBe(0);
  });

  it('dispose: katmanları sahneden çıkarır ve çift çağrıda güvenli', () => {
    const G = makeG();
    const look = createCityLook(G);
    look.apply('neon');
    expect(G.scene.children.length).toBe(3);
    look.dispose();
    look.dispose();
    expect(G.scene.children.length).toBe(0);
    expect(look.apply('neon').changed).toBe(false);
  });

  it('eksik parçalı G (materials/postfx/camera yok) atmaz', () => {
    const G = { THREE, scene: new THREE.Scene(), weatherSim: createWeather(1, { table: 'neon' }), clock: createClock() };
    const look = createCityLook(G);
    expect(() => look.apply('neon')).not.toThrow();
    expect(() => frames(look, 0.2)).not.toThrow();
    expect(() => look.apply('overworld')).not.toThrow();
    look.dispose();
    const bare = createCityLook({ THREE });
    expect(() => bare.apply('neon')).not.toThrow();
    expect(() => bare.frame(0.1)).not.toThrow();
    bare.dispose();
  });
});

describe('kare başına iş', () => {
  it('yağmurda uWet 1 sn içinde 1’e çıkar, yağmur bitince 20 sn’de söner; uRain/uNeon yazılır', () => {
    const G = makeG({ world: { dim: 'neon', seed: 1, getLight: () => 0xf0 } });
    G.dim = 'neon';
    const look = createCityLook(G);
    look.apply('neon');
    // yağmur segmenti bul
    const w = G.weatherSim;
    let t = 0;
    for (; t < 40000; t += 7) {
      setWeatherTime(w, t);
      if (w.cityState === 'rain' && t - w.cycle.start > 50) break;
    }
    expect(w.cityState).toBe('rain');
    look.wet = 0;
    for (let i = 0; i < 120; i++) updateWeather(w, 0.05, {});
    expect(w.intensity).toBeGreaterThan(0.4);
    frames(look, 1.0);
    expect(G.materials.uniforms.uWet.value).toBeCloseTo(1, 6);
    expect(G.materials.uniforms.uRain.value).toBeGreaterThan(0.3);
    const u = G.materials.uniforms.uNeon.value;
    expect(u.x).toBeGreaterThan(0.99); // 19:30 gece
    expect(u.y).toBeGreaterThan(1.2);
    expect(u.z).toBeGreaterThan(0.9);
    expect(G.postfx.setGradeRain).toHaveBeenCalled();
    // yağmuru kes: weather intensity 0, açık havaya geç
    w.intensity = 0;
    w.storm = 0;
    w.cityState = 'open';
    const keepEval = w.t;
    expect(keepEval).toBeGreaterThan(0);
    frames(look, 10);
    expect(G.materials.uniforms.uWet.value).toBeCloseTo(0.5, 2);
    frames(look, 10.2);
    expect(G.materials.uniforms.uWet.value).toBe(0);
    look.dispose();
  });

  it('G.dim değişince frame() kendiliğinden uygular (onDimension kaçsa bile)', () => {
    const G = makeG();
    const look = createCityLook(G);
    G.dim = 'neon';
    look.frame(0.016);
    expect(look.dim).toBe('neon');
    expect(G.materials.city).toBe(true);
    G.dim = 'overworld';
    look.frame(0.016);
    expect(look.dim).toBe('overworld');
    expect(G.materials.city).toBe(false);
    delete G.dim;
    G.world.dim = 'neon';
    look.frame(0.016);
    expect(look.dim).toBe('neon');
    look.dispose();
  });

  it('kamera far kare başı yeniden kurulur (gameRender görüş değişiminde ezse bile)', () => {
    const G = makeG();
    G.dim = 'neon';
    const look = createCityLook(G);
    look.frame(0.016);
    G.camera.far = 300;
    G.camera.updateProjectionMatrix();
    look.frame(0.016);
    expect(G.camera.far).toBe(CITY_CAMERA_FAR);
    look.dispose();
  });

  it('kalite kademesi değişince katmanlar yeniden ayarlanır (siluet kutusu, holo, ses düğümü)', () => {
    const G = makeG();
    G.dim = 'neon';
    const look = createCityLook(G);
    look.frame(0.016);
    look.setSkyline(skylineList(700));
    expect(look.skyline.getCount()).toBe(CITY_QUALITY.high.skylineBoxes);
    G.quality = { settings: { effTier: 'low' } };
    look.frame(0.016);
    expect(look.skyline.getCount()).toBe(CITY_QUALITY.low.skylineBoxes);
    expect(look.skyline.object3D.material.uniforms.uSkylineWindowA.value).toBe(0);
    G.quality = { settings: { effTier: 'medium' } };
    look.frame(0.016);
    expect(look.skyline.getCount()).toBe(CITY_QUALITY.medium.skylineBoxes);
    look.dispose();
  });

  it('reducedMotion/erişilebilirlik değişince katmanlara iletilir', () => {
    const G = makeG();
    G.dim = 'neon';
    const look = createCityLook(G);
    look.frame(0.016);
    expect(look.holo.object3D.material.uniforms.uMotion.value).toBe(1);
    G.reducedMotion = true;
    look.frame(0.016);
    expect(look.holo.object3D.material.uniforms.uMotion.value).toBe(0);
    expect(look.weather.object3D.material.uniforms.uMotion.value).toBe(0);
    G.reducedMotion = false;
    G.accessibility = true;
    look.frame(0.016);
    expect(look.holo.object3D.material.uniforms.uMotion.value).toBe(0);
    look.dispose();
  });

  it('bozuk hava/saat girdisinde uniform değerleri sonlu kalır', () => {
    const G = makeG();
    G.dim = 'neon';
    const look = createCityLook(G);
    G.weatherSim.intensity = NaN;
    G.weatherSim.wind = { x: NaN, z: Infinity };
    G.clock.time = NaN;
    for (let i = 0; i < 5; i++) look.frame(NaN);
    look.frame(Infinity);
    look.frame(-1);
    const u = G.materials.uniforms;
    expect(Number.isFinite(u.uWet.value)).toBe(true);
    expect(Number.isFinite(u.uRain.value)).toBe(true);
    u.uNeon.value.toArray().forEach((v) => expect(Number.isFinite(v)).toBe(true));
    look.dispose();
  });

  it('çizim çağrısı bütçesi: siluet 1 + holo ≤1 + şehir havası 1 ≤ 3 (sözleşme: gök/hava/parçacık/siluet ≤14)', () => {
    const G = makeG();
    G.dim = 'neon';
    const look = createCityLook(G);
    look.frame(0.016);
    look.setSkyline(skylineList(600));
    G.world.getLight = () => 0xf0;
    look.holo.update(1, G.camera);
    const st = look.getStats();
    const calls = st.skyline.drawCalls + st.holo.drawCalls + (st.weather.visible ? 1 : 0);
    expect(calls).toBeLessThanOrEqual(3);
    expect(st.skyline.boxes).toBeLessThanOrEqual(600);
    expect(st.holo.anchors).toBeLessThanOrEqual(24);
    expect(st.holo.visible).toBeLessThanOrEqual(8);
    look.dispose();
  });
});

describe('ses ambiyansı (kare başına)', () => {
  it('şehirde yatak sesleri çalar (siren/silah yok), ana diyarda hiç çalmaz, çıkışta durdurulur', () => {
    const G = makeG();
    G.dim = 'neon';
    const look = createCityLook(G);
    frames(look, 0.5);
    const names = new Set(G._calls.sounds.map((s) => s.name));
    expect(names.has('city:traffic')).toBe(true);
    expect(names.has('city:drone')).toBe(true);
    names.forEach((n) => expect(/siren|gun|shot|scream/i.test(n)).toBe(false));
    G._calls.sounds.forEach((s) => {
      expect(s.pos).toBeNull();
      expect(s.opts.vol).toBeGreaterThan(0);
      expect(s.opts.vol).toBeLessThanOrEqual(1);
    });
    const before = G._calls.sounds.length;
    G.dim = 'overworld';
    look.frame(0.016);
    expect(G._calls.stops).toBeGreaterThan(0);
    frames(look, 6);
    expect(G._calls.sounds.length).toBe(before);
    look.dispose();
  });

  it('uzun sürede yatak yeniden başlatılır (kesintisiz katman)', () => {
    const G = makeG();
    G.dim = 'neon';
    const look = createCityLook(G);
    frames(look, 20);
    const traffic = G._calls.sounds.filter((s) => s.name === 'city:traffic');
    expect(traffic.length).toBeGreaterThanOrEqual(4);
    expect(traffic.length).toBeLessThanOrEqual(7);
    look.dispose();
  });
});

describe('sistem ve genel API', () => {
  it('getCityLook G başına tek görünüm kurar ve sistemi bir kez kaydeder', () => {
    const G = makeG();
    const a = getCityLook(G);
    const b = getCityLook(G);
    expect(a).toBe(b);
    expect(G.cityLook).toBe(a);
    expect(G.systems.filter((s) => s.name === CITY_LOOK_SYSTEM_NAME).length).toBe(1);
    const sys = G.systems[0];
    expect(sys.order).toBe(CITY_LOOK_SYSTEM_ORDER);
    expect(CITY_LOOK_SYSTEM_ORDER).toBe(36);
    expect(typeof sys.frameUpdate).toBe('function');
    expect(typeof sys.onDimension).toBe('function');
    a.dispose();
  });

  it('sistem onDimension string ve DimCtx biçimini kabul eder; frameUpdate kare işi yapar; dispose görünümü kaldırır', () => {
    const G = makeG();
    const look = getCityLook(G);
    const sys = G.systems[0];
    sys.onDimension(G, 'overworld', 'neon');
    expect(look.dim).toBe('neon');
    sys.onDimension(G, { id: 'neon' }, { id: 'overworld' });
    expect(look.dim).toBe('overworld');
    sys.onDimension(G, 'overworld', { id: 'neon' });
    expect(look.dim).toBe('neon');
    G.dim = 'neon';
    sys.frameUpdate(G, 0.016, 0);
    expect(G.materials.uniforms.uNeon.value.x).toBeGreaterThan(0.9);
    sys.dispose(G);
    expect(G.scene.children.length).toBe(0);
  });

  it('createCityLookSystem(G) yoksa görünümü kurar; sistem adı benzersiz', () => {
    const G = makeG();
    const sys = createCityLookSystem(G);
    expect(sys.name).toBe('cityLook');
    expect(sys.look).toBe(G.cityLook);
    G.cityLook.dispose();
  });

  it('applyDimensionLook(dimId, G) ve (dimId) — sonuncu kurulan görünümü kullanır; hiç yoksa zararsız', () => {
    const G = makeG();
    expect(applyDimensionLook('neon', G).dim).toBe('neon');
    expect(G.materials.city).toBe(true);
    expect(applyDimensionLook('overworld').dim).toBe('overworld'); // G verilmeden: aktif görünüm
    expect(G.materials.city).toBe(false);
    expect(applyDimensionLook({ id: 'neon' }).dim).toBe('neon');
    G.cityLook.dispose();
    const none = applyDimensionLook('neon');
    expect(none.changed).toBe(false);
  });

  it('getStats özet alanları', () => {
    const G = makeG();
    G.dim = 'neon';
    const look = createCityLook(G);
    look.frame(0.016);
    const st = look.getStats();
    expect(st.dim).toBe('neon');
    expect(st.tier).toBe('high');
    expect(st.cameraFar).toBe(CITY_CAMERA_FAR);
    expect(st.city).toBe(true);
    expect(st.skyline.boxes).toBeLessThanOrEqual(600);
    expect(st.skyline.drawCalls).toBe(st.skyline.boxes > 0 ? 1 : 0);
    look.dispose();
  });

  it('şehir planı (cityPlan.skyline) şehre girişte yüklenir: ≤600 kutu tek çağrı, holo reklamlar planın kulelerinden', () => {
    const G = makeG({ world: { dim: 'neon', seed: 4242, getLight: () => 0xf0 } });
    G.dim = 'neon';
    const look = createCityLook(G);
    look.apply('neon');
    const n = look.skyline.getCount();
    expect(n).toBeGreaterThan(100);
    expect(n).toBeLessThanOrEqual(600);
    expect(look.skyline.drawCalls).toBe(1);
    const anchors = look.holo.getAnchors();
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.length).toBeLessThanOrEqual(24);
    const boxes = look.skyline.getBoxes();
    expect(boxes.length).toBe(n);
    boxes.forEach((b) => {
      expect(Math.abs(b.cx)).toBeLessThan(900);
      expect(Math.abs(b.cz)).toBeLessThan(900);
      expect(b.h).toBeGreaterThanOrEqual(4);
      expect(b.h).toBeLessThanOrEqual(340);
    });
    // aynı tohum → aynı kutular (belirlenimci)
    const G2 = makeG({ world: { dim: 'neon', seed: 4242, getLight: () => 0xf0 } });
    const look2 = createCityLook(G2);
    look2.apply('neon');
    expect(JSON.stringify(look2.skyline.getBoxes())).toBe(JSON.stringify(boxes));
    look.dispose();
    look2.dispose();
  });
});
