import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createChunkUploadWarmer } from './gameWarmChunks.js';
import { pickHiddenBands } from './render/chunkMgrWarm.js';

function makeBands(n) {
  const mat = new THREE.MeshBasicMaterial();
  const bands = [];
  for (let i = 0; i < n; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const m = new THREE.Mesh(geo, mat);
    bands.push({
      hasMesh: true, visible: false, sphere: { x: 10 + i * 4, y: 64, z: 0, r: 4 }, meshes: [m, null, null],
    });
  }
  const recs = new Map();
  bands.forEach((b, i) => recs.set(i, { bands: [b] }));
  return { bands, recs };
}

function fakeRenderer(log, cost) {
  const clock = { t: 0 };
  return {
    clock,
    autoClear: true,
    _rt: null,
    _sc: false,
    getRenderTarget() { return this._rt; },
    setRenderTarget(rt) { this._rt = rt; },
    getScissorTest() { return this._sc; },
    setScissorTest(b) { this._sc = !!b; },
    setScissor() {},
    render(sc) {
      clock.t += cost;
      log.push({ meshes: sc.children.length, scissor: this._sc, autoClear: this.autoClear, rt: !!this._rt });
    },
  };
}

describe('createChunkUploadWarmer', () => {
  it('kare başına en çok perFrame mesh, en yakından; yüklenenler bir daha seçilmez; hepsi bitince 0', () => {
    const { recs } = makeBands(7);
    const log = [];
    const r = fakeRenderer(log, 0.1);
    const camera = new THREE.PerspectiveCamera();
    const w = createChunkUploadWarmer({
      THREE, renderer: r, camera, chunkManager: { pickHidden: (x, y, z, far, max, isDone, out) => pickHiddenBands(recs, x, y, z, far, max, isDone, out) },
      getPostOn: () => false, perFrame: 3, now: () => r.clock.t,
    });
    expect(w.step(200)).toBe(3);
    expect(w.step(200)).toBe(3);
    expect(w.step(200)).toBe(1);
    expect(w.step(200)).toBe(0);
    expect(w.stats.uploaded).toBe(7);
    expect(log.length).toBe(3); // her adım tek render çağrısı (toplu)
    expect(log.every((l) => l.scissor && l.autoClear === false)).toBe(true);
    // durum geri alındı
    expect(r.getScissorTest()).toBe(false);
    expect(r.autoClear).toBe(true);
    expect(r.getRenderTarget()).toBeNull();
  });

  it('post-fx açıkken ara hedefe çizer; bütçeyi aşınca perFrame düşer, rahatlayınca geri artar', () => {
    const { recs } = makeBands(40);
    const log = [];
    const r = fakeRenderer(log, 5); // her render 5 ms → bütçe (3) aşılır
    const w = createChunkUploadWarmer({
      THREE, renderer: r, camera: new THREE.PerspectiveCamera(),
      chunkManager: { pickHidden: (x, y, z, far, max, isDone, out) => pickHiddenBands(recs, x, y, z, far, max, isDone, out) },
      getPostOn: () => true, perFrame: 4, budgetMs: 3, now: () => r.clock.t,
    });
    const counts = [w.step(500), w.step(500), w.step(500), w.step(500), w.step(500)];
    expect(log[0].rt).toBe(true);
    expect(counts[0]).toBe(4);
    expect(counts[1]).toBe(3);
    expect(counts[2]).toBe(2);
    expect(counts[3]).toBe(1);
    expect(counts[4]).toBe(1); // alt sınır 1
    // maliyet düşünce yeniden artar
    r.render = function render(sc) { r.clock.t += 0.2; log.push({ meshes: sc.children.length }); };
    const up = [w.step(500), w.step(500), w.step(500)];
    expect(up[0]).toBeGreaterThanOrEqual(1);
    expect(up[2]).toBeGreaterThan(up[0]);
    expect(Math.max(...up)).toBeLessThanOrEqual(4);
  });

  it('render fırlatırsa yeniden denemez (bağlam kaybı) ve durumu geri alır; dispose sonrası iş yapmaz', () => {
    const { recs } = makeBands(3);
    const r = fakeRenderer([], 0.1);
    r.render = () => { throw new Error('bağlam yok'); };
    const w = createChunkUploadWarmer({
      THREE, renderer: r, camera: new THREE.PerspectiveCamera(),
      chunkManager: { pickHidden: (x, y, z, far, max, isDone, out) => pickHiddenBands(recs, x, y, z, far, max, isDone, out) },
      getPostOn: () => false, perFrame: 3, now: () => 0,
    });
    expect(w.step(200)).toBe(3);
    expect(w.step(200)).toBe(0); // hepsi "yapıldı" sayıldı
    expect(r.getScissorTest()).toBe(false);
    expect(r.autoClear).toBe(true);
    w.dispose();
    expect(w.step(200)).toBe(0);
  });
});
