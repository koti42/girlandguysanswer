/*
 * qa5 (Faz 5, qa_logic) — BELİRLENİMCİLİK ×20 TOHUM: aynı tohum → aynı bayt/özet; işçi/üretim sırası bağımsız; chunk-kesit birleşimi = bütün.
 *   plan · iç mekân planı · prop planı (chunk sırası + structuredClone) · chunk baytları (ileri/geri/karışık sıra, önbellek temiz) · kesit birleşimi ·
 *   trafik (adım özeti) · yaya (adım özeti) · robot doğurucu (durum özeti) · görev/keşif/iş teklifleri · satıcı stoğu.
 * Her bölüm: iki bağımsız koşu (önbellekler arada temizlenir), özet eşitliği; farklı tohum → farklı özet (tohum duyarlılığı).
 * Ortam: KESIF_QA5_DET_SEEDS (vars. 20).
 */
import { describe, expect, it, vi } from 'vitest';
import { allLots } from '../sim/city/cityLots.js';
import { generateCityChunk, generateCitySection } from '../sim/city/cityGen.js';
import {
  clearCityPlanCaches, getBlockPlan, getCityPlan, planBuilding, pois,
} from '../sim/city/cityPlan.js';
import { citySeed, digest } from '../sim/city/cityPlanTestKit.js';
import { clearNetCaches, roadNet, walkNet } from '../sim/city/roadNet.js';
import { clearInteriorCache, planInterior, setInteriorStrict } from '../sim/city/interior/index.js';
import { interiorLots } from '../sim/city/interior/testKit.js';
import { propsForChunk } from '../sim/props/propPlan.js';
import { createTraffic, TICK } from '../sim/city/vehicle/trafficAI.js';
import { clearTrafficNetCache, trafficNet } from '../sim/city/vehicle/junctions.js';
import { makeCrowd } from '../sim/city/ped/crowdTestKit.js';
import { clearPedNavCache } from '../sim/city/ped/pedNav.js';
import { clearRobotSlotCache, robotSlotsForChunk } from '../sim/city/ped/robotSlots.js';
import { cityWorld } from '../sim/city/vehicle/vehicleTestKit.js';
import { EntityManager } from '../sim/entities.js';
import { Spawner } from '../sim/spawner.js';
import { createPlayerBody } from '../sim/physics.js';
import { buildDiscovery } from '../sim/city/mission/discovery.js';
import { genJobs } from '../sim/city/mission/jobs.js';
import { raceRunDef } from '../sim/city/mission/races.js';
import { buildStock } from './qa5Kit.js';
import { seededRandom } from '../sim/rng.js';

vi.setConfig({ testTimeout: 900000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const N = Number(ENV.KESIF_QA5_DET_SEEDS || 20);
const SEEDS = Array.from({ length: N }, (_, i) => i);
setInteriorStrict(true);

function freshAll() {
  clearCityPlanCaches();
  clearNetCaches();
  clearInteriorCache();
  clearTrafficNetCache();
  clearPedNavCache();
  clearRobotSlotCache();
}

const FNV = (h, v) => Math.imul(h ^ (v & 0xff), 16777619) >>> 0;
function chunkHash(c) {
  let h = 2166136261;
  for (let si = 0; si < c.sectionCount; si++) {
    h = FNV(h, c.secGen[si]);
    h = FNV(h, c.secUniform[si]);
    const b = c.secBlocks[si];
    if (b) for (let i = 0; i < b.length; i++) h = FNV(h, b[i]);
  }
  for (let i = 0; i < c.heightMap.length; i++) h = FNV(h, c.heightMap[i]);
  return h;
}

/** Sınır ve deniz kıyısı karışık 14 chunk (kule çekirdeği, kanal, tepe, yeraltı). */
function chunkSet(i) {
  const rng = seededRandom(0x6e0 + i);
  const out = [[0, 0], [-1, 0], [0, -1]];
  while (out.length < 14) out.push([rng.int(-48, 47), rng.int(-48, 47)]);
  return out;
}

function shuffled(list, seed) {
  return seededRandom(seed).shuffle(list.slice());
}

describe('qa5 determinizm — plan ve ağlar (20 tohum)', () => {
  SEEDS.forEach((i) => {
    it('tohum ' + i + ': plan/yol/yaya/POI/blok planı özetleri iki bağımsız koşuda aynı, structuredClone ile aynı', () => {
      const seed = citySeed(i);
      freshAll();
      const a = digest([getCityPlan(seed).terminals, getCityPlan(seed).races, getCityPlan(seed).roofRoutes, getCityPlan(seed).underground, roadNet(seed).edges, walkNet(seed).edges, pois(seed)]);
      const blocks = [[0, 0], [3, -2], [-5, 4], [8, 8]].map(([bi, bj]) => digest(getBlockPlan(seed, bi, bj)));
      freshAll();
      const b = digest([getCityPlan(seed).terminals, getCityPlan(seed).races, getCityPlan(seed).roofRoutes, getCityPlan(seed).underground, roadNet(seed).edges, walkNet(seed).edges, pois(seed)]);
      const blocks2 = [[8, 8], [-5, 4], [3, -2], [0, 0]].map(([bi, bj]) => digest(getBlockPlan(seed, bi, bj))).reverse();
      expect(b).toBe(a);
      expect(blocks2).toEqual(blocks);
      const sc = structuredClone(pois(seed));
      expect(digest(sc)).toBe(digest(pois(seed)));
      const other = digest(getCityPlan(citySeed(i + 1)).terminals);
      expect(other).not.toBe(digest(getCityPlan(seed).terminals));
    });
  });
});

describe('qa5 determinizm — iç mekân planları (20 tohum × 12 parsel)', () => {
  SEEDS.forEach((i) => {
    it('tohum ' + i + ': planInterior JSON baytları önbellek temizlenince ve ters sırada aynı; structuredClone aynı', () => {
      const seed = citySeed(i);
      const sel = interiorLots(seed).filter((e, k) => k % 11 === 0).slice(0, 12);
      const run = (order) => {
        const m = {};
        order.forEach(({ lot, bp }) => { m[lot.id] = JSON.stringify(planInterior(bp, lot)); });
        return m;
      };
      clearInteriorCache();
      const a = run(sel);
      clearInteriorCache();
      const b = run(sel.slice().reverse());
      expect(b).toEqual(a);
      const one = sel[0];
      expect(JSON.stringify(structuredClone(planInterior(one.bp, one.lot)))).toBe(a[one.lot.id]);
      clearCityPlanCaches();
      const lotAgain = allLots(getCityPlan(seed)).find((l) => l.id === one.lot.id);
      expect(JSON.stringify(planInterior(planBuilding(seed, lotAgain), lotAgain))).toBe(a[one.lot.id]);
    });
  });
});

describe('qa5 determinizm — prop planı (20 tohum, chunk sırası + structuredClone)', () => {
  SEEDS.forEach((i) => {
    it('tohum ' + i + ': propsForChunk her chunk için aynı; ileri/geri/karışık sıra özdeş', () => {
      const seed = citySeed(i);
      const cs = chunkSet(i);
      const run = (order) => {
        freshAll();
        const m = {};
        order.forEach(([cx, cz]) => { m[cx + ',' + cz] = digest(propsForChunk(seed, cx, cz)); });
        return m;
      };
      const a = run(cs);
      expect(run(cs.slice().reverse())).toEqual(a);
      expect(run(shuffled(cs, 7 + i))).toEqual(a);
      const [cx, cz] = cs[0];
      const props = propsForChunk(seed, cx, cz);
      expect(digest(structuredClone(props))).toBe(a[cx + ',' + cz]);
    });
  });
});

describe('qa5 determinizm — chunk baytları, kesit birleşimi (20 tohum × 14 chunk)', () => {
  SEEDS.forEach((i) => {
    it('tohum ' + i + ': chunk baytları üretim sırasından bağımsız; kesit(si) birleşimi = bütün chunk (sections:all)', () => {
      const seed = citySeed(i);
      const cs = chunkSet(i);
      const run = (order) => {
        freshAll();
        const m = {};
        order.forEach(([cx, cz]) => { m[cx + ',' + cz] = chunkHash(generateCityChunk(seed, cx, cz, { light: false, sections: 'all' })); });
        return m;
      };
      const a = run(cs);
      expect(run(cs.slice().reverse())).toEqual(a);
      expect(run(shuffled(cs, 99 + i))).toEqual(a);
      // kesit birleşimi: tek tek generateCitySection ile kurulan chunk = bütün
      freshAll();
      const bad = [];
      cs.slice(0, 5).forEach(([cx, cz]) => {
        const whole = generateCityChunk(seed, cx, cz, { light: false, sections: 'all' });
        for (let si = 0; si < whole.sectionCount; si++) {
          const part = generateCitySection(seed, cx, cz, si);
          const wb = whole.secBlocks[si];
          if (whole.secGen[si] === 0) { if (part.blocks !== null || part.uniform !== 0) bad.push('üretilmeyen kesit ' + [cx, cz, si]); continue; }
          if (wb === null) { if (part.blocks !== null || part.uniform !== whole.secUniform[si]) bad.push('tekdüze kesit ' + [cx, cz, si]); continue; }
          if (part.blocks === null || part.blocks.length !== wb.length || part.blocks.some((v, q) => v !== wb[q])) bad.push('kesit ' + [cx, cz, si]);
        }
      });
      expect(bad.slice(0, 5)).toEqual([]);
    });
  });
});

/** Robot yuva yoğunluğu en yüksek 7×7 chunk bloğunun merkezi (robots.test.js ile aynı ölçüt). */
function densest(seed) {
  let best = null;
  for (let cx = -44; cx < 44; cx += 2) {
    for (let cz = -44; cz < 44; cz += 2) {
      let n = 0;
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) n += robotSlotsForChunk(seed, cx + a, cz + b).length;
      if (!best || n > best.n) best = { cx, cz, n };
    }
  }
  return best;
}
const ROBOT_TOTAL = { mobs: 0, events: 0, runs: 0 };

describe('qa5 determinizm — trafik, yaya, robot (20 tohum)', () => {
  SEEDS.forEach((i) => {
    it('tohum ' + i + ': trafik 500 adım, yaya 300 adım özeti aynı; farklı tohum farklı', () => {
      const seed = citySeed(i);
      const runTraffic = (sd) => {
        freshAll();
        const tr = createTraffic(trafficNet(sd), { seed: sd, cap: 30 });
        tr.setTime(700 + (i % 7));
        tr.setPlayer(-200 + i * 20, 64, 100 - i * 9, 0.4);
        tr.setEnv({ phase: 0.5 });
        tr.populate();
        const d = [];
        for (let k = 0; k < 500; k++) {
          tr.step(TICK);
          if (k % 100 === 99) d.push(tr.digest());
        }
        return d.join(',');
      };
      const a = runTraffic(seed);
      expect(runTraffic(seed)).toBe(a);
      expect(runTraffic(citySeed(i + 50))).not.toBe(a);
      const runCrowd = (sd) => {
        freshAll();
        const { crowd } = makeCrowd(sd, { px: -100 + i * 11, pz: 60 - i * 7, phase: 0.2 + (i % 5) * 0.15, rain: i % 4 === 0 ? 1 : 0 });
        crowd.populate();
        const d = [];
        for (let k = 0; k < 300; k++) {
          crowd.step(0.05);
          if (k % 100 === 99) d.push(crowd.digest());
        }
        return d.join(',');
      };
      const c = runCrowd(seed);
      expect(runCrowd(seed)).toBe(c);
      expect(runCrowd(citySeed(i + 50))).not.toBe(c);
    });

    it('tohum ' + i + ': robot doğurucu 40 sn gece (kopya dünya) iki bağımsız koşuda aynı durum', () => {
      const run = () => {
        freshAll();
        const { world, seed } = cityWorld(500 + i * 13, [0, 0], [0, 0]);
        const d = densest(seed);
        for (let cx = d.cx - 5; cx <= d.cx + 5; cx++) for (let cz = d.cz - 5; cz <= d.cz + 5; cz++) world.ensureChunk(cx, cz);
        const events = [];
        const em = new EntityManager({ seed, world, emit: (e) => events.push(e) });
        const sp = new Spawner({
          seed, world, em, profile: 'neon', neon: { grantKredi: () => {}, tier: () => 'high' },
        });
        const p = createPlayerBody(d.cx * 16 + 8, 64, d.cz * 16 + 8);
        p.dead = false;
        p.h = 1.8;
        const night = { dayFactor: 0.1, peaceful: false };
        for (let k = 0; k < 40 * 60; k++) {
          sp.update(1 / 60, p, night);
          em.update(1 / 60, p, night);
        }
        const rows = [];
        em.mobs.forEach((e) => rows.push([e.type, Math.round(e.x * 100), Math.round(e.y * 100), Math.round(e.z * 100), e.hp]));
        ROBOT_TOTAL.mobs += rows.length;
        ROBOT_TOTAL.events += events.length;
        ROBOT_TOTAL.runs++;
        return JSON.stringify([rows, events.length]);
      };
      expect(run()).toBe(run());
    });
  });
});

describe('qa5 determinizm — robot kapsamı', () => {
  it('toplam: robot koşuları gerçekten robot doğurdu (boş durum eşitliği değil)', () => {
    if (N < 10) return;
    expect(ROBOT_TOTAL.runs).toBe(N * 2);
    expect(ROBOT_TOTAL.mobs).toBeGreaterThan(N);
  });
});

describe('qa5 determinizm — görev, keşif, iş teklifleri, satıcı stoğu (20 tohum)', () => {
  SEEDS.forEach((i) => {
    it('tohum ' + i + ': katalog, iş teklifleri, yarış tanımları, satıcı stoğu iki bağımsız koşuda aynı', () => {
      const seed = citySeed(i);
      const run = () => {
        freshAll();
        const cat = buildDiscovery(seed);
        const net = roadNet(seed);
        const jobs = [];
        ['kurye', 'taksi'].forEach((board) => { for (let day = 0; day < 3; day++) for (let desk = 0; desk < 3; desk++) jobs.push(genJobs(seed, net, board, day, desk)); });
        const races = getCityPlan(seed).races.map((r) => raceRunDef(r, 'spor', {}));
        return JSON.stringify([cat.chips, cat.graffiti, cat.rooms, cat.terminals, jobs, races, buildStock(seed, 0), buildStock(seed, 5)]);
      };
      const a = run();
      expect(run()).toBe(a);
      expect(a.length).toBeGreaterThan(20000);
    });
  });
});
