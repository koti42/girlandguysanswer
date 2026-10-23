import { describe, expect, it } from 'vitest';
import { Inventory } from './inventory.js';
import {
  EXHAUSTION, SURVIVAL, addExhaustion, applyDamage, armorReduction, canEat, collectDeathDrops,
  consumePhysicsEvents, createSurvival, eat, heal, hudView, respawn, restoreSurvival, serializeSurvival,
  setArmor, update,
} from './survival.js';

const DT = 1 / 60;
function tick(s, seconds, ctx) {
  const n = Math.round(seconds / DT);
  const evs = [];
  for (let i = 0; i < n; i++) {
    const e = update(s, DT, ctx);
    for (let k = 0; k < e.length; k++) evs.push(e[k]);
  }
  return evs;
}

describe('createSurvival', () => {
  it('varsayılanlar: can 20, açlık 20, oksijen 15 sn', () => {
    const s = createSurvival();
    expect(s.hp).toBe(20);
    expect(s.hunger).toBe(20);
    expect(s.oxygen).toBe(15);
    expect(s.dead).toBe(false);
    const c = createSurvival({ maxHp: 30, easy: true });
    expect(c.hp).toBe(30);
    expect(c.easy).toBe(true);
  });
});

describe('applyDamage', () => {
  it('hasar uygular, olay ve kırmızı parlama üretir', () => {
    const s = createSurvival();
    expect(applyDamage(s, 4, { type: 'yaratık' })).toBe(4);
    expect(s.hp).toBe(16);
    expect(s.hurtFlash).toBe(1);
    expect(s.events[0]).toMatchObject({ type: 'damage', amount: 4, cause: 'yaratık' });
    expect(applyDamage(s, 0)).toBe(0);
    expect(applyDamage(s, -3)).toBe(0);
  });

  it('dokunulmazlık karesi: aynı/küçük hasar yok, büyükse yalnızca fark; süre bitince tam', () => {
    const s = createSurvival();
    s.hunger = 10;
    s.saturation = 0;
    applyDamage(s, 4);
    expect(applyDamage(s, 3)).toBe(0);
    expect(applyDamage(s, 4)).toBe(0);
    expect(applyDamage(s, 6)).toBe(2);
    expect(s.hp).toBe(14);
    tick(s, 0.55);
    expect(s.invuln).toBe(0);
    expect(applyDamage(s, 3)).toBe(3);
    expect(s.hp).toBe(11);
  });

  it('periyodik türler (boğulma/açlık/boşluk) dokunulmazlığı yok sayar', () => {
    const s = createSurvival();
    applyDamage(s, 4);
    expect(applyDamage(s, 2, { type: 'boğulma' })).toBe(2);
    expect(applyDamage(s, 1, { type: 'açlık' })).toBe(1);
  });

  it('zırh azaltır (%4/puan, tavan %80); düşme/boğulma zırhı yok sayar; en az 0,5', () => {
    const s = createSurvival();
    setArmor(s, 10);
    expect(armorReduction(10)).toBeCloseTo(0.4, 9);
    expect(applyDamage(s, 10)).toBe(6);
    tick(s, 0.6);
    expect(applyDamage(s, 10, { type: 'düşme' })).toBe(10);
    const t = createSurvival();
    setArmor(t, 100);
    expect(t.armor).toBe(20);
    expect(armorReduction(20)).toBeCloseTo(0.8, 9);
    expect(applyDamage(t, 10)).toBe(2);
    tick(t, 0.6);
    expect(applyDamage(t, 0.2)).toBe(0.5);
  });

  it('ölüm: dead, olay, nedeni; ölüye hasar 0; respawn her şeyi sıfırlar', () => {
    const s = createSurvival();
    applyDamage(s, 25, { type: 'lav' });
    expect(s.hp).toBe(0);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('lav');
    expect(s.events.some((e) => e.type === 'death' && e.cause === 'lav')).toBe(true);
    expect(applyDamage(s, 5)).toBe(0);
    expect(heal(s, 5)).toBe(0);
    respawn(s);
    expect(s.dead).toBe(false);
    expect(s.hp).toBe(20);
    expect(s.invuln).toBeGreaterThan(1);
    expect(applyDamage(s, 5)).toBe(0); // doğuş koruması
  });

  it("kolay mod ve inşa modunda hasarsız (ölmez)", () => {
    const e = createSurvival({ easy: true });
    expect(applyDamage(e, 100, { type: 'yaratık' })).toBe(0);
    expect(e.hp).toBe(20);
    const s = createSurvival();
    expect(applyDamage(s, 100, { mode: 'insa' })).toBe(0);
    expect(s.hp).toBe(20);
  });
});

describe('iyileşme ve yemek', () => {
  it('heal tavana kısılır, eklenen miktarı döner', () => {
    const s = createSurvival();
    applyDamage(s, 6);
    expect(heal(s, 4)).toBe(4);
    expect(heal(s, 10)).toBe(2);
    expect(s.hp).toBe(20);
    expect(heal(s, 3)).toBe(0);
  });

  it('eat: açlık + doygunluk + can; tok iken yenmez, can veren yenir', () => {
    const s = createSurvival();
    s.hunger = 10;
    s.saturation = 0;
    applyDamage(s, 8);
    const r = eat(s, { hunger: 6, heal: 2 });
    expect(r.ate).toBe(true);
    expect(s.hunger).toBe(16);
    expect(s.saturation).toBeCloseTo(3.6, 9);
    expect(s.hp).toBe(14);
    s.hunger = 20;
    expect(canEat(s, { hunger: 4, heal: 0 })).toBe(false);
    expect(eat(s, { hunger: 4, heal: 0 }).ate).toBe(false);
    expect(canEat(s, { hunger: 0, heal: 12 })).toBe(true); // iksir
    s.hp = 20;
    expect(canEat(s, { hunger: 0, heal: 12 })).toBe(false);
    expect(canEat(s, null)).toBe(false);
  });

  it('yavaş iyileşme: açlık ≥ 18 iken 4 sn’de 1 can; doygunluk yoksa', () => {
    const s = createSurvival();
    s.hunger = 18;
    s.saturation = 0;
    applyDamage(s, 6);
    tick(s, 3.9);
    expect(s.hp).toBe(14);
    tick(s, 0.2);
    expect(s.hp).toBe(15);
  });

  it('hızlı iyileşme: tam açlık + doygunluk iken 0,5 sn’de 1 can', () => {
    const s = createSurvival();
    s.saturation = 5;
    applyDamage(s, 6);
    tick(s, 2.05);
    expect(s.hp).toBeGreaterThanOrEqual(18);
  });

  it('açlık < 18 iken iyileşme yok', () => {
    const s = createSurvival();
    s.hunger = 12;
    s.saturation = 0;
    applyDamage(s, 6);
    tick(s, 12);
    expect(s.hp).toBe(14);
  });
});

describe('açlık ve egzersiz', () => {
  it('egzersiz 4 olunca önce doygunluk, sonra açlık erir', () => {
    const s = createSurvival();
    s.saturation = 1;
    addExhaustion(s, 4.1);
    update(s, DT, {});
    expect(s.saturation).toBe(0);
    expect(s.hunger).toBe(20);
    addExhaustion(s, 4);
    update(s, DT, {});
    expect(s.hunger).toBe(19);
  });

  it('koşu mesafesi egzersiz üretir; yürüme üretmez; kolay modda hiç', () => {
    const s = createSurvival();
    s.saturation = 0;
    for (let i = 0; i < 100; i++) update(s, DT, { sprinting: true, moved: 5.6 * DT });
    expect(s.exhaustion).toBeGreaterThan(0.8);
    const w = createSurvival();
    for (let i = 0; i < 100; i++) update(w, DT, { moved: 4.3 * DT });
    expect(w.exhaustion).toBe(0);
    const e = createSurvival({ easy: true });
    for (let i = 0; i < 600; i++) update(e, DT, { sprinting: true, moved: 5.6 * DT });
    expect(e.hunger).toBe(20);
  });

  it('açlık 0: 4 sn’de bir 1 hasar, öldürmez (1 cana kadar); starveKills ile öldürür', () => {
    const s = createSurvival();
    s.hunger = 0;
    s.saturation = 0;
    tick(s, 4.1);
    expect(s.hp).toBe(19);
    tick(s, 120);
    expect(s.hp).toBe(1);
    expect(s.dead).toBe(false);
    const k = createSurvival({ starveKills: true });
    k.hunger = 0;
    k.saturation = 0;
    tick(k, 100);
    expect(k.dead).toBe(true);
    expect(k.deathCause).toBe('açlık');
  });

  it('kolay modda açlık hasarı yok', () => {
    const s = createSurvival({ easy: true });
    s.hunger = 0;
    tick(s, 30);
    expect(s.hp).toBe(20);
  });
});

describe('oksijen ve temas hasarı', () => {
  it('suyun altında 15 sn sonra boğulma hasarı (2/sn), yüzeyde hızla dolar', () => {
    const s = createSurvival();
    s.hunger = 10;
    s.saturation = 0;
    tick(s, 14.5, { headInWater: true });
    expect(s.hp).toBe(20);
    expect(s.oxygen).toBeGreaterThan(0.4);
    const evs = tick(s, 2.6, { headInWater: true });
    expect(evs.some((e) => e.type === 'drowning')).toBe(true);
    expect(s.hp).toBeLessThanOrEqual(16);
    expect(s.oxygen).toBe(0);
    tick(s, 3.5, {});
    expect(s.oxygen).toBe(15);
    expect(s.drownTimer).toBe(0);
  });

  it('suda boğularak ölünce cause boğulma', () => {
    const s = createSurvival();
    s.hunger = 10;
    s.saturation = 0;
    tick(s, 40, { headInWater: true });
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('boğulma');
  });

  it('suda nefes yeteneği oksijeni korur', () => {
    const s = createSurvival();
    tick(s, 30, { headInWater: true, waterBreathing: true });
    expect(s.oxygen).toBe(15);
    expect(s.hp).toBe(20);
  });

  it('lav teması (contactDps 6) hızla öldürür; kaktüs yavaş yıpratır', () => {
    const s = createSurvival();
    s.hunger = 10;
    s.saturation = 0;
    tick(s, 1.05, { contactDps: 6, inLava: true });
    expect(s.hp).toBeLessThanOrEqual(14);
    expect(s.hp).toBeGreaterThan(8);
    tick(s, 5, { contactDps: 6, inLava: true });
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('lav');
    const c = createSurvival();
    c.hunger = 10;
    c.saturation = 0;
    tick(c, 3.05, { contactDps: 1 });
    expect(c.hp).toBeLessThan(20);
    expect(c.hp).toBeGreaterThan(16);
    expect(c.events.length >= 0).toBe(true);
  });
});

describe('fizik olayları', () => {
  it('düşme hasarı uygular; zıplama egzersiz; boşluk öldürür / kolayda kurtarma', () => {
    const s = createSurvival();
    expect(consumePhysicsEvents(s, [{ type: 'fall', damage: 5 }], {})).toBe(false);
    expect(s.hp).toBe(15);
    const ex0 = s.exhaustion;
    consumePhysicsEvents(s, [{ type: 'jump' }], {});
    expect(s.exhaustion - ex0).toBeCloseTo(EXHAUSTION.jump, 9);
    consumePhysicsEvents(s, [{ type: 'jump' }], { sprinting: true });
    expect(s.exhaustion - ex0).toBeCloseTo(EXHAUSTION.jump + EXHAUSTION.sprintJump, 9);
    expect(consumePhysicsEvents(s, [{ type: 'void' }], {})).toBe(true);
    expect(s.dead).toBe(true);
    expect(s.deathCause).toBe('boşluk');
    const e = createSurvival({ easy: true });
    expect(consumePhysicsEvents(e, [{ type: 'void' }], {})).toBe(true);
    expect(e.dead).toBe(false);
    expect(e.events.some((x) => x.type === 'rescue')).toBe(true);
    const i = createSurvival();
    consumePhysicsEvents(i, [{ type: 'fall', damage: 9 }], { mode: 'insa' });
    expect(i.hp).toBe(20);
  });
});

describe('ölüm düşürmeleri', () => {
  it('envanter + zırh düşer; clear envanteri boşaltır; kolay modda eşyalar kalır', () => {
    const inv = new Inventory();
    inv.add('item:kömür', 12);
    inv.add('item:sopa', 3);
    const s = createSurvival();
    applyDamage(s, 50, { type: 'yaratık' });
    const d = collectDeathDrops(s, inv, {});
    expect(d.keep).toBe(false);
    expect(d.cause).toBe('yaratık');
    expect(d.respawn).toBe('başlangıç');
    expect(d.despawnSeconds).toBe(SURVIVAL.deathDropSeconds);
    expect(d.drops.find((x) => x.item === 'item:kömür').count).toBe(12);
    expect(inv.count('item:kömür')).toBe(12);
    const total = d.drops.reduce((a, x) => a + x.count, 0);
    expect(total).toBe(15);
    expect(collectDeathDrops(s, inv, { hasBed: true }).respawn).toBe('yatak');
    collectDeathDrops(s, inv, { clear: true });
    expect(inv.isEmpty()).toBe(true);
    const e = createSurvival({ easy: true });
    inv.add('item:sopa', 2);
    const k = collectDeathDrops(e, inv, { clear: true });
    expect(k.keep).toBe(true);
    expect(k.drops).toEqual([]);
    expect(inv.count('item:sopa')).toBe(2);
  });

  it('düz {slots,armor} nesnesi ve boş girdi', () => {
    const s = createSurvival();
    const d = collectDeathDrops(s, { slots: [null, { item: 'x', count: 2, dur: 5 }], armor: [{ item: 'y', count: 1 }] }, {});
    expect(d.drops).toEqual([{ item: 'x', count: 2, dur: 5 }, { item: 'y', count: 1 }]);
    expect(collectDeathDrops(s, null, {}).drops).toEqual([]);
  });
});

describe('kayıt', () => {
  it('serialize/restore gidiş-dönüş; bozuk veri güvenle kısılır', () => {
    const s = createSurvival();
    applyDamage(s, 7);
    s.hunger = 11;
    s.saturation = 2;
    const data = serializeSurvival(s);
    const t = createSurvival();
    restoreSurvival(t, data);
    expect(t.hp).toBe(13);
    expect(t.hunger).toBe(11);
    expect(t.saturation).toBe(2);
    restoreSurvival(t, { hp: 'zzz', hunger: 999, saturation: -4, oxygen: NaN, maxHp: 1e9 });
    expect(t.maxHp).toBe(60);
    expect(t.hp).toBe(60);
    expect(t.hunger).toBe(20);
    expect(t.saturation).toBe(0);
    expect(t.oxygen).toBe(15);
    restoreSurvival(t, null);
    expect(t.dead).toBe(false);
    restoreSurvival(t, { hp: 0 });
    expect(t.hp).toBe(0.5); // kayıttan ölü yüklenmez
  });

  it('hudView özet alanları', () => {
    const s = createSurvival();
    expect(hudView(s).showOxygen).toBe(false);
    s.oxygen = 10;
    applyDamage(s, 16);
    const v = hudView(s);
    expect(v.showOxygen).toBe(true);
    expect(v.lowHealth).toBe(true);
    expect(v.hurtFlash).toBe(1);
  });
});

describe('belirlenimcilik', () => {
  it('aynı ctx dizisi aynı durum', () => {
    const run = () => {
      const s = createSurvival();
      for (let i = 0; i < 3000; i++) {
        update(s, DT, {
          sprinting: i % 400 < 200, moved: 5 * DT, headInWater: i % 900 > 700, contactDps: i % 1300 > 1250 ? 1 : 0,
        });
        if (i % 500 === 0) applyDamage(s, 3, { type: 'yaratık' });
      }
      return JSON.stringify(serializeSurvival(s));
    };
    expect(run()).toBe(run());
  });
});
