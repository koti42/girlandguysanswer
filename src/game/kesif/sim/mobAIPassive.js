/*
 * KEŞİF sim — pasif yaratık davranışları (saf).
 *
 * Yürüyenler (tavuk, koyun, ormankedisi, ceylan): boşta/dolaş/otla + oyuncudan ya da vurulunca KAÇ, sürü bağı.
 * Balık: suda serbest yüzme, kıyıdan kaçınma, sudan çıkarsa çırpınma. Kelebek/ateş böceği: zeminin üstünde süzülme.
 * Durumlar (ent.state): 'idle' | 'wander' | 'graze' | 'flee' | 'swim' | 'flutter'.
 * Çocuk dostu: pasifler hiç saldırmaz.
 */
import {
  TAU, cellLiquid, clamp, groundYBelow, rnd, rndRange, steerFly, wrapAngle,
} from './mobAIUtil.js';
import { faceDir, stopMove, walkToward } from './mobAIMove.js';

const _near = [];

/** Oyuncudan korkma menzili (çömelme yarıya, koşu ×1,25). */
function fearRange(def, p) {
  let r = def.fleeRange;
  if (p.crouching) r *= 0.5;
  else if (p.sprinting) r *= 1.25;
  return r;
}

function herdBias(em, ent) {
  const ai = ent.ai;
  _near.length = 0;
  em.hash.query(ent.x, ent.z, 12, _near);
  let n = 0;
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < _near.length; i++) {
    const o = _near[i];
    if (o === ent || o.type !== ent.type || o.dead) continue;
    sx += o.x;
    sz += o.z;
    n++;
  }
  _near.length = 0;
  if (n === 0) {
    ai.hx = 0;
    ai.hz = 0;
    return;
  }
  sx /= n;
  sz /= n;
  const dx = sx - ent.x;
  const dz = sz - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 5) {
    ai.hx = dx / d;
    ai.hz = dz / d;
  } else {
    ai.hx = 0;
    ai.hz = 0;
  }
}

function pickWander(em, ent) {
  const ai = ent.ai;
  let ang = rnd(em, ent) * TAU;
  let dx = -Math.sin(ang);
  let dz = -Math.cos(ang);
  // eve ve sürüye doğru hafif çekim
  const hx = ent.home.x - ent.x;
  const hz = ent.home.z - ent.z;
  const hd = Math.sqrt(hx * hx + hz * hz);
  if (hd > 14) {
    dx = dx * 0.3 + (hx / hd) * 0.7;
    dz = dz * 0.3 + (hz / hd) * 0.7;
  }
  if (ai.hx !== 0 || ai.hz !== 0) {
    dx += ai.hx * 0.6;
    dz += ai.hz * 0.6;
  }
  ang = Math.sqrt(dx * dx + dz * dz) || 1;
  const dist = rndRange(em, ent, 3, 9);
  ai.tx = ent.x + (dx / ang) * dist;
  ai.tz = ent.z + (dz / ang) * dist;
}

function walker(em, ent, def, dt, tg) {
  const ai = ent.ai;
  ai.t -= dt;
  if (ai.fleeT > 0) ai.fleeT -= dt;
  ai.think -= dt;
  const p = em.player;
  let threat = false;
  let tx = 0;
  let tz = 0;
  if (tg.active && def.fleeRange > 0 && tg.dist2d < fearRange(def, p)) {
    threat = true;
    tx = p.x;
    tz = p.z;
  } else if (ai.fleeT > 0) {
    threat = true;
    tx = ai.fx;
    tz = ai.fz;
  }
  if (threat) {
    if (ent.state !== 'flee') {
      ent.state = 'flee';
      ai.steerT = 0;
    }
    let ax = ent.x - tx;
    let az = ent.z - tz;
    const l = Math.sqrt(ax * ax + az * az) || 1;
    ax /= l;
    az /= l;
    walkToward(em, ent, def, ent.x + ax * 9, ent.z + az * 9, def.speed, dt, { reach: 0.5 });
    faceDir(ent, ent.mv.dx, ent.mv.dz, dt, 9);
    ai.t = 0.6;
    return;
  }
  if (ent.state === 'flee') {
    ent.state = 'idle';
    ai.t = 0.5;
    stopMove(ent);
  }
  if (ai.think <= 0) {
    ai.think = 1.2;
    if (def.key !== 'ormankedisi') herdBias(em, ent);
  }
  if (ent.state === 'idle' || ent.state === 'graze') {
    stopMove(ent);
    if (ai.t <= 0) {
      pickWander(em, ent);
      ent.state = 'wander';
      ai.t = rndRange(em, ent, 4, 9);
      ai.steerT = 0;
    }
    return;
  }
  // wander
  const walking = walkToward(em, ent, def, ai.tx, ai.tz, def.walkSpeed, dt, { reach: 0.6 });
  faceDir(ent, ent.mv.dx, ent.mv.dz, dt, 5);
  if (!walking || ai.t <= 0) {
    stopMove(ent);
    const r = rnd(em, ent);
    if (r < 0.45 && (def.key === 'koyun' || def.key === 'tavuk' || def.key === 'ceylan')) {
      ent.state = 'graze';
      ai.t = rndRange(em, ent, 2, 4.5);
    } else {
      ent.state = 'idle';
      ai.t = rndRange(em, ent, 1.5, 4.5);
    }
  }
}

function fish(em, ent, def, dt, tg) {
  const ai = ent.ai;
  const world = em.world;
  const mv = ent.mv;
  if (!ent.inWater) {
    // karada çırpınır: küçük zıplamalar
    ent.state = 'idle';
    mv.dx = 0;
    mv.dz = 0;
    mv.dy = 0;
    mv.spd = 0;
    ai.t -= dt;
    if (ent.onGround && ai.t <= 0) {
      ent.vy = 3.2;
      ent.vx = (rnd(em, ent) - 0.5) * 2;
      ent.vz = (rnd(em, ent) - 0.5) * 2;
      ent.onGround = false;
      ai.t = rndRange(em, ent, 0.5, 1.2);
    }
    return;
  }
  ent.state = 'swim';
  ai.t -= dt;
  ai.think -= dt;
  const p = em.player;
  let spd = def.walkSpeed;
  if (tg.active && tg.dist2d < fearRange(def, p)) {
    // kaç
    ai.ang = Math.atan2(-(ent.x - p.x), -(ent.z - p.z)) + (rnd(em, ent) - 0.5) * 0.6;
    spd = def.speed;
  } else if (ai.t <= 0) {
    ai.ang = wrapAngle(ai.ang + (rnd(em, ent) - 0.5) * 2.4);
    ai.t = rndRange(em, ent, 1.5, 4);
    ai.depthBias = (rnd(em, ent) - 0.5) * 0.8;
  }
  const dx = -Math.sin(ai.ang);
  const dz = -Math.cos(ai.ang);
  // ileride su var mı? yoksa dön
  const ahead = cellLiquid(world, Math.floor(ent.x + dx * 1.3), Math.floor(ent.y + 0.2), Math.floor(ent.z + dz * 1.3));
  if (!ahead || ent.hitX || ent.hitZ) {
    ai.ang = wrapAngle(ai.ang + Math.PI * (0.6 + rnd(em, ent) * 0.8));
    ai.t = 1;
  }
  mv.dx = -Math.sin(ai.ang);
  mv.dz = -Math.cos(ai.ang);
  // dikey: yüzeyin altında kal
  const up = cellLiquid(world, Math.floor(ent.x), Math.floor(ent.y + ent.h + 0.6), Math.floor(ent.z));
  let dy = ai.depthBias || 0;
  if (!up) dy = Math.min(dy, -0.3);
  if (ent.onGround && dy < 0) dy = 0.2;
  mv.dy = clamp(dy, -0.6, 0.6);
  mv.spd = spd;
  mv.accel = 10;
  faceDir(ent, mv.dx, mv.dz, dt, 6);
}

function flutter(em, ent, def, dt, tg) {
  const ai = ent.ai;
  const mv = ent.mv;
  const world = em.world;
  ent.state = 'flutter';
  ai.t -= dt;
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = 0.5;
    const gy = groundYBelow(world, ent.x, ent.y + 0.5, ent.z, 14);
    ai.gy = gy < 0 ? ent.y : gy;
    if (ai.t <= 0) {
      ai.ang = wrapAngle(ai.ang + (rnd(em, ent) - 0.5) * 2.8);
      ai.t = rndRange(em, ent, 0.8, 2.4);
    }
    // eve çekim
    const hx = ent.home.x - ent.x;
    const hz = ent.home.z - ent.z;
    const hd = Math.sqrt(hx * hx + hz * hz);
    if (hd > (def.key === 'atesbocegi' ? 7 : 12)) {
      ai.ang = Math.atan2(-hx, -hz);
    }
  }
  let spd = def.walkSpeed;
  const p = em.player;
  if (tg.active && tg.dist2d < fearRange(def, p)) {
    ai.ang = Math.atan2(-(ent.x - p.x), -(ent.z - p.z));
    spd = def.speed * 1.4;
  }
  const bob = Math.sin(ent.age * 3 + ent.id) * 0.45;
  const lo = ai.gy + (def.key === 'atesbocegi' ? 0.8 : 1.4);
  const hi = ai.gy + (def.key === 'atesbocegi' ? 2.6 : 4.2);
  let wy = bob;
  if (ent.y < lo) wy = 0.9;
  else if (ent.y > hi) wy = -0.9;
  const wx = -Math.sin(ai.ang);
  const wz = -Math.cos(ai.ang);
  steerFly(world, ent, wx, wy, wz);
  mv.spd = spd;
  mv.accel = 6;
  faceDir(ent, mv.dx, mv.dz, dt, 7);
}

/** Pasif tür için bir YZ adımı. tg: hedef bilgisi (oyuncuya göre). */
export function updatePassive(em, ent, def, dt, ctx, tg) {
  const mode = def.movement;
  if (mode === 'yüz') fish(em, ent, def, dt, tg);
  else if (mode === 'uç') flutter(em, ent, def, dt, tg);
  else walker(em, ent, def, dt, tg);
}

/** Pasif varlığı korkutur (vurulunca): (srcX,srcZ)'den uzaklaşır. */
export function scarePassive(ent, srcX, srcZ, secs) {
  ent.ai.fleeT = secs;
  ent.ai.fx = srcX;
  ent.ai.fz = srcZ;
}
