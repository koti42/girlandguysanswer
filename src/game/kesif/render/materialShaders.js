/*
 * KEŞİF render — chunk shader kaynakları (GLSL ES 3.00; three r186 ShaderMaterial önekiyle derlenir).
 *
 * Neden ShaderMaterial (onBeforeCompile değil)?
 *  - Aydınlatma tamamen pişirilmiş köşe verisidir (yumuşak gökyüzü/blok ışığı + AO); three'nin PBR ışık zinciri
 *    (ışık sayısına bağlı varyantlar, gölge, ortam haritası) gereksiz maliyet ve atlas üç-kanal düzenine ters.
 *  - Su, lav, mühür, portal, rüzgâr gibi türe özel akışlar tek kaynakta, `#define PASS` ile üç geçişe derlenir.
 *  - Çıktıda three'nin `tonemapping_fragment` ve `colorspace_fragment` parçaları kullanılır → renderer ayarlarına uyar,
 *    post-fx (HalfFloat hedef) açıkken HDR emisyon bloom'a gider.
 *
 * Tanımlar (material.defines): PASS (0 opak, 1 kesik, 2 şeffaf), USE_NORMAL_MAP, HIGH_DETAIL (su dalga ayrıntısı, ışık yansıması).
 *
 * Köşe öznitelikleri: position, normal, uv, aColor (rgb = ton×AO, a = AO), aLight (gökyüzü, blok), aFlags (bitler, a, b, c).
 *   bitler: 0-1 rüzgâr, 2-4 tür (KIND), 5 akış, 6 yumuşak.   a: sallanma/yüzey ağırlığı, b: su derinliği, c: köpük.
 *
 * ŞEHİR (Neon Meridyen): `#define CITY` (yalnız şehir boyutunda; materials.setCity) → ek öznitelik aCity (Uint8×4 normalized, mesher opts.city;
 *   bit düzeni sim/cityData.js): a bit7 ıslak yüzey üst yüzü, bit6 yanık pencere (r = gece eşiği, düşük 2 bit grup), bit0–5 neon şiddeti,
 *   rgb neon ton ipucu. Efektler: neon boyası (blok ışığı tonu), ıslak yol (uWet: albedo×0.55, pürüzlülük 0.15, Fresnel gökyüzü yansıması,
 *   su birikintisi gürültüsü, yağmur halkaları, neon yansıma çizgileri), pencere grubu eşikleri (uNeon.x gece, .w pencere kazancı).
 *   Kalite tanımları: CITY_PUDDLE (orta+yüksek), CITY_RINGS (yüksek), CITY_WINDOW_A_OFF + CITY_LDR (düşük: grup A penceresi kapalı, bloom yok → emisyon kısık).
 *   aCity yoksa (varsayılan öznitelik 0,0,0,1 → bayt 255) "değer yok" sayılır → ana diyar mesh'i şehir programıyla da bozulmaz.
 *   CITY tanımsızken kaynak ana diyar ile aynı ifadeleri üretir (bayt-aynı görüntü).
 */

export const CHUNK_VERTEX = /* glsl */ `
attribute vec4 aColor;
attribute vec2 aLight;
attribute vec4 aFlags;
#ifdef CITY
attribute vec4 aCity;
#endif

uniform float uTime;
uniform float uMotion;

varying vec2 vUv;
centroid varying vec4 vColor;
centroid varying vec2 vLight;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vParam;
varying float vDist;
flat varying float vBits;
#ifdef CITY
varying vec4 vCityHue; // rgb: neon ton ipucu (sRGB 0..1) ya da pencerede r = gece eşiği; a: neon şiddeti 0..1
flat varying vec2 vCityFlag; // x: ıslak üst yüz, y: yanık pencere
#endif

float kWaveH(vec2 p, float t) {
  return sin(p.x * 1.15 + t * 1.35) * 0.5
       + sin(p.y * 0.93 - t * 1.1 + p.x * 0.31) * 0.35
       + sin((p.x + p.y) * 2.2 + t * 2.4) * 0.15;
}

void main() {
  int bits = int(aFlags.x + 0.5);
  int wind = bits & 3;
  int kind = (bits >> 2) & 7;
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  float a = aFlags.y;

  if (wind > 0 && uMotion > 0.0) {
    float ph = dot(wp.xz, vec2(0.65, 0.83));
    float gust = 0.55 + 0.45 * sin(uTime * 0.31 + wp.x * 0.045 + wp.z * 0.037);
    float s1 = sin(uTime * 1.9 + ph * 1.3);
    float s2 = sin(uTime * 3.1 + ph * 2.1 + 1.7);
    float amp = wind == 1 ? 0.03 * (0.5 + 0.5 * gust) : (wind == 2 ? 0.11 * a * gust : 0.06 * a * gust);
    vec2 off = vec2(0.82, 0.57) * (s1 * 0.65 + s2 * 0.35) * amp * uMotion;
    wp.xz += off;
    wp.y += wind == 1 ? s2 * amp * 0.4 * uMotion : -abs(off.x) * 0.3;
  }
  if (kind == 1 && a > 0.5 && uMotion > 0.0) {
    wp.y += kWaveH(wp.xz, uTime) * 0.035 * uMotion;
  }

  vUv = uv;
  vColor = aColor;
  vLight = aLight;
  vWorld = wp;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vParam = aFlags.yzw;
  vBits = aFlags.x;
  vDist = length(wp - cameraPosition);
#ifdef CITY
  {
    // aCity.a baytı: bit7 ıslak, bit6 pencere, bit0–5 şiddet (pencerede grup). 254+ = öznitelik yok (varsayılan 0,0,0,1).
    float ab = floor(aCity.a * 255.0 + 0.5);
    float okc = ab < 254.0 ? 1.0 : 0.0;
    float wetb = ab >= 128.0 ? 1.0 : 0.0;
    float rem = ab - wetb * 128.0;
    float winb = rem >= 64.0 ? 1.0 : 0.0;
    float inten = clamp((rem - winb * 64.0) / 63.0, 0.0, 1.0);
    vCityFlag = vec2(wetb, winb) * okc;
    vCityHue = vec4(clamp(aCity.rgb, 0.0, 1.0) * okc, inten * okc * (1.0 - winb));
  }
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const CHUNK_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uNormalMap;
uniform sampler2D uMaterialMap;
uniform vec2 uAtlasSize;
uniform vec2 uCellSize;
uniform float uPad;
uniform float uTile;

uniform float uTime;
uniform float uMotion;
uniform float uSkyLight;
uniform vec3 uAmbientColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uBlockLightColor;
uniform float uMinLight;
uniform float uEmission;
uniform float uNormalStrength;

uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
uniform float uUnderwater;
uniform vec3 uUnderwaterColor;
uniform vec3 uSealColor;
#ifdef CITY
uniform float uWet; // ıslaklık 0..1 (yağmurda 1; 1 sn yükselir, 20 sn kurur)
uniform vec4 uNeon; // x gece faktörü, y neon kazancı, z ıslak yansıma kazancı, w pencere ışıma kazancı
uniform float uRain; // yağış şiddeti 0..1 (halka yoğunluğu)
uniform sampler2D uCityNoise; // periyodik gürültü dokusu (render/city/cityNoise.js): RGBA8, 32×32 kafes, hücre başına 8 texel
#endif

varying vec2 vUv;
// centroid: MSAA'da kısmen örtülen kenar pikselinde değer üçgenin DIŞINA taşınmasın (aşağı bkz. kCurveBlock notu)
centroid varying vec4 vColor;
centroid varying vec2 vLight;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vParam;
varying float vDist;
flat varying float vBits;
#ifdef CITY
varying vec4 vCityHue;
flat varying vec2 vCityFlag;
#endif

// Atlas hücresi içinde sarmalı kaydırma (doku periyodik olduğundan dikiş görünmez).
vec2 kTileScroll(vec2 uv, vec2 off) {
  vec2 px = uv * uAtlasSize;
  vec2 cell = floor(px / uCellSize) * uCellSize;
  vec2 loc = px - cell - uPad;
  loc = mod(loc + off * uTile, uTile);
  return (cell + uPad + loc) / uAtlasSize;
}

// Hücre içi yerel koordinat 0..1
vec2 kTileLocal(vec2 uv) {
  vec2 px = uv * uAtlasSize;
  vec2 cell = floor(px / uCellSize) * uCellSize;
  return (px - cell - uPad) / uTile;
}
vec2 kTileFromLocal(vec2 uv, vec2 loc) {
  vec2 px = uv * uAtlasSize;
  vec2 cell = floor(px / uCellSize) * uCellSize;
  return (cell + uPad + clamp(loc, 0.012, 0.988) * uTile) / uAtlasSize;
}

// Türev tabanlı teğet çerçevesi (Schüler): yuvarlama/dönüş yapılmış uv'lerle de çalışır.
vec3 kPerturb(vec3 N, vec3 p, vec2 uv, vec3 tn) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 Bt = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(max(dot(T, T), dot(Bt, Bt)), 1e-12));
  return normalize(mat3(T * invmax, Bt * invmax, N) * tn);
}

vec3 kWaterNormal(vec2 p, float t, float amp) {
  float dx = cos(p.x * 1.15 + t * 1.35) * 0.575
           + cos(p.y * 0.93 - t * 1.1 + p.x * 0.31) * 0.1085
           + cos((p.x + p.y) * 2.2 + t * 2.4) * 0.33;
  float dz = cos(p.y * 0.93 - t * 1.1 + p.x * 0.31) * 0.3255
           + cos((p.x + p.y) * 2.2 + t * 2.4) * 0.33;
#ifdef HIGH_DETAIL
  dx += cos(p.x * 5.3 + p.y * 2.1 + t * 3.1) * 0.042 + cos(p.x * 9.1 - p.y * 7.3 + t * 4.3) * 0.02;
  dz += cos(p.y * 4.7 - p.x * 1.7 + t * 2.7) * 0.048 + cos(p.y * 8.3 + p.x * 6.1 - t * 3.7) * 0.02;
#endif
  return normalize(vec3(-dx * amp, 1.0, -dz * amp));
}

// DİKKAT: pow(x, y) x < 0 için TANIMSIZDIR (GPU'da NaN). Köşe ışığı 0..1 verilir ama MSAA'da (ve kenar piksellerinde)
// ara değer üçgenin dışına taşıp eksiye düşebilir; NaN HDR hedefe yazılır → bloom'da beyaz leke + kenar boyunca siyah noktalar.
// Bu yüzden tabanlar hep [0,1]'e kıstırılır (centroid ek güvenlik).
float kCurveSky(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * (0.3 + 0.7 * x);
}
float kCurveBlock(float x) {
  x = clamp(x, 0.0, 1.0);
  return pow(x, 1.55) * 0.97 + x * 0.03;
}

// Çıkış kıskacı: NaN/eksi/aşırı büyük değer asla HDR hedefe gitmez (karşılaştırmalar NaN'da yanlış olur → 0).
vec3 kSafeColor(vec3 c) {
  bool ok = c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1.0e5 && c.g < 1.0e5 && c.b < 1.0e5;
  return ok ? min(c, vec3(32.0)) : vec3(0.0);
}

#ifdef CITY
// Gürültü ALU yerine dokudan: p birimi = bir kafes hücresi (periyot 32); kafes noktasında texel merkezi → tam değer. (Derleme maliyeti ≈ yarıya iner.)
float kVnoise(vec2 p) {
  return texture2D(uCityNoise, (p * 8.0 + 0.5) / 256.0).r;
}
// Kafes noktası başına 4 bağımsız rastgele sayı (id tamsayı hücre indeksi)
vec4 kHash4(vec2 id) {
  return texture2D(uCityNoise, (floor(id) * 8.0 + 0.5) / 256.0);
}
// sRGB 0..1 ton ipucu → doğrusal (pow YOK: hızlı polinom yaklaşımı; girdi önce [0,1]'e kıstırılır)
vec3 kSrgbToLin(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878);
}
// Islak yol çizgileri: bakış açısına (kameradan çıkan ışına) bağlı dikey ışık sütunu yansıması; s = uzaklık dilimi. out hue: doğrusal neon tonu.
float kStreak(float a, float s, out vec3 hue) {
  float c = a * 0.45 + s * 13.7;
  float h = kHash4(vec2(floor(c), 11.0 + s)).r;
  hue = h < 0.28 ? vec3(0.0, 0.6, 1.0) : (h < 0.56 ? vec3(1.0, 0.01, 0.26) : (h < 0.8 ? vec3(1.0, 0.17, 0.0) : vec3(0.21, 1.0, 0.01)));
  float l1 = smoothstep(0.74, 0.94, kVnoise(vec2(c, s * 3.7)));
  float l2 = smoothstep(0.7, 0.92, kVnoise(vec2(a * 1.6 - s * 4.3, s * 5.3 + 2.0))) * 0.5;
  return max(l1, l2);
}
// Yağmur halkaları (iki katman): vec3(halka maskesi, radyal normal sapması x, z). Katman başına hücre başı tek halka, yoğunluk yağışla.
vec3 kRipples(vec2 p, float t, float rain) {
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 0.9 : 1.7;
    vec2 g = p * sc + vec2(float(k) * 17.3, float(k) * 5.1);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    // 32 hücrelik gürültü periyodu her büyük karoda farklı kaydırılır (halka deseni tekrar etmesin)
    vec2 idm = id + floor(id / 32.0) * vec2(5.0, 11.0) + vec2(float(k) * 3.0, float(k) * 7.0);
    vec4 hh = kHash4(idm);
    if (hh.r > rain * 0.85) continue;
    vec2 c = (hh.gb - 0.5) * 0.45;
    vec2 h2 = kHash4(idm + vec2(31.0, 17.0)).rg;
    float ph = fract(t * (0.5 + 0.5 * hh.a) + h2.r * 9.0 + h2.g * 5.0);
    vec2 d = f - c;
    float dl = length(d);
    float r = ph * 0.5;
    float ring = smoothstep(0.07, 0.0, abs(dl - r)) * (1.0 - ph) * (1.0 - ph);
    acc.x += ring;
    acc.yz += d / max(dl, 1.0e-3) * ring * sign(dl - r);
  }
  return acc;
}
#endif

void main() {
  int bits = int(vBits + 0.5);
  int kind = (bits >> 2) & 7;
  bool flow = ((bits >> 5) & 1) == 1;
  bool soft = ((bits >> 6) & 1) == 1;
  float t = uTime;
  float dist = vDist;

  // Uzak kenarda sis rengine karışmadan önce ekran-ızgarası eriyik (parça patlaması gizlenir)
  float fadeK = 0.0;
#if PASS != 2
  fadeK = smoothstep(uFadeStart, uFadeEnd, dist);
  if (fadeK > 0.0) {
    float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (dn < fadeK) discard;
  }
#endif

  vec3 Ng = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 dUvx = dFdx(vUv);
  vec2 dUvy = dFdy(vUv);

  // Tür başına doku koordinatı
  vec2 uv = vUv;
  vec2 uv2 = vUv;
  if (kind == 2) {
    float sp = flow ? 0.075 : 0.012;
    uv = kTileScroll(vUv, vec2(t * 0.011, flow ? -t * sp : t * 0.007) * uMotion);
    uv2 = kTileScroll(vUv, vec2(-t * 0.009, flow ? -t * sp * 0.7 : -t * 0.006) * uMotion + vec2(0.37, 0.61));
  } else if (kind == 1) {
    float sp = flow ? 0.1 : 0.0;
    uv = kTileScroll(vUv, vec2(t * 0.008, flow ? -t * sp : t * 0.005) * uMotion);
  } else if (kind == 3) {
    uv = kTileScroll(vUv, vec2(0.0, t * 0.035) * uMotion);
  } else if (kind == 4) {
    vec2 c = kTileLocal(vUv) - 0.5;
    float r = length(c);
    float an = (1.0 - clamp(r * 1.7, 0.0, 1.0)) * (1.3 + sin(t * 0.7) * 0.5) * uMotion + t * 0.6 * uMotion;
    float cs = cos(an);
    float sn = sin(an);
    c = mat2(cs, -sn, sn, cs) * c;
    uv = kTileFromLocal(vUv, c + 0.5);
  }

  vec4 tex = textureGrad(uMap, uv, dUvx, dUvy);
  vec4 mtl = textureGrad(uMaterialMap, uv, dUvx, dUvy);
  float rough = mtl.r;
  float emis = mtl.g;
  float cav = mtl.b;
  float tmask = mtl.a;
#ifdef CITY
  float cWet = vCityFlag.x;
  float cWin = vCityFlag.y;
  float cInt = clamp(vCityHue.a, 0.0, 1.0);
  vec3 cHue = cInt > 0.0 ? kSrgbToLin(vCityHue.rgb) : vec3(0.0);
  float cDamp = 0.0;
  float cPud = 0.0;
  float cWinLit = 0.0;
  if (cWet > 0.5 && uWet > 0.001) {
    cDamp = smoothstep(0.0, 0.5, uWet);
#ifdef CITY_PUDDLE
    float pn = kVnoise(vWorld.xz * 0.23) * 0.55 + kVnoise(vWorld.xz * 0.61 + 3.1) * 0.3 + kVnoise(vWorld.xz * 1.7 + 9.2) * 0.15;
    float pthr = 1.0 - uWet * 0.85;
    cPud = smoothstep(pthr, pthr + 0.14, pn + (0.9 - rough) * 0.4) * smoothstep(0.25, 0.75, uWet);
#endif
    rough = mix(rough, 0.15, cDamp);
    rough = mix(rough, 0.03, cPud);
  }
  if (cWin > 0.5) {
    float thr = vCityHue.r;
    cWinLit = smoothstep(thr - 0.08, thr + 0.08, uNeon.x);
#ifdef CITY_WINDOW_A_OFF
    if (thr < 0.35) cWinLit = 0.0;
#endif
    emis *= cWinLit * uNeon.w * 0.72;
#ifdef CITY_LDR
    emis *= 0.62; // düşük kademe: bloom yok → doğrudan ton eşleme HDR'ı beyazlatır; pencere emisyonu LDR'a yakın tutulur
#endif
  } else {
    emis *= mix(1.0, uNeon.y, smoothstep(0.55, 0.8, emis));
#ifdef CITY_LDR
    emis *= 0.85;
#endif
  }
#endif

  if (kind == 2) {
    vec4 tex2 = textureGrad(uMap, uv2, dUvx, dUvy);
    vec4 mtl2 = textureGrad(uMaterialMap, uv2, dUvx, dUvy);
    tex.rgb = mix(tex.rgb, tex2.rgb, 0.5) * 1.05;
    emis = max(emis, mtl2.g) * 0.5 + 0.5 * min(emis, mtl2.g) + 0.15;
  }

#if PASS == 1
  {
    float aw = max(fwidth(tex.a), 0.0001);
    float asharp = clamp((tex.a - 0.5) / aw + 0.5, 0.0, 1.0);
    if (asharp < 0.5) discard;
  }
#endif

  // Normal
  vec3 N = Ng;
#ifdef USE_NORMAL_MAP
  if (!soft && kind != 1 && kind != 2) {
    vec3 tn = textureGrad(uNormalMap, uv, dUvx, dUvy).xyz * 2.0 - 1.0;
    float nf = (1.0 - smoothstep(22.0, 70.0, dist)) * uNormalStrength;
    tn = normalize(vec3(tn.xy * nf, max(tn.z, 0.2)));
    N = kPerturb(Ng, vWorld, vUv, tn);
  }
#endif

  // Albedo: ton maskesi ile biyom tonu + AO (vColor.rgb = ton×AO, a = AO)
  vec3 tintMix = mix(vec3(vColor.a), vColor.rgb, tmask);
  vec3 albedo = tex.rgb * tintMix;
#ifdef CITY
  albedo *= mix(1.0, 0.55, cDamp) * mix(1.0, 0.8, cPud);
  if (cWin > 0.5) albedo *= mix(0.3, 1.0, cWinLit);
#endif

  // Işık
  float skyC = kCurveSky(vLight.x);
  float blkC = kCurveBlock(vLight.y);
  float ndl = max(dot(N, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  float skyAmt = skyC * uSkyLight;
  vec3 skyLit = (uAmbientColor * (0.35 + 0.65 * hemi) + uSunColor * ndl) * skyAmt;
  vec3 blkCol = uBlockLightColor;
#ifdef CITY
  if (cInt > 0.0) blkCol = mix(blkCol, cHue * 1.3, clamp(cInt * 1.15, 0.0, 1.0) * clamp(uNeon.y, 0.0, 1.0) * 0.8);
#endif
  vec3 blkLit = blkCol * blkC * (0.82 + 0.18 * N.y);
#ifdef CITY
  blkLit *= 1.0 + 0.4 * cDamp + 1.2 * cPud;
#endif
  float cavity = mix(1.0, cav, 0.9);
  float bumpShade = mix(0.78, 1.0, clamp(dot(N, Ng), 0.0, 1.0));
  vec3 lighting = (skyLit * bumpShade + blkLit) * cavity + vec3(uMinLight);

  vec3 col = albedo * lighting;
  float alpha = 1.0;
#if PASS == 2
  alpha = tex.a;
#endif

  // Yansıma (parlak yüzeyler): güneş vurgusu + Fresnel gökyüzü
#ifdef HIGH_DETAIL
  {
    float gloss = 1.0 - rough;
    if (gloss > 0.2 && kind != 1) {
      vec3 H = normalize(uSunDir + V);
      float spec = pow(max(dot(N, H), 0.0), mix(8.0, 220.0, gloss)) * gloss * gloss;
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0) * gloss;
      col += uSunColor * spec * 1.6 * skyAmt * step(0.0, ndl);
      col += uHorizonColor * fres * 0.55 * skyAmt;
    }
  }
#endif

  // Emisyon (ışıktan bağımsız; HDR → bloom). Işıklı bloklar akşam/gece daha belirgin.
  float pulse = 1.0;
  if (kind == 7) {
    pulse = 0.82 + 0.18 * sin(t * 2.6 + vWorld.x * 1.3 + vWorld.z * 0.7 + vWorld.y * 0.9) * uMotion
          + 0.06 * sin(t * 9.0 + vWorld.x * 3.1 + vWorld.z * 2.3) * uMotion;
  }
  float nightBoost = 1.0 + (1.0 - uSkyLight) * 0.6;
  col += tex.rgb * emis * uEmission * pulse * nightBoost;
#ifdef CITY
  if (cDamp > 0.0) {
    // ıslak yol: Fresnel gökyüzü yansıması + neon yansıma çizgileri + (yüksek kademe) yağmur halkaları
    vec3 Nr = normalize(mix(N, Ng, cPud));
    vec3 rp = vec3(0.0);
#ifdef CITY_RINGS
    {
      rp = kRipples(vWorld.xz, t, clamp(uRain, 0.0, 1.0)) * uMotion * cPud;
      float shimmer = (kVnoise(vWorld.xz * 2.7 + t * 0.5 * uMotion) - 0.5) * 0.06 * cPud;
      Nr = normalize(Nr + vec3(rp.y * 0.9 + shimmer, 0.0, rp.z * 0.9 - shimmer));
    }
#endif
    float fq = 1.0 - clamp(dot(Nr, V), 0.0, 1.0);
    float fresW = 0.05 + 0.95 * fq * fq * fq;
    vec3 Rv = reflect(-V, Nr);
    vec3 skyR = mix(uHorizonColor, uSkyColor, clamp(Rv.y * 1.2, 0.0, 1.0)) * (0.12 + 0.88 * uSkyLight);
    float wetW = cDamp * 0.3 + cPud * 0.7;
    col += skyR * (fresW * (0.55 + 0.45 * cPud) + 0.05 * wetW) * wetW * skyC;
    // şehir ışıkları: yakın neon ipucu (aCity) + görüş yönünde uzayan, neon tonlu çizgiler (planar ayna yok; çizgi sütunları kümeleme tohumlu)
    vec2 rel = vWorld.xz - cameraPosition.xz + rp.yz * 0.6;
    float dist = max(length(rel), 0.5);
    float ang = atan(rel.y, rel.x) * 57.29578;
    float sq = dist / 20.0;
    float s0 = floor(sq);
    float sf = smoothstep(0.35, 0.65, fract(sq));
    vec3 h0;
    vec3 h1;
    float k0 = kStreak(ang, s0, h0);
    float k1 = kStreak(ang, s0 + 1.0, h1);
    float body = 0.35 + 0.65 * kVnoise(vec2(ang * 0.3, dist * 0.11 + t * 0.12 * uMotion));
    vec3 lines = (h0 * k0 * (1.0 - sf) + h1 * k1 * sf) * body;
    lines = mix(lines, vec3(dot(lines, vec3(0.34))), 0.22) * smoothstep(5.0, 24.0, dist);
    vec3 hint = cHue * cInt * (0.25 + 0.75 * kVnoise(vec2(ang * 0.5, dist * 0.2))) * smoothstep(3.0, 14.0, dist);
    vec3 neonR = (lines * 1.15 + hint * 0.85) * uNeon.z * (0.1 + 1.1 * fresW) * (0.2 + 0.8 * cPud);
    col += neonR;
    col += (skyR * 1.4 + neonR * 0.6) * rp.x * 0.8;
  }
#endif

  // ---- Sıvılar -------------------------------------------------------------------------------------
  if (kind == 1) {
    float topFace = abs(Ng.y);
    vec3 Nw = Ng;
    if (topFace > 0.5) {
      Nw = kWaterNormal(vWorld.xz, t, (0.1 + 0.12 * uMotion) * (1.0 - smoothstep(30.0, 90.0, dist) * 0.7));
      if (Ng.y < 0.0) Nw = -Nw;
    }
    float depth = clamp(vParam.y, 0.0, 1.0);
    float foam = clamp(vParam.z, 0.0, 1.0);
    float fres = 0.03 + 0.97 * pow(1.0 - clamp(dot(Nw, V), 0.0, 1.0), 4.0);
    vec3 tint = vColor.rgb / max(vColor.a, 0.05);
    vec3 shallow = tint * (0.55 + 0.45 * tex.rgb);
    vec3 deep = tint * 0.28;
    vec3 base = mix(shallow, deep, smoothstep(0.0, 0.85, depth));
    float lightAmt = max(skyAmt, blkC * 0.9);
    // Kapalı mekânda (gökyüzü ışığı 0) su kendi başına parlamasın: taban aydınlık payı yalnız gökyüzü görünen suda vardır
    float waterFloor = 0.25 * skyC;
    vec3 wcol = base * (uAmbientColor * 0.7 + uSunColor * 0.5 * max(Nw.y, 0.0)) * (waterFloor + (1.0 - waterFloor) * lightAmt)
              + base * blkLit * 0.8;
    vec3 R = reflect(-V, Nw);
    vec3 sky = mix(uHorizonColor, uSkyColor, clamp(R.y, 0.0, 1.0));
    wcol = mix(wcol, sky * (0.06 + 0.94 * uSkyLight) * skyC, fres * 0.85);
    float glint = pow(max(dot(R, uSunDir), 0.0), 160.0) * skyAmt;
    wcol += uSunColor * glint * 3.0;
    // köpük: kıyıda hareketli şeritler
    float fn = sin(vWorld.x * 3.1 + t * 1.2 + sin(vWorld.z * 2.3 + t * 0.8) * 1.6) * 0.5 + 0.5;
    float fm = foam * smoothstep(0.25, 0.8, fn * 0.6 + foam * 0.55 + tex.a * 0.2);
    wcol = mix(wcol, vec3(0.92, 0.97, 1.0) * (0.3 * skyC + 0.7 * lightAmt + blkLit.r * 0.5), fm * 0.75);
    col = wcol;
    alpha = clamp(mix(0.5, 0.92, smoothstep(0.0, 0.7, depth)) + fres * 0.35 + fm * 0.4, 0.0, 0.97);
    if (Ng.y < -0.5) {
      // yüzeyi aşağıdan görürken: parlak "snell penceresi" ve koyu su
      col = mix(uUnderwaterColor * 1.4, sky * 0.9, pow(1.0 - clamp(dot(-Nw, V), 0.0, 1.0), 2.0) * 0.5);
      alpha = 0.78;
    }
  } else if (kind == 2) {
    // lav: kendi ışığı; hafif soluma
    float breathe = 0.9 + 0.1 * sin(t * 1.3 + vWorld.x * 0.8 + vWorld.z * 0.6) * uMotion;
    col = tex.rgb * (0.55 + 0.45 * emis) * breathe * 1.35 + tex.rgb * emis * uEmission * 0.7;
    col *= mix(0.65, 1.0, vColor.a);
  } else if (kind == 3) {
    // mühür bariyeri: yükselen dalga, kenar parlaması, uzaktan sis perdesi
    float wave = 0.5 + 0.5 * sin(vWorld.y * 1.2 - t * 1.6 + (vWorld.x + vWorld.z) * 0.4);
    float rim = pow(clamp(1.0 - abs(dot(Ng, V)), 0.0, 1.0), 2.0);
    vec3 sealCol = mix(tex.rgb, uSealColor, 0.35);
    col = sealCol * (0.5 + 0.5 * wave) + uSealColor * (0.25 + 0.45 * wave + rim * 0.7) * uEmission
        + sealCol * emis * uEmission * 1.4;
    alpha = clamp(tex.a * (0.8 + 0.3 * wave) + rim * 0.3 + smoothstep(40.0, 220.0, dist) * 0.25, 0.0, 0.9);
  } else if (kind == 4) {
    // portal: kendi rengi
    float rim = pow(clamp(1.0 - abs(dot(Ng, V)), 0.0, 1.0), 2.0);
    col = tex.rgb * (0.7 + 0.5 * uEmission) + tex.rgb * emis * uEmission * 1.3;
    alpha = clamp(tex.a + rim * 0.2, 0.0, 0.95);
  } else if (kind == 5 || kind == 6) {
#if PASS == 2
    float fresG = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    alpha = clamp(alpha + fresG * 0.35, 0.0, 0.96);
    col += uHorizonColor * fresG * 0.4 * (0.3 + 0.7 * uSkyLight) * skyC; // yansıyan gökyüzü: kapalı mekânda cam/buz kenarı parlamaz
#endif
  }

  // Su altı rengi + sis
  if (uUnderwater > 0.5) col *= vec3(0.55, 0.82, 1.0);
  float fogF = smoothstep(uFogNear, uFogFar, dist);
  // Erime bölgesinde sis tamamlanır: hayatta kalan parçalar zaten sis rengindedir; ekran-ızgarası eriyiğin açığa çıkardığı gökyüzü
  // (ufukta = sis rengi) ile fark kalmaz. (Eskiden fadeStart'ta sis ≈ %81'ti: akşam uzak yapı siluetinde açık benekli halka görünüyordu.)
  fogF = mix(fogF, 1.0, fadeK);
  // Sis hedefi görüş yönündeki gökyüzü gradyanıdır (sky shader'ı ile aynı: ufukta sis → yukarı ufuk→tepe). Sabit "ufuk" sisi
  // ufkun ÜSTÜNDEKİ uzak yapı/dağ siluetini gökyüzünden açık renkte bırakıyordu (akşam: şeftali silüet, pembe gökyüzü).
  vec3 fogCol = uFogColor;
  if (uUnderwater < 0.5) {
    float fe = -V.y;
    vec3 fup = mix(uHorizonColor, uSkyColor, pow(clamp(fe, 0.0, 1.0), 0.52));
    fogCol = mix(uFogColor, fup, smoothstep(0.0, 0.34, fe));
  }
  col = mix(col, fogCol, fogF);
#if PASS == 2
  alpha *= 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
#endif

  col = kSafeColor(col);
  alpha = alpha >= 0.0 ? min(alpha, 1.0) : 0.0;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
