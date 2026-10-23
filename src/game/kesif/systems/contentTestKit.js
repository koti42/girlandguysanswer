/*
 * KEŞİF content sistemi — test düzeneği (yalnız testler içe aktarır): GERÇEK World + Progression + PuzzleManager + Inventory üzerinde
 * sahte bir G kurar. Tarayıcı/three yok.
 *
 *   makeContentG({seed, pos, mode}) → kit
 *     kit.G, kit.S (content durumu), kit.sys, kit.events (G.emit olayları), kit.sounds, kit.speaks, kit.teleports
 *     kit.init()                     content sistemini başlatır (G._initialized)
 *     kit.step(n)                    n sabit adım (tüm sistemlerin fixedUpdate'i, order sırasıyla) + her adımda frame(1/60)
 *     kit.load(x, z, r)              çevredeki chunk'ları üretir
 *     kit.tp(x, y, z)                gövdeyi taşır (+ bölgeyi doldurur)
 *     kit.emitted(type)              yayılan olaylar (tür süzgeci)
 *     kit.solveStructure(rec)        yapının tüm bulmacalarını çözülmüş say (yönetici iç API'si; yalnız test)
 *   anchorOf(seed, type, zone, nth) → yapı tanımı (çapa)
 */
import { createGameContext } from '../gameCtx.js';
import { World } from '../sim/world.js';
import { decorateChunk } from '../sim/structures.js';
import { getState } from '../sim/structuresLayout.js';
import { Inventory } from '../sim/inventory.js';
import { createSurvival } from '../sim/survival.js';
import { createPlayerBody, resetBody } from '../sim/physics.js';
import { createClock } from '../sim/daynight.js';
import { Progression } from '../sim/progression.js';
import { PuzzleManager } from '../sim/puzzles/index.js';
import { createSystem } from './content.js';

export function anchorOf(seed, type, zone, nth) {
  const list = getState(seed).anchorList.map((p) => p.pub).filter((p) => p.type === type && (zone === undefined || p.zone === zone));
  list.sort((a, b) => (a.id < b.id ? -1 : 1));
  return list[nth || 0] || null;
}

export function makeContentG(o) {
  const opt = o || {};
  const seed = opt.seed === undefined ? 12345 : opt.seed;
  const mode = opt.mode || 'macera';
  const events = [];
  const all = [];
  const G = createGameContext({ strictSystems: true, accessibility: !!opt.accessibility, callbacks: { onEvent: (e) => events.push(e) } }, { mode, seed });
  G.progression = new Progression(seed, { mode });
  G.world = new World({
    seed,
    mode,
    decorate: mode === 'macera' ? decorateChunk : undefined,
    zoneUnlocked: (i) => !!G.progression.zonesUnlocked[i],
  });
  const p0 = opt.pos || { x: 0, y: 70, z: 0 };
  G.body = createPlayerBody(p0.x, p0.y, p0.z);
  G.body.eyeH = 1.62;
  G.inventory = new Inventory();
  G.survival = createSurvival({});
  G.clock = createClock({});
  G.worldReady = true;
  G.puzzles = new PuzzleManager({ world: G.world, seed: G.world.seed, emit: (e) => G.emit(e), spawnEntity: () => null });
  const spawned = [];
  G.em = {
    items: new Map(),
    queryMobs: () => [],
    forEachMob: () => {},
    get: () => null,
    spawnItem: (item, count, x, y, z) => spawned.push({ item, count, x, y, z }),
  };
  const sounds = [];
  const speaks = [];
  const teleports = [];
  const banners = [];
  G.sound = (name, pos, op) => { sounds.push({ name, pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null, op }); };
  G.speak = (t) => { speaks.push(t); };
  G.haptic = () => {};
  G.setUi = (n) => { G.ui = n || 'none'; G.hud.ui = G.ui; };
  G.teleport = (x, y, z, op) => {
    teleports.push({ x, y, z, op: op || {} });
    resetBody(G.body, x, y, z);
    if (op && Number.isFinite(op.yaw)) G.player.yaw = op.yaw;
    return { x, y, z };
  };
  G.chunkManager = { getSealDistance: () => Infinity };
  G.spawn = { x: p0.x, y: p0.y, z: p0.z };
  G.addSystem({ name: 'rec', order: -1000, onEvent: (_G, e) => { all.push(e); } });
  const sys = createSystem(G);
  G.addSystem(sys);
  const S = sys.S;
  const kit = {
    G, S, sys, events, all, sounds, speaks, teleports, spawned, banners,
    api: null,
    init() {
      G._initialized = true;
      sys.init(G);
      kit.api = sys.api(G);
    },
    load(x, z, r) {
      const c0x = Math.floor((x - r) / 16);
      const c1x = Math.floor((x + r) / 16);
      const c0z = Math.floor((z - r) / 16);
      const c1z = Math.floor((z + r) / 16);
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) G.world.ensureChunk(cx, cz);
    },
    tp(x, y, z) {
      resetBody(G.body, x, y, z);
      G.eyeSim.x = x;
      G.eyeSim.y = y + 1.62;
      G.eyeSim.z = z;
    },
    step(n) {
      const list = G.registry.list();
      for (let i = 0; i < n; i++) {
        G.time.tick++;
        G.time.seconds += 1 / 60;
        G.time.playTime += 1 / 60;
        for (let k = 0; k < list.length; k++) if (typeof list[k].fixedUpdate === 'function') list[k].fixedUpdate(G, 1 / 60);
        for (let k = 0; k < list.length; k++) if (typeof list[k].frameUpdate === 'function') list[k].frameUpdate(G, 1 / 60, 0);
        G.inputState.attackPressed = false;
        G.inputState.placePressed = false;
        G.inputState.interactPressed = false;
      }
    },
    emitted(type) {
      return all.filter((e) => e.type === type);
    },
    solveStructure(rec) {
      const ids = rec.def.puzzles.map((q) => q.id);
      for (let i = 0; i < ids.length; i++) {
        if (!G.puzzles.has(ids[i])) G.puzzles.register(ids[i], rec.def.puzzles[i]);
        const e = G.puzzles._entries.get(ids[i]);
        G.puzzles._markSolved(e);
      }
    },
    use(x, y, z, item) {
      G.emit({
        type: 'blockUse', x, y, z, id: G.world.getBlock(x, y, z) || 0, item,
      });
    },
  };
  return kit;
}
