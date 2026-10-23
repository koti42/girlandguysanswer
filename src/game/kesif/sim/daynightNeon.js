/*
 * KEŞİF sim — NEON MERİDYEN gün/gece paleti ve hava tablosu (saf; DOM/three yok, Math.random/Date.now yok, worker-güvenli).
 * Sözleşme KESIF_CITY_CONTRACT §1.12, §1.13, §13. daynight.js bu dosyanın VERİSİNİ ve yardımcılarını kullanır
 * (`createWeather(seed, {table:'neon'})`, `computeSky(..., palette)`); ana diyar yolu bu dosyaya hiç dokunmaz (bayt-aynı).
 *
 *   Saat       Şehir günü 600 sn. Kayıtlı `clock.time / dayLengthSec` kesri SÖZLEŞME eksenindedir (0 = gece yarısı, 0,5 = öğle):
 *              başlangıç 0,8125 = 19:30. Motorun faz ekseni (daynight.js: 0 = gün doğumu, 0,25 = öğle) ile arasındaki fark
 *              NEON_CLOCK_ORIGIN = 0,25'tir: şehir saati `clock.origin = 0.25` taşır (createClock({origin}) / cityLook kurar);
 *              clockPhase(clock) = kesir − origin → 19:30 motorda 0,5625 (gün batımından sonra alacakaranlık). origin yoksa kesirin kendisi.
 *   Hava       Açık %45, duman %25, yağmur %25, fırtına %5 (ZAMAN PAYI; kar yok). Yağmur/fırtına süresi 90–150 sn.
 *              Zaman çizelgesi (seed, j) hash'inden; update'in dt parçalanışından bağımsız. Parça türü ağırlığı odds/ortalamaSüre
 *              olduğundan uzun vadede ZAMAN payı tablodaki oranlara yakınsar.
 *   Palet      NEON_SKY_KEYS: şafak/gün/alacakaranlık/gece anahtarları (tasarım değerleri) + ara anahtarlar; bölge karışımı YOK.
 *   Sis        cityFogDensity: gün 1,6 · gece 1,2 · yağmur 2,0 (+ duman). Yıldız çarpanı 0,25.
 */
import { hash2, toSeedInt } from './rng.js';

const TWO32 = 4294967296;

export const NEON_DAY_LENGTH = 600;
export const NEON_CLOCK_ORIGIN = 0.25;
export const NEON_STAR_MUL = 0.25;
export const NEON_FOG_DAY = 1.6;
export const NEON_FOG_NIGHT = 1.2;
export const NEON_FOG_RAIN = 2.0;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function smoothstepC(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------------------------------------
 * Gökyüzü paleti
 * ---------------------------------------------------------------------------------------------- */
function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

// p: motor fazı (0 gün doğumu, 0,25 öğle, 0,5 gün batımı, 0,75 gece yarısı). Anahtar adları: dawn/day/dusk/night + ara adımlar.
const KEY_DEFS = [
  { p: 0.0, name: 'dawn', top: 0x2a2150, hor: 0xff7a9c, fog: 0x3a2a5c, sun: 0xffc0a0 },
  { p: 0.08, name: 'sabah', top: 0x4a6fb0, hor: 0xf0b8b0, fog: 0x6d7fa8, sun: 0xffe0c8 },
  { p: 0.25, name: 'day', top: 0x3f6fb5, hor: 0xa9c9e6, fog: 0x8aa3bf, sun: 0xfff2dc },
  { p: 0.43, name: 'ikindi', top: 0x4a6aa8, hor: 0xd9b8b4, fog: 0x8a8fb0, sun: 0xffd8b0 },
  { p: 0.5, name: 'dusk', top: 0x2b1b5e, hor: 0xff5fa2, fog: 0x4a2a6a, sun: 0xff9060 },
  { p: 0.57, name: 'alacakaranlık', top: 0x161350, hor: 0x9a2f8c, fog: 0x2a1858, sun: 0xb070d0 },
  { p: 0.75, name: 'night', top: 0x05051a, hor: 0x1b1650, fog: 0x120e33, sun: 0x8fb0ff },
  { p: 0.94, name: 'gün doğmadan', top: 0x14123a, hor: 0x4a2f78, fog: 0x231a4a, sun: 0xa090e0 },
];
export const NEON_SKY_KEYS = Object.freeze(KEY_DEFS.map((k) => Object.freeze({
  p: k.p, name: k.name, top: hexRgb(k.top), hor: hexRgb(k.hor), fog: hexRgb(k.fog), sun: hexRgb(k.sun),
})));
export const NEON_KEY_NAMES = Object.freeze(NEON_SKY_KEYS.map((k) => k.name));

/** Gece ortam ışığı (mor-mavi) — gündüz ufuk rengine karışır (daynight.js ile aynı formül). */
export const NEON_NIGHT_AMBIENT = Object.freeze(hexRgb(0x30366e));

/** Duman tonları: gündüz #8fa3b8 · gün batımı #c0457a · gece #1a0f3a (tasarım §8). */
export const SMOG_DAY = Object.freeze(hexRgb(0x8fa3b8));
export const SMOG_DUSK = Object.freeze(hexRgb(0xc0457a));
export const SMOG_NIGHT = Object.freeze(hexRgb(0x1a0f3a));

/** Şehir parıltısı renkleri (doğrusal; ufuk bandı): macenta + camgöbeği. */
export const CITY_GLOW_A = Object.freeze([1.0, 0.16, 0.5]);
export const CITY_GLOW_B = Object.freeze([0.1, 0.55, 1.0]);

/** Palet nesnesi (computeSky 5. argümanı). `NEON_PALETTE.name === 'neon'`. */
export const NEON_PALETTE = Object.freeze({
  name: 'neon',
  keys: NEON_SKY_KEYS,
  nightAmbient: NEON_NIGHT_AMBIENT,
  starMul: NEON_STAR_MUL,
});

/** Sis yoğunluk çarpanı: gün/gece arası (1,2…1,6), yağmurda 2,0'a, dumanda biraz daha. dayF 0..1, rainK 0..1, smog 0..1. */
export function cityFogDensity(dayF, rainK, smog) {
  const base = NEON_FOG_NIGHT + (NEON_FOG_DAY - NEON_FOG_NIGHT) * clamp01(dayF);
  const d = base + (NEON_FOG_RAIN - base) * clamp01(rainK) + 0.35 * clamp01(smog);
  return d > 2.4 ? 2.4 : d;
}

/* ------------------------------------------------------------------------------------------------
 * Hava çizelgesi
 * ---------------------------------------------------------------------------------------------- */
export const CITY_WEATHER_STATES = Object.freeze(['open', 'smog', 'rain', 'storm']);
/** Zaman payları (kar yok). */
export const CITY_WEATHER_ODDS = Object.freeze({
  open: 0.45, smog: 0.25, rain: 0.25, storm: 0.05,
});
/** Parça süresi aralıkları (sn). Yağmur 90–150 sn (sözleşme); fırtına da aynı aralıkta. */
export const CITY_WEATHER_DURATION = Object.freeze({
  open: Object.freeze([120, 240]),
  smog: Object.freeze([120, 240]),
  rain: Object.freeze([90, 150]),
  storm: Object.freeze([90, 150]),
});
/** Durum başına seviye aralıkları: yağış şiddeti [min,max], bulutlanma, duman. */
const LEVELS = {
  open: { rain: [0, 0], cloud: 0.16, smog: 0 },
  smog: { rain: [0, 0], cloud: 0.6, smog: 1 },
  rain: { rain: [0.55, 0.8], cloud: 0.82, smog: 0.35 },
  storm: { rain: [0.9, 1], cloud: 1, smog: 0.5 },
};
export const CITY_FADE = 22;
/**
 * Çizelge periyodu (sn): w.t bu değerin modunda değerlendirilir → çok büyük/bozuk zaman (kayıt ≤1e9) milyonlarca parça yürütmez (≤ ~2700 parça, <1 ms).
 * Dizi her ~111 saatlik oyun süresinde başa sarar (belirlenimci; oyuncu için görünmez bir süreksizlik).
 */
export const CITY_WEATHER_PERIOD = 400000;

function f01(seed, index, k) {
  return hash2(index, k, seed) / TWO32;
}

// Tür ağırlığı = oran / ortalama süre → zaman payı tablodaki orana yakınsar.
const WEIGHTS = CITY_WEATHER_STATES.map((s) => CITY_WEATHER_ODDS[s] / ((CITY_WEATHER_DURATION[s][0] + CITY_WEATHER_DURATION[s][1]) / 2));
const WSUM = WEIGHTS.reduce((a, b) => a + b, 0);

/** Parça j'nin türü, süresi ve seviyeleri → out {state, dur, rain, cloud, smog}. j=0 hep açık (+60 sn). */
export function citySegment(seed, j, out) {
  const o = out || {};
  const s = toSeedInt(seed);
  const idx = j < 0 ? 0 : j;
  let state = 'open';
  if (idx > 0) {
    let u = f01(s, idx, 11) * WSUM;
    state = CITY_WEATHER_STATES[CITY_WEATHER_STATES.length - 1];
    for (let i = 0; i < WEIGHTS.length; i++) {
      u -= WEIGHTS[i];
      if (u < 0) {
        state = CITY_WEATHER_STATES[i];
        break;
      }
    }
  }
  const dr = CITY_WEATHER_DURATION[state];
  const L = LEVELS[state];
  o.state = state;
  o.dur = dr[0] + (dr[1] - dr[0]) * f01(s, idx, 12) + (idx === 0 ? 60 : 0);
  o.rain = L.rain[0] + (L.rain[1] - L.rain[0]) * f01(s, idx, 13);
  o.cloud = L.cloud + (state === 'open' ? 0.1 * f01(s, idx, 14) : 0.1 * (f01(s, idx, 14) - 0.5));
  o.smog = L.smog;
  return o;
}

const _prev = { state: 'open', dur: 0, rain: 0, cloud: 0.16, smog: 0 };

/**
 * Hava durumu nesnesini (createWeather(seed,{table:'neon'})) w.t zamanına getirir. İlerleyen imleç w.cycle={index,start,dur,state,rain,cloud,smog}.
 * Çıktı alanları: storm (yağış şiddeti 0..1), cloudCover, smog, cityState.
 */
export function evalCityWeather(w) {
  const c = w.cycle;
  const tt = Number.isFinite(w.t) && w.t > 0 ? w.t % CITY_WEATHER_PERIOD : 0;
  if (tt < c.start) resetCityCursor(w);
  let u = tt - c.start;
  let guard = 0;
  while (u >= c.dur && guard++ < 1e7) {
    c.start += c.dur;
    c.index += 1;
    citySegment(w.seed, c.index, c);
    u = tt - c.start;
  }
  const prev = c.index > 0 ? citySegment(w.seed, c.index - 1, _prev) : { rain: 0, cloud: 0.16, smog: 0 };
  const fade = Math.min(CITY_FADE, c.dur / 3);
  const r = smoothstepC(0, 1, fade > 0 ? u / fade : 1);
  const rain = prev.rain + (c.rain - prev.rain) * r;
  const cloud = prev.cloud + (c.cloud - prev.cloud) * r;
  const smog = prev.smog + (c.smog - prev.smog) * r;
  const ripple = 0.03 * Math.sin(tt * 0.004 + w.phase);
  w.storm = clamp01(rain);
  w.cloudCover = clamp01(cloud + ripple + 0.1 * w.storm);
  w.smog = clamp01(smog);
  w.cityState = c.state;
  return w;
}

/** Hava nesnesine şehir alanlarını kurar (createWeather çağırır). */
export function initCityWeather(w) {
  w.table = 'neon';
  w.smog = 0;
  w.cityState = 'open';
  w.cycle = {
    index: 0, start: 0, dur: 0, state: 'open', rain: 0, cloud: 0.16, smog: 0,
  };
  citySegment(w.seed, 0, w.cycle);
  evalCityWeather(w);
  return w;
}

/** Zamanı baştan hesaplamak için imleci sıfırlar (setWeatherTime). */
export function resetCityCursor(w) {
  w.cycle.index = 0;
  w.cycle.start = 0;
  citySegment(w.seed, 0, w.cycle);
  return w;
}
