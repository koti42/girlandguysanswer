import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { DenseChunk } from '../denseChunk.js';
import { ZONE_COUNT } from '../constants.js';
import {
  FACINGS, FakeWorld, THEMES, applyEffects, buildChamber, chainOrigin, chamberChainOffset, chunkWriter,
  doorEffects, fakeCtx, frame, fx, localDir, localToWorld, localXRange, makeCtx, normFacing, puzzleRng,
  puzzleSeed, resolveTheme, roomBounds, setDoorOpen, subRng, themeForZone, worldDirToLocal, worldToLocal,
} from './kit.js';

/** Hava hücrelerinde 2 yüksekliğinde baş boşluğu + zemin desteğiyle BFS erişilebilirlik. */
function reachable(world, start, limit) {
  const walk = (x, y, z) => world.getBlock(x, y, z) === 0 && world.getBlock(x, y + 1, z) === 0
    && world.getBlock(x, y - 1, z) !== 0;
  const seen = new Set();
  const q = [start];
  seen.add(start.x + ',' + start.y + ',' + start.z);
  while (q.length) {
    const c = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx;
      const nz = c.z + dz;
      const k = nx + ',' + c.y + ',' + nz;
      if (seen.has(k) || Math.abs(nx - start.x) > limit || Math.abs(nz - start.z) > limit) continue;
      if (walk(nx, c.y, nz)) {
        seen.add(k);
        q.push({ x: nx, y: c.y, z: nz });
      }
    }
  }
  return seen;
}

function prefill(world, box, id) {
  for (let x = box.x0; x <= box.x1; x++) {
    for (let z = box.z0; z <= box.z1; z++) {
      for (let y = box.y0; y <= box.y1; y++) world.setBlock(x, y, z, id, { record: false, silent: true });
    }
  }
}

describe('geometri', () => {
  it('yerel→dünya ve geri, her facing için tersinir; dönme ayna değil', () => {
    for (let f = 0; f < 4; f++) {
      const o = { x: 5, y: 20, z: -7 };
      for (const [lx, ly, lz] of [[0, 0, 0], [3, 2, 5], [-2, 1, 9]]) {
        const w = localToWorld(o, f, lx, ly, lz);
        const l = worldToLocal(o, f, w.x, w.y, w.z);
        expect([l.x, l.y, l.z]).toEqual([lx, ly, lz]);
      }
      const fw = FACINGS[f];
      // sağ × ileri (yukarıdan bakış) her facing'de aynı el yönelimi: rx*fz - rz*fx = −1 (facing 0: 1*1-0 = 1)
      expect(fw.rx * fw.fz - fw.rz * fw.fx).toBe(1);
    }
    expect(localToWorld({ x: 0, y: 0, z: 0 }, 0, 0, 0, 3)).toEqual({ x: 0, y: 0, z: 3 });
    expect(localToWorld({ x: 0, y: 0, z: 0 }, 1, 0, 0, 3)).toEqual({ x: -3, y: 0, z: 0 });
    expect(localToWorld({ x: 0, y: 0, z: 0 }, 2, 0, 0, 3)).toEqual({ x: 0, y: 0, z: -3 });
    expect(localToWorld({ x: 0, y: 0, z: 0 }, 3, 0, 0, 3)).toEqual({ x: 3, y: 0, z: 0 });
    expect(localDir(1, 0, 1)).toEqual({ dx: -1, dz: 0 });
    expect(worldDirToLocal(1, -1, 0)).toEqual({ x: 0, z: 1 });
  });

  it('normFacing ve localXRange', () => {
    expect(normFacing(-1)).toBe(3);
    expect(normFacing(5)).toBe(1);
    expect(normFacing(NaN)).toBe(0);
    expect(localXRange(7)).toEqual({ x0: -3, x1: 3 });
    expect(localXRange(6)).toEqual({ x0: -2, x1: 3 });
  });

  it('frame: fill/hollow/line/ring/doorway/plate/lever; clip sonucu değiştirmez', () => {
    const ctx = fakeCtx({ origin: { x: 0, y: 10, z: 0 }, facing: 1 });
    const F = frame(ctx);
    expect(F.fill(0, 0, 0, 2, 1, 3, B.STONE)).toBe(3 * 2 * 4);
    expect(ctx.world.count(B.STONE)).toBe(24);
    F.carve(1, 0, 1, 1, 1, 1);
    expect(ctx.world.count(B.STONE)).toBe(22);
    expect(F.hollow(10, 0, 10, 12, 2, 12, B.BRICK)).toBe(27 - 1);
    expect(F.line(0, 5, 0, 6, 5, 0, B.PILLAR)).toBe(7);
    F.ring(0, 8, 0, 3, B.POLISHED, 'xz');
    expect(ctx.world.count(B.POLISHED)).toBeGreaterThan(8);
    F.plate(5, 0, 5, false);
    F.lever(6, 0, 5, true);
    expect(ctx.world.count(B.PRESSURE_PLATE)).toBe(1);
    expect(ctx.world.count(B.LEVER_ON)).toBe(1);
    const box = F.doorway({ lx: 0, lz: 20, width: 3, height: 3, depth: 2, fillId: B.LOCKED_DOOR });
    expect(box).toEqual({ x0: -1, y0: 0, z0: 20, x1: 1, y1: 2, z1: 21 });
    expect(ctx.world.count(B.LOCKED_DOOR)).toBe(18);
    expect(() => F.set(0, 0, 0, 999)).toThrow();

    // clip: tam kurulumun kesişimi ile aynı
    const full = fakeCtx({ origin: { x: 3, y: 10, z: 3 }, facing: 2 });
    frame(full).fill(-3, 0, 0, 3, 2, 8, B.BRICK);
    const clipped = fakeCtx({
      origin: { x: 3, y: 10, z: 3 }, facing: 2, clip: { x0: -2, z0: -3, x1: 4, z1: 1 },
    });
    frame(clipped).fill(-3, 0, 0, 3, 2, 8, B.BRICK);
    const inClip = (c) => c.x >= -2 && c.x <= 4 && c.z >= -3 && c.z <= 1;
    expect(clipped.world.cells(B.BRICK)).toEqual(full.world.cells(B.BRICK).filter(inClip));
    expect(clipped.world.count(B.BRICK)).toBeGreaterThan(0);
  });

  it('roomBounds iç/dış kutu', () => {
    const b = roomBounds({ x: 0, y: 10, z: 0 }, 0, { w: 7, d: 9, h: 5 }, 2);
    expect(b.inner).toEqual({ x0: -3, y0: 10, z0: 0, x1: 3, y1: 14, z1: 8 });
    expect(b.outer).toEqual({ x0: -5, y0: 8, z0: -2, x1: 5, y1: 16, z1: 10 });
    const r = roomBounds({ x: 0, y: 10, z: 0 }, 1, { w: 7, d: 9, h: 5 }, 2);
    expect(r.inner.x0).toBe(-8);
    expect(r.inner.x1).toBe(0);
  });
});

describe('temalar', () => {
  it('her bölge için tema var, kimlikler geçerli, zemin kaygan/hasarlı değil', () => {
    expect(THEMES.length).toBe(ZONE_COUNT);
    for (const t of THEMES) {
      for (const k of ['wall', 'wallAlt', 'floor', 'floorAlt', 'base', 'ceiling', 'pillar', 'glow', 'light', 'torch', 'lock']) {
        expect(Number.isInteger(t[k]) && t[k] > 0 && t[k] <= 127).toBe(true);
      }
      expect(t.light === B.LANTERN || t.light === B.TORCH).toBe(true);
    }
    expect(themeForZone(-3).key).toBe('harabe');
    expect(themeForZone(99).key).toBe('golge');
    expect(resolveTheme('buz').zone).toBe(3);
    expect(resolveTheme(undefined, 2).key).toBe('kumtasi');
    expect(resolveTheme(1).key).toBe('yosunlu');
  });
});

describe('buildChamber', () => {
  const sizes = [[7, 7, 5], [5, 9, 4], [9, 5, 6], [3, 3, 3], [6, 8, 5]];

  it('her facing × bölge × boyutta: iç hava, zemin dolu, ön kapı açık, her yer erişilebilir', () => {
    for (let facing = 0; facing < 4; facing++) {
      for (let zone = 0; zone < ZONE_COUNT; zone++) {
        const [w, d, h] = sizes[(facing + zone) % sizes.length];
        const ctx = fakeCtx({
          origin: { x: 100, y: 40, z: -60 }, facing, zone, id: 'c' + facing + zone,
        });
        prefill(ctx.world, { x0: 70, y0: 30, z0: -95, x1: 130, y1: 60, z1: -25 }, B.STONE);
        const c = buildChamber(ctx, { w, d, h });
        const xr = localXRange(w);
        const F = frame(ctx);
        for (let lx = xr.x0; lx <= xr.x1; lx++) {
          for (let lz = 0; lz < d; lz++) {
            for (let ly = 0; ly < h; ly++) {
              const p = F.toWorld(lx, ly, lz);
              expect(ctx.world.getBlock(p.x, p.y, p.z)).toBe(0);
            }
            const f = F.toWorld(lx, -1, lz);
            expect(ctx.world.getBlock(f.x, f.y, f.z)).toBeGreaterThan(0);
            const f2 = F.toWorld(lx, -2, lz);
            expect(ctx.world.getBlock(f2.x, f2.y, f2.z)).toBeGreaterThan(0);
          }
        }
        // ön kapı: açıklık hava, çıkış yaklaşımından oda merkezine yürünebilir
        expect(c.doorFront.open).toBe(true);
        for (const cell of c.doorFront.cells) expect(ctx.world.getBlock(cell.x, cell.y, cell.z)).toBe(0);
        const start = F.toWorld(0, 0, -4);
        const seen = reachable(ctx.world, start, 40);
        for (let lx = xr.x0; lx <= xr.x1; lx++) {
          for (let lz = 0; lz < d; lz++) {
            const p = F.toWorld(lx, 0, lz);
            expect(seen.has(p.x + ',' + p.y + ',' + p.z)).toBe(true);
          }
        }
        // iç kutu / dış kutu tutarlı
        expect(c.innerWorld.y1 - c.innerWorld.y0 + 1).toBe(c.h);
        expect(c.outerWorld.x1 - c.outerWorld.x0).toBe(c.innerWorld.x1 - c.innerWorld.x0 + 4);
        expect(c.outerWorld.z1 - c.outerWorld.z0).toBe(c.innerWorld.z1 - c.innerWorld.z0 + 4);
      }
    }
  });

  it('arka kapı: kilitli / açık / yok; doorEffects ve setDoorOpen çalışır', () => {
    const mk = (mode) => {
      const ctx = fakeCtx({ origin: { x: 0, y: 20, z: 0 }, facing: 0, zone: 2 });
      const c = buildChamber(ctx, { w: 7, d: 7, h: 5, doorBack: mode });
      return { ctx, c };
    };
    const none = mk(false);
    expect(none.c.doorBack).toBeNull();
    expect(none.ctx.world.getBlock(0, 20, 7)).toBeGreaterThan(0);
    const locked = mk('locked');
    expect(locked.c.doorBack.open).toBe(false);
    for (const cell of locked.c.doorBack.cells) {
      expect(locked.ctx.world.getBlock(cell.x, cell.y, cell.z)).toBe(B.LOCKED_DOOR);
    }
    expect(locked.c.doorBack.cells.length).toBe(3 * 3 * 2);
    // açma: efektler
    const fw = locked.ctx.world;
    const out = applyEffects({ setBlock: (x, y, z, id) => fw.setBlock(x, y, z, id) }, doorEffects(locked.c.doorBack, true));
    expect(out.applied).toBe(18);
    for (const cell of locked.c.doorBack.cells) expect(fw.getBlock(cell.x, cell.y, cell.z)).toBe(0);
    setDoorOpen(locked.ctx, locked.c.doorBack, false);
    expect(fw.count(B.LOCKED_DOOR)).toBe(18);
    const open = mk('open');
    expect(open.c.doorBack.open).toBe(true);
    for (const cell of open.c.doorBack.cells) expect(open.ctx.world.getBlock(cell.x, cell.y, cell.z)).toBe(0);
    // arka kapı açıkken arkadaki yaklaşımdan içeri yürünür
    const start = frame(open.ctx).toWorld(0, 0, 7 + 3);
    const seen = reachable(open.ctx.world, start, 30);
    expect(seen.has('0,20,3')).toBe(true);
  });

  it('ışık: fener oyukları var; ışıksız seçenek; ışık sayısı sınırlanır', () => {
    const ctx = fakeCtx({ origin: { x: 0, y: 20, z: 0 }, facing: 0 });
    const c = buildChamber(ctx, { w: 9, d: 9, h: 5 });
    expect(c.lights.length).toBeGreaterThanOrEqual(4);
    expect(ctx.world.count(B.LANTERN)).toBe(c.lights.length);
    const few = fakeCtx({ origin: { x: 0, y: 20, z: 0 }, facing: 0 });
    const c2 = buildChamber(few, { w: 9, d: 9, h: 5, lights: 2 });
    expect(c2.lights.length).toBe(2);
    const none = fakeCtx({ origin: { x: 0, y: 20, z: 0 }, facing: 0 });
    buildChamber(none, { w: 9, d: 9, h: 5, lights: 0 });
    expect(none.world.count(B.LANTERN)).toBe(0);
  });

  it('belirlenimli: aynı girdi → aynı bloklar; tema farkı → farklı', () => {
    const run = (zone, facing) => {
      const ctx = fakeCtx({ origin: { x: 8, y: 30, z: 8 }, facing, zone, id: 'same' });
      buildChamber(ctx, { w: 7, d: 7, h: 5, doorBack: 'locked' });
      return ctx.world.snapshot();
    };
    expect(run(1, 2)).toBe(run(1, 2));
    expect(run(0, 0)).not.toBe(run(3, 0));
    expect(run(0, 0).length).toBeGreaterThan(1000);
  });

  it('chunk-kesitli kurulum, tam kurulumun aynısını verir (chunk sınırını aşan oda)', () => {
    const origin = { x: 13, y: 40, z: 14 };
    for (const facing of [0, 1, 2, 3]) {
      const full = fakeCtx({ origin, facing, zone: 1, id: 'slice' });
      buildChamber(full, { w: 9, d: 9, h: 5, doorBack: 'locked' });
      const merged = new Map();
      for (let cx = -1; cx <= 2; cx++) {
        for (let cz = -1; cz <= 3; cz++) {
          const chunk = new DenseChunk(cx, cz, 128);
          const wr = chunkWriter(chunk);
          const ctx = makeCtx({
            id: 'slice', worldSeed: full.world.seed, origin, facing, zone: 1,
            setBlock: wr.setBlock, getBlock: wr.getBlock, clip: wr.clip,
          });
          buildChamber(ctx, { w: 9, d: 9, h: 5, doorBack: 'locked' });
          for (let i = 0; i < chunk.blocks.length; i++) {
            const id = chunk.blocks[i];
            if (id === 0) continue;
            const lx = i & 15;
            const lz = (i >> 4) & 15;
            const y = i >> 8;
            merged.set((cx * 16 + lx) + ',' + y + ',' + (cz * 16 + lz), id);
          }
        }
      }
      // tam kurulumda hava yazımları (0) dünyada saklanmaz; chunk'ta da 0 yok → doğrudan karşılaştırılabilir
      expect(merged.size).toBe(full.world.blocks.size);
      full.world.blocks.forEach((id, k) => expect(merged.get(k)).toBe(id));
    }
  });

  it('zincirleme odalar arasında kesintisiz koridor', () => {
    const o1 = { x: 0, y: 30, z: 0 };
    const w = new FakeWorld();
    const a = makeCtx({ id: 'a', world: w, origin: o1, facing: 0, zone: 0, setBlock: w.writer() });
    buildChamber(a, { w: 7, d: 7, h: 5, doorBack: 'open' });
    const o2 = chainOrigin(o1, 0, 7);
    expect(o2.z).toBe(chamberChainOffset(7));
    const b = makeCtx({ id: 'b', world: w, origin: o2, facing: 0, zone: 0, setBlock: w.writer() });
    buildChamber(b, { w: 5, d: 5, h: 4 });
    const seen = reachable(w, { x: 0, y: 30, z: -4 }, 60);
    expect(seen.has('0,30,' + (o2.z + 2))).toBe(true);
  });
});

describe('rng', () => {
  it('puzzleRng belirlenimli ve konumdan bağımsız; subRng ana akıştan bağımsız', () => {
    const a = puzzleRng(5, 'x:1');
    const b = puzzleRng(5, 'x:1');
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(puzzleSeed(5, 'x:1')).not.toBe(puzzleSeed(5, 'x:2'));
    expect(puzzleSeed(5, 'x:1')).not.toBe(puzzleSeed(6, 'x:1'));
    const c1 = fakeCtx({ id: 'q', origin: { x: 0, y: 5, z: 0 } });
    const c2 = fakeCtx({ id: 'q', origin: { x: 90, y: 5, z: 90 }, facing: 3 });
    expect(c1.rng.next()).toBe(c2.rng.next());
    c1.rng.next();
    c1.rng.next();
    expect(subRng(c1, 'ayna').next()).toBe(subRng(c2, 'ayna').next());
    expect(subRng(c1, 'ayna').next()).not.toBe(subRng(c1, 'kol').next());
  });
});

describe('efektler', () => {
  it('uygular, geçersizleri atlar, işaretleri ve olayları döner', () => {
    const writes = [];
    const seen = [];
    const spawns = [];
    const target = {
      setBlock: (x, y, z, id) => writes.push([x, y, z, id]),
      spawnEntity: (...a) => spawns.push(a),
      onEffect: (e) => seen.push(e),
    };
    const out = applyEffects(target, [
      fx.setBlock(1, 2, 3, B.LEVER_ON),
      fx.setBlocks([[4, 5, 6, B.STONE], [0.5, 1, 1, 1], [1, 1, 1, 300]]),
      fx.sound('tık', 1, 2, 3),
      fx.particles('kıvılcım', 1, 2, 3, 0xff00ff),
      fx.message('Doğru!'),
      fx.message(''),
      fx.spawn('golge', 1, 2, 3),
      fx.giveItem('item:elma'),
      { kind: 'bilinmeyen', a: 1 },
      { kind: 'setBlock', x: 1.5, y: 2, z: 3, id: 1 },
      null,
      fx.solved(),
      fx.reset(),
    ], { puzzleId: 'p' });
    expect(writes).toEqual([[1, 2, 3, B.LEVER_ON], [4, 5, 6, B.STONE]]);
    expect(spawns.length).toBe(1);
    expect(out.solved).toBe(true);
    expect(out.reset).toBe(true);
    expect(out.skipped).toBe(5);
    expect(seen.map((e) => e.kind)).toEqual(['sound', 'particles', 'message', 'spawn', 'giveItem', 'bilinmeyen']);
    expect(seen.every((e) => e.puzzleId === 'p')).toBe(true);
    expect(out.events.length).toBe(6);
    expect(applyEffects(null, [fx.solved()]).solved).toBe(false);
  });
});
