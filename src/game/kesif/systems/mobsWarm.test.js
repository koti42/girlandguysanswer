import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { warmPrograms } from './mobsWarm.js';

/** Sahte renderer: derleme çağrılarında etkin çizim hedefini kaydeder. */
function fakeG(postOn) {
  const calls = [];
  let target = null;
  const renderer = {
    properties: { get: () => ({}) },
    getRenderTarget: () => target,
    setRenderTarget: (t) => { target = t; },
    compile: () => { calls.push(target); },
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  return {
    G: {
      THREE, renderer, scene, camera, entityRoot: new THREE.Group(), postfx: { enabled: postOn },
    },
    calls,
  };
}

const parts = { tele: { warm() {} }, floaters: { warm() {} }, shots: { warm() {} } };

describe('mobsWarm: programlar gerçek çizim hedefiyle derlenir', () => {
  it('son işleme açıkken derlemeler ara hedefe (render target) yapılır — kelebek/ateş böceği ilk görünüşte takılmasın', () => {
    const { G, calls } = fakeG(true);
    G.scene.add(G.entityRoot);
    const w = warmPrograms(G, parts, 'high');
    expect(w).not.toBeNull();
    expect(calls.length).toBeGreaterThanOrEqual(6); // normal 3 kademe + çözülme 3 kademe
    calls.forEach((t) => expect(t).not.toBeNull());
    w.pool.forEach((m) => m.dispose());
  });

  it('son işleme kapalıyken ekran hedefi (null) kullanılır', () => {
    const { G, calls } = fakeG(false);
    G.scene.add(G.entityRoot);
    const w = warmPrograms(G, parts, 'low');
    expect(w).not.toBeNull();
    calls.forEach((t) => expect(t).toBeNull());
    w.pool.forEach((m) => m.dispose());
  });
});
