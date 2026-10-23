/*
 * qa5 (Faz 5, qa_logic) — ortak test araçları (yalnız qa5 testleri içe aktarır; oyun yüklemez).
 *   buildStock(seed, dayN)   → tüm satıcıların günlük stoğu {id: [{item,price,qty}]}
 *   deepFinite(v)            → değerdeki her sayı sonlu mu (NaN/Infinity yok); döngü yok varsayılır (JSON'dan gelen)
 *   findProto(v)             → değerde __proto__/constructor/prototype ANAHTARI var mı (sahip anahtar olarak)
 *   canon(v)                 → anahtar sırası kararlı JSON metni
 */
import { VENDORS } from '../sim/city/ped/vendorData.js';
import { vendorStock } from '../sim/city/ped/vendorLogic.js';

export function buildStock(seed, dayN) {
  const out = {};
  VENDORS.forEach((v) => { out[v.id] = vendorStock(seed, dayN, v.id); });
  return out;
}

export function deepFinite(v, depth) {
  const d = depth || 0;
  if (d > 40) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'bigint' || typeof v === 'function' || typeof v === 'symbol') return false;
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    for (let i = 0; i < ks.length; i++) if (!deepFinite(v[ks[i]], d + 1)) return false;
  }
  return true;
}

export function findProto(v, depth) {
  const d = depth || 0;
  if (d > 40 || !v || typeof v !== 'object') return false;
  const ks = Object.getOwnPropertyNames(v);
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
    if (findProto(v[k], d + 1)) return true;
  }
  return false;
}

export function canon(v) {
  return JSON.stringify(v, (k, x) => {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const o = {};
      Object.keys(x).sort().forEach((q) => { o[q] = x[q]; });
      return o;
    }
    return x;
  });
}

/** İki JSON benzeri değer arasındaki ilk fark (yol: değerler) — eşitse ''. */
export function diffPath(a, b, path) {
  const p = path || '';
  if (a === b) return '';
  const ta = typeof a;
  const show = (v) => String(JSON.stringify(v)).slice(0, 80);
  if (ta !== typeof b || a === null || b === null || ta !== 'object') return p + ': ' + show(a) + ' ≠ ' + show(b);
  if (Array.isArray(a) !== Array.isArray(b)) return p + ': dizi/nesne';
  const ks = Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
  for (let i = 0; i < ks.length; i++) {
    const d = diffPath(a[ks[i]], b[ks[i]], p + '/' + ks[i]);
    if (d) return d;
  }
  return '';
}

/** İlk sonlu olmayan sayının yolu (yoksa ''). */
export function nonFinitePath(v, path, depth) {
  const d = depth || 0;
  const p = path || '';
  if (d > 40) return p + ': çok derin';
  if (typeof v === 'number') return Number.isFinite(v) ? '' : p + ': ' + String(v);
  if (typeof v === 'bigint' || typeof v === 'function' || typeof v === 'symbol') return p + ': ' + typeof v;
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    for (let i = 0; i < ks.length; i++) {
      const r = nonFinitePath(v[ks[i]], p + '/' + ks[i], d + 1);
      if (r) return r;
    }
  }
  return '';
}

/** Prototip anahtarının yolu (yoksa ''). */
export function protoPath(v, path, depth) {
  const d = depth || 0;
  const p = path || '';
  if (d > 40 || !v || typeof v !== 'object') return '';
  const ks = Object.getOwnPropertyNames(v);
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return p + '/' + k;
    const r = protoPath(v[k], p + '/' + k, d + 1);
    if (r) return r;
  }
  return '';
}

/** fn() atarsa testi yığın izinin ilk satırlarıyla düşür (expect().not.toThrow() yığını göstermez). */
export function callSafe(fn, label) {
  try {
    return fn();
  } catch (e) {
    throw new Error((label || 'hata') + ': ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join(' | '));
  }
}
