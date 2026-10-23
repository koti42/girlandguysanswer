import { describe, expect, it } from 'vitest';
import { citySeed } from '../sim/city/cityPlanTestKit.js';
import { interiorLots } from '../sim/city/interior/testKit.js';
import { cityInteriorGatedAt, structureGatedAt } from './techCtx.js';

/*
 * qa_p2 — şehirde iç mekân hacmi (±1 duvar halkası) portal/matkap için KAPALIDIR: ışın kapı proplarından geçer, kilitli odanın arka duvarına
 * portal açıp kilit atlanabiliyordu. Overworld ve iç mekân dışı hücreler etkilenmez.
 */
describe('cityInteriorGatedAt', () => {
  const seed = citySeed(3);
  const { bp } = interiorLots(seed, { limit: 1 })[0];
  const it0 = bp.interior;
  const cx = Math.floor((it0.x0 + it0.x1) / 2);
  const cz = Math.floor((it0.z0 + it0.z1) / 2);
  const city = { world: { dim: 'neon', seed }, seed };
  const over = { world: { dim: 'overworld', seed }, seed };

  it('oda içi, zemin/tavan arası, duvar halkası (±1) kapalı', () => {
    expect(cityInteriorGatedAt(city, cx, 65, cz)).toBe(true);
    expect(cityInteriorGatedAt(city, cx, it0.y1, cz)).toBe(true);
    expect(cityInteriorGatedAt(city, it0.x0 - 1, 65, cz)).toBe(true);
    expect(cityInteriorGatedAt(city, it0.x1, 65, cz)).toBe(true);
    expect(structureGatedAt(city, cx, 65, cz)).toBe(true);
  });

  it('iç mekândan 3+ hücre uzak sokak hücresi ve çok yüksek/alçak hücre kapalı DEĞİL; overworld hiçbir zaman', () => {
    expect(cityInteriorGatedAt(city, 0, 64, 0)).toBe(false);
    expect(cityInteriorGatedAt(city, cx, it0.y1 + 4, cz)).toBe(false);
    expect(cityInteriorGatedAt(city, cx, 40, cz)).toBe(false);
    expect(cityInteriorGatedAt(over, cx, 65, cz)).toBe(false);
  });

  it('bozuk girdi atmaz', () => {
    expect(cityInteriorGatedAt({ world: null }, 1, 1, 1)).toBe(false);
    expect(cityInteriorGatedAt(city, NaN, 65, cz)).toBe(false);
    expect(cityInteriorGatedAt({ world: { dim: 'neon', seed: NaN } }, 1, 65, 1)).toBe(false);
  });
});
