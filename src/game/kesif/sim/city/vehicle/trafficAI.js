/*
 * KEŞİF sim/city/vehicle — TRAFİK YAPAY ZEKÂSI (Neon Meridyen Faz 3, paket traffic_ai). SAF: three/DOM/Math.random/Date.now yok, worker-güvenli, es2020,
 * tahsissiz sıcak yol. Sözleşme §9; tasarım design_vehicles.md §3.
 *
 *   createTraffic(tn, opts) → traffic        tn: junctions.buildTrafficNet / trafficNet(seed)
 *        opts {seed, cap=30, closed=false (testlerde kapalı ağ: oyuncu halkası yok, doğan araç silinmez), spawnMin=70, spawnMax=130, despawnR=150, behindR=100,
 *              tick=1/20, hooks:{pedBlocked(junctionId, arm)→bool}}
 *   traffic.setTime(t)                      dünya zamanı (ışık fazı ve belirlenimli doğma tabanı)
 *   traffic.setPlayer(x, y, z, camYaw)      doğma/silme halkası merkezi (null → halka yok)
 *   traffic.setHooks({pedBlocked})          Faz 4 yaya kancası (zebra doluysa dönen/geçen araç kavşağa girmez)
 *   traffic.setObstacles(list, n)           {x,z,yaw,hl,hw,vx,vz,kind}: oyuncu aracı, park araç, yaya… (koridor testi; araçlar yol verir/durur)
 *   traffic.setEnv({phase, rain, night})    gün fazı (yoğunluk), yağmur (hız ×0,85, yoğunluk ×0,8), farlar
 *   traffic.setCap(n)                       kademe tavanı (30/18/10; −25% bütçe kesintisi)
 *   traffic.populate()                      (yeniden) doldurma: aynı (tohum, zaman, oyuncu) → aynı araçlar (kayıt/yükleme, boyut değişimi)
 *   traffic.step(dt)                        sabit adım (20 Hz; 15 Hz düşük); dt ≈ tick
 *   traffic.spawnAt(deId, lane, s, {cls, v, color}) → car | null    belirli yere araç (test/görev/hata ayıklama)
 *   traffic.bump(id, hold=1.5)              oyuncu çarptı: araç 1,5 sn durur, uyarı ışıkları yanar (hasar yok)
 *   traffic.fillView(alpha) / traffic.view  render/ses/harita için: {count, x,y,z,yaw,pitch,speed,cls,color,accent,flags,fade,id,steer}
 *        traffic.frameAlpha ≥ 0 ise (systems/traffic.js her karede yazar) fillView verilen alpha'yı yok sayıp onu kullanır → çizici fillView(1) çağırsa da akıcı ara değer
 *   traffic.stats                           {spawned, despawned, grants, denials, crossings, redRuns, gapClamps, wallClamps, watchdog, …}
 *   traffic.cars (havuz) · traffic.alive() · traffic.carById(id) · traffic.events (honk…)
 *
 * Dosyalar: trafficLights (ışık planı) · junctions (ağ/kavşak/hareket/çatışma) · trafficCars (sınıf/özellik/havuz) · trafficFollow (IDM/engel/yoğunluk) ·
 * trafficReserve (rezervasyon) · trafficDrive (her aracın ivmesi, yol verme, şerit değişimi) · trafficAI (bu dosya: adım, doğma/silme, görünüm) · systems/traffic.js (oyuna bağlama).
 *
 * Araç durumu: mode 1 = şerit (de, lane, s: merkez), mode 2 = kavşak içi (mv, p: merkez, DUR çizgisinden yay uzunluğu).
 * Kurallar: şerit takibi IDM; DUR çizgisi sanal engeldir (kırmızı/sarı/rezervasyon yok); kavşağa giriş = rezervasyon; çıkış şeridi boşluğu; U dönüşü yok;
 * çatışmasız (rezervasyon), kırmızıda geçen yok (sert sınır geri dönüşü sayacı wallClamps ≈ 0 olmalıdır), min boşluk > 0,5 m (gapClamps ≈ 0).
 */
import { subHash } from '../../dim/dimensions.js';
import { SIG, armSignal, armSignalLeft } from './trafficLights.js';
import {
  CAR_FLAG, TCLASS, makeCarPool, resetCar, rollCarAttrs,
} from './trafficCars.js';
import { movePose, lanePose, yAt } from './junctions.js';
import { B_MAX, densityMul, obstacleInfo } from './trafficFollow.js';
import { decideBox, decideLane, maybeLaneChange, updateYield } from './trafficDrive.js';
import {
  laneList, pathBlocked, purgeCar, releaseGrant, rtOf,
} from './trafficReserve.js';

export const TICK = 1 / 20;
const FADE_IN = 0.7;
const FADE_OUT = 0.6;
const MIN_GAP = 0.6;
const WATCHDOG_S = 25;
const TAG_SPAWN = 0xc0c1;
const TAG_ROUTE = 0xc0c2;
const TAG_SPOT = 0xc0c3;
const MAX_LANES = 3;

const _pose = { x: 0, y: 0, z: 0, yaw: 0 };

function smooth(x) {
  return x * x * (3 - 2 * x);
}

export function createTraffic(tn, opts) {
  const o = opts || {};
  const seed = (o.seed === undefined ? tn.seed : o.seed) | 0;
  const closed = !!o.closed;
  const dedges = tn.dedges;
  const junctions = tn.junctions;
  const tick = o.tick > 0 ? o.tick : TICK;
  const R = {
    min: closed ? 0 : o.spawnMin === undefined ? 70 : o.spawnMin,
    max: closed ? Infinity : o.spawnMax === undefined ? 130 : o.spawnMax,
    despawn: closed ? Infinity : o.despawnR === undefined ? 150 : o.despawnR,
    behind: closed ? Infinity : o.behindR === undefined ? 100 : o.behindR,
  };
  let cap = o.cap > 0 ? o.cap | 0 : 30;
  const POOL = Math.max(cap, 30) + 12; // havuz kademeden bağımsız (kademe değişince tavan yükselebilir)
  const cars = makeCarPool(POOL);
  const lanes = new Array(dedges.length * MAX_LANES);
  for (let i = 0; i < lanes.length; i++) lanes[i] = [];
  const TS = {
    tn,
    t: 0,
    lanes,
    rt: new Array(junctions.length),
    hooks: o.hooks || {},
    obstacles: [],
    nObs: 0,
    events: null,
    deny: '',
    stats: {
      spawned: 0, despawned: 0, grants: 0, revokes: 0, crossings: 0, redRuns: 0, gapClamps: 0, wallClamps: 0, watchdog: 0, laneChanges: 0, honks: 0, bumps: 0,
      denials: {
        conflict: 0, queue: 0, approach: 0, space: 0, obstacle: 0, ped: 0,
      },
      maxTicketAge: 0, deadEnds: 0,
    },
  };
  const env = {
    phase: 0.25, rain: false, night: false, speedMul: 1,
  };
  const player = {
    valid: false, x: 0, y: 0, z: 0, yaw: 0, fx: 0, fz: -1,
  };
  const view = {
    count: 0,
    cap: POOL,
    x: new Float32Array(POOL),
    y: new Float32Array(POOL),
    z: new Float32Array(POOL),
    yaw: new Float32Array(POOL),
    pitch: new Float32Array(POOL),
    speed: new Float32Array(POOL),
    cls: new Uint8Array(POOL),
    color: new Uint8Array(POOL),
    accent: new Uint8Array(POOL),
    flags: new Uint8Array(POOL),
    fade: new Float32Array(POOL),
    id: new Uint32Array(POOL),
    steer: new Float32Array(POOL),
    version: 0,
  };
  const events = [];
  TS.events = events;
  let spawnN = 0;
  let nextId = 1;
  let ring = [];
  let ringAt = -99;
  let spawnAcc = 0;
  let aliveN = 0;
  const idMap = new Map();

  /* ---------------------------------------------------------------- yardımcılar */
  function alive() {
    return aliveN;
  }

  function carById(id) {
    return idMap.get(id) || null;
  }

  function targetCount() {
    if (closed) return cap;
    const m = densityMul(env.phase) * (env.rain ? 0.8 : 1);
    return Math.max(0, Math.round(cap * m));
  }

  function freeCar() {
    for (let i = 0; i < cars.length; i++) if (!cars[i].alive) return cars[i];
    return null;
  }

  /* ---------------------------------------------------------------- rota seçimi */
  function planMove(c) {
    const de = dedges[c.de];
    const J = junctions[de.to];
    const list = J.movesBy[de.armTo][c.lane];
    if (!list || list.length === 0) {
      c.mv = null;
      return;
    }
    // ağırlıklar: düz 0,62 · sağ 0,2 · sol 0,18; tercih edilmeyen şeritten dönüş 0,25 çarpanı
    let tot = 0;
    const w = [0, 0, 0, 0];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const base = m.turn === 0 ? 0.62 : m.turn === 1 ? 0.2 : 0.18;
      w[i] = base * (m.preferred ? 1 : 0.25);
      tot += w[i];
    }
    const h = (subHash(c.seed | 0, J.id * 16 + (c.passN & 15), TAG_ROUTE) >>> 0) / 4294967296;
    let x = h * tot;
    let pick = list.length - 1;
    for (let i = 0; i < list.length; i++) {
      if (x < w[i]) {
        pick = i;
        break;
      }
      x -= w[i];
    }
    c.mv = list[pick];
  }

  /* ---------------------------------------------------------------- doğma */
  function rebuildRing() {
    ring = [];
    const px = player.x;
    const pz = player.z;
    for (let i = 0; i < dedges.length; i++) {
      const de = dedges[i];
      if (!de) continue;
      if (!closed) {
        const mx = de.x0 + de.hx * de.D * 0.5;
        const mz = de.z0 + de.hz * de.D * 0.5;
        const d = Math.hypot(mx - px, mz - pz);
        if (d > R.max + de.D * 0.5 + 8 || d < R.min - de.D * 0.5 - 8) continue;
      }
      ring.push(de);
    }
    ringAt = TS.t;
  }

  function spawnOne(initial) {
    if (aliveN >= POOL - 2) return false;
    const n = ++spawnN;
    const hh = subHash(seed, n, TAG_SPAWN) >>> 0;
    if (ring.length === 0) return false;
    const de = ring[hh % ring.length];
    const lane = (hh >>> 9) % de.lanes;
    const c = freeCar();
    if (!c) return false;
    resetCar(c);
    rollCarAttrs(c, seed, n);
    const u = (subHash(seed, n, TAG_SPOT) >>> 0) / 4294967296;
    const smin = de.s0 + 5 + c.halfLen;
    const smax = de.s1 - 8 - c.halfLen;
    if (smax <= smin) return false;
    const s = smin + u * (smax - smin);
    lanePose(de, lane, s, _pose);
    if (!closed) {
      const dd = Math.hypot(_pose.x - player.x, _pose.z - player.z);
      if (dd < R.min || dd > R.max) return false;
      if (player.valid) {
        const rx = _pose.x - player.x;
        const rz = _pose.z - player.z;
        const cosA = (rx * player.fx + rz * player.fz) / (dd || 1);
        // arkada ve silme yarıçapı dışında doğup hemen silinmesin
        if (dd > R.behind && cosA < 0) return false;
        // kamera konisi içinde doğma (görünür belirme) yalnız araç sayısı hedefin çok altındaysa
        if (!initial && cosA > 0.62 && dd < R.min + 28 && aliveN >= Math.ceil(targetCount() * 0.4)) return false;
      }
    }
    // şerit boşluğu
    const list = laneList(TS, de.id, lane);
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      if (Math.abs(q.s - s) < q.halfLen + c.halfLen + 12) return false;
    }
    if (exitBusy(de)) return false;
    // oyuncu / engel yakınlığı
    for (let i = 0; i < TS.nObs; i++) {
      const ob = TS.obstacles[i];
      const dx = ob.x - _pose.x;
      const dz = ob.z - _pose.z;
      if (dx * dx + dz * dz < 14 * 14) return false;
    }
    finishSpawn(c, de, lane, s, initial, list, -1);
    return true;
  }

  /** Bu kenara kavşaktan çıkmak üzere rezervasyonu olan (kutuda ya da kuyruğu henüz çıkmamış) araç var mı? Varsa hemen çıkış noktasının önüne doğma olmaz. */
  function exitBusy(de) {
    const rt = TS.rt[de.from];
    if (!rt) return false;
    const g = rt.grants;
    for (let i = 0; i < g.length; i++) if (g[i].grantMv && g[i].grantMv.deOut === de.id) return true;
    return false;
  }

  /** Araç nesnesini şeride yerleştirir (başlangıç hızı güvenli: çizgide durabilir, öndekinden hızlı değil). vOverride ≥ 0 ise o hız (yine de üst sınırlı). */
  function finishSpawn(c, de, lane, s, initial, list, vOverride) {
    c.alive = true;
    c.state = 1;
    c.id = nextId++;
    c.mode = 1;
    c.de = de.id;
    c.lane = lane;
    c.s = s;
    c.fade = initial ? 1 : 0;
    c.passN = 0;
    planMove(c);
    const J = junctions[de.to];
    const v0 = de.limit * c.v0f * env.speedMul;
    let v = vOverride >= 0 ? Math.min(vOverride, v0) : v0 * 0.9;
    const dLine = de.s1 - (s + c.halfLen);
    const st = armSignal(J.plan, de.armTo, TS.t);
    // her durumda çizgide durabilecek hız (ışık sonradan değişebilir / rezervasyon verilmeyebilir)
    v = Math.min(v, Math.sqrt(2 * (st === SIG.GREEN ? 3.5 : 3) * Math.max(dLine - (st === SIG.GREEN ? 3 : 5), 0)));
    if (c.mv && c.mv.vmax < v) v = Math.min(v, Math.sqrt(c.mv.vmax * c.mv.vmax + 4 * Math.max(dLine, 0)));
    let ahead = null;
    for (let i = 0; i < list.length; i++) if (list[i].s > s) {
      ahead = list[i];
      break;
    }
    if (ahead) {
      const gap = ahead.s - s - ahead.halfLen - c.halfLen;
      v = Math.min(v, ahead.v, Math.sqrt(2 * 2.5 * Math.max(gap - c.s0, 0)));
    }
    c.v = v;
    // yerleştir
    let i = 0;
    while (i < list.length && list[i].s < s) i++;
    list.splice(i, 0, c);
    placeCar(c);
    calcFlags(c);
    c.px = c.x; c.py = c.y; c.pz = c.z; c.pyaw = c.yaw; c.ppitch = c.pitch;
    idMap.set(c.id, c);
    aliveN++;
    TS.stats.spawned++;
  }

  function removeCar(c, kind) {
    purgeCar(TS, c);
    idMap.delete(c.id);
    resetCar(c);
    aliveN--;
    if (kind === 'despawn') TS.stats.despawned++;
  }

  /* ---------------------------------------------------------------- poz */
  function placeCar(c) {
    if (c.mode === 1) {
      const de = dedges[c.de];
      let off = (c.lane + 0.5) * de.laneW;
      if (c.lcP < 1) {
        const offFrom = (c.laneFrom + 0.5) * de.laneW;
        off = offFrom + (off - offFrom) * smooth(c.lcP);
      }
      off += c.lat;
      c.x = de.x0 + de.hx * c.s + de.rx * off;
      c.z = de.z0 + de.hz * c.s + de.rz * off;
      c.y = yAt(de, c.s);
      c.yaw = de.yaw;
      const sl = (yAt(de, c.s + 1.5) - yAt(de, c.s - 1.5)) / 3;
      c.pitchT = Math.atan(sl);
    } else {
      movePose(c.mv, c.p, _pose);
      c.x = _pose.x;
      c.z = _pose.z;
      c.y = _pose.y;
      c.yaw = _pose.yaw;
      c.pitchT = c.mv.len > 0 ? Math.atan((c.mv.yOut - c.mv.yIn) / c.mv.len) : 0;
    }
    c.pitch += (c.pitchT - c.pitch) * 0.35;
  }

  /** Render/ses bayrakları: fren (yavaşlama/duruş), far (gece/yağmur), uyarı (çarpma/engel), sinyal (dönüşe 30 m kala). */
  function calcFlags(c) {
    let f = c.flags & CAR_FLAG.TAXI;
    if (c.acc < -0.7 || (c.v < 0.4 && (c.sigWait || c.mode === 1))) f |= CAR_FLAG.BRAKE;
    if (env.night) f |= CAR_FLAG.HEAD;
    if (c.hold > 0 || c.obsWait > 8) f |= CAR_FLAG.HAZARD;
    const mv = c.mv;
    if (mv && mv.turn !== 0) {
      let near = c.mode === 2;
      if (!near) near = dedges[c.de].s1 - c.s < 30;
      if (near) f |= mv.turn === 1 ? CAR_FLAG.BLINK_R : CAR_FLAG.BLINK_L;
    }
    c.flags = f;
  }

  /* ---------------------------------------------------------------- karar (ivme) */
  /* ---------------------------------------------------------------- geçişler */
  function enterBox(c) {
    const de = dedges[c.de];
    const mv = c.grantMv;
    const J = junctions[de.to];
    const rt = rtOf(TS, J);
    const l = lanes[c.de * MAX_LANES + c.lane];
    const i = l.indexOf(c);
    if (i >= 0) l.splice(i, 1);
    if (c.lcP < 1) {
      const l2 = lanes[c.de * MAX_LANES + c.laneFrom];
      const i2 = l2.indexOf(c);
      if (i2 >= 0) l2.splice(i2, 1);
      c.lcP = 1;
    }
    c.mode = 2;
    c.mv = mv;
    c.J = J.id;
    c.p = Math.max(0, c.s - de.s1);
    rt.boxCars.push(c);
    rt.crossings = (rt.crossings | 0) + 1;
    TS.stats.crossings++;
  }

  function exitBox(c) {
    const mv = c.mv;
    const J = junctions[mv.j];
    const rt = rtOf(TS, J);
    const i = rt.boxCars.indexOf(c);
    if (i >= 0) rt.boxCars.splice(i, 1);
    const dOut = dedges[mv.deOut];
    c.mode = 1;
    c.J = -1;
    c.de = mv.deOut;
    c.lane = mv.outLane;
    c.laneFrom = c.lane;
    c.lcP = 1;
    c.s = dOut.s0 + (c.p - mv.len);
    c.p = 0;
    c.clear = false;
    c.relS = dOut.s0 + c.halfLen + 0.3;
    c.passN++;
    c.lat = 0;
    lanes[c.de * MAX_LANES + c.lane].unshift(c);
    planMove(c);
  }

  /* ---------------------------------------------------------------- ana adım */
  const accs = new Float64Array(POOL);

  function stepOnce(dt) {
    TS.t += dt;
    const t = TS.t;
    let n = 0;
    // A) karar
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) continue;
      n++;
      c.age += dt;
      if (c.hold > 0) c.hold -= dt;
      if (c.mode === 1) {
        updateYield(TS, c, dt);
        maybeLaneChange(TS, c, dt);
        accs[i] = decideLane(TS, env, c, dt);
      } else accs[i] = decideBox(TS, env, c, dt);
      if (c.hold > 0) accs[i] = Math.min(accs[i], -B_MAX * 0.85);
      if (c.state === 2) accs[i] = Math.min(accs[i], 0);
    }
    // B1) bütünleştir
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) continue;
      let a = accs[i];
      if (a < -B_MAX) a = -B_MAX;
      else if (a > c.aMax) a = c.aMax;
      c.acc = a;
      const v1 = Math.max(0, c.v + a * dt);
      const ds = 0.5 * (c.v + v1) * dt;
      c.px = c.x; c.py = c.y; c.pz = c.z; c.pyaw = c.yaw; c.ppitch = c.pitch;
      c.v = v1;
      if (c.mode === 1) c.s += ds;
      else c.p += ds;
    }
    // B2) güvenlik: şerit sıralı boşluk + DUR çizgisi sert sınırı
    for (let li = 0; li < lanes.length; li++) {
      const l = lanes[li];
      if (l.length === 0) continue;
      const de = dedges[(li / MAX_LANES) | 0];
      for (let k = l.length - 1; k >= 0; k--) {
        const c = l[k];
        if (k + 1 < l.length) {
          const q = l[k + 1];
          const maxS = q.s - q.halfLen - c.halfLen - MIN_GAP;
          if (c.s > maxS) {
            TS.lastGap = {
              t: TS.t, id: c.id, ldr: q.id, s: c.s, maxS, v: c.v, lv: q.v, acc: c.acc, de: c.de, lane: c.lane, age: c.age, qage: q.age, clear: c.clear, lc: c.lcP, qlc: q.lcP,
            };
            const prevS = c.s - c.v * dt;
            c.s = Math.max(Math.min(c.s, maxS), Math.min(prevS, maxS));
            if (c.v > q.v) c.v = q.v;
            TS.stats.gapClamps++;
          }
        }
        if (!c.clear && c.s + c.halfLen > de.s1 - 0.05) {
          TS.lastWall = {
            t: TS.t, id: c.id, de: c.de, v: c.v, acc: c.acc, s: c.s, s1: de.s1, st: armSignal(junctions[de.to].plan, de.armTo, TS.t), left: armSignalLeft(junctions[de.to].plan, de.armTo, TS.t), holdJ: c.holdJ, revokes: TS.stats.revokes, ticketJ: c.ticketJ, deny: TS.deny,
          };
          c.s = de.s1 - 0.05 - c.halfLen;
          c.v = 0;
          TS.stats.wallClamps++;
        }
      }
    }
    // B3) geçişler, rezervasyon bırakma, takılma bekçisi
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) continue;
      if (c.mode === 1) {
        const de = dedges[c.de];
        if (c.holdJ >= 0 && c.relS > 0 && c.s >= c.relS) {
          releaseGrant(TS, c);
          c.relS = 0;
        }
        // kırmızı ihlali ölçümü: ön tampon DUR çizgisini bu adımda geçti ve ışık en az 0,25 sn'dir kırmızı mı?
        const front = de.s1 - (c.s + c.halfLen);
        if (c.lastFront > 0 && front <= 0 && c.lastDe === c.de) {
          const J = junctions[de.to];
          if (armSignal(J.plan, de.armTo, t) === SIG.RED && armSignal(J.plan, de.armTo, t - 0.25) === SIG.RED) TS.stats.redRuns++;
        }
        c.lastFront = front;
        c.lastDe = c.de;
        if (c.s >= de.s1 && c.clear && c.grantMv) enterBox(c);
        else if (c.s >= de.s1) {
          c.s = de.s1 - 0.05;
          c.v = 0;
          TS.stats.wallClamps++;
        }
      } else {
        const mv = c.mv;
        if (c.p >= mv.len) exitBox(c);
      }
      // takılma bekçisi
      if (c.v < 0.1 && !c.sigWait && c.obsWait === 0 && c.hold <= 0) c.stuckT += dt;
      else c.stuckT = 0;
    }
    // C) poz + bayraklar
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) continue;
      placeCar(c);
      calcFlags(c);
      if (c.state === 1) {
        if (c.fade < 1) c.fade = Math.min(1, c.fade + dt / FADE_IN);
      } else {
        c.fade -= dt / FADE_OUT;
      }
    }
    // D) silme + bekçi + doğma
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c.alive) continue;
      if (c.state === 2) {
        if (c.fade <= 0) removeCar(c, 'despawn');
        continue;
      }
      if (c.mode === 1 && !c.mv && c.v < 0.2) {
        TS.stats.deadEnds++;
        c.state = 2;
        continue;
      }
      if (!closed && player.valid) {
        const dx = c.x - player.x;
        const dz = c.z - player.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R.despawn * R.despawn || (d2 > R.behind * R.behind && dx * player.fx + dz * player.fz < 0)) {
          c.state = 2;
          continue;
        }
      }
      if (c.stuckT > WATCHDOG_S) {
        TS.stats.watchdog++;
        TS.lastWatch = {
          t: TS.t, id: c.id, mode: c.mode, de: c.de, lane: c.lane, s: c.s, p: c.p, v: c.v, clear: c.clear, holdJ: c.holdJ, ticketJ: c.ticketJ, ticketActive: c.ticketActive, deny: TS.deny, mv: c.mv ? [c.mv.j, c.mv.local] : null, hold: c.hold, obsWait: c.obsWait, J: c.mode === 1 ? dedges[c.de].to : c.J,
        };
        c.stuckT = 0;
        const visible = player.valid && Math.hypot(c.x - player.x, c.z - player.z) < 45;
        if (!visible || closed) c.state = 2;
      }
      if (c.obsWait > 60) {
        c.obsWait = 0;
        if (!(player.valid && Math.hypot(c.x - player.x, c.z - player.z) < 45)) c.state = 2;
      }
    }
    // bilet yaşı ölçümü (canlılık): en eski bekleyen istek
    if (((TS.t * 20 + 0.5) | 0) % 20 === 0) {
      for (let jn = 0; jn < TS.rt.length; jn++) {
        const rt = TS.rt[jn];
        if (!rt) continue;
        const q = rt.queue;
        for (let k = 0; k < q.length; k++) {
          const age = t - q[k].ticketT;
          if (age > TS.stats.maxTicketAge) TS.stats.maxTicketAge = age;
        }
      }
    }
    // hedefin üstündeki fazla araçlar (kademe düşürme, yağmur, gece): en uzaktakini solarak sil (0,5 sn'de bir)
    if (!closed && player.valid && (((TS.t * 20 + 0.5) | 0) % 10 === 0)) {
      let active = 0;
      for (let i = 0; i < cars.length; i++) if (cars[i].alive && cars[i].state === 1) active++;
      const tgt = targetCount();
      if (active > tgt + 2) {
        let far = null;
        let fd = -1;
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i];
          if (!c.alive || c.state !== 1) continue;
          const dx = c.x - player.x;
          const dz = c.z - player.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > fd) {
            fd = d2;
            far = c;
          }
        }
        if (far) far.state = 2;
      }
    }
    // doğma
    spawnAcc += dt;
    if (!closed && player.valid && t - ringAt > 1) rebuildRing();
    if (spawnAcc >= 0.25 && aliveN < targetCount() && (closed || player.valid)) {
      spawnAcc = 0;
      for (let k = 0; k < 6 && aliveN < targetCount(); k++) if (spawnOne(false)) break;
    }
    if (spawnAcc > 1) spawnAcc = 1;
    return n;
  }

  /* ---------------------------------------------------------------- dış API */
  const traffic = {
    tn,
    cars,
    view,
    events,
    stats: TS.stats,
    TS,
    seed,
    tick,
    R,
    frameAlpha: -1,
    alive,
    carById,
    get time() {
      return TS.t;
    },
    setTime(t) {
      TS.t = Number.isFinite(t) ? t : 0;
    },
    setCap(n) {
      cap = Math.max(0, Math.min(POOL - 12, n | 0)); // en çok 30 (havuz − 12)
    },
    getCap() {
      return cap;
    },
    setPlayer(x, y, z, yaw) {
      if (x === null || x === undefined || !Number.isFinite(x + z)) {
        player.valid = false;
        return;
      }
      player.valid = true;
      player.x = x;
      player.y = y;
      player.z = z;
      player.yaw = yaw || 0;
      player.fx = -Math.sin(player.yaw);
      player.fz = -Math.cos(player.yaw);
    },
    /** Yaya (Faz 4) kancaları: pedBlocked(junctionId, arm) → true ise o kolun zebrasından geçecek hareket kavşağa giremez (araç yol verir). */
    setHooks(h) {
      TS.hooks = h || {};
    },
    setObstacles(list, n) {
      TS.obstacles = list;
      TS.nObs = n === undefined ? list.length : n;
    },
    setEnv(e) {
      if (!e) return;
      if (e.phase !== undefined) env.phase = e.phase;
      if (e.rain !== undefined) env.rain = !!e.rain;
      if (e.night !== undefined) env.night = !!e.night;
      env.speedMul = env.rain ? 0.85 : 1;
    },
    populate() {
      for (let i = 0; i < cars.length; i++) if (cars[i].alive) removeCar(cars[i], 'reset');
      TS.rt.length = 0;
      TS.rt.length = junctions.length;
      for (let i = 0; i < lanes.length; i++) lanes[i].length = 0;
      idMap.clear();
      aliveN = 0;
      nextId = 1;
      spawnN = (Math.floor(TS.t) & 0xfffff) * 4096;
      spawnAcc = 0;
      events.length = 0;
      if (closed || player.valid) {
        rebuildRing();
        const tgt = targetCount();
        for (let k = 0; k < tgt * 40 && aliveN < tgt; k++) spawnOne(true);
      }
      return aliveN;
    },
    reset() {
      for (let i = 0; i < cars.length; i++) if (cars[i].alive) removeCar(cars[i], 'reset');
      TS.rt.length = 0;
      TS.rt.length = junctions.length;
      for (let i = 0; i < lanes.length; i++) lanes[i].length = 0;
      idMap.clear();
      aliveN = 0;
      events.length = 0;
    },
    step(dt) {
      const d = dt > 0 ? (dt > 0.1 ? 0.1 : dt) : tick;
      return stepOnce(d);
    },
    /** Belirli yönlü kenar/şerit/konuma araç koyar (test, görev, hata ayıklama). o {cls 0..3, v, color}. Boş değilse null. */
    spawnAt(deId, lane, sPos, o) {
      const de = dedges[deId];
      if (!de || !(lane >= 0 && lane < de.lanes) || !Number.isFinite(sPos) || aliveN >= POOL - 2) return null;
      const c = freeCar();
      if (!c) return null;
      resetCar(c);
      const n = ++spawnN;
      rollCarAttrs(c, seed, n);
      if (o && o.cls >= 0 && o.cls < TCLASS.length) {
        const k = TCLASS[o.cls | 0];
        c.cls = k.idx; c.len = k.len; c.halfLen = k.halfLen; c.halfWid = k.halfWid; c.aMax = k.aMax; c.bComf = k.bComf; c.T = k.T; c.s0 = k.s0;
        c.flags = c.color === 2 && k.idx === 0 ? CAR_FLAG.TAXI : 0;
      }
      if (o && o.color >= 0) c.color = o.color & 15;
      const list = laneList(TS, deId, lane);
      for (let i = 0; i < list.length; i++) if (Math.abs(list[i].s - sPos) < list[i].halfLen + c.halfLen + 2) return null;
      if (exitBusy(de)) return null;
      finishSpawn(c, de, lane, sPos, true, list, o && o.v >= 0 ? o.v : -1);
      return c;
    },
    bump(id, hold) {
      const c = idMap.get(id);
      if (!c) return false;
      c.hold = hold > 0 ? hold : 1.5;
      c.v = Math.min(c.v, 1.5);
      TS.stats.bumps++;
      return true;
    },
    /** Render/ses/harita için ara değerli görünüm (alpha 0..1 = son adımdan beri geçen oran). */
    fillView(alpha) {
      // frameAlpha: systems/traffic.js her karede 20 Hz adımına göre doğru ara değeri yazar; çizicinin verdiği alpha (ör. 1) yerine o kullanılır
      let a = traffic.frameAlpha >= 0 ? traffic.frameAlpha : alpha;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      let k = 0;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c.alive) continue;
        view.x[k] = c.px + (c.x - c.px) * a;
        view.y[k] = c.py + (c.y - c.py) * a;
        view.z[k] = c.pz + (c.z - c.pz) * a;
        let dy = c.yaw - c.pyaw;
        if (dy > Math.PI) dy -= Math.PI * 2;
        else if (dy < -Math.PI) dy += Math.PI * 2;
        view.yaw[k] = c.pyaw + dy * a;
        view.pitch[k] = c.ppitch + (c.pitch - c.ppitch) * a;
        view.speed[k] = c.v;
        view.cls[k] = c.cls;
        view.color[k] = c.color;
        view.accent[k] = c.accent;
        view.flags[k] = c.flags;
        view.fade[k] = c.fade < 0 ? 0 : c.fade > 1 ? 1 : c.fade;
        view.id[k] = c.id;
        view.steer[k] = c.mode === 2 && c.mv ? (c.mv.turn === 1 ? 0.5 : c.mv.turn === 2 ? -0.5 : 0) : 0;
        k++;
      }
      view.count = k;
      view.version++;
      return view;
    },
    digest() {
      // belirlenimcilik özeti (testler)
      let h = 0x811c9dc5;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c.alive) continue;
        const vals = [c.id, c.cls, c.color, Math.round(c.x * 100), Math.round(c.z * 100), Math.round(c.v * 100), c.mode, c.de, c.lane];
        for (let k = 0; k < vals.length; k++) {
          h ^= vals[k] | 0;
          h = Math.imul(h, 0x01000193);
        }
      }
      return h >>> 0;
    },
    pathBlocked,
    obstacleInfo,
  };
  return traffic;
}
