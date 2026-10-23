/*
 * vehicleModels testleri (gerçek three, GL yok): çizim çağrısı bütçesi, rig/örnekli seçimi, örnek kapasitesi, dispose, kademe geçişi (yeniden kurma yok), NaN sağlamlığı,
 * lamba durumu (≤3 Hz, reducedMotion sabit), plaka atlası, efekt sınırları.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVehicleRenderer, RENDER_TIERS } from './vehicleModels.js';
import { MODEL_KINDS, TRAFFIC_KINDS, buildModel } from './vehicleGeo.js';
import { createPlateAtlas, PLATE_SLOTS } from './vehiclePlates.js';
import { createPuffPool } from './vehicleFx.js';
import { createMaterialUniforms } from '../materials.js';
import { COSMETICS, VEHICLE_CLASSES, defaultCosmetics } from '../../sim/city/vehicle/vehicleData.js';

function fakeCanvas() {
  const state = { font: '', draws: 0 };
  const ctx = {
    set font(v) { state.font = v; },
    get font() { return state.font; },
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, rect() {}, fillRect() { state.draws++; },
    fillText() { state.draws++; }, roundRect() {}, measureText: (t) => ({ width: t.length * 10 }),
  };
  return { width: 0, height: 0, getContext: () => ctx, state };
}

function makeVR(quality, extra) {
  const uniforms = createMaterialUniforms(THREE);
  uniforms.uFadeEnd.value = 400;
  uniforms.uFadeStart.value = 380;
  return createVehicleRenderer(Object.assign({
    THREE, uniforms, quality, createCanvas: () => fakeCanvas(),
  }, extra));
}

const cam = (x = 0, y = 3, z = 8) => {
  const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1600);
  c.position.set(x, y, z);
  c.updateMatrixWorld(true);
  return c;
};

function visibleDraws(vr) {
  let n = 0;
  vr.group.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && o.visible) {
      let p = o.parent;
      let vis = true;
      while (p) { if (!p.visible) vis = false; p = p.parent; }
      if (vis && (!o.isInstancedMesh || o.count > 0)) n++;
    }
  });
  return n;
}

const ENV_NIGHT = {
  night: 1, rain: 0, wet: 0, shelter: 0, reduced: false, rigRadius: 80,
};

function frame(vr, fn, env, dt) {
  vr.beginFrame(cam(), dt || 1 / 60, env || ENV_NIGHT);
  fn();
  vr.endFrame();
}

function drawCar(vr, o) {
  const d = vr.slot();
  Object.assign(d, { id: 1, kind: 'taksi', occupied: true }, o);
  return d;
}

let vr;
beforeEach(() => { vr = null; });
afterEach(() => { if (vr) vr.dispose(); });

describe('yapı ve bütçe', () => {
  it('tüm kademelerde: sürülen + yakın rig + 30 trafik arabası → çağrı bütçesi', () => {
    ['high', 'medium', 'low'].forEach((q) => {
      vr = makeVR(q);
      const t = RENDER_TIERS[q];
      const kinds = TRAFFIC_KINDS;
      frame(vr, () => {
        drawCar(vr, { id: 1, kind: 'taksi', driven: true, x: 0, y: 0, z: 0 });
        for (let i = 0; i < 6; i++) drawCar(vr, { id: 10 + i, kind: kinds[i % kinds.length], x: 4 + i * 4, y: 0, z: -6 });
        for (let i = 0; i < 40; i++) vr.traffic.add(kinds[i % kinds.length], -100 + i * 3, 0, -40, 0.1 * i, { paint: i, brake: i % 3, head: 1 });
      });
      const st = vr.getStats();
      expect(st.rigs).toBeLessThanOrEqual(t.rigs);
      expect(vr.traffic.stats.draws).toBeLessThanOrEqual(8);
      expect(vr.traffic.stats.cars).toBeLessThanOrEqual(t.traffic);
      const calls = visibleDraws(vr);
      const budget = q === 'high' ? 20 : q === 'medium' ? 18 : 14;
      expect(calls).toBeLessThanOrEqual(budget);
      expect(st.draws).toBeLessThanOrEqual(budget);
      vr.dispose();
      vr = null;
    });
  });
  it('trafik: yüksek kademe 30 araç tek karede ≤ 15 çağrı (sözleşme)', () => {
    vr = makeVR('high');
    frame(vr, () => {
      for (let i = 0; i < 30; i++) vr.traffic.add(MODEL_KINDS[i % MODEL_KINDS.length], i * 3, 0, 0, 0, { paint: i });
    });
    expect(vr.traffic.stats.cars).toBe(30);
    expect(vr.traffic.stats.draws).toBeLessThanOrEqual(15);
    expect(vr.traffic.stats.draws).toBe(MODEL_KINDS.length);
  });
  it('trafik üçgenleri: araç başına ≤ 600', () => {
    vr = makeVR('high');
    frame(vr, () => {
      for (let i = 0; i < 12; i++) vr.traffic.add(TRAFFIC_KINDS[i % TRAFFIC_KINDS.length], i * 3, 0, 0, 0);
    });
    expect(vr.traffic.stats.tris / vr.traffic.stats.cars).toBeLessThanOrEqual(600);
  });
  it('rig: ayrıntılı model üçgeni ≤ 1500; tüm çocuk ağlar gövde+cam', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true }));
    const rig = vr.rigs.get(1);
    expect(rig.group.children.length).toBeLessThanOrEqual(2);
    let tris = 0;
    rig.group.children.forEach((m) => { tris += m.geometry.attributes.position.count / 3; });
    expect(tris).toBeLessThanOrEqual(1500);
  });
});

describe('rig / örnekli seçimi', () => {
  it('sürülen araç her zaman rig; uzaktakiler örnekli; kademe rig tavanı uygulanır', () => {
    vr = makeVR('medium');
    frame(vr, () => {
      drawCar(vr, { id: 5, kind: 'spor', x: 200, y: 0, z: 0, driven: true });
      for (let i = 0; i < 5; i++) drawCar(vr, { id: 20 + i, kind: 'sedan', x: 3 + i, y: 0, z: 0 });
      drawCar(vr, { id: 30, kind: 'hatch', x: 300, y: 0, z: 0 });
    }, ENV_NIGHT);
    expect(vr.rigs.has(5)).toBe(true);
    expect(vr.getStats().rigs).toBe(RENDER_TIERS.medium.rigs);
    expect(vr.getStats().lod).toBe(7 - RENDER_TIERS.medium.rigs);
    expect(vr.rigs.has(30)).toBe(false);
  });
  it('yakın olmayan araç (>rigRadius) rig olmaz', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 9, kind: 'taksi', x: 500, y: 0, z: 0 }));
    expect(vr.rigs.size).toBe(0);
    expect(vr.getStats().lod).toBe(1);
  });
  it('kullanılmayan rig 1,5 sn sonra bırakılır ve yeniden kullanılır', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi' }));
    expect(vr.rigs.size).toBe(1);
    for (let i = 0; i < 120; i++) frame(vr, () => {}, ENV_NIGHT, 1 / 60);
    expect(vr.rigs.size).toBe(0);
    expect(vr.getStats().spareRigs).toBe(1);
    frame(vr, () => drawCar(vr, { id: 2, kind: 'taksi' }));
    expect(vr.getStats().spareRigs).toBe(0);
    expect(vr.rigs.size).toBe(1);
  });
  it('aynı kimlik farklı türe dönünce yeni rig (eski bırakılır)', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi' }));
    frame(vr, () => drawCar(vr, { id: 1, kind: 'spor' }));
    expect(vr.rigs.get(1).kind).toBe('spor');
  });
});

describe('örnek kapasitesi', () => {
  it('toplam üst sınır ve tür başına 32 aşılmaz; atılanlar sayılır', () => {
    vr = makeVR('high');
    frame(vr, () => {
      for (let i = 0; i < 100; i++) vr.traffic.add('sedan', i, 0, 0, 0);
    });
    expect(vr.traffic.stats.cars).toBe(30);
    expect(vr.traffic.stats.dropped).toBe(70);
    vr.traffic.setCap(1000);
    frame(vr, () => {
      for (let i = 0; i < 100; i++) vr.traffic.add('sedan', i, 0, 0, 0);
    });
    expect(vr.traffic.stats.cars).toBe(32);
  });
  it('sonlu olmayan poz atılır; matris dizisi hep sonlu', () => {
    vr = makeVR('high');
    frame(vr, () => {
      vr.traffic.add('sedan', NaN, 0, 0, 0);
      vr.traffic.add('sedan', 0, Infinity, 0, 0);
      vr.traffic.add('sedan', 1, 0, 1, NaN);
      vr.traffic.add('sedan', 2, 0, 2, 0.3);
    });
    expect(vr.traffic.stats.cars).toBe(1);
    const m = vr.traffic.meshes.get('sedan').mesh.instanceMatrix.array;
    for (let i = 0; i < 16; i++) expect(Number.isFinite(m[i])).toBe(true);
  });
  it('betimleyici NaN fuzz: atmaz, çizilen her şey sonlu', () => {
    vr = makeVR('high');
    const junk = [NaN, Infinity, -Infinity, 1e30, -1e30, undefined, null, 'x', {}];
    for (let it = 0; it < 120; it++) {
      frame(vr, () => {
        const d = vr.slot();
        d.id = it % 5; d.kind = it % 7 === 0 ? 'ucak' : MODEL_KINDS[it % MODEL_KINDS.length];
        d.x = junk[it % junk.length] === undefined || it % 3 ? (it % 11) - 5 : junk[it % junk.length];
        d.z = it % 2 ? junk[(it >> 1) % junk.length] : 4;
        d.y = 0; d.yaw = it * 0.1; d.pitch = junk[it % junk.length]; d.roll = junk[(it + 3) % junk.length]; d.spin = junk[(it + 5) % junk.length];
        d.u = junk[(it + 1) % junk.length]; d.dmg = junk[(it + 2) % junk.length]; d.skid = junk[(it + 4) % junk.length]; d.sky = junk[it % junk.length];
        d.driven = it % 4 === 0; d.occupied = true; d.nitro = it % 3 === 0; d.brake = it % 2 === 0;
      });
    }
    vr.rigs.forEach((r) => {
      const p = r.group.position;
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      Object.keys(r.uniforms).forEach((k) => {
        const v = r.uniforms[k].value;
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      });
    });
  });
});

describe('kademe geçişi: yeniden kurma yok', () => {
  it('low ↔ medium ↔ high döngüsü: geometri/malzeme/program sayısı ve ağ sayısı değişmez; kapasite uygulanır', () => {
    vr = makeVR('high');
    let disposed = 0;
    const count = () => {
      const s = new Set();
      vr.group.traverse((o) => { if (o.geometry) s.add(o.geometry); });
      return s.size;
    };
    const mats = () => {
      const s = new Set();
      vr.group.traverse((o) => { if (o.material) s.add(o.material); });
      return s.size;
    };
    const run = () => frame(vr, () => {
      drawCar(vr, { id: 1, kind: 'taksi', driven: true, brake: true, skid: 0.8, u: 20, onGround: true });
      for (let i = 0; i < 5; i++) drawCar(vr, { id: 10 + i, kind: 'sedan', x: 3 + i * 3 });
      for (let i = 0; i < 30; i++) vr.traffic.add('hatch', 20 + i * 3, 0, 0, 0);
    });
    run();
    const g0 = count();
    const m0 = mats();
    vr.group.traverse((o) => { if (o.geometry) o.geometry.addEventListener('dispose', () => { disposed++; }); });
    const seq = ['low', 'medium', 'high', 'low', 'high', 'medium', 'low'];
    seq.forEach((q) => {
      vr.setQuality(q);
      run();
      const st = vr.getStats();
      expect(st.tier).toBe(q);
      expect(st.rigs).toBeLessThanOrEqual(RENDER_TIERS[q].rigs);
      expect(vr.traffic.stats.cars).toBeLessThanOrEqual(RENDER_TIERS[q].traffic);
      expect(vr.fx.stats.cone).toBeLessThanOrEqual(RENDER_TIERS[q].cones);
      if (q === 'low') expect(vr.fx.stats.cone).toBe(0);
    });
    // rig sayısı değişir (kademeye göre) ama ortak geometri/malzeme kümesi büyümez (rigler havuzdan)
    expect(count()).toBeLessThanOrEqual(g0 + 2 * (RENDER_TIERS.high.rigs));
    expect(mats()).toBeLessThanOrEqual(m0 + 2 * RENDER_TIERS.high.rigs + 4);
    expect(disposed).toBeLessThanOrEqual(2 * RENDER_TIERS.high.rigs);
  });
  it('düşük kademede yansıma kalitesi 0, koni yok; yüksekte tam', () => {
    vr = makeVR('low');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true }));
    expect(vr.rigs.get(1).uniforms.uQ.value).toBe(0);
    vr.setQuality('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true }));
    expect(vr.rigs.get(1).uniforms.uQ.value).toBe(1);
    expect(vr.fx.stats.cone).toBeGreaterThan(0);
  });
});

describe('dispose / bellek', () => {
  it('dispose: tüm geometri ve malzeme atılır; ikinci çağrı güvenli', () => {
    vr = makeVR('high');
    frame(vr, () => {
      drawCar(vr, { id: 1, kind: 'taksi', driven: true });
      drawCar(vr, { id: 2, kind: 'motor', x: 5 });
      vr.traffic.add('sedan', 0, 0, 0, 0);
    });
    const geos = new Set();
    const mats = new Set();
    vr.group.traverse((o) => { if (o.geometry) geos.add(o.geometry); if (o.material) mats.add(o.material); });
    let gd = 0;
    let md = 0;
    geos.forEach((g) => g.addEventListener('dispose', () => { gd++; }));
    mats.forEach((m) => m.addEventListener('dispose', () => { md++; }));
    vr.dispose();
    expect(gd).toBe(geos.size);
    expect(md).toBe(mats.size);
    expect(() => vr.dispose()).not.toThrow();
    expect(vr.group.children.length).toBe(0);
    vr = null;
  });
  it('1000 kare rig çevrimi: rig sayısı sınırlı (sızıntı yok)', () => {
    vr = makeVR('high');
    for (let i = 0; i < 1000; i++) {
      frame(vr, () => drawCar(vr, { id: (i % 50) + 1, kind: MODEL_KINDS[i % MODEL_KINDS.length], x: (i % 7), y: 0 }), ENV_NIGHT, 1 / 30);
    }
    let rigsInTree = 0;
    vr.group.traverse((o) => { if (o.isGroup && MODEL_KINDS.some((k) => o.name === 'arac-' + k)) rigsInTree++; });
    expect(rigsInTree).toBeLessThanOrEqual(RENDER_TIERS.high.rigs + 3 + 4);
  });
});

describe('lambalar ve ışık', () => {
  it('sinyal/tehlike ≤ 3 Hz (60 fps\'te saniyedeki açılma sayısı)', () => {
    vr = makeVR('high');
    let rises = 0;
    let prev = 0;
    for (let i = 0; i < 300; i++) {
      frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, hazard: true }), ENV_NIGHT, 1 / 60);
      const v = vr.rigs.get(1).uniforms.uIndU.value.x > 0.5 ? 1 : 0;
      if (v === 1 && prev === 0) rises++;
      prev = v;
    }
    const perSec = rises / 5;
    expect(perSec).toBeGreaterThan(0.5);
    expect(perSec).toBeLessThanOrEqual(3);
  });
  it('reducedMotion: tehlike ışığı sabit (yanıp sönme yok)', () => {
    vr = makeVR('high');
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, hazard: true }), Object.assign({}, ENV_NIGHT, { reduced: true }), 1 / 60);
      if (i > 20) seen.add(Math.round(vr.rigs.get(1).uniforms.uIndU.value.x * 20));
    }
    expect(seen.size).toBe(1);
  });
  it('fren lambası yumuşak yükselir (tek karede sıçrama yok)', () => {
    vr = makeVR('high');
    let last = 0;
    let maxStep = 0;
    for (let i = 0; i < 60; i++) {
      frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, brake: i > 10 && i < 40 }), ENV_NIGHT, 1 / 60);
      const b = vr.rigs.get(1).uniforms.uLampU.value.y;
      maxStep = Math.max(maxStep, Math.abs(b - last));
      last = b;
    }
    expect(maxStep).toBeLessThan(0.5);
    expect(vr.rigs.get(1).st.brake).toBeLessThan(0.2);
  });
  it('gündüz farlar kapalı; gece/yağmur/tünel (düşük gökyüzü ışığı) açık; zorla açma', () => {
    const headAfter = (env, o, force) => {
      vr = makeVR('high');
      if (force) vr.setForceLights(true);
      for (let i = 0; i < 90; i++) frame(vr, () => drawCar(vr, Object.assign({ id: 1, kind: 'taksi', driven: true }, o)), env, 1 / 60);
      const v = vr.rigs.get(1).uniforms.uLampU.value.x;
      vr.dispose();
      vr = null;
      return v;
    };
    const day = { night: 0, rain: 0, wet: 0, shelter: 0, reduced: false };
    expect(headAfter(day, {})).toBeLessThan(0.05);
    expect(headAfter(ENV_NIGHT, {})).toBeGreaterThan(0.9);
    expect(headAfter(Object.assign({}, day, { rain: 0.8 }), {})).toBeGreaterThan(0.9);
    expect(headAfter(day, { sky: 0.1 })).toBeGreaterThan(0.9);
    expect(headAfter(day, {}, true)).toBeGreaterThan(0.9);
  });
  it('far konisi + havuz + parıltı gece üretilir; gündüz koni yok', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'sedan', driven: true }), ENV_NIGHT);
    expect(vr.fx.stats.cone).toBe(2);
    expect(vr.fx.stats.sprite).toBeGreaterThan(2);
    for (let i = 0; i < 60; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'sedan', driven: true }), { night: 0, rain: 0, wet: 0, shelter: 0 });
    expect(vr.fx.stats.cone).toBe(0);
  });
  it('underglow ve nitro alevi / sürüklenme dumanı yalnız ilgili durumda', () => {
    vr = makeVR('high');
    const cos = defaultCosmetics('spor', 1);
    cos.under = { on: true, color: 2, pattern: 1 };
    frame(vr, () => drawCar(vr, { id: 1, kind: 'spor', driven: true, cos }), { night: 0, rain: 0, wet: 0, shelter: 0 });
    const withUnder = vr.fx.stats.sprite;
    frame(vr, () => drawCar(vr, { id: 1, kind: 'spor', driven: true, cos: defaultCosmetics('spor', 1) }), { night: 0, rain: 0, wet: 0, shelter: 0 });
    expect(withUnder).toBeGreaterThan(vr.fx.stats.sprite);
    const base = vr.fx.stats.sprite;
    frame(vr, () => drawCar(vr, { id: 1, kind: 'spor', driven: true, nitro: true }), { night: 0, rain: 0, wet: 0, shelter: 0 });
    expect(vr.fx.stats.sprite).toBeGreaterThan(base);
    for (let i = 0; i < 40; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'spor', driven: true, skid: 0.9, u: 20, onGround: true }), { night: 0, rain: 0, wet: 0, shelter: 0 });
    expect(vr.fx.stats.smoke).toBeGreaterThan(0);
    expect(vr.fx.stats.smoke).toBeLessThanOrEqual(RENDER_TIERS.high.smoke);
  });
  it('ıslak yolda far/stop yansıma çizgileri eklenir (yüksek), düşük kademede eklenmez', () => {
    const sprites = (q, wet) => {
      vr = makeVR(q);
      frame(vr, () => drawCar(vr, { id: 1, kind: 'sedan', driven: true, brake: true }), { night: 1, rain: wet, wet, shelter: 0 });
      for (let i = 0; i < 20; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'sedan', driven: true, brake: true }), { night: 1, rain: wet, wet, shelter: 0 });
      const n = vr.fx.stats.sprite;
      vr.dispose();
      vr = null;
      return n;
    };
    expect(sprites('high', 1)).toBeGreaterThan(sprites('high', 0));
    expect(sprites('low', 1)).toBe(sprites('low', 0));
  });
});

describe('sürücü ve hasar', () => {
  it('kaput kamerasında sürücü gizlenir (uDriver → 0), dışarıdan görünür', () => {
    vr = makeVR('high');
    for (let i = 0; i < 60; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, occupied: true }));
    expect(vr.rigs.get(1).uniforms.uDriver.value).toBeGreaterThan(0.95);
    for (let i = 0; i < 60; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, occupied: true, hideDriver: true }));
    expect(vr.rigs.get(1).uniforms.uDriver.value).toBe(0);
    for (let i = 0; i < 60; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', occupied: false }));
    expect(vr.rigs.get(1).uniforms.uDriver.value).toBe(0);
  });
  it('hasar uniform\'u 0..1 ve yalnız renk (geometri değişmez)', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, dmg: 0.6 }));
    const rig = vr.rigs.get(1);
    expect(rig.uniforms.uDmg.value).toBeCloseTo(0.6, 5);
    const n0 = rig.body.geometry.attributes.position.count;
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, dmg: 1 }));
    expect(rig.body.geometry.attributes.position.count).toBe(n0);
  });
  it('yeni araç (fresh) ışınlanma animasyonu: uBeam 0 → 1, reducedMotion\'da anında 1', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', fresh: true }));
    expect(vr.rigs.get(1).uniforms.uBeam.value).toBeLessThan(0.5);
    for (let i = 0; i < 80; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', fresh: true }));
    expect(vr.rigs.get(1).uniforms.uBeam.value).toBe(1);
    vr.dispose();
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', fresh: true }), Object.assign({}, ENV_NIGHT, { reduced: true }));
    expect(vr.rigs.get(1).uniforms.uBeam.value).toBe(1);
  });
  it('kozmetik renkleri tablolardan: gövde/aksan/neon/jant', () => {
    vr = makeVR('high');
    const cos = { body: 3, accent: 5, neon: 7, wheels: 2, under: { on: false, color: 0, pattern: 0 }, plate: 0, horn: 0, radio: 0 };
    frame(vr, () => drawCar(vr, { id: 1, kind: 'spor', driven: true, cos }));
    const u = vr.rigs.get(1).uniforms;
    const want = new THREE.Color(COSMETICS.body[3].hex);
    expect(u.uBodyU.value.r).toBeCloseTo(want.r, 4);
    expect(u.uRimStyle.value).toBe(2);
    const wn = new THREE.Color(COSMETICS.neon[7].hex);
    expect(u.uNeonC.value.g).toBeCloseTo(wn.g, 4);
  });
});

describe('gövde yatışı / eğimi', () => {
  it('yanal ivme gövdeyi dışa yatırır (araba), motor içe eğilir; sınırlı', () => {
    vr = makeVR('high');
    for (let i = 0; i < 90; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, latAcc: -14, u: 20 }));
    const car = vr.rigs.get(1).group.rotation.z;
    expect(car).toBeLessThan(-0.01); // sağa (roll +) → rotation.z negatif; sol dönüş (latAcc<0) → sağ taraf aşağı
    expect(Math.abs(car)).toBeLessThan(0.16);
    vr.dispose();
    vr = makeVR('high');
    for (let i = 0; i < 90; i++) frame(vr, () => drawCar(vr, { id: 7, kind: 'motor', driven: true, latAcc: -14, u: 20 }));
    expect(vr.rigs.get(7).group.rotation.z).toBeGreaterThan(0.1); // sola eğilir
    expect(Math.abs(vr.rigs.get(7).group.rotation.z)).toBeLessThan(0.7);
  });
  it('reducedMotion: yatış payı küçülür', () => {
    const roll = (reduced) => {
      vr = makeVR('high');
      for (let i = 0; i < 120; i++) frame(vr, () => drawCar(vr, { id: 1, kind: 'sedan', driven: true, latAcc: -14, aLong: 8 }), Object.assign({}, ENV_NIGHT, { reduced }));
      const r = Math.abs(vr.rigs.get(1).group.rotation.z);
      vr.dispose();
      vr = null;
      return r;
    };
    expect(roll(true)).toBeLessThan(roll(false) * 0.6);
  });
  it('fiziksel pitch/roll ve konum grup dönüşüne yansır (yaw 0 = −Z)', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, x: 3, y: 64, z: -2, yaw: 1.2, pitch: 0.1, roll: 0.05 }));
    const g = vr.rigs.get(1).group;
    expect(g.position.toArray()).toEqual([3, 64, -2]);
    expect(g.rotation.y).toBeCloseTo(1.2, 5);
    expect(g.rotation.x).toBeGreaterThan(0.05);
  });
});


describe('zemin gölgesi', () => {
  const DAY = {
    night: 0, rain: 0, wet: 0, shelter: 0,
  };
  it('rig yakınken gölge üretir; çok uzaktaysa üretmez', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'taksi', driven: true, x: 0, y: 0, z: 0 }), DAY);
    expect(vr.fx.stats.smoke).toBe(1);
    const a = vr.fx.meshes.smoke.geometry.attributes.aFx.array;
    expect(a[0]).toBe(1); // mod: gölge
    expect(a[1]).toBeGreaterThan(0.2);
    frame(vr, () => drawCar(vr, { id: 2, kind: 'taksi', x: 400, y: 0, z: 0 }), DAY);
    expect(vr.fx.stats.smoke).toBe(0);
  });
  it('örnekli (trafik) araçlar için trafficLamp gölge ekler; uzaktakine eklemez', () => {
    vr = makeVR('high');
    frame(vr, () => {
      vr.trafficLamp('sedan', 3, 0, -10, 0, {});
      vr.trafficLamp('sedan', 3, 0, -300, 0, {});
    }, DAY);
    expect(vr.fx.stats.smoke).toBe(1);
  });
  it('süzülen araçta gölge silikleşir ve genişler', () => {
    vr = makeVR('high');
    frame(vr, () => drawCar(vr, { id: 1, kind: 'motor', driven: true, y: 0 }), DAY);
    const a0 = vr.fx.meshes.smoke.geometry.attributes.aFx.array[1];
    frame(vr, () => drawCar(vr, { id: 1, kind: 'hoverbike', driven: true, y: 1.2, hover: 1.2 }), DAY);
    const a1 = vr.fx.meshes.smoke.geometry.attributes.aFx.array[1];
    expect(a1).toBeLessThan(a0);
  });
  it('gölge sayısı kademe tavanını aşmaz (40 trafik gölgesi + rigler)', () => {
    vr = makeVR('low');
    frame(vr, () => {
      for (let i = 0; i < 80; i++) vr.trafficLamp('sedan', i * 0.5, 0, -10 - (i % 5), 0, {});
    }, DAY);
    expect(vr.fx.stats.smoke).toBeLessThanOrEqual(RENDER_TIERS.low.smoke);
    expect(vr.fx.stats.dropped).toBeGreaterThan(0);
  });
});

describe('plaka atlası', () => {
  it('slotFor: aynı metin aynı hücre; dolunca en az kullanılan yenilenir; dörtgen sınır içinde', () => {
    const a = createPlateAtlas({ createCanvas: () => fakeCanvas() });
    const i0 = a.slotFor('NM-AB 1000');
    expect(a.slotFor('NM-AB 1000')).toBe(i0);
    const used = new Set([i0]);
    for (let i = 1; i < PLATE_SLOTS; i++) used.add(a.slotFor('NM-KS ' + (2000 + i)));
    expect(used.size).toBe(PLATE_SLOTS);
    a.slotFor('NM-AB 1000'); // yeniden kullan: bu hücre korunur
    a.slotFor('NM-ZZ 9999'); // yeni → en eski çıkar
    expect(a.slotFor('NM-AB 1000')).toBe(i0);
    for (let i = 0; i < PLATE_SLOTS; i++) {
      const r = a.rectOf(i);
      expect(r[0]).toBeGreaterThanOrEqual(0);
      expect(r[0] + r[2]).toBeLessThanOrEqual(1.0001);
      expect(r[1] + r[3]).toBeLessThanOrEqual(1.0001);
    }
    const s = a.signRect;
    expect(s[1] + s[3]).toBeCloseTo(1, 5);
    expect(a.drawCount).toBeGreaterThan(PLATE_SLOTS);
  });
  it('tuval yoksa (düğüm) hata atmaz', () => {
    const a = createPlateAtlas({ createCanvas: () => null });
    expect(() => a.slotFor('X')).not.toThrow();
  });
  it('TAKSİ yazısı ve plaka çizimi (Türkçe İ) çağrılır', () => {
    const c = fakeCanvas();
    createPlateAtlas({ createCanvas: () => c }).slotFor('NM-AB 1234');
    expect(c.state.draws).toBeGreaterThan(2);
  });
});

describe('duman havuzu', () => {
  it('halka tampon: kapasiteyi aşmaz; ömür dolunca ölür; belirlenimci adım', () => {
    const p = createPuffPool(8);
    for (let i = 0; i < 20; i++) p.spawn(i, 0, 0, 1, 0, 0, 1, 1, 0.5);
    expect(p.step(0.016)).toBe(8);
    for (let i = 0; i < 100; i++) p.step(0.05);
    expect(p.count).toBe(0);
    const q = createPuffPool(0);
    expect(q.spawn(0, 0, 0, 0, 0, 0, 1, 1, 1)).toBe(-1);
    expect(q.step(0.1)).toBe(0);
  });
});

describe('tüm sınıflar çizilebilir', () => {
  it('her tür rig olarak ve örnekli olarak hatasız', () => {
    vr = makeVR('high');
    frame(vr, () => {
      MODEL_KINDS.forEach((k, i) => drawCar(vr, { id: 100 + i, kind: k, x: i * 5, y: k === 'hoverbike' ? 1.2 : 0, driven: i === 0 }));
    }, ENV_NIGHT);
    frame(vr, () => {
      MODEL_KINDS.forEach((k, i) => drawCar(vr, { id: 100 + i, kind: k, x: 500 + i * 5, y: 0 }));
    }, ENV_NIGHT);
    expect(vr.getStats().lod).toBe(MODEL_KINDS.length);
    VEHICLE_CLASSES.forEach((k) => expect(buildModel(k, 'hi').tris.total).toBeGreaterThan(0));
  });
});
