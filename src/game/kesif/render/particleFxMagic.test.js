import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createParticleSystem } from './particles.js';

const P = (x = 0, y = 0, z = 0) => ({ x, y, z });
const camAt = (x, y, z) => {
  const c = new THREE.PerspectiveCamera(70, 1.6, 0.1, 300);
  c.position.set(x, y, z);
  c.updateMatrixWorld(true);
  return c;
};
const finite = (sys) => {
  let bad = 0;
  sys._debug.layers.forEach((L) => L.arrays.forEach((a) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++; }));
  return bad;
};
const spawned = (ps) => ps.stats().spawned;

describe('büyü parçacıkları (particleFxMagic)', () => {
  it('her büyü efekti sonlu değerler üretir ve parçacık doğurur', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 7 });
    const calls = [
      () => ps.fireTrail(P(1, 2, 3)), () => ps.fireBurst(P(0, 1, 0), 2.2), () => ps.frostTrail(P(1, 2, 3)), () => ps.frostBurst(P(0, 1, 0), 1),
      () => ps.healRing(P(0, 0, 0), 0x7dffb0), () => ps.blinkBurst(P(0, 0, 0), 0xb25cff), () => ps.spellCast(P(0, 1, 0), 0xff7a2a),
      () => ps.enchantBurst(P(0, 1, 0), 3),
    ];
    calls.forEach((fn, i) => {
      const before = spawned(ps);
      for (let k = 0; k < 6; k++) fn();
      expect(spawned(ps), 'efekt ' + i).toBeGreaterThan(before);
    });
    ps.update(0.5, camAt(0, 1.6, 4));
    expect(finite(ps)).toBe(0);
  });

  it('kademe sınırları: enchantBurst 0/9/NaN kademede de çalışır', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'medium' });
    [0, 1, 5, 9, NaN, undefined].forEach((t) => ps.enchantBurst(P(0, 1, 0), t));
    ps.update(0.1, camAt(0, 1, 3));
    expect(finite(ps)).toBe(0);
  });

  it('arcane ve cauldron yayıcıları: yakındaysa doğurur, uzaktaysa doğurmaz; tuneEmitter yoğunluğu değiştirir', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 3 });
    const near = ps.addEmitter('arcane', P(1, 1, 1));
    const far = ps.addEmitter('arcane', P(300, 1, 0));
    expect(near).toBeGreaterThanOrEqual(0);
    const cam = camAt(0, 1.6, 3);
    for (let i = 0; i < 40; i++) ps.update(0.05, cam);
    expect(spawned(ps)).toBeGreaterThan(5);
    ps.removeEmitter(near);
    ps.removeEmitter(far);
    const c = ps.addEmitter('cauldron', P(0, 1, 0), { color: 0x5fe08a, radius: 0 });
    const a0 = spawned(ps);
    for (let i = 0; i < 40; i++) ps.update(0.05, cam);
    const idle = spawned(ps) - a0;
    ps.tuneEmitter(c, { radius: 1, color: 0xff7ab8 });
    const b0 = spawned(ps);
    for (let i = 0; i < 40; i++) ps.update(0.05, cam);
    const busy = spawned(ps) - b0;
    expect(busy).toBeGreaterThan(idle);
    ps.tuneEmitter(999, { radius: 1 }); // geçersiz kimlik zararsız
    expect(finite(ps)).toBe(0);
  });

  it('kısıtlı hareket yoğunluğu düşürür; hiçbir tarif 140 parçacığı aşmaz', () => {
    const ps = createParticleSystem(THREE, new THREE.Scene(), { quality: 'high', seed: 9 });
    const count = (fn) => { const a = spawned(ps); fn(); return spawned(ps) - a; };
    ['fireBurst', 'frostBurst', 'healRing', 'blinkBurst', 'enchantBurst'].forEach((name) => {
      expect(count(() => ps[name](P(0, 1, 0), 5)), name).toBeLessThanOrEqual(140);
    });
    const full = count(() => ps.enchantBurst(P(0, 1, 0), 5));
    ps.setReducedMotion(true);
    const calm = count(() => ps.enchantBurst(P(0, 1, 0), 5));
    expect(calm).toBeLessThan(full);
  });
});
