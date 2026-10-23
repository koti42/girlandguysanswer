/*
 * KEŞİF sim — düşman davranışları, 2. grup (saf): Kum Akrebi (toprak altına gömülme), Buz Hortlağı (süzülür, yavaşlatır),
 * Kristal Böceği (atılma), Lav Slime (sıçrama), Taş Yarasası (yörünge + dalış).
 * Ortak altyapı mobAIHostile.js'den gelir (duyular, ışık tepkisi, hazırlık/vuruş makinesi).
 */
import {
  TAU, probeMove, rnd, rndRange, rndSign, steerFly,
} from './mobAIUtil.js';
import {
  faceDir, faceTo, stopMove, walkToward,
} from './mobAIMove.js';
import {
  AI_PH, attackStep, beginWindup, hostileSense, idleWander, retreatFromLight, strikePlayer,
} from './mobAIHostile.js';

/* ------------------------------------------------------------------------------------------------
 * KUM AKREBİ — yüzeyde kovalar/sokar; uzaktayken toprağa gömülüp hızla yaklaşır, çıkış noktası işaretlenir.
 * ------------------------------------------------------------------------------------------------ */
const BURROW_DIG = 0.45;

export function kumakrebiAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  hostileSense(em, ent, def, dt, ctx, tg);
  if (ent.cd.atk > 0) ent.cd.atk -= dt;
  if (ent.cd.burrow > 0) ent.cd.burrow -= dt;
  const sting = () => strikePlayer(em, ent, def, tg, def.attack.range);

  if (ai.bph > 0) {
    // gömülme evreleri
    ai.bt += dt;
    if (!ent.target || ai.afraid) {
      // hedefi kaybetti: çık
      ai.bph = 3;
    }
    if (ai.bph === 1) {
      stopMove(ent);
      ent.state = 'burrow';
      ent.burrow = Math.min(1, ai.bt / BURROW_DIG);
      if (ai.bt >= BURROW_DIG) {
        ai.bph = 2;
        ai.bt = 0;
        ent.hidden = true;
        ent.burrow = 1;
        em.emit({ type: 'fx', name: 'dust', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
      }
      return;
    }
    if (ai.bph === 2) {
      ent.state = 'burrow';
      walkToward(em, ent, def, tg.px, tg.pz, Math.max(5.5, def.speed * 1.45) * ent.sm, dt, { reach: 0.3 });
      faceTo(ent, tg.px, tg.pz, dt, 10);
      if (ai.marker) {
        ai.marker.x = ent.x;
        ai.marker.z = ent.z;
        if (ai.marker.stage === 'done') ai.marker = null;
      }
      if (!ai.marker && tg.dist2d < 5.6 && ai.bt > 0.4) {
        ai.marker = em.addHazard({
          shape: 'circle', x: ent.x, y: ent.y, z: ent.z, r: 1.5, windup: 0.6, active: 0.05, dmg: 0, color: 0xd9b36a, cue: null,
        }, ent);
      }
      if ((tg.dist2d < 2.4 && ai.marker) || ai.bt > 4.5) ai.bph = 3;
      return;
    }
    // bph 3: çıkış
    ent.hidden = false;
    ent.burrow = 0;
    ai.bph = 0;
    ai.bt = 0;
    ai.marker = null;
    ent.cd.burrow = 7;
    em.emit({ type: 'fx', name: 'dust', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
    if (ent.target && !ai.afraid) beginWindup(em, ent, def, 0.28);
    return;
  }

  if (attackStep(em, ent, def, dt, tg, sting)) return;
  if (ai.scared) {
    retreatFromLight(em, ent, def, dt, ctx, tg);
    return;
  }
  if (!ent.target) {
    idleWander(em, ent, def, dt, 0.8);
    return;
  }
  if (ent.cd.burrow <= 0 && tg.dist2d > 5.5 && tg.dist2d < 18 && ent.onGround && !ent.inWater) {
    ai.bph = 1;
    ai.bt = 0;
    em.emit({ type: 'fx', name: 'dust', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
    return;
  }
  ent.state = 'chase';
  walkToward(em, ent, def, tg.px, tg.pz, def.speed * ent.sm, dt, { reach: 0.8 });
  faceTo(ent, tg.px, tg.pz, dt, 9);
  if (ent.cd.atk <= 0 && tg.dist2d <= def.attack.range * 0.92 && ai.los) beginWindup(em, ent, def, def.attack.windup);
}

/* ------------------------------------------------------------------------------------------------
 * BUZ HORTLAĞI — alçaktan süzülür (düşerken yavaşlar), vuruşu yavaşlatır.
 * ------------------------------------------------------------------------------------------------ */
const CHILL = Object.freeze({ kind: 'slow', t: 2.5, factor: 0.6 });

export function buzhortlagiAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  hostileSense(em, ent, def, dt, ctx, tg);
  if (ent.cd.atk > 0) ent.cd.atk -= dt;
  ent.mv.gravity = 0.15;
  const hit = () => strikePlayer(em, ent, def, tg, def.attack.range, { effect: CHILL, knock: 4 });
  if (attackStep(em, ent, def, dt, tg, hit)) return;
  if (ai.scared) {
    retreatFromLight(em, ent, def, dt, ctx, tg);
    return;
  }
  if (!ent.target) {
    idleWander(em, ent, def, dt, 0.8);
    return;
  }
  ent.state = 'chase';
  walkToward(em, ent, def, tg.px, tg.pz, def.speed * ent.sm, dt, { reach: 1, maxDrop: 8 });
  faceTo(ent, tg.px, tg.pz, dt, 7);
  if (ent.cd.atk <= 0 && tg.dist2d <= def.attack.range * 0.92 && ai.los) beginWindup(em, ent, def, def.attack.windup);
}

/* ------------------------------------------------------------------------------------------------
 * Atılma ortak (Kristal Böceği ve Lav Slime): hazırlık → havada temas hasarı → iniş toparlanması.
 * ------------------------------------------------------------------------------------------------ */
function launch(em, ent, tg, horiz, vy) {
  const l = tg.dist2d || 1;
  const ux = tg.dx / l;
  const uz = tg.dz / l;
  // uçuş süresi mesafeye göre; hedefin biraz ötesine iner (oyuncunun içinden geçer)
  const t = Math.min(0.9, Math.max(0.4, (tg.dist2d + 0.8) / horiz));
  vy = (28 * t) / 2;
  const sp = Math.min(horiz * 1.2, Math.max(2.5, (tg.dist2d + 0.8) / t));
  ent.vx = ux * sp;
  ent.vz = uz * sp;
  ent.vy = vy;
  ent.onGround = false;
  ent.hold = t + 0.3;
  ent.mv.spd = 0;
  ent.mv.dx = ux;
  ent.mv.dz = uz;
  ent.yaw = Math.atan2(-ux, -uz);
  em.emit({ type: 'fx', name: 'leap', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
}

function flightStep(em, ent, def, dt, tg, reachR) {
  const ai = ent.ai;
  ai.t += dt;
  ent.mv.spd = 0;
  if (!ai.hit && tg.active && tg.dist2d < reachR && Math.abs(tg.py - (ent.y + ent.h * 0.5)) < ent.h + 0.9) {
    ai.hit = true;
    em.hurtPlayer(ent, def.damage * (ent.weak ? 0.5 : 1), {
      cause: 'yaratık', fromX: ent.x, fromZ: ent.z, kStrength: 7,
    });
  }
  if ((ent.onGround && ai.t > 0.2) || ai.t > 1.6) {
    ai.ph = AI_PH.RECOVER;
    ai.t = 0.9;
    ai.keepAtk = 0.2;
    ent.state = 'recover';
    ent.cd.atk = def.attack.cooldown;
    ent.hold = 0;
  }
}

/* ------------------------------------------------------------------------------------------------
 * KRİSTAL BÖCEĞİ — kovalar; 3–7 blokta çömelip hedefe atılır; inince bir an sersemler.
 * ------------------------------------------------------------------------------------------------ */
export function kristalbocegiAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  hostileSense(em, ent, def, dt, ctx, tg);
  if (ent.cd.atk > 0) ent.cd.atk -= dt;
  if (ai.ph === AI_PH.FLIGHT) {
    flightStep(em, ent, def, dt, tg, 1.7);
    return;
  }
  const doLeap = () => {
    launch(em, ent, tg, 10, 6.5);
    return AI_PH.FLIGHT;
  };
  if (attackStep(em, ent, def, dt, tg, doLeap)) return;
  if (ai.scared) {
    retreatFromLight(em, ent, def, dt, ctx, tg);
    return;
  }
  if (!ent.target) {
    idleWander(em, ent, def, dt, 0.8);
    return;
  }
  ent.state = 'chase';
  walkToward(em, ent, def, tg.px, tg.pz, def.speed * ent.sm, dt, { reach: 0.8 });
  faceTo(ent, tg.px, tg.pz, dt, 9);
  if (ent.cd.atk <= 0 && ai.los && tg.dist2d >= 0.8 && tg.dist2d <= 7 && ent.onGround) {
    beginWindup(em, ent, def, def.attack.windup);
  }
}

/* ------------------------------------------------------------------------------------------------
 * LAV SLIME — küçük sıçramalarla ilerler; yakında büyük sıçrama saldırısı. Lavdan etkilenmez.
 * ------------------------------------------------------------------------------------------------ */
export function lavslimeAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  hostileSense(em, ent, def, dt, ctx, tg);
  if (ent.cd.atk > 0) ent.cd.atk -= dt;
  if (ai.ph === AI_PH.FLIGHT) {
    flightStep(em, ent, def, dt, tg, 1.6);
    return;
  }
  const doLeap = () => {
    launch(em, ent, tg, 6.4, 9);
    return AI_PH.FLIGHT;
  };
  if (attackStep(em, ent, def, dt, tg, doLeap)) return;
  if (!ent.onGround) return; // havada: yatay hız korunur
  stopMove(ent);
  ai.hopT -= dt;
  let wx;
  let wz;
  let speed;
  if (ent.target && !ai.afraid) {
    ent.state = 'hop';
    wx = tg.dx;
    wz = tg.dz;
    speed = 3.8 * ent.sm;
    if (ent.cd.atk <= 0 && ai.los && tg.dist2d > 0.8 && tg.dist2d < 4.6) {
      beginWindup(em, ent, def, def.attack.windup);
      return;
    }
  } else if (ai.afraid) {
    ent.state = 'retreat';
    wx = -tg.dx;
    wz = -tg.dz;
    speed = 3.4;
  } else {
    ent.state = 'wander';
    if (ai.t <= 0) {
      ai.ang = rnd(em, ent) * TAU;
      ai.t = rndRange(em, ent, 2, 5);
    }
    ai.t -= dt;
    wx = -Math.sin(ai.ang);
    wz = -Math.cos(ai.ang);
    speed = 2.2;
  }
  if (ai.hopT > 0) return;
  ai.hopT = rndRange(em, ent, 0.55, 0.95);
  const l = Math.sqrt(wx * wx + wz * wz) || 1;
  const k = walkSafe(em, ent, wx / l, wz / l);
  if (k) {
    ent.vx = ent.mv.dx * speed;
    ent.vz = ent.mv.dz * speed;
    ent.yaw = Math.atan2(-ent.mv.dx, -ent.mv.dz);
    ent.vy = 7.6;
    ent.onGround = false;
    ent.hold = 0.9;
    em.emit({ type: 'fx', name: 'squish', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
  } else {
    ai.ang += Math.PI * 0.7;
  }
  ent.mv.dx = 0;
  ent.mv.dz = 0;
  ent.mv.spd = 0;
}

function walkSafe(em, ent, ux, uz) {
  // steerDirection yerine hafif: yalnızca doğrudan + iki yan
  const o = { reach0: ent.w * 0.5 + 0.8, reach1: ent.w * 0.5 + 2.2, hc: 1, canJump: true, maxDrop: 3, avoidWater: true, ignoreLava: true };
  const angs = [0, 0.7, -0.7, 1.4, -1.4];
  for (let i = 0; i < angs.length; i++) {
    const c = Math.cos(angs[i]);
    const s = Math.sin(angs[i]);
    const dx = ux * c - uz * s;
    const dz = ux * s + uz * c;
    if (probeMove(em.world, ent.x, ent.y, ent.z, dx, dz, o) > 0) {
      ent.mv.dx = dx;
      ent.mv.dz = dz;
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------------------------------------
 * TAŞ YARASASI — uçar; hedefin çevresinde yörüngede döner, hazırlanıp dalış yapar, yukarı çekilir.
 * ------------------------------------------------------------------------------------------------ */
export function tasyarasasiAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  const mv = ent.mv;
  hostileSense(em, ent, def, dt, ctx, tg);
  if (ent.cd.atk > 0) ent.cd.atk -= dt;
  mv.accel = 14;

  if (ai.scared) {
    ent.state = 'retreat';
    ai.ph = AI_PH.IDLE;
    ent.attacking = false;
    let ax = ent.x - tg.px;
    let az = ent.z - tg.pz;
    const l = Math.sqrt(ax * ax + az * az) || 1;
    ax /= l;
    az /= l;
    steerFly(em.world, ent, ax, 0.5, az);
    mv.spd = def.speed * 0.9;
    faceDir(ent, mv.dx, mv.dz, dt, 8);
    return;
  }

  if (!ent.target) {
    // erratik süzülme (ev çevresinde)
    ent.state = 'wander';
    ent.attacking = false;
    ai.ph = AI_PH.IDLE;
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.ang += (rnd(em, ent) - 0.5) * 3.2;
      ai.t = rndRange(em, ent, 0.5, 1.6);
      const hx = ent.home.x - ent.x;
      const hz = ent.home.z - ent.z;
      if (hx * hx + hz * hz > 100) ai.ang = Math.atan2(-hx, -hz);
    }
    const wy = Math.sin(ent.age * 2.1 + ent.id) * 0.6;
    steerFly(em.world, ent, -Math.sin(ai.ang), wy, -Math.cos(ai.ang));
    mv.spd = def.walkSpeed;
    faceDir(ent, mv.dx, mv.dz, dt, 8);
    return;
  }

  if (ai.ph === AI_PH.WINDUP) {
    stopMove(ent);
    faceTo(ent, tg.px, tg.pz, dt, 14);
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.ph = AI_PH.FLIGHT;
      ai.t = 0;
      ai.hit = false;
      ent.state = 'dive';
    }
    return;
  }
  if (ai.ph === AI_PH.FLIGHT) {
    ai.t += dt;
    let dx = tg.px - ent.x;
    let dy = tg.py - (ent.y + ent.h * 0.5);
    let dz = tg.pz - ent.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l; dy /= l; dz /= l;
    mv.dx = dx; mv.dy = dy; mv.dz = dz;
    mv.spd = def.speed * 1.9 * ent.sm;
    mv.accel = 40;
    faceDir(ent, dx, dz, dt, 14);
    if (!ai.hit && l < 1.25) {
      ai.hit = true;
      em.hurtPlayer(ent, def.damage * (ent.weak ? 0.5 : 1), {
        cause: 'yaratık', fromX: ent.x, fromZ: ent.z, kStrength: 5,
      });
    }
    if (ai.hit || ai.t > 0.9 || ent.hitX || ent.hitZ) {
      ai.ph = AI_PH.RECOVER;
      ai.t = 1.1;
      ai.keepAtk = 0.2;
      ent.state = 'recover';
      ent.cd.atk = def.attack.cooldown + 1.2;
    }
    return;
  }
  if (ai.ph === AI_PH.RECOVER) {
    ai.t -= dt;
    if (ai.keepAtk > 0) {
      ai.keepAtk -= dt;
      if (ai.keepAtk <= 0) ent.attacking = false;
    }
    let ax = ent.x - tg.px;
    let az = ent.z - tg.pz;
    const l = Math.sqrt(ax * ax + az * az) || 1;
    steerFly(em.world, ent, ax / l, 0.8, az / l);
    mv.spd = def.speed * 0.9;
    mv.accel = 14;
    if (ai.t <= 0) {
      ai.ph = AI_PH.IDLE;
      ent.attacking = false;
    }
    return;
  }

  // yörünge
  ent.state = 'hover';
  ai.orb += dt * 1.5 * ai.orbDir;
  const gx = tg.px + Math.cos(ai.orb) * 4.5;
  const gz = tg.pz + Math.sin(ai.orb) * 4.5;
  const gy = tg.py + 2.6 + Math.sin(ent.age * 2.3) * 0.6;
  let dx = gx - ent.x;
  let dy = gy - (ent.y + ent.h * 0.5);
  let dz = gz - ent.z;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  dx /= l; dy /= l; dz /= l;
  steerFly(em.world, ent, dx, dy, dz);
  mv.spd = Math.min(def.speed * 0.8 * ent.sm, 2 + l * 1.4);
  faceTo(ent, tg.px, tg.pz, dt, 6);
  if (ent.cd.atk <= 0 && ai.los && tg.dist < 12) {
    ai.ph = AI_PH.WINDUP;
    ai.t = def.attack.windup * em.windupMul;
    ent.state = 'windup';
    ent.attacking = true;
    if (rnd(em, ent) < 0.3) ai.orbDir = rndSign(em, ent);
  }
}
