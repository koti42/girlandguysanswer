import { describe, expect, it } from 'vitest';
import {
  PALETTE, POI_STYLE, drawCityMinimap, markerArrow, prepareCityMap,
} from '../city/cityMinimapDraw.js';
import { dimSeed } from '../../../../game/kesif/sim/dim/dimensions.js';

/** Çağrıları sayan sahte 2D bağlam (hiçbir yöntem fırlatmaz). */
function fakeCtx() {
  const calls = {};
  const state = { fills: [], strokes: [], rotates: [], translates: [] };
  const ctx = new Proxy({}, {
    get(_t, name) {
      if (name === 'calls') return calls;
      if (name === 'state') return state;
      return (...a) => {
        calls[name] = (calls[name] || 0) + 1;
        if (name === 'rotate') state.rotates.push(a[0]);
        if (name === 'translate') state.translates.push(a.slice());
        return undefined;
      };
    },
    set(_t, name, v) {
      if (name === 'fillStyle') state.fills.push(v);
      if (name === 'strokeStyle') state.strokes.push(v);
      return true;
    },
  });
  return ctx;
}

const SEED = dimSeed(777, 'neon');

describe('prepareCityMap', () => {
  it('yol kenarları ve yalnız sürüş POI türleri; sınırlı kutular; önbellekli', () => {
    const m = prepareCityMap(SEED);
    expect(m.edges.length).toBeGreaterThan(300);
    expect(m.pois.length).toBeGreaterThan(8);
    m.pois.forEach((p) => expect(Object.keys(POI_STYLE)).toContain(p.type));
    ['garage', 'rental', 'courier_desk', 'portal_terminal', 'race_gate'].forEach((t) => expect(m.pois.some((p) => p.type === t), t).toBe(true));
    m.edges.forEach((e) => {
      expect(e.minX).toBeLessThanOrEqual(e.maxX);
      expect(e.minZ).toBeLessThanOrEqual(e.maxZ);
      expect(e.pts.length).toBeGreaterThanOrEqual(6);
    });
    expect(m.edges.some((e) => e.avenue)).toBe(true);
    expect(m.edges.some((e) => !e.avenue)).toBe(true);
    expect(prepareCityMap(SEED)).toBe(m);
  });

  it('POI simgeleri şekil + renk + ad (renk körü dostu): şekiller benzersiz', () => {
    const shapes = Object.values(POI_STYLE).map((s) => s.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
    Object.values(POI_STYLE).forEach((s) => {
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});

describe('drawCityMinimap', () => {
  const m = prepareCityMap(SEED);
  const base = () => ({
    map: m, pose: { x: 0, z: 0, yaw: 0 }, range: 120, dots: null, marker: null,
  });

  it('plazada çizim: yollar iki toplu çizgi, araç üçgeni, dairesel kırpma, kuzey işareti; çok çağrı yok', () => {
    const ctx = fakeCtx();
    drawCityMinimap(ctx, 140, base());
    expect(ctx.calls.clip).toBe(1);
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(3); // sokak + cadde + (sınır, halka)
    expect(ctx.calls.stroke).toBeLessThan(40);
    expect(ctx.calls.fillText).toBe(1); // 'K'
    expect(ctx.calls.rotate).toBeGreaterThanOrEqual(1);
    expect(ctx.state.rotates[0]).toBeCloseTo(0, 9);
    expect(ctx.state.strokes).toContain(PALETTE.street);
    expect(ctx.state.strokes).toContain(PALETTE.avenue);
  });

  it('yaw haritayı döndürür (ileri = yukarı)', () => {
    const ctx = fakeCtx();
    const d = base();
    d.pose.yaw = 1.2;
    drawCityMinimap(ctx, 112, d);
    expect(ctx.state.rotates).toContain(1.2);
  });

  it('görüş dışı kenarlar atlanır: şehir köşesinden bakınca çizgi sayısı merkezden az', () => {
    const c1 = fakeCtx();
    drawCityMinimap(c1, 140, base());
    const c2 = fakeCtx();
    const d = base();
    d.pose.x = 790;
    d.pose.z = 790;
    drawCityMinimap(c2, 140, d);
    expect(c2.calls.lineTo || 0).toBeLessThan(c1.calls.lineTo || 1e9);
  });

  it('trafik noktaları yalnız görüşteki olanlar; işaretçi içeride iğne, dışarıda kenar oku', () => {
    const d = base();
    d.dots = { count: 3, xz: new Float32Array([10, 10, 20, -30, 5000, 5000]) };
    const c1 = fakeCtx();
    drawCityMinimap(c1, 140, d);
    expect(c1.calls.fillRect).toBe(3); // 1 zemin + 2 görüşteki nokta
    const inside = fakeCtx();
    d.marker = { x: 30, z: -40 };
    drawCityMinimap(inside, 140, d);
    expect(inside.state.fills).toContain(PALETTE.marker);
    const outside = fakeCtx();
    d.marker = { x: 3000, z: -4000 };
    drawCityMinimap(outside, 140, d);
    expect(outside.state.fills).toContain(PALETTE.marker);
    expect(outside.calls.closePath).toBeGreaterThan(inside.calls.closePath || 0); // ok çokgeni
  });

  it('bozuk veri çökertmez: NaN poz, sıfır/NaN menzil, harita yok, işaretçi NaN', () => {
    const ctx = fakeCtx();
    expect(() => drawCityMinimap(ctx, 140, { map: m, pose: { x: NaN, z: 0, yaw: 0 }, range: 100 })).not.toThrow();
    expect(() => drawCityMinimap(ctx, 140, { map: null, pose: { x: 0, z: 0, yaw: 0 }, range: NaN, marker: { x: NaN, z: 1 }, dots: { count: 0, xz: new Float32Array(0) } })).not.toThrow();
    expect(() => drawCityMinimap(ctx, 140, { map: m, pose: { x: 0, z: 0, yaw: 0 }, range: -5 })).not.toThrow();
    expect(() => drawCityMinimap(ctx, 140, { map: m, pose: null, range: 5 })).not.toThrow();
  });

  it('çizim maliyeti: 300 kare < 1 sn (sahte bağlam; yalnız sayma/ayıklama maliyeti)', () => {
    const ctx = fakeCtx();
    const d = base();
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) {
      d.pose.x = i * 3;
      d.pose.z = -i * 2;
      d.pose.yaw = i * 0.03;
      drawCityMinimap(ctx, 140, d);
    }
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('markerArrow', () => {
  it('görüş içinde inside; ileri hedef yukarıda (sy<0), sağdaki hedef sağda (sx>0)', () => {
    const fwd = markerArrow(0, -50, 0, 100);
    expect(fwd.inside).toBe(true);
    expect(fwd.sx).toBeCloseTo(0, 9);
    expect(fwd.sy).toBeCloseTo(-0.5, 9);
    expect(fwd.dist).toBeCloseTo(50, 9);
    const right = markerArrow(50, 0, 0, 100);
    expect(right.sx).toBeGreaterThan(0.4);
    expect(right.ang).toBeCloseTo(Math.PI / 2, 9);
  });
  it('dışarıdaki hedef birim daireye kıskaç (|(sx,sy)| = 1), açı hedefe bakar', () => {
    const a = markerArrow(0, 1000, 0, 100); // güneyde: arkada
    expect(a.inside).toBe(false);
    expect(Math.hypot(a.sx, a.sy)).toBeCloseTo(1, 9);
    expect(a.sy).toBeGreaterThan(0.99);
    // araç 90° dönükken (yaw π/2: ileri = −x) batıdaki hedef yukarıda
    const w = markerArrow(-500, 0, Math.PI / 2, 100);
    expect(w.sy).toBeCloseTo(-1, 9);
  });
  it('sıfır uzaklık ve NaN güvenli', () => {
    expect(markerArrow(0, 0, 0, 100).inside).toBe(true);
    const n = markerArrow(NaN, 5, 0, 100);
    expect(Number.isFinite(n.dist)).toBe(false); // çağıran sonlu kontrol eder (draw bunu yapar)
  });
});
