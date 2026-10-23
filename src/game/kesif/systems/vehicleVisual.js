/*
 * KEŞİF — "vehicleVisual" sistemi (order 37): araç çizimi (Neon Meridyen Faz 3, paket vehicle_render). Sözleşme KESIF_CITY_CONTRACT §9, §17, §20.
 * Fizik/yönetici (systems/vehicles.js, G.vehicles) ve trafik (G.traffic) verisini okur; render/city/vehicleModels.js çizicisini sürer. Oyun durumunu DEĞİŞTİRMEZ.
 *
 *   G.vehicleRender           çizici (vehicleModels.createVehicleRenderer); yalnız şehirde sahneye görünür
 *   G.vehicleVisualDebug      {forceLights, extra: [betimleyici…], tierOverride}  galeri/test: ek araçlar, farları zorla açma, kademe ezme (üretimde boş)
 *   G.vehicleRenderStats()    çizici istatistikleri (rig/örnekli/çizim/üçgen)
 *   Girdi (okur): G.vehicles.entries (Entry.v: pose/ışık/hasar/kozmetik), G.vehicles.interp, G.vehicleCam.mode (1 = kaput: sürücü gizlenir), G.cityLook.state {night,rain,wet,shelter},
 *                 G.quality.settings.effTier, G.reducedMotion/G.accessibility, G.materials.uniforms (paylaşılan gök/sis/ıslaklık), G.world.getLight (araç aydınlatması)
 *   Trafik: G.traffic.view (systems/traffic.js her karede doldurur; görünüm {count,x,y,z,yaw,pitch,speed,cls,color,flags,fade,id,steer}); fillView'lı kaynaklar da kabul edilir.
 *   Olaylar (dinler): vehicleEnter (giriş sarsıntısı), dimensionChanged.
 */
import * as THREE from 'three';
import { createVehicleRenderer } from '../render/city/vehicleModels.js';
import { plateFor, sanitizeCosmetics } from '../sim/city/vehicle/vehicleData.js';

export const VEHICLE_VISUAL_ORDER = 37;
const TRAFFIC_CLASS_KIND = ['taksi', 'spor', 'kamyonet', 'motor'];
const FLAG = {
  BRAKE: 1, REVERSE: 2, HEAD: 4, HAZARD: 8, BLINK_L: 16, BLINK_R: 32, TAXI: 64,
};
const LIGHT_EVERY = 0.2;
const WHEEL_R = 0.33;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/**
 * Trafik görünümü: systems/traffic.js her karede `G.traffic.view`'i doldurur (order 27 < 37); yoksa fillView'lı bir kaynak aranır.
 * Dönüş {count,x,y,z,yaw,pitch,speed,cls,color,flags,fade,id} | null.
 */
function trafficView(G) {
  const t = G.traffic || G.trafficSim || null;
  if (!t) return null;
  if (t.view && typeof t.view.count === 'number') return t.view;
  if (typeof t.fillView === 'function') return t.fillView(1);
  if (t.sim && typeof t.sim.fillView === 'function') return t.sim.fillView(1);
  return null;
}

export function createSystem(G) {
  let vr = null;
  let warmed = false;
  let shown = false;
  let wantKick = null;
  let frameNo = 0;
  let popSeen = false;
  const interp = {};
  const env = {
    night: 0, rain: 0, wet: 0, shelter: 0, reduced: false,
  };
  const seenIds = new Set();
  const lightCache = new Map();
  const spinCache = new Map();
  const plateCache = new Map();
  const trafficOpt = {
    pitch: 0, roll: 0, spin: 0, paint: 0, brake: 0, head: 0, turn: 0, sky: 1, blk: 0, fade: 1,
  };
  const dbg = { forceLights: false, extra: [], tierOverride: null };

  function tierOf() {
    const q = G.quality && G.quality.settings ? G.quality.settings.effTier : null;
    return q === 'low' || q === 'medium' || q === 'high' ? q : 'high';
  }

  function ensure() {
    if (vr || !G.scene) return vr;
    vr = createVehicleRenderer({
      THREE,
      uniforms: G.materials ? G.materials.uniforms : undefined,
      quality: tierOf(),
      createCanvas: G.opts && typeof G.opts.createCanvas === 'function' ? G.opts.createCanvas : undefined,
      anisotropy: 4,
    });
    G.scene.add(vr.group);
    G.vehicleRender = vr;
    vr.group.visible = false;
    return vr;
  }

  function lightOf(id, x, y, z, out) {
    const w = G.world;
    let c = lightCache.get(id);
    if (!c) {
      c = {
        t: -9, sky: 1, blk: 0,
      };
      lightCache.set(id, c);
    }
    if (G.time && G.time.seconds - c.t > LIGHT_EVERY && w && typeof w.getLight === 'function') {
      c.t = G.time.seconds;
      const l = w.getLight(Math.floor(x), Math.floor(y + 1), Math.floor(z));
      if (Number.isFinite(l)) {
        c.sky = (l >> 4) / 15;
        c.blk = (l & 15) / 15;
      }
    }
    out.sky = c.sky;
    out.blk = c.blk;
  }

  function envNow() {
    const lk = G.cityLook && G.cityLook.state ? G.cityLook.state : null;
    env.night = lk ? lk.night : 0;
    env.rain = lk ? lk.rain : 0;
    env.wet = lk ? lk.wet : 0;
    env.shelter = lk ? lk.shelter : 0;
    env.reduced = !!(G.reducedMotion || G.accessibility);
    return env;
  }

  function fillVehicle(d, e, alpha, mgr) {
    const v = e.v;
    const driven = mgr.driven === e;
    d.id = e.id;
    d.kind = v.cls;
    if (driven) {
      mgr.interp(e, alpha, interp);
      d.x = interp.x; d.y = interp.y; d.z = interp.z; d.yaw = interp.yaw; d.pitch = interp.pitch; d.roll = interp.roll; d.spin = interp.wheelSpin; d.steer = interp.steer;
    } else {
      d.x = v.x; d.y = v.y; d.z = v.z; d.yaw = v.yaw; d.pitch = v.pitch; d.roll = v.roll; d.spin = v.wheelSpin; d.steer = v.wheelAngle;
    }
    d.u = v.u; d.aLong = v.aLong; d.latAcc = v.latAcc; d.yawRate = v.yawRate;
    d.brake = !!(v.lights && v.lights.brake); d.reverse = !!(v.lights && v.lights.reverse);
    d.hazard = v.hazardT > 0; d.nitro = !!v.nitroOn; d.skid = v.skid || 0; d.handbrake = !!v.handbrake; d.onGround = !!v.onGround;
    d.bump = v.bumpT || 0; d.dmg = v.dmg || 0;
    d.cos = v.cosmetics ? v.cosmetics : sanitizeCosmetics(null, v.cls);
    // Keşif araç boya kiti (mağaza görünümü): yalnız oyuncunun sürdüğü araç; trafik/diğer araçlar ve simülasyon etkilenmez
    d.kit = driven && G.cosmetics && G.cosmetics.skins ? G.cosmetics.skins.arac : null;
    let pc = plateCache.get(e.id);
    if (!pc || pc.idx !== (d.cos.plate | 0)) {
      pc = { idx: d.cos.plate | 0, text: plateFor(e.id | 0, d.cos.plate | 0) };
      plateCache.set(e.id, pc);
    }
    d.plate = pc.text;
    d.driven = driven; d.occupied = !!e.occupied;
    d.hideDriver = driven && G.vehicleCam && G.vehicleCam.mode === 1;
    d.hover = v.def ? v.def.hover : 0;
    d.look = (e.id >>> 3) & 0x3f;
    d.fresh = popSeen && !seenIds.has(e.id);
    d.enterKick = wantKick !== null && wantKick === e.id;
    if (d.enterKick) wantKick = null;
    seenIds.add(e.id);
    lightOf(e.id, d.x, d.y, d.z, d);
    d.lights = false;
  }

  function drawTraffic(dt) {
    const view = trafficView(G);
    if (!view) return;
    const night = env.night > 0.28 || env.rain > 0.25 || dbg.forceLights;
    const n = view.count | 0;
    const seen = frameNo % 120 === 0 ? new Set() : null;
    for (let i = 0; i < n; i++) {
      const fade = view.fade ? view.fade[i] : 1;
      if (fade < 0.04) continue;
      const id = view.id[i];
      const cls = view.cls[i] | 0;
      const flags = view.flags[i] | 0;
      let kind = TRAFFIC_CLASS_KIND[cls] || 'sedan';
      if (kind === 'taksi' && !(flags & FLAG.TAXI)) kind = (id & 1) ? 'sedan' : 'hatch';
      // tekerlek dönüşü: hız entegrasyonu
      let sp = spinCache.get(id) || 0;
      sp += (view.speed[i] / WHEEL_R) * dt;
      if (sp > 1e4) sp %= Math.PI * 2;
      spinCache.set(id, sp);
      if (seen) seen.add(id);
      const o = trafficOpt;
      o.pitch = view.pitch[i]; o.roll = 0; o.spin = sp; o.paint = view.color[i];
      o.brake = flags & FLAG.BRAKE ? 1 : 0;
      o.head = night || (flags & FLAG.HEAD) ? 1 : 0;
      o.turn = flags & FLAG.HAZARD ? 2 : (flags & FLAG.BLINK_L ? -1 : (flags & FLAG.BLINK_R ? 1 : 0));
      o.fade = fade;
      lightOf(id, view.x[i], view.y[i], view.z[i], o);
      vr.traffic.add(kind, view.x[i], view.y[i], view.z[i], view.yaw[i], o);
      vr.trafficLamp(kind, view.x[i], view.y[i], view.z[i], view.yaw[i], o);
    }
    if (seen) {
      spinCache.forEach((_v, id) => { if (!seen.has(id)) spinCache.delete(id); });
      lightCache.forEach((_v, id) => { if (!seen.has(id) && !seenIds.has(id)) lightCache.delete(id); });
    }
  }

  const system = {
    name: 'vehicleVisual',
    order: VEHICLE_VISUAL_ORDER,

    init() {
      G.vehicleVisualDebug = dbg;
      G.vehicleRenderStats = () => (vr ? vr.getStats() : null);
    },

    frameUpdate(_G, dt, alpha) {
      frameNo++;
      if (G.dim !== 'neon' || !G.world) {
        if (vr && shown) {
          vr.group.visible = false;
          shown = false;
        }
        return;
      }
      if (!ensure()) return;
      if (!shown) {
        vr.group.visible = true;
        shown = true;
      }
      if (!warmed && G.renderer && G.camera && G.scene) {
        warmed = true;
        // program anahtarı ışık sayısına bağlı: kol (viewModel) görünür (yürürken birinci şahıs) ve gizli (araçta / üçüncü şahıs) iki durumda da derle
        const vmg = G.viewModel && G.viewModel.group;
        const vmWas = vmg ? vmg.visible : false;
        const variants = vmg ? [{ enter() { vmg.visible = true; }, exit() {} }, { enter() { vmg.visible = false; }, exit() { vmg.visible = vmWas; } }] : null;
        vr.warm(G.renderer, G.scene, G.camera, { postfx: !!(G.postfx && G.postfx.enabled), variants });
      }
      vr.setQuality(dbg.tierOverride || tierOf());
      vr.setForceLights(dbg.forceLights);
      envNow();
      const step = clamp(dt || 0.016, 0.001, 0.1);
      vr.beginFrame(G.camera, step, env);
      const mgr = G.vehicles;
      if (mgr && mgr.entries) {
        mgr.entries.forEach((e) => {
          if (e.stashed) return;
          fillVehicle(vr.slot(), e, alpha, mgr);
        });
        popSeen = true;
        if (frameNo % 600 === 0) {
          seenIds.forEach((id) => { if (!mgr.entries.has(id)) { seenIds.delete(id); plateCache.delete(id); } });
        }
      }
      for (let i = 0; i < dbg.extra.length; i++) {
        const s = dbg.extra[i];
        const d = vr.slot();
        Object.keys(s).forEach((k) => { d[k] = s[k]; });
        if (d.sky === undefined) d.sky = 1;
      }
      drawTraffic(step);
      vr.endFrame();
    },

    onDimension(_G, _from, to) {
      const toId = typeof to === 'string' ? to : (to && to.id) || 'overworld';
      if (vr && toId !== 'neon') {
        vr.group.visible = false;
        shown = false;
      }
      popSeen = false;
      seenIds.clear();
      lightCache.clear();
      spinCache.clear();
      plateCache.clear();
    },

    onEvent(_G, e) {
      if (e && e.type === 'vehicleEnter') wantKick = e.id;
    },

    dispose() {
      if (vr) {
        if (vr.group.parent) vr.group.parent.remove(vr.group);
        vr.dispose();
      }
      vr = null;
      G.vehicleRender = null;
    },
  };
  return system;
}

export default createSystem;
