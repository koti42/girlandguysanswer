/*
 * KEŞİF sim — BÜYÜ sistemi giriş noktası: tüm magic* modüllerini toplar + oyun katmanının doğrudan kullanacağı üst düzey yardımcılar.
 * Ayrıntılı API belgesi: KESIF_MAGIC.md (scratchpad).
 *
 *   createMagic(worldSeed) → {state: MagicState, brew: BrewManager}
 *   serializeMagicAll(m) / restoreMagicAll(m, raw)          kayıt (player.magic = {state, brew})
 *   enchantInfo(state, inv, target, shelfCount) → api.getEnchantInfo() yükü
 *   brewInfo(brew, pos, inv) → api.getBrewInfo() yükü
 */
import { createMagicState, restoreMagic, serializeMagic } from './magicState.js';
import { BrewManager, potionOf } from './magicBrew.js';
import { ITEM_BOTTLE, ITEM_DUST, ITEM_SHARD, REROLL_DUST } from './magicData.js';
import { itemByKey } from './items.js';
import { BREW_MAX_BOTTLES } from './magicRecipes.js';
import {
  enchantClassOf, isEnchantable, magicDescribe, magicOffers, sanitizeEnch, shelfTier, cloneEnch,
} from './magicEnchant.js';

export * from './magicData.js';
export * from './magicRecipes.js';
export * from './magicEnchant.js';
export * from './magicEffects.js';
export * from './magicMods.js';
export * from './magicState.js';
export * from './magicSpells.js';
export * from './magicBrew.js';
export * from './magicCombat.js';

/**
 * Eşyanın "kullan" (sağ tık) türü: 'iksir' | 'asa' | 'mana_kristali' | null. Oyun katmanı useSlot/use yönlendirmesi içindir:
 *   iksir → drinkPotion(state, inv, addr, {survival}) · asa → castHeldSpell(state, inv, ctx) · mana_kristali → consumeManaCrystal(state, inv)
 */
export function magicUseKind(itemKey) {
  const it = itemByKey(itemKey);
  if (!it) return null;
  if (it.magic && it.magic.staff) return 'asa';
  if (it.magic && it.magic.manaCrystal) return 'mana_kristali';
  return potionOf(itemKey) ? 'iksir' : null;
}

export function createMagic(worldSeed) {
  return { state: createMagicState(worldSeed), brew: new BrewManager() };
}

export function serializeMagicAll(m) {
  return { state: serializeMagic(m.state), brew: m.brew.serialize() };
}

export function restoreMagicAll(m, raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  restoreMagic(m.state, Object.prototype.hasOwnProperty.call(r, 'state') ? r.state : null);
  m.brew.restore(Object.prototype.hasOwnProperty.call(r, 'brew') ? r.brew : null);
  return m;
}

/**
 * Büyü Masası paneli verisi. target: büyülenecek yuva adresi (yoksa seçili/eldeki yuva).
 * → {ok, reason?, slot:{item,name,ench}|null, enchantable, shelfCount, tier, offers[], dust, shards, rerollCost, canReroll}
 */
export function enchantInfo(state, inv, target, shelfCount) {
  const addr = target === undefined || target === null ? inv.selected : target;
  const slot = typeof inv.slotByAddr === 'function' ? inv.slotByAddr(addr) : inv.slots[addr];
  const dust = inv.count(ITEM_DUST);
  const shards = inv.count(ITEM_SHARD);
  const base = {
    shelfCount: Math.max(0, Math.floor(Number(shelfCount)) || 0),
    tier: shelfTier(shelfCount),
    dust,
    shards,
    rerollCost: REROLL_DUST,
    canReroll: inv.infinite || dust >= REROLL_DUST,
  };
  if (!slot) {
    return Object.assign({ ok: false, reason: 'esya_yok', slot: null, enchantable: false, offers: [] }, base);
  }
  const it = itemByKey(slot.item);
  const enchantable = isEnchantable(slot.item);
  const offers = enchantable ? magicOffers(state.enchantSeed, slot.item, shelfCount, slot.ench) : [];
  return Object.assign({
    ok: enchantable,
    reason: enchantable ? undefined : 'uygun_degil',
    slot: { item: slot.item, name: it ? it.name : slot.item, ench: cloneEnch(sanitizeEnch(slot.ench, slot.item) || undefined), cls: enchantClassOf(slot.item) },
    lines: magicDescribe(slot),
    enchantable,
    offers: offers.map((o) => Object.assign({}, o, { affordable: inv.infinite || (dust >= o.costDust && shards >= o.costShard) })),
  }, base);
}

/** Kazan paneli verisi. pos: kazan konumu. */
export function brewInfo(brew, pos, inv) {
  return {
    cauldron: brew.get(pos),
    recipes: brew.recipes(inv),
    bottles: inv.count(ITEM_BOTTLE),
    maxBottles: BREW_MAX_BOTTLES,
  };
}
