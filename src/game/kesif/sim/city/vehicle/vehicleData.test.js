import { describe, expect, it } from 'vitest';
import {
  COSMETICS, RENTAL_SECONDS, VEHICLE_CLASSES, VEHICLE_DEFS, defaultCosmetics, getVehicleDef, isVehicleClass, plateFor, purchasePrice, rentalPrice, sanitizeCosmetics,
  turnRadiusAt, unlockStatus, validateAllVehicles, validateVehicleDef, vehicleSpec,
} from './vehicleData.js';
import { HUD_VEHICLE_CLASSES } from '../../../hudStore.js';
import { isSafeText, scanText } from '../citySafeData.js';

describe('araç verisi', () => {
  it('sınıf sırası hudStore ile aynı; tüm tanımlar geçerli ve donuk', () => {
    expect(VEHICLE_CLASSES).toEqual(HUD_VEHICLE_CLASSES);
    expect(validateAllVehicles()).toEqual([]);
    VEHICLE_CLASSES.forEach((c) => {
      expect(Object.isFrozen(VEHICLE_DEFS[c])).toBe(true);
      expect(VEHICLE_DEFS[c].key).toBe(c);
      expect(isVehicleClass(c)).toBe(true);
    });
  });

  it('tasarım tablosu sayıları (design_vehicles §2)', () => {
    const t = VEHICLE_DEFS;
    expect([t.taksi.max, t.taksi.accel, t.taksi.brake, t.taksi.steerDeg, t.taksi.omegaMax, t.taksi.gripK]).toEqual([28, 10, 22, 32, 2.2, 9]);
    expect([t.spor.max, t.spor.accel, t.spor.brake, t.spor.steerDeg]).toEqual([40, 16, 26, 28]);
    expect([t.kamyonet.max, t.kamyonet.accel, t.kamyonet.brake, t.kamyonet.steerDeg]).toEqual([24, 7, 18, 26]);
    expect([t.motor.max, t.motor.accel, t.motor.steerDeg, t.motor.omegaMax]).toEqual([36, 14, 40, 3.0]);
    expect([t.hoverbike.max, t.hoverbike.accel, t.hoverbike.gripK, t.hoverbike.hover]).toEqual([44, 18, 2.2, 1.2]);
    expect([t.suzulkay.max, t.suzulkay.accel, t.suzulkay.omegaMax, t.suzulkay.hover]).toEqual([22, 12, 3.4, 0.35]);
    expect([t.taksi.price, t.spor.price, t.kamyonet.price, t.motor.price, t.hoverbike.price, t.suzulkay.price]).toEqual([600, 1800, 800, 400, 2400, 0]);
    expect(rentalPrice('taksi')).toBe(20);
    expect(RENTAL_SECONDS).toBe(600);
    expect(rentalPrice('suzulkay')).toBe(0);
    expect(purchasePrice('hoverbike')).toBe(2400);
  });

  it('prototip anahtarları ve bilinmeyen sınıflar güvenli', () => {
    ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', null, undefined, 5, {}].forEach((k) => {
      expect(isVehicleClass(k)).toBe(false);
      expect(getVehicleDef(k)).toBe(null);
    });
    expect(vehicleSpec('nope')).toBe(null);
    expect(Number.isNaN(turnRadiusAt('nope', 3))).toBe(true);
    expect(unlockStatus('nope', {}).ok).toBe(false);
  });

  it('şartname: 0→%97 süresi aralığı mantıklı, dönüş yarıçapı formülü', () => {
    VEHICLE_CLASSES.forEach((c) => {
      const s = vehicleSpec(c);
      const d = VEHICLE_DEFS[c];
      expect(s.t97Max).toBeCloseTo((1.45 * d.max) / d.accel, 9);
      expect(s.t97Min).toBeLessThan(s.t97Max);
      expect(s.turnRadiusLow).toBeCloseTo(d.wheelbase / Math.tan((d.steerDeg * Math.PI) / 180), 9);
      expect(turnRadiusAt(c, 0)).toBeCloseTo(s.turnRadiusLow, 9);
      expect(turnRadiusAt(c, 20)).toBeGreaterThan(turnRadiusAt(c, 2));
    });
  });

  it('kilit: Süzülkay ücretsiz ve kilitsiz; diğerleri km ile açılır', () => {
    expect(unlockStatus('suzulkay', { km: 0 }).ok).toBe(true);
    expect(unlockStatus('taksi', { km: 0 }).ok).toBe(true);
    expect(unlockStatus('spor', { km: 0 })).toEqual({ ok: false, reason: 'km', need: 8 });
    expect(unlockStatus('spor', { km: 8 }).ok).toBe(true);
    expect(unlockStatus('hoverbike', { km: NaN }).ok).toBe(false);
  });

  it('doğrulayıcı bozuk tanımları yakalar', () => {
    const bad = Object.assign({}, VEHICLE_DEFS.taksi, { max: -1, gears: [0.5, 0.4, 1], step: [1.5, 0.2] });
    const e = validateVehicleDef(bad);
    expect(e.length).toBeGreaterThanOrEqual(3);
    expect(validateVehicleDef(null)).toEqual(['tanım nesne değil']);
  });
});

describe('kozmetik', () => {
  it('sabit örnek sayıları ve şekil+ad (renk körü dostu)', () => {
    expect(COSMETICS.body.length).toBe(16);
    expect(COSMETICS.accent.length).toBe(16);
    expect(COSMETICS.neon.length).toBe(12);
    expect(COSMETICS.wheels.length).toBe(4);
    expect(COSMETICS.underPatterns).toEqual(['sabit', 'nefes', 'dalga']);
    [COSMETICS.body, COSMETICS.accent, COSMETICS.neon].forEach((list) => {
      const names = list.map((s) => s.name);
      expect(new Set(names).size).toBe(list.length);
      list.forEach((s) => {
        expect(typeof s.name).toBe('string');
        expect(Number.isInteger(s.hex) && s.hex >= 0 && s.hex <= 0xffffff).toBe(true);
        expect(['daire', 'üçgen', 'kare', 'yıldız', 'elmas']).toContain(s.shape);
      });
    });
  });

  it('sanitizeCosmetics her zaman sınırlı tamsayı üretir (fuzz)', () => {
    const junk = [null, undefined, 5, 'x', [], { body: NaN, accent: Infinity, neon: -9, under: 'x', wheels: 99, plate: 7, horn: 1e9, radio: -1 },
      { body: 3.7, under: { on: 'yes', color: 4.2, pattern: 9 } }, JSON.parse('{"__proto__":{"body":5},"body":2}')];
    junk.forEach((j) => {
      const c = sanitizeCosmetics(j, 'taksi');
      expect(Number.isInteger(c.body) && c.body >= 0 && c.body < 16).toBe(true);
      expect(Number.isInteger(c.accent) && c.accent >= 0 && c.accent < 16).toBe(true);
      expect(Number.isInteger(c.neon) && c.neon >= 0 && c.neon < 12).toBe(true);
      expect(c.under.on === true || c.under.on === false).toBe(true);
      expect(c.under.pattern >= 0 && c.under.pattern < 3).toBe(true);
      expect(c.wheels >= 0 && c.wheels < 4).toBe(true);
      expect(c.plate >= 0 && c.plate < 3).toBe(true);
      expect(c.horn >= 0 && c.horn < 4).toBe(true);
      expect(Object.keys(c).sort()).toEqual(['accent', 'body', 'horn', 'neon', 'plate', 'radio', 'under', 'wheels']);
    });
    expect(sanitizeCosmetics({ body: 3.7 }, 'taksi').body).toBe(3);
    expect(Object.prototype.hasOwnProperty.call(sanitizeCosmetics(JSON.parse('{"__proto__":{"x":1}}'), 'spor'), 'x')).toBe(false);
  });

  it('varsayılan kozmetik belirlenimci; plaka belirlenimci ve aile dostu', () => {
    expect(defaultCosmetics('spor', 5)).toEqual(defaultCosmetics('spor', 5));
    expect(plateFor(77, 0)).toBe(plateFor(77, 0));
    const seen = new Set();
    for (let i = 0; i < 3; i++) seen.add(plateFor(1234, i));
    expect(seen.size).toBe(3);
    for (let s = 0; s < 200; s++) expect(plateFor(s, s & 7)).toMatch(/^NM-[A-Z]{2} \d{4}$/);
  });

  it('adlar ve açıklamalar yasak sözcük / gerçek marka içermez', () => {
    const text = [];
    VEHICLE_CLASSES.forEach((c) => text.push(VEHICLE_DEFS[c].name, VEHICLE_DEFS[c].desc));
    COSMETICS.body.concat(COSMETICS.accent, COSMETICS.neon).forEach((s) => text.push(s.name));
    COSMETICS.wheels.concat(COSMETICS.horns).forEach((s) => text.push(s.name));
    text.forEach((t) => {
      expect(scanText(t), t).toEqual([]);
      expect(isSafeText(t)).toBe(true);
    });
  });
});
