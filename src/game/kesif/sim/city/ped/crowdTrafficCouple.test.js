import { describe, expect, it, vi } from 'vitest';
import { citySeed } from '../cityPlanTestKit.js';
import { makeCrowd } from './crowdTestKit.js';
import { createTraffic, TICK } from '../vehicle/trafficAI.js';
import { trafficNet } from '../vehicle/junctions.js';
import { createMonitor } from '../vehicle/trafficTestKit.js';
import { pedSignalInfo } from '../vehicle/trafficLights.js';

vi.setConfig({ testTimeout: 900000 });

function run(seed, withCrowd, secs, px, pz) {
  const tn = trafficNet(seed);
  let crowd = null;
  const tr = createTraffic(tn, { seed, cap: 30, hooks: { pedBlocked: (j, a) => (crowd ? crowd.pedBlocked(j, a) : false) } });
  tr.setTime(500);
  tr.setPlayer(px, 64, pz, 0);
  tr.setEnv({ phase: 0.8, rain: false, night: true });
  tr.populate();
  if (withCrowd) {
    ({ crowd } = makeCrowd(seed, { px, pz, phase: 0.8, quality: 'high' }));
    crowd.setSignals((j, a, t, out) => {
      const J = tn.junctions[j];
      return J ? pedSignalInfo(J.plan, a, tr.time, out) : null;
    });
    crowd.populate();
  }
  const mon = createMonitor(tn);
  const n = Math.round(secs / TICK);
  for (let i = 0; i < n; i++) {
    tr.step(TICK);
    if (crowd) {
      const cars = [];
      tr.cars.forEach((c) => { if (c.alive && c.state === 1 && Math.hypot(c.x - px, c.z - pz) < 110) cars.push({ x: c.x, z: c.z, y: c.y, yaw: c.yaw, hl: c.halfLen, hw: c.halfWid, vx: -Math.sin(c.yaw) * c.v, vz: -Math.cos(c.yaw) * c.v, kind: 5 }); });
      crowd.setVehicles(cars, cars.length);
      crowd.step(TICK);
    }
    mon.step(tr, TICK, 2);
  }
  const m = mon.result();
  return { watchdog: tr.stats.watchdog, maxStill: m.maxStill, minGap: m.minGap, redRuns: tr.stats.redRuns, alive: tr.alive() };
}

/*
 * QA4-006: stepFollow'un ileri bakışı engel görür, laneSearch "başarılı" der ama yaya yön değişimiyle yine engele bakar → yerinde döner (blockedT artmaz). Geçitte CROSS
 * yayası geri dönemez ve `pedBlocked` sonsuza dek true kalır: araç kuyruğu 6+ dk kilitlenir (8 dk koşuda bekçi 12, en uzun duruş 382 sn). Düzeltme: p.laneT (1,2 sn sonra ileri bakış atlanır).
 */
describe('trafik × kalabalık eşleşmesi (QA4-006): yaya kalabalığı trafiği kilitlemez; şerit değiştirme canlı kilidi yok', () => {
  [[11, 0, -150], [12, 240, 0], [13, -80, 160], [14, 160, -240], [15, 0, 0], [16, -240, -80]].forEach(([s, px, pz]) => {
    it('tohum ' + s + ' gece, Merkez: 8 dk — yayalı koşuda bekçi/takılma, yayasız koşudan belirgin kötü değil', () => {
      const seed = citySeed(s);
      const a = run(seed, false, 480, px, pz);
      const b = run(seed, true, 480, px, pz);
      expect(b.minGap).toBeGreaterThan(0.5);
      expect(b.watchdog).toBeLessThanOrEqual(a.watchdog + 1);
      expect(b.maxStill).toBeLessThan(Math.max(50, a.maxStill + 20));
    });
  });
});
