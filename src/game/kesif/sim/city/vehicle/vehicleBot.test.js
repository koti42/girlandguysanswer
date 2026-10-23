import { describe, expect, it } from 'vitest';
import { World } from '../../world.js';
import { dimSeed } from '../../dim/dimensions.js';
import { createPropLayer, attachPropLayer } from '../../props/propLayer.js';
import { mulberry32 } from '../../rng.js';
import { getCityPlan } from '../cityPlan.js';
import { roadNet } from '../roadNet.js';
import { VEHICLE_CLASSES, VEHICLE_DEFS } from './vehicleData.js';
import {
  BRONZE_K, GOLD_K, SILVER_K, botJob, botRace, cornerSpeed, goldTimes, jobLimit, jobRoute, laneOffsetPath, nodePath, planSpeeds, raceRoute, runBot,
} from './vehicleBot.js';

/*
 * Betikli sürücü: Faz 4 görev tasarımcıları yarış madalya sürelerini ve kurye sürelerini buna dayandırır.
 * Sözleşme §11: altın = 1,08 × betikli sürücü süresi; gümüş ×1,12; bronz ×1,25; < 0,8×altın reddedilir.
 */
function makeWorld(seedIn) {
  const seed = dimSeed(seedIn, 'neon');
  const world = new World({ seed, mode: 'macera', dim: 'neon' });
  attachPropLayer(world, createPropLayer({ citySeed: seed }));
  return {
    seed, world, plan: getCityPlan(seed), net: roadNet(seed),
  };
}

describe('vehicleBot: saf yardımcılar', () => {
  it('goldTimes: 1,08 / 1,12 / 1,25 (0,1 sn yuvarlama); NaN güvenli', () => {
    const g = goldTimes(100);
    expect(g).toEqual({ gold: 108, silver: 112, bronze: 125 });
    expect(GOLD_K).toBe(1.08);
    expect(SILVER_K).toBe(1.12);
    expect(BRONZE_K).toBe(1.25);
    expect(goldTimes(NaN)).toEqual({ gold: 0, silver: 0, bronze: 0 });
    expect(goldTimes(33.33).gold).toBeCloseTo(36, 0);
  });

  it('jobLimit: routeLen/(0,55·azami hız)+25', () => {
    expect(jobLimit(0, 'taksi')).toBe(25);
    expect(jobLimit(1000, 'taksi')).toBeCloseTo(1000 / (0.55 * 28) + 25, 9);
    VEHICLE_CLASSES.forEach((c) => expect(jobLimit(500, c)).toBeGreaterThan(25));
  });

  it('cornerSpeed: yarıçapla monoton artar, azami hızı aşmaz, sınıf başına makul', () => {
    VEHICLE_CLASSES.forEach((c) => {
      const d = VEHICLE_DEFS[c];
      let prev = 0;
      for (let R = 4; R <= 200; R += 4) {
        const v = cornerSpeed(d, R);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(v).toBeLessThanOrEqual(d.max + 0.5);
        prev = v;
      }
      expect(cornerSpeed(d, 6)).toBeLessThan(cornerSpeed(d, 60) + 1e-9);
    });
  });

  it('laneOffsetPath: düz çizgide sağ şerit 1,7 m, sağ köşe yayı köşe kapısına ≤ 5,8 m yaklaşır, adım ≈ 2 m', () => {
    // ileri −Z: sağ = +X; kuzeye (−z) giden doğru
    const straight = laneOffsetPath([[0, 64, 0], [0, 64, -100]], 1.7);
    expect(straight[0][0]).toBeCloseTo(1.7, 9);
    expect(straight[straight.length - 1][0]).toBeCloseTo(1.7, 9);
    for (let i = 1; i < straight.length - 1; i++) {
      const d = Math.hypot(straight[i][0] - straight[i - 1][0], straight[i][2] - straight[i - 1][2]);
      expect(d).toBeGreaterThan(1.9);
      expect(d).toBeLessThan(2.1);
    }
    // sağa 90° dönüş: (0,0) kuzeye giderken (0,-100) köşesinden doğuya (+x)
    const right = laneOffsetPath([[0, 64, 0], [0, 64, -100], [100, 64, -100]], 1.7);
    let dMin = 1e9;
    right.forEach((p) => { dMin = Math.min(dMin, Math.hypot(p[0], p[2] + 100)); });
    expect(dMin).toBeLessThan(5.8);
    // sola 90°: yay dışa açılır ama köşeye uzaklık da ≤ 7
    const left = laneOffsetPath([[0, 64, 0], [0, 64, -100], [-100, 64, -100]], 1.7);
    let dMinL = 1e9;
    left.forEach((p) => { dMinL = Math.min(dMinL, Math.hypot(p[0], p[2] + 100)); });
    expect(dMinL).toBeLessThan(7);
    expect(laneOffsetPath([[0, 64, 0]], 1.7)).toBeNull();
    expect(laneOffsetPath([[0, 64, 0], [0, 64, 0]], 1.7)).toBeNull();
  });

  it('planSpeeds: fren mesafesi tutarlı (v[i]² ≤ v[i+1]² + 2·fren·ds), köşelerde yavaşlar, düzde azami', () => {
    const d = VEHICLE_DEFS.taksi;
    const path = laneOffsetPath([[0, 64, 0], [0, 64, -300], [300, 64, -300], [300, 64, -600]], 1.7);
    const p = planSpeeds(path, d, {});
    const dec = d.brake * 0.5;
    let minV = 1e9;
    for (let i = 0; i < path.length - 1; i++) {
      const ds = p.s[i + 1] - p.s[i];
      expect(p.v[i] * p.v[i]).toBeLessThanOrEqual(p.v[i + 1] * p.v[i + 1] + 2 * dec * ds + 1e-6);
      minV = Math.min(minV, p.v[i]);
      expect(p.v[i]).toBeLessThanOrEqual(d.max + 1e-9);
    }
    expect(minV).toBeLessThan(10);
    expect(p.v[0]).toBeGreaterThan(d.max * 0.9);
  });

  it('bilinmeyen sınıf fırlatır; boş yol kurulamaz', () => {
    expect(() => runBot(null, 'ucak', [[0, 64, 0], [0, 64, -10]], {})).toThrow();
  });
});

describe('vehicleBot: yarış matrisi (8 yarış × 6 sınıf, tohum 777)', () => {
  const { net, plan, world } = makeWorld(777);
  const GOLD_MIN_RATIO = 0.8; // sözleşme: altının %80'inden hızlı süre reddedilir

  plan.races.forEach((race) => {
    it(race.key + ': her sınıf tüm kapıları sırayla, çarpmasız ve ışınlanmasız bitirir; uzman (nitro) altından hızlı ama reddedilmez', () => {
      const rows = {};
      VEHICLE_CLASSES.forEach((cls) => {
        const r = botRace(world, net, race, cls, {});
        expect(r, cls).not.toBeNull();
        expect(r.done, cls + ' ' + r.failed).toBe(true);
        expect(r.gates.passed, cls).toBe(r.gates.total);
        expect(r.gates.total, cls).toBe(race.laps * (race.closed ? race.gates.length : race.gates.length - 1));
        expect(r.stats.bumps, cls).toBe(0);
        expect(r.stats.scrapes, cls).toBe(0);
        expect(r.stats.resets, cls).toBe(0);
        expect(r.stats.unsticks, cls).toBe(0);
        expect(r.stats.water, cls).toBe(0);
        expect(r.stats.stuck, cls).toBe(0);
        // makul ortalama hız: azami hızın %45'i ile %100'ü arası
        const avg = r.length / r.time;
        expect(avg, cls).toBeGreaterThan(VEHICLE_DEFS[cls].max * 0.45);
        expect(avg, cls).toBeLessThanOrEqual(VEHICLE_DEFS[cls].max);
        const t = goldTimes(r.time);
        expect(r.times).toEqual(t);
        expect(t.gold).toBeGreaterThan(r.time);
        expect(t.gold).toBeLessThan(t.silver);
        expect(t.silver).toBeLessThan(t.bronze);
        rows[cls] = r.time;
      });
      // uzman: nitro ile en az bir sınıfta betikliden hızlı, hiçbirinde altının %80'inden hızlı değil
      ['taksi', 'spor', 'motor'].forEach((cls) => {
        const e = botRace(world, net, race, cls, { nitro: true });
        expect(e.done, 'uzman ' + cls).toBe(true);
        expect(e.stats.bumps, 'uzman ' + cls).toBe(0);
        const gold = rows[cls] * GOLD_K;
        expect(e.time, 'uzman ' + cls).toBeLessThan(gold);
        expect(e.time, 'uzman ' + cls).toBeGreaterThan(gold * GOLD_MIN_RATIO);
      });
    }, 120000);
  });

  it('belirlenimci: aynı girdi aynı süre (bayt-aynı)', () => {
    const race = plan.races[6];
    const a = botRace(world, net, race, 'taksi', {});
    const b = botRace(world, net, race, 'taksi', {});
    expect(b.steps).toBe(a.steps);
    expect(b.pose).toEqual(a.pose);
    expect(b.stats).toEqual(a.stats);
  });

  it('özensiz oyuncu (%92 hız, 0,8 m kayık, geç direksiyon) bronzdan hızlı bitirir ve yarışı tamamlar: altın ulaşılabilir ama kolay değil', () => {
    ['kanal', 'tepe', 'merkez'].forEach((key) => {
      const race = plan.races.find((r) => r.key === key);
      const base = botRace(world, net, race, 'taksi', {});
      const sloppy = botRace(world, net, race, 'taksi', { pace: 0.92, startOffset: 0.8, look: 1.35 });
      expect(sloppy.done, key + ' ' + sloppy.failed).toBe(true);
      expect(sloppy.time, key).toBeLessThan(base.time * BRONZE_K);
      expect(sloppy.time, key).toBeGreaterThan(base.time * 0.99); // betiklinin üstünde: altın hâlâ beceri ister
    });
  }, 120000);

  it('geçersiz yol: raceRoute kenarı olmayan düğüm dizisi için null', () => {
    const fake = Object.assign({}, plan.races[0], { nodes: [plan.races[0].nodes[0], plan.races[0].nodes[5]] });
    expect(raceRoute(net, fake, {})).toBeNull();
    expect(nodePath(net, [999999, 999998], false)).toBeNull();
  });
});

describe('vehicleBot: tohumlar arası (yarış kümesi)', () => {
  [31337, 5].forEach((sd) => {
    it('tohum ' + sd + ': tüm yarışlar × taksi/spor/hoverbike tamamlanır, çarpma/ışınlanma yok', () => {
      const w = makeWorld(sd);
      w.plan.races.forEach((race) => {
        ['taksi', 'spor', 'hoverbike'].forEach((cls) => {
          const r = botRace(w.world, w.net, race, cls, {});
          expect(r.done, race.key + ' ' + cls + ' ' + r.failed).toBe(true);
          expect(r.stats.bumps + r.stats.resets + r.stats.unsticks + r.stats.water, race.key + ' ' + cls).toBe(0);
        });
      });
    }, 240000);
  });
});

describe('vehicleBot: kurye rotaları (süre sınırı içinde)', () => {
  const { net, world } = makeWorld(777);
  const nodeIds = [];
  net.nodes.forEach((n) => { if (n) nodeIds.push(n.id); });

  function pairs(seed, n) {
    const rnd = mulberry32(seed);
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 4000) {
      const a = net.nodes[nodeIds[Math.floor(rnd() * nodeIds.length)]];
      const b = net.nodes[nodeIds[Math.floor(rnd() * nodeIds.length)]];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 150 || d > 1200) continue;
      if (!net.routeNodes(a.id, b.id)) continue;
      out.push([a.id, b.id]);
    }
    return out;
  }

  it('24 rastgele düğüm çifti × 4 tekerlekli sınıf: bot süre sınırı içinde varır (rota ≤ 1,8× kuş uçuşu), çarpma yok', () => {
    const ps = pairs(2024, 24);
    expect(ps.length).toBe(24);
    ['taksi', 'spor', 'kamyonet', 'motor'].forEach((cls) => {
      ps.forEach(([a, b]) => {
        const r = botJob(world, net, a, b, cls, {});
        expect(r, cls + ' ' + a + '→' + b).not.toBeNull();
        expect(r.done, cls + ' ' + a + '→' + b + ' ' + r.failed).toBe(true);
        expect(r.time, cls + ' ' + a + '→' + b).toBeLessThan(r.limit);
        expect(r.stats.bumps + r.stats.resets + r.stats.unsticks + r.stats.water, cls + ' ' + a + '→' + b).toBe(0);
        const na = net.nodes[a];
        const nb = net.nodes[b];
        expect(r.length).toBeLessThanOrEqual(Math.hypot(na.x - nb.x, na.z - nb.z) * 1.8 + 60);
      });
    });
  }, 300000);

  it('hover sınıfları da süre sınırı içinde varır', () => {
    const ps = pairs(7, 8);
    ['hoverbike', 'suzulkay'].forEach((cls) => {
      ps.forEach(([a, b]) => {
        const r = botJob(world, net, a, b, cls, {});
        expect(r.done, cls + ' ' + r.failed).toBe(true);
        expect(r.time, cls).toBeLessThan(r.limit);
      });
    });
  }, 300000);

  it('jobRoute: aynı düğüm veya rotasız → null', () => {
    const a = nodeIds[0];
    expect(jobRoute(net, a, a)).toBeNull();
    expect(jobRoute(net, 999999, a)).toBeNull();
  });
});
