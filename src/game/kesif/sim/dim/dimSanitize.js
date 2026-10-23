/*
 * KEŞİF sim — kayıt v3 boyut verisi: SIKI doğrulayıcılar ve boyut sınırları (saf; worker-güvenli). Sözleşme §14, §20.
 *
 *   sanitizeDimMeta(raw)            → {calibrated, visits, firstArrival, link, overworldPos, lastHopAt}   (atmaz; her alan sınırlı)
 *   defaultDimMeta()                → göç/yeni dünya varsayılanı
 *   sanitizeDims(raw, warnings?)    → {neon?: temiz blob}    bilinmeyen boyut anahtarı atılır
 *   sanitizeNeon(raw, warnings?)    → temiz dims.neon blob | null     (yükleme yolu: tam doğrulama + sınırlar)
 *   normalizeDimsForSave(dims)      → {neon?}   (serileştirme yolu: ucuz — çözmeden sınır uygular)
 *   limitNeon(neon, ref?)           → {neon, trimmed:[...]}    DIM_SAVE_LIMITS'e göre bulut sırasıyla kırpar
 *   NEON_TRIM_STAGES                bulut zarfı kırpma sırası: npcs → vehicles → entities → props (sonra edits: trimNeonEdits)
 *   trimNeonEdits(edits, ref, keep) en uzak chunk'tan başlayarak düzenleme parçalarını atar → {edits, dropped}
 *   neonEditsBytes(edits)           kodlanmış düzenleme boyutu (bayt)
 *   registerDimSanitizer(dim, part, fn) / unregisterDimSanitizer     ('neon','city'): citystate kendi ayrıntılı doğrulayıcısını verir
 *   safeBlob(v, opts)               JSON-güvenli sınırlı derin kopya (prototip anahtarı yok, NaN yok)
 *   DIM_SAVE_LIMITS, DIM_ID_RE, NEON_BLOB_VERSION, jsonBytes
 *
 * dims.neon şeması (v:1):
 *   {v, edits:{'cx,cz,si':rle}, clock:{time,day,dayLengthSec}|null, weather:{seed,t}|null, spawn:[x,y,z]|null, terminals:int16 maske,
 *    props:{id:[state,flags,extra?]}, locks:{lockId:state}, chests:{'x,y,z':[slots]}, tech:{...}|null, entities:[...],
 *    stash:[{item,count,dur?,ench?,charge?}], city:{v,...}|null}
 * Kimlikler (prop/kilit) `^[0-9a-z]{1,10}$`; `__proto__`/constructor/prototype anahtarları ve NaN/Infinity her yerde atılır.
 */
import { WORLD_Y_MAX, WORLD_Y_MIN } from '../constants.js';
import { Inventory } from '../inventory.js';
import { TechState } from '../techState.js';
import { decodeEdits } from '../saveEdits.js';
import {
  cleanPos, collectEntities, decodeChests, encodeChests, isObj, num, round, toNum,
} from '../saveSanitize.js';
import { DIM_SAVE_LIMITS, TERMINAL_COUNT, dimChunkInBounds } from './dimensions.js';

export { DIM_SAVE_LIMITS };
export const NEON_BLOB_VERSION = 1;
export const DIM_ID_RE = /^[0-9a-z]{1,10}$/;
const SECTION_KEY_RE = /^(-?\d{1,5}),(-?\d{1,5}),(\d{1,2})$/;
const SAFE_KEY_RE = /^[A-Za-z0-9_:.,\-|]{1,48}$/;
const HAS = Object.prototype.hasOwnProperty;
const MASK_ALL = (1 << TERMINAL_COUNT) - 1;
/** dims.neon blobunun bilinen alanları (sıra kayıt sırasıdır). */
const NEON_KEYS = Object.freeze(['edits', 'clock', 'weather', 'spawn', 'terminals', 'props', 'locks', 'chests', 'tech', 'entities', 'stash', 'city']);

const PART_SANITIZERS = new Map();
/** Parça doğrulayıcı: fn(raw, warnings) → temiz değer | null. Yalnız ('neon','city') bugün kullanılır. */
export function registerDimSanitizer(dim, part, fn) {
  if (typeof dim === 'string' && typeof part === 'string' && typeof fn === 'function') PART_SANITIZERS.set(dim + '.' + part, fn);
}
export function unregisterDimSanitizer(dim, part) {
  return PART_SANITIZERS.delete(dim + '.' + part);
}

/** Prototip anahtarları + Object.prototype üyelerini gölgeleyen adlar (toString/valueOf… sahip anahtarı Number()/string birleştirmede atar). */
const SHADOW_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);
function badKey(k) {
  return SHADOW_KEYS.indexOf(k) >= 0;
}
/** Anahtar prototip/Object.prototype üyesini gölgeler mi (kayıt doğrulayıcıları bu adları atar). */
export function isShadowKey(k) {
  return badKey(k);
}

/** UTF-8 bayt uzunluğu (TextEncoder gerektirmez). */
function utf8Len(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export function jsonBytes(v) {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? 0 : utf8Len(s);
  } catch {
    return Infinity;
  }
}

function validId(id) {
  return DIM_ID_RE.test(id) && !badKey(id);
}

function int(v, lo, hi, def) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return def;
  const f = Math.floor(n);
  return f < lo ? lo : f > hi ? hi : f;
}

/* ------------------------------------------------------------------------------------------------
 * Genel JSON-güvenli kopya
 * ---------------------------------------------------------------------------------------------- */
/**
 * Sınırlı derin kopya: fonksiyon/undefined/sembol atılır; NaN/Infinity dizide 0, nesnede atlanır; `__proto__`/constructor/prototype
 * anahtarları ve bozuk anahtarlar atılır; derinlik, anahtar, dizi, metin ve toplam düğüm sayısı sınırlıdır; döngü yok (derinlik sınırı).
 * opts: {depth=8, keys=256, arr=1024, str=120, nodes=20000}
 */
export function safeBlob(v, opts) {
  const o = opts || {};
  const lim = {
    depth: o.depth === undefined ? 8 : o.depth,
    keys: o.keys === undefined ? 256 : o.keys,
    arr: o.arr === undefined ? 1024 : o.arr,
    str: o.str === undefined ? 120 : o.str,
    nodes: o.nodes === undefined ? 20000 : o.nodes,
  };
  const st = { n: 0 };
  const r = copy(v, lim.depth, lim, st);
  return r === undefined ? null : r;
}

function copy(v, d, lim, st) {
  if (v === null) return null;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? v : undefined;
  if (t === 'boolean') return v;
  if (t === 'string') return v.length > lim.str ? v.slice(0, lim.str) : v;
  if (t !== 'object' || d <= 0 || st.n >= lim.nodes) return undefined;
  st.n++;
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length && i < lim.arr && st.n < lim.nodes; i++) {
      const x = copy(v[i], d - 1, lim, st);
      out.push(x === undefined ? 0 : x);
    }
    return out;
  }
  const out = {};
  const ks = Object.keys(v);
  let n = 0;
  for (let i = 0; i < ks.length && n < lim.keys && st.n < lim.nodes; i++) {
    const k = ks[i];
    if (badKey(k) || !SAFE_KEY_RE.test(k)) continue;
    const x = copy(v[k], d - 1, lim, st);
    if (x === undefined) continue;
    out[k] = x;
    n++;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * dimMeta / player.dim
 * ---------------------------------------------------------------------------------------------- */
export function defaultDimMeta() {
  return {
    calibrated: false, visits: 0, firstArrival: null, link: null, overworldPos: null, lastHopAt: 0,
  };
}

function cleanLink(raw) {
  if (!isObj(raw) || !Array.isArray(raw.from) || raw.from.length < 3) return null;
  const f = raw.from;
  const p = cleanPos([f[0], f[1], f[2]], null);
  if (p === null) return null;
  const yaw = toNum(f.length > 3 ? f[3] : 0);
  return { from: [p[0], p[1], p[2], round(Number.isFinite(yaw) ? num(yaw, -1e5, 1e5, 0) : 0, 3)] };
}

/** dimMeta: bilinen alanlar, sınırlı; bilinmeyen alanlar atılır; atmaz. */
export function sanitizeDimMeta(raw) {
  const r = isObj(raw) ? raw : {};
  const fa = toNum(r.firstArrival);
  return {
    calibrated: r.calibrated === true,
    visits: int(r.visits, 0, 1000000, 0),
    firstArrival: Number.isFinite(fa) && fa > 0 ? Math.floor(num(fa, 0, 4e12, 0)) : null,
    link: cleanLink(r.link),
    overworldPos: cleanPos(r.overworldPos, null),
    lastHopAt: round(num(r.lastHopAt, 0, 1e9, 0), 2),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Düzenlemeler (kesit farkları)
 * ---------------------------------------------------------------------------------------------- */
function editDist(key, rx, rz) {
  const p = key.split(',');
  const dx = Number(p[0]) * 16 + 8 - rx;
  const dz = Number(p[1]) * 16 + 8 - rz;
  return dx * dx + dz * dz;
}

/** Kodlanmış düzenleme parçalarının JSON'daki yaklaşık boyutu (anahtar + değer + ayraç). */
export function neonEditsBytes(edits) {
  return editsBytes(edits);
}

function editsBytes(edits) {
  let b = 0;
  const ks = Object.keys(edits);
  for (let i = 0; i < ks.length; i++) b += ks[i].length + edits[ks[i]].length + 6;
  return b;
}

/**
 * Düzenleme parçalarını en uzak chunk'tan başlayarak atar; kodlanmış boyut `keep` baytın altına inene dek (varsayılan: limit).
 * Girdi değiştirilmez; {edits, dropped}.
 */
export function trimNeonEdits(edits, ref, keep) {
  const lim = keep === undefined ? DIM_SAVE_LIMITS.edits : keep;
  const src = isObj(edits) ? edits : {};
  let bytes = editsBytes(src);
  if (bytes <= lim) return { edits: src, dropped: 0 };
  const rx = ref ? ref[0] : 0;
  const rz = ref ? ref[1] : 0;
  const ks = Object.keys(src).sort((a, b) => editDist(b, rx, rz) - editDist(a, rx, rz) || (a < b ? -1 : 1));
  const out = Object.assign({}, src);
  let dropped = 0;
  for (let i = 0; i < ks.length && bytes > lim; i++) {
    bytes -= ks[i].length + out[ks[i]].length + 6;
    delete out[ks[i]];
    dropped++;
  }
  return { edits: out, dropped };
}

/** Yükleme: anahtar/RLE doğrulaması + şehir sınırları + boyut sınırı. */
function cleanNeonEdits(raw, warnings) {
  const out = {};
  if (!isObj(raw)) return out;
  const pre = {};
  let bad = 0;
  const ks = Object.keys(raw).sort();
  let kept = 0;
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    const m = SECTION_KEY_RE.exec(k);
    const v = raw[k];
    if (!m || typeof v !== 'string' || v.length > 100000 || !dimChunkInBounds('neon', Number(m[1]), Number(m[2]))) {
      bad++;
      continue;
    }
    if (kept >= 9000) {
      bad++;
      continue;
    }
    pre[k] = v;
    kept++;
  }
  const dec = decodeEdits(pre, WORLD_Y_MIN);
  const badSet = {};
  if (dec.ok) for (let i = 0; i < dec.bad.length; i++) badSet[dec.bad[i]] = 1;
  else bad += Object.keys(pre).length;
  if (dec.ok) {
    Object.keys(pre).forEach((k) => {
      if (badSet[k] === 1) bad++;
      else out[k] = pre[k];
    });
  }
  if (bad > 0 && warnings) warnings.push('neon.edits:' + bad);
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Alt alanlar
 * ---------------------------------------------------------------------------------------------- */
function cleanClock(raw) {
  if (!isObj(raw)) return null;
  const len = num(raw.dayLengthSec, 60, 86400, 600);
  const t = raw.time !== undefined ? raw.time : toNum(raw.tick) / 60;
  return {
    time: round(num(t, 0, len - 0.01, 0), 2),
    day: int(raw.day, 0, 1000000, 0),
    dayLengthSec: len,
  };
}

function cleanWeather(raw) {
  if (!isObj(raw)) return null;
  return { seed: int(raw.seed, 0, 4294967295, 0), t: round(num(raw.t, 0, 1e9, 0), 1) };
}

function cleanProps(raw, warnings) {
  const out = {};
  if (!isObj(raw)) return out;
  const ks = Object.keys(raw).sort();
  let bytes = 2;
  let dropped = 0;
  for (let i = 0; i < ks.length; i++) {
    const id = ks[i];
    const v = raw[id];
    if (!validId(id) || !Array.isArray(v) || v.length < 2) {
      dropped++;
      continue;
    }
    const e = [int(v[0], 0, 255, 0), int(v[1], 0, 65535, 0)];
    if (v.length > 2 && v[2] !== null && v[2] !== undefined) {
      const x = safeBlob(v[2], { depth: 3, keys: 8, arr: 8, str: 32, nodes: 40 });
      if (x !== null && jsonBytes(x) <= 160) e.push(x);
    }
    const add = id.length + jsonBytes(e) + 4;
    if (bytes + add > DIM_SAVE_LIMITS.props) {
      dropped++;
      continue;
    }
    bytes += add;
    out[id] = e;
  }
  if (dropped > 0 && warnings) warnings.push('neon.props:' + dropped);
  return out;
}

function cleanLocks(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  const ks = Object.keys(raw).sort();
  let n = 0;
  for (let i = 0; i < ks.length && n < 4096; i++) {
    const id = ks[i];
    if (!validId(id)) continue;
    const v = raw[id];
    if (typeof v === 'boolean') out[id] = v ? 1 : 0;
    else if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue;
      out[id] = int(v, 0, 65535, 0);
    } else if (isObj(v)) {
      const b = safeBlob(v, { depth: 2, keys: 8, arr: 4, str: 24, nodes: 24 });
      if (b === null || jsonBytes(b) > 160) continue;
      out[id] = b;
    } else continue;
    n++;
  }
  return out;
}

function cleanChests(raw) {
  try {
    return encodeChests(decodeChests(raw));
  } catch {
    return {};
  }
}

function cleanTech(raw) {
  if (!isObj(raw)) return null;
  try {
    return new TechState().restore(raw, { minY: WORLD_Y_MIN, maxY: WORLD_Y_MAX }).serialize();
  } catch {
    return null;
  }
}

function cleanEntities(raw) {
  if (!Array.isArray(raw)) return [];
  const r = collectEntities({ entities: raw }, null);
  return r.entities.concat(r.drops).slice(0, DIM_SAVE_LIMITS.entities);
}

/** Yığın (boyuta bağlı eşyalar): geçerli eşya anahtarları, sayı/dayanıklılık/büyü/şarj doğrulanır. */
export function cleanStash(raw) {
  if (!Array.isArray(raw)) return [];
  const inv = new Inventory({ size: DIM_SAVE_LIMITS.stash, hotbar: 1, armor: 0 });
  try {
    inv.fromJSON({ slots: raw.slice(0, DIM_SAVE_LIMITS.stash) });
  } catch {
    return [];
  }
  const out = [];
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (!s || typeof s.item !== 'string') continue; // itemByKey('__proto__') gibi prototip adları kayıtsız eşya sayılmaz
    const e = { item: s.item, count: s.count };
    if (s.dur !== undefined) e.dur = s.dur;
    if (s.ench) e.ench = s.ench;
    if (s.charge !== undefined) e.charge = s.charge;
    out.push(e);
  }
  return out;
}

function cleanCity(raw, warnings) {
  if (!isObj(raw)) return null;
  const fn = PART_SANITIZERS.get('neon.city');
  let c;
  try {
    c = fn ? fn(raw, warnings) : safeBlob(raw, { depth: 8, keys: 256, arr: 1024, str: 120, nodes: 20000 });
  } catch {
    c = null;
  }
  if (!isObj(c)) return null;
  if (jsonBytes(c) > DIM_SAVE_LIMITS.city) {
    if (warnings) warnings.push('neon.city:big');
    return null;
  }
  return c;
}

/* ------------------------------------------------------------------------------------------------
 * Boyut sınırları + bulut kırpma sırası
 * ---------------------------------------------------------------------------------------------- */
/**
 * Bulut zarfı kırpma aşamaları (sırayla): neon halk/NPC → araç → varlıklar → prop. Her fn(neon) → yeni neon | null (değişmediyse null).
 * Girdi değiştirilmez. Düzenlemeler en son (en uzak chunk önce): trimNeonEdits.
 */
export const NEON_TRIM_STAGES = Object.freeze([
  Object.freeze({
    name: 'npcs',
    fn(neon) {
      const c = neon.city;
      if (!isObj(c) || !isObj(c.npcs) || Object.keys(c.npcs).length === 0) return null;
      return Object.assign({}, neon, { city: Object.assign({}, c, { npcs: {} }) });
    },
  }),
  Object.freeze({
    name: 'vehicles',
    fn(neon) {
      const c = neon.city;
      if (!isObj(c) || c.summoned === null || c.summoned === undefined) return null;
      return Object.assign({}, neon, { city: Object.assign({}, c, { summoned: null }) });
    },
  }),
  Object.freeze({
    name: 'entities',
    fn(neon) {
      return Array.isArray(neon.entities) && neon.entities.length > 0 ? Object.assign({}, neon, { entities: [] }) : null;
    },
  }),
  Object.freeze({
    name: 'props',
    fn(neon) {
      return isObj(neon.props) && Object.keys(neon.props).length > 0 ? Object.assign({}, neon, { props: {} }) : null;
    },
  }),
]);

/**
 * dims.neon'u DIM_SAVE_LIMITS'e uydurur (kodlanmış düzenleme ≤250 KB, props ≤40 KB, city ≤60 KB, toplam ≤400 KB). Önce tek tek sınırlar
 * (props/edits kırpılır; city aşımı atılır), sonra toplam için bulut sırasıyla kırpılır. `ref`: [x,z] en uzak chunk ölçüsü referansı.
 * Döner {neon, trimmed:[ad]} — girdi değiştirilmez.
 */
export function limitNeon(neonIn, ref) {
  let neon = neonIn;
  const trimmed = [];
  if (isObj(neon.edits)) {
    const r = trimNeonEdits(neon.edits, ref, DIM_SAVE_LIMITS.edits);
    if (r.dropped > 0) {
      neon = Object.assign({}, neon, { edits: r.edits });
      trimmed.push('edits:' + r.dropped);
    }
  }
  if (isObj(neon.props) && jsonBytes(neon.props) > DIM_SAVE_LIMITS.props) {
    const ks = Object.keys(neon.props).sort();
    const keep = {};
    let b = 2;
    let dropped = 0;
    for (let i = 0; i < ks.length; i++) {
      const add = ks[i].length + jsonBytes(neon.props[ks[i]]) + 4;
      if (b + add > DIM_SAVE_LIMITS.props) {
        dropped++;
        continue;
      }
      b += add;
      keep[ks[i]] = neon.props[ks[i]];
    }
    neon = Object.assign({}, neon, { props: keep });
    trimmed.push('props:' + dropped);
  }
  if (isObj(neon.city) && jsonBytes(neon.city) > DIM_SAVE_LIMITS.city) {
    neon = Object.assign({}, neon, { city: null });
    trimmed.push('city');
  }
  for (let i = 0; i < NEON_TRIM_STAGES.length && jsonBytes(neon) > DIM_SAVE_LIMITS.total; i++) {
    const n2 = NEON_TRIM_STAGES[i].fn(neon);
    if (n2 !== null) {
      neon = n2;
      trimmed.push(NEON_TRIM_STAGES[i].name);
    }
  }
  if (jsonBytes(neon) > DIM_SAVE_LIMITS.total && isObj(neon.edits)) {
    const others = jsonBytes(Object.assign({}, neon, { edits: {} }));
    const r = trimNeonEdits(neon.edits, ref, Math.max(0, DIM_SAVE_LIMITS.total - others));
    if (r.dropped > 0) {
      neon = Object.assign({}, neon, { edits: r.edits });
      trimmed.push('edits:' + r.dropped);
    }
  }
  return { neon, trimmed };
}

/* ------------------------------------------------------------------------------------------------
 * Tam doğrulama (yükleme) ve ucuz normalleştirme (kayıt)
 * ---------------------------------------------------------------------------------------------- */
/**
 * dims.neon ham → temiz blob | null. atmaz.
 * opts.trustEdits: düzenleme parçalarını çözmeden olduğu gibi al (serileştirme yolu: encodeEdits çıktısı zaten geçerlidir).
 * opts.ref: [x,z] sınır aşımında "en uzak chunk önce" kırpmanın referansı (varsayılan Kapı Meydanı).
 */
export function sanitizeNeon(raw, warnings, opts) {
  if (!isObj(raw)) return null;
  if (raw.v !== undefined && !(Number.isInteger(raw.v) && raw.v >= 1)) {
    if (warnings) warnings.push('neon:v');
    return null;
  }
  if (Number.isInteger(raw.v) && raw.v > NEON_BLOB_VERSION) {
    if (warnings) warnings.push('neon:newer');
    return null;
  }
  const w = warnings || null;
  const sp = cleanPos(raw.spawn, null);
  const neon = {
    v: NEON_BLOB_VERSION,
    edits: opts && opts.trustEdits === true && isObj(raw.edits) ? Object.assign({}, raw.edits) : cleanNeonEdits(raw.edits, w),
    clock: cleanClock(raw.clock),
    weather: cleanWeather(raw.weather),
    spawn: sp,
    terminals: int(raw.terminals, 0, MASK_ALL, 0),
    props: cleanProps(raw.props, w),
    locks: cleanLocks(raw.locks),
    chests: cleanChests(raw.chests),
    tech: cleanTech(raw.tech),
    entities: cleanEntities(raw.entities),
    stash: cleanStash(raw.stash),
    city: cleanCity(raw.city, w),
  };
  const lim = limitNeon(neon, opts && opts.ref ? opts.ref : null);
  if (lim.trimmed.length > 0 && w) w.push('neon.limit:' + lim.trimmed.join('+'));
  return lim.neon;
}

/** dims ham → {neon?}: yalnız bilinen boyut kimlikleri; atmaz. */
export function sanitizeDims(raw, warnings) {
  const out = {};
  if (!isObj(raw)) return out;
  if (HAS.call(raw, 'neon')) {
    const n = sanitizeNeon(raw.neon, warnings);
    if (n !== null) out.neon = n;
  }
  return out;
}

/**
 * Kayıt yolu (serializeGame): dims'i çözmeden normalleştirir — yalnız bilinen boyutlar, v alanı, sınırlar. Üretici
 * (dimState.serializeDim) zaten temiz veri üretir; bu yalnız dışarıdan verilen nesneye karşı emniyet kemeridir.
 */
export function normalizeDimsForSave(dims) {
  const out = {};
  if (!isObj(dims) || !isObj(dims.neon)) return out;
  const n = { v: NEON_BLOB_VERSION };
  for (let i = 0; i < NEON_KEYS.length; i++) if (HAS.call(dims.neon, NEON_KEYS[i])) n[NEON_KEYS[i]] = dims.neon[NEON_KEYS[i]];
  out.neon = limitNeon(n, null).neon;
  return out;
}
