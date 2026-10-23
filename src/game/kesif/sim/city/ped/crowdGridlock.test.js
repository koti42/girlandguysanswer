import { describe, expect, it, vi } from 'vitest';
import { citySeed } from '../cityPlanTestKit.js';
import { makeCrowd } from './crowdTestKit.js';
import { ST } from './pedData.js';

vi.setConfig({ testTimeout: 600000 });

/*
 * QA4-002: iki karşıt yaya akışı bir düğümde karşılaşınca `neighborLimit` (öndeki yavaşsa hız = max(0,2; v_ön) × 0,35 ≈ 0,07 m/sn) olumlu geri besleme yaratıyor:
 * Kapı Meydanı çevresinde ~20 yaya 30 sn boyunca aynı düğümde sürünüyordu. Düzeltme: 4 sn'den uzun süre (< 0,15 m/sn) yürüyemeyen yaya 3 sn "hayalet" geçer.
 */
function stillWalkers(seed, o, secs) {
  const { crowd } = makeCrowd(seed, o);
  crowd.populate();
  const run = new Map();
  const longest = new Map();
  const n = Math.round(secs * 20);
  for (let t = 0; t < n; t++) {
    crowd.step(0.05);
    if (t % 20 !== 0) continue;
    crowd.peds.forEach((p) => {
      if (!p.alive) return;
      if (p.state === ST.WALK && p.speed < 0.15) {
        const k = (run.get(p.id) || 0) + 1;
        run.set(p.id, k);
        if (k > (longest.get(p.id) || 0)) longest.set(p.id, k);
      } else run.set(p.id, 0);
    });
  }
  const arr = Array.from(longest.values()).sort((a, b) => b - a);
  return { arr, alive: crowd.alive() };
}

describe('crowd: karşıt akış düğümünde kilitlenme yok (QA4-002)', () => {
  [[70, 0, 0, 0.45], [75, 0, 0, 0.45], [80, 100, 40, 0.3], [90, -120, 60, 0.62]].forEach(([s, px, pz, ph]) => {
    it('tohum ' + s + ': yürüyen hiçbir yaya 12 sn\'den uzun süre sürünmez; 8 sn üstü en çok 2 yaya', () => {
      const r = stillWalkers(citySeed(s), { px, pz, phase: ph, quality: 'high' }, 120);
      expect(r.alive).toBeGreaterThan(30);
      expect(r.arr[0]).toBeLessThanOrEqual(12);
      expect(r.arr.filter((v) => v > 8).length).toBeLessThanOrEqual(2);
    });
  });
});
