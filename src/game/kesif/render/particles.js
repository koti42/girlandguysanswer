/*
 * KEŞİF render — GPU parçacık sistemi.
 *
 *   createParticleSystem(THREE, scene, {max, quality, reducedMotion, seed}) → sistem
 *
 * Tasarım: iki katman (toplamalı: ışıma/kıvılcım/halka/zerre; normal: kırıntı/duman/kalp), her katman tek çizim çağrısı
 * (örneklenmiş dört köşeli levha + özel shader). Parçacık konumu GPU'da doğuş verisinden hesaplanır; CPU yalnızca
 * doğuşta halka tampona yazar (en eski üzerine yazılır) ve karede değişen aralıkları kısmi yükler. Kare başına ayırma yok.
 *
 * Tek seferlik efektler (pos = {x,y,z} | [x,y,z], dünya koordinatı):
 *   blockBreak(blockIdOrColor, pos, scale?)      blockDust(blockIdOrColor, pos, faceNormal?)   stepDust(blockIdOrColor, pos)
 *   hitSpark(pos, dir?, color?, count?)           pickup(pos, color?)    xpOrb(pos, color?)    orbTrail(pos, color?)
 *   magicBurst(pos, color, {radius, scale})       portalSwirl(pos, color, {axis, radius, count})
 *   bossShockwave(pos, {radius, color})           deathMotes(pos, color, scale)   arrowTrail(pos, color?)
 *   beamImpact(pos, normal, color?)               beamTrail(a, b, color?)         healHearts(pos, count?)
 *   levelUp(pos, color?, {multi})                 achievement(pos)  (= levelUp çok renkli)
 * Büyü (particleFxMagic): fireTrail/fireBurst(pos, r), frostTrail/frostBurst, healRing(pos, color), blinkBurst(pos, color),
 *   spellCast(pos, color), enchantBurst(pos, tier).
 * Sürekli yayıcılar: addEmitter(kind 'torch'|'lava'|'portal'|'arcane'|'cauldron', pos, opts) → id; moveEmitter(id, pos);
 *   tuneEmitter(id, {color, radius}); removeEmitter(id); clearEmitters().
 * Ortam: setAmbient({fireflies, pollen, dust, snow, embers, spores, leaves, petals, ash}) — her biri 0..1 şiddet (kamera çevresinde doğar).
 * update(dt, camera) · setQuality('low'|'medium'|'high') · setReducedMotion(b) · clear() · stats() · dispose().
 *
 * Erişilebilirlik: kısıtlı harekette yoğunluk düşer, dönme/türbülans/parıldama kapanır, ışıma flaşları azalır;
 * hiçbir parıltı 3 Hz üzerinde titremez (bkz. particleLogic.MAX_FLASH_HZ).
 */
import {
  AMBIENT_KINDS, AMBIENT_RATES, PARTICLE_QUALITY, createRing, qualityKey, sanitizeAmbient,
} from './particleLogic.js';
import { PARTICLE_FRAG, PARTICLE_VERT } from './particleShaders.js';
import { createFx, createScratch } from './particleFx.js';
import { createFxMagic } from './particleFxMagic.js';
import { createFxTech } from './particleFxTech.js';

export { KIND } from './particleFx.js';

const REBASE_AT = 1800;
const MAX_EMITTERS = 192;
const TORCH_RANGE = 30;
const AMBIENT_MIN_R = 3;
const AMBIENT_MAX_R = 14;

function rngFrom(seed) {
  let a = (seed | 0) ^ 0x1b873593;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createParticleSystem(THREE, scene, opts = {}) {
  let qKey = qualityKey(opts.quality === undefined ? 'high' : opts.quality);
  const max = Math.max(64, opts.max || PARTICLE_QUALITY[qKey].max);
  const rnd = rngFrom(opts.seed === undefined ? 12345 : opts.seed);
  const colorCache = new Map();
  const tmpColor = new THREE.Color();
  const uTime = { value: 0 };
  const uCalm = { value: opts.reducedMotion ? 1 : 0 };
  let time = 0;
  let reduced = !!opts.reducedMotion;
  let baseDensity = PARTICLE_QUALITY[qKey].density;
  const NAMES = ['aStart', 'aVel', 'aParam', 'aCol0', 'aCol1', 'aMisc', 'aExtra'];

  function makeLayer(cap, additive, order) {
    const arrays = NAMES.map(() => new Float32Array(cap * 4));
    const attrs = arrays.map((arr) => new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage));
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    NAMES.forEach((n, i) => geo.setAttribute(n, attrs[i]));
    geo.instanceCount = 0;
    const start = arrays[0];
    for (let i = 0; i < cap; i++) { start[i * 4 + 3] = -1e9; arrays[1][i * 4 + 3] = 1; }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uCalm },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.name = additive ? 'particles-add' : 'particles-alpha';
    // kısmi yükleme geri çağrısı (kare başına yeni kapanış üretmemek için bir kez kurulur)
    const upload = (start, count) => {
      for (let k = 0; k < attrs.length; k++) {
        attrs[k].addUpdateRange(start * 4, count * 4);
        attrs[k].needsUpdate = true;
      }
    };
    return {
      cap, arrays, attrs, geo, mat, mesh, upload, ring: createRing(cap),
    };
  }

  const alphaCap = Math.max(192, max >> 2);
  const L = [makeLayer(max, true, 21), makeLayer(alphaCap, false, 20)];
  const group = new THREE.Group();
  group.name = 'particles';
  group.add(L[1].mesh);
  group.add(L[0].mesh);
  scene.add(group);

  function colorOf(hex) {
    let c = colorCache.get(hex);
    if (!c) {
      tmpColor.setHex(hex);
      c = [tmpColor.r, tmpColor.g, tmpColor.b];
      colorCache.set(hex, c);
    }
    return c;
  }

  /** Taslaktan bir parçacık yazar: kind 3,4,5 → normal katman, diğerleri toplamalı. */
  function emit(S) {
    const layer = S.kind === 3 || S.kind === 4 || S.kind === 5 ? L[1] : L[0];
    const i = layer.ring.alloc();
    const o = i * 4;
    const A = layer.arrays;
    A[0][o] = S.x; A[0][o + 1] = S.y; A[0][o + 2] = S.z; A[0][o + 3] = time + S.delay;
    A[1][o] = S.vx; A[1][o + 1] = S.vy; A[1][o + 2] = S.vz; A[1][o + 3] = S.life;
    A[2][o] = S.s0; A[2][o + 1] = S.s1; A[2][o + 2] = S.grav; A[2][o + 3] = S.drag;
    A[3][o] = S.r0; A[3][o + 1] = S.g0; A[3][o + 2] = S.b0; A[3][o + 3] = S.a0;
    A[4][o] = S.r1; A[4][o + 1] = S.g1; A[4][o + 2] = S.b1; A[4][o + 3] = S.a1;
    A[5][o] = S.kind; A[5][o + 1] = S.kind >= 6 ? S.tw : S.spin; A[5][o + 2] = rnd(); A[5][o + 3] = S.mode;
    A[6][o] = S.turb; A[6][o + 1] = S.tfreq; A[6][o + 2] = S.swirl; A[6][o + 3] = S.endR;
  }

  const sys = {
    S: createScratch(),
    emit,
    rnd,
    col: colorOf,
    get density() { return baseDensity * (reduced ? 0.55 : 1); },
    get reduced() { return reduced; },
    /** Keşif mağaza görünümü ({jet, gecis} skin nesneleri) — yalnız renk; null = eski renkler. */
    skin: null,
  };
  /** Keşif görünüm kümesinden (skins.resolveSkinSet) iz/geçiş renklerini alır (null/boş = varsayılan). */
  function setSkin(set) {
    // anim: low kademe / kısıtlı harekette false → ek kıvılcım ve yanıp sönme yok
    sys.skin = set && (set.jet || set.gecis) ? { jet: set.jet || null, gecis: set.gecis || null, anim: set.anim !== false } : null;
  }
  const fx = createFx(sys);
  const mfx = createFxMagic(sys);
  const tfx = createFxTech(sys);

  /* ---------------------------------------------------------------- yayıcılar */
  const emitters = [];
  for (let i = 0; i < MAX_EMITTERS; i++) {
    emitters.push({
      active: false, kind: '', x: 0, y: 0, z: 0, a: 0, b: 0, c: 0, color: 0xffffff, radius: 1, axis: 0,
    });
  }
  let emitterTop = 0;

  function addEmitter(kind, pos, o = {}) {
    let id = -1;
    for (let i = 0; i < emitterTop; i++) if (!emitters[i].active) { id = i; break; }
    if (id < 0) {
      if (emitterTop >= MAX_EMITTERS) return -1;
      id = emitterTop++;
    }
    const e = emitters[id];
    e.active = true;
    e.kind = kind;
    e.x = pos.x !== undefined ? pos.x : pos[0];
    e.y = pos.y !== undefined ? pos.y : pos[1];
    e.z = pos.z !== undefined ? pos.z : pos[2];
    e.a = rnd(); e.b = rnd(); e.c = rnd();
    e.color = o.color === undefined ? 0x3a8fff : o.color;
    e.radius = o.radius === undefined ? 1 : o.radius;
    e.axis = o.axis === 'x' ? 1 : o.axis === 'z' ? 2 : 0;
    return id;
  }
  function moveEmitter(id, pos) {
    const e = emitters[id];
    if (!e || !e.active) return;
    e.x = pos.x !== undefined ? pos.x : pos[0];
    e.y = pos.y !== undefined ? pos.y : pos[1];
    e.z = pos.z !== undefined ? pos.z : pos[2];
  }
  /** Yayıcının rengini/yoğunluğunu günceller (Simya Kazanı: radius 0 boşta, 1 demleniyor; color iksir rengi). */
  function tuneEmitter(id, o) {
    const e = emitters[id];
    if (!e || !e.active || !o) return;
    if (o.color !== undefined) e.color = o.color;
    if (o.radius !== undefined) e.radius = o.radius;
  }
  function removeEmitter(id) {
    const e = emitters[id];
    if (e) e.active = false;
  }
  function clearEmitters() {
    for (let i = 0; i < emitterTop; i++) emitters[i].active = false;
  }

  /* ---------------------------------------------------------------- ortam */
  let ambient = sanitizeAmbient(null);
  const ambAcc = new Float64Array(AMBIENT_KINDS.length);
  function setAmbient(mix) { ambient = sanitizeAmbient(mix); }

  /* ---------------------------------------------------------------- güncelleme */
  function rebase() {
    const base = Math.floor(time);
    for (let li = 0; li < L.length; li++) {
      const st = L[li].arrays[0];
      for (let i = 0; i < L[li].cap; i++) st[i * 4 + 3] -= base;
      L[li].ring.markAll();
    }
    time -= base;
  }

  function flush() {
    for (let li = 0; li < L.length; li++) {
      const layer = L[li];
      const ring = layer.ring;
      ring.drain(layer.upload);
      layer.geo.instanceCount = ring.high;
    }
  }

  function update(dt, camera) {
    const h = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
    time += h;
    if (time > REBASE_AT) rebase();
    uTime.value = time;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    if (camera) {
      const e = camera.matrixWorld.elements;
      cx = e[12]; cy = e[13]; cz = e[14];
    }
    for (let i = 0; i < emitterTop; i++) {
      const e = emitters[i];
      if (!e.active) continue;
      const dx = e.x - cx;
      const dy = e.y - cy;
      const dz = e.z - cz;
      if (camera && dx * dx + dy * dy + dz * dz > TORCH_RANGE * TORCH_RANGE) continue;
      if (e.kind === 'torch') fx.torchTick(e, h);
      else if (e.kind === 'lava') fx.lavaTick(e, h);
      else if (e.kind === 'portal') fx.portalTick(e, h);
      else if (e.kind === 'arcane') mfx.arcaneTick(e, h);
      else if (e.kind === 'cauldron') mfx.cauldronTick(e, h);
    }
    if (camera) {
      for (let k = 0; k < AMBIENT_KINDS.length; k++) {
        const kind = AMBIENT_KINDS[k];
        const v = ambient[kind];
        if (v <= 0) { ambAcc[k] = 0; continue; }
        ambAcc[k] += AMBIENT_RATES[kind] * v * sys.density * h;
        while (ambAcc[k] >= 1) {
          ambAcc[k] -= 1;
          const a = rnd() * Math.PI * 2;
          const r = AMBIENT_MIN_R + rnd() * (AMBIENT_MAX_R - AMBIENT_MIN_R);
          // düşen parçacıklar (yaprak/taçyaprağı/kül) kameranın üstünden başlar → görüş alanından geçerek iner
          const lift = kind === 'embers' || kind === 'dust' ? rnd() * 6 - 2
            : (kind === 'leaves' || kind === 'petals' || kind === 'ash' ? 0.5 + rnd() * 5 : rnd() * 4.5 - 2.2);
          fx.ambientSpawn(kind, cx + Math.cos(a) * r, cy + lift, cz + Math.sin(a) * r);
        }
      }
    }
    flush();
  }

  function setQuality(q) {
    qKey = qualityKey(q);
    baseDensity = PARTICLE_QUALITY[qKey].density;
    const f = Math.min(1, PARTICLE_QUALITY[qKey].max / max);
    L[0].ring.setActiveCap(Math.floor(L[0].cap * f));
    L[1].ring.setActiveCap(Math.floor(L[1].cap * f));
  }
  setQuality(qKey);

  function setReducedMotion(b) {
    reduced = !!b;
    uCalm.value = reduced ? 1 : 0;
  }

  function clear() {
    for (let li = 0; li < L.length; li++) {
      const st = L[li].arrays[0];
      for (let i = 0; i < L[li].cap; i++) st[i * 4 + 3] = -1e9;
      L[li].ring.markAll();
    }
    flush();
  }

  function stats() {
    let live = 0;
    for (let li = 0; li < L.length; li++) {
      const A = L[li].arrays;
      for (let i = 0; i < L[li].ring.high; i++) {
        const age = time - A[0][i * 4 + 3];
        if (age >= 0 && age < A[1][i * 4 + 3]) live++;
      }
    }
    return {
      live,
      spawned: L[0].ring.total + L[1].ring.total,
      high: [L[0].ring.high, L[1].ring.high],
      capacity: [L[0].cap, L[1].cap],
      density: sys.density,
      quality: qKey,
      reduced,
      emitters: emitters.filter((e) => e.active).length,
      drawCalls: 2,
    };
  }

  function dispose() {
    scene.remove(group);
    for (let li = 0; li < L.length; li++) { L[li].geo.dispose(); L[li].mat.dispose(); }
    clearEmitters();
  }

  return {
    object3D: group,
    update,
    setQuality,
    setReducedMotion,
    setSkin,
    setAmbient,
    clear,
    stats,
    dispose,
    addEmitter,
    moveEmitter,
    removeEmitter,
    tuneEmitter,
    clearEmitters,
    blockBreak: fx.blockBreak,
    blockDust: fx.blockDust,
    stepDust: fx.stepDust,
    hitSpark: fx.hitSpark,
    pickup: fx.pickup,
    xpOrb: fx.xpOrb,
    orbTrail: fx.orbTrail,
    magicBurst: fx.magicBurst,
    portalSwirl: fx.portalSwirl,
    bossShockwave: fx.bossShockwave,
    deathMotes: fx.deathMotes,
    arrowTrail: fx.arrowTrail,
    beamImpact: fx.beamImpact,
    beamTrail: fx.beamTrail,
    healHearts: fx.healHearts,
    fireTrail: mfx.fireTrail,
    fireBurst: mfx.fireBurst,
    frostTrail: mfx.frostTrail,
    frostBurst: mfx.frostBurst,
    healRing: mfx.healRing,
    blinkBurst: mfx.blinkBurst,
    spellCast: mfx.spellCast,
    enchantBurst: mfx.enchantBurst,
    // teknoloji (particleFxTech.js)
    techSmoke: tfx.techSmoke,
    techSpark: tfx.techSpark,
    techDust: tfx.techDust,
    jetFlame: tfx.jetFlame,
    teleportRing: tfx.teleportRing,
    scanPulse: tfx.scanPulse,
    pingGlint: tfx.pingGlint,
    shieldFlash: tfx.shieldFlash,
    chargeBurst: tfx.chargeBurst,
    portalPuff: tfx.portalPuff,
    gecisBurst: tfx.gecisBurst,
    levelUp: fx.levelUp,
    achievement: (p) => fx.levelUp(p, 0xffd24a, { multi: true }),
    /** Test/hata ayıklama: katman tamponları ve sayaçlar. */
    _debug: { layers: L, sys, get time() { return time; } },
  };
}
