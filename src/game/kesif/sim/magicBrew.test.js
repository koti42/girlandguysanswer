import { describe, expect, it } from 'vitest';
import { Inventory } from './inventory.js';
import { BrewManager, drinkPotion, potionOf } from './magicBrew.js';
import { BREW_MAX_BOTTLES, BREW_RECIPES, brewRecipe } from './magicRecipes.js';
import { ITEM_BOTTLE, ITEM_DUST, ITEM_SHARD, POTION_DEFS } from './magicData.js';
import { createMagicState } from './magicState.js';
import { computeMods } from './magicMods.js';
import { createSurvival, applyDamage } from './survival.js';

const POS = { x: 4, y: 20, z: -7 };

function stocked(recipeId, bottles = 3, times = 1) {
  const inv = new Inventory();
  const r = brewRecipe(recipeId);
  r.in.forEach((p) => inv.add(p.item, p.count * times));
  inv.add(ITEM_BOTTLE, bottles * times);
  return inv;
}

describe('BrewManager.start', () => {
  it('şişe ve malzemeyi tüketir, 30 sn sayar', () => {
    const b = new BrewManager();
    const inv = stocked('hiz', 3);
    const r = b.start(POS, 'hiz', 3, inv);
    expect(r).toMatchObject({ ok: true, bottles: 3, seconds: 30, recipe: 'hiz' });
    expect(inv.count(ITEM_BOTTLE)).toBe(0);
    brewRecipe('hiz').in.forEach((p) => expect(inv.count(p.item)).toBe(0));
    expect(b.get(POS)).toMatchObject({ recipeId: 'hiz', bottles: 3, secondsLeft: 30, progress01: 0, done: false, out: 'item:iksir_hiz' });
    expect(b.has(POS)).toBe(true);
    expect(b.has('4,20,-7')).toBe(true);
  });

  it('şişe adedi 1–3 arasında kısılır; fazla şişe çantada kalır', () => {
    const b = new BrewManager();
    const inv = stocked('hiz', 9);
    expect(b.start(POS, 'hiz', 99, inv).bottles).toBe(BREW_MAX_BOTTLES);
    expect(inv.count(ITEM_BOTTLE)).toBe(6);
    const inv2 = stocked('hiz', 5);
    expect(new BrewManager().start(POS, 'hiz', 0, inv2).bottles).toBe(1);
    expect(new BrewManager().start(POS, 'hiz', -4, stocked('hiz', 5)).bottles).toBe(1);
    expect(new BrewManager().start(POS, 'hiz', 'x', stocked('hiz', 5)).bottles).toBe(1);
  });

  it('nedenler: tarif, meşgul, şişe, malzeme (eksik listesi); envanter değişmez', () => {
    const b = new BrewManager();
    const inv = stocked('hiz', 1);
    expect(b.start(POS, 'yok', 1, inv)).toMatchObject({ ok: false, reason: 'tarif' });
    expect(b.start(POS, '__proto__', 1, inv).reason).toBe('tarif');
    expect(b.start({ x: NaN, y: 1, z: 1 }, 'hiz', 1, inv).reason).toBe('tarif');
    expect(b.start(POS, 'hiz', 2, inv)).toMatchObject({ ok: false, reason: 'şişe' });
    const poor = new Inventory();
    poor.add(ITEM_BOTTLE, 3);
    poor.add('item:tüy', 1);
    const r = b.start(POS, 'hiz', 1, poor);
    expect(r.reason).toBe('malzeme');
    expect(r.missing.map((m) => m.item).sort()).toEqual(['blok:sarı_çiçek', 'item:kristal_tozu', 'item:tüy'].sort());
    expect(r.missing.find((m) => m.item === 'item:tüy')).toMatchObject({ need: 2, have: 1 });
    expect(poor.count(ITEM_BOTTLE)).toBe(3);
    expect(poor.count('item:tüy')).toBe(1);
    expect(b.start(POS, 'hiz', 1, inv).ok).toBe(true);
    expect(b.start(POS, 'hiz', 1, stocked('hiz', 1))).toMatchObject({ ok: false, reason: 'meşgul' });
  });

  it('iki farklı kazan bağımsız', () => {
    const b = new BrewManager();
    expect(b.start({ x: 0, y: 1, z: 0 }, 'hiz', 1, stocked('hiz', 1)).ok).toBe(true);
    expect(b.start({ x: 1, y: 1, z: 0 }, 'guc', 1, stocked('guc', 1)).ok).toBe(true);
    expect(b.list()).toHaveLength(2);
    expect(b.get({ x: 1, y: 1, z: 0 }).recipeId).toBe('guc');
  });

  it('yaratıcı (infinite) envanter tüketmez ve şişe/malzeme istemez', () => {
    const inv = new Inventory({ infinite: true });
    expect(new BrewManager().start(POS, 'guc', 2, inv).ok).toBe(true);
  });
});

describe('BrewManager.tick / collect', () => {
  it('30 sn sonra hazır: tek potionBrewed olayı; progress ilerler', () => {
    const b = new BrewManager();
    b.start(POS, 'guc', 2, stocked('guc', 2));
    expect(b.tick(10)).toEqual([]);
    expect(b.get(POS)).toMatchObject({ secondsLeft: 20, done: false });
    expect(b.get(POS).progress01).toBeCloseTo(1 / 3, 5);
    expect(b.tick(19.9)).toEqual([]);
    expect(b.get(POS).done).toBe(false);
    const ev = b.tick(0.2);
    expect(ev).toEqual([{ type: 'potionBrewed', recipe: 'guc', item: 'item:iksir_guc', count: 2, x: 4, y: 20, z: -7 }]);
    expect(b.get(POS)).toMatchObject({ done: true, secondsLeft: 0, progress01: 1 });
    expect(b.tick(100)).toEqual([]); // bir daha olay yok
    expect(b.tick(0)).toEqual([]);
    expect(b.tick(-5)).toEqual([]);
  });

  it('küçük adımlarla toplam 30 sn: tam 1800 kare', () => {
    const b = new BrewManager();
    b.start(POS, 'hiz', 1, stocked('hiz', 1));
    let events = 0;
    let frames = 0;
    while (events === 0 && frames < 5000) {
      events += b.tick(1 / 60).length;
      frames++;
    }
    expect(frames).toBeGreaterThanOrEqual(1799);
    expect(frames).toBeLessThanOrEqual(1801);
  });

  it('collect: hazır değilse başarısız; hazırsa iksirleri çantaya verir ve kazan boşalır', () => {
    const b = new BrewManager();
    const inv = stocked('yenilenme', 3);
    b.start(POS, 'yenilenme', 3, inv);
    expect(b.collect(POS, inv)).toMatchObject({ ok: false, reason: 'hazır_değil' });
    b.tick(31);
    const r = b.collect(POS, inv);
    expect(r).toMatchObject({ ok: true, items: [{ item: 'item:iksir_yenilenme', count: 3 }], left: 0 });
    expect(inv.count('item:iksir_yenilenme')).toBe(3);
    expect(b.get(POS)).toBeNull();
    expect(b.collect(POS, inv)).toMatchObject({ ok: false, reason: 'yok' });
    expect(b.start(POS, 'hiz', 1, stocked('hiz', 1)).ok).toBe(true); // kazan yeniden kullanılabilir
  });

  it('çanta doluysa iksirler kazanda kalır', () => {
    const b = new BrewManager();
    const inv = stocked('hiz', 3);
    b.start(POS, 'hiz', 3, inv);
    b.tick(31);
    // çantayı doldur
    const full = new Inventory();
    for (let i = 0; i < full.size; i++) full.setSlot(i, 'item:kılıç_demir');
    const r = b.collect(POS, full);
    expect(r).toMatchObject({ ok: false, reason: 'dolu_çanta', left: 3 });
    expect(b.get(POS).bottles).toBe(3);
    // kısmi: 1 yer aç
    full.setSlot(0, null);
    const r2 = b.collect(POS, full);
    expect(r2.ok).toBe(true);
    expect(r2.left).toBe(0);
  });

  it('her tarif için tam akış: demle → bekle → al → iksir çıkar', () => {
    BREW_RECIPES.forEach((r) => {
      const b = new BrewManager();
      const inv = stocked(r.id, 3);
      expect(b.start(POS, r.id, 3, inv).ok, r.id).toBe(true);
      expect(b.tick(30.01)).toHaveLength(1);
      expect(b.collect(POS, inv).ok).toBe(true);
      expect(inv.count(r.out), r.id).toBe(3);
    });
  });
});

describe('BrewManager.removeAt', () => {
  it('hazır iksirleri ya da (bitmemişse) şişe + malzemeyi iade eder', () => {
    const b = new BrewManager();
    b.start(POS, 'guc', 2, stocked('guc', 2));
    const refund = b.removeAt(POS);
    expect(refund).toEqual(expect.arrayContaining([{ item: ITEM_BOTTLE, count: 2 }, { item: 'item:kemik', count: 2 }]));
    expect(refund.find((r) => r.item === ITEM_DUST)).toEqual({ item: ITEM_DUST, count: 1 });
    expect(b.get(POS)).toBeNull();
    b.start(POS, 'guc', 3, stocked('guc', 3));
    b.tick(31);
    expect(b.removeAt(POS)).toEqual([{ item: 'item:iksir_guc', count: 3 }]);
    expect(b.removeAt(POS)).toEqual([]);
    expect(b.removeAt('saçma')).toEqual([]);
  });
});

describe('BrewManager kaydı', () => {
  it('gidiş-dönüş: süre, şişe, hazır durumu', () => {
    const b = new BrewManager();
    b.start({ x: 1, y: 2, z: 3 }, 'hiz', 2, stocked('hiz', 2));
    b.start({ x: -1, y: 5, z: 0 }, 'guc', 3, stocked('guc', 3));
    b.tick(12.34);
    b.tick(30);
    const json = JSON.parse(JSON.stringify(b.serialize()));
    const c = new BrewManager().restore(json);
    expect(c.list()).toHaveLength(2);
    expect(c.get({ x: 1, y: 2, z: 3 })).toMatchObject({ done: true, bottles: 2 });
    const d = new BrewManager();
    d.start(POS, 'hiz', 1, stocked('hiz', 1));
    d.tick(12.34);
    const e = new BrewManager().restore(JSON.parse(JSON.stringify(d.serialize())));
    expect(e.get(POS).secondsLeft).toBe(18);
  });

  it('bozuk/saldırgan girdi asla atmaz', () => {
    const junk = [
      null, undefined, 5, 'x', [], {}, { '1,2,3': 5 }, { '1,2,3': [] }, { '1,2,3': ['yok', 1, 1, 30, 0] },
      { '1,2,3': ['hiz', 99, -5, 30, 0] }, { '1,2,3': ['hiz', 'a', 'b'] }, { '1,2': ['hiz', 1, 1, 30, 0] },
      { '01,2,3': ['hiz', 1, 1, 30, 0] }, { '1,-9999,3': ['hiz', 1, 1, 30, 0] }, { '1.5,2,3': ['hiz', 1, 1, 30, 0] },
      { '1e9,2,3': ['hiz', 1, 1, 30, 0] }, { __proto__: { '1,2,3': ['hiz', 1, 1, 30, 0] } }, { '1,2,3': ['__proto__', 1, 1, 30, 0] },
      JSON.parse('{"__proto__":["hiz",1,1,30,0],"1,2,3":["constructor",1,1,30,0]}'),
    ];
    junk.forEach((j) => {
      const b = new BrewManager();
      expect(() => b.restore(j)).not.toThrow();
      b.list().forEach((c) => {
        expect(brewRecipe(c.recipeId)).not.toBeNull();
        expect(c.bottles).toBeGreaterThanOrEqual(1);
        expect(c.bottles).toBeLessThanOrEqual(3);
        expect(c.secondsLeft).toBeGreaterThanOrEqual(0);
        expect(c.secondsLeft).toBeLessThanOrEqual(30);
        expect(Number.isInteger(c.pos.x) && Number.isInteger(c.pos.y) && Number.isInteger(c.pos.z)).toBe(true);
      });
    });
    const b = new BrewManager().restore({ '1,2,3': ['hiz', 99, -5, 30, 0] });
    expect(b.get('1,2,3')).toMatchObject({ bottles: 3, secondsLeft: 0 });
    expect(new BrewManager().restore({ '1,2,3': ['hiz', 1, 9999, 30, 0] }).get('1,2,3').secondsLeft).toBe(30);
    expect(new BrewManager().restore({ '1,9999,3': ['hiz', 1, 1, 30, 0] }).list()).toEqual([]);
  });

  it('recipes(inv): çantadaki malzemeye göre craftable', () => {
    const b = new BrewManager();
    const inv = stocked('gece_gorusu', 1);
    const list = b.recipes(inv);
    expect(list).toHaveLength(BREW_RECIPES.length);
    expect(list.find((r) => r.id === 'gece_gorusu').craftable).toBe(true);
    expect(list.find((r) => r.id === 'mana').craftable).toBe(false);
    expect(list.find((r) => r.id === 'gece_gorusu').in[0]).toMatchObject({ item: 'blok:ışıklı_mantar', count: 3, have: 3 });
  });
});

describe('drinkPotion', () => {
  function hold(item) {
    const inv = new Inventory();
    inv.add(item, 2);
    return inv;
  }

  it('etkili iksir: etki eklenir, 1 iksir gider, şişe döner, olaylar', () => {
    const state = createMagicState(1);
    const inv = hold('item:iksir_hiz');
    const r = drinkPotion(state, inv, 0, {});
    expect(r.ok).toBe(true);
    expect(inv.count('item:iksir_hiz')).toBe(1);
    expect(inv.count(ITEM_BOTTLE)).toBe(1);
    expect(r.events[0]).toMatchObject({ type: 'effectAdded', key: 'hiz', level: 1, seconds: 180, source: 'iksir' });
    expect(r.events[1]).toMatchObject({ type: 'potionDrunk', item: 'item:iksir_hiz' });
    expect(state.effects).toHaveLength(1);
    expect(computeMods(null, state.effects).speedMul).toBeCloseTo(1.3, 5);
    // ikinci kez içmek süreyi yeniler (üst üste binmez)
    drinkPotion(state, inv, 0, {});
    expect(state.effects).toHaveLength(1);
    expect(inv.count('item:iksir_hiz')).toBe(0);
    expect(inv.slotAt(0)).toBeNull();
  });

  it('tüm etkili iksirler doğru etkiyi verir', () => {
    POTION_DEFS.filter((p) => p.potion.effect).forEach((p) => {
      const state = createMagicState(1);
      const inv = hold(p.key);
      expect(drinkPotion(state, inv, 0, {}).ok, p.key).toBe(true);
      expect(state.effects[0].key).toBe(p.potion.effect);
      expect(state.effects[0].t).toBe(p.potion.seconds);
    });
  });

  it('Güçlü Şifa: can iyileştirir; can doluysa içilmez ve tüketilmez', () => {
    const state = createMagicState(1);
    const sv = createSurvival();
    const inv = hold('item:iksir_guclu_sifa');
    expect(drinkPotion(state, inv, 0, { survival: sv })).toMatchObject({ ok: false, reason: 'can_dolu' });
    expect(inv.count('item:iksir_guclu_sifa')).toBe(2);
    applyDamage(sv, 15, { type: 'genel' });
    const hp = sv.hp;
    const r = drinkPotion(state, inv, 0, { survival: sv });
    expect(r.ok).toBe(true);
    expect(sv.hp).toBe(Math.min(sv.maxHp, hp + 20));
    expect(inv.count('item:iksir_guclu_sifa')).toBe(1);
  });

  it('Mana İksiri: mana yeniler; mana doluysa içilmez', () => {
    const state = createMagicState(1);
    const inv = hold('item:iksir_mana');
    expect(drinkPotion(state, inv, 0, {})).toMatchObject({ ok: false, reason: 'mana_dolu' });
    state.mana = 20;
    expect(drinkPotion(state, inv, 0, {}).ok).toBe(true);
    expect(state.mana).toBe(70);
    state.mana = 80;
    drinkPotion(state, inv, 0, {});
    expect(state.mana).toBe(100);
  });

  it('mevcut Şifa İksiri de içilir: can iyileşir, şişe döner, potionDrunk; can doluysa içilmez', () => {
    const state = createMagicState(1);
    const sv = createSurvival();
    const inv = hold('item:şifa_iksiri');
    expect(potionOf('item:şifa_iksiri')).toEqual({ heal: 12 });
    expect(drinkPotion(state, inv, 0, { survival: sv }).reason).toBe('can_dolu');
    applyDamage(sv, 15, { type: 'genel' });
    const hp = sv.hp;
    const r = drinkPotion(state, inv, 0, { survival: sv });
    expect(r.ok).toBe(true);
    expect(sv.hp).toBe(hp + 12);
    expect(inv.count(ITEM_BOTTLE)).toBe(1);
    expect(r.events.map((e) => e.type)).toEqual(['potionDrunk']);
    expect(potionOf('item:elma')).toBeNull();
    expect(potionOf(undefined)).toBeNull();
    expect(potionOf('item:iksir_hiz')).toMatchObject({ effect: 'hiz' });
  });

  it('iksir olmayan / boş yuva / geçersiz adres', () => {
    const state = createMagicState(1);
    const inv = new Inventory();
    inv.add('item:elma', 3);
    expect(drinkPotion(state, inv, 0, {})).toMatchObject({ ok: false, reason: 'iksir_degil' });
    expect(drinkPotion(state, inv, 5, {})).toMatchObject({ ok: false, reason: 'yok' });
    expect(drinkPotion(state, inv, 'zz', {})).toMatchObject({ ok: false, reason: 'yok' });
    expect(drinkPotion(state, inv, 's0', {}).reason).toBe('iksir_degil');
    expect(inv.count('item:elma')).toBe(3);
  });

  it('adresli yuva ("s3") ve yaratıcı mod (tüketmez)', () => {
    const state = createMagicState(1);
    const inv = new Inventory();
    inv.setSlot(3, 'item:iksir_guc', 4);
    expect(drinkPotion(state, inv, 's3', {}).ok).toBe(true);
    expect(inv.slotAt(3).count).toBe(3);
    const cinv = new Inventory({ infinite: true });
    cinv.setSlot(0, 'item:iksir_guc', 4);
    drinkPotion(createMagicState(1), cinv, 0, {});
    expect(cinv.slotAt(0).count).toBe(4);
  });

  it('çanta tamamen doluysa şişe sığmaz (bottleLeft)', () => {
    const inv = new Inventory();
    for (let i = 0; i < inv.size; i++) inv.setSlot(i, 'item:kılıç_demir');
    inv.setSlot(0, 'item:iksir_guc', 1);
    const r = drinkPotion(createMagicState(1), inv, 0, {});
    expect(r.ok).toBe(true);
    // 0. yuva boşaldığı için şişe oraya sığar
    expect(r.bottleLeft).toBe(0);
    expect(inv.count(ITEM_BOTTLE)).toBe(1);
  });
});

describe('Tarif zinciri: kazan ile üretilebilir iksirler Büyü Tozu / Kıymık ile beslenir', () => {
  it('dust/shard tüketen tarifler var', () => {
    expect(BREW_RECIPES.some((r) => r.in.some((p) => p.item === ITEM_DUST))).toBe(true);
    expect(BREW_RECIPES.some((r) => r.in.some((p) => p.item === ITEM_SHARD))).toBe(true);
  });
});
