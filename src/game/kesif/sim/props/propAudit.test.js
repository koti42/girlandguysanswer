import { describe, expect, it } from 'vitest';
import { getBlockPlan, planBuilding } from '../city/cityPlan.js';
import { planInterior } from '../city/interior/index.js';
import { doorClearanceBoxes } from '../city/interior/graph.js';
import { dimSeed } from '../dim/dimensions.js';
import { getPropDef, worldBoxes } from './propDefs.js';
import { normalizeSpec } from './propPlan.js';
import { INTERIOR_DEFS } from './propDefsInterior.js';

/*
 * Çarpışma örtüşme denetimi (props_content kabul testi): gerçek şehir iç mekânlarında, ÇALIŞMA ZAMANI tanımlarının (PROP_BY_T) çarpışma kutuları
 * birbirinin içine girmez ve kapı önü (2×3) boş kalır. Kapı/kilit düzenekleri kapı önü muafiyetindedir (graph.CLEAR_EXEMPT_TAGS).
 */
const EPS = 1e-6;
const EXEMPT = ['door', 'lockpad'];

function ovl(a, b) {
  return a[0] < b[3] - EPS && a[3] > b[0] + EPS && a[1] < b[4] - EPS && a[4] > b[1] + EPS && a[2] < b[5] - EPS && a[5] > b[2] + EPS;
}

function interiorList(seed, max) {
  const out = [];
  for (let bj = -9; bj <= 9 && out.length < max; bj++) {
    for (let bi = -9; bi <= 9 && out.length < max; bi++) {
      const plan = getBlockPlan(seed, bi, bj);
      for (let k = 0; k < plan.lots.length && out.length < max; k++) {
        const lot = plan.lots[k];
        if (!lot.built || lot.hill) continue;
        const bp = planBuilding(seed, lot);
        if (!bp || !bp.interior) continue;
        const it = planInterior(bp, lot);
        if (it) out.push({ lot, bp, it });
      }
    }
  }
  return out;
}

function boxesOf(seed, it) {
  const out = [];
  it.props.forEach((spec) => {
    const p = normalizeSpec(seed, spec);
    if (!p) return;
    const d = getPropDef(p.t);
    worldBoxes(d, p.x, p.y, p.z, p.yaw, []).forEach((b) => out.push({ key: d.key, tags: d.tags, b, slot: spec.slot }));
  });
  return out;
}

describe('çarpışma örtüşme denetimi — gerçek iç mekânlar', () => {
  [dimSeed(777, 'neon'), dimSeed(4242, 'neon')].forEach((seed) => {
    it('tohum ' + seed + ': prop çarpışma kutuları çiftler arası örtüşmez; kapı önü 2×3 boş', () => {
      const list = interiorList(seed, 260);
      expect(list.length).toBeGreaterThan(60);
      const kinds = new Set();
      const overlaps = [];
      const clears = [];
      let propCount = 0;
      list.forEach(({ it, lot }) => {
        kinds.add(it.kind);
        const boxes = boxesOf(seed, it);
        propCount += it.props.length;
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            if (boxes[i].slot === boxes[j].slot) continue;
            if (ovl(boxes[i].b, boxes[j].b)) overlaps.push(it.kind + '#' + lot.id + ' ' + boxes[i].key + '/' + boxes[j].key);
          }
        }
        (it.doors || []).forEach((d) => {
          if (d.kind !== 'street' && d.kind !== 'door' && d.kind !== 'arch') return;
          const cb = doorClearanceBoxes(d);
          const box = Array.isArray(cb[0]) ? cb[0] : cb;
          boxes.forEach((q) => {
            if (q.tags.some((t) => EXEMPT.indexOf(t) >= 0)) return;
            if (ovl(q.b, box)) clears.push(it.kind + '#' + lot.id + ' ' + d.id + ' ' + q.key);
          });
        });
      });
      expect(propCount).toBeGreaterThan(1000);
      expect(kinds.size).toBeGreaterThanOrEqual(6);
      expect(overlaps.slice(0, 6)).toEqual([]);
      expect(clears.slice(0, 6)).toEqual([]);
    }, 120000);
  });

  it('galeri yerleşimi (katalog varsayılanları, satır satır): hiçbir iki prop çarpışması örtüşmez; yüzey propu masa dışında bağımsız', () => {
    const boxes = [];
    let x = 0;
    INTERIOR_DEFS.forEach((d) => {
      const p = {
        x: x + Math.max(d.size[0], 1) / 2, y: 64, z: 0, yaw: 0,
      };
      worldBoxes(d, p.x, p.y, p.z, p.yaw, []).forEach((b) => boxes.push({ key: d.key, b }));
      x += Math.max(d.size[0], 1) + 0.9;
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(ovl(boxes[i].b, boxes[j].b), boxes[i].key + '/' + boxes[j].key).toBe(false);
  });
});
