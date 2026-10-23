/*
 * KEŞİF bulmaca altyapısı — bağlam (ctx), belirlenimli rng ve chunk-kesitli kurulum (saf).
 *
 * Belirlenim: bulmacanın rng'si YALNIZCA (dünya seed'i, bulmaca kimliği)'nden türer; konum/facing/chunk sırası etkilemez.
 * Aynı bulmacayı her chunk yeniden kurup kendi kesitini aldığı için `build(ctx)` aynı çağrı dizisini yapmalı:
 *   - rastgelelik ctx.rng (taze akış) ya da subRng(ctx,'etiket') ile; ASLA Math.random/Date.now
 *   - dekor için konum-hash'i (frame(ctx).chance/hash); clip'e (chunk sınırına) göre dallanma YOK
 *   - ctx.getBlock okuma sonuçlarına bağlı olma (chunk yüklü olmayabilir)
 */
import { hash32, seededRandom, stringSeedToInt, toSeedInt } from '../rng.js';
import { zoneIndexAt } from '../constants.js';
import { getPuzzle, clampDifficulty } from './kitRegistry.js';
import { normFacing } from './kitGeometry.js';
import { resolveTheme } from './kitThemes.js';

/** Bulmacaya özgü uint32 tohum (dünya seed'i + kimlik). */
export function puzzleSeed(worldSeed, id) {
  return hash32((toSeedInt(worldSeed) ^ stringSeedToInt('puzzle:' + String(id))) | 0);
}

/** Bulmacanın taze rng akışı (her çağrıda aynı diziyi başlatır). */
export function puzzleRng(worldSeed, id) {
  return seededRandom(puzzleSeed(worldSeed, id));
}

/**
 * Ana akıştan BAĞIMSIZ, etiketle türetilmiş akış: ctx.rng ilerlemiş olsa da aynı etiket aynı diziyi verir.
 * (ctx.seed yoksa ctx.rng.fork'a düşer.)
 */
export function subRng(ctx, label) {
  if (typeof ctx.seed === 'number') return seededRandom(hash32((ctx.seed ^ stringSeedToInt(String(label))) | 0));
  return ctx.rng.fork(String(label));
}

function noop() {}

function nullGet() {
  return null;
}

/**
 * Bulmaca bağlamı kurar.
 * o: { id, world?, worldSeed?, origin:{x,y,z}, facing?, difficulty?, zone?, theme?, setBlock?, getBlock?,
 *      spawnEntity?, clip?, time?, rng? }
 *   setBlock/getBlock verilmezse world'e bağlanır; world de yoksa yazım yok sayılır (kuru çalıştırma).
 */
export function makeCtx(o) {
  const world = o.world || null;
  const worldSeed = o.worldSeed !== undefined ? o.worldSeed : (world ? world.seed : 0);
  const origin = { x: Math.floor(o.origin.x), y: Math.floor(o.origin.y), z: Math.floor(o.origin.z) };
  let zone = o.zone;
  if (zone === undefined || zone === null) zone = zoneIndexAt(origin.x, origin.z);
  const seed = puzzleSeed(worldSeed, o.id === undefined ? 'anon' : o.id);
  let setBlock = o.setBlock;
  let getBlock = o.getBlock;
  if (!setBlock) setBlock = world ? (x, y, z, id) => world.setBlock(x, y, z, id) : noop;
  if (!getBlock) getBlock = world ? (x, y, z) => world.getBlock(x, y, z) : nullGet;
  return {
    id: o.id,
    world,
    rng: o.rng || seededRandom(seed),
    seed,
    origin,
    facing: normFacing(o.facing),
    difficulty: o.difficulty === undefined ? 1 : o.difficulty,
    zone,
    theme: resolveTheme(o.theme, zone),
    setBlock,
    getBlock,
    spawnEntity: o.spawnEntity || noop,
    clip: o.clip || null,
    time: o.time || 0,
  };
}

/**
 * Bir bulmaca odasını `setBlock`'a kurar (worldgen/decorate için; chunk-kesitli). Kuru çalıştırma için setBlock
 * vermeyebilirsin: yalnızca {state, anchors} alırsın.
 *
 * desc: { id, type, origin, facing?, difficulty?, zone? }
 * opts: { seed (dünya seed'i), setBlock, getBlock?, clip?:{x0,z0,x1,z1}, world? }
 * Döner: { id, type, state, anchors, impl, bounds:{inner,outer}, zone, difficulty } | null (tip kayıtlı değil)
 */
export function buildPuzzleRoom(desc, opts) {
  const o = opts || {};
  const impl = getPuzzle(desc.type);
  if (!impl) return null;
  const difficulty = clampDifficulty(impl, desc.difficulty === undefined ? 1 : desc.difficulty);
  const ctx = makeCtx({
    id: desc.id,
    world: o.world,
    worldSeed: o.seed,
    origin: desc.origin,
    facing: desc.facing,
    difficulty,
    zone: desc.zone,
    setBlock: o.setBlock,
    getBlock: o.getBlock,
    clip: o.clip,
    spawnEntity: noop,
  });
  const res = impl.build(ctx) || {};
  return {
    id: desc.id,
    type: desc.type,
    state: res.state,
    anchors: res.anchors || {},
    impl,
    zone: ctx.zone,
    difficulty,
  };
}

/**
 * Bir Chunk nesnesine yazan setBlock/getBlock/clip üçlüsü (decorateChunk için):
 *   const w = chunkWriter(chunk);
 *   buildPuzzleRoom(desc, { seed, setBlock: w.setBlock, getBlock: w.getBlock, clip: w.clip });
 * Chunk dışı ya da y aralık dışı yazımlar sessizce atılır. heightMap'i çağıran yeniden hesaplar
 * (chunk.recomputeHeightMap()).
 */
export function chunkWriter(chunk) {
  const x0 = chunk.cx * 16;
  const z0 = chunk.cz * 16;
  const blocks = chunk.blocks;
  const top = (blocks.length >> 8) - 1;
  return {
    clip: { x0, z0, x1: x0 + 15, z1: z0 + 15 },
    setBlock(x, y, z, id) {
      const lx = x - x0;
      const lz = z - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > top) return false;
      blocks[((y * 16) + lz) * 16 + lx] = id;
      return true;
    },
    getBlock(x, y, z) {
      const lx = x - x0;
      const lz = z - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15) return null;
      if (y < 0 || y > top) return 0;
      return blocks[((y * 16) + lz) * 16 + lx];
    },
  };
}
