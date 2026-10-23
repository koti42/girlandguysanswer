/*
 * KEŞİF sim — BÜYÜ: oyuncunun büyü durumu (MagicState). Saf, JSON-serileştirilebilir.
 *
 *   createMagicState(worldSeed) → {v, enchantSeed, enchantCount, rerolls, knownSpells[], mana, maxMana, manaBonus,
 *                                  effects[], cooldowns{}, castDelay}
 *   tickMagic(state, dt, mods?) → olaylar [] ({type:'effectEnded'})   mana yenilenir (son büyüden sonra 1 sn bekler),
 *                                  bekleme süreleri ve etkiler ilerler
 *   spendMana(state, n) → bool       addMana(state, n) → eklenen       learnSpell(state, key) → bool (yeni mi)
 *   consumeManaCrystal(state, inv?) → {ok, reason?, message?, max?, event?}   (inv verilirse 1 Mana Kristali tüketir)
 *   addPotionEffect / applyPotion (magicBrew.js) etkileri state.effects'e yazar
 *   serializeMagic(state) / restoreMagic(state, raw)   (asla atmaz; bilinmeyen anahtar/prototip kirleten girdi atılır)
 *   magicHud(state, heldItemKey?) → {mana:{value,max}, effects:[...], spell:{key,name,cooldown01,ready,manaCost}|null}
 */
import { hash32, toSeedInt } from './rng.js';
import { MANA, MAGIC_VERSION, ITEM_MANA_CRYSTAL, SPELL_LIST, spellDef, spellForStaff } from './magicData.js';
import { restoreEffects, serializeEffects, tickEffects, hudEffects } from './magicEffects.js';
import { IDENTITY_MODS } from './magicMods.js';

const EMPTY = Object.freeze([]);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function num(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return n < lo ? lo : n > hi ? hi : n;
}

export function maxManaOf(state) {
  return MANA.base + state.manaBonus;
}

export function createMagicState(worldSeed) {
  return {
    v: MAGIC_VERSION,
    enchantSeed: hash32(toSeedInt(worldSeed) ^ 0x4d414749),
    enchantCount: 0,
    rerolls: 0,
    knownSpells: [],
    mana: MANA.base,
    maxMana: MANA.base,
    manaBonus: 0,
    effects: [],
    cooldowns: {},
    castDelay: 0,
  };
}

export function learnSpell(state, key) {
  if (!spellDef(key) || state.knownSpells.indexOf(key) >= 0) return false;
  state.knownSpells.push(key);
  return true;
}

export function addMana(state, n) {
  if (!(n > 0)) return 0;
  const before = state.mana;
  state.mana = Math.min(state.maxMana, state.mana + n);
  return state.mana - before;
}

export function spendMana(state, n) {
  if (!(n >= 0) || state.mana + 1e-9 < n) return false;
  state.mana = Math.max(0, state.mana - n);
  return true;
}

/**
 * Bir adım. mods (magicMods) verilirse manaRegenMul uygulanır. Mana yenilenmesi `castDelay` bitene dek durur.
 * @returns etkilerin bitiş olayları (çoğu zaman paylaşılan boş dizi: değiştirme)
 */
export function tickMagic(state, dt, mods) {
  if (!(dt > 0)) return EMPTY;
  const m = mods || IDENTITY_MODS;
  state.maxMana = maxManaOf(state);
  if (state.castDelay > 0) {
    state.castDelay = Math.max(0, state.castDelay - dt);
  } else if (state.mana < state.maxMana) {
    state.mana = Math.min(state.maxMana, state.mana + MANA.regenPerSec * m.manaRegenMul * dt);
  }
  const cd = state.cooldowns;
  const ks = Object.keys(cd);
  for (let i = 0; i < ks.length; i++) {
    cd[ks[i]] -= dt;
    if (cd[ks[i]] <= 0) delete cd[ks[i]];
  }
  if (state.effects.length === 0) return EMPTY;
  const ended = tickEffects(state.effects, dt);
  return ended.length ? ended : EMPTY;
}

/** Mana Kristali: azami mana +10 (en çok +100). inv verilirse bir adet tüketir. */
export function consumeManaCrystal(state, inv) {
  if (state.manaBonus >= MANA.crystalMaxBonus) {
    return { ok: false, reason: 'azami', message: 'Azami mana zaten en yüksek seviyede.' };
  }
  if (inv && !inv.infinite) {
    if (inv.count(ITEM_MANA_CRYSTAL) < 1) return { ok: false, reason: 'yok', message: 'Mana Kristalin yok.' };
    inv.remove(ITEM_MANA_CRYSTAL, 1);
  }
  state.manaBonus = Math.min(MANA.crystalMaxBonus, state.manaBonus + MANA.crystalGain);
  state.maxMana = maxManaOf(state);
  state.mana = Math.min(state.maxMana, state.mana + MANA.crystalGain);
  return { ok: true, max: state.maxMana, event: { type: 'manaCrystalUsed', max: state.maxMana, bonus: state.manaBonus } };
}

/* ------------------------------------------------------------------------------------------------
 * Kayıt
 * ---------------------------------------------------------------------------------------------- */
export function serializeMagic(state) {
  const cd = {};
  SPELL_LIST.forEach((s) => {
    const t = state.cooldowns[s.key];
    if (t > 0) cd[s.key] = Math.round(t * 10) / 10;
  });
  return {
    v: MAGIC_VERSION,
    es: state.enchantSeed >>> 0,
    ec: state.enchantCount | 0,
    rr: state.rerolls | 0,
    spells: state.knownSpells.slice(),
    mana: Math.round(state.mana * 10) / 10,
    mb: state.manaBonus,
    fx: serializeEffects(state.effects),
    cd,
  };
}

/** Doğrulayarak yükler; state'in kendisini döner. raw yoksa/bozuksa durum olduğu gibi (varsayılan) kalır. */
export function restoreMagic(state, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
  if (hasOwn(raw, 'es') && Number.isFinite(Number(raw.es))) state.enchantSeed = toSeedInt(Number(raw.es));
  state.enchantCount = Math.floor(num(hasOwn(raw, 'ec') ? raw.ec : 0, 0, 1e9, 0));
  state.rerolls = Math.floor(num(hasOwn(raw, 'rr') ? raw.rr : 0, 0, 1e9, 0));
  const mb = Math.floor(num(hasOwn(raw, 'mb') ? raw.mb : 0, 0, MANA.crystalMaxBonus, 0));
  state.manaBonus = mb - (mb % MANA.crystalGain);
  state.maxMana = maxManaOf(state);
  state.mana = num(hasOwn(raw, 'mana') ? raw.mana : state.maxMana, 0, state.maxMana, state.maxMana);
  state.knownSpells = [];
  if (hasOwn(raw, 'spells') && Array.isArray(raw.spells)) {
    for (let i = 0; i < raw.spells.length && i < 16; i++) learnSpell(state, raw.spells[i]);
  }
  state.effects = restoreEffects(hasOwn(raw, 'fx') ? raw.fx : null);
  state.cooldowns = {};
  if (hasOwn(raw, 'cd') && raw.cd && typeof raw.cd === 'object') {
    SPELL_LIST.forEach((s) => {
      if (!hasOwn(raw.cd, s.key)) return;
      const t = num(raw.cd[s.key], 0, 60, 0);
      if (t > 0) state.cooldowns[s.key] = t;
    });
  }
  state.castDelay = 0;
  return state;
}

/* ------------------------------------------------------------------------------------------------
 * HUD
 * ---------------------------------------------------------------------------------------------- */
/** heldItemKey bir asaysa hud.spell dolar, değilse null. */
export function magicHud(state, heldItemKey) {
  const key = heldItemKey ? spellForStaff(heldItemKey) : null;
  let spell = null;
  if (key) {
    const def = spellDef(key);
    const left = state.cooldowns[key] || 0;
    spell = {
      key,
      name: def.name,
      manaCost: def.manaCost,
      cooldown01: def.cooldown > 0 ? Math.max(0, Math.min(1, left / def.cooldown)) : 0,
      ready: left <= 0 && state.mana >= def.manaCost,
    };
  }
  return {
    mana: { value: Math.floor(state.mana), max: state.maxMana },
    effects: hudEffects(state.effects),
    spell,
  };
}
