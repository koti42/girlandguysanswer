/*
 * KEŞİF — arayüz akışı: G.setUi (HUD ui + girdi + imleç kilidi + duraklatma), eylem yönlendirme, ayarlar.
 *
 *   installUi(G, deps) → { setUi, routeAction(a), setSettings(patch), pause(auto), resume(), toggle(name),
 *                          nextCameraMode(), setCameraMode(m) }
 *   deps: { loop, stepper, audioApi, camRig, render, hud }
 *   nextCameraMode(cur) → 'fp' → 'tp' → 'tpf' → 'fp'   (saf)
 *   uiForAction(action, mode, curUi, dead) → hedef ui adı | undefined (undefined = eylem ui'yi değiştirmez)   (saf; test edilir)
 *
 * Envanter ve Üret tek çalışma alanının iki sekmesidir: envanterdeyken R/Üret → Üret sekmesi, Üret'teyken E → Envanter sekmesi.
 * Kurallar: ölüyken yalnız 'dead'; menü/harita/günlük/zafer/dükkan açıkken sim durur (PAUSING_UI), envanter/üretim/inşa
 * paleti/sandık açıkken dünya akar ama girdi (hareket/bakış/eylem) kapanır. Esc: oyun → duraklat, panel → kapat,
 * duraklat → devam.
 */
import { PAUSING_UI } from './gameCtx.js';
import { HUD_UI_STATES } from './hudStore.js';

export function nextCameraMode(cur) {
  return cur === 'fp' ? 'tp' : cur === 'tp' ? 'tpf' : 'fp';
}

/** Eylem → hedef ui. 'none' = kapat. undefined = değiştirme. */
export function uiForAction(action, mode, curUi, dead) {
  if (dead) return undefined;
  const open = (name) => (curUi === name ? 'none' : curUi === 'none' ? name : undefined);
  switch (action) {
    case 'pause':
      return curUi === 'none' ? 'pause' : 'none';
    case 'inventory':
      if (mode === 'harita') return undefined;
      if (curUi === 'inventory' || curUi === 'build') return 'none';
      // Sandık / büyü masası / simya kazanı: E (envanter tuşu) paneli kapatır (alışılmış davranış; Esc de kapatır)
      if (curUi === 'chest' || curUi === 'enchant' || curUi === 'brew' || curUi === 'machine') return 'none';
      // Üret sekmesindeyken E: aynı çalışma alanının Envanter sekmesine geç (kapatmaz)
      if (curUi === 'crafting') return 'inventory';
      return curUi === 'none' ? (mode === 'insa' ? 'build' : 'inventory') : undefined;
    case 'craft':
      if (mode !== 'macera') return undefined;
      // Envanterdeyken R / Üret düğmesi: Üret sekmesine geç; Üret açıkken tekrar basınca kapanır
      if (curUi === 'inventory') return 'crafting';
      return open('crafting');
    case 'map':
      if (mode !== 'macera') return undefined;
      return open('map');
    case 'journal':
      if (mode !== 'macera') return undefined;
      return open('journal');
    default:
      return undefined;
  }
}

const OPEN_ACTION = {
  inventory: 'inventory', build: 'inventory', crafting: 'craft', craft: 'craft', map: 'map', journal: 'journal',
};
// Bir panel açıkken başka panele doğrudan geçilebilir (duraklatma/ölüm/zafer/dükkan hariç).
const SWITCHABLE = { inventory: true, crafting: true, build: true, map: true, journal: true, chest: true };

const INPUT_KEYS = ['sensitivity', 'invertY', 'leftHanded', 'joystickScale', 'joystickZone', 'crouchToggle', 'gyro', 'gyroSensitivity',
  'aimAssist', 'touchGestures', 'flyDoubleTap', 'haptics', 'lookAccel', 'lookSmoothing', 'gamepadDeadZone', 'gamepadSensitivity'];

export function installUi(G, deps) {
  const {
    loop, stepper, audioApi, camRig, render, hud,
  } = deps;
  let autoPausedFlag = false;
  let lastUi = 'none';

  function applyPauseState(next) {
    const wasPaused = G.time.paused;
    const pausing = PAUSING_UI[next] === true;
    G.time.paused = pausing;
    G.paused = pausing;
    if (pausing && !wasPaused) {
      stepper.reset();
      if (next === 'pause') audioApi.audio.suspend();
    } else if (!pausing && wasPaused) {
      stepper.reset();
      loop.restartClock();
      if (G.quality) G.quality.warmup(1500);
      if (G.sampler) G.sampler.rewarm(30);
      audioApi.audio.resume();
    } else if (pausing && wasPaused && next !== 'pause') {
      audioApi.audio.resume();
    }
  }

  function setUi(name) {
    let next = typeof name === 'string' && name !== '' && HUD_UI_STATES.indexOf(name) >= 0 ? name : 'none';
    if (G.player.dead && next !== 'dead' && next !== 'none') next = 'dead';
    if (G.player.dead && next === 'none') next = 'dead';
    if (!G.player.dead && next === 'dead') next = 'none';
    const prev = G.ui;
    if (next === prev) return prev;
    G.ui = next;
    G.hud.ui = next;
    if (G.input) {
      G.input.setGameplayEnabled(next === 'none');
      if (next === 'none') G.input.requestPointerLock();
      else G.input.releasePointerLock();
    }
    applyPauseState(next);
    if (next !== 'none') G.fpState.breaking = false;
    hud.publish(true);
    if (typeof G.callbacks.onUi === 'function') {
      try {
        G.callbacks.onUi({ open: next === 'none' ? null : next, prev });
      } catch (e) {
        if (G.opts.strictSystems) throw e;
      }
    }
    if (next === 'pause' && typeof G.callbacks.onPause === 'function') {
      try {
        G.callbacks.onPause({ auto: autoPausedFlag });
      } catch (e) {
        if (G.opts.strictSystems) throw e;
      }
    }
    autoPausedFlag = false;
    G.emit({ type: 'uiChanged', ui: next, prev });
    lastUi = next;
    return next;
  }

  function pause(auto) {
    if (G.ui === 'pause' || G.ui === 'dead' || G.destroyed) return false;
    autoPausedFlag = !!auto;
    setUi('pause');
    return true;
  }

  function resume() {
    if (G.ui === 'pause' || G.ui === 'map' || G.ui === 'journal') {
      setUi('none');
      return true;
    }
    return false;
  }

  function setCameraMode(m) {
    if (m !== 'fp' && m !== 'tp' && m !== 'tpf') return G.player.cameraMode;
    G.player.cameraMode = m;
    G.hud.cameraMode = m;
    G.sound('ui_click', undefined, { vol: 0.5 });
    return m;
  }

  function routeAction(a) {
    if (!a || typeof a.type !== 'string') return;
    if (a.type === 'camera') {
      if (G.ui === 'none' && !G.player.dead) setCameraMode(nextCameraMode(G.player.cameraMode));
      return;
    }
    // İmleç kilidi kaybı (kullanıcı Esc'e bastı): yalnız DURAKLATIR, asla geri açmaz (sayfa katmanı da aynı anda duraklatabilir).
    if (a.type === 'pause' && a.source === 'lock') {
      if (G.ui === 'none' && !G.player.dead) pause(false);
      return;
    }
    const target = uiForAction(a.type, G.mode, G.ui, G.player.dead);
    if (target !== undefined) {
      setUi(target);
      G.sound(target === 'none' ? 'ui_close' : 'ui_open', undefined, { vol: 0.5 });
    }
  }

  /**
   * Adıyla panel aç (api.openUi/openPanel/openJournal/openMap): 'inventory'|'build'|'crafting'|'craft'|'map'|'journal'|'pause'.
   * Oyun sırasında açar; başka bir PANEL açıksa ona geçer (menü/duraklatma açıkken değişmez; ölüyken hiçbir şey yapmaz).
   * Mod kuralları uiForAction ile aynıdır (ör. günlük/harita yalnız macera). Döner: o anki G.ui.
   */
  function open(name) {
    if (G.destroyed || G.player.dead || !G.worldReady) return G.ui;
    if (name === 'pause') {
      pause(false);
      return G.ui;
    }
    const act = OPEN_ACTION[name];
    if (!act) return G.ui;
    if (G.ui !== 'none' && !SWITCHABLE[G.ui]) return G.ui;
    const cur = G.ui;
    // Panelden panele geçiş: önce 'none' varsayarak hedefi bul.
    const target = uiForAction(act, G.mode, 'none', false);
    if (target === undefined || target === 'none' || target === cur) return G.ui;
    setUi(target);
    G.sound('ui_open', undefined, { vol: 0.5 });
    return G.ui;
  }

  function toggle(name) {
    const t = uiForAction(name, G.mode, G.ui, G.player.dead);
    if (t !== undefined) setUi(t);
    return G.ui;
  }

  function setSettings(patch) {
    if (!patch || typeof patch !== 'object') return G.settings;
    const s = G.settings;
    const keys = Object.keys(patch);
    for (let i = 0; i < keys.length; i++) s[keys[i]] = patch[keys[i]];
    if (G.input) {
      const ip = {};
      let any = false;
      for (let i = 0; i < INPUT_KEYS.length; i++) {
        const k = INPUT_KEYS[i];
        if (Object.prototype.hasOwnProperty.call(patch, k)) {
          ip[k] = patch[k];
          any = true;
        }
      }
      if (any) G.input.setSettings(ip);
    }
    if (patch.fov !== undefined) camRig.setBase(Number(patch.fov));
    if (patch.quality !== undefined && G.quality) {
      const ch = G.quality.setTier(patch.quality);
      if (ch) render.applyQuality(ch);
    }
    if (patch.viewDist !== undefined) render.setViewDist(Number(patch.viewDist));
    if (patch.easy !== undefined) {
      const easy = !!patch.easy || G.mode === 'harita';
      if (G.survival) G.survival.easy = easy;
      if (G.em && typeof G.em.setDifficulty === 'function') G.em.setDifficulty(easy ? 'easy' : 'normal');
    }
    if (patch.muted !== undefined) audioApi.audio.setMuted(!!patch.muted);
    if (patch.music !== undefined) audioApi.audio.setMusicEnabled(!!patch.music);
    if (patch.haptics !== undefined) G.haptics = !!patch.haptics;
    if (patch.accessibility !== undefined || patch.reducedMotion !== undefined) {
      if (patch.accessibility !== undefined) G.accessibility = !!patch.accessibility;
      if (patch.reducedMotion !== undefined) G.reducedMotion = !!patch.reducedMotion;
      render.setReducedMotion(G.reducedMotion || G.accessibility);
    }
    return s;
  }

  G.setUi = setUi;
  return {
    setUi, routeAction, setSettings, pause, resume, toggle, open, setCameraMode, nextCameraMode, get lastUi() { return lastUi; },
  };
}
