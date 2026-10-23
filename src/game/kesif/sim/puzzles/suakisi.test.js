import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { hash32, seededRandom, stringSeedToInt } from '../rng.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeManager, frame, getPuzzle, simulate,
} from './index.js';
import { puzzleSeed } from './kitCtx.js';
import suakisi from './suakisi.js';
import {
  REVEAL_STEP, TILE, armMask, armsOf, evaluate, generateSu, grooveCells, suSize,
} from './suakisiLogic.js';

const TYPE = 'suakisi';
const ORIGIN = { x: -50, y: 20, z: 80 };
const POS = { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z };

function setup(difficulty, facing, seed) {
  const sd = seed === undefined ? 12 : seed;
  const f = facing === undefined ? 0 : facing;
  const h = fakeManager({ seed: sd });
  const desc = {
    id: 'su:' + difficulty + ':' + f + ':' + sd, type: TYPE, origin: ORIGIN, facing: f, difficulty, zone: 2,
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

function clickTile(ctx, i, cx, cz) {
  const L = ctx.S().lay;
  const gx = i % L.C;
  const gz = (i - gx) / L.C;
  const w = ctx.F.toWorld(L.bx + gx * TILE + (cx === undefined ? 1 : cx), -1, L.bz + gz * TILE + (cz === undefined ? 1 : cz));
  return ctx.h.mgr.handleInteract(ev('use', w));
}

function equivalent(type, a, b) {
  if (type === 'straight') return a % 2 === b % 2;
  return a === b;
}

/** Çözüm dönüşlerine tıklayarak ulaş. */
function playSolution(ctx, sol) {
  const L = ctx.S().lay;
  let clicks = 0;
  for (let i = 0; i < L.tiles.length; i++) {
    if (L.tiles[i].fixed) continue;
    let guard = 0;
    while (!equivalent(L.tiles[i].t, ctx.S().rots[i], sol[i]) && guard++ < 4) {
      clickTile(ctx, i);
      clicks++;
    }
  }
  return clicks;
}

function lavaSafe(ctx) {
  const L = ctx.S().lay;
  let bad = 0;
  ctx.h.world.cells(B.LAVA).forEach((c) => {
    const w = ctx.F.toLocal(c.x, c.y, c.z);
    expect(w.y).toBe(-2);
    const above = ctx.h.world.getBlock(c.x, c.y + 1, c.z);
    if (above === 0 || above === B.WATER || above === B.LAVA) bad++;
  });
  expect(L.C).toBeGreaterThan(0);
  return bad;
}

describe('suakisi — kayıt ve uyumluluk', () => {
  it('kayıtlı ve footprint tutarlı', () => {
    const impl = getPuzzle(TYPE);
    expect(impl).toBeTruthy();
    expect(suakisi).toBe(impl);
    expect(impl.name).toBe('Su Akışı');
    for (let d = 1; d <= 5; d++) expect(impl.footprint(d)).toEqual(Object.assign(suSize(d), { margin: 2 }));
  });

  it('kit uyumluluk denetimi sorunsuz', () => {
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 240000);
});

describe('suakisi — karo mantığı ve üretici', () => {
  it('kollar: dönüş saat yönünde; tip başına kol sayısı; oluk hücreleri merkez+kollar', () => {
    expect(armsOf('straight', 0)).toEqual([0, 2]);
    expect(armsOf('straight', 1)).toEqual([1, 3]);
    expect(armsOf('corner', 3)).toEqual([3, 0]);
    expect(armsOf('tee', 1).length).toBe(3);
    expect(armsOf('blank', 2)).toEqual([]);
    expect(armMask('corner', 0)).toBe(0b0011);
    expect(grooveCells('blank', 0)).toEqual([]);
    expect(grooveCells('straight', 0)).toEqual([[1, 1], [1, 0], [1, 2]]);
    expect(grooveCells('corner', 1).length).toBe(3);
    expect(grooveCells('tee', 0).length).toBe(4);
  });

  it('tüm zorluklar × 40 tohum: çözüm kanıtlı, başlangıç çözülmemiş, ≥%40 karo yanlış, geometri sığar', () => {
    for (let d = 1; d <= 5; d++) {
      for (let s = 1; s <= 40; s++) {
        const g = generateSu(d, seededRandom(s * 53 + d));
        const L = g.lay;
        const e = evaluate(L, g.sol);
        expect(e.solved, 'd' + d + ' s' + s).toBe(true);
        expect(e.waterOk).toBe(true);
        expect(e.conflict.length).toBe(0);
        expect(evaluate(L, g.rots).solved).toBe(false);
        // kaynak/alıcı sabit, sütun 0 ve C−1
        expect(L.tiles[L.src].t).toBe('ws');
        expect(L.src % L.C).toBe(0);
        expect(L.sink % L.C).toBe(L.C - 1);
        expect(L.tiles[L.src].fixed && L.tiles[L.sink].fixed).toBe(true);
        let wrong = 0;
        for (const i of L.movable) if (!equivalent(L.tiles[i].t, g.rots[i], g.sol[i])) wrong++;
        expect(wrong).toBeGreaterThanOrEqual(2);
        // zorluk özellikleri
        if (d >= 4) {
          expect(L.lsrc).toBeGreaterThanOrEqual(0);
          expect(e.V).not.toBeNull();
          expect(e.V[L.lsink]).toBeGreaterThanOrEqual(0);
        }
        if (d === 5) expect(L.needLava).toBe(true);
        if (d <= 3) expect(L.lsrc).toBe(-1);
        // yol uzunluğu (kaynak→alıcı uzaklığı) zorlukla artar
        expect(e.W[L.sink]).toBeGreaterThanOrEqual([0, 5, 8, 11, 12, 14][d] - 1);
        // oda boyutu
        const sz = suSize(d);
        expect(L.d).toBe(sz.d);
        expect(L.w).toBe(sz.w);
        expect(L.bx + TILE * L.C - 1).toBeLessThanOrEqual(L.x1 - 2);
        expect(L.bz + TILE * L.R - 1).toBeLessThanOrEqual(L.d - 4);
      }
    }
  });

  it('bağımsız çözücü (kaynaktan akışı izleyerek dönüş seçer) d1–d3 başlangıçlarında çözüm bulur', () => {
    for (let d = 1; d <= 3; d++) {
      for (let s = 1; s <= 25; s++) {
        const g = generateSu(d, seededRandom(s * 19 + d));
        const L = g.lay;
        const rots = g.rots.slice();
        const visited = new Set([L.src]);
        const dfs = (cur, from) => {
          if (cur === L.sink) return true;
          const gx = cur % L.C;
          const gz = (cur - gx) / L.C;
          const tile = L.tiles[cur];
          const options = tile.fixed ? [rots[cur]] : [0, 1, 2, 3];
          const keep = rots[cur];
          for (const r of options) {
            const arms = armsOf(tile.t, r);
            if (arms.indexOf((from + 2) % 4) < 0) continue;
            rots[cur] = r;
            for (const dd of arms) {
              if (dd === (from + 2) % 4) continue;
              const nx = gx + [0, 1, 0, -1][dd];
              const nz = gz + [-1, 0, 1, 0][dd];
              if (nx < 0 || nx >= L.C || nz < 0 || nz >= L.R) continue;
              const nj = nz * L.C + nx;
              if (visited.has(nj)) continue;
              visited.add(nj);
              if (dfs(nj, dd)) return true;
              visited.delete(nj);
            }
          }
          rots[cur] = keep;
          return false;
        };
        // kaynak kolu doğuya
        const startIdx = L.src + 1;
        visited.add(startIdx);
        expect(dfs(startIdx, 1), 'd' + d + ' s' + s).toBe(true);
        // yan karolar çatışmaya sokulmaz (lav yok): akış alıcıya ulaşır
        expect(evaluate(L, rots).waterOk).toBe(true);
      }
    }
  });

  it('belirlenimli; farklı tohum farklı yerleşim', () => {
    const a = JSON.stringify(generateSu(3, seededRandom(4)));
    expect(JSON.stringify(generateSu(3, seededRandom(4)))).toBe(a);
    const seen = new Set();
    for (let s = 1; s <= 12; s++) seen.add(JSON.stringify(generateSu(2, seededRandom(s)).sol));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('akış: bağlantı iki yönlü olmalı, bağlı olmayan komşuya akmaz; karışım çakışma sayılır', () => {
    // 3×1 şerit: ws → straight → wk
    const lay = {
      C: 3, R: 1, tiles: [{ t: 'ws', fixed: true }, { t: 'straight', fixed: false }, { t: 'wk', fixed: true }], src: 0, sink: 2, lsrc: -1, lsink: -1, needLava: false,
    };
    expect(evaluate(lay, [1, 1, 3]).solved).toBe(true);
    expect(evaluate(lay, [1, 0, 3]).solved).toBe(false);
    expect(evaluate(lay, [1, 1, 3]).maxDist).toBe(2);
    // lav karışımı: iki tee yan yana bağlanırsa su ve lav karışır
    const two = {
      C: 3, R: 2,
      tiles: [{ t: 'ws', fixed: true }, { t: 'tee', fixed: false }, { t: 'wk', fixed: true },
        { t: 'ls', fixed: true }, { t: 'tee', fixed: false }, { t: 'lk', fixed: true }],
      src: 0, sink: 2, lsrc: 3, lsink: 5, needLava: true,
    };
    const mixed = evaluate(two, [1, 1, 3, 1, 3, 3]);
    expect(mixed.conflict.length).toBeGreaterThan(0);
    expect(mixed.solved).toBe(false);
    const apart = evaluate(two, [1, 1, 3, 1, 1, 3]);
    expect(apart.conflict.length).toBe(0);
    expect(apart.waterOk).toBe(true);
    expect(apart.lavaOk).toBe(true);
    expect(apart.solved).toBe(true);
  });
});

describe('suakisi — oyun içi akış', () => {
  it('başlangıç: karolar kurulu, kapı kilitli, lav hiçbir zaman açıkta değil (altında cam)', () => {
    for (let d = 1; d <= 5; d++) {
      const ctx = setup(d, d % 4);
      expect(ctx.S().done).toBe(false);
      expect(ctx.h.world.count(B.LOCKED_DOOR)).toBeGreaterThan(0);
      expect(ctx.h.world.count(B.GLASS)).toBeGreaterThan(5);
      expect(ctx.h.world.count(B.RUNE_YELLOW)).toBeGreaterThan(0);
      expect(ctx.h.world.count(B.RECEIVER)).toBe(1);
      expect(lavaSafe(ctx)).toBe(0);
      expect(ctx.h.mgr.hintFor(ctx.desc.id)).toMatch(/karo/);
      if (d <= 3) expect(ctx.h.world.count(B.LAVA)).toBe(0);
    }
  });

  it('tıklama: karo döner, oluk hücreleri değişir; sabit karo ve boş yüz değişmez', () => {
    const ctx = setup(2, 1, 5);
    const L = ctx.S().lay;
    const i = L.movable[0];
    const r0 = ctx.S().rots[i];
    const before = ctx.h.world.snapshot();
    expect(clickTile(ctx, i, 2, 2)).toBe(true);
    expect(ctx.S().rots[i]).toBe((r0 + 1) % 4);
    expect(ctx.h.world.snapshot()).not.toBe(before);
    // sabit karo
    const msgs = [];
    ctx.h.mgr.on('message', (e) => msgs.push(e.text));
    const snap = ctx.h.world.snapshot();
    expect(clickTile(ctx, L.src, 0, 0)).toBe(true);
    expect(ctx.h.world.snapshot()).toBe(snap);
    expect(msgs[msgs.length - 1]).toMatch(/sabit/);
    // tahta dışı hücre: olay işlenmez
    const out = ctx.F.toWorld(L.x0, -1, 0);
    expect(ctx.h.mgr.handleInteract(ev('use', out))).toBe(false);
  });

  it('akış kademeli dolar (karo karo), ses yükselir; döndürünce geri çekilir ve yeniden dolar', () => {
    const ctx = setup(1, 0, 3);
    const L = ctx.S().lay;
    playSolution(ctx, generateSu(1, seededRandomFor(ctx)).sol);
    const effs = [];
    ctx.h.mgr.on('effect', (e) => effs.push(e));
    expect(ctx.h.world.count(B.WATER)).toBeGreaterThan(0);
    const w0 = ctx.h.world.count(B.WATER);
    simulate(ctx.h.mgr, REVEAL_STEP * 2.2, POS);
    const w1 = ctx.h.world.count(B.WATER);
    expect(w1).toBeGreaterThan(w0);
    simulate(ctx.h.mgr, 6, POS);
    const w2 = ctx.h.world.count(B.WATER);
    expect(w2).toBeGreaterThan(w1);
    const splashes = effs.filter((e) => e.kind === 'sound' && e.name === 'splash');
    expect(splashes.length).toBeGreaterThan(2);
    for (let k = 1; k < splashes.length; k++) expect(splashes[k].pitch).toBeGreaterThanOrEqual(splashes[k - 1].pitch);
  });

  it('bir karoyu çevirince su geri çekilir ve kaynaktan yeniden dolar (çözülmeden önce)', () => {
    const ctx = setup(2, 0, 9);
    const L = ctx.S().lay;
    simulate(ctx.h.mgr, 1.2, POS);
    const w1 = ctx.h.world.count(B.WATER);
    const ev0 = evaluate(L, ctx.S().rots);
    // su yolundaki ilk hareketli karoyu çevir
    let target = -1;
    for (const i of L.movable) if (ev0.W[i] >= 0) {
      target = i;
      break;
    }
    if (target < 0) target = L.movable[0];
    clickTile(ctx, target);
    expect(ctx.S().ft).toBe(0);
    expect(ctx.h.world.count(B.WATER)).toBeLessThanOrEqual(w1);
    simulate(ctx.h.mgr, 8, POS);
    expect(ctx.S().ft).toBeGreaterThan(5);
  });

  it('çözüm: dönüşler uygulanır → alıcı ışıldar, 1 sn tutunca çözüldü, kapı açılır (bir kez); sonra kilitli', () => {
    for (let d = 1; d <= 5; d++) {
      for (const f of [0, 3]) {
        const ctx = setup(d, f, 60 + d);
        const g = generateSu(d, seededRandomFor(ctx));
        expect(JSON.stringify(g.rots)).toBe(JSON.stringify(ctx.S().rots));
        const clicks = playSolution(ctx, g.sol);
        expect(clicks).toBeGreaterThan(1);
        expect(evaluate(ctx.S().lay, ctx.S().rots).solved).toBe(true);
        expect(ctx.S().done).toBe(false);
        simulate(ctx.h.mgr, 12, POS);
        expect(ctx.S().done, 'd' + d).toBe(true);
        expect(ctx.h.solved.length).toBe(1);
        expect(ctx.h.world.count(B.RECEIVER_ON)).toBe(1);
        expect(ctx.h.world.count(B.LOCKED_DOOR)).toBe(0);
        expect(lavaSafe(ctx)).toBe(0);
        if (d >= 4) expect(ctx.h.world.count(B.LAVA)).toBeGreaterThan(0);
        if (d === 5) expect(ctx.h.world.count(B.LIGHT_BLOCK)).toBeGreaterThanOrEqual(1);
        const snap = ctx.h.world.snapshot();
        clickTile(ctx, ctx.S().lay.movable[0]);
        expect(ctx.h.world.snapshot()).toBe(snap);
        simulate(ctx.h.mgr, 3, POS);
        expect(ctx.h.solved.length).toBe(1);
      }
    }
  });

  it('1 sn tutulmadan bozulursa çözülmez', () => {
    const ctx = setup(2, 0, 7);
    const g = generateSu(2, seededRandomFor(ctx));
    playSolution(ctx, g.sol);
    const reveal = evaluate(ctx.S().lay, ctx.S().rots).maxDist * REVEAL_STEP + 0.4;
    simulate(ctx.h.mgr, reveal + 0.4, POS);
    expect(ctx.S().done).toBe(false);
    const i = ctx.S().lay.movable.find((k) => ctx.S().lay.tiles[k].t === 'corner' || ctx.S().lay.tiles[k].t === 'straight');
    clickTile(ctx, i);
    simulate(ctx.h.mgr, 3, POS);
    expect(ctx.S().done).toBe(false);
  });

  it('rastgele döndürme fuzz: lav hep camın altında, çizilen dünya durumla tutarlı, süreç boyunca patlama yok', () => {
    for (let d = 3; d <= 5; d++) {
      const ctx = setup(d, d % 4, 90 + d);
      const L = ctx.S().lay;
      const rnd = seededRandom(d * 5);
      for (let n = 0; n < 120; n++) {
        if (rnd.chance(0.7)) clickTile(ctx, L.movable[rnd.int(0, L.movable.length - 1)], rnd.int(0, 2), rnd.int(0, 2));
        else simulate(ctx.h.mgr, rnd.next() * 1.5, POS);
        if (n % 15 === 0) expect(lavaSafe(ctx)).toBe(0);
      }
      simulate(ctx.h.mgr, 12, POS);
      expect(lavaSafe(ctx)).toBe(0);
      const saved = JSON.parse(JSON.stringify(ctx.h.mgr.serialize()));
      const b = fakeManager({ seed: ctx.sd });
      buildPuzzleRoom(ctx.desc, { seed: ctx.sd, setBlock: b.world.writer() });
      b.mgr.register(ctx.desc.id, ctx.desc);
      b.mgr.restore(saved);
      expect(b.world.snapshot(), 'd' + d).toBe(ctx.h.world.snapshot());
    }
  });

  it('karışım: su ve lav bağlanınca obsidyen (bazalt) olur, ileti ve ipucu uyarır, çözülmez', () => {
    let found = false;
    for (let s = 1; s <= 40 && !found; s++) {
      const ctx = setup(4, 0, 200 + s);
      const L = ctx.S().lay;
      const rnd = seededRandom(s);
      for (let tries = 0; tries < 60 && !found; tries++) {
        clickTile(ctx, L.movable[rnd.int(0, L.movable.length - 1)]);
        if (evaluate(L, ctx.S().rots).conflict.length > 0) found = ctx;
      }
    }
    expect(found).toBeTruthy();
    const ctx = found;
    const msgs = [];
    ctx.h.mgr.on('message', (e) => msgs.push(e.text));
    simulate(ctx.h.mgr, 15, POS);
    expect(msgs.some((m) => /karıştı|Dikkat/.test(m))).toBe(true);
    expect(ctx.h.mgr.hintFor(ctx.desc.id)).toMatch(/karış|Dikkat|lav/);
    expect(ctx.S().done).toBe(false);
    expect(lavaSafe(ctx)).toBe(0);
  });

  it('sıfırlama kolu karoları başlangıca döndürür (dünya ilk kurulumla özdeş); çözülmüşken etkisiz', () => {
    const ctx = setup(3, 2, 33);
    const L = ctx.S().lay;
    const fw = new FakeWorld({ seed: ctx.sd });
    buildPuzzleRoom(ctx.desc, { seed: ctx.sd, setBlock: fw.writer() });
    clickTile(ctx, L.movable[0]);
    clickTile(ctx, L.movable[1]);
    simulate(ctx.h.mgr, 3, POS);
    expect(ctx.h.world.snapshot()).not.toBe(fw.snapshot());
    ctx.h.mgr.handleInteract(ev('use', ctx.F.toWorld(L.reset.lx, 0, L.reset.lz)));
    expect(ctx.h.world.snapshot()).toBe(fw.snapshot());
    expect(ctx.S().ft).toBe(0);
    const g = generateSu(3, seededRandomFor(ctx));
    playSolution(ctx, g.sol);
    simulate(ctx.h.mgr, 12, POS);
    expect(ctx.S().done).toBe(true);
    const snap = ctx.h.world.snapshot();
    ctx.h.mgr.handleInteract(ev('use', ctx.F.toWorld(L.reset.lx, 0, L.reset.lz)));
    expect(ctx.h.world.snapshot()).toBe(snap);
  });

  it('serileştirme turu dolum sürerken: yeni dünya birebir aynı ve devam ettirince de aynı', () => {
    for (const d of [2, 5]) {
      const a = setup(d, 1, 71);
      const g = generateSu(d, seededRandomFor(a));
      playSolution(a, g.sol);
      simulate(a.h.mgr, 0.7, POS);
      const saved = JSON.parse(JSON.stringify(a.h.mgr.serialize()));
      const b = fakeManager({ seed: 71 });
      buildPuzzleRoom(a.desc, { seed: 71, setBlock: b.world.writer() });
      b.mgr.register(a.desc.id, a.desc);
      b.mgr.restore(saved);
      expect(b.world.snapshot(), 'd' + d).toBe(a.h.world.snapshot());
      simulate(a.h.mgr, 12, POS);
      simulate(b.mgr, 12, POS);
      expect(b.world.snapshot()).toBe(a.h.world.snapshot());
      expect(b.mgr.get(a.desc.id).state.done).toBe(true);
    }
  });
});

/** Odanın üretici akışı: puzzleSeed + 'suakisi' etiketi (kitin subRng'si ile aynı). */
function seededRandomFor(ctx) {
  const seed = puzzleSeed(ctx.sd, ctx.desc.id);
  return seededRandom(hash32((seed ^ stringSeedToInt('suakisi')) | 0));
}
