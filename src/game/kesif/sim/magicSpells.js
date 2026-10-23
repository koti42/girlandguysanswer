/*
 * KEŞİF sim — BÜYÜ: büyü yapma (asa + mana + bekleme). Saf; oyun katmanı yalnızca dönen `effects`'i yürütür.
 *
 *   canCast(state, spellKey, ctx) → {ok, reason?, message?, cost, def}
 *   castSpell(state, spellKey, ctx) → {ok, reason?, message?, cost, effects[], event?, durability}
 *   castHeldSpell(state, inv, ctx) → castSpell sonucu + {broke, spell}   (eldeki asayı bulur, asayı aşındırır)
 *   resolveBlink(from, dir, maxDist, isFree) → {x,y,z,distance} | null
 *   spellList(state) → [{key,name,staff,manaCost,cooldown,desc,known,cooldownLeft}]   (api.getSpellList)
 *
 * ctx: {staff: {item, ench?}|itemKey, mods (magicMods), dead?, eye:{x,y,z}, look:{x,y,z}}
 * effects[] (oyun katmanı yürütür):
 *   {kind:'projectile', spell, projectile, x,y,z, dx,dy,dz, speed, gravity, life, damage, radius, burn, slow, color}
 *       → entitiesProjectiles.fireProjectile(em, projectile, x,y,z, dx,dy,dz, speed, 'player',
 *           {damage, gravity, life, aoe: radius>0 ? {r: radius} : null, status:{burn, slow}})
 *   {kind:'heal', amount, color}                → survival.heal(state, amount)
 *   {kind:'blink', distance, dx,dy,dz, color}   → resolveBlink(...) ile hedef bul, gövdeyi ışınla (fizik düşme sıfırla)
 *   {kind:'fx', name:'castSpell', spell, color} → parçacık/ses
 * Hata nedenleri: 'bilinmiyor' | 'ölü' | 'asa_yok' | 'bekleme' | 'mana'
 */
import { MANA, SPELL_LIST, spellDef, spellForStaff } from './magicData.js';
import { IDENTITY_MODS, computeMods } from './magicMods.js';
import { learnSpell, spendMana } from './magicState.js';

const MESSAGES = Object.freeze({
  bilinmiyor: 'Bu büyüyü bilmiyorsun.',
  ölü: 'Şu an büyü yapamazsın.',
  asa_yok: 'Bu büyü için doğru asa elinde olmalı.',
  bekleme: 'Büyü henüz hazır değil.',
  mana: 'Yeterli manan yok.',
});

function deny(reason, cost, def) {
  return { ok: false, reason, message: MESSAGES[reason], cost, def: def || null };
}

function staffKeyOf(ctx) {
  const s = ctx && ctx.staff;
  if (!s) return null;
  return typeof s === 'string' ? s : s.item;
}

export function spellCost(def, mods) {
  const m = mods || IDENTITY_MODS;
  return Math.max(1, Math.ceil(def.manaCost * m.manaCostMul - 1e-9));
}

export function canCast(state, spellKey, ctx) {
  const def = spellDef(spellKey);
  if (!def) return deny('bilinmiyor', 0, null);
  const c = ctx || {};
  const cost = spellCost(def, c.mods);
  if (c.dead) return deny('ölü', cost, def);
  if (spellForStaff(staffKeyOf(c)) !== def.key) return deny('asa_yok', cost, def);
  if ((state.cooldowns[def.key] || 0) > 0) return deny('bekleme', cost, def);
  if (state.mana + 1e-9 < cost) return deny('mana', cost, def);
  return { ok: true, cost, def };
}

function dirOf(look) {
  const x = look && Number.isFinite(look.x) ? look.x : 0;
  const y = look && Number.isFinite(look.y) ? look.y : 0;
  const z = look && Number.isFinite(look.z) ? look.z : -1;
  const l = Math.sqrt(x * x + y * y + z * z);
  return l > 1e-9 ? { x: x / l, y: y / l, z: z / l } : { x: 0, y: 0, z: -1 };
}

export function castSpell(state, spellKey, ctx) {
  const chk = canCast(state, spellKey, ctx);
  if (!chk.ok) return { ok: false, reason: chk.reason, message: chk.message, cost: chk.cost, effects: [], durability: 0 };
  const def = chk.def;
  const c = ctx || {};
  const mods = c.mods || IDENTITY_MODS;
  const power = mods.spellPowerMul;
  const eye = c.eye || { x: 0, y: 0, z: 0 };
  const d = dirOf(c.look);
  const effects = [];
  if (def.kind === 'projectile') {
    effects.push({
      kind: 'projectile', spell: def.key, projectile: def.projectile,
      x: eye.x + d.x * 0.5, y: eye.y - 0.1 + d.y * 0.5, z: eye.z + d.z * 0.5,
      dx: d.x, dy: d.y, dz: d.z, speed: def.speed, gravity: def.gravity, life: def.life,
      damage: def.damage * power, radius: def.radius, burn: def.burn, slow: def.slow, color: def.color,
    });
  } else if (def.kind === 'heal') {
    effects.push({ kind: 'heal', amount: def.heal * power, color: def.color });
  } else if (def.kind === 'blink') {
    effects.push({ kind: 'blink', distance: def.distance, dx: d.x, dy: d.y, dz: d.z, color: def.color });
  }
  effects.push({ kind: 'fx', name: 'castSpell', spell: def.key, color: def.color });
  spendMana(state, chk.cost);
  state.cooldowns[def.key] = def.cooldown;
  state.castDelay = MANA.regenDelay;
  learnSpell(state, def.key);
  return {
    ok: true,
    cost: chk.cost,
    effects,
    durability: 1,
    event: { type: 'spellCast', spell: def.key, name: def.name, cost: chk.cost, mana: Math.floor(state.mana) },
  };
}

/** Eldeki yuvayı (inv.held()) kullanarak büyü yap; asa 1 aşınır (Dayanıklılık inv.damageHeld içinde). */
export function castHeldSpell(state, inv, ctx) {
  const held = inv && typeof inv.held === 'function' ? inv.held() : null;
  const key = held ? spellForStaff(held.item) : null;
  const c = Object.assign({}, ctx || {});
  c.staff = held;
  if (!c.mods) c.mods = computeMods(inv, state.effects);
  if (!key) {
    return {
      ok: false, reason: 'asa_yok', message: MESSAGES.asa_yok, cost: 0, effects: [], durability: 0, broke: false, spell: null,
    };
  }
  const res = castSpell(state, key, c);
  res.spell = key;
  res.broke = false;
  if (res.ok && typeof inv.damageHeld === 'function') res.broke = !!inv.damageHeld(res.durability);
  return res;
}

/**
 * Sıçrama hedefi: from + dir yönünde 0,5'lik adımlarla en uzak boş noktayı bulur. isFree(x,y,z) gövde (0,6×1,8) sığar mı denetler.
 * Hiç boş adım yoksa null. Duvar içine ışınlanmaz (ilk dolu adımda durur).
 */
export function resolveBlink(from, dir, maxDist, isFree) {
  const step = 0.5;
  const l = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (!(l > 1e-9) || !(maxDist > 0)) return null;
  const dx = dir.x / l;
  const dy = dir.y / l;
  const dz = dir.z / l;
  let best = null;
  for (let t = step; t <= maxDist + 1e-9; t += step) {
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const z = from.z + dz * t;
    if (!isFree(x, y, z)) break;
    best = { x, y, z, distance: t };
  }
  return best;
}

/**
 * 'projectile' etkisi → entitiesProjectiles.fireProjectile seçenekleri:
 *   fireProjectile(em, e.projectile, e.x, e.y, e.z, e.dx, e.dy, e.dz, e.speed, 'player', spellProjectileOpts(e))
 */
export function spellProjectileOpts(e) {
  return {
    damage: e.damage,
    gravity: e.gravity,
    life: e.life,
    knock: 4,
    aoe: e.radius > 0 ? { r: e.radius } : null,
    status: e.burn > 0 || e.slow > 0 ? { burn: e.burn, slow: e.slow } : null,
    kindSrc: 'magic',
    weapon: 'spell:' + e.spell,
  };
}

/** Büyü listesi (arayüz): bilinenler işaretli, bekleme süresi dahil. */
export function spellList(state) {
  return SPELL_LIST.map((s) => ({
    key: s.key,
    name: s.name,
    staff: s.staff,
    kind: s.kind,
    manaCost: s.manaCost,
    cooldown: s.cooldown,
    desc: s.desc,
    known: state.knownSpells.indexOf(s.key) >= 0,
    cooldownLeft: Math.max(0, state.cooldowns[s.key] || 0),
  }));
}
