/* global process */
import { describe, expect, it } from 'vitest';
import { ColliderIndex } from './colliderIndex.js';
import { hash32 } from '../rng.js';

function rnd(seed) {
  let i = 0;
  return () => hash32((seed + Math.imul(++i, 0x9e3779b1)) | 0) / 4294967296;
}

/** 1/16 katlarına oturtulmuş rastgele kutu. */
function randBox(r, span, maxSize) {
  const q = (v) => Math.round(v * 16) / 16;
  const x0 = q((r() - 0.5) * span);
  const y0 = q(60 + r() * 20);
  const z0 = q((r() - 0.5) * span);
  return [x0, y0, z0, x0 + q(0.0625 + r() * maxSize), y0 + q(0.0625 + r() * maxSize), z0 + q(0.0625 + r() * maxSize)];
}

function brute(boxes, q) {
  const hit = [];
  boxes.forEach((e) => {
    const b = e.box;
    if (b[0] < q[3] && b[3] > q[0] && b[1] < q[4] && b[4] > q[1] && b[2] < q[5] && b[5] > q[2]) hit.push(e.id);
  });
  return hit.sort((a, b) => a - b);
}

function idsOf(idx, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(idx.ids[i]);
  return out.sort((a, b) => a - b);
}

describe('ColliderIndex — temel', () => {
  it('ekle / sorgula / sil / var mı', () => {
    const idx = new ColliderIndex();
    const out = new Float64Array(64 * 6);
    expect(idx.add(7, [[0, 64, 0, 1, 65, 1], [2, 64, 0, 3, 66, 1]])).toBe(2);
    expect(idx.has(7)).toBe(true);
    expect(idx.size).toBe(2);
    const n = idx.queryRaw(0.5, 64.5, 0.5, 0.6, 64.6, 0.6, out, 64);
    expect(n).toBe(1);
    expect(Array.from(out.slice(0, 6))).toEqual([0, 64, 0, 1, 65, 1]);
    expect(idx.ids[0]).toBe(7);
    expect(idx.queryRaw(1.0, 64, 0, 2.0, 65, 1, out, 64)).toBe(0); // dokunma kesişim sayılmaz
    expect(idx.remove(7)).toBe(true);
    expect(idx.has(7)).toBe(false);
    expect(idx.size).toBe(0);
    expect(idx.queryRaw(-10, 0, -10, 10, 100, 10, out, 64)).toBe(0);
    expect(idx.remove(7)).toBe(false);
  });

  it('aynı id yeniden eklenince eski kutular silinir', () => {
    const idx = new ColliderIndex();
    const out = new Float64Array(64 * 6);
    idx.add(1, [[0, 0, 0, 1, 1, 1]]);
    idx.add(1, [[10, 0, 0, 11, 1, 1]]);
    expect(idx.size).toBe(1);
    expect(idx.queryRaw(0, 0, 0, 1, 1, 1, out, 64)).toBe(0);
    expect(idx.queryRaw(10, 0, 0, 11, 1, 1, out, 64)).toBe(1);
  });

  it('geçersiz kutular reddedilir: NaN, ters, sonsuz, dev', () => {
    const idx = new ColliderIndex();
    expect(idx.add(1, [[NaN, 0, 0, 1, 1, 1]])).toBe(0);
    expect(idx.add(2, [[1, 0, 0, 0, 1, 1]])).toBe(0);
    expect(idx.add(3, [[0, 0, 0, Infinity, 1, 1]])).toBe(0);
    expect(idx.add(4, [[0, 0, 0, 5000, 1, 1]])).toBe(0);
    expect(idx.add(5, null)).toBe(0);
    expect(idx.add(6, [[0, 0, 0, 1, 1, 1], null, [0, 0, 0, 1, NaN, 1]])).toBe(1);
    expect(idx.size).toBe(1);
    const out = new Float64Array(6 * 64);
    expect(idx.queryRaw(NaN, 0, 0, 1, 1, 1, out, 64)).toBe(0);
    expect(idx.queryRaw(0, 0, 0, Infinity, 1, 1, out, 64)).toBe(0);
  });

  it('en çok 8 kutu/id; max sınırı sorgu çıktısını keser', () => {
    const idx = new ColliderIndex();
    const many = [];
    for (let i = 0; i < 20; i++) many.push([i, 0, 0, i + 0.5, 1, 1]);
    expect(idx.add(1, many)).toBe(8);
    const out = new Float64Array(64 * 6);
    for (let i = 0; i < 100; i++) idx.add(100 + i, [[0, 0, 0, 0.5, 1, 0.5]]);
    expect(idx.queryRaw(0, 0, 0, 0.5, 1, 0.5, out, 64)).toBe(64);
    expect(idx.queryRaw(0, 0, 0, 0.5, 1, 0.5, out, 5)).toBe(5);
  });

  it('kutular tam saklanır (1/16 katları ve ondalıklar)', () => {
    const idx = new ColliderIndex();
    idx.add(9, [[100.0625, 64, -200.9375, 101.5, 65.4375, -199.0625]]);
    expect(idx.boxesOf(9)[0]).toEqual([100.0625, 64, -200.9375, 101.5, 65.4375, -199.0625]);
  });

  it('dinamik kutu: oluştur, taşı (hücre değiştir), hız, kaldır', () => {
    const idx = new ColliderIndex();
    const out = new Float64Array(64 * 6);
    expect(idx.setDynamic(5, { minX: 0, minY: 64, minZ: 0, maxX: 2, maxY: 65, maxZ: 2 }, { x: 1, y: 0, z: 0 })).toBe(true);
    expect(idx.dynCount).toBe(1);
    expect(idx.queryRaw(0.5, 64.2, 0.5, 1, 64.8, 1, out, 64)).toBe(1);
    expect(idx.vel[idx.slots[0] * 3]).toBe(1);
    for (let i = 1; i <= 100; i++) {
      idx.setDynamic(5, [i * 0.5, 64, 0, i * 0.5 + 2, 65, 2], { x: 1, y: 0, z: 0 });
    }
    expect(idx.size).toBe(1);
    expect(idx.queryRaw(0.5, 64.2, 0.5, 1, 64.8, 1, out, 64)).toBe(0);
    expect(idx.queryRaw(50.5, 64.2, 0.5, 51, 64.8, 1, out, 64)).toBe(1);
    expect(idx.setDynamic(5, null)).toBe(false);
    expect(idx.has(5)).toBe(false);
    expect(idx.dynCount).toBe(0);
    expect(idx.setDynamic(6, [0, 0, 0, NaN, 1, 1])).toBe(false);
  });

  it('statik id dinamik olarak yeniden kurulursa temiz geçiş', () => {
    const idx = new ColliderIndex();
    idx.add(3, [[0, 0, 0, 1, 1, 1], [3, 0, 0, 4, 1, 1]]);
    idx.setDynamic(3, [0, 0, 0, 1, 1, 1]);
    expect(idx.size).toBe(1);
    expect(idx.dynCount).toBe(1);
    idx.add(3, [[0, 0, 0, 1, 1, 1]]);
    expect(idx.dynCount).toBe(0);
  });

  it('clear her şeyi boşaltır ve yeniden kullanılabilir', () => {
    const idx = new ColliderIndex();
    for (let i = 0; i < 300; i++) idx.add(i, [[i, 0, 0, i + 1, 1, 1]]);
    idx.clear();
    expect(idx.size).toBe(0);
    const out = new Float64Array(64 * 6);
    expect(idx.queryRaw(-1000, -1000, -1000, 1000, 1000, 1000, out, 64)).toBe(0);
    idx.add(1, [[0, 0, 0, 1, 1, 1]]);
    expect(idx.queryRaw(0, 0, 0, 1, 1, 1, out, 64)).toBe(1);
  });
});

describe('ColliderIndex — kaba kuvvete karşı', () => {
  it('2000 kutu, 5000 sorgu, ekle/sil/taşı karışık: sonuçlar kaba kuvvetle aynı', () => {
    const r = rnd(42);
    const idx = new ColliderIndex();
    const out = new Float64Array(256 * 6);
    const live = new Map(); // id → {id, box}
    let nextId = 1;
    const addOne = () => {
      const box = randBox(r, 400, 3);
      const id = nextId++;
      idx.add(id, [box]);
      live.set(id, { id, box });
    };
    for (let i = 0; i < 2000; i++) addOne();
    let mismatches = 0;
    for (let i = 0; i < 5000; i++) {
      const roll = r();
      if (roll < 0.15) addOne();
      else if (roll < 0.3 && live.size > 0) {
        const keys = Array.from(live.keys());
        const id = keys[Math.floor(r() * keys.length)];
        idx.remove(id);
        live.delete(id);
      } else if (roll < 0.4 && live.size > 0) {
        const keys = Array.from(live.keys());
        const id = keys[Math.floor(r() * keys.length)];
        const box = randBox(r, 400, 3);
        idx.setDynamic(id, box, { x: 0, y: 0, z: 0 });
        live.set(id, { id, box: box.map((v) => Math.fround(v)) });
      }
      const qb = randBox(r, 400, 12);
      const n = idx.queryRaw(qb[0], qb[1], qb[2], qb[3], qb[4], qb[5], out, 256);
      const want = brute(Array.from(live.values()), qb);
      const got = idsOf(idx, n);
      if (got.length !== want.length || got.some((v, k) => v !== want[k])) mismatches++;
      // çıktı kutuları gerçekten sorgu ile kesişiyor
      for (let k = 0; k < n; k++) {
        const o = k * 6;
        expect(out[o] < qb[3] && out[o + 3] > qb[0] && out[o + 1] < qb[4] && out[o + 4] > qb[1] && out[o + 2] < qb[5] && out[o + 5] > qb[2]).toBe(true);
      }
    }
    expect(mismatches).toBe(0);
    expect(idx.size).toBe(live.size);
  });

  it('dev sorgu hacmi (yuva taraması) de kaba kuvvetle aynı', () => {
    const r = rnd(7);
    const idx = new ColliderIndex();
    const list = [];
    for (let i = 1; i <= 500; i++) {
      const box = randBox(r, 300, 2);
      idx.add(i, [box]);
      list.push({ id: i, box });
    }
    const out = new Float64Array(256 * 6);
    const q = [-150, 0, -150, 150, 200, 150];
    const n = idx.queryRaw(q[0], q[1], q[2], q[3], q[4], q[5], out, 256);
    expect(n).toBe(Math.min(256, brute(list, q).length));
  });

  it('çok sayıda ekle/sil sonrası hücre tablosu yeniden kurulur ve doğru kalır', () => {
    const idx = new ColliderIndex({ capacity: 16 });
    const r = rnd(99);
    const out = new Float64Array(64 * 6);
    const boxes = [];
    for (let i = 1; i <= 8000; i++) {
      const box = randBox(r, 1600, 1);
      idx.add(i, [box]);
      boxes.push({ id: i, box });
    }
    for (let i = 1; i <= 8000; i += 2) idx.remove(i);
    const live = boxes.filter((b) => b.id % 2 === 0);
    for (let t = 0; t < 400; t++) {
      const qb = randBox(r, 1600, 20);
      const n = idx.queryRaw(qb[0], qb[1], qb[2], qb[3], qb[4], qb[5], out, 64);
      const want = brute(live, qb);
      if (want.length <= 64) expect(idsOf(idx, n)).toEqual(want);
    }
    expect(idx.size).toBe(4000);
  });

  it('her ekleme hemen bulunur (tablo yeniden kurulum sınırlarında hücre kaybı yok)', () => {
    const idx = new ColliderIndex({ capacity: 16 });
    const out = new Float64Array(64 * 6);
    for (let i = 0; i < 3000; i++) {
      const x = (i % 60) * 4 + 0.5;
      const z = Math.floor(i / 60) * 4 + 0.5;
      idx.add(i + 1, [[x, 64, z, x + 1, 65, z + 1]]);
      expect(idx.queryRaw(x + 0.1, 64.1, z + 0.1, x + 0.9, 64.9, z + 0.9, out, 64)).toBe(1);
      expect(idx.ids[0]).toBe(i + 1);
    }
    // hepsi hâlâ bulunur
    for (let i = 0; i < 3000; i += 7) {
      const x = (i % 60) * 4 + 0.5;
      const z = Math.floor(i / 60) * 4 + 0.5;
      expect(idx.queryRaw(x + 0.1, 64.1, z + 0.1, x + 0.9, 64.9, z + 0.9, out, 64)).toBe(1);
    }
  });

  it('sorgu damgası taşması güvenli', () => {
    const idx = new ColliderIndex();
    idx.add(1, [[0, 0, 0, 5, 5, 5], [3, 0, 0, 9, 5, 5]]);
    idx._queryStamp = 0xfffffff2;
    const out = new Float64Array(64 * 6);
    for (let i = 0; i < 40; i++) expect(idx.queryRaw(0, 0, 0, 10, 5, 5, out, 64)).toBe(2);
  });

  it('sorgu tahsissiz: 200k sorguda yığın büyümesi küçük', () => {
    const idx = new ColliderIndex();
    const r = rnd(5);
    for (let i = 1; i <= 3000; i++) idx.add(i, [randBox(r, 300, 2)]);
    const out = new Float64Array(64 * 6);
    for (let i = 0; i < 20000; i++) idx.queryRaw(-1, 60, -1, 1, 62, 1, out, 64); // ısınma
    const before = process.memoryUsage().heapUsed;
    let acc = 0;
    for (let i = 0; i < 200000; i++) acc += idx.queryRaw(i % 100 - 50, 60, i % 70 - 35, i % 100 - 49, 63, i % 70 - 34, out, 64);
    const grew = process.memoryUsage().heapUsed - before;
    expect(acc).toBeGreaterThanOrEqual(0);
    expect(grew).toBeLessThan(3 * 1024 * 1024);
  });

  it('query(aabb) nesne ve dizi biçimini kabul eder', () => {
    const idx = new ColliderIndex();
    idx.add(1, [[0, 0, 0, 1, 1, 1]]);
    const out = new Float64Array(64 * 6);
    expect(idx.query({ minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 }, out)).toBe(1);
    expect(idx.query([0, 0, 0, 2, 2, 2], out, 64)).toBe(1);
    expect(idx.query(null, out)).toBe(0);
  });

  it('bellek ayak izi makul (10k prop kutusu < 4 MB)', () => {
    const idx = new ColliderIndex();
    const r = rnd(11);
    for (let i = 1; i <= 10000; i++) idx.add(i, [randBox(r, 1600, 1)]);
    expect(idx.memoryBytes()).toBeLessThan(4 * 1024 * 1024);
  });
});
