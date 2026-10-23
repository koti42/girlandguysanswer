import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem as createVisual } from './crowdVisual.js';

vi.setConfig({ testTimeout: 120000 });

/*
 * perf_tuner (Faz 5): yaya çizicisinin ısınması geçişin DONMUŞ karelerinde (G.crowd henüz yokken) yapılır — eskiden geçiş sonrası ilk karede
 * (yaya benzetimi ilk sabit adımda doğduğu için) ~450 ms takılma olurdu. Çizici gizli kalır (yaya yokken çizim yok).
 */
describe('crowdVisual ısınma zamanı', () => {
  it('şehirde G.crowd yokken ilk çerçevede ısınır (renderer.compile); grup görünür olmaz; ikinci kez ısınmaz', () => {
    const kit = makeDimG({ render: true, systems: ['blocks', 'props', 'dimension'] });
    const G = kit.G;
    const compile = vi.fn();
    G.renderer = Object.assign(G.renderer || {}, { compile });
    const vis = createVisual(G);
    G.addSystem(vis);
    vis.init(G);
    expect(kit.mgr.swap('neon', { reason: 'test' }).ok).toBe(true);
    G.crowd = null;
    G.simFrozen = true; // geçiş donuk sabit adımlar: crowd sistemi henüz çalışmadı
    kit.frame(1 / 60, 3);
    expect(compile.mock.calls.length).toBeGreaterThan(0);
    const first = compile.mock.calls.length;
    expect(G.crowdRender).toBeTruthy();
    expect(G.crowdRender.group.visible).toBe(false);
    kit.frame(1 / 60, 10);
    expect(compile.mock.calls.length).toBe(first);
    vis.dispose();
  });

  it('ana diyarda ısınmaz', () => {
    const kit = makeDimG({ render: true, systems: ['blocks', 'props', 'dimension'] });
    const G = kit.G;
    const compile = vi.fn();
    G.renderer = Object.assign(G.renderer || {}, { compile });
    const vis = createVisual(G);
    G.addSystem(vis);
    vis.init(G);
    kit.frame(1 / 60, 5);
    expect(compile).not.toHaveBeenCalled();
    vis.dispose();
  });
});
