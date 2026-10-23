/*
 * KEŞİF — oyun orkestratörü: createKesifGame(opts) → Promise<api>.
 *
 * Akış: WebGL denetimi → mod dünyası (gameWorld) → G bağlamı (gameCtx) → sim nesneleri (gameSim) → render yığını (gameRender)
 * → girdi + ses + kamera + karakter/kollar + HUD + UI → çekirdek sistemleri (player, survival, time, post) → standart sistemler
 * (systems/*.js, gameSystems) → init → ilk chunk halkası (≤ 12 sn) → onReady → döngü.
 *
 * Döngü (gameLoop): her kare: girdi oku → eylemleri yönlendir → N sabit adım (60 Hz; fixedUpdate sırası: player −100, survival −90,
 * time −80, sistemler, post 1000) → kamera → çevre → HUD → sistemlerin frameUpdate'i → chunk yöneticisi → render durumu → ses
 * → karakter/kol senkronu → HUD yayını → çizim. Duraklatılmışken sim ilerlemez (dt = 0).
 *
 * api yüzeyi: bkz. gameApi.js (çekirdek) + sistemlerin api() çıktıları (çakışma = hata).
 */
import * as THREE from 'three';
import { createGameContext } from './gameCtx.js';
import { createModeWorld, progressTickEvent } from './gameWorld.js';
import { buildSim, createProgressionFor } from './gameSim.js';
import { createRenderStack } from './gameRender.js';
import { createCameraRig } from './gameCamera.js';
import { createPlayerCore } from './gamePlayer.js';
import { createGameHud } from './gameHud.js';
import { installUi } from './gameUi.js';
import { createGameAudio } from './gameAudio.js';
import { createEnvSampler, weatherLabel, ambientParticlesFor } from './gameEnv.js';
import { createStepper, createFrameStats, createGameLoop } from './gameLoop.js';
import { createFrameSampler } from './gameQuality.js';
import { loadStandardSystems } from './gameSystems.js';
import { createWarmSteps } from './gameWarm.js';
import { createTierWarmer, syncWarmDim } from './gameWarmTiers.js';
import { buildApi } from './gameApi.js';
import { createDimensionManager } from './gameDimension.js';
import { applyDimensionLook } from './render/city/cityLook.js';
import { createKesifInput } from './input.js';
import { createDriveCallbacks } from './inputVehicleBridge.js';
import { createCharacter } from './render/character.js';
import { createFirstPerson } from './render/firstPerson.js';
import { createCosmetics } from './render/cosmetics.js';
import { retainHeldItemCache, releaseHeldItemCache } from './render/heldItems.js';
import { normalizeAvatar } from '../avatar/catalog.js';
import { updateClock, updateWeather, clockPhase } from './sim/daynight.js';
import { ITEMS } from './sim/items.js';
import { CAVE_STYLES } from './sim/biomeData.js';

/** WebGL2 var mı? (oyun yalnız WebGL2 ile çalışır; kısa ömürlü tuval ile denenir.) */
export function isWebGLAvailable() {
  try {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_SETTINGS = {
  sensitivity: 1, invertY: false, fov: 70, viewDist: 7, quality: 'auto', easy: false, leftHanded: false, joystickScale: 1,
  crouchToggle: false, gyro: false, haptics: true, muted: false, music: true, accessibility: false,
};

function pickMode(m, save) {
  if (m === 'insa' || m === 'harita' || m === 'macera') return m;
  if (save && (save.mode === 'insa' || save.mode === 'harita')) return save.mode;
  return 'macera';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function isTorchKey(key) {
  if (!key) return false;
  const it = ITEMS[key];
  return !!it && (it.model === 'torch' || it.model === 'lantern');
}

/**
 * createKesifGame(opts) → Promise<api>. İsteğe bağlı iptal: opts.signal ({aborted:boolean}, AbortSignal uyumlu) ya da opts.isCancelled():
 * iptal edilirse kurulan her şey (WebGL bağlamı, dinleyiciler, işçiler) bırakılır ve söz err.code === 'aborted' ile reddedilir
 * (onError ÇAĞRILMAZ). Kurulum sırasında herhangi bir adım hata fırlatırsa da o ana kadar kurulanlar bırakılır (bağlam sızıntısı yok).
 */
export async function createKesifGame(options) {
  const track = { disposers: [], done: false };
  try {
    return await bootKesifGame(options, track);
  } catch (e) {
    if (!track.done) {
      track.done = true;
      for (let i = track.disposers.length - 1; i >= 0; i--) {
        try { track.disposers[i](); } catch { /* yut */ }
      }
    }
    throw e;
  }
}

async function bootKesifGame(options, track) {
  const opts = options || {};
  const container = opts.container;
  if (!container || typeof container.appendChild !== 'function') throw new TypeError('createKesifGame: container gerekli');
  const cb = opts.callbacks || {};
  const fail = (code, msg, cause) => {
    const err = new Error(msg);
    err.code = code;
    if (cause) err.cause = cause;
    if (typeof cb.onError === 'function') {
      try { cb.onError(err); } catch { /* yut */ }
    }
    return err;
  };
  const aborted = () => {
    try {
      return !!((opts.signal && opts.signal.aborted) || (typeof opts.isCancelled === 'function' && opts.isCancelled()));
    } catch {
      return false;
    }
  };
  const abortError = () => {
    const ab = new Error('Oyun başlatması iptal edildi.');
    ab.code = 'aborted';
    return ab;
  };
  if (!isWebGLAvailable()) throw fail('webgl_unavailable', 'Bu cihazda 3B grafik (WebGL2) kullanılamıyor.');

  const save = opts.save && typeof opts.save === 'object' ? opts.save : null;
  const mode = pickMode(opts.mode, save);
  const seedInput = opts.seed !== undefined && opts.seed !== null && opts.seed !== '' ? opts.seed : (save && save.seed !== undefined ? save.seed : undefined);
  await sleep(0); // arayüz "yükleniyor" çizebilsin
  if (aborted()) throw abortError();
  const tBoot0 = nowMs();

  /* ---- dünya + G ---- */
  const progRef = { p: null };
  const info = createModeWorld({
    mode,
    seed: seedInput === undefined ? Math.floor(Math.random() * 4294967296) : seedInput,
    mapData: opts.mapData,
    base: opts.base,
    zoneUnlocked: (i) => !!(progRef.p && progRef.p.zonesUnlocked[i]),
  });
  const tWorld = nowMs();
  const G = createGameContext(opts, {
    THREE, mode, seed: info.seed, worldCode: info.worldCode,
  });
  G.world = info.world;
  track.disposers.push(() => info.world.dispose());
  G.seedInput = info.seedInput;
  G.mapMeta = info.mapMeta;
  G.settings = Object.assign({}, DEFAULT_SETTINGS, opts.settings || {});
  if (opts.quality) G.settings.quality = opts.quality;
  if (opts.muted !== undefined) G.settings.muted = !!opts.muted;
  if (opts.music !== undefined) G.settings.music = !!opts.music;
  if (opts.accessibility !== undefined) G.settings.accessibility = !!opts.accessibility;
  G.reducedMotion = opts.reducedMotion !== undefined ? !!opts.reducedMotion : prefersReducedMotion();
  G.accessibility = !!(opts.accessibility || G.settings.accessibility);
  G.haptics = opts.haptics !== false && G.settings.haptics !== false;
  G.progression = createProgressionFor(info.seed, mode);
  progRef.p = G.progression;
  buildSim(G, {
    world: info.world, spawn: info.spawn, phase: info.phase, frozenClock: info.frozenClock, seed: info.seed, mode, progression: G.progression,
  });
  G.player.yaw = info.yaw;
  G.scratch = { v1: { x: 0, y: 0, z: 0 }, v2: { x: 0, y: 0, z: 0 }, v3: { x: 0, y: 0, z: 0 } };
  if (info.errors && info.errors.length > 0 && typeof cb.onSpeak === 'function') {
    try { cb.onSpeak(info.errors[0]); } catch { /* yut */ }
  }

  /* ---- render, ses, girdi, kamera, karakter ---- */
  let render;
  try {
    render = createRenderStack(G);
  } catch (e) {
    try { info.world.dispose(); } catch { /* yut */ }
    throw fail('render_init', 'Grafik motoru başlatılamadı.', e);
  }
  track.disposers.push(() => render.dispose());
  if (aborted()) throw abortError();
  const tRender = nowMs();
  const audioApi = createGameAudio(G);
  track.disposers.push(() => audioApi.dispose());
  G.audio = audioApi.audio;
  G.sound = audioApi.sound;
  G.fx = (name, ...args) => {
    const f = G.particles && G.particles[name];
    return typeof f === 'function' ? f.apply(G.particles, args) : undefined;
  };
  G.speak = (text) => {
    if (typeof cb.onSpeak === 'function' && text) {
      try { cb.onSpeak(String(text)); } catch { /* yut */ }
    }
  };
  G.haptic = (style) => {
    if (G.haptics && typeof cb.onHaptic === 'function') {
      try { cb.onHaptic(style || 'light'); } catch { /* yut */ }
    }
  };

  const camRig = createCameraRig(G);
  camRig.setBase(G.settings.fov);
  camRig.state.fov = G.settings.fov;
  const avatarCfg = normalizeAvatar(opts.avatar, opts.gender);
  const detail = G.quality.settings.tier === 'low' ? 'low' : 'high';
  G.character = createCharacter(avatarCfg, { detail });
  track.disposers.push(() => G.character.dispose());
  G.character.root.visible = false;
  G.scene.add(G.character.root);
  G.viewModel = createFirstPerson(THREE, G.camera, { avatarConfig: avatarCfg, detail, reducedMotion: G.reducedMotion || G.accessibility });
  track.disposers.push(() => G.viewModel.dispose());
  // Keşif mağaza görünümü (opts.cosmetics = {portal,alet,asa,jet,arac,gecis}; yok/bozuk → varsayılan görünüm). Yalnız görsel; sim'e dokunmaz.
  G.cosmetics = createCosmetics(G, opts.cosmetics);
  retainHeldItemCache();
  let heldCacheHeld = true;
  const releaseHeldCache = () => {
    if (!heldCacheHeld) return;
    heldCacheHeld = false;
    try { G.cosmetics.dispose(); releaseHeldItemCache(); } catch { /* yut */ }
  };
  track.disposers.push(releaseHeldCache);
  G.cosmetics.apply();
  G.addSystem({
    name: 'cosmetics',
    order: 95,
    frameUpdate() { G.cosmetics.tick(); },
    onEvent(_G, e) { if (e && e.type === 'respawn') G.cosmetics.arrive(1); },
  });

  G.input = createKesifInput({
    container,
    canvas: G.renderer.domElement,
    controls: opts.controls || 'auto',
    settings: {
      sensitivity: G.settings.sensitivity,
      invertY: G.settings.invertY,
      leftHanded: G.settings.leftHanded,
      joystickScale: G.settings.joystickScale,
      crouchToggle: G.settings.crouchToggle,
      gyro: G.settings.gyro,
      haptics: G.haptics,
    },
    callbacks: {
      onGesture: () => { if (G.audio) G.audio.unlock(); },
      onHaptic: (s) => G.haptic(s),
      ...createDriveCallbacks(G),
    },
    isActive: () => !G.destroyed,
  });
  track.disposers.push(() => G.input.dispose());

  /* ---- döngü, HUD, UI, oyuncu ---- */
  const stepper = createStepper();
  const frameStats = createFrameStats();
  const cpuStats = createFrameStats();
  const renderStats = createFrameStats();
  G.sampler = createFrameSampler();
  const envSampler = createEnvSampler(G);
  const env = envSampler.env;
  const particleAmb = {};
  let ambTimer = 1;
  let loop = null;
  const loopProxy = { restartClock: () => { if (loop) loop.restartClock(); } };
  const player = createPlayerCore(G, camRig, audioApi);
  const hud = createGameHud(G, player);
  track.disposers.push(() => hud.dispose());
  G.hudStore = hud.store;
  G.publishHud = hud.publish;
  G.markDirty = hud.markDirty;
  G.requestSave = (reason) => {
    for (let i = 0; i < G.saveHooks.length; i++) {
      try { G.saveHooks[i](reason || 'manual'); } catch (e) { if (G.opts.strictSystems) throw e; }
    }
  };
  G.teleport = player.teleport;
  G.respawnPlayer = player.respawn;
  G.setSpawn = player.setSpawn;
  const ui = installUi(G, {
    loop: loopProxy, stepper, audioApi, camRig, render, hud,
  });
  G.inventory.onChange(() => {
    G._invDirty = true;
    hud.markDirty('hotbar');
    player.syncArmor();
  });

  /* ---- boyut yöneticisi (Neon Meridyen; yalnız macera) ---- */
  if (mode === 'macera') G.dimMgr = createDimensionManager(G, { render, applyLook: applyDimensionLook });

  /* ---- çekirdek sistemleri ---- */
  let tickAcc = 0;
  /** Hata ayıklama: hava benzetimini zorla (api._debug().setWeather). */
  const forceWeather = (w) => {
    const f = G._weatherForce;
    if (!f) return;
    w.kind = f.kind;
    w.renderKind = f.kind;
    w.storm = f.intensity;
    w.intensity += (f.intensity - w.intensity) * 0.1;
    w.cloudCover = f.cover;
  };
  const timeSystem = {
    name: 'core.time',
    order: -80,
    fixedUpdate(_G, dt) {
      if (updateClock(G.clock, dt)) G.emit({ type: 'dayPassed' });
      if (mode !== 'macera') forceWeather(G.weatherSim);
      if (mode === 'macera') {
        updateWeather(G.weatherSim, dt, { temperature: env.temperature, rain: env.rainFloor, snow: env.snowFloor });
        forceWeather(G.weatherSim);
        tickAcc += dt;
        if (tickAcc >= 0.25) {
          const light = Math.max(
            Math.floor(render.lightAtEye.sky * 15 * render.skyState.skyLight),
            Math.floor(render.lightAtEye.block * 15),
          );
          G.emit(progressTickEvent(G.dim, G.body, tickAcc, light, isTorchKey(G.player.heldKey), env.biomeKey));
          tickAcc = 0;
        }
      }
    },
  };
  G.addSystem(player.system);
  G.addSystem(player.survivalSystem);
  G.addSystem(timeSystem);
  G.addSystem(player.postSystem);

  const extra = Array.isArray(opts.systems) ? opts.systems : [];
  for (let i = 0; i < extra.length; i++) G.addSystem(extra[i]);
  if (opts.standardSystems !== false) {
    const std = loadStandardSystems(G);
    for (let i = 0; i < std.length; i++) G.addSystem(std[i]);
  }

  /* ---- kare işlevi ---- */
  const events = [];
  let consecutiveErrors = 0;
  const tierWarmState = { dim: null };
  let destroyed = false;

  function runSystems(hook, dt, alpha) {
    const list = G.registry.list();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const fn = s[hook];
      if (typeof fn !== 'function') continue;
      // boyut geçişi boyunca sabit adımlar donar (fizik/girdi/saat/hayatta kalma); yalnız alwaysRun sistemler (dimension) çalışır
      if (hook === 'fixedUpdate' && G.simFrozen === true && s.alwaysRun !== true) continue;
      try {
        if (hook === 'fixedUpdate') fn.call(s, G, dt);
        else fn.call(s, G, dt, alpha);
      } catch (err) {
        if (G.opts.strictSystems) throw err;
        const key = s.name + '.' + hook;
        const n = (G._errCount[key] || 0) + 1;
        G._errCount[key] = n;
        if (n <= 3 && typeof console !== 'undefined' && console.error) console.error('[kesif] sistem hatası ' + key + ' (#' + n + '):', err);
      }
    }
  }

  function dispatchAction(a) {
    if (G.simFrozen === true && !(a && a.type === 'pause')) return; // geçiş sürerken girdi kilitli (panel/eylem açılmaz)
    ui.routeAction(a);
    const list = G.registry.list();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (typeof s.onAction !== 'function') continue;
      try {
        s.onAction(G, a);
      } catch (err) {
        if (G.opts.strictSystems) throw err;
        const key = s.name + '.onAction';
        const n = (G._errCount[key] || 0) + 1;
        G._errCount[key] = n;
        if (n <= 3 && typeof console !== 'undefined' && console.error) console.error('[kesif] sistem hatası ' + key + ' (#' + n + '):', err);
      }
    }
  }

  function fixedPass(dt) {
    G.time.tick++;
    G.time.seconds += dt;
    if (!G.player.dead) G.time.playTime += dt;
    runSystems('fixedUpdate', dt, 0);
  }

  function drainActions() {
    const ov = G.inputOverride;
    const list = ov && Array.isArray(ov.events) ? ov.events : (G.input ? G.input.consumeEvents() : null);
    if (!list || list.length === 0) return;
    events.length = 0;
    for (let i = 0; i < list.length; i++) events.push(list[i]);
    if (ov && Array.isArray(ov.events)) ov.events.length = 0;
    for (let i = 0; i < events.length; i++) dispatchAction(events[i]);
  }

  const view = { x: 0, y: 0, z: 0, yaw: 0 };
  const sunLit = { sky: 1, block: 0, sunDir: null };
  const envFx = {
    x: 0, y: 0, z: 0, underwater: false, lava: false, hurt: 0, heal: 0, boss: false, seal: 0,
    biomeKey: '', caveKey: '', underground: false,
  };

  // biyom girişi: kısa, düşük öncelikli duyuru (aynı biyom 25 sn içinde tekrar sınırda gidip gelinirse susar; ilk 8 sn dünya başlığına yer)
  const biomeShown = Object.create(null);
  function biomeBanner(e) {
    const t = G.time.playTime || 0;
    if (t < 8 || typeof G.banner !== 'function') return;
    const last = biomeShown[e.biomeKey];
    if (last !== undefined && t - last < 25) return;
    biomeShown[e.biomeKey] = t;
    G.banner(e.biomeName, e.zoneName, { key: 'biome:' + e.biomeKey, kind: 'info', duration: 2600, priority: 1 });
  }
  const caveSeen = Object.create(null);
  function caveBanner(e) {
    if (typeof G.banner !== 'function' || !e.caveKey || caveSeen[e.caveKey]) return;
    caveSeen[e.caveKey] = true;
    const cs = CAVE_STYLES.find((c) => c.key === e.caveKey);
    G.banner(e.caveName, cs && cs.hint ? cs.hint : '', { key: 'cave:' + e.caveKey, kind: 'info', duration: 3600, priority: 2 });
  }

  function frameBody(ms) {
    const tStart = nowMs();
    const dtSec = Math.min(ms, 250) / 1000;
    G.time.frame++;
    if (ms > 0) {
      frameStats.push(ms);
      if (!G.time.paused) {
        const q = G.sampler.sample(ms);
        if (q > 0) {
          const ch = G.quality.sample(q);
          if (ch) render.applyQuality(ch);
        }
      }
    }
    // boyut değişince (şehir sahnesi: prop/araç/yaya/gökdelen malzemeleri başka program çeşitleri taşır) kademe ısınması o sahne için yeniden planlanır (qa_gpu: şehirde ilk kademe geçişi 0,7–1,4 sn donuyordu)
    if (G.tierWarm) syncWarmDim(G.tierWarm, tierWarmState, G.dim);
    if (G.worldReady && G.tierWarm && !G.tierWarm.done && !G.time.paused) G.tierWarm.step(3); // kalite kademesi programlarının çizim ısınması (dilim ≤ 3 ms)
    player.pollInput(dtSec);
    drainActions();

    let steps = 0;
    const paused = G.time.paused;
    if (!paused && G.worldReady) steps = stepper.advance(ms);
    else stepper.reset();
    for (let i = 0; i < steps; i++) fixedPass(1 / 60);
    if (steps > 0) player.clearEdges();
    const alpha = paused ? 1 : stepper.alpha;
    const dt = paused ? 0 : dtSec;
    G.time.dt = dt;

    camRig.update(dt, alpha);
    const cs = camRig.state;
    const b = G.body;

    // çevre (≈4 Hz): bölge/biyom girişleri
    const ch = envSampler.update(dt, b.x, b.y, b.z, render.lightAtEye.skyRaw, render.skyState.dayFactor);
    env.underwater = cs.underwater;
    env.combat = G.hud.boss ? 1 : G.combatLevel;
    if (mode === 'macera' && G.dim === 'overworld') {
      if (ch.zone) G.emit({ type: 'zoneEnter', zone: env.zone, name: env.zoneName });
      if (ch.biome) {
        G.emit({ type: 'biomeEntered', biome: env.biomeKey, name: env.biomeName });
        biomeBanner(env);
      }
      if (ch.cave) caveBanner(env);
    }
    if (G._invDirty) {
      G._invDirty = false;
      G.emit({ type: 'inventoryChanged' });
    }

    hud.fill(dt, {
      env,
      fps: frameStats.fps,
      phase: clockPhase(G.clock),
      underwater: cs.underwater,
      weatherLabel: weatherLabel(G.weatherSim),
    });
    runSystems('frameUpdate', dt, alpha);

    // chunk yöneticisi (kamera son konumda)
    G.chunkManager.update(b, G.camera, G.quality.settings.tier === 'low' ? 3 : 4);

    envFx.x = cs.pos.x;
    envFx.y = cs.pos.y;
    envFx.z = cs.pos.z;
    envFx.underwater = cs.underwater;
    envFx.lava = cs.inLava;
    envFx.hurt = G.survival.hurtFlash;
    envFx.heal = player.healFlash;
    envFx.boss = !!G.hud.boss;
    const sd = G.chunkManager.getSealDistance();
    envFx.seal = Number.isFinite(sd) ? Math.max(0, Math.min(1, 1 - sd / 40)) * 0.8 : 0;
    envFx.biomeKey = env.biomeKey;
    envFx.caveKey = env.caveKey;
    envFx.underground = env.underground;
    render.frame(dt, envFx);
    ambTimer += dt;
    if (ambTimer >= 0.5) {
      ambTimer = 0;
      ambientParticlesFor(env, particleAmb);
      G.particles.setAmbient(particleAmb);
    }

    view.x = cs.pos.x;
    view.y = cs.pos.y;
    view.z = cs.pos.z;
    view.yaw = G.camera.rotation.y;
    audioApi.frame(dt, view, env);

    sunLit.sky = render.lightAtEye.sky * render.skyState.skyLight;
    sunLit.block = render.lightAtEye.block;
    sunLit.sunDir = render.fog.sunDir;
    player.frameVisuals(dt, sunLit);
    hud.publish(false);
    const tPre = nowMs();
    render.render(dt);
    const tEnd = nowMs();
    if (ms > 0) {
      cpuStats.push(tPre - tStart);
      renderStats.push(tEnd - tPre);
    }
  }

  function frame(ms) {
    if (destroyed || G.destroyed) return;
    try {
      frameBody(ms);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      if (typeof console !== 'undefined' && console.error) console.error('[kesif] kare hatası:', err);
      if (consecutiveErrors >= 5 || G.opts.strictSystems) {
        if (loop) loop.stop();
        if (typeof cb.onError === 'function') {
          try { cb.onError(err); } catch { /* yut */ }
        }
        if (G.opts.strictSystems) throw err;
      }
    }
  }
  loop = createGameLoop({ frame });

  /* ---- bağlam kaybı ---- */
  render.hooks.lost = () => {
    if (loop) loop.stop();
    // chunk mesh'lerini bağlam KAYIPKEN bırak: bağlam geri geldikten sonra eski geometrileri dispose etmek ~260 "object does not belong to this context" GL uyarısı üretiyordu (qa_gpu)
    try { if (G.chunkManager && typeof G.chunkManager.rebuildMeshes === 'function') G.chunkManager.rebuildMeshes(); } catch { /* yut */ }
    // aynı nedenle sahnedeki kalan geometri/toplu ağ GPU kayıtları da kayıpken bırakılır (dispose yalnız GPU'yu bırakır; sonraki çizim yeniden yükler)
    try { G.scene.traverse((o) => { if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose(); if (o.geometry && typeof o.geometry.dispose === 'function') o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (let i = 0; i < ms.length; i++) { const m = ms[i]; if (!m) continue; for (const k in m) { const t = m[k]; if (t && t.isTexture && t.image && !t.isRenderTargetTexture && typeof t.dispose === 'function') t.dispose(); } if (m.uniforms) for (const k in m.uniforms) { const t = m.uniforms[k] && m.uniforms[k].value; if (t && t.isTexture && t.image && !t.isRenderTargetTexture && typeof t.dispose === 'function') t.dispose(); } } }); } catch { /* yut */ }
    const err = new Error('Grafik bağlamı kayboldu; geri gelirse oyun devam edecek.');
    err.code = 'webgl_context_lost';
    err.recoverable = true;
    if (typeof cb.onError === 'function') {
      try { cb.onError(err); } catch { /* yut */ }
    }
  };
  render.hooks.restored = () => {
    if (destroyed) return;
    G.chunkManager.rebuildMeshes();
    loop.restartClock();
    stepper.reset();
    if (!G.destroyed) loop.start();
  };

  /* ---- otomatik duraklatma ---- */
  const autoPause = opts.autoPause !== false;
  const onVis = () => {
    if (!autoPause || destroyed) return;
    if (typeof document !== 'undefined' && document.hidden) ui.pause(true);
  };
  const onBlur = () => {
    if (!autoPause || destroyed || !loop.running) return;
    ui.pause(true);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
  if (typeof window !== 'undefined') window.addEventListener('blur', onBlur);
  track.disposers.push(() => {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    if (typeof window !== 'undefined') window.removeEventListener('blur', onBlur);
    if (loop) loop.stop();
  });

  /* ---- init + ilk chunk halkası ---- */
  G._initialized = true;
  const sysList = G.registry.list().slice();
  for (let i = 0; i < sysList.length; i++) {
    const s = sysList[i];
    if (typeof s.init !== 'function') continue;
    try {
      s.init(G);
    } catch (err) {
      if (G.opts.strictSystems) throw err;
      if (typeof console !== 'undefined' && console.error) console.error('[kesif] sistem init hatası ' + s.name + ':', err);
    }
  }

  camRig.update(0, 1);
  const loadStart = nowMs();
  // Yükleme çubuğu: ilk %15 sahne kurulumu (senkron, biter bitmez), kalan %85 ilk chunk halkası. callbacks.onProgress(0..1) tekrarsız çağrılır.
  let lastReported = -1;
  const reportProgress = (v) => {
    const p = Math.max(0, Math.min(1, v));
    G._loadProgress = p;
    if (typeof cb.onProgress === 'function' && Math.round(p * 100) !== lastReported) {
      lastReported = Math.round(p * 100);
      try { cb.onProgress(p); } catch { /* yut */ }
    }
  };
  reportProgress(0.15);
  // Karakter + eşya modeli shader'ları yükleme ekranında gerçekten çizilerek ısıtılır (ilk TP geçişi/ilk blok-meşale tutuşunda donma olmasın).
  // Adımlar döngü turlarına yayılır (çubuk çizilebilsin); bkz. gameWarm.js
  const warmSteps = createWarmSteps(G);
  G.warm = { ms: 0, steps: 0 };
  const warmOne = () => {
    const st = warmSteps.shift();
    if (!st) return;
    const r = st();
    G.warm.steps++;
    if (r && r.ms > 0) G.warm.ms += r.ms;
    if (G.warm.ms > 4000) warmSteps.length = 0; // yavaş (yazılım) GL: ısınma bütçesi aşıldı, kalanını bırak
  };
  // Diğer kalite kademelerinin shader programları da yükleme boşluğunda (≲ 6 ms dilimlerle) bağlatılır: ilk kademe geçişinde donma olmasın
  const tierWarm = createTierWarmer(G);
  G.tierWarm = tierWarm;
  const tierStep = () => {
    const r = tierWarm.step(6);
    if (!tierWarm.compiled) warmSteps.push(tierStep); // derleme geçişi yükleme ekranında; çizim geçişi kare döngüsünde (bkz. frameBody)
    return { ms: r.ms, what: 'kademe' };
  };
  warmSteps.push(tierStep);
  G.chunkManager.update(G.body, G.camera, 8);
  while (nowMs() - loadStart < 12000) {
    warmOne();
    G.chunkManager.update(G.body, G.camera, 8);
    const lp = G.chunkManager.getLoadProgress(2);
    reportProgress(0.15 + 0.85 * lp * (warmSteps.length > 0 ? 0.9 : 1));
    if ((lp >= 1 && warmSteps.length === 0) || aborted()) break;
    await sleep(16);
  }
  while (warmSteps.length > 0 && !aborted()) warmOne(); // süre doldu: kalan ısınma adımları yine de tamamlansın
  if (aborted()) {
    destroyApi();
    throw abortError();
  }
  reportProgress(1);
  G.worldReady = true;
  G.boot = {
    worldMs: Math.round(tWorld - tBoot0), renderMs: Math.round(tRender - tWorld), preloadMs: Math.round(nowMs() - loadStart), totalMs: Math.round(nowMs() - tBoot0),
  };
  G.player.heldKey = undefined;
  frame(0); // ilk kare: HUD, ışık, ses durumu
  hud.publish(true);
  // kayıt şehirde açıldıysa: overworld ve sistem durumları kurulduktan SONRA ekran kapalı şehre geçilir (hold + açılış)
  if (G.dimBoot && G.dimMgr && G.transition) {
    const bootDim = G.dimBoot;
    G.dimBoot = null;
    G.transition.startBoot({ to: bootDim.dim, reason: 'restore', arrival: bootDim.arrival });
  }

  let api;
  try {
    api = buildApi(G, {
      loop, ui, render, camRig, player, frameStats, cpuStats, renderStats, stepper, hud, audioApi, fixedPass, frameBody, dispatchAction,
      destroy: () => destroyApi(),
    });
  } catch (err) {
    destroyApi();
    throw fail('api_merge', String((err && err.message) || err), err);
  }

  function destroyApi() {
    if (destroyed) return;
    destroyed = true;
    track.done = true;
    // Çıkış kaydı sistemler sökülmeden ÖNCE yazılır: mobs/content dispose'tan sonra serialize boş döner ve son kaydı bozar.
    if (G.worldReady && !G.destroyed) {
      try { G.requestSave('exit'); } catch { /* yut */ }
    }
    G.destroyed = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    if (typeof window !== 'undefined') window.removeEventListener('blur', onBlur);
    loop.stop();
    const list = G.registry.list().slice().reverse();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (typeof s.dispose !== 'function') continue;
      try { s.dispose(G); } catch { /* yut */ }
    }
    hud.dispose();
    try { G.input.dispose(); } catch { /* yut */ }
    try { audioApi.dispose(); } catch { /* yut */ }
    try { G.viewModel.dispose(); } catch { /* yut */ }
    try { G.character.dispose(); } catch { /* yut */ }
    try { render.dispose(); } catch { /* yut */ }
    releaseHeldCache();
    try { G.world.dispose(); } catch { /* yut */ }
    G.registry.list().length = 0;
  }

  if (opts.autoStart !== false) loop.start();
  if (typeof cb.onReady === 'function') {
    try { cb.onReady(); } catch { /* yut */ }
  }
  return api;
}
