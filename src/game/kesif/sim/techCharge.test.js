import { describe, expect, it } from 'vitest';
import { Inventory } from './inventory.js';
import {
  addChargeToSlot, armorWith, chargeFraction, chargeInventory, chargeOf, consumeHeldCharge, drainSlot, findCarried,
  inventoryChargeNeed, isChargeable, maxCharge, sanitizeCharge, slotMax, startCharge, techDescribe, techOf,
} from './techCharge.js';
import { applyGame, deserializeGame, serializeGame } from './save.js';
import { decodeChests, cleanDrop, encodeChests, cleanInventoryJson, collectEntities } from './saveSanitize.js';
import { collectDeathDrops, createSurvival } from './survival.js';
import { spawnItem, dropLoot, updateItems } from './entitiesItems.js';
import { EntityManager } from './entities.js';
import { makeWorld } from './techTestKit.js';
import { TechState } from './techState.js';
import { SHIELD_ITEM_KEYS } from './techData.js';

const JET = 'item:jetpack';

describe('techCharge: eşya tanımı ve temizleme', () => {
  it('şarj taşıyan eşyalar ve üst sınırları', () => {
    expect(isChargeable(JET)).toBe(true);
    expect(maxCharge(JET)).toBe(1000);
    expect(maxCharge('item:kazma_elektrikli')).toBe(800);
    expect(maxCharge('item:portal_tabancası')).toBe(24);
    expect(maxCharge('item:tarayıcı')).toBe(400);
    SHIELD_ITEM_KEYS.forEach((k) => expect(maxCharge(k)).toBe(250));
    expect(isChargeable('item:kazma_demir')).toBe(false);
    expect(isChargeable('yok')).toBe(false);
    expect(maxCharge('blok:taş')).toBe(0);
    expect(techOf('item:kazma_demir')).toBeNull();
    expect(startCharge(JET)).toBe(500);
    expect(startCharge('item:tarayıcı')).toBe(400);
    expect(startCharge('item:kazma_demir')).toBe(0);
  });

  it('sanitizeCharge: kırpma, tamsayıya indirme, çöp girdide başlangıç şarjı, şarjsız eşyada undefined', () => {
    expect(sanitizeCharge(300, JET)).toBe(300);
    expect(sanitizeCharge(300.9, JET)).toBe(300);
    expect(sanitizeCharge('300', JET)).toBe(300);
    expect(sanitizeCharge(-5, JET)).toBe(0);
    expect(sanitizeCharge(1e9, JET)).toBe(1000);
    expect(sanitizeCharge(Infinity, JET)).toBe(500);
    expect(sanitizeCharge(NaN, JET)).toBe(500);
    expect(sanitizeCharge(undefined, JET)).toBe(500);
    expect(sanitizeCharge(null, JET)).toBe(500);
    expect(sanitizeCharge(true, JET)).toBe(500);
    expect(sanitizeCharge({}, JET)).toBe(500);
    expect(sanitizeCharge([5], JET)).toBe(500);
    expect(sanitizeCharge('__proto__', JET)).toBe(500);
    expect(sanitizeCharge(7, 'item:kazma_demir')).toBeUndefined();
    expect(sanitizeCharge(7, 'yok')).toBeUndefined();
  });

  it('yuva yardımcıları: ekleme/çekme sınırlı ve tamsayı', () => {
    const s = { item: JET, count: 1, charge: 990 };
    expect(addChargeToSlot(s, 100)).toBe(10);
    expect(s.charge).toBe(1000);
    expect(addChargeToSlot(s, 5)).toBe(0);
    expect(drainSlot(s, 250.2)).toBe(251);
    expect(s.charge).toBe(749);
    expect(drainSlot(s, 5000)).toBe(749);
    expect(s.charge).toBe(0);
    expect(drainSlot(s, 5)).toBe(0);
    expect(addChargeToSlot({ item: 'item:kazma_demir', count: 1 }, 5)).toBe(0);
    expect(drainSlot(null, 5)).toBe(0);
    expect(chargeOf({ item: JET, count: 1 })).toBe(0);
    expect(chargeFraction({ item: JET, count: 1, charge: 250 })).toBe(0.25);
    expect(slotMax(null)).toBe(0);
  });
});

describe('techCharge: envanter entegrasyonu', () => {
  it('yeni eşya başlangıç şarjıyla gelir; yığınlanmaz; addStack/setSlot şarj taşır ve kırpar', () => {
    const inv = new Inventory();
    expect(inv.add(JET, 2)).toBe(0);
    expect(inv.slots[0]).toEqual({ item: JET, count: 1, charge: 500 });
    expect(inv.slots[1]).toEqual({ item: JET, count: 1, charge: 500 });
    inv.addStack(JET, 1, undefined, undefined, 123);
    expect(inv.slots[2].charge).toBe(123);
    inv.addStack(JET, 1, undefined, undefined, 99999);
    expect(inv.slots[3].charge).toBe(1000);
    inv.addStack(JET, 1, undefined, undefined, -9);
    expect(inv.slots[4].charge).toBe(0);
    expect(inv.setSlot(5, 'item:tarayıcı', 1, undefined, undefined, 55)).toBe(true);
    expect(inv.slots[5].charge).toBe(55);
    expect(inv.setSlot(6, 'item:kazma_demir', 1)).toBe(true);
    expect(inv.slots[6].charge).toBeUndefined();
    expect(inv.count(JET)).toBe(5);
    // yığınlanmayan: moveStack takas eder, birleştirmez
    expect(inv.moveStack(2, 3)).toBe(true);
    expect(inv.slots[2].charge).toBe(1000);
    expect(inv.slots[3].charge).toBe(123);
    expect(inv.split(2)).toBe(-1);
  });

  it('drop / takeFromSlot / list / snapshot şarjı korur', () => {
    const inv = new Inventory();
    inv.addStack('item:kazma_elektrikli', 1, undefined, undefined, 321);
    const snap = inv.snapshot().slots[0];
    expect(snap.charge).toBe(321);
    expect(snap.maxCharge).toBe(800);
    expect(inv.list()[0].charge).toBe(321);
    const t = inv.takeFromSlot(0, 1);
    expect(t).toMatchObject({ item: 'item:kazma_elektrikli', count: 1, charge: 321 });
    expect(inv.slots[0]).toBeNull();
    inv.addStack('item:tarayıcı', 1, undefined, undefined, 77);
    expect(inv.drop(0)).toMatchObject({ charge: 77 });
  });

  it('JSON gidiş-dönüş: kısa biçim [item,1,dur|0,ench|0,charge]; eski biçimler çalışır; çöp şarj temizlenir', () => {
    const inv = new Inventory();
    inv.addStack(JET, 1, undefined, undefined, 640);
    inv.add('item:kazma_demir');
    inv.addStack(SHIELD_ITEM_KEYS[1], 1, 500, undefined, 111);
    const json = JSON.parse(JSON.stringify(inv.toJSON()));
    expect(json.slots[0]).toEqual([JET, 1, 0, 0, 640]);
    expect(json.slots[1]).toEqual(['item:kazma_demir', 1, 250]);
    expect(json.slots[2]).toEqual([SHIELD_ITEM_KEYS[1], 1, 500, 0, 111]);
    const back = new Inventory().fromJSON(json);
    expect(back.slots[0].charge).toBe(640);
    expect(back.slots[2]).toMatchObject({ dur: 500, charge: 111 });
    expect(back.toJSON()).toEqual(json);
    // eski kayıt: şarjsız jetpack → başlangıç şarjı
    const legacy = new Inventory().fromJSON({ slots: [[JET, 1]] });
    expect(legacy.slots[0].charge).toBe(500);
    // nesne biçimi
    const obj = new Inventory().fromJSON({ slots: [{ item: JET, count: 1, charge: -3 }, { item: JET, count: 9, charge: 1e9 }] });
    expect(obj.slots[0].charge).toBe(0);
    expect(obj.slots[1]).toEqual({ item: JET, count: 1, charge: 1000 });
    // saldırgan şarj değerleri
    const evil = [[JET, 1, 0, 0, '__proto__'], [JET, 1, 0, 0, {}], [JET, 1, 0, 0, [1]], [JET, 1, 0, '__proto__', NaN], [JET, 1, 'x', 5, null],
      [SHIELD_ITEM_KEYS[0], 1, 1e12, { koruma: 99 }, 1e12]];
    const e = new Inventory().fromJSON({ slots: evil });
    e.slots.forEach((s) => {
      if (s) {
        expect(Number.isInteger(s.charge)).toBe(true);
        expect(s.charge).toBeGreaterThanOrEqual(0);
        expect(s.charge).toBeLessThanOrEqual(maxCharge(s.item));
        if (s.ench) expect(s.ench.koruma).toBeLessThanOrEqual(4); // büyü sınırları magicEnchant'ta kırpılır
      }
    });
    expect(Object.keys({}).length).toBe(0); // prototip kirlenmedi
    expect(({}).charge).toBeUndefined();
  });

  it('zırh: kalkan parçası giyilince şarjı korunur; hasar hesabı için zırh puanı normal', () => {
    const inv = new Inventory();
    inv.addStack(SHIELD_ITEM_KEYS[1], 1, undefined, undefined, 200);
    expect(inv.equip(0)).toBe(true);
    expect(inv.armor[1].charge).toBe(200);
    expect(inv.armorDefense()).toBe(8);
    expect(armorWith(inv, 'kalkan')).toHaveLength(1);
    expect(inv.unequip(1)).toBe(true);
    expect(inv.slots[0].charge).toBe(200);
  });

  it('giyili zırh JSON: yalnız doğru yuvaya yerleşir (kafa parçası göğüs yuvasına konmaz), şarj korunur', () => {
    const inv = new Inventory();
    inv.addStack(SHIELD_ITEM_KEYS[0], 1, undefined, undefined, 90);
    inv.equip(0);
    const json = JSON.parse(JSON.stringify(inv.toJSON()));
    expect(json.armor[0][4]).toBe(90);
    const bad = JSON.parse(JSON.stringify(json));
    bad.armor[1] = bad.armor[0];
    bad.armor[0] = 0;
    const back = new Inventory().fromJSON(bad);
    expect(back.armor[1]).toBeNull();
    expect(new Inventory().fromJSON(json).armor[0].charge).toBe(90);
  });

  it('consumeHeldCharge: yeterliyse true; yetmezse kalanı tüketir ve false; şarjsız/yaratıcı mod', () => {
    const inv = new Inventory();
    inv.addStack('item:kazma_elektrikli', 1, undefined, undefined, 3);
    expect(consumeHeldCharge(inv, 2)).toBe(true);
    expect(inv.held().charge).toBe(1);
    expect(consumeHeldCharge(inv, 2)).toBe(false);
    expect(inv.held().charge).toBe(0);
    expect(consumeHeldCharge(inv, 1)).toBe(false);
    inv.slots[0] = { item: 'item:kazma_demir', count: 1, dur: 250 };
    expect(consumeHeldCharge(inv, 1)).toBe(false);
    const cre = new Inventory({ infinite: true });
    cre.addStack('item:kazma_elektrikli', 1, undefined, undefined, 5);
    expect(consumeHeldCharge(cre, 100)).toBe(true);
    expect(cre.held().charge).toBe(5);
  });

  it('chargeInventory: en boş oran önce, bütçe aşılmaz; onlyHeld/kinds süzgeci; zırh dahil', () => {
    const inv = new Inventory();
    inv.addStack(JET, 1, undefined, undefined, 900); // oran 0,9
    inv.addStack('item:tarayıcı', 1, undefined, undefined, 40); // 0,1
    inv.addStack('item:kazma_elektrikli', 1, undefined, undefined, 400); // 0,5
    inv.addStack(SHIELD_ITEM_KEYS[1], 1, undefined, undefined, 0);
    inv.equip(3);
    expect(inventoryChargeNeed(inv)).toBe(100 + 360 + 400 + 250);
    expect(chargeInventory(inv, 0)).toBe(0);
    expect(chargeInventory(inv, -5)).toBe(0);
    const used = chargeInventory(inv, 500);
    expect(used).toBe(500);
    // tarayıcı (0,1) ve zırh (0) önce; sonra kazma...
    expect(inv.armor[1].charge).toBeGreaterThan(0);
    expect(inv.slots[1].charge).toBeGreaterThan(40);
    expect(inv.slots[0].charge).toBeLessThanOrEqual(1000);
    const total = inventoryChargeNeed(inv);
    expect(total).toBe(100 + 360 + 400 + 250 - 500);
    expect(chargeInventory(inv, 1e6)).toBe(total);
    expect(inventoryChargeNeed(inv)).toBe(0);
    expect(chargeInventory(inv, 100)).toBe(0);
    const only = new Inventory();
    only.addStack(JET, 1, undefined, undefined, 0);
    only.addStack('item:tarayıcı', 1, undefined, undefined, 0);
    only.selected = 1;
    expect(chargeInventory(only, 50, { onlyHeld: true })).toBe(50);
    expect(only.slots[0].charge).toBe(0);
    expect(only.slots[1].charge).toBe(50);
    expect(chargeInventory(only, 50, { kinds: ['jetpack'] })).toBe(50);
    expect(only.slots[0].charge).toBe(50);
    expect(chargeInventory(null, 5)).toBe(0);
  });

  it('findCarried: çubukta bulur, çantada (hotbarOnly:false) bulur', () => {
    const inv = new Inventory();
    inv.addStack(JET, 1, undefined, undefined, 5);
    inv.slots[20] = { item: 'item:tarayıcı', count: 1, charge: 7 };
    expect(findCarried(inv, 'jetpack').index).toBe(0);
    expect(findCarried(inv, 'scanner')).toBeNull();
    expect(findCarried(inv, 'scanner', { hotbarOnly: false }).index).toBe(20);
    expect(findCarried(null, 'jetpack')).toBeNull();
  });

  it('techDescribe: şarj satırı + tür açıklaması; şarjsızda boş; metinler Türkçe', () => {
    expect(techDescribe('item:kazma_demir')).toEqual([]);
    expect(techDescribe(null)).toEqual([]);
    const l = techDescribe({ item: JET, count: 1, charge: 250 });
    expect(l[0]).toBe('Yakıt: 250 / 1000 EU');
    expect(l.join(' ')).toContain('zıplamayı');
    expect(techDescribe({ item: JET, count: 1, charge: 0 }).join(' ')).toContain('Enerji Hücresiyle doldur');
    expect(techDescribe({ item: 'item:portal_tabancası', count: 1, charge: 12 })[0]).toBe('Portal: 12 / 24');
    expect(techDescribe({ item: 'item:kazma_elektrikli', count: 1, charge: 0 }).join(' ')).toContain('Pil Bankası');
    expect(techDescribe(SHIELD_ITEM_KEYS[2])[0]).toBe('Kalkan: 125 / 250 EU'); // anahtar: başlangıç şarjı
  });
});

describe('techCharge: kayıt, sandık, yer eşyası, ölüm', () => {
  it('sandık kodlama/çözme şarjı korur ve çöp şarjı kırpar', () => {
    const slots = [
      { item: JET, count: 1, charge: 123 },
      { item: 'item:kazma_elektrikli', count: 1, charge: 1e9 },
      { item: SHIELD_ITEM_KEYS[0], count: 1, dur: 40, charge: 77 },
      { item: 'item:elma', count: 3 },
      { item: JET, count: 5, charge: 'x' },
    ];
    const enc = encodeChests(new Map([['1,60,1', slots]]));
    expect(enc['1,60,1'][0]).toEqual([JET, 1, 0, 0, 123]);
    expect(enc['1,60,1'][1][4]).toBe(800);
    expect(enc['1,60,1'][2]).toEqual([SHIELD_ITEM_KEYS[0], 1, 40, 0, 77]);
    expect(enc['1,60,1'][4][4]).toBe(500);
    const dec = decodeChests(JSON.parse(JSON.stringify(enc)));
    const d = dec['1,60,1'];
    expect(d[0]).toEqual({ item: JET, count: 1, charge: 123 });
    expect(d[2]).toMatchObject({ dur: 40, charge: 77 });
    expect(d[3]).toEqual({ item: 'item:elma', count: 3 });
    expect(encodeChests(new Map([['1,60,1', d]]))).toEqual(enc);
  });

  it('cleanDrop (yer eşyası kaydı) şarjı korur', () => {
    const d = cleanDrop({
      item: 'item:tarayıcı', count: 5, x: 1, y: 2, z: 3, charge: 99,
    });
    expect(d.charge).toBe(99);
    expect(d.count).toBe(1);
    expect(cleanDrop({
      item: 'item:tarayıcı', x: 1, y: 2, z: 3, charge: 99999,
    }).charge).toBe(400);
    expect(cleanDrop({
      item: 'item:kazma_demir', x: 1, y: 2, z: 3, charge: 5,
    }).charge).toBeUndefined();
    expect(cleanInventoryJson({ slots: [[JET, 1, 0, 0, 5], 0, ['yok', 1]], armor: [] }).slots[2]).toBe(0);
  });

  it('yerdeki eşya şarjı taşır: spawnItem → toplama (pickup 5. parametre) → kayıt', () => {
    const em = new EntityManager({ world: makeWorld(), seed: 3 });
    const e = spawnItem(em, JET, 1, 0, 60, 0, { charge: 321 });
    expect(e.charge).toBe(321);
    expect(spawnItem(em, 'item:kazma_demir', 1, 0, 60, 0, { charge: 5 }).charge).toBeUndefined();
    expect(spawnItem(em, JET, 1, 0, 60, 0, { charge: 'çöp' }).charge).toBe(500);
    const got = [];
    e.delay = 0;
    updateItems(em, 0.1, { x: 0, y: 59.5, z: 0, h: 1.8 }, { pickup: (item, count, dur, ench, charge) => { got.push({ item, count, charge }); return 0; } });
    expect(got.some((g) => g.item === JET && g.charge === 321)).toBe(true);
    const em2 = new EntityManager({ world: makeWorld(), seed: 4 });
    dropLoot(em2, [{ item: JET, count: 1, charge: 42 }], 0, 60, 0);
    expect(Array.from(em2.items.values())[0].charge).toBe(42);
    const ser = collectEntities({ drops: Array.from(em2.items.values()) }, [0, 60, 0]);
    expect(ser.drops[0].charge).toBe(42);
  });

  it('ölümde şarjlı eşyalar şarjıyla düşer', () => {
    const inv = new Inventory();
    inv.addStack(JET, 1, undefined, undefined, 222);
    inv.addStack(SHIELD_ITEM_KEYS[3], 1, 100, undefined, 33);
    inv.equip(1);
    const sv = createSurvival();
    const d = collectDeathDrops(sv, inv, {});
    const jet = d.drops.find((x) => x.item === JET);
    expect(jet.charge).toBe(222);
    const sh = d.drops.find((x) => x.item === SHIELD_ITEM_KEYS[3]);
    expect(sh.charge).toBe(33);
    expect(sh.dur).toBe(100);
  });

  it('macera kaydı: teknoloji durumu ve şarjlı eşyalar serializeGame/deserializeGame/applyGame ile gidiş-dönüş yapar', () => {
    const inv = new Inventory();
    inv.addStack(JET, 1, undefined, undefined, 640);
    const tech = new TechState({ seed: 5 });
    tech.restore({
      v: 1, tm: 12.5, m: {
        '0,60,0': { t: 'pil', stored: 2500 },
        '1,60,0': { t: 'jenerator', fuel: { item: 'item:kömür', count: 3 }, burnT: 10, burnTotal: 40 },
        '5,60,5': { t: 'isinlayici', freq: '0123', buf: 100 },
      },
      p: { mavi: [10, 61, 0, -1, 0, 0, 0, 1, 0] },
    });
    const chests = new Map([['2,60,2', [{ item: 'item:tarayıcı', count: 1, charge: 77 }]]]);
    const save = serializeGame({
      mode: 'macera', seed: 99, inventory: inv, tech, chests,
    });
    expect(save.player.tech.m['0,60,0']).toEqual({ t: 'pil', stored: 2500 });
    const text = JSON.stringify(save);
    const r = deserializeGame(text);
    expect(r.ok).toBe(true);
    expect(r.game.player.tech.m['1,60,0'].fuel).toEqual({ item: 'item:kömür', count: 3 });
    expect(r.game.player.inventory.slots[0]).toEqual([JET, 1, 0, 0, 640]);
    expect(r.game.chests['2,60,2'][0]).toEqual({ item: 'item:tarayıcı', count: 1, charge: 77 });
    const inv2 = new Inventory();
    const tech2 = new TechState();
    applyGame(r.game, { inventory: inv2, tech: tech2 });
    expect(inv2.slots[0].charge).toBe(640);
    expect(tech2.get(0, 60, 0).stored).toBe(2500);
    expect(tech2.get(5, 60, 5).freq).toBe('0123');
    expect(tech2.portals.mavi.nx).toBe(-1);
    expect(tech2.serialize()).toEqual(tech.serialize());
  });

  it('eski kayıtta (tech alanı yok) varsayılan kalır; bozuk tech alanı atılır/temizlenir', () => {
    const inv = new Inventory();
    const save = serializeGame({ mode: 'macera', seed: 1, inventory: inv });
    expect(save.player.tech).toBeUndefined();
    const r = deserializeGame(JSON.stringify(save));
    expect(r.ok).toBe(true);
    const t = new TechState();
    t.restore({ v: 1, m: { '1,1,1': { t: 'pil', stored: 5 } }, p: {} });
    applyGame(r.game, { inventory: new Inventory(), tech: t });
    expect(t.has(1, 1, 1)).toBe(true); // alan yoksa dokunulmaz
    const evil = JSON.parse(JSON.stringify(save));
    evil.player.tech = { m: { '__proto__': { t: 'pil' }, 'a,b,c': { t: 'pil' }, '0,0,0': { t: 'constructor' }, '9,9,9': { t: 'pil', stored: 'x' } }, p: 5 };
    const r2 = deserializeGame(JSON.stringify(evil));
    expect(r2.ok).toBe(true);
    expect(Object.keys(r2.game.player.tech.m)).toEqual(['9,9,9']);
    expect(r2.game.player.tech.m['9,9,9'].stored).toBe(0);
  });
});
