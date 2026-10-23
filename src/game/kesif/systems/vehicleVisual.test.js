/*
 * vehicleVisual sistemi testleri (sahte G, gerçek three): yönetici girişlerini ve trafik görünümünü çizer; boyut/kalite/hareket kısıtı tepkileri; sızıntı yok.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSystem, VEHICLE_VISUAL_ORDER } from './vehicleVisual.js';
import { createMaterialUniforms } from '../render/materials.js';
import { createVehicle } from '../sim/city/vehicle/vehiclePhysics.js';
import { defaultCosmetics } from '../sim/city/vehicle/vehicleData.js';

function fakeG(over) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1600);
  camera.position.set(0, 66, 8);
  camera.updateMatrixWorld(true);
  const entries = new Map();
  const mgr = {
    entries,
    driven: null,
    interp(e, a, out) {
      const v = e.v;
      out.x = v.x; out.y = v.y; out.z = v.z; out.yaw = v.yaw; out.pitch = v.pitch; out.roll = v.roll; out.wheelSpin = v.wheelSpin; out.steer = v.wheelAngle;
      return out;
    },
  };
  const G = Object.assign({
    scene, camera, dim: 'neon', world: { getLight: () => 0xf0, dim: 'neon' }, materials: { uniforms: createMaterialUniforms(THREE) }, vehicles: mgr, time: { seconds: 0, tick: 0 },
    quality: { settings: { effTier: 'high' } }, cityLook: { state: { night: 0, rain: 0, wet: 0, shelter: 0 } }, opts: { createCanvas: () => null },
    reducedMotion: false, vehicleCam: { mode: 0 }, renderer: null,
  }, over);
  return G;
}

function addEntry(G, cls, id, x, z, role) {
  const v = createVehicle(cls, { id, x, y: 64, z, yaw: 0.3, cosmetics: defaultCosmetics(cls, id) });
  const e = {
    id, propId: id, v, role: role || 'owned', occupied: false, prev: {},
  };
  G.vehicles.entries.set(id, e);
  return e;
}

function fakeTraffic(n) {
  const view = {
    count: n, x: new Float32Array(32), y: new Float32Array(32), z: new Float32Array(32), yaw: new Float32Array(32), pitch: new Float32Array(32), speed: new Float32Array(32),
    cls: new Uint8Array(32), color: new Uint8Array(32), accent: new Uint8Array(32), flags: new Uint16Array(32), fade: new Float32Array(32), id: new Uint32Array(32),
  };
  for (let i = 0; i < n; i++) {
    view.x[i] = -60 + i * 6; view.y[i] = 64; view.z[i] = -30; view.yaw[i] = 0.1 * i; view.speed[i] = 8; view.cls[i] = i % 4; view.color[i] = i % 16;
    view.flags[i] = i % 5 === 0 ? 1 : 0; view.fade[i] = 1; view.id[i] = 100 + i;
  }
  return { fillView() { return view; }, view };
}

function fakeTrafficNoView(n) {
  const t = fakeTraffic(n);
  return { fillView: t.fillView };
}

function run(sys, G, frames) {
  for (let i = 0; i < frames; i++) {
    G.time.seconds += 1 / 60;
    sys.frameUpdate(G, 1 / 60, 0.5);
  }
}

describe('vehicleVisual sistemi', () => {
  it('sıra benzersiz bir sayı (37) ve gameSystems sözleşmesine uygun createSystem', () => {
    expect(VEHICLE_VISUAL_ORDER).toBe(37);
    const sys = createSystem(fakeG());
    expect(sys.name).toBe('vehicleVisual');
    expect(typeof sys.frameUpdate).toBe('function');
    expect(typeof sys.onDimension).toBe('function');
    expect(typeof sys.dispose).toBe('function');
  });
  it('şehirde: yönetici girişlerini rig olarak, trafik görünümünü örnekli çizer; çizim çağrısı bütçesi içinde', () => {
    const G = fakeG();
    G.traffic = fakeTraffic(24);
    const sys = createSystem(G);
    sys.init();
    addEntry(G, 'taksi', 1, 0, 0);
    const e2 = addEntry(G, 'spor', 2, 5, 0, 'display');
    G.vehicles.driven = G.vehicles.entries.get(1);
    G.vehicles.driven.occupied = true;
    run(sys, G, 5);
    const vr = G.vehicleRender;
    expect(vr).toBeTruthy();
    expect(vr.group.parent).toBe(G.scene);
    expect(vr.group.visible).toBe(true);
    const st = G.vehicleRenderStats();
    expect(st.rigs).toBe(2);
    expect(st.trafficCars).toBe(24);
    expect(st.draws).toBeLessThanOrEqual(20);
    expect(vr.rigs.get(1).uniforms.uDriver.value).toBeGreaterThan(0.5);
    expect(vr.rigs.get(e2.id).uniforms.uDriver.value).toBe(0);
    sys.dispose();
  });
  it('taksi sınıfı: TAXI bayrağı olmayan trafik arabası sedan/hatch olarak çizilir; TAXI bayraklı taksi', () => {
    const G = fakeG();
    const tr = fakeTraffic(4);
    // 0: taksi (TAXI), 1..: bayraksız taksi sınıfı
    for (let i = 0; i < 4; i++) { tr.view.cls[i] = 0; tr.view.flags[i] = i === 0 ? 64 : 0; }
    G.traffic = tr;
    const sys = createSystem(G);
    sys.init();
    run(sys, G, 2);
    const m = G.vehicleRender.traffic.meshes;
    expect(m.get('taksi').n).toBe(1);
    expect(m.get('sedan').n + m.get('hatch').n).toBe(3);
  });
  it('trafik kaynağı: yalnız fillView olan nesne de kabul edilir (view yok)', () => {
    const G = fakeG();
    G.traffic = fakeTrafficNoView(5);
    const sys = createSystem(G);
    sys.init();
    run(sys, G, 2);
    expect(G.vehicleRender.traffic.stats.cars).toBe(5);
  });
  it('trafik: fade < 0.04 çizilmez; sonlu olmayan konum atılır', () => {
    const G = fakeG();
    const tr = fakeTraffic(6);
    tr.view.fade[1] = 0.01;
    tr.view.x[2] = NaN;
    G.traffic = tr;
    const sys = createSystem(G);
    sys.init();
    run(sys, G, 2);
    expect(G.vehicleRender.traffic.stats.cars).toBe(4);
  });
  it('overworld\'te gizli ve hiçbir şey çizmez; şehre dönünce yeniden görünür', () => {
    const G = fakeG({ dim: 'overworld' });
    const sys = createSystem(G);
    sys.init();
    run(sys, G, 3);
    expect(G.vehicleRender === undefined || G.vehicleRender === null || G.vehicleRender.group.visible === false).toBe(true);
    G.dim = 'neon';
    addEntry(G, 'motor', 5, 1, 1);
    run(sys, G, 3);
    expect(G.vehicleRender.group.visible).toBe(true);
    G.dim = 'overworld';
    sys.onDimension(G, 'neon', 'overworld');
    run(sys, G, 2);
    expect(G.vehicleRender.group.visible).toBe(false);
  });
  it('onDimension DimCtx nesneleriyle de çalışır (gameDimension from/to nesne verir)', () => {
    const G = fakeG();
    const sys = createSystem(G);
    sys.init();
    addEntry(G, 'taksi', 1, 0, 0);
    run(sys, G, 3);
    sys.onDimension(G, { id: 'overworld' }, { id: 'neon' });
    expect(G.vehicleRender.group.visible).toBe(true);
    G.dim = 'overworld';
    sys.onDimension(G, { id: 'neon' }, { id: 'overworld' });
    expect(G.vehicleRender.group.visible).toBe(false);
  });
  it('kalite kademesi ve hareket kısıtı çizicilere iletilir', () => {
    const G = fakeG();
    const sys = createSystem(G);
    sys.init();
    addEntry(G, 'taksi', 1, 0, 0);
    G.vehicles.driven = G.vehicles.entries.get(1);
    G.vehicles.driven.occupied = true;
    run(sys, G, 2);
    expect(G.vehicleRender.getTier()).toBe('high');
    G.quality.settings.effTier = 'low';
    run(sys, G, 2);
    expect(G.vehicleRender.getTier()).toBe('low');
    G.quality.settings.effTier = 'bilinmeyen';
    run(sys, G, 2);
    expect(G.vehicleRender.getTier()).toBe('high');
  });
  it('kaput kamerası (vehicleCam.mode 1) sürücüyü gizler', () => {
    const G = fakeG();
    const sys = createSystem(G);
    sys.init();
    const e = addEntry(G, 'taksi', 1, 0, 0);
    G.vehicles.driven = e;
    e.occupied = true;
    run(sys, G, 40);
    expect(G.vehicleRender.rigs.get(1).uniforms.uDriver.value).toBeGreaterThan(0.9);
    G.vehicleCam.mode = 1;
    run(sys, G, 60);
    expect(G.vehicleRender.rigs.get(1).uniforms.uDriver.value).toBe(0);
  });
  it('fizik durumu çizime yansır: fren/hasar/hazard/nitro/kayma', () => {
    const G = fakeG();
    const sys = createSystem(G);
    sys.init();
    const e = addEntry(G, 'spor', 1, 0, 0);
    G.vehicles.driven = e;
    e.occupied = true;
    e.v.lights.brake = true; e.v.dmg = 0.7; e.v.hazardT = 2; e.v.nitroOn = true; e.v.skid = 0.9; e.v.u = 15; e.v.vx = 15;
    run(sys, G, 30);
    const u = G.vehicleRender.rigs.get(1).uniforms;
    expect(u.uDmg.value).toBeCloseTo(0.7, 5);
    expect(u.uLampU.value.y).toBeGreaterThan(0.9);
    expect(G.vehicleRender.fx.stats.smoke).toBeGreaterThan(0);
  });
  it('galeri/test kancası: vehicleVisualDebug.extra araçları çizer ve forceLights farları açar', () => {
    const G = fakeG();
    const sys = createSystem(G);
    sys.init();
    G.vehicleVisualDebug.extra = [{
      id: 900, kind: 'hoverbike', x: 3, y: 65.2, z: 1, yaw: 0, occupied: true, hover: 1.2, cos: defaultCosmetics('hoverbike', 3),
    }];
    G.vehicleVisualDebug.forceLights = true;
    run(sys, G, 90);
    const r = G.vehicleRender.rigs.get(900);
    expect(r).toBeTruthy();
    expect(r.uniforms.uLampU.value.x).toBeGreaterThan(0.9);
  });
  it('dispose: sahneden çıkar, çizici temizlenir; ikinci çağrı güvenli', () => {
    const G = fakeG();
    const sys = createSystem(G);
    sys.init();
    addEntry(G, 'taksi', 1, 0, 0);
    run(sys, G, 3);
    const grp = G.vehicleRender.group;
    sys.dispose();
    expect(grp.parent).toBe(null);
    expect(G.vehicleRender).toBe(null);
    expect(() => sys.dispose()).not.toThrow();
  });
  it('1000 kare gerçekçi akış: NaN yok, çizici istatistikleri sonlu', () => {
    const G = fakeG();
    G.traffic = fakeTraffic(30);
    const sys = createSystem(G);
    sys.init();
    const e = addEntry(G, 'taksi', 1, 0, 0);
    G.vehicles.driven = e;
    e.occupied = true;
    for (let i = 0; i < 1000; i++) {
      e.v.x += 0.3; e.v.vx = 18; e.v.u = 18; e.v.wheelSpin += 0.9; e.v.yaw += 0.002;
      if (i % 200 === 0) addEntry(G, 'kamyonet', 50 + i, 3 + (i % 9), 4);
      G.traffic.view.x[0] += 0.1;
      run(sys, G, 1);
    }
    const st = G.vehicleRenderStats();
    Object.keys(st).forEach((k) => { if (typeof st[k] === 'number') expect(Number.isFinite(st[k])).toBe(true); });
    expect(st.draws).toBeLessThanOrEqual(20);
  });
});
