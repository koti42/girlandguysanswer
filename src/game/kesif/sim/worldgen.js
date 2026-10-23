/*
 * KEŞİF sim — dünya üretimi (saf, belirlenimci; yalnız tohum + koordinata bağlı).
 *
 *   generateChunk(seed, cx, cz, {decorate, mode, base, bounds, openRings, seal, light, sections}) → Chunk
 *   generateSection(seed, cx, cz, si, opts) → {blocks:Uint8Array(4096)|null, uniform}   tek kesit (derin kesitler bağımsız üretilir)
 *
 * Macera modu (derin dünya, y -400..362): chunk üretilirken YÜZEY BANDI (y ≥ 0) hemen üretilir; y < 0 kesitleri TEMBELdir
 * (World#ensureSection / generateSection, bkz. worldgenDeep.js). Yüzey bandı düz bir üretim penceresinde (denseChunk.js, y 0..367)
 * şu sırayla çalışır: arazi (kıta + dağ sırtı + nehir/göl/deniz + uçurum/kanyon) → yüzey (biyoma göre) → mağaralar (salon, tünel,
 * solucan, büyük salon, çukur, göl) → madenler → yüzen adalar → ağaçlar → bitkiler → decorate kancası → Mühür halkaları →
 * yükseklik haritası → kesitlere dönüştürme (tek tip kesitler dizi tutmaz) → ışık. Hiçbir adımda Math.random/Date.now yoktur.
 *
 * opts:
 *   mode       'macera' (varsayılan) | 'insa' | 'harita' (sınırlı 8×8 chunk taban dünyası, bkz. worldgenBases.js; legacy 0..127)
 *   base       'düz' | 'ada' | 'boş' | 'çayır' (insa/harita)
 *   bounds     {minCx,maxCx,minCz,maxCz} (varsayılan 0..7)
 *   openRings  bit i (0..3) = i. Mühür halkası açık (bölge i+1 erişilebilir) → halka üretilmez
 *   seal       false → halkaları hiç yerleştirme (saf arazi)
 *   light      false → ışık hesaplanmaz (World kendisi hesaplar)
 *   sections   'all' → derin kesitler de hemen üretilir (araç/test; varsayılan: tembel)
 *   decorate   (chunk, ctx) => void  — taban arazi ve bitkilerden sonra, yapılar için kanca (chunk = DenseChunk: blocks düz dizi,
 *              indeks ((y*16)+z)*16+x, y 0..367).
 *              ctx = {seed, world:null, cx, cz, mode, zone, zoneIndex, rng, biomeAt(x,z), heightAt(x,z),
 *                     columnSurface(lx,lz), seaLevel}
 *              biomeAt/heightAt DÜNYA koordinatı alır; columnSurface chunk-yerel (0..15) ve şu anki zemin y'sini
 *              (yaprak/kütük/sıvı/bitki/mühür hariç en üst katı blok) döner, yoksa -1.
 *
 * Dışa açık diğer işlevler: spawnPoint, biomeAt, biomeKeyAt, heightAt, zoneForChunk, floatingIslandsNear.
 */
import {
  BIOME_KEYS, GEN_TOP_Y, MAP_H, SEA_LEVEL, SURFACE_BAND_MIN_Y, WORLD_Y_MAX, WORLD_Y_MIN, ZONES, zoneIndexAt,
} from './constants.js';
import { B, SOLID_LUT } from './blocks.js';
import { Chunk } from './chunk.js';
import { acquireDense } from './denseChunk.js';
import { computeChunkLight } from './lighting.js';
import { hash2, hash3, seededRandom, toSeedInt } from './rng.js';
import {
  BIOME_ID, SEAL_RING_RADII, SEAL_THICKNESS, getGen, makeCol, ringIndexAt, sampleColumn,
} from './worldgenTerrain.js';
import { carveCaves } from './worldgenCaves.js';
import { placeOres } from './worldgenOres.js';
import {
  islandsInArea, placeIslands, placePlants, placeTrees,
} from './worldgenFlora.js';
import {
  DEFAULT_BOUNDS, baseHeight, generateBaseChunk, generateFrameChunk, normalizeBase,
} from './worldgenBases.js';
import { generateDeepSection, rockIdAt, rockWob } from './worldgenDeep.js';
import { placeFallenLogs } from './worldgenFallenLogs.js';
import { lavaPoolN } from './worldgenBiomeFeatures.js';
import { isBiomeFlora } from './biomeData.js';

export { DEFAULT_BOUNDS, SEAL_RING_RADII, SEAL_THICKNESS, ringIndexAt, BIOME_ID };
export {
  spawnPoint, legacySpawnPoint, evaluateSpawn, nearestTree, spawnYaw,
} from './worldgenSpawn.js';
export { bedrockTopY } from './worldgenDeep.js';

const STRATA = Object.freeze([17, 17, 12, 17, 7, 12, 12, 17, 17, 7, 12, 12, 17, 7, 17, 12]);
const HW = 18;
/** Yüzey bandının ilk kesit indeksi (macera): bunun altı derin/tembel. */
export const SURFACE_SECTION = (SURFACE_BAND_MIN_Y - WORLD_Y_MIN) >> 4;
/** Kaya bantları (bazalt/taş) bu yüksekliğin altında derin kural; üstü düz taş (+ kanyon tabakaları). */
const ROCK_BAND_TOP = 20;

// chunk başına yeniden kullanılan geçici diziler (üretim eşzamanlıdır)
const H18 = new Int16Array(HW * HW);
const HT = new Int16Array(256);
const BIO = new Uint8Array(256);
const TEMP = new Float32Array(256);
const SNOW = new Float32Array(256);
const FROST = new Float32Array(256);
const CANY = new Float32Array(256);

const colScratch = makeCol();

/* ------------------------------------------------------------------------------------------------
 * Sorgular (chunk gerektirmez)
 * ---------------------------------------------------------------------------------------------- */
/** Bölge indeksi (0..4): chunk merkezine göre. */
export function zoneForChunk(cx, cz) {
  return zoneIndexAt(cx * 16 + 8, cz * 16 + 8);
}

/** (x,z) sütununun biyom kimliği (BIOME_KEYS indeksi; chunk.biomeMap ile aynı). */
export function biomeAt(seed, x, z) {
  return sampleColumn(getGen(seed), x, z, colScratch).biome;
}

export function biomeKeyAt(seed, x, z) {
  return BIOME_KEYS[biomeAt(seed, x, z)];
}

/** (x,z) sütununun doğal zemin yüksekliği (en üst katı blok y'si; denizde tabanı). Ağaç/yapı/mağara hariç. */
export function heightAt(seed, x, z) {
  return sampleColumn(getGen(seed), x, z, colScratch).h;
}

/** Dikdörtgen alanla (blok) kesişen yüzen adalar: [{x,y,z,rx,rz,ry,zone}] (y = üst yüzey). */
export function floatingIslandsNear(seed, xa, za, xb, zb) {
  return islandsInArea(getGen(seed), xa, za, xb, zb);
}

/* spawnPoint / legacySpawnPoint / evaluateSpawn: worldgenSpawn.js (açık alan denetimli; eski algoritma yapı yerleşimi için korunur). */

/* ------------------------------------------------------------------------------------------------
 * Yüzey malzemesi + sütun doldurma
 * ---------------------------------------------------------------------------------------------- */
function surfaceFor(b, h, slope, hc, temp, snow, frost, canyon, wx, wz, N, out) {
  const rA = (hc & 1023) / 1024;
  const rB = ((hc >>> 10) & 1023) / 1024;
  let top = B.GRASS;
  let fill = B.DIRT;
  let depth = 3;
  out.pool = false;
  if (h <= SEA_LEVEL) {
    if (b === BIOME_ID.bataklik || b === BIOME_ID.mangrov) {
      top = rA < 0.5 ? B.MUD : B.CLAY;
      fill = B.MUD;
    } else if (b === BIOME_ID.mercan) {
      top = B.SAND;
      fill = B.SAND;
    } else {
      const sn = h <= SEA_LEVEL - 1 ? N.simplex2(wx * 0.07, wz * 0.07) : 0;
      if (sn > 0.5) {
        top = B.CLAY;
        fill = B.SAND;
      } else if (sn < -0.55 || h < SEA_LEVEL - 9 || temp < -0.5) {
        top = B.GRAVEL;
        fill = B.GRAVEL;
      } else {
        top = B.SAND;
        fill = B.SAND;
      }
    }
  } else if (h <= SEA_LEVEL + 1 && b !== BIOME_ID.kristal && b !== BIOME_ID.dag) {
    const cold = b === BIOME_ID.tundra || b === BIOME_ID.taiga || b === BIOME_ID.buzul;
    const swampy = b === BIOME_ID.bataklik || b === BIOME_ID.mangrov;
    top = cold ? B.GRAVEL : (swampy ? B.MUD : B.SAND);
    fill = top === B.MUD ? B.MUD : (top === B.GRAVEL ? B.GRAVEL : B.SAND);
  } else if (h >= snow && b !== BIOME_ID.plaj && b !== BIOME_ID.col && b !== BIOME_ID.volkanik && b !== BIOME_ID.mercan) {
    top = B.SNOW;
    fill = b === BIOME_ID.dag ? B.STONE : (b === BIOME_ID.buzul ? (rB < 0.55 ? B.SNOW : B.PACKED_ICE) : B.DIRT);
    depth = b === BIOME_ID.dag ? 1 : (b === BIOME_ID.buzul ? 4 : 3);
  } else if (slope >= 5 && h > SEA_LEVEL + 6 && b !== BIOME_ID.dag && b !== BIOME_ID.col && b !== BIOME_ID.buzul && b !== BIOME_ID.volkanik
    && b !== BIOME_ID.kristal) {
    // dik yamaç (her biyomda): çıplak kaya/çakıl uçurum — çimen dikey duvara yapışmasın
    top = rA < 0.3 ? B.GRAVEL : B.STONE;
    fill = B.STONE;
    depth = 0;
  } else {
    switch (b) {
      case BIOME_ID.karacam:
        top = rA < 0.2 ? B.DIRT : B.GRASS;
        break;
      case BIOME_ID.col:
        top = canyon > 0.3 && rA > 0.3 ? B.RED_SAND : (rA < 0.12 ? B.RED_SAND : B.SAND);
        fill = B.SANDSTONE;
        depth = 4;
        break;
      case BIOME_ID.tundra:
        if (frost > 0.5 && slope <= 1 && N.simplex2(wx * 0.04 + 9, wz * 0.04) > 0.55) top = B.SLIPPERY_ICE;
        else top = B.SNOW_GRASS;
        break;
      case BIOME_ID.dag:
        fill = B.STONE;
        if (slope >= 4) {
          top = frost > 0.5 && rA < 0.3 ? B.BASALT : B.STONE;
          depth = 0;
        } else if (slope >= 2 && rA < 0.5) {
          top = B.GRAVEL;
          depth = 2;
        } else if (h < 68) {
          top = B.GRASS;
          fill = B.DIRT;
        } else {
          top = rB < 0.12 ? B.GRAVEL : (rB < 0.4 && frost > 0.1 ? B.BASALT : B.STONE);
          depth = 1;
        }
        break;
      case BIOME_ID.bataklik:
        top = rA < 0.4 ? B.MUD : B.GRASS;
        fill = B.MUD;
        break;
      case BIOME_ID.mangrov:
        top = rA < 0.55 ? B.MUD : B.GRASS;
        fill = B.MUD;
        break;
      case BIOME_ID.plaj:
        top = B.SAND;
        fill = B.SAND;
        depth = 4;
        break;
      case BIOME_ID.mercan:
        top = B.SAND;
        fill = B.SAND;
        depth = 4;
        break;
      case BIOME_ID.kristal:
        top = rA < 0.16 ? B.CRYSTAL_ROCK : (rA < 0.42 ? B.BASALT : B.GRASS);
        fill = top === B.GRASS ? B.DIRT : B.STONE;
        depth = 2;
        break;
      case BIOME_ID.yagmurorman:
        top = rA < 0.16 ? B.MOSS : B.GRASS;
        break;
      case BIOME_ID.savan:
        top = rA < 0.06 ? B.DIRT : B.GRASS;
        break;
      case BIOME_ID.taiga:
        top = rA < 0.07 ? B.DIRT : B.SNOW_GRASS;
        break;
      case BIOME_ID.buzul:
        top = rA < 0.18 ? B.PACKED_ICE : (rA < 0.26 && slope <= 1 ? B.SLIPPERY_ICE : B.SNOW);
        fill = rB < 0.5 ? B.SNOW : B.PACKED_ICE;
        depth = 4;
        break;
      case BIOME_ID.mantar:
        top = B.MYCELIUM;
        break;
      case BIOME_ID.bambu:
        top = rA < 0.08 ? B.DIRT : B.GRASS;
        break;
      case BIOME_ID.volkanik:
        fill = B.BASALT;
        depth = 3;
        if (slope <= 1 && h > SEA_LEVEL + 2 && lavaPoolN(N, wx, wz)) {
          top = B.LAVA;
          out.pool = true;
        } else if (rA < 0.04) top = B.MAGMA_ROCK;
        else if (lavaPoolN(N, wx, wz, 1.4)) top = B.VOLCANIC_GLASS; // havuz kıyısı: soğumuş volkanik cam
        else top = rA < 0.5 ? B.ASH : (rA < 0.9 ? B.BASALT : B.GRAVEL);
        break;
      case BIOME_ID.golge:
        top = rA < 0.3 ? B.DIRT : B.GRASS;
        break;
      case BIOME_ID.sonbahar:
        top = rA < 0.05 ? B.DIRT : B.GRASS;
        break;
      default:
        break;
    }
  }
  out.top = top;
  out.fill = fill;
  out.depth = depth;
}

const surf = { top: 0, fill: 0, depth: 0, pool: false };

function generateTerrain(g, chunk, seed) {
  const blocks = chunk.blocks;
  const x0 = chunk.cx * 16;
  const z0 = chunk.cz * 16;
  const o = g.col;
  // 1) sütun örnekleme (+1 kenar halkası: eğim için)
  for (let lz = -1; lz <= 16; lz++) {
    for (let lx = -1; lx <= 16; lx++) {
      sampleColumn(g, x0 + lx, z0 + lz, o);
      H18[(lz + 1) * HW + lx + 1] = o.h;
      if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) {
        const i = (lz << 4) + lx;
        HT[i] = o.h;
        BIO[i] = o.biome;
        TEMP[i] = o.temp;
        SNOW[i] = o.snow;
        FROST[i] = o.frost;
        CANY[i] = o.canyon;
      }
    }
  }
  chunk.biomeMap.set(BIO);
  // 2) sütun doldurma
  const N = g.c;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const idx = (lz << 4) + lx;
      const wx = x0 + lx;
      const wz = z0 + lz;
      const h = HT[idx];
      const b = BIO[idx];
      const hc = hash2(wx, wz, seed ^ 0x5a5a);
      const hi = (lz + 1) * HW + lx + 1;
      const hn = H18[hi - HW];
      const hs = H18[hi + HW];
      const he = H18[hi + 1];
      const hw = H18[hi - 1];
      const slope = Math.max(Math.abs(h - hn), Math.abs(h - hs), Math.abs(h - he), Math.abs(h - hw));
      surfaceFor(b, h, slope, hc, TEMP[idx], SNOW[idx], FROST[idx], CANY[idx], wx, wz, N, surf);
      const strata = (b === BIOME_ID.col || CANY[idx] > 0.5) && h > SEA_LEVEL;
      const depth = surf.depth;
      const stoneTop = h - depth - 1;
      // kaya gövdesi: alt kısımda derin dünya ile dikişsiz bazalt bantları (rockIdAt), üstünde taş / kanyon tabakaları
      const wob = rockWob(g, wx, wz);
      for (let y = 0; y <= stoneTop; y++) {
        let id;
        if (y < ROCK_BAND_TOP) id = rockIdAt(seed, y, wob);
        else if (strata && y >= 30) id = STRATA[(y >> 1) & 15];
        else id = B.STONE;
        blocks[(y << 8) + idx] = id;
      }
      for (let y = stoneTop + 1; y < h; y++) {
        if (y >= 0) blocks[(y << 8) + idx] = surf.fill;
      }
      blocks[(h << 8) + idx] = surf.top;
      if (surf.pool) blocks[((h - 1) << 8) + idx] = B.LAVA; // lav havuzu iki blok derin
      if (h < SEA_LEVEL) {
        const frozen = TEMP[idx] < -0.5;
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          blocks[(y << 8) + idx] = frozen && y === SEA_LEVEL ? B.ICE : B.WATER;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Mühür halkaları
 * ---------------------------------------------------------------------------------------------- */
function applySealRings(chunk, openMask) {
  const x0 = chunk.cx * 16;
  const z0 = chunk.cz * 16;
  const rc = Math.sqrt((x0 + 8) * (x0 + 8) + (z0 + 8) * (z0 + 8));
  const blocks = chunk.blocks;
  const top = Math.min(chunk.height - 1, WORLD_Y_MAX);
  for (let ring = 0; ring < SEAL_RING_RADII.length; ring++) {
    if (ring < 4 && ((openMask >> ring) & 1)) continue;
    if (Math.abs(rc - SEAL_RING_RADII[ring]) > 13.5) continue;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        if (ringIndexAt(x0 + lx, z0 + lz) !== ring) continue;
        const col = (lz << 4) + lx;
        for (let y = 0; y <= top; y++) blocks[(y << 8) + col] = B.SEAL_BARRIER;
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * decorate kancası
 * ---------------------------------------------------------------------------------------------- */
function isGroundBlock(b) {
  if (b === 0 || !SOLID_LUT[b]) return false;
  if ((b >= 40 && b <= 43) || (b >= 48 && b <= 51) || isBiomeFlora(b)) return false;
  return b !== B.SEAL_BARRIER && b !== B.CACTUS;
}

function callDecorate(decorate, chunk, seed, mode) {
  const cx = chunk.cx;
  const cz = chunk.cz;
  const zi = zoneForChunk(cx, cz);
  const blocks = chunk.blocks;
  chunk.recomputeHeightMap();
  const ctx = {
    seed,
    world: null,
    cx,
    cz,
    mode,
    zone: ZONES[zi],
    zoneIndex: zi,
    seaLevel: SEA_LEVEL,
    rng: seededRandom(hash3(cx, cz, seed ^ 0xdec0)),
    biomeAt: (x, z) => biomeAt(seed, x, z),
    heightAt: (x, z) => heightAt(seed, x, z),
    columnSurface(lx, lz) {
      const col = (lz << 4) + lx;
      for (let y = chunk.heightMap[col]; y >= 0; y--) {
        if (isGroundBlock(blocks[(y << 8) + col])) return y;
      }
      return -1;
    },
  };
  decorate(chunk, ctx);
}

/* ------------------------------------------------------------------------------------------------
 * Ana giriş
 * ---------------------------------------------------------------------------------------------- */
function fillBaseFrom(dense, chunk) {
  chunk.loadDense(dense.blocks, 0);
}

/** Üretim penceresini (y 0..) chunk kesitlerine aktarır; üstü boş satırlar taranmaz. */
function denseToSections(dense, chunk) {
  chunk.loadDense(dense.blocks, SURFACE_BAND_MIN_Y, dense.maxTop() + 1);
  chunk.heightMap.set(dense.heightMap);
  chunk.biomeMap.set(dense.biomeMap);
}

export function generateChunk(seed, cx, cz, opts = {}) {
  const s = toSeedInt(seed);
  const mode = opts.mode === 'insa' || opts.mode === 'harita' ? opts.mode : 'macera';
  let chunk;
  if (mode !== 'macera') {
    const dense = acquireDense(cx, cz, MAP_H);
    const b = opts.bounds || DEFAULT_BOUNDS;
    const inside = cx >= b.minCx && cx <= b.maxCx && cz >= b.minCz && cz <= b.maxCz;
    if (inside) generateBaseChunk(dense, s, normalizeBase(opts.base));
    else generateFrameChunk(dense, b);
    chunk = new Chunk(cx, cz, { legacy: true });
    fillBaseFrom(dense, chunk);
    chunk.biomeMap.set(dense.biomeMap);
  } else {
    const g = getGen(s);
    const dense = acquireDense(cx, cz, GEN_TOP_Y);
    generateTerrain(g, dense, s);
    carveCaves(g, dense.blocks, cx, cz, HT);
    placeOres(s, dense.blocks, cx, cz, HT, BIO, zoneForChunk(cx, cz));
    placeIslands(g, dense.blocks, cx * 16, cz * 16);
    placeTrees(g, dense.blocks, cx * 16, cz * 16);
    placeFallenLogs(g, dense.blocks, cx * 16, cz * 16);
    placePlants(g, dense.blocks, cx * 16, cz * 16, HT, BIO);
    if (typeof opts.decorate === 'function') callDecorate(opts.decorate, dense, s, mode);
    if (opts.seal !== false) applySealRings(dense, opts.openRings | 0);
    dense.recomputeHeightMap();
    chunk = new Chunk(cx, cz, { lazy: true });
    denseToSections(dense, chunk);
    if (opts.sections === 'all') {
      for (let si = 0; si < SURFACE_SECTION; si++) {
        const d = generateDeepSection(s, cx, cz, si, opts);
        chunk.setSection(si, d.blocks, d.uniform);
      }
    }
  }
  chunk.recomputeHeightMap();
  chunk.generated = true;
  chunk.dirty = true;
  chunk.version = 1;
  chunk.secVersion.fill(1);
  if (opts.light !== false) computeChunkLight(chunk);
  return chunk;
}

/**
 * Tek kesit üretir. Derin kesitler (si < SURFACE_SECTION) bağımsız üretilir; yüzey bandı kesitleri chunk üretiminden alınır.
 * Döner {blocks: Uint8Array(4096) (sahiplik çağırana) | null, uniform}.
 */
export function generateSection(seed, cx, cz, si, opts = {}) {
  const mode = opts.mode === 'insa' || opts.mode === 'harita' ? opts.mode : 'macera';
  if (mode === 'macera' && si >= 0 && si < SURFACE_SECTION) return generateDeepSection(toSeedInt(seed), cx, cz, si, opts);
  const c = generateChunk(seed, cx, cz, Object.assign({}, opts, { light: false, sections: undefined }));
  if (si < 0 || si >= c.sectionCount || c.secGen[si] === 0) return { blocks: null, uniform: 0 };
  if (c.secBlocks[si] === null) return { blocks: null, uniform: c.secUniform[si] };
  return { blocks: c.secBlocks[si], uniform: 0 };
}

export { baseHeight };
