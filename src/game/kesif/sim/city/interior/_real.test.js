import { it } from 'vitest';
import { interiorLots } from './testKit.js';
import { planInterior } from './index.js';
import { assignClues } from './locks.js';
it('probe real2', () => {
  const out = {};
  let shown = 0;
  interiorLots(0, { kinds: ["klinik", "kulup", "cati_bahcesi"] }).forEach(({ lot, bp }) => {
    const it2 = planInterior(bp, lot);
    if (!it2) return;
    const kods = it2.doors.filter((d) => d.lock && d.lock.kind === 'kod');
    if (!kods.length) return;
    const m = assignClues(it2);
    kods.forEach((d) => {
      const k = bp.interior.kind + '|' + (m.has(d.lock.id) ? 'has' : 'NO');
      out[k] = (out[k] || 0) + 1;
      if (bp.interior.kind === 'klinik' && !m.has(d.lock.id) && shown < 2) {
        shown++;
        console.log(bp.interior.kind, JSON.stringify(d.lock), 'clues', JSON.stringify(it2.clues), 'locksRec', JSON.stringify(it2.locks), 'noteProps', JSON.stringify(it2.props.filter((p) => /not|pano|posta/.test(p.kind)).map((p) => [p.kind, p.data, p.x, p.z])));
      }
    });
  });
  console.log(JSON.stringify(out));
});
