import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { hash3 } from './rng.js';
import {
  blockSelectionBoxes, createRayHit, hasLineOfSight, pickTarget, rayAABB, raycastBlocks, raycastEntities,
} from './raycast.js';

function makeWorld(fill) {
  const edits = new Map();
  return {
    getBlock(x, y, z) {
      const k = x + ',' + y + ',' + z;
      if (edits.has(k)) return edits.get(k);
      return fill ? fill(x, y, z) : 0;
    },
    setBlock(x, y, z, id) {
      edits.set(x + ',' + y + ',' + z, id);
    },
  };
}

const O = (x, y, z) => ({ x, y, z });

describe('rayAABB', () => {
  it('isabet: giriş t ve yüz normali', () => {
    const f = { nx: 0, ny: 0, nz: 0 };
    const t = rayAABB(0, 0.5, 0.5, 1, 0, 0, 2, 0, 0, 3, 1, 1, f);
    expect(t).toBeCloseTo(2, 9);
    expect(f).toEqual({ nx: -1, ny: 0, nz: 0 });
    const t2 = rayAABB(5, 0.5, 0.5, -1, 0, 0, 2, 0, 0, 3, 1, 1, f);
    expect(t2).toBeCloseTo(2, 9);
    expect(f.nx).toBe(1);
    const t3 = rayAABB(0.5, 5, 0.5, 0, -1, 0, 0, 0, 0, 1, 1, 1, f);
    expect(t3).toBeCloseTo(4, 9);
    expect(f.ny).toBe(1);
  });
  it('kaçırma ve paralel eksen', () => {
    expect(rayAABB(0, 2, 0.5, 1, 0, 0, 2, 0, 0, 3, 1, 1)).toBe(-1); // paralel, dışarıda
    expect(rayAABB(0, 0.5, 0.5, -1, 0, 0, 2, 0, 0, 3, 1, 1)).toBe(-1); // ters yön
    expect(rayAABB(0, 0.5, 5, 1, 0, 0, 2, 0, 0, 3, 1, 1)).toBe(-1);
  });
  it('başlangıç kutunun içindeyse t=0', () => {
    const f = { nx: 0, ny: 0, nz: 0 };
    expect(rayAABB(0.5, 0.5, 0.5, 1, 0, 0, 0, 0, 0, 1, 1, 1, f)).toBe(0);
    expect(f.nx).toBe(-1);
  });
  it('köşegen yön: teğet/kenar durumları NaN üretmez', () => {
    const t = rayAABB(0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2);
    expect(t).toBeCloseTo(1, 9);
  });
});

describe('raycastBlocks — küp', () => {
  const w = makeWorld((x, y, z) => (x === 3 && y === 1 && z === 0 ? B.STONE : 0));
  it('düz isabet: hücre, yüz, t, nokta, yerleştirme hücresi', () => {
    const h = raycastBlocks(w, O(0.5, 1.5, 0.5), O(1, 0, 0), 10);
    expect(h).not.toBeNull();
    expect([h.x, h.y, h.z]).toEqual([3, 1, 0]);
    expect(h.id).toBe(B.STONE);
    expect(h.face).toEqual({ nx: -1, ny: 0, nz: 0 });
    expect(h.t).toBeCloseTo(2.5, 9);
    expect(h.point.x).toBeCloseTo(3, 9);
    expect(h.placeAt).toEqual({ x: 2, y: 1, z: 0 });
  });
  it('dir normalleştirilir; menzil dışı null', () => {
    const h = raycastBlocks(w, O(0.5, 1.5, 0.5), O(5, 0, 0), 10);
    expect(h.t).toBeCloseTo(2.5, 9);
    expect(raycastBlocks(w, O(0.5, 1.5, 0.5), O(1, 0, 0), 2.4)).toBeNull();
    expect(raycastBlocks(w, O(0.5, 1.5, 0.5), O(1, 0, 0), 2.6)).not.toBeNull();
    expect(raycastBlocks(w, O(0.5, 1.5, 0.5), O(0, 0, 0), 5)).toBeNull();
  });
  it('tüm eksenlerde ve ters yönde yüzler doğru', () => {
    const w2 = makeWorld((x, y, z) => (x === 0 && y === 0 && z === 0 ? B.STONE : 0));
    const cases = [
      [O(5.5, 0.5, 0.5), O(-1, 0, 0), { nx: 1, ny: 0, nz: 0 }],
      [O(-4.5, 0.5, 0.5), O(1, 0, 0), { nx: -1, ny: 0, nz: 0 }],
      [O(0.5, 6.5, 0.5), O(0, -1, 0), { nx: 0, ny: 1, nz: 0 }],
      [O(0.5, -3.5, 0.5), O(0, 1, 0), { nx: 0, ny: -1, nz: 0 }],
      [O(0.5, 0.5, 6.5), O(0, 0, -1), { nx: 0, ny: 0, nz: 1 }],
      [O(0.5, 0.5, -2.5), O(0, 0, 1), { nx: 0, ny: 0, nz: -1 }],
    ];
    cases.forEach(([o, d, face]) => {
      const h = raycastBlocks(w2, o, d, 20);
      expect(h).not.toBeNull();
      expect(h.face).toEqual(face);
      expect([h.x, h.y, h.z]).toEqual([0, 0, 0]);
      expect(h.placeAt).toEqual({ x: face.nx, y: face.ny, z: face.nz });
    });
  });
  it('başlangıç katı bloğun içindeyse t=0', () => {
    const h = raycastBlocks(w, O(3.5, 1.5, 0.5), O(1, 0, 0), 5);
    expect(h.t).toBe(0);
    expect([h.x, h.y, h.z]).toEqual([3, 1, 0]);
  });
  it('rastgele ışınlar yavaş referans ile uyuşur', () => {
    const world = makeWorld((x, y, z) => (hash3(x, y, z, 77) % 7 === 0 ? B.STONE : 0));
    const slow = (o, d, max) => {
      const len = Math.hypot(d.x, d.y, d.z);
      for (let t = 0; t <= max; t += 0.002) {
        const px = o.x + (d.x / len) * t;
        const py = o.y + (d.y / len) * t;
        const pz = o.z + (d.z / len) * t;
        if (world.getBlock(Math.floor(px), Math.floor(py), Math.floor(pz)) !== 0) {
          return { t, cell: [Math.floor(px), Math.floor(py), Math.floor(pz)] };
        }
      }
      return null;
    };
    let compared = 0;
    for (let i = 0; i < 400; i++) {
      const h1 = hash3(i, 1, 2, 5) / 4294967296;
      const h2 = hash3(i, 3, 4, 5) / 4294967296;
      const h3 = hash3(i, 5, 6, 5) / 4294967296;
      const o = O(h1 * 10 - 5, h2 * 10 + 40, h3 * 10 - 5);
      const d = O(hash3(i, 7, 8, 5) / 4294967296 - 0.5, hash3(i, 9, 1, 5) / 4294967296 - 0.5, hash3(i, 2, 7, 5) / 4294967296 - 0.5);
      if (world.getBlock(Math.floor(o.x), Math.floor(o.y), Math.floor(o.z)) !== 0) continue;
      const ref = slow(o, d, 12);
      const got = raycastBlocks(world, o, d, 12);
      if (!ref) {
        expect(got).toBeNull();
      } else {
        expect(got).not.toBeNull();
        expect(Math.abs(got.t - ref.t)).toBeLessThan(0.0045);
        expect([got.x, got.y, got.z]).toEqual(ref.cell);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });
  it('out parametresi aynı nesneyi yeniden kullanır', () => {
    const out = createRayHit();
    const a = raycastBlocks(w, O(0.5, 1.5, 0.5), O(1, 0, 0), 10, { out });
    expect(a).toBe(out);
    const miss = raycastBlocks(w, O(0.5, 5.5, 0.5), O(1, 0, 0), 10, { out });
    expect(miss).toBeNull();
  });
  it('üretilmemiş chunk (null) ışını durdurur, isabet yok', () => {
    const w3 = makeWorld((x) => (x >= 3 ? null : 0));
    expect(raycastBlocks(w3, O(0.5, 1.5, 0.5), O(1, 0, 0), 10)).toBeNull();
  });
  it('dünya dışı yükseklikte (y<0) hava sayılır, hata yok', () => {
    const w4 = makeWorld(() => B.STONE);
    expect(() => raycastBlocks(w4, O(0.5, -5, 0.5), O(0, 1, 0), 20)).not.toThrow();
    expect(raycastBlocks(w4, O(0.5, -5, 0.5), O(0, 1, 0), 20).y).toBe(0);
  });
});

describe('raycastBlocks — küp olmayan şekiller', () => {
  it('slab: üstünden geçer, yanından çarpar, üstten inince 1,5 yükseklikte durur', () => {
    const w = makeWorld((x, y, z) => (x === 3 && y === 1 && z === 0 ? B.SLAB : 0));
    expect(raycastBlocks(w, O(0.5, 1.8, 0.5), O(1, 0, 0), 10)).toBeNull();
    const side = raycastBlocks(w, O(0.5, 1.3, 0.5), O(1, 0, 0), 10);
    expect(side.t).toBeCloseTo(2.5, 9);
    expect(side.face.nx).toBe(-1);
    const top = raycastBlocks(w, O(3.5, 5, 0.5), O(0, -1, 0), 10);
    expect(top.point.y).toBeCloseTo(1.5, 9);
    expect(top.face.ny).toBe(1);
    expect(top.placeAt).toEqual({ x: 3, y: 2, z: 0 });
  });
  it('merdiven: yalnızca dolu kısımlar isabet eder', () => {
    const w = makeWorld((x, y, z) => (x === 3 && y === 1 && z === 0 ? B.STAIRS : 0));
    // üst basamak z<0.5; y yerel 0.7
    const hi = raycastBlocks(w, O(0.5, 1.7, 0.25), O(1, 0, 0), 10);
    expect(hi).not.toBeNull();
    expect(hi.t).toBeCloseTo(2.5, 9);
    expect(raycastBlocks(w, O(0.5, 1.7, 0.75), O(1, 0, 0), 10)).toBeNull();
    // alt kısım her yerde
    expect(raycastBlocks(w, O(0.5, 1.3, 0.75), O(1, 0, 0), 10)).not.toBeNull();
  });
  it('çit: üst hücreden (1..1,5) bakınca da hedeflenir', () => {
    const w = makeWorld((x, y, z) => (x === 3 && y === 1 && z === 0 ? B.FENCE : 0));
    const hit = raycastBlocks(w, O(0.5, 2.3, 0.5), O(1, 0, 0), 10);
    expect(hit).not.toBeNull();
    expect(hit.t).toBeCloseTo(2.875, 9);
    expect(hit.y).toBe(1);
    expect(hit.face.nx).toBe(-1);
    // direğin yanından geç
    expect(raycastBlocks(w, O(0.5, 2.3, 0.2), O(1, 0, 0), 10)).toBeNull();
    // yukarıdan inen ışın direğin tepesine (y=2,5) çarpar
    const top = raycastBlocks(w, O(3.5, 6, 0.5), O(0, -1, 0), 10);
    expect(top.point.y).toBeCloseTo(2.5, 9);
    expect(top.face.ny).toBe(1);
    expect(top.placeAt).toEqual({ x: 3, y: 2, z: 0 });
  });
  it('meşale, çiçek, plaka: küçük seçim kutuları; köşeden geçen ışın kaçırır', () => {
    const w = makeWorld((x, y, z) => {
      if (x === 3 && z === 0 && y === 1) return B.TORCH;
      if (x === 3 && z === 5 && y === 1) return B.FLOWER_RED;
      if (x === 3 && z === 9 && y === 1) return B.PRESSURE_PLATE;
      return 0;
    });
    expect(raycastBlocks(w, O(0.5, 1.4, 0.5), O(1, 0, 0), 10)).not.toBeNull();
    expect(raycastBlocks(w, O(0.5, 1.4, 0.05), O(1, 0, 0), 10)).toBeNull();
    expect(raycastBlocks(w, O(0.5, 1.4, 5.5), O(1, 0, 0), 10)).not.toBeNull();
    expect(raycastBlocks(w, O(0.5, 1.95, 5.5), O(1, 0, 0), 10)).toBeNull(); // çiçek 0,9 yüksek
    const plate = raycastBlocks(w, O(3.5, 4, 9.5), O(0, -1, 0), 10);
    expect(plate.point.y).toBeCloseTo(1.125, 9);
    expect(plate.id).toBe(B.PRESSURE_PLATE);
  });
  it('replaceable: ot/çiçek yerleştirmede kendi hücresi; kaktüs/sarmaşık değil', () => {
    const w = makeWorld((x, y, z) => {
      if (x === 3 && z === 0 && y === 1) return B.TALL_GRASS;
      if (x === 3 && z === 3 && y === 1) return B.VINE;
      if (x === 3 && z === 6 && y === 1) return B.CACTUS;
      return 0;
    });
    const g = raycastBlocks(w, O(0.5, 1.4, 0.5), O(1, 0, 0), 10);
    expect(g.replaceable).toBe(true);
    expect(g.placeAt).toEqual({ x: 3, y: 1, z: 0 });
    const v = raycastBlocks(w, O(0.5, 1.4, 3.5), O(1, 0, 0), 10);
    expect(v.replaceable).toBe(false);
    expect(v.placeAt).toEqual({ x: 2, y: 1, z: 3 });
    const c = raycastBlocks(w, O(0.5, 1.5, 6.5), O(1, 0, 0), 10);
    expect(c.replaceable).toBe(false);
    expect(c.t).toBeCloseTo(2.5625, 9);
  });
  it('sıvı: varsayılan geçer; hitLiquid ile hedeflenir; portal bloğu hayalet', () => {
    const w = makeWorld((x, y, z) => (x === 3 && y === 1 && z === 0 ? B.WATER : x === 3 && y === 1 && z === 4 ? B.PORTAL_BLUE : 0));
    expect(raycastBlocks(w, O(0.5, 1.5, 0.5), O(1, 0, 0), 10)).toBeNull();
    const h = raycastBlocks(w, O(0.5, 1.5, 0.5), O(1, 0, 0), 10, { hitLiquid: true });
    expect(h.id).toBe(B.WATER);
    expect(h.t).toBeCloseTo(2.5, 9);
    expect(raycastBlocks(w, O(0.5, 1.5, 4.5), O(1, 0, 0), 10, { hitLiquid: true })).toBeNull();
  });
  it('blockSelectionBoxes: hava boş, slab yarım, çit 1,5', () => {
    expect(blockSelectionBoxes(0)).toEqual([]);
    expect(blockSelectionBoxes(B.SLAB)[0][4]).toBe(0.5);
    expect(blockSelectionBoxes(B.FENCE)[0][4]).toBe(1.5);
    expect(blockSelectionBoxes(B.TORCH).length).toBe(1);
    expect(blockSelectionBoxes(B.STONE)).toEqual([[0, 0, 0, 1, 1, 1]]);
    expect(blockSelectionBoxes(999)).toEqual([]);
  });
});

describe('raycastEntities / pickTarget / görüş hattı', () => {
  const ents = [
    { id: 'a', x: 5, y: 1, z: 0.5, w: 0.6, h: 1.8 },
    { id: 'b', x: 8, y: 1, z: 0.5, w: 0.6, h: 1.8 },
    { id: 'c', x: -4, y: 1, z: 0.5, w: 0.6, h: 1.8 },
  ];
  it('en yakın varlığı bulur; arkadakini ve menzil dışını yok sayar', () => {
    const h = raycastEntities(ents, O(0.5, 1.6, 0.5), O(1, 0, 0), 20);
    expect(h.entity.id).toBe('a');
    expect(h.t).toBeCloseTo(4.2, 9);
    expect(h.face.nx).toBe(-1);
    expect(raycastEntities(ents, O(0.5, 1.6, 0.5), O(1, 0, 0), 3)).toBeNull();
    expect(raycastEntities(ents, O(0.5, 1.6, 0.5), O(-1, 0, 0), 20).entity.id).toBe('c');
    expect(raycastEntities(ents, O(0.5, 3.5, 0.5), O(1, 0, 0), 20)).toBeNull();
  });
  it('filtre, pad (hedef yardımı), Map ve boş girdiler', () => {
    const h = raycastEntities(ents, O(0.5, 1.6, 0.5), O(1, 0, 0), 20, { filter: (e) => e.id !== 'a' });
    expect(h.entity.id).toBe('b');
    expect(raycastEntities(ents, O(0.5, 1.6, 1.0), O(1, 0, 0), 20)).toBeNull();
    expect(raycastEntities(ents, O(0.5, 1.6, 1.0), O(1, 0, 0), 20, { pad: 0.3 }).entity.id).toBe('a');
    const m = new Map(ents.map((e) => [e.id, e]));
    expect(raycastEntities(m, O(0.5, 1.6, 0.5), O(1, 0, 0), 20).entity.id).toBe('a');
    expect(raycastEntities([], O(0, 0, 0), O(1, 0, 0), 5)).toBeNull();
    expect(raycastEntities(null, O(0, 0, 0), O(1, 0, 0), 5)).toBeNull();
  });
  it('pickTarget: blok varlığın önündeyse varlık yok sayılır', () => {
    const w = makeWorld((x, y, z) => (x === 3 && y === 1 && z === 0 ? B.STONE : 0));
    const p = pickTarget(w, ents, O(0.5, 1.6, 0.5), O(1, 0, 0), 20);
    expect(p.kind).toBe('block');
    expect(p.entity).toBeNull();
    const w2 = makeWorld();
    const p2 = pickTarget(w2, ents, O(0.5, 1.6, 0.5), O(1, 0, 0), 20);
    expect(p2.kind).toBe('entity');
    expect(p2.entity.entity.id).toBe('a');
    const p3 = pickTarget(w2, [], O(0.5, 1.6, 0.5), O(1, 0, 0), 20);
    expect(p3.kind).toBeNull();
  });
  it('hasLineOfSight: katı engeller keser, çiçek/meşale keser değil', () => {
    const w = makeWorld((x, y, z) => {
      if (x === 3 && y === 1 && z === 0) return B.STONE;
      if (x === 3 && y === 1 && z === 4) return B.FLOWER_RED;
      if (x === 3 && y === 1 && z === 8) return B.SLAB;
      return 0;
    });
    expect(hasLineOfSight(w, 0.5, 1.5, 0.5, 6.5, 1.5, 0.5)).toBe(false);
    expect(hasLineOfSight(w, 0.5, 1.5, 4.5, 6.5, 1.5, 4.5)).toBe(true);
    expect(hasLineOfSight(w, 0.5, 1.2, 8.5, 6.5, 1.2, 8.5)).toBe(false);
    expect(hasLineOfSight(w, 0.5, 1.8, 8.5, 6.5, 1.8, 8.5)).toBe(true);
    expect(hasLineOfSight(w, 0.5, 1.5, 0.5, 0.5, 1.5, 0.5)).toBe(true);
  });
});
