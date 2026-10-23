/*
 * Regresyon: "beyaz leke + kenar boyunca siyah noktalar" (Otomatik kalite = MSAA'lı yüksek kademe, tapınak önü).
 * Kök neden: pow(x, y) x < 0 için tanımsızdır → NaN. Köşe ışığı (aLight) MSAA'da kenar piksellerinde üçgen DIŞINA taşan
 * ara değerle eksiye düşebiliyordu → NaN HDR hedefe yazılıyor → bloom ön-süzgeci min(NaN, 24) = 24 yapıp dev beyaz leke
 * çiziyor, birleştirmede NaN piksel siyah nokta bırakıyordu.
 * GLSL burada çalıştırılamaz; bu testler kaynak sözleşmesini (negatif tabanlı pow yok, giriş/çıkış kıskaçları, centroid) kilitler.
 */
import { describe, it, expect } from 'vitest';
import { CHUNK_VERTEX, CHUNK_FRAGMENT } from './materialShaders.js';
import { SKY_FRAGMENT } from './skyShaders.js';
import { PARTICLE_FRAG } from './particleShaders.js';
import { DOWN_FRAGMENT, UP_FRAGMENT, COMPOSITE_FRAGMENT } from './postfxShaders.js';

/** Kaynaktaki her pow( çağrısının ilk argümanı (parantez dengeli). */
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

describe('pow tabanı asla eksi olamaz', () => {
  const sources = { CHUNK_FRAGMENT, SKY_FRAGMENT, PARTICLE_FRAG };
  Object.keys(sources).forEach((name) => {
    it(`${name}: her pow() tabanı max/clamp/abs ile kıskaçlı`, () => {
      const bad = powBases(sources[name]).filter((b) => !SAFE_BASE.test(b) && b !== 'x' && b !== 'h');
      expect(bad).toEqual([]);
    });
  });

  it('çıplak tabanlar (x, h) pow\'dan önce kıskaçlanır', () => {
    // kCurveBlock: x = clamp(x, 0.0, 1.0) → pow(x, 1.55)
    expect(CHUNK_FRAGMENT).toMatch(/float kCurveBlock\(float x\) \{\s*x = clamp\(x, 0\.0, 1\.0\);\s*return pow\(x, 1\.55\)/);
    // gökyüzü: h = clamp(e, 0, 1)
    expect(SKY_FRAGMENT).toMatch(/float h = clamp\(e, 0\.0, 1\.0\);/);
  });

  it('kCurveSky de girdisini kıskaçlar', () => {
    expect(CHUNK_FRAGMENT).toMatch(/float kCurveSky\(float x\) \{\s*x = clamp\(x, 0\.0, 1\.0\);/);
  });
});

describe('chunk shader: MSAA kenar taşması ve NaN çıkışı', () => {
  it('köşe ışığı/rengi centroid ile geçer (köşe + parça aşaması uyumlu)', () => {
    expect(CHUNK_VERTEX).toMatch(/centroid varying vec2 vLight;/);
    expect(CHUNK_FRAGMENT).toMatch(/centroid varying vec2 vLight;/);
    expect(CHUNK_VERTEX).toMatch(/centroid varying vec4 vColor;/);
    expect(CHUNK_FRAGMENT).toMatch(/centroid varying vec4 vColor;/);
  });

  it('çıkış HDR hedefe gitmeden kSafeColor ile süzülür (NaN → 0, üst sınır 32)', () => {
    expect(CHUNK_FRAGMENT).toMatch(/vec3 kSafeColor\(vec3 c\)/);
    const i = CHUNK_FRAGMENT.indexOf('col = kSafeColor(col);');
    const j = CHUNK_FRAGMENT.indexOf('gl_FragColor = vec4(col, alpha);');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(CHUNK_FRAGMENT).toMatch(/c\.r >= 0\.0 && c\.g >= 0\.0 && c\.b >= 0\.0/); // NaN karşılaştırmada yanlış olur
    expect(CHUNK_FRAGMENT).toMatch(/min\(c, vec3\(32\.0\)\)/);
  });
});

describe('chunk shader: sis hedefi gökyüzü gradyanı (uzak silüet halesi regresyonu)', () => {
  it('erime bölgesinde sis tamamlanır; sis rengi görüş yönündeki gökyüzüne eşitlenir (su altında sabit)', () => {
    expect(CHUNK_FRAGMENT).toContain('float fadeK = 0.0;');
    expect(CHUNK_FRAGMENT).toContain('fogF = mix(fogF, 1.0, fadeK);');
    const i = CHUNK_FRAGMENT.indexOf('if (uUnderwater < 0.5) {');
    const j = CHUNK_FRAGMENT.indexOf('fogCol = mix(uFogColor, fup, smoothstep(0.0, 0.34, fe));');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    // sky shader'ı ile aynı gradyan sabitleri (ufukta sis → ufuk→tepe, pow 0.52)
    expect(CHUNK_FRAGMENT).toContain('mix(uHorizonColor, uSkyColor, pow(clamp(fe, 0.0, 1.0), 0.52))');
    expect(SKY_FRAGMENT).toContain('mix(uHor, uTop, pow(h, 0.52))');
    expect(SKY_FRAGMENT).toContain('mix(uFog, upper, smoothstep(0.0, 0.34, e))');
    expect(CHUNK_FRAGMENT).toContain('col = mix(col, fogCol, fogF);');
  });
});

describe('post-fx: geçersiz HDR piksel bloom\'a girmez', () => {
  it('ön-süzgeç geçersiz pikseli 0 yapar (eskiden min(NaN,24)=24 → dev lekeydi)', () => {
    expect(DOWN_FRAGMENT).toMatch(/bool validHdr\(vec3 c\)/);
    expect(DOWN_FRAGMENT).toMatch(/vec3 prefilter\(vec3 c\) \{\s*if \(!validHdr\(c\)\) return vec3\(0\.0\);/);
    // ilk geçişten sonraki indirmeler de süzülür
    expect(DOWN_FRAGMENT).toMatch(/validHdr\(c\) \? c : vec3\(0\.0\);/);
  });

  it('birleştirme: kötü sahne pikseli komşu ortalamasıyla değişir, kötü bloom sıfırlanır', () => {
    expect(COMPOSITE_FRAGMENT).toMatch(/bool validHdr\(vec3 c\)/);
    expect(COMPOSITE_FRAGMENT).toMatch(/if \(!validHdr\(col\)\)/);
    expect(COMPOSITE_FRAGMENT).toMatch(/if \(!validHdr\(bloom\)\) bloom = vec3\(0\.0\);/);
  });

  it('yükseltme geçişi yalnız süzülmüş mip\'leri toplar (kendi başına NaN üretmez)', () => {
    expect(UP_FRAGMENT).not.toMatch(/pow\(|log\(|sqrt\(/);
  });
});

describe('chunk shader: kapalı mekânda su/cam kendi başına parlamaz (mağara gölü regresyonu)', () => {
  it('su taban aydınlığı gökyüzü ışığına (skyC) bağlıdır; yansıma ve köpük de', () => {
    // eski: (0.25 + 0.75 * lightAmt) ve (0.4 + 0.6 * skyC) → gökyüzü ışığı 0 olan mağarada bile gündüz suyu parlıyordu
    expect(CHUNK_FRAGMENT).not.toMatch(/\(0\.25 \+ 0\.75 \* lightAmt\)/);
    expect(CHUNK_FRAGMENT).not.toMatch(/\(0\.4 \+ 0\.6 \* skyC\)/);
    expect(CHUNK_FRAGMENT).toMatch(/float waterFloor = 0\.25 \* skyC;/);
    expect(CHUNK_FRAGMENT).toMatch(/\(waterFloor \+ \(1\.0 - waterFloor\) \* lightAmt\)/);
    expect(CHUNK_FRAGMENT).toMatch(/\* skyC, fres \* 0\.85\)/);
    expect(CHUNK_FRAGMENT).toMatch(/\(0\.3 \* skyC \+ 0\.7 \* lightAmt \+ blkLit\.r \* 0\.5\)/);
  });

  it('su aydınlığının sayısal sözleşmesi: açık havada eski değer korunur, mağarada (skyC=0, ışık=0) sıfırdır', () => {
    // GLSL'deki ifadenin birebir JS karşılığı
    const factor = (skyC, lightAmt) => {
      const floor = 0.25 * skyC;
      return floor + (1 - floor) * lightAmt;
    };
    const old = (lightAmt) => 0.25 + 0.75 * lightAmt;
    for (const l of [0, 0.3, 0.7, 1]) expect(factor(1, l)).toBeCloseTo(old(l), 12); // açık hava aynı
    expect(factor(0, 0)).toBe(0); // karanlık mağara: su da karanlık
    expect(factor(0, 0.6)).toBeCloseTo(0.6, 12); // meşale ışığı kadar aydınlanır
    expect(factor(0.5, 0)).toBeGreaterThan(0);
    expect(factor(0.5, 0)).toBeLessThan(old(0));
  });

  it('cam/buz fresnel yansıması gökyüzü ışığıyla ölçeklenir', () => {
    expect(CHUNK_FRAGMENT).toMatch(/col \+= uHorizonColor \* fresG \* 0\.4 \* \(0\.3 \+ 0\.7 \* uSkyLight\) \* skyC;/);
  });
});
