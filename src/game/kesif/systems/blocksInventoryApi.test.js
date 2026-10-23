import { describe, expect, it } from 'vitest';
import { B, PLACEABLE_IDS } from '../sim/blocks.js';
import { buildPalette } from './blocksPalette.js';
import { parseAddr } from './blocksInventoryApi.js';
import { openChestSlots } from './blocksChest.js';
import { makeG } from './blocksTestKit.js';

function api(g) {
  return g.sys.api(g.G);
}

describe('adres ayrıştırma', () => {
  it('s/a/c ve uzun biçimler', () => {
    expect(parseAddr('s12')).toEqual({ kind: 's', index: 12 });
    expect(parseAddr('slot3')).toEqual({ kind: 's', index: 3 });
    expect(parseAddr('a0')).toEqual({ kind: 'a', index: 0 });
    expect(parseAddr('armor2')).toEqual({ kind: 'a', index: 2 });
    expect(parseAddr('c26')).toEqual({ kind: 'c', index: 26 });
    expect(parseAddr('chest5')).toEqual({ kind: 'c', index: 5 });
    ['', 'x1', 's', 's-1', 5, null, undefined, 's1234'].forEach((v) => expect(parseAddr(v)).toBeNull());
  });
});

describe('getInventorySnapshot', () => {
  it('36 yuva, 4 zırh, seçili, ısı, yaratıcı bayrağı; boş yuva {item:null,count:0,dur:null}', () => {
    const g = makeG();
    g.G.inventory.setSlot(2, 'item:kazma_taş', 1, 100);
    g.G.inventory.setSlot(3, 'blok:taş', 7);
    g.G.inventory.heat = 42;
    const s = api(g).getInventorySnapshot();
    expect(s.slots.length).toBe(36);
    expect(s.armor.length).toBe(4);
    expect(s.slots[0]).toEqual({
      item: null, count: 0, dur: null, maxDur: 0,
    });
    expect(s.slots[2]).toMatchObject({ item: 'item:kazma_taş', count: 1, dur: 100, maxDur: 132 });
    expect(s.slots[3]).toMatchObject({ item: 'blok:taş', count: 7, dur: null });
    expect(s.selected).toBe(0);
    expect(s.heat).toBe(42);
    expect(s.creative).toBe(false);
    expect(makeG({ mode: 'insa' }).sys.api(makeG({ mode: 'insa' }).G).getInventorySnapshot().creative).toBe(true);
  });
});

describe('moveStack', () => {
  it('boş yuvaya taşır; aynı eşya birleşir; farklı eşya yer değiştirir', () => {
    const g = makeG();
    const a = api(g);
    const inv = g.G.inventory;
    inv.setSlot(0, 'blok:taş', 10);
    expect(a.moveStack('s0', 's12')).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[12].count).toBe(10);
    inv.setSlot(1, 'blok:taş', 60);
    expect(a.moveStack('s12', 's1')).toBe(true); // 4 sığar
    expect(inv.slots[1].count).toBe(64);
    expect(inv.slots[12].count).toBe(6);
    inv.setSlot(2, 'blok:toprak', 5);
    expect(a.moveStack('s12', 's2')).toBe(true);
    expect(inv.slots[2].item).toBe('blok:taş');
    expect(inv.slots[12].item).toBe('blok:toprak');
  });

  it('half: yarısını taşır; farklı eşya üstüne yarım taşıma olmaz', () => {
    const g = makeG();
    const a = api(g);
    const inv = g.G.inventory;
    inv.setSlot(0, 'blok:taş', 11);
    expect(a.moveStack('s0', 's10', { half: true })).toBe(true);
    expect(inv.slots[0].count).toBe(6);
    expect(inv.slots[10].count).toBe(5);
    inv.setSlot(11, 'blok:toprak', 3);
    expect(a.moveStack('s0', 's11', { half: true })).toBe(false);
    expect(inv.slots[11].item).toBe('blok:toprak');
    inv.setSlot(12, 'blok:kum', 1);
    expect(a.moveStack('s12', 's13', { half: true })).toBe(true); // tek eşya: tamamı gider
    expect(inv.slots[13].count).toBe(1);
  });

  it('geçersiz adres / aynı yuva / boş kaynak false', () => {
    const g = makeG();
    const a = api(g);
    expect(a.moveStack('s0', 's0')).toBe(false);
    expect(a.moveStack('s0', 's1')).toBe(false);
    expect(a.moveStack('zz', 's1')).toBe(false);
    expect(a.moveStack('s0', 's99')).toBe(false);
    expect(a.moveStack('c0', 's1')).toBe(false); // sandık kapalı
  });

  it('zırh yuvası yalnız o parçayı kabul eder; zırhtan çantaya geri döner', () => {
    const g = makeG();
    const a = api(g);
    const inv = g.G.inventory;
    inv.setSlot(5, 'item:miğfer_demir', 1);
    inv.setSlot(6, 'item:göğüslük_demir', 1);
    expect(a.moveStack('s5', 'a1')).toBe(false); // kafa → göğüs yuvası
    expect(a.moveStack('s6', 'a0')).toBe(false);
    expect(a.moveStack('s5', 'a0')).toBe(true);
    expect(inv.armor[0].item).toBe('item:miğfer_demir');
    expect(inv.armorDefense()).toBeGreaterThan(0);
    inv.setSlot(7, 'blok:taş', 3);
    expect(a.moveStack('s7', 'a0')).toBe(false);
    expect(a.moveStack('a0', 's20')).toBe(true);
    expect(inv.armor[0]).toBeNull();
    // zırh ↔ zırh takası
    inv.setSlot(8, 'item:miğfer_deri', 1);
    a.moveStack('s20', 'a0');
    expect(a.moveStack('s8', 'a0')).toBe(true);
    expect(inv.armor[0].item).toBe('item:miğfer_deri');
    expect(inv.slots[8].item).toBe('item:miğfer_demir');
  });

  it('dayanıklı eşyalar birleşmez (yığın 1) ve dayanıklılık yer değiştirirken korunur', () => {
    const g = makeG();
    const a = api(g);
    const inv = g.G.inventory;
    inv.setSlot(0, 'item:kazma_taş', 1, 40);
    inv.setSlot(1, 'item:kazma_taş', 1, 90);
    expect(a.moveStack('s0', 's1')).toBe(true);
    expect(inv.slots[0].dur).toBe(90);
    expect(inv.slots[1].dur).toBe(40);
  });

  it('sandık adresleri: sandık açıkken sandık ↔ çanta, değilken geçersiz', () => {
    const g = makeG();
    const a = api(g);
    const inv = g.G.inventory;
    g.G.world.setBlock(8, 41, 5, B.CHEST);
    openChestSlots(g.G, 8, 41, 5);
    g.aim(8, 41, 5);
    g.step(1, { placePressed: true });
    expect(g.G.ui).toBe('chest');
    inv.setSlot(0, 'blok:taş', 20);
    expect(a.moveStack('s0', 'c4')).toBe(true);
    expect(g.G.chests.get('8,41,5')[4]).toEqual({ item: 'blok:taş', count: 20 });
    expect(a.getChest().slots[4]).toMatchObject({ item: 'blok:taş', count: 20 });
    expect(a.getChest().pos).toEqual({ x: 8, y: 41, z: 5 });
    expect(a.getChest().slots.length).toBe(27);
    expect(a.moveStack('c4', 's9', { half: true })).toBe(true);
    expect(inv.slots[9].count).toBe(10);
    expect(g.G.chests.get('8,41,5')[4].count).toBe(10);
    expect(a.moveStack('c27', 's1')).toBe(false);
    g.G.setUi(null);
    expect(a.getChest()).toBeNull();
    expect(a.moveStack('c4', 's1')).toBe(false);
  });

  it('değişiklik envanter dinleyicilerini ve inventoryChanged bayrağını tetikler', () => {
    const g = makeG();
    let n = 0;
    g.G.inventory.onChange(() => { n++; });
    g.G.inventory.setSlot(0, 'blok:taş', 5);
    n = 0;
    g.G._invDirty = false;
    api(g).moveStack('s0', 's5');
    expect(n).toBeGreaterThan(0);
    expect(g.G._invDirty).toBe(true);
  });
});

describe('dropSlot / clearSlot / equip / use / select', () => {
  it('dropSlot belirtilen adedi fırlatır ve yuvadan düşer', () => {
    const g = makeG();
    const a = api(g);
    g.G.inventory.setSlot(4, 'blok:taş', 10);
    expect(a.dropSlot('s4', 3)).toBe(true);
    expect(g.G.inventory.slots[4].count).toBe(7);
    expect(g.G.items[0]).toMatchObject({ item: 'blok:taş', count: 3 });
    expect(a.dropSlot('s4')).toBe(true);
    expect(g.G.inventory.slots[4]).toBeNull();
    expect(a.dropSlot('s4')).toBe(false);
    g.G.inventory.setSlot(5, 'item:kazma_taş', 1, 20);
    a.dropSlot('s5');
    expect(g.G.items[2].opts.dur).toBe(20);
  });

  it('yaratıcı modda dropSlot yok; clearSlot siler. Macerada clearSlot yere atar', () => {
    const c = makeG({ mode: 'insa' });
    const ca = api(c);
    expect(ca.dropSlot('s0')).toBe(false);
    expect(ca.clearSlot('s0')).toBe(true);
    expect(c.G.inventory.slots[0]).toBeNull();
    const g = makeG();
    g.G.inventory.setSlot(0, 'blok:taş', 4);
    expect(api(g).clearSlot('s0')).toBe(true);
    expect(g.G.items[0].count).toBe(4);
  });

  it('equipArmor / unequipArmor / selectHotbar', () => {
    const g = makeG();
    const a = api(g);
    g.G.inventory.setSlot(3, 'item:çizme_deri', 1);
    expect(a.equipArmor('s3')).toBe(true);
    expect(g.G.inventory.armor[3].item).toBe('item:çizme_deri');
    expect(a.equipArmor('s5')).toBe(false);
    expect(a.unequipArmor(3)).toBe(true);
    expect(g.G.inventory.armor[3]).toBeNull();
    expect(a.unequipArmor(3)).toBe(false);
    expect(a.unequipArmor(9)).toBe(false);
    expect(a.selectHotbar(4)).toBe(4);
    expect(a.selectHotbar(99)).toBe(8);
    expect(a.selectHotbar('x')).toBe(8);
  });

  it('useSlot: yemek yer, zırh giyer, hotbar seçer, çantadaki eşyayı eline alır', () => {
    const g = makeG();
    const a = api(g);
    const inv = g.G.inventory;
    g.G.survival.hunger = 8;
    inv.setSlot(12, 'item:elma', 2);
    expect(a.useSlot('s12')).toBe(true);
    expect(g.G.survival.hunger).toBe(12);
    expect(inv.slots[12].count).toBe(1);
    inv.setSlot(13, 'item:göğüslük_deri', 1);
    expect(a.useSlot('s13')).toBe(true);
    expect(inv.armor[1].item).toBe('item:göğüslük_deri');
    inv.setSlot(6, 'blok:taş', 1);
    expect(a.useSlot('s6')).toBe(true);
    expect(inv.selected).toBe(6);
    inv.setSlot(20, 'item:kazma_taş', 1);
    expect(a.useSlot('s20')).toBe(true);
    expect(inv.slots[6].item).toBe('item:kazma_taş');
    g.G.survival.hunger = g.G.survival.maxHunger;
    inv.setSlot(14, 'item:elma', 2);
    expect(a.useSlot('s14')).toBe(false); // tok
    expect(a.useSlot('s30')).toBe(false); // boş
    expect(a.useSlot('a0')).toBe(false);
  });
});

describe('yaratıcı palet', () => {
  it('yalnız inşa edilebilir ve yerleştirilebilir bloklar, gruplanmış, sistem blokları yok', () => {
    const p = buildPalette();
    expect(p.length).toBe(PLACEABLE_IDS.length);
    expect(p.every((e) => e.id >= 1 && e.id <= 99)).toBe(true);
    expect(p.some((e) => e.id >= 100)).toBe(false);
    expect(p.find((e) => e.key === 'meşale')).toMatchObject({ item: 'blok:meşale', group: 'ışık' });
    expect(new Set(p.map((e) => e.item)).size).toBe(p.length);
    expect(p[0].name.length).toBeGreaterThan(0);
    expect(buildPalette()).toBe(p);
    const g = makeG({ mode: 'insa' });
    expect(g.sys.api(g.G).getBuildPalette()).toBe(p);
  });

  it('setCreativeSlot yalnız yaratıcı modda, tam yığın doldurur; clearSlot siler', () => {
    const g = makeG({ mode: 'insa' });
    const a = api(g);
    expect(a.setCreativeSlot(4, 'blok:beton_mor')).toBe(true);
    expect(g.G.inventory.slots[4]).toEqual({ item: 'blok:beton_mor', count: 64 });
    expect(a.setCreativeSlot(4, 'yok')).toBe(false);
    expect(a.setCreativeSlot(99, 'blok:taş')).toBe(false);
    expect(a.clearSlot('s4')).toBe(true);
    expect(g.G.inventory.slots[4]).toBeNull();
    const m = makeG();
    expect(api(m).setCreativeSlot(0, 'blok:taş')).toBe(false);
  });

  it('inşa modunda yerleştirme sayıyı azaltmaz (sonsuz)', () => {
    const g = makeG({ mode: 'insa' });
    api(g).setCreativeSlot(0, 'blok:cam');
    g.G.inventory.selected = 0;
    g.aim(8, 40, 5);
    for (let i = 0; i < 5; i++) {
      g.step(8, { placePressed: true });
    }
    expect(g.G.inventory.slots[0].count).toBe(64);
  });
});
