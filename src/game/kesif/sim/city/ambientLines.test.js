import { describe, expect, it } from 'vitest';
import {
  AMBIENT_BY_DISTRICT, AMBIENT_BY_TYPE, AMBIENT_LINES, PED_TYPES, PHASE_KEYS, RECENT_NO_REPEAT, ambientPool,
  phaseKeyForHour, pickAmbient,
} from './ambientLines.js';
import { DISTRICT_KEYS } from './cityBrands.js';
import { splitLine } from './ownerData.js';
import { scanText } from './citySafeData.js';

const allGroups = () => {
  const out = [];
  Object.keys(AMBIENT_LINES).forEach((k) => out.push(['genel:' + k, AMBIENT_LINES[k]]));
  Object.keys(AMBIENT_BY_TYPE).forEach((k) => out.push(['tip:' + k, AMBIENT_BY_TYPE[k]]));
  Object.keys(AMBIENT_BY_DISTRICT).forEach((k) => out.push(['bolge:' + k, AMBIENT_BY_DISTRICT[k]]));
  return out;
};

describe('ambientLines — veri', () => {
  it('kapsam: genel, 4 zaman dilimi, yağmur, sis, 6 bölge, 8 yaya tipi', () => {
    expect(AMBIENT_LINES.genel.length).toBeGreaterThanOrEqual(12);
    PHASE_KEYS.forEach((p) => expect(AMBIENT_LINES[p].length, p).toBeGreaterThanOrEqual(8));
    expect(AMBIENT_LINES.yagmur.length).toBeGreaterThanOrEqual(8);
    expect(AMBIENT_LINES.sis.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(AMBIENT_BY_DISTRICT).sort()).toEqual(DISTRICT_KEYS.slice().sort());
    DISTRICT_KEYS.forEach((d) => expect(AMBIENT_BY_DISTRICT[d].length, d).toBeGreaterThanOrEqual(7));
    expect(Object.keys(AMBIENT_BY_TYPE).sort()).toEqual(PED_TYPES.slice().sort());
    PED_TYPES.forEach((t) => expect(AMBIENT_BY_TYPE[t].length, t).toBeGreaterThanOrEqual(6));
  });

  it('her satır <= 60 kr, 2×34 kr diyaloğa bölünebilir, noktalamayla biter, genelde benzersiz', () => {
    const seen = new Set();
    allGroups().forEach(([name, list]) => {
      expect(Object.isFrozen(list), name).toBe(true);
      list.forEach((l) => {
        expect(l.length, name + ': ' + l).toBeLessThanOrEqual(60);
        expect(l.length, name + ': ' + l).toBeGreaterThanOrEqual(8);
        expect(l, l).toMatch(/[.!?]$/);
        expect(l).toBe(l.trim());
        const parts = splitLine(l, 34);
        expect(parts.length, l).toBeLessThanOrEqual(2);
        parts.forEach((p) => expect(p.length, l).toBeLessThanOrEqual(34));
        expect(seen.has(l), l).toBe(false);
        seen.add(l);
      });
    });
    expect(seen.size).toBeGreaterThan(150);
  });

  it('hepsi güvenli: yasak sözcük ve gerçek ad yok', () => {
    allGroups().forEach(([name, list]) => list.forEach((l) => expect(scanText(l), name + ': ' + l).toEqual([])));
  });

  it('hava satırları ilgili kelimeyi taşır (yağmur / sis)', () => {
    AMBIENT_LINES.yagmur.forEach((l) => {
      expect(l.toLowerCase(), l).toMatch(/yağmur|ıslak|islak|şemsiye|sığınak|damla|birikinti|çay/);
    });
    AMBIENT_LINES.sis.forEach((l) => expect(l.toLowerCase(), l).toMatch(/sis/));
  });
});

describe('phaseKeyForHour', () => {
  it('sınır değerleri ve sarma', () => {
    const cases = [[0, 'gece'], [4.99, 'gece'], [5, 'sabah'], [9.99, 'sabah'], [10, 'gunduz'], [16.99, 'gunduz'],
      [17, 'aksam'], [20.99, 'aksam'], [21, 'gece'], [23.99, 'gece'], [24, 'gece'], [29, 'sabah'], [-1, 'gece'],
      [19.5, 'aksam']];
    cases.forEach(([h, k]) => expect(phaseKeyForHour(h), String(h)).toBe(k));
    expect(PHASE_KEYS).toContain(phaseKeyForHour(NaN));
    expect(PHASE_KEYS).toContain(phaseKeyForHour(undefined));
    for (let h = -50; h < 100; h += 0.37) expect(PHASE_KEYS).toContain(phaseKeyForHour(h));
  });
});

describe('ambientPool / pickAmbient', () => {
  it('havuz bağlama göre kurulur, kimlikler benzersiz, bilinmeyen değerler yok sayılır', () => {
    const p = ambientPool({ type: 'cocuk', district: 'liman', phase: 'gece', rain: true });
    const ids = p.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(p.length).toBe(AMBIENT_BY_TYPE.cocuk.length + AMBIENT_BY_DISTRICT.liman.length + AMBIENT_LINES.gece.length
      + AMBIENT_LINES.yagmur.length + AMBIENT_LINES.genel.length);
    expect(ambientPool({ type: 'yok', district: 'yok', phase: 'yok' }).length).toBe(AMBIENT_LINES.genel.length);
    expect(ambientPool().length).toBe(AMBIENT_LINES.genel.length);
    expect(ambientPool({ type: '__proto__', district: 'constructor', phase: 'toString' }).length)
      .toBe(AMBIENT_LINES.genel.length);
    expect(ambientPool({ phase: 'genel' }).length).toBe(AMBIENT_LINES.genel.length);
    expect(ambientPool({ fog: true }).length).toBe(AMBIENT_LINES.sis.length + AMBIENT_LINES.genel.length);
    expect(ambientPool({ rain: true, fog: true }).some((x) => x.id.indexOf('sis') >= 0)).toBe(false);
  });

  it('belirlenimci: aynı girdi aynı satır; farklı tohum farklı dağılım', () => {
    const ctx = { type: 'halk', district: 'merkez', phase: 'aksam' };
    for (let i = 0; i < 100; i++) expect(pickAmbient(7, i, ctx, [])).toEqual(pickAmbient(7, i, ctx, []));
    let diff = 0;
    for (let i = 0; i < 100; i++) if (pickAmbient(1, i, ctx).id !== pickAmbient(2, i, ctx).id) diff++;
    expect(diff).toBeGreaterThan(40);
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(pickAmbient(9, i, ctx).id);
    expect(seen.size).toBeGreaterThanOrEqual(20);
  });

  it('son 4 satır tekrarlanmaz (uzun zincir), tüm tipler/bölgeler/koşullar için', () => {
    PED_TYPES.forEach((type, ti) => {
      DISTRICT_KEYS.forEach((district, di) => {
        const ctx = {
          type, district, phase: PHASE_KEYS[(ti + di) % 4], rain: (ti + di) % 3 === 0, fog: di % 2 === 0,
        };
        const recent = [];
        for (let i = 0; i < 80; i++) {
          const r = pickAmbient(31337 + ti, i, ctx, recent);
          expect(r && typeof r.text === 'string').toBe(true);
          expect(recent.slice(-RECENT_NO_REPEAT)).not.toContain(r.id);
          recent.push(r.id);
        }
      });
    });
  });

  it('havuz tükenirse çökmez ve geçerli satır döner; bozuk girdiler güvenli', () => {
    const ctx = { type: 'kapici' };
    const all = ambientPool(ctx).map((x) => x.id);
    expect(all).toContain(pickAmbient(1, 1, ctx, all).id);
    expect(pickAmbient(1, 1, ctx, 'dizi-degil')).toBeTruthy();
    expect(pickAmbient(NaN, NaN, null, null)).toBeTruthy();
  });

  it('tip satırları iki kat ağırlıklı seçilir', () => {
    const ctx = { type: 'kurye', phase: 'gece' };
    let tip = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (pickAmbient(5, i, ctx).id.indexOf('tip.') === 0) tip++;
    const t = AMBIENT_BY_TYPE.kurye.length;
    const expected = (2 * t) / (2 * t + AMBIENT_LINES.gece.length + AMBIENT_LINES.genel.length);
    expect(Math.abs(tip / n - expected)).toBeLessThan(0.08);
  });
});
