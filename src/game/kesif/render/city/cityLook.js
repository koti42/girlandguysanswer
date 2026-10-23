/*
 * KEŞİF render/city — NEON MERİDYEN GÖRÜNÜMÜ (sözleşme §13): boyuta göre tüm görsel/ses ayarlarının tek yöneticisi.
 *
 *   applyDimensionLook(dimId, G?) → {dim, changed}      boyut görünümünü uygular (boyut yöneticisi `swap` sonunda çağırır; idempotent). G verilmezse
 *                                                        son kurulan görünüm bağlamı kullanılır. 'neon' → şehir, diğer her şey → ana diyar.
 *   getCityLook(G) → look                                G için (yoksa kurar ve `G.addSystem` varsa sistemi kaydeder)
 *   createCityLook(G, opts?) → look                      doğrudan kurucu (testler)
 *   createCityLookSystem(G) → sistem {name:'cityLook', order:36, init, frameUpdate, onDimension, dispose}
 *   look: {dim, wet, state, apply(dimId), frame(dt), setQuality(settings), setSkyline(list), getStats(), skyline, holo, weather, ambience, dispose()}
 *
 * Şehir görünümü (apply('neon')): chunk malzemesi `#define CITY` varyantı (aCity: neon boyası, ıslak yol, pencere grupları), post-fx şehir derecelendirmesi
 * {bloom .95, threshold .8, knee .5, saturation 1.18, vignette .28}, şehir yağmuru stili + halka/buhar/kıvılcım/holo-toz katmanı, uzak siluet
 * (≤600 kutu, tek çağrı), holo reklamlar (≤24, ≤8 görünür), kamera far 1600, şehir saati (clock.origin 0,25), temel ses ambiyansı. Gökyüzü paleti, yıldız ×0,25,
 * sis çarpanları ve hava çizelgesi hava nesnesinin `table:'neon'` alanından otomatik gelir (sim/daynight.js; computeSky/updateWeather). Ana diyar: hepsi geri alınır,
 * çizim bayt-aynıdır. Kare başına iş (frameUpdate): uWet (1 sn yükselme / 20 sn kuruma), uNeon [gece, neon, ıslak, pencere], uRain, derecelendirme yağmuru, katman
 * güncellemeleri, kamera far, ambiyans.
 */
import { createSkylineImpostor, SKYLINE_MAX } from './skylineImpostor.js';
import { createHoloAds, pickHoloAnchors, HOLO_MAX_VISIBLE } from './holoAds.js';
import { createCityWeather } from './cityWeather.js';
import {
  wetTargetFor, stepWet, neonUniformFor, lookNameFor, CITY_CAMERA_FAR, fogShelter, ambienceState, overheadCovered,
} from './cityLookMath.js';
import { cityQualityFor } from '../quality.js';
import { createCityAmbience } from '../../audioCity.js';
import { NEON_CLOCK_ORIGIN } from '../../sim/daynightNeon.js';
import { clockPhase, precipitation } from '../../sim/daynight.js';

const PLAN_MODS = import.meta.glob('../../sim/city/cityPlan.js', { eager: true });

export const CITY_LOOK_SYSTEM_NAME = 'cityLook';
export const CITY_LOOK_SYSTEM_ORDER = 36;
const GROUND_Y = 64;
const looks = new WeakMap();
let activeLook = null;

function fin(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** cityPlan.getCityPlan(seed).skyline (varsa); modül/işlev yoksa ya da atarsa null. */
function planSkyline(seed) {
  const keys = Object.keys(PLAN_MODS);
  for (let i = 0; i < keys.length; i++) {
    const m = PLAN_MODS[keys[i]];
    if (m && typeof m.getCityPlan === 'function') {
      try {
        const p = m.getCityPlan(seed);
        return p && Array.isArray(p.skyline) ? p.skyline : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Boyut kimliği (string) ya da DimCtx/{id} → görünüm adı. */
function idOf(x) {
  if (typeof x === 'string') return x;
  return x && typeof x.id === 'string' ? x.id : 'overworld';
}

function detectDim(G) {
  if (typeof G.dim === 'string') return lookNameFor(G.dim);
  if (G.world && typeof G.world.dim === 'string') return lookNameFor(G.world.dim);
  return 'overworld';
}

export function createCityLook(G, opts) {
  const o = opts || {};
  const THREE = G.THREE;
  const look = {
    G,
    dim: 'overworld',
    wet: 0,
    state: {
      night: 0, rain: 0, wet: 0, shelter: 0, underwater: false,
    },
    skyline: null,
    holo: null,
    weather: null,
    ambience: null,
  };
  let disposed = false;
  let skyline = null;
  let holo = null;
  let weather = null;
  let ambience = null;
  let savedFar = null;
  let reduced = !!(G.reducedMotion || G.accessibility);
  let tierKey = '';
  let cq = cityQualityFor('medium');
  let shelterSm = 0;
  let shelterAcc = 1;
  let skyRaw = 15;
  let covered = false;
  let seedSeen = null;
  const neonBuf = new Float32Array(4);
  const light = [0.2, 0.22, 0.35];
  const wState = {
    rain: 0, night: 0, wind: null, light, shelter: 0, underwater: false,
  };
  const aState = ambienceState({}, 0, 0, 0, 0);

  function sceneAdd(obj) {
    if (G.scene && obj && !obj.parent) G.scene.add(obj);
  }

  function ensureLayers() {
    if (!THREE) return;
    const uni = G.materials ? G.materials.uniforms : undefined;
    if (!skyline) {
      skyline = createSkylineImpostor(THREE, { uniforms: uni, max: cq.skylineBoxes, windowGroupA: cq.windowGroupA });
      sceneAdd(skyline.object3D);
      look.skyline = skyline;
    }
    if (!holo) {
      holo = createHoloAds(THREE, { uniforms: uni, cap: cq.holoVisible, reducedMotion: reduced });
      sceneAdd(holo.object3D);
      look.holo = holo;
    }
    if (!weather) {
      weather = createCityWeather(THREE, { quality: cq, reducedMotion: reduced, groundY: GROUND_Y, seed: seedSeen || 0 });
      sceneAdd(weather.object3D);
      look.weather = weather;
    }
    if (!ambience) {
      ambience = createCityAmbience({
        play: (name, op) => (typeof G.sound === 'function' ? G.sound(name, null, op) : null),
        nodeCap: cq.audioNodes,
      });
      look.ambience = ambience;
    }
  }

  function citySeed() {
    const s = G.world && fin(G.world.seed) ? G.world.seed : 0;
    return s;
  }

  /** Skyline + holo reklam verisini şehir planından (varsa) yükler. */
  look.setSkyline = function setSkyline(list) {
    ensureLayers();
    if (!skyline) return 0;
    const n = skyline.setBoxes(list);
    if (holo) holo.setAnchors(pickHoloAnchors(skyline.getBoxes(), citySeed(), 24));
    return n;
  };

  function applyQuality(settings) {
    cq = cityQualityFor(settings || (G.quality && G.quality.settings) || 'medium');
    if (skyline) {
      skyline.setMax(Math.min(SKYLINE_MAX, cq.skylineBoxes));
      skyline.setWindowGroupA(cq.windowGroupA);
    }
    if (holo) holo.setCap(Math.min(HOLO_MAX_VISIBLE, cq.holoVisible));
    if (weather) weather.setQuality(cq);
    if (ambience) ambience.setNodeCap(cq.audioNodes);
  }
  look.setQuality = function setQuality(settings) {
    applyQuality(settings);
  };

  function restoreFar() {
    const cam = G.camera;
    if (!cam) return;
    // gameRender/gameCamera.cameraFar ile aynı formül: en az 256, (görüş+2)·24
    let far = savedFar !== null && fin(savedFar) ? savedFar : 288;
    if (G.chunkManager && typeof G.chunkManager.getViewDist === 'function') {
      const v = G.chunkManager.getViewDist();
      if (fin(v)) far = Math.max(256, (Math.max(2, v) + 2) * 24);
    }
    cam.far = far;
    if (typeof cam.updateProjectionMatrix === 'function') cam.updateProjectionMatrix();
  }

  look.apply = function apply(dimId) {
    if (disposed) return { dim: look.dim, changed: false };
    const next = lookNameFor(idOf(dimId));
    if (next === look.dim) return { dim: next, changed: false };
    const prev = look.dim;
    look.dim = next;
    if (next === 'neon') {
      ensureLayers();
      applyQuality();
      seedSeen = citySeed();
      if (weather) weather.setSeed(seedSeen);
      if (G.camera && prev !== 'neon') savedFar = G.camera.far;
      if (G.clock) G.clock.origin = NEON_CLOCK_ORIGIN;
      if (G.materials && typeof G.materials.setCity === 'function') G.materials.setCity(true);
      if (G.postfx && typeof G.postfx.setGrade === 'function') G.postfx.setGrade('neon');
      if (G.weatherLayer && typeof G.weatherLayer.setStyle === 'function') G.weatherLayer.setStyle('city');
      if (skyline) skyline.object3D.visible = skyline.getCount() > 0;
      if (weather) weather.object3D.visible = true;
      const plan = planSkyline(seedSeen);
      if (plan) look.setSkyline(plan);
      look.wet = wetTargetFor(G.weatherSim);
      if (G.camera && Math.abs(G.camera.far - CITY_CAMERA_FAR) > 0.5) {
        G.camera.far = CITY_CAMERA_FAR;
        if (typeof G.camera.updateProjectionMatrix === 'function') G.camera.updateProjectionMatrix();
      }
      warmPrograms();
    } else {
      if (G.materials && typeof G.materials.setCity === 'function') G.materials.setCity(false);
      if (G.postfx && typeof G.postfx.setGrade === 'function') G.postfx.setGrade('overworld');
      if (G.weatherLayer && typeof G.weatherLayer.setStyle === 'function') G.weatherLayer.setStyle('overworld');
      if (skyline) skyline.object3D.visible = false;
      if (holo) holo.object3D.visible = false;
      if (weather) weather.object3D.visible = false;
      if (ambience) ambience.stop();
      if (G.materials && G.materials.uniforms) {
        G.materials.uniforms.uWet.value = 0;
        G.materials.uniforms.uRain.value = 0;
      }
      look.wet = 0;
      if (prev === 'neon') restoreFar();
      savedFar = null;
    }
    return { dim: next, changed: true };
  };

  /** Yeni shader programlarını (CITY varyantı) geçiş sırasında paralel derletir; yoksa sessizce atlar. */
  function warmPrograms() {
    const r = G.renderer;
    if (!r || !G.scene || !G.camera) return;
    // renderer.compile yalnız görünür nesneleri derler: henüz görünmeyen katmanlar (holo reklam, şehir havası) ilk kullanımda takılma yapmasın diye
    // derleme çağrısı süresince görünür kılınır, sonra eski durumuna döner.
    const layers = [skyline, holo, weather].filter(Boolean).map((l) => l.object3D);
    const was = layers.map((o) => o.visible);
    layers.forEach((o) => { o.visible = true; });
    // iç mekân prop programları (kesif-ic-prop / kesif-ic-holo) da önceden derlenir: ilk iç mekân chunk'ında ~100 ms derleme takılması olmasın (qa_p2)
    const ip = G.interiorPropRenderer;
    let warmEnd = null;
    try { warmEnd = ip && typeof ip.warmBegin === 'function' ? ip.warmBegin() : null; } catch { warmEnd = null; }
    // program anahtarı çizim hedefine bağlı (son işleme açıkken yarı-kayan noktalı ara hedef: srgb-linear, ton eşleme yok); gerçek hedefle derle (qa_p2)
    let rt = null;
    let prevRT = null;
    try {
      prevRT = typeof r.getRenderTarget === 'function' ? r.getRenderTarget() : null;
      if (G.postfx && G.postfx.enabled && THREE && typeof r.setRenderTarget === 'function') {
        rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
        r.setRenderTarget(rt);
      }
    } catch {
      rt = null;
    }
    try {
      if (typeof r.compileAsync === 'function') {
        const p = r.compileAsync(G.scene, G.camera);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else if (typeof r.compile === 'function') {
        r.compile(G.scene, G.camera);
      }
    } catch {
      /* yut */
    } finally {
      layers.forEach((o, i) => { o.visible = was[i]; });
      if (warmEnd) { try { warmEnd(); } catch { /* yut */ } }
      if (rt) { try { r.setRenderTarget(prevRT); } catch { /* yut */ } rt.dispose(); }
    }
  }

  function sampleShelter(dt) {
    shelterAcc += dt;
    if (shelterAcc >= 0.25 && G.world && typeof G.world.getLight === 'function' && G.eye) {
      shelterAcc = 0;
      const l = G.world.getLight(Math.floor(G.eye.x), Math.floor(G.eye.y), Math.floor(G.eye.z));
      if (fin(l)) skyRaw = l >> 4;
      // üstü kapalı mı (tavan/tente/cam çatı): pencereden sızan gökyüzü ışığı (iç mekânda 7) yağmuru kesmez → tavan varsa tam sığınak (qa_p2: odada yağmur çizgileri)
      covered = overheadCovered(G.world, G.eye);
    }
    shelterSm += ((covered ? 1 : fogShelter(skyRaw)) - shelterSm) * Math.min(1, dt * 2);
  }

  look.frame = function frame(dt) {
    if (disposed) return;
    const d = detectDim(G);
    if (d !== look.dim) look.apply(d);
    if (look.dim !== 'neon') return;
    const step = fin(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    const w = G.weatherSim;
    const st = look.state;
    const rainNow = w && fin(w.intensity) && precipitation(w) ? w.intensity : 0;
    look.wet = stepWet(look.wet, wetTargetFor(w), step);
    const phase = G.clock ? clockPhase(G.clock) : 0;
    neonUniformFor(neonBuf, phase, look.wet, rainNow);
    st.night = neonBuf[0];
    st.rain = rainNow;
    st.wet = look.wet;
    if (G.materials && G.materials.uniforms) {
      const u = G.materials.uniforms;
      u.uWet.value = look.wet;
      u.uRain.value = rainNow;
      u.uNeon.value.set(neonBuf[0], neonBuf[1], neonBuf[2], neonBuf[3]);
      if (u.uAmbientColor) {
        light[0] = u.uAmbientColor.value.r;
        light[1] = u.uAmbientColor.value.g;
        light[2] = u.uAmbientColor.value.b;
      }
    }
    if (G.postfx && typeof G.postfx.setGradeRain === 'function') G.postfx.setGradeRain(rainNow);
    sampleShelter(step);
    st.shelter = shelterSm;
    const cam = G.camera;
    if (cam && Math.abs(cam.far - CITY_CAMERA_FAR) > 0.5) {
      cam.far = CITY_CAMERA_FAR;
      if (typeof cam.updateProjectionMatrix === 'function') cam.updateProjectionMatrix();
    }
    const rm = !!(G.reducedMotion || G.accessibility);
    if (rm !== reduced) {
      reduced = rm;
      if (holo) holo.setReducedMotion(rm);
      if (weather) weather.setReducedMotion(rm);
    }
    const q = G.quality && G.quality.settings;
    const tk = q ? q.effTier || q.tier || '' : '';
    if (tk !== tierKey) {
      tierKey = tk;
      applyQuality(q);
    }
    if (holo) holo.update(step, cam);
    if (weather) {
      wState.rain = rainNow;
      wState.night = neonBuf[0];
      wState.wind = w ? w.wind : null;
      wState.shelter = shelterSm;
      weather.update(step, wState, cam);
    }
    if (ambience) {
      ambienceState(aState, neonBuf[0], rainNow, look.wet, shelterSm);
      ambience.update(step, aState);
    }
  };

  look.getStats = function getStats() {
    return {
      dim: look.dim,
      wet: look.wet,
      night: look.state.night,
      rain: look.state.rain,
      cameraFar: G.camera ? G.camera.far : null,
      skyline: skyline ? { boxes: skyline.getCount(), triangles: skyline.triangles, drawCalls: skyline.drawCalls } : null,
      holo: holo ? { visible: holo.getVisibleCount(), anchors: holo.getAnchors().length, drawCalls: holo.drawCalls } : null,
      weather: weather ? weather.getStats() : null,
      ambience: ambience ? ambience.getStats() : null,
      tier: cq.key,
      city: !!(G.materials && G.materials.city),
    };
  };

  look.dispose = function dispose() {
    if (disposed) return;
    disposed = true;
    if (skyline) skyline.dispose();
    if (holo) holo.dispose();
    if (weather) weather.dispose();
    if (ambience) ambience.dispose();
    skyline = null;
    holo = null;
    weather = null;
    ambience = null;
    if (activeLook === look) activeLook = null;
    if (looks.get(G) === look) looks.delete(G);
  };

  if (o.apply) look.apply(o.apply);
  return look;
}

/** Sistem: kare başına görünüm + boyut değişiminde apply. order 36 (sözleşme §20'de boş). */
export function createCityLookSystem(G, look) {
  const lk = look || getCityLook(G, { noSystem: true });
  return {
    name: CITY_LOOK_SYSTEM_NAME,
    order: CITY_LOOK_SYSTEM_ORDER,
    look: lk,
    init(g) {
      lk.apply(detectDim(g || G));
    },
    frameUpdate(g, dt) {
      lk.frame(dt);
    },
    onDimension(g, from, to) {
      lk.apply(idOf(to));
    },
    dispose() {
      lk.dispose();
    },
  };
}

/** G için görünüm (yoksa kurar; G.addSystem varsa sistemi bir kez kaydeder). G.cityLook = look. */
export function getCityLook(G, opts) {
  let look = looks.get(G);
  if (look) return look;
  look = createCityLook(G);
  looks.set(G, look);
  activeLook = look;
  G.cityLook = look;
  const noSystem = opts && opts.noSystem;
  if (!noSystem && typeof G.addSystem === 'function') {
    const already = typeof G.getSystem === 'function' ? G.getSystem(CITY_LOOK_SYSTEM_NAME) : null;
    if (!already) {
      try {
        G.addSystem(createCityLookSystem(G, look));
      } catch {
        /* yut: sistem kaydı başarısızsa applyDimensionLook elle çağrılır */
      }
    }
  }
  return look;
}

/**
 * Boyut görünümü. Boyut yöneticisi `swap` sonunda (sistemlerin onDimension'ından önce/sonra) çağırır; kendi başına da çalışır:
 * sistem kayıtlıysa onDimension zaten uygular. G verilmezse en son kurulan görünüm kullanılır (yoksa {dim, changed:false}).
 */
export function applyDimensionLook(dimId, G) {
  const look = G ? getCityLook(G) : activeLook;
  if (!look) return { dim: lookNameFor(idOf(dimId)), changed: false };
  return look.apply(idOf(dimId));
}

