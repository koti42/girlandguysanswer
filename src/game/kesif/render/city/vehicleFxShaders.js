/*
 * KEŞİF render/city — ARAÇ IŞIK EFEKTİ GÖLGELENDİRİCİLERİ (toplamsal; PointLight YOK). Üç çizim çağrısı:
 *   SPRITE (tek InstancedMesh, mod = aFx.x):  0 zemin ışık havuzu · 1 kameraya dönük parıltı (far/stop) · 2 zemin ışığı (underglow, desen) ·
 *                                              3 ıslak yol far yansıma çizgisi · 4 eksen billboard alev (nitro)
 *   CONE   (far konisi): tepe noktası lamba, tabanı ileride; kenarları yumuşak, derinlik testi açık (binalar keser)
 *   SMOKE  (alfa karışımlı): sürüklenme / toz dumanı, kameraya dönük yumuşak disk
 * Örnek öznitelikleri: instanceMatrix (konum + yaw + ölçek), instanceColor (rgb × kazanç), aFx (mod, yoğunluk, p1, p2).
 * Animasyonlar ≤1.2 Hz nefes / dalga; uMotion = 0 iken sabit (reducedMotion).
 */

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uSkyLight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uWet;
uniform vec4 uNeon;
varying vec3 vCol;
varying vec4 vFx;
varying vec2 vUv;
varying float vDist;
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
`;

export const SPRITE_VERTEX = /* glsl */ `
attribute vec4 aFx;
varying vec3 vCol;
varying vec4 vFx;
varying vec2 vUv;
varying float vDist;
void main() {
  mat4 M = modelMatrix * instanceMatrix;
  vec3 center = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 xAxis = (M * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
  vec3 zAxis = (M * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
  float mode = aFx.x;
  vec3 wp;
  if (mode < 0.5 || (mode > 1.5 && mode < 2.5)) {
    wp = center + xAxis * position.x + zAxis * position.y;
  } else if (mode < 1.5) {
    vec3 toCam = normalize(cameraPosition - center);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1.0e-5, 0.0, 0.0));
    vec3 up = cross(toCam, right);
    float s = length(xAxis);
    wp = center + (right * position.x + up * position.y) * s;
  } else if (mode < 3.5) {
    vec3 d = center - cameraPosition;
    d.y = 0.0;
    d = normalize(d + vec3(1.0e-4, 0.0, 0.0));
    vec3 side = vec3(-d.z, 0.0, d.x);
    wp = center + side * position.x * length(xAxis) + d * position.y * length(zAxis);
  } else {
    vec3 axis = normalize(zAxis + vec3(0.0, 1.0e-5, 0.0));
    vec3 view = normalize(cameraPosition - center);
    vec3 side = normalize(cross(axis, view) + vec3(1.0e-5, 0.0, 0.0));
    wp = center + side * position.x * length(xAxis) + axis * position.y * length(zAxis);
  }
  vUv = position.xy + 0.5;
  vCol = instanceColor;
  vFx = aFx;
  vDist = length(wp - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const SPRITE_FRAGMENT = /* glsl */ `
${COMMON}
void main() {
  float fadeK = smoothstep(uFadeStart, uFadeEnd, vDist);
  float fogK = 1.0 - smoothstep(uFogNear, uFogFar, vDist);
  float mode = vFx.x;
  float a = vFx.y;
  vec2 p = vUv * 2.0 - 1.0;
  float k = 0.0;
  if (mode < 0.5) {
    // zemin ışık havuzu: yakın uçta güçlü, uzakta söner; yanlara yumuşak
    float t = vUv.y;
    float w = 1.0 - clamp(abs(p.x), 0.0, 1.0);
    k = pow(max(1.0 - t, 0.0), 1.25) * w * w * (0.35 + 0.65 * smoothstep(0.0, 0.12, t));
    k *= smoothstep(0.0, 0.05, t);
  } else if (mode < 1.5) {
    float r = length(p);
    k = exp(-r * r * 5.5) + 0.35 * exp(-r * 2.2) * (1.0 - smoothstep(0.7, 1.0, r));
    k *= 1.0 - smoothstep(0.85, 1.0, r);
  } else if (mode < 2.5) {
    // underglow: yuvarlak dikdörtgen parıltı + desen (desen 3 = yumuşak elips: süzülen araçların zemin ışığı)
    float pat = vFx.z;
    float pb = pat > 2.5 ? pat - 3.0 : pat;
    if (pat > 2.5) {
      float r = length(p * vec2(1.0, 0.8));
      k = exp(-r * r * 3.2) * (1.0 - smoothstep(0.75, 1.0, r));
    } else {
      vec2 q = abs(p) - vec2(0.42, 0.5);
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      k = exp(-max(d, 0.0) * 6.0) * (1.0 - smoothstep(0.6, 1.0, max(abs(p.x), abs(p.y))));
    }
    float breathe = 1.0;
    if (uMotion > 0.0) {
      if (pb > 0.5 && pb < 1.5) breathe = 0.72 + 0.28 * sin(uTime * 2.2);
      else if (pb > 1.5 && pb < 2.5) breathe = 0.6 + 0.4 * (0.5 + 0.5 * sin(p.y * 5.0 - uTime * 3.4));
    }
    k *= breathe;
  } else if (mode < 3.5) {
    float t = vUv.y;
    float w = exp(-p.x * p.x * 9.0);
    k = pow(max(1.0 - t, 0.0), 1.6) * w * smoothstep(0.0, 0.06, t);
    k *= uWet;
  } else {
    float t = vUv.y;
    float w = (1.0 - abs(p.x));
    float fl = uMotion > 0.0 ? 0.9 + 0.1 * sin(uTime * 15.0 + vFx.w * 9.0) : 1.0;
    k = pow(max(w, 0.0), 1.5) * pow(max(1.0 - t, 0.0), 0.8) * fl;
  }
  vec3 c = vCol;
  if (mode > 3.5) c = mix(vec3(1.0, 1.0, 1.0), vCol, smoothstep(0.0, 0.6, vUv.y));
  vec3 col = c * k * a * fogK * (1.0 - fadeK);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const CONE_VERTEX = /* glsl */ `
attribute float aT;
attribute vec4 aFx;
varying vec3 vCol;
varying vec4 vFx;
varying vec2 vUv;
varying float vDist;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 wp4 = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vN = n;
  vV = normalize(cameraPosition - wp4.xyz);
  vCol = instanceColor;
  vFx = aFx;
  vUv = vec2(aT, 0.0);
  vDist = length(wp4.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

export const CONE_FRAGMENT = /* glsl */ `
${COMMON}
varying vec3 vN;
varying vec3 vV;
void main() {
  float fadeK = smoothstep(uFadeStart, uFadeEnd, vDist);
  float fogK = 1.0 - smoothstep(uFogNear, uFogFar, vDist);
  float t = vUv.x;
  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
  float k = pow(max(1.0 - t, 0.0), 2.1) * edge * (0.25 + 0.75 * smoothstep(0.0, 0.08, t));
  vec3 col = vCol * k * vFx.y * fogK * (1.0 - fadeK);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SMOKE_VERTEX = /* glsl */ `
attribute vec4 aFx;
varying vec3 vCol;
varying vec4 vFx;
varying vec2 vUv;
varying float vDist;
void main() {
  mat4 M = modelMatrix * instanceMatrix;
  vec3 center = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 xAxis = (M * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
  vec3 zAxis = (M * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
  vec3 wp;
  if (aFx.x > 0.5) {
    // zemin gölgesi: yatay yassı elips (x = genişlik, z = uzunluk)
    wp = center + xAxis * position.x + zAxis * position.y;
  } else {
    float s = length(xAxis);
    vec3 toCam = normalize(cameraPosition - center);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1.0e-5, 0.0, 0.0));
    vec3 up = cross(toCam, right);
    wp = center + (right * position.x + up * position.y) * s;
  }
  vUv = position.xy * 2.0;
  vCol = instanceColor;
  vFx = aFx;
  vDist = length(wp - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const SMOKE_FRAGMENT = /* glsl */ `
${COMMON}
void main() {
  float fadeK = smoothstep(uFadeStart, uFadeEnd, vDist);
  float fogK = 1.0 - smoothstep(uFogNear, uFogFar, vDist);
  float r = length(vUv);
  float soft = vFx.x > 0.5 ? 1.0 - smoothstep(0.3, 1.0, r) : 1.0 - smoothstep(0.35, 1.0, r);
  float a = soft * vFx.y * (1.0 - fadeK);
  if (a < 0.003) discard;
  vec3 col = mix(vCol, uFogColor, vFx.x > 0.5 ? 0.0 : 1.0 - fogK);
  if (vFx.x > 0.5) a *= fogK;
  gl_FragColor = vec4(col, a);
}
`;
