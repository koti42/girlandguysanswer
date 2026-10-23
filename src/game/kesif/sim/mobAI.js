/*
 * KEŞİF sim — yaratık YZ dağıtıcısı (saf).
 *
 * 18 tür: pasif (mobAIPassive), düşman (mobAIHostile/B), boss (mobAIBoss + A/B betikleri). Her tür bir durum makinesidir;
 * YZ yalnızca ent.mv'ye (istenen hareket) ve durum alanlarına yazar, fiziği EntityManager (mobAIMove.stepMob) uygular.
 *
 * initMobAI(em, ent, def)                       ent.ai/ent.mv/ent.cd başlatır (belirlenimci, tohum + kimlik)
 * updateMobAI(em, ent, def, dt, ctx, tg)        bir YZ adımı; tg: oyuncuya göre hedef bilgisi (EntityManager hesaplar)
 * postMobAI(em, ent, def)                       fizikten sonra (boss arena sıkıştırması)
 */
import { TAU, angleDiff, clamp, hash01, yawFromDir } from './mobAIUtil.js';
import { createMv } from './mobAIMove.js';
import { updatePassive } from './mobAIPassive.js';
import { robotAI } from './city/ped/robotAI.js';
import { golgeAI, kemikciAI } from './mobAIHostile.js';
import {
  buzhortlagiAI, kristalbocegiAI, kumakrebiAI, lavslimeAI, tasyarasasiAI,
} from './mobAIHostileB.js';
import {
  bossAI, bossDamageMul, bossHudOf, bossPost, bossProvoked, initBossAI, resetBoss,
} from './mobAIBoss.js';

const HOSTILE_PROFILES = Object.freeze({
  golge: golgeAI,
  kemikci: kemikciAI,
  kumakrebi: kumakrebiAI,
  buzhortlagi: buzhortlagiAI,
  kristalbocegi: kristalbocegiAI,
  lavslime: lavslimeAI,
  tasyarasasi: tasyarasasiAI,
});

export function initMobAI(em, ent, def) {
  const id = ent.id | 0;
  const seed = em.seed | 0;
  ent.mv = createMv();
  ent.mv.accel = def.movement === 'uç' || def.movement === 'yüz' ? 8 : 22;
  ent.cd = { atk: 0, burrow: 0 };
  ent.ai = {
    think: (id % 10) * 0.025,
    steerT: 0, steerA: 0, side: id % 2 === 0 ? 1 : -1, sk: 0, stuckT: 0,
    pathCd: 0, canHop: false, progT: 0, progD: 0, pathOn: false, pathT: 0, pathGx: 0, pathGz: 0, path: null, blocked: false,
    ph: 0, t: hash01(id, 1, seed) * 2, keepAtk: 0, hit: false,
    aggroT: 0, noLosT: 0, los: false, light: 15, lit: false, afraid: false, rt: 0, rx: ent.x, rz: ent.z,
    strafe: id % 2 === 0 ? 1 : -1, hopT: 0.3 + hash01(id, 2, seed) * 0.5,
    ang: hash01(id, 3, seed) * TAU, orb: hash01(id, 4, seed) * TAU, orbDir: id % 3 === 0 ? -1 : 1,
    fleeT: 0, fx: ent.x, fz: ent.z, tx: ent.x, tz: ent.z, hx: 0, hz: 0, gy: ent.y, depthBias: 0,
    bph: 0, bt: 0, marker: null,
  };
  ent.sm = 1;
  if (def.boss) initBossAI(em, ent, def);
}

export function updateMobAI(em, ent, def, dt, ctx, tg) {
  const ai = ent.ai;
  if (ai.pathCd > 0) ai.pathCd -= dt;
  if (def.boss) bossAI(em, ent, def, dt, ctx, tg);
  else if (def.robot) {
    robotAI(em, ent, def, dt, ctx, tg); // Neon Meridyen robotları: kendi nişanını (ent.aim) ve hareketini yazar
    return;
  } else if (def.hostile) HOSTILE_PROFILES[def.key](em, ent, def, dt, ctx, tg);
  else updatePassive(em, ent, def, dt, ctx, tg);

  // model nişanı: hedefe doğru gövdeye göre yaw/pitch
  if (tg.active && ((def.hostile && ent.target) || (def.boss && ai.engaged))) {
    const a = ent.aimObj;
    a.yaw = clamp(angleDiff(ent.yaw, yawFromDir(tg.dx, tg.dz)), -1.2, 1.2);
    a.pitch = clamp(Math.atan2(tg.py - (ent.y + def.eyeHeight), tg.dist2d || 0.01), -0.6, 0.6);
    ent.aim = a;
  } else {
    ent.aim = null;
  }
}

export function postMobAI(em, ent, def) {
  if (def.boss) bossPost(em, ent);
}

export {
  bossDamageMul, bossHudOf, bossProvoked, resetBoss,
};
