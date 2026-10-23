import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { makeMobsG } from './mobsTestKit.js';

const SWORD = 'item:kılıç_demir';

/** Hedefi yerinde tutarak n adım (geri tepme kaçırmasın). */
function pinned(k, e, n, input) {
  const x = e.x;
  const z = e.z;
  for (let i = 0; i < n; i++) {
    e.x = x; e.z = z; e.vx = 0; e.vz = 0; e.y = 41;
    k.step(1, i === 0 ? input : Object.assign({}, input, { attackPressed: false, placePressed: false }));
  }
}

function swings(log) {
  return log.filter((l) => l[0] === 'swing').map((l) => l[1]);
}

describe('yakın dövüş', () => {
  it('nişandaki yaratığa vurur: hasar, hedef, savurma, ses, bekleme; girdi tüketilir', () => {
    const k = makeMobsG({ held: SWORD });
    const e = k.mobAt(2.5);
    k.step(1, { attackPressed: true });
    expect(e.hp).toBe(e.maxHp - 6);
    expect(k.G.aimEntity).toBe(e);
    expect(k.G.mobTarget).toBe(e);
    expect(k.G.combatClaim.attack).toBe(true);
    expect(k.G.inputState.attackPressed).toBe(false);
    expect(swings(k.log)).toEqual(['slash']);
    expect(k.G.sounds.some((s) => s[0] === 'hit')).toBe(true);
    expect(k.G.combat.atkCd).toBeGreaterThan(0.3);
    expect(k.G.charAction && k.G.charAction.name).toBeFalsy(); // eylem kare güncellemesinde
    k.frame();
    expect(k.G.charAction.name).toBe('attack');
  });

  it('bekleme süresinde ikinci vuruş hasar vermez; süre dolunca vurur', () => {
    const k = makeMobsG({ held: SWORD });
    const e = k.mobAt(2.5);
    e.persistent = true;
    pinned(k, e, 1, { attackPressed: true });
    const hp1 = e.hp;
    expect(hp1).toBeLessThan(e.maxHp);
    pinned(k, e, 5, {});
    pinned(k, e, 1, { attackPressed: true }); // ~0.1 sn: bekleme içinde
    expect(e.hp).toBe(hp1);
    pinned(k, e, 40, {});
    pinned(k, e, 1, { attackPressed: true });
    expect(e.hp).toBeLessThan(hp1);
  });

  it('tamponlu girdi: bekleme bitmeden hemen önce basılan vuruş süre dolunca uygulanır', () => {
    const k = makeMobsG({ held: SWORD });
    const e = k.mobAt(2.5);
    pinned(k, e, 1, { attackPressed: true });
    const hp1 = e.hp;
    pinned(k, e, 21, {}); // cooldown 0.45 sn = 27 adım; ~0.1 sn kaldı
    pinned(k, e, 1, { attackPressed: true });
    expect(e.hp).toBe(hp1);
    pinned(k, e, 12, {});
    expect(e.hp).toBeLessThan(hp1);
  });

  it('basılı tutma tekrar vurur', () => {
    const k = makeMobsG({ held: SWORD });
    const e = k.mobAt(2.5, 'golge');
    e.hp = 500;
    e.maxHp = 500;
    pinned(k, e, 130, { breakHeld: true });
    expect(500 - e.hp).toBeGreaterThanOrEqual(12);
  });

  it('hedef yoksa girdiyi tüketmez (blok sistemi kırabilsin), aimEntity boş', () => {
    const k = makeMobsG({ held: SWORD });
    k.mobAt(8);
    k.step(1, { attackPressed: true });
    expect(k.G.aimEntity).toBeNull();
    expect(k.G.combatClaim.attack).toBe(false);
    expect(k.G.inputState.attackPressed).toBe(true);
    expect(swings(k.log)).toEqual([]);
  });

  it('duvarın arkasındaki yaratık hedef sayılmaz', () => {
    const k = makeMobsG({ held: SWORD });
    for (let x = 7; x <= 10; x++) for (let y = 41; y <= 43; y++) k.G.world.setBlock(x, y, 6, B.STONE);
    const e = k.mobAt(3);
    k.step(1, { attackPressed: true });
    expect(k.G.aimEntity).toBeNull();
    expect(e.hp).toBe(e.maxHp);
  });

  it('elle (yumruk) vurulur; ölü yaratık hedef olmaz', () => {
    const k = makeMobsG({});
    const e = k.mobAt(2, 'golge');
    k.step(1, { attackPressed: true });
    expect(e.hp).toBe(e.maxHp - 1);
    expect(swings(k.log)).toEqual(['punch']);
    k.G.em.damage(e.id, 999, { kind: 'melee' });
    k.step(40, {});
    expect(k.G.aimEntity).toBeNull();
  });

  it('alet ile vuruş: kazma "attack" savurması, dayanıklılık düşer', () => {
    const k = makeMobsG({ held: 'item:kazma_demir' });
    const before = k.G.inventory.held().dur;
    k.mobAt(2.5);
    k.step(1, { attackPressed: true });
    expect(swings(k.log)).toEqual(['attack']);
    expect(k.G.inventory.held().dur).toBe(before - 1);
  });

  it('arayüz açıkken / ölüyken / duraklatılmışken savaş yok; kalkan ve yay sıfırlanır', () => {
    const k = makeMobsG({ held: SWORD });
    const e = k.mobAt(2.5);
    k.G.ui = 'inventory';
    k.step(1, { attackPressed: true });
    expect(e.hp).toBe(e.maxHp);
    expect(k.G.combatClaim.attack).toBe(false);
    k.G.ui = 'none';
    k.G.player.dead = true;
    k.step(1, { attackPressed: true });
    expect(e.hp).toBe(e.maxHp);
    k.G.player.dead = false;
    k.G.time.paused = true;
    k.step(1, { attackPressed: true });
    expect(e.hp).toBe(e.maxHp);
  });
});

describe('yay', () => {
  function bow(arrows) {
    return makeMobsG({ held: 'item:yay', inv: arrows ? [['item:ok', arrows]] : [] });
  }

  it('basılı tutunca gerilir, bırakınca ok fırlar ve 1 ok tüketilir', () => {
    const k = bow(5);
    k.step(40, { breakHeld: true });
    expect(k.G.combat.charging).toBe(true);
    expect(k.G.fpState.bowCharge).toBeGreaterThan(0.5);
    expect(k.G.fpState.nocked).toBe(true);
    expect(k.G.combatClaim.attack).toBe(true);
    k.frame();
    expect(k.G.charAction.name).toBe('bow-draw');
    k.step(1, {});
    expect(k.G.em.projectiles).toHaveLength(1);
    expect(k.G.em.projectiles[0].team).toBe('player');
    expect(k.G.inventory.count('item:ok')).toBe(4);
    expect(k.G.combat.charging).toBe(false);
    expect(k.G.fpState.bowCharge).toBe(0);
    expect(swings(k.log)).toContain('release');
  });

  it('çok kısa germe ok atmaz ve cephane harcamaz', () => {
    const k = bow(5);
    k.step(3, { breakHeld: true });
    k.step(1, {});
    expect(k.G.em.projectiles).toHaveLength(0);
    expect(k.G.inventory.count('item:ok')).toBe(5);
  });

  it('cephane yokken germez, uyarır (tek sefer)', () => {
    const k = bow(0);
    k.step(1, { breakHeld: true, attackPressed: true });
    expect(k.G.combat.charging).toBe(false);
    expect(k.G.speaks.filter((t) => t === 'Okun kalmadı.')).toHaveLength(1);
    k.step(10, { breakHeld: true });
    expect(k.G.speaks.filter((t) => t === 'Okun kalmadı.')).toHaveLength(1);
  });

  it('sağ tıkla da gerilir; eşya değişince germe iptal olur', () => {
    const k = bow(3);
    k.step(30, { placeHeld: true });
    expect(k.G.combat.charging).toBe(true);
    k.G.inventory.setSlot(7, 'item:elma', 1);
    k.G.inventory.selected = 7;
    k.step(2, { placeHeld: true });
    expect(k.G.combat.charging).toBe(false);
    expect(k.G.inventory.count('item:ok')).toBe(3);
  });

  it('atış sonrası tuşu bırakıp yeniden basınca yeni germe başlar', () => {
    const k = bow(5);
    k.step(40, { breakHeld: true });
    k.step(1, {});
    k.step(60, { breakHeld: true });
    expect(k.G.combat.charging).toBe(true); // tuş bırakılıp yeniden basıldı → yeni germe
    const n = k.G.em.projectiles.length;
    k.step(1, {});
    expect(k.G.em.projectiles.length).toBe(n + 1);
  });
});

describe('ışın tüfeği', () => {
  it('ateş eder: hücre tüketir, fx beam olayı, savurma, bekleme', () => {
    const k = makeMobsG({ held: 'item:ışın_tüfeği', inv: [['item:enerji_hücresi', 2]] });
    const e = k.mobAt(10);
    k.step(1, { attackPressed: true });
    expect(k.G.inventory.count('item:enerji_hücresi')).toBe(1);
    expect(k.G.events.some((ev) => ev.type === 'fx' && ev.name === 'beam' && ev.team === 'player')).toBe(true);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(swings(k.log)).toContain('fire');
    expect(k.G.combatClaim.attack).toBe(true);
    const n = k.G.events.filter((ev) => ev.name === 'beam').length;
    k.step(5, { attackPressed: true });
    expect(k.G.events.filter((ev) => ev.name === 'beam').length).toBe(n); // bekleme
  });

  it('hücre yokken ateş etmez, uyarır', () => {
    const k = makeMobsG({ held: 'item:ışın_tüfeği' });
    k.step(1, { attackPressed: true });
    expect(k.G.events.some((ev) => ev.name === 'beam')).toBe(false);
    expect(k.G.speaks).toContain('Enerji hücren bitti.');
  });

  it('basılı tutarak otomatik ateş', () => {
    const k = makeMobsG({ held: 'item:ışın_tüfeği', inv: [['item:enerji_hücresi', 3]] });
    k.step(100, { breakHeld: true });
    expect(k.G.events.filter((ev) => ev.name === 'beam').length).toBeGreaterThanOrEqual(4);
  });

  it('macera modunda bloğu çatlatır, harita modunda çatlatmaz', () => {
    const a = makeMobsG({ held: 'item:ışın_tüfeği', inv: [['item:enerji_hücresi', 1]] });
    for (let y = 41; y <= 43; y++) a.G.world.setBlock(8, y, 3, B.DIRT);
    a.look(0, 0);
    a.step(1, { attackPressed: true });
    expect(a.G.em.blockDamage.size).toBe(1);
    const b = makeMobsG({ mode: 'harita', held: 'item:ışın_tüfeği', inv: [['item:enerji_hücresi', 1]] });
    for (let y = 41; y <= 43; y++) b.G.world.setBlock(8, y, 3, B.DIRT);
    b.step(1, { attackPressed: true });
    expect(b.G.em.blockDamage.size).toBe(0);
  });
});

describe('kalkan', () => {
  it('sağ tık basılıyken kalkan kalkar, bırakınca iner; kalkan indirimi gövdeye yazılır', () => {
    const k = makeMobsG({ held: 'item:kalkan' });
    k.step(2, { placeHeld: true });
    expect(k.G.player.blocking).toBe(true);
    expect(k.G.body.blocking).toBe(true);
    expect(k.G.body.shieldReduce).toBe(0.6);
    expect(k.G.combatClaim.use).toBe(true);
    k.step(2, {});
    expect(k.G.player.blocking).toBe(false);
    expect(k.G.body.blocking).toBe(false);
  });

  it('kalkan yoksa sağ tık kalkan kaldırmaz', () => {
    const k = makeMobsG({ held: SWORD });
    k.step(2, { placeHeld: true });
    expect(k.G.player.blocking).toBe(false);
  });
});

describe('portal tabancası ve yetenek tuşları', () => {
  function portalG(item) {
    const k = makeMobsG(item ? { held: item } : {});
    for (let y = 41; y <= 44; y++) for (let x = 6; x <= 10; x++) k.G.world.setBlock(x, y, 3, B.STONE);
    const shots = [];
    let handled = true;
    const orig = k.G.emit;
    k.G.emit = (e) => {
      if (e.type === 'portalShot') {
        shots.push(e);
        e.handled = handled;
      }
      orig(e);
    };
    return { k, shots, setHandled: (v) => { handled = v; } };
  }

  it('elde tabanca: sol mavi, sağ turuncu; olayda hücre ve yüz normali var', () => {
    const { k, shots } = portalG('item:portal_tabancası');
    k.step(1, { attackPressed: true });
    k.step(1, { placePressed: true });
    expect(shots.map((s) => s.color)).toEqual(['mavi', 'turuncu']);
    expect(shots[0]).toMatchObject({ x: 8, z: 3, face: { nx: 0, ny: 0, nz: 1 } });
    expect(k.G.combatClaim.use).toBe(true);
    expect(k.log.filter((l) => l[0] === 'swing')).toHaveLength(2);
  });

  it('ability3: yetenek varsa mavi → turuncu → mavi sırayla ateşler; yetenek yoksa yok sayılır', () => {
    const { k, shots } = portalG(null);
    k.sys.combat.onAction(k.G, { type: 'ability3' });
    expect(shots).toHaveLength(0);
    k.G.abilities.portalGun = true;
    k.sys.combat.onAction(k.G, { type: 'ability3' });
    k.sys.combat.onAction(k.G, { type: 'ability3' });
    k.sys.combat.onAction(k.G, { type: 'ability3' });
    expect(shots.map((s) => s.color)).toEqual(['mavi', 'turuncu', 'mavi']);
  });

  it('işlenmeyen atış rengi değiştirmez ve (3 sn içinde tek) uyarı verir', () => {
    const { k, shots, setHandled } = portalG(null);
    k.G.abilities.portalGun = true;
    setHandled(false);
    k.sys.combat.onAction(k.G, { type: 'ability3' });
    k.sys.combat.onAction(k.G, { type: 'ability3' });
    expect(shots.map((s) => s.color)).toEqual(['mavi', 'mavi']);
    expect(k.G.speaks.filter((t) => /portal açılamaz/.test(t))).toHaveLength(1);
  });

  it('içerik sistemi yokken doğrudan PuzzleManager çağrılır', () => {
    const k = makeMobsG({ held: 'item:portal_tabancası' });
    for (let y = 41; y <= 44; y++) for (let x = 6; x <= 10; x++) k.G.world.setBlock(x, y, 3, B.STONE);
    k.G.getSystem = () => null;
    k.step(1, { attackPressed: true });
    expect(k.G.puzzles.calls).toHaveLength(1);
    expect(k.G.puzzles.calls[0]).toMatchObject({ type: 'portalShot', color: 'mavi' });
  });

  it('boşluğa atış: izi çizer, olay yollamaz', () => {
    const k = makeMobsG({ held: 'item:portal_tabancası' });
    k.look(0, 1.2);
    k.step(1, { attackPressed: true });
    expect(k.G.events.some((e) => e.type === 'portalShot')).toBe(false);
  });
});

describe('büyü köprüsü: G.mods yakın dövüşe ve yaya uygulanır', () => {
  const mods = (o) => Object.assign({
    speedMul: 1, jumpMul: 1, damageMul: 1, meleeBonus: 0, knockBonus: 0, burnLevel: 0, slowLevel: 0, luck: 0, digMul: 1, fortune: 0,
    silkTouch: false, magnet: false, fallMul: 1, fireMul: 1, oxygenMul: 1, waterBreathing: false, regen: 0, nightVision: false,
    thorns: 0, bowPowerMul: 1, infiniteAmmo: false, protection: 0, manaCostMul: 1, spellPowerMul: 1, manaRegenMul: 1,
  }, o);

  it('Keskinlik: +bonus hasar; mods yoksa kimlik', () => {
    const plain = makeMobsG({ held: SWORD });
    const e0 = plain.mobAt(2.5);
    plain.step(1, { attackPressed: true });
    const d0 = e0.maxHp - e0.hp;
    const k = makeMobsG({ held: SWORD });
    k.G.mods = mods({ meleeBonus: 1.5 });
    const e = k.mobAt(2.5);
    k.step(1, { attackPressed: true });
    expect(e.maxHp - e.hp).toBeCloseTo(d0 + 1.5, 5);
  });

  it('Güç iksiri (damageMul) hasarı çarpar; Alev yaratığı yakar', () => {
    const k = makeMobsG({ held: SWORD });
    k.G.mods = mods({ damageMul: 1.3, burnLevel: 1 });
    const e = k.mobAt(2.5);
    e.hp = 100;
    e.maxHp = 100;
    k.step(1, { attackPressed: true });
    expect(100 - e.hp).toBeCloseTo(6 * 1.3, 5);
    expect(e.magicBurnT).toBeGreaterThan(0);
  });

  it('Buz yaratığı yavaşlatır', () => {
    const k = makeMobsG({ held: SWORD });
    k.G.mods = mods({ slowLevel: 2 });
    const e = k.mobAt(2.5);
    e.hp = 100;
    e.maxHp = 100;
    k.step(1, { attackPressed: true });
    expect(e.slowT).toBeGreaterThan(0);
  });

  it('insa/harita: mods uygulanmaz (macera dışı)', () => {
    const k = makeMobsG({ held: SWORD });
    k.G.mode = 'insa';
    k.G.mods = mods({ meleeBonus: 50 });
    const e = k.mobAt(2.5);
    e.hp = 500;
    e.maxHp = 500;
    k.step(1, { attackPressed: true });
    expect(500 - e.hp).toBeLessThan(20);
  });
});
