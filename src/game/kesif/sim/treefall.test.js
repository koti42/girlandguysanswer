import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import {
  FALL_DIRS, LEAF_LUT, LOG_LUT, detectTreeFall, findOrphanLeaves, isLeafId, isLogId, pickFallDir,
} from './treefall.js';
import { buildTreeEnumCells } from './treeGrow.js';
import { computeFellDrops, dropBoost, stackify } from './treeDrops.js';
import { TREE_TUNING } from './treeData.js';

const GROUND_Y = 10;
const R = 40;

function makeWorld(opts) {
  const o = opts || {};
  const blocks = new Map();
  const edits = new Map();
  const k = (x, y, z) => x + ',' + y + ',' + z;
  const w = {
    blocks,
    edits,
    getBlock(x, y, z) {
      if (x < -R || x > R || z < -R || z > R) return o.unloadedOutside === false ? 0 : null;
      if (y <= GROUND_Y) return blocks.has(k(x, y, z)) ? blocks.get(k(x, y, z)) : B.DIRT;
      return blocks.get(k(x, y, z)) || 0;
    },
    set(x, y, z, id) {
      if (id === 0) blocks.delete(k(x, y, z));
      else blocks.set(k(x, y, z), id);
    },
    setPlaced(x, y, z, id) {
      w.set(x, y, z, id);
      edits.set(k(x, y, z), id);
    },
    put(cells) {
      for (let i = 0; i < cells.length; i++) w.set(cells[i].x, cells[i].y, cells[i].z, cells[i].id);
    },
  };
  return w;
}

function plantTree(w, species, tx, tz, hash) {
  const cells = buildTreeEnumCells(species, tx, GROUND_Y + 1, tz, hash === undefined ? 12345 : hash);
  w.put(cells);
  return cells;
}

const logsOf = (cells) => cells.filter((c) => LOG_LUT[c.id] === 1);
const leavesOf = (cells) => cells.filter((c) => LEAF_LUT[c.id] === 1);

describe('treefall: sınıflandırma', () => {
  it('kütük ve yaprak kimlikleri blok anahtarlarından gelir', () => {
    [B.LOG_OAK, B.LOG_BIRCH, B.LOG_PINE, B.LOG_ACACIA].forEach((id) => expect(isLogId(id)).toBe(true));
    [B.LEAVES_OAK, B.LEAVES_BIRCH, B.LEAVES_PINE, B.LEAVES_ACACIA].forEach((id) => expect(isLeafId(id)).toBe(true));
    [B.PLANKS_OAK, B.DIRT, B.STONE, B.VINE, 0].forEach((id) => {
      expect(isLogId(id)).toBe(false);
      expect(isLeafId(id)).toBe(false);
    });
  });
});

describe('treefall: tek gövde', () => {
  it('tabandan kesilen meşe: üstündeki tüm kütükler + yapraklar devrilir', () => {
    const w = makeWorld();
    const cells = plantTree(w, 0, 3, 4);
    const logs = logsOf(cells);
    const base = { x: 3, y: GROUND_Y + 1, z: 4 };
    w.set(base.x, base.y, base.z, 0);
    const r = detectTreeFall(w, base, { seed: 7 });
    expect(r).not.toBeNull();
    expect(r.logs.length).toBe(logs.length - 1);
    expect(r.logs.every((c) => c.y > base.y)).toBe(true);
    expect(r.leaves.length).toBe(leavesOf(cells).length);
    expect(r.minY).toBe(base.y + 1);
    expect(r.count).toBe(r.logs.length + r.leaves.length);
    expect(r.hinge.y).toBe(base.y + 1);
    // her bileşen gerçek bir ağaç bloğudur
    r.logs.forEach((c) => expect(w.getBlock(c.x, c.y, c.z)).toBe(c.id));
    r.leaves.forEach((c) => expect(w.getBlock(c.x, c.y, c.z)).toBe(c.id));
  });

  it('dört ağaç türü de devrilir (huş, çam, akasya, meşe)', () => {
    [0, 1, 2, 3].forEach((sp) => {
      const w = makeWorld();
      const cells = plantTree(w, sp, 0, 0, 999 + sp);
      const base = { x: 0, y: GROUND_Y + 1, z: 0 };
      w.set(base.x, base.y, base.z, 0);
      const r = detectTreeFall(w, base, { seed: 1 });
      expect(r, 'tür ' + sp).not.toBeNull();
      expect(r.logs.length).toBeGreaterThanOrEqual(logsOf(cells).length - 1);
      expect(r.leaves.length).toBeGreaterThan(5);
    });
  });

  it('çatallı gövde (akasya dalı ve büyük meşe dalları) birlikte devrilir', () => {
    const w = makeWorld();
    const cells = plantTree(w, 3, 5, 5, 31);
    const base = { x: 5, y: GROUND_Y + 1, z: 5 };
    w.set(base.x, base.y, base.z, 0);
    const r = detectTreeFall(w, base, { seed: 2 });
    expect(r).not.toBeNull();
    expect(r.logs.length).toBe(logsOf(cells).length - 1);
    const xs = new Set(r.logs.map((c) => c.x + ',' + c.z));
    expect(xs.size).toBeGreaterThan(1); // yan dal da dahil
  });

  it('ara gövde kesilirse yalnız kesimin ÜSTÜ devrilir, alt kütük kalır', () => {
    const w = makeWorld();
    const cells = plantTree(w, 1, 2, 2, 5); // huş: 6-8 kütük
    const logs = logsOf(cells);
    const cut = { x: 2, y: GROUND_Y + 3, z: 2 };
    w.set(cut.x, cut.y, cut.z, 0);
    const r = detectTreeFall(w, cut, { seed: 3 });
    expect(r).not.toBeNull();
    expect(r.minY).toBe(cut.y + 1);
    expect(r.logs.length).toBe(logs.filter((c) => c.y > cut.y).length);
    // alt kütükler (y 11,12) dünyada durur
    expect(w.getBlock(2, GROUND_Y + 1, 2)).toBe(B.LOG_BIRCH);
    expect(w.getBlock(2, GROUND_Y + 2, 2)).toBe(B.LOG_BIRCH);
    r.logs.forEach((c) => expect(c.y).toBeGreaterThan(cut.y));
  });

  it('tepedeki (en üst) kütük kırılınca altı destekli: devrilme yok', () => {
    const w = makeWorld();
    const cells = plantTree(w, 0, 0, 0, 77);
    const topLog = logsOf(cells).sort((a, b) => b.y - a.y)[0];
    w.set(topLog.x, topLog.y, topLog.z, 0);
    expect(detectTreeFall(w, topLog, { seed: 1 })).toBeNull();
  });

  it('tepe (yamaç) üzerindeki ağaç: yan zemin yüksek olsa da devrilir; kesilmemiş ağaç sabit kalır', () => {
    const w = makeWorld();
    // gövdenin batısında bir tümsek (aynı seviyede katı zemin)
    for (let z = -2; z <= 2; z++) for (let y = GROUND_Y + 1; y <= GROUND_Y + 2; y++) w.set(-1, y, z, B.STONE);
    const cells = plantTree(w, 0, 0, 0, 91);
    const base = { x: 0, y: GROUND_Y + 1, z: 0 };
    // kesmeden önce: taban kütüğü komşu hücrede (tohum yok) → null
    expect(detectTreeFall(w, { x: 9, y: GROUND_Y + 1, z: 9 }, { seed: 1 })).toBeNull();
    w.set(base.x, base.y, base.z, 0);
    const r = detectTreeFall(w, base, { seed: 4 });
    expect(r).not.toBeNull();
    expect(r.logs.length).toBe(logsOf(cells).length - 1);
  });
});

describe('treefall: çok gövdeli (cangıl) ağaç', () => {
  function jungle(w) {
    const logs = [];
    for (let y = GROUND_Y + 1; y <= GROUND_Y + 9; y++) {
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach((p) => {
        w.set(p[0], y, p[1], B.LOG_OAK);
        logs.push({ x: p[0], y, z: p[1], id: B.LOG_OAK });
      });
    }
    for (let dy = 0; dy <= 3; dy++) {
      for (let dz = -3; dz <= 4; dz++) {
        for (let dx = -3; dx <= 4; dx++) {
          if (w.getBlock(dx, GROUND_Y + 8 + dy, dz) === 0) w.set(dx, GROUND_Y + 8 + dy, dz, B.LEAVES_OAK);
        }
      }
    }
    return logs;
  }

  it('bir gövdeyi kesmek yetmez; dördü de kesilince tüm ağaç devrilir', () => {
    const w = makeWorld();
    jungle(w);
    const y = GROUND_Y + 1;
    [[0, 0], [1, 0], [0, 1]].forEach((p) => {
      w.set(p[0], y, p[1], 0);
      expect(detectTreeFall(w, { x: p[0], y, z: p[1] }, { seed: 1 })).toBeNull();
    });
    w.set(1, y, 1, 0);
    const r = detectTreeFall(w, { x: 1, y, z: 1 }, { seed: 1 });
    expect(r).not.toBeNull();
    expect(r.logs.length).toBe(4 * 8);
    expect(r.leaves.length).toBeGreaterThan(50);
  });
});

describe('treefall: ağaç olmayanlar', () => {
  it('oyuncunun koyduğu kütük sütunu ve evi asla çökmez', () => {
    const w = makeWorld();
    for (let y = GROUND_Y + 1; y <= GROUND_Y + 8; y++) w.setPlaced(0, y, 0, B.LOG_OAK);
    // kütük ev: duvar halkası
    for (let x = 5; x <= 8; x++) for (let z = 5; z <= 8; z++) {
      if (x === 5 || x === 8 || z === 5 || z === 8) for (let y = GROUND_Y + 1; y <= GROUND_Y + 3; y++) w.setPlaced(x, y, z, B.LOG_PINE);
    }
    w.set(0, GROUND_Y + 1, 0, 0);
    w.edits.set('0,' + (GROUND_Y + 1) + ',0', 0);
    expect(detectTreeFall(w, { x: 0, y: GROUND_Y + 1, z: 0 }, { seed: 1 })).toBeNull();
    w.set(5, GROUND_Y + 1, 5, 0);
    expect(detectTreeFall(w, { x: 5, y: GROUND_Y + 1, z: 5 }, { seed: 1 })).toBeNull();
  });

  it('oyuncu kütük sütununun üstüne doğal yaprak değse bile kütükler ağaç sayılmaz', () => {
    const w = makeWorld();
    for (let y = GROUND_Y + 1; y <= GROUND_Y + 6; y++) w.setPlaced(0, y, 0, B.LOG_OAK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.set(dx, GROUND_Y + 7, dz, B.LEAVES_OAK);
    w.set(0, GROUND_Y + 1, 0, 0);
    expect(detectTreeFall(w, { x: 0, y: GROUND_Y + 1, z: 0 }, { seed: 1 })).toBeNull();
  });

  it('yapraksız (< 3 yaprak) doğal kütük yığını ağaç sayılmaz', () => {
    const w = makeWorld();
    for (let y = GROUND_Y + 1; y <= GROUND_Y + 5; y++) w.set(0, y, 0, B.LOG_OAK);
    w.set(1, GROUND_Y + 5, 0, B.LEAVES_OAK);
    w.set(-1, GROUND_Y + 5, 0, B.LEAVES_OAK);
    w.set(0, GROUND_Y + 1, 0, 0);
    expect(detectTreeFall(w, { x: 0, y: GROUND_Y + 1, z: 0 }, { seed: 1 })).toBeNull();
  });

  it('yalnız yaprak kümesi: tohum yok', () => {
    const w = makeWorld();
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) w.set(dx, GROUND_Y + 8, dz, B.LEAVES_OAK);
    expect(detectTreeFall(w, { x: 0, y: GROUND_Y + 7, z: 0 }, { seed: 1 })).toBeNull();
  });

  it('yapı sahipli (isProtected) ağaç devrilmez', () => {
    const w = makeWorld();
    plantTree(w, 0, 0, 0, 3);
    w.set(0, GROUND_Y + 1, 0, 0);
    const r = detectTreeFall(w, { x: 0, y: GROUND_Y + 1, z: 0 }, { seed: 1, isProtected: () => true });
    expect(r).toBeNull();
    // yalnız yaprak koruması: yaprak < 3 → null
    const ok = detectTreeFall(w, { x: 0, y: GROUND_Y + 1, z: 0 }, { seed: 1, isProtected: (x, y) => y > GROUND_Y + 5 });
    expect(ok === null || ok.leaves.length >= 3).toBe(true);
  });

  it('üretilmemiş chunk kenarındaki ağaca dokunulmaz', () => {
    const w = makeWorld();
    plantTree(w, 0, R, 0, 3);
    w.set(R, GROUND_Y + 1, 0, 0);
    expect(detectTreeFall(w, { x: R, y: GROUND_Y + 1, z: 0 }, { seed: 1 })).toBeNull();
  });

  it('600 kütük üst sınırı: dev yığın ağaç sayılmaz', () => {
    const w = makeWorld({ unloadedOutside: false });
    for (let y = GROUND_Y + 1; y <= GROUND_Y + 1 + 700; y++) w.set(0, y, 0, B.LOG_OAK);
    for (let dx = -2; dx <= 2; dx++) w.set(dx, GROUND_Y + 700, 1, B.LEAVES_OAK);
    w.set(0, GROUND_Y + 1, 0, 0);
    expect(detectTreeFall(w, { x: 0, y: GROUND_Y + 1, z: 0 }, { seed: 1 })).toBeNull();
    // küçük bir tavanla normal ağaç da reddedilir
    const w2 = makeWorld();
    plantTree(w2, 4, 0, 0, 12);
    w2.set(0, GROUND_Y + 1, 0, 0);
    expect(detectTreeFall(w2, { x: 0, y: GROUND_Y + 1, z: 0 }, { seed: 1, maxLogs: 3 })).toBeNull();
    expect(TREE_TUNING.maxLogs).toBe(600);
  });
});

describe('treefall: komşu ağaç ve yaprak sahipliği', () => {
  it('yaprakları değen iki ağaç: yalnız kesilen ağacın kütükleri ve ona yakın yapraklar gider', () => {
    const w = makeWorld();
    const a = plantTree(w, 0, 0, 0, 21);
    const b = plantTree(w, 0, 3, 1, 22);
    const aLogs = logsOf(a);
    const bLogs = logsOf(b);
    const base = { x: 0, y: GROUND_Y + 1, z: 0 };
    w.set(base.x, base.y, base.z, 0);
    const r = detectTreeFall(w, base, { seed: 1 });
    expect(r).not.toBeNull();
    const bKeys = new Set(bLogs.map((c) => c.x + ',' + c.y + ',' + c.z));
    expect(r.logs.some((c) => bKeys.has(c.x + ',' + c.y + ',' + c.z))).toBe(false);
    expect(r.logs.length).toBe(aLogs.length - 1);
    // B ağacının yaprakları büyük oranda yerinde kalır
    const bLeafKeys = new Set(leavesOf(b).map((c) => c.x + ',' + c.y + ',' + c.z));
    const taken = r.leaves.filter((c) => bLeafKeys.has(c.x + ',' + c.y + ',' + c.z)).length;
    expect(taken).toBeLessThan(leavesOf(b).length * 0.5);
  });

  it('bitişik iki gövde (26 komşu) birbirine bağlıysa biri kesilince diğeri destekler: devrilme yok', () => {
    const w = makeWorld();
    plantTree(w, 0, 0, 0, 21);
    // yanındaki ikinci gövde ilkine değiyor
    for (let y = GROUND_Y + 1; y <= GROUND_Y + 5; y++) w.set(1, y, 0, B.LOG_OAK);
    w.set(0, GROUND_Y + 1, 0, 0);
    expect(detectTreeFall(w, { x: 0, y: GROUND_Y + 1, z: 0 }, { seed: 1 })).toBeNull();
  });
});

describe('treefall: yön ve belirlenimcilik', () => {
  it('kıran kişiden uzağa devrilir; kıran yoksa tohumdan özetlenir', () => {
    const base = { x: 10, y: 20, z: 10 };
    expect(FALL_DIRS[pickFallDir(1, base, { x: 5, z: 10.5 })]).toMatchObject({ dx: 1, dz: 0 });
    expect(FALL_DIRS[pickFallDir(1, base, { x: 15, z: 10.5 })]).toMatchObject({ dx: -1, dz: 0 });
    expect(FALL_DIRS[pickFallDir(1, base, { x: 10.5, z: 4 })]).toMatchObject({ dx: 0, dz: 1 });
    expect(pickFallDir(5, base, null)).toBe(pickFallDir(5, base, null));
    const seen = new Set();
    for (let s = 0; s < 40; s++) seen.add(pickFallDir(s, { x: s, y: 3, z: 2 * s }, null));
    expect(seen.size).toBeGreaterThan(3);
    FALL_DIRS.forEach((d) => expect(Math.hypot(d.dx, d.dz)).toBeCloseTo(1, 6));
  });

  it('aynı girdi → aynı sonuç (bloklar, sıra, yön)', () => {
    const run = () => {
      const w = makeWorld();
      plantTree(w, 4, 6, 6, 4242);
      const base = { x: 6, y: GROUND_Y + 1, z: 6 };
      w.set(base.x, base.y, base.z, 0);
      return detectTreeFall(w, base, { seed: 99, breaker: { x: 2, z: 3 } });
    };
    const a = run();
    const b = run();
    expect(a).not.toBeNull();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (let i = 1; i < a.logs.length; i++) expect(a.logs[i].y).toBeGreaterThanOrEqual(a.logs[i - 1].y);
  });

  it('büyük ağaç işareti: 300 bloktan fazlası "big"', () => {
    const w = makeWorld();
    plantTree(w, 4, 0, 0, 5);
    const base = { x: 0, y: GROUND_Y + 1, z: 0 };
    w.set(base.x, base.y, base.z, 0);
    const r = detectTreeFall(w, base, { seed: 1 });
    expect(r.big).toBe(r.count > TREE_TUNING.bigBlocks);
  });
});

describe('treefall: yaprak çürümesi', () => {
  it('kütüksüz kalan yapraklar yetim; kütüğe bağlı yapraklar değil; oyuncu yaprağı sayılmaz', () => {
    const w = makeWorld();
    const cells = plantTree(w, 0, 0, 0, 21);
    const box = {
      x0: -6, x1: 6, y0: GROUND_Y + 1, y1: GROUND_Y + 14, z0: -6, z1: 6,
    };
    expect(findOrphanLeaves(w, box)).toHaveLength(0);
    // kütükleri sil → hepsi yetim
    logsOf(cells).forEach((c) => w.set(c.x, c.y, c.z, 0));
    const orphans = findOrphanLeaves(w, box);
    expect(orphans.length).toBe(leavesOf(cells).length);
    // oyuncunun koyduğu yaprak yetim sayılmaz
    const lf = leavesOf(cells)[0];
    w.edits.set(lf.x + ',' + lf.y + ',' + lf.z, lf.id);
    expect(findOrphanLeaves(w, box).length).toBe(leavesOf(cells).length - 1);
  });

  it('kütük çıkarılınca (devrilmeyen dal) yalnız uzakta kalan yapraklar yetim olur', () => {
    const w = makeWorld();
    const cells = plantTree(w, 0, 0, 0, 21);
    const top = logsOf(cells).sort((a, b) => b.y - a.y)[0];
    w.set(top.x, top.y, top.z, 0);
    const box = {
      x0: top.x - 5, x1: top.x + 5, y0: top.y - 5, y1: top.y + 5, z0: top.z - 5, z1: top.z + 5,
    };
    const orphans = findOrphanLeaves(w, box);
    // gövdenin geri kalanı yaprakları 4 adımda tutar: doğal ağaç sağlam
    expect(orphans.length).toBeLessThan(leavesOf(cells).length * 0.4);
  });
});

describe('treefall: eşya düşüşleri', () => {
  function felled() {
    const w = makeWorld();
    const cells = plantTree(w, 4, 0, 0, 5);
    const base = { x: 0, y: GROUND_Y + 1, z: 0 };
    w.set(base.x, base.y, base.z, 0);
    return { r: detectTreeFall(w, base, { seed: 1 }), cells };
  }
  const seq = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  it('kütük sayısı kadar kütük, fidan en çok 3, belirlenimci', () => {
    const { r } = felled();
    const a = computeFellDrops(r, seq(7), {});
    const b = computeFellDrops(r, seq(7), {});
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const logs = a.items.filter((i) => /_kütük$/.test(i.item)).reduce((n, i) => n + i.count, 0);
    expect(logs).toBe(r.logs.length);
    const saplings = a.items.filter((i) => /_fidanı$/.test(i.item)).reduce((n, i) => n + i.count, 0);
    expect(saplings).toBeLessThanOrEqual(3);
    expect(a.logs).toBe(r.logs.length);
    expect(a.leaves).toBe(r.leaves.length);
  });

  it('Servet/Yağmacı/Verimlilik düşüşleri artırır (ortalamada)', () => {
    const { r } = felled();
    let base = 0;
    let boosted = 0;
    for (let s = 1; s <= 60; s++) {
      base += computeFellDrops(r, seq(s), {}).items.filter((i) => i.item === 'item:sopa').reduce((n, i) => n + i.count, 0);
      boosted += computeFellDrops(r, seq(s), { mods: { fortune: 3, luck: 1, digMul: 2 } }).items
        .filter((i) => i.item === 'item:sopa').reduce((n, i) => n + i.count, 0);
    }
    expect(boosted).toBeGreaterThan(base * 1.5);
    expect(dropBoost(null)).toBe(1);
    expect(dropBoost({ fortune: 3, luck: 1, digMul: 3 })).toBeLessThanOrEqual(2.5);
    expect(dropBoost({ fortune: 0, luck: 0, digMul: 1 })).toBe(1);
  });

  it('stackify: yığın bütçesini aşmaz ve toplam adet korunur', () => {
    const items = [{ item: 'blok:meşe_kütük', count: 90 }, { item: 'item:sopa', count: 33 }, { item: 'blok:meşe_fidanı', count: 3 }];
    const st = stackify(items, { maxStacks: 16 });
    expect(st.length).toBeLessThanOrEqual(16);
    const sum = (k) => st.filter((s) => s.item === k).reduce((n, s) => n + s.count, 0);
    expect(sum('blok:meşe_kütük')).toBe(90);
    expect(sum('item:sopa')).toBe(33);
    expect(sum('blok:meşe_fidanı')).toBe(3);
    st.forEach((s) => expect(s.count).toBeGreaterThan(0));
  });
});
