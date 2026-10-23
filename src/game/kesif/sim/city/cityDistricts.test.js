import { describe, expect, it } from 'vitest';
import { UNDERGROUND_KEY, buildDistricts, districtAt, districtName, safeAt } from './cityDistricts.js';
import { ARCHETYPES, ARCH_WEIGHTS, DISTRICTS, DISTRICT_KEYS, SAFE_DISTRICTS, floorsFor } from './archetypes.js';
import { DISTRICT_KEYS as BRAND_DISTRICT_KEYS, DISTRICT_NAMES } from './cityBrands.js';
import { districtAt as districtAtSeed, getCityPlan, safeAt as safeAtSeed } from './cityPlan.js';
import { canalCenterZ } from './cityRoads.js';
import { citySeed } from './cityPlanTestKit.js';

describe('bölgeler (güç diyagramı)', () => {
  it('anahtarlar cityBrands ile aynı (sıra ve adlar)', () => {
    expect(DISTRICT_KEYS).toEqual(BRAND_DISTRICT_KEYS);
    DISTRICT_KEYS.forEach((k, i) => {
      expect(DISTRICTS[k].idx).toBe(i);
      expect(DISTRICTS[k].name).toBe(DISTRICT_NAMES[k]);
    });
  });

  it('harita kapsaması: kara üzerindeki her nokta bir bölgeye ait; her bölge ≥%8 alan; Merkez orijinde', () => {
    for (let i = 0; i < 80; i++) {
      const d = buildDistricts(citySeed(i));
      expect(d.sites.length).toBe(6);
      expect(d.districtAt(0, 0)).toBe('merkez');
      const cnt = new Array(6).fill(0);
      let tot = 0;
      for (let z = -725; z < 730; z += 25) {
        for (let x = -725; x < 730; x += 25) {
          const k = d.districtAt(x, z);
          expect(DISTRICT_KEYS).toContain(k);
          cnt[DISTRICTS[k].idx]++;
          tot++;
        }
      }
      cnt.forEach((c, idx) => {
        if (c / tot < 0.08) throw new Error('bölge çok küçük: seed#' + i + ' ' + DISTRICT_KEYS[idx] + ' ' + (c / tot).toFixed(3));
      });
    }
  });

  it('Liman kanal bandını büyük ölçüde kapsar (≥%65); Tepe kuzeybatıda, Pazar doğuda', () => {
    for (let i = 0; i < 40; i++) {
      const d = buildDistricts(citySeed(i));
      let liman = 0;
      let n = 0;
      for (let x = -720; x <= 720; x += 10) {
        n++;
        if (d.districtAt(x, canalCenterZ(x)) === 'liman') liman++;
      }
      expect(liman / n).toBeGreaterThan(0.65);
      const tepe = d.sites[5];
      expect(tepe.x).toBeLessThan(0);
      expect(tepe.z).toBeLessThan(0);
      expect(d.sites[1].x).toBeGreaterThan(300);
      expect(d.sites[3].z).toBeGreaterThan(550);
    }
  });

  it('belirlenimci; farklı tohumlarda çapalar değişir; plan sarmalayıcıları aynı sonucu verir', () => {
    const a = buildDistricts(citySeed(1));
    const b = buildDistricts(citySeed(1));
    const c = buildDistricts(citySeed(2));
    expect(JSON.stringify(a.sites)).toBe(JSON.stringify(b.sites));
    expect(JSON.stringify(a.sites)).not.toBe(JSON.stringify(c.sites));
    for (let k = 0; k < 200; k++) {
      const x = ((k * 97) % 1400) - 700;
      const z = ((k * 211) % 1400) - 700;
      expect(a.districtAt(x, z)).toBe(b.districtAt(x, z));
      expect(districtAtSeed(citySeed(1), x, z)).toBe(a.districtAt(x, z));
      expect(districtAt(getCityPlan(citySeed(1)), x, z)).toBe(a.districtAt(x, z));
    }
    expect(districtAtSeed(citySeed(1), 5, 5, 20)).toBe(UNDERGROUND_KEY);
    expect(districtName(UNDERGROUND_KEY)).toBe('Alt Şehir');
    expect(districtName('merkez')).toBe('Merkez');
    expect(districtName('yok')).toBe('');
  });
});

describe('safeAt (robot güvenli bölge)', () => {
  it('Merkez/Gece Pazarı/Teknoloji/Tepe güvenli; Konteyner ve Liman açıkta güvensiz; yeraltında güvensiz; terminal ve meydan çevresi 24 blok güvenli', () => {
    expect(SAFE_DISTRICTS).toEqual(['merkez', 'gece_pazari', 'teknoloji', 'tepe']);
    for (let i = 0; i < 20; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      let unsafeSeen = 0;
      for (let z = -720; z < 720; z += 20) {
        for (let x = -720; x < 720; x += 20) {
          const dk = plan.districts.districtAt(x, z);
          const near = plan.terminals.some((t) => (x - t.x) ** 2 + (z - t.z) ** 2 <= 24 * 24) || x * x + z * z <= 8100;
          const expected = SAFE_DISTRICTS.indexOf(dk) >= 0 || near;
          expect(safeAt(plan, x, z)).toBe(expected);
          expect(safeAtSeed(seed, x, z)).toBe(expected);
          if (!expected) unsafeSeen++;
          expect(safeAt(plan, x, z, 30)).toBe(false); // yeraltı
          expect(safeAt(plan, x, z, 64)).toBe(expected);
        }
      }
      expect(unsafeSeen).toBeGreaterThan(300);
      plan.terminals.forEach((t) => {
        expect(safeAt(plan, t.x + 20, t.z, t.y)).toBe(true);
        expect(safeAt(plan, t.x, t.z + 23, t.y)).toBe(true);
      });
    }
  });
});

describe('arketip tabloları', () => {
  it('bölge yükseklik aralıkları sözleşmedeki gibi; ağırlık tabloları geçerli arketiplere işaret eder', () => {
    expect([DISTRICTS.merkez.hMin, DISTRICTS.merkez.hMax]).toEqual([90, 236]);
    expect([DISTRICTS.gece_pazari.hMin, DISTRICTS.gece_pazari.hMax]).toEqual([12, 32]);
    expect([DISTRICTS.konteyner.hMin, DISTRICTS.konteyner.hMax]).toEqual([8, 28]);
    expect([DISTRICTS.liman.hMin, DISTRICTS.liman.hMax]).toEqual([10, 40]);
    expect([DISTRICTS.teknoloji.hMin, DISTRICTS.teknoloji.hMax]).toEqual([24, 80]);
    expect([DISTRICTS.tepe.hMin, DISTRICTS.tepe.hMax]).toEqual([8, 24]);
    expect([DISTRICTS.merkez.sideMin, DISTRICTS.merkez.sideMax]).toEqual([28, 64]);
    DISTRICT_KEYS.forEach((k) => {
      Object.keys(ARCH_WEIGHTS[k]).forEach((a) => {
        expect(ARCHETYPES[a]).toBeTruthy();
        expect(ARCH_WEIGHTS[k][a]).toBeGreaterThan(0);
      });
    });
    expect(Object.keys(ARCHETYPES).length).toBeGreaterThanOrEqual(18);
  });

  it('floorsFor: her hash ve her arketip için floors·4 bölge aralığında; Merkez merkeze yaklaştıkça kuleler uzar', () => {
    DISTRICT_KEYS.forEach((dk) => {
      Object.keys(ARCH_WEIGHTS[dk]).forEach((ak) => {
        const A0 = ARCHETYPES[ak];
        for (let k = 0; k < 200; k++) {
          const f = floorsFor(dk, ak, k / 200, k);
          if (!A0.building) {
            expect(f).toBe(0);
            continue;
          }
          expect(f * 4).toBeGreaterThanOrEqual(DISTRICTS[dk].hMin);
          expect(f * 4).toBeLessThanOrEqual(DISTRICTS[dk].hMax);
        }
      });
    });
    let near = 0;
    let far = 0;
    for (let k = 0; k < 100; k++) {
      near += floorsFor('merkez', 'kule_cam', k / 100, 20);
      far += floorsFor('merkez', 'kule_cam', k / 100, 290);
    }
    expect(near).toBeGreaterThan(far);
    expect(floorsFor('merkez', 'kule_cam', 0.999, 0)).toBe(59);
    expect(floorsFor('yok', 'kule_cam', 0.5, 0)).toBe(0);
    expect(floorsFor('merkez', 'park', 0.5, 0)).toBe(0);
  });
});
