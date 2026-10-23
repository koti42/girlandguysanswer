import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  NB_DIRS, spiralOffsets, chunkPriority, frustumPlanes, sphereVisible, boxVisible, boxDistance, sortByScore, clamp, ema,
} from './chunkMgrQueue.js';

describe('spiralOffsets', () => {
  it('merkezden başlar, mesafeye göre artan sıralı ve disk içindedir', () => {
    const sp = spiralOffsets(4);
    expect(sp.dx[0]).toBe(0);
    expect(sp.dz[0]).toBe(0);
    for (let i = 1; i < sp.count; i++) {
      expect(sp.dist[i]).toBeGreaterThanOrEqual(sp.dist[i - 1] - 1e-6);
      expect(sp.dx[i] * sp.dx[i] + sp.dz[i] * sp.dz[i]).toBeLessThanOrEqual(4.5 * 4.5);
    }
  });

  it('önbelleğe alır (aynı nesne) ve bilinen sayıyı verir', () => {
    expect(spiralOffsets(3)).toBe(spiralOffsets(3));
    expect(spiralOffsets(0).count).toBe(1);
    expect(spiralOffsets(1).count).toBe(9); // 3x3: köşe d²=2 ≤ 2,25
  });

  it('kopya yok: her ofset bir kez geçer', () => {
    const sp = spiralOffsets(6);
    const seen = new Set();
    for (let i = 0; i < sp.count; i++) seen.add(sp.dx[i] + ',' + sp.dz[i]);
    expect(seen.size).toBe(sp.count);
  });
});

describe('chunkPriority', () => {
  it('ayağın altındaki chunk mutlak öncelikli', () => {
    expect(chunkPriority(0, 0, 0, -1)).toBe(0);
    expect(chunkPriority(1, 0, 0, -1)).toBeLessThan(chunkPriority(0, -2, 0, -1));
  });

  it('bakış yönündeki chunk aynı uzaklıktaki arkadakinden önce gelir', () => {
    const ahead = chunkPriority(0, -5, 0, -1);
    const side = chunkPriority(5, 0, 0, -1);
    const behind = chunkPriority(0, 5, 0, -1);
    expect(ahead).toBeLessThan(side);
    expect(side).toBeLessThan(behind);
  });

  it('yakın olan uzak olandan önce gelir (aynı yönde)', () => {
    expect(chunkPriority(0, -3, 0, -1)).toBeLessThan(chunkPriority(0, -6, 0, -1));
  });
});

describe('frustum', () => {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300);
  cam.position.set(10, 60, 10);
  cam.lookAt(10, 60, -100);
  cam.updateMatrixWorld();
  const planes = new Float64Array(24);
  frustumPlanes(cam.projectionMatrix.elements, cam.matrixWorldInverse.elements, planes);

  it('önündeki küre görünür, arkasındaki değil', () => {
    expect(sphereVisible(planes, 10, 60, -50, 4)).toBe(true);
    expect(sphereVisible(planes, 10, 60, 60, 4)).toBe(false);
  });

  it('yan tarafa taşan büyük küre kesişiyorsa görünür', () => {
    expect(sphereVisible(planes, 200, 60, -50, 4)).toBe(false);
    expect(sphereVisible(planes, 200, 60, -50, 400)).toBe(true);
  });

  it('three Frustum ile aynı sonucu verir', () => {
    const fr = new THREE.Frustum();
    const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    fr.setFromProjectionMatrix(m);
    const sph = new THREE.Sphere();
    let agree = 0;
    let total = 0;
    for (let x = -120; x <= 140; x += 20) {
      for (let z = -250; z <= 100; z += 25) {
        for (let y = 0; y <= 120; y += 30) {
          sph.set(new THREE.Vector3(x, y, z), 8);
          total++;
          if (fr.intersectsSphere(sph) === sphereVisible(planes, x, y, z, 8)) agree++;
        }
      }
    }
    expect(agree).toBe(total);
  });
});

describe('kutu frustum testi', () => {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 300);
  cam.position.set(10, 60, 10);
  cam.lookAt(10, 60, -100);
  cam.updateMatrixWorld();
  const planes = new Float64Array(24);
  frustumPlanes(cam.projectionMatrix.elements, cam.matrixWorldInverse.elements, planes);

  it('önündeki kutu görünür, arkasındaki ve yandaki değil', () => {
    expect(boxVisible(planes, [0, 50, -60, 16, 70, -44])).toBe(true);
    expect(boxVisible(planes, [0, 50, 40, 16, 70, 56])).toBe(false);
    expect(boxVisible(planes, [300, 50, -60, 316, 70, -44])).toBe(false);
  });

  it('three Frustum ile uyumlu (kutu), ve uzun-ince kutuda küre testinden daha sıkı', () => {
    const fr = new THREE.Frustum();
    fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let agree = 0;
    let total = 0;
    let boxOnlyRejects = 0;
    const box3 = new THREE.Box3();
    const sph = new THREE.Sphere();
    for (let x = -200; x <= 200; x += 16) {
      for (let z = -250; z <= 100; z += 16) {
        const b = [x, 2, z, x + 16, 120, z + 16]; // 16×118×16: küre yarıçapı ≈ 60
        box3.set(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
        total++;
        if (fr.intersectsBox(box3) === boxVisible(planes, b)) agree++;
        const cx = (b[0] + b[3]) / 2;
        const cy = (b[1] + b[4]) / 2;
        const cz = (b[2] + b[5]) / 2;
        sph.set(new THREE.Vector3(cx, cy, cz), Math.hypot(8, 59, 8));
        if (sphereVisible(planes, cx, cy, cz, sph.radius) && !boxVisible(planes, b)) boxOnlyRejects++;
      }
    }
    // p-köşe testi korumacıdır (yanlış red yok): three'nin kutu testiyle çoğunlukla aynı, kutu sphere'den fazla eler
    expect(agree / total).toBeGreaterThan(0.97);
    expect(boxOnlyRejects).toBeGreaterThan(10);
  });

  it('boxDistance: içerideyse 0, dışarıda en yakın noktaya mesafe', () => {
    const b = [0, 0, 0, 16, 100, 16];
    expect(boxDistance(b, 8, 50, 8)).toBe(0);
    expect(boxDistance(b, 20, 50, 8)).toBeCloseTo(4, 6);
    expect(boxDistance(b, 19, 104, 8)).toBeCloseTo(5, 6);
    expect(boxDistance(b, -3, -4, 8)).toBeCloseTo(5, 6);
  });
});

describe('küçük yardımcılar', () => {
  it('NB_DIRS mesher yön adlarıyla (kuzey = -Z, doğu = +X) uyuşur', () => {
    const m = {};
    NB_DIRS.forEach((d) => { m[d.key] = [d.dx, d.dz]; });
    expect(m.n).toEqual([0, -1]);
    expect(m.s).toEqual([0, 1]);
    expect(m.e).toEqual([1, 0]);
    expect(m.w).toEqual([-1, 0]);
    expect(m.ne).toEqual([1, -1]);
    expect(m.nw).toEqual([-1, -1]);
    expect(m.se).toEqual([1, 1]);
    expect(m.sw).toEqual([-1, 1]);
  });

  it('sortByScore, clamp, ema', () => {
    expect(sortByScore([{ score: 3 }, { score: 1 }, { score: 2 }]).map((r) => r.score)).toEqual([1, 2, 3]);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(ema(0, 10)).toBe(10);
    expect(ema(10, 20, 0.5)).toBe(15);
  });
});
