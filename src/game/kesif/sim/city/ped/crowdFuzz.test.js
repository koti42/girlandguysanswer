/*
 * crowd_ai — KATI/SU/YOL DEĞİŞMEZLERİ (200 tohum). Her tohumda rastgele bir oyuncu konumunda kalabalık kurulur, 24 sn çalıştırılır; HER adım HER yaya için bağımsız kaba kuvvet
 * denetleyiciyle (crowdTestKit.refChecker: yüzey kodu + parsel ayak izi + prop kutuları) doğrulanır:
 *   - yaya hiçbir zaman su/kenar/rıhtımda, bina ayak izinde, prop kutusunda DEĞİL; NaN yok
 *   - asfalt/zebra/şerit üstünde yalnız geçit (zebra) kenarındayken bulunur
 *   - zebraya YALNIZ yürü (WALK) ışığında ya da ışıksız kavşakta (araç boşluğu) çıkar: WAIT→CROSS geçişinde ışık YÜRÜ olmalı
 *   - yayalar tavan/kademe sayılarını aşmaz; takılma (stuck) oranı düşük
 * Ortam: KESIF_CROWD_SEEDS (vars. 200), KESIF_CROWD_SECS (vars. 24), KESIF_GATE_SHARD=i/n.
 */
import { describe, expect, it, vi } from 'vitest';
import { citySeed } from '../cityPlanTestKit.js';
import { mulberry32 } from '../../rng.js';
import { makeCrowd, refChecker, runChecked } from './crowdTestKit.js';
import { EK } from './pedNav.js';
import { ST, TIER_CAPS } from './pedData.js';
import { PED, pedSignalInfo } from '../vehicle/trafficLights.js';

vi.setConfig({ testTimeout: 900000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const N = Number(ENV.KESIF_CROWD_SEEDS || 200);
const SECS = Number(ENV.KESIF_CROWD_SECS || 24);
const SHARD = String(ENV.KESIF_GATE_SHARD || '0/1').split('/').map(Number);
const SEEDS = [];
for (let s = 0; s < N; s++) if (s % SHARD[1] === SHARD[0]) SEEDS.push(s);

describe('crowd fuzz: katıya/suya/yola girme yok (200 tohum)', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s, () => {
      const seed = citySeed(s);
      const rng = mulberry32(seed ^ 0x5eed);
      const quality = ['high', 'medium', 'low'][s % 3];
      const px = Math.round((rng() - 0.5) * 1100);
      const pz = Math.round((rng() - 0.5) * 1000);
      const phase = rng();
      const { nav, crowd, tn } = makeCrowd(seed, {
        quality, px, pz, phase, rain: s % 7 === 0 ? 0.9 : 0, time: 400 + rng() * 5000,
      });
      crowd.populate();
      const caps = TIER_CAPS[quality];
      const checker = refChecker(seed);
      const prevState = new Map();
      const sg = {};
      let wrongStart = 0;
      let maxAlive = 0;
      const r = runChecked(crowd, checker, SECS, (i, cr) => {
        const alive = cr.alive();
        if (alive > maxAlive) maxAlive = alive;
        for (let k = 0; k < cr.peds.length; k++) {
          const p = cr.peds[k];
          if (!p.alive) {
            prevState.delete(p.id);
            continue;
          }
          const prev = prevState.get(p.id);
          if ((prev === ST.WAIT || prev === ST.WALK) && p.state === ST.CROSS && p.e >= 0 && nav.ekind[p.e] === EK.CROSS) {
            const c = nav.crossings[nav.ecross[p.e]];
            const J = tn.junctions[c.jun];
            const st = pedSignalInfo(J.plan, c.arm, cr.ctx.time, sg);
            if (st.left !== Infinity && st.state !== PED.WALK) wrongStart++;
          }
          prevState.set(p.id, p.state);
        }
      });
      expect(r.violations, JSON.stringify(r.violations.slice(0, 3))).toEqual([]);
      expect(wrongStart, 'yaya YÜRÜ dışında zebraya çıktı').toBe(0);
      expect(maxAlive).toBeLessThanOrEqual(caps.total);
      const tc = crowd.tierCount;
      expect(tc[0]).toBeLessThanOrEqual(caps.near);
      expect(tc[1]).toBeLessThanOrEqual(caps.mid);
      expect(crowd.stats.stuck, 'takılma').toBeLessThan(12);
    });
  });
});
