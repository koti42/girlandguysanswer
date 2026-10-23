import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { Inventory } from './inventory.js';
import { createSurvival } from './survival.js';
import { MOB_TYPES } from './mobTypes.js';
import { seededRandom } from './rng.js';
import {
  ABILITY_ITEMS, CELL_SHOTS, DamageNumbers, createCombatState, fireRayGun, playerMelee, releaseBow, resolvePlayerHit,
  rollLoot, scaleMobDamage, shieldReduce, startBowCharge, syncArmor, updateCombat, weaponStats, xpFor, scoreFor,
} from './combat.js';
import {
  fillBox, makeEm, makePlayer, makeWorld, ofType, run,
} from './mobAITestKit.js';

const LOOK_NZ = { x: 0, y: 0, z: -1 };
const LOOK_DOWN = { x: 0, y: -0.2, z: -1 }; // alçak yaratıklar için (göz 2,62)
const NIGHT = { dayFactor: 0 };

/** Oyuncu (0,1,0) bakış -Z; mob önünde. hash hazır olsun diye 1 kare koştur. */
function arena(mobType, mobZ, opts) {
  const w = (opts && opts.world) || makeWorld();
  const kit = makeEm(w);
  const p = makePlayer(0, 1, 0);
  p.eyeH = 1.62;
  const mob = kit.em.spawn(mobType, 0, 1, mobZ);
  // yalnızca karma kurmak için; yaratık hareket etmesin diye bayat bırak
  mob.persistent = true;
  kit.em.update(0.0001, p, { dayFactor: 1 });
  return { ...kit, p, mob, w, cs: createCombatState() };
}

describe('weaponStats', () => {
  it('yumruk, kılıç, yay, ışın tüfeği', () => {
    expect(weaponStats(null)).toMatchObject({ kind: 'yumruk', damage: 1, ranged: false });
    expect(weaponStats('item:kılıç_demir')).toMatchObject({ kind: 'yakın', damage: 6, reach: 3.2, cooldown: 0.45 });
    expect(weaponStats('item:yay')).toMatchObject({ kind: 'yay', ranged: true, ammo: 'item:ok' });
    expect(weaponStats('item:ışın_tüfeği')).toMatchObject({ kind: 'ışın', hitscan: true, blockDamage: true });
    expect(weaponStats('item:elma')).toMatchObject({ kind: 'yumruk' });
  });
});

describe('Yakın dövüş', () => {
  it('menzilde vurur, hasar eşyadan gelir, bekleme süresi var', () => {
    const a = arena('golge', -2.6);
    const r = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir');
    expect(r.ok).toBe(true);
    expect(r.hit).toBe('entity');
    expect(r.damage).toBe(6);
    expect(a.mob.hp).toBe(a.mob.maxHp - 6);
    const r2 = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir');
    expect(r2).toMatchObject({ ok: false, reason: 'bekleme' });
    updateCombat(a.cs, 0.5);
    expect(playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir').ok).toBe(true);
  });

  it('menzil dışı ıska, yumruk 1 hasar', () => {
    const a = arena('golge', -5);
    const r = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir');
    expect(r.hit).toBeNull();
    expect(r.swing).toBe(true);
    updateCombat(a.cs, 1);
    const b = arena('golge', -2);
    const r2 = playerMelee(b.em, b.cs, b.p, LOOK_NZ, null);
    expect(r2.damage).toBe(1);
  });

  it('duvarın arkasındaki yaratığa vurulmaz', () => {
    const w = makeWorld();
    fillBox(w, -1, 1, -2, 1, 3, -2, B.STONE);
    const a = arena('golge', -3, { world: w });
    const r = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir');
    expect(r.hit).toBeNull();
    expect(a.mob.hp).toBe(a.mob.maxHp);
  });

  it('düşerken vuruş kritik (×1,5), koşarken geri tepme güçlü', () => {
    const a = arena('golge', -2.5);
    a.p.onGround = false;
    a.p.vy = -4;
    const r = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_demir');
    expect(r.crit).toBe(true);
    expect(r.damage).toBe(9);
    expect(ofType(a.events, 'mobHurt')[0].crit).toBe(true);
    expect(a.em.numbers.list[a.em.numbers.list.length - 1].kind).toBe('crit');

    const b = arena('koyun', -2.5);
    b.p.sprinting = true;
    playerMelee(b.em, b.cs, b.p, LOOK_DOWN, 'item:kılıç_demir');
    const c = arena('koyun', -2.5);
    playerMelee(c.em, c.cs, c.p, LOOK_DOWN, 'item:kılıç_demir');
    expect(Math.abs(b.mob.vz)).toBeGreaterThan(Math.abs(c.mob.vz));
  });

  it('dayanıklılık düşer, kırılınca bildirilir', () => {
    const a = arena('golge', -2.5);
    const inv = new Inventory();
    inv.add('item:kılıç_ahşap', 1);
    const slot = inv.held();
    slot.dur = 1;
    const r = playerMelee(a.em, a.cs, a.p, LOOK_NZ, 'item:kılıç_ahşap', { inventory: inv });
    expect(r.broke).toBe(true);
    expect(inv.held()).toBeNull();
  });

  it('dost ateşi yok: oyuncu vuruşu oyuncuya, yaratık oyuncuyu vurunca diğer yaratığa zarar vermez', () => {
    const { em, events } = makeEm(makeWorld());
    const p = makePlayer(0, 1, 0);
    const k = em.spawn('kemikci', 0, 1, -10, { aggro: true });
    const bystander = em.spawn('koyun', 0, 1, -5);
    bystander.persistent = true;
    run(em, p, 8, NIGHT);
    expect(k.ai.ph).toBeGreaterThanOrEqual(0);
    expect(bystander.hp).toBe(bystander.maxHp);
    expect(ofType(events, 'mobHurt').length).toBe(0);
  });
});

describe('Yay ve ok', () => {
  it('germe, cephane tüketimi, mermi yürür ve vurur; hasar şarja bağlı', () => {
    const results = [];
    for (const secs of [0.25, 1]) {
      const a = arena('golge', -12);
      a.mob.persistent = true;
      const inv = new Inventory();
      inv.add('item:yay', 1);
      inv.add('item:ok', 5);
      expect(startBowCharge(a.cs, 'item:yay')).toBe(true);
      updateCombat(a.cs, secs);
      const r = releaseBow(a.em, a.cs, a.p, LOOK_NZ, 'item:yay', inv);
      expect(r.fired).toBe(true);
      expect(inv.count('item:ok')).toBe(4);
      expect(a.em.projectiles.length).toBe(1);
      run(a.em, a.p, 1.2, { dayFactor: 1 });
      results.push({ dmg: r.damage, hp: a.mob.hp, max: a.mob.maxHp, speed: r.speed });
    }
    expect(results[1].dmg).toBeGreaterThan(results[0].dmg);
    expect(results[1].speed).toBeGreaterThan(results[0].speed);
    expect(results[1].hp).toBeLessThan(results[1].max);
  });

  it('cephane yoksa ya da zayıf germede ateş etmez', () => {
    const a = arena('golge', -12);
    const inv = new Inventory();
    inv.add('item:yay', 1);
    startBowCharge(a.cs, 'item:yay');
    updateCombat(a.cs, 1);
    expect(releaseBow(a.em, a.cs, a.p, LOOK_NZ, 'item:yay', inv)).toMatchObject({ fired: false, reason: 'cephane yok' });
    startBowCharge(a.cs, 'item:yay');
    updateCombat(a.cs, 0.05);
    expect(releaseBow(a.em, a.cs, a.p, LOOK_NZ, 'item:yay', inv).reason).toBe('zayıf');
    expect(startBowCharge(a.cs, 'item:kılıç_demir')).toBe(false);
  });

  it('ok bloğa saplanır, sonra kaybolur; yerçekimiyle düşer', () => {
    const a = arena('koyun', -60);
    const inv = new Inventory();
    inv.add('item:yay', 1);
    inv.add('item:ok', 2);
    a.p.y = 3;
    startBowCharge(a.cs, 'item:yay');
    updateCombat(a.cs, 1);
    releaseBow(a.em, a.cs, a.p, { x: 0, y: 0.05, z: -1 }, 'item:yay', inv);
    run(a.em, a.p, 3, { dayFactor: 1 });
    const arrow = a.em.projectiles[0];
    expect(arrow.stuck).toBe(true);
    expect(arrow.y).toBeLessThan(2);
    run(a.em, a.p, 11, { dayFactor: 1 });
    expect(a.em.projectiles.length).toBe(0);
    expect(ofType(a.events, 'fx').some((e) => e.name === 'arrowStick')).toBe(true);
  });

  it('kafaya isabet kritik sayılır', () => {
    const a = arena('golge', -8);
    const inv = new Inventory();
    inv.add('item:yay', 1);
    inv.add('item:ok', 2);
    a.p.eyeH = 1.62;
    startBowCharge(a.cs, 'item:yay');
    updateCombat(a.cs, 1);
    releaseBow(a.em, a.cs, a.p, { x: 0, y: 0.0, z: -1 }, 'item:yay', inv);
    run(a.em, a.p, 1, { dayFactor: 1 });
    const hurt = ofType(a.events, 'mobHurt');
    expect(hurt.length).toBe(1);
    expect(hurt[0].crit).toBe(true); // göz 2,62 > 1 + 1,9×0,82
  });
});

describe('Işın tüfeği', () => {
  it('anında vurur; her 6 atışta 1 enerji hücresi harcar', () => {
    const a = arena('golge', -15);
    const inv = new Inventory();
    inv.add('item:ışın_tüfeği', 1);
    inv.add('item:enerji_hücresi', 2);
    let cells = inv.count('item:enerji_hücresi');
    const used = [];
    for (let i = 0; i < CELL_SHOTS * 2; i++) {
      updateCombat(a.cs, 1);
      const r = fireRayGun(a.em, a.cs, a.p, LOOK_NZ, 'item:ışın_tüfeği', inv);
      expect(r.fired).toBe(true);
      if (i === 0) {
        expect(r.result.kind).toBe('entity');
        expect(r.result.dealt).toBe(8);
      }
      used.push(cells - inv.count('item:enerji_hücresi'));
      cells = inv.count('item:enerji_hücresi');
    }
    expect(used.filter((u) => u === 1).length).toBe(2);
    updateCombat(a.cs, 1);
    expect(fireRayGun(a.em, a.cs, a.p, LOOK_NZ, 'item:ışın_tüfeği', inv)).toMatchObject({ fired: false, reason: 'cephane yok' });
    expect(a.mob.dead).toBe(true); // 20 can, 8 hasar × 3
  });

  it('blok kırma YAVAŞ: taş çok atış ister; çatlak geri çekilir; sistem blokları kırılmaz', () => {
    const w = makeWorld();
    w.setBlock(0, 2, -5, B.STONE);
    w.setBlock(0, 3, -5, B.BEDROCK);
    const a = arena('koyun', -60, { world: w });
    a.p.y = 2 - 1.62 + 0.0; // göz y=2,5 civarı? hedef bloğun içine bakacak şekilde ayarlı
    a.p.y = 1.4;
    const inv = new Inventory();
    inv.add('item:ışın_tüfeği', 1);
    inv.add('item:enerji_hücresi', 20);
    const look = { x: 0, y: 0, z: -1 };
    let shots = 0;
    let brokeAt = -1;
    for (let i = 0; i < 60; i++) {
      updateCombat(a.cs, 1);
      const r = fireRayGun(a.em, a.cs, a.p, look, 'item:ışın_tüfeği', inv);
      shots++;
      if (r.result.kind !== 'block') break;
      if (r.result.broke) {
        brokeAt = shots;
        break;
      }
    }
    expect(brokeAt).toBeGreaterThan(8); // yavaş
    expect(w.getBlock(0, 2, -5)).toBe(0);
    expect(ofType(a.events, 'blockBroken').length).toBe(1);
    expect(a.em.items.size).toBeGreaterThan(0); // blok düştü
    // ana kaya: asla
    a.p.y = 2.4;
    for (let i = 0; i < 30; i++) {
      updateCombat(a.cs, 1);
      fireRayGun(a.em, a.cs, a.p, look, 'item:ışın_tüfeği', inv);
    }
    expect(w.getBlock(0, 3, -5)).toBe(B.BEDROCK);
  });

  it('çatlak vuruşlar arasında geri çekilir', () => {
    const w = makeWorld();
    w.setBlock(0, 2, -5, B.STONE);
    const a = arena('koyun', -60, { world: w });
    a.p.y = 1.4;
    const inv = new Inventory();
    inv.add('item:ışın_tüfeği', 1);
    inv.add('item:enerji_hücresi', 4);
    updateCombat(a.cs, 1);
    fireRayGun(a.em, a.cs, a.p, LOOK_NZ, 'item:ışın_tüfeği', inv);
    const e = [...a.em.blockDamage.values()][0];
    expect(e.p).toBeGreaterThan(0);
    run(a.em, a.p, 6, { dayFactor: 1 });
    expect(a.em.blockDamage.size).toBe(0);
  });
});

describe('Kalkan, zırh ve oyuncu vuruşu', () => {
  it('kalkan önden gelen hasarı %60 azaltır, arkadan etkisiz', () => {
    const p = makePlayer(0, 1, 0);
    p.blocking = true;
    p.yaw = 0; // -Z'ye bakar
    const front = shieldReduce(p, 10, 0, -5);
    expect(front).toMatchObject({ blocked: true, damage: 4 });
    expect(front.wear).toBeGreaterThanOrEqual(1);
    expect(shieldReduce(p, 10, 0, 5)).toMatchObject({ blocked: false, damage: 10 });
    p.blocking = false;
    expect(shieldReduce(p, 10, 0, -5).blocked).toBe(false);
  });

  it('hurtPlayer: kalkan + zorluk uygulanır, playerHit olayı tam alanlı', () => {
    const { em, events } = makeEm(makeWorld(), { difficulty: 'hard' });
    const p = makePlayer(0, 1, 0);
    p.blocking = true;
    em.update(0.01, p, NIGHT);
    const g = em.spawn('golge', 0, 1, -2);
    const d = em.hurtPlayer(g, 4, { cause: 'yaratık', kStrength: 6 });
    expect(d).toBeCloseTo(4 * 1.35 * 0.4, 5);
    const e = ofType(events, 'playerHit')[0];
    expect(e).toMatchObject({ cause: 'yaratık', source: g.id, sourceType: 'golge', blocked: true });
    expect(e.kz).toBeGreaterThan(0.9); // yaratık -Z'de → oyuncu +Z'ye itilir
    expect(em.numbers.list.some((n) => n.kind === 'block')).toBe(true);
  });

  it('resolvePlayerHit: zırh puanı can düşümünü azaltır, aşınma uygulanır', () => {
    const inv = new Inventory();
    inv.add('item:göğüslük_demir', 1);
    inv.equip(0);
    const sv = createSurvival();
    syncArmor(sv, inv);
    expect(sv.armor).toBe(6);
    const wear0 = inv.armor[1].dur;
    const r = resolvePlayerHit({ damage: 5, cause: 'yaratık', kx: 0, kz: 1, kStrength: 6, shieldWear: 0 }, { survival: sv, inventory: inv });
    expect(r.applied).toBeLessThan(5);
    expect(sv.hp).toBeLessThan(20);
    expect(inv.armor[1].dur).toBe(wear0 - 1);
    expect(r.knock).toEqual({ x: 0, z: 1, strength: 6 });
  });

  it('kolay mod oyuncunun canını etkilemez (survival), yaratık hasarı yarıya iner', () => {
    expect(scaleMobDamage(4, 'easy')).toBe(2);
    expect(scaleMobDamage(4, 'normal')).toBe(4);
    expect(scaleMobDamage(4, 'hard')).toBe(5.4);
    const sv = createSurvival({ easy: true });
    expect(resolvePlayerHit({ damage: 5, cause: 'yaratık', kStrength: 0 }, { survival: sv }).applied).toBe(0);
    expect(sv.hp).toBe(20);
  });
});

describe('Ganimet, XP, puan', () => {
  it('aynı rng → aynı ganimet; farklı rng farklı olabilir; boss yetenek eşyası her zaman', () => {
    const a = rollLoot('kemikci', seededRandom(7), {});
    const b = rollLoot('kemikci', seededRandom(7), {});
    expect(a).toEqual(b);
    const sig = new Set();
    for (let i = 0; i < 40; i++) sig.add(JSON.stringify(rollLoot('kemikci', seededRandom(i), {})));
    expect(sig.size).toBeGreaterThan(3);
    for (const k of ['kokana', 'tasbekci', 'buzkral', 'golgehukumdar']) {
      const l = rollLoot(k, seededRandom(1), {});
      expect(l.some((x) => x.item === ABILITY_ITEMS[MOB_TYPES[k].ability])).toBe(true);
      expect(l.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('şans: kesin düşenler hep düşer; nadir düşen luck ile artar', () => {
    let base = 0;
    let lucky = 0;
    for (let i = 0; i < 400; i++) {
      if (rollLoot('kemikci', seededRandom(i), {}).some((x) => x.item === 'item:yay')) base++;
      if (rollLoot('kemikci', seededRandom(i), { luck: 1 }).some((x) => x.item === 'item:yay')) lucky++;
    }
    expect(lucky).toBeGreaterThan(base * 3);
    for (let i = 0; i < 20; i++) expect(rollLoot('tavuk', seededRandom(i), {}).some((x) => x.item === 'item:çiğ_tavuk')).toBe(true);
    expect(rollLoot('kelebek', seededRandom(1), {})).toEqual([]);
    expect(rollLoot('yok', seededRandom(1), {})).toEqual([]);
  });

  it('xp/puan', () => {
    expect(xpFor(MOB_TYPES.golge)).toBe(5);
    expect(scoreFor(MOB_TYPES.golge)).toBe(50);
    expect(scoreFor(MOB_TYPES.kokana)).toBe(120 * 10 * 5);
  });

  it('ölen yaratığın ganimeti yere düşer ve olay taşır', () => {
    const { em, events } = makeEm(makeWorld());
    const p = makePlayer(30, 1, 30);
    const k = em.spawn('kemikci', 0, 1, 0);
    em.update(0.01, p, NIGHT);
    em.damage(k.id, 999, { kind: 'melee', luck: 1 });
    const e = ofType(events, 'mobKilled')[0];
    expect(e.loot.length).toBeGreaterThan(0);
    const dropped = {};
    em.items.forEach((it) => { dropped[it.item] = (dropped[it.item] || 0) + it.count; });
    for (const l of e.loot) expect(dropped[l.item]).toBe(l.count);
  });
});

describe('Hasar sayıları', () => {
  it('doğar, yükselir, süresi dolunca silinir, üst sınır 48', () => {
    const d = new DamageNumbers();
    d.add(0, 1, 0, 5, 'hit');
    d.add(0, 1, 0, 7.5, 'crit');
    expect(d.list[0].text).toBe('5');
    expect(d.list[1].text).toBe('7.5');
    const y0 = d.list[0].y;
    d.update(0.2);
    expect(d.list[0].y).toBeGreaterThan(y0);
    d.update(1.5);
    expect(d.list.length).toBe(0);
    for (let i = 0; i < 100; i++) d.add(0, 0, 0, i + 1, 'hit');
    expect(d.list.length).toBe(48);
    d.add(0, 0, 0, 0, 'block');
    expect(d.list[d.list.length - 1].text).toBe('Engellendi');
  });
});
