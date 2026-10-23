import { describe, expect, it } from 'vitest';
import { Progression } from './sim/progression.js';
import { progressTickEvent } from './gameWorld.js';

/** qa_p1 G5: şehirde yürümek ana diyar haritasını açmaz, ana diyar mesafe/biyom ilerlemesini artırmaz (süre sayılır). */
describe('ilerleme tick olayı ve boyut', () => {
  const body = { x: 120.5, z: 40.5 };

  it('ana diyar: konum ve biyom iletilir', () => {
    const e = progressTickEvent('overworld', body, 0.25, 15, true, 'cayir');
    expect(e).toEqual({
      type: 'tick', dt: 0.25, x: 120.5, z: 40.5, light: 15, torch: true, biome: 'cayir',
    });
    expect(progressTickEvent(undefined, body, 0.25, 15, false, 'orman').x).toBe(120.5);
  });

  it('şehir: x,z NaN ve biyom yok; süre korunur', () => {
    const e = progressTickEvent('neon', body, 0.25, 15, false, 'cayir');
    expect(Number.isNaN(e.x)).toBe(true);
    expect(Number.isNaN(e.z)).toBe(true);
    expect(e.biome).toBeUndefined();
    expect(e.dt).toBe(0.25);
  });

  it('Progression: şehir tick\'leri harita hücresi açmaz, mesafe/biyom artırmaz; playTime artar', () => {
    const p = new Progression(1, { mode: 'macera' });
    const open = (x, z) => p.onEvent(progressTickEvent('overworld', { x, z }, 0.25, 15, false, 'cayir'));
    open(0, 0);
    open(10, 0);
    const known0 = p.revealCount;
    const dist0 = p.stats.distance;
    const biomes0 = JSON.stringify(p.journal().discovered);
    const play0 = p.stats.playTime;
    for (let i = 0; i < 80; i++) p.onEvent(progressTickEvent('neon', { x: 300 + i * 9, z: -200 + i * 7 }, 0.25, 15, false, 'col'));
    expect(p.revealCount).toBe(known0);
    expect(p.stats.distance).toBe(dist0);
    expect(JSON.stringify(p.journal().discovered)).toBe(biomes0);
    expect(p.stats.playTime).toBeGreaterThan(play0 + 15);
    // ana diyara dönüş: tek büyük sıçrama mesafe saymaz (d<12 süzgeci), harita yine açılır
    open(0, 0);
    open(8, 8);
    expect(p.revealCount).toBeGreaterThanOrEqual(known0);
  });
});
