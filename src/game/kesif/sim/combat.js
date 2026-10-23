/*
 * KEŞİF sim — dövüş (saf; three/DOM yok): yakın dövüş, yay + ok, ışın tüfeği, kalkan, zırh, geri tepme, ganimet, XP/puan,
 * hasar sayıları (veri), zorluk ölçeği. Dost ateşi YOK (oyuncu yalnızca yaratığa, yaratık yalnızca oyuncuya zarar verir).
 *
 * Kullanım (game.js):
 *   const cs = createCombatState();                       // oyuncu başına bir tane
 *   updateCombat(cs, dt);                                 // her kare
 *   playerMelee(em, cs, player, look, heldKey, {inventory})   → sol tık / saldır
 *   startBowCharge(cs, heldKey); releaseBow(em, cs, player, look, heldKey, inventory)   → yay germe/bırakma
 *   fireRayGun(em, cs, player, look, heldKey, inventory)  → ışın tüfeği
 *   em olayı 'playerHit' → resolvePlayerHit(evt, {survival, inventory, mode}) (kalkan/zırh aşınması + can düşümü)
 * player: physics.createPlayerBody() gövdesi (+ isteğe bağlı blocking:bool, shieldReduce). look: birim bakış vektörü {x,y,z}.
 * Büyü (magicMods): playerMelee opts.mods, releaseBow 7. parametre `mods`, resolvePlayerHit ctx.{mods,em}; verilmezse kimlik.
 * magicDamage / tickMobStatuses (yanma) buradan da dışa aktarılır.
 */
import { applyDamage, setArmor } from './survival.js';
import { applyMobStatus, bowDamage, meleeDamage, thornsDamage } from './magicCombat.js';
import { itemByKey } from './items.js';
import { getMobType } from './mobTypes.js';
import { raycastBlocks, raycastEntities } from './raycast.js';
import { fireBeam, fireProjectile } from './entitiesProjectiles.js';

/* ------------------------------------------------------------------------------------------------
 * Zorluk
 * ---------------------------------------------------------------------------------------------- */
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ dmgMul: 0.5, hpMul: 0.8, aggroMul: 0.8, windupMul: 1.25 }),
  normal: Object.freeze({ dmgMul: 1, hpMul: 1, aggroMul: 1, windupMul: 1 }),
  hard: Object.freeze({ dmgMul: 1.35, hpMul: 1.2, aggroMul: 1.1, windupMul: 0.9 }),
});

export function difficultyOf(name) {
  return DIFFICULTIES[name] || DIFFICULTIES.normal;
}

/** Yaratık hasarını zorluğa göre ölçekler. */
export function scaleMobDamage(dmg, difficulty) {
  return dmg * difficultyOf(difficulty).dmgMul;
}

/** Boss yetenek eşyası (ganimete eklenir). */
export const ABILITY_ITEMS = Object.freeze({
  doubleJump: 'item:çift_zıplama_botları',
  grapple: 'item:kanca',
  glide: 'item:planör',
  portalGun: 'item:portal_tabancası',
});

/** Geri tepme yönü (from → to, yatay birim). */
export function knockbackDir(fromX, fromZ, toX, toZ, out) {
  let dx = toX - fromX;
  let dz = toZ - fromZ;
  const l = Math.sqrt(dx * dx + dz * dz);
  if (l < 1e-6) {
    dx = 0; dz = 1;
  } else {
    dx /= l; dz /= l;
  }
  out.x = dx;
  out.z = dz;
  return out;
}

export function xpFor(def) {
  return def ? def.xp : 0;
}
export function scoreFor(def) {
  return def ? Math.round(def.xp * 10 * (def.boss ? 5 : 1)) : 0;
}

/* ------------------------------------------------------------------------------------------------
 * Ganimet
 * ---------------------------------------------------------------------------------------------- */
/**
 * Tür ganimeti. rng: {next()} | () => [0,1). opts: {luck 0..1}. Aynı rng akışı → aynı ganimet (belirlenimci).
 * Şans < 1 olan satırlar luck ile artar (x + (1-x)·luck/2); luck>0 iken küçük ihtimalle +1 adet.
 * Boss: yetenek eşyası (ABILITY_ITEMS) her zaman eklenir; opts.abilityItem === false ise EKLENMEZ (oyunda yetenek eşyasını
 * ilerleme sistemi veriyor: ikisi birden çift eşya demek olurdu).
 */
export function rollLoot(typeKey, rng, opts) {
  const def = typeof typeKey === 'string' ? getMobType(typeKey) : typeKey;
  if (!def) return [];
  const nx = typeof rng === 'function' ? rng : () => rng.next();
  const luck = Math.max(0, Math.min(1, (opts && opts.luck) || 0));
  const out = [];
  const add = (item, count) => {
    for (let i = 0; i < out.length; i++) {
      if (out[i].item === item) {
        out[i].count += count;
        return;
      }
    }
    out.push({ item, count });
  };
  for (let i = 0; i < def.drops.length; i++) {
    const d = def.drops[i];
    let chance = d.chance;
    if (chance < 1 && luck > 0) chance += (1 - chance) * luck * 0.5;
    if (chance < 1 && nx() >= chance) continue;
    let count = d.min;
    if (d.max > d.min) count += Math.floor(nx() * (d.max - d.min + 1));
    if (luck > 0 && nx() < luck * 0.25) count += 1;
    if (count > 0 && itemByKey(d.item)) add(d.item, count);
  }
  if (def.boss && def.ability && ABILITY_ITEMS[def.ability] && !(opts && opts.abilityItem === false)) add(ABILITY_ITEMS[def.ability], 1);
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Hasar sayıları (yüzen metin verisi)
 * ---------------------------------------------------------------------------------------------- */
const MAX_NUMBERS = 48;

export class DamageNumbers {
  constructor() {
    this.list = [];
  }

  /** kind: 'hit' | 'crit' | 'block' | 'player' | 'heal' */
  add(x, y, z, amount, kind) {
    let n;
    if (this.list.length >= MAX_NUMBERS) {
      n = this.list.shift();
    } else {
      n = {};
    }
    n.x = x; n.y = y; n.z = z;
    n.amount = Math.round(amount * 10) / 10;
    n.kind = kind || 'hit';
    n.t = 0;
    n.life = n.kind === 'crit' ? 1.1 : 0.8;
    n.vy = n.kind === 'crit' ? 2.2 : 1.6;
    n.vx = ((this.list.length * 37) % 7 - 3) * 0.12;
    n.text = n.kind === 'block' ? 'Engellendi' : String(n.amount % 1 === 0 ? n.amount : n.amount.toFixed(1));
    this.list.push(n);
    return n;
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const n = l[i];
      n.t += dt;
      n.y += n.vy * dt;
      n.x += n.vx * dt;
      n.vy *= Math.max(0, 1 - 2.2 * dt);
      if (n.t >= n.life) l.splice(i, 1);
    }
  }

  clear() {
    this.list.length = 0;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Silah bilgisi
 * ---------------------------------------------------------------------------------------------- */
const FIST = Object.freeze({ damage: 1, reach: 3, cooldown: 0.5, ranged: false, ammo: null, hitscan: false, blockDamage: false, kind: 'yumruk' });
const _stats = { damage: 1, reach: 3, cooldown: 0.5, ranged: false, ammo: null, hitscan: false, blockDamage: false, kind: 'yumruk' };

/** Eldeki eşyanın dövüş bilgisi (paylaşılan nesne; hemen oku). Eşyasız/silahsız → yumruk. */
export function weaponStats(heldKey) {
  const it = heldKey ? itemByKey(heldKey) : null;
  const w = it && it.weapon;
  if (!w) {
    Object.assign(_stats, FIST);
    return _stats;
  }
  _stats.damage = w.damage;
  _stats.reach = w.reach;
  _stats.cooldown = w.cooldown;
  _stats.ranged = !!w.ranged;
  _stats.ammo = w.ammo || null;
  _stats.hitscan = !!w.hitscan;
  _stats.blockDamage = !!w.blockDamage;
  _stats.kind = w.hitscan ? 'ışın' : w.ranged ? 'yay' : 'yakın';
  return _stats;
}

/* ------------------------------------------------------------------------------------------------
 * Oyuncu dövüş durumu
 * ---------------------------------------------------------------------------------------------- */
export const BOW_FULL_CHARGE = 0.9;
export const CELL_SHOTS = 6;

export function createCombatState() {
  return { atkCd: 0, charging: false, charge: 0, chargeItem: null, cells: 0 };
}

export function updateCombat(state, dt) {
  if (state.atkCd > 0) state.atkCd = Math.max(0, state.atkCd - dt);
  if (state.charging) state.charge = Math.min(1, state.charge + dt / BOW_FULL_CHARGE);
}

const _eye = { x: 0, y: 0, z: 0 };
const _cand = [];
const _eopts = { filter: null, pad: 0.1, out: undefined };

function targetable(e) {
  return !e.dead && !e.hidden && !e.removed;
}

function eyeOf(player) {
  _eye.x = player.x;
  _eye.y = player.y + (player.eyeH || 1.62);
  _eye.z = player.z;
  return _eye;
}

function isFalling(p) {
  return !p.onGround && p.vy < -0.5 && !p.inLiquid && !p.climbing && !p.flying && !p.gliding;
}

/**
 * Yakın dövüş. opts: {inventory (dayanıklılık düşümü), aimAssist (hedef şişirme, dokunmatik)}.
 * → {ok, reason?, swing, hit:'entity'|null, entity, damage, crit, killed, broke, cooldown}
 * Hedef yoksa da savurma sayılır (bekleme süresi başlar). Düşerken vuruş = kritik (×1,5).
 */
export function playerMelee(em, state, player, look, heldKey, opts) {
  const w = weaponStats(heldKey);
  if (w.ranged) return { ok: false, reason: 'menzilli' };
  if (state.atkCd > 0) return { ok: false, reason: 'bekleme' };
  const o = opts || {};
  const reach = w.reach;
  const eye = eyeOf(player);
  state.atkCd = w.cooldown;
  const res = {
    ok: true, swing: true, hit: null, entity: null, damage: 0, crit: false, killed: false, broke: false, cooldown: w.cooldown,
  };
  _cand.length = 0;
  em.hash.query(eye.x, eye.z, reach + 3, _cand, targetable);
  if (_cand.length === 0) return res;
  _eopts.pad = 0.12 + (o.aimAssist || 0);
  _eopts.out = undefined;
  const eh = raycastEntities(_cand, eye, look, reach, _eopts);
  _cand.length = 0;
  if (!eh) return res;
  const bh = raycastBlocks(em.world, eye, look, reach, null);
  if (bh && bh.t < eh.t) return res; // duvarın arkası
  const crit = isFalling(player);
  const mods = o.mods || null;
  const dmg = mods ? meleeDamage(w.damage, mods, crit) : w.damage * (crit ? 1.5 : 1);
  const r = em.damage(eh.entity.id, dmg, {
    kind: 'melee',
    x: player.x,
    z: player.z,
    strength: 5.5 + (player.sprinting ? 2.5 : 0) + (mods ? mods.knockBonus : 0),
    crit,
    weapon: heldKey || null,
    luck: mods && mods.luck > 0 ? mods.luck : undefined,
  });
  res.hit = 'entity';
  res.entity = eh.entity;
  if (r) {
    res.damage = r.dealt;
    res.killed = r.killed;
    if (mods && !r.blocked && !r.killed) applyMobStatus(em, eh.entity, mods.burnLevel, mods.slowLevel);
  }
  res.crit = crit;
  if (o.inventory && heldKey && itemByKey(heldKey) && itemByKey(heldKey).durability) {
    res.broke = !!o.inventory.damageHeld(1);
  }
  return res;
}

/** Yay germeye başla (menzilli, ışın olmayan silah). */
export function startBowCharge(state, heldKey) {
  const w = weaponStats(heldKey);
  if (!w.ranged || w.hitscan) return false;
  if (state.atkCd > 0) return false;
  state.charging = true;
  state.charge = 0;
  state.chargeItem = heldKey;
  return true;
}

export function cancelBowCharge(state) {
  state.charging = false;
  state.charge = 0;
  state.chargeItem = null;
}

/**
 * Oku bırak. inventory verilirse cephane (w.ammo) tüketilir; yoksa tüketilmez.
 * → {fired, reason?, charge, speed, damage, crit, broke}
 */
export function releaseBow(em, state, player, look, heldKey, inventory, mods) {
  if (!state.charging) return { fired: false, reason: 'germe yok', charge: 0 };
  const charge = state.charge;
  const item = state.chargeItem || heldKey;
  cancelBowCharge(state);
  const w = weaponStats(item);
  if (charge < 0.12) return { fired: false, reason: 'zayıf', charge };
  // Sonsuzluk: ok tüketmez ve çantada ok gerekmez
  if (inventory && w.ammo && !(mods && mods.infiniteAmmo)) {
    if (inventory.count(w.ammo) < 1) return { fired: false, reason: 'cephane yok', charge };
    inventory.remove(w.ammo, 1);
  }
  const speed = 14 + 26 * charge;
  const baseDamage = w.damage * (0.35 + 0.65 * charge);
  const damage = mods ? bowDamage(baseDamage, mods) : baseDamage;
  const crit = charge >= 0.98;
  const eye = eyeOf(player);
  fireProjectile(em, 'ok', eye.x + look.x * 0.5, eye.y - 0.1 + look.y * 0.5, eye.z + look.z * 0.5, look.x, look.y, look.z, speed, 'player', {
    damage, crit, knock: 3 + charge * 3, weapon: item,
    status: mods && (mods.burnLevel > 0 || mods.slowLevel > 0) ? { burn: mods.burnLevel, slow: mods.slowLevel } : null,
  });
  state.atkCd = w.cooldown * 0.5;
  let broke = false;
  if (inventory && itemByKey(item) && itemByKey(item).durability) broke = !!inventory.damageHeld(1);
  em.emit({ type: 'fx', name: 'bowShot', x: eye.x, y: eye.y, z: eye.z, charge });
  return { fired: true, charge, speed, damage, crit, broke };
}

/**
 * Işın tüfeği (hitscan). Her CELL_SHOTS atış 1 enerji hücresi harcar. Blok kırma YAVAŞ (bkz. entitiesProjectiles).
 * → {fired, reason?, result (fireBeam sonucu), broke}
 */
export function fireRayGun(em, state, player, look, heldKey, inventory) {
  const w = weaponStats(heldKey);
  if (!w.hitscan) return { fired: false, reason: 'ışın silahı değil' };
  if (state.atkCd > 0) return { fired: false, reason: 'bekleme' };
  if (state.cells <= 0) {
    if (inventory && w.ammo) {
      if (inventory.count(w.ammo) < 1) return { fired: false, reason: 'cephane yok' };
      inventory.remove(w.ammo, 1);
    }
    state.cells = CELL_SHOTS;
  }
  state.cells--;
  state.atkCd = w.cooldown;
  const eye = eyeOf(player);
  const result = fireBeam(em, eye.x, eye.y - 0.1, eye.z, look.x, look.y, look.z, {
    range: w.reach, damage: w.damage, team: 'player', blockDamage: w.blockDamage, blockPower: w.cooldown, knock: 3, weapon: heldKey,
  });
  let broke = false;
  if (inventory && itemByKey(heldKey) && itemByKey(heldKey).durability) broke = !!inventory.damageHeld(1);
  return { fired: true, result, broke };
}

/* ------------------------------------------------------------------------------------------------
 * Kalkan / zırh / oyuncu vuruşu
 * ---------------------------------------------------------------------------------------------- */
/** Kalkan azaltması: oyuncu kalkan kaldırmış (player.blocking) ve kaynak önündeyse hasar azalır. */
export function shieldReduce(player, damage, fromX, fromZ) {
  if (!player || !player.blocking) return { damage, blocked: false, wear: 0 };
  const fx = -Math.sin(player.yaw || 0);
  const fz = -Math.cos(player.yaw || 0);
  let dx = fromX - player.x;
  let dz = fromZ - player.z;
  const l = Math.sqrt(dx * dx + dz * dz);
  if (l < 1e-6) return { damage, blocked: false, wear: 0 };
  dx /= l;
  dz /= l;
  if (fx * dx + fz * dz < 0.1) return { damage, blocked: false, wear: 0 };
  const reduce = player.shieldReduce === undefined ? 0.6 : player.shieldReduce;
  return { damage: damage * (1 - reduce), blocked: true, wear: Math.max(1, Math.ceil(damage / 3)) };
}

/** Giyili zırh puanını can durumuna işler (envanter değişince çağır). */
export function syncArmor(survival, inventory) {
  setArmor(survival, inventory ? inventory.armorDefense() : 0);
}

/**
 * em 'playerHit' olayını can/envantere uygular: zırh puanı survival.applyDamage içinde düşülür; kalkan ve zırh aşınır.
 * → {applied, knock:{x,z,strength}|null, effect}
 */
export function resolvePlayerHit(evt, ctx) {
  const c = ctx || {};
  let applied = 0;
  if (c.survival && evt.damage > 0) {
    applied = applyDamage(c.survival, evt.damage, { type: evt.cause || 'yaratık', mode: c.mode });
  }
  if (c.inventory && applied > 0 && typeof c.inventory.damageArmor === 'function') c.inventory.damageArmor(1);
  // Dikenler: vuran yaratığa hasar yansıt
  if (c.mods && c.em && applied > 0 && evt.source > 0 && (evt.cause === undefined || evt.cause === 'yaratık')) {
    const td = thornsDamage(c.mods);
    if (td > 0) c.em.damage(evt.source, td, { kind: 'thorns' });
  }
  if (c.inventory && evt.shieldWear > 0 && typeof c.inventory.damageHeld === 'function') c.inventory.damageHeld(evt.shieldWear);
  const knock = evt.kStrength > 0 ? { x: evt.kx, z: evt.kz, strength: evt.kStrength } : null;
  return { applied, knock, effect: evt.effect || null };
}

export { magicDamage, tickMobStatuses } from './magicCombat.js';
