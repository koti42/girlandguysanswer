import { describe, expect, it } from 'vitest';
import { TOOL_TIERS } from './constants.js';
import { B, BLOCKS, BLOCK_COLORS, PLACEABLE_IDS, getBlock } from './blocks.js';
import { BUILDABLE_MAX } from './constants.js';
import {
  ARMOR_SLOTS, FUEL_HEAT, ITEMS, ITEM_KINDS, ITEM_LIST, RARITIES, RECIPES, RECIPE_CATEGORIES, SMELT_HEAT,
  STATIONS, STATION_BLOCKS, armorSlotIndex, blockItemKey, canCraft, canonicalItemKey, fuelHeat, getRecipe,
  itemByKey, itemToBlockId, maxDurability, maxStack, recipesFor, recipesProducing, recipesUsing,
  stationAvailable, toolSpeed,
} from './items.js';
import { Inventory } from './inventory.js';
import { SHIELD_ITEM_KEYS } from './techData.js';

describe('eşya tablosu', () => {
  it('>= 120 blok-dışı eşya, anahtarlar benzersiz ve kanonik', () => {
    const nonBlock = ITEM_LIST.filter((i) => i.kind !== 'blok');
    expect(nonBlock.length).toBeGreaterThanOrEqual(120);
    const keys = new Set();
    ITEM_LIST.forEach((it) => {
      expect(keys.has(it.key)).toBe(false);
      keys.add(it.key);
      expect(ITEMS[it.key]).toBe(it);
      if (it.kind === 'blok') expect(it.key.startsWith('blok:')).toBe(true);
      else expect(it.key.startsWith('item:')).toBe(true);
      expect(it.name.length).toBeGreaterThan(1);
    });
  });

  it('alanlar geçerli: tür, nadirlik, yığın ≤ 64, dayanıklı eşya yığılmaz', () => {
    ITEM_LIST.forEach((it) => {
      expect(ITEM_KINDS, it.key).toContain(it.kind);
      expect(RARITIES, it.key).toContain(it.rarity);
      expect(it.stack).toBeGreaterThanOrEqual(1);
      expect(it.stack).toBeLessThanOrEqual(64);
      expect(Number.isInteger(it.stack)).toBe(true);
      if (it.durability) {
        expect(it.stack).toBe(1);
        expect(it.durability).toBeGreaterThan(0);
      }
      expect(typeof it.model).toBe('string');
      expect(Number.isInteger(it.color)).toBe(true);
      expect(Object.isFrozen(it)).toBe(true);
    });
  });

  it('blok eşyaları her yerleştirilebilir bloktan otomatik üretilir', () => {
    PLACEABLE_IDS.forEach((id) => {
      const key = blockItemKey(id);
      const it = itemByKey(key);
      expect(it, key).toBeTruthy();
      expect(it.kind).toBe('blok');
      expect(it.placesBlock).toBe(id);
      expect(itemToBlockId(key)).toBe(id);
    });
    // genişletme blokları (id > 127: büyü + üretim) eşyalarını kendi veri dosyalarından alır
    const ext = BLOCKS.filter((b) => b.id > 127 && b.placeable);
    ext.forEach((b) => {
      const it = itemByKey('blok:' + b.key);
      expect(it, b.key).toBeTruthy();
      expect(it.placesBlock).toBe(b.id);
    });
    expect(ITEM_LIST.filter((i) => i.kind === 'blok')).toHaveLength(PLACEABLE_IDS.length + ext.length);
    expect(itemByKey('blok:kapı_açık')).toBeNull();
    expect(itemToBlockId('item:sopa')).toBe(0);
    expect(itemToBlockId('yok')).toBe(0);
    expect(blockItemKey(0)).toBeNull();
    expect(blockItemKey(B.STONE)).toBe('blok:taş');
    expect(blockItemKey(9999)).toBeNull();
  });

  it('aletler 7 kademe x (kazma, balta, kürek, kılıç)', () => {
    TOOL_TIERS.forEach((t) => {
      ['kazma', 'balta', 'kürek'].forEach((type) => {
        const it = itemByKey('item:' + type + '_' + t.key);
        expect(it, type + t.key).toBeTruthy();
        expect(it.kind).toBe('alet');
        expect(it.tool).toMatchObject({ type, tier: t.level, speed: t.speed, durability: t.durability });
        expect(it.durability).toBe(t.durability);
        expect(it.weapon.damage).toBeGreaterThan(0);
      });
      const sw = itemByKey('item:kılıç_' + t.key);
      expect(sw.kind).toBe('silah');
      expect(sw.weapon.damage).toBe(t.damage);
      expect(sw.model).toBe('sword');
    });
    expect(ITEMS['item:kazma_demir'].name).toBe('Demir Kazma');
    expect(itemByKey('item:kilic_kuantum').key).toBe('item:kılıç_kuantum');
  });

  it('yay, ok, ışın tüfeği, enerji hücresi, kalkan', () => {
    expect(ITEMS['item:yay'].weapon.ranged).toBe(true);
    expect(ITEMS['item:yay'].weapon.ammo).toBe('item:ok');
    expect(ITEMS['item:ok'].kind).toBe('cephane');
    expect(ITEMS['item:ışın_tüfeği'].weapon.ammo).toBe('item:enerji_hücresi');
    expect(ITEMS['item:ışın_tüfeği'].weapon.blockDamage).toBe(true);
    expect(ITEMS['item:enerji_hücresi'].kind).toBe('cephane');
    expect(ITEMS['item:kalkan'].durability).toBeGreaterThan(0);
    ITEM_LIST.forEach((it) => {
      if (it.weapon && it.weapon.ammo) expect(itemByKey(it.weapon.ammo), it.key).toBeTruthy();
    });
  });

  it('zırh: 6 set x 4 parça, yuva adları geçerli, savunma kademeyle artar', () => {
    const armor = ITEM_LIST.filter((i) => i.kind === 'zırh');
    expect(armor).toHaveLength(24 + SHIELD_ITEM_KEYS.length); // 6 set x 4 + Kuantum Zırhı (techData)
    armor.forEach((a) => {
      expect(ARMOR_SLOTS).toContain(a.armor.slot);
      expect(a.armor.defense).toBeGreaterThan(0);
    });
    const total = (set) => armor.filter((a) => a.armor.set === set).reduce((s, a) => s + a.armor.defense, 0);
    expect(total('deri')).toBeLessThan(total('demir'));
    expect(total('demir')).toBeLessThan(total('elmas'));
    expect(total('elmas')).toBeLessThan(total('kuantum'));
    expect(total('altın')).toBeLessThan(total('demir'));
    expect(armorSlotIndex('kafa')).toBe(0);
    expect(armorSlotIndex('ayak')).toBe(3);
    expect(armorSlotIndex('x')).toBe(-1);
  });

  it('yiyecekler (>= 10) ve değerleri', () => {
    const foods = ITEM_LIST.filter((i) => i.kind === 'yiyecek');
    expect(foods.length).toBeGreaterThanOrEqual(10);
    foods.forEach((f) => {
      expect(f.food.hunger).toBeGreaterThanOrEqual(0);
      expect(f.food.heal).toBeGreaterThanOrEqual(0);
      expect(f.food.hunger + f.food.heal).toBeGreaterThan(0);
    });
    expect(ITEMS['item:pişmiş_tavuk'].food.hunger).toBeGreaterThan(ITEMS['item:çiğ_tavuk'].food.hunger);
  });

  it('anahtar kristalleri her bölge için, yetenek eşyaları', () => {
    for (let z = 0; z < 5; z++) {
      const k = ITEMS['item:anahtar_kristali_z' + z];
      expect(k.kind).toBe('anahtar');
      expect(k.zone).toBe(z);
    }
    expect(ITEMS['item:çift_zıplama_botları'].ability).toBe('doubleJump');
    expect(ITEMS['item:kanca'].ability).toBe('grapple');
    expect(ITEMS['item:planör'].ability).toBe('glide');
    expect(ITEMS['item:portal_tabancası'].ability).toBe('portalGun');
    expect(ITEMS['item:kuantum_parçası']).toBeTruthy();
  });

  it('itemByKey takma ad, canonicalItemKey, maxStack, maxDurability', () => {
    expect(itemByKey('blok:tas').key).toBe('blok:taş');
    expect(itemByKey('item:ışın_tüfeği')).toBe(itemByKey('item:isin_tufegi'));
    expect(itemByKey('nope')).toBeNull();
    expect(itemByKey(5)).toBeNull();
    expect(canonicalItemKey('item:kazma_ahsap')).toBe('item:kazma_ahşap');
    expect(canonicalItemKey('x')).toBeNull();
    expect(maxStack('blok:taş')).toBe(64);
    expect(maxStack('item:kazma_demir')).toBe(1);
    expect(maxStack('yok')).toBe(0);
    expect(maxDurability('item:kazma_demir')).toBe(250);
    expect(maxDurability('blok:taş')).toBe(0);
  });

  it('toolSpeed', () => {
    expect(toolSpeed('item:kazma_demir', B.STONE)).toBe(6);
    expect(toolSpeed('item:kazma_demir', B.DIRT)).toBe(1);
    expect(toolSpeed('item:kürek_altın', B.SAND)).toBe(12);
    expect(toolSpeed(null, B.STONE)).toBe(1);
    expect(toolSpeed('item:kılıç_taş', B.LEAVES_OAK)).toBe(4);
  });

  it('yakıt tablosu ve istasyon blokları', () => {
    Object.keys(FUEL_HEAT).forEach((k) => {
      expect(itemByKey(k), k).toBeTruthy();
      expect(FUEL_HEAT[k]).toBeGreaterThan(0);
      expect(fuelHeat(k)).toBe(FUEL_HEAT[k]);
    });
    expect(fuelHeat('blok:taş')).toBe(0);
    expect(FUEL_HEAT['item:kömür']).toBeGreaterThan(SMELT_HEAT);
    expect(STATION_BLOCKS.tezgah).toEqual([B.WORKBENCH]);
    expect(STATION_BLOCKS.ocak).toEqual([B.FURNACE]);
    expect(getBlock(STATION_BLOCKS.örs[0]).interact).toBe('örs');
  });
});

describe('tarifler', () => {
  it('>= 150 tarif, kimlikler benzersiz', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(150);
    const ids = new Set();
    RECIPES.forEach((r) => {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(getRecipe(r.id)).toBe(r);
    });
    expect(getRecipe('yok')).toBeNull();
  });

  it('her tarif var olan eşyalara başvurur, sayılar geçerli', () => {
    const cats = RECIPE_CATEGORIES.map((c) => c.key);
    RECIPES.forEach((r) => {
      expect(itemByKey(r.out.item), r.id).toBeTruthy();
      expect(r.out.item).toBe(itemByKey(r.out.item).key);
      expect(Number.isInteger(r.out.count)).toBe(true);
      expect(r.out.count).toBeGreaterThanOrEqual(1);
      expect(r.out.count).toBeLessThanOrEqual(itemByKey(r.out.item).stack);
      expect(r.in.length).toBeGreaterThan(0);
      const seen = new Set();
      r.in.forEach((p) => {
        const it = itemByKey(p.item);
        expect(it, r.id + ' <- ' + p.item).toBeTruthy();
        expect(p.item).toBe(it.key);
        expect(Number.isInteger(p.count)).toBe(true);
        expect(p.count).toBeGreaterThanOrEqual(1);
        expect(p.item).not.toBe(r.out.item); // kendi çıktısını girdi yapmaz
        expect(seen.has(p.item)).toBe(false);
        seen.add(p.item);
      });
      expect(STATIONS).toContain(r.station);
      expect(cats).toContain(r.category);
      if (r.station === 'ocak') expect(r.heat).toBe(SMELT_HEAT);
      else expect(r.heat).toBeUndefined();
    });
  });

  it('her istasyon ve kategoride tarif var', () => {
    STATIONS.forEach((s) => expect(RECIPES.some((r) => r.station === s), s).toBe(true));
    RECIPE_CATEGORIES.forEach((c) => expect(RECIPES.some((r) => r.category === c.key), c.key).toBe(true));
  });

  it('tüm alet, zırh, renkli blok, yapı eşyaları üretilebilir', () => {
    ITEM_LIST.forEach((it) => {
      if (it.kind === 'alet' || it.kind === 'zırh') expect(recipesProducing(it.key).length, it.key).toBeGreaterThan(0);
    });
    TOOL_TIERS.forEach((t) => expect(recipesProducing('item:kılıç_' + t.key).length).toBe(1));
    BLOCK_COLORS.forEach((c) => {
      expect(recipesProducing('blok:cam_' + c.key).length).toBe(1);
      expect(recipesProducing('blok:beton_' + c.key).length).toBe(1);
      expect(recipesProducing('blok:kumaş_' + c.key).length).toBeGreaterThan(0); // el + dokuma tezgahı
      expect(recipesProducing('item:boya_' + c.key).length).toBeGreaterThan(0); // birden çok boya kaynağı
    });
    ['blok:tezgah', 'blok:ocak', 'blok:sandık', 'blok:meşale', 'blok:fener', 'blok:kapı', 'blok:çit', 'blok:yatak',
      'blok:kitaplık', 'blok:tuğla', 'item:yay', 'item:ok', 'item:ışın_tüfeği', 'item:enerji_hücresi',
      'item:kalkan'].forEach((k) => expect(recipesProducing(k).length, k).toBeGreaterThan(0));
  });

  it('sınır: kullanılmayan başvuru yok ve sistem blokları üretilemez', () => {
    RECIPES.forEach((r) => {
      const bid = itemToBlockId(r.out.item);
      expect(bid <= BUILDABLE_MAX || bid > 127, r.id).toBe(true); // 100–127 sistem blokları asla üretilemez
    });
    expect(recipesUsing('item:sopa').length).toBeGreaterThan(10);
    expect(recipesUsing('yok')).toEqual([]);
  });

  it('bedava eşya yok: maliyet gevşetmesi yakınsar, hiçbir eşya aşırı ucuzlamaz, her şey ulaşılabilir', () => {
    const produced = new Set(RECIPES.map((r) => r.out.item));
    const dropped = new Set();
    BLOCKS.forEach((b) => {
      if (Array.isArray(b.drops)) b.drops.forEach((d) => dropped.add(d.item));
    });
    const cost = {};
    ITEM_LIST.forEach((it) => {
      cost[it.key] = produced.has(it.key) && !dropped.has(it.key) ? Infinity : 1;
    });
    let changed = true;
    let iter = 0;
    while (changed && iter < 500) {
      changed = false;
      iter++;
      for (const r of RECIPES) {
        let c = 0;
        for (const p of r.in) c += cost[p.item] * p.count;
        c /= r.out.count;
        if (c < cost[r.out.item] - 1e-12) {
          cost[r.out.item] = c;
          changed = true;
        }
      }
    }
    expect(changed).toBe(false); // yakınsadı (kârlı döngü olsa sonsuza dek düşerdi)
    for (const it of ITEM_LIST) {
      expect(Number.isFinite(cost[it.key]), 'ulaşılamaz: ' + it.key).toBe(true);
      expect(cost[it.key], it.key).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('blok <-> külçe döngüleri tam 9:1 (kârsız)', () => {
    ['bakır', 'demir', 'altın', 'elmas', 'kuantum'].forEach((m) => {
      const down = getRecipe('blok_' + m);
      const up = getRecipe('blok_aç_' + m);
      expect(down.in[0].count).toBe(9);
      expect(down.out.count).toBe(1);
      expect(up.out.count).toBe(9);
      expect(up.in[0].count).toBe(1);
      expect(up.out.item).toBe(down.in[0].item);
    });
  });

  it('recipesFor: el her zaman, istasyonlar eklendikçe genişler', () => {
    const el = recipesFor();
    expect(el.length).toBeGreaterThan(10);
    expect(el.every((r) => r.station === 'el')).toBe(true);
    const bench = recipesFor(new Set(['tezgah']));
    expect(bench.length).toBeGreaterThan(el.length);
    expect(bench.some((r) => r.station === 'ocak')).toBe(false);
    expect(recipesFor(['tezgah', 'ocak']).some((r) => r.station === 'ocak')).toBe(true);
    expect(recipesFor('tezgah')).toHaveLength(bench.length);
    expect(recipesFor({ örs: true, ocak: false }).some((r) => r.station === 'örs')).toBe(true);
    expect(recipesFor({ ocak: false }).some((r) => r.station === 'ocak')).toBe(false);
    expect(recipesFor(['tezgah', 'ocak', 'örs', 'kesici', 'dokuma', 'laboratuvar'])).toHaveLength(RECIPES.length);
    expect(stationAvailable(getRecipe('tezgah'), undefined)).toBe(true);
    expect(stationAvailable(getRecipe('kazma_demir'), [])).toBe(false);
  });

  it('erken oyun yolu yalnızca elle: kütük -> tahta -> tezgah', () => {
    const el = recipesFor();
    expect(el.some((r) => r.out.item === 'blok:tezgah')).toBe(true);
    expect(el.some((r) => r.out.item === 'blok:meşe_tahta')).toBe(true);
    expect(el.some((r) => r.out.item === 'item:sopa')).toBe(true);
    // ahşap kazma tezgahta
    expect(getRecipe('kazma_ahşap').station).toBe('tezgah');
  });

  it('canCraft envanter malzemesine bakar', () => {
    const inv = new Inventory();
    const r = getRecipe('tezgah');
    expect(canCraft(inv, r)).toBe(false);
    inv.add('blok:meşe_tahta', 4);
    expect(canCraft(inv, r)).toBe(true);
    expect(canCraft(inv, getRecipe('kazma_ahşap'), ['tezgah'])).toBe(false);
    expect(canCraft(inv, getRecipe('kazma_ahşap'), [])).toBe(false);
    expect(canCraft(inv, null)).toBe(false);
    // ocak: malzeme var ama yakıt yok
    const inv2 = new Inventory();
    inv2.add('item:ham_demir', 1);
    expect(canCraft(inv2, getRecipe('ocak:demir'))).toBe(false);
    inv2.add('item:kömür', 1);
    expect(canCraft(inv2, getRecipe('ocak:demir'))).toBe(true);
    // tahta da yakıttır
    expect(canCraft(inv, getRecipe('ocak:demir'))).toBe(false); // ham demir yok
    inv.add('item:ham_demir', 1);
    expect(canCraft(inv, getRecipe('ocak:demir'))).toBe(true);
  });
});
