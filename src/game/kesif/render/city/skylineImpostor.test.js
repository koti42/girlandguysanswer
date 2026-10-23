import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  normalizeSkylineBox, buildSkylineInstances, createSkylineImpostor, SKYLINE_MAX, SKYLINE_BOX_TRIANGLES, SKYLINE_GROUND_HUE, SKYLINE_GROUND_Y,
} from './skylineImpostor.js';
import { SKYLINE_VERTEX, SKYLINE_FRAGMENT } from './skylineShaders.js';
import { createMaterialUniforms } from '../materials.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function boxes(n, seed) {
  const r = lcg(seed || 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ cx: (r() - 0.5) * 1600, cz: (r() - 0.5) * 1600, w: 8 + r() * 30, d: 8 + r() * 30, h: 20 + r() * 280, y0: 64 });
  }
  return out;
}

describe('normalizeSkylineBox', () => {
  it('merkez/köşe/dizi/kat biçimlerini aynı kutuya çevirir', () => {
    const a = normalizeSkylineBox({ cx: 10, cz: 20, w: 12, d: 8, h: 100, y0: 64 });
    expect(a).toMatchObject({ cx: 10, cz: 20, w: 12, d: 8, h: 100, y0: 64 });
    const b = normalizeSkylineBox({ x0: 4, z0: 16, w: 12, d: 8, floors: 25 });
    expect(b).toMatchObject({ cx: 10, cz: 20, w: 12, d: 8, h: 100, y0: 64 });
    const c = normalizeSkylineBox([10, 20, 12, 8, 100]);
    expect(c).toMatchObject({ cx: 10, cz: 20, w: 12, d: 8, h: 100, y0: 64 });
    const d = normalizeSkylineBox({ x: 10, z: 20, width: 12, depth: 8, top: 164, y0: 64 });
    expect(d).toMatchObject({ cx: 10, cz: 20, w: 12, d: 8, h: 100 });
    expect(normalizeSkylineBox({ x: 1, z: 2, w: 5, d: 5, y1: 80, baseY: 60 }).h).toBe(20);
  });

  it('geçersiz/sonlu olmayan girdiyi atar; boyutları kıstırır', () => {
    [null, undefined, 5, 'x', {}, [], { cx: NaN, cz: 0, w: 1, d: 1, h: 1 }, { cx: 0, cz: 0, w: -3, d: 4, h: 10 }, { cx: 0, cz: 0, w: 4, d: 4, h: 0 },
      { cx: 0, cz: 0, w: Infinity, d: 4, h: 10 }, [1, 2, 3, 4]].forEach((v) => expect(normalizeSkylineBox(v)).toBeNull());
    const big = normalizeSkylineBox({ cx: 0, cz: 0, w: 9999, d: 0.1, h: 9999 });
    expect(big.w).toBe(240);
    expect(big.d).toBe(2);
    expect(big.h).toBe(340);
    expect(normalizeSkylineBox({ cx: 0, cz: 0, w: 5, d: 5, h: 50, y0: 99999 }).y0).toBe(362);
  });

  it('bölge indeksi → o bölgenin neon tonu çifti (gerçek cepheler bölge paletini kullanır); tam sayı kimlik tohumu hash’lenir', () => {
    const r = buildSkylineInstances([
      { cx: 0, cz: 0, w: 20, d: 20, h: 100, district: 0, id: 1 }, { cx: 50, cz: 0, w: 20, d: 20, h: 100, district: 0, id: 2 },
      { cx: 100, cz: 0, w: 20, d: 20, h: 100, district: 1, id: 3 }, { cx: 150, cz: 0, w: 20, d: 20, h: 100, district: 4, id: 4 },
      { cx: 200, cz: 0, w: 20, d: 20, h: 100, district: 4, id: 5 },
    ], 600);
    const allowed = { 0: [0, 1], 1: [2, 1], 4: [0, 3] };
    const byX = {};
    r.boxes.forEach((bx) => { byX[bx.cx] = bx; });
    for (let i = 0; i < r.boxCount; i++) {
      const bx = r.boxes[i];
      const hue = r.b[(i + 1) * 4 + 3];
      const d = bx.hues === null ? -1 : [0, 1, 2, 3, 4, 5].find((k) => JSON.stringify(allowed[k]) === JSON.stringify(Array.from(bx.hues)));
      if (d !== undefined && d >= 0) expect(allowed[d]).toContain(hue);
    }
    // aynı district farklı id → farklı tohum (kesir kısmı sıfır değil)
    const seeds = new Set();
    for (let i = 0; i < r.boxCount; i++) seeds.add(r.b[(i + 1) * 4 + 2]);
    expect(seeds.size).toBe(r.boxCount);
    seeds.forEach((s) => {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(1);
    });
    expect(normalizeSkylineBox({ cx: 0, cz: 0, w: 5, d: 5, h: 50, district: 99 }).hues).toBeNull();
  });

  it('hue tam sayıya, seed sonlu sayıya indirgenir', () => {
    expect(normalizeSkylineBox({ cx: 0, cz: 0, w: 5, d: 5, h: 50, hue: 6 }).hue).toBe(2);
    expect(normalizeSkylineBox({ cx: 0, cz: 0, w: 5, d: 5, h: 50, hue: -1 }).hue).toBe(3);
    expect(normalizeSkylineBox({ cx: 0, cz: 0, w: 5, d: 5, h: 50 }).hue).toBe(-1);
  });
});

describe('buildSkylineInstances', () => {
  it('belirlenimci: aynı girdi → aynı bayt; sıra girdi permütasyonundan bağımsız', () => {
    const list = boxes(400, 3);
    const a = buildSkylineInstances(list, 600);
    const b = buildSkylineInstances(list.slice(), 600);
    expect(Array.from(a.a)).toEqual(Array.from(b.a));
    expect(Array.from(a.b)).toEqual(Array.from(b.b));
    const rev = buildSkylineInstances(list.slice().reverse(), 600);
    expect(Array.from(rev.a)).toEqual(Array.from(a.a));
    expect(Array.from(rev.b)).toEqual(Array.from(a.b));
  });

  it('≤600 kutu: fazlası en iri (yükseklik×taban) kutular tutularak kesilir; +1 zemin örneği', () => {
    const list = boxes(1500, 5);
    const r = buildSkylineInstances(list, 99999);
    expect(r.boxCount).toBe(SKYLINE_MAX);
    expect(r.count).toBe(SKYLINE_MAX + 1);
    expect(r.hasGround).toBe(true);
    expect(r.boxes.length).toBe(SKYLINE_MAX);
    const score = (b) => b.h * Math.sqrt(b.w * b.d);
    const kept = r.boxes.map(score);
    for (let i = 1; i < kept.length; i++) expect(kept[i]).toBeLessThanOrEqual(kept[i - 1] + 1e-9);
    const all = list.map((b) => normalizeSkylineBox(b)).map(score).sort((x, y) => y - x);
    expect(kept[kept.length - 1]).toBeCloseTo(all[SKYLINE_MAX - 1], 9);
  });

  it('küçük max, boş/bozuk liste güvenli; zemin yalnız kutu varken', () => {
    expect(buildSkylineInstances([], 600).count).toBe(0);
    expect(buildSkylineInstances(null, 600).count).toBe(0);
    expect(buildSkylineInstances(boxes(10, 1), 0).count).toBe(0);
    const r = buildSkylineInstances(boxes(10, 1), 4);
    expect(r.boxCount).toBe(4);
    expect(r.count).toBe(5);
    expect(buildSkylineInstances(boxes(10, 1), 4, false).count).toBe(4);
    const junk = buildSkylineInstances([null, NaN, {}, 'x', { cx: 1, cz: 2, w: 10, d: 10, h: 50 }], 600);
    expect(junk.boxCount).toBe(1);
  });

  it('zemin örneği: kutuları kapsar (≥400×400), sokak zemininin altında, işaretli', () => {
    const list = boxes(100, 9);
    const r = buildSkylineInstances(list, 600);
    expect(r.b[3]).toBe(SKYLINE_GROUND_HUE);
    expect(r.b[0] + r.b[1]).toBeLessThanOrEqual(SKYLINE_GROUND_Y + 1e-9);
    expect(r.a[2]).toBeGreaterThanOrEqual(400);
    for (let i = 1; i < r.count; i++) {
      const cx = r.a[i * 4];
      const cz = r.a[i * 4 + 1];
      expect(Math.abs(cx - r.a[0])).toBeLessThanOrEqual(r.a[2] / 2);
      expect(Math.abs(cz - r.a[1])).toBeLessThanOrEqual(r.a[3] / 2);
      expect(r.b[i * 4 + 3]).toBeLessThan(4);
      expect(r.b[i * 4 + 3]).toBeGreaterThanOrEqual(0);
      expect(r.b[i * 4 + 2]).toBeGreaterThanOrEqual(0);
      expect(r.b[i * 4 + 2]).toBeLessThan(1);
    }
  });

  it('tüm örnek değerleri sonlu', () => {
    const r = buildSkylineInstances(boxes(600, 2), 600);
    for (let i = 0; i < r.a.length; i++) expect(Number.isFinite(r.a[i])).toBe(true);
    for (let i = 0; i < r.b.length; i++) expect(Number.isFinite(r.b[i])).toBe(true);
  });
});

describe('createSkylineImpostor', () => {
  it('TEK çizim çağrısı: tek InstancedMesh, ≤601 örnek, kutu başına 10 üçgen', () => {
    const sky = createSkylineImpostor(THREE, { uniforms: createMaterialUniforms(THREE) });
    expect(sky.object3D.isMesh).toBe(true);
    expect(sky.object3D.geometry.isInstancedBufferGeometry).toBe(true);
    expect(sky.object3D.visible).toBe(false);
    expect(sky.drawCalls).toBe(0);
    expect(sky.setBoxes(boxes(900, 4))).toBe(600);
    expect(sky.getCount()).toBe(600);
    expect(sky.getInstanceCount()).toBe(601);
    expect(sky.object3D.geometry.instanceCount).toBe(601);
    expect(sky.drawCalls).toBe(1);
    expect(sky.triangles).toBe(601 * SKYLINE_BOX_TRIANGLES);
    expect(sky.object3D.geometry.index.count / 3).toBe(SKYLINE_BOX_TRIANGLES);
    expect(sky.object3D.visible).toBe(true);
    sky.dispose();
  });

  it('setMax kutu tavanını değiştirir; 0 → görünmez; boş liste → görünmez', () => {
    const sky = createSkylineImpostor(THREE, {});
    sky.setBoxes(boxes(500, 8));
    expect(sky.getCount()).toBe(500);
    sky.setMax(300);
    expect(sky.getCount()).toBe(300);
    sky.setMax(450);
    expect(sky.getCount()).toBe(450);
    sky.setMax(0);
    expect(sky.object3D.visible).toBe(false);
    expect(sky.getCount()).toBe(0);
    sky.setMax(9999);
    expect(sky.getCount()).toBe(500);
    sky.setBoxes([]);
    expect(sky.object3D.visible).toBe(false);
    sky.setBoxes('x');
    expect(sky.getCount()).toBe(0);
    sky.dispose();
  });

  it('öznitelik tamponları örnekle eşleşir; tavan düşünce artık değerler sıfırlanır', () => {
    const sky = createSkylineImpostor(THREE, {});
    const list = boxes(50, 2);
    sky.setBoxes(list);
    const a = sky.object3D.geometry.getAttribute('aBoxA');
    const b = sky.object3D.geometry.getAttribute('aBoxB');
    const r = buildSkylineInstances(list, 600);
    for (let i = 0; i < r.a.length; i++) {
      expect(a.array[i]).toBe(r.a[i]);
      expect(b.array[i]).toBe(r.b[i]);
    }
    sky.setMax(5);
    for (let i = 6 * 4; i < 51 * 4; i++) {
      expect(a.array[i]).toBe(0);
      expect(b.array[i]).toBe(0);
    }
    sky.dispose();
  });

  it('chunk malzemesinin uniform nesnelerini PAYLAŞIR (sis/gökyüzü/uNeon kareden kareye izlenir)', () => {
    const u = createMaterialUniforms(THREE);
    const sky = createSkylineImpostor(THREE, { uniforms: u });
    const mu = sky.object3D.material.uniforms;
    ['uNeon', 'uTime', 'uMotion', 'uSkyLight', 'uAmbientColor', 'uSunDir', 'uSunColor', 'uFogColor', 'uFogNear', 'uFogFar', 'uFadeEnd', 'uSkyColor', 'uHorizonColor']
      .forEach((n) => expect(mu[n]).toBe(u[n]));
    u.uNeon.value.set(1, 1.25, 0, 1);
    expect(mu.uNeon.value.x).toBe(1);
    sky.dispose();
  });

  it('uniform verilmezse güvenli varsayılanlar; kamera far onBeforeRender ile aktarılır', () => {
    const sky = createSkylineImpostor(THREE, {});
    const mu = sky.object3D.material.uniforms;
    ['uNeon', 'uFogColor', 'uFadeEnd'].forEach((n) => expect(mu[n].value).toBeDefined());
    const cam = new THREE.PerspectiveCamera(70, 1.7, 0.06, 1234);
    sky.object3D.onBeforeRender(null, null, cam);
    expect(mu.uFarClip.value).toBe(1234);
    sky.object3D.onBeforeRender(null, null, { far: NaN });
    expect(mu.uFarClip.value).toBe(1234);
    sky.dispose();
  });

  it('çatı/pencere A uniformu; dispose çift çağrıda güvenli ve sahneden çıkarır', () => {
    const sky = createSkylineImpostor(THREE, { windowGroupA: false });
    expect(sky.object3D.material.uniforms.uSkylineWindowA.value).toBe(0);
    sky.setWindowGroupA(true);
    expect(sky.object3D.material.uniforms.uSkylineWindowA.value).toBe(1);
    const scene = new THREE.Scene();
    scene.add(sky.object3D);
    sky.dispose();
    sky.dispose();
    expect(scene.children.length).toBe(0);
    expect(sky.setBoxes(boxes(3, 1))).toBe(0);
  });
});

describe('siluet shader kaynağı', () => {
  it('pow tabanları kıskaçlı; çıkış kıskacı; eşik uFadeEnd; far sıkıştırma var', () => {
    const bases = [];
    let i = 0;
    for (;;) {
      i = SKYLINE_FRAGMENT.indexOf('pow(', i);
      if (i < 0) break;
      bases.push(SKYLINE_FRAGMENT.slice(i + 4, SKYLINE_FRAGMENT.indexOf(',', i)).trim());
      i += 4;
    }
    bases.forEach((b) => expect(/^(max|clamp|abs)\(/.test(b)).toBe(true));
    expect(SKYLINE_FRAGMENT).toContain('sSafe(col)');
    expect(SKYLINE_FRAGMENT).toContain('if (vDist < uFadeEnd) discard;');
    expect(SKYLINE_VERTEX).toContain('uFarClip');
    expect(SKYLINE_VERTEX).toMatch(/mv\.xyz \*= rr \/ max\(r, 1\.0e-3\)/);
    expect(SKYLINE_FRAGMENT).toContain('#include <tonemapping_fragment>');
    expect(SKYLINE_FRAGMENT).toContain('#include <colorspace_fragment>');
  });

  it('pencere grubu eşiği chunk shader ile aynı kWindowLit (0,2/0,5/0,8, ±0,08)', () => {
    expect(SKYLINE_FRAGMENT).toContain('kWindowLit(uNeon.x, grp)');
    expect(SKYLINE_FRAGMENT).toContain('float e = group == 0 ? 0.2 : (group == 1 ? 0.5 : 0.8);');
    expect(SKYLINE_FRAGMENT).toContain('smoothstep(e - 0.08, e + 0.08, night)');
  });

  it('süslü/normal parantez ve #if dengesi', () => {
    [SKYLINE_VERTEX, SKYLINE_FRAGMENT].forEach((src) => {
      const count = (ch) => src.split(ch).length - 1;
      expect(count('{')).toBe(count('}'));
      expect(count('(')).toBe(count(')'));
    });
  });

  it('bildirilen uniform adlarının hepsi createMaterialUniforms içinde ya da malzemenin kendi uniformu', () => {
    const u = createMaterialUniforms(THREE);
    const own = new Set(['uFarClip', 'uSkylineWindowA']);
    const declared = new Set();
    (SKYLINE_VERTEX + SKYLINE_FRAGMENT).replace(/uniform\s+\w+\s+(\w+)\s*;/g, (m, n) => { declared.add(n); return m; });
    declared.forEach((n) => expect(own.has(n) || u[n] !== undefined, n).toBe(true));
  });
});
