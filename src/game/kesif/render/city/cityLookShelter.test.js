import { describe, expect, it } from 'vitest';
import { SHELTER_SCAN_UP, fogShelter, overheadCovered } from './cityLookMath.js';

/*
 * qa_p2 — iç mekânda yağmur çizgileri: pencereden sızan gökyüzü ışığı (≈7) yüzünden fogShelter ≈ 0,4 idi (yağmur %62 görünüyordu).
 * Düzeltme: göz sütununun üstünde 24 blok içinde herhangi bir blok varsa (tavan/tente/cam çatı) sığınak tamdır.
 */
describe('overheadCovered — tavan varsa tam sığınak', () => {
  const colWorld = (ys) => ({ getBlock: (x, y, z) => (x === 5 && z === 7 && ys.indexOf(y) >= 0 ? 73 : 0) });
  const eye = { x: 5.4, y: 65.62, z: 7.9 };

  it('açık gökyüzü: false; tavan 1..24 blok yukarıda: true; 25 yukarıda (tarama dışı): false', () => {
    expect(overheadCovered(colWorld([]), eye)).toBe(false);
    expect(overheadCovered(colWorld([68]), eye)).toBe(true);
    expect(overheadCovered(colWorld([66]), eye)).toBe(true);
    expect(overheadCovered(colWorld([65 + SHELTER_SCAN_UP]), eye)).toBe(true);
    expect(overheadCovered(colWorld([65 + SHELTER_SCAN_UP + 1]), eye)).toBe(false);
  });

  it('başka sütundaki blok sayılmaz; geçersiz girdi false (güvenli)', () => {
    expect(overheadCovered(colWorld([68]), { x: 9, y: 65, z: 7 })).toBe(false);
    expect(overheadCovered(null, eye)).toBe(false);
    expect(overheadCovered({}, eye)).toBe(false);
    expect(overheadCovered(colWorld([68]), { x: NaN, y: 1, z: 1 })).toBe(false);
    expect(overheadCovered(colWorld([68]), null)).toBe(false);
  });

  it('pencere ışığı sızsa da (skyRaw 7 → fogShelter ≈ 0,42) tavanlı odada sığınak 1; açıkta fogShelter aynen', () => {
    expect(fogShelter(7)).toBeLessThan(0.5);
    const indoors = overheadCovered(colWorld([68]), eye) ? 1 : fogShelter(7);
    expect(indoors).toBe(1);
    const open = overheadCovered(colWorld([]), eye) ? 1 : fogShelter(15);
    expect(open).toBe(0);
  });
});
