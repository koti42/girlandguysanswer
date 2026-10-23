import { describe, expect, it } from 'vitest';
import { World } from '../../world.js';
import { dimSeed } from '../../dim/dimensions.js';
import { createPropLayer, attachPropLayer } from '../../props/propLayer.js';
import { getCityPlan, pois } from '../cityPlan.js';
import { roadNet } from '../roadNet.js';
import { citySeed } from '../cityPlanTestKit.js';
import { ensureCityState } from '../cityState.js';
import { VEHICLE_CLASSES, VEHICLE_DEFS } from '../vehicle/vehicleData.js';
import { createVehicle, stepVehicle } from '../vehicle/vehiclePhysics.js';
import {
  botJob, botRace, createBot, raceRoute,
} from '../vehicle/vehicleBot.js';
import { genJobs, jobLimitFor, jobRunDef } from './jobs.js';
import { raceMedals } from './medals.js';
import { raceRunDef } from './races.js';
import { createRun, RUN_STATUS } from './run.js';
import { applyRaceResult } from './results.js';

/*
 * "Betik her yarışı altınla, her işi süresi içinde tamamlar": gerçek araç fiziği + betikli sürücü (vehicleBot) → missions/run.js koşucusu + medals + results.
 * Süre eşikleri fizik koşusu YAPILMADAN (medals.estimateBotTime) hesaplanır; burada betiğin gerçek süresi bu eşiklerle sınanır.
 */
function makeWorld(seedIn) {
  const seed = dimSeed(seedIn, 'neon');
  const world = new World({ seed, mode: 'macera', dim: 'neon' });
  attachPropLayer(world, createPropLayer({ citySeed: seed }));
  return {
    seed, world, plan: getCityPlan(seed), net: roadNet(seed),
  };
}

const DT = 1 / 60;
function ensureAround(world, x, z, r) {
  for (let cx = Math.floor((x - r) / 16); cx <= Math.floor((x + r) / 16); cx++) {
    for (let cz = Math.floor((z - r) / 16); cz <= Math.floor((z + r) / 16); cz++) world.ensureChunk(cx, cz);
  }
}

/** Betikli sürücü bir yolu sürer, her adımı koşucuya bildirir. Dönen: {run, steps, v}. */
function driveRun(world, cls, path, run, o) {
  const op = o || {};
  const bot = createBot(cls, path, op);
  const p0 = path[0];
  const p1 = path[Math.min(path.length - 1, 4)];
  const yaw0 = Math.atan2(-(p1[0] - p0[0]), -(p1[2] - p0[2]));
  ensureAround(world, p0[0], p0[2], 48);
  const rx = Math.cos(yaw0);
  const rz = -Math.sin(yaw0);
  const off = op.startOffset || 0;
  const v = createVehicle(cls, {
    x: p0[0] + rx * off, y: p0[1], z: p0[2] + rz * off, yaw: yaw0,
  });
  run.start();
  let steps = 0;
  const max = Math.round((op.maxSec || 900) * 60);
  let brake = 0;
  while (steps < max && run.status === RUN_STATUS.ACTIVE) {
    if (steps % 30 === 0) ensureAround(world, v.x + v.vx * 0.8, v.z + v.vz * 0.8, 40);
    const inp = bot.control(v);
    if (bot.state.done && op.brakeAtEnd) {
      brake++;
      inp.throttle = 0;
      inp.brake = 1;
    }
    const ev = stepVehicle(v, inp, world, DT, {});
    for (let k = 0; k < ev.length; k++) if (ev[k].type === 'bump') run.notify('bump', { impact: ev[k].impact });
    run.update(DT, {
      x: v.x, y: v.y, z: v.z, speed: Math.hypot(v.vx, v.vz), cls,
    });
    steps++;
    if (brake > 600) break;
  }
  return { run, steps, v };
}

describe('betik: her yarış × her sınıf altın (tohum 777)', () => {
  const w = makeWorld(777);
  w.plan.races.forEach((race) => {
    it(race.key + ': 6 sınıf da kapıları sırayla geçer, altın alır, süre geçerlidir; 0,5× altın süresi reddedilir', () => {
      VEHICLE_CLASSES.forEach((cls) => {
        const rt = raceRoute(w.net, race, {});
        const med = raceMedals(w.net, race, cls);
        const run = createRun(raceRunDef(race, cls, med));
        const r = driveRun(w.world, cls, rt.path, run);
        expect(run.status, race.key + ' ' + cls + ' ' + run.reason).toBe(RUN_STATUS.DONE);
        expect(run.passed).toBe(run.total);
        const city = ensureCityState({});
        const res = applyRaceResult(city, race.id, cls, run.t, med);
        expect(res.valid, race.key + ' ' + cls).toBe(true);
        expect(res.medal, race.key + ' ' + cls + ' süre ' + run.t.toFixed(1) + ' altın ' + med.gold).toBe(3);
        expect(run.t).toBeGreaterThanOrEqual(med.minValid);
        expect(res.gold).toBe(true);
        expect(city.stats.goldMedals).toBe(1);
        // hile: altının yarısı kadar sürede bitirme kaydı reddedilir
        const bad = applyRaceResult(ensureCityState({}), race.id, cls, med.gold * 0.5, med);
        expect(bad.valid).toBe(false);
        expect(bad.kredi).toBe(0);
        expect(r.steps).toBeGreaterThan(60);
      });
    }, 240000);
  });

  it('özensiz oyuncu (%92 hız, 0,8 m kayık, geç direksiyon) yarışı bronz ya da daha iyisiyle bitirir', () => {
    ['kanal', 'tepe', 'merkez'].forEach((key) => {
      const race = w.plan.races.find((q) => q.key === key);
      const cls = 'taksi';
      const med = raceMedals(w.net, race, cls);
      const rt = raceRoute(w.net, race, {});
      const run = createRun(raceRunDef(race, cls, med));
      driveRun(w.world, cls, rt.path, run, { pace: 0.92, startOffset: 0.8, look: 1.35 });
      expect(run.status, key + ' ' + run.reason).toBe(RUN_STATUS.DONE);
      const res = applyRaceResult(ensureCityState({}), race.id, cls, run.t, med);
      expect(res.valid).toBe(true);
      expect(res.medal, key).toBeGreaterThanOrEqual(1);
    });
  }, 240000);
});

describe('betik: yarışlar tohumlar arası (taksi/spor/hoverbike)', () => {
  [31337, 5].forEach((sd) => {
    it('tohum ' + sd + ': 8 yarış × 3 sınıf altın', () => {
      const w = makeWorld(sd);
      w.plan.races.forEach((race) => {
        ['taksi', 'spor', 'hoverbike'].forEach((cls) => {
          const med = raceMedals(w.net, race, cls);
          const rt = raceRoute(w.net, race, {});
          const run = createRun(raceRunDef(race, cls, med));
          driveRun(w.world, cls, rt.path, run);
          expect(run.status, race.key + ' ' + cls).toBe(RUN_STATUS.DONE);
          expect(run.t, race.key + ' ' + cls + ' altın ' + med.gold).toBeLessThanOrEqual(med.gold);
        });
      });
    }, 240000);
  });
});

describe('medals: tahmin gerçek betik süresine yakın (tohumlar arası)', () => {
  it('tahmin ≥ gerçek betik süresi (altın alınır) ve ≤ 1,08 × gerçek (altın kolay değil) — 4. tohum, 8 yarış × 6 sınıf', () => {
    const w = makeWorld(424242);
    w.plan.races.forEach((race) => {
      VEHICLE_CLASSES.forEach((cls) => {
        const real = botRace(w.world, w.net, race, cls, {});
        expect(real.done, race.key + ' ' + cls).toBe(true);
        const med = raceMedals(w.net, race, cls);
        expect(med.bot, race.key + ' ' + cls).toBeGreaterThanOrEqual(real.time - 0.15);
        expect(med.bot, race.key + ' ' + cls).toBeLessThanOrEqual(real.time * 1.08);
      });
    });
  }, 400000);
});

describe('betik: işler süre sınırı içinde', () => {
  [3, 11].forEach((si) => {
    const seed = citySeed(si);
    it('tohum ' + si + ': kurye/taksi/kapsül teklifleri için betik rotayı süre sınırından önce bitirir; uç noktalar yol eksenine ≤ 13 m', () => {
      const net = roadNet(seed);
      const world = new World({ seed, mode: 'macera', dim: 'neon' });
      attachPropLayer(world, createPropLayer({ citySeed: seed }));
      const offers = [];
      for (let desk = 0; desk < 7; desk += 3) offers.push(...genJobs(seed, net, 'kurye', 1, desk));
      offers.push(...genJobs(seed, net, 'taksi', 1, 0, { x: 200, z: 100 }));
      expect(offers.length).toBeGreaterThanOrEqual(12);
      let driven = 0;
      offers.forEach((j) => {
        const stops = j.stops ? [j.from].concat(j.stops) : [j.from, j.to];
        stops.forEach((p) => expect(net.nearest(p.x, p.z).dist, j.id).toBeLessThanOrEqual(13));
        if (j.kind === 'pod' || j.kind === 'tamir') return;
        const na = net.nearest(j.from.x, j.from.z).node;
        const nb = net.nearest(j.to.x, j.to.z).node;
        if (na === nb) return;
        ['taksi', 'motor'].forEach((cls) => {
          const r = botJob(world, net, na, nb, cls, {});
          if (!r) return;
          driven++;
          expect(r.done, j.id + ' ' + cls + ' ' + r.failed).toBe(true);
          const limit = jobLimitFor(j, cls);
          // oyuncu ≈ 12 sn iner/biner; betik rotayı limitten yeterince önce bitirir
          expect(r.time + 12, j.id + ' ' + cls).toBeLessThan(limit);
          const d = jobRunDef(j, cls);
          expect(d.limit).toBe(limit);
          expect(d.minTime).toBeLessThanOrEqual(r.time);
        });
      });
      expect(driven).toBeGreaterThanOrEqual(8);
    }, 400000);
  });

  it('taksi: durma yarıçapı içinde yavaşlayan araç yolcuyu alır ve bırakır; hızlı geçen almaz', () => {
    const seed = citySeed(2);
    const net = roadNet(seed);
    const j = genJobs(seed, net, 'taksi', 0, 0, { x: 40, z: 40 })[0];
    const run = createRun(Object.assign({}, jobRunDef(j, 'taksi'), { noTeleport: false }));
    run.start();
    run.update(DT, {
      x: j.from.x, y: 64, z: j.from.z, speed: 12, cls: 'taksi',
    });
    expect(run.step).toBe(0); // hızlı geçti
    run.update(DT, {
      x: j.from.x + 2, y: 64, z: j.from.z, speed: 1.2, cls: 'taksi',
    });
    expect(run.step).toBe(1);
    run.t = jobRunDef(j, 'taksi').minTime + 1;
    run.update(DT, {
      x: j.to.x, y: 64, z: j.to.z, speed: 9, cls: 'taksi',
    });
    expect(run.status).toBe(RUN_STATUS.ACTIVE);
    run.update(DT, {
      x: j.to.x, y: 64, z: j.to.z, speed: 2, cls: 'taksi',
    });
    expect(run.status).toBe(RUN_STATUS.DONE);
    expect(pois(seed).length).toBeGreaterThan(0);
    expect(VEHICLE_DEFS.taksi.seats).toBeGreaterThanOrEqual(2);
  });
});
