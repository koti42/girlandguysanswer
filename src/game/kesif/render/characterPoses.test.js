import { describe, expect, it } from 'vitest';
import {
  HOLD_KINDS, POSES, POSE_NAMES, applyNamedPose, blendPose, chooseLocomotion, copyPose, createPoseTarget, dampK, gaitRate,
  groundHips, poseHurt, poseIdle, poseWalk, wrapAngle, POSE_BONES,
} from './characterPoses.js';

const REST = { hipsY: 0.92, thigh: 0.41, shin: 0.425, ankle: 0.085 };
const PARAMS = [
  {}, { speed01: 0.2, phase: 0.3, hold: 'tool' }, { speed01: 1.2, phase: 4.1, hold: 'sword' }, { vy01: -1, hold: 'gun' },
  { vy01: 1, hold: 'bow' }, { progress: 0, charge: 0 }, { progress: 1, charge: 1, kind: 'bow' }, { progress: 0.5, pull: 1, hold: 'block' },
  { phase: -7, speed01: 0.7, hold: 'torch' }, { hold: 'shield' }, { hold: 'food' },
];

function allFinite(rig) {
  POSE_BONES.forEach((b) => {
    ['x', 'y', 'z'].forEach((ax) => {
      expect(Number.isFinite(rig[b].rotation[ax])).toBe(true);
      expect(Number.isFinite(rig[b].position[ax])).toBe(true);
    });
  });
}

describe('characterPoses: tüm pozlar sonlu ve sınırlı değer üretir', () => {
  it('sözleşmedeki poz kümesi mevcut', () => {
    ['idle', 'walk', 'run', 'jump', 'fall', 'crouch', 'swim', 'mine', 'attack', 'bow-draw', 'fire', 'hurt', 'death', 'cheer', 'place', 'glide', 'grapple']
      .forEach((n) => expect(POSE_NAMES).toContain(n));
  });

  POSE_NAMES.forEach((name) => {
    it(name + ': farklı parametre ve zamanlarda sonlu, |dönüş| ≤ 3.3, kalça yüksekliği makul', () => {
      const rig = createPoseTarget(REST);
      for (let ti = 0; ti < 5; ti++) {
        const t = ti * 0.37;
        PARAMS.forEach((p) => {
          const base = createPoseTarget(REST);
          // bindirme pozları önce bir taban pozun üzerine yazılır
          if (POSES[name].overlay) applyNamedPose(base, 'idle', t, p);
          copyPose(rig, base);
          applyNamedPose(rig, name, t, p);
          allFinite(rig);
          POSE_BONES.forEach((b) => {
            ['x', 'y', 'z'].forEach((ax) => expect(Math.abs(rig[b].rotation[ax])).toBeLessThanOrEqual(3.3));
          });
          expect(rig.hips.position.y).toBeGreaterThan(0.05);
          expect(rig.hips.position.y).toBeLessThan(1.3);
        });
      }
    });
  });

  it('yürüme/koşu döngüsel: faz 2π sonra aynı poz', () => {
    const a = createPoseTarget(REST);
    const b = createPoseTarget(REST);
    ['walk', 'run'].forEach((n) => {
      applyNamedPose(a, n, 0, { phase: 1.3, speed01: 0.8 });
      applyNamedPose(b, n, 0, { phase: 1.3 + Math.PI * 2, speed01: 0.8 });
      POSE_BONES.forEach((bn) => ['x', 'y', 'z'].forEach((ax) => expect(a[bn].rotation[ax]).toBeCloseTo(b[bn].rotation[ax], 6)));
      expect(a.hips.position.y).toBeCloseTo(b.hips.position.y, 6);
    });
  });

  it('yürürken ayaklar yerde: en alçak ayak bileği yüksekliği ≈ ayak bileği kalınlığı (±2 cm)', () => {
    const rig = createPoseTarget(REST);
    for (let ph = 0; ph < Math.PI * 2; ph += 0.2) {
      applyNamedPose(rig, 'walk', 0, { phase: ph, speed01: 0.8 });
      const hL = REST.thigh * Math.cos(rig.legL.rotation.x) + REST.shin * Math.cos(rig.legL.rotation.x + rig.shinL.rotation.x);
      const hR = REST.thigh * Math.cos(rig.legR.rotation.x) + REST.shin * Math.cos(rig.legR.rotation.x + rig.shinR.rotation.x);
      const lowest = rig.hips.position.y - Math.max(hL, hR);
      expect(lowest).toBeGreaterThan(REST.ankle - 0.03);
      expect(lowest).toBeLessThan(REST.ankle + 0.03);
    }
  });

  it('groundHips: bacaklar düz ise kalça dinlenme yüksekliğinde', () => {
    const rig = createPoseTarget(REST);
    groundHips(rig, 0);
    expect(rig.hips.position.y).toBeCloseTo(REST.thigh + REST.shin + REST.ankle, 6);
  });

  it('bindirme pozları alt gövdeye dokunmaz', () => {
    ['mine', 'attack', 'bow-draw', 'fire', 'place', 'hurt'].forEach((name) => {
      const base = createPoseTarget(REST);
      applyNamedPose(base, 'walk', 0, { phase: 1, speed01: 0.7 });
      const over = createPoseTarget(REST);
      copyPose(over, base);
      applyNamedPose(over, name, 0.3, { progress: 0.4, charge: 0.8 });
      ['legL', 'legR', 'shinL', 'shinR', 'footL', 'footR'].forEach((b) => {
        expect(over[b].rotation.x).toBeCloseTo(base[b].rotation.x, 8);
      });
    });
  });

  it('kazma: vuruş anında kol yukarıdan aşağı iner (kol açısı zirve → düşük)', () => {
    const base = createPoseTarget(REST);
    const peak = createPoseTarget(REST);
    const low = createPoseTarget(REST);
    applyNamedPose(peak, 'idle', 0, {});
    applyNamedPose(low, 'idle', 0, {});
    applyNamedPose(peak, 'mine', 0, { progress: 0.36 });
    applyNamedPose(low, 'mine', 0, { progress: 0.58 });
    applyNamedPose(base, 'idle', 0, {});
    expect(peak.armR.rotation.x).toBeGreaterThan(2);
    expect(low.armR.rotation.x).toBeLessThan(peak.armR.rotation.x - 1);
  });

  it('ölüm ilerledikçe gövde yatar ve kalça alçalır', () => {
    const a = createPoseTarget(REST);
    const b = createPoseTarget(REST);
    applyNamedPose(a, 'death', 0, { progress: 0.1 });
    applyNamedPose(b, 'death', 0, { progress: 1 });
    expect(b.hips.rotation.x).toBeGreaterThan(a.hips.rotation.x);
    expect(b.hips.position.y).toBeLessThan(a.hips.position.y);
    expect(b.hips.position.y).toBeLessThan(0.3);
  });

  it('hurt toplamsal: ilerleme 1 iken değişim yok', () => {
    const a = createPoseTarget(REST);
    poseIdle(a, 0.5, {});
    const snap = a.spine.rotation.x;
    poseHurt(a, 0.5, { progress: 1 });
    expect(a.spine.rotation.x).toBeCloseTo(snap, 8);
    poseHurt(a, 0.5, { progress: 0 });
    expect(a.spine.rotation.x).toBeGreaterThan(snap + 0.2);
  });

  it('tutuş türleri: karakter kütüphanesi HOLD tablosu itemPalette tutuşlarını kapsar', async () => {
    const { itemSpec } = await import('./itemPalette.js');
    const { ITEM_LIST } = await import('../sim/items.js');
    const used = new Set(ITEM_LIST.map((it) => itemSpec(it).hold));
    used.forEach((h) => {
      // 'food' ve diğer varsayılan tutuşlar da tabloda olmalı
      expect(HOLD_KINDS).toContain(h);
    });
  });
});

describe('characterPoses: geçiş ve yardımcılar', () => {
  it('blendPose üstel sönümle hedefe yakınsar (60 Hz, 120 kare)', () => {
    const rig = createPoseTarget(REST);
    const tgt = createPoseTarget(REST);
    applyNamedPose(tgt, 'cheer', 0.4, {});
    const k = dampK(1 / 60, 13);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
    let prev = Infinity;
    for (let i = 0; i < 120; i++) {
      blendPose(rig, tgt, k);
      const err = Math.abs(rig.armL.rotation.z - tgt.armL.rotation.z);
      expect(err).toBeLessThanOrEqual(prev + 1e-12);
      prev = err;
    }
    POSE_BONES.forEach((b) => ['x', 'y', 'z'].forEach((ax) => expect(rig[b].rotation[ax]).toBeCloseTo(tgt[b].rotation[ax], 3)));
    expect(rig.hips.position.y).toBeCloseTo(tgt.hips.position.y, 3);
  });

  it('dampK kare hızından bağımsız (iki yarım adım = bir tam adım)', () => {
    const k1 = dampK(1 / 30, 10);
    const k2 = dampK(1 / 60, 10);
    expect(1 - (1 - k2) * (1 - k2)).toBeCloseTo(k1, 10);
    expect(dampK(0, 10)).toBe(0);
  });

  it('wrapAngle (-π, π] aralığına sarar', () => {
    [-10, -3.2, 0, 3.2, 10, 100].forEach((a) => {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-9);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 8);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 8);
    });
  });

  it('chooseLocomotion: durumlar doğru seçilir', () => {
    const o = {};
    expect(chooseLocomotion({ speed: 0 }, o).name).toBe('idle');
    expect(chooseLocomotion({ speed: 2 }, o).name).toBe('walk');
    expect(chooseLocomotion({ speed: 5.6 }, o).name).toBe('run');
    expect(chooseLocomotion({ speed: 5.6, crouch: true }, o).name).toBe('crouch');
    expect(chooseLocomotion({ speed: 1, onGround: false, vy: 4 }, o).name).toBe('jump');
    expect(chooseLocomotion({ speed: 1, onGround: false, vy: -12 }, o).name).toBe('fall');
    expect(chooseLocomotion({ swim: true, speed: 2 }, o).name).toBe('swim');
    expect(chooseLocomotion({ glide: true }, o).name).toBe('glide');
    expect(chooseLocomotion({ grapple: true }, o).name).toBe('grapple');
    expect(chooseLocomotion({ dead: true, swim: true }, o).name).toBe('death');
    const j = chooseLocomotion({ onGround: false, vy: 3.75 }, o);
    expect(j.vy01).toBeCloseTo(0.5, 6);
  });

  it('gaitRate hızla artar ve 0 hızda 0', () => {
    expect(gaitRate(0)).toBe(0);
    let prev = 0;
    for (let s = 0.5; s <= 6; s += 0.5) {
      const r = gaitRate(s);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
    // 4.3 m/s ≈ saniyede 3.3 adım (6.6 rad/sn tam döngü → ~1.65 döngü/sn)
    const cps = gaitRate(4.3) / (Math.PI * 2);
    expect(cps).toBeGreaterThan(1.2);
    expect(cps).toBeLessThan(2.2);
  });

  it('poseWalk: konuma bağlı faz verilmezse zamanla ilerler', () => {
    const a = createPoseTarget(REST);
    const b = createPoseTarget(REST);
    poseWalk(a, 0, {});
    poseWalk(b, 0.3, {});
    expect(a.legL.rotation.x).not.toBeCloseTo(b.legL.rotation.x, 3);
  });
});
