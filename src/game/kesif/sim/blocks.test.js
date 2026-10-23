import { describe, expect, it } from 'vitest';
import { BUILDABLE_MAX, MAX_BLOCK_ID } from './constants.js';
import {
  B, BLOCKS, BLOCK_COLORS, BLOCK_LAYERS, BLOCK_RANGES, BUILDABLE_IDS, BUILD_GROUPS, CUBE_LUT, EMIT_LUT,
  FILTER_LUT, LIQUID_LUT, OPAQUE_LUT, OVERFLOW_BUILD_IDS, PLACEABLE_IDS, RUNES, SHAPES, SOLID_LUT,
  SOUND_TYPES, TILE_COUNT, TILE_NAMES, blockByKey, blocksInGroup, breakTime, canHarvest, collisionBoxes,
  getBlock, isClimbable, isLiquid, isOpaque, isSolid, isTargetable, resolveDrops, tileIndex, toolInfoFromKey,
} from './blocks.js';
import { itemByKey } from './items.js';
import { seededRandom } from './rng.js';
import { techBlockDef } from './techData.js';
import { CITY_BLOCK_IDS } from './cityData.js';

// Ayrılmış (tanımsız) kimlikler hava gibi davranan yer tutuculardır; genişletme bloklarının (>127) dışında kalırlar.
const isReserved = (b) => b.key.indexOf('ayrılmış_') === 0;

describe('blok tablosu bütünlüğü', () => {
  it('128 kayıt, kimlik = indeks, >= 110 gerçek blok', () => {
    expect(BLOCKS).toHaveLength(MAX_BLOCK_ID + 1);
    BLOCKS.forEach((b, i) => {
      expect(b).toBeTruthy();
      expect(b.id).toBe(i);
    });
    expect(BLOCKS.filter((b) => b.id > 0).length).toBeGreaterThanOrEqual(110);
    expect(BLOCKS[0].key).toBe('hava');
    expect(B.AIR).toBe(0);
  });

  it('anahtarlar ve adlar benzersiz, Türkçe ad dolu', () => {
    const keys = new Set();
    const names = new Set();
    BLOCKS.filter((b) => !isReserved(b)).forEach((b) => {
      expect(typeof b.key).toBe('string');
      expect(b.key.length).toBeGreaterThan(0);
      expect(keys.has(b.key)).toBe(false);
      keys.add(b.key);
      expect(b.name.length).toBeGreaterThan(1);
      expect(names.has(b.name)).toBe(false);
      names.add(b.name);
    });
  });

  it('B sabitleri doğru kimliklere işaret eder, hepsi benzersiz', () => {
    const ids = Object.values(B);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(BLOCKS.filter((b) => !isReserved(b)).length);
    expect(B.STONE).toBe(1);
    expect(getBlock(B.STONE).key).toBe('taş');
    expect(getBlock(B.WATER).liquid).toBe(true);
    expect(getBlock(B.BEDROCK).id).toBe(100);
    expect(getBlock(B.SEAL_BARRIER).key).toBe('mühür_bariyeri');
    expect(getBlock(B.QUANTUM_ORE).key).toBe('kuantum_kristali');
  });

  it('kimlik aralıkları ve inşa edilebilirlik değişmezi', () => {
    BLOCKS.forEach((b) => {
      if (b.id === 0 || isReserved(b)) return;
      expect(b.buildable).toBe(b.id <= BUILDABLE_MAX);
      if (b.id > 127) {
        // genişletme blokları (büyü 128–135, üretim 136–159): yalnız macera, haritada yasak, yerleştirilebilir
        if (b.id >= 160 && b.id <= 199) expect(['yapı', 'bitki', 'arazi']).toContain(b.category); // biyom blokları (biomeData.js)
        else expect(b.category).toBe('yapı');
        expect(b.buildable).toBe(false);
        // teknoloji durum varyantları (…_etkin/açık) yerleştirilemez; taban bloğu düşürür (techData)
        const tv = techBlockDef(b.id);
        // şehir kayar kapıları (239/240; cityData.js) yerleştirilemez: CityLocks setBlock ile değiştirir, eşyası yoktur
        const cityDoor = b.id === CITY_BLOCK_IDS.SLIDING_DOOR || b.id === CITY_BLOCK_IDS.SLIDING_DOOR_OPEN;
        expect(b.placeable).toBe(!(tv && tv.base !== 0) && !cityDoor);
        return;
      }
      const [lo, hi] = BLOCK_RANGES[b.category];
      if (OVERFLOW_BUILD_IDS.indexOf(b.id) >= 0) {
        expect(b.category).toBe('yapı');
      } else {
        expect(b.id).toBeGreaterThanOrEqual(lo);
        expect(b.id).toBeLessThanOrEqual(hi);
      }
      if (b.id >= 100) {
        expect(b.category).toBe('sistem');
        expect(b.unbreakable).toBe(true);
        expect(b.placeable).toBe(false);
        expect(b.drops).toEqual([]);
        expect(b.group).toBe('mekanizma');
      }
    });
    expect(BUILDABLE_IDS).toHaveLength(99);
    expect(Math.max(...BUILDABLE_IDS)).toBeLessThanOrEqual(BUILDABLE_MAX);
    expect(Math.min(...BUILDABLE_IDS)).toBe(1);
    PLACEABLE_IDS.forEach((id) => {
      expect(BUILDABLE_IDS).toContain(id);
      expect(getBlock(id).placeable).toBe(true);
    });
    expect(PLACEABLE_IDS).not.toContain(B.WATER_FLOW);
    expect(PLACEABLE_IDS).not.toContain(B.DOOR_OPEN);
    expect(PLACEABLE_IDS).toContain(B.DOOR);
  });

  it('zorunlu sistem blokları var (sözleşme listesi)', () => {
    const need = [
      'BEDROCK', 'SEAL_BARRIER', 'PRESSURE_PLATE', 'LEVER', 'RUNE_RED', 'RUNE_BLUE', 'RUNE_GREEN', 'RUNE_YELLOW',
      'RUNE_PURPLE', 'LOGIC_GATE', 'RECEIVER', 'MIRROR', 'BEAM_SOURCE', 'PUSH_BLOCK', 'MOVING_PLATFORM',
      'LOCKED_DOOR', 'REWARD_CHEST', 'PARKOUR_START', 'PARKOUR_END', 'PARKOUR_CHECKPOINT', 'PORTAL_BLUE',
      'PORTAL_ORANGE', 'BOSS_DOOR', 'ALTAR', 'PORTAL_FRAME',
    ];
    need.forEach((n) => {
      expect(B[n]).toBeGreaterThanOrEqual(100);
      expect(B[n]).toBeLessThanOrEqual(127);
    });
    expect(RUNES).toHaveLength(5);
    expect(new Set(RUNES.map((r) => r.symbol)).size).toBe(5); // renk körlüğü: farklı şekiller
    RUNES.forEach((r) => expect(getBlock(r.id).rune.symbol).toBe(r.symbol));
  });

  it('renkli cam/beton/kumaş 8 renk, tüm yapı listesi mevcut', () => {
    expect(BLOCK_COLORS).toHaveLength(8);
    BLOCK_COLORS.forEach((c) => {
      expect(B['GLASS_' + c.up]).toBeGreaterThanOrEqual(65);
      expect(B['CONCRETE_' + c.up]).toBeGreaterThanOrEqual(73);
      expect(B['CLOTH_' + c.up]).toBeGreaterThanOrEqual(81);
      expect(blockByKey('cam_' + c.key)).toBeTruthy();
      expect(blockByKey('beton_' + c.key).name).toContain('Beton');
      expect(blockByKey('kumaş_' + c.key).name).toContain('Kumaş');
    });
    ['LANTERN', 'TORCH', 'CHEST', 'WORKBENCH', 'FURNACE', 'STAIRS', 'SLAB', 'FENCE', 'DOOR', 'DOOR_OPEN', 'BED',
      'LIGHT_BLOCK', 'BOUNCE', 'SLIPPERY_ICE', 'ICE', 'SIGN', 'BOOKSHELF', 'QUANTUM_ORE', 'REDSTONE_ORE',
      'EMERALD_ORE', 'DIAMOND_ORE', 'GOLD_ORE', 'IRON_ORE', 'COPPER_ORE', 'COAL_ORE', 'SNOW_GRASS', 'MUD',
      'CRYSTAL_ROCK', 'BASALT', 'CLAY', 'SANDSTONE', 'CACTUS', 'MUSHROOM', 'MOSS', 'VINE'].forEach((n) => {
      expect(B[n], n).toBeGreaterThan(0);
    });
    ['OAK', 'BIRCH', 'PINE', 'ACACIA'].forEach((w) => {
      expect(B['LOG_' + w]).toBeGreaterThan(0);
      expect(B['PLANKS_' + w]).toBeGreaterThan(0);
      expect(B['LEAVES_' + w]).toBeGreaterThan(0);
    });
  });

  it('ses, şekil, katman değerleri geçerli', () => {
    BLOCKS.forEach((b) => {
      expect(SOUND_TYPES, b.key).toContain(b.sound);
      expect(SHAPES, b.key).toContain(b.shape);
      expect(BLOCK_LAYERS, b.key).toContain(b.layer);
      expect(BUILD_GROUPS.map((g) => g.key), b.key).toContain(b.group);
    });
  });

  it('doku: her bloğun üçlüsü geçerli, ad↔indeks tutarlı, artık doku yok', () => {
    expect(TILE_COUNT).toBe(TILE_NAMES.length);
    expect(new Set(TILE_NAMES).size).toBe(TILE_COUNT);
    const used = new Set();
    BLOCKS.forEach((b) => {
      if (b.id === 0 || isReserved(b)) return;
      ['top', 'bottom', 'side'].forEach((f) => {
        const idx = b.tiles[f];
        expect(Number.isInteger(idx), b.key).toBe(true);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(TILE_COUNT);
        expect(TILE_NAMES[idx]).toBe(b.tileNames[f]);
        expect(tileIndex(b.tileNames[f])).toBe(idx);
        used.add(idx);
      });
    });
    expect(used.size).toBe(TILE_COUNT);
    expect(tileIndex('yok_böyle_doku')).toBe(-1);
    expect(TILE_COUNT).toBeGreaterThan(100);
  });

  it('ışık, sertlik, çarpışma kutuları tutarlı', () => {
    BLOCKS.forEach((b) => {
      expect(b.emission).toBeGreaterThanOrEqual(0);
      expect(b.emission).toBeLessThanOrEqual(15);
      expect(b.lightFilter).toBeGreaterThanOrEqual(0);
      expect(b.lightFilter).toBeLessThanOrEqual(15);
      if (b.opaque) {
        expect(b.lightFilter).toBe(15);
        expect(b.cube).toBe(true);
      }
      expect(b.transparent).toBe(!b.opaque);
      expect(b.solid).toBe(b.collision.length > 0);
      b.collision.forEach((box) => {
        expect(box).toHaveLength(6);
        expect(box[0]).toBeLessThan(box[3]);
        expect(box[1]).toBeLessThan(box[4]);
        expect(box[2]).toBeLessThan(box[5]);
        expect(Math.min(box[0], box[1], box[2])).toBeGreaterThanOrEqual(0);
        expect(Math.max(box[3], box[5])).toBeLessThanOrEqual(1);
        expect(box[4]).toBeLessThanOrEqual(1.5);
      });
      expect(b.hardness).toBeGreaterThanOrEqual(-1);
      expect(b.unbreakable).toBe(b.hardness < 0);
      if (b.tool) expect(['kazma', 'balta', 'kürek', 'kılıç']).toContain(b.tool);
      if (b.toolTier > 0) expect(b.tool).toBeTruthy();
      expect(b.drops === 'self' || Array.isArray(b.drops)).toBe(true);
    });
    expect(getBlock(B.LAVA).emission).toBe(15);
    expect(getBlock(B.TORCH).emission).toBeGreaterThanOrEqual(12);
    expect(getBlock(B.STONE).opaque).toBe(true);
    expect(getBlock(B.GLASS).opaque).toBe(false);
    expect(getBlock(B.WATER).lightFilter).toBeGreaterThan(0);
    expect(getBlock(B.SLAB).collision[0][4]).toBe(0.5);
    expect(getBlock(B.FENCE).collision[0][4]).toBeGreaterThan(1);
    expect(getBlock(B.DOOR).solid).toBe(true);
    expect(getBlock(B.DOOR_OPEN).solid).toBe(true);
    expect(getBlock(B.DOOR_OPEN).collision[0][3]).toBeLessThan(0.5);
    expect(getBlock(B.TORCH).solid).toBe(false);
    expect(collisionBoxes(B.STONE)).toEqual([[0, 0, 0, 1, 1, 1]]);
  });

  it('sıvılar, tırmanılabilir, kayma/zıplama özellikleri', () => {
    [B.WATER, B.WATER_FLOW, B.LAVA, B.LAVA_FLOW].forEach((id) => {
      expect(isLiquid(id)).toBe(true);
      expect(isSolid(id)).toBe(false);
      expect(isOpaque(id)).toBe(false);
      expect(isTargetable(id)).toBe(false);
      expect(getBlock(id).unbreakable).toBe(true);
    });
    expect(getBlock(B.LAVA).damage).toBeGreaterThan(0);
    expect(isClimbable(B.VINE)).toBe(true);
    expect(isClimbable(B.STONE)).toBe(false);
    expect(getBlock(B.ICE).slip).toBeGreaterThan(0);
    expect(getBlock(B.SLIPPERY_ICE).slip).toBeGreaterThan(getBlock(B.ICE).slip);
    expect(getBlock(B.BOUNCE).bounce).toBeGreaterThan(1);
    expect(getBlock(B.CACTUS).damage).toBeGreaterThan(0);
    expect(isTargetable(B.TORCH)).toBe(true);
    expect(isTargetable(0)).toBe(false);
  });

  it('LUT tabloları sorgularla aynı', () => {
    for (let id = 0; id <= MAX_BLOCK_ID; id++) {
      const b = BLOCKS[id];
      expect(SOLID_LUT[id]).toBe(b.solid ? 1 : 0);
      expect(CUBE_LUT[id]).toBe(b.cube ? 1 : 0);
      expect(OPAQUE_LUT[id]).toBe(b.opaque ? 1 : 0);
      expect(LIQUID_LUT[id]).toBe(b.liquid ? 1 : 0);
      expect(EMIT_LUT[id]).toBe(b.emission);
      expect(FILTER_LUT[id]).toBe(b.lightFilter);
      expect(isSolid(id)).toBe(b.solid);
      expect(isOpaque(id)).toBe(b.opaque);
      expect(isLiquid(id)).toBe(b.liquid);
    }
    expect(isSolid(-1)).toBe(false);
    expect(isSolid(5000)).toBe(false);
    expect(getBlock(9999).id).toBe(0);
    expect(getBlock(-3).id).toBe(0);
  });

  it('blockByKey ASCII takma adını da çözer', () => {
    expect(blockByKey('taş').id).toBe(B.STONE);
    expect(blockByKey('tas').id).toBe(B.STONE);
    expect(blockByKey('isik_blogu').id).toBe(B.LIGHT_BLOCK);
    expect(blockByKey('yok')).toBeNull();
  });

  it('palet grupları: her yerleştirilebilir blok bir gruba düşer', () => {
    let total = 0;
    BUILD_GROUPS.forEach((g) => {
      total += blocksInGroup(g.key).length;
    });
    expect(total).toBe(PLACEABLE_IDS.length);
    expect(blocksInGroup('cam')).toContain(B.GLASS_RED);
    expect(blocksInGroup('mekanizma')).toEqual([]);
  });
});

describe('blok-eşya bağı: düşenler gerçek eşya', () => {
  it('her drop hedefi items.js tablosunda', () => {
    BLOCKS.forEach((b) => {
      if (b.drops === 'self') {
        expect(itemByKey('blok:' + b.key), b.key).toBeTruthy();
      } else {
        b.drops.forEach((d) => {
          expect(itemByKey(d.item), b.key + ' -> ' + d.item).toBeTruthy();
          expect(d.min).toBeGreaterThanOrEqual(1);
          expect(d.max).toBeGreaterThanOrEqual(d.min);
          expect(d.chance).toBeGreaterThan(0);
          expect(d.chance).toBeLessThanOrEqual(1);
        });
      }
    });
  });
});

describe('alet çözümleme ve kırma süresi', () => {
  it('toolInfoFromKey', () => {
    expect(toolInfoFromKey('item:kazma_demir')).toMatchObject({ type: 'kazma', tierKey: 'demir', level: 4 });
    expect(toolInfoFromKey('item:kılıç_altın')).toMatchObject({ type: 'kılıç', tierKey: 'altın' });
    expect(toolInfoFromKey('item:kazma_ahsap')).toMatchObject({ tierKey: 'ahşap' });
    expect(toolInfoFromKey('item:yay')).toBeNull();
    expect(toolInfoFromKey('blok:taş')).toBeNull();
    expect(toolInfoFromKey(null)).toBeNull();
    expect(toolInfoFromKey('item:kazma_plastik')).toBeNull();
  });

  it('süre: elle < ... ve alet kademesiyle azalır', () => {
    const hand = breakTime(B.STONE, null);
    const wood = breakTime(B.STONE, 'item:kazma_ahşap');
    const stone = breakTime(B.STONE, 'item:kazma_taş');
    const iron = breakTime(B.STONE, 'item:kazma_demir');
    const gold = breakTime(B.STONE, 'item:kazma_altın');
    expect(hand).toBeGreaterThan(wood);
    expect(wood).toBeGreaterThan(stone);
    expect(stone).toBeGreaterThan(iron);
    expect(gold).toBeLessThan(iron); // altın en hızlı
    expect(breakTime(B.STONE, 'item:balta_demir')).toBe(hand); // yanlış alet
  });

  it('sert cevher yetersiz seviyede çok yavaş, yeterlide hızlı', () => {
    const woodOnDiamond = breakTime(B.DIAMOND_ORE, 'item:kazma_ahşap');
    const ironOnDiamond = breakTime(B.DIAMOND_ORE, 'item:kazma_demir');
    expect(woodOnDiamond).toBeGreaterThan(ironOnDiamond * 3);
    expect(canHarvest(B.DIAMOND_ORE, 'item:kazma_demir')).toBe(true);
    expect(canHarvest(B.DIAMOND_ORE, 'item:kazma_bakır')).toBe(false);
    expect(canHarvest(B.QUANTUM_ORE, 'item:kazma_demir')).toBe(false);
    expect(canHarvest(B.QUANTUM_ORE, 'item:kazma_elmas')).toBe(true);
    expect(canHarvest(B.QUANTUM_ORE, 'item:kazma_kuantum')).toBe(true);
    expect(canHarvest(B.GOLD_ORE, 'item:kazma_altın')).toBe(false); // altın zayıf
  });

  it('sıfır ve sonsuz süreler', () => {
    expect(breakTime(B.TALL_GRASS, null)).toBe(0);
    expect(breakTime(B.TORCH, null)).toBe(0);
    expect(breakTime(B.BEDROCK, 'item:kazma_kuantum')).toBe(Infinity);
    expect(breakTime(B.SEAL_BARRIER, 'item:kazma_kuantum')).toBe(Infinity);
    expect(breakTime(B.WATER, null)).toBe(Infinity);
    BLOCKS.forEach((b) => {
      const t = breakTime(b.id, 'item:kazma_kuantum');
      expect(Number.isNaN(t)).toBe(false);
      expect(t).toBeGreaterThanOrEqual(0);
    });
  });

  it('kürek toprağı, balta ahşabı hızlandırır', () => {
    expect(breakTime(B.DIRT, 'item:kürek_demir')).toBeLessThan(breakTime(B.DIRT, null));
    expect(breakTime(B.LOG_OAK, 'item:balta_demir')).toBeLessThan(breakTime(B.LOG_OAK, null));
    expect(breakTime(B.LOG_OAK, 'item:kazma_demir')).toBe(breakTime(B.LOG_OAK, null));
  });
});

describe('resolveDrops', () => {
  it('taş kırıktaş düşer, elle düşmez', () => {
    expect(resolveDrops(B.STONE, seededRandom(1), 'item:kazma_ahşap')).toEqual([{ item: 'blok:kırıktaş', count: 1 }]);
    expect(resolveDrops(B.STONE, seededRandom(1), null)).toEqual([]);
  });
  it('elmas cevheri demir kazma ile elmas verir, bakırla vermez', () => {
    expect(resolveDrops(B.DIAMOND_ORE, seededRandom(1), 'item:kazma_demir')).toEqual([{ item: 'item:elmas', count: 1 }]);
    expect(resolveDrops(B.DIAMOND_ORE, seededRandom(1), 'item:kazma_bakır')).toEqual([]);
  });
  it('self, kırılamaz, sıvı', () => {
    expect(resolveDrops(B.BRICK, null, 'item:kazma_taş')).toEqual([{ item: 'blok:tuğla', count: 1 }]);
    expect(resolveDrops(B.CLOTH_RED, null, null)).toEqual([{ item: 'blok:kumaş_kırmızı', count: 1 }]);
    expect(resolveDrops(B.BEDROCK, seededRandom(1), 'item:kazma_kuantum')).toEqual([]);
    expect(resolveDrops(B.WATER, seededRandom(1), null)).toEqual([]);
    expect(resolveDrops(B.DOOR_OPEN, null, null)).toEqual([{ item: 'blok:kapı', count: 1 }]);
  });
  it('belirlenimci; adet aralığında; olasılıklar uygulanır', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(resolveDrops(B.COAL_ORE, a, 'item:kazma_taş')).toEqual(resolveDrops(B.COAL_ORE, b, 'item:kazma_taş'));
    }
    const counts = new Set();
    const r = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      const d = resolveDrops(B.COAL_ORE, r, 'item:kazma_taş');
      expect(d).toHaveLength(1);
      expect(d[0].count).toBeGreaterThanOrEqual(1);
      expect(d[0].count).toBeLessThanOrEqual(2);
      counts.add(d[0].count);
    }
    expect(counts.size).toBe(2);
    // meşe yaprağı: elma ~%6, sopa ~%20
    let apples = 0;
    let sticks = 0;
    const r2 = seededRandom(9);
    for (let i = 0; i < 5000; i++) {
      resolveDrops(B.LEAVES_OAK, r2, 'item:kılıç_demir').forEach((d) => {
        if (d.item === 'item:elma') apples++;
        if (d.item === 'item:sopa') sticks++;
      });
    }
    expect(apples / 5000).toBeGreaterThan(0.03);
    expect(apples / 5000).toBeLessThan(0.1);
    expect(sticks / 5000).toBeGreaterThan(0.14);
    expect(sticks / 5000).toBeLessThan(0.26);
    // rng yoksa yalnız kesin düşenler
    expect(resolveDrops(B.LEAVES_OAK, null, null)).toEqual([]);
    // fonksiyon rng
    expect(resolveDrops(B.COAL_ORE, () => 0.999, 'item:kazma_taş')).toEqual([{ item: 'item:kömür', count: 2 }]);
    expect(resolveDrops(B.COAL_ORE, () => 0, 'item:kazma_taş')).toEqual([{ item: 'item:kömür', count: 1 }]);
  });
  it('kil dört top, çakıl bazen çakmaktaşı verir', () => {
    expect(resolveDrops(B.CLAY, null, null)).toEqual([{ item: 'item:kil_topu', count: 4 }]);
    const withFlint = resolveDrops(B.GRAVEL, () => 0, null);
    expect(withFlint.map((d) => d.item).sort()).toEqual(['blok:çakıl', 'item:çakmaktaşı']);
    expect(resolveDrops(B.GRAVEL, () => 0.99, null)).toEqual([{ item: 'blok:çakıl', count: 1 }]);
  });
});
