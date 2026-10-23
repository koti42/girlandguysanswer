/*
 * KEŞİF sim — ilk gece adaleti (saf; Math.random/Date.now yok, three/DOM yok).
 *
 * Yeni oyuncu (0. bölge, demir alet yok, ilk geceler, başlangıç noktasına yakın) ilk gecesinde bir yığın Gölge tarafından
 * 20 sn'de öldürülmesin; ama gerilim kalsın: meşale/ışık kaçışı, kovalamaca ve doğma hâlâ var, yalnızca ölçek küçük.
 *
 *   earlyGrace({zone, day, ironGear, dist}) → 0..1      (1 = tam koruma, 0 = koruma yok / normal oyun)
 *   earlyTuning(grace, nightT, base)       → {hostileCap, caveCap, hostileEvery, hostileMin, hostileMax, groupMax, hunt, dmgMul, aggroMul, grace}
 *   hasIronGear(inventory)                 → bool (demir/elmas/kuantum alet-silah-zırh)
 *
 * Gece ilerledikçe (nightT sn) üst sınır 1'den başlayıp adım adım yükselir ve hasar çarpanı artar ("ramp-up"): gece başında
 * ayakta duran silahsız oyuncuya ilk Gölge'nin ulaşması ve yaralaması uzun sürer. Koruma gün ve ilerleme ile söner; sonraki
 * bölgelerde ve demir sonrası oyun tam zorlukta kalır. Kolaylaştırma (assist/easy) bununla çarpılır, onun yerine geçmez.
 */
import { ITEMS } from './items.js';

export const EARLY = Object.freeze({
  /** Oyun günü (0 = ilk gün/gece) → koruma. Gün ≥ dizi uzunluğu → 0. */
  dayGrace: Object.freeze([1, 0.7, 0.4, 0.15]),
  /** Başlangıç noktasına uzaklık: ≤ distFull tam, distFar'da distFloor'a iner (0. bölge dışında zaten 0). */
  distFull: 40,
  distFar: 100,
  distFloor: 0.4,
  /** g=1'de: yakındaki düşman tavanı, doğma aralığı (sn), en yakın doğma mesafesi, mağara tavanı, sürü üst sınırı. */
  capFirst: 6,
  everyMax: 6,
  minDist: 26,
  maxDist: 38, // doğma halkası daralır: uzakta doğup hiç gelmeyen yaratıklar gerilimi öldürmesin
  huntGrace: 0.5, // bu korumanın üstünde yeni doğan düşman oyuncuyu izlemeye başlar (sinsi yaklaşma)
  caveCapMin: 3,
  /** Tavan, gecenin her capStepSecs*g saniyesinde 1 artar (1'den başlar). */
  capStepSecs: 12,
  /** Hasar çarpanı g=1'de gece başı → rampSecs sonra. */
  dmgFirst: 0.15,
  dmgLater: 0.5,
  rampSecs: 150,
  /** Kovalama menzili çarpanı (g=1'de): doğma uzaklaştığı için yaratıklar oyuncuyu yine bulsun. */
  aggro: 1.3,
});

const IRON_RE = /^(demir|elmas|kuantum)$/;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function slotHasIron(s) {
  if (!s || typeof s.item !== 'string') return false;
  const it = ITEMS[s.item];
  if (!it) return false;
  if (it.tool && it.tool.tier >= 4) return true;
  return !!(it.armor && IRON_RE.test(String(it.armor.set)));
}

/** Envanterde (hotbar + sırt çantası + zırh yuvaları) demir ve üstü alet/silah/zırh var mı? */
export function hasIronGear(inv) {
  if (!inv) return false;
  const lists = [inv.slots, inv.armor];
  for (let k = 0; k < lists.length; k++) {
    const l = lists[k];
    if (!l) continue;
    for (let i = 0; i < l.length; i++) if (slotHasIron(l[i])) return true;
  }
  return false;
}

/** o: {zone, day, ironGear, dist} → 0..1. dist verilmezse uzaklık etkisi yok. */
export function earlyGrace(o) {
  if (!o || o.zone !== 0 || o.ironGear) return 0;
  const day = Number.isFinite(o.day) ? Math.max(0, Math.floor(o.day)) : 0;
  const dg = day < EARLY.dayGrace.length ? EARLY.dayGrace[day] : 0;
  if (dg <= 0) return 0;
  let df = 1;
  if (Number.isFinite(o.dist) && o.dist > EARLY.distFull) {
    const t = clamp01((o.dist - EARLY.distFull) / (EARLY.distFar - EARLY.distFull));
    df = 1 - (1 - EARLY.distFloor) * t;
  }
  return dg * df;
}

/** Koruma yokken (g ≤ 0) taban değerler aynen döner. base: spawner SPAWN tablosu. */
export function earlyTuning(grace, nightT, base) {
  const g = clamp01(Number.isFinite(grace) ? grace : 0);
  if (g <= 0) {
    return {
      grace: 0,
      hostileCap: base.hostileCap,
      caveCap: base.caveCap,
      hostileEvery: base.hostileEvery,
      hostileMin: base.hostileMin,
      hostileMax: base.hostileMax,
      groupMax: 99,
      hunt: false,
      dmgMul: 1,
      aggroMul: 1,
    };
  }
  const nt = nightT > 0 ? nightT : 0; // Infinity = tırmanma tamamlandı (gündüz); NaN/negatif → 0
  let cap = Math.round(base.hostileCap - (base.hostileCap - EARLY.capFirst) * g);
  const step = Math.max(0.5, EARLY.capStepSecs * g);
  cap = Math.min(cap, 1 + Math.floor(nt / step));
  const ramp = clamp01(nt / EARLY.rampSecs);
  const dmgG = EARLY.dmgFirst + (EARLY.dmgLater - EARLY.dmgFirst) * ramp;
  return {
    grace: g,
    hostileCap: Math.max(1, cap),
    caveCap: Math.max(EARLY.caveCapMin, Math.round(base.caveCap - (base.caveCap - EARLY.caveCapMin) * g)),
    hostileEvery: base.hostileEvery + (EARLY.everyMax - base.hostileEvery) * g,
    hostileMin: base.hostileMin + (EARLY.minDist - base.hostileMin) * g,
    hostileMax: base.hostileMax + (EARLY.maxDist - base.hostileMax) * g,
    hunt: g >= EARLY.huntGrace,
    groupMax: Math.max(1, Math.round(3 - 2 * g)),
    dmgMul: 1 - g * (1 - dmgG),
    aggroMul: 1 + (EARLY.aggro - 1) * g,
  };
}
