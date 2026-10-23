import { describe, expect, it } from 'vitest';
import {
  ACCENT_HEX, ANIM, HAIR_HEX, PED_TYPE, PED_TYPE_KEYS, ROLE, ROLE_COUNT, SKIN_HEX, ST, TIER_CAPS, TYPE_DEF, UMBRELLA_HEX, densityAt, isNightPhase, lookHash, newLook,
  pickType, rollLook, roleWeights, rushAt, unpackRgb,
} from './pedData.js';
import { scanText } from '../citySafeData.js';
import { hash32 } from '../../rng.js';

describe('pedData: sabitler ve kademeler', () => {
  it('kademe tavanları sözleşme §10/§17: 60/40/24, yakın ≤ 24, orta ≤ 40, yakın+orta ≤ toplam', () => {
    expect(TIER_CAPS.high.total).toBe(60);
    expect(TIER_CAPS.medium.total).toBe(40);
    expect(TIER_CAPS.low.total).toBe(24);
    Object.keys(TIER_CAPS).forEach((k) => {
      const c = TIER_CAPS[k];
      expect(c.near).toBeLessThanOrEqual(24);
      expect(c.mid).toBeLessThanOrEqual(40);
      expect(c.near + c.mid).toBeLessThanOrEqual(c.total);
      expect(c.nearR).toBeLessThan(c.midR);
      expect(c.midR).toBeLessThan(c.despawnR);
      expect(c.spawnMin).toBeLessThan(c.spawnMax);
      expect(c.spawnMax).toBeLessThan(c.despawnR);
    });
  });

  it('türler robotsuz: halk çocuk turist kurye sporcu yaşlı; hız/boy aralıkları makul', () => {
    expect(PED_TYPE_KEYS).toEqual(['halk', 'cocuk', 'turist', 'kurye', 'sporcu', 'yasli']);
    PED_TYPE_KEYS.forEach((k, i) => {
      expect(PED_TYPE[k]).toBe(i);
      const d = TYPE_DEF[i];
      expect(d.key).toBe(k);
      expect(d.speed[0]).toBeGreaterThan(0.5);
      expect(d.speed[1]).toBeLessThan(4);
      expect(d.h[0]).toBeGreaterThan(0.5);
      expect(d.h[1]).toBeLessThan(1.2);
    });
    expect(Object.keys(ANIM).length).toBeGreaterThanOrEqual(12);
    expect(ST.CROSS).not.toBe(ST.WAIT);
  });

  it('pickType ağırlıklı ve belirlenimli: halk çoğunluk, her tür çıkar', () => {
    const cnt = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) cnt[pickType(hash32(i + 1))]++;
    cnt.forEach((c) => expect(c).toBeGreaterThan(50));
    expect(cnt[0]).toBeGreaterThan(cnt[1] * 3);
    expect(pickType(123456)).toBe(pickType(123456));
  });
});

describe('pedData: gün çizelgesi', () => {
  it('Gece Pazarı geceleri gündüzden çok yoğun; Merkez yoğun saatte; her değer 0..1', () => {
    expect(densityAt('gece_pazari', 0.6)).toBeGreaterThan(densityAt('gece_pazari', 0.08) * 3);
    expect(densityAt('gece_pazari', 0.6)).toBeGreaterThan(densityAt('konteyner', 0.6));
    expect(densityAt('merkez', 0.05)).toBeGreaterThan(densityAt('merkez', 0.3));
    for (const d of ['merkez', 'gece_pazari', 'konteyner', 'liman', 'teknoloji', 'tepe', 'bilinmez']) {
      for (let p = 0; p <= 2; p += 0.01) {
        const v = densityAt(d, p);
        expect(v).toBeGreaterThan(0.05);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(Number.isFinite(densityAt('merkez', NaN))).toBe(true);
  });

  it('metro yoğun saati şafakta ve gün batımında; öğle ve gece yarısı düşük', () => {
    expect(rushAt(0.04)).toBeGreaterThan(0.9);
    expect(rushAt(0.48)).toBeGreaterThan(0.9);
    expect(rushAt(0.28)).toBeLessThan(0.1);
    expect(rushAt(0.78)).toBeLessThan(0.1);
    expect(isNightPhase(0.75)).toBe(true);
    expect(isNightPhase(0.25)).toBe(false);
  });

  it('rol ağırlıkları: kulüp yalnız gece ve pazar/merkezde; yoğun saatte işe gidiş artar; hepsi ≥ 0', () => {
    const w = new Float32Array(ROLE_COUNT);
    roleWeights('gece_pazari', 0.65, 0, w);
    const club = w[ROLE.CLUB];
    const shop = w[ROLE.SHOP];
    roleWeights('gece_pazari', 0.25, 0, w);
    expect(w[ROLE.CLUB]).toBeLessThan(club / 5);
    expect(w[ROLE.SHOP]).toBeLessThan(shop);
    roleWeights('konteyner', 0.65, 0, w);
    expect(w[ROLE.CLUB]).toBeLessThan(0.05);
    roleWeights('merkez', 0.04, 0, w);
    const rush = w[ROLE.COMMUTE];
    roleWeights('merkez', 0.28, 0, w);
    expect(rush).toBeGreaterThan(w[ROLE.COMMUTE] * 2);
    for (let i = 0; i < ROLE_COUNT; i++) expect(w[i]).toBeGreaterThanOrEqual(0);
  });
});

describe('pedData: görünüm', () => {
  it('rollLook belirlenimli, aralıklar içinde, 3000 örnekte NaN yok', () => {
    const a = rollLook(77, 12, 0, 'merkez', null);
    const b = rollLook(77, 12, 0, 'merkez', newLook());
    expect(lookHash(a)).toBe(lookHash(b));
    expect(lookHash(rollLook(78, 12, 0, 'merkez', null))).not.toBe(lookHash(a));
    for (let i = 0; i < 3000; i++) {
      const type = i % 6;
      const L = rollLook(i * 7, i, type, ['merkez', 'gece_pazari', 'konteyner', 'liman', 'teknoloji', 'tepe'][i % 6], null);
      expect(L.skin).toBeGreaterThanOrEqual(0);
      expect(L.skin).toBeLessThan(SKIN_HEX.length);
      expect(L.hair).toBeGreaterThanOrEqual(0);
      expect(L.hair).toBeLessThan(7);
      expect(L.hat).toBeGreaterThanOrEqual(0);
      expect(L.hat).toBeLessThanOrEqual(4);
      expect(L.acc).toBeGreaterThanOrEqual(0);
      expect(L.acc).toBeLessThanOrEqual(6);
      expect(L.top).toBeGreaterThanOrEqual(0);
      expect(L.top).toBeLessThanOrEqual(3);
      expect(HAIR_HEX).toContain(L.cHair);
      expect(ACCENT_HEX).toContain(L.cAcc);
      expect(UMBRELLA_HEX).toContain(L.cUmb);
      [L.h, L.sh, L.gi, L.sp, L.head, L.glow, L.vmax, L.latPref].forEach((v) => expect(Number.isFinite(v)).toBe(true));
      expect(L.h).toBeGreaterThan(TYPE_DEF[type].h[0] - 1e-6);
      expect(L.h).toBeLessThan(TYPE_DEF[type].h[1] + 1e-6);
      expect(L.vmax).toBeGreaterThanOrEqual(TYPE_DEF[type].speed[0] - 1e-6);
      expect(L.vmax).toBeLessThanOrEqual(TYPE_DEF[type].speed[1] + 1e-6);
      if (type === PED_TYPE.kurye) expect(L.acc).toBe(4);
      if (type === PED_TYPE.cocuk) expect(L.hat).toBeLessThan(3);
    }
  });

  it('görünüm çeşitliliği: 400 yayada ≥ 380 farklı özet, her bölgede çok renk, ten/saç/aksesuar tüm değerler görülür', () => {
    const hs = new Set();
    const skins = new Set();
    const hairs = new Set();
    const accs = new Set();
    const hats = new Set();
    const tops = new Set();
    for (let i = 0; i < 400; i++) {
      const L = rollLook(5, i, pickType(hash32(i + 77)), 'merkez', null);
      hs.add(lookHash(L));
      skins.add(L.skin); hairs.add(L.hair); accs.add(L.acc); hats.add(L.hat); tops.add(L.top);
    }
    expect(hs.size).toBeGreaterThan(380);
    expect(skins.size).toBe(8);
    expect(hairs.size).toBe(7);
    expect(accs.size).toBe(7);
    expect(hats.size).toBe(5);
    expect(tops.size).toBe(4);
    ['merkez', 'gece_pazari', 'konteyner', 'liman', 'teknoloji', 'tepe'].forEach((d) => {
      const cols = new Set();
      for (let i = 0; i < 200; i++) cols.add(rollLook(1, i, 0, d, null).cTop);
      expect(cols.size).toBeGreaterThanOrEqual(5);
    });
    // bölgeye göre palet farkı
    const cm = new Set();
    const cp = new Set();
    for (let i = 0; i < 300; i++) {
      cm.add(rollLook(1, i, 0, 'konteyner', null).cTop);
      cp.add(rollLook(1, i, 0, 'merkez', null).cTop);
    }
    expect([...cm].filter((c) => cp.has(c)).length).toBeLessThan(cm.size);
  });

  it('unpackRgb 0..1; kaynak dizgeleri güvenli (marka/şiddet taraması)', () => {
    const c = unpackRgb(0xff8000, []);
    expect(c[0]).toBeCloseTo(1, 5);
    expect(c[1]).toBeCloseTo(128 / 255, 5);
    expect(c[2]).toBe(0);
    ['halk', 'cocuk', 'turist', 'kurye', 'sporcu', 'yasli', 'gece_pazari', 'merkez'].forEach((s) => expect(scanText(s)).toEqual([]));
  });
});
