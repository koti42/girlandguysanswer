import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GeoBuilder, PROP_MODEL_BUILDERS, SKIP, createPropGeometries, slotKeyFor,
} from './propGeo.js';
import { PROP_DEFS, PROP_LIST } from '../../sim/props/propDefs.js';

function allSlots() {
  return createPropGeometries(THREE);
}

describe('GeoBuilder', () => {
  it('kutu: 6 yüz = 12 üçgen; skip yüzleri atar; normaller birim ve sarmal tutarlı', () => {
    const b = new GeoBuilder();
    b.box(0, 0, 0, 1, 2, 3, 0xffffff, [0, 0, 0, 1]);
    expect(b.tris).toBe(12);
    const b2 = new GeoBuilder();
    b2.box(0, 0, 0, 1, 1, 1, 0xffffff, [0, 0, 0, 1], SKIP.NY | SKIP.NZ);
    expect(b2.tris).toBe(8);
    checkWinding(b);
  });

  it('prizma/koni/octa/ico üçgen sayıları ve dışa bakan normaller', () => {
    const b = new GeoBuilder();
    b.prism(0, 0, 0, 1, 0.5, 0.4, 6, 0xffffff, [0, 0, 0, 1], true, true);
    expect(b.tris).toBe(12 + 6 + 6);
    const c = new GeoBuilder();
    c.cone(0, 0, 0, 1, 0.5, 7, 0xffffff, [0, 0, 0, 1], true);
    expect(c.tris).toBe(7 + 7);
    const o = new GeoBuilder();
    o.octa(0, 0, 0, 1, 0xffffff, [0, 0, 0, 1]);
    expect(o.tris).toBe(8);
    const i = new GeoBuilder();
    i.ico(0, 0, 0, 1, 0xffffff, [0, 0, 0, 1]);
    expect(i.tris).toBe(20);
    [b, c, o, i].forEach(checkWinding);
    // küre benzeri şekillerde normal merkezden dışarı bakar
    [o, i].forEach((g) => {
      for (let t = 0; t < g.tris; t++) {
        const k = t * 9;
        const cx = (g.pos[k] + g.pos[k + 3] + g.pos[k + 6]) / 3;
        const cy = (g.pos[k + 1] + g.pos[k + 4] + g.pos[k + 7]) / 3;
        const cz = (g.pos[k + 2] + g.pos[k + 5] + g.pos[k + 8]) / 3;
        const dot = cx * g.nor[k] + cy * g.nor[k + 1] + cz * g.nor[k + 2];
        expect(dot).toBeGreaterThan(0);
      }
    });
  });

  it('extrude: dışbükey profil → kenar dörtgenleri + iki kapak', () => {
    const b = new GeoBuilder();
    b.extrude(0, 1, [[0, 0], [1, 0], [1, 1], [0, 1]], 0xffffff, [0, 0, 0, 1]);
    expect(b.tris).toBe(8 + 4);
    checkWinding(b);
    const c = new GeoBuilder();
    c.extrude(0, 1, [[0, 0], [1, 0], [1, 1], [0, 1]], 0xffffff, [0, 0, 0, 1], 3);
    expect(c.tris).toBe(8);
  });

  it('quad uv ve renk doğrusal uzaya çevrilir; build 5 öznitelik üretir', () => {
    const b = new GeoBuilder();
    b.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], 0xff0000, [0.5, 2, 3, 0.25], [[0, 1], [1, 1], [1, 0], [0, 0]]);
    const g = b.build(THREE);
    ['position', 'normal', 'uv', 'aColor', 'aMat'].forEach((n) => expect(g.getAttribute(n)).toBeDefined());
    expect(g.getAttribute('position').count).toBe(6);
    expect(g.getAttribute('aColor').getX(0)).toBeCloseTo(1, 6);
    expect(g.getAttribute('aColor').getY(0)).toBeCloseTo(0, 6);
    expect(g.getAttribute('aMat').getY(0)).toBe(2);
    expect(g.getAttribute('aMat').getW(0)).toBeCloseTo(0.25, 6);
    g.dispose();
  });
});

function checkWinding(b) {
  for (let t = 0; t < b.tris; t++) {
    const k = t * 9;
    const ax = b.pos[k + 3] - b.pos[k];
    const ay = b.pos[k + 4] - b.pos[k + 1];
    const az = b.pos[k + 5] - b.pos[k + 2];
    const bx = b.pos[k + 6] - b.pos[k];
    const by = b.pos[k + 7] - b.pos[k + 1];
    const bz = b.pos[k + 8] - b.pos[k + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    expect(l).toBeGreaterThan(1e-9); // dejenere üçgen yok
    nx /= l; ny /= l; nz /= l;
    expect(nx * b.nor[k] + ny * b.nor[k + 1] + nz * b.nor[k + 2]).toBeGreaterThan(0.9999);
    expect(Math.abs(Math.hypot(b.nor[k], b.nor[k + 1], b.nor[k + 2]) - 1)).toBeLessThan(1e-6);
  }
}

describe('prop geometrileri', () => {
  it('her tanım için gövde geometrisi var; ağaç 2 varyant grubu; holo yalnız billboard/boyut terminali', () => {
    const m = allSlots();
    PROP_LIST.forEach((d) => {
      expect(m.has(d.key), d.key).toBe(true);
    });
    expect(m.has('agac:1')).toBe(true);
    expect(m.get('billboard').holo).not.toBeNull();
    expect(m.get('boyut_terminali').holo).not.toBeNull();
    expect(m.get('lamba').holo).toBeNull();
    expect(m.size).toBe(13);
    expect(slotKeyFor(PROP_DEFS.agac, 0)).toBe('agac');
    expect(slotKeyFor(PROP_DEFS.agac, 4)).toBe('agac:1');
    expect(slotKeyFor(PROP_DEFS.agac, 3)).toBe('agac');
    expect(slotKeyFor(PROP_DEFS.bank, 7)).toBe('bank');
  });

  it('üçgen sayıları alçak poli bütçede (≤ 80 gövde) ve toplam makul', () => {
    const m = allSlots();
    let total = 0;
    m.forEach((v, k) => {
      expect(v.tris, k).toBeGreaterThan(0);
      expect(v.tris, k).toBeLessThanOrEqual(80);
      expect(v.holoTris).toBeLessThanOrEqual(4);
      total += v.tris;
    });
    expect(total).toBeLessThan(800);
  });

  it('tüm köşe verileri sonlu, normaller birim, sarmal tutarlı, aMat alanları geçerli', () => {
    const m = allSlots();
    m.forEach((v, key) => {
      [v.body, v.holo].forEach((g) => {
        if (!g) return;
        const pos = g.getAttribute('position').array;
        const nor = g.getAttribute('normal').array;
        const mat = g.getAttribute('aMat').array;
        const col = g.getAttribute('aColor').array;
        for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i]), key).toBe(true);
        for (let i = 0; i < col.length; i++) expect(col[i] >= 0 && col[i] <= 1.0001, key).toBe(true);
        for (let t = 0; t < pos.length / 9; t++) {
          const k = t * 9;
          const ax = pos[k + 3] - pos[k]; const ay = pos[k + 4] - pos[k + 1]; const az = pos[k + 5] - pos[k + 2];
          const bx = pos[k + 6] - pos[k]; const by = pos[k + 7] - pos[k + 1]; const bz = pos[k + 8] - pos[k + 2];
          const nx = ay * bz - az * by; const ny = az * bx - ax * bz; const nz = ax * by - ay * bx;
          const l = Math.hypot(nx, ny, nz);
          expect(l, key + ' dejenere').toBeGreaterThan(1e-9);
          expect((nx * nor[k] + ny * nor[k + 1] + nz * nor[k + 2]) / l, key).toBeGreaterThan(0.9999);
        }
        for (let i = 0; i < mat.length; i += 4) {
          expect(mat[i] >= 0 && mat[i] <= 1).toBe(true);
          expect([0, 1, 2, 3, 4]).toContain(mat[i + 1]);
          expect(mat[i + 3] >= 0 && mat[i + 3] <= 1).toBe(true);
        }
      });
    });
  });

  it('modeller boyut kutusuna (±pay) sığar ve tabandan başlar (y ≥ 0)', () => {
    const m = allSlots();
    m.forEach((v, key) => {
      const d = v.def;
      const bb = v.body.boundingBox;
      expect(bb.min.y, key).toBeGreaterThanOrEqual(-1e-6);
      expect(bb.max.y, key).toBeLessThanOrEqual(d.size[1] + 0.06);
      expect(bb.max.x - bb.min.x, key + ' x').toBeLessThanOrEqual(d.size[0] + 0.1);
      expect(bb.max.z - bb.min.z, key + ' z').toBeLessThanOrEqual(d.size[2] + 0.1);
    });
  });

  it('çarpışma kutuları modelin içinde (kutuyu aşan görsel yok / görsel kutuyu kapsar)', () => {
    const m = allSlots();
    m.forEach((v, key) => {
      const d = v.def;
      const bb = v.body.boundingBox;
      d.colliders.forEach((c) => {
        // collider modelin gövdesine denk gelir: kutunun tabanı modelin tabanında, üstü modelin en çok 0.3 altında/üstünde
        expect(c[1]).toBeGreaterThanOrEqual(bb.min.y - 1e-6);
        expect(c[4]).toBeLessThanOrEqual(bb.max.y + 0.3);
        expect(c[0]).toBeGreaterThanOrEqual(bb.min.x - 0.3);
        expect(c[3]).toBeLessThanOrEqual(bb.max.x + 0.3);
        expect(c[2]).toBeGreaterThanOrEqual(bb.min.z - 0.3);
        expect(c[5]).toBeLessThanOrEqual(bb.max.z + 0.3);
      });
      expect(key).toBeTruthy();
    });
  });

  it('tabela/billboard tabela yüzü (tür 2) içerir; trafik direği 3 lamba; terminal ekranı durumla kısık', () => {
    const m = allSlots();
    const kinds = (g) => {
      const a = g.getAttribute('aMat').array;
      const set = new Set();
      for (let i = 1; i < a.length; i += 4) set.add(a[i]);
      return set;
    };
    expect(kinds(m.get('tabela').body).has(2)).toBe(true);
    expect(kinds(m.get('billboard').holo).has(2)).toBe(true);
    const lamps = new Set();
    const a = m.get('trafik_diregi').body.getAttribute('aMat').array;
    for (let i = 0; i < a.length; i += 4) if (a[i + 1] === 4) lamps.add(a[i + 2]);
    expect(Array.from(lamps).sort()).toEqual([1, 2, 3]);
    const t = m.get('terminal').body.getAttribute('aMat').array;
    let dim = false;
    for (let i = 0; i < t.length; i += 4) if (t[i + 1] === 1 && t[i + 3] < 1) dim = true;
    expect(dim).toBe(true);
  });

  it('builder tablosu tüm geometri anahtarlarını kapsar', () => {
    ['lamba', 'bank', 'cop_kutusu', 'trafik_diregi', 'otomat', 'tabela', 'billboard', 'terminal', 'boyut_terminali', 'agac', 'agac:1', 'cit', 'saksi'].forEach((k) => {
      expect(typeof PROP_MODEL_BUILDERS[k]).toBe('function');
    });
  });

  it('dispose sızıntısı yok: geometri bellek sayacı', () => {
    const m = allSlots();
    let bytes = 0;
    m.forEach((v) => {
      [v.body, v.holo].forEach((g) => {
        if (!g) return;
        Object.keys(g.attributes).forEach((n) => { bytes += g.attributes[n].array.byteLength; });
        g.dispose();
      });
    });
    expect(bytes).toBeLessThan(400 * 1024);
  });
});
