/*
 * KEŞİF sim/city/mission — YARIŞ MADALYA SÜRELERİ. SAF, belirlenimci. Sözleşme §11: altın = 1,08 × betikli sürücü süresi, gümüş ×1,12, bronz ×1,25; altının %80'inden
 * hızlı süre reddedilir (hile). Betikli sürücü (vehicle/vehicleBot) süresi her (tohum, yarış, sınıf) için fizik koşusuyla bulunur; oyun içinde fizik koşulmaz,
 * bunun yerine AYNI hız planından (`planSpeeds`) ivme sınırlı bir ileri geçişle tahmin edilir ve sınıf başına ölçeklenir (CAL). CAL değerleri
 * `medals.test.js`te gerçek `botRace` koşularına karşı doğrulanır (tahmin ≥ gerçek süre: betikli sürücü HER ZAMAN altın alır; tahmin ≤ 1,06 × gerçek: altın beceri ister).
 *
 *   CAL                                   sınıf → {kA, kT}        tahmin sabitleri
 *   estimateBotTime(net, race, cls) → sn | null
 *   raceMedals(net, race, cls) → {bot, gold, silver, bronze, minValid} | null       (0,1 sn yuvarlama; önbellekli: net+race+cls)
 *   medalFor(time, medals) → 0 yok | 1 bronz | 2 gümüş | 3 altın                  time ≥ minValid olmalı; değilse -1 (geçersiz)
 *   isTimeValid(time, medals) → bool
 */
import { VEHICLE_DEFS, isVehicleClass } from '../vehicle/vehicleData.js';
import {
  BRONZE_K, GOLD_K, SILVER_K, planSpeeds, raceRoute,
} from '../vehicle/vehicleBot.js';

export const MIN_VALID_K = 0.8;

/** Sınıf başına tahmin sabitleri: kA ivme çarpanı, kT süre ölçeği (gerçek betikli sürücüye göre ayarlı). */
export const CAL = Object.freeze({
  taksi: { kA: 0.85, kT: 1.003 },
  spor: { kA: 0.65, kT: 1.01 },
  kamyonet: { kA: 0.65, kT: 1.0 },
  motor: { kA: 0.9, kT: 1.007 },
  hoverbike: { kA: 0.65, kT: 0.99 },
  suzulkay: { kA: 0.9, kT: 1.003 },
});

const CACHE = new WeakMap();

export function estimateBotTime(net, race, cls) {
  if (!isVehicleClass(cls)) return null;
  const rt = raceRoute(net, race, {});
  if (!rt) return null;
  const def = VEHICLE_DEFS[cls];
  const cal = CAL[cls];
  const plan = planSpeeds(rt.path, def, {});
  const n = rt.path.length;
  const vf = new Float64Array(n);
  vf[0] = 0.3;
  const aMax = def.accel * cal.kA;
  let t = 0;
  for (let i = 0; i < n - 1; i++) {
    const ds = plan.s[i + 1] - plan.s[i];
    const x = Math.min(0.999, vf[i] / def.max);
    const a = Math.max(0.05, aMax * (1 - Math.pow(x, 2.2)));
    const vNext = Math.min(plan.v[i + 1], Math.sqrt(vf[i] * vf[i] + 2 * a * ds));
    vf[i + 1] = Math.max(0.3, vNext);
    const avg = (vf[i] + vf[i + 1]) / 2;
    t += ds / Math.max(0.3, avg);
  }
  return t * cal.kT;
}

const r1 = (x) => Math.round(x * 10) / 10;

export function raceMedals(net, race, cls) {
  let m = CACHE.get(net);
  if (!m) {
    m = new Map();
    CACHE.set(net, m);
  }
  const key = race.id + ':' + cls + ':' + race.nodes.length;
  const hit = m.get(key);
  if (hit) return hit;
  const bot = estimateBotTime(net, race, cls);
  if (bot === null) return null;
  const gold = r1(bot * GOLD_K);
  const out = Object.freeze({
    bot: r1(bot), gold, silver: r1(bot * SILVER_K), bronze: r1(bot * BRONZE_K), minValid: r1(gold * MIN_VALID_K),
  });
  m.set(key, out);
  return out;
}

export function isTimeValid(time, medals) {
  return Number.isFinite(time) && !!medals && time >= medals.minValid;
}

export function medalFor(time, medals) {
  if (!isTimeValid(time, medals)) return -1;
  if (time <= medals.gold) return 3;
  if (time <= medals.silver) return 2;
  if (time <= medals.bronze) return 1;
  return 0;
}

/** Madalya eşiği → hedef süre (HUD'da "Altın için 1:23.4"). */
export function nextTarget(time, medals) {
  if (!medals) return null;
  if (time > medals.bronze) return { medal: 1, time: medals.bronze };
  if (time > medals.silver) return { medal: 2, time: medals.silver };
  if (time > medals.gold) return { medal: 3, time: medals.gold };
  return null;
}
