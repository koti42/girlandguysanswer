/*
 * KEŞİF sim — EntityManager (saf; three/DOM yok, worker-güvenli, Math.random/Date.now yok).
 *
 * Yaratıklar (18 tür), boss'lar, yerdeki eşyalar, mermiler, tehlikeler (telegraflı hasar alanları), blok hasarı ve hasar
 * sayıları tek yöneticide. Kimlikler belirlenimci (sayaç), uzamsal karma sorguları, serialize/restore.
 *
 *   const em = new EntityManager({ seed, world, emit, difficulty:'normal'|'easy'|'hard' });
 *   em.update(dt, player, { dayFactor, peaceful, pickup(itemKey,count,dur)→kalan, luck });
 *   em.spawn('golge', x, y, z, opts) · em.spawnBoss('kokana', x, y, z, { arena:{x,z,r} }) · em.spawnItem(item,count,x,y,z)
 *   em.damage(id, dmg, {kind, x, z, strength, crit}) → {dealt, killed, blocked} | null
 *   em.serialize() / em.restore(data)
 *
 * Varlık (render bağlantısı, modeller doğrudan sürülebilir — bkz. toModelState):
 *   {id,type,x,y,z,yaw,vx,vy,vz,w,h,hp,maxHp,state,phase,attacking,hurt,dead,deadT,aim,fx:[...]}
 *   fx: etkin yer işaretleri (tehlikeler): {shape,stage,progress,x,y,z,r,...} — render/ses okur.
 * Oyuncu (player): physics.createPlayerBody() gövdesi (+ blocking, shieldReduce isteğe bağlı).
 *
 * Olaylar (emit): mobKilled, mobHurt, playerHit, playerEffect, bossEngage, bossPhase, bossFinale, bossReset, bossDefeated,
 *   itemPickup, blockBroken, fx{name,...}. emit verilmezse em.events dizisine yazılır (em.drainEvents()).
 */
import { seededRandom, hash32, hash3 } from './rng.js';
import { getMobType } from './mobTypes.js';
import { itemCeilY, zoneIndexAt } from './constants.js';
import {
  DamageNumbers, difficultyOf, knockbackDir, rollLoot, scoreFor, shieldReduce, xpFor,
} from './combat.js';
import { cellLiquid, effectiveLight } from './mobAIUtil.js';
import { raycastEntities } from './raycast.js';
import { stepMob } from './mobAIMove.js';
import { scarePassive } from './mobAIPassive.js';
import {
  bossDamageMul, bossHudOf, bossProvoked, initMobAI, postMobAI, resetBoss, updateMobAI,
} from './mobAI.js';
import { SpatialHash } from './entitiesHash.js';
import { createHazard, removeHazard, updateHazards } from './entitiesHazards.js';
import {
  fireBeam, fireProjectile, updateBlockDamage, updateProjectiles,
} from './entitiesProjectiles.js';
import {
  dropLoot, spawnItem, updateItems,
} from './entitiesItems.js';

export const SAVE_VERSION_ENTITIES = 1;
const MAX_MOBS = 320;
const MAX_HAZARDS = 72;
const NEAR_LOD = 40;
const FAR_LOD = 80;
const DEATH_TIME = 1.35;
const NO_SRC = Object.freeze({});
const _k = { x: 0, z: 0 };

function r2(v) {
  return Math.round(v * 100) / 100;
}

export class EntityManager {
  constructor(opts) {
    const o = opts || {};
    this.world = o.world;
    this.seed = (o.seed === undefined ? 0 : o.seed) | 0;
    this.rng = seededRandom(hash32(this.seed ^ 0x5eed1e55));
    this._emit = typeof o.emit === 'function' ? o.emit : null;
    this.events = [];
    this.maxMobs = o.maxMobs || MAX_MOBS;
    this.earlyMul = 1;
    this.setDifficulty(o.difficulty || 'normal');
    this.peaceful = !!o.peaceful;
    this.luck = o.luck || 0;
    this.abilityLoot = o.abilityLoot !== false; // false: boss ganimetine yetenek eşyası koyma (ilerleme sistemi veriyor)

    this.mobs = new Map();
    this.items = new Map();
    this.projectiles = [];
    this.hazards = [];
    this.blockDamage = new Map();
    this.populated = new Set();
    this.hash = new SpatialHash(8);
    this.numbers = new DamageNumbers();
    this.nextId = 1;
    this.time = 0;
    this.tick = 0;
    this.itemMergeT = 0.5;
    this.pathBudget = 2;
    this.player = null;
    this._list = [];
    this._tg = {
      active: false, dx: 0, dz: 0, dist: 99, dist2d: 99, px: 0, py: 0, pz: 0,
    };
    this._ctx = { dayFactor: 1, peaceful: false, pickup: null, luck: 0, arenas: null };
  }

  /* -------------------------------------------------------------------------------------------
   * Ayar / olay
   * ----------------------------------------------------------------------------------------- */
  setDifficulty(name) {
    const d = difficultyOf(name);
    this.difficulty = normDifficulty(name);
    this.dmgMul = d.dmgMul;
    this.hpMul = d.hpMul;
    this.aggroMul = d.aggroMul;
    this.windupMul = d.windupMul;
  }

  emit(evt) {
    if (this._emit) this._emit(evt);
    else this.events.push(evt);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  lightAt(x, y, z, dayFactor) {
    return effectiveLight(this.world, x, y, z, dayFactor);
  }

  /* -------------------------------------------------------------------------------------------
   * Yaratıklar
   * ----------------------------------------------------------------------------------------- */
  /**
   * Yaratık doğurur. opts: {id, hp, maxHp, hpScale, yaw, persistent, arena:{x,z,r}, owner, minion, clone, ghost, skin, aggro, rn, home}
   * Bilinmeyen tür / üst sınır → null.
   */
  spawn(type, x, y, z, opts) {
    const def = getMobType(type);
    if (!def) return null;
    const o = opts || {};
    if (!def.boss && this.mobs.size >= this.maxMobs) return null;
    let id = o.id;
    if (id === undefined) id = this.nextId++;
    else if (id >= this.nextId) this.nextId = id + 1;
    const maxHp = o.maxHp !== undefined
      ? o.maxHp
      : Math.max(1, Math.round(def.hp * this.hpMul * (o.hpScale === undefined ? 1 : o.hpScale)));
    const hp = o.hp === undefined ? maxHp : Math.min(o.hp, maxHp);
    const ent = {
      id,
      kind: 'mob',
      type: def.key,
      key: def.key,
      def,
      x, y, z,
      vx: 0, vy: 0, vz: 0,
      yaw: o.yaw !== undefined ? o.yaw : (hash32(id ^ this.seed) / 4294967296) * Math.PI * 2 - Math.PI,
      w: def.hitbox.w,
      h: def.hitbox.h,
      hp,
      maxHp: o.clone ? Math.min(maxHp, hp) : maxHp,
      state: 'idle',
      phase: 0,
      attacking: false,
      hurt: false,
      dead: false,
      deadT: 0,
      aim: null,
      aimObj: { yaw: 0, pitch: 0 },
      fx: [],
      target: false,
      age: 0,
      rn: o.rn || 0,
      onGround: false, inWater: false, inLava: false, headWater: false, impact: 0, hitX: false, hitZ: false,
      speedNow: 0, contactDmg: 0, kbT: 0, hold: 0, jumpCd: 0, slowT: 0, hurtT: 0, lavaT: 0, acc: 0, lodN: 0,
      weak: false, sm: 1, hidden: false, invuln: false, exposed: false, enraged: false, burrow: 0,
      persistent: !!o.persistent || def.boss,
      owner: o.owner || 0,
      minion: !!o.minion,
      clone: !!o.clone,
      isClone: !!o.clone,
      ghost: !!o.ghost,
      skin: o.skin || null,
      home: o.home ? { x: o.home.x, z: o.home.z } : { x, z },
      arena: o.arena ? { x: o.arena.x, z: o.arena.z, r: o.arena.r } : null,
      arenaAuto: def.boss && !o.arena, // yapı verisinden (ctx.arenas) eşleşirse onu benimser
      removed: false,
      mv: null,
      ai: null,
      cd: null,
    };
    this.mobs.set(id, ent);
    initMobAI(this, ent, def);
    // sıvıda doğduysa ilk karede yüzer (balık)
    if (this.world && cellLiquid(this.world, Math.floor(x), Math.floor(y + ent.h * 0.5), Math.floor(z))) {
      ent.inWater = true;
    }
    if (o.aggro && !def.boss) {
      ent.target = true;
      ent.ai.aggroT = 60;
    }
    return ent;
  }

  /** Boss doğurur: kalıcı; arena opts.arena {x,z,r} ya da ctx.arenas eşleşmesi, yoksa doğma noktası + tür arenaRadius. */
  spawnBoss(type, x, y, z, opts) {
    const def = getMobType(type);
    if (!def || !def.boss) return null;
    const o = Object.assign({ persistent: true }, opts || {});
    return this.spawn(def.key, x, y, z, o); // arena verilmezse doğma noktası + ctx.arenas eşleşmesi
  }

  /**
   * Işın doğrultusundaki en yakın canlı yaratık (HUD hedef adı, vuruş yardımı): {entity,t,point} | null.
   * Blok engeli denetlenmez (çağıran raycastBlocks ile karşılaştırır). pad: hedef şişirme.
   */
  pickMob(ox, oy, oz, dx, dy, dz, maxDist, pad) {
    const list = this.hash.query(ox, oz, maxDist + 4, [], (e) => !e.dead && !e.hidden);
    if (list.length === 0) return null;
    return raycastEntities(list, { x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, maxDist, { pad: pad || 0.1 });
  }

  get(id) {
    return this.mobs.get(id) || this.items.get(id) || null;
  }

  /** Yaratığı hemen kaldırır (ganimet/olay yok). */
  despawn(id) {
    const e = this.mobs.get(id);
    if (!e) {
      return this.items.delete(id);
    }
    e.removed = true;
    this.mobs.delete(id);
    this.clearHazards(e);
    return true;
  }

  /** Sessiz kaldırma + fx (klon sönmesi gibi). */
  dismiss(ent, fxName) {
    if (fxName) this.emit({ type: 'fx', name: fxName, id: ent.id, x: ent.x, y: ent.y + ent.h * 0.5, z: ent.z });
    this.despawn(ent.id);
  }

  /** Canlı yaratık sayıları (minyon/boss hariç): {hostile, passive, total}. */
  counts() {
    let hostile = 0;
    let passive = 0;
    this.mobs.forEach((e) => {
      if (e.dead || e.minion || e.def.boss) return;
      if (e.def.hostile) hostile++;
      else passive++;
    });
    return { hostile, passive, total: hostile + passive };
  }

  forEachMob(cb) {
    this.mobs.forEach(cb);
  }

  /** Daire içindeki canlı yaratıklar (yeni dizi). Karma bu karenin başında kurulur. */
  queryMobs(x, z, r, filter) {
    return this.hash.query(x, z, r, [], filter || ((e) => !e.dead));
  }

  minionCount(ownerId) {
    let n = 0;
    this.mobs.forEach((e) => {
      if (e.owner === ownerId && e.minion && !e.dead && !e.clone) n++;
    });
    return n;
  }

  cloneCount(ownerId) {
    let n = 0;
    this.mobs.forEach((e) => {
      if (e.owner === ownerId && e.clone && !e.dead) n++;
    });
    return n;
  }

  removeMinions(ownerId) {
    const dead = [];
    this.mobs.forEach((e) => {
      if (e.owner === ownerId && e.minion) dead.push(e);
    });
    for (let i = 0; i < dead.length; i++) this.dismiss(dead[i], dead[i].clone ? 'cloneBurst' : 'mobFade');
  }

  /** Etkin boss özeti (HUD boss çubuğu): {id,boss,name,hp,maxHp,phase,exposed,invuln} | null. */
  bossHud() {
    let found = null;
    this.mobs.forEach((e) => {
      if (found || !e.def.boss || e.dead || e.isClone || !e.ai.engaged) return;
      found = bossHudOf(e, e.def);
    });
    return found;
  }

  /* -------------------------------------------------------------------------------------------
   * Hasar
   * ----------------------------------------------------------------------------------------- */
  /**
   * src: {kind:'melee'|'projectile'|'beam'|'env'|..., x, z (geri tepme kaynağı), strength, crit, weapon, luck}
   * → {dealt, killed, blocked, crit} | null (yok/ölü).
   */
  damage(id, amount, src) {
    const ent = this.mobs.get(id);
    if (!ent || ent.dead || ent.removed || !(amount > 0)) return null;
    const def = ent.def;
    const s = src || NO_SRC;
    let mul = 1;
    if (def.boss) mul = bossDamageMul(this, ent, def, s);
    else if (ent.hidden || ent.invuln) mul = 0;
    if (mul <= 0) {
      this.numbers.add(ent.x, ent.y + ent.h + 0.2, ent.z, 0, 'block');
      this.emit({ type: 'fx', name: 'blocked', id: ent.id, x: ent.x, y: ent.y + ent.h * 0.6, z: ent.z });
      return { dealt: 0, killed: false, blocked: true, crit: false };
    }
    const dmg = amount * mul;
    const dealt = Math.min(ent.hp, dmg);
    ent.hp -= dmg;
    ent.hurt = true;
    ent.hurtT = 0.2;
    this.numbers.add(ent.x, ent.y + ent.h + 0.2, ent.z, dmg, s.crit ? 'crit' : 'hit');
    if (s.x !== undefined && s.strength > 0 && !def.boss) {
      const k = s.strength * (1 - def.knockbackResist);
      if (k > 0) {
        knockbackDir(s.x, s.z, ent.x, ent.z, _k);
        ent.vx = _k.x * k;
        ent.vz = _k.z * k;
        ent.vy = Math.max(ent.vy, 3.5 * (1 - def.knockbackResist));
        ent.kbT = 0.25;
        ent.onGround = false;
      }
    }
    if (def.passive) {
      scarePassive(ent, s.x === undefined ? ent.x : s.x, s.z === undefined ? ent.z : s.z, 4);
    } else if (!def.boss) {
      ent.ai.aggroT = 10;
      ent.target = true;
    } else {
      bossProvoked(this, ent, def);
    }
    this.emit({
      type: 'mobHurt', id: ent.id, mob: ent.key, damage: dmg, hp: Math.max(0, ent.hp), maxHp: ent.maxHp, crit: !!s.crit,
      x: ent.x, y: ent.y + ent.h * 0.6, z: ent.z, source: s.kind || null,
    });
    if (ent.hp <= 0) {
      this._kill(ent, s);
      return { dealt, killed: true, blocked: false, crit: !!s.crit };
    }
    return { dealt, killed: false, blocked: false, crit: !!s.crit };
  }

  _kill(ent, src) {
    const def = ent.def;
    ent.hp = 0;
    ent.dead = true;
    ent.deadT = 0;
    ent.state = 'dead';
    ent.attacking = false;
    ent.target = false;
    ent.hidden = false;
    ent.invuln = false;
    ent.weak = false;
    ent.aim = null;
    ent.mv.spd = 0;
    ent.mv.dx = 0;
    ent.mv.dz = 0;
    this.clearHazards(ent);
    if (def.boss && !ent.isClone) this.removeMinions(ent.id);
    if (ent.minion) {
      this.emit({ type: 'mobKilled', id: ent.id, mob: ent.key, name: def.name, x: ent.x, y: ent.y, z: ent.z, minion: true, loot: [], xp: 0, score: 0 });
      this.emit({ type: 'fx', name: ent.clone ? 'cloneBurst' : 'mobDeath', id: ent.id, x: ent.x, y: ent.y + ent.h * 0.5, z: ent.z, mob: ent.key });
      return;
    }
    const rng = seededRandom(hash3(this.seed, ent.id, 0x10077));
    const luck = src.luck !== undefined ? src.luck : this.luck;
    const loot = rollLoot(def, rng, { luck, abilityItem: this.abilityLoot });
    dropLoot(this, loot, ent.x, ent.y + ent.h * 0.4, ent.z);
    const xp = xpFor(def);
    const score = scoreFor(def);
    const zone = def.boss ? def.zone : zoneIndexAt(ent.x, ent.z);
    this.emit({
      type: 'mobKilled', id: ent.id, mob: ent.key, name: def.name, x: ent.x, y: ent.y, z: ent.z, xp, score, loot,
      boss: !!def.boss, passive: def.passive, zone, by: src.kind || null,
    });
    this.emit({ type: 'fx', name: 'mobDeath', id: ent.id, x: ent.x, y: ent.y + ent.h * 0.5, z: ent.z, mob: ent.key });
    if (def.boss) {
      this.emit({
        type: 'bossDefeated', id: ent.id, boss: ent.key, name: def.name, zone: def.zone, loot, ability: def.ability, xp, score,
        x: ent.x, y: ent.y, z: ent.z,
      });
    }
  }

  /**
   * Oyuncuya hasar iste (kalkan + zorluk uygulanır, 'playerHit' olayı yayılır; can düşümü game.js'te:
   * combat.resolvePlayerHit). Dönüş: olaydaki hasar (0 = etkisiz).
   */
  hurtPlayer(src, dmg, info) {
    const p = this.player;
    if (!p || p.dead || !(dmg >= 0)) return 0;
    const inf = info || NO_SRC;
    const raw = dmg * this.dmgMul * this.earlyMul; // earlyMul: ilk gece adaleti (earlyGame.js), 1 = yok
    const fromX = inf.fromX !== undefined ? inf.fromX : src ? src.x : p.x;
    const fromZ = inf.fromZ !== undefined ? inf.fromZ : src ? src.z : p.z;
    const sh = shieldReduce(p, raw, fromX, fromZ);
    knockbackDir(fromX, fromZ, p.x, p.z, _k);
    const evt = {
      type: 'playerHit',
      damage: sh.damage,
      rawDamage: raw,
      cause: inf.cause || 'yaratık',
      source: src && src.id ? src.id : (inf.source || 0),
      sourceType: src && src.key ? src.key : null,
      kx: _k.x,
      kz: _k.z,
      kStrength: inf.kStrength === undefined ? 6 : inf.kStrength,
      effect: inf.effect || null,
      blocked: sh.blocked,
      shieldWear: sh.wear,
      x: p.x, y: p.y, z: p.z,
    };
    this.emit(evt);
    this.numbers.add(p.x, p.y + p.h + 0.3, p.z, sh.damage, sh.blocked ? 'block' : 'player');
    return sh.damage;
  }

  /* -------------------------------------------------------------------------------------------
   * Eşya / mermi / tehlike sarmalayıcıları
   * ----------------------------------------------------------------------------------------- */
  spawnItem(item, count, x, y, z, opts) {
    return spawnItem(this, item, count, x, y, z, opts);
  }

  dropLoot(list, x, y, z) {
    dropLoot(this, list, x, y, z);
  }

  fireProjectile(kind, x, y, z, dx, dy, dz, speed, owner, opts) {
    return fireProjectile(this, kind, x, y, z, dx, dy, dz, speed, owner, opts);
  }

  fireBeam(x, y, z, dx, dy, dz, opts) {
    return fireBeam(this, x, y, z, dx, dy, dz, opts);
  }

  addHazard(spec, owner) {
    if (this.hazards.length >= MAX_HAZARDS) {
      // en eski tek seferlik tehlikeyi at
      for (let i = 0; i < this.hazards.length; i++) {
        if (this.hazards[i].shape !== 'zone') {
          removeHazard(this, i);
          break;
        }
      }
    }
    const s = spec;
    if (s.y === undefined) s.y = owner ? owner.y : 0;
    const h = createHazard(this.nextId++, s, owner || null);
    this.hazards.push(h);
    if (owner) owner.fx.push(h);
    return h;
  }

  clearHazards(owner) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      if (this.hazards[i].owner === owner) removeHazard(this, i);
    }
  }

  clearHazardShape(owner, shape) {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.owner === owner && h.shape === shape) removeHazard(this, i);
    }
  }

  /* -------------------------------------------------------------------------------------------
   * Güncelleme
   * ----------------------------------------------------------------------------------------- */
  /**
   * ctx: {dayFactor 0..1 (varsayılan 1), peaceful (inşa modu: düşman saldırmaz), pickup(item,count,dur)→kalan, luck}
   */
  update(dt, player, ctx) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    const c = this._ctx;
    const src = ctx || NO_SRC;
    c.dayFactor = src.dayFactor === undefined ? 1 : src.dayFactor;
    c.peaceful = src.peaceful !== undefined ? !!src.peaceful : this.peaceful;
    c.pickup = src.pickup || null;
    c.luck = src.luck || 0;
    c.arenas = src.arenas || (src.arena ? [src.arena] : null);
    this.peaceful = c.peaceful;
    this.player = player || null;
    this.time += dt;
    this.tick++;
    this.pathBudget = 2;

    const list = this._list;
    list.length = 0;
    this.hash.clear();
    this.mobs.forEach((e) => {
      list.push(e);
      if (!e.dead) this.hash.insert(e);
    });
    for (let i = 0; i < list.length; i++) this._updateMob(list[i], dt, player, c);

    updateHazards(this, dt, player);
    updateProjectiles(this, dt);
    updateItems(this, dt, player, c);
    updateBlockDamage(this, dt);
    this.numbers.update(dt);
  }

  _updateMob(ent, dt, player, ctx) {
    if (ent.removed) return;
    const def = ent.def;
    if (ent.hurtT > 0) {
      ent.hurtT -= dt;
      if (ent.hurtT <= 0) ent.hurt = false;
    }
    if (ent.slowT > 0) ent.slowT -= dt;
    ent.age += dt;

    if (ent.dead) {
      ent.deadT += dt;
      ent.mv.spd = 0;
      stepMob(this.world, ent, def, dt);
      if (ent.deadT > DEATH_TIME) this.despawn(ent.id);
      return;
    }

    if (ent.arenaAuto && ctx.arenas) this._adoptArena(ent, ctx.arenas);

    // uzaklık LOD: uzaktakiler seyrek, çok uzaktakiler donuk
    let d2 = 0;
    if (player) {
      const dx = player.x - ent.x;
      const dz = player.z - ent.z;
      d2 = dx * dx + dz * dz;
    }
    if (!def.boss) {
      if (d2 > FAR_LOD * FAR_LOD) return;
      if (d2 > NEAR_LOD * NEAR_LOD) {
        ent.acc += dt;
        ent.lodN = (ent.lodN + 1) & 1;
        if (ent.lodN === 1) return;
        dt = ent.acc > 0.1 ? 0.1 : ent.acc;
        ent.acc = 0;
      }
    } else if (d2 > 140 * 140 && !ent.ai.engaged) {
      return;
    }

    // hedef bilgisi
    const tg = this._tg;
    tg.active = !!player && !player.dead && (!def.hostile || !ctx.peaceful);
    if (player) {
      tg.dx = player.x - ent.x;
      tg.dz = player.z - ent.z;
      tg.px = player.x;
      tg.py = player.y + player.h * 0.6;
      tg.pz = player.z;
      tg.dist2d = Math.sqrt(tg.dx * tg.dx + tg.dz * tg.dz);
      const dy = tg.py - (ent.y + ent.h * 0.5);
      tg.dist = Math.sqrt(tg.dx * tg.dx + tg.dz * tg.dz + dy * dy);
    } else {
      tg.dx = 0; tg.dz = 0; tg.px = ent.x; tg.py = ent.y; tg.pz = ent.z; tg.dist2d = 99; tg.dist = 99;
    }

    updateMobAI(this, ent, def, dt, ctx, tg);
    stepMob(this.world, ent, def, dt);
    postMobAI(this, ent, def);

    // çevre hasarı
    if (ent.inLava) {
      ent.lavaT += dt;
      if (ent.lavaT >= 0.5) {
        ent.lavaT = 0;
        this.damage(ent.id, 2, { kind: 'env' });
      }
    } else {
      ent.lavaT = 0;
    }
    if (ent.y < (this.world.killPlaneY === undefined ? -24 : this.world.killPlaneY)) {
      if (def.boss) {
        resetBoss(this, ent, def); // boss boşluğa düştüyse arenaya geri döner
      } else {
        this.despawn(ent.id);
      }
    }
    // inşa tavanı: uçan yaratıklar/boss tavanın üstüne çıkamaz
    const ceil = itemCeilY(this.world) - 4;
    if (ent.y > ceil) {
      ent.y = ceil;
      if (ent.vy > 0) ent.vy = 0;
    }
  }

  /** Boss, doğduğu noktayı kapsayan arenayı (yapı verisi) benimser: {x,z,r}. */
  _adoptArena(ent, arenas) {
    for (let i = 0; i < arenas.length; i++) {
      const a = arenas[i];
      const dx = ent.home.x - a.x;
      const dz = ent.home.z - a.z;
      if (dx * dx + dz * dz <= (a.r + 2) * (a.r + 2)) {
        ent.arena = { x: a.x, z: a.z, r: a.r };
        ent.arenaAuto = false;
        return;
      }
    }
  }

  /* -------------------------------------------------------------------------------------------
   * Kayıt
   * ----------------------------------------------------------------------------------------- */
  serialize() {
    const mobs = [];
    this.mobs.forEach((e) => {
      if (e.dead || e.minion || e.removed) return;
      const m = {
        id: e.id, type: e.key, x: r2(e.x), y: r2(e.y), z: r2(e.z), yaw: r2(e.yaw), hp: r2(e.hp), maxHp: e.maxHp, rn: e.rn,
        home: { x: r2(e.home.x), z: r2(e.home.z) },
      };
      if (e.persistent) m.persistent = true;
      if (e.arena) m.arena = { x: r2(e.arena.x), z: r2(e.arena.z), r: e.arena.r };
      if (e.skin) m.skin = e.skin;
      if (e.def.boss) m.phase = e.phase;
      mobs.push(m);
    });
    const items = [];
    this.items.forEach((e) => {
      const it = {
        id: e.id, item: e.item, count: e.count, x: r2(e.x), y: r2(e.y), z: r2(e.z), age: r2(e.age), life: e.life,
      };
      if (e.dur !== undefined) it.dur = e.dur;
      if (e.ench) it.ench = Object.assign({}, e.ench);
      if (e.charge !== undefined) it.charge = e.charge;
      items.push(it);
    });
    return {
      v: SAVE_VERSION_ENTITIES,
      nextId: this.nextId,
      time: r2(this.time),
      rng: this.rng.getState(),
      difficulty: this.difficulty,
      mobs,
      items,
      populated: Array.from(this.populated),
    };
  }

  /** Kaydı yükler (bozuk girdiye dayanıklı; atmaz). Eski yaratıklar/eşyalar/mermiler/tehlikeler temizlenir. */
  restore(data) {
    this.mobs.clear();
    this.items.clear();
    this.projectiles.length = 0;
    this.hazards.length = 0;
    this.blockDamage.clear();
    this.populated.clear();
    this.numbers.clear();
    const d = data && typeof data === 'object' ? data : {};
    if (Number.isFinite(d.time)) this.time = d.time;
    if (Number.isFinite(d.rng)) this.rng.setState(d.rng);
    if (typeof d.difficulty === 'string') this.setDifficulty(d.difficulty);
    let maxId = 0;
    const mobs = Array.isArray(d.mobs) ? d.mobs : [];
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z)) continue;
      const e = this.spawn(m.type, m.x, m.y, m.z, {
        id: Number.isInteger(m.id) ? m.id : undefined,
        hp: Number.isFinite(m.hp) ? m.hp : undefined,
        maxHp: Number.isFinite(m.maxHp) ? m.maxHp : undefined,
        yaw: Number.isFinite(m.yaw) ? m.yaw : undefined,
        persistent: !!m.persistent,
        arena: m.arena && Number.isFinite(m.arena.r) ? m.arena : null,
        home: m.home && Number.isFinite(m.home.x) ? m.home : null,
        skin: typeof m.skin === 'string' ? m.skin : null,
        rn: Number.isInteger(m.rn) ? m.rn : 0,
      });
      if (e && e.def.boss && Number.isInteger(m.phase)) e.phase = Math.max(0, Math.min(2, m.phase));
      if (e && e.id > maxId) maxId = e.id;
    }
    const items = Array.isArray(d.items) ? d.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y) || !Number.isFinite(it.z)) continue;
      const e = spawnItem(this, it.item, it.count, it.x, it.y, it.z, {
        id: Number.isInteger(it.id) ? it.id : undefined,
        age: Number.isFinite(it.age) ? it.age : 0,
        life: Number.isFinite(it.life) ? it.life : undefined,
        dur: Number.isFinite(it.dur) ? it.dur : undefined,
        ench: it.ench && typeof it.ench === 'object' ? it.ench : undefined,
        charge: Number.isFinite(it.charge) ? it.charge : undefined,
        vy: 0,
        delay: 0.5,
      });
      if (e && e.id > maxId) maxId = e.id;
    }
    if (Array.isArray(d.populated)) {
      for (let i = 0; i < d.populated.length; i++) if (typeof d.populated[i] === 'string') this.populated.add(d.populated[i]);
    }
    this.nextId = Math.max(Number.isInteger(d.nextId) ? d.nextId : 1, maxId + 1, 1);
    return this;
  }

  dispose() {
    this.mobs.clear();
    this.items.clear();
    this.projectiles.length = 0;
    this.hazards.length = 0;
    this.blockDamage.clear();
    this.hash.clear();
    this.numbers.clear();
    this.world = null;
    this.player = null;
  }
}

function normDifficulty(name) {
  return name === 'easy' || name === 'hard' ? name : 'normal';
}

/**
 * Varlık → render/mobModels.update(dt, state) durumu (saf yardımcı; out verilirse yeniden kullanılır).
 * {speed, attacking (false | true | saldırı adı), hurt, dead, phase, aim, hidden, ghost}
 */
export function toModelState(e, out) {
  const o = out || {};
  o.speed = e.dead ? 0 : (e.speedNow !== undefined ? e.speedNow : Math.sqrt(e.vx * e.vx + e.vz * e.vz));
  o.attacking = e.attacking || false;
  o.hurt = !!e.hurt;
  o.dead = !!e.dead;
  o.phase = e.phase | 0;
  o.aim = e.aim || null;
  o.hidden = !!e.hidden;
  o.ghost = !!e.ghost;
  return o;
}
