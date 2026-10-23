import { describe, expect, it } from 'vitest';
import {
  BRAND_KINDS, CITY_AD_LINES, CITY_BRANDS, DISTRICT_FLAVOUR, DISTRICT_KEYS, DISTRICT_NAMES, SIGN_FRAMES,
  SIGN_GLYPHS, SIGN_HUES, SIGN_LIMITS, SIGN_MODES, SIGN_MODE_INFO, brandForInterior, brandsForDistrict, getBrand,
  pickAdLine, pickBrand, signLines, streetNameFor, trUpper,
} from './cityBrands.js';
import {
  COMMON_WORD_BRANDS, REAL_BRANDS, findBrandCollision, foldTr, levenshtein, scanText,
} from './citySafeData.js';
import { INTERIOR_KINDS } from './ownerData.js';
import { mulberry32 } from '../rng.js';

const TURKISH_SPECIAL = 'ÇĞİÖŞÜçğıöşü';

describe('CITY_BRANDS — özgün dükkân adları', () => {
  it('tam 60 dükkân, donmuş, kimlikler ASCII ve benzersiz', () => {
    expect(CITY_BRANDS.length).toBe(60);
    expect(Object.isFrozen(CITY_BRANDS)).toBe(true);
    const ids = CITY_BRANDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(60);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9_]{3,24}$/));
  });

  it('adlar benzersiz (Türkçe katlanmış, boşluksuz), sınırlar içinde', () => {
    const keys = CITY_BRANDS.map((b) => foldTr(b.name).replace(/[^a-z0-9]/g, ''));
    expect(new Set(keys).size).toBe(60);
    CITY_BRANDS.forEach((b) => {
      expect(b.name.length, b.name).toBeGreaterThanOrEqual(5);
      expect(b.name.length, b.name).toBeLessThanOrEqual(SIGN_LIMITS.name);
      expect(b.tagline.length, b.tagline).toBeGreaterThanOrEqual(10);
      expect(b.tagline.length, b.tagline).toBeLessThanOrEqual(SIGN_LIMITS.tagline);
      expect(b.name).toBe(b.name.trim());
      expect(b.name.indexOf('  ')).toBe(-1);
      expect(b.tagline).toMatch(/[.!?]$/);
    });
    const tags = CITY_BRANDS.map((b) => b.tagline);
    expect(new Set(tags).size).toBe(60);
  });

  it('tür, bölge, stil alanları geçerli; her bölgede >= 10 dükkân', () => {
    CITY_BRANDS.forEach((b) => {
      expect(BRAND_KINDS, b.id).toContain(b.kind);
      expect(b.districts.length, b.id).toBeGreaterThan(0);
      b.districts.forEach((d) => expect(DISTRICT_KEYS, b.id).toContain(d));
      expect(new Set(b.districts).size).toBe(b.districts.length);
      expect(SIGN_MODES).toContain(b.style.mode);
      expect(SIGN_HUES).toContain(b.style.hue);
      expect(SIGN_FRAMES).toContain(b.style.frame);
    });
    DISTRICT_KEYS.forEach((d) => expect(brandsForDistrict(d).length, d).toBeGreaterThanOrEqual(10));
    BRAND_KINDS.forEach((k) => expect(CITY_BRANDS.some((b) => b.kind === k), k).toBe(true));
  });

  it('tabela hareket kipleri erişilebilirlik tavanında (<= 3 Hz); titreşim nadir', () => {
    SIGN_MODES.forEach((m) => {
      expect(SIGN_MODE_INFO[m].hz, m).toBeLessThanOrEqual(3);
      expect(SIGN_MODE_INFO[m].hz).toBeGreaterThanOrEqual(0);
    });
    const z = CITY_BRANDS.filter((b) => b.style.mode === 'titresim').length;
    expect(z).toBeLessThanOrEqual(6);
    SIGN_MODES.forEach((m) => expect(CITY_BRANDS.some((b) => b.style.mode === m), m).toBe(true));
    SIGN_HUES.forEach((h) => expect(CITY_BRANDS.filter((b) => b.style.hue === h).length, h).toBeGreaterThanOrEqual(5));
  });

  it('16 iç mekân türünün her birinin tam bir sahibi dükkânı var (türler ownerData ile aynı)', () => {
    const withInterior = CITY_BRANDS.filter((b) => b.interior);
    expect(withInterior.length).toBe(16);
    expect(withInterior.map((b) => b.interior).sort()).toEqual(INTERIOR_KINDS.slice().sort());
    INTERIOR_KINDS.forEach((k) => expect(brandForInterior(k).interior).toBe(k));
    expect(brandForInterior('yok')).toBe(null);
  });

  it('getBrand / brandsForDistrict', () => {
    expect(getBrand('bulut_ramen').name).toBe('Bulut Ramen');
    expect(getBrand('yok')).toBe(null);
    expect(getBrand('__proto__')).toBe(null);
    brandsForDistrict('merkez', 'market').forEach((b) => {
      expect(b.kind).toBe('market');
      expect(b.districts).toContain('merkez');
    });
    expect(brandsForDistrict('yok')).toEqual([]);
  });
});

describe('gerçek marka çakışması yok (benzerlik denetimi)', () => {
  it('hiçbir dükkân adı bir gerçek adın aynısı ya da çok yakını değil', () => {
    const bad = [];
    CITY_BRANDS.forEach((b) => {
      const c = findBrandCollision(b.name);
      if (c) bad.push(b.name + ' ~ ' + c.brand + ' (' + c.distance + ', ' + c.part + ')');
      const c2 = findBrandCollision(b.name + ' ' + b.tagline);
      if (c2) bad.push(b.name + ' + slogan ~ ' + c2.brand);
    });
    expect(bad).toEqual([]);
  });

  it('dükkân adı sözcükleri ve ad+slogan taramadan temiz', () => {
    CITY_BRANDS.forEach((b) => {
      expect(scanText(b.name), b.name).toEqual([]);
      expect(scanText(b.tagline), b.tagline).toEqual([]);
      expect(scanText(b.name + ' ' + b.tagline), b.name).toEqual([]);
    });
  });

  it('denetim gerçekten çalışıyor: yakın taklitler ve gömülü adlar yakalanır', () => {
    const must = ['Nokia Telekom', 'Nikee Spor', 'Coca Kola', 'Adidass', 'Samsunk Teknik',
      'Starbuck Kafe', 'Burger Kinq', 'Pokemon Oyuncak', 'Mavi Dron Kurye', 'Trendyol Market', 'Migross Express',
      'Hepsi Burada', 'Yemek Sepeti', 'Cola Turka', 'Ferrarri Garaj', 'Lamborgini Tamir', 'McDonalds Express'];
    must.forEach((n) => expect(findBrandCollision(n), n).not.toBe(null));
    ['Bulut Ramen', 'Lüminar Market', 'Atlas Bisiklet', 'Kıvılcım Elektrik', 'Sıfır Bir Atölye', 'Vida Garaj']
      .forEach((n) => expect(findBrandCollision(n), n).toBe(null));
  });

  it('yaygın sözcük olan gerçek adlar da (Mavi, Tat, Eti…) dükkân adında yasak', () => {
    COMMON_WORD_BRANDS.forEach((w) => {
      const c = findBrandCollision(w + ' Dükkan');
      expect(c, w).not.toBe(null);
    });
    expect(REAL_BRANDS.length).toBeGreaterThanOrEqual(150);
  });

  it('levenshtein: kimlik, simetri, üçgen eşitsizliği, erken çıkış, bilinen değerler', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('nike', 'nikee', 1)).toBe(1);
    expect(levenshtein('abcdef', 'uvwxyz', 2)).toBeGreaterThan(2);
    expect(levenshtein('a', 'abcdefgh', 3)).toBeGreaterThan(3);
    const rnd = mulberry32(77);
    const rs = () => {
      let s = '';
      const n = Math.floor(rnd() * 9);
      for (let i = 0; i < n; i++) s += 'abc'.charAt(Math.floor(rnd() * 3));
      return s;
    };
    for (let i = 0; i < 400; i++) {
      const a = rs();
      const b = rs();
      const c = rs();
      expect(levenshtein(a, b)).toBe(levenshtein(b, a));
      expect(levenshtein(a, c)).toBeLessThanOrEqual(levenshtein(a, b) + levenshtein(b, c));
      expect(levenshtein(a, a)).toBe(0);
      const cap = 2;
      const full = levenshtein(a, b);
      const early = levenshtein(a, b, cap);
      if (full <= cap) expect(early).toBe(full);
      else expect(early).toBeGreaterThan(cap);
    }
  });
});

describe('tabela atlası: Türkçe karakter kapsamı', () => {
  const corpus = () => {
    const out = [];
    CITY_BRANDS.forEach((b) => { out.push(b.name, b.tagline); });
    CITY_AD_LINES.forEach((a) => out.push(a.text));
    return out;
  };

  it('SIGN_GLYPHS 12 Türkçe özel harfi (büyük+küçük), â/î/û, rakam ve noktalamayı içerir', () => {
    TURKISH_SPECIAL.split('').forEach((ch) => expect(SIGN_GLYPHS, ch).toContain(ch));
    ['Â', 'â', 'Î', 'î', 'Û', 'û', '0', '9', '.', ',', '!', '?', ':', '-', '\'', '&', ' '].forEach((ch) => {
      expect(SIGN_GLYPHS, ch).toContain(ch);
    });
    expect(new Set(SIGN_GLYPHS.split('')).size).toBe(SIGN_GLYPHS.length);
    for (let c = 65; c <= 90; c++) {
      expect(SIGN_GLYPHS).toContain(String.fromCharCode(c));
      expect(SIGN_GLYPHS).toContain(String.fromCharCode(c + 32));
    }
  });

  it('tüm tabela dizgeleri (özgün + Türkçe büyük harf) glif kümesinde', () => {
    const bad = [];
    corpus().forEach((s) => {
      [s, trUpper(s)].forEach((t) => {
        t.split('').forEach((ch) => { if (SIGN_GLYPHS.indexOf(ch) < 0) bad.push(JSON.stringify(ch) + ' in ' + t); });
      });
    });
    expect(bad).toEqual([]);
  });

  it('veri 12 Türkçe özel harfin her birini (büyük ve küçük) gerçekten kullanır', () => {
    const text = corpus().join(' ') + ' ' + corpus().map(trUpper).join(' ');
    TURKISH_SPECIAL.split('').forEach((ch) => expect(text.indexOf(ch), ch).toBeGreaterThanOrEqual(0));
    expect(text.indexOf('â')).toBeGreaterThanOrEqual(0);
  });

  it('trUpper: Türkçe i/ı doğru, diğerleri değişmez, çift uygulama kararlı', () => {
    expect(trUpper('iıİI')).toBe('İIİI');
    expect(trUpper('ığdır')).toBe('IĞDIR');
    expect(trUpper('ŞEHİR')).toBe('ŞEHİR');
    expect(trUpper('Neon 24 saat!')).toBe('NEON 24 SAAT!');
    corpus().forEach((s) => expect(trUpper(trUpper(s))).toBe(trUpper(s)));
  });

  it('tabela satırları: ad en çok 2 satır ve her satır <= 14 kr (hücreye sığar)', () => {
    CITY_BRANDS.forEach((b) => {
      [false, true].forEach((upper) => {
        const lines = signLines(b, { upper });
        expect(lines.length, b.name).toBeGreaterThanOrEqual(1);
        expect(lines.length, b.name).toBeLessThanOrEqual(SIGN_LIMITS.lines);
        lines.forEach((l) => expect(l.length, b.name + '|' + l).toBeLessThanOrEqual(SIGN_LIMITS.line));
        expect(lines.join(' ')).toBe(upper ? trUpper(b.name) : b.name);
      });
    });
    expect(signLines('Kısa Ad')).toEqual(['Kısa Ad']);
    expect(signLines('Çok Uzun Bir Dükkân Adı Burada', { maxChars: 16 }).length).toBe(2);
    expect(signLines(null)).toEqual(['']);
  });
});

describe('CITY_AD_LINES — holo reklamlar', () => {
  it('>= 60 satır, kimlik/metin benzersiz, <= 44 kr, noktalamayla biter', () => {
    expect(CITY_AD_LINES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(CITY_AD_LINES.map((a) => a.id)).size).toBe(CITY_AD_LINES.length);
    expect(new Set(CITY_AD_LINES.map((a) => a.text)).size).toBe(CITY_AD_LINES.length);
    CITY_AD_LINES.forEach((a) => {
      expect(a.id).toMatch(/^a_[a-z0-9_]+$/);
      expect(a.text.length, a.text).toBeLessThanOrEqual(SIGN_LIMITS.ad);
      expect(a.text.length, a.text).toBeGreaterThanOrEqual(15);
      expect(a.text, a.text).toMatch(/[.!?]$/);
      a.districts.forEach((d) => expect(DISTRICT_KEYS).toContain(d));
      expect(scanText(a.text), a.text).toEqual([]);
    });
  });

  it('marka bağlı satırlar var olan dükkânı adıyla anar; her iç mekân dükkânının reklamı var', () => {
    CITY_AD_LINES.filter((a) => a.brand).forEach((a) => {
      const b = getBrand(a.brand);
      expect(b, a.id).not.toBe(null);
      expect(a.text.indexOf(b.name) === 0 || a.text.indexOf(b.name.split(' ')[0]) === 0, a.text).toBe(true);
    });
    CITY_BRANDS.filter((b) => b.interior).forEach((b) => {
      expect(CITY_AD_LINES.some((a) => a.brand === b.id), b.id).toBe(true);
    });
  });

  it('her bölge için hem genel hem bölgeye özgü reklam havuzu yeterli', () => {
    DISTRICT_KEYS.forEach((d) => {
      const pool = CITY_AD_LINES.filter((a) => !a.districts.length || a.districts.indexOf(d) >= 0);
      expect(pool.length, d).toBeGreaterThanOrEqual(25);
      expect(CITY_AD_LINES.some((a) => a.districts.indexOf(d) >= 0 && !a.brand), d).toBe(true);
    });
  });
});

describe('bölge adlandırma tadı ve seçiciler', () => {
  it('DISTRICT_NAMES / FLAVOUR 6 bölgeyi kapsar, sokak adları benzersiz', () => {
    expect(DISTRICT_KEYS.length).toBe(6);
    const allStreets = [];
    DISTRICT_KEYS.forEach((k) => {
      expect(typeof DISTRICT_NAMES[k]).toBe('string');
      const f = DISTRICT_FLAVOUR[k];
      expect(f.hues.length).toBeGreaterThan(0);
      f.hues.forEach((h) => expect(SIGN_HUES).toContain(h));
      expect(f.nouns.length).toBeGreaterThanOrEqual(5);
      expect(f.streets.length).toBe(8);
      f.streets.forEach((s) => { allStreets.push(s); expect(s.length).toBeLessThanOrEqual(24); });
    });
    expect(new Set(allStreets).size).toBe(allStreets.length);
  });

  it('pickBrand belirlenimci, bölgeye/türe uygun, tohuma göre değişir, bilinmeyende yedek', () => {
    DISTRICT_KEYS.forEach((d) => {
      const seen = new Set();
      for (let slot = 0; slot < 300; slot++) {
        const a = pickBrand(12345, d, slot);
        const b = pickBrand(12345, d, slot);
        expect(a).toBe(b);
        expect(a.districts).toContain(d);
        seen.add(a.id);
        const m = pickBrand(12345, d, slot, 'yemek');
        if (brandsForDistrict(d, 'yemek').length) expect(m.kind).toBe('yemek');
      }
      expect(seen.size, d).toBeGreaterThanOrEqual(8);
    });
    let diff = 0;
    for (let slot = 0; slot < 100; slot++) if (pickBrand(1, 'merkez', slot) !== pickBrand(2, 'merkez', slot)) diff++;
    expect(diff).toBeGreaterThan(30);
    expect(CITY_BRANDS).toContain(pickBrand(5, 'yok', 3));
    expect(CITY_BRANDS).toContain(pickBrand(5, '__proto__', 3));
    expect(CITY_BRANDS).toContain(pickBrand(NaN, 'merkez', NaN));
    expect(pickBrand(7, 'tepe', 4, 'olmayan_tur').districts).toContain('tepe');
  });

  it('pickAdLine ve streetNameFor belirlenimci ve bölgeye uygun', () => {
    DISTRICT_KEYS.forEach((d) => {
      const seen = new Set();
      for (let slot = 0; slot < 300; slot++) {
        const a = pickAdLine(99, d, slot);
        expect(a).toBe(pickAdLine(99, d, slot));
        expect(!a.districts.length || a.districts.indexOf(d) >= 0).toBe(true);
        seen.add(a.id);
        expect(DISTRICT_FLAVOUR[d].streets).toContain(streetNameFor(99, d, slot));
      }
      expect(seen.size, d).toBeGreaterThanOrEqual(15);
    });
    expect(CITY_AD_LINES).toContain(pickAdLine(3, 'yok', 1));
    expect(typeof streetNameFor(3, 'yok', 1)).toBe('string');
  });
});
