/*
 * vehicleGeo / vehicleGeoKit testleri (saf düğüm): üçgen bütçeleri, NaN yok, sarım ↔ normal tutarlılığı, fizik OBB'si ile uyum, belirlenimcilik, tekerlek/lamba parçaları.
 */
import { describe, expect, it } from 'vitest';
import {
  MODEL_KINDS, TRAFFIC_KINDS, buildModel, disposeModelCache, kindDims,
} from './vehicleGeo.js';
import {
  Geo, SLOT, F_DRIVER, F_SPIN, F_STEER, boundsOf, finalize, lin, loft, posHash,
} from './vehicleGeoKit.js';
import { VEHICLE_DEFS, VEHICLE_CLASSES } from '../../sim/city/vehicle/vehicleData.js';

const ATTRS = ['position', 'normal', 'aColor', 'aMat', 'aPivot', 'uv'];

function eachTri(layer, fn) {
  const p = layer.position;
  const n = layer.normal;
  for (let t = 0; t < layer.tris; t++) {
    const o = t * 9;
    fn(p.subarray(o, o + 9), n.subarray(o, o + 9), t);
  }
}

describe('model türleri', () => {
  it('altı sınıf + hatch/sedan; trafik türleri sınıflarla uyumlu', () => {
    expect(MODEL_KINDS).toEqual(expect.arrayContaining(VEHICLE_CLASSES));
    expect(MODEL_KINDS).toContain('hatch');
    expect(MODEL_KINDS).toContain('sedan');
    TRAFFIC_KINDS.forEach((k) => expect(MODEL_KINDS).toContain(k));
    expect(kindDims('bilinmeyen')).toBe(null);
    MODEL_KINDS.forEach((k) => {
      const d = kindDims(k);
      expect(d.length).toBeGreaterThan(1);
      expect(d.eye.length).toBe(3);
    });
  });
});

describe('üçgen bütçeleri', () => {
  MODEL_KINDS.forEach((k) => {
    it(k + ': ayrıntılı ≤ 1500, trafik ≤ 600', () => {
      const hi = buildModel(k, 'hi');
      const lo = buildModel(k, 'lo');
      expect(hi.tris.total).toBeLessThanOrEqual(1500);
      expect(hi.tris.total).toBeGreaterThan(150);
      expect(lo.tris.total).toBeLessThanOrEqual(600);
      expect(lo.tris.total).toBeLessThan(hi.tris.total);
      expect(lo.glass.tris).toBe(0); // trafik: tek çizim çağrısı için cam opak katmana katılır
      expect(hi.tris.solid).toBe(hi.solid.position.length / 9);
      expect(hi.tris.glass).toBe(hi.glass.position.length / 9);
    });
  });
});

describe('veri sağlığı', () => {
  MODEL_KINDS.forEach((k) => ['hi', 'lo'].forEach((lod) => {
    it(k + '/' + lod + ': NaN/Inf yok, dizi boyları tutarlı, slot ve eşik aralıkta', () => {
      const m = buildModel(k, lod);
      ['solid', 'glass'].forEach((ln) => {
        const L = m[ln];
        const nv = L.position.length / 3;
        expect(L.normal.length).toBe(nv * 3);
        expect(L.aColor.length).toBe(nv * 3);
        expect(L.aMat.length).toBe(nv * 4);
        expect(L.aPivot.length).toBe(nv * 3);
        expect(L.uv.length).toBe(nv * 2);
        ATTRS.forEach((a) => { for (let i = 0; i < L[a].length; i++) if (!Number.isFinite(L[a][i])) throw new Error(k + ' ' + a + '[' + i + ']'); });
        for (let i = 0; i < nv; i++) {
          const slot = L.aMat[i * 4];
          expect(Number.isInteger(slot) && slot >= 0 && slot <= 23).toBe(true);
          const thr = L.aMat[i * 4 + 3];
          expect(thr >= 0 && thr <= 1).toBe(true);
          const f = L.aMat[i * 4 + 2];
          expect(Number.isInteger(f) && f >= 0 && f < 32).toBe(true);
          expect(L.aColor[i * 3]).toBeGreaterThanOrEqual(0);
          expect(L.aColor[i * 3]).toBeLessThanOrEqual(1.5);
        }
      });
    });
  }));
});

describe('sarım ↔ normal tutarlılığı (kullanıcı yüzü arka yüz çizimine düşmez)', () => {
  MODEL_KINDS.forEach((k) => ['hi', 'lo'].forEach((lod) => {
    it(k + '/' + lod, () => {
      const m = buildModel(k, lod);
      let bad = 0;
      let total = 0;
      ['solid', 'glass'].forEach((ln) => {
        eachTri(m[ln], (p, n) => {
          const e1 = [p[3] - p[0], p[4] - p[1], p[5] - p[2]];
          const e2 = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
          const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          const area = Math.hypot(g[0], g[1], g[2]) * 0.5;
          if (area < 1e-7) return;
          total++;
          const nv = [n[0] + n[3] + n[6], n[1] + n[4] + n[7], n[2] + n[5] + n[8]];
          const d = (g[0] * nv[0] + g[1] * nv[1] + g[2] * nv[2]) / (Math.hypot(g[0], g[1], g[2]) * Math.hypot(nv[0], nv[1], nv[2]) || 1);
          if (d < 0.05) bad++;
        });
      });
      expect(total).toBeGreaterThan(50);
      expect(bad).toBe(0);
    });
  }));
});

describe('normaller birim uzunlukta', () => {
  MODEL_KINDS.forEach((k) => {
    it(k, () => {
      const m = buildModel(k, 'hi');
      let off = 0;
      let total = 0;
      ['solid', 'glass'].forEach((ln) => {
        const L = m[ln];
        for (let i = 0; i < L.normal.length / 3; i++) {
          const l = Math.hypot(L.normal[i * 3], L.normal[i * 3 + 1], L.normal[i * 3 + 2]);
          total++;
          if (Math.abs(l - 1) > 0.02) off++;
        }
      });
      expect(off / Math.max(1, total)).toBeLessThan(0.005);
    });
  });
});

describe('fizik OBB ile uyum (sürücü hariç gövde)', () => {
  VEHICLE_CLASSES.forEach((k) => {
    it(k + ': gövde sınırı OBB (uzunluk/genişlik/yükseklik) ± pay içinde ve OBB\'yi büyük ölçüde doldurur', () => {
      const d = VEHICLE_DEFS[k];
      const m = buildModel(k, 'hi');
      const b = m.shell;
      const hw = d.width * 0.5;
      const hl = d.length * 0.5;
      const padXZ = 0.16;
      expect(b.min[0]).toBeGreaterThanOrEqual(-hw - padXZ);
      expect(b.max[0]).toBeLessThanOrEqual(hw + padXZ);
      expect(b.min[2]).toBeGreaterThanOrEqual(-hl - padXZ);
      expect(b.max[2]).toBeLessThanOrEqual(hl + padXZ + 0.06);
      expect(b.min[1]).toBeGreaterThanOrEqual(d.hover > 0 ? 0 : -0.001);
      const topPad = k === 'suzulkay' ? 0.05 : 0.14;
      expect(b.max[1]).toBeLessThanOrEqual(d.height + topPad);
      // doldurma: OBB boyunun ≥ %88'i, genişliğin ≥ %70'i, yüksekliğin ≥ %70'i
      expect((b.max[2] - b.min[2]) / d.length).toBeGreaterThan(0.88);
      expect((b.max[0] - b.min[0]) / d.width).toBeGreaterThan(k === 'motor' ? 0.4 : 0.7);
      expect((b.max[1] - b.min[1]) / d.height).toBeGreaterThan(0.7);
    });
  });
  it('hatch/sedan boyutları kindDims ile uyumlu', () => {
    ['hatch', 'sedan'].forEach((k) => {
      const d = kindDims(k);
      const b = buildModel(k, 'hi').shell;
      expect(b.max[2] - b.min[2]).toBeGreaterThan(d.length * 0.9);
      expect(b.max[2] - b.min[2]).toBeLessThan(d.length + 0.3);
      expect(b.max[0] - b.min[0]).toBeLessThan(d.width + 0.3);
      expect(b.max[1]).toBeLessThanOrEqual(d.height + 0.14);
    });
  });
  it('kaput kamerası gözü gövde kutusunun içinde (sürücü içeride)', () => {
    VEHICLE_CLASSES.forEach((k) => {
      const m = buildModel(k, 'hi');
      const e = m.dims.eye;
      const b = m.shell;
      expect(e[0]).toBeGreaterThanOrEqual(b.min[0]);
      expect(e[0]).toBeLessThanOrEqual(b.max[0]);
      expect(e[1]).toBeGreaterThan(b.min[1]);
      // arabalarda göz kabin içinde (tavan altında); binicilerde göz sürücü başı hizasında (gövdenin üstünde)
      expect(e[1]).toBeLessThan(b.max[1] + (VEHICLE_DEFS[k].kind === 'araba' ? 0.0 : 0.9));
      expect(e[2]).toBeGreaterThan(b.min[2]);
      expect(e[2]).toBeLessThan(b.max[2]);
    });
  });
});

describe('parçalar', () => {
  it('tekerlekli araçlarda 4 (motor 2) dönen tekerlek; ön tekerlekler yönelir; hover araçlarda tekerlek yok', () => {
    const pivots = (k) => {
      const m = buildModel(k, 'hi');
      const set = new Map();
      const L = m.solid;
      for (let i = 0; i < L.position.length / 3; i++) {
        const f = L.aMat[i * 4 + 2];
        if (f & F_SPIN) set.set(L.aPivot[i * 3] + ',' + L.aPivot[i * 3 + 1] + ',' + L.aPivot[i * 3 + 2], (f & F_STEER) !== 0);
      }
      return set;
    };
    ['taksi', 'spor', 'kamyonet', 'hatch', 'sedan'].forEach((k) => {
      const p = pivots(k);
      expect(p.size).toBe(4);
      let steer = 0;
      p.forEach((s) => { if (s) steer++; });
      expect(steer).toBe(2);
    });
    expect(pivots('motor').size).toBe(2);
    expect(pivots('hoverbike').size).toBe(0);
    expect(pivots('suzulkay').size).toBe(0);
  });
  it('lambalar (far, stop, geri, sinyal) ve plaka her araçta var', () => {
    MODEL_KINDS.forEach((k) => {
      const m = buildModel(k, 'hi');
      const slots = new Set();
      for (let i = 0; i < m.solid.position.length / 3; i++) slots.add(m.solid.aMat[i * 4]);
      [SLOT.HEAD, SLOT.TAIL, SLOT.BODY].forEach((s) => expect(slots.has(s)).toBe(true));
      if (k !== 'suzulkay') expect(slots.has(SLOT.PLATE)).toBe(true);
      if (k !== 'hoverbike' && k !== 'suzulkay' && k !== 'motor') {
        [SLOT.INDICATOR, SLOT.REVERSE, SLOT.RIM, SLOT.TYRE].forEach((s) => expect(slots.has(s)).toBe(true));
      }
      expect(slots.has(SLOT.NEON) || slots.has(SLOT.UNDER)).toBe(true);
    });
  });
  it('sürücü köşeleri F_DRIVER bayraklı (hi) ve trafik modelinde sürücü yok', () => {
    MODEL_KINDS.forEach((k) => {
      const hi = buildModel(k, 'hi');
      let drv = 0;
      for (let i = 0; i < hi.solid.position.length / 3; i++) if (hi.solid.aMat[i * 4 + 2] & F_DRIVER) drv++;
      expect(drv).toBeGreaterThan(30);
      const lo = buildModel(k, 'lo');
      let drvLo = 0;
      for (let i = 0; i < lo.solid.position.length / 3; i++) if (lo.solid.aMat[i * 4 + 2] & F_DRIVER) drvLo++;
      expect(drvLo).toBe(0);
    });
  });
  it('taksi: tavan tabelası (SIGN/SIGNTEXT) var; diğerlerinde yok', () => {
    const has = (k, slot) => {
      const m = buildModel(k, 'hi');
      for (let i = 0; i < m.solid.position.length / 3; i++) if (m.solid.aMat[i * 4] === slot) return true;
      return false;
    };
    expect(has('taksi', SLOT.SIGN)).toBe(true);
    expect(has('taksi', SLOT.SIGNTEXT)).toBe(true);
    ['spor', 'kamyonet', 'sedan', 'hatch', 'motor'].forEach((k) => expect(has(k, SLOT.SIGNTEXT)).toBe(false));
  });
  it('çapalar sonlu; far çapaları burun tarafında (−z), stop çapaları kuyrukta', () => {
    MODEL_KINDS.forEach((k) => {
      const a = buildModel(k, 'hi').anchors;
      a.head.forEach((h) => { expect(h.every(Number.isFinite)).toBe(true); expect(h[2]).toBeLessThan(-0.5); });
      a.tail.forEach((t) => { expect(t.every(Number.isFinite)).toBe(true); expect(t[2]).toBeGreaterThan(0.5); });
      expect(a.under.hw).toBeGreaterThan(0.2);
      a.wheels.forEach((w) => expect(w[3]).toBeGreaterThan(0.2));
    });
  });
});

describe('belirlenimcilik ve önbellek', () => {
  it('önbellek temizlenip yeniden kurulunca bayt-bayt aynı', () => {
    const a = MODEL_KINDS.map((k) => Array.from(buildModel(k, 'hi').solid.position));
    disposeModelCache();
    const b = MODEL_KINDS.map((k) => Array.from(buildModel(k, 'hi').solid.position));
    expect(b).toEqual(a);
  });
  it('aynı çağrı aynı nesneyi döndürür (önbellek)', () => {
    expect(buildModel('taksi', 'hi')).toBe(buildModel('taksi', 'hi'));
    expect(buildModel('taksi', 'hi')).not.toBe(buildModel('taksi', 'lo'));
  });
  it('bilinmeyen tür atar', () => {
    expect(() => buildModel('ucak', 'hi')).toThrow();
  });
});

describe('kit', () => {
  it('lin(): sRGB → doğrusal', () => {
    expect(lin(0xffffff).every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
    expect(lin(0x000000).every((v) => v === 0)).toBe(true);
    expect(lin(0x808080)[0]).toBeCloseTo(0.2158, 3);
  });
  it('posHash: 0..1, belirlenimci', () => {
    for (let i = 0; i < 200; i++) {
      const h = posHash(i * 0.37, i * 0.11, -i * 0.53);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(posHash(i * 0.37, i * 0.11, -i * 0.53)).toBe(h);
    }
  });
  it('Geo.quad f: normalin işareti zorlanır', () => {
    const g = new Geo();
    // kasten ters sarım
    g.quad([0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], { f: 'z+' });
    g.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], { f: 'z+' });
    const fin = finalize(g);
    for (let t = 0; t < fin.solid.tris; t++) expect(fin.solid.normal[t * 9 + 2]).toBeGreaterThan(0.99);
  });
  it('sym: ayna kopya x işaretini çevirir, sarım ters (normal dışarı)', () => {
    const g = new Geo();
    g.sym(() => g.quad([0.5, 0, 0], [0.5, 0, 1], [0.5, 1, 1], [0.5, 1, 0], { f: 'x+' }));
    const fin = finalize(g);
    expect(fin.solid.tris).toBe(4);
    const xs = new Set();
    for (let i = 0; i < fin.solid.position.length / 3; i++) xs.add(Math.sign(fin.solid.position[i * 3]));
    expect(xs.has(1) && xs.has(-1)).toBe(true);
    for (let t = 0; t < fin.solid.tris; t++) {
      const px = fin.solid.position[t * 9];
      expect(Math.sign(fin.solid.normal[t * 9])).toBe(Math.sign(px));
    }
  });
  it('loft: dışa bakan yumuşak normaller', () => {
    const g = new Geo();
    const ring = (w) => [[w, 0], [w, 1], [-w, 1], [-w, 0]];
    loft(g, [{ z: 0, ring: ring(1) }, { z: 1, ring: ring(1) }, { z: 2, ring: ring(0.5) }], { slotAt: (i, j) => (j === 3 ? { skip: true } : null) });
    expect(g.tris).toBe(2 * 2 * 3);
    const b = boundsOf(g);
    expect(b.max[2]).toBe(2);
  });
});
