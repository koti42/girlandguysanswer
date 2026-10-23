/*
 * KEŞİF sim — yaratık hareketi (saf): ivme, yerçekimi, su, basamak/zıplama, uçma/yüzme, yön yönlendirmesi, yol izleme.
 *
 * YZ, ent.mv ({dx,dy,dz,spd,accel,jump}) alanlarına istenen hareketi yazar; stepMob() bunu fiziğe (physics.moveBox)
 * çevirir. Yönlendirme ucuzdur: sonda taraması yalnızca "düşünme" aralığında (steerT) yapılır, aradaki karelerde
 * seçilen sapma açısı hedef yöne uygulanır. Tıkanınca (ai.stuckT) EntityManager bütçesiyle A* aranır.
 */
import { moveBox } from './physics.js';
import {
  STEER_ANGLES, angleDiff, lavaImmune, liquidDamage, steerDirection, turnToward, yawFromDir,
} from './mobAIUtil.js';
import { createPathBuffer, findPath } from './mobAIPath.js';

export const MOB_GRAVITY = 28;
const TERMINAL = 40;

const _box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const _vel = { x: 0, y: 0, z: 0 };
const _res = {
  onGround: false, hitX: false, hitY: false, hitZ: false, hitCeiling: false, inLiquid: false, headInLiquid: false,
  liquidId: 0, climbable: false, damage: 0, impactVy: 0, stepped: false,
};
const _opts = {
  stepHeight: 0.6, stickToGround: true, collideLiquids: false, unloadedSolid: true, eyeHeight: 1, out: _res,
};

export function createMv() {
  return { dx: 0, dy: 0, dz: 0, spd: 0, accel: 22, jump: false, jumpV: 8.5, gravity: 1 };
}

/** Yatay hareketi durdurur (hız ivmeyle sönümlenir). */
export function stopMove(ent) {
  const mv = ent.mv;
  mv.spd = 0;
  mv.dx = 0;
  mv.dz = 0;
  mv.dy = 0;
  mv.jump = false;
}

/** Yön (dx,dz) ve hız yazar (birime normalleştirir). */
export function setMove(ent, dx, dz, speed) {
  const l = Math.sqrt(dx * dx + dz * dz);
  const mv = ent.mv;
  if (l < 1e-6) {
    mv.dx = 0;
    mv.dz = 0;
    mv.spd = 0;
    return;
  }
  mv.dx = dx / l;
  mv.dz = dz / l;
  mv.spd = speed;
}

/** Varlığı yönüne doğru döndür (rad/sn hızla). */
export function faceDir(ent, dx, dz, dt, rate) {
  if (dx * dx + dz * dz < 1e-8) return;
  ent.yaw = turnToward(ent.yaw, yawFromDir(dx, dz), rate * dt);
}

/** Varlığı noktaya doğru döndür. */
export function faceTo(ent, tx, tz, dt, rate) {
  faceDir(ent, tx - ent.x, tz - ent.z, dt, rate);
}

/* ------------------------------------------------------------------------------------------------
 * Fizik adımı
 * ---------------------------------------------------------------------------------------------- */
function approach1(v, t, m) {
  if (v < t) return v + m > t ? t : v + m;
  return v - m < t ? t : v - m;
}

/**
 * Bir hareket adımı. Dönüş: ent.onGround/inWater/inLava/hitX/hitZ güncellenir; ent.impact = iniş hızı (>0 ise).
 * def.movement: 'yürü' | 'sek' | 'süzül' | 'uç' | 'yüz'.
 */
export function stepMob(world, ent, def, dt) {
  const mv = ent.mv;
  const mode = def.movement;
  const fly = mode === 'uç' && !ent.dead;
  const swim = mode === 'yüz' && ent.inWater && !ent.dead;
  const free = fly || swim;
  const slow = ent.slowT > 0 ? 0.55 : 1;
  const spd = ent.dead ? 0 : mv.spd * slow;
  const hold = ent.hold > 0; // atılma/zıplama sırasında yatay hızı koru
  let accel = mv.accel;
  if (spd === 0 && ent.onGround && accel < 45) accel = 45; // durunca kaymasın
  if (ent.kbT > 0) {
    ent.kbT -= dt;
    accel = 2;
  } else if (!ent.onGround && !free && !ent.inWater) {
    accel = hold ? 0 : accel * 0.3;
  }
  if (ent.hold > 0) ent.hold -= dt;
  const tx = mv.dx * spd * (ent.inWater && !free ? 0.55 : 1);
  const tz = mv.dz * spd * (ent.inWater && !free ? 0.55 : 1);
  const m = accel * dt;
  if (accel > 0) {
    const ddx = tx - ent.vx;
    const ddz = tz - ent.vz;
    const dd = Math.sqrt(ddx * ddx + ddz * ddz);
    if (dd <= m) {
      ent.vx = tx;
      ent.vz = tz;
    } else {
      ent.vx += (ddx / dd) * m;
      ent.vz += (ddz / dd) * m;
    }
  }

  let stick = !free;
  if (free) {
    ent.vy = approach1(ent.vy, mv.dy * spd, accel * dt);
  } else if (ent.inWater || ent.inLava) {
    // yüzer: kafa suyun içindeyse yüzeye çık
    const up = ent.inLava ? 3.2 : (ent.headWater ? 1.8 : 0.4) + (mv.jump ? 2.5 : 0);
    ent.vy = approach1(ent.vy, up, 14 * dt);
    stick = false;
  } else {
    const g = MOB_GRAVITY * (mv.gravity === undefined ? 1 : mv.gravity);
    ent.vy -= g * dt;
    const term = mode === 'süzül' ? -3.2 : -TERMINAL;
    if (ent.vy < term) ent.vy = term;
    if (mv.jump && ent.onGround && ent.jumpCd <= 0) {
      ent.vy = mv.jumpV;
      ent.onGround = false;
      ent.jumpCd = 0.45;
      stick = false;
    } else if (ent.vy > 0) {
      stick = false;
    }
  }
  if (ent.jumpCd > 0) ent.jumpCd -= dt;

  const hw = ent.w * 0.5;
  _box.minX = ent.x - hw; _box.maxX = ent.x + hw;
  _box.minY = ent.y; _box.maxY = ent.y + ent.h;
  _box.minZ = ent.z - hw; _box.maxZ = ent.z + hw;
  _vel.x = ent.vx; _vel.y = ent.vy; _vel.z = ent.vz;
  _opts.stepHeight = free ? 0 : (def.stepHeight !== undefined ? def.stepHeight : ent.h >= 2.5 ? 1.1 : 0.6);
  _opts.stickToGround = stick && ent.kbT <= 0;
  _opts.eyeHeight = ent.h * 0.85;
  const px = ent.x;
  const pz = ent.z;
  const r = moveBox(world, _box, _vel, dt, _opts);
  ent.x = (_box.minX + _box.maxX) * 0.5;
  ent.y = _box.minY;
  ent.z = (_box.minZ + _box.maxZ) * 0.5;
  ent.vx = _vel.x;
  ent.vy = _vel.y;
  ent.vz = _vel.z;
  const wasGround = ent.onGround;
  ent.onGround = r.onGround;
  ent.impact = r.onGround && !wasGround ? r.impactVy : 0;
  ent.hitX = r.hitX;
  ent.hitZ = r.hitZ;
  const lava = r.inLiquid && liquidDamage(r.liquidId) > 0;
  const immune = lava && lavaImmune(def);
  ent.inLava = lava && !immune;
  ent.inWater = r.inLiquid && (!lava || immune); // bağışık yaratık lavda yüzer
  ent.headWater = r.headInLiquid && (!lava || immune);
  ent.contactDmg = r.damage;

  // sürüklenme: yataydaki gerçek ilerleme
  if (spd > 0.1 && (mv.dx !== 0 || mv.dz !== 0) && !ent.dead) {
    const mx = ent.x - px;
    const mz = ent.z - pz;
    const moved = Math.sqrt(mx * mx + mz * mz);
    if (moved < spd * dt * 0.25) ent.ai.stuckT += dt;
    else ent.ai.stuckT = ent.ai.stuckT > dt * 2 ? ent.ai.stuckT - dt * 2 : 0;
    // tıkandı + yerdeyse zıpla (1 blokluk basamak/engel)
    if (!free && ent.onGround && (r.hitX || r.hitZ) && ent.jumpCd <= 0 && ent.ai.canHop) {
      ent.vy = mv.jumpV;
      ent.onGround = false;
      ent.jumpCd = 0.5;
    }
  } else {
    ent.ai.stuckT = 0;
  }
  ent.speedNow = Math.sqrt(ent.vx * ent.vx + ent.vz * ent.vz);
}

/* ------------------------------------------------------------------------------------------------
 * Yönlendirme + yol
 * ---------------------------------------------------------------------------------------------- */
const _o = { hc: 2, canJump: true, maxDrop: 3, avoidWater: true, ignoreLava: false, maxNodes: 240, goalRadius: 1.4 };

export function pathOptions(ent, def, extra) {
  _o.hc = Math.max(1, Math.ceil(ent.h - 0.05));
  _o.canJump = !(extra && extra.noJump);
  _o.maxDrop = extra && extra.maxDrop !== undefined ? extra.maxDrop : 3;
  _o.avoidWater = !(extra && extra.swims);
  _o.ignoreLava = lavaImmune(def);
  _o.goalRadius = extra && extra.goalRadius !== undefined ? extra.goalRadius : 1.4;
  return _o;
}

/** Yol arama isteği (kare bütçesi + bekleme süresi). Bulunan nokta sayısı | 0. */
export function requestPath(em, ent, def, tx, ty, tz, extra) {
  const ai = ent.ai;
  if (ai.pathCd > 0 || em.pathBudget <= 0) return 0;
  em.pathBudget--;
  ai.pathCd = 1.1;
  if (!ai.path) ai.path = createPathBuffer();
  const o = pathOptions(ent, def, extra);
  const n = findPath(em.world, Math.floor(ent.x), Math.floor(ent.y + 0.05), Math.floor(ent.z), tx, ty, tz, o, ai.path);
  ai.pathOn = n > 0;
  ai.pathGx = tx;
  ai.pathGz = tz;
  ai.pathT = 0;
  return n;
}

/** Yol noktasını izler; bittiyse false. mv.dx/dz yazılır. */
export function followPath(ent) {
  const buf = ent.ai.path;
  if (!buf) return false;
  while (buf.i < buf.n) {
    const k = buf.i * 3;
    const dx = buf.pts[k] - ent.x;
    const dz = buf.pts[k + 2] - ent.z;
    const dy = buf.pts[k + 1] - ent.y;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.3 && Math.abs(dy) < 1.4) {
      buf.i++;
      continue;
    }
    const d = Math.sqrt(d2);
    ent.mv.dx = dx / d;
    ent.mv.dz = dz / d;
    ent.ai.canHop = buf.pts[k + 1] > ent.y + 0.45;
    return true;
  }
  return false;
}

export function clearPath(ent) {
  ent.ai.pathOn = false;
  if (ent.ai.path) {
    ent.ai.path.n = 0;
    ent.ai.path.i = 0;
  }
}

/**
 * Yürüyen varlığı (tx,tz) noktasına yönlendirir (kare başına çağrılır; ucuz). Sonda taraması ai.steerT aralığında.
 * Dönüş: yürüme sürüyorsa true, hedef (reach içinde) ise false.
 */
export function walkToward(em, ent, def, tx, tz, speed, dt, opts) {
  const ai = ent.ai;
  const mv = ent.mv;
  const reach = opts && opts.reach !== undefined ? opts.reach : 0.3;
  let dx = tx - ent.x;
  let dz = tz - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d <= reach) {
    stopMove(ent);
    clearPath(ent);
    return false;
  }
  dx /= d;
  dz /= d;
  // yol modu
  if (ai.pathOn) {
    ai.pathT += dt;
    const gx = ai.pathGx - tx;
    const gz = ai.pathGz - tz;
    if (ai.pathT > 6 || gx * gx + gz * gz > 9 || !followPath(ent)) {
      clearPath(ent);
    } else {
      mv.spd = speed;
      mv.jump = false;
      return true;
    }
  }
  ai.steerT -= dt;
  if (ai.steerT <= 0) {
    ai.steerT = 0.18;
    const k = steerDirection(em.world, ent, def, dx, dz, opts);
    if (k < 0) {
      ai.steerA = 0;
      ai.blocked = true;
    } else {
      ai.steerA = STEER_ANGLES[k];
      ai.blocked = false;
    }
    ai.sk = k;
    ai.canHop = k >= 0 && mv.jump;
    // 70° üstü sapma: doğrudan yol tıkalı → A* dene
    if (k < 0 || k >= 3) requestPath(em, ent, def, tx, ent.y, tz, opts);
  }
  if (ai.blocked) {
    stopMove(ent);
    mv.spd = 0;
    if (ai.pathCd <= 0) {
      const n = requestPath(em, ent, def, tx, ent.y, tz, opts);
      if (n === 0) ai.side = -(ai.side || 1);
    }
    return true;
  }
  const c = Math.cos(ai.steerA);
  const s = Math.sin(ai.steerA);
  mv.dx = dx * c - dz * s;
  mv.dz = dx * s + dz * c;
  mv.spd = speed;
  mv.jump = false;
  // ilerleme gözcüsü: 1 sn'de hedefe yaklaşamadıysa yol ara
  ai.progT += dt;
  if (ai.progT >= 1) {
    const gained = ai.progD - d;
    ai.progD = d;
    ai.progT = 0;
    if (gained < speed * 0.2 && d > 2.5 && ai.pathCd <= 0) requestPath(em, ent, def, tx, ent.y, tz, opts);
  }
  // tıkandıysa yol ara
  if (ai.stuckT > 0.7 && ai.pathCd <= 0) {
    const n = requestPath(em, ent, def, tx, ent.y, tz, opts);
    if (n === 0) ai.side = -(ai.side || 1);
    ai.stuckT = 0.3;
  }
  return true;
}

/** Kısa yardımcı: hedefe doğru bakış açısı farkı (rad). */
export function yawErrorTo(ent, tx, tz) {
  return angleDiff(ent.yaw, yawFromDir(tx - ent.x, tz - ent.z));
}
