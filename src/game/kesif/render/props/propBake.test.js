import { describe, expect, it } from 'vitest';
import { bestOf, cpuMs, scaled } from '../../../../test/perfScale.js';
import {
  BYTES_PER_VERTEX, bakeChunk, bakeHolo, setLight, setOpen, setState,
} from './propBake.js';
import { getTemplate } from './propGeoInterior.js';
import { INTERIOR_BY_KEY, INTERIOR_DEFS } from '../../sim/props/propDefsInterior.js';

const T = (key, v, extra) => getTemplate(INTERIOR_BY_KEY[key], v || 0, extra || null);
const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

function item(key, x, y, z, yaw, o) {
  const op = o || {};
  return {
    id: op.id || 1,
    tmpl: T(key, op.v, op.extra),
    x,
    y,
    z,
    yaw,
    state: op.state || 0,
    phase: op.phase === undefined ? 17 : op.phase,
    dev: 33,
    mode: op.mode || 0,
    tint: op.tint || [255, 128, 0],
    sign: op.sign || null,
    light: op.light || [200, 100],
    stateful: !!op.stateful,
  };
}

describe('bakeChunk', () => {
  it('köşe sayısı toplamdır; aralıklar bitişik ve örneğe göre; boyutlar tutarlı', () => {
    const items = [item('sandalye', 33.5, 64, 40.5, 0, { id: 5 }), item('masa', 36, 64, 41, 1, { id: 6 }), item('kapi', 34.5, 64, 44.5, 2, { id: 7, stateful: true })];
    const b = bakeChunk(items, 32, 32);
    const n = items.reduce((s, i) => s + i.tmpl.n, 0);
    expect(b.n).toBe(n);
    expect(b.tris).toBe(n / 3);
    expect(b.pos.length).toBe(n * 3);
    expect(b.nor.length).toBe(n * 4);
    expect(b.uv.length).toBe(n * 2);
    expect(b.col.length).toBe(n * 4);
    expect(b.mat.length).toBe(n * 4);
    expect(b.inst.length).toBe(n * 4);
    expect(b.sign.length).toBe(n * 4);
    expect(b.light.length).toBe(n * 4);
    expect(b.tint.length).toBe(n * 4);
    expect(b.anim.length).toBe(n * 4);
    expect(b.bytes).toBe(n * BYTES_PER_VERTEX);
    expect(b.ranges.map((r) => r.id)).toEqual([5, 6, 7]);
    expect(b.ranges[0].v0).toBe(0);
    expect(b.ranges[1].v0).toBe(b.ranges[0].n);
    expect(b.ranges[2].v0).toBe(b.ranges[0].n + b.ranges[1].n);
    expect(b.ranges[2].stateful).toBe(true);
    expect(b.ranges[2].slide).toBe(true);
    expect(b.ranges[0].slide).toBe(false);
  });

  it('konum dönüşümü three rotation.y ile aynı; chunk-yerel (origin çıkarılır); sınır kutusu doğru', () => {
    for (let yaw = 0; yaw < 4; yaw++) {
      const it = item('koltuk', 50.25, 64.5, 70.75, yaw);
      const b = bakeChunk([it], 48, 64);
      const t = it.tmpl;
      for (let i = 0; i < t.n; i += 7) {
        const lx = t.pos[i * 3];
        const lz = t.pos[i * 3 + 2];
        expect(b.pos[i * 3]).toBeCloseTo(50.25 - 48 + lx * COS[yaw] + lz * SIN[yaw], 5);
        expect(b.pos[i * 3 + 1]).toBeCloseTo(64.5 + t.pos[i * 3 + 1], 5);
        expect(b.pos[i * 3 + 2]).toBeCloseTo(70.75 - 64 - lx * SIN[yaw] + lz * COS[yaw], 5);
        // normal döner ve birim kalır
        const nx = b.nor[i * 4] / 127;
        const ny = b.nor[i * 4 + 1] / 127;
        const nz = b.nor[i * 4 + 2] / 127;
        expect(Math.hypot(nx, ny, nz)).toBeGreaterThan(0.98);
        expect(Math.hypot(nx, ny, nz)).toBeLessThan(1.02);
        expect(nx).toBeCloseTo(t.nor[i * 3] * COS[yaw] + t.nor[i * 3 + 2] * SIN[yaw], 1);
        expect(nz).toBeCloseTo(-t.nor[i * 3] * SIN[yaw] + t.nor[i * 3 + 2] * COS[yaw], 1);
      }
      let mn = Infinity;
      let mx = -Infinity;
      for (let i = 0; i < b.n; i++) { mn = Math.min(mn, b.pos[i * 3]); mx = Math.max(mx, b.pos[i * 3]); }
      expect(b.bounds.min[0]).toBeCloseTo(mn, 6);
      expect(b.bounds.max[0]).toBeCloseTo(mx, 6);
    }
  });

  it('örnek öznitelikleri tüm köşelere yazılır (durum/faz/sapma/kip, ton, ışık, tabela dikdörtgeni); malzeme ve renk şablondan aynen', () => {
    const it = item('neon_tabela_ic', 40, 66, 40, 0, {
      id: 9, state: 2, phase: 77, mode: 3, tint: [10, 20, 30], light: [11, 22], sign: [0.1, 0.2, 0.6, 0.4],
    });
    const b = bakeChunk([it], 32, 32);
    for (let i = 0; i < b.n; i++) {
      expect(b.inst[i * 4]).toBe(2);
      expect(b.inst[i * 4 + 1]).toBe(77);
      expect(b.inst[i * 4 + 2]).toBe(33);
      expect(b.inst[i * 4 + 3]).toBe(3);
      expect([b.tint[i * 4], b.tint[i * 4 + 1], b.tint[i * 4 + 2]]).toEqual([10, 20, 30]);
      expect([b.light[i * 4], b.light[i * 4 + 1]]).toEqual([11, 22]);
      expect(b.sign[i * 4]).toBe(Math.round(0.1 * 65535));
      expect(b.sign[i * 4 + 3]).toBe(Math.round(0.4 * 65535));
      expect(b.mat[i * 4 + 1]).toBe(it.tmpl.mat[i * 4 + 1]);
      expect(b.col[i * 4 + 3]).toBe(it.tmpl.col[i * 4 + 3]);
    }
    const none = bakeChunk([item('masa', 40, 64, 40, 0)], 32, 32);
    expect([none.sign[0], none.sign[1], none.sign[2], none.sign[3]]).toEqual([0, 0, 65535, 65535]);
  });

  it('kayan parça anim vektörü yaw ile döner (kapı yaprağı: yaw 1 → z ekseni)', () => {
    const d0 = bakeChunk([item('kapi', 40.5, 64, 40.5, 0, { stateful: true })], 32, 32);
    const d1 = bakeChunk([item('kapi', 40.5, 64, 40.5, 1, { stateful: true })], 32, 32);
    let a0 = 0;
    let a1 = 0;
    for (let i = 0; i < d0.n; i++) {
      if (d0.mat[i * 4 + 2] < 160) continue;
      a0 += Math.abs(d0.anim[i * 4]);
      a1 += Math.abs(d1.anim[i * 4 + 2]);
      expect(d0.anim[i * 4 + 2]).toBe(0);
      expect(d1.anim[i * 4]).toBe(0);
    }
    expect(a0).toBeGreaterThan(0);
    expect(a1).toBe(a0);
  });

  it('boş liste güvenli; holo listesi şablon.holo olanlardan', () => {
    const b = bakeChunk([], 0, 0);
    expect(b.n).toBe(0);
    expect(b.ranges.length).toBe(0);
    expect(b.bounds.min).toEqual([0, 0, 0]);
    const h = bakeChunk([item('holo_ekran', 40, 66, 40, 0, { id: 3 }), item('masa', 44, 64, 40, 0, { id: 4 })], 32, 32);
    expect(h.holo.length).toBe(1);
    expect(h.holo[0].id).toBe(3);
    expect(h.holoCount).toBe(1);
  });
});

describe('yerinde güncellemeler', () => {
  it('setState / setOpen / setLight yalnız kendi aralığına yazar, değişmediğinde false döner', () => {
    const b = bakeChunk([item('kapi', 40.5, 64, 40.5, 0, { id: 1, stateful: true }), item('kapi', 42.5, 64, 40.5, 0, { id: 2, stateful: true })], 32, 32);
    const [r1, r2] = b.ranges;
    expect(setState(b, r1, 1)).toBe(true);
    expect(setState(b, r1, 1)).toBe(false);
    for (let i = r1.v0; i < r1.v0 + r1.n; i++) expect(b.inst[i * 4]).toBe(1);
    for (let i = r2.v0; i < r2.v0 + r2.n; i++) expect(b.inst[i * 4]).toBe(0);
    expect(setOpen(b, r1, 0.5)).toBe(true);
    expect(setOpen(b, r1, 0.5)).toBe(false);
    expect(b.anim[r1.v0 * 4 + 3]).toBe(64);
    expect(b.anim[r2.v0 * 4 + 3]).toBe(0);
    expect(setOpen(b, r1, 7)).toBe(true);
    expect(b.anim[r1.v0 * 4 + 3]).toBe(127);
    expect(setOpen(b, r1, -3)).toBe(true);
    expect(b.anim[r1.v0 * 4 + 3]).toBe(0);
    expect(setLight(b, r2, 5, 6)).toBe(true);
    expect(setLight(b, r2, 5, 6)).toBe(false);
    expect([b.light[r2.v0 * 4], b.light[r2.v0 * 4 + 1]]).toEqual([5, 6]);
    expect(b.light[r1.v0 * 4]).toBe(200);
  });
});

describe('bakeHolo', () => {
  it('holo yüzlerini dünya konumuna taşır; durum baytı örneğe göre', () => {
    const list = [
      {
        tmpl: T('holo_ekran', 0), x: 10, y: 66, z: 20, yaw: 0, state: 1, tint: [1, 2, 3], phase: 9,
      },
      {
        tmpl: T('holo_perde', 0), x: 30, y: 65, z: 40, yaw: 1, state: 0, tint: [4, 5, 6], phase: 3,
      },
    ];
    const h = bakeHolo(list, 0, 0);
    expect(h.n).toBe(list[0].tmpl.holo.n + list[1].tmpl.holo.n);
    expect(h.inst[0]).toBe(1);
    expect(h.inst[(list[0].tmpl.holo.n) * 4]).toBe(0);
    for (let i = 0; i < h.n; i++) expect(h.mat[i * 4 + 1]).toBe(7);
    const t = list[0].tmpl.holo;
    expect(h.pos[0]).toBeCloseTo(10 + t.pos[0], 5);
    expect(h.pos[1]).toBeCloseTo(66 + t.pos[1], 5);
    expect(h.pos[2]).toBeCloseTo(20 + t.pos[2], 5);
  });
});

describe('pişirme maliyeti', () => {
  it('80 örnekli (≈ 16 bin köşe) chunk\'ı pişirmek hızlı ve belirlenimci', () => {
    const items = [];
    for (let i = 0; i < 80; i++) {
      const d = INTERIOR_DEFS[(i * 7) % INTERIOR_DEFS.length];
      items.push(item(d.key, 32 + (i % 10) * 1.5, 64, 32 + Math.floor(i / 10) * 1.8, i & 3, { id: i + 1, v: i & 7 }));
    }
    items.forEach((it) => it.tmpl); // şablonlar ısınmış
    let b;
    // qa5: CPU zamanı + en iyi 3 parti; eşik yük ölçeğiyle (bkz. test/perfScale.js)
    const ms = bestOf(3, () => {
      const t0 = cpuMs();
      for (let r = 0; r < 5; r++) b = bakeChunk(items, 32, 32);
      return (cpuMs() - t0) / 5;
    });
    expect(ms).toBeLessThan(scaled(30));
    const b2 = bakeChunk(items, 32, 32);
    expect(Array.from(b2.pos.subarray(0, 600))).toEqual(Array.from(b.pos.subarray(0, 600)));
    expect(b2.n).toBe(b.n);
    expect(b.bytes).toBeLessThan(2.5 * 1024 * 1024);
  });
});
