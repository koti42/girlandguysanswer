/*
 * KEŞİF sim — hayatta kalma (saf): can, açlık, doygunluk, oksijen, iyileşme, açlık hasarı, zırh, ölüm.
 *
 * Birimler: can 20 (10 kalp, 0,5 adım), açlık 20, oksijen SANİYE (15 sn). Hasar türleri (Türkçe, olaylarda `cause`):
 * 'düşme' | 'boğulma' | 'açlık' | 'boşluk' | 'lav' | 'kaktüs' | 'yaratık' | 'ok' | 'ışın' | 'patlama' | 'büyü' | 'genel'.
 * 'büyü' hasarında zırh etkisi yarıya iner (ARMOR_PARTIAL). ctx.mods (magicMods; yoksa kimlik) düşme/ateş/oksijen/yenilenmeyi etkiler.
 * Zırhı ve dokunulmazlık karelerini yok sayanlar: bkz. ARMOR_IGNORED / IGNORES_INVULN.
 * Çocuk dostu: 'kolay' ayar (state.easy) = hasarsız keşif (hasar 0, açlık sürmez, ölmez; boşluk → kurtarma olayı);
 * inşa modunda (ctx.mode === 'insa') da hasarsız. Açlık can bitirmez (starveKills=false), 1 cana kadar indirir.
 * Sim'de Math.random/Date.now yok; tüm girdi ctx ve çağrı parametreleriyle gelir.
 */
export const SURVIVAL = Object.freeze({
  maxHp: 20,
  maxHunger: 20,
  maxOxygen: 15,
  invulnTime: 0.5,
  regenHunger: 18,
  slowRegenEvery: 4,
  fastRegenEvery: 0.5,
  starveEvery: 4,
  drownEvery: 1,
  drownDamage: 2,
  oxygenRefill: 5,
  contactEvery: 0.5,
  armorPerPoint: 0.04,
  armorCap: 0.8,
  deathDropSeconds: 300,
  hurtFlashTime: 0.6,
});

/** Zırhın azaltmadığı hasar türleri. */
export const ARMOR_IGNORED = Object.freeze(['düşme', 'boğulma', 'açlık', 'boşluk']);
/** Dokunulmazlık karelerini yok sayan (periyodik/çevresel) türler. */
export const IGNORES_INVULN = Object.freeze(['boğulma', 'açlık', 'boşluk']);
/** Zırhın yalnız kısmen azalttığı türler (tür → zırh etkisi çarpanı). */
export const ARMOR_PARTIAL = Object.freeze({ büyü: 0.5 });

/** Egzersiz (exhaustion) maliyetleri (açlık çubuğunu eritir). */
export const EXHAUSTION = Object.freeze({
  sprintPerMeter: 0.1,
  swimPerMeter: 0.01,
  walkPerMeter: 0,
  jump: 0.05,
  sprintJump: 0.2,
  breakBlock: 0.005,
  attack: 0.1,
  hurt: 0.1,
  regen: 6,
});

function round05(v) {
  return Math.round(v * 2) / 2;
}
function num(v, d) {
  return Number.isFinite(v) ? v : d;
}

/**
 * Yeni durum. opts: {maxHp, maxHunger, maxOxygen, easy, starveKills}
 */
export function createSurvival(opts) {
  const o = opts || {};
  const maxHp = num(o.maxHp, SURVIVAL.maxHp);
  const maxHunger = num(o.maxHunger, SURVIVAL.maxHunger);
  const maxOxygen = num(o.maxOxygen, SURVIVAL.maxOxygen);
  return {
    hp: maxHp, maxHp,
    hunger: maxHunger, maxHunger,
    saturation: 5,
    exhaustion: 0,
    oxygen: maxOxygen, maxOxygen,
    armor: 0,
    invuln: 0,
    lastDamage: 0,
    regenTimer: 0,
    starveTimer: 0,
    drownTimer: 0,
    contactTimer: 0,
    hurtFlash: 0,
    mregen: 0,
    easy: !!o.easy,
    starveKills: !!o.starveKills,
    dead: false,
    deathCause: null,
    age: 0,
    events: [],
  };
}

/** Ayarlanan zırh puanı (inventory.armorDefense()); 0..20. */
export function setArmor(state, defense) {
  state.armor = Math.max(0, Math.min(20, num(defense, 0)));
}

/** Zırh puanından azaltma oranı (0..0,8). */
export function armorReduction(defense) {
  return Math.min(SURVIVAL.armorCap, Math.max(0, defense) * SURVIVAL.armorPerPoint);
}

function invulnerableMode(state, mode) {
  return state.easy || mode === 'insa';
}

/**
 * Hasar uygula. opts: {type='genel', ignoreArmor, ignoreInvuln, mode} → gerçekte uygulanan hasar (0 olabilir).
 * Dokunulmazlık karesinde yalnızca öncekinden BÜYÜK hasarın farkı geçer. Ölürse state.dead=true ve 'death' olayı.
 */
export function applyDamage(state, amount, opts) {
  const o = opts || {};
  if (state.dead || !(amount > 0)) return 0;
  const type = o.type || 'genel';
  if (invulnerableMode(state, o.mode)) return 0;
  let dmg = amount;
  if (!o.ignoreArmor && ARMOR_IGNORED.indexOf(type) < 0 && state.armor > 0) {
    const part = ARMOR_PARTIAL[type] === undefined ? 1 : ARMOR_PARTIAL[type];
    dmg *= 1 - armorReduction(state.armor) * part;
  }
  // enerji kalkanı (techMods.createShieldHook; oyun katmanı state.shieldHook'a atar, kayda yazılmaz): zırhla aynı hasar türlerinde
  if (!o.ignoreArmor && ARMOR_IGNORED.indexOf(type) < 0 && typeof state.shieldHook === 'function') {
    const before = dmg;
    dmg = state.shieldHook(dmg, type);
    if (before - dmg > 0.001) state.events.push({ type: 'shieldAbsorb', amount: round05(before - dmg), cause: type });
    if (dmg <= 0.001) return 0;
  }
  dmg = Math.max(0.5, round05(dmg));
  const skipInvuln = o.ignoreInvuln || IGNORES_INVULN.indexOf(type) >= 0;
  if (!skipInvuln && state.invuln > 0) {
    if (dmg <= state.lastDamage) return 0;
    const extra = dmg - state.lastDamage;
    state.lastDamage = dmg;
    dmg = extra;
  } else if (!skipInvuln) {
    state.invuln = SURVIVAL.invulnTime;
    state.lastDamage = dmg;
  }
  state.hp = Math.max(0, state.hp - dmg);
  state.hurtFlash = 1;
  state.exhaustion += EXHAUSTION.hurt;
  state.events.push({ type: 'damage', amount: dmg, cause: type, hp: state.hp });
  if (state.hp <= 0) {
    state.dead = true;
    state.deathCause = type;
    state.events.push({ type: 'death', cause: type });
  }
  return dmg;
}

/** İyileştir; gerçekte eklenen can. */
export function heal(state, amount) {
  if (state.dead || !(amount > 0)) return 0;
  const before = state.hp;
  state.hp = Math.min(state.maxHp, state.hp + amount);
  const got = state.hp - before;
  if (got > 0) state.events.push({ type: 'heal', amount: got, hp: state.hp });
  return got;
}

/** Egzersiz ekle (açlık bu birikimle erir). */
export function addExhaustion(state, amount) {
  if (amount > 0) state.exhaustion += amount;
}

/** Yemek yenebilir mi? (açlık doluysa yenmez; altın elma/iksir gibi can verenler `food.heal>0` ile hep yenir) */
export function canEat(state, food) {
  if (state.dead || !food) return false;
  if (state.hunger < state.maxHunger) return true;
  return num(food.heal, 0) > 0 && state.hp < state.maxHp;
}

/**
 * Yemek ye: food {hunger, heal?, saturation?}. Anında etki (yeme süresi game.js'te). → {ate, hunger, healed}
 */
export function eat(state, food) {
  if (!canEat(state, food)) return { ate: false, hunger: 0, healed: 0 };
  const h = Math.max(0, num(food.hunger, 0));
  const beforeHunger = state.hunger;
  state.hunger = Math.min(state.maxHunger, state.hunger + h);
  const gained = state.hunger - beforeHunger;
  const sat = num(food.saturation, h * 0.6);
  state.saturation = Math.min(state.hunger, state.saturation + Math.max(0, sat));
  const healed = heal(state, num(food.heal, 0));
  state.events.push({ type: 'eat', hunger: gained, healed });
  return { ate: true, hunger: gained, healed };
}

/** Su altında mı olduğu ctx.headInWater ile gelir; oksijen sn. */
function updateOxygen(state, dt, ctx) {
  const mods = ctx.mods;
  if (ctx.headInWater && !ctx.waterBreathing && !(mods && mods.waterBreathing)) {
    // Su Soluğu (oxygenMul): oksijen daha yavaş tükenir
    state.oxygen = Math.max(0, state.oxygen - dt / (mods && mods.oxygenMul > 1 ? mods.oxygenMul : 1));
    if (state.oxygen <= 0) {
      state.drownTimer += dt;
      while (state.drownTimer >= SURVIVAL.drownEvery) {
        state.drownTimer -= SURVIVAL.drownEvery;
        state.events.push({ type: 'drowning' });
        applyDamage(state, SURVIVAL.drownDamage, { type: 'boğulma', mode: ctx.mode });
      }
    }
  } else {
    state.drownTimer = 0;
    if (state.oxygen < state.maxOxygen) {
      state.oxygen = Math.min(state.maxOxygen, state.oxygen + dt * SURVIVAL.oxygenRefill);
    }
  }
}

function updateHunger(state, dt, ctx) {
  if (state.easy || ctx.mode === 'insa') {
    state.exhaustion = 0;
    return;
  }
  // hareket maliyeti
  const moved = num(ctx.moved, 0);
  if (moved > 0) {
    if (ctx.swimming) state.exhaustion += moved * EXHAUSTION.swimPerMeter;
    else if (ctx.sprinting && !ctx.flying) state.exhaustion += moved * EXHAUSTION.sprintPerMeter;
  }
  while (state.exhaustion >= 4) {
    state.exhaustion -= 4;
    if (state.saturation > 0) state.saturation = Math.max(0, state.saturation - 1);
    else state.hunger = Math.max(0, state.hunger - 1);
  }
  if (state.saturation > state.hunger) state.saturation = state.hunger;

  if (state.hunger >= state.maxHunger && state.saturation > 0 && state.hp < state.maxHp) {
    // hızlı iyileşme
    state.regenTimer += dt;
    while (state.regenTimer >= SURVIVAL.fastRegenEvery && state.hp < state.maxHp) {
      state.regenTimer -= SURVIVAL.fastRegenEvery;
      heal(state, 1);
      state.exhaustion += EXHAUSTION.regen * 0.5;
    }
  } else if (state.hunger >= SURVIVAL.regenHunger && state.hp < state.maxHp) {
    state.regenTimer += dt;
    while (state.regenTimer >= SURVIVAL.slowRegenEvery && state.hp < state.maxHp) {
      state.regenTimer -= SURVIVAL.slowRegenEvery;
      heal(state, 1);
      state.exhaustion += EXHAUSTION.regen;
    }
  } else if (state.hunger <= 0) {
    state.regenTimer = 0;
    state.starveTimer += dt;
    while (state.starveTimer >= SURVIVAL.starveEvery) {
      state.starveTimer -= SURVIVAL.starveEvery;
      const floor = state.starveKills ? 0 : 1;
      if (state.hp > floor) {
        state.events.push({ type: 'starving' });
        applyDamage(state, Math.min(1, state.hp - floor), { type: 'açlık', mode: ctx.mode });
      }
    }
  } else {
    state.regenTimer = 0;
  }
  if (state.hunger > 0) state.starveTimer = 0;
}

/**
 * Bir adım. ctx: {headInWater, waterBreathing?, inLava, contactDps (temas hasarı/sn, lav dahil), contactType?,
 *   sprinting, swimming, flying, moved (bu adımda yatay mesafe, blok), mode:'macera'|'insa'|'harita'}
 * → state.events (her adım sıfırlanır): {type:'damage'|'death'|'heal'|'eat'|'drowning'|'starving'|'rescue'|...}
 */
export function update(state, dt, ctx) {
  const c = ctx || {};
  state.events.length = 0;
  if (!(dt > 0)) return state.events;
  state.age += dt;
  if (state.invuln > 0) {
    state.invuln -= dt;
    if (state.invuln <= 0) {
      state.invuln = 0;
      state.lastDamage = 0;
    }
  }
  if (state.hurtFlash > 0) state.hurtFlash = Math.max(0, state.hurtFlash - dt / SURVIVAL.hurtFlashTime);
  if (state.dead) return state.events;

  updateOxygen(state, dt, c);

  const mods = c.mods;
  const contactType = c.contactType || (c.inLava ? 'lav' : 'kaktüs');
  // Ateş Direnci / iksir: lav ve ateş temas hasarı fireMul ile ölçeklenir (0 = bağışık)
  const fireMul = mods && (contactType === 'lav' || contactType === 'ateş') && mods.fireMul < 1 ? Math.max(0, mods.fireMul) : 1;
  const dps = num(c.contactDps, 0) * fireMul;
  if (dps > 0) {
    state.contactTimer += dt;
    if (state.contactTimer >= SURVIVAL.contactEvery) {
      state.contactTimer -= SURVIVAL.contactEvery;
      applyDamage(state, dps * SURVIVAL.contactEvery, { type: contactType, mode: c.mode, ignoreInvuln: true });
    }
  } else {
    state.contactTimer = SURVIVAL.contactEvery;
  }

  // büyülü/iksirli yenilenme (açlıktan bağımsız): can/sn
  if (mods && mods.regen > 0 && state.hp < state.maxHp && !state.dead) {
    state.mregen += dt * mods.regen;
    while (state.mregen >= 1 && state.hp < state.maxHp) {
      state.mregen -= 1;
      heal(state, 1);
    }
  } else if (state.mregen > 0 && !(mods && mods.regen > 0)) {
    state.mregen = 0;
  }

  if (!state.dead) updateHunger(state, dt, c);
  return state.events;
}

/**
 * Fizik olaylarını (physics.stepPlayer → body.events) can/açlığa işler.
 * ctx: {mode, sprinting}. 'fall' → düşme hasarı; 'jump' → egzersiz; 'void' → boşluk (kolay modda 'rescue' olayı).
 * → true: oyuncunun başlangıca ışınlanması gerekiyor (boşluk/kurtarma).
 */
export function consumePhysicsEvents(state, events, ctx) {
  const c = ctx || {};
  let rescue = false;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'fall') {
      // Hafif Adım: düşme hasarı fallMul ile azalır (yuvarlanır; 0'a inerse hasar yok)
      const fm = c.mods && c.mods.fallMul < 1 ? Math.max(0, c.mods.fallMul) : 1;
      const dmg = fm < 1 ? Math.floor(e.damage * fm + 0.5) : e.damage;
      if (dmg > 0) applyDamage(state, dmg, { type: 'düşme', mode: c.mode });
    } else if (e.type === 'jump' || e.type === 'doubleJump') {
      if (!state.easy && c.mode !== 'insa') {
        state.exhaustion += c.sprinting ? EXHAUSTION.sprintJump : EXHAUSTION.jump;
      }
    } else if (e.type === 'void') {
      if (state.easy || c.mode === 'insa') {
        state.events.push({ type: 'rescue', cause: 'boşluk' });
        rescue = true;
      } else {
        applyDamage(state, 1000, { type: 'boşluk', ignoreArmor: true, ignoreInvuln: true });
        rescue = true;
      }
    }
  }
  return rescue;
}

/**
 * Ölüm verisi: envanterden düşecek eşyalar. inventory: Inventory (slots[], armor[]) ya da {slots,armor}.
 * Kolay modda eşyalar KALIR (keep=true). clear=true ise envanter boşaltılır.
 * → {keep, drops:[{item,count,dur?}], despawnSeconds, respawn:'yatak'|'başlangıç', cause}
 */
export function collectDeathDrops(state, inventory, opts) {
  const o = opts || {};
  const out = {
    keep: !!state.easy || !!o.keepInventory,
    drops: [],
    despawnSeconds: SURVIVAL.deathDropSeconds,
    respawn: o.hasBed ? 'yatak' : 'başlangıç',
    cause: state.deathCause,
  };
  if (out.keep || !inventory) return out;
  const push = (s) => {
    if (!s || !s.item || !(s.count > 0)) return;
    const d = { item: s.item, count: s.count };
    if (s.dur !== undefined) d.dur = s.dur;
    if (s.ench) d.ench = Object.assign({}, s.ench);
    if (s.charge !== undefined) d.charge = s.charge;
    out.drops.push(d);
  };
  const slots = inventory.slots || [];
  for (let i = 0; i < slots.length; i++) push(slots[i]);
  const armor = inventory.armor || [];
  for (let i = 0; i < armor.length; i++) push(armor[i]);
  if (o.clear) {
    if (typeof inventory.clear === 'function') inventory.clear();
    else {
      if (inventory.slots) inventory.slots.fill(null);
      if (inventory.armor) inventory.armor.fill(null);
    }
  }
  return out;
}

/** Yeniden doğuş: can/açlık dolar (kolay olmayan modda yarım açlık), dokunulmazlık kısa süre. */
export function respawn(state) {
  state.hp = state.maxHp;
  state.hunger = state.easy ? state.maxHunger : Math.max(14, state.hunger);
  state.saturation = 5;
  state.exhaustion = 0;
  state.oxygen = state.maxOxygen;
  state.invuln = 2;
  state.lastDamage = Infinity; // doğuş korumasında hiçbir vuruş geçmez

  state.regenTimer = 0;
  state.starveTimer = 0;
  state.drownTimer = 0;
  state.contactTimer = SURVIVAL.contactEvery;
  state.hurtFlash = 0;
  state.mregen = 0;
  state.dead = false;
  state.deathCause = null;
  state.events.length = 0;
  return state;
}

/** Kayıt (player.hp/hunger…) için küçük düz nesne. */
export function serializeSurvival(state) {
  return {
    hp: state.hp, hunger: state.hunger, saturation: state.saturation, exhaustion: state.exhaustion,
    oxygen: state.oxygen, maxHp: state.maxHp,
  };
}

/** Kaydı doğrulayarak yükler (asla atmaz). */
export function restoreSurvival(state, data) {
  const d = data && typeof data === 'object' ? data : {};
  const clamp = (v, lo, hi, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  state.maxHp = clamp(d.maxHp, 2, 60, state.maxHp);
  state.hp = clamp(d.hp, 0.5, state.maxHp, state.maxHp);
  state.hunger = clamp(d.hunger, 0, state.maxHunger, state.maxHunger);
  state.saturation = clamp(d.saturation, 0, state.hunger, 0);
  state.exhaustion = clamp(d.exhaustion, 0, 4, 0);
  state.oxygen = clamp(d.oxygen, 0, state.maxOxygen, state.maxOxygen);
  state.dead = false;
  state.deathCause = null;
  state.invuln = 0;
  return state;
}

/** HUD için özet: yarım kalp sayısı vb. */
export function hudView(state) {
  return {
    hp: state.hp, maxHp: state.maxHp, hunger: state.hunger, maxHunger: state.maxHunger,
    oxygen: state.oxygen, maxOxygen: state.maxOxygen,
    showOxygen: state.oxygen < state.maxOxygen - 0.05,
    lowHealth: state.hp <= state.maxHp * 0.3 && !state.dead,
    hurtFlash: state.hurtFlash, armor: state.armor,
  };
}
