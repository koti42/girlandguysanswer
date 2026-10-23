import { describe, it, expect } from 'vitest';
import {
  wetTargetFor, stepWet, neonUniformFor, cityPhaseOf, lookNameFor, fogShelter, ambienceState, WET_RISE_SEC, WET_FALL_SEC, CITY_CAMERA_FAR, STORM_NIGHT,
} from './cityLookMath.js';
import { createWeather, updateWeather, setClockPhase, createClock } from '../../sim/daynight.js';
import { NEON_CLOCK_ORIGIN } from '../../sim/daynightNeon.js';
import { windowLit, WINDOW_GROUP_THRESHOLDS } from '../../sim/cityData.js';

describe('uWet eğrisi (1 sn yükselme / 20 sn bırakma)', () => {
  it('sabitler sözleşmeye uygun', () => {
    expect(WET_RISE_SEC).toBe(1);
    expect(WET_FALL_SEC).toBe(20);
    expect(CITY_CAMERA_FAR).toBe(1600);
  });

  it('0 → 1 yükselişi tam 1 sn sürer (doğrusal)', () => {
    let w = 0;
    for (let i = 0; i < 60; i++) w = stepWet(w, 1, 1 / 60);
    expect(w).toBeCloseTo(1, 9);
    let h = 0;
    for (let i = 0; i < 30; i++) h = stepWet(h, 1, 1 / 60);
    expect(h).toBeCloseTo(0.5, 9);
  });

  it('1 → 0 kuruma tam 20 sn sürer; 10 sn sonra 0,5', () => {
    let w = 1;
    for (let i = 0; i < 600; i++) w = stepWet(w, 0, 1 / 60);
    expect(w).toBeCloseTo(0.5, 9);
    for (let i = 0; i < 600; i++) w = stepWet(w, 0, 1 / 60);
    expect(w).toBeCloseTo(0, 9);
  });

  it('dt parçalanışı sonucu değiştirmez', () => {
    const run = (dt, secs, target, start) => {
      let w = start;
      const n = Math.round(secs / dt);
      for (let i = 0; i < n; i++) w = stepWet(w, target, dt);
      return w;
    };
    expect(run(1 / 120, 0.7, 1, 0)).toBeCloseTo(run(0.1, 0.7, 1, 0), 9);
    expect(run(1 / 30, 8, 0, 1)).toBeCloseTo(run(0.5, 8, 0, 1), 9);
  });

  it('hedefi aşmaz, 0..1 aralığında kalır; NaN/negatif/Infinity dt ve girdiler güvenli', () => {
    expect(stepWet(0.95, 1, 5)).toBe(1);
    expect(stepWet(0.05, 0, 100)).toBe(0);
    expect(stepWet(0.3, 0.5, 0.01)).toBeLessThanOrEqual(0.5);
    expect(stepWet(0.7, 0.5, 0.01)).toBeGreaterThanOrEqual(0.5);
    [NaN, -1, 0, Infinity, -Infinity, undefined, null, 'x'].forEach((d) => expect(stepWet(0.4, 1, d)).toBe(0.4));
    expect(stepWet(NaN, 1, 0.1)).toBeCloseTo(0.1, 9);
    expect(stepWet(0.5, NaN, 0.1)).toBeCloseTo(0.5 - 0.1 / 20, 9);
    expect(stepWet(5, 9, 1)).toBe(1);
    expect(stepWet(-3, -9, 1)).toBe(0);
  });

  it('rastgele dizi: değerler hep sonlu ve [0,1]', () => {
    let s = 7;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    let w = 0.5;
    for (let i = 0; i < 5000; i++) {
      w = stepWet(w, rnd() < 0.5 ? 0 : 1, rnd() * 0.3);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});

describe('ıslaklık hedefi hava nesnesinden', () => {
  it('ana diyar havası ve boş girdi 0 verir', () => {
    expect(wetTargetFor(null)).toBe(0);
    expect(wetTargetFor(undefined)).toBe(0);
    expect(wetTargetFor({ intensity: 1 })).toBe(0);
    expect(wetTargetFor(createWeather(3))).toBe(0);
  });

  it('şehir havasında yağış şiddetiyle yumuşakça artar (0,03 altı 0, 0,30 üstü 1)', () => {
    const w = createWeather(1, { table: 'neon' });
    const at = (i) => { w.intensity = i; return wetTargetFor(w); };
    expect(at(0)).toBe(0);
    expect(at(0.03)).toBe(0);
    expect(at(0.3)).toBeCloseTo(1, 9);
    expect(at(1)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = at(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(at(NaN)).toBe(0);
    expect(at(Infinity)).toBe(0);
  });

  it('gerçek yağmur segmentinde ıslaklık 1’e çıkar, açık havada 0 kalır', () => {
    let sawWet = false;
    let sawDry = false;
    for (let seed = 0; seed < 8; seed++) {
      const w = createWeather(seed, { table: 'neon' });
      for (let t = 0; t < 3000; t += 1) {
        updateWeather(w, 1, {});
        const v = wetTargetFor(w);
        if (v >= 0.99) sawWet = true;
        if (v === 0 && w.cityState === 'open') sawDry = true;
      }
    }
    expect(sawWet).toBe(true);
    expect(sawDry).toBe(true);
  });
});

describe('uNeon [gece, neon, ıslak, pencere]', () => {
  it('motor fazı → sözleşme fazı (+0,25) ve 19:30 başlangıcında gece ≈ 1', () => {
    expect(cityPhaseOf(0.5625)).toBeCloseTo(0.8125, 12);
    expect(cityPhaseOf(0.8)).toBeCloseTo(0.05, 12);
    expect(NEON_CLOCK_ORIGIN).toBe(0.25);
    const out = new Float32Array(4);
    neonUniformFor(out, 0.5625, 0, 0);
    expect(out[0]).toBeGreaterThan(0.99);
  });

  it('gündüz sönük neon (0,45) / gece tam (1,25); ıslak yansıma = ıslaklık × (0,35 + 0,65 gece); pencere gece×(1+0,15 yağmur)', () => {
    const out = new Float32Array(4);
    neonUniformFor(out, 0.25, 0, 0); // motor öğle
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(0.45, 6);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
    neonUniformFor(out, 0.75, 1, 1); // gece yarısı
    expect(out[0]).toBe(1);
    expect(out[1]).toBeCloseTo(1.25, 6);
    expect(out[2]).toBeCloseTo(1, 6);
    expect(out[3]).toBeCloseTo(1.15, 6);
    neonUniformFor(out, 0.25, 1, 0);
    expect(out[2]).toBeCloseTo(0.35, 6);
  });

  it('yağmurda gündüz de asgari gece faktörü (0,28): A grubu pencereler (eşik 0,2) yanar, B/C yanmaz; gece değişmez', () => {
    const out = new Float32Array(4);
    neonUniformFor(out, 0.25, 0, 0);
    expect(out[0]).toBe(0);
    neonUniformFor(out, 0.25, 1, 1);
    expect(out[0]).toBeCloseTo(STORM_NIGHT, 6);
    expect(windowLit(out[0], 0)).toBeGreaterThan(0.5);
    expect(windowLit(out[0], 1)).toBe(0);
    expect(windowLit(out[0], 2)).toBe(0);
    neonUniformFor(out, 0.25, 1, 0.2);
    expect(out[0]).toBeCloseTo(STORM_NIGHT * 0.3, 6);
    neonUniformFor(out, 0.75, 1, 1);
    expect(out[0]).toBe(1);
  });

  it('NaN/Infinity/aşırı girdi: çıkış hep sonlu ve sınırlı', () => {
    const out = new Float32Array(4);
    [NaN, Infinity, -Infinity, 1e9, -1e9, undefined, null, 'x'].forEach((v) => {
      neonUniformFor(out, v, v, v);
      for (let i = 0; i < 4; i++) {
        expect(Number.isFinite(out[i])).toBe(true);
        expect(out[i]).toBeGreaterThanOrEqual(0);
        expect(out[i]).toBeLessThanOrEqual(1.25 + 1e-6);
      }
    });
  });

  it('gece faktörü pencere gruplarını sırayla yakar (0,2 → 0,5 → 0,8) ve gün boyunca sürekli', () => {
    // gün batımı sonrası gece artarken önce A (0,2), sonra B, sonra C grubu yanar
    const clock = createClock({ dayLengthSec: 600, startPhase: 0.5, origin: NEON_CLOCK_ORIGIN });
    const out = new Float32Array(4);
    const lit = [[], [], []];
    for (let p = 0.44; p <= 0.62; p += 0.002) {
      setClockPhase(clock, p);
      neonUniformFor(out, p, 0, 0);
      for (let g = 0; g < 3; g++) lit[g].push(windowLit(out[0], g));
    }
    const firstOn = lit.map((a) => a.findIndex((v) => v > 0.5));
    expect(firstOn[0]).toBeGreaterThanOrEqual(0);
    expect(firstOn[0]).toBeLessThan(firstOn[1]);
    expect(firstOn[1]).toBeLessThan(firstOn[2]);
    expect(WINDOW_GROUP_THRESHOLDS).toEqual([0.2, 0.5, 0.8]);
    let prev = null;
    for (let p = 0; p < 1; p += 0.001) {
      neonUniformFor(out, p, 0.5, 0.5);
      if (prev) for (let i = 0; i < 4; i++) expect(Math.abs(out[i] - prev[i])).toBeLessThan(0.08);
      prev = Array.from(out);
    }
  });
});

describe('küçük yardımcılar', () => {
  it('lookNameFor: neon → neon, geri kalan her şey overworld', () => {
    expect(lookNameFor('neon')).toBe('neon');
    ['overworld', '', null, undefined, 5, {}, 'NEON', '__proto__'].forEach((v) => expect(lookNameFor(v)).toBe('overworld'));
  });

  it('fogShelter: açıkta 0, içeride 1, kıstırılmış', () => {
    expect(fogShelter(15)).toBe(0);
    expect(fogShelter(0)).toBe(1);
    expect(fogShelter(6)).toBeCloseTo(0.5, 9);
    expect(fogShelter(NaN)).toBe(0);
    expect(fogShelter(-4)).toBe(1);
  });

  it('ambienceState yerinde doldurur ve kıstırır', () => {
    const o = {};
    expect(ambienceState(o, 2, -1, NaN, 0.5)).toBe(o);
    expect(o).toEqual({
      night: 1, rain: 0, wet: 0, shelter: 0.5,
    });
  });
});
