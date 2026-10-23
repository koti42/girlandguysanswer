/*
 * KEŞİF render — parçacık shader'ları (WebGL2, three ShaderMaterial).
 *
 * Her parçacık bir örnek (instance): konumu GPU'da doğuş verisinden hesaplanır (balistik + sürtünme, yerçekimi,
 * dönme, türbülans ya da yörünge), böylece CPU yalnızca doğuşta yazar. Dört köşeli, kameraya dönük (veya
 * yere/duvara yatık) levhalar; tür numarası parçanın biçimini seçer:
 *   0 yumuşak ışıma, 1 kıvılcım (hız yönünde uzar), 2 halka, 3 kırıntı (kare), 4 duman, 5 kalp, 6 yıldız parıltısı, 7 ışık zerresi.
 *
 * Nitelikler: aStart(xyz doğuş konumu, w doğuş zamanı) aVel(xyz ilk hız, w ömür) aParam(boyut0, boyut1, yerçekimi, sürtünme)
 *             aCol0/aCol1(rgba başlangıç/son) aMisc(tür, dönme|titreme hızı, tohum, mod) aExtra(türbülans, frekans, girdap/açısal hız, bitiş yarıçapı)
 * mod: 0..3 halka yönü (Y, X, Z normal, 3 = kameraya dönük); +4 = yörünge modu (aVel.x r0, aVel.y yükselme, aVel.z faz).
 */
export const PARTICLE_VERT = /* glsl */`
attribute vec4 aStart;
attribute vec4 aVel;
attribute vec4 aParam;
attribute vec4 aCol0;
attribute vec4 aCol1;
attribute vec4 aMisc;
attribute vec4 aExtra;
uniform float uTime;
uniform float uCalm;
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vSeed;
varying float vU;

void main() {
  float age = uTime - aStart.w;
  float life = aVel.w;
  vUv = vec2(0.0);
  vCol = vec4(0.0);
  vKind = 0.0;
  vSeed = 0.0;
  vU = 0.0;
  if (age < 0.0 || age >= life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float u = age / life;
  float kind = aMisc.x;
  float seed = aMisc.z;
  float mode = aMisc.w;
  bool orbit = mode >= 4.0;
  float orient = orbit ? mode - 4.0 : mode;
  vec3 wp;
  vec3 vel = vec3(0.0);
  if (orbit) {
    float ang = aVel.z + aExtra.z * age;
    float e = u * u * (3.0 - 2.0 * u);
    float r = mix(aVel.x, aExtra.w, e);
    float h = aVel.y * age;
    vec3 loc;
    if (orient < 0.5) loc = vec3(cos(ang) * r, h, sin(ang) * r);
    else if (orient < 1.5) loc = vec3(h, cos(ang) * r, sin(ang) * r);
    else loc = vec3(cos(ang) * r, sin(ang) * r, h);
    wp = aStart.xyz + loc;
  } else {
    float k = max(aParam.w, 0.01);
    float ek = exp(-k * age);
    float D = (1.0 - ek) / k;
    float G = (age - D) / k;
    vec3 d = aVel.xyz * D + vec3(0.0, aParam.z, 0.0) * G;
    if (aExtra.z != 0.0) {
      float a = aExtra.z * age;
      float c = cos(a);
      float s = sin(a);
      d.xz = vec2(c * d.x - s * d.z, s * d.x + c * d.z);
    }
    wp = aStart.xyz + d;
    vel = aVel.xyz * ek + vec3(0.0, aParam.z, 0.0) * ((1.0 - ek) / k);
  }
  float amp = aExtra.x * (1.0 - 0.75 * uCalm) * min(age * 2.0, 1.0);
  if (amp > 0.0) {
    float f = aExtra.y;
    wp += amp * vec3(sin(age * f + seed * 17.0), sin(age * f * 1.31 + seed * 31.0) * 0.7, cos(age * f * 0.87 + seed * 7.0));
  }
  float size = mix(aParam.x, aParam.y, u * (2.0 - u));
  vec4 col = mix(aCol0, aCol1, u);
  float fade = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.75, 1.0, u));
  col.a *= fade;
  if (kind > 5.5) {
    float tw = 0.7 + 0.3 * sin(age * aMisc.y + seed * 40.0);
    col.a *= mix(tw, 1.0, uCalm);
  }
  float rot = aMisc.y * age * (1.0 - 0.85 * uCalm) + seed * 6.2831853;
  if (kind > 4.5 && kind < 5.5) rot = sin(age * 2.5 + seed * 20.0) * 0.28 * (1.0 - 0.8 * uCalm);
  vec2 c = position.xy;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float dist = length(mv.xyz);
  col.a *= smoothstep(0.3, 1.1, dist);
  if (kind > 0.5 && kind < 1.5) {
    vec2 sd = (viewMatrix * vec4(vel, 0.0)).xy;
    float sl = length(sd);
    vec2 dir = sl > 0.001 ? sd / sl : vec2(0.0, 1.0);
    float stretch = 1.0 + clamp(sl * 0.1, 0.0, 4.0);
    vec2 perp = vec2(-dir.y, dir.x);
    mv.xy += dir * c.y * size * stretch + perp * c.x * size * 0.28;
  } else if (kind > 1.5 && kind < 2.5) {
    if (orient > 2.5) {
      mv.xy += c * size;
    } else {
      vec3 n = orient < 0.5 ? vec3(0.0, 1.0, 0.0) : (orient < 1.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0));
      vec3 a = orient < 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 t1 = normalize(cross(n, a));
      vec3 t2 = cross(n, t1);
      mv = viewMatrix * vec4(wp + (t1 * c.x + t2 * c.y) * size, 1.0);
    }
  } else {
    float cr = cos(rot);
    float sr = sin(rot);
    mv.xy += vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y) * size;
  }
  vUv = c;
  vCol = col;
  vKind = kind;
  vSeed = seed;
  vU = u;
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vSeed;
varying float vU;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  float r2 = dot(vUv, vUv);
  float r = sqrt(r2);
  float a = 0.0;
  vec3 col = vCol.rgb;
  float kind = vKind;
  if (kind < 0.5) {
    float g = max(1.0 - r, 0.0);
    a = g * g;
    col *= 1.0 + exp(-r2 * 8.0) * 1.2;
  } else if (kind < 1.5) {
    float ax = abs(vUv.x);
    float ay = abs(vUv.y);
    a = (1.0 - smoothstep(0.0, 1.0, ay)) * (1.0 - smoothstep(0.1, 1.0, ax));
    a *= a;
    col *= 1.6;
  } else if (kind < 2.5) {
    float inner = mix(0.8, 0.92, vU);
    a = smoothstep(inner - 0.14, inner, r) * (1.0 - smoothstep(0.95, 1.0, r));
    col *= 1.3;
  } else if (kind < 3.5) {
    float m = max(abs(vUv.x), abs(vUv.y));
    if (m > 0.86) discard;
    a = 1.0;
    col *= 0.7 + 0.4 * (1.0 - m) + 0.12 * (vUv.x - vUv.y);
  } else if (kind < 4.5) {
    float n = vnoise(vUv * 2.6 + vSeed * 13.0);
    a = pow(max(1.0 - r, 0.0), 1.5) * (0.6 + 0.4 * n);
  } else if (kind < 5.5) {
    vec2 p = vec2(vUv.x, vUv.y + 0.1) * 1.25;
    float q = p.x * p.x + p.y * p.y - 1.0;
    float f = q * q * q - p.x * p.x * p.y * p.y * p.y;
    a = 1.0 - smoothstep(-0.02, 0.12, f);
    col *= 0.85 + 0.25 * (1.0 - r);
  } else if (kind < 6.5) {
    float cx = max(0.0, 1.0 - abs(vUv.x) * 7.0) * (1.0 - abs(vUv.y));
    float cy = max(0.0, 1.0 - abs(vUv.y) * 7.0) * (1.0 - abs(vUv.x));
    a = clamp(cx + cy + exp(-r2 * 12.0), 0.0, 1.0);
    col *= 1.4;
  } else {
    a = exp(-r2 * 9.0) + 0.16 * max(1.0 - r, 0.0);
    col *= 1.3;
  }
  a *= vCol.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;
