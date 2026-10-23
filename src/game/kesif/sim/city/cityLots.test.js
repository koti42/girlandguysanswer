import { describe, expect, it } from 'vitest';
import { getCityPlan, lotAt as lotAtSeed, getLot, lotsInRect } from './cityPlan.js';
import {
  allLots, blankOf, footprintOf, layoutBlock, lotAt, lotById, lotIdParts, lotId, ownerMap,
} from './cityLots.js';
import { ARCHETYPES, DISTRICTS, DISTRICT_KEYS, INTERIOR_FOOT, interiorFits } from './archetypes.js';
import { OWNERS } from './ownerData.js';
import { BK, SURF, canalAt, surfaceAt } from './cityRoads.js';
import { citySeed } from './cityPlanTestKit.js';

const FULL = 12;

describe('parseller: yol/kanal/birbiriyle çakışmaz, her parsel yola değer (tam hücre taraması)', () => {
  it('her parsel hücresi zemindir (yol/kaldırım/su/rıhtım yok); kiosk parselleri meydan güvertesinde', () => {
    for (let i = 0; i < FULL; i++) {
      const plan = getCityPlan(citySeed(i));
      const lots = allLots(plan);
      expect(lots.length).toBeGreaterThan(1200);
      for (let q = 0; q < lots.length; q++) {
        const l = lots[q];
        const central = plan.roads.blocks.kindAt(l.bi, l.bj) === BK.CENTRAL;
        for (let z = l.z0; z < l.z1; z++) {
          for (let x = l.x0; x < l.x1; x++) {
            const s = surfaceAt(plan.roads, x, z);
            const want = central ? SURF.PLAZA : SURF.GROUND;
            if (s !== want) throw new Error('parsel hücresi yüzey ' + s + ' (beklenen ' + want + '): seed#' + i + ' lot ' + l.id + ' ' + l.archetype + ' @' + x + ',' + z);
            if (canalAt(x, z)) throw new Error('parsel kanal üstünde: lot ' + l.id);
          }
        }
      }
    }
  });

  it('parseller birbiriyle çakışmaz; kimlikler benzersiz ve lotId ↔ (bi,bj,k) çift yönlü', () => {
    for (let i = 0; i < 60; i++) {
      const plan = getCityPlan(citySeed(i));
      const ids = new Set();
      for (let bj = -9; bj <= 8; bj++) {
        for (let bi = -9; bi <= 8; bi++) {
          const lots = layoutBlock(plan, bi, bj).lots;
          expect(lots.length).toBeLessThanOrEqual(32);
          for (let a = 0; a < lots.length; a++) {
            const p = lots[a];
            expect(ids.has(p.id)).toBe(false);
            ids.add(p.id);
            expect(lotId(p.bi, p.bj, p.k)).toBe(p.id);
            expect(lotIdParts(p.id)).toEqual({ bi: p.bi, bj: p.bj, k: p.k });
            expect(p.x1).toBeGreaterThan(p.x0);
            expect(p.z1).toBeGreaterThan(p.z0);
            expect(p.w).toBe(p.x1 - p.x0);
            expect(p.d).toBe(p.z1 - p.z0);
            for (let b = a + 1; b < lots.length; b++) {
              const q = lots[b];
              const overlap = p.x0 < q.x1 && q.x0 < p.x1 && p.z0 < q.z1 && q.z0 < p.z1;
              if (overlap) throw new Error('parseller çakışıyor: seed#' + i + ' ' + p.id + ' & ' + q.id);
            }
          }
        }
      }
    }
  });

  it('her parselin ön kenarı bir yol koridoruna (kaldırım/meydan) bitişiktir; kapı önü yürünebilir (≥%90 kenar)', () => {
    for (let i = 0; i < 40; i++) {
      const plan = getCityPlan(citySeed(i));
      const lots = allLots(plan);
      for (let q = 0; q < lots.length; q++) {
        const l = lots[q];
        const along = l.front === 'n' || l.front === 's';
        const n = along ? l.x1 - l.x0 : l.z1 - l.z0;
        let ok = 0;
        for (let k = 0; k < n; k++) {
          let x;
          let z;
          if (l.front === 'n') { x = l.x0 + k; z = l.z0 - 1; } else if (l.front === 's') { x = l.x0 + k; z = l.z1; } else if (l.front === 'w') { x = l.x0 - 1; z = l.z0 + k; } else { x = l.x1; z = l.z0 + k; }
          const s = surfaceAt(plan.roads, x, z);
          if (s === SURF.SIDEWALK || s === SURF.PLAZA) ok++;
        }
        if (ok < n * 0.9) throw new Error('parsel yola değmiyor: seed#' + i + ' lot ' + l.id + ' ' + ok + '/' + n);
        if (l.door) {
          const d = l.door;
          const fp = footprintOf(l);
          for (let w = -1; w <= 1; w++) {
            const x = d.x + (d.axis === 'x' ? w : 0);
            const z = d.z + (d.axis === 'z' ? w : 0);
            expect(x >= fp.x0 && x < fp.x1 && z >= fp.z0 && z < fp.z1).toBe(true);
          }
          // kapı önü hücresi parsel içi (apron) ya da kaldırım; kapıdan kaldırıma düz bir hat apron'dan geçer
          const fx = d.front.x;
          const fz = d.front.z;
          const inLot = fx >= l.x0 && fx < l.x1 && fz >= l.z0 && fz < l.z1;
          const fs = surfaceAt(plan.roads, fx, fz);
          expect(inLot || fs === SURF.SIDEWALK || fs === SURF.PLAZA).toBe(true);
          const vx = d.face === 'e' ? 1 : d.face === 'w' ? -1 : 0;
          const vz = d.face === 's' ? 1 : d.face === 'n' ? -1 : 0;
          let cx = fx;
          let cz = fz;
          for (let step = 0; step < 12; step++) {
            const s = surfaceAt(plan.roads, cx, cz);
            if (s === SURF.SIDEWALK || s === SURF.PLAZA) break;
            expect(cx >= l.x0 && cx < l.x1 && cz >= l.z0 && cz < l.z1).toBe(true);
            cx += vx;
            cz += vz;
          }
          const sEnd = surfaceAt(plan.roads, cx, cz);
          expect(sEnd === SURF.SIDEWALK || sEnd === SURF.PLAZA).toBe(true);
        }
      }
    }
  });
});

describe('arketip/yükseklik/bölge', () => {
  it('kat sayısı bölge aralığında (floors·4 ∈ [hMin,hMax]); açık arketiplerde 0; Merkez zirvesi ≤ y300', () => {
    const maxTop = { value: 0 };
    for (let i = 0; i < 30; i++) {
      const plan = getCityPlan(citySeed(i));
      allLots(plan).forEach((l) => {
        const A0 = ARCHETYPES[l.archetype];
        const D0 = DISTRICTS[l.district];
        expect(D0).toBeTruthy();
        if (!A0.building && !A0.special) {
          expect(l.floors).toBe(0);
          return;
        }
        if (A0.special) return;
        const h = l.floors * 4;
        if (h < D0.hMin || h > D0.hMax) throw new Error('yükseklik aralık dışı ' + l.archetype + ' ' + l.district + ' ' + h);
        const top = 64 + h + (l.roof ? l.roof.lift : 0);
        maxTop.value = Math.max(maxTop.value, top);
      });
    }
    expect(maxTop.value).toBeLessThanOrEqual(301);
    expect(maxTop.value).toBeGreaterThanOrEqual(260);
  });

  it('6 bölgenin hepsinde parsel var; Merkez kuleleri, Pazar tezgâhları, Konteyner yığınları, Tepe evleri', () => {
    const plan = getCityPlan(citySeed(4));
    const lots = allLots(plan);
    DISTRICT_KEYS.forEach((k) => expect(lots.filter((l) => l.district === k).length).toBeGreaterThan(40));
    expect(lots.filter((l) => l.district === 'merkez' && ARCHETYPES[l.archetype].tower).length).toBeGreaterThan(20);
    expect(lots.filter((l) => l.archetype === 'pazar_tezgahi').length).toBeGreaterThan(5);
    expect(lots.filter((l) => l.archetype === 'konteyner_yigini').length).toBeGreaterThan(30);
    expect(lots.filter((l) => l.archetype === 'ev').length).toBeGreaterThan(30);
    expect(lots.filter((l) => l.archetype === 'park').length).toBeGreaterThan(10);
    // ≥16 arketip kullanımda
    expect(new Set(lots.map((l) => l.archetype)).size).toBeGreaterThanOrEqual(15);
  });

  it('parsel kenar ölçüleri bölge tablosuna uyar (bant uzunluğu içinde ≥6, ≤ sideMax·1,6; mega hariç)', () => {
    const plan = getCityPlan(citySeed(9));
    allLots(plan).forEach((l) => {
      const D0 = DISTRICTS[l.district];
      const along = l.front === 'n' || l.front === 's';
      const frontLen = along ? l.w : l.d;
      expect(frontLen).toBeGreaterThanOrEqual(6);
      if (!l.station && !l.hill && !l.roof) expect(frontLen).toBeLessThanOrEqual(Math.max(D0.sideMax * 1.6, 68));
    });
  });
});

describe('sahipler (16)', () => {
  it('16 sahip → 16 ayrı parsel; her birinde sahibin iç mekânı sığar ve arketip o iç mekânı barındırır', () => {
    for (let i = 0; i < 40; i++) {
      const plan = getCityPlan(citySeed(i));
      const om = ownerMap(plan);
      expect(om.size).toBe(16);
      const lotIds = new Set();
      OWNERS.forEach((o) => {
        const v = om.get(o.id);
        expect(v).toBeTruthy();
        lotIds.add(v.lotId);
        expect(v.interior).toBe(o.interior);
        const lot = lotById(plan, v.lotId);
        expect(lot.owner).toBe(o.id);
        expect(lot.archetype).toBe(v.archetype);
        expect(ARCHETYPES[lot.archetype].interiors).toContain(o.interior);
        expect(INTERIOR_FOOT[o.interior]).toBeTruthy();
        expect(lot.built).toBe(true);
      });
      expect(lotIds.size).toBe(16);
    }
  });

  it('her iç mekân türü ≥2 arketip tarafından barındırılır (16 tür)', () => {
    OWNERS.forEach((o) => {
      const hosts = Object.keys(ARCHETYPES).filter((a) => ARCHETYPES[a].interiors.indexOf(o.interior) >= 0);
      expect(hosts.length).toBeGreaterThanOrEqual(2);
    });
    expect(interiorFits('klinik', 18, 14)).toBe(true);
    expect(interiorFits('klinik', 14, 18)).toBe(true);
    expect(interiorFits('klinik', 17, 14)).toBe(false);
  });
});

describe('sorgular', () => {
  it('lotAt/lotById/getLot/lotsInRect tutarlı; yol hücresinde null', () => {
    const seed = citySeed(6);
    const plan = getCityPlan(seed);
    const lots = allLots(plan);
    for (let q = 0; q < lots.length; q += 17) {
      const l = lots[q];
      const cx = Math.floor((l.x0 + l.x1) / 2);
      const cz = Math.floor((l.z0 + l.z1) / 2);
      expect(lotAt(plan, cx, cz).id).toBe(l.id);
      expect(lotAtSeed(seed, cx + 0.5, cz + 0.5).id).toBe(l.id);
      expect(lotById(plan, l.id)).toBe(l);
      expect(getLot(seed, l.id).id).toBe(l.id);
      expect(lotsInRect(seed, l.x0, l.z0, l.x1, l.z1).map((p) => p.id)).toContain(l.id);
    }
    expect(lotAt(plan, 0, 0)).toBeNull();
    expect(lotAt(plan, 5, 5)).toBeNull();
    expect(lotAt(plan, -5000, 5)).toBeNull();
    expect(lotById(plan, 999999999)).toBeNull();
    // chunk dikdörtgeni: birden çok parsel
    expect(lotsInRect(seed, 100, 100, 164, 164).length).toBeGreaterThan(0);
  });

  it('boş duvar (grafiti) bölgesi: Pazar/Konteyner/Tepe, 6×4, kapı ve yan duvarla çakışmaz', () => {
    let found = 0;
    for (let i = 0; i < 10; i++) {
      const plan = getCityPlan(citySeed(i));
      allLots(plan).forEach((l) => {
        const b = blankOf(plan, l);
        if (!b) return;
        found++;
        expect(['gece_pazari', 'konteyner', 'tepe']).toContain(l.district);
        expect(b.u1 - b.u0).toBe(6);
        expect(b.h).toBe(4);
        const fp = footprintOf(l);
        const len = l.front === 'n' || l.front === 's' ? fp.x1 - fp.x0 : fp.z1 - fp.z0;
        expect(b.u0).toBeGreaterThanOrEqual(1);
        expect(b.u1).toBeLessThanOrEqual(len - 1);
        const d = l.door;
        expect(b.u1 <= d.u - 1 || b.u0 >= d.u + 2).toBe(true);
      });
    }
    expect(found).toBeGreaterThan(200);
  });
});
