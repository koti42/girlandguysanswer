/*
 * QA3-002 (qa_p3 G3): vehicleVisual ilk şehir karesinde araç programlarını ISINDIRIR: son işleme açıkken ara hedefle, kol (viewModel) görünür VE gizli durumda
 * (program anahtarı ışık sayısına bağlı: birinci şahıs kolundaki meşale ışığı). Kol görünürlüğü ısınmadan sonra eski haline döner; ısınma bir kez yapılır.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSystem } from './vehicleVisual.js';
import { createMaterialUniforms } from '../render/materials.js';

function fakeG(vmVisible, postOn) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1600);
  camera.position.set(0, 66, 8);
  camera.updateMatrixWorld(true);
  const seen = [];
  let current = null;
  const renderer = {
    getRenderTarget: () => current,
    setRenderTarget: (t) => { current = t; },
    compile: () => { seen.push({ vm: G.viewModel ? G.viewModel.group.visible : null, rt: !!current }); },
  };
  const G = {
    scene, camera, renderer, dim: 'neon', world: { getLight: () => 0xf0, dim: 'neon' }, materials: { uniforms: createMaterialUniforms(THREE) },
    vehicles: { entries: new Map(), driven: null }, time: { seconds: 0, tick: 0 }, quality: { settings: { effTier: 'high' } },
    cityLook: { state: { night: 0, rain: 0, wet: 0, shelter: 0 } }, opts: { createCanvas: () => null }, reducedMotion: false, vehicleCam: { mode: 0 },
    viewModel: { group: { visible: vmVisible } }, postfx: { enabled: !!postOn },
  };
  return { G, seen };
}

function run(sys, G, frames) {
  for (let i = 0; i < frames; i++) {
    G.time.seconds += 1 / 60;
    sys.frameUpdate(G, 1 / 60, 0.5);
  }
}

describe('vehicleVisual ısınması (QA3-002)', () => {
  [true, false].forEach((vis) => {
    it('kol ' + (vis ? 'görünürken' : 'gizliyken') + ' başlasa da iki ışık durumunda derler ve eski görünürlüğü geri verir; ara hedef kullanılır', () => {
      const { G, seen } = fakeG(vis, true);
      const sys = createSystem(G);
      sys.init();
      run(sys, G, 5);
      expect(seen.length).toBe(2);
      expect(seen.map((s) => s.vm).sort()).toEqual([false, true]);
      expect(seen.every((s) => s.rt)).toBe(true);
      expect(G.viewModel.group.visible).toBe(vis);
      run(sys, G, 30);
      expect(seen.length).toBe(2); // bir kez
      sys.dispose();
    });
  });

  it('viewModel yoksa tek derleme (çökmez); postfx kapalıysa ekran hedefi', () => {
    const { G, seen } = fakeG(true, false);
    delete G.viewModel;
    const sys = createSystem(G);
    sys.init();
    run(sys, G, 5);
    expect(seen.length).toBe(1);
    expect(seen[0].rt).toBe(false);
    sys.dispose();
  });
});
