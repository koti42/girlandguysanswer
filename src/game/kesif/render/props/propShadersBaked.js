/*
 * KEŞİF render/props — PİŞİRİLMİŞ iç mekân prop gölgelendiricileri (GLSL ES 3.00, three ShaderMaterial önekiyle; sözleşme propBake.js).
 *
 * Aydınlatma street prop gölgelendiricisiyle AYNI paylaşılan uniform'lardan gelir (gün/gece, sis, ışık renkleri). Köşe öznitelikleri:
 *   aCol  rgb sRGB (normalize) + AO · aMat ham bayt [yayma·255, tür, grup, w] · aInst ham bayt [durum, faz, sapma, kip] · aSign atlas dikdörtgeni
 *   aLight [gökyüzü, blok] · aTint neon tonu (sRGB) · aAnim kayan parça yönü/2 (xyz) + açıklık (w)
 * Tür: 0 gövde · 1 neon · 2 marka tabelası (uSignMap) · 3 yayıcı · 5 ekran (desenli) · 6 nabız · 7 holo (HOLO tanımı) · 8 pano yazısı (uBoardMap)
 * Grup: 0 · 32+m GÜÇ (durum bit m'de açık) · 96+m GÖRÜNÜR (yalnız m'deki durumlarda) · 160+m KAYAR (görünür + aAnim·açıklık).
 * Hiçbir kip 3 Hz'den hızlı değişmez; uMotion=0 (reducedMotion) hepsini donuk yapar.
 */
export const BAKED_VERTEX = /* glsl */ `
attribute vec4 aCol;
attribute vec4 aMat;
attribute vec4 aInst;
attribute vec4 aSign;
attribute vec4 aLight;
attribute vec4 aTint;
attribute vec4 aAnim;

varying vec2 vUv;
varying vec4 vColor;
varying vec4 vMat;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vTint;
varying vec4 vInst;
varying vec4 vSign;
varying vec2 vLight;
varying float vDist;
varying float vPw;

void main() {
  float g = aMat.z;
  int st = int(min(aInst.x + 0.5, 7.0));
  float vis = 1.0;
  float pw = 1.0;
  vec3 p = position;
  if (g >= 160.0) {
    vis = float(((int(g + 0.5) - 160) >> st) & 1);
    p += aAnim.xyz * 2.0 * aAnim.w;
  } else if (g >= 96.0) {
    vis = float(((int(g + 0.5) - 96) >> st) & 1);
  } else if (g >= 32.0) {
    pw = float(((int(g + 0.5) - 32) >> st) & 1);
  }
  vec4 wp4 = modelMatrix * vec4(p, 1.0);
  vWorld = wp4.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vColor = vec4(pow(aCol.rgb, vec3(2.2)), aCol.a);
  vMat = vec4(aMat.x / 255.0, aMat.y, g, aMat.w / 255.0);
  vTint = pow(aTint.rgb, vec3(2.2));
  vInst = aInst;
  vSign = aSign;
  vLight = aLight.xy;
  vPw = pw;
  vDist = length(wp4.xyz - cameraPosition);
  gl_Position = vis > 0.5 ? projectionMatrix * viewMatrix * wp4 : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const COMMON = /* glsl */ `
uniform sampler2D uSignMap;
uniform sampler2D uBoardMap;
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
varying vec4 vColor;
varying vec4 vMat;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vTint;
varying vec4 vInst;
varying vec4 vSign;
varying vec2 vLight;
varying float vDist;
varying float vPw;

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

float kModeAnim(float mode, float phase, float t) {
  if (uMotion <= 0.0 || mode < 0.5) return 1.0;
  if (mode < 1.5) return 0.78 + 0.22 * sin(t * 1.5708 + phase * 6.2832);
  if (mode < 2.5) {
    float k = floor(t * 4.0 + phase * 13.0);
    return hash11(k + phase * 37.0) > 0.93 ? 0.5 : 1.0;
  }
  return 1.0;
}

// Atlas yazısı: hücre en-boy oranı korunarak yüze sığdırılır (aspect = yüz genişlik/yükseklik).
float kText(sampler2D map, vec2 fuv, vec4 r, float aspect, out vec2 loc) {
  float cellA = (r.z - r.x) / max(r.w - r.y, 1.0e-5);
  float wF = 0.94;
  float hF = wF * aspect / cellA;
  if (hF > 0.86) {
    hF = 0.86;
    wF = hF * cellA / aspect;
  }
  loc = (fuv - 0.5) / vec2(wF, hF) + 0.5;
  float inside = step(0.0, loc.x) * step(loc.x, 1.0) * step(0.0, loc.y) * step(loc.y, 1.0);
  vec2 auv = vec2(mix(r.x, r.z, clamp(loc.x, 0.0, 1.0)), mix(r.y, r.w, clamp(loc.y, 0.0, 1.0)));
  return texture2D(map, auv).r * inside;
}

float kSignAnim(float mode, float phase, float t, vec2 loc) {
  if (uMotion <= 0.0) return 1.0;
  if (mode < 2.5) return kModeAnim(mode, phase, t);
  if (mode < 3.5) return 0.82 + 0.45 * smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(loc.x * 3.2 - t * 0.9 + phase * 6.2832));
  float cyc = fract(t * 0.18 + phase);
  return 1.0 - step(cyc * 1.25 + 0.001, loc.x) * 0.92;
}

// Ekran: 3 desen (veri paneli · dalga formu · manzara); kanal = durum + faz.
float kScreen(vec2 uv, float phase, float t, float chan) {
  float sc = uMotion > 0.0 ? t : 0.0;
  float pat = mod(floor(phase * 3.0 + chan), 3.0);
  vec2 e = min(uv, 1.0 - uv);
  float frame = 1.0 - step(0.04, min(e.x, e.y));
  float v = 0.08;
  if (pat < 0.5) {
    float row = uv.y * 8.0 + sc * 0.06;
    float r = floor(row);
    float fr = fract(row);
    float len = 0.28 + 0.62 * hash11(r * 7.31 + phase * 41.0);
    float bar = step(0.52, uv.x) * step(uv.x, 0.52 + len * 0.4) * step(0.22, fr) * step(fr, 0.74);
    float col = floor(uv.x * 7.0);
    float hh = 0.15 + 0.7 * hash11(col * 3.7 + phase * 19.0 + floor(sc * 0.4));
    float bars = step(uv.x, 0.46) * step(0.12, uv.x) * step(uv.y, 0.12 + hh * 0.7) * step(0.12, uv.y) * step(0.12, fract(uv.x * 7.0)) * step(fract(uv.x * 7.0), 0.88);
    float title = step(0.87, uv.y) * step(0.06, uv.x) * step(uv.x, 0.94) * step(uv.y, 0.95);
    v += bar * 0.75 + bars * 0.85 + title * 0.9;
  } else if (pat < 1.5) {
    float w1 = 0.5 + 0.28 * sin(uv.x * 13.0 + sc * 1.1 + phase * 6.0);
    float w2 = 0.5 + 0.2 * sin(uv.x * 8.0 - sc * 0.8 + phase * 3.0);
    float l1 = 1.0 - smoothstep(0.0, 0.035, abs(uv.y - w1));
    float l2 = 1.0 - smoothstep(0.0, 0.03, abs(uv.y - w2));
    float grid = (1.0 - step(0.03, abs(fract(uv.x * 8.0) - 0.5) - 0.47)) * 0.18 + (1.0 - step(0.03, abs(fract(uv.y * 5.0) - 0.5) - 0.47)) * 0.18;
    v += l1 * 0.95 + l2 * 0.6 + grid;
  } else {
    float sun = 1.0 - smoothstep(0.1, 0.13, length((uv - vec2(0.66, 0.62)) * vec2(1.6, 1.0)));
    float hill = step(uv.y, 0.32 + 0.1 * sin(uv.x * 7.0 + phase * 6.0));
    float sky = 0.25 + 0.35 * uv.y;
    float stripe = step(0.5, fract(uv.y * 14.0 - sc * 0.05)) * 0.1;
    v += mix(sky + stripe, 0.18, hill) + sun * 0.9;
  }
  v += frame * 0.8;
  float scan = 0.92 + 0.08 * sin(uv.y * 160.0);
  return clamp(v * scan, 0.0, 1.5);
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

export const BAKED_FRAGMENT = /* glsl */ `
${COMMON}

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
  float phase = vInst.y / 255.0;
  float state = vInst.x;
  float dev = vInst.z / 255.0;
  float mode = vInst.w;

  float skyAmt = kCurveSky(vLight.x) * uSkyLight;
  float blk = kCurveBlock(vLight.y);
  float ndl = max(dot(N, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 lighting = (uAmbientColor * (0.35 + 0.65 * hemi) + uSunColor * ndl) * skyAmt
                + uBlockLightColor * blk * (0.82 + 0.18 * N.y) + vec3(uMinLight);
  float nightBoost = 1.0 + (1.0 - uSkyLight) * 0.6;
  float em = max(uEmission, 0.6);
  float gain = vPw > 0.5 ? 1.0 : vMat.w;

  vec3 albedo = vColor.rgb * (0.94 + 0.12 * dev);
  vec3 col = albedo * lighting * vColor.a;

  if (kind == 1) {
    float pulse = kModeAnim(mode, phase, t);
    col = albedo * lighting * 0.35 * vColor.a + vTint * (vMat.x * gain * pulse * em * nightBoost);
  } else if (kind == 3) {
    col = albedo * lighting * 0.2 * vColor.a + albedo * (vMat.x * gain * em * nightBoost);
  } else if (kind == 6) {
    float pul = uMotion > 0.0 ? 0.65 + 0.35 * sin(t * 4.2 + phase * 6.2832 + dev * 3.0) : 1.0;
    col = albedo * lighting * 0.25 * vColor.a + albedo * (vMat.x * pul * em * nightBoost);
  } else if (kind == 5) {
    if (vPw > 0.5) {
      float s = kScreen(vUv, phase, t, state);
      col = albedo * lighting * 0.12 + albedo * (s * vMat.x * em * nightBoost * 0.9);
    } else {
      col = vec3(0.012, 0.016, 0.022) + lighting * 0.05 + vec3(0.02, 0.03, 0.04) * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    }
  } else if (kind == 2) {
    vec2 loc;
    float aspect = max(vMat.w * 8.0, 0.5);
    float txt = kText(uSignMap, vUv, vSign, aspect, loc);
    float anim = kSignAnim(mode, phase, t, loc);
    vec3 panel = vec3(0.012, 0.016, 0.03) * (lighting + 0.15);
    col = panel + vTint * (txt * anim * (1.5 + 0.7 * (nightBoost - 1.0) / 0.6) * em);
  } else if (kind == 8) {
    vec2 loc;
    float aspect = max(vMat.w * 8.0, 0.5);
    float txt = kText(uBoardMap, vUv, vSign, aspect, loc);
    vec3 panel = vec3(0.025, 0.03, 0.04) * (lighting + 0.35);
    col = panel + mix(vTint, vec3(0.95, 0.96, 1.0), 0.35) * (txt * (0.95 + 0.4 * (nightBoost - 1.0)) * em);
  } else {
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    col += uHorizonColor * fres * uWet * 0.35 * skyAmt;
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
    col += vTint * rim * (1.0 - uSkyLight * 0.7) * 0.07 * vColor.a;
  }

  if (uUnderwater > 0.5) col *= vec3(0.55, 0.82, 1.0);
  col = kFog(col, vDist, V);
  col = kSafeColor(col);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Holo geometri (tür 7): toplamsal harmanlama; arayüz çubukları + ızgara + tarama çizgisi; güç kapalıysa çizilmez. */
export const BAKED_HOLO_FRAGMENT = /* glsl */ `
${COMMON}

void main() {
  float fadeK = smoothstep(uFadeStart, uFadeEnd, vDist);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
  if (vPw < 0.5) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  float t = uMotion > 0.0 ? uTime : 0.0;
  float phase = vInst.y / 255.0;
  float chan = vInst.x;
  vec2 uv = vUv;
  vec2 e = min(uv, 1.0 - uv);
  float edge = smoothstep(0.0, 0.05, min(e.x, e.y));
  float rim = 1.0 - smoothstep(0.0, 0.025, min(e.x, e.y));
  float pat = mod(floor(phase * 3.0 + chan), 3.0);
  float v = 0.12;
  if (pat < 0.5) {
    float row = uv.y * 9.0 + t * 0.05;
    float r = floor(row);
    float len = 0.2 + 0.7 * hash11(r * 5.7 + phase * 31.0);
    v += step(0.08, uv.x) * step(uv.x, 0.08 + len * 0.8) * step(0.25, fract(row)) * step(fract(row), 0.7) * 0.7;
    v += step(0.88, uv.y) * 0.6;
  } else if (pat < 1.5) {
    float cx = uv.x - 0.5;
    float ring = 1.0 - smoothstep(0.0, 0.03, abs(length(vec2(cx * 1.6, uv.y - 0.5)) - 0.28 - 0.04 * sin(t * 0.8)));
    float ring2 = 1.0 - smoothstep(0.0, 0.025, abs(length(vec2(cx * 1.6, uv.y - 0.5)) - 0.16));
    v += ring * 0.9 + ring2 * 0.6;
  } else {
    float wv = 0.5 + 0.25 * sin(uv.x * 11.0 + t * 1.2 + phase * 6.0);
    v += (1.0 - smoothstep(0.0, 0.04, abs(uv.y - wv))) * 0.9;
    v += (1.0 - step(0.03, abs(fract(uv.x * 6.0) - 0.5) - 0.47)) * 0.2;
  }
  float scan = 0.84 + 0.16 * sin(vWorld.y * 28.0 - t * 2.2);
  float flick = 0.97 + 0.03 * sin(t * 5.0 + phase * 20.0);
  float night = 1.0 - uSkyLight;
  float vis = 0.5 + 0.5 * night;
  vec3 col = vTint * ((v * edge + rim * 0.8) * scan * flick) * vMat.x * max(uEmission, 0.6) * vis * 0.75;
  float fogF = smoothstep(uFogNear, uFogFar, vDist);
  col *= 1.0 - fogF;
  col = kSafeColor(col);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
