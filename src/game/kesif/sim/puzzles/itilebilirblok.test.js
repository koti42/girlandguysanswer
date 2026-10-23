import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeCtx, fakeManager, frame, getPuzzle,
} from './index.js';
import { DIRS4, makeGrid, reachable, verifySolution } from './kitP1Soko.js';
import { frontToBack } from './kitP1Walk.js';
import impl from './itilebilirblok.js';

const TYPE = 'itilebilirblok';

function setup(difficulty, seed, facing) {
  const world = new FakeWorld({ seed });
  const ctx = fakeCtx({
    world, seed, id: 'sk', origin: { x: 5, y: 30, z: -25 }, facing: facing || 0, difficulty, zone: 0,
  });
  const res = impl.build(ctx);
  return {
    world, ctx, state: res.state, F: frame(ctx), res,
  };
}

function apply(h, effects) {
  for (const e of effects) if (e.kind === 'setBlock') h.world.setBlock(e.x, e.y, e.z, e.id, { record: false, silent: true });
}

function cellOf(h, gx, gz) {
  return h.F.toWorld(h.state.x0 + 1 + gx, 0, 2 + gz);
}

/** Izgara (gx,gz) bloğunu (dx,dz) yerel yönünde it (dünya yönü ile). */
function push(h, gx, gz, dx, dz) {
  const w = cellOf(h, gx, gz);
  const wd = h.F.dir(dx, dz);
  h.state.cool = 0;
  const out = impl.interact(h.ctx, h.state, {
    type: 'step', x: w.x, y: w.y, z: w.z, dx: wd.dx, dz: wd.dz,
  });
  apply(h, out.effects);
  return out;
}

function lever(h, which) {
  const w = h.F.toWorld(which === 'undo' ? h.state.x0 : h.state.x1, 0, 0);
  const out = impl.interact(h.ctx, h.state, {
    type: 'use', x: w.x, y: w.y, z: w.z,
  });
  apply(h, out.effects);
  return out;
}

function playSolution(h) {
  for (const p of h.state.sol) push(h, p[0], p[1], p[2], p[3]);
}

/** Bağımsız Sokoban çözücü (BFS; kutu + oyuncu bölgesi durumu). Küçük seviyeler için. */
function solvable(state, limit) {
  const { GW, GZ } = state;
  const walls = state.walls;
  const ts = new Set(state.targets.map((t) => t[0] + ',' + t[1]));
  const norm = (boxes, px, pz) => {
    const g = makeGrid(GW, GZ, walls, boxes);
    const reach = reachable(GW, GZ, g, px, pz);
    let min = null;
    reach.forEach((k) => {
      if (min === null || k < min) min = k;
    });
    const bs = boxes.map((b) => b[0] + ',' + b[1]).sort().join('|');
    return bs + '#' + min;
  };
  // oyuncu başlangıcı: ızgara ön sırasından (gz=0) ulaşılabilen herhangi bir hücre
  const g0 = makeGrid(GW, GZ, walls, state.boxes);
  let start = null;
  for (let x = 0; x < GW && !start; x++) if (g0.free(x, 0)) start = [x, 0];
  if (!start) return false;
  const seen = new Set([norm(state.boxes, start[0], start[1])]);
  let frontier = [{ boxes: state.boxes.map((b) => [b[0], b[1]]), p: start }];
  let count = 0;
  while (frontier.length && count < limit) {
    const next = [];
    for (const s of frontier) {
      if (s.boxes.every((b) => ts.has(b[0] + ',' + b[1]))) return true;
      const g = makeGrid(GW, GZ, walls, s.boxes);
      const reach = reachable(GW, GZ, g, s.p[0], s.p[1]);
      for (let bi = 0; bi < s.boxes.length; bi++) {
        for (let d = 0; d < 4; d++) {
          const [dx, dz] = DIRS4[d];
          const b = s.boxes[bi];
          if (!reach.has((b[0] - dx) + ',' + (b[1] - dz))) continue;
          if (!g.free(b[0] + dx, b[1] + dz)) continue;
          const nb = s.boxes.map((q) => [q[0], q[1]]);
          nb[bi] = [b[0] + dx, b[1] + dz];
          const key = norm(nb, b[0], b[1]);
          if (seen.has(key)) continue;
          seen.add(key);
          count++;
          next.push({ boxes: nb, p: [b[0], b[1]] });
        }
      }
    }
    frontier = next;
  }
  return false;
}

describe('itilebilirblok: uyumluluk', () => {
  it('kit uyumluluk denetiminden geçer', () => {
    expect(getPuzzle(TYPE)).toBeTruthy();
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 180000);
});

describe('itilebilirblok: üretim ve çözülebilirlik', () => {
  it('belirlenimli: aynı tohum aynı seviye ve dünya', () => {
    for (let d = 1; d <= 5; d++) {
      const a = setup(d, 14);
      const b = setup(d, 14);
      expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
      expect(a.world.snapshot()).toBe(b.world.snapshot());
    }
    expect(JSON.stringify(setup(3, 1).state.boxes)).not.toBe(JSON.stringify(setup(3, 2).state.boxes));
  });

  it('kutu sayısı 1..5, ızgara büyür, başlangıç çözülmemiş', () => {
    const counts = [];
    for (let d = 1; d <= 5; d++) {
      const { state } = setup(d, 3);
      counts.push(state.boxes.length);
      expect(state.targets.length).toBe(state.boxes.length);
      expect(impl.isSolved(state)).toBe(false);
      expect(state.sol.length).toBeGreaterThanOrEqual([2, 5, 9, 14, 20][d - 1]);
    }
    expect(counts).toEqual([1, 2, 3, 4, 5]);
  });

  it('her zorluk × 60 tohum: kayıtlı çözüm bağımsız ileri simülasyonla doğrulanır', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 60; seed++) {
        const { state } = setup(d, seed);
        // oyuncu başlangıcını ızgara ön sırasından bul: ilk itmenin gerisi ulaşılabilir olmalı
        const g = makeGrid(state.GW, state.GZ, state.walls, state.boxes);
        let ok = false;
        for (let x = 0; x < state.GW && !ok; x++) {
          for (let z = 0; z < state.GZ && !ok; z++) {
            if (!g.free(x, z)) continue;
            if (verifySolution(state.GW, state.GZ, state.walls, state.targets, state.boxes, state.sol, [x, z])) ok = true;
          }
        }
        expect(ok).toBe(true);
        // kutular ve hedefler duvar üstünde değil; ızgara içinde
        for (const b of state.boxes.concat(state.targets)) {
          expect(b[0]).toBeGreaterThanOrEqual(0);
          expect(b[0]).toBeLessThan(state.GW);
          expect(b[1]).toBeGreaterThanOrEqual(0);
          expect(b[1]).toBeLessThan(state.GZ);
          expect(state.walls.some((w) => w[0] === b[0] && w[1] === b[1])).toBe(false);
        }
      }
    }
  });

  it('küçük seviyelerde (d1, d2) tam BFS çözücü de çözülebilirliği doğrular', () => {
    for (let d = 1; d <= 2; d++) {
      for (let seed = 1; seed <= 25; seed++) {
        expect(solvable(setup(d, seed).state, 60000)).toBe(true);
      }
    }
  });

  it('d3 seviyeleri için de BFS çözücü (sınırlı) çözüm bulur', () => {
    for (let seed = 1; seed <= 3; seed++) {
      expect(solvable(setup(3, seed).state, 600000)).toBe(true);
    }
  }, 120000);
});

describe('itilebilirblok: oynanış', () => {
  it('kayıtlı çözümü oyna → çözülür, arka kapı açılır, fenerler yanar (tüm zorluk/yönler)', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 6; seed++) {
        const h = setup(d, seed * 3, seed % 4);
        playSolution(h);
        expect(impl.isSolved(h.state)).toBe(true);
        for (const c of h.res.anchors.door.cells) expect(h.world.getBlock(c.x, c.y, c.z)).toBe(0);
        for (const b of h.state.boxes) {
          const w = cellOf(h, b[0], b[1]);
          expect(h.world.getBlock(w.x, w.y, w.z)).toBe(B.PUSH_BLOCK);
          expect(h.world.getBlock(w.x, w.y + 1, w.z)).toBe(B.LANTERN);
        }
        const snap = h.world.snapshot();
        impl.restore(h.ctx, JSON.parse(JSON.stringify(h.state)));
        expect(h.world.snapshot()).toBe(snap);
      }
    }
  });

  it('itme: blok bir hücre kayar, dünya bloğu taşınır; duvar/blok/ızgara dışı engeller', () => {
    const h = setup(2, 5);
    const b = h.state.boxes[0].slice();
    const w0 = cellOf(h, b[0], b[1]);
    expect(h.world.getBlock(w0.x, w0.y, w0.z)).toBe(B.PUSH_BLOCK);
    let moved = false;
    for (const [dx, dz] of DIRS4) {
      const nx = b[0] + dx;
      const nz = b[1] + dz;
      const g = makeGrid(h.state.GW, h.state.GZ, h.state.walls, h.state.boxes);
      if (!g.free(nx, nz)) {
        push(h, b[0], b[1], dx, dz);
        expect(h.state.boxes[0]).toEqual(b);
        continue;
      }
      push(h, b[0], b[1], dx, dz);
      if (h.state.boxes[0][0] !== b[0] || h.state.boxes[0][1] !== b[1]) {
        moved = true;
        const w1 = cellOf(h, h.state.boxes[0][0], h.state.boxes[0][1]);
        expect(h.world.getBlock(w1.x, w1.y, w1.z)).toBe(B.PUSH_BLOCK);
        expect(h.world.getBlock(w0.x, w0.y, w0.z)).not.toBe(B.PUSH_BLOCK);
        break;
      }
    }
    expect(moved).toBe(true);
  });

  it('yönsiz sağ tık bloğu odanın içine (+lz) iter; yönsiz yürüme yok sayılır', () => {
    const h = setup(1, 3);
    const b = h.state.boxes[0].slice();
    const w = cellOf(h, b[0], b[1]);
    const none = impl.interact(h.ctx, h.state, {
      type: 'step', x: w.x, y: w.y, z: w.z,
    });
    expect(none.handled).toBe(false);
    expect(h.state.boxes[0]).toEqual(b);
    const g = makeGrid(h.state.GW, h.state.GZ, h.state.walls, h.state.boxes);
    if (g.free(b[0], b[1] + 1)) {
      apply(h, impl.interact(h.ctx, h.state, {
        type: 'use', x: w.x, y: w.y, z: w.z,
      }).effects);
      expect(h.state.boxes[0]).toEqual([b[0], b[1] + 1]);
    }
  });

  it('oyuncu konumu (px,pz) ile de yön belirlenir', () => {
    const h = setup(1, 8);
    const b = h.state.boxes[0].slice();
    const g = makeGrid(h.state.GW, h.state.GZ, h.state.walls, h.state.boxes);
    if (!g.free(b[0] + 1, b[1])) return;
    const w = cellOf(h, b[0], b[1]);
    // oyuncu yerel −x tarafında → blok yerel +x'e gider
    const pw = h.F.toWorld(h.state.x0 + 1 + b[0] - 1, 0, 2 + b[1]);
    apply(h, impl.interact(h.ctx, h.state, {
      type: 'step', x: w.x, y: w.y, z: w.z, px: pw.x + 0.5, pz: pw.z + 0.5,
    }).effects);
    expect(h.state.boxes[0]).toEqual([b[0] + 1, b[1]]);
  });

  it('geri al kolu son itmeyi geri alır; boş geçmişte ileti; sıfırla kolu reset efekti', () => {
    const h = setup(2, 9);
    const start = JSON.stringify(h.state.boxes);
    const snap = h.world.snapshot();
    const empty = lever(h, 'undo');
    expect(empty.effects.some((e) => e.kind === 'message' && /Geri alınacak/.test(e.text))).toBe(true);
    const sol = h.state.sol;
    push(h, sol[0][0], sol[0][1], sol[0][2], sol[0][3]);
    expect(JSON.stringify(h.state.boxes)).not.toBe(start);
    expect(h.state.hist.length).toBe(1);
    lever(h, 'undo');
    expect(JSON.stringify(h.state.boxes)).toBe(start);
    expect(h.world.snapshot()).toBe(snap);
    const r = lever(h, 'reset');
    expect(r.effects.some((e) => e.kind === 'reset')).toBe(true);
  });

  it('köşeye sıkıştıran hamle otomatik geri alınır (ileti + hata sesi)', () => {
    const h = setup(1, 5);
    const { state } = h;
    // blok ızgaranın sol-üst köşesinin yanına koyulur; hedef köşede değil
    state.walls.length = 0;
    state.targets[0] = [state.GW - 1, state.GZ - 2];
    state.boxes[0] = [1, 0];
    impl.restore(h.ctx, state);
    const out = push(h, 1, 0, -1, 0);
    expect(out.effects.some((e) => e.kind === 'message' && /geri alındı/.test(e.text))).toBe(true);
    expect(out.effects.some((e) => e.kind === 'sound' && e.name === 'puzzle_wrong')).toBe(true);
    expect(state.boxes[0]).toEqual([1, 0]);
    expect(state.pushes).toBe(0);
    const w = cellOf(h, 1, 0);
    expect(h.world.getBlock(w.x, w.y, w.z)).toBe(B.PUSH_BLOCK);
    const corner = cellOf(h, 0, 0);
    expect(h.world.getBlock(corner.x, corner.y, corner.z)).toBe(0);
    // hedefteki köşe serbest: blok hedefe giderse (köşe olsa bile) sorun yok
    state.targets[0] = [0, 0];
    impl.restore(h.ctx, state);
    push(h, 1, 0, -1, 0);
    expect(state.boxes[0]).toEqual([0, 0]);
    expect(impl.isSolved(state)).toBe(true);
  });

  it('ipucu Türkçe; hedef sayacı', () => {
    const h = setup(3, 4);
    expect(impl.hint(h.state)).toMatch(/Hedef dolu: [0-9]\/3/);
    expect(impl.hint(h.state)).toMatch(/geri alır/);
  });

  it('oyuncunun kırdığı dinamik blok geri yüklenir', () => {
    const h = setup(1, 2);
    const w = cellOf(h, h.state.targets[0][0], h.state.targets[0][1]);
    const out = impl.interact(h.ctx, h.state, {
      type: 'blockBroken', x: w.x, y: w.y, z: w.z,
    });
    expect(out.effects.length).toBe(1);
  });
});

describe('itilebilirblok: manager', () => {
  it('çözüm → puzzleSolved; serialize/restore turu; reset ilk dünya', () => {
    const h = fakeManager({ seed: 3 });
    const desc = {
      id: 'sk#1', type: TYPE, origin: { x: 50, y: 30, z: 50 }, facing: 3, difficulty: 3, zone: 0,
    };
    buildPuzzleRoom(desc, { seed: 3, setBlock: h.world.writer() });
    const initial = h.world.snapshot();
    const view = h.mgr.register(desc.id, desc);
    const F = frame({ origin: desc.origin, facing: desc.facing, seed: 0, setBlock: () => {} });
    const st = view.state;
    const pushM = (gx, gz, dx, dz) => {
      const w = F.toWorld(st.x0 + 1 + gx, 0, 2 + gz);
      const wd = F.dir(dx, dz);
      h.mgr.get(desc.id).state.cool = 0;
      h.mgr.handleInteract({
        type: 'step', x: w.x, y: w.y, z: w.z, dx: wd.dx, dz: wd.dz,
      });
    };
    const sol = JSON.parse(JSON.stringify(st.sol));
    pushM(...sol[0]);
    const saved = JSON.parse(JSON.stringify(h.mgr.serialize()));
    const h2 = fakeManager({ seed: 3 });
    buildPuzzleRoom(desc, { seed: 3, setBlock: h2.world.writer() });
    h2.mgr.register(desc.id, desc);
    h2.mgr.restore(saved);
    expect(h2.world.snapshot()).toBe(h.world.snapshot());
    expect(h.mgr.reset(desc.id)).toBe(true);
    expect(h.world.snapshot()).toBe(initial);
    for (const p of sol) pushM(...p);
    expect(h.solved.length).toBe(1);
    expect(h.mgr.get(desc.id).solved).toBe(true);
  });
});

describe('itilebilirblok: erişim', () => {
  it('çözülmeden arka kapı kilitli; çözülünce bloklar yerindeyken düz yürüyüşle ulaşılır', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 5; seed++) {
        const h = setup(d, seed * 7, seed % 4);
        expect(frontToBack(h.world, h.F, h.state.d)).toBe(false);
        playSolution(h);
        expect(frontToBack(h.world, h.F, h.state.d)).toBe(true);
      }
    }
  });
});
