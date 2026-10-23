/*
 * KEŞİF sim — BÜYÜ: oyuncu "mods" nesnesi. Büyülü eldeki eşya + giyili zırh + durum etkileri tek sayı kümesine birleşir;
 * physics / survival / combat / blocks bu nesneyi (varsayılan = kimlik) tüketir.
 *
 *   createMods() → yeni kimlik nesnesi        IDENTITY_MODS (dondurulmuş)
 *   computeMods(inv, effects, out?) → mods     (out verilirse yeniden kullanılır: kare başı ayırma yok)
 *   mergeEffectMods(mods, partial)             etki katkısını birleştirir
 *
 * Alanlar (kimlik değerleri):
 *   speedMul 1 · jumpMul 1 · damageMul 1 · meleeBonus 0 · knockBonus 0 · burnLevel 0 · slowLevel 0 · luck 0 (0..1)
 *   digMul 1 · fortune 0 · silkTouch false · magnet false · fallMul 1 · fireMul 1 · oxygenMul 1 · waterBreathing false
 *   regen 0 (can/sn) · nightVision false · thorns 0 · bowPowerMul 1 · infiniteAmmo false · protection 0
 *   manaCostMul 1 · spellPowerMul 1 · manaRegenMul 1
 *   thrust 0 · thrustVy 0 · shield 0   (teknoloji: techMods.js)
 */
import { enchantClassOf } from './magicEnchant.js';
import { effectDef } from './magicData.js';
import { applyTechMods } from './techMods.js';

export const IDENTITY_MODS = Object.freeze({
  speedMul: 1, jumpMul: 1, damageMul: 1, meleeBonus: 0, knockBonus: 0, burnLevel: 0, slowLevel: 0, luck: 0,
  digMul: 1, fortune: 0, silkTouch: false, magnet: false, fallMul: 1, fireMul: 1, oxygenMul: 1, waterBreathing: false,
  regen: 0, nightVision: false, thorns: 0, bowPowerMul: 1, infiniteAmmo: false, protection: 0,
  manaCostMul: 1, spellPowerMul: 1, manaRegenMul: 1,
  // teknoloji (techMods.js): jetpack itişi (b/sn²) ve azami yükselme hızı, enerji kalkanı emilim oranı
  thrust: 0, thrustVy: 0, shield: 0,
});
const KEYS = Object.keys(IDENTITY_MODS);

export function createMods() {
  return Object.assign({}, IDENTITY_MODS);
}
export function resetMods(m) {
  for (let i = 0; i < KEYS.length; i++) m[KEYS[i]] = IDENTITY_MODS[KEYS[i]];
  return m;
}

const MAX_SPEED = 1.9;
const MAX_JUMP = 1.7;

/** Etki katkısı (magicData EFFECTS.mods çıktısı): çarpanlar çarpılır, regen toplanır, fireMul en küçüğü alır, bayraklar OR. */
export function mergeEffectMods(m, p) {
  if (p.speedMul) m.speedMul = Math.min(MAX_SPEED, m.speedMul * p.speedMul);
  if (p.jumpMul) m.jumpMul = Math.min(MAX_JUMP, m.jumpMul * p.jumpMul);
  if (p.damageMul) m.damageMul *= p.damageMul;
  if (p.regen) m.regen += p.regen;
  if (p.fireMul !== undefined) m.fireMul = Math.min(m.fireMul, p.fireMul);
  if (p.nightVision) m.nightVision = true;
  if (p.waterBreathing) m.waterBreathing = true;
  if (p.manaRegenMul) m.manaRegenMul *= p.manaRegenMul;
  return m;
}

function lv(e, k) {
  const v = e[k];
  return v > 0 ? v | 0 : 0;
}

function applyHeld(m, held) {
  if (!held || !held.ench) return;
  const cls = enchantClassOf(held.item);
  if (!cls) return;
  const e = held.ench;
  let L = lv(e, 'keskinlik');
  if (L) m.meleeBonus += 0.75 * L;
  L = lv(e, 'alev');
  if (L) m.burnLevel = L;
  L = lv(e, 'buz');
  if (L) m.slowLevel = L;
  L = lv(e, 'geri_tepme');
  if (L) m.knockBonus += 2.5 * L;
  L = lv(e, 'yagmaci');
  if (L) m.luck = Math.min(1, m.luck + 0.12 * L);
  L = lv(e, 'verimlilik');
  if (L) m.digMul *= 1 + 0.3 * L + 0.05 * L * L;
  if (lv(e, 'ipek_dokunus')) m.silkTouch = true;
  L = lv(e, 'servet');
  if (L) m.fortune = L;
  if (lv(e, 'miknatis')) m.magnet = true;
  L = lv(e, 'guc');
  if (L) m.bowPowerMul *= 1 + 0.2 * L;
  if (lv(e, 'sonsuzluk')) m.infiniteAmmo = true;
  L = lv(e, 'mana_verimi');
  if (L) m.manaCostMul *= Math.max(0.1, 1 - 0.15 * L);
  L = lv(e, 'buyu_gucu');
  if (L) m.spellPowerMul *= 1 + 0.2 * L;
}

function applyArmor(m, piece) {
  if (!piece || !piece.ench) return;
  const e = piece.ench;
  let L = lv(e, 'koruma');
  if (L) m.protection += 0.5 * L;
  if (lv(e, 'ates_direnci')) m.fireMul = Math.min(m.fireMul, 0.4);
  L = lv(e, 'hafif_adim');
  if (L) m.fallMul = Math.max(0.1, m.fallMul - 0.25 * L);
  L = lv(e, 'su_solugu');
  if (L) m.oxygenMul += L;
  L = lv(e, 'dikenler');
  if (L) m.thorns += L;
  L = lv(e, 'hiz');
  if (L) m.speedMul = Math.min(MAX_SPEED, m.speedMul * (1 + 0.06 * L));
  L = lv(e, 'yenilenme');
  if (L) m.regen += 0.1 * L;
}

/**
 * inv: Inventory (held(), armor[]) | null. effects: magicEffects listesi | null. out: yeniden kullanılacak nesne.
 */
export function computeMods(inv, effects, out) {
  const m = out ? resetMods(out) : createMods();
  if (inv) {
    applyHeld(m, typeof inv.held === 'function' ? inv.held() : null);
    const armor = inv.armor || [];
    for (let i = 0; i < armor.length; i++) applyArmor(m, armor[i]);
  }
  if (effects) {
    for (let i = 0; i < effects.length; i++) {
      const def = effectDef(effects[i].key);
      if (def) mergeEffectMods(m, def.mods(effects[i].level));
    }
  }
  applyTechMods(m, inv); // teknoloji: jetpack, elektrikli alet, enerji kalkanı
  return m;
}
