/*
 * KEŞİF sim/city — ŞEHİR OLAYLARI VE SUNUCU TALEP ANAHTARLARI. SAF, es2020. Sözleşme §16: jeton YALNIZ dört tek-seferlik `neon:*` talebiyle gelir
 * (firstjob 20 · goldrace 40 · chips60 60 · easter 30; sunucu tutarı, süre/günlük/ömür sınırlarını KENDİSİ uygular — istemciye güvenilmez). Burada yalnız
 * İSTEMCİ OLAYLARI üretilir; Kredi (şehir-yerel) hiçbir zaman jetona çevrilmez.
 *
 *   NEON_CLAIMS               ['neon:firstjob','neon:goldrace','neon:chips60','neon:easter']  (anahtar regex'i: ^[a-z]+:[a-z0-9]+$, alt çizgi yok)
 *   NEON_AMOUNTS              {kısa ad: jeton} — YALNIZ gösterim ipucu (config/game_kesif.php rewards.neon ile birebir; test çapraz denetler)
 *   claimKey(short) / shortKey(key) / isNeonKey(key)
 *   evaluateClaims(city, view) → [yeni kazanılan kısa adlar]     claims[k] = 1 (bekliyor); zaten 1/2 ise dokunmaz
 *   pendingClaims(city) → ['neon:…'] (1 olanlar)                 markClaimed(city, key) → bool (1/yok → 2; yalnız neon:* anahtarları)
 *   reduceEvent(city, evt, env) → {changed, notes[]}              motor olayı → istatistik/keşif güncellemesi (cityMissions/cityDiscovery sistemleri çağırır)
 *      env {ownerIds:Set|fn, now}   notes: [{type:'owner', id}]
 */
import { ensureCityState, statAdd, statBit } from './cityState.js';

export const NEON_CLAIMS = Object.freeze(['neon:firstjob', 'neon:goldrace', 'neon:chips60', 'neon:easter']);
export const NEON_AMOUNTS = Object.freeze({
  firstjob: 20, goldrace: 40, chips60: 60, easter: 30,
});
const SHORT = Object.freeze(['firstjob', 'goldrace', 'chips60', 'easter']);
export const KEY_RE = /^[a-z]+:[a-z0-9]+$/;

export function claimKey(short) {
  return SHORT.indexOf(short) >= 0 ? 'neon:' + short : null;
}

export function shortKey(key) {
  return typeof key === 'string' && key.indexOf('neon:') === 0 && SHORT.indexOf(key.slice(5)) >= 0 ? key.slice(5) : null;
}

export function isNeonKey(key) {
  return shortKey(key) !== null;
}

const RULES = Object.freeze({
  firstjob: (v) => v.jobsDone >= 1,
  goldrace: (v) => v.goldMedals >= 1,
  chips60: (v) => v.chipsFound >= 60,
  easter: (v) => v.easter >= 1,
});

export function evaluateClaims(city, view) {
  const c = ensureCityState(city);
  const fresh = [];
  for (let i = 0; i < SHORT.length; i++) {
    const k = SHORT[i];
    if (c.claims[k] === 1 || c.claims[k] === 2) continue;
    if (RULES[k](view)) {
      c.claims[k] = 1;
      fresh.push(k);
    }
  }
  return fresh;
}

export function pendingClaims(city) {
  const out = [];
  const cl = city && city.claims && typeof city.claims === 'object' ? city.claims : {};
  for (let i = 0; i < SHORT.length; i++) if (cl[SHORT[i]] === 1) out.push('neon:' + SHORT[i]);
  return out;
}

export function markClaimed(city, key) {
  const k = shortKey(key);
  if (!k) return false;
  const c = ensureCityState(city);
  if (c.claims[k] === 2) return false;
  c.claims[k] = 2;
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Olay indirgeyici
 * ---------------------------------------------------------------------------------------------- */
const NOTES = [];

/**
 * Motor olayını şehir durumuna işler. Yalnız sayaç/keşif defterini günceller; ödül/görev kararı sistemlerdedir.
 * Bilinmeyen olay: değişiklik yok.
 */
export function reduceEvent(city, evt, env) {
  NOTES.length = 0;
  const out = { changed: false, notes: NOTES };
  if (!evt || typeof evt !== 'object' || typeof evt.type !== 'string') return out;
  const c = ensureCityState(city);
  switch (evt.type) {
    case 'dimensionEntered':
      if (evt.dim === 'neon') {
        statAdd(c, 'dimHops', 1);
        out.changed = true;
      }
      break;
    case 'terminalFound':
      if (Number.isInteger(evt.index) && evt.index >= 0 && evt.index < 16) out.changed = statBit(c, 'tmask', evt.index);
      break;
    case 'lockOpened':
      statAdd(c, 'locksOpened', 1);
      out.changed = true;
      break;
    case 'robotDissolved':
      statAdd(c, 'robotsDissolved', 1);
      out.changed = true;
      break;
    case 'photo':
    case 'photoTaken':
    case 'photoCaptured':
      statAdd(c, 'photosTaken', 1);
      out.changed = true;
      break;
    case 'npcTalk': {
      statAdd(c, 'talks', 1);
      out.changed = true;
      const id = typeof evt.npc === 'string' ? evt.npc : '';
      const owners = env && env.ownerIds;
      const isOwner = !!id && owners && (typeof owners === 'function' ? owners(id) : owners.has(id));
      if (isOwner && /^[a-z0-9_]{1,24}$/.test(id)) {
        const shops = c.discovery.shops;
        if (Array.isArray(shops) && shops.indexOf(id) < 0 && shops.length < 24) {
          shops.push(id);
          NOTES.push({ type: 'owner', id });
        }
      }
      break;
    }
    case 'bump':
      statAdd(c, 'bumps', 1);
      out.changed = true;
      break;
    case 'driftBoost':
      statAdd(c, 'driftBoosts', 1);
      out.changed = true;
      break;
    case 'vehicleRent':
      statAdd(c, 'vehiclesRented', 1);
      out.changed = true;
      break;
    case 'kredi':
      if (typeof evt.delta === 'number' && evt.delta > 0 && Number.isFinite(evt.delta)) {
        statAdd(c, 'krediEarned', Math.floor(evt.delta));
        out.changed = true;
      }
      break;
    case 'garagePaint':
      statAdd(c, 'paintJobs', 1);
      out.changed = true;
      break;
    case 'diyarIsigi':
      if (!c.stats.easter) {
        statAdd(c, 'easter', 1);
        out.changed = true;
      }
      break;
    default:
      break;
  }
  return out;
}
