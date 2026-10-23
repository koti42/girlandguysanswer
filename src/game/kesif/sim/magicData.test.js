import { describe, expect, it } from 'vitest';
import { B, BLOCKS, PLACEABLE_IDS, BUILDABLE_IDS, TILE_NAMES, getBlock } from './blocks.js';
import { BUILDABLE_MAX, MAX_BLOCK_ID } from './constants.js';
import {
  ITEMS, ITEM_LIST, RECIPES, RECIPE_CATEGORIES, STATIONS, getRecipe, itemByKey, recipesProducing,
} from './items.js';
import { LOOT_TABLE, STRUCT_THEME, allLootItems } from './loot.js';
import { MOB_TYPES } from './mobTypes.js';
import { enchantClassOf } from './magicEnchant.js';
import {
  ENCHANT_CLASSES, ENCHANT_LIST, ENCHANTS, EFFECT_LIST, EFFECTS, ITEM_DUST, ITEM_SHARD, MAGIC_BLOCK_DEFS, MAGIC_BLOCK_IDS,
  MAGIC_ITEM_DEFS, MAGIC_ITEM_KEYS, POTION_DEFS, POTION_KEYS, SHELF_BLOCK_ID, SPELL_LIST, STAFF_KEYS, enchantDef, levelCapForTier, roman,
  tierOfLevel,
} from './magicData.js';
import { BREW_RECIPES, BREW_TIME, MAGIC_RECIPES } from './magicRecipes.js';
import { hasPainter, paintTileByName } from '../render/atlas.js';

describe('Büyülemeler tablosu', () => {
  it('anahtarlar ASCII ve benzersiz; seviye/kademe aralıkları geçerli', () => {
    const seen = new Set();
    ENCHANT_LIST.forEach((d) => {
      expect(d.key).toMatch(/^[a-z_]+$/);
      expect(seen.has(d.key)).toBe(false);
      seen.add(d.key);
      expect(ENCHANTS[d.key]).toBe(d);
      expect(d.max).toBeGreaterThanOrEqual(1);
      expect(d.max).toBeLessThanOrEqual(5);
      expect(d.minTier).toBeGreaterThanOrEqual(1);
      expect(d.minTier).toBeLessThanOrEqual(5);
      expect(d.weight).toBeGreaterThan(0);
      expect(tierOfLevel(d, 1)).toBe(d.minTier);
      expect(tierOfLevel(d, d.max)).toBeLessThanOrEqual(5);
      expect(d.targets.length).toBeGreaterThan(0);
      d.targets.forEach((t) => expect(ENCHANT_CLASSES).toContain(t));
      for (let l = 1; l <= d.max; l++) expect(d.text(l).length).toBeGreaterThan(3);
    });
    expect(ENCHANT_LIST.length).toBeGreaterThanOrEqual(20);
  });

  it('spesifikasyondaki tüm büyülemeler ve azami seviyeler var', () => {
    const want = {
      keskinlik: 5, alev: 2, buz: 2, geri_tepme: 2, yagmaci: 3, verimlilik: 5, dayaniklilik: 3, ipek_dokunus: 1, servet: 3,
      miknatis: 1, koruma: 4, ates_direnci: 1, hafif_adim: 3, su_solugu: 3, dikenler: 3, guc: 5, sonsuzluk: 1, hiz: 3,
      yenilenme: 2, mana_verimi: 3,
    };
    Object.keys(want).forEach((k) => expect(enchantDef(k).max).toBe(want[k]));
  });

  it('çakışmalar simetrik ve geçerli; her sınıf için en az bir büyü uygulanabilir', () => {
    ENCHANT_LIST.forEach((d) => d.conflicts.forEach((c) => {
      expect(enchantDef(c)).not.toBeNull();
      expect(enchantDef(c).conflicts).toContain(d.key);
    }));
    ENCHANT_CLASSES.forEach((cls) => {
      expect(ENCHANT_LIST.filter((d) => d.targets.indexOf(cls) >= 0).length).toBeGreaterThanOrEqual(cls === 'kalkan' ? 1 : 2);
    });
  });

  it('levelCapForTier / roman', () => {
    expect(levelCapForTier(enchantDef('keskinlik'), 1)).toBe(1);
    expect(levelCapForTier(enchantDef('keskinlik'), 3)).toBe(3);
    expect(levelCapForTier(enchantDef('keskinlik'), 5)).toBe(5);
    expect(levelCapForTier(enchantDef('servet'), 2)).toBe(0);
    expect(levelCapForTier(enchantDef('servet'), 5)).toBe(3);
    expect(roman(1)).toBe('I');
    expect(roman(5)).toBe('V');
  });

  it('enchantDef prototip anahtarlarını reddeder', () => {
    ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', null, undefined, 5].forEach((k) => {
      expect(enchantDef(k)).toBeNull();
    });
  });
});

describe('Etkiler ve büyüler tablosu', () => {
  it('etki anahtarları ve mods üreticileri', () => {
    EFFECT_LIST.forEach((e) => {
      expect(EFFECTS[e.key]).toBe(e);
      expect(typeof e.mods(1)).toBe('object');
      expect(e.name.length).toBeGreaterThan(2);
      expect(e.icon.length).toBeGreaterThan(1);
    });
    expect(EFFECT_LIST.map((e) => e.key)).toEqual(
      expect.arrayContaining(['hiz', 'ziplama', 'guc', 'gece_gorusu', 'ates_direnci', 'su_solugu', 'yenilenme']),
    );
  });

  it('dört büyü, her biri ayrı asaya bağlı ve asa eşyası var', () => {
    expect(SPELL_LIST.map((s) => s.key).sort()).toEqual(['ates_topu', 'buz_mizragi', 'kuantum_sicrayisi', 'sifa_isigi']);
    SPELL_LIST.forEach((s) => {
      const it = itemByKey(s.staff);
      expect(it).not.toBeNull();
      expect(it.magic.spell).toBe(s.key);
      expect(it.durability).toBeGreaterThan(0);
      expect(s.manaCost).toBeGreaterThan(0);
      expect(s.cooldown).toBeGreaterThan(0);
    });
    expect(new Set(STAFF_KEYS).size).toBe(4);
  });
});

describe('Yeni eşyalar ve bloklar', () => {
  it('hepsi eşya tablosunda, anahtarlar benzersiz, Türkçe adlı', () => {
    expect(new Set(MAGIC_ITEM_KEYS).size).toBe(MAGIC_ITEM_KEYS.length);
    MAGIC_ITEM_DEFS.forEach((d) => {
      const it = ITEMS[d.key];
      expect(it).toBeTruthy();
      expect(it.name).toBe(d.name);
      expect(it.desc.length).toBeGreaterThan(5);
    });
    expect(itemByKey(ITEM_DUST).name).toBe('Büyü Tozu');
    expect(itemByKey(ITEM_SHARD).name).toBe('Kuantum Kıymığı');
    expect(itemByKey('item:mana_kristali').magic.manaCrystal).toBe(true);
  });

  it('iksirler: potion alanı, içilebilir, geçerli etkiye bağlı', () => {
    expect(POTION_DEFS).toHaveLength(9);
    POTION_DEFS.forEach((p) => {
      const it = itemByKey(p.key);
      expect(it.drink).toBe(true);
      expect(it.potion).toBe(p.potion);
      if (p.potion.effect) {
        expect(EFFECTS[p.potion.effect]).toBeTruthy();
        expect(p.potion.seconds).toBeGreaterThan(0);
      } else {
        expect(p.potion.heal || p.potion.mana).toBeGreaterThan(0);
      }
    });
    expect(POTION_KEYS).toHaveLength(9);
  });

  it('büyülenebilir sınıfı olan her eşya dayanıklılıklıdır (yığılmaz); sınıflandırma tutarlı', () => {
    let classified = 0;
    ITEM_LIST.forEach((it) => {
      const cls = enchantClassOf(it.key);
      if (!cls) return;
      classified++;
      expect(it.durability).toBeGreaterThan(0);
      expect(it.stack).toBe(1);
    });
    expect(classified).toBeGreaterThanOrEqual(58); // 7×3 alet + 7 kılıç + 24 zırh + yay + kalkan + 4 asa
    expect(enchantClassOf('item:kazma_demir')).toBe('kazma');
    expect(enchantClassOf('item:kılıç_elmas')).toBe('kılıç');
    expect(enchantClassOf('item:çizme_demir')).toBe('ayak');
    expect(enchantClassOf('item:miğfer_deri')).toBe('kafa');
    expect(enchantClassOf('item:yay')).toBe('yay');
    expect(enchantClassOf('item:kalkan')).toBe('kalkan');
    expect(enchantClassOf('item:asa_ates')).toBe('asa');
    expect(enchantClassOf('item:ışın_tüfeği')).toBeNull();
    expect(enchantClassOf('item:elma')).toBeNull();
    expect(enchantClassOf('blok:taş')).toBeNull();
    expect(enchantClassOf(undefined)).toBeNull();
  });

  it('Büyü Masası ve Simya Kazanı: kimlik, harita yasağı, etkileşim, doku', () => {
    expect(B.MAGIC_TABLE).toBe(MAGIC_BLOCK_IDS.TABLE);
    expect(B.ALCHEMY_CAULDRON).toBe(MAGIC_BLOCK_IDS.CAULDRON);
    expect(MAGIC_BLOCK_IDS.TABLE).toBeGreaterThan(BUILDABLE_MAX);
    expect(MAGIC_BLOCK_IDS.CAULDRON).toBeLessThanOrEqual(MAX_BLOCK_ID);
    MAGIC_BLOCK_DEFS.forEach((d) => {
      const b = getBlock(d.id);
      expect(b.key).toBe(d.key);
      expect(b.buildable).toBe(false);
      expect(b.placeable).toBe(true);
      expect(b.interact).toBe(d.interact);
      expect(b.unbreakable).toBe(false);
      expect(b.tool).toBe('kazma');
      expect(b.emission).toBeGreaterThan(0);
      expect(PLACEABLE_IDS).not.toContain(d.id);
      expect(BUILDABLE_IDS).not.toContain(d.id);
      expect(BLOCKS[d.id].drops).toBe('self');
      expect(ITEMS['blok:' + d.key].placesBlock).toBe(d.id);
      [b.tileNames.top, b.tileNames.side].forEach((n) => {
        expect(TILE_NAMES).toContain(n);
        expect(hasPainter(n)).toBe(true);
      });
    });
    // masa ~3/4 yükseklikte kısmi kutu; kazan tam küp
    expect(getBlock(B.MAGIC_TABLE).collision[0][4]).toBeCloseTo(0.75, 5);
    expect(getBlock(B.ALCHEMY_CAULDRON).cube).toBe(true);
  });

  it('dört yeni doku boyayıcısı belirlenimci ve parlak (emisyon) pikseller içerir', () => {
    ['büyü_masası_üst', 'büyü_masası_yan', 'simya_kazanı_üst', 'simya_kazanı_yan'].forEach((n) => {
      const a = paintTileByName(n, 3);
      const b = paintTileByName(n, 3);
      expect(Array.from(a.c)).toEqual(Array.from(b.c));
      let emissive = 0;
      let minC = 1;
      let maxC = 0;
      for (let i = 0; i < a.e.length; i++) if (a.e[i] > 0.6) emissive++;
      for (let i = 0; i < a.c.length; i += 4) {
        minC = Math.min(minC, a.c[i + 1]);
        maxC = Math.max(maxC, a.c[i + 1]);
        expect(a.c[i + 3]).toBeGreaterThan(0.99);
      }
      expect(emissive).toBeGreaterThan(20);
      expect(maxC - minC).toBeGreaterThan(0.3); // düz renk değil
    });
  });
});

describe('Tarifler', () => {
  it('üretim tarifleri RECIPES içinde, benzersiz kimlik, geçerli girdi/çıktı/istasyon', () => {
    const ids = new Set();
    MAGIC_RECIPES.forEach((r) => {
      expect(ids.has(r[0])).toBe(false);
      ids.add(r[0]);
      const rec = getRecipe(r[0]);
      expect(rec).toBeTruthy();
      expect(rec.out.item).toBe(r[1]);
      expect(itemByKey(rec.out.item)).not.toBeNull();
      rec.in.forEach((p) => {
        expect(itemByKey(p.item)).not.toBeNull();
        expect(p.count).toBeGreaterThan(0);
      });
      expect(STATIONS).toContain(rec.station);
      expect(RECIPE_CATEGORIES.map((c) => c.key)).toContain(rec.category);
    });
    expect(RECIPES.filter((r) => r.category === 'büyü')).toHaveLength(MAGIC_RECIPES.length);
  });

  it('kitaplık sayımı gerçek Kitaplık bloğuna bağlı', () => {
    expect(SHELF_BLOCK_ID).toBe(B.BOOKSHELF);
    expect(getBlock(SHELF_BLOCK_ID).key).toBe('kitaplık');
    expect(getRecipe('kitaplık').out.item).toBe('blok:kitaplık');
  });

  it('Büyü Masası tarifi: kitap + bazalt + kıymık; erken (bölge 1) erişilebilir malzemeler', () => {
    const r = getRecipe('büyü_masası');
    expect(r.in.map((p) => p.item)).toEqual(expect.arrayContaining(['item:kitap', 'blok:bazalt', ITEM_SHARD]));
    r.in.forEach((p) => expect(p.item).not.toBe('item:elmas'));
    expect(r.station).toBe('tezgah');
    expect(getRecipe('simya_kazanı').in.map((p) => p.item)).toEqual(expect.arrayContaining(['item:demir_külçe', 'blok:taş']));
  });

  it('kazan tarifleri: geçerli girdi/çıktı, 30 sn, şifa mevcut Şifa İksiri, 10 tarif', () => {
    expect(BREW_RECIPES).toHaveLength(10);
    const ids = new Set();
    BREW_RECIPES.forEach((r) => {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(itemByKey(r.out)).not.toBeNull();
      expect(r.time).toBe(BREW_TIME);
      expect(BREW_TIME).toBe(30);
      r.in.forEach((p) => {
        expect(itemByKey(p.item)).not.toBeNull();
        expect(p.count).toBeGreaterThan(0);
      });
    });
    expect(BREW_RECIPES.find((r) => r.id === 'sifa').out).toBe('item:şifa_iksiri');
    // her iksir eşyası bir kazan tarifinin çıktısı
    POTION_KEYS.forEach((k) => expect(BREW_RECIPES.some((r) => r.out === k)).toBe(true));
  });
});

describe('Elde edilebilirlik: her yeni eşyanın bir kaynağı var', () => {
  /** Temel kaynaklar: blok düşüşleri, yaratık ganimeti, sandık tabloları, kendisi düşen bloklar. */
  function baseSources() {
    const base = new Set();
    BLOCKS.forEach((b) => {
      if (!b || b.id < 1 || b.unbreakable) return;
      if (b.drops === 'self') {
        base.add('blok:' + b.key);
      } else {
        b.drops.forEach((d) => base.add(d.item));
      }
    });
    Object.keys(MOB_TYPES).forEach((k) => MOB_TYPES[k].drops.forEach((d) => base.add(d.item)));
    allLootItems().forEach((k) => base.add(k));
    return base;
  }
  /** Tarif + kazan + ocak kapanımı. */
  function closure() {
    const have = baseSources();
    let changed = true;
    const recs = RECIPES.map((r) => ({ out: r.out.item, ins: r.in.map((p) => p.item) }))
      .concat(BREW_RECIPES.map((r) => ({ out: r.out, ins: r.in.map((p) => p.item).concat(['item:cam_şişe']) })));
    while (changed) {
      changed = false;
      for (const r of recs) {
        if (!have.has(r.out) && r.ins.every((i) => have.has(i))) {
          have.add(r.out);
          changed = true;
        }
      }
    }
    return have;
  }

  it('her yeni eşya temel kaynaklardan tarif zinciriyle elde edilir', () => {
    const have = closure();
    MAGIC_ITEM_KEYS.forEach((k) => expect(have.has(k), k).toBe(true));
  });

  it('Büyü Tozu: cevher, yaratık, sandık ve üretim kaynakları', () => {
    expect(getBlock(B.QUANTUM_ORE).drops.some((d) => d.item === ITEM_DUST)).toBe(true);
    expect(getBlock(B.AMETHYST).drops.some((d) => d.item === ITEM_DUST)).toBe(true);
    expect(MOB_TYPES.kristalbocegi.drops.some((d) => d.item === ITEM_DUST)).toBe(true);
    expect(MOB_TYPES.golge.drops.some((d) => d.item === ITEM_DUST)).toBe(true);
    ['kokana', 'tasbekci', 'buzkral', 'golgehukumdar'].forEach((b) => {
      expect(MOB_TYPES[b].drops.some((d) => d.item === ITEM_DUST && d.min >= 6)).toBe(true);
      expect(MOB_TYPES[b].drops.some((d) => d.item === 'item:mana_kristali')).toBe(true);
    });
    expect(allLootItems()).toContain(ITEM_DUST);
    expect(LOOT_TABLE.yaygın.some((e) => e.item === ITEM_DUST)).toBe(true);
    expect(Object.keys(STRUCT_THEME).some((k) => STRUCT_THEME[k].some((e) => e.item === ITEM_DUST))).toBe(true);
    expect(recipesProducing(ITEM_DUST).length).toBeGreaterThan(0);
  });

  it('Kuantum Kıymığı kaynakları; Mana Kristali sandık/boss/üretim', () => {
    expect(getBlock(B.QUANTUM_ORE).drops.some((d) => d.item === ITEM_SHARD)).toBe(true);
    expect(getBlock(B.CRYSTAL_ROCK).drops.some((d) => d.item === ITEM_SHARD)).toBe(true);
    expect(MOB_TYPES.kristalbocegi.drops.some((d) => d.item === ITEM_SHARD)).toBe(true);
    expect(allLootItems()).toContain(ITEM_SHARD);
    expect(allLootItems()).toContain('item:mana_kristali');
    expect(recipesProducing('item:mana_kristali').length).toBe(1);
  });

  it('asalar ve iksirler sandık tablosunda (kuantum asası son bölgelerde)', () => {
    const all = allLootItems();
    ['item:asa_ates', 'item:asa_buz', 'item:asa_sifa', 'item:asa_kuantum', 'item:iksir_hiz', 'item:iksir_guclu_sifa'].forEach((k) => {
      expect(all).toContain(k);
    });
  });
});
