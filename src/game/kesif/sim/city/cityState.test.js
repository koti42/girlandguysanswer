import { afterEach, describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng.js';
import { sanitizeNeon, unregisterDimSanitizer } from '../dim/dimSanitize.js';
import { DIM_SAVE_LIMITS } from '../dim/dimensions.js';
import { jsonBytes } from '../dim/dimSanitize.js';
import {
  CITY_STATE_VERSION, STAT_KEYS, ensureCityState, installCityStateSanitizer, isCityStateSanitizerInstalled, metricsOf, popcount, sanitizeCityState, statAdd, statBit, statGet,
  uninstallCityStateSanitizer,
} from './cityState.js';
import { sanitizeVehicleSave } from './vehicle/vehicleSave.js';
import { sanitizeNpcSave } from './ped/npcSave.js';
import { emptyDiscovery, markChip, markRoom, paintGraffiti } from './mission/discovery.js';

afterEach(() => installCityStateSanitizer());

function fullCity() {
  const c = ensureCityState({ v: 1, kredi: 345 });
  markChip(c.discovery, 3);
  markChip(c.discovery, 200);
  paintGraffiti(c.discovery, 11, 4, 6);
  markRoom(c.discovery, 5);
  c.discovery.shops.push('ramen_bari');
  c.discovery.story = 2;
  c.discovery.sets = 5;
  c.runs[2] = { n: 3, b: { taksi: [1234, 2], spor: [999, 3] } };
  c.jobs = { done: 7, earned: 321, log: [100, 200, 300] };
  c.quests = { nm_hosgeldin: 2, nm_ilk_surus: 1 };
  c.ach = ['nm_ilk_gecis', 'nm_ilk_cip'];
  c.claims = { firstjob: 1, chips60: 2 };
  statAdd(c, 'citySeconds', 4000);
  statAdd(c, 'chipsFound', 5); // izin verilmeyen/çalışma-dışı sayaç değil: STAT_KEYS dışında kalan atılır
  statBit(c, 'dmask', 2);
  c.mission = {
    k: 'job', id: 'jk_3_2_1', c: 'taksi', n: [12, -40], r: { id: 'jk_3_2_1', s: 1, g: 0, l: 0, p: 0, t: 12.5, h: 0, c: 0, a: 2, b: 1 },
  };
  c.garage = { owned: [{ cls: 'taksi', cos: { body: 3, accent: 2, neon: 1, under: { on: true, color: 2, pattern: 'dalga' }, wheels: 1, plate: 'MRD-100', horn: 0, radio: 1 } }], active: 0 };
  c.summoned = { idx: 0, x: 10.5, y: 64, z: -3.25, yaw: 1.5, dmg: 0.1 };
  c.rental = { cls: 'spor', left: 123.4, x: 1, y: 64, z: 2, yaw: 0, dmg: 0 };
  c.vstats = { km: 12.345, enters: 4 };
  c.flags = { q_nm_ilk_surus: 1, met_zeynep: 3 };
  c.npcs = { rehber_zeynep: { r: 2, v: 5, d: 3, s: { selam: 2 } } };
  c.shop = {
    d: 3, s: {}, g: { 'item:bakir_tel': 4 }, k: {}, t: 3700, kg: 20,
  };
  return c;
}

describe('cityState: sanitize gidiş-dönüş', () => {
  it('tam durum JSON gidiş-dönüşte değişmez; diğer paketlerin alanları kendi doğrulayıcılarıyla aynı sonucu verir', () => {
    const c = fullCity();
    const raw = JSON.parse(JSON.stringify(c));
    delete raw.stats.chipsFound;
    const s = sanitizeCityState(raw);
    expect(s.v).toBe(CITY_STATE_VERSION);
    expect(s.kredi).toBe(345);
    expect(s.discovery.chips.length).toBe(60);
    expect(s.discovery.graffiti[11]).toEqual([4, 6]);
    expect(s.discovery.rooms).toBe(32);
    expect(s.runs[2].b.taksi).toEqual([1234, 2]);
    expect(s.jobs).toEqual({ done: 7, earned: 321, log: [100, 200, 300] });
    expect(s.quests).toEqual({ nm_hosgeldin: 2, nm_ilk_surus: 1 });
    expect(s.ach).toEqual(['nm_ilk_gecis', 'nm_ilk_cip']);
    expect(s.claims).toEqual({ firstjob: 1, chips60: 2 });
    expect(s.mission.id).toBe('jk_3_2_1');
    expect(s.mission.n).toEqual([12, -40]);
    expect(s.mission.r.t).toBe(12.5);
    const veh = sanitizeVehicleSave(raw);
    expect(s.garage).toEqual(veh.garage);
    expect(s.summoned).toEqual(veh.summoned);
    expect(s.rental).toEqual(veh.rental);
    expect(s.vstats).toEqual(veh.vstats);
    const npc = sanitizeNpcSave(raw);
    expect(s.flags).toEqual(npc.flags);
    expect(s.npcs).toEqual(npc.npcs);
    expect(s.shop).toEqual(npc.shop);
    // ikinci geçiş aynı (idempotent)
    expect(sanitizeCityState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('boş/eksik blob: yalnız v; bulunmayan anahtar eklenmez; dimSanitize üzerinden de aynı', () => {
    expect(sanitizeCityState({})).toEqual({ v: 1 });
    expect(sanitizeCityState({ kredi: 5 })).toEqual({ v: 1, kredi: 5 });
    [null, 1, 'x', [], undefined].forEach((b) => expect(sanitizeCityState(b)).toBeNull());
    const neon = sanitizeNeon({ v: 1, city: fullCity() }, []);
    expect(neon.city.kredi).toBe(345);
    expect(neon.city.mission.k).toBe('job');
    expect(neon.city.discovery.shops).toEqual(['ramen_bari']);
  });

  it('eski sürüm iletileri: v eksik/0/negatif, ileri sürüm, eksik alanlar → yükleme çökmez, bilinenler korunur', () => {
    const old = [
      { kredi: 90, garage: { owned: [{ cls: 'taksi' }], active: 0 } },
      { v: 0, kredi: 12, discovery: { chips: '0' } },
      { v: -3, quests: { nm_ilk_surus: 2 } },
      { v: 99, kredi: 7, stats: { jobsDone: 3 }, gelecek_alan: { a: 1 } },
      { v: 1, discovery: { graffiti: { 0: [1, 1] } } },
    ];
    old.forEach((o) => {
      const s = sanitizeCityState(o);
      expect(s).not.toBeNull();
      expect(s.v).toBe(1);
    });
    expect(sanitizeCityState(old[0]).garage.owned[0].cls).toBe('taksi');
    expect(sanitizeCityState(old[2]).quests.nm_ilk_surus).toBe(2);
    expect(sanitizeCityState(old[3]).stats.jobsDone).toBe(3);
    expect(sanitizeCityState(old[3]).gelecek_alan).toEqual({ a: 1 }); // ileri uyum: bilinmeyen anahtar korunur
    expect(sanitizeCityState(old[1]).discovery.chips).toHaveLength(60);
  });

  it('bozuk değerler: tür/aralık/prototip/NaN güvenli', () => {
    const evil = JSON.parse('{"kredi":"x","stats":{"__proto__":{"a":1},"jobsDone":-5,"chipsFound":9e99,"racesDone":"7","dmask":4294967295,"citySeconds":1.9},"quests":{"__proto__":1,"nm_ilk_surus":9,"nm_yok":1,"nm_cip_10":2},"ach":["__proto__","nm_ilk_gecis","nm_ilk_gecis",5],"claims":{"firstjob":7,"x":1,"goldrace":-1},"mission":{"k":"hile","id":"a"},"runs":{"99":{"n":1},"1":{"n":-4,"b":{"taksi":[0,9],"bilinmez":[1,1],"spor":[5.5,2]}}},"jobs":{"done":"a","log":[-1,5,"x",7]},"constructor":{"a":1}}');
    const s = sanitizeCityState(evil);
    expect(s.kredi).toBeUndefined();
    expect(Object.getPrototypeOf(s.stats)).toBe(Object.prototype);
    expect(s.stats.jobsDone).toBeUndefined();
    expect(s.stats.racesDone).toBeUndefined();
    expect(s.stats.dmask).toBe(0x3fffffff);
    expect(s.stats.citySeconds).toBe(1);
    expect(s.quests).toEqual({ nm_cip_10: 2 });
    expect(s.ach).toEqual(['nm_ilk_gecis']);
    expect(s.claims).toEqual({ firstjob: 2 });
    expect(s.mission).toBeNull();
    expect(Object.keys(s.runs)).toEqual(['1']);
    expect(s.runs[1].b).toEqual({ taksi: [1, 3], spor: [5, 2] });
    expect(s.jobs.log).toEqual([0, 5, 7]);
    expect(s.constructor).toBe(Object);
    expect(JSON.stringify(s)).not.toContain('__proto__');
  });

  it('boyut sınırı: şişirilmiş bilinmeyen alanlar kırpılır; toplam ≤ DIM_SAVE_LIMITS.city', () => {
    const raw = fullCity();
    for (let i = 0; i < 40; i++) raw['x' + i] = { a: 'y'.repeat(5000) };
    const s = sanitizeCityState(JSON.parse(JSON.stringify(raw)));
    expect(jsonBytes(s)).toBeLessThan(DIM_SAVE_LIMITS.city);
  });
});

describe('cityState: fuzz', () => {
  function mutate(rnd, v, depth) {
    const r = rnd();
    if (r < 0.05) return null;
    if (r < 0.1) return 'ab\u0000c';
    if (r < 0.15) return NaN;
    if (r < 0.2) return Infinity;
    if (r < 0.25) return -1e12;
    if (r < 0.3) return [];
    if (r < 0.35) return {};
    if (r < 0.4) return rnd() * 1e9;
    if (depth < 3 && v && typeof v === 'object') {
      const out = Array.isArray(v) ? v.slice() : Object.assign({}, v);
      Object.keys(out).forEach((k) => { if (rnd() < 0.4) out[k] = mutate(rnd, out[k], depth + 1); });
      if (rnd() < 0.2) out.__proto__ = { x: 1 };
      if (rnd() < 0.2) out[rnd() < 0.5 ? 'constructor' : 'zz'] = { y: 2 };
      return out;
    }
    return v;
  }

  it('2000 bozulmuş blob: atmaz; sonuç JSON-güvenli, idempotent, sınırlar içinde', () => {
    const base = JSON.parse(JSON.stringify(fullCity()));
    const rnd = mulberry32(0xc17e);
    for (let i = 0; i < 2000; i++) {
      const raw = mutate(rnd, base, 0);
      let s;
      expect(() => { s = sanitizeCityState(raw); }).not.toThrow();
      if (s === null) continue;
      const json = JSON.stringify(s);
      expect(json).not.toContain('NaN');
      expect(json).not.toContain('Infinity');
      const s2 = sanitizeCityState(JSON.parse(json));
      expect(s2).toEqual(s);
      if (s.discovery) expect(s.discovery.chips).toHaveLength(60);
      if (s.ach) expect(s.ach.length).toBeLessThanOrEqual(64);
      if (s.mission) expect(['job', 'race']).toContain(s.mission.k);
    }
  });
});

describe('cityState: istatistik yardımcıları ve ölçütler', () => {
  it('statAdd/statBit/popcount; bilinmeyen anahtar yok sayılır; metricsOf düz ve sonlu', () => {
    const c = ensureCityState({});
    expect(statAdd(c, 'jobsDone', 2)).toBe(2);
    expect(statAdd(c, 'jobsDone', -9)).toBe(0);
    expect(statAdd(c, 'bilinmez', 5)).toBe(0);
    expect(statAdd(c, 'cityM', NaN)).toBe(0);
    expect(statBit(c, 'dmask', 0)).toBe(true);
    expect(statBit(c, 'dmask', 0)).toBe(false);
    expect(statBit(c, 'dmask', 40)).toBe(false);
    statBit(c, 'dmask', 5);
    expect(popcount(statGet(c, 'dmask'))).toBe(2);
    statAdd(c, 'cityM', 12345);
    const m = metricsOf(c, { terminalMask: 0b101, garageCount: 3 });
    expect(m.cityKm).toBeCloseTo(12.345, 3);
    expect(m.terminalsFound).toBe(2);
    expect(m.garageCount).toBe(3);
    expect(m.districtKinds).toBe(2);
    STAT_KEYS.forEach((k) => expect(Number.isFinite(m[k])).toBe(true));
    Object.keys(m).forEach((k) => expect(m[k]).toBeGreaterThanOrEqual(0));
    expect(metricsOf(null).chipsFound).toBe(0);
    const d = fullCity();
    const m2 = metricsOf(d);
    expect(m2.chipsFound).toBe(2);
    expect(m2.graffitiDone).toBe(1);
    expect(m2.roomsFound).toBe(1);
    expect(m2.ownersMet).toBe(1);
    expect(m2.garageCount).toBe(1);
    expect(emptyDiscovery().rooms).toBe(0);
  });

  it('sanitize kayıt/kaldırma: kurulu iken dimSanitize bu doğrulayıcıyı kullanır', () => {
    expect(isCityStateSanitizerInstalled()).toBe(true);
    uninstallCityStateSanitizer();
    expect(isCityStateSanitizerInstalled()).toBe(false);
    unregisterDimSanitizer('neon', 'city');
    const generic = sanitizeNeon({ v: 1, city: { v: 1, kredi: 5, quests: { nm_yok: 1 } } }, []);
    expect(generic.city.quests).toEqual({ nm_yok: 1 }); // genel safeBlob yolu
    installCityStateSanitizer();
    const strict = sanitizeNeon({ v: 1, city: { v: 1, kredi: 5, quests: { nm_yok: 1 } } }, []);
    expect(strict.city.quests).toEqual({});
  });
});
