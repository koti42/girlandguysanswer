/*
 * KEŞİF render/city — HOLOGRAFİK REKLAMLAR (sözleşme §13: toplam ≤24, aynı anda ≤8 görünür, TEK çizim çağrısı).
 * Gökdelen cephelerinin önünde yüzen, tarama çizgili ışıklı panolar: yazı YOK (tabela dizgeleri props katmanının signAtlas'ındadır);
 * beş soyut desen (radar halkaları, şerit oku, ekolayzır, baklava ızgarası, oynat simgesi) × dört neon tonu. Aile dostu, markasız.
 *
 *   pickHoloAnchors(boxes, seed, max=24) → [{x,y,z,yaw,w,h,hue,pattern,phase}]   SAF, belirlenimci: en uzun kuleler arasından hash'le seçer,
 *                                          şehir merkezine bakan cepheye yerleştirir
 *   selectVisible(anchors, camPos, frustumTest, cap, out) → sayı     SAF seçim: mesafe [near,far] içinde ve ekranda olan en yakın `cap` panel
 *   createHoloAds(THREE, {uniforms, quality}) → {object3D, setAnchors(list), update(dt, camera), setCap(n), setReducedMotion(b),
 *                                          getVisibleCount(), getAnchors(), dispose()}
 *
 * Yanıp sönme yok: 0,6 Hz'den yavaş yumuşak nabız; reducedMotion'da desen donuk, nabız yok. Toplamsal harmanlama, derinlik testi açık.
 */
import { hash32 } from '../../sim/rng.js';

export const HOLO_MAX_TOTAL = 24;
export const HOLO_MAX_VISIBLE = 8;
export const HOLO_NEAR = 24;
export const HOLO_FAR = 460;
const TWO32 = 4294967296;

function fin(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Belirlenimci panolar: ≥70 blok yüksek kulelerden (yoksa en yüksekler) hash puanıyla en çok `max` tanesi. Pano, kulenin şehir merkezine
 * (0,0) en dik bakan yüzünün önüne (1,6 blok açıklık) ve yüksekliğin ~%58'ine konur. Seed + kutular aynıysa çıktı aynıdır.
 * boxes: normalizeSkylineBox çıktısı ({cx,cz,w,d,h,y0}) listesi.
 */
export function pickHoloAnchors(boxes, seed, max) {
  const cap = clamp(Math.floor(fin(max) ? max : HOLO_MAX_TOTAL), 0, HOLO_MAX_TOTAL);
  const src = Array.isArray(boxes) ? boxes : [];
  const s = (fin(seed) ? seed : 0) | 0;
  const tall = [];
  for (let i = 0; i < src.length; i++) {
    const b = src[i];
    if (!b || !fin(b.cx) || !fin(b.cz) || !fin(b.w) || !fin(b.d) || !fin(b.h)) continue;
    if (b.h >= 70 && Math.min(b.w, b.d) >= 8) tall.push(b);
  }
  const pool = tall.length >= cap ? tall : src.filter((b) => b && fin(b.cx) && fin(b.cz) && fin(b.w) && fin(b.d) && fin(b.h) && b.h >= 24 && Math.min(b.w, b.d) >= 6);
  const scored = pool.map((b) => ({
    b,
    k: hash32(Math.imul(Math.round(b.cx * 2), 0x27d4eb2f) ^ Math.imul(Math.round(b.cz * 2), 0x165667b1) ^ s) / TWO32,
  }));
  scored.sort((p, q) => (q.k !== p.k ? q.k - p.k : p.b.cx !== q.b.cx ? p.b.cx - q.b.cx : p.b.cz - q.b.cz));
  const out = [];
  for (let i = 0; i < scored.length && out.length < cap; i++) {
    const b = scored[i].b;
    // merkeze dik bakan yüz: baskın eksen
    const vx = -b.cx;
    const vz = -b.cz;
    const alongX = Math.abs(vx) >= Math.abs(vz);
    const sign = (alongX ? vx : vz) >= 0 ? 1 : -1;
    const half = (alongX ? b.w : b.d) / 2;
    const width = Math.min(26, (alongX ? b.d : b.w) * 0.8);
    if (width < 6) continue;
    const hh = hash32(Math.round(b.cx * 8) + Math.imul(Math.round(b.cz * 8), 31) + s);
    const x = b.cx + (alongX ? sign * (half + 1.6) : 0);
    const z = b.cz + (alongX ? 0 : sign * (half + 1.6));
    out.push({
      x,
      y: b.y0 + b.h * 0.58,
      z,
      yaw: alongX ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : (sign > 0 ? 0 : Math.PI),
      w: width,
      h: width * 0.56,
      hue: hh % 4,
      pattern: (hh >>> 4) % 5,
      phase: ((hh >>> 8) & 1023) / 1023,
    });
  }
  return out;
}

/**
 * Görünür seçim (saf): anchors[i] = {x,y,z,w,h}; camPos {x,y,z}; frustumTest(x,y,z,r) → boolean (null → hep true).
 * Mesafe [HOLO_NEAR, HOLO_FAR] içinde ve ekranda olanlardan en yakın `cap` tanesinin indeksleri out[0..n-1] (yakından uzağa). n döner.
 */
export function selectVisible(anchors, camPos, frustumTest, cap, out) {
  const c = clamp(Math.floor(fin(cap) ? cap : HOLO_MAX_VISIBLE), 0, HOLO_MAX_VISIBLE);
  const list = Array.isArray(anchors) ? anchors : [];
  if (c === 0) return 0;
  const cand = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a || !fin(a.x) || !fin(a.y) || !fin(a.z)) continue;
    const dx = a.x - camPos.x;
    const dy = a.y - camPos.y;
    const dz = a.z - camPos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(d >= HOLO_NEAR && d <= HOLO_FAR)) continue;
    if (frustumTest && !frustumTest(a.x, a.y, a.z, Math.max(a.w, a.h) * 0.75)) continue;
    cand.push({ i, d });
  }
  cand.sort((p, q) => p.d - q.d || p.i - q.i);
  const n = Math.min(c, cand.length);
  for (let k = 0; k < n; k++) out[k] = cand[k].i;
  return n;
}

export const HOLO_VERTEX = /* glsl */ `
attribute vec4 aPosYaw;
attribute vec4 aSize;
attribute vec4 aState;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
varying vec4 vSize;
varying vec4 vState;
varying float vDist;
void main() {
  float c = cos(aPosYaw.w);
  float s = sin(aPosYaw.w);
  vec3 local = vec3(position.x * aSize.x, position.y * aSize.y, 0.0);
  vec3 wp = aPosYaw.xyz + vec3(local.x * c + local.z * s, local.y, -local.x * s + local.z * c);
  vUv = position.xy + 0.5;
  vSize = aSize;
  vState = aState;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const HOLO_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uMotion;
uniform vec4 uNeon;
varying vec2 vUv;
varying vec4 vSize;
varying vec4 vState;
varying float vDist;

vec3 hHue(float h) {
  int i = int(floor(h + 0.5));
  if (i == 0) return vec3(0.05, 0.85, 1.0);
  if (i == 1) return vec3(1.0, 0.18, 0.6);
  if (i == 2) return vec3(1.0, 0.55, 0.08);
  return vec3(0.55, 1.0, 0.18);
}
float hHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  float t = uTime * uMotion;
  float asp = vSize.x / max(vSize.y, 0.001);
  vec2 q = (uv - 0.5) * vec2(asp, 1.0);
  float pat = vSize.w;
  float ph = vState.x;
  float v = 0.0;
  if (pat < 0.5) {
    // radar halkaları
    float r = length(q);
    float w = fract(r * 2.2 - t * 0.25 - ph);
    v = smoothstep(0.1, 0.0, abs(w - 0.5) - 0.28) * (1.0 - smoothstep(0.0, 0.55 * asp, r)) + smoothstep(0.03, 0.0, abs(r - 0.43)) * 0.7;
  } else if (pat < 1.5) {
    // şerit oku (chevron)
    float k = (q.x * 1.0 + abs(q.y) * 1.6) * 3.0 - t * 0.5 - ph * 6.0;
    v = smoothstep(0.38, 0.5, abs(fract(k) - 0.5)) * smoothstep(0.55, 0.3, abs(q.y)) * smoothstep(0.9 * asp * 0.5, 0.3 * asp * 0.5, abs(q.x));
  } else if (pat < 2.5) {
    // ekolayzır çubukları
    float col = floor(uv.x * 14.0);
    float hh = 0.25 + 0.6 * (0.5 + 0.5 * sin(col * 1.9 + t * 0.9 + ph * 20.0));
    float inCol = step(0.15, fract(uv.x * 14.0)) * step(fract(uv.x * 14.0), 0.85);
    v = step(uv.y, hh) * inCol * step(0.08, uv.y) * (0.5 + 0.5 * step(0.5, fract(uv.y * 10.0)));
  } else if (pat < 3.5) {
    // baklava ızgarası + yavaş vurgu
    vec2 g = vec2(q.x + q.y, q.x - q.y) * 5.0;
    vec2 f = abs(fract(g) - 0.5);
    float line = smoothstep(0.06, 0.0, min(f.x, f.y) - 0.42 + 0.0);
    float hi = smoothstep(0.2, 0.0, abs(fract(uv.x * 0.7 + t * 0.08 + ph) - 0.5) - 0.2);
    v = (line * 0.8 + hi * 0.25) * smoothstep(0.55, 0.45, abs(q.y)) * 1.0;
  } else {
    // oynat simgesi (üçgen) + halka
    float r = length(q);
    float ring = smoothstep(0.035, 0.0, abs(r - 0.4));
    float tri = step(abs(q.y) * 1.7, 0.3 - q.x * 0.9 + 0.12) * step(-0.17, q.x) * step(q.x, 0.2);
    v = ring + tri * 0.9;
  }
  // çerçeve + tarama çizgileri
  vec2 e = abs(uv - 0.5) * 2.0;
  float frame = smoothstep(0.93, 0.985, max(e.x, e.y)) * 0.9;
  float scan = 0.82 + 0.18 * sin(uv.y * vSize.y * 3.1 - t * 1.4);
  float pulse = 0.88 + 0.12 * sin(t * 1.9 + ph * 12.0);
  vec3 hue = hHue(vSize.z);
  float inside = step(max(e.x, e.y), 1.0);
  float body = (0.09 + v * 0.95) * inside;
  vec3 col = hue * (body * scan + frame) * pulse;
  float night = 0.55 + 0.45 * uNeon.x;
  float a = vState.y * (1.0 - smoothstep(280.0, 460.0, vDist)) * night;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a * 2.6, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * @param {object} THREE three modülü
 * @param {{uniforms?:object, cap?:number, reducedMotion?:boolean}} [opts] uniforms: materials.uniforms (uTime/uMotion/uNeon paylaşılır)
 */
export function createHoloAds(THREE, opts) {
  const o = opts || {};
  const shared = o.uniforms || {};
  let cap = clamp(Math.floor(fin(o.cap) ? o.cap : HOLO_MAX_VISIBLE), 0, HOLO_MAX_VISIBLE);
  let reduced = !!o.reducedMotion;
  let anchors = [];
  let disposed = false;
  let acc = 1;

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const posYaw = new THREE.InstancedBufferAttribute(new Float32Array(HOLO_MAX_VISIBLE * 4), 4);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(HOLO_MAX_VISIBLE * 4), 4);
  const state = new THREE.InstancedBufferAttribute(new Float32Array(HOLO_MAX_VISIBLE * 4), 4);
  geo.setAttribute('aPosYaw', posYaw);
  geo.setAttribute('aSize', size);
  geo.setAttribute('aState', state);
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const uniforms = {
    uTime: shared.uTime || { value: 0 },
    uMotion: { value: reduced ? 0 : 1 },
    uNeon: shared.uNeon || { value: new THREE.Vector4(0, 0.45, 0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HOLO_VERTEX,
    fragmentShader: HOLO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.name = 'kesif-holo-reklam';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'kesif-holo-reklamlar';
  mesh.frustumCulled = false;
  mesh.renderOrder = 60;
  mesh.visible = false;

  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const camPos = { x: 0, y: 0, z: 0 };
  const sel = new Array(HOLO_MAX_VISIBLE);
  const alpha = new Float32Array(HOLO_MAX_TOTAL);
  const test = (x, y, z, r) => {
    sphere.center.set(x, y, z);
    sphere.radius = r;
    return frustum.intersectsSphere(sphere);
  };
  let count = 0;

  function refresh(camera) {
    camPos.x = camera.matrixWorld.elements[12];
    camPos.y = camera.matrixWorld.elements[13];
    camPos.z = camera.matrixWorld.elements[14];
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    count = selectVisible(anchors, camPos, test, cap, sel);
    for (let k = 0; k < count; k++) {
      const a = anchors[sel[k]];
      posYaw.array[k * 4] = a.x;
      posYaw.array[k * 4 + 1] = a.y;
      posYaw.array[k * 4 + 2] = a.z;
      posYaw.array[k * 4 + 3] = a.yaw;
      size.array[k * 4] = a.w;
      size.array[k * 4 + 1] = a.h;
      size.array[k * 4 + 2] = a.hue;
      size.array[k * 4 + 3] = a.pattern;
      state.array[k * 4] = a.phase;
      state.array[k * 4 + 1] = alpha[sel[k]];
    }
    posYaw.needsUpdate = true;
    size.needsUpdate = true;
    state.needsUpdate = true;
    geo.instanceCount = count;
    mesh.visible = count > 0;
  }

  return {
    object3D: mesh,

    /** pickHoloAnchors çıktısı (≤24). */
    setAnchors(list) {
      if (disposed) return 0;
      anchors = Array.isArray(list) ? list.slice(0, HOLO_MAX_TOTAL) : [];
      alpha.fill(0);
      acc = 1;
      return anchors.length;
    },

    /** Kare başı (≈4 Hz seçim; solma her karede). */
    update(dt, camera) {
      if (disposed || !camera) return;
      const step = dt > 0 ? Math.min(dt, 0.25) : 0;
      acc += step;
      for (let i = 0; i < anchors.length; i++) alpha[i] = Math.min(1, alpha[i] + step * 1.5);
      if (acc >= 0.25) {
        acc = 0;
        refresh(camera);
      } else if (count > 0) {
        for (let k = 0; k < count; k++) state.array[k * 4 + 1] = alpha[sel[k]];
        state.needsUpdate = true;
      }
    },

    /** Aynı anda görünür panel tavanı (≤8). */
    setCap(n) {
      cap = clamp(Math.floor(fin(n) ? n : HOLO_MAX_VISIBLE), 0, HOLO_MAX_VISIBLE);
      acc = 1;
    },

    setReducedMotion(b) {
      reduced = !!b;
      uniforms.uMotion.value = reduced ? 0 : 1;
    },

    getVisibleCount() {
      return mesh.visible ? geo.instanceCount : 0;
    },
    getAnchors() {
      return anchors;
    },
    get drawCalls() {
      return mesh.visible && geo.instanceCount > 0 ? 1 : 0;
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
