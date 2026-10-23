import { describe, expect, it } from 'vitest';
import { getCityPlan, pois } from '../cityPlan.js';
import { citySeed } from '../cityPlanTestKit.js';
import { roadNet } from '../roadNet.js';
import { VEHICLE_CLASSES } from '../vehicle/vehicleData.js';
import { jobLimit } from '../vehicle/vehicleBot.js';
import { createRun, RUN_STATUS, validateDef } from './run.js';
import {
  DOOR_R, PASSENGERS, TIERS, baseReward, canWalk, genJobs, jobId, jobLimitFor, jobReward, jobRunDef, nearKey, parseJobId, pushLog, repeatDecay, taxiTip,
} from './jobs.js';
import { applyJobResult } from './results.js';
import { ensureCityState } from '../cityState.js';

describe('iş üretimi', () => {
  it('kimlik gidiş-dönüş; bozuk kimlik null', () => {
    const id = jobId('kurye', 12, 3, 2, '');
    expect(id).toBe('jk_12_3_2');
    expect(parseJobId(id)).toEqual({
      board: 'kurye', day: 12, desk: 3, slot: 2, near: '',
    });
    const t = jobId('taksi', 5, 0, 1, nearKey(-310, 240));
    expect(parseJobId(t).board).toBe('taksi');
    expect(parseJobId(t).near).toBe(nearKey(-310, 240));
    ['', null, 'x', 'jk_a_b_c', 'jk_1_2_9', 'jz_1_2_1', {}].forEach((b) => expect(parseJobId(b)).toBeNull());
    expect(id.length).toBeLessThanOrEqual(40);
  });

  it('3 teklif: kademeler, mesafe aralıkları, kırılgan yalnız efsane kuryede, belirlenimci', () => {
    const seed = citySeed(2);
    const net = roadNet(seed);
    for (let day = 0; day < 3; day++) {
      for (let desk = 0; desk < 7; desk++) {
        const a = genJobs(seed, net, 'kurye', day, desk);
        const b = genJobs(seed, net, 'kurye', day, desk);
        expect(a).toHaveLength(3);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        a.forEach((j, slot) => {
          expect(j.slot).toBe(slot);
          expect(j.id).toBe(jobId('kurye', day, desk, slot, ''));
          expect(['kurye', 'tamir', 'pod']).toContain(j.kind);
          expect(Number.isFinite(j.dist + j.route + j.base)).toBe(true);
          expect(j.route).toBeGreaterThan(0);
          expect(j.base).toBeGreaterThan(0);
          if (j.kind === 'kurye') {
            const t = TIERS[slot];
            expect(j.tier).toBe(t.key);
            expect(j.fragile).toBe(t.fragile);
          } else expect(j.fragile).toBe(false);
          if (j.kind === 'pod') expect(j.stops).toHaveLength(3);
          expect(j.from.x).not.toBeNaN();
        });
      }
    }
    // gün değişince teklifler değişir (panoda yenileme)
    const d0 = genJobs(seed, net, 'kurye', 0, 0).map((j) => j.name + j.to.x).join();
    const d1 = genJobs(seed, net, 'kurye', 7, 0).map((j) => j.name + j.to.x).join();
    expect(d0).not.toBe(d1);
  });

  it('200 tohum × masa: her yuva üretilir; rota vardır; çaylak ≈150–300 m, usta ≈300–700 m, efsane ≈700–1400 m (esnetme dahil)', () => {
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const seed = citySeed(i);
      const net = roadNet(seed);
      const desk = i % 7;
      const jobs = genJobs(seed, net, 'kurye', i % 5, desk);
      expect(jobs).toHaveLength(3);
      jobs.forEach((j) => {
        n++;
        expect(j.route).toBeGreaterThan(0);
        expect(Number.isFinite(j.dist)).toBe(true);
        if (j.kind === 'kurye') {
          const t = TIERS.find((q) => q.key === j.tier);
          // yedek yol (gevşetme) en çok tier.max·1.6'ya izin verir
          expect(j.dist).toBeGreaterThanOrEqual(Math.min(t.min, 60) - 1);
          expect(j.dist).toBeLessThanOrEqual(t.max * 1.6 + 1);
        }
      });
    }
    expect(n).toBe(600);
  }, 120000);

  it('taksi teklifleri yakın duraktan türer; yolcu adı listede; yolcu işi yayayla yapılmaz', () => {
    const seed = citySeed(3);
    const net = roadNet(seed);
    const near = { x: 120, z: -80 };
    const a = genJobs(seed, net, 'taksi', 2, 0, near);
    expect(a).toHaveLength(3);
    a.forEach((j) => {
      expect(j.kind).toBe('taksi');
      expect(j.passenger).toBe(true);
      expect(canWalk(j)).toBe(false);
      expect(PASSENGERS.some((p) => j.name === 'Yolcu: ' + p)).toBe(true);
      expect(Math.hypot(j.from.x - near.x, j.from.z - near.z)).toBeLessThanOrEqual(260 + 120 * 2 + 1);
    });
    expect(parseJobId(a[0].id).near).toBe(nearKey(near.x, near.z));
  });

  it('süre sınırı: araçla routeLen/(0,55·azami)+25; yayayla ≥1,6×; tamir süresiz', () => {
    const seed = citySeed(1);
    const net = roadNet(seed);
    const jobs = genJobs(seed, net, 'kurye', 0, 0);
    const j = jobs.find((q) => q.kind === 'kurye');
    VEHICLE_CLASSES.forEach((c) => expect(jobLimitFor(j, c)).toBe(Math.ceil(jobLimit(j.route, c))));
    expect(jobLimitFor(j, null)).toBeGreaterThanOrEqual(Math.ceil(jobLimit(j.route, 'taksi') * 1.6));
    const fix = Object.assign({}, j, { kind: 'tamir' });
    expect(jobLimitFor(fix, null)).toBe(0);
    expect(canWalk(fix)).toBe(true);
    expect(canWalk(Object.assign({}, j, { tier: 'usta' }))).toBe(false);
  });
});

describe('ödül formülü ve tekrar bozunumu', () => {
  const job = (kind, tier, dist) => {
    const j = { kind, tier, dist };
    j.base = baseReward(j);
    return j;
  };

  it('taban: (20 + 0,12·mesafe + {0,40,110}); kapsül ×1,6', () => {
    expect(baseReward(job('kurye', 'caylak', 200))).toBe(44);
    expect(baseReward(job('kurye', 'usta', 500))).toBe(120);
    expect(baseReward(job('kurye', 'efsane', 1000))).toBe(250);
    expect(baseReward(job('pod', 'usta', 500))).toBe(Math.round(120 * 1.6));
  });

  it('hız çarpanı clamp(0,5+0,5·kalan/limit, 0,6, 1): erken biten tam, son saniye 0,75, süre dışı 0,6', () => {
    const j = job('kurye', 'usta', 500);
    expect(jobReward(j, 100, 100, 1).kredi).toBe(j.base);
    expect(jobReward(j, 50, 100, 1).kredi).toBe(Math.round(j.base * 0.75));
    expect(jobReward(j, 0, 100, 1).kredi).toBe(Math.round(j.base * 0.6));
    expect(jobReward(j, 0, 0, 1).kredi).toBe(j.base); // süresiz iş
    expect(jobReward(job('tamir', 'caylak', 150), 5, 0, 1).items).toEqual([{ item: 'item:bakır_tel', n: 2 }]);
    expect(jobReward(job('kurye', 'caylak', 150), 5, 0, 1).items).toEqual([]);
  });

  it('tekrar bozunumu: son 10 dk içindeki iş başına −%15, taban 0,4; eski işler sayılmaz', () => {
    expect(repeatDecay([], 1000)).toBe(1);
    expect(repeatDecay([990], 1000)).toBeCloseTo(0.85, 6);
    expect(repeatDecay([990, 995], 1000)).toBeCloseTo(0.7, 6);
    expect(repeatDecay([1, 2, 3, 4, 5, 6, 7, 8], 1000)).toBe(1);
    expect(repeatDecay([990, 991, 992, 993, 994, 995, 996, 997], 1000)).toBe(0.4);
    expect(repeatDecay([400], 1000)).toBeCloseTo(0.85, 6);
    expect(repeatDecay([399], 1000)).toBe(1);
    const log = [];
    for (let i = 0; i < 20; i++) pushLog(log, 100 + i);
    expect(log.length).toBe(8);
    expect(log[7]).toBe(119);
  });

  it('taksi bahşişi konforla azalır; applyJobResult sayaçları ve bozunumu işler', () => {
    expect(taxiTip(100, 0)).toBe(25);
    expect(taxiTip(100, 2)).toBe(13);
    expect(taxiTip(100, 9)).toBe(0);
    const city = ensureCityState({});
    const j = job('kurye', 'usta', 500);
    const r1 = applyJobResult(city, j, { t: 50, limit: 100, bumps: 0, nowSec: 1000 });
    const r2 = applyJobResult(city, j, { t: 50, limit: 100, bumps: 0, nowSec: 1010 });
    expect(r2.kredi).toBeLessThan(r1.kredi);
    expect(r2.decay).toBeCloseTo(0.85, 6);
    expect(city.stats.jobsDone).toBe(2);
    expect(city.stats.courierDone).toBe(2);
    expect(city.jobs.done).toBe(2);
    expect(city.jobs.earned).toBe(r1.kredi + r2.kredi);
    const r3 = applyJobResult(city, job('taksi', 'caylak', 200), { t: 10, limit: 100, bumps: 1, nowSec: 1020 });
    expect(city.stats.taxiDone).toBe(1);
    expect(r3.fast).toBe(true);
    expect(city.stats.fastJobs).toBe(1);
  });
});

describe('iş → koşucu tanımı', () => {
  it('her tür için geçerli tanım; kurye A→B; kapsül 3 durak; taksi dur-bırak; yeniden üretimden aynı tanım', () => {
    const seed = citySeed(4);
    const net = roadNet(seed);
    const all = genJobs(seed, net, 'kurye', 1, 1).concat(genJobs(seed, net, 'taksi', 1, 1, { x: 50, z: 50 }));
    all.forEach((j) => {
      const d = jobRunDef(j, 'taksi');
      expect(validateDef(d)).toBeNull();
      expect(d.noTeleport).toBe(true);
      expect(d.steps.length).toBe(j.kind === 'pod' ? 4 : 2);
      expect(d.steps[0].x).toBe(j.from.x);
      expect(d.steps[d.steps.length - 1].x).toBe(j.kind === 'pod' ? j.stops[2].x : j.to.x);
      expect(d.steps.every((s) => s.r >= 3)).toBe(true);
      expect(JSON.stringify(jobRunDef(j, 'taksi'))).toBe(JSON.stringify(d));
      if (j.kind === 'taksi') {
        expect(d.steps[0].maxSpeed).toBeGreaterThan(0);
        expect(d.steps[0].mode).toBe('vehicle');
      }
    });
  });

  it('A ve B kapı önlerine sırayla varan oyuncu işi bitirir; minTime (mesafe/60) altında bitiş geçersiz; ışınlanma iptal eder', () => {
    const seed = citySeed(5);
    const net = roadNet(seed);
    const j = genJobs(seed, net, 'kurye', 0, 2)[0];
    const d = jobRunDef(j, null);
    expect(d.minTime).toBe(Math.floor(j.dist / 60));
    const a = { x: j.from.x, y: 64, z: j.from.z, speed: 1, cls: null };
    const b = { x: j.to.x, y: 64, z: j.to.z, speed: 1, cls: null };
    // ışık hızı: A'dan B'ye tek adımda sıçrama → noTeleport iptali
    const tp = createRun(d);
    tp.start();
    tp.update(1 / 60, a);
    tp.update(1 / 60, b);
    expect(tp.status).toBe(RUN_STATUS.CANCELLED);
    expect(tp.reason).toBe('ışınlanma');
    // ışınlanma denetimi kapalıyken en kısa süre kuralı
    const cheat = createRun(Object.assign({}, d, { noTeleport: false, minTime: 30 }));
    cheat.start();
    cheat.update(1 / 60, a);
    cheat.update(1 / 60, b);
    expect(cheat.status).toBe(RUN_STATUS.FAILED);
    expect(cheat.reason).toBe('sure_gecersiz');
    // dürüst akış: yeterli süre sonra varış
    const ok = createRun(Object.assign({}, d, { noTeleport: false }));
    ok.start();
    ok.update(1 / 60, a);
    expect(ok.step).toBe(1);
    ok.t = d.minTime + 1;
    ok.update(1 / 60, b);
    expect(ok.status).toBe(RUN_STATUS.DONE);
    expect(DOOR_R).toBeGreaterThanOrEqual(6);
  });
});

describe('POI beslemesi', () => {
  it('kurye masası sayısı 7, kapı >700 (üretim girdileri)', () => {
    const seed = citySeed(0);
    const p = pois(seed);
    expect(p.filter((q) => q.type === 'courier_desk')).toHaveLength(7);
    expect(p.filter((q) => q.type === 'door').length).toBeGreaterThan(700);
    expect(getCityPlan(seed).races).toHaveLength(8);
  });
});
