import { describe, expect, it } from 'vitest';
import { Inventory } from './inventory.js';
import {
  addEffect, clearEffects, findEffect, hasEffect, hudEffects, removeEffect, restoreEffects, serializeEffects, tickEffects,
} from './magicEffects.js';
import { IDENTITY_MODS, computeMods, createMods, mergeEffectMods } from './magicMods.js';
import { EFFECT_LIMITS, EFFECT_LIST } from './magicData.js';

describe('addEffect: ekleme ve yenileme (üst üste binmez)', () => {
  it('yeni etki eklenir; olay üretir', () => {
    const list = [];
    const r = addEffect(list, 'hiz', 1, 180, 'iksir');
    expect(r.ok).toBe(true);
    expect(r.refreshed).toBe(false);
    expect(list).toEqual([{ key: 'hiz', level: 1, t: 180, total: 180 }]);
    expect(r.event).toMatchObject({ type: 'effectAdded', key: 'hiz', name: 'Hız', level: 1, seconds: 180, source: 'iksir', refreshed: false });
  });

  it('aynı etki yenilenir: seviye = en büyük, süre = en uzun', () => {
    const list = [];
    addEffect(list, 'guc', 1, 100);
    list[0].t = 40; // 60 sn harcandı
    const r = addEffect(list, 'guc', 1, 120);
    expect(r.refreshed).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0].t).toBe(120);
    expect(list[0].total).toBe(120);
    addEffect(list, 'guc', 2, 30); // daha kısa ama daha güçlü
    expect(list[0].level).toBe(2);
    expect(list[0].t).toBe(120); // süre kısalmaz
    addEffect(list, 'guc', 1, 10);
    expect(list[0].level).toBe(2); // seviye düşmez
  });

  it('farklı etkiler birlikte durur', () => {
    const list = [];
    addEffect(list, 'hiz', 1, 60);
    addEffect(list, 'ziplama', 1, 60);
    addEffect(list, 'guc', 1, 60);
    expect(list.map((e) => e.key)).toEqual(['hiz', 'ziplama', 'guc']);
    expect(hasEffect(list, 'ziplama')).toBe(1);
    expect(hasEffect(list, 'yenilenme')).toBe(0);
    expect(findEffect(list, 'guc')).toBe(list[2]);
  });

  it('geçersiz girdi reddedilir; seviye/süre kısılır', () => {
    const list = [];
    expect(addEffect(list, 'yok', 1, 10)).toMatchObject({ ok: false, reason: 'bilinmiyor' });
    expect(addEffect(list, '__proto__', 1, 10).ok).toBe(false);
    expect(addEffect(list, 'constructor', 1, 10).ok).toBe(false);
    expect(addEffect(list, 'hiz', 1, 0)).toMatchObject({ ok: false, reason: 'süre' });
    expect(addEffect(list, 'hiz', 1, -5).ok).toBe(false);
    expect(addEffect(list, 'hiz', 1, NaN).ok).toBe(false);
    expect(addEffect(list, 'hiz', 99, 1e9).ok).toBe(true);
    expect(list[0].level).toBe(EFFECT_LIMITS.maxLevel);
    expect(list[0].t).toBe(EFFECT_LIMITS.maxSeconds);
    clearEffects(list);
    expect(addEffect(list, 'hiz', 0.2, 10).ok).toBe(true);
    expect(list[0].level).toBe(1);
  });

  it('en çok maxActive etki', () => {
    const list = [];
    for (let i = 0; i < EFFECT_LIMITS.maxActive; i++) list.push({ key: 'hiz' + i, level: 1, t: 5, total: 5 });
    expect(addEffect(list, 'guc', 1, 5)).toMatchObject({ ok: false, reason: 'dolu' });
  });
});

describe('tickEffects / removeEffect / hud', () => {
  it('süre azalır, bitince silinir ve olay döner', () => {
    const list = [];
    addEffect(list, 'hiz', 1, 3);
    addEffect(list, 'guc', 1, 10);
    expect(tickEffects(list, 1)).toEqual([]);
    expect(list[0].t).toBeCloseTo(2, 5);
    const ended = tickEffects(list, 2.5);
    expect(ended).toEqual([{ type: 'effectEnded', key: 'hiz', name: 'Hız' }]);
    expect(list.map((e) => e.key)).toEqual(['guc']);
    tickEffects(list, 100);
    expect(list).toEqual([]);
    expect(tickEffects(list, 0)).toEqual([]);
    expect(tickEffects(list, -1)).toEqual([]);
  });

  it('removeEffect ve clearEffects', () => {
    const list = [];
    addEffect(list, 'hiz', 1, 3);
    expect(removeEffect(list, 'hiz')).toBe(true);
    expect(removeEffect(list, 'hiz')).toBe(false);
    addEffect(list, 'hiz', 1, 3);
    clearEffects(list);
    expect(list).toHaveLength(0);
  });

  it('hudEffects: en uzun süre önce, saniye yukarı yuvarlanır, oran 0..1', () => {
    const list = [];
    addEffect(list, 'hiz', 1, 30);
    addEffect(list, 'gece_gorusu', 1, 300);
    addEffect(list, 'guc', 2, 120);
    list[0].t = 7.2;
    const hud = hudEffects(list);
    expect(hud.map((h) => h.key)).toEqual(['gece_gorusu', 'guc', 'hiz']);
    expect(hud[2].secondsLeft).toBe(8);
    expect(hud[2].fraction).toBeCloseTo(7.2 / 30, 5);
    expect(hud[1].name).toBe('Güç 2');
    hud.forEach((h) => {
      expect(h.icon.length).toBeGreaterThan(0);
      expect(h.fraction).toBeGreaterThanOrEqual(0);
      expect(h.fraction).toBeLessThanOrEqual(1);
    });
  });
});

describe('Etki kaydı: serileştirme ve fuzz', () => {
  it('gidiş-dönüş', () => {
    const list = [];
    addEffect(list, 'hiz', 2, 91.37);
    addEffect(list, 'yenilenme', 1, 45);
    const back = restoreEffects(JSON.parse(JSON.stringify(serializeEffects(list))));
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ key: 'hiz', level: 2 });
    expect(back[0].t).toBeCloseTo(91.4, 1);
    expect(back[1].key).toBe('yenilenme');
  });

  it('bozuk girdiler asla atmaz; yalnız geçerli etkiler kalır', () => {
    const junk = [
      null, undefined, 5, 'x', {}, [], [null], [[]], [['hiz']], [['hiz', 1, 'a']], [['hiz', 1, -5]], [['yok', 1, 10]],
      [['__proto__', 1, 10]], [['constructor', 1, 10]], [{ key: 'hiz', level: 1, t: 10 }, { key: 'hiz', level: 3, t: 99 }],
      [['hiz', 1e9, 1e9, 1e9]], [['hiz', -4, 10, 5]], [[['hiz'], 1, 10]], new Array(500).fill(['hiz', 1, 10]),
      [{ __proto__: { key: 'hiz', level: 1, t: 10 } }], JSON.parse('[{"__proto__":{"key":"hiz"},"level":1,"t":10}]'),
    ];
    junk.forEach((j) => {
      let out;
      expect(() => { out = restoreEffects(j); }).not.toThrow();
      expect(Array.isArray(out)).toBe(true);
      expect(out.length).toBeLessThanOrEqual(EFFECT_LIMITS.maxActive);
      out.forEach((e) => {
        expect(EFFECT_LIST.map((d) => d.key)).toContain(e.key);
        expect(e.level).toBeGreaterThanOrEqual(1);
        expect(e.level).toBeLessThanOrEqual(EFFECT_LIMITS.maxLevel);
        expect(e.t).toBeGreaterThan(0);
        expect(e.t).toBeLessThanOrEqual(EFFECT_LIMITS.maxSeconds);
        expect(e.total).toBeGreaterThanOrEqual(e.t);
      });
      expect(new Set(out.map((e) => e.key)).size).toBe(out.length);
    });
    expect(restoreEffects([['hiz', 1e9, 1e9, 1e9]])[0]).toMatchObject({ level: 5, t: 3600 });
    expect({}.key).toBeUndefined();
  });
});

describe('computeMods: kimlik, etkiler, büyüler', () => {
  it('boş girdi → kimlik', () => {
    expect(computeMods(null, null)).toEqual(IDENTITY_MODS);
    expect(computeMods(new Inventory(), [])).toEqual(IDENTITY_MODS);
    expect(Object.isFrozen(IDENTITY_MODS)).toBe(true);
    const m = createMods();
    expect(m).toEqual(IDENTITY_MODS);
    m.speedMul = 5;
    expect(IDENTITY_MODS.speedMul).toBe(1);
  });

  it('etkilerin sayısal karşılığı', () => {
    const list = [];
    addEffect(list, 'hiz', 1, 60);
    addEffect(list, 'ziplama', 2, 60);
    addEffect(list, 'guc', 1, 60);
    addEffect(list, 'gece_gorusu', 1, 60);
    addEffect(list, 'ates_direnci', 1, 60);
    addEffect(list, 'su_solugu', 1, 60);
    addEffect(list, 'yenilenme', 2, 60);
    const m = computeMods(null, list);
    expect(m.speedMul).toBeCloseTo(1.3, 5);
    expect(m.jumpMul).toBeCloseTo(1.44, 5);
    expect(m.damageMul).toBeCloseTo(1.3, 5);
    expect(m.nightVision).toBe(true);
    expect(m.fireMul).toBe(0);
    expect(m.waterBreathing).toBe(true);
    expect(m.regen).toBeCloseTo(0.8, 5);
  });

  it('çarpan sınırları (hız 1,9, zıplama 1,7)', () => {
    const m = createMods();
    mergeEffectMods(m, { speedMul: 10, jumpMul: 10 });
    expect(m.speedMul).toBe(1.9);
    expect(m.jumpMul).toBe(1.7);
  });

  it('eldeki büyülü eşya: Keskinlik/Alev/Yağmacı/Geri Tepme', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:kılıç_elmas', 1, undefined, { keskinlik: 3, alev: 2, yagmaci: 2, geri_tepme: 1 });
    const m = computeMods(inv, null);
    expect(m.meleeBonus).toBeCloseTo(2.25, 5);
    expect(m.burnLevel).toBe(2);
    expect(m.slowLevel).toBe(0);
    expect(m.luck).toBeCloseTo(0.24, 5);
    expect(m.knockBonus).toBeCloseTo(2.5, 5);
    inv.selected = 1; // boş yuva
    expect(computeMods(inv, null)).toEqual(IDENTITY_MODS);
  });

  it('alet büyüleri: Verimlilik, İpek Dokunuş/Servet, Mıknatıs', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:kazma_demir', 1, undefined, { verimlilik: 5, servet: 3, miknatis: 1 });
    const m = computeMods(inv, null);
    expect(m.digMul).toBeCloseTo(1 + 1.5 + 1.25, 5);
    expect(m.fortune).toBe(3);
    expect(m.silkTouch).toBe(false);
    expect(m.magnet).toBe(true);
    inv.setSlot(0, 'item:kazma_demir', 1, undefined, { ipek_dokunus: 1 });
    expect(computeMods(inv, null).silkTouch).toBe(true);
  });

  it('yay ve asa büyüleri', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:yay', 1, undefined, { guc: 5, sonsuzluk: 1, buz: 2 });
    let m = computeMods(inv, null);
    expect(m.bowPowerMul).toBeCloseTo(2, 5);
    expect(m.infiniteAmmo).toBe(true);
    expect(m.slowLevel).toBe(2);
    inv.setSlot(0, 'item:asa_ates', 1, undefined, { mana_verimi: 3, buyu_gucu: 2 });
    m = computeMods(inv, null);
    expect(m.manaCostMul).toBeCloseTo(0.55, 5);
    expect(m.spellPowerMul).toBeCloseTo(1.4, 5);
  });

  it('giyilen zırh büyüleri: Hafif Adım, Ateş Direnci, Su Soluğu, Dikenler, Hız, Yenilenme, Koruma', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:çizme_demir', 1, undefined, { hafif_adim: 3, hiz: 2, koruma: 4 });
    inv.setSlot(1, 'item:miğfer_demir', 1, undefined, { su_solugu: 2, yenilenme: 2, ates_direnci: 1 });
    inv.setSlot(2, 'item:göğüslük_demir', 1, undefined, { dikenler: 3 });
    inv.equip(0);
    inv.equip(1);
    inv.equip(2);
    const m = computeMods(inv, null);
    expect(m.fallMul).toBeCloseTo(0.25, 5);
    expect(m.speedMul).toBeCloseTo(1.12, 5);
    expect(m.oxygenMul).toBe(3);
    expect(m.regen).toBeCloseTo(0.2, 5);
    expect(m.fireMul).toBeCloseTo(0.4, 5);
    expect(m.thorns).toBe(3);
    expect(m.protection).toBeCloseTo(2, 5);
  });

  it('zırh büyüsü elde tutulunca sayılmaz (yalnız giyilince)', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:çizme_demir', 1, undefined, { hafif_adim: 3 });
    expect(computeMods(inv, null).fallMul).toBe(1);
  });

  it('iksir + büyü birleşir; ateş direnci iksiri bağışıklık verir; out nesnesi yeniden kullanılır', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:çizme_demir', 1, undefined, { hiz: 3 });
    inv.equip(0);
    const list = [];
    addEffect(list, 'hiz', 1, 60);
    addEffect(list, 'ates_direnci', 1, 60);
    const out = createMods();
    const m = computeMods(inv, list, out);
    expect(m).toBe(out);
    expect(m.speedMul).toBeCloseTo(1.18 * 1.3, 5);
    expect(m.fireMul).toBe(0);
    const again = computeMods(new Inventory(), [], out);
    expect(again).toBe(out);
    expect(again).toEqual(IDENTITY_MODS);
  });

  it('geçersiz etki girdisi mods\'u bozmaz', () => {
    const m = computeMods(null, [{ key: 'yok', level: 3, t: 5 }, { key: '__proto__', level: 1, t: 5 }]);
    expect(m).toEqual(IDENTITY_MODS);
  });
});
