/*
 * KEŞİF — garaj paneli saf yardımcıları (vehicle_ui). DOM/React yok; node'da test edilir.
 *
 *   TAB_ORDER                      ['mine','buy','rent']
 *   buyState(entry, kredi, ownedCount, capacity) → {ok, reason, text}     reason: 'sahip'|'dolu'|'kilit'|'kredi'|''
 *   rentState(entry, kredi, rentalActive)        → {ok, reason, text}     reason: 'kiralik'|'kredi'|''
 *   apiMessage(kind, res)          api sonucu (ok/reason) → Türkçe ileti (ekran okuyucu duyurusu)
 *   swatchHex(list, i)             '#rrggbb' (sınırlı; geçersiz → gri)
 *   previewModel(view, cls, cos)   SVG ön izleme: {kind, body, accent, neon, glow, wheelStyle, plate}
 *   SHAPES                         renk körü şekil adı → svg yol (16×16)
 */
import { getVehicleDef, plateFor } from '../../../../game/kesif/sim/city/vehicle/vehicleData.js';

export const TAB_ORDER = Object.freeze(['mine', 'buy', 'rent']);
export const TAB_LABEL = Object.freeze({ mine: 'Garajım', buy: 'Satın al', rent: 'Kirala' });

export const SHAPES = Object.freeze({
  daire: 'M8 2.500a5.500 5.500 0 100 11 5.500 5.500 0 000-11z',
  üçgen: 'M8 2.200L14 13H2z',
  kare: 'M3 3h10v10H3z',
  yıldız: 'M8 1.800l1.900 4 4.300.500-3.200 3 .900 4.300L8 11.400 4.100 13.600 5 9.300 1.800 6.300l4.300-.500z',
  elmas: 'M8 1.500L14.500 8 8 14.500 1.500 8z',
});

export function shapePath(name) {
  return Object.prototype.hasOwnProperty.call(SHAPES, name) ? SHAPES[name] : SHAPES.daire;
}

const fmt = (n) => String(Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));

export function buyState(entry, kredi, ownedCount, capacity) {
  if (!entry) return { ok: false, reason: 'yok', text: '' };
  if (entry.owned) return { ok: false, reason: 'sahip', text: 'Garajında' };
  if (ownedCount >= capacity) return { ok: false, reason: 'dolu', text: 'Garaj dolu (en çok ' + capacity + ' araç)' };
  if (!entry.unlocked) return { ok: false, reason: 'kilit', text: 'Kilitli: ' + fmt(entry.needKm) + ' km sür' };
  if (kredi < entry.price) return { ok: false, reason: 'kredi', text: 'Yetersiz Kredi: ' + fmt(entry.price - kredi) + ' eksik' };
  return { ok: true, reason: '', text: entry.price > 0 ? fmt(entry.price) + ' Kredi' : 'Ücretsiz' };
}

export function rentState(entry, kredi, rentalActive) {
  if (!entry) return { ok: false, reason: 'yok', text: '' };
  if (rentalActive) return { ok: false, reason: 'kiralik', text: 'Önce kiralık aracı teslim et' };
  if (kredi < entry.rent) return { ok: false, reason: 'kredi', text: 'Yetersiz Kredi: ' + fmt(entry.rent - kredi) + ' eksik' };
  return { ok: true, reason: '', text: entry.rent > 0 ? fmt(entry.rent) + ' Kredi · 10 dk' : 'Ücretsiz' };
}

const MSG = {
  buy: {
    ok: 'Araç garajına eklendi.',
    kredi: 'Yetersiz Kredi.',
    kilit: 'Bu araç için daha çok sürmelisin.',
    sahip: 'Bu araç zaten garajında.',
    dolu: 'Garaj dolu.',
    boyut: 'Şehirde değilsin.',
  },
  rent: {
    ok: 'Araç kiralandı: yanında hazır.',
    uzak: 'Kiralama noktasına yaklaş.',
    kredi: 'Yetersiz Kredi.',
    surulen: 'Önce şu anki kiralık aracını bırak.',
    bilinmeyen: 'Kiralama yapılamadı.',
  },
  summon: {
    ok: 'Aracın yanında hazır.',
    'arac-yok': 'Garajında araç yok.',
    park: 'Yakında boş park yeri yok: bir garaja ya da yola yaklaş.',
    surulen: 'Aracı şu an sürüyorsun.',
    boyut: 'Şehirde değilsin.',
  },
};

export function apiMessage(kind, res) {
  const t = MSG[kind] || MSG.buy;
  if (!res || typeof res !== 'object') return 'İşlem yapılamadı.';
  if (res.ok) return t.ok;
  return (typeof res.reason === 'string' && Object.prototype.hasOwnProperty.call(t, res.reason) && t[res.reason]) || 'İşlem yapılamadı.';
}

export function swatchHex(list, i) {
  const s = Array.isArray(list) ? list[i] : null;
  const hex = s && typeof s.hex === 'number' && Number.isFinite(s.hex) ? s.hex & 0xffffff : 0x8a909c;
  return '#' + hex.toString(16).padStart(6, '0');
}

export function previewModel(view, cls, cos) {
  const d = getVehicleDef(cls);
  const sw = (view && view.swatches) || {};
  const c = cos || {};
  const u = c.under || {};
  const wheelNames = ['klasik', 'spor', 'neon', 'kalin'];
  return {
    kind: d ? d.kind : 'araba',
    cls,
    body: swatchHex(sw.body, c.body | 0),
    accent: swatchHex(sw.accent, c.accent | 0),
    neon: swatchHex(sw.neon, c.neon | 0),
    glow: u.on === true ? swatchHex(sw.neon, u.color | 0) : '',
    pattern: u.pattern | 0,
    wheelStyle: wheelNames[c.wheels | 0] || 'klasik',
    plate: plateFor(0, c.plate | 0),
  };
}
