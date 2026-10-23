import { describe, expect, it } from 'vitest';
import { B, breakTime, getBlock, resolveDrops } from './blocks.js';
import { BUILDABLE_MAX } from './constants.js';
import { Inventory } from './inventory.js';
import { ITEM_LIST, itemByKey } from './items.js';
import { collectDeathDrops, createSurvival, armorReduction, setArmor } from './survival.js';
import { dropLoot, spawnItem, updateItems } from './entitiesItems.js';
import { createMagic } from './magic.js';
import { learnSpell } from './magicState.js';
import { createMods } from './magicMods.js';
import { addEffect } from './magicEffects.js';
import { applyGame, deserializeGame, serializeGame } from './save.js';
import { cleanDrop, decodeChests, encodeChests } from './saveSanitize.js';
import { mapReplacementId } from './saveMapIO.js';
import { makeEm, makePlayer, makeWorld } from './mobAITestKit.js';

const DT = 1 / 60;
const ENCH_SWORD = { keskinlik: 3, alev: 1 };

function swordInv(ench = ENCH_SWORD) {
  const inv = new Inventory();
  inv.setSlot(0, 'item:kılıç_demir', 1, 120, ench);
  return inv;
}

/* ================================================================================================
 * Envanter: büyüler taşınır, kayda gider, doğrulanır
 * ============================================================================================== */
describe('Envanter: ench korunur', () => {
  it('setSlot/addStack ench yazar; dayanıklılıksız eşyada ve geçersizde yazılmaz', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:kılıç_demir', 1, 100, { keskinlik: 3 });
    expect(inv.slotAt(0)).toEqual({ item: 'item:kılıç_demir', count: 1, dur: 100, ench: { keskinlik: 3 } });
    inv.setSlot(1, 'item:elma', 5, undefined, { keskinlik: 3 });
    expect(inv.slotAt(1)).toEqual({ item: 'item:elma', count: 5 });
    inv.setSlot(2, 'item:kılıç_demir', 1, 100, { verimlilik: 3 });
    expect(inv.slotAt(2).ench).toBeUndefined();
    expect(inv.addStack('item:kazma_demir', 1, 50, { verimlilik: 5, miknatis: 1 })).toBe(0);
    const i = inv.find('item:kazma_demir');
    expect(inv.slotAt(i).ench).toEqual({ verimlilik: 5, miknatis: 1 });
    expect(inv.slotAt(i).dur).toBe(50);
    // add() büyüsüz ekler
    inv.add('item:kazma_demir', 1);
    expect(inv.slotAt(inv.find('item:kazma_demir') + 0).ench).toEqual({ verimlilik: 5, miknatis: 1 });
    expect(inv.slots.filter((s) => s && s.item === 'item:kazma_demir').length).toBe(2);
  });

  it('büyülü eşya yığılmaz (aynı eşyanın büyülü/büyüsüz kopyaları ayrı yuvada)', () => {
    const inv = new Inventory();
    inv.addStack('item:kılıç_demir', 1, 100, { keskinlik: 1 });
    inv.add('item:kılıç_demir', 1);
    expect(inv.slots.filter((s) => s).length).toBe(2);
    expect(inv.count('item:kılıç_demir')).toBe(2);
    expect(inv.moveStack(0, 1)).toBe(true); // yer değiştirir, birleşmez
    expect(inv.slots.filter((s) => s).length).toBe(2);
    expect(inv.split(0)).toBe(-1);
  });

  it('swap / moveStack / equip / unequip / drop büyüyü taşır', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:çizme_demir', 1, 80, { hafif_adim: 2, koruma: 1 });
    inv.setSlot(5, 'item:kazma_demir', 1, 90, { verimlilik: 2 });
    inv.swap(0, 5);
    expect(inv.slotAt(5).ench).toEqual({ hafif_adim: 2, koruma: 1 });
    expect(inv.slotAt(0).ench).toEqual({ verimlilik: 2 });
    inv.moveStack(5, 9);
    expect(inv.slotAt(9).ench).toEqual({ hafif_adim: 2, koruma: 1 });
    expect(inv.slotAt(5)).toBeNull();
    expect(inv.equip(9)).toBe(true);
    expect(inv.armor[3].ench).toEqual({ hafif_adim: 2, koruma: 1 });
    expect(inv.unequip(3)).toBe(true);
    const idx = inv.find('item:çizme_demir');
    expect(inv.slotAt(idx).ench).toEqual({ hafif_adim: 2, koruma: 1 });
    const dropped = inv.drop(idx, 1);
    expect(dropped).toEqual({ item: 'item:çizme_demir', count: 1, dur: 80, ench: { hafif_adim: 2, koruma: 1 } });
    dropped.ench.koruma = 4; // kopya bağımsız
    expect(inv.slotAt(idx)).toBeNull();
  });

  it('adresli erişim: slotByAddr / setEnchant / takeFromSlot', () => {
    const inv = new Inventory();
    inv.setSlot(2, 'item:yay', 1, 300);
    expect(inv.slotByAddr(2)).toBe(inv.slotAt(2));
    expect(inv.slotByAddr('s2')).toBe(inv.slotAt(2));
    expect(inv.slotByAddr({ zone: 'slots', index: 2 })).toBe(inv.slotAt(2));
    expect(inv.slotByAddr('s3')).toBeNull();
    expect(inv.slotByAddr('a9')).toBeNull();
    expect(inv.slotByAddr('zz')).toBeNull();
    expect(inv.slotByAddr(-1)).toBeNull();
    expect(inv.slotByAddr(1.5)).toBeNull();
    expect(inv.slotByAddr(null)).toBeNull();
    expect(inv.setEnchant('s2', { guc: 3, keskinlik: 3 })).toBe(true);
    expect(inv.slotAt(2).ench).toEqual({ guc: 3 });
    expect(inv.setEnchant('s2', { keskinlik: 3 })).toBe(false); // uymuyor
    expect(inv.slotAt(2).ench).toEqual({ guc: 3 });
    expect(inv.setEnchant('s2', null)).toBe(true);
    expect(inv.slotAt(2).ench).toBeUndefined();
    inv.add('item:elma', 4);
    const ai = inv.find('item:elma');
    expect(inv.setEnchant(ai, { guc: 1 })).toBe(false);
    expect(inv.takeFromSlot(ai, 3)).toEqual({ item: 'item:elma', count: 3 });
    expect(inv.slotAt(ai).count).toBe(1);
    expect(inv.takeFromSlot(ai, 5).count).toBe(1);
    expect(inv.slotAt(ai)).toBeNull();
    expect(inv.takeFromSlot(ai, 1)).toBeNull();
    const cinv = new Inventory({ infinite: true });
    cinv.setSlot(0, 'item:elma', 4);
    cinv.takeFromSlot(0, 2);
    expect(cinv.slotAt(0).count).toBe(4);
  });

  it('toJSON biçimi geriye uyumlu: büyüsüz [item,count,dur], büyülü 4. eleman', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:kılıç_demir', 1, 120);
    inv.setSlot(1, 'item:kılıç_demir', 1, 90, { keskinlik: 2 });
    inv.setSlot(2, 'item:elma', 3);
    const j = inv.toJSON();
    expect(j.slots[0]).toEqual(['item:kılıç_demir', 1, 120]);
    expect(j.slots[1]).toEqual(['item:kılıç_demir', 1, 90, { keskinlik: 2 }]);
    expect(j.slots[2]).toEqual(['item:elma', 3]);
  });

  it('JSON gidiş-dönüş: tüm büyülenebilir eşyalar', () => {
    const inv = new Inventory({ size: 80 });
    let n = 0;
    ITEM_LIST.forEach((it) => {
      if (it.durability && n < 75) inv.setSlot(n++, it.key, 1, Math.max(1, Math.floor(it.durability / 2)), { dayaniklilik: 2 });
    });
    const back = new Inventory({ size: 80 }).fromJSON(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(back.toJSON()).toEqual(inv.toJSON());
    expect(back.slots.filter((s) => s && s.ench).length).toBeGreaterThan(40);
    back.slots.forEach((s) => { if (s && s.ench) expect(s.ench).toEqual({ dayaniklilik: 2 }); });
  });

  it('fromJSON saldırgan büyü verisini temizler (asla atmaz)', () => {
    const evil = [
      ['item:kılıç_demir', 1, 100, { keskinlik: 99, verimlilik: 3, bilinmeyen: 2 }],
      ['item:kılıç_demir', 1, 100, JSON.parse('{"__proto__":{"keskinlik":5},"keskinlik":-2}')],
      ['item:kılıç_demir', 1, 100, 'çöp'],
      ['item:kılıç_demir', 1, 100, [1, 2, 3]],
      ['item:elma', 3, undefined, { keskinlik: 3 }],
      { item: 'item:kazma_demir', count: 1, dur: 10, ench: { verimlilik: 2.7, servet: '3', alev: 1 } },
      { item: 'item:kazma_demir', count: 1, dur: 10, ench: JSON.parse('{"__proto__":{"verimlilik":5}}') },
      ['item:kılıç_demir', 1, 100, { alev: 2, buz: 2 }],
    ];
    const inv = new Inventory();
    expect(() => inv.fromJSON({ slots: evil })).not.toThrow();
    expect(inv.slots[0].ench).toEqual({ keskinlik: 5 });
    expect(inv.slots[1].ench).toBeUndefined();
    expect(inv.slots[2].ench).toBeUndefined();
    expect(inv.slots[3].ench).toBeUndefined();
    expect(inv.slots[4]).toEqual({ item: 'item:elma', count: 3 });
    expect(inv.slots[5].ench).toEqual({ verimlilik: 2, servet: 3 });
    expect(inv.slots[6].ench).toBeUndefined();
    expect(inv.slots[7].ench).toEqual({ alev: 2 });
    expect({}.keskinlik).toBeUndefined();
    expect({}.verimlilik).toBeUndefined();
  });

  it('snapshot ench taşır (bağımsız kopya)', () => {
    const inv = swordInv();
    const snap = inv.snapshot();
    expect(snap.slots[0].ench).toEqual(ENCH_SWORD);
    snap.slots[0].ench.keskinlik = 5;
    expect(inv.slotAt(0).ench.keskinlik).toBe(3);
    expect(snap.slots[1]).toBeNull();
  });

  it('craft/remove büyülü eşyayı da sayar; clone state geri alma ench korur', () => {
    const inv = new Inventory();
    inv.addStack('item:kazma_demir', 1, 90, { verimlilik: 2 });
    inv.add('item:sopa', 2);
    inv.add('item:demir_külçe', 1);
    // başarısız bir üretim (tezgah yok) envanteri değiştirmez
    expect(inv.craft('kazma_demir', [])).toBe(false);
    expect(inv.slotAt(0).ench).toEqual({ verimlilik: 2 });
    expect(inv.count('item:kazma_demir')).toBe(1);
    expect(inv.remove('item:kazma_demir', 1)).toBe(true);
    expect(inv.count('item:kazma_demir')).toBe(0);
  });
});

describe('Dayanıklılık büyüsü ve Koruma', () => {
  it('Dayanıklılık: aşınma azalır, belirlenimci', () => {
    const wear = (ench) => {
      const inv = new Inventory();
      inv.setSlot(0, 'item:kazma_demir', 1, 250, ench);
      for (let i = 0; i < 300; i++) inv.damageHeld(1);
      return 250 - (inv.held() ? inv.held().dur : 0);
    };
    expect(wear(undefined)).toBe(250); // 250'de kırılır
    const w3 = (() => {
      const inv = new Inventory();
      inv.setSlot(0, 'item:kazma_demir', 1, 250, { dayaniklilik: 3 });
      for (let i = 0; i < 400; i++) inv.damageHeld(1);
      return 250 - inv.held().dur;
    })();
    expect(w3).toBeGreaterThan(60);
    expect(w3).toBeLessThan(140); // beklenen ≈ 100 (1/4)
    const again = (() => {
      const inv = new Inventory();
      inv.setSlot(0, 'item:kazma_demir', 1, 250, { dayaniklilik: 3 });
      for (let i = 0; i < 400; i++) inv.damageHeld(1);
      return 250 - inv.held().dur;
    })();
    expect(again).toBe(w3);
    // seviye yükseldikçe daha az aşınır
    const w1 = (() => {
      const inv = new Inventory();
      inv.setSlot(0, 'item:kazma_demir', 1, 250, { dayaniklilik: 1 });
      for (let i = 0; i < 400; i++) inv.damageHeld(1);
      return 250 - inv.held().dur;
    })();
    expect(w1).toBeGreaterThan(w3);
    expect(w1).toBeLessThan(250);
  });

  it('damageArmor da Dayanıklılık uygular; kırılma sayısı', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:miğfer_deri', 1, 5, { dayaniklilik: 3 });
    inv.setSlot(1, 'item:göğüslük_deri', 1, 5);
    inv.equip(0);
    inv.equip(1);
    let broken = 0;
    for (let i = 0; i < 6; i++) broken += inv.damageArmor(1);
    expect(inv.armor[1]).toBeNull(); // büyüsüz parça kırıldı
    expect(broken).toBeGreaterThanOrEqual(1);
  });

  it('Koruma her seviyede +0,5 zırh puanı; savunma azaltmaya yansır', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:göğüslük_demir', 1, 100, { koruma: 4 });
    inv.setSlot(1, 'item:miğfer_demir', 1, 100);
    inv.equip(0);
    inv.equip(1);
    expect(inv.armorDefense()).toBe(6 + 2 + 2);
    const s = createSurvival();
    setArmor(s, inv.armorDefense());
    expect(s.armor).toBe(10);
    expect(armorReduction(s.armor)).toBeCloseTo(0.4, 5);
  });

  it('infinite envanter aşındırmaz', () => {
    const inv = new Inventory({ infinite: true });
    inv.setSlot(0, 'item:kazma_demir', 1, 3, { dayaniklilik: 1 });
    for (let i = 0; i < 20; i++) expect(inv.damageHeld(1)).toBe(false);
    expect(inv.held().dur).toBe(3);
  });
});

/* ================================================================================================
 * Kayıt
 * ============================================================================================== */
describe('Kayıt: ench ve büyü durumu', () => {
  function sampleState() {
    const inv = new Inventory();
    inv.setSlot(0, 'item:kılıç_elmas', 1, 700, { keskinlik: 4, geri_tepme: 2 });
    inv.setSlot(1, 'item:asa_buz', 1, 200, { mana_verimi: 2 });
    inv.setSlot(2, 'item:iksir_hiz', 3);
    inv.setSlot(3, 'item:miğfer_elmas', 1, 600, { su_solugu: 3, koruma: 2 });
    inv.equip(3);
    const magic = createMagic(777);
    magic.state.manaBonus = 40;
    magic.state.maxMana = 140;
    magic.state.mana = 91;
    learnSpell(magic.state, 'buz_mizragi');
    addEffect(magic.state.effects, 'hiz', 1, 120);
    magic.state.enchantSeed = 987654;
    magic.state.enchantCount = 6;
    magic.brew.restore({ '5,6,7': ['guc', 3, 12, 30, 0] });
    const chests = new Map([['1,2,3', [
      { item: 'item:kazma_demir', count: 1, dur: 99, ench: { verimlilik: 4, servet: 2 } }, null, { item: 'item:elma', count: 7 },
    ]]]);
    const drops = [{ item: 'item:kürek_taş', count: 1, dur: 40, ench: { miknatis: 1, verimlilik: 1 }, x: 1, y: 2, z: 3 }];
    return { inv, magic, chests, drops };
  }

  it('serializeGame → JSON → deserializeGame → applyGame: her şey geri gelir', () => {
    const { inv, magic, chests, drops } = sampleState();
    const save = serializeGame({
      seed: 4242, mode: 'macera', inventory: inv, chests, magic, entities: { entities: [], drops },
    });
    expect(save.player.magic).toBeTruthy();
    const json = JSON.parse(JSON.stringify(save));
    const r = deserializeGame(json);
    expect(r.ok).toBe(true);
    expect(r.game.player.magic).toBeTruthy();
    const inv2 = new Inventory();
    const magic2 = createMagic(0);
    const out = applyGame(r.game, { inventory: inv2, magic: magic2 });
    expect(inv2.toJSON()).toEqual(inv.toJSON());
    expect(inv2.slotAt(0).ench).toEqual({ keskinlik: 4, geri_tepme: 2 });
    expect(inv2.armor[0].ench).toEqual({ su_solugu: 3, koruma: 2 });
    expect(magic2.state.manaBonus).toBe(40);
    expect(magic2.state.enchantSeed).toBe(987654);
    expect(magic2.state.knownSpells).toEqual(['buz_mizragi']);
    expect(magic2.state.effects[0].key).toBe('hiz');
    expect(magic2.brew.get({ x: 5, y: 6, z: 7 })).toMatchObject({ recipeId: 'guc', bottles: 3 });
    expect(out.chests.get('1,2,3')[0]).toEqual({ item: 'item:kazma_demir', count: 1, dur: 99, ench: { verimlilik: 4, servet: 2 } });
    expect(out.chests.get('1,2,3')[2]).toEqual({ item: 'item:elma', count: 7 });
    expect(out.drops[0]).toMatchObject({ item: 'item:kürek_taş', dur: 40, ench: { miknatis: 1, verimlilik: 1 } });
  });

  it('eski kayıt (magic alanı yok): varsayılan büyü durumu, ench yok, hata yok', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:kılıç_demir', 1, 50);
    const save = serializeGame({ seed: 1, mode: 'macera', inventory: inv });
    expect(save.player.magic).toBeUndefined();
    const r = deserializeGame(JSON.stringify(save));
    expect(r.ok).toBe(true);
    expect(r.game.player.magic).toBeNull();
    const magic = createMagic(0);
    magic.state.mana = 30;
    applyGame(r.game, { inventory: new Inventory(), magic });
    expect(magic.state.mana).toBe(30); // dokunulmadı
  });

  it('saldırgan kayıt: sandık/yere düşen/envanter ench temizlenir, prototip kirlenmez', () => {
    const evilEnch = JSON.parse('{"__proto__":{"keskinlik":5},"keskinlik":99,"bilinmeyen":3}');
    const enc = encodeChests({
      '0,0,0': [{ item: 'item:kılıç_demir', count: 1, dur: 9, ench: evilEnch }, { item: 'item:elma', count: 2, ench: { keskinlik: 2 } }],
    });
    expect(enc['0,0,0'][0]).toEqual(['item:kılıç_demir', 1, 9, { keskinlik: 5 }]);
    expect(enc['0,0,0'][1]).toEqual(['item:elma', 2]);
    const dec = decodeChests({ '0,0,0': [['item:kılıç_demir', 1, 9, evilEnch], ['item:kazma_demir', 1, 9, { keskinlik: 3 }], ['item:elma', 2, 0, { guc: 2 }]] });
    expect(dec['0,0,0'][0].ench).toEqual({ keskinlik: 5 });
    expect(dec['0,0,0'][1].ench).toBeUndefined(); // kazmada Keskinlik yok
    expect(dec['0,0,0'][2]).toEqual({ item: 'item:elma', count: 2 });
    expect(cleanDrop({ item: 'item:kılıç_demir', count: 1, dur: 9, ench: evilEnch, x: 1, y: 2, z: 3 }).ench).toEqual({ keskinlik: 5 });
    expect(cleanDrop({ item: 'item:elma', count: 1, ench: { guc: 2 }, x: 1, y: 2, z: 3 }).ench).toBeUndefined();
    expect({}.keskinlik).toBeUndefined();
    // bütün kayıt hattı
    const save = serializeGame({ seed: 1, mode: 'macera', inventory: new Inventory() });
    save.player.inv = {
      v: 1, size: 36, hotbar: 9, selected: 0, heat: 0, armor: [],
      slots: [['item:kılıç_demir', 1, 100, evilEnch], ['item:kazma_demir', 1, 100, 'x']],
    };
    save.player.magic = JSON.parse('{"state":{"__proto__":{"mb":90},"mb":9999,"mana":-5,"spells":["yok","ates_topu"]},"brew":{"1,2,3":["hiz",9,-1,30,0],"x":5}}');
    const r = deserializeGame(JSON.stringify(save));
    expect(r.ok).toBe(true);
    const inv = new Inventory();
    const magic = createMagic(0);
    applyGame(r.game, { inventory: inv, magic });
    expect(inv.slotAt(0).ench).toEqual({ keskinlik: 5 });
    expect(inv.slotAt(1).ench).toBeUndefined();
    expect(magic.state.manaBonus).toBe(100);
    expect(magic.state.mana).toBeGreaterThanOrEqual(0);
    expect(magic.state.knownSpells).toEqual(['ates_topu']);
    expect(magic.brew.list()).toHaveLength(1);
    expect({}.mb).toBeUndefined();
  });

  it('ölüm bırakmaları ench taşır; kolay modda eşyalar kalır', () => {
    const inv = swordInv();
    const s = createSurvival();
    s.dead = true;
    const d = collectDeathDrops(s, inv, {});
    expect(d.drops[0]).toEqual({ item: 'item:kılıç_demir', count: 1, dur: 120, ench: ENCH_SWORD });
    d.drops[0].ench.keskinlik = 1;
    expect(inv.slotAt(0).ench.keskinlik).toBe(3); // kopya
  });

  it('yaratıcı harita dışa aktarımı büyü bloklarını yasaklı sayar', () => {
    expect(mapReplacementId(B.MAGIC_TABLE)).toBeLessThanOrEqual(BUILDABLE_MAX);
    expect(mapReplacementId(B.ALCHEMY_CAULDRON)).toBeLessThanOrEqual(BUILDABLE_MAX);
  });
});

/* ================================================================================================
 * Yerdeki eşyalar
 * ============================================================================================== */
describe('Yerdeki eşya: ench', () => {
  it('spawnItem/dropLoot ench taşır (temizlenir); toplamada pickup(item,count,dur,ench); serialize/restore', () => {
    const w = makeWorld();
    const { em } = makeEm(w);
    const e = spawnItem(em, 'item:kılıç_demir', 1, 0, 1, 0, { dur: 77, ench: { keskinlik: 2, verimlilik: 4 }, delay: 0 });
    expect(e.ench).toEqual({ keskinlik: 2 });
    expect(spawnItem(em, 'item:elma', 1, 0, 1, 0, { ench: { keskinlik: 2 } }).ench).toBeUndefined();
    dropLoot(em, [{ item: 'item:kazma_demir', count: 1, dur: 5, ench: { verimlilik: 3 } }], 3, 1, 3);
    const dropped = Array.from(em.items.values()).find((x) => x.x === 3);
    expect(dropped.ench).toEqual({ verimlilik: 3 });
    // kaydet / yükle
    const data = JSON.parse(JSON.stringify(em.serialize()));
    const kit2 = makeEm(w);
    kit2.em.restore(data);
    const back = Array.from(kit2.em.items.values()).find((x) => x.item === 'item:kılıç_demir');
    expect(back.ench).toEqual({ keskinlik: 2 });
    expect(back.dur).toBe(77);
    // toplama
    const calls = [];
    const p = makePlayer(0, 1, 0);
    updateItems(em, 0.1, p, { pickup: (item, count, dur, ench) => { calls.push({ item, count, dur, ench }); return 0; } });
    expect(calls.find((c) => c.item === 'item:kılıç_demir')).toEqual({ item: 'item:kılıç_demir', count: 1, dur: 77, ench: { keskinlik: 2 } });
  });

  it('bozuk ench kayıttan geri yüklenince temizlenir', () => {
    const w = makeWorld();
    const { em } = makeEm(w);
    em.restore({
      items: [{
        id: 1, item: 'item:kılıç_demir', count: 1, dur: 5, x: 0, y: 1, z: 0, ench: JSON.parse('{"__proto__":{"a":1},"keskinlik":50,"x":1}'),
      }],
    });
    const it = Array.from(em.items.values())[0];
    expect(it.ench).toEqual({ keskinlik: 5 });
  });
});

/* ================================================================================================
 * Bloklar: Verimlilik, İpek Dokunuş, Servet
 * ============================================================================================== */
describe('Bloklar: mods', () => {
  it('Verimlilik yalnız eşleşen aletle kırmayı hızlandırır', () => {
    const base = breakTime(B.STONE, 'item:kazma_demir');
    const m = createMods();
    m.digMul = 2.5;
    expect(breakTime(B.STONE, 'item:kazma_demir', m)).toBeCloseTo(base / 2.5, 5);
    expect(breakTime(B.STONE, 'item:kazma_demir', null)).toBe(base);
    // yanlış alet (balta) eşleşmez
    expect(breakTime(B.STONE, 'item:balta_demir', m)).toBe(breakTime(B.STONE, 'item:balta_demir'));
    expect(breakTime(B.BEDROCK, 'item:kazma_demir', m)).toBe(Infinity);
    expect(breakTime(B.TORCH, 'item:kazma_demir', m)).toBe(0);
    m.digMul = 0;
    expect(breakTime(B.STONE, 'item:kazma_demir', m)).toBe(base); // geçersiz çarpan yok sayılır
  });

  it('İpek Dokunuş: taş, çimen, cevher kendi hâlinde düşer (hasat kuralı geçerli)', () => {
    const m = createMods();
    m.silkTouch = true;
    expect(resolveDrops(B.STONE, null, 'item:kazma_demir')).toEqual([{ item: 'blok:kırıktaş', count: 1 }]);
    expect(resolveDrops(B.STONE, null, 'item:kazma_demir', m)).toEqual([{ item: 'blok:taş', count: 1 }]);
    expect(resolveDrops(B.GRASS, null, 'item:kürek_demir', m)).toEqual([{ item: 'blok:çimen', count: 1 }]);
    expect(resolveDrops(B.DIAMOND_ORE, null, 'item:kazma_demir', m)).toEqual([{ item: 'blok:elmas_cevheri', count: 1 }]);
    expect(resolveDrops(B.DIAMOND_ORE, null, 'item:kazma_ahşap', m)).toEqual([]); // yetersiz alet
    expect(resolveDrops(B.BEDROCK, null, 'item:kazma_kuantum', m)).toEqual([]);
    expect(resolveDrops(B.WATER, null, 'item:kazma_demir', m)).toEqual([]);
    // eşya olarak var
    expect(itemByKey('blok:elmas_cevheri')).toBeTruthy();
  });

  it('Servet: cevher adedi 1..L+1 kat; taş gibi cevher olmayanlarda etkisiz; rng yoksa etkisiz', () => {
    const m = createMods();
    m.fortune = 3;
    let max = 0;
    let min = 99;
    for (let i = 0; i < 200; i++) {
      let k = i * 7 + 1;
      const rng = () => {
        k = (k * 1103515245 + 12345) % 2147483648;
        return k / 2147483648;
      };
      const d = resolveDrops(B.COAL_ORE, rng, 'item:kazma_demir', m);
      const c = d.find((x) => x.item === 'item:kömür').count;
      max = Math.max(max, c);
      min = Math.min(min, c);
    }
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeGreaterThan(4); // 1–2 × 4'e kadar
    expect(max).toBeLessThanOrEqual(8);
    const noFortune = resolveDrops(B.COAL_ORE, () => 0.99, 'item:kazma_demir');
    expect(noFortune[0].count).toBe(2);
    expect(resolveDrops(B.COAL_ORE, null, 'item:kazma_demir', m)[0].count).toBe(1);
    expect(resolveDrops(B.DIRT, () => 0.9, 'item:kürek_demir', m)).toEqual([{ item: 'blok:toprak', count: 1 }]);
  });

  it('varsayılan davranış değişmedi (mods verilmeyince)', () => {
    expect(resolveDrops(B.COAL_ORE, () => 0, 'item:kazma_demir')).toEqual([{ item: 'item:kömür', count: 1 }]);
    expect(resolveDrops(B.GRASS, null, 'item:kürek_demir')).toEqual([{ item: 'blok:toprak', count: 1 }]);
  });

  it('Büyü Masası / Kazan kırılınca kendi eşyalarını düşürür', () => {
    expect(resolveDrops(B.MAGIC_TABLE, null, 'item:kazma_demir')).toEqual([{ item: 'blok:büyü_masası', count: 1 }]);
    expect(resolveDrops(B.ALCHEMY_CAULDRON, null, 'item:kazma_demir')).toEqual([{ item: 'blok:simya_kazanı', count: 1 }]);
    expect(getBlock(B.MAGIC_TABLE).hardness).toBeGreaterThan(0);
  });
});
