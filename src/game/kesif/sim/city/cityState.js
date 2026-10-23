/*
 * KEŞİF sim/city — ŞEHİR DURUMU (`dims.neon.city`; sözleşme §14). TEK serileştirilebilir nesne: Kredi, garaj/araç (vehicle_phys), NPC/dükkân (npc_vendors) ve görev/keşif
 * (discovery_missions) alanları aynı blobda yaşar. Bu modül blobun SIKI doğrulayıcısıdır; dimSanitize'a `registerDimSanitizer('neon','city', …)` ile bağlanır (bu dosya
 * içe aktarılınca kaydolur). Diğer paketlerin alanları KENDİ doğrulayıcılarıyla geçer (sanitizeVehicleSave, sanitizeNpcSave); yalnız blobda BULUNAN anahtarlar işlenir
 * (varsayılan eklenmez → gidiş-dönüş bayt-aynı kalır). Bilinmeyen anahtarlar (ileri uyum) küçük sınırlarla korunur.
 *
 * Alanlar (hepsi isteğe bağlı; eksik = varsayılan; yanlış tür = atılır):
 *   v:1 · kredi:int · garage/summoned/rental/vstats (araç) · flags/npcs/shop (NPC)
 *   discovery   {chips:hex60, graffiti:{id:[kalıp,renk]}, rooms:bit30, sets:bit, story:n, shops:[sahip]}                  (mission/discovery.js)
 *   runs        {raceId: {n:deneme, b:{sınıf:[süre(0,1 sn tamsayı), madalya]}}}
 *   jobs        {done:int, earned:int, log:[şehirSaniyesi≤8]}
 *   mission     null | {k:'job'|'race', id, c:sınıf|'', n:[x,z]|null, r:{s,g,l,p,t,h,c,a,b}}      etkin görev anlık görüntüsü (yükleyince devam eder)
 *   quests      {görevKimliği: 1|2}      ach  [başarım kimlikleri ≤ 64]      claims {firstjob|goldrace|chips60|easter: 1 bekliyor | 2 sunucu onayladı}
 *   stats       {STAT_KEYS…: tamsayı}
 *
 *   CITY_STATE_VERSION · STAT_KEYS · ensureCityState(city) → city (eksik görev alanlarını yerinde ekler) · sanitizeCityState(raw, warnings?) → temiz blob | null
 *   metricsOf(city, extra?) → düz ölçüt haritası (başarım/görev değerlendirmesi)       popcount(n)       statAdd(city, key, n) → yeni değer
 *   installCityStateSanitizer() / uninstallCityStateSanitizer()
 */
import {
  registerDimSanitizer, unregisterDimSanitizer, safeBlob, jsonBytes, isShadowKey,
} from '../dim/dimSanitize.js';
import { sanitizeVehicleSave, VEHICLE_SAVE_KEYS } from './vehicle/vehicleSave.js';
import { sanitizeFlags, sanitizeNpcs, sanitizeShop } from './ped/npcSave.js';
import { isVehicleClass } from './vehicle/vehicleData.js';
import {
  countChips, countGraffiti, countRooms, emptyDiscovery, sanitizeDiscovery,
} from './mission/discovery.js';
import { ACHIEVEMENT_BY_ID } from './mission/achievements.js';
import { QUEST_BY_ID } from './mission/quests.js';
import { COUNTS, JOB_LIMITS } from './mission/missionData.js';

export const CITY_STATE_VERSION = 1;

export const STAT_KEYS = Object.freeze([
  'citySeconds', 'cityM', 'driveM', 'nightFootM', 'nightDriveM', 'rainSeconds', 'dimHops', 'locksOpened', 'jobsDone', 'courierDone', 'taxiDone', 'podDone', 'fixDone', 'fastJobs',
  'racesDone', 'racesWon', 'goldMedals', 'photosTaken', 'robotsDissolved', 'talks', 'krediEarned', 'driftBoosts', 'vehiclesRented', 'paintJobs', 'easter', 'vault', 'bumps',
  'dmask', 'rmask', 'gmask', 'rfmask', 'mmask', 'tmask',
]);
const STAT_SET = Object.freeze(STAT_KEYS.reduce((m, k) => { m[k] = true; return m; }, Object.create(null)));
const CLAIM_KEYS = Object.freeze(['firstjob', 'goldrace', 'chips60', 'easter']);
const OWN_KEYS = Object.freeze(['v', 'kredi', 'flags', 'npcs', 'shop', 'discovery', 'runs', 'jobs', 'mission', 'quests', 'ach', 'claims', 'stats']);
const KNOWN = Object.freeze(OWN_KEYS.concat(VEHICLE_SAVE_KEYS));
const HAS = Object.prototype.hasOwnProperty;
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

function int(v, lo, hi, d) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN;
  if (!(n === n)) return d;
  return n < lo ? lo : n > hi ? hi : n;
}

export function popcount(n) {
  let v = n | 0;
  let c = 0;
  while (v) {
    c += v & 1;
    v >>>= 1;
  }
  return c;
}

/* ------------------------------------------------------------------------------------------------
 * Alan doğrulayıcıları
 * ---------------------------------------------------------------------------------------------- */
function cleanStats(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (let i = 0; i < STAT_KEYS.length; i++) {
    const k = STAT_KEYS[i];
    if (HAS.call(raw, k)) {
      const mask = k.slice(-4) === 'mask';
      const v = int(raw[k], 0, mask ? 0x3fffffff : 1000000000, 0);
      if (v > 0) out[k] = v;
    }
  }
  return out;
}

function cleanRuns(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (let r = 0; r < COUNTS.races; r++) {
    const e = HAS.call(raw, r) ? raw[r] : undefined;
    if (!isObj(e)) continue;
    const o = { n: int(e.n, 0, 100000, 0), b: {} };
    if (isObj(e.b)) {
      Object.keys(e.b).forEach((cls) => {
        const v = e.b[cls];
        if (!isVehicleClass(cls) || !Array.isArray(v) || v.length < 2) return;
        const t = int(v[0], 1, 360000, 0);
        if (t > 0) o.b[cls] = [t, int(v[1], 0, 3, 0)];
      });
    }
    out[r] = o;
  }
  return out;
}

function cleanJobs(raw) {
  const out = { done: 0, earned: 0, log: [] };
  if (!isObj(raw)) return out;
  out.done = int(raw.done, 0, 1000000, 0);
  out.earned = int(raw.earned, 0, 1000000000, 0);
  if (Array.isArray(raw.log)) {
    for (let i = 0; i < raw.log.length && out.log.length < JOB_LIMITS.logMax; i++) {
      const t = int(raw.log[i], 0, 1000000000, -1);
      if (t >= 0) out.log.push(t);
    }
  }
  return out;
}

const ID_RE = /^[a-z0-9_.]{1,40}$/;
function cleanMission(raw) {
  if (!isObj(raw)) return null;
  if (raw.k !== 'job' && raw.k !== 'race') return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  const r = isObj(raw.r) ? raw.r : {};
  const snap = {
    id: raw.id,
    s: int(r.s, 0, 63, 0),
    g: int(r.g, 0, 63, 0),
    l: int(r.l, 0, 9, 0),
    p: int(r.p, 0, 999, 0),
    t: Math.max(0, Math.min(86400, typeof r.t === 'number' && Number.isFinite(r.t) ? Math.round(r.t * 10) / 10 : 0)),
    h: Math.max(0, Math.min(3600, typeof r.h === 'number' && Number.isFinite(r.h) ? Math.round(r.h * 10) / 10 : 0)),
    c: int(r.c, 0, 99, 0),
    a: int(r.a, 1, 99, 1),
    b: int(r.b, 0, 999, 0),
  };
  const out = {
    k: raw.k, id: raw.id, c: typeof raw.c === 'string' && isVehicleClass(raw.c) ? raw.c : '', n: null, r: snap,
  };
  if (Array.isArray(raw.n) && raw.n.length >= 2 && Number.isFinite(raw.n[0]) && Number.isFinite(raw.n[1])) {
    out.n = [int(raw.n[0], -2000, 2000, 0), int(raw.n[1], -2000, 2000, 0)];
  }
  return out;
}

function cleanQuests(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  Object.keys(raw).forEach((k) => {
    if (QUEST_BY_ID[k] && (raw[k] === 1 || raw[k] === 2)) out[k] = raw[k];
  });
  return out;
}

function cleanAch(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  const seen = {};
  for (let i = 0; i < raw.length && out.length < 64; i++) {
    const id = raw[i];
    if (typeof id === 'string' && ACHIEVEMENT_BY_ID[id] && !seen[id]) {
      seen[id] = true;
      out.push(id);
    }
  }
  return out;
}

function cleanClaims(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (let i = 0; i < CLAIM_KEYS.length; i++) {
    const k = CLAIM_KEYS[i];
    if (HAS.call(raw, k)) {
      const v = int(raw[k], 0, 2, 0);
      if (v > 0) out[k] = v;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Blob doğrulayıcı
 * ---------------------------------------------------------------------------------------------- */
export function sanitizeCityState(raw, warnings) {
  if (!isObj(raw)) return null;
  const out = { v: CITY_STATE_VERSION };
  if (HAS.call(raw, 'kredi')) {
    const k = int(raw.kredi, 0, 1000000000, -1);
    if (k >= 0) out.kredi = k;
  }
  // araç alanları (yalnız blobda bulunan anahtarlar)
  if (VEHICLE_SAVE_KEYS.some((k) => HAS.call(raw, k))) {
    const vs = sanitizeVehicleSave(raw);
    VEHICLE_SAVE_KEYS.forEach((k) => {
      if (HAS.call(raw, k)) out[k] = vs[k];
    });
  }
  if (HAS.call(raw, 'flags')) out.flags = sanitizeFlags(raw.flags);
  if (HAS.call(raw, 'npcs')) out.npcs = sanitizeNpcs(raw.npcs);
  if (HAS.call(raw, 'shop')) out.shop = sanitizeShop(raw.shop);
  if (HAS.call(raw, 'discovery')) out.discovery = sanitizeDiscovery(raw.discovery);
  if (HAS.call(raw, 'runs')) out.runs = cleanRuns(raw.runs);
  if (HAS.call(raw, 'jobs')) out.jobs = cleanJobs(raw.jobs);
  if (HAS.call(raw, 'mission')) out.mission = cleanMission(raw.mission);
  if (HAS.call(raw, 'quests')) out.quests = cleanQuests(raw.quests);
  if (HAS.call(raw, 'ach')) out.ach = cleanAch(raw.ach);
  if (HAS.call(raw, 'claims')) out.claims = cleanClaims(raw.claims);
  if (HAS.call(raw, 'stats')) out.stats = cleanStats(raw.stats);
  // ileri uyum: bilinmeyen anahtarlar (küçük, güvenli)
  let extra = 0;
  const ks = Object.keys(raw);
  for (let i = 0; i < ks.length && extra < 12; i++) {
    const k = ks[i];
    if (KNOWN.indexOf(k) >= 0 || isShadowKey(k)) continue; // toString/hasOwnProperty… sahip anahtarı Number()/yöntem çağrılarını bozardı (qa5 fuzz bulgusu)
    if (!/^[A-Za-z0-9_]{1,24}$/.test(k)) continue;
    const b = safeBlob(raw[k], { depth: 3, keys: 24, arr: 24, str: 40, nodes: 200 });
    if (b === null || jsonBytes(b) > 2000) {
      if (warnings) warnings.push('neon.city.' + k);
      continue;
    }
    out[k] = b;
    extra++;
  }
  return out;
}

let installed = false;
export function installCityStateSanitizer() {
  registerDimSanitizer('neon', 'city', sanitizeCityState);
  installed = true;
}
export function uninstallCityStateSanitizer() {
  unregisterDimSanitizer('neon', 'city');
  installed = false;
}
export function isCityStateSanitizerInstalled() {
  return installed;
}
installCityStateSanitizer();

/* ------------------------------------------------------------------------------------------------
 * Canlı blob yardımcıları
 * ---------------------------------------------------------------------------------------------- */
/** Görev/keşif alanlarını (yoksa) yerinde ekler. */
export function ensureCityState(city) {
  const c = city;
  if (!isObj(c)) return c;
  if (!isObj(c.discovery)) c.discovery = emptyDiscovery();
  if (!isObj(c.runs)) c.runs = {};
  if (!isObj(c.jobs)) c.jobs = { done: 0, earned: 0, log: [] };
  if (!Array.isArray(c.jobs.log)) c.jobs.log = [];
  if (!isObj(c.quests)) c.quests = {};
  if (!Array.isArray(c.ach)) c.ach = [];
  if (!isObj(c.claims)) c.claims = {};
  if (!isObj(c.stats)) c.stats = {};
  if (c.mission === undefined) c.mission = null;
  return c;
}

export function statAdd(city, key, n) {
  if (!STAT_SET[key]) return 0;
  const s = ensureCityState(city).stats;
  const cur = typeof s[key] === 'number' && Number.isFinite(s[key]) ? s[key] : 0;
  const nv = Math.max(0, Math.min(1000000000, cur + (Number.isFinite(n) ? n : 0)));
  s[key] = nv;
  return nv;
}

export function statGet(city, key) {
  const v = city && isObj(city.stats) ? city.stats[key] : 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Bit maskesine bit ekler; yeni bit mi? */
export function statBit(city, key, bit) {
  if (!STAT_SET[key] || !Number.isInteger(bit) || bit < 0 || bit > 29) return false;
  const s = ensureCityState(city).stats;
  const cur = typeof s[key] === 'number' ? s[key] | 0 : 0;
  if ((cur >> bit) & 1) return false;
  s[key] = cur | (1 << bit);
  return true;
}

/**
 * Düz ölçüt haritası. extra: {terminalMask, setsDone, garageCount}. Değerler negatif olmayan sayılardır.
 */
export function metricsOf(city, extra) {
  const c = isObj(city) ? city : {};
  const st = isObj(c.stats) ? c.stats : {};
  const ds = isObj(c.discovery) ? c.discovery : emptyDiscovery();
  const e = extra || {};
  const g = (k) => (typeof st[k] === 'number' && Number.isFinite(st[k]) ? st[k] : 0);
  const out = {};
  for (let i = 0; i < STAT_KEYS.length; i++) out[STAT_KEYS[i]] = g(STAT_KEYS[i]);
  out.cityKm = out.cityM / 1000;
  out.chipsFound = countChips(ds);
  out.graffitiDone = countGraffiti(ds);
  out.roomsFound = countRooms(ds);
  out.ownersMet = Array.isArray(ds.shops) ? ds.shops.length : 0;
  out.terminalsFound = popcount(e.terminalMask !== undefined ? e.terminalMask : g('tmask'));
  out.districtKinds = popcount(g('dmask'));
  out.raceKinds = popcount(g('rmask'));
  out.goldKinds = popcount(g('gmask'));
  out.roofKinds = popcount(g('rfmask'));
  out.metroKinds = popcount(g('mmask'));
  out.setsDone = e.setsDone !== undefined ? e.setsDone : popcount(ds.sets | 0);
  out.garageCount = e.garageCount !== undefined ? e.garageCount : (c.garage && Array.isArray(c.garage.owned) ? c.garage.owned.length : 0);
  out.roofDone = out.roofKinds;
  out.achCount = Array.isArray(c.ach) ? c.ach.length : 0;
  return out;
}
