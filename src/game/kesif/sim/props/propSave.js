/*
 * KEŞİF sim/props — prop durumu kaydı (saf). Sözleşme §6/§14: yalnız VARSAYILANDAN FARKLI olan proplar `dims.neon.props` altında
 * {id36: [state, flags, extra?]} olarak saklanır (≤ 40 KB, DIM_SAVE_LIMITS.props). Kayıt güvensiz girdi sayılır: her alan doğrulanır,
 * `__proto__`/NaN/dev değerler atılır (fuzz testi).
 *
 *   idToStr(id) / strToId(s)                 u32 ↔ base36 ("0".."zik0zj"); geçersiz metin → null
 *   sanitizeEntry(raw) → [state, flags, extra?] | null
 *   encodeProps(map, maxBytes?) → nesne     map: Map<number id, {state,rflags,extra,order}>; boyut sınırını en eski değişiklikten kırparak uygular
 *   decodeProps(obj) → Map<number id, [state,flags,extra?]>     sınırlı (≤ MAX_ENTRIES) ve temiz
 *   jsonBytes(v) → UTF-8 JSON bayt sayısı (yaklaşık: kod noktaları)
 */
export const PROP_SAVE_MAX_BYTES = 40 * 1024;
export const PROP_SAVE_MAX_ENTRIES = 4000;
const MAX_STATE = 255;
const MAX_RFLAGS = 0xffff;
const MAX_EXTRA_STR = 24;
const MAX_EXTRA_ARR = 8;
const SAFE_STR = /^[0-9A-Za-z_.:\-çğıöşüÇĞİÖŞÜ ]*$/;

export function idToStr(id) {
  return (id >>> 0).toString(36);
}

export function strToId(s) {
  if (typeof s !== 'string' || !/^[0-9a-z]{1,7}$/.test(s)) return null;
  const v = parseInt(s, 36);
  return Number.isInteger(v) && v >= 0 && v <= 0xffffffff ? v : null;
}

function cleanNumber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v > 1e9 || v < -1e9) return null;
  return Math.round(v * 1000) / 1000;
}

/** extra: sonlu sayı | kısa güvenli metin | ≤8 sayılık dizi; aksi halde undefined. */
export function sanitizeExtra(x) {
  if (x === undefined || x === null) return undefined;
  if (typeof x === 'number') {
    const n = cleanNumber(x);
    return n === null ? undefined : n;
  }
  if (typeof x === 'string') {
    return x.length <= MAX_EXTRA_STR && SAFE_STR.test(x) ? x : undefined;
  }
  if (Array.isArray(x)) {
    if (x.length > MAX_EXTRA_ARR) return undefined;
    const out = [];
    for (let i = 0; i < x.length; i++) {
      const n = cleanNumber(x[i]);
      if (n === null) return undefined;
      out.push(n);
    }
    return out;
  }
  return undefined;
}

export function sanitizeEntry(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3) return null;
  const st = raw[0];
  const fl = raw.length > 1 ? raw[1] : 0;
  if (!Number.isInteger(st) || st < 0 || st > MAX_STATE) return null;
  if (!Number.isInteger(fl) || fl < 0 || fl > MAX_RFLAGS) return null;
  const ex = raw.length > 2 ? sanitizeExtra(raw[2]) : undefined;
  return ex === undefined ? [st, fl] : [st, fl, ex];
}

export function jsonBytes(v) {
  const s = JSON.stringify(v);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
  }
  return n;
}

/**
 * map: Map<id, {state, rflags, extra, order}> (yalnız varsayılandan farklı olanlar). Sınırı aşarsa en eski (küçük `order`) düşer.
 * Çıktı nesnesi prototipsizdir (Object.create(null)) ve JSON.stringify ile düz nesne gibi yazılır.
 */
export function encodeProps(map, maxBytes) {
  const limit = maxBytes > 0 ? maxBytes : PROP_SAVE_MAX_BYTES;
  const rows = [];
  map.forEach((e, id) => {
    const row = sanitizeEntry(e.extra === undefined ? [e.state, e.rflags] : [e.state, e.rflags, e.extra]);
    if (row) rows.push({ id, row, order: e.order | 0 });
  });
  rows.sort((a, b) => b.order - a.order || a.id - b.id); // en yeni değişiklik önce
  const out = Object.create(null);
  let bytes = 2;
  for (let i = 0; i < rows.length && i < PROP_SAVE_MAX_ENTRIES; i++) {
    const key = idToStr(rows[i].id);
    const add = key.length + 5 + jsonBytes(rows[i].row);
    if (bytes + add > limit) break;
    out[key] = rows[i].row;
    bytes += add;
  }
  return out;
}

export function decodeProps(obj) {
  const res = new Map();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return res;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length && res.size < PROP_SAVE_MAX_ENTRIES; i++) {
    const id = strToId(keys[i]);
    if (id === null) continue;
    const row = sanitizeEntry(obj[keys[i]]);
    if (row) res.set(id, row);
  }
  return res;
}
