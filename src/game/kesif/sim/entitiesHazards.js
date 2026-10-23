/*
 * KEŞİF sim — tehlikeler (saf): yerde telegraflı hasar alanları. Boss saldırıları ve Kum Akrebi çıkış işareti bunları kullanır.
 *
 * Bir tehlike önce 'windup' (işaret görünür, hasar YOK), sonra 'active' (hasar), sonra 'done' evresinden geçer.
 * Render/ses işaretleri tehlikeyi sahibinin ent.fx dizisinden (yoksa em.hazards) okur:
 *   {id, kind:'marker', shape, stage, t, windup, progress(0..1 hazırlık), x,y,z, r, rIn, rMax, dx,dz, len, width, height,
 *    angle, arc0, arc1, color, ownerId}
 * Şekiller:
 *   circle  yerde daire (r)            ring  genişleyen halka (r → rMax, speed; yalnızca ZEMİNDEKİ oyuncuya, zıplayarak aşılır)
 *   line    dikdörtgen (dx,dz,len,width)   beam  dönen ışın (angle, angVel, len; blok engeller; alçak = zıplanabilir)
 *   zone    kalıcı alan (tick aralığıyla hasar/yavaşlatma)   rune / portal   yalnızca işaret (hasar yok)
 * Alan: spec {shape,x,y,z,r,rMax,speed,thick,dx,dz,len,width,height,angle,angVel,arc0,arc1,windup,active,dmg,tick,once,effect,
 *             cause,color,cue}. cue: etkinleşirken yayılan 'fx' olayının adı ('slam','root','vine','beam',…).
 */
import { raycastBlocks } from './raycast.js';

const DEFAULT_HEIGHT = { circle: 2.2, ring: 0.9, line: 1.6, beam: 0.9, zone: 2.0, rune: 1, portal: 2 };
const _o = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0, z: 0 };

export function createHazard(id, spec, owner) {
  const shape = spec.shape || 'circle';
  const persistent = shape === 'zone' || shape === 'beam';
  return {
    id,
    kind: 'marker',
    shape,
    stage: 'windup',
    x: spec.x,
    y: spec.y,
    z: spec.z,
    r: spec.r === undefined ? 1.5 : spec.r,
    rIn: spec.r === undefined ? 1.5 : spec.r,
    rMax: spec.rMax === undefined ? 0 : spec.rMax,
    speed: spec.speed === undefined ? 8 : spec.speed,
    thick: spec.thick === undefined ? 1.2 : spec.thick,
    dx: spec.dx === undefined ? 0 : spec.dx,
    dz: spec.dz === undefined ? -1 : spec.dz,
    len: spec.len === undefined ? 8 : spec.len,
    effLen: spec.len === undefined ? 8 : spec.len,
    width: spec.width === undefined ? 1.2 : spec.width,
    height: spec.height === undefined ? DEFAULT_HEIGHT[shape] : spec.height,
    angle: spec.angle || 0,
    angVel: spec.angVel || 0,
    arc0: spec.arc0 === undefined ? (spec.angle || 0) : spec.arc0,
    arc1: spec.arc1 === undefined ? (spec.angle || 0) : spec.arc1,
    windup: spec.windup === undefined ? 1 : spec.windup,
    active: spec.active === undefined ? 0.3 : spec.active,
    t: 0,
    progress: 0,
    dmg: spec.dmg || 0,
    tick: spec.tick === undefined ? 0.4 : spec.tick,
    nextTick: 0,
    once: spec.once === undefined ? !persistent : spec.once,
    hit: false,
    grace: spec.grace === undefined ? (shape === 'ring' ? 0.12 : 0) : spec.grace,
    effect: spec.effect || null,
    cause: spec.cause || 'yaratık',
    color: spec.color === undefined ? 0xff5a3a : spec.color,
    cue: spec.cue === undefined ? null : spec.cue,
    ownerId: owner ? owner.id : 0,
    owner: owner || null,
  };
}

/** Oyuncu bu tehlikenin hasar hacminde mi? (p: {x,y,z,w,h}) */
export function hazardHits(h, p) {
  const pw = (p.w || 0.6) * 0.5;
  if (p.y + p.h <= h.y - 0.4) return false;
  switch (h.shape) {
    case 'circle':
    case 'zone': {
      if (p.y >= h.y + h.height) return false;
      const dx = p.x - h.x;
      const dz = p.z - h.z;
      const rr = h.r + pw;
      return dx * dx + dz * dz < rr * rr;
    }
    case 'ring': {
      // yerdeki oyuncu vurulur; halkanın üstüne zıplayan (ayak > yükseklik) kurtulur
      if (p.y + 0.02 >= h.y + h.height) return false;
      const dx = p.x - h.x;
      const dz = p.z - h.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      return Math.abs(d - h.r) < h.thick * 0.5 + pw;
    }
    case 'line':
    case 'beam': {
      if (p.y >= h.y + h.height) return false;
      const rx = p.x - h.x;
      const rz = p.z - h.z;
      const L = h.shape === 'beam' ? h.effLen : h.len;
      const s = rx * h.dx + rz * h.dz;
      if (s < -pw || s > L + pw) return false;
      const perp = Math.abs(rx * -h.dz + rz * h.dx);
      return perp < h.width * 0.5 + pw;
    }
    default:
      return false;
  }
}

function applyHit(em, h) {
  if (h.dmg > 0) {
    em.hurtPlayer(h.owner, h.dmg, {
      cause: h.cause, fromX: h.x, fromZ: h.z, kStrength: h.shape === 'zone' ? 0 : 7, effect: h.effect, source: h.ownerId,
    });
  } else if (h.effect) {
    em.emit({ type: 'playerEffect', effect: h.effect.kind, t: h.effect.t, factor: h.effect.factor, source: h.ownerId });
  }
}

/** Işının blok engelli etkin uzunluğu. */
function beamLength(em, h) {
  _o.x = h.x;
  _o.y = h.y + 0.6;
  _o.z = h.z;
  _d.x = h.dx;
  _d.y = 0;
  _d.z = h.dz;
  const hit = raycastBlocks(em.world, _o, _d, h.len, null);
  return hit ? Math.max(0.5, hit.t) : h.len;
}

/** Bir tehlikeyi ilerletir; bittiyse true. */
function stepHazard(em, h, dt, p) {
  h.t += dt;
  if (h.stage === 'windup') {
    h.progress = h.windup > 0 ? Math.min(1, h.t / h.windup) : 1;
    if (h.shape === 'beam') {
      h.dx = Math.cos(h.angle);
      h.dz = Math.sin(h.angle);
      h.effLen = h.len;
    }
    if (h.t < h.windup) return false;
    h.stage = 'active';
    h.t = 0;
    h.progress = 1;
    h.nextTick = 0;
    if (h.cue) em.emit({ type: 'fx', name: h.cue, x: h.x, y: h.y, z: h.z, r: h.r, shape: h.shape, id: h.ownerId });
  }
  // aktif evre
  if (h.shape === 'ring') {
    h.r += h.speed * dt;
    if (h.r >= h.rMax) return true;
  } else if (h.t >= h.active) {
    // son bir kez dene (tek seferlikler etkinleşme karesinde zaten denendi)
    return true;
  }
  if (h.shape === 'beam') {
    h.angle += h.angVel * dt;
    h.dx = Math.cos(h.angle);
    h.dz = Math.sin(h.angle);
    h.effLen = beamLength(em, h);
  }
  if (h.shape === 'rune' || h.shape === 'portal' || !p || p.dead) return false;
  if (h.t < h.grace) return false; // etkinleşme anında kısa tepki payı
  if (h.once) {
    if (!h.hit && hazardHits(h, p)) {
      h.hit = true;
      applyHit(em, h);
    }
  } else {
    h.nextTick -= dt;
    if (h.nextTick <= 0 && hazardHits(h, p)) {
      h.nextTick = h.tick;
      applyHit(em, h);
    }
  }
  return false;
}

/** Tüm tehlikeleri ilerletir; biten tehlikeler hem em.hazards'tan hem sahibin fx'inden çıkar. */
export function updateHazards(em, dt, p) {
  const list = em.hazards;
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    // sahibi öldü/silindi ise tehlike de biter
    if (h.owner && (h.owner.removed || h.owner.dead) && h.shape !== 'zone') {
      removeHazard(em, i);
      continue;
    }
    if (stepHazard(em, h, dt, p)) {
      h.stage = 'done';
      removeHazard(em, i);
    }
  }
}

export function removeHazard(em, index) {
  const list = em.hazards;
  const h = list[index];
  list.splice(index, 1);
  if (h.owner) {
    const fx = h.owner.fx;
    const k = fx.indexOf(h);
    if (k >= 0) fx.splice(k, 1);
  }
  h.stage = 'done';
}

