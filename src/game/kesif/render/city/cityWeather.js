/*
 * KEŞİF render/city — ŞEHİR HAVA PARÇACIKLARI (sözleşme §13): yağmur HALKA sıçramaları + ortam parçacıkları buhar, kıvılcım, holo-toz.
 * Tek InstancedMesh (TEK çizim çağrısı; ön-çarpılmış alfa harmanlama: halka/buhar ≈ normal, kıvılcım/toz ≈ toplamsal). Hepsi shader'da,
 * CPU kare başına yalnız birkaç uniform yazar; buhar kaynakları (yol ızgarasındaki menholler) ≈1,5 sn'de bir ve kamera 14 blok kayınca yenilenir.
 *
 *   ventsNear(seed, cx, cz, radius, max, out) → n        SAF, belirlenimci: sözleşme §7 yol ızgarası (x=i·80, z=j·80, i,j∈[−9,9]) üzerinde
 *                                                         ~36 blokta bir menhol; en yakın `max` (≤32) → out[n*4] = x,y,z,şiddet
 *   createCityWeather(THREE, {quality, reducedMotion, seed, groundY}) → {object3D, update(dt, state, camera), setQuality(q), setReducedMotion(b),
 *                                                         setSeed(s), getStats(), dispose()}
 *      state: {rain 0..1, night 0..1, wind:{x,z}, light:[r,g,b] (doğrusal ortam), shelter 0..1, underwater}
 *
 * Halkalar yalnız sokak düzleminde (y = groundY) görünür; kamera çatıda/yeraltında solar. Yağmur şiddeti halka sayısını, gece toz parlaklığını sürer.
 * reducedMotion: sayı ×0,4, hareket yok (halka yaşı donuk → görünmez), kıvılcım kapalı. Aile dostu: yalnız su buharı, kıvılcım ve ışık tozu.
 */
import { CITY_QUALITY, cityQualityFor } from '../quality.js';
import { hash2 } from '../../sim/rng.js';

const TWO32 = 4294967296;
export const VENT_MAX = 32;
export const CITY_WEATHER_BOX = 56;
const ROAD_STEP = 80;
const ROAD_HALF = 9;
const VENT_STEP = 36;

function fin(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Menhol/ızgara buhar kaynakları: yol çizgisi başına ~36 blokta bir (hash ofsetli), yol ortasından ≤2,5 blok yanal sapma.
 * (cx,cz) merkezli radius içindekilerden en yakın `max` tanesi out'a (x,y,z,şiddet) yazılır. Aynı girdi → aynı çıktı.
 */
export function ventsNear(seed, cx0, cz0, radius, max, out, groundY) {
  // merkez şehir sınırlarına kıstırılır (aşırı büyük sayıda k++ ilerlemez → sonsuz döngü olurdu)
  const cx = fin(cx0) ? Math.max(-3000, Math.min(3000, cx0)) : 0;
  const cz = fin(cz0) ? Math.max(-3000, Math.min(3000, cz0)) : 0;
  const cap = Math.max(0, Math.min(VENT_MAX, Math.floor(fin(max) ? max : VENT_MAX)));
  const gy = fin(groundY) ? groundY : 64;
  const s = (fin(seed) ? seed : 0) | 0;
  const r = fin(radius) && radius > 0 ? Math.min(radius, 400) : 96;
  const px = [];
  const pz = [];
  const pd = [];
  const pw = [];
  const i0 = Math.max(-ROAD_HALF, Math.floor((cx - r) / ROAD_STEP));
  const i1 = Math.min(ROAD_HALF, Math.ceil((cx + r) / ROAD_STEP));
  const j0 = Math.max(-ROAD_HALF, Math.floor((cz - r) / ROAD_STEP));
  const j1 = Math.min(ROAD_HALF, Math.ceil((cz + r) / ROAD_STEP));
  const push = (x, z, w) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d <= r) {
      px.push(x);
      pz.push(z);
      pd.push(d);
      pw.push(w);
    }
  };
  // x = i·80 çizgileri (z boyunca) ve z = j·80 çizgileri (x boyunca)
  for (let i = i0; i <= i1; i++) {
    const x0 = i * ROAD_STEP;
    const k0 = Math.floor((cz - r) / VENT_STEP);
    const k1 = Math.ceil((cz + r) / VENT_STEP);
    for (let k = k0; k <= k1; k++) {
      const h = hash2(i, k, s ^ 0x5645);
      if (h % 5 === 0) continue;
      const along = k * VENT_STEP + ((h >>> 3) % VENT_STEP);
      const lat = (((h >>> 11) % 1000) / 1000 - 0.5) * 5;
      push(x0 + lat, along, 0.6 + ((h >>> 21) % 100) / 250);
    }
  }
  for (let j = j0; j <= j1; j++) {
    const z0 = j * ROAD_STEP;
    const k0 = Math.floor((cx - r) / VENT_STEP);
    const k1 = Math.ceil((cx + r) / VENT_STEP);
    for (let k = k0; k <= k1; k++) {
      const h = hash2(k, j, s ^ 0x5646);
      if (h % 5 === 0) continue;
      const along = k * VENT_STEP + ((h >>> 3) % VENT_STEP);
      const lat = (((h >>> 11) % 1000) / 1000 - 0.5) * 5;
      push(along, z0 + lat, 0.6 + ((h >>> 21) % 100) / 250);
    }
  }
  const idx = pd.map((_, i) => i).sort((a, b) => pd[a] - pd[b] || px[a] - px[b] || pz[a] - pz[b]);
  const n = Math.min(cap, idx.length);
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    out[k * 4] = px[i];
    out[k * 4 + 1] = gy + 0.1;
    out[k * 4 + 2] = pz[i];
    out[k * 4 + 3] = pw[i];
  }
  for (let k = n * 4; k < cap * 4; k++) out[k] = 0;
  return n;
}

export const CITY_WEATHER_VERTEX = /* glsl */ `
attribute vec4 aSeed;
attribute vec2 aMeta;
uniform vec3 uCam;
uniform vec3 uWind;
uniform float uTime;
uniform float uMotion;
uniform float uGround;
uniform float uRain;
uniform float uNight;
uniform float uPlaneFade;
uniform float uBox;
uniform vec4 uVis;
uniform vec4 uVent[32];
varying vec2 vUv;
varying float vA;
varying float vKind;
varying float vR;
varying float vPh;

float h11(float x) { return fract(sin(x * 127.1 + 4.3) * 43758.5453); }

void main() {
  float kind = aSeed.w;
  vKind = kind;
  vR = aSeed.z;
  float frac = aMeta.y;
  vec2 q = position.xy;
  vUv = q + 0.5;
  vA = 0.0;
  vPh = 0.0;
  int ki = int(kind + 0.5);
  float vis = ki == 0 ? uVis.x : (ki == 1 ? uVis.y : (ki == 2 ? uVis.z : uVis.w));
  if (frac > vis) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 wp;
  vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  if (ki == 0) {
    // yağmur halkası: sokak düzleminde, hücre başına yaşam döngüsü; her döngüde konum ufak sapar
    float rate = 0.8 + 0.9 * aSeed.z;
    float tt = uTime * rate + aSeed.y * 7.0;
    float cyc = floor(tt);
    float ph = fract(tt);
    vec2 base = aSeed.xy * uBox;
    base += (vec2(h11(cyc + aMeta.x * 3.1), h11(cyc * 1.7 + aMeta.x)) - 0.5) * 6.0;
    vec2 rel = mod(base - uCam.xz + uBox * 0.5, uBox) - uBox * 0.5;
    float rad = 0.07 + ph * 0.36;
    wp = vec3(uCam.x + rel.x, uGround + 0.04, uCam.z + rel.y);
    wp.xz += q * (rad * 2.0 + 0.05);
    float d = length(rel) / (uBox * 0.5);
    vA = (1.0 - smoothstep(0.5, 1.0, d)) * (1.0 - ph) * (1.0 - ph) * uPlaneFade * (uMotion > 0.0 ? 1.0 : 0.0);
    vPh = ph;
  } else if (ki == 1) {
    // buhar: menhol başına yükselen kabarcıklar
    vec4 v = uVent[int(aMeta.x + 0.5)];
    float ph = fract(uTime * (0.12 + 0.05 * aSeed.x) + aSeed.y);
    float rise = ph * (6.0 + 3.0 * aSeed.z);
    vec3 drift = vec3(uWind.x * ph * 3.0 + sin(ph * 5.0 + aSeed.x * 20.0) * 0.5 * ph, 0.0, uWind.z * ph * 3.0 + cos(ph * 4.0 + aSeed.y * 20.0) * 0.5 * ph);
    wp = v.xyz + vec3(0.0, rise, 0.0) + drift;
    float size = 0.9 + ph * 2.8;
    wp += (R * q.x + U * q.y) * size;
    float bell = smoothstep(0.0, 0.18, ph) * (1.0 - smoothstep(0.55, 1.0, ph));
    vA = bell * step(0.001, v.w) * v.w * (uMotion > 0.0 ? 1.0 : 0.0) * uPlaneFade * 1.25;
    vPh = ph;
  } else if (ki == 2) {
    // kıvılcım: menhollerin bir kısmında kısa patlamalar
    vec4 v = uVent[int(aMeta.x + 0.5)];
    float gate = step(0.55, fract(v.w * 13.0 + 0.37));
    float cyc = 2.4 + 2.2 * aSeed.x;
    float tt = uTime / cyc + aSeed.y * 3.0 + v.x * 0.013;
    float ph = fract(tt) * (cyc / 0.9);
    float life = ph < 1.0 ? ph : 0.0;
    float ang = (aSeed.x + aSeed.y * 3.7) * 6.2831853;
    float sp = 1.2 + 2.6 * aSeed.z;
    vec3 vel = vec3(cos(ang) * sp * 0.6, 3.2 + 2.0 * aSeed.z, sin(ang) * sp * 0.6);
    wp = v.xyz + vel * life - vec3(0.0, 4.2 * life * life, 0.0);
    wp += (R * q.x + U * q.y) * 0.07;
    vA = (1.0 - life) * gate * step(0.001, v.w) * (ph < 1.0 ? 1.0 : 0.0) * (uMotion > 0.0 ? 1.0 : 0.0) * uPlaneFade;
    vPh = life;
  } else {
    // holo-toz: kamerayı izleyen kutuda süzülen ışık zerrecikleri
    vec3 box = vec3(40.0, 14.0, 40.0);
    float tt = uTime * (0.03 + 0.04 * aSeed.z);
    vec3 p = aSeed.xyz * box + vec3(sin(tt * 3.0 + aSeed.x * 30.0) * 1.5, tt * 6.0, cos(tt * 2.3 + aSeed.y * 30.0) * 1.5) * uMotion;
    vec3 rel = mod(p - uCam + box * 0.5, box) - box * 0.5;
    wp = uCam + rel;
    wp += (R * q.x + U * q.y) * (0.035 + 0.04 * aSeed.z);
    float d = length(rel.xz) / 20.0;
    vA = (1.0 - smoothstep(0.55, 1.0, d)) * smoothstep(1.0, 4.0, length(rel)) * (0.25 + 0.75 * uNight);
    vPh = aSeed.x;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const CITY_WEATHER_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uLight;
uniform float uNight;
varying vec2 vUv;
varying float vA;
varying float vKind;
varying float vR;
varying float vPh;

float fHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float fNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  float a = vA;
  if (a < 0.004) discard;
  int ki = int(vKind + 0.5);
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  vec3 col;
  float alpha;
  if (ki == 0) {
    // halka: ince parlak çember (kenarı yumuşak) + merkezde ince nokta
    float ring = smoothstep(0.11, 0.0, abs(d - 0.8));
    col = (uLight * 1.8 + vec3(0.05, 0.06, 0.1)) * ring * a * 1.5;
    alpha = ring * a * 0.22;
  } else if (ki == 1) {
    float n = fNoise(c * 5.0 + vR * 31.0 + vPh * 2.0);
    float soft = smoothstep(1.0, 0.1, d) * (0.55 + 0.7 * n);
    vec3 tint = mix(vec3(0.58, 0.62, 0.72), vec3(0.8, 0.45, 0.9), step(0.7, fract(vR * 7.1)));
    col = (uLight * 1.9 + 0.045 + tint * 0.06 * uNight) * soft * a * 0.55;
    alpha = soft * a * 0.38;
  } else if (ki == 2) {
    float core = smoothstep(1.0, 0.0, d);
    col = vec3(2.4, 1.1, 0.32) * core * core * a * (0.8 + vR);
    alpha = 0.0;
  } else {
    float core = smoothstep(1.0, 0.0, d);
    vec3 hue = mix(vec3(0.1, 0.85, 1.0), vec3(1.0, 0.25, 0.7), step(0.55, fract(vR * 9.7 + vPh)));
    col = hue * core * core * a * 1.6;
    alpha = 0.0;
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / TWO32;
  };
}

const KIND_RING = 0;
const KIND_STEAM = 1;
const KIND_SPARK = 2;
const KIND_DUST = 3;

/**
 * @param {object} THREE three modülü
 * @param {{quality?:string|object, reducedMotion?:boolean, seed?:number, groundY?:number}} [opts]
 */
export function createCityWeather(THREE, opts) {
  const o = opts || {};
  let cq = o.quality === undefined ? CITY_QUALITY.high : o.quality && o.quality.rings !== undefined ? o.quality : cityQualityFor(o.quality);
  let reduced = !!o.reducedMotion;
  let seed = fin(o.seed) ? o.seed | 0 : 0;
  const groundY = fin(o.groundY) ? o.groundY : 64;
  let disposed = false;

  const maxRing = CITY_QUALITY.high.rings;
  const maxSteam = CITY_QUALITY.high.steam;
  const maxSpark = CITY_QUALITY.high.sparks;
  const maxDust = CITY_QUALITY.high.dust;
  const total = maxRing + maxSteam + maxSpark + maxDust;

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(total * 4);
  const meta = new Float32Array(total * 2);
  const rnd = mulberry(0x6e656f6e);
  let n = 0;
  const fill = (kind, count) => {
    for (let i = 0; i < count; i++, n++) {
      seeds[n * 4] = rnd();
      seeds[n * 4 + 1] = rnd();
      seeds[n * 4 + 2] = rnd();
      seeds[n * 4 + 3] = kind;
      // meta.x: kaynak indeksi (buhar/kıvılcım) ya da örnek no; meta.y: tür içi sıra oranı (kalite kırpması)
      meta[n * 2] = kind === KIND_STEAM || kind === KIND_SPARK ? i % VENT_MAX : i;
      meta[n * 2 + 1] = (i + 0.5) / count;
    }
  };
  fill(KIND_RING, maxRing);
  fill(KIND_STEAM, maxSteam);
  fill(KIND_SPARK, maxSpark);
  fill(KIND_DUST, maxDust);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.setAttribute('aMeta', new THREE.InstancedBufferAttribute(meta, 2));
  geo.instanceCount = total;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const vent = [];
  for (let i = 0; i < VENT_MAX; i++) vent.push(new THREE.Vector4(0, 0, 0, 0));
  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uWind: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uMotion: { value: reduced ? 0 : 1 },
    uGround: { value: groundY },
    uRain: { value: 0 },
    uNight: { value: 0 },
    uPlaneFade: { value: 1 },
    uBox: { value: CITY_WEATHER_BOX },
    uVis: { value: new THREE.Vector4(0, 0, 0, 0) },
    uVent: { value: vent },
    uLight: { value: new THREE.Color(0.2, 0.22, 0.35) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CITY_WEATHER_VERTEX,
    fragmentShader: CITY_WEATHER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    fog: false,
  });
  mat.name = 'kesif-sehir-hava';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'kesif-sehir-hava-parcaciklari';
  mesh.frustumCulled = false;
  mesh.renderOrder = 210;
  mesh.visible = false;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (camera && camera.matrixWorld) {
      const e = camera.matrixWorld.elements;
      uniforms.uCam.value.set(e[12], e[13], e[14]);
    }
  };

  let timeAcc = 0;
  let ventAcc = 99;
  const ventBuf = new Float32Array(VENT_MAX * 4);
  let ventCx = 1e9;
  let ventCz = 1e9;
  let ventCount = 0;
  const stats = { rings: 0, steam: 0, sparks: 0, dust: 0, vents: 0 };

  function refreshVents(cx, cz) {
    ventCx = cx;
    ventCz = cz;
    ventCount = ventsNear(seed, cx, cz, 110, Math.min(VENT_MAX, Math.max(8, Math.floor(cq.steam / 3))), ventBuf, groundY);
    for (let i = 0; i < VENT_MAX; i++) {
      if (i < ventCount) vent[i].set(ventBuf[i * 4], ventBuf[i * 4 + 1], ventBuf[i * 4 + 2], ventBuf[i * 4 + 3]);
      else vent[i].set(0, 0, 0, 0);
    }
    stats.vents = ventCount;
  }

  return {
    object3D: mesh,

    /** state: {rain, night, wind:{x,z}, light:[r,g,b], shelter, underwater}. camera: THREE.Camera (konum için). */
    update(dt, state, camera) {
      if (disposed) return;
      const step = dt > 0 ? Math.min(dt, 0.25) : 0;
      const st = state || {};
      const rain = clamp01(fin(st.rain) ? st.rain : 0);
      const night = clamp01(fin(st.night) ? st.night : 0);
      const shelter = clamp01(fin(st.shelter) ? st.shelter : 0);
      const under = !!st.underwater;
      const k = reduced ? 0.4 : 1;
      let cx = ventCx;
      let cz = ventCz;
      let cy = groundY + 1.7;
      if (camera && camera.matrixWorld) {
        const e = camera.matrixWorld.elements;
        cx = e[12];
        cz = e[14];
        cy = e[13];
        uniforms.uCam.value.set(e[12], e[13], e[14]);
      }
      timeAcc += step * (reduced ? 0.5 : 1);
      ventAcc += step;
      if ((ventAcc >= 1.5 && Math.hypot(cx - ventCx, cz - ventCz) > 14) || ventAcc >= 6 || ventCx > 1e8) {
        ventAcc = 0;
        refreshVents(cx, cz);
      }
      const u = uniforms;
      u.uTime.value = timeAcc;
      u.uMotion.value = reduced ? 0 : 1;
      u.uRain.value = rain;
      u.uNight.value = night;
      // sokak düzlemi halkaları: kamera çatıdaysa (>18 blok yukarıda) ya da yeraltındaysa solar
      const up = clamp01(1 - (cy - groundY - 18) / 22);
      const dn = clamp01((cy - (groundY - 3)) / 2);
      u.uPlaneFade.value = up * dn * (1 - 0.92 * shelter);
      if (st.wind) u.uWind.value.set(fin(st.wind.x) ? st.wind.x : 0, 0, fin(st.wind.z) ? st.wind.z : 0);
      if (st.light && fin(st.light[0]) && fin(st.light[1]) && fin(st.light[2])) u.uLight.value.setRGB(st.light[0], st.light[1], st.light[2]);
      const rings = under ? 0 : Math.min(1, (cq.rings / maxRing) * k * Math.min(1, rain * 1.4));
      const steam = under ? 0 : Math.min(1, (cq.steam / maxSteam) * k);
      const sparks = under || reduced ? 0 : Math.min(1, cq.sparks / maxSpark);
      const dust = under ? 0 : Math.min(1, (cq.dust / maxDust) * k);
      u.uVis.value.set(rings, steam, sparks, dust);
      stats.rings = Math.round(maxRing * rings);
      stats.steam = Math.round(maxSteam * steam);
      stats.sparks = Math.round(maxSpark * sparks);
      stats.dust = Math.round(maxDust * dust);
      mesh.visible = !under && (rings > 0 || steam > 0 || sparks > 0 || dust > 0);
    },

    /** 'low'|'medium'|'high' ya da CITY_QUALITY girdisi. */
    setQuality(q) {
      cq = q && q.rings !== undefined ? q : cityQualityFor(q);
      ventAcc = 99;
    },

    setReducedMotion(b) {
      reduced = !!b;
      uniforms.uMotion.value = reduced ? 0 : 1;
    },

    /** Şehir tohumu (buhar kaynaklarının yerleşimi). */
    setSeed(s) {
      seed = fin(s) ? s | 0 : 0;
      ventAcc = 99;
      ventCx = 1e9;
    },

    getStats() {
      return Object.assign({ visible: mesh.visible }, stats);
    },
    get drawCalls() {
      return mesh.visible ? 1 : 0;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      geo.dispose();
      mat.dispose();
      if (mesh.parent) mesh.parent.remove(mesh);
    },
  };
}

