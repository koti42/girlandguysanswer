/*
 * Her doğal ağaç türü (worldgenFlora.TREE) tabandan kesilince devrilir; devrilen kütük/yapraklar çıkarılınca geriye
 * (yetim yaprak çürümesi dışında) büyük bir kalıntı kalmaz: dev cangıl, mangrov, kiraz, karanlık meşe, sonbahar, baobab, palmiye…
 */
import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { LEAF_LUT, LOG_LUT, detectTreeFall, findOrphanLeaves } from './treefall.js';
import { buildTreeEnumCells } from './treeGrow.js';
import { TREE } from './worldgenFlora.js';

const GROUND_Y = 10;
const R = 60;

function makeWorld() {
  const blocks = new Map();
  const k = (x, y, z) => x + ',' + y + ',' + z;
  return {
    blocks,
    edits: new Map(),
    getBlock(x, y, z) {
      if (x < -R || x > R || z < -R || z > R) return null;
      if (y <= GROUND_Y) return blocks.has(k(x, y, z)) ? blocks.get(k(x, y, z)) : B.DIRT;
      return blocks.get(k(x, y, z)) || 0;
    },
    set(x, y, z, id) {
      if (id === 0) blocks.delete(k(x, y, z));
      else blocks.set(k(x, y, z), id);
    },
  };
}

// kütüğü olmayan "ağaç"lar (bambu bitkidir, mercan/buz sivri) devrilme kapsamı dışındadır
const SKIP = new Set(['BAMBOO', 'CORAL', 'ICE_SPIKE', 'DEAD_TREE', 'MUSH_RED', 'MUSH_PURPLE', 'MUSH_RED_BIG']); // dev mantarlar kütük/yaprak değil
const SPECIES = Object.keys(TREE).filter((n) => !SKIP.has(n));

describe('treefall: tüm ağaç türleri', () => {
  SPECIES.forEach((name) => {
    it(name + ': tabandan kesilince devrilir ve geride yetim taç kalmaz', () => {
      let tested = 0;
      for (let h = 0; h < 6; h++) {
        const w = makeWorld();
        const cells = buildTreeEnumCells(TREE[name], 0, GROUND_Y + 1, 0, 777 + h * 4099);
        w.blocks.clear();
        cells.forEach((c) => w.set(c.x, c.y, c.z, c.id));
        const logs = cells.filter((c) => LOG_LUT[c.id] === 1);
        const leaves = cells.filter((c) => LEAF_LUT[c.id] === 1);
        if (logs.length < 3 || leaves.length < 3) continue; // yaprak/kütük şartı sağlamayan örnek
        // çok gövdeli türler (2×2 dev cangıl, karanlık meşe, baobab): zeminde duran TÜM gövde tabanları kesilir
        const bases = logs.filter((c) => c.y === GROUND_Y + 1);
        const base = bases.filter((c) => c.x === 0 && c.z === 0)[0] || bases[0] || logs.slice().sort((a, b) => a.y - b.y)[0];
        bases.forEach((c) => w.set(c.x, c.y, c.z, 0));
        if (!bases.length) w.set(base.x, base.y, base.z, 0);
        const r = detectTreeFall(w, base, { seed: 5 });
        expect(r, name + ' h' + h).not.toBeNull();
        // çok gövdeli türlerde gövdelerden biri yerde kalır; ama kesim gövdesi devrilir
        expect(r.logs.length).toBeGreaterThanOrEqual(Math.min(logs.length - bases.length, 3));
        r.logs.forEach((c) => w.set(c.x, c.y, c.z, 0));
        r.leaves.forEach((c) => w.set(c.x, c.y, c.z, 0));
        const box = { x0: -20, x1: 20, y0: GROUND_Y, y1: GROUND_Y + 70, z0: -20, z1: 20 };
        const left = findOrphanLeaves(w, box, { max: 100000 }).length;
        // devrilmeyen kalıntı yaprak: kalan kütüğe bağlı olmayanlar (çürüme halleder) toplamın en çok %35'i
        expect(left, name + ' h' + h + ' yetim').toBeLessThanOrEqual(Math.ceil(leaves.length * 0.35));
        tested++;
      }
      expect(tested).toBeGreaterThan(0);
    });
  });
});
