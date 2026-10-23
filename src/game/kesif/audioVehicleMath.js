/*
 * KEŞİF ses — ARAÇ SESİ SAF MATEMATİĞİ (Neon Meridyen Faz 3, paket vehicle_audio). WebAudio/DOM yok, Math.random/Date.now yok; node'da test edilir.
 * audioVehicle.js bu eşlemeleri düğümlere uygular.
 *
 *   NODE_CAP_BY_TIER            {low:12, medium:18, high:24}  — ses KAYNAK düğümü (osilatör + tampon kaynağı) tavanı (sözleşme §17)
 *   tierPlan(cap)               tavan → {player:{sq,turbo,brown}, traffic, playerSources, oneShot, cap}   (oyuncu + trafik + tek atımlık ≤ cap)
 *   engineFreq(cls, rpm)        devir 0..1 → temel frekans (Hz); SIKI tekdüze artan (üstel yay)
 *   engineLoad(v)               araç durumu → motor yükü 0..1 (gaz + boyuna ivme)
 *   engineMix(cls, rpm, throttle, load, shiftT, out)   tını: {f, sawG, sqG, noiseG, lpHz, turboF, turboG, humG, humF, electric}
 *   skidMix / wetHiss / windMix / nitroLevel            lastik sürtünmesi, ıslak yol tıslaması, rüzgâr, nitro
 *   bumpMix / scrapeMix / hornSpec / ignitionSpec / doorSpec   tek atımlık sesler
 *   createIndicator()           otomatik sinyal/dörtlü: update(dt, steer, speed, hazard) → {on, side, tick}
 *   trafficGain / trafficFreq / dopplerRatio / pickNearest / panOf    trafik uzamsal sesi
 *
 * Aile dostu: korna yumuşak sinüs/üçgen çiftleri, çarpma = tok vuruş (şiddet yok), siren yok.
 */
export const NODE_CAP_BY_TIER = Object.freeze({ low: 12, medium: 18, high: 24 });

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Katman planı: oyuncu motoru + trafik sesleri + tek atımlıklar toplamı ≤ cap. Düşük tavanda özellikler sırayla kapanır. */
export function tierPlan(cap0) {
  const cap = Math.max(0, Math.floor(num(cap0, 12)));
  const sq = cap >= 16;
  const turbo = cap >= 22;
  const brown = cap >= 14;
  const playerSources = 2 + (sq ? 1 : 0) + (turbo ? 1 : 0) + (brown ? 1 : 0); // testere + beyaz gürültü (+ kare, turbo, kahverengi)
  const traffic = cap >= 22 ? 3 : cap >= 16 ? 2 : cap >= 10 ? 1 : 0;
  const oneShot = Math.max(0, cap - playerSources - traffic * 2);
  return {
    cap, player: { sq, turbo, brown }, playerSources, traffic, oneShot,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Motor
 * ---------------------------------------------------------------------------------------------- */
/** Sınıf başına frekans bandı (Hz) ve tını: rasp = kare dalga/yük duyarlılığı. ELECTRIC: hum (sinüs) motoru. */
const ENGINES = Object.freeze({
  taksi: Object.freeze({
    lo: 40, hi: 168, electric: false, rasp: 0.7, turbo: 0, noise: 0.05,
  }),
  spor: Object.freeze({
    lo: 48, hi: 218, electric: false, rasp: 1.0, turbo: 1, noise: 0.06,
  }),
  kamyonet: Object.freeze({
    lo: 31, hi: 118, electric: false, rasp: 0.9, turbo: 0, noise: 0.07,
  }),
  motor: Object.freeze({
    lo: 68, hi: 330, electric: false, rasp: 1.1, turbo: 0, noise: 0.05,
  }),
  hoverbike: Object.freeze({
    lo: 190, hi: 780, electric: true, rasp: 0.5, turbo: 1, noise: 0.05,
  }),
  suzulkay: Object.freeze({
    lo: 250, hi: 1000, electric: true, rasp: 0.4, turbo: 0, noise: 0.04,
  }),
});
const DEFAULT_ENGINE = ENGINES.taksi;

export function engineSpec(cls) {
  return Object.prototype.hasOwnProperty.call(ENGINES, cls) ? ENGINES[cls] : DEFAULT_ENGINE;
}
export function isElectric(cls) {
  return engineSpec(cls).electric;
}

/** Devir 0..1 → temel frekans. Üstel: lo·(hi/lo)^rpm — her sınıfta SIKI tekdüze artan. */
export function engineFreq(cls, rpm) {
  const s = engineSpec(cls);
  const r = clamp01(num(rpm, 0));
  return s.lo * Math.pow(s.hi / s.lo, r);
}

/** Motor yükü 0..1: gaz ve boyuna ivme (v.aLong, def.accel). */
export function engineLoad(v) {
  if (!v) return 0;
  const th = clamp01(num(v.throttle, 0));
  const acc = v.def && v.def.accel > 0 ? clamp01(num(v.aLong, 0) / v.def.accel) : 0;
  return clamp01(0.65 * th + 0.35 * acc);
}

/**
 * Motor tınısı. Yük arttıkça parlaklık (alçak geçiren kesimi) ve kare dalga/rasp artar. Vites boşalmasında (shiftT>0) ~%55 düşüş.
 * out: {f, sawG, sqG, noiseG, lpHz, turboF, turboG, humG, humF, electric}. Hepsi sonlu.
 */
export function engineMix(cls, rpm0, throttle0, load0, shiftT, out) {
  const o = out || {};
  const s = engineSpec(cls);
  const rpm = clamp01(num(rpm0, 0));
  const th = clamp01(num(throttle0, 0));
  const load = clamp01(num(load0, 0));
  const dip = num(shiftT, 0) > 0 ? 0.45 : 1;
  const f = engineFreq(cls, rpm);
  o.f = f;
  o.electric = s.electric;
  if (s.electric) {
    o.humF = f;
    o.humG = (0.07 + 0.07 * rpm + 0.05 * load) * dip;
    o.sawG = 0;
    o.sqG = (0.01 + 0.05 * load * rpm) * s.rasp;
    o.noiseG = s.noise * (0.2 + 0.8 * th) * (0.3 + 0.7 * rpm);
    o.lpHz = clamp(f * (4 + 7 * load), 400, 8000);
    o.turboF = f * 2.01;
    o.turboG = s.turbo ? (0.012 + 0.03 * load * rpm) * dip : 0;
    return o;
  }
  o.humF = f;
  o.humG = 0;
  o.sawG = (0.1 + 0.06 * load) * dip;
  o.sqG = (0.015 + 0.1 * load * (0.4 + 0.6 * rpm)) * s.rasp * dip;
  o.noiseG = s.noise * (0.15 + 0.85 * th) * (0.3 + 0.7 * rpm);
  o.lpHz = clamp(f * (2.2 + 7 * load), 220, 7000);
  o.turboF = f * 8;
  o.turboG = s.turbo ? 0.026 * th * rpm * rpm : 0;
  return o;
}

/** Lastik sürtünmesi (kayma): bantgeçiren gürültü. skid 0..1 (v.skid), hız m/s. */
export function skidMix(skid0, speed0, cls, out) {
  const o = out || {};
  const skid = clamp01(num(skid0, 0));
  const sp = Math.max(0, num(speed0, 0));
  const fast = clamp01(sp / 10);
  o.gain = Math.pow(skid, 1.2) * fast * 0.2;
  o.freq = (cls === 'kamyonet' ? 1500 : cls === 'motor' ? 2400 : 1900) + 650 * skid;
  o.q = 5 + 5 * skid;
  return o;
}

/** Islak yol tıslaması: yağmur/ıslak (0..1) ve hız → yüksek geçiren gürültü düzeyi. */
export function wetHiss(wet0, speed0, max0, out) {
  const o = out || {};
  const wet = clamp01(num(wet0, 0));
  const sp = Math.max(0, num(speed0, 0));
  const mx = Math.max(1, num(max0, 30));
  o.gain = wet * clamp01(sp / (0.5 * mx)) * 0.075;
  o.hpHz = 2800 + 1200 * clamp01(sp / mx);
  return o;
}

/** Rüzgâr: hızın karesiyle artar; hover araçlarda daha yüksek. */
export function windMix(speed0, max0, hover, out) {
  const o = out || {};
  const sp = Math.max(0, num(speed0, 0));
  const mx = Math.max(1, num(max0, 30));
  const s = clamp01(sp / mx);
  o.gain = (0.01 + 0.15 * s * s) * (hover ? 1.4 : 1);
  o.lpHz = 320 + 1900 * s;
  return o;
}

/** Nitro püskürmesi düzeyi (bandgeçiren gürültü süpürmesi). */
export function nitroLevel(on, speed0, max0) {
  if (!on) return 0;
  const s = clamp01(num(speed0, 0) / Math.max(1, num(max0, 30)));
  return 0.07 + 0.06 * s;
}

/* ------------------------------------------------------------------------------------------------
 * Tek atımlık sesler
 * ---------------------------------------------------------------------------------------------- */
/** Çarpma: tok vuruş (düşen sinüs) + kısa gürültü. impact m/s; soft = yumuşak (itilen hafif prop). */
export function bumpMix(impact0, soft) {
  const impact = clamp(num(impact0, 0), 0, 40);
  const k = clamp01(impact / 14);
  const sf = soft ? 0.45 : 1;
  return {
    thumpF0: 120 - 25 * k,
    thumpF1: 42,
    thumpG: (0.12 + 0.4 * k) * sf,
    noiseG: (0.05 + 0.22 * k) * sf,
    lpHz: soft ? 700 : 1100 + 900 * k,
    dur: 0.14 + 0.16 * k,
  };
}

/** Sürtünme (duvar/prop boyunca kayma): düşen bantlı gürültü. */
export function scrapeMix(impact0) {
  const impact = clamp(num(impact0, 0), 0, 30);
  const k = clamp01(impact / 10);
  return {
    gain: 0.05 + 0.13 * k, f0: 1500 + 500 * k, f1: 700, q: 2.2, dur: 0.22 + 0.2 * k,
  };
}

/** İniş (havadan) vuruşu. */
export function landMix(impact0) {
  const k = clamp01(num(impact0, 0) / 16);
  return {
    f0: 95 - 20 * k, f1: 38, gain: 0.1 + 0.34 * k, dur: 0.12 + 0.1 * k,
  };
}

/** Korna: 4 yumuşak çift ton (garaj `horn` 0..3). Sinüs/üçgen; tiz ya da sert değil. */
const HORNS = Object.freeze([
  Object.freeze({
    name: 'pıt-pıt', a: 466, b: 587, type: 'sine', dur: 0.12, gap: 0.08, count: 2, gain: 0.16,
  }),
  Object.freeze({
    name: 'puuu', a: 330, b: 415, type: 'triangle', dur: 0.34, gap: 0, count: 1, gain: 0.17,
  }),
  Object.freeze({
    name: 'ku-kuu', a: 392, b: 494, type: 'sine', dur: 0.16, gap: 0.05, count: 2, gain: 0.16, riseB: 1.26,
  }),
  Object.freeze({
    name: 'çın', a: 523, b: 392, type: 'sine', dur: 0.3, gap: 0, count: 1, gain: 0.15, bell: true,
  }),
]);
export function hornSpec(variant) {
  const i = Math.floor(num(variant, 0));
  return HORNS[i >= 0 && i < HORNS.length ? i : 0];
}
export const HORN_COUNT = HORNS.length;

/** Kapı: açma/kapama tok tık (alçak vuruş + kilit tıkı). */
export function doorSpec(open) {
  return open
    ? { f0: 150, f1: 70, g: 0.2, dur: 0.12, clickF: 1200, clickG: 0.05 }
    : { f0: 120, f1: 55, g: 0.26, dur: 0.14, clickF: 1700, clickG: 0.06 };
}

/** İstop/kontak: marş (testere süpürmesi) ya da elektrikli güç yükselmesi. */
export function ignitionSpec(cls) {
  const s = engineSpec(cls);
  if (s.electric) return { kind: 'power', f0: s.lo * 0.8, f1: s.lo * 2.4, dur: 0.55, gain: 0.07 };
  return { kind: 'crank', f0: s.lo * 0.9, f1: s.lo * 1.7, dur: 0.5, gain: 0.1 };
}

/* ------------------------------------------------------------------------------------------------
 * Sinyal / dörtlü ışık tıkı
 * ---------------------------------------------------------------------------------------------- */
export const INDICATOR_HZ = 1.4; // yanıp sönme (≤3 Hz; her geçişte tık = 2.8 tık/sn)

/**
 * Otomatik sinyal: yön ≥0,5 sn |steer|>0,4 (ve hız <14) tutulursa o yana sinyal; |steer|<0,1 olduktan 0,8 sn sonra söner.
 * hazard (v.hazardT>0) iken dörtlü. update → {on (ışık yanık evresi), side (−1 sol, 0, +1 sağ, 2 dörtlü), tick (bu adımda tık)}.
 */
export function createIndicator() {
  let side = 0;
  let hold = 0;
  let calm = 0;
  let phase = 0;
  let lastOn = false;
  const out = { on: false, side: 0, tick: false };
  return {
    update(dt0, steer0, speed0, hazard) {
      const dt = clamp(num(dt0, 0), 0, 0.25);
      const steer = num(steer0, 0);
      const speed = Math.abs(num(speed0, 0));
      if (Math.abs(steer) > 0.4 && speed < 14) {
        hold += dt;
        calm = 0;
        if (hold >= 0.5) side = steer > 0 ? 1 : -1;
      } else {
        hold = 0;
        if (Math.abs(steer) < 0.1) calm += dt;
        if (calm >= 0.8) side = 0;
      }
      const eff = hazard ? 2 : side;
      if (eff === 0) {
        phase = 0;
        lastOn = false;
        out.on = false;
        out.side = 0;
        out.tick = false;
        return out;
      }
      phase += dt * INDICATOR_HZ;
      phase -= Math.floor(phase);
      const on = phase < 0.5;
      out.tick = on !== lastOn;
      lastOn = on;
      out.on = on;
      out.side = eff;
      return out;
    },
    reset() {
      side = 0; hold = 0; calm = 0; phase = 0; lastOn = false; out.on = false; out.side = 0; out.tick = false;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Trafik (uzamsal)
 * ---------------------------------------------------------------------------------------------- */
export const TRAFFIC_MAX_DIST = 70;
const REF_DIST = 8;

/** Mesafeye göre trafik düzeyi 0..1: tekdüze azalan, ≥70 m'de 0. */
export function trafficGain(dist0) {
  const d = Math.max(0, num(dist0, TRAFFIC_MAX_DIST));
  if (d >= TRAFFIC_MAX_DIST) return 0;
  const fade = 1 - clamp01((d - TRAFFIC_MAX_DIST * 0.7) / (TRAFFIC_MAX_DIST * 0.3));
  return Math.pow(REF_DIST / (REF_DIST + d), 1.15) * fade * 1.9;
}

/** Trafik aracının motor frekansı: kimliğe bağlı taban + hız (SIKI artan). */
export function trafficFreq(id, speed0) {
  const base = 50 + (((id | 0) >>> 0) % 23);
  return base + 3.1 * Math.max(0, num(speed0, 0));
}

/** Doppler çarpanı: closing = dinleyiciye yaklaşma hızı (m/s, + yaklaşıyor). 0,88..1,14. */
export function dopplerRatio(closing0) {
  const c = clamp(num(closing0, 0), -60, 60);
  return clamp(343 / (343 - c), 0.88, 1.14);
}

/** Dinleyici yönüne göre sol-sağ (−1..1). basis: audioMix.listenerBasis çıktısı. */
export function panOf(basis, lx, lz, x, z) {
  if (!basis) return 0;
  const dx = x - lx;
  const dz = z - lz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.5) return 0;
  return clamp((dx * num(basis.rx, 1) + dz * num(basis.rz, 0)) / d, -1, 1) * Math.min(1, d / 6);
}

const SD = [];
const SI = [];
const KEEP = [];

/**
 * En yakın count aracı (≤ maxD) seçer. prevIds: önceki atama (kimlik dizisi); histerezis: önceki araç ilk count+1 içindeyse tutulur.
 * list[i] = {id, x, z}; out[k] = list indeksi; dönüş: seçilen sayısı. Tahsissiz (modül içi geçici diziler).
 */
export function pickNearest(list, n, count, lx, lz, maxD, prevIds, out) {
  const cap = count + 2;
  const lim = maxD * maxD;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const c = list[i];
    if (!c) continue;
    const dx = num(c.x, 1e9) - lx;
    const dz = num(c.z, 1e9) - lz;
    const d2 = dx * dx + dz * dz;
    if (!(d2 < lim)) continue;
    if (m === cap && d2 >= SD[m - 1]) continue;
    let p = m < cap ? m : cap - 1;
    while (p > 0 && SD[p - 1] > d2) {
      SD[p] = SD[p - 1];
      SI[p] = SI[p - 1];
      p--;
    }
    SD[p] = d2;
    SI[p] = i;
    if (m < cap) m++;
  }
  let k = 0;
  KEEP.length = 0;
  const top = m < count + 1 ? m : count + 1;
  if (prevIds) {
    for (let a = 0; a < prevIds.length && k < count; a++) {
      for (let b = 0; b < top; b++) {
        if (list[SI[b]].id === prevIds[a]) {
          KEEP.push(b);
          out[k++] = SI[b];
          break;
        }
      }
    }
  }
  for (let b = 0; b < m && k < count; b++) {
    if (KEEP.indexOf(b) < 0) out[k++] = SI[b];
  }
  return k;
}
