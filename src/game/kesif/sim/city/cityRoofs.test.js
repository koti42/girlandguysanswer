/*
 * Çatı içeriği: rota yapısı (8 rota × 20 tohum), fizik kanıtları (yürüyerek sıçrama, kanca, süzülme kulesi), süs yerleşimi, köprü bütünlüğü,
 * parça birleşimi = bütün, propPlan çatı propları.
 */
import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { ARCHETYPES } from './archetypes.js';
import { emitBuilding } from './cityBuildings.js';
import { generateCityChunk } from './cityGen.js';
import { allLots } from './cityLots.js';
import { clearCityPlanCaches, getCityPlan, planBuilding } from './cityPlan.js';
import { citySeed, digest } from './cityPlanTestKit.js';
import {
  emitRoofContent, emitRoofWindow, roofAccessOf, roofDecor, roofDiscovery, roofGardenFor, roofPropSpecs,
} from './cityRoofs.js';
import { ledgeLen, reachHop, roofRouteContent } from './cityRoofRoutes.js';
import { skybridgesOf } from './cityRoofBridges.js';
import { proveGlide, proveGrapple, proveHop } from './cityRoofProof.js';
import {
  BigWriter, Nav3, chunkReader, sliceUnion,
} from './cityContentTestKit.js';
import { JUMP, maxJumpReach } from '../parkour.js';
import { getCatalogDef } from '../props/propCatalog.js';
import { getPropDef } from '../props/propDefs.js';
import { propIdFor } from '../props/propPlan.js';

const SEEDS20 = [];
for (let i = 0; i < 20; i++) SEEDS20.push(citySeed(i));

function plat(R, i) {
  const p = R.pads[i];
  const bp = R.bps[p.lot];
  return {
    x0: bp.x0, z0: bp.z0, x1: bp.x0 + bp.w, z1: bp.z0 + bp.d, y: p.y, cx: Math.floor(p.x), cz: Math.floor(p.z), lot: p.lot,
  };
}

describe('çatı parkuru verisi: 8 rota × 20 tohum', () => {
  it('her rota: 6–10 kontrol, çapraz sıçrama yok, çıkıntı kuralı etkin boşluğu ≤2 (fark≤0) / ≤1 (fark +1) yapar, bitiş/kule/şeritler parsel içinde', () => {
    SEEDS20.forEach((seed, si) => {
      const plan = getCityPlan(seed);
      const routes = roofRouteContent(plan);
      expect(routes.length).toBe(8);
      routes.forEach((R) => {
        expect(R.pads.length).toBeGreaterThanOrEqual(6);
        expect(R.pads.length).toBeLessThanOrEqual(10);
        expect(R.start.top, 'merdiven tepesi tohum ' + si + ' rota ' + R.id).toBeTruthy();
        R.hops.forEach((h) => {
          expect(h.diag, 'çapraz sıçrama').toBe(false);
          expect(h.dy).toBeLessThanOrEqual(1);
          const eff = h.gap - (h.ledge ? h.ledge.e : 0);
          expect(reachHop(eff, h.dy, 'walk'), 'seed ' + si + ' rota ' + R.id + ' hop ' + h.a + ' gap ' + h.gap + ' dy ' + h.dy).toBe(true);
          expect(h.ledge ? h.ledge.e : 0).toBe(ledgeLen(h.gap, h.dy));
          if (h.ledge) {
            expect(h.ledge.cells.length).toBeGreaterThanOrEqual(h.ledge.e);
            expect(h.ledge.cells.length).toBeLessThanOrEqual(h.ledge.e * 3);
          }
        });
        const bpl = R.bps[R.finish.lot];
        const inside = (x, z, m) => x >= bpl.x0 + m && x < bpl.x0 + bpl.w - m && z >= bpl.z0 + m && z < bpl.z0 + bpl.d - m;
        expect(inside(R.finish.chest.x, R.finish.chest.z, 2)).toBe(true);
        expect(inside(R.finish.beacon.x, R.finish.beacon.z, 1)).toBe(true);
        expect(inside(R.finish.pylon.x - 1, R.finish.pylon.z - 1, 1) && inside(R.finish.pylon.x + 1, R.finish.pylon.z + 1, 1)).toBe(true);
        // kule güvertesi sandık/ışık sütunu/şerit ile çakışmaz
        const px = R.finish.pylon.x;
        const pz = R.finish.pylon.z;
        const c = R.finish.chest;
        expect(Math.abs(px - c.x) > 4 || Math.abs(pz - c.z) > 4).toBe(true);
        (R.lanes.get(R.finish.lot) || []).forEach((l) => {
          expect(px - 1 < l.x1 && px + 2 > l.x0 && pz - 1 < l.z1 && pz + 2 > l.z0, 'kule şeritte').toBe(false);
        });
        R.alt.grapple.forEach((g) => {
          expect(g.anchor.y).toBe(R.pads[g.to].y + 4);
          const B2 = plat(R, g.to);
          expect(g.anchor.x >= B2.x0 && g.anchor.x < B2.x1 && g.anchor.z >= B2.z0 && g.anchor.z < B2.z1).toBe(true);
        });
      });
    });
  });

  it('analitik sıçrama modeli parkur fiziğiyle uyumlu: yürüme/koşu boşlukları maxJumpReach(+0,6 kenar payı) içinde, ≥1 hücre güvenlik payıyla', () => {
    [-1, 0, 1].forEach((dy) => {
      for (let g = 0; g <= 5; g++) {
        const walkOk = reachHop(g, dy, 'walk');
        const runOk = reachHop(g, dy, 'run');
        const walkMax = maxJumpReach(dy, JUMP.walk) + 0.58;
        const runMax = maxJumpReach(dy, JUMP.sprint) + 0.58;
        if (walkOk) expect(g, 'yürüme dy ' + dy).toBeLessThanOrEqual(walkMax - 0.4);
        if (runOk) expect(g, 'koşu dy ' + dy).toBeLessThanOrEqual(runMax - 0.4);
        if (walkOk) expect(runOk).toBe(true);
      }
    });
    expect(ledgeLen(3, 0)).toBe(1);
    expect(ledgeLen(3, 1)).toBe(2);
    expect(ledgeLen(2, 0)).toBe(0);
    expect(ledgeLen(2, 1)).toBe(1);
  });

  it('belirlenimci: iki kez (önbellek temizlenerek) aynı rota özeti', () => {
    const sum = (seed) => digest(roofRouteContent(getCityPlan(seed)).map((R) => [R.id, R.hops.map((h) => [h.gap, h.dy, h.ledge && h.ledge.cells]), R.finish, R.alt.grapple]));
    SEEDS20.slice(0, 4).forEach((seed) => {
      const a = sum(seed);
      clearCityPlanCaches();
      expect(sum(seed)).toBe(a);
    });
  });
});

describe('çatı parkuru gerçek fizikte: yürüyerek sıçrama zinciri, kanca kısayolu, süzülme kulesi (8 rota × 20 tohum)', () => {
  it('sokaktan merdivenle çatıya, her sıçrama yürüyerek, bitişte sandığa ve kuleye yürünerek; kanca + süzülme kanıtı', () => {
    const fails = [];
    let hopsN = 0;
    let grapN = 0;
    let glideN = 0;
    let markN = 0;
    SEEDS20.forEach((seed, si) => {
      const plan = getCityPlan(seed);
      const world = chunkReader(seed);
      const nav = new Nav3(world.getBlock);
      roofRouteContent(plan).forEach((R) => {
        const tag = 'seed' + si + ' rota' + R.id;
        // 1) sokak → merdiven → ilk çatı (BFS)
        const bp0 = R.bps[R.pads[0].lot];
        const box = { x0: bp0.x0 - 14, x1: bp0.x0 + bp0.w + 14, z0: bp0.z0 - 14, z1: bp0.z0 + bp0.d + 14, y0: 60, y1: 110 };
        // başlangıç: kapı önü hücresi (yakınındaki ayakta durulabilir sokak hücreleri; merdiven sütunu hücreyi kaplayabilir)
        const sx0 = Math.floor(R.start.x);
        const sz0 = Math.floor(R.start.z);
        const starts = [];
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) starts.push([sx0 + dx, 64, sz0 + dz]);
        const r0 = nav.bfs(starts, { box, maxNodes: 300000 });
        const p0 = R.pads[0];
        if (!nav.has(r0, Math.floor(p0.x), p0.y, Math.floor(p0.z))) fails.push(tag + ' merdivenle ilk çatıya çıkılamıyor');
        // 1b) başlangıç işareti: merdivenin sokak tarafında neon zemin (en az bir hücre)
        const st0 = bp0.extStair;
        const fv = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[st0.face];
        let lime = 0;
        for (let k = -1; k <= 1; k++) {
          const mx = st0.flights[0].x + fv[0] * 2 + (fv[0] !== 0 ? 0 : k);
          const mz = st0.flights[0].z + fv[1] * 2 + (fv[0] !== 0 ? k : 0);
          const id = world.getBlock(mx, 63, mz);
          if (id === 229 || id === 232) lime++;
        }
        markN += lime > 0 ? 1 : 0;
        // 2) sıçramalar
        R.hops.forEach((h) => {
          const A = plat(R, h.a);
          const B2 = plat(R, h.b);
          hopsN++;
          if (h.same) {
            const bx = { x0: A.x0 - 1, x1: A.x1 + 1, z0: A.z0 - 1, z1: A.z1 + 1, y0: A.y - 1, y1: A.y + 4 };
            const r = nav.bfs([[A.cx, A.y, A.cz]], { box: bx, maxNodes: 50000 });
            if (!nav.has(r, B2.cx, B2.y, B2.cz)) fails.push(tag + ' aynı çatıda kontrol ' + h.a + '→' + h.b + ' yürünemiyor');
            return;
          }
          const ok = proveHop(world, A, B2, {
            sprint: false, axis: h.axis, sgn: h.sgn, lat: h.lat,
          });
          if (!ok.ok) fails.push(tag + ' hop ' + h.a + '→' + h.b + ' gap ' + h.gap + ' dy ' + h.dy + ' yürüyerek geçilemiyor');
        });
        // 3) bitiş: sandığa komşu hücre, kule merdiveni tabanı ve güverte
        const last = plat(R, R.pads.length - 1);
        const f = R.finish;
        const bpl = R.bps[f.lot];
        const fb = { x0: bpl.x0 - 1, x1: bpl.x0 + bpl.w + 1, z0: bpl.z0 - 1, z1: bpl.z0 + bpl.d + 1, y0: last.y - 1, y1: last.y + 12 };
        const rf = nav.bfs([[last.cx, last.y, last.cz]], { box: fb, maxNodes: 80000 });
        let adj = false;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => { if (nav.has(rf, f.chest.x + d[0], last.y, f.chest.z + d[1])) adj = true; });
        if (!adj) fails.push(tag + ' sandığa yürünemiyor');
        if (world.getBlock(f.chest.x, last.y, f.chest.z) !== B.REWARD_CHEST) fails.push(tag + ' sandık bloğu yok');
        const deckTop = [f.pylon.x, last.y + 8, f.pylon.z];
        if (!nav.has(rf, f.pylon.x - 1, last.y, f.pylon.z)) fails.push(tag + ' kule merdiveni tabanına varılamıyor');
        if (!nav.has(rf, deckTop[0], deckTop[1], deckTop[2])) fails.push(tag + ' süzülme güvertesine tırmanılamıyor');
        // 4) kanca kısayolu
        R.alt.grapple.forEach((g) => {
          grapN++;
          if (world.getBlock(g.anchor.x, g.anchor.y, g.anchor.z) !== B.AMETHYST) fails.push(tag + ' kanca kristali yok');
          if (!proveGrapple(world, plat(R, g.from), plat(R, g.to), g.anchor).ok) fails.push(tag + ' kanca kısayolu çalışmıyor');
        });
        // 5) süzülme: güverteden zıpla, planörle hasarsız in
        glideN++;
        const gl = proveGlide(world, { x: f.pylon.x + 0.5, y: last.y + 8, z: f.pylon.z + 0.5 }, { target: { x: R.start.x, z: R.start.z } });
        if (!gl.ok) fails.push(tag + ' süzülme hasarsız inmiyor ' + JSON.stringify(gl));
      });
    });
    expect(hopsN).toBeGreaterThan(1000);
    expect(grapN).toBe(160);
    expect(glideN).toBe(160);
    expect(markN, 'başlangıç işareti olan rota').toBeGreaterThan(110);
    expect(fails).toEqual([]);
  }, 900000);
});

describe('çatı süsleri: yerleşim kuralları ve bütünlük', () => {
  it('süs blokları çatı dikdörtgeninde, rota şeritlerine/kontrol karolarına/çıpalara girmez; kule kulübeleri çekirdek üzerinde; prop kimlikleri benzersiz ve tanımlı', () => {
    [citySeed(1), citySeed(6)].forEach((seed) => {
      const plan = getCityPlan(seed);
      const lots = allLots(plan);
      const ids = new Set();
      let nOps = 0;
      let nProps = 0;
      lots.forEach((lot) => {
        const A0 = ARCHETYPES[lot.archetype];
        if (!A0.building || lot.hill || A0.special) return;
        const bp = planBuilding(seed, lot);
        const D = roofDecor(plan, lot, bp);
        const route = roofRouteContent(plan).find((R) => R.lots.indexOf(lot.id) >= 0);
        D.ops.forEach((o) => {
          nOps++;
          // çekirdek kulübesi dışında hepsi üst çatı dikdörtgeni içinde
          expect(o[0] >= D.rect.x0 - 2 && o[3] <= D.rect.x1 + 2 && o[2] >= D.rect.z0 - 2 && o[5] <= D.rect.z1 + 2, 'süs çatı dışında lot ' + lot.id).toBe(true);
          expect(o[1]).toBeGreaterThanOrEqual(D.y);
          if (route) {
            (route.lanes.get(lot.id) || []).forEach((l) => {
              // kulübe/yalnız çekirdek çevresi rota çatılarında yok (rota çatıları alçak)
              expect(o[0] < l.x1 && o[3] > l.x0 && o[2] < l.z1 && o[5] > l.z0, 'şeride süs lot ' + lot.id).toBe(false);
            });
            route.pads.forEach((p) => {
              if (p.lot !== lot.id) return;
              const cx = Math.floor(p.x);
              const cz = Math.floor(p.z);
              expect(o[0] < cx + 2 && o[3] > cx - 1 && o[2] < cz + 2 && o[5] > cz - 1, 'kontrol karosuna süs').toBe(false);
            });
          }
        });
        D.props.forEach((s) => {
          nProps++;
          expect(getCatalogDef(s.kind) || getPropDef(s.kind), s.kind).toBeTruthy();
          const id = propIdFor(seed, s.lotId, s.slot);
          expect(ids.has(id)).toBe(false);
          ids.add(id);
          expect(s.lotId).toBeGreaterThanOrEqual(600000);
          expect(s.x >= D.rect.x0 && s.x < D.rect.x1 && s.z >= D.rect.z0 && s.z < D.rect.z1).toBe(true);
        });
        // çekirdek durak çapaları
        roofAccessOf(bp).forEach((a) => expect(a.y).toBe(bp.roof.y));
        const g = roofGardenFor(bp);
        if (bp.roof.kind === 'bahce') expect(g).toBeTruthy();
        else expect(g).toBe(null);
      });
      expect(nOps).toBeGreaterThan(3000);
      expect(nProps).toBeGreaterThan(30);
    });
  });

  it('propPlan: çatı propları sahip chunk\'ta; aynı chunk iki kez aynı çıktı', () => {
    const seed = citySeed(1);
    const plan = getCityPlan(seed);
    const lot = allLots(plan).find((l) => ARCHETYPES[l.archetype].roof === 'bahce' && l.built && !l.hill && !l.roof);
    const bp = planBuilding(seed, lot);
    const rect = { x0: bp.x0 - 2, z0: bp.z0 - 2, x1: bp.x0 + bp.w + 2, z1: bp.z0 + bp.d + 2 };
    const a = roofPropSpecs(seed, rect);
    const b = roofPropSpecs(seed, rect);
    expect(a.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('çatı üretimi: kule köprüleri ve parça birleşimi', () => {
  it('gökyüzü köprüleri: 10 tohumda ≥ 30 köprü; her güverte hücresi üretilen chunk\'larda yerinde (blok bütünlüğü), uç korkuluk açıklığı hava', () => {
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      const world = chunkReader(seed);
      const seen = new Set();
      allLots(plan).forEach((lot) => {
        if (!ARCHETYPES[lot.archetype].tower) return;
        skybridgesOf(plan, lot).forEach((br) => {
          if (seen.has(br.key)) return;
          seen.add(br.key);
          total++;
          br.cells.forEach((c) => {
            const id = world.getBlock(c.x, c.y, c.z);
            expect([B.PLANKS_OAK, B.POLISHED], 'köprü hücresi ' + [c.x, c.y, c.z] + ' kimlik ' + id).toContain(id);
            expect(world.getBlock(c.x, c.y + 3, c.z)).toBe(0);
          });
          br.ends.forEach((e) => {
            expect(world.getBlock(e.x, e.y, e.z)).toBe(0);
            expect(world.getBlock(e.x, e.y + 1, e.z)).toBe(0);
          });
        });
      });
    }
    expect(total).toBeGreaterThanOrEqual(30);
  }, 300000);

  it('parça birleşimi = bütün: kabuk + çatı içeriği (rota çatısı, kule, bahçe) chunk dilimleri ↔ rastgele hizalı büyük yazıcı', () => {
    const seed = citySeed(2);
    const plan = getCityPlan(seed);
    const R = roofRouteContent(plan)[1];
    const lots = [R.pads[0].lot, R.finish.lot, allLots(plan).find((l) => ARCHETYPES[l.archetype].tower).id, allLots(plan).find((l) => ARCHETYPES[l.archetype].roof === 'bahce' && l.built && !l.hill && !l.roof).id];
    lots.forEach((id) => {
      const lot = allLots(plan).find((l) => l.id === id);
      const bp = planBuilding(seed, lot);
      const y1 = Math.min(bp.roof.y + 24, 340);
      const reg = {
        x0: bp.x0 - 13, x1: bp.x0 + bp.w + 15, z0: bp.z0 - 11, z1: bp.z0 + bp.d + 14, y0: Math.max(60, bp.roof.y - 8), y1,
      };
      const fn = (w) => {
        emitBuilding(w, lot, bp, null);
        emitRoofContent(w, plan, lot, bp);
        emitRoofWindow(w, plan);
      };
      const big = new BigWriter(reg.x0, reg.z0, reg.x1, reg.z1, reg.y0, reg.y1);
      fn(big);
      const region = {
        x0: Math.floor(reg.x0 / 16) * 16, z0: Math.floor(reg.z0 / 16) * 16, x1: Math.ceil(reg.x1 / 16) * 16, z1: Math.ceil(reg.z1 / 16) * 16, y0: reg.y0, y1: reg.y1,
      };
      const fwd = sliceUnion(region, fn, 0, 'fwd');
      const rev = sliceUnion(region, fn, 0, 'reverse');
      let diff = 0;
      let nz = 0;
      for (let y = reg.y0; y < reg.y1; y++) {
        for (let z = reg.z0; z < reg.z1; z++) {
          for (let x = reg.x0; x < reg.x1; x++) {
            const a = big.get(x, y, z);
            if (a !== 0) nz++;
            if (a !== fwd.get(x, y, z) || a !== rev.get(x, y, z)) {
              diff++;
              if (diff < 3) throw new Error('lot ' + id + ' fark ' + [x, y, z] + ' ' + a + '/' + fwd.get(x, y, z) + '/' + rev.get(x, y, z));
            }
          }
        }
      }
      expect(nz).toBeGreaterThan(300);
      expect(diff).toBe(0);
    });
  }, 300000);

  it('chunk sırası bağımsız: çatı içerikli chunk\'lar iki sırayla aynı baytlar', () => {
    const seed = citySeed(3);
    const plan = getCityPlan(seed);
    const R = roofRouteContent(plan)[2];
    const list = [];
    const bp = R.bps[R.finish.lot];
    list.push([Math.floor(bp.x0 / 16), Math.floor(bp.z0 / 16)], [Math.floor((bp.x0 + bp.w) / 16), Math.floor((bp.z0 + bp.d) / 16)]);
    const run = (order) => order.map((c) => digest(Array.from(generateCityChunk(seed, c[0], c[1], { light: false }).toDense(48, 112))));
    const a = run(list);
    expect(run(list.slice().reverse()).reverse()).toEqual(a);
  });
});

describe('çatı keşif çapaları', () => {
  it('roofDiscovery: 8 parkur, 60 çatı çipi (yalnız parkur çatılarında, pad merkezinde); çip hücresi boş, altı sağlam, kontrol karosu neon', () => {
    [citySeed(0), citySeed(5), citySeed(9)].forEach((seed) => {
      const plan = getCityPlan(seed);
      const D = roofDiscovery(plan);
      expect(D.routes.length).toBe(8);
      expect(D.chips.length).toBe(60);
      expect(D.bridges).toBeGreaterThanOrEqual(1);
      const rd = chunkReader(seed);
      D.chips.forEach((c) => {
        const x = Math.floor(c.x);
        const z = Math.floor(c.z);
        expect(rd.getBlock(x, c.y, z), 'çip hücresi dolu ' + [x, c.y, z]).toBe(0);
        expect(rd.getBlock(x, c.y - 1, z)).not.toBe(0);
        const onRoute = D.routes.some((R) => R.pads.some((p) => Math.floor(p.x) === x && Math.floor(p.z) === z && p.y === c.y));
        expect(onRoute).toBe(true);
        expect([229, 230]).toContain(rd.getBlock(x, c.y - 1, z)); // kontrol karosu merkezi (camgöbeği / bitiş pembe)
      });
      D.routes.forEach((R) => expect(rd.getBlock(R.finish.x, R.finish.y, R.finish.z)).toBe(B.REWARD_CHEST));
    });
  });
});
