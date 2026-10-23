/*
 * KEŞİF sim — mermiler ve ışın (saf).
 *
 *  - Ok / buz mızrağı / kaya: balistik (yerçekimi g), kare başı çizgi dilimi: bloğa (raycastBlocks) ya da varlığa
 *    (raycastEntities) çarpar. Ok bloğa SAPLANIR (stuck, 10 sn); kaya bloğa/oyuncuya çarpınca alan hasarı (aoe) verir.
 *  - fireBeam: anlık ışın (enerji tüfeği, hitscan). Blok hasarı (blockDamage) YAVAŞ: sert bloklar çok atış ister, vuruşlar
 *    arasında çatlak geri çekilir. Yalnızca inşa edilebilir bloklar (id ≤ 99) kırılır; sistem blokları asla.
 * Takımlar: 'player' mermisi yaratıklara, 'mob' mermisi yalnızca oyuncuya zarar verir (dost ateşi YOK).
 */
import { BLOCKS, resolveDrops } from './blocks.js';
import { BUILDABLE_MAX, itemCeilY, itemKillY } from './constants.js';
import { raycastBlocks, raycastEntities } from './raycast.js';
import { applyMobStatus } from './magicCombat.js';

export const PROJECTILES = Object.freeze({
  ok: { g: 18, r: 0.12, life: 8, stick: true, color: 0xd9c9a0, cause: 'ok' },
  mizrak: { g: 0, r: 0.28, life: 2.2, stick: false, color: 0x9fdcff, cause: 'yaratık' },
  kaya: { g: 22, r: 0.45, life: 4, stick: false, color: 0xb0a090, cause: 'patlama' },
  // büyü mermileri (magicSpells): oyuncu asası ateş topu ve buz mızrağı
  buyuates: { g: 3, r: 0.32, life: 3, stick: false, color: 0xff7a2a, cause: 'büyü' },
  buyubuz: { g: 0, r: 0.26, life: 2.2, stick: false, color: 0x9fdcff, cause: 'büyü' },
});

const STUCK_LIFE = 10;
const MAX_PROJECTILES = 160;

const _o = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0, z: 0 };
const _cand = [];
const _pl = [{ x: 0, y: 0, z: 0, w: 0.6, h: 1.8, isPlayer: true }];
const _eopts = { filter: null, pad: 0, out: undefined };
const _bopts = { hitLiquid: false, solidOnly: false, out: undefined };

function mobTargetable(e) {
  return !e.dead && !e.hidden && !e.removed;
}

/** Mermi ateşler. owner: 'player' | mob varlığı | null. dir normalleştirilir. Dönüş: mermi | null (üst sınır). */
export function fireProjectile(em, kind, x, y, z, dx, dy, dz, speed, owner, opts) {
  const def = PROJECTILES[kind];
  if (!def || em.projectiles.length >= MAX_PROJECTILES) return null;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (!(l > 1e-9)) return null;
  const o = opts || {};
  const p = {
    id: em.nextId++,
    kind,
    x, y, z,
    vx: (dx / l) * speed,
    vy: (dy / l) * speed,
    vz: (dz / l) * speed,
    team: owner === 'player' ? 'player' : 'mob',
    ownerId: owner && owner !== 'player' ? owner.id : 0,
    owner: owner && owner !== 'player' ? owner : null,
    damage: o.damage === undefined ? 1 : o.damage,
    g: o.gravity === undefined ? def.g : o.gravity,
    r: def.r,
    life: o.life === undefined ? def.life : o.life,
    age: 0,
    stuck: false,
    stuckT: 0,
    aoe: o.aoe || null,
    effect: o.effect || null,
    status: o.status || null, // {burn, slow}: oyuncu mermisi isabet edince yaratığa yanma/yavaşlama (Alev, Buz, büyüler)
    kindSrc: o.kindSrc || null, // hasar kaynağı etiketi (varsayılan 'projectile'; büyü için 'magic')
    knock: o.knock === undefined ? 4 : o.knock,
    crit: !!o.crit,
    weapon: o.weapon || null,
    color: def.color,
  };
  em.projectiles.push(p);
  return p;
}

function killProjectile(em, i) {
  em.projectiles.splice(i, 1);
}

function explode(em, p, x, y, z) {
  em.emit({ type: 'fx', name: kindImpact(p.kind), x, y, z, r: p.aoe ? p.aoe.r : 0.5, id: p.ownerId });
  if (!p.aoe) return;
  const r = p.aoe.r;
  if (p.team === 'mob') {
    const pl = em.player;
    if (pl && !pl.dead) {
      const dx = pl.x - x;
      const dz = pl.z - z;
      const dy = pl.y + pl.h * 0.5 - y;
      if (dx * dx + dz * dz + dy * dy < (r + 0.3) * (r + 0.3)) {
        em.hurtPlayer(p.owner, p.damage, { cause: 'patlama', fromX: x, fromZ: z, kStrength: 8, effect: p.effect, source: p.ownerId });
      }
    }
  } else {
    _cand.length = 0;
    em.hash.query(x, z, r + 2, _cand, mobTargetable);
    for (let i = 0; i < _cand.length; i++) {
      const e = _cand[i];
      const dx = e.x - x;
      const dz = e.z - z;
      if (dx * dx + dz * dz < (r + e.w * 0.5) * (r + e.w * 0.5)) {
        const res = em.damage(e.id, p.damage, { kind: p.kindSrc || 'projectile', x, z, strength: 6 });
        if (p.status && res && !res.blocked && !res.killed) applyMobStatus(em, e, p.status.burn, p.status.slow);
      }
    }
    _cand.length = 0;
  }
}

function kindImpact(kind) {
  return kind === 'kaya' ? 'rockImpact' : kind === 'mizrak' || kind === 'buyubuz' ? 'iceImpact' : kind === 'buyuates' ? 'fireImpact' : 'arrowHit';
}

/** Mermileri ilerletir. */
export function updateProjectiles(em, dt) {
  const list = em.projectiles;
  const world = em.world;
  const pl = em.player;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.stuck) {
      p.stuckT -= dt;
      if (p.stuckT <= 0) killProjectile(em, i);
      continue;
    }
    p.age += dt;
    if (p.age > p.life || p.y < itemKillY(em.world) || p.y > itemCeilY(em.world)) {
      if (p.aoe && p.age > p.life) explode(em, p, p.x, p.y, p.z);
      killProjectile(em, i);
      continue;
    }
    p.vy -= p.g * dt;
    const sx = p.vx * dt;
    const sy = p.vy * dt;
    const sz = p.vz * dt;
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (len < 1e-7) continue;
    _o.x = p.x; _o.y = p.y; _o.z = p.z;
    _d.x = sx / len; _d.y = sy / len; _d.z = sz / len;

    _bopts.out = undefined;
    const bh = raycastBlocks(world, _o, _d, len, _bopts);
    const tb = bh ? bh.t : len;

    let eh = null;
    if (p.team === 'player') {
      _cand.length = 0;
      const x0 = Math.min(p.x, p.x + sx) - 2.5;
      const x1 = Math.max(p.x, p.x + sx) + 2.5;
      const z0 = Math.min(p.z, p.z + sz) - 2.5;
      const z1 = Math.max(p.z, p.z + sz) + 2.5;
      em.hash.queryBox(x0, z0, x1, z1, _cand, mobTargetable);
      _eopts.filter = null;
      _eopts.pad = p.r;
      _eopts.out = undefined;
      eh = _cand.length > 0 ? raycastEntities(_cand, _o, _d, tb, _eopts) : null;
      _cand.length = 0;
    } else if (pl && !pl.dead) {
      const t = _pl[0];
      t.x = pl.x; t.y = pl.y; t.z = pl.z; t.w = pl.w; t.h = pl.h;
      _eopts.filter = null;
      _eopts.pad = p.r;
      _eopts.out = undefined;
      eh = raycastEntities(_pl, _o, _d, tb, _eopts);
    }

    if (eh) {
      const hx = eh.point.x;
      const hy = eh.point.y;
      const hz = eh.point.z;
      if (p.team === 'player') {
        const e = eh.entity;
        const head = hy > e.y + e.h * 0.82;
        const res = em.damage(e.id, p.damage * (head && !p.aoe ? 1.5 : 1), {
          kind: p.kindSrc || 'projectile', x: hx - _d.x, z: hz - _d.z, strength: p.knock, crit: p.crit || (head && !p.aoe),
          weapon: p.weapon,
        });
        if (p.status && res && !res.blocked && !res.killed) applyMobStatus(em, e, p.status.burn, p.status.slow);
      } else if (!p.aoe) {
        em.hurtPlayer(p.owner, p.damage, {
          cause: PROJECTILES[p.kind].cause, fromX: p.x, fromZ: p.z, kStrength: p.knock, effect: p.effect, source: p.ownerId,
        });
      }
      explode(em, p, hx, hy, hz);
      killProjectile(em, i);
      continue;
    }
    if (bh) {
      const def = PROJECTILES[p.kind];
      if (def.stick && !p.aoe) {
        p.x = bh.point.x - _d.x * 0.03;
        p.y = bh.point.y - _d.y * 0.03;
        p.z = bh.point.z - _d.z * 0.03;
        p.stuck = true;
        p.stuckT = STUCK_LIFE;
        p.vx = 0; p.vy = 0; p.vz = 0;
        em.emit({ type: 'fx', name: 'arrowStick', x: p.x, y: p.y, z: p.z, id: p.ownerId });
      } else {
        explode(em, p, bh.point.x, bh.point.y, bh.point.z);
        killProjectile(em, i);
      }
      continue;
    }
    p.x += sx;
    p.y += sy;
    p.z += sz;
    if (world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === null) killProjectile(em, i);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Blok hasarı (ışın): yavaş kırma, geri çekilen çatlak
 * ---------------------------------------------------------------------------------------------- */
export function damageBlock(em, x, y, z, id, power) {
  const b = BLOCKS[id];
  if (!b || id === 0 || id > BUILDABLE_MAX || b.unbreakable || !(b.hardness >= 0) || b.liquid) return 0;
  const dp = power / Math.max(0.3, b.hardness * 4);
  const key = x + ',' + y + ',' + z;
  let e = em.blockDamage.get(key);
  if (!e) {
    e = { x, y, z, id, p: 0, t: 0 };
    em.blockDamage.set(key, e);
  }
  e.p += dp;
  e.t = 0;
  if (e.p >= 1) {
    em.blockDamage.delete(key);
    if (em.world.setBlock(x, y, z, 0)) {
      const drops = resolveDrops(id, em.rng, 'item:kazma_demir');
      for (let i = 0; i < drops.length; i++) {
        em.spawnItem(drops[i].item, drops[i].count, x + 0.5, y + 0.5, z + 0.5, { vy: 2.5 });
      }
      em.emit({ type: 'blockBroken', x, y, z, id, by: 'beam' });
      em.emit({ type: 'fx', name: 'blockBreak', x: x + 0.5, y: y + 0.5, z: z + 0.5, id });
    }
    return 1;
  }
  em.emit({ type: 'fx', name: 'beamHit', x: x + 0.5, y: y + 0.5, z: z + 0.5, progress: e.p, id });
  return e.p;
}

/** Çatlakları zamanla geri çek. */
export function updateBlockDamage(em, dt) {
  if (em.blockDamage.size === 0) return;
  em.blockDamage.forEach((e, key) => {
    e.t += dt;
    if (e.t > 2.5) {
      e.p -= dt * 0.25;
      if (e.p <= 0) em.blockDamage.delete(key);
    }
  });
}

/**
 * Anlık ışın. opts: {range=60, damage, team='player'|'mob', owner, pad=0.12, blockDamage=false, blockPower=0.35, knock=3, weapon}
 * → {kind:'entity'|'block'|null, entity, block:{x,y,z,id}, t, end:{x,y,z}, dealt, killed, broke}
 */
export function fireBeam(em, ox, oy, oz, dx, dy, dz, opts) {
  const o = opts || {};
  const range = o.range === undefined ? 60 : o.range;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const out = { kind: null, entity: null, block: null, t: range, end: { x: ox, y: oy, z: oz }, dealt: 0, killed: false, broke: false };
  if (!(l > 1e-9)) return out;
  _o.x = ox; _o.y = oy; _o.z = oz;
  _d.x = dx / l; _d.y = dy / l; _d.z = dz / l;
  _bopts.out = undefined;
  const bh = raycastBlocks(em.world, _o, _d, range, _bopts);
  const tb = bh ? bh.t : range;
  let eh = null;
  const team = o.team || 'player';
  if (team === 'player') {
    _cand.length = 0;
    const ex = ox + _d.x * tb;
    const ez = oz + _d.z * tb;
    em.hash.queryBox(Math.min(ox, ex) - 3, Math.min(oz, ez) - 3, Math.max(ox, ex) + 3, Math.max(oz, ez) + 3, _cand, mobTargetable);
    _eopts.filter = null;
    _eopts.pad = o.pad === undefined ? 0.12 : o.pad;
    _eopts.out = undefined;
    eh = _cand.length > 0 ? raycastEntities(_cand, _o, _d, tb, _eopts) : null;
    _cand.length = 0;
  } else if (em.player && !em.player.dead) {
    const pl = em.player;
    const t = _pl[0];
    t.x = pl.x; t.y = pl.y; t.z = pl.z; t.w = pl.w; t.h = pl.h;
    _eopts.filter = null;
    _eopts.pad = o.pad === undefined ? 0.12 : o.pad;
    _eopts.out = undefined;
    eh = raycastEntities(_pl, _o, _d, tb, _eopts);
  }
  if (eh) {
    out.t = eh.t;
    out.end.x = eh.point.x; out.end.y = eh.point.y; out.end.z = eh.point.z;
    out.kind = 'entity';
    if (team === 'player') {
      out.entity = eh.entity;
      const r = em.damage(eh.entity.id, o.damage === undefined ? 1 : o.damage, {
        kind: 'beam', x: ox, z: oz, strength: o.knock === undefined ? 3 : o.knock, weapon: o.weapon || null,
      });
      if (r) {
        out.dealt = r.dealt;
        out.killed = r.killed;
      }
    } else {
      em.hurtPlayer(o.owner || null, o.damage === undefined ? 1 : o.damage, { cause: 'ışın', fromX: ox, fromZ: oz, kStrength: 4 });
    }
  } else if (bh) {
    out.t = bh.t;
    out.end.x = bh.point.x; out.end.y = bh.point.y; out.end.z = bh.point.z;
    out.kind = 'block';
    out.block = { x: bh.x, y: bh.y, z: bh.z, id: bh.id };
    if (o.blockDamage && team === 'player') {
      const prog = damageBlock(em, bh.x, bh.y, bh.z, bh.id, o.blockPower === undefined ? 0.35 : o.blockPower);
      out.broke = prog >= 1;
    } else {
      em.emit({ type: 'fx', name: 'beamHit', x: bh.point.x, y: bh.point.y, z: bh.point.z, progress: 0, id: bh.id });
    }
  } else {
    out.end.x = ox + _d.x * range; out.end.y = oy + _d.y * range; out.end.z = oz + _d.z * range;
  }
  em.emit({
    type: 'fx', name: 'beam', team, x: ox, y: oy, z: oz, x1: out.end.x, y1: out.end.y, z1: out.end.z, hit: out.kind,
  });
  return out;
}
