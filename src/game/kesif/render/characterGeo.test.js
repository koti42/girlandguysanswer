import { describe, expect, it } from 'vitest';
import {
  SkinBuilder, chainWeights, ellipsoid, resampleSections, softBox, sweep, tube, withExtra, computeNormals,
} from './characterGeo.js';

/** Her köşe normalinin, parçanın merkezinden dışarı baktığını doğrular (dışa bakan yüz oranı). */
function outwardRatio(piece, center) {
  const nor = computeNormals(piece.pos, piece.idx);
  let ok = 0;
  const n = piece.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const dx = piece.pos[i * 3] - center[0];
    const dy = piece.pos[i * 3 + 1] - center[1];
    const dz = piece.pos[i * 3 + 2] - center[2];
    if (dx * nor[i * 3] + dy * nor[i * 3 + 1] + dz * nor[i * 3 + 2] > 0) ok++;
  }
  return ok / n;
}

describe('characterGeo: parçalar', () => {
  it('sweep: normaller dışarı bakar, indeksler geçerli, uç kapaklar var', () => {
    const p = sweep([{ y: 0, rx: 0.05, rz: 0.04 }, { y: 0.5, rx: 0.08, rz: 0.07 }, { y: 1, rx: 0.03, rz: 0.03 }], { seg: 12, sub: 3 });
    expect(p.pos.length % 3).toBe(0);
    expect(p.idx.length % 3).toBe(0);
    const n = p.pos.length / 3;
    p.idx.forEach((i) => { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(n); });
    expect(outwardRatio(p, [0, 0.5, 0])).toBeGreaterThan(0.97);
  });

  it('ellipsoid: kutuplar tek köşe, normaller dışarı bakar, sınır kutusu yarıçaplara eşit', () => {
    const e = ellipsoid(0.1, 0.2, 0.3, { seg: 12, rings: 8 });
    expect(e.pos.length / 3).toBe(2 + 12 * 7);
    expect(outwardRatio(e, [0, 0, 0])).toBeGreaterThan(0.99);
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < e.pos.length; i += 3) {
      mx = Math.max(mx, Math.abs(e.pos[i]));
      my = Math.max(my, Math.abs(e.pos[i + 1]));
      mz = Math.max(mz, Math.abs(e.pos[i + 2]));
    }
    expect(my).toBeCloseTo(0.2, 6);
    expect(mx).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(mz).toBeLessThanOrEqual(0.3 + 1e-9);
  });

  it('tube: yol boyunca uzanır ve normaller yol eksenine dik/dışa bakar', () => {
    const pts = [[0, 0, 0], [0, 0.2, 0.05], [0, 0.4, 0.2]];
    const t = tube(pts, 0.01, { seg: 8, cap: 'round' });
    let maxD = 0;
    for (let i = 0; i < t.pos.length; i += 3) {
      // her köşe yola en çok yarıçap + uç kubbe payı kadar yakın
      let best = Infinity;
      for (let s = 0; s <= 40; s++) {
        const u = s / 20;
        const a = pts[Math.min(1, Math.floor(u))];
        const b = pts[Math.min(2, Math.floor(u) + 1)];
        const f = u - Math.floor(u);
        const x = a[0] + (b[0] - a[0]) * f;
        const y = a[1] + (b[1] - a[1]) * f;
        const z = a[2] + (b[2] - a[2]) * f;
        best = Math.min(best, Math.hypot(t.pos[i] - x, t.pos[i + 1] - y, t.pos[i + 2] - z));
      }
      maxD = Math.max(maxD, best);
    }
    expect(maxD).toBeLessThan(0.02);
  });

  it('softBox: sınırı kutuya yakındır (köşeler yuvarlak ama taşmaz)', () => {
    const b = softBox(0.05, 0.1, 0.02, { seg: 12, rings: 8, power: 3 });
    for (let i = 0; i < b.pos.length; i += 3) {
      expect(Math.abs(b.pos[i])).toBeLessThanOrEqual(0.05 + 1e-6);
      expect(Math.abs(b.pos[i + 1])).toBeLessThanOrEqual(0.1 + 1e-6);
      expect(Math.abs(b.pos[i + 2])).toBeLessThanOrEqual(0.02 + 1e-6);
    }
  });

  it('resampleSections: Catmull-Rom uçları korur ve y artan kalır', () => {
    const keys = [{ y: 0, rx: 0.1, rz: 0.1 }, { y: 0.3, rx: 0.2, rz: 0.15 }, { y: 1, rx: 0.05, rz: 0.05 }];
    const r = resampleSections(keys, 4);
    expect(r[0].y).toBe(0);
    expect(r[r.length - 1].y).toBe(1);
    for (let i = 1; i < r.length; i++) expect(r[i].y).toBeGreaterThanOrEqual(r[i - 1].y);
    r.forEach((s) => { expect(s.rx).toBeGreaterThan(0); expect(s.rz).toBeGreaterThan(0); });
  });
});

describe('characterGeo: ağırlıklar', () => {
  const chain = chainWeights([{ bone: 'a' }, { bone: 'b', y: 0.5, band: 0.1 }, { bone: 'c', y: 0.2, band: 0.05 }]);
  it('chainWeights: toplam 1, bant dışında tek kemik, bant içinde yumuşak geçiş', () => {
    for (let y = -0.1; y <= 1; y += 0.01) {
      const w = chain(0, y, 0);
      const sum = w.reduce((s, p) => s + p[1], 0);
      expect(sum).toBeCloseTo(1, 6);
      w.forEach((p) => expect(p[1]).toBeGreaterThanOrEqual(0));
    }
    expect(chain(0, 0.9, 0)).toEqual([['a', 1]]);
    expect(chain(0, 0.05, 0)).toEqual([['c', 1]]);
    const mid = chain(0, 0.5, 0);
    expect(mid.length).toBe(2);
    expect(mid[0][1]).toBeCloseTo(0.5, 5);
  });

  it('withExtra: toplam yine 1', () => {
    const f = withExtra(chain, (x) => (x > 0 ? [['arm', 0.4]] : null));
    const w = f(1, 0.9, 0);
    expect(w.reduce((s, p) => s + p[1], 0)).toBeCloseTo(1, 6);
    expect(f(-1, 0.9, 0)).toEqual([['a', 1]]);
  });

  it('SkinBuilder: köşe başına en çok 4 kemik, ağırlıklar normalize, renk/skin kanalları dolu', () => {
    const b = new SkinBuilder(['a', 'b', 'c', 'arm']);
    b.add(sweep([{ y: 0, rx: 0.1, rz: 0.1 }, { y: 1, rx: 0.1, rz: 0.1 }], { seg: 8 }), {
      color: 0xff0000, weights: withExtra(chain, () => [['arm', 0.3]]), skin: 1,
    });
    b.add(ellipsoid(0.1, 0.1, 0.1, { seg: 6, rings: 4 }), { mesh: 'gloss', color: 0x00ff00, weights: 'b' });
    const g = b.build();
    expect(g.body).toBeTruthy();
    expect(g.gloss).toBeTruthy();
    expect(g.hair).toBeNull();
    const sw = g.body.attributes.skinWeight;
    const si = g.body.attributes.skinIndex;
    for (let i = 0; i < sw.count; i++) {
      const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
      expect(s).toBeCloseTo(1, 5);
      [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)].forEach((v) => expect(v).toBeLessThan(4));
    }
    expect(g.body.attributes.aSkin.getX(0)).toBe(1);
    expect(g.triangles).toBe((g.body.index.count + g.gloss.index.count) / 3);
  });
});
