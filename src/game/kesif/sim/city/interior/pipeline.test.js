import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { generateCityChunk } from '../cityGen.js';
import { citySeed } from '../cityPlanTestKit.js';
import {
  INTERIOR_ERRORS, clearInteriorCache, frameOf, interiorPropSpecs, interiorRoomAt, planInterior, setInteriorStrict,
} from './index.js';
import { getBlockPlan } from '../cityPlan.js';
import { buildingOf, reachableFromStreet, validateInterior } from './graph.js';
import {
  HEIGHT, chunkWorld, emitSlices, emitWhole, genericImpl, interiorLots, regionOf, registerGenericFakes, unregisterGenericFakes,
} from './testKit.js';
import { INTERIOR_KINDS, registerInterior, unregisterInterior } from './registry.js';
import { digest } from '../cityPlanTestKit.js';

const SEEDS = [1, 2, 3, 4].map(citySeed);

function sameSlices(bw, slices, region) {
  for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) {
    for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) {
      const arr = slices.get(cx + ',' + cz);
      for (let y = 0; y < HEIGHT; y++) {
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            const a = arr[(y << 8) + (lz << 4) + lx];
            const b = bw.get(cx * 16 + lx, y, cz * 16 + lz);
            if (a !== b) return { cx, cz, x: cx * 16 + lx, y, z: cz * 16 + lz, a, b };
          }
        }
      }
    }
  }
  return null;
}

describe('interior pipeline (sahte genel iç mekânlar)', () => {
  beforeAll(() => {
    setInteriorStrict(true);
    registerGenericFakes();
    clearInteriorCache();
  });
  afterAll(() => {
    unregisterGenericFakes();
    setInteriorStrict(false);
    clearInteriorCache();
  });

  it('kesit birleşimi = bütün inşa (200 parsel, 4 tohum, ileri/geri chunk sırası)', () => {
    let n = 0;
    SEEDS.forEach((seed) => {
      interiorLots(seed, { limit: 50 }).forEach(({ lot, bp }) => {
        const region = regionOf(bp);
        const bw = emitWhole(bp, lot, region);
        const s1 = emitSlices(bp, lot, region, 'forward');
        const s2 = emitSlices(bp, lot, region, 'reverse');
        expect(sameSlices(bw, s1, region), 'lot ' + bp.id + ' ' + bp.interior.kind).toBeNull();
        expect(sameSlices(bw, s2, region), 'lot ' + bp.id + ' (ters)').toBeNull();
        // bir şey yazılmış mı
        let nz = 0;
        for (let i = 0; i < bw.blocks.length; i++) if (bw.blocks[i] !== 0) nz++;
        expect(nz).toBeGreaterThan(100);
        n++;
      });
    });
    expect(n).toBe(200);
  });

  it('planInterior belirlenimci ve önbellek temizlense de aynı (JSON özdeş); farklı tohum farklı', () => {
    const [a, b] = SEEDS;
    const dig = (seed) => interiorLots(seed, { limit: 30 }).map(({ lot, bp }) => digest(planInterior(bp, lot)));
    const d1 = dig(a);
    clearInteriorCache();
    const d2 = dig(a);
    expect(d2).toEqual(d1);
    expect(dig(b)).not.toEqual(d1);
    expect(INTERIOR_ERRORS.length).toBe(0);
  });

  it('her sahte Interior doğrulayıcıdan geçer (200 parsel) ve 8+ farklı prop anahtarı kullanır', () => {
    let n = 0;
    SEEDS.forEach((seed) => {
      interiorLots(seed, { limit: 50 }).forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        expect(it, 'plan ' + bp.id).not.toBeNull();
        const v = validateInterior(it);
        expect(v.errors, 'lot ' + bp.id + ' ' + bp.interior.kind).toEqual([]);
        n++;
      });
    });
    expect(n).toBe(200);
  });

  it('gerçek chunk dünyasında (kanca + kabuk) sokaktan her oda ulaşılabilir, hava ≥ %70', () => {
    const rep = [];
    SEEDS.slice(0, 2).forEach((seed) => {
      const world = chunkWorld(seed);
      interiorLots(seed, { limit: 30 }).forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        const r = reachableFromStreet(world, it.props, buildingOf(bp, it));
        if (!r.ok) rep.push(bp.id + ' ' + bp.interior.kind + ' ' + r.streetOk + ' ' + r.fraction.toFixed(2) + ' ' + r.unreachableRooms.join('/'));
      });
    });
    expect(rep).toEqual([]);
  });

  it('kanca sırası: kabuktan SONRA çalışır (kapı bloğu yerinde) ve hacmi temizler', () => {
    const seed = SEEDS[0];
    const { lot, bp } = interiorLots(seed, { limit: 1 })[0];
    const kind = bp.interior.kind;
    const door = bp.doors[0];
    const seen = [];
    const base = genericImpl(kind);
    registerInterior(kind, {
      ...base,
      emit(W, interior, ctx) {
        if (W.touches(door.x, door.z, door.x + 1, door.z + 1)) seen.push(W.get(door.x, 64, door.z));
        // kabuk duvarı (dış halka) yerinde mi
        base.emit(W, interior, ctx);
      },
    });
    clearInteriorCache();
    const cx = Math.floor(door.x / 16);
    const cz = Math.floor(door.z / 16);
    const ch = generateCityChunk(seed, cx, cz, { light: false });
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(239); // kayar kapı çizildikten sonra
    const it = planInterior(bp, lot);
    const fr = frameOf(it);
    // iç hacim hava (zemin satırı hariç), tavan satırı dolu
    const c = fr.cell((fr.W >> 1), (fr.D >> 1));
    if (Math.floor(c[0] / 16) === cx && Math.floor(c[1] / 16) === cz) {
      expect(ch.get(c[0] - cx * 16, fr.y0 + 1, c[1] - cz * 16)).toBe(0);
      expect(ch.get(c[0] - cx * 16, fr.ceilY, c[1] - cz * 16)).not.toBe(0);
    }
    registerInterior(kind, base);
    clearInteriorCache();
  });

  it('kayıtsız tür: hacme dokunmaz; planInterior null', () => {
    const seed = SEEDS[0];
    const { lot, bp } = interiorLots(seed, { limit: 1 })[0];
    unregisterInterior(bp.interior.kind);
    clearInteriorCache();
    const region = regionOf(bp);
    const bw = emitWhole(bp, lot, region);
    for (let i = 0; i < bw.blocks.length; i++) expect(bw.blocks[i]).toBe(0);
    expect(planInterior(bp, lot)).toBeNull();
    registerInterior(bp.interior.kind, genericImpl(bp.interior.kind));
    clearInteriorCache();
  });

  it('plan hatası sıkı kipte fırlatır, gevşekte yutulur ve hacim boş kalır', () => {
    const seed = SEEDS[0];
    const { lot, bp } = interiorLots(seed, { limit: 1 })[0];
    const kind = bp.interior.kind;
    const base = genericImpl(kind);
    registerInterior(kind, { ...base, plan() { throw new Error('bozuk plan'); } });
    clearInteriorCache();
    expect(() => planInterior(bp, lot)).toThrow(/bozuk plan/);
    setInteriorStrict(false);
    clearInteriorCache();
    INTERIOR_ERRORS.length = 0;
    const bw = emitWhole(bp, lot, regionOf(bp));
    for (let i = 0; i < bw.blocks.length; i++) expect(bw.blocks[i]).toBe(0);
    expect(INTERIOR_ERRORS.length).toBeGreaterThan(0);
    // yayım hatası
    registerInterior(kind, { ...base, emit() { throw new Error('bozuk yayım'); } });
    clearInteriorCache();
    INTERIOR_ERRORS.length = 0;
    expect(() => emitWhole(bp, lot, regionOf(bp))).not.toThrow();
    expect(INTERIOR_ERRORS.join('|')).toMatch(/bozuk yayım/);
    setInteriorStrict(true);
    registerInterior(kind, base);
    clearInteriorCache();
    INTERIOR_ERRORS.length = 0;
  });

  it('interiorPropSpecs blok planından lotId+slot≥64 kimlikli, benzersiz proplar verir; interiorRoomAt oda bulur', () => {
    const seed = SEEDS[1];
    const first = interiorLots(seed, { limit: 1 })[0];
    const lot = first.lot;
    const bp = getBlockPlan(seed, lot.bi, lot.bj);
    const specs = interiorPropSpecs(seed, bp);
    expect(specs.length).toBeGreaterThan(10);
    const keys = new Set();
    specs.forEach((p) => {
      expect(p.slot).toBeGreaterThanOrEqual(64);
      keys.add(p.lotId + ':' + p.slot);
    });
    expect(keys.size).toBe(specs.length);
    const it = planInterior(first.bp, lot);
    const r = it.rooms[0];
    const found = interiorRoomAt(seed, r.x0, r.y0, r.z0);
    expect(found).not.toBeNull();
    expect(found.lotId).toBe(lot.id);
    expect(found.kind).toBe(it.kind);
    expect(interiorRoomAt(seed, 0, 64, 0)).toBeNull();
  });

  it('16 tür için sahte kayıt sonrası da emit tüm chunk dilimlerinde hatasız (gerçek chunk üretimi)', () => {
    const seed = SEEDS[2];
    const list = interiorLots(seed, { limit: 40 });
    const kinds = new Set(list.map((q) => q.bp.interior.kind));
    expect(kinds.size).toBeGreaterThan(4);
    list.slice(0, 6).forEach(({ bp }) => {
      const it = bp.interior;
      const ch = generateCityChunk(seed, Math.floor((it.x0 + 1) / 16), Math.floor((it.z0 + 1) / 16), { light: false });
      expect(ch.generated).toBe(true);
    });
    expect(INTERIOR_ERRORS).toEqual([]);
    expect(INTERIOR_KINDS.length).toBe(16);
  });
});
