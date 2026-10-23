/*
 * KEŞİF render/city — ARAÇ GÖLGELENDİRİCİLERİ (GLSL ES 3.00, three r186 ShaderMaterial öneki). Üç ailenin ortak gövdesi:
 *   rig    : tek araç (Mesh; tekerlek dönüşü/yönelmesi köşe gölgelendiricide; lamba durumu uniform)          define yok
 *   traffic: örnekli trafik (InstancedMesh; instanceColor = gövde rengi, aI0 = [dönüş, fren, far, sinyal], aL = [gökyüzü, blok])   define INSTANCED
 *   cam    : yarı saydam cam geçişi (define GLASS_PASS)
 * Aydınlatma prop/chunk ile AYNI paylaşılan uniform'lardan gelir (gün-gece, sis, ışık renkleri); gökyüzü yansıması uSky/uHorizon'dan, gece neon
 * yansıması uNeon.x'ten, ıslak yol/yağmur parlaması uWet'ten. Slot paleti vehicleGeoKit.SLOT ile aynıdır.
 * Hiçbir kip 3 Hz'den hızlı değişmez (sinyaller CPU'da yumuşatılır; titreşim yok). reducedMotion: uMotion=0 → döngüsel animasyon yok.
 */

export const VEH_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aMat;
attribute vec3 aPivot;
#ifdef INSTANCED
attribute vec4 aI0;
attribute vec3 aL;
#else
uniform float uSteer;
uniform float uSpin;
uniform float uDriver;
uniform vec4 uLampU;
uniform vec2 uIndU;
uniform vec2 uLight;
uniform vec3 uBodyU;
#endif

varying vec2 vUv;
varying vec3 vColor;
varying vec4 vMat;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vDist;
varying vec3 vBody;
varying vec4 vLamp;
varying vec2 vInd;
varying vec2 vLightS;
varying float vSide;
varying float vFade;

void main() {
  vec3 p = position;
  vec3 n = normal;
  int f = int(aMat.z + 0.5);
  vLocal = position;
  vSide = position.x < 0.0 ? -1.0 : 1.0;
#ifdef INSTANCED
  float spinA = -aI0.x;
  float steerA = 0.0;
  float driverK = 0.0;
  vBody = instanceColor;
  vLamp = vec4(aI0.z, aI0.y, 0.0, 0.0);
  float tI = aI0.w;
  vInd = vec2((tI < -0.5 || tI > 1.5) ? 1.0 : 0.0, (tI > 0.5) ? 1.0 : 0.0);
  vLightS = aL.xy;
  vFade = aL.z;
#else
  float spinA = uSpin;
  float steerA = uSteer;
  float driverK = uDriver;
  vBody = uBodyU;
  vLamp = uLampU;
  vInd = uIndU;
  vLightS = uLight;
  vFade = 1.0;
#endif
  if ((f & 3) != 0) {
    vec3 q = p - aPivot;
    vec3 nq = n;
    if ((f & 2) != 0) {
      float c = cos(spinA);
      float s = sin(spinA);
      q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
      nq = vec3(nq.x, nq.y * c - nq.z * s, nq.y * s + nq.z * c);
    }
    if ((f & 1) != 0) {
      float c = cos(steerA);
      float s = sin(steerA);
      q = vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c);
      nq = vec3(nq.x * c + nq.z * s, nq.y, -nq.x * s + nq.z * c);
    }
    p = aPivot + q;
    n = nq;
  }
#ifndef INSTANCED
  if ((f & 4) != 0) {
    // sürücü: koltuk noktasına doğru ölçeklenip kaybolur (giriş/çıkış animasyonu; 0 = gizli)
    p = mix(vec3(0.0, 0.5, 0.0), p, driverK);
    if (driverK < 0.02) p = vec3(0.0, -50.0, 0.0);
  }
#endif
  vec4 wp4;
#ifdef INSTANCED
  wp4 = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
#else
  wp4 = modelMatrix * vec4(p, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * n);
#endif
  vWorld = wp4.xyz;
  vUv = uv;
  vColor = aColor;
  vMat = aMat;
  vDist = length(wp4.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp4;
}
`;

const COMMON = /* glsl */ `
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
uniform float uWet;
uniform vec4 uNeon;
uniform float uRain;

uniform vec3 uAccentU;
uniform vec3 uNeonC;
uniform vec3 uSkin;
uniform vec3 uCloth;
uniform vec3 uHair;
uniform float uDmg;
uniform float uBeam;
uniform float uHeight;
uniform float uHalfL;
uniform float uWheelBlur;
uniform float uRimStyle;
uniform float uRainGlass;
uniform float uQ;
uniform sampler2D uPlateMap;
uniform vec4 uPlateRect;
uniform vec4 uSignRect;
uniform float uPlateOn;

varying vec2 vUv;
varying vec3 vColor;
varying vec4 vMat;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vDist;
varying vec3 vBody;
varying vec4 vLamp;
varying vec2 vInd;
varying vec2 vLightS;
varying float vSide;
varying float vFade;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float kCurveSky(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * (0.3 + 0.7 * x);
}
float kCurveBlock(float x) {
  x = clamp(x, 0.0, 1.0);
  return pow(max(x, 0.0), 1.55) * 0.97 + x * 0.03;
}
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

// Yansıtılan ortam: gökyüzü degradesi + gece neon şeritleri (şehir silueti) + ıslakta güçlenir.
vec3 kEnv(vec3 R) {
  float up = R.y;
  vec3 sky = mix(uHorizonColor, uSkyColor, pow(clamp(up, 0.0, 1.0), 0.5));
  vec3 gnd = uHorizonColor * 0.22 + uFogColor * 0.12;
  vec3 e = up > 0.0 ? sky : mix(uHorizonColor * 0.45, gnd, clamp(-up * 3.0, 0.0, 1.0));
  float ang = atan(R.z, R.x);
  float band = pow(max(0.5 + 0.5 * sin(ang * 7.0 + 1.3 * sin(ang * 3.0)), 0.0), 3.0);
  float hq = (up - 0.1) * 4.5;
  float hband = exp(-hq * hq);
  vec3 neon = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.22, 0.66), 0.5 + 0.5 * sin(ang * 2.0 + 0.6)) * band * hband;
  e += neon * uNeon.x * (0.55 + uWet * 0.9) * uQ;
  return e;
}
`;

const BODY_MAIN = /* glsl */ `
void main() {
  float fadeK = max(smoothstep(uFadeStart, uFadeEnd, vDist), 1.0 - vFade);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
  float beamEdge = 0.0;
#ifndef INSTANCED
  if (uBeam < 0.999) {
    float h = clamp(vLocal.y / max(uHeight, 0.1), 0.0, 1.2);
    float cut = uBeam * 1.25 - 0.08;
    if (h > cut) discard;
    beamEdge = smoothstep(cut - 0.1, cut, h);
  }
#endif
  float facing = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vNormalW) * facing;
  vec3 V = normalize(cameraPosition - vWorld);
  int slot = int(vMat.x + 0.5);
  float night = uNeon.x;

  float skyAmt = kCurveSky(vLightS.x) * uSkyLight;
  float blk = kCurveBlock(vLightS.y);
  float ndl = max(dot(N, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 lighting = (uAmbientColor * (0.35 + 0.65 * hemi) + uSunColor * ndl) * skyAmt
                + uBlockLightColor * blk * (0.82 + 0.18 * N.y) + vec3(uMinLight * 1.6)
                + night * vec3(0.05, 0.055, 0.09) * (0.55 + 0.45 * hemi);

  vec3 albedo = vColor;
  vec3 emissive = vec3(0.0);
  float gloss = 0.0;
  float refl = 0.0;
  if (!gl_FrontFacing) {
    // iç yüzler (kabin içi): koyu iç kaplama
    albedo = vec3(0.045, 0.05, 0.062);
    lighting = lighting * 0.8 + vec3(0.02);
    slot = 15;
  }
  if (slot == 0) { albedo = vBody * vColor; gloss = 1.0; }
  else if (slot == 1) { albedo = uAccentU * vColor; gloss = 1.0; }
  else if (slot == 2) { gloss = 0.35; }
  else if (slot == 3) { albedo = vec3(0.02, 0.03, 0.045); gloss = 1.0; refl = 0.42; }
  else if (slot == 4) {
    emissive = uNeonC * (vMat.y < -0.01 ? 0.35 : (0.85 + 1.15 * night)) * uEmission;
    albedo = uNeonC * 0.1;
  }
  else if (slot == 5) { emissive = vColor * (0.12 + vLamp.x * 3.0) * uEmission; gloss = 0.6; }
  else if (slot == 6) {
    emissive = vColor * (0.28 + vLamp.x * 0.45 + vLamp.y * 2.6) * uEmission;
  }
  else if (slot == 7) { emissive = vColor * (0.05 + vLamp.z * 3.0) * uEmission; }
  else if (slot == 8) {
    float on = vSide < 0.0 ? vInd.x : vInd.y;
    emissive = vColor * (0.08 + on * 2.8) * uEmission;
  }
  else if (slot == 9) { gloss = 0.1; }
  else if (slot == 10) {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float spokes = uRimStyle < 0.5 ? 5.0 : (uRimStyle < 1.5 ? 10.0 : (uRimStyle < 2.5 ? 0.0 : 3.0));
    float sp = spokes > 0.5 ? smoothstep(0.32, 0.55, abs(cos(a * spokes * 0.5))) : 0.0;
    if (uRimStyle > 2.5) sp = 1.0 - smoothstep(0.78, 0.86, r) * 0.0;
    float hub = smoothstep(0.3, 0.22, r);
    float lip = smoothstep(0.8, 0.92, r);
    vec3 metal = vec3(0.5, 0.55, 0.62);
    float m = max(max(sp * smoothstep(0.1, 0.25, r), hub), lip);
    albedo = mix(vec3(0.02, 0.022, 0.03), metal, m);
    if (uRimStyle > 1.5 && uRimStyle < 2.5) {
      float ring = smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.82, 0.9, r));
      emissive = uNeonC * ring * (1.0 + night) * uEmission;
    }
    albedo = mix(albedo, vec3(0.2), uWheelBlur * 0.7);
    gloss = 0.7;
  }
  else if (slot == 11) {
#ifdef PLATE_TEX
    vec2 puv = uPlateRect.xy + vUv * uPlateRect.zw;
    albedo = texture2D(uPlateMap, puv).rgb;
#else
    albedo = vec3(0.7);
#endif
    gloss = 0.3;
  }
  else if (slot == 12) { gloss = 1.0; refl = 0.5; }
  else if (slot == 13) { albedo = uSkin; }
  else if (slot == 14) { albedo = uCloth * vColor; }
  else if (slot == 16) { emissive = vColor * (0.5 + 1.3 * (1.0 - uSkyLight) + 0.5) * uEmission; albedo = vColor * 0.2; }
  else if (slot == 22) {
#ifdef PLATE_TEX
    vec2 suv = uSignRect.xy + vUv * uSignRect.zw;
    vec3 tx = texture2D(uPlateMap, suv).rgb;
    emissive = tx * (0.7 + 1.3 * (1.0 - uSkyLight)) * uEmission;
    albedo = vec3(0.04);
#else
    emissive = vColor * 1.2 * uEmission;
#endif
  }
  else if (slot == 17) { albedo = vec3(0.01, 0.012, 0.016); lighting *= 0.4; }
  else if (slot == 18) { gloss = 0.1; }
  else if (slot == 19) { gloss = 0.9; albedo = vColor; }
  else if (slot == 20) { albedo = uHair; }
  else if (slot == 21) { gloss = 0.6; }
  else if (slot == 23) { emissive = uNeonC * (0.9 + night) * uEmission; albedo = uNeonC * 0.1; }

  // hasar: çizik / leke (yalnız renk): alçak yüzeylerde ve tamponlarda yoğun, küçük benekler + büyük koyulaşma; yaralanma görüntüsü yok
  float thr = vMat.w;
  if (uDmg > 0.001 && (slot == 0 || slot == 1)) {
    float low = 1.0 - smoothstep(0.25, 1.1, vLocal.y);
    float endZ = smoothstep(0.5, 1.0, abs(vLocal.z) / max(uHalfL, 1.0));
    float cell = hash21(floor(vec2(vLocal.x * 14.0 + vLocal.y * 9.0, vLocal.z * 14.0 + vLocal.y * 11.0)));
    float spots = step(cell, uDmg * (0.16 + 0.45 * low + 0.4 * endZ));
    float big = smoothstep(thr - 0.05, thr + 0.22, uDmg * 0.55 + endZ * 0.3 * uDmg - 0.12);
    float sc = max(spots * 0.8, big * 0.5);
    vec3 scuff = mix(vec3(0.06, 0.058, 0.055), vec3(0.3, 0.29, 0.28), hash21(floor(vLocal.xz * 40.0)));
    albedo = mix(albedo, scuff, sc);
    gloss *= 1.0 - sc * 0.8;
  }

  vec3 col = albedo * lighting;

  if (gloss > 0.0 || refl > 0.0) {
    float NdV = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(max(1.0 - NdV, 0.0), 5.0);
    vec3 R = reflect(-V, N);
    vec3 env = kEnv(R);
    float k = (slot == 12 ? 0.6 : 0.16 + 0.55 * F) * gloss * (1.0 + uWet * 0.6) * (0.5 + 0.5 * uQ);
    k = max(k, refl);
    col = mix(col, env * (0.55 + 0.45 * albedo), clamp(k, 0.0, 0.9));
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 70.0) * (0.5 + 0.5 * gloss);
    col += uSunColor * spec * skyAmt * 1.3 * gloss;
    // gece: sokak neon ışığı kenar parlaması
    float rim = pow(max(1.0 - NdV, 0.0), 2.4);
    col += uNeonC * rim * night * 0.22 * gloss * uQ;
  }
  col += emissive;
  col = mix(col, vec3(0.1, 0.9, 1.0) * 2.5, beamEdge * 0.9);

  if (uUnderwater > 0.5) col *= vec3(0.55, 0.82, 1.0);
  col = kFog(col, vDist, V);
  col = kSafeColor(col);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const GLASS_MAIN = /* glsl */ `
void main() {
  float fadeK = smoothstep(uFadeStart, uFadeEnd, vDist);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
  if (uBeam < 0.999) {
    float h = clamp(vLocal.y / max(uHeight, 0.1), 0.0, 1.2);
    if (h > uBeam * 1.25 - 0.08) discard;
  }
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(max(1.0 - NdV, 0.0), 4.0);
  vec3 R = reflect(-V, N);
  vec3 env = kEnv(R);
  float skyAmt = kCurveSky(vLightS.x) * uSkyLight;
  vec3 tint = vec3(0.04, 0.07, 0.1);
  float alpha = 0.13 + 0.6 * F + 0.05 * uWet;
  vec3 col = tint * (uAmbientColor * skyAmt + vec3(0.04)) + env * (0.28 + 0.9 * F) * (0.6 + 0.4 * uQ);
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(dot(N, H), 0.0), 90.0) * skyAmt * 1.6;
  // yağmur damlaları / akıntı çizgileri (yalnız sürülen araç, uRainGlass > 0)
  if (uRainGlass > 0.01) {
    vec2 g = vec2(vLocal.x * 7.0 + vLocal.z * 3.0, vLocal.y * 5.0);
    float colId = floor(g.x);
    float spd = 0.15 + 0.35 * hash11(colId);
    float flow = fract(g.y + uTime * spd * uMotion + hash11(colId * 1.7));
    float streak = smoothstep(0.88, 1.0, flow) * smoothstep(0.1, 0.3, fract(g.x)) * (1.0 - smoothstep(0.55, 0.85, fract(g.x)));
    float drops = step(0.93, hash21(floor(vLocal.xy * 24.0 + vLocal.z * 24.0)));
    float wet = clamp(streak * 0.8 + drops * 0.5, 0.0, 1.0) * uRainGlass;
    col += (uHorizonColor + vec3(0.04)) * wet * 0.5;
    alpha = clamp(alpha + wet * 0.35, 0.0, 0.95);
  }
  col = kFog(col, vDist, V);
  col = kSafeColor(col);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const VEH_FRAGMENT = `${COMMON}\n${BODY_MAIN}`;
export const VEH_GLASS_FRAGMENT = `${COMMON}\n${GLASS_MAIN}`;
