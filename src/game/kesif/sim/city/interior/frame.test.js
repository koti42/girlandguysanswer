import { describe, expect, it } from 'vitest';
import { citySeed } from '../cityPlanTestKit.js';
import { makeFrame } from './frame.js';
import { interiorLots } from './testKit.js';

const SEEDS = [1, 2, 3, 4, 5].map(citySeed);

function allLotsWith(filter) {
  const out = [];
  SEEDS.forEach((s) => interiorLots(s, { filter }).forEach((q) => out.push(q)));
  return out;
}

describe('interior/frame', () => {
  it('yerel↔dünya eşlemesi: bijektif, yön vektörleri tutarlı (4 yüz × ayna)', () => {
    const faces = {};
    ['n', 's', 'e', 'w'].forEach((f) => { faces[f] = SEEDS.map((s) => interiorLots(s, { faces: [f], limit: 12 })).reduce((a, b) => a.concat(b), []); });
    ['n', 's', 'e', 'w'].forEach((f) => expect(faces[f].length, 'yüz ' + f).toBeGreaterThan(10));
    let checked = 0;
    ['n', 's', 'e', 'w'].forEach((f) => {
      faces[f].forEach(({ bp, lot }) => {
        [false, true].forEach((mirror) => {
          const fr = makeFrame(bp, lot, { mirror });
          expect(fr).not.toBeNull();
          const seen = new Set();
          for (let v = 0; v < fr.D; v++) {
            for (let u = 0; u < fr.W; u++) {
              const c = fr.cell(u, v);
              expect(c[0]).toBeGreaterThanOrEqual(fr.x0);
              expect(c[0]).toBeLessThan(fr.x1);
              expect(c[1]).toBeGreaterThanOrEqual(fr.z0);
              expect(c[1]).toBeLessThan(fr.z1);
              seen.add(c[0] + ',' + c[1]);
              const b = fr.local(c[0], c[1]);
              expect(b).toEqual([u, v]);
            }
          }
          expect(seen.size).toBe(fr.W * fr.D);
          // +u ve +v adımları dir(1)/dir(0) ile eş
          const c0 = fr.cell(1, 1);
          const cu = fr.cell(2, 1);
          const cv = fr.cell(1, 2);
          expect([cu[0] - c0[0], cu[1] - c0[1]]).toEqual(fr.dir(1));
          expect([cv[0] - c0[0], cv[1] - c0[1]]).toEqual(fr.dir(0));
          // içeri = kapı duvarından iç hücreye
          const d = bp.doors[0];
          expect(fr.dir(0)).toEqual([d.inside.x - d.x, d.inside.z - d.z]);
          // 4 yaw farklı; 0 ve 2 ters
          const ys = [0, 1, 2, 3].map((k) => fr.yaw(k));
          expect(new Set(ys).size).toBe(4);
          expect((ys[0] + 2) & 3).toBe(ys[2]);
          expect((ys[1] + 2) & 3).toBe(ys[3]);
          // sağ = içeri yönünün saat yönü dönüşü (ayna yoksa); (dx,dz) → (-dz,dx)
          const fi = fr.dir(0);
          const right = fr.dir(1);
          const exp = mirror ? [fi[1], -fi[0]] : [-fi[1], fi[0]];
          expect(right).toEqual(exp.map((q) => q + 0));
          // kapı: yerel u, hücre kapı hücresi
          expect(fr.cell(fr.door.u, -1)).toEqual([d.x, d.z]);
          expect(fr.door.ok).toBe(true);
          // dikdörtgen = hücrelerin sınırı
          const r = fr.rect(2, 1, 5, 4);
          const cs = [fr.cell(2, 1), fr.cell(4, 3), fr.cell(2, 3), fr.cell(4, 1)];
          expect(r[0]).toBe(Math.min(...cs.map((c) => c[0])));
          expect(r[2]).toBe(Math.max(...cs.map((c) => c[0])) + 1);
          expect(r[1]).toBe(Math.min(...cs.map((c) => c[1])));
          expect(r[3]).toBe(Math.max(...cs.map((c) => c[1])) + 1);
          // sürekli nokta: hücre merkezi
          const p = fr.point(3.5, 2.5);
          const q = fr.pt(3, 2);
          expect(p[0]).toBeCloseTo(q[0], 9);
          expect(p[1]).toBeCloseTo(q[1], 9);
          // +0.25 u kayması dir(1) yönünde 0.25 ilerler
          const p2 = fr.point(3.75, 2.5);
          expect(p2[0] - p[0]).toBeCloseTo(fr.dir(1)[0] * 0.25, 9);
          expect(p2[1] - p[1]).toBeCloseTo(fr.dir(1)[1] * 0.25, 9);
          checked++;
        });
      });
    });
    expect(checked).toBeGreaterThan(80);
  });

  it('yükseklik: 3 ≤ H ≤ maxH, tavan = y0+H; bounds dikdörtgenle eş', () => {
    const list = allLotsWith(null);
    expect(list.length).toBeGreaterThan(300);
    list.forEach(({ bp, lot }) => {
      const fr = makeFrame(bp, lot, {});
      expect(fr.H).toBeGreaterThanOrEqual(3);
      expect(fr.H).toBeLessThanOrEqual(fr.maxH);
      expect(fr.ceilY).toBe(64 + fr.H);
      expect(fr.bounds).toEqual({ x0: bp.interior.x0, y0: 64, z0: bp.interior.z0, x1: bp.interior.x1, y1: 64 + fr.H, z1: bp.interior.z1 });
      expect(fr.W * fr.D).toBe((bp.interior.x1 - bp.interior.x0) * (bp.interior.z1 - bp.interior.z0));
      // istenen yükseklik (≤7) her binada sığar; tek istisna tek katlı konteyner parçaları (net 3)
      const want = bp.interior.y1 - bp.interior.y0;
      if (bp.archetype !== 'konteyner_yigini') expect(fr.maxH).toBeGreaterThanOrEqual(want);
      expect(fr.H).toBe(Math.min(want, fr.maxH));
    });
  });

  it('kapı çerçeve içinde (3 geniş sığar), engeller dikdörtgen içinde ve çekirdekle eşleşir', () => {
    const list = allLotsWith(null);
    let withObstacles = 0;
    list.forEach(({ bp, lot }) => {
      const fr = makeFrame(bp, lot, {});
      expect(fr.door.ok, 'kapı sığmıyor: lot ' + bp.id).toBe(true);
      fr.obstacles.forEach((o) => {
        withObstacles++;
        expect(o.u0).toBeGreaterThanOrEqual(0);
        expect(o.v0).toBeGreaterThanOrEqual(0);
        expect(o.u1).toBeLessThanOrEqual(fr.W);
        expect(o.v1).toBeLessThanOrEqual(fr.D);
        expect(o.u1).toBeGreaterThan(o.u0);
        // dünya çekirdeği ile kesişir
        const hit = bp.core.some((c) => c.x0 === o.x0 && c.z0 === o.z0);
        expect(hit).toBe(true);
        expect(fr.isObstacle(o.u0, o.v0)).toBe(true);
        expect(fr.obstacleAt(o.u0, o.v0, o.u1, o.v1)).toBe(true);
      });
    });
    expect(withObstacles).toBeGreaterThan(0);
  });

  it('adj: kapı duvarına dik yan kenarlar bina dış duvarına bitişik ise true; rect tamamen kademe içinde', () => {
    const list = allLotsWith(null);
    let nonAdj = 0;
    list.forEach(({ bp, lot }) => {
      const fr = makeFrame(bp, lot, {});
      const t = fr.tier;
      expect(t).not.toBeNull();
      expect(fr.x0).toBeGreaterThanOrEqual(t.x0 + 1);
      expect(fr.x1).toBeLessThanOrEqual(t.x0 + t.w - 1);
      expect(fr.z0).toBeGreaterThanOrEqual(t.z0 + 1);
      expect(fr.z1).toBeLessThanOrEqual(t.z0 + t.d - 1);
      if (!fr.adj.l || !fr.adj.r || !fr.adj.b) nonAdj++;
    });
    expect(nonAdj).toBeGreaterThan(0);
  });

  it('geçersiz girdi → null (bp.interior/kapı yok, çok küçük)', () => {
    expect(makeFrame(null, null)).toBeNull();
    expect(makeFrame({}, null)).toBeNull();
    expect(makeFrame({ interior: { x0: 0, z0: 0, x1: 2, z1: 2, y0: 64, y1: 68 }, doors: [{ face: 'n', inside: { x: 0, z: 0 }, x: 0, z: -1, axis: 'x', front: { x: 0, z: -2 } }], tiers: [], volumes: [] }, null)).toBeNull();
    expect(makeFrame({ interior: { x0: 0, z0: 0, x1: 8, z1: 8, y0: 64, y1: 68 }, doors: [{ face: 'q', inside: { x: 0, z: 0 }, x: 0, z: -1, axis: 'x', front: { x: 0, z: -2 } }] }, null)).toBeNull();
  });
});
