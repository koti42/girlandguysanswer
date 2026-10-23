import { describe, expect, it } from 'vitest';
import { getBlockPlan, planBuilding } from '../cityPlan.js';
import { planInterior } from './index.js';
import { doorSides } from './locks.js';
import { dimSeed } from '../../dim/dimensions.js';

/*
 * qa_gpu (QA5-G-006): KİLİT DÜZENEĞİ (kod paneli / kart okuyucu / hack terminali) kapının GİRİŞ (kilitli) tarafında olmalı. Eskiden arcade'in ikinci düzeninde kapı `from`/`to`
 * ters verildiği için düzenek DERİN odaya (kilitli tarafın arkasına) konuyor, oyuncu dışarıdan kapıyı açamıyor, bakım odası (+ çip) ulaşılamıyordu.
 * Denetim: gerçek şehirde her kilitli iç kapı için, kapıya en yakın düzenek proplarından en az biri giriş tarafındadır.
 */
const PAD = { kod: 'kod_paneli', kart: 'kart_okuyucu', mini_hack: 'hack_terminali' };

function audit(seed, maxLots, stats) {
  const bad = [];
  let seen = 0;
  for (let bj = -9; bj <= 9 && seen < maxLots; bj++) {
    for (let bi = -9; bi <= 9 && seen < maxLots; bi++) {
      const plan = getBlockPlan(seed, bi, bj);
      for (let k = 0; k < plan.lots.length && seen < maxLots; k++) {
        const lot = plan.lots[k];
        if (!lot.built || lot.hill) continue;
        const bp = planBuilding(seed, lot);
        if (!bp || !bp.interior) continue;
        const it = planInterior(bp, lot);
        if (!it) continue;
        seen++;
        const sides = doorSides(it);
        (it.doors || []).forEach((d) => {
          const lk = d.lock;
          if (!lk || !PAD[lk.kind] || d.kind !== 'door') return;
          const s = sides.get(d.id);
          if (!s || s.vertical) return;
          const pads = (it.props || []).filter((p) => p.kind === PAD[lk.kind] && Math.hypot(p.x - (d.x + 0.5), p.z - (d.z + 0.5)) < 3.2);
          if (!pads.length) return; // düzeneksiz kilit: kapının kendisi paneli açar (cityLocks)
          stats.locks++;
          const c = s.axis === 'z' ? d.z + 0.5 : d.x + 0.5;
          const onEntry = pads.some((p) => ((s.axis === 'z' ? p.z : p.x) - c) * s.sign > 0);
          if (!onEntry) bad.push({ seed, kind: bp.interior.kind, lot: lot.id, door: d.id, lock: lk.kind, pads: pads.map((p) => [p.x, p.z]), side: [s.axis, s.sign] });
        });
      }
    }
  }
  return bad;
}

describe('kilit düzeneği giriş tarafında (QA5-G-006)', () => {
  it('gerçek şehir iç mekânları: her kilitli kapının düzeneği oyuncunun yaklaştığı (giriş) tarafta', () => {
    const stats = { locks: 0 };
    const bad = [];
    for (let i = 0; i < 6; i++) bad.push(...audit(dimSeed(7001 + i * 977, 'neon'), 200, stats));
    expect(stats.locks).toBeGreaterThan(40);
    const byKind = {};
    bad.forEach((b) => { const k = b.kind + ':' + b.door + ':' + b.lock; byKind[k] = (byKind[k] || 0) + 1; });
    expect({ byKind, first: bad.slice(0, 2) }).toEqual({ byKind: {}, first: [] });
  });
});
