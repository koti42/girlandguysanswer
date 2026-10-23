/*
 * qa_p1 G5: zaman aşımıyla iptal edilen sıçrama durum izi bırakmaz (dimMeta.visits/firstArrival/lastHopAt/link/overworldPos + stats.hops),
 * böylece "ilk varış" ipucu korunur ve 20 sn atlama beklemesi başarısız denemeye uygulanmaz. `calibrated` geçiş makinesince değiştirilmez.
 */
import { describe, expect, it } from 'vitest';
import { createTransition, TRANSITION_TIMING } from './gameTransition.js';

function kit(readyFn) {
  const G = {
    reducedMotion: false, accessibility: false, simFrozen: false, transitionActive: false, hud: {}, emitted: [], saves: [],
    postfx: { setEffects() {} },
    emit(e) { this.emitted.push(e); }, requestSave(r) { this.saves.push(r); }, sound() {}, haptic() {}, speak() {},
  };
  let dim = 'overworld';
  const dimMeta = {
    calibrated: true, visits: 0, firstArrival: null, link: null, overworldPos: null, lastHopAt: 0,
  };
  const stats = { hops: 0, swaps: 0 };
  const mgr = {
    get current() { return dim; },
    dimMeta,
    stats,
    readiness() { return readyFn(); },
    swap(to, o) {
      const from = dim;
      dim = to;
      stats.swaps++;
      if (to === 'neon') {
        dimMeta.visits++;
        if (!dimMeta.firstArrival) dimMeta.firstArrival = 123456;
        dimMeta.link = { from: [1, 2, 3, 0] };
        dimMeta.overworldPos = [1, 2, 3];
      }
      if (o && (o.reason === 'gate' || o.reason === 'terminal' || o.reason === 'home')) {
        dimMeta.lastHopAt = 42;
        stats.hops++;
      }
      return { ok: true, from, to };
    },
    get(id) { return { exit: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }, id }; },
    say() {},
  };
  const tr = createTransition(G, { mgr });
  const run = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) tr.update(1 / 60); };
  return { G, mgr, tr, run, dimMeta, stats };
}

describe('zaman aşımı sıçrama izi', () => {
  it('varış hiç hazır olmazsa: kaynağa döner; visits/firstArrival/lastHopAt/link/overworldPos/hops eski değerinde; calibrated dokunulmaz', () => {
    const k = kit(() => ({ ready: false, progress: 0.1 }));
    const refunds = [];
    expect(k.tr.start({ to: 'neon', reason: 'gate', refund: (w) => refunds.push(w) }).ok).toBe(true);
    k.run(TRANSITION_TIMING.timeout + 4);
    expect(refunds).toEqual(['zaman']);
    expect(k.mgr.current).toBe('overworld');
    expect(k.dimMeta.visits).toBe(0);
    expect(k.dimMeta.firstArrival).toBeNull();
    expect(k.dimMeta.lastHopAt).toBe(0);
    expect(k.dimMeta.link).toBeNull();
    expect(k.dimMeta.overworldPos).toBeNull();
    expect(k.stats.hops).toBe(0);
    expect(k.dimMeta.calibrated).toBe(true); // iade kuralı (dimGate.refund) belirler; geçiş makinesi değiştirmez
  });

  it('önceki ziyaretler korunur: ikinci sıçrama zaman aşımına uğrarsa visits 1, ilk varış zamanı ve eski bağlantı aynı kalır', () => {
    const k = kit(() => ({ ready: true, progress: 1 }));
    k.tr.start({ to: 'neon', reason: 'gate' });
    k.run(8);
    expect(k.mgr.current).toBe('neon');
    const meta1 = JSON.parse(JSON.stringify(k.dimMeta));
    // geri dön (başarılı)
    k.tr.start({ to: 'overworld', reason: 'terminal' });
    k.run(8);
    expect(k.mgr.current).toBe('overworld');
    k.dimMeta.lastHopAt = 7;
    // ikinci sıçrama: varış hazır değil
    const k2ready = { v: false };
    k.mgr.readiness = () => ({ ready: k2ready.v, progress: 0.2 });
    const hopsBefore = k.stats.hops;
    const visitsBefore = k.dimMeta.visits;
    k.tr.start({ to: 'neon', reason: 'gate' });
    k.run(TRANSITION_TIMING.timeout + 4);
    expect(k.mgr.current).toBe('overworld');
    expect(k.dimMeta.visits).toBe(visitsBefore);
    expect(k.dimMeta.lastHopAt).toBe(7);
    expect(k.dimMeta.firstArrival).toBe(meta1.firstArrival);
    expect(k.stats.hops).toBe(hopsBefore);
  });

  it('başarılı sıçrama izleri korur (geri alma yalnız iptalde)', () => {
    const k = kit(() => ({ ready: true, progress: 1 }));
    k.tr.start({ to: 'neon', reason: 'gate' });
    k.run(8);
    expect(k.dimMeta.visits).toBe(1);
    expect(k.dimMeta.lastHopAt).toBe(42);
    expect(k.dimMeta.firstArrival).toBe(123456);
    expect(k.stats.hops).toBe(1);
  });
});
