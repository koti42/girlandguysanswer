import { describe, expect, it } from 'vitest';
import {
  GENERATOR_FUEL, MACHINE_TYPES, SCAN_ORES, SHIELD_ITEM_KEYS, TECH_ALL_IDS, TECH_BLOCK_DEFS, TECH_BLOCK_IDS, TECH_CRAFTED_KEYS,
  TECH_ITEM_DEFS, TECH_PLACEABLE_IDS, TECH_RATES, TECH_RECIPES, TECH_STATIONS, TECH_TOOL_INFO, conductsPower, isTechBlockId,
  machineTypeOfBlock, techBaseId, techBlockDef, techOnId,
} from './techData.js';
import {
  B, BLOCKS, blockByKey, breakTime, canHarvest, resolveDrops, toolInfoFromKey,
} from './blocks.js';
import {
  ITEMS, RECIPES, STATIONS, STATION_BLOCKS, blockItemKey, getRecipe, itemByKey, recipesProducing,
} from './items.js';
import { MAX_BLOCK_ID, BUILDABLE_MAX } from './constants.js';
import {
  obtainability, deadRecipes, findProfitLoops, recipeDepth, recipeOrphans, stationItem,
} from './craftGraph.js';
import { LOOT_TABLE, allLootItems } from './loot.js';
import { MOB_TYPES } from './mobTypes.js';
import { QUESTS, QUEST_CHAINS } from './questsData.js';
import { ACHIEVEMENTS } from './achievementsData.js';
import { SCALAR_METRICS } from './progressionMetrics.js';
import { STAT_COUNTERS } from './progressionData.js';
import { Progression } from './progression.js';
import { seededRandom } from './rng.js';

describe('teknoloji verisi: bloklar', () => {
  it('kimlikler 200–222, benzersiz, MAX_BLOCK_ID içinde, B.TECH_* ile eşleşir', () => {
    const ids = Object.values(TECH_BLOCK_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      expect(id).toBeGreaterThanOrEqual(200);
      expect(id).toBeLessThanOrEqual(239);
      expect(id).toBeLessThanOrEqual(MAX_BLOCK_ID);
    });
    TECH_BLOCK_DEFS.forEach((d) => {
      expect(B[d.constName]).toBe(d.id);
      expect(BLOCKS[d.id].key).toBe(d.key);
      expect(BLOCKS[d.id].name).toBe(d.name);
      expect(BLOCKS[d.id].buildable, d.key + ' haritada yasak').toBe(false);
      expect(d.id).toBeGreaterThan(BUILDABLE_MAX);
      expect(BLOCKS[d.id].category).toBe('yapı');
    });
    expect(TECH_ALL_IDS).toHaveLength(TECH_BLOCK_DEFS.length);
  });

  it('durum varyantları yerleştirilemez ve TABAN bloğu düşürür; tabanlar yerleştirilebilir, eşyası var', () => {
    TECH_BLOCK_DEFS.forEach((d) => {
      const b = BLOCKS[d.id];
      if (d.base) {
        expect(b.placeable, d.key).toBe(false);
        const base = BLOCKS[d.base];
        expect(resolveDrops(d.id, seededRandom(1), 'item:kazma_demir')).toEqual([{ item: 'blok:' + base.key, count: 1 }]);
        expect(techBaseId(d.id)).toBe(d.base);
        expect(techOnId(d.base)).toBe(d.id);
        expect(ITEMS['blok:' + d.key]).toBeUndefined();
      } else {
        expect(b.placeable, d.key).toBe(true);
        expect(techBaseId(d.id)).toBe(d.id);
        expect(ITEMS['blok:' + d.key].placesBlock).toBe(d.id);
        expect(blockItemKey(d.id)).toBe('blok:' + d.key);
      }
    });
    expect(TECH_PLACEABLE_IDS.length).toBe(TECH_BLOCK_DEFS.filter((d) => !d.base).length);
  });

  it('makine türleri her çift için tutarlı; kablo ve laboratuvar kayıtsız', () => {
    MACHINE_TYPES.forEach((t) => {
      const defs = TECH_BLOCK_DEFS.filter((d) => d.type === t);
      expect(defs.length, t).toBeGreaterThanOrEqual(1);
      defs.forEach((d) => expect(machineTypeOfBlock(d.id)).toBe(t));
    });
    expect(machineTypeOfBlock(TECH_BLOCK_IDS.CABLE)).toBeNull();
    expect(machineTypeOfBlock(TECH_BLOCK_IDS.LAB)).toBeNull();
    expect(machineTypeOfBlock(1)).toBeNull();
    expect(isTechBlockId(TECH_BLOCK_IDS.LAMP_ON)).toBe(true);
    expect(isTechBlockId(1)).toBe(false);
    expect(techBaseId(5)).toBe(0);
    expect(techBlockDef(205).key).toBe('kablo');
  });

  it('iletkenlik: laboratuvar hayır; anahtar yalnız ETKİN varyantta; geri kalanı evet', () => {
    expect(conductsPower(TECH_BLOCK_IDS.LAB)).toBe(false);
    expect(conductsPower(TECH_BLOCK_IDS.BUTTON)).toBe(false);
    expect(conductsPower(TECH_BLOCK_IDS.BUTTON_ON)).toBe(true);
    expect(conductsPower(TECH_BLOCK_IDS.SENSOR)).toBe(false);
    expect(conductsPower(TECH_BLOCK_IDS.SENSOR_ON)).toBe(true);
    [TECH_BLOCK_IDS.CABLE, TECH_BLOCK_IDS.SOLAR, TECH_BLOCK_IDS.BATTERY, TECH_BLOCK_IDS.LAMP, TECH_BLOCK_IDS.DOOR].forEach((id) => {
      expect(conductsPower(id)).toBe(true);
    });
    expect(conductsPower(1)).toBe(false);
  });

  it('fizik/ışık özellikleri: lamba etkin parlak, kapı açıkken geçilir, platformlar plaka yüksekliğinde', () => {
    expect(BLOCKS[B.TECH_LAMP_ON].emission).toBe(15);
    expect(BLOCKS[B.TECH_LAMP].emission).toBe(0);
    expect(BLOCKS[B.TECH_DOOR].solid).toBe(true);
    expect(BLOCKS[B.TECH_DOOR_OPEN].solid).toBe(false);
    expect(BLOCKS[B.TECH_TELEPORTER].shape).toBe('slab');
    expect(BLOCKS[B.TECH_LIFT].shape).toBe('slab');
    expect(BLOCKS[B.TECH_SOLAR].shape).toBe('slab');
    expect(BLOCKS[B.TECH_BUTTON].solid).toBe(false);
    expect(BLOCKS[B.TECH_GENERATOR_ON].emission).toBeGreaterThan(BLOCKS[B.TECH_GENERATOR].emission);
    expect(BLOCKS[B.TECH_LAB].interact).toBe('laboratuvar');
    expect(BLOCKS[B.TECH_CABLE].interact).toBeNull();
    expect(BLOCKS[B.TECH_TELEPORTER].interact).toBe('ışınlayıcı');
    expect(BLOCKS[B.TECH_LIFT].interact).toBe('asansör');
  });

  it('hiçbir tech bloğu kırılamaz değil; çıplak elle makine kırılır (bakır kazma gerekmez) ama laboratuvar alet ister', () => {
    TECH_BLOCK_DEFS.forEach((d) => {
      expect(BLOCKS[d.id].unbreakable, d.key).toBe(false);
      expect(breakTime(d.id, 'item:kazma_demir')).toBeLessThan(Infinity);
    });
    expect(canHarvest(B.TECH_LAB, 'item:kazma_taş')).toBe(true);
    expect(canHarvest(B.TECH_LAB, null)).toBe(false);
  });
});

describe('teknoloji verisi: eşyalar ve tarifler', () => {
  it('yeni malzemeler ve cihazlar var; yığınlanmayanlar stack 1; şarj tanımı geçerli', () => {
    ['bakır_tel', 'devre_kartı', 'enerji_çekirdeği', 'kuantum_çekirdeği', 'lazer_merceği', 'pil_hücresi', 'çelik_levha'].forEach((k) => {
      const it = itemByKey('item:' + k);
      expect(it, k).toBeTruthy();
      expect(it.kind).toBe('malzeme');
      expect(it.stack).toBe(64);
    });
    ['item:jetpack', 'item:tarayıcı', 'item:kazma_elektrikli', 'item:balta_elektrikli', 'item:portal_tabancası'].forEach((k) => {
      const it = itemByKey(k);
      expect(it.stack, k).toBe(1);
      expect(it.tech.chargeMax).toBeGreaterThan(0);
      expect(it.tech.start).toBeGreaterThan(0);
      expect(it.tech.start).toBeLessThanOrEqual(1);
    });
    SHIELD_ITEM_KEYS.forEach((k) => {
      const it = itemByKey(k);
      expect(it.kind).toBe('zırh');
      expect(it.tech.kind).toBe('kalkan');
      expect(it.durability).toBeGreaterThan(0);
      expect(it.armor.set).toBe('kzırh');
    });
    expect(itemByKey('item:ışın_tüfeği_mk2').weapon.damage).toBeGreaterThan(itemByKey('item:ışın_tüfeği').weapon.damage);
    expect(itemByKey('item:ışın_tüfeği_mk2').weapon.ammo).toBe('item:enerji_hücresi');
    expect(itemByKey('item:ışın_tüfeği_mk2').weapon.hitscan).toBe(true);
  });

  it('elektrikli aletler araç olarak tanınır (kademe 5), kırma süresi eşdeğer elmasdan hızlı, elmas cevheri düşer', () => {
    const t = toolInfoFromKey('item:kazma_elektrikli');
    expect(t).toMatchObject({ type: 'kazma', level: 5, speed: 9 });
    expect(toolInfoFromKey('item:balta_elektrikli').type).toBe('balta');
    expect(TECH_TOOL_INFO['item:kazma_elektrikli'].tierKey).toBe('elektrikli');
    expect(breakTime(B.STONE, 'item:kazma_elektrikli')).toBeLessThan(breakTime(B.STONE, 'item:kazma_demir'));
    expect(canHarvest(B.DIAMOND_ORE, 'item:kazma_elektrikli')).toBe(true);
    expect(canHarvest(B.QUANTUM_ORE, 'item:kazma_elektrikli')).toBe(true);
    expect(toolInfoFromKey('item:kazma_demir').tierKey).toBe('demir');
    expect(toolInfoFromKey('item:kazma_yok')).toBeNull();
  });

  it('tarif bütünlüğü: kimlikler benzersiz, tüm girdi/çıktı eşyaları var, istasyon geçerli, hepsi RECIPES içinde', () => {
    const ids = new Set();
    TECH_RECIPES.forEach((r) => {
      expect(ids.has(r[0]), r[0]).toBe(false);
      ids.add(r[0]);
      expect(getRecipe(r[0]), r[0]).toBeTruthy();
      expect(itemByKey(r[1]), r[1]).toBeTruthy();
      expect(r[2]).toBeGreaterThanOrEqual(1);
      r[3].forEach((p) => {
        expect(itemByKey(p[0]), r[0] + ' girdi ' + p[0]).toBeTruthy();
        expect(p[1]).toBeGreaterThan(0);
      });
      expect(STATIONS).toContain(r[4]);
    });
    expect(STATION_BLOCKS.laboratuvar).toEqual(TECH_STATIONS.laboratuvar);
    expect(RECIPES.filter((r) => r.station === 'laboratuvar').length).toBeGreaterThan(20);
  });

  it('Portal Silahı tarifi Laboratuvarda: Kuantum Çekirdeği + Lazer Merceği + Çelik Levha + Enerji Çekirdeği', () => {
    const r = getRecipe('portal_tabancası');
    expect(r.station).toBe('laboratuvar');
    expect(r.out).toEqual({ item: 'item:portal_tabancası', count: 1 });
    expect(r.in.map((p) => p.item).sort()).toEqual(
      ['item:enerji_çekirdeği', 'item:kuantum_çekirdeği', 'item:lazer_merceği', 'item:çelik_levha'].sort(),
    );
    expect(recipesProducing('item:portal_tabancası').length).toBe(1);
  });

  it('Işınlanma ve Asansör platformları çift çıkar; laboratuvar tarifi laboratuvar istasyonu gerektirmez (önyükleme)', () => {
    expect(getRecipe('ışınlanma_platformu').out.count).toBe(2);
    expect(getRecipe('asansör_platformu').out.count).toBe(2);
    expect(getRecipe('teknoloji_laboratuvarı').station).toBe('tezgah');
    expect(getRecipe('çelik_levha').station).toBe('örs');
    expect(getRecipe('bakır_tel').station).toBe('tezgah');
    expect(getRecipe('lab:enerji_hücresi').out.item).toBe('item:enerji_hücresi');
  });

  it('edinilebilirlik: HER teknoloji eşyası ve bloğu oyunda elde edilebilir; ölü tarif yok; kârlı döngü yok', () => {
    const { via, unobtainable } = obtainability();
    TECH_ITEM_DEFS.forEach((d) => expect(via.has(d.key), d.key + ' edinilemiyor').toBe(true));
    TECH_BLOCK_DEFS.filter((d) => !d.base).forEach((d) => expect(via.has('blok:' + d.key), d.key).toBe(true));
    expect(unobtainable.filter((k) => /teknoloji|jetpack|kzırh|elektrikli|tel$|kartı|çekirdeği|merceği|hücresi$|levha|güneş|jeneratör|pil_|kablo|matkap|madenci|lamba|ışınlanma|asansör|güç_kapısı|düğme|sensör|şarj/.test(k))).toEqual([]);
    expect(deadRecipes()).toEqual([]);
    expect(recipeOrphans()).toEqual([]);
    expect(findProfitLoops()).toEqual([]);
    expect(stationItem('laboratuvar')).toBe('blok:teknoloji_laboratuvarı');
    expect(via.has('blok:teknoloji_laboratuvarı')).toBe(true);
  });

  it('derinlik: laboratuvar erken (demirle), çekirdek zinciri ve portal silahı daha derin', () => {
    const { via } = obtainability();
    expect(via.get('blok:teknoloji_laboratuvarı').depth).toBeLessThanOrEqual(8);
    const rd = recipeDepth;
    // çekirdekler ganimetten de düştüğü için ham derinlik 0 olabilir; tarif derinliği yine tarif zincirini sıralar
    expect(rd('teknoloji_laboratuvarı')).toBeLessThanOrEqual(rd('enerji_çekirdeği'));
    expect(rd('enerji_çekirdeği')).toBeLessThanOrEqual(rd('kuantum_çekirdeği'));
    expect(rd('kuantum_çekirdeği')).toBeLessThanOrEqual(rd('portal_tabancası'));
    expect(rd('pil_hücresi')).toBeLessThanOrEqual(rd('pil_bankası'));
    expect(rd('portal_tabancası')).toBeGreaterThanOrEqual(rd('kablo'));
    expect(rd('portal_tabancası')).toBeLessThan(90);
  });

  it('tarif döngüsü yok: sıkıştırma/açma ile eşya çoğalmaz (teknoloji girdileri çıktılardan ucuz değil)', () => {
    TECH_RECIPES.forEach((r) => {
      r[3].forEach((p) => {
        if (p[0] === r[1]) throw new Error('kendini girdi alan tarif ' + r[0]);
      });
    });
  });
});

describe('teknoloji verisi: sabitler', () => {
  it('oranlar makul ve yakıt tablosu geçerli', () => {
    expect(TECH_RATES.network.maxNodes).toBe(2000);
    expect(TECH_RATES.furnace.speed).toBe(2);
    expect(TECH_RATES.battery.cap).toBeGreaterThan(TECH_RATES.battery.io);
    Object.keys(GENERATOR_FUEL).forEach((k) => {
      expect(itemByKey(k), k).toBeTruthy();
      expect(GENERATOR_FUEL[k]).toBeGreaterThan(0);
    });
    expect(GENERATOR_FUEL['item:kömür']).toBe(40);
    expect(TECH_RATES.teleporter.minReady).toBeLessThanOrEqual(TECH_RATES.teleporter.cap);
    expect(TECH_RATES.teleporter.maxCost).toBeLessThanOrEqual(TECH_RATES.teleporter.cap);
    expect(TECH_RATES.lift.minCost).toBeLessThanOrEqual(TECH_RATES.lift.cap);
  });

  it('tarama cevherleri gerçek cevher bloklarıdır', () => {
    Object.keys(SCAN_ORES).forEach((id) => {
      const b = BLOCKS[id];
      expect(b.category).toBe('maden');
      expect(b.key).toMatch(/cevher|kuantum|ametist/);
    });
    expect(blockByKey('elmas_cevheri').id).toBe(28);
  });
});

describe('teknoloji verisi: ganimet, yaratıklar, görevler, başarımlar, ilerleme', () => {
  it('ganimet tablolarına teknoloji malzemeleri eklendi (zaman: bölge 1+)', () => {
    const all = new Set(allLootItems());
    ['item:bakır_tel', 'item:pil_hücresi', 'item:çelik_levha', 'item:devre_kartı', 'item:enerji_çekirdeği', 'item:lazer_merceği', 'item:kuantum_çekirdeği'].forEach((k) => {
      expect(all.has(k), k).toBe(true);
    });
    const early = Object.keys(LOOT_TABLE).flatMap((r) => LOOT_TABLE[r]).filter((e) => e.item === 'item:bakır_tel');
    early.forEach((e) => expect(e.z0).toBeGreaterThanOrEqual(1));
    const q = Object.keys(LOOT_TABLE).flatMap((r) => LOOT_TABLE[r]).filter((e) => e.item === 'item:kuantum_çekirdeği');
    q.forEach((e) => expect(e.z0).toBeGreaterThanOrEqual(4));
  });

  it('yaratık/boss ganimetinde teknoloji malzemesi var', () => {
    const dropsOf = (k) => MOB_TYPES[k].drops.map((d) => d.item);
    expect(dropsOf('tasyarasasi')).toContain('item:bakır_tel');
    expect(dropsOf('lavslime')).toContain('item:pil_hücresi');
    expect(dropsOf('kristalbocegi')).toContain('item:devre_kartı');
    expect(dropsOf('tasbekci')).toContain('item:çelik_levha');
    expect(dropsOf('buzkral')).toContain('item:enerji_çekirdeği');
    expect(dropsOf('golgehukumdar')).toContain('item:kuantum_çekirdeği');
  });

  it('görev zinciri: 11 teknoloji görevi, geçerli hedefler ve ön koşullar', () => {
    expect(QUEST_CHAINS.map((c) => c.key)).toContain('teknoloji');
    const tq = QUESTS.filter((q) => q.chain === 'teknoloji');
    expect(tq.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(QUESTS.map((q) => q.id));
    tq.forEach((q) => {
      q.requires.forEach((r) => expect(ids.has(r), q.id + ' ön koşul ' + r).toBe(true));
      if (q.goal.type === 'stat') expect(SCALAR_METRICS[q.goal.name], q.goal.name).toBeTypeOf('function');
      if (q.goal.type === 'craft') q.goal.items.forEach((k) => expect(itemByKey(k), k).toBeTruthy());
      if (q.goal.type === 'place') q.goal.ids.forEach((id) => expect(isTechBlockId(id)).toBe(true));
    });
  });

  it('başarımlar: ≥ 10 teknoloji başarımı, ölçütleri tanımlı', () => {
    const ta = ACHIEVEMENTS.filter((a) => a.id.indexOf('tk_') === 0);
    expect(ta.length).toBeGreaterThanOrEqual(10);
    ta.forEach((a) => expect(SCALAR_METRICS[a.metric], a.id).toBeTypeOf('function'));
  });

  it('ilerleme: olaylar sayaçları artırır ve görev/başarım ölçütlerine yansır', () => {
    const p = new Progression({});
    p.onEvent({ type: 'portalPlaced', color: 'mavi' });
    p.onEvent({ type: 'portalUsed', from: 'mavi', to: 'turuncu' });
    p.onEvent({ type: 'portalUsed', from: 'turuncu', to: 'mavi' });
    p.onEvent({ type: 'teleported' });
    p.onEvent({ type: 'scanPing', count: 3 });
    p.onEvent({ type: 'machineTick', drilled: 7 });
    p.onEvent({ type: 'machineTick', drilled: 0 });
    p.onEvent({ type: 'jetpackFuel', burned: 2.5, fuel: 10, max: 100 });
    p.onEvent({ type: 'blockPlaced', id: B.TECH_SOLAR });
    p.onEvent({ type: 'blockPlaced', id: B.TECH_LAMP });
    p.onEvent({ type: 'blockPlaced', id: B.TECH_LAMP });
    expect(SCALAR_METRICS.portalsPlaced(p)).toBe(1);
    expect(SCALAR_METRICS.portalsUsed(p)).toBe(2);
    expect(SCALAR_METRICS.teleports(p)).toBe(1);
    expect(SCALAR_METRICS.scans(p)).toBe(1);
    expect(SCALAR_METRICS.drillBlocks(p)).toBe(7);
    expect(SCALAR_METRICS.jetpackSeconds(p)).toBe(2);
    expect(SCALAR_METRICS.techPlaced(p)).toBe(3);
    expect(SCALAR_METRICS.distinctTechPlaced(p)).toBe(2);
    p.onEvent({ type: 'machineTick', drilled: 1e12 });
    expect(SCALAR_METRICS.drillBlocks(p)).toBeLessThanOrEqual(7 + 5000);
    p.onEvent({ type: 'jetpackFuel', burned: NaN });
    p.onEvent({ type: 'jetpackFuel', burned: -5 });
    expect(Number.isFinite(p.stats.jetpackSeconds)).toBe(true);
  });

  it('ilerleme kaydı: yeni sayaçlar JSON gidiş-dönüş yapar (jetpack ondalık)', () => {
    const p = new Progression({});
    p.onEvent({ type: 'jetpackFuel', burned: 1.25 });
    p.onEvent({ type: 'portalUsed' });
    const json = JSON.parse(JSON.stringify(p.serialize()));
    const q = new Progression({});
    q.restore(json);
    expect(q.stats.portalsUsed).toBe(1);
    expect(q.stats.jetpackSeconds).toBeCloseTo(1.3, 1);
    STAT_COUNTERS.forEach((k) => expect(Number.isFinite(q.stats[k]), k).toBe(true));
  });

  it('Portal Tabancası üretmek portalGun yeteneğini açar (ikinci tabanca verilmez)', () => {
    const p = new Progression({});
    expect(p.abilities.portalGun).toBe(false);
    const out = p.onEvent({ type: 'itemCrafted', item: 'item:portal_tabancası', count: 1, recipeId: 'portal_tabancası', station: 'laboratuvar' });
    expect(p.abilities.portalGun).toBe(true);
    expect(out.giveItems).toHaveLength(0);
    expect(out.grantAbility).toBeNull();
    expect(SCALAR_METRICS.abilityCount(p)).toBe(1);
    const q = new Progression({});
    q.onEvent({ type: 'itemCrafted', item: 'item:kazma_demir', count: 1 });
    expect(q.abilities.portalGun).toBe(false);
  });

  it('TECH_CRAFTED_KEYS yalnız gerçek eşya/blok anahtarları', () => {
    TECH_CRAFTED_KEYS.forEach((k) => expect(itemByKey(k), k).toBeTruthy());
  });
});
