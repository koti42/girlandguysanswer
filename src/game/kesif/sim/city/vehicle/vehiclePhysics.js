/*
 * KEŞİF sim/city/vehicle — ARAÇ FİZİĞİ (Neon Meridyen Faz 3, paket vehicle_phys). Sabit 60 Hz, arcade-sim, BELİRLENİMCİ, SAF
 * (three/DOM/Math.random/Date.now yok; worker-güvenli; es2020). Sözleşme KESIF_CITY_CONTRACT §9; tasarım design_vehicles.md §2.
 *
 * ── GENEL API (diğer paketler yalnız bunu kullanır) ───────────────────────────────────────────────────────────────────────────────────
 *   createVehicle(cls, opts?) → v        opts {id, propId, x,y,z,yaw, cosmetics, nitro, owner}
 *   stepVehicle(v, input, world, dt, ctx?) → events[]        dt = 1/60 (büyükse ≤ 1/30'luk parçalara bölünür). world: getBlock(x,y,z) [+ colliders]
 *   setPose(v, x, y, z, yaw)             hızları sıfırlar, ışınlar (denetimsiz)       parkVehicle(v)   hızları sıfırlar (park halinde)
 *   resetToRoad(v, world, ctx) → bool    ctx.roadSnap(x,z,y)→{x,y,z,yaw} ile en yakın yola ışınlar; yoksa son sağlam poz / en yakın boş zemin
 *   findFreePose(world, d, x,y,z,yaw, opts) → {x,y,z,yaw}|null     boş ve zeminli en yakın poz (doğma/çıkış güvenliği)      d = v.def
 *   vehicleObb(v, out?) → {cx,cz,hl,hw,fx,fz,rx,rz,y0,y1}           aabbOf(v, out?) → {minX..maxZ} (ColliderIndex.setDynamic için)
 *   hudOf(v, out?) → {cls,kmh,gear,nitro,drift,camera}               serializeVehicle(v) / restoreVehicle(raw, extra?) → v | null
 *   VEHICLE_EVENTS · FIXED_DT · physicsDigest(v) (belirlenimcilik testleri için sayısal özet)
 *
 * ── GİRDİ (input; tümü isteğe bağlı, sonlu olmayan değer 0 sayılır) ──────────────────────────────────────────────────────────────────
 *   steer −1..1 (+ sağ)  throttle 0..1  brake 0..1  handbrake bool  nitro bool  hop bool (Süzülkay zıplaması; kenar tetikli)
 *   steerDirect bool (dokunmatik direksiyon: yumuşatma ~4× hızlı)
 * ── ctx (isteğe bağlı) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 *   wet 0..1 (uWet: ıslak yol = daha az tutuş, daha uzun fren)   roadSnap(x,z,y) → poz|null   chunkAhead(x,z) → bool (akış bekçisi)
 *   isSoft(colliderId) → bool (yaya gibi yumuşak çarpışma: hafif itme, darbe yok)
 * ── DURUM (v; render/ses/HUD okur) ───────────────────────────────────────────────────────────────────────────────────────────────────
 *   x,y,z (y = alt yüz = tekerlek temas düzlemi) yaw vx,vy,vz u(ileri) w(yanal) yawRate steer wheelAngle(rad) wheelSpin(rad) pitch(+burun yukarı) roll(+sağ aşağı)
 *   onGround airT nitro(0..100) nitroOn drift driftT skid(0..1) gear(−1 R,1..5) rpm(0..1) shiftT throttle brake handbrake bumpT(sn) hazardT(sn)
 *   inWater waterT governed(akış bekçisi) stuckT km(odometre, km) dmg (0..1 kozmetik hasar; yalnız görsel, çarpmalarla artar, kayda girer) events[]  lights {brake, reverse}  def (sınıf tanımı)
 * ── OLAYLAR (stepVehicle dönüşü = v.events; her çağrıda sıfırlanır) ──────────────────────────────────────────────────────────────────
 *   bump {impact,nx,nz,x,y,z,soft,id}   scrape {impact}   land {impact}   shift {from,to}   nitroStart nitroEnd   driftBoost {gain}   hop   style {spins}
 *   splash   waterRespawn   unstick   resetRoad   recover   edge (su kenarı korkuluğu)   fell
 *
 * Model: u (ileri) ve w (yanal) gövde hızları; dünya hızı (vx,vz) momentumu taşır. Boyuna: motor ivmesi accel·gaz·(1−(u/max)^6)·tork(devir)·vites boşalması,
 * fren (ıslakta −%30), motor freni; dönüş: kinematik bisiklet δ = steer·kilit/(1+(|u|/14)²), ω = −u/dingil·tan δ (≤ ωMax); yanal sönüm exp(−gripK·dt)
 * (azami yanal ivme latG·24·(1−0,4·ıslak); el freni: gripK→handGrip, yaw ×1,25 → sürüklenme). Çarpışma: OBB ↔ voxel kutuları + ColliderIndex (SAT, kayma);
 * alt adım sayısı ceil(|v|·dt/0,35) ≤ 4 → 51 m/s'de tünelleme yok. Düşey: 4 tekerlek zemin düzlemi, 1 blokluk basamak |u| ≥ 4 iken rampa gibi çıkılır. Basamak payı: tekerlekliler 0,6 (yavaş) / 1,05 (|u| ≥ 4), süzülenler 1,1; referans tekerlekliler için en yüksek tekerlek teması (gTop), süzülenler için y.
 */
import { isVehicleClass } from './vehicleData.js';
import { shiftFactor, torqueFactor, updateGearbox } from './vehicleGearbox.js';
import { CONTACT, gatherObstacles, resolveObb } from './vehicleWorld.js';
import { climbAssist, stepOf, verticalStep } from './vehicleVertical.js';
import { findFreePose, resetToRoad } from './vehiclePose.js';
import {
  aabbOf, createVehicle, hudOf, parkVehicle, physicsDigest, restoreVehicle, serializeVehicle, setPose, vehicleObb,
} from './vehicleState.js';

export {
  aabbOf, createVehicle, findFreePose, hudOf, parkVehicle, physicsDigest, resetToRoad, restoreVehicle, serializeVehicle, setPose, vehicleObb, isVehicleClass,
};

export const FIXED_DT = 1 / 60;
export const VEHICLE_EVENTS = Object.freeze([
  'bump', 'scrape', 'land', 'shift', 'nitroStart', 'nitroEnd', 'driftBoost', 'hop', 'style', 'splash', 'waterRespawn', 'unstick', 'resetRoad', 'recover', 'edge', 'fell',
]);

const GRAVITY = 24;
const SUB_DIST = 0.35;
const MAX_SUB = 4;
const MAX_CHUNK = 1 / 30;
const POWER_N = 6;
const NITRO_BURN = 25;
const NITRO_REGEN = 6;
const DRIFT_BOOST_SEC = 1.2;
const BUMP_IMPACT = 6;
const STOP_EPS = 0.05; // m/sn: ardışık fren-geri kilidi bunun altında tutmaz (QA5-A-001)
const ZERO_HELD = new WeakSet(); // önceki alt adımda fren-geri sıfır kilidi tuttu (araç başına; durum şekli/kayıt değişmez)
const NO_INPUT = Object.freeze({});
const NO_CTX = Object.freeze({});

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sign = (x) => (x < 0 ? -1 : 1);

/* ------------------------------------------------------------------------------------------------
 * Girdi okuma
 * ---------------------------------------------------------------------------------------------- */
const INP = {
  steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false, hop: false, steerDirect: false,
};
function readInput(i) {
  const s = i || NO_INPUT;
  INP.steer = clamp(num(s.steer), -1, 1);
  INP.throttle = clamp(num(s.throttle), 0, 1);
  INP.brake = clamp(num(s.brake), 0, 1);
  INP.handbrake = s.handbrake === true;
  INP.nitro = s.nitro === true;
  INP.hop = s.hop === true;
  INP.steerDirect = s.steerDirect === true;
  return INP;
}

function finiteState(v) {
  return Number.isFinite(v.x + v.y + v.z + v.yaw + v.vx + v.vy + v.vz + v.yawRate + v.spin + v.steer + v.nitro + v.u + v.w + v.pitch + v.roll);
}

/* ------------------------------------------------------------------------------------------------
 * Ana adım
 * ---------------------------------------------------------------------------------------------- */
export function stepVehicle(v, input, world, dt, ctx) {
  const ev = v.events;
  ev.length = 0;
  if (!(dt > 0) || !Number.isFinite(dt) || !world) return ev;
  const c = ctx || NO_CTX;
  const inp = readInput(input);
  if (!finiteState(v)) recover(v, world, c, ev);
  let left = dt > 0.25 ? 0.25 : dt;
  while (left > 1e-9) {
    const h = left > MAX_CHUNK ? MAX_CHUNK : left;
    left -= h;
    stepOnce(v, inp, world, c, h, ev);
  }
  return ev;
}

function recover(v, world, c, ev) {
  const g = v.good;
  v.vx = 0; v.vy = 0; v.vz = 0; v.u = 0; v.w = 0; v.yawRate = 0; v.spin = 0; v.steer = 0; v.pitch = 0; v.roll = 0; v.aLong = 0; v.latAcc = 0;
  if (!Number.isFinite(v.nitro)) v.nitro = 100;
  if (g.ok && Number.isFinite(g.x + g.y + g.z + g.yaw)) {
    v.x = g.x; v.y = g.y; v.z = g.z; v.yaw = g.yaw;
  } else if (!Number.isFinite(v.x + v.y + v.z + v.yaw)) {
    v.x = 0; v.y = 64; v.z = 0; v.yaw = 0;
  }
  ev.push({ type: 'recover' });
  resetToRoad(v, world, c);
}

function stepOnce(v, inp, world, c, dt, ev) {
  const d = v.def;
  const wet = clamp(num(c.wet), 0, 1);
  const hover = d.hover > 0;
  const speed = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
  const sa = stepOf(d, v.u, climbAssist(v, inp));
  // akış bekçisi: önde veri yoksa azami hız ×0,6
  let governed = false;
  if (typeof c.chunkAhead === 'function' && speed > 2) {
    const look = Math.max(10, speed * 1.2);
    governed = !c.chunkAhead(v.x + (v.vx / speed) * look, v.z + (v.vz / speed) * look);
  }
  v.governed = governed;

  // engel tamponu (adım başına bir kez)
  const R = Math.sqrt(d.length * d.length + d.width * d.width) * 0.5 + speed * dt + 0.9;
  const n = gatherObstacles(world, world.colliders || null, {
    x0: v.x - R,
    x1: v.x + R,
    z0: v.z - R,
    z1: v.z + R,
    y: v.y,
    h: d.height,
    step: Math.max(sa, d.step[1]),
    rails: !hover && v.onGround && !v.inWater,
    ignoreId: v.propId,
    isSoft: c.isSoft,
  });
  const subs = clamp(Math.ceil((speed * dt) / SUB_DIST), 1, MAX_SUB);
  const h = dt / subs;
  CONTACT.unresolved = false;
  let unresolved = false;
  for (let s = 0; s < subs; s++) {
    subStep(v, d, inp, world, c, h, n, wet, governed, ev);
    if (CONTACT.unresolved) unresolved = true;
  }

  // adım sonu: vites/ışık/zamanlayıcılar
  const sp2 = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
  updateGearbox(v, d, v.u, v.throttle, dt, ev);
  v.lights.brake = (v.brake > 0.05 && v.u > -0.3) || v.handbrake;
  v.lights.reverse = v.u < -0.3;
  if (v.bumpT > 0) v.bumpT = v.bumpT > dt ? v.bumpT - dt : 0;
  if (v.hazardT > 0) v.hazardT = v.hazardT > dt ? v.hazardT - dt : 0;
  if (v.bumpCool > 0) v.bumpCool = v.bumpCool > dt ? v.bumpCool - dt : 0;
  if (v.edgeCool > 0) v.edgeCool = v.edgeCool > dt ? v.edgeCool - dt : 0;
  v.km += (sp2 * dt) / 1000;
  // takılma / sıkışma izleme
  const trying = inp.throttle > 0.4 || inp.brake > 0.4;
  if (trying && sp2 < 0.5 && v.onGround && !v.inWater) v.stuckT += dt;
  else v.stuckT = v.stuckT > dt * 2 ? v.stuckT - dt * 2 : 0;
  // basamak yardımı kilidi (vehicleVertical.climbAssist): takılma ≥ 0,3 sn sürerse 0,8 sn açık kalır
  if (trying && v.stuckT > 0.3 && !(v.wedgeT > 0)) v.climbT = 0.8;
  else if (v.climbT > 0) v.climbT = v.climbT > dt ? v.climbT - dt : 0;
  if (unresolved) v.wedgeT += dt;
  else v.wedgeT = v.wedgeT > dt * 3 ? v.wedgeT - dt * 3 : 0;
  if (v.wedgeT > 0.35 || v.stuckT > 6) autoUnstick(v, world, c, ev);
  // dünya sınırı (QA4-007): sınır dışı hücreler BEDROCK duvarıdır ama hover/süzülen araç yüksek basamak payıyla duvarı tırmanıp tepesinden dışarı uçabiliyordu → konum sınır içine kenetlenir
  const wb = world.bounds;
  if (wb && Number.isFinite(wb.minCx + wb.maxCx + wb.minCz + wb.maxCz)) {
    const x0 = wb.minCx * 16 + 1.5;
    const x1 = (wb.maxCx + 1) * 16 - 1.5;
    const z0 = wb.minCz * 16 + 1.5;
    const z1 = (wb.maxCz + 1) * 16 - 1.5;
    let hit = false;
    if (v.x < x0) { v.x = x0; if (v.vx < 0) v.vx = 0; hit = true; } else if (v.x > x1) { v.x = x1; if (v.vx > 0) v.vx = 0; hit = true; }
    if (v.z < z0) { v.z = z0; if (v.vz < 0) v.vz = 0; hit = true; } else if (v.z > z1) { v.z = z1; if (v.vz > 0) v.vz = 0; hit = true; }
    if (hit) {
      v.u *= 0.5;
      if (v.y > world.yMax - 2) v.y = world.yMax - 2;
    }
  }
  // düşüş / dünya dışı
  const kill =world.killPlaneY !== undefined ? world.killPlaneY : -460;
  if (v.y < kill + 8 || v.fallT > 6) {
    ev.push({ type: 'fell' });
    if (!resetToRoad(v, world, c)) setPose(v, v.good.x, v.good.y, v.good.z, v.good.yaw);
  }
  if (!finiteState(v)) recover(v, world, c, ev);
  else if (v.onGround && !v.inWater && !unresolved) {
    v.good.x = v.x; v.good.y = v.y; v.good.z = v.z; v.good.yaw = v.yaw; v.good.ok = true;
  }
}

function autoUnstick(v, world, c, ev) {
  const wedged = v.wedgeT > 0.35;
  v.wedgeT = 0;
  v.stuckT = 0;
  const d = v.def;
  if (wedged) {
    // gövde katıya gömülü: en yakın boş zemin
    const free = findFreePose(world, d, v.x, v.y, v.z, v.yaw, { maxR: 4, ignoreId: v.propId });
    if (free) {
      v.x = free.x; v.y = free.y; v.z = free.z;
      v.vx = 0; v.vz = 0; v.u = 0; v.w = 0; v.spin = 0;
      ev.push({ type: 'unstick' });
      return;
    }
  } else {
    // gaz/fren basılı ama 6 sn ilerlenemedi: aracı geriye (1,5 / 3 m) boş yere al
    const fx = -Math.sin(v.yaw);
    const fz = -Math.cos(v.yaw);
    for (let k = 1; k <= 2; k++) {
      const free = findFreePose(world, d, v.x - fx * 1.5 * k, v.y, v.z - fz * 1.5 * k, v.yaw, { maxR: 1.5, ignoreId: v.propId });
      if (free) {
        v.x = free.x; v.y = free.y; v.z = free.z;
        v.vx = 0; v.vz = 0; v.u = 0; v.w = 0; v.spin = 0;
        ev.push({ type: 'unstick' });
        return;
      }
    }
  }
  resetToRoad(v, world, c);
  ev.push({ type: 'unstick' });
}

/* ------------------------------------------------------------------------------------------------
 * Alt adım
 * ---------------------------------------------------------------------------------------------- */
function subStep(v, d, inp, world, c, h, nObs, wet, governed, ev) {
  const hover = d.hover > 0;
  let sy = Math.sin(v.yaw);
  let cy = Math.cos(v.yaw);
  let fx = -sy;
  let fz = -cy;
  let rx = cy;
  let rz = -sy;
  let u = v.vx * fx + v.vz * fz;
  let w;
  const powered = v.onGround || (hover && v.airT < 0.35);

  // ── direksiyon yumuşatma (üstel)
  const tgt = inp.steer;
  const k = inp.steerDirect ? 18 : Math.abs(tgt) < Math.abs(v.steer) ? 7 : 4.5;
  v.steer += (tgt - v.steer) * (1 - Math.exp(-k * h));
  if (Math.abs(v.steer) < 1e-5) v.steer = 0;

  // ── nitro
  if (!inp.nitro) v.nitroLock = false; // tank tükenince tuş bırakılana dek yeniden devreye girmez
  const wantNitro = inp.nitro && !v.nitroLock && v.nitro > (v.nitroOn ? 0.01 : 5) && (inp.throttle > 0.05 || u > 3) && !v.inWater;
  if (wantNitro && !v.nitroOn) ev.push({ type: 'nitroStart' });
  else if (!wantNitro && v.nitroOn) ev.push({ type: 'nitroEnd' });
  v.nitroOn = wantNitro;
  if (v.nitroOn) {
    v.nitro -= NITRO_BURN * h;
    if (v.nitro <= 0.01) {
      v.nitro = 0;
      v.nitroLock = true;
    }
    v.nitroIdle = 0;
  } else {
    v.nitroIdle += h;
    if (v.nitroIdle > 1 && v.nitro < 100) v.nitro = Math.min(100, v.nitro + NITRO_REGEN * h);
  }
  let maxEff = d.max * (v.nitroOn ? d.nitro.spd : 1);
  let accEff = d.accel * (v.nitroOn ? d.nitro.acc : 1);
  if (governed) {
    maxEff *= 0.6;
    accEff *= 0.3;
  }
  if (v.inWater) maxEff = Math.min(maxEff, 3);

  // ── boyuna
  const t = inp.throttle;
  const b = inp.brake;
  const hb = inp.handbrake && d.kind !== 'tahta'; // Süzülkay'da Space = zıplama (el freni yok)
  const brakeEff = powered ? d.brake * (1 - 0.3 * wet) : 0;
  let a = 0;
  if (powered) {
    if (t > 0.02 && u > -0.6) {
      const x = u > 0 ? u / maxEff : 0;
      let kk = 1 - Math.pow(x, POWER_N);
      if (kk < -0.6) kk = -0.6;
      a = accEff * t * kk * torqueFactor(v.rpm) * shiftFactor(v) * (1 - 0.1 * wet);
    } else if (t > 0.02) {
      a = brakeEff * t; // geri giderken gaz = fren
    }
    if (b > 0.02) {
      if (u > 0.5) a -= brakeEff * b;
      else if (t <= 0.02) {
        const xr = clamp(-u / (0.3 * d.max), 0, 1.2);
        a -= d.accel * 0.6 * b * (1 - xr * xr);
      }
    }
    if (t <= 0.02 && b <= 0.02) {
      const drag = 0.12 * Math.abs(u) + 0.6;
      a -= sign(u) * Math.min(drag, Math.abs(u) / h);
    }
    if (hb && Math.abs(u) > 0.01) a -= sign(u) * Math.min(5, Math.abs(u) / h);
  } else {
    a = -sign(u) * Math.min(0.02 * Math.abs(u), Math.abs(u) / h); // havada küçük hava direnci
  }
  let un = u + a * h;
  // frenle sıfırı geçme: geri vitese yalnız fren basılı tutulursa (sıfır çizgisinde bir an durulur).
  // QA5-A-001: durma kilidi YALNIZ BİR alt adım tutar. Durmuş araçta kalıntı yanal hız w, yaw ile döndükçe ileri eksene ±1e-10 u yansır; kalıntı pozitifse eski kilit
  // her alt adımda u'yu yeniden 0'a çekiyor, fren sonsuza dek basılı kalsa da geri vites hiç açılmıyordu (işaretin yazı-turası; kalıntı negatifse geri giderdi).
  // Önceki alt adım da fren-geri bölgesinde kilitlediyse (ardışık kilit = kalıntı u) ve u ≤ STOP_EPS ise ivme serbest bırakılır; normal duruşta davranış aynı (kilit, sonra geri).
  const brakeRev = b > 0.02 && t <= 0.02 && !hb; // fren-geri ivmesi bölgesi
  let held = false;
  if (u > 0 && un < 0 && (b > 0.02 || t <= 0.02 || hb)) {
    if (brakeRev && u <= STOP_EPS && ZERO_HELD.has(v)) { /* ardışık kilit: serbest bırak */ } else {
      un = 0;
      held = brakeRev;
    }
  } else if (u < 0 && un > 0 && t <= 0.02) un = 0;
  if (held) ZERO_HELD.add(v);
  else ZERO_HELD.delete(v);
  const du = un - u;
  v.aLong += (du / h - v.aLong) * Math.min(1, 8 * h);
  // boyuna ivme ESKİ eksende uygulanır
  const v1x = v.vx + fx * du;
  const v1z = v.vz + fz * du;
  u = un;

  // düşük gripli sınıflar (hover/tahta) yavaşken hassas: tutuş hızla azalır
  const baseGrip = hb ? d.handGrip : d.gripK < 6 ? d.gripK + (7 - d.gripK) * Math.exp(-Math.abs(un) / 5) : d.gripK;

  // ── dönüş (kinematik bisiklet)
  const steerRad = (d.steerDeg * Math.PI) / 180;
  const ua = Math.abs(u);
  const delta = (v.steer * steerRad) / (1 + (ua / 14) * (ua / 14));
  v.wheelAngle = delta;
  let omegaT = 0;
  if (powered || (d.kind === 'tahta' && !v.onGround)) {
    omegaT = -(u / d.wheelbase) * Math.tan(delta);
    if (d.kind === 'tahta' && !v.onGround) omegaT = -v.steer * d.omegaMax * 0.8;
    const om = d.omegaMax * (hb ? 1.25 : 1) * (1 - 0.08 * wet);
    if (hb && u > 5) omegaT = -v.steer * d.omegaMax * 0.4; // el freni: hıza bağlı olmayan sürüklenme dönüşü
    omegaT = clamp(omegaT, -om, om);
    if (ua < 0.15 && d.kind !== 'tahta') omegaT = 0;
    // ayna etkisi: büyük kayma açısında (kayma > 0,12 rad) baş, hız yönüne doğru döner → sürüklenme kontrollü kalır, kendiliğinden toparlanır
    if (u > 1.5 && v.onGround) {
      const slip = Math.atan2(v1x * rx + v1z * rz, u);
      const expect = Math.atan(Math.abs(omegaT) / Math.max(0.5, hb ? d.gripK : baseGrip)); // dengeli dönüşte beklenen kayma
      const ex = Math.abs(slip) - expect - 0.1;
      if (ex > 0) omegaT -= sign(slip) * ex * 3.2 * (hb ? 0.7 : 1);
    }
  }
  v.yawRate += (omegaT - v.yawRate) * (1 - Math.exp(-14 * h));
  if (v.spin !== 0) {
    v.spin *= Math.exp(-4.5 * h);
    if (Math.abs(v.spin) < 1e-3) v.spin = 0;
  }
  v.yaw += (v.yawRate + v.spin) * h;
  if (v.yaw > 1e4 || v.yaw < -1e4) v.yaw %= Math.PI * 2;
  // yeni eksenler; dünya hızı (momentum) sabit → u,w yeniden hesaplanır
  sy = Math.sin(v.yaw);
  cy = Math.cos(v.yaw);
  fx = -sy; fz = -cy; rx = cy; rz = -sy;
  u = v1x * fx + v1z * fz;
  w = v1x * rx + v1z * rz;

  // ── yanal tutuş (sınırlı yanal ivme)
  const grip = baseGrip * (1 - 0.35 * wet) * (powered ? 1 : 0.15);
  const aLatMax = d.latG * GRAVITY * (1 - 0.4 * wet) * (hb ? 0.35 : 1) * (powered ? 1 : 0.2);
  if (w !== 0) {
    let dw = w - w * Math.exp(-grip * h);
    const lim = aLatMax * h;
    if (Math.abs(dw) > lim) dw = sign(w) * lim;
    w -= dw;
  }
  if (v.inWater) {
    u *= Math.exp(-2.2 * h);
    w *= Math.exp(-4 * h);
  }
  if (!hover && Math.abs(u) < 0.05 && t <= 0.02 && b <= 0.02) u = 0;
  v.latAcc = -v.yawRate * u;

  // ── drift
  const drifting = Math.abs(u) > 8 && Math.abs(w) > 0.25 * Math.abs(u) && v.onGround;
  v.drift = drifting;
  v.skid = v.onGround ? clamp((Math.abs(w) - 1.2) / 5, 0, 1) : 0;
  if (drifting) {
    v.driftT += h;
    if (v.driftT >= DRIFT_BOOST_SEC) {
      v.driftT -= DRIFT_BOOST_SEC;
      if (v.nitro < 100) {
        const gain = Math.min(25, 100 - v.nitro);
        v.nitro += gain;
        ev.push({ type: 'driftBoost', gain });
      }
    }
  } else if (v.driftT > 0) v.driftT = Math.max(0, v.driftT - h * 2);

  v.u = u;
  v.w = w;
  v.vx = fx * u + rx * w;
  v.vz = fz * u + rz * w;
  v.throttle = t;
  v.brake = b;
  v.handbrake = hb;
  v.wheelSpin += (u / d.wheelR) * h;
  if (v.wheelSpin > 1e4 || v.wheelSpin < -1e4) v.wheelSpin %= Math.PI * 2;

  // ── konum + çarpışma
  v.x += v.vx * h;
  v.z += v.vz * h;
  const sa = stepOf(d, u, climbAssist(v, inp));
  const cc = CONTACT;
  if (nObs > 0) resolveObb(v, d, nObs, sa, h, true);
  else {
    cc.hit = false; cc.count = 0; cc.impact = 0; cc.unresolved = false; cc.torque = 0; cc.kind = 0; cc.soft = false; cc.rail = false;
  }
  if (cc.hit) {
    v.u = v.vx * fx + v.vz * fz;
    v.w = v.vx * rx + v.vz * rz;
    if (cc.torque !== 0) v.spin += cc.torque;
    if (cc.impact > BUMP_IMPACT && !cc.soft && !cc.rail) {
      v.vx *= 0.88; v.vz *= 0.88; v.u *= 0.88; v.w *= 0.88;
      if (v.bumpCool <= 0) {
        v.bumpCool = 0.25;
        v.bumpT = 0.25;
        v.hazardT = 3;
        v.dmg = Math.min(1, v.dmg + cc.impact * 0.012); // yalnız görsel hasar (HP yok)
        ev.push({
          type: 'bump', impact: cc.impact, nx: cc.nx, nz: cc.nz, x: v.x, y: v.y, z: v.z, soft: false, id: cc.id,
        });
      }
    } else if (cc.soft && cc.impact > 1) {
      v.vx *= 0.6; v.vz *= 0.6; v.u *= 0.6; v.w *= 0.6;
      if (v.bumpCool <= 0) {
        v.bumpCool = 0.4;
        ev.push({
          type: 'bump', impact: cc.impact, nx: cc.nx, nz: cc.nz, x: v.x, y: v.y, z: v.z, soft: true, id: cc.id,
        });
      }
    } else if (cc.rail && cc.impact > 0.8 && v.edgeCool <= 0) {
      v.edgeCool = 1.5;
      ev.push({ type: 'edge', x: v.x, z: v.z });
    } else if (cc.impact > 2 && v.bumpCool <= 0) {
      v.bumpCool = 0.25;
      ev.push({ type: 'scrape', impact: cc.impact });
    }
  }

  // ── düşey
  const yBefore = v.y;
  verticalStep(v, d, world, h, inp, (veh) => resetToRoad(veh, world, c));
  // QA5-A2: düşey adım gövdeyi çözümden SONRA oynatır (süzülen hop'ta yükselirken tepesi bir üst blok hücresine girer / basamak payı küçülür); poz bir kare engele gömülü kalırdı.
  // Düşey hareket olduysa çözüm bir kez daha yürür (yalnız konum; çarpma olayı/hız darbesi yeniden sayılmaz, unresolved korunur).
  if (nObs > 0 && v.y !== yBefore) {
    const un = CONTACT.unresolved;
    resolveObb(v, d, nObs, stepOf(d, v.u, climbAssist(v, inp)), h, false);
    if (un) CONTACT.unresolved = true;
  }
}
