/*
 * KEŞİF sim/city/ped — ŞEHİR ROBOT DOĞURUCUSU (spawner 'neon' profili). Saf; three/DOM/Math.random/Date.now yok; belirlenimci.
 *
 *   const rb = createNeonRobots({ seed, world, em, hooks })      seed = şehir tohumu (dimSeed); hooks = {tier(), driving(), gentle(), say(text,key), grantKredi(n,why)}
 *   rb.update(dt, player, ctx)    ctx: {dayFactor, night?, peaceful}   (Spawner.update 'neon' profilinde bunu çağırır)
 *   rb.clearMobs()                tüm robotları sessizce kaldırır (boyut değişimi / profil geçişi)
 *   rb.counts()                   {pushy, friendly, total}      rb.stats {spawned, despawned, dissolved, attempts, kredi}
 *
 * Doğma: yalnızca tohumdan türeyen YUVALARDAN (robotSlots.js) — oyuncu yolu belirlenimciliği bozmaz. Güvenli bölge/terminal/meydan/iç mekân yuvası yoktur
 * (yuva kuralları + çalışma zamanı denetimi). Tavan: kademe başına itici (bekçi/hatabot/gözcü) ve dost robot sınıfları ayrı; yakın (32 blok) ve dünya.
 * Kolay mod/inşa/harita (ctx.peaceful) → robot hiç yok (mevcutlar nazikçe kaybolur). Hatabot yüzeyde yalnız gece.
 * Dağılma (hp 0): em.damage zaten eşya düşürür (kayıp tablosu); burada ayrıca küçük Kredi hesaplanıp 'robotDissolved' yayınlanır ve hooks.grantKredi çağrılır.
 */
import { getCityPlan, planZoneAt } from '../cityPlan.js';
import { safeAt } from '../cityDistricts.js';
import { SURF, surfaceAt } from '../cityRoads.js';
import { getMobType } from '../../mobTypes.js';
import { isBoxFree } from '../../physics.js';
import { hash3 } from '../../rng.js';
import { groundYBelow, standable } from '../../mobAIUtil.js';
import {
  ROBOT_SPAWN, isPushyKey, robotCapsFor, robotKredi, robotSpawnFor,
} from './robotData.js';
import { robotSlotsForChunk } from './robotSlots.js';

const NIGHT_DAY = 0.32;
const PROBE = { avoidWater: true, ignoreLava: false };
const CONE_COS = Math.cos((62 * Math.PI) / 180);
const RECENT_WINDOW = 300;
const DESPAWN_DY = 48;
const offsetCache = new Map();

/** Merkez çevresi chunk kayması listesi (uzaklığa göre sıralı, belirlenimci). */
function chunkOffsets(r) {
  let v = offsetCache.get(r);
  if (v) return v;
  v = [];
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) v.push([dx, dz]);
  v.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]) || a[0] - b[0] || a[1] - b[1]);
  offsetCache.set(r, v);
  return v;
}

const cellKey = (x, z) => Math.floor(x) + ',' + Math.floor(z);

export function createNeonRobots(opts) {
  const o = opts || {};
  const seed = (o.seed === undefined ? 0 : o.seed) | 0;
  const world = o.world;
  const em = o.em;
  const user = o.hooks || {};
  const plan = getCityPlan(seed);
  const tierNow = () => (typeof user.tier === 'function' ? user.tier() : 'high');
  const hooks = {
    driving: () => (typeof user.driving === 'function' ? !!user.driving() : false),
    gentle: () => (typeof user.gentle === 'function' ? !!user.gentle() : false),
    safe: (x, z) => safeAt(plan, x, z),
    // yüzeyde araç şeridi/zebra mı (yeraltında hep false: kanalizasyon yolların altındadır)
    road: (x, z, y) => {
      if (y < 60) return false;
      const s = surfaceAt(plan.roads, Math.floor(x), Math.floor(z));
      return s === SURF.ASPHALT || s === SURF.LANE_X || s === SURF.LANE_Z || s === SURF.ZEBRA_X || s === SURF.ZEBRA_Z;
    },
    say: (text, key) => {
      if (typeof user.say === 'function') user.say(text, key);
    },
  };
  const st = {
    t: 0, attemptT: 0.5, sweepT: 1, attemptN: 0, recent: [], paid: new Set(), cool: new Map(), occupied: new Set(), cand: [],
  };
  const stats = {
    spawned: 0, despawned: 0, dissolved: 0, attempts: 0, kredi: 0, evicted: 0,
  };

  function isNight(c) {
    if (c.night !== undefined) return !!c.night;
    const df = c.dayFactor === undefined ? 1 : c.dayFactor;
    return df < NIGHT_DAY;
  }

  function counts() {
    let pushy = 0;
    let friendly = 0;
    em.mobs.forEach((e) => {
      if (!e.def.robot || e.dead) return;
      if (e.def.robot.group === 'pushy') pushy++;
      else friendly++;
    });
    return { pushy, friendly, total: pushy + friendly };
  }

  /** Ölü robotlar: bir kez Kredi + olay; yuva soğuma süresi. */
  function processDead() {
    em.mobs.forEach((e) => {
      if (!e.def.robot || !e.dead || st.paid.has(e.id)) return;
      st.paid.add(e.id);
      if (st.paid.size > 512) st.paid.clear();
      while (st.recent.length > 0 && st.t - st.recent[0] > RECENT_WINDOW) st.recent.shift();
      const kredi = robotKredi(e.def, seed, e.id, st.recent.length);
      st.recent.push(st.t);
      stats.dissolved++;
      stats.kredi += kredi;
      st.cool.set(cellKey(e.home.x, e.home.z), st.t + ROBOT_SPAWN.coolKilled);
      em.emit({
        type: 'robotDissolved', id: e.id, mob: e.key, name: e.def.name, x: e.x, y: e.y, z: e.z, kredi,
      });
      if (kredi > 0 && typeof user.grantKredi === 'function') user.grantKredi(kredi, 'robot');
    });
  }

  function sweep(player, peaceful, sp) {
    const far2 = sp.despawn * sp.despawn;
    const gone = [];
    em.mobs.forEach((e) => {
      if (!e.def.robot || e.dead || e.removed) return;
      if (peaceful) {
        gone.push([e, true]);
        return;
      }
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      if (dx * dx + dz * dz > far2 || Math.abs(e.y - player.y) > DESPAWN_DY) {
        gone.push([e, false]);
        return;
      }
      if (safeAt(plan, e.x, e.z)) gone.push([e, true]);
    });
    for (let i = 0; i < gone.length; i++) {
      const e = gone[i][0];
      st.cool.set(cellKey(e.home.x, e.home.z), st.t + ROBOT_SPAWN.coolFar);
      if (gone[i][1]) {
        em.dismiss(e, 'mobFade');
        stats.evicted++;
      } else em.despawn(e.id);
      stats.despawned++;
    }
    if (st.cool.size > 600) {
      st.cool.forEach((until, k) => {
        if (until <= st.t) st.cool.delete(k);
      });
    }
  }

  function settle(slot, def) {
    const x = Math.floor(slot.x);
    const z = Math.floor(slot.z);
    const hc = Math.max(1, Math.ceil(def.hitbox.h - 0.05));
    const top = Math.floor(slot.y) + 2;
    let y = -1;
    for (let k = 0; k <= 6; k++) {
      const cy = top - k;
      if (standable(world, x, cy, z, hc, PROBE)) {
        y = cy;
        break;
      }
    }
    if (y < 0) return null;
    if (def.movement === 'uç') {
      const g = groundYBelow(world, slot.x, y + 0.5, slot.z, 10);
      y = (g >= 0 ? g : y) + 1;
    }
    const hw = def.hitbox.w * 0.5;
    if (!isBoxFree(world, slot.x - hw, y + 0.01, slot.z - hw, slot.x + hw, y + def.hitbox.h, slot.z + hw)) return null;
    if (slot.layer === 'surface' && planZoneAt(plan, x, y, z) !== null) return null;
    return y;
  }

  function place(slot) {
    const def = getMobType(slot.key);
    if (!def || !def.robot) return null;
    const y = settle(slot, def);
    const ck = cellKey(slot.x, slot.z);
    if (y === null) {
      st.cool.set(ck, st.t + ROBOT_SPAWN.coolFail);
      return null;
    }
    const ent = em.spawn(slot.key, slot.x, y + 0.02, slot.z, { yaw: slot.yaw, home: { x: slot.x, z: slot.z } });
    if (!ent) return null;
    stats.spawned++;
    em.emit({
      type: 'mobSpawned', id: ent.id, mob: ent.key, x: slot.x, y, z: slot.z, habitat: 'şehir',
    });
    return ent;
  }

  function attempt(player, c) {
    const tier = tierNow();
    const caps = robotCapsFor(tier);
    const sp = robotSpawnFor(tier);
    let pushyNear = 0;
    let pushyWorld = 0;
    let friendNear = 0;
    let friendWorld = 0;
    const near2 = sp.near * sp.near;
    st.occupied.clear();
    em.mobs.forEach((e) => {
      if (!e.def.robot || e.dead) return;
      st.occupied.add(cellKey(e.home.x, e.home.z));
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      const isNear = dx * dx + dz * dz < near2;
      if (e.def.robot.group === 'pushy') {
        pushyWorld++;
        if (isNear) pushyNear++;
      } else {
        friendWorld++;
        if (isNear) friendNear++;
      }
    });
    if (pushyWorld >= caps.pushyWorld && friendWorld >= caps.friendWorld) return;
    stats.attempts++;
    const night = isNight(c);
    const fx = -Math.sin(player.yaw || 0);
    const fz = -Math.cos(player.yaw || 0);
    const R = Math.ceil(sp.maxDist / 16) + 1;
    const offs = chunkOffsets(R);
    const pcx = Math.floor(player.x / 16);
    const pcz = Math.floor(player.z / 16);
    const cand = st.cand;
    cand.length = 0;
    for (let i = 0; i < offs.length; i++) {
      const slots = robotSlotsForChunk(seed, pcx + offs[i][0], pcz + offs[i][1]);
      for (let k = 0; k < slots.length; k++) {
        const s = slots[k];
        const dx = s.x - player.x;
        const dz = s.z - player.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < sp.minDist || d > sp.maxDist) continue;
        if (Math.abs(s.y - player.y) > sp.maxDy) continue;
        const ck = cellKey(s.x, s.z);
        if (st.occupied.has(ck)) continue;
        const until = st.cool.get(ck);
        if (until !== undefined && until > st.t) continue;
        const def = getMobType(s.key);
        if (def.robot.night && s.layer === 'surface' && !night) continue;
        const pushy = isPushyKey(s.key);
        if (pushy ? pushyWorld >= caps.pushyWorld || (d < sp.near && pushyNear >= caps.pushyNear) : friendWorld >= caps.friendWorld || (d < sp.near && friendNear >= caps.friendNear)) continue;
        if (d < sp.coneDist && (fx * dx + fz * dz) / d > CONE_COS) continue;
        if (world.getBlock(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)) === null) continue;
        if (world.getBlock(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)) === undefined) continue;
        cand.push(s);
      }
    }
    if (cand.length === 0) return;
    const pick = cand[(hash3(seed, st.attemptN++, 0x52425420) >>> 0) % cand.length];
    place(pick);
  }

  return {
    hooks,
    stats,
    counts,
    update(dt, player, ctx) {
      if (!(dt > 0) || !player) return;
      const c = ctx || {};
      if (em.robotHooks !== hooks) em.robotHooks = hooks;
      st.t += dt;
      processDead();
      const sp = robotSpawnFor(tierNow());
      st.sweepT -= dt;
      if (st.sweepT <= 0) {
        st.sweepT = ROBOT_SPAWN.sweepEvery;
        sweep(player, !!c.peaceful, sp);
      }
      if (player.dead) return;
      st.attemptT -= dt;
      if (st.attemptT <= 0) {
        st.attemptT = ROBOT_SPAWN.every;
        if (!c.peaceful) attempt(player, c);
      }
    },
    clearMobs() {
      const ids = [];
      em.mobs.forEach((e) => {
        if (e.def.robot) ids.push(e.id);
      });
      for (let i = 0; i < ids.length; i++) em.despawn(ids[i]);
      st.cool.clear();
      st.paid.clear();
      st.recent.length = 0;
      st.attemptT = ROBOT_SPAWN.every;
      st.sweepT = ROBOT_SPAWN.sweepEvery;
      return ids.length;
    },
  };
}
