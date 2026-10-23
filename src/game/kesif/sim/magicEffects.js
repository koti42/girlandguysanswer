/*
 * KEŞİF sim — BÜYÜ: durum etkileri (iksir, büyü). Saf; liste düz dizidir ve kayda yazılabilir.
 *
 *   etki = {key, level, t (kalan sn), total (hud oranı için tam süre)}
 *   addEffect(list, key, level, seconds, source?) → {ok, reason?, effect?, refreshed?, event?}
 *       aynı etki varsa YENİLENİR: seviye = en büyük, süre = en uzun (üst üste binmez)
 *   tickEffects(list, dt) → [{type:'effectEnded', key, name}]
 *   removeEffect(list, key) → bool        clearEffects(list)        hasEffect(list, key) → seviye (0 yok)
 *   hudEffects(list) → [{key,name,icon,level,secondsLeft,fraction}]   (en uzun süre önce)
 *   serializeEffects(list) / restoreEffects(raw)   — bozuk girdiye dayanıklı, __proto__ reddi
 * Etkilerin sayısal karşılığı (hız çarpanı vb.) magicMods.js'te birleşir.
 */
import { EFFECT_LIMITS, effectDef } from './magicData.js';

function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}
function clampNum(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

export function findEffect(list, key) {
  for (let i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return null;
}
export function hasEffect(list, key) {
  const e = findEffect(list, key);
  return e ? e.level : 0;
}

/** Etki ekler / yeniler. source: 'iksir' | 'büyü' | ... (olayda taşınır). */
export function addEffect(list, key, level, seconds, source) {
  const def = effectDef(key);
  if (!def) return { ok: false, reason: 'bilinmiyor' };
  const secs = clampNum(seconds, 0, EFFECT_LIMITS.maxSeconds);
  if (!(secs > 0)) return { ok: false, reason: 'süre' };
  const lvl = clampInt(level, 1, EFFECT_LIMITS.maxLevel);
  let e = findEffect(list, key);
  let refreshed = false;
  if (e) {
    refreshed = true;
    e.level = Math.max(e.level, lvl);
    if (secs > e.t) {
      e.t = secs;
      e.total = secs;
    }
  } else {
    if (list.length >= EFFECT_LIMITS.maxActive) return { ok: false, reason: 'dolu' };
    e = { key, level: lvl, t: secs, total: secs };
    list.push(e);
  }
  return {
    ok: true,
    effect: e,
    refreshed,
    event: { type: 'effectAdded', key, name: def.name, level: e.level, seconds: Math.round(e.t), source: source || null, refreshed },
  };
}

export function tickEffects(list, dt) {
  const ended = [];
  if (!(dt > 0)) return ended;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    e.t -= dt;
    if (e.t <= 0) {
      const def = effectDef(e.key);
      ended.push({ type: 'effectEnded', key: e.key, name: def ? def.name : e.key });
      list.splice(i, 1);
    }
  }
  return ended;
}

export function removeEffect(list, key) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].key === key) {
      list.splice(i, 1);
      return true;
    }
  }
  return false;
}
export function clearEffects(list) {
  list.length = 0;
}

export function hudEffects(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const def = effectDef(e.key);
    if (!def) continue;
    out.push({
      key: e.key,
      name: def.name + (e.level > 1 ? ' ' + e.level : ''),
      icon: def.icon,
      level: e.level,
      secondsLeft: Math.max(0, Math.ceil(e.t)),
      fraction: e.total > 0 ? Math.max(0, Math.min(1, e.t / e.total)) : 0,
    });
  }
  out.sort((a, b) => b.secondsLeft - a.secondsLeft);
  return out;
}

export function serializeEffects(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    out.push([e.key, e.level, Math.round(e.t * 10) / 10, Math.round(e.total * 10) / 10]);
  }
  return out;
}

/** Kayıttan okur: [[key,level,t,total]] ya da [{key,level,t,total}]; geçersizler atılır. */
export function restoreEffects(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < raw.length && out.length < EFFECT_LIMITS.maxActive; i++) {
    const r = raw[i];
    let key;
    let level;
    let t;
    let total;
    if (Array.isArray(r)) {
      key = r[0]; level = r[1]; t = r[2]; total = r[3];
    } else if (r && typeof r === 'object') {
      key = Object.prototype.hasOwnProperty.call(r, 'key') ? r.key : undefined;
      level = r.level; t = r.t; total = r.total;
    } else {
      continue;
    }
    if (!effectDef(key) || findEffect(out, key)) continue;
    const secs = clampNum(t, 0, EFFECT_LIMITS.maxSeconds);
    if (!(secs > 0)) continue;
    const tot = Number.isFinite(Number(total)) && Number(total) >= secs ? clampNum(total, secs, EFFECT_LIMITS.maxSeconds) : secs;
    out.push({ key, level: clampInt(level, 1, EFFECT_LIMITS.maxLevel), t: secs, total: tot });
  }
  return out;
}
