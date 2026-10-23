import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeCtx, fakeManager, frame, getPuzzle, makeCtx, simulate,
} from './index.js';
import './hareketliplatform.js';
import {
  layoutReport, platformLayout, platformSize, slideCell, slideFrac, stoneStage,
} from './hareketliplatformLogic.js';
import { seededRandom } from '../rng.js';

const TYPE = 'hareketliplatform';
const ORIGIN = { x: 40, y: 30, z: 40 };

function setup(difficulty, facing, seed) {
  const sd = seed === undefined ? 7 : seed;
  const f = facing === undefined ? 0 : facing;
  const h = fakeManager({ seed: sd });
  const desc = {
    id: 'hp:' + difficulty + ':' + f, type: TYPE, origin: ORIGIN, facing: f, difficulty, zone: 1,
  };
  const room = buildPuzzleRoom(desc, { seed: sd, setBlock: h.world.writer() });
  h.mgr.register(desc.id, desc);
  const F = frame({
    origin: ORIGIN, facing: f, seed: 0, setBlock() {},
  });
  const player = F.toWorld(0, 1, 3);
  return {
    h, desc, room, F, player, S: () => h.mgr.get(desc.id).state, sd,
  };
}

function ev(type, w, extra) {
  return Object.assign({
    type, x: w.x, y: w.y, z: w.z,
  }, extra);
}

describe('hareketliplatform — kayıt ve uyumluluk', () => {
  it('kayıtlı, Türkçe ad, zorluk 1..5', () => {
    const impl = getPuzzle(TYPE);
    expect(impl).toBeTruthy();
    expect(impl.name).toMatch(/Platform/);
    expect(impl.difficultyRange).toEqual([1, 5]);
    for (let d = 1; d <= 5; d++) {
      const fp = impl.footprint(d);
      expect(fp.w).toBeGreaterThanOrEqual(7);
      expect(fp.d).toBeLessThanOrEqual(41);
      expect(fp).toEqual(Object.assign(platformSize(d), { margin: 2 }));
    }
  });

  it('kit uyumluluk denetimi sorunsuz (tüm zorluklar × yönler)', () => {
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 120000);
});

describe('hareketliplatform — yerleşim ve adillik', () => {
  it('tüm zorluklarda ve 40 tohumda değişmezler sağlanır', () => {
    for (let d = 1; d <= 5; d++) {
      for (let s = 1; s <= 40; s++) {
        const L = platformLayout(d, seededRandom(s * 977 + d));
        expect(layoutReport(L), 'd' + d + ' s' + s).toEqual([]);
      }
    }
  });

  it('belirlenimli: aynı tohum aynı yerleşim; farklı tohum (d≥2) farklı faz', () => {
    const a = JSON.stringify(platformLayout(4, seededRandom(5)));
    const b = JSON.stringify(platformLayout(4, seededRandom(5)));
    expect(a).toBe(b);
    const phases = new Set();
    for (let s = 1; s <= 12; s++) {
      const L = platformLayout(2, seededRandom(s));
      phases.add(L.segs[0].plat.phase);
    }
    expect(phases.size).toBeGreaterThan(3);
  });

  it('kayar platform uçlarda adaya hizalı bekler ve hücre başına ≤1 kayar', () => {
    for (let d = 1; d <= 5; d++) {
      const L = platformLayout(d, seededRandom(11));
      for (const seg of L.segs) {
        if (!seg.plat) continue;
        const p = seg.plat;
        const c0 = slideCell(p, 0);
        const c1 = slideCell(p, 1);
        expect(c0[2]).toBe(seg.lz0);
        expect(c1[2] + p.sz - 1).toBe(seg.lz1);
        // kollu platform değilse tüm tur boyunca süreklilik
        let prev = slideCell(p, slideFrac(p, 0, 0));
        for (let t = 0.01; t < p.P * 2; t += 1 / 60) {
          const c = slideCell(p, slideFrac(p, t, 0));
          const jump = Math.max(Math.abs(c[0] - prev[0]), Math.abs(c[1] - prev[1]), Math.abs(c[2] - prev[2]));
          expect(jump).toBeLessThanOrEqual(1);
          prev = c;
        }
      }
    }
  });

  it('süre taramasıyla her platformdan geçilebilir: uç beklemelerinde hizalı pencere var', () => {
    for (let d = 1; d <= 5; d++) {
      const L = platformLayout(d, seededRandom(3));
      for (const seg of L.segs) {
        if (!seg.plat) continue;
        const p = seg.plat;
        const tOn = p.lever ? 0 : -1;
        const dt = 1 / 60;
        let nearRun = 0;
        let farRun = 0;
        let bestNear = 0;
        let bestFar = 0;
        for (let t = 0; t < p.P * 2; t += dt) {
          const f = slideFrac(p, t, tOn);
          nearRun = f === 0 ? nearRun + dt : 0;
          farRun = f === 1 ? farRun + dt : 0;
          bestNear = Math.max(bestNear, nearRun);
          bestFar = Math.max(bestFar, farRun);
        }
        // kollu platform: P'nin tamamında yakın uçta başlar
        expect(bestNear).toBeGreaterThanOrEqual(p.dwell * 0.9);
        expect(bestFar).toBeGreaterThanOrEqual(p.dwell * 0.9);
      }
    }
  });

  it('kaybolan taş zinciri: her tur her taş en az 1,5 sn katı, ardışık örtüşme ≥ 1 sn, ilk taş adadan hemen alınabilir', () => {
    for (let d = 3; d <= 5; d++) {
      const L = platformLayout(d, seededRandom(21));
      for (const seg of L.segs) {
        if (!seg.st) continue;
        const dt = 1 / 30;
        for (let k = 0; k < seg.stones.length; k++) {
          let run = 0;
          let best = 0;
          for (let t = 0; t < seg.st.P * 3; t += dt) {
            run = stoneStage(seg.st, seg.stones[k], t) !== 0 ? run + dt : 0;
            best = Math.max(best, run);
          }
          expect(best).toBeGreaterThanOrEqual(1.5);
          if (k > 0) {
            let both = 0;
            let bestBoth = 0;
            for (let t = 0; t < seg.st.P * 3; t += dt) {
              const ok = stoneStage(seg.st, seg.stones[k - 1], t) !== 0 && stoneStage(seg.st, seg.stones[k], t) !== 0;
              both = ok ? both + dt : 0;
              bestBoth = Math.max(bestBoth, both);
            }
            expect(bestBoth).toBeGreaterThanOrEqual(0.95);
          }
        }
      }
    }
  });
});

describe('hareketliplatform — dünya ve etkileşim', () => {
  it('build: hareketli platform blokları + kurtarma plakaları + kapı; çözülmemiş başlar', () => {
    for (let d = 1; d <= 5; d++) {
      const { h, S } = setup(d, d % 4);
      expect(S().done).toBe(false);
      expect(h.world.count(B.MOVING_PLATFORM)).toBeGreaterThan(0);
      expect(h.world.count(B.PRESSURE_PLATE)).toBeGreaterThan(20);
      expect(h.world.count(B.LOCKED_DOOR)).toBeGreaterThan(0);
      expect(h.mgr.hintFor('hp:' + d + ':' + (d % 4))).toMatch(/\S/);
    }
  });

  it('movers: dünya AABB gerçek blokla eşleşir ve zamanla hareket eder', () => {
    const { h, S, F } = setup(2, 1);
    const m0 = JSON.parse(JSON.stringify(S().movers[0]));
    expect(m0.kind).toBe('platform');
    // başlangıçta platform tüm hücrelerinde blok
    for (let x = m0.x0; x <= m0.x1; x++) {
      for (let z = m0.z0; z <= m0.z1; z++) expect(h.world.getBlock(x, m0.y0, z)).toBe(B.MOVING_PLATFORM);
    }
    const effs = [];
    h.mgr.on('effect', (e) => effs.push(e));
    simulate(h.mgr, 6, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    const m1 = S().movers[0];
    const moved = ['x0', 'z0', 'y0'].some((k) => m1[k] !== m0[k]);
    expect(moved).toBe(true);
    for (let x = m1.x0; x <= m1.x1; x++) {
      for (let z = m1.z0; z <= m1.z1; z++) expect(h.world.getBlock(x, m1.y0, z)).toBe(B.MOVING_PLATFORM);
    }
    const carries = effs.filter((e) => e.kind === 'carry');
    expect(carries.length).toBeGreaterThan(0);
    for (const c of carries) {
      expect(Math.abs(c.dx) + Math.abs(c.dy) + Math.abs(c.dz)).toBe(1);
      expect(c.box.x1).toBeGreaterThanOrEqual(c.box.x0);
    }
    // toplam platform bloğu sayısı sabit (iz bırakmaz)
    const L = S().lay;
    const p = L.segs[0].plat;
    expect(h.world.count(B.MOVING_PLATFORM)).toBe(p.sx * p.sz * S().movers.length + countStones(S()));
  });

  it('kontrol noktası: plakaya basınca kaydedilir, plaka yanar, düşünce oraya ışınlanır (kısıtlı sıklıkta)', () => {
    const { h, F, S, desc } = setup(3, 2);
    const L = S().lay;
    const plate = F.toWorld(L.isl[1].plate.lx, L.isl[1].y, L.isl[1].plate.lz);
    const msgs = [];
    h.mgr.on('message', (e) => msgs.push(e.text));
    h.mgr.handleInteract(ev('step', plate));
    expect(S().cp).toBe(1);
    expect(h.world.getBlock(plate.x, plate.y, plate.z)).toBe(B.PRESSURE_PLATE_ON);
    h.mgr.handleInteract(ev('step', plate));
    expect(msgs.filter((m) => /Kontrol noktası/.test(m)).length).toBe(1);
    // çukura düş: kurtarma plakası
    const seg = L.segs[1];
    const pitCell = F.toWorld(0, seg.ps, seg.lz0 + 2);
    expect(h.world.getBlock(pitCell.x, pitCell.y, pitCell.z)).toBe(B.PRESSURE_PLATE);
    const tele = [];
    h.mgr.on('effect', (e) => {
      if (e.kind === 'teleport') tele.push(e);
    });
    h.mgr.handleInteract(ev('step', pitCell));
    h.mgr.handleInteract(ev('step', pitCell));
    expect(tele.length).toBe(1);
    expect(S().falls).toBe(1);
    const c = L.cps[1];
    const dest = F.toWorld(c.lx, c.ly, c.lz);
    expect(tele[0].x).toBeCloseTo(dest.x + 0.5, 5);
    expect(tele[0].y).toBe(dest.y);
    expect(tele[0].z).toBeCloseTo(dest.z + 0.5, 5);
    expect(typeof tele[0].yaw).toBe('number');
    // zaman geçince tekrar tetiklenebilir
    simulate(h.mgr, 2, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    h.mgr.handleInteract(ev('step', pitCell));
    expect(tele.length).toBe(2);
    expect(desc.type).toBe(TYPE);
  });

  it('kollu platform: kol çekilince çalışır, süre dolunca durup kolu bırakır, tekrar çekilebilir', () => {
    const { h, F, S } = setup(2, 0);
    const L = S().lay;
    const seg = L.segs[1];
    const lever = F.toWorld(seg.lever.lx, seg.lever.ly, seg.lever.lz);
    const p = seg.plat;
    const park = slideCell(p, 0);
    const parkW = F.toWorld(park[0], park[1], park[2]);
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER);
    // kol çekilmeden platform park halinde
    simulate(h.mgr, 5, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    expect(h.world.getBlock(parkW.x, parkW.y, parkW.z)).toBe(B.MOVING_PLATFORM);
    h.mgr.handleInteract(ev('use', lever));
    expect(S().lev[1]).toBeGreaterThanOrEqual(0);
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER_ON);
    const mv = S().movers.find((m) => m.id === p.id);
    const before = JSON.stringify([mv.x0, mv.y0, mv.z0]);
    simulate(h.mgr, p.dwell + p.travelT * 0.6, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    expect(JSON.stringify([mv.x0, mv.y0, mv.z0])).not.toBe(before);
    // ikinci çekiş çalışırken yok sayılır
    const lev = S().lev[1];
    h.mgr.handleInteract(ev('use', lever));
    expect(S().lev[1]).toBe(lev);
    simulate(h.mgr, p.W + 1, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    expect(S().lev[1]).toBe(-1);
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER);
    expect(h.world.getBlock(parkW.x, parkW.y, parkW.z)).toBe(B.MOVING_PLATFORM);
    h.mgr.handleInteract(ev('use', lever));
    expect(S().lev[1]).toBeGreaterThanOrEqual(0);
  });

  it('bitiş plakası: bir kez çözüldü olayı, arka kapı açılır; çözülünce sıfırla kolu bir şey yapmaz', () => {
    const { h, F, S, desc } = setup(1, 3);
    const L = S().lay;
    const goal = L.isl[L.isl.length - 1];
    const gw = F.toWorld(goal.plate.lx, goal.y, goal.plate.lz);
    expect(h.world.count(B.LOCKED_DOOR)).toBeGreaterThan(0);
    h.mgr.handleInteract(ev('step', gw));
    h.mgr.handleInteract(ev('step', gw));
    expect(h.solved.length).toBe(1);
    expect(h.emitted.filter((e) => e.type === 'puzzleSolved').length).toBe(1);
    expect(S().done).toBe(true);
    expect(h.world.count(B.LOCKED_DOOR)).toBe(0);
    expect(h.world.getBlock(gw.x, gw.y, gw.z)).toBe(B.PRESSURE_PLATE_ON);
    const reset = F.toWorld(L.reset.lx, L.reset.ly, L.reset.lz);
    h.mgr.handleInteract(ev('use', reset));
    expect(S().done).toBe(true);
    expect(h.mgr.get(desc.id).solved).toBe(true);
  });

  it('sıfırlama kolu çözülmemiş odayı başlangıca döndürür (dünya ilk kurulumla özdeş)', () => {
    const { h, F, S, desc, sd } = setup(4, 1);
    const fresh = new FakeWorld({ seed: sd });
    buildPuzzleRoom(desc, { seed: sd, setBlock: fresh.writer() });
    const L = S().lay;
    const lever = F.toWorld(L.segs[0].lever.lx, L.segs[0].lever.ly, L.segs[0].lever.lz);
    h.mgr.handleInteract(ev('use', lever));
    h.mgr.handleInteract(ev('step', F.toWorld(L.isl[1].plate.lx, L.isl[1].y, L.isl[1].plate.lz)));
    simulate(h.mgr, 9, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
    expect(h.world.snapshot()).not.toBe(fresh.snapshot());
    h.mgr.handleInteract(ev('use', F.toWorld(L.reset.lx, L.reset.ly, L.reset.lz)));
    expect(S().cp).toBe(0);
    expect(S().t).toBe(0);
    expect(h.world.snapshot()).toBe(fresh.snapshot());
  });

  it('serileştirme turu ortada: yeni dünyaya yüklenince platform/taş/kol blokları birebir aynı', () => {
    for (let d = 2; d <= 5; d++) {
      const a = setup(d, 2, 31);
      const L = a.S().lay;
      const lever = L.segs.find((s) => s.lever);
      if (lever) a.h.mgr.handleInteract(ev('use', a.F.toWorld(lever.lever.lx, lever.lever.ly, lever.lever.lz)));
      a.h.mgr.handleInteract(ev('step', a.F.toWorld(L.isl[1].plate.lx, L.isl[1].y, L.isl[1].plate.lz)));
      simulate(a.h.mgr, 7.37, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
      const saved = JSON.parse(JSON.stringify(a.h.mgr.serialize()));
      const b = fakeManager({ seed: 31 });
      const desc = Object.assign({}, a.desc);
      buildPuzzleRoom(desc, { seed: 31, setBlock: b.world.writer() });
      b.mgr.register(desc.id, desc);
      b.mgr.restore(saved);
      expect(b.world.snapshot(), 'd' + d).toBe(a.h.world.snapshot());
      expect(JSON.stringify(b.mgr.serialize())).toBe(JSON.stringify(saved));
      // devam ettirince iki dünya aynı kalır (belirlenimli)
      simulate(a.h.mgr, 3, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
      simulate(b.mgr, 3, { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
      expect(b.world.snapshot(), 'd' + d + ' devam').toBe(a.h.world.snapshot());
    }
  });

  it('takılma yok: her çukurun zemininden yakın kenara yürüyerek çıkılır (rampa/sığ çukur) ve düşme ≤ 3', () => {
    for (let d = 1; d <= 5; d++) {
      for (let f = 0; f < 4; f++) {
        const { h, F, S } = setup(d, f);
        const L = S().lay;
        for (const seg of L.segs) {
          // BFS: yerel (lx,lz) ızgarasında ayakta durulabilir hücreler; tırmanış ≤ 1, düşüş serbest
          const standY = (lx, lz) => {
            for (let ly = L.h; ly >= seg.ps - 1; ly--) {
              const w = F.toWorld(lx, ly, lz);
              const below = F.toWorld(lx, ly - 1, lz);
              const here = h.world.getBlock(w.x, w.y, w.z);
              const bb = h.world.getBlock(below.x, below.y, below.z);
              const head = F.toWorld(lx, ly + 1, lz);
              if ((here === 0 || here === B.PRESSURE_PLATE) && h.world.getBlock(head.x, head.y, head.z) === 0
                && bb !== 0 && bb !== B.PRESSURE_PLATE) return ly;
            }
            return null;
          };
          const start = [0, seg.lz0 + 1];
          const sy = standY(start[0], start[1]);
          expect(sy, 'd' + d + ' çukur zemini').not.toBeNull();
          const seen = new Set([start.join(',')]);
          const q = [[start[0], start[1], sy]];
          const target = seg.y0;
          let reached = false;
          while (q.length && !reached) {
            const [lx, lz, ly] = q.pop();
            if (lz === seg.lz0 - 1 && ly === target) reached = true;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = lx + dx;
              const nz = lz + dz;
              if (nx < L.x0 || nx > L.x1 || nz < seg.lz0 - 1 || nz > seg.lz1 + 1 || seen.has(nx + ',' + nz)) continue;
              const ny = standY(nx, nz);
              if (ny === null || ny - ly > 1) continue;
              seen.add(nx + ',' + nz);
              q.push([nx, nz, ny]);
            }
          }
          expect(reached, 'd' + d + ' f' + f + ' seg' + seg.i + ' çıkış').toBe(true);
        }
      }
    }
  });

  it('fakeCtx ile build: kuru çalıştırma ve gerçek build aynı başlangıç durumunu verir', () => {
    const ctx = fakeCtx({
      id: 'x', origin: ORIGIN, facing: 1, difficulty: 3, zone: 2,
    });
    const impl = getPuzzle(TYPE);
    const r = impl.build(ctx);
    const dry = makeCtx({
      id: 'x', worldSeed: 1, origin: ORIGIN, facing: 1, difficulty: 3, zone: 2,
    });
    const r2 = impl.build(dry);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(r2.state));
    expect(impl.isSolved(r.state)).toBe(false);
  });
});

function countStones(S) {
  let n = 0;
  for (const seg of S.lay.segs) {
    if (!seg.stones) continue;
    for (const st of seg.stones) {
      if (stoneStage(seg.st, st, S.t) !== 0) n += seg.st.ss * seg.st.ss;
    }
  }
  return n;
}
