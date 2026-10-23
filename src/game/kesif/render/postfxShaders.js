/*
 * KEŞİF render — post-fx shader kaynakları (GLSL ES 3.00; three r186 ShaderMaterial önekiyle derlenir).
 *
 * Bloom: "çift filtre" (dual-Kawase) — HDR sahne dokusu yarıya, dörde… indirilir (ilk indirmede yumuşak-diz eşikli
 * parlak-geçiş + ateş böceği kıskacı), sonra aynı zincirde toplamsal yükseltilir. UnrealBloomPass'e (5 ayrılabilir
 * gauss + 5 birleştirme geçişi) göre geçiş sayısı ve doku okuması çok daha azdır; mobil için seçilmesinin nedeni budur.
 * Birleştirme (composite): tek tam ekran geçişte bloom ekleme, renk derecelendirme, three tonemapping parçası,
 * vinyet/efektler (ton eşlemeden SONRA, ekran-doğrusal) ve renk uzayı dönüşümü (renderer.outputColorSpace).
 * Boyut geçişi: uWarp (0..1; yatay dilim kayması + RGB ayrışması + tarama çizgileri + mor-camgöbeği ton; yumuşak sinüsler → titreme/strobo YOK,
 * tek yönlü yükselip alçalır, tepe parlaklığı sahneyi aşmaz) ve uFade (0..1 siyaha karartma; reducedMotion'da warp yerine kullanılır).
 */

export const FS_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform float uPrefilter;
varying vec2 vUv;

// Geçersiz (NaN / eksi / sonsuz) HDR pikseli bloom'a GİRMEZ: eskiden min(NaN, 24) = 24 olup dev bir beyaz leke
// üretiyordu. Karşılaştırmalar NaN'da yanlış olduğundan "ok" testi NaN'ı da eler.
bool validHdr(vec3 c) {
  return c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1.0e4 && c.g < 1.0e4 && c.b < 1.0e4;
}

vec3 prefilter(vec3 c) {
  if (!validHdr(c)) return vec3(0.0);
  c = min(c, vec3(24.0));
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * contrib;
}

vec3 tap(vec2 uv) {
  vec3 c = texture2D(tSrc, uv).rgb;
  // Tek dönüş noktası: D3D11/ANGLE'da "potentially uninitialized variable (f_tap)" derleyici uyarısını önler.
  vec3 r = validHdr(c) ? c : vec3(0.0);
  if (uPrefilter > 0.5) r = prefilter(c);
  return r;
}

void main() {
  vec2 t = uTexel;
  vec3 sum = tap(vUv) * 4.0;
  sum += tap(vUv + vec2(-t.x, -t.y));
  sum += tap(vUv + vec2( t.x, -t.y));
  sum += tap(vUv + vec2(-t.x,  t.y));
  sum += tap(vUv + vec2( t.x,  t.y));
  gl_FragColor = vec4(sum * 0.125, 1.0);
}
`;

export const UP_FRAGMENT = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uScale;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * 0.5;
  vec3 sum = texture2D(tSrc, vUv + vec2(-t.x * 2.0, 0.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2(-t.x,  t.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2(0.0,  t.y * 2.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2( t.x,  t.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2( t.x * 2.0, 0.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2( t.x, -t.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2(0.0, -t.y * 2.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb * 2.0;
  gl_FragColor = vec4(sum * (uScale / 12.0), 1.0);
}
`;

export const COMPOSITE_FRAGMENT = /* glsl */ `
bool validHdr(vec3 c) {
  return c.r >= 0.0 && c.g >= 0.0 && c.b >= 0.0 && c.r < 1.0e4 && c.g < 1.0e4 && c.b < 1.0e4;
}
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uBloom;
uniform float uTime;
uniform float uUnder;
uniform float uHurt;
uniform float uHeal;
uniform float uBoss;
uniform float uSeal;
uniform float uVignette;
uniform float uExposure;
uniform float uSaturation;
uniform float uWobble;
uniform float uAspect;
uniform float uWarp;
uniform float uFade;
uniform vec4 uPhoto; // foto modu: x filtre dizini (0 yok), y filtre miktarı, z film greni, w gren tohumu (0 = sabit)
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = vUv;
  if (uUnder > 0.001) {
    uv += vec2(sin(uv.y * 22.0 + uTime * 2.1), cos(uv.x * 17.0 + uTime * 1.7)) * 0.0032 * uUnder * uWobble;
  }
  if (uWarp > 0.001) {
    // yatay dilim kayması (şerit başına yavaş sinüs; rastgele sıçrama yok) + merkeze doğru hafif çekilme
    float band = floor(uv.y * 30.0);
    float sh = sin(band * 1.7 + uTime * 3.2) * 0.5 + 0.5;
    float w2 = uWarp * uWarp;
    uv.x += (sh - 0.5) * 0.12 * w2;
    uv = 0.5 + (uv - 0.5) * (1.0 - 0.16 * w2);
  }
  vec3 col = texture2D(tScene, uv).rgb;
  if (uWarp > 0.001) {
    vec2 wo = vec2(0.012 * uWarp, 0.0);
    col = vec3(texture2D(tScene, uv + wo).r, col.g, texture2D(tScene, uv - wo).b);
  }
  if (!validHdr(col)) {
    // savunma: kaynakta üretilmiş olsa bile tek kötü piksel siyah nokta bırakmasın → geçerli komşuların ortalaması
    vec3 acc = vec3(0.0);
    float n = 0.0;
    vec3 a0 = texture2D(tScene, uv + vec2(uTexel.x, 0.0)).rgb;
    vec3 a1 = texture2D(tScene, uv - vec2(uTexel.x, 0.0)).rgb;
    vec3 a2 = texture2D(tScene, uv + vec2(0.0, uTexel.y)).rgb;
    vec3 a3 = texture2D(tScene, uv - vec2(0.0, uTexel.y)).rgb;
    if (validHdr(a0)) { acc += a0; n += 1.0; }
    if (validHdr(a1)) { acc += a1; n += 1.0; }
    if (validHdr(a2)) { acc += a2; n += 1.0; }
    if (validHdr(a3)) { acc += a3; n += 1.0; }
    col = n > 0.0 ? acc / n : vec3(0.0);
  }
  if (uUnder > 0.001) {
    vec2 o = uTexel * 2.2;
    vec3 b = texture2D(tScene, uv + vec2(o.x, 0.0)).rgb + texture2D(tScene, uv - vec2(o.x, 0.0)).rgb
           + texture2D(tScene, uv + vec2(0.0, o.y)).rgb + texture2D(tScene, uv - vec2(0.0, o.y)).rgb;
    col = mix(col, (col + b) * 0.2, 0.7 * uUnder);
  }
  vec3 bloom = texture2D(tBloom, uv).rgb;
  if (!validHdr(bloom)) bloom = vec3(0.0);
  col += bloom * uBloom;

  // renk derecelendirme (HDR, doğrusal)
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col *= uExposure;
  col *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.35, 1.6, l) * 0.55);
  col *= mix(vec3(1.0), vec3(0.93, 1.0, 1.09), (1.0 - smoothstep(0.0, 0.22, l)) * 0.45);
  if (uUnder > 0.001) {
    col *= mix(vec3(1.0), vec3(0.6, 0.86, 1.1), uUnder * 0.55);
    col += vec3(0.0, 0.012, 0.03) * uUnder;
  }
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>

  // ekran-doğrusal efektler
  vec3 c = gl_FragColor.rgb;
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(q) / (0.5 * sqrt(uAspect * uAspect + 1.0));
  float vig = 1.0 - smoothstep(0.55, 1.05, r);
  c *= mix(1.0, 0.35 + 0.65 * vig, uVignette);
  float edge = smoothstep(0.35, 1.0, r);
  c = mix(c, vec3(0.78, 0.03, 0.04), clamp(edge * uHurt * 0.85 + uHurt * 0.10, 0.0, 0.9));
  c += vec3(0.08, 0.5, 0.2) * edge * uHeal * 0.4;
  c = mix(c, c * vec3(0.78, 0.62, 0.95), uBoss * 0.28);
  c += vec3(0.24, 0.05, 0.4) * edge * uBoss * 0.5;
  c += vec3(0.4, 0.2, 0.9) * edge * uSeal * 0.34;
  if (uWarp > 0.001) {
    float w2 = uWarp * uWarp;
    c *= 1.0 - uWarp * 0.22 * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.3));
    c = mix(c, vec3(0.42, 0.3, 0.78) * (0.55 + 0.45 * smoothstep(0.0, 1.0, vUv.y)), w2 * 0.6);
  }
  if (uPhoto.x > 0.5) {
    // foto filtreleri (yalnız foto modunda; uPhoto.x = 0 iken dal atlanır)
    float pl = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 pf = c;
    if (uPhoto.x < 1.5) {
      // neon: yüksek doygunluk + gölgede camgöbeği, ışıkta pembe
      pf = mix(vec3(pl), c, 1.85) * mix(vec3(0.55, 0.95, 1.4), vec3(1.4, 0.78, 1.22), smoothstep(0.02, 0.45, pl));
    } else if (uPhoto.x < 2.5) {
      // gece sepyası: sıcak kahverengi tek ton
      pf = vec3(pl) * vec3(1.32, 0.8, 0.4) * 1.1;
    } else if (uPhoto.x < 3.5) {
      float g = clamp(pl, 0.0, 1.0);
      pf = vec3(mix(g, g * g * (3.0 - 2.0 * g), 0.5));
    } else if (uPhoto.x < 4.5) {
      // retro bant: soluk renk, mor/yeşil gölge kayması, tarama çizgileri
      pf = mix(vec3(pl), c, 0.55) * vec3(1.06, 0.94, 1.08) + vec3(0.045, 0.0, 0.07);
      pf *= 0.9 + 0.1 * sin(gl_FragCoord.y * 1.6);
    } else if (uPhoto.x < 5.5) {
      // pastel: yumuşak doygunluk, kalkık gölge, hafif pembe
      pf = pow(max(c, vec3(0.0)), vec3(0.78)) * vec3(1.06, 0.98, 1.08);
      pf = mix(vec3(dot(pf, vec3(0.2126, 0.7152, 0.0722))), pf, 0.82) + vec3(0.03, 0.02, 0.04);
    } else {
      // yağmur: soğuk mavi-gri
      pf = mix(vec3(pl), c, 0.55) * vec3(0.7, 0.88, 1.22) + vec3(0.0, 0.01, 0.035);
    }
    c = mix(c, pf, clamp(uPhoto.y, 0.0, 1.0));
  }
  if (uPhoto.z > 0.001) c += (hash21(gl_FragCoord.xy + uPhoto.w * 37.0) - 0.5) * uPhoto.z * 0.35;
  c = mix(c, vec3(0.0), clamp(uFade, 0.0, 1.0));
  c += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * (1.0 / 255.0);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;
