import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import {
  buildTreeCells, buildTreeEnumCells, growthCheck, growTimeFor, speciesOfSapling, treeHashFor,
} from './treeGrow.js';
import { LEAF_LUT, LOG_LUT } from './treefall.js';
import {
  TREE_BLOCK_DEFS, TREE_BLOCK_IDS, TREE_SPECIES, TREE_TUNING, isSaplingId,
} from './treeData.js';
import { BLOCKS } from './blocks.js';
import { ITEMS, itemToBlockId } from './items.js';

describe('treeData: fidan blok ve eşyaları', () => {
  it('250–253 kimlikli çapraz bitkiler; eşya anahtarı blok anahtarı + yerleştirir', () => {
    expect(TREE_BLOCK_DEFS).toHaveLength(4);
    TREE_SPECIES.forEach((sp, i) => {
      const id = sp.sapling;
      expect(isSaplingId(id)).toBe(true);
      expect(BLOCKS[id].key).toBe(sp.key + '_fidanı');
      expect(BLOCKS[id].shape).toBe('cross');
      expect(BLOCKS[id].solid).toBe(false);
      expect(BLOCKS[id].hardness).toBe(0);
      expect(BLOCKS[id].placeable).toBe(true);
      expect(BLOCKS[id].buildable).toBe(false); // haritada yasak (id > 99)
      expect(BLOCKS[id].drops).toBe('self');
      const item = ITEMS['blok:' + sp.key + '_fidanı'];
      expect(item).toBeTruthy();
      expect(itemToBlockId(item.key)).toBe(id);
      expect(speciesOfSapling(id)).toBe(i);
    });
    expect(Object.values(TREE_BLOCK_IDS)).toEqual([250, 251, 252, 253]);
    expect(isSaplingId(249)).toBe(false);
    expect(isSaplingId(254)).toBe(false);
    expect(speciesOfSapling(99)).toBe(-1);
  });

  it('yapraklar fidan bırakabilir (blok tanımı)', () => {
    TREE_SPECIES.forEach((sp) => {
      const leaf = BLOCKS.find((b) => b && b.key === sp.leaf);
      expect(leaf.drops.some((d) => d.item === 'blok:' + sp.key + '_fidanı' && d.chance > 0)).toBe(true);
    });
  });

  it('ayarlar mantıklı', () => {
    expect(TREE_TUNING.fallMin).toBe(1.2);
    expect(TREE_TUNING.fallMax).toBe(1.8);
    expect(TREE_TUNING.maxLogs).toBe(600);
    expect(TREE_TUNING.bigBlocks).toBe(300);
    expect(TREE_TUNING.leafSteps).toBe(4);
  });
});

describe('treeGrow', () => {
  it('büyüme süresi belirlenimci ve [growMin, growMax] aralığında; konuma göre değişir', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const t = growTimeFor(12345, i, 41, i * 3);
      expect(t).toBeGreaterThanOrEqual(TREE_TUNING.growMin);
      expect(t).toBeLessThanOrEqual(TREE_TUNING.growMax);
      expect(growTimeFor(12345, i, 41, i * 3)).toBe(t);
      seen.add(Math.round(t));
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(treeHashFor(1, 2, 3, 4)).toBe(treeHashFor(1, 2, 3, 4));
    expect(treeHashFor(1, 2, 3, 4)).not.toBe(treeHashFor(2, 2, 3, 4));
  });

  it('dört tür: gövde fidan hücresinden başlar, yaprak var, belirlenimci, doğru kütük/yaprak türü', () => {
    const kinds = [[B.LOG_OAK, B.LEAVES_OAK], [B.LOG_BIRCH, B.LEAVES_BIRCH], [B.LOG_PINE, B.LEAVES_PINE], [B.LOG_ACACIA, B.LEAVES_ACACIA]];
    kinds.forEach((k, sp) => {
      const a = buildTreeCells(sp, 100, 41, 100, 777);
      const b = buildTreeCells(sp, 100, 41, 100, 777);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const logs = a.filter((c) => LOG_LUT[c.id] === 1);
      const leaves = a.filter((c) => LEAF_LUT[c.id] === 1);
      expect(logs.length).toBeGreaterThanOrEqual(4);
      expect(leaves.length).toBeGreaterThanOrEqual(10);
      expect(logs.every((c) => c.id === k[0])).toBe(true);
      expect(leaves.every((c) => c.id === k[1])).toBe(true);
      expect(logs.some((c) => c.x === 100 && c.y === 41 && c.z === 100)).toBe(true);
      expect(Math.min(...logs.map((c) => c.y))).toBe(41);
    });
  });

  it('chunk sınırında (x=15/16) kesitler birleşir: eksiksiz ağaç, çift hücre yok', () => {
    const cells = buildTreeCells(0, 15, 41, 15, 321);
    const keys = new Set(cells.map((c) => c.x + ',' + c.y + ',' + c.z));
    expect(keys.size).toBe(cells.length);
    expect(Math.min(...cells.map((c) => c.x))).toBeLessThan(16);
    expect(Math.max(...cells.map((c) => c.x))).toBeGreaterThanOrEqual(16);
    expect(Math.max(...cells.map((c) => c.z))).toBeGreaterThanOrEqual(16);
    // negatif koordinat
    const neg = buildTreeCells(2, -1, 41, -1, 321);
    expect(Math.min(...neg.map((c) => c.x))).toBeLessThan(-1);
    expect(neg.filter((c) => LOG_LUT[c.id] === 1).length).toBeGreaterThan(5);
  });

  it('büyük meşe / uzun çam gibi ham ağaç sayıları da üretilir', () => {
    expect(buildTreeEnumCells(4, 0, 41, 0, 5).length).toBeGreaterThan(80);
    expect(buildTreeEnumCells(6, 0, 41, 0, 5).filter((c) => LOG_LUT[c.id] === 1).length).toBeGreaterThanOrEqual(12);
    expect(buildTreeEnumCells(99, 0, 41, 0, 5)).toBeTruthy();
  });

  it('growthCheck: boş/bitki/yaprak serbest, katı engel, üretilmemiş bilinmiyor', () => {
    const cells = buildTreeCells(1, 0, 41, 0, 9);
    const world = new Map();
    const get = (x, y, z) => (world.has(x + ',' + y + ',' + z) ? world.get(x + ',' + y + ',' + z) : 0);
    expect(growthCheck(get, cells, { x: 0, y: 41, z: 0 })).toBe('ok');
    world.set('0,41,0', 250); // fidanın kendisi
    expect(growthCheck(get, cells, { x: 0, y: 41, z: 0 })).toBe('ok');
    world.set('0,44,0', B.STONE);
    expect(growthCheck(get, cells, { x: 0, y: 41, z: 0 })).toBe('blocked');
    world.set('0,44,0', B.TALL_GRASS);
    expect(growthCheck(get, cells, { x: 0, y: 41, z: 0 })).toBe('ok');
    world.set('0,44,0', B.LEAVES_OAK);
    expect(growthCheck(get, cells, { x: 0, y: 41, z: 0 })).toBe('ok');
    expect(growthCheck((_x, y) => (y === 43 ? null : 0), cells, { x: 0, y: 41, z: 0 })).toBe('unknown');
  });
});
