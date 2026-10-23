import { describe, expect, it } from 'vitest';
import { WORLD_Y_MAX, WORLD_Y_MIN } from './constants.js';
import { Inventory } from './inventory.js';
import { BrewManager } from './magicBrew.js';
import { ITEM_BOTTLE } from './magicData.js';
import { brewRecipe } from './magicRecipes.js';
import { decodeChests, encodeChests } from './saveSanitize.js';

/* Macera dünyası y ∈ [WORLD_Y_MIN, WORLD_Y_MAX]: sandık ve kazan anahtarları 0..127 ile kırpılmamalı (kayıtta kaybolurdu). */
describe('macera yüksekliğinde kayıt anahtarları', () => {
  const ys = [WORLD_Y_MIN, -250, -1, 0, 42, 127, 128, 300, WORLD_Y_MAX];

  it('sandıklar tüm macera y aralığında kayıttan sağ çıkar', () => {
    const src = {};
    ys.forEach((y, i) => { src['3,' + y + ',' + (-i)] = [['blok:taş', 5]]; });
    const enc = encodeChests(src);
    expect(Object.keys(enc).length).toBe(ys.length);
    const dec = decodeChests(enc);
    ys.forEach((y, i) => { expect(dec['3,' + y + ',' + (-i)] || dec.get?.('3,' + y + ',' + (-i))).toBeTruthy(); });
  });

  it('aralık dışı sandık yine atılır', () => {
    const enc = encodeChests({ ['0,' + (WORLD_Y_MAX + 1) + ',0']: [], ['0,' + (WORLD_Y_MIN - 1) + ',0']: [] });
    expect(Object.keys(enc).length).toBe(0);
  });

  it('simya kazanı derin/yüksek konumda başlar ve seri hale gelip geri yüklenir', () => {
    ys.forEach((y) => {
      const b = new BrewManager();
      const inv = new Inventory();
      const r = brewRecipe('hiz');
      r.in.forEach((p) => inv.add(p.item, p.count));
      inv.add(ITEM_BOTTLE, 1);
      const pos = { x: 1, y, z: 2 };
      expect(b.start(pos, 'hiz', 1, inv).ok).toBe(true);
      const b2 = new BrewManager();
      b2.restore(JSON.parse(JSON.stringify(b.serialize())));
      expect(b2.has(pos)).toBe(true);
    });
    expect(new BrewManager().has({ x: 0, y: WORLD_Y_MAX + 1, z: 0 })).toBe(false);
  });
});
