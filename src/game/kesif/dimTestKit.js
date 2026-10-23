/*
 * KEŞİF — boyut çalışma zamanı test düzeneği (yalnız testler içe aktarır; oyun yüklemez).
 *
 *   makeDimG(opts) → kit {G, mgr, render, cms, now, step(n), frame(dt, n), hints, banners, saves, run(sec, opts)}
 *       opts: {seed, systems:['blocks','tech','magic','treefall','content','props','mobs','dimension'], reduced, quality, render:true (THREE sahne/kamera/kökler: mobs + gerçek kapı görseli + tech görselleri)}
 *   Gerçek World/Inventory/survival/TechState/PuzzleManager/EntityManager (şehir üreticisi gerçek: sim/city/cityGen); sahte render
 *   (ChunkManager yerine kayıtlı sahte yönetici: havuz devri, epoch, hazır durumu), sahte postfx/ses/parçacık. strictSystems açık: sistem hatası fırlatır;
 *   retire() test ortamında 'throw' modundadır → bayat dünya erişimi testi kırar.
 *   fakeManager(world, o) → {…ChunkManager yüzeyi}   fakePool(id) → {id, attached, reinit[], dispose()}
 */
import * as THREE from 'three';
import { makeTestG } from './systems/sessionTestKit.js';
import { createMaterialUniforms } from './render/materials.js';
import createMobs from './systems/mobs.js';
import { createDimensionManager } from './gameDimension.js';
import { createSystem as createDimension } from './systems/dimension.js';
import { createSystem as createBlocks } from './systems/blocks.js';
import { createSystem as createTech } from './systems/tech.js';
import { createSystem as createMagic } from './systems/magic.js';
import { createSystem as createTreefall } from './systems/treefall.js';
import { createSystem as createContent } from './systems/content.js';
import { createSystem as createProps } from './systems/props.js';
import { createSystems as createSession } from './systems/session.js';
import { resetBody } from './sim/physics.js';

function fakeCanvas() {
  const state = { font: '' };
  const ctx = {
    set font(v) { state.font = v; },
    get font() { return state.font; },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, fillText() {},
    measureText(t) {
      const m = /(d+(?:.d+)?)px/.exec(state.font);
      return { width: t.length * (m ? parseFloat(m[1]) : 10) * 0.56 };
    },
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

export function fakePool(id) {
  const p = {
    id,
    attached: null,
    reinits: [],
    disposed: false,
    attach(h) { p.attached = h; },
    detach() { p.attached = null; },
    reinit(m) { p.reinits.push(m); },
    dispose() { p.disposed = true; },
    get alive() { return p.disposed ? 0 : 1; },
  };
  return p;
}

let POOL_SEQ = 0;
let EPOCH = 0;

export function fakeManager(world, o) {
  const opts = o || {};
  const m = {
    world,
    epoch: ++EPOCH,
    pool: opts.pool || (opts.workerCount ? fakePool(++POOL_SEQ) : null),
    ownPool: !opts.pool,
    hidden: opts.hidden === true,
    disposed: false,
    updates: [],
    progress: 1,
    ready: true,
    viewDist: opts.viewDist || 7,
    adopted: [],
    update(pos) { m.updates.push({ x: pos.x, y: pos.y, z: pos.z }); },
    readiness() { return { ready: m.ready, progress: m.progress }; },
    getViewDist() { return m.viewDist; },
    setViewDist(n) { m.viewDist = n; },
    setHidden(b) { m.hidden = !!b; },
    adoptPool(p) {
      if (m.pool && m.pool !== p) m.pool.dispose();
      m.pool = p;
      m.ownPool = false;
      m.adopted.push(p.id);
      p.reinit({ t: 'init', ep: m.epoch });
      return true;
    },
    dispose(d) {
      m.disposed = true;
      const keep = d && d.keepPool === true;
      let kept = null;
      if (m.pool) {
        if (keep) kept = m.pool;
        else m.pool.dispose();
      }
      m.pool = null;
      return kept;
    },
    info() {
      return { epoch: m.epoch, workers: m.pool ? 1 : 0, hasPool: !!m.pool, hidden: m.hidden };
    },
    getStats() { return { triangles: 0, drawCalls: 0 }; },
    getSealDistance() { return Infinity; },
    rebuildMeshes() {},
  };
  return m;
}

export function makeDimG(o) {
  const opt = o || {};
  const G = makeTestG({ mode: 'macera', seed: opt.seed === undefined ? 'ABCD1234' : opt.seed, opts: { debug: true } });
  const hints = [];
  const banners = [];
  const saves = [];
  G.hint = (text, op) => { hints.push({ text, op }); G.hud.hint = text; };
  G.banner = (text, sub, op) => { banners.push({ text, sub, op }); };
  G.markDirty = () => {};
  G.settings = Object.assign({}, G.settings, { easy: false });
  G.hud = Object.assign(G.hud, { parkour: null, portals: null, underwater: false });
  G.postfx = { effects: [], setEffects(e) { G.postfx.effects.push(Object.assign({}, e)); G.postfx.last = Object.assign(G.postfx.last || {}, e); } };
  G.reducedMotion = !!opt.reduced;
  G.particles = new Proxy({ cleared: 0, clear() { this.cleared++; } }, {
    get(t, name) {
      if (name in t) return t[name];
      return () => {};
    },
  });
  G.mods = { thrust: 0, thrustVy: 0, digMul: 1, fallMul: 1, shield: 0, luck: 0 };
  G.highlight = {
    state: { hasTarget: false, ghostId: -1 },
    setTarget() {}, setBreakProgress() {}, setPlacementGhost() {},
  };
  G.viewModel = { swing() {} };
  G.fpState = { breaking: false, eating: -1, bowCharge: 0, nocked: false };
  G.quality = { settings: { effTier: opt.quality || 'high', tier: opt.quality || 'high' } };
  G.cheats = { god: false, fly: false };
  G.charAction = null;
  G.combat = G.combat || null;
  G.eyeSim.x = G.body.x; G.eyeSim.y = G.body.y + G.body.eyeH; G.eyeSim.z = G.body.z;
  G.saveHooks.push((reason) => { saves.push(reason); });
  if (opt.render) {
    G.THREE = THREE;
    G.camera = new THREE.PerspectiveCamera(70, 1.7, 0.06, 1600);
    G.camera.position.set(G.body.x, G.body.y + 1.62, G.body.z);
    G.scene = new THREE.Scene();
    G.scene.add(G.camera);
    G.worldRoot = new THREE.Group();
    G.entityRoot = new THREE.Group();
    G.scene.add(G.worldRoot, G.entityRoot);
    G.materials = { uniforms: createMaterialUniforms(THREE) };
    G.opts.createCanvas = () => fakeCanvas();
  }

  let t = 0;
  const now = () => t;
  const cms = [];
  const render = {
    makeChunkManager(world, mo) {
      const m = fakeManager(world, mo);
      cms.push(m);
      return m;
    },
    setChunkManager(cm) {
      G.chunkManager = cm;
      cm.setHidden(false);
    },
  };
  G.chunkManager = fakeManager(G.world, { workerCount: 2 });
  cms.push(G.chunkManager);
  const looks = [];
  const mgr = createDimensionManager(G, {
    render,
    now: () => now(),
    applyLook: (id) => { looks.push(id); },
    heapFraction: () => (opt.heapRef ? opt.heapRef.v : opt.heap === undefined ? 0 : opt.heap),
  });
  G.dimMgr = mgr;

  const FACT = {
    blocks: () => [createBlocks(G)],
    tech: () => createTech(G),
    magic: () => [createMagic(G)],
    treefall: () => [createTreefall(G)],
    content: () => [createContent(G)],
    props: () => [createProps(G)],
    session: () => createSession(G),
    mobs: () => createMobs(G),
    dimension: () => [createDimension(G)],
  };
  const names = opt.systems || ['blocks', 'tech', 'magic', 'treefall', 'content', 'props', 'dimension'];
  const sysList = [];
  for (let i = 0; i < names.length; i++) {
    const made = FACT[names[i]]();
    for (let k = 0; k < made.length; k++) {
      G.addSystem(made[k]);
      sysList.push(made[k]);
    }
  }
  G._initialized = true;
  G.registry.list().slice().forEach((s) => { if (typeof s.init === 'function') s.init(G); });
  G.worldReady = true;
  G.stepsRun = 0;

  /** n sabit adım (sistemler order sırasıyla; G.simFrozen iken yalnız alwaysRun). Her adımda gövde/göz eşitlenir (fizik çalıştırılmaz). */
  function step(n) {
    const list = G.registry.list();
    for (let k = 0; k < n; k++) {
      G.time.tick++;
      G.time.seconds += 1 / 60;
      G.eyeSim.x = G.body.x; G.eyeSim.y = G.body.y + G.body.eyeH; G.eyeSim.z = G.body.z;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (typeof s.fixedUpdate !== 'function') continue;
        if (G.simFrozen === true && s.alwaysRun !== true) continue;
        s.fixedUpdate(G, 1 / 60);
      }
      G.stepsRun++;
    }
  }

  /** n kare (dt sn): frameUpdate (geçiş makinesi dt'yi buradan alır) + her kareye 1 sabit adım. */
  function frame(dt, n) {
    const list = G.registry.list();
    const d = dt === undefined ? 1 / 60 : dt;
    const count = n === undefined ? 1 : n;
    for (let k = 0; k < count; k++) {
      t += d;
      step(1);
      G.time.frame++;
      for (let i = 0; i < list.length; i++) if (typeof list[i].frameUpdate === 'function') list[i].frameUpdate(G, G.time.paused ? 0 : d, 1);
    }
  }

  /** sec saniye boyunca (1/60 s kareler) çalıştırır; until() true olursa erken durur. */
  function run(sec, until) {
    const n = Math.ceil(sec * 60);
    for (let i = 0; i < n; i++) {
      frame(1 / 60, 1);
      if (until && until()) return i / 60;
    }
    return sec;
  }

  function place(x, y, z, yaw) {
    resetBody(G.body, x, y, z);
    if (yaw !== undefined) G.player.yaw = yaw;
    G.eyeSim.x = x; G.eyeSim.y = y + G.body.eyeH; G.eyeSim.z = z;
    G.eye.x = G.eyeSim.x; G.eye.y = G.eyeSim.y; G.eye.z = G.eyeSim.z;
  }

  return {
    G, mgr, render, cms, looks, hints, banners, saves, now, step, frame, run, place, systems: sysList, names,
  };
}
