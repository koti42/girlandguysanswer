/*
 * KEŞİF tech sistemi — test düzeneği (yalnız testler içe aktarır; oyun yüklemez).
 *
 *   makeTechG(opts) → { G, T, sys, k, step(n, input?), place(x,y,z,id), fire(color) , jump(held) }
 *     opts: blocksTestKit.makeG seçenekleri + {mode}. Gerçek World/Inventory/survival/TechState; sahte render/ses (G.log).
 *   Düz dünya (blocksTestKit.flatGen): yüzey y=40 (çimen), oyuncu (8.5,41,8.5).
 *   step(n): blocks sistemi + tech.pre + gerçek fizik (stepPlayer) + tech sistemi (60 Hz).
 */
import { B } from '../sim/blocks.js';
import { resetBody, stepPlayer } from '../sim/physics.js';
import { applyTechMods } from '../sim/techMods.js';
import { createSystem as createBlocks } from './blocks.js';
import { makeG } from './blocksTestKit.js';
import { createSystem } from './tech.js';

export { B };

export function makeTechG(opts) {
  const o = opts || {};
  const k = makeG(o);
  const G = k.G;
  G.hud = Object.assign(G.hud, {
    parkour: null, energy: null, jetpack: null, charge: null, scanner: null, shield: null, portals: null,
  });
  G.mods = { thrust: 0, thrustVy: 0, digMul: 1, fallMul: 1, shield: 0 };
  G.hints = [];
  G.hint = (text, op) => { G.hints.push([text, op]); G.hud.hint = text; };
  G.banner = () => {};
  G.markDirty = () => {};
  G.getSystem = () => null;
  G.settings = {};
  G.weatherSim = { intensity: 0, renderKind: 'clear' };
  G.particles = new Proxy(G.particles, {
    get(t, name) {
      if (name in t) return t[name];
      return (...a) => { G.log.push(['particles.' + String(name), ...a]); };
    },
  });
  G.teleport = (x, y, z, op) => {
    resetBody(G.body, x, y, z);
    if (op && Number.isFinite(op.yaw)) G.player.yaw = op.yaw;
    if (op && Number.isFinite(op.pitch)) G.player.pitch = op.pitch;
    G.log.push(['teleport', x, y, z]);
    return { x, y, z };
  };
  G.puzzles = null;
  G.seedInput = 12345;
  const list = createSystem(G);
  const pre = list[0];
  const sys = list[1];
  const T = { pre, sys };
  const emit0 = G.emit;
  G.emit = (evt) => {
    emit0(evt);
    if (sys.onEvent) sys.onEvent(G, evt);
  };
  sys.init(G);
  const tech = G.tech;
  const pin = {
    moveX: 0, moveZ: 0, yaw: 0, jump: false, jumpPressed: false, sprint: false, crouch: false, glide: false, toggleFly: false, grapple: null, grappleRelease: false,
  };
  const pset = { mode: G.mode, autoJump: false, mods: G.mods };

  /** Bir sabit adım: tech.pre → fizik → blocks → tech. input: {jump, moveZ, moveX, crouch, sprint, …}. */
  function step(n, input) {
    for (let i = 0; i < n; i++) {
      pre.fixedUpdate(G, 1 / 60);
      const s = G.inputState;
      pin.moveX = input && input.moveX ? input.moveX : 0;
      pin.moveZ = input && input.moveZ ? input.moveZ : 0;
      pin.yaw = G.player.yaw;
      pin.jump = !!(input && input.jump);
      pin.jumpPressed = !!(input && input.jumpPressed && i === 0);
      pin.crouch = !!(input && input.crouch);
      pin.sprint = !!(input && input.sprint);
      s.moveX = pin.moveX; s.moveZ = pin.moveZ; s.jump = pin.jump; s.sprint = pin.sprint;
      if (input && input.physics !== false) {
        stepPlayer(G.body, pin, G.world, 1 / 60, G.abilities, pset);
        G.eyeSim.x = G.body.x; G.eyeSim.y = G.body.y + G.body.eyeH; G.eyeSim.z = G.body.z;
      }
      // sabit adımda mods: magic sistemi yok → applyTechMods'u doğrudan çağır (G.mods kimliğe sıfırlanıp yeniden kurulur)
      G.mods.thrust = 0; G.mods.thrustVy = 0; G.mods.digMul = 1; G.mods.fallMul = 1; G.mods.shield = 0;
      applyTechMods(G.mods, G.inventory);
      k.step(1, i === 0 ? input : Object.assign({}, input, { attackPressed: false, placePressed: false, interactPressed: false }));
      sys.fixedUpdate(G, 1 / 60);
      sys.frameUpdate(G, 1 / 60, 0);
      T.last = i;
    }
  }

  /** Oyuncuyu ışınlar (gövde + göz). */
  function moveTo(x, y, z) {
    resetBody(G.body, x, y, z);
    G.eyeSim.x = x; G.eyeSim.y = y + G.body.eyeH; G.eyeSim.z = z;
    G.eye.x = G.eyeSim.x; G.eye.y = G.eyeSim.y; G.eye.z = G.eyeSim.z;
  }

  function place(x, y, z, id) {
    return G.world.setBlock(x, y, z, id);
  }

  return {
    G, T, sys, k, tech, step, place, moveTo, pin, pset, createBlocks, aim: k.aim, look: k.look, clearLog: k.clearLog,
  };
}
