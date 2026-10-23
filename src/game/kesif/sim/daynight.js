/*
 * KEŞİF sim — gün/gece saati, gökyüzü renk eğrileri ve hava durumu (saf; DOM/three yok, worker-güvenli).
 *
 * Gün fazı p ∈ [0,1): 0 = gün doğumu (güneş ufukta yükselir), 0,25 = öğle, 0,5 = gün batımı, 0,75 = gece yarısı.
 * Güneş yüksekliği e = sin(2πp). Faz adları: şafak [0,96..0,06), gündüz [0,06..0,44), gün batımı [0,44..0,54), gece [0,54..0,96).
 * Dünya yönleri: güneş doğudan (+X) batıya (−X) yürür, hafif +Z eğimlidir. Renkler 0..1 sRGB [r,g,b] dizileridir
 * (render sky.js/materials.js uniform'lara doğrudan yazar). Kare başı ayırma yok: `createSkyState()` ile bir kez oluştur.
 *
 * Hava: createWeather(seed) tamamen BELİRLENİMCİdir — fırtına zaman çizelgesi (seed, t)'den hash ile üretilir, update'in
 * dt parçalanışından bağımsızdır. Yağış türü yerel sıcaklığa göre yağmur/kar/kuru (çöl); gök gürültüsü yok (çocuk dostu).
 */
import { ZONES, ZONE_COUNT, radiusAt } from './constants.js';
import { hash2, toSeedInt } from './rng.js';
import { BIOME_INFO } from './biomeData.js';
import { neonNightFactor } from './cityData.js';
import {
  NEON_PALETTE, NEON_CLOCK_ORIGIN, cityFogDensity, initCityWeather, evalCityWeather, resetCityCursor, smoothstepC,
  SMOG_DAY, SMOG_DUSK, SMOG_NIGHT, CITY_GLOW_A, CITY_GLOW_B,
} from './daynightNeon.js';

export { NEON_PALETTE, NEON_CLOCK_ORIGIN };

const TAU = Math.PI * 2;
const TWO32 = 4294967296;

export const DEFAULT_DAY_LENGTH = 1200;
export const PHASE_NAMES = Object.freeze(['şafak', 'gündüz', 'gün batımı', 'gece']);
/** Gece sönük sky ışığı tabanı (render: skyLight = SKY_LIGHT_MIN + (1-SKY_LIGHT_MIN)*dayFactor). */
export const SKY_LIGHT_MIN = 0.2;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function wrap01(p) {
  return p - Math.floor(p);
}

/* ------------------------------------------------------------------------------------------------
 * Saat
 * ---------------------------------------------------------------------------------------------- */
/**
 * createClock({dayLengthSec=1200, startPhase=0.1, day=0, frozen=false, origin}) — origin (isteğe bağlı, 0..1): saat kesrinin motor
 * fazına kaydırması (şehir saati için NEON_CLOCK_ORIGIN = 0,25); verilmezse alan hiç eklenmez (ana diyar saati aynı biçimde kalır).
 */
export function createClock(opts) {
  const o = opts || {};
  const len = Number.isFinite(o.dayLengthSec) && o.dayLengthSec > 1 ? o.dayLengthSec : DEFAULT_DAY_LENGTH;
  const start = Number.isFinite(o.startPhase) ? wrap01(o.startPhase) : 0.1;
  const c = {
    dayLengthSec: len,
    time: start * len,
    day: Number.isFinite(o.day) ? Math.max(0, Math.floor(o.day)) : 0,
    frozen: !!o.frozen,
    speed: 1,
  };
  if (Number.isFinite(o.origin) && wrap01(o.origin) !== 0) c.origin = wrap01(o.origin);
  return c;
}

/** Saati ilerlet; yeni güne geçildiyse true. */
export function updateClock(clock, dt) {
  if (clock.frozen || !(dt > 0)) return false;
  clock.time += dt * clock.speed;
  let rolled = false;
  while (clock.time >= clock.dayLengthSec) {
    clock.time -= clock.dayLengthSec;
    clock.day += 1;
    rolled = true;
  }
  return rolled;
}

/**
 * Motor fazı 0..1 (0 = gün doğumu). Şehir saati (clock.origin = 0,25; cityLook/boyut yöneticisi kurar) kayıtlı kesri sözleşme ekseninde
 * (0 = gece yarısı, başlangıç 0,8125 = 19:30) tutar → motor fazı kesir − origin (bkz. daynightNeon.js). origin yoksa kesirin kendisi.
 */
export function clockPhase(clock) {
  const o = clock.origin;
  return o ? wrap01(clock.time / clock.dayLengthSec - o) : clock.time / clock.dayLengthSec;
}

/** Faz ayarla (0..1, motor ekseni); gün sayısına dokunmaz. */
export function setClockPhase(clock, p) {
  clock.time = wrap01(p + (clock.origin || 0)) * clock.dayLengthSec;
}

/** Bir sonraki gün doğumuna ayarlar (uyku/yatak): günü artırır. */
export function skipToMorning(clock) {
  if (clockPhase(clock) >= 0.06) {
    clock.day += 1;
    clock.time = (clock.origin || 0) * clock.dayLengthSec;
  }
  return clock.day;
}

/** 'şafak' | 'gündüz' | 'gün batımı' | 'gece' */
export function phaseNameAt(p) {
  const q = wrap01(p);
  if (q >= 0.96 || q < 0.06) return 'şafak';
  if (q < 0.44) return 'gündüz';
  if (q < 0.54) return 'gün batımı';
  return 'gece';
}
export function getPhaseName(clock) {
  return phaseNameAt(clockPhase(clock));
}

/** Gökyüzü aydınlık çarpanı 0..1 (yumuşak): gece 0, öğle 1. */
export function dayFactorAt(p) {
  return smoothstep(-0.18, 0.32, Math.sin(wrap01(p) * TAU));
}
export function dayFactor(clock) {
  return dayFactorAt(clockPhase(clock));
}
/** Render/ışık için taban dahil gökyüzü ışığı 0,2..1. */
export function skyLightAt(p) {
  return SKY_LIGHT_MIN + (1 - SKY_LIGHT_MIN) * dayFactorAt(p);
}
/** Gece karanlığı 0..1 (düşman doğma / meşale anlamı). */
export function nightFactorAt(p) {
  return 1 - dayFactorAt(p);
}
export function isNight(p) {
  return phaseNameAt(p) === 'gece';
}

/** Güneşe doğru birim vektör → out {x,y,z}. */
export function sunDirection(p, out) {
  const a = wrap01(p) * TAU;
  const x = Math.cos(a);
  const y = Math.sin(a);
  const z = 0.3;
  const l = Math.sqrt(x * x + y * y + z * z);
  out.x = x / l;
  out.y = y / l;
  out.z = z / l;
  return out;
}
/** Aya doğru birim vektör (güneşin tersi). */
export function moonDirection(p, out) {
  sunDirection(p, out);
  out.x = -out.x;
  out.y = -out.y;
  out.z = -out.z;
  return out;
}
/** Ay evresi 0..7 (0 yeni, 4 dolunay) ve parlaklığı 0..1. */
export function moonPhase(day) {
  return ((Math.floor(day) % 8) + 8) % 8;
}
export function moonIllumination(day) {
  return 0.5 - 0.5 * Math.cos((moonPhase(day) / 8) * TAU);
}

/** Saat metni 'SS:DD': p=0 → 06:00, 0,25 → 12:00, 0,5 → 18:00, 0,75 → 00:00. */
export function formatClockTime(p) {
  const hours = (wrap01(p) * 24 + 6) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

export function serializeClock(clock) {
  return { tick: Math.floor(clock.time * 60), time: clock.time, day: clock.day, dayLengthSec: clock.dayLengthSec };
}
export function restoreClock(clock, data) {
  const d = data && typeof data === 'object' ? data : {};
  if (Number.isFinite(d.dayLengthSec) && d.dayLengthSec > 1) clock.dayLengthSec = d.dayLengthSec;
  const t = Number.isFinite(d.time) ? d.time : Number.isFinite(d.tick) ? d.tick / 60 : clock.time;
  clock.time = ((t % clock.dayLengthSec) + clock.dayLengthSec) % clock.dayLengthSec;
  clock.day = Number.isFinite(d.day) ? Math.max(0, Math.floor(d.day)) : clock.day;
  return clock;
}

/* ------------------------------------------------------------------------------------------------
 * Renk eğrileri
 * ---------------------------------------------------------------------------------------------- */
function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
/** 0xRRGGBB → out [r,g,b] 0..1. */
export function hexToRgb(hex, out) {
  out[0] = ((hex >> 16) & 255) / 255;
  out[1] = ((hex >> 8) & 255) / 255;
  out[2] = (hex & 255) / 255;
  return out;
}
/** [r,g,b] 0..1 → 0xRRGGBB. */
export function rgbToHex(c) {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * 255)));
  const g = Math.max(0, Math.min(255, Math.round(c[1] * 255)));
  const b = Math.max(0, Math.min(255, Math.round(c[2] * 255)));
  return (r << 16) | (g << 8) | b;
}

// [p, tepe, ufuk, sis, güneş, bölge karışımı]. mix=1: bölgenin gün rengi aynen; küçük: sabit palet baskın.
const KEYS = [
  { p: 0.0, name: 'şafak', top: 0x4a5f9e, hor: 0xff9e6b, fog: 0xe3a07e, sun: 0xffb070, mix: 0.3 },
  { p: 0.07, name: 'sabah', top: 0x6aa0e8, hor: 0xffe0b8, fog: 0xf0dcc0, sun: 0xffe8c0, mix: 0.75 },
  { p: 0.25, name: 'öğle', top: 0x3f8fe0, hor: 0xbfe3ff, fog: 0xcfe6f5, sun: 0xfff2d8, mix: 1 },
  { p: 0.43, name: 'ikindi', top: 0x6a9ae0, hor: 0xffd6a0, fog: 0xf0d4b0, sun: 0xffd090, mix: 0.8 },
  { p: 0.5, name: 'gün batımı', top: 0x54457f, hor: 0xff7a4a, fog: 0xd88a6a, sun: 0xff8a50, mix: 0.3 },
  { p: 0.56, name: 'alacakaranlık', top: 0x1c2250, hor: 0x5a3a6a, fog: 0x2c2a52, sun: 0x8a70c0, mix: 0.15 },
  { p: 0.75, name: 'gece', top: 0x050a1e, hor: 0x101c3a, fog: 0x0a1226, sun: 0x7080b0, mix: 0.12 },
  { p: 0.94, name: 'gün doğmadan', top: 0x1a2350, hor: 0x4a3a6a, fog: 0x2a2c50, sun: 0x9080c0, mix: 0.15 },
].map((k) => ({
  p: k.p, name: k.name, mix: k.mix, top: hexRgb(k.top), hor: hexRgb(k.hor), fog: hexRgb(k.fog), sun: hexRgb(k.sun),
}));
export const SKY_KEY_NAMES = Object.freeze(KEYS.map((k) => k.name));

const ZONE_RGB = ZONES.map((z) => ({
  top: hexRgb(z.ambient.skyTop),
  hor: hexRgb(z.ambient.skyHorizon),
  fog: hexRgb(z.ambient.fog),
  sun: hexRgb(z.ambient.sun),
}));

const NIGHT_AMBIENT = hexRgb(0x28365e);
const _zc = { top: [0, 0, 0], hor: [0, 0, 0], fog: [0, 0, 0], sun: [0, 0, 0] };
const _ka = [0, 0, 0];
const _kb = [0, 0, 0];
const FIELDS = ['top', 'hor', 'fog', 'sun'];

function zoneBlended(zoneIndex) {
  const zi = Number.isFinite(zoneIndex) ? Math.max(0, Math.min(ZONE_COUNT - 1, zoneIndex)) : 0;
  const i0 = Math.floor(zi);
  const i1 = Math.min(ZONE_COUNT - 1, i0 + 1);
  const f = zi - i0;
  for (let k = 0; k < 4; k++) {
    const key = FIELDS[k];
    const a = ZONE_RGB[i0][key];
    const b = ZONE_RGB[i1][key];
    const o = _zc[key];
    o[0] = a[0] + (b[0] - a[0]) * f;
    o[1] = a[1] + (b[1] - a[1]) * f;
    o[2] = a[2] + (b[2] - a[2]) * f;
  }
}

function keyColor(key, field, out) {
  const base = key[field];
  const z = _zc[field];
  const m = key.mix;
  out[0] = base[0] + (z[0] - base[0]) * m;
  out[1] = base[1] + (z[1] - base[1]) * m;
  out[2] = base[2] + (z[2] - base[2]) * m;
}

/** Sınıra yakın yumuşak bölge indeksi (kesirli): (x,z) → 0..4; sınırın ±width blok çevresinde karışır. */
export function zoneTintIndex(x, z, width = 16) {
  const r = radiusAt(x, z);
  for (let i = 0; i < ZONE_COUNT - 1; i++) {
    const ro = ZONES[i].rOut;
    if (r < ro - width) return i;
    if (r < ro + width) return i + smoothstep(ro - width, ro + width, r);
  }
  return ZONE_COUNT - 1;
}

/** Çıktı durumu: bir kez oluştur, her karede computeSky ile doldur. */
export function createSkyState() {
  return {
    skyTop: [0, 0, 0], skyHorizon: [0, 0, 0], fog: [0, 0, 0], sun: [0, 0, 0], ambient: [0, 0, 0],
    dayFactor: 1, skyLight: 1, sunIntensity: 1, ambientIntensity: 0.8, starAlpha: 0,
    fogDensity: 1, cloudCover: 0.15, cloudDark: 0, phase: 'gündüz',
    // şehir (Neon Meridyen) alanları, ana diyarda 0: cityGlow = DOĞRUSAL rgb (şiddetle çarpılmış ufuk parıltısı),
    // neonNight 0..1 (pencere/neon eşiği için gece faktörü), smog 0..1
    cityGlow: [0, 0, 0], neonNight: 0, smog: 0,
  };
}

/**
 * Faz p, bölge (kesirli olabilir, bkz. zoneTintIndex) ve hava (createWeather nesnesi | null) için gökyüzü durumu.
 * Yağış/bulutlanma renkleri griye çeker ve karartır; sis yoğunluğunu artırır.
 */
export function computeSky(p, zoneIndex, weather, out, palette) {
  const pal = palette || (weather && weather.table === 'neon' ? NEON_PALETTE : null);
  if (pal) return computeSkyCity(p, weather, out, pal);
  const q = wrap01(p);
  const o = out || createSkyState();
  zoneBlended(zoneIndex);
  let i1 = 0;
  for (let i = 0; i < KEYS.length; i++) if (KEYS[i].p <= q) i1 = i;
  const k0 = KEYS[i1];
  const k1 = KEYS[(i1 + 1) % KEYS.length];
  const p1 = i1 + 1 < KEYS.length ? k1.p : 1;
  const f = smoothstep(0, 1, (q - k0.p) / (p1 - k0.p));
  const dst = [o.skyTop, o.skyHorizon, o.fog, o.sun];
  for (let k = 0; k < 4; k++) {
    keyColor(k0, FIELDS[k], _ka);
    keyColor(k1, FIELDS[k], _kb);
    const d = dst[k];
    d[0] = _ka[0] + (_kb[0] - _ka[0]) * f;
    d[1] = _ka[1] + (_kb[1] - _ka[1]) * f;
    d[2] = _ka[2] + (_kb[2] - _ka[2]) * f;
  }
  const df = dayFactorAt(q);
  o.dayFactor = df;
  o.skyLight = SKY_LIGHT_MIN + (1 - SKY_LIGHT_MIN) * df;
  o.sunIntensity = 0.14 + 0.86 * df;
  o.ambientIntensity = 0.24 + 0.56 * df;
  o.starAlpha = 1 - smoothstep(-0.32, 0.02, Math.sin(q * TAU));
  o.phase = phaseNameAt(q);
  // ortam ışığı: gece mavi, gün ufuk rengine yakın
  for (let c = 0; c < 3; c++) {
    o.ambient[c] = NIGHT_AMBIENT[c] + (o.skyHorizon[c] * 0.55 + 0.45 - NIGHT_AMBIENT[c]) * df;
  }
  const storm = weather ? weather.cloudCover : 0.15;
  const rain = weather ? weather.intensity : 0;
  o.cloudCover = storm;
  const gray = clamp01(Math.max(0, (storm - 0.15)) / 0.85);
  o.cloudDark = gray * 0.35;
  if (gray > 0) {
    const mixAmt = gray * 0.6;
    const dim = 1 - gray * 0.22;
    const arrs = [o.skyTop, o.skyHorizon, o.fog, o.sun, o.ambient];
    for (let k = 0; k < arrs.length; k++) {
      const a = arrs[k];
      const lum = a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11;
      for (let c = 0; c < 3; c++) a[c] = (a[c] + (lum * 0.92 - a[c]) * mixAmt) * dim;
    }
    o.sunIntensity *= 1 - 0.55 * gray;
  }
  o.fogDensity = 1 + 1.2 * rain + 0.3 * gray;
  // şehir alanları ana diyarda sıfırlanır (paylaşılan skyState boyut geçişinde parıltı taşımasın)
  if (o.cityGlow) {
    o.cityGlow[0] = 0;
    o.cityGlow[1] = 0;
    o.cityGlow[2] = 0;
  }
  o.neonNight = 0;
  o.smog = 0;
  return o;
}

const _cityMix = [0, 0, 0];

/**
 * Şehir (Neon Meridyen) gökyüzü: palet anahtarları (dawn/day/dusk/night + ara adımlar), bölge karışımı yok, yıldız ×0,25, sis yoğunluğu
 * gün 1,6 / gece 1,2 / yağmur 2,0 (+duman), duman tonu (gündüz #8fa3b8, gün batımı #c0457a, gece #1a0f3a), gece ufuk parıltısı.
 * Aynı alan kümesini ve aralıkları ana diyar computeSky ile paylaşır.
 */
function computeSkyCity(p, weather, out, pal) {
  const q = wrap01(typeof p === 'number' && Number.isFinite(p) ? p : 0);
  const o = out || createSkyState();
  const keys = pal.keys;
  let i1 = 0;
  for (let i = 0; i < keys.length; i++) if (keys[i].p <= q) i1 = i;
  const k0 = keys[i1];
  const k1 = keys[(i1 + 1) % keys.length];
  const p1 = i1 + 1 < keys.length ? k1.p : 1;
  const f = smoothstep(0, 1, (q - k0.p) / (p1 - k0.p));
  const dst = [o.skyTop, o.skyHorizon, o.fog, o.sun];
  for (let k = 0; k < 4; k++) {
    const a = k0[FIELDS[k]];
    const b = k1[FIELDS[k]];
    const d = dst[k];
    d[0] = a[0] + (b[0] - a[0]) * f;
    d[1] = a[1] + (b[1] - a[1]) * f;
    d[2] = a[2] + (b[2] - a[2]) * f;
  }
  const df = dayFactorAt(q);
  const e = Math.sin(q * TAU);
  o.dayFactor = df;
  o.skyLight = SKY_LIGHT_MIN + (1 - SKY_LIGHT_MIN) * df;
  o.sunIntensity = 0.14 + 0.86 * df;
  o.ambientIntensity = 0.24 + 0.56 * df;
  o.starAlpha = (1 - smoothstep(-0.32, 0.02, e)) * pal.starMul;
  o.phase = phaseNameAt(q);
  const na = pal.nightAmbient;
  for (let c = 0; c < 3; c++) o.ambient[c] = na[c] + (o.skyHorizon[c] * 0.55 + 0.45 - na[c]) * df;
  const cover = weather && Number.isFinite(weather.cloudCover) ? weather.cloudCover : 0.15;
  const rain = weather && Number.isFinite(weather.intensity) ? weather.intensity : 0;
  const smog = weather && Number.isFinite(weather.smog) ? clamp01(weather.smog) : 0;
  o.cloudCover = cover;
  o.smog = smog;
  const rainK = smoothstepC(0.02, 0.6, rain);
  const gray = clamp01(Math.max(0, cover - 0.15) / 0.85);
  o.cloudDark = gray * 0.32;
  // duman: gündüz gri-mavi, gün batımında pembe-mor, gece koyu mor (ufuk/sis güçlü, tepe hafif)
  if (smog > 0.001) {
    const lowSun = 1 - smoothstep(0.05, 0.6, Math.abs(e));
    for (let c = 0; c < 3; c++) {
      const base = SMOG_NIGHT[c] + (SMOG_DAY[c] - SMOG_NIGHT[c]) * df;
      _cityMix[c] = base + (SMOG_DUSK[c] - base) * lowSun * 0.7;
    }
    const tint = [o.skyTop, o.skyHorizon, o.fog];
    const amt = [0.3, 0.42, 0.55];
    for (let k = 0; k < 3; k++) {
      const a = tint[k];
      const m = smog * amt[k];
      for (let c = 0; c < 3; c++) a[c] += (_cityMix[c] * (0.35 + 0.65 * df) - a[c]) * m;
    }
    o.sunIntensity *= 1 - 0.4 * smog;
  }
  if (gray > 0) {
    // yağmur/fırtına: griye çek ama neon gecesi renkli kalsın (yansımalar için)
    const mixAmt = gray * 0.42;
    const dim = 1 - gray * 0.18;
    const arrs = [o.skyTop, o.skyHorizon, o.fog, o.sun, o.ambient];
    for (let k = 0; k < arrs.length; k++) {
      const a = arrs[k];
      const lum = a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11;
      for (let c = 0; c < 3; c++) a[c] = (a[c] + (lum * 0.95 - a[c]) * mixAmt) * dim;
    }
    o.sunIntensity *= 1 - 0.5 * gray;
  }
  o.fogDensity = cityFogDensity(df, rainK, smog);
  const nn = neonNightFactor(wrap01(q + NEON_CLOCK_ORIGIN));
  o.neonNight = nn;
  const gk = nn * (0.14 + 0.1 * smog + 0.1 * rainK);
  const ga = CITY_GLOW_A;
  const gb = CITY_GLOW_B;
  if (!o.cityGlow) o.cityGlow = [0, 0, 0];
  o.cityGlow[0] = (ga[0] + (gb[0] - ga[0]) * 0.4) * gk;
  o.cityGlow[1] = (ga[1] + (gb[1] - ga[1]) * 0.4) * gk;
  o.cityGlow[2] = (ga[2] + (gb[2] - ga[2]) * 0.4) * gk;
  return o;
}

/* ------------------------------------------------------------------------------------------------
 * Hava durumu
 * ---------------------------------------------------------------------------------------------- */
/** Biyom anahtarı → sıcaklık (-1 çok soğuk .. 1 çok sıcak). */
export const BIOME_TEMPERATURE = Object.freeze({
  cayir: 0.5, orman: 0.45, karacam: 0.1, col: 0.95, tundra: -0.7, dag: -0.1, bataklik: 0.55, plaj: 0.6, kristal: 0.0,
});
/** Biyom + yükseklik → sıcaklık (70 üstü her blok 0,012 soğutur). */
export function temperatureFor(biomeKey, y = 64) {
  const bi = BIOME_INFO[biomeKey];
  const base = BIOME_TEMPERATURE[biomeKey] !== undefined ? BIOME_TEMPERATURE[biomeKey] : (bi ? bi.temp : undefined);
  const t = (base === undefined ? 0.4 : base) - Math.max(0, y - 70) * 0.012;
  return Math.max(-1, Math.min(1, t));
}
export const SNOW_MAX_TEMP = 0.12;
export const DRY_MIN_TEMP = 0.85;

const FADE = 25;

function f01(seed, index, k) {
  return hash2(index, k, seed) / TWO32;
}

// Döngü j: [açık süre, fırtına süresi (0 = yok), tepe şiddet]. Hepsi (seed, j) hash'inden.
function cycleParams(seed, j, out) {
  const clear = 240 + 600 * f01(seed, j, 1) + (j === 0 ? 300 : 0);
  const stormy = f01(seed, j, 2) < 0.7;
  out.clear = clear;
  out.storm = stormy ? 100 + 220 * f01(seed, j, 3) : 0;
  out.peak = 0.55 + 0.45 * f01(seed, j, 4);
  return out;
}

/**
 * createWeather(seed, {table:'overworld'|'neon'}) → durum. update(weather, dt, {temperature}) ile ilerlet.
 * table 'neon': şehir tablosu (açık %45 / duman %25 / yağmur %25 / fırtına %5, kar YOK, yağmur 90–150 sn; bkz. daynightNeon.js).
 * Ana diyar nesnesine hiçbir şehir alanı eklenmez (bayt-aynı); şehir nesnesi `table:'neon'`, `smog`, `cityState` taşır.
 */
export function createWeather(seed, opts) {
  const s = toSeedInt(seed);
  const w = {
    seed: s,
    t: 0,
    cycle: { index: 0, start: 0, clear: 0, storm: 0, peak: 0 },
    storm: 0, // küresel fırtına şiddeti 0..1
    cloudCover: 0.15,
    kind: 'clear', // bulunulan yerin yağış türü: 'clear' | 'rain' | 'snow'
    renderKind: 'clear', // şu an gösterilen parçacık türü (geçişte sönümlenir)
    intensity: 0, // yerel yağış şiddeti 0..1
    wind: { x: 0, z: 0 },
    phase: (s % 628) / 100,
  };
  if (opts && opts.table === 'neon') return initCityWeather(w);
  cycleParams(s, 0, w.cycle);
  evalStorm(w);
  return w;
}

function evalStorm(w) {
  if (w.table === 'neon') {
    // kayıttan geri yükleme (Object.assign) ana diyar biçimli bir imleç bırakmış olabilir → baştan yürü (belirlenimci)
    if (!(w.cycle.dur > 0) || w.cycle.state === undefined) resetCityCursor(w);
    evalCityWeather(w);
    return;
  }
  const c = w.cycle;
  let u = w.t - c.start;
  while (u >= c.clear + c.storm) {
    c.start += c.clear + c.storm;
    c.index += 1;
    cycleParams(w.seed, c.index, c);
    u = w.t - c.start;
  }
  let storm = 0;
  let cloud = 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(w.t * 0.004 + w.phase));
  if (c.storm > 0) {
    if (u >= c.clear) {
      const v = u - c.clear;
      const fade = Math.min(FADE, c.storm / 3);
      const ramp = smoothstep(0, 1, Math.min(v / fade, (c.storm - v) / fade, 1));
      storm = c.peak * ramp;
    } else if (u > c.clear - 90) {
      cloud += 0.35 * smoothstep(0, 1, (u - (c.clear - 90)) / 90);
    }
  }
  cloud = Math.min(1, cloud + 0.88 * storm);
  w.storm = storm;
  w.cloudCover = cloud;
}

/** Zamanı doğrudan ayarla (yükleme / geri sarma): baştan hesaplar. */
export function setWeatherTime(w, t) {
  w.t = Math.max(0, t);
  if (w.table === 'neon') {
    resetCityCursor(w);
  } else {
    w.cycle.index = 0;
    w.cycle.start = 0;
    cycleParams(w.seed, 0, w.cycle);
  }
  evalStorm(w);
  w.intensity = 0;
  w.renderKind = 'clear';
  return w;
}

/**
 * Hava adımı. ctx: {temperature = 0.5 (temperatureFor), rain = 0 (biyomun asgari yağmur şiddeti 0..1), snow = 0 (asgari kar)}.
 * Küresel fırtına (storm/cloudCover) yalnız zamana bağlıdır; yerel yağış türü sıcaklığa göre seçilir, tür değişince eskisi sönüp
 * yenisi gelir. Biyom tabanı (yağmur ormanında sürekli çisenti, taigada hafif kar) fırtına şiddetinin altına inmez; kurak sıcaklıkta yok.
 */
export function updateWeather(w, dt, ctx) {
  if (dt > 0) {
    w.t += dt;
    evalStorm(w);
  }
  // şehir tablosu: sıcaklık sabit 0,5 (kar yok, kuru çöl yok) ve biyom yağış tabanı yok
  const city = w.table === 'neon';
  const temp = !city && ctx && Number.isFinite(ctx.temperature) ? ctx.temperature : 0.5;
  w.kind = temp >= DRY_MIN_TEMP ? 'clear' : temp <= SNOW_MAX_TEMP ? 'snow' : 'rain';
  if (w.renderKind !== w.kind && w.intensity < 0.02) w.renderKind = w.kind;
  const floor = city ? 0 : w.kind === 'rain' ? (ctx && ctx.rain > 0 ? ctx.rain : 0) : (w.kind === 'snow' ? (ctx && ctx.snow > 0 ? ctx.snow : 0) : 0);
  const target = w.renderKind === w.kind && w.kind !== 'clear' ? Math.max(w.storm, floor) : 0;
  if (floor > 0 && w.kind !== 'clear') w.cloudCover = Math.max(w.cloudCover, 0.3 + 0.55 * floor);
  if (dt > 0) w.intensity += (target - w.intensity) * Math.min(1, dt * 0.8);
  if (w.intensity < 0.001) w.intensity = 0;
  const gust = 0.3 + 0.7 * w.storm;
  w.wind.x = Math.sin(w.t * 0.021 + w.phase) * 0.6 * gust;
  w.wind.z = Math.sin(w.t * 0.017 + w.phase * 1.7) * 0.4 * gust;
  return w;
}

/** Yağış parçacık türü ('rain'|'snow'|null) ve şiddeti için kısa okuma. */
export function precipitation(w) {
  return w.intensity > 0.02 && w.renderKind !== 'clear' ? w.renderKind : null;
}

export function serializeWeather(w) {
  return { seed: w.seed, t: w.t };
}
export function restoreWeather(data, opts) {
  const d = data && typeof data === 'object' ? data : {};
  const w = createWeather(Number.isFinite(d.seed) ? d.seed : 0, opts);
  setWeatherTime(w, Number.isFinite(d.t) ? d.t : 0);
  return w;
}
