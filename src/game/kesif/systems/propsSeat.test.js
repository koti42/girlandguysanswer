import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../sim/blocks.js';
import { Chunk } from '../sim/chunk.js';
import { World } from '../sim/world.js';
import { createPlayerBody, isBoxFree } from '../sim/physics.js';
import { INTERIOR_BY_KEY } from '../sim/props/propDefsInterior.js';
import { attachPropLayer, createPropLayer } from '../sim/props/propLayer.js';
import { createSeatController } from './propsSeat.js';
import { createSystem } from './props.js';
import { createMaterialUniforms } from '../render/materials.js';

function flatGen64(seed, cx, cz) {
  const c = new Chunk(cx, cz);
  for (let si = 0; si < 25; si++) c.fillSection(si, B.BEDROCK);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 1; y <= 63; y++) c.set(x, y, z, B.STONE);
  return c;
}

function neonWorld() {
  const w = new World({
    seed: 4242, mode: 'macera', dim: 'neon', worldgen: flatGen64, sectionGen: () => ({ blocks: null, uniform: B.BEDROCK }),
  });
  for (let cx = 0; cx <= 3; cx++) for (let cz = 0; cz <= 3; cz++) w.ensureChunk(cx, cz);
  return w;
}

let nid = 5000;
function setup(propKeys) {
  const world = neonWorld();
  const props = (propKeys || ['sandalye']).map((k, i) => {
    const d = INTERIOR_BY_KEY[k];
    return {
      id: ++nid, t: d.t, x: 20.5 + i * 4, y: 64, z: 20.5, yaw: 0, variant: 0, flags: 0,
    };
  });
  const layer = createPropLayer({ citySeed: 4242 });
  layer.props.planner = (s, cx, cz) => props.filter((p) => Math.floor(p.x / 16) === cx && Math.floor(p.z / 16) === cz);
  attachPropLayer(world, layer);
  const log = [];
  const G = {
    world,
    props: layer.props,
    body: createPlayerBody(20.5, 64, 23),
    player: { yaw: 0, pitch: 0, dead: false },
    inputState: { jumpPressed: false, interactPressed: false },
    eyeSim: { x: 0, y: 0, z: 0 },
    hud: { hint: null },
    emit: (e) => log.push(e),
    log,
  };
  return { G, props, layer, sc: createSeatController(G) };
}

const ev = (p, d, extra) => Object.assign({
  type: 'propSeat', id: p.id, key: d.key, x: p.x, y: p.y + d.seat.h, z: p.z + 0.04, yaw: Math.PI, pitch: 0, eye: d.seat.eye, pose: d.seat.pose, closes: false, spot: 0,
}, extra || {});

function steps(sc, n, dt) {
  for (let i = 0; i < n; i++) sc.fixedUpdate(dt || 1 / 60);
}

describe('oturma denetleyicisi', () => {
  it('oturunca gövde koltuğa kilitlenir (konum, hız sıfır, yaw/pitch), göz alçalır, olay yayılır; hareket girişi geri alınır', () => {
    const { G, props, sc } = setup();
    const d = INTERIOR_BY_KEY.sandalye;
    expect(sc.start(ev(props[0], d))).toBe(true);
    expect(sc.active.id).toBe(props[0].id);
    expect(G.log.some((e) => e.type === 'seated')).toBe(true);
    expect(G.body.x).toBeCloseTo(20.5, 9);
    expect(G.body.y).toBeCloseTo(64 + d.seat.h, 9);
    expect(G.player.yaw).toBeCloseTo(Math.PI, 9);
    G.body.vx = 5; G.body.x += 1; G.body.vy = -9;
    steps(sc, 1);
    expect(G.body.x).toBeCloseTo(20.5, 9);
    expect(G.body.vx).toBe(0);
    expect(G.body.vy).toBe(0);
    const e0 = G.body.eyeH;
    steps(sc, 60);
    expect(Math.abs(G.body.eyeH - d.seat.eye)).toBeLessThan(Math.abs(e0 - d.seat.eye) + 1e-9);
    expect(G.body.eyeH).toBeCloseTo(d.seat.eye, 1);
    expect(G.eyeSim.y).toBeCloseTo(G.body.y + G.body.eyeH, 9);
  });

  it('kalkış: zıpla ya da F (koruma süresinden sonra); aynı koltuğa tekrar kullanmak kalkar; başka koltuk geçiş yapar', () => {
    const { G, props, sc } = setup(['sandalye', 'kanepe']);
    const dA = INTERIOR_BY_KEY.sandalye;
    const dB = INTERIOR_BY_KEY.kanepe;
    sc.start(ev(props[0], dA));
    G.inputState.jumpPressed = true;
    steps(sc, 5); // koruma süresi içinde yok sayılır (aynı basış)
    expect(sc.active).not.toBeNull();
    steps(sc, 30);
    expect(sc.active).toBeNull();
    expect(G.log.some((e) => e.type === 'stood' && e.reason === 'jump')).toBe(true);
    G.inputState.jumpPressed = false;
    sc.start(ev(props[0], dA));
    steps(sc, 30);
    G.inputState.interactPressed = true;
    steps(sc, 1);
    expect(sc.active).toBeNull();
    expect(G.log.filter((e) => e.type === 'stood').pop().reason).toBe('use');
    G.inputState.interactPressed = false;
    sc.start(ev(props[0], dA));
    expect(sc.start(ev(props[0], dA))).toBe(true); // aynı koltuk → kalk
    expect(sc.active).toBeNull();
    sc.start(ev(props[0], dA));
    sc.start(ev(props[1], dB));
    expect(sc.active.id).toBe(props[1].id);
    expect(G.log.filter((e) => e.type === 'stood').length).toBeGreaterThanOrEqual(4);
  });

  it('kalkış konumu boş ve zeminde (koltuk önü); çevresi tamamen doluysa yerinde kalkar, hata yok', () => {
    const { G, props, sc } = setup();
    const d = INTERIOR_BY_KEY.sandalye;
    sc.start(ev(props[0], d));
    steps(sc, 30);
    sc.stand('api');
    const b = G.body;
    expect(isBoxFree(G.world, b.x - 0.3, b.y + 0.03, b.z - 0.3, b.x + 0.3, b.y + 1.77, b.z + 0.3)).toBe(true);
    expect(b.z).toBeGreaterThan(props[0].z + 0.4); // önde
    expect(b.y).toBe(64);
    // çevreyi duvarla çevir
    const { G: G2, props: p2, sc: sc2 } = setup();
    for (let x = 17; x <= 24; x++) for (let z = 17; z <= 24; z++) {
      if (Math.abs(x - 20) <= 1 && Math.abs(z - 20) <= 1) continue;
      for (let y = 64; y <= 67; y++) G2.world.setBlock(x, y, z, B.STONE, { record: false });
    }
    sc2.start(ev(p2[0], d));
    steps(sc2, 30);
    expect(() => sc2.stand('api')).not.toThrow();
    expect(sc2.active).toBeNull();
    expect(Number.isFinite(G2.body.x + G2.body.y + G2.body.z)).toBe(true);
  });

  it('kapsül kapağı kalkınca açılır (durum 0); ölüm/boyut/ışınlanma kalkışı; geçersiz olay yok sayılır', () => {
    const { G, props, sc, layer } = setup(['kapsul_yatak']);
    const d = INTERIOR_BY_KEY.kapsul_yatak;
    layer.props.use(props[0].id);
    expect(layer.props.state(props[0].id)).toBe(1);
    sc.start(ev(props[0], d, { closes: true }));
    steps(sc, 30);
    sc.stand('api');
    expect(layer.props.state(props[0].id)).toBe(0);
    // ölüm
    sc.start(ev(props[0], d));
    G.player.dead = true;
    steps(sc, 1);
    expect(sc.active).toBeNull();
    G.player.dead = false;
    // ışınlanma: gövde uzağa
    sc.start(ev(props[0], d));
    G.body.x += 30;
    steps(sc, 1);
    expect(sc.active).toBeNull();
    expect(G.body.x).toBeCloseTo(20.5 + 30, 5); // konuma dokunulmaz
    // boyut
    sc.start(ev(props[0], d));
    sc.stand('dim');
    expect(sc.active).toBeNull();
    // geçersiz
    expect(sc.start(null)).toBe(false);
    expect(sc.start(ev(props[0], d, { x: NaN }))).toBe(false);
    expect(sc.start(ev(props[0], d, { eye: Infinity }))).toBe(false);
    G.player.dead = true;
    expect(sc.start(ev(props[0], d))).toBe(false);
    expect(sc.stand('x')).toBe(false);
    expect(() => createSeatController({}).start(ev(props[0], d))).not.toThrow();
  });
});

describe('props sistemi ↔ oturma', () => {
  it('propSeat olayı sistemden oturtur; boyut değişince kalkar; fixedUpdate gövdeyi sabitler; dispose güvenli', () => {
    const { G, props } = setup();
    const d = INTERIOR_BY_KEY.sandalye;
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 1600);
    G.camera.position.set(20, 65.6, 24);
    G.camera.updateMatrixWorld(true);
    G.materials = { uniforms: createMaterialUniforms(THREE) };
    G.quality = { settings: { effTier: 'high' } };
    G.opts = {
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, fillText() {}, measureText: (t) => ({ width: t.length * 10 }), set font(v) {}, get font() { return ''; },
        }),
      }),
    };
    G.speak = () => {};
    G.sound = () => {};
    const sys = createSystem(G);
    G.props = null;
    sys.init(G);
    G.props.planner = (s, cx, cz) => props.filter((p) => Math.floor(p.x / 16) === cx && Math.floor(p.z / 16) === cz);
    G.props.unloadChunk(1, 1);
    G.props.loadChunk(1, 1);
    const p = G.props.get(props[0].id);
    expect(p).toBeTruthy();
    sys.onEvent(G, ev(p, d));
    expect(G.propSeat.active).toBeTruthy();
    G.body.x += 0.5;
    sys.fixedUpdate(G, 1 / 60);
    expect(G.body.x).toBeCloseTo(20.5, 5);
    sys.onDimension(G, 'neon', 'overworld');
    expect(G.propSeat.active).toBeNull();
    sys.onEvent(G, { type: 'lockOpened', lockId: 'x1' });
    sys.onEvent(G, null);
    sys.dispose();
    expect(G.propSeat).toBeNull();
  });
});
