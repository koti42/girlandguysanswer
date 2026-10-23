/*
 * KEŞİF sim — ağaçlar, bitkiler, yüzen adalar (saf, belirlenimci; worldgen.js kullanır).
 *
 * Ağaçlar 4×4'lük hücrelere bağlı belirlenimci konumlardadır; taç chunk sınırını aşar: her chunk, kendine
 * değebilecek tüm hücreleri (±6 blok) aynı sırayla işler ve yalnızca kendi kesitini yazar. Kütük hava/yaprak üstüne,
 * yaprak yalnız havaya yazılır → sonuç sıra ve chunk sınırından bağımsızdır.
 * Türler: meşe, huş, çam (+ uzun çam), akasya, büyük meşe, söğüt (sarmaşıklı).
 */
import { SEA_LEVEL, zoneIndexAt } from './constants.js';
import { B } from './blocks.js';
import { hash2, hash3 } from './rng.js';
import {
  BIOME_ID, SEAL_RING_RADII, makeCol, sampleColumn, sinkholeNear,
} from './worldgenTerrain.js';
import {
  DIRS, DIRS8, beginTrees, hv, leafBlob, lf, lg,
} from './worldgenTreeKit.js';
import { TREE2, TREE2_MAX, TREE2_MIN, buildBiomeTree } from './worldgenTreesBiome.js';
import { lavaPoolAt } from './worldgenBiomeFeatures.js';

export const TREE = Object.freeze({
  OAK: 0, BIRCH: 1, PINE: 2, ACACIA: 3, BIGOAK: 4, WILLOW: 5, TALLPINE: 6, ...TREE2,
});
export const TREE_CELL = 4;
/** Hücre tarama marjı: taç yarıçapı ≤ 9 (+ gövde konumu sapması 3). Dev ağaçlar ayrı ızgarada (GIANT_*). */
const TREE_MARGIN = 12;
const INV32 = 1 / 4294967296;
export { beginTrees };

/* ------------------------------------------------------------------------------------------------
 * Ağaç şekilleri (tx,ty,tz = gövde tabanı; ty = yüzey + 1)
 * ---------------------------------------------------------------------------------------------- */
function treeOak(tx, ty, tz, th) {
  const H = 4 + ((th >>> 3) % 3);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_OAK);
  const top = ty + H - 1;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy <= -1 ? 2 : 1;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx !== 0 && dz !== 0 && Math.abs(dx) === r && Math.abs(dz) === r) {
          if (dy === 1 || (r === 2 && (hash3(dx, dy, dz, th) & 1))) continue;
        }
        lf(tx + dx, top + dy, tz + dz, B.LEAVES_OAK);
      }
    }
  }
}

function treeBirch(tx, ty, tz, th) {
  const H = 6 + ((th >>> 3) % 3);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_BIRCH);
  const top = ty + H - 1;
  for (let dy = -3; dy <= 1; dy++) {
    const r = dy === -3 || dy >= 0 ? 1 : 2;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx !== 0 && dz !== 0 && Math.abs(dx) === r && Math.abs(dz) === r) {
          if (dy === 1 || r === 1 || (hash3(dx, dy, dz, th) & 1)) continue;
        }
        lf(tx + dx, top + dy, tz + dz, B.LEAVES_BIRCH);
      }
    }
  }
}

const PINE_R = [0, 1, 1, 2, 1, 2, 2, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3];
function treePine(tx, ty, tz, th, tall) {
  const H = tall ? 12 + ((th >>> 3) % 5) : 8 + ((th >>> 3) % 5);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_PINE);
  const top = ty + H - 1;
  const bottom = ty + (tall ? 4 : 3);
  const cap = tall ? 4 : 3;
  for (let y = top + 1, k = 0; y >= bottom; y--, k++) {
    let r = PINE_R[k < PINE_R.length ? k : PINE_R.length - 1];
    if (tall && k > 9) r = Math.min(cap, r + 1);
    const lim = r * r + (r > 1 ? 1 : 0);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > lim) continue;
        lf(tx + dx, y, tz + dz, B.LEAVES_PINE);
      }
    }
  }
}

function treeAcacia(tx, ty, tz, th) {
  const H = 5 + ((th >>> 3) % 2);
  const d = DIRS[(th >>> 6) & 3];
  for (let i = 0; i <= H - 3; i++) lg(tx, ty + i, tz, B.LOG_ACACIA);
  const bx = tx + d[0];
  const bz = tz + d[1];
  for (let i = H - 3; i <= H - 1; i++) lg(bx, ty + i, bz, B.LOG_ACACIA);
  const top = ty + H - 1;
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= 8 && !(d2 === 8 && (hash3(dx, 0, dz, th) & 1))) lf(bx + dx, top, bz + dz, B.LEAVES_ACACIA);
      if (d2 <= 3) lf(bx + dx, top + 1, bz + dz, B.LEAVES_ACACIA);
    }
  }
}

function treeBigOak(tx, ty, tz, th) {
  const H = 8 + ((th >>> 3) % 4);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_OAK);
  const top = ty + H - 1;
  for (let k = 0; k < 3; k++) {
    const d = DIRS8[(th >>> (4 + k * 3)) & 7];
    const y = top - 3 + (k & 1);
    lg(tx + d[0], y, tz + d[1], B.LOG_OAK);
    lg(tx + d[0] * 2, y + 1, tz + d[1] * 2, B.LOG_OAK);
    leafBlob(tx + d[0] * 2, y + 1, tz + d[1] * 2, 2.5, B.LEAVES_OAK, th + k);
  }
  leafBlob(tx, top - 1, tz, 3.6, B.LEAVES_OAK, th);
}

function treeWillow(tx, ty, tz, th) {
  const H = 5 + ((th >>> 3) % 3);
  for (let i = 0; i < H; i++) lg(tx, ty + i, tz, B.LOG_OAK);
  const top = ty + H - 1;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy === 1 ? 2 : 3;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > (r === 3 ? 9 : 4) || (d2 >= 9 && (hash3(dx, dy, dz, th) & 1))) continue;
        lf(tx + dx, top + dy, tz + dz, B.LEAVES_OAK);
      }
    }
  }
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 < 5 || d2 > 9) continue;
      for (let dy = -2; dy <= -1; dy++) {
        if (hv(dx, dy, dz, th) >= 0.4) continue;
        const len = 2 + Math.floor(hv(dz, dy, dx, th) * 3);
        for (let k = 1; k <= len; k++) lf(tx + dx, top + dy - k, tz + dz, B.VINE);
      }
    }
  }
}

export function buildTree(species, tx, ty, tz, th) {
  if (species >= TREE2_MIN && species <= TREE2_MAX) {
    buildBiomeTree(species, tx, ty, tz, th);
    return;
  }
  switch (species) {
    case TREE.OAK: treeOak(tx, ty, tz, th); break;
    case TREE.BIRCH: treeBirch(tx, ty, tz, th); break;
    case TREE.PINE: treePine(tx, ty, tz, th, false); break;
    case TREE.TALLPINE: treePine(tx, ty, tz, th, true); break;
    case TREE.ACACIA: treeAcacia(tx, ty, tz, th); break;
    case TREE.BIGOAK: treeBigOak(tx, ty, tz, th); break;
    default: treeWillow(tx, ty, tz, th); break;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Hücre tabanlı yerleşim
 * ---------------------------------------------------------------------------------------------- */
const tcol = makeCol();

function nearRing(x, z, margin) {
  const r = Math.sqrt(x * x + z * z);
  for (let i = 0; i < SEAL_RING_RADII.length; i++) {
    if (Math.abs(r - SEAL_RING_RADII[i]) < margin) return true;
  }
  return false;
}

// speciesFor çıktıları (ayırma yok)
let _dens = 0;
let _sp = 0;
let _minH = SEA_LEVEL + 2;

/**
 * Biyom → ağaç yoğunluğu + türü (+ en düşük zemin). b biyom kimliği, sel [0,1) tür seçici, f orman yoğunluğu, hh zemin y'si.
 * Dönüş false = bu biyomda/bu zeminde ağaç yok.
 */
function speciesFor(b, sel, f, hh, info) {
  _minH = SEA_LEVEL + 2;
  switch (b) {
    case BIOME_ID.cayir:
      _dens = 0.02 + 0.10 * f;
      _sp = sel < 0.75 ? TREE.OAK : TREE.BIRCH;
      return true;
    case BIOME_ID.orman:
      _dens = 0.12 + 0.34 * f;
      _sp = sel < 0.45 ? TREE.OAK : sel < 0.75 ? TREE.BIRCH : sel < 0.9 ? TREE.BIGOAK : TREE.PINE;
      return true;
    case BIOME_ID.karacam:
      _dens = 0.16 + 0.34 * f;
      _sp = sel < 0.86 ? TREE.PINE : TREE.TALLPINE;
      return true;
    case BIOME_ID.bataklik:
      _dens = 0.08 + 0.12 * f;
      _sp = TREE.WILLOW;
      return true;
    case BIOME_ID.col:
      if (hh > 74) return false;
      _dens = 0.012;
      _sp = TREE.ACACIA;
      return true;
    case BIOME_ID.tundra:
      _dens = 0.012 + 0.03 * f;
      _sp = TREE.PINE;
      return true;
    case BIOME_ID.dag:
      if (hh >= info.snow - 4 || hh > 76) return false;
      _dens = 0.03 + 0.05 * f;
      _sp = TREE.PINE;
      return true;
    case BIOME_ID.kristal:
      _dens = 0.008;
      _sp = TREE.BIRCH;
      return true;
    case BIOME_ID.sonbahar:
      _dens = 0.14 + 0.34 * f;
      _sp = sel < 0.45 ? TREE.AUTUMN_OAK : sel < 0.62 ? TREE.AUTUMN_BIG : sel < 0.9 ? TREE.AUTUMN_BIRCH : TREE.OAK;
      return true;
    case BIOME_ID.kiraz:
      _dens = 0.08 + 0.24 * f;
      _sp = sel < 0.7 ? TREE.CHERRY : sel < 0.88 ? TREE.CHERRY_BIG : TREE.BIRCH;
      return true;
    case BIOME_ID.yagmurorman:
      _dens = 0.30 + 0.34 * f;
      _sp = TREE.JUNGLE;
      return true;
    case BIOME_ID.mangrov:
      _minH = SEA_LEVEL - 1;
      _dens = 0.10 + 0.16 * f;
      _sp = TREE.MANGROVE;
      return true;
    case BIOME_ID.savan:
      if (hh > 80) return false;
      _dens = 0.006 + 0.016 * f;
      _sp = sel < 0.74 ? TREE.SAVANNA : sel < 0.93 ? TREE.ACACIA : TREE.BAOBAB;
      return true;
    case BIOME_ID.taiga:
      _dens = 0.14 + 0.32 * f;
      _sp = sel < 0.78 ? TREE.SNOWPINE : TREE.SNOWPINE_TALL;
      return true;
    case BIOME_ID.buzul:
      _dens = 0.025 + 0.035 * f;
      _sp = TREE.ICE_SPIKE;
      return true;
    case BIOME_ID.mantar:
      _dens = 0.10 + 0.20 * f;
      _sp = sel < 0.38 ? TREE.MUSH_RED : sel < 0.5 ? TREE.MUSH_RED_BIG : TREE.MUSH_PURPLE;
      return true;
    case BIOME_ID.bambu:
      _dens = 0.22 + 0.30 * f;
      _sp = TREE.BAMBOO;
      return true;
    case BIOME_ID.volkanik:
      _dens = 0.014;
      _sp = TREE.DEAD_TREE;
      return true;
    case BIOME_ID.mercan:
      if (hh >= SEA_LEVEL + 2) {
        _dens = 0.05 + 0.07 * f;
        _sp = TREE.PALM;
        return true;
      }
      if (hh <= SEA_LEVEL - 2 && hh >= SEA_LEVEL - 12) {
        _minH = SEA_LEVEL - 12;
        _dens = 0.16;
        _sp = TREE.CORAL;
        return true;
      }
      return false;
    case BIOME_ID.plaj:
      // plaj: seyrek palmiye (sıcak kıyı) — yalnız kara
      if (hh < SEA_LEVEL + 2 || info.temp < 0.45) return false;
      _dens = 0.008;
      _sp = TREE.PALM;
      return true;
    case BIOME_ID.cicek:
      _dens = 0.006 + 0.03 * f;
      _sp = sel < 0.5 ? TREE.OAK : sel < 0.8 ? TREE.BIRCH : TREE.CHERRY;
      return true;
    case BIOME_ID.golge:
      _dens = 0.18 + 0.34 * f;
      _sp = sel < 0.78 ? TREE.DARK_OAK : TREE.TALLPINE;
      return true;
    default:
      return false;
  }
}

/**
 * Hücre (ccx,ccz) bir ağaç içeriyorsa out={x,z,y(taban),species,hash,biome} doldurur ve true döner.
 * Yalnız tohum ve konuma bağlıdır (chunk'tan bağımsız).
 */
export function treeInCell(g, ccx, ccz, out) {
  const h = hash2(ccx, ccz, g.seed ^ 0x7ee5);
  const roll = ((h >>> 8) & 0xffff) / 65536;
  if (roll > 0.52) return false;
  const tx = ccx * TREE_CELL + (h & 3);
  const tz = ccz * TREE_CELL + ((h >>> 2) & 3);
  const info = tcol;
  sampleColumn(g, tx, tz, info);
  const hh = info.h;
  const sel = ((h >>> 24) & 255) / 256;
  if (!speciesFor(info.biome, sel, info.forest, hh, info)) return false;
  if (hh < _minH || roll >= _dens) return false;
  if (nearRing(tx, tz, 5) || sinkholeNear(g, tx, tz, 3)) return false;
  if (info.biome === BIOME_ID.volkanik && lavaPoolAt(g, tx, tz, 2)) return false;
  out.x = tx;
  out.z = tz;
  // mangrov gövdesi su yüzeyinde başlar (kökler suya iner)
  out.y = _sp === TREE.MANGROVE && hh < SEA_LEVEL + 1 ? SEA_LEVEL + 1 : hh + 1;
  out.species = _sp;
  out.hash = hash2(tx, tz, g.seed ^ 0x7a11);
  out.biome = info.biome;
  return true;
}

const tOut = { x: 0, z: 0, y: 0, species: 0, hash: 0, biome: 0 };

/* ------------------------------------------------------------------------------------------------
 * Dev ağaçlar: seyrek kaba ızgara (14×14), yalnız yağmur ormanı. Taç yarıçapı ≤ 13 → ayrı geniş tarama marjı.
 * ---------------------------------------------------------------------------------------------- */
export const GIANT_CELL = 14;
const GIANT_MARGIN = 24;
const gcol = makeCol();
const gcol2 = makeCol();

/** Dev ağaç hücresi: out={x,z,y,species,hash,biome} (2×2 gövde: x..x+1, z..z+1). */
export function giantInCell(g, gcx, gcz, out) {
  const h = hash2(gcx, gcz, g.seed ^ 0x61a7);
  if (((h >>> 6) & 1023) / 1024 > 0.24) return false;
  const tx = gcx * GIANT_CELL + 3 + (h % 8);
  const tz = gcz * GIANT_CELL + 3 + ((h >>> 12) % 8);
  sampleColumn(g, tx, tz, gcol);
  if (gcol.biome !== BIOME_ID.yagmurorman || gcol.h < SEA_LEVEL + 3) return false;
  if (nearRing(tx, tz, 14) || sinkholeNear(g, tx, tz, 4)) return false;
  const hh = gcol.h;
  sampleColumn(g, tx + 1, tz + 1, gcol2);
  if (Math.abs(gcol2.h - hh) > 2) return false;
  sampleColumn(g, tx + 1, tz, gcol2);
  if (Math.abs(gcol2.h - hh) > 2) return false;
  out.x = tx;
  out.z = tz;
  out.y = hh + 1;
  out.species = TREE.JUNGLE_GIANT;
  out.hash = hash2(tx, tz, g.seed ^ 0x7a12);
  out.biome = gcol.biome;
  return true;
}

/** Bu chunk'a değen tüm ağaçları (kesitlerini) yazar. Önce dev ağaçlar (kütüklerini hiçbir şey ezmesin), sonra normal ağaçlar. */
export function placeTrees(g, blocks, x0, z0) {
  beginTrees(blocks, x0, z0);
  const ga = Math.floor((x0 - GIANT_MARGIN) / GIANT_CELL);
  const gb = Math.floor((x0 + 15 + GIANT_MARGIN) / GIANT_CELL);
  const gza = Math.floor((z0 - GIANT_MARGIN) / GIANT_CELL);
  const gzb = Math.floor((z0 + 15 + GIANT_MARGIN) / GIANT_CELL);
  for (let cz = gza; cz <= gzb; cz++) {
    for (let cx = ga; cx <= gb; cx++) {
      if (!giantInCell(g, cx, cz, tOut)) continue;
      buildTree(tOut.species, tOut.x, tOut.y, tOut.z, tOut.hash);
    }
  }
  const ca = Math.floor((x0 - TREE_MARGIN) / TREE_CELL);
  const cb = Math.floor((x0 + 15 + TREE_MARGIN) / TREE_CELL);
  const za = Math.floor((z0 - TREE_MARGIN) / TREE_CELL);
  const zb = Math.floor((z0 + 15 + TREE_MARGIN) / TREE_CELL);
  for (let cz = za; cz <= zb; cz++) {
    for (let cx = ca; cx <= cb; cx++) {
      if (!treeInCell(g, cx, cz, tOut)) continue;
      buildTree(tOut.species, tOut.x, tOut.y, tOut.z, tOut.hash);
    }
  }
}

/** (x,z) merkezli r yarıçapında ağaç tabanı var mı? (spawn güvenliği için) */
export function treeNear(g, x, z, r) {
  const a = Math.floor((x - r) / TREE_CELL);
  const b = Math.floor((x + r) / TREE_CELL);
  const c = Math.floor((z - r) / TREE_CELL);
  const d = Math.floor((z + r) / TREE_CELL);
  const o = { x: 0, z: 0, y: 0, species: 0, hash: 0, biome: 0 };
  for (let cz = c; cz <= d; cz++) {
    for (let cx = a; cx <= b; cx++) {
      if (!treeInCell(g, cx, cz, o)) continue;
      const dx = o.x - x;
      const dz = o.z - z;
      if (dx * dx + dz * dz <= r * r) return true;
    }
  }
  return false;
}

/** Tür başına yaklaşık taç yarıçapı (blok): doğuş noktasında başın üstünde yaprak kalmasın diye (treeCrownNear). */
const CROWN_R = new Uint8Array(32).fill(4);
[[TREE.OAK, 3], [TREE.BIRCH, 3], [TREE.PINE, 3], [TREE.TALLPINE, 3], [TREE.CHERRY, 6], [TREE.CHERRY_BIG, 7], [TREE.JUNGLE, 8],
  [TREE.MANGROVE, 7], [TREE.BAOBAB, 7], [TREE.ACACIA, 5], [TREE.SAVANNA, 6]].forEach((p) => { CROWN_R[p[0]] = p[1]; });

/** (x,z) bir ağacın tacı (gövde + tür yarıçapı) altında mı? (spawn: doğuşta tepede yaprak olmasın) */
export function treeCrownNear(g, x, z) {
  const R = 9;
  const a = Math.floor((x - R) / TREE_CELL);
  const b = Math.floor((x + R) / TREE_CELL);
  const c = Math.floor((z - R) / TREE_CELL);
  const d = Math.floor((z + R) / TREE_CELL);
  const o = { x: 0, z: 0, y: 0, species: 0, hash: 0, biome: 0 };
  for (let cz = c; cz <= d; cz++) {
    for (let cx = a; cx <= b; cx++) {
      if (!treeInCell(g, cx, cz, o)) continue;
      const dx = o.x - x;
      const dz = o.z - z;
      const r = CROWN_R[o.species];
      if (dx * dx + dz * dz <= r * r) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------------------------------------
 * Bitkiler (sütun başına hash ile)
 * ---------------------------------------------------------------------------------------------- */
const SOIL_KINDS = 4; // 0 çimen/toprak, 1 ıslak (+çamur), 2 mantar (+miselyum), 3 kuru (kum, kül, bazalt)
const SOIL_OK = [];
for (let k = 0; k < SOIL_KINDS; k++) SOIL_OK.push(new Uint8Array(256));
[B.GRASS, B.DIRT, B.MOSS, B.SNOW_GRASS, B.FLOWERING_MOSS].forEach((id) => { SOIL_OK[0][id] = 1; });
[B.GRASS, B.DIRT, B.MOSS, B.MUD, B.CLAY].forEach((id) => { SOIL_OK[1][id] = 1; });
[B.GRASS, B.DIRT, B.MOSS, B.MUD, B.MYCELIUM, B.SNOW_GRASS, B.BASALT].forEach((id) => { SOIL_OK[2][id] = 1; });
[B.SAND, B.RED_SAND, B.DIRT, B.GRAVEL, B.ASH, B.BASALT, B.GRASS].forEach((id) => { SOIL_OK[3][id] = 1; });

/** Bitki kimliği → zemin türü (varsayılan 0). */
const PLANT_SOIL = new Uint8Array(256);
PLANT_SOIL[B.MUSHROOM] = 2;
PLANT_SOIL[B.REED] = 1;
PLANT_SOIL[B.DEAD_BUSH] = 3;

// biyom → [[bitki kimliği, olasılık], ...] (toplam < 1; kalan boş)
const PLANTS = [];
function PT(biome, list) {
  PLANTS[BIOME_ID[biome]] = list;
}
PT('cayir', [[B.TALL_GRASS, 0.16], [B.FLOWER_RED, 0.02], [B.FLOWER_YELLOW, 0.02], [B.DAISY, 0.015], [B.BLUEBELL, 0.006], [B.BUSH, 0.004]]);
PT('orman', [[B.TALL_GRASS, 0.09], [B.FERN, 0.03], [B.FLOWER_RED, 0.008], [B.FLOWER_YELLOW, 0.006], [B.BUSH, 0.012], [B.MUSHROOM, 0.004], [B.DAISY, 0.004]]);
PT('karacam', [[B.TALL_GRASS, 0.04], [B.FERN, 0.04], [B.BUSH, 0.006], [B.MUSHROOM, 0.012]]);
PT('bataklik', [[B.TALL_GRASS, 0.12], [B.REED, 0.05], [B.MUSHROOM, 0.012]]);
PT('dag', [[B.TALL_GRASS, 0.03], [B.FLOWER_RED, 0.004], [B.FLOWER_YELLOW, 0.004], [B.BUSH, 0.002], [B.MUSHROOM, 0.002]]);
PT('kristal', [[B.TALL_GRASS, 0.04], [B.MUSHROOM, 0.03]]);
PT('tundra', [[B.BUSH, 0.003]]);
PT('sonbahar', [[B.TALL_GRASS, 0.07], [B.FERN, 0.02], [B.MUSHROOM, 0.006], [B.BUSH, 0.01], [B.DEAD_BUSH, 0.006]]);
PT('kiraz', [[B.TALL_GRASS, 0.08], [B.PEONY, 0.03], [B.TULIP, 0.01], [B.DAISY, 0.02], [B.BLUEBELL, 0.008]]);
PT('yagmurorman', [[B.FERN, 0.2], [B.TALL_GRASS, 0.1], [B.MUSHROOM, 0.012], [B.BUSH, 0.01], [B.FLOWER_RED, 0.006]]);
PT('mangrov', [[B.REED, 0.08], [B.TALL_GRASS, 0.05], [B.FERN, 0.02]]);
PT('savan', [[B.TALL_GRASS, 0.14], [B.DEAD_BUSH, 0.012], [B.FLOWER_YELLOW, 0.008]]);
PT('taiga', [[B.FERN, 0.035], [B.TALL_GRASS, 0.02], [B.BUSH, 0.012]]);
PT('mantar', [[B.MUSHROOM, 0.06]]);
PT('bambu', [[B.TALL_GRASS, 0.12], [B.FERN, 0.05], [B.DAISY, 0.004]]);
PT('volkanik', [[B.DEAD_BUSH, 0.008]]);
PT('mercan', [[B.TALL_GRASS, 0.03], [B.DAISY, 0.005]]);
PT('cicek', [[B.TALL_GRASS, 0.08], [B.FLOWER_RED, 0.05], [B.FLOWER_YELLOW, 0.05], [B.DAISY, 0.06], [B.BLUEBELL, 0.05], [B.LAVENDER, 0.05], [B.TULIP, 0.05], [B.PEONY, 0.04]]);
PT('golge', [[B.MUSHROOM, 0.03], [B.FERN, 0.03], [B.TALL_GRASS, 0.02]]);
// kümülatif tablolar
const PLANT_CUM = PLANTS.map((l) => {
  if (!l) return null;
  let acc = 0;
  return l.map((p) => {
    acc += p[1];
    return [p[0], acc];
  });
});

export function placePlants(g, blocks, x0, z0, ht, biomeMap) {
  const seed = g.seed ^ 0x91a7;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const col = (lz << 4) + lx;
      const h = ht[col];
      if (h >= (blocks.length >> 8) - 8 || h < 4) continue;
      const top = blocks[(h << 8) + col];
      const hs = hash2(x0 + lx, z0 + lz, seed);
      const r = hs * INV32;
      const b = biomeMap[col];
      if (h <= SEA_LEVEL - 2) {
        // su altı: deniz yosunu
        if ((top === B.SAND || top === B.GRAVEL || top === B.CLAY) && r < 0.03) {
          const len = Math.min(2 + ((hs >>> 5) % 5), SEA_LEVEL - h - 1);
          for (let k = 1; k <= len; k++) {
            const i = ((h + k) << 8) + col;
            if (blocks[i] !== B.WATER) break;
            blocks[i] = B.VINE;
          }
        }
        continue;
      }
      if (h <= SEA_LEVEL) continue;
      const ia = ((h + 1) << 8) + col;
      if (blocks[ia] !== 0) continue;
      if (b === BIOME_ID.col || b === BIOME_ID.plaj) {
        if ((top === B.SAND || top === B.RED_SAND) && h > SEA_LEVEL + 1 && b === BIOME_ID.col && r < 0.011) {
          if ((lx > 0 && blocks[ia - 1] !== 0) || (lx < 15 && blocks[ia + 1] !== 0)
            || (lz > 0 && blocks[ia - 16] !== 0) || (lz < 15 && blocks[ia + 16] !== 0)) continue;
          const len = 1 + ((hs >>> 6) % 3);
          for (let k = 0; k < len; k++) {
            const i = ((h + 1 + k) << 8) + col;
            if (blocks[i] !== 0) break;
            blocks[i] = B.CACTUS;
          }
        } else if (b === BIOME_ID.col && (top === B.SAND || top === B.RED_SAND) && r > 0.97) {
          blocks[ia] = B.DEAD_BUSH;
        }
        continue;
      }
      if (b === BIOME_ID.kristal && r > 0.96 && top !== 0 && top !== B.WATER) {
        const len = 1 + ((hs >>> 7) % 3);
        for (let k = 0; k < len; k++) {
          const i = ((h + 1 + k) << 8) + col;
          if (blocks[i] !== 0) break;
          blocks[i] = B.AMETHYST;
        }
        continue;
      }
      const cum = PLANT_CUM[b];
      if (!cum) continue;
      for (let k = 0; k < cum.length; k++) {
        if (r < cum[k][1]) {
          const id = cum[k][0];
          if (SOIL_OK[PLANT_SOIL[id]][top] === 1) blocks[ia] = id;
          break;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Yüzen adalar (nadir)
 * ---------------------------------------------------------------------------------------------- */
const ISLAND_CELL = 96;
const ISLAND_P = [0.05, 0.1, 0.12, 0.14, 0.3];
const icol = makeCol();

/** Hücredeki yüzen ada ({x,y,z,rx,rz,ry,zone,hash}) ya da null. y = ada üst yüzey seviyesi. */
export function islandInCell(g, icx, icz) {
  if (!g.islands) g.islands = new Map();
  const key = (icx + 1024) * 4096 + (icz + 1024);
  let isl = g.islands.get(key);
  if (isl !== undefined) return isl;
  isl = null;
  const h = hash2(icx, icz, g.seed ^ 0x15a1);
  const x = icx * ISLAND_CELL + 28 + ((h >>> 10) & 255) / 255 * 40;
  const z = icz * ISLAND_CELL + 28 + ((h >>> 18) & 255) / 255 * 40;
  const zone = zoneIndexAt(x, z);
  if ((h & 1023) / 1024 < ISLAND_P[zone]) {
    const h2 = hash2(icx, icz, g.seed ^ 0x2b3c);
    const rx = 7 + (h2 & 7) * 1.4;
    const rz = rx * (0.75 + ((h2 >>> 3) & 7) * 0.07);
    const ry = 5 + ((h2 >>> 6) & 7) * 0.9;
    const y = 88 + ((h >>> 26) & 15);
    sampleColumn(g, Math.floor(x), Math.floor(z), icol);
    if (icol.h < y - 22 && !nearRing(x, z, rx + 8)) isl = { x, y, z, rx, rz, ry, zone, hash: h2 };
  }
  if (g.islands.size > 400) g.islands.clear();
  g.islands.set(key, isl);
  return isl;
}

/** Dikdörtgen bir alanla (blok) kesişen yüzen adalar. */
export function islandsInArea(g, xa, za, xb, zb) {
  const out = [];
  const ca = Math.floor((xa - 24) / ISLAND_CELL);
  const cb = Math.floor((xb + 24) / ISLAND_CELL);
  const da = Math.floor((za - 24) / ISLAND_CELL);
  const db = Math.floor((zb + 24) / ISLAND_CELL);
  for (let cz = da; cz <= db; cz++) {
    for (let cx = ca; cx <= cb; cx++) {
      const isl = islandInCell(g, cx, cz);
      if (!isl) continue;
      if (isl.x + isl.rx < xa || isl.x - isl.rx > xb || isl.z + isl.rz < za || isl.z - isl.rz > zb) continue;
      out.push(isl);
    }
  }
  return out;
}

const ISLAND_TOP = [B.GRASS, B.GRASS, B.SAND, B.SNOW, B.GRASS];
const ISLAND_FILL = [B.DIRT, B.DIRT, B.SANDSTONE, B.DIRT, B.STONE];
const ISLAND_TREE = [TREE.OAK, TREE.BIGOAK, TREE.ACACIA, TREE.PINE, TREE.BIRCH];

let _d2 = 0;
function islandTopY(N, isl, wx, wz) {
  const dx = (wx + 0.5 - isl.x) / isl.rx;
  const dz = (wz + 0.5 - isl.z) / isl.rz;
  const d2 = dx * dx + dz * dz + N.simplex2(wx * 0.1, wz * 0.1) * 0.2;
  _d2 = d2;
  if (d2 >= 1) return -1;
  return isl.y + Math.floor((1 - d2) * 2.2);
}

export function placeIslands(g, blocks, x0, z0) {
  const list = islandsInArea(g, x0 - 6, z0 - 6, x0 + 21, z0 + 21);
  if (list.length === 0) return;
  beginTrees(blocks, x0, z0);
  const N = g.c;
  for (let k = 0; k < list.length; k++) {
    const isl = list[k];
    const zone = isl.zone;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const topY = islandTopY(N, isl, x0 + lx, z0 + lz);
        if (topY < 0) continue;
        const d2 = _d2;
        const depth = Math.max(1, Math.floor(isl.ry * Math.pow(1 - d2, 0.7) * (0.85 + 0.3 * hv(lx, 0, lz, isl.hash))));
        const col = (lz << 4) + lx;
        for (let y = topY - depth; y <= topY; y++) {
          const i = (y << 8) + col;
          if (blocks[i] !== 0) continue;
          let id;
          if (y === topY) {
            id = ISLAND_TOP[zone];
            if (zone === 4) {
              const q = hv(lx, y, lz, isl.hash);
              if (q < 0.18) id = B.CRYSTAL_ROCK;
              else if (q < 0.4) id = B.BASALT;
            }
          } else if (y >= topY - 2) id = ISLAND_FILL[zone];
          else if (y === topY - depth && hv(lx, y, lz, isl.hash ^ 0x55) < 0.18) id = B.AMETHYST;
          else id = B.STONE;
          blocks[i] = id;
        }
        if (zone <= 1 && hv(lx, topY, lz, isl.hash ^ 0x99) < 0.12) {
          const ia = ((topY + 1) << 8) + col;
          if (blocks[ia] === 0) blocks[ia] = B.TALL_GRASS;
        }
      }
    }
    if (isl.rx >= 9) {
      const tx = Math.floor(isl.x);
      const tz = Math.floor(isl.z);
      const ty = islandTopY(N, isl, tx, tz);
      if (ty > 0) buildTree(ISLAND_TREE[zone], tx, ty + 1, tz, isl.hash);
    }
  }
}
