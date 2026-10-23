import { describe, expect, it } from 'vitest';
import {
  cityZoneAt, getCityPlan, isNaturalFill, isNoBuild, lotAt, planIsNoBuild, planZoneAt, safeAt, surface,
} from './cityPlan.js';
import { allLots, footprintOf } from './cityLots.js';
import { ARCHETYPES } from './archetypes.js';
import { SURF, surfaceAt } from './cityRoads.js';
import { citySeed } from './cityPlanTestKit.js';

describe('isNoBuild', () => {
  it('yol koridoru y64..68 yasak, 69+ serbest; Kapı Meydanı her yükseklikte (y56..90) yasak', () => {
    const seed = citySeed(0);
    const plan = getCityPlan(seed);
    // V_3 (x=240) orta blok asfaltı ve kaldırımı
    for (const x of [233, 240, 247]) {
      for (let y = 64; y <= 68; y++) expect(isNoBuild(seed, x, y, 100)).toBe(true);
      expect(isNoBuild(seed, x, 69, 100)).toBe(false);
      expect(isNoBuild(seed, x, 63, 100)).toBe(false);
    }
    for (const y of [56, 64, 80, 90]) {
      expect(isNoBuild(seed, 0, y, 0)).toBe(true);
      expect(isNoBuild(seed, 16, y, -17)).toBe(true);
    }
    expect(isNoBuild(seed, 0, 91, 0)).toBe(false);
    expect(planIsNoBuild(plan, 17, 64, 17) || surfaceAt(plan.roads, 17, 17) === SURF.PLAZA).toBe(true);
    // köprü tabliyesi ve rıhtım
    expect(isNoBuild(seed, 0, 64, 560)).toBe(true);
    expect(isNoBuild(seed, 50, 64, Math.floor(560 + 30 * Math.sin(50.5 / 130) - 23))).toBe(true); // rıhtım
  });

  it('bina iç hacmi yasak (zemin→çatı+1), dışı (avlu/arka bahçe) serbest; kapı önü 3×2 yasak', () => {
    let tested = 0;
    for (let i = 0; i < 6; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      allLots(plan).forEach((l) => {
        const A0 = ARCHETYPES[l.archetype];
        if (!A0.building || A0.special || l.hill || tested > 600) return;
        tested++;
        const fp = footprintOf(l);
        const cx = Math.floor((fp.x0 + fp.x1) / 2);
        const cz = Math.floor((fp.z0 + fp.z1) / 2);
        const top = 64 + 4 * l.floors + (l.roof ? l.roof.lift : 0);
        expect(isNoBuild(seed, cx, 64, cz)).toBe(true);
        expect(isNoBuild(seed, cx, top, cz)).toBe(true);
        // çatının üstü (top+3) serbest, bina altı (y<64) iç mekân değil
        expect(isNoBuild(seed, cx, top + 3, cz)).toBe(false);
        expect(isNoBuild(seed, cx, 60, cz)).toBe(false);
        // kapı önü
        const d = l.door;
        const vx = d.face === 'e' ? 1 : d.face === 'w' ? -1 : 0;
        const vz = d.face === 's' ? 1 : d.face === 'n' ? -1 : 0;
        for (let dep = 0; dep < 2; dep++) {
          for (let w = -1; w <= 1; w++) {
            const x = d.front.x + vx * dep + (d.axis === 'x' ? w : 0);
            const z = d.front.z + vz * dep + (d.axis === 'z' ? w : 0);
            expect(isNoBuild(seed, x, 65, z)).toBe(true);
          }
        }
      });
    }
    expect(tested).toBeGreaterThan(400);
  });

  it('park/avlu hücreleri (bina dışı zemin) serbest; tepe terası gövdesi yasak', () => {
    const seed = citySeed(2);
    const plan = getCityPlan(seed);
    let free = 0;
    allLots(plan).forEach((l) => {
      if (l.archetype !== 'park' || free > 30) return;
      free++;
      expect(isNoBuild(seed, Math.floor((l.x0 + l.x1) / 2), 64, Math.floor((l.z0 + l.z1) / 2))).toBe(false);
    });
    expect(free).toBeGreaterThan(10);
    const h = plan.hill;
    expect(isNoBuild(seed, h.rect.x0 + 30, 70, h.rect.z0 + 30)).toBe(true);
    expect(isNoBuild(seed, h.top.x, 112, h.top.z)).toBe(true);
    expect(isNoBuild(seed, h.top.x, 130, h.top.z)).toBe(false);
  });
});

describe('cityZoneAt / lotAt / surface', () => {
  it('bina içinde {building,room:null}, dışında null; building = parsel kimliği', () => {
    for (let i = 0; i < 6; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      let n = 0;
      allLots(plan).forEach((l) => {
        const A0 = ARCHETYPES[l.archetype];
        if (!A0.building || l.hill || n > 300) return;
        n++;
        const fp = footprintOf(l);
        const cx = Math.floor((fp.x0 + fp.x1) / 2);
        const cz = Math.floor((fp.z0 + fp.z1) / 2);
        const z = cityZoneAt(seed, cx + 0.5, 70, cz + 0.5);
        expect(z).toEqual({ building: l.id, room: null });
        expect(planZoneAt(plan, cx, 70, cz)).toEqual(z);
        expect(cityZoneAt(seed, cx, 400, cz)).toBeNull();
        expect(cityZoneAt(seed, l.door.front.x, 70, l.door.front.z)).toBeNull(); // kapı önü (apron/kaldırım) iç hacim değil
        expect(lotAt(seed, cx, cz).id).toBe(l.id);
      });
    }
    expect(cityZoneAt(citySeed(0), 0, 64, 0)).toBeNull();
    expect(surface(citySeed(0), 240.5, 100.5)).toBe(SURF.LANE_Z);
  });
});

describe('isNaturalFill', () => {
  it('yalnız y≤60 ve mühendislik dışı; belirlenimci; yüzey/bina/sokak altı beton katmanı (61+) doğal değil', () => {
    const seed = citySeed(3);
    for (let y = 61; y <= 70; y++) expect(isNaturalFill(seed, 100, y, 100)).toBe(false);
    expect(isNaturalFill(seed, 100, 60, 100)).toBe(true);
    expect(isNaturalFill(seed, 100, 0, 100)).toBe(true);
    expect(isNaturalFill(seed, -700, -300, 700)).toBe(true);
    expect(isNaturalFill(seed, 100, 60, 100)).toBe(isNaturalFill(seed, 100.9, 60.5, 100.2));
  });
});

describe('safeAt (tohum sarmalayıcısı)', () => {
  it('seed düzeyi safeAt plan düzeyiyle aynı', () => {
    const seed = citySeed(4);
    expect(safeAt(seed, 0, 0)).toBe(true);
    expect(safeAt(seed, 0, 0, 20)).toBe(false);
  });
});
