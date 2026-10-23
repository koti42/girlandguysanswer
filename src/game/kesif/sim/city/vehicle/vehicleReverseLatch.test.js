/*
 * QA5-A-001 (Faz 5 kapanis, gozlem A): "fren basili tutulunca geri vitese gecmiyor" (u ~ 1e-10..1e-26, gear 1, stuckT 1,2-1,9 sn).
 * Kok neden: sifiri gecme kilidi `u > 0 && un < 0 && fren → un = 0`. Arac durduktan sonra kalan yanal hiz w, govdenin (olu) yaw hizi ile dondugunde
 * ileri eksene `w·sin(dyaw)` kadar (± 1e-10) kalinti u olarak yansir; kalinti POZITIFSE kilit her alt adimda u'yu yeniden 0'a ceker ve u asla negatif olmaz
 * (kalinti NEGATIFSE geri vitese gecer): ayni durus, isaretin yazi-turasina bagli, fren sonsuza dek basili kalsa da geri gitmeyen arac.
 * Duzeltme: kilit yalniz gercek hareketten (u > 0,05) durdururken tutar; ≤ 0,05 m/sn'de fren-geri ivmesi serbest.
 */
import { describe, expect, it } from 'vitest';
import { createVehicle, stepVehicle } from './vehiclePhysics.js';
import { flatWorld } from './vehicleTestKit.js';

const DT = 1 / 60;
const mk = (cls, o) => createVehicle(cls, Object.assign({ x: 0.5, y: 64, z: 0.5, yaw: 0 }, o || null));

function lcg(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fren basili N sn; geri vitese (u < −0,8, gear −1) gecti mi? */
function reverses(v, w, secs, brake) {
  for (let i = 0; i < Math.round(secs * 60); i++) stepVehicle(v, { brake, steerDirect: true }, w, DT);
  return v.u < -0.8 && v.gear === -1;
}

describe('fren basili: sifiri gecince geri vites (kalinti yanal hiz/yaw isaretinden bagimsiz)', () => {
  it('yavas ileri hiz + kalinti yanal hiz w ve yaw hizi (4 isaret birlesimi x 3 sinif): fren tutulunca 1,5 sn icinde geri gider', () => {
    const w = flatWorld();
    const bad = [];
    ['taksi', 'spor', 'kamyonet'].forEach((cls) => {
      [-1, 1].forEach((sw) => {
        [-1, 1].forEach((sy) => {
          const v = mk(cls, { yaw: 0.7 });
          const fx = -Math.sin(v.yaw);
          const fz = -Math.cos(v.yaw);
          const rx = Math.cos(v.yaw);
          const rz = -Math.sin(v.yaw);
          v.vx = fx * 0.3 + rx * 0.3 * sw;
          v.vz = fz * 0.3 + rz * 0.3 * sw;
          v.u = 0.3;
          v.w = 0.3 * sw;
          v.yawRate = 0.4 * sy;
          if (!reverses(v, w, 1.5, 0.975)) bad.push({ cls, sw, sy, u: v.u, gear: v.gear, stuckT: v.stuckT });
        });
      });
    });
    expect(bad).toEqual([]);
  });

  it('gaz-direksiyon-fren zamanlama taramasi (taksi 1..200 + spor ozel tohumlar): fren basiliyken hic arac sifirda takili kalmaz', () => {
    const bad = [];
    const seeds = (cls) => (cls === 'taksi' ? Array.from({ length: 200 }, (_, i) => i + 1) : [343, 747, 793, 819]); // spor: onceden kilitlenen tohumlar
    ['taksi', 'spor'].forEach((cls) => {
      for (const seed of seeds(cls)) {
        const r = lcg(seed);
        const w = flatWorld();
        const v = createVehicle(cls, { x: 0, y: 64, z: 0, yaw: r() * 6.28 });
        const step = (inp, secs) => {
          for (let i = 0, n = Math.round(secs * 60); i < n; i++) stepVehicle(v, inp, w, DT);
        };
        step({ throttle: 1 }, 1 + r() * 2);
        const segs = 1 + Math.floor(r() * 5);
        for (let i = 0; i < segs; i++) step({ throttle: r() < 0.5 ? 1 : 0, steer: r() * 2 - 1, steerDirect: r() < 0.7 }, r() * 0.8);
        step({ throttle: 0, steer: r() < 0.5 ? 0 : r() * 2 - 1, steerDirect: true }, r() * 0.4);
        const bv = 0.9 + r() * 0.1;
        const hold = r() < 0.5 ? 0 : (r() * 2 - 1) * 0.3;
        let n = 0;
        while (v.u >= 0.6 && n < 1200) {
          stepVehicle(v, { brake: bv, steerDirect: true, steer: hold }, w, DT);
          n++;
        }
        step({ brake: bv, steerDirect: true, steer: hold }, 1.8);
        if (!(v.u < -0.8 && v.gear === -1)) bad.push({ cls, seed, u: v.u, gear: v.gear, stuckT: v.stuckT });
      }
    });
    expect(bad).toEqual([]);
  });

  it('korunan davranis: fren sifirda durdurur, tutulursa sonra geri gider; sifirda birakilirsa arac geri kaymaz', () => {
    const w = flatWorld();
    const v = mk('taksi');
    for (let i = 0; i < 60 * 3; i++) stepVehicle(v, { throttle: 1 }, w, DT);
    expect(v.u).toBeGreaterThan(10);
    let n = 0;
    while (v.u > 0.05 && n < 60 * 20) {
      stepVehicle(v, { brake: 1 }, w, DT);
      n++;
    }
    expect(v.u).toBeLessThanOrEqual(0.05); // fren hizi sifira indirdi
    expect(v.u).toBeGreaterThan(-0.5); // sifir cizgisinde ani geri firlama yok
    // fren birakilir: arac geri gitmez
    const rel = JSON.parse(JSON.stringify({ u: v.u }));
    for (let i = 0; i < 60 * 2; i++) stepVehicle(v, {}, w, DT);
    expect(rel.u).toBeLessThanOrEqual(0.05);
    expect(Math.abs(v.u)).toBeLessThan(0.2);
    // tutulan fren: geri vites
    const v2 = mk('taksi');
    for (let i = 0; i < 60 * 3; i++) stepVehicle(v2, { throttle: 1 }, w, DT);
    expect(reverses(v2, w, 8, 1)).toBe(true);
    expect(-v2.u).toBeLessThanOrEqual(0.3 * v2.def.max * 1.001);
  });
});
