/*
 * KEŞİF render — hava parçacıkları: kameranın çevresinde yağmur / kar / kül (GPU örnekli dörtgenler, tamamen shader tabanlı).
 *
 *   createWeatherLayer(THREE, {quality, reducedMotion}) → {object3D, update(dt, state, camera), setQuality(q),
 *                                                          setReducedMotion(b), setStyle('overworld'|'city'), getVisibleCount(), dispose()}
 *
 * state (her kare): { kind:'rain'|'snow'|'ash'|'clear'|null, intensity:0..1, wind:{x,z}, light:[r,g,b] (doğrusal, ortam
 *   aydınlığı; gece parçacıklar parlamasın), shelter:0..1 (üstü kapalı/yeraltı: yağış azalır), underwater:boolean }
 * `kind`/`intensity` sim/daynight.js'in precipitation(w) / w.intensity çıktısıyla doğrudan beslenir; tür değişince önce
 * eski tür sönümlenir sonra yenisi gelir. Gök gürültüsü/şimşek yoktur (çocuk dostu). Sıçrama halkaları yoktur
 * (zemin yüksekliği bilgisi shader'a verilmiyor; belgelenmiş eksik).
 *
 * Şehir stili (setStyle('city'), cityLook.applyDimensionLook çağırır): yağmur çizgileri daha uzun/ince ve neon-aydınlık (gece görünür);
 * halka sıçramaları, buhar/kıvılcım/holo-toz render/city/cityWeather.js'tedir (ayrı tek çizim çağrısı). Ana diyar stilinde çıktı değişmez.
 *
 * Yöntem: parçacık konumları bir kutuda (kamerayı izleyen) mod ile sarılır; CPU kare başına yalnız birkaç uniform yazar.
 * Yağmur hız yönünde uzayan çizgi, kar/kül kameraya bakan yumuşak disk (kül bir kısmı kor gibi parlar).
 * Görünür sayı = kalite çarpanı × şiddet; reducedMotion: sayı ×0.4, hız ×0.5, sallanma yok.
 */
import { QUALITY } from './quality.js';

const MAX_INSTANCES = 3200;
export const WEATHER_BOX = Object.freeze({ x: 30, y: 24, z: 30 });

export const WEATHER_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec3 uWind;
uniform float uTime;
uniform float uKind;
uniform float uVis;
uniform float uMotion;
uniform float uStyle;
varying vec2 vUv;
varying float vA;
varying float vRnd;

void main() {
  float rnd = aSeed.w;
  vRnd = rnd;
  if (rnd > uVis) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0);
    vA = 0.0;
    return;
  }
  float fall = uKind < 0.5 ? 16.0 + 5.0 * rnd : (uKind < 1.5 ? 1.4 + 0.9 * rnd : 0.9 + 0.8 * rnd);
  float windK = uKind < 0.5 ? 2.2 : (uKind < 1.5 ? 1.0 : 1.6);
  vec3 vel = vec3(uWind.x * windK, -fall, uWind.z * windK);
  vec3 p = aSeed.xyz * uBox + vel * uTime;
  vec3 rel = mod(p - uCam, uBox) - uBox * 0.5;
  if (uKind > 0.5 && uMotion > 0.0) {
    rel.x += sin(uTime * (0.7 + rnd) + rnd * 40.0) * 0.4 * uMotion;
    rel.z += cos(uTime * (0.6 + rnd) + rnd * 31.0) * 0.4 * uMotion;
  }
  vec3 wp = uCam + rel;
  vec2 q = position.xy;
  vUv = q + 0.5;
  float d = length(rel.xz) / (uBox.x * 0.5);
  float edge = (1.0 - smoothstep(0.55, 1.0, d)) * smoothstep(0.0, 3.0, uBox.y * 0.5 - abs(rel.y));
  float near = smoothstep(1.2, 5.0, length(rel));
  vA = edge * near;
  vec3 toCam = normalize(uCam - wp);
  if (uKind < 0.5) {
    vec3 axis = normalize(vel);
    vec3 right = normalize(cross(axis, toCam));
    float len = 0.5 + 0.025 * fall;
    float wid = 0.022;
    if (uStyle > 0.5) {
      len *= 1.3;
      wid = 0.017;
    }
    wp += axis * (-(q.y + 0.5) * len) + right * (q.x * wid);
  } else {
    vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float size = uKind < 1.5 ? 0.05 + 0.05 * rnd : 0.04 + 0.035 * rnd;
    wp += (R * q.x + U * q.y) * size;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const WEATHER_FRAG = /* glsl */ `
uniform float uKind;
uniform float uOpacity;
uniform vec3 uLight;
uniform float uStyle;
varying vec2 vUv;
varying float vA;
varying float vRnd;
void main() {
  float a;
  vec3 col;
  if (uKind < 0.5) {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float along = smoothstep(0.0, 0.1, vUv.y) * (1.0 - vUv.y * 0.85);
    a = clamp(across * 1.6, 0.0, 1.0) * along * 0.85;
    col = vec3(0.66, 0.74, 0.86) * uLight;
    if (uStyle > 0.5) {
      // şehir: neon ışığını yakalayan yağmur — ortam rengi + sabit soğuk parıltı; çizgi başına hafif camgöbeği/macenta sapması
      vec3 tint = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.72, 0.95), step(0.82, fract(vRnd * 7.31)));
      col = tint * (uLight * 1.5 + 0.085);
      a *= 1.15;
    }
  } else if (uKind < 1.5) {
    float d = length(vUv - 0.5) * 2.0;
    a = smoothstep(1.0, 0.25, d) * 0.9;
    col = vec3(0.96, 0.98, 1.0) * uLight * 1.15;
  } else {
    float d = length(vUv - 0.5) * 2.0;
    a = smoothstep(1.0, 0.35, d) * 0.85;
    float ember = step(0.86, fract(vRnd * 13.7));
    col = mix(vec3(0.16, 0.15, 0.15) * uLight, vec3(2.6, 0.85, 0.22), ember);
    a = mix(a, a * 1.1, ember);
  }
  a *= vA * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const KIND_ID = { rain: 0, snow: 1, ash: 2 };

function qualityMul(q) {
  if (typeof q === 'string') return (QUALITY[q] && QUALITY[q].weather) || 1;
  if (q && Number.isFinite(q.weather)) return q.weather;
  return 1;
}

export function createWeatherLayer(THREE, opts) {
  const o = opts || {};
  let mulQ = qualityMul(o.quality === undefined ? 'high' : o.quality);
  let reduced = !!o.reducedMotion;

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(MAX_INSTANCES * 4);
  let a = 0x2545f491;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < MAX_INSTANCES; i++) {
    seeds[i * 4] = rnd();
    seeds[i * 4 + 1] = rnd();
    seeds[i * 4 + 2] = rnd();
    // w: eşik/rastgelelik; i ile ilişkili sıralı → instanceCount azaltmak görünür sayıyı orantılı düşürür
    seeds[i * 4 + 3] = (i + 0.5) / MAX_INSTANCES;
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);

  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(WEATHER_BOX.x, WEATHER_BOX.y, WEATHER_BOX.z) },
    uWind: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uKind: { value: 0 },
    uVis: { value: 0 },
    uMotion: { value: reduced ? 0 : 1 },
    uStyle: { value: 0 },
    uOpacity: { value: 1 },
    uLight: { value: new THREE.Color(0.6, 0.65, 0.75) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WEATHER_VERT,
    fragmentShader: WEATHER_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.name = 'kesif-hava';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 200;
  mesh.visible = false;
  mesh.name = 'kesif-hava-parcaciklari';

  let curKind = 0;
  let level = 0; // gösterilen şiddet (türler arası geçişte sönümlenir)
  let shelterSm = 0;
  let disposed = false;
  let timeAcc = 0;

  return {
    object3D: mesh,

    /**
     * @param {number} dt saniye
     * @param {{kind?:string|null, intensity?:number, wind?:{x:number,z:number}, light?:number[], shelter?:number,
     *   underwater?:boolean}} s
     * @param {THREE.Camera} camera
     */
    update(dt, s, camera) {
      if (disposed) return;
      const step = dt > 0 ? Math.min(dt, 0.25) : 0;
      const st = s || {};
      const kid = st.kind && KIND_ID[st.kind] !== undefined ? KIND_ID[st.kind] : -1;
      let target = kid >= 0 ? Math.max(0, Math.min(1, st.intensity === undefined ? 1 : st.intensity)) : 0;
      if (st.underwater) target = 0;
      const sh = Math.max(0, Math.min(1, st.shelter || 0));
      shelterSm += (sh - shelterSm) * Math.min(1, step * 2);
      target *= 1 - 0.92 * shelterSm;
      // tür değişimi: önce sön, sonra geç
      if (kid >= 0 && kid !== curKind && level > 0.02) target = 0;
      else if (kid >= 0 && kid !== curKind) curKind = kid;
      level += (target - level) * Math.min(1, step * (target > level ? 1.6 : 2.2));
      if (level < 0.004 && target === 0) level = 0;

      const on = level > 0.004;
      if (mesh.visible !== on) mesh.visible = on;
      if (!on) {
        geo.instanceCount = 0;
        return;
      }
      timeAcc += step * (reduced ? 0.5 : 1);
      const u = uniforms;
      u.uTime.value = timeAcc;
      u.uKind.value = curKind;
      const density = mulQ * (reduced ? 0.4 : 1);
      const frac = Math.min(1, Math.pow(level, 0.8) * 1.05);
      const count = Math.max(1, Math.ceil(MAX_INSTANCES * Math.min(1, density) * frac));
      geo.instanceCount = count;
      // seed.w sıralı olduğundan eşik = görünen oran
      u.uVis.value = count / MAX_INSTANCES;
      u.uOpacity.value = Math.min(1, 0.35 + level * 0.9);
      if (st.wind) u.uWind.value.set(st.wind.x, 0, st.wind.z);
      if (st.light) u.uLight.value.setRGB(st.light[0], st.light[1], st.light[2]);
      u.uMotion.value = reduced ? 0 : 1;
      if (camera) {
        const e = camera.matrixWorld.elements;
        u.uCam.value.set(e[12], e[13], e[14]);
      }
    },

    /** 'low'|'medium'|'high' ya da {weather:çarpan}. */
    setQuality(q) {
      mulQ = qualityMul(q);
    },

    setReducedMotion(b) {
      reduced = !!b;
      uniforms.uMotion.value = reduced ? 0 : 1;
    },

    /** 'overworld' (varsayılan) | 'city': yağmur çizgisi stili. */
    setStyle(name) {
      uniforms.uStyle.value = name === 'city' ? 1 : 0;
    },

    getVisibleCount() {
      return mesh.visible ? geo.instanceCount : 0;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      geo.dispose();
      mat.dispose();
    },
  };
}
