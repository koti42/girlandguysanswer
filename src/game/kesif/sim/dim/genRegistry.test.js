import { afterEach, describe, expect, it } from 'vitest';
import { WORLD_RADIUS } from '../constants.js';
import { generateChunk, generateSection } from '../worldgen.js';
import {
  DIM_GEN_KEYS, getCityRules, getDimGen, hasDimGen, registerDimGen, unregisterDimGen,
} from './genRegistry.js';
import { flatCityGen } from './dimTestKit.js';

function same(x, y) {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

afterEach(() => {
  unregisterDimGen('city');
  unregisterDimGen('deneme');
});

describe("genRegistry 'overworld'", () => {
  it('mevcut worldgen işlevleri AYNEN (aynı nesneler; sıfır davranış değişikliği)', () => {
    const g = getDimGen('overworld');
    expect(g.key).toBe('overworld');
    expect(g.generateChunk).toBe(generateChunk);
    expect(g.generateSection).toBe(generateSection);
    expect(g.decorate).toBeNull();
    expect(getDimGen('overworld')).toBe(g);
    expect(hasDimGen('overworld')).toBe(true);
  });

  it('kayıt defteri üzerinden üretilen chunk/kesit bayt-bayt aynı (2 tohum × 3 chunk)', () => {
    const g = getDimGen('overworld');
    [20261016, 77].forEach((seed) => {
      [[0, 0], [-3, 2], [5, -4]].forEach(([cx, cz]) => {
        const a = g.generateChunk(seed, cx, cz, { light: false });
        const b = generateChunk(seed, cx, cz, { light: false });
        expect(same(a.toDense(0, 128), b.toDense(0, 128))).toBe(true);
        const sa = g.generateSection(seed, cx, cz, 10, {});
        const sb = generateSection(seed, cx, cz, 10, {});
        expect(sa.uniform).toBe(sb.uniform);
        expect(!!sa.blocks).toBe(!!sb.blocks);
        if (sa.blocks) expect(same(sa.blocks, sb.blocks)).toBe(true);
      });
    });
  });

  it('canGenerate: dünya yarıçapı içinde true, çok ötede false', () => {
    const g = getDimGen('overworld');
    expect(g.canGenerate(0, 0)).toBe(true);
    expect(g.canGenerate(Math.floor(WORLD_RADIUS / 16) - 2, 0)).toBe(true);
    expect(g.canGenerate(5000, 5000)).toBe(false);
  });
});

describe("genRegistry 'city'", () => {
  it('anahtar listesi; bilinmeyen anahtar atar', () => {
    expect(DIM_GEN_KEYS).toEqual(['overworld', 'city']);
    expect(() => getDimGen('yok')).toThrow(/Bilinmeyen üretici/);
    expect(() => getDimGen('__proto__')).toThrow();
    expect(() => getDimGen(undefined)).toThrow();
  });

  it('cityGen yoksa üretici çağrısı açık bir hata verir; varsa gerçek üretici devreder', () => {
    const g = getDimGen('city');
    expect(g.key).toBe('city');
    expect(g.decorate).toBeNull();
    if (!hasDimGen('city')) {
      expect(() => g.generateChunk(1, 0, 0, {})).toThrow(/Şehir üreticisi/);
      expect(() => g.generateSection(1, 0, 0, 3, {})).toThrow(/Şehir üreticisi/);
    } else {
      const c = g.generateChunk(1, 0, 0, { dim: 'neon' });
      expect(c.cx).toBe(0);
    }
  });

  it('registerDimGen("city") kayıtlı üreticiye devreder (argümanlar aynen)', () => {
    const calls = [];
    const impl = {
      generateChunk: (...a) => { calls.push(['chunk', ...a]); return 'C'; },
      generateSection: (...a) => { calls.push(['sec', ...a]); return 'S'; },
    };
    registerDimGen('city', impl);
    expect(hasDimGen('city')).toBe(true);
    const g = getDimGen('city');
    expect(g.generateChunk(5, 1, 2, { a: 1 })).toBe('C');
    expect(g.generateSection(5, 1, 2, 7, { b: 2 })).toBe('S');
    expect(calls).toEqual([['chunk', 5, 1, 2, { a: 1 }], ['sec', 5, 1, 2, 7, { b: 2 }]]);
    expect(unregisterDimGen('city')).toBe(true);
  });

  it('canGenerate: şehir sınırları (chunk -50..49)', () => {
    const g = getDimGen('city');
    expect(g.canGenerate(-50, 49)).toBe(true);
    expect(g.canGenerate(49, -50)).toBe(true);
    expect(g.canGenerate(50, 0)).toBe(false);
    expect(g.canGenerate(0, -51)).toBe(false);
  });

  it('özel üretici anahtarı (deneme) sarılır ve kayıt silinince kaybolur', () => {
    registerDimGen('deneme', { generateChunk: () => 1, generateSection: () => 2 });
    const g = getDimGen('deneme');
    expect(g.generateChunk()).toBe(1);
    expect(g.canGenerate(1, 1)).toBe(true);
    expect(hasDimGen('deneme')).toBe(true);
    unregisterDimGen('deneme');
    expect(hasDimGen('deneme')).toBe(false);
    expect(() => getDimGen('deneme')).toThrow();
  });

  it('registerDimGen geçersiz üreticiyi reddeder', () => {
    expect(() => registerDimGen('city', null)).toThrow();
    expect(() => registerDimGen('city', { generateChunk: () => 1 })).toThrow();
    expect(() => registerDimGen(5, flatCityGen())).toThrow();
  });
});

describe('getCityRules önceliği', () => {
  it('world.cityRules > kayıtlı üretici > yok', () => {
    const own = { isNaturalFill: () => true, isNoBuild: () => false };
    expect(getCityRules({ cityRules: own, seed: 1 })).toBe(own);
    const reg = { isNaturalFill: () => false, isNoBuild: () => true };
    registerDimGen('city', { ...flatCityGen(), cityRules: reg });
    expect(getCityRules({ seed: 1 })).toBe(reg);
    expect(getCityRules({ cityRules: own, seed: 1 })).toBe(own);
    expect(getCityRules(null)).toBe(reg);
  });

  it('kural nesnesi geçersizse sayılmaz', () => {
    unregisterDimGen('city');
    const r = getCityRules({ cityRules: { isNaturalFill: 5 }, seed: 1 });
    if (!hasDimGen('city')) expect(r).toBeNull();
  });
});
