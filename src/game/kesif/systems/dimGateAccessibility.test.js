import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { CORE_ITEM } from '../sim/dim/travel.js';
import { PORTAL_GUN_ITEM } from '../sim/techData.js';

vi.setConfig({ testTimeout: 120000 });

/** Sözleşme §2: erişilebilirlik modu → süre ×2, kapı yarıçapı ×2 (boyut kapısı: ömür 60 sn, tetik hacmi iki kat geniş). */
function armed(k) {
  const { G } = k;
  G.progression.abilities.portalGun = true;
  G.abilities.portalGun = true;
  G.inventory.add(PORTAL_GUN_ITEM, 1);
  for (let i = 0; i < G.inventory.slots.length; i++) if (G.inventory.slots[i] && G.inventory.slots[i].item === PORTAL_GUN_ITEM) G.inventory.selected = i;
  G.inventory.held().charge = 24;
  G.inventory.add(CORE_ITEM, 1);
  G.portalMode = 'boyut';
  k.mgr.dimMeta.calibrated = true;
  k.place(0.5, k.G.body.y, 0.5, 0);
  k.step(2);
}

function openGate(a11y) {
  const k = makeDimG();
  k.G.accessibility = a11y;
  armed(k);
  expect(k.G.dimGate.fire()).toBe(true);
  return { k, g: k.G.dimGate.current() };
}

describe('boyut kapısı + erişilebilirlik modu', () => {
  it('kapı ömrü: normal 30 sn, erişilebilirlikte 60 sn', () => {
    expect(openGate(false).g.ttl).toBe(30);
    expect(openGate(true).g.ttl).toBe(60);
  });

  it('tetik hacmi: kapı ortasından yanal 1,8 blok → normalde GİRMEZ, erişilebilirlikte girer; 3,0 blok → ikisinde de girmez', () => {
    [[false, 1.8, false], [true, 1.8, true], [true, 3.0, false], [false, 3.0, false]].forEach(([a11y, off, want]) => {
      const { k, g } = openGate(a11y);
      const wx = g.nx !== 0 ? 0 : 1;
      const wz = g.nx !== 0 ? 1 : 0;
      k.place(g.x + wx * off, g.y, g.z + wz * off, k.G.player.yaw);
      k.run(0.2);
      expect(k.G.transition.active).toBe(want);
    });
  });
});
