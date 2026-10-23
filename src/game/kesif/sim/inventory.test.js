import { describe, expect, it } from 'vitest';
import { B, PLACEABLE_IDS } from './blocks.js';
import { ITEMS, ITEM_LIST, getRecipe } from './items.js';
import { Inventory, creativeBlockKeys, creativeInventory } from './inventory.js';
import { seededRandom } from './rng.js';

describe('Inventory temel', () => {
  it('varsayılan boyutlar ve boş başlangıç', () => {
    const inv = new Inventory();
    expect(inv.size).toBe(36);
    expect(inv.hotbarSize).toBe(9);
    expect(inv.armorSize).toBe(4);
    expect(inv.slots).toHaveLength(36);
    expect(inv.armor).toHaveLength(4);
    expect(inv.isEmpty()).toBe(true);
    expect(inv.selected).toBe(0);
    expect(inv.held()).toBeNull();
    expect(inv.firstEmpty()).toBe(0);
    const small = new Inventory({ size: 10, hotbar: 4, armor: 2 });
    expect(small.size).toBe(10);
    expect(small.hotbarSize).toBe(4);
    expect(small.armorSize).toBe(2);
  });

  it('add: yığınlar birleşir, taşan kalan döner', () => {
    const inv = new Inventory({ size: 3, hotbar: 3 });
    expect(inv.add('blok:taş', 100)).toBe(0);
    expect(inv.slots[0]).toEqual({ item: 'blok:taş', count: 64 });
    expect(inv.slots[1]).toEqual({ item: 'blok:taş', count: 36 });
    expect(inv.count('blok:taş')).toBe(100);
    expect(inv.add('blok:taş', 28)).toBe(0); // 36+28 = 64
    expect(inv.slots[1].count).toBe(64);
    expect(inv.add('blok:taş', 100)).toBe(100 - 64); // tek boş yuva kaldı
    expect(inv.count('blok:taş')).toBe(192);
    expect(inv.add('blok:taş', 5)).toBe(5);
    expect(inv.add('blok:toprak', 1)).toBe(1);
  });

  it('add: bilinmeyen eşya eklenmez; geçersiz adetler', () => {
    const inv = new Inventory();
    expect(inv.add('item:yok', 3)).toBe(3);
    expect(inv.add('blok:taş', 0)).toBe(0);
    expect(inv.add('blok:taş', -4)).toBe(0);
    expect(inv.add('blok:taş', NaN)).toBe(0);
    expect(inv.add('blok:taş', 2.9)).toBe(0);
    expect(inv.count('blok:taş')).toBe(2);
    expect(inv.add('blok:tas', 1)).toBe(0); // ASCII takma ad
    expect(inv.count('blok:taş')).toBe(3);
  });

  it('dayanıklı eşya yığılmaz, her biri tam dayanıklılıkla gelir', () => {
    const inv = new Inventory();
    expect(inv.add('item:kazma_demir', 3)).toBe(0);
    expect(inv.slots.filter(Boolean)).toHaveLength(3);
    inv.slots.filter(Boolean).forEach((s) => {
      expect(s.count).toBe(1);
      expect(s.dur).toBe(250);
    });
    expect(inv.count('item:kazma_demir')).toBe(3);
    const full = new Inventory({ size: 2, hotbar: 2 });
    expect(full.add('item:yay', 5)).toBe(3);
  });

  it('addStack dayanıklılığı korur', () => {
    const inv = new Inventory();
    inv.addStack('item:kazma_demir', 1, 40);
    expect(inv.slots[0].dur).toBe(40);
    inv.addStack('item:kazma_demir', 1, 99999);
    expect(inv.slots[1].dur).toBe(250);
    expect(inv.addStack('blok:taş', 5)).toBe(0);
  });

  it('hotbar önce dolar', () => {
    const inv = new Inventory();
    for (let i = 0; i < 9; i++) inv.add('item:kazma_taş');
    expect(inv.slots.slice(0, 9).every(Boolean)).toBe(true);
    inv.add('blok:toprak');
    expect(inv.slots[9].item).toBe('blok:toprak');
  });

  it('remove hepsi ya da hiçbiri, sondan tüketir', () => {
    const inv = new Inventory();
    inv.add('blok:taş', 100);
    expect(inv.remove('blok:taş', 101)).toBe(false);
    expect(inv.count('blok:taş')).toBe(100);
    expect(inv.remove('blok:taş', 50)).toBe(true);
    expect(inv.slots[1]).toBeNull(); // sondaki yığın önce boşaldı
    expect(inv.slots[0].count).toBe(64 - 14);
    expect(inv.remove('blok:taş', 0)).toBe(true);
    expect(inv.remove('item:yok', 1)).toBe(false);
    expect(inv.remove('blok:taş', 50)).toBe(true);
    expect(inv.isEmpty()).toBe(true);
  });

  it('count/has/find/list', () => {
    const inv = new Inventory();
    inv.add('blok:meşe_tahta', 6);
    inv.add('item:sopa', 3);
    expect(inv.has([{ item: 'blok:meşe_tahta', count: 4 }, { item: 'item:sopa', count: 3 }])).toBe(true);
    expect(inv.has([['blok:meşe_tahta', 7]])).toBe(false);
    expect(inv.has([])).toBe(true);
    expect(inv.find('item:sopa')).toBe(1);
    expect(inv.find('item:yok')).toBe(-1);
    expect(inv.count('item:yok')).toBe(0);
    expect(inv.list()).toEqual([
      { index: 0, item: 'blok:meşe_tahta', count: 6 },
      { index: 1, item: 'item:sopa', count: 3 },
    ]);
    expect(inv.canAdd('blok:taş', 64 * 34)).toBe(true);
    expect(inv.canAdd('blok:taş', 64 * 34 + 1)).toBe(false);
    expect(inv.canAdd('blok:meşe_tahta', 64 * 34 + 58)).toBe(true);
  });

  it('swap, moveStack, split', () => {
    const inv = new Inventory();
    inv.add('blok:taş', 10);
    inv.add('item:kazma_taş', 1);
    expect(inv.swap(0, 1)).toBe(true);
    expect(inv.slots[0].item).toBe('item:kazma_taş');
    expect(inv.swap(0, 0)).toBe(false);
    expect(inv.swap(0, 99)).toBe(false);
    inv.setSlot(2, 'blok:taş', 60);
    expect(inv.moveStack(1, 2)).toBe(true); // 10 + 60 → 64 + 6
    expect(inv.slots[2].count).toBe(64);
    expect(inv.slots[1].count).toBe(6);
    expect(inv.moveStack(0, 3)).toBe(true); // boş yuvaya taşı
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[3].item).toBe('item:kazma_taş');
    expect(inv.moveStack(1, 2)).toBe(true); // dolu hedef → yer değiştir
    expect(inv.slots[1].count).toBe(64);
    expect(inv.slots[2].count).toBe(6);
    expect(inv.moveStack(0, 1)).toBe(false); // boş kaynak
    // split
    expect(inv.split(1)).toBe(0); // ilk boş yuva
    expect(inv.slots[0].count).toBe(32);
    expect(inv.slots[1].count).toBe(32);
    inv.setSlot(4, 'blok:taş', 5);
    expect(inv.split(4, 5)).toBe(5);
    expect(inv.slots[4].count).toBe(3);
    expect(inv.slots[5].count).toBe(2);
    expect(inv.split(4, 1)).toBe(-1); // hedef dolu
    expect(inv.split(3)).toBe(-1); // dayanıklı eşya bölünmez
    inv.setSlot(6, 'blok:taş', 1);
    expect(inv.split(6)).toBe(-1); // tek parça
  });

  it('setSlot, drop, clear', () => {
    const inv = new Inventory();
    expect(inv.setSlot(0, 'blok:taş', 500)).toBe(true);
    expect(inv.slots[0].count).toBe(64);
    expect(inv.setSlot(0, 'item:yok')).toBe(false);
    expect(inv.setSlot(99, 'blok:taş')).toBe(false);
    expect(inv.drop(0, 10)).toEqual({ item: 'blok:taş', count: 10 });
    expect(inv.slots[0].count).toBe(54);
    expect(inv.drop(0)).toEqual({ item: 'blok:taş', count: 54 });
    expect(inv.slots[0]).toBeNull();
    expect(inv.drop(0)).toBeNull();
    inv.add('item:kazma_altın');
    expect(inv.drop(0)).toEqual({ item: 'item:kazma_altın', count: 1, dur: 33 });
    inv.add('blok:taş', 3);
    inv.clear();
    expect(inv.isEmpty()).toBe(true);
    expect(inv.setSlot(0, null)).toBe(true);
  });
});

describe('seçili yuva, eldeki eşya', () => {
  it('selected kısılır, selectStep sarar', () => {
    const inv = new Inventory();
    inv.selected = 100;
    expect(inv.selected).toBe(8);
    inv.selected = -5;
    expect(inv.selected).toBe(0);
    inv.selected = 'abc';
    expect(inv.selected).toBe(0);
    inv.selectStep(-1);
    expect(inv.selected).toBe(8);
    inv.selectStep(2);
    expect(inv.selected).toBe(1);
    inv.selectStep(20);
    expect(inv.selected).toBe(3);
  });
  it('held/heldItem/damageHeld', () => {
    const inv = new Inventory();
    inv.add('item:kazma_altın'); // dur 33
    inv.add('blok:taş', 3);
    expect(inv.heldItem()).toBe('item:kazma_altın');
    expect(inv.held().dur).toBe(33);
    expect(inv.damageHeld(10)).toBe(false);
    expect(inv.held().dur).toBe(23);
    expect(inv.damageHeld(23)).toBe(true); // kırıldı
    expect(inv.held()).toBeNull();
    inv.selected = 1;
    expect(inv.damageHeld(5)).toBe(false); // dayanıksız eşya etkilenmez
    expect(inv.held().count).toBe(3);
    inv.selected = 5;
    expect(inv.damageHeld(1)).toBe(false); // boş el
  });
});

describe('onChange', () => {
  it('değişimde çağrılır, iptal edilir, işlemsiz çağrılarda çağrılmaz', () => {
    const inv = new Inventory();
    let n = 0;
    const off = inv.onChange((i) => {
      expect(i).toBe(inv);
      n++;
    });
    inv.add('blok:taş', 5);
    expect(n).toBe(1);
    inv.remove('blok:taş', 99); // başarısız
    expect(n).toBe(1);
    inv.remove('blok:taş', 2);
    expect(n).toBe(2);
    inv.add('blok:taş', 0);
    expect(n).toBe(2);
    inv.selected = 3;
    expect(n).toBe(3);
    inv.selected = 3; // aynı
    expect(n).toBe(3);
    off();
    inv.add('blok:toprak');
    expect(n).toBe(3);
  });
  it('craft tek bildirim yollar', () => {
    const inv = new Inventory();
    inv.add('blok:meşe_kütük', 1);
    let n = 0;
    inv.onChange(() => n++);
    expect(inv.craft('tahta_meşe')).toBe(true);
    expect(n).toBe(1);
    expect(inv.craft('tezgah')).toBe(true);
    expect(n).toBe(2);
    expect(inv.craft('tezgah')).toBe(false);
    expect(n).toBe(2);
  });
});

describe('zırh', () => {
  it('equip / unequip / armorDefense / damageArmor', () => {
    const inv = new Inventory();
    inv.add('item:miğfer_demir');
    inv.add('item:göğüslük_elmas');
    inv.add('blok:taş');
    expect(inv.equip(2)).toBe(false); // zırh değil
    expect(inv.equip(0)).toBe(true);
    expect(inv.armor[0].item).toBe('item:miğfer_demir');
    expect(inv.slots[0]).toBeNull();
    expect(inv.equip(1)).toBe(true);
    expect(inv.armorDefense()).toBe(2 + 8);
    inv.add('item:miğfer_altın');
    const idx = inv.find('item:miğfer_altın');
    expect(inv.equip(idx)).toBe(true); // eskisi çantaya döner
    expect(inv.armor[0].item).toBe('item:miğfer_altın');
    expect(inv.find('item:miğfer_demir')).toBe(idx);
    expect(inv.unequip(0)).toBe(true);
    expect(inv.armor[0]).toBeNull();
    expect(inv.unequip(0)).toBe(false);
    expect(inv.unequip(9)).toBe(false);
    const dur0 = inv.armor[1].dur;
    expect(inv.damageArmor(3)).toBe(0);
    expect(inv.armor[1].dur).toBe(dur0 - 3);
    expect(inv.damageArmor(99999)).toBe(1);
    expect(inv.armor[1]).toBeNull();
    expect(inv.armorDefense()).toBe(0);
  });
  it('dolu çantada unequip başarısız', () => {
    const inv = new Inventory({ size: 1, hotbar: 1 });
    inv.armor[0] = { item: 'item:miğfer_deri', count: 1, dur: 10 };
    inv.add('blok:taş');
    expect(inv.unequip(0)).toBe(false);
    expect(inv.armor[0]).not.toBeNull();
  });
});

describe('craft', () => {
  it('kütük → tahta → tezgah → ahşap kazma (istasyon kapısı)', () => {
    const inv = new Inventory();
    inv.add('blok:meşe_kütük', 3);
    expect(inv.craft('tahta_meşe')).toBe(true);
    expect(inv.craft('tahta_meşe')).toBe(true);
    expect(inv.craft('tahta_meşe')).toBe(true);
    expect(inv.count('blok:meşe_tahta')).toBe(12);
    expect(inv.craft('sopa')).toBe(true);
    expect(inv.count('item:sopa')).toBe(4);
    expect(inv.craft('tezgah')).toBe(true);
    expect(inv.count('blok:tezgah')).toBe(1);
    expect(inv.count('blok:meşe_tahta')).toBe(6);
    expect(inv.craft('kazma_ahşap')).toBe(false); // istasyon yok
    expect(inv.craft('kazma_ahşap', new Set())).toBe(false);
    expect(inv.craft('kazma_ahşap', new Set(['tezgah']))).toBe(true);
    expect(inv.count('blok:meşe_tahta')).toBe(3);
    expect(inv.count('item:sopa')).toBe(2);
    const pick = inv.slots.find((s) => s && s.item === 'item:kazma_ahşap');
    expect(pick.dur).toBe(60);
    expect(inv.craft('kazma_ahşap', ['tezgah'])).toBe(true); // ikinci kazma: malzeme tam bitti
    expect(inv.count('blok:meşe_tahta')).toBe(0);
    expect(inv.craft('kazma_ahşap', ['tezgah'])).toBe(false); // malzeme yetmez
    expect(inv.craft('yok_tarif')).toBe(false);
    inv.add('blok:meşe_tahta', 2);
    expect(inv.craft(getRecipe('sopa'))).toBe(true); // tarif nesnesi de olur
  });

  it('malzeme yetmeyince envanter değişmez', () => {
    const inv = new Inventory();
    inv.add('blok:meşe_tahta', 3);
    const before = JSON.stringify(inv);
    expect(inv.craft('tezgah')).toBe(false);
    expect(JSON.stringify(inv)).toBe(before);
  });

  it('çıktı sığmazsa geri alınır', () => {
    const inv = new Inventory({ size: 2, hotbar: 2 });
    inv.setSlot(0, 'blok:taş', 64);
    inv.setSlot(1, 'blok:meşe_tahta', 3);
    const before = JSON.stringify(inv);
    expect(inv.craft('sopa')).toBe(false); // 2 tahta gider, kalan 1 yuvayı tutar, sopaya yer yok
    expect(JSON.stringify(inv)).toBe(before);
    expect(inv.canCraft('sopa')).toBe(false);
    // tüm yığın tüketilince yer açılır
    inv.setSlot(1, 'blok:meşe_tahta', 2);
    expect(inv.canCraft('sopa')).toBe(true);
    expect(inv.craft('sopa')).toBe(true);
    expect(inv.slots[1]).toEqual({ item: 'item:sopa', count: 4 });
  });

  it('ocak: yakıt ısıya dönüşür ve kalan ısı taşınır', () => {
    const inv = new Inventory();
    inv.add('item:ham_demir', 9);
    inv.add('item:kömür', 1);
    expect(inv.craft('ocak:demir')).toBe(false); // ocak istasyonu yok
    const st = new Set(['ocak']);
    for (let i = 0; i < 8; i++) expect(inv.craft('ocak:demir', st), 'eritme ' + i).toBe(true);
    expect(inv.count('item:kömür')).toBe(0);
    expect(inv.heat).toBe(0);
    expect(inv.count('item:demir_külçe')).toBe(8);
    expect(inv.craft('ocak:demir', st)).toBe(false); // yakıt bitti
    expect(inv.count('item:ham_demir')).toBe(1);
    inv.add('blok:meşe_tahta', 1); // 10 ısı
    expect(inv.craft('ocak:demir', st)).toBe(true);
    expect(inv.count('blok:meşe_tahta')).toBe(0);
    expect(inv.heat).toBe(0);
  });

  it('ocak: kömür önce yanar, fazla ısı saklanır; sopa/tahta/kütük korunur (qaplay regresyon)', () => {
    const inv = new Inventory();
    inv.add('item:ham_altın', 2);
    inv.add('item:kömür', 1);
    inv.add('item:sopa', 6);
    inv.add('blok:meşe_tahta', 5);
    inv.add('blok:meşe_kütük', 3);
    expect(inv.craft('ocak:altın', ['ocak'])).toBe(true);
    expect(inv.count('item:kömür')).toBe(0);
    expect(inv.heat).toBe(80 - 10);
    expect(inv.count('item:sopa')).toBe(6);
    expect(inv.count('blok:meşe_tahta')).toBe(5);
    expect(inv.count('blok:meşe_kütük')).toBe(3);
    expect(inv.craft('ocak:altın', ['ocak'])).toBe(true);
    expect(inv.heat).toBe(70 - 10);
  });

  it('ocak: kömür yoksa odun yakıtı en zayıftan yanar', () => {
    const inv = new Inventory();
    inv.add('item:ham_altın', 1);
    inv.add('item:sopa', 2); // 10 ısı = bir eritme
    inv.add('blok:meşe_tahta', 1);
    expect(inv.craft('ocak:altın', ['ocak'])).toBe(true);
    expect(inv.count('item:sopa')).toBe(0);
    expect(inv.count('blok:meşe_tahta')).toBe(1);
    expect(inv.heat).toBe(0);
  });

  it('ocak: yakıt olan malzeme yakılmaz (kütük → odun kömürü)', () => {
    const inv = new Inventory();
    inv.add('blok:meşe_kütük', 1);
    expect(inv.craft('ocak:odun_kömürü_meşe', ['ocak'])).toBe(false);
    expect(inv.count('blok:meşe_kütük')).toBe(1);
    inv.add('blok:meşe_kütük', 1);
    expect(inv.craft('ocak:odun_kömürü_meşe', ['ocak'])).toBe(true);
    expect(inv.count('blok:meşe_kütük')).toBe(0);
    expect(inv.count('item:odun_kömürü')).toBe(1);
    expect(inv.heat).toBe(5);
  });

  it('örs ve sıralı üretim: demir külçe → demir kazma', () => {
    const inv = new Inventory();
    inv.add('item:demir_külçe', 3);
    inv.add('item:sopa', 2);
    expect(inv.craft('kazma_demir', ['tezgah'])).toBe(true);
    expect(inv.count('item:demir_külçe')).toBe(0);
    inv.add('item:elmas', 3);
    inv.add('item:sopa', 2);
    expect(inv.craft('kazma_elmas', ['tezgah'])).toBe(false); // örs gerekir
    expect(inv.craft('kazma_elmas', ['örs'])).toBe(true);
  });
});

describe('serileştirme', () => {
  function sample() {
    const inv = new Inventory();
    inv.add('blok:taş', 70);
    inv.add('item:kazma_demir');
    inv.damageHeld(0);
    inv.selected = 2;
    inv.slots[2].dur = 100;
    inv.add('item:miğfer_elmas');
    inv.equip(inv.find('item:miğfer_elmas'));
    inv.heat = 33;
    return inv;
  }

  it('gidiş-dönüş eşit', () => {
    const a = sample();
    const json = JSON.parse(JSON.stringify(a));
    const b = Inventory.fromJSON(json);
    expect(b.slots).toEqual(a.slots);
    expect(b.armor).toEqual(a.armor);
    expect(b.selected).toBe(2);
    expect(b.heat).toBe(33);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(json.v).toBe(1);
    const c = new Inventory().fromJSON(json);
    expect(c.slots).toEqual(a.slots);
  });

  it('bilinmeyen anahtarlar atılır, sayılar kısılır', () => {
    const b = Inventory.fromJSON({
      selected: 99,
      heat: 5000,
      slots: [
        ['blok:taş', 9999],
        ['item:yok_bu', 3],
        ['blok:toprak', -4],
        ['blok:toprak', 0],
        ['item:kazma_demir', 5, 99999],
        ['item:kazma_demir', 1, -3],
        ['item:kazma_demir'],
        { item: 'blok:cam', count: 3.7 },
        { item: 'blok:kum', count: '5' },
        'çöp',
        null,
        7,
        ['blok:kil'],
      ],
      armor: [
        ['item:miğfer_demir', 1, 10],
        ['item:miğfer_demir', 1, 10], // 1. yuva göğüs: yanlış parça
        ['item:bacaklık_altın', 1],
        ['item:çizme_kuantum', 1, 999999],
      ],
    });
    expect(b.slots[0]).toEqual({ item: 'blok:taş', count: 64 });
    expect(b.slots[1]).toBeNull();
    expect(b.slots[2]).toBeNull();
    expect(b.slots[3]).toBeNull();
    expect(b.slots[4]).toEqual({ item: 'item:kazma_demir', count: 1, dur: 250 });
    expect(b.slots[5]).toEqual({ item: 'item:kazma_demir', count: 1, dur: 1 });
    expect(b.slots[6]).toEqual({ item: 'item:kazma_demir', count: 1, dur: 250 });
    expect(b.slots[7]).toEqual({ item: 'blok:cam', count: 3 });
    expect(b.slots[8]).toEqual({ item: 'blok:kum', count: 5 });
    expect(b.slots[9]).toBeNull();
    expect(b.slots[10]).toBeNull();
    expect(b.slots[11]).toBeNull();
    expect(b.slots[12]).toEqual({ item: 'blok:kil', count: 1 });
    expect(b.selected).toBe(8);
    expect(b.heat).toBe(1000);
    expect(b.armor[0]).toEqual({ item: 'item:miğfer_demir', count: 1, dur: 10 });
    expect(b.armor[1]).toBeNull();
    expect(b.armor[2]).toEqual({ item: 'item:bacaklık_altın', count: 1, dur: 105 });
    expect(b.armor[3].dur).toBe(ITEMS['item:çizme_kuantum'].durability);
  });

  it('çöp girdi boş envanter verir, asla atmaz', () => {
    for (const bad of [null, undefined, 5, 'x', [], { slots: 'a', armor: 3 }, { slots: [[]] }]) {
      const inv = Inventory.fromJSON(bad);
      expect(inv.isEmpty()).toBe(true);
      expect(inv.selected).toBe(0);
      expect(inv.heat).toBe(0);
    }
  });

  it('boyut uyuşmazlığı: fazlalık atılır, eksik boş kalır', () => {
    const big = new Inventory({ size: 40 });
    big.setSlot(39, 'blok:taş', 5);
    big.setSlot(1, 'blok:toprak', 2);
    const small = Inventory.fromJSON(JSON.parse(JSON.stringify(big)), { size: 36 });
    expect(small.slots).toHaveLength(36);
    expect(small.slots[1].item).toBe('blok:toprak');
    const grown = Inventory.fromJSON(JSON.parse(JSON.stringify(small)), { size: 40 });
    expect(grown.slots).toHaveLength(40);
    expect(grown.slots[39]).toBeNull();
  });

  it('ASCII takma adlı anahtarlar kanonikleşir', () => {
    const inv = Inventory.fromJSON({ slots: [['blok:tas', 3], ['item:kazma_ahsap', 1, 10]] });
    expect(inv.slots[0].item).toBe('blok:taş');
    expect(inv.slots[1].item).toBe('item:kazma_ahşap');
  });

  it('snapshot arayüz için düz kopya', () => {
    const inv = sample();
    const snap = inv.snapshot();
    expect(snap.slots).toHaveLength(36);
    expect(snap.slots[0]).toMatchObject({ item: 'blok:taş', count: 64, name: 'Taş', maxDur: 0 });
    expect(snap.slots[2]).toMatchObject({ item: 'item:kazma_demir', dur: 100, maxDur: 250 });
    expect(snap.armor[0]).toMatchObject({ item: 'item:miğfer_elmas' });
    snap.slots[0].count = 1;
    expect(inv.slots[0].count).toBe(64);
  });
});

describe('yaratıcı (insa) envanter', () => {
  it('tüketmez, hotbar hazır, tüm yerleştirilebilir bloklar paletinde', () => {
    const inv = creativeInventory();
    expect(inv.infinite).toBe(true);
    expect(inv.held().item).toBe('blok:taş');
    expect(inv.remove('blok:taş', 5)).toBe(true);
    expect(inv.count('blok:taş')).toBe(64);
    expect(inv.remove('blok:elmas_bloğu', 1)).toBe(false); // elinde yok
    inv.add('item:kazma_kuantum');
    inv.selected = 9 - 1;
    expect(inv.damageHeld(5)).toBe(false);
    const keys = creativeBlockKeys();
    expect(keys).toHaveLength(PLACEABLE_IDS.length);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach((k) => expect(ITEM_LIST.some((i) => i.key === k)).toBe(true));
    expect(keys).toContain('blok:' + 'cam_kırmızı');
    expect(keys).not.toContain('blok:ana_kaya');
  });
  it('craft malzemesiz çalışır ve JSON gidiş-dönüş', () => {
    const inv = creativeInventory({ size: 36 });
    expect(inv.craft('kazma_kuantum', ['örs'])).toBe(true);
    expect(inv.count('item:kazma_kuantum')).toBe(1);
    expect(inv.craft('kazma_kuantum')).toBe(false); // istasyon yine de gerekir
    const back = Inventory.fromJSON(JSON.parse(JSON.stringify(inv)), { infinite: true });
    expect(back.slots).toEqual(inv.slots);
  });
});

describe('rastgele işlem (fuzz): değişmezler korunur', () => {
  it('yığın sınırları, adet korunumu, dayanıklı eşya sayacı', () => {
    const rng = seededRandom(20260101);
    const inv = new Inventory({ size: 12, hotbar: 6 });
    const pool = ['blok:taş', 'blok:toprak', 'item:kazma_demir', 'item:sopa', 'blok:meşale', 'item:yay', 'item:kömür'];
    const total = {};
    pool.forEach((k) => {
      total[k] = 0;
    });
    for (let step = 0; step < 4000; step++) {
      const op = rng.int(0, 5);
      const key = rng.pick(pool);
      if (op === 0) {
        const n = rng.int(1, 80);
        const left = inv.add(key, n);
        total[key] += n - left;
      } else if (op === 1) {
        const n = rng.int(1, 80);
        if (inv.remove(key, n)) total[key] -= n;
      } else if (op === 2) {
        inv.swap(rng.int(0, 11), rng.int(0, 11));
      } else if (op === 3) {
        inv.moveStack(rng.int(0, 11), rng.int(0, 11));
      } else if (op === 4) {
        inv.split(rng.int(0, 11));
      } else {
        const d = inv.drop(rng.int(0, 11), rng.int(1, 70));
        if (d) total[d.item] -= d.count;
      }
      if (step % 50 === 0) {
        pool.forEach((k) => expect(inv.count(k)).toBe(total[k]));
        inv.slots.forEach((s) => {
          if (!s) return;
          const it = ITEMS[s.item];
          expect(it).toBeTruthy();
          expect(s.count).toBeGreaterThanOrEqual(1);
          expect(s.count).toBeLessThanOrEqual(it.stack);
          if (it.durability) {
            expect(s.count).toBe(1);
            expect(s.dur).toBeGreaterThanOrEqual(1);
          } else {
            expect(s.dur).toBeUndefined();
          }
        });
      }
    }
    pool.forEach((k) => expect(inv.count(k)).toBe(total[k]));
    // dizileştir/çöz: aynı
    const back = Inventory.fromJSON(JSON.parse(JSON.stringify(inv)), { size: 12, hotbar: 6 });
    expect(back.slots).toEqual(inv.slots);
  });

  it('B sabitleri envanter anahtarlarıyla uyumlu', () => {
    expect(ITEMS['blok:' + 'taş'].placesBlock).toBe(B.STONE);
  });
});
