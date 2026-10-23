import { describe, expect, it } from 'vitest';
import { ZONES } from './constants.js';
import {
  BIOME_TEMPERATURE, DEFAULT_DAY_LENGTH, PHASE_NAMES, SKY_LIGHT_MIN, clockPhase, computeSky, createClock,
  createSkyState, createWeather, dayFactor, dayFactorAt, formatClockTime, getPhaseName, hexToRgb, isNight,
  moonDirection, moonIllumination, moonPhase, nightFactorAt, phaseNameAt, precipitation, restoreClock,
  restoreWeather, rgbToHex, serializeClock, serializeWeather, setClockPhase, setWeatherTime, skipToMorning,
  skyLightAt, sunDirection, temperatureFor, updateClock, updateWeather, zoneTintIndex,
} from './daynight.js';

describe('saat', () => {
  it('varsayılanlar: 1200 sn gün, başlangıç fazı', () => {
    const c = createClock();
    expect(c.dayLengthSec).toBe(DEFAULT_DAY_LENGTH);
    expect(DEFAULT_DAY_LENGTH).toBe(1200);
    expect(clockPhase(c)).toBeCloseTo(0.1, 9);
    const d = createClock({ dayLengthSec: 600, startPhase: 0.25 });
    expect(d.dayLengthSec).toBe(600);
    expect(clockPhase(d)).toBeCloseTo(0.25, 9);
    expect(createClock({ dayLengthSec: -5 }).dayLengthSec).toBe(1200);
    expect(clockPhase(createClock({ startPhase: 1.25 }))).toBeCloseTo(0.25, 9);
  });

  it('update: ilerler, gün sınırında sarar ve true döner; donmuşsa durur', () => {
    const c = createClock({ dayLengthSec: 100, startPhase: 0.9 });
    expect(updateClock(c, 5)).toBe(false);
    expect(clockPhase(c)).toBeCloseTo(0.95, 9);
    expect(updateClock(c, 10)).toBe(true);
    expect(c.day).toBe(1);
    expect(clockPhase(c)).toBeCloseTo(0.05, 9);
    expect(updateClock(c, 250)).toBe(true);
    expect(c.day).toBe(3);
    c.frozen = true;
    const t = c.time;
    expect(updateClock(c, 50)).toBe(false);
    expect(c.time).toBe(t);
    expect(updateClock(createClock(), -5)).toBe(false);
  });

  it('parçalı ve toplu update aynı saati verir', () => {
    const a = createClock({ startPhase: 0.3 });
    const b = createClock({ startPhase: 0.3 });
    for (let i = 0; i < 3600; i++) updateClock(a, 1 / 60);
    updateClock(b, 60);
    expect(a.time).toBeCloseTo(b.time, 6);
  });

  it('setClockPhase, skipToMorning, serialize/restore', () => {
    const c = createClock();
    setClockPhase(c, 0.75);
    expect(getPhaseName(c)).toBe('gece');
    expect(skipToMorning(c)).toBe(1);
    expect(clockPhase(c)).toBe(0);
    expect(getPhaseName(c)).toBe('şafak');
    expect(skipToMorning(c)).toBe(1); // sabah erken: günü atlamaz
    const snap = serializeClock(c);
    const d = createClock({ dayLengthSec: 600 });
    restoreClock(d, snap);
    expect(d.dayLengthSec).toBe(1200);
    expect(d.day).toBe(1);
    restoreClock(d, { time: -30, day: -4 });
    expect(d.time).toBeCloseTo(1170, 6);
    expect(d.day).toBe(0);
    restoreClock(d, null);
    expect(Number.isFinite(d.time)).toBe(true);
  });
});

describe('faz adları', () => {
  it('sınırlar: şafak → gündüz → gün batımı → gece (sarmalı)', () => {
    expect(phaseNameAt(0)).toBe('şafak');
    expect(phaseNameAt(0.059)).toBe('şafak');
    expect(phaseNameAt(0.06)).toBe('gündüz');
    expect(phaseNameAt(0.25)).toBe('gündüz');
    expect(phaseNameAt(0.439)).toBe('gündüz');
    expect(phaseNameAt(0.44)).toBe('gün batımı');
    expect(phaseNameAt(0.539)).toBe('gün batımı');
    expect(phaseNameAt(0.54)).toBe('gece');
    expect(phaseNameAt(0.75)).toBe('gece');
    expect(phaseNameAt(0.959)).toBe('gece');
    expect(phaseNameAt(0.96)).toBe('şafak');
    expect(phaseNameAt(1)).toBe('şafak');
    expect(phaseNameAt(-0.1)).toBe('gece');
    expect(PHASE_NAMES).toEqual(['şafak', 'gündüz', 'gün batımı', 'gece']);
  });
  it('gün boyunca dört faz görülür ve sırayla gelir', () => {
    const seen = [];
    for (let p = 0.0; p < 1; p += 0.001) {
      const n = phaseNameAt(p);
      if (seen[seen.length - 1] !== n) seen.push(n);
    }
    expect(seen).toEqual(['şafak', 'gündüz', 'gün batımı', 'gece', 'şafak']);
    expect(isNight(0.75)).toBe(true);
    expect(isNight(0.25)).toBe(false);
  });
});

describe('dayFactor', () => {
  it('öğle 1, gece yarısı 0, hep 0..1', () => {
    expect(dayFactorAt(0.25)).toBeCloseTo(1, 9);
    expect(dayFactorAt(0.75)).toBe(0);
    for (let p = 0; p <= 1; p += 0.002) {
      const f = dayFactorAt(p);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
  it('yumuşak: küçük adımda küçük fark; öğleye göre simetrik; gündoğumunda artar', () => {
    let maxStep = 0;
    for (let p = 0; p < 1; p += 0.0005) maxStep = Math.max(maxStep, Math.abs(dayFactorAt(p + 0.0005) - dayFactorAt(p)));
    expect(maxStep).toBeLessThan(0.02);
    expect(dayFactorAt(0.25 + 0.1)).toBeCloseTo(dayFactorAt(0.25 - 0.1), 9);
    expect(dayFactorAt(0.05)).toBeGreaterThan(dayFactorAt(0.0));
    expect(dayFactorAt(0.0)).toBeGreaterThan(dayFactorAt(0.97));
    expect(dayFactorAt(0.52)).toBeLessThan(dayFactorAt(0.46));
  });
  it('skyLight tabanı ve gece faktörü', () => {
    expect(skyLightAt(0.75)).toBeCloseTo(SKY_LIGHT_MIN, 9);
    expect(skyLightAt(0.25)).toBeCloseTo(1, 9);
    expect(nightFactorAt(0.75)).toBe(1);
    expect(dayFactor(createClock({ startPhase: 0.25 }))).toBeCloseTo(1, 9);
  });
});

describe('güneş ve ay', () => {
  it('birim vektör; öğle yukarıda, gece aşağıda; doğudan batıya', () => {
    const o = { x: 0, y: 0, z: 0 };
    for (let p = 0; p < 1; p += 0.05) {
      sunDirection(p, o);
      expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(1, 9);
    }
    sunDirection(0.25, o);
    expect(o.y).toBeGreaterThan(0.9);
    sunDirection(0.75, o);
    expect(o.y).toBeLessThan(-0.9);
    sunDirection(0.01, o);
    expect(o.x).toBeGreaterThan(0.9);
    sunDirection(0.49, o);
    expect(o.x).toBeLessThan(-0.9);
  });
  it('ay güneşin tersi; ay evresi 8 günlük döngü', () => {
    const s = { x: 0, y: 0, z: 0 };
    const m = { x: 0, y: 0, z: 0 };
    sunDirection(0.3, s);
    moonDirection(0.3, m);
    expect(m.x).toBeCloseTo(-s.x, 9);
    expect(m.y).toBeCloseTo(-s.y, 9);
    expect(m.z).toBeCloseTo(-s.z, 9);
    expect(moonPhase(0)).toBe(0);
    expect(moonPhase(9)).toBe(1);
    expect(moonIllumination(0)).toBe(0);
    expect(moonIllumination(4)).toBe(1);
    expect(moonIllumination(2)).toBeCloseTo(0.5, 9);
  });
  it('saat metni', () => {
    expect(formatClockTime(0)).toBe('06:00');
    expect(formatClockTime(0.25)).toBe('12:00');
    expect(formatClockTime(0.5)).toBe('18:00');
    expect(formatClockTime(0.75)).toBe('00:00');
    expect(formatClockTime(0.77)).toBe('00:28');
  });
});

describe('gökyüzü renkleri', () => {
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  it('renk dönüşümleri', () => {
    const c = hexToRgb(0x3f8fe0, [0, 0, 0]);
    expect(c[0]).toBeCloseTo(0x3f / 255, 9);
    expect(rgbToHex(c)).toBe(0x3f8fe0);
    expect(rgbToHex([2, -1, 0.5])).toBe(0xff0080);
  });
  it('öğle: bölgenin gün renkleri aynen; gece koyu; gündoğumunda ufuk sıcak', () => {
    const o = createSkyState();
    computeSky(0.25, 0, null, o);
    expect(rgbToHex(o.skyTop)).toBe(ZONES[0].ambient.skyTop);
    expect(rgbToHex(o.skyHorizon)).toBe(ZONES[0].ambient.skyHorizon);
    expect(rgbToHex(o.fog)).toBe(ZONES[0].ambient.fog);
    expect(o.phase).toBe('gündüz');
    expect(o.starAlpha).toBe(0);
    const day = lum(o.skyHorizon);
    computeSky(0.75, 0, null, o);
    expect(lum(o.skyHorizon)).toBeLessThan(day * 0.25);
    expect(o.starAlpha).toBe(1);
    expect(o.skyLight).toBeCloseTo(SKY_LIGHT_MIN, 9);
    computeSky(0.0, 0, null, o);
    expect(o.skyHorizon[0]).toBeGreaterThan(o.skyHorizon[2]); // kırmızımsı/turuncu
    expect(o.phase).toBe('şafak');
  });
  it('bölge tonu: Çekirdek (mor) öğle gökyüzü Başlangıç Vadisi’nden farklı', () => {
    const a = computeSky(0.25, 0, null, createSkyState());
    const b = computeSky(0.25, 4, null, createSkyState());
    expect(rgbToHex(b.skyTop)).toBe(ZONES[4].ambient.skyTop);
    expect(rgbToHex(a.skyTop)).not.toBe(rgbToHex(b.skyTop));
    const half = computeSky(0.25, 0.5, null, createSkyState());
    const z0 = ZONES[0].ambient.skyTop >> 16;
    const z1 = ZONES[1].ambient.skyTop >> 16;
    expect(half.skyTop[0] * 255).toBeCloseTo((z0 + z1) / 2, 0);
    // sınır dışı kesirli indeks güvenli kısılır
    expect(() => computeSky(0.3, 99, null, createSkyState())).not.toThrow();
    expect(() => computeSky(0.3, -3, null, createSkyState())).not.toThrow();
    expect(() => computeSky(0.3, NaN, null, createSkyState())).not.toThrow();
  });
  it('tüm değerler 0..1; gün boyunca süreklidir (sıçrama yok), p=0 ile 1 eşit', () => {
    const a = createSkyState();
    const b = createSkyState();
    let worst = 0;
    for (let zi = 0; zi <= 4; zi += 1) {
      for (let p = 0; p < 1; p += 0.002) {
        computeSky(p, zi, null, a);
        computeSky(p + 0.002, zi, null, b);
        const keys = ['skyTop', 'skyHorizon', 'fog', 'sun', 'ambient'];
        keys.forEach((k) => {
          for (let c = 0; c < 3; c++) {
            expect(a[k][c]).toBeGreaterThanOrEqual(0);
            expect(a[k][c]).toBeLessThanOrEqual(1);
            worst = Math.max(worst, Math.abs(a[k][c] - b[k][c]));
          }
        });
      }
    }
    expect(worst).toBeLessThan(0.06);
    const s0 = computeSky(0, 2, null, createSkyState());
    const s1 = computeSky(1, 2, null, createSkyState());
    for (let c = 0; c < 3; c++) expect(s0.skyTop[c]).toBeCloseTo(s1.skyTop[c], 9);
  });
  it('fırtına gökyüzünü karartır, griye çeker, sisi artırır, güneşi zayıflatır', () => {
    const w = createWeather(1);
    w.cloudCover = 1;
    w.intensity = 1;
    const clear = computeSky(0.25, 0, null, createSkyState());
    const storm = computeSky(0.25, 0, w, createSkyState());
    expect(lum(storm.skyTop)).toBeLessThan(lum(clear.skyTop));
    expect(storm.fogDensity).toBeGreaterThan(clear.fogDensity + 1);
    expect(storm.sunIntensity).toBeLessThan(clear.sunIntensity);
    const sat = (c) => Math.max(...c) - Math.min(...c);
    expect(sat(storm.skyTop)).toBeLessThan(sat(clear.skyTop));
  });
  it('zoneTintIndex: sınırda yumuşak geçiş, monoton', () => {
    expect(zoneTintIndex(0, 0)).toBe(0);
    expect(zoneTintIndex(50, 0)).toBe(0);
    expect(zoneTintIndex(ZONES[0].rOut, 0)).toBeCloseTo(0.5, 9);
    expect(zoneTintIndex(ZONES[0].rOut + 40, 0)).toBe(1);
    expect(zoneTintIndex(5000, 0)).toBe(4);
    let prev = -1;
    for (let r = 0; r < 800; r += 3) {
      const v = zoneTintIndex(r, 0);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('hava durumu', () => {
  const stormAt = (seed, t) => {
    const w = createWeather(seed);
    setWeatherTime(w, t);
    return w.storm;
  };

  it('aynı seed + zaman → aynı fırtına; dt parçalanışı sonucu değiştirmez', () => {
    const a = createWeather(1234);
    const b = createWeather(1234);
    for (let i = 0; i < 60 * 3000; i += 1) updateWeather(a, 1 / 60, { temperature: 0.5 });
    for (let i = 0; i < 300; i += 1) updateWeather(b, 10, { temperature: 0.5 });
    expect(a.t).toBeCloseTo(3000, 3);
    expect(b.t).toBeCloseTo(3000, 6);
    expect(a.storm).toBeCloseTo(stormAt(1234, a.t), 9);
    expect(b.storm).toBeCloseTo(stormAt(1234, b.t), 9);
    expect(Math.abs(a.storm - b.storm)).toBeLessThan(1e-3);
    expect(a.cycle.index).toBe(b.cycle.index);
  });

  it('seed isim/metin de olur; farklı seed farklı çizelge', () => {
    let diff = 0;
    for (let t = 0; t < 20000; t += 50) if (Math.abs(stormAt(1, t) - stormAt(2, t)) > 0.05) diff++;
    expect(diff).toBeGreaterThan(5);
    expect(stormAt('dünya-x', 5000)).toBe(stormAt('dünya-x', 5000));
  });

  it('ilk 300 sn açık; fırtına olur ve 0..1; bulutlanma 0..1', () => {
    for (const seed of [1, 7, 99, 12345]) {
      for (let t = 0; t < 300; t += 5) expect(stormAt(seed, t)).toBe(0);
      let peak = 0;
      for (let t = 0; t < 30000; t += 10) {
        const w = createWeather(seed);
        setWeatherTime(w, t);
        expect(w.storm).toBeGreaterThanOrEqual(0);
        expect(w.storm).toBeLessThanOrEqual(1);
        expect(w.cloudCover).toBeGreaterThanOrEqual(0);
        expect(w.cloudCover).toBeLessThanOrEqual(1);
        peak = Math.max(peak, w.storm);
      }
      expect(peak).toBeGreaterThan(0.5);
    }
  });

  it('fırtına yumuşak girer/çıkar (sıçrama yok)', () => {
    let worst = 0;
    let prev = stormAt(42, 0);
    for (let t = 1; t < 20000; t += 1) {
      const v = stormAt(42, t);
      worst = Math.max(worst, Math.abs(v - prev));
      prev = v;
    }
    expect(worst).toBeLessThan(0.1);
  });

  it('geri sarma baştan hesaplar; serialize/restore aynı durumu verir', () => {
    const w = createWeather(77);
    setWeatherTime(w, 8000);
    const s8 = w.storm;
    setWeatherTime(w, 100);
    expect(w.storm).toBe(0);
    setWeatherTime(w, 8000);
    expect(w.storm).toBe(s8);
    const r = restoreWeather(JSON.parse(JSON.stringify(serializeWeather(w))));
    expect(r.seed).toBe(w.seed);
    expect(r.t).toBe(8000);
    expect(r.storm).toBe(s8);
    expect(restoreWeather(null).t).toBe(0);
  });

  it('sıcaklığa göre kar / yağmur / kuru; tür geçişinde eskisi önce söner', () => {
    let t0 = 0;
    const w = createWeather(7);
    // fırtınanın ortasını bul
    for (let t = 0; t < 40000; t += 5) {
      if (stormAt(7, t) > 0.8) {
        t0 = t;
        break;
      }
    }
    expect(t0).toBeGreaterThan(0);
    setWeatherTime(w, t0);
    for (let i = 0; i < 600; i++) updateWeather(w, 1 / 60, { temperature: 0.4 });
    expect(w.kind).toBe('rain');
    expect(precipitation(w)).toBe('rain');
    expect(w.intensity).toBeGreaterThan(0.5);
    // soğuk bölgeye geçiş: önce yağmur söner, sonra kar başlar
    updateWeather(w, 1 / 60, { temperature: -0.5 });
    expect(w.kind).toBe('snow');
    expect(w.renderKind).toBe('rain');
    for (let i = 0; i < 60 * 12; i++) updateWeather(w, 1 / 60, { temperature: -0.5 });
    expect(w.renderKind).toBe('snow');
    expect(precipitation(w)).toBe('snow');
    // çöl: yağış yok ama bulut var
    for (let i = 0; i < 60 * 20; i++) updateWeather(w, 1 / 60, { temperature: 0.95 });
    expect(w.kind).toBe('clear');
    expect(precipitation(w)).toBeNull();
    expect(w.cloudCover).toBeGreaterThan(0.5);
  });

  it('rüzgâr sınırlı ve belirlenimci', () => {
    const a = createWeather(5);
    const b = createWeather(5);
    for (let i = 0; i < 5000; i++) {
      updateWeather(a, 0.5, {});
      updateWeather(b, 0.5, {});
      expect(Math.abs(a.wind.x)).toBeLessThanOrEqual(0.61);
      expect(Math.abs(a.wind.z)).toBeLessThanOrEqual(0.41);
    }
    expect(a.wind).toEqual(b.wind);
  });

  it('biyom sıcaklıkları ve yükseklik etkisi', () => {
    expect(temperatureFor('col')).toBeGreaterThan(0.85);
    expect(temperatureFor('tundra')).toBeLessThan(0.12);
    expect(temperatureFor('cayir', 64)).toBe(BIOME_TEMPERATURE.cayir);
    expect(temperatureFor('cayir', 120)).toBeLessThan(0.12);
    expect(temperatureFor('bilinmeyen', 64)).toBeCloseTo(0.4, 9);
    expect(temperatureFor('tundra', 200)).toBe(-1);
  });
});
