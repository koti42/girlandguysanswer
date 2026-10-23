/*
 * Neon Meridyen — güvenli içerik denetimi (sözleşme §2, §22.4, §22.5).
 *  1. Veri bütünlüğü (yasak liste, gerçek ad listesi)
 *  2. Tarayıcı doğruluğu: karşıt (adversarial) pozitifler + Scunthorpe negatifleri + fuzz + performans
 *  3. Tüm şehir veri tabloları temiz
 *  4. Depo taraması: sim/city, render/city, render/props, components/game/kesif/city, docs, config (+ dim/props/sistemler)
 *     — yalnızca veri dosyalarının kendisi izinli listededir.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BANNED_CATEGORIES, BANNED_WORDS, COMMON_WORD_BRANDS, REAL_BRANDS, SAFE_ALLOWED_PHRASES, foldTr, isSafeText, scanText, trUpper,
} from './citySafeData.js';
import { CITY_AD_LINES, CITY_BRANDS, DISTRICT_FLAVOUR, DISTRICT_NAMES } from './cityBrands.js';
import { AMBIENT_BY_DISTRICT, AMBIENT_BY_TYPE, AMBIENT_LINES } from './ambientLines.js';
import { OWNERS } from './ownerData.js';
import { allCityNameStrings } from './cityNames.js';
import { mulberry32 } from '../rng.js';
import { ALLOW_MARKER, lexJs, scanSource } from './citySafeScan.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const SRC = join(ROOT, 'src');

/** §2'de adı geçen gerçek oyun/marka/karakter adları. */
const SECTION2 = [
  'Cyberpunk', 'Night City', 'Arasaka', 'Militech', 'CD Projekt', 'Johnny', 'Silverhand', 'Delamain',
  'Braindance', 'NCPD', 'Kiroshi', 'Afterlife', 'Minecraft',
];

describe('citySafeData — veri bütünlüğü', () => {
  it('REAL_BRANDS >= 150, donmuş, katlanmış karşılıkları benzersiz', () => {
    expect(REAL_BRANDS.length).toBeGreaterThanOrEqual(150);
    expect(Object.isFrozen(REAL_BRANDS)).toBe(true);
    const keys = REAL_BRANDS.map((b) => foldTr(b).replace(/[^a-z0-9]/g, ''));
    expect(new Set(keys).size).toBe(keys.length);
    REAL_BRANDS.forEach((b) => {
      expect(typeof b).toBe('string');
      expect(b.trim()).toBe(b);
      expect(b.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('REAL_BRANDS §2 Cyberpunk evreni adlarını da içerir', () => {
    const folded = REAL_BRANDS.map((b) => foldTr(b).replace(/[^a-z0-9]/g, ''));
    SECTION2.forEach((name) => {
      expect(folded, name).toContain(foldTr(name).replace(/[^a-z0-9]/g, ''));
    });
  });

  it('REAL_BRANDS araç, teknoloji, yiyecek, moda, oyun, stüdyo ve karakter adlarını kapsar', () => {
    const must = ['Toyota', 'Tesla', 'Apple', 'Samsung', 'Coca-Cola', "McDonald's", 'Nike', 'Adidas', 'Minecraft',
      'Fortnite', 'Roblox', 'Nintendo', 'Disney', 'Pixar', 'Batman', 'Pikachu', 'Cyberpunk', 'Migros', 'Trendyol'];
    must.forEach((m) => expect(REAL_BRANDS).toContain(m));
  });

  it('BANNED_WORDS: §2 adlarının tümü + tüm kategoriler dolu, yinelenen yok', () => {
    SECTION2.forEach((name) => {
      const hits = scanText(name);
      expect(hits.length, name).toBeGreaterThan(0);
      expect(hits.some((h) => h.cat === 'oyun_marka'), name).toBe(true);
    });
    ['siddet', 'alkol', 'tutun', 'kumar', 'uyusturucu', 'romantik', 'kufur', 'hakaret', 'asiri', 'oyun_marka']
      .forEach((c) => expect(BANNED_CATEGORIES[c].length, c).toBeGreaterThanOrEqual(8));
    expect(new Set(BANNED_WORDS).size).toBe(BANNED_WORDS.length);
    expect(BANNED_WORDS.length).toBeGreaterThanOrEqual(300);
    expect(BANNED_WORDS).toContain('minecraft*');
    expect(BANNED_WORDS).toContain('night city');
  });

  it('girdi sözdizimi: önek kökleri >= 4 harf, boş girdi yok, işaretler yalnızca baş/son', () => {
    BANNED_WORDS.forEach((raw) => {
      expect(raw.length).toBeGreaterThan(1);
      const body = raw.replace(/^\^/, '').replace(/\*$/, '');
      expect(body.indexOf('*')).toBe(-1);
      expect(body.indexOf('^')).toBe(-1);
      expect(body.trim()).toBe(body);
      if (raw.charAt(raw.length - 1) === '*') {
        expect(foldTr(body).replace(/[^a-z0-9]/g, '').length, raw).toBeGreaterThanOrEqual(4);
      }
    });
  });

  it('her yasak girdi kendi yazımıyla taranınca isabet verir (kendi kendine tutarlılık)', () => {
    BANNED_WORDS.forEach((raw) => {
      const body = raw.replace(/^\^/, '').replace(/\*$/, '');
      expect(scanText(body).length, raw).toBeGreaterThan(0);
    });
  });

  it('her gerçek ad (yaygın sözcük olanlar hariç) kendi yazımıyla taranınca isabet verir', () => {
    REAL_BRANDS.filter((b) => COMMON_WORD_BRANDS.indexOf(b) < 0).forEach((b) => {
      const hits = scanText(b);
      expect(hits.length, b).toBeGreaterThan(0);
    });
  });

  it('izinli ifadeler yalnızca oyunun kendi adlarıdır', () => {
    expect(SAFE_ALLOWED_PHRASES).toEqual(['portal tabanca', 'portal gun']);
  });
});

describe('scanText — karşıt pozitifler (yakalanmalı)', () => {
  const POSITIVES = [
    // boşluk / ayraç
    'M i n e c r a f t', 'a r a s a k a', 'C y b e r p u n k', 'k.i.l.l', 'f-u-c-k', 'a_r_a_s_a_k_a', 'N i g h t  C i t y',
    'Ara saka', 'Min ecraft', 'cyber punk', 'mine-craft', 'militech', 'Mili tech',
    // büyük/küçük harf
    'MINECRAFT', 'MiNeCrAfT', 'ARASAKA', 'Cyberpunk 2077', 'night city',
    // leet
    'm1necraft', 'cyb3rpunk', 'k1ll', 'p0rn', 'v0dka', 'h1tler', 'sh1t', 'ar4s4ka', 'k!ll', 'n1ght c1ty',
    // Türkçe katlama (büyük harf, aksan)
    'ŞARAP', 'SİGARA', 'ÖLDÜR', 'Öldürdü', 'KAZİNO', 'İŞKENCE', 'Silahlı', 'BAHİS', 'Alkollü', 'viski', 'Sarhoş',
    'IŞKENCE', 'TABANCA', 'Tüfekle', 'uyuşturucu', 'KUMAR', 'Kumarhane', 'çıplak', 'AŞK', 'Aşkım', 'TÜTÜN', 'tütün',
    // tekrar
    'fuuuuck', 'killll', 'shiiiit', 'siiiiktir', 'viskiiii',
    // maske
    'f*ck', 'sh*t', 'b*tch', 'c#ck', 'k*ll', 'v*dka', 'p*rn',
    // homoglif / tam genişlik
    'аrаsаkа', 'Mіnecraft', 'ＭＩＮＥＣＲＡＦＴ',
    // ifade, ek, çekim
    'cd projekt red', 'CDPROJEKT', 'Johnny Silverhand', "McDonald's'ta", "McDonald'ın", 'McDonalds', 'kills',
    'killer', 'bombed', 'Cigarettes', 'whiskey bar', 'WINE', 'gambling', 'Coca-Cola', 'coca cola', 'COCACOLA',
    'Nike', 'POKEMON', 'Spider-Man', 'spiderman', 'Mario Kart', 'among us', 'Louis Vuitton', 'Hello Kitty',
    // gömülü
    'Bugün Minecraft oynadım', 'Yeni Arasaka kulesi', 'burası night-city', 'tabanca ve bomba', 'çok aptal',
    'Salak herif', 'sen bir Nazi misin', 'Hitler', 'casino royale', 'blackjack masası', 'Cannabis',
    // Latince/Türkçe karışık küfür
    'siktir git', 'orospu', 'amk', 'yarrak', 'SİKTİR', 'götveren', 'piç', 'fuck', 'bullshit', 'motherfucker',
  ];
  POSITIVES.forEach((txt) => {
    it('yakalar: ' + JSON.stringify(txt), () => {
      const hits = scanText(txt);
      expect(hits.length).toBeGreaterThan(0);
      hits.forEach((h) => {
        expect(typeof h.term).toBe('string');
        expect(typeof h.cat).toBe('string');
        expect(typeof h.via).toBe('string');
      });
    });
  });

  it('kategori etiketleri doğru', () => {
    const cat = (t) => scanText(t).map((h) => h.cat);
    expect(cat('vodka')).toContain('alkol');
    expect(cat('sigara')).toContain('tutun');
    expect(cat('poker')).toContain('kumar');
    expect(cat('cocaine')).toContain('uyusturucu');
    expect(cat('porn')).toContain('romantik');
    expect(cat('fuck')).toContain('kufur');
    expect(cat('stupid')).toContain('hakaret');
    expect(cat('murder')).toContain('siddet');
    expect(cat('nazi')).toContain('asiri');
    expect(cat('Nike')).toContain('marka');
    expect(cat('Minecraft')).toContain('oyun_marka');
  });

  it('via alanı isabet yolunu söyler', () => {
    expect(scanText('k1ll')[0].via).toBe('leet');
    expect(scanText('f*ck')[0].via).toBe('mask');
    expect(scanText('ara saka')[0].via).toBe('phrase');
    expect(scanText('a r4 sa k a ok')[0].via).toMatch(/deep|leet|phrase/);
    expect(scanText('x ar a sa ka ya y')[0].via).toMatch(/deep|phrase/);
    expect(scanText('Night City')[0].via).toBe('phrase');
    expect(scanText('aşk')[0].via).toBe('strict');
  });
});

describe('scanText — Scunthorpe ve masum metinler (yakalanmamalı)', () => {
  const NEGATIVES = [
    'Sıkıntı yok', 'Katılım formu', 'Katıl', 'Tutun şuraya', 'Kanal', 'Kanepe', 'Kanat', 'Sınıf', 'Class', 'Assembly',
    'Bassist', 'Skill', 'Analysis', 'Document', 'Penguin', 'Hello', 'Pasta', 'Aşçı', 'Sıkı tut', 'Kıllı', 'Kitap',
    'Sikke', 'Neon 24 Saat', 'Kat 12', 'Asansör', 'Kapsül', 'Pazar', 'kasket', 'bolluk', 'Dickens', 'Cocktail',
    'Bulut Ramen', 'Lüminar Market', 'Ay Işığı Eczanesi', 'Gece Çiçekçisi', 'Atlas Bisiklet', 'Elma Şekeri Cafe',
    'Kasa Kâşifi', 'Hızlı Hece Dil Okulu', 'Konteyner Mahallesi', 'Teknoloji Parkı', 'Tepe Konutları',
    'Sıfır Bir Atölye', 'Mor Metro Büfe', 'Hasan Amca', 'Terminale yürü', 'Yağmurda neon daha güzel!',
    'Raf dar ama huzur geniş.', 'Çorba sıcakken konuşulur.', 'Gece yarısı bile bu şehir uyanık.',
    'Bu yağmur neonları daha güzel yapıyor!', 'Tarama şoku', 'Robot dağılıyor', 'mars', 'steam', 'apple pie',
    'seat belt', 'visa', 'mavi gökyüzü', 'zoom lens', 'Sessiz', 'Ask me anything', 'aşçı', 'koşu', 'Kuşlar şarkıda',
    'Bir tekrar daha, haydi!', 'Skor seni bekliyor!', 'saat 10:30', 'x2 hız', 'level3', 'v1.2', 'A-B-C', 'a b c',
    'Pil kutusu', 'Boya seti', 'Devre kartı', 'Süzülmotor', 'Neon FM 88.8', 'Yıldız Ambient', '12345', '   ', '',
  ];
  NEGATIVES.forEach((txt) => {
    it('temiz: ' + JSON.stringify(txt), () => {
      expect(scanText(txt)).toEqual([]);
    });
  });

  it('izinli ifade: Portal Tabancası / Portal Gun temiz; tabanca ve gun tek başına yasak', () => {
    expect(scanText('Kuantum Portal Tabancası')).toEqual([]);
    expect(scanText('portal tabancasını kullan')).toEqual([]);
    expect(scanText('Portal Gun')).toEqual([]);
    expect(scanText('tabanca').length).toBeGreaterThan(0);
    expect(scanText('a gun').length).toBeGreaterThan(0);
    expect(scanText('Portal Tabancası ve tabanca').length).toBeGreaterThan(0);
  });

  it('yaygın sözcük olan adlar yalnızca BÜYÜK harfle başlayınca isabet verir; loose kipinde yok sayılır', () => {
    expect(scanText('Apple').length).toBeGreaterThan(0);
    expect(scanText('apple')).toEqual([]);
    expect(scanText('Steam').length).toBeGreaterThan(0);
    expect(scanText('steam particle')).toEqual([]);
    expect(scanText('Apple', { loose: true })).toEqual([]);
    expect(scanText('Nike', { loose: true }).length).toBeGreaterThan(0);
    expect(scanText('Minecraft', { loose: true }).length).toBeGreaterThan(0);
  });

  it('seçenekler: brands:false / content:false', () => {
    expect(scanText('Nike', { brands: false })).toEqual([]);
    expect(scanText('vodka', { content: false })).toEqual([]);
    expect(scanText('vodka', { brands: false }).length).toBeGreaterThan(0);
    expect(scanText('Nike vodka', { content: false }).map((h) => h.cat)).toEqual(['marka']);
  });

  it('Türkçe harf duyarlı girdiler: aşk/ask, tütün/tutun, katil/katıl', () => {
    expect(scanText('aşk').length).toBeGreaterThan(0);
    expect(scanText('ask')).toEqual([]);
    expect(scanText('tutun')).toEqual([]);
    expect(scanText('tütün').length).toBeGreaterThan(0);
    expect(scanText('katılım')).toEqual([]);
    expect(scanText('katil').length).toBeGreaterThan(0);
    expect(scanText('sık')).toEqual([]);
    expect(scanText('sik').length).toBeGreaterThan(0);
    expect(scanText('SİK').length).toBeGreaterThan(0);
  });

  it('isSafeText ve trUpper', () => {
    expect(isSafeText('Merhaba şehir')).toBe(true);
    expect(isSafeText('Minecraft')).toBe(false);
    expect(trUpper('istanbul')).toBe('İSTANBUL');
    expect(trUpper('ışık')).toBe('IŞIK');
    expect(trUpper('çğıöşü')).toBe('ÇĞIÖŞÜ');
    expect(trUpper('Rüzgâr')).toBe('RÜZGÂR');
  });
});

describe('scanText — sağlamlık, belirlenimcilik, performans', () => {
  it('string olmayan girdiler çökertmez', () => {
    [null, undefined, 0, 12, NaN, true, {}, [], ['Minecraft'], { toString: () => 'vodka' }].forEach((v) => {
      expect(Array.isArray(scanText(v))).toBe(true);
    });
    expect(scanText(['Minecraft']).length).toBeGreaterThan(0);
    expect(scanText({ toString: () => 'vodka' }).length).toBeGreaterThan(0);
  });

  it('girdiyi değiştirmez, aynı girdi aynı çıktı', () => {
    const s = 'Bugün Minecraft ve v0dka ve ara saka';
    const a = JSON.stringify(scanText(s));
    expect(JSON.stringify(scanText(s))).toBe(a);
    expect(s).toBe('Bugün Minecraft ve v0dka ve ara saka');
    expect(JSON.parse(a).length).toBeGreaterThanOrEqual(3);
  });

  it('fuzz: rastgele karışık metinler asla fırlatmaz, isabet biçimi geçerli', () => {
    const rnd = mulberry32(20260701);
    const alphabet = 'abcdefghijklmnopqrstuvwxyzçğıöşüİÇĞÖŞÜ0123456789 .,-_*#@$!+\'’"<>/\\\n\t😀'
      + String.fromCharCode(0x0430, 0x0456, 0xff21, 0x0307, 0x200b);
    for (let n = 0; n < 1500; n++) {
      const len = Math.floor(rnd() * 90);
      let s = '';
      for (let i = 0; i < len; i++) s += alphabet.charAt(Math.floor(rnd() * alphabet.length));
      const hits = scanText(s);
      expect(Array.isArray(hits)).toBe(true);
      hits.forEach((h) => {
        expect(typeof h.term).toBe('string');
        expect(h.term.length).toBeGreaterThan(0);
      });
    }
    // rastgele karışımlara bilinen bir terim gömülünce her zaman yakalanır
    for (let n = 0; n < 300; n++) {
      let a = '';
      let b = '';
      for (let i = 0; i < 12; i++) a += 'abcdefgh '.charAt(Math.floor(rnd() * 9));
      for (let i = 0; i < 12; i++) b += 'abcdefgh '.charAt(Math.floor(rnd() * 9));
      expect(scanText(a + ' Minecraft ' + b).length).toBeGreaterThan(0);
    }
  });

  it('çok uzun / patolojik metinlerde hızlı (doğrusal) ve çökmez', () => {
    const t0 = Date.now();
    scanText('a '.repeat(150000));
    scanText('aaaaaaaaaa'.repeat(40000));
    scanText('ab-'.repeat(100000));
    scanText('k i l l '.repeat(20000));
    scanText('x'.repeat(2000000));
    expect(Date.now() - t0).toBeLessThan(8000);
  });

  it('kısa metin başına maliyet küçük (10k tarama)', () => {
    const t0 = Date.now();
    for (let i = 0; i < 10000; i++) scanText('Bulut Ramen: bir kase sıcak mutluluk. ' + i);
    expect(Date.now() - t0).toBeLessThan(6000);
  });
});

describe('şehir veri tabloları temiz', () => {
  const corpus = () => {
    const out = [];
    CITY_BRANDS.forEach((b) => { out.push(b.name, b.tagline, b.id); });
    CITY_AD_LINES.forEach((a) => out.push(a.text));
    OWNERS.forEach((o) => {
      out.push(o.name, o.title, o.signature.name);
      o.personality.forEach((p) => out.push(p));
      o.lines.forEach((l) => out.push(l));
    });
    Object.keys(AMBIENT_LINES).forEach((k) => AMBIENT_LINES[k].forEach((l) => out.push(l)));
    Object.keys(AMBIENT_BY_TYPE).forEach((k) => AMBIENT_BY_TYPE[k].forEach((l) => out.push(l)));
    Object.keys(AMBIENT_BY_DISTRICT).forEach((k) => AMBIENT_BY_DISTRICT[k].forEach((l) => out.push(l)));
    Object.keys(DISTRICT_NAMES).forEach((k) => out.push(DISTRICT_NAMES[k]));
    Object.keys(DISTRICT_FLAVOUR).forEach((k) => {
      const f = DISTRICT_FLAVOUR[k];
      out.push(f.tone);
      f.nouns.forEach((n) => out.push(n));
      f.streets.forEach((n) => out.push(n));
    });
    allCityNameStrings().forEach((s) => out.push(s));
    return out;
  };

  it('tüm dizgeler (dükkân, reklam, sahip, ortam, ad tabloları) yasak sözcük ve gerçek ad içermez', () => {
    const all = corpus();
    expect(all.length).toBeGreaterThan(700);
    const bad = [];
    all.forEach((s) => {
      const hits = scanText(s);
      if (hits.length) bad.push(s + ' -> ' + hits.map((h) => h.term + ':' + h.via).join(','));
    });
    expect(bad).toEqual([]);
  });

  it('aynı dizgeler dizgeler arası birleşiminde de temiz (kısa pencerelerde bitişik sızıntı yok)', () => {
    const all = corpus();
    const bad = [];
    for (let i = 0; i + 1 < all.length; i += 2) {
      const joined = all[i] + ' ' + all[i + 1];
      if (joined.length > 190) continue;
      const hits = scanText(joined);
      if (hits.length) bad.push(joined + ' -> ' + hits.map((h) => h.term).join(','));
    }
    expect(bad).toEqual([]);
  });

  it('büyük harfe çevrilmiş (tabela) biçimleri de temiz', () => {
    const bad = [];
    corpus().forEach((s) => {
      const hits = scanText(trUpper(s));
      if (hits.length) bad.push(trUpper(s) + ' -> ' + hits.map((h) => h.term).join(','));
    });
    expect(bad).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Depo taraması
 * ---------------------------------------------------------------------------------------------- */
const ALLOW_FILES = new Set([
  'src/game/kesif/sim/city/citySafeData.js',
  'src/game/kesif/sim/city/cityRealBrands.js',
  'src/game/kesif/sim/city/citySafe.test.js',
]);
const MAX_MARKERS = 3;
const SCAN_EXT = /\.(js|jsx|mjs|cjs|css|md|json|html|php|ts|tsx)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', '__snapshots__']);

const FULL_DIRS = [
  'src/game/kesif/sim/city', 'src/game/kesif/render/city', 'src/game/kesif/render/props',
  'src/components/game/kesif/city', 'src/game/kesif/sim/dim', 'src/game/kesif/sim/props', 'docs', 'config',
];
const FULL_FILES = [
  'src/game/kesif/sim/cityData.js', 'src/game/kesif/render/atlasTilesCity.js', 'src/game/kesif/gameDimension.js',
  'src/game/kesif/gameTransition.js', 'src/game/kesif/audioCity.js', 'src/game/kesif/audioRecipesDim.js',
  'src/game/kesif/audioVehicle.js', 'src/game/kesif/audioRadio.js', 'src/game/kesif/audioRadioData.js',
  'src/game/kesif/inputVehicle.js',
];
const FULL_SYSTEMS = /^(city|dimension|props|traffic|crowd|vehicle)/;

/** Eşzamanlı çalışan ajanlar geçici dosyaları silebilir: okunamayan dosya yok sayılır. */
function safeRead(rel) {
  try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return null; }
}

function norm(p) {
  return relative(ROOT, p).split(sep).join('/');
}

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  readdirSync(dir).forEach((name) => {
    if (SKIP_DIR.has(name)) return;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(name)) out.push(p);
  });
  return out;
}


function collectFull() {
  const files = [];
  FULL_DIRS.forEach((d) => walk(join(ROOT, d), files));
  FULL_FILES.forEach((f) => { if (existsSync(join(ROOT, f))) files.push(join(ROOT, f)); });
  const sysDir = join(SRC, 'game/kesif/systems');
  if (existsSync(sysDir)) {
    readdirSync(sysDir).forEach((name) => {
      if (FULL_SYSTEMS.test(name) && SCAN_EXT.test(name)) files.push(join(sysDir, name));
    });
  }
  return Array.from(new Set(files)).map(norm).filter((f) => !ALLOW_FILES.has(f));
}

describe('depo taraması', () => {
  it('lexJs: dizge, şablon, regex ve yorumları doğru ayırır', () => {
    const src = [
      '// yorum Minecraft',
      'const a = "Merhaba dünya";',
      "const b = 'Tek tırnak \\' kaçış';",
      'const r = /["\']+/g; const c = `şablon ${x + "iç dizge"} sonu`;',
      '/* blok',
      ' yorum */ const d = a / 2 / 3; const e = "son";',
    ].join('\n');
    const { strings, comments } = lexJs(src);
    const texts = strings.map((s) => s.text);
    expect(texts).toContain('Merhaba dünya');
    expect(texts).toContain('Tek tırnak \' kaçış');
    expect(texts.some((t) => t.indexOf('şablon') >= 0)).toBe(true);
    expect(texts).toContain('son');
    expect(texts.some((t) => t.indexOf('iç dizge') >= 0)).toBe(false);
    expect(comments.length).toBe(2);
    expect(comments[0].line).toBe(1);
    expect(strings.find((s) => s.text === 'son').line).toBe(6);
  });

  it('scanSource: dizgedeki yasak sözcük yakalanır; yorumdaki içerik sözcüğü yakalanmaz, marka yakalanır', () => {
    const fx = [
      'const a = "bu bir tabanca";',
      '// kill the process',
      '/* Nike Air */ const b = 1;',
      'const c = "Minecraft";',
      '// Minecraft',
    ].join('\n');
    const found = scanSource('x/y.js', fx, 'full');
    const summary = found.map((f) => f.line + ':' + f.where + ':' + f.term);
    expect(summary).toContain('1:string:tabanca');
    expect(summary.some((s) => s.indexOf('2:') === 0)).toBe(false);
    expect(summary).toContain('3:comment:Nike');
    expect(summary).toContain('4:string:minecraft');
    expect(summary).toContain('5:comment:minecraft');
  });

  it('scanSource: allow işareti (gerekçeli) satırı geçirir, gerekçesiz geçirmez', () => {
    const ok = 'const a = "tabanca"; // citysafe-allow: mevcut eşya adı';
    const nok = 'const a = "tabanca"; // citysafe-allow:';
    expect(scanSource('x.js', ok, 'full')).toEqual([]);
    expect(scanSource('x.js', nok, 'full').length).toBeGreaterThan(0);
  });

  it('scanSource: JSX metni ve test dosyası kuralları', () => {
    const jsx = 'const A = () => (<p>Bir silah buldun</p>);';
    expect(scanSource('c/A.jsx', jsx, 'full').some((f) => f.term === 'silah')).toBe(true);
    expect(scanSource('c/A.test.jsx', jsx, 'full')).toEqual([]);
    expect(scanSource('c/A.test.js', 'it("kills robots", () => {});', 'full')).toEqual([]);
    expect(scanSource('c/A.test.js', 'it("Minecraft", () => {});', 'full').length).toBeGreaterThan(0);
  });

  it('işaret kullanımı sınırlı (en çok 3, tümü gerekçeli)', () => {
    const files = collectFull().concat(norm(join(SRC, 'game/kesif/sim/city/ownerData.js')));
    let count = 0;
    files.forEach((f) => {
      const t = safeRead(f);
      if (t === null) return;
      count += t.split('\n').filter((l) => l.indexOf(ALLOW_MARKER) >= 0).length;
    });
    expect(count).toBeLessThanOrEqual(MAX_MARKERS);
  });

  it('şehir kaynakları, belgeler ve yapılandırma: yasak sözcük / gerçek marka / oyun adı isabeti 0', () => {
    const files = collectFull();
    expect(files.length).toBeGreaterThan(5);
    const found = [];
    files.forEach((f) => {
      const text = safeRead(f);
      if (text === null) return;
      scanSource(f, text, 'full').forEach((h) => found.push(h.file + ':' + h.line + ' [' + h.where + '] ' + h.term + ' (' + h.via + ')'));
    });
    expect(found).toEqual([]);
  });

  it('KEŞİF motorunun tamamında §2 gerçek oyun/marka adları (Minecraft, Cyberpunk evreni…) 0', () => {
    const files = [];
    walk(join(SRC, 'game/kesif'), files);
    walk(join(SRC, 'components/game/kesif'), files);
    walk(join(ROOT, 'docs'), files);
    walk(join(ROOT, 'config'), files);
    const found = [];
    files.map(norm).filter((f) => !ALLOW_FILES.has(f)).forEach((f) => {
      const text = safeRead(f);
      if (text === null) return;
      scanSource(f, text, 'brand').forEach((h) => found.push(h.file + ':' + h.line + ' ' + h.term));
    });
    expect(found).toEqual([]);
  });

  it('izinli liste yalnızca üç veri/test dosyasıdır ve hepsi gerçekten mevcut', () => {
    expect(ALLOW_FILES.size).toBe(3);
    ALLOW_FILES.forEach((f) => expect(existsSync(join(ROOT, f)), f).toBe(true));
  });
});

describe('görünmez karakterler ve birleştirici işaretler', () => {
  const ZW = String.fromCharCode(0x200b);
  const SHY = String.fromCharCode(0x00ad);
  const RLM = String.fromCharCode(0x200f);
  const DOT = String.fromCharCode(0x0307);
  const cases = [
    'Mine' + ZW + 'craft', 'k' + SHY + 'i' + SHY + 'l' + SHY + 'l', 'Ara' + RLM + 'saka', 'M' + DOT + 'inecraft',
    'v' + ZW + 'o' + ZW + 'd' + ZW + 'k' + ZW + 'a', 'N' + ZW + 'i' + ZW + 'g' + ZW + 'h' + ZW + 't City',
  ];
  cases.forEach((txt) => {
    it('yakalar: ' + JSON.stringify(txt), () => {
      expect(scanText(txt).length).toBeGreaterThan(0);
    });
  });

  it('görünmez karakter içeren masum metin temiz kalır', () => {
    expect(scanText('Bulut' + ZW + ' Ramen')).toEqual([]);
    expect(scanText('Sıkı' + SHY + ' tut')).toEqual([]);
  });
});

describe('şehir modüllerinden erişilebilen tüm dizgeler (var olanlar)', () => {
  const loaders = import.meta.glob([
    './*.js', './*/*.js', '../dim/*.js', '../props/*.js', '../cityData.js', '../../render/atlasTilesCity.js',
    '!./**/*.test.js', '!../dim/*.test.js', '!../props/*.test.js',
  ]);
  const SKIP_MODULE = /citySafeData|cityRealBrands|TestKit|Kit\.js$/;

  function collect(val, out, seen, depth) {
    if (typeof val === 'string') { out.push(val); return; }
    if (!val || typeof val !== 'object' || depth > 7 || seen.has(val) || ArrayBuffer.isView(val)) return;
    seen.add(val);
    if (val instanceof Map || val instanceof Set) { val.forEach((v) => collect(v, out, seen, depth + 1)); return; }
    Object.keys(val).forEach((k) => {
      let v;
      try { v = val[k]; } catch { return; }
      collect(v, out, seen, depth + 1);
    });
  }

  it('her modül yüklenir; dışa aktarılan nesnelerdeki hiçbir dizge yasak sözcük / gerçek ad içermez', async () => {
    const names = Object.keys(loaders).filter((n) => !SKIP_MODULE.test(n));
    expect(names.length).toBeGreaterThanOrEqual(6);
    const failed = [];
    const bad = [];
    for (let i = 0; i < names.length; i++) {
      let mod = null;
      try { mod = await loaders[names[i]](); } catch (e) { failed.push(names[i] + ': ' + (e && e.message)); continue; }
      const strings = [];
      const seen = new Set();
      Object.keys(mod).forEach((k) => collect(mod[k], strings, seen, 0));
      strings.forEach((s) => {
        if (s.length > 400) return;
        const hits = scanText(s);
        if (hits.length) bad.push(names[i] + ' -> ' + JSON.stringify(s) + ' : ' + hits.map((h) => h.term).join(','));
      });
    }
    expect(failed).toEqual([]);
    expect(bad).toEqual([]);
  });
});
