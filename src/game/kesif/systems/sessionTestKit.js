/*
 * KEŞİF oturum testleri için "gerçek G benzeri" bağlam (render/DOM yok): gerçek dünya, envanter, hayatta kalma, saat, ilerleme,
 * bulmaca/varlık yöneticileri ve sistem kaydı; yalnızca render/ses/girdi sahte. Üretim koduna dahil edilmez (yalnız testler içe aktarır).
 *
 *   makeTestG({mode, seed, mapData, base, save, callbacks, opts}) → G
 *   stepSystems(G, n, dt?)      kayıtlı sistemlerin fixedUpdate'ini n kez çalıştırır (time.tick artar)
 *   frame(G, dt?)               kayıtlı sistemlerin frameUpdate'ini bir kez çalıştırır
 *   boot(G, systems)            sistemleri ekler + init + worldReady
 */
import { createGameContext } from '../gameCtx.js';
import { createModeWorld } from '../gameWorld.js';
import { buildSim, createProgressionFor } from '../gameSim.js';
import { createHudStore } from '../hudStore.js';
import { resetBody } from '../sim/physics.js';

export function makeTestG(o) {
  const opt = o || {};
  const mode = opt.mode || 'macera';
  const progRef = { p: null };
  const info = createModeWorld({
    mode,
    seed: opt.seed === undefined ? 'ABCD1234' : opt.seed,
    mapData: opt.mapData,
    base: opt.base,
    zoneUnlocked: (i) => !!(progRef.p && progRef.p.zonesUnlocked[i]),
  });
  const cbs = Object.assign({}, opt.callbacks || {});
  const G = createGameContext(Object.assign({
    strictSystems: true, callbacks: cbs, save: opt.save, mapData: opt.mapData, base: opt.base,
  }, opt.opts || {}), { mode, seed: info.seed, worldCode: info.worldCode });
  G.world = info.world;
  G.seedInput = info.seedInput;
  G.mapMeta = info.mapMeta;
  G.settings = {};
  G.progression = createProgressionFor(info.seed, mode);
  progRef.p = G.progression;
  buildSim(G, {
    world: info.world, spawn: info.spawn, phase: info.phase, frozenClock: info.frozenClock, seed: info.seed, mode, progression: G.progression,
  });
  G.player.yaw = info.yaw;
  G.scratch = { v1: { x: 0, y: 0, z: 0 }, v2: { x: 0, y: 0, z: 0 }, v3: { x: 0, y: 0, z: 0 } };
  G.hudStore = createHudStore();
  G.published = [];
  G.publishHud = (immediate) => {
    G.published.push(!!immediate);
    G.hudStore.set(G.hud);
  };
  G.markDirty = () => {};
  G.requestSave = (reason) => {
    for (let i = 0; i < G.saveHooks.length; i++) G.saveHooks[i](reason || 'manual');
  };
  G.sounds = [];
  G.sound = (name, pos, op) => { G.sounds.push({ name, vol: op && op.vol }); };
  G.spoken = [];
  G.speak = (t) => { G.spoken.push(t); };
  G.teleport = (x, y, z, op) => {
    resetBody(G.body, x, y, z);
    if (op && Number.isFinite(op.yaw)) G.player.yaw = op.yaw;
    if (op && Number.isFinite(op.pitch)) G.player.pitch = op.pitch;
    return { x, y, z };
  };
  G.setUi = (name) => {
    const next = name || 'none';
    const prev = G.ui;
    if (prev === next) return prev;
    G.ui = next;
    G.hud.ui = next;
    G.time.paused = next === 'pause' || next === 'map' || next === 'journal' || next === 'victory';
    G.emit({ type: 'uiChanged', ui: next, prev });
    return next;
  };
  return G;
}

export function boot(G, systems) {
  const list = Array.isArray(systems) ? systems : [systems];
  for (let i = 0; i < list.length; i++) G.addSystem(list[i]);
  G._initialized = true;
  const sl = G.registry.list().slice();
  for (let i = 0; i < sl.length; i++) if (typeof sl[i].init === 'function') sl[i].init(G);
  G.worldReady = true;
  return G;
}

export function stepSystems(G, n, dt) {
  const h = dt || 1 / 60;
  const list = G.registry.list();
  for (let k = 0; k < n; k++) {
    G.time.tick++;
    G.time.seconds += h;
    if (!G.player.dead) G.time.playTime += h;
    for (let i = 0; i < list.length; i++) if (typeof list[i].fixedUpdate === 'function') list[i].fixedUpdate(G, h);
  }
}

export function frame(G, dt) {
  const h = dt === undefined ? 1 / 60 : dt;
  G.time.frame++;
  const list = G.registry.list();
  for (let i = 0; i < list.length; i++) if (typeof list[i].frameUpdate === 'function') list[i].frameUpdate(G, h, 1);
}
