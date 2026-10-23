/*
 * KEŞİF mobs sistemi — test düzeneği (yalnız testler içe aktarır; oyun yüklemez).
 *
 *   makeMobsG(opts) → { G, log, sys: {combat, main}, step(n, input?), look(yaw,pitch), frame(dt, alpha), mobAt(dist, type, off?) }
 *     opts: { mode, held, inv:[[item,n]], render:true (THREE sahne + parçacık kaydı), easy }
 *   Düz dünya (y 1..38 taş, 39 toprak, 40 çimen; ayak y=41). Oyuncu (8.5, 41, 8.5), bakış −Z.
 *   G sahte ama gerçek sim nesneleriyle (World, EntityManager, Spawner, Inventory, survival, daynight); ses/parçacık/olaylar log'a düşer.
 */
import * as THREE from 'three';
import { B } from '../sim/blocks.js';
import { Chunk } from '../sim/chunk.js';
import { World } from '../sim/world.js';
import { Inventory, creativeInventory } from '../sim/inventory.js';
import { createSurvival } from '../sim/survival.js';
import { createPlayerBody } from '../sim/physics.js';
import { createClock } from '../sim/daynight.js';
import { createCombatState } from '../sim/combat.js';
import { EntityManager } from '../sim/entities.js';
import { Spawner } from '../sim/spawner.js';
import { createSystems } from './mobs.js';

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

export function recorder(log, prefix) {
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      return (...a) => { log.push([prefix + '.' + String(k), ...a]); };
    },
  });
}

export function makeMobsG(opts) {
  const o = opts || {};
  const mode = o.mode || 'macera';
  const world = new World({ seed: 777, mode, worldgen: flatGen });
  for (let cx = -3; cx <= 4; cx++) for (let cz = -3; cz <= 4; cz++) world.ensureChunk(cx, cz);
  const log = [];
  const speaks = [];
  const sounds = [];
  const events = [];
  const survival = createSurvival({ easy: !!o.easy });
  const body = createPlayerBody(8.5, 41, 8.5);
  body.eyeH = 1.62;
  body.dead = false;
  const G = {
    THREE,
    opts: {},
    mode,
    seed: 777,
    world,
    log,
    speaks,
    sounds,
    events,
    inventory: mode === 'insa' ? creativeInventory() : new Inventory(),
    survival,
    body,
    // day: 8 → 'ilk gece adaleti' (sim/earlyGame.js) kapalı; diğer testlerin hasar/doğma sayıları taban kurallarla ölçülür
    clock: createClock({ startPhase: 0.25, frozen: true, day: 8 }),
    combat: createCombatState(),
    abilities: {
      doubleJump: false, grapple: false, glide: false, portalGun: false,
    },
    player: {
      yaw: 0, pitch: 0, dead: false, crouching: false, blocking: false, heldKey: null, cameraMode: 'fp',
    },
    ui: 'none',
    time: {
      tick: 0, seconds: 0, dt: 0, frame: 0, paused: false, playTime: 0,
    },
    worldReady: true,
    reducedMotion: false,
    accessibility: false,
    settings: {},
    hud: { boss: null, target: { block: null, name: null, progress: 0 } },
    fpState: {
      breaking: false, eating: -1, bowCharge: 0, nocked: false,
    },
    charAction: null,
    combatLevel: 0,
    inputState: {
      moveX: 0, moveZ: 0, jump: false, crouch: false, sprint: false, breakHeld: false, placeHeld: false, attackPressed: false, placePressed: false, interactPressed: false, touch: false, aimAssist: 0,
    },
    look: { x: 0, y: 0, z: -1 },
    eye: { x: 8.5, y: 42.62, z: 8.5 },
    eyeSim: { x: 8.5, y: 42.62, z: 8.5 },
    spawn: { x: 8.5, y: 41, z: 8.5 },
    _rs: {
      px: 8.5, py: 41, pz: 8.5, peh: 1.62,
    },
    progression: { bossesDefeated: {}, abilities: {} },
    puzzles: { calls: [], handleInteract(e) { this.calls.push(e); return false; } },
    viewModel: { swing: (k) => log.push(['swing', k]) },
    particles: recorder(log, 'particles'),
    sound: (name, pos, op) => { sounds.push([name, pos ? { x: pos.x, y: pos.y, z: pos.z } : null, op]); return null; },
    speak: (t) => { speaks.push(t); },
    haptic: (s) => log.push(['haptic', s]),
    setUi(name) { G.ui = name || 'none'; return G.ui; },
    getSystem(name) { return name === 'mobs' ? sysMain : name === 'mobs.combat' ? sysCombat : null; },
    respawnPlayer(reason) {
      G.player.dead = false;
      body.x = G.spawn.x; body.y = G.spawn.y; body.z = G.spawn.z;
      survival.dead = false;
      survival.hp = survival.maxHp;
      G.emit({ type: 'respawn', reason });
      return true;
    },
    emit(evt) {
      events.push(evt);
      sysCombat.onEvent && sysCombat.onEvent(G, evt);
      sysMain.onEvent(G, evt);
    },
  };
  if (o.render) {
    G.camera = new THREE.PerspectiveCamera(70, 1.7, 0.06, 300);
    G.camera.position.set(8.5, 42.62, 8.5);
    G.scene = new THREE.Scene();
    G.scene.add(G.camera);
    G.entityRoot = new THREE.Group();
    G.scene.add(G.entityRoot);
    G.quality = { settings: { tier: 'low', effTier: 'low' } };
  } else {
    G.entityRoot = new THREE.Group();
    G.camera = new THREE.PerspectiveCamera(70, 1.7, 0.06, 300);
    G.camera.position.set(8.5, 42.62, 8.5);
  }
  G.em = new EntityManager({
    seed: 777, world, emit: (e) => G.emit(e), difficulty: o.easy ? 'easy' : 'normal',
  });
  G.spawner = new Spawner({ seed: 777, world, em: G.em });
  const [sysCombat, sysMain] = createSystems(G);
  // sistem sırası: combat (−60) sonra main (40)
  sysMain.init(G);
  if (o.held) {
    G.inventory.setSlot(0, o.held, 1);
    G.inventory.selected = 0;
  }
  if (o.inv) for (let i = 0; i < o.inv.length; i++) G.inventory.add(o.inv[i][0], o.inv[i][1]);

  function look(yaw, pitch) {
    G.player.yaw = yaw;
    G.player.pitch = pitch;
    const cp = Math.cos(pitch);
    G.look.x = -Math.sin(yaw) * cp;
    G.look.y = Math.sin(pitch);
    G.look.z = -Math.cos(yaw) * cp;
  }
  /** n sabit adım; input: inputState'e yazılan alanlar (kenarlar yalnızca ilk adımda). */
  function step(n, input) {
    const s = G.inputState;
    for (let i = 0; i < n; i++) {
      G.time.tick++;
      G.time.seconds += 1 / 60;
      s.breakHeld = !!(input && input.breakHeld);
      s.placeHeld = !!(input && input.placeHeld);
      s.attackPressed = i === 0 && !!(input && input.attackPressed);
      s.placePressed = i === 0 && !!(input && input.placePressed);
      sysCombat.fixedUpdate(G, 1 / 60);
      sysMain.fixedUpdate(G, 1 / 60);
    }
  }
  function frame(dt, alpha) {
    G.time.frame++;
    sysMain.frameUpdate(G, dt === undefined ? 1 / 60 : dt, alpha === undefined ? 1 : alpha);
  }
  /** Oyuncunun önünde (−Z) dist blok uzağa yaratık koyar (ayak y=41). */
  function mobAt(dist, type, off) {
    const e = G.em.spawn(type || 'golge', body.x + (off || 0), 41, body.z - dist, {});
    e.persistent = true;
    G.em.update(0.0001, body, { dayFactor: 1 });
    return e;
  }
  look(0, 0);
  return {
    G, log, sys: { combat: sysCombat, main: sysMain }, step, look, frame, mobAt,
  };
}
