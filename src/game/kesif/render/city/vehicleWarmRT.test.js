/*
 * QA3-002 (qa_p3 G3): araç gölgelendirici ön ısıtması (vr.warm) gerçek çizim hedefiyle derlemeli.
 * Son işleme açıkken sahne yarı-kayan noktalı bir ara hedefe çizilir (srgb-linear, ton eşleme yok); program anahtarı hedefe bağlı olduğundan ekran hedefiyle derlenen
 * programlar kullanılmaz ve ilk görünen araçta (gövde ~200 ms, cam ~55 ms) derleme takılması olurdu.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVehicleRenderer } from './vehicleModels.js';
import { createMaterialUniforms } from '../materials.js';

function fakeCanvas() {
  const ctx = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, rect() {}, fillRect() {}, fillText() {}, roundRect() {},
    measureText: (t) => ({ width: t.length * 10 }), font: '',
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

function makeVR() {
  const uniforms = createMaterialUniforms(THREE);
  return createVehicleRenderer({ THREE, uniforms, quality: 'high', createCanvas: () => fakeCanvas() });
}

function fakeRenderer() {
  const log = { targetAtCompile: [], sets: [] };
  let current = null;
  const r = {
    getRenderTarget: () => current,
    setRenderTarget: (t) => { current = t; log.sets.push(t ? 'rt' : 'null'); },
    compile: () => { log.targetAtCompile.push(current); },
  };
  return { r, log };
}

describe('vr.warm: derleme hedefi (QA3-002)', () => {
  it('postfx açık: compile yarı-kayan noktalı ara hedef bağlıyken çağrılır; sonra önceki hedef geri gelir', () => {
    const vr = makeVR();
    const { r, log } = fakeRenderer();
    const scene = new THREE.Scene();
    scene.add(vr.group);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    vr.warm(r, scene, camera, { postfx: true });
    expect(log.targetAtCompile.length).toBe(1);
    expect(log.targetAtCompile[0]).toBeTruthy();
    expect(log.targetAtCompile[0].texture.type).toBe(THREE.HalfFloatType);
    expect(r.getRenderTarget()).toBe(null);
    expect(log.sets).toEqual(['rt', 'null']);
    vr.dispose();
  });

  it('postfx kapalı / seçenek yok: ekran hedefiyle derlenir, hedef değiştirilmez', () => {
    const vr = makeVR();
    const scene = new THREE.Scene();
    scene.add(vr.group);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    [undefined, {}, { postfx: false }].forEach((o) => {
      const { r, log } = fakeRenderer();
      vr.warm(r, scene, camera, o);
      expect(log.targetAtCompile).toEqual([null]);
      expect(log.sets).toEqual([]);
    });
    vr.dispose();
  });

  it('compile atarsa önceki hedef yine geri gelir ve sahne görünürlüğü eski haline döner', () => {
    const vr = makeVR();
    const scene = new THREE.Scene();
    scene.add(vr.group);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    const { r, log } = fakeRenderer();
    r.compile = () => { throw new Error('derleme hatası'); };
    expect(() => vr.warm(r, scene, camera, { postfx: true })).not.toThrow();
    expect(r.getRenderTarget()).toBe(null);
    expect(log.sets).toEqual(['rt', 'null']);
    vr.dispose();
  });

  it('variants: her ışık durumu için ayrı compile; enter/exit sırayla ve compile atsa da çağrılır', () => {
    const vr = makeVR();
    const scene = new THREE.Scene();
    scene.add(vr.group);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    const { r } = fakeRenderer();
    const order = [];
    let n = 0;
    r.compile = () => { n++; order.push('compile' + n); if (n === 1) throw new Error('ilk derleme hatası'); };
    const variants = [
      { enter: () => order.push('enter-a'), exit: () => order.push('exit-a') },
      { enter: () => order.push('enter-b'), exit: () => order.push('exit-b') },
    ];
    vr.warm(r, scene, camera, { postfx: false, variants });
    expect(order).toEqual(['enter-a', 'compile1', 'exit-a', 'enter-b', 'compile2', 'exit-b']);
    vr.dispose();
  });

  it('variants yok / boş: tek compile (eski davranış)', () => {
    const vr = makeVR();
    const scene = new THREE.Scene();
    scene.add(vr.group);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    [undefined, [], null].forEach((variants) => {
      const { r, log } = fakeRenderer();
      vr.warm(r, scene, camera, { variants });
      expect(log.targetAtCompile.length).toBe(1);
    });
    vr.dispose();
  });
});
