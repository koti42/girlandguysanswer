import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CG } from './crowdGeoKit.js';
import {
  GROUP, MODEL, PART, SLOT, buildCitizen, buildUmbrella, lodValue, variantCode,
} from './crowdGeo.js';
import {
  BILLBOARD_FRAGMENT, BILLBOARD_VERTEX, CITIZEN_FRAGMENT, CITIZEN_VERTEX, SHADOW_FRAGMENT, SHADOW_VERTEX, UMBRELLA_FRAGMENT, UMBRELLA_VERTEX,
} from './crowdShaders.js';
import { RENDER_CAPS, createCrowdRenderer, lowStyleOf } from './crowdModels.js';
import { newLook, rollLook, TIER_CAPS } from '../../sim/city/ped/pedData.js';
import { scanText } from '../../sim/city/citySafeData.js';

vi.setConfig({ testTimeout: 120000 });

describe('crowdGeoKit: primitifler', () => {
  it('kutu: 24 köşe 12 üçgen, normaller birim ve sarım dışa bakar; döndürme ve konik', () => {
    const g = new CG();
    g.box(1, 2, 3, 2, 4, 6, { taper: 0.3, rotY: 0.7 });
    const m = g.finalize();
    expect(m.verts).toBe(24);
    expect(m.tris).toBe(12);
    for (let i = 0; i < m.verts; i++) expect(Math.hypot(m.normal[i * 3], m.normal[i * 3 + 1], m.normal[i * 3 + 2])).toBeCloseTo(1, 4);
    const cx = 1; const cy = 2; const cz = 3;
    for (let t = 0; t < m.index.length; t += 3) {
      const a = m.index[t] * 3; const b = m.index[t + 1] * 3; const c = m.index[t + 2] * 3;
      const P = m.position;
      const ux = P[b] - P[a]; const uy = P[b + 1] - P[a + 1]; const uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a]; const vy = P[c + 1] - P[a + 1]; const vz = P[c + 2] - P[a + 2];
      const fx = uy * vz - uz * vy; const fy = uz * vx - ux * vz; const fz = ux * vy - uy * vx;
      const mx = (P[a] + P[b] + P[c]) / 3 - cx; const my = (P[a + 1] + P[b + 1] + P[c + 1]) / 3 - cy; const mz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3 - cz;
      expect(fx * mx + fy * my + fz * mz).toBeGreaterThan(0);
    }
  });

  it('loft/elipsoid/silindir: köşe-indeks tutarlı, normaller sonlu, kısmi yay açık kalır, kapaklı kapalı', () => {
    const g = new CG();
    g.ellipsoid(0, 1, 0, 0.5, 0.6, 0.5, 8, 4);
    g.cyl(0, 0, 0, 2, 0.3, 0.2, 6, { cap: 'both' });
    g.loft([{ y: 0, cx: 0, cz: 0, rx: 1, rz: 1 }, { y: 1, cx: 0, cz: 0, rx: 1, rz: 1 }], 8, { cap: 'none', a0: 0, a1: Math.PI });
    const m = g.finalize();
    for (let i = 0; i < m.index.length; i++) expect(m.index[i]).toBeLessThan(m.verts);
    for (let i = 0; i < m.normal.length; i++) expect(Number.isFinite(m.normal[i])).toBe(true);
    for (let i = 0; i < m.position.length; i++) expect(Number.isFinite(m.position[i])).toBe(true);
    // elipsoid sınır kutusu
    const e = new CG();
    e.ellipsoid(0, 1, 0, 0.5, 0.6, 0.4, 10, 5);
    const b = e.finalize().bounds;
    expect(b[1]).toBeCloseTo(0.4, 2);
    expect(b[4]).toBeCloseTo(1.6, 2);
    expect(b[3]).toBeLessThanOrEqual(0.5001);
    expect(b[5]).toBeLessThanOrEqual(0.4001);
  });
});

describe('crowdGeo: vatandaş modeli', () => {
  const near = buildCitizen(0);
  const mid = buildCitizen(1);

  it('üçgen bütçesi: yakın ≤ 1200 (tüm varyantlar dahil), orta ≤ 600; toplam çizim bütçesi (yakın+orta+afiş) ≤ 40k (yüksek kademe)', () => {
    expect(near.tris).toBeLessThanOrEqual(1200);
    expect(mid.tris).toBeLessThanOrEqual(600);
    expect(mid.tris).toBeLessThan(near.tris * 0.6);
    const c = RENDER_CAPS.high;
    const worst = c.near * near.tris + c.mid * mid.tris + (c.total - c.near - c.mid) * 2;
    expect(worst).toBeLessThanOrEqual(40000);
    const lc = RENDER_CAPS.low;
    expect(lc.near * near.tris + lc.mid * mid.tris).toBeLessThanOrEqual(15000);
    const mc = RENDER_CAPS.medium;
    expect(mc.near * near.tris + mc.mid * mid.tris).toBeLessThanOrEqual(30000);
  });

  [['yakın', near], ['orta', mid]].forEach(([name, m]) => {
    it(name + ' LOD: öznitelik uzunlukları, indeks aralığı, sonlu değerler, bozuk üçgen < %2', () => {
      expect(m.position.length).toBe(m.verts * 3);
      expect(m.normal.length).toBe(m.verts * 3);
      expect(m.aMat.length).toBe(m.verts * 4);
      expect(m.aPivot.length).toBe(m.verts * 3);
      expect(m.index.length).toBe(m.tris * 3);
      let bad = 0;
      for (let t = 0; t < m.index.length; t += 3) {
        const a = m.index[t]; const b = m.index[t + 1]; const c = m.index[t + 2];
        expect(Math.max(a, b, c)).toBeLessThan(m.verts);
        const P = m.position;
        const ux = P[b * 3] - P[a * 3]; const uy = P[b * 3 + 1] - P[a * 3 + 1]; const uz = P[b * 3 + 2] - P[a * 3 + 2];
        const vx = P[c * 3] - P[a * 3]; const vy = P[c * 3 + 1] - P[a * 3 + 1]; const vz = P[c * 3 + 2] - P[a * 3 + 2];
        const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        if (area < 1e-9) bad++;
      }
      expect(bad / m.tris).toBeLessThan(0.02);
      for (let i = 0; i < m.verts; i++) {
        const slot = m.aMat[i * 4];
        const part = m.aMat[i * 4 + 1];
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThanOrEqual(15);
        expect(Number.isInteger(slot)).toBe(true);
        expect(part).toBeGreaterThanOrEqual(0);
        expect(part).toBeLessThanOrEqual(5);
        expect(Number.isFinite(m.position[i * 3] + m.position[i * 3 + 1] + m.position[i * 3 + 2] + m.aPivot[i * 3])).toBe(true);
      }
    });
  });

  it('boyut: yaklaşık 1,78 m, omuz genişliği makul, ayak tabanı y=0; kafa gövdenin üstünde', () => {
    const b = near.bounds;
    expect(b[1]).toBeGreaterThanOrEqual(-0.001);
    expect(b[1]).toBeLessThan(0.03);
    expect(b[4]).toBeGreaterThan(1.7);
    expect(b[4]).toBeLessThan(1.95);
    expect(b[3] - b[0]).toBeLessThan(0.8);
    expect(MODEL.height).toBeCloseTo(1.78, 2);
  });

  it('varyant kümesi: saç 0..5 + (dazlak yok), şapka 1..4, aksesuar 1..6 (yakın), üst 0..3, alt 2; orta LOD benzer biçimleri birleştirir', () => {
    const codes = (m) => {
      const s = new Set();
      for (let i = 0; i < m.verts; i++) s.add(m.aMat[i * 4 + 2]);
      return s;
    };
    const cn = codes(near);
    const cm = codes(mid);
    expect(cn.has(0)).toBe(true);
    for (let h = 0; h <= 5; h++) expect(cn.has(variantCode(GROUP.HAIR, h)), 'saç ' + h).toBe(true);
    expect(cn.has(variantCode(GROUP.HAIR, 6))).toBe(false);
    for (let h = 1; h <= 4; h++) expect(cn.has(variantCode(GROUP.HAT, h))).toBe(true);
    for (let a = 1; a <= 6; a++) expect(cn.has(variantCode(GROUP.ACC, a))).toBe(true);
    for (let t = 0; t <= 3; t++) expect(cn.has(variantCode(GROUP.TOP, t))).toBe(true);
    expect(cn.has(variantCode(GROUP.LOW, 2))).toBe(true);
    // orta LOD'da kullanılan her değer lodValue ile eşleşir
    for (let h = 0; h <= 6; h++) {
      const v = lodValue(1, GROUP.HAIR, h);
      if (v !== 6) expect(cm.has(variantCode(GROUP.HAIR, v)), 'orta saç ' + h + '→' + v).toBe(true);
    }
    [1, 2, 4].forEach((a) => expect(cm.has(variantCode(GROUP.ACC, lodValue(1, GROUP.ACC, a)))).toBe(true));
    expect(lodValue(0, GROUP.HAIR, 5)).toBe(5);
    expect(lodValue(1, GROUP.ACC, 5)).toBe(0);
    expect(lodValue(1, GROUP.HAIR, 3)).toBe(0);
  });

  it('parçalar: bacaklar ve kollar uygun pivotta, alt uzuv bayrağı (diz/dirsek), baş parçası boyun pivotlu', () => {
    const seenPart = new Set();
    let lowerLegs = 0;
    let lowerArms = 0;
    for (let i = 0; i < near.verts; i++) {
      const part = near.aMat[i * 4 + 1];
      const flags = near.aMat[i * 4 + 3];
      seenPart.add(part);
      const py = near.aPivot[i * 3 + 1];
      if (part === PART.LEG_L || part === PART.LEG_R) {
        expect(py).toBeCloseTo(MODEL.hipY, 2);
        if (flags & 1) lowerLegs++;
      }
      if (part === PART.ARM_L || part === PART.ARM_R) {
        expect(py).toBeCloseTo(MODEL.shoulderY, 2);
        if (flags & 1) lowerArms++;
      }
      if (part === PART.HEAD) expect(py).toBeCloseTo(MODEL.neckY, 2);
    }
    expect(seenPart.size).toBe(6);
    expect(lowerLegs).toBeGreaterThan(30);
    expect(lowerArms).toBeGreaterThan(20);
    expect(SLOT.GLOW).toBe(6);
  });

  it('belirlenimci: iki kez kurulan geometri bayt-bayt aynı; şemsiye geometrisi sonlu', () => {
    const a = buildCitizen(0);
    const b = buildCitizen(0);
    expect(Array.from(a.position)).toEqual(Array.from(b.position));
    expect(Array.from(a.aMat)).toEqual(Array.from(b.aMat));
    const u = buildUmbrella();
    expect(u.tris).toBeGreaterThan(40);
    expect(u.tris).toBeLessThan(200);
    for (let i = 0; i < u.position.length; i++) expect(Number.isFinite(u.position[i])).toBe(true);
    expect(u.bounds[4]).toBeGreaterThan(0.55);
  });
});

function declared(src, kw) {
  const out = new Set();
  const re = new RegExp('^\\s*' + kw + '\\s+\\w+\\s+(\\w+)\\s*(?:\\[.*?\\])?;', 'gm');
  let m = re.exec(src);
  while (m) {
    out.add(m[1]);
    m = re.exec(src);
  }
  return out;
}

describe('crowdShaders: statik denetim', () => {
  it('vertex öznitelikleri geometrideki özniteliklerle birebir; uniform adları çizici uniform kümesinde', () => {
    const cr = createCrowdRenderer({ THREE });
    const geoNames = (L) => new Set(Object.keys(L.geo.attributes));
    const pairs = [
      [CITIZEN_VERTEX, cr.layers.near], [CITIZEN_VERTEX, cr.layers.mid], [BILLBOARD_VERTEX, cr.layers.far], [SHADOW_VERTEX, cr.layers.shadow], [UMBRELLA_VERTEX, cr.layers.umbrella],
    ];
    pairs.forEach(([vs, L]) => {
      const need = declared(vs, 'attribute');
      const have = geoNames(L);
      need.forEach((n) => expect(have.has(n), 'öznitelik ' + n).toBe(true));
    });
    const uniNames = new Set(Object.keys(cr.uniforms));
    [CITIZEN_VERTEX, CITIZEN_FRAGMENT, BILLBOARD_VERTEX, BILLBOARD_FRAGMENT, UMBRELLA_VERTEX, UMBRELLA_FRAGMENT, SHADOW_VERTEX, SHADOW_FRAGMENT].forEach((src) => {
      declared(src, 'uniform').forEach((n) => expect(uniNames.has(n), 'uniform ' + n).toBe(true));
    });
    cr.dispose();
  });

  it('gölgelendirici güvenliği: renk kaçak/NaN koruması, ayrık yarıçap, fade dither; 3 Hz üstü titreşim yok; dış kaynak yok; metin marka taraması', () => {
    [CITIZEN_FRAGMENT, BILLBOARD_FRAGMENT, UMBRELLA_FRAGMENT].forEach((f) => {
      expect(f).toContain('kSafeColor');
      expect(f).toContain('tonemapping_fragment');
      expect(f).toContain('colorspace_fragment');
      expect(f).toContain('discard');
    });
    // hız sabitleri: sin(t * k) çarpanları ≤ 8,5 rad/s (≈ 1,35 Hz; el sallama) — 3 Hz = 18,85 rad/s eşiği altında
    const ks = [];
    const re = /sin\(\s*(?:t|uCTime)\s*\*\s*([0-9.]+)/g;
    let m = re.exec(CITIZEN_VERTEX + UMBRELLA_VERTEX);
    while (m) {
      ks.push(Number(m[1]));
      m = re.exec(CITIZEN_VERTEX + UMBRELLA_VERTEX);
    }
    expect(ks.length).toBeGreaterThan(6);
    ks.forEach((k) => expect(k).toBeLessThan(18.85));
    [CITIZEN_VERTEX, CITIZEN_FRAGMENT, BILLBOARD_VERTEX, BILLBOARD_FRAGMENT, UMBRELLA_VERTEX, UMBRELLA_FRAGMENT, SHADOW_VERTEX, SHADOW_FRAGMENT].forEach((s) => {
      expect(s).not.toMatch(/https?:/);
      expect(scanText(s.replace(/[^\p{L}\s]/gu, ' '))).toEqual([]);
    });
  });
});

describe('createCrowdRenderer: kapasite, kademe yönlendirme, bütçe, yıkım', () => {
  const mk = (n, tier, extra) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(Object.assign({
        look: rollLook(3, 100 + i, i % 6, 'merkez', null), x: i, y: 64, z: -i, yaw: i * 0.1, speed: 1.3, phase: i, gesture: 0, tier, fade: 1, umb: 0, lookYaw: 0, sky: 1, blk: 0, id: 100 + i,
      }, extra || null));
    }
    return out;
  };

  it('çizim çağrıları ≤ 12 (5): yakın/orta/uzak/şemsiye/gölge; istatistik sayıları kademeye göre', () => {
    const cr = createCrowdRenderer({ THREE, quality: 'high' });
    cr.beginFrame(null, 0.016, { reduced: false });
    mk(10, 0).forEach((d) => cr.add(d));
    mk(8, 1).forEach((d) => cr.add(d));
    mk(6, 2).forEach((d) => cr.add(d));
    mk(3, 0, { umb: 1 }).forEach((d) => cr.add(d));
    cr.endFrame();
    const s = cr.getStats();
    expect(s.near).toBe(13);
    expect(s.mid).toBe(8);
    expect(s.far).toBe(6);
    expect(s.umbrellas).toBe(3);
    expect(s.shadows).toBe(27);
    expect(s.draws).toBeLessThanOrEqual(5);
    expect(s.tris).toBe(13 * cr.layers.near.tris + 8 * cr.layers.mid.tris + 6 * 2 + 3 * cr.layers.umbrella.tris + 27 * 2);
    expect(cr.layers.near.geo.instanceCount).toBe(13);
    expect(cr.layers.near.mesh.visible).toBe(true);
    expect(cr.layers.far.mesh.visible).toBe(true);
    cr.dispose();
  });

  it('kapasite: kalite tavanı aşan yakın yayalar orta kademeye, orta taşanlar uzağa düşer; hiçbiri yazılan örnek sayısını aşmaz; NaN konum atılır', () => {
    const cr = createCrowdRenderer({ THREE, quality: 'low' });
    cr.beginFrame(null, 0.016, {});
    mk(30, 0).forEach((d) => cr.add(d));
    cr.endFrame();
    const caps = RENDER_CAPS.low;
    expect(cr.stats.near).toBe(caps.near);
    expect(cr.stats.mid).toBe(caps.mid);
    expect(cr.stats.far).toBe(30 - caps.near - caps.mid);
    cr.beginFrame(null, 0.016, {});
    const bad = mk(2, 0);
    bad[0].x = NaN;
    bad[1].fade = 0.01;
    expect(cr.add(bad[0])).toBe(false);
    cr.add(bad[1]);
    cr.endFrame();
    expect(cr.stats.dropped).toBe(1);
    expect(cr.stats.near + cr.stats.mid + cr.stats.far).toBe(0);
    expect(cr.group.visible).toBe(false);
    // 200 yaya: tüm kapasiteler aşılır, hata yok
    cr.beginFrame(null, 0.016, {});
    mk(200, 2).forEach((d) => cr.add(d));
    cr.endFrame();
    expect(cr.stats.far).toBeLessThanOrEqual(cr.layers.far.cap);
    cr.dispose();
  });

  it('örnek öznitelik değerleri sonlu ve aralıklı (renk 0..1 doğrusal, gölge yarıçapı, şemsiye açıklığı); varyant seçimleri LOD eşlemesine uygun', () => {
    const cr = createCrowdRenderer({ THREE });
    cr.beginFrame(null, 0.016, {});
    const list = mk(24, 0, { umb: 0.6, gesture: 3 }).concat(mk(24, 1));
    list.forEach((d) => cr.add(d));
    cr.endFrame();
    [cr.layers.near, cr.layers.mid].forEach((L) => {
      L.names.forEach((nm) => {
        const arr = L.attrs[nm].array;
        for (let i = 0; i < L.n * 4; i++) expect(Number.isFinite(arr[i]), nm + ' ' + i).toBe(true);
      });
      for (let i = 0; i < L.n; i++) {
        const lk = L.attrs.aLook.array;
        expect(lk[i * 4]).toBeGreaterThanOrEqual(0);
        expect(lk[i * 4]).toBeLessThanOrEqual(6);
        expect(lk[i * 4 + 3]).toBeLessThanOrEqual(3);
        const c0 = L.attrs.aCol0.array;
        for (let k = 0; k < 3; k++) {
          expect(c0[i * 4 + k]).toBeGreaterThanOrEqual(0);
          expect(c0[i * 4 + k]).toBeLessThanOrEqual(1);
        }
      }
    });
    const u = cr.layers.umbrella.attrs.aUmb.array;
    for (let i = 0; i < cr.stats.umbrellas; i++) expect(u[i * 4]).toBeCloseTo(0.6, 5);
    cr.dispose();
  });

  it('azaltılmış hareket: uMotion 0,55\'e doğru süzülür; gece/ıslak uniform paylaşımı (aynı nesne)', () => {
    const shared = { uWet: { value: 0.3 }, uNeon: { value: new THREE.Vector4(1, 0, 0, 0) } };
    const cr = createCrowdRenderer({ THREE, uniforms: shared, reducedMotion: true });
    expect(cr.uniforms.uWet).toBe(shared.uWet);
    expect(cr.uniforms.uNeon).toBe(shared.uNeon);
    for (let i = 0; i < 60; i++) cr.beginFrame(null, 0.05, { reduced: true });
    expect(cr.uniforms.uMotion.value).toBeLessThan(0.6);
    for (let i = 0; i < 60; i++) cr.beginFrame(null, 0.05, { reduced: false });
    expect(cr.uniforms.uMotion.value).toBeGreaterThan(0.95);
    cr.dispose();
  });

  it('dispose: tüm geometri/malzeme serbest, tekrar çağrı güvenli, eklenen yok; setQuality bilinmeyen kalite yok sayar', () => {
    const cr = createCrowdRenderer({ THREE });
    const spies = [];
    Object.values(cr.layers).forEach((L) => {
      spies.push(vi.spyOn(L.geo, 'dispose'));
      spies.push(vi.spyOn(L.mat, 'dispose'));
    });
    cr.setQuality('bilinmez');
    expect(cr.stats.tier).toBe('high');
    cr.setQuality('low');
    expect(cr.stats.tier).toBe('low');
    cr.dispose();
    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
    expect(cr.disposed).toBe(true);
    expect(cr.group.children.length).toBe(0);
    expect(() => cr.dispose()).not.toThrow();
  });

  it('lowStyleOf: 0/1/2 dağılımı çeşitli, kurye/koşucuda etek yok; ışıltı/aksan tabloları sonlu', () => {
    const cnt = [0, 0, 0];
    for (let i = 0; i < 600; i++) cnt[lowStyleOf(rollLook(2, i, i % 3, 'merkez', null))]++;
    expect(cnt[0]).toBeGreaterThan(300);
    expect(cnt[1]).toBeGreaterThan(20);
    expect(cnt[2]).toBeGreaterThan(20);
    for (let i = 0; i < 200; i++) expect(lowStyleOf(rollLook(2, i, 3 + (i % 3), 'merkez', null))).toBeLessThan(2);
    expect(Number.isFinite(newLook().glow)).toBe(true);
    expect(TIER_CAPS.high.near).toBeGreaterThanOrEqual(RENDER_CAPS.high.near);
  });
});
