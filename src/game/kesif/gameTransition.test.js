/*
 * gameTransition (geçiş makinesi): evre süreleri, en az 2,7 sn, reducedMotion 0,4 sn karartma, 20 sn zaman aşımı → kaynağa dönüş + iade,
 * giriş kilidi/fizik dondurma, otomatik kayıt bastırma + TEK 'dimension' kaydı, destroy/iptal.
 */
import { describe, expect, it } from 'vitest';
import { createTransition, TRANSITION_TIMING } from './gameTransition.js';

function fakeKit(o) {
  const opt = o || {};
  const calls = [];
  const G = {
    reducedMotion: !!opt.reduced,
    accessibility: false,
    simFrozen: false,
    transitionActive: false,
    postfx: { warps: [], setEffects(e) { if (e.warp !== undefined) this.warps.push(e.warp); this.last = Object.assign(this.last || {}, e); } },
    hud: {},
    emitted: [],
    saves: [],
    emit(e) { this.emitted.push(e); },
    requestSave(r) { this.saves.push(r); },
    sound(n) { calls.push(['sound', n]); },
    haptic() {},
    speak() {},
  };
  let dim = opt.from || 'overworld';
  const ready = { v: opt.ready === undefined ? true : opt.ready, p: 0 };
  const mgr = {
    get current() { return dim; },
    swapFail: !!opt.swapFail,
    swaps: [],
    readiness() { return { ready: ready.v, progress: ready.p }; },
    swap(to, o2) {
      mgr.swaps.push([to, o2 && o2.reason]);
      if (mgr.swapFail) return { ok: false, reason: 'x' };
      dim = to;
      return { ok: true, from: to === 'neon' ? 'overworld' : 'neon', to };
    },
    get(id) { return { exit: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 }, id }; },
    say(t) { G.said = t; },
  };
  let rebuilds = 0;
  const charges = [];
  const tr = createTransition(G, {
    mgr,
    onCharge: (k) => charges.push(k),
    propsReady: opt.propsReady || (() => true),
    now: opt.now,
  });
  /** sec sn, 1/60 kareler; until() true → dur. */
  function run(sec, until) {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      tr.update(1 / 60);
      if (until && until()) return (i + 1) / 60;
    }
    return sec;
  }
  return {
    G, mgr, tr, ready, calls, charges, run, rebuilds: () => rebuilds, bump() { rebuilds++; },
  };
}

describe('geçiş evreleri', () => {
  it('charge 0,8 → warpIn 0,6 → swap → hold → warpOut 0,7; toplam ≥ 2,7 sn; sonunda tek kayıt (dimension)', () => {
    const k = fakeKit();
    const phases = [];
    const tr = k.tr;
    expect(tr.start({ to: 'neon', reason: 'gate' })).toEqual({ ok: true });
    expect(k.G.simFrozen).toBe(true);
    expect(k.G.transitionActive).toBe(true);
    let last = '';
    let t = 0;
    for (let i = 0; i < 60 * 8; i++) {
      tr.update(1 / 60);
      t += 1 / 60;
      if (tr.phase !== last) {
        last = tr.phase;
        phases.push([tr.phase, +t.toFixed(2)]);
      }
      if (!tr.active) break;
    }
    expect(phases.map((p) => p[0])).toEqual(['charge', 'warpIn', 'hold', 'warpOut', 'idle']);
    expect(phases[1][1]).toBeCloseTo(0.8, 1);
    expect(phases[2][1]).toBeCloseTo(1.4, 1);
    expect(t).toBeGreaterThanOrEqual(2.69);
    expect(t).toBeLessThan(3.2);
    expect(k.mgr.swaps).toEqual([['neon', 'gate']]);
    expect(k.G.simFrozen).toBe(false);
    expect(k.G.transitionActive).toBe(false);
    expect(k.G.saves).toEqual(['dimension']);
    expect(tr.info.count).toBe(1);
    expect(k.G.postfx.last.warp).toBe(0);
    expect(k.calls.map((c) => c[1])).toEqual(['dim:charge', 'dim:whoosh', 'dim:arrive']);
  });

  it('warp eğrisi: 0 → 1 (warpIn) ve 1 → 0 (warpOut), monoton; yük overlay >0,6 sn bekleyince', () => {
    const k = fakeKit({ ready: false });
    k.tr.start({ to: 'neon', reason: 'gate' });
    k.run(1.5);
    expect(k.tr.phase).toBe('hold');
    expect(k.G.dimLoading).toBeUndefined();
    k.ready.p = 0.4;
    k.run(0.7);
    expect(k.G.dimLoading.active).toBe(true);
    expect(k.G.dimLoading.progress).toBeCloseTo(0.4, 5);
    k.ready.p = 1;
    k.ready.v = true;
    k.run(0.5);
    expect(k.tr.phase).not.toBe('hold');
    const w = k.G.postfx.warps;
    const up = w.slice(0, w.indexOf(1) + 1);
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThanOrEqual(up[i - 1] - 1e-9);
    k.run(1);
    expect(k.G.dimLoading.active).toBe(false);
    expect(k.G.postfx.last.warp).toBe(0);
  });

  it('girdi kilidi: geçiş başlarken ikinci start reddedilir; bitince yeniden başlatılabilir', () => {
    const k = fakeKit();
    expect(k.tr.start({ to: 'neon' }).ok).toBe(true);
    expect(k.tr.start({ to: 'neon' }).ok).toBe(false);
    k.run(4);
    expect(k.tr.active).toBe(false);
    expect(k.tr.start({ to: 'overworld' }).ok).toBe(true);
  });

  it('duraklatma (dt=0) süreyi ilerletmez; sekme gizlenip dönünce (büyük dt kırpılır) süre sıçramaz', () => {
    const k = fakeKit();
    k.tr.start({ to: 'neon' });
    for (let i = 0; i < 100; i++) k.tr.update(0);
    expect(k.tr.phase).toBe('charge');
    expect(k.tr.state.t).toBe(0);
    k.tr.update(5); // tek büyük kare (sekme dönüşü): 0,1 sn ile sınırlı
    expect(k.tr.state.t).toBeLessThanOrEqual(0.1000001);
  });

  it('hazır olmayan (ready=false) hold beklemeye devam eder, hazır olunca açılır', () => {
    const k = fakeKit({ ready: false });
    k.tr.start({ to: 'neon' });
    k.run(6);
    expect(k.tr.phase).toBe('hold');
    k.ready.v = true;
    k.run(2);
    expect(k.tr.active).toBe(false);
  });

  it('propsReady false iken hold bekler', () => {
    let ok = false;
    const k = fakeKit({ propsReady: () => ok });
    k.tr.start({ to: 'neon' });
    k.run(5);
    expect(k.tr.phase).toBe('hold');
    ok = true;
    k.run(1.5);
    expect(k.tr.active).toBe(false);
  });
});

describe('reducedMotion', () => {
  it('warp yok: charge 0,2 + 0,4 sn karartma + hold ≥ 0,3 + 0,4 sn açılış; toplam < 2 sn', () => {
    const k = fakeKit({ reduced: true });
    k.tr.start({ to: 'neon' });
    let t = 0;
    const seen = [];
    for (let i = 0; i < 60 * 5 && k.tr.active; i++) {
      k.tr.update(1 / 60);
      t += 1 / 60;
      if (seen[seen.length - 1] !== k.tr.phase) seen.push(k.tr.phase);
    }
    expect(seen).toEqual(['charge', 'warpIn', 'hold', 'warpOut', 'idle']);
    expect(t).toBeLessThan(2);
    expect(t).toBeGreaterThan(0.9);
    expect(k.tr.info.reduced).toBe(true);
  });

  it('karartma eğrisi ≤ 3 Hz: warp değeri bir kez yükselir, bir kez alçalır (titreme yok)', () => {
    const k = fakeKit({ reduced: true });
    k.tr.start({ to: 'neon' });
    k.run(3);
    const w = k.G.postfx.warps.filter((v) => v !== 0 || true);
    let dirChanges = 0;
    let dir = 0;
    for (let i = 1; i < w.length; i++) {
      const d = Math.sign(w[i] - w[i - 1]);
      if (d !== 0 && d !== dir) {
        if (dir !== 0) dirChanges++;
        dir = d;
      }
    }
    expect(dirChanges).toBeLessThanOrEqual(1);
  });
});

describe('zaman aşımı / hata', () => {
  it('20 sn hazır olmazsa kaynağa dönülür, maliyet iade edilir, ileti verilir; kaynak da gecikirse yine de açılır (takılma yok)', () => {
    const refunds = [];
    const k = fakeKit({ ready: false });
    k.tr.start({ to: 'neon', reason: 'gate', refund: (w) => refunds.push(w) });
    k.run(1.5);
    expect(k.tr.phase).toBe('hold');
    k.run(TRANSITION_TIMING.timeout + 0.5);
    expect(refunds).toEqual(['zaman']);
    expect(k.mgr.swaps.map((s) => s[0])).toEqual(['neon', 'overworld']);
    expect(k.mgr.swaps[1][1]).toBe('abort');
    expect(k.G.said).toMatch(/iade/);
    expect(k.G.emitted.some((e) => e.type === 'dimensionAborted')).toBe(true);
    // kaynak de hazır değil: 20 sn daha beklenir, sonra açılır
    expect(k.tr.phase).toBe('hold');
    k.run(TRANSITION_TIMING.timeout + 0.5);
    k.run(1);
    expect(k.tr.active).toBe(false);
    expect(k.G.simFrozen).toBe(false);
    expect(k.G.saves).toEqual(['dimension']);
  });

  it('kaynak hazırsa iade sonrası hemen açılır', () => {
    const k = fakeKit({ ready: false });
    k.tr.start({ to: 'neon', refund: () => {} });
    k.run(1.5);
    k.run(TRANSITION_TIMING.timeout + 0.2);
    k.ready.v = true;
    k.run(2);
    expect(k.tr.active).toBe(false);
    expect(k.tr.info.aborted).toBe(true);
  });

  it('swap başarısız: kilit açılır, maliyet iade edilir, geçiş biter', () => {
    const refunds = [];
    const k = fakeKit({ swapFail: true });
    k.tr.start({ to: 'neon', refund: (w) => refunds.push(w) });
    k.run(4);
    expect(k.tr.active).toBe(false);
    expect(refunds).toEqual(['swap']);
    expect(k.G.simFrozen).toBe(false);
    expect(k.G.postfx.last.warp).toBe(0);
  });

  it('cancel/destroy geçişin ortasında: bayraklar ve warp temizlenir; swap yapılmışsa iade YOK, yapılmamışsa (iptal) iade', () => {
    const refunds = [];
    const k = fakeKit();
    k.tr.start({ to: 'neon', refund: (w) => refunds.push(w) });
    k.run(0.5);
    k.tr.cancel('destroy');
    expect(k.tr.active).toBe(false);
    expect(k.G.simFrozen).toBe(false);
    expect(k.G.transitionActive).toBe(false);
    expect(k.G.postfx.last.warp).toBe(0);
    expect(refunds).toEqual([]); // destroy: kayıt zaten tutarlı, iade değil
    const k2 = fakeKit();
    k2.tr.start({ to: 'neon', refund: (w) => refunds.push(w) });
    k2.run(0.3);
    k2.tr.cancel('iptal');
    expect(refunds).toEqual(['iptal']);
    // hold sırasında destroy: dünya zaten değişmiş, iade yok
    const k3 = fakeKit({ ready: false });
    k3.tr.start({ to: 'neon', refund: (w) => refunds.push(w) });
    k3.run(1.6);
    expect(k3.tr.phase).toBe('hold');
    k3.tr.dispose();
    expect(refunds).toEqual(['iptal']);
    expect(k3.G.simFrozen).toBe(false);
    expect(k3.tr.start({ to: 'neon' }).ok).toBe(false); // atıldıktan sonra başlamaz
  });

  it('önyükleme (kayıt şehirde): ekran kapalı başlar, swap hemen, hold sonra açılış; charge/warpIn yok', () => {
    const k = fakeKit({ ready: false });
    k.tr.startBoot({ to: 'neon', reason: 'restore', arrival: { x: 1, y: 2, z: 3 } });
    expect(k.tr.phase).toBe('hold');
    expect(k.mgr.swaps).toEqual([['neon', 'restore']]);
    expect(k.G.postfx.warps[0]).toBe(1);
    k.run(1);
    expect(k.tr.phase).toBe('hold');
    k.ready.v = true;
    k.run(1.5);
    expect(k.tr.active).toBe(false);
    expect(k.calls.map((c) => c[1])).toEqual(['dim:arrive']);
  });
});
