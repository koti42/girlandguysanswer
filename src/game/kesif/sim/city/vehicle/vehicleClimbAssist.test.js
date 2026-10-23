/*
 * QA3-004 (qa_p3 G5): 1 blokluk basamaklı rampa (tünel/yarma) dibinde duran araç gazla kıpırdamıyor, 6 sn sonra otomatik kurtarmayı bekliyordu.
 * Basamak yardımı: gaz/fren basılı ama araç ≥ 0,3 sn kıpırdamıyorsa ve gövde gömülü değilse hızlı basamak payı (1,05) uygulanır → araç duruştan rampayı çıkar.
 * 2 blokluk duvar yine engeldir; gömülü araç yine kurtarılır; basamak yardımı yokken eski davranış (yavaşken 0,6).
 */
import { describe, expect, it } from 'vitest';
import { B } from '../../blocks.js';
import { VEHICLE_CLASSES } from './vehicleData.js';
import { createVehicle, stepVehicle } from './vehiclePhysics.js';
import { climbAssist, stepOf } from './vehicleVertical.js';
import { fillBox, flatWorld } from './vehicleTestKit.js';

const DT = 1 / 60;
const mk = (cls, o) => createVehicle(cls, Object.assign({ x: 0.5, y: 64, z: 0.5, yaw: 0 }, o || null));

/** −Z yönünde yükselen rampa: her 6 blokta 1 blok yüksek basamak (z = −8 .. −56), geniş (x −6..6). */
function stairRamp() {
  const w = flatWorld();
  for (let k = 0; k < 8; k++) {
    const z1 = -8 - k * 6;
    fillBox(w, -6, 64, z1 - 5, 6, 64 + k, z1, B.STONE); // üst yüzey y = 64 + k + 1 → basamak k+1
  }
  return w;
}

describe('basamak yardımı (stepOf / climbAssist)', () => {
  it('stepOf: yardım yokken yavaş 0,6; |u| ≥ 4 ya da yardım varken 1,05; hover her zaman hızlı', () => {
    const d = mk('taksi').def;
    expect(stepOf(d, 0)).toBe(d.step[0]);
    expect(stepOf(d, 3.9)).toBe(d.step[0]);
    expect(stepOf(d, 4)).toBe(d.step[1]);
    expect(stepOf(d, -4)).toBe(d.step[1]);
    expect(stepOf(d, 0, true)).toBe(d.step[1]);
    const h = mk('hoverbike').def;
    expect(stepOf(h, 0)).toBe(h.step[1]);
  });
  it('climbAssist: yalnız gaz/fren basılı + ≥ 0,3 sn kıpırdamıyor + gömülü değil', () => {
    const v = mk('taksi');
    expect(climbAssist(v, { throttle: 1 })).toBe(false); // henüz takılmadı
    v.stuckT = 0.2;
    expect(climbAssist(v, { throttle: 1 })).toBe(false);
    v.stuckT = 0.5;
    expect(climbAssist(v, { throttle: 1 })).toBe(true);
    expect(climbAssist(v, { brake: 1 })).toBe(true);
    expect(climbAssist(v, { throttle: 0.1, brake: 0 })).toBe(false);
    expect(climbAssist(v, null)).toBe(false);
    v.wedgeT = 0.1;
    expect(climbAssist(v, { throttle: 1 })).toBe(false); // gömülü: kurtarma yolu
  });
});

describe('basamaklı rampa (1 blok / 6 blok): duruştan çıkış', () => {
  VEHICLE_CLASSES.forEach((cls) => {
    it(cls + ': basamağın hemen dibinde dururken gaz → 4 sn içinde en az iki basamak çıkar, kurtarma olayı yok, gövde katıda değil', () => {
      const w = stairRamp();
      // ilk basamağın ön yüzü z = −7 (hücreler −13..−8 dolu): araç burnu ≈ 0,3 m önünde dursun
      const v = mk(cls, { x: 0.5, z: -7 + 0.3 + v0(cls) });
      let rescue = 0;
      let maxY = v.y;
      for (let i = 0; i < 240; i++) {
        const ev = stepVehicle(v, { throttle: 1 }, w, DT, {});
        rescue += ev.filter((e) => e.type === 'unstick' || e.type === 'resetRoad').length;
        if (v.y > maxY) maxY = v.y;
        expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
      }
      expect(rescue).toBe(0);
      expect(maxY).toBeGreaterThan(64 + 1.5); // en az iki basamak
      expect(v.z).toBeLessThan(-8 - 6); // ilk basamağı aştı
    });
  });

  it('2 blokluk duvar yardımla da aşılamaz (araç durur / çarpar)', () => {
    const w = flatWorld();
    fillBox(w, -8, 64, -30, 8, 65, -29, B.STONE); // 2 blok
    const v = mk('taksi', { z: -22 });
    for (let i = 0; i < 360; i++) stepVehicle(v, { throttle: 1 }, w, DT, {});
    expect(v.z).toBeGreaterThan(-29 + 0.5); // duvarın öbür yüzüne geçmez (merkez duvarın önünde)
    expect(v.y).toBeLessThan(64.6);
  });

  it('belirlenimci: aynı girdi → aynı yörünge (basamak yardımı dahil)', () => {
    const run = () => {
      const w = stairRamp();
      const v = mk('spor', { x: 0.5, z: -7 + 0.3 + v0('spor') });
      for (let i = 0; i < 240; i++) stepVehicle(v, { throttle: 1, steer: Math.sin(i / 30) * 0.2 }, w, DT, {});
      return [v.x, v.y, v.z, v.vx, v.vz, v.yaw];
    };
    expect(run()).toEqual(run());
  });
});

/** aracın merkezinden burnuna uzaklık (ileri −Z: burun z − length/2). */
function v0(cls) {
  return mk(cls).def.length * 0.5;
}
