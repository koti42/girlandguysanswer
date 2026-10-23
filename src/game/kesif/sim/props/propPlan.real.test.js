import { describe, expect, it } from 'vitest';
import { cpuMs, scaled } from '../../../../test/perfScale.js';
import {
  chunkOfProp, normalizeSpec, propsForChunk, setPlanSource,
} from './propPlan.js';
import { PROP_BY_T, PROP_DEFS, getPropDef } from './propDefs.js';
import { SIGN_COUNT, SIGN_ENTRIES } from './propSigns.js';
import { getBlockPlan, clearCityPlanCaches } from '../city/cityPlan.js';
import { NEON_BOUNDS, dimSeed } from '../dim/dimensions.js';

/* Gerçek cityplan (getBlockPlan) ile entegrasyon: şehir tohumundan türeyen proplar. */
const SEED = dimSeed(777, 'neon');

function allChunks() {
  const out = [];
  for (let cx = NEON_BOUNDS.minCx; cx <= NEON_BOUNDS.maxCx; cx++) for (let cz = NEON_BOUNDS.minCz; cz <= NEON_BOUNDS.maxCz; cz++) out.push([cx, cz]);
  return out;
}

describe('propsForChunk — gerçek şehir planı', () => {
  setPlanSource(null);

  it('belirlenimci: aynı chunk iki kez ve önbellek temizlendikten sonra aynı çıktı', () => {
    const cells = [[0, 0], [-3, 5], [10, -12], [20, 20], [-30, 8], [3, 40]];
    const a = cells.map(([cx, cz]) => JSON.stringify(propsForChunk(SEED, cx, cz)));
    const b = cells.map(([cx, cz]) => JSON.stringify(propsForChunk(SEED, cx, cz)));
    expect(b).toEqual(a);
    clearCityPlanCaches();
    const c = cells.slice().reverse().map(([cx, cz]) => JSON.stringify(propsForChunk(SEED, cx, cz))).reverse();
    expect(c).toEqual(a);
  });

  it('farklı şehir tohumu farklı proplar', () => {
    const a = JSON.stringify(propsForChunk(SEED, 0, 0));
    const b = JSON.stringify(propsForChunk(dimSeed(778, 'neon'), 0, 0));
    expect(a).not.toBe(b);
  });

  it('tüm şehir (10 000 chunk): id benzersiz, sahip chunk doğru, alanlar geçerli, chunk başına ≤ 120', () => {
    const ids = new Set();
    let total = 0;
    let maxPer = 0;
    const kinds = {};
    const terminals = new Set();
    let signs = 0;
    let t0 = cpuMs();
    const times = [];
    allChunks().forEach(([cx, cz]) => {
      const a = performance.now();
      const list = propsForChunk(SEED, cx, cz);
      times.push(performance.now() - a);
      total += list.length;
      if (list.length > maxPer) maxPer = list.length;
      list.forEach((p) => {
        expect(ids.has(p.id), 'çift id').toBe(false);
        ids.add(p.id);
        const [pcx, pcz] = chunkOfProp(p);
        expect(pcx === cx && pcz === cz).toBe(true);
        const d = PROP_BY_T[p.t];
        expect(d).toBeTruthy();
        kinds[d.key] = (kinds[d.key] || 0) + 1;
        expect(p.yaw >= 0 && p.yaw <= 3).toBe(true);
        expect(p.variant >= 0 && p.variant <= 7).toBe(true);
        expect(p.y).toBeGreaterThanOrEqual(-120); // Faz 2: yeraltı (kasa y−110, laboratuvarlar y−24..−6, kanalizasyon y31, metro y44); sokak tünelleri y=56
        expect(p.y).toBeLessThanOrEqual(330);
        if (d.key === 'boyut_terminali') terminals.add(p.flags & 15);
        if (d.sign) {
          signs++;
          expect(p.flags & 0xffff).toBeLessThan(SIGN_COUNT);
          expect(SIGN_ENTRIES[p.flags & 0xffff].kind).toBe(d.key === 'billboard' ? 'ad' : 'brand');
        }
      });
    });
    t0 = cpuMs() - t0;
    expect(total).toBeGreaterThan(3000);
    expect(maxPer).toBeLessThanOrEqual(120);
    expect(ids.size).toBe(total);
    expect(terminals.size).toBe(16);
    expect(kinds.boyut_terminali).toBe(16);
    expect(kinds.trafik_diregi).toBeGreaterThan(50);
    expect(kinds.bank).toBeGreaterThan(30);
    expect(kinds.agac).toBeGreaterThan(30);
    expect(signs).toBeGreaterThan(100);
    // geçersiz anahtar yok: yalnız tanımlı türler (Faz 2: sokak + iç mekân tanımları)
    Object.keys(kinds).forEach((k) => expect(getPropDef(k)).toBeTruthy());
    times.sort((a, b) => a - b);
    // bütçe: toplam süre (planlar dahil, soğuk) makul; chunk başına p95
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(scaled(25));
    expect(t0).toBeLessThan(scaled(60000));
    console.log('[propPlan.real] props', total, 'maxPerChunk', maxPer, 'kinds', JSON.stringify(kinds), 'ms toplam', Math.round(t0), 'p50', times[times.length >> 1].toFixed(3), 'p95', times[Math.floor(times.length * 0.95)].toFixed(3), 'max', times[times.length - 1].toFixed(2));
  }, 120000);

  it('chunk dilimi birleşimi = blok planındaki tüm spec\'ler (props + streetFurniture), kayıp/çift yok', () => {
    const bi0 = -2;
    const bj0 = 0;
    for (let bj = bj0; bj < bj0 + 2; bj++) {
      for (let bi = bi0; bi < bi0 + 2; bi++) {
        const plan = getBlockPlan(SEED, bi, bj);
        const ref = new Map();
        [].concat(plan.props, plan.streetFurniture).forEach((s) => {
          const p = normalizeSpec(SEED, s);
          if (p) ref.set(p.id, p);
        });
        const got = new Map();
        for (let cx = bi * 5 - 1; cx < bi * 5 + 6; cx++) {
          for (let cz = bj * 5 - 1; cz < bj * 5 + 6; cz++) {
            propsForChunk(SEED, cx, cz).forEach((p) => {
              if (ref.has(p.id)) {
                expect(got.has(p.id)).toBe(false);
                got.set(p.id, p);
              }
            });
          }
        }
        expect(got.size).toBe(ref.size);
        ref.forEach((p, id) => expect(JSON.stringify(got.get(id))).toBe(JSON.stringify(p)));
      }
    }
  });

  it('lamps[] varsayılan alınmaz, opts.lamps=true ile eklenir; plan lambaları bloktur', () => {
    let off = 0;
    let on = 0;
    for (let cx = -6; cx <= 6; cx++) {
      for (let cz = -6; cz <= 6; cz++) {
        off += propsForChunk(SEED, cx, cz).filter((p) => p.t === PROP_DEFS.lamba.t).length;
        on += propsForChunk(SEED, cx, cz, { lamps: true }).filter((p) => p.t === PROP_DEFS.lamba.t).length;
      }
    }
    expect(on).toBeGreaterThan(20);
    expect(off).toBeLessThan(on);
  });

  it('Kapı Meydanı çevresinde (0,0): terminal 0 boyut terminali olarak vardır', () => {
    let found = null;
    for (let cx = -3; cx <= 3 && !found; cx++) {
      for (let cz = -3; cz <= 3 && !found; cz++) {
        found = propsForChunk(SEED, cx, cz).find((p) => p.t === PROP_DEFS.boyut_terminali.t && (p.flags & 15) === 0) || null;
      }
    }
    expect(found).not.toBeNull();
    expect(Math.abs(found.x)).toBeLessThan(40);
    expect(Math.abs(found.z)).toBeLessThan(40);
    expect(found.y).toBe(64);
  });

  it('density 0.5 (düşük kademe) dekor proplarını azaltır, zorunluları (terminal, trafik) korur', () => {
    let full = 0;
    let half = 0;
    let termFull = 0;
    let termHalf = 0;
    for (let cx = -10; cx <= 10; cx++) {
      for (let cz = -10; cz <= 10; cz++) {
        const a = propsForChunk(SEED, cx, cz);
        const b = propsForChunk(SEED, cx, cz, { density: 0.5 });
        full += a.length;
        half += b.length;
        termFull += a.filter((p) => PROP_BY_T[p.t].tags.indexOf('zorunlu') >= 0).length;
        termHalf += b.filter((p) => PROP_BY_T[p.t].tags.indexOf('zorunlu') >= 0).length;
      }
    }
    expect(half).toBeLessThan(full);
    expect(termHalf).toBe(termFull);
  });
});
