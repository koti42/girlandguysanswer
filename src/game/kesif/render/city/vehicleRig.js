/*
 * KEŞİF render/city — AYRINTILI ARAÇ DÜZENEĞİ (rig): sürülen / yakın araç. İki çizim çağrısı (gövde + yarı saydam cam); tekerlek dönüşü/yönelmesi, sürücü,
 * iç mekân ve lamba durumu gölgelendiricide. Gövde yatışı/öne eğimi yay-sönüm ile fizikten (pitch/roll + boyuna/yanal ivme + çarpma darbesi) türetilir.
 *
 *   createRig(THREE, ctx, kind) → rig        ctx = {shared, geo(kind,lod,layer), plates, quality()}
 *   rig.group  rig.kind  rig.lastUsed  rig.update(d, dt, env)  rig.setVisible(v)  rig.dispose()  rig.tmp (FX için dünya konumları)
 *   d (betimleyici): {id,kind,x,y,z,yaw,pitch,roll,spin,steer,u,aLong,latAcc,yawRate,brake,reverse,hazard,nitro,skid,bump,dmg,cos,kit,plate,driven,occupied,hideDriver,beam,fresh,look}
 *   env: {night, rain, wet, dt, reduced, anim, tier(0..2), lightK, skyAt, blockAt}
 *   kit (isteğe bağlı): Keşif araç boya kiti (skins 'arac'); setCosmetics(cos, look, kit) garaj renklerinin ÜSTÜNE uniform değeri yazar (yeni uniform/shader yok);
 *   kit.cycle + env.anim ise neon rengi yavaşça ton değiştirir (low kademe ve kısıtlı harekette sabit).
 */
import { COSMETICS } from '../../sim/city/vehicle/vehicleData.js';
import { VEH_FRAGMENT, VEH_GLASS_FRAGMENT, VEH_VERTEX } from './vehicleShaders.js';
import { buildModel } from './vehicleGeo.js';
import { hueRotate } from '../skins.js';

const SHARED_KEYS = [
  'uTime', 'uMotion', 'uSkyLight', 'uAmbientColor', 'uSunDir', 'uSunColor', 'uBlockLightColor', 'uMinLight', 'uEmission', 'uFogColor', 'uFogNear', 'uFogFar',
  'uFadeStart', 'uFadeEnd', 'uSkyColor', 'uHorizonColor', 'uUnderwater', 'uWet', 'uNeon', 'uRain',
];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * Math.max(0, dt)));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const BLINK_HZ = 1.5;

/** Paylaşılan uniform nesnelerinden (yoksa varsayılanlar) araç gölgelendirici uniform kümesinin PAYLAŞILAN kısmı. */
export function sharedUniformsFor(THREE, shared) {
  const base = {
    uTime: { value: 0 }, uMotion: { value: 1 }, uSkyLight: { value: 1 }, uAmbientColor: { value: new THREE.Color(0.5, 0.58, 0.74) },
    uSunDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() }, uSunColor: { value: new THREE.Color(0.62, 0.56, 0.44) },
    uBlockLightColor: { value: new THREE.Color(1, 0.62, 0.32) }, uMinLight: { value: 0.02 }, uEmission: { value: 1 }, uFogColor: { value: new THREE.Color(0.8, 0.9, 0.96) },
    uFogNear: { value: 60 }, uFogFar: { value: 150 }, uFadeStart: { value: 130 }, uFadeEnd: { value: 148 }, uSkyColor: { value: new THREE.Color(0.3, 0.5, 0.8) },
    uHorizonColor: { value: new THREE.Color(0.7, 0.8, 0.9) }, uUnderwater: { value: 0 }, uWet: { value: 0 }, uNeon: { value: new THREE.Vector4(0, 0.45, 0, 0) }, uRain: { value: 0 },
  };
  const u = {};
  SHARED_KEYS.forEach((k) => { u[k] = shared && shared[k] ? shared[k] : base[k]; });
  return u;
}

/** Araç gölgelendiricisinin sahip olunan (araç başına) uniform'ları. */
export function ownUniforms(THREE) {
  return {
    uSteer: { value: 0 },
    uSpin: { value: 0 },
    uDriver: { value: 1 },
    uLampU: { value: new THREE.Vector4(0, 0, 0, 0) },
    uIndU: { value: new THREE.Vector2(0, 0) },
    uLight: { value: new THREE.Vector2(1, 0) },
    uBodyU: { value: new THREE.Color(1, 1, 1) },
    uAccentU: { value: new THREE.Color(1, 1, 1) },
    uNeonC: { value: new THREE.Color(0, 0.9, 1) },
    uSkin: { value: new THREE.Color(0.8, 0.55, 0.4) },
    uCloth: { value: new THREE.Color(0.2, 0.4, 1) },
    uHair: { value: new THREE.Color(0.1, 0.07, 0.05) },
    uDmg: { value: 0 },
    uBeam: { value: 1 },
    uHeight: { value: 1.5 },
    uHalfL: { value: 2 },
    uWheelBlur: { value: 0 },
    uRimStyle: { value: 0 },
    uRainGlass: { value: 0 },
    uQ: { value: 1 },
    uPlateMap: { value: null },
    uPlateRect: { value: new THREE.Vector4(0, 0, 0.5, 0.125) },
    uSignRect: { value: new THREE.Vector4(0, 0.875, 1, 0.125) },
    uPlateOn: { value: 1 },
  };
}

const SKIN_HEX = [0xf2c9a5, 0xd9a066, 0x9a6a43, 0x6e4630];
const HAIR_HEX = [0x2a1d14, 0x5a3a22, 0x16110e, 0xb8864a];
const CLOTH_HEX = [0x2f6bff, 0xe2476b, 0x1fb88a, 0xffb02e];

function colorFromTable(c, table, i) {
  const e = table[((i | 0) % table.length + table.length) % table.length];
  c.set(typeof e === 'number' ? e : e.hex);
}

export function createRig(THREE, ctx, kind) {
  const model = buildModel(kind, 'hi');
  const group = new THREE.Group();
  group.name = 'arac-' + kind;
  group.rotation.order = 'YXZ';
  const uniforms = Object.assign({}, sharedUniformsFor(THREE, ctx.shared), ownUniforms(THREE));
  uniforms.uPlateMap.value = ctx.plates.texture;
  uniforms.uHeight.value = Math.max(0.3, model.dims.height + 0.1);
  uniforms.uHalfL.value = model.dims.length * 0.5;
  const bodyMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VEH_VERTEX,
    fragmentShader: VEH_FRAGMENT,
    defines: { PLATE_TEX: 1 },
    side: THREE.DoubleSide,
  });
  bodyMat.name = 'kesif-arac-govde';
  const glassMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VEH_VERTEX,
    fragmentShader: VEH_GLASS_FRAGMENT,
    defines: { PLATE_TEX: 1 },
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });
  glassMat.name = 'kesif-arac-cam';
  const body = new THREE.Mesh(ctx.geo(kind, 'hi', 'solid'), bodyMat);
  body.name = 'govde';
  const glass = model.glass.tris > 0 ? new THREE.Mesh(ctx.geo(kind, 'hi', 'glass'), glassMat) : null;
  if (glass) {
    glass.name = 'cam';
    glass.renderOrder = 10;
  }
  group.add(body);
  if (glass) group.add(glass);

  const st = {
    head: 0, brake: 0, rev: 0, indL: 0, indR: 0, blinkT: 0, driver: 0, beam: 1, pitchD: 0, pitchV: 0, rollD: 0, rollV: 0, lastBump: 0, spinPrev: 0, spinRate: 0,
    steerSm: 0, indDir: 0, indHold: 0, indCool: 0, seen: false, wasOccupied: false, dip: 0, dipV: 0, rainGlass: 0, uSet: false, lightT: 1, lightB: 0,
  };
  const tmp = { x: 0, y: 0, z: 0 };

  const rig = {
    group,
    kind,
    model,
    uniforms,
    lastUsed: 0,
    inUse: false,
    st,
    tmp,
    body,
    glass,
    setVisible(v) {
      group.visible = v;
    },
    setCosmetics(cos, look, kit) {
      const c = cos || null;
      colorFromTable(uniforms.uBodyU.value, COSMETICS.body, c ? c.body : 0);
      colorFromTable(uniforms.uAccentU.value, COSMETICS.accent, c ? c.accent : 1);
      colorFromTable(uniforms.uNeonC.value, COSMETICS.neon, c ? c.neon : 0);
      uniforms.uRimStyle.value = c ? c.wheels | 0 : 0;
      const lk = look || 0;
      colorFromTable(uniforms.uSkin.value, SKIN_HEX, lk & 3);
      colorFromTable(uniforms.uHair.value, HAIR_HEX, (lk >> 2) & 3);
      colorFromTable(uniforms.uCloth.value, CLOTH_HEX, (lk >> 4) & 3);
      if (kind === 'taksi') {
        // taksi her zaman sarı + damalı şerit koyu
        uniforms.uAccentU.value.set(0x14161b);
        if (!c || c.body === 0) uniforms.uBodyU.value.set(0xffc21f);
      }
      // Keşif kiti (yalnız oyuncunun sürdüğü araç): serbest renkler + jant biçimi; kit yoksa garaj değerleri aynen kalır
      st.kitCyc = false;
      st.kitNeon = 0;
      if (kit) {
        uniforms.uBodyU.value.set(kit.body);
        uniforms.uAccentU.value.set(kit.accent);
        uniforms.uNeonC.value.set(kit.neon);
        uniforms.uRimStyle.value = kit.wheels | 0;
        st.kitNeon = kit.neon;
        st.kitBase = kit;
      } else {
        st.kitBase = null;
      }
    },
    /** d: betimleyici; env: kare ortamı. */
    update(d, dt, env) {
      const U = uniforms;
      const reduced = !!env.reduced;
      const k = reduced ? 0.35 : 1;
      // --- poz ---
      const bikeLean = kind === 'motor' ? clamp(-Math.atan2(d.latAcc || 0, 9.8) * 0.9, -0.6, 0.6) * (reduced ? 0.5 : 1) : 0;
      const latT = kind === 'motor' ? 0 : -(d.latAcc || 0) * 0.0045 * k;
      const lonT = (d.aLong || 0) * 0.0032 * k;
      // yay-sönüm (≈1,3 Hz, ζ≈0,6)
      const K = 70;
      const Cc = 9.5;
      st.pitchV += (K * (lonT - st.pitchD) - Cc * st.pitchV) * dt;
      st.pitchD += st.pitchV * dt;
      st.rollV += (K * (latT - st.rollD) - Cc * st.rollV) * dt;
      st.rollD += st.rollV * dt;
      if (d.bump > 0 && st.lastBump <= 0 && !reduced) {
        st.pitchV += -0.35;
        st.rollV += 0.25 * ((d.latAcc || 0) > 0 ? 1 : -1);
      }
      st.lastBump = d.bump || 0;
      // Keşif kiti: neon tonu 8 sn'de bir tur, ≤12 güncelleme/sn; low kademe / kısıtlı hareket → sabit kit rengi
      const kb = st.kitBase;
      if (kb && kb.cycle && env.anim && !reduced) {
        st.kitT = (st.kitT || 0) + dt;
        const step = Math.floor(st.kitT * 12);
        if (step !== st.kitStep) {
          st.kitStep = step;
          st.kitNeon = hueRotate(kb.neon, (st.kitT / 8) % 1);
          U.uNeonC.value.set(st.kitNeon);
          st.kitCyc = true;
        }
      } else if (kb && st.kitCyc) {
        st.kitCyc = false;
        st.kitNeon = kb.neon;
        U.uNeonC.value.set(kb.neon);
      }
      if (d.enterKick && !reduced) st.pitchV += -0.18;
      st.pitchD = clamp(st.pitchD, -0.12, 0.12);
      st.rollD = clamp(st.rollD, -0.14, 0.14);
      group.position.set(d.x, d.y, d.z);
      group.rotation.set((d.pitch || 0) + st.pitchD, d.yaw, -((d.roll || 0) + st.rollD) + (kind === 'motor' ? bikeLean : 0), 'YXZ');
      // --- tekerlek ---
      const spin = d.spin || 0;
      const rate = dt > 0 ? Math.abs(spin - st.spinPrev) / dt : 0;
      st.spinPrev = spin;
      st.spinRate = damp(st.spinRate, rate, 12, dt);
      U.uSpin.value = -spin;
      st.steerSm = damp(st.steerSm, d.steer || 0, 22, dt);
      U.uSteer.value = -st.steerSm;
      U.uWheelBlur.value = smoothstep(16, 44, st.spinRate);
      // --- lambalar ---
      const headT = env.lightK > 0 ? 1 : 0;
      st.head = damp(st.head, headT * (d.driven || d.occupied ? 1 : 0.85), 6, dt);
      st.brake = damp(st.brake, d.brake ? 1 : 0, 16, dt);
      st.rev = damp(st.rev, d.reverse ? 1 : 0, 12, dt);
      // sinyal: tehlike / otomatik dönüş
      let wantL = 0;
      let wantR = 0;
      const hazard = !!d.hazard;
      if (d.turn !== undefined && d.turn !== 0) {
        if (d.turn < 0) wantL = 1; else if (d.turn > 0 && d.turn < 2) wantR = 1; else if (d.turn >= 2) { wantL = 1; wantR = 1; }
      } else if (d.driven && (d.u || 0) > 2) {
        // otomatik sinyal: belirgin direksiyon bir süre tutulursa
        const s = st.steerSm;
        if (Math.abs(s) > 0.14) st.indHold = Math.min(1.5, st.indHold + dt); else st.indHold = Math.max(0, st.indHold - dt * 0.7);
        if (st.indHold > 0.35) st.indDir = s < 0 ? 1 : -1;
        if (st.indHold <= 0.02) st.indDir = 0;
        if (st.indDir < 0) wantL = 1;
        if (st.indDir > 0) wantR = 1;
        if (st.indDir !== 0 && st.indHold > 0.35) { /* tut */ }
      }
      if (hazard) { wantL = 1; wantR = 1; }
      st.blinkT += dt;
      const phase = (st.blinkT * BLINK_HZ) % 1;
      const on = reduced ? 0.75 : (phase < 0.5 ? 1 : 0);
      st.indL = damp(st.indL, wantL * on, 30, dt);
      st.indR = damp(st.indR, wantR * on, 30, dt);
      U.uLampU.value.set(st.head, st.brake, st.rev, 0);
      U.uIndU.value.set(st.indL, st.indR);
      // --- sürücü / giriş-çıkış ---
      const drvT = d.occupied && !d.hideDriver && !d.noDriver ? 1 : 0;
      st.driver = damp(st.driver, drvT, 9, dt);
      U.uDriver.value = st.driver < 0.015 ? 0 : st.driver;
      // --- ışınlanma (beam-in) ---
      if (d.fresh && !st.seen && !reduced) st.beam = 0;
      st.seen = true;
      st.beam = Math.min(1, st.beam + dt / 0.9);
      U.uBeam.value = st.beam;
      // --- ışık örneği ---
      st.lightT = damp(st.lightT, env.skyAt, 8, dt);
      st.lightB = damp(st.lightB, env.blockAt, 8, dt);
      U.uLight.value.set(st.lightT, st.lightB);
      U.uDmg.value = d.dmg || 0;
      U.uQ.value = env.reflQ;
      const rainT = d.driven && env.rain > 0.1 && env.shelter < 0.5 ? clamp(env.rain * 1.4, 0, 1) : 0;
      st.rainGlass = damp(st.rainGlass, rainT, 2, dt);
      U.uRainGlass.value = st.rainGlass;
      if (d.plate !== undefined && d.plate !== st.plateText) {
        st.plateText = d.plate;
        const idx = ctx.plates.slotFor(d.plate || '');
        const r = ctx.plates.rectOf(idx);
        U.uPlateRect.value.set(r[0], r[1], r[2], r[3]);
        const sr = ctx.plates.signRect;
        U.uSignRect.value.set(sr[0], sr[1], sr[2], sr[3]);
      }
    },
    dispose() {
      bodyMat.dispose();
      glassMat.dispose();
      group.clear();
    },
  };
  return rig;
}
