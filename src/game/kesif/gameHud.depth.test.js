import { describe, expect, it } from 'vitest';
import { depthBandWithHysteresis } from './gameHud.js';
import { sanitizeHud } from './hudStore.js';

describe('derinlik bandı histerezisi', () => {
  it('sınırda titremez: bandı ancak sınırı 5 blok aşınca bırakır', () => {
    // Mağaralar minY -80: aşağı inerken -80'in altına 5 blok inmeden Yüzey kalır
    expect(depthBandWithHysteresis(-82, 'magaralar').key).toBe('magaralar');
    expect(depthBandWithHysteresis(-84, 'magaralar').key).toBe('magaralar');
    expect(depthBandWithHysteresis(-86, 'magaralar').key).toBe('derin');
    expect(depthBandWithHysteresis(-300, 'magaralar').key).toBe('ham');
    // önceki bant yoksa ham bant
    expect(depthBandWithHysteresis(-50, '').key).toBe('magaralar');
    expect(depthBandWithHysteresis(-78, 'derin').key).toBe('derin'); // yukarı çıkarken de histerezis
    expect(depthBandWithHysteresis(-70, 'derin').key).toBe('magaralar');
    expect(depthBandWithHysteresis(-390, '').key).toBe('dip');
  });
});

describe('hud.depth temizleme', () => {
  it('rel sınırlanır, bant/anahtar kırpılır, eksik alan güvenli', () => {
    expect(sanitizeHud({ depth: { rel: -442, band: 'Dip', key: 'dip' } }).depth).toEqual({ rel: -442, band: 'Dip', key: 'dip' });
    expect(sanitizeHud({ depth: { rel: 99999, band: 'x'.repeat(100), key: 'y'.repeat(100) } }).depth.rel).toBe(1000);
    expect(sanitizeHud({ depth: { rel: 99999, band: 'x'.repeat(100) } }).depth.band.length).toBeLessThanOrEqual(32);
    expect(sanitizeHud({}).depth).toEqual({ rel: 0, band: '', key: '' });
    expect(sanitizeHud({ depth: 'zz' }).depth).toEqual({ rel: 0, band: '', key: '' });
  });
});
