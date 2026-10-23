/*
 * KEŞİF sim — boss betikleri B: BUZ KRAL (bölge 3) ve GÖLGE HÜKÜMDAR (bölge 4). Saf.
 *
 * BUZ KRAL: mızrak yağmuru (yerde çizgi işareti → mızraklar), zıplama-ezme (iniş noktası işaretli, yerde donma bölgesi),
 *   tipi (yavaşlatan don bölgeleri + parçacık yavrular). Gezinirken oyuncunun etrafında daire çizer.
 * GÖLGE HÜKÜMDAR: ışın süpürmesi (engellerle gölgelenebilir, zıplanabilir alçak ışın), ışınlanma (varış noktası işaretli),
 *   gölge yavrular çağırma, GÖLGE KLONLAR (biri gerçek; klonlar saydam "ghost", tek vuruşta dağılır, zayıf ışın atar).
 *   FİNALE PORTAL KURALI (can ≤ %25): Hükümdar portalın içinde dokunulmazdır; yalnızca öbür portaldan ÇIKTIĞI an
 *   (işaretli, 4 sn) hasar alır ve o anda saldırmaz. Portal içindeyken yavru çağırır ve ışın süpürür.
 */
import { TAU, rnd, rndSign } from './mobAIUtil.js';
import { faceTo, stopMove, walkToward } from './mobAIMove.js';
import {
  WINDUP_SCALE, clampArena, groundY, hazard, minionCount, pickWeighted, summon,
} from './mobAIBossKit.js';

const _c = { x: 0, z: 0 };

function noRepeat(ent, items) {
  for (let i = 0; i < items.length; i++) if (items[i][0] === ent.ai.last) items[i][1] *= 0.25;
  return items;
}

/* ================================================================================================
 * BUZ KRAL
 * ============================================================================================ */
const SPEAR_SPEED = 20;
const LEAP_VY = 11;
const LEAP_AIR = (2 * LEAP_VY) / 28;

function spearVolley(em, ent, def, a, v, base) {
  const offs = a.offs;
  for (let i = 0; i < offs.length; i++) {
    const h = v.hs[i];
    const ang = base + offs[i];
    h.dx = Math.cos(ang);
    h.dz = Math.sin(ang);
    h.x = ent.x + h.dx * ent.w * 0.5;
    h.z = ent.z + h.dz * ent.w * 0.5;
  }
}

const buzkral = {
  roar: 'tipi',
  cd: [2.6, 2.0, 1.5],
  ws: WINDUP_SCALE,
  pick(em, ent, def, tg, ph) {
    const items = [
      ['mızrak', ph === 0 ? 55 : ph === 1 ? 35 : 30],
      ['zıplama', tg.dist2d > 4 ? (ph === 0 ? 35 : 32) : 8],
      ['tipi', ph >= 1 ? 35 : 0],
    ];
    return pickWeighted(em, ent, noRepeat(ent, items));
  },
  attacks: {
    mızrak: {
      visual: 'mızrak',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          a.W = 0.95 * ws;
          const n = ent.phase === 0 ? 3 : 5;
          a.offs = n === 3 ? [-0.3, 0, 0.3] : [-0.6, -0.3, 0, 0.3, 0.6];
          a.vol = [{ start: 0, W: a.W, made: false, fired: false, hs: [] }];
          if (ent.phase >= 2) a.vol.push({ start: a.W + 0.35, W: a.W * 0.8, made: false, fired: false, hs: [] });
          const last = a.vol[a.vol.length - 1];
          a.dur = last.start + last.W + 0.6;
        }
        for (let k = 0; k < a.vol.length; k++) {
          const v = a.vol[k];
          if (!v.made && a.t >= v.start) {
            v.made = true;
            for (let i = 0; i < a.offs.length; i++) {
              v.hs.push(hazard(em, ent, {
                shape: 'line', x: ent.x, z: ent.z, dx: 0, dz: -1, len: 22, width: 0.9, height: 1.2, windup: v.W, active: 0.12,
                dmg: 0, color: 0x9fdcff, cue: null,
              }));
            }
            spearVolley(em, ent, def, a, v, Math.atan2(tg.dz, tg.dx));
          }
          if (v.made && !v.fired) {
            if (a.t < v.start + v.W * 0.6) {
              spearVolley(em, ent, def, a, v, Math.atan2(tg.dz, tg.dx));
            } else if (a.t >= v.start + v.W) {
              v.fired = true;
              for (let i = 0; i < v.hs.length; i++) {
                const h = v.hs[i];
                em.fireProjectile('mizrak', h.x, ent.y + 1.3, h.z, h.dx, 0, h.dz, SPEAR_SPEED, ent, {
                  damage: def.damage * 0.85, gravity: 0, life: 1.7, effect: { kind: 'slow', t: 1.5, factor: 0.7 },
                });
              }
              em.emit({ type: 'fx', name: 'spear', id: ent.id, x: ent.x, y: ent.y + 1.3, z: ent.z });
            }
          }
        }
        return a.t >= a.dur;
      },
    },
    zıplama: {
      visual: 'zıplama',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        const LAUNCH = 0.3 * ws + 0.1;
        if (a.first) {
          a.keepMove = true;
          a.noFace = false;
          a.tx = tg.px;
          a.tz = tg.pz;
          a.air = false;
          a.landed = false;
          a.h = hazard(em, ent, {
            shape: 'circle', x: a.tx, z: a.tz, r: 4.2, windup: LAUNCH + LEAP_AIR, active: 0.3, dmg: def.damage * 1.1,
            color: 0x9fdcff, cue: 'slam',
          });
        }
        if (!a.air && a.t < LAUNCH) {
          clampArena(ent, tg.px, tg.pz, 4, _c);
          a.tx = _c.x;
          a.tz = _c.z;
          a.h.x = a.tx;
          a.h.z = a.tz;
          a.h.y = groundY(em, a.tx, a.tz, ent.y);
          stopMove(ent);
        } else if (!a.air) {
          a.air = true;
          ent.vx = (a.tx - ent.x) / LEAP_AIR;
          ent.vz = (a.tz - ent.z) / LEAP_AIR;
          ent.vy = LEAP_VY;
          ent.onGround = false;
          ent.hold = LEAP_AIR + 0.2;
          ent.mv.spd = 0;
          ent.state = 'leap';
          em.emit({ type: 'fx', name: 'leap', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
        } else if (!a.landed && ent.onGround && a.t > LAUNCH + 0.25) {
          a.landed = true;
          a.landT = a.t;
          stopMove(ent);
          ent.vx = 0;
          ent.vz = 0;
          em.emit({ type: 'fx', name: 'slam', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
          hazard(em, ent, {
            shape: 'zone', x: ent.x, z: ent.z, r: 3.4, windup: 0.5, active: 6, dmg: 1, tick: 1.0,
            effect: { kind: 'slow', t: 1.2, factor: 0.5 }, color: 0x9fdcff, cue: 'frost',
          });
        }
        if (a.landed) return a.t >= a.landT + 0.55;
        return a.t > LAUNCH + LEAP_AIR + 1.5;
      },
    },
    tipi: {
      visual: 'tipi',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          a.W = 1.0 * ws;
          a.dur = a.W + 0.7;
          const n = ent.phase >= 2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const ang = rnd(em, ent) * TAU;
            const rad = i === 0 ? 1.5 : 2 + rnd(em, ent) * 6;
            clampArena(ent, tg.px + Math.cos(ang) * rad, tg.pz + Math.sin(ang) * rad, 2.5, _c);
            hazard(em, ent, {
              shape: 'zone', x: _c.x, z: _c.z, r: 3.2, windup: 0.9, active: 8, dmg: 1, tick: 1.0,
              effect: { kind: 'slow', t: 1.2, factor: 0.5 }, color: 0x9fdcff, cue: 'frost',
            });
          }
        }
        if (!a.spawned && a.t >= a.W * 0.6) {
          a.spawned = true;
          const k = ent.phase >= 2 ? 3 : 2;
          for (let i = 0; i < k && minionCount(em, ent) < 3; i++) {
            const ang = rnd(em, ent) * TAU;
            summon(em, ent, 'buzhortlagi', ent.x + Math.cos(ang) * 4, ent.z + Math.sin(ang) * 4, {
              skin: 'kristal', hpScale: 0.5,
            });
          }
          em.emit({ type: 'fx', name: 'summon', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
        }
        return a.t >= a.dur;
      },
    },
  },
  move(em, ent, def, dt, ctx, tg, ph) {
    const ai = ent.ai;
    ent.state = 'strafe';
    if (!tg.active) {
      stopMove(ent);
      return;
    }
    faceTo(ent, tg.px, tg.pz, dt, 3);
    if (ai.sa === undefined) ai.sa = 0;
    if (ai.sdir === undefined) ai.sdir = 1;
    ai.sa += dt * 0.35 * ai.sdir;
    // oyuncunun çevresinde daire (arenanın içinde)
    const rad = 8.5;
    const a0 = Math.atan2(ent.z - tg.pz, ent.x - tg.px);
    clampArena(ent, tg.px + Math.cos(a0 + 0.5 * ai.sdir) * rad, tg.pz + Math.sin(a0 + 0.5 * ai.sdir) * rad, 3, _c);
    walkToward(em, ent, def, _c.x, _c.z, def.walkSpeed * (1.3 + ph * 0.25), dt, { reach: 1.2, noJump: false });
    if (ai.sa > 6) {
      ai.sa = 0;
      ai.sdir = -ai.sdir;
    }
  },
  damageMul() {
    return 1;
  },
};

/* ================================================================================================
 * GÖLGE HÜKÜMDAR
 * ============================================================================================ */
const HOVER = 1.3;

/** Havada süzülme: zeminin HOVER üstünde tut. */
function hoverFix(em, ent) {
  const gy = groundY(em, ent.x, ent.z, ent.y);
  const ty = gy + HOVER;
  let v = (ty - ent.y) * 5;
  if (v > 4) v = 4;
  else if (v < -4) v = -4;
  ent.vy = v;
  ent.mv.gravity = 0;
}

function drift(ent, tx, tz, speed) {
  let dx = tx - ent.x;
  let dz = tz - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const mv = ent.mv;
  if (d < 0.4) {
    mv.dx = 0; mv.dz = 0; mv.spd = 0;
    return;
  }
  dx /= d;
  dz /= d;
  mv.dx = dx; mv.dz = dz; mv.spd = Math.min(speed, d * 2.5 + 1);
  mv.accel = 7;
}

function aliveClones(em, ent) {
  return em.cloneCount(ent.id);
}

function makeBeam(em, ent, def, x, z, base, sign, arc, vel, W, dmg, len) {
  const start = base - sign * arc * 0.5;
  return hazard(em, ent, {
    shape: 'beam', x, z, y: groundY(em, x, z, ent.y), angle: start, angVel: sign * vel, arc0: start, arc1: start + sign * arc,
    len, width: 1.0, height: 0.9, windup: W, active: arc / vel, dmg, tick: 0.3, cause: 'ışın', color: 0x9b4dff, cue: 'beam',
  });
}

function pickDest(em, ent, tg, rmin, rmax) {
  const ang = rnd(em, ent) * TAU;
  const rad = rmin + rnd(em, ent) * (rmax - rmin);
  clampArena(ent, tg.px + Math.cos(ang) * rad, tg.pz + Math.sin(ang) * rad, 3, _c);
  return _c;
}

const golgehukumdar = {
  roar: 'çağır',
  cd: [2.5, 1.9, 1.5],
  ws: WINDUP_SCALE,
  pick(em, ent, def, tg, ph) {
    const clones = aliveClones(em, ent);
    const items = [
      ['ışın', ph === 0 ? 45 : 32],
      ['ışınlan', ph === 0 ? 30 : 25],
      ['çağır', minionCount(em, ent) < 2 ? (ph === 0 ? 25 : 20) : 0],
      ['klon', ph >= 1 && clones === 0 ? 30 : 0],
    ];
    return pickWeighted(em, ent, noRepeat(ent, items));
  },
  attacks: {
    ışın: {
      visual: 'ışın',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          a.W = 1.0 * ws;
          const sign = rndSign(em, ent);
          const arc = 1.5;
          const vel = [0.6, 0.75, 0.9][ent.phase];
          a.sign = sign;
          a.arc = arc;
          a.lock = a.W * 0.55;
          a.hs = [makeBeam(em, ent, def, ent.x, ent.z, Math.atan2(tg.dz, tg.dx), sign, arc, vel, a.W, def.damage * 0.55, 18)];
          if (ent.phase >= 2) {
            a.hs.push(makeBeam(em, ent, def, ent.x, ent.z, Math.atan2(tg.dz, tg.dx), -sign, arc, vel, a.W, def.damage * 0.55, 18));
          }
          a.dur = a.W + arc / vel + 0.4;
        }
        for (let i = 0; i < a.hs.length; i++) {
          const h = a.hs[i];
          h.x = ent.x;
          h.z = ent.z;
          if (a.t < a.lock) {
            const sg = i === 0 ? a.sign : -a.sign;
            const base = Math.atan2(tg.dz, tg.dx);
            h.angle = base - sg * a.arc * 0.5;
            h.arc0 = h.angle;
            h.arc1 = h.angle + sg * a.arc;
          }
        }
        return a.t >= a.dur;
      },
    },
    ışınlan: {
      visual: 'ışınlan',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        const W = 0.85 * ws;
        if (a.first) {
          const d = pickDest(em, ent, tg, 8, 12);
          a.dx = d.x;
          a.dz = d.z;
          a.dy = groundY(em, a.dx, a.dz, ent.y) + HOVER;
          a.exposeAfter = 0;
          a.cdOverride = ent.phase >= 1 ? 0.4 : undefined;
          hazard(em, ent, {
            shape: 'circle', x: a.dx, z: a.dz, r: 1.8, windup: W, active: 0.05, dmg: 0, color: 0xb980ff, cue: null,
          });
          hazard(em, ent, {
            shape: 'circle', x: ent.x, z: ent.z, r: 1.5, windup: W * 0.5, active: 0.05, dmg: 0, color: 0xb980ff, cue: null,
          });
        }
        if (!a.gone && a.t >= W * 0.5) {
          a.gone = true;
          ent.hidden = true;
          em.emit({ type: 'fx', name: 'teleport', id: ent.id, x: ent.x, y: ent.y + 2, z: ent.z });
        }
        if (!a.arrived && a.t >= W) {
          a.arrived = true;
          ent.x = a.dx;
          ent.z = a.dz;
          ent.y = a.dy;
          ent.vx = 0; ent.vy = 0; ent.vz = 0;
          ent.hidden = false;
          em.emit({ type: 'fx', name: 'teleport', id: ent.id, x: ent.x, y: ent.y + 2, z: ent.z });
        }
        if (a.arrived) {
          hoverFix(em, ent);
          return a.t >= W + 0.5;
        }
        return false;
      },
    },
    çağır: {
      visual: 'çağır',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          a.W = 1.0 * ws;
          a.dur = a.W + 0.6;
          const n = [2, 2, 3][ent.phase];
          a.pts = [];
          for (let i = 0; i < n; i++) {
            const ang = rnd(em, ent) * TAU;
            const rad = 3.5 + rnd(em, ent) * 2.5;
            clampArena(ent, ent.x + Math.cos(ang) * rad, ent.z + Math.sin(ang) * rad, 2, _c);
            a.pts.push(_c.x, _c.z);
            hazard(em, ent, {
              shape: 'circle', x: _c.x, z: _c.z, r: 1.4, windup: a.W, active: 0.05, dmg: 0, color: 0xb980ff, cue: null,
            });
          }
        }
        if (!a.spawned && a.t >= a.W) {
          a.spawned = true;
          for (let i = 0; i < a.pts.length / 2 && minionCount(em, ent) < 4; i++) {
            summon(em, ent, i % 2 === 0 ? 'golge' : 'tasyarasasi', a.pts[i * 2], a.pts[i * 2 + 1], { skin: 'gölge', hpScale: 0.6 });
          }
          em.emit({ type: 'fx', name: 'summon', id: ent.id, x: ent.x, y: ent.y + 2, z: ent.z });
        }
        return a.t >= a.dur;
      },
    },
    klon: {
      visual: 'çağır',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          a.W = 1.1 * ws;
          a.dur = a.W + 0.6;
          const n = ent.phase >= 2 ? 3 : 2;
          a.pts = [];
          for (let i = 0; i < n; i++) {
            const d = pickDest(em, ent, tg, 7, 11);
            a.pts.push(d.x, d.z);
            hazard(em, ent, {
              shape: 'circle', x: d.x, z: d.z, r: 1.2, windup: a.W, active: 0.05, dmg: 0, color: 0xb980ff, cue: null,
            });
          }
        }
        if (!a.spawned && a.t >= a.W) {
          a.spawned = true;
          for (let i = 0; i < a.pts.length / 2; i++) {
            const x = a.pts[i * 2];
            const z = a.pts[i * 2 + 1];
            em.spawn('golgehukumdar', x, groundY(em, x, z, ent.y) + HOVER, z, {
              owner: ent.id, minion: true, clone: true, ghost: true, hp: 1, arena: ent.arena, skin: 'klon',
            });
          }
          em.emit({ type: 'fx', name: 'clones', id: ent.id, x: ent.x, y: ent.y + 2, z: ent.z });
        }
        return a.t >= a.dur;
      },
    },
  },
  move(em, ent, def, dt, ctx, tg, ph) {
    ent.state = 'strafe';
    hoverFix(em, ent);
    if (!tg.active) {
      stopMove(ent);
      return;
    }
    faceTo(ent, tg.px, tg.pz, dt, 3.5);
    const ai = ent.ai;
    if (ai.sdir === undefined) ai.sdir = 1;
    const rad = 9.5;
    const a0 = Math.atan2(ent.z - tg.pz, ent.x - tg.px);
    clampArena(ent, tg.px + Math.cos(a0 + 0.45 * ai.sdir) * rad, tg.pz + Math.sin(a0 + 0.45 * ai.sdir) * rad, 3, _c);
    drift(ent, _c.x, _c.z, def.walkSpeed * (1.5 + ph * 0.3));
  },
  tick(em, ent, def, dt, ctx, tg, ph) {
    const ai = ent.ai;
    const finale = ph >= 2 && ent.hp / ent.maxHp <= 0.25;
    if (!finale && !ai.fin) return false;
    if (!ai.fin) {
      // finale'ye giriş: portallar kurulur
      em.clearHazards(ent);
      em.removeMinions(ent.id);
      ai.atk = null;
      ent.attacking = false;
      const ang = rnd(em, ent) * TAU;
      const r = ent.arena.r * 0.6;
      ai.portals = [
        { x: ent.arena.x + Math.cos(ang) * r, z: ent.arena.z + Math.sin(ang) * r },
        { x: ent.arena.x - Math.cos(ang) * r, z: ent.arena.z - Math.sin(ang) * r },
      ];
      ai.fin = { stage: 'hide', t: 0, side: 0, summoned: false, beam: false, init: false };
      em.emit({ type: 'bossFinale', id: ent.id, boss: ent.key, portals: ai.portals });
    }
    const f = ai.fin;
    f.t += dt;
    stopMove(ent);
    const P = ai.portals;
    if (f.stage === 'hide') {
      const p = P[f.side];
      if (!f.init) {
        f.init = true;
        ent.hidden = true;
        ent.exposed = false;
        ent.weak = false;
        ent.x = p.x;
        ent.z = p.z;
        ent.y = groundY(em, p.x, p.z, ent.y) + HOVER;
        ent.vx = 0; ent.vy = 0; ent.vz = 0;
        ent.state = 'blink';
        em.emit({ type: 'fx', name: 'teleport', id: ent.id, x: ent.x, y: ent.y + 2, z: ent.z });
        em.clearHazardShape(ent, 'portal');
        hazard(em, ent, { shape: 'portal', x: P[0].x, z: P[0].z, r: 1.8, windup: 0, active: 999, dmg: 0, color: 0x4d7cff });
        hazard(em, ent, { shape: 'portal', x: P[1].x, z: P[1].z, r: 1.8, windup: 0, active: 999, dmg: 0, color: 0xff9a3a });
      }
      ent.hidden = true;
      if (!f.summoned && f.t >= 0.6) {
        f.summoned = true;
        for (let i = 0; i < 2 && minionCount(em, ent) < 3; i++) {
          const d = pickDest(em, ent, tg, 6, 10);
          summon(em, ent, i === 0 ? 'golge' : 'tasyarasasi', d.x, d.z, { skin: 'gölge', hpScale: 0.6 });
        }
      }
      if (!f.beam && f.t >= 1.4 && tg.active) {
        f.beam = true;
        const sign = rndSign(em, ent);
        makeBeam(em, ent, def, p.x, p.z, Math.atan2(tg.pz - p.z, tg.px - p.x), sign, 1.5, 0.7, 1.0, def.damage * 0.5, 20);
      }
      if (f.t >= 4.2) {
        f.stage = 'warn';
        f.t = 0;
        const q = P[1 - f.side];
        hazard(em, ent, {
          shape: 'circle', x: q.x, z: q.z, r: 2.2, windup: 1.0, active: 0.05, dmg: 0, color: 0xffffff, cue: null,
        });
      }
    } else if (f.stage === 'warn') {
      ent.hidden = true;
      if (f.t >= 1.0) {
        const q = P[1 - f.side];
        f.stage = 'emerge';
        f.t = 0;
        ent.x = q.x;
        ent.z = q.z;
        ent.y = groundY(em, q.x, q.z, ent.y) + HOVER;
        ent.hidden = false;
        ent.exposed = true;
        ent.weak = true;
        ent.state = 'exposed';
        ent.attacking = 'ışınlan';
        em.emit({ type: 'fx', name: 'teleport', id: ent.id, x: ent.x, y: ent.y + 2, z: ent.z });
      }
    } else {
      // emerge: dokunulabilir, saldırmaz
      ent.hidden = false;
      ent.exposed = true;
      ent.weak = true;
      ent.state = 'exposed';
      hoverFix(em, ent);
      if (tg.active) faceTo(ent, tg.px, tg.pz, dt, 3);
      if (f.t >= 4.0) {
        ent.exposed = false;
        ent.weak = false;
        ent.attacking = false;
        f.side = 1 - f.side;
        f.stage = 'hide';
        f.t = 0;
        f.init = false;
        f.summoned = false;
        f.beam = false;
      }
    }
    return true;
  },
  damageMul(em, ent) {
    if (ent.ai.fin) return ent.exposed ? 1.6 : 0;
    return 1;
  },
  onReset(em, ent) {
    ent.ai.fin = null;
    ent.hidden = false;
  },
};

/* ------------------------------------------------------------------------------------------------
 * Gölge klon: saydam (ghost), tek vuruşta dağılır; arada zayıf ışın süpürür; 16 sn sonra kaybolur.
 * ------------------------------------------------------------------------------------------------ */
export function cloneAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  ent.ghost = true;
  ent.state = 'hover';
  hoverFix(em, ent);
  ai.life = ai.life === undefined || ai.life === 0 ? 16 : ai.life;
  ai.life -= dt;
  if (ai.life <= 0) {
    em.dismiss(ent, 'cloneFade');
    return;
  }
  if (!tg.active) {
    stopMove(ent);
    return;
  }
  faceTo(ent, tg.px, tg.pz, dt, 3.5);
  ai.t -= dt;
  const a0 = Math.atan2(ent.z - tg.pz, ent.x - tg.px);
  clampArena(ent, tg.px + Math.cos(a0 + 0.4) * 9, tg.pz + Math.sin(a0 + 0.4) * 9, 3, _c);
  drift(ent, _c.x, _c.z, 2.2);
  if (ai.t <= 0) {
    ai.t = 5 + ((ent.id * 3) % 4);
    ent.attacking = 'ışın';
    const sign = ent.id % 2 === 0 ? 1 : -1;
    makeBeam(em, ent, def, ent.x, ent.z, Math.atan2(tg.dz, tg.dx), sign, 1.2, 0.7, 1.3, def.damage * 0.3, 14);
    ai.keepAtk = 1.5;
  }
  if (ai.keepAtk > 0) {
    ai.keepAtk -= dt;
    if (ai.keepAtk <= 0) ent.attacking = false;
  }
}

export const BOSS_SCRIPTS_B = Object.freeze({ buzkral, golgehukumdar });
