import { describe, expect, it } from 'vitest';
import { B, breakTime, resolveDrops } from './blocks.js';
import { Inventory } from './inventory.js';
import { IDENTITY_MODS, computeMods, createMods } from './magicMods.js';
import { createPlayerBody, stepPlayer } from './physics.js';
import { applyDamage, consumePhysicsEvents, createSurvival } from './survival.js';
import {
  applyTechMods, createShieldHook, findJetpack, jetpackHud, jetpackStatus, onBlockBrokenWithTool, portalGunFire, portalGunStatus, refuelJetpack,
  shieldStatus, tickJetpack,
} from './techMods.js';
import { JETPACK, SHIELD, SHIELD_ITEM_KEYS, ELECTRIC_TOOL } from './techData.js';
import { chargeOf } from './techCharge.js';
import { makeWorld } from './techTestKit.js';

const JET = 'item:jetpack';
const CELL = 'item:enerji_hücresi';

function jetInv(charge) {
  const inv = new Inventory();
  inv.addStack(JET, 1, undefined, undefined, charge);
  return inv;
}

/** Cismi yere oturtur (onGround). */
function settle(world, body) {
  for (let i = 0; i < 60; i++) stepPlayer(body, {}, world, 1 / 60, {}, { mode: 'macera' });
  expect(body.onGround).toBe(true);
}

/** Oyuncuyu n adım (1/60) çalıştırır; jump tuşu basılı; her adım sonra jetpack yakıtı işlenir. */
function fly(world, inv, body, steps, jump, opts) {
  const mods = createMods();
  const events = [];
  for (let i = 0; i < steps; i++) {
    computeMods(inv, null, mods);
    stepPlayer(body, { jump, jumpPressed: false }, world, 1 / 60, {}, { mode: 'macera', mods });
    body.events.forEach((e) => events.push(e));
    const r = tickJetpack(inv, body, opts);
    if (r.event) events.push(r.event);
  }
  return events;
}

describe('techMods: kimlik ve hesap', () => {
  it('IDENTITY_MODS yeni alanları içerir ve varsayılan hesap kimliktir', () => {
    expect(IDENTITY_MODS.thrust).toBe(0);
    expect(IDENTITY_MODS.thrustVy).toBe(0);
    expect(IDENTITY_MODS.shield).toBe(0);
    expect(computeMods(null, null)).toEqual(IDENTITY_MODS);
    expect(computeMods(new Inventory(), [])).toEqual(IDENTITY_MODS);
    expect(applyTechMods(createMods(), null)).toEqual(IDENTITY_MODS);
  });

  it('çubukta şarjlı jetpack itiş verir; yakıt bitince/çantadaysa vermez; mods yeniden kullanımı sıfırlar', () => {
    const inv = jetInv(500);
    const m = computeMods(inv, null);
    expect(m.thrust).toBe(JETPACK.accel);
    expect(m.thrustVy).toBe(JETPACK.maxVy);
    expect(m.fallMul).toBe(JETPACK.fallMul);
    inv.slots[0].charge = 0;
    expect(computeMods(inv, null, m).thrust).toBe(0);
    expect(m.fallMul).toBe(1);
    inv.slots[0].charge = 100;
    expect(computeMods(inv, null, m).thrust).toBe(JETPACK.accel);
    const moved = new Inventory();
    moved.slots[20] = { item: JET, count: 1, charge: 500 }; // çantada (çubuk dışı)
    expect(computeMods(moved, null).thrust).toBe(0);
  });

  it('elektrikli alet: şarjlıyken hızlı, şarjsızken yavaş; yalnız eldeyken', () => {
    const inv = new Inventory();
    inv.addStack('item:kazma_elektrikli', 1, undefined, undefined, 100);
    const m = computeMods(inv, null);
    expect(m.digMul).toBeCloseTo(ELECTRIC_TOOL.chargedMul, 5);
    const fast = breakTime(B.STONE, 'item:kazma_elektrikli', m);
    inv.held().charge = 0;
    const dead = computeMods(inv, null);
    expect(dead.digMul).toBeCloseTo(ELECTRIC_TOOL.deadMul, 5);
    const slow = breakTime(B.STONE, 'item:kazma_elektrikli', dead);
    expect(slow).toBeGreaterThan(fast * 3);
    expect(fast).toBeLessThan(breakTime(B.STONE, 'item:kazma_demir'));
    expect(slow).toBeGreaterThan(breakTime(B.STONE, 'item:kazma_demir')); // şarjsız elektrikli kazma demirden kötü
    inv.slots[1] = { item: 'item:kazma_demir', count: 1, dur: 250 };
    inv.selected = 1;
    expect(computeMods(inv, null).digMul).toBe(1);
    expect(resolveDrops(B.DIAMOND_ORE, null, 'item:kazma_elektrikli')).toEqual([{ item: 'item:elmas', count: 1 }]);
  });

  it('onBlockBrokenWithTool: elektrikli alette 2 şarj harcar; diğerlerinde false', () => {
    const inv = new Inventory();
    inv.addStack('item:balta_elektrikli', 1, undefined, undefined, 5);
    expect(onBlockBrokenWithTool(inv)).toBe(true);
    expect(inv.held().charge).toBe(5 - ELECTRIC_TOOL.useCost);
    onBlockBrokenWithTool(inv);
    onBlockBrokenWithTool(inv);
    expect(inv.held().charge).toBe(0);
    expect(onBlockBrokenWithTool(inv)).toBe(true); // alet hâlâ elektrikli (şarj bitti)
    inv.slots[0] = { item: 'item:kazma_demir', count: 1, dur: 250 };
    expect(onBlockBrokenWithTool(inv)).toBe(false);
    expect(onBlockBrokenWithTool(null)).toBe(false);
  });
});

describe('techMods: jetpack fiziği', () => {
  const world = makeWorld({ floorY: 59 });

  it('zıplamayı basılı tutunca yukarı çıkar (zıplama tepesinin çok üstü); jetpacksiz çıkamaz', () => {
    const inv = jetInv(1000);
    const b = createPlayerBody(0.5, 60, 0.5);
    settle(world, b);
    fly(world, inv, b, 90, true); // 1,5 sn
    expect(b.y).toBeGreaterThan(60 + 6);
    expect(b.thrusting).toBe(true);
    const plain = new Inventory();
    const p = createPlayerBody(0.5, 60, 0.5);
    settle(world, p);
    let maxY = 60;
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, { jump: true }, world, 1 / 60, {}, { mode: 'macera', mods: computeMods(plain, null) });
      maxY = Math.max(maxY, p.y);
    }
    expect(maxY).toBeLessThan(62);
    expect(p.thrustT).toBe(0);
  });

  it('yükselme hızı thrustVy ile sınırlı; tuşu bırakınca itiş kesilir ve düşer', () => {
    const inv = jetInv(1000);
    const b = createPlayerBody(0.5, 60, 0.5);
    settle(world, b);
    fly(world, inv, b, 120, true);
    expect(b.vy).toBeLessThanOrEqual(JETPACK.maxVy + 0.01);
    const yHold = b.y;
    fly(world, inv, b, 30, false);
    expect(b.thrusting).toBe(false);
    expect(b.vy).toBeLessThan(0.5);
    expect(b.y).toBeLessThan(yHold + 3);
  });

  it('havada asılı kalma: düşerken zıplamayı basılı tutmak düşüşü durdurur', () => {
    const inv = jetInv(1000);
    const b = createPlayerBody(0.5, 80, 0.5);
    fly(world, inv, b, 60, false); // serbest düşüş: vy ≈ −30
    expect(b.vy).toBeLessThan(-15);
    fly(world, inv, b, 90, true);
    expect(b.vy).toBeGreaterThan(-1);
  });

  it('yerdeyken itiş yok (normal zıplama); itiş yalnız yakıt varken', () => {
    const inv = jetInv(1000);
    const b = createPlayerBody(0.5, 60, 0.5);
    settle(world, b);
    stepPlayer(b, { jump: true }, world, 1 / 60, {}, { mode: 'macera', mods: computeMods(inv, null) });
    expect(b.thrustT).toBe(0);
    const empty = jetInv(0);
    const e = createPlayerBody(0.5, 70, 0.5); // havada: itiş yok, yakıt yok
    fly(world, empty, e, 60, true);
    expect(e.thrustT).toBe(0);
    expect(e.y).toBeLessThan(70);
  });

  it('yakıt itiş süresiyle azalır (yaklaşık 22/sn); thrustT sıfırlanır; olay yayılır', () => {
    const inv = jetInv(1000);
    const b = createPlayerBody(0.5, 60, 0.5);
    settle(world, b);
    const ev = fly(world, inv, b, 120, true);
    const burned = 1000 - chargeOf(inv.slots[0]);
    expect(burned).toBeGreaterThan(20);
    expect(burned).toBeLessThan(2 * JETPACK.fuelPerSec + 5);
    expect(b.thrustT).toBe(0);
    const fuelEv = ev.filter((e) => e.type === 'jetpackFuel');
    expect(fuelEv.length).toBeGreaterThan(10);
    expect(fuelEv[fuelEv.length - 1].fuel).toBe(chargeOf(inv.slots[0]));
    expect(fuelEv.reduce((n, e) => n + e.burned, 0)).toBeGreaterThan(0.5);
  });

  it('yakıt biter: itiş kesilir ve (hücre yoksa) boş olay; hücre varsa otomatik yakıt ikmali', () => {
    const inv = jetInv(30);
    const b = createPlayerBody(0.5, 60, 0.5);
    settle(world, b);
    const ev = fly(world, inv, b, 200, true, { autoRefuel: false });
    expect(chargeOf(inv.slots[0])).toBe(0);
    expect(ev.some((e) => e.type === 'jetpackFuel' && e.empty)).toBe(true);
    const inv2 = jetInv(30);
    inv2.add(CELL, 3);
    const b2 = createPlayerBody(0.5, 60, 0.5);
    settle(world, b2);
    const ev2 = fly(world, inv2, b2, 200, true);
    expect(inv2.count(CELL)).toBeLessThan(3);
    expect(ev2.some((e) => e.type === 'jetpackFuel' && e.refueled)).toBe(true);
    expect(b2.y).toBeGreaterThan(b.y);
  });

  it('düşme hasarı azalır (fallMul 0,3): aynı yükseklikten jetpackli oyuncu çok az hasar alır', () => {
    const dmgFor = (inv) => {
      const sv = createSurvival();
      const b = createPlayerBody(0.5, 75, 0.5);
      const mods = createMods();
      for (let i = 0; i < 400; i++) {
        computeMods(inv, null, mods);
        stepPlayer(b, { jump: false }, world, 1 / 60, {}, { mode: 'macera', mods });
        consumePhysicsEvents(sv, b.events, { mode: 'macera', mods });
        if (b.onGround) break;
      }
      return sv.maxHp - sv.hp;
    };
    const plain = dmgFor(new Inventory());
    const jet = dmgFor(jetInv(500));
    expect(plain).toBeGreaterThanOrEqual(10);
    expect(jet).toBeLessThan(plain * 0.4);
    expect(jet).toBeGreaterThan(0);
  });

  it('zıplama tepesinde otomatik devreye girer (vy < 3); zeminden kalkış hemen yakıt yakmaz', () => {
    const inv = jetInv(1000);
    const b = createPlayerBody(0.5, 60, 0.5);
    settle(world, b);
    const mods = computeMods(inv, null);
    let firstThrustStep = -1;
    for (let i = 0; i < 40; i++) {
      stepPlayer(b, { jump: true }, world, 1 / 60, {}, { mode: 'macera', mods });
      if (b.thrustT > 0 && firstThrustStep < 0) firstThrustStep = i;
    }
    expect(firstThrustStep).toBeGreaterThan(5); // zıplamanın ilk anlarında vy > 3
  });
});

describe('techMods: jetpack durum ve ikmal', () => {
  it('status/hud/find', () => {
    const inv = jetInv(250);
    expect(jetpackStatus(inv)).toMatchObject({ has: true, fuel: 250, max: 1000, empty: false, cells: 0 });
    expect(jetpackHud(inv)).toMatchObject({ fuel: 250, max: 1000, fraction: 0.25, empty: false });
    expect(findJetpack(inv).index).toBe(0);
    const none = new Inventory();
    none.add(CELL, 4);
    expect(jetpackStatus(none)).toMatchObject({ has: false, cells: 4 });
    expect(jetpackHud(none)).toBeNull();
    expect(findJetpack(none)).toBeNull();
    expect(jetpackStatus(null).has).toBe(false);
  });

  it('refuelJetpack: hücre tüketir (+220), dolu/yok/hücre-yok durumlarında reddeder', () => {
    const inv = jetInv(100);
    expect(refuelJetpack(inv).reason).toBe('hucre');
    inv.add(CELL, 2);
    const r = refuelJetpack(inv);
    expect(r).toMatchObject({ ok: true, added: JETPACK.cellFuel });
    expect(chargeOf(inv.slots[0])).toBe(100 + JETPACK.cellFuel);
    expect(inv.count(CELL)).toBe(1);
    inv.slots[0].charge = 950;
    expect(refuelJetpack(inv).reason).toBe('dolu');
    expect(inv.count(CELL)).toBe(1);
    inv.slots[0].charge = 800; // yer 200 ≥ 110 → ekler, üst sınıra kırpar
    expect(refuelJetpack(inv).added).toBe(200);
    expect(refuelJetpack(new Inventory()).reason).toBe('yok');
  });

  it('tickJetpack: itiş yoksa olay yok; jetpack yoksa güvenli', () => {
    const inv = jetInv(100);
    expect(tickJetpack(inv, { thrustT: 0 }).event).toBeNull();
    expect(tickJetpack(new Inventory(), { thrustT: 5 }).burned).toBe(0);
    expect(tickJetpack(inv, null).event).toBeNull();
    const body = { thrustT: 1, thrusting: true };
    const r = tickJetpack(inv, body);
    expect(r.burned).toBe(1);
    expect(body.thrustT).toBe(0);
    expect(chargeOf(inv.slots[0])).toBe(100 - JETPACK.fuelPerSec);
    const cre = new Inventory({ infinite: true });
    cre.addStack(JET, 1, undefined, undefined, 10);
    tickJetpack(cre, { thrustT: 5 });
    expect(cre.slots[0].charge).toBe(10); // yaratıcı modda yakıt harcanmaz
  });
});

describe('techMods: Portal Tabancası atış bedeli', () => {
  const GUN = 'item:portal_tabancası';
  function gunInv(charge, cells) {
    const inv = new Inventory();
    inv.addStack(GUN, 1, undefined, undefined, charge);
    if (cells) inv.add(CELL, cells);
    return inv;
  }
  it('her atış 1 şarj; şarj bitince 1 Enerji Hücresi +12 şarj yükler; hücre de yoksa reddedilir', () => {
    const inv = gunInv(2, 1);
    expect(portalGunStatus(inv)).toMatchObject({ has: true, charge: 2, max: 24, cells: 1, canFire: true });
    expect(portalGunFire(inv)).toMatchObject({ ok: true, reloaded: false, charge: 1 });
    expect(portalGunFire(inv).charge).toBe(0);
    const r = portalGunFire(inv);
    expect(r).toMatchObject({ ok: true, reloaded: true, charge: 11 });
    expect(inv.count(CELL)).toBe(0);
    inv.held().charge = 0;
    expect(portalGunStatus(inv).canFire).toBe(false);
    expect(portalGunFire(inv)).toMatchObject({ ok: false, reason: 'sarj' });
    expect(portalGunFire(inv).message).toContain('Enerji Hücresi');
  });
  it('tabanca eldeyken geçerli; yoksa/başka eşyada reddedilir; yaratıcı modda bedava; üst sınır aşılmaz', () => {
    const inv = gunInv(5, 0);
    inv.add('item:elma', 1);
    inv.selected = 1;
    expect(portalGunFire(inv)).toMatchObject({ ok: false, reason: 'yok' });
    expect(portalGunStatus(inv)).toMatchObject({ has: false, canFire: false });
    expect(portalGunFire(null).reason).toBe('yok');
    const cre = new Inventory({ infinite: true });
    cre.addStack(GUN, 1, undefined, undefined, 0);
    expect(portalGunFire(cre).ok).toBe(true);
    expect(cre.held().charge).toBe(0);
    const full = gunInv(0, 3);
    portalGunFire(full);
    portalGunFire(full);
    expect(full.count(CELL)).toBe(2); // yükleme yalnız gerektiğinde
    expect(chargeOf(full.held())).toBeLessThanOrEqual(24);
  });
});

describe('techMods: enerji kalkanı', () => {
  function shieldInv(charges) {
    const inv = new Inventory();
    charges.forEach((c, i) => {
      inv.addStack(SHIELD_ITEM_KEYS[i], 1, undefined, undefined, c);
      inv.equip(inv.slots.findIndex((s) => s && s.item === SHIELD_ITEM_KEYS[i]));
    });
    return inv;
  }

  it('parça sayısına göre emilim (%18/parça, en çok %72) ve şarj maliyeti (6/can)', () => {
    const inv = shieldInv([250, 250]);
    expect(shieldStatus(inv)).toMatchObject({ pieces: 2, charge: 500, max: 500, fraction: 1 });
    expect(computeMods(inv, null).shield).toBeCloseTo(0.36, 5);
    const hook = createShieldHook(inv);
    const rest = hook(10);
    expect(rest).toBeCloseTo(6.4, 5);
    expect(hook.lastAbsorbed).toBeCloseTo(3.6, 5);
    expect(shieldStatus(inv).charge).toBe(500 - Math.ceil(3.6 * SHIELD.costPerHp));
    const four = shieldInv([250, 250, 250, 250]);
    expect(computeMods(four, null).shield).toBeCloseTo(0.72, 5);
    const h4 = createShieldHook(four);
    expect(h4(10)).toBeCloseTo(2.8, 5);
    expect(computeMods(shieldInv([250, 250, 250, 250, 250].slice(0, 4)), null).shield).toBeLessThanOrEqual(0.72);
  });

  it('şarj yetmezse emilim şarjla sınırlı; şarjsız parça sayılmaz; hasar < 0 / NaN güvenli', () => {
    const inv = shieldInv([6, 0]);
    const hook = createShieldHook(inv);
    expect(computeMods(inv, null).shield).toBeCloseTo(0.18, 5); // yalnız şarjlı parça
    const rest = hook(100);
    expect(hook.lastAbsorbed).toBeCloseTo(1, 5); // 6 şarj / 6 = 1 can
    expect(rest).toBeCloseTo(99, 5);
    expect(shieldStatus(inv).charge).toBe(0);
    expect(hook(10)).toBe(10); // artık şarj yok
    expect(hook.lastAbsorbed).toBe(0);
    expect(hook(0)).toBe(0);
    expect(hook(-5)).toBe(-5);
    expect(Number.isNaN(hook(NaN))).toBe(true);
    expect(createShieldHook(new Inventory())(7)).toBe(7);
    const cre = shieldInv([250]);
    cre.infinite = true;
    expect(createShieldHook(cre)(10)).toBe(10);
  });

  it('en dolu parça önce tükenir (belirlenimci)', () => {
    const inv = shieldInv([250, 100]);
    createShieldHook(inv)(20);
    // 2 parça: %36 → 7,2 can emilir → 44 şarj; en dolu (miğfer 250) harcar
    expect(inv.armor[0].charge).toBe(250 - 44);
    expect(inv.armor[1].charge).toBe(100);
  });

  it('survival entegrasyonu: hasar azalır, olay yayılır; düşme/açlık/boşluk kalkandan geçmez; tam emilimde sıfır', () => {
    const inv = shieldInv([250, 250, 250, 250]);
    const sv = createSurvival();
    sv.shieldHook = createShieldHook(inv);
    const dealt = applyDamage(sv, 10, { type: 'yaratık' });
    expect(dealt).toBeLessThan(5);
    expect(sv.events.some((e) => e.type === 'shieldAbsorb' && e.cause === 'yaratık')).toBe(true);
    const sv2 = createSurvival();
    sv2.shieldHook = createShieldHook(shieldInv([250, 250, 250, 250]));
    const fall = applyDamage(sv2, 10, { type: 'düşme' });
    expect(fall).toBe(10);
    expect(sv2.events.some((e) => e.type === 'shieldAbsorb')).toBe(false);
    expect(applyDamage(sv2, 3, { type: 'açlık' })).toBe(3);
    const sv3 = createSurvival();
    sv3.shieldHook = () => 0;
    const hp = sv3.hp;
    expect(applyDamage(sv3, 5, { type: 'yaratık' })).toBe(0);
    expect(sv3.hp).toBe(hp);
    const sv4 = createSurvival();
    sv4.shieldHook = createShieldHook(shieldInv([250]));
    expect(applyDamage(sv4, 4, { type: 'yaratık', ignoreArmor: true })).toBe(4); // zırhı yok sayan hasar kalkanı da yok sayar
    const sv5 = createSurvival(); // kanca yok: eski davranış
    expect(applyDamage(sv5, 4, { type: 'yaratık' })).toBe(4);
  });
});
