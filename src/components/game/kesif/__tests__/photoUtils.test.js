import { describe, expect, it } from 'vitest';
import {
  ORBIT_SENS, SLIDERS, TABS, dragToOrbit, formatBytes, photoKeyAction, pinchToZoom, shotAria, shotSummary, valueText, wheelToZoom,
} from '../city/photoUtils.js';
import { PHOTO_LIMITS, defaultPhotoSettings } from '../../../../game/kesif/sim/city/map/photoMath.js';

describe('foto arayüzü yardımcıları', () => {
  it('kaydırıcı sınırları PHOTO_LIMITS ile aynı; anahtarlar ayarlarda var; varsayılanlar aralıkta', () => {
    const d = defaultPhotoSettings();
    const L = PHOTO_LIMITS;
    const map = {
      fov: [L.fovMin, L.fovMax],
      dist: [L.distMin, L.distMax],
      height: [L.heightMin, L.heightMax],
      exposure: [L.exposureMin, L.exposureMax],
      bloom: [L.bloomMin, L.bloomMax],
      vignette: [L.vignetteMin, L.vignetteMax],
      grain: [L.grainMin, L.grainMax],
      filterAmount: [L.filterAmountMin, L.filterAmountMax],
    };
    expect(SLIDERS.map((s) => s.key).sort()).toEqual(Object.keys(map).sort());
    SLIDERS.forEach((s) => {
      expect([s.min, s.max]).toEqual(map[s.key]);
      expect(s.step).toBeGreaterThan(0);
      expect(d[s.key]).toBeGreaterThanOrEqual(s.min);
      expect(d[s.key]).toBeLessThanOrEqual(s.max);
      expect(TABS.some((t) => t.key === s.group)).toBe(true);
    });
    expect(TABS.map((t) => t.key)).toEqual(['kamera', 'isik', 'stil', 'album']);
  });

  it('sürükleme, kıstırma, tekerlek: yön ve sınır', () => {
    expect(dragToOrbit(100, 0)).toEqual([100 * ORBIT_SENS, 0]);
    expect(dragToOrbit(0, -50)[1]).toBeLessThan(0);
    expect(dragToOrbit(NaN, undefined)).toEqual([0, 0]);
    expect(pinchToZoom(100, 150)).toBeLessThan(0); // parmaklar açılır → yaklaş
    expect(pinchToZoom(150, 100)).toBeGreaterThan(0);
    expect(pinchToZoom(0, 10)).toBe(0);
    expect(pinchToZoom(NaN, 10)).toBe(0);
    expect(wheelToZoom(120)).toBeGreaterThan(0);
    expect(wheelToZoom(1e9)).toBe(6);
    expect(wheelToZoom(-1e9)).toBe(-6);
    expect(wheelToZoom('x')).toBe(0);
  });

  it('klavye: oklar yörünge, +/- uzaklık, [ ] FOV, Enter çek; Shift hızlandırır; bilinmeyen null', () => {
    expect(photoKeyAction({ key: 'ArrowLeft' })).toMatchObject({ k: 'orbit', dyaw: 0.06 });
    expect(photoKeyAction({ key: 'ArrowLeft', shiftKey: true }).dyaw).toBeCloseTo(0.18, 9);
    expect(photoKeyAction({ key: 'ArrowRight' }).dyaw).toBeLessThan(0);
    expect(photoKeyAction({ key: 'ArrowUp' }).dpitch).toBeLessThan(0);
    expect(photoKeyAction({ key: 'ArrowDown' }).dpitch).toBeGreaterThan(0);
    expect(photoKeyAction({ key: '+' }).d).toBeLessThan(0);
    expect(photoKeyAction({ key: '-' }).d).toBeGreaterThan(0);
    expect(photoKeyAction({ key: '[' })).toMatchObject({ k: 'fov' });
    expect(photoKeyAction({ key: 'Enter' })).toEqual({ k: 'capture' });
    expect(photoKeyAction({ key: 'q' })).toBeNull();
    expect(photoKeyAction(null)).toBeNull();
    expect(photoKeyAction({})).toBeNull();
  });

  it('biçimler: bayt, değer, özet, ekran okuyucu', () => {
    expect(formatBytes(512)).toBe('512 bayt');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB');
    expect(formatBytes(NaN)).toBe('0 bayt');
    expect(valueText(SLIDERS[0], 62.4)).toBe('62°');
    expect(valueText(SLIDERS[1], 5.25)).toBe('5,25 m');
    expect(valueText(SLIDERS[3], undefined)).toBe('0,55');
    const shot = { w: 1280, h: 720, bytes: 90000, subjects: ['Boyut Terminali', 'Araç'], kredi: 8 };
    expect(shotSummary(shot)).toBe('1280×720 · 87.9 KB · Boyut Terminali, Araç');
    expect(shotSummary(null)).toBe('');
    expect(shotAria(shot)).toContain('Boyut Terminali, Araç');
    expect(shotAria(shot)).toContain('8 Kredi');
    expect(shotAria({ w: 1, h: 1, bytes: 1, subjects: [], kredi: 0 })).toContain('albüm konusu yok');
  });
});
