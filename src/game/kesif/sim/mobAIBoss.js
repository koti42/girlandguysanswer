/*
 * KEŞİF sim — boss YZ çekirdeği (saf): arena farkındalığı, devreye girme/sıfırlama, aşama eşikleri, saldırı zamanlayıcı.
 *
 * Betik arayüzü (mobAIBossA.js: Kök Ana + Taş Bekçi, mobAIBossB.js: Buz Kral + Gölge Hükümdar):
 *   { cd:[3], ws:[3], pick(em,ent,def,tg,phase)→ad|null,
 *     attacks:{ ad:{ visual, run(em,ent,def,dt,ctx,tg,a,ws)→bitti } }, move(...), damageMul(em,ent,src)→çarpan,
 *     tick(...)→true ise zamanlayıcı atlanır (finale döngüsü), onPhase(), onReset() }
 * Saldırılar telegraflıdır: önce yerde işaret (tehlike, windup), sonra hasar; ölçüler öğrenilebilir ve adildir.
 *
 * Durumlar (ent.state): 'idle' (devrede değil), 'chase'/'strafe' (hareket), 'windup' (saldırı), 'exposed' (zayıf an),
 * 'phaseshift' (aşama geçişi, dokunulmaz), 'blink' (finale portalı), 'dead'.
 * Olaylar: bossEngage {id,type}, bossPhase {id,type,phase,hpRatio}, bossReset {id,type}.
 */
import { faceTo, stopMove } from './mobAIMove.js';
import { BOSS_SCRIPTS_A } from './mobAIBossA.js';
import { BOSS_SCRIPTS_B, cloneAI } from './mobAIBossB.js';
import { arenaDist, clampArena, groundY } from './mobAIBossKit.js';

export const BOSS_SCRIPTS = Object.freeze({ ...BOSS_SCRIPTS_A, ...BOSS_SCRIPTS_B });

const _p = { x: 0, z: 0 };

/** Aşama indeksi (0..2) can oranından. */
export function phaseForRatio(def, ratio) {
  const th = def.phases.thresholds;
  let ph = 0;
  for (let i = 0; i < th.length; i++) if (ratio <= th[i]) ph = i + 1;
  return ph > 2 ? 2 : ph;
}

/** Boss başlangıç durumu (ent.ai alanları). */
export function initBossAI(em, ent, def) {
  const ai = ent.ai;
  ai.engaged = false;
  ai.outT = 0;
  ai.cd = 2;
  ai.atk = null;
  ai.last = '';
  ai.trans = 0;
  ai.exposed = 0;
  ai.fin = null;
  if (!ent.arena) ent.arena = { x: ent.x, z: ent.z, r: def.arenaRadius };
  ent.phase = phaseForRatio(def, ent.hp / ent.maxHp);
  ent.invuln = false;
  ent.exposed = false;
}

/** Hasar çarpanı (0 = dokunulmaz). */
export function bossDamageMul(em, ent, def, src) {
  if (ent.dead || ent.invuln || ent.hidden) return 0;
  const S = BOSS_SCRIPTS[ent.key];
  let m = 1;
  if (S && S.damageMul) m = S.damageMul(em, ent, src);
  return m;
}

/** Oyuncu boss'a vurdu (arena dışından da olsa) → devreye sok. */
export function bossProvoked(em, ent, def) {
  if (!ent.ai.engaged && !ent.isClone) engage(em, ent, def);
}

function engage(em, ent, def) {
  const ai = ent.ai;
  ai.engaged = true;
  ai.outT = 0;
  ai.cd = 1.8;
  ent.target = true;
  em.emit({ type: 'bossEngage', id: ent.id, boss: ent.key, name: def.name, zone: def.zone });
}

/** Tam sıfırlama: can, aşama, tehlikeler, minyonlar, konum. */
export function resetBoss(em, ent, def) {
  const ai = ent.ai;
  em.clearHazards(ent);
  em.removeMinions(ent.id);
  const S = BOSS_SCRIPTS[ent.key];
  if (S && S.onReset) S.onReset(em, ent, def);
  ai.engaged = false;
  ai.outT = 0;
  ai.cd = 2;
  ai.atk = null;
  ai.trans = 0;
  ai.exposed = 0;
  ai.fin = null;
  ai.last = '';
  ent.hp = ent.maxHp;
  ent.phase = 0;
  ent.invuln = false;
  ent.exposed = false;
  ent.hidden = false;
  ent.weak = false;
  ent.attacking = false;
  ent.target = false;
  ent.state = 'idle';
  ent.x = ent.home.x;
  ent.z = ent.home.z;
  ent.y = groundY(em, ent.x, ent.z, ent.y);
  ent.vx = 0; ent.vy = 0; ent.vz = 0;
  stopMove(ent);
  em.emit({ type: 'bossReset', id: ent.id, boss: ent.key });
}

function startTransition(em, ent, def, S, newPhase) {
  const ai = ent.ai;
  ent.phase = newPhase;
  ent.invuln = true;
  ai.trans = 1.7;
  ai.atk = null;
  ai.exposed = 0;
  ent.exposed = false;
  ent.weak = false;
  em.clearHazards(ent);
  ent.attacking = S.roar;
  ent.state = 'phaseshift';
  stopMove(ent);
  em.emit({
    type: 'bossPhase', id: ent.id, boss: ent.key, name: def.name, phase: newPhase, hpRatio: ent.hp / ent.maxHp,
  });
  em.emit({ type: 'fx', name: 'roar', id: ent.id, x: ent.x, y: ent.y + ent.h * 0.6, z: ent.z });
  if (S.onPhase) S.onPhase(em, ent, def, newPhase);
}

/** Boss YZ adımı (ana). */
export function bossAI(em, ent, def, dt, ctx, tg) {
  if (ent.isClone) {
    cloneAI(em, ent, def, dt, ctx, tg);
    return;
  }
  const S = BOSS_SCRIPTS[ent.key];
  const ai = ent.ai;
  if (!S) return;
  const inArena = tg.active && arenaDist(ent, tg.px, tg.pz) <= ent.arena.r + 0.5;

  if (!ai.engaged) {
    if (inArena && !em.peaceful) engage(em, ent, def);
    else {
      ent.state = 'idle';
      ent.attacking = false;
      stopMove(ent);
      if (ent.hp < ent.maxHp) ent.hp = Math.min(ent.maxHp, ent.hp + 8 * dt);
      return;
    }
  }
  // ayrıldı / öldü → sıfırla
  if (inArena) ai.outT = 0;
  else ai.outT += dt;
  if (ai.outT > (tg.active ? 9 : 3.5)) {
    resetBoss(em, ent, def);
    return;
  }

  // aşama geçişi
  const np = phaseForRatio(def, ent.hp / ent.maxHp);
  if (np > ent.phase && ai.trans <= 0) startTransition(em, ent, def, S, np);
  if (ai.trans > 0) {
    ai.trans -= dt;
    stopMove(ent);
    if (tg.active) faceTo(ent, tg.px, tg.pz, dt, 4);
    if (ai.trans <= 0) {
      ent.invuln = false;
      ent.attacking = false;
      ent.state = 'chase';
      ai.cd = 1.2;
    }
    return;
  }

  const phase = ent.phase;
  const ws = S.ws[phase];
  if (S.tick && S.tick(em, ent, def, dt, ctx, tg, phase)) return;

  if (ai.exposed > 0) {
    ai.exposed -= dt;
    ent.exposed = true;
    ent.weak = true;
    ent.state = 'exposed';
    stopMove(ent);
    if (tg.active) faceTo(ent, tg.px, tg.pz, dt, 3);
    if (ai.exposed <= 0) {
      ent.exposed = false;
      ent.weak = false;
      ent.state = 'chase';
      ent.attacking = false;
    }
    return;
  }

  // saldırı sürüyor mu
  let a = ai.atk;
  if (a) {
    const A = S.attacks[a.name];
    a.first = !a.init;
    a.init = true;
    a.t += dt;
    ent.state = 'windup';
    ent.attacking = A.visual;
    if (tg.active && !a.noFace) faceTo(ent, tg.px, tg.pz, dt, a.faceRate || 3.5);
    if (!a.keepMove) stopMove(ent);
    const done = A.run(em, ent, def, dt, ctx, tg, a, ws);
    if (done) {
      ai.atk = null;
      ent.attacking = false;
      ent.state = 'chase';
      const base = S.cd[phase];
      ai.cd = a.cdOverride !== undefined ? a.cdOverride : base * (0.85 + 0.3 * ((ent.id * 7 + a.name.length * 13) % 10) / 10);
      if (a.exposeAfter > 0) {
        if (S.expose) S.expose(em, ent, def, a.exposeAfter);
        else ai.exposed = a.exposeAfter;
      }
      ai.last = a.name;
    }
    return;
  }

  // hareket
  ai.cd -= dt;
  S.move(em, ent, def, dt, ctx, tg, phase);
  if (ai.cd <= 0 && tg.active) {
    const name = S.pick(em, ent, def, tg, phase);
    if (name && S.attacks[name]) {
      ai.atk = { name, t: 0, init: false, first: true, keepMove: false, noFace: false, faceRate: 3.5, exposeAfter: 0, n: 0, hs: null };
      ent.state = 'windup';
    } else {
      ai.cd = 0.5;
    }
  }
}

/** Fizik sonrası: boss arenanın dışına çıkmasın. */
export function bossPost(em, ent) {
  if (!ent.arena) return;
  const a = ent.arena;
  const margin = ent.w * 0.5 + 0.6;
  if (arenaDist(ent, ent.x, ent.z) > a.r - margin) {
    clampArena(ent, ent.x, ent.z, margin, _p);
    ent.x = _p.x;
    ent.z = _p.z;
    ent.vx *= 0.5;
    ent.vz *= 0.5;
  }
}

/** HUD için boss özeti. */
export function bossHudOf(ent, def) {
  return {
    id: ent.id, boss: ent.key, name: def.name, hp: Math.max(0, ent.hp), maxHp: ent.maxHp, phase: ent.phase,
    exposed: !!ent.exposed, invuln: !!ent.invuln,
  };
}
