/*
 * KEŞİF render/city — şehir görünümü SAF matematiği (three/DOM yok; node'da test edilir).
 *
 *   wetTargetFor(weather)            yağış → ıslaklık hedefi 0..1 (şehir tablosu dışında 0)
 *   stepWet(wet, target, dt)         uWet eğrisi: yükselme 1 sn, bırakma (kuruma) 20 sn — doğrusal, dt'den bağımsız
 *   neonUniformFor(out, enginePhase, wet, rain)   uNeon [night, neon, wet, window] (NaN-güvenli; fillNeonUniform üstüne). Yağmurda gündüz de
 *                                    koyu bulutlar altında A grubu pencereler (eşik 0,2) yanar: night = max(night, STORM_NIGHT·min(1, 1,5·yağmur)).
 *   cityPhaseOf(enginePhase)         motor fazı (0 gün doğumu) → sözleşme fazı (0 gece yarısı)
 *   ENV_FOR_DIM / lookNameFor(dim)   boyut kimliği → görünüm adı ('neon' | 'overworld')
 *   CITY_CAMERA_FAR                  1600 (sözleşme §13)
 *   fogShelter / ambienceState       gökyüzü ışığı → yağmur kesilmesi; ses/parçacık durumu türetme yardımcıları
 */
import { fillNeonUniform, neonNightFactor } from '../../sim/cityData.js';
import { NEON_CLOCK_ORIGIN } from '../../sim/daynightNeon.js';

export const WET_RISE_SEC = 1;
export const WET_FALL_SEC = 20;
export const CITY_CAMERA_FAR = 1600;
/** Fırtına/yağmurda gündüzün asgari "gece" faktörü (koyu gökte vitrinler ve A grubu pencereler yanar). */
export const STORM_NIGHT = 0.28;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function num(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** 'neon' → 'neon'; her şey (bilinmeyen/overworld/null) → 'overworld'. */
export function lookNameFor(dim) {
  return dim === 'neon' ? 'neon' : 'overworld';
}

/** Hava nesnesi (createWeather) → ıslaklık hedefi: şehir tablosunda yağış şiddeti 0,03'ten 0,30'a yumuşakça 1'e çıkar; diğer tablolar 0. */
export function wetTargetFor(weather) {
  if (!weather || weather.table !== 'neon') return 0;
  return smoothstep(0.03, 0.3, clamp01(num(weather.intensity, 0)));
}

/**
 * uWet eğrisi: hedef yukarıdaysa 1 sn'de (doğrusal), aşağıdaysa 20 sn'de (doğrusal) yaklaşır. dt parçalanışı sonucu değiştirmez.
 * NaN/negatif dt → değişmez; sonuç hep [0,1].
 */
export function stepWet(wet, target, dt) {
  const w = clamp01(num(wet, 0));
  const t = clamp01(num(target, 0));
  const d = num(dt, 0);
  if (!(d > 0)) return w;
  if (t > w) return Math.min(t, w + d / WET_RISE_SEC);
  if (t < w) return Math.max(t, w - d / WET_FALL_SEC);
  return w;
}

/** Motor fazı (0 = gün doğumu) → sözleşme fazı (0 = gece yarısı). */
export function cityPhaseOf(enginePhase) {
  const p = num(enginePhase, 0) + NEON_CLOCK_ORIGIN;
  return p - Math.floor(p);
}

/** uNeon dört bileşenini doldurur (out: Float32Array(4) | dizi); girdiler kıstırılır, çıktı hep sonlu. Döner: out. */
export function neonUniformFor(out, enginePhase, wet, rain) {
  const r = clamp01(num(rain, 0));
  const night = Math.max(clamp01(num(neonNightFactor(cityPhaseOf(enginePhase)), 0)), STORM_NIGHT * Math.min(1, 1.5 * r));
  fillNeonUniform(out, night, clamp01(num(wet, 0)), r);
  return out;
}

/** Yağmur kesilmesi: göz hücresinin ham gökyüzü ışığı (0..15) → 0..1 (içeride 1). gameRender ile aynı formül. */
export function fogShelter(skyRaw) {
  return clamp01(1 - num(skyRaw, 15) / 12);
}

export const SHELTER_SCAN_UP = 24;

/**
 * Göz sütununun üstünde (en çok 24 blok) herhangi bir blok (tavan, tente, cam çatı) var mı. İç mekânda pencereden sızan gökyüzü ışığı (≈7) yüzünden
 * `fogShelter` tek başına yağmuru tam kesmez (odada yağmur çizgileri, qa_p2); tavan varsa sığınak tamdır. world: {getBlock(x,y,z)}, eye: {x,y,z}.
 */
export function overheadCovered(world, eye, maxUp) {
  if (!world || typeof world.getBlock !== 'function' || !eye || !Number.isFinite(eye.x + eye.y + eye.z)) return false;
  const x = Math.floor(eye.x);
  const y = Math.floor(eye.y);
  const z = Math.floor(eye.z);
  const n = maxUp > 0 ? maxUp | 0 : SHELTER_SCAN_UP;
  for (let dy = 1; dy <= n; dy++) if (world.getBlock(x, y + dy, z)) return true;
  return false;
}

/**
 * Şehir ambiyansı durumu (ses + hava parçacıkları): gece, yağış, ıslaklık, sığınak. Hepsi 0..1.
 * out yeniden kullanılır.
 */
export function ambienceState(out, night, rain, wet, shelter) {
  const o = out || {};
  o.night = clamp01(num(night, 0));
  o.rain = clamp01(num(rain, 0));
  o.wet = clamp01(num(wet, 0));
  o.shelter = clamp01(num(shelter, 0));
  return o;
}
