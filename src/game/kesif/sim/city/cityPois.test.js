import { describe, expect, it } from 'vitest';
import { getCityPlan, pois } from './cityPlan.js';
import { POI_COUNTS, POI_TYPES } from './cityPois.js';
import { allLots, footprintOf, lotById } from './cityLots.js';
import { ARCHETYPES } from './archetypes.js';
import { SURF, surfaceAt } from './cityRoads.js';
import { OWNERS } from './ownerData.js';
import { citySeed } from './cityPlanTestKit.js';

const WALKABLE = [SURF.SIDEWALK, SURF.PLAZA, SURF.QUAY, SURF.PARK, SURF.GROUND];

describe('POI', () => {
  it('tüm türler üretilir; sözleşme sayıları: terminal 16, yarış 8, çatı 8, grafiti 90, çip 240, gizli oda 30', () => {
    for (let i = 0; i < 25; i++) {
      const list = pois(citySeed(i));
      const cnt = {};
      list.forEach((p) => {
        expect(POI_TYPES).toContain(p.type);
        cnt[p.type] = (cnt[p.type] || 0) + 1;
        expect(Number.isFinite(p.x + p.y + p.z + p.yaw)).toBe(true);
        expect(p.districtId).toBeGreaterThanOrEqual(0);
        expect(p.districtId).toBeLessThan(6);
      });
      expect(list.map((p) => p.id)).toEqual(list.map((_, k) => k));
      Object.keys(POI_COUNTS).forEach((k) => expect(cnt[k]).toBe(POI_COUNTS[k]));
      POI_TYPES.forEach((t) => expect(cnt[t]).toBeGreaterThan(0));
      expect(cnt.photo_spot).toBe(24);
      expect(cnt.rental).toBe(7);
      expect(cnt.courier_desk).toBe(7);
      expect(cnt.vendor).toBeGreaterThanOrEqual(16);
      expect(cnt.door).toBeGreaterThan(700);
    }
  });

  it('önbellekli ve belirlenimci; terminal/yarış/çatı POI’leri planla birebir uyumlu', () => {
    const seed = citySeed(3);
    const a = pois(seed);
    expect(pois(seed)).toBe(a);
    const plan = getCityPlan(seed);
    a.filter((p) => p.type === 'portal_terminal').forEach((p) => {
      const t = plan.terminals[p.terminal];
      expect([p.x, p.y, p.z]).toEqual([t.x, t.y, t.z]);
    });
    a.filter((p) => p.type === 'race_gate').forEach((p) => expect(p.x).toBe(plan.races[p.raceId].start.x));
    a.filter((p) => p.type === 'roof_start').forEach((p) => expect(p.lot).toBe(plan.roofRoutes[p.route].start.lot));
  });

  it('kapı POI’leri kapı önü hücresinde; yürünebilir (kaldırım/meydan/parsel apron)', () => {
    for (let i = 0; i < 10; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      pois(seed).filter((p) => p.type === 'door').forEach((p) => {
        const lot = lotById(plan, p.lot);
        expect(lot.door.front.x + 0.5).toBe(p.x);
        expect(lot.door.front.z + 0.5).toBe(p.z);
        expect(p.y).toBe(64);
        const s = surfaceAt(plan.roads, lot.door.front.x, lot.door.front.z);
        expect(WALKABLE).toContain(s);
      });
    }
  });

  it('grafiti: 90 benzersiz boş duvar, ön yüzde, kapıyı kapsamaz; Pazar/Konteyner/Tepe', () => {
    for (let i = 0; i < 20; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      const g = pois(seed).filter((p) => p.type === 'graffiti');
      expect(g.length).toBe(90);
      expect(new Set(g.map((p) => p.lot)).size).toBe(90);
      g.forEach((p) => {
        const lot = lotById(plan, p.lot);
        expect(['gece_pazari', 'konteyner', 'tepe']).toContain(lot.district);
        expect(p.w).toBe(6);
        expect(p.h).toBe(4);
        expect(p.face).toBe(lot.front);
        expect(p.u1 <= lot.door.u - 1 || p.u0 >= lot.door.u + 2).toBe(true);
        // grafiti noktası duvarın hemen önünde: apron/kaldırım hücresi
        const cx = Math.floor(p.x);
        const cz = Math.floor(p.z);
        const inLot = cx >= lot.x0 && cx < lot.x1 && cz >= lot.z0 && cz < lot.z1;
        expect(inLot || WALKABLE.indexOf(surfaceAt(plan.roads, cx, cz)) >= 0).toBe(true);
      });
    }
  });

  it('çipler: 240 benzersiz konum; çatı 60 (yalnız parkur çatılarında → yürünerek ulaşılır), kanalizasyon 40, kalan zemin; hepsi ulaşılabilir türden', () => {
    for (let i = 0; i < 20; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      const chips = pois(seed).filter((p) => p.type === 'chip');
      expect(chips.length).toBe(240);
      const by = {};
      chips.forEach((c) => { by[c.kind] = (by[c.kind] || 0) + 1; });
      expect(by.cati).toBe(60);
      expect(by.kanal).toBe(40);
      expect((by.kapi || 0) + (by.park || 0)).toBe(140);
      expect(new Set(chips.map((c) => c.x + ',' + c.y + ',' + c.z)).size).toBe(240);
      const routeLots = new Set();
      plan.roofRoutes.forEach((r) => r.pads.forEach((p) => routeLots.add(p.lot)));
      chips.forEach((c) => {
        if (c.kind === 'cati') {
          expect(routeLots.has(c.lot)).toBe(true);
          expect(c.y).toBeGreaterThanOrEqual(64 + 8);
        } else if (c.kind === 'kanal') {
          expect(c.y).toBe(31);
        } else {
          expect(c.y).toBe(64);
          const cx = Math.floor(c.x);
          const cz = Math.floor(c.z);
          const lot = lotById(plan, c.lot);
          const inLot = cx >= lot.x0 && cx < lot.x1 && cz >= lot.z0 && cz < lot.z1;
          if (inLot) {
            // kapı yanı: ayak izi dışında (apron) ya da park parselinde
            const fp = footprintOf(lot);
            const insideBuilding = !!(fp && cx >= fp.x0 && cx < fp.x1 && cz >= fp.z0 && cz < fp.z1);
            expect(insideBuilding && ARCHETYPES[lot.archetype].building).toBe(false);
          } else expect(WALKABLE).toContain(surfaceAt(plan.roads, cx, cz));
        }
      });
    }
  });

  it('gizli oda 30: iç mekân rezervi olan binalar, çatı parkuru dışı; vendor: her sahip için bir tane; garaj/kurye sahipleri', () => {
    const seed = citySeed(5);
    const plan = getCityPlan(seed);
    const list = pois(seed);
    const rooms = list.filter((p) => p.type === 'hidden_room');
    expect(rooms.length).toBe(30);
    expect(new Set(rooms.map((p) => p.lot)).size).toBe(30);
    rooms.forEach((p) => {
      const lot = lotById(plan, p.lot);
      expect(ARCHETYPES[lot.archetype].interiors.length).toBeGreaterThan(0);
      expect(lot.roof).toBeNull();
    });
    OWNERS.forEach((o) => {
      const v = plan.owners.get(o.id);
      expect(list.filter((p) => p.type === 'vendor' && p.owner === o.id).length).toBe(1);
      if (o.interior === 'garaj_atolyesi') expect(list.some((p) => p.type === 'garage' && p.owner === o.id)).toBe(true);
      if (o.interior === 'dron_kurye') expect(list.some((p) => p.type === 'courier_desk' && p.owner === o.id)).toBe(true);
      expect(v.lotId).toBeGreaterThan(0);
    });
    // her garaj/park yeri asfalt kenarında
    list.filter((p) => p.type === 'park_slot').forEach((p) => {
      const s = surfaceAt(plan.roads, Math.floor(p.x), Math.floor(p.z));
      expect([SURF.ASPHALT, SURF.LANE_X, SURF.LANE_Z]).toContain(s);
    });
    expect(allLots(plan).length).toBeGreaterThan(1000);
  });
});
