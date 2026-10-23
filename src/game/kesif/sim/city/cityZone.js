/*
 * KEŞİF sim/city — KORUMA KURALLARI ve BÖLGE SORGUSU (O(1)). Sözleşme §1.6, §7 `isNaturalFill/isNoBuild/cityZoneAt`.
 *
 *  cityRulesFor(seed) → {isNaturalFill(x,y,z), isNoBuild(x,y,z), zoneAt(x,y,z)}   tohuma bağlı, önbellekli (dimRules / genRegistry.getCityRules çağırır)
 *  isNaturalFill(x,y,z,seed?) · isNoBuild(x,y,z,seed?) · cityZoneAt(x,y,z,seed?)   genRegistry yedek yolu: (x,y,z,seed) sırası; seed verilmezse son üretim tohumu
 *  noteSeed(seed)   üretici son tohumu hatırlar (yalnız seedsiz çağrılar için)
 *
 * Kural özeti (planlar cityPlan.js'te): kırma serbest ⇔ oyuncu koydu VEYA doğal dolgu (y ≤ 60 ∧ mühendislik hacmi dışı);
 * yerleştirme yasak ⇔ yol koridoru y64..68, tünel/köprü, bina iç hacmi (zemin→çatı+1), kapı önü 3×2, tepe terası gövdesi, Kapı Meydanı.
 * Yazıcı tutarlılığı: y ≤ 60'taki taş dışı her blok engineeredAt hacmi içindedir (test: cityRules.test.js).
 */
import {
  getCityPlan, planIsNaturalFill, planIsNoBuild, planZoneAt,
} from './cityPlan.js';

let lastSeed = 0;
const RULES = new Map();

export function noteSeed(seed) {
  lastSeed = seed | 0;
}

function make(seed) {
  const plan = getCityPlan(seed);
  return Object.freeze({
    isNaturalFill: (x, y, z) => planIsNaturalFill(plan, Math.floor(x), Math.floor(y), Math.floor(z)),
    isNoBuild: (x, y, z) => planIsNoBuild(plan, Math.floor(x), Math.floor(y), Math.floor(z)),
    zoneAt: (x, y, z) => planZoneAt(plan, Math.floor(x), Math.floor(y), Math.floor(z)),
  });
}

export function cityRulesFor(seed) {
  const key = seed >>> 0;
  let r = RULES.get(key);
  if (!r) {
    if (RULES.size >= 6) RULES.delete(RULES.keys().next().value);
    r = make(seed);
    RULES.set(key, r);
  }
  return r;
}

export function isNaturalFill(x, y, z, seed) {
  return cityRulesFor(seed === undefined ? lastSeed : seed).isNaturalFill(x, y, z);
}

export function isNoBuild(x, y, z, seed) {
  return cityRulesFor(seed === undefined ? lastSeed : seed).isNoBuild(x, y, z);
}

export function cityZoneAt(x, y, z, seed) {
  return cityRulesFor(seed === undefined ? lastSeed : seed).zoneAt(x, y, z);
}
