import { describe, expect, it } from 'vitest';
import {
  MAX_OWNED, VEHICLE_SAVE_KEYS, defaultVehicleSave, readVehicleSave, sanitizeVehicleSave, writeVehicleSave,
} from './vehicleSave.js';
import { VEHICLE_CLASSES } from './vehicleData.js';
import { makeRng } from './vehicleTestKit.js';

describe('araç kaydı', () => {
  it('varsayılan ve gidiş-dönüş', () => {
    expect(sanitizeVehicleSave(defaultVehicleSave())).toEqual(defaultVehicleSave());
    const good = {
      garage: { owned: [{ cls: 'taksi', cos: { body: 2 } }, { cls: 'spor' }], active: 1 },
      summoned: { idx: 1, x: 10.123456, y: 64, z: -20, yaw: 1.23456789 },
      rental: { cls: 'motor', left: 321.456, x: 1, y: 64, z: 2, yaw: 0 },
      vstats: { km: 3.14159265, enters: 7 },
    };
    const a = sanitizeVehicleSave(good);
    expect(a.garage.owned.map((o) => o.cls)).toEqual(['taksi', 'spor']);
    expect(a.garage.owned[0].cos.body).toBe(2);
    expect(a.garage.active).toBe(1);
    expect(a.summoned).toEqual({ idx: 1, x: 10.12, y: 64, z: -20, yaw: 1.235, dmg: 0 });
    expect(sanitizeVehicleSave({ garage: { owned: [{ cls: 'taksi' }] }, summoned: { idx: 0, x: 1, y: 64, z: 2, dmg: 0.456 } }).summoned.dmg).toBe(0.46);
    expect(sanitizeVehicleSave({ garage: { owned: [{ cls: 'taksi' }] }, summoned: { idx: 0, x: 1, y: 64, z: 2, dmg: 9 } }).summoned.dmg).toBe(1);
    expect(sanitizeVehicleSave({ garage: { owned: [{ cls: 'taksi' }] }, summoned: { idx: 0, x: 1, y: 64, z: 2, dmg: NaN } }).summoned.dmg).toBe(0);
    expect(a.rental.left).toBe(321.5);
    expect(a.vstats).toEqual({ km: 3.142, enters: 7 });
    expect(sanitizeVehicleSave(JSON.parse(JSON.stringify(a)))).toEqual(a); // idempotent
  });

  it('sınırlar: ≤ 6 araç, sınıf başına tek, geçersiz indeks/NaN/büyük değerler düşer', () => {
    const many = { garage: { owned: VEHICLE_CLASSES.concat(VEHICLE_CLASSES).map((cls) => ({ cls })), active: 99 } };
    const a = sanitizeVehicleSave(many);
    expect(a.garage.owned.length).toBe(MAX_OWNED);
    expect(a.garage.active).toBe(5);
    expect(new Set(a.garage.owned.map((o) => o.cls)).size).toBe(6);
    const b = sanitizeVehicleSave({
      garage: { owned: [{ cls: 'taksi' }] },
      summoned: { idx: 5, x: 1, y: 1, z: 1 },
      rental: { cls: 'taksi', left: NaN, x: 1, y: 1, z: 1 },
    });
    expect(b.summoned).toBe(null);
    expect(b.rental).toBe(null);
    expect(sanitizeVehicleSave({ garage: { owned: [{ cls: 'taksi' }] }, summoned: { idx: 0, x: 5000, y: 1, z: 1 } }).summoned).toBe(null);
    expect(sanitizeVehicleSave({ rental: { cls: 'taksi', left: 1e9, x: 1, y: 64, z: 1 } }).rental.left).toBe(600);
  });

  it('rastgele bozuk girdi (fuzz 2000): çıktı her zaman geçerli biçimde; prototip kirlenmez', () => {
    const rng = makeRng(3);
    const vals = [null, undefined, NaN, Infinity, -1, 0, 1, 2.5, 1e12, 'x', '__proto__', true, [], {}, [1, 2], { cls: 'taksi' }, { cls: '__proto__' }];
    const pick = () => vals[Math.floor(rng() * vals.length)];
    const rnd = (depth) => {
      if (depth > 3 || rng() < 0.3) return pick();
      const o = {};
      const keys = ['garage', 'owned', 'active', 'summoned', 'rental', 'vstats', 'cls', 'cos', 'idx', 'x', 'y', 'z', 'yaw', 'left', 'km', 'enters', 'body', '__proto__', 'constructor'];
      const n = Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) o[keys[Math.floor(rng() * keys.length)]] = rng() < 0.5 ? rnd(depth + 1) : pick();
      if (rng() < 0.2) return [rnd(depth + 1), rnd(depth + 1)];
      return o;
    };
    for (let i = 0; i < 2000; i++) {
      const out = sanitizeVehicleSave(rnd(0));
      expect(Object.keys(out).sort()).toEqual(['garage', 'rental', 'summoned', 'vstats']);
      expect(out.garage.owned.length).toBeLessThanOrEqual(6);
      out.garage.owned.forEach((o) => expect(VEHICLE_CLASSES).toContain(o.cls));
      expect(out.garage.active >= 0 && out.garage.active <= Math.max(0, out.garage.owned.length - 1)).toBe(true);
      if (out.summoned) expect(out.summoned.idx < out.garage.owned.length).toBe(true);
      expect(Number.isFinite(out.vstats.km) && out.vstats.km >= 0).toBe(true);
      expect(({}).polluted).toBeUndefined();
    }
  });

  it('writeVehicleSave yalnız araç anahtarlarına yazar (kredi, görev vb. dokunulmaz)', () => {
    const city = { v: 1, kredi: 55, flags: { a: 1 } };
    writeVehicleSave(city, sanitizeVehicleSave({ garage: { owned: [{ cls: 'taksi' }] } }));
    expect(city.kredi).toBe(55);
    expect(city.flags).toEqual({ a: 1 });
    VEHICLE_SAVE_KEYS.forEach((k) => expect(Object.prototype.hasOwnProperty.call(city, k)).toBe(true));
    expect(readVehicleSave(city).garage.owned[0].cls).toBe('taksi');
    expect(writeVehicleSave(null, {})).toBe(null);
  });
});
