import { describe, expect, it, vi } from 'vitest';
import { worldProbe } from './pedProbe.js';
import { citySeed } from '../cityPlanTestKit.js';
import { getCityPlan } from '../cityPlan.js';

vi.setConfig({ testTimeout: 300000 });

/*
 * QA4-001: yayanın y'si sabit (64). Meydandaki taş plaka halkası (0,5 yüksek) eskiden "geçilebilir basamak" sayılıyor, yaya bacaklarını plakanın içine gömerek
 * yürüyordu. worldProbe artık ≥ 0,3 yüksek çarpışma kutusunu gövde bandında engel sayar.
 */
describe('pedProbe: yarım plaka (0,5) engeldir', () => {
  it('plaza plaka halkası (tohum 80, 118,64,-116) yaya için dolu; düz meydan zemini serbest', async () => {
    const { World } = await import('../../world.js');
    const { attachPropLayer, createPropLayer } = await import('../../props/propLayer.js');
    const seed = citySeed(80);
    const world = new World({ seed, mode: 'macera', dim: 'neon' });
    attachPropLayer(world, createPropLayer({ citySeed: seed }));
    for (let cx = 5; cx <= 9; cx++) for (let cz = -9; cz <= -5; cz++) world.ensureChunk(cx, cz);
    expect(world.getBlock(118, 64, -116)).toBe(95);
    const wp = worldProbe(world, { roads: getCityPlan(seed).roads });
    expect(wp.free(118.5, -115.5, 0.2, false)).toBe(false);
    expect(wp.free(120.5, -112.5, 0.2, false)).toBe(true);
  });
});
