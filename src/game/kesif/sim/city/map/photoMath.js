/*
 * KEŞİF sim/city/map — FOTO MODU MATEMATİĞİ (photo_map, Neon Meridyen Faz 4). SAF (DOM/three yok), es2020, belirlenimci, `Math.random/Date.now` yok.
 *
 * Foto modu serbest kamerayı oyuncunun (ya da aracın) çevresinde YÖRÜNGEYE oturtur: yaw/pitch bakış yönü, `dist` hedefe uzaklık (≤ 25 m, blok ışını
 * kamerayı duvarın önünde durdurur), `height` hedef yüksekliği. Dünyaya dokunmaz; ışınlar `rayFn` ile enjekte edilir.
 *
 *   PHOTO_LIMITS · PHOTO_DEFAULTS · PHOTO_FILTERS (yok + 6) · PHOTO_FRAMES · PHOTO_TIMES · PHOTO_RAINS · filterIndex(id)
 *   defaultPhotoSettings() · sanitizePhotoPatch(cur, patch) → yeni ayar (bilinmeyen/NaN/`__proto__` yok sayılır)
 *   orbitTarget(pos, driving, height, out) · solveOrbit(state, target, rayFn, out) · stepOrbit(state, dyaw, dpitch) · zoomOrbit(state, delta)
 *   basis(yaw, pitch, out) · projectPoint(cam, aspect, p, out) · subjectInFrame(cam, aspect, subject, rayFn, opts)
 *   tuneFor(settings) → postfx.tune girdisi · captureDims(w, h, max) · frameLayout(w, h, frameId) · photoFileName(stamp) · phaseOf(timeId) → 0..1 | null
 *   rayFn(ox, oy, oz, dx, dy, dz, max) → ilk katıya uzaklık | null
 */
import { PHOTO_FILTERS as FILTER_NAMES } from '../cityNames.js';

export const PHOTO_LIMITS = Object.freeze({
  fovMin: 20,
  fovMax: 90,
  distMin: 1.2,
  distMax: 25,
  pitchMin: -1.35,
  pitchMax: 1.35,
  heightMin: -1.5,
  heightMax: 3,
  exposureMin: 0.55,
  exposureMax: 1.7,
  bloomMin: 0,
  bloomMax: 1.8,
  vignetteMin: 0,
  vignetteMax: 1,
  grainMin: 0,
  grainMax: 0.6,
  margin: 0.35,
  minBoom: 0.4,
  captureMax: 1920,
  filterAmountMin: 0,
  filterAmountMax: 1,
});

export const PHOTO_DEFAULTS = Object.freeze({
  fov: 62,
  dist: 5,
  height: 0.2,
  pitchOffset: -0.12,
  exposure: 1,
  bloom: 0.95,
  vignette: 0.28,
  grain: 0,
  filter: 'yok',
  filterAmount: 1,
  frame: 'yok',
  time: 'gercek',
  rain: 'gercek',
  freeze: false,
  mark: true,
  hideSelf: false,
});

/** Filtre kimlikleri (cityNames.PHOTO_FILTERS) + "yok"; sıra shader dizinidir. */
export const PHOTO_FILTERS = Object.freeze([{ id: 'yok', name: 'Filtre yok' }].concat(FILTER_NAMES.map((f) => ({ id: f.id, name: f.name }))));
const FILTER_INDEX = Object.freeze(PHOTO_FILTERS.reduce((m, f, i) => { m[f.id] = i; return m; }, Object.create(null)));

export const PHOTO_FRAMES = Object.freeze([
  Object.freeze({ id: 'yok', name: 'Çerçevesiz' }),
  Object.freeze({ id: 'ince', name: 'İnce Çerçeve' }),
  Object.freeze({ id: 'anlik', name: 'Anlık Kare' }),
  Object.freeze({ id: 'sinema', name: 'Sinema Bantları' }),
  Object.freeze({ id: 'neon', name: 'Neon Çerçeve' }),
]);

/** Görsel saat ön ayarları; faz = MOTOR ekseni (daynight.js: 0 gün doğumu, 0,25 öğle, 0,5 gün batımı, 0,75 gece yarısı). `null` = gerçek saat. */
export const PHOTO_TIMES = Object.freeze([
  Object.freeze({ id: 'gercek', name: 'Şimdiki saat', phase: null }),
  Object.freeze({ id: 'sabah', name: 'Sabah', phase: 0.08 }),
  Object.freeze({ id: 'ogle', name: 'Öğle', phase: 0.25 }),
  Object.freeze({ id: 'aksam', name: 'Akşam', phase: 0.52 }),
  Object.freeze({ id: 'gece', name: 'Gece', phase: 0.75 }),
]);

/** Görsel yağmur ön ayarları (dünya hava durumu DEĞİŞMEZ). */
export const PHOTO_RAINS = Object.freeze([
  Object.freeze({ id: 'gercek', name: 'Şimdiki hava', intensity: null }),
  Object.freeze({ id: 'kuru', name: 'Açık hava', intensity: 0 }),
  Object.freeze({ id: 'yagmurlu', name: 'Yağmurlu', intensity: 0.85 }),
]);

const FRAME_IDS = Object.freeze(PHOTO_FRAMES.map((f) => f.id));
const TIME_IDS = Object.freeze(PHOTO_TIMES.map((f) => f.id));
const RAIN_IDS = Object.freeze(PHOTO_RAINS.map((f) => f.id));
const TAU = Math.PI * 2;

export function filterIndex(id) {
  return typeof id === 'string' && id in FILTER_INDEX ? FILTER_INDEX[id] : 0;
}

export function phaseOf(timeId) {
  for (let i = 0; i < PHOTO_TIMES.length; i++) if (PHOTO_TIMES[i].id === timeId) return PHOTO_TIMES[i].phase;
  return null;
}

export function rainOf(rainId) {
  for (let i = 0; i < PHOTO_RAINS.length; i++) if (PHOTO_RAINS[i].id === rainId) return PHOTO_RAINS[i].intensity;
  return null;
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function wrapAngle(a) {
  const x = num(a, 0);
  if (x >= -Math.PI && x <= Math.PI) return x;
  const m = x % TAU;
  return m > Math.PI ? m - TAU : m < -Math.PI ? m + TAU : m;
}

export function defaultPhotoSettings() {
  return {
    fov: PHOTO_DEFAULTS.fov,
    dist: PHOTO_DEFAULTS.dist,
    height: PHOTO_DEFAULTS.height,
    exposure: PHOTO_DEFAULTS.exposure,
    bloom: PHOTO_DEFAULTS.bloom,
    vignette: PHOTO_DEFAULTS.vignette,
    grain: PHOTO_DEFAULTS.grain,
    filter: PHOTO_DEFAULTS.filter,
    filterAmount: PHOTO_DEFAULTS.filterAmount,
    frame: PHOTO_DEFAULTS.frame,
    time: PHOTO_DEFAULTS.time,
    rain: PHOTO_DEFAULTS.rain,
    freeze: PHOTO_DEFAULTS.freeze,
    mark: PHOTO_DEFAULTS.mark,
    hideSelf: PHOTO_DEFAULTS.hideSelf,
  };
}

const L = PHOTO_LIMITS;
const NUM_KEYS = Object.freeze([
  ['fov', L.fovMin, L.fovMax], ['dist', L.distMin, L.distMax], ['height', L.heightMin, L.heightMax], ['exposure', L.exposureMin, L.exposureMax],
  ['bloom', L.bloomMin, L.bloomMax], ['vignette', L.vignetteMin, L.vignetteMax], ['grain', L.grainMin, L.grainMax],
  ['filterAmount', L.filterAmountMin, L.filterAmountMax],
]);
const BOOL_KEYS = Object.freeze(['freeze', 'mark', 'hideSelf']);

/** Ayar yaması: yalnız bilinen anahtarlar, sayılar sınırlanır, numaralandırmalar doğrulanır. Dönen nesne YENİDİR (cur değişmez). */
export function sanitizePhotoPatch(cur, patch) {
  const out = Object.assign(defaultPhotoSettings(), cur && typeof cur === 'object' ? cur : null);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return out;
  for (let i = 0; i < NUM_KEYS.length; i++) {
    const k = NUM_KEYS[i];
    if (Object.prototype.hasOwnProperty.call(patch, k[0]) && typeof patch[k[0]] === 'number' && Number.isFinite(patch[k[0]])) out[k[0]] = clamp(patch[k[0]], k[1], k[2]);
  }
  for (let i = 0; i < BOOL_KEYS.length; i++) {
    const k = BOOL_KEYS[i];
    if (Object.prototype.hasOwnProperty.call(patch, k) && typeof patch[k] === 'boolean') out[k] = patch[k];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'filter') && typeof patch.filter === 'string' && patch.filter in FILTER_INDEX) out.filter = patch.filter;
  if (Object.prototype.hasOwnProperty.call(patch, 'frame') && FRAME_IDS.indexOf(patch.frame) >= 0) out.frame = patch.frame;
  if (Object.prototype.hasOwnProperty.call(patch, 'time') && TIME_IDS.indexOf(patch.time) >= 0) out.time = patch.time;
  if (Object.prototype.hasOwnProperty.call(patch, 'rain') && RAIN_IDS.indexOf(patch.rain) >= 0) out.rain = patch.rain;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Yörünge kamerası
 * ---------------------------------------------------------------------------------------------- */
/** Yörünge hedefi: ayak konumundan 1,4 m yukarı (araçta 1,0 m) + `height`. */
export function orbitTarget(pos, driving, height, out) {
  const o = out || { x: 0, y: 0, z: 0 };
  o.x = num(pos && pos.x, 0);
  o.y = num(pos && pos.y, 64) + (driving ? 1.0 : 1.4) + clamp(num(height, 0), L.heightMin, L.heightMax);
  o.z = num(pos && pos.z, 0);
  return o;
}

/** Bakış yönü (birim): lookDir ile aynı sözleşme (yaw 0 = −Z). */
export function basis(yaw, pitch, out) {
  const o = out || { fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0 };
  const cp = Math.cos(pitch);
  o.fx = -Math.sin(yaw) * cp;
  o.fy = Math.sin(pitch);
  o.fz = -Math.cos(yaw) * cp;
  o.rx = Math.cos(yaw);
  o.ry = 0;
  o.rz = -Math.sin(yaw);
  // u = r × f
  o.ux = o.ry * o.fz - o.rz * o.fy;
  o.uy = o.rz * o.fx - o.rx * o.fz;
  o.uz = o.rx * o.fy - o.ry * o.fx;
  return o;
}

const DIR = { fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0 };

/**
 * Kamera konumu: hedefin `dist` metre arkasında (bakış yönünün tersi). Blok ışını (hedeften kameraya) kamerayı engelin `margin` önünde durdurur.
 * state {yaw, pitch, dist}; out {x,y,z,yaw,pitch,dist,blocked}. NaN güvenli.
 */
export function solveOrbit(state, target, rayFn, out) {
  const o = out || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, dist: 0, blocked: false };
  const yaw = wrapAngle(num(state && state.yaw, 0));
  const pitch = clamp(num(state && state.pitch, 0), L.pitchMin, L.pitchMax);
  const want = clamp(num(state && state.dist, PHOTO_DEFAULTS.dist), L.distMin, L.distMax);
  basis(yaw, pitch, DIR);
  const bx = -DIR.fx;
  const by = -DIR.fy;
  const bz = -DIR.fz;
  let d = want;
  let blocked = false;
  if (typeof rayFn === 'function') {
    const hit = rayFn(target.x, target.y, target.z, bx, by, bz, want + L.margin);
    if (typeof hit === 'number' && Number.isFinite(hit) && hit >= 0) {
      d = clamp(hit - L.margin, Math.min(L.minBoom, want), want);
      blocked = d < want - 1e-6;
    }
  }
  o.x = target.x + bx * d;
  o.y = target.y + by * d;
  o.z = target.z + bz * d;
  o.yaw = yaw;
  o.pitch = pitch;
  o.dist = d;
  o.blocked = blocked;
  return o;
}

export function stepOrbit(state, dyaw, dpitch) {
  state.yaw = wrapAngle(num(state.yaw, 0) + num(dyaw, 0));
  state.pitch = clamp(num(state.pitch, 0) + num(dpitch, 0), L.pitchMin, L.pitchMax);
  return state;
}

export function zoomOrbit(state, delta) {
  state.dist = clamp(num(state.dist, PHOTO_DEFAULTS.dist) + num(delta, 0), L.distMin, L.distMax);
  return state;
}

/* ------------------------------------------------------------------------------------------------
 * Kadraj testi
 * ---------------------------------------------------------------------------------------------- */
/**
 * Dünya noktasını kamera NDC'sine yansıtır. cam {x,y,z,yaw,pitch,fov(derece)}, aspect = en/boy.
 * out {x,y,depth} (NDC −1..1, depth m); nokta kameranın arkasındaysa null.
 */
export function projectPoint(cam, aspect, p, out) {
  const o = out || { x: 0, y: 0, depth: 0 };
  basis(cam.yaw, cam.pitch, DIR);
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const dz = p.z - cam.z;
  const f = dx * DIR.fx + dy * DIR.fy + dz * DIR.fz;
  if (!(f > 0.05)) return null;
  const t = Math.tan((clamp(num(cam.fov, 62), 5, 150) * Math.PI) / 360);
  const a = aspect > 0.05 ? aspect : 1;
  o.x = (dx * DIR.rx + dy * DIR.ry + dz * DIR.rz) / f / (t * a);
  o.y = (dx * DIR.ux + dy * DIR.uy + dz * DIR.uz) / f / t;
  o.depth = f;
  return o;
}

const PT = { x: 0, y: 0, depth: 0 };

/**
 * Konu kadrajda mı? subject {x, y, z, r (yarıçap m, ≥0.3)}. Koşullar: kameranın önünde, NDC merkezi `edge` (0,86) içinde,
 * görünür boyut ≥ `minSize` (NDC yarı-yükseklik oranı), uzaklık ≤ `maxDist` (60 m), görüş hattı açık (rayFn; konunun `r+1` m önüne kadar).
 * Dönen: {ok, why: ''|'arka'|'kenar'|'uzak'|'kucuk'|'engel', x, y, depth, size}
 */
export function subjectInFrame(cam, aspect, subject, rayFn, opts) {
  const o = opts || {};
  const edge = num(o.edge, 0.86);
  const minSize = num(o.minSize, 0.035);
  const maxDist = num(o.maxDist, 60);
  const res = {
    ok: false, why: '', x: 0, y: 0, depth: 0, size: 0,
  };
  const r = Math.max(0.3, num(subject && subject.r, 0.5));
  const pt = projectPoint(cam, aspect, subject, PT);
  if (!pt) {
    res.why = 'arka';
    return res;
  }
  res.x = pt.x;
  res.y = pt.y;
  res.depth = pt.depth;
  const t = Math.tan((clamp(num(cam.fov, 62), 5, 150) * Math.PI) / 360);
  res.size = r / pt.depth / t;
  if (pt.depth > maxDist) {
    res.why = 'uzak';
    return res;
  }
  if (Math.abs(pt.x) > edge || Math.abs(pt.y) > edge) {
    res.why = 'kenar';
    return res;
  }
  if (res.size < minSize) {
    res.why = 'kucuk';
    return res;
  }
  if (typeof rayFn === 'function') {
    const dx = subject.x - cam.x;
    const dy = subject.y - cam.y;
    const dz = subject.z - cam.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 0.001) {
      const hit = rayFn(cam.x, cam.y, cam.z, dx / len, dy / len, dz / len, len);
      if (typeof hit === 'number' && Number.isFinite(hit) && hit < len - (r + 1)) {
        res.why = 'engel';
        return res;
      }
    }
  }
  res.ok = true;
  return res;
}

/* ------------------------------------------------------------------------------------------------
 * Görsel ayar → postfx
 * ---------------------------------------------------------------------------------------------- */
/** postfx.tune girdisi (bloom, pozlama, vinyet). Doygunluk filtreye bırakılır. */
export function tuneFor(s) {
  return { bloom: s.bloom, exposure: s.exposure, vignette: s.vignette };
}

/* ------------------------------------------------------------------------------------------------
 * Kayıt boyutu, çerçeve, dosya adı
 * ---------------------------------------------------------------------------------------------- */
/** Uzun kenarı `max`'ı geçmeyen boyut (büyütme yok); en-boy korunur. */
export function captureDims(w, h, max) {
  const m = max > 0 ? max : L.captureMax;
  const iw = Math.max(1, Math.floor(num(w, 1)));
  const ih = Math.max(1, Math.floor(num(h, 1)));
  const k = Math.min(1, m / Math.max(iw, ih));
  return { w: Math.max(1, Math.round(iw * k)), h: Math.max(1, Math.round(ih * k)), scale: k };
}

/**
 * Çerçeve yerleşimi (kayıt ve önizleme aynı geometriyi kullanır): {bars:[üst,alt] px, border: px, caption: px (alt şerit), inset}.
 */
export function frameLayout(w, h, frameId) {
  const m = Math.min(w, h);
  switch (frameId) {
    case 'ince':
      return { bars: 0, border: Math.max(2, Math.round(m * 0.012)), caption: 0, color: '#f4f7ff' };
    case 'anlik': {
      const b = Math.round(m * 0.035);
      return { bars: 0, border: b, caption: Math.round(m * 0.075), color: '#f7f5ee' };
    }
    case 'sinema': {
      // 2,39:1 görüntü penceresi; yüksek görüntülerde bant yok
      const win = Math.round(w / 2.39);
      const bar = h > win ? Math.round((h - win) / 2) : 0;
      return { bars: bar, border: 0, caption: 0, color: '#05070f' };
    }
    case 'neon':
      return { bars: 0, border: Math.max(3, Math.round(m * 0.014)), caption: 0, color: '#38e8ff', corner: Math.round(m * 0.07) };
    default:
      return { bars: 0, border: 0, caption: 0, color: '#000000' };
  }
}

const pad2 = (n) => (n < 10 ? '0' : '') + n;

/** `neon-meridyen-YYYYMMDD-HHMMSS.jpg`; stamp {y,mo,d,h,mi,s} (çağıran Date'ten üretir; sim saat okumaz). */
export function photoFileName(stamp) {
  const s = stamp && typeof stamp === 'object' ? stamp : {};
  const y = Math.max(2000, Math.min(2999, Math.floor(num(s.y, 2026))));
  return 'neon-meridyen-' + y + pad2(Math.max(1, Math.min(12, Math.floor(num(s.mo, 1))))) + pad2(Math.max(1, Math.min(31, Math.floor(num(s.d, 1)))))
    + '-' + pad2(Math.max(0, Math.min(23, Math.floor(num(s.h, 0))))) + pad2(Math.max(0, Math.min(59, Math.floor(num(s.mi, 0)))))
    + pad2(Math.max(0, Math.min(59, Math.floor(num(s.s, 0))))) + '.jpg';
}

/** Başlangıç yörüngesi: oyuncunun arkasından, hafif yukarıdan bakış. */
export function initialOrbit(playerYaw) {
  return { yaw: wrapAngle(num(playerYaw, 0)), pitch: PHOTO_DEFAULTS.pitchOffset, dist: PHOTO_DEFAULTS.dist };
}
