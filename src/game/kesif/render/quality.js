/*
 * KEŞİF render — kalite kademeleri ve uyarlamalı kalite.
 *
 *   QUALITY                      {low, medium, high} → kalite tablosu (görüş mesafesi, dpr, post-fx, atlas, parçacık, bulut…)
 *   CITY_QUALITY / cityQualityFor(tier)   Neon Meridyen kademe ayarları (sözleşme §17: görüş 9/7/5, ses düğümü 24/18/12, siluet, holo reklam,
 *                                şehir hava parçacıkları, ıslak yol/pencere kalitesi). QUALITY tablosuna dokunmaz.
 *   pickInitialTier(hints)       cihaz ipuçlarından başlangıç kademesi (saf)
 *   collectDeviceHints(extra?)   tarayıcıdan ipuçlarını güvenle okur
 *   loadQualityPref/saveQualityPref   elle seçimin kalıcılığı (localStorage, hata yutulur)
 *   createKesifQuality({dpr, coarse, start, hints, rendererString, storage, persist})
 *        → { tier, auto, settings, pixelRatio, setTier(t), setViewDist(n), sample(frameMs), warmup(ms), describe() }
 *
 * Uyarlama: runner/engine/quality.js kontrolcüsü kare süresini izler, dpr merdivenini (ve "lite" kademelerini) yönetir.
 * Burada bu karar ek olarak görüş mesafesi, post-fx, parçacık yoğunluğu ve bulut moduna yansıtılır:
 *   - her 2 dpr adımı görüş mesafesini 1 chunk kısar (en çok 2),
 *   - "lite" kademede etkin kademe bir aşağı iner (high → medium → low), düşük lite oranında bir daha.
 * Atlas kalitesi (doku boyu) uyarlamada DEĞİŞMEZ (tüm chunk'ları yeniden mesh'lemek gerekir); yalnız elle kademe
 * seçildiğinde değişir ve `atlasChanged: true` bildirilir → oyun atlas+malzemeyi yeniden kurup chunkManager.setAtlas çağırır.
 *
 * sample(frameMs) null ya da değişim tanımlayıcısı döner:
 *   { reason:'auto'|'manual', changed:[anahtar…], atlasChanged:boolean, settings:{…kopya} }
 */
import { createQualityController } from '../../runner/engine/quality.js';

export const QUALITY_KEYS = Object.freeze(['low', 'medium', 'high']);
export const PREF_KEY = 'kesif.quality.v1';

/**
 * Kademe tablosu.
 *   viewDist   görüş mesafesi (chunk)         dprMax   en yüksek piksel oranı
 *   post       post-fx açık mı               bloom/bloomLevels   parlama; msaa  render hedefi MSAA örnekleri
 *   aniso      doku anizotropisi             atlas    atlas kalitesi ('low' 16 px, ötesi 32 px)
 *   material   shader ayrıntı kademesi       particles  parçacık yoğunluğu çarpanı; weather  hava parçacığı çarpanı
 *   clouds     'basit'|'orta'|'tam'          maxUploads kare başına en çok geometri yüklemesi
 *   workers    en çok işçi sayısı            shadows  (şimdilik hiçbir kademede gölge haritası yok)
 */
export const QUALITY = Object.freeze({
  low: Object.freeze({
    key: 'low', viewDist: 5, dprMax: 1, post: false, bloom: false, bloomLevels: 0, msaa: 0, aniso: 1,
    atlas: 'low', material: 'low', particles: 0.4, weather: 0.45, clouds: 'basit', maxUploads: 2, workers: 1, shadows: false,
  }),
  medium: Object.freeze({
    key: 'medium', viewDist: 7, dprMax: 1.5, post: true, bloom: true, bloomLevels: 3, msaa: 0, aniso: 2,
    atlas: 'medium', material: 'medium', particles: 0.7, weather: 0.75, clouds: 'orta', maxUploads: 4, workers: 2, shadows: false,
  }),
  high: Object.freeze({
    key: 'high', viewDist: 10, dprMax: 2, post: true, bloom: true, bloomLevels: 5, msaa: 4, aniso: 4,
    atlas: 'high', material: 'high', particles: 1, weather: 1, clouds: 'tam', maxUploads: 6, workers: 3, shadows: false,
  }),
});

/**
 * Şehir (Neon Meridyen) kademe tablosu — render tarafı ayarları (sözleşme §13, §17).
 *   viewDist      görüş (chunk) 9/7/5            audioNodes   ses düğümü tavanı 24/18/12      planarMirror  v1 dışı (hiçbir kademede yok)
 *   skylineBoxes  uzak siluet kutu sayısı (≤600, tek çizim çağrısı)                         holoVisible   aynı anda görünen holo reklam (≤8; toplam ≤24)
 *   wet           ıslak yol: 'fresnel' (düşük: yalnız Fresnel) | 'puddle' (birikinti gürültüsü) | 'rings' (+ yağmur halkaları)
 *   windowGroupA  pencere grubu A (eşik 0,2) açık mı (düşük: kapalı)                         postBloom     post-fx bloom (düşük kademede post kapalı)
 *   rings/steam/sparks/dust   şehir hava parçacığı örnek sayıları (tek çizim çağrısı; hızlı çizim bütçesi gök-parçacık 28/36/48 içinde)
 *   rainStyle     weather.js şehir yağmuru çarpanı ayrıca QUALITY.weather ile ölçeklenir
 */
export const CITY_QUALITY = Object.freeze({
  low: Object.freeze({
    key: 'low', viewDist: 5, audioNodes: 12, planarMirror: false, skylineBoxes: 300, holoVisible: 4, wet: 'fresnel', windowGroupA: false,
    postBloom: false, rings: 120, steam: 32, sparks: 24, dust: 70,
  }),
  medium: Object.freeze({
    key: 'medium', viewDist: 7, audioNodes: 18, planarMirror: false, skylineBoxes: 450, holoVisible: 6, wet: 'puddle', windowGroupA: true,
    postBloom: true, rings: 300, steam: 64, sparks: 48, dust: 140,
  }),
  high: Object.freeze({
    key: 'high', viewDist: 9, audioNodes: 24, planarMirror: false, skylineBoxes: 600, holoVisible: 8, wet: 'rings', windowGroupA: true,
    postBloom: true, rings: 480, steam: 96, sparks: 64, dust: 220,
  }),
});

/** Kademe anahtarı ('low'|'medium'|'high'), QUALITY ayar nesnesi ({effTier|key}) ya da bilinmeyen → şehir kademe ayarları (bilinmeyen → medium). */
export function cityQualityFor(t) {
  let k = t;
  if (t && typeof t === 'object') k = t.effTier || t.key || t.tier;
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(CITY_QUALITY, k) ? CITY_QUALITY[k] : CITY_QUALITY.medium;
}

export const VIEW_DIST_MIN = 3;
export const VIEW_DIST_MAX = 12;

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mali-4\d\d|mali-t[0-6]\d\d|adreno \(tm\) [2-4]\d\d|powervr sgx/i;
const WEAK_GPU = /mali-g[1-5]\d\b|mali-t[78]\d\d|adreno \(tm\) 5[0-3]\d|intel\(r\) hd graphics [2-4]\d\d\d?\b|apple gpu a[89]\b|powervr ge/i;

function num(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/**
 * Cihaz ipuçlarından başlangıç kademesi (saf, belirlenimci).
 * @param {{coarse?:boolean, deviceMemory?:number, hardwareConcurrency?:number, screenW?:number, screenH?:number,
 *   dpr?:number, rendererString?:string, saveData?:boolean}} h
 * @returns {'low'|'medium'|'high'}
 */
export function pickInitialTier(h) {
  const x = h || {};
  const renderer = typeof x.rendererString === 'string' ? x.rendererString : '';
  if (SOFTWARE_GPU.test(renderer)) return 'low';
  const mem = num(x.deviceMemory, 0); // 0 = bilinmiyor
  const cores = num(x.hardwareConcurrency, 0);
  const sw = num(x.screenW, 0);
  const sh = num(x.screenH, 0);
  const dpr = num(x.dpr, 1);
  const pixels = sw > 0 && sh > 0 ? sw * sh * dpr * dpr : 0;
  if (x.saveData) return 'low';
  let score = x.coarse ? 1 : 2; // 0 düşük, 1 orta, 2 yüksek
  if (mem > 0 && mem <= 2) score = Math.min(score, 0);
  else if (mem > 0 && mem <= 4) score = Math.min(score, 1);
  if (cores > 0 && cores <= 4) score = Math.min(score, x.coarse ? 0 : 1);
  if (cores > 0 && cores <= 2) score = 0;
  if (renderer && WEAK_GPU.test(renderer)) score = Math.min(score, x.coarse ? 0 : 1);
  if (x.coarse && sw > 0 && Math.min(sw, sh) < 380) score = Math.min(score, 0);
  // çok yüksek çözünürlüklü ekranda doğal piksel sayısı büyükse (4K masaüstü) bir kademe temkin
  if (!x.coarse && pixels > 3840 * 2160 * 1.2) score = Math.min(score, 1);
  if (x.coarse && mem >= 6 && cores >= 8 && !WEAK_GPU.test(renderer)) score = Math.max(score, 1);
  return QUALITY_KEYS[Math.max(0, Math.min(2, score))];
}

/** Tarayıcıdan cihaz ipuçları (hata yutulur; node'da boş döner). */
export function collectDeviceHints(extra) {
  const h = {};
  try {
    if (typeof navigator !== 'undefined' && navigator) {
      if (typeof navigator.deviceMemory === 'number') h.deviceMemory = navigator.deviceMemory;
      if (typeof navigator.hardwareConcurrency === 'number') h.hardwareConcurrency = navigator.hardwareConcurrency;
      const c = navigator.connection;
      if (c && c.saveData) h.saveData = true;
    }
  } catch {
    /* yok say */
  }
  try {
    if (typeof window !== 'undefined') {
      h.dpr = window.devicePixelRatio || 1;
      if (window.screen) {
        h.screenW = window.screen.width;
        h.screenH = window.screen.height;
      }
      if (window.matchMedia) h.coarse = !!window.matchMedia('(pointer: coarse)').matches;
    }
  } catch {
    /* yok say */
  }
  return Object.assign(h, extra || {});
}

/** WebGLRenderer'dan GPU adı (WEBGL_debug_renderer_info); okunamazsa ''. */
export function readRendererString(renderer) {
  try {
    const gl = renderer && renderer.getContext ? renderer.getContext() : null;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return '';
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------------------------------------
 * Kalıcılık
 * ---------------------------------------------------------------------------------------------- */
function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** {tier:'auto'|'low'|'medium'|'high', viewDist:number|null} */
export function loadQualityPref(storage) {
  const out = { tier: 'auto', viewDist: null };
  try {
    const st = storage === undefined ? defaultStorage() : storage;
    if (!st) return out;
    const raw = st.getItem(PREF_KEY);
    if (!raw) return out;
    const p = JSON.parse(raw);
    if (p && (p.tier === 'auto' || QUALITY[p.tier])) out.tier = p.tier;
    if (p && Number.isFinite(p.viewDist)) out.viewDist = Math.max(VIEW_DIST_MIN, Math.min(VIEW_DIST_MAX, Math.round(p.viewDist)));
  } catch {
    /* bozuk kayıt: varsayılan */
  }
  return out;
}

export function saveQualityPref(pref, storage) {
  try {
    const st = storage === undefined ? defaultStorage() : storage;
    if (!st) return false;
    st.setItem(PREF_KEY, JSON.stringify({ tier: pref.tier, viewDist: pref.viewDist }));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Uyarlamalı kalite
 * ---------------------------------------------------------------------------------------------- */
const SETTING_KEYS = [
  'tier', 'effTier', 'viewDist', 'pixelRatio', 'post', 'bloom', 'bloomLevels', 'msaa', 'aniso', 'atlas', 'material',
  'particles', 'weather', 'clouds', 'maxUploads', 'workers', 'shadows',
];

function clampView(n) {
  return Math.max(VIEW_DIST_MIN, Math.min(VIEW_DIST_MAX, Math.round(n)));
}

/**
 * @param {{dpr?:number, coarse?:boolean, start?:'auto'|'low'|'medium'|'high', hints?:object, rendererString?:string,
 *   storage?:object|null, persist?:boolean, viewDist?:number|null}} [opts]
 *   start verilmezse kayıtlı tercih okunur (yoksa 'auto').
 */
export function createKesifQuality(opts) {
  const o = opts || {};
  const persist = o.persist !== false;
  const deviceDpr = num(o.dpr, 1) > 0 ? num(o.dpr, 1) : 1;
  const pref = o.start !== undefined && o.start !== null
    ? { tier: o.start === 'auto' || QUALITY[o.start] ? o.start : 'auto', viewDist: num(o.viewDist, null) }
    : loadQualityPref(o.storage);
  if (o.viewDist !== undefined && o.viewDist !== null) pref.viewDist = clampView(o.viewDist);
  const hints = collectDeviceHints(Object.assign({ coarse: !!o.coarse, rendererString: o.rendererString || '' }, o.hints || {}));
  if (o.coarse !== undefined) hints.coarse = !!o.coarse;
  if (o.dpr !== undefined) hints.dpr = deviceDpr;
  const autoBase = pickInitialTier(hints);

  let auto = pref.tier === 'auto';
  let baseTier = auto ? autoBase : pref.tier;
  let userView = pref.viewDist;
  let ctl = null;
  let startRatio = 1;
  let cur = null; // geçerli etkin ayarlar

  function buildController() {
    const cap = Math.min(deviceDpr, QUALITY[baseTier].dprMax);
    ctl = createQualityController({ dpr: cap });
    startRatio = ctl.ratio;
  }

  function compute() {
    const base = QUALITY[baseTier];
    const baseIdx = QUALITY_KEYS.indexOf(baseTier);
    let degrade = 0;
    let steps = 0;
    let ratio = Math.min(deviceDpr, base.dprMax);
    if (auto && ctl) {
      ratio = ctl.ratio;
      steps = Math.max(0, Math.round((startRatio - ratio) / 0.25));
      if (ctl.lite) degrade = ratio < 0.8 ? 2 : 1;
    }
    const effIdx = Math.max(0, baseIdx - degrade);
    const eff = QUALITY[QUALITY_KEYS[effIdx]];
    const viewCut = Math.min(2, Math.floor(steps / 2)) + (degrade > 0 ? degrade : 0);
    const vd = userView !== null && userView !== undefined
      ? clampView(userView - (auto ? viewCut : 0))
      : clampView(eff.viewDist - (auto && degrade === 0 ? viewCut : 0));
    return {
      tier: baseTier,
      effTier: eff.key,
      viewDist: vd,
      pixelRatio: Math.round(ratio * 100) / 100,
      post: eff.post,
      bloom: eff.bloom,
      bloomLevels: eff.bloomLevels,
      msaa: eff.msaa,
      aniso: base.aniso,
      atlas: base.atlas,
      material: eff.material,
      particles: eff.particles,
      weather: eff.weather,
      clouds: eff.clouds,
      maxUploads: eff.maxUploads,
      workers: base.workers,
      shadows: eff.shadows,
    };
  }

  function diff(a, b) {
    const changed = [];
    for (let i = 0; i < SETTING_KEYS.length; i++) {
      const k = SETTING_KEYS[i];
      if (!a || a[k] !== b[k]) changed.push(k);
    }
    return changed;
  }

  function commit(reason) {
    const next = compute();
    const changed = diff(cur, next);
    const atlasChanged = !!cur && cur.atlas !== next.atlas;
    cur = next;
    if (changed.length === 0) return null;
    return { reason, changed, atlasChanged, settings: Object.assign({}, cur) };
  }

  function save() {
    if (persist) saveQualityPref({ tier: auto ? 'auto' : baseTier, viewDist: userView === undefined ? null : userView }, o.storage);
  }

  buildController();
  cur = compute();

  return {
    /** Taban kademe ('auto' seçiliyse cihaz sezgisinin bulduğu). */
    get tier() {
      return baseTier;
    },
    get auto() {
      return auto;
    },
    /** Kullanıcının seçimi: 'auto' | 'low' | 'medium' | 'high'. */
    get choice() {
      return auto ? 'auto' : baseTier;
    },
    /** Etkin ayarlar (salt okunur; her değişimde yeni nesne). */
    get settings() {
      return cur;
    },
    get pixelRatio() {
      return cur.pixelRatio;
    },
    get viewDist() {
      return cur.viewDist;
    },
    /** İlk açılışta kullanılacak ayarların kopyası. */
    describe() {
      return Object.assign({}, cur);
    },
    /** 'auto' | 'low' | 'medium' | 'high'. Değişim tanımlayıcısı (ya da null) döner. */
    setTier(t) {
      if (t === 'auto') {
        auto = true;
        baseTier = autoBase;
      } else if (QUALITY[t]) {
        auto = false;
        baseTier = t;
      } else {
        return null;
      }
      buildController();
      save();
      return commit('manual');
    },
    /** Elle görüş mesafesi (chunk, 3..12); null → kademe varsayılanı. */
    setViewDist(n) {
      userView = n === null || n === undefined || !Number.isFinite(n) ? null : clampView(n);
      save();
      return commit('manual');
    },
    /** Kare süresi (ms) besle; ayar değiştiyse tanımlayıcı, yoksa null. Elle kademede hep null. */
    sample(frameMs) {
      if (!auto || !ctl) return null;
      const r = ctl.sample(frameMs);
      if (r === null) return null;
      return commit('auto');
    },
    /** Duraklatma/sekme dönüşü sonrası ilk kareleri sayma. */
    warmup(ms) {
      if (ctl) ctl.warmup(ms);
    },
  };
}
