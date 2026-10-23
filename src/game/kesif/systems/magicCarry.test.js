/*
 * Büyülerin (ench) yuva kopyalayan her yerde taşınması: envanter görünümü, yere atma, yerden alma, sandık (kayıt dahil), blok drop'u.
 */
import { describe, expect, it } from 'vitest';
import { makeG } from './blocksTestKit.js';
import { restoreChests, serializeChests, takeChestContents, openChestSlots } from './blocksChest.js';
import { spawnDrops } from './blocksCore.js';

const ENCH = { keskinlik: 3, alev: 1 };

function enchanted() {
  const k = makeG({ held: 'item:kılıç_demir' });
  k.G.inventory.setEnchant(0, ENCH);
  return k;
}

describe('ench taşıma: api yüzeyi', () => {
  it('snapshot / dropSlot / pickup', async () => {
    const k = enchanted();
    const { G } = k;
    const { createSystem } = await import('./blocks.js');
    const sys = createSystem(G);
    sys.init(G);
    const api = sys.api(G);
    const snap = api.getInventorySnapshot();
    expect(snap.slots[0].ench).toEqual(ENCH);
    expect(snap.slots[0].lines.join(' ')).toMatch(/Keskinlik III/);
    expect(snap.slots[0].lines.join(' ')).toMatch(/Alev I/);
    expect('ench' in snap.slots[5]).toBe(false);
    // yere atma: ench yere düşen eşyaya geçer
    k.clearLog();
    expect(api.dropSlot('s0', 1)).toBe(true);
    expect(G.items).toHaveLength(1);
    expect(G.items[0].opts.ench).toEqual(ENCH);
    // yerden alma: ench geri gelir
    expect(G.pickupItem('item:kılıç_demir', 1, 100, ENCH)).toBe(0);
    const back = G.inventory.slots.find((s) => s && s.item === 'item:kılıç_demir');
    expect(back.ench).toEqual(ENCH);
    expect(back.dur).toBe(100);
    // geçersiz/çirkin ench temizlenir
    G.inventory.clear();
    G.pickupItem('item:kılıç_demir', 1, 100, { keskinlik: 99, sahte: 4, alev: 1, buz: 1 });
    const clean = G.inventory.slots.find((s) => s && s.item === 'item:kılıç_demir');
    expect(clean.ench.keskinlik).toBe(5);
    expect(clean.ench.sahte).toBeUndefined();
    expect(!(clean.ench.alev && clean.ench.buz)).toBe(true);
    // büyülenemeyen eşyaya ench yazılmaz
    G.pickupItem('blok:taş', 5, undefined, { keskinlik: 2 });
    expect(G.inventory.slots.find((s) => s && s.item === 'blok:taş').ench).toBeUndefined();
  });

  it('sandık: taşıma, kayıt gidiş-dönüşü ve sandık kırılınca drop büyüyü korur', async () => {
    const k = enchanted();
    const { G } = k;
    const { createSystem } = await import('./blocks.js');
    const sys = createSystem(G);
    sys.init(G);
    const api = sys.api(G);
    // sandığı aç (ui + pozisyon) ve envanterden sandığa taşı
    const slots = openChestSlots(G, 4, 41, 4);
    G.blocks.state.chestPos = { x: 4, y: 41, z: 4 };
    expect(api.moveStack('s0', 'c3')).toBe(true);
    expect(slots[3].ench).toEqual(ENCH);
    expect(api.getChest().slots[3].ench).toEqual(ENCH);
    const saved = JSON.parse(JSON.stringify(serializeChests(G)));
    expect(saved[0][1][3]).toEqual(['item:kılıç_demir', 1, 250, ENCH]);
    G.chests.clear();
    restoreChests(G, saved);
    expect(G.chests.get('4,41,4')[3].ench).toEqual(ENCH);
    // bozuk kayıt: ench sanitize edilir
    const evil = [['4,41,4', [0, 0, 0, ['item:kılıç_demir', 1, 90, { keskinlik: 'x', __proto__: { alev: 1 }, buz: 2 }]]]];
    restoreChests(G, JSON.parse(JSON.stringify(evil)));
    const r = G.chests.get('4,41,4')[3];
    expect(r.ench.buz).toBe(2);
    expect(r.ench.keskinlik).toBeUndefined();
    // kırılınca içerik
    G.chests.set('4,41,4', slots);
    const out = takeChestContents(G, 4, 41, 4);
    expect(out.find((d) => d.item === 'item:kılıç_demir').ench).toEqual(ENCH);
  });

  it('spawnDrops: ench alanı yere düşen eşyaya geçer; em yoksa doğrudan çantaya', () => {
    const k = makeG();
    const { G, S } = k;
    spawnDrops(G, S, [{ item: 'item:kılıç_demir', count: 1, dur: 120, ench: ENCH }, { item: 'blok:taş', count: 3 }], 1, 41, 1);
    expect(G.items[0].opts.ench).toEqual(ENCH);
    expect(G.items[1].opts.ench).toBeUndefined();
    const sv = G.em;
    G.em = null;
    spawnDrops(G, S, [{ item: 'item:kılıç_demir', count: 1, dur: 120, ench: ENCH }], 1, 41, 1);
    G.em = sv;
    expect(G.inventory.slots.find((s) => s && s.item === 'item:kılıç_demir').ench).toEqual(ENCH);
  });
});
