/*
 * KEŞİF render/city — uzak siluet (skylineImpostor) shader kaynakları (GLSL ES 3.00; three r186 ShaderMaterial önekiyle derlenir).
 *
 * Tek InstancedMesh (≤600 kutu, TEK çizim çağrısı). Örnek öznitelikleri: aBoxA = (merkez x, merkez z, genişlik, derinlik),
 * aBoxB = (taban y, yükseklik, tohum 0..1, neon ton 0..3). Chunk malzemesiyle AYNI uniform nesnelerini paylaşır (sis/gökyüzü/ışık/uNeon);
 * ek uniform: uFarClip (kamera far düzlemi; onBeforeRender yazar).
 *
 *  - Köşe: kamera far düzlemini aşan kutular far'ın içine IŞIN BOYUNCA sıkıştırılır (ekran konumu değişmez, derinlik tekdüze kalır);
 *    böylece kamera far değeri ne olursa olsun (şehirde 1600) siluet kesilmez.
 *  - Parça: yakın kesim (uFadeEnd) içindeki parçalar atılır — orada gerçek chunk'lar vardır (gerçek parçalar uFadeEnd ötesinde zaten eriyip atılır,
 *    sis rengine tamamlanmıştır → dikişsiz; aynı düzlemde z-çakışması olmaz). Cephe: koyu panel,
 *    pencere ızgarası (4×4 hücre; grup eşikleri 0,2/0,5/0,8 = chunk shader ile aynı kWindowLit), kat şeritlerinde neon bant, taçta neon çizgi.
 *    Yeterince uzakta pencere deseni piksel altına inerse ortalama renge geçer (parıltı/aliasing yok).
 *  - Sis: yakın kesimde chunk sisiyle AYNI eğri (kesim çizgisinde süreksizlik yok); ötesinde yüksek kısımlar sis katmanının üstüne çıkar
 *    (silüet), çok uzakta tekrar sise karışır ("sisin içinde sönen" siluet). Pencere/neon ışığı sisten daha az etkilenir.
 */
import { WINDOW_GROUP_GLSL } from '../../sim/cityData.js';

export const SKYLINE_VERTEX = /* glsl */ `
attribute vec4 aBoxA;
attribute vec4 aBoxB;
uniform float uFarClip;
varying vec3 vWorldP;
varying vec3 vN;
varying float vDist;
varying float vSeed;
varying float vHue;
varying float vTopK;

void main() {
  vec3 wp = vec3(aBoxA.x + position.x * aBoxA.z, aBoxB.x + (position.y + 0.5) * aBoxB.y, aBoxA.y + position.z * aBoxA.w);
  vWorldP = wp;
  vN = normal;
  vSeed = aBoxB.z;
  vHue = aBoxB.w;
  vTopK = position.y + 0.5;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float r = length(mv.xyz);
  vDist = r;
  float far = max(uFarClip, 64.0);
  float r0 = far * 0.55;
  if (r > r0) {
    float rm = far * 0.985;
    float rr = r0 + (rm - r0) * (1.0 - exp(-(r - r0) / (far * 0.5)));
    mv.xyz *= rr / max(r, 1.0e-3);
  }
  gl_Position = projectionMatrix * mv;
}
`;

export const SKYLINE_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec4 uNeon;
uniform float uTime;
uniform float uMotion;
uniform float uSkyLight;
uniform vec3 uAmbientColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFadeEnd;
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
uniform float uSkylineWindowA;

varying vec3 vWorldP;
varying vec3 vN;
varying float vDist;
varying float vSeed;
varying float vHue;
varying float vTopK;
${WINDOW_GROUP_GLSL}

float sHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 sNeonHue(float h) {
  int i = int(floor(h + 0.5));
  if (i == 0) return vec3(0.02, 0.8, 1.0);
  if (i == 1) return vec3(1.0, 0.1, 0.55);
  if (i == 2) return vec3(1.0, 0.45, 0.04);
  return vec3(0.5, 1.0, 0.1);
}

vec3 sSafe(vec3 c) {
  bool ok = c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1.0e5 && c.g < 1.0e5 && c.b < 1.0e5;
  return ok ? min(c, vec3(32.0)) : vec3(0.0);
}

void main() {
  if (vDist < uFadeEnd) discard;
  vec3 N = normalize(vN);
  float top = N.y > 0.5 ? 1.0 : 0.0;
  float u = abs(N.x) > 0.5 ? vWorldP.z : vWorldP.x;
  float y = vWorldP.y;
  float isGround = vHue > 8.5 ? 1.0 : 0.0;

  // ---- cephe ----
  float panel = sHash(vec2(floor(u / 12.0) + vSeed * 91.0, floor(y / 24.0)));
  vec3 base = mix(vec3(0.05, 0.06, 0.08), vec3(0.14, 0.15, 0.18), panel * 0.6 + vSeed * 0.3);
  vec2 cell = vec2(floor(u / 4.0), floor(y / 4.0));
  vec2 loc = vec2(fract(u / 4.0), fract(y / 4.0));
  float inWin = step(0.14, loc.x) * step(loc.x, 0.86) * step(0.3, loc.y) * step(loc.y, 0.84) * (1.0 - top);
  float h1 = sHash(cell + vec2(vSeed * 61.0, N.x * 7.0 + N.z * 13.0));
  float h2 = sHash(cell * 1.7 + vec2(3.1 + vSeed * 17.0, N.x * 5.0 - N.z * 11.0));
  float h3 = sHash(cell * 2.3 + vec2(vSeed * 29.0, 9.7));
  int grp = kWindowGroup(ivec3(int(cell.x), int(cell.y), int(vSeed * 4096.0)));
  float lit = h1 < 0.45 ? kWindowLit(uNeon.x, grp) : 0.0;
  if (grp == 0 && uSkylineWindowA < 0.5) lit = 0.0;
  vec3 warm = mix(vec3(1.0, 0.76, 0.4), vec3(0.62, 0.86, 1.0), step(0.65, h3));
  float flick = 1.0 - 0.1 * step(0.9, h2) * (0.5 + 0.5 * sin(uTime * 2.4 + h2 * 40.0)) * uMotion;
  vec3 winCol = warm * (1.1 + 0.5 * h2) * lit * flick * uNeon.w;

  // ölçek: pencere hücresi piksel altına inince ortalamaya geç
  float px = max(length(vec2(dFdx(u), dFdy(u))), length(vec2(dFdx(y), dFdy(y)))) / 4.0;
  float aa = smoothstep(0.25, 0.8, px);
  float winCover = 0.55 * 0.56;
  vec3 darkGlass = vec3(0.02, 0.03, 0.055) + uHorizonColor * 0.12;
  vec3 albedo = mix(base, darkGlass, inWin);
  albedo = mix(albedo, mix(base, darkGlass, winCover), aa);
  vec3 emis = winCol * inWin;
  emis = mix(emis, warm * (1.1 + 0.5 * 0.5) * 0.45 * winCover * uNeon.w * uNeon.x, aa);

  // neon bantlar: her 8 katta ince şerit (2 blok) + taçta çizgi
  vec3 hue = sNeonHue(vHue);
  float band = step(0.945, fract(y / 32.0)) * (1.0 - top);
  float crown = step(0.985, vTopK) * (1.0 - top);
  float rib = step(0.97, sHash(vec2(floor(u / 6.0) + vSeed * 13.0, 3.0))) * step(0.82, loc.x) * (1.0 - top) * step(0.4, vSeed);
  float neonMask = clamp(band * step(0.35, vSeed) + crown + rib, 0.0, 1.0);
  emis += hue * neonMask * 1.3 * uNeon.y;

  // zemin örneği (kutuların altındaki şehir zemini): koyu döşeme + yol bantları (80 blokta bir) + gece ışık sızıntısı
  if (isGround > 0.5) {
    vec2 g = abs(fract(vWorldP.xz / 80.0 + 0.5) - 0.5) * 80.0;
    float road = 1.0 - smoothstep(6.0, 7.5, min(g.x, g.y));
    float fw = max(fwidth(vWorldP.x), fwidth(vWorldP.z)) / 40.0;
    road = mix(road, 0.28, smoothstep(0.35, 0.9, fw));
    albedo = mix(vec3(0.05, 0.055, 0.075), vec3(0.022, 0.024, 0.032), road);
    vec2 sp = vWorldP.xz / 70.0;
    vec2 spi = floor(sp);
    vec2 spf = fract(sp);
    spf = spf * spf * (3.0 - 2.0 * spf);
    float spill = mix(mix(sHash(spi), sHash(spi + vec2(1.0, 0.0)), spf.x), mix(sHash(spi + vec2(0.0, 1.0)), sHash(spi + vec2(1.0, 1.0)), spf.x), spf.y);
    float pool = smoothstep(0.5, 0.95, spill);
    emis = sNeonHue(floor(sHash(spi) * 4.0)) * pool * 0.16 * uNeon.x * (1.0 - road * 0.5);
  }

  // ışık
  float ndl = max(dot(N, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 lighting = (uAmbientColor * (0.35 + 0.65 * hemi) + uSunColor * ndl) * uSkyLight + vec3(0.012);
  vec3 col = albedo * lighting;

  // ---- sis (hava perspektifi) ----
  vec3 V = normalize(cameraPosition - vWorldP);
  float fe = -V.y;
  vec3 fup = mix(uHorizonColor, uSkyColor, pow(clamp(fe, 0.0, 1.0), 0.52));
  vec3 fogCol = mix(uFogColor, fup, smoothstep(0.0, 0.34, fe));
  float baseF = smoothstep(uFogNear, uFogFar, vDist);
  float relief = smoothstep(uFadeEnd, uFadeEnd + 90.0, vDist);
  float hgt = smoothstep(70.0, 190.0, y);
  float target = clamp(0.9 - 0.62 * hgt + 0.2 * smoothstep(350.0, 1300.0, vDist), 0.2, 0.96);
  float f = mix(baseF, target, relief);
  col = mix(col, fogCol, f);
  col += emis * (1.0 - f * 0.72);
  gl_FragColor = vec4(sSafe(col), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
