import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PLAN_BLOCK, PLAN_CHUNK, chunkOfProp, normalizeSpec, propIdFor, propsForChunk, setPlanSource,
} from './propPlan.js';
import { PROP_DEFS, getPropDef } from './propDefs.js';
import { SIGN_COUNT, SIGN_ENTRIES, signIndexOf } from './propSigns.js';
import { fakeBlockPlan } from './propTestKit.js';
import { NEON_BOUNDS } from '../dim/dimensions.js';
import { hash32 } from '../rng.js';

const SEED = 0x1234abcd;

beforeEach(() => setPlanSource(fakeBlockPlan));
afterEach(() => setPlanSource(null));

function sig(list) {
  return JSON.stringify(list);
}

describe('propsForChunk — belirlenimcilik', () => {
  it('200 chunk × 3 çalıştırma aynı çıktı', () => {
    for (let k = 0; k < 200; k++) {
      const cx = ((hash32(k) % 100) - 50) | 0;
      const cz = ((hash32(k + 999) % 100) - 50) | 0;
      const a = sig(propsForChunk(SEED, cx, cz));
      expect(sig(propsForChunk(SEED, cx, cz))).toBe(a);
      expect(sig(propsForChunk(SEED, cx, cz))).toBe(a);
    }
  });

  it('sıra bağımsızlığı: bir bölgeyi ileri/geri/karışık gezince aynı sonuçlar', () => {
    const cells = [];
    for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) cells.push([cx, cz]);
    const base = new Map();
    cells.forEach(([cx, cz]) => base.set(cx + ',' + cz, sig(propsForChunk(SEED, cx, cz))));
    const rev = cells.slice().reverse();
    const shuf = cells.slice().sort((a, b) => hash32(a[0] * 77 + a[1]) - hash32(b[0] * 77 + b[1]));
    [rev, shuf].forEach((order) => {
      order.forEach(([cx, cz]) => expect(sig(propsForChunk(SEED, cx, cz))).toBe(base.get(cx + ',' + cz)));
    });
  });

  it('farklı tohum farklı yerleşim ve kimlik üretir', () => {
    const a = propsForChunk(1, 0, 0);
    const b = propsForChunk(2, 0, 0);
    expect(a.length).toBeGreaterThan(0);
    expect(sig(a)).not.toBe(sig(b));
  });

  it('çıktı id sırasında; her prop sahip chunk\'ında; alanlar nicemli ve sınırlı', () => {
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const list = propsForChunk(SEED, cx, cz);
        for (let i = 1; i < list.length; i++) expect(list[i].id).toBeGreaterThan(list[i - 1].id);
        list.forEach((p) => {
          expect(chunkOfProp(p)).toEqual([cx, cz]);
          expect(Number.isInteger(p.id) && p.id >= 0 && p.id <= 0xffffffff).toBe(true);
          expect(getPropDef(p.t)).not.toBeNull();
          [p.x, p.y, p.z].forEach((v) => expect(Math.abs(v * 16 - Math.round(v * 16))).toBeLessThan(1e-9));
          expect(p.yaw >= 0 && p.yaw <= 3).toBe(true);
          expect(p.variant >= 0 && p.variant <= 7).toBe(true);
          expect(Number.isInteger(p.flags) && p.flags >= 0).toBe(true);
        });
      }
    }
  });
});

describe('propsForChunk — chunk dilimi birleşimi', () => {
  it('bölgedeki tüm chunk\'ların birleşimi = bölgedeki tüm benzersiz spec\'ler (kayıp/çift yok)', () => {
    const cx0 = -7;
    const cx1 = 8;
    const cz0 = -3;
    const cz1 = 12;
    const union = [];
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) union.push(...propsForChunk(SEED, cx, cz));
    // referans: kapsayan blok planlarının tüm spec'leri
    const ref = new Map();
    const bi0 = Math.floor((cx0 * 16 - 4) / 80);
    const bi1 = Math.floor((cx1 * 16 + 20) / 80);
    const bj0 = Math.floor((cz0 * 16 - 4) / 80);
    const bj1 = Math.floor((cz1 * 16 + 20) / 80);
    for (let bi = bi0; bi <= bi1; bi++) {
      for (let bj = bj0; bj <= bj1; bj++) {
        const plan = fakeBlockPlan(SEED, bi, bj);
        [].concat(plan.props, plan.streetFurniture).forEach((s) => {
          const p = normalizeSpec(SEED, s);
          if (!p) return;
          if (p.x >= cx0 * 16 && p.x < (cx1 + 1) * 16 && p.z >= cz0 * 16 && p.z < (cz1 + 1) * 16) ref.set(p.id, p);
        });
      }
    }
    const got = new Map();
    union.forEach((p) => {
      expect(got.has(p.id), 'çift id ' + p.id).toBe(false);
      got.set(p.id, p);
    });
    expect(got.size).toBe(ref.size);
    ref.forEach((p, id) => expect(JSON.stringify(got.get(id))).toBe(JSON.stringify(p)));
  });

  it('komşu blokta da listelenen prop tek chunk\'ta, tek kez bulunur', () => {
    // sharedLamp(bi,bj): x = bi*80 + 0.5 → blok sınırı; iki planda da listelenir
    const bi = 2;
    const bj = 1;
    const lampX = bi * 80 + 0.5;
    const cx = Math.floor(lampX / 16);
    const cz = Math.floor((bj * 80 + 40.25) / 16);
    const found = propsForChunk(SEED, cx, cz).filter((p) => p.x === Math.round(lampX * 16) / 16 && p.z === 40.25 + bj * 80);
    expect(found.length).toBe(1);
    expect(propsForChunk(SEED, cx - 1, cz).some((p) => p.id === found[0].id)).toBe(false);
  });

  it('tüm şehir (100×100 chunk): id\'ler benzersiz, her prop tam bir chunk\'ta', () => {
    const ids = new Set();
    let total = 0;
    for (let cx = NEON_BOUNDS.minCx; cx <= NEON_BOUNDS.maxCx; cx++) {
      for (let cz = NEON_BOUNDS.minCz; cz <= NEON_BOUNDS.maxCz; cz++) {
        const list = propsForChunk(SEED, cx, cz);
        total += list.length;
        for (let i = 0; i < list.length; i++) ids.add(list[i].id);
      }
    }
    expect(total).toBeGreaterThan(20000);
    expect(ids.size).toBe(total);
  }, 60000);
});

describe('propIdFor — çakışmasız kimlik', () => {
  it('lotId<2^20 ve slot<4096 için 400k çift benzersiz id verir (bijektif)', () => {
    const seen = new Set();
    let n = 0;
    for (let lot = 0; lot < 1000; lot++) {
      for (let slot = 0; slot < 400; slot++) {
        seen.add(propIdFor(SEED, lot * 1048 % 1048576, slot));
        n++;
      }
    }
    expect(seen.size).toBe(n);
  });

  it('tohuma bağlıdır ve u32 döner', () => {
    expect(propIdFor(1, 5, 5)).not.toBe(propIdFor(2, 5, 5));
    expect(propIdFor(1, 5, 5)).toBe(propIdFor(1, 5, 5));
    expect(propIdFor(1, -7, 3) >>> 0).toBe(propIdFor(1, -7, 3));
  });
});

describe('normalizeSpec', () => {
  const base = {
    kind: 'bank', x: 10.03, y: 64, z: -5.49, rot: 5, variant: 13, lotId: 3, slot: 4,
  };

  it('nicemler, yaw/variant sınırlar, anahtar takma adlarını çözer', () => {
    const p = normalizeSpec(SEED, base);
    expect(p.t).toBe(PROP_DEFS.bank.t);
    expect(p.x).toBe(Math.round(10.03 * 16) / 16);
    expect(p.z).toBe(Math.round(-5.49 * 16) / 16);
    expect(p.yaw).toBe(1);
    expect(p.variant).toBe(5);
    expect(normalizeSpec(SEED, Object.assign({}, base, { kind: undefined, key: 'çöp' })).t).toBe(PROP_DEFS.cop_kutusu.t);
    expect(normalizeSpec(SEED, Object.assign({}, base, { kind: 'trafik_ışığı' })).t).toBe(PROP_DEFS.trafik_diregi.t);
    expect(normalizeSpec(SEED, Object.assign({}, base, { rot: undefined, yaw: 2 })).yaw).toBe(2);
  });

  it('geçersiz spec null: bilinmeyen anahtar, NaN/Infinity, nesne değil', () => {
    expect(normalizeSpec(SEED, Object.assign({}, base, { kind: 'yok' }))).toBeNull();
    expect(normalizeSpec(SEED, Object.assign({}, base, { x: NaN }))).toBeNull();
    expect(normalizeSpec(SEED, Object.assign({}, base, { z: Infinity }))).toBeNull();
    expect(normalizeSpec(SEED, null)).toBeNull();
    expect(normalizeSpec(SEED, 5)).toBeNull();
    expect(normalizeSpec(SEED, Object.assign({}, base, { kind: '__proto__' }))).toBeNull();
  });

  it('tabela/billboard: sign indeksi seçilir (açık, dükkân kimliği, reklam kimliği, bölge hash)', () => {
    const t1 = normalizeSpec(SEED, Object.assign({}, base, { kind: 'tabela' }));
    expect(t1.flags).toBeGreaterThanOrEqual(0);
    expect(t1.flags).toBeLessThan(SIGN_COUNT);
    expect(SIGN_ENTRIES[t1.flags].kind).toBe('brand');
    const b1 = normalizeSpec(SEED, Object.assign({}, base, { kind: 'billboard' }));
    expect(SIGN_ENTRIES[b1.flags].kind).toBe('ad');
    const ex = normalizeSpec(SEED, Object.assign({}, base, { kind: 'tabela', brand: 'bulut_ramen' }));
    expect(ex.flags).toBe(signIndexOf('brand', 'bulut_ramen'));
    expect(normalizeSpec(SEED, Object.assign({}, base, { kind: 'tabela', sign: 7 })).flags).toBe(7);
    expect(normalizeSpec(SEED, Object.assign({}, base, { kind: 'tabela', data: 3 })).flags).toBe(3);
    // geçersiz açık indeks → hash seçimine düşer, yine geçerli
    const bad = normalizeSpec(SEED, Object.assign({}, base, { kind: 'tabela', sign: 99999 }));
    expect(bad.flags).toBeLessThan(SIGN_COUNT);
    // aynı girdi aynı seçim
    expect(normalizeSpec(SEED, Object.assign({}, base, { kind: 'tabela' })).flags).toBe(t1.flags);
  });

  it('terminal: terminal numarası flags düşük 4 bitinde', () => {
    const p = normalizeSpec(SEED, Object.assign({}, base, { kind: 'terminal', terminal: 11 }));
    expect(p.flags & 15).toBe(11);
    expect(normalizeSpec(SEED, Object.assign({}, base, { kind: 'boyut_terminali', terminal: 0 })).flags).toBe(0);
  });
});

describe('propsForChunk — seyreltme, sınırlar, kaynak', () => {
  function region(density) {
    const out = [];
    for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) out.push(...propsForChunk(SEED, cx, cz, { density }));
    return out;
  }

  it('density=0: dekor kalmaz, zorunlu (lamba, trafik, terminal) kalır; 0.5 yaklaşık yarısı; altküme', () => {
    const full = region(1);
    const half = region(0.5);
    const none = region(0);
    const dekor = (list) => list.filter((p) => getPropDef(p.t).tags.indexOf('dekor') >= 0);
    const must = (list) => list.filter((p) => getPropDef(p.t).tags.indexOf('zorunlu') >= 0);
    expect(dekor(none).length).toBe(0);
    expect(must(none).length).toBe(must(full).length);
    expect(must(half).length).toBe(must(full).length);
    const ratio = dekor(half).length / dekor(full).length;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
    const set = new Set(full.map((p) => p.id));
    half.forEach((p) => expect(set.has(p.id)).toBe(true));
    const set3 = new Set(region(0.3).map((p) => p.id));
    const set6 = new Set(region(0.6).map((p) => p.id));
    set3.forEach((id) => expect(set6.has(id)).toBe(true));
  });

  it('lamps[] varsayılan alınmaz (blok olarak yazılır); opts.lamps=true ile lamba propu olarak gelir', () => {
    let off = 0;
    let on = 0;
    for (let cx = 0; cx < 6; cx++) {
      for (let cz = 0; cz < 6; cz++) {
        off += propsForChunk(SEED, cx, cz).filter((p) => p.t === PROP_DEFS.lamba.t).length;
        on += propsForChunk(SEED, cx, cz, { lamps: true }).filter((p) => p.t === PROP_DEFS.lamba.t).length;
      }
    }
    expect(on).toBeGreaterThan(off);
    const a = propsForChunk(SEED, 0, 0, { lamps: true });
    const b = propsForChunk(SEED, 0, 0, { lamps: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('şehir sınırı dışındaki chunk boş; kaynak yoksa boş', () => {
    expect(propsForChunk(SEED, NEON_BOUNDS.maxCx + 1, 0)).toEqual([]);
    expect(propsForChunk(SEED, 0, NEON_BOUNDS.minCz - 1)).toEqual([]);
    expect(propsForChunk(SEED, 1e9, 0)).toEqual([]);
    setPlanSource(() => null);
    expect(propsForChunk(SEED, 0, 0)).toEqual([]);

    setPlanSource(() => ({ props: null, streetFurniture: undefined, lamps: 5 }));
    expect(propsForChunk(SEED, 0, 0)).toEqual([]);
  });

  it('kaynak bozuk girdileri atlar (null/NaN/bilinmeyen anahtar), kalanı verir', () => {
    setPlanSource(() => ({
      props: [null, { kind: 'bank', x: 3, y: 64, z: 3, lotId: 1, slot: 1 }, { kind: 'yok', x: 3, y: 64, z: 3, lotId: 1, slot: 2 }, { kind: 'bank', x: NaN, y: 64, z: 3, lotId: 1, slot: 3 }],
      streetFurniture: [],
      lamps: [{ x: 4, y: 64, z: 4, lotId: 1, slot: 4 }],
    }));
    const list = propsForChunk(SEED, 0, 0, { lamps: true });
    expect(list.length).toBe(2);
    expect(propsForChunk(SEED, 0, 0).length).toBe(1); // lamps[] varsayılan alınmaz
    expect(list.map((p) => p.t).sort()).toEqual([PROP_DEFS.lamba.t, PROP_DEFS.bank.t].sort());
  });

  it('nicemleme sınırı: x=15.99 chunk 0\'a, 16.0 chunk 1\'e düşer; kaybolmaz', () => {
    setPlanSource((s, bi, bj) => (bi === 0 && bj === 0
      ? { props: [{ kind: 'bank', x: 15.99, y: 64, z: 8, lotId: 1, slot: 1 }, { kind: 'bank', x: 16.0, y: 64, z: 8, lotId: 1, slot: 2 }, { kind: 'bank', x: 15.98, y: 64, z: 8, lotId: 1, slot: 3 }] }
      : { props: [] }));
    const a = propsForChunk(SEED, 0, 0);
    const b = propsForChunk(SEED, 1, 0);
    expect(a.length + b.length).toBe(3);
    a.forEach((p) => expect(p.x).toBeLessThan(16));
    b.forEach((p) => expect(p.x).toBeGreaterThanOrEqual(16));
  });

  it('sabitler', () => {
    expect(PLAN_CHUNK).toBe(16);
    expect(PLAN_BLOCK).toBe(80);
  });
});
