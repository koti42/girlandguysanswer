/*
 * KEŞİF blok sistemi — test düzeneği (yalnız testler içe aktarır; oyun yüklemez).
 *
 *   makeG(opts) → { G, sys, S, step(n, input?), aim(x,y,z), look(yaw,pitch), clearLog() }
 *     opts: { mode:'macera'|'insa'|'harita', held:'item:kazma_taş'|…, inv:[[item,count],…] }
 *   Düz dünya: y 1..38 taş, 39 toprak, 40 çimen; ana kaya y=0. Oyuncu (8.5, 41, 8.5) — göz 42,62.
 *   G sahte ama gerçek sim nesneleriyle (World, Inventory, survival, daynight); ses/parçacık/olay kaydı G.log'a düşer.
 */
import { B } from '../sim/blocks.js';
import { Chunk } from '../sim/chunk.js';
import { World } from '../sim/world.js';
import { Inventory, creativeInventory } from '../sim/inventory.js';
import { createSurvival } from '../sim/survival.js';
import { createPlayerBody } from '../sim/physics.js';
import { createClock } from '../sim/daynight.js';
import { createSystem } from './blocks.js';

export function flatGen(seed, cx, cz) {
  const c = new Chunk(cx, cz);
  for (let si = 0; si < 25; si++) c.fillSection(si, B.BEDROCK); // derin dünya: y < 0 tek tip ana kaya
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      c.set(x, 0, z, B.BEDROCK);
      for (let y = 1; y <= 38; y++) c.set(x, y, z, B.STONE);
      c.set(x, 39, z, B.DIRT);
      c.set(x, 40, z, B.GRASS);
    }
  }
  return c;
}

export function makeG(opts) {
  const o = opts || {};
  const mode = o.mode || 'macera';
  const world = mode === 'macera'
    ? new World({ seed: 12345, mode: 'macera', worldgen: flatGen })
    : new World({
      seed: 12345, mode, worldgen: flatGen, bounds: { minCx: 0, maxCx: 1, minCz: 0, maxCz: 1 },
    });
  for (let cx = -1; cx <= 2; cx++) for (let cz = -1; cz <= 2; cz++) world.ensureChunk(cx, cz);
  const log = [];
  const items = [];
  const hl = { hasTarget: false, ghostId: -1 };
  const G = {
    mode,
    world,
    seed: 12345,
    log,
    items,
    inventory: mode === 'insa' ? creativeInventory() : new Inventory(),
    survival: createSurvival({}),
    body: createPlayerBody(8.5, 41, 8.5),
    clock: createClock({ startPhase: 0.25 }),
    chests: new Map(),
    spawn: { x: 0, y: 41, z: 0 },
    abilities: { doubleJump: false, grapple: false, glide: false, portalGun: false },
    player: {
      yaw: 0, pitch: 0, dead: false, crouching: false, blocking: false, heldKey: null,
    },
    ui: 'none',
    time: {
      tick: 0, seconds: 0, paused: false, playTime: 0,
    },
    worldReady: true,
    accessibility: false,
    hud: { target: { block: null, name: null, progress: 0 }, hint: null },
    fpState: {
      breaking: false, eating: -1, bowCharge: 0, nocked: false,
    },
    charAction: null,
    inputState: {
      moveX: 0, moveZ: 0, jump: false, crouch: false, sprint: false, breakHeld: false, placeHeld: false, attackPressed: false, placePressed: false, interactPressed: false, touch: false,
    },
    look: { x: 0, y: 0, z: -1 },
    eye: { x: 8.5, y: 42.62, z: 8.5 },
    eyeSim: { x: 8.5, y: 42.62, z: 8.5 },
    em: {
      rng: { next: () => 0.5 },
      spawnItem(item, count, x, y, z, opts2) {
        items.push({
          item, count, x, y, z, opts: opts2,
        });
        return { item, count };
      },
      queryMobs: () => [],
    },
    particles: {
      blockBreak: (...a) => log.push(['particles.blockBreak', ...a]),
      blockDust: (...a) => log.push(['particles.blockDust', ...a]),
      pickup: (...a) => log.push(['particles.pickup', ...a]),
    },
    highlight: {
      state: hl,
      setTarget(h) { hl.hasTarget = !!h; hl.last = h ? { x: h.x, y: h.y, z: h.z } : null; log.push(['hl.target', h ? h.x : null]); },
      setBreakProgress(p) { hl.progress = p; },
      setPlacementGhost(id, pos, valid) { hl.ghostId = id === null || id === undefined ? -1 : id; hl.ghostPos = pos ? { x: pos.x, y: pos.y, z: pos.z } : null; hl.ghostValid = valid; },
    },
    viewModel: { swing: (k) => log.push(['swing', k]) },
    puzzles: null,
    progression: null,
    sound: (name, pos, op) => { log.push(['sound', name, op]); return null; },
    speak: (t) => log.push(['speak', t]),
    haptic: () => {},
    setUi(name) {
      const prev = G.ui;
      G.ui = name || 'none';
      G.emit({ type: 'uiChanged', ui: G.ui, prev });
      return G.ui;
    },
    emit(evt) {
      log.push(['event', evt.type, evt]);
      if (sys.onEvent) sys.onEvent(G, evt);
    },
    grantAbility(k) { G.abilities[k] = true; },
    _invDirty: false,
  };
  const sys = createSystem(G);
  sys.init(G);
  const S = G.blocks.state;
  if (o.inv) for (let i = 0; i < o.inv.length; i++) G.inventory.add(o.inv[i][0], o.inv[i][1]);
  if (o.held) {
    G.inventory.setSlot(0, o.held, 1);
    G.inventory.selected = 0;
  }

  function look(yaw, pitch) {
    G.player.yaw = yaw;
    G.player.pitch = pitch;
    // yaw 0 = −Z; + sola (physics.lookDir ile aynı kural)
    const cp = Math.cos(pitch);
    G.look.x = -Math.sin(yaw) * cp;
    G.look.y = Math.sin(pitch);
    G.look.z = -Math.cos(yaw) * cp;
  }
  function aim(x, y, z) {
    const dx = x + 0.5 - G.eyeSim.x;
    const dy = y + 0.5 - G.eyeSim.y;
    const dz = z + 0.5 - G.eyeSim.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    G.look.x = dx / l; G.look.y = dy / l; G.look.z = dz / l;
    G.eye.x = G.eyeSim.x; G.eye.y = G.eyeSim.y; G.eye.z = G.eyeSim.z;
  }
  function step(n, input) {
    const s = G.inputState;
    const edge = input ? { ...input } : {};
    for (let i = 0; i < n; i++) {
      s.breakHeld = !!(input && input.breakHeld);
      s.placeHeld = !!(input && input.placeHeld);
      s.crouch = !!(input && input.crouch);
      s.attackPressed = i === 0 && !!(input && input.attackPressed);
      s.placePressed = i === 0 && !!(input && input.placePressed);
      s.interactPressed = i === 0 && !!(input && input.interactPressed);
      s.touch = !!(input && input.touch);
      G.player.crouching = s.crouch;
      G.time.tick++;
      G.time.seconds += 1 / 60;
      sys.fixedUpdate(G, 1 / 60);
    }
    return edge;
  }
  function clearLog() {
    log.length = 0;
    items.length = 0;
  }
  look(0, 0);
  return {
    G, sys, S, step, aim, look, clearLog,
  };
}

/** Log yardımcıları. */
export function events(G, type) {
  return G.log.filter((e) => e[0] === 'event' && e[1] === type).map((e) => e[2]);
}
export function sounds(G, prefix) {
  return G.log.filter((e) => e[0] === 'sound' && (!prefix || String(e[1]).indexOf(prefix) === 0)).map((e) => e[1]);
}
