import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeCtx, fakeManager, frame, getPuzzle, simulate,
} from './index.js';
import { DICE, SHAPES3 } from './kitP1Common.js';
import { frontToBack } from './kitP1Walk.js';
import impl from './kodkilidi.js';

const TYPE = 'kodkilidi';
const KEY_X = [-4, 0, 4];
const PIP_Z = [16, 20];
const MOSAIC = [B.COPPER_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.DIAMOND_BLOCK, B.AMETHYST, B.CRYSTAL_ROCK];

function setup(difficulty, seed, facing) {
  const world = new FakeWorld({ seed });
  const ctx = fakeCtx({
    world, seed, id: 'kk', origin: { x: -12, y: 30, z: 33 }, facing: facing || 0, difficulty, zone: 4,
  });
  const res = impl.build(ctx);
  return {
    world, ctx, state: res.state, F: frame(ctx), res,
  };
}

function apply(h, effects) {
  for (const e of effects) if (e.kind === 'setBlock') h.world.setBlock(e.x, e.y, e.z, e.id, { record: false, silent: true });
}

function press(h, v) {
  const w = h.F.toWorld(KEY_X[(v - 1) % 3], -1, PIP_Z[(v - 1) / 3 | 0] + 1);
  const out = impl.interact(h.ctx, h.state, {
    type: 'use', x: w.x, y: w.y, z: w.z,
  });
  apply(h, out.effects);
  return out;
}

function enter(h, digits) {
  let last = null;
  for (const v of digits) last = press(h, v);
  return last;
}

function tickFor(h, seconds) {
  const effects = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const out = impl.tick(h.ctx, h.state, 1 / 60);
    apply(h, out.effects);
    effects.push(...out.effects);
  }
  return effects;
}

/* --- Oyuncu gibi: yalnızca DÜNYADAKİ bloklardan kodu çöz --- */
function blockAt(h, lx, ly, lz) {
  const w = h.F.toWorld(lx, ly, lz);
  return h.world.getBlock(w.x, w.y, w.z);
}

function readBits(h, cells, on) {
  return cells.map((c) => (blockAt(h, c[0], c[1], c[2]) === on ? 'X' : '.')).join('');
}

function decodeFromWorld(h) {
  const { state } = h;
  // legend: şekil bit eşlemi → zar yüzü
  const legend = [];
  for (const z of [3, 7]) {
    const gCells = [];
    const dCells = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        gCells.push([-3 + c, -1, z + r]);
        dCells.push([1 + c, -1, z + r]);
      }
    }
    const gBits = readBits(h, gCells, B.LIGHT_BLOCK);
    const dBits = readBits(h, dCells, B.LIGHT_BLOCK);
    const shape = SHAPES3.findIndex((s) => s.rows.join('') .replace(/X/g, 'X') === gBits);
    const face = DICE.findIndex((rows, i) => i > 0 && rows.join('') === dBits);
    legend.push({ shape, face });
  }
  const digits = new Array(state.N).fill(0);
  for (let s = 0; s < state.N; s++) {
    // panelin konumu (sade okuma: yan duvar, 6 hücrelik adım)
    const lx = s % 2 === 0 ? state.x0 : state.x1;
    const lz0 = 2 + 6 * (s >> 1);
    // sıra: üst şeritte yanan kare sayısı
    let lit = 0;
    for (let c = 0; c < 5; c++) if (blockAt(h, lx, 5, lz0 + c) === B.LIGHT_BLOCK) lit++;
    const order = lit - 1;
    // içerik türü: meşale var mı / mozaik var mı / parlak şekil mi
    let torches = 0;
    for (let c = 1; c <= 3; c++) {
      if (blockAt(h, lx, 2, lz0 + c) === B.TORCH) torches++;
      if (blockAt(h, lx, 4, lz0 + c) === B.TORCH) torches++;
    }
    const sample = blockAt(h, lx, 4, lz0 + 2);
    let value = 0;
    if (blockAt(h, lx, 1, lz0 + 1) === B.POLISHED) {
      value = torches;
    } else if (MOSAIC.indexOf(sample) >= 0) {
      let n = 0;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (blockAt(h, lx, 2 - r, lz0 + 1 + c) === sample) n++;
      value = n;
    } else {
      const cells = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push([lx, 2 - r, lz0 + 1 + c]);
      const bits = readBits(h, cells, B.LIGHT_BLOCK);
      const shape = SHAPES3.findIndex((q) => q.rows.join('') === bits);
      const e = legend.find((q) => q.shape === shape);
      value = e ? e.face : 0;
    }
    digits[order] = value;
  }
  return digits;
}

describe('kodkilidi: uyumluluk', () => {
  it('kit uyumluluk denetiminden geçer', () => {
    expect(getPuzzle(TYPE)).toBeTruthy();
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 180000);
});

describe('kodkilidi: üretim ve çözülebilirlik', () => {
  it('belirlenimli: aynı tohum aynı kod/ipucu/dünya; farklı tohum farklı', () => {
    for (let d = 1; d <= 5; d++) {
      const a = setup(d, 31);
      const b = setup(d, 31);
      expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
      expect(a.world.snapshot()).toBe(b.world.snapshot());
    }
    expect(setup(3, 1).state.code).not.toEqual(setup(3, 2).state.code);
  });

  it('basamak sayısı 3,3,4,4,5; her basamak 1..6; ipucu türleri çeşitli; sembol ≤ 2', () => {
    const ns = [];
    for (let d = 1; d <= 5; d++) {
      ns.push(setup(d, 4).state.N);
      for (let seed = 1; seed <= 40; seed++) {
        const { state } = setup(d, seed);
        expect(state.code.every((v) => v >= 1 && v <= 6)).toBe(true);
        expect(state.clues.filter((c) => c.k === 'g').length).toBeLessThanOrEqual(2);
        expect(state.legend.length).toBe(2);
        expect(new Set(state.legend.map((e) => e.g)).size).toBe(2);
        const kinds = new Set(state.clues.map((c) => c.k));
        expect(kinds.size).toBe(Math.min(3, state.N));
      }
    }
    expect(ns).toEqual([3, 3, 4, 4, 5]);
  });

  it('KANIT: yalnızca dünyadaki bloklardan okunan ipuçları gerçek kodu verir (her zorluk × 40 tohum × yön)', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 40; seed++) {
        const h = setup(d, seed * 5, seed % 4);
        expect(decodeFromWorld(h)).toEqual(h.state.code);
      }
    }
  });
});

describe('kodkilidi: oynanış', () => {
  it('doğru kod kilidi açar, kapıyı açar; sonraki tuşlar etkisiz; restore aynı dünya', () => {
    for (let d = 1; d <= 5; d++) {
      const h = setup(d, 9, d % 4);
      const out = enter(h, h.state.code);
      expect(impl.isSolved(h.state)).toBe(true);
      expect(out.effects.some((e) => e.kind === 'message' && /Kod doğru/.test(e.text))).toBe(true);
      for (const c of h.res.anchors.door.cells) expect(h.world.getBlock(c.x, c.y, c.z)).toBe(0);
      const snap = h.world.snapshot();
      press(h, 1);
      expect(h.world.snapshot()).toBe(snap);
      impl.restore(h.ctx, JSON.parse(JSON.stringify(h.state)));
      expect(h.world.snapshot()).toBe(snap);
    }
  });

  it('yanlış kod: hak azalır, ileti kalan hakkı söyler, giriş sıfırlanır', () => {
    const h = setup(2, 5);
    const wrong = h.state.code.map((v) => (v % 6) + 1);
    const out = enter(h, wrong);
    expect(out.effects.some((e) => e.kind === 'sound' && e.name === 'puzzle_wrong')).toBe(true);
    expect(out.effects.find((e) => e.kind === 'message').text).toMatch(/2 deneme hakkın kaldı/);
    expect(h.state.tries).toBe(2);
    expect(h.state.entered).toEqual([]);
    expect(impl.isSolved(h.state)).toBe(false);
  });

  it('haklar bitince kilit soğur (tuşlar kırmızı), bekleme süresince girişler reddedilir; sonra yeniden açılır — asla kalıcı değil', () => {
    const h = setup(3, 7);
    const wrong = h.state.code.map((v) => (v % 6) + 1);
    for (let i = 0; i < 3; i++) enter(h, wrong);
    expect(h.state.cool).toBe(h.state.cd);
    expect(h.state.tries).toBe(0);
    const key = h.F.toWorld(-5, -1, 16);
    expect(h.world.getBlock(key.x, key.y, key.z)).toBe(B.CONCRETE_RED);
    const out = press(h, h.state.code[0]);
    expect(out.effects.some((e) => e.kind === 'message' && /soğuyor/.test(e.text))).toBe(true);
    expect(h.state.entered).toEqual([]);
    const eff = tickFor(h, h.state.cd + 0.5);
    expect(eff.some((e) => e.kind === 'message' && /Kilit soğudu/.test(e.text))).toBe(true);
    expect(h.state.cool).toBe(0);
    expect(h.state.tries).toBe(3);
    expect(h.world.getBlock(key.x, key.y, key.z)).toBe(B.CONCRETE_BLUE);
    // artık doğru kod çalışır
    enter(h, h.state.code);
    expect(impl.isSolved(h.state)).toBe(true);
  });

  it('ekrana dokunmak girişi siler; boşken etkisiz', () => {
    const h = setup(2, 3);
    press(h, 2);
    expect(h.state.entered).toEqual([2]);
    const w = h.F.toWorld(0, -1, 13);
    const out = impl.interact(h.ctx, h.state, {
      type: 'use', x: w.x, y: w.y, z: w.z,
    });
    apply(h, out.effects);
    expect(h.state.entered).toEqual([]);
    expect(out.effects.some((e) => e.kind === 'message' && /silindi/.test(e.text))).toBe(true);
    const out2 = impl.interact(h.ctx, h.state, {
      type: 'use', x: w.x, y: w.y, z: w.z,
    });
    expect(out2.effects).toEqual([]);
  });

  it('zar tuşunun her hücresi çalışır; ekran son basılan zarı gösterir', () => {
    const h = setup(2, 3);
    for (let v = 1; v <= 6; v++) {
      const cx = KEY_X[(v - 1) % 3];
      const z0 = PIP_Z[(v - 1) / 3 | 0];
      for (const [dx, dz] of [[-1, 0], [1, 2], [0, 1]]) {
        h.state.entered = [];
        const w = h.F.toWorld(cx + dx, -1, z0 + dz);
        apply(h, impl.interact(h.ctx, h.state, {
          type: 'use', x: w.x, y: w.y, z: w.z,
        }).effects);
        expect(h.state.entered).toEqual([v]);
      }
      const dice = DICE[v];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const b = h.F.toWorld(-1 + c, -1, 12 + r);
          expect(h.world.getBlock(b.x, b.y, b.z)).toBe(dice[r].charAt(c) === 'X' ? B.LIGHT_BLOCK : B.CONCRETE_BLACK);
        }
      }
    }
  });

  it('ilerleme çubuğu giriş sayısı kadar parlar; hak hücreleri azalır', () => {
    const h = setup(4, 6);
    const pip = (i) => {
      const w = h.F.toWorld(-((h.state.N - 1) >> 1) + i, -1, 11);
      return h.world.getBlock(w.x, w.y, w.z);
    };
    expect(pip(0)).not.toBe(B.LIGHT_BLOCK);
    press(h, 1);
    expect(pip(0)).toBe(B.LIGHT_BLOCK);
    expect(pip(1)).not.toBe(B.LIGHT_BLOCK);
  });

  it('ipucu Türkçe, basamak sayısını ve hakkı söyler', () => {
    const h = setup(4, 2);
    expect(impl.hint(h.state)).toMatch(/4 basamağı/);
    expect(impl.hint(h.state)).toMatch(/3 deneme hakkın var/);
  });

  it('oyuncunun kırdığı dinamik blok geri yüklenir', () => {
    const h = setup(2, 2);
    const w = h.F.toWorld(h.state.x0, 0, 3);
    const out = impl.interact(h.ctx, h.state, {
      type: 'blockBroken', x: w.x, y: w.y, z: w.z,
    });
    expect(out.effects.length).toBe(1);
    expect(out.effects[0].kind).toBe('setBlock');
  });
});

describe('kodkilidi: manager', () => {
  it('soğuma sırasında kayıt → yükleme: durum korunur; sonra çözülür', () => {
    const h = fakeManager({ seed: 4 });
    const desc = {
      id: 'kk#1', type: TYPE, origin: { x: 60, y: 30, z: 60 }, facing: 1, difficulty: 3, zone: 2,
    };
    buildPuzzleRoom(desc, { seed: 4, setBlock: h.world.writer() });
    const initial = h.world.snapshot();
    const view = h.mgr.register(desc.id, desc);
    const F = frame({ origin: desc.origin, facing: desc.facing, seed: 0, setBlock: () => {} });
    const pressM = (mgr, v) => {
      const w = F.toWorld(KEY_X[(v - 1) % 3], -1, PIP_Z[(v - 1) / 3 | 0] + 1);
      mgr.handleInteract({ type: 'use', ...w });
    };
    const code = view.state.code.slice();
    const wrong = code.map((v) => (v % 6) + 1);
    for (let i = 0; i < 3; i++) for (const v of wrong) pressM(h.mgr, v);
    expect(h.mgr.get(desc.id).state.cool).toBeGreaterThan(0);
    simulate(h.mgr, 2, F.toWorld(0, 0, 5));
    const saved = JSON.parse(JSON.stringify(h.mgr.serialize()));
    const h2 = fakeManager({ seed: 4 });
    buildPuzzleRoom(desc, { seed: 4, setBlock: h2.world.writer() });
    h2.mgr.register(desc.id, desc);
    h2.mgr.restore(saved);
    expect(h2.world.snapshot()).toBe(h.world.snapshot());
    expect(h2.mgr.get(desc.id).state.cool).toBeCloseTo(h.mgr.get(desc.id).state.cool, 5);
    simulate(h2.mgr, 25, F.toWorld(0, 0, 5));
    expect(h2.mgr.get(desc.id).state.cool).toBe(0);
    for (const v of code) pressM(h2.mgr, v);
    expect(h2.solved.length).toBe(1);
    // reset (çözülmemiş h): ilk dünya
    expect(h.mgr.reset(desc.id)).toBe(true);
    expect(h.world.snapshot()).toBe(initial);
  });
});

describe('kodkilidi: erişim', () => {
  it('çözülmeden arka kapı kilitli; çözülünce düz yürüyüşle ulaşılır; ön kapıdan içeri girilir', () => {
    for (let d = 1; d <= 5; d++) {
      const h = setup(d, 12 + d, d % 4);
      expect(frontToBack(h.world, h.F, 24)).toBe(false);
      enter(h, h.state.code);
      expect(frontToBack(h.world, h.F, 24)).toBe(true);
    }
  });
});
