/*
 * KEŞİF render/city — YAYA GÖLGELENDİRİCİLERİ (GLSL ES 3.00, three r186 ShaderMaterial öneki).
 *   CITIZEN_VERTEX / CITIZEN_FRAGMENT : örnekli vatandaş (yakın + orta LOD): yürüyüş döngüsü ve jestler köşe gölgelendiricide (iskelet/kemik YOK), varyant seçimi, beden şekli
 *   BILLBOARD_VERTEX / BILLBOARD_FRAGMENT : uzak yayalar (kameraya dönük afiş, SDF siluet, yürüyüş sallanması)
 *   UMBRELLA_VERTEX / UMBRELLA_FRAGMENT : şemsiye (örnekli)          SHADOW_VERTEX / SHADOW_FRAGMENT : yumuşak yer gölgesi
 * Aydınlatma araç/prop ile AYNI paylaşılan uniform'lardan gelir (gün-gece, sis, ıslaklık, neon); yakındaki ışık seviyesi (gökyüzü/blok) örnek başına.
 * Hiçbir hareket 3 Hz'den hızlı titreşmez (dans/el sallama ≤ 2,2 Hz); reducedMotion: uMotion<1 → genlikler küçülür, dans/el sallama sakin.
 */
import { SKIN_HEX } from '../../sim/city/ped/pedData.js';

function lin(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
const SKIN_GLSL = SKIN_HEX.map((h) => `vec3(${lin((h >> 16) & 255).toFixed(4)}, ${lin((h >> 8) & 255).toFixed(4)}, ${lin(h & 255).toFixed(4)})`).join(',\n  ');

const SHARED = /* glsl */ `
uniform float uCTime;
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
uniform float uWet;
uniform vec4 uNeon;
`;

const LIGHTING = /* glsl */ `
float kCurveSky(float x) { x = clamp(x, 0.0, 1.0); return x * x * (0.3 + 0.7 * x); }
float kCurveBlock(float x) { x = clamp(x, 0.0, 1.0); return pow(max(x, 0.0), 1.55) * 0.97 + x * 0.03; }
vec3 kSafeColor(vec3 c) {
  bool ok = c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1.0e5 && c.g < 1.0e5 && c.b < 1.0e5;
  return ok ? min(c, vec3(32.0)) : vec3(0.0);
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
vec3 kEnv(vec3 R) {
  float up = R.y;
  vec3 sky = mix(uHorizonColor, uSkyColor, pow(clamp(up, 0.0, 1.0), 0.5));
  vec3 gnd = uHorizonColor * 0.22 + uFogColor * 0.12;
  vec3 e = up > 0.0 ? sky : mix(uHorizonColor * 0.45, gnd, clamp(-up * 3.0, 0.0, 1.0));
  float ang = atan(R.z, R.x);
  float band = pow(max(0.5 + 0.5 * sin(ang * 7.0 + 1.3 * sin(ang * 3.0)), 0.0), 3.0);
  float hq = (up - 0.1) * 4.5;
  vec3 neon = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.22, 0.66), 0.5 + 0.5 * sin(ang * 2.0 + 0.6)) * band * exp(-hq * hq);
  return e + neon * uNeon.x * (0.5 + uWet * 0.8);
}
`;

/* ------------------------------------------------------------------------------------------------
 * Vatandaş
 * ---------------------------------------------------------------------------------------------- */
export const CITIZEN_VERTEX = /* glsl */ `
attribute vec4 aMat;
attribute vec3 aPivot;
attribute vec4 aPos;
attribute vec4 aAnim;
attribute vec4 aShape;
attribute vec4 aLook;
attribute vec4 aStyle;
attribute vec4 aCol0;
attribute vec4 aCol1;
attribute vec4 aCol2;
attribute vec4 aCol3;
attribute vec4 aLight;

uniform float uCTime;
uniform float uMotion;

varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vMat;
varying vec4 vC0;
varying vec4 vC1;
varying vec4 vC2;
varying vec4 vC3;
varying vec4 vStyle;
varying vec4 vLook;
varying vec4 vLight;
varying float vDist;
varying vec3 vLocal;

const float HIP_Y = 0.92;
const float LEG_UP = 0.42;
const float ARM_UP = 0.27;
const float NECK_Y = 1.52;

vec3 rotX(vec3 p, vec3 piv, float a) {
  vec3 q = p - piv; float c = cos(a); float s = sin(a);
  return piv + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
}
vec3 rotZ(vec3 p, vec3 piv, float a) {
  vec3 q = p - piv; float c = cos(a); float s = sin(a);
  return piv + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
}
vec3 rotY(vec3 p, vec3 piv, float a) {
  vec3 q = p - piv; float c = cos(a); float s = sin(a);
  return piv + vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c);
}

void main() {
  float vc = aMat.z;
  if (vc > 0.5) {
    float grp = floor(vc / 16.0 + 0.001);
    float val = vc - grp * 16.0;
    float sel = grp < 1.5 ? aLook.x : (grp < 2.5 ? aLook.y : (grp < 3.5 ? aLook.z : (grp < 4.5 ? aLook.w : aStyle.x)));
    if (abs(val - sel) > 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
  }
  vec3 p = position;
  vec3 n = normal;
  vec3 piv = aPivot;
  float part = aMat.y;
  float lower = mod(aMat.w, 2.0);
  float hS = aShape.x;
  float shW = aShape.y;
  float gi = aShape.z;
  float shp = aShape.w;
  float ph = aAnim.x;
  float spd = aAnim.y;
  float g = aAnim.z;
  float lod = aAnim.w;
  float idr = aLight.w;
  float t = uCTime;
  float mot = uMotion;

  // beden şekli (poz öncesi): omuz/kalça genişliği, kalınlık, kum saati
  float kx = 1.0;
  float kz = 1.0;
  if (part < 0.5) {
    kx = mix(gi, shW, smoothstep(1.22, 1.46, p.y));
    kx *= 1.0 + shp * 0.1 * (smoothstep(1.2, 1.46, p.y) - smoothstep(0.86, 1.06, p.y) * 0.5);
    kz = mix(gi, 1.0, 0.5);
  } else if (part > 2.5 && part < 4.5) {
    kx = shW; kz = sqrt(gi);
  } else if (part < 2.5) {
    kx = mix(1.0, gi, 0.55); kz = mix(1.0, gi, 0.45);
  }
  p.x *= kx; p.z *= kz; piv.x *= kx; piv.z *= kz;
  n = normalize(vec3(n.x / kx, n.y, n.z / kz));

  // yürüyüş
  float walkK = smoothstep(0.08, 0.9, spd);
  float stride = min(spd / 1.4, 1.7) * walkK;
  float legA = 0.6 * stride * mot;
  float sw = sin(ph);
  float cw = cos(ph);
  float lean = 0.0;
  float bob = 0.0;
  float twist = 0.0;
  float sway = 0.0;
  float headPitch = 0.0;
  float headYaw = aStyle.w;
  float breathe = sin(t * 1.9 + idr * 40.0);
  if (g < 5.5 || g > 6.5) {
    bob = 0.02 * stride * mot * abs(sw) * 1.0;
    twist = 0.09 * stride * mot * sw;
    lean = -(0.035 + 0.075 * max(0.0, spd - 2.0)) * walkK * mot;
    sway = (1.0 - walkK) * 0.012 * sin(t * 0.7 + idr * 30.0) * mot;
    p.y += (1.0 - walkK) * 0.004 * breathe * (p.y > 1.0 ? 1.0 : 0.0);
  }

  if (part > 0.5 && part < 2.5) {
    // bacaklar
    float side = part < 1.5 ? 1.0 : -1.0;
    float th = side * legA * sw;
    float kneeK = 0.0;
    float walkPh = side * cw;
    if (g > 5.5 && g < 6.5) {
      th = side * 0.34 * mot * sin(t * 3.0 + idr * 6.0);
      walkPh = side * cos(t * 3.0 + idr * 6.0);
      kneeK = 0.5 * mot;
    } else {
      kneeK = (0.12 + 0.88 * stride) * 0.95 * mot;
    }
    if (lower > 0.5) {
      float kf = max(0.0, walkPh) * kneeK;
      vec3 kp = piv - vec3(0.0, LEG_UP, 0.0);
      p = rotX(p, kp, -kf); n = rotX(n, vec3(0.0), -kf);
    }
    p = rotX(p, piv, th); n = rotX(n, vec3(0.0), th);
    if (g > 7.5 && g < 8.5) p.y += 0.0;
  } else if (part > 2.5 && part < 4.5) {
    // kollar
    float side = part < 3.5 ? 1.0 : -1.0;
    bool right = part > 3.5;
    float th = -side * 0.55 * stride * mot * sw;
    float el = (0.1 + 0.34 * stride) * mot;
    float ab = 0.03;
    float wig = 0.0;
    if (g > 0.5 && g < 1.5) { // telefon
      if (right) { th = 0.95; el = 1.55; ab = -0.1; }
    } else if (g > 1.5 && g < 2.5) { // el sallama
      if (right) { th = 0.25; el = 0.35; ab = 2.35; wig = 0.5 * sin(t * 8.5 + idr * 5.0) * mot; }
    } else if (g > 2.5 && g < 3.5) { // fotoğraf
      th = 1.35; el = 1.6; ab = 0.0;
    } else if (g > 3.5 && g < 4.5) { // şemsiye
      if (right) { th = 0.9; el = 1.5; ab = 0.08; }
    } else if (g > 4.5 && g < 5.5) { // cepte eller
      th = -0.18; el = 0.75; ab = 0.1;
    } else if (g > 5.5 && g < 6.5) { // dans
      float d = sin(t * 3.0 + idr * 6.0 + side * 1.4);
      th = 1.0 + 0.85 * d * mot; el = 0.9; ab = 0.55 + 0.4 * d * mot;
    } else if (g > 6.5 && g < 7.5) { // sohbet jestleri
      if (right) {
        th = 0.7 + 0.5 * sin(t * 2.3 + idr * 9.0) * mot; el = 0.95 + 0.4 * sin(t * 3.1 + idr * 4.0) * mot; ab = 0.1;
      } else {
        th = 0.25 + 0.2 * sin(t * 1.7 + 1.0 + idr * 7.0) * mot; el = 0.55; ab = 0.05;
      }
    } else if (g > 7.5 && g < 8.5) { // sıçrama
      th = 0.8; el = 0.4; ab = 0.8;
    } else if (g > 8.5) { // taşı
      th = 0.85; el = 0.95; ab = 0.0;
    }
    float abd = side * ab;
    if (lower > 0.5) {
      vec3 ep = piv - vec3(0.0, ARM_UP, 0.0);
      p = rotX(p, ep, el); n = rotX(n, vec3(0.0), el);
      if (wig != 0.0) { p = rotZ(p, ep, side * wig); n = rotZ(n, vec3(0.0), side * wig); }
    }
    p = rotX(p, piv, th); n = rotX(n, vec3(0.0), th);
    p = rotZ(p, piv, -abd); n = rotZ(n, vec3(0.0), -abd);
  } else if (part > 4.5) {
    // baş: bakış + eğim; çocuklarda büyük baş
    float hs = aStyle.z;
    p = vec3(0.0, NECK_Y, 0.0) + (p - vec3(0.0, NECK_Y, 0.0)) * vec3(hs, hs, hs);
    if (g > 0.5 && g < 1.5) headPitch = 0.3;
    else if (g > 2.5 && g < 3.5) headPitch = -0.08;
    else if (g > 6.5 && g < 7.5) headPitch = 0.05 * sin(t * 2.0 + idr * 6.0) * mot;
    else if (g > 5.5 && g < 6.5) headPitch = 0.07 * sin(t * 3.0 + idr * 6.0) * mot;
    headPitch += (0.03 * sin(ph * 2.0) + 0.0) * stride * mot * (lod < 0.5 ? 1.0 : 0.0);
    if (lod < 0.5) {
      vec3 np = vec3(0.0, NECK_Y, 0.0);
      p = rotY(p, np, headYaw); n = rotY(n, vec3(0.0), headYaw);
      p = rotX(p, np, headPitch); n = rotX(n, vec3(0.0), headPitch);
    }
  }
  // gövde genel hareketi: kalça eksenli bükülme / eğilme / sallanma (bacaklar hariç)
  if (part < 0.5 || part > 2.5) {
    vec3 hip = vec3(0.0, HIP_Y, 0.0);
    float tw = twist;
    float ln = lean;
    float swy = sway;
    float bb = bob;
    if (g > 5.5 && g < 6.5) {
      tw = 0.18 * mot * sin(t * 1.5 + idr * 6.0);
      swy = 0.06 * mot * sin(t * 3.0 + idr * 6.0);
      bb = 0.035 * mot * abs(sin(t * 3.0 + idr * 6.0));
    }
    if (g > 7.5 && g < 8.5) bb = 0.0;
    p = rotY(p, hip, tw); n = rotY(n, vec3(0.0), tw);
    p = rotX(p, hip, ln); n = rotX(n, vec3(0.0), ln);
    p = rotZ(p, hip, swy); n = rotZ(n, vec3(0.0), swy);
    p.y += bb;
  }
  vLocal = p;
  p *= hS;
  float yaw = aPos.w;
  float cy = cos(yaw);
  float sy = sin(yaw);
  vec3 wp = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  vec3 nw = normalize(vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy));
  float hop = 0.0;
  if (g > 7.5 && g < 8.5) hop = 0.22 * abs(sin(t * 7.0 + idr * 5.0)) * mot;
  vec4 wp4 = modelMatrix * vec4(wp + aPos.xyz + vec3(0.0, hop, 0.0), 1.0);
  vWorld = wp4.xyz;
  vNormalW = normalize(mat3(modelMatrix) * nw);
  vMat = aMat;
  vC0 = aCol0; vC1 = aCol1; vC2 = aCol2; vC3 = aCol3;
  vStyle = aStyle;
  vLook = aLook;
  vLight = aLight;
  vDist = length(wp4.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

export const CITIZEN_FRAGMENT = /* glsl */ `
${SHARED}
${LIGHTING}
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vMat;
varying vec4 vC0;
varying vec4 vC1;
varying vec4 vC2;
varying vec4 vC3;
varying vec4 vStyle;
varying vec4 vLook;
varying vec4 vLight;
varying float vDist;
varying vec3 vLocal;

const vec3 SKIN[8] = vec3[8](
  ${SKIN_GLSL}
);

void main() {
  float fadeK = max(smoothstep(uFadeStart, uFadeEnd, vDist), 1.0 - vLight.z);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) N = -N;
  float night = uNeon.x;
  int slot = int(vMat.x + 0.5);
  int skinIdx = int(clamp(vStyle.y + 0.5, 0.0, 7.0));
  vec3 skin = SKIN[skinIdx];
  float lowStyle = vStyle.x;
  float topStyle = vLook.w;

  vec3 albedo = vec3(0.5);
  vec3 emissive = vec3(0.0);
  float gloss = 0.0;
  float rimK = 1.0;
  vec3 acc = vC2.rgb;
  if (slot == 0) { albedo = skin; }
  else if (slot == 1) { albedo = vC0.rgb; gloss = 0.35; }
  else if (slot == 2) { albedo = vC1.rgb; gloss = 0.25; }
  else if (slot == 3) { albedo = vec3(0.025, 0.027, 0.034) + vC1.rgb * 0.08; gloss = 0.7; }
  else if (slot == 4) { albedo = vC3.rgb; gloss = 0.45; }
  else if (slot == 5) { albedo = mix(vC0.rgb, vC1.rgb, 0.55) * 0.9; gloss = 0.3; }
  else if (slot == 6) { emissive = acc * (0.9 + 1.7 * night) * vC0.a * uEmission; albedo = acc * 0.1; }
  else if (slot == 7) { albedo = mix(vC1.rgb, acc, 0.22) * 0.85; gloss = 0.4; }
  else if (slot == 8) { emissive = acc * (0.6 + 1.6 * night) * uEmission; albedo = vec3(0.02); }
  else if (slot == 9) { albedo = vec3(0.012, 0.014, 0.02); gloss = 0.3; }
  else if (slot == 10) { albedo = mix(vC0.rgb, acc, 0.28) * 0.85; gloss = 0.4; }
  else if (slot == 11) { albedo = topStyle < 0.5 ? skin : vC0.rgb; gloss = topStyle < 0.5 ? 0.0 : 0.35; }
  else if (slot == 14) { albedo = mix(vec3(0.55, 0.38, 0.22), acc, 0.18); gloss = 0.25; }
  else if (slot == 15) { albedo = lowStyle > 0.5 ? skin : vC1.rgb; gloss = lowStyle > 0.5 ? 0.0 : 0.25; }

  // altta yer yansıması / ayak etrafı koyulaşması
  float skyAmt = kCurveSky(vLight.x) * uSkyLight;
  float blk = kCurveBlock(vLight.y);
  float ndl = max(dot(N, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 lighting = (uAmbientColor * (0.35 + 0.65 * hemi) + uSunColor * ndl) * skyAmt
                + uBlockLightColor * blk * (0.82 + 0.18 * N.y) + vec3(uMinLight * 1.6)
                + night * vec3(0.05, 0.055, 0.09) * (0.55 + 0.45 * hemi);
  // ayakta yere yakın: yumuşak ortam gölgesi
  float ao = mix(0.72, 1.0, smoothstep(0.0, 0.5, vLocal.y));
  vec3 col = albedo * lighting * ao;

  if (gloss > 0.0) {
    float NdV = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(max(1.0 - NdV, 0.0), 5.0);
    vec3 R = reflect(-V, N);
    vec3 env = kEnv(R);
    float k = (0.1 + 0.5 * F) * gloss * (1.0 + uWet * 1.2);
    col = mix(col, env * (0.5 + 0.5 * albedo), clamp(k, 0.0, 0.8));
    vec3 H = normalize(uSunDir + V);
    col += uSunColor * pow(max(dot(N, H), 0.0), 48.0) * skyAmt * gloss * (0.5 + uWet);
    // gece: sokak neon ışığı kenar parlaması (aksan renginde)
    float rim = pow(max(1.0 - NdV, 0.0), 2.6);
    col += acc * rim * night * 0.28 * gloss;
  }
  col += emissive;
  if (uUnderwater > 0.5) col *= vec3(0.55, 0.82, 1.0);
  col = kFog(col, vDist, V);
  col = kSafeColor(col);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ------------------------------------------------------------------------------------------------
 * Uzak afiş (kameraya dönük silüet)
 * ---------------------------------------------------------------------------------------------- */
export const BILLBOARD_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aPos;
attribute vec4 aAnim;
attribute vec4 aShape;
attribute vec4 aLook;
attribute vec4 aStyle;
attribute vec4 aCol0;
attribute vec4 aCol1;
attribute vec4 aCol2;
attribute vec4 aCol3;
attribute vec4 aLight;
varying vec2 vUv;
varying vec4 vC0;
varying vec4 vC1;
varying vec4 vC2;
varying vec4 vC3;
varying vec4 vStyle;
varying vec4 vLook;
varying vec4 vLight;
varying vec4 vAnim;
varying vec3 vWorld;
varying float vDist;
void main() {
  float h = 1.82 * aShape.x;
  vec3 base = aPos.xyz;
  vec3 toCam = cameraPosition - base;
  vec3 f = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4, 0.0, 0.0));
  vec3 r = vec3(f.z, 0.0, -f.x);
  float w = 0.46 * aShape.y;
  vec3 wp = base + r * (aCorner.x * w) + vec3(0.0, aCorner.y * h, 0.0);
  vUv = vec2(aCorner.x, aCorner.y);
  vC0 = aCol0; vC1 = aCol1; vC2 = aCol2; vC3 = aCol3; vStyle = aStyle; vLook = aLook; vLight = aLight; vAnim = aAnim;
  vec4 wp4 = modelMatrix * vec4(wp, 1.0);
  vWorld = wp4.xyz;
  vDist = length(wp4.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

export const BILLBOARD_FRAGMENT = /* glsl */ `
${SHARED}
${LIGHTING}
varying vec2 vUv;
varying vec4 vC0;
varying vec4 vC1;
varying vec4 vC2;
varying vec4 vC3;
varying vec4 vStyle;
varying vec4 vLook;
varying vec4 vLight;
varying vec4 vAnim;
varying vec3 vWorld;
varying float vDist;
const vec3 SKIN[8] = vec3[8](
  ${SKIN_GLSL}
);
float seg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a; vec2 ba = b - a;
  float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * hh) - r;
}
void main() {
  float fadeK = max(smoothstep(uFadeStart, uFadeEnd, vDist), 1.0 - vLight.z);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
  float v = vUv.y * 0.5 + 0.5; // 0 ayak .. 1 tepe
  vec2 p = vec2(vUv.x * 0.46, v * 1.82);
  float ph = vAnim.x;
  float spd = vAnim.y;
  float amp = min(spd / 1.4, 1.5) * smoothstep(0.08, 0.9, spd) * uMotion;
  float sw = sin(ph) * 0.2 * amp;
  // gövde, kafa, bacaklar, kollar
  float d = 1e3;
  float dBody = seg(p, vec2(0.0, 1.0), vec2(0.0, 1.42), 0.15);
  float dHead = length((p - vec2(0.0, 1.64)) * vec2(1.0, 0.92)) - 0.105;
  float dLegL = seg(p, vec2(-0.09, 0.92), vec2(-0.09 + sw, 0.05), 0.07);
  float dLegR = seg(p, vec2(0.09, 0.92), vec2(0.09 - sw, 0.05), 0.07);
  float dArmL = seg(p, vec2(-0.2, 1.42), vec2(-0.2 - sw * 0.7, 0.9), 0.05);
  float dArmR = seg(p, vec2(0.2, 1.42), vec2(0.2 + sw * 0.7, 0.9), 0.05);
  d = min(min(dBody, dHead), min(min(dLegL, dLegR), min(dArmL, dArmR)));
  if (d > 0.0) discard;
  int skinIdx = int(clamp(vStyle.y + 0.5, 0.0, 7.0));
  vec3 skin = SKIN[skinIdx];
  vec3 col = vC0.rgb;
  if (p.y < 0.93) col = vC1.rgb;
  if (p.y < 0.12) col = vec3(0.03);
  if (dHead < 0.0) col = skin;
  if (dHead < 0.0 && p.y > 1.69) col = vC3.rgb;
  if (dArmL < 0.0 && p.y < 1.1 && dBody > 0.0) col = skin;
  if (dArmR < 0.0 && p.y < 1.1 && dBody > 0.0) col = skin;
  float night = uNeon.x;
  float skyAmt = kCurveSky(vLight.x) * uSkyLight;
  float blk = kCurveBlock(vLight.y);
  vec3 lighting = (uAmbientColor * 0.75 + uSunColor * 0.35) * skyAmt + uBlockLightColor * blk + vec3(uMinLight * 1.6) + night * vec3(0.05, 0.055, 0.09);
  vec3 c = col * lighting;
  // neon belden kenar çizgisi
  float edge = smoothstep(-0.03, 0.0, d) * night * 0.8;
  c += vC2.rgb * edge * 0.35 * uEmission;
  c += vC2.rgb * smoothstep(0.02, 0.0, abs(p.y - 1.0) + abs(p.x) * 0.0) * 0.25 * vC0.a * (0.4 + night);
  vec3 V = normalize(cameraPosition - vWorld);
  c = kFog(c, vDist, V);
  c = kSafeColor(c);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ------------------------------------------------------------------------------------------------
 * Şemsiye
 * ---------------------------------------------------------------------------------------------- */
export const UMBRELLA_VERTEX = /* glsl */ `
attribute vec4 aMat;
attribute vec4 aPos;
attribute vec4 aUmb;
attribute vec4 aCol0;
attribute vec4 aLight;
uniform float uCTime;
uniform float uMotion;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vMat;
varying vec4 vC0;
varying vec4 vLight;
varying float vDist;
void main() {
  float open = aUmb.x;
  float hS = aUmb.y;
  vec3 p = position;
  vec3 n = normal;
  // aç/kapa: kubbe yarıçapı ve yüksekliği
  float k = open;
  if (aMat.x > 11.5 && aMat.x < 12.5) { p.xz *= mix(0.12, 1.0, k); p.y = mix(0.2 + p.y * 0.3, p.y, k); }
  if (aMat.x > 5.5 && aMat.x < 6.5) { p.xz *= mix(0.12, 1.0, k); p.y = mix(0.2 + p.y * 0.3, p.y, k); }
  // el konumu + eğim
  float tilt = 0.32 + 0.03 * sin(uCTime * 1.6 + aUmb.z) * uMotion;
  float c = cos(tilt); float s = sin(tilt);
  p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
  p += vec3(0.2, 1.43, -0.34);
  p *= hS;
  float yaw = aPos.w;
  float cy = cos(yaw); float sy = sin(yaw);
  vec3 wp = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  vec3 nw = normalize(vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy));
  vec4 wp4 = modelMatrix * vec4(wp + aPos.xyz, 1.0);
  vWorld = wp4.xyz;
  vNormalW = normalize(mat3(modelMatrix) * nw);
  vMat = aMat; vC0 = aCol0; vLight = aLight;
  vDist = length(wp4.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

export const UMBRELLA_FRAGMENT = /* glsl */ `
${SHARED}
${LIGHTING}
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vMat;
varying vec4 vC0;
varying vec4 vLight;
varying float vDist;
void main() {
  float fadeK = max(smoothstep(uFadeStart, uFadeEnd, vDist), 1.0 - vLight.z);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float night = uNeon.x;
  int slot = int(vMat.x + 0.5);
  vec3 albedo = vC0.rgb;
  vec3 emissive = vec3(0.0);
  float gloss = 0.5;
  if (slot == 6) { emissive = vC0.rgb * (1.1 + 1.6 * night) * uEmission; albedo = vC0.rgb * 0.1; gloss = 0.0; }
  else if (slot == 13) { albedo = vec3(0.12, 0.13, 0.15); gloss = 0.7; }
  if (!gl_FrontFacing && slot == 12) albedo *= 0.55;
  float skyAmt = kCurveSky(vLight.x) * uSkyLight;
  float blk = kCurveBlock(vLight.y);
  float ndl = max(dot(N, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 lighting = (uAmbientColor * (0.35 + 0.65 * hemi) + uSunColor * ndl) * skyAmt + uBlockLightColor * blk + vec3(uMinLight * 1.6) + night * vec3(0.05, 0.055, 0.09);
  vec3 col = albedo * lighting;
  if (gloss > 0.0) {
    float NdV = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(max(1.0 - NdV, 0.0), 5.0);
    vec3 env = kEnv(reflect(-V, N));
    col = mix(col, env * (0.5 + 0.5 * albedo), clamp((0.15 + 0.5 * F) * gloss * (1.0 + uWet), 0.0, 0.8));
  }
  col += emissive;
  col = kFog(col, vDist, V);
  col = kSafeColor(col);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ------------------------------------------------------------------------------------------------
 * Yumuşak yer gölgesi (+ gece aksan ışık havuzu)
 * ---------------------------------------------------------------------------------------------- */
export const SHADOW_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aPos;
attribute vec4 aCol0;
varying vec2 vUv;
varying vec4 vC0;
varying float vDist;
void main() {
  float r = 0.5 * aPos.w;
  vec3 wp = aPos.xyz + vec3(aCorner.x * r, 0.035, aCorner.y * r);
  vUv = aCorner;
  vC0 = aCol0;
  vec4 wp4 = modelMatrix * vec4(wp, 1.0);
  vDist = length(wp4.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

export const SHADOW_FRAGMENT = /* glsl */ `
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec4 uNeon;
uniform float uSkyLight;
varying vec2 vUv;
varying vec4 vC0;
varying float vDist;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = (1.0 - smoothstep(0.15, 1.0, r)) * 0.42 * vC0.a * (1.0 - smoothstep(uFadeStart * 0.7, uFadeEnd, vDist));
  vec3 c = vec3(0.01, 0.012, 0.02);
  gl_FragColor = vec4(c, a);
}
`;
