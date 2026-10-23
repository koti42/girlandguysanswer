/*
 * vehicleVisual × Keşif araç boya kiti (sahte G, gerçek three): kit YALNIZ oyuncunun sürdüğü araca uygulanır; trafik/diğer araçlar ve
 * sim kozmetiği (v.cosmetics) değişmez; kit kalkınca garaj renkleri geri gelir; çizim çağrısı aynı.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSystem } from './vehicleVisual.js';
import { createMaterialUniforms } from '../render/materials.js';
import { createVehicle } from '../sim/city/vehicle/vehiclePhysics.js';
import { defaultCosmetics } from '../sim/city/vehicle/vehicleData.js';
import { resolveSkin, resolveSkinSet } from '../render/skins.js';

function fakeG() {
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
  return {
    scene: new THREE.Scene(), camera, dim: 'neon', world: { getLight: () => 0xf0, dim: 'neon' }, materials: { uniforms: createMaterialUniforms(THREE) }, vehicles: mgr, time: { seconds: 0, tick: 0 },
    quality: { settings: { effTier: 'high' } }, cityLook: { state: { night: 1, rain: 0, wet: 0, shelter: 0 } }, opts: { createCanvas: () => null },
    reducedMotion: false, vehicleCam: { mode: 0 }, renderer: null, cosmetics: { skins: resolveSkinSet(null, { tier: 'high' }) },
  };
}
function addEntry(G, cls, id, x, z, role) {
  const v = createVehicle(cls, { id, x, y: 64, z, yaw: 0.3, cosmetics: defaultCosmetics(cls, id) });
  const e = { id, propId: id, v, role: role || 'owned', occupied: false, prev: {} };
  G.vehicles.entries.set(id, e);
  return e;
}
function run(sys, G, frames) {
  for (let i = 0; i < frames; i++) {
    G.time.seconds += 1 / 60;
    sys.frameUpdate(G, 1 / 60, 0.5);
  }
}
const colors = (rig) => [rig.uniforms.uBodyU.value.getHex(), rig.uniforms.uAccentU.value.getHex(), rig.uniforms.uNeonC.value.getHex(), rig.uniforms.uRimStyle.value];
function calls(vr) {
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

describe('vehicleVisual: Keşif araç kiti', () => {
  it('yalnız sürülen araç kitlenir; diğer rig ve sim kozmetiği DEĞİŞMEZ; kit kalkınca garaj renkleri BİREBİR; çizim çağrısı aynı', () => {
    const G = fakeG();
    const sys = createSystem(G);
    sys.init();
    const e1 = addEntry(G, 'taksi', 1, 0, 0);
    const e2 = addEntry(G, 'spor', 2, 5, 0, 'display');
    G.vehicles.driven = e1;
    e1.occupied = true;
    const simBefore = JSON.stringify([e1.v.cosmetics, e2.v.cosmetics]);
    run(sys, G, 4);
    const vr = G.vehicleRender;
    const rig1 = vr.rigs.get(1);
    const rig2 = vr.rigs.get(2);
    const base1 = colors(rig1);
    const base2 = colors(rig2);
    const baseCalls = calls(vr);
    const kit = resolveSkin('arac', 'arac:gece-yolcusu');
    G.cosmetics.skins = resolveSkinSet({ arac: 'arac:gece-yolcusu' }, { tier: 'high' });
    run(sys, G, 3);
    expect(colors(rig1)).toEqual([kit.body, kit.accent, kit.neon, kit.wheels]);
    expect(colors(rig2)).toEqual(base2); // sürülmeyen araç etkilenmez
    expect(calls(vr)).toBe(baseCalls);
    expect(JSON.stringify([e1.v.cosmetics, e2.v.cosmetics])).toBe(simBefore); // sim kozmetiği aynı
    G.cosmetics.skins = resolveSkinSet(null, { tier: 'high' });
    run(sys, G, 3);
    expect(colors(rig1)).toEqual(base1);
    expect(calls(vr)).toBe(baseCalls);
    sys.dispose(G);
  });

  it('G.cosmetics yokken (eski G / test) çalışır', () => {
    const G = fakeG();
    delete G.cosmetics;
    const sys = createSystem(G);
    sys.init();
    const e1 = addEntry(G, 'taksi', 1, 0, 0);
    G.vehicles.driven = e1;
    e1.occupied = true;
    expect(() => run(sys, G, 3)).not.toThrow();
    sys.dispose(G);
  });
});
