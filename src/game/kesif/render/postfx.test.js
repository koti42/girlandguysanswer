import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPostFx } from './postfx.js';
import { QUALITY } from './quality.js';

/** Sahte renderer: çağrıları sayar, hedefleri kaydeder. */
function fakeRenderer(opts) {
  const o = opts || {};
  const calls = [];
  let target = null;
  return {
    calls,
    autoClear: true,
    extensions: { has: (n) => (o.hdr === false ? false : n === 'EXT_color_buffer_float') },
    capabilities: { maxSamples: o.maxSamples === undefined ? 4 : o.maxSamples },
    getDrawingBufferSize(v) {
      v.set(o.w || 640, o.h || 360);
      return v;
    },
    setRenderTarget(t) {
      target = t;
    },
    render(sceneOrFs, cam) {
      calls.push({ target, scene: sceneOrFs, cam });
    },
  };
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

describe('createPostFx', () => {
  it('düşük kalitede doğrudan çizer (ara hedef yok), enabled=false', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'low' });
    expect(fx.enabled).toBe(false);
    fx.render(0.016);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].target).toBeNull();
    expect(r.calls[0].scene).toBe(scene);
    fx.dispose();
  });

  it('yüksek kalitede: sahne HDR hedefe, bloom zinciri, son geçiş ekrana', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high' });
    expect(fx.enabled).toBe(true);
    fx.render(0.016);
    const L = QUALITY.high.bloomLevels;
    // 1 sahne + L aşağı + (L-1) yukarı + 1 birleştirme
    expect(r.calls.length).toBe(1 + L + (L - 1) + 1);
    expect(r.calls[0].scene).toBe(scene);
    expect(r.calls[0].target).not.toBeNull();
    expect(r.calls[0].target.texture.type).toBe(THREE.HalfFloatType);
    expect(r.calls[0].target.samples).toBe(4);
    expect(r.calls[r.calls.length - 1].target).toBeNull();
    // bloom hedefleri her seviyede yarıya iner
    const sizes = r.calls.slice(1, 1 + L).map((c) => c.target.width);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(Math.ceil(sizes[i - 1] / 2));
    expect(sizes[0]).toBe(320);
    expect(r.autoClear).toBe(true); // geri yüklendi
    fx.dispose();
  });

  it('orta kalitede MSAA yok, 3 bloom seviyesi', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'medium' });
    fx.render(0.016);
    expect(r.calls[0].target.samples).toBe(0);
    expect(r.calls.length).toBe(1 + 3 + 2 + 1);
    fx.dispose();
  });

  it('HalfFloat desteği yoksa post-fx kapalı kalır ve doğrudan çizer', () => {
    const r = fakeRenderer({ hdr: false });
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high' });
    expect(fx.enabled).toBe(false);
    fx.render(0.016);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].target).toBeNull();
    fx.dispose();
  });

  it('MSAA, desteklenen en fazla örnekle sınırlanır', () => {
    const r = fakeRenderer({ maxSamples: 2 });
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high' });
    fx.render(0.016);
    expect(r.calls[0].target.samples).toBe(2);
    fx.dispose();
  });

  it('çizim tamponu boyutu değişince hedefler yeniden kurulur', () => {
    const r = fakeRenderer({ w: 800, h: 450 });
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high' });
    fx.render(0.016);
    const first = r.calls[0].target;
    expect(first.width).toBe(800);
    r.getDrawingBufferSize = (v) => v.set(1024, 576);
    r.calls.length = 0;
    fx.render(0.016);
    expect(r.calls[0].target.width).toBe(1024);
    expect(r.calls[0].target).not.toBe(first);
    fx.dispose();
  });

  it('setQuality: yüksek → düşük hedefleri bırakır; düşük → yüksek yeniden kurar', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high' });
    fx.render(0.016);
    fx.setQuality('low');
    expect(fx.enabled).toBe(false);
    r.calls.length = 0;
    fx.render(0.016);
    expect(r.calls.length).toBe(1);
    fx.setQuality('high');
    expect(fx.enabled).toBe(true);
    r.calls.length = 0;
    fx.render(0.016);
    expect(r.calls.length).toBeGreaterThan(5);
    fx.dispose();
  });

  it('bloom kapalı kaliteyle zincir atlanır (yalnız sahne + birleştirme)', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: { post: true, bloom: false, bloomLevels: 0, msaa: 0 } });
    fx.render(0.016);
    expect(r.calls.length).toBe(2);
    fx.dispose();
  });

  it('efektler yumuşatılır, boolean kabul edilir, değerler 0..1 kıskaçlanır', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high' });
    fx.setEffects({ underwater: true, hurt: 3, heal: -1, boss: 0.5 });
    expect(fx.getEffectState().underwater).toBe(0);
    fx.render(0.05);
    const s1 = fx.getEffectState().underwater;
    expect(s1).toBeGreaterThan(0);
    expect(s1).toBeLessThan(1);
    for (let i = 0; i < 80; i++) fx.render(0.05);
    const s = fx.getEffectState();
    expect(s.underwater).toBe(1);
    expect(s.hurt).toBe(1);
    expect(s.heal).toBe(0);
    expect(s.boss).toBeCloseTo(0.5, 2);
    fx.setEffects({ underwater: false });
    for (let i = 0; i < 80; i++) fx.render(0.05);
    expect(fx.getEffectState().underwater).toBe(0);
    expect(fx.getEffectState().hurt).toBe(1); // verilmeyen alan değişmedi
    fx.dispose();
  });

  it('düşük kalitede de efekt durumu izlenir (HUD kaplaması için)', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'low' });
    fx.setEffects({ hurt: 1 });
    fx.render(0.2);
    expect(fx.getEffectState().hurt).toBeGreaterThan(0.5);
    fx.dispose();
  });

  it('reducedMotion: dalgalanma kapalı, hasar kırmızısı azaltılır', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high', reducedMotion: true });
    fx.setEffects({ hurt: 1, underwater: 1 });
    for (let i = 0; i < 20; i++) fx.render(0.05);
    // birleştirme malzemesinin uniform'ları (son geçişteki malzeme)
    const comp = r.calls[r.calls.length - 1].scene.children[0].material.uniforms;
    expect(comp.uWobble.value).toBe(0);
    expect(comp.uHurt.value).toBeLessThanOrEqual(0.6);
    fx.setReducedMotion(false);
    fx.render(0.05);
    expect(comp.uWobble.value).toBe(1);
    expect(comp.uHurt.value).toBeGreaterThan(0.6);
    fx.dispose();
  });

  it('tune: bloom/pozlama/doygunluk uniform\'lara yansır', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high' });
    fx.tune({ bloom: 0.9, exposure: 1.2, saturation: 0.9, vignette: 0.5, threshold: 1.3 });
    fx.render(0.016);
    const comp = r.calls[r.calls.length - 1].scene.children[0].material.uniforms;
    expect(comp.uBloom.value).toBe(0.9);
    expect(comp.uExposure.value).toBe(1.2);
    expect(comp.uSaturation.value).toBe(0.9);
    expect(comp.uVignette.value).toBe(0.5);
    fx.dispose();
  });

  it('dispose sonrası render etkisiz', () => {
    const r = fakeRenderer();
    const fx = createPostFx(THREE, { renderer: r, scene, camera, quality: 'high' });
    fx.dispose();
    fx.render(0.016);
    expect(r.calls.length).toBe(0);
  });
});
