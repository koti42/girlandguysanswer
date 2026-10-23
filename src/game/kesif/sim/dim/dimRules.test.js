import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { DIM_SAVE_LIMITS, DIMS } from './dimensions.js';
import {
  DENY_MESSAGES, canBreak, canPlace, checkSetBlock, denyMessage, editBudget,
} from './dimRules.js';
import { ASPHALT, BUILDING, makeCityWorld } from './dimTestKit.js';

function cityWorld() {
  const w = makeCityWorld(42);
  w.ensureChunk(0, 0);
  w.ensureChunk(1, 0);
  return w;
}

/** Kuralları dünyaya bağlı olmadan sınamak için sahte neon dünyası. */
function fakeNeon(edits, rules) {
  return {
    dim: 'neon',
    dimDef: DIMS.neon,
    yMin: -400,
    seed: 1,
    edits: edits || new Map(),
    cityRules: rules || { isNaturalFill: (x, y) => y <= 62, isNoBuild: () => false },
  };
}

describe('canBreak (tablo)', () => {
  const w = cityWorld();
  const rows = [
    ['doğal taş dolgu y=62', 5, 62, 5, B.STONE, true],
    ['derin taş y=-100', 5, -100, 5, B.STONE, true],
    ['asfalt (yapı) y=63', 5, 63, 5, ASPHALT, false],
    ['bina duvarı', 8, 64, 8, BUILDING, false],
    ['bina duvarı üst', 10, 66, 10, BUILDING, false],
    ['hava', 5, 70, 5, 0, true],
  ];
  rows.forEach(([name, x, y, z, id, ok]) => {
    it(name, () => {
      const r = canBreak(w, x, y, z, id);
      expect(r.ok).toBe(ok);
      if (!ok) {
        expect(r.reason).toBe('korumali');
        expect(r.message).toBe('Neon Meridyen yapıları korunuyor.');
      } else {
        expect(r.reason).toBeNull();
      }
    });
  });

  it('oyuncunun koyduğu blok kırılabilir (edits = eski kimlik); başka kimlikse korumalı kalır', () => {
    const f = fakeNeon(new Map([['3,64,3', B.STONE]]));
    expect(canBreak(f, 3, 64, 3, B.STONE).ok).toBe(true);
    expect(canBreak(f, 3, 64, 3, BUILDING).ok).toBe(false); // edit kimliği ≠ eski kimlik
    expect(canBreak(f, 4, 64, 3, B.STONE).ok).toBe(false);
  });
});

describe('canPlace (tablo)', () => {
  const w = cityWorld();
  const rows = [
    ['yol koridoru y64', 0, 64, 0, B.STONE, false],
    ['yol koridoru üst sınır y68', 7, 68, -2, B.STONE, false],
    ['yol koridoru üstü y69', 7, 69, 0, B.STONE, true],
    ['koridor dışı z=5', 7, 64, 5, B.STONE, true],
    ['hava (0) yerleştirme sayılmaz', 0, 64, 0, 0, true],
  ];
  rows.forEach(([name, x, y, z, id, ok]) => {
    it(name, () => {
      const r = canPlace(w, x, y, z, id);
      expect(r.ok).toBe(ok);
      if (!ok) expect(r.reason).toBe('korumali');
    });
  });
});

describe('düzenleme bütçesi %90 → "Şehirde yer doldu"', () => {
  it('boş dünyada 0; yerleştirme serbest', () => {
    const f = fakeNeon();
    const b = editBudget(f);
    expect(b.bytes).toBe(0);
    expect(b.full).toBe(false);
    expect(b.limit).toBe(DIM_SAVE_LIMITS.edits);
    expect(canPlace(f, 1, 70, 1, B.STONE).ok).toBe(true);
  });

  it('bütçe %90’ı aşınca yerleştirme reddedilir, kırma serbest kalır', () => {
    const edits = new Map();
    // seyrek tek hücreler: her biri ayrı RLE koşusu → kodlanmış boyut hızla büyür
    let n = 0;
    let lcg = 12345;
    const next = () => {
      lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
      return lcg;
    };
    const f = fakeNeon(edits);
    while (!editBudget(f).full && n < 60000) {
      for (let k = 0; k < 500; k++) {
        const x = (next() % 1500) - 750;
        const z = (next() % 1500) - 750;
        const y = 64 + (next() % 200);
        edits.set(x + ',' + y + ',' + z, B.STONE);
        n++;
      }
    }
    const b = editBudget(f);
    expect(b.full).toBe(true);
    expect(b.frac).toBeGreaterThanOrEqual(0.9);
    const r = canPlace(f, 1, 300, 1, B.STONE);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('doldu');
    expect(r.message).toBe('Şehirde yer doldu.');
    // kırma bütçeden bağımsız (alan açmak serbest)
    const first = edits.keys().next().value.split(',').map(Number);
    expect(canBreak(f, first[0], first[1], first[2], B.STONE).ok).toBe(true);
  });

  it('bütçe önbelleği: küçük artışta yeniden ölçmez, 128+ değişimde yeniler', () => {
    const f = fakeNeon();
    editBudget(f);
    const c0 = f._dimBudget;
    f.edits.set('1,70,1', B.STONE);
    editBudget(f);
    expect(f._dimBudget).toBe(c0); // 1 düzenleme: önbellek aynı
    for (let i = 0; i < 200; i++) f.edits.set(i + ',71,5', B.STONE);
    editBudget(f);
    expect(f._dimBudget).not.toBe(c0);
    expect(f._dimBudget.bytes).toBeGreaterThan(0);
  });
});

describe('checkSetBlock birleşik kural', () => {
  const w = cityWorld();
  it('id 0 → kırma kuralı', () => {
    expect(checkSetBlock(w, 5, 63, 5, ASPHALT, 0).ok).toBe(false);
    expect(checkSetBlock(w, 5, 62, 5, B.STONE, 0).ok).toBe(true);
  });
  it('boş hücreye koyma → yerleştirme kuralı', () => {
    expect(checkSetBlock(w, 0, 64, 0, 0, B.STONE).reason).toBe('korumali');
    expect(checkSetBlock(w, 9, 70, 9, 0, B.STONE).ok).toBe(true);
  });
  it('sıvıya koyma yalnız yerleştirme kuralı (sıvı korumalı yapı sayılmaz)', () => {
    const f = fakeNeon(new Map(), { isNaturalFill: () => false, isNoBuild: () => false });
    expect(checkSetBlock(f, 9, 40, 9, B.WATER, B.STONE).ok).toBe(true);
  });
  it('dolu hücreyi başka bloğa çevirme: eski korumalıysa red, oyuncununsa serbest', () => {
    expect(checkSetBlock(w, 8, 64, 8, BUILDING, B.STONE).reason).toBe('korumali');
    const f = fakeNeon(new Map([['2,70,2', B.DIRT]]));
    expect(checkSetBlock(f, 2, 70, 2, B.DIRT, B.STONE).ok).toBe(true);
  });
});

describe('overworld ve kural dışı durumlar', () => {
  it('overworld dünyası için her şey serbest', () => {
    const f = { dim: 'overworld', dimDef: DIMS.overworld, edits: new Map(), yMin: -400, seed: 1 };
    expect(canBreak(f, 0, 63, 0, ASPHALT).ok).toBe(true);
    expect(canPlace(f, 0, 64, 0, B.STONE).ok).toBe(true);
    expect(checkSetBlock(f, 0, 63, 0, ASPHALT, B.STONE).ok).toBe(true);
  });

  it('null/bilinmeyen dünya serbest (atmaz)', () => {
    expect(canBreak(null, 0, 0, 0, 1).ok).toBe(true);
    expect(canPlace(undefined, 0, 0, 0, 1).ok).toBe(true);
    expect(canBreak({ dim: 'yok' }, 0, 0, 0, 1).ok).toBe(true);
  });

  it('neon ama şehir kuralları yok → yalnız bütçe kuralı', () => {
    const f = { dim: 'neon', dimDef: DIMS.neon, yMin: -400, seed: 1, edits: new Map() };
    // üretici modülü yoksa kurallar null; varsa gerçek kurallar işler — her iki durumda atmaz ve nesne döner
    expect(typeof canBreak(f, 1, 1, 1, B.STONE).ok).toBe('boolean');
    expect(typeof canPlace(f, 1, 100, 1, B.STONE).ok).toBe('boolean');
  });

  it('ileti tablosu', () => {
    expect(DENY_MESSAGES.korumali).toBe('Neon Meridyen yapıları korunuyor.');
    expect(DENY_MESSAGES.doldu).toBe('Şehirde yer doldu.');
    expect(denyMessage('korumali')).toBe(DENY_MESSAGES.korumali);
    expect(denyMessage('bilinmeyen')).toBe('');
    expect(Object.isFrozen(DENY_MESSAGES)).toBe(true);
  });
});
