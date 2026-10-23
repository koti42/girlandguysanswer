/*
 * KEŞİF sim/city/ped — ROBOT YZ (Neon Meridyen). Saf; three/DOM/Math.random/Date.now yok; belirlenimci (rnd = varlık kimliği + sayaç + tohum).
 *
 *   robotAI(em, ent, def, dt, ctx, tg)     mobAI.updateMobAI bunu `def.robot` olan türler için çağırır (ent.aim ve ent.mv'yi kendisi yazar)
 *
 * Roller (def.robot.role): sweeper (süpürge, dolaşır), courier (kurye, iki nokta arası gidip gelir, yol verir), helper (yardım dronu, yanında uçar),
 * guard (bekçi: yerinde durur, kapalı alana girene önce uyarır sonra nazikçe iter), glitch (hatabot: yaramaz, çarpar, hemen özür dileyip kaçar),
 * scanner (gözcü dron: devriye, tarama işaretler, yalnızca kısa yavaşlatır).
 *
 * AİLE DOSTU DEĞİŞMEZLER (test edilir): robot ASLA hasar vermez (hiçbir 'playerHit' / hurtPlayer yok); temas = nazik itme (≤4 m/s, ≤0.9 sn yavaşlama) + kıvılcım;
 * her temas 0.6–0.9 sn ÖNCEDEN işaretlenir (ent.attacking = 'dur'|'kivilcim'|'tarama'); iki temas arası ≥2.5 sn (tüm robotlar için ortak em.robotBumpUntil);
 * araç sürerken, uçarken ya da zemin güvenli değilken (su/uçurum) itme yok; erişilebilirlik/kısıtlı hareketlerde (hooks.gentle) hiç fiziksel temas yok;
 * dost robotlar (def.robot.immune) yaralanmaz; güvenli bölgeye giren robot nazikçe yok olur (hooks.safe).
 *
 * em.robotHooks (sim/city/ped/robots.js kurar; hepsi isteğe bağlı): {driving(), gentle(), safe(x,z), road(x,z,y), say(text,key)}.
 * Olaylar: 'robotBump' {id,mob,kind,pushed,x,y,z}, 'robotSay' {id,mob,name,text}, 'fx' {name:'blocked'|'beamHit'|'teleport'} (mevcut parçacık işleyicileri).
 */
import { applyKnockback } from '../../physics.js';
import {
  TAU, angleDiff, cellLiquid, cellSolid, clamp, groundYBelow, hash01, rndRange, steerFly, wrapAngle, yawFromDir,
} from '../../mobAIUtil.js';
import {
  faceDir, faceTo, stopMove, walkToward,
} from '../../mobAIMove.js';
import { ROBOT_INFO, ROBOT_LINES } from './robotData.js';

const NO_HOOKS = Object.freeze({});
const BUMP_GAP = 2.5; // iki temas arası (sn), tüm robotlar için ortak
const SAY_GAP = 5;

function hooksOf(em) {
  return em.robotHooks || NO_HOOKS;
}

function flag(h, name) {
  return typeof h[name] === 'function' ? !!h[name]() : false;
}

function initRb(em, ent, def) {
  const id = ent.id | 0;
  const seed = em.seed | 0;
  const R = def.robot;
  const rb = {
    mode: 'idle',
    t: 0.4 + hash01(id, 21, seed) * 2,
    windT: 0,
    coolT: 1 + hash01(id, 22, seed) * 2,
    pause: 0,
    greetCd: 0,
    safeT: hash01(id, 23, seed),
    tx: ent.x,
    tz: ent.z,
    ang: hash01(id, 24, seed) * TAU,
    zig: id % 2 === 0 ? 1 : -1,
    zigT: 0.4 + hash01(id, 25, seed) * 0.6,
    leg: 0,
    ax: ent.home.x,
    az: ent.home.z,
    bx: ent.x,
    bz: ent.z,
    gy: ent.y,
    gyT: 0,
    hoverY: 2,
    fleeT: 0,
  };
  if (R.role === 'courier') {
    const a = hash01(id, 26, seed) * TAU;
    const len = R.leg[0] + hash01(id, 27, seed) * (R.leg[1] - R.leg[0]);
    rb.bx = ent.home.x + Math.cos(a) * len;
    rb.bz = ent.home.z + Math.sin(a) * len;
  }
  if (def.movement === 'yürü' && ent.mv) ent.mv.jumpV = R.role === 'glitch' ? 5.2 : ent.mv.jumpV;
  return rb;
}

/* ------------------------------------------------------------------------------------------------
 * Ortak yardımcılar
 * ---------------------------------------------------------------------------------------------- */
function aimAt(ent, tg, on) {
  if (!on || !tg.active) {
    ent.aim = null;
    return;
  }
  const a = ent.aimObj;
  a.yaw = clamp(angleDiff(ent.yaw, yawFromDir(tg.dx, tg.dz)), -1.2, 1.2);
  a.pitch = clamp(Math.atan2(tg.py - (ent.y + ent.def.eyeHeight), tg.dist2d || 0.01), -0.6, 0.6);
  ent.aim = a;
}

function say(em, ent, hooks, key) {
  const text = ROBOT_LINES[key];
  if (!text || em.time < (em.robotSayUntil || 0)) return;
  em.robotSayUntil = em.time + SAY_GAP;
  const name = ROBOT_INFO[ent.key] ? ROBOT_INFO[ent.key].name : ent.key;
  em.emit({
    type: 'robotSay', id: ent.id, mob: ent.key, name, text,
  });
  if (typeof hooks.say === 'function') hooks.say(name + ': ' + text, 'robot:' + key);
}

/** İtme yönünde zemin güvenli mi: 1.2 ve 2.4 m ötede ayağın 3 blok altına dek katı var, sıvı yok. */
function pushSafe(em, p, dx, dz) {
  const w = em.world;
  const y = Math.floor(p.y + 0.05);
  for (let k = 1; k <= 2; k++) {
    const x = Math.floor(p.x + dx * 1.2 * k);
    const z = Math.floor(p.z + dz * 1.2 * k);
    let ok = false;
    for (let s = 1; s <= 3; s++) {
      if (cellLiquid(w, x, y - s, z)) return false;
      if (cellSolid(w, x, y - s, z)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

/** Nazik temas: itme (güvenliyse) + kısa yavaşlama + kıvılcım. Hasar YOK. true = temas oldu. */
function bump(em, ent, R, tg, hooks, kind) {
  const p = em.player;
  if (!p || p.dead || !tg.active) return false;
  if (flag(hooks, 'driving')) return false;
  if (em.time < (em.robotBumpUntil || 0)) return false;
  em.robotBumpUntil = em.time + BUMP_GAP;
  let dx = p.x - ent.x;
  let dz = p.z - ent.z;
  const l = Math.sqrt(dx * dx + dz * dz) || 1;
  dx /= l;
  dz /= l;
  const gentle = flag(hooks, 'gentle');
  let pushed = false;
  if (!gentle && R.push > 0 && !p.flying && pushSafe(em, p, dx, dz)) {
    applyKnockback(p, dx, dz, R.push, 3.0);
    pushed = true;
  }
  if (!gentle && R.slow > 0) em.emit({ type: 'playerEffect', effect: 'slow', t: R.slow, factor: 0.6 });
  em.emit({
    type: 'fx', name: kind === 'scan' ? 'beamHit' : 'blocked', id: ent.id, x: p.x, y: p.y + 0.9, z: p.z,
  });
  em.emit({
    type: 'robotBump', id: ent.id, mob: ent.key, kind, pushed, x: ent.x, y: ent.y, z: ent.z,
  });
  return true;
}

function pickTarget(em, ent, rb, R, hooks) {
  const hx = ent.home.x;
  const hz = ent.home.z;
  for (let k = 0; k < 4; k++) {
    const a = rndRange(em, ent, 0, TAU);
    const d = rndRange(em, ent, 3, Math.min(9, Math.max(4, R.leash)));
    let tx = ent.x + Math.cos(a) * d;
    let tz = ent.z + Math.sin(a) * d;
    const ox = tx - hx;
    const oz = tz - hz;
    const od = Math.sqrt(ox * ox + oz * oz);
    if (od > R.leash) {
      tx = hx + (ox / od) * R.leash * 0.7;
      tz = hz + (oz / od) * R.leash * 0.7;
    }
    if (typeof hooks.safe === 'function' && hooks.safe(tx, tz)) continue;
    if (typeof hooks.road === 'function' && hooks.road(tx, tz, ent.y)) continue; // yaya hedefi yol (araç şeridi) olmasın
    rb.tx = tx;
    rb.tz = tz;
    return;
  }
  rb.tx = hx;
  rb.tz = hz;
}

function wander(em, ent, def, rb, R, dt, hooks, speed) {
  rb.t -= dt;
  if (rb.mode !== 'walk') {
    stopMove(ent);
    ent.state = 'idle';
    if (rb.t <= 0) {
      pickTarget(em, ent, rb, R, hooks);
      rb.mode = 'walk';
      rb.t = rndRange(em, ent, 5, 10);
    }
    return;
  }
  ent.state = 'wander';
  const walking = walkToward(em, ent, def, rb.tx, rb.tz, speed, dt, { reach: 0.7 });
  faceDir(ent, ent.mv.dx, ent.mv.dz, dt, 5);
  if (!walking || rb.t <= 0) {
    stopMove(ent);
    rb.mode = 'idle';
    rb.t = rndRange(em, ent, 1.5, 4);
  }
}

function groundRef(em, ent, rb, dt) {
  rb.gyT -= dt;
  if (rb.gyT > 0) return;
  rb.gyT = 0.5;
  const g = groundYBelow(em.world, ent.x, ent.y + 0.5, ent.z, 18);
  if (g >= 0) rb.gy = g;
}

/** Süzülen hedef yüksekliği: [lo,hi] aralığı, tavan boşluğuna sığacak şekilde kısılır (kanalizasyon tavanı 4 blok). */
function hoverY(em, ent, rb, lo, hi, salt) {
  const w = em.world;
  const fx = Math.floor(ent.x);
  const fz = Math.floor(ent.z);
  let gap = 9;
  for (let s = 1; s <= 9; s++) {
    if (cellSolid(w, fx, Math.floor(rb.gy) + s, fz)) {
      gap = s;
      break;
    }
  }
  const room = gap - ent.h - 0.45;
  const top = Math.min(hi, Math.max(0.5, room));
  const bot = Math.min(lo, top);
  return rb.gy + bot + (Math.sin(ent.age * 0.9 + salt) * 0.5 + 0.5) * (top - bot);
}

function flyTo(em, ent, rb, tx, ty, tz, speed, dt) {
  const mv = ent.mv;
  let dx = tx - ent.x;
  let dy = ty - ent.y;
  let dz = tz - ent.z;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (l < 0.3) {
    mv.dx = 0; mv.dy = 0; mv.dz = 0; mv.spd = 0;
    return false;
  }
  dx /= l; dy /= l; dz /= l;
  steerFly(em.world, ent, dx, dy, dz);
  mv.spd = Math.min(speed, 0.6 + l * 1.4);
  mv.accel = 6;
  faceDir(ent, mv.dx, mv.dz, dt, 6);
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Roller
 * ---------------------------------------------------------------------------------------------- */
function sweeper(em, ent, def, rb, R, dt, tg, hooks) {
  if (rb.pause > 0) {
    rb.pause -= dt;
    stopMove(ent);
    ent.state = 'greet';
    if (tg.active) faceTo(ent, em.player.x, em.player.z, dt, 5);
    aimAt(ent, tg, true);
    return;
  }
  rb.greetCd -= dt;
  if (tg.active && tg.dist2d < 3.5 && rb.greetCd <= 0) {
    rb.pause = 1.6;
    rb.greetCd = 14;
    say(em, ent, hooks, 'sweeper:greet');
    return;
  }
  aimAt(ent, tg, tg.active && tg.dist2d < 6);
  wander(em, ent, def, rb, R, dt, hooks, def.walkSpeed);
}

function courier(em, ent, def, rb, R, dt, tg, hooks) {
  if (rb.pause > 0) {
    rb.pause -= dt;
    stopMove(ent);
    ent.state = 'greet';
    if (tg.active && tg.dist2d < 4) faceTo(ent, em.player.x, em.player.z, dt, 5);
    aimAt(ent, tg, tg.dist2d < 5);
    return;
  }
  rb.greetCd -= dt;
  if (tg.active && tg.dist2d < 2.4 && rb.greetCd <= 0) {
    rb.pause = 1.4;
    rb.greetCd = 12;
    say(em, ent, hooks, 'courier:greet');
    return;
  }
  aimAt(ent, tg, false);
  rb.t -= dt;
  const tx = rb.leg === 0 ? rb.bx : rb.ax;
  const tz = rb.leg === 0 ? rb.bz : rb.az;
  const gx = typeof hooks.safe === 'function' && hooks.safe(tx, tz);
  const walking = !gx && walkToward(em, ent, def, tx, tz, def.walkSpeed, dt, { reach: 1.0 });
  ent.state = 'wander';
  faceDir(ent, ent.mv.dx, ent.mv.dz, dt, 5);
  if (!walking || rb.t <= 0) {
    stopMove(ent);
    rb.pause = 2.2;
    rb.leg = rb.leg === 0 ? 1 : 0;
    rb.t = 28;
    if (rb.leg === 0) {
      pickTarget(em, ent, rb, R, hooks);
      rb.bx = rb.tx;
      rb.bz = rb.tz;
    }
  }
}

function helper(em, ent, def, rb, R, dt, tg, hooks) {
  groundRef(em, ent, rb, dt);
  const p = em.player;
  const follow = tg.active && !p.dead && tg.dist2d < R.follow;
  let tx = ent.home.x;
  let tz = ent.home.z;
  let ty;
  let speed = def.walkSpeed;
  if (follow) {
    rb.ang += dt * 0.7;
    tx = p.x + Math.cos(rb.ang) * 3.2;
    tz = p.z + Math.sin(rb.ang) * 3.2;
    ty = p.y + 2.1 + Math.sin(ent.age * 1.3) * 0.25;
    if (typeof hooks.safe === 'function' && hooks.safe(tx, tz)) {
      tx = ent.home.x;
      tz = ent.home.z;
      ty = undefined;
    } else {
      speed = tg.dist2d > 7 ? def.speed : def.walkSpeed;
      if (rb.greetCd <= 0 && tg.dist2d < 5) {
        rb.greetCd = 40;
        say(em, ent, hooks, 'helper:greet');
      }
    }
  } else {
    rb.t -= dt;
    if (rb.t <= 0) {
      rb.t = rndRange(em, ent, 3, 6);
      const a = rndRange(em, ent, 0, TAU);
      const d = rndRange(em, ent, 2, Math.min(10, R.leash));
      rb.tx = ent.home.x + Math.cos(a) * d;
      rb.tz = ent.home.z + Math.sin(a) * d;
    }
    tx = rb.tx;
    tz = rb.tz;
  }
  rb.greetCd -= dt;
  if (ty === undefined) ty = hoverY(em, ent, rb, R.hover[0], R.hover[1], ent.id);
  ent.state = follow ? 'follow' : 'wander';
  flyTo(em, ent, rb, tx, ty, tz, speed, dt);
  aimAt(ent, tg, follow);
}

function guard(em, ent, def, rb, R, dt, tg, hooks) {
  rb.coolT -= dt;
  const near = tg.active && tg.dist2d < R.warnR;
  if (rb.mode === 'warn') {
    stopMove(ent);
    rb.windT -= dt;
    ent.state = 'warn';
    if (tg.active) faceTo(ent, em.player.x, em.player.z, dt, 8);
    aimAt(ent, tg, true);
    if (!tg.active || tg.dist2d > R.reach + 1.4) {
      rb.mode = 'idle'; // oyuncu kendiliğinden uzaklaştı: işaret iptal
      ent.attacking = false;
      rb.coolT = 1;
    } else if (rb.windT <= 0) {
      ent.attacking = false;
      rb.mode = 'idle';
      rb.coolT = R.cool;
      if (tg.dist2d <= R.reach + 0.6 && bump(em, ent, R, tg, hooks, 'guard')) say(em, ent, hooks, 'guard:done');
    }
    return;
  }
  ent.attacking = false;
  ent.state = tg.active && tg.dist2d < R.watch ? 'watch' : 'idle';
  aimAt(ent, tg, ent.state === 'watch');
  if (ent.state === 'watch') faceTo(ent, em.player.x, em.player.z, dt, 4);
  // yerine dön (nöbet noktası)
  const hx = ent.home.x - ent.x;
  const hz = ent.home.z - ent.z;
  if (hx * hx + hz * hz > 0.8 * 0.8) walkToward(em, ent, def, ent.home.x, ent.home.z, def.walkSpeed * 0.8, dt, { reach: 0.4 });
  else stopMove(ent);
  if (near && rb.coolT <= 0 && !flag(hooks, 'driving')) {
    rb.mode = 'warn';
    rb.windT = R.windup;
    ent.attacking = 'dur';
    say(em, ent, hooks, 'guard:warn');
  }
}

function glitch(em, ent, def, rb, R, dt, tg, hooks) {
  rb.coolT -= dt;
  rb.zigT -= dt;
  if (rb.zigT <= 0) {
    rb.zigT = rndRange(em, ent, 0.5, 1.1);
    rb.zig = -rb.zig;
  }
  const p = em.player;
  const hurtFlee = ent.ai.fleeT > 0;
  if (hurtFlee && rb.mode !== 'oops') {
    rb.mode = 'oops';
    rb.fleeT = 2.5;
    ent.attacking = false;
  }
  if (rb.mode === 'windup') {
    stopMove(ent);
    rb.windT -= dt;
    ent.state = 'windup';
    if (tg.active) faceTo(ent, p.x, p.z, dt, 9);
    aimAt(ent, tg, true);
    if (rb.windT <= 0) {
      ent.attacking = false;
      if (tg.dist2d <= R.reach + 0.9 && bump(em, ent, R, tg, hooks, 'glitch')) {
        say(em, ent, hooks, 'glitch:oops');
        em.emit({
          type: 'fx', name: 'teleport', id: ent.id, x: ent.x, y: ent.y + ent.h * 0.5, z: ent.z,
        });
      }
      rb.mode = 'oops';
      rb.fleeT = 3;
      rb.coolT = R.cool;
    }
    return;
  }
  if (rb.mode === 'oops') {
    rb.fleeT -= dt;
    ent.state = 'flee';
    ent.attacking = false;
    const fx = hurtFlee ? ent.ai.fx : p.x;
    const fz = hurtFlee ? ent.ai.fz : p.z;
    let ax = ent.x - fx;
    let az = ent.z - fz;
    const l = Math.sqrt(ax * ax + az * az) || 1;
    ax /= l; az /= l;
    const c = Math.cos(0.7 * rb.zig);
    const s = Math.sin(0.7 * rb.zig);
    walkToward(em, ent, def, ent.x + (ax * c - az * s) * 8, ent.z + (ax * s + az * c) * 8, def.speed, dt, { reach: 0.4 });
    faceDir(ent, ent.mv.dx, ent.mv.dz, dt, 9);
    aimAt(ent, tg, false);
    if (rb.fleeT <= 0) {
      rb.mode = 'idle';
      rb.t = 0.5;
    }
    return;
  }
  const sees = tg.active && tg.dist2d < R.sense && !flag(hooks, 'driving');
  if (sees && rb.coolT <= 0) {
    rb.mode = 'chase';
    ent.state = 'chase';
    const c = Math.cos(0.6 * rb.zig);
    const s = Math.sin(0.6 * rb.zig);
    let dx = p.x - ent.x;
    let dz = p.z - ent.z;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= l; dz /= l;
    walkToward(em, ent, def, ent.x + (dx * c - dz * s) * 4, ent.z + (dx * s + dz * c) * 4, def.speed * 0.85, dt, { reach: 0.3 });
    faceDir(ent, ent.mv.dx, ent.mv.dz, dt, 9);
    aimAt(ent, tg, true);
    if (tg.dist2d < R.reach + 0.6) {
      rb.mode = 'windup';
      rb.windT = R.windup;
      ent.attacking = 'kivilcim';
      stopMove(ent);
    }
    return;
  }
  if (rb.mode === 'chase') {
    rb.mode = 'idle';
    rb.t = 0.4;
  }
  aimAt(ent, tg, sees);
  wander(em, ent, def, rb, R, dt, hooks, def.walkSpeed * 1.4);
  // yaramaz sekmeler (yalnızca dolaşırken)
  if (ent.state === 'wander' && ent.onGround && ((ent.age * 2.3 + ent.id) % 4) < dt * 2.3) ent.mv.jump = true;
}

function scanner(em, ent, def, rb, R, dt, tg, hooks) {
  groundRef(em, ent, rb, dt);
  rb.coolT -= dt;
  const p = em.player;
  if (ent.ai.fleeT > 0 && rb.mode !== 'scan') {
    ent.state = 'flee';
    ent.attacking = false;
    let ax = ent.x - ent.ai.fx;
    let az = ent.z - ent.ai.fz;
    const l = Math.sqrt(ax * ax + az * az) || 1;
    ax /= l; az /= l;
    flyTo(em, ent, rb, ent.x + ax * 6, hoverY(em, ent, rb, R.hover[0], R.hover[1], ent.id), ent.z + az * 6, def.speed, dt);
    aimAt(ent, tg, false);
    return;
  }
  if (rb.mode === 'scan') {
    stopMove(ent);
    ent.mv.dy = 0;
    rb.windT -= dt;
    ent.state = 'scan';
    aimAt(ent, tg, true);
    if (tg.active) faceTo(ent, p.x, p.z, dt, 6);
    if (rb.windT <= 0) {
      ent.attacking = false;
      rb.mode = 'patrol';
      rb.coolT = R.cool;
      if (tg.active && tg.dist2d <= R.range && losClear(em, ent, p) && bump(em, ent, { push: 0, slow: R.slow }, tg, hooks, 'scan')) {
        say(em, ent, hooks, 'scanner:done');
      }
    }
    return;
  }
  ent.attacking = false;
  // devriye: evin çevresinde yavaş daire
  rb.ang += dt * 0.35;
  const rad = Math.max(3, R.leash * 0.6);
  let tx = ent.home.x + Math.cos(rb.ang) * rad;
  let tz = ent.home.z + Math.sin(rb.ang) * rad;
  if (typeof hooks.safe === 'function' && hooks.safe(tx, tz)) {
    tx = ent.home.x;
    tz = ent.home.z;
  }
  ent.state = 'patrol';
  flyTo(em, ent, rb, tx, hoverY(em, ent, rb, R.hover[0], R.hover[1], ent.id), tz, def.walkSpeed, dt);
  const sees = tg.active && tg.dist2d < R.sense && !flag(hooks, 'driving');
  aimAt(ent, tg, sees);
  if (sees && rb.coolT <= 0 && losClear(em, ent, p)) {
    rb.mode = 'scan';
    rb.windT = R.windup;
    ent.attacking = 'tarama';
    em.emit({
      type: 'fx', name: 'beamHit', id: ent.id, x: ent.x, y: ent.y, z: ent.z,
    });
    say(em, ent, hooks, 'scanner:scan');
  }
}

/** Robot ile oyuncu arasında katı blok yok mu (4 örnek). */
function losClear(em, ent, p) {
  const w = em.world;
  const x0 = ent.x;
  const y0 = ent.y + ent.h * 0.5;
  const z0 = ent.z;
  const x1 = p.x;
  const y1 = p.y + p.h * 0.6;
  const z1 = p.z;
  for (let k = 1; k <= 4; k++) {
    const t = k / 5;
    if (cellSolid(w, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), Math.floor(z0 + (z1 - z0) * t))) return false;
  }
  return true;
}

const ROLES = Object.freeze({
  sweeper, courier, helper, guard, glitch, scanner,
});

/** Bir robot YZ adımı (mobAI.updateMobAI çağırır). */
export function robotAI(em, ent, def, dt, ctx, tg) {
  const R = def.robot;
  const ai = ent.ai;
  let rb = ai.rb;
  if (!rb) {
    rb = initRb(em, ent, def);
    ai.rb = rb;
  }
  const hooks = hooksOf(em);
  ent.invuln = !!R.immune;
  ent.target = false;
  rb.safeT -= dt;
  if (rb.safeT <= 0) {
    rb.safeT = 1;
    if (typeof hooks.safe === 'function' && hooks.safe(ent.x, ent.z)) {
      em.dismiss(ent, 'mobFade');
      return;
    }
  }
  ent.mv.jump = false;
  if (!em.player) { // oyuncu yok (test/yükleme): yerinde durur, işaret bırakmaz
    stopMove(ent);
    ent.aim = null;
    ent.attacking = false;
    return;
  }
  ROLES[R.role](em, ent, def, rb, R, dt, tg, hooks);
  ent.yaw = wrapAngle(ent.yaw);
}
