/*
 * KEŞİF sim — düşman ortak davranışları + Gölge ve Kemikçi (saf).
 *
 * Ortak: duyular (ışık seviyesi, görüş hattı, ağırlık/vazgeçme), ışık tepkisi ('kaç' → karanlığa geri çekil, 'zayıfla' →
 * hız ×0,6 / hasar ×0,5; ASLA yanma yok), boşta dolaşma, yakın dövüş durum makinesi (yaklaş → hazırlık → vuruş → toparlan).
 * Durumlar (ent.state): 'idle' | 'wander' | 'stalk' | 'chase' | 'windup' | 'recover' | 'retreat' | 'kite'.
 * ent.attacking = true yalnızca hazırlık + vuruş penceresinde (model animasyonunu sürer).
 */
import { TAU, darkestDir, rnd, rndRange, rndSign } from './mobAIUtil.js';
import { hasLineOfSight } from './raycast.js';
import { faceDir, faceTo, stopMove, walkToward } from './mobAIMove.js';

export const AI_PH = Object.freeze({ IDLE: 0, WINDUP: 1, RECOVER: 2, FLIGHT: 3 });

const _dir = { x: 0, z: 0 };

/** Oyuncu bu varlığa mı bakıyor (yön noktası ≥ cosLimit)? */
export function playerLooking(p, ent, tg, cosLimit) {
  if (tg.dist2d < 0.01) return true;
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  return (fx * (ent.x - p.x) + fz * (ent.z - p.z)) / tg.dist2d > cosLimit;
}

/* ------------------------------------------------------------------------------------------------
 * Duyular
 * ---------------------------------------------------------------------------------------------- */
export function hostileSense(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  if (ai.aggroT > 0) ai.aggroT -= dt;
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = 0.25;
    const df = ctx.dayFactor;
    const eyeY = ent.y + def.eyeHeight;
    ai.light = em.lightAt(ent.x, ent.y + ent.h * 0.5, ent.z, df);
    const react = def.lightReaction;
    ai.lit = !!react && !!def.spawn && ai.light > def.spawn.maxLight;
    if (tg.active && tg.dist < def.loseRange * 1.6) {
      ai.los = hasLineOfSight(em.world, ent.x, eyeY, ent.z, tg.px, tg.py, tg.pz);
    } else {
      ai.los = false;
    }
  }
  if (tg.active && ai.los) ai.noLosT = 0;
  else ai.noLosT += dt;
  ent.weak = ai.lit && def.lightReaction === 'zayıfla';
  ent.sm = ent.weak ? 0.6 : 1;
  ai.afraid = ai.lit && def.lightReaction === 'kaç' && !(ai.aggroT > 0 && tg.dist2d < 2.2);
  // ışıkta olup oyuncuya yakınsa geri çekilir (hedefi olmasa da); köşeye sıkışırsa savunur
  ai.scared = ai.afraid && tg.active && tg.dist2d < def.aggroRange * em.aggroMul * 1.3;

  const mulR = ai.aggroT > 0 ? 1.6 : 1;
  const aggro = def.aggroRange * mulR * em.aggroMul;
  const lose = def.loseRange * mulR * em.aggroMul;
  if (!ent.target) {
    if (tg.active && !ai.afraid && tg.dist <= aggro && (ai.los || tg.dist <= aggro * 0.35)) {
      ent.target = true;
      ai.noLosT = 0;
      ai.steerT = 0;
    }
  } else if (!tg.active || tg.dist > lose || ai.noLosT > 7) {
    ent.target = false;
    ai.ph = AI_PH.IDLE;
    ent.attacking = false;
    stopMove(ent);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Boşta dolaşma (hedef yokken)
 * ---------------------------------------------------------------------------------------------- */
export function idleWander(em, ent, def, dt, speedScale) {
  const ai = ent.ai;
  ai.t -= dt;
  if (ent.state !== 'idle' && ent.state !== 'wander') {
    ent.state = 'idle';
    ai.t = rndRange(em, ent, 0.5, 2);
  }
  if (ent.state === 'idle') {
    stopMove(ent);
    if (ai.t <= 0) {
      const a = rnd(em, ent) * TAU;
      const d = rndRange(em, ent, 3, 8);
      const hx = ent.home.x - ent.x;
      const hz = ent.home.z - ent.z;
      const far = Math.sqrt(hx * hx + hz * hz) > 16;
      ai.tx = far ? ent.home.x : ent.x - Math.sin(a) * d;
      ai.tz = far ? ent.home.z : ent.z - Math.cos(a) * d;
      ent.state = 'wander';
      ai.t = rndRange(em, ent, 4, 8);
      ai.steerT = 0;
    }
    return;
  }
  const walking = walkToward(em, ent, def, ai.tx, ai.tz, def.walkSpeed * (speedScale || 1), dt, { reach: 0.7 });
  faceDir(ent, ent.mv.dx, ent.mv.dz, dt, 5);
  if (!walking || ai.t <= 0) {
    ent.state = 'idle';
    ai.t = rndRange(em, ent, 1.5, 4);
    stopMove(ent);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Işıktan kaçış
 * ---------------------------------------------------------------------------------------------- */
export function retreatFromLight(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  ent.state = 'retreat';
  ai.ph = AI_PH.IDLE;
  ent.attacking = false;
  ai.rt -= dt;
  if (ai.rt <= 0) {
    ai.rt = 0.5;
    let ax = ent.x - tg.px;
    let az = ent.z - tg.pz;
    const l = Math.sqrt(ax * ax + az * az) || 1;
    ax /= l;
    az /= l;
    darkestDir(em.world, ent.x, ent.y + 0.5, ent.z, ctx.dayFactor, ax, az, _dir);
    ai.rx = ent.x + _dir.x * 7;
    ai.rz = ent.z + _dir.z * 7;
    ai.steerT = 0;
  }
  walkToward(em, ent, def, ai.rx, ai.rz, def.speed * 0.85, dt, { reach: 0.6 });
  faceDir(ent, ent.mv.dx, ent.mv.dz, dt, 8);
}

/* ------------------------------------------------------------------------------------------------
 * Yakın dövüş durum makinesi
 * ---------------------------------------------------------------------------------------------- */
function inFront(ent, tg, minDot) {
  if (tg.dist2d < 0.2) return true;
  const fx = -Math.sin(ent.yaw);
  const fz = -Math.cos(ent.yaw);
  return (fx * tg.dx + fz * tg.dz) / tg.dist2d >= minDot;
}

/** Vuruş uygular (oyuncu hâlâ menzildeyse). */
export function strikePlayer(em, ent, def, tg, range, extra) {
  const dyOk = tg.py > ent.y - 0.5 && tg.py < ent.y + ent.h + 1.2;
  if (!tg.active || tg.dist2d > range + 0.35 || !dyOk || !inFront(ent, tg, 0.15)) return false;
  const dmg = def.damage * (ent.weak ? 0.5 : 1);
  em.hurtPlayer(ent, dmg, {
    cause: 'yaratık',
    fromX: ent.x,
    fromZ: ent.z,
    kStrength: extra && extra.knock !== undefined ? extra.knock : 6,
    effect: extra && extra.effect ? extra.effect : null,
  });
  return true;
}

export function beginWindup(em, ent, def, secs) {
  const ai = ent.ai;
  ai.ph = AI_PH.WINDUP;
  ai.t = secs * em.windupMul;
  ent.state = 'windup';
  ent.attacking = true;
  stopMove(ent);
}

/**
 * Hazırlık/toparlanma durumlarını ilerletir. Dönüş: true → hareket/YZ bu karede meşgul.
 * onStrike(): hazırlık bitince çağrılır (vuruş/atış); AI_PH.FLIGHT dönerse havada atılma evresine geçilir.
 */
export function attackStep(em, ent, def, dt, tg, onStrike) {
  const ai = ent.ai;
  if (ai.ph === AI_PH.IDLE) return false;
  if (ai.ph === AI_PH.WINDUP) {
    stopMove(ent);
    if (tg.active) faceTo(ent, tg.px, tg.pz, dt, 12);
    ai.t -= dt;
    if (ai.t <= 0) {
      const r = onStrike();
      if (r === AI_PH.FLIGHT) {
        ai.ph = AI_PH.FLIGHT;
        ai.t = 0;
        ai.hit = false;
        ent.state = 'leap';
        return true;
      }
      ai.ph = AI_PH.RECOVER;
      ai.t = Math.max(0.3, def.attack.cooldown - def.attack.windup);
      ent.cd.atk = def.attack.cooldown * em.windupMul * 0.5;
      ent.state = 'recover';
      ai.keepAtk = 0.25;
    }
    return true;
  }
  if (ai.ph === AI_PH.RECOVER) {
    if (ai.keepAtk > 0) {
      ai.keepAtk -= dt;
      if (ai.keepAtk <= 0) ent.attacking = false;
    }
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.ph = AI_PH.IDLE;
      ent.attacking = false;
    }
    // toparlanırken yavaşça geri çekil / dur
    stopMove(ent);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------------------------------------
 * GÖLGE — yürüyen gölge: bakılırken yavaş yaklaşır (sinsi), bakılmazken/yakında hızlı kovalar.
 * ---------------------------------------------------------------------------------------------- */
export function golgeAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  hostileSense(em, ent, def, dt, ctx, tg);
  if (ent.cd.atk > 0) ent.cd.atk -= dt;
  if (attackStep(em, ent, def, dt, tg, () => strikePlayer(em, ent, def, tg, def.attack.range))) return;
  if (ai.scared) {
    retreatFromLight(em, ent, def, dt, ctx, tg);
    return;
  }
  if (!ent.target) {
    idleWander(em, ent, def, dt, 0.8);
    return;
  }
  let speed = def.speed * ent.sm;
  if (tg.dist2d > 7 && playerLooking(em.player, ent, tg, 0.8)) {
    ent.state = 'stalk';
    speed = def.walkSpeed * 0.75 * ent.sm;
  } else {
    ent.state = 'chase';
  }
  walkToward(em, ent, def, tg.px, tg.pz, speed, dt, { reach: 0.8 });
  faceTo(ent, tg.px, tg.pz, dt, 8);
  if (ent.cd.atk <= 0 && tg.dist2d <= def.attack.range * 0.92 && ai.los) {
    beginWindup(em, ent, def, def.attack.windup);
  }
}

/* ------------------------------------------------------------------------------------------------
 * KEMİKÇİ — okçu: 6–12 blok aralığını korur, yan adımlarla döner, ok atar.
 * ---------------------------------------------------------------------------------------------- */
export function kemikciAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  hostileSense(em, ent, def, dt, ctx, tg);
  if (ent.cd.atk > 0) ent.cd.atk -= dt;
  const shoot = () => {
    const ox = ent.x;
    const oy = ent.y + def.eyeHeight;
    const oz = ent.z;
    const speed = 22;
    const lead = tg.dist / speed;
    const p = em.player;
    let dx = tg.px + (p.vx || 0) * lead * 0.5 - ox;
    let dz = tg.pz + (p.vz || 0) * lead * 0.5 - oz;
    const horiz = Math.sqrt(dx * dx + dz * dz);
    const t = horiz / speed;
    // yerçekimi telafisi + küçük sapma (kolay modda daha geniş)
    let dy = tg.py - oy + 0.5 * 18 * t * t;
    const spread = em.difficulty === 'easy' ? 0.1 : 0.045;
    dx += (rnd(em, ent) - 0.5) * spread * horiz;
    dz += (rnd(em, ent) - 0.5) * spread * horiz;
    dy += (rnd(em, ent) - 0.5) * spread * horiz;
    em.fireProjectile('ok', ox, oy, oz, dx, dy, dz, speed, ent, { damage: def.damage * (ent.weak ? 0.5 : 1) });
    em.emit({ type: 'fx', name: 'shoot', id: ent.id, x: ox, y: oy, z: oz });
    return true;
  };
  if (attackStep(em, ent, def, dt, tg, shoot)) return;
  if (ai.scared) {
    retreatFromLight(em, ent, def, dt, ctx, tg);
    return;
  }
  if (!ent.target) {
    idleWander(em, ent, def, dt, 0.8);
    return;
  }
  faceTo(ent, tg.px, tg.pz, dt, 9);
  const sm = ent.sm;
  ai.t -= dt;
  if (ai.t <= 0) {
    ai.strafe = rndSign(em, ent);
    ai.t = rndRange(em, ent, 1.6, 3.2);
  }
  const ux = tg.dx / (tg.dist2d || 1);
  const uz = tg.dz / (tg.dist2d || 1);
  let gx;
  let gz;
  let speed = def.walkSpeed * 1.6 * sm;
  if (tg.dist2d < 5.5) {
    // çok yakın: geri çekil + yan
    ent.state = 'kite';
    gx = ent.x - ux * 6 + -uz * ai.strafe * 2;
    gz = ent.z - uz * 6 + ux * ai.strafe * 2;
    speed = def.speed * sm;
  } else if (tg.dist2d > 12.5 || !ai.los) {
    ent.state = 'chase';
    gx = tg.px;
    gz = tg.pz;
    speed = def.speed * 0.8 * sm;
  } else {
    ent.state = 'kite';
    gx = ent.x + -uz * ai.strafe * 3;
    gz = ent.z + ux * ai.strafe * 3;
  }
  walkToward(em, ent, def, gx, gz, speed, dt, { reach: 0.4 });
  if (ent.cd.atk <= 0 && ai.los && tg.dist2d <= def.attack.range && tg.dist2d >= 3) {
    beginWindup(em, ent, def, def.attack.windup);
  }
}
