import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem as createMissions } from './cityMissions.js';
import { createSystem as createDiscovery } from './cityDiscovery.js';
import { createSystem as createNpc } from './cityNpc.js';
import { KREDI } from '../sim/city/mission/missionData.js';

/*
 * Regresyon (docs denetimi): Boyut Terminali ilk kullanımda `terminalFound {terminal, first}` yayar (sim/props/propBehaviors.js, propWorld testleri sabitler).
 * cityDiscovery bu olayı yalnız `evt.index` ile okuyordu → gerçek oyunda terminal keşfi +Kredi / "Boyut Terminali bulundu" duyurusu vermiyordu.
 * Her iki alan adı da kabul edilir (`index` = eski sözleşme, `terminal` = prop olayı).
 */
vi.setConfig({ testTimeout: 240000 });

function boot() {
  const kit = makeDimG({ render: true, systems: ['blocks', 'props', 'dimension'] });
  const G = kit.G;
  G.vehicles = { driven: null, list: () => [] };
  const events = [];
  const emit0 = G.emit;
  G.emit = (e) => { events.push(e); return emit0(e); };
  [createNpc(G), createMissions(G), createDiscovery(G)].forEach((s) => G.addSystem(s));
  expect(kit.mgr.swap('neon', { reason: 'test' }).ok).toBe(true);
  G.hud.city = { kredi: 0, district: '', mission: null, radio: '', light: null };
  kit.frame(1 / 60, 10);
  return { kit, G, events };
}

const terminalGain = (b) => b.events.filter((e) => e.type === 'kredi' && e.why === 'terminal').reduce((a, e) => a + e.delta, 0);

describe('cityDiscovery: terminalFound olayı', () => {
  it('prop olayı (terminal alanı) terminal başına bir kez +Kredi verir', () => {
    const b = boot();
    b.G.emit({ type: 'terminalFound', terminal: 3, first: true });
    b.kit.frame(1 / 60, 2);
    expect(terminalGain(b)).toBe(KREDI.terminal);
  });

  it('eski sözleşme (index alanı) da çalışır; geçersiz kimlik ödül vermez', () => {
    const b = boot();
    b.G.emit({ type: 'terminalFound', index: 4 });
    b.G.emit({ type: 'terminalFound', terminal: 99 });
    b.G.emit({ type: 'terminalFound', terminal: -1 });
    b.G.emit({ type: 'terminalFound', terminal: 'x' });
    b.kit.frame(1 / 60, 2);
    expect(terminalGain(b)).toBe(KREDI.terminal);
  });
});
