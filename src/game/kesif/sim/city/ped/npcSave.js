/*
 * KEŞİF sim/city/ped — NPC / DÜKKÂN KAYDI (`dims.neon.city.{flags,npcs,shop}`; sözleşme §14, §16). SAF, es2020, prototip-kirlenmesi güvenli.
 *
 *   city.flags : {[anahtar /^[a-z0-9_]{1,24}$/]: tamsayı 0..9999}   ≤ 200 anahtar (görev/diyalog bayrakları; `q_<görev>` 1 etkin 2 bitti)
 *   city.npcs  : {[npcId]: {r: ilişki 0..9, v: konuşma sayısı ≤999, d: son gün, s: {düğümId: sayı} ≤24}}   ≤ 300 NPC (bulut kırpmada ilk atılan)
 *   city.shop  : {d: gün, s: {'satıcı|eşya': adet}, g: {eşya: günlük toplam alım}, k: {eşya: günlük satış}, t: şehir saniyesi, kg: günlük Kredi hediyesi}
 *
 *   FLAG_LIMITS · NPC_LIMITS · SHOP_LIMITS
 *   sanitizeFlags(raw) · sanitizeNpcs(raw) · sanitizeShop(raw) · sanitizeNpcSave(rawCity) → {flags, npcs, shop}   (citystate bunları korumalıdır)
 *   getFlag(city,key) · setFlag(city,key,v) → bool · bumpRel(city,npcId,d) → yeni ilişki · noteTalk(city,npcId,day,nodeId) → {first, visits}
 *   noteNode(city,npcId,nodeId) · markOnce(city,npcId,nodeId) · nodeCount(city,npcId,nodeId) · npcRel(city,npcId) · npcVisits(city,npcId) · rollDay(city, day) (gün değişince günlük sayaçları sıfırlar)
 *   createWallet(getCity, emit?, start?) → {get, spend, add}     Kredi semantiği araç sistemiyle aynı (tamsayı yoksa START_KREDI)
 */

import { foldTr } from '../../constants.js';

export const START_KREDI = 100;

/** Kayıt anahtarı için eşya kimliği: ASCII katlanmış (dimSanitize SAFE_KEY_RE Türkçe harf kabul etmez); itemByKey takma adı olarak geri çözülür. */
export const foldKey = (item) => foldTr(item);
export const FLAG_LIMITS = Object.freeze({ keys: 200, max: 9999 });
export const NPC_LIMITS = Object.freeze({ npcs: 300, nodes: 24, rel: 9, visits: 999 });
export const SHOP_LIMITS = Object.freeze({
  keys: 120, items: 60, max: 9999, creditGift: 150,
});

const FLAG_RE = /^[a-z0-9_]{1,24}$/;
const NPC_RE = /^[a-z0-9_]{1,24}$/;
const NODE_RE = /^[a-z0-9_.]{1,48}$/;
const ITEM_RE = /^(item|blok):[a-z0-9_]{1,40}$/;
const SHOP_KEY_RE = /^[a-z0-9_]{1,24}\|(item|blok):[a-z0-9_]{1,40}$/;
const BAD = Object.freeze(['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf']);
const HAS = Object.prototype.hasOwnProperty;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const clampInt = (v, a, b, d) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN;
  if (!(n === n)) return d;
  return n < a ? a : n > b ? b : n;
};
const own = (o, k) => HAS.call(o, k);

function okKey(k, re) {
  return typeof k === 'string' && re.test(k) && BAD.indexOf(k) < 0;
}

export function sanitizeFlags(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  const keys = Object.keys(raw);
  let n = 0;
  for (let i = 0; i < keys.length && n < FLAG_LIMITS.keys; i++) {
    const k = keys[i];
    if (!okKey(k, FLAG_RE)) continue;
    const v = raw[k];
    const val = v === true ? 1 : clampInt(v, 0, FLAG_LIMITS.max, 0);
    if (val > 0) {
      out[k] = val;
      n++;
    }
  }
  return out;
}

function sanitizeNpcEntry(raw) {
  if (!isObj(raw)) return null;
  const e = {
    r: clampInt(raw.r, 0, NPC_LIMITS.rel, 0),
    v: clampInt(raw.v, 0, NPC_LIMITS.visits, 0),
    d: clampInt(raw.d, 0, 1e6, 0),
    s: {},
  };
  if (isObj(raw.s)) {
    const ks = Object.keys(raw.s);
    let n = 0;
    for (let i = 0; i < ks.length && n < NPC_LIMITS.nodes; i++) {
      if (!okKey(ks[i], NODE_RE)) continue;
      const c = clampInt(raw.s[ks[i]], 0, NPC_LIMITS.visits, 0);
      if (c > 0) {
        e.s[ks[i]] = c;
        n++;
      }
    }
  }
  return e;
}

export function sanitizeNpcs(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  const keys = Object.keys(raw);
  let n = 0;
  for (let i = 0; i < keys.length && n < NPC_LIMITS.npcs; i++) {
    if (!okKey(keys[i], NPC_RE)) continue;
    const e = sanitizeNpcEntry(raw[keys[i]]);
    if (e) {
      out[keys[i]] = e;
      n++;
    }
  }
  return out;
}

function sanitizeCounts(raw, re, max) {
  const out = {};
  if (!isObj(raw)) return out;
  const keys = Object.keys(raw);
  let n = 0;
  for (let i = 0; i < keys.length && n < max; i++) {
    const k = keys[i];
    if (!re.test(k) || BAD.indexOf(k) >= 0) continue;
    const c = clampInt(raw[k], 0, SHOP_LIMITS.max, 0);
    if (c > 0) {
      out[k] = c;
      n++;
    }
  }
  return out;
}

export function emptyShop() {
  return {
    d: 0, s: {}, g: {}, k: {}, t: 0, kg: 0,
  };
}

export function sanitizeShop(raw) {
  const out = emptyShop();
  if (!isObj(raw)) return out;
  out.d = clampInt(raw.d, 0, 1e6, 0);
  out.t = typeof raw.t === 'number' && Number.isFinite(raw.t) && raw.t > 0 ? Math.min(raw.t, 1e9) : 0;
  out.kg = clampInt(raw.kg, 0, SHOP_LIMITS.creditGift, 0);
  out.s = sanitizeCounts(raw.s, SHOP_KEY_RE, SHOP_LIMITS.keys);
  out.g = sanitizeCounts(raw.g, ITEM_RE, SHOP_LIMITS.items);
  out.k = sanitizeCounts(raw.k, ITEM_RE, SHOP_LIMITS.items);
  return out;
}

/** Ham `city` nesnesinden üç alanı temiz okur (citystate sanitizer'ı bunu çağırıp sonucu city'ye yazar). */
export function sanitizeNpcSave(rawCity) {
  const c = isObj(rawCity) ? rawCity : {};
  return { flags: sanitizeFlags(c.flags), npcs: sanitizeNpcs(c.npcs), shop: sanitizeShop(c.shop) };
}

/* ---------------------------------------------------------------------------------------------- canlı yardımcılar */
function flagsOf(city, create) {
  if (!isObj(city)) return null;
  if (!isObj(city.flags)) {
    if (!create) return null;
    city.flags = {};
  }
  return city.flags;
}

export function getFlag(city, key) {
  const f = flagsOf(city, false);
  if (!f || !okKey(key, FLAG_RE) || !own(f, key)) return 0;
  return clampInt(f[key], 0, FLAG_LIMITS.max, 0);
}

/** v: tamsayı 0..9999 | bool. 0/false bayrağı siler. Sınır aşılırsa (200 anahtar) yeni anahtar reddedilir. */
export function setFlag(city, key, v) {
  if (!isObj(city) || !okKey(key, FLAG_RE)) return false;
  const val = v === true ? 1 : v === false ? 0 : clampInt(v, 0, FLAG_LIMITS.max, 0);
  const f = flagsOf(city, true);
  if (val === 0) {
    if (own(f, key)) delete f[key];
    return true;
  }
  if (!own(f, key) && Object.keys(f).length >= FLAG_LIMITS.keys) return false;
  f[key] = val;
  return true;
}

function npcsOf(city, create) {
  if (!isObj(city)) return null;
  if (!isObj(city.npcs)) {
    if (!create) return null;
    city.npcs = {};
  }
  return city.npcs;
}

function entryOf(city, npcId, create) {
  if (!okKey(npcId, NPC_RE)) return null;
  const m = npcsOf(city, create);
  if (!m) return null;
  if (own(m, npcId) && isObj(m[npcId])) return m[npcId];
  if (!create) return null;
  if (Object.keys(m).length >= NPC_LIMITS.npcs) return null;
  const e = { r: 0, v: 0, d: 0, s: {} };
  m[npcId] = e;
  return e;
}

export function npcRel(city, npcId) {
  const e = entryOf(city, npcId, false);
  return e ? clampInt(e.r, 0, NPC_LIMITS.rel, 0) : 0;
}

export function npcVisits(city, npcId) {
  const e = entryOf(city, npcId, false);
  return e ? clampInt(e.v, 0, NPC_LIMITS.visits, 0) : 0;
}

export function nodeCount(city, npcId, nodeId) {
  const e = entryOf(city, npcId, false);
  if (!e || !isObj(e.s) || !okKey(nodeId, NODE_RE) || !own(e.s, nodeId)) return 0;
  return clampInt(e.s[nodeId], 0, NPC_LIMITS.visits, 0);
}

export function bumpRel(city, npcId, d) {
  const e = entryOf(city, npcId, true);
  if (!e) return 0;
  e.r = clampInt(clampInt(e.r, 0, NPC_LIMITS.rel, 0) + clampInt(d, -2, 2, 0), 0, NPC_LIMITS.rel, 0);
  return e.r;
}

/** Konuşma kaydı: ziyaret sayısı, ilk ziyaret, günde bir kez ilişki +1 (en çok 9), düğüm sayacı. */
export function noteTalk(city, npcId, day, nodeId) {
  const e = entryOf(city, npcId, true);
  if (!e) return { first: false, visits: 0, dayFirst: false };
  const first = clampInt(e.v, 0, NPC_LIMITS.visits, 0) === 0;
  const dayN = clampInt(day, 0, 1e6, 0);
  const dayFirst = first || clampInt(e.d, 0, 1e6, 0) !== dayN;
  e.v = Math.min(NPC_LIMITS.visits, clampInt(e.v, 0, NPC_LIMITS.visits, 0) + 1);
  e.d = dayN;
  if (dayFirst) e.r = Math.min(NPC_LIMITS.rel, clampInt(e.r, 0, NPC_LIMITS.rel, 0) + 1);
  if (okKey(nodeId, NODE_RE)) {
    if (!isObj(e.s)) e.s = {};
    if (own(e.s, nodeId) || Object.keys(e.s).length < NPC_LIMITS.nodes) e.s[nodeId] = Math.min(NPC_LIMITS.visits, clampInt(e.s[nodeId], 0, NPC_LIMITS.visits, 0) + 1);
  }
  return { first, visits: e.v, dayFirst };
}

/** Düğüm sayacını 1 artırır (ziyaret sayısına dokunmaz). */
export function noteNode(city, npcId, nodeId) {
  const e = entryOf(city, npcId, true);
  if (!e || !okKey(nodeId, NODE_RE)) return 0;
  if (!isObj(e.s)) e.s = {};
  if (!own(e.s, nodeId) && Object.keys(e.s).length >= NPC_LIMITS.nodes) return 0;
  e.s[nodeId] = Math.min(NPC_LIMITS.visits, clampInt(e.s[nodeId], 0, NPC_LIMITS.visits, 0) + 1);
  return e.s[nodeId];
}

/** Düğüm sayacını 1'e sabitler (yalnız tek seferlik düğüm işareti; `once`). */
export function markOnce(city, npcId, nodeId) {
  const e = entryOf(city, npcId, true);
  if (!e || !okKey(nodeId, NODE_RE)) return false;
  if (!isObj(e.s)) e.s = {};
  if (!own(e.s, nodeId) && Object.keys(e.s).length >= NPC_LIMITS.nodes) return false;
  e.s[nodeId] = Math.max(1, clampInt(e.s[nodeId], 0, NPC_LIMITS.visits, 0));
  return true;
}

export function shopOf(city) {
  if (!isObj(city)) return null;
  if (!isObj(city.shop)) city.shop = emptyShop();
  const s = city.shop;
  if (!isObj(s.s)) s.s = {};
  if (!isObj(s.g)) s.g = {};
  if (!isObj(s.k)) s.k = {};
  if (typeof s.t !== 'number' || !Number.isFinite(s.t)) s.t = 0;
  if (!Number.isInteger(s.d)) s.d = 0;
  if (!Number.isInteger(s.kg)) s.kg = 0;
  return s;
}

/** Gün değiştiyse günlük sayaçları (alış/satış/hediye) sıfırlar. Dönüş: değişti mi. */
export function rollDay(city, day) {
  const s = shopOf(city);
  if (!s) return false;
  const d = clampInt(day, 0, 1e6, 0);
  if (s.d === d) return false;
  s.d = d;
  s.s = {};
  s.g = {};
  s.k = {};
  s.kg = 0;
  return true;
}

/** Kredi üst sınırı (kayıt doğrulayıcısıyla aynı: cityState 1e9). Çalışma zamanında da uygulanır: taşan toplam sonsuza gidip bakiyeyi sıfırlamasın (qa5). */
export const KREDI_MAX = 1000000000;

export function createWallet(getCity, emit, start) {
  const base = Number.isInteger(start) ? start : START_KREDI;
  const blob = () => {
    const c = typeof getCity === 'function' ? getCity() : null;
    return isObj(c) ? c : null;
  };
  const wallet = {
    get() {
      const c = blob();
      if (!c) return 0;
      if (!Number.isInteger(c.kredi)) c.kredi = base;
      return c.kredi;
    },
    spend(n, why) {
      const c = blob();
      if (!c || !Number.isInteger(n) || n < 0) return false;
      if (wallet.get() < n) return false;
      c.kredi -= n;
      if (n > 0 && typeof emit === 'function') emit({ type: 'kredi', value: c.kredi, delta: -n, why: why || '' });
      return true;
    },
    add(n, why) {
      const c = blob();
      if (!c || !Number.isInteger(n) || n <= 0 || n > KREDI_MAX) return false;
      c.kredi = Math.min(KREDI_MAX, wallet.get() + n);
      if (typeof emit === 'function') emit({ type: 'kredi', value: c.kredi, delta: n, why: why || '' });
      return true;
    },
  };
  return wallet;
}
