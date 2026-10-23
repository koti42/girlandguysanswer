import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeCtx, fakeManager, frame, getPuzzle, simulate,
} from './index.js';
import { frontToBack } from './kitP1Walk.js';
import impl from './basincplakasi.js';

const TYPE = 'basincplakasi';

function setup(difficulty, seed, facing) {
  const world = new FakeWorld({ seed });
  const ctx = fakeCtx({
    world, seed, id: 'bp', origin: { x: 20, y: 30, z: 20 }, facing: facing || 0, difficulty, zone: 1,
  });
  const res = impl.build(ctx);
  return { world, ctx, state: res.state, F: frame(ctx), res };
}

/** Yerel (lx,lz) hücresine plaka/kasa olayı. */
function ev(F, type, lx, lz, extra, ly) {
  const w = F.toWorld(lx, ly || 0, lz);
  return Object.assign({ type, x: w.x, y: w.y, z: w.z }, extra);
}

function localDirToWorld(F, dx, dz) {
  return F.dir(dx, dz);
}

/** Kasayı yerel yönde itme olayı (dünya yönü ile). */
function push(ctx, state, F, lx, lz, dx, dz) {
  const wd = localDirToWorld(F, dx, dz);
  state.cool = 0;
  return impl.interact(ctx, state, ev(F, 'use', lx, lz, { dx: wd.dx, dz: wd.dz }));
}

function applyFx(world, effects) {
  for (const e of effects) {
    if (e.kind === 'setBlock') world.setBlock(e.x, e.y, e.z, e.id, { record: false, silent: true });
  }
}

function run(ctx, state, seconds, holdFn) {
  const dt = 1 / 60;
  const out = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    if (holdFn) holdFn(i);
    const r = impl.tick(ctx, state, dt);
    if (r.effects.length) out.push(...r.effects);
  }
  return out;
}

/** Bölüm çözümü: kasaları plakalara (öncelik ağır>hafif>zamanlı) taşı, kalanlara oyuncu basar. */
function solveZone(h, zi) {
  const { ctx, state, F, world } = h;
  const Zn = state.L.zones[zi];
  const order = { a: 0, h: 1, t: 2 };
  const plates = Zn.plates.slice().sort((a, b) => order[a.k] - order[b.k]);
  const crates = state.crates.filter((c) => c[2] === zi);
  const assigned = [];
  // kasa i → plaka i (ağır önce); önce hepsi yanal, sonra ileri
  const n = Math.min(plates.length, crates.length);
  for (let i = 0; i < n; i++) assigned.push({ c: crates[i], p: plates[i] });
  for (const a of assigned) {
    const step = Math.sign(a.p.x - a.c[0]);
    while (a.c[0] !== a.p.x) {
      const r = push(ctx, state, F, a.c[0], a.c[1], step, 0);
      applyFx(world, r.effects);
    }
  }
  for (const a of assigned) {
    while (a.c[1] !== a.p.z) {
      const r = push(ctx, state, F, a.c[0], a.c[1], 0, 1);
      applyFx(world, r.effects);
    }
  }
  // kasasız kalan plakalara oyuncu: hafif → dur; zamanlı → koşarak
  const rest = plates.slice(n);
  const timed = rest.filter((p) => p.k === 't');
  const lights = rest.filter((p) => p.k === 'h');
  expect(rest.filter((p) => p.k === 'a').length).toBe(0);
  expect(lights.length).toBeLessThanOrEqual(1);
  for (const p of timed) {
    applyFx(world, impl.interact(ctx, state, ev(F, 'step', p.x, p.z)).effects);
    applyFx(world, run(ctx, state, 0.5));
  }
  const standOn = lights[0];
  const frames = Math.round(1.2 * 60);
  for (let i = 0; i < frames; i++) {
    if (standOn) impl.interact(ctx, state, ev(F, 'step', standOn.x, standOn.z));
    const r = impl.tick(ctx, state, 1 / 60);
    applyFx(world, r.effects);
  }
  applyFx(world, run(ctx, state, 1.5));
}

describe('basincplakasi: uyumluluk', () => {
  it('kit uyumluluk denetiminden geçer (tüm zorluklar × yönler)', () => {
    expect(getPuzzle(TYPE)).toBeTruthy();
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 120000);

  it('footprint zorlukla büyür ve oda boyutlarıyla uyuşur', () => {
    let prev = 0;
    for (let d = 1; d <= 5; d++) {
      const fp = impl.footprint(d);
      expect(fp.h).toBeGreaterThanOrEqual(3);
      expect(fp.w * fp.d).toBeGreaterThanOrEqual(prev);
      prev = fp.w * fp.d;
    }
  });
});

describe('basincplakasi: belirlenimlilik ve serileştirme', () => {
  it('aynı tohum → aynı yerleşim ve aynı bloklar; farklı tohum → farklı', () => {
    const a = setup(4, 7);
    const b = setup(4, 7);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.world.snapshot()).toBe(b.world.snapshot());
    const c = setup(4, 8);
    expect(JSON.stringify(c.state.L)).not.toBe(JSON.stringify(a.state.L));
  });

  it('state JSON turu bozulmaz; restore dünyayı aynı kurar', () => {
    for (let d = 1; d <= 5; d++) {
      const h = setup(d, 3);
      const before = h.world.snapshot();
      const st = JSON.parse(JSON.stringify(h.state));
      impl.restore(h.ctx, st);
      expect(h.world.snapshot()).toBe(before);
    }
  });

  it('başlangıçta çözülmemiş; ipucu Türkçe metin', () => {
    for (let d = 1; d <= 5; d++) {
      const h = setup(d, 11);
      expect(impl.isSolved(h.state)).toBe(false);
      expect(impl.hint(h.state).length).toBeGreaterThan(30);
      expect(impl.hint(h.state)).toMatch(/plaka/);
    }
  });
});

describe('basincplakasi: adalet / çözülebilirlik', () => {
  it('her zorlukta bölüm başına yeterli blok var ve ağır plaka sayısı ≤ blok sayısı', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 20; seed++) {
        const { state } = setup(d, seed);
        for (const Zn of state.L.zones) {
          const heavy = Zn.plates.filter((p) => p.k === 'a').length;
          const light = Zn.plates.filter((p) => p.k === 'h').length;
          const crates = state.crates.filter((c) => c[2] === state.L.zones.indexOf(Zn)).length;
          expect(crates).toBeGreaterThanOrEqual(heavy + Math.max(0, light - 1));
          expect(Zn.plates.some((p) => p.k !== 'a')).toBe(true);
          // plaka sütunları ≥3 arayla (süs örtüşmez), kasa başlangıçları plaka halkasına değmez
          const xs = Zn.plates.map((p) => p.x).sort((a, b) => a - b);
          for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('programatik çözüm: her zorluk, birçok tohum, tüm yönler → çözülür, kapı açılır', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 6; seed++) {
        const h = setup(d, seed * 13, seed % 4);
        for (let z = 0; z < h.state.L.zones.length; z++) {
          expect(impl.isSolved(h.state)).toBe(false);
          solveZone(h, z);
          expect(h.state.zs[z]).toBe(1);
        }
        expect(impl.isSolved(h.state)).toBe(true);
        const door = h.res.anchors.door;
        for (const c of door.cells) expect(h.world.getBlock(c.x, c.y, c.z)).toBe(0);
        // restore sonrası da açık ve plakalar yanık
        const st = JSON.parse(JSON.stringify(h.state));
        impl.restore(h.ctx, st);
        for (const c of door.cells) expect(h.world.getBlock(c.x, c.y, c.z)).toBe(0);
      }
    }
  });

  it('yön verilmeden sağ tık (otomatik itme) de odayı çözer', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 4; seed++) {
        const h = setup(d, seed * 5);
        const { ctx, state, F, world } = h;
        for (let z = 0; z < state.L.zones.length; z++) {
          const Zn = state.L.zones[z];
          // her kasa için hedefe varana dek 'use'
          for (let guard = 0; guard < 400; guard++) {
            let moved = false;
            for (let c = 0; c < state.crates.length; c++) {
              const cr = state.crates[c];
              if (cr[2] !== z) continue;
              const before = cr[0] + ',' + cr[1];
              const r = impl.interact(ctx, state, ev(F, 'use', cr[0], cr[1]));
              applyFx(world, r.effects);
              if (state.crates[c] && (state.crates[c][0] + ',' + state.crates[c][1]) !== before) moved = true;
            }
            if (!moved) break;
          }
          // kasasız plakalara oyuncu
          const free = Zn.plates.filter((p) => !state.crates.some((c) => c[0] === p.x && c[1] === p.z));
          const lights = free.filter((p) => p.k === 'h');
          expect(free.filter((p) => p.k === 'a').length).toBe(0);
          expect(lights.length).toBeLessThanOrEqual(1);
          for (const p of free.filter((q) => q.k === 't')) {
            impl.interact(ctx, state, ev(F, 'step', p.x, p.z));
            applyFx(world, run(ctx, state, 0.3));
          }
          for (let i = 0; i < 90; i++) {
            if (lights[0]) impl.interact(ctx, state, ev(F, 'step', lights[0].x, lights[0].z));
            applyFx(world, impl.tick(ctx, state, 1 / 60).effects);
          }
          applyFx(world, run(ctx, state, 1.2));
          expect(state.zs[z]).toBe(1);
        }
        expect(impl.isSolved(state)).toBe(true);
      }
    }
  });
});

describe('basincplakasi: mekanik', () => {
  it('ağır plakaya basmak işe yaramaz; kasa yarar', () => {
    let h = null;
    let plate = null;
    for (let seed = 1; seed < 60 && !plate; seed++) {
      h = setup(3, seed);
      plate = h.state.L.zones[1].plates.find((p) => p.k === 'a');
    }
    expect(plate).toBeTruthy();
    // bölüm 0'ı çöz, sonra ağır plakada dur
    solveZone(h, 0);
    for (let i = 0; i < 120; i++) {
      impl.interact(h.ctx, h.state, ev(h.F, 'step', plate.x, plate.z));
      impl.tick(h.ctx, h.state, 1 / 60);
    }
    const idx = h.state.L.zones[1].po + h.state.L.zones[1].plates.indexOf(plate);
    expect(h.state.vs[idx]).toBe(0);
    expect(h.state.hold[idx]).toBe(0);
  });

  it('zamanlı plaka ayrılınca süre boyunca yanık kalır, sonra söner', () => {
    let h = null;
    let plate = null;
    for (let seed = 1; seed < 60 && !plate; seed++) {
      h = setup(4, seed);
      plate = h.state.L.zones[0].plates.find((p) => p.k === 't');
    }
    expect(plate).toBeTruthy();
    const idx = h.state.L.zones[0].po + h.state.L.zones[0].plates.indexOf(plate);
    impl.interact(h.ctx, h.state, ev(h.F, 'step', plate.x, plate.z));
    applyFx(h.world, run(h.ctx, h.state, 0.1));
    expect(h.state.vs[idx]).toBeGreaterThan(0);
    expect(h.world.getBlock(...Object.values(h.F.toWorld(plate.x, 0, plate.z)))).toBe(B.PRESSURE_PLATE_ON);
    applyFx(h.world, run(h.ctx, h.state, h.state.L.T * 0.5));
    expect(h.state.vs[idx]).toBeGreaterThan(0);
    expect(h.state.vs[idx]).toBeLessThan(8);
    applyFx(h.world, run(h.ctx, h.state, h.state.L.T));
    expect(h.state.vs[idx]).toBe(0);
    expect(h.world.getBlock(...Object.values(h.F.toWorld(plate.x, 0, plate.z)))).toBe(B.PRESSURE_PLATE);
  });

  it('kasa duvara/kapıya itilemez, sınırda durur; sıkışınca otomatik yeniden doğar', () => {
    const h = setup(2, 9);
    const { ctx, state, F, world } = h;
    const c0 = state.crates[0];
    // sola doğru duvara kadar it
    let guard = 0;
    while (guard++ < 30) {
      const r = push(ctx, state, F, state.crates[0][0], state.crates[0][1], -1, 0);
      applyFx(world, r.effects);
      if (r.effects.some((e) => e.kind === 'message')) break;
    }
    expect(state.crates[0][0]).toBeGreaterThanOrEqual(state.L.x0);
    // kasa duvar sütununda: artık hiçbir plakaya ulaşamaz → bloklar sayıdan az kalınca otomatik yeniden doğurma
    const initial = [c0[0], c0[1]];
    const msgs = [];
    for (let i = 0; i < state.crates.length; i++) {
      for (let k = 0; k < 20; k++) {
        const r = push(ctx, state, F, state.crates[i][0], state.crates[i][1], -1, 0);
        applyFx(world, r.effects);
        for (const e of r.effects) if (e.kind === 'message') msgs.push(e.text);
      }
    }
    expect(msgs.some((m) => /sıkıştı/.test(m))).toBe(true);
    // yeniden doğduktan sonra kasalar başlangıç konumlarında
    const home = state.L.zones[0].crates;
    const now = state.crates.filter((c) => c[2] === 0).map((c) => c[0] + ',' + c[1]);
    expect(now.length).toBe(home.length);
    expect(initial.length).toBe(2);
  });

  it('duvar kolu bloğu yeniden doğurur', () => {
    const h = setup(2, 4);
    const { ctx, state, F, world } = h;
    const home = state.L.zones[0].crates.map((c) => c[0] + ',' + c[1]);
    const r = push(ctx, state, F, state.crates[0][0], state.crates[0][1], 0, 1);
    applyFx(world, r.effects);
    const lever = ev(F, 'use', state.L.x1, 0);
    const out = impl.interact(ctx, state, lever);
    applyFx(world, out.effects);
    expect(out.effects.some((e) => e.kind === 'message')).toBe(true);
    expect(state.crates.map((c) => c[0] + ',' + c[1])).toEqual(home);
    // dünya durumla uyumlu
    const snap = world.snapshot();
    impl.restore(ctx, JSON.parse(JSON.stringify(state)));
    expect(world.snapshot()).toBe(snap);
  });

  it('oyuncunun kırdığı/koyduğu dinamik blok geri yüklenir', () => {
    const h = setup(1, 2);
    const p = h.state.L.zones[0].plates[0];
    const e = ev(h.F, 'blockPlaced', p.x, p.z);
    const r = impl.interact(h.ctx, h.state, e);
    expect(r.effects).toEqual([{ kind: 'setBlock', x: e.x, y: e.y, z: e.z, id: B.PRESSURE_PLATE }]);
  });

  it('manager ile uçtan uca: çöz → puzzleSolved bir kez, serialize/restore turu', () => {
    const h = fakeManager({ seed: 5 });
    const desc = {
      id: 'bp#1', type: TYPE, origin: { x: 40, y: 30, z: 40 }, facing: 2, difficulty: 3, zone: 1,
    };
    buildPuzzleRoom(desc, { seed: 5, setBlock: h.world.writer() });
    const view = h.mgr.register(desc.id, desc);
    const F = frame({ origin: desc.origin, facing: desc.facing, seed: 0, setBlock: () => {} });
    const st = view.state;
    // bölüm 0'ı manager üzerinden çöz
    const Zn = st.L.zones[0];
    const crates = st.crates.filter((c) => c[2] === 0);
    const order = { a: 0, h: 1, t: 2 };
    const plates = Zn.plates.slice().sort((a, b) => order[a.k] - order[b.k]);
    for (let i = 0; i < Math.min(crates.length, plates.length); i++) {
      const c = crates[i];
      const p = plates[i];
      while (c[0] !== p.x) {
        const wd = F.dir(Math.sign(p.x - c[0]), 0);
        const w = F.toWorld(c[0], 0, c[1]);
        h.mgr.get(desc.id).state.cool = 0;
        h.mgr.handleInteract({ type: 'use', x: w.x, y: w.y, z: w.z, dx: wd.dx, dz: wd.dz });
      }
    }
    for (let i = 0; i < Math.min(crates.length, plates.length); i++) {
      const c = crates[i];
      const p = plates[i];
      while (c[1] !== p.z) {
        const wd = F.dir(0, 1);
        const w = F.toWorld(c[0], 0, c[1]);
        h.mgr.get(desc.id).state.cool = 0;
        h.mgr.handleInteract({ type: 'use', x: w.x, y: w.y, z: w.z, dx: wd.dx, dz: wd.dz });
      }
    }
    const rest = plates.slice(Math.min(crates.length, plates.length));
    const standing = rest.find((p) => p.k === 'h');
    for (const p of rest.filter((q) => q.k === 't')) {
      const w = F.toWorld(p.x, 0, p.z);
      h.mgr.step(w.x, w.y, w.z);
      simulate(h.mgr, 0.2, w);
    }
    const sp = standing ? F.toWorld(standing.x, 0, standing.z) : F.toWorld(0, 0, 0);
    for (let i = 0; i < 90; i++) {
      if (standing) h.mgr.step(sp.x, sp.y, sp.z);
      h.mgr.update(1 / 60, sp);
    }
    simulate(h.mgr, 2, sp);
    expect(h.mgr.get(desc.id).state.zs[0]).toBe(1);
    expect(h.solved.length).toBe(0); // 2. bölüm var
    const saved = JSON.parse(JSON.stringify(h.mgr.serialize()));
    const h2 = fakeManager({ seed: 5 });
    buildPuzzleRoom(desc, { seed: 5, setBlock: h2.world.writer() });
    h2.mgr.register(desc.id, desc);
    h2.mgr.restore(saved);
    expect(JSON.stringify(h2.mgr.serialize())).toBe(JSON.stringify(saved));
    expect(h2.world.snapshot()).toBe(h.world.snapshot());
  });

  it('kapı duvarı ilerlemeyi kilitler: bölüm çözülmeden kapı hücreleri doludur ve animasyonla açılır', () => {
    const h = setup(3, 6);
    const Zn = h.state.L.zones[0];
    const wallCell = h.F.toWorld(0, 1, Zn.gz);
    expect(h.world.getBlock(wallCell.x, wallCell.y, wallCell.z)).toBe(B.LOCKED_DOOR);
    solveZone(h, 0);
    expect(h.state.gate[0]).toBe(3);
    expect(h.world.getBlock(wallCell.x, wallCell.y, wallCell.z)).toBe(0);
    const lintel = h.F.toWorld(0, 3, Zn.gz);
    expect(h.world.getBlock(lintel.x, lintel.y, lintel.z)).toBe(B.LIGHT_BLOCK);
  });
});

describe('basincplakasi: erişim', () => {
  it('çözülmeden arka kapıya yürünemez; çözülünce ön kapıdan arka kapıya düz yürüyüşle ulaşılır', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 3; seed++) {
        const h = setup(d, seed * 11, seed % 4);
        expect(frontToBack(h.world, h.F, h.state.L.d)).toBe(false);
        for (let z = 0; z < h.state.L.zones.length; z++) solveZone(h, z);
        expect(frontToBack(h.world, h.F, h.state.L.d)).toBe(true);
      }
    }
  });

  it('kasalar kapı duvarından geçemez (kapı sırası hep boş kalır)', () => {
    const h = setup(3, 2);
    const Zn = h.state.L.zones[0];
    solveZone(h, 0);
    const cr = h.state.crates.find((c) => c[2] === 0);
    // kasayı kapıya doğru sürekli it
    for (let i = 0; i < 25; i++) {
      const r = push(h.ctx, h.state, h.F, cr[0], cr[1], 0, 1);
      applyFx(h.world, r.effects);
    }
    expect(h.state.crates.every((c) => c[1] !== Zn.gz)).toBe(true);
  });

  it('ağır plakayı yaratık (entity) tutar, oyuncu adımı tutmaz', () => {
    let h = null;
    let idx = -1;
    for (let seed = 1; seed < 80 && idx < 0; seed++) {
      h = setup(4, seed);
      const Zn = h.state.L.zones[1];
      idx = Zn.plates.findIndex((p) => p.k === 'a');
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    solveZone(h, 0);
    const Zn = h.state.L.zones[1];
    const p = Zn.plates[idx];
    impl.interact(h.ctx, h.state, ev(h.F, 'step', p.x, p.z));
    expect(h.state.hold[Zn.po + idx]).toBe(0);
    impl.interact(h.ctx, h.state, ev(h.F, 'entity', p.x, p.z));
    expect(h.state.hold[Zn.po + idx]).toBeGreaterThan(0);
    run(h.ctx, h.state, 0.05);
    expect(h.state.vs[Zn.po + idx]).toBe(1);
  });
});
