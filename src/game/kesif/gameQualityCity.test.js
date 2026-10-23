import { describe, expect, it } from 'vitest';
import {
  CITY_DRAW_BUDGET, createViewBudget, drawBudgetFor, drawBudgetForDim, triangleBudget,
} from './gameQuality.js';

/** qa_p1: Neon Meridyen çizim/üçgen tavanı (sözleşme §1.14, §17) — şehirde masaüstü 520 ayrıcalığı yok, bütçe sert tavan. */
describe('şehir çizim bütçesi', () => {
  it('şehir tüm kademelerde ve masaüstünde de 250; overworld masaüstü 520 kalır', () => {
    expect(CITY_DRAW_BUDGET).toBe(250);
    expect(drawBudgetForDim(false, 'neon')).toBe(250);
    expect(drawBudgetForDim(true, 'neon')).toBe(250);
    expect(drawBudgetForDim(false, 'overworld')).toBe(drawBudgetFor(false));
    expect(drawBudgetForDim(true, 'overworld')).toBe(drawBudgetFor(true));
  });

  it('tetik 1,0: bütçe aşılır aşılmaz görüş kısılır; varsayılan 1,12 histerezis korunur', () => {
    const tier = 'high';
    const bud = triangleBudget(tier);
    const hard = createViewBudget({ drawBudget: CITY_DRAW_BUDGET, trigger: 1, cooldown: 0.1 });
    const soft = createViewBudget({ drawBudget: CITY_DRAW_BUDGET, cooldown: 0.1 });
    let ch = 0;
    let cs = 0;
    for (let i = 0; i < 40; i++) {
      ch = hard.update(0.1, bud * 1.05, tier, 0);
      cs = soft.update(0.1, bud * 1.05, tier, 0);
    }
    expect(ch).toBeGreaterThan(0);
    expect(cs).toBe(0);
  });

  it('çağrı sayısı 250 üstünde: üçgen az olsa da görüş kısılır (420 çağrı → en çok maxCut)', () => {
    const b = createViewBudget({ drawBudget: CITY_DRAW_BUDGET, trigger: 1, cooldown: 0.1, maxCut: 3 });
    let cut = 0;
    for (let i = 0; i < 200; i++) cut = b.update(0.1, 120000, 'high', 420);
    expect(cut).toBe(3);
  });

  it('bütçenin altında kısma yok; yük düşünce geri verir', () => {
    const b = createViewBudget({ drawBudget: CITY_DRAW_BUDGET, trigger: 1, cooldown: 0.1, maxCut: 3 });
    let cut = 0;
    for (let i = 0; i < 100; i++) cut = b.update(0.1, 90000, 'high', 140);
    expect(cut).toBe(0);
    for (let i = 0; i < 100; i++) cut = b.update(0.1, 90000, 'high', 420);
    expect(cut).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) cut = b.update(0.1, 40000, 'high', 60);
    expect(cut).toBe(0);
  });
});
