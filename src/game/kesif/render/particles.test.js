import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KIND, createParticleSystem } from './particles.js';
import { AMBIENT_KINDS, MAX_FLASH_HZ } from './particleLogic.js';
import { B } from '../sim/blocks.js';

const P = (x = 0, y = 0, z = 0) => ({ x, y, z });
const camAt = (x, y, z) => {
  const c = new THREE.PerspectiveCamera(70, 1.6, 0.1, 300);
  c.position.set(x, y, z);
  c.updateMatrixWorld(true);
  return c;
};

function liveKinds(sys) {
  const out = {};
  const t = sys._debug.time;
  for (const L of sys._debug.layers) {
    const A = L.arrays;
    for (let i = 0; i < L.ring.high; i++) {
      const age = t - A[0][i * 4 + 3];
      if (age >= -10 && age < A[1][i * 4 + 3]) out[A[5][i * 4]] = (out[A[5][i * 4]] || 0) + 1;
    }
  }
  return out;
}

function allFinite(sys) {
  let bad = 0;
  for (const L of sys._debug.layers) {
    for (const arr of L.arrays) {
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) bad++;
    }
  }
  return bad;
}

function everyEffect(ps) {
  ps.blockBreak(B.STONE, P(1, 1, 1));
  ps.blockDust(B.DIRT, P(1, 1, 1), P(0, 1, 0));
  ps.stepDust(B.SAND, P(0, 1, 0));
  ps.hitSpark(P(0, 1, 0), P(1, 0, 0));
  ps.hitSpark(P(0, 1, 0));
  ps.pickup(P(0, 1, 0));
  ps.xpOrb(P(0, 1, 0));
  ps.orbTrail(P(0, 1, 0));
  ps.magicBurst(P(0, 0, 0), 0xb08cff, { radius: 2 });
  ps.portalSwirl(P(0, 1, 0), 0x3a8fff, { axis: 'x' });
  ps.bossShockwave(P(0, 0, 0), { radius: 6 });
  ps.deathMotes(P(0, 1, 0), 0xc8b0ff, 2);
  ps.arrowTrail(P(0, 1, 0));
  ps.beamImpact(P(0, 1, 0), P(0, 0, 1));
  ps.beamTrail(P(0, 1, 0), P(8, 1, 0));
  ps.healHearts(P(0, 1, 0));
  ps.levelUp(P(0, 0, 0));
  ps.achievement(P(0, 0, 0));
}

describe('parçacık sistemi', () => {
  it('iki katman, iki çizim çağrısı; sahneye eklenir ve dispose ile çıkar', () => {
    const scene = new THREE.Scene();
    const ps = createParticleSystem(THREE, scene, { quality: 'high' });
    expect(scene.children).toContain(ps.object3D);
    expect(ps.object3D.children.length).toBe(2);
    const st = ps.stats();
    expect(st.drawCalls).toBe(2);
    expect(st.capacity[0]).toBe(2048);
    expect(st.live).toBe(0);
    ps.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('tüm efektler sonlu değerler yazar; yaşayan parçacık var; zamanla hepsi ölür', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 5 });
    everyEffect(ps);
    ps.update(0.016, camAt(0, 2, 10));
    expect(allFinite(ps)).toBe(0);
    expect(ps.stats().live).toBeGreaterThan(100);
    for (let i = 0; i < 300; i++) ps.update(0.05, camAt(0, 2, 10)); // 15 sn
    expect(ps.stats().live).toBe(0);
    expect(allFinite(ps)).toBe(0);
    ps.dispose();
  });

  it('tür dağılımı: kırıntı/duman/kalp normal katmanda, ışıma/kıvılcım/halka/yıldız/zerre toplamalıda', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 9 });
    everyEffect(ps);
    const L = ps._debug.layers;
    for (let i = 0; i < L[0].ring.high; i++) expect([KIND.GLOW, KIND.SPARK, KIND.RING, KIND.STAR, KIND.MOTE]).toContain(L[0].arrays[5][i * 4]);
    for (let i = 0; i < L[1].ring.high; i++) expect([KIND.CHIP, KIND.SMOKE, KIND.HEART]).toContain(L[1].arrays[5][i * 4]);
    const kinds = liveKinds(ps);
    for (const k of Object.values(KIND)) expect(kinds[k] || 0).toBeGreaterThan(0);
    ps.dispose();
  });

  it('halka tampon sarar: kapasiteden fazla doğuşta yer sınırlı kalır, veri bozulmaz', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'low', max: 64, seed: 3 });
    for (let i = 0; i < 80; i++) ps.blockBreak(B.STONE, P(i, 0, 0));
    ps.update(0.016, camAt(0, 2, 5));
    const st = ps.stats();
    expect(st.spawned).toBeGreaterThan(st.capacity[0] + st.capacity[1]);
    expect(st.high[0]).toBeLessThanOrEqual(st.capacity[0]);
    expect(st.high[1]).toBeLessThanOrEqual(st.capacity[1]);
    expect(allFinite(ps)).toBe(0);
    ps.dispose();
  });

  it('update kısmi yükleme aralıklarını ekler; instanceCount yüksek su işaretine eşit', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high' });
    ps.update(0.016, camAt(0, 2, 5));
    const L = ps._debug.layers;
    const before = L[0].attrs[0].updateRanges.length;
    ps.hitSpark(P(0, 1, 0));
    ps.update(0.016, camAt(0, 2, 5));
    expect(L[0].attrs[0].updateRanges.length).toBeGreaterThan(before);
    expect(L[0].geo.instanceCount).toBe(L[0].ring.high);
    expect(L[0].geo.instanceCount).toBeGreaterThan(0);
    const after = L[0].attrs[0].updateRanges.length;
    ps.update(0.016, camAt(0, 2, 5));
    expect(L[0].attrs[0].updateRanges.length).toBe(after);
    ps.dispose();
  });

  it('kalite: düşük yoğunluk daha az parçacık üretir; setQuality etkin kapasiteyi düşürür', () => {
    const count = (q) => {
      let total = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: q, max: 2048, seed });
        ps.blockBreak(B.STONE, P(0, 0, 0));
        ps.levelUp(P(0, 0, 0));
        total += ps.stats().spawned;
        ps.dispose();
      }
      return total;
    };
    expect(count('low')).toBeLessThan(count('high') * 0.6);
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', max: 2048 });
    ps.setQuality('low');
    expect(ps.stats().quality).toBe('low');
    expect(ps._debug.layers[0].ring.activeCap).toBe(512);
    ps.setQuality('high');
    expect(ps._debug.layers[0].ring.activeCap).toBe(2048);
    ps.dispose();
  });

  it('kısıtlı hareket: yoğunluk düşer, ışıma flaşı yok, uCalm açık', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', reducedMotion: true, seed: 2 });
    expect(ps.stats().reduced).toBe(true);
    expect(ps.stats().density).toBeCloseTo(0.55, 6);
    expect(ps._debug.layers[0].mat.uniforms.uCalm.value).toBe(1);
    ps.hitSpark(P(0, 1, 0));
    expect(liveKinds(ps)[KIND.GLOW] || 0).toBe(0);
    ps.setReducedMotion(false);
    expect(ps._debug.layers[0].mat.uniforms.uCalm.value).toBe(0);
    ps.dispose();
  });

  it('tüm parıldama frekansları 3 Hz altında (normal ve kısıtlı modda)', () => {
    for (const reduced of [false, true]) {
      const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 4, reducedMotion: reduced });
      everyEffect(ps);
      const mix = {};
      AMBIENT_KINDS.forEach((k) => { mix[k] = 1; });
      ps.setAmbient(mix);
      for (let i = 0; i < 40; i++) ps.update(0.05, camAt(0, 2, 5));
      const A = ps._debug.layers[0].arrays;
      let checked = 0;
      for (let i = 0; i < ps._debug.layers[0].ring.high; i++) {
        if (A[5][i * 4] >= KIND.STAR) {
          expect(A[5][i * 4 + 1]).toBeLessThanOrEqual(2 * Math.PI * MAX_FLASH_HZ + 1e-6);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(20);
      ps.dispose();
    }
  });

  it('ortam: kamera çevresinde 3–14 blok içinde doğar; şiddet 0 iken doğmaz; oran şiddetle ölçeklenir', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 8 });
    ps.update(1, camAt(100, 20, -50));
    expect(ps.stats().spawned).toBe(0);
    ps.setAmbient({ fireflies: 1 });
    for (let i = 0; i < 50; i++) ps.update(0.1, camAt(100, 20, -50));
    const st = ps.stats();
    expect(st.spawned).toBeGreaterThanOrEqual(8);
    expect(st.spawned).toBeLessThanOrEqual(16);
    const A = ps._debug.layers[0].arrays;
    for (let i = 0; i < ps._debug.layers[0].ring.high; i++) {
      const d = Math.hypot(A[0][i * 4] - 100, A[0][i * 4 + 2] + 50);
      expect(d).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(d).toBeLessThanOrEqual(14 + 1e-6);
    }
    ps.setAmbient({ fireflies: 0.3 });
    const s0 = ps.stats().spawned;
    for (let i = 0; i < 100; i++) ps.update(0.1, camAt(100, 20, -50));
    expect((ps.stats().spawned - s0) / 10).toBeLessThan(2.4 * 0.3 * 1.5 + 1);
    ps.dispose();
  });

  it('ortam türlerinin hepsi doğar ve sonlu veri yazar', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 1 });
    const mix = {};
    AMBIENT_KINDS.forEach((k) => { mix[k] = 1; });
    ps.setAmbient(mix);
    for (let i = 0; i < 60; i++) ps.update(0.25, camAt(0, 5, 0));
    expect(ps.stats().spawned).toBeGreaterThan(60);
    expect(allFinite(ps)).toBe(0);
    ps.dispose();
  });

  it('yayıcılar: meşale yakında doğurur, uzakta doğurmaz, kaldırılınca durur, kimlikler yeniden kullanılır', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 6 });
    const cam = camAt(0, 2, 0);
    const near = ps.addEmitter('torch', P(2, 1, 2));
    const far = ps.addEmitter('torch', P(200, 1, 0));
    expect(ps.stats().emitters).toBe(2);
    for (let i = 0; i < 30; i++) ps.update(0.05, cam);
    expect(ps.stats().spawned).toBeGreaterThan(20);
    const A = ps._debug.layers[0].arrays;
    for (let i = 0; i < ps._debug.layers[0].ring.high; i++) expect(Math.abs(A[0][i * 4] - 2)).toBeLessThan(5);
    ps.removeEmitter(near);
    const mark = ps.stats().spawned;
    for (let i = 0; i < 30; i++) ps.update(0.05, cam);
    expect(ps.stats().spawned).toBe(mark);
    ps.moveEmitter(far, P(3, 1, 3));
    for (let i = 0; i < 30; i++) ps.update(0.05, cam);
    expect(ps.stats().spawned).toBeGreaterThan(mark + 10);
    expect(ps.addEmitter('lava', P(1, 0, 1))).toBe(near);
    const portal = ps.addEmitter('portal', P(0, 1, 3), { axis: 'z', color: 0xff8a2a });
    for (let i = 0; i < 20; i++) ps.update(0.05, cam);
    expect(allFinite(ps)).toBe(0);
    ps.removeEmitter(portal);
    ps.clearEmitters();
    expect(ps.stats().emitters).toBe(0);
    let last = 0;
    for (let i = 0; i < 200; i++) last = ps.addEmitter('torch', P(0, 0, 0));
    expect(last).toBe(-1);
    ps.dispose();
  });

  it('portal yörünge modunda yazılır; halka yönü normalden seçilir', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 7 });
    ps.portalSwirl(P(0, 1, 0), 0x3a8fff, { axis: 'x', count: 10 });
    let orbitCount = 0;
    const A = ps._debug.layers[0].arrays;
    for (let i = 0; i < ps._debug.layers[0].ring.high; i++) {
      const mode = A[5][i * 4 + 3];
      if (mode >= 4) { orbitCount++; expect(mode).toBe(5); }
    }
    expect(orbitCount).toBeGreaterThanOrEqual(8);
    ps.clear();
    ps.beamImpact(P(0, 0, 0), P(1, 0, 0));
    let ringMode = -1;
    for (let i = 0; i < ps._debug.layers[0].ring.high; i++) {
      if (A[5][i * 4] === KIND.RING && A[0][i * 4 + 3] > -1e8) ringMode = A[5][i * 4 + 3];
    }
    expect(ringMode).toBe(1);
    ps.dispose();
  });

  it('clear() hepsini öldürür; çok uzun oturumda zaman yeniden temellendirilir', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 2 });
    ps.levelUp(P(0, 0, 0));
    ps.update(0.016, camAt(0, 2, 5));
    expect(ps.stats().live).toBeGreaterThan(0);
    ps.clear();
    expect(ps.stats().live).toBe(0);
    for (let i = 0; i < 18100; i++) ps.update(0.1, null);
    expect(ps._debug.time).toBeLessThan(1800);
    ps.levelUp(P(0, 0, 0));
    for (let i = 0; i < 6; i++) ps.update(0.1, camAt(0, 2, 5));
    expect(ps.stats().live).toBeGreaterThan(10);
    expect(allFinite(ps)).toBe(0);
    ps.dispose();
  });

  it('negatif/aşırı dt güvenli; kamerasız çağrı hata vermez', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), {});
    ps.update(-1);
    ps.update(5);
    ps.update(0, undefined);
    expect(ps._debug.time).toBeCloseTo(0.1, 6);
    ps.dispose();
  });
});
