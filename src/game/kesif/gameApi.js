/*
 * KEŞİF — genel api (çekirdek yüzeyi) + sistem api'lerinin birleştirilmesi.
 *
 *   buildApi(G, d) → api       d: {loop, ui, render, camRig, player, frameStats, stepper, hud, audioApi, fixedPass, frameBody, destroy}
 *
 * Çekirdek yöntemleri: start, pause, resume, destroy, setMuted, setMusicEnabled, setAvatar, setCosmetics, setSettings, setCameraMode,
 * teleportToSpawn, getStats, getLoadProgress, closeUi, toggleInventory, toggleCrafting, openMenu, screenshot, getPose;
 * özellikler: input (createKesifInput örneği — TouchControls/joystick için), hudStore (createHudStore), mode, worldCode, seed;
 * api._debug() (yalnız geliştirme/debug). Yedek (SOFT_API) olarak selectHotbar, respawn, getWorldCode, markRewardClaimed da vardır; oturum sistemi aynı adı
 * verirse onunki geçerli olur. Sistemler kalanını verir (getInventorySnapshot, craft, save, exportMap, …); aynı adı iki sistem (ya da
 * sistem ve çekirdek) verirse createKesifGame hata fırlatır.
 *
 *   fitSize(w, h, maxW) → {w,h}                  kapak küçük resim boyutu (16:9'a kırpılır)   (saf)
 *   jpegUnder(draw, limit) → dataURL              kalite/boyut düşürerek ≤ limit karakter     (DOM)
 */
import { buildDebug } from './gameDebug.js';

/** Çekirdeğin yedek olarak verdiği api adları (sistem aynı adı verirse sistem kazanır). */
export const SOFT_API = Object.freeze(['selectHotbar', 'respawn', 'getWorldCode', 'markRewardClaimed']);

export function fitSize(w, h, maxW) {
  const tw = Math.min(maxW, w);
  const th = Math.round((tw * 9) / 16);
  return { w: Math.max(16, Math.round(tw)), h: Math.max(9, th) };
}

const SHOT_LIMIT = 30 * 1024;
const SHOT_SIZES = [[320, 0.74], [256, 0.7], [224, 0.6], [192, 0.55], [160, 0.5], [128, 0.45]];

/** Ekran görüntüsü: canvas'tan 16:9 orta kırpma, boyut/kalite basamaklarıyla ≤ 30 KB (veri-URL uzunluğu). */
export function takeScreenshot(canvas) {
  if (typeof document === 'undefined' || !canvas) return '';
  const sw = canvas.width;
  const sh = canvas.height;
  if (!(sw > 0 && sh > 0)) return '';
  // kaynak: 16:9 orta kırpma
  let cw = sw;
  let ch = Math.round((sw * 9) / 16);
  if (ch > sh) {
    ch = sh;
    cw = Math.round((sh * 16) / 9);
  }
  const cx = Math.floor((sw - cw) / 2);
  const cy = Math.floor((sh - ch) / 2);
  const out = document.createElement('canvas');
  let best = '';
  for (let i = 0; i < SHOT_SIZES.length; i++) {
    const size = fitSize(cw, ch, SHOT_SIZES[i][0]);
    out.width = size.w;
    out.height = size.h;
    const c2 = out.getContext('2d');
    if (!c2) return '';
    c2.imageSmoothingEnabled = true;
    c2.imageSmoothingQuality = 'high';
    c2.drawImage(canvas, cx, cy, cw, ch, 0, 0, size.w, size.h);
    best = out.toDataURL('image/jpeg', SHOT_SIZES[i][1]);
    if (best.length <= SHOT_LIMIT) return best;
  }
  return best;
}

export function buildApi(G, d) {
  const { ui, render, frameStats } = d;
  const api = {
    start() {
      if (G.destroyed || d.loop.running) return false;
      d.loop.start();
      return true;
    },
    pause() {
      return ui.pause(false);
    },
    resume() {
      return ui.resume();
    },
    destroy() {
      d.destroy();
    },
    setMuted(b) {
      G.settings.muted = !!b;
      G.audio.setMuted(!!b);
    },
    setMusicEnabled(b) {
      G.settings.music = !!b;
      G.audio.setMusicEnabled(!!b);
    },
    setAvatar(cfg) {
      if (G.destroyed) return;
      G.character.setConfig(cfg);
      G.viewModel.setSkin(cfg);
    },
    /**
     * Keşif mağaza görünümlerini (loadout: {portal,alet,asa,jet,arac,gecis}: anahtar|null) canlı uygular; dünya yeniden kurulmaz.
     * Bozuk/bilinmeyen/null → varsayılan görünüm. o.preview: küçük 'gecis' önizleme efekti. Yalnız görsel; sim/kayıt etkilenmez. → true: görünüm değişti.
     */
    setCosmetics(loadout, o) {
      if (G.destroyed || !G.cosmetics) return false;
      return G.cosmetics.set(loadout, o);
    },
    setSettings(p) {
      return ui.setSettings(p);
    },
    setCameraMode(m) {
      return ui.setCameraMode(m);
    },
    teleportToSpawn() {
      const s = G.spawn;
      return d.player.teleport(s.x, s.y, s.z, { maxR: 8 });
    },
    getLoadProgress() {
      return G.worldReady ? 1 : (G._loadProgress || 0);
    },
    closeUi() {
      if (G.ui !== 'none' && !G.player.dead) ui.setUi(null);
      return G.ui;
    },
    toggleInventory() {
      return ui.toggle('inventory');
    },
    toggleCrafting() {
      return ui.toggle('craft');
    },
    /** Adıyla panel aç: 'inventory'|'build'|'crafting'|'map'|'journal'|'pause' → o anki ui adı (oyun sırasında; mod kurallarına tabi). */
    openUi(name) {
      return ui.open(String(name));
    },
    openPanel(name) {
      return ui.open(String(name));
    },
    openJournal() {
      return ui.open('journal');
    },
    openMap() {
      return ui.open('map');
    },
    openInventory() {
      return ui.open('inventory');
    },
    openCrafting() {
      return ui.open('crafting');
    },
    openMenu() {
      ui.pause(false);
      return G.ui;
    },
    screenshot() {
      if (G.destroyed) return '';
      try {
        render.render(0);
        return takeScreenshot(G.renderer.domElement);
      } catch {
        return '';
      }
    },
    /** Küçük ve ucuz poz: HUD mini haritası için. */
    getPose() {
      const b = G.body;
      return { x: b.x, y: b.y, z: b.z, yaw: G.player.yaw };
    },
    getStats() {
      const cm = G.chunkManager.getStats();
      const mem = typeof performance !== 'undefined' && performance.memory ? performance.memory.usedJSHeapSize : 0;
      const info = G.renderer.info;
      const pg = G.progression ? G.progression.summary() : null;
      return {
        fps: frameStats.fps,
        frameMs: Math.round(frameStats.avgMs * 10) / 10,
        worstMs: Math.round(frameStats.worstMs),
        spikes: frameStats.spikes,
        cpuMs: Math.round(d.cpuStats.avgMs * 10) / 10,
        cpuWorstMs: Math.round(d.cpuStats.worstMs),
        cpuSpikes: d.cpuStats.spikes,
        renderMs: Math.round(d.renderStats.avgMs * 10) / 10,
        frames: frameStats.frames,
        droppedSteps: d.stepper.dropped,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        chunksLoaded: cm.chunksLoaded,
        chunksMeshed: cm.chunksMeshed,
        chunksVisible: cm.chunksVisible,
        genQueue: cm.genQueue,
        meshQueue: cm.meshQueue,
        workerMode: cm.workerMode,
        viewDist: render.viewDist,
        tier: G.quality.settings.tier,
        effTier: G.quality.settings.effTier,
        pixelRatio: G.quality.settings.pixelRatio,
        post: G.postfx.enabled,
        mode: G.mode,
        tick: G.time.tick,
        playTime: Math.round(G.time.playTime),
        paused: G.time.paused,
        ui: G.ui,
        heapBytes: mem,
        sealDistance: cm.sealDistance,
        viewCut: d.render.viewCut,
        drawScale: d.render.drawScale,
        boot: G.boot || null,
        // oyun istatistikleri (oturum sonuç/zafer ekranları okur)
        zone: G.hud.zone.id,
        puzzlesSolved: pg ? pg.puzzlesSolved : 0,
        crystals: pg ? pg.crystalsCollected : 0,
        achievements: G.progression ? G.progression.achievements.length : 0,
        bossesDefeated: G.progression ? Object.keys(G.progression.bossesDefeated).length : 0,
        mobsKilled: pg ? pg.mobsKilled : 0,
        blocksBroken: pg ? pg.blocksBroken : 0,
        blocksPlaced: pg ? pg.blocksPlaced : 0,
        distance: pg ? pg.distance : 0,
        deaths: pg ? pg.deaths : 0,
        xp: pg ? pg.xp : 0,
        level: pg ? pg.level : 0,
      };
    },
  };
  Object.defineProperty(api, 'input', { get: () => G.input, enumerable: true });
  Object.defineProperty(api, 'hudStore', { get: () => G.hudStore, enumerable: true });
  Object.defineProperty(api, 'mode', { get: () => G.mode, enumerable: true });
  Object.defineProperty(api, 'seed', { get: () => G.seed, enumerable: true });
  Object.defineProperty(api, 'worldCode', { get: () => G.worldCode, enumerable: true });
  // api._debug YALNIZ geliştirme derlemesinde (Vite DEV; üretimde sabit false → dal ve buildDebug pakete girmez). G.debug zaten DEV'e bağlıdır.
  const dev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
  if (dev) {
    api._debug = () => buildDebug(G, d);
  }
  // Yedek (soft) yöntemler: oturum sistemi aynı adı verirse sistem kazanır (çakışma hatası yok).
  api.selectHotbar = (i) => {
    if (G.inventory && Number.isFinite(i)) G.inventory.selected = i;
  };
  api.respawn = () => (G.player.dead ? d.player.respawn('manual') : false);
  api.getWorldCode = () => G.worldCode;
  api.markRewardClaimed = (key) => (G.progression && typeof G.progression.markClaimed === 'function' ? G.progression.markClaimed(key) : false);
  d.api = api;
  // sistemlerin api'lerini birleştir (çakışma = hata)
  G.registry.mergeApi(api, G, (sys, fn) => {
    try {
      return fn();
    } catch (err) {
      if (G.opts.strictSystems) throw err;
      if (typeof console !== 'undefined' && console.error) console.error('[kesif] api hatası ' + sys.name + ':', err);
      return null;
    }
  }, SOFT_API);
  return api;
}
