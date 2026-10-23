/*
 * KEŞİF render — gökyüzü shader kaynakları (GLSL ES 3.00; three r186 ShaderMaterial önekiyle derlenir).
 *
 * Kubbe tek bir birim küredir; konum ATILIR, yalnız görünüm matrisinin dönüşü uygulanır ve gl_Position.z = w yapılır
 * (derinlik 1.0): kubbe opak sırada en sonda çizilir, arazinin örttüğü pikseller erken derinlik testiyle elenir ve kamera
 * far düzlemi gökyüzünü kesmez. Bulutlar kubbe fragment'inde kamera-ışını/bulut-düzlemi kesişimiyle (fbm) hesaplanır.
 * Tüm renk uniform'ları DOĞRUSAL uzaydadır; çıktıda three'nin tonemapping/colorspace parçaları kullanılır
 * (post-fx hedefinde no-op, doğrudan çizimde renderer ayarlarına uyar).
 *
 * Tanımlar: CLOUD_OCT (2..5 fbm katmanı), CLOUD_SHADE (0/1 güneşe doğru gölge örneği), CLOUD_CIRRUS (0/1 ince üst katman).
 * Şehir: uCityGlow (doğrusal rgb; ana diyarda 0 → çıktı değişmez) ufuk boyunca gece şehir parıltısı bandı ekler.
 */

export const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uTop;
uniform vec3 uHor;
uniform vec3 uFog;
uniform vec3 uSunCol;
uniform vec3 uAmbient;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uMoonL;
uniform vec3 uAuroraCol;
uniform vec3 uAuroraCol2;
uniform vec2 uCamXZ;
uniform vec2 uCloudOff;
uniform float uDay;
uniform float uCover;
uniform float uCloudDark;
uniform float uCloudH;
uniform float uTime;
uniform float uAurora;
uniform float uMotion;
uniform float uSunVis;
uniform float uMoonVis;
uniform vec3 uCityGlow;

varying vec3 vDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int oct) {
  float a = 0.5;
  float s = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < CLOUD_OCT; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = m * p + 3.7;
    a *= 0.5;
  }
  return s;
}

float cloudThreshold() {
  return mix(0.66, 0.30, pow(clamp(uCover, 0.0, 1.0), 0.65));
}

float fbm3(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.07 + 5.3;
    a *= 0.5;
  }
  return s;
}

vec3 aurora(vec3 dir, float night) {
  float e = dir.y;
  vec2 ap = dir.xz / (e + 0.32) * 0.85;
  float t = uTime * 0.045 * uMotion;
  float n = fbm3(ap * vec2(1.1, 0.55) + vec2(t, -t * 0.7));
  float curtain = smoothstep(0.42, 0.78, n);
  float vert = smoothstep(0.05, 0.26, e) * (1.0 - smoothstep(0.40, 0.80, e));
  float rays = 0.72 + 0.28 * vnoise(vec2(ap.x * 11.0 + n * 3.0, t * 2.0));
  vec3 c = mix(uAuroraCol, uAuroraCol2, smoothstep(0.1, 0.7, e + n * 0.25));
  return c * curtain * vert * rays * uAurora * night * 0.85;
}

void main() {
  vec3 dir = normalize(vDir);
  float e = dir.y;

  // --- gradyan: ufukta sis rengi (arazi sisiyle dikişsiz), yukarı ufuk → tepe ---
  float h = clamp(e, 0.0, 1.0);
  vec3 upper = mix(uHor, uTop, pow(h, 0.52));
  vec3 col = mix(uFog, upper, smoothstep(0.0, 0.34, e));

  // --- ufuk parıltısı (güneş/ay yönünde, alçak güneşte güçlü) ---
  float sd = dot(dir, uSunDir);
  float lowSun = 1.0 - smoothstep(0.05, 0.6, abs(uSunDir.y));
  float glowH = exp(-max(e, 0.0) * 5.5);
  col += uSunCol * pow(max(sd, 0.0), 6.0) * glowH * (0.18 + 0.9 * lowSun) * uSunVis;
  col += uSunCol * pow(max(sd, 0.0), 2.0) * glowH * 0.06 * lowSun * uSunVis;
  // zıt yönde sönük "toprak gölgesi" mor bandı (alacakaranlıkta derinlik)
  float anti = pow(max(-sd, 0.0), 2.0) * glowH * lowSun * 0.08;
  col += uHor * vec3(0.7, 0.5, 0.9) * anti;

  // --- şehir parıltısı (Neon Meridyen: gece ufku boyunca macenta/camgöbeği band; ana diyarda uCityGlow = 0) ---
  if (uCityGlow.r + uCityGlow.g + uCityGlow.b > 0.0) {
    float band = exp(-max(e, 0.0) * 5.5) * smoothstep(-0.12, 0.02, e);
    float sway = 0.75 + 0.25 * vnoise(vec2(atan(dir.x, dir.z) * 3.0, uTime * 0.02 * uMotion));
    col += uCityGlow * band * sway;
  }

  // --- aurora ---
  if (uAurora > 0.01 && e > 0.04) col += aurora(dir, 1.0 - uDay);

  // --- bulutlar ---
  float cd = 0.0;
  vec3 ccol = vec3(0.0);
  if (e > 0.012 && uCloudH > 4.0 && uCover > 0.001) {
    float t = uCloudH / e;
    vec2 wp = uCamXZ + dir.xz * t;
    vec2 p = wp * 0.0085 + uCloudOff;
    float th = cloudThreshold();
    float f0 = fbm(p, CLOUD_OCT);
    float d0 = smoothstep(th, th + 0.13, f0);
    float fade = smoothstep(0.012, 0.15, e);
    if (d0 > 0.002) {
      float thick = clamp((f0 - th) * 2.4, 0.0, 1.0);
      float lightAmt = 0.72 - 0.5 * thick;
#if CLOUD_SHADE
      vec2 sdir = normalize(uSunDir.xz + vec2(1e-4, 1e-4));
      float f1 = fbm(p + sdir * 0.05, CLOUD_OCT);
      float f2 = fbm(p + sdir * 0.12, CLOUD_OCT);
      float occ = clamp((f1 - f0) * 3.2 + (f2 - f0) * 1.6, -1.0, 1.0);
      lightAmt = clamp(lightAmt - occ * 0.55 + 0.08, 0.0, 1.0);
#endif
      float lowSun = 1.0 - smoothstep(0.05, 0.6, abs(uSunDir.y));
      vec3 sunTint = uSunCol * (0.75 + 0.9 * lowSun) * uSunVis;
      vec3 litCol = sunTint * (0.9 + 0.3 * (1.0 - thick)) + uAmbient * 0.75;
      vec3 darkCol = mix(uHor, uAmbient, 0.5) * (0.30 + 0.22 * uDay) * (1.0 - uCover * 0.35) + uAmbient * 0.12;
      ccol = mix(darkCol, litCol, lightAmt);
      // gümüş kenar: ince bulut kenarları güneşe bakarken parlar
      float rim = (1.0 - thick) * (1.0 - thick) * pow(max(sd, 0.0), 2.5) * uSunVis;
      ccol += uSunCol * rim * 1.1;
      // ay ışığı
      ccol += vec3(0.5, 0.58, 0.8) * 0.2 * uMoonVis * (1.0 - uDay) * (0.5 + 0.5 * lightAmt);
      ccol *= 1.0 - uCloudDark;
      float storm = clamp(uCover * 1.3 - 0.3, 0.0, 1.0);
      ccol *= 1.0 - storm * (0.1 + 0.45 * thick) - storm * 0.2 * vnoise(p * 3.7 + 9.0);
      // uzakta ufuk sisine karışır
      ccol = mix(uFog, ccol, 0.35 + 0.65 * fade);
      cd = d0 * fade;
    }
#if CLOUD_CIRRUS
    {
      float tc = (uCloudH * 2.4 + 80.0) / e;
      vec2 cp = (uCamXZ + dir.xz * tc) * vec2(0.0022, 0.0075) + uCloudOff * 0.6 + vec2(11.0, 3.0);
      float cf = vnoise(cp) * 0.6 + vnoise(cp * 2.1) * 0.4;
      float ci = smoothstep(0.55, 0.9, cf) * 0.22 * smoothstep(0.02, 0.22, e) * (1.0 - uCover * 0.6);
      vec3 cc = uSunCol * (0.4 + 0.5 * pow(max(sd, 0.0), 2.0)) * uSunVis + uAmbient * 0.6;
      col = mix(col, cc, ci * (0.4 + 0.6 * uDay));
    }
#endif
  }
  col = mix(col, ccol, clamp(cd, 0.0, 1.0) * 0.96);

  // --- güneş ---
  {
    float disc = smoothstep(0.99918, 0.99945, sd);
    float halo = pow(max(sd, 0.0), 220.0) * 1.1 + pow(max(sd, 0.0), 30.0) * 0.22 + pow(max(sd, 0.0), 6.0) * 0.07;
    float occl = 1.0 - clamp(cd * 0.92, 0.0, 1.0);
    float vis = uSunVis * smoothstep(-0.015, 0.02, e) * occl;
    vec3 sc = mix(uSunCol, vec3(1.0, 0.97, 0.9), 0.4);
    col += sc * (disc * 14.0 + halo * 1.4) * vis;
  }

  // --- ay (evre + yüzey lekeleri) ---
  {
    float md = dot(dir, uMoonDir);
    float vis = uMoonVis * smoothstep(-0.015, 0.02, e);
    if (vis > 0.001 && md > 0.995) {
      vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
      vec3 mu = cross(uMoonDir, mr);
      float radius = 0.0405;
      vec2 q = vec2(dot(dir, mr), dot(dir, mu)) / radius;
      float r2 = dot(q, q);
      float occl = 1.0 - clamp(cd * 0.95, 0.0, 1.0);
      if (r2 < 1.0) {
        vec3 n = vec3(q, sqrt(1.0 - r2));
        float lit = smoothstep(-0.04, 0.08, dot(n, uMoonL));
        float tex = 0.72 + 0.28 * vnoise(q * 5.0 + 7.0) + 0.16 * vnoise(q * 13.0);
        float maria = smoothstep(0.35, 0.65, vnoise(q * 2.2 + 1.7));
        vec3 surf = mix(vec3(0.9, 0.92, 1.0), vec3(0.55, 0.6, 0.72), maria * 0.6) * tex;
        float edge = smoothstep(1.0, 0.94, sqrt(r2));
        vec3 mc = surf * (0.05 + 1.5 * lit);
        col = mix(col, mc, edge * vis * occl);
      }
    }
    float mh = pow(max(md, 0.0), 80.0) * 0.1 + pow(max(md, 0.0), 12.0) * 0.03;
    col += vec3(0.55, 0.62, 0.9) * mh * vis * (1.0 - clamp(cd, 0.0, 1.0));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const STAR_VERTEX = /* glsl */ `
attribute vec4 aStar; // x boyut, y evre, z parlaklık, w renk sıcaklığı
uniform mat3 uRot;
uniform float uTime;
uniform float uPx;
uniform float uStarAlpha;
uniform float uCover;
uniform float uMotion;
varying float vA;
varying vec3 vTint;
void main() {
  vec3 d = uRot * position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * d, 1.0);
  gl_Position = p.xyww;
  float tw = 0.78 + 0.22 * sin(uTime * (1.6 + aStar.y * 2.2) + aStar.y * 40.0) * uMotion + 0.22 * (1.0 - uMotion);
  float hor = smoothstep(0.02, 0.2, d.y);
  vA = uStarAlpha * aStar.z * tw * hor * (1.0 - uCover * 0.75);
  vTint = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.9, 0.74), aStar.w);
  gl_PointSize = max(1.0, aStar.x * uPx);
}
`;

export const STAR_FRAGMENT = /* glsl */ `
varying float vA;
varying vec3 vTint;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vTint * a * 1.6, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
