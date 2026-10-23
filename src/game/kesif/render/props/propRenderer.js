/*
 * KEŞİF render/props — PROP RENDER KATMANI (three; sim/props PropWorld'ünü çizer). Sözleşme KESIF_CITY_CONTRACT §6.
 *
 *   const pr = createPropRenderer({THREE, uniforms?, quality?, signAtlas?, createCanvas?, anisotropy?, limits?})   (limits: yalnız ölçüm/test)
 *   pr.group                 THREE.Group (sahneye eklenir: scene/entityRoot)
 *   pr.setWorld(pw, {getLight?})   PropWorld bağlar; getLight(x,y,z) → (gökyüzü<<4)|blok (world.getLight)
 *   pr.update(dt, camera)    kare başı: ≤10 Hz görünür-chunk kümesi denetimi, küme/yüklü küme değişince yeniden kurma, durum senkronu, ışık tazeleme
 *   pr.invalidate()          bir sonraki update'te yeniden kur           pr.setQuality('low'|'medium'|'high')   pr.dispose()
 *   pr.stats                 {rebuilds, lastRebuildMs, maxRebuildMs, instances, tris, draws, holo, skipped, chunks, candidates, updateMs}
 *
 * Tasarım: tanım (ağaç: varyant grubu) başına 1 InstancedMesh (+ holo ek malzemesi: billboard/boyut kapısı, toplamsal); ≤15 çizim çağrısı.
 * Örnek kümesi YALNIZ görünür chunk kümesi (mesafe + geniş görüş açısı süzgeci) ya da yüklü küme değişince yeniden kurulur; kare başı yeniden kurma
 * yok. Bütçe (kademe): örnek 2500/1600/900, üçgen 60k/40k/20k, holo 24/16/8; sınır aşılırsa EN UZAK örnekler düşer (yakından uzağa, mesafe kovaları).
 * Sis çizim-mesafesi uFadeEnd'dir (paylaşılan uniform): ötesi çizilmez. Işık: örnek başına gökyüzü/blok ışığı, kare başı ≤96 örnek tazelenir.
 */
import { createMaterialUniforms } from '../materials.js';
import { createPropGeometries } from './propGeo.js';
import { HOLO_FRAGMENT, PROP_FRAGMENT, PROP_VERTEX } from './propShaders.js';
import { createSignAtlas } from './signAtlas.js';
import { SIGN_ENTRIES } from '../../sim/props/propSigns.js';
import { hash32 } from '../../sim/rng.js';

/** Neon tonları (sRGB): camgöbeği, pembe, kehribar, limon — SIGN_HUES ve blok 229–232 sırası. */
export const HUE_RGB = Object.freeze([0x28f0ff, 0xff3fa8, 0xffae2b, 0xc8ff3a]);

export const PROP_TIERS = Object.freeze({
  high: Object.freeze({
    cap: 512, maxInst: 2500, maxTris: 60000, maxHolo: 24, lightPerFrame: 96,
  }),
  medium: Object.freeze({
    cap: 320, maxInst: 1600, maxTris: 40000, maxHolo: 16, lightPerFrame: 64,
  }),
  low: Object.freeze({
    cap: 160, maxInst: 900, maxTris: 20000, maxHolo: 8, lightPerFrame: 48,
  }),
});

const MAX_CAP = 512;
const HOLO_CAP = 32;
const CADENCE = 0.1;
const STATE_CADENCE = 0.1;
const BUCKETS = 64;
const SHARED_KEYS = [
  'uTime', 'uMotion', 'uSkyLight', 'uAmbientColor', 'uSunDir', 'uSunColor', 'uBlockLightColor', 'uMinLight', 'uEmission',
  'uFogColor', 'uFogNear', 'uFogFar', 'uFadeStart', 'uFadeEnd', 'uSkyColor', 'uHorizonColor', 'uUnderwater',
];
const YAW_C = [1, 0, -1, 0];
const YAW_S = [0, 1, 0, -1];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function buildUniforms(THREE, shared, own) {
  const base = createMaterialUniforms(THREE);
  const u = {};
  SHARED_KEYS.forEach((k) => {
    u[k] = shared && shared[k] ? shared[k] : base[k];
  });
  u.uWet = shared && shared.uWet ? shared.uWet : { value: 0 };
  u.uSignMap = own.signMap;
  u.uFaceAspect = { value: own.faceAspect };
  u.uEmissive = { value: own.emissive };
  return u;
}

function makeMaterial(THREE, shared, o) {
  const holo = !!o.holoMode;
  const m = new THREE.ShaderMaterial({
    uniforms: buildUniforms(THREE, shared, o),
    vertexShader: PROP_VERTEX,
    fragmentShader: holo ? HOLO_FRAGMENT : PROP_FRAGMENT,
    defines: holo ? { HOLO_MODE: o.holoMode - 1 } : {},
    side: holo ? THREE.DoubleSide : THREE.FrontSide,
    transparent: holo,
    depthWrite: !holo,
    blending: holo ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  m.name = o.name;
  return m;
}

function instAttr(THREE, n, size) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

function makeInstanced(THREE, geometry, material, cap, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, cap);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = instAttr(THREE, cap, 3);
  const aInst = instAttr(THREE, cap, 4);
  const aSign = instAttr(THREE, cap, 4);
  const aLight = instAttr(THREE, cap, 2);
  geometry.setAttribute('aInst', aInst);
  geometry.setAttribute('aSign', aSign);
  geometry.setAttribute('aLight', aLight);
  return {
    mesh, aInst, aSign, aLight, color: mesh.instanceColor, count: 0,
  };
}

function markDirty(attr, count) {
  if (attr.clearUpdateRanges) attr.clearUpdateRanges();
  if (attr.addUpdateRange) attr.addUpdateRange(0, count * attr.itemSize);
  attr.needsUpdate = true;
}

export function createPropRenderer(o) {
  const THREE = o.THREE;
  let tierKey = PROP_TIERS[o.quality] ? o.quality : 'high';
  // o.limits: yalnız ölçüm/test için kademe sınırlarını ezer (örn. {maxTris: 1e9}: 2500 örnek bütçesini üçgen sınırından bağımsız ölç)
  const tierOf = (k) => (o.limits ? Object.assign({}, PROP_TIERS[k], o.limits) : PROP_TIERS[k]);
  let tier = tierOf(tierKey);
  const atlas = o.signAtlas || createSignAtlas({ THREE, createCanvas: o.createCanvas, anisotropy: o.anisotropy });
  const ownAtlas = !o.signAtlas;
  const signMap = { value: atlas.texture };
  const group = new THREE.Group();
  group.name = 'kesif-proplar';

  const hueLin = HUE_RGB.map((hex) => [
    srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255),
  ]);

  const geos = createPropGeometries(THREE);
  const slots = new Map();
  const materials = [];
  geos.forEach((g, key) => {
    const def = g.def;
    const faceAspect = def.sign ? def.sign.w / def.sign.h : 1;
    const bodyMat = makeMaterial(THREE, o.uniforms, {
      signMap, faceAspect, emissive: def.emissive, name: 'kesif-prop-' + key,
    });
    materials.push(bodyMat);
    const body = makeInstanced(THREE, g.body, bodyMat, MAX_CAP, 'prop-' + key);
    group.add(body.mesh);
    let holo = null;
    if (g.holo) {
      const holoMat = makeMaterial(THREE, o.uniforms, {
        signMap,
        faceAspect: def.sign ? def.sign.w / def.sign.h : 1,
        emissive: Math.max(def.emissive, 0.8),
        holoMode: def.sign ? 1 : 2,
        name: 'kesif-prop-holo-' + key,
      });
      materials.push(holoMat);
      holo = makeInstanced(THREE, g.holo, holoMat, HOLO_CAP, 'prop-holo-' + key);
      holo.mesh.renderOrder = 5;
      group.add(holo.mesh);
    }
    slots.set(key, {
      key,
      def,
      body,
      holo,
      tris: g.tris,
      holoTris: g.holoTris,
      ids: new Uint32Array(MAX_CAP),
      holoSrc: new Int32Array(HOLO_CAP),
      count: 0,
      holoCount: 0,
      stateful: def.states > 1,
      geo: g,
    });
  });
  const slotList = Array.from(slots.values());
  // t → yuva (ağaç: varyant bit 2'ye göre iki yuva); örnek başı dizge anahtarı/Map araması yok
  const slotByT = [];
  const jitterByT = [];
  slotList.forEach((slot) => {
    const t = slot.def.t;
    if (slot.key === 'agac') slotByT[t] = [slot, slots.get('agac:1')];
    else if (slot.key !== 'agac:1') slotByT[t] = slot;
    jitterByT[t] = slot.def.tags.indexOf('bitki') >= 0;
  });

  /* ---- durum ---- */
  let pw = null;
  let getLight = null;
  let forced = true;
  let verSeen = -1;
  let sigSeen = -1;
  let accum = CADENCE;
  let stateAccum = 0;
  let lightSlot = 0;
  let lightIdx = 0;
  let disposed = false;
  const visIds = [];
  let candE = [];
  let candB = new Uint8Array(4096);
  const bucketCount = new Int32Array(BUCKETS + 1);
  let order = new Int32Array(4096);
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const stats = {
    rebuilds: 0, lastRebuildMs: 0, maxRebuildMs: 0, instances: 0, tris: 0, draws: 0, holo: 0, skipped: 0, chunks: 0, candidates: 0, updateMs: 0,
  };

  function viewRadius() {
    const u = o.uniforms && o.uniforms.uFadeEnd;
    const r = u ? u.value : 150;
    return Math.max(24, Math.min(r + 4, 400));
  }

  function collectVisible(camera, cx, cz, radius) {
    visIds.length = 0;
    let sig = 17;
    let chunks = 0;
    const near = 22;
    const haveFrustum = !!(camera && camera.projectionMatrix && camera.matrixWorldInverse);
    if (haveFrustum) {
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);
    }
    pw.forEachChunk((chx, chz, ids) => {
      const x = chx * 16 + 8;
      const z = chz * 16 + 8;
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      const lim = radius + 12;
      if (d2 > lim * lim) return;
      if (haveFrustum && d2 > near * near) {
        sphere.center.set(x, 66, z);
        sphere.radius = 17;
        if (!frustum.intersectsSphere(sphere)) return;
      }
      visIds.push(ids);
      chunks++;
      sig = (Math.imul(sig, 31) + ((chx + 1024) << 12 | (chz + 1024))) | 0;
    });
    stats.chunks = chunks;
    return Math.imul(sig, 7) + chunks;
  }

  function slotFor(def, variant) {
    const e = slotByT[def.t];
    if (!e) return null;
    return Array.isArray(e) ? e[(variant & 4) >> 2] : e;
  }

  function rebuild(cx, cy, cz, radius) {
    const t0 = now();
    for (let s = 0; s < slotList.length; s++) {
      slotList[s].count = 0;
      slotList[s].holoCount = 0;
    }
    // adaylar: kovaya göre (yakından uzağa) sıralı
    let n = 0;
    const invB = BUCKETS / (radius + 16);
    bucketCount.fill(0);
    for (let c = 0; c < visIds.length; c++) {
      const ids = visIds[c];
      for (let k = 0; k < ids.length; k++) {
        const e = pw.entry(ids[k]);
        if (!e) continue;
        const dx = e.prop.x - cx;
        const dz = e.prop.z - cz;
        const dy = e.prop.y - cy;
        const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.25);
        if (d > radius) continue;
        if (n >= candB.length) {
          const nb = new Uint8Array(candB.length * 2);
          nb.set(candB);
          candB = nb;
        }
        const b = Math.min(BUCKETS - 1, Math.floor(d * invB));
        candE[n] = e;
        candB[n] = b;
        bucketCount[b + 1]++;
        n++;
      }
    }
    // dinamik proplar da yakın kümeye girer (chunk'a bağlı değil)
    pw.forEachDynamic((e) => {
      const dx = e.prop.x - cx;
      const dz = e.prop.z - cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > radius) return;
      if (n >= candB.length) {
        const nb = new Uint8Array(candB.length * 2);
        nb.set(candB);
        candB = nb;
      }
      const b = Math.min(BUCKETS - 1, Math.floor(d * invB));
      candE[n] = e;
      candB[n] = b;
      bucketCount[b + 1]++;
      n++;
    });
    candE.length = n;
    for (let b = 0; b < BUCKETS; b++) bucketCount[b + 1] += bucketCount[b];
    if (order.length < n) order = new Int32Array(Math.max(n, order.length * 2));
    for (let i = 0; i < n; i++) order[bucketCount[candB[i]]++] = i;

    let total = 0;
    let tris = 0;
    let holo = 0;
    let skipped = 0;
    for (let oi = 0; oi < n; oi++) {
      const e = candE[order[oi]];
      const p = e.prop;
      const d = e.def;
      const slot = slotFor(d, p.variant);
      if (!slot) continue;
      if (slot.count >= tier.cap || total >= tier.maxInst || tris + slot.tris > tier.maxTris) {
        skipped++;
        continue;
      }
      const i = slot.count++;
      total++;
      tris += slot.tris;
      slot.ids[i] = p.id;
      writeInstance(slot, i, e, p, d);
      if (slot.holo && holo < tier.maxHolo && slot.holoCount < HOLO_CAP && tris + slot.holoTris <= tier.maxTris) {
        const hi = slot.holoCount++;
        holo++;
        tris += slot.holoTris;
        copyHolo(slot, i, hi);
      }
    }
    for (let s = 0; s < slotList.length; s++) {
      const slot = slotList[s];
      const b = slot.body;
      b.mesh.count = slot.count;
      b.mesh.visible = slot.count > 0;
      if (slot.count > 0) {
        markDirty(b.mesh.instanceMatrix, slot.count);
        markDirty(b.color, slot.count);
        markDirty(b.aInst, slot.count);
        markDirty(b.aSign, slot.count);
        markDirty(b.aLight, slot.count);
      }
      if (slot.holo) {
        const h = slot.holo;
        h.mesh.count = slot.holoCount;
        h.mesh.visible = slot.holoCount > 0;
        if (slot.holoCount > 0) {
          markDirty(h.mesh.instanceMatrix, slot.holoCount);
          markDirty(h.color, slot.holoCount);
          markDirty(h.aInst, slot.holoCount);
          markDirty(h.aSign, slot.holoCount);
          markDirty(h.aLight, slot.holoCount);
        }
      }
    }
    candE.length = 0;
    let draws = 0;
    for (let s = 0; s < slotList.length; s++) {
      if (slotList[s].count > 0) draws++;
      if (slotList[s].holo && slotList[s].holoCount > 0) draws++;
    }
    stats.instances = total;
    stats.tris = tris;
    stats.draws = draws;
    stats.holo = holo;
    stats.skipped = skipped;
    stats.candidates = n;
    stats.rebuilds++;
    const ms = now() - t0;
    stats.lastRebuildMs = ms;
    if (ms > stats.maxRebuildMs) stats.maxRebuildMs = ms;
    lightSlot = 0;
    lightIdx = 0;
  }

  const _tint = [1, 1, 1];
  function writeInstance(slot, i, e, p, d) {
    const mesh = slot.body.mesh;
    const m = mesh.instanceMatrix.array;
    const o16 = i * 16;
    const c = YAW_C[p.yaw & 3];
    const s = YAW_S[p.yaw & 3];
    const hsh = hash32(p.id);
    let sc = 1;
    if (jitterByT[d.t] === true) sc = 0.92 + 0.16 * ((hsh & 255) / 255);
    m[o16] = c * sc; m[o16 + 1] = 0; m[o16 + 2] = -s * sc; m[o16 + 3] = 0;
    m[o16 + 4] = 0; m[o16 + 5] = sc; m[o16 + 6] = 0; m[o16 + 7] = 0;
    m[o16 + 8] = s * sc; m[o16 + 9] = 0; m[o16 + 10] = c * sc; m[o16 + 11] = 0;
    m[o16 + 12] = p.x; m[o16 + 13] = p.y; m[o16 + 14] = p.z; m[o16 + 15] = 1;

    let hue = p.variant & 3;
    let mode = ((p.variant >> 2) & 1) === 1 ? 1 : 0;
    let rect = null;
    if (d.sign) {
      const en = SIGN_ENTRIES[p.flags & 0xffff] || SIGN_ENTRIES[0];
      hue = en.hue;
      mode = en.mode;
      rect = atlas.rectOf(en.i);
    }
    const lin = hueLin[hue & 3];
    _tint[0] = lin[0]; _tint[1] = lin[1]; _tint[2] = lin[2];
    const b = slot.body;
    b.color.array[i * 3] = _tint[0]; b.color.array[i * 3 + 1] = _tint[1]; b.color.array[i * 3 + 2] = _tint[2];
    const ai = i * 4;
    b.aInst.array[ai] = e.state;
    b.aInst.array[ai + 1] = ((hsh >>> 8) & 1023) / 1023;
    b.aInst.array[ai + 2] = ((hsh >>> 18) & 255) / 255;
    b.aInst.array[ai + 3] = mode;
    if (rect) {
      b.aSign.array[ai] = rect[0]; b.aSign.array[ai + 1] = rect[1]; b.aSign.array[ai + 2] = rect[2]; b.aSign.array[ai + 3] = rect[3];
    } else {
      b.aSign.array[ai] = 0; b.aSign.array[ai + 1] = 0; b.aSign.array[ai + 2] = 1; b.aSign.array[ai + 3] = 1;
    }
    b.aLight.array[i * 2] = e.ls === undefined ? 0.85 : e.ls;
    b.aLight.array[i * 2 + 1] = e.ls === undefined ? 0 : e.lb;
  }

  function copyHolo(slot, i, hi) {
    const b = slot.body;
    const h = slot.holo;
    h.mesh.instanceMatrix.array.set(b.mesh.instanceMatrix.array.subarray(i * 16, i * 16 + 16), hi * 16);
    h.color.array.set(b.color.array.subarray(i * 3, i * 3 + 3), hi * 3);
    h.aInst.array.set(b.aInst.array.subarray(i * 4, i * 4 + 4), hi * 4);
    h.aSign.array.set(b.aSign.array.subarray(i * 4, i * 4 + 4), hi * 4);
    h.aLight.array.set(b.aLight.array.subarray(i * 2, i * 2 + 2), hi * 2);
    slot.holoSrc[hi] = i; // holo örneğinin gövde örneği (durum/ışık eşlemesi)
  }

  function syncStates() {
    for (let s = 0; s < slotList.length; s++) {
      const slot = slotList[s];
      if (!slot.stateful || slot.count === 0) continue;
      let dirty = false;
      const a = slot.body.aInst.array;
      for (let i = 0; i < slot.count; i++) {
        const st = pw.state(slot.ids[i]);
        if (a[i * 4] !== st) {
          a[i * 4] = st;
          dirty = true;
        }
      }
      if (dirty) markDirty(slot.body.aInst, slot.count);
      if (slot.holo && slot.holoCount > 0) {
        const ha = slot.holo.aInst.array;
        let hd = false;
        for (let i = 0; i < slot.holoCount; i++) {
          const st = pw.state(slot.ids[slot.holoSrc[i]]);
          if (ha[i * 4] !== st) {
            ha[i * 4] = st;
            hd = true;
          }
        }
        if (hd) markDirty(slot.holo.aInst, slot.holoCount);
      }
    }
  }

  function refreshLight() {
    if (!getLight) return;
    let budget = tier.lightPerFrame;
    let guard = slotList.length + 1;
    const dirtySlots = [];
    while (budget > 0 && guard > 0) {
      const slot = slotList[lightSlot];
      if (lightIdx >= slot.count) {
        lightSlot = (lightSlot + 1) % slotList.length;
        lightIdx = 0;
        guard--;
        continue;
      }
      const i = lightIdx++;
      budget--;
      const e = pw.entry(slot.ids[i]);
      if (!e) continue;
      const p = e.prop;
      const l = getLight(Math.floor(p.x), Math.floor(p.y + Math.min(1.5, e.def.size[1] * 0.5)), Math.floor(p.z));
      if (typeof l !== 'number') continue;
      const sky = (l >> 4) / 15;
      const blk = (l & 15) / 15;
      const a = slot.body.aLight.array;
      if (Math.abs(a[i * 2] - sky) > 0.02 || Math.abs(a[i * 2 + 1] - blk) > 0.02) {
        a[i * 2] = sky;
        a[i * 2 + 1] = blk;
        if (dirtySlots.indexOf(slot) < 0) dirtySlots.push(slot);
      }
      e.ls = sky; // örnek ışığı PropWorld girişinde saklanır: yeniden kurmada Map araması yok, boşaltınca birlikte gider
      e.lb = blk;
    }
    for (let k = 0; k < dirtySlots.length; k++) {
      const slot = dirtySlots[k];
      markDirty(slot.body.aLight, slot.count);
      if (slot.holo && slot.holoCount > 0) {
        for (let hi = 0; hi < slot.holoCount; hi++) {
          const src = slot.holoSrc[hi];
          slot.holo.aLight.array[hi * 2] = slot.body.aLight.array[src * 2];
          slot.holo.aLight.array[hi * 2 + 1] = slot.body.aLight.array[src * 2 + 1];
        }
        markDirty(slot.holo.aLight, slot.holoCount);
      }
    }
  }

  const api = {
    group,
    stats,
    atlas,
    get quality() { return tierKey; },
    get tier() { return tier; },
    /** Test/ölçüm: yuva tablosu (salt okunur kullan). */
    get slots() { return slots; },

    setWorld(world, opts) {
      pw = world || null;
      getLight = opts && typeof opts.getLight === 'function' ? opts.getLight : null;
      forced = true;
      verSeen = -1;
      sigSeen = -1;
      for (let s = 0; s < slotList.length; s++) {
        slotList[s].count = 0;
        slotList[s].holoCount = 0;
        slotList[s].body.mesh.count = 0;
        slotList[s].body.mesh.visible = false;
        if (slotList[s].holo) {
          slotList[s].holo.mesh.count = 0;
          slotList[s].holo.mesh.visible = false;
        }
      }
      stats.instances = 0;
      stats.tris = 0;
      stats.draws = 0;
    },

    invalidate() {
      forced = true;
    },

    setQuality(q) {
      if (!PROP_TIERS[q] || q === tierKey) return;
      tierKey = q;
      tier = tierOf(q);
      forced = true;
    },

    update(dt, camera) {
      if (disposed || !pw) return;
      const t0 = now();
      accum += dt > 0 ? dt : 0;
      stateAccum += dt > 0 ? dt : 0;
      const ex = camera ? camera.position.x : 0;
      const ey = camera ? camera.position.y : 64;
      const ez = camera ? camera.position.z : 0;
      const versionChanged = pw.version !== verSeen;
      if (forced || versionChanged || accum >= CADENCE) {
        accum = 0;
        const radius = viewRadius();
        const sig = collectVisible(camera, ex, ez, radius);
        if (forced || versionChanged || sig !== sigSeen) {
          rebuild(ex, ey, ez, radius);
          sigSeen = sig;
          verSeen = pw.version;
          forced = false;
          stateAccum = 0;
        }
      }
      if (stateAccum >= STATE_CADENCE) {
        stateAccum = 0;
        syncStates();
      }
      refreshLight();
      stats.updateMs = now() - t0;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      slotList.forEach((slot) => {
        group.remove(slot.body.mesh);
        slot.body.mesh.dispose();
        slot.geo.body.dispose();
        if (slot.holo) {
          group.remove(slot.holo.mesh);
          slot.holo.mesh.dispose();
          slot.geo.holo.dispose();
        }
      });
      materials.forEach((m) => m.dispose());
      if (ownAtlas) atlas.dispose();
      slots.clear();
      pw = null;
    },
  };
  return api;
}
