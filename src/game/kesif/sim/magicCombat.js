/*
 * KEŞİF sim — BÜYÜ: dövüş yardımcıları (saf). combat.js / entitiesProjectiles.js bunları çağırır.
 *
 *   meleeDamage(base, mods, crit) · bowDamage(base, mods) · thornsDamage(mods)
 *   applyMobStatus(em, ent, burnLevel, slowLevel)   yaratığa yanma (DOT) / yavaşlama uygular
 *   tickMobStatuses(em, dt)                          oyun döngüsü her adım çağırır (yanma hasarı 1 sn'de bir)
 *   magicDamage(em, entityId, amount, src?)          büyü hasarı (kind:'magic'); yaratıkta zırh yok
 *   spellImpact(def, mods) → {damage, radius, burnLevel, slowLevel}
 * Yanma: Alev I–II = (3+2L) sn, L hasar/sn. Yavaşlama: (2+1,5L) sn (mobAIMove `ent.slowT` = x0,55 hız).
 */
export const BURN_TICK = 1;

export function burnSeconds(level) {
  return 3 + 2 * level;
}
export function burnDps(level) {
  return level;
}
export function slowSeconds(level) {
  return 2 + 1.5 * level;
}

/** Yakın dövüş hasarı: (silah + Keskinlik) × Güç etkisi × kritik. */
export function meleeDamage(base, mods, crit) {
  return (base + mods.meleeBonus) * mods.damageMul * (crit ? 1.5 : 1);
}
/** Yay hasarı (çekme oranı dışarıda uygulanır): taban × Güç büyülemesi × Güç etkisi. */
export function bowDamage(base, mods) {
  return base * mods.bowPowerMul * mods.damageMul;
}
/** Dikenler: vuran yaratığa yansıyan hasar (0 = yok). */
export function thornsDamage(mods) {
  return mods.thorns > 0 ? 1 + mods.thorns : 0;
}

/** Yaratığa durum uygular. Ölü/yok varlıkta sessizce çıkar. Kalıcı (ölünce silinir), kayda yazılmaz. */
export function applyMobStatus(em, ent, burnLevel, slowLevel) {
  if (!ent || ent.dead || ent.removed) return false;
  let did = false;
  if (burnLevel > 0) {
    const L = Math.min(5, burnLevel | 0);
    ent.magicBurnT = Math.max(ent.magicBurnT || 0, burnSeconds(L));
    ent.magicBurnDps = Math.max(ent.magicBurnDps || 0, burnDps(L));
    ent.magicBurnAcc = ent.magicBurnAcc || 0;
    if (!em.magicBurning) em.magicBurning = new Set();
    em.magicBurning.add(ent.id);
    did = true;
  }
  if (slowLevel > 0) {
    const L = Math.min(5, slowLevel | 0);
    ent.slowT = Math.max(ent.slowT || 0, slowSeconds(L));
    did = true;
  }
  return did;
}

/** Yanan yaratıklara hasar verir. Büyük kalabalıkta bile yalnız yananları dolaşır. */
export function tickMobStatuses(em, dt) {
  const set = em.magicBurning;
  if (!set || set.size === 0 || !(dt > 0)) return 0;
  let dealt = 0;
  const ids = Array.from(set);
  for (let i = 0; i < ids.length; i++) {
    const ent = em.mobs.get(ids[i]);
    if (!ent || ent.dead || ent.removed || !(ent.magicBurnT > 0)) {
      if (ent) {
        ent.magicBurnT = 0;
        ent.magicBurnDps = 0;
        ent.magicBurnAcc = 0;
      }
      set.delete(ids[i]);
      continue;
    }
    ent.magicBurnT -= dt;
    ent.magicBurnAcc += dt;
    while (ent.magicBurnAcc >= BURN_TICK && !ent.dead) {
      ent.magicBurnAcc -= BURN_TICK;
      const r = em.damage(ent.id, ent.magicBurnDps, { kind: 'burn' });
      if (r) dealt += r.dealt;
    }
    if (ent.magicBurnT <= 0 || ent.dead) {
      ent.magicBurnT = 0;
      ent.magicBurnDps = 0;
      ent.magicBurnAcc = 0;
      set.delete(ids[i]);
    }
  }
  return dealt;
}

/** Büyü hasarı. src: {x,z,strength,crit,luck}. */
export function magicDamage(em, entityId, amount, src) {
  const s = Object.assign({ kind: 'magic' }, src || {});
  s.kind = 'magic';
  return em.damage(entityId, amount, s);
}

/** Büyünün etki verileri (Büyü Gücü ile ölçeklenmiş). */
export function spellImpact(def, mods) {
  const m = mods || { spellPowerMul: 1 };
  return {
    damage: (def.damage || 0) * m.spellPowerMul,
    radius: def.radius || 0,
    burnLevel: def.burn || 0,
    slowLevel: def.slow || 0,
  };
}
