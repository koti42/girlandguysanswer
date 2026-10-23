/*
 * KEŞİF sim/city — ÖN ISITMA (plan önbellekleri). Saf; belirlenimci (yalnız önbelleği doldurur, çıktı değiştirmez).
 *
 *  warmCity(seed, opts?) → {blocks, lots}
 *    opts.cx, opts.cz  merkez chunk (varsayılan 0,0 = Kapı Meydanı varış chunk'ı)
 *    opts.radius       chunk yarıçapı (varsayılan 3 → 7×7 chunk; sözleşme: varış r=3)
 *  getCityPlan (≤40 ms) + etkilenen blokların parsel yerleşimi + blok planı + bina planları önbelleğe alınır; böylece varıştaki ilk chunk'lar
 *  soğuk plan maliyetini (blok başı ~4 ms) ödemez.
 */
import { toSeedInt } from '../rng.js';
import { planBuilding } from './buildingPlan.js';
import { getCityPlan } from './cityPlan.js';

export function warmCity(seed, opts) {
  const o = opts || {};
  const s = toSeedInt(seed);
  const plan = getCityPlan(s);
  const cx = o.cx | 0;
  const cz = o.cz | 0;
  const r = o.radius === undefined ? 3 : Math.max(0, o.radius | 0);
  const bi0 = Math.max(-10, Math.floor((cx - r) / 5));
  const bi1 = Math.min(9, Math.floor((cx + r) / 5));
  const bj0 = Math.max(-10, Math.floor((cz - r) / 5));
  const bj1 = Math.min(9, Math.floor((cz + r) / 5));
  let blocks = 0;
  let lots = 0;
  for (let bj = bj0; bj <= bj1; bj++) {
    for (let bi = bi0; bi <= bi1; bi++) {
      const lay = plan.lotsIndex.layout(bi, bj);
      plan.lotsIndex.blockPlan(bi, bj);
      blocks++;
      for (let q = 0; q < lay.lots.length; q++) {
        planBuilding(plan, lay.lots[q]);
        lots++;
      }
    }
  }
  return { blocks, lots };
}
