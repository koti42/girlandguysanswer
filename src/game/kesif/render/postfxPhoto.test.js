import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPostFx } from './postfx.js';
import { COMPOSITE_FRAGMENT } from './postfxShaders.js';

function fakeRenderer() {
  const calls = [];
  let target = null;
  return {
    calls,
    autoClear: true,
    extensions: { has: (n) => n === 'EXT_color_buffer_float' },
    capabilities: { maxSamples: 4 },
    getDrawingBufferSize(v) { v.set(640, 360); return v; },
    setRenderTarget(t) { target = t; },
    render(s, c) { calls.push({ target, scene: s, cam: c }); },
  };
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const mk = (q, extra) => {
  const r = fakeRenderer();
  const fx = createPostFx(THREE, Object.assign({ renderer: r, scene, camera, quality: q }, extra || {}));
  return { r, fx };
};
const photoUniform = (r) => {
  const last = r.calls[r.calls.length - 1];
  return last.scene.children[0].material.uniforms.uPhoto.value;
};

describe('post-fx foto modu (photo_map)', () => {
  it('kapalıyken ek maliyet yok: düşük kademede doğrudan çizim, uPhoto sıfır', () => {
    const { r, fx } = mk('low');
    fx.render(0.016);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].target).toBeNull();
    expect(fx.enabled).toBe(false);
    fx.dispose();
  });

  it('açıkken düşük kademede de son geçiş çalışır (ara hedef + birleştirme); kapanınca doğrudan çizime döner', () => {
    const { r, fx } = mk('low');
    fx.setPhoto({ filter: 3, amount: 1, grain: 0.2, seed: 1.5 });
    expect(fx.enabled).toBe(true);
    fx.render(0.016);
    expect(r.calls.length).toBe(2); // sahne + birleştirme (bloom seviyesi yok)
    expect(r.calls[0].target).not.toBeNull();
    expect(r.calls[1].target).toBeNull();
    const u = photoUniform(r);
    expect([u.x, u.y, u.z, u.w]).toEqual([3, 1, 0.2, 1.5]);
    r.calls.length = 0;
    fx.setPhoto(null);
    expect(fx.enabled).toBe(false);
    fx.render(0.016);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].target).toBeNull();
    fx.dispose();
  });

  it('yüksek kademede bloom zinciri bozulmaz; kapanınca uPhoto = (0,1,0,0)', () => {
    const { r, fx } = mk('high');
    fx.render(0.016);
    const n0 = r.calls.length;
    fx.setPhoto({ filter: 1, amount: 0.5, grain: 0, seed: 0 });
    r.calls.length = 0;
    fx.render(0.016);
    expect(r.calls.length).toBe(n0);
    fx.setPhoto(false);
    r.calls.length = 0;
    fx.render(0.016);
    const u = photoUniform(r);
    expect([u.x, u.y, u.z, u.w]).toEqual([0, 1, 0, 0]);
    fx.dispose();
  });

  it('girdi sınırlanır: bilinmeyen filtre 0, miktar 0..1, gren 0..0,6; NaN güvenli', () => {
    const { r, fx } = mk('medium');
    fx.setPhoto({ filter: 99, amount: 9, grain: 5, seed: 2 });
    fx.render(0.016);
    let u = photoUniform(r);
    expect([u.x, u.y, u.z]).toEqual([0, 1, 0.6]);
    fx.setPhoto({ filter: NaN, amount: NaN, grain: NaN, seed: NaN });
    fx.render(0.016);
    u = photoUniform(r);
    expect([u.x, u.y, u.z, u.w]).toEqual([0, 0, 0, 0]);
    fx.dispose();
  });

  it('kısıtlı hareket: gren tohumu 0 (sabit gren, titreşim yok)', () => {
    const { r, fx } = mk('high', { reducedMotion: true });
    fx.setPhoto({ filter: 2, amount: 1, grain: 0.3, seed: 7 });
    fx.render(0.016);
    expect(photoUniform(r).w).toBe(0);
    fx.dispose();
  });

  it('shader: filtre dalları yalnız uPhoto.x > 0.5 ile; gren zamana değil tohuma bağlı; pow tabanı kıskaçlı', () => {
    expect(COMPOSITE_FRAGMENT).toContain('uniform vec4 uPhoto;');
    expect(COMPOSITE_FRAGMENT).toContain('if (uPhoto.x > 0.5)');
    expect(COMPOSITE_FRAGMENT).toContain('uPhoto.w * 37.0');
    expect(COMPOSITE_FRAGMENT).not.toMatch(/uPhoto[^;]*uTime/);
    expect(COMPOSITE_FRAGMENT).toContain('pow(max(');
  });
});
