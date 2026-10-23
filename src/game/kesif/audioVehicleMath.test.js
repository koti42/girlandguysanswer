import { describe, expect, it } from 'vitest';
import {
  HORN_COUNT, INDICATOR_HZ, NODE_CAP_BY_TIER, TRAFFIC_MAX_DIST, bumpMix, createIndicator, dopplerRatio, doorSpec, engineFreq, engineLoad, engineMix,
  engineSpec, hornSpec, ignitionSpec, isElectric, landMix, nitroLevel, panOf, pickNearest, scrapeMix, skidMix, tierPlan, trafficFreq, trafficGain,
  windMix, wetHiss,
} from './audioVehicleMath.js';
import { listenerBasis } from './audioMix.js';
import { VEHICLE_CLASSES } from './sim/city/vehicle/vehicleData.js';
import { mulberry32 } from './sim/rng.js';

const finite = (o) => Object.keys(o).every((k) => typeof o[k] !== 'number' || Number.isFinite(o[k]));

describe('tierPlan', () => {
  it('kademe tavanları 24/18/12', () => {
    expect(NODE_CAP_BY_TIER).toEqual({ low: 12, medium: 18, high: 24 });
  });

  it('oyuncu + trafik*2 + tek atımlık ≤ tavan (0..60)', () => {
    for (let cap = 0; cap <= 60; cap++) {
      const p = tierPlan(cap);
      expect(p.playerSources + p.traffic * 2 + p.oneShot).toBeLessThanOrEqual(cap > p.playerSources ? cap : p.playerSources + p.traffic * 2 + p.oneShot);
      if (cap >= 8) expect(p.playerSources + p.traffic * 2 + p.oneShot).toBe(cap);
    }
  });

  it('yüksek: turbo + kare + kahverengi + 3 trafik; düşük: yalnız testere+gürültü + 1 trafik', () => {
    const h = tierPlan(24);
    expect(h.player).toEqual({ sq: true, turbo: true, brown: true });
    expect(h.traffic).toBe(3);
    expect(h.oneShot).toBeGreaterThanOrEqual(8);
    const l = tierPlan(12);
    expect(l.player.sq).toBe(false);
    expect(l.player.turbo).toBe(false);
    expect(l.traffic).toBe(1);
    expect(l.oneShot).toBeGreaterThanOrEqual(6);
  });

  it('geçersiz giriş güvenli', () => {
    [NaN, -3, undefined, Infinity, 'x'].forEach((c) => {
      const p = tierPlan(c);
      expect(Number.isFinite(p.cap) && p.cap >= 0).toBe(true);
      expect(Number.isFinite(p.oneShot) && p.oneShot >= 0).toBe(true);
    });
  });
});

describe('motor frekansı', () => {
  it('rpm → frekans SIKI tekdüze artan (her sınıf, 0..1, 401 nokta)', () => {
    VEHICLE_CLASSES.forEach((cls) => {
      let prev = -Infinity;
      for (let i = 0; i <= 400; i++) {
        const f = engineFreq(cls, i / 400);
        expect(f).toBeGreaterThan(prev);
        prev = f;
      }
    });
  });

  it('bant sınırları ve sınıf sıralaması: kamyonet < taksi < spor < motor < hover', () => {
    const lo = (c) => engineFreq(c, 0);
    expect(lo('kamyonet')).toBeLessThan(lo('taksi'));
    expect(lo('taksi')).toBeLessThan(lo('spor'));
    expect(lo('spor')).toBeLessThan(lo('motor'));
    expect(lo('motor')).toBeLessThan(lo('hoverbike'));
    VEHICLE_CLASSES.forEach((c) => {
      expect(engineFreq(c, 1)).toBeGreaterThan(engineFreq(c, 0) * 2);
      expect(engineFreq(c, 1)).toBeLessThan(1200);
      expect(engineFreq(c, 0)).toBeGreaterThan(25);
    });
  });

  it('rpm aralık dışı / NaN → sınırlanır ve sonlu', () => {
    VEHICLE_CLASSES.forEach((c) => {
      expect(engineFreq(c, -5)).toBe(engineFreq(c, 0));
      expect(engineFreq(c, 9)).toBe(engineFreq(c, 1));
      expect(Number.isFinite(engineFreq(c, NaN))).toBe(true);
    });
    expect(Number.isFinite(engineFreq('bilinmeyen', 0.5))).toBe(true);
  });

  it('elektrikli sınıflar: hoverbike, suzulkay', () => {
    expect(isElectric('hoverbike')).toBe(true);
    expect(isElectric('suzulkay')).toBe(true);
    expect(isElectric('taksi')).toBe(false);
    expect(engineSpec('spor').turbo).toBe(1);
  });
});

describe('motor tınısı (yük bağımlı)', () => {
  it('yük artınca parlaklık (lpHz) ve kare dalga artar (içten yanmalı)', () => {
    ['taksi', 'spor', 'kamyonet', 'motor'].forEach((c) => {
      const a = engineMix(c, 0.5, 0.2, 0.05, 0, {});
      const b = engineMix(c, 0.5, 1, 1, 0, {});
      expect(b.lpHz).toBeGreaterThan(a.lpHz);
      expect(b.sqG).toBeGreaterThan(a.sqG);
      expect(b.sawG).toBeGreaterThan(a.sawG);
    });
  });

  it('vites boşalması kazancı düşürür', () => {
    const a = engineMix('taksi', 0.9, 1, 1, 0, {});
    const b = engineMix('taksi', 0.9, 1, 1, 0.05, {});
    expect(b.sawG).toBeLessThan(a.sawG);
    expect(b.sqG).toBeLessThan(a.sqG);
  });

  it('elektrikli: sinüs vızıltısı, testere yok; hız arttıkça vızıltı güçlenir', () => {
    const a = engineMix('hoverbike', 0.2, 0, 0, 0, {});
    const b = engineMix('hoverbike', 0.9, 1, 1, 0, {});
    expect(a.electric).toBe(true);
    expect(a.sawG).toBe(0);
    expect(b.humG).toBeGreaterThan(a.humG);
    expect(b.humF).toBeGreaterThan(a.humF);
  });

  it('turbo yalnız turbolu sınıflarda ve gazla', () => {
    expect(engineMix('spor', 0.9, 1, 1, 0, {}).turboG).toBeGreaterThan(0);
    expect(engineMix('spor', 0.9, 0, 0, 0, {}).turboG).toBe(0);
    expect(engineMix('taksi', 0.9, 1, 1, 0, {}).turboG).toBe(0);
  });

  it('fuzz: tüm çıktılar sonlu', () => {
    const r = mulberry32(7);
    const vals = [NaN, Infinity, -Infinity, -1, 0, 0.5, 1, 7, undefined, null, 'x'];
    for (let i = 0; i < 2000; i++) {
      const pick = () => (r() < 0.5 ? vals[Math.floor(r() * vals.length)] : r() * 3 - 1);
      const c = VEHICLE_CLASSES[Math.floor(r() * VEHICLE_CLASSES.length)];
      expect(finite(engineMix(c, pick(), pick(), pick(), pick(), {}))).toBe(true);
      expect(finite(skidMix(pick(), pick(), c, {}))).toBe(true);
      expect(finite(wetHiss(pick(), pick(), pick(), {}))).toBe(true);
      expect(finite(windMix(pick(), pick(), r() < 0.5, {}))).toBe(true);
      expect(Number.isFinite(nitroLevel(r() < 0.5, pick(), pick()))).toBe(true);
      expect(finite(bumpMix(pick(), r() < 0.5))).toBe(true);
      expect(finite(scrapeMix(pick()))).toBe(true);
      expect(finite(landMix(pick()))).toBe(true);
    }
  });

  it('engineLoad: gaz + ivme, 0..1, null güvenli', () => {
    expect(engineLoad(null)).toBe(0);
    expect(engineLoad({ throttle: 1, aLong: 10, def: { accel: 10 } })).toBe(1);
    expect(engineLoad({ throttle: 0, aLong: 0, def: { accel: 10 } })).toBe(0);
    expect(engineLoad({ throttle: NaN, aLong: NaN, def: { accel: 10 } })).toBe(0);
    expect(engineLoad({ throttle: 0.5, aLong: 5, def: { accel: 10 } })).toBeCloseTo(0.5, 5);
  });
});

describe('kayma, ıslak yol, rüzgâr, nitro', () => {
  it('kayma: sürtünme arttıkça ve hız arttıkça kazanç artar; durağan araçta sessiz', () => {
    expect(skidMix(1, 20, 'taksi', {}).gain).toBeGreaterThan(skidMix(0.3, 20, 'taksi', {}).gain);
    expect(skidMix(1, 20, 'taksi', {}).gain).toBeGreaterThan(skidMix(1, 3, 'taksi', {}).gain);
    expect(skidMix(1, 0, 'taksi', {}).gain).toBe(0);
    expect(skidMix(0, 30, 'taksi', {}).gain).toBe(0);
  });

  it('ıslak yol tıslaması yalnız ıslakta ve hareketteyken', () => {
    expect(wetHiss(0, 30, 40, {}).gain).toBe(0);
    expect(wetHiss(1, 0, 40, {}).gain).toBe(0);
    expect(wetHiss(1, 30, 40, {}).gain).toBeGreaterThan(wetHiss(0.4, 30, 40, {}).gain);
    expect(wetHiss(1, 30, 40, {}).gain).toBeGreaterThan(wetHiss(1, 8, 40, {}).gain);
  });

  it('rüzgâr hızla artar; hover daha yüksek', () => {
    let prev = -1;
    for (let s = 0; s <= 40; s += 4) {
      const g = windMix(s, 40, false, {}).gain;
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
    expect(windMix(30, 40, true, {}).gain).toBeGreaterThan(windMix(30, 40, false, {}).gain);
  });

  it('nitro kapalıyken 0', () => {
    expect(nitroLevel(false, 30, 40)).toBe(0);
    expect(nitroLevel(true, 30, 40)).toBeGreaterThan(0);
  });
});

describe('tek atımlık sesler', () => {
  it('çarpma şiddetle büyür, yumuşak çarpma sessizleşir', () => {
    const a = bumpMix(4, false);
    const b = bumpMix(16, false);
    const s = bumpMix(16, true);
    expect(b.thumpG).toBeGreaterThan(a.thumpG);
    expect(b.dur).toBeGreaterThan(a.dur);
    expect(s.thumpG).toBeLessThan(b.thumpG);
    expect(b.thumpG).toBeLessThan(0.7);
  });

  it('korna 4 varyant: yumuşak (sinüs/üçgen), düşük kazanç, kısa', () => {
    expect(HORN_COUNT).toBe(4);
    for (let i = 0; i < HORN_COUNT; i++) {
      const h = hornSpec(i);
      expect(['sine', 'triangle']).toContain(h.type);
      expect(h.gain).toBeLessThanOrEqual(0.2);
      expect(h.count * (h.dur + h.gap)).toBeLessThan(0.6);
      expect(h.a).toBeGreaterThan(250);
      expect(h.a).toBeLessThan(700);
      expect(h.b).toBeLessThan(700);
    }
    expect(hornSpec(-3)).toBe(hornSpec(0));
    expect(hornSpec(99)).toBe(hornSpec(0));
    expect(hornSpec(NaN)).toBe(hornSpec(0));
  });

  it('kapı ve kontak tanımları sonlu; elektrikli güç yükselmesi, içten yanmalı marş', () => {
    expect(finite(doorSpec(true))).toBe(true);
    expect(finite(doorSpec(false))).toBe(true);
    expect(ignitionSpec('taksi').kind).toBe('crank');
    expect(ignitionSpec('hoverbike').kind).toBe('power');
    VEHICLE_CLASSES.forEach((c) => expect(finite(ignitionSpec(c))).toBe(true));
  });
});

describe('sinyal / dörtlü tıkı', () => {
  function simulate(secs, steerFn, speed, hazardFn) {
    const ind = createIndicator();
    const dt = 1 / 60;
    let ticks = 0;
    const times = [];
    let side = 0;
    for (let i = 0; i < secs * 60; i++) {
      const t = i * dt;
      const o = ind.update(dt, steerFn(t), speed, hazardFn ? hazardFn(t) : false);
      if (o.tick) {
        ticks++;
        times.push(t);
      }
      side = o.side;
    }
    return { ticks, times, side };
  }

  it('düz giderken sessiz', () => {
    expect(simulate(5, () => 0, 10).ticks).toBe(0);
  });

  it('yalnız kısa dönüş: sinyal tutulmaz', () => {
    expect(simulate(3, (t) => (t < 0.3 ? 0.8 : 0), 8).ticks).toBe(0);
  });

  it('uzun dönüş: sinyal başlar, düzelince ~0,8 sn sonra söner; tık hızı ≤ 3/sn', () => {
    const r = simulate(8, (t) => (t < 3 ? 0.8 : 0), 8);
    expect(r.ticks).toBeGreaterThan(3);
    expect(r.times[r.times.length - 1]).toBeLessThan(5.2);
    const secs = r.times[r.times.length - 1] - r.times[0];
    expect((r.ticks - 1) / secs).toBeLessThanOrEqual(3.01);
    expect(r.side).toBe(0);
    expect(INDICATOR_HZ * 2).toBeLessThanOrEqual(3);
  });

  it('hızlıyken (>14 m/s) sinyal yok; dörtlü her zaman çalışır', () => {
    expect(simulate(4, () => 0.8, 25).ticks).toBe(0);
    const hz = simulate(4, () => 0, 25, () => true);
    expect(hz.ticks).toBeGreaterThan(8);
    expect(hz.side).toBe(2);
  });

  it('NaN girdi güvenli', () => {
    const ind = createIndicator();
    const o = ind.update(NaN, NaN, NaN, false);
    expect(o.tick).toBe(false);
  });
});

describe('trafik uzamsal', () => {
  it('mesafe kazancı tekdüze azalan, ≥ 70 m = 0, yakın = güçlü', () => {
    let prev = Infinity;
    for (let d = 0; d <= TRAFFIC_MAX_DIST; d += 1) {
      const g = trafficGain(d);
      expect(g).toBeLessThanOrEqual(prev + 1e-12);
      prev = g;
    }
    expect(trafficGain(TRAFFIC_MAX_DIST)).toBe(0);
    expect(trafficGain(500)).toBe(0);
    expect(trafficGain(2)).toBeGreaterThan(trafficGain(30) * 2);
    expect(Number.isFinite(trafficGain(NaN))).toBe(true);
  });

  it('frekans hızla SIKI artar; kimlik bazlı farklı taban', () => {
    for (let s = 0; s < 40; s += 2) expect(trafficFreq(5, s + 2)).toBeGreaterThan(trafficFreq(5, s));
    const bases = new Set();
    for (let id = 0; id < 40; id++) bases.add(trafficFreq(id, 0));
    expect(bases.size).toBeGreaterThan(10);
  });

  it('Doppler: yaklaşırken >1, uzaklaşırken <1, sınırlı', () => {
    expect(dopplerRatio(0)).toBe(1);
    expect(dopplerRatio(30)).toBeGreaterThan(1);
    expect(dopplerRatio(-30)).toBeLessThan(1);
    expect(dopplerRatio(1e6)).toBeLessThanOrEqual(1.14);
    expect(dopplerRatio(-1e6)).toBeGreaterThanOrEqual(0.88);
    expect(dopplerRatio(NaN)).toBe(1);
  });

  it('pan: sağdaki araç + , soldaki −, önde ~0', () => {
    const b = listenerBasis(0, null); // −Z'ye bakar, sağ = +X
    expect(panOf(b, 0, 0, 20, 0)).toBeGreaterThan(0.9);
    expect(panOf(b, 0, 0, -20, 0)).toBeLessThan(-0.9);
    expect(Math.abs(panOf(b, 0, 0, 0, -20))).toBeLessThan(1e-9);
    expect(panOf(b, 0, 0, 0.1, 0)).toBe(0);
  });

  it('pickNearest: en yakın N, menzil dışı elenir, histerezis önceki atamayı korur', () => {
    const list = [];
    for (let i = 0; i < 12; i++) list.push({ id: 100 + i, x: i * 6, z: 0 });
    list.push({ id: 999, x: 500, z: 0 });
    const out = [];
    let k = pickNearest(list, list.length, 3, 0, 0, TRAFFIC_MAX_DIST, null, out);
    expect(k).toBe(3);
    expect(out.slice(0, 3).map((i) => list[i].id)).toEqual([100, 101, 102]);
    expect(out.map((i) => list[i].id)).not.toContain(999);
    // 103, 102'den biraz yakın olsa bile önceki (102) top count+1 içinde olduğundan tutulur
    list[3].x = 11.9;
    list[2].x = 12;
    k = pickNearest(list, list.length, 3, 0, 0, TRAFFIC_MAX_DIST, [100, 101, 102], out);
    expect(k).toBe(3);
    expect(out.slice(0, 3).map((i) => list[i].id)).toEqual([100, 101, 102]);
    // boş/NaN
    expect(pickNearest([], 0, 3, 0, 0, 70, null, out)).toBe(0);
    expect(pickNearest([{ id: 1, x: NaN, z: NaN }], 1, 3, 0, 0, 70, null, out)).toBe(0);
  });

  it('pickNearest: rastgele listelerde sayı ≤ N ve tekrar yok', () => {
    const r = mulberry32(99);
    const out = [];
    for (let rep = 0; rep < 200; rep++) {
      const n = Math.floor(r() * 40);
      const list = [];
      for (let i = 0; i < n; i++) list.push({ id: i, x: (r() - 0.5) * 200, z: (r() - 0.5) * 200 });
      const count = 1 + Math.floor(r() * 3);
      const k = pickNearest(list, n, count, 0, 0, TRAFFIC_MAX_DIST, rep % 2 ? [3, 4, 5] : null, out);
      expect(k).toBeLessThanOrEqual(count);
      const idx = out.slice(0, k);
      expect(new Set(idx).size).toBe(k);
    }
  });
});
