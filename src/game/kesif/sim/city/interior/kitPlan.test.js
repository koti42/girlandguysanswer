import { describe, expect, it } from 'vitest';
import { stream } from '../cityPlanKit.js';
import {
  bsp, computeAdj, corridor, doorSpots, loft, lshape, pickDoor, roomAt, spanning, zones,
} from './kitPlan.js';

const rng = (i, tag) => stream(0x1234 + i, i * 7 + 1, tag || 0x77);

function area(r) {
  return (r.u1 - r.u0) * (r.v1 - r.v0);
}

function disjoint(rooms) {
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0) return false;
    }
  }
  return true;
}

/** Oda dışı (duvar) hücre sayısı. */
function wallCells(rect, rooms) {
  let n = 0;
  for (let v = rect[1]; v < rect[3]; v++) for (let u = rect[0]; u < rect[2]; u++) if (!roomAt(rooms, u, v)) n++;
  return n;
}

function connected(rooms, adj) {
  const seen = new Set([rooms[0].id]);
  const st = [rooms[0].id];
  while (st.length) {
    const c = st.pop();
    adj.forEach((e) => {
      const o = e.a === c ? e.b : e.b === c ? e.a : null;
      if (o && !seen.has(o)) { seen.add(o); st.push(o); }
    });
  }
  return seen.size === rooms.length;
}

describe('kitPlan.bsp', () => {
  it('fuzz: odalar çakışmasız, rect içinde, en küçük boyut korunur, duvarlar 1 kalın; komşuluk tutarlı; bağlı', () => {
    let multi = 0;
    for (let i = 0; i < 300; i++) {
      const W = 8 + (i % 15);
      const D = 7 + ((i * 7) % 12);
      const rect = [0, 0, W, D];
      const r = rng(i);
      const P = bsp(rect, r, { minU: 3 + (i % 2), minV: 3, maxRooms: 2 + (i % 5) });
      expect(P.rooms.length).toBeGreaterThanOrEqual(1);
      expect(P.rooms.length).toBeLessThanOrEqual(2 + (i % 5));
      if (P.rooms.length > 1) multi++;
      expect(disjoint(P.rooms)).toBe(true);
      P.rooms.forEach((q) => {
        expect(q.u0).toBeGreaterThanOrEqual(0);
        expect(q.v0).toBeGreaterThanOrEqual(0);
        expect(q.u1).toBeLessThanOrEqual(W);
        expect(q.v1).toBeLessThanOrEqual(D);
        expect(q.u1 - q.u0).toBeGreaterThanOrEqual(3 + (i % 2));
        expect(q.v1 - q.v0).toBeGreaterThanOrEqual(3);
      });
      // alan korunumu: oda + duvar hücreleri = rect; n oda ⇒ tam n-1 duvar çizgisi (guillotine)
      const sum = P.rooms.reduce((a, q) => a + area(q), 0);
      expect(sum + wallCells(rect, P.rooms)).toBe(W * D);
      expect(connected(P.rooms, P.adj)).toBe(true);
      // her komşuluk: tam 1 duvar kalınlığı ve aralık iki odada da var
      P.adj.forEach((e) => {
        const a = P.rooms.find((q) => q.id === e.a);
        const b = P.rooms.find((q) => q.id === e.b);
        expect(e.hi).toBeGreaterThan(e.lo);
        if (e.axis === 'v') {
          expect(a.u1).toBe(e.line);
          expect(b.u0).toBe(e.line + 1);
          expect(e.lo).toBeGreaterThanOrEqual(Math.max(a.v0, b.v0));
          expect(e.hi).toBeLessThanOrEqual(Math.min(a.v1, b.v1));
        } else {
          expect(a.v1).toBe(e.line);
          expect(b.v0).toBe(e.line + 1);
          expect(e.lo).toBeGreaterThanOrEqual(Math.max(a.u0, b.u0));
          expect(e.hi).toBeLessThanOrEqual(Math.min(a.u1, b.u1));
        }
      });
    }
    expect(multi).toBeGreaterThan(200);
  });

  it('belirlenimci; farklı akış farklı plan', () => {
    const sig = (i) => JSON.stringify(bsp([0, 0, 16, 12], rng(i), { maxRooms: 5 }));
    for (let i = 0; i < 20; i++) expect(sig(i)).toBe(sig(i));
    const set = new Set();
    for (let i = 0; i < 20; i++) set.add(sig(i));
    expect(set.size).toBeGreaterThan(5);
  });

  it('noWall: yasak dikdörtgenler duvar hücresi içermez (kapı apronu)', () => {
    for (let i = 0; i < 120; i++) {
      const W = 12 + (i % 9);
      const D = 9 + (i % 6);
      const du = 3 + (i % (W - 6));
      const noWall = [{ u0: du - 2, v0: 0, u1: du + 3, v1: 3 }];
      const P = bsp([0, 0, W, D], rng(i, 0x99), { maxRooms: 4, noWall });
      for (let v = noWall[0].v0; v < noWall[0].v1; v++) for (let u = noWall[0].u0; u < noWall[0].u1; u++) expect(roomAt(P.rooms, u, v), `${u},${v}`).not.toBeNull();
    }
  });

  it('çok küçük alan bölünmez; maxRooms=1 tek oda', () => {
    expect(bsp([0, 0, 6, 5], rng(1), { maxRooms: 6 }).rooms.length).toBe(1);
    expect(bsp([0, 0, 20, 20], rng(1), { maxRooms: 1 }).rooms.length).toBe(1);
  });
});

describe('kitPlan.corridor / lshape / zones', () => {
  it('corridor: ön salon + koridor + yan odalar; çakışmasız, alan korunumu, hall–koridor komşu, koridor yan odalara komşu', () => {
    for (let i = 0; i < 80; i++) {
      const W = 14 + (i % 9);
      const D = 12 + (i % 7);
      const P = corridor(W, D, rng(i), { doorU: 3 + (i % (W - 6)), minRoom: 4 });
      const ids = P.rooms.map((q) => q.id);
      expect(ids).toContain('hall');
      expect(ids).toContain('koridor');
      expect(ids.some((k) => k.indexOf('sol') === 0 || k.indexOf('sag') === 0)).toBe(true);
      expect(disjoint(P.rooms)).toBe(true);
      expect(P.rooms.reduce((a, q) => a + area(q), 0) + wallCells([0, 0, W, D], P.rooms)).toBe(W * D);
      expect(connected(P.rooms, P.adj)).toBe(true);
      expect(P.adj.some((e) => (e.a === 'hall' && e.b === 'koridor') || (e.b === 'hall' && e.a === 'koridor'))).toBe(true);
      const side = P.rooms.filter((q) => q.role === 'room');
      side.forEach((s) => expect(P.adj.some((e) => (e.a === s.id && e.b === 'koridor') || (e.b === s.id && e.a === 'koridor'))).toBe(true));
      P.rooms.forEach((q) => { expect(q.u1 - q.u0).toBeGreaterThanOrEqual(3); expect(q.v1 - q.v0).toBeGreaterThanOrEqual(3); });
    }
  });

  it('lshape: iki kol + boşluk; boşluk odalarla çakışmaz; hücreler odalar + boşluk + duvar', () => {
    for (let i = 0; i < 60; i++) {
      const W = 10 + (i % 8);
      const D = 10 + (i % 6);
      const P = lshape(W, D, rng(i), { flip: i % 2 === 1 });
      expect(P.rooms.length).toBe(2);
      expect(disjoint(P.rooms)).toBe(true);
      expect(P.voids.length).toBe(1);
      const v = P.voids[0];
      P.rooms.forEach((q) => expect(q.u0 < v.u1 && q.u1 > v.u0 && q.v0 < v.v1 && q.v1 > v.v0).toBe(false));
      expect(P.adj.length).toBe(1);
      expect(P.rooms.reduce((a, q) => a + area(q), 0) + area(v) + (W - 1 + 0) * 0).toBeLessThan(W * D);
      expect(connected(P.rooms, P.adj)).toBe(true);
    }
  });

  it('zones: n bölge dikdörtgeni tam kaplar, çakışmaz, en küçük boyut; kimlikler', () => {
    for (let i = 0; i < 100; i++) {
      const W = 8 + (i % 14);
      const D = 8 + (i % 9);
      const n = 2 + (i % 5);
      const Z = zones([0, 0, W, D], rng(i), n, { minU: 3, minV: 3 });
      expect(Z.length).toBeGreaterThanOrEqual(1);
      expect(Z.length).toBeLessThanOrEqual(n);
      expect(disjoint(Z)).toBe(true);
      expect(Z.reduce((a, q) => a + area(q), 0)).toBe(W * D);
      Z.forEach((q) => { expect(q.u1 - q.u0).toBeGreaterThanOrEqual(3); expect(q.v1 - q.v0).toBeGreaterThanOrEqual(3); });
      expect(new Set(Z.map((q) => q.id)).size).toBe(Z.length);
    }
    const named = zones([0, 0, 20, 12], rng(5), 3, { ids: ['a', 'b', 'c'] });
    expect(named.map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('kitPlan.loft', () => {
  it('asma katlı loft: odalar 3B çakışmaz, kapı duvar çizgisinde, merdiven alanı ve from/to doğru odalarda; küçük alan null', () => {
    let both = 0;
    for (let i = 0; i < 200; i++) {
      const W = 10 + (i % 11);
      const D = 9 + (i % 8);
      const H = 5 + (i % 3);
      const P = loft(W, D, H, rng(i), { doorU: 3 + (i % 5) });
      expect(P).not.toBeNull();
      const [on, arka, asma] = P.rooms;
      // 3B çakışma yok
      for (let a = 0; a < 3; a++) {
        for (let b2 = a + 1; b2 < 3; b2++) {
          const A = P.rooms[a];
          const B2 = P.rooms[b2];
          const hit = A.u0 < B2.u1 && A.u1 > B2.u0 && A.v0 < B2.v1 && A.v1 > B2.v0 && A.y0 < B2.y1 && A.y1 > B2.y0;
          expect(hit).toBe(false);
        }
      }
      expect(on.v1 + 1).toBe(arka.v0);
      expect(arka.y1 + 1).toBe(asma.y0);
      expect(asma.y1 - asma.y0).toBeGreaterThanOrEqual(2);
      expect(arka.y1 - arka.y0).toBeGreaterThanOrEqual(2);
      expect(P.door.line).toBe(on.v1);
      expect(P.door.c - 1).toBeGreaterThanOrEqual(0);
      expect(P.door.c + 1).toBeLessThan(W);
      expect(P.door.h).toBe(P.m);
      const s = P.spec;
      expect(s.from[0]).toBeGreaterThanOrEqual(0);
      expect(s.from[0]).toBeLessThan(W);
      expect(s.to[0]).toBeGreaterThanOrEqual(0);
      expect(s.to[0]).toBeLessThan(W);
      expect(s.from[1]).toBeGreaterThanOrEqual(arka.v0);
      expect(s.rect[3]).toBeLessThanOrEqual(D);
      expect(s.rect[2] - s.rect[0]).toBe(P.stair.rise * 2);
      // basamak sayısı: yükselme (m+1) blok = 2(m+1) hücre
      expect(P.stair.hole).toBe(P.m);
      if (s.to[0] > s.from[0]) both++;
    }
    expect(both).toBeGreaterThan(40);
    expect(both).toBeLessThan(160);
    expect(loft(8, 12, 5, rng(1))).toBeNull();
    expect(loft(14, 8, 5, rng(1))).toBeNull();
    expect(loft(14, 12, 4, rng(1))).toBeNull();
  });
});

describe('kitPlan.doorSpots / pickDoor / spanning', () => {
  const entry = { a: 'x', b: 'y', axis: 'v', line: 5, lo: 2, hi: 10 };

  it('doorSpots: kenarlardan en az 1 hücre içeride; engel hücreleri dışlar; 3 geniş daha dar', () => {
    const s1 = doorSpots(entry, 1, []);
    expect(s1[0]).toBe(2);
    expect(s1[s1.length - 1]).toBe(9);
    const s3 = doorSpots(entry, 3, []);
    expect(s3[0]).toBe(4);
    expect(s3[s3.length - 1]).toBe(7);
    const blocked = doorSpots(entry, 1, [{ u0: 5, v0: 4, u1: 6, v1: 7 }]);
    [4, 5, 6].forEach((c) => expect(blocked).not.toContain(c));
    expect(doorSpots({ ...entry, lo: 2, hi: 4 }, 3, [])).toEqual([]);
    const ax = doorSpots({ a: 'x', b: 'y', axis: 'u', line: 3, lo: 0, hi: 6 }, 1, []);
    expect(ax[0]).toBe(0);
    // dizi biçimli engel
    expect(doorSpots(entry, 1, [[5, 4, 6, 7]])).not.toContain(5);
  });

  it('pickDoor: 3 geniş sığmazsa 1 geniş; hiç yer yoksa null; belirlenimci', () => {
    const e = { a: 'x', b: 'y', axis: 'u', line: 3, lo: 0, hi: 4 };
    const d = pickDoor(e, rng(1), 3, []);
    expect(d.w).toBe(1);
    expect(pickDoor(e, rng(1), 3, [{ u0: 0, v0: 0, u1: 10, v1: 10 }])).toBeNull();
    const big = pickDoor({ ...e, hi: 12 }, rng(1), 3, []);
    expect(big.w).toBe(3);
    expect(JSON.stringify(pickDoor({ ...e, hi: 12 }, rng(1), 3, []))).toBe(JSON.stringify(big));
  });

  it('spanning: giriş odasından tüm odalara kapı ağacı (n-1 kenar), kapı konumları komşuluk aralığında; extra döngü ekler', () => {
    let loops = 0;
    for (let i = 0; i < 120; i++) {
      const W = 14 + (i % 8);
      const D = 11 + (i % 6);
      const P = bsp([0, 0, W, D], rng(i), { maxRooms: 5, noWall: [{ u0: (W >> 1) - 2, v0: 0, u1: (W >> 1) + 3, v1: 3 }] });
      const entryRoom = roomAt(P.rooms, W >> 1, 0);
      const E = spanning(P.rooms, P.adj, entryRoom.id, rng(i, 0x55), { w: 3, extra: 0 });
      expect(E.length).toBe(P.rooms.length - 1);
      const seen = new Set([entryRoom.id]);
      E.forEach((e) => {
        expect(seen.has(e.a)).toBe(true); // yayılma sırası
        seen.add(e.b);
        expect(e.c).toBeGreaterThanOrEqual(e.adj.lo);
        expect(e.c).toBeLessThan(e.adj.hi);
        expect([1, 3]).toContain(e.w);
        if (e.w === 3) { expect(e.c - 1).toBeGreaterThanOrEqual(e.adj.lo); expect(e.c + 1).toBeLessThan(e.adj.hi); }
      });
      expect(seen.size).toBe(P.rooms.length);
      const E2 = spanning(P.rooms, P.adj, entryRoom.id, rng(i, 0x55), { w: 1, extra: 2 });
      loops += E2.length - (P.rooms.length - 1);
      const filt = spanning(P.rooms, P.adj, entryRoom.id, rng(i, 0x55), { filter: () => false });
      expect(filt).toEqual([]);
    }
    expect(loops).toBeGreaterThan(20);
  });

  it('computeAdj: yan yana iki oda tek komşuluk; köşe teması komşuluk değildir', () => {
    const rooms = [
      { id: 'a', u0: 0, v0: 0, u1: 4, v1: 4 }, { id: 'b', u0: 5, v0: 0, u1: 9, v1: 4 }, { id: 'c', u0: 5, v0: 5, u1: 9, v1: 9 }, { id: 'd', u0: 0, v0: 5, u1: 4, v1: 9 },
    ];
    const adj = computeAdj(rooms);
    expect(adj.length).toBe(4); // a-b, c-b, a-d, d-c; a–c çapraz değil
    expect(adj.some((e) => [e.a, e.b].sort().join('') === 'ac')).toBe(false);
  });
});
