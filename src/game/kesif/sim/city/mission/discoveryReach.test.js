import { describe, expect, it } from 'vitest';
import {
  getCityPlan, groundY, lotAt,
} from '../cityPlan.js';
import { citySeed } from '../cityPlanTestKit.js';
import { footprintOf } from '../cityLots.js';
import { ARCHETYPES } from '../archetypes.js';
import { SURF, surfaceAt } from '../cityRoads.js';
import { buildNav } from '../cityNavKit.js';
import { sewerExtras } from '../cityUndergroundExtra.js';
import { lockGraph, solveUnderground } from '../cityUndergroundLocks.js';
import { Nav3, denseReader, doorOverlay } from '../cityContentTestKit.js';
import { buildDiscovery, inVaultTrigger } from './discovery.js';
import { COUNTS } from './missionData.js';

/*
 * Keşif katalogu ULAŞILABİLİRLİK. Hızlı (plan düzeyi) denetimler 200 tohumda; gerçek blok geometrisinde (tam BFS) 2 tohumda:
 *   sokak hücreleri → zemin çipleri, 72 sokak grafitisi · menholler → kanalizasyon çipleri, 18 kanal grafitisi, 30 gizli oda (kilitler çözülmüş), Kasa tetikleyicisi.
 */
const WALK = [SURF.SIDEWALK, SURF.PLAZA, SURF.QUAY, SURF.PARK, SURF.GROUND, SURF.ASPHALT, SURF.LANE_X, SURF.LANE_Z, SURF.ZEBRA_X, SURF.ZEBRA_Z];
const STREET = [SURF.SIDEWALK, SURF.PLAZA, SURF.QUAY, SURF.ASPHALT, SURF.LANE_X, SURF.LANE_Z, SURF.ZEBRA_X, SURF.ZEBRA_Z];

function insideBuilding(seed, x, z) {
  const lot = lotAt(seed, Math.floor(x), Math.floor(z));
  if (!lot || !ARCHETYPES[lot.archetype].building) return false;
  const fp = footprintOf(lot);
  return !!fp && x >= fp.x0 && x < fp.x1 && z >= fp.z0 && z < fp.z1;
}

/** Park parseli: iç mekân yoktur; parselin çevresinde sokak yüzeyi (kaldırım/asfalt/meydan) varsa içi tamamen yürünür sayılır. */
function parkTouchesStreet(plan, lot) {
  for (let x = lot.x0 - 1; x <= lot.x1; x++) {
    if (STREET.indexOf(surfaceAt(plan.roads, x, lot.z0 - 1)) >= 0 || STREET.indexOf(surfaceAt(plan.roads, x, lot.z1)) >= 0) return true;
  }
  for (let z = lot.z0 - 1; z <= lot.z1; z++) {
    if (STREET.indexOf(surfaceAt(plan.roads, lot.x0 - 1, z)) >= 0 || STREET.indexOf(surfaceAt(plan.roads, lot.x1, z)) >= 0) return true;
  }
  return false;
}

/** Hücreden yerel 4-komşu BFS (yarıçap 14): bina içine/suya girmeden sokak yüzeyine ulaşılır mı? */
function reachesStreet(plan, seed, x, z) {
  const sx = Math.floor(x);
  const sz = Math.floor(z);
  const R = 14;
  const key = (a, b) => (a + R) * 64 + (b + R);
  const seen = new Set([key(0, 0)]);
  const q = [[0, 0]];
  while (q.length) {
    const [dx, dz] = q.shift();
    const s = surfaceAt(plan.roads, sx + dx, sz + dz);
    if (STREET.indexOf(s) >= 0) return true;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = dx + ax;
      const nz = dz + az;
      if (Math.abs(nx) > R || Math.abs(nz) > R || seen.has(key(nx, nz))) continue;
      const su = surfaceAt(plan.roads, sx + nx, sz + nz);
      if (WALK.indexOf(su) < 0 || insideBuilding(seed, sx + nx + 0.5, sz + nz + 0.5)) continue;
      seen.add(key(nx, nz));
      q.push([nx, nz]);
    }
  }
  return false;
}

describe('keşif katalogu: plan düzeyinde ulaşılabilirlik (200 tohum)', () => {
  it('zemin çipleri ve sokak grafitileri: standing hücre bina/su dışında ve sokak yüzeyine bağlanır', () => {
    for (let i = 0; i < 200; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      const cat = buildDiscovery(seed);
      cat.chips.forEach((c) => {
        if (c.kind !== 'kapi' && c.kind !== 'park') return;
        const lot = lotAt(seed, Math.floor(c.x), Math.floor(c.z));
        const ok = c.kind === 'park' && lot && lot.archetype === 'park' ? parkTouchesStreet(plan, lot) : reachesStreet(plan, seed, c.x, c.z);
        if (!ok) throw new Error('çip ' + c.id + ' tohum ' + i + ' sokağa bağlanmıyor');
      });
      cat.graffiti.forEach((g) => {
        if (g.where !== 'sokak') return;
        if (!reachesStreet(plan, seed, g.x, g.z)) throw new Error('grafiti ' + g.id + ' tohum ' + i + ' sokağa bağlanmıyor');
      });
    }
  }, 300000);

  it('çatı çipleri: çatı parkuru kontrol karolarının merkezinde; kanal çipleri menhol kavşaklarında; kanal panelleri/odaları kanalizasyon kutuları içinde', () => {
    for (let i = 0; i < 200; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      const cat = buildDiscovery(seed);
      const ex = sewerExtras(plan);
      cat.chips.forEach((c) => {
        if (c.kind === 'cati') {
          const ok = plan.roofRoutes.some((r) => r.pads.some((p) => Math.abs(p.x - c.x) <= 0.51 && Math.abs(p.z - c.z) <= 0.51 && Math.abs(p.y - c.y) <= 1.01));
          if (!ok) throw new Error('çatı çipi ' + c.id + ' tohum ' + i + ' kontrol karosunda değil');
        } else if (c.kind === 'kanal') {
          const mh = plan.underground.sewer.manholes.some((m) => Math.abs(m.i * 80 + 0.5 - c.x) < 0.01 && Math.abs(m.j * 80 + 0.5 - c.z) < 0.01);
          if (!mh) throw new Error('kanal çipi ' + c.id + ' tohum ' + i + ' menhol kavşağında değil');
        }
      });
      cat.graffiti.forEach((g) => {
        if (g.where === 'kanal' && !ex.junctions.some((J) => Math.abs(g.x - J.x) <= 16 && Math.abs(g.z - J.z) <= 16)) throw new Error('kanal grafitisi ' + g.id + ' tohum ' + i + ' kavşak odasından uzak');
      });
      cat.rooms.forEach((r) => {
        if (!ex.inside(Math.floor(r.x), 31, Math.floor(r.z))) throw new Error('gizli oda ' + r.id + ' tohum ' + i + ' dışarıda');
      });
      // kilitler: sabit-nokta çözümü her kilidi açar (kasa dahil) → hiçbir oda/Kasa kilitli kalmaz
      expect(solveUnderground(plan).unsolved, 'tohum ' + i).toEqual([]);
    }
  }, 300000);

  it('Kasa tetikleyicisi 200 tohumda tanımlı ve derinde (y < 0)', () => {
    for (let i = 0; i < 200; i++) {
      const cat = buildDiscovery(citySeed(i));
      expect(cat.vault.trigger.y1).toBeLessThan(0);
      expect(inVaultTrigger(cat, cat.vault.anchor.x, cat.vault.anchor.y + 0.5, cat.vault.anchor.z)).toBe(true);
    }
  });
});

describe('keşif katalogu: gerçek bloklarda tam BFS (2 tohum)', () => {
  const SEEDS = [3, 17].map(citySeed);

  SEEDS.forEach((seed, si) => {
    it('tohum ' + si + ': sokaktan zemin çipleri ve sokak grafitileri yürünerek ulaşılır', () => {
      const cat = buildDiscovery(seed);
      const nav = buildNav(seed);
      const seen = nav.reach(0, 64, 2);
      const near = (x, z, y, r) => {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const lv = nav.levels(Math.floor(x) + dx, Math.floor(z) + dz);
            for (let k = 0; k < lv.length; k++) if (Math.abs(lv[k] - y) <= 2 && nav.isReached(seen, Math.floor(x) + dx, Math.floor(z) + dz, lv[k])) return true;
          }
        }
        return false;
      };
      let n = 0;
      cat.chips.forEach((c) => {
        if (c.kind !== 'kapi' && c.kind !== 'park') return;
        n++;
        if (!near(c.x, c.z, Math.round(groundY(seed, c.x, c.z)), 3)) throw new Error('zemin çipi ulaşılamıyor: ' + c.id);
      });
      cat.graffiti.forEach((g) => {
        if (g.where !== 'sokak') return;
        n++;
        if (!near(g.x, g.z, Math.round(groundY(seed, g.x, g.z)), 3)) throw new Error('sokak grafitisi ulaşılamıyor: ' + g.id);
      });
      expect(n).toBeGreaterThanOrEqual(140 + 72 - 1 - 0);
    }, 600000);

    it('tohum ' + si + ': menhollerden (kilitler çözülmüş) kanal çipleri, 18 kanal grafitisi, 30 gizli oda ulaşılır (Kasa: kilit çözümü + cityUndergroundNav kasa testi)', () => {
      const plan = getCityPlan(seed);
      const cat = buildDiscovery(seed);
      const G = lockGraph(plan);
      const rd = denseReader(seed, 16, 64, { overlay: doorOverlay(G.doors, 'all') });
      const nav = new Nav3(rd.getBlock);
      const starts = plan.underground.sewer.manholes.map((m) => [m.x, 63, m.z]);
      const res = nav.bfs(starts, { box: { x0: -740, x1: 740, z0: -740, z1: 740, y0: 28, y1: 64 }, maxNodes: 4000000 });
      expect(res.count).toBeGreaterThan(200000);
      const nearNode = (x, y, z, r) => {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (nav.has(res, Math.floor(x) + dx, y, Math.floor(z) + dz)) return true;
        return false;
      };
      cat.chips.filter((c) => c.kind === 'kanal').forEach((c) => {
        expect(nearNode(c.x, 31, c.z, 1), 'kanal çipi ' + c.id).toBe(true);
      });
      const kanal = cat.graffiti.filter((g) => g.where === 'kanal');
      expect(kanal).toHaveLength(18);
      kanal.forEach((g) => expect(nearNode(g.x, 31, g.z, 1), 'kanal grafitisi ' + g.id).toBe(true));
      expect(cat.rooms).toHaveLength(COUNTS.rooms);
      cat.rooms.forEach((r) => {
        const b = r.box;
        let any = false;
        for (let z = b.z0; z < b.z1 && !any; z++) for (let x = b.x0; x < b.x1 && !any; x++) if (nav.has(res, x, 31, z)) any = true;
        expect(any, 'gizli oda ' + r.id).toBe(true);
      });
    }, 900000);
  });
});
