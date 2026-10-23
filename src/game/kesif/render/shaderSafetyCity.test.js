/*
 * Şehir (Neon Meridyen) shader güvenliği — shaderSafety.test.js'in şehir uzantısı (o dosya değişmez).
 * GLSL burada çalıştırılamaz; kaynak sözleşmesini kilitler: negatif tabanlı pow yok, NaN kapıları, centroid, aCity "değer yok" nöbetçisi,
 * CITY tanımsızken ana diyar kaynağının şehir ifadelerinden arınmış olması, uniform/öznitelik adlarının tanımlı olması.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CHUNK_VERTEX, CHUNK_FRAGMENT } from './materialShaders.js';
import { SKY_FRAGMENT } from './skyShaders.js';
import { WEATHER_FRAG, WEATHER_VERT } from './weather.js';
import { COMPOSITE_FRAGMENT } from './postfxShaders.js';
import { SKYLINE_FRAGMENT, SKYLINE_VERTEX } from './city/skylineShaders.js';
import { HOLO_FRAGMENT } from './city/holoAds.js';
import { CITY_WEATHER_FRAGMENT, CITY_WEATHER_VERTEX } from './city/cityWeather.js';
import { createMaterialUniforms, createChunkMaterials } from './materials.js';
import { generateAtlasPixels, createAtlasTextures } from './atlas.js';
import { WINDOW_LIT_SOFT, WINDOW_GROUP_THRESHOLDS, WINDOW_GROUP_GLSL } from '../sim/cityData.js';
import { CITY_NOISE_SIZE, CITY_NOISE_CELL } from './city/cityNoise.js';

function powBases(src) {
  const out = [];
  let i = 0;
  for (;;) {
    i = src.indexOf('pow(', i);
    if (i < 0) break;
    let d = 1;
    let j = i + 4;
    const start = j;
    let comma = -1;
    while (j < src.length && d > 0) {
      const c = src[j];
      if (c === '(') d++;
      else if (c === ')') d--;
      else if (c === ',' && d === 1 && comma < 0) comma = j;
      j++;
    }
    out.push(src.slice(start, comma).trim());
    i = j;
  }
  return out;
}
const SAFE_BASE = /^(max|clamp|abs)\(|^1\.0 - clamp\(/;

/** #ifdef/#ifndef NAME … #endif bloklarını (iç içe dengeli) çıkarır; ana diyar derlemesinin "etkin" kaynağı. */
function stripIfdef(src, name) {
  const lines = src.split('\n');
  const out = [];
  let skip = 0;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (skip === 0 && (t === '#ifdef ' + name)) {
      skip = 1;
      depth = 1;
      continue;
    }
    if (skip) {
      if (/^#if(def|ndef)?\b/.test(t)) depth++;
      else if (/^#endif\b/.test(t)) {
        depth--;
        if (depth === 0) skip = 0;
      }
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** Yalnız #ifdef NAME bloklarının içi (iç içe dengeli). */
function onlyIfdef(src, name) {
  const lines = src.split('\n');
  const out = [];
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (depth === 0) {
      if (t === '#ifdef ' + name) depth = 1;
      continue;
    }
    if (/^#if(def|ndef)?\b/.test(t)) depth++;
    else if (/^#endif\b/.test(t)) {
      depth--;
      if (depth === 0) continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

describe('şehir shader: pow tabanları (NaN güvenliği)', () => {
  const sources = {
    CHUNK_FRAGMENT, SKYLINE_FRAGMENT, CITY_WEATHER_FRAGMENT, HOLO_FRAGMENT, SKY_FRAGMENT, COMPOSITE_FRAGMENT, WEATHER_FRAG, WEATHER_VERT,
  };
  Object.keys(sources).forEach((name) => {
    it(`${name}: her pow() tabanı max/clamp/abs ile kıskaçlı`, () => {
      const bad = powBases(sources[name]).filter((b) => !SAFE_BASE.test(b) && b !== 'x' && b !== 'h');
      expect(bad).toEqual([]);
    });
  });

  it('kSrgbToLin pow kullanmaz ve girdisini kıstırır; ıslak yansıma Fresnel kübü pow yerine çarpım', () => {
    const m = CHUNK_FRAGMENT.match(/vec3 kSrgbToLin\(vec3 c\) \{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain('c = clamp(c, 0.0, 1.0);');
    expect(m[1]).not.toMatch(/pow\(/);
    expect(CHUNK_FRAGMENT).toContain('float fresW = 0.05 + 0.95 * fq * fq * fq;');
  });

  it('bölme/sqrt/log/atan hedefleri güvenli: payda max(...) ile alt sınırlı, atan(0,0) kaçınılır', () => {
    // kRipples: d / max(dl, 1.0e-3); yansıma uzaklığı max(length(rel), 0.5)
    expect(CHUNK_FRAGMENT).toMatch(/d \/ max\(dl, 1\.0e-3\)/);
    expect(CHUNK_FRAGMENT).toContain('float dist = max(length(rel), 0.5);');
    const cityF = onlyIfdef(CHUNK_FRAGMENT, 'CITY');
    const cityV = onlyIfdef(CHUNK_VERTEX, 'CITY');
    expect(cityF.length).toBeGreaterThan(1000);
    expect(cityV.length).toBeGreaterThan(200);
    expect(cityF).not.toMatch(/\blog2?\(|\binversesqrt\(|\bsqrt\(/);
    expect(cityV).not.toMatch(/\bpow\(|\blog2?\(|\bsqrt\(/);
    // şehir kodundaki normalize() girdileri sıfır vektöre karşı korumalı (Nr: mix(N,Ng) hiçbir zaman sıfır değil)
    expect(cityF).toContain('normalize(mix(N, Ng, cPud))');
    expect(cityF).not.toMatch(/normalize\(V\.xz\)/);
  });
});

describe('şehir shader: aCity çözümü ve "değer yok" nöbetçisi', () => {
  it('köşe aşaması: öznitelik yalnız CITY altında bildirilir; bayt çözümü sabit; 254+ = değer yok', () => {
    expect(CHUNK_VERTEX).toMatch(/#ifdef CITY\s+attribute vec4 aCity;\s+#endif/);
    expect(CHUNK_VERTEX).toContain('float ab = floor(aCity.a * 255.0 + 0.5);');
    expect(CHUNK_VERTEX).toContain('float okc = ab < 254.0 ? 1.0 : 0.0;');
    expect(CHUNK_VERTEX).toContain('float wetb = ab >= 128.0 ? 1.0 : 0.0;');
    expect(CHUNK_VERTEX).toContain('float winb = rem >= 64.0 ? 1.0 : 0.0;');
    expect(CHUNK_VERTEX).toContain('vCityFlag = vec2(wetb, winb) * okc;');
    // şiddet 0..1 kıstırılır; ton kıstırılır
    expect(CHUNK_VERTEX).toContain('clamp((rem - winb * 64.0) / 63.0, 0.0, 1.0)');
    expect(CHUNK_VERTEX).toContain('clamp(aCity.rgb, 0.0, 1.0) * okc');
  });

  it('sentinel sayısal sözleşmesi: varsayılan öznitelik (0,0,0,1) → a baytı 255 → hiçbir şehir etkisi olmaz', () => {
    // GLSL'deki çözümün birebir JS karşılığı
    const decode = (aNorm) => {
      const ab = Math.floor(aNorm * 255 + 0.5);
      const ok = ab < 254 ? 1 : 0;
      const wet = ab >= 128 ? 1 : 0;
      const rem = ab - wet * 128;
      const win = rem >= 64 ? 1 : 0;
      const inten = Math.min(1, Math.max(0, (rem - win * 64) / 63));
      return { wet: wet * ok, win: win * ok, inten: inten * ok * (1 - win) };
    };
    expect(decode(1)).toEqual({ wet: 0, win: 0, inten: 0 }); // öznitelik yok
    expect(decode(0)).toEqual({ wet: 0, win: 0, inten: 0 });
    expect(decode(128 / 255)).toEqual({ wet: 1, win: 0, inten: 0 }); // ıslak üst yüz
    expect(decode((128 + 63) / 255).wet).toBe(1);
    expect(decode((128 + 63) / 255).inten).toBeCloseTo(1, 9);
    expect(decode((64 + 1) / 255)).toEqual({ wet: 0, win: 1, inten: 0 }); // pencere grubu 1
    expect(decode(32 / 255).inten).toBeCloseTo(32 / 63, 9);
    // 255 yalnız "yok": ıslak+pencere+63 ASLA üretilmez (mesher ıslak ve pencereyi birlikte yazmaz)
    for (let a = 0; a < 254; a++) {
      const d = decode(a / 255);
      expect(d.wet + d.win).toBeLessThanOrEqual(2);
    }
  });

  it('parça aşaması: kıstırma ve kapılar — çıkış kSafeColor (NaN → 0), uWet NaN ise ıslak dal atlanır', () => {
    expect(CHUNK_FRAGMENT).toContain('if (cWet > 0.5 && uWet > 0.001) {'); // NaN karşılaştırması yanlış → dal yok
    expect(CHUNK_FRAGMENT).toContain('float cInt = clamp(vCityHue.a, 0.0, 1.0);');
    expect(CHUNK_FRAGMENT).toContain('col = kSafeColor(col);');
    const i = CHUNK_FRAGMENT.indexOf('#ifdef CITY\n  if (cDamp > 0.0) {');
    const j = CHUNK_FRAGMENT.indexOf('col = kSafeColor(col);');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i); // şehir eklemeleri güvenli kıskaçtan ÖNCE
  });

  it('centroid varyingler korunur; yeni varyingler köşe/parça aşamasında eşleşir', () => {
    expect(CHUNK_VERTEX).toMatch(/centroid varying vec2 vLight;/);
    expect(CHUNK_FRAGMENT).toMatch(/centroid varying vec2 vLight;/);
    expect(CHUNK_VERTEX).toMatch(/centroid varying vec4 vColor;/);
    expect(CHUNK_FRAGMENT).toMatch(/centroid varying vec4 vColor;/);
    expect(CHUNK_VERTEX).toContain('varying vec4 vCityHue;');
    expect(CHUNK_FRAGMENT).toContain('varying vec4 vCityHue;');
    expect(CHUNK_VERTEX).toContain('flat varying vec2 vCityFlag;');
    expect(CHUNK_FRAGMENT).toContain('flat varying vec2 vCityFlag;');
  });
});

describe('şehir shader: CITY tanımsızken ana diyar kaynağı', () => {
  it('CITY blokları çıkarılınca şehre özgü hiçbir ad kalmaz (aynı ifadeler → bayt-aynı görüntü)', () => {
    const f = stripIfdef(CHUNK_FRAGMENT, 'CITY');
    const v = stripIfdef(CHUNK_VERTEX, 'CITY');
    ['uWet', 'uNeon', 'uRain', 'cHue', 'cDamp', 'cPud', 'cWin', 'cWet', 'kSrgbToLin', 'kRipples', 'kStreak', 'vCityHue', 'vCityFlag', 'aCity', 'kVnoise']
      .forEach((n) => {
        expect(f.includes(n), 'fragment ' + n).toBe(false);
        expect(v.includes(n), 'vertex ' + n).toBe(false);
      });
  });

  it('blkLit ifadesi ana diyarda eski aritmetikle aynı: blkCol = uBlockLightColor', () => {
    const f = stripIfdef(CHUNK_FRAGMENT, 'CITY');
    expect(f).toContain('vec3 blkCol = uBlockLightColor;');
    expect(f).toContain('vec3 blkLit = blkCol * blkC * (0.82 + 0.18 * N.y);');
  });

  it('#if/#ifdef/#endif dengeli (şehir blokları dahil); süslü/normal parantezler dengeli', () => {
    [CHUNK_VERTEX, CHUNK_FRAGMENT].forEach((src) => {
      const ifs = (src.match(/^\s*#if(def|ndef)?\b/gm) || []).length;
      const ends = (src.match(/^\s*#endif\b/gm) || []).length;
      expect(ifs).toBe(ends);
      const count = (ch) => src.split(ch).length - 1;
      expect(count('{')).toBe(count('}'));
      expect(count('(')).toBe(count(')'));
    });
  });
});

describe('şehir shader: uniform/tanım tutarlılığı', () => {
  const u = createMaterialUniforms(THREE);
  it('şehir shader’larında bildirilen her uniform createMaterialUniforms’ta ya da katmanın kendi uniform’unda', () => {
    const own = {
      skyline: new Set(['uFarClip', 'uSkylineWindowA']),
      cityWeather: new Set(['uCam', 'uWind', 'uTime', 'uMotion', 'uGround', 'uRain', 'uNight', 'uPlaneFade', 'uBox', 'uVis', 'uVent', 'uLight']),
    };
    const names = (src) => {
      const s = new Set();
      src.replace(/uniform\s+\w+\s+(\w+)(\[\d+\])?\s*;/g, (m, n) => { s.add(n); return m; });
      return s;
    };
    names(SKYLINE_VERTEX + SKYLINE_FRAGMENT).forEach((n) => expect(own.skyline.has(n) || u[n] !== undefined, n).toBe(true));
    names(CITY_WEATHER_VERTEX + CITY_WEATHER_FRAGMENT).forEach((n) => expect(own.cityWeather.has(n), n).toBe(true));
    ['uWet', 'uNeon', 'uRain'].forEach((n) => expect(u[n]).toBeDefined());
    expect(u.uNeon.value.isVector4).toBe(true);
    expect(u.uWet.value).toBe(0);
    expect(u.uRain.value).toBe(0);
  });

  it('pencere eşikleri GLSL ile JS (cityData) arasında aynı: 0,2/0,5/0,8 ± 0,08', () => {
    expect(WINDOW_LIT_SOFT).toBe(0.08);
    expect(WINDOW_GROUP_THRESHOLDS).toEqual([0.2, 0.5, 0.8]);
    expect(WINDOW_GROUP_GLSL).toContain('group == 0 ? 0.2 : (group == 1 ? 0.5 : 0.8)');
    expect(CHUNK_FRAGMENT).toContain('cWinLit = smoothstep(thr - 0.08, thr + 0.08, uNeon.x);');
    expect(CHUNK_FRAGMENT).toContain('if (thr < 0.35) cWinLit = 0.0;'); // düşük kademe: A grubu (0,2) kapalı
  });

  it('kalite tanımları: düşük yalnız Fresnel + A grubu kapalı; orta birikinti; yüksek halkalar', () => {
    const pixels = generateAtlasPixels({ quality: 'low' });
    const atlas = createAtlasTextures(THREE, pixels);
    const m = createChunkMaterials(THREE, atlas, undefined, { quality: 'low', city: true });
    const has = (k) => k in m.opaque.defines;
    expect(has('CITY')).toBe(true);
    expect(has('CITY_PUDDLE')).toBe(false);
    expect(has('CITY_RINGS')).toBe(false);
    expect(has('CITY_WINDOW_A_OFF')).toBe(true);
    expect(has('CITY_LDR')).toBe(true); // bloom yok → emisyon kısık
    m.setQuality('medium');
    expect(has('CITY_LDR')).toBe(false);
    expect(has('CITY_PUDDLE')).toBe(true);
    expect(has('CITY_RINGS')).toBe(false);
    expect(has('CITY_WINDOW_A_OFF')).toBe(false);
    m.setQuality('high');
    expect(has('CITY_RINGS')).toBe(true);
    m.setCity(false);
    ['CITY', 'CITY_PUDDLE', 'CITY_RINGS', 'CITY_WINDOW_A_OFF', 'CITY_LDR'].forEach((k) => expect(has(k)).toBe(false));
    m.dispose();
  });
});

describe('şehir shader: gürültü dokusu sözleşmesi', () => {
  it('kVnoise/kHash4 doku örneklemesi cityNoise sabitleriyle uyumlu (256 px, hücre başına 8 texel, texel merkezi)', () => {
    expect(CHUNK_FRAGMENT).toContain('uniform sampler2D uCityNoise;');
    expect(CHUNK_FRAGMENT).toContain(`texture2D(uCityNoise, (p * ${CITY_NOISE_CELL}.0 + 0.5) / ${CITY_NOISE_SIZE}.0).r`);
    expect(CHUNK_FRAGMENT).toContain(`texture2D(uCityNoise, (floor(id) * ${CITY_NOISE_CELL}.0 + 0.5) / ${CITY_NOISE_SIZE}.0)`);
    expect(CITY_NOISE_SIZE / CITY_NOISE_CELL).toBe(32);
  });

  it('ALU değer gürültüsü (kHash12) kalmadı: derleme maliyeti düşük; ana diyar kaynağında doku adı yok', () => {
    expect(CHUNK_FRAGMENT).not.toContain('kHash12');
    expect(stripIfdef(CHUNK_FRAGMENT, 'CITY')).not.toContain('uCityNoise');
    expect(createMaterialUniforms(THREE).uCityNoise).toBeDefined();
    expect(createMaterialUniforms(THREE).uCityNoise.value).toBeNull();
  });

  it('setCity(true) gürültü dokusunu kurar; dispose bırakır', () => {
    const pixels = generateAtlasPixels({ quality: 'low' });
    const atlas = createAtlasTextures(THREE, pixels);
    const m = createChunkMaterials(THREE, atlas, undefined, { quality: 'low' });
    expect(m.uniforms.uCityNoise.value).toBeNull();
    m.setCity(true);
    expect(m.uniforms.uCityNoise.value).not.toBeNull();
    expect(m.uniforms.uCityNoise.value.isDataTexture).toBe(true);
    const tex = m.uniforms.uCityNoise.value;
    m.setCity(false);
    m.setCity(true);
    expect(m.uniforms.uCityNoise.value).toBe(tex); // tekrar kurulmaz
    m.dispose();
    expect(m.uniforms.uCityNoise.value).toBeNull();
    const direct = createChunkMaterials(THREE, atlas, undefined, { quality: 'low', city: true });
    expect(direct.uniforms.uCityNoise.value).not.toBeNull();
    direct.dispose();
  });
});

describe('post-fx: geçiş efektleri strobosuz', () => {
  it('uWarp/uFade tanımlı; titreşim hızları yavaş (sin zaman katsayıları ≤ 3 rad/sn·2π değil, her biri < 3 Hz)', () => {
    expect(COMPOSITE_FRAGMENT).toContain('uniform float uWarp;');
    expect(COMPOSITE_FRAGMENT).toContain('uniform float uFade;');
    // zamana bağlı sinüs katsayıları (uTime * k): hepsi < 3 Hz = 18.85 rad/sn
    const ks = [...COMPOSITE_FRAGMENT.matchAll(/uTime\s*\*\s*([0-9.]+)/g)].map((m) => Number(m[1]));
    expect(ks.length).toBeGreaterThan(0);
    ks.forEach((k) => expect(k).toBeLessThan(3 * 2 * Math.PI));
    // rastgele sıçrama (hash(floor(zaman))) yok: yalnız grenin hash'i fract(uTime) ile kalır (eskiden de vardı)
    expect(COMPOSITE_FRAGMENT).not.toMatch(/floor\(uTime/);
  });
});
