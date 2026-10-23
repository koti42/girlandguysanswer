/*
 * KEŞİF ses — NEON MERİDYEN TEMEL AMBİYANSI (sözleşme §13, §17). audio.js kalıbında prosedürel WebAudio; yeni ses motoru YOK:
 * audioRecipesDim.js'teki dört yatak tarifi (`city:traffic`, `city:drone`, `city:rain_metal`, `city:neon_buzz`; her biri ≤4,8 sn, düz plato,
 * 0,8 sn çapraz geçiş) audio.play üzerinden periyodik yeniden başlatılarak kesintisiz katman oluşturur. Siren, silah, bağırış YOK.
 *
 *   layerLevels(st, out?)        SAF: durum {night, rain, wet?, shelter} → katman düzeyleri {traffic, drone, rain, buzz} 0..1
 *   ambienceBudget(nodeCap)      ses düğümü tavanı (24/18/12) → ambiyansa ayrılan tahmini düğüm payı (≈%70)
 *   planLayers(levels, budget)   SAF: bütçeye sığan katman anahtarları (yağmurda yağmur önce, sonra trafik, drone, vızıltı)
 *   createCityAmbience({play, rand?, nodeCap?}) → {update(dt, st), setNodeCap(n), setEnabled(b), stop(), getStats(), dispose()}
 *       play(name, {vol, pitch}) → {stop()}|null (G.sound / audio.play). st: {night 0..1, rain 0..1, shelter 0..1 (içeride 1), underwater}
 *
 * Katmanlar tasarımı: trafik gündüz yoğun / gece seyrek, yağmurda lastik tıslaması; drone gece belirgin; yağmur şiddetiyle metal üstü yağmur
 * (içerideyken boğuk); neon vızıltısı geceyle artar. Yeniden başlatma aralığı 3,9 sn (bitiş 4,8 − çapraz geçiş 0,8 ≈ 4,0; ±jitter ≥ örtüşme).
 */
import { BED_NODES, BED_DURATION, BED_CROSSFADE } from './audioRecipesDim.js';

export const CITY_AMBIENCE_PERIOD = 3.9;
/** Çapraz geçişte aynı katmandan eşzamanlı 1+ ses: düğüm tahmininde çarpan. */
export const OVERLAP_FACTOR = 1.2;

export const LAYER_DEFS = Object.freeze({
  traffic: Object.freeze({ key: 'traffic', sound: 'city:traffic', nodes: BED_NODES['city:traffic'], vol: 1.0 }),
  drone: Object.freeze({ key: 'drone', sound: 'city:drone', nodes: BED_NODES['city:drone'], vol: 1.0 }),
  rain: Object.freeze({ key: 'rain', sound: 'city:rain_metal', nodes: BED_NODES['city:rain_metal'], vol: 1.0 }),
  buzz: Object.freeze({ key: 'buzz', sound: 'city:neon_buzz', nodes: BED_NODES['city:neon_buzz'], vol: 1.0 }),
});
export const LAYER_KEYS = Object.freeze(['traffic', 'drone', 'rain', 'buzz']);
/** Bu düzeyin altındaki katman başlatılmaz. */
export const MIN_LEVEL = 0.03;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function num(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** Durum → katman düzeyleri (0..1). Hepsi sonlu; içeride (shelter) trafik/yağmur boğuklaşır. */
export function layerLevels(st, out) {
  const o = out || {};
  const s = st || {};
  const night = clamp01(num(s.night, 0));
  const rain = clamp01(num(s.rain, 0));
  const shelter = clamp01(num(s.shelter, 0));
  const open = 1 - 0.7 * shelter;
  o.traffic = clamp01((0.34 + 0.42 * (1 - night) + 0.12 * rain) * open);
  o.drone = clamp01((0.2 + 0.42 * night) * (1 - 0.35 * shelter));
  o.rain = clamp01(rain * (1 - 0.6 * shelter));
  o.buzz = clamp01((0.05 + 0.55 * night) * (1 - 0.25 * rain) * (1 - 0.4 * shelter));
  return o;
}

/** Ses düğümü tavanı (24/18/12) → ambiyansa ayrılan tahmini düğüm payı (≈%70). */
export function ambienceBudget(nodeCap) {
  const c = num(nodeCap, 24);
  return Math.max(0, Math.floor(c * 0.7));
}

/**
 * Düzeylere ve bütçeye göre çalacak katmanlar. Öncelik: yağmur yağıyorsa [rain, traffic, drone, buzz], değilse [traffic, drone, buzz, rain];
 * MIN_LEVEL altındakiler atlanır; eklenen katmanın düğümü × OVERLAP_FACTOR bütçeyi aşıyorsa o katman atlanır (sonrakiler denenir).
 */
export function planLayers(levels, budget0) {
  const lv = levels || {};
  const budget = num(budget0, 0);
  const raining = num(lv.rain, 0) > 0.08;
  const order = raining ? ['rain', 'traffic', 'drone', 'buzz'] : ['traffic', 'drone', 'buzz', 'rain'];
  const out = [];
  let used = 0;
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    if (!(num(lv[k], 0) >= MIN_LEVEL)) continue;
    const cost = LAYER_DEFS[k].nodes * OVERLAP_FACTOR;
    if (used + cost > budget) continue;
    used += cost;
    out.push(k);
  }
  return out;
}

/**
 * @param {{play:Function, rand?:()=>number, nodeCap?:number}} opts  play: (name, {vol, pitch}) → {stop()}|null
 */
export function createCityAmbience(opts) {
  const o = opts || {};
  const play = typeof o.play === 'function' ? o.play : () => null;
  const rand = typeof o.rand === 'function' ? o.rand : () => 0.5;
  let nodeCap = num(o.nodeCap, 24);
  let enabled = true;
  let disposed = false;
  const lv = { traffic: 0, drone: 0, rain: 0, buzz: 0 };
  const timer = { traffic: 0, drone: 0, rain: 0, buzz: 0 };
  const handle = { traffic: null, drone: null, rain: null, buzz: null };
  let active = [];
  const stats = { started: 0, failed: 0, nodes: 0, layers: 0 };

  function stopAll() {
    LAYER_KEYS.forEach((k) => {
      const h = handle[k];
      handle[k] = null;
      if (h && typeof h.stop === 'function') {
        try {
          h.stop();
        } catch {
          /* yut */
        }
      }
      timer[k] = 0;
    });
    active = [];
    stats.nodes = 0;
    stats.layers = 0;
  }

  return {
    /** st: {night, rain, shelter, underwater}. Duraklatılmışken (dt = 0) zamanlayıcılar ilerlemez. */
    update(dt, st) {
      if (disposed) return;
      const step = dt > 0 ? Math.min(dt, 0.25) : 0;
      const s = st || {};
      if (!enabled || s.underwater) {
        if (active.length > 0) stopAll();
        return;
      }
      layerLevels(s, lv);
      active = planLayers(lv, ambienceBudget(nodeCap));
      let nodes = 0;
      for (let i = 0; i < LAYER_KEYS.length; i++) {
        const k = LAYER_KEYS[i];
        if (active.indexOf(k) < 0) {
          timer[k] = 0;
          continue;
        }
        nodes += LAYER_DEFS[k].nodes * OVERLAP_FACTOR;
        timer[k] -= step;
        if (timer[k] > 0) continue;
        const h = play(LAYER_DEFS[k].sound, { vol: lv[k] * LAYER_DEFS[k].vol, pitch: 1 + (rand() - 0.5) * 0.04 });
        if (h) {
          handle[k] = h;
          stats.started++;
          timer[k] = CITY_AMBIENCE_PERIOD * (0.97 + 0.03 * rand());
        } else {
          stats.failed++;
          timer[k] = 1.0;
        }
      }
      stats.nodes = nodes;
      stats.layers = active.length;
    },

    /** Düğüm tavanını değiştirir (24/18/12). */
    setNodeCap(n) {
      nodeCap = num(n, nodeCap);
    },

    setEnabled(b) {
      enabled = !!b;
      if (!enabled) stopAll();
    },

    /** Çalan yatakları söndürür (boyut değişimi / sessiz / yıkım). */
    stop() {
      stopAll();
    },

    getStats() {
      return { started: stats.started, failed: stats.failed, nodes: stats.nodes, layers: stats.layers, active: active.slice() };
    },

    get active() {
      return active;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stopAll();
    },
  };
}

export { BED_DURATION, BED_CROSSFADE };
