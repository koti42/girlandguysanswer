import { describe, expect, it } from 'vitest';
import { getBlockPlan, planBuilding } from '../cityPlan.js';
import { planInterior } from './index.js';
import { doorSides } from './locks.js';
import { dimSeed } from '../../dim/dimensions.js';

/*
 * qa_gpu (QA5-G-006 devamı): kod kilidinin İPUCU NOTU (kod_notu) kilidin önündeki (giriş tarafı) odadadır — deriniye konmuş not oyuncuya hiç gösterilemez.
 * Ayrıca anahtar/kart verenler gibi bağımlılıklar için: her kilitli kapının giriş odası, sokaktan kilitlere girmeden ulaşılabilen odadır (doorSides).
 */
const inRoom = (r, x, z) => x >= r.x0 && x < r.x1 + 1 && z >= r.z0 && z < r.z1 + 1;

describe('kod ipucu notu giriş odasında (QA5-G-006)', () => {
  it('gerçek şehir: kod kilitlerinin notu giriş odasında (derin odada değil)', () => {
    const bad = [];
    let locks = 0;
    for (let si = 0; si < 6; si++) {
      const seed = dimSeed(7001 + si * 977, 'neon');
      let seen = 0;
      for (let bj = -9; bj <= 9 && seen < 200; bj++) {
        for (let bi = -9; bi <= 9 && seen < 200; bi++) {
          const plan = getBlockPlan(seed, bi, bj);
          for (let k = 0; k < plan.lots.length && seen < 200; k++) {
            const lot = plan.lots[k];
            if (!lot.built || lot.hill) continue;
            const bp = planBuilding(seed, lot);
            if (!bp || !bp.interior) continue;
            const it = planInterior(bp, lot);
            if (!it) continue;
            seen++;
            const sides = doorSides(it);
            const rooms = new Map((it.rooms || []).map((r) => [r.id, r]));
            (it.doors || []).forEach((d) => {
              const lk = d.lock;
              if (!lk || lk.kind !== 'kod' || !lk.data || !lk.data.clue) return;
              const s = sides.get(d.id);
              if (!s) return;
              const note = (it.props || []).find((p) => p.slot === lk.data.clue.slot);
              if (!note) return;
              locks++;
              const deep = rooms.get(s.deep);
              if (deep && inRoom(deep, note.x, note.z)) bad.push({ kind: bp.interior.kind, lot: lot.id, door: d.id, note: [note.x, note.z], deep: s.deep });
            });
          }
        }
      }
    }
    expect(locks).toBeGreaterThan(10);
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
