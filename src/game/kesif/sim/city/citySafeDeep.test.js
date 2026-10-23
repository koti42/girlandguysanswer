/*
 * Neon Meridyen — Faz 5 güvenlik denetimi (safety_audit; sözleşme §2, §22.4–22.5), citySafe.test.js'e EK (o dosya değişmeden geçerlidir).
 *  1. Genişletilmiş yasak kategoriler: suç / polis / savaş, korkutucu içerik, nefret, baskı (karanlık desen), kişisel bilgi isteme, siyaset
 *     + yeni uyuşturucu / kumar / alkol girdileri (karşıt pozitifler + masum negatifler)
 *  2. Çarpık yazım: leet, "ph", boşluk/ayraç, homoglif (Kiril/Yunan/küçük büyük harf/daire içi/matematik yazı), aksan katlama, sıfır genişlik, bulanık marka
 *  3. Simge/emoji yasağı, bağlantı + kişisel bilgi tarayıcısı (scanLinks)
 *  4. Tüm şehir modüllerinden erişilen dizgeler: bulanık marka + bağlantı + simge taraması (hepsi temiz)
 *  5. Depo: ek kullanıcı metni dosyaları (rehber, harita, dokunmatik düzen, HUD verisi) tam kipte; ağ/izleme/dış bağlantı/serbest metin girdisi YOK
 *  6. Üretimde hata ayıklama kapalı: ?debug=1 ve opts.debug yalnız geliştirme derlemesinde etkindir (gameCtx)
 *  7. Aile dostu ton: kısa/uzun söz yapıları (ünlem sınırı, büyük harfle bağırma yok), Kredi/jeton metinlerinde baskı kalıbı yok
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BANNED_CATEGORIES, REAL_BRANDS, foldTr, scanLinks, scanText,
} from './citySafeData.js';
import { lexJs, scanSource } from './citySafeScan.js';
import { createGameContext } from '../../gameCtx.js';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const SRC = join(ROOT, 'src');
const FUZZ = { fuzzy: true };

function safeRead(rel) {
  try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return null; }
}

const cats = (t, o) => scanText(t, o).map((h) => h.cat);
/** Adlar parçalardan kurulur: bu dosya kendi taramasına (§2 oyun adı 0 depo testi) takılmasın. */
const J = (...p) => p.join('');

/* ------------------------------------------------------------------------------------------------ 1) yeni kategoriler */
describe('genişletilmiş yasak kategoriler', () => {
  const POS = {
    suc: ['Polis arabası', 'polis merkezi', 'Savaş alanı', 'asker kışlası', 'hırsız yakalandı', 'soygun planı', 'mafya babası', 'çete lideri',
      'hapishane kapısı', 'tutuklandı', 'suçlu', 'police', 'bank heist', 'war zone', 'soldier', 'gangster', 'prison break', 'kidnapped',
      'hostage', 'spy mission', 'casus ajan', 'dedektif', 'kaçakçı', 'cezaevi', 'rehine'],
    korku: ['hayalet ev', 'canavar', 'kabus', 'zombi', 'vampir', 'cadı', 'şeytan', 'korku evi', 'korku filmi', 'mezarlık', 'ghost', 'monster',
      'nightmare', 'horror', 'creepy', 'zombie', 'haunted house', 'kafatası', 'zehirli', 'ölüm'],
    nefret: ['zenci', 'çingene', 'gavur', 'şişko', 'topal', 'sakat', 'cahil', 'dilenci'],
    baski: ['Son fırsat!', 'Sakın kaçırma', 'Sadece bugün', 'Sınırlı süre', 'Hemen satın al', 'Gerçek para ile', 'Kredi kartı', 'Premium üyelik',
      'Davet kodu gir', 'Arkadaşını davet et', 'Paylaş ve kazan', 'Bedava jeton', 'Jeton satın al', 'buy now', 'last chance'],
    kisisel: ['Telefon numaran nedir?', 'Adresin nerede?', 'Okulunun adı ne?', 'Gerçek adın ne?', 'Kaç yaşındasın?', 'Nerede oturuyorsun?',
      'Şifreni söyle', 'Fotoğrafını gönder', 'what is your phone number', 'where do you live'],
    siyaset: ['siyasi parti', 'seçim propagandası', 'cumhurbaşkanı', 'milletvekili'],
    uyusturucu: ['esrar', 'hashiş', 'afyon', 'morfin', 'amfetamin'],
    alkol: ['kokteyl barı', 'kadeh kaldır'],
    kumar: ['çekiliş', 'tombala', 'bingo', 'şans kutusu', 'gizemli kutu', 'mystery box'],
  };
  Object.keys(POS).forEach((cat) => {
    POS[cat].forEach((txt) => {
      it('yakalar [' + cat + ']: ' + JSON.stringify(txt), () => {
        expect(cats(txt), txt).toContain(cat);
      });
    });
  });

  const NEG = [
    'Korkuluk', 'Köprü korkuluğu sağlam', 'çöp kutusu', 'cop_kutusu', 'Alçak masa', 'hayal et', 'Hayal kur, hayal et', 'Çin lokantası', 'sakin bir gün',
    'Sakinlik burada', 'Topaz renkli ışık', 'esrarengiz bir ışık', 'ölçüm yap', 'Ölçek 1:20', 'warp tüneli', 'warning', 'policy', 'developer',
    'devices', 'Asansör', 'askı', 'tutuk', 'Kasa Kâşifi', 'Gece Pazarı', 'Bulut Ramen', 'Pilot Kafe',
    'Savunma kalkanı yok', 'Suyun sesi', 'Çekirdek', 'Çekim yap', 'Kurye paketi', 'Bahçe', 'Çatı iskelesi',
    'Mavi çiçek', 'Bakır Tel', 'Kredi', 'Kredi çipi', 'Jeton ödülü', 'Günlük sınır', 'Hoş geldin!', 'İyi şanslar!',
  ];
  NEG.forEach((txt) => {
    it('temiz: ' + JSON.stringify(txt), () => {
      expect(scanText(txt, FUZZ)).toEqual([]);
    });
  });

  it('yeni kategoriler dolu, yinelenen yok, önek kökleri >= 4 harf', () => {
    ['suc', 'korku', 'nefret', 'baski', 'kisisel', 'siyaset'].forEach((c) => {
      expect(BANNED_CATEGORIES[c].length, c).toBeGreaterThanOrEqual(4);
      expect(Object.isFrozen(BANNED_CATEGORIES[c]), c).toBe(true);
    });
    const all = [];
    Object.keys(BANNED_CATEGORIES).forEach((c) => BANNED_CATEGORIES[c].forEach((w) => all.push(w)));
    expect(new Set(all).size).toBe(all.length);
  });
});

/* ------------------------------------------------------------------------------------------------ 2) çarpık yazım */
describe('çarpık yazım: leet, boşluk, homoglif, aksan, bulanık', () => {
  const ZW = String.fromCharCode(0x200b);
  const mapStr = (s, fn) => Array.from(s).map(fn).join('');
  const smallCaps = (s) => mapStr(s, (c) => ({
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', y: 'ʏ',
  }[c] || c));
  const circled = (s) => mapStr(s.toLowerCase(), (c) => (c >= 'a' && c <= 'z' ? String.fromCodePoint(0x24d0 + c.charCodeAt(0) - 97) : c));
  const mathBold = (s) => mapStr(s, (c) => (c >= 'a' && c <= 'z' ? String.fromCodePoint(0x1d41a + c.charCodeAt(0) - 97) : (c >= 'A' && c <= 'Z' ? String.fromCodePoint(0x1d400 + c.charCodeAt(0) - 65) : c)));
  const fullWidth = (s) => mapStr(s, (c) => (c >= '!' && c <= '~' ? String.fromCodePoint(c.charCodeAt(0) + 0xfee0) : c));
  const interleave = (s, sep) => Array.from(s).join(sep);

  const WORDS = [J('Mine', 'craft'), J('Ara', 'saka'), J('Cyber', 'punk'), J('Night', ' City'), J('Mili', 'tech'), 'Fortnite', 'Pokemon', 'Nike', 'Adidas', 'Starbucks', 'Netflix'];
  WORDS.forEach((w) => {
    const forms = {
      'küçük büyük': w.toUpperCase(),
      'boşluklu': interleave(w.replace(/ /g, ''), ' '),
      'noktalı': interleave(w.replace(/ /g, ''), '.'),
      'alt çizgili': interleave(w.replace(/ /g, ''), '_'),
      'tireli': interleave(w.replace(/ /g, ''), '-'),
      'sıfır genişlik': interleave(w, ZW),
      'tam genişlik': fullWidth(w),
      'küçük büyük harf (small caps)': smallCaps(w.toLowerCase()),
      'daire içi': circled(w),
      'matematik kalın': mathBold(w),
      'aksanlı': w.replace(/e/g, 'é').replace(/a/g, 'á').replace(/i/g, 'ï').replace(/o/g, 'ö'),
    };
    Object.keys(forms).forEach((k) => {
      it(w + ' [' + k + ']', () => {
        expect(scanText(forms[k], FUZZ).length, JSON.stringify(forms[k])).toBeGreaterThan(0);
      });
    });
  });

  const CASES = [
    J('m1n3', 'cr4ft'), J('M!N3', 'CR4FT'), J('4r4', 's4k4'), J('N!GHT', ' C!TY'), J('Cyb3r', 'punk'), J('Mil1', 'tech'), 'F0rtn1te', 'Starbuks',
    // Kiril / Yunan benzer harfler
    J('Мine', 'craft'), J('Міnе', 'сrаft'), J('Arаs', 'аkа'), String.fromCharCode(0x39c) + J('INE', 'CRAFT'), 'ѕһіt',
    // sesteş / bozuk yazım (bulanık)
    J('Mine', 'kraft'), J('Mine', ' kraft'), 'Starbuks', 'MekDonalds', 'Mc Donalds', J('Cyber', 'pank'), 'Nite City', 'Phuck', 'phuck',
    // Türkçe katlama / noktalı i
    'KİLL', 'SİGARA', 'SIGARA', 'ŞARAP', 'Hırsız', 'p o l i s', 'h ı r s ı z',
  ];
  CASES.forEach((txt) => {
    it('yakalar: ' + JSON.stringify(txt), () => {
      expect(scanText(txt, FUZZ).length).toBeGreaterThan(0);
    });
  });

  it('foldTr: aksan, noktalı/noktasız i, homoglif, tam genişlik, sıfır genişlik', () => {
    expect(foldTr('ÇĞİÖŞÜ çğıöşü')).toBe('cgiosu cgiosu');
    expect(foldTr('Ｍｉｎｅ')).toBe('mine');
    expect(foldTr('Мinе')).toBe('mine');
    expect(foldTr('a' + ZW + 'b')).toBe('ab');
    expect(foldTr('ᴍɪɴᴇ')).toBe('mine');
  });

  it('bulanık tarama yalnız BÜYÜK harfle başlayan özel adlara bakar (kod anahtarı / CSS sınıfı yanlış pozitif vermez)', () => {
    ['photo-shot', 'kph-primary', 'portal_terminal', 'simulation', 'primary', 'tracker_state'].forEach((t) => {
      expect(scanText(t, FUZZ), t).toEqual([]);
    });
  });

  it('bulanık tarama kapalıyken varsayılan davranış değişmez', () => {
    expect(scanText('Minekraft')).toEqual([]);
    expect(scanText('Minekraft', FUZZ).length).toBeGreaterThan(0);
  });

  it('REAL_BRANDS: yeni kişi / eser adları taranınca isabet verir', () => {
    ['Blade Runner', 'The Matrix', 'Ghost in the Shell', 'Atatürk', 'Erdoğan', 'Donald Trump', 'Sezen Aksu', 'Cristiano Ronaldo', 'Squid Game', 'Lionel Messi']
      .forEach((n) => expect(REAL_BRANDS, n).toContain(n));
    ['Blade Runner', 'Atatürk', 'Erdoğan', 'Sezen Aksu', 'Squid Game'].forEach((n) => expect(cats(n), n).toContain('marka'));
  });

  it('fuzz: fuzzy + links asla fırlatmaz ve belirlenimlidir', () => {
    let seed = 20261020;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const alphabet = 'abcçdefgğhıijklmnoöprsştuüvyz ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789.-_@:/ аα​é';
    for (let n = 0; n < 800; n++) {
      let s = '';
      const len = Math.floor(rnd() * 80);
      for (let i = 0; i < len; i++) s += alphabet.charAt(Math.floor(rnd() * alphabet.length));
      const a = JSON.stringify([scanText(s, FUZZ), scanLinks(s)]);
      expect(JSON.stringify([scanText(s, FUZZ), scanLinks(s)])).toBe(a);
    }
  });
});

/* ------------------------------------------------------------------------------------------------ 3) simge + bağlantı */
describe('simge / emoji yasağı ve bağlantı + kişisel bilgi tarayıcısı', () => {
  const BAD = [0x1f52b, 0x1f5e1, 0x2694, 0x1f4a3, 0x1f52a, 0x1f480, 0x2620, 0x1f47b, 0x1f9df, 0x1f37a, 0x1f377, 0x1f6ac, 0x1f48a, 0x1f489, 0x1f3b0, 0x1f51e, 0x1f48b, 0x5350, 0x534d, 0x262d];
  BAD.forEach((cp) => {
    it('simge yasak: U+' + cp.toString(16).toUpperCase(), () => {
      const hits = scanText('Merhaba ' + String.fromCodePoint(cp), { brands: false });
      expect(hits.map((h) => h.cat)).toContain('sembol');
    });
  });
  it('masum emoji ve simgeler temiz', () => {
    ['😀', '⭐', '🎵', '🚗', '🔦', '🍎', '☕', '🌧', '→', '◉', '✓', '★'].forEach((e) => expect(scanText('Selam ' + e), e).toEqual([]));
    expect(scanText('🔫', { content: false })).toEqual([]);
  });

  const LINKS = [
    'www.ornek.com', 'WWW . ORNEK . COM', 'https://x.y/z', 'http://a.b', 'ftp://sunucu', 'ornek.com', 'ornek nokta com', 'ornek (dot) net', 'ornek [dot] org',
    'mehmet@ornek.com', 'mehmet (at) ornek.com', 'ornek [at] mail.com', 'bana yaz: 0555 123 45 67', '05551234567', '+90 555 123 45 67', '0 (555) 123-45-67',
    '@kullanici', 'Takip et @kullanici_adi', 'mailto:x@y.z', 'javascript:alert(1)', 'data:text/html;base64,AAAA', 'tel:112', 'file:///etc/passwd', 'wss://sunucu',
  ];
  LINKS.forEach((t) => {
    it('bağlantı/PII yakalar: ' + JSON.stringify(t), () => {
      expect(scanLinks(t).length, t).toBeGreaterThan(0);
    });
  });
  const CLEAN = [
    'Neon FM 88.8', 'saat 10:30', 'x2 hız', 'v1.2', 'Kat 12', 'map.js', 'Segoe UI, sans-serif', '12345', '3.5 saniye', 'Bulut Ramen: bir kase sıcak mutluluk.',
    'Hadi gel. De bakalım, hazır mısın?', 'Bitti. Co-op yok.', 'Gün 3, saat 18:45', '1 000 Kredi', '240 çip, 90 grafiti, 30 gizli oda', 'A-B-C', 'Kredi: 619', '', '   ',
  ];
  CLEAN.forEach((t) => {
    it('bağlantı/PII temiz: ' + JSON.stringify(t), () => {
      expect(scanLinks(t), t).toEqual([]);
    });
  });
  it('scanLinks sağlam: string olmayan girdiler ve uzun metin', () => {
    [null, undefined, 0, NaN, {}, [], true].forEach((v) => expect(Array.isArray(scanLinks(v))).toBe(true));
    const t0 = Date.now();
    scanLinks('a'.repeat(300000));
    scanLinks('a.'.repeat(100000));
    scanLinks('0'.repeat(200000));
    scanLinks('@'.repeat(100000));
    expect(Date.now() - t0).toBeLessThan(6000);
  });
});

/* ------------------------------------------------------------------------------------------------ 4) modül dizgeleri */
describe('şehir modüllerinden erişilen dizgeler: bulanık marka + bağlantı + simge', () => {
  const loaders = import.meta.glob([
    './*.js', './*/*.js', './*/*/*.js', '../dim/*.js', '../props/*.js', '../cityData.js', '../../render/atlasTilesCity.js',
    '!./**/*.test.js', '!../dim/*.test.js', '!../props/*.test.js',
  ]);
  const SKIP = /citySafeData|citySafeScan|cityRealBrands|TestKit|Kit\.js$|testKit/;

  function collect(val, out, seen, depth) {
    if (typeof val === 'string') { out.push(val); return; }
    if (!val || typeof val !== 'object' || depth > 8 || seen.has(val) || ArrayBuffer.isView(val)) return;
    seen.add(val);
    if (val instanceof Map || val instanceof Set) { val.forEach((v) => collect(v, out, seen, depth + 1)); return; }
    Object.keys(val).forEach((k) => {
      let v;
      try { v = val[k]; } catch { return; }
      collect(v, out, seen, depth + 1);
    });
  }

  it('hiçbir dizge bulanık marka / yasak sözcük / bağlantı / kişisel bilgi / simge içermez', async () => {
    const names = Object.keys(loaders).filter((n) => !SKIP.test(n));
    expect(names.length).toBeGreaterThanOrEqual(40);
    const failed = [];
    const bad = [];
    let total = 0;
    for (let i = 0; i < names.length; i++) {
      let mod = null;
      try { mod = await loaders[names[i]](); } catch (e) { failed.push(names[i] + ': ' + (e && e.message)); continue; }
      const strings = [];
      const seen = new Set();
      Object.keys(mod).forEach((k) => collect(mod[k], strings, seen, 0));
      strings.forEach((s) => {
        if (s.length > 400) return;
        total++;
        const hits = scanText(s, FUZZ);
        const links = scanLinks(s);
        if (hits.length || links.length) bad.push(names[i] + ' -> ' + JSON.stringify(s.slice(0, 90)) + ' : ' + hits.map((h) => h.term + ':' + h.via).concat(links.map((l) => l.kind + ':' + l.match)).join(','));
      });
    }
    expect(total).toBeGreaterThan(4000);
    expect(failed).toEqual([]);
    expect(bad).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------ 5) depo denetimi */
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', '__snapshots__']);
function walk(dir, out, re) {
  if (!existsSync(dir)) return out;
  readdirSync(dir).forEach((name) => {
    if (SKIP_DIR.has(name)) return;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out, re);
    else if (re.test(name)) out.push(p);
  });
  return out;
}
const norm = (p) => relative(ROOT, p).split(sep).join('/');
const isTest = (f) => /\.test\.(js|jsx)$|__tests__|TestKit|testKit|Kit\.js$/.test(f);

describe('depo: ek kullanıcı metni dosyaları tam kipte, ağ / izleme / serbest metin yok', () => {
  const EXTRA_FULL = [
    'src/components/game/kesif/CityGuide.jsx', 'src/components/game/kesif/kxCityGuide.js', 'src/components/game/kesif/kxTouchLayout.js',
    'src/components/game/kesif/panelMap.js', 'src/components/game/kesif/MapScreen.jsx', 'src/components/game/kesif/PauseMenu.jsx',
    'src/components/game/kesif/PauseHowTo.jsx', 'src/components/game/kesif/KesifHud.jsx', 'src/components/game/kesif/JournalPanel.jsx',
    'src/game/kesif/systems/contentMapCity.js', 'src/game/kesif/hudStore.js', 'src/game/kesif/gameUi.js', 'src/embed/EmbedKesif.jsx',
  ];

  it('ek dosyalar: dizge / JSX / yorum taraması (bulanık dahil) temiz; tanımlayıcı anahtarlar (tek küçük sözcük) sayılmaz', () => {
    const found = [];
    let n = 0;
    EXTRA_FULL.forEach((f) => {
      const t = safeRead(f);
      if (t === null) return;
      n++;
      scanSource(f, t, 'full', FUZZ).forEach((h) => {
        // tarif/anahtar kimlikleri (ör. rec('gun')) kullanıcıya gösterilmez
        const line = t.split('\n')[h.line - 1] || '';
        if (h.where === 'string' && new RegExp('[\'"]' + h.term + '[\'"]').test(line) && /^[a-z]{2,12}$/.test(h.term)) return;
        found.push(f + ':' + h.line + ' ' + h.term + ' (' + h.via + ')');
      });
    });
    expect(n).toBeGreaterThanOrEqual(8);
    expect(found).toEqual([]);
  });

  it('şehir kaynaklarında (dizge) dış bağlantı, e-posta, telefon, kullanıcı adı yok', () => {
    const files = [];
    ['src/game/kesif/sim/city', 'src/game/kesif/render/city', 'src/game/kesif/render/props', 'src/components/game/kesif/city', 'src/game/kesif/sim/dim', 'src/game/kesif/sim/props']
      .forEach((d) => walk(join(ROOT, d), files, /\.(js|jsx)$/));
    ['src/game/kesif/sim/cityData.js', 'src/game/kesif/render/atlasTilesCity.js'].forEach((f) => files.push(join(ROOT, f)));
    const bad = [];
    files.map(norm).filter((f) => !isTest(f) && !/citySafeData|citySafeScan|cityRealBrands/.test(f)).forEach((f) => {
      const t = safeRead(f);
      if (t === null) return;
      lexJs(t).strings.forEach((s) => {
        if (s.text.length > 400) return;
        // GLSL / SVG / MIME ve dosya yolu dizgeleri bağlantı değildir
        if (/^(\/\/|\.\.?\/|\/src\/|http:\/\/www\.w3\.org)/.test(s.text)) return;
        if (/[;{}]|\bvec[234]\b|\bfloat\b|\buniform\b|=>/.test(s.text)) return; // GLSL / kod parçası
        if (/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(s.text)) return; // SVG yol verisi
        const l = scanLinks(s.text);
        if (l.length) bad.push(f + ':' + s.line + ' ' + l[0].kind + ':' + l[0].match);
      });
    });
    expect(bad).toEqual([]);
  });

  const ENGINE_DIRS = ['src/game/kesif', 'src/components/game/kesif'];
  const NET = [
    [/\bfetch\s*\(/, 'fetch'], [/XMLHttpRequest/, 'XHR'], [/sendBeacon/, 'sendBeacon'], [/new\s+WebSocket/, 'WebSocket'], [/EventSource/, 'EventSource'],
    [/importScripts/, 'importScripts'], [/window\.open\s*\(/, 'window.open'], [/document\.cookie/, 'cookie'],
    [/\b(gtag|dataLayer|googletagmanager|google-analytics|mixpanel|amplitude|hotjar|fbq|sentry|clarity\.ms|segment\.com)\b/i, 'izleme'],
    [/target\s*=\s*["']_blank["']/, 'target=_blank'], [/\bhref\s*=\s*["']https?:/i, 'dış href'],
    [/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(|\beval\s*\(|new\s+Function\s*\(/, 'HTML/kod enjeksiyonu yüzeyi'],
  ];
  it('oyun motoru ve arayüz kaynaklarında ağ çıkışı, izleme, dış bağlantı yok (ağ yalnız enjekte edilen api üzerinden sayfa katmanındadır)', () => {
    const files = [];
    ENGINE_DIRS.forEach((d) => walk(join(ROOT, d), files, /\.(js|jsx)$/));
    expect(files.length).toBeGreaterThan(300);
    const bad = [];
    files.map(norm).filter((f) => !isTest(f)).forEach((f) => {
      const t = safeRead(f);
      if (t === null) return;
      const code = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      NET.forEach(([re, name]) => { if (re.test(code)) bad.push(f + ' ' + name); });
      lexJs(t).strings.forEach((s) => { if (/https?:\/\//i.test(s.text)) bad.push(f + ':' + s.line + ' url'); });
    });
    expect(bad).toEqual([]);
  });

  it('şehir arayüzünde serbest metin girişi yok (input/textarea/contentEditable): yalnız düğme, kaydırıcı, onay kutusu', () => {
    const files = walk(join(ROOT, 'src/components/game/kesif/city'), [], /\.jsx$/).map(norm).filter((f) => !isTest(f));
    expect(files.length).toBeGreaterThanOrEqual(15);
    const bad = [];
    files.forEach((f) => {
      const t = safeRead(f) || '';
      if (/<textarea\b|contentEditable|type\s*=\s*["']text["']|type\s*=\s*["']search["']|type\s*=\s*["']email["']|type\s*=\s*["']tel["']/i.test(t)) bad.push(f);
      const inputs = t.match(/<input\b[^>]*>/g) || [];
      inputs.forEach((i) => { if (!/type\s*=\s*["'](range|checkbox|radio)["']/.test(i)) bad.push(f + ' ' + i.slice(0, 60)); });
    });
    expect(bad).toEqual([]);
  });

  it('şehir arayüzü yerel depolama anahtarları yalnız "kesif." önekli tercihlerdir (kişisel veri yok)', () => {
    const files = walk(join(ROOT, 'src/components/game/kesif/city'), [], /\.(js|jsx)$/).map(norm).filter((f) => !isTest(f));
    const keys = [];
    files.forEach((f) => {
      const t = safeRead(f) || '';
      (t.match(/(?:PREFS_KEY|STORAGE_KEY|_KEY)\s*=\s*['"][^'"]+['"]/g) || []).forEach((m) => keys.push(m));
    });
    keys.forEach((m) => expect(m, m).toMatch(/['"]kesif\./));
  });
});

/* ------------------------------------------------------------------------------------------------ 6) üretimde hata ayıklama kapalı */
describe('üretim derlemesinde hata ayıklama kapalı (gameCtx)', () => {
  const realLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  afterEach(() => {
    vi.unstubAllEnvs();
    if (realLocation) Object.defineProperty(globalThis, 'location', realLocation);
    else delete globalThis.location;
  });
  const mk = (opts) => createGameContext({ strictSystems: false, ...(opts || {}) }, { mode: 'macera', seed: 5 });
  const setSearch = (search) => Object.defineProperty(globalThis, 'location', { value: { search }, configurable: true, writable: true });

  it('DEV kapalıyken ?debug=1 ve opts.debug yok sayılır; DEV açıkken çalışır', () => {
    setSearch('?debug=1');
    vi.stubEnv('DEV', false);
    expect(mk().debug).toBe(false);
    expect(mk({ debug: true }).debug).toBe(false);
    vi.stubEnv('DEV', true);
    expect(mk().debug).toBe(true);
    setSearch('');
    expect(mk().debug).toBe(false);
    expect(mk({ debug: true }).debug).toBe(true);
  });

  it('kaynakta geliştirme kancaları yalnız DEV / debug koşuluyla kurulur (window.__game / __dbg yok)', () => {
    const files = [];
    walk(join(ROOT, 'src'), files, /\.(js|jsx)$/);
    const bad = [];
    files.map(norm).filter((f) => !isTest(f)).forEach((f) => {
      const t = safeRead(f) || '';
      if (/window\.__game\s*=|window\.__dbg\s*=|window\.__G\s*=|globalThis\.__game\s*=|globalThis\.__G\s*=/.test(t)) bad.push(f);
    });
    expect(bad).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------ 7) aile dostu ton */
describe('aile dostu ton: Kredi / jeton / satıcı metinlerinde baskı kalıbı yok', () => {
  it('satıcı, görev, başarım ve HUD metinleri: büyük harfle bağırma yok, ardışık ünlem ≤ 1, baskı kalıpları yok', async () => {
    const [vendor, hud, ach, quests, city] = await Promise.all([
      import('./ped/vendorData.js'), import('./cityHudData.js'), import('./mission/achievements.js'), import('./mission/quests.js'), import('./cityBrands.js'),
    ]);
    const texts = [];
    const take = (v, d) => {
      if (typeof v === 'string') texts.push(v);
      else if (v && typeof v === 'object' && d < 6) Object.keys(v).forEach((k) => take(v[k], d + 1));
    };
    [vendor.VENDORS, hud, ach.ACHIEVEMENTS, quests.QUESTS, city.CITY_AD_LINES].forEach((v) => take(v, 0));
    expect(texts.length).toBeGreaterThan(300);
    const bad = [];
    texts.forEach((t) => {
      if (t.length < 12 || !/\s/.test(t)) return;
      if (/!!/.test(t)) bad.push('!! ' + t);
      const letters = t.replace(/[^A-ZÇĞİÖŞÜa-zçğıöşü]/g, '');
      if (letters.length >= 10 && letters === letters.toUpperCase()) bad.push('BAĞIRMA ' + t);
      // foldTr ASCII'ye katlar: kalıplar da katlanmış (ASCII) yazılır
      if (/(sakin kacirma|kacirma sakin|son sans|son firsat|hemen al\b|acele et\b|sadece bugun|stoklar tukeniyor|tukenmeden|sinirli sure)/.test(foldTr(t))) bad.push('baskı ' + t);
    });
    expect(bad).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------ 8) yanıp sönme (erişilebilirlik: > 3 Hz parlaklık değişimi yok) */
describe('boyut kapısı görseli: şarj sırasında titreşim yok (faz integrali, ≤ 3 Hz)', () => {
  it('girdap fazı CPU\'da hız integralidir; kare başına faz artışı hız × dt ile sınırlı (uTime × hız çarpımı yok)', async () => {
    const THREE = await import('three');
    const { createGateVisual, GATE_SHADERS } = await import('../../render/city/gateVisual.js');
    expect(GATE_SHADERS.FRAG).toMatch(/uniform float uPhase;/);
    expect(GATE_SHADERS.FRAG).not.toMatch(/uTime\s*\*\s*speed/);
    expect(GATE_SHADERS.PVERT).not.toMatch(/uTime\s*\*\s*speed/);
    const g = createGateVisual(THREE, { quality: 'high' });
    g.show({ id: 1, kind: 'out', x: 0, y: 64, z: 0, nx: 0, nz: 1 });
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 25; i++) g.update(dt); // kapı 25 sn açık kaldı (uTime büyük): önceki hata burada ortaya çıkıyordu
    let prev = g.uniforms.uPhase.value;
    let maxStep = 0;
    for (let i = 0; i < 60; i++) {
      g.setCharge(Math.min(1, i / 48)); // 0,8 sn şarj eğrisi
      g.update(dt);
      const cur = g.uniforms.uPhase.value;
      maxStep = Math.max(maxStep, (cur - prev) / dt);
      prev = cur;
    }
    // faz hızı en çok (1 + 3.5) = 4,5 kat; ani sıçrama yok
    expect(maxStep).toBeLessThanOrEqual(4.5 + 1e-6);
    expect(maxStep).toBeGreaterThan(1);
    g.dispose();
  });

  it('girdap gölgelendiricisindeki tüm zaman katsayıları, en hızlı şarjda bile her noktada ≤ 3 Hz verir', async () => {
    const { GATE_SHADERS } = await import('../../render/city/gateVisual.js');
    const coeffs = [];
    const re = /\bt\s*\*\s*([0-9]+(?:\.[0-9]+)?)/g;
    let m = re.exec(GATE_SHADERS.FRAG);
    while (m) { coeffs.push(Number(m[1])); m = re.exec(GATE_SHADERS.FRAG); }
    expect(coeffs.length).toBeGreaterThanOrEqual(3);
    const SPEED_MAX = 4.5;
    coeffs.forEach((c) => expect((c * SPEED_MAX) / (2 * Math.PI), 't*' + c).toBeLessThanOrEqual(3));
  });
});

/* ------------------------------------------------------------------------------------------------ 9) plaka metinleri */
describe('araç plakaları: çağrışımlı kısaltma ve sayı çıkmaz, belirlenimli kalır', () => {
  it('NM-XX NNNN biçimi korunur; yasaklı ikililer / 666 / 1488 / 1312 hiç üretilmez (5000 tohum × 8 dizin)', async () => {
    const { plateFor, PLATE_AVOID } = await import('./vehicle/vehicleData.js');
    expect(PLATE_AVOID.length).toBeGreaterThanOrEqual(8);
    const bad = [];
    for (let s = 0; s < 5000; s++) {
      for (let i = 0; i < 8; i++) {
        const p = plateFor(s * 7919 + 13, i);
        expect(p).toMatch(/^NM-[A-Z]{2} [0-9]{4}$/);
        expect(plateFor(s * 7919 + 13, i)).toBe(p);
        const pair = p.slice(3, 5);
        const num = p.slice(6);
        if (PLATE_AVOID.indexOf(pair) >= 0 || num.indexOf('666') >= 0 || num === '1488' || num === '1312') bad.push(p);
        const hits = scanText(p, { fuzzy: true });
        if (hits.length) bad.push(p + ' ' + hits.map((h) => h.term).join(','));
      }
    }
    expect(bad).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------ 10) üretim paketi: yasak liste verisi pakete girmez */
describe('yasak sözcük / gerçek ad listesi yalnız test ve araçlarda', () => {
  it('üretim kaynakları citySafeData / cityRealBrands / citySafeScan içe aktarmaz (trUpper cityText.js\'tedir)', () => {
    const files = walk(join(ROOT, 'src'), [], /\.(js|jsx)$/).map(norm).filter((f) => !isTest(f));
    expect(files.length).toBeGreaterThan(500);
    const bad = [];
    files.forEach((f) => {
      if (/citySafeData\.js$|cityRealBrands\.js$|citySafeScan\.js$/.test(f)) return;
      const t = safeRead(f) || '';
      if (/from\s+['"][^'"]*(citySafeData|cityRealBrands|citySafeScan)(\.js)?['"]/.test(t)) bad.push(f);
    });
    expect(bad).toEqual([]);
  });

  it('cityText.trUpper citySafeData.trUpper ile aynıdır ve Türkçe kurallıdır', async () => {
    const a = await import('./cityText.js');
    const b = await import('./citySafeData.js');
    expect(a.trUpper).toBe(b.trUpper);
    expect(a.trUpper('ışık istanbul çğöşü')).toBe('IŞIK İSTANBUL ÇĞÖŞÜ');
  });
});
