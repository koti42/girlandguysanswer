/*
 * Yapı zemini düzleştirme (terraform) ağaçları tümüyle siler: gövdesi temizlik alanında kalan ağacın tacı alan dışına taşsa bile
 * havada asılı yaprak halkası kalmaz (eski davranış: yalnız alan sütunlarındaki bitkiler silindi → yapı yakınındaki ağaçların ~%23'ü
 * gövdesiz, asılı taçla kaldı). Sonuç chunk sınırından bağımsızdır.
 */
import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { DenseChunk } from './denseChunk.js';
import { makeChunkW, isFloraId } from './structuresKit.js';
import { circleShape, terraform } from './structuresTerrain.js';
import { TREE, beginTrees, buildTree, treeInCell } from './worldgenFlora.js';
import { getGen } from './worldgenTerrain.js';

const SEED = 20260;

function flatChunk(cx, cz, h) {
  const c = new DenseChunk(cx, cz, 368);
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      c.set(lx, 0, lz, B.BEDROCK);
      for (let y = 1; y < h; y++) c.set(lx, y, lz, B.STONE);
      c.set(lx, h, lz, B.GRASS);
    }
  }
  c.recomputeHeightMap();
  c.generated = true;
  return c;
}

function findTree(species) {
  const g = getGen(SEED);
  const o = { x: 0, z: 0, y: 0, species: 0, hash: 0, biome: 0 };
  for (let r = 6; r < 400; r++) {
    for (let ccz = -r; ccz <= r; ccz++) {
      for (const ccx of [-r, r]) {
        if (treeInCell(g, ccx, ccz, o) && species.indexOf(o.species) >= 0 && (o.x & 15) >= 7 && (o.x & 15) <= 9 && (o.z & 15) >= 7 && (o.z & 15) <= 9) return { ...o };
      }
    }
  }
  return null;
}

function floraCount(chunks) {
  let n = 0;
  chunks.forEach((c) => {
    for (let i = 0; i < c.blocks.length; i++) if (c.blocks[i] !== 0 && isFloraId(c.blocks[i])) n++;
  });
  return n;
}

describe('terraform: ağaç ayak izi', () => {
  it('gövdesi alanda kalan ağaç tacıyla birlikte silinir (3×3 chunk, sınır bağımsız)', () => {
    const t = findTree([TREE.OAK, TREE.BIGOAK, TREE.BIRCH, TREE.PINE, TREE.CHERRY]);
    expect(t).not.toBeNull();
    const cx = t.x >> 4;
    const cz = t.z >> 4;
    const chunks = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.push(flatChunk(cx + dx, cz + dz, t.y - 1));
    chunks.forEach((c) => {
      beginTrees(c.blocks, c.cx * 16, c.cz * 16);
      buildTree(t.species, t.x, t.y, t.z, t.hash);
      c.recomputeHeightMap();
    });
    const before = floraCount(chunks);
    expect(before).toBeGreaterThan(20);
    // küçük platform (yarıçap 1, kenar 0): temizlik alanı yalnız ±4 blok; taç bundan geniştir
    chunks.forEach((c) => {
      const W = makeChunkW(c, { seed: SEED });
      terraform(W, circleShape(t.x, t.z, 1), t.y - 1, 0);
    });
    expect(floraCount(chunks)).toBe(0);
  });

  it('gövdesi alan DIŞINDAKİ ağaç silinmez (yalnız alandaki sütunlar temizlenir)', () => {
    const t = findTree([TREE.OAK, TREE.BIGOAK, TREE.BIRCH, TREE.PINE]);
    const cx = t.x >> 4;
    const cz = t.z >> 4;
    const chunks = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.push(flatChunk(cx + dx, cz + dz, t.y - 1));
    chunks.forEach((c) => {
      beginTrees(c.blocks, c.cx * 16, c.cz * 16);
      buildTree(t.species, t.x, t.y, t.z, t.hash);
      c.recomputeHeightMap();
    });
    const before = floraCount(chunks);
    // platform 20 blok uzakta: ağaç alan dışında
    chunks.forEach((c) => {
      const W = makeChunkW(c, { seed: SEED });
      terraform(W, circleShape(t.x + 20, t.z, 1), t.y - 1, 0);
    });
    expect(floraCount(chunks)).toBe(before);
  });

  it('ctx.seed yoksa (kuru çalıştırma) eski sütun temizliği çalışır, hata vermez', () => {
    const c = flatChunk(0, 0, 40);
    const W = makeChunkW(c, null);
    expect(() => terraform(W, circleShape(8, 8, 2), 40, 2)).not.toThrow();
  });
});
