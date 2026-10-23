import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../sim/blocks.js';
import { Chunk } from '../sim/chunk.js';
import { World } from '../sim/world.js';
import { PROP_DEFS } from '../sim/props/propDefs.js';
import { setPlanSource } from '../sim/props/propPlan.js';
import { fakeBlockPlan } from '../sim/props/propTestKit.js';
import { attachPropLayer, createPropLayer, layerOf } from '../sim/props/propLayer.js';
import { createMaterialUniforms } from '../render/materials.js';
import { createSystem } from './props.js';

beforeEach(() => setPlanSource(fakeBlockPlan));
afterEach(() => setPlanSource(null));

function flatGen64(seed, cx, cz) {
  const c = new Chunk(cx, cz);
  for (let si = 0; si < 25; si++) c.fillSection(si, B.BEDROCK);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      for (let y = 1; y <= 63; y++) c.set(x, y, z, B.STONE);
    }
  }
  return c;
}

function fakeCanvas() {
  const state = { font: '' };
  const ctx = {
    set font(v) { state.font = v; },
    get font() { return state.font; },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, fillText() {},
    measureText(t) {
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      return { width: t.length * (m ? parseFloat(m[1]) : 10) * 0.56 };
    },
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

function neonWorld(seed) {
  const w = new World({
    seed: seed || 4242, mode: 'macera', dim: 'neon', worldgen: flatGen64, sectionGen: () => ({ blocks: null, uniform: B.BEDROCK }),
  });
  for (let cx = 0; cx <= 3; cx++) for (let cz = 0; cz <= 3; cz++) w.ensureChunk(cx, cz);
  return w;
}

function makeG(world) {
  const log = [];
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 1600);
  camera.position.set(32, 66, 32);
  camera.updateMatrixWorld(true);
  const G = {
    world,
    scene: new THREE.Scene(),
    camera,
    materials: { uniforms: createMaterialUniforms(THREE) },
    opts: { createCanvas: () => fakeCanvas() },
    hud: { hint: null, target: { block: null, name: null, progress: 0 } },
    quality: { settings: { effTier: 'high' } },
    log,
    props: null,
    emit: (e) => log.push(['event', e.type, e]),
    speak: (t) => log.push(['speak', t]),
    sound: (n) => log.push(['sound', n]),
  };
  return G;
}

describe('props sistemi', () => {
  it('neon dünyasında init: katman kurulur, World\'e bağlanır, mevcut chunk\'lar yüklenir, çizici sahnede', () => {
    const G = makeG(neonWorld());
    const sys = createSystem(G);
    expect(sys.name).toBe('props');
    expect(sys.order).toBe(23);
    sys.init(G);
    expect(G.props).not.toBeNull();
    expect(G.world.colliders).toBe(G.props.colliders);
    expect(G.props.chunkCount).toBe(16);
    expect(G.props.size).toBeGreaterThan(15);
    expect(G.propRenderer).toBeTruthy();
    expect(G.scene.children.indexOf(G.propRenderer.group)).toBeGreaterThanOrEqual(0);
    expect(G.propRenderer.group.visible).toBe(true);
    sys.frameUpdate(G, 0.016);
    const st = G.propStats();
    expect(st.instances).toBeGreaterThan(5);
    expect(st.draws).toBeLessThanOrEqual(40);
    sys.dispose();
  });

  it('sonradan yüklenen/boşaltılan chunk proplara yansır (chunkLoad/chunkUnload)', () => {
    const G = makeG(neonWorld());
    const sys = createSystem(G);
    sys.init(G);
    const n0 = G.props.size;
    G.world.ensureChunk(4, 0);
    G.world.ensureChunk(4, 1);
    expect(G.props.chunkCount).toBe(18);
    expect(G.props.size).toBeGreaterThanOrEqual(n0);
    G.world.unloadChunk(4, 0);
    expect(G.props.chunkCount).toBe(17);
    sys.dispose();
  });

  it('overworld\'de çizici gizlenir, G.props kullanılmaz; neon\'a dönünce AYNI PropWorld (durum korunur)', () => {
    const neon = neonWorld();
    const G = makeG(neon);
    const sys = createSystem(G);
    sys.init(G);
    const pw = G.props;
    // terminal bulup kullan (sahte plan terminal üretmeyebilir: elle ekle)
    pw.addDynamic({
      id: 0xabcdef, t: PROP_DEFS.terminal.t, x: 5, y: 64, z: 5, yaw: 0, variant: 0, flags: 2,
    });
    // dinamik prop kayda girmez; durum korunumu için chunk proplarından kalıcı bir tane bul
    let found = null;
    pw.forEachEntry((e, id) => { if (!found && e.def.key === 'terminal') found = id; });
    // dünya: overworld'e geç
    const overworld = new World({ seed: 1, mode: 'macera', worldgen: flatGen64 });
    G.world = overworld;
    G.props = null; // dimrt overworld bağlamı: props yok
    sys.onDimension(G, 'neon', 'overworld');
    expect(G.propRenderer.group.visible).toBe(false);
    expect(overworld.colliders === undefined || overworld.colliders === null).toBe(true);
    sys.frameUpdate(G, 0.016);
    sys.fixedUpdate(G, 1 / 60);
    // neon'a dön: dimrt G.props'u kendi ctx.props'una atamazsa sistem aynı dünyanın katmanını bulur
    G.world = neon;
    sys.onDimension(G, 'overworld', 'neon');
    expect(G.props).toBe(pw);
    expect(layerOf(neon).props).toBe(pw);
    expect(G.propRenderer.group.visible).toBe(true);
    expect(found === null || pw.state(found) === 0).toBe(true);
    sys.dispose();
  });

  it('dimrt\'nin kurduğu G.props kullanılır (ikinci katman kurulmaz); World\'e bağlanır', () => {
    const neon = neonWorld();
    const layer = createPropLayer({ citySeed: neon.seed });
    const G = makeG(neon);
    G.props = layer.props;
    const sys = createSystem(G);
    sys.init(G);
    expect(G.props).toBe(layer.props);
    expect(neon.colliders).toBe(layer.colliders);
    expect(layer.props.chunkCount).toBe(16);
    sys.dispose();
  });

  it('dimrt zaten bağladıysa tekrar bağlamak idempotent (çift yükleme yok)', () => {
    const neon = neonWorld();
    const layer = createPropLayer({ citySeed: neon.seed });
    attachPropLayer(neon, layer);
    const n = layer.props.size;
    const G = makeG(neon);
    G.props = layer.props;
    const sys = createSystem(G);
    sys.init(G);
    sys.fixedUpdate(G, 1 / 60);
    sys.fixedUpdate(G, 1 / 60);
    expect(layer.props.size).toBe(n);
    expect(layer.props.duplicateIds).toBe(0);
    sys.dispose();
  });

  it('fixedUpdate: otomat zamanlayıcısı ilerler ve efektler yürütülür; yarım saniye sonra sıfırlanır', () => {
    const G = makeG(neonWorld());
    const sys = createSystem(G);
    sys.init(G);
    let otomat = null;
    G.props.forEachEntry((e, id) => { if (!otomat && e.def.key === 'otomat') otomat = id; });
    expect(otomat).not.toBeNull();
    G.props.use(otomat);
    expect(G.props.state(otomat)).toBe(1);
    for (let i = 0; i < 120; i++) sys.fixedUpdate(G, 1 / 60);
    expect(G.props.state(otomat)).toBe(0);
    sys.dispose();
  });

  it('tick efektleri ve ileti ipucu: ileti 5 sn sonra silinir', () => {
    const G = makeG(neonWorld());
    const sys = createSystem(G);
    sys.init(G);
    G.hud.hint = null;
    // kendi mesaj yolunu tetikle: boyut terminali ilk kullanımı (efektler kullanıcı tarafı); tick'in ileti yolunu doğrudan sına
    G.props.addDynamic({
      id: 0x777, t: PROP_DEFS.boyut_terminali.t, x: 10, y: 64, z: 10, yaw: 0, variant: 0, flags: 0,
    });
    G.props.use(0x777);
    for (let i = 0; i < 400; i++) sys.fixedUpdate(G, 1 / 60);
    expect(G.props.entry(0x777).tmp).toBeNull();
    sys.dispose();
  });

  it('kalite kademesi çiziciye yansır', () => {
    const G = makeG(neonWorld());
    const sys = createSystem(G);
    sys.init(G);
    expect(G.propRenderer.quality).toBe('high');
    G.quality.settings.effTier = 'low';
    sys.frameUpdate(G, 0.016);
    expect(G.propRenderer.quality).toBe('low');
    G.quality.settings.effTier = 'bilinmeyen';
    sys.frameUpdate(G, 0.016);
    expect(G.propRenderer.quality).toBe('high');
    sys.dispose();
  });

  it('serialize/restore: dimMgr yoksa kendi kaydı; dimMgr varsa null', () => {
    const G = makeG(neonWorld());
    const sys = createSystem(G);
    sys.init(G);
    let terminal = null;
    G.props.forEachEntry((e, id) => { if (!terminal && e.def.key === 'terminal') terminal = id; });
    if (terminal === null) {
      // sahte planda yoksa dinamik olmayan bir terminal yerleştirmek için planlayıcıyı değiştirip yeniden yükle
      G.props.planner = (s, cx, cz) => (cx === 0 && cz === 0 ? [{
        id: 321, t: PROP_DEFS.terminal.t, x: 5, y: 64, z: 5, yaw: 0, variant: 0, flags: 1,
      }] : []);
      G.props.unloadChunk(0, 0);
      G.props.loadChunk(0, 0);
      terminal = 321;
    }
    G.props.use(terminal);
    const data = sys.serialize();
    expect(data.v).toBe(1);
    expect(Object.keys(data.props).length).toBe(1);
    G.props.restore({});
    expect(G.props.state(terminal)).toBe(0);
    sys.restore(G, JSON.parse(JSON.stringify(data)));
    expect(G.props.state(terminal)).toBe(1);
    sys.restore(G, null);
    sys.restore(G, 5);
    G.dimMgr = {};
    expect(sys.serialize()).toBeNull();
    sys.dispose();
  });

  it('dispose: çizici sahneden çıkar, World bağlantısı kesilir, G.props boşalır; tekrar dispose güvenli', () => {
    const G = makeG(neonWorld());
    const sys = createSystem(G);
    sys.init(G);
    const grp = G.propRenderer.group;
    sys.dispose();
    expect(G.scene.children.indexOf(grp)).toBe(-1);
    expect(G.world.colliders).toBeNull();
    expect(G.props).toBeNull();
    expect(G.propRenderer).toBeNull();
    expect(() => sys.dispose()).not.toThrow();
    expect(() => sys.frameUpdate(G, 0.016)).not.toThrow();
    expect(() => sys.fixedUpdate(G, 1 / 60)).not.toThrow();
  });

  it('dünya yokken güvenli', () => {
    const G = makeG(null);
    const sys = createSystem(G);
    expect(() => { sys.init(G); sys.fixedUpdate(G, 1 / 60); sys.frameUpdate(G, 0.016); sys.onDimension(G); }).not.toThrow();
    sys.dispose();
  });

  it('fizik: bağlı katman world.colliders üzerinden oyuncuyu engeller (bank/otomat yürümeyi durdurur)', async () => {
    const { createPlayerBody, stepPlayer } = await import('../sim/physics.js');
    const G = makeG(neonWorld());
    const sys = createSystem(G);
    sys.init(G);
    G.props.planner = (s, cx, cz) => (cx === 1 && cz === 1 ? [{
      id: 555, t: PROP_DEFS.bank.t, x: 24.5, y: 64, z: 20, yaw: 0, variant: 0, flags: 0,
    }] : []);
    G.props.unloadChunk(1, 1);
    G.props.loadChunk(1, 1);
    expect(G.props.colliders.has(555)).toBe(true);
    const body = createPlayerBody(24.5, 64, 26);
    for (let i = 0; i < 240; i++) stepPlayer(body, { moveZ: 1, yaw: 0 }, G.world, 1 / 60, {}, { mode: 'macera' });
    // bank z∈[19.6875,20.3125] (yaw 0): ilerleyen oyuncu z=20.3125+0.3'te durur
    expect(body.z).toBeGreaterThan(20.3125);
    expect(body.z).toBeLessThan(20.3125 + 0.3 + 0.05);
    expect(body.hitZ).toBe(true);
    sys.dispose();
  });
});
