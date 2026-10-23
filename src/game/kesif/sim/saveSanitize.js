/*
 * KEŞİF sim — kayıt yardımcıları: JSON-güvenli temizleme, varlık/düşen eşya/sandık/bulmaca doğrulayıcıları (saf).
 * Hepsi atmaz; geçersiz girdiyi atar ya da sınırlar.
 */
import { isBossKey } from './mobTypes.js';
import { safeItem, safeMobKey } from './progressionData.js';
import { sanitizeEnch } from './magicEnchant.js';
import { sanitizeCharge } from './techCharge.js';
import { WORLD_Y_MAX, WORLD_Y_MIN } from './constants.js';

export const LIMITS = Object.freeze({
  entities: 80,
  drops: 100,
  chests: 600,
  chestSlots: 27,
  puzzles: 1500,
  nameMax: 60,
  coord: 1000000,
});

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;
const BANNED_KEYS = { ai: 1, target: 1, cooldowns: 1, events: 1, vx: 1, vy: 1, vz: 1, constructor: 1, prototype: 1 };
const DROP_TYPES = { drop: 1, item: 1, düşen_eşya: 1, dropped: 1 };
const POS_KEYS = { x: 1, y: 1, z: 1 };
const PROTO_KEYS = { constructor: 1, prototype: 1 };
// Object.prototype üyelerini gölgeleyen anahtarlar (toString/valueOf… sahip anahtarı varlıkta/blobda string/sayı dönüşümünü atar; qa5 fuzz bulgusu)
const SHADOW_KEYS = ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
function badKey(k) {
  return k === '__proto__' || PROTO_KEYS[k] === 1 || SHADOW_KEYS.indexOf(k) >= 0;
}

export function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Number(v), ama düşmanca nesnede (JSON'dan gelen sahip "toString"/"valueOf" anahtarı) atmaz → NaN (qa5 fuzz bulgusu). */
export function toNum(v) {
  try {
    return Number(v);
  } catch {
    return NaN;
  }
}

export function num(v, lo, hi, def) {
  const n = toNum(v);
  if (!Number.isFinite(n)) return def;
  return n < lo ? lo : n > hi ? hi : n;
}

export function round(n, d) {
  const f = d === 1 ? 10 : d === 2 ? 100 : 1000;
  const r = Math.round(n * f) / f;
  return Number.isFinite(r) || !Number.isFinite(n) ? r : n; // qa5: 1e306 × 1000 taşar → ±Infinity üretme (zaten tamsayı büyüklüğünde: olduğu gibi)
}

/** JSON-güvenli derin kopya: fonksiyon/undefined/NaN atılır, derinlik ve boyut sınırlı, döngü yok. */
export function jsonSafe(v, depth) {
  const d = depth === undefined ? 6 : depth;
  if (v === null) return null;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? v : 0;
  if (t === 'boolean') return v;
  if (t === 'string') return v.length > 240 ? v.slice(0, 240) : v;
  if (d <= 0) return null;
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length && i < 256; i++) {
      const x = jsonSafe(v[i], d - 1);
      out.push(x === undefined ? null : x);
    }
    return out;
  }
  if (t === 'object') {
    const out = {};
    const ks = Object.keys(v);
    for (let i = 0; i < ks.length && i < 64; i++) {
      const k = ks[i];
      if (badKey(k)) continue;
      const x = jsonSafe(v[k], d - 1);
      if (x !== undefined) out[k] = x;
    }
    return out;
  }
  return undefined;
}

function hasControl(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

/** Ad: kontrol karakteri ve < > temizlenir, kırpılır; boşsa varsayılan. */
export function cleanName(v, def) {
  if (typeof v !== 'string') return def;
  let t = '';
  for (let k = 0; k < v.length; k++) {
    const c = v.charCodeAt(k);
    if (c >= 32 && c !== 127 && c !== 60 && c !== 62) t += v.charAt(k);
  }
  const s = t.replace(/\s+/g, ' ').trim();
  const cut = Array.from(s).slice(0, LIMITS.nameMax).join('');
  return cut.length ? cut : def;
}

/** Tohum: sonlu sayı ya da ≤ 24 karakterli metin; aksi null. */
export function cleanSeed(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.floor(v) : null;
  if (typeof v === 'string') {
    const s = v.trim().slice(0, 24);
    return s.length ? s : null;
  }
  return null;
}

/** [x,y,z] sonlu üçlü | null. */
export function cleanPos(v, def) {
  const a = Array.isArray(v) ? v : isObj(v) ? [v.x, v.y, v.z] : null;
  if (!a || a.length < 3) return def === undefined ? null : def;
  const x = toNum(a[0]);
  const y = toNum(a[1]);
  const z = toNum(a[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return def === undefined ? null : def;
  const c = LIMITS.coord;
  // macera derin dünya y ∈ [WORLD_Y_MIN, WORLD_Y_MAX]: derin mağara/şehir (Kasa y≈-100) konumu kayıtta -64'e kırpılıp kayada kalmasın
  return [round(num(x, -c, c, 0), 2), round(num(y, WORLD_Y_MIN, WORLD_Y_MAX + 8, 64), 2), round(num(z, -c, c, 0), 2)];
}

/* ------------------------------------------------------------------------------------------------
 * Varlıklar ve düşen eşyalar
 * ---------------------------------------------------------------------------------------------- */
function cleanFields(raw) {
  const out = {};
  const ks = Object.keys(raw);
  let n = 0;
  for (let i = 0; i < ks.length && n < 20; i++) {
    const k = ks[i];
    if (BANNED_KEYS[k] === 1 || POS_KEYS[k] === 1 || !KEY_RE.test(k) || k.charAt(0) === '_' || badKey(k)) continue;
    const v = raw[k];
    const t = typeof v;
    if (t === 'number') {
      if (!Number.isFinite(v)) continue;
      out[k] = round(v, 3);
    } else if (t === 'boolean') {
      out[k] = v;
    } else if (t === 'string') {
      out[k] = v.slice(0, 48);
    } else if (Array.isArray(v) && v.length <= 4 && v.every((e) => typeof e === 'number' && Number.isFinite(e))) {
      out[k] = v.map((e) => round(e, 2));
    } else {
      continue;
    }
    n++;
  }
  return out;
}

export function isDropEntity(raw) {
  // qa5: raw.type dizi/nesne ise anahtar dönüşümü iç içe toString çağırır (düşmanca yükte atardı) → yalnız metin türü aranır
  return isObj(raw) && ((typeof raw.type === 'string' && DROP_TYPES[raw.type] === 1) || (typeof raw.item === 'string' && typeof raw.type !== 'string'));
}

/** Varlık kaydı: {type,x,y,z,...ilkel alanlar} | null. */
export function cleanEntity(raw) {
  if (!isObj(raw) || typeof raw.type !== 'string' || raw.type.length === 0 || raw.type.length > 24) return null;
  const p = cleanPos([raw.x, raw.y, raw.z]);
  if (!p) return null;
  const out = Object.assign({ type: raw.type }, cleanFields(raw));
  out.type = raw.type;
  out.x = p[0];
  out.y = p[1];
  out.z = p[2];
  return out;
}

/** Düşen eşya: {item,count,dur?,x,y,z,age?} | null (eşya bilinmiyorsa atılır). */
export function cleanDrop(raw) {
  if (!isObj(raw)) return null;
  const it = safeItem(raw.item);
  const p = cleanPos([raw.x, raw.y, raw.z]);
  if (!it || !p) return null;
  const out = {
    item: it.key, count: Math.floor(num(raw.count === undefined ? 1 : raw.count, 1, it.stack, 1)), x: p[0], y: p[1], z: p[2],
  };
  if (it.durability) {
    out.dur = Math.floor(num(raw.dur, 1, it.durability, it.durability));
    const ench = sanitizeEnch(raw.ench, it.key);
    if (ench) out.ench = ench;
  }
  if (it.tech && it.tech.chargeMax > 0) out.charge = sanitizeCharge(raw.charge, it.key); // teknoloji şarjı
  if (Number.isFinite(raw.age)) out.age = round(num(raw.age, 0, 100000, 0), 1);
  return out;
}

/**
 * Varlık kaynağını (dizi | {serialize()} | {entities,drops,...}) {entities, drops} olarak temizler ve sınırlar.
 * Boss'lar önce, sonra oyuncuya yakınlık. center: [x,y,z] | null.
 */
export function collectEntities(src, center) {
  let raw = src;
  try {
    if (raw && typeof raw.serialize === 'function') raw = raw.serialize();
  } catch {
    raw = null;
  }
  let list = [];
  let dropsRaw = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (isObj(raw)) {
    ['entities', 'mobs'].forEach((k) => { if (Array.isArray(raw[k])) list = list.concat(raw[k]); });
    ['drops', 'items', 'droppedItems'].forEach((k) => { if (Array.isArray(raw[k])) dropsRaw = dropsRaw.concat(raw[k]); });
  }
  const ents = [];
  const drops = [];
  for (let i = 0; i < list.length && i < 5000; i++) {
    const r = list[i];
    if (isDropEntity(r)) {
      const d = cleanDrop(r);
      if (d) drops.push(d);
    } else {
      const e = cleanEntity(r);
      if (e) ents.push(e);
    }
  }
  for (let i = 0; i < dropsRaw.length && i < 5000; i++) {
    const d = cleanDrop(dropsRaw[i]);
    if (d) drops.push(d);
  }
  const cx = center ? center[0] : 0;
  const cy = center ? center[1] : 0;
  const cz = center ? center[2] : 0;
  const dist = (e) => (e.x - cx) * (e.x - cx) + (e.y - cy) * (e.y - cy) + (e.z - cz) * (e.z - cz);
  const boss = (e) => {
    const k = safeMobKey(e.type);
    return k && isBossKey(k) ? 0 : 1;
  };
  ents.sort((a, b) => boss(a) - boss(b) || dist(a) - dist(b));
  drops.sort((a, b) => dist(a) - dist(b));
  return { entities: ents.slice(0, LIMITS.entities), drops: drops.slice(0, LIMITS.drops) };
}

/* ------------------------------------------------------------------------------------------------
 * Sandıklar: {"x,y,z": [slot × ≤27]}; slot = 0 | [item,count] | [item,count,dur] | [item,count,dur,ench]
 * ---------------------------------------------------------------------------------------------- */
function slotIn(s) {
  if (!s) return null;
  if (Array.isArray(s)) return { item: s[0], count: s[1], dur: s[2], ench: s[3], charge: s[4] };
  if (isObj(s)) return s;
  return null;
}

function encodeSlot(s) {
  const o = slotIn(s);
  if (!o) return 0;
  const it = safeItem(o.item);
  if (!it) return 0;
  const count = Math.floor(num(o.count === undefined ? 1 : o.count, 1, it.stack, 1));
  if (it.tech && it.tech.chargeMax > 0) {
    // şarjlı eşya: [item,1,dur|0,ench|0,charge] (Inventory.toJSON ile aynı)
    const ench = it.durability ? sanitizeEnch(o.ench, it.key) : null;
    return [it.key, 1, it.durability ? Math.floor(num(o.dur, 1, it.durability, it.durability)) : 0, ench || 0, sanitizeCharge(o.charge, it.key)];
  }
  if (it.durability) {
    const base = [it.key, 1, Math.floor(num(o.dur, 1, it.durability, it.durability))];
    const ench = sanitizeEnch(o.ench, it.key);
    if (ench) base.push(ench);
    return base;
  }
  return [it.key, count];
}

function chestKey(k) {
  const p = String(k).split(',');
  if (p.length !== 3) return null;
  const x = Number(p[0]);
  const y = Number(p[1]);
  const z = Number(p[2]);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return null;
  if (y < WORLD_Y_MIN || y > WORLD_Y_MAX || Math.abs(x) > LIMITS.coord || Math.abs(z) > LIMITS.coord) return null;
  return x + ',' + y + ',' + z;
}

/** Sandık kaynağı (Map | düz nesne) → {"x,y,z": [slotlar]} (sondaki boş slotlar kırpılır; tamamen boş sandık [] kalır). */
export function encodeChests(src) {
  const out = {};
  const entries = [];
  if (src instanceof Map) src.forEach((v, k) => entries.push([k, v]));
  else if (isObj(src)) Object.keys(src).forEach((k) => entries.push([k, src[k]]));
  entries.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
  let n = 0;
  for (let i = 0; i < entries.length && n < LIMITS.chests; i++) {
    const key = chestKey(entries[i][0]);
    let slots = entries[i][1];
    if (slots && !Array.isArray(slots) && Array.isArray(slots.slots)) slots = slots.slots;
    if (key === null || !Array.isArray(slots)) continue;
    const enc = [];
    for (let s = 0; s < LIMITS.chestSlots; s++) enc.push(encodeSlot(slots[s]));
    while (enc.length && enc[enc.length - 1] === 0) enc.pop();
    out[key] = enc;
    n++;
  }
  return out;
}

/** Doğrulayarak okur: {"x,y,z": [27 × {item,count,dur?}|null]}. */
export function decodeChests(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  const ks = Object.keys(raw);
  let n = 0;
  for (let i = 0; i < ks.length && n < LIMITS.chests; i++) {
    const key = chestKey(ks[i]);
    const arr = raw[ks[i]];
    if (key === null || !Array.isArray(arr)) continue;
    const slots = [];
    for (let s = 0; s < LIMITS.chestSlots; s++) {
      const o = slotIn(arr[s]);
      const it = o ? safeItem(o.item) : null;
      if (!it) {
        slots.push(null);
        continue;
      }
      const count = it.durability ? 1 : Math.floor(num(o.count === undefined ? 1 : o.count, 1, it.stack, 1));
      const slot = { item: it.key, count };
      if (it.durability) {
        slot.dur = Math.floor(num(o.dur, 1, it.durability, it.durability));
        const ench = sanitizeEnch(o.ench, it.key);
        if (ench) slot.ench = ench;
      }
      if (it.tech && it.tech.chargeMax > 0) slot.charge = sanitizeCharge(o.charge, it.key);
      slots.push(slot);
    }
    out[key] = slots;
    n++;
  }
  return out;
}

/** Envanter JSON'unu yuvalar bilinen eşyalara indirgenerek temizler (Inventory.fromJSON'a güvenli girdi). */
export function cleanInventoryJson(raw) {
  const fix = (arr) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length && i < 256; i++) {
      const o = slotIn(arr[i]);
      out.push(o && safeItem(o.item) ? arr[i] : 0);
    }
    return out;
  };
  return {
    v: raw.v, size: raw.size, hotbar: raw.hotbar, selected: raw.selected, heat: raw.heat, slots: fix(raw.slots), armor: fix(raw.armor),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Bulmaca durumları: {id: {type, solved, state}}
 * ---------------------------------------------------------------------------------------------- */
export function cleanPuzzles(src) {
  const out = {};
  let raw = src;
  try {
    if (raw && typeof raw.serialize === 'function') raw = raw.serialize();
  } catch {
    raw = null;
  }
  if (!isObj(raw)) return out;
  const ks = Object.keys(raw).sort();
  let n = 0;
  for (let i = 0; i < ks.length && n < LIMITS.puzzles; i++) {
    const id = ks[i];
    const v = raw[id];
    if (id.length === 0 || id.length > 96 || badKey(id) || hasControl(id) || !isObj(v)) continue;
    const e = { type: typeof v.type === 'string' ? v.type.slice(0, 32) : '', solved: v.solved === true };
    if (v.state !== undefined) e.state = jsonSafe(v.state, 6);
    out[id] = e;
    n++;
  }
  return out;
}
