import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPostFx, POSTFX_GRADES, NEON_RAIN_BLOOM } from './postfx.js';
import { QUALITY } from './quality.js';

function fakeRenderer(opts) {
  const o = opts || {};
  const calls = [];
  let target = null;
  return {
    calls,
    autoClear: true,
    extensions: { has: (n) => (o.hdr === false ? false : n === 'EXT_color_buffer_float') },
    capabilities: { maxSamples: 4 },
    getDrawingBufferSize(v) { v.set(640, 360); return v; },
    setRenderTarget(t) { target = t; },
    render(s, c) { calls.push({ target, scene: s, cam: c }); },
  };
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const mk = (q, extra, ropts) => {
  const r = fakeRenderer(ropts);
  const fx = createPostFx(THREE, Object.assign({ renderer: r, scene, camera, quality: q }, extra || {}));
  return { r, fx };
};

describe('post-fx derecelendirme (şehir)', () => {
  it('şehir ayarı {bloom .95, threshold .8, knee .5, saturation 1.18, vignette .28}; ana diyar eski varsayılanlar', () => {
    expect(POSTFX_GRADES.neon).toEqual({
      bloom: 0.95, threshold: 0.8, knee: 0.5, exposure: 1.0, saturation: 1.18, vignette: 0.28,
    });
    expect(POSTFX_GRADES.overworld).toEqual({
      bloom: 0.5, threshold: 1.0, knee: 0.55, exposure: 1.0, saturation: 1.06, vignette: 0.85,
    });
    expect(NEON_RAIN_BLOOM).toBe(1.1);
    expect(Object.isFrozen(POSTFX_GRADES)).toBe(true);
  });

  it('setGrade/setGradeRain atmaz; bilinmeyen ad ana diyara döner; NaN yağış güvenli', () => {
    const { fx } = mk('high');
    expect(() => {
      fx.render(0.016);
      fx.setGrade('neon');
      fx.render(0.016);
      fx.setGrade('yok');
      fx.setGrade('neon');
      fx.setGradeRain(1);
      fx.setGradeRain(NaN);
      fx.setGradeRain(0.5);
      fx.render(0.016);
      fx.setGrade('overworld');
      fx.setGradeRain(1);
      fx.render(0.016);
    }).not.toThrow();
    fx.dispose();
  });
});

describe('post-fx geçiş efektleri (warp / fade)', () => {
  it('warp/fade yumuşatılmaz (geçiş makinesi eğriyi sürer) ve getEffectState içinde görünür', () => {
    const { fx } = mk('high');
    fx.setEffects({ warp: 0.5, fade: 0.25 });
    expect(fx.getEffectState().warp).toBe(0.5);
    expect(fx.getEffectState().fade).toBe(0.25);
    fx.render(0.016);
    expect(fx.getEffectState().warp).toBe(0.5);
    fx.setEffects({ warp: 2, fade: -3 });
    expect(fx.getEffectState().warp).toBe(1);
    expect(fx.getEffectState().fade).toBe(0);
    fx.setEffects({ warp: true });
    expect(fx.getEffectState().warp).toBe(1);
    fx.setEffects({ warp: NaN });
    expect(fx.getEffectState().warp).toBe(0);
    fx.setEffects({ underwater: 1 });
    expect(fx.getEffectState().underwater).toBe(0); // eski efektler yumuşatılır (anında değişmez)
    fx.dispose();
  });

  it('düşük kademede (post kapalı) geçiş sürerken ara hedefe çizer, bitince doğrudan çizime döner', () => {
    const { r, fx } = mk('low');
    expect(fx.enabled).toBe(false);
    fx.render(0.016);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].target).toBeNull();
    fx.setEffects({ warp: 0.6 });
    expect(fx.enabled).toBe(true);
    r.calls.length = 0;
    fx.render(0.016);
    // bloom yok (düşük): 1 sahne + 1 birleştirme
    expect(r.calls.length).toBe(2);
    expect(r.calls[0].target).not.toBeNull();
    expect(r.calls[0].target.samples).toBe(0);
    expect(r.calls[1].target).toBeNull();
    fx.setEffects({ warp: 0, fade: 0 });
    expect(fx.enabled).toBe(false);
    r.calls.length = 0;
    fx.render(0.016);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].target).toBeNull();
    fx.dispose();
  });

  it('yüksek kademe geçişte aynı bloom zincirini kullanır (ek geçiş yok)', () => {
    const { r, fx } = mk('high');
    fx.setEffects({ warp: 0.5 });
    fx.render(0.016);
    const L = QUALITY.high.bloomLevels;
    expect(r.calls.length).toBe(1 + L + (L - 1) + 1);
    fx.dispose();
  });

  it('HalfFloat desteği yoksa geçiş de doğrudan çizer (atmaz)', () => {
    const { r, fx } = mk('low', null, { hdr: false });
    fx.setEffects({ warp: 1 });
    expect(fx.enabled).toBe(false);
    expect(() => fx.render(0.016)).not.toThrow();
    expect(r.calls[0].target).toBeNull();
    fx.dispose();
  });

  it('reducedMotion: warp siyaha karartmaya çevrilir; 0,6 sn warp-in boyunca kare başına parlaklık adımı < 0,1', () => {
    const { fx } = mk('high', { reducedMotion: true });
    let prev = 0;
    let maxStep = 0;
    const frames = 36;
    for (let i = 0; i <= frames; i++) {
      const w = i / frames;
      fx.setEffects({ warp: w });
      fx.render(1 / 60);
      const fade = w * w * (3 - 2 * w); // render(): reduced → uFade = smoothstep(warp)
      maxStep = Math.max(maxStep, Math.abs(fade - prev));
      prev = fade;
    }
    expect(maxStep).toBeLessThan(0.1);
    expect(fx.getEffectState().warp).toBe(1);
    fx.dispose();
  });

  it('dispose sonrası setEffects/setGrade/render güvenli', () => {
    const { fx } = mk('high');
    fx.dispose();
    expect(() => {
      fx.setEffects({ warp: 1 });
      fx.setGrade('neon');
      fx.render(0.016);
    }).not.toThrow();
  });
});
