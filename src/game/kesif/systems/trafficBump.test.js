import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem } from './traffic.js';

vi.setConfig({ testTimeout: 180000 });

/* QA3-001 (qa_p3): systems/traffic bump politikası — arkadan çarpılan araç durmaz, önden çarpılan 1,5 sn durur, 4. çarpmada solarak silinir. */
function boot() {
  const kit = makeDimG({ render: true, systems: ['blocks', 'props', 'dimension'] });
  const G = kit.G;
  const sys = createSystem(G);
  G.addSystem(sys);
  expect(kit.mgr.swap('neon', { reason: 'test' }).ok).toBe(true);
  for (let cx = -20; cx <= -10; cx++) for (let cz = -12; cz <= -3; cz++) G.world.ensureChunk(cx, cz);
  kit.place(-240, 64, -120, 0);
  G.worldReady = true;
  kit.frame(1 / 60, 240);
  return { kit, G, sys };
}

describe('traffic sistemi: oyuncu çarpma politikası (QA3-001)', () => {
  it('oyuncu aracın ARKASINDA: bekleme yok, hız sınırı yok; ÖNÜNDE: durur; 4. çarpmada state=2 (silinir)', () => {
    const b = boot();
    const tr = b.G.traffic;
    const idx = tr.cars.findIndex((c, i) => c.alive && c.state === 1 && c.v > 3 && b.sys.state.registered.has(b.sys.state.colBase + i));
    expect(idx).toBeGreaterThanOrEqual(0);
    const c = tr.cars[idx];
    const id0 = c.id;
    const fire = () => b.sys.onEvent(b.G, { type: 'vehiclePhys', ev: { type: 'bump', id: b.sys.state.colBase + idx, impact: 9 } });
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    // oyuncu 5 m ARKADA
    b.G.vehicles = { driven: { v: { x: c.x - fx * 5, z: c.z - fz * 5 } } };
    const v0 = c.v;
    fire();
    expect(c.hold).toBeLessThanOrEqual(0);
    expect(c.v).toBeCloseTo(v0, 5);
    expect(c.state).toBe(1);
    // oyuncu 5 m ÖNDE: eski davranış
    b.G.vehicles = { driven: { v: { x: c.x + fx * 5, z: c.z + fz * 5 } } };
    fire();
    expect(c.hold).toBeCloseTo(1.5, 5);
    expect(c.v).toBeLessThanOrEqual(1.5);
    // sürülen araç yok (G.vehicles null): eski davranış, çökmez
    b.G.vehicles = null;
    c.hold = 0;
    fire();
    expect(c.hold).toBeCloseTo(1.5, 5);
    // 4. çarpma (aynı araç, 10 sn içinde): solarak silinir
    expect(c.state).toBe(1);
    fire();
    expect(c.state).toBe(2);
    b.kit.frame(1 / 60, 240);
    expect(tr.carById(id0)).toBeFalsy(); // havuz nesnesi yeniden kullanılabilir: kimlik artık yok
  });

  it('boyut değişiminde kayıt tablosu temizlenir (teardown)', () => {
    const b = boot();
    b.sys.state.bumpHist.set(1, { t: 1, n: 3 });
    b.kit.mgr.swap('overworld', { reason: 'test' });
    expect(b.sys.state.bumpHist.size).toBe(0);
  });
});
