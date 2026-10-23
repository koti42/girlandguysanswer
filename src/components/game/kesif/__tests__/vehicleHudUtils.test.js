import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS, MIN_TARGET, PREFS_KEY, announceFor, arcFraction, classStats, driveLayout, formatClock, gearLabel, loadPrefs, minimapRange, projectHeadingUp, sanitizePrefs, savePrefs, speedoMaxKmh,
} from '../city/vehicleHudUtils.js';
import { VEHICLE_CLASSES, VEHICLE_DEFS } from '../../../../game/kesif/sim/city/vehicle/vehicleData.js';
import {
  SHAPES, apiMessage, buyState, previewModel, rentState, shapePath, swatchHex,
} from '../city/garageUtils.js';
import { isSafeText } from '../../../../game/kesif/sim/city/citySafeData.js';

describe('vehicleHudUtils', () => {
  it('gearLabel: R/N/rakam; hover ve tahta tek vites H; sınır güvenli', () => {
    expect(gearLabel(-1, 'taksi')).toBe('R');
    expect(gearLabel(0, 'taksi')).toBe('N');
    expect(gearLabel(3, 'spor')).toBe('3');
    expect(gearLabel(1, 'hoverbike')).toBe('H');
    expect(gearLabel(-1, 'suzulkay')).toBe('R');
    expect(gearLabel(NaN, 'taksi')).toBe('N');
    expect(gearLabel(99, 'taksi')).toBe('9');
    expect(gearLabel(2, 'bilinmeyen')).toBe('2');
  });

  it('speedoMaxKmh: nitro dahil azami hızın üstü, 20\'ye yuvarlı; tüm sınıflar', () => {
    VEHICLE_CLASSES.forEach((c) => {
      const d = VEHICLE_DEFS[c];
      const m = speedoMaxKmh(c);
      expect(m % 20).toBe(0);
      expect(m).toBeGreaterThanOrEqual(d.max * d.nitro.spd * 3.6);
      expect(m).toBeLessThan(d.max * d.nitro.spd * 3.6 + 20.0001);
    });
    expect(speedoMaxKmh('x')).toBe(160);
  });

  it('arcFraction/formatClock', () => {
    expect(arcFraction(50, 100)).toBe(0.5);
    expect(arcFraction(500, 100)).toBe(1);
    expect(arcFraction(-4, 100)).toBe(0);
    expect(arcFraction(NaN, 100)).toBe(0);
    expect(arcFraction(5, 0)).toBe(1);
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
  });

  it('driveLayout: şartname taban boyutları (96/72/64/56), hepsi ≥ 44; dikey ve yatay; ölçek yalnız büyütür; NaN güvenli', () => {
    [false, true].forEach((portrait) => {
      [0.7, 0.78, 1, 1.15, 5, NaN].forEach((scale) => {
        const L = driveLayout({
          w: portrait ? 390 : 844, h: portrait ? 844 : 390, portrait, scale,
        });
        const sizes = [L.steer, L.gas.w, L.gas.h, L.brake.w, L.brake.h, L.nitro, L.hand, L.small];
        sizes.forEach((s) => expect(s).toBeGreaterThanOrEqual(MIN_TARGET));
        expect(L.gas.w).toBeGreaterThanOrEqual(portrait ? 88 : 96);
        expect(L.brake.w).toBeGreaterThanOrEqual(portrait ? 68 : 72);
        expect(L.nitro).toBeGreaterThanOrEqual(64);
        expect(L.hand).toBeGreaterThanOrEqual(56);
        expect(L.small).toBeGreaterThanOrEqual(48);
        expect(L.gas.w).toBeGreaterThan(L.brake.w);
      });
    });
    expect(driveLayout({ scale: 1.15 }).gas.w).toBeGreaterThan(driveLayout({ scale: 1 }).gas.w);
    expect(driveLayout().steer).toBeGreaterThanOrEqual(128);
  });

  it('announceFor: bindin / indin / kiralık süre / akış sınırı; değişim yoksa boş', () => {
    const a = { cls: 'taksi', rent: 0 };
    expect(announceFor(null, a)).toBe('Araca bindin: Meridyen Taksi.');
    expect(announceFor(a, null)).toBe('Araçtan indin.');
    expect(announceFor(a, { ...a, rent: 59 })).toMatch(/dolmak üzere/);
    expect(announceFor({ ...a, rent: 59 }, { ...a, rent: 58 })).toBe('');
    expect(announceFor(a, { ...a, slow: true })).toMatch(/yükleniyor/);
    expect(announceFor(a, a)).toBe('');
    expect(announceFor(null, null)).toBe('');
    expect(announceFor(null, { cls: 'bilinmeyen' })).toBe('Araca bindin: araç.');
  });

  it('classStats: her sınıf için 6 özellik, oran 0..1, Türkçe etiket; kamyonet koli bilgisi', () => {
    VEHICLE_CLASSES.forEach((c) => {
      const st = classStats(c);
      expect(st).toHaveLength(6);
      st.forEach((s) => {
        expect(s.frac).toBeGreaterThan(0);
        expect(s.frac).toBeLessThanOrEqual(1);
        expect(s.label.length).toBeGreaterThan(1);
        expect(s.text.length).toBeGreaterThan(0);
      });
    });
    expect(classStats('kamyonet').find((s) => s.key === 'koltuk').text).toMatch(/3 koli/);
    expect(classStats('spor').find((s) => s.key === 'hiz').frac).toBeGreaterThan(classStats('kamyonet').find((s) => s.key === 'hiz').frac);
    expect(classStats('yok')).toEqual([]);
  });

  it('projectHeadingUp: ileri her zaman yukarı (y<0), sağ her zaman sağ (x>0)', () => {
    const o = {};
    for (let yaw = -6; yaw <= 6; yaw += 0.37) {
      projectHeadingUp(-Math.sin(yaw), -Math.cos(yaw), yaw, o); // ileri
      expect(o.x).toBeCloseTo(0, 9);
      expect(o.y).toBeCloseTo(-1, 9);
      projectHeadingUp(Math.cos(yaw), -Math.sin(yaw), yaw, o); // sağ
      expect(o.x).toBeCloseTo(1, 9);
      expect(o.y).toBeCloseTo(0, 9);
    }
  });

  it('minimapRange: hızla açılır, sınırlı, büyük harita daha geniş', () => {
    expect(minimapRange(0, false)).toBe(90);
    expect(minimapRange(40, false)).toBeGreaterThan(minimapRange(10, false));
    expect(minimapRange(500, false)).toBeLessThanOrEqual(230);
    expect(minimapRange(20, true)).toBeGreaterThan(minimapRange(20, false));
    expect(minimapRange(NaN, false)).toBe(90);
  });

  it('tercihler: temizleme, varsayılan, localStorage hata/yokluğunda çökmez, gidiş-dönüş', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({
      steerMode: 'slider', autoThrottle: true, laneAssist: 'on', hints: false, junk: 1,
    })).toEqual({
      steerMode: 'slider', autoThrottle: true, laneAssist: 'on', hints: false,
    });
    expect(sanitizePrefs({ steerMode: 'x', autoThrottle: 'evet', laneAssist: 5 })).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs([])).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs(JSON.parse('{"__proto__":{"steerMode":"slider"}}'))).toEqual(DEFAULT_PREFS);
    // node: localStorage yok → varsayılan; kaydetmek sessizce yoksayılır
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs({ steerMode: 'slider' })).not.toThrow();
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = v;
      },
    };
    try {
      savePrefs({ steerMode: 'slider', autoThrottle: true });
      expect(JSON.parse(store[PREFS_KEY])).toMatchObject({ steerMode: 'slider', autoThrottle: true });
      expect(loadPrefs().steerMode).toBe('slider');
      store[PREFS_KEY] = '{bozuk';
      expect(loadPrefs()).toEqual(DEFAULT_PREFS);
      globalThis.localStorage = {
        getItem() {
          throw new Error('kapalı');
        },
        setItem() {
          throw new Error('kapalı');
        },
      };
      expect(loadPrefs()).toEqual(DEFAULT_PREFS);
      expect(() => savePrefs({})).not.toThrow();
    } finally {
      delete globalThis.localStorage;
    }
  });
});

describe('garageUtils', () => {
  const entry = (o) => ({
    cls: 'spor', name: 'Şimşek GT', price: 1800, rent: 40, unlocked: true, needKm: 0, owned: false, ...o,
  });
  it('buyState: sahip > dolu > kilit > kredi > tamam sırası', () => {
    expect(buyState(entry({ owned: true }), 9999, 1, 6).reason).toBe('sahip');
    expect(buyState(entry(), 9999, 6, 6).reason).toBe('dolu');
    expect(buyState(entry({ unlocked: false, needKm: 8 }), 9999, 1, 6)).toMatchObject({ reason: 'kilit', text: 'Kilitli: 8 km sür' });
    expect(buyState(entry(), 100, 1, 6)).toMatchObject({ reason: 'kredi', text: 'Yetersiz Kredi: 1700 eksik' });
    expect(buyState(entry(), 1800, 1, 6)).toMatchObject({ ok: true, text: '1800 Kredi' });
    expect(buyState(entry({ price: 0 }), 0, 0, 6)).toMatchObject({ ok: true, text: 'Ücretsiz' });
    expect(buyState(null, 1, 1, 6).ok).toBe(false);
  });
  it('rentState', () => {
    expect(rentState(entry(), 100, true).reason).toBe('kiralik');
    expect(rentState(entry(), 10, false)).toMatchObject({ reason: 'kredi', text: 'Yetersiz Kredi: 30 eksik' });
    expect(rentState(entry(), 40, false)).toMatchObject({ ok: true, text: '40 Kredi · 10 dk' });
    expect(rentState(entry({ rent: 0 }), 0, false)).toMatchObject({ ok: true, text: 'Ücretsiz' });
  });
  it('apiMessage: bilinen nedenler Türkçe, bilinmeyen ve bozuk sonuç güvenli', () => {
    expect(apiMessage('buy', { ok: true })).toBe('Araç garajına eklendi.');
    expect(apiMessage('buy', { ok: false, reason: 'kilit' })).toMatch(/daha çok sürmelisin/);
    expect(apiMessage('rent', { ok: false, reason: 'uzak' })).toMatch(/Kiralama noktasına/);
    expect(apiMessage('summon', { ok: false, reason: 'park' })).toMatch(/park yeri/);
    expect(apiMessage('summon', { ok: false, reason: '__proto__' })).toBe('İşlem yapılamadı.');
    expect(apiMessage('buy', null)).toBe('İşlem yapılamadı.');
    expect(apiMessage('yok', { ok: true })).toBe('Araç garajına eklendi.');
  });
  it('swatchHex/previewModel/shapePath güvenli', () => {
    expect(swatchHex([{ hex: 0x19d3da }], 0)).toBe('#19d3da');
    expect(swatchHex([], 3)).toBe('#8a909c');
    expect(swatchHex(null, 0)).toBe('#8a909c');
    expect(swatchHex([{ hex: NaN }], 0)).toBe('#8a909c');
    const m = previewModel(
      { swatches: { body: [{ hex: 0xff0000 }], accent: [{ hex: 0 }], neon: [{ hex: 0x00ff00 }] } },
      'spor',
      { body: 0, accent: 0, neon: 0, under: { on: true, color: 0, pattern: 1 }, wheels: 2, plate: 1 }
    );
    expect(m).toMatchObject({ kind: 'araba', body: '#ff0000', glow: '#00ff00', wheelStyle: 'neon', pattern: 1 });
    expect(previewModel(null, 'hoverbike', null).kind).toBe('hover');
    expect(shapePath('yok')).toBe(SHAPES.daire);
    expect(shapePath('__proto__')).toBe(SHAPES.daire);
  });
});

describe('aile dostu metin taraması', () => {
  it('sınıf özellik etiketleri, garaj iletileri ve sürüş duyuruları güvenli', () => {
    const texts = [];
    VEHICLE_CLASSES.forEach((c) => classStats(c).forEach((s) => texts.push(s.label, s.text)));
    ['buy', 'rent', 'summon'].forEach((k) => ['ok', 'kredi', 'kilit', 'uzak', 'park', 'dolu'].forEach((r) => texts.push(apiMessage(k, { ok: r === 'ok', reason: r }))));
    texts.push('Araca bindin: Meridyen Taksi.', 'Araçtan indin.', 'Kiralık aracın süresi dolmak üzere.', 'Şehir yükleniyor: hız sınırlandı.');
    texts.forEach((t) => expect(isSafeText(t), t).toBe(true));
  });
});
