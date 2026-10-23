/*
 * KEŞİF render/props — prop gölgelendiricileri (GLSL ES 3.00, three r186 ShaderMaterial önekiyle; InstancedMesh).
 *
 * Aydınlatma chunk gölgelendiricisiyle AYNI paylaşılan uniform'lardan gelir (gün/gece, sis, ışık renkleri), böylece props zemine uyar:
 *   renk = albedo × [(ortam×(0.35+0.65·hemi) + güneş·ndl)·gökyüzü·uSkyLight + blokışığı·örnek + uMinLight]  (+ yayma)
 * Örnek öznitelikleri (InstancedBufferAttribute): aInst (x durum, y faz, z sapma, w kip), aSign (atlas dikdörtgeni), aLight (gökyüzü, blok 0..1);
 * instanceColor = neon tonu (tabela için dükkân tonu). Köşe: aColor, aMat (propGeo üst yorumu).
 * Tabela kipleri (aInst.w): 0 sabit · 1 nefes (4 sn) · 2 nadir titreşim (≤2 Hz örnekleme) · 3 kayan parıltı · 4 harf harf. reducedMotion (uMotion=0): hep sabit.
 * Hiçbir kip 3 Hz'den hızlı değişmez.
 */

export const PROP_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aMat;
attribute vec4 aInst;
attribute vec4 aSign;
attribute vec2 aLight;

varying vec2 vUv;
varying vec3 vColor;
varying vec4 vMat;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vTint;
varying vec4 vInst;
varying vec4 vSign;
varying vec2 vLight;
varying float vDist;

void main() {
  vec4 wp4 = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp4.xyz;
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vUv = uv;
  vColor = aColor;
  vMat = aMat;
  vTint = instanceColor;
  vInst = aInst;
  vSign = aSign;
  vLight = aLight;
  vDist = length(wp4.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

const COMMON_FRAGMENT = /* glsl */ `
uniform sampler2D uSignMap;
uniform float uFaceAspect;
uniform float uEmissive;
uniform float uWet;

uniform float uTime;
uniform float uMotion;
uniform float uSkyLight;
uniform vec3 uAmbientColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uBlockLightColor;
uniform float uMinLight;
uniform float uEmission;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
uniform float uUnderwater;

varying vec2 vUv;
varying vec3 vColor;
varying vec4 vMat;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vTint;
varying vec4 vInst;
varying vec4 vSign;
varying vec2 vLight;
varying float vDist;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float kCurveSky(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * (0.3 + 0.7 * x);
}
float kCurveBlock(float x) {
  x = clamp(x, 0.0, 1.0);
  return pow(x, 1.55) * 0.97 + x * 0.03;
}
vec3 kSafeColor(vec3 c) {
  bool ok = c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1.0e5 && c.g < 1.0e5 && c.b < 1.0e5;
  return ok ? min(c, vec3(32.0)) : vec3(0.0);
}

// Tabela/neon parlaklık çarpanı (kip). 3 Hz'i aşmaz.
float kModeAnim(float mode, float phase, float t) {
  if (uMotion <= 0.0 || mode < 0.5) return 1.0;
  if (mode < 1.5) return 0.78 + 0.22 * sin(t * 1.5708 + phase * 6.2832);
  if (mode < 2.5) {
    float k = floor(t * 4.0 + phase * 13.0);
    return hash11(k + phase * 37.0) > 0.93 ? 0.5 : 1.0;
  }
  return 1.0;
}

// Atlas yazısı (R kanalı): hücre en-boy oranı korunarak yüze sığdırılır.
float kSignText(vec2 fuv, vec4 r, out vec2 loc) {
  float cellA = (r.z - r.x) / max(r.w - r.y, 1.0e-5);
  float wF = 0.94;
  float hF = wF * uFaceAspect / cellA;
  if (hF > 0.86) {
    hF = 0.86;
    wF = hF * cellA / uFaceAspect;
  }
  loc = (fuv - 0.5) / vec2(wF, hF) + 0.5;
  float inside = step(0.0, loc.x) * step(loc.x, 1.0) * step(0.0, loc.y) * step(loc.y, 1.0);
  vec2 auv = vec2(mix(r.x, r.z, clamp(loc.x, 0.0, 1.0)), mix(r.y, r.w, clamp(loc.y, 0.0, 1.0)));
  return texture2D(uSignMap, auv).r * inside;
}

float kSignAnim(float mode, float phase, float t, vec2 loc) {
  if (uMotion <= 0.0) return 1.0;
  if (mode < 2.5) return kModeAnim(mode, phase, t);
  if (mode < 3.5) {
    return 0.82 + 0.45 * smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(loc.x * 3.2 - t * 0.9 + phase * 6.2832));
  }
  float cyc = fract(t * 0.18 + phase);
  return 1.0 - step(cyc * 1.25 + 0.001, loc.x) * 0.92;
}

// Neon ekran: koyu zemin, başlık çubuğu, kayan satır çubukları, parlak çerçeve (reducedMotion: kaymaz).
float kScreen(vec2 uv, float phase, float t) {
  float sc = uMotion > 0.0 ? t * 0.06 : 0.0;
  float row = uv.y * 8.0 + sc;
  float r = floor(row);
  float fr = fract(row);
  float len = 0.28 + 0.62 * hash11(r * 7.31 + phase * 41.0);
  float bar = step(0.08, uv.x) * step(uv.x, 0.08 + len * 0.84) * step(0.22, fr) * step(fr, 0.74);
  float title = step(0.87, uv.y) * step(0.06, uv.x) * step(uv.x, 0.94) * step(uv.y, 0.95);
  vec2 e = min(uv, 1.0 - uv);
  float frame = 1.0 - step(0.045, min(e.x, e.y));
  return clamp(0.10 + bar * 0.75 + title * 0.9 + frame * 0.8, 0.0, 1.4);
}

vec3 kFog(vec3 col, float dist, vec3 V) {
  float fogF = smoothstep(uFogNear, uFogFar, dist);
  vec3 fogCol = uFogColor;
  if (uUnderwater < 0.5) {
    float fe = -V.y;
    vec3 fup = mix(uHorizonColor, uSkyColor, pow(clamp(fe, 0.0, 1.0), 0.52));
    fogCol = mix(uFogColor, fup, smoothstep(0.0, 0.34, fe));
  }
  return mix(col, fogCol, fogF);
}
`;

export const PROP_FRAGMENT = /* glsl */ `
${COMMON_FRAGMENT}

void main() {
  float fadeK = smoothstep(uFadeStart, uFadeEnd, vDist);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  int kind = int(vMat.y + 0.5);
  float t = uTime;
  float phase = vInst.y;
  float state = vInst.x;
  float gain = mix(vMat.w, 1.0, clamp(state, 0.0, 1.0));

  float skyAmt = kCurveSky(vLight.x) * uSkyLight;
  float blk = kCurveBlock(vLight.y);
  float ndl = max(dot(N, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 lighting = (uAmbientColor * (0.35 + 0.65 * hemi) + uSunColor * ndl) * skyAmt
                + uBlockLightColor * blk * (0.82 + 0.18 * N.y) + vec3(uMinLight);
  float nightBoost = 1.0 + (1.0 - uSkyLight) * 0.6;
  float jitter = 0.92 + 0.16 * vInst.z;

  vec3 albedo = vColor * jitter;
  vec3 col = albedo * lighting;

  if (kind == 1) {
    float pulse = vMat.z > 8.5 ? 1.0 + clamp(state, 0.0, 1.0) * 0.9 * (0.5 + 0.5 * sin(t * 9.0 + phase * 6.2832) * uMotion) : kModeAnim(vInst.w, phase, t);
    vec3 tint = vTint;
    float screen = (vMat.z > 4.5 && vMat.z < 5.5) ? kScreen(vUv, phase, t) : 1.0;
    col = albedo * lighting * 0.35 + tint * (vMat.x * gain * pulse * screen * uEmission * nightBoost * uEmissive);
  } else if (kind == 2) {
    vec2 loc;
    float txt = kSignText(vUv, vSign, loc);
    float anim = kSignAnim(vInst.w, phase, t, loc);
    vec3 panel = vec3(0.012, 0.016, 0.03) * (lighting + 0.15);
    col = panel + vTint * (txt * anim * (1.5 + 0.7 * (nightBoost - 1.0) / 0.6) * uEmission * uEmissive);
  } else if (kind == 3) {
    float pulse = vMat.z > 8.5 ? 1.0 + clamp(state, 0.0, 1.0) * 0.9 * (0.5 + 0.5 * sin(t * 9.0 + phase * 6.2832) * uMotion) : 1.0;
    col = albedo * lighting * 0.2 + albedo * (vMat.x * gain * pulse * uEmission * nightBoost * max(uEmissive, 0.6));
  } else if (kind == 4) {
    float s = floor(state + 0.5);
    float litId = s < 0.5 ? 1.0 : (s < 1.5 ? 3.0 : 2.0);
    float on = abs(vMat.z - litId) < 0.5 ? 1.0 : 0.0;
    col = albedo * lighting * 0.2 + albedo * (on * 3.2 * uEmission * nightBoost);
  }

  if (kind == 0) {
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    // yağmurda ıslak parıltı: gökyüzü Fresnel'i (uWet citylook'tan gelirse; yoksa 0)
    col += uHorizonColor * fres * uWet * 0.35 * skyAmt;
    // gece neon kenar ışığı: gövde silueti örnek neon tonuyla okunur
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
    col += vTint * rim * (1.0 - uSkyLight) * 0.2 * uEmissive;
  }

  if (uUnderwater > 0.5) col *= vec3(0.55, 0.82, 1.0);
  col = kFog(col, vDist, V);
  col = kSafeColor(col);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** HOLO_MODE 0: billboard reklamı (atlas yazısı, tarama çizgileri) · 1: boyut kapısı (dönen halkalar). Toplamsal harmanlama. */
export const HOLO_FRAGMENT = /* glsl */ `
${COMMON_FRAGMENT}

void main() {
  float fadeK = smoothstep(uFadeStart, uFadeEnd, vDist);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
  vec3 V = normalize(cameraPosition - vWorld);
  float t = uTime;
  float phase = vInst.y;
  float night = 1.0 - uSkyLight;
  float vis = 0.5 + 0.5 * night;
  vec3 col;
  float alpha = 1.0;
#if HOLO_MODE == 0
  vec2 loc;
  float txt = kSignText(vUv, vSign, loc);
  float anim = kSignAnim(vInst.w, phase, t, loc);
  float scan = 0.84 + 0.16 * sin(vWorld.y * 26.0 - t * 2.2 * uMotion);
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = smoothstep(0.0, 0.06, min(e.x * 0.5, e.y));
  float grid = 0.5 + 0.5 * sin(vUv.x * 120.0) * sin(vUv.y * 60.0);
  col = vTint * ((txt * 1.9 * anim + 0.10 + grid * 0.025) * scan * edge) * uEmission * vis * uEmissive;
#else
  vec2 p = vUv * 2.0 - 1.0;
  float edge = max(abs(p.x), abs(p.y));
  float fill = smoothstep(1.0, 0.78, edge);
  vec2 c = vec2(p.x, p.y * 1.6 - 0.1);
  float r = length(c);
  float ang = atan(c.y, c.x);
  float spin = uMotion > 0.0 ? t : 0.0;
  float rings = 0.5 + 0.5 * sin(r * 9.0 - spin * 1.6 + sin(ang * 3.0 + spin * 0.8) * 1.1);
  float core = pow(max(0.0, 1.0 - r * 0.8), 2.5);
  col = vTint * (0.18 + rings * 0.7) * fill * uEmission * uEmissive;
  col += vec3(0.85, 0.95, 1.0) * core * 0.55 * fill;
#endif
  float fogF = smoothstep(uFogNear, uFogFar, vDist);
  col *= 1.0 - fogF;
  col = kSafeColor(col);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
