/*
 * KEŞİF sim/city/ped — KALABALIK (Neon Meridyen Faz 4, paket crowd_ai): şehir yayaları. EntityManager DEĞİL; yürüme ağı üstünde, voxel fiziği yok. SAF, belirlenimci,
 * worker-güvenli, tahsissiz sıcak yol, es2020. Sözleşme §10, §17. Yayalar ASLA zarar görmez; korku/şiddet/suç teması yok.
 *
 *   createCrowd(nav, opts) → crowd           nav: pedNav(seed); opts {seed, quality='high', cap, probe, signals}
 *   crowd.setProbe(probe)                    engel sorgusu (pedProbe.worldProbe / planProbe)
 *   crowd.setSignals(fn(jun, arm, t, out) → {state: PED.*, left, walkIn} | null)   yaya ışığı sağlayıcı (trafficLights.pedSignalInfo ile)
 *   crowd.setTime(t) · setEnv({phase, rain 0..1, night}) · setPlayer(x,y,z,yaw,vx,vz,driving|null) · setVehicles(list, n) · setQuality('low'|'medium'|'high') · setReduced(b)
 *   crowd.populate()                         (yeniden) doldur: aynı (tohum, zaman, oyuncu konumu, kademe) → aynı yayalar (kayıt/yükleme, boyut girişi)
 *   crowd.step(dt)                           sabit adım (20 Hz çağrılır; dt 0,01..0,25)
 *   crowd.fillView(alpha) → view             çizim için: {count, idx[], x,y,z,yaw,speed,phase,rate,gesture,tier,fade,umb,id,look,reduced}; yayalar crowd.peds[idx[k]].look
 *   crowd.pedBlocked(jun, arm) → bool        zebrada yaya var mı → trafik kavşağa girmez (trafficAI hooks.pedBlocked)
 *   crowd.fillObstacles(obs, n, max) → n     yolda yürüyen yayaları trafik engel listesine ekler
 *   crowd.alive() · crowd.target · crowd.tierCount · crowd.stats · crowd.digest() · crowd.reset() · crowd.peds · crowd.ctx
 * Davranışlar: kaldırım/zebra/meydan ağında yürüme, ışıkla ve araç boşluğuyla geçit, çift yürüme, telefon/sohbet, metro çıkış dalgaları, dükkân kuyruğu, kafe, kulüp dansı, turist fotoğrafı,
 * yağmurda şemsiye veya tente altı, oyuncuya tepki (kenara çekilme, el sallama, bakış), araçtan kaçış (asla çarpılmaz).
 */
import { EK } from './pedNav.js';
import { ST, TIER_CAPS } from './pedData.js';
import { PED } from '../vehicle/trafficLights.js';
import {
  POOL, TICK, createCtx, wrapPi,
} from './crowdCore.js';
import {
  GESTURE, dodgeVehicle, gridCell, updateStep, updateWalker, startStep,
} from './crowdMove.js';
import {
  beginSpot, onRainChange, rainStartPed, reactPlayer, resumeWalk, updateSpotState, updateUmbrella, maybeIdle,
} from './crowdSpots.js';
import {
  assignTiers, aliveCount, killPed, trySpawn, updateDespawn, updateEmerge, updateTarget,
} from './crowdSpawn.js';

export { PED, TICK };

const SPOT_STATES = (1 << ST.IDLE) | (1 << ST.CHAT) | (1 << ST.DANCE) | (1 << ST.QUEUE) | (1 << ST.SHELTER) | (1 << ST.LOOK) | (1 << ST.ENTER);
const TIER_STRIDE = [1, 2, 4];

export function createCrowd(nav, opts) {
  const o = opts || {};
  const C = createCtx(nav, o);
  C.quality = TIER_CAPS[o.quality] ? o.quality : 'high';
  C.caps = TIER_CAPS[C.quality];
  C.cap = o.cap > 0 ? o.cap : C.caps.total;
  C.probe = o.probe || null;
  C.signals = o.signals || null;
  C.grid = { head: new Int32Array(1024).fill(-1), next: new Int32Array(POOL) };
  C.localDensity = 0.5;
  C.target = 0;
  C.tierCount = new Int32Array(3);
  C.order = new Int32Array(POOL);
  C.orderN = 0;
  C.nearList = new Int32Array(768);
  C.nearN = 0;
  C.nearAt = -99;
  C.nearAcc = 99; // yakın-kenar yenileme sayacı (C.time geri sarılsa da ilerler: QA4-003)
  C.emergeAt = new Float32Array(nav.spots.length);
  C.emergeQ = [];
  C.spawnAcc = 0;
  C.tierAcc = 0;
  C.targetAcc = 0;
  C.rainFlip = false;
  const key = new Int32Array(1024 * 4).fill(-1);
  for (let i = 0; i < nav.crossings.length; i++) {
    const c = nav.crossings[i];
    if (c.jun * 4 + c.arm < key.length) key[c.jun * 4 + c.arm] = i;
  }
  C.cross.key = key;
  const V = {
    count: 0,
    idx: new Int32Array(POOL),
    x: new Float32Array(POOL),
    y: new Float32Array(POOL),
    z: new Float32Array(POOL),
    yaw: new Float32Array(POOL),
    speed: new Float32Array(POOL),
    phase: new Float32Array(POOL),
    rate: new Float32Array(POOL),
    gesture: new Uint8Array(POOL),
    tier: new Uint8Array(POOL),
    fade: new Float32Array(POOL),
    umb: new Float32Array(POOL),
    id: new Uint32Array(POOL),
    lookYaw: new Float32Array(POOL),
    sky: new Float32Array(POOL),
    blk: new Float32Array(POOL),
    reduced: false,
    version: 0,
  };

  /* -------------------------------------------------------------------------------------------- */
  function rebuildGrid() {
    const G = C.grid;
    G.head.fill(-1);
    for (let i = 0; i < C.peds.length; i++) {
      const p = C.peds[i];
      if (!p.alive) continue;
      const h = gridCell(p.x, p.z);
      G.next[i] = G.head[h];
      G.head[h] = i;
    }
  }

  function refreshNear() {
    const pl = C.player;
    if (!pl.valid) {
      C.nearN = 0;
      return;
    }
    C.nearN = nav.edgesNear(pl.x, pl.z, C.caps.spawnMax + 30, C.nearList);
    C.nearAt = C.time;
    C.nearAcc = 0;
  }

  function updateOne(p, dt) {
    if (p.fadeDir > 0 && p.fade < 1) p.fade = Math.min(1, p.fade + dt * 2.2);
    else if (p.fadeDir < 0) {
      p.fade -= dt * (p.state === ST.ENTER ? 2.6 : 1.6);
      if (p.fade <= 0) {
        killPed(C, p);
        return;
      }
    }
    p.t += dt;
    updateUmbrella(C, p, dt);
    const st = p.state;
    if (((SPOT_STATES >> st) & 1) === 1 && dodgeVehicle(C, p)) {
      updateStep(C, p, dt);
      reactPlayer(C, p, dt);
      return;
    }
    if (st === ST.STEP) updateStep(C, p, dt);
    else if (((SPOT_STATES >> st) & 1) === 1) {
      if (p.spot < 0 && (st === ST.IDLE || st === ST.CHAT)) idleInPlace(p, dt);
      else updateSpotState(C, p, dt);
    } else {
      updateWalker(C, p, dt);
      if (p.goalArrived) {
        if (!beginSpot(C, p)) {
          p.goalArrived = false;
          p.goal = -1;
          p.role = 0;
        }
      } else if (p.state === ST.WALK && p.goal < 0 && p.idleVisit !== p.visits && p.s < 1.0 && nav.ekind[p.e] !== EK.CROSS) {
        // düğüme yeni girdi: seyrek telefon/sohbet molası
        p.idleVisit = p.visits;
        maybeIdle(C, p);
      }
    }
    reactPlayer(C, p, dt);
  }

  /** Yerinde telefon/sohbet (mekânsız). */
  function idleInPlace(p, dt) {
    p.speed = Math.max(0, p.speed - 5 * dt);
    p.phaseRate = 0;
    p.tmr -= dt;
    if (p.state === ST.CHAT && p.partner >= 0) {
      const q = C.peds[p.partner];
      if (q.alive) {
        const want = Math.atan2(-(q.x - p.x), -(q.z - p.z));
        p.yaw += wrapPi(want - p.yaw) * Math.min(1, 6 * dt);
        if (q.state !== ST.CHAT && q.spot < 0) p.tmr = 0;
      } else p.tmr = 0;
    }
    if (p.tmr <= 0) {
      p.state = ST.WALK;
      p.gesture = p.umb > 0.5 ? GESTURE.UMBRELLA : GESTURE.NONE;
      p.blockedT = 0;
    }
  }

  const crowd = {
    nav,
    ctx: C,
    peds: C.peds,
    view: V,
    stats: C.stats,
    get target() {
      return C.target;
    },
    get tierCount() {
      return C.tierCount;
    },
    get time() {
      return C.time;
    },
    get raining() {
      return C.raining;
    },
    get quality() {
      return C.quality;
    },
    get caps() {
      return C.caps;
    },
    setProbe(p) {
      C.probe = p;
    },
    setSignals(fn) {
      C.signals = typeof fn === 'function' ? fn : null;
    },
    setTime(t) {
      C.time = Number.isFinite(t) ? t : 0;
    },
    setEnv(e) {
      if (!e) return;
      if (Number.isFinite(e.phase)) C.phase = e.phase - Math.floor(e.phase);
      if (e.night !== undefined) C.night = !!e.night;
      if (Number.isFinite(e.rain)) {
        C.rain = e.rain;
        const was = C.raining;
        if (e.rain > 0.45) C.raining = true;
        else if (e.rain < 0.2) C.raining = false;
        if (was !== C.raining) onRainChange(C);
      }
    },
    setPlayer(x, y, z, yaw, vx, vz, driving) {
      const pl = C.player;
      if (x === null || x === undefined || !Number.isFinite(x + z)) {
        pl.valid = false;
        return;
      }
      pl.valid = true;
      pl.x = x;
      pl.y = y;
      pl.z = z;
      pl.yaw = yaw || 0;
      pl.fx = -Math.sin(pl.yaw);
      pl.fz = -Math.cos(pl.yaw);
      pl.vx = vx || 0;
      pl.vz = vz || 0;
      pl.driving = !!driving;
    },
    setVehicles(list, n) {
      C.veh.list = list;
      C.veh.n = n === undefined ? list.length : n;
    },
    setQuality(q) {
      if (!TIER_CAPS[q] || q === C.quality) return;
      C.quality = q;
      C.caps = TIER_CAPS[q];
      C.cap = C.caps.total;
    },
    setCap(n) {
      C.cap = Math.max(0, Math.min(C.caps.total, n | 0));
    },
    setReduced(b) {
      C.reduced = !!b;
      V.reduced = C.reduced;
    },
    alive() {
      return aliveCount(C);
    },
    populate() {
      for (let i = 0; i < C.peds.length; i++) if (C.peds[i].alive) killPed(C, C.peds[i]);
      for (let i = 0; i < C.spotOcc.length; i++) C.spotOcc[i].fill(-1);
      C.spotNext.fill(0);
      C.emergeAt.fill(0);
      C.emergeQ.length = 0;
      C.blocked.fill(0);
      C.nextId = 1;
      C.spawnN = (Math.floor(C.time / 8) & 0xfffff) * 1024;
      C.tick = 0;
      V.count = 0;
      if (!C.probe || !C.player.valid) return 0;
      refreshNear();
      updateTarget(C);
      C.target = Math.max(0, Math.min(C.cap, this.targetNow()));
      for (let k = 0; k < C.target * 14 && aliveCount(C) < C.target; k++) trySpawn(C, true);
      rebuildGrid();
      assignTiers(C);
      for (let i = 0; i < C.peds.length; i++) {
        const p = C.peds[i];
        if (p.alive) {
          p.t0 = C.time - TICK;
          p.t1 = C.time;
          p.px = p.x;
          p.pz = p.z;
        }
      }
      return aliveCount(C);
    },
    targetNow() {
      const caps = C.caps;
      const d = Math.max(0.2, C.localDensity) * (C.raining ? 0.82 : 1);
      const t = Math.round(Math.min(C.cap, caps.total) * Math.min(1, d + 0.04));
      return Math.max(Math.min(6, caps.total), Math.min(C.cap, t));
    },
    step(dt) {
      const d = dt > 0 ? (dt > 0.25 ? 0.25 : dt) : TICK;
      if (!C.probe) return;
      C.time += d;
      C.tick++;
      C.sweeps = 0;
      C.nearAcc += d;
      if (C.nearAcc > 1.2 || C.time - C.nearAt > 1.2) refreshNear();
      C.targetAcc += d;
      if (C.targetAcc >= 1.5) {
        C.targetAcc = 0;
        updateTarget(C);
        C.target = Math.min(C.cap, this.targetNow());
      }
      rebuildGrid();
      // sıcak döngü: kademeye göre adım aralığı
      const peds = C.peds;
      for (let i = 0; i < peds.length; i++) {
        const p = peds[i];
        if (!p.alive) continue;
        p.acc += d;
        const stride = TIER_STRIDE[p.tier] || 1;
        if (stride > 1 && (C.tick + i) % stride !== 0) continue;
        const dtp = p.acc;
        p.acc = 0;
        p.px = p.x;
        p.pz = p.z;
        p.pyaw = p.yaw;
        p.t0 = p.t1;
        p.t1 = C.time;
        updateOne(p, dtp);
        if (!Number.isFinite(p.x + p.z + p.yaw)) killPed(C, p);
      }
      // geçit doluluğu (trafik pedBlocked)
      const occ = C.cross.occ;
      const tc = C.cross.touched;
      for (let k = 0; k < tc.length; k++) occ[tc[k]] = 0;
      tc.length = 0;
      for (let i = 0; i < peds.length; i++) {
        const p = peds[i];
        if (!p.alive || p.e < 0 || nav.ekind[p.e] !== EK.CROSS) continue;
        const c = nav.crossings[nav.ecross[p.e]];
        if (p.s > c.roadA - 1.0 && p.s < c.roadB + 0.6 && (p.state === ST.CROSS || p.state === ST.WALK || p.state === ST.STEP)) {
          if (occ[c.id] === 0) tc.push(c.id);
          occ[c.id]++;
        }
      }
      // tier / doğma / silme
      C.tierAcc += d;
      if (C.tierAcc >= 0.25) {
        C.tierAcc = 0;
        assignTiers(C);
        updateDespawn(C);
      }
      C.spawnAcc += d;
      if (C.spawnAcc >= 0.2) {
        C.spawnAcc = 0;
        const alive = aliveCount(C);
        if (alive < C.target) trySpawn(C, false);
        updateEmerge(C, d);
      }
      // yağmur yeni doğanlara
      if (C.raining !== C.rainFlip) C.rainFlip = C.raining;
    },
    fillView(alpha) {
      const a = alpha > 0 ? (alpha > 1 ? 1 : alpha) : 0;
      const renderT = C.time - TICK + a * TICK;
      let n = 0;
      for (let i = 0; i < C.peds.length; i++) {
        const p = C.peds[i];
        if (!p.alive) continue;
        const span = p.t1 - p.t0;
        let u = span > 1e-4 ? (renderT - p.t0) / span : 1;
        if (u < 0) u = 0;
        else if (u > 2.2) u = 2.2;
        if (p.state === ST.WAIT || p.speed < 0.02) u = Math.min(u, 1);
        const wy = wrapPi(p.yaw - p.pyaw);
        V.idx[n] = i;
        V.x[n] = p.px + (p.x - p.px) * u;
        V.y[n] = p.y;
        V.z[n] = p.pz + (p.z - p.pz) * u;
        V.yaw[n] = p.pyaw + wy * Math.min(1, u);
        V.speed[n] = p.speed;
        const dtp = renderT - p.t1;
        V.phase[n] = p.phase + p.phaseRate * (dtp < -0.3 ? -0.3 : dtp > 0.3 ? 0.3 : dtp);
        V.rate[n] = p.phaseRate;
        V.gesture[n] = p.gesture;
        V.tier[n] = p.tier;
        V.fade[n] = p.fade;
        V.umb[n] = p.umb;
        V.id[n] = p.id;
        V.lookYaw[n] = p.lookYaw;
        V.sky[n] = p.sky;
        V.blk[n] = p.blk;
        n++;
      }
      V.count = n;
      V.version++;
      return V;
    },
    pedBlocked(jun, arm) {
      const k = jun * 4 + arm;
      const id = k >= 0 && k < C.cross.key.length ? C.cross.key[k] : -1;
      return id >= 0 && C.cross.occ[id] > 0;
    },
    fillObstacles(obs, n, max) {
      let c = n;
      const pl = C.player;
      for (let i = 0; i < C.peds.length && c < max; i++) {
        const p = C.peds[i];
        if (!p.alive || p.e < 0) continue;
        if (nav.ekind[p.e] !== EK.CROSS || (p.state !== ST.CROSS && p.state !== ST.STEP)) continue;
        if (pl.valid) {
          const dx = p.x - pl.x;
          const dz = p.z - pl.z;
          if (dx * dx + dz * dz > 90 * 90) continue;
        }
        const o = obs[c++];
        o.x = p.x; o.y = p.y; o.z = p.z; o.yaw = p.yaw; o.hl = 0.32; o.hw = 0.32; o.vx = -Math.sin(p.yaw) * p.speed; o.vz = -Math.cos(p.yaw) * p.speed; o.kind = 4;
      }
      return c;
    },
    digest() {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < C.peds.length; i++) {
        const p = C.peds[i];
        if (!p.alive) continue;
        h ^= (p.id & 0xffff) | 0;
        h = Math.imul(h, 16777619) >>> 0;
        h ^= Math.round(p.x * 10) & 0xffff;
        h = Math.imul(h, 16777619) >>> 0;
        h ^= Math.round(p.z * 10) & 0xffff;
        h = Math.imul(h, 16777619) >>> 0;
        h ^= (p.state & 15) | (p.look.cTop << 4);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h >>> 0;
    },
    reset() {
      for (let i = 0; i < C.peds.length; i++) if (C.peds[i].alive) killPed(C, C.peds[i]);
      C.spotOcc.forEach((a) => a.fill(-1));
      C.cross.occ.fill(0);
      C.cross.touched.length = 0;
      C.emergeQ.length = 0;
      V.count = 0;
    },
    /** Sunucu çağıran: yaya silme/yeniden-bağlama yardımcıları (testler/hata ayıklama). */
    forceStep(p, ex, ez) {
      startStep(C, p, ex, ez, 0.3);
    },
    resume(p) {
      resumeWalk(C, p);
    },
    rainStart(p) {
      rainStartPed(C, p);
    },
  };
  return crowd;
}
