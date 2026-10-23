/*
 * KEŞİF oyun içi arayüz — saf yardımcılar (React yok; node'da test edilebilir).
 * Metinler Türkçe; ikon/renk eşlemeleri ve biçimlendirme burada toplanır.
 */
import { ITEMS } from '../../../game/kesif/sim/items.js';

/** Hotbar yuva sayısı (hudStore.HUD_LIMITS.hotbarSlots ile aynı). */
export const HOTBAR_SLOTS = 9;

const trNum = typeof Intl !== 'undefined' && Intl.NumberFormat ? new Intl.NumberFormat('tr-TR') : null;

/** 12345 → "12.345" (tr-TR), sonlu değilse "0". */
export function formatCount(n) {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return trNum ? trNum.format(v) : String(v);
}

/** Eşyanın Türkçe adı; tabloda yoksa anahtarın ':' sonrası (altçizgi → boşluk). */
export function itemLabel(key) {
  if (typeof key !== 'string' || !key) return '';
  const it = ITEMS[key];
  if (it && it.name) return it.name;
  const tail = key.indexOf(':') >= 0 ? key.slice(key.indexOf(':') + 1) : key;
  return tail.replace(/_/g, ' ');
}

/** Eşya uzak menzilli silah mı (yay, ışın tüfeği)? Artı imleci buna göre değişir. */
export function itemIsRanged(key) {
  const it = typeof key === 'string' ? ITEMS[key] : null;
  return Boolean(it && it.weapon && it.weapon.ranged);
}

/** Sayıyı [lo,hi] aralığına sıkıştırır; sonlu değilse lo. */
export function clamp(v, lo, hi) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** Parkur süresi: 83.456 → "1:23.45". */
export function formatClock(sec) {
  const s = clamp(sec, 0, 359999);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const cs = Math.floor((rest - whole) * 100);
  return m + ':' + String(whole).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
}

/** Oynama süresi: 8130 → "2 sa 15 dk"; 95 → "1 dk 35 sn". */
export function formatDuration(sec) {
  const s = Math.floor(clamp(sec, 0, 8640000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return h + ' sa ' + m + ' dk';
  if (m > 0) return m + ' dk ' + r + ' sn';
  return r + ' sn';
}

/**
 * Can/açlık simgeleri: yarım puan = 1 birim; her simge 2 birim. En çok `cap` simge.
 * Dönen dizi 'full' | 'half' | 'empty' değerleri taşır.
 */
export function iconStates(value, max, cap = 20) {
  const m = clamp(max, 0, cap * 2);
  const n = Math.min(cap, Math.ceil(m / 2));
  const v = clamp(value, 0, m);
  const out = [];
  for (let i = 0; i < n; i++) {
    const left = v - i * 2;
    out.push(left >= 2 ? 'full' : left >= 1 ? 'half' : 'empty');
  }
  return out;
}

/** Oksijen saniyesi (tam = 15 sn) → 10 baloncuk; son baloncuk kısmi olabilir. */
export function bubbleStates(oxygen, full = 15) {
  const per = full / 10;
  const o = clamp(oxygen, 0, 60);
  const out = [];
  for (let i = 0; i < 10; i++) {
    const left = o - i * per;
    out.push(left >= per ? 'full' : left > 0 ? 'half' : 'empty');
  }
  return out;
}

/** Dokunmatik (parmak, fare yok) cihaz mı? matchMedia yoksa (node/jsdom) false. */
export function isTouchUi() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

// Masaüstü deyimi → dokunmatik karşılığı. Sıra önemli: uzun kalıplar önce.
const TOUCH_RULES = [
  [/\s*\((?:sol|sağ) tık\)/gi, ''],
  [/\s*\(Shift\)/g, ''],
  [/Shift\s*\+\s*tık/gi, 'çift dokunma'],
  [/sağ tıklayarak/gi, 'dokunarak'],
  [/sağ tıklayıp/gi, 'dokunup'],
  [/sağ tıkla/gi, 'dokun'],
  [/sol tık/gi, 'Kır düğmesi'],
  [/sağ tık/gi, 'dokunma'],
];

/**
 * Oyun metinlerindeki "sağ tıkla / (sol tık) / Shift + tık" gibi fare deyimlerini dokunmatik karşılıklarına çevirir
 * (sağ tık = dünyaya dokun = Yerleştir/Kullan, sol tık = Kır düğmesi). `force` verilmezse yalnızca dokunmatik
 * cihazda çalışır; masaüstünde metin aynen döner.
 */
export function touchText(text, force) {
  if (typeof text !== 'string' || text.length === 0) return text;
  if (!(force === true || (force === undefined && isTouchUi()))) return text;
  let out = text;
  for (let i = 0; i < TOUCH_RULES.length; i++) out = out.replace(TOUCH_RULES[i][0], TOUCH_RULES[i][1]);
  return out;
}

/** "[E] Kol'u çek" → { key:'E', text:"Kol'u çek" }; köşeli parantez yoksa key null. */
export function parseHint(hint) {
  if (typeof hint !== 'string') return null;
  const t = hint.trim();
  if (!t) return null;
  const m = /^\[([^\]]{1,12})\]\s*(.*)$/.exec(t);
  if (m) return { key: m[1], text: touchText(m[2] || '') };
  return { key: null, text: touchText(t) };
}

/** Günün saati → simge türü. */
export function timeKind(time) {
  const t = typeof time === 'string' ? time.toLocaleLowerCase('tr-TR') : '';
  if (t.indexOf('gece') >= 0) return 'night';
  if (t.indexOf('batım') >= 0 || t.indexOf('batim') >= 0 || t.indexOf('akşam') >= 0) return 'sunset';
  if (t.indexOf('şafak') >= 0 || t.indexOf('safak') >= 0 || t.indexOf('sabah') >= 0) return 'sunrise';
  return 'day';
}

/** Hava durumu → simge türü ('' = yok). */
export function weatherKind(weather) {
  const w = typeof weather === 'string' ? weather.toLocaleLowerCase('tr-TR') : '';
  if (w.indexOf('kar') >= 0) return 'snow';
  if (w.indexOf('yağmur') >= 0 || w.indexOf('yagmur') >= 0) return 'rain';
  if (w.indexOf('sis') >= 0) return 'fog';
  return '';
}

/** Parkur kademeleri (zorluk 1..5): ad + şekil simgesi (renk körlüğü için renge ek). */
export const PARKOUR_TIERS = Object.freeze([
  null,
  Object.freeze({ name: 'Bronz', shape: 'circle', color: '#d9894c' }),
  Object.freeze({ name: 'Gümüş', shape: 'square', color: '#c9d3e0' }),
  Object.freeze({ name: 'Altın', shape: 'triangle', color: '#f2c94c' }),
  Object.freeze({ name: 'Elmas', shape: 'diamond', color: '#6fd8ff' }),
  Object.freeze({ name: 'Kuantum', shape: 'star', color: '#c58bff' }),
]);

export function parkourTier(d) {
  const i = Math.floor(clamp(d, 1, 5));
  return PARKOUR_TIERS[i];
}

/**
 * Yetenek tablosu. `button`: dokunmatik düğme adı (null = pasif/özel jest), `key`: klavye ipucu.
 * Oturum farklı eşliyorsa KesifHud/TouchControls'a `abilityButtons` verilir.
 */
export const ABILITY_META = Object.freeze({
  doubleJump: Object.freeze({ label: 'Çift Zıplama', hint: 'Havada Zıpla', button: null, key: null, icon: 'jump' }),
  grapple: Object.freeze({ label: 'Kanca', hint: 'Kanca fırlat', button: 'ability1', key: 'Z', icon: 'grapple' }),
  glide: Object.freeze({ label: 'Planör', hint: 'Havada planör aç', button: 'ability2', key: 'X', icon: 'glide' }),
  portalGun: Object.freeze({ label: 'Portal Silahı', hint: 'Portal aç', button: 'ability3', key: 'G', icon: 'portal' }),
});

export const ABILITY_ORDER = Object.freeze(['doubleJump', 'grapple', 'glide', 'portalGun']);

/** Ölüm nedeni → çocuk dostu Türkçe cümle. `info` metin ya da { cause, by } olabilir. */
/** Motorun Türkçe ölüm nedenleri (survival.js) → DeathScreen'in anahtarları. */
const DEATH_CAUSE_ALIAS = { düşme: 'fall', boğulma: 'drown', açlık: 'hunger', boşluk: 'void', lav: 'lava', yaratık: 'mob' };

export function deathMessage(info) {
  if (typeof info === 'string' && info.trim()) return info.trim();
  let cause = info && typeof info === 'object' ? info.cause : '';
  if (typeof cause === 'string' && DEATH_CAUSE_ALIAS[cause]) cause = DEATH_CAUSE_ALIAS[cause];
  const by = info && typeof info === 'object' && typeof info.by === 'string' ? info.by.trim() : '';
  switch (cause) {
    case 'fall':
      return 'Çok yüksekten düştün.';
    case 'lava':
      return 'Lavın içine düştün.';
    case 'drown':
      return 'Nefesin tükendi.';
    case 'hunger':
      return 'Açlıktan bitkin düştün.';
    case 'void':
      return 'Dünyanın dışına düştün.';
    case 'fire':
      return 'Alevler seni yendi.';
    case 'boss':
      return by ? by + ' seni yendi.' : 'Boss seni yendi.';
    case 'mob':
      return by ? by + ' seni yendi.' : 'Bir yaratık seni yendi.';
    case 'kaktüs':
      return 'Kaktüs dikenleri seni yendi.';
    case 'ok':
      return by ? by + ' seni oklarıyla yendi.' : 'Bir ok seni yendi.';
    case 'ışın':
      return 'Bir ışın seni yendi.';
    case 'patlama':
      return 'Bir patlama seni yendi.';
    default:
      return 'Bitkin düştün.';
  }
}

/** localStorage okuma/yazma: her erişim try/catch içinde (gizli sekme, kapalı site verisi). */
export function storageGet(key, fallback = null) {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

/** Panel/menü açıkken oyun arayüzü gizlenir: yalnız 'none' durumunda oyun katmanı etkindir. */
export function isGameplayUi(ui) {
  return ui === 'none' || ui === undefined || ui === null;
}

/** Koordinat gösterimi: 123.4 → "123"; -0.4 → "0". */
export function fmtCoord(v) {
  const n = Math.round(clamp(v, -1e7, 1e7));
  return String(n === 0 ? 0 : n).replace('-', '−');
}

/** Yüzde (0..100) tam sayı. */
export function pct(v, max) {
  if (!(max > 0)) return 0;
  return Math.round(clamp(v / max, 0, 1) * 100);
}

/** Boss canına göre aşama (1..phases): can azaldıkça aşama artar. */
export function bossPhase(hp, maxHp, phases = 3) {
  const n = Math.max(1, Math.floor(phases));
  if (!(maxHp > 0)) return 1;
  const lost = 1 - clamp(hp / maxHp, 0, 1);
  return Math.min(n, 1 + Math.floor(lost * n));
}

export const QUEST_COLLAPSE_KEY = 'kesif_quest_collapsed';

/** "✓ Tezgah yap" / "[x] ..." → { done:true, text } ; diğerleri done:false. */
export function parseQuestLine(line) {
  const t = typeof line === 'string' ? line.trim() : '';
  const m = /^(?:✓|✔|\[[xX]\])\s*(.*)$/.exec(t);
  if (m) return { done: true, text: touchText(m[1]) };
  return { done: false, text: touchText(t.replace(/^(?:☐|\[ \])\s*/, '')) };
}
