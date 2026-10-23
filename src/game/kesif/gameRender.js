/*
 * KEŞİF — render yığını: renderer, sahne, kamera, ışıklar, atlas + malzemeler, chunk yöneticisi, gökyüzü, hava, post-fx,
 * parçacıklar, hedef vurgusu, kalite denetleyicisi; kare başı ışık/sis/gökyüzü güncellemesi; yeniden boyutlandırma;
 * WebGL bağlam kaybı; tam temizlik.
 *
 *   createRenderStack(G) → stack     G.world, G.opts, G.settings, G.callbacks gerekir; şu G alanlarını DOLDURUR:
 *       renderer, scene, camera, sky, weatherLayer, postfx, materials, atlas, atlasPixels, chunkManager, particles,
 *       highlight, quality, worldRoot, entityRoot
 *   stack.frame(dt, env)      kare başı: gökyüzü durumu → malzeme/sis/ışık uniform'ları, sky/weather/postfx/particles güncelle
 *   stack.render(dt)          postfx.render ya da doğrudan çizim (bağlam kayıpken atlanır)
 *   stack.resize()            ResizeObserver bayrağı varsa boyutları yeniler
 *   stack.applyQuality(change) quality.js değişim tanımlayıcısını uygular (planQualityChange)
 *   stack.setViewDist(n)      kullanıcı üst sınırı (chunk) → etkin görüş mesafesi
 *   stack.makeChunkManager(world, o?)   verilen dünya için (boyut geçişi) güncel atlas/kalite/görüş ile ChunkManager kurar (o: {hidden, workerCount, pool})
 *   stack.setChunkManager(cm)           etkin ChunkManager'ı değiştirir (G.chunkManager, görüş/sis/yükleme ısıtıcı bağlanır); eskiyi ATMAZ (çağıran atar)
 *   stack.skyState / stack.fog / stack.lightAtEye   okunur durumlar
 *   stack.dispose()           renderer + sahne + geometri/doku/malzeme + işçi + dinleyiciler
 *
 * Atlas kalitesi yalnız açılışta seçilir (otomatik uyarlama değiştirmez); elle kademe değişince `atlas` işlemi atlası yeniler.
 */
import * as THREE from 'three';
import {
  createKesifRenderer, createKesifQuality, readRendererString, QUALITY,
  generateAtlasPixels, createAtlasTextures, createChunkMaterials, updateMaterialsFrame,
  createChunkManager, createSky, getFogParams, createWeatherLayer, createPostFx, createParticleSystem,
  createBlockHighlight,
} from './render/index.js';
import { setHeldItemAtlas } from './render/heldItems.js';
import { atlasTileSize, createAtlasBuilder } from './render/atlas.js';
import { createBiomeMood } from './render/biomeMood.js';
import { setAtlasPixels as setIconAtlas } from './render/itemIcons.js';
import {
  createSkyState, computeSky, sunDirection, moonDirection, moonPhase, clockPhase, zoneTintIndex, precipitation,
} from './sim/daynight.js';
import { cameraFar } from './gameCamera.js';
import {
  effectiveViewDist, planQualityChange, createViewBudget, drawBudgetFor, CITY_DRAW_TARGET, createDrawGovernor, CITY_TRIS_HARD, CITY_TRIS_SOFT, triangleBudget,
} from './gameQuality.js';
import { precompileForState } from './gameWarm.js';
import { createChunkUploadWarmer } from './gameWarmChunks.js';

const WATER_FOG = [0.02, 0.16, 0.28];
const LAVA_FOG = [0.46, 0.1, 0.02];
const tierKey = (t) => (QUALITY[t] ? t : 'medium');

function isCoarse() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * renderer.compile/compileAsync için TEK, modül düzeyi kanca (perf_tuner, Faz 5). Sarmalayıcı renderer başına bir kez kurulur ve yalnız `hook.handler`a yönlenir;
 * işleyici (render yığınının kapsamını yakalar: sahne, dünya, atlas, malzemeler…) yığın atılırken bırakılır → renderer bir yerde tutulsa bile eski yığının
 * kapsamı (dünya verisi dahil, ölçülen ~60 MB / 10 dk) bellekte kalmaz. İşleyici yokken çağrı aynen özgün işlevi çalıştırır.
 */
const COMPILE_HOOK = '__kesifCompileHook';
function installCompileHook(renderer, handler) {
  let hook = renderer[COMPILE_HOOK];
  if (!hook) {
    hook = { handler: null, gen: 0 };
    ['compile', 'compileAsync'].forEach((fn) => {
      const raw = renderer[fn];
      if (typeof raw !== 'function') return;
      renderer[fn] = function warmTargeted(...a) {
        const h = hook.handler;
        return h ? h(fn, raw, a) : raw.apply(renderer, a);
      };
    });
    renderer[COMPILE_HOOK] = hook;
  }
  // DİKKAT: `handler` bu işlevin bağlamında (context) bir iç işlev tarafından YAKALANMAMALI; sarmalayıcıyla aynı bağlamı paylaşıp yığın kapsamını (dünya verisi
  // dahil) renderer üzerinden canlı tutar (ortak malzemelerin 'dispose' dinleyicisi eski renderer'ı tutar). Bırakma işlevi yalnız `hook` ve `gen` yakalar.
  hook.handler = handler;
  const gen = ++hook.gen;
  return () => {
    if (hook.gen === gen) hook.handler = null;
  };
}

export function createRenderStack(G) {
  const o = G.opts;
  const container = G.container;
  const coarse = o.controls === 'touch' || (o.controls !== 'desktop' && isCoarse());
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  const reduced = !!(G.reducedMotion || G.accessibility);
  let disposed = false;
  let userView = Number.isFinite(G.settings.viewDist) ? G.settings.viewDist : null;
  const budget = createViewBudget({ drawBudget: drawBudgetFor(coarse) });
  // Neon Meridyen: toplam çağrı ≤250 ve toplam üçgen ≤ kademe bütçesi SERT tavan (tetik 1,0); boyut değişince denetleyici değişir
  const budgetCity = createViewBudget({
    drawBudget: CITY_DRAW_TARGET, trigger: 1, cooldown: 0.6, smoothRate: 8, maxCut: 4,
  });
  const cityGovT = createDrawGovernor({ hard: CITY_TRIS_HARD, soft: CITY_TRIS_SOFT, minScale: 0.7 }); // üçgen: bütçenin %95'i
  const cityGov = createDrawGovernor(); // şehir: toplam çağrı > 226 → sis/çizim uzaklığı sürekli kısılır (perf_tuner)
  let cityBudgetOn = false;
  const activeBudget = () => (cityBudgetOn ? budgetCity : budget);
  let baseView = 7;

  /* ---- renderer + bağlam kaybı ---- */
  const hooks = { lost: null, restored: null };
  const kr = createKesifRenderer(THREE, {
    container,
    coarse,
    pixelRatio: 1,
    clearColor: 0xcfe6f5,
    onContextLost: (e) => { if (hooks.lost) hooks.lost(e); },
    onContextRestored: (e) => { if (hooks.restored) hooks.restored(e); },
  });
  const renderer = kr.renderer;
  // Post-fx çok geçişli: varsayılan autoReset her renderer.render çağrısında sayaçları sıfırlar, getStats yalnız son
  // geçişi (tam ekran dörtgen: 1 üçgen / 1 çizim) görürdü. Kare başında elle sıfırlanır (bkz. render()).
  renderer.info.autoReset = false;

  /* ---- kalite denetleyicisi ---- */
  const quality = createKesifQuality({
    dpr,
    coarse,
    start: ['auto', 'low', 'medium', 'high'].indexOf(o.quality) >= 0 ? o.quality : (G.settings.quality || 'auto'),
    rendererString: readRendererString(renderer),
    persist: false,
  });
  const q0 = quality.describe();
  kr.setPixelRatio(q0.pixelRatio);

  /* ---- sahne + kamera + ışıklar ---- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe6f5);
  scene.fog = new THREE.Fog(0xcfe6f5, 60, 150);
  const aspect = kr.width / Math.max(1, kr.height);
  const viewDist0 = effectiveViewDist(userView, q0.viewDist);
  baseView = viewDist0;
  const camera = new THREE.PerspectiveCamera(G.settings.fov || 70, aspect, 0.06, cameraFar(viewDist0));
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6a5a48, 1.1);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  scene.add(hemi, sun, sun.target);

  const worldRoot = new THREE.Group();
  worldRoot.name = 'kesif-dunya';
  const entityRoot = new THREE.Group();
  entityRoot.name = 'kesif-varliklar';
  scene.add(worldRoot, entityRoot);

  /* ---- atlas + malzemeler ---- */
  let atlasPixels = generateAtlasPixels({ quality: q0.atlas });
  let atlas = createAtlasTextures(THREE, atlasPixels, {
    anisotropy: Math.max(1, Math.min(q0.aniso, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4)),
  });
  setHeldItemAtlas(atlas);
  setIconAtlas(atlasPixels);
  const materials = createChunkMaterials(THREE, atlas, undefined, { quality: q0.material });

  let chunkManager = createChunkManager({
    THREE, scene, world: G.world, materials, atlas, quality: Object.assign({}, q0, { viewDist: viewDist0 }), useWorker: o.useWorker !== false,
  });

  /* ---- gökyüzü, hava, post-fx, parçacık, vurgu ---- */
  const sky = createSky(THREE, { quality: q0, reducedMotion: reduced, pixelRatio: q0.pixelRatio });
  scene.add(sky.object3D);
  const weatherLayer = createWeatherLayer(THREE, { quality: q0, reducedMotion: reduced });
  scene.add(weatherLayer.object3D);
  const postfx = createPostFx(THREE, { renderer, scene, camera, quality: q0, reducedMotion: reduced });
  // Ön-derleme çağrıları (renderer.compile/compileAsync) hedefsizse program anahtarı EKRAN renk uzayıyla (srgb) çıkar; oysa post-fx açıkken gerçek çizim
  // yarı-kayan noktalı ara hedefedir (srgb-linear) → ısınma boşa gider, ilk çizimde ~30–100 ms derleme takılması olur (perf_tuner, Faz 5: yaya/keşif/NPC/robot ısınmaları).
  // Tek merkezde: hedef yoksa ve post-fx açıksa derleme geçici ara hedefle yapılır; hedefi kendisi ayarlayanlar (cityLook, araç) aynen geçer.
  let warmRT = null;
  let warmDraws = 0;
  let inWarm = false; // three'nin compileAsync'i içeriden this.compile'ı çağırır (sarmalı): iç içe çağrı ikinci kez ısınma yapmaz
  const releaseCompileHook = installCompileHook(renderer, (fn, raw, a) => {
    if (inWarm || G.dim !== 'neon') return raw.apply(renderer, a); // ana diyar: davranış aynen (yalnız şehir ısınması bu yoldan geçer)
    const own = renderer.getRenderTarget ? renderer.getRenderTarget() : null; // hedefi kendisi kuranlar (cityLook, araç): aynen
    // düşük kademede (post-fx kapalı) oyun ekrana çizer ama geçiş/foto sırasında post-fx geçici açılır: iki varyant da gerekir (rt + ekran)
    const lowTier = !(quality.settings && quality.settings.post);
    const passes = own ? (lowTier ? ['own', 'screen'] : ['own']) : postfx.enabled ? (lowTier ? ['rt', 'screen'] : ['rt']) : ['screen'];
    let out;
    inWarm = true;
    try {
      for (let i = 0; i < passes.length; i++) {
        let set = false;
        let restoreOwn = null;
        if (passes[i] === 'screen' && own) { // çağıran kendi hedefini kurmuştu (araç ısınması): ekran varyantı için geçici olarak hedefsiz
          renderer.setRenderTarget(null);
          restoreOwn = own;
        }
        if (passes[i] === 'rt') {
          try {
            // gerçek ara hedefle aynı biçim + MSAA örnek sayısı (sürücü düzeyi durum değişkenleri biçime/örneğe bağlı olabilir)
            if (!warmRT) warmRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, samples: Math.min((renderer.capabilities && renderer.capabilities.maxSamples) || 0, (quality.settings && quality.settings.msaa) || 0) });
            renderer.setRenderTarget(warmRT);
            set = true;
          } catch {
            set = false;
          }
        }
        try {
          const r = raw.apply(renderer, a);
          if (i === 0) out = r;
          uploadSceneTextures(a[0]);
          // gerçek (küçük) çizim: sürücünün ilk-çizim işi (araç/yaya/NPC ilk görünümünde ~80 ms GPU) geçişin donuk karelerinde yapılsın
          if (a[0] === scene && a[1] === camera && warmDraws < 90) {
            warmDraws++;
            warmDraw();
          }
        } finally {
          if (set) renderer.setRenderTarget(null);
          if (restoreOwn) renderer.setRenderTarget(restoreOwn);
        }
      }
    } finally {
      inWarm = false;
    }
    return out;
  });
  // ısınma çizimi: hedef ara hedefse (post-fx açık) küçük hedefe, ekrana (düşük kademe) çiziliyorsa 1×1 makas bölgesine (kare sonunda tam çizim üstüne yazar)
  function warmDraw() {
    const undo = forceVisible(scene);
    const toScreen = !(renderer.getRenderTarget && renderer.getRenderTarget());
    let sc = false;
    const prev = new THREE.Vector4();
    try {
      if (toScreen && renderer.setScissorTest) {
        sc = renderer.getScissorTest();
        renderer.getScissor(prev);
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, 1, 1);
      }
      renderer.render(scene, camera);
    } catch {
      /* yut */
    } finally {
      if (toScreen && renderer.setScissorTest) {
        renderer.setScissor(prev.x, prev.y, prev.z, prev.w);
        renderer.setScissorTest(sc);
      }
      undo();
    }
  }
  // ısınma çizimi için: gizli/boş örnekli (InstancedMesh.count = 0) her şey geçici olarak görünür kılınır → programları ilk GERÇEK çizimde değil geçişte çalışır
  function forceVisible(root) {
    const saved = [];
    root.traverse((o) => {
      if (o.isInstancedMesh && o.count === 0 && o.instanceMatrix && o.instanceMatrix.count > 0) { saved.push([o, 'count', 0]); o.count = 1; }
      if (!o.visible && (o.isMesh || o.isPoints || o.isLine || o.isSprite || o.isGroup)) { saved.push([o, 'visible', false]); o.visible = true; }
    });
    return function undo() {
      for (let i = saved.length - 1; i >= 0; i--) saved[i][0][saved[i][1]] = saved[i][2];
    };
  }
  // Derlenen ama henüz kullanılmamış programların bağlama (link) denetimi three'de İLK ÇİZİMDE yapılır ve sürücü derlemeyi bitirene dek BEKLER (30–260 ms).
  // Paralel derleme tamamlandıkça (KHR_parallel_shader_compile, bloklamadan sorgu) getUniforms() ile bu denetim önceden yapılır → ilk çizimde takılma olmaz.
  const progDone = new WeakSet();
  let parallelExt = null;
  try { parallelExt = renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.extensions.get('KHR_parallel_shader_compile') : null; } catch { parallelExt = null; }
  let fpCount = -1;
  let fpLast = null;
  function finalizePrograms(budgetMs) {
    const list = renderer.info && renderer.info.programs;
    if (!list || !list.length) return;
    if (list.length === fpCount && list[list.length - 1] === fpLast) return; // her program tamamlandı, yeni program yok: kare başına tarama maliyeti sıfır
    const gl = renderer.getContext();
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let open = false;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p || progDone.has(p) || typeof p.getUniforms !== 'function') continue;
      if (parallelExt && p.program && !gl.getProgramParameter(p.program, parallelExt.COMPLETION_STATUS_KHR)) { open = true; continue; } // hâlâ derleniyor: sonra
      progDone.add(p);
      try { p.getUniforms(); } catch { /* yut */ }
      if (typeof performance !== 'undefined' && performance.now() - t0 >= budgetMs) { open = true; break; }
    }
    if (!open) {
      fpCount = list.length;
      fpLast = list[list.length - 1];
    }
  }
  // aynı ısınma çağrısında sahnedeki dokular da GPU'ya yüklenir (tabela/plaka/keşif atlası gibi 1024² tuval dokuları ilk çizimde ~5–20 ms sürer)
  const texSeen = new WeakSet();
  function uploadSceneTextures(root) {
    if (!root || typeof root.traverse !== 'function' || typeof renderer.initTexture !== 'function') return;
    const pushTex = (t) => {
      if (t && t.isTexture && !t.isRenderTargetTexture && !texSeen.has(t)) {
        texSeen.add(t);
        try { renderer.initTexture(t); } catch { /* yut */ }
      }
    };
    root.traverse((o) => {
      const m = o.material;
      if (!m) return;
      const list = Array.isArray(m) ? m : [m];
      for (let i = 0; i < list.length; i++) {
        const mm = list[i];
        if (!mm) continue;
        pushTex(mm.map);
        const u = mm.uniforms;
        if (u) for (const k in u) { const v = u[k] && u[k].value; if (v && v.isTexture) pushTex(v); }
      }
    });
  }
  const particles = createParticleSystem(THREE, scene, { quality: tierKey(q0.effTier), reducedMotion: reduced, seed: G.seed });
  const highlight = createBlockHighlight(THREE, { reducedMotion: reduced });
  scene.add(highlight.object3D);
  // görünmeyen (arkadaki/tıkalı) chunk mesh'leri kare başına birkaç tane GPU'ya önceden yüklenir: ilk dönüşte toplu yükleme sıçraması olmasın
  const warmArgs = {
    THREE, renderer, camera, chunkManager, getPostOn: () => postfx.enabled, fog: scene.fog,
  };
  const chunkWarm = createChunkUploadWarmer(warmArgs);

  G.renderer = renderer;
  G.scene = scene;
  G.camera = camera;
  G.sky = sky;
  G.weatherLayer = weatherLayer;
  G.postfx = postfx;
  G.materials = materials;
  G.atlas = atlas;
  G.atlasPixels = atlasPixels;
  G.chunkManager = chunkManager;
  G.particles = particles;
  G.highlight = highlight;
  G.quality = quality;
  G.chunkWarm = chunkWarm; // (hata ayıklama/ölçüm: yükleme istatistikleri)
  G.worldRoot = worldRoot;
  G.entityRoot = entityRoot;

  /* ---- kare durumu ---- */
  const skyState = createSkyState();
  const biomeMood = createBiomeMood(); // biyom/mağara atmosfer ruh hâli (gökyüzü + sis tonu)
  skyState.sunDir = { x: 0, y: 1, z: 0 };
  skyState.moonDir = { x: 0, y: -1, z: 0 };
  skyState.zoneTint = 0;
  skyState.moonPhase = 4;
  skyState.weather = null;
  const fog = {
    fogColor: [0, 0, 0], skyColor: [0, 0, 0], horizonColor: [0, 0, 0], ambient: [0, 0, 0], sunColor: [0, 0, 0],
    sunDir: { x: 0, y: 1, z: 0 }, fogNear: 0, fogFar: 0, fadeStart: 0, fadeEnd: 0, dayFactor: 1, fogDensity: 1, minLight: 0.02,
  };
  const matState = {
    time: 0, underwater: false, underwaterColor: WATER_FOG, underwaterFar: 26, reducedMotion: reduced,
  };
  const fogOpts = { sealDistance: Infinity };
  const weatherState = {
    kind: null, intensity: 0, wind: null, light: fog.ambient, shelter: 0, underwater: false,
  };
  const lightAtEye = { sky: 1, block: 0, skyRaw: 15 };
  const eyeCell = { x: 0, y: 0, z: 0 };
  let renderTime = 0;
  let viewDist = viewDist0;
  let needResize = false;
  let ro = null;
  const sunV = new THREE.Vector3();

  function updateSize() {
    needResize = false;
    if (!kr.resize(false)) return;
    camera.aspect = kr.width / Math.max(1, kr.height);
    camera.updateProjectionMatrix();
    postfx.setSize(kr.width, kr.height, renderer.getPixelRatio());
  }
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { needResize = true; });
    ro.observe(container);
  }
  const onWinResize = () => { needResize = true; };
  if (typeof window !== 'undefined') window.addEventListener('resize', onWinResize);
  postfx.setSize(kr.width, kr.height, renderer.getPixelRatio());

  function setViewDist(userMax) {
    userView = userMax === null || userMax === undefined || !Number.isFinite(userMax) ? null : userMax;
    const s = quality.settings;
    baseView = effectiveViewDist(userView, s.viewDist);
    viewDist = Math.max(3, baseView - activeBudget().cut);
    chunkManager.setViewDist(viewDist);
    camera.far = cameraFar(viewDist);
    camera.updateProjectionMatrix();
    return viewDist;
  }

  /** Boyut geçişi: verilen dünya için güncel ayarlarla yönetici kurar (etkinleştirmez). */
  function makeChunkManager(world, mo) {
    const m = mo || {};
    return createChunkManager({
      THREE,
      scene,
      world,
      materials,
      atlas,
      quality: Object.assign({}, quality.describe(), { viewDist: m.viewDist > 0 ? m.viewDist : viewDist }),
      useWorker: o.useWorker !== false,
      hidden: m.hidden === true,
      workerCount: m.workerCount,
      pool: m.pool,
    });
  }

  /** Etkin yöneticiyi değiştirir: görüş mesafesi/yükleme ısıtıcısı yeni yöneticiye geçer. */
  function setChunkManager(cm) {
    if (disposed || !cm) return;
    chunkManager = cm;
    warmArgs.chunkManager = cm;
    G.chunkManager = cm;
    cm.setHidden(false);
    cm.setViewDist(viewDist);
  }

  function sampleLight(dt, ex, ey, ez) {
    eyeCell.x = Math.floor(ex);
    eyeCell.y = Math.floor(ey);
    eyeCell.z = Math.floor(ez);
    const l = G.world.getLight(eyeCell.x, eyeCell.y, eyeCell.z);
    const sk = (l >> 4) / 15;
    const bl = (l & 15) / 15;
    const k = 1 - Math.exp(-6 * Math.max(dt, 0.001));
    lightAtEye.skyRaw += ((l >> 4) - lightAtEye.skyRaw) * k;
    lightAtEye.sky += (sk - lightAtEye.sky) * k;
    lightAtEye.block += (bl - lightAtEye.block) * k;
  }

  /**
   * Kare başı görsel güncelleme. env: {x,y,z (göz), underwater, lava, hurt, heal, boss, temperature?}
   */
  function frame(dt, env) {
    if (disposed) return;
    stepAtlasJob();
    finalizePrograms(4);
    // üçgen bütçesi: görünür üçgen kademe bütçesini aşarsa görüş mesafesi kısılır
    if (dt > 0) {
      const cityNow = G.dim === 'neon';
      if (cityNow !== cityBudgetOn) {
        // boyut değişti: iki denetleyici de sıfırlanır, görüş taban değere döner (yeni yönetici zaten taban görüşle kurulur)
        cityBudgetOn = cityNow;
        budget.reset();
        budgetCity.reset();
        viewDist = Math.max(3, baseView);
        chunkManager.setViewDist(viewDist);
        camera.far = cameraFar(viewDist);
        camera.updateProjectionMatrix();
      }
      const bud = activeBudget();
      const before = bud.cut;
      const cs = chunkManager.getStats();
      const qs = quality.settings;
      let cut;
      if (cityNow) {
        // şehir: GERÇEK toplam (post geçişleri, prop, gökyüzü, parçacık dahil) çağrı ve üçgen — sözleşme §17 tavanları
        const info = renderer.info.render;
        cut = bud.update(dt, info.triangles, qs.effTier, info.calls);
      } else {
        // çizim bütçesi gerçek toplam çağrıya bakar (yaratıklar/gökyüzü/parçacık dahil, son kare; post-fx geçişleri düşülür):
        // yalnız chunk çağrısına bakmak kalabalık sahnede telefonda 300+ çağrıya izin veriyordu
        const postPasses = !qs.post ? 0 : qs.bloom ? 2 * qs.bloomLevels : 1;
        const draws = Math.max(cs.drawCalls, renderer.info.render.calls - postPasses);
        cut = bud.update(dt, cs.triangles, qs.effTier, draws);
      }
      if (cut !== before) {
        viewDist = Math.max(3, baseView - cut);
        chunkManager.setViewDist(viewDist);
        camera.far = cameraFar(viewDist);
        camera.updateProjectionMatrix();
      }
    }
    const clock = G.clock;
    const ph = clockPhase(clock);
    renderTime += dt;
    sampleLight(dt, env.x, env.y, env.z);
    // gökyüzü durumu
    const zt = zoneTintIndex(env.x, env.z);
    computeSky(ph, zt, G.weatherSim, skyState);
    biomeMood.update(dt, env.biomeKey, env.caveKey, env.underground);
    biomeMood.apply(skyState);
    sunDirection(ph, skyState.sunDir);
    moonDirection(ph, skyState.moonDir);
    skyState.phase = ph;
    skyState.moonPhase = moonPhase(clock.day);
    skyState.zoneTint = zt;
    skyState.weather = G.weatherSim;
    fogOpts.sealDistance = chunkManager.getSealDistance();
    getFogParams(skyState, viewDist, fogOpts, fog);
    let govScale = 1;
    if (cityBudgetOn) {
      if (dt > 0) {
        const ri = renderer.info.render;
        govScale = Math.min(cityGov.update(dt, ri.calls), cityGovT.update(dt, (100 * ri.triangles) / triangleBudget(quality.settings.effTier)));
      } else govScale = Math.min(cityGov.scale, cityGovT.scale);
    } else if (cityGov.scale < 1 || cityGovT.scale < 1) {
      cityGov.reset();
      cityGovT.reset();
    }
    if (govScale < 1) {
      fog.fogNear *= govScale; fog.fogFar *= govScale; fog.fadeStart *= govScale; fog.fadeEnd *= govScale;
    }
    matState.time = renderTime;
    matState.underwater = env.underwater;
    matState.underwaterColor = env.lava ? LAVA_FOG : WATER_FOG;
    matState.underwaterFar = env.lava ? 3.5 : 26;
    matState.reducedMotion = G.reducedMotion || G.accessibility;
    Object.assign(matState, fog);
    // Gece Görüşü (büyü sistemi): karanlık yüzeyler için asgari ışık yükselir (0 = kapalı; sistem G.nightVisionK'yi yumuşatır)
    const nv = G.nightVisionK > 0 ? G.nightVisionK : 0;
    if (nv > 0) matState.minLight = Math.max(matState.minLight || 0, 0.34 * nv);
    updateMaterialsFrame(materials, matState);
    chunkManager.setFogDistance(fog.fadeEnd + 1); // fadeEnd ötesi her parça eriyip atılır (bkz. materialShaders uFadeEnd) → çizmeye gerek yok
    // standart malzemeler (karakter/yaratık/elde eşya dışı) için sahne sisi + ışıklar
    const fc = scene.fog.color;
    if (env.underwater) {
      const c = env.lava ? LAVA_FOG : WATER_FOG;
      fc.setRGB(c[0], c[1], c[2]);
      scene.fog.near = 0.5;
      scene.fog.far = env.lava ? 3.5 : 26;
    } else {
      fc.setRGB(fog.fogColor[0], fog.fogColor[1], fog.fogColor[2]);
      scene.fog.near = fog.fogNear;
      scene.fog.far = fog.fogFar;
    }
    const day = skyState.dayFactor;
    hemi.color.setRGB(fog.horizonColor[0] * 0.8 + 0.2, fog.horizonColor[1] * 0.8 + 0.2, fog.horizonColor[2] * 0.8 + 0.2);
    hemi.groundColor.setRGB(fog.ambient[0] * 0.55, fog.ambient[1] * 0.5, fog.ambient[2] * 0.45);
    hemi.intensity = 0.5 + 0.65 * day + 0.5 * nv;
    const mx = Math.max(fog.sunColor[0], fog.sunColor[1], fog.sunColor[2], 0.001);
    sun.color.setRGB(fog.sunColor[0] / mx, fog.sunColor[1] / mx, fog.sunColor[2] / mx);
    sun.intensity = 0.35 + 2.2 * day * (1 - 0.5 * Math.min(1, skyState.cloudDark * 2));
    sunV.set(fog.sunDir.x, fog.sunDir.y, fog.sunDir.z);
    sun.position.set(G.eye.x + sunV.x * 60, G.eye.y + sunV.y * 60, G.eye.z + sunV.z * 60);
    sun.target.position.set(G.eye.x, G.eye.y, G.eye.z);
    sun.target.updateMatrixWorld();
    scene.background.setRGB(fog.fogColor[0], fog.fogColor[1], fog.fogColor[2]);
    // karakter ışığı (yeraltında/gece karanlık)
    if (G.character) {
      const lit = Math.max(lightAtEye.sky * skyState.skyLight, lightAtEye.block * 0.95);
      G.character.setLight(Math.min(1.25, 0.28 + lit * 0.95));
    }
    sky.update(dt, skyState, camera);
    // hava
    const w = G.weatherSim;
    weatherState.kind = precipitation(w);
    weatherState.intensity = w.intensity;
    weatherState.wind = w.wind;
    weatherState.shelter = Math.max(0, Math.min(1, 1 - lightAtEye.skyRaw / 12));
    weatherState.underwater = env.underwater;
    weatherLayer.update(dt, weatherState, camera);
    postfx.setEffects({
      underwater: env.underwater ? 1 : 0, hurt: env.hurt || 0, heal: env.heal || 0, boss: env.boss ? 1 : 0, seal: env.seal || 0,
    });
    particles.update(dt, camera);
    highlight.update(dt);
    if (dt > 0 && dt < 0.03) chunkWarm.step(Math.min((viewDist + 1) * 16, fog.fadeEnd + 1));
  }

  function render(dt) {
    if (disposed || kr.contextLost) return;
    if (needResize) updateSize();
    renderer.info.reset();
    postfx.render(dt);
    if (typeof G.afterRender === 'function') G.afterRender(dt); // foto modu (systems/cityPhoto): yalnız-görsel saat/hava geçersiz kılmasını geri alır
  }

  const anisoNow = () => Math.max(1, Math.min(quality.settings.aniso, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4));

  /** Atlas değişimi artımlıdır (kare başına ≲ ATLAS_SLICE_MS): 32→16 px / 16→32 px üretimi ~100 ms'ydi ve tek karede donduruyordu. */
  const ATLAS_SLICE_MS = 5;
  let atlasJob = null;

  function installAtlas(pixels) {
    const oldAtlas = atlas;
    atlasPixels = pixels;
    atlas = createAtlasTextures(THREE, atlasPixels, { anisotropy: anisoNow() });
    chunkManager.setAtlas(atlas);
    setHeldItemAtlas(atlas);
    setIconAtlas(atlasPixels);
    G.atlas = atlas;
    G.atlasPixels = atlasPixels;
    oldAtlas.dispose();
  }

  function stepAtlasJob() {
    if (!atlasJob || disposed) return;
    if (atlasJob.builder.step(ATLAS_SLICE_MS)) {
      const px = atlasJob.builder.finish();
      atlasJob = null;
      installAtlas(px);
    }
  }

  function applyAtlas(tier) {
    atlasJob = null; // bekleyen eski iş yeni isteğe yenilir
    if (atlasTileSize({ quality: tier }) === atlasPixels.tileSize) {
      // medium ↔ high: doku boyu aynı → piksel aynı: yeniden üretim, doku yüklemesi ve tüm chunk'ların yeniden mesh'lenmesi YOK.
      // (Anizotropi 2× ↔ 4× yalnız doku yeniden yüklenirken uygulanır; yükleme ~ms + GPU harcar, fark ihmal edilebilir → atlanır.)
      return;
    }
    atlasJob = { tier, builder: createAtlasBuilder({ quality: tier }) };
  }

  /** quality.js değişim tanımlayıcısını uygular. Uygulanan işlem sayısını döner. */
  function applyQuality(change) {
    if (disposed || !change) return 0;
    const ops = planQualityChange(change, userView);
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      switch (op.op) {
        case 'pixelRatio':
          kr.setPixelRatio(op.value);
          sky.setPixelRatio(op.value);
          postfx.setSize(kr.width, kr.height, renderer.getPixelRatio());
          break;
        case 'viewDist':
          baseView = op.value;
          viewDist = Math.max(3, baseView - activeBudget().cut);
          chunkManager.setViewDist(viewDist);
          camera.far = cameraFar(viewDist);
          camera.updateProjectionMatrix();
          break;
        case 'postfx': postfx.setQuality(op.settings); break;
        case 'materials': materials.setQuality(op.level); break;
        case 'sky': sky.setQuality(op.settings); break;
        case 'weather': weatherLayer.setQuality(op.settings); break;
        case 'particles': particles.setQuality(tierKey(op.tier)); break;
        case 'chunks': chunkManager.setQuality(op.settings); break;
        case 'atlas': applyAtlas(op.tier); break;
        default: break;
      }
    }
    // Program anahtarı değiştiyse (son işleme / malzeme kademesi) yeni programları paralel bağlat: ilk karedeki donma ~yarıya iner
    // (Kademe ısıtması bittiyse tüm programlar hazırdır: sahnenin tamamını gezen eşzamanlı derleme ~10 ms harcar → atlanır)
    if (ops.some((x) => x.op === 'postfx' || x.op === 'materials') && !(G.tierWarm && G.tierWarm.done)) precompileForState(THREE, renderer, scene, camera, postfx.enabled);
    return ops.length;
  }

  function setReducedMotion(b) {
    sky.setReducedMotion(b);
    weatherLayer.setReducedMotion(b);
    postfx.setReducedMotion(b);
    particles.setReducedMotion(b);
    highlight.setReducedMotion(b);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    atlasJob = null;
    if (ro) ro.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('resize', onWinResize);
    hooks.lost = null;
    hooks.restored = null;
    try { chunkWarm.dispose(); } catch { /* yut */ }
    try { chunkManager.dispose(); } catch { /* yut */ }
    try { particles.dispose(); } catch { /* yut */ }
    try { highlight.dispose(); } catch { /* yut */ }
    try { weatherLayer.dispose(); } catch { /* yut */ }
    try { sky.dispose(); } catch { /* yut */ }
    try { postfx.dispose(); } catch { /* yut */ }
    try { releaseCompileHook(); } catch { /* yut */ }
    try { if (warmRT) warmRT.dispose(); } catch { /* yut */ }
    try { materials.dispose(); } catch { /* yut */ }
    try { atlas.dispose(); } catch { /* yut */ }
    // Sahnede kalan nesneler (karakter/yaratık modelleri vb.) kendi dispose'larını sistemler/çekirdek yapar; ortak önbellekli geometri
    // (elde eşya, yaratık kitleri) burada AYRICA atılmaz: eski bağlamın dinleyicileri sonraki oyunda uyarı üretirdi.
    // GPU kaynaklarını forceContextLoss (kr.dispose) toptan bırakır.
    scene.clear();
    kr.dispose();
  }

  return {
    frame,
    render,
    resize: updateSize,
    applyQuality,
    setViewDist,
    makeChunkManager,
    setChunkManager,
    setReducedMotion,
    dispose,
    hooks,
    kr,
    skyState,
    fog,
    lightAtEye,
    get viewDist() {
      return viewDist;
    },
    get viewCut() {
      return activeBudget().cut;
    },
    get drawScale() {
      return Math.min(cityGov.scale, cityGovT.scale);
    },
    get disposed() {
      return disposed;
    },
    get contextLost() {
      return kr.contextLost;
    },
  };
}
