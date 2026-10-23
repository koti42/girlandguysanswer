import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_HUD, HUD_DIMS, HUD_LIGHT_KINDS, HUD_LIGHT_RANGE, HUD_UI_STATES, HUD_VEHICLE_CLASSES, createHudPublisher, createHudStore, hudEqual,
  hudSignature, isImportantChange, sanitizeHud,
} from './hudStore.js';
import { makeMutableHud } from './gameCtx.js';
import { LIGHT_LABELS, LIGHT_RANGE } from './sim/city/cityHudData.js';
import { LIGHT_SHAPES } from '../../components/game/kesif/city/lightShapes.js';
import { mulberry32 } from './sim/rng.js';

describe('Neon Meridyen HUD alanları: varsayılanlar', () => {
  it('EMPTY_HUD: ana diyar, bölge adı boş, yükleme/araç/şehir yok; derin donuk', () => {
    expect(EMPTY_HUD.dim).toBe('overworld');
    expect(EMPTY_HUD.district).toBe('');
    expect(EMPTY_HUD.dimLoading).toBeNull();
    expect(EMPTY_HUD.vehicle).toBeNull();
    expect(EMPTY_HUD.city).toBeNull();
    expect(Object.isFrozen(EMPTY_HUD)).toBe(true);
  });

  it('sanitizeHud({}) EMPTY_HUD ile içerik olarak aynı; makeMutableHud aynı anahtar kümesi', () => {
    expect(hudEqual(sanitizeHud({}), EMPTY_HUD)).toBe(true);
    expect(Object.keys(makeMutableHud(null, 'macera')).sort()).toEqual(Object.keys(EMPTY_HUD).sort());
    expect(hudEqual(sanitizeHud(makeMutableHud(null, 'macera')), sanitizeHud({}))).toBe(true);
  });

  it('ui durumları: dialogue, vendor, garage, photo, loading eklendi ve geçer; büyük harf/bilinmeyen reddedilir', () => {
    ['dialogue', 'vendor', 'garage', 'photo', 'loading'].forEach((k) => {
      expect(HUD_UI_STATES).toContain(k);
      expect(sanitizeHud({ ui: k }).ui).toBe(k);
    });
    expect(sanitizeHud({ ui: 'Loading' }).ui).toBe('none');
    expect(sanitizeHud({ ui: 'shop' }).ui).toBe('none');
    // eskiler bozulmadı
    ['none', 'inventory', 'pause', 'dead', 'machine'].forEach((k) => expect(HUD_UI_STATES).toContain(k));
    expect(new Set(HUD_UI_STATES).size).toBe(HUD_UI_STATES.length);
  });
});

describe('dim, district', () => {
  it('dim beyaz liste', () => {
    expect(HUD_DIMS).toEqual(['overworld', 'neon']);
    expect(sanitizeHud({ dim: 'neon' }).dim).toBe('neon');
    expect(sanitizeHud({ dim: 'overworld' }).dim).toBe('overworld');
    ['mars', 'NEON', '', null, 5, {}, [], true].forEach((v) => expect(sanitizeHud({ dim: v }).dim).toBe('overworld'));
  });

  it('district: kırpılır, kontrol karakteri atılır, ilkel olmayan boş', () => {
    expect(sanitizeHud({ district: '  Gece Pazarı ' }).district).toBe('Gece Pazarı');
    expect(sanitizeHud({ district: 'a\u0000b\u2028c' }).district).toBe('a b c');
    expect(sanitizeHud({ district: 'x'.repeat(200) }).district.length).toBe(48);
    expect(sanitizeHud({ district: {} }).district).toBe('');
    expect(sanitizeHud({ district: null }).district).toBe('');
  });
});

describe('dimLoading', () => {
  it('yalnız etkinken nesne; ilerleme 0..1 kıskaç; NaN → 0; etiket 80 karakter', () => {
    expect(sanitizeHud({ dimLoading: { active: true, progress: 0.4166, label: 'Boyut geçişi…' } }).dimLoading).toEqual({ active: true, progress: 0.417, label: 'Boyut geçişi…' });
    expect(sanitizeHud({ dimLoading: { active: true, progress: 5 } }).dimLoading.progress).toBe(1);
    expect(sanitizeHud({ dimLoading: { active: true, progress: -2 } }).dimLoading.progress).toBe(0);
    expect(sanitizeHud({ dimLoading: { active: true, progress: NaN } }).dimLoading.progress).toBe(0);
    expect(sanitizeHud({ dimLoading: { active: true, progress: 'x' } }).dimLoading.progress).toBe(0);
    expect(sanitizeHud({ dimLoading: { active: true, label: 'y'.repeat(300) } }).dimLoading.label.length).toBe(80);
  });

  it('etkin değil / geçersiz → null (kapanınca arayüz yeniden çizilir)', () => {
    [{ active: false, progress: 1, label: '' }, { active: 1 }, { active: 'true' }, null, [], 5, 'x', undefined].forEach((v) => {
      expect(sanitizeHud({ dimLoading: v }).dimLoading).toBeNull();
    });
  });
});

describe('vehicle (yer tutucu)', () => {
  it('geçerli sınıf: alanlar sınırlanır; bilinmeyen alan atılır', () => {
    const v = sanitizeHud({ vehicle: { cls: 'taksi', kmh: 999, gear: -5, nitro: 3, drift: 'evet', camera: 9, bogus: 1 } }).vehicle;
    expect(v).toEqual({ cls: 'taksi', kmh: 400, gear: -1, nitro: 1, drift: false, camera: 3 });
    expect(sanitizeHud({ vehicle: { cls: 'hoverbike', kmh: 61.7, gear: 3, nitro: 0.5, drift: true, camera: 1 } }).vehicle).toEqual({ cls: 'hoverbike', kmh: 61, gear: 3, nitro: 0.5, drift: true, camera: 1 });
  });

  it('bilinmeyen sınıf, dizi, ilkel → null; tüm sınıflar kabul', () => {
    ['ucak', 'TAKSI', '', 5, null].forEach((c) => expect(sanitizeHud({ vehicle: { cls: c } }).vehicle).toBeNull());
    expect(sanitizeHud({ vehicle: [] }).vehicle).toBeNull();
    expect(sanitizeHud({ vehicle: 'taksi' }).vehicle).toBeNull();
    HUD_VEHICLE_CLASSES.forEach((c) => expect(sanitizeHud({ vehicle: { cls: c } }).vehicle.cls).toBe(c));
    expect(HUD_VEHICLE_CLASSES).toEqual(['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay']);
  });
});

describe('city:{kredi,district,mission,radio,light}', () => {
  const full = {
    kredi: 125.9,
    district: 'gece_pazari',
    mission: { title: 'Paketi teslim et', sub: 'Ramen Barı', dist: 312.4, timeLeft: 95 },
    radio: 'Neon FM 88.8',
    light: { kind: 'terminal', dist: 12.34, text: 'Terminal' },
  };

  it('geçerli şehir durumu: tamsayılar, bölge anahtarı, görev, radyo, ışık', () => {
    expect(sanitizeHud({ city: full }).city).toEqual({
      kredi: 125,
      district: 'gece_pazari',
      mission: { title: 'Paketi teslim et', sub: 'Ramen Barı', dist: 312, timeLeft: 95 },
      radio: 'Neon FM 88.8',
      light: { kind: 'terminal', dist: 12.3, text: 'Terminal' },
    });
  });

  it('kredi: negatif/NaN/dev değerler güvenli', () => {
    expect(sanitizeHud({ city: { kredi: -5 } }).city.kredi).toBe(0);
    expect(sanitizeHud({ city: { kredi: NaN } }).city.kredi).toBe(0);
    expect(sanitizeHud({ city: { kredi: Infinity } }).city.kredi).toBe(0);
    expect(sanitizeHud({ city: { kredi: 1e30 } }).city.kredi).toBe(1e9);
    expect(sanitizeHud({ city: { kredi: '40' } }).city.kredi).toBe(40);
  });

  it('bölge anahtarı yalnız [a-z0-9_] (≤ 24); aksi boş', () => {
    ['MERKEZ', 'a b', 'çay', '', 'x'.repeat(25), 5, null, {}, '../x'].forEach((d) => expect(sanitizeHud({ city: { district: d } }).city.district).toBe(''));
    expect(sanitizeHud({ city: { district: 'alt_sehir' } }).city.district).toBe('alt_sehir');
  });

  it('görev: başlıksız → null; süre yok = −1; uzunluklar sınırlı', () => {
    expect(sanitizeHud({ city: { mission: { title: '' } } }).city.mission).toBeNull();
    expect(sanitizeHud({ city: { mission: { sub: 'x' } } }).city.mission).toBeNull();
    expect(sanitizeHud({ city: { mission: 'x' } }).city.mission).toBeNull();
    expect(sanitizeHud({ city: { mission: { title: 'A' } } }).city.mission).toEqual({ title: 'A', sub: '', dist: 0, timeLeft: -1 });
    const m = sanitizeHud({ city: { mission: { title: 'a'.repeat(200), sub: 'b'.repeat(500), dist: 1e9, timeLeft: 1e9 } } }).city.mission;
    expect(m.title.length).toBe(80);
    expect(m.sub.length).toBe(140);
    expect(m.dist).toBe(100000);
    expect(m.timeLeft).toBe(86400);
  });

  it('ışık ipucu: tür beyaz listede, menzil ≤ 40, metin dolu; aksi null', () => {
    expect(HUD_LIGHT_RANGE).toBe(40);
    const mk = (l) => sanitizeHud({ city: { light: l } }).city.light;
    expect(mk({ kind: 'kapi', dist: 40, text: 'Kapı' })).toEqual({ kind: 'kapi', dist: 40, text: 'Kapı' });
    expect(mk({ kind: 'kapi', dist: 40.5, text: 'Kapı' })).toBeNull();
    expect(mk({ kind: 'kapi', dist: -3, text: 'Kapı' }).dist).toBe(0);
    expect(mk({ kind: 'roket', dist: 3, text: 'x' })).toBeNull();
    expect(mk({ kind: 'cip', dist: 3, text: '' })).toBeNull();
    expect(mk({ kind: 'cip', dist: NaN, text: 'x' })).toBeNull();
    expect(mk({ kind: 'cip', text: 'x' })).toBeNull();
    expect(mk([])).toBeNull();
    expect(mk('terminal')).toBeNull();
    HUD_LIGHT_KINDS.forEach((k) => expect(mk({ kind: k, dist: 5, text: 'T' }).kind).toBe(k));
  });

  it('şehir olmayan girişler null', () => {
    [null, undefined, [], 'x', 5, true].forEach((c) => expect(sanitizeHud({ city: c }).city).toBeNull());
  });

  it('ışık ipucu türleri: sim tablolarıyla (ad) ve şekillerle (görsel) birebir; menzil sabiti aynı; şekiller ayrı', () => {
    expect(LIGHT_RANGE).toBe(HUD_LIGHT_RANGE);
    expect(Object.keys(LIGHT_LABELS).sort()).toEqual(HUD_LIGHT_KINDS.slice().sort());
    expect(Object.keys(LIGHT_SHAPES).sort()).toEqual(HUD_LIGHT_KINDS.slice().sort());
    const sigs = HUD_LIGHT_KINDS.map((k) => LIGHT_SHAPES[k].shape);
    expect(new Set(sigs).size).toBe(HUD_LIGHT_KINDS.length);
    const pts = HUD_LIGHT_KINDS.map((k) => LIGHT_SHAPES[k].points);
    expect(new Set(pts).size).toBe(HUD_LIGHT_KINDS.length);
  });
});

describe('portals.mode (Portal Tabancası boyut kipi)', () => {
  const base = { held: true, mavi: false, turuncu: false, charge: 12, max: 24, cells: 1, canFire: true, next: 'mavi' };
  it("'boyut' geçer; bilinmeyen/yok 'normal'", () => {
    expect(sanitizeHud({ portals: { ...base, mode: 'boyut' } }).portals.mode).toBe('boyut');
    expect(sanitizeHud({ portals: { ...base, mode: 'normal' } }).portals.mode).toBe('normal');
    expect(sanitizeHud({ portals: base }).portals.mode).toBe('normal');
    ['Boyut', 5, null, {}, 'x'].forEach((m) => expect(sanitizeHud({ portals: { ...base, mode: m } }).portals.mode).toBe('normal'));
  });
});

describe('yayın: dim / bölge / yükleme önemli değişimdir', () => {
  const base = () => ({ hp: 20, ui: 'none', selected: 0, zone: { id: 0 }, quest: { title: 'a' }, boss: null, banner: null, hint: null, dim: 'overworld', district: '', dimLoading: null });

  it('hudSignature dim/district/loading taşır; ilkel kopya', () => {
    const h = { ...base(), dim: 'neon', district: 'Merkez', dimLoading: { active: true } };
    const sig = hudSignature(h, {});
    expect(sig.dim).toBe('neon');
    expect(sig.district).toBe('Merkez');
    expect(sig.loading).toBe(true);
    h.district = 'x';
    expect(sig.district).toBe('Merkez');
  });

  it('boyut, bölge ve yükleme değişimi anında yayımlanır; küçük değişim değil', () => {
    const sig = hudSignature(base(), {});
    expect(isImportantChange(sig, { ...base(), fps: 60 })).toBe(false);
    expect(isImportantChange(sig, { ...base(), city: { kredi: 5 } })).toBe(false);
    expect(isImportantChange(sig, { ...base(), dim: 'neon' })).toBe(true);
    expect(isImportantChange(sig, { ...base(), district: 'Merkez' })).toBe(true);
    expect(isImportantChange(sig, { ...base(), dimLoading: { active: true, progress: 0.1 } })).toBe(true);
    const sig2 = hudSignature({ ...base(), dimLoading: { active: true, progress: 0.1 } }, {});
    expect(isImportantChange(sig2, { ...base(), dimLoading: { active: true, progress: 0.6 } })).toBe(false);
    expect(isImportantChange(sig2, { ...base(), dimLoading: { active: false } })).toBe(true);
  });

  it('yayıncı: bölge değişimi 15 Hz kısıtını beklemez', () => {
    let t = 0;
    const out = [];
    const pub = createHudPublisher((h) => out.push(h.district), { now: () => t, setTimer: () => 1, clearTimer: () => {} });
    pub.push({ ...base() });
    t = 10;
    pub.push({ ...base(), fps: 3 });
    expect(out.length).toBe(1);
    t = 20;
    pub.push({ ...base(), district: 'Liman ve Sanayi' });
    expect(out).toEqual(['', 'Liman ve Sanayi']);
  });
});

describe('depo', () => {
  it('şehir alanları değişince abonelere haber verir; aynı içerik vermez; donuk temiz kopya', () => {
    const s = createHudStore();
    const ok = vi.fn();
    s.subscribe(ok);
    const h = { dim: 'neon', district: 'Merkez', city: { kredi: 3, district: 'merkez', light: { kind: 'terminal', dist: 5, text: 'Terminal' } } };
    expect(s.set(h)).toBe(true);
    expect(s.set(JSON.parse(JSON.stringify(h)))).toBe(false);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(s.get().city.light.text).toBe('Terminal');
    expect(Object.isFrozen(s.get())).toBe(false); // temiz kopya (EMPTY_HUD donuk, sanitize çıktısı düz)
    expect(s.set({ ...h, city: { ...h.city, light: { kind: 'terminal', dist: 6, text: 'Terminal' } } })).toBe(true);
    expect(s.set({ ...h, city: null })).toBe(true);
    expect(s.get().city).toBeNull();
  });

  it('giriş nesnesi değiştirilmez, sonuç belleği paylaşmaz', () => {
    const city = { kredi: 3, district: 'merkez', mission: { title: 'x' }, light: { kind: 'kapi', dist: 4, text: 'Kapı' } };
    const out = sanitizeHud({ city });
    expect(out.city).not.toBe(city);
    expect(out.city.light).not.toBe(city.light);
    city.light.text = 'değişti';
    expect(out.city.light.text).toBe('Kapı');
  });
});

describe('fuzz', () => {
  const rnd = mulberry32(0x6e656f6e);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const junk = () => pick([null, undefined, NaN, Infinity, -Infinity, 0, -1, 1e308, '', 'x', '__proto__', 'constructor', [], {}, [1, 2], { a: 1 }, true, false, 'neon', 'taksi', 'terminal', '\u0000\u202e']);
  const obj = (keys) => {
    const o = {};
    keys.forEach((k) => {
      if (rnd() < 0.8) o[k] = junk();
    });
    if (rnd() < 0.2) o.__proto__ = { polluted: 1 };
    return o;
  };

  it('2000 rastgele HUD: hata yok, sayılar sonlu, listeler beyaz listede, JSON güvenli, kirlilik yok', () => {
    for (let i = 0; i < 2000; i++) {
      const h = obj(['dim', 'district', 'dimLoading', 'vehicle', 'city', 'ui', 'portals']);
      if (rnd() < 0.5) h.city = obj(['kredi', 'district', 'mission', 'radio', 'light']);
      if (rnd() < 0.5 && h.city && typeof h.city === 'object') h.city.light = obj(['kind', 'dist', 'text']);
      if (rnd() < 0.5 && h.city && typeof h.city === 'object') h.city.mission = obj(['title', 'sub', 'dist', 'timeLeft']);
      if (rnd() < 0.5) h.dimLoading = obj(['active', 'progress', 'label']);
      if (rnd() < 0.5) h.vehicle = obj(['cls', 'kmh', 'gear', 'nitro', 'drift', 'camera']);
      if (rnd() < 0.5) h.portals = obj(['held', 'mode', 'next']);
      const s = sanitizeHud(h);
      expect(HUD_DIMS).toContain(s.dim);
      expect(HUD_UI_STATES).toContain(s.ui);
      expect(typeof s.district).toBe('string');
      if (s.dimLoading) {
        expect(s.dimLoading.active).toBe(true);
        expect(Number.isFinite(s.dimLoading.progress)).toBe(true);
        expect(s.dimLoading.progress >= 0 && s.dimLoading.progress <= 1).toBe(true);
      }
      if (s.vehicle) {
        expect(HUD_VEHICLE_CLASSES).toContain(s.vehicle.cls);
        [s.vehicle.kmh, s.vehicle.gear, s.vehicle.nitro, s.vehicle.camera].forEach((n) => expect(Number.isFinite(n)).toBe(true));
      }
      if (s.city) {
        expect(Number.isInteger(s.city.kredi) && s.city.kredi >= 0).toBe(true);
        expect(s.city.district === '' || /^[a-z0-9_]{1,24}$/.test(s.city.district)).toBe(true);
        if (s.city.light) {
          expect(HUD_LIGHT_KINDS).toContain(s.city.light.kind);
          expect(s.city.light.dist >= 0 && s.city.light.dist <= 40).toBe(true);
          expect(s.city.light.text.length > 0).toBe(true);
        }
        if (s.city.mission) {
          expect(s.city.mission.title.length > 0).toBe(true);
          expect(s.city.mission.timeLeft >= -1).toBe(true);
        }
      }
      if (s.portals) expect(['normal', 'boyut']).toContain(s.portals.mode);
      expect(() => JSON.stringify(s)).not.toThrow();
      expect(Object.keys(s).sort()).toEqual(Object.keys(EMPTY_HUD).sort());
    }
    expect({}.polluted).toBeUndefined();
  });
});
