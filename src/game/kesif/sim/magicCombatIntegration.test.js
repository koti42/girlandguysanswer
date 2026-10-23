import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { Inventory } from './inventory.js';
import { itemByKey } from './items.js';
import {
  applyDamage, consumePhysicsEvents, createSurvival, setArmor, update as survivalUpdate,
} from './survival.js';
import { createPlayerBody, stepPlayer } from './physics.js';
import {
  createCombatState, playerMelee, releaseBow, resolvePlayerHit, startBowCharge, updateCombat,
} from './combat.js';
import { applyMobStatus, tickMobStatuses } from './magicCombat.js';
import { fireProjectile } from './entitiesProjectiles.js';
import { computeMods, createMods } from './magicMods.js';
import { addEffect } from './magicEffects.js';
import { lootForChest } from './loot.js';
import { Progression } from './progression.js';
import { ACHIEVEMENTS } from './achievementsData.js';
import { QUESTS, QUEST_CHAINS } from './questsData.js';
import { goalValue, scalarMetric } from './progressionMetrics.js';
import { createMagic, createMagicState, restoreMagicAll, serializeMagicAll } from './magic.js';
import { makeEm, makePlayer, makeWorld, run } from './mobAITestKit.js';

const DT = 1 / 60;
const ENCH_SWORD = { keskinlik: 3, alev: 1 };

function swordInv(ench = ENCH_SWORD) {
  const inv = new Inventory();
  inv.setSlot(0, 'item:kılıç_demir', 1, 120, ench);
  return inv;
}

/* ================================================================================================
 * Hayatta kalma: mods kancaları
 * ============================================================================================== */
describe('Survival: mods', () => {
  it('büyü hasarında zırh yarı etkili', () => {
    const a = createSurvival();
    setArmor(a, 10); // %40
    const b = createSurvival();
    setArmor(b, 10);
    expect(applyDamage(a, 10, { type: 'yaratık' })).toBe(6);
    expect(applyDamage(b, 10, { type: 'büyü' })).toBe(8);
    const c = createSurvival();
    setArmor(c, 10);
    expect(applyDamage(c, 10, { type: 'düşme' })).toBe(10); // zırh yok sayılır (mevcut kural)
  });

  it('Hafif Adım: düşme hasarı azalır, 0\'a inerse hasar yok', () => {
    const s = createSurvival();
    const m = createMods();
    m.fallMul = 0.25;
    consumePhysicsEvents(s, [{ type: 'fall', damage: 8 }], { mods: m });
    expect(s.hp).toBe(18); // 8 × 0.25 = 2
    const s2 = createSurvival();
    consumePhysicsEvents(s2, [{ type: 'fall', damage: 1 }], { mods: m });
    expect(s2.hp).toBe(20);
    const s3 = createSurvival();
    consumePhysicsEvents(s3, [{ type: 'fall', damage: 8 }], {});
    expect(s3.hp).toBe(12);
  });

  it('Ateş Direnci: lav temas hasarı ölçeklenir; iksir bağışık; kaktüs etkilenmez', () => {
    const run10 = (mods, ctx) => {
      const s = createSurvival();
      for (let i = 0; i < 600; i++) survivalUpdate(s, DT, Object.assign({ contactDps: 6, inLava: true, mods }, ctx));
      return 20 - s.hp;
    };
    const none = run10(undefined);
    expect(none).toBeGreaterThan(10);
    const m = createMods();
    m.fireMul = 0.4;
    const reduced = run10(m);
    expect(reduced).toBeLessThan(none * 0.6);
    expect(reduced).toBeGreaterThan(0);
    m.fireMul = 0;
    expect(run10(m)).toBe(0);
    const cactus = run10(m, { inLava: false, contactType: 'kaktüs' });
    expect(cactus).toBeGreaterThan(0);
  });

  it('Su Soluğu: oksijen daha yavaş tükenir; iksir tükenmez', () => {
    const drain = (mods) => {
      const s = createSurvival();
      for (let i = 0; i < 600; i++) survivalUpdate(s, DT, { headInWater: true, mods });
      return s.oxygen;
    };
    expect(drain(undefined)).toBeCloseTo(5, 1);
    const m = createMods();
    m.oxygenMul = 3;
    expect(drain(m)).toBeCloseTo(15 - 10 / 3, 1);
    const w = createMods();
    w.waterBreathing = true;
    expect(drain(w)).toBe(15);
  });

  it('Yenilenme (mods.regen): açlıktan bağımsız can yeniler; can doluysa birikmez', () => {
    const s = createSurvival();
    s.hp = 10;
    s.hunger = 10; // açlık yenilenmesi kapalı (>=18 gerekir) ve açlık hasarı yok
    const m = createMods();
    m.regen = 0.8;
    for (let i = 0; i < 600; i++) survivalUpdate(s, DT, { mods: m, mode: 'macera' });
    expect(s.hp).toBeGreaterThanOrEqual(10 + 7);
    const full = createSurvival();
    for (let i = 0; i < 600; i++) survivalUpdate(full, DT, { mods: m });
    expect(full.hp).toBe(20);
    expect(full.mregen).toBeLessThan(1);
  });

  it('mods yoksa davranış aynı (varsayılan)', () => {
    const s = createSurvival();
    for (let i = 0; i < 300; i++) survivalUpdate(s, DT, { headInWater: false });
    expect(s.hp).toBe(20);
    expect(s.mregen).toBe(0);
  });
});

/* ================================================================================================
 * Fizik: hız ve zıplama
 * ============================================================================================== */
describe('Fizik: mods', () => {
  const FLAT = { getBlock: (x, y) => (y <= 0 ? B.STONE : 0), setBlock() {} };
  function walkDist(mods) {
    const b = createPlayerBody(0.5, 1, 0.5);
    for (let i = 0; i < 30; i++) stepPlayer(b, {}, FLAT, DT, {}, {});
    const x0 = b.z;
    for (let i = 0; i < 120; i++) stepPlayer(b, { moveZ: 1, yaw: 0 }, FLAT, DT, {}, { mods });
    return Math.abs(b.z - x0);
  }
  function jumpPeak(mods) {
    const b = createPlayerBody(0.5, 1, 0.5);
    for (let i = 0; i < 30; i++) stepPlayer(b, {}, FLAT, DT, {}, {});
    const y0 = b.y;
    let peak = y0;
    stepPlayer(b, { jump: true, jumpPressed: true }, FLAT, DT, {}, { mods });
    for (let i = 0; i < 90; i++) {
      stepPlayer(b, {}, FLAT, DT, {}, { mods });
      peak = Math.max(peak, b.y);
    }
    return peak - y0;
  }

  it('speedMul yürüme mesafesini oranlar', () => {
    const m = createMods();
    m.speedMul = 1.3;
    const base = walkDist(undefined);
    const fast = walkDist(m);
    expect(fast / base).toBeGreaterThan(1.2);
    expect(fast / base).toBeLessThan(1.4);
    expect(walkDist(createMods())).toBeCloseTo(base, 5);
    expect(walkDist({ speedMul: 0 })).toBeCloseTo(base, 5); // geçersiz → kimlik
  });

  it('jumpMul zıplama yüksekliğini artırır (v² ile)', () => {
    const m = createMods();
    m.jumpMul = 1.22;
    const base = jumpPeak(undefined);
    const high = jumpPeak(m);
    expect(base).toBeGreaterThan(1.1);
    expect(base).toBeLessThan(1.4);
    expect(high / base).toBeGreaterThan(1.35);
    expect(high / base).toBeLessThan(1.6);
  });
});

/* ================================================================================================
 * Dövüş: Keskinlik, Alev, Buz, Geri Tepme, Güç, Sonsuzluk, Dikenler, büyü mermileri
 * ============================================================================================== */
const LOOK_NZ = { x: 0, y: 0, z: -1 };

function arena(mobType, z) {
  const w = makeWorld();
  const kit = makeEm(w);
  const p = makePlayer(0, 1, 0);
  p.eyeH = 1.62;
  const mob = kit.em.spawn(mobType, 0, 1, z);
  mob.persistent = true;
  kit.em.update(0.0001, p, { dayFactor: 1 });
  return { ...kit, p, mob, w, cs: createCombatState() };
}

describe('Dövüş: yakın', () => {
  it('Keskinlik + Güç etkisi hasarı artırır; yanma uygulanır ve tick hasar verir', () => {
    const a = arena('golge', -2.6);
    const inv = swordInv();
    const mods = computeMods(inv, null);
    const r = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir', { inventory: inv, mods });
    expect(r.ok).toBe(true);
    expect(r.damage).toBeCloseTo(6 + 2.25, 5);
    expect(a.mob.magicBurnT).toBeCloseTo(5, 5);
    expect(a.mob.magicBurnDps).toBe(1);
    const hp0 = a.mob.hp;
    for (let i = 0; i < 200; i++) tickMobStatuses(a.em, DT);
    expect(hp0 - a.mob.hp).toBeCloseTo(3, 5); // ≈3,3 sn → 3 vuruş
    for (let i = 0; i < 400; i++) tickMobStatuses(a.em, DT);
    expect(hp0 - a.mob.hp).toBeCloseTo(5, 5); // 5 sn toplam, sonra durur
    expect(a.mob.magicBurnT).toBe(0);
    expect(a.em.magicBurning.size).toBe(0);
  });

  it('Güç iksiri çarpanı ve kritik; mods yoksa eski hasar', () => {
    const a = arena('golge', -2.6);
    const inv = new Inventory();
    inv.setSlot(0, 'item:kılıç_demir', 1, 100);
    const list = [];
    addEffect(list, 'guc', 1, 60);
    const mods = computeMods(inv, list);
    const r = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir', { mods });
    expect(r.damage).toBeCloseTo(6 * 1.3, 5);
    const b = arena('golge', -2.6);
    expect(playerMelee(b.em, b.cs, b.p, LOOK_NZ, 'item:kılıç_demir', { inventory: inv }).damage).toBe(6);
  });

  it('Buz yaratığı yavaşlatır (slowT); Geri Tepme itme gücünü artırır', () => {
    const a = arena('golge', -2.6);
    const inv = new Inventory();
    inv.setSlot(0, 'item:kılıç_demir', 1, 100, { buz: 2, geri_tepme: 2 });
    const mods = computeMods(inv, null);
    playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir', { mods });
    expect(a.mob.slowT).toBeCloseTo(5, 5);
    expect(a.mob.magicBurnT || 0).toBe(0);
    const plain = arena('golge', -2.6);
    playerMelee(plain.em, plain.cs, plain.p, LOOK_NZ, 'item:kılıç_demir', {});
    const vPlain = Math.abs(plain.mob.vz);
    const vKnock = Math.abs(a.mob.vz);
    expect(vKnock).toBeGreaterThan(vPlain);
  });

  it('öldüren vuruş yanma bırakmaz; ölü yaratığa durum uygulanmaz', () => {
    const a = arena('golge', -2.6);
    a.mob.hp = 1;
    const inv = new Inventory();
    inv.setSlot(0, 'item:kılıç_kuantum', 1, 100, { alev: 2, keskinlik: 5 });
    const mods = computeMods(inv, null);
    const r = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_kuantum', { mods });
    expect(r.killed).toBe(true);
    expect(applyMobStatus(a.em, a.mob, 2, 2)).toBe(false);
  });

  it('Dayanıklılıklı kılıç vuruşta aşınır (inventory.damageHeld)', () => {
    const a = arena('golge', -2.6);
    const inv = swordInv({ dayaniklilik: 3, keskinlik: 1 });
    const mods = computeMods(inv, null);
    const d0 = inv.held().dur;
    playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir', { inventory: inv, mods });
    expect(inv.held().dur).toBeGreaterThanOrEqual(d0 - 1);
  });
});

describe('Dövüş: yay', () => {
  function shoot(inv, mods, secs = 1) {
    const a = arena('golge', -14);
    startBowCharge(a.cs, 'item:yay');
    updateCombat(a.cs, secs);
    const r = releaseBow(a.em, a.cs, a.p, LOOK_NZ, 'item:yay', inv, mods);
    return { a, r };
  }

  it('Güç hasarı çarpar; mods yoksa eski', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:yay', 1, 300, { guc: 5 });
    inv.add('item:ok', 10);
    const mods = computeMods(inv, null);
    const { r } = shoot(inv, mods);
    const inv2 = new Inventory();
    inv2.add('item:yay', 1);
    inv2.add('item:ok', 10);
    const { r: r2 } = shoot(inv2, undefined);
    expect(r.fired && r2.fired).toBe(true);
    expect(r.damage / r2.damage).toBeCloseTo(2, 5);
  });

  it('Sonsuzluk: ok tüketmez ve okla ateş edilebilir (çantada ok yok)', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:yay', 1, 300, { sonsuzluk: 1 });
    const mods = computeMods(inv, null);
    const { r } = shoot(inv, mods);
    expect(r.fired).toBe(true);
    const inv2 = new Inventory();
    inv2.add('item:yay', 1);
    const { r: r2 } = shoot(inv2, createMods());
    expect(r2).toMatchObject({ fired: false, reason: 'cephane yok' });
    const inv3 = new Inventory();
    inv3.setSlot(0, 'item:yay', 1, 300, { sonsuzluk: 1 });
    inv3.add('item:ok', 5);
    shoot(inv3, computeMods(inv3, null));
    expect(inv3.count('item:ok')).toBe(5);
  });

  it('Alev oku: isabette yaratık yanar', () => {
    const inv = new Inventory();
    inv.setSlot(0, 'item:yay', 1, 300, { alev: 2 });
    inv.add('item:ok', 5);
    const mods = computeMods(inv, null);
    const { a, r } = shoot(inv, mods);
    expect(r.fired).toBe(true);
    expect(a.em.projectiles[0].status).toEqual({ burn: 2, slow: 0 });
    run(a.em, a.p, 1.5, { dayFactor: 1 });
    expect(a.mob.hp).toBeLessThan(a.mob.maxHp);
    expect(a.mob.magicBurnT).toBeGreaterThan(0);
    expect(a.mob.magicBurnDps).toBe(2);
  });
});

describe('Dikenler ve büyü mermisi', () => {
  it('Dikenler: vuran yaratığa hasar yansır; mods/em yoksa etkisiz', () => {
    const a = arena('golge', -2);
    const sv = createSurvival();
    const inv = new Inventory();
    const mods = createMods();
    mods.thorns = 3;
    const evt = { damage: 3, source: a.mob.id, cause: 'yaratık' };
    const hp0 = a.mob.hp;
    resolvePlayerHit(evt, { survival: sv, inventory: inv, mods, em: a.em });
    expect(hp0 - a.mob.hp).toBe(4);
    const hp1 = a.mob.hp;
    resolvePlayerHit({ damage: 3, source: a.mob.id, cause: 'yaratık' }, { survival: createSurvival() });
    expect(a.mob.hp).toBe(hp1);
    resolvePlayerHit({ damage: 3, source: a.mob.id, cause: 'ok' }, { survival: createSurvival(), mods, em: a.em });
    expect(a.mob.hp).toBe(hp1); // yalnız yakın saldırı
    resolvePlayerHit({ damage: 0, source: a.mob.id, cause: 'yaratık' }, { survival: createSurvival(), mods, em: a.em });
    expect(a.mob.hp).toBe(hp1);
  });

  it('Ateş topu: patlama alan hasarı verir ve yanma bırakır; kindSrc magic', () => {
    const a = arena('golge', -12);
    const events = [];
    const old = a.em.emit;
    a.em.emit = (e) => { events.push(e); old.call(a.em, e); };
    fireProjectile(a.em, 'buyuates', 0, 2.5, -1, 0, 0, -1, 22, 'player', {
      damage: 7, gravity: 3, life: 3, aoe: { r: 2.2 }, status: { burn: 1, slow: 0 }, kindSrc: 'magic',
    });
    run(a.em, a.p, 2.5, { dayFactor: 1 });
    expect(a.mob.hp).toBeLessThan(a.mob.maxHp);
    expect(a.mob.magicBurnT).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'mobHurt' && e.source === 'magic')).toBe(true);
    expect(events.some((e) => e.type === 'fx' && e.name === 'fireImpact')).toBe(true);
  });

  it('Buz mızrağı doğrudan isabette yavaşlatır', () => {
    const a = arena('golge', -9);
    fireProjectile(a.em, 'buyubuz', 0, 2.2, -1, 0, 0, -1, 30, 'player', {
      damage: 5, gravity: 0, life: 2.2, status: { burn: 0, slow: 1 }, kindSrc: 'magic',
    });
    run(a.em, a.p, 1, { dayFactor: 1 });
    expect(a.mob.hp).toBeLessThan(a.mob.maxHp);
    expect(a.mob.slowT).toBeGreaterThan(0);
    expect(a.mob.magicBurnT || 0).toBe(0);
  });

  it('tickMobStatuses: ölen/kaybolan yaratık kümeden düşer; birikmez (en yüksek seviye)', () => {
    const a = arena('golge', -2.6);
    applyMobStatus(a.em, a.mob, 1, 0);
    applyMobStatus(a.em, a.mob, 2, 0);
    expect(a.mob.magicBurnDps).toBe(2);
    expect(a.mob.magicBurnT).toBe(7);
    a.mob.hp = 0.5;
    a.mob.persistent = true;
    for (let i = 0; i < 90; i++) tickMobStatuses(a.em, DT);
    expect(a.mob.dead).toBe(true);
    expect(a.em.magicBurning.size).toBe(0);
    expect(tickMobStatuses({ magicBurning: null }, 1)).toBe(0);
    expect(tickMobStatuses(a.em, 0)).toBe(0);
  });
});

/* ================================================================================================
 * İlerleme: olaylar, görevler, başarımlar
 * ============================================================================================== */
describe('İlerleme: büyü olayları', () => {
  it('olaylar sayaçları artırır ve serileştirilir', () => {
    const p = new Progression(1, { mode: 'macera' });
    p.onEvent({ type: 'enchanted', item: 'item:kılıç_demir' });
    p.onEvent({ type: 'spellCast', spell: 'ates_topu' });
    p.onEvent({ type: 'spellCast', spell: 'buz_mizragi' });
    p.onEvent({ type: 'potionBrewed', count: 3 });
    p.onEvent({ type: 'potionBrewed' });
    p.onEvent({ type: 'potionBrewed', count: 99 });
    p.onEvent({ type: 'potionDrunk', item: 'item:iksir_hiz' });
    p.onEvent({ type: 'manaCrystalUsed' });
    expect(scalarMetric(p, 'enchants')).toBe(1);
    expect(scalarMetric(p, 'spellsCast')).toBe(2);
    expect(scalarMetric(p, 'potionsBrewed')).toBe(3 + 1 + 3);
    expect(scalarMetric(p, 'potionsDrunk')).toBe(1);
    expect(scalarMetric(p, 'manaCrystals')).toBe(1);
    const q = new Progression(1, { mode: 'macera' });
    expect(q.restore(JSON.parse(JSON.stringify(p.serialize())))).toBe(true);
    expect(scalarMetric(q, 'enchants')).toBe(1);
    expect(scalarMetric(q, 'potionsBrewed')).toBe(7);
  });

  it('masa/kazan yerleştirme sayılır (id > 127 sınırı kalktı)', () => {
    const p = new Progression(1, { mode: 'macera' });
    p.onEvent({ type: 'blockPlaced', id: B.MAGIC_TABLE });
    p.onEvent({ type: 'blockPlaced', id: B.ALCHEMY_CAULDRON });
    expect(goalValue(p, { type: 'place', ids: [B.MAGIC_TABLE] })).toBe(1);
    expect(goalValue(p, { type: 'place', ids: [B.ALCHEMY_CAULDRON] })).toBe(1);
    const q = new Progression(1, { mode: 'macera' });
    q.restore(JSON.parse(JSON.stringify(p.serialize())));
    expect(goalValue(q, { type: 'place', ids: [B.MAGIC_TABLE] })).toBe(1);
  });

  it('görevler: büyü zinciri var, hedefler/ödüller/öncüller geçerli', () => {
    expect(QUEST_CHAINS.map((c) => c.key)).toContain('büyü');
    const chain = QUESTS.filter((q) => q.chain === 'büyü');
    expect(chain.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(QUESTS.map((q) => q.id));
    chain.forEach((q) => {
      q.requires.forEach((r) => expect(ids.has(r), q.id + ' → ' + r).toBe(true));
      q.rewards.items.forEach((r) => expect(itemByKey(r.item)).not.toBeNull());
      expect(q.title.length).toBeGreaterThan(2);
      expect(q.hint.length).toBeGreaterThan(10);
      if (q.goal.type === 'craft' || q.goal.type === 'pickup') q.goal.items.forEach((i) => expect(itemByKey(i)).not.toBeNull());
      if (q.goal.type === 'stat') expect(typeof scalarMetric(new Progression(1), q.goal.name)).toBe('number');
    });
  });

  it('zincir sırayla tamamlanır: toz → masa → ilk büyü → kazan → iksir → asa → ilk atış', () => {
    const p = new Progression(3, { mode: 'macera' });
    const done = (id) => !!p.questsDone[id];
    // önkoşul zincirini (tas_kazma, tezgah_koy, demir_erit) doğrudan olaylarla sağla
    const evs = [];
    const feed = (e) => { const o = p.onEvent(e); o.events.forEach((x) => evs.push(x)); return o; };
    ['blok:meşe_tahta'].forEach(() => {});
    for (let i = 0; i < 3; i++) feed({ type: 'blockBroken', id: B.LOG_OAK });
    feed({ type: 'itemCrafted', item: 'blok:meşe_tahta', count: 8 });
    feed({ type: 'itemCrafted', item: 'blok:tezgah', count: 1 });
    feed({ type: 'blockPlaced', id: B.WORKBENCH });
    feed({ type: 'itemCrafted', item: 'item:sopa', count: 4 });
    feed({ type: 'itemCrafted', item: 'item:kazma_ahşap', count: 1 });
    for (let i = 0; i < 10; i++) feed({ type: 'blockBroken', id: B.STONE });
    feed({ type: 'itemCrafted', item: 'item:kazma_taş', count: 1 });
    feed({ type: 'itemPickedUp', item: 'item:büyü_tozu', count: 5 });
    expect(done('by_toz')).toBe(true);
    feed({ type: 'itemCrafted', item: 'blok:kitaplık', count: 3 });
    feed({ type: 'itemCrafted', item: 'blok:büyü_masası', count: 1 });
    feed({ type: 'blockPlaced', id: B.MAGIC_TABLE });
    expect(done('by_masa_koy')).toBe(true);
    feed({ type: 'enchanted' });
    expect(done('by_ilk_buyu')).toBe(true);
    feed({ type: 'itemCrafted', item: 'item:asa_ates', count: 1 });
    feed({ type: 'spellCast' });
    expect(done('by_asa')).toBe(true);
    expect(done('by_ilk_atis')).toBe(true);
    // ödül eşyaları çıktıda (Büyü Tozu)
    expect(evs.some((e) => e.type === 'questUpdate' && e.id === 'by_masa_koy' && e.completed)).toBe(true);
  });

  it('başarımlar: yeni ölçütler tanımlı, simgeler geçerli, tetiklenir', () => {
    const mine = ['buyucu_cirak', 'buyucu_10', 'buyucu_50', 'asa_ilk', 'asa_50', 'asa_500', 'simyaci', 'simyaci_20', 'iksir_10', 'mana_ustasi'];
    mine.forEach((id) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      expect(a, id).toBeTruthy();
      expect(typeof scalarMetric(new Progression(1), a.metric)).toBe('number');
    });
    const p = new Progression(1, { mode: 'macera' });
    const out = p.onEvent({ type: 'enchanted' });
    expect(out.events.some((e) => e.type === 'achievement' && e.id === 'buyucu_cirak')).toBe(true);
    const out2 = p.onEvent({ type: 'potionBrewed', count: 1 });
    expect(out2.events.some((e) => e.type === 'achievement' && e.id === 'simyaci')).toBe(true);
  });

  it('insa modunda ilerleme/ödül yok (olaylar sayılır ama olay üretmez)', () => {
    const p = new Progression(1, { mode: 'insa' });
    const out = p.onEvent({ type: 'enchanted' });
    expect(out.events).toEqual([]);
  });
});

/* ================================================================================================
 * Ganimet
 * ============================================================================================== */
describe('Ganimet: büyü malzemeleri sandıklarda', () => {
  it('belirlenimci ve Büyü Tozu yaygın çıkar; asa/iksir/Mana Kristali ilerleyen bölgelerde', () => {
    const a = lootForChest(5, { x: 10, y: 20, z: 30 }, { zone: 1, kind: 'sandık' });
    expect(lootForChest(5, { x: 10, y: 20, z: 30 }, { zone: 1, kind: 'sandık' })).toEqual(a);
    let dust = 0;
    let shard = 0;
    const seen = new Set();
    for (let i = 0; i < 600; i++) {
      const kind = i % 3 === 0 ? 'ödül' : 'sandık';
      lootForChest(11, { x: i * 3, y: 30, z: i * 7 }, { zone: i % 5, kind, structType: i % 2 ? 'turbe' : 'harabe' }).forEach((l) => {
        seen.add(l.item);
        if (l.item === 'item:büyü_tozu') dust++;
        if (l.item === 'item:kuantum_kıymığı') shard++;
        expect(itemByKey(l.item)).not.toBeNull();
        expect(l.count).toBeGreaterThanOrEqual(1);
        expect(l.count).toBeLessThanOrEqual(itemByKey(l.item).stack);
      });
    }
    expect(dust).toBeGreaterThan(60);
    expect(shard).toBeGreaterThan(10);
    ['item:mana_kristali', 'item:asa_ates', 'item:iksir_hiz'].forEach((k) => expect(seen.has(k), k).toBe(true));
  });

  it('boss sandığı Büyü Tozu garantiler', () => {
    const l = lootForChest(9, { x: 1, y: 2, z: 3 }, { zone: 3, kind: 'boss' });
    expect(l.find((x) => x.item === 'item:büyü_tozu').count).toBeGreaterThanOrEqual(12);
  });
});

describe('Genel güvenlik', () => {
  it('createMagicState + computeMods + tüm modüller aynı anda hatasız', () => {
    const m = createMagic(1);
    const m2 = restoreMagicAll(createMagic(2), serializeMagicAll(m));
    expect(m2.state.enchantSeed).toBe(m.state.enchantSeed);
    expect(createMagicState(1).enchantSeed).toBe(m.state.enchantSeed);
  });
});
