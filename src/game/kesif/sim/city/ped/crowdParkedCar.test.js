import { describe, expect, it, vi } from 'vitest';
import { citySeed } from '../cityPlanTestKit.js';
import { makeCrowd } from './crowdTestKit.js';
import { EK } from './pedNav.js';
import { ST } from './pedData.js';

vi.setConfig({ testTimeout: 600000 });

/*
 * QA4-005: kaldırım/meydan yolunun ÜSTÜNE park etmiş araç (park yeri/sergi aracı, kind 2) yayanın önünü kesince `vT = 0` oluyor ama `blockedT` hiç artmıyordu:
 * yaya aracın önünde SONSUZA DEK "yürüyor" (hız 0/1,2 ama ilerlemiyor) → Gece Pazarı çevresinde yayalar takılı kalıyordu. Düzeltme: araç yüzünden 2,5 sn bekleyen yaya geri döner
 * (tıkalı kenar 40 sn yaya rotalarından çıkar).
 */
describe('crowd: park etmiş araç yayayı sonsuza dek bekletmez (QA4-005)', () => {
  it('kaldırım kenarının ortasına konan duran araç: önüne gelen yayalar 8 sn içinde dönüp başka yöne gider (hiçbiri 8 sn\'den uzun kıpırdamadan beklemez)', () => {
    const seed = citySeed(75);
    const { crowd, nav } = makeCrowd(seed, { px: 240, pz: 80, phase: 0.45, quality: 'high' });
    crowd.populate();
    // oyuncuya en yakın, uzun bir yan kaldırım kenarının ortası
    let best = -1;
    let bd = 1e9;
    for (let e = 0; e < nav.ne; e++) {
      if (!nav.eok[e] || nav.ekind[e] === EK.CROSS || nav.elen[e] < 30) continue;
      const mx = (nav.nx[nav.ea[e]] + nav.nx[nav.eb[e]]) / 2;
      const mz = (nav.nz[nav.ea[e]] + nav.nz[nav.eb[e]]) / 2;
      const d = Math.hypot(mx - 240, mz - 80);
      if (d < bd) { bd = d; best = e; }
    }
    const mx = (nav.nx[nav.ea[best]] + nav.nx[nav.eb[best]]) / 2;
    const mz = (nav.nz[nav.ea[best]] + nav.nz[nav.eb[best]]) / 2;
    // aracı kenarın TÜM genişliğini kapatacak kadar geniş (2 yaya şeridi + kaldırım payı) ve uzunluğu yola dik: yürüyen yol kapanır
    const wide = nav.ehw[best] + 1.2;
    const car = [{
      x: mx, z: mz, yaw: Math.atan2(-nav.eux[best], -nav.euz[best]), hl: 1.0, hw: wide, vx: 0, vz: 0, kind: 2,
    }];
    const run = new Map();
    let stuckLong = 0;
    for (let t = 0; t < 20 * 60; t++) {
      crowd.setVehicles(car, 1);
      crowd.step(0.05);
      if (t % 20 !== 0) continue;
      crowd.peds.forEach((p) => {
        if (!p.alive) return;
        const near = Math.hypot(p.x - mx, p.z - mz) < 6;
        if (near && p.state === ST.WALK) {
          // hareket ediyor görünüp ilerlemeyen: s sabit
          const key = p.id;
          const prev = run.get(key);
          if (prev && Math.abs(prev.s - p.s) < 0.05 && prev.e === p.e) {
            prev.n++;
            if (prev.n === 9) stuckLong++;
          } else run.set(key, { s: p.s, e: p.e, n: 0 });
        }
      });
    }
    expect(stuckLong).toBe(0);
  });
});
