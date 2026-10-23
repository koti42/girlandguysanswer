import { describe, expect, it } from 'vitest';
import {
  AMBIENT_KINDS, AMBIENT_RATES, MAX_FLASH_HZ, PARTICLE_QUALITY, ballistic, ballisticVelocity, createRing, fadeCurve,
  orbit, orientFromNormal, px, py, pz, qualityKey, safeFlickerHz, sanitizeAmbient, scaleCount,
} from './particleLogic.js';
import {
  DEBRIS_FALLBACK, blockBaseColor, blockDebrisColors, paletteFrom, tileColors,
} from './blockColors.js';
import { BLOCKS, B, TILE_NAMES } from '../sim/blocks.js';

function drainAll(ring) {
  const out = [];
  const n = ring.drain((s, c) => out.push([s, c]));
  return { out, n };
}

describe('halka tampon (createRing)', () => {
  it('yuvaları sırayla dağıtır ve dolunca başa sarar', () => {
    const r = createRing(5);
    const seen = [];
    for (let i = 0; i < 12; i++) seen.push(r.alloc());
    expect(seen).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1]);
    expect(r.high).toBe(5);
    expect(r.total).toBe(12);
  });

  it('ardışık yuvalar tek kirli aralıkta birleşir; drain sonrası temizlenir', () => {
    const r = createRing(100);
    for (let i = 0; i < 10; i++) r.alloc();
    expect(drainAll(r)).toEqual({ out: [[0, 10]], n: 10 });
    expect(drainAll(r)).toEqual({ out: [], n: 0 });
    for (let i = 0; i < 4; i++) r.alloc();
    expect(drainAll(r).out).toEqual([[10, 4]]);
  });

  it('sarma anında iki ayrı aralık verir', () => {
    const r = createRing(10);
    for (let i = 0; i < 8; i++) r.alloc();
    r.drain(() => {});
    for (let i = 0; i < 5; i++) r.alloc(); // 8,9,0,1,2
    const { out, n } = drainAll(r);
    expect(out).toEqual([[8, 2], [0, 3]]);
    expect(n).toBe(5);
  });

  it('bir karede kapasiteden fazla doğuş → tüm tampon kirli', () => {
    const r = createRing(8);
    for (let i = 0; i < 20; i++) r.alloc();
    const { out } = drainAll(r);
    expect(out).toEqual([[0, 8]]);
    // sonraki kare temiz
    r.alloc();
    expect(drainAll(r).out).toEqual([[r.head === 0 ? 7 : r.head - 1, 1]]);
  });

  it('çok parçalı yazım (MAX_RUNS aşımı) tam yüklemeye döner', () => {
    const r = createRing(64);
    r.alloc(); r.drain(() => {});
    // yuvaları atlayarak yaz: head'i elle sıçrat
    for (let k = 0; k < 12; k++) { r.head = k * 5; r.alloc(); }
    const { out } = drainAll(r);
    expect(out.length).toBe(1);
    expect(out[0][0]).toBe(0);
  });

  it('setActiveCap: dağıtım küçülen bölgede döner; markAll tamamını kirletir', () => {
    const r = createRing(100);
    r.setActiveCap(4);
    const seen = [];
    for (let i = 0; i < 9; i++) seen.push(r.alloc());
    expect(seen).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0]);
    r.drain(() => {});
    r.setActiveCap(1000);
    expect(r.activeCap).toBe(100);
    r.setActiveCap(0);
    expect(r.activeCap).toBe(1);
    r.markAll();
    expect(drainAll(r).out.length).toBe(1);
    r.reset();
    expect(r.high).toBe(0);
    expect(r.total).toBe(0);
  });

  it('yazılan aralıklar yuvaları kapsar (rastgele doğuş yığınları)', () => {
    const r = createRing(37);
    let s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let frame = 0; frame < 200; frame++) {
      const count = Math.floor(rnd() * 25);
      const allocated = new Set();
      for (let i = 0; i < count; i++) allocated.add(r.alloc());
      const covered = new Set();
      r.drain((st, c) => { for (let k = 0; k < c; k++) covered.add(st + k); });
      for (const a of allocated) expect(covered.has(a)).toBe(true);
    }
  });
});

describe('yoğunluk, titreme ve kalite', () => {
  it('scaleCount ortalamayı korur', () => {
    let s = 3;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    let total = 0;
    for (let i = 0; i < 4000; i++) total += scaleCount(10, 0.43, rnd);
    expect(total / 4000).toBeGreaterThan(4.15);
    expect(total / 4000).toBeLessThan(4.45);
    expect(scaleCount(10, 1, rnd)).toBe(10);
    expect(scaleCount(0, 1, rnd)).toBe(0);
    expect(scaleCount(3, 0, rnd)).toBe(0);
  });

  it('titreme en çok 3 Hz; kısıtlı harekette 0', () => {
    expect(MAX_FLASH_HZ).toBe(3);
    expect(safeFlickerHz(10, false)).toBe(3);
    expect(safeFlickerHz(1.5, false)).toBe(1.5);
    expect(safeFlickerHz(10, true)).toBe(0);
  });

  it('kalite tablosu monoton; bilinmeyen anahtar medium', () => {
    expect(PARTICLE_QUALITY.low.density).toBeLessThan(PARTICLE_QUALITY.medium.density);
    expect(PARTICLE_QUALITY.medium.density).toBeLessThan(PARTICLE_QUALITY.high.density);
    expect(PARTICLE_QUALITY.low.max).toBeLessThan(PARTICLE_QUALITY.high.max);
    expect(PARTICLE_QUALITY.low.density).toBeCloseTo(0.4, 6);
    expect(qualityKey('low')).toBe('low');
    expect(qualityKey(2)).toBe('high');
    expect(qualityKey('x')).toBe('medium');
    expect(qualityKey(undefined)).toBe('medium');
  });

  it('ortam karışımı süzülür', () => {
    const m = sanitizeAmbient({ fireflies: 2, pollen: -1, dust: 'x', snow: 0.5, bogus: 1 });
    expect(m).toEqual({
      fireflies: 1, pollen: 0, dust: 0, snow: 0.5, embers: 0, spores: 0, leaves: 0, petals: 0, ash: 0,
    });
    expect(Object.keys(sanitizeAmbient(null))).toEqual(AMBIENT_KINDS.slice());
    for (const k of AMBIENT_KINDS) expect(AMBIENT_RATES[k]).toBeGreaterThan(0);
  });
});

describe('shader formüllerinin CPU karşılığı', () => {
  it('ballistic: düşük sürtünmede serbest düşme (v t + g t²/2) ile örtüşür', () => {
    const o = [0, 0, 0];
    ballistic(o, 2, 5, -1, -10, 0.01, 0.8);
    expect(o[0]).toBeCloseTo(2 * 0.8, 1);
    expect(o[1]).toBeCloseTo(5 * 0.8 - 5 * 0.64, 1);
    expect(o[2]).toBeCloseTo(-0.8, 1);
  });

  it('ballistic: yüksek sürtünmede hız sönümlenir, yerçekimi uç hızına yaklaşır', () => {
    const o = [0, 0, 0];
    ballistic(o, 10, 0, 0, 0, 4, 100);
    expect(o[0]).toBeCloseTo(10 / 4, 3);
    const v = [0, 0, 0];
    ballisticVelocity(v, 0, 0, 0, -8, 2, 50);
    expect(v[1]).toBeCloseTo(-8 / 2, 3);
    ballisticVelocity(v, 3, 4, 0, -8, 2, 0);
    expect(v).toEqual([3, 4, 0]);
  });

  it('ballistic konumunun türevi ballisticVelocity ile tutarlı', () => {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    const v = [0, 0, 0];
    const t = 0.7;
    const h = 1e-4;
    ballistic(a, 1, 6, 2, -9, 0.9, t - h);
    ballistic(b, 1, 6, 2, -9, 0.9, t + h);
    ballisticVelocity(v, 1, 6, 2, -9, 0.9, t);
    for (let i = 0; i < 3; i++) expect((b[i] - a[i]) / (2 * h)).toBeCloseTo(v[i], 3);
  });

  it('orbit: yarıçap r0→r1 yumuşak geçer, eksene göre düzlem seçilir', () => {
    const o = [0, 0, 0];
    orbit(o, 1, 0.5, 0, 2, 0.2, 0, 1, 0);
    expect(o).toEqual([1, 0, 0]);
    orbit(o, 1, 0.5, 0, 2, 0.2, 1, 1, 0);
    expect(Math.hypot(o[0], o[2])).toBeCloseTo(0.2, 6);
    expect(o[1]).toBeCloseTo(0.5, 6);
    orbit(o, 1, 0.5, 0, 0, 0.2, 0, 1, 1);
    expect(o).toEqual([0, 1, 0]);
    orbit(o, 1, 0.5, Math.PI / 2, 0, 0.2, 0, 1, 2);
    expect(o[0]).toBeCloseTo(0, 6);
    expect(o[1]).toBeCloseTo(1, 6);
    expect(o[2]).toBeCloseTo(0, 6);
  });

  it('fadeCurve girişte açılır, sonda söner, hep 0..1', () => {
    expect(fadeCurve(0)).toBe(0);
    expect(fadeCurve(0.06)).toBeCloseTo(1, 6);
    expect(fadeCurve(0.5)).toBe(1);
    expect(fadeCurve(1)).toBeCloseTo(0, 6);
    for (let u = 0; u <= 1; u += 0.01) {
      expect(fadeCurve(u)).toBeGreaterThanOrEqual(0);
      expect(fadeCurve(u)).toBeLessThanOrEqual(1);
    }
  });

  it('orientFromNormal: baskın eksen', () => {
    expect(orientFromNormal(0, 1, 0)).toBe(0);
    expect(orientFromNormal(0, -1, 0)).toBe(0);
    expect(orientFromNormal(1, 0.2, 0)).toBe(1);
    expect(orientFromNormal(0.1, 0, -1)).toBe(2);
  });

  it('px/py/pz nesne ve dizi okur', () => {
    expect([px({ x: 1, y: 2, z: 3 }), py({ x: 1, y: 2, z: 3 }), pz({ x: 1, y: 2, z: 3 })]).toEqual([1, 2, 3]);
    expect([px([4, 5, 6]), py([4, 5, 6]), pz([4, 5, 6])]).toEqual([4, 5, 6]);
  });
});

describe('blok renkleri', () => {
  it('her blok için geçerli, dondurulmuş 4 renkli palet var (hava dahil)', () => {
    for (const b of BLOCKS) {
      const p = blockDebrisColors(b.id);
      expect(p.length).toBe(4);
      for (const c of p) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
      }
      expect(Object.isFrozen(p)).toBe(true);
      expect(blockBaseColor(b.id)).toBe(p[0]);
    }
  });

  it('doku adı kuralları: çimen yeşil, kum açık sarı, kar beyaz, lav turuncu, cevherler taş + vurgu', () => {
    const near = (a, b, tol = 60) => {
      const d = (x, y, s) => Math.abs(((x >> s) & 255) - ((y >> s) & 255));
      return d(a, b, 16) < tol && d(a, b, 8) < tol && d(a, b, 0) < tol;
    };
    expect(near(blockBaseColor(B.GRASS), 0x7a5230)).toBe(true); // yan doku toprak
    expect(blockDebrisColors(B.GRASS)[1]).toBe(0x6fae45); // üst doku yeşil palete katılır
    expect(near(blockBaseColor(B.SAND), 0xe2d29a)).toBe(true);
    expect(near(blockBaseColor(B.SNOW), 0xf2f6fa)).toBe(true);
    expect(near(blockBaseColor(B.LAVA), 0xff7a22)).toBe(true);
    expect(blockDebrisColors(B.GOLD_ORE)[1]).toBe(0xf4c940);
    expect(blockDebrisColors(B.DIAMOND_ORE)[1]).toBe(0x4fe3d6);
    expect(near(blockBaseColor(B.CONCRETE_RED), 0xc8312f)).toBe(true);
    expect(near(blockBaseColor(B.GLASS_BLUE), 0x2f5fc8)).toBe(true);
    expect(near(blockBaseColor(B.RUNE_YELLOW), 0xf2c91e)).toBe(true);
  });

  it('bilinen tüm doku adlarının çoğu kural ya da renk tablosundan renk alır', () => {
    let hit = 0;
    for (const n of TILE_NAMES) if (tileColors(n)) hit++;
    expect(hit / TILE_NAMES.length).toBeGreaterThan(0.93);
    expect(tileColors(null)).toBeNull();
    expect(tileColors('yok_boyle_doku')).toBeNull();
  });

  it('paletteFrom: kimlik, nesne, dizi, dize ve geçersiz girdi', () => {
    expect(paletteFrom(B.STONE)).toBe(blockDebrisColors(B.STONE));
    expect(paletteFrom({ color: 0xff0000 })[0]).toBe(0xff0000);
    expect(paletteFrom({ color: 0xff0000, color2: 0x00ff00 })[1]).toBe(0x00ff00);
    expect(paletteFrom([0x112233, 0x445566]).length).toBe(2);
    expect(paletteFrom([0x112233]).length).toBe(4);
    expect(paletteFrom('#336699')[0]).toBe(0x336699);
    expect(paletteFrom({ id: B.DIRT })).toBe(blockDebrisColors(B.DIRT));
    expect(paletteFrom(null)).toBe(DEBRIS_FALLBACK);
    expect(paletteFrom('kırmızı')).toBe(DEBRIS_FALLBACK);
  });
});
