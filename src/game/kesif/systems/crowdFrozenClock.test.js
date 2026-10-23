import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem } from './crowd.js';

vi.setConfig({ testTimeout: 240000 });

/*
 * QA4-003: dünya saati DONUKKEN (debug `time freeze`, QA betikleri) crowd sistemi her 0,5 sn'de `cr.setTime(worldTime)` ile yaya saatini donuk dünya saatine geri sarıyordu →
 * `C.time - C.nearAt > 1.2` hiç sağlanmıyor, doğma halkasının yakın-kenar listesi hiç yenilenmiyor: oyuncu ilk konumundan uzaklaşınca (araç, ışınlanma, yürüyüş) yaya DOĞMUYOR (alive 0).
 * Düzeltme: donuk saatte senkron atlanır + yakın-kenar yenilemesi birikimli sayaçla (C.time'a bağlı değil).
 */
function boot() {
  const kit = makeDimG({ render: true, systems: ['blocks', 'props', 'dimension'] });
  const G = kit.G;
  const sys = createSystem(G);
  G.addSystem(sys);
  G.registry.list().forEach((s) => { if (s === sys && typeof s.init === 'function') s.init(G); });
  return { kit, G, sys };
}

function prep(b, px, pz) {
  const w = b.G.world;
  for (let cx = Math.floor((px - 130) / 16); cx <= Math.floor((px + 130) / 16); cx++) for (let cz = Math.floor((pz - 130) / 16); cz <= Math.floor((pz + 130) / 16); cz++) w.ensureChunk(cx, cz);
}

describe('crowd sistemi: donuk dünya saatinde oyuncu uzaklaşınca yaya doğar (QA4-003)', () => {
  it('saat donuk: (240,80) → (-240,-160) ışınlanma + 25 sn: yaya doğar ve yakın-kenar listesi yeni konumdan kurulur', () => {
    const b = boot();
    const r = b.kit.mgr.swap('neon', { reason: 'test' });
    expect(r.ok).toBe(true);
    b.G.clock.frozen = true;
    prep(b, 240, 80);
    b.kit.place(240, 64, 80, 0);
    b.G.worldReady = true;
    b.kit.frame(1 / 60, 240);
    expect(b.G.crowd.alive()).toBeGreaterThanOrEqual(8);
    prep(b, -240, -160);
    b.kit.place(-240.5, 64, -160.5, 0);
    b.kit.frame(1 / 60, 60 * 25);
    const cr = b.G.crowd;
    expect(cr.alive(), 'yeni konumda yaya').toBeGreaterThanOrEqual(6);
    const near = [];
    for (let i = 0; i < cr.ctx.nearN; i++) {
      const e = cr.ctx.nearList[i];
      near.push(Math.hypot((cr.nav.nx[cr.nav.ea[e]] + cr.nav.nx[cr.nav.eb[e]]) / 2 + 240.5, (cr.nav.nz[cr.nav.ea[e]] + cr.nav.nz[cr.nav.eb[e]]) / 2 + 160.5));
    }
    expect(Math.min.apply(null, near)).toBeLessThan(90);
  });
});
