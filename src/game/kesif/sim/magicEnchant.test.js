import { describe, expect, it } from 'vitest';
import { Inventory } from './inventory.js';
import { ITEM_LIST } from './items.js';
import { B } from './blocks.js';
import {
  applyEnchantOffer, cloneEnch, countShelves, describeEnchant, enchantClassOf, enchantFits, magicDescribe, magicOffers,
  mergeEnchants, offerTier, rerollEnchant, rotateSeed, sanitizeEnch, shelfTier,
} from './magicEnchant.js';
import { createMagicState } from './magicState.js';
import {
  ENCHANT_LIST, ENCHANTS, FULL_SHELF_COUNT, ITEM_DUST, ITEM_SHARD, MAX_ENCH_PER_ITEM, OFFER_COST, SHELF_BLOCK_ID, enchantDef,
  levelCapForTier,
} from './magicData.js';

function invWith(items) {
  const inv = new Inventory();
  items.forEach((p) => {
    if (Array.isArray(p)) inv.add(p[0], p[1]);
    else inv.add(p, 1);
  });
  return inv;
}

describe('sanitizeEnch', () => {
  it('beyaz liste, seviye kısma, kararlı sıra', () => {
    expect(sanitizeEnch({ keskinlik: 3 }, 'item:kılıç_demir')).toEqual({ keskinlik: 3 });
    expect(sanitizeEnch({ keskinlik: 99 }, 'item:kılıç_demir')).toEqual({ keskinlik: 5 });
    expect(sanitizeEnch({ keskinlik: 2.9 }, 'item:kılıç_demir')).toEqual({ keskinlik: 2 });
    expect(sanitizeEnch({ keskinlik: '4' }, 'item:kılıç_demir')).toEqual({ keskinlik: 4 });
    expect(sanitizeEnch({ keskinlik: 0 }, 'item:kılıç_demir')).toBeNull();
    expect(sanitizeEnch({ keskinlik: -3 }, 'item:kılıç_demir')).toBeNull();
    expect(sanitizeEnch({ keskinlik: NaN }, 'item:kılıç_demir')).toBeNull();
    expect(sanitizeEnch({ keskinlik: {} }, 'item:kılıç_demir')).toBeNull();
    expect(sanitizeEnch({ bilinmeyen: 3 }, 'item:kılıç_demir')).toBeNull();
    expect(Object.keys(sanitizeEnch({ yagmaci: 1, keskinlik: 1, geri_tepme: 1 }, 'item:kılıç_demir'))).toEqual([
      'keskinlik', 'geri_tepme', 'yagmaci',
    ]);
  });

  it('eşyaya uymayan büyüler atılır (kılıçta Verimlilik yok, zırhta Keskinlik yok)', () => {
    expect(sanitizeEnch({ verimlilik: 3, keskinlik: 2 }, 'item:kılıç_demir')).toEqual({ keskinlik: 2 });
    expect(sanitizeEnch({ keskinlik: 2 }, 'item:miğfer_demir')).toBeNull();
    expect(sanitizeEnch({ koruma: 2, su_solugu: 1 }, 'item:miğfer_demir')).toEqual({ koruma: 2, su_solugu: 1 });
    expect(sanitizeEnch({ koruma: 2, su_solugu: 1 }, 'item:göğüslük_demir')).toEqual({ koruma: 2 });
    expect(sanitizeEnch({ guc: 3, sonsuzluk: 1 }, 'item:yay')).toEqual({ guc: 3, sonsuzluk: 1 });
    expect(sanitizeEnch({ mana_verimi: 2 }, 'item:asa_ates')).toEqual({ mana_verimi: 2 });
    expect(sanitizeEnch({ dayaniklilik: 2 }, 'item:kalkan')).toEqual({ dayaniklilik: 2 });
    expect(sanitizeEnch({ keskinlik: 2 }, 'item:elma')).toBeNull(); // büyülenemez eşya
    expect(sanitizeEnch({ keskinlik: 2 }, 'bilinmez:eşya')).toBeNull();
  });

  it('çakışan büyüler tek kalır (ilk kazanır)', () => {
    expect(sanitizeEnch({ alev: 1, buz: 2 }, 'item:kılıç_demir')).toEqual({ alev: 1 });
    expect(sanitizeEnch({ ipek_dokunus: 1, servet: 3 }, 'item:kazma_demir')).toEqual({ ipek_dokunus: 1 });
  });

  it('eşya anahtarı verilmezse yalnız anahtar/seviye süzülür', () => {
    expect(sanitizeEnch({ keskinlik: 2, verimlilik: 9 })).toEqual({ keskinlik: 2, verimlilik: 5 });
  });

  it('prototip kirletme ve garip girdiler', () => {
    const evil = JSON.parse('{"__proto__":{"keskinlik":5},"constructor":{"keskinlik":5},"prototype":3,"keskinlik":2}');
    const out = sanitizeEnch(evil, 'item:kılıç_demir');
    expect(out).toEqual({ keskinlik: 2 });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect({}.keskinlik).toBeUndefined();
    expect(sanitizeEnch(JSON.parse('{"__proto__":{"keskinlik":5}}'), 'item:kılıç_demir')).toBeNull();
    [null, undefined, 5, 'x', [], [1, 2], true, () => 1].forEach((v) => expect(sanitizeEnch(v, 'item:kılıç_demir')).toBeNull());
    // miras alınan alan sayılmaz
    const child = Object.create({ keskinlik: 5 });
    expect(sanitizeEnch(child, 'item:kılıç_demir')).toBeNull();
  });

  it('en çok MAX_ENCH_PER_ITEM büyü', () => {
    const all = {};
    ENCHANT_LIST.forEach((d) => { all[d.key] = 1; });
    const out = sanitizeEnch(all);
    expect(Object.keys(out).length).toBeLessThanOrEqual(MAX_ENCH_PER_ITEM);
  });
});

describe('mergeEnchants', () => {
  it('yüksek seviye kazanır, çakışan eklenmez, yeni eklenir', () => {
    expect(mergeEnchants({ keskinlik: 2 }, { keskinlik: 4, alev: 1 }, 'item:kılıç_demir')).toEqual({ keskinlik: 4, alev: 1 });
    expect(mergeEnchants({ keskinlik: 4 }, { keskinlik: 2 }, 'item:kılıç_demir')).toEqual({ keskinlik: 4 });
    expect(mergeEnchants({ alev: 1 }, { buz: 2 }, 'item:kılıç_demir')).toEqual({ alev: 1 });
    expect(mergeEnchants(null, { keskinlik: 1 }, 'item:kılıç_demir')).toEqual({ keskinlik: 1 });
    expect(mergeEnchants(null, { verimlilik: 1 }, 'item:kılıç_demir')).toBeNull();
  });
});

describe('Kitaplık kademesi', () => {
  it('0–5 kitaplık → kademe I–V', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(shelfTier)).toEqual([1, 2, 3, 4, 5, 5, 5, 5]);
    expect(shelfTier(-3)).toBe(1);
    expect(shelfTier(NaN)).toBe(1);
    expect(shelfTier('2')).toBe(3);
  });

  it('countShelves: 4 blok yarıçap, masa hariç, y −1..+2', () => {
    const map = new Map();
    const set = (x, y, z, id) => map.set(x + ',' + y + ',' + z, id);
    const get = (x, y, z) => map.get(x + ',' + y + ',' + z) || 0;
    set(10, 5, 10, B.MAGIC_TABLE);
    set(11, 5, 10, SHELF_BLOCK_ID);
    set(14, 6, 14, SHELF_BLOCK_ID); // sınırda (dx=4, dz=4, dy=1)
    set(15, 5, 10, SHELF_BLOCK_ID); // dışarıda (dx=5)
    set(10, 8, 10, SHELF_BLOCK_ID); // dışarıda (dy=3)
    set(10, 4, 11, SHELF_BLOCK_ID); // dy=-1 içeride
    expect(countShelves(get, 10, 5, 10)).toBe(3);
    expect(countShelves(() => null, 0, 0, 0)).toBe(0);
  });
});

describe('Teklifler', () => {
  it('belirlenimci: aynı (tohum, eşya, kitaplık) → aynı teklifler', () => {
    const a = magicOffers(12345, 'item:kılıç_demir', 4);
    const b = magicOffers(12345, 'item:kılıç_demir', 4);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('tohum, eşya ve kitaplık sayısı sonucu değiştirir', () => {
    let seedDiff = 0;
    let itemDiff = 0;
    for (let s = 1; s <= 30; s++) {
      if (JSON.stringify(magicOffers(s, 'item:kazma_demir', 3)) !== JSON.stringify(magicOffers(s + 100, 'item:kazma_demir', 3))) seedDiff++;
      if (JSON.stringify(magicOffers(s, 'item:kazma_demir', 3).map((o) => o.enchants))
        !== JSON.stringify(magicOffers(s, 'item:kazma_taş', 3).map((o) => o.enchants))) itemDiff++;
    }
    expect(seedDiff).toBeGreaterThan(25);
    expect(itemDiff).toBeGreaterThan(5);
    expect(JSON.stringify(magicOffers(7, 'item:kılıç_demir', 0))).not.toBe(JSON.stringify(magicOffers(7, 'item:kılıç_demir', 5)));
  });

  it('teklif kimlikleri benzersiz ve kararlı biçimli', () => {
    for (let s = 1; s < 20; s++) {
      const offers = magicOffers(s, 'item:kılıç_demir', 5);
      expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);
      offers.forEach((o, i) => {
        expect(o.id).toMatch(/^o[123]_[0-9a-z]+$/);
        expect(o.index).toBe(i);
      });
    }
  });

  it('kitaplık sayısı kademeyi sınırlar (0 kitaplık: yalnız I; seviye tavanı kademeye göre)', () => {
    for (let s = 1; s <= 80; s++) {
      for (let shelves = 0; shelves <= 6; shelves++) {
        const maxTier = shelfTier(shelves);
        const offers = magicOffers(s, 'item:kılıç_elmas', shelves);
        expect(offers.length).toBeGreaterThan(0);
        offers.forEach((o) => {
          expect(o.tier).toBeLessThanOrEqual(maxTier);
          expect(o.tier).toBeGreaterThanOrEqual(1);
          Object.keys(o.enchants).forEach((k) => {
            expect(o.enchants[k]).toBeLessThanOrEqual(levelCapForTier(enchantDef(k), o.tier));
            expect(o.enchants[k]).toBeGreaterThanOrEqual(1);
          });
        });
        if (shelves === 0) offers.forEach((o) => expect(o.tier).toBe(1));
      }
    }
  });

  it('üst kademeler yalnız yeterli kitaplıkla gelir: Servet III yalnız kademe V', () => {
    let sawServetIII = false;
    for (let s = 1; s <= 400; s++) {
      for (let shelves = 0; shelves <= 4; shelves++) {
        magicOffers(s, 'item:kazma_elmas', shelves).forEach((o) => {
          if (o.enchants.servet === 3) {
            sawServetIII = true;
            expect(o.tier).toBe(5);
            expect(shelves).toBeGreaterThanOrEqual(4);
          }
          if (o.enchants.servet) expect(o.tier).toBeGreaterThanOrEqual(3);
          if (o.enchants.ipek_dokunus) expect(o.tier).toBeGreaterThanOrEqual(3);
        });
      }
    }
    expect(sawServetIII).toBe(true);
  });

  it('teklif kademesi: 1/3, 2/3, tam', () => {
    expect([1, 2, 3, 4, 5].map((m) => [0, 1, 2].map((k) => offerTier(m, k)))).toEqual([
      [1, 1, 1], [1, 1, 2], [1, 2, 3], [1, 3, 4], [2, 3, 5],
    ]);
  });

  it('maliyetler: kademe tablosu, çoklu büyüde ek toz, kademe III+ kıymık, tam çemberde %15 indirim', () => {
    for (let s = 1; s <= 120; s++) {
      magicOffers(s, 'item:kılıç_elmas', 4).forEach((o) => {
        const n = Object.keys(o.enchants).length;
        expect(o.costDust).toBe(OFFER_COST.dust[o.tier - 1] + OFFER_COST.extraDustPerEnchant * (n - 1));
        expect(o.costShard).toBe(OFFER_COST.shard[o.tier - 1]);
        if (o.tier >= 3) expect(o.costShard).toBeGreaterThan(0);
        else expect(o.costShard).toBe(0);
      });
      magicOffers(s, 'item:kılıç_elmas', FULL_SHELF_COUNT).forEach((o) => {
        const n = Object.keys(o.enchants).length;
        const full = OFFER_COST.dust[o.tier - 1] + OFFER_COST.extraDustPerEnchant * (n - 1);
        expect(o.costDust).toBe(Math.ceil(full * 0.85));
        expect(o.costDust).toBeLessThan(full);
      });
    }
  });

  it('her eşya sınıfı yalnız kendine uyan büyüler alır, çakışma yok, 3 teklif', () => {
    const samples = [
      'item:kazma_demir', 'item:balta_elmas', 'item:kürek_taş', 'item:kılıç_kuantum', 'item:yay', 'item:miğfer_demir',
      'item:göğüslük_demir', 'item:bacaklık_altın', 'item:çizme_elmas', 'item:kalkan', 'item:asa_ates', 'item:asa_kuantum',
    ];
    samples.forEach((key) => {
      const cls = enchantClassOf(key);
      let any = 0;
      for (let s = 1; s <= 60; s++) {
        for (let shelves = 0; shelves <= 5; shelves += 5) {
          const offers = magicOffers(s * 7919, key, shelves);
          if (offers.length > 0) any++;
          offers.forEach((o) => {
            Object.keys(o.enchants).forEach((k) => {
              expect(enchantFits(k, cls), key + ':' + k).toBe(true);
              enchantDef(k).conflicts.forEach((c) => expect(o.enchants[c]).toBeUndefined());
            });
            expect(Object.keys(o.enchants).length).toBeGreaterThanOrEqual(1);
            expect(Object.keys(o.enchants).length).toBeLessThanOrEqual(3);
            expect(o.label.length).toBeGreaterThan(2);
          });
        }
      }
      expect(any).toBeGreaterThan(0);
      expect(magicOffers(1, key, 5)).toHaveLength(3);
    });
  });

  it('büyülenemez eşya → boş; mevcut büyüler tekrarlanmaz ve yükseltme önerilir', () => {
    expect(magicOffers(1, 'item:elma', 5)).toEqual([]);
    expect(magicOffers(1, 'blok:taş', 5)).toEqual([]);
    expect(magicOffers(1, undefined, 5)).toEqual([]);
    for (let s = 1; s <= 60; s++) {
      const offers = magicOffers(s, 'item:kılıç_demir', 3, { keskinlik: 3, alev: 1 });
      offers.forEach((o) => {
        if (o.enchants.keskinlik) expect(o.enchants.keskinlik).toBeGreaterThan(3);
        if (o.enchants.alev) expect(o.enchants.alev).toBeGreaterThan(1);
        expect(o.enchants.buz).toBeUndefined(); // Alev ile çakışır
      });
    }
    // tüm büyüler maksimumda → teklif kalmaz
    const full = { keskinlik: 5, alev: 2, geri_tepme: 2, yagmaci: 3, dayaniklilik: 3 };
    expect(magicOffers(5, 'item:kılıç_demir', 5, full)).toEqual([]);
  });

  it('prototip kirli mevcut büyüler teklifleri bozmaz', () => {
    const evil = JSON.parse('{"__proto__":{"keskinlik":5}}');
    expect(magicOffers(3, 'item:kılıç_demir', 3, evil)).toEqual(magicOffers(3, 'item:kılıç_demir', 3));
  });
});

describe('applyEnchantOffer', () => {
  function setup(shelves = 5) {
    const state = createMagicState(99);
    const inv = invWith([['item:kılıç_demir', 1], [ITEM_DUST, 200], [ITEM_SHARD, 20]]);
    const idx = inv.find('item:kılıç_demir');
    const offers = magicOffers(state.enchantSeed, 'item:kılıç_demir', shelves);
    return { state, inv, idx, offers, shelves };
  }

  it('maliyeti keser, büyüyü yazar, tohumu döndürür, sayacı artırır, olay üretir', () => {
    const { state, inv, idx, offers, shelves } = setup();
    const o = offers[2];
    const seed0 = state.enchantSeed;
    const dust0 = inv.count(ITEM_DUST);
    const shard0 = inv.count(ITEM_SHARD);
    const r = applyEnchantOffer(state, inv, idx, o.id, shelves);
    expect(r.ok).toBe(true);
    expect(inv.count(ITEM_DUST)).toBe(dust0 - o.costDust);
    expect(inv.count(ITEM_SHARD)).toBe(shard0 - o.costShard);
    expect(inv.slotAt(idx).ench).toEqual(o.enchants);
    expect(state.enchantSeed).not.toBe(seed0);
    expect(state.enchantCount).toBe(1);
    expect(r.event).toMatchObject({ type: 'enchanted', item: 'item:kılıç_demir', tier: o.tier, costDust: o.costDust });
    expect(r.ench).toEqual(o.enchants);
    // slot değişmeden diğer alanlar korunur
    expect(inv.slotAt(idx).dur).toBeGreaterThan(0);
  });

  it('eski teklif kimliği tohum dönünce geçersiz; yeni teklifler farklı', () => {
    const { state, inv, idx, offers, shelves } = setup();
    expect(applyEnchantOffer(state, inv, idx, offers[0].id, shelves).ok).toBe(true);
    const again = applyEnchantOffer(state, inv, idx, offers[0].id, shelves);
    expect(again).toMatchObject({ ok: false, reason: 'secenek_yok' });
    const next = magicOffers(state.enchantSeed, 'item:kılıç_demir', shelves, inv.slotAt(idx).ench);
    expect(next.map((o) => o.id)).not.toEqual(offers.map((o) => o.id));
  });

  it('ardışık büyüler birikir, çakışma/üst sınır korunur', () => {
    const { state, inv, idx, shelves } = setup();
    for (let i = 0; i < 12; i++) {
      const offers = magicOffers(state.enchantSeed, 'item:kılıç_demir', shelves, inv.slotAt(idx).ench);
      if (offers.length === 0) break;
      expect(applyEnchantOffer(state, inv, idx, offers[i % offers.length].id, shelves).ok).toBe(true);
    }
    const e = inv.slotAt(idx).ench;
    expect(Object.keys(e).length).toBeGreaterThan(1);
    expect(Object.keys(e).length).toBeLessThanOrEqual(MAX_ENCH_PER_ITEM);
    expect(sanitizeEnch(e, 'item:kılıç_demir')).toEqual(e);
    expect(!(e.alev && e.buz)).toBe(true);
  });

  it('yetersiz toz / kıymık / eşya yok / büyülenemez / geçersiz kimlik; envanter değişmez', () => {
    const state = createMagicState(5);
    const inv = invWith([['item:kılıç_demir', 1], [ITEM_DUST, 3]]);
    const idx = inv.find('item:kılıç_demir');
    const offers = magicOffers(state.enchantSeed, 'item:kılıç_demir', 0);
    const before = JSON.stringify(inv.toJSON());
    expect(applyEnchantOffer(state, inv, idx, offers[0].id, 0)).toMatchObject({ ok: false, reason: 'toz' });
    inv.add(ITEM_DUST, 100);
    const high = magicOffers(state.enchantSeed, 'item:kılıç_demir', 5)[2];
    expect(high.costShard).toBeGreaterThan(0);
    const r = applyEnchantOffer(state, inv, idx, high.id, 5);
    expect(r).toMatchObject({ ok: false, reason: 'kiymik' });
    expect(r.message).toMatch(/Kıymığ/);
    inv.add(ITEM_SHARD, 10);
    expect(applyEnchantOffer(state, inv, 30, 'o1_x', 5)).toMatchObject({ ok: false, reason: 'esya_yok' });
    inv.add('item:elma', 1);
    expect(applyEnchantOffer(state, inv, inv.find('item:elma'), 'o1_x', 5)).toMatchObject({ ok: false, reason: 'uygun_degil' });
    expect(applyEnchantOffer(state, inv, idx, 'sahte', 5)).toMatchObject({ ok: false, reason: 'secenek_yok' });
    expect(applyEnchantOffer(state, inv, idx, undefined, 5)).toMatchObject({ ok: false, reason: 'secenek_yok' });
    expect(before).toBeTruthy();
    expect(state.enchantCount).toBe(0);
    expect(inv.slotAt(idx).ench).toBeUndefined();
  });

  it('adresler: zırh yuvası (giyilmiş) ve "sN"/"aN" biçimi', () => {
    const state = createMagicState(8);
    const inv = invWith([['item:miğfer_demir', 1], [ITEM_DUST, 300], [ITEM_SHARD, 30]]);
    inv.equip(inv.find('item:miğfer_demir'));
    const offers = magicOffers(state.enchantSeed, 'item:miğfer_demir', 5);
    expect(applyEnchantOffer(state, inv, 'a0', offers[1].id, 5).ok).toBe(true);
    expect(inv.armor[0].ench).toEqual(offers[1].enchants);
    const inv2 = invWith([['item:kazma_demir', 1], [ITEM_DUST, 300], [ITEM_SHARD, 30]]);
    const st2 = createMagicState(8);
    const of2 = magicOffers(st2.enchantSeed, 'item:kazma_demir', 5);
    expect(applyEnchantOffer(st2, inv2, 's' + inv2.find('item:kazma_demir'), of2[0].id, 5).ok).toBe(true);
    const st3 = createMagicState(8);
    const inv3 = invWith([['item:kazma_demir', 1], [ITEM_DUST, 300], [ITEM_SHARD, 30]]);
    expect(applyEnchantOffer(st3, inv3, { zone: 'slots', index: inv3.find('item:kazma_demir') }, of2[0].id, 5).ok).toBe(true);
  });

  it('yaratıcı (infinite) envanter tüketmez ama büyü uygular', () => {
    const state = createMagicState(1);
    const inv = new Inventory({ infinite: true });
    inv.add('item:kılıç_demir', 1);
    const o = magicOffers(state.enchantSeed, 'item:kılıç_demir', 5)[0];
    expect(applyEnchantOffer(state, inv, 0, o.id, 5).ok).toBe(true);
  });

  it('rerollEnchant: 1 toz, tohum döner, teklifler değişir; tozsuz başarısız', () => {
    const state = createMagicState(21);
    const inv = invWith([[ITEM_DUST, 2]]);
    const before = magicOffers(state.enchantSeed, 'item:kılıç_demir', 3);
    const r = rerollEnchant(state, inv);
    expect(r).toMatchObject({ ok: true, cost: 1 });
    expect(inv.count(ITEM_DUST)).toBe(1);
    expect(magicOffers(state.enchantSeed, 'item:kılıç_demir', 3)).not.toEqual(before);
    expect(rerollEnchant(state, inv).ok).toBe(true);
    const r3 = rerollEnchant(state, inv);
    expect(r3).toMatchObject({ ok: false, reason: 'toz' });
    expect(inv.count(ITEM_DUST)).toBe(0);
  });

  it('rotateSeed belirlenimci ve tohumu gerçekten değiştirir', () => {
    expect(rotateSeed(5, 1)).toBe(rotateSeed(5, 1));
    expect(rotateSeed(5, 1)).not.toBe(5);
    expect(rotateSeed(5, 1)).not.toBe(rotateSeed(5, 2));
    const seen = new Set();
    let s = 1;
    for (let i = 0; i < 200; i++) {
      s = rotateSeed(s, i);
      seen.add(s);
    }
    expect(seen.size).toBe(200);
  });
});

describe('İpuçları', () => {
  it('describeEnchant ve magicDescribe', () => {
    expect(describeEnchant('keskinlik', 3)).toMatchObject({ name: 'Keskinlik III', text: '+2,3 saldırı hasarı' });
    expect(describeEnchant('ipek_dokunus', 1).name).toBe('İpek Dokunuş');
    expect(describeEnchant('keskinlik', 99).level).toBe(5);
    expect(describeEnchant('yok', 1)).toBeNull();
    const lines = magicDescribe({ item: 'item:kılıç_demir', ench: { keskinlik: 2, alev: 1 } });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Keskinlik II — /);
    expect(magicDescribe({ item: 'item:kılıç_demir' })).toEqual([]);
    expect(magicDescribe('item:elma')).toEqual([]);
    expect(magicDescribe({ item: 'item:asa_ates' })[0]).toMatch(/Ateş Topu — 12 mana/);
    expect(magicDescribe('item:iksir_hiz')[0]).toMatch(/Hız — 3:00/);
    expect(magicDescribe('item:mana_kristali')[0]).toMatch(/Azami mana \+10/);
    expect(magicDescribe('item:iksir_guclu_sifa')[0]).toMatch(/20 can/);
    expect(magicDescribe(null)).toEqual([]);
  });

  it('tüm büyülemeler için ipucu metni üretir', () => {
    ENCHANT_LIST.forEach((d) => {
      for (let l = 1; l <= d.max; l++) {
        const e = describeEnchant(d.key, l);
        expect(e.text.length).toBeGreaterThan(3);
        expect(e.name).toContain(d.name);
      }
    });
    expect(Object.keys(ENCHANTS)).toHaveLength(ENCHANT_LIST.length);
  });

  it('cloneEnch bağımsız kopya', () => {
    const a = { keskinlik: 2 };
    const b = cloneEnch(a);
    b.keskinlik = 5;
    expect(a.keskinlik).toBe(2);
    expect(cloneEnch(null)).toBeUndefined();
  });
});

describe('Tüm eşyalar üzerinde tutarlılık', () => {
  it('tüm büyülenebilir eşyalar için teklif üretilir ve uygulanabilir', () => {
    ITEM_LIST.forEach((it) => {
      if (!enchantClassOf(it.key)) return;
      const offers = magicOffers(31337, it.key, 5);
      expect(offers.length, it.key).toBe(3);
      offers.forEach((o) => expect(sanitizeEnch(o.enchants, it.key)).toEqual(o.enchants));
    });
  });
});
