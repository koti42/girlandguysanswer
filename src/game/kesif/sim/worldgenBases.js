/*
 * KEŞİF sim — 'insa' ve 'harita' modu tabanları (saf, belirlenimci; worldgen.js kullanır).
 *
 * Sınırlı dünya: 8×8 chunk (128×128 blok, chunk 0..7), spawn [64, 64, 64]. Tabanlar yalnız id <= 99 (haritada
 * serbest) blok kullanır; böylece kaydedilmiş harita chunk'ları tabanla aynı bileşimdedir.
 *   'düz'    düz çimen (üst blok y=63)
 *   'çayır'  hafif engebeli çayır, birkaç ağaç, çiçek
 *   'ada'    denizin ortasında ada (deniz seviyesi y=60), kum kıyı
 *   'boş'    boşluk: yalnız spawn altında 7×7 taş platform (y=62..63)
 * Kaçış engeli: sınırın hemen dışındaki çerçeve chunk'larında 2 blok kalınlıkta ana kaya duvar (y <= 76) + üstünde
 * translüsent mühür bariyeri (tüm yükseklik). Çerçevenin ötesi World.getBlock'ta ana kaya sayılır; düşenler için
 * World.killPlaneY (y < -24) ihlal çizgisidir.
 */
import { WORLD_H } from './constants.js';
import { B } from './blocks.js';
import { createNoise } from './noise.js';
import { hash2, toSeedInt } from './rng.js';
import { BIOME_ID, smooth } from './worldgenTerrain.js';
import { TREE, beginTrees, buildTree } from './worldgenFlora.js';

export const DEFAULT_BOUNDS = Object.freeze({
  minCx: 0, maxCx: 7, minCz: 0, maxCz: 7,
});
export const BASE_KEYS = Object.freeze(['düz', 'ada', 'boş', 'çayır']);
export const FLAT_TOP = 63;
export const WALL_TOP = 76;
export const ISLAND_WATER_Y = 60;
const CX = 64;
const CZ = 64;

const noiseCache = new Map();
function baseNoise(seed) {
  const s = toSeedInt(seed);
  let n = noiseCache.get(s);
  if (!n) {
    if (noiseCache.size >= 4) noiseCache.delete(noiseCache.keys().next().value);
    n = createNoise(s ^ 0x6ba5e);
    noiseCache.set(s, n);
  }
  return n;
}

export function normalizeBase(base) {
  return BASE_KEYS.indexOf(base) >= 0 ? base : 'düz';
}

/** Taban modunun doğuş noktası (blok): [64, 64, 64] — ayakların altı y=63 katı. */
export function baseSpawn() {
  return [CX, FLAT_TOP + 1, CZ];
}

/** (x,z) sütununun üst katı blok y'si; boşluksa -1. Yalnız sınır içi için anlamlıdır. */
export function baseHeight(seed, base, x, z) {
  const b = normalizeBase(base);
  if (b === 'düz') return FLAT_TOP;
  if (b === 'boş') return x >= CX - 3 && x <= CX + 3 && z >= CZ - 3 && z <= CZ + 3 ? FLAT_TOP : -1;
  const N = baseNoise(seed);
  const dx = x + 0.5 - CX;
  const dz = z + 0.5 - CZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (b === 'çayır') {
    const n = N.fbm2(x * 0.03, z * 0.03, 3);
    return Math.round(FLAT_TOP + n * 9 * (1 - smooth(16, 7, d)));
  }
  // ada
  const R = 50 + N.fbm2(x * 0.03 + 40, z * 0.03 - 17, 2) * 9;
  const t = d / R;
  const n = N.fbm2(x * 0.045, z * 0.045, 3);
  const h = FLAT_TOP - 4 * smooth(0.45, 1.0, t) - 14 * smooth(1.0, 1.6, t) + n * 3.2 * smooth(0.08, 0.5, t);
  return Math.round(h);
}

function baseTrees(seed, blocks, x0, z0, base) {
  if (base !== 'çayır' && base !== 'ada') return;
  const s = toSeedInt(seed);
  beginTrees(blocks, x0, z0);
  const dens = base === 'ada' ? 0.045 : 0.03;
  for (let cz = Math.floor((z0 - 6) / 4); cz <= Math.floor((z0 + 21) / 4); cz++) {
    for (let cx = Math.floor((x0 - 6) / 4); cx <= Math.floor((x0 + 21) / 4); cx++) {
      const h = hash2(cx, cz, s ^ 0xba5e);
      if (((h >>> 8) & 0xffff) / 65536 >= dens) continue;
      const tx = cx * 4 + (h & 3);
      const tz = cz * 4 + ((h >>> 2) & 3);
      if (tx < 6 || tx > 121 || tz < 6 || tz > 121) continue;
      const dd = Math.sqrt((tx - CX) * (tx - CX) + (tz - CZ) * (tz - CZ));
      if (dd < 12) continue;
      const hh = baseHeight(seed, base, tx, tz);
      if (hh <= ISLAND_WATER_Y + 1 && base === 'ada') continue;
      const sel = ((h >>> 24) & 255) / 256;
      const sp = sel < 0.65 ? TREE.OAK : sel < 0.9 ? TREE.BIRCH : (base === 'ada' ? TREE.ACACIA : TREE.BIGOAK);
      buildTree(sp, tx, hh + 1, tz, hash2(tx, tz, s ^ 0x7a11));
    }
  }
}

/** Sınır içindeki bir chunk'ı tabandan üretir (chunk boş gelir). */
export function generateBaseChunk(chunk, seed, base) {
  const bs = normalizeBase(base);
  const s = toSeedInt(seed);
  const blocks = chunk.blocks;
  const x0 = chunk.cx * 16;
  const z0 = chunk.cz * 16;
  const N = baseNoise(seed);
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const x = x0 + lx;
      const z = z0 + lz;
      const col = (lz << 4) + lx;
      const h = baseHeight(seed, bs, x, z);
      chunk.biomeMap[col] = BIOME_ID.cayir;
      if (h < 0) continue;
      if (bs === 'boş') {
        blocks[(62 << 8) + col] = B.STONE;
        blocks[(63 << 8) + col] = B.COBBLE;
        continue;
      }
      let top = B.GRASS;
      let fill = B.DIRT;
      const wet = bs === 'ada' && h <= ISLAND_WATER_Y + 1;
      if (wet) {
        chunk.biomeMap[col] = BIOME_ID.plaj;
        const sn = h < ISLAND_WATER_Y - 1 ? N.simplex2(x * 0.07, z * 0.07) : 0;
        top = sn > 0.5 ? B.CLAY : (sn < -0.55 || h < ISLAND_WATER_Y - 9 ? B.GRAVEL : B.SAND);
        fill = B.SAND;
      }
      for (let y = 0; y <= h - 4; y++) blocks[(y << 8) + col] = B.STONE;
      for (let y = Math.max(0, h - 3); y < h; y++) blocks[(y << 8) + col] = fill;
      blocks[(h << 8) + col] = top;
      if (wet) {
        for (let y = h + 1; y <= ISLAND_WATER_Y; y++) blocks[(y << 8) + col] = B.WATER;
      } else if (bs !== 'düz') {
        const r = (hash2(x, z, s ^ 0x91a7) >>> 0) / 4294967296;
        const dd = Math.sqrt((x - CX) * (x - CX) + (z - CZ) * (z - CZ));
        if (dd > 5) {
          const ia = ((h + 1) << 8) + col;
          if (r < 0.12) blocks[ia] = B.TALL_GRASS;
          else if (r < 0.135) blocks[ia] = B.FLOWER_RED;
          else if (r < 0.15) blocks[ia] = B.FLOWER_YELLOW;
        }
      }
    }
  }
  baseTrees(seed, blocks, x0, z0, bs);
}

/** Sınırın hemen dışındaki çerçeve chunk'ı: 2 blok kalınlıkta duvar + üstünde translüsent bariyer. */
export function generateFrameChunk(chunk, bounds) {
  const b = bounds || DEFAULT_BOUNDS;
  const x0b = b.minCx * 16;
  const z0b = b.minCz * 16;
  const x1b = (b.maxCx + 1) * 16 - 1;
  const z1b = (b.maxCz + 1) * 16 - 1;
  const blocks = chunk.blocks;
  const x0 = chunk.cx * 16;
  const z0 = chunk.cz * 16;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const x = x0 + lx;
      const z = z0 + lz;
      const inX = x >= x0b - 2 && x <= x1b + 2;
      const inZ = z >= z0b - 2 && z <= z1b + 2;
      if (!inX || !inZ) continue;
      const onRing = x < x0b || x > x1b || z < z0b || z > z1b;
      if (!onRing) continue;
      const col = (lz << 4) + lx;
      for (let y = 0; y <= WALL_TOP; y++) blocks[(y << 8) + col] = B.BEDROCK;
      for (let y = WALL_TOP + 1; y < WORLD_H; y++) blocks[(y << 8) + col] = B.SEAL_BARRIER;
    }
  }
}
