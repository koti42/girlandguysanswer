import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeManager, frame, getPuzzle, simulate,
} from './index.js';
import golgekopru, { alignmentPercent } from './golgekopru.js';
import {
  alignment, bridgeDuration, bridgeStage, countAligned, golgeLayout, golgeSize, lampOffset, ringOffsets, shadowCells, solveSection,
  visibleShadowCells,
} from './golgekopruLogic.js';
import { seededRandom } from '../rng.js';

const TYPE = 'golgekopru';
const ORIGIN = { x: 60, y: 40, z: -30 };
const LEVER = ['azM', 'azP', 'elM', 'elP'];

function setup(difficulty, facing, seed) {
  const sd = seed === undefined ? 5 : seed;
  const f = facing === undefined ? 0 : facing;
  const h = fakeManager({ seed: sd });
  const desc = {
    id: 'gk:' + difficulty + ':' + f, type: TYPE, origin: ORIGIN, facing: f, difficulty, zone: 2,
  };
  buildPuzzleRoom(desc, { seed: sd, setBlock: h.world.writer() });
  h.mgr.register(desc.id, desc);
  const F = frame({
    origin: ORIGIN, facing: f, seed: 0, setBlock() {},
  });
  return {
    h, desc, F, sd, S: () => h.mgr.get(desc.id).state,
  };
}

function ev(type, w, extra) {
  return Object.assign({
    type, x: w.x, y: w.y, z: w.z,
  }, extra);
}

function pull(ctx, k, q) {
  const lv = ctx.S().lay.sections[k].lev[LEVER[q]];
  const w = ctx.F.toWorld(lv.lx, lv.ly, lv.lz);
  return ctx.h.mgr.handleInteract(ev('use', w));
}

/** Bölüm k'yi BFS yoluyla çözer; döner: çekilen kol sayısı. */
function solveWithLevers(ctx, k) {
  const sec = ctx.S().lay.sections[k];
  const cur = ctx.S().sec[k];
  const sol = solveSection({
    nAz: sec.nAz, nEl: sec.nEl, mono: sec.mono, cot: sec.cot, start: { az: cur.az, el: cur.el },
  });
  expect(sol).not.toBeNull();
  let pulls = 0;
  for (let i = 1; i < sol.path.length; i++) {
    const [a0, e0] = sol.path[i - 1];
    const [a1, e1] = sol.path[i];
    let q;
    if (e1 > e0) q = 3;
    else if (e1 < e0) q = 2;
    else q = (a0 + 1) % sec.nAz === a1 ? 1 : 0;
    pull(ctx, k, q);
    pulls++;
  }
  return pulls;
}

const POS = { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z };

describe('golgekopru — kayıt ve uyumluluk', () => {
  it('kayıtlı ve footprint tutarlı', () => {
    const impl = getPuzzle(TYPE);
    expect(impl).toBeTruthy();
    expect(impl.name).toBe('Gölge Mimarisi');
    expect(golgekopru).toBe(impl);
    for (let d = 1; d <= 5; d++) {
      const fp = impl.footprint(d);
      expect(fp).toEqual(Object.assign(golgeSize(d), { margin: 2 }));
      expect(fp.d).toBeLessThanOrEqual(41);
    }
  });

  it('kit uyumluluk denetimi sorunsuz', () => {
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 180000);
});

describe('golgekopru — üretici ve gölge modeli', () => {
  it('tüm zorluklar × 60 tohum: katı üretim, tek çözüm, çözülebilir, başlangıç hizasız ve soğuk', () => {
    for (let d = 1; d <= 5; d++) {
      for (let s = 1; s <= 60; s++) {
        const L = golgeLayout(d, seededRandom(s * 131 + d));
        expect(L.strict, 'd' + d + ' s' + s + ' katı').toBe(true);
        for (const sec of L.sections) {
          expect(countAligned(sec)).toBe(1);
          const al0 = alignment(sec, sec.start.az, sec.start.el);
          expect(al0.aligned).toBe(false);
          expect(al0.pct).toBeLessThan(80);
          expect(visibleShadowCells(sec, sec.start.az, sec.start.el, L.x0, L.x1)).toBeGreaterThanOrEqual(3);
          expect(alignment(sec, sec.target.az, sec.target.el)).toMatchObject({ aligned: true, pct: 100 });
          const sol = solveSection(sec);
          expect(sol).not.toBeNull();
          expect(sol.steps).toBeGreaterThanOrEqual(2);
          expect(sol.steps).toBeLessThanOrEqual(sec.nAz / 2 + sec.nEl);
          // monolit sınırları ve çakışma yok
          for (let k = 0; k < sec.mono.length; k++) {
            const m = sec.mono[k];
            expect(m.bx).toBeGreaterThanOrEqual(L.x0);
            expect(m.bx + m.w - 1).toBeLessThanOrEqual(L.x1);
            expect(m.bz).toBeGreaterThanOrEqual(0);
            expect(m.bz + m.dz - 1).toBeLessThanOrEqual(L.d - 1);
            expect(m.by).toBeGreaterThanOrEqual(1);
            expect(m.by).toBeLessThanOrEqual(L.h - 3);
            const hitsCorridor = !(m.bx + m.w - 1 < -1 || m.bx > 1);
            const inChasm = m.bz >= sec.c0 && m.bz + m.dz - 1 <= sec.c1;
            if (inChasm && hitsCorridor) expect(m.by).toBeGreaterThanOrEqual(5);
            if (!inChasm) expect(m.by).toBeGreaterThanOrEqual(6);
            expect(m.tx).toBe(-1);
          }
        }
      }
    }
  });

  it('hedef dilimleri köprü şeridini tam doldurur (boşluksuz, üst üste binmeden)', () => {
    for (let d = 1; d <= 5; d++) {
      const L = golgeLayout(d, seededRandom(d));
      for (const sec of L.sections) {
        const covered = new Set();
        for (const m of sec.mono) {
          for (let z = m.tz; z < m.tz + m.dz; z++) {
            expect(covered.has(z)).toBe(false);
            covered.add(z);
          }
        }
        expect(covered.size).toBe(sec.G);
        for (let z = sec.c0; z <= sec.c1; z++) expect(covered.has(z)).toBe(true);
      }
    }
  });

  it('belirlenimli; farklı tohum farklı hedef', () => {
    const a = JSON.stringify(golgeLayout(3, seededRandom(9)));
    expect(JSON.stringify(golgeLayout(3, seededRandom(9)))).toBe(a);
    const targets = new Set();
    for (let s = 1; s <= 30; s++) {
      const sec = golgeLayout(3, seededRandom(s)).sections[0];
      targets.add(sec.target.az + ':' + sec.target.el);
    }
    expect(targets.size).toBeGreaterThan(8);
  });

  it('halka ve lamba konumu: gölge yönünün tersi; 8 ve 12 konumda benzersiz hücreler', () => {
    for (const n of [8, 12]) {
      const offs = ringOffsets(n);
      expect(offs.length).toBe(n);
      expect(new Set(offs.map((o) => o.join(','))).size).toBe(n);
      const sec = { nAz: n };
      for (let a = 0; a < n; a++) {
        const lamp = lampOffset(sec, a);
        const opp = offs[(a + n / 2) % n];
        expect(lamp).toEqual(opp);
      }
    }
  });

  it('sıcaklık sürekli: hedefe yaklaştıkça yüzde (ortalama) artar; yalnızca hizada 100', () => {
    for (let d = 2; d <= 5; d++) {
      const sec = golgeLayout(d, seededRandom(17)).sections[0];
      const sol = solveSection(sec);
      const pcts = sol.path.map(([a, e]) => alignment(sec, a, e).pct);
      expect(pcts[pcts.length - 1]).toBe(100);
      for (let i = 0; i < pcts.length - 1; i++) expect(pcts[i]).toBeLessThan(100);
      // her çözüm yolunun sonuna doğru ortalama yükselir
      expect(pcts[pcts.length - 2]).toBeGreaterThanOrEqual(pcts[0]);
    }
  });

  it('köprü evreleri satır satır ilerler', () => {
    expect(bridgeStage(0, -1)).toBe(0);
    expect(bridgeStage(0, 0)).toBe(1);
    expect(bridgeStage(3, 0.1)).toBe(0);
    const dur = bridgeDuration(6);
    for (let r = 0; r < 6; r++) expect(bridgeStage(r, dur)).toBe(2);
  });
});

describe('golgekopru — oyun içi akış', () => {
  function walkable(world, F, lxFrom, lxTo, lzFrom, lzTo, startLz, goalLz, maxY) {
    // yerel (lx,lz) yüzey grafı; ayakta durulabilir hücre: zemin katı, ayak+baş hava. tırmanış ≤ 1.
    const stand = (lx, lz) => {
      for (let ly = maxY; ly >= -4; ly--) {
        const w = F.toWorld(lx, ly, lz);
        const b = F.toWorld(lx, ly - 1, lz);
        const hd = F.toWorld(lx, ly + 1, lz);
        const here = world.getBlock(w.x, w.y, w.z);
        const below = world.getBlock(b.x, b.y, b.z);
        if ((here === 0 || here === B.PRESSURE_PLATE) && world.getBlock(hd.x, hd.y, hd.z) === 0
          && below !== 0 && below !== B.PRESSURE_PLATE) return ly;
      }
      return null;
    };
    const s0 = stand(0, startLz);
    if (s0 === null) return false;
    const seen = new Set([0 + ',' + startLz]);
    const q = [[0, startLz, s0]];
    while (q.length) {
      const [lx, lz, ly] = q.pop();
      if (lz >= goalLz && ly === 0) return true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = lx + dx;
        const nz = lz + dz;
        if (nx < lxFrom || nx > lxTo || nz < lzFrom || nz > lzTo || seen.has(nx + ',' + nz)) continue;
        const ny = stand(nx, nz);
        if (ny === null || ny - ly > 1) continue;
        seen.add(nx + ',' + nz);
        q.push([nx, nz, ny]);
      }
    }
    return false;
  }

  it('başlangıç: çözülmemiş, köprü yok, uçurum geçilemez; kollar ve kadranlar kurulu', () => {
    for (let d = 1; d <= 5; d++) {
      const ctx = setup(d, d % 4);
      const L = ctx.S().lay;
      expect(ctx.S().done).toBe(false);
      expect(ctx.h.world.count(B.LEVER)).toBeGreaterThanOrEqual(4 * L.sections.length + 1);
      expect(ctx.h.world.count(B.LIGHT_BLOCK)).toBe(L.sections.length);
      expect(ctx.h.world.count(B.LOCKED_DOOR)).toBeGreaterThan(0);
      expect(ctx.h.world.count(B.GLASS_BLUE)).toBe(0);
      const sec = L.sections[0];
      expect(walkable(ctx.h.world, ctx.F, L.x0, L.x1, 0, L.d - 1, 1, sec.c1 + 1, 4)).toBe(false);
    }
  });

  it('kol çekişleri: açı güncellenir, sıcaklık sesi pitch ile yükselir, mesaj yüzde okur, kol bloğu kısa süre açık', () => {
    const ctx = setup(2, 1);
    const sec = ctx.S().lay.sections[0];
    const effects = [];
    ctx.h.mgr.on('effect', (e) => effects.push(e));
    const az0 = ctx.S().sec[0].az;
    const pcts = [];
    const doPull = (q) => {
      const r = pull(ctx, 0, q);
      pcts.push(alignment(sec, ctx.S().sec[0].az, ctx.S().sec[0].el).pct);
      return r;
    };
    expect(doPull(1)).toBe(true);
    expect(ctx.S().sec[0].az).toBe((az0 + 1) % sec.nAz);
    doPull(0);
    doPull(0);
    expect(ctx.S().sec[0].az).toBe((az0 + sec.nAz - 1) % sec.nAz);
    const rune = effects.filter((e) => e.kind === 'sound' && /^rune:/.test(e.name));
    expect(rune.length).toBe(3);
    const msgs = effects.filter((e) => e.kind === 'message');
    expect(msgs.some((m) => /%\d+/.test(m.text))).toBe(true);
    // sıcaklık sırası = pitch sırası
    const pairs = rune.map((r, i) => ({ pitch: r.pitch, pct: pcts[i] }));
    pairs.sort((x, y) => x.pct - y.pct);
    for (let i = 1; i < pairs.length; i++) expect(pairs[i].pitch).toBeGreaterThanOrEqual(pairs[i - 1].pitch);
    // kol darbesi bitince kapanır
    const lv = sec.lev.azP;
    const w = ctx.F.toWorld(lv.lx, lv.ly, lv.lz);
    pull(ctx, 0, 1);
    expect(ctx.h.world.getBlock(w.x, w.y, w.z)).toBe(B.LEVER_ON);
    simulate(ctx.h.mgr, 0.6, POS);
    expect(ctx.h.world.getBlock(w.x, w.y, w.z)).toBe(B.LEVER);
    expect(alignmentPercent(ctx.S())).toBe(alignment(sec, ctx.S().sec[0].az, ctx.S().sec[0].el).pct);
    expect(ctx.h.mgr.hintFor(ctx.desc.id)).toMatch(/%\d+/);
  });

  it('elevation sınırlı, azimut dairesel', () => {
    const ctx = setup(1, 0);
    const sec = ctx.S().lay.sections[0];
    for (let i = 0; i < 6; i++) pull(ctx, 0, 3);
    expect(ctx.S().sec[0].el).toBe(sec.nEl - 1);
    for (let i = 0; i < 6; i++) pull(ctx, 0, 2);
    expect(ctx.S().sec[0].el).toBe(0);
    const a0 = ctx.S().sec[0].az;
    for (let i = 0; i < sec.nAz; i++) pull(ctx, 0, 1);
    expect(ctx.S().sec[0].az).toBe(a0);
  });

  it('çözüm yolu: gölge köprü katılaşır, geçilebilir olur, kapı açılır, bir kez çözüldü', () => {
    for (let d = 1; d <= 3; d++) {
      for (let f = 0; f < 4; f += 3) {
        const ctx = setup(d, f, 40 + d);
        const L = ctx.S().lay;
        const sec = L.sections[0];
        const pulls = solveWithLevers(ctx, 0);
        expect(pulls).toBeGreaterThanOrEqual(2);
        expect(ctx.S().sec[0].bt).toBe(0);
        // monolitler ametist, siyah gölge yok (hepsi kristal)
        expect(ctx.h.world.count(B.AMETHYST)).toBeGreaterThan(0);
        expect(ctx.h.world.count(B.CONCRETE_BLACK)).toBe(0);
        // köprü evrelerini izle
        simulate(ctx.h.mgr, 0.2, POS);
        expect(ctx.h.world.count(B.GLASS_BLUE)).toBeGreaterThan(0);
        simulate(ctx.h.mgr, bridgeDuration(sec.G) + 0.5, POS);
        expect(ctx.h.world.count(B.GLASS_BLUE)).toBe(0);
        expect(ctx.h.world.count(B.CRYSTAL_ROCK)).toBeGreaterThanOrEqual(3 * sec.G);
        expect(ctx.S().done).toBe(true);
        expect(ctx.h.solved.length).toBe(1);
        expect(ctx.h.world.count(B.LOCKED_DOOR)).toBe(0);
        expect(walkable(ctx.h.world, ctx.F, L.x0, L.x1, 0, L.d - 1, 1, sec.c1 + 1, 4)).toBe(true);
        // kilit: kol çekince değişmez
        const before = ctx.h.world.snapshot();
        pull(ctx, 0, 1);
        expect(ctx.h.world.snapshot()).toBe(before);
        simulate(ctx.h.mgr, 5, POS);
        expect(ctx.h.solved.length).toBe(1);
      }
    }
  });

  it('iki kuleli zorluklar: ikinci kule ikinci uçurumu açar; ancak ikisi bitince çözülür', () => {
    for (const d of [4, 5]) {
      const ctx = setup(d, 2, 77);
      const L = ctx.S().lay;
      expect(L.sections.length).toBe(2);
      solveWithLevers(ctx, 0);
      simulate(ctx.h.mgr, bridgeDuration(L.sections[0].G) + 1, POS);
      expect(ctx.S().done).toBe(false);
      expect(ctx.h.solved.length).toBe(0);
      expect(ctx.S().sec[1].bt).toBe(-1);
      solveWithLevers(ctx, 1);
      simulate(ctx.h.mgr, bridgeDuration(L.sections[1].G) + 1, POS);
      expect(ctx.S().done).toBe(true);
      expect(ctx.h.solved.length).toBe(1);
      expect(walkable(ctx.h.world, ctx.F, L.x0, L.x1, 0, L.d - 1, 1, L.sections[1].c1 + 1, 4)).toBe(true);
    }
  });

  it('düşme: kurtarma plakası güvenli bölgeye ışınlar; tamamlanan köprü sonrası ileri nokta', () => {
    const ctx = setup(4, 0, 12);
    const L = ctx.S().lay;
    const tele = [];
    ctx.h.mgr.on('effect', (e) => {
      if (e.kind === 'teleport') tele.push(e);
    });
    const sec0 = L.sections[0];
    const cell = ctx.F.toWorld(-3, L.ps, sec0.c0 + 1);
    expect(ctx.h.world.getBlock(cell.x, cell.y, cell.z)).toBe(B.PRESSURE_PLATE);
    ctx.h.mgr.handleInteract(ev('step', cell));
    ctx.h.mgr.handleInteract(ev('step', cell));
    expect(tele.length).toBe(1);
    const e0 = ctx.F.toWorld(L.cps[0].lx, L.cps[0].ly, L.cps[0].lz);
    expect(tele[0].x).toBeCloseTo(e0.x + 0.5, 5);
    expect(tele[0].z).toBeCloseTo(e0.z + 0.5, 5);
    solveWithLevers(ctx, 0);
    simulate(ctx.h.mgr, bridgeDuration(sec0.G) + 1, POS);
    const cell2 = ctx.F.toWorld(3, L.ps, L.sections[1].c0 + 1);
    ctx.h.mgr.handleInteract(ev('step', cell2));
    expect(tele.length).toBe(2);
    const e1 = ctx.F.toWorld(L.cps[1].lx, L.cps[1].ly, L.cps[1].lz);
    expect(tele[1].x).toBeCloseTo(e1.x + 0.5, 5);
    expect(tele[1].z).toBeCloseTo(e1.z + 0.5, 5);
    // şerit hücresinde (plaka yok) kurtarma tetiklenmez
    const lane = ctx.F.toWorld(0, L.ps, sec0.c0 + 1);
    expect(ctx.h.world.getBlock(lane.x, lane.y, lane.z)).toBe(0);
  });

  it('serileştirme turu köprü kurulurken: yeni dünyaya yüklenince bloklar birebir aynı', () => {
    for (const d of [3, 5]) {
      const a = setup(d, 1, 61);
      solveWithLevers(a, 0);
      simulate(a.h.mgr, 0.9, POS);
      const saved = JSON.parse(JSON.stringify(a.h.mgr.serialize()));
      const b = fakeManager({ seed: 61 });
      buildPuzzleRoom(a.desc, { seed: 61, setBlock: b.world.writer() });
      b.mgr.register(a.desc.id, a.desc);
      b.mgr.restore(saved);
      expect(b.world.snapshot(), 'd' + d).toBe(a.h.world.snapshot());
      simulate(a.h.mgr, 4, POS);
      simulate(b.mgr, 4, POS);
      expect(b.world.snapshot(), 'd' + d + ' devam').toBe(a.h.world.snapshot());
    }
  });

  it('sıfırlama kolu çözülmemiş odayı ilk kuruluma döndürür; çözülmüş oda sıfırlanmaz', () => {
    const ctx = setup(3, 2, 22);
    const fresh = new FakeWorld({ seed: ctx.sd });
    buildPuzzleRoom(ctx.desc, { seed: ctx.sd, setBlock: fresh.writer() });
    const L = ctx.S().lay;
    pull(ctx, 0, 1);
    pull(ctx, 0, 3);
    expect(ctx.h.world.snapshot()).not.toBe(fresh.snapshot());
    ctx.h.mgr.handleInteract(ev('use', ctx.F.toWorld(L.reset.lx, L.reset.ly, L.reset.lz)));
    expect(ctx.h.world.snapshot()).toBe(fresh.snapshot());
    solveWithLevers(ctx, 0);
    simulate(ctx.h.mgr, 8, POS);
    expect(ctx.S().done).toBe(true);
    const snap = ctx.h.world.snapshot();
    ctx.h.mgr.handleInteract(ev('use', ctx.F.toWorld(L.reset.lx, L.reset.ly, L.reset.lz)));
    expect(ctx.h.world.snapshot()).toBe(snap);
  });

  it('çukur zemini gölge işaretleri: hiza değişince siyah bloklar taşınır, sayıları monolit alanı kadar', () => {
    const ctx = setup(2, 0, 8);
    const sec = ctx.S().lay.sections[0];
    const cells = shadowCells(sec, ctx.S().sec[0].az, ctx.S().sec[0].el);
    const L = ctx.S().lay;
    let expected = 0;
    const seen = new Set();
    for (let k = 0; k < cells.length; k++) {
      for (let dz = 0; dz < sec.mono[k].dz; dz++) {
        for (let dx = 0; dx < sec.mono[k].w; dx++) {
          const lx = cells[k].x + dx;
          const lz = cells[k].z + dz;
          if (lx < L.x0 || lx > L.x1 || lz < sec.c0 || lz > sec.c1) continue;
          if (!seen.has(lx + ',' + lz)) expected++;
          seen.add(lx + ',' + lz);
        }
      }
    }
    expect(ctx.h.world.count(B.CONCRETE_BLACK)).toBe(expected);
  });
});
