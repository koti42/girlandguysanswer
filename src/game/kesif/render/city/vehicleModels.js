/*
 * KEŞİF render/city — ARAÇ GÖRSEL KATMANI (Neon Meridyen Faz 3, paket vehicle_render). Sözleşme §9, §17.
 *
 * Neon-gelecek şehri için prosedürel düşük-poli araç modelleri (sınıf başına ≤1500 üçgen ayrıntılı rig, ≤600 üçgen örnekli trafik), gerçek gölgelendirici
 * (gökyüzü/neon yansıması, ıslak parlama, iç mekân, sürücü), far konisi + zemin ışık havuzu + parıltı (PointLight YOK), underglow, nitro alevi,
 * sürüklenme dumanı, ıslak yolda lamba yansıma çizgisi, hasar çiziği (yalnız renk), kademe geçişi (yeniden kurma yok).
 *
 *   createVehicleRenderer({THREE, uniforms?, quality?, reducedMotion?, createCanvas?, anisotropy?}) → vr
 *   vr.group                   sahneye eklenen kök (rigler + trafik + efekt)
 *   vr.beginFrame(camera, dt, env)   env: {night 0..1, rain 0..1, wet 0..1, shelter 0..1, reduced?, rigRadius?}
 *   vr.slot() → betimleyici    önceden ayrılmış betimleyici (alanlar aşağıda); doldur → endFrame çizer. vr.draw(desc) = slot'a kopyalar
 *   vr.endFrame()              rig / örnekli seçimi, güncelleme, efekt yayımı
 *   vr.traffic                 örnekli trafik çizicisi (add(kind,x,y,z,yaw,o) — vehicleTraffic.js); beginFrame/endFrame onu sarar
 *   vr.traffic.lamps(...)      (bkz. trafficLamps) trafik farı/stop parıltısı için: vr.trafficLamp(kind,x,y,z,yaw,{brake,head})
 *   vr.setQuality('low'|'medium'|'high')   vr.setReducedMotion(bool)   vr.warm(renderer, scene, camera, {postfx?}) → ms   vr.getStats()   vr.dispose()
 *   vr.setForceLights(bool)    galeri / test: farlar her zaman açık
 * Betimleyici: {id,kind,x,y,z,yaw,pitch,roll,spin,steer,u,aLong,latAcc,yawRate,brake,reverse,hazard,nitro,skid,handbrake,onGround,bump,dmg,cos,plate,
 *   driven,occupied,hideDriver,fresh,look,turn,sky,blk,hover,lights}   (hepsi isteğe bağlı; eksik = 0/false)
 * Bütçe: rig = 2 çizim (gövde + cam), trafik ≤ 8, efekt ≤ 3. Kademe: yüksek 4 rig · orta 3 · düşük 1; koni 10/6/0; duman 40/24/12; yansıma 1/.7/0.
 */
import * as THREE_NS from 'three';
import { COSMETICS } from '../../sim/city/vehicle/vehicleData.js';
import { MODEL_KINDS, buildModel, kindDims } from './vehicleGeo.js';
import { createVehicleFx, createPuffPool } from './vehicleFx.js';
import { createPlateAtlas } from './vehiclePlates.js';
import { createRig } from './vehicleRig.js';
import { lerpRgb } from '../skins.js';
import { createTrafficRenderer } from './vehicleTraffic.js';

export const RENDER_TIERS = Object.freeze({
  high: Object.freeze({
    rigs: 4, cones: 10, sprites: 224, smoke: 112, refl: 1, streak: true, traffic: 30, pools: 10, flares: true, rainGlass: true,
  }),
  medium: Object.freeze({
    rigs: 3, cones: 6, sprites: 160, smoke: 72, refl: 0.7, streak: true, traffic: 18, pools: 6, flares: true, rainGlass: true,
  }),
  low: Object.freeze({
    rigs: 1, cones: 0, sprites: 96, smoke: 40, refl: 0, streak: false, traffic: 10, pools: 2, flares: true, rainGlass: false,
  }),
});

const RIG_RADIUS = 46;
const COL_HEAD = Object.freeze([1.4, 1.25, 1.0]);
const COL_CONE = Object.freeze([1.0, 0.93, 0.78]);
const COL_POOL = Object.freeze([1.0, 0.92, 0.74]);
const COL_TAIL = Object.freeze([1.8, 0.12, 0.08]);
const COL_STREAK_H = Object.freeze([1.2, 1.1, 0.9]);
const COL_STREAK_T = Object.freeze([1.4, 0.1, 0.06]);
const COL_FLAME = Object.freeze([0.25, 0.55, 2.2]);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lin8 = (c) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
/** 0xRRGGBB → doğrusal RGB (out dizisine, k çarpanıyla; tahsissiz). */
function linOut(hex, out, k) {
  out[0] = lin8((hex >> 16) & 255) * k; out[1] = lin8((hex >> 8) & 255) * k; out[2] = lin8(hex & 255) * k;
  return out;
}

function newDesc() {
  return {
    id: 0, kind: 'sedan', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, spin: 0, steer: 0, u: 0, aLong: 0, latAcc: 0, yawRate: 0, brake: false, reverse: false,
    hazard: false, nitro: false, skid: 0, handbrake: false, onGround: true, bump: 0, dmg: 0, cos: null, kit: null, plate: '', driven: false, occupied: false, hideDriver: false,
    fresh: false, look: 0, turn: 0, sky: 1, blk: 0, hover: 0, lights: false, enterKick: false, dist2: 0,
  };
}

function geometryFrom(THREE, layer) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(layer.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(layer.normal, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(layer.aColor, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(layer.aMat, 4));
  g.setAttribute('aPivot', new THREE.BufferAttribute(layer.aPivot, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(layer.uv, 2));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function createVehicleRenderer(o) {
  const opt = o || {};
  const THREE = opt.THREE || THREE_NS;
  const group = new THREE.Group();
  group.name = 'kesif-araclar';
  const rigGroup = new THREE.Group();
  rigGroup.name = 'arac-riglar';
  group.add(rigGroup);
  const plates = createPlateAtlas({ THREE, createCanvas: opt.createCanvas, anisotropy: opt.anisotropy });
  const fx = createVehicleFx(THREE, opt.uniforms);
  const geoCache = new Map();
  const sharedGeos = [];
  const ctx = {
    shared: opt.uniforms,
    plates,
    geo(kind, lod, layerName) {
      const k = kind + '|' + lod + '|' + layerName;
      let g = geoCache.get(k);
      if (!g) {
        g = geometryFrom(THREE, buildModel(kind, lod)[layerName]);
        geoCache.set(k, g);
      }
      return g;
    },
    geoShared(kind, lod) {
      const base = ctx.geo(kind, lod, 'solid');
      const g = new THREE.BufferGeometry();
      ['position', 'normal', 'aColor', 'aMat', 'aPivot', 'uv'].forEach((n) => g.setAttribute(n, base.getAttribute(n)));
      g.boundingSphere = base.boundingSphere;
      g.boundingBox = base.boundingBox;
      sharedGeos.push(g);
      return g;
    },
  };
  const traffic = createTrafficRenderer(THREE, ctx);
  group.add(traffic.group);
  group.add(fx.group);

  let tierKey = RENDER_TIERS[opt.quality] ? opt.quality : 'high';
  let tier = RENDER_TIERS[tierKey];
  let reduced = !!opt.reducedMotion;
  let forceLights = false;
  let disposed = false;
  const rigs = new Map();
  const spare = [];
  const descs = [];
  let nDesc = 0;
  const order = [];
  const puffs = createPuffPool(40);
  const stats = {
    rigs: 0, rigs2: 0, lod: 0, draws: 0, tris: 0, spareRigs: 0, cones: 0, sprites: 0, smoke: 0, dropped: 0, tier: tierKey, warmMs: 0,
  };
  const camPos = { x: 0, y: 0, z: 0 };
  let frameDt = 0.016;
  let frameNo = 0;
  let curEnv = {
    night: 0, rain: 0, wet: 0, shelter: 0,
  };
  const smokeAcc = new Map();
  const col = [0, 0, 0];
  const tmpCol = [0, 0, 0];
  const neonLin = COSMETICS.neon.map((s) => {
    const f = (c) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return [f((s.hex >> 16) & 255), f((s.hex >> 8) & 255), f(s.hex & 255)];
  });

  function applyTier() {
    fx.setCaps({ sprite: tier.sprites, cone: tier.cones, smoke: tier.smoke });
    fx.setVisibleKinds({ cone: tier.cones > 0, smoke: true });
    traffic.setCap(tier.traffic);
    stats.tier = tierKey;
  }
  applyTier();

  function getRig(d) {
    let r = rigs.get(d.id);
    if (r && r.kind === d.kind) return r;
    if (r) {
      releaseRig(d.id);
      r = null;
    }
    // toplam rig sayısı sınırlı: bu karede kullanılmayan en eskiyi bırak
    if (rigs.size >= tier.rigs + 3) {
      let oldId = null;
      let oldF = frameNo;
      rigs.forEach((rg, id) => {
        if (rg.lastFrame < oldF) { oldF = rg.lastFrame; oldId = id; }
      });
      if (oldId !== null) releaseRig(oldId);
    }
    for (let i = 0; i < spare.length; i++) {
      if (spare[i].kind === d.kind) {
        r = spare.splice(i, 1)[0];
        break;
      }
    }
    if (!r) {
      r = createRig(THREE, ctx, d.kind);
      rigGroup.add(r.group);
    }
    r.lastFrame = frameNo;
    r.st.seen = false;
    r.st.beam = 1;
    r.st.driver = d.occupied ? 1 : 0;
    r.setCosmetics(d.cos, d.look, d.kit);
    r.cosKey = cosKeyOf(d.cos, d.look, d.kit);
    if (!r.renv) {
      r.renv = {
        night: 0, rain: 0, shelter: 0, reduced: false, lightK: 0, skyAt: 1, blockAt: 0, reflQ: 1,
      };
    }
    rigs.set(d.id, r);
    return r;
  }

  function releaseRig(id) {
    const r = rigs.get(id);
    if (!r) return;
    rigs.delete(id);
    r.group.visible = false;
    r.idle = 0;
    spare.push(r);
    if (spare.length > 4) {
      const old = spare.shift();
      rigGroup.remove(old.group);
      old.dispose();
    }
  }

  function cosKeyOf(c, look, kit) {
    // Keşif kiti anahtarı yüksek basamaklara yazılır (kit yoksa eski değer BİREBİR)
    const kk = kit ? (kit.n + 1) * 1e9 : 0;
    if (!c) return 1000000 + look + kk;
    const u = c.under || null;
    return ((((c.body * 17 + c.accent) * 17 + c.neon) * 5 + c.wheels) * 3 + (u && u.on ? 1 : 0)) * 64 + (look | 0) + kk;
  }

  /* ------------------------------------------------------------------ efektler */
  function neonOf(c) {
    return neonLin[c ? ((c.neon | 0) % neonLin.length + neonLin.length) % neonLin.length : 0];
  }

  /** Zemin teması gölgesi: gövde boyutunda yumuşak elips; süzülen araçlarda yükseklikle silikleşir/küçülür. */
  function emitShadow(d, a) {
    const k = a.under;
    const h = d.hover || 0;
    const fade = 1 / (1 + h * 1.4);
    const day = 1 - clamp(curEnv.night * 0.55, 0, 0.55);
    fx.shadow(d.x, d.y - h + 0.03, d.z, d.yaw, (k.hw * 2 + 0.9) * (1 + h * 0.25), (k.hl * 2 + 1.0) * (1 + h * 0.2), 0.44 * fade * day);
  }

  /** Tek araç için far/stop/underglow/alev/duman. Tahsissiz: yalnız skaler matematik ve modül düzeyindeki sabit renk dizileri. */
  function emitFx(d, model, isRig, rig, lightsOn, distCam) {
    const a = model.anchors;
    const cy = Math.cos(d.yaw);
    const sy = Math.sin(d.yaw);
    const gy = d.y - (d.hover || 0);
    const headK = isRig ? rig.st.head : (d.lights || lightsOn ? 1 : 0);
    const night = curEnv.night;
    const day = 1 - clamp(night * 1.2 + curEnv.rain * 0.4, 0, 1);
    const near = distCam < 70;
    const fwdX = -sy;
    const fwdZ = -cy;
    if (isRig && near) emitShadow(d, a);
    if (headK > 0.02) {
      const gain = headK * (0.35 + 0.65 * (1 - day));
      let cx = 0;
      let cz = 0;
      const nh = a.head.length;
      for (let i = 0; i < nh; i++) {
        const h = a.head[i];
        const px = d.x + h[0] * cy + h[2] * sy;
        const pz = d.z - h[0] * sy + h[2] * cy;
        const hy = d.y + h[1];
        cx += px; cz += pz;
        if (tier.flares && near) fx.flare(px + fwdX * 0.05, hy, pz + fwdZ * 0.05, 0.34 + 0.3 * (1 - day), COL_HEAD, 0.42 * gain + 0.08 * headK);
        if (tier.cones > 0 && isRig && near && !(d.driven && d.hideDriver) && (d.driven || distCam < 40)) {
          fx.cone(px, hy, pz, fwdX, -0.06, fwdZ, 1.8, 14, COL_CONE, (0.06 + 0.19 * (1 - day)) * headK);
        }
        if (tier.streak && curEnv.wet > 0.25 && near) fx.streak(px, gy + 0.03, pz, 0.55, 4.2, COL_STREAK_H, curEnv.wet * 0.5 * headK);
      }
      if (nh > 0 && near) {
        const dim = nh === 1 ? 4.2 : 6.2;
        fx.pool(cx / nh + fwdX * 0.4, gy + 0.045, cz / nh + fwdZ * 0.4, d.yaw, dim, 11, COL_POOL, (0.12 + 0.4 * (1 - day)) * headK * (d.hover > 0 ? 0.8 : 1));
      }
    }
    // stop / fren
    const brake = isRig ? rig.st.brake : (d.brake ? 1 : 0);
    const tailK = Math.max(brake, headK * 0.35);
    if (tailK > 0.02 && tier.flares && near) {
      for (let i = 0; i < a.tail.length; i++) {
        const t = a.tail[i];
        const px = d.x + t[0] * cy + t[2] * sy;
        const pz = d.z - t[0] * sy + t[2] * cy;
        fx.flare(px - fwdX * 0.04, d.y + t[1], pz - fwdZ * 0.04, 0.3 + 0.45 * brake, COL_TAIL, 0.2 * headK + 0.6 * brake);
        if (tier.streak && curEnv.wet > 0.25 && brake > 0.3) fx.streak(px, gy + 0.03, pz, 0.45, 2.8, COL_STREAK_T, curEnv.wet * 0.55 * brake);
      }
    }
    // underglow (kozmetik)
    const cos = d.cos;
    const kit = isRig ? d.kit : null;
    if (kit && near) {
      // Keşif kiti: kit neon rengi + kit alt ışık biçimi (0 düz, 1 nefes, 2 dalga); aynı alt ışık efekti (ek çizim yok)
      linOut(isRig && rig.st.kitNeon ? rig.st.kitNeon : kit.neon, tmpCol, 1.9);
      fx.under(d.x, gy + 0.05, d.z, d.yaw, a.under.hw * 2 + 0.7, a.under.hl * 2 + 0.7, tmpCol, (0.35 + 0.4 * (1 - day)) / (1 + d.hover * 0.5), kit.under + (d.hover > 0 ? 3 : 0));
    } else if (cos && cos.under && cos.under.on && near) {
      const nc = neonLin[(cos.under.color | 0) % neonLin.length];
      tmpCol[0] = nc[0] * 1.9; tmpCol[1] = nc[1] * 1.9; tmpCol[2] = nc[2] * 1.9;
      fx.under(d.x, gy + 0.05, d.z, d.yaw, a.under.hw * 2 + 0.7, a.under.hl * 2 + 0.7, tmpCol, (0.35 + 0.4 * (1 - day)) / (1 + d.hover * 0.5), (cos.under.pattern | 0) + (d.hover > 0 ? 3 : 0));
    }
    // hover itici parıltısı (zemine hafif elips)
    if (d.hover > 0 && near) {
      const nc = neonOf(cos);
      tmpCol[0] = nc[0] * 1.5; tmpCol[1] = nc[1] * 1.5; tmpCol[2] = nc[2] * 1.5;
      fx.under(d.x, gy + 0.05, d.z, d.yaw, a.under.hw * 2 + 0.2, a.under.hl * 2 + 0.2, tmpCol, (0.3 + 0.3 * (1 - day)) / (1 + d.hover * 0.6), 3);
    }
    // nitro
    if (d.nitro && isRig) {
      for (let i = 0; i < a.exhaust.length; i++) {
        const e = a.exhaust[i];
        fx.flame(d.x + e[0] * cy + e[2] * sy, d.y + e[1], d.z - e[0] * sy + e[2] * cy, -fwdX, 0, -fwdZ, 0.5, reduced ? 1.6 : 2.4, nitroCol(kit), 0.95);
      }
    }
    // sürüklenme duman
    if (isRig && tier.smoke > 0 && d.onGround && d.skid > 0.25 && Math.abs(d.u || 0) > 5 && a.wheels.length > 0) {
      let acc = smokeAcc.get(d.id) || 0;
      acc += d.skid * 26 * frameDt;
      while (acc >= 1) {
        acc -= 1;
        const wi = a.wheels.length >= 4 ? 2 + (frameNo & 1) : a.wheels.length - 1;
        const wp = a.wheels[wi];
        puffs.spawn(d.x + wp[0] * cy + wp[2] * sy, d.y + 0.15, d.z - wp[0] * sy + wp[2] * cy, -fwdX * 0.6 + (frameNo % 3 - 1) * 0.3, 0.35, -fwdZ * 0.6, 0.7, 0.9 + 0.5 * (frameNo % 5) / 5, 0.2 * d.skid);
      }
      smokeAcc.set(d.id, acc);
    }
  }

  /** Nitro alev rengi: kit.nitro varsa onun (c0→c1 yumuşak geçiş yalnız kit.cycle + low-dışı + kısıtlı hareket kapalı); yoksa varsayılan mavi. */
  const nitroTmp = [0, 0, 0];
  function nitroCol(kit) {
    if (!kit || !kit.nitro) return COL_FLAME;
    const animOk = kit.cycle && tierKey !== 'low' && !reduced;
    const hex = animOk ? lerpRgb(kit.nitro[0], kit.nitro[1], 0.5 + 0.5 * Math.sin(frameNo * frameDt * 1.5)) : kit.nitro[0];
    linOut(hex, nitroTmp, 1);
    const mx = Math.max(nitroTmp[0], nitroTmp[1], nitroTmp[2], 0.05);
    const k = 2.2 / mx;
    nitroTmp[0] *= k; nitroTmp[1] *= k; nitroTmp[2] *= k;
    return nitroTmp;
  }

  /* ------------------------------------------------------------------ kare */
  function beginFrame(camera, dt, env) {
    frameDt = clamp(dt || 0.016, 0.001, 0.1);
    frameNo++;
    nDesc = 0;
    if (camera) {
      camPos.x = camera.position.x; camPos.y = camera.position.y; camPos.z = camera.position.z;
    }
    curEnv = env || curEnv;
    if (env && env.reduced !== undefined) reduced = !!env.reduced;
    traffic.begin();
    fx.begin();
  }

  function slot() {
    if (nDesc >= descs.length) descs.push(newDesc());
    const d = descs[nDesc++];
    d.id = 0; d.kind = 'sedan'; d.pitch = 0; d.roll = 0; d.spin = 0; d.steer = 0; d.u = 0; d.aLong = 0; d.latAcc = 0; d.yawRate = 0; d.brake = false;
    d.reverse = false; d.hazard = false; d.nitro = false; d.skid = 0; d.handbrake = false; d.onGround = true; d.bump = 0; d.dmg = 0; d.cos = null; d.kit = null; d.plate = '';
    d.driven = false; d.occupied = false; d.hideDriver = false; d.fresh = false; d.look = 0; d.turn = 0; d.sky = 1; d.blk = 0; d.hover = 0; d.lights = false; d.enterKick = false;
    return d;
  }

  function draw(src) {
    const d = slot();
    Object.keys(src).forEach((k) => { d[k] = src[k]; });
    return d;
  }

  const byPriority = (p, q) => (p.driven === q.driven ? p.dist2 - q.dist2 : (p.driven ? -1 : 1));
  const used = new Set();
  const lodOpt = {
    pitch: 0, roll: 0, spin: 0, paint: 0, brake: 0, head: 0, turn: 0, sky: 1, blk: 0, fade: 1,
  };

  function visitIdleRig(r, id) {
    if (!used.has(id)) {
      r.idle = (r.idle || 0) + frameDt;
      r.group.visible = false;
      if (r.idle > 1.5) releaseRig(id);
    }
  }

  function countRigDraw(r) {
    if (r.group.visible) stats.rigs2 += r.glass ? 2 : 1;
  }

  function emitPuff(x, y, z, size, alpha) {
    const k = 0.62 - 0.38 * clamp(curEnv.night, 0, 1);
    col[0] = k; col[1] = k; col[2] = k * 1.02;
    fx.puff(x, y, z, size, col, alpha);
  }

  function endFrame() {
    const dt = frameDt;
    const radius = (curEnv && curEnv.rigRadius) || RIG_RADIUS;
    order.length = 0;
    for (let i = 0; i < nDesc; i++) {
      const d = descs[i];
      // sonlu olmayan poz/yönelim: çizilmez (GPU'ya NaN matris gitmesin)
      if (!Number.isFinite(d.x + d.y + d.z + d.yaw)) continue;
      if (!Number.isFinite(d.pitch)) d.pitch = 0;
      if (!Number.isFinite(d.roll)) d.roll = 0;
      if (!Number.isFinite(d.spin)) d.spin = 0;
      if (!Number.isFinite(d.steer)) d.steer = 0;
      if (!Number.isFinite(d.aLong)) d.aLong = 0;
      if (!Number.isFinite(d.latAcc)) d.latAcc = 0;
      if (!Number.isFinite(d.u)) d.u = 0;
      if (!Number.isFinite(d.dmg)) d.dmg = 0;
      if (!Number.isFinite(d.skid)) d.skid = 0;
      if (!(d.sky >= 0 && d.sky <= 1)) d.sky = 1;
      if (!(d.blk >= 0 && d.blk <= 1)) d.blk = 0;
      if (MODEL_KINDS.indexOf(d.kind) < 0) d.kind = 'sedan';
      const dx = d.x - camPos.x;
      const dz = d.z - camPos.z;
      d.dist2 = dx * dx + dz * dz;
      order.push(d);
    }
    order.sort(byPriority);
    used.clear();
    let nRigs = 0;
    let nLod = 0;
    let tris = 0;
    puffs.step(dt);
    for (let i = 0; i < order.length; i++) {
      const d = order[i];
      const dist = Math.sqrt(d.dist2);
      const model = buildModel(d.kind, 'hi');
      const asRig = nRigs < tier.rigs && (d.driven || dist < radius);
      const lightsOn = forceLights || d.lights || curEnv.night > 0.28 || curEnv.rain > 0.25 || d.sky < 0.35;
      if (asRig) {
        nRigs++;
        const r = getRig(d);
        used.add(d.id);
        const ck = cosKeyOf(d.cos, d.look, d.kit);
        if (r.cosKey !== ck) {
          r.cosKey = ck;
          r.setCosmetics(d.cos, d.look, d.kit);
        }
        r.group.visible = true;
        r.idle = 0;
        r.lastFrame = frameNo;
        const renv = r.renv;
        renv.night = curEnv.night; renv.rain = tier.rainGlass ? curEnv.rain : 0; renv.shelter = curEnv.shelter; renv.reduced = reduced; renv.anim = tierKey !== 'low' && !reduced;
        renv.lightK = lightsOn ? 1 : 0; renv.skyAt = d.sky; renv.blockAt = d.blk; renv.reflQ = tier.refl;
        r.update(d, dt, renv);
        tris += model.tris.total;
        emitFx(d, model, true, r, lightsOn, dist);
      } else {
        nLod++;
        const lo = buildModel(d.kind, 'lo');
        const o = lodOpt;
        o.pitch = d.pitch; o.roll = d.roll; o.spin = d.spin; o.paint = d.cos ? d.cos.body : 0; o.brake = d.brake ? 1 : 0; o.head = lightsOn ? 1 : 0;
        o.turn = d.hazard ? 2 : d.turn; o.sky = d.sky; o.blk = d.blk;
        traffic.add(d.kind, d.x, d.y, d.z, d.yaw, o);
        tris += lo.tris.total;
        if (dist < 60) emitShadow(d, lo.anchors);
        if (nLod <= tier.pools) emitFx(d, lo, false, null, lightsOn, dist);
      }
    }
    // kullanılmayan rigleri bırak
    rigs.forEach(visitIdleRig);
    puffs.each(emitPuff);
    traffic.end();
    fx.end();
    stats.rigs2 = 0;
    rigs.forEach(countRigDraw);
    stats.rigs = nRigs; stats.lod = nLod; stats.spareRigs = spare.length;
    stats.draws = stats.rigs2 + traffic.stats.draws + fx.stats.draws;
    stats.tris = tris;
    stats.cones = fx.stats.cone; stats.sprites = fx.stats.sprite; stats.smoke = fx.stats.smoke;
    stats.dropped = fx.stats.dropped + traffic.stats.dropped;
  }

  /** Trafik farı / stop parıltısı (örnekli trafik için): kind modeli 'lo' çapaları kullanır. */
  function trafficLamp(kind, x, y, z, yaw, o) {
    const m = buildModel(kind, 'lo');
    const op = o || {};
    const headK = op.head ? 1 : 0;
    const brake = op.brake ? 1 : 0;
    const dx0 = x - camPos.x;
    const dz0 = z - camPos.z;
    if (dx0 * dx0 + dz0 * dz0 < 60 * 60) {
      const k = m.anchors.under;
      fx.shadow(x, y + 0.03, z, yaw, (k.hw * 2 + 0.9) * (op.fade === undefined ? 1 : op.fade), k.hl * 2 + 1.0, 0.4 * (1 - clamp(curEnv.night * 0.55, 0, 0.55)) * (op.fade === undefined ? 1 : op.fade));
    }
    if (headK === 0 && brake === 0) return;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const fwdX = -sy;
    const fwdZ = -cy;
    const a = m.anchors;
    const dx = x - camPos.x;
    const dz = z - camPos.z;
    if (dx * dx + dz * dz > 80 * 80) return;
    if (headK) {
      for (let i = 0; i < a.head.length; i++) {
        const h = a.head[i];
        fx.flare(x + h[0] * cy + h[2] * sy + fwdX * 0.05, y + h[1], z - h[0] * sy + h[2] * cy + fwdZ * 0.05, 0.5, [1.4, 1.25, 1.0], 0.45);
      }
    }
    for (let i = 0; i < a.tail.length; i++) {
      const t = a.tail[i];
      fx.flare(x + t[0] * cy + t[2] * sy - fwdX * 0.04, y + t[1], z - t[0] * sy + t[2] * cy - fwdZ * 0.04, 0.3 + 0.4 * brake, [1.8, 0.12, 0.08], 0.2 * headK + 0.55 * brake);
    }
  }

  /**
   * Programları önceden derler. opts.postfx: gerçek çizim son işleme ara hedefine (yarı-kayan noktalı, srgb-linear, ton eşleme yok) gider; program anahtarı çizim
   * hedefine bağlı olduğundan ekran hedefiyle derlenen programlar kullanılmaz ve ilk görünen araçta ~200 ms derleme takılması olur (qa_p3 QA3-002) → ara hedefle derle.
   */
  function warm(renderer, scene, camera, opts) {
    if (!renderer || !scene || !camera) return 0;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const prevVis = [];
    const rigW = getRig({
      id: -7, kind: 'taksi', cos: null, look: 0, occupied: true,
    });
    rigW.group.position.set(camera.position.x, camera.position.y - 2, camera.position.z - 6);
    rigW.group.updateMatrixWorld(true);
    rigW.group.visible = true;
    traffic.meshes.forEach((s) => { prevVis.push([s.mesh, s.mesh.visible, s.mesh.count]); s.mesh.visible = true; s.mesh.count = 1; });
    const fxm = fx.meshes;
    const fxPrev = [fxm.sprite, fxm.cone, fxm.smoke].map((m) => [m, m.visible, m.count]);
    fxPrev.forEach(([m]) => { m.visible = true; m.count = 1; });
    let rt = null;
    let prevRT = null;
    try {
      prevRT = typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null;
      if (opts && opts.postfx && typeof renderer.setRenderTarget === 'function' && typeof THREE.WebGLRenderTarget === 'function') {
        rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
        renderer.setRenderTarget(rt);
      }
    } catch {
      rt = null;
    }
    // opts.variants: [{enter(), exit()}]: program anahtarı sahnedeki ışık sayısını da içerir (birinci şahıs kolundaki meşale ışığı kol görünürken 1, araçta/üçüncü
    // şahısta 0) → araca binince ilk çizimde anahtar değişir ve yeniden derleme olur (qa_p3 QA3-002); her durumda derle (çağıran kol durumunu kurar/geri alır).
    const variants = opts && Array.isArray(opts.variants) && opts.variants.length ? opts.variants : [null];
    try {
      for (let i = 0; i < variants.length; i++) {
        const vt = variants[i];
        try {
          if (vt && typeof vt.enter === 'function') vt.enter();
          if (typeof renderer.compile === 'function') renderer.compile(scene, camera);
        } catch {
          /* yut */
        } finally {
          try { if (vt && typeof vt.exit === 'function') vt.exit(); } catch { /* yut */ }
        }
      }
    } finally {
      if (rt) {
        try { renderer.setRenderTarget(prevRT); } catch { /* yut */ }
        try { rt.dispose(); } catch { /* yut */ }
      }
    }
    prevVis.forEach(([m, v, c]) => { m.visible = v; m.count = c; });
    fxPrev.forEach(([m, v, c]) => { m.visible = v; m.count = c; });
    releaseRig(-7);
    stats.warmMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return stats.warmMs;
  }

  const vr = {
    group,
    fx,
    traffic,
    plates,
    stats,
    tiers: RENDER_TIERS,
    beginFrame,
    slot,
    draw,
    endFrame,
    trafficLamp,
    warm,
    rigs,
    getTier() {
      return tierKey;
    },
    setQuality(k) {
      if (!RENDER_TIERS[k] || k === tierKey) return;
      tierKey = k;
      tier = RENDER_TIERS[k];
      applyTier();
    },
    setReducedMotion(v) {
      reduced = !!v;
    },
    setForceLights(v) {
      forceLights = !!v;
    },
    getStats() {
      return Object.assign({}, stats, {
        geometries: geoCache.size + sharedGeos.length, rigsLive: rigs.size, trafficCars: traffic.stats.cars, puffs: puffs.count,
      });
    },
    kindDims,
    MODEL_KINDS,
    dispose() {
      if (disposed) return;
      disposed = true;
      rigs.forEach((r) => { rigGroup.remove(r.group); r.dispose(); });
      rigs.clear();
      spare.forEach((r) => { rigGroup.remove(r.group); r.dispose(); });
      spare.length = 0;
      traffic.dispose();
      fx.dispose();
      geoCache.forEach((g) => g.dispose());
      geoCache.clear();
      sharedGeos.forEach((g) => g.dispose());
      sharedGeos.length = 0;
      plates.dispose();
      group.clear();
    },
  };
  return vr;
}
