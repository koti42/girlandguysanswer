/*
 * KEŞİF sim — boss betikleri A: KÖK ANA (bölge 1) ve TAŞ BEKÇİ (bölge 2). Saf.
 *
 * KÖK ANA (3 aşama): kökler (yerde işaretli patlayan kökler, ritimli), sarmaşık kamçısı (yelpaze), ezme (daire + zıplanabilir
 *   halka), sporlar (yavaşlatan bulut + tomurcuk yavrular). Aşama 3: öfke — yavaşça kovalar.
 * TAŞ BEKÇİ (3 aşama): şok (zıplanarak aşılan şok halkaları, ardından 2,4 sn rün zayıf anı), kaya fırlatma (iniş noktası
 *   işaretli), yumruk (koni), ezme; ayrıca periyodik "rün pencereleri": zırhlıyken hasar ×0,45, rünler yanarken ×2,5.
 */
import { TAU, rnd } from './mobAIUtil.js';
import { faceTo, stopMove, walkToward } from './mobAIMove.js';
import {
  WINDUP_SCALE, clampArena, groundY, hazard, minionCount, pickWeighted, summon,
} from './mobAIBossKit.js';

const _c = { x: 0, z: 0 };

function noRepeat(ent, items) {
  for (let i = 0; i < items.length; i++) if (items[i][0] === ent.ai.last) items[i][1] *= 0.25;
  return items;
}

/** Yer şok halkası + merkez daire (Kök Ana ezme ve Taş Bekçi şok/ezme ortak). */
function slamCombo(em, ent, def, radius, ringMax, windup, dmgCircle, dmgRing, delayRing) {
  const x = ent.x;
  const z = ent.z;
  const hs = [];
  hs.push(hazard(em, ent, {
    shape: 'circle', x, z, r: radius, windup, active: 0.28, dmg: dmgCircle, color: 0xd9a066, cue: 'slam',
  }));
  hs.push(hazard(em, ent, {
    shape: 'ring', x, z, r: radius, rMax: ringMax, speed: 8, thick: 1.3, height: 0.9, windup: windup + delayRing, dmg: dmgRing,
    color: 0xe8c27a, cue: null,
  }));
  return hs;
}

/* ================================================================================================
 * KÖK ANA
 * ============================================================================================ */
const kokana = {
  roar: 'sporlar',
  cd: [2.6, 2.0, 1.5],
  ws: WINDUP_SCALE,
  pick(em, ent, def, tg, ph) {
    const items = [
      ['kökler', ph === 0 ? 55 : 35],
      ['sarmaşık', (tg.dist2d < 12 ? 1 : 0.4) * (ph === 0 ? 45 : 30)],
      ['sporlar', ph >= 1 && minionCount(em, ent) < 3 ? 22 : 0],
      ['ezme', ph >= 1 && tg.dist2d < 9 ? (ph === 1 ? 18 : 32) : 0],
    ];
    return pickWeighted(em, ent, noRepeat(ent, items));
  },
  attacks: {
    kökler: {
      visual: 'sporlar',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          const n = [3, 5, 7][ent.phase];
          const W = 1.1 * ws;
          a.dur = W + (n - 1) * 0.14 + 0.55;
          for (let i = 0; i < n; i++) {
            let x = tg.px;
            let z = tg.pz;
            if (i > 0) {
              const ang = rnd(em, ent) * TAU;
              const rad = 1.8 + rnd(em, ent) * 3.4;
              x += Math.cos(ang) * rad;
              z += Math.sin(ang) * rad;
            }
            clampArena(ent, x, z, 1.5, _c);
            hazard(em, ent, {
              shape: 'circle', x: _c.x, z: _c.z, r: 1.5, windup: W + i * 0.14, active: 0.45, dmg: def.damage * 1.1,
              color: 0x7ccf3f, cue: 'root',
            });
          }
        }
        return a.t >= a.dur;
      },
    },
    sarmaşık: {
      visual: 'sarmaşık',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          const n = [1, 2, 3][ent.phase];
          a.W = 0.95 * ws;
          a.lock = a.W * 0.55;
          a.offs = n === 1 ? [0] : n === 2 ? [-0.3, 0.3] : [-0.5, 0, 0.5];
          a.hs = [];
          for (let i = 0; i < n; i++) {
            a.hs.push(hazard(em, ent, {
              shape: 'line', x: ent.x, z: ent.z, dx: 0, dz: -1, len: 9.5, width: 1.4, height: 1.6, windup: a.W, active: 0.22,
              dmg: def.damage, color: 0x57b83a, cue: 'vine',
            }));
          }
          a.dur = a.W + 0.5;
        }
        if (a.t < a.lock) {
          const base = Math.atan2(tg.dz, tg.dx);
          for (let i = 0; i < a.hs.length; i++) {
            const h = a.hs[i];
            const ang = base + a.offs[i];
            h.dx = Math.cos(ang);
            h.dz = Math.sin(ang);
            h.x = ent.x + h.dx * ent.w * 0.5;
            h.z = ent.z + h.dz * ent.w * 0.5;
          }
        }
        return a.t >= a.dur;
      },
    },
    ezme: {
      visual: 'ezme',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          const W = 1.15 * ws;
          slamCombo(em, ent, def, 5, 12.5, W, def.damage * 1.2, def.damage * 0.8, 0.1);
          a.dur = W + 1.9;
        }
        return a.t >= a.dur;
      },
    },
    sporlar: {
      visual: 'sporlar',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          a.W = 1.0 * ws;
          a.dur = a.W + 0.6;
          for (let i = 0; i < 3; i++) {
            const ang = rnd(em, ent) * TAU;
            const rad = 1 + rnd(em, ent) * 4.5;
            clampArena(ent, tg.px + Math.cos(ang) * rad, tg.pz + Math.sin(ang) * rad, 2, _c);
            hazard(em, ent, {
              shape: 'zone', x: _c.x, z: _c.z, r: 2.8, windup: 0.9, active: 7, dmg: 1, tick: 0.8,
              effect: { kind: 'slow', t: 1.2, factor: 0.6 }, color: 0xb5e04a, cue: 'spore',
            });
          }
        }
        if (!a.spawned && a.t >= a.W * 0.55) {
          a.spawned = true;
          for (let i = 0; i < 2 && minionCount(em, ent) < 3; i++) {
            const ang = rnd(em, ent) * TAU;
            summon(em, ent, 'kristalbocegi', ent.x + Math.cos(ang) * 4.5, ent.z + Math.sin(ang) * 4.5, {
              skin: 'tomurcuk', hpScale: 0.35,
            });
          }
          em.emit({ type: 'fx', name: 'summon', id: ent.id, x: ent.x, y: ent.y, z: ent.z });
        }
        return a.t >= a.dur;
      },
    },
  },
  move(em, ent, def, dt, ctx, tg, ph) {
    ent.state = 'chase';
    if (!tg.active) {
      stopMove(ent);
      return;
    }
    faceTo(ent, tg.px, tg.pz, dt, ph >= 2 ? 2 : 1.3);
    if (ph >= 2 && tg.dist2d > 7.5) {
      walkToward(em, ent, def, tg.px, tg.pz, def.walkSpeed * 1.8, dt, { reach: 6, noJump: true });
    } else {
      stopMove(ent);
    }
  },
  onPhase(em, ent, def, ph) {
    ent.enraged = ph >= 2;
  },
  onReset(em, ent) {
    ent.enraged = false;
  },
  damageMul() {
    return 1;
  },
};

/* ================================================================================================
 * TAŞ BEKÇİ
 * ============================================================================================ */
const ROCK_G = 22;
const ROCK_T = 1.05;

function openRunes(em, ent, secs) {
  const ai = ent.ai;
  ai.exposed = secs;
  em.clearHazardShape(ent, 'rune');
  hazard(em, ent, {
    shape: 'rune', x: ent.x, y: ent.y + ent.h * 0.55, z: ent.z, r: 1.4, windup: 0, active: secs, dmg: 0, color: 0x4de0ff,
  });
  em.emit({ type: 'fx', name: 'runes', id: ent.id, x: ent.x, y: ent.y + ent.h * 0.55, z: ent.z });
}

const tasbekci = {
  roar: 'ezme',
  cd: [2.8, 2.1, 1.6],
  ws: WINDUP_SCALE,
  pick(em, ent, def, tg, ph) {
    const near = tg.dist2d < 8;
    const items = [
      ['şok', ph === 0 ? 45 : ph === 1 ? 30 : 25],
      ['kaya', ph === 0 ? 35 : ph === 1 ? 25 : 20],
      ['yumruk', near ? 22 : 0],
      ['ezme', ph >= 1 && tg.dist2d < 10 ? (ph === 1 ? 25 : 35) : 0],
    ];
    return pickWeighted(em, ent, noRepeat(ent, items));
  },
  attacks: {
    şok: {
      visual: 'şok',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          const W = 1.0 * ws;
          slamCombo(em, ent, def, 3.2, 17, W, def.damage * 0.9, def.damage, 0);
          let last = W;
          if (ent.phase >= 1) {
            hazard(em, ent, {
              shape: 'ring', x: ent.x, z: ent.z, r: 3.2, rMax: 17, speed: 8, thick: 1.3, height: 0.9, windup: W + 0.85,
              dmg: def.damage, color: 0xe8c27a, cue: null,
            });
            last = W + 0.85;
          }
          a.dur = last + (17 - 3.2) / 8 + 0.2;
          a.exposeAfter = 2.4;
        }
        return a.t >= a.dur;
      },
    },
    kaya: {
      visual: 'yumruk',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          a.W = 0.9 * ws;
          a.count = [1, 2, 3][ent.phase];
          a.dur = a.W + (a.count - 1) * 0.55 + 1.3;
        }
        if (a.n < a.count && a.t >= a.W + a.n * 0.55) {
          a.n++;
          const p = em.player;
          const lead = ROCK_T * 0.6;
          let tx = tg.px + (p.vx || 0) * lead;
          let tz = tg.pz + (p.vz || 0) * lead;
          clampArena(ent, tx, tz, 1, _c);
          tx = _c.x;
          tz = _c.z;
          const ty = groundY(em, tx, tz, ent.y);
          const ox = ent.x;
          const oy = ent.y + ent.h * 0.82;
          const oz = ent.z;
          const vx = (tx - ox) / ROCK_T;
          const vz = (tz - oz) / ROCK_T;
          const vy = (ty + 0.4 - oy + 0.5 * ROCK_G * ROCK_T * ROCK_T) / ROCK_T;
          const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
          hazard(em, ent, {
            shape: 'circle', x: tx, y: ty, z: tz, r: 2.4, windup: ROCK_T, active: 0.05, dmg: 0, color: 0xd9a066, cue: null,
          });
          em.fireProjectile('kaya', ox, oy, oz, vx, vy, vz, sp, ent, {
            damage: def.damage * 0.9, gravity: ROCK_G, life: 3, aoe: { r: 2.4 },
          });
          em.emit({ type: 'fx', name: 'rock', id: ent.id, x: ox, y: oy, z: oz });
        }
        return a.t >= a.dur;
      },
    },
    yumruk: {
      visual: 'yumruk',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          a.W = 0.8 * ws;
          a.lock = a.W * 0.6;
          a.keepMove = true;
          a.h = hazard(em, ent, {
            shape: 'line', x: ent.x, z: ent.z, dx: 0, dz: -1, len: 7.5, width: 3.4, height: 2.2, windup: a.W, active: 0.2,
            dmg: def.damage * 1.1, color: 0xe8c27a, cue: 'slam',
          });
          a.dur = a.W + 0.6;
        }
        if (a.t < a.lock) {
          const d = tg.dist2d || 1;
          a.h.dx = tg.dx / d;
          a.h.dz = tg.dz / d;
          a.h.x = ent.x + a.h.dx * ent.w * 0.5;
          a.h.z = ent.z + a.h.dz * ent.w * 0.5;
          if (tg.dist2d > 4) walkToward(em, ent, def, tg.px, tg.pz, 3.6, dt, { reach: 3.5, noJump: true });
          else stopMove(ent);
        } else {
          stopMove(ent);
        }
        return a.t >= a.dur;
      },
    },
    ezme: {
      visual: 'ezme',
      run(em, ent, def, dt, ctx, tg, a, ws) {
        if (a.first) {
          const W = 1.2 * ws;
          slamCombo(em, ent, def, 6.2, 14, W, def.damage * 1.2, def.damage * 0.8, 0.1);
          a.dur = W + 1.5;
          a.exposeAfter = 2.0;
        }
        return a.t >= a.dur;
      },
    },
  },
  move(em, ent, def, dt, ctx, tg, ph) {
    ent.state = 'chase';
    if (!tg.active) {
      stopMove(ent);
      return;
    }
    faceTo(ent, tg.px, tg.pz, dt, 2.5);
    if (tg.dist2d > 5.5) {
      walkToward(em, ent, def, tg.px, tg.pz, def.walkSpeed * (1 + ph * 0.3), dt, { reach: 4.5, noJump: true });
    } else {
      stopMove(ent);
    }
  },
  tick(em, ent, def, dt, ctx, tg, ph) {
    const ai = ent.ai;
    if (ai.runeT === undefined) ai.runeT = 12;
    if (!ai.atk && ai.exposed <= 0 && ph >= 1) {
      ai.runeT -= dt;
      if (ai.runeT <= 0) {
        ai.runeT = ph === 1 ? 15 : 11;
        openRunes(em, ent, 3.2);
      }
    }
    return false;
  },
  expose(em, ent, def, secs) {
    openRunes(em, ent, secs);
  },
  damageMul(em, ent) {
    return ent.exposed ? 2.5 : 0.45;
  },
  onReset(em, ent) {
    ent.ai.runeT = 12;
  },
};

export const BOSS_SCRIPTS_A = Object.freeze({ kokana, tasbekci });
