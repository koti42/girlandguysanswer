/*
 * KEŞİF — NPC arayüzü (DialogueSheet / VendorPanel) için SAF yardımcılar (React'siz test edilir).
 *
 *   paginateText(text, max) → string[]              uzun metni cümle/sözcük sınırında sayfalara böler (her sayfa ≤ max kr; tek sözcük max'ı aşabilir)
 *   typewriterShown(text, elapsedMs, cps) → {shown, done}   daktilo ilerlemesi (sözcük ortasında bölünmez gösterim için yalnız uzunluk; surrogate güvenli)
 *   choiceFromKey(e) → 1..4 | 0                      klavye olayı → seçenek numarası (Digit1–4, Numpad1–4, '1'–'4'); değiştirici tuş varsa 0
 *   moodHue(mood) → CSS renk (HSL) metni            ruh hâline göre vurgu rengi
 *   portraitSpec(look, kind) → {skin, hair, top, hairStyle, acc, robot, scale}   SVG büst için renkler/şekil sınıfları
 *   stepperMax(offer, kredi) → en çok alınabilir adet (stok, günlük sınır, Kredi)
 *   buyLabel(o, n) / sellLabel(s, n) → ekran okuyucu metni · clampQty(n, max) → 1..max
 */
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from '../../../../game/avatar/catalog.js';

export const TYPEWRITER_CPS = 55;
export const PAGE_MAX = 120;

export function paginateText(text, max) {
  const lim = max > 0 ? Math.floor(max) : PAGE_MAX;
  const s = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!s) return [''];
  if (s.length <= lim) return [s];
  const pages = [];
  let cur = '';
  const push = () => {
    if (cur) pages.push(cur);
    cur = '';
  };
  // önce cümleler, sonra sözcükler
  const sentences = s.match(/[^.!?…]+[.!?…]*\s*/g) || [s];
  sentences.forEach((raw) => {
    const sent = raw.trim();
    if (!sent) return;
    if (!cur) {
      if (sent.length <= lim) { cur = sent; return; }
    } else if ((cur + ' ' + sent).length <= lim) {
      cur += ' ' + sent;
      return;
    } else {
      push();
      if (sent.length <= lim) { cur = sent; return; }
    }
    sent.split(' ').forEach((w) => {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= lim) cur += ' ' + w;
      else {
        push();
        cur = w;
      }
    });
  });
  push();
  return pages.length > 0 ? pages : [s];
}

export function typewriterShown(text, elapsedMs, cps) {
  const t = String(text);
  const chars = Array.from(t);
  const rate = cps > 0 ? cps : TYPEWRITER_CPS;
  const n = Math.max(0, Math.min(chars.length, Math.floor((elapsedMs / 1000) * rate)));
  return { shown: n >= chars.length ? t : chars.slice(0, n).join(''), done: n >= chars.length };
}

export function choiceFromKey(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return 0;
  const code = typeof e.code === 'string' ? e.code : '';
  let m = /^(?:Digit|Numpad)([1-4])$/.exec(code);
  if (m) return parseInt(m[1], 10);
  const key = typeof e.key === 'string' ? e.key : '';
  m = /^([1-4])$/.exec(key);
  return m ? parseInt(m[1], 10) : 0;
}

const MOOD_HUE = Object.freeze({
  selam: 188, neşe: 48, merak: 280, dost: 135, yagmur: 215, gece: 255, veda: 20, hevesli: 330, sakin: 200,
});
export function moodHue(mood) {
  const h = Object.prototype.hasOwnProperty.call(MOOD_HUE, mood) ? MOOD_HUE[mood] : MOOD_HUE.sakin;
  return 'hsl(' + h + ' 85% 62%)';
}

const hex = (list, i, d) => (Number.isInteger(i) && i >= 0 && i < list.length ? list[i] : d);

export function portraitSpec(look, kind) {
  const l = look || {};
  const hair = l.hair || {};
  const top = l.top || {};
  return {
    skin: l.robot ? '#cfe3ee' : hex(SKIN_TONES, l.skin, SKIN_TONES[1]),
    hair: hex(HAIR_COLORS, hair.color, HAIR_COLORS[0]),
    top: hex(CLOTH_COLORS, top.color, CLOTH_COLORS[4]),
    hairStyle: hair.style || 'kisa',
    acc: l.acc || 'none',
    robot: !!l.robot,
    scale: l.scale && l.scale < 0.9 ? 0.86 : 1,
    kind: kind || '',
  };
}

export function stepperMax(offer, kredi) {
  if (!offer || !offer.canBuy) return 0;
  const byStock = Math.max(0, offer.left | 0);
  const byLimit = Math.max(0, offer.limit | 0);
  const byKredi = offer.price > 0 ? Math.floor(Math.max(0, kredi | 0) / offer.price) : 64;
  return Math.max(0, Math.min(byStock, byLimit, byKredi, 64));
}

export function buyLabel(o, n) {
  return 'Satın al: ' + o.name + ' x' + n + ', ' + o.price * n + ' Kredi';
}

export function sellLabel(s, n) {
  return 'Sat: ' + s.name + ' x' + n + ', ' + s.price * n + ' Kredi kazan';
}

export function clampQty(n, max) {
  const m = Math.max(0, Math.floor(max) || 0);
  const k = Math.floor(n) || 1;
  if (m === 0) return 1;
  return k < 1 ? 1 : k > m ? m : k;
}
