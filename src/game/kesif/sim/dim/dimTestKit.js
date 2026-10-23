/*
 * KEŞİF sim/dim — test aracı (yalnız testler kullanır): düz sahte şehir üreticisi + koruma kuralları + kayıt örnekleri.
 *
 *   fakeWorld/baseState/v2Save/scatterEdits/playedNeonCtx/bigCity/bigNeon   saveV3*.test.js ortak örnekleri
 *
 *   flatCityGen()    → {generateChunk, generateSection, canGenerate, cityRules}   (y<=62 taş, y=63 asfalt, (0,0) chunk'ında 3×3×3 tuğla "bina")
 *   installFlatCity()→ registerDimGen('city', flatCityGen()); geri alma işlevi döner
 *   makeCityWorld(seed?) → neon World (düz sahte şehir, cityRules bağlı)
 */
import { B } from '../blocks.js';
import { Chunk } from '../chunk.js';
import { WORLD_Y_MIN } from '../constants.js';
import { seededRandom } from '../rng.js';
import { serializeGame } from '../save.js';
import { encodeEdits } from '../saveEdits.js';
import { World } from '../world.js';
import { dimSeed } from './dimensions.js';
import { createDimCtxSim } from './dimState.js';
import { registerDimGen, unregisterDimGen } from './genRegistry.js';

export const ASPHALT = 223;
export const BUILDING = B.BRICK;
const SURFACE_SI = (0 - WORLD_Y_MIN) >> 4; // y=0 kesidi
const ROAD_SI = (48 - WORLD_Y_MIN) >> 4; // y 48..63
const LOW_SI = (64 - WORLD_Y_MIN) >> 4; // y 64..79

/** Yol koridoru (yerleştirme yasak): z ∈ [-2,2], y 64..68; bina iç hacmi yok. */
export function noBuild(x, y, z) {
  return z >= -2 && z <= 2 && y >= 64 && y <= 68;
}

/** Doğal dolgu: y <= 62 (taş); asfalt (y=63) ve bina yapıdır. */
export function naturalFill(x, y) {
  return y <= 62;
}

export function flatCityGen() {
  function generateChunk(seed, cx, cz) {
    const c = new Chunk(cx, cz, { lazy: true });
    for (let si = SURFACE_SI; si < ROAD_SI; si++) c.fillSection(si, B.STONE);
    const road = new Uint8Array(4096);
    road.fill(B.STONE, 0, 15 * 256);
    road.fill(ASPHALT, 15 * 256, 16 * 256);
    c.setSection(ROAD_SI, road, 0);
    const low = new Uint8Array(4096);
    if (cx === 0 && cz === 0) {
      for (let ly = 0; ly < 3; ly++) {
        for (let lz = 8; lz < 11; lz++) for (let lx = 8; lx < 11; lx++) low[(ly << 8) + (lz << 4) + lx] = BUILDING;
      }
    }
    c.setSection(LOW_SI, low, 0);
    for (let si = LOW_SI + 1; si < c.sectionCount; si++) c.fillSection(si, 0);
    c.recomputeHeightMap();
    c.generated = true;
    c.dirty = true;
    c.version = 1;
    c.secVersion.fill(1);
    return c;
  }
  function generateSection(seed, cx, cz, si) {
    if (si < SURFACE_SI) return { blocks: null, uniform: B.STONE };
    const c = generateChunk(seed, cx, cz);
    if (c.secBlocks[si] === null) return { blocks: null, uniform: c.secUniform[si] };
    return { blocks: c.secBlocks[si], uniform: 0 };
  }
  return {
    generateChunk,
    generateSection,
    cityRules: { isNaturalFill: naturalFill, isNoBuild: noBuild },
  };
}

/** Sahte şehir üreticisini 'city' olarak kaydeder; geri alma işlevi döner. */
export function installFlatCity() {
  registerDimGen('city', flatCityGen());
  return () => unregisterDimGen('city');
}

export function makeCityWorld(worldSeed) {
  const impl = flatCityGen();
  const w = new World({
    seed: dimSeed(worldSeed === undefined ? 1234 : worldSeed, 'neon'),
    mode: 'macera',
    dim: 'neon',
    worldgen: impl.generateChunk,
    sectionGen: impl.generateSection,
    zoneUnlocked: () => true,
  });
  w.cityRules = impl.cityRules;
  return w;
}

/* ----- kayıt v3 test örnekleri ----- */
export function fakeWorld(edits) {
  return {
    edits: edits || new Map(), yMin: -400, yMax: 362, rawSeed: 4242, mode: 'macera',
  };
}

export function baseState(over) {
  return Object.assign({
    world: fakeWorld(),
    seed: 4242,
    mode: 'macera',
    name: 'Deneme',
    player: { pos: [10.5, 70, 20.5], yaw: 1.5, pitch: 0.2 },
    savedAt: 1700000000000,
    createdAt: 1700000000000,
  }, over);
}

/** Rastgele dağınık düzenlemelerle (şehir sınırları içinde) kodlanmış kesit farkları üretir. */
export function scatterEdits(sections, perSection, seed) {
  const rng = seededRandom(seed);
  const m = new Map();
  for (let s = 0; s < sections; s++) {
    const cx = rng.int(-40, 40);
    const cz = rng.int(-40, 40);
    const y0 = 64 + 16 * rng.int(0, 5);
    for (let k = 0; k < perSection; k++) {
      m.set((cx * 16 + rng.int(0, 15)) + ',' + (y0 + rng.int(0, 15)) + ',' + (cz * 16 + rng.int(0, 15)), B.STONE);
    }
  }
  return encodeEdits(m, -400).chunks;
}

export function v2Save() {
  const sv = serializeGame(baseState());
  const v2 = JSON.parse(JSON.stringify(sv));
  v2.v = 2;
  delete v2.dimMeta;
  delete v2.dims;
  delete v2.player.dim;
  return v2;
}

export function playedNeonCtx(seed) {
  const ctx = createDimCtxSim('neon', seed);
  ctx.world.cityRules = { isNaturalFill: (x, y) => y <= 62, isNoBuild: () => false };
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) ctx.world.ensureChunk(cx, cz);
  ctx.world.setBlock(5, 62, 5, 0);
  ctx.world.setBlock(6, 64, 6, B.DIRT);
  ctx.world.setBlock(-7, 70, 20, B.GLASS);
  ctx.clock.time = 123.5;
  ctx.clock.day = 3;
  ctx.weatherSim.t = 77.7;
  ctx.spawn = [0.5, 64, 2.5];
  ctx.terminals.found = (1 << 3) | (1 << 9);
  ctx.locks.abc12 = 2;
  ctx.locks.z9 = 1;
  ctx.chests.set('4,64,4', [{ item: 'blok:taş', count: 9 }, null, { item: 'item:kazma_demir', count: 1, dur: 80 }]);
  ctx.stash.push({ item: 'item:küçük_anahtar', count: 1 }, { item: 'item:ok', count: 12 });
  ctx.city = {
    v: 1, kredi: 345, garage: { owned: ['a', 'b'], active: 0 }, summoned: null, discovery: { chips: [1, 2, 3] }, npcs: { n1: { rel: 2, dlg: 'x' } }, flags: { first: true }, stats: { km: 3.5 },
  };
  ctx.props = {
    data: { abc12: [1, 0], q7: [2, 3, { open: true }] },
    serialize() { return this.data; },
    restore(o) { this.data = o; },
  };
  ctx.em = {
    last: null,
    serialize() { return { mobs: [{ type: 'gozdrone', x: 10, y: 66, z: 10, hp: 6 }], items: [{ item: 'item:ok', count: 3, x: 1, y: 64, z: 1 }] }; },
    restore(o) { this.last = o; },
  };
  return ctx;
}


export function bigCity() {
  const npcs = {};
  for (let i = 0; i < 200; i++) npcs['n' + i.toString(36)] = { rel: i % 5, dlg: 'abcdef' };
  return {
    v: 1, kredi: 10, garage: { owned: ['x'], active: 0 }, summoned: { cls: 'taksi', x: 1, y: 64, z: 2 }, npcs, flags: {}, stats: {},
  };
}

export function bigNeon(over) {
  const props = {};
  for (let i = 0; i < 400; i++) props[i.toString(36) + 'p'] = [i & 255, i, { a: 'x'.repeat(20) }];
  const entities = [];
  for (let i = 0; i < 100; i++) entities.push({ type: 'gozdrone', x: i, y: 64, z: i, hp: 4 });
  return Object.assign({
    v: 1, edits: scatterEdits(30, 150, 5), clock: { time: 1, day: 0, dayLengthSec: 600 }, weather: { seed: 1, t: 2 }, spawn: [0.5, 64, 2.5], terminals: 1, props, locks: { a1: 1 }, chests: {}, tech: null, entities, stash: [], city: bigCity(),
  }, over);
}

