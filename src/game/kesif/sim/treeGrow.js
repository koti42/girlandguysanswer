/*
 * KEŞİF sim — FİDAN → AĞAÇ büyümesi (saf, belirlenimci; Math.random/Date.now yok).
 *
 *   speciesOfSapling(blockId) → TREE_SPECIES indeksi | -1
 *   growTimeFor(seed, x, y, z) → sn          fidanın yüklü dünyada ağaç olma süresi (growMin..growMax; konuma bağlı)
 *   treeHashFor(seed, x, y, z) → uint32      ağaç şeklini belirleyen özet
 *   buildTreeCells(speciesIdx, x, y, z, hash) → [{x,y,z,id}]   worldgenFlora.buildTree çıktısı (dünyadaki ağaçlarla AYNI şekiller)
 *   growthCheck(getBlock, cells, sapling) → 'ok' | 'blocked' | 'unknown'    kütük hücreleri boş/bitki/yaprak olmalı
 *
 * buildTree yalnız chunk kesitine yazar; tohum ağacı en çok dört chunk'a değer. Her kesit için geçici bir chunk dizisi kurulur,
 * sonuç dizinden okunur (indeks ((y*16)+z)*16+x; constants.voxelIndex ile aynı). Testler yerleşimi doğrular.
 */
import { GEN_TOP_Y } from './constants.js';
import { BLOCKS } from './blocks.js';
import { hash3 } from './rng.js';
import { TREE_SPECIES, TREE_TUNING } from './treeData.js';
import { beginTrees, buildTree } from './worldgenFlora.js';
import { LEAF_LUT, LOG_LUT } from './treefall.js';

export function speciesOfSapling(id) {
  for (let i = 0; i < TREE_SPECIES.length; i++) if (TREE_SPECIES[i].sapling === id) return i;
  return -1;
}

export function growTimeFor(seed, x, y, z) {
  const h = hash3(x | 0, y | 0, z | 0, (seed | 0) ^ 0x1f3d5b);
  const k = (h & 1023) / 1024;
  return TREE_TUNING.growMin + (TREE_TUNING.growMax - TREE_TUNING.growMin) * k;
}

export function treeHashFor(seed, x, y, z) {
  return hash3(x | 0, y | 0, z | 0, (seed | 0) ^ 0x6a09e6);
}

let scratch = null;

/** Bir tohum ağacının tüm hücreleri (kütük + yaprak), (y, x, z) sıralı. y = gövde tabanı (fidanın bulunduğu hücre). */
export function buildTreeCells(speciesIdx, x, y, z, hash) {
  const sp = TREE_SPECIES[speciesIdx];
  return sp ? buildTreeEnumCells(sp.treeIndex, x, y, z, hash) : [];
}

/** worldgenFlora.TREE sayısıyla (büyük meşe, uzun çam, söğüt dahil) aynı. */
export function buildTreeEnumCells(treeEnum, x, y, z, hash) {
  // derin dünya: ağaçlar yüzey bandı penceresi (y 0..GEN_TOP_Y-1) içinde kurulur; yer altı (y < 1) fidanı ağaç olmaz
  if (y < 1 || y >= GEN_TOP_Y - 41) return [];
  if (!scratch) scratch = new Uint8Array(GEN_TOP_Y << 8);
  const out = [];
  const cxa = (x - 8) >> 4;
  const cxb = (x + 8) >> 4;
  const cza = (z - 8) >> 4;
  const czb = (z + 8) >> 4;
  const yLo = Math.max(0, y - 1);
  const yHi = y + 40;
  for (let cz = cza; cz <= czb; cz++) {
    for (let cx = cxa; cx <= cxb; cx++) {
      const x0 = cx * 16;
      const z0 = cz * 16;
      beginTrees(scratch, x0, z0);
      buildTree(treeEnum, x, y, z, hash);
      const i0 = yLo << 8;
      const i1 = Math.min(scratch.length, (yHi + 1) << 8);
      for (let i = i0; i < i1; i++) {
        const id = scratch[i];
        if (id === 0) continue;
        scratch[i] = 0;
        out.push({
          x: x0 + (i & 15), y: i >> 8, z: z0 + ((i >> 4) & 15), id,
        });
      }
    }
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
  return out;
}

function replaceableForLog(id) {
  if (id === 0) return true;
  if (LEAF_LUT[id] === 1) return true;
  const b = BLOCKS[id];
  return !!b && b.shape === 'cross' && b.hardness === 0 && !b.liquid;
}

/** Kütük hücreleri yerleşebilir mi? (fidanın kendisi serbest). 'unknown': bir hücre üretilmemiş chunk'ta. */
export function growthCheck(getBlock, cells, sapling) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (LOG_LUT[c.id] !== 1) continue;
    const cur = getBlock(c.x, c.y, c.z);
    if (cur === null) return 'unknown';
    if (sapling && c.x === sapling.x && c.y === sapling.y && c.z === sapling.z) continue;
    if (!replaceableForLog(cur)) return 'blocked';
  }
  return 'ok';
}
