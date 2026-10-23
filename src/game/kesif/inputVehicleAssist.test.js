import { describe, expect, it } from 'vitest';
import { cityWorld } from './sim/city/vehicle/vehicleTestKit.js';
import { createVehicle, stepVehicle } from './sim/city/vehicle/vehiclePhysics.js';
import { roadSnapFor } from './sim/city/vehicle/vehicleRoad.js';
import { laneAssist, mixAssist } from './inputVehicleMath.js';
import { createVehicleInput } from './inputVehicle.js';

/*
 * Şerit yardımı kapalı çevrim testi: gerçek şehir yolu + gerçek araç fiziği. Araç şerit merkezinden yanal kaymış başlar; sürücü hiçbir şey yapmaz
 * (yalnız gaz); yardımın direksiyon payı (≤ 0.25) aracı şeride geri çekmeli ve asla aşırı salınmamalı.
 */
const SEED = 4242;
const DT = 1 / 60;

function lateral(snap, v) {
  const rx = Math.cos(snap.yaw);
  const rz = -Math.sin(snap.yaw);
  return (v.x - snap.x) * rx + (v.z - snap.z) * rz;
}

describe('şerit yardımı: gerçek yol + gerçek fizik', () => {
  const { world, seed } = cityWorld(SEED, [13, 17], [20, 30]);
  const snapFor = roadSnapFor(seed);

  function setup(cls, offset, yawErr) {
    // x=240 caddesi (kuzey-güney), güneye (+Z) doğru: şerit ucundan sağ şerit merkezi
    const base = snapFor(240, 338, 64, Math.PI);
    const rx = Math.cos(base.yaw);
    const rz = -Math.sin(base.yaw);
    const v = createVehicle(cls, {
      x: base.x + rx * offset, y: base.y, z: base.z + rz * offset, yaw: base.yaw + (yawErr || 0),
    });
    const f = 12;
    v.vx = -Math.sin(v.yaw) * f;
    v.vz = -Math.cos(v.yaw) * f;
    return { v, base };
  }

  function run(v, secs, ctl) {
    const tele = { speed: 0, x: 0, y: 0, z: 0, yaw: 0, snap: null };
    tele.snap = snapFor;
    let maxAbsSteer = 0;
    let worstLate = 0;
    const lateSamples = [];
    for (let i = 0; i < secs * 60; i++) {
      tele.speed = Math.hypot(v.vx, v.vz);
      tele.x = v.x; tele.y = v.y; tele.z = v.z; tele.yaw = v.yaw;
      const o = ctl.update(DT, { forward: false, back: false, left: false, right: false, jump: false, sprint: false }, null);
      const sp = tele.speed;
      const inp = {
        steer: o.steer, steerDirect: true, throttle: sp < 12 ? 0.6 : 0, brake: 0,
      };
      stepVehicle(v, inp, world, DT, {});
      if (Math.abs(o.steer) > maxAbsSteer) maxAbsSteer = Math.abs(o.steer);
      const lane = snapFor(v.x, v.z, v.y, v.yaw);
      const e = lateral(lane, v);
      lateSamples.push(e);
      if (Math.abs(e) > worstLate) worstLate = Math.abs(e);
    }
    return { maxAbsSteer, worstLate, lateSamples };
  }

  it('şeritten 1.3 m sağda başlayan araç yalnız yardımla şerit merkezine döner (sola çevirir)', () => {
    const { v, base } = setup('taksi', 1.3, 0);
    const ctl = createVehicleInput({ isTouch: () => true, getTelemetry: () => ({ speed: Math.hypot(v.vx, v.vz), x: v.x, y: v.y, z: v.z, yaw: v.yaw, snap: snapFor }) });
    ctl.setActive(true);
    const r = run(v, 4.4, ctl);
    expect(r.maxAbsSteer).toBeLessThanOrEqual(0.25 + 1e-9);
    const e0 = Math.abs(r.lateSamples[0]);
    const eEnd = Math.abs(r.lateSamples[r.lateSamples.length - 1]);
    expect(e0).toBeGreaterThan(1.0);
    expect(eEnd).toBeLessThan(0.45);
    expect(r.worstLate).toBeLessThan(1.6); // aşma/salınım yok
    expect(base.edge).toBeGreaterThanOrEqual(0);
  });

  it('şeritten 1.3 m solda başlayan araç da (sağa çevirerek) döner; spor ve kamyonet de', () => {
    ['taksi', 'spor', 'kamyonet'].forEach((cls) => {
      const { v } = setup(cls, -1.3, 0);
      const ctl = createVehicleInput({ isTouch: () => true, getTelemetry: () => ({ speed: Math.hypot(v.vx, v.vz), x: v.x, y: v.y, z: v.z, yaw: v.yaw, snap: snapFor }) });
      ctl.setActive(true);
      const r = run(v, 4.4, ctl);
      expect(Math.abs(r.lateSamples[r.lateSamples.length - 1]), cls).toBeLessThan(0.5);
      expect(r.worstLate, cls).toBeLessThan(1.6);
    });
  });

  it('yardım kapalıyken (klavye) araç kayık gider: iyileştirme yalnız yardımdan gelir', () => {
    const { v } = setup('taksi', 1.3, 0);
    const ctl = createVehicleInput({ isTouch: () => false, getTelemetry: () => ({ speed: Math.hypot(v.vx, v.vz), x: v.x, y: v.y, z: v.z, yaw: v.yaw, snap: snapFor }) });
    ctl.setActive(true);
    const r = run(v, 6, ctl);
    expect(Math.abs(r.lateSamples[r.lateSamples.length - 1])).toBeGreaterThan(1.0);
    expect(r.maxAbsSteer).toBe(0);
  });

  it('yön hatalı başlangıç (5° sola bakıyor) toparlanır', () => {
    const { v } = setup('taksi', 0, 0.09);
    const ctl = createVehicleInput({ isTouch: () => true, getTelemetry: () => ({ speed: Math.hypot(v.vx, v.vz), x: v.x, y: v.y, z: v.z, yaw: v.yaw, snap: snapFor }) });
    ctl.setActive(true);
    const r = run(v, 4.4, ctl);
    expect(Math.abs(r.lateSamples[r.lateSamples.length - 1])).toBeLessThan(0.5);
    expect(r.worstLate).toBeLessThan(2.4);
  });

  it('sürücü direksiyonu çevirirken (≥0.1) yardım karışmaz: mixAssist sürücüyü bozmaz', () => {
    expect(mixAssist(0.5, laneAssist({ speed: 18, x: 1.2, z: 0, yaw: 0 }, { x: 0, z: 0, yaw: 0 }))).toBe(0.5);
  });
});
