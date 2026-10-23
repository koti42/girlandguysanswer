import { describe, expect, it } from 'vitest';
import { Inventory } from './inventory.js';
import { addEffect } from './magicEffects.js';
import {
  addMana, createMagicState, learnSpell, magicHud, maxManaOf, restoreMagic, serializeMagic, spendMana, tickMagic,
  consumeManaCrystal,
} from './magicState.js';
import {
  canCast, castHeldSpell, castSpell, resolveBlink, spellCost, spellList, spellProjectileOpts,
} from './magicSpells.js';
import { computeMods, createMods } from './magicMods.js';
import { ITEM_MANA_CRYSTAL, MANA, SPELL_LIST, spellDef } from './magicData.js';
import { createMagic, magicUseKind, restoreMagicAll, serializeMagicAll } from './magic.js';

const EYE = { x: 10, y: 5.62, z: 10 };
const LOOK = { x: 0, y: 0, z: -1 };
const staffCtx = (item, extra) => Object.assign({ staff: { item }, eye: EYE, look: LOOK }, extra);

describe('MagicState: mana', () => {
  it('başlangıç değerleri ve azami mana', () => {
    const s = createMagicState(42);
    expect(s.mana).toBe(100);
    expect(s.maxMana).toBe(100);
    expect(maxManaOf(s)).toBe(100);
    expect(s.knownSpells).toEqual([]);
    expect(s.effects).toEqual([]);
    expect(s.enchantSeed).toBe(createMagicState(42).enchantSeed);
    expect(s.enchantSeed).not.toBe(createMagicState(43).enchantSeed);
  });

  it('yenilenme 4/sn; büyüden sonra 1 sn bekler; azamiyi aşmaz', () => {
    const s = createMagicState(1);
    s.mana = 50;
    tickMagic(s, 1);
    expect(s.mana).toBeCloseTo(54, 5);
    s.castDelay = MANA.regenDelay;
    tickMagic(s, 0.5);
    expect(s.mana).toBeCloseTo(54, 5); // bekleme
    tickMagic(s, 0.5);
    expect(s.mana).toBeCloseTo(54, 5);
    tickMagic(s, 1);
    expect(s.mana).toBeCloseTo(58, 5);
    tickMagic(s, 100);
    expect(s.mana).toBe(100);
    expect(tickMagic(s, 0)).toHaveLength(0);
    expect(tickMagic(s, -1)).toHaveLength(0);
  });

  it('manaRegenMul etkisi ve bekleme süreleri azalır', () => {
    const s = createMagicState(1);
    s.mana = 0;
    const m = createMods();
    m.manaRegenMul = 2;
    tickMagic(s, 1, m);
    expect(s.mana).toBeCloseTo(8, 5);
    s.cooldowns.ates_topu = 1;
    tickMagic(s, 0.4);
    expect(s.cooldowns.ates_topu).toBeCloseTo(0.6, 5);
    tickMagic(s, 1);
    expect(s.cooldowns.ates_topu).toBeUndefined();
  });

  it('spendMana / addMana sınırları', () => {
    const s = createMagicState(1);
    expect(spendMana(s, 30)).toBe(true);
    expect(s.mana).toBe(70);
    expect(spendMana(s, 71)).toBe(false);
    expect(s.mana).toBe(70);
    expect(spendMana(s, -1)).toBe(false);
    expect(addMana(s, 50)).toBe(30);
    expect(s.mana).toBe(100);
    expect(addMana(s, 0)).toBe(0);
    expect(addMana(s, -5)).toBe(0);
  });

  it('Mana Kristali: +10 azami, en çok +100, envanterden 1 tüketir', () => {
    const s = createMagicState(1);
    const inv = new Inventory();
    inv.add(ITEM_MANA_CRYSTAL, 12);
    for (let i = 0; i < 10; i++) {
      const r = consumeManaCrystal(s, inv);
      expect(r.ok).toBe(true);
      expect(r.event).toMatchObject({ type: 'manaCrystalUsed', max: 100 + (i + 1) * 10 });
    }
    expect(s.maxMana).toBe(200);
    expect(s.manaBonus).toBe(100);
    expect(inv.count(ITEM_MANA_CRYSTAL)).toBe(2);
    const over = consumeManaCrystal(s, inv);
    expect(over).toMatchObject({ ok: false, reason: 'azami' });
    expect(inv.count(ITEM_MANA_CRYSTAL)).toBe(2);
    expect(s.mana).toBeLessThanOrEqual(200);
    const s2 = createMagicState(1);
    expect(consumeManaCrystal(s2, new Inventory())).toMatchObject({ ok: false, reason: 'yok' });
    expect(consumeManaCrystal(s2).ok).toBe(true); // envanter verilmezse yalnız durum
  });

  it('tickMagic azami manayı güncel tutar', () => {
    const s = createMagicState(1);
    s.manaBonus = 30;
    s.mana = 100;
    tickMagic(s, 10);
    expect(s.maxMana).toBe(130);
    expect(s.mana).toBeCloseTo(130, 5);
  });
});

describe('canCast / castSpell', () => {
  it('başarılı: mana düşer, bekleme + yenilenme gecikmesi başlar, büyü öğrenilir, olay ve etkiler', () => {
    const s = createMagicState(1);
    const r = castSpell(s, 'ates_topu', staffCtx('item:asa_ates', { mods: createMods() }));
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(12);
    expect(s.mana).toBe(88);
    expect(s.cooldowns.ates_topu).toBe(1);
    expect(s.castDelay).toBe(MANA.regenDelay);
    expect(s.knownSpells).toEqual(['ates_topu']);
    expect(r.durability).toBe(1);
    expect(r.event).toEqual({ type: 'spellCast', spell: 'ates_topu', name: 'Ateş Topu', cost: 12, mana: 88 });
    const p = r.effects.find((e) => e.kind === 'projectile');
    expect(p).toMatchObject({
      projectile: 'buyuates', speed: 22, gravity: 3, damage: 7, radius: 2.2, burn: 1, slow: 0, dx: 0, dy: 0, dz: -1,
    });
    expect(p.x).toBeCloseTo(10, 5);
    expect(p.z).toBeCloseTo(9.5, 5);
    expect(r.effects.find((e) => e.kind === 'fx')).toMatchObject({ name: 'castSpell', spell: 'ates_topu' });
    expect(spellProjectileOpts(p)).toMatchObject({ damage: 7, kindSrc: 'magic', aoe: { r: 2.2 }, status: { burn: 1, slow: 0 } });
  });

  it('nedenler: bilinmiyor, ölü, asa_yok, bekleme, mana', () => {
    const s = createMagicState(1);
    expect(castSpell(s, 'yok', staffCtx('item:asa_ates'))).toMatchObject({ ok: false, reason: 'bilinmiyor' });
    expect(castSpell(s, '__proto__', staffCtx('item:asa_ates')).ok).toBe(false);
    expect(castSpell(s, 'ates_topu', staffCtx('item:asa_ates', { dead: true }))).toMatchObject({ ok: false, reason: 'ölü' });
    expect(castSpell(s, 'ates_topu', staffCtx('item:asa_buz'))).toMatchObject({ ok: false, reason: 'asa_yok' });
    expect(castSpell(s, 'ates_topu', { eye: EYE, look: LOOK })).toMatchObject({ ok: false, reason: 'asa_yok' });
    expect(castSpell(s, 'ates_topu', staffCtx('item:kılıç_demir'))).toMatchObject({ ok: false, reason: 'asa_yok' });
    expect(castSpell(s, 'ates_topu', undefined)).toMatchObject({ ok: false, reason: 'asa_yok' });
    s.cooldowns.ates_topu = 0.5;
    expect(castSpell(s, 'ates_topu', staffCtx('item:asa_ates'))).toMatchObject({ ok: false, reason: 'bekleme' });
    delete s.cooldowns.ates_topu;
    s.mana = 5;
    const r = castSpell(s, 'ates_topu', staffCtx('item:asa_ates'));
    expect(r).toMatchObject({ ok: false, reason: 'mana', cost: 12 });
    expect(r.message).toMatch(/mana/);
    expect(s.mana).toBe(5);
    expect(s.knownSpells).toEqual([]);
    expect(r.effects).toEqual([]);
  });

  it('mana maliyeti Mana Verimi ile düşer (en az 1)', () => {
    expect(spellCost(spellDef('ates_topu'), null)).toBe(12);
    const m = createMods();
    m.manaCostMul = 0.55;
    expect(spellCost(spellDef('ates_topu'), m)).toBe(7);
    m.manaCostMul = 0.001;
    expect(spellCost(spellDef('ates_topu'), m)).toBe(1);
  });

  it('bekleme dolunca tekrar yapılır; ardışık atış mana tüketir', () => {
    const s = createMagicState(1);
    expect(castSpell(s, 'buz_mizragi', staffCtx('item:asa_buz')).ok).toBe(true);
    expect(canCast(s, 'buz_mizragi', staffCtx('item:asa_buz'))).toMatchObject({ ok: false, reason: 'bekleme' });
    tickMagic(s, 0.9);
    expect(canCast(s, 'buz_mizragi', staffCtx('item:asa_buz')).ok).toBe(true);
    let casts = 1;
    for (let i = 0; i < 20; i++) {
      tickMagic(s, 0.9);
      if (castSpell(s, 'buz_mizragi', staffCtx('item:asa_buz')).ok) casts++;
    }
    expect(casts).toBeLessThan(21); // mana tükenir (regen 1 sn geç başlar)
    expect(s.mana).toBeGreaterThanOrEqual(0);
  });

  it('Büyü Gücü hasarı/şifayı ölçekler', () => {
    const s = createMagicState(1);
    const m = createMods();
    m.spellPowerMul = 1.4;
    const r = castSpell(s, 'ates_topu', staffCtx('item:asa_ates', { mods: m }));
    expect(r.effects.find((e) => e.kind === 'projectile').damage).toBeCloseTo(9.8, 5);
    const h = castSpell(createMagicState(1), 'sifa_isigi', staffCtx('item:asa_sifa', { mods: m }));
    expect(h.effects.find((e) => e.kind === 'heal').amount).toBeCloseTo(11.2, 5);
  });

  it('dört büyünün etki türleri: projectile, projectile+slow, heal, blink', () => {
    const kinds = {};
    SPELL_LIST.forEach((sp) => {
      const s = createMagicState(1);
      const r = castSpell(s, sp.key, staffCtx(sp.staff));
      expect(r.ok, sp.key).toBe(true);
      kinds[sp.key] = r.effects.map((e) => e.kind);
    });
    expect(kinds.ates_topu).toContain('projectile');
    expect(kinds.buz_mizragi).toContain('projectile');
    expect(kinds.sifa_isigi).toContain('heal');
    expect(kinds.kuantum_sicrayisi).toContain('blink');
    const buz = castSpell(createMagicState(1), 'buz_mizragi', staffCtx('item:asa_buz')).effects[0];
    expect(buz).toMatchObject({ projectile: 'buyubuz', slow: 1, burn: 0, radius: 0, gravity: 0 });
    const blink = castSpell(createMagicState(1), 'kuantum_sicrayisi', staffCtx('item:asa_kuantum')).effects[0];
    expect(blink).toMatchObject({ kind: 'blink', distance: 8 });
  });

  it('bakış yönü normalleştirilir; bozuk bakış varsayılana düşer', () => {
    const r = castSpell(createMagicState(1), 'ates_topu', staffCtx('item:asa_ates', { look: { x: 0, y: 3, z: -4 } }));
    const p = r.effects[0];
    expect(p.dy).toBeCloseTo(0.6, 5);
    expect(p.dz).toBeCloseTo(-0.8, 5);
    const r2 = castSpell(createMagicState(1), 'ates_topu', staffCtx('item:asa_ates', { look: { x: NaN, y: NaN, z: NaN } }));
    expect(r2.effects[0].dz).toBe(-1);
    const r3 = castSpell(createMagicState(1), 'ates_topu', staffCtx('item:asa_ates', { look: { x: 0, y: 0, z: 0 } }));
    expect(r3.effects[0].dz).toBe(-1);
  });
});

describe('castHeldSpell', () => {
  it('eldeki asayı bulur, büyüyü yapar ve asayı aşındırır', () => {
    const s = createMagicState(1);
    const inv = new Inventory();
    inv.add('item:asa_ates', 1);
    const dur0 = inv.held().dur;
    const r = castHeldSpell(s, inv, { eye: EYE, look: LOOK });
    expect(r.ok).toBe(true);
    expect(r.spell).toBe('ates_topu');
    expect(r.broke).toBe(false);
    expect(inv.held().dur).toBe(dur0 - 1);
    expect(s.mana).toBe(88);
  });

  it('asa değilse asa_yok; başarısız büyü asayı aşındırmaz', () => {
    const s = createMagicState(1);
    const inv = new Inventory();
    inv.add('item:kılıç_demir', 1);
    expect(castHeldSpell(s, inv, { eye: EYE, look: LOOK })).toMatchObject({ ok: false, reason: 'asa_yok', spell: null });
    const inv2 = new Inventory();
    inv2.add('item:asa_ates', 1);
    s.mana = 1;
    const d0 = inv2.held().dur;
    expect(castHeldSpell(s, inv2, { eye: EYE, look: LOOK }).reason).toBe('mana');
    expect(inv2.held().dur).toBe(d0);
    expect(castHeldSpell(s, new Inventory(), {}).reason).toBe('asa_yok');
  });

  it('asa kırılınca broke=true ve yuva boşalır; asa büyüleri (Mana Verimi) hesaba katılır', () => {
    const s = createMagicState(1);
    const inv = new Inventory();
    inv.setSlot(0, 'item:asa_ates', 1, 1, { mana_verimi: 3, buyu_gucu: 3 });
    const r = castHeldSpell(s, inv, { eye: EYE, look: LOOK });
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(7);
    expect(r.effects.find((e) => e.kind === 'projectile').damage).toBeCloseTo(7 * 1.6, 5);
    expect(r.broke).toBe(true);
    expect(inv.held()).toBeNull();
  });

  it('Dayanıklılık asa aşınmasını azaltır', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:asa_buz', 1, 250, { dayaniklilik: 3 });
    const s = createMagicState(1);
    s.mana = 100000;
    s.maxMana = 100000;
    let casts = 0;
    for (let i = 0; i < 100; i++) {
      s.cooldowns = {};
      if (castHeldSpell(s, inv, { eye: EYE, look: LOOK }).ok) casts++;
    }
    expect(casts).toBe(100);
    expect(250 - inv.held().dur).toBeLessThan(55);
    expect(250 - inv.held().dur).toBeGreaterThan(5);
  });
});

describe('resolveBlink', () => {
  it('boşta azami mesafe; engelde bir adım önce durur; hemen engel → null', () => {
    const free = () => true;
    const r = resolveBlink({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 8, free);
    expect(r.distance).toBeCloseTo(8, 5);
    expect(r.z).toBeCloseTo(-8, 5);
    const wallAt = (x, y, z) => z > -4.2;
    const r2 = resolveBlink({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -2 }, 8, (x, y, z) => wallAt(x, y, z));
    expect(r2.z).toBeCloseTo(-4, 5);
    expect(resolveBlink({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 8, () => false)).toBeNull();
    expect(resolveBlink({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 8, free)).toBeNull();
    expect(resolveBlink({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0, free)).toBeNull();
    // yukarı bakışta da çalışır
    const up = resolveBlink({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 3, free);
    expect(up.y).toBeCloseTo(3, 5);
  });
});

describe('spellList ve HUD', () => {
  it('spellList: bilinenler, bekleme, mana maliyeti', () => {
    const s = createMagicState(1);
    learnSpell(s, 'ates_topu');
    expect(learnSpell(s, 'ates_topu')).toBe(false);
    expect(learnSpell(s, 'yok')).toBe(false);
    s.cooldowns.buz_mizragi = 0.4;
    const list = spellList(s);
    expect(list).toHaveLength(4);
    expect(list.find((x) => x.key === 'ates_topu')).toMatchObject({ known: true, manaCost: 12, name: 'Ateş Topu' });
    expect(list.find((x) => x.key === 'buz_mizragi')).toMatchObject({ known: false, cooldownLeft: 0.4 });
  });

  it('magicHud: mana, etkiler, büyü (bekleme oranı)', () => {
    const s = createMagicState(1);
    addEffect(s.effects, 'hiz', 1, 90);
    s.mana = 63.7;
    s.cooldowns.ates_topu = 0.5;
    let hud = magicHud(s, 'item:asa_ates');
    expect(hud.mana).toEqual({ value: 63, max: 100 });
    expect(hud.effects[0]).toMatchObject({ key: 'hiz', secondsLeft: 90, name: 'Hız' });
    expect(hud.spell).toMatchObject({ key: 'ates_topu', name: 'Ateş Topu', cooldown01: 0.5, ready: false, manaCost: 12 });
    s.cooldowns = {};
    hud = magicHud(s, 'item:asa_ates');
    expect(hud.spell.ready).toBe(true);
    expect(hud.spell.cooldown01).toBe(0);
    expect(magicHud(s, 'item:kılıç_demir').spell).toBeNull();
    expect(magicHud(s, null).spell).toBeNull();
    s.mana = 3;
    expect(magicHud(s, 'item:asa_ates').spell.ready).toBe(false);
  });
});

describe('MagicState kaydı', () => {
  it('gidiş-dönüş: tohum, sayaçlar, mana, azami bonus, büyüler, etkiler, beklemeler', () => {
    const s = createMagicState(7);
    s.enchantSeed = 123456789;
    s.enchantCount = 4;
    s.rerolls = 2;
    s.manaBonus = 30;
    s.mana = 77.77;
    learnSpell(s, 'buz_mizragi');
    addEffect(s.effects, 'guc', 1, 33);
    s.cooldowns.buz_mizragi = 0.5;
    const json = JSON.parse(JSON.stringify(serializeMagic(s)));
    const t = restoreMagic(createMagicState(0), json);
    expect(t.enchantSeed).toBe(123456789);
    expect(t.enchantCount).toBe(4);
    expect(t.rerolls).toBe(2);
    expect(t.manaBonus).toBe(30);
    expect(t.maxMana).toBe(130);
    expect(t.mana).toBeCloseTo(77.8, 1);
    expect(t.knownSpells).toEqual(['buz_mizragi']);
    expect(t.effects[0]).toMatchObject({ key: 'guc', level: 1 });
    expect(t.cooldowns.buz_mizragi).toBeCloseTo(0.5, 1);
  });

  it('bozuk/saldırgan girdi asla atmaz ve sınırlar korunur', () => {
    const junk = [
      null, undefined, 5, 'x', [], [1], {}, { es: 'x', mana: 'y' }, { mana: 1e9, mb: 1e9 }, { mb: -50, mana: -9 }, { mb: 37 },
      { spells: ['yok', '__proto__', 'ates_topu', 'ates_topu', 5, null, {}] }, { spells: 'ates_topu' },
      { fx: [['hiz', 1, 1e9]], cd: { ates_topu: 1e9, yok: 5, __proto__: { buz_mizragi: 5 } } },
      JSON.parse('{"__proto__":{"es":5,"mana":1},"cd":{"__proto__":{"ates_topu":9}},"spells":["ates_topu"]}'),
      { es: 4294967296 * 4, ec: -5, rr: 1e12 },
    ];
    junk.forEach((j) => {
      const s = createMagicState(3);
      expect(() => restoreMagic(s, j)).not.toThrow();
      expect(s.mana).toBeGreaterThanOrEqual(0);
      expect(s.mana).toBeLessThanOrEqual(s.maxMana);
      expect(s.manaBonus).toBeGreaterThanOrEqual(0);
      expect(s.manaBonus).toBeLessThanOrEqual(100);
      expect(s.manaBonus % 10).toBe(0);
      expect(s.maxMana).toBe(100 + s.manaBonus);
      expect(s.enchantSeed).toBeGreaterThanOrEqual(0);
      expect(s.enchantSeed).toBeLessThanOrEqual(4294967295);
      expect(Number.isInteger(s.enchantCount) && s.enchantCount >= 0).toBe(true);
      s.knownSpells.forEach((k) => expect(spellDef(k)).not.toBeNull());
      expect(new Set(s.knownSpells).size).toBe(s.knownSpells.length);
      Object.keys(s.cooldowns).forEach((k) => {
        expect(spellDef(k)).not.toBeNull();
        expect(s.cooldowns[k]).toBeLessThanOrEqual(60);
      });
      expect({}.keskinlik).toBeUndefined();
      expect(Object.keys(Object.prototype)).toEqual([]);
    });
    expect(restoreMagic(createMagicState(0), { mb: 37 }).manaBonus).toBe(30);
    expect(restoreMagic(createMagicState(0), { spells: ['yok', 'ates_topu', 'ates_topu'] }).knownSpells).toEqual(['ates_topu']);
  });

  it('createMagic / serializeMagicAll / restoreMagicAll (kazan dahil), eski kayıtta alan yoksa varsayılan', () => {
    const m = createMagic(5);
    m.state.manaBonus = 20;
    m.state.maxMana = 120;
    m.brew.restore({ '1,2,3': ['sifa', 2, 10, 30, 0] });
    const raw = JSON.parse(JSON.stringify(serializeMagicAll(m)));
    const m2 = restoreMagicAll(createMagic(0), raw);
    expect(m2.state.manaBonus).toBe(20);
    expect(m2.brew.get({ x: 1, y: 2, z: 3 })).toMatchObject({ recipeId: 'sifa', bottles: 2 });
    const m3 = restoreMagicAll(createMagic(9), undefined);
    expect(m3.state.mana).toBe(100);
    expect(m3.brew.list()).toEqual([]);
    expect(() => restoreMagicAll(createMagic(1), 'çöp')).not.toThrow();
    expect(() => restoreMagicAll(createMagic(1), JSON.parse('{"__proto__":{"state":{"mb":90}},"state":5,"brew":[]}'))).not.toThrow();
  });
});

describe('magicUseKind', () => {
  it('kullan türü yönlendirmesi', () => {
    expect(magicUseKind('item:asa_ates')).toBe('asa');
    expect(magicUseKind('item:mana_kristali')).toBe('mana_kristali');
    expect(magicUseKind('item:iksir_hiz')).toBe('iksir');
    expect(magicUseKind('item:şifa_iksiri')).toBe('iksir');
    expect(magicUseKind('item:elma')).toBeNull();
    expect(magicUseKind('item:kılıç_demir')).toBeNull();
    expect(magicUseKind(undefined)).toBeNull();
  });
});

describe('Asa ile entegre: computeMods → cast', () => {
  it('iksir etkisi büyü hasarını değiştirmez ama Mana Verimi asa büyüsü maliyeti etkiler', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:asa_sifa', 1, undefined, { mana_verimi: 2 });
    const s = createMagicState(1);
    addEffect(s.effects, 'guc', 1, 60);
    const m = computeMods(inv, s.effects);
    expect(m.damageMul).toBeCloseTo(1.3, 5);
    expect(m.spellPowerMul).toBe(1);
    expect(spellCost(spellDef('sifa_isigi'), m)).toBe(18);
  });
});
