/*
 * KEŞİF render — chunk malzemeleri.
 *
 *   createMaterialUniforms(THREE, overrides?) → paylaşılan uniform nesnesi ({name:{value}})
 *   createChunkMaterials(THREE, atlas, uniforms?, opts?) → {opaque, cutout, transparent, uniforms, setQuality, dispose}
 *   updateMaterialsFrame(materials, state)   kare başına uniform güncelle (ayırma yok)
 *   createChunkGeometry(THREE, pass, bounds?) → BufferGeometry (mesher çıktısındaki bir geçişten; aCity YOK — şehir için cityGeometry.createCityGeometry)
 *   materials.setCity(on)  Neon Meridyen shader varyantı (#define CITY + kalite tanımları); applyDimensionLook çağırır
 *   cityDefinesFor(level)  kalite kademesi → şehir tanımları ({CITY_PUDDLE, CITY_RINGS, CITY_WINDOW_A_OFF})
 *
 * Üç malzeme (opak, kesik, şeffaf) AYNI uniform nesnesini paylaşır; yalnızca `PASS` tanımı ve durum bayrakları değişir.
 * Gerekçe ve bayrak/öznitelik düzeni için materialShaders.js'e bakın.
 */
import { CHUNK_VERTEX, CHUNK_FRAGMENT } from './materialShaders.js';
import { MESH_ATTRIBUTES } from './mesher.js';
import { createCityNoiseTexture } from './city/cityNoise.js';

/** Kalite kademesi → shader tanımları. */
const QUALITY_DEFINES = {
  low: { USE_NORMAL_MAP: false, HIGH_DETAIL: false },
  medium: { USE_NORMAL_MAP: true, HIGH_DETAIL: false },
  high: { USE_NORMAL_MAP: true, HIGH_DETAIL: true },
};

/** Varsayılan (öğlen, çayır) uniform değerleri. THREE.Color değerleri doğrusal çalışma uzayındadır. */
export function createMaterialUniforms(THREE, overrides) {
  const col = (hex) => new THREE.Color(hex);
  const u = {
    uMap: { value: null },
    uNormalMap: { value: null },
    uMaterialMap: { value: null },
    uAtlasSize: { value: new THREE.Vector2(512, 512) },
    uCellSize: { value: new THREE.Vector2(40, 40) },
    uPad: { value: 4 },
    uTile: { value: 32 },
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uSkyLight: { value: 1 },
    uAmbientColor: { value: new THREE.Color(0.5, 0.58, 0.74) },
    uSunDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
    uSunColor: { value: new THREE.Color(0.62, 0.56, 0.44) },
    uBlockLightColor: { value: new THREE.Color(1.0, 0.62, 0.32) },
    uMinLight: { value: 0.02 },
    uEmission: { value: 1.5 },
    uNormalStrength: { value: 1 },
    uFogColor: { value: col(0xcfe6f5) },
    uFogNear: { value: 60 },
    uFogFar: { value: 150 },
    uFadeStart: { value: 130 },
    uFadeEnd: { value: 148 },
    uSkyColor: { value: col(0x3f8fe0) },
    uHorizonColor: { value: col(0xbfe3ff) },
    uUnderwater: { value: 0 },
    uUnderwaterColor: { value: new THREE.Color(0.02, 0.16, 0.28) },
    uSealColor: { value: col(0xa070ff) },
    // Şehir (yalnız CITY varyantında okunur; ana diyarda değeri etkisizdir)
    uWet: { value: 0 },
    uNeon: { value: new THREE.Vector4(0, 0.45, 0, 0) },
    uRain: { value: 0 },
    uCityNoise: { value: null },
  };
  if (overrides) {
    Object.keys(overrides).forEach((k) => {
      if (u[k]) u[k].value = overrides[k].value !== undefined ? overrides[k].value : overrides[k];
    });
  }
  return u;
}

/**
 * Şehir (CITY) kalite tanımları. low: ıslak yolda yalnız Fresnel (birikinti/halka yok), pencere grubu A (eşik 0,2) kapalı, post-fx/bloom olmadığından
 * emisyon kısık (CITY_LDR);
 * medium: birikinti gürültüsü; high: + yağmur halkaları.
 */
const CITY_DEFINES = {
  low: {
    CITY_PUDDLE: false, CITY_RINGS: false, CITY_WINDOW_A_OFF: true, CITY_LDR: true,
  },
  medium: {
    CITY_PUDDLE: true, CITY_RINGS: false, CITY_WINDOW_A_OFF: false, CITY_LDR: false,
  },
  high: {
    CITY_PUDDLE: true, CITY_RINGS: true, CITY_WINDOW_A_OFF: false, CITY_LDR: false,
  },
};
export function cityDefinesFor(level) {
  return CITY_DEFINES[level] || CITY_DEFINES.high;
}

function applyDefines(material, level, city) {
  const q = QUALITY_DEFINES[level] || QUALITY_DEFINES.high;
  const d = material.defines;
  Object.keys(q).forEach((k) => {
    if (q[k]) d[k] = '';
    else delete d[k];
  });
  const cd = cityDefinesFor(level);
  if (city) d.CITY = '';
  else delete d.CITY;
  Object.keys(cd).forEach((k) => {
    if (city && cd[k]) d[k] = '';
    else delete d[k];
  });
}

/**
 * @param {object} THREE three modülü
 * @param {object} atlas  createAtlasTextures sonucu (map, normalMap, materialMap, width, height, cell, pad, tileSize)
 * @param {object} [uniforms] paylaşılan uniform nesnesi (verilmezse createMaterialUniforms)
 * @param {{quality?:'low'|'medium'|'high'}} [opts]
 */
export function createChunkMaterials(THREE, atlas, uniforms, opts = {}) {
  const u = uniforms || createMaterialUniforms(THREE);
  const missing = createMaterialUniforms(THREE);
  Object.keys(missing).forEach((k) => {
    if (!u[k]) u[k] = missing[k];
  });
  u.uMap.value = atlas.map;
  u.uNormalMap.value = atlas.normalMap;
  u.uMaterialMap.value = atlas.materialMap;
  u.uAtlasSize.value.set(atlas.width, atlas.height);
  u.uCellSize.value.set(atlas.cell, atlas.cell);
  u.uPad.value = atlas.pad;
  u.uTile.value = atlas.tileSize;

  const make = (pass, extra) => {
    const m = new THREE.ShaderMaterial(Object.assign({
      uniforms: u,
      vertexShader: CHUNK_VERTEX,
      fragmentShader: CHUNK_FRAGMENT,
      defines: { PASS: pass },
      side: THREE.FrontSide,
    }, extra));
    m.name = ['kesif-opak', 'kesif-kesik', 'kesif-saydam'][pass];
    return m;
  };
  const opaque = make(0, { transparent: false, depthWrite: true });
  const cutout = make(1, { transparent: false, depthWrite: true });
  const transparent = make(2, {
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const all = [opaque, cutout, transparent];
  const level = opts.quality || 'high';
  const city0 = opts.city === true;
  let noiseTex = null;
  if (city0 && !u.uCityNoise.value) {
    noiseTex = createCityNoiseTexture(THREE);
    u.uCityNoise.value = noiseTex;
  }
  all.forEach((m) => applyDefines(m, level, city0));

  return {
    opaque,
    cutout,
    transparent,
    uniforms: u,
    quality: level,
    city: city0,
    /** Kalite kademesini değiştirir (shader yeniden derlenir). */
    setQuality(q) {
      this.quality = q;
      all.forEach((m) => {
        applyDefines(m, q, this.city);
        m.needsUpdate = true;
      });
    },
    /** Neon Meridyen shader varyantı (#define CITY + kalite tanımları). Değişmediyse hiçbir şey yapmaz (yeniden derleme yok). */
    setCity(on) {
      const next = !!on;
      if (next && !u.uCityNoise.value) {
        noiseTex = createCityNoiseTexture(THREE);
        u.uCityNoise.value = noiseTex;
      }
      if (next === this.city) return false;
      this.city = next;
      all.forEach((m) => {
        applyDefines(m, this.quality, next);
        m.needsUpdate = true;
      });
      return true;
    },
    dispose() {
      all.forEach((m) => m.dispose());
      if (noiseTex) {
        noiseTex.dispose();
        if (u.uCityNoise.value === noiseTex) u.uCityNoise.value = null;
        noiseTex = null;
      }
    },
  };
}

function setColor(target, v) {
  if (v === undefined || v === null) return;
  if (typeof v === 'number') target.setHex(v);
  else if (Array.isArray(v)) target.setRGB(v[0], v[1], v[2]);
  else target.copy(v);
}
function setVec(target, v) {
  if (v === undefined || v === null) return;
  if (Array.isArray(v)) target.set(v[0], v[1], v[2]);
  else target.set(v.x, v.y, v.z);
}

/**
 * Kare başına uniform güncelle. Hepsi isteğe bağlıdır; verilmeyen alan değişmez.
 * @param {object} materials createChunkMaterials sonucu
 * @param {{time?:number, dayFactor?:number, ambient?:any, sunDir?:any, sunColor?:any, blockLightColor?:any,
 *   skyColor?:any, horizonColor?:any, fogColor?:any, fogNear?:number, fogFar?:number, underwater?:boolean,
 *   underwaterColor?:any, underwaterFar?:number, reducedMotion?:boolean, motion?:number, fadeStart?:number,
 *   fadeEnd?:number, emission?:number, minLight?:number, sealColor?:any, normalStrength?:number}} state
 *   Renkler: sayı (sRGB hex), [r,g,b] (doğrusal) ya da THREE.Color. Yönler: [x,y,z] | {x,y,z}.
 */
export function updateMaterialsFrame(materials, state) {
  const u = materials.uniforms;
  const s = state || {};
  if (s.time !== undefined) u.uTime.value = s.time;
  if (s.dayFactor !== undefined) u.uSkyLight.value = s.dayFactor;
  setColor(u.uAmbientColor.value, s.ambient);
  setVec(u.uSunDir.value, s.sunDir);
  if (s.sunDir !== undefined) u.uSunDir.value.normalize();
  setColor(u.uSunColor.value, s.sunColor);
  setColor(u.uBlockLightColor.value, s.blockLightColor);
  setColor(u.uSkyColor.value, s.skyColor);
  setColor(u.uHorizonColor.value, s.horizonColor);
  setColor(u.uSealColor.value, s.sealColor);
  setColor(u.uUnderwaterColor.value, s.underwaterColor);
  if (s.emission !== undefined) u.uEmission.value = s.emission;
  if (s.minLight !== undefined) u.uMinLight.value = s.minLight;
  if (s.normalStrength !== undefined) u.uNormalStrength.value = s.normalStrength;
  if (s.motion !== undefined) u.uMotion.value = s.motion;
  else if (s.reducedMotion !== undefined) u.uMotion.value = s.reducedMotion ? 0 : 1;

  const uw = !!s.underwater;
  u.uUnderwater.value = uw ? 1 : 0;
  if (uw) {
    setColor(u.uFogColor.value, s.underwaterColor !== undefined ? s.underwaterColor : u.uUnderwaterColor.value);
    u.uFogNear.value = 0.5;
    u.uFogFar.value = s.underwaterFar !== undefined ? s.underwaterFar : 26;
    u.uFadeStart.value = u.uFogFar.value * 5;
    u.uFadeEnd.value = u.uFogFar.value * 6;
  } else {
    setColor(u.uFogColor.value, s.fogColor);
    if (s.fogNear !== undefined) u.uFogNear.value = s.fogNear;
    if (s.fogFar !== undefined) u.uFogFar.value = s.fogFar;
    if (s.fadeStart !== undefined) u.uFadeStart.value = s.fadeStart;
    else if (s.fogFar !== undefined) u.uFadeStart.value = s.fogFar * 0.86;
    if (s.fadeEnd !== undefined) u.uFadeEnd.value = s.fadeEnd;
    else if (s.fogFar !== undefined) u.uFadeEnd.value = s.fogFar * 0.99;
  }
}

/**
 * Mesher çıktısındaki bir geçişten BufferGeometry kurar (öznitelik adları MESH_ATTRIBUTES ile aynı).
 * bounds verilirse (mesh.bounds) sınırlayıcı küre/kutu hazır gelir → frustum culling ilk karede doğru çalışır.
 * Boş geçiş (vertexCount=0) için null döner.
 */
export function createChunkGeometry(THREE, pass, bounds) {
  if (!pass || pass.vertexCount === 0) return null;
  const g = new THREE.BufferGeometry();
  for (let i = 0; i < MESH_ATTRIBUTES.length; i++) {
    const a = MESH_ATTRIBUTES[i];
    g.setAttribute(a.name, new THREE.BufferAttribute(pass[a.key], a.itemSize));
  }
  g.setIndex(new THREE.BufferAttribute(pass.index, 1));
  if (bounds) {
    g.boundingBox = new THREE.Box3(
      new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]),
      new THREE.Vector3(bounds.max[0], bounds.max[1], bounds.max[2]),
    );
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(bounds.center[0], bounds.center[1], bounds.center[2]), bounds.radius + 0.5);
  } else {
    g.computeBoundingSphere();
  }
  return g;
}
