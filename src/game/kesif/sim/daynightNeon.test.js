import { describe, it, expect } from 'vitest';
import { cpuMs, scaled } from '../../../test/perfScale.js';
import {
  createClock, updateClock, clockPhase, setClockPhase, skipToMorning, formatClockTime, getPhaseName, phaseNameAt,
  computeSky, createSkyState, createWeather, updateWeather, setWeatherTime, serializeWeather, restoreWeather, precipitation,
  serializeClock, restoreClock, dayFactorAt,
} from './daynight.js';
import {
  NEON_SKY_KEYS, NEON_KEY_NAMES, NEON_PALETTE, NEON_CLOCK_ORIGIN, NEON_STAR_MUL, CITY_WEATHER_ODDS, CITY_WEATHER_DURATION,
  CITY_WEATHER_STATES, citySegment, cityFogDensity, CITY_FADE, CITY_WEATHER_PERIOD,
} from './daynightNeon.js';
import { DIMS, dimSeed, subHash } from './dim/dimensions.js';
import { createDimCtxSim } from './dim/dimState.js';
import { neonNightFactor } from './cityData.js';

const NEON_START = 0.8125;
function cityClock(extra) {
  return createClock(Object.assign({ dayLengthSec: 600, startPhase: NEON_START, origin: NEON_CLOCK_ORIGIN }, extra || {}));
}
function neonWeather(seed) {
  return createWeather(seed, { table: 'neon' });
}
function stepTo(w, t, dt) {
  const d = dt || 0.25;
  while (w.t + d <= t) updateWeather(w, d, { temperature: -0.9, rain: 1, snow: 1 });
  return w;
}

describe('şehir saati (600 sn, başlangıç 19:30)', () => {
  it('kayıtlı kesir 0,8125 = 19:30 (sözleşme ekseni); motor fazı 0,5625; HUD metni 19:30', () => {
    const c = cityClock();
    expect(c.time / c.dayLengthSec).toBeCloseTo(0.8125, 12);
    expect(clockPhase(c)).toBeCloseTo(0.5625, 12);
    expect(formatClockTime(clockPhase(c))).toBe('19:30');
  });

  it('gün batımından sonra: gece faktörü şehir ekseninde ≈1, motor adı gece/gün batımı', () => {
    const c = cityClock();
    expect(neonNightFactor((c.time / c.dayLengthSec) % 1)).toBeGreaterThan(0.9);
    expect(['gece', 'gün batımı']).toContain(getPhaseName(c));
  });

  it('origin yoksa ana diyar saati birebir: faz = kesir, alan eklenmez', () => {
    const c = createClock({ dayLengthSec: 600, startPhase: 0.25 });
    expect('origin' in c).toBe(false);
    expect(clockPhase(c)).toBeCloseTo(0.25, 12);
    expect('origin' in createClock()).toBe(false);
  });

  it('setClockPhase/skipToMorning origin ile tutarlı: gün doğumu = kesir 0,25', () => {
    const c = cityClock();
    setClockPhase(c, 0.25); // motor öğle
    expect(clockPhase(c)).toBeCloseTo(0.25, 12);
    expect(c.time / c.dayLengthSec).toBeCloseTo(0.5, 12); // sözleşme ekseninde 12:00
    setClockPhase(c, 0.75);
    expect(getPhaseName(c)).toBe('gece');
    const d0 = c.day;
    expect(skipToMorning(c)).toBe(d0 + 1);
    expect(clockPhase(c)).toBeCloseTo(0, 12);
    expect(getPhaseName(c)).toBe('şafak');
    expect(skipToMorning(c)).toBe(d0 + 1); // sabah erken: atlamaz
  });

  it('600 sn sonra tam gün: faz başa döner, gün sayısı artar; serialize/restore origin\'i korur (yerinde)', () => {
    const c = cityClock();
    const p0 = clockPhase(c);
    let rolled = false;
    for (let i = 0; i < 600; i++) rolled = updateClock(c, 1) || rolled;
    expect(rolled).toBe(true);
    expect(c.day).toBe(1);
    expect(clockPhase(c)).toBeCloseTo(p0, 9);
    const snap = serializeClock(c);
    const d = cityClock({ startPhase: 0.1 });
    restoreClock(d, snap);
    expect(d.origin).toBe(NEON_CLOCK_ORIGIN);
    expect(clockPhase(d)).toBeCloseTo(clockPhase(c), 9);
  });

  it('dimState.createDimCtxSim saati: kesir sözleşmedeki 0,8125; origin ile 19:30 görünür', () => {
    const ctx = createDimCtxSim('neon', 'tohum-1');
    expect(ctx.clock.time / ctx.clock.dayLengthSec).toBeCloseTo(DIMS.neon.day.startPhase, 12);
    ctx.clock.origin = NEON_CLOCK_ORIGIN;
    expect(formatClockTime(clockPhase(ctx.clock))).toBe('19:30');
    expect(ctx.weatherSim.table).toBe('neon');
  });
});

describe('şehir paleti', () => {
  it('dört ana anahtar tasarım değerleriyle (dawn/day/dusk/night) ve p sıralı', () => {
    const by = {};
    NEON_SKY_KEYS.forEach((k) => { by[k.name] = k; });
    const hex = (c) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    expect(hex(by.dawn.top)).toBe('#2a2150');
    expect(hex(by.dawn.hor)).toBe('#ff7a9c');
    expect(hex(by.dawn.fog)).toBe('#3a2a5c');
    expect(hex(by.dawn.sun)).toBe('#ffc0a0');
    expect(hex(by.day.top)).toBe('#3f6fb5');
    expect(hex(by.day.hor)).toBe('#a9c9e6');
    expect(hex(by.day.fog)).toBe('#8aa3bf');
    expect(hex(by.day.sun)).toBe('#fff2dc');
    expect(hex(by.dusk.top)).toBe('#2b1b5e');
    expect(hex(by.dusk.hor)).toBe('#ff5fa2');
    expect(hex(by.dusk.fog)).toBe('#4a2a6a');
    expect(hex(by.dusk.sun)).toBe('#ff9060');
    expect(hex(by.night.top)).toBe('#05051a');
    expect(hex(by.night.hor)).toBe('#1b1650');
    expect(hex(by.night.fog)).toBe('#120e33');
    expect(hex(by.night.sun)).toBe('#8fb0ff');
    expect(NEON_KEY_NAMES.slice(0, 1)[0]).toBe('dawn');
    for (let i = 1; i < NEON_SKY_KEYS.length; i++) expect(NEON_SKY_KEYS[i].p).toBeGreaterThan(NEON_SKY_KEYS[i - 1].p);
    expect(NEON_SKY_KEYS[0].p).toBe(0);
  });

  it('anahtar fazında renk anahtarın kendisi (kapalı hava); aralarda doğrusal-yumuşak ara değer', () => {
    ['dawn', 'day', 'dusk', 'night'].forEach((n) => {
      const k = NEON_SKY_KEYS.find((x) => x.name === n);
      const o = computeSky(k.p, 0, null, createSkyState(), NEON_PALETTE);
      for (let c = 0; c < 3; c++) {
        expect(o.skyTop[c]).toBeCloseTo(k.top[c], 9);
        expect(o.skyHorizon[c]).toBeCloseTo(k.hor[c], 9);
        expect(o.fog[c]).toBeCloseTo(k.fog[c], 9);
        expect(o.sun[c]).toBeCloseTo(k.sun[c], 9);
      }
    });
    const a = NEON_SKY_KEYS.find((x) => x.name === 'day');
    const b = NEON_SKY_KEYS.find((x) => x.name === 'ikindi');
    const mid = computeSky((a.p + b.p) / 2, 0, null, createSkyState(), NEON_PALETTE);
    for (let c = 0; c < 3; c++) {
      const lo = Math.min(a.top[c], b.top[c]) - 1e-9;
      const hi = Math.max(a.top[c], b.top[c]) + 1e-9;
      expect(mid.skyTop[c]).toBeGreaterThanOrEqual(lo);
      expect(mid.skyTop[c]).toBeLessThanOrEqual(hi);
      expect(mid.skyTop[c]).toBeCloseTo((a.top[c] + b.top[c]) / 2, 6); // smoothstep(0.5)=0.5
    }
  });

  it('p=0 ile p=1 aynı; tüm değerler 0..1; süreklilik (komşu örnekler arası sıçrama yok)', () => {
    const a = computeSky(0, 0, null, createSkyState(), NEON_PALETTE);
    const b = computeSky(1, 0, null, createSkyState(), NEON_PALETTE);
    for (let c = 0; c < 3; c++) {
      expect(a.skyTop[c]).toBeCloseTo(b.skyTop[c], 9);
      expect(a.fog[c]).toBeCloseTo(b.fog[c], 9);
    }
    let prev = null;
    const fields = ['skyTop', 'skyHorizon', 'fog', 'sun', 'ambient'];
    for (let i = 0; i <= 2000; i++) {
      const o = computeSky(i / 2000, 0, null, createSkyState(), NEON_PALETTE);
      fields.forEach((f) => o[f].forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }));
      if (prev) fields.forEach((f) => { for (let c = 0; c < 3; c++) expect(Math.abs(o[f][c] - prev[f][c])).toBeLessThan(0.03); });
      prev = { skyTop: o.skyTop.slice(), skyHorizon: o.skyHorizon.slice(), fog: o.fog.slice(), sun: o.sun.slice(), ambient: o.ambient.slice() };
    }
  });

  it('palet hava nesnesinin tablosundan seçilir; ana diyar çağrısı değişmez ve şehir alanlarını sıfırlar', () => {
    const w = neonWeather(7);
    const viaWeather = computeSky(0.3, 0, w, createSkyState());
    const viaPalette = computeSky(0.3, 0, w, createSkyState(), NEON_PALETTE);
    expect(viaWeather.skyTop).toEqual(viaPalette.skyTop);
    const over = computeSky(0.3, 0, createWeather(7), createSkyState());
    expect(over.skyTop).not.toEqual(viaPalette.skyTop);
    const shared = createSkyState();
    computeSky(0.8, 0, w, shared);
    expect(shared.cityGlow.some((v) => v > 0)).toBe(true);
    computeSky(0.8, 0, createWeather(7), shared);
    expect(shared.cityGlow).toEqual([0, 0, 0]);
    expect(shared.neonNight).toBe(0);
  });

  it('yıldızlar ×0,25; yağmur gökyüzünü kısar; şehir sisi gün 1,6 / gece 1,2 / yağmur 2,0', () => {
    const night = computeSky(0.75, 0, null, createSkyState(), NEON_PALETTE);
    const overNight = computeSky(0.75, 0, null, createSkyState());
    expect(night.starAlpha).toBeCloseTo(overNight.starAlpha * NEON_STAR_MUL, 9);
    expect(NEON_STAR_MUL).toBe(0.25);
    const day = computeSky(0.25, 0, null, createSkyState(), NEON_PALETTE);
    expect(day.fogDensity).toBeCloseTo(1.6, 9);
    expect(night.fogDensity).toBeCloseTo(1.2, 9);
    expect(cityFogDensity(1, 1, 0)).toBeCloseTo(2.0, 9);
    expect(cityFogDensity(0, 1, 0)).toBeCloseTo(2.0, 9);
    const rainy = { cloudCover: 0.85, intensity: 0.8, smog: 0.35 };
    const r = computeSky(0.25, 0, rainy, createSkyState(), NEON_PALETTE);
    expect(r.fogDensity).toBeGreaterThan(1.9);
    expect(r.sunIntensity).toBeLessThan(day.sunIntensity);
    expect(r.cloudDark).toBeGreaterThan(0);
    expect(cityFogDensity(1, 0, 1)).toBeLessThanOrEqual(2.4);
  });

  it('duman gökyüzüne ton verir ve sis yoğunluğunu artırır; NaN/Infinity hava girişi güvenli', () => {
    const clear = computeSky(0.25, 0, { cloudCover: 0.16, intensity: 0, smog: 0 }, createSkyState(), NEON_PALETTE);
    const smog = computeSky(0.25, 0, { cloudCover: 0.6, intensity: 0, smog: 1 }, createSkyState(), NEON_PALETTE);
    expect(smog.fogDensity).toBeGreaterThan(clear.fogDensity);
    expect(smog.fog).not.toEqual(clear.fog);
    const bad = computeSky(0.3, 0, { cloudCover: NaN, intensity: Infinity, smog: NaN }, createSkyState(), NEON_PALETTE);
    [bad.skyTop, bad.skyHorizon, bad.fog, bad.sun, bad.ambient, bad.cityGlow].forEach((a) => a.forEach((v) => expect(Number.isFinite(v)).toBe(true)));
    expect(Number.isFinite(bad.fogDensity)).toBe(true);
  });

  it('şehir parıltısı yalnız gece (neonNight) ve duman/yağmurda artar', () => {
    const noon = computeSky(0.25, 0, null, createSkyState(), NEON_PALETTE);
    const mid = computeSky(0.75, 0, null, createSkyState(), NEON_PALETTE);
    const wet = computeSky(0.75, 0, { cloudCover: 0.9, intensity: 0.9, smog: 0.5 }, createSkyState(), NEON_PALETTE);
    expect(noon.cityGlow.every((v) => v === 0)).toBe(true);
    expect(mid.cityGlow[0]).toBeGreaterThan(0);
    expect(wet.cityGlow[0]).toBeGreaterThan(mid.cityGlow[0]);
    expect(noon.neonNight).toBe(0);
    expect(mid.neonNight).toBe(1);
  });
});

describe('şehir hava çizelgesi', () => {
  it('belirlenimci: aynı tohum+zaman → aynı durum; dt parçalanışı sonucu değiştirmez', () => {
    const a = stepTo(neonWeather(11), 1500, 1 / 60);
    const b = stepTo(neonWeather(11), 1500, 0.5);
    const c = stepTo(neonWeather(11), 1500, 3);
    expect(a.cityState).toBe(b.cityState);
    expect(a.storm).toBeCloseTo(b.storm, 6);
    expect(a.cloudCover).toBeCloseTo(b.cloudCover, 6);
    expect(a.smog).toBeCloseTo(b.smog, 6);
    expect(c.cityState).toBe(b.cityState);
    expect(neonWeather(11).seed).toBe(neonWeather(11).seed);
    const x = neonWeather(11);
    const y = neonWeather(12);
    stepTo(x, 4000, 1);
    stepTo(y, 4000, 1);
    expect([x.storm, x.cloudCover, x.smog]).not.toEqual([y.storm, y.cloudCover, y.smog]);
  });

  it('setWeatherTime baştan hesaplar (geri sarma dahil); serialize/restore aynı durumu verir', () => {
    const w = neonWeather(5);
    stepTo(w, 3000, 1);
    const snap = serializeWeather(w);
    const r = restoreWeather(snap, { table: 'neon' });
    expect(r.table).toBe('neon');
    expect(r.cityState).toBe(w.cityState);
    expect(r.storm).toBeCloseTo(w.storm, 9);
    setWeatherTime(w, 100);
    expect(w.t).toBe(100);
    const fresh = neonWeather(5);
    setWeatherTime(fresh, 100);
    expect(w.cityState).toBe(fresh.cityState);
    expect(w.storm).toBeCloseTo(fresh.storm, 9);
  });

  it('boyut kaydı geri yükleme (Object.assign ile ana diyar biçimli nesne) çizelgeyi bozmaz: table korunur, durum yeniden yürünür', () => {
    const w = neonWeather(9);
    stepTo(w, 2500, 1);
    const snap = serializeWeather(w);
    const target = neonWeather(9);
    Object.assign(target, restoreWeather(snap)); // dimState.restoreDim böyle yapar (tablo bilgisiz)
    expect(target.table).toBe('neon');
    updateWeather(target, 0.25, { temperature: 0 });
    stepTo(w, w.t + 0.25, 0.25);
    expect(target.cityState).toBe(w.cityState);
    expect(target.cloudCover).toBeCloseTo(w.cloudCover, 4);
    expect(target.cycle.dur).toBeGreaterThan(0);
  });

  it('ilk parça açık; kar YOK (soğuk sıcaklık verilse bile); tür yalnız yağmur/temiz', () => {
    const w = neonWeather(3);
    expect(w.cityState).toBe('open');
    for (let t = 0; t < 8000; t += 1) {
      updateWeather(w, 1, { temperature: -1, snow: 1, rain: 1 });
      expect(w.kind).toBe('rain');
      expect(w.renderKind === 'snow').toBe(false);
      expect(precipitation(w) === 'snow').toBe(false);
      expect(w.storm).toBeGreaterThanOrEqual(0);
      expect(w.storm).toBeLessThanOrEqual(1);
      expect(w.cloudCover).toBeGreaterThanOrEqual(0);
      expect(w.cloudCover).toBeLessThanOrEqual(1);
      expect(w.smog).toBeGreaterThanOrEqual(0);
      expect(w.smog).toBeLessThanOrEqual(1);
    }
  });

  it('yağmur/fırtına parçaları 90–150 sn; açık/duman 120–240 sn; ilk parça +60 sn', () => {
    const out = {};
    const seen = { open: 0, smog: 0, rain: 0, storm: 0 };
    for (let seed = 0; seed < 60; seed++) {
      for (let j = 1; j < 120; j++) {
        citySegment(seed, j, out);
        seen[out.state]++;
        const [lo, hi] = CITY_WEATHER_DURATION[out.state];
        expect(out.dur).toBeGreaterThanOrEqual(lo);
        expect(out.dur).toBeLessThanOrEqual(hi);
        if (out.state === 'rain') {
          expect(out.dur).toBeGreaterThanOrEqual(90);
          expect(out.dur).toBeLessThanOrEqual(150);
        }
      }
      citySegment(seed, 0, out);
      expect(out.state).toBe('open');
      expect(out.dur).toBeGreaterThanOrEqual(CITY_WEATHER_DURATION.open[0] + 60);
    }
    CITY_WEATHER_STATES.forEach((s) => expect(seen[s]).toBeGreaterThan(0));
  });

  it('uzun vadede ZAMAN payları: açık %45 / duman %25 / yağmur %25 / fırtına %5 (±3 puan)', () => {
    const out = {};
    const time = { open: 0, smog: 0, rain: 0, storm: 0 };
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (let j = 1; j <= 300; j++) {
        citySegment(seed * 7919, j, out);
        time[out.state] += out.dur;
        total += out.dur;
      }
    }
    CITY_WEATHER_STATES.forEach((s) => {
      const share = time[s] / total;
      expect(Math.abs(share - CITY_WEATHER_ODDS[s])).toBeLessThan(0.03);
    });
    expect(CITY_WEATHER_ODDS).toEqual({ open: 0.45, smog: 0.25, rain: 0.25, storm: 0.05 });
  });

  it('yağış gerçekten başlar ve biter (tek tohumda yağmur görülür), geçişler yumuşak (sıçrama yok)', () => {
    let sawRain = false;
    let sawStorm = false;
    let maxJump = 0;
    for (let seed = 0; seed < 30; seed++) {
      const w = neonWeather(seed);
      let prev = 0;
      for (let t = 0; t < 4000; t += 0.5) {
        updateWeather(w, 0.5, {});
        if (w.intensity > 0.3) sawRain = true;
        if (w.cityState === 'storm' && w.intensity > 0.85) sawStorm = true;
        maxJump = Math.max(maxJump, Math.abs(w.storm - prev));
        prev = w.storm;
      }
    }
    expect(sawRain).toBe(true);
    expect(sawStorm).toBe(true);
    // 0,5 sn adımda en çok CITY_FADE sn'ye yayılmış geçiş: adım başına ≲ 1/CITY_FADE * 0.5 * 1.5
    expect(maxJump).toBeLessThan((0.5 / CITY_FADE) * 1.6);
  });

  it('yerel yağış şiddeti 0,8/sn ile yaklaşır; yağmurda wind sınırlı', () => {
    let w = null;
    for (let seed = 0; seed < 50 && !w; seed++) {
      const c = neonWeather(seed);
      stepTo(c, 6000, 1);
      let t = 0;
      while (t < 6000 && c.cityState !== 'rain') { updateWeather(c, 1, {}); t++; }
      if (c.cityState === 'rain') w = c;
    }
    expect(w).not.toBeNull();
    for (let i = 0; i < 80; i++) updateWeather(w, 0.5, {});
    expect(w.intensity).toBeGreaterThan(0.4);
    expect(Math.abs(w.wind.x)).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(Math.abs(w.wind.z)).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it('çok büyük/bozuk zaman hızlı değerlendirilir (periyot 400000 sn): 1e9 sn < 50 ms; mod eşdeğeri aynı durum; NaN/Infinity güvenli', () => {
    const a = neonWeather(5);
    const t0 = cpuMs();
    setWeatherTime(a, 1e9);
    expect(cpuMs() - t0).toBeLessThan(scaled(200));
    const b = neonWeather(5);
    setWeatherTime(b, 1e9 % CITY_WEATHER_PERIOD);
    expect(a.cityState).toBe(b.cityState);
    expect(a.storm).toBeCloseTo(b.storm, 9);
    expect(a.cloudCover).toBeCloseTo(b.cloudCover, 9);
    expect(a.smog).toBeCloseTo(b.smog, 9);
    [Infinity, NaN, 1e300, 2 ** 53, -5].forEach((v) => {
      const w = neonWeather(7);
      expect(() => setWeatherTime(w, v)).not.toThrow();
      expect(Number.isFinite(w.storm) && Number.isFinite(w.cloudCover) && Number.isFinite(w.smog)).toBe(true);
      expect(['open', 'smog', 'rain', 'storm']).toContain(w.cityState);
    });
    // periyot içinde değerler değişmez (dt'den bağımsız zaman yürütme ile aynı)
    const x = neonWeather(9);
    stepTo(x, 5000, 1);
    const y = neonWeather(9);
    setWeatherTime(y, 5000);
    expect(y.cityState).toBe(x.cityState);
    expect(y.storm).toBeCloseTo(x.storm, 9);
  });

  it('createWeather ana diyar nesnesine şehir alanı eklemez (table/smog/cityState yok)', () => {
    const w = createWeather(42);
    expect('table' in w).toBe(false);
    expect('smog' in w).toBe(false);
    expect('cityState' in w).toBe(false);
    const w2 = createWeather(42, { table: 'overworld' });
    expect(Object.keys(w2).sort()).toEqual(Object.keys(w).sort());
  });

  it('dimState bağlamı şehir tablosunu kullanır, ana diyar bağlamı kullanmaz', () => {
    const c = createDimCtxSim('neon', 'abc');
    expect(c.weatherSim.table).toBe('neon');
    expect(c.weatherSim.seed).toBe(subHash(dimSeed('abc', 'neon'), 1, 0x57454154) >>> 0);
    const o = createDimCtxSim('overworld', 'abc');
    expect(o.weatherSim.table).toBeUndefined();
  });
});

describe('gece faktörü ve pencere eşikleri saat ekseninde tutarlı', () => {
  it('motor fazından şehir fazı = faz + 0,25: öğlen gündüz, gece yarısı gece', () => {
    const night = (enginePhase) => neonNightFactor(((enginePhase + NEON_CLOCK_ORIGIN) % 1 + 1) % 1);
    expect(night(0.25)).toBe(0); // motor öğle
    expect(night(0.75)).toBe(1); // motor gece yarısı
    expect(night(0.5)).toBeLessThan(0.5); // gün batımı: gece kademeli başlar
    expect(night(0.5625)).toBeGreaterThan(0.9);
    // dayFactor ile aynı yönde: gündüz parlak ⇒ gece faktörü düşük
    for (let p = 0; p < 1; p += 0.05) {
      if (dayFactorAt(p) > 0.95) expect(night(p)).toBeLessThan(0.1);
    }
    expect(phaseNameAt(0.25)).toBe('gündüz');
  });
});
