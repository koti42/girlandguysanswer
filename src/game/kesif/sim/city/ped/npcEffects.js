/*
 * KEŞİF sim/city/ped — NPC EFEKT YOLU (npc_vendors, Neon Meridyen Faz 4). SAF (DOM/three yok), es2020.
 *
 * Diyalog düğümleri, seçenekleri ve satıcı eylemleri TİPLİ EFEKTLER üretir; hepsi bu yoldan geçer. Yerleşik işleyicileri (give take kredi flag rel
 * vendor garage hint heal end) cityNpc sistemi kurar; görev/iş/yarış/taksi/foto/seyahat efektlerini discovery_missions ve photo_map `on(kind, fn)`
 * ile bağlar. İşleyici yoksa {ok:false, reason:'nohandler'} döner (diyalog takılmaz). İşleyici fırlatırsa yakalanır ({ok:false, reason:'hata'}).
 *
 *   EFFECT_KINDS · BUILTIN_KINDS · EXTERNAL_KINDS · FLAG_KEY_RE · RUN_MAX
 *   validateEffect(e) -> null | hata metni            (sözdizimi; eşya varlığı işleyicide denetlenir)
 *   createEffectBus() -> {on(kind, fn) -> off(), has(kind), run(effects, ctx) -> results[], runOne(e, ctx), stats}
 *     fn(effect, ctx) -> {ok:boolean, msg?:string, reason?:string} | void(=ok)
 */

export const BUILTIN_KINDS = Object.freeze(['give', 'take', 'kredi', 'flag', 'rel', 'vendor', 'garage', 'hint', 'heal', 'end']);
export const EXTERNAL_KINDS = Object.freeze(['mission', 'job', 'race', 'taxi', 'photo', 'travel']);
export const EFFECT_KINDS = Object.freeze(BUILTIN_KINDS.concat(EXTERNAL_KINDS));

export const FLAG_KEY_RE = /^[a-z0-9_]{1,24}$/;
export const ID_RE = /^[a-z0-9_]{1,40}$/;
export const ITEM_RE = /^(item|blok):[^\s]{1,40}$/;
export const RUN_MAX = 8;
export const KREDI_MAX = 999;
const JOB_BOARDS = Object.freeze(['kurye', 'taksi']);
const BAD_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

const isInt = (v) => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;

/** Efekt sözdizimi denetimi. Dönüş: null (geçerli) | Türkçe olmayan kısa hata kodu metni. */
export function validateEffect(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'efekt nesne değil';
  const k = e.k;
  if (typeof k !== 'string' || EFFECT_KINDS.indexOf(k) < 0) return 'bilinmeyen tür: ' + String(k).slice(0, 20);
  switch (k) {
    case 'give':
    case 'take':
      if (typeof e.item !== 'string' || !ITEM_RE.test(e.item)) return k + ': eşya anahtarı geçersiz';
      if (!isInt(e.n) || e.n < 1 || e.n > 64) return k + ': n 1..64 olmalı';
      return null;
    case 'kredi':
      if (!isInt(e.n) || e.n === 0 || e.n < -KREDI_MAX || e.n > KREDI_MAX) return 'kredi: n tamsayı, 0 değil, ±999';
      return null;
    case 'flag':
      if (typeof e.key !== 'string' || !FLAG_KEY_RE.test(e.key) || BAD_KEYS.indexOf(e.key) >= 0) return 'flag: anahtar geçersiz';
      if (!(e.v === true || e.v === false || (isInt(e.v) && e.v >= 0 && e.v <= 9999))) return 'flag: v 0..9999 ya da bool';
      return null;
    case 'rel':
      if (!isInt(e.d) || e.d < -2 || e.d > 2 || e.d === 0) return 'rel: d −2..2 (0 değil)';
      return null;
    case 'vendor':
      if (e.id !== undefined && (typeof e.id !== 'string' || !ID_RE.test(e.id))) return 'vendor: id geçersiz';
      return null;
    case 'garage':
    case 'end':
    case 'taxi':
      return null;
    case 'hint':
      if (typeof e.id !== 'string' || !ID_RE.test(e.id)) return 'hint: id geçersiz';
      return null;
    case 'heal':
      if (e.hp !== undefined && (!isInt(e.hp) || e.hp < 0 || e.hp > 20)) return 'heal: hp 0..20';
      if (e.food !== undefined && (!isInt(e.food) || e.food < 0 || e.food > 20)) return 'heal: food 0..20';
      if (!e.hp && !e.food) return 'heal: hp ya da food gerekli';
      return null;
    case 'mission':
    case 'photo':
      if (typeof e.id !== 'string' || !ID_RE.test(e.id)) return k + ': id geçersiz';
      return null;
    case 'job':
      if (JOB_BOARDS.indexOf(e.board) < 0) return 'job: board kurye|taksi';
      return null;
    case 'race':
      if (!isInt(e.id) || e.id < 0 || e.id > 7) return 'race: id 0..7';
      return null;
    case 'travel':
      if (!isInt(e.to) || e.to < 0 || e.to > 15) return 'travel: to 0..15';
      return null;
    default:
      return 'bilinmeyen tür';
  }
}

function normalise(r) {
  if (r === undefined || r === null) return { ok: true };
  if (typeof r === 'boolean') return { ok: r };
  if (typeof r !== 'object') return { ok: true };
  const out = { ok: r.ok !== false };
  if (typeof r.msg === 'string' && r.msg) out.msg = r.msg.slice(0, 120);
  if (typeof r.reason === 'string') out.reason = r.reason.slice(0, 24);
  return out;
}

export function createEffectBus() {
  const handlers = Object.create(null);
  const stats = { runs: 0, ok: 0, failed: 0, noHandler: 0, invalid: 0, errors: 0 };

  function on(kind, fn) {
    if (EFFECT_KINDS.indexOf(kind) < 0 || typeof fn !== 'function') return () => false;
    const list = handlers[kind] || (handlers[kind] = []);
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i < 0) return false;
      list.splice(i, 1);
      return true;
    };
  }

  function has(kind) {
    const l = handlers[kind];
    return !!l && l.length > 0;
  }

  function runOne(e, ctx) {
    stats.runs++;
    const bad = validateEffect(e);
    if (bad) {
      stats.invalid++;
      return { ok: false, reason: 'gecersiz', kind: e && typeof e.k === 'string' ? e.k : '' };
    }
    const list = handlers[e.k];
    if (!list || list.length === 0) {
      stats.noHandler++;
      return { ok: false, reason: 'nohandler', kind: e.k };
    }
    let r;
    try {
      r = normalise(list[list.length - 1](e, ctx));
    } catch {
      stats.errors++;
      return { ok: false, reason: 'hata', kind: e.k };
    }
    r.kind = e.k;
    if (r.ok) stats.ok++;
    else stats.failed++;
    return r;
  }

  function run(effects, ctx) {
    const out = [];
    if (!Array.isArray(effects)) return out;
    const n = Math.min(effects.length, RUN_MAX);
    for (let i = 0; i < n; i++) out.push(runOne(effects[i], ctx));
    return out;
  }

  return {
    on, has, run, runOne, stats,
  };
}
