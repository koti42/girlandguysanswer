import { describe, expect, it } from 'vitest';
import { MIN_TARGET, driveLayout } from '../city/vehicleHudUtils.js';

/*
 * qa_gpu: dar ekranda sürüş denetimleri ekrana sığar (320/360 px dikey): üst çubuk 7 düğme taşmaz, direksiyon pedallarla çakışmaz.
 * Geniş ekranlarda (≥ 390) boyutlar değişmez (vehicleHudUtils.test.js taban boyutları).
 */
const topRowWidth = (L, w, portrait) => 7 * L.small + 6 * (portrait ? 3 : 5) + 10 + 6;

describe('driveLayout — dar ekran', () => {
  it('üst çubuk (7 düğme) 320–420 px genişliğe sığar; ≥ 358 px ekranda hedefler ≥ 44 px', () => {
    for (let w = 320; w <= 420; w += 2) {
      [true, false].forEach((portrait) => {
        if (!portrait && w < 480) return; // yatay ekran 480 px'ten dar olmaz
        const L = driveLayout({ w, h: portrait ? 640 : 360, portrait, scale: 1 });
        expect(topRowWidth(L, w, portrait)).toBeLessThanOrEqual(w);
        expect(L.small).toBeGreaterThanOrEqual(40);
        if (w >= 358) expect(L.small).toBeGreaterThanOrEqual(MIN_TARGET);
      });
    }
  });

  it('dikeyde direksiyon + pedaller + boşluk genişliğe sığar (320–420 px)', () => {
    for (let w = 320; w <= 420; w += 2) {
      const L = driveLayout({ w, h: 700, portrait: true, scale: 1 });
      const pedals = L.gas.w + L.brake.w + L.gap;
      expect(20 + L.steer + 6 + pedals + 20).toBeLessThanOrEqual(w + 6);
      expect(L.steer).toBeGreaterThanOrEqual(96);
      expect(L.steerMaxW).toBeGreaterThanOrEqual(L.steer);
    }
  });

  it('geniş ekranda boyutlar değişmez (şartname tabanı)', () => {
    const P = driveLayout({ w: 390, h: 844, portrait: true, scale: 1 });
    expect(P.small).toBe(48);
    expect(P.steer).toBe(144);
    const Ls = driveLayout({ w: 844, h: 390, portrait: false, scale: 1 });
    expect(Ls.small).toBe(48);
    expect(Ls.steerMaxW).toBe(Infinity);
  });

  it('NaN / eksik w güvenli', () => {
    const L = driveLayout({ w: NaN, h: NaN, portrait: true, scale: NaN });
    expect(L.small).toBe(48);
    expect(Number.isFinite(L.steer)).toBe(true);
  });
});
