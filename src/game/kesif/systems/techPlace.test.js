import { describe, expect, it } from 'vitest';
import { B, makeTechG } from './techGameTestKit.js';
import { TECH_BLOCK_ITEMS, TECH_BLOCK_DEFS, techBaseId } from '../sim/techData.js';
import { events } from './blocksTestKit.js';

const GROUND = 40;

describe('teknoloji blokları gerçek yerleştirme yolundan', () => {
  it('her taban blok eşyası çimene sağ tıkla yerleştirilir, makine olanlar kayıt defterine girer', () => {
    TECH_BLOCK_ITEMS.forEach((it, i) => {
      const k = makeTechG();
      k.G.inventory.setSlot(0, it.key, 1);
      k.G.inventory.selected = 0;
      const x = 12 + (i % 5);
      const z = 6 + Math.floor(i / 5) * 2;
      k.moveTo(x + 0.5, GROUND + 1, z + 3.5);
      k.aim(x, GROUND, z);
      k.step(1);
      k.clearLog();
      k.step(3, { placePressed: true });
      const ev = events(k.G, 'blockPlaced').find((e) => e.id === it.placesBlock);
      expect(ev, it.key + ' yerleştirilmedi').toBeTruthy();
      const pa = { x: ev.x, y: ev.y, z: ev.z }; // yerleştirme olayının bildirdiği hücre
      const id = k.G.world.getBlock(pa.x, pa.y, pa.z);
      expect(techBaseId(id) || id, it.key).toBe(it.placesBlock); // sensör yakındaki oyuncuyla hemen etkinleşebilir
      const def = TECH_BLOCK_DEFS.find((d) => d.id === it.placesBlock);
      if (def.type) expect(k.tech.has(pa.x, pa.y, pa.z), it.key).toBe(true);
      expect(events(k.G, 'blockPlaced').some((e) => e.id === it.placesBlock), it.key).toBe(true);
    });
  });

  it('düğme duvara (yan yüze) yerleştirilir; kırınca makine kaydı silinir ve eşya düşer', () => {
    const k = makeTechG();
    for (let y = GROUND + 1; y <= GROUND + 3; y++) k.place(14, y, 10, B.STONE);
    k.G.inventory.setSlot(0, 'blok:düğme', 2);
    k.G.inventory.selected = 0;
    k.moveTo(11.5, GROUND + 1, 10.5);
    k.aim(14, GROUND + 2, 10);
    k.step(3, { placePressed: true });
    expect(k.G.world.getBlock(13, GROUND + 2, 10)).toBe(B.TECH_BUTTON);
    expect(k.tech.has(13, GROUND + 2, 10)).toBe(true);
    k.clearLog();
    k.aim(13, GROUND + 2, 10);
    k.step(60, { breakHeld: true, attackPressed: true });
    expect(k.G.world.getBlock(13, GROUND + 2, 10)).toBe(0);
    expect(k.tech.has(13, GROUND + 2, 10)).toBe(false);
    expect(k.G.items.some((d) => d.item === 'blok:düğme')).toBe(true);
  });
});
