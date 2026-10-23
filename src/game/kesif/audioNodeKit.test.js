import { describe, expect, it } from 'vitest';
import { createNodeKit } from './audioNodeKit.js';
import {
  advance, connectedCount, liveSources, makeLoop,
} from './audioLoopTestKit.js';

function setup(cap) {
  const loop = makeLoop();
  const kit = createNodeKit({ cap });
  kit.setContext(loop.ctx);
  return { loop, kit, ctx: loop.ctx };
}

describe('audioNodeKit', () => {
  it('kaynaklar sayılır; tavan aşımı fırlatır ve sayaç değişmez', () => {
    const { kit } = setup(3);
    const g = kit.group('a');
    g.osc('sine', 100);
    g.osc('sine', 200);
    g.osc('sine', 300);
    expect(kit.count).toBe(3);
    expect(kit.canTake(1)).toBe(false);
    expect(() => g.osc('sine', 400)).toThrow('nodeBudget');
    expect(kit.count).toBe(3);
    g.destroy();
    expect(kit.count).toBe(0);
  });

  it('destroy: kaynaklar durur, tüm düğümlerin bağlantısı kesilir', () => {
    const { kit, ctx, loop } = setup(10);
    const base = connectedCount(ctx);
    const g = kit.group('v');
    const o = g.osc('sawtooth', 80);
    const gn = g.gain(0.5);
    const f = g.filter('lowpass', 500, 1);
    o.connect(f);
    f.connect(gn);
    gn.connect(loop.sfx);
    const n = g.noise(loop.white);
    n.connect(f);
    expect(liveSources(ctx)).toBe(2);
    g.destroy();
    expect(liveSources(ctx)).toBe(0);
    expect(connectedCount(ctx)).toBe(base);
    expect(kit.count).toBe(0);
    expect(kit.groups).toBe(0);
  });

  it('dispose(fade): sönümle, süre dolunca (onended) temizlenir', () => {
    const { kit, ctx, loop } = setup(10);
    const base = connectedCount(ctx);
    const g = kit.group('v');
    const out = g.gain(1);
    g.out = out;
    out.connect(loop.sfx);
    const o = g.osc('sine', 100);
    o.connect(out);
    g.dispose(0.2);
    expect(kit.count).toBe(1); // henüz bitmedi
    expect(out.gain.events.some((e) => e[0] === 'target' && e[1] === 0)).toBe(true);
    advance(ctx, 0.1);
    expect(kit.count).toBe(1);
    advance(ctx, 0.3);
    expect(kit.count).toBe(0);
    expect(connectedCount(ctx)).toBe(base);
  });

  it('finish(endT): tek atımlık kaynaklar endT\'de durur', () => {
    const { kit, ctx, loop } = setup(10);
    const g = kit.group('s');
    const out = g.gain(0);
    out.connect(loop.sfx);
    const o = g.osc('sine', 300, ctx.currentTime + 0.1);
    o.connect(out);
    g.finish(ctx.currentTime + 0.5);
    expect(kit.count).toBe(1);
    advance(ctx, 0.4);
    expect(kit.count).toBe(1);
    advance(ctx, 0.2);
    expect(kit.count).toBe(0);
  });

  it('sweep: onended gelmese bile süresi dolan ölü grup temizlenir', () => {
    const { kit, ctx } = setup(10);
    const g = kit.group('s');
    const o = g.osc('sine', 300);
    o.onended = null; // olay kaybı
    g.dispose(0.1);
    ctx.currentTime += 1; // advance çağrılmadan zaman geçti
    kit.sweep(ctx.currentTime);
    expect(kit.count).toBe(0);
    expect(kit.groups).toBe(0);
  });

  it('bağlam değişince eski gruplar atılır', () => {
    const a = setup(10);
    const g = a.kit.group('x');
    g.osc('sine', 100);
    const b = makeLoop();
    a.kit.setContext(b.ctx);
    expect(a.kit.count).toBe(0);
    expect(a.kit.ctx).toBe(b.ctx);
  });

  it('1000 grup oluştur/bırak: sayaç 0, bağlı düğüm sızıntısı 0', () => {
    const { kit, ctx, loop } = setup(8);
    const base = connectedCount(ctx);
    for (let i = 0; i < 1000; i++) {
      const g = kit.group('c');
      const out = g.gain(1);
      g.out = out;
      out.connect(loop.sfx);
      g.osc('sine', 100 + i).connect(out);
      g.noise(loop.white).connect(out);
      if (i % 2) g.dispose(0.05);
      else g.destroy();
      advance(ctx, 0.1);
      expect(kit.count).toBeLessThanOrEqual(2);
    }
    advance(ctx, 1);
    expect(kit.count).toBe(0);
    expect(liveSources(ctx)).toBe(0);
    expect(connectedCount(ctx)).toBe(base);
    const s = kit.stats();
    expect(s.created).toBe(2000);
    expect(s.released).toBe(2000);
  });

  it('bağlam yokken grup açılamaz', () => {
    const kit = createNodeKit({ cap: 4 });
    expect(() => kit.group('x')).toThrow('noContext');
  });
});
