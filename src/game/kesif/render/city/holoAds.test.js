import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  pickHoloAnchors, selectVisible, createHoloAds, HOLO_MAX_TOTAL, HOLO_MAX_VISIBLE, HOLO_NEAR, HOLO_FAR, HOLO_FRAGMENT, HOLO_VERTEX,
} from './holoAds.js';
import { normalizeSkylineBox } from './skylineImpostor.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function towers(n, seed) {
  const r = lcg(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(normalizeSkylineBox({ cx: (r() - 0.5) * 1500, cz: (r() - 0.5) * 1500, w: 10 + r() * 30, d: 10 + r() * 30, h: 30 + r() * 300, y0: 64 }));
  }
  return out;
}

describe('pickHoloAnchors', () => {
  it('belirlenimci ve girdi sırasından bağımsız; ≤24', () => {
    const list = towers(300, 4);
    const a = pickHoloAnchors(list, 77, 24);
    const b = pickHoloAnchors(list.slice().reverse(), 77, 24);
    expect(a.length).toBeLessThanOrEqual(HOLO_MAX_TOTAL);
    expect(a.length).toBe(24);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = pickHoloAnchors(list, 78, 24);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
    expect(pickHoloAnchors(list, 77, 999).length).toBe(24);
    expect(pickHoloAnchors(list, 77, 5).length).toBe(5);
    expect(pickHoloAnchors(list, 77, 0).length).toBe(0);
  });

  it('yalnız yüksek ve geniş kuleler; pano şehir merkezine bakan yüzün önünde; boyutlar ve desenler geçerli', () => {
    const list = towers(300, 6);
    const a = pickHoloAnchors(list, 1, 24);
    a.forEach((p) => {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(p.yaw)).toBe(true);
      expect(p.w).toBeGreaterThanOrEqual(6);
      expect(p.w).toBeLessThanOrEqual(26);
      expect(p.h).toBeCloseTo(p.w * 0.56, 9);
      expect(p.hue).toBeGreaterThanOrEqual(0);
      expect(p.hue).toBeLessThan(4);
      expect(p.pattern).toBeGreaterThanOrEqual(0);
      expect(p.pattern).toBeLessThan(5);
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThanOrEqual(1);
      // pano normali (sin yaw, cos yaw) şehir merkezine (0,0) doğru bakar: merkezden uzaklaşan yönün tersi
      const nx = Math.sin(p.yaw);
      const nz = Math.cos(p.yaw);
      expect(nx * -p.x + nz * -p.z).toBeGreaterThan(-1e-6);
      // kulenin yüksekliğinin içinde
      expect(p.y).toBeGreaterThan(64);
      expect(p.y).toBeLessThan(64 + 340);
    });
  });

  it('kule yoksa en yüksek orta binalara düşer; hiç yoksa boş; bozuk girdi güvenli', () => {
    const mids = [normalizeSkylineBox({ cx: 100, cz: 100, w: 20, d: 20, h: 40 }), normalizeSkylineBox({ cx: -100, cz: 100, w: 20, d: 20, h: 30 })];
    expect(pickHoloAnchors(mids, 1, 24).length).toBe(2);
    expect(pickHoloAnchors([normalizeSkylineBox({ cx: 1, cz: 1, w: 5, d: 5, h: 10 })], 1, 24).length).toBe(0);
    expect(pickHoloAnchors(null, 1, 24)).toEqual([]);
    expect(pickHoloAnchors([null, {}, { cx: NaN }], NaN, 24)).toEqual([]);
  });
});

describe('selectVisible', () => {
  const cam = { x: 0, y: 100, z: 0 };
  const mk = (x, z) => ({ x, y: 100, z, w: 20, h: 11 });

  it('menzil [NEAR, FAR] dışını eler, en yakın cap tanesini yakından uzağa verir; cap ≤ 8', () => {
    const list = [];
    for (let i = 0; i < 24; i++) list.push(mk(10 + i * 20, 0)); // 10..470
    const out = [];
    const n = selectVisible(list, cam, null, 8, out);
    expect(n).toBe(8);
    const ds = out.slice(0, n).map((i) => list[i].x);
    expect(ds).toEqual([...ds].sort((a, b) => a - b));
    ds.forEach((d) => {
      expect(d).toBeGreaterThanOrEqual(HOLO_NEAR);
      expect(d).toBeLessThanOrEqual(HOLO_FAR);
    });
    expect(selectVisible(list, cam, null, 99, out)).toBe(8);
    expect(selectVisible(list, cam, null, 3, out)).toBe(3);
    expect(selectVisible(list, cam, null, 0, out)).toBe(0);
  });

  it('ekran dışı paneller seçilmez; frustum testi kullanılır; bozuk girdi güvenli', () => {
    const list = [mk(50, 0), mk(60, 0), mk(70, 0)];
    const out = [];
    expect(selectVisible(list, cam, (x) => x !== 60, 8, out)).toBe(2);
    expect(out.slice(0, 2)).toEqual([0, 2]);
    expect(selectVisible([null, { x: NaN, y: 0, z: 0 }, ...list], cam, null, 8, out)).toBe(3);
    expect(selectVisible(null, cam, null, 8, out)).toBe(0);
  });
});

describe('createHoloAds', () => {
  function camAt(x, y, z, yaw) {
    const c = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 1600);
    c.position.set(x, y, z);
    c.rotation.set(0, yaw, 0, 'YXZ');
    c.updateMatrixWorld(true);
    return c;
  }
  const anchors = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ x: -200 + i * 14, y: 120, z: -100, yaw: 0, w: 20, h: 11, hue: i % 4, pattern: i % 5, phase: i / n });
    return out;
  };

  it('TEK çizim çağrısı, ≤8 görünür, ≤24 toplam; kamera önündekiler seçilir', () => {
    const ads = createHoloAds(THREE, {});
    expect(ads.setAnchors(anchors(40))).toBe(24); // ≤24
    ads.update(0.3, camAt(0, 120, 60, 0)); // −Z'ye bakıyor, panolar z=−100'de
    expect(ads.getVisibleCount()).toBeLessThanOrEqual(HOLO_MAX_VISIBLE);
    expect(ads.getVisibleCount()).toBeGreaterThan(0);
    expect(ads.drawCalls).toBe(1);
    expect(ads.object3D.geometry.instanceCount).toBe(ads.getVisibleCount());
    ads.update(0.3, camAt(0, 120, 60, Math.PI)); // arkaya bakınca hiçbiri ekranda değil
    expect(ads.getVisibleCount()).toBe(0);
    expect(ads.drawCalls).toBe(0);
    expect(ads.object3D.visible).toBe(false);
    ads.dispose();
  });

  it('setCap tavanı düşürür; panolar solarak belirir (alfa 0 → 1, 1,5/sn)', () => {
    const ads = createHoloAds(THREE, { cap: 8 });
    ads.setAnchors(anchors(24));
    const cam = camAt(0, 120, 60, 0);
    ads.update(0.3, cam);
    const st = ads.object3D.geometry.getAttribute('aState');
    const a0 = st.array[1];
    expect(a0).toBeGreaterThan(0);
    expect(a0).toBeLessThan(1);
    for (let i = 0; i < 10; i++) ads.update(0.3, cam);
    expect(st.array[1]).toBe(1);
    ads.setCap(3);
    ads.update(0.3, cam);
    expect(ads.getVisibleCount()).toBeLessThanOrEqual(3);
    ads.setCap(100);
    ads.update(0.3, cam);
    expect(ads.getVisibleCount()).toBeLessThanOrEqual(HOLO_MAX_VISIBLE);
    ads.dispose();
  });

  it('reducedMotion: uMotion 0; nabız yok (shader kaynağı yavaş: ≤0,6 Hz)', () => {
    const ads = createHoloAds(THREE, { reducedMotion: true });
    expect(ads.object3D.material.uniforms.uMotion.value).toBe(0);
    ads.setReducedMotion(false);
    expect(ads.object3D.material.uniforms.uMotion.value).toBe(1);
    ads.dispose();
    // nabız: sin(t*1.9) → 1,9 rad/sn ≈ 0,30 Hz; tarama sin(... - t*1.4) ≈ 0,22 Hz; hiçbiri 3 Hz'e yaklaşmaz
    const rates = [...HOLO_FRAGMENT.matchAll(/sin\([^;]*?\bt\s*\*\s*([0-9.]+)/g)].map((m) => Number(m[1]));
    expect(rates.length).toBeGreaterThan(0);
    rates.forEach((r) => expect(r / (2 * Math.PI)).toBeLessThan(3));
  });

  it('geçersiz girdiler güvenli; dispose çift çağrı; shader pow tabanları kıskaçlı, parantez dengeli', () => {
    const ads = createHoloAds(THREE, {});
    ads.setAnchors(null);
    ads.update(0.1, camAt(0, 0, 0, 0));
    expect(ads.getVisibleCount()).toBe(0);
    ads.update(NaN, null);
    ads.setCap(NaN);
    ads.dispose();
    ads.dispose();
    expect(ads.setAnchors(anchors(2))).toBe(0);
    [HOLO_VERTEX, HOLO_FRAGMENT].forEach((src) => {
      const count = (ch) => src.split(ch).length - 1;
      expect(count('{')).toBe(count('}'));
      expect(count('(')).toBe(count(')'));
    });
    expect(HOLO_FRAGMENT).not.toMatch(/pow\(/);
    expect(HOLO_FRAGMENT).toContain('#include <tonemapping_fragment>');
  });

  it('toplamsal harmanlama, derinlik testi açık/yazma kapalı; tek malzeme', () => {
    const ads = createHoloAds(THREE, {});
    const m = ads.object3D.material;
    expect(m.blending).toBe(THREE.AdditiveBlending);
    expect(m.depthWrite).toBe(false);
    expect(m.depthTest).toBe(true);
    expect(m.transparent).toBe(true);
    ads.dispose();
  });
});
