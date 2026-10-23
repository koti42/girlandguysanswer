import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { BLOCKS, EMIT_LUT } from '../../blocks.js';
import { MOOD_HUES } from '../ownerData.js';
import { citySeed } from '../cityPlanTestKit.js';
import {
  clearInteriorCache, frameOf, planInterior, setInteriorStrict,
} from './index.js';
import { InteriorBuilder } from './builder.js';
import { buildingOf, reachableFromStreet, validateInterior } from './graph.js';
import {
  LIGHT_TYPES, PALETTES, lightTypeFor, paletteFor,
} from './kit.js';
import { makeFrame } from './frame.js';
import { loft } from './kitPlan.js';
import {
  HEIGHT, chunkWorld, emitSlices, emitWhole, genericImpl, interiorLots, regionOf, registerGenericFakes, unregisterGenericFakes,
} from './testKit.js';
import { registerInterior } from './registry.js';

const SEEDS = [1, 2, 3, 4, 5, 6].map(citySeed);

describe('interior/kit — paletler ve ışık', () => {
  it('11 mood tonu + varsayılan; tüm blok kimlikleri kayıtlı; ton eşleşmesi', () => {
    MOOD_HUES.forEach((h) => expect(Object.prototype.hasOwnProperty.call(PALETTES, h), h).toBe(true));
    expect(PALETTES.default).toBeDefined();
    Object.keys(PALETTES).forEach((k) => {
      const p = PALETTES[k];
      ['floor', 'floor2', 'wall', 'wall2', 'ceil', 'trim', 'glow', 'glow2', 'cloth', 'cloth2', 'glass'].forEach((f) => {
        expect(Number.isInteger(p[f]), k + '.' + f).toBe(true);
        expect(BLOCKS[p[f]], k + '.' + f + '=' + p[f]).toBeDefined();
        expect(p[f]).toBeGreaterThan(0);
        expect(p[f]).toBeLessThan(255);
      });
      expect(['lantern', 'panel', 'holo'].concat(Object.keys(LIGHT_TYPES))).toContain(p.lamp);
      expect(Object.isFrozen(p)).toBe(true);
    });
    expect(paletteFor('olmayan')).toBe(PALETTES.default);
    expect(paletteFor('__proto__')).toBe(PALETTES.default);
    expect(paletteFor(null)).toBe(PALETTES.default);
    expect(paletteFor('mor')).toBe(PALETTES.mor);
  });

  it('LIGHT_TYPES blok yayımı seviyeyle eşleşir; lightTypeFor 8..14 aralığını kapsar ve monoton', () => {
    Object.keys(LIGHT_TYPES).forEach((k) => {
      const t = LIGHT_TYPES[k];
      expect(EMIT_LUT[t.block], k).toBe(t.level);
    });
    let prev = 0;
    for (let l = 8; l <= 14; l++) {
      const type = lightTypeFor(l, 'mavi');
      expect(LIGHT_TYPES[type], 'seviye ' + l).toBeDefined();
      expect(LIGHT_TYPES[type].level).toBeGreaterThanOrEqual(prev);
      prev = LIGHT_TYPES[type].level;
    }
    expect(lightTypeFor(14, 'x')).toBe('panel');
    expect(lightTypeFor(8, 'x')).toBe('holo');
    expect(lightTypeFor(11, 'kehribar')).toBe('neon_amber');
    expect(lightTypeFor(11, 'olmayan')).toBe('neon_cyan');
  });
});

describe('interior/kit — hacim hazırlığı, kapsam, çekirdek engeli (sahte iç mekânlar)', () => {
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

  it('yayım yalnız kendi hacmine (+1 halka, zemin satırından tavana) yazar; kapı duvarı ve dış halka dokunulmaz', () => {
    const SENT = 99;
    let n = 0;
    SEEDS.forEach((seed) => {
      interiorLots(seed, { limit: 25 }).forEach(({ lot, bp }) => {
        const region = regionOf(bp);
        const bw = emitWhole(bp, lot, region, SENT);
        const it = planInterior(bp, lot);
        const fr = frameOf(it);
        const ax0 = fr.x0 - 1;
        const ax1 = fr.x1 + 1;
        const az0 = fr.z0 - 1;
        const az1 = fr.z1 + 1;
        let outsideBad = null;
        let changed = 0;
        for (let y = 0; y < HEIGHT && !outsideBad; y++) {
          for (let z = region.z0; z < region.z1 && !outsideBad; z++) {
            for (let x = region.x0; x < region.x1; x++) {
              const v = bw.get(x, y, z);
              const inside = x >= ax0 && x < ax1 && z >= az0 && z < az1 && y >= fr.floorY && y <= fr.ceilY;
              if (v !== SENT) changed++;
              if (!inside && v !== SENT) { outsideBad = [x, y, z, v]; break; }
            }
          }
        }
        expect(outsideBad, 'lot ' + bp.id + ' ' + bp.interior.kind).toBeNull();
        expect(changed).toBeGreaterThan(200);
        // kapı duvarı satırı (v=-1) tamamen dokunulmamış
        for (let u = 0; u < fr.W; u++) {
          const c = fr.cell(u, -1);
          for (let y = fr.floorY; y <= fr.ceilY; y++) expect(bw.get(c[0], y, c[1])).toBe(SENT);
        }
        n++;
      });
    });
    expect(n).toBe(150);
  });

  it('zemin/tavan satırı dolu; oda hücreleri hava; bölme hücreleri dolu; çekirdek dokunulmaz; uyumsuz kenarlarda halka duvarı', () => {
    const SENT = 99;
    let ringChecked = 0;
    SEEDS.forEach((seed) => {
      interiorLots(seed, { limit: 25 }).forEach(({ lot, bp }) => {
        const bw = emitWhole(bp, lot, regionOf(bp), SENT);
        const it = planInterior(bp, lot);
        const fr = frameOf(it);
        const inRoom = (x, z) => it.rooms.some((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1);
        for (let v = 0; v < fr.D; v++) {
          for (let u = 0; u < fr.W; u++) {
            const [x, z] = fr.cell(u, v);
            if (fr.isObstacle(u, v)) {
              expect(bw.get(x, fr.y0, z)).toBe(SENT);
              continue;
            }
            expect(bw.get(x, fr.floorY, z)).not.toBe(SENT);
            expect(bw.get(x, fr.ceilY, z)).not.toBe(SENT);
            expect(bw.get(x, fr.ceilY, z)).not.toBe(0);
            if (inRoom(x, z)) {
              for (let y = fr.y0; y < fr.ceilY; y++) {
                if (it.lights.some((l) => l.x === x && l.y === y && l.z === z)) continue; // ışık blokları
                expect(bw.get(x, y, z), 'oda hücresi dolu ' + x + ',' + y + ',' + z).toBe(0);
              }
            } else {
              const isDoor = it.doors.some((d) => d.kind !== 'street' && !d.from && Math.abs(d.x - x) <= 1 && Math.abs(d.z - z) <= 1 && (d.axis === 'x' ? d.z === z && Math.abs(d.x - x) <= (d.w - 1) / 2 : d.x === x && Math.abs(d.z - z) <= (d.w - 1) / 2));
              for (let y = fr.floorY; y <= fr.ceilY; y++) {
                if (isDoor && y >= fr.y0 && y < fr.y0 + 3) continue;
                expect(bw.get(x, y, z), 'bölme dolu olmalı').not.toBe(0);
              }
            }
          }
        }
        if (!fr.adj.b) {
          for (let u = 0; u < fr.W; u++) {
            const [x, z] = fr.cell(u, fr.D);
            if (fr.isObstacle(u, fr.D - 1)) continue;
            for (let y = fr.floorY; y <= fr.ceilY; y++) expect(bw.get(x, y, z)).not.toBe(SENT);
          }
          ringChecked++;
        }
        if (!fr.adj.l) {
          for (let v = 0; v < fr.D; v++) {
            const [x, z] = fr.cell(-1, v);
            for (let y = fr.floorY; y <= fr.ceilY; y++) expect(bw.get(x, y, z)).not.toBe(SENT);
          }
          ringChecked++;
        }
      });
    });
    expect(ringChecked).toBeGreaterThan(5);
  });

  it('kule çekirdeği engelli parseller: doğrulanır, sokaktan erişilir, çekirdek hücreleri değişmez', () => {
    const seed = SEEDS[0];
    const towers = interiorLots(seed, { filter: (b) => b.core.length > 0 && makeFrame(b, null, {}).obstacles.length > 0, limit: 12 });
    expect(towers.length).toBeGreaterThan(3);
    unregisterGenericFakes();
    clearInteriorCache();
    const base = chunkWorld(seed);
    const cells = (world, bp) => {
      const out = [];
      bp.core.forEach((c) => { for (let x = c.x0; x < c.x1; x++) for (let z = c.z0; z < c.z1; z++) for (let y = 64; y < 72; y++) out.push(world.getBlock(x, y, z)); });
      return out;
    };
    const before = towers.map(({ bp }) => cells(base, bp));
    registerGenericFakes();
    clearInteriorCache();
    const world = chunkWorld(seed);
    towers.forEach(({ bp, lot }, i) => {
      const it = planInterior(bp, lot);
      expect(it.obstacles.length).toBeGreaterThan(0);
      expect(validateInterior(it).errors).toEqual([]);
      const r = reachableFromStreet(world, it.props, buildingOf(bp, it));
      expect(r.ok, 'kule ' + bp.id + ' ' + r.fraction).toBe(true);
      expect(cells(world, bp)).toEqual(before[i]);
    });
  });

  it('Kit işlemleri (merdiven, tırmanma bloğu, şerit, duvarlar, geçit): kesit birleşimi = bütün; doğrulanır; merdivenle üst kata çıkılır', () => {
    registerInterior('loft', {
      kind: 'loft',
      footprint: () => ({ w: 16, d: 12, h: 5 }),
      plan(lot, rng, variant, ctx) {
        const f = ctx.frame;
        const P = loft(f.W, f.D, f.H, rng, { doorU: f.door.u });
        const b = new InteriorBuilder(ctx);
        P.rooms.forEach((r) => b.room(r.id, [r.u0, r.v0, r.u1, r.v1], { y0: r.y0, y1: r.y1, role: r.role }));
        b.door('d0', 'on', 'arka', P.door);
        b.vertical('m1', 'arka', 'asma', P.spec);
        b.lightGrid('on', 3, 'panel');
        b.lightGrid('asma', 1, 'lantern');
        b.accent(0, 0, f.W, 1, f.H - 1, f.H, LIGHT_TYPES.neon_pink.block);
        const it = b.build();
        it.loft = P;
        return it;
      },
      emit(W, it, ctx) {
        const { kit, frame: f, pal } = ctx;
        const P = it.loft;
        kit.floor(0, 0, f.W, f.D, (u, v) => ((u + v) & 1 ? pal.floor : pal.floor2));
        kit.box(P.floor.rect[0], P.floor.rect[1], P.floor.rect[2], P.floor.rect[3], P.m, P.m + 1, pal.floor2); // asma döşeme
        kit.stair(P.stair);
        kit.window(0, P.D1, 2, P.D1 + 1, 0, 1, pal.glass);
        kit.carve(0, P.D1, 1, P.D1 + 1, 2, 3);
        kit.ladder({ u: f.W - 1, v: 0, y0: 0, y1: 3 });
        kit.strip(0, 0, f.W, 1, f.H - 1, pal.glow);
        kit.wallU(0, 0, 2, 0, 1, pal.trim);
        kit.wallV(f.W - 1, f.D - 3, f.D, 0, 2, (u, v, y) => (y ? pal.wall2 : pal.cloth));
        kit.set(3, 3, 0, pal.cloth);
        kit.setAir(3, 3, 0, pal.glass);
        kit.fill(2, 2, 5, 4, 3, 4, () => undefined);
        kit.ceiling(0, 0, f.W, 1, pal.trim);
        kit.trimBand([0, 0, f.W, f.D], f.H - 1, pal.trim);
      },
    });
    clearInteriorCache();
    const picks = [];
    SEEDS.forEach((seed) => {
      interiorLots(seed, {
        kinds: ['loft'],
        filter: (b) => {
          const fr = makeFrame(b, null, {});
          return fr.H >= 5 && fr.W >= 12 && fr.D >= 10 && fr.obstacles.length === 0;
        },
      }).forEach((q) => picks.push({ seed, ...q }));
    });
    expect(picks.length).toBeGreaterThan(2);
    picks.slice(0, 6).forEach(({ lot, bp }) => {
      const region = regionOf(bp);
      const bw = emitWhole(bp, lot, region);
      const s1 = emitSlices(bp, lot, region, 'forward');
      let diff = 0;
      for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) {
        for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) {
          const arr = s1.get(cx + ',' + cz);
          for (let y = 0; y < HEIGHT; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) if (arr[(y << 8) + (lz << 4) + lx] !== bw.get(cx * 16 + lx, y, cz * 16 + lz)) diff++;
        }
      }
      expect(diff, 'lot ' + bp.id).toBe(0);
    });
    const worlds = {};
    picks.slice(0, 6).forEach(({ seed, lot, bp }) => {
      const it = planInterior(bp, lot);
      expect(validateInterior(it).errors).toEqual([]);
      worlds[seed] = worlds[seed] || chunkWorld(seed);
      const r = reachableFromStreet(worlds[seed], it.props, buildingOf(bp, it));
      expect(r.unreachableRooms, 'lot ' + bp.id + ' ' + JSON.stringify(r.rooms)).toEqual([]);
      expect(r.rooms.find((q) => q.id === 'asma').reached).toBeGreaterThan(10);
      expect(r.ok).toBe(true);
    });
    registerInterior('loft', genericImpl('loft'));
    clearInteriorCache();
  });
});
