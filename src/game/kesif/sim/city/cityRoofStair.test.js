import { describe, expect, it } from 'vitest';
import { allLots, floorsFitStair } from './cityLots.js';
import { getCityPlan, planBuilding } from './cityPlan.js';
import { citySeed } from './cityPlanTestKit.js';
import { DISTRICTS } from './archetypes.js';

/*
 * qa_p2 — çatı parkuru başlangıç binasının dış merdiveni sokak kapısının önünü KAPATMAZ (eskiden 12–16 geniş parsellerde iki kollu merdiven kapı hücrelerini
 * dolduruyordu: sokaktan girilemeyen ramen barı/arcade…). Düzeltme: kapı merdivenin karşı ucunda; sığmıyorsa üç kollu merdiven; kat sayısı genişliğe göre sınırlı.
 */
const FV = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

describe('floorsFitStair', () => {
  it('geniş parselde en çok 4 kat, 12 geniş parselde 3 kat; bölge alt sınırının altına inmez', () => {
    expect(floorsFitStair(20, 2)).toBe(4);
    expect(floorsFitStair(13, 2)).toBe(4);
    expect(floorsFitStair(12, 2)).toBe(3);
    expect(floorsFitStair(12, 3)).toBe(3);
    expect(floorsFitStair(9, 3)).toBe(3);
    expect(floorsFitStair(9, 2)).toBe(2);
  });
});

describe('çatı parkuru başlangıcı dış merdiveni', () => {
  const seen = { two: 0, three: 0 };

  it('60 tohum × 8 rota: merdiven hücreleri kapı + önündeki 2 hücreyi kapatmaz; hücreler parsel içinde; yükseklik adımları +1; tepe = çatı', () => {
    for (let s = 0; s < 60; s++) {
      const seed = citySeed(s);
      const plan = getCityPlan(seed);
      const lots = allLots(plan);
      plan.roofRoutes.forEach((rr) => {
        const lot = lots.find((l) => l.id === rr.start.lot);
        const bp = planBuilding(seed, lot);
        const e = bp.extStair;
        const d = bp.doors[0];
        expect(d, 'kapı lot ' + lot.id).toBeTruthy();
        if (e.landing2) seen.three++; else seen.two++;
        const cells = e.flights.concat(e.landing.cells, e.landing2 ? e.landing2.cells : []);
        cells.forEach((c) => {
          if (c.x < lot.x0 || c.x >= lot.x1 || c.z < lot.z0 || c.z >= lot.z1) throw new Error('merdiven parsel dışı lot ' + lot.id);
        });
        for (let o = -1; o <= 1; o++) {
          for (let k = 1; k <= 2; k++) {
            const x = d.x + (d.axis === 'x' ? o : 0) + FV[d.face][0] * k;
            const z = d.z + (d.axis === 'z' ? o : 0) + FV[d.face][1] * k;
            if (cells.some((c) => c.x === x && c.z === z)) throw new Error('merdiven kapı önünde lot ' + lot.id + ' ' + lot.archetype + ' w' + lot.w + ' d' + lot.d);
          }
        }
        const ys = e.flights.map((c) => c.y);
        for (let q = 1; q < ys.length; q++) expect(ys[q] - ys[q - 1]).toBe(1);
        expect(ys[0]).toBe(65);
        expect(ys[ys.length - 1]).toBe(bp.roof.y);
        expect(e.top.y).toBe(bp.roof.y);
        // aynı (x,z) iki farklı yükseklikte kullanılmaz
        const seenXZ = new Set();
        e.flights.forEach((c) => {
          const k = c.x + ',' + c.z;
          expect(seenXZ.has(k), 'çift hücre ' + k + ' lot ' + lot.id).toBe(false);
          seenXZ.add(k);
        });
        // kat sayısı bölge alt sınırının altında değil
        expect(lot.floors * 4).toBeGreaterThanOrEqual(DISTRICTS[lot.district].hMin);
      });
    }
    expect(seen.three).toBeGreaterThan(0); // üç kollu sürüm gerçekten kullanılıyor
    expect(seen.two).toBeGreaterThan(0);
  });
});
