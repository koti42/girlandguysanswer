import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeCtx, fakeManager, frame, getPuzzle,
} from './index.js';
import { COLORS, SHAPES3 } from './kitP1Common.js';
import { frontToBack } from './kitP1Walk.js';
import impl from './renkkollari.js';

const TYPE = 'renkkollari';

function setup(difficulty, seed, facing) {
  const world = new FakeWorld({ seed });
  const ctx = fakeCtx({
    world, seed, id: 'rk', origin: { x: 12, y: 30, z: -8 }, facing: facing || 0, difficulty, zone: 2,
  });
  const res = impl.build(ctx);
  return {
    world, ctx, state: res.state, F: frame(ctx), res,
  };
}

function apply(h, effects) {
  for (const e of effects) if (e.kind === 'setBlock') h.world.setBlock(e.x, e.y, e.z, e.id, { record: false, silent: true });
}

function pull(h, j) {
  const w = h.F.toWorld(h.state.x0, 0, 1 + 2 * j);
  const out = impl.interact(h.ctx, h.state, {
    type: 'use', x: w.x, y: w.y, z: w.z,
  });
  apply(h, out.effects);
  return out;
}

/** GF(2) üzerinde matrisin tersinir olduğunu bağımsız Gauss eleme ile doğrular. */
function invertibleGF2(T) {
  const n = T.length;
  const a = T.map((r) => r.slice());
  for (let c = 0; c < n; c++) {
    let p = -1;
    for (let r = c; r < n; r++) if (a[r][c]) { p = r; break; }
    if (p < 0) return false;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) {
      if (r !== c && a[r][c]) for (let k = 0; k < n; k++) a[r][k] ^= a[c][k];
    }
  }
  return true;
}

describe('renkkollari: uyumluluk', () => {
  it('kit uyumluluk denetiminden geçer', () => {
    expect(getPuzzle(TYPE)).toBeTruthy();
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 120000);
});

describe('renkkollari: üretim ve çözülebilirlik kanıtı', () => {
  it('belirlenimli: aynı tohum aynı düzen; farklı tohum farklı', () => {
    const a = setup(4, 33);
    const b = setup(4, 33);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.world.snapshot()).toBe(b.world.snapshot());
    expect(JSON.stringify(setup(4, 34).state)).not.toBe(JSON.stringify(a.state));
  });

  it('kol/kristal sayısı zorlukla artar (3,4,5,6,6) ve çapraz bağlantı vardır', () => {
    const ms = [];
    for (let d = 1; d <= 5; d++) {
      ms.push(setup(d, 3).state.m);
      for (let seed = 1; seed <= 25; seed++) {
        const { state } = setup(d, seed);
        const links = state.T.reduce((n, r) => n + r.reduce((a, b) => a + b, 0), 0) - state.m;
        if (d >= 2) expect(links).toBeGreaterThan(0);
      }
    }
    expect(ms).toEqual([3, 4, 5, 6, 6]);
  });

  it('her tohumda matris tersinir, başlangıç çözülmemiş, sol kümesi çözüm veriyor', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 60; seed++) {
        const { state } = setup(d, seed);
        expect(invertibleGF2(state.T)).toBe(true);
        expect(state.s.some((v) => v === 0)).toBe(true);
        expect(impl.isSolved(state)).toBe(false);
        // çözüm kümesini uygula
        const s = state.s.slice();
        for (let j = 0; j < state.m; j++) if (state.sol[j]) for (let i = 0; i < state.m; i++) s[i] ^= state.T[j][i];
        expect(s.every((v) => v === 1)).toBe(true);
        // benzersizlik: başka hiçbir küme çözmez (tersinir)
        let solutions = 0;
        for (let mask = 0; mask < (1 << state.m); mask++) {
          const t = state.s.slice();
          for (let j = 0; j < state.m; j++) if (mask & (1 << j)) for (let i = 0; i < state.m; i++) t[i] ^= state.T[j][i];
          if (t.every((v) => v === 1)) solutions++;
        }
        expect(solutions).toBe(1);
      }
    }
  });

  it('renk + şekil benzersiz: her kristal ayrı renk ve ayrı zemin şekli', () => {
    for (let d = 1; d <= 5; d++) {
      const { state, world, F } = setup(d, 9);
      expect(new Set(state.cols).size).toBe(state.m);
      expect(new Set(state.cols.map((c) => COLORS[c].shape)).size).toBe(state.m);
      expect(new Set(SHAPES3.map((s) => s.rows.join('/'))).size).toBe(SHAPES3.length);
      // dünya: kristal tabanı renkli beton, açıklar
      for (let i = 0; i < state.m; i++) {
        const lx = -Math.floor((3 * (state.m - 1)) / 2) + 3 * i;
        const w = F.toWorld(lx, 0, state.cz);
        expect(world.getBlock(w.x, w.y, w.z)).toBe(COLORS[state.cols[i]].concrete);
      }
    }
  });

  it('ipucu Türkçe ve kol sırası verir', () => {
    const { state } = setup(3, 5);
    expect(impl.hint(state)).toMatch(/kolu çevirmeyi dene/);
    expect(impl.hint(state)).toMatch(/kristal sönük/);
  });
});

describe('renkkollari: oynanış', () => {
  it('çözüm kümesindeki kolları çekmek çözer (her zorluk, yön) ve kapıyı açar', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 8; seed++) {
        const h = setup(d, seed * 7, seed % 4);
        const sol = h.state.sol.slice();
        for (let j = 0; j < h.state.m; j++) if (sol[j]) pull(h, j);
        expect(impl.isSolved(h.state)).toBe(true);
        for (const c of h.res.anchors.door.cells) expect(h.world.getBlock(c.x, c.y, c.z)).toBe(0);
        // çözümden sonra kollar etkisiz
        const pulls = h.state.pulls;
        pull(h, 0);
        expect(h.state.pulls).toBe(pulls);
        // restore aynı dünya
        const snap = h.world.snapshot();
        impl.restore(h.ctx, JSON.parse(JSON.stringify(h.state)));
        expect(h.world.snapshot()).toBe(snap);
      }
    }
  });

  it('ipucuları sırayla uygulamak her zaman çözer (tuhaf başlangıç kol konumlarında da)', () => {
    for (let d = 1; d <= 5; d++) {
      const h = setup(d, 77);
      // önce rastgele kolları çevir (deney yapan oyuncu)
      pull(h, 0);
      pull(h, h.state.m - 1);
      pull(h, 0);
      let guard = 0;
      while (!impl.isSolved(h.state) && guard++ < 20) {
        const m = /girişten sayarak (\d+)\. kolu/.exec(impl.hint(h.state));
        expect(m).toBeTruthy();
        pull(h, Number(m[1]) - 1);
      }
      expect(impl.isSolved(h.state)).toBe(true);
    }
  });

  it('bir kolu iki kez çekmek geri alır; etki matristeki sütunlarla birebir', () => {
    const h = setup(4, 12);
    const s0 = h.state.s.slice();
    pull(h, 2);
    for (let i = 0; i < h.state.m; i++) expect(h.state.s[i]).toBe(s0[i] ^ h.state.T[2][i]);
    pull(h, 2);
    expect(h.state.s).toEqual(s0);
    expect(h.state.p[2]).toBe(0);
  });

  it('görünüm: yanan kristal renkli cam + ışık; sönük kristal koyu; kol durumu', () => {
    const h = setup(2, 21);
    const { state, world, F } = h;
    const check = () => {
      for (let i = 0; i < state.m; i++) {
        const lx = -Math.floor((3 * (state.m - 1)) / 2) + 3 * i;
        const mid = F.toWorld(lx, 1, state.cz);
        const top = F.toWorld(lx, 3, state.cz);
        expect(world.getBlock(mid.x, mid.y, mid.z)).toBe(state.s[i] ? COLORS[state.cols[i]].glass : B.CONCRETE_BLACK);
        expect(world.getBlock(top.x, top.y, top.z)).toBe(state.s[i] ? B.LIGHT_BLOCK : B.BASALT);
      }
      for (let j = 0; j < state.m; j++) {
        const lv = F.toWorld(state.x0, 0, 1 + 2 * j);
        expect(world.getBlock(lv.x, lv.y, lv.z)).toBe(state.p[j] ? B.LEVER_ON : B.LEVER);
      }
    };
    check();
    pull(h, 1);
    check();
    pull(h, 0);
    check();
  });

  it('kol mesajı hangi kristalin yandığını/söndüğünü Türkçe söyler', () => {
    const h = setup(3, 4);
    const out = pull(h, 0);
    const msg = out.effects.find((e) => e.kind === 'message');
    expect(msg.text).toMatch(/kristal (yandı|söndü)/);
    expect(out.effects.some((e) => e.kind === 'sound' && e.name === 'lever')).toBe(true);
  });

  it('sıfırlama kolu reset efekti verir; çözülünce vermez', () => {
    const h = setup(2, 8);
    const w = h.F.toWorld(h.state.x1, 0, 1);
    const out = impl.interact(h.ctx, h.state, {
      type: 'use', x: w.x, y: w.y, z: w.z,
    });
    expect(out.effects.some((e) => e.kind === 'reset')).toBe(true);
    for (let j = 0; j < h.state.m; j++) if (h.state.sol[j]) pull(h, j);
    const out2 = impl.interact(h.ctx, h.state, {
      type: 'use', x: w.x, y: w.y, z: w.z,
    });
    expect(out2.effects.some((e) => e.kind === 'reset')).toBe(false);
  });

  it('oyuncunun kırdığı/koyduğu dinamik blok geri yüklenir', () => {
    const h = setup(2, 8);
    const w = h.F.toWorld(h.state.x0, 0, 1);
    const out = impl.interact(h.ctx, h.state, {
      type: 'blockBroken', x: w.x, y: w.y, z: w.z,
    });
    expect(out.effects).toEqual([{
      kind: 'setBlock', x: w.x, y: w.y, z: w.z, id: B.LEVER,
    }]);
  });
});

describe('renkkollari: manager', () => {
  it('çöz → puzzleSolved bir kez; serialize/restore turu; reset dünyayı ilk haline döndürür', () => {
    const h = fakeManager({ seed: 5 });
    const desc = {
      id: 'rk#1', type: TYPE, origin: { x: 40, y: 30, z: 40 }, facing: 1, difficulty: 3, zone: 1,
    };
    buildPuzzleRoom(desc, { seed: 5, setBlock: h.world.writer() });
    const initial = h.world.snapshot();
    const view = h.mgr.register(desc.id, desc);
    const F = frame({ origin: desc.origin, facing: desc.facing, seed: 0, setBlock: () => {} });
    const lever = (j) => F.toWorld(view.state.x0, 0, 1 + 2 * j);
    const sol = view.state.sol.slice();
    const first = sol.indexOf(1);
    h.mgr.handleInteract({ type: 'use', ...lever(first) });
    const saved = JSON.parse(JSON.stringify(h.mgr.serialize()));
    const h2 = fakeManager({ seed: 5 });
    buildPuzzleRoom(desc, { seed: 5, setBlock: h2.world.writer() });
    h2.mgr.register(desc.id, desc);
    h2.mgr.restore(saved);
    expect(h2.world.snapshot()).toBe(h.world.snapshot());
    // yarım durumdan reset
    expect(h.mgr.reset(desc.id)).toBe(true);
    expect(h.world.snapshot()).toBe(initial);
    for (let j = 0; j < sol.length; j++) if (sol[j]) h.mgr.handleInteract({ type: 'use', ...lever(j) });
    expect(h.solved.length).toBe(1);
    expect(h.solved[0].puzzleType).toBe(TYPE);
    h.mgr.handleInteract({ type: 'use', ...lever(0) });
    expect(h.solved.length).toBe(1);
  });
});

describe('renkkollari: erişim', () => {
  it('çözülmeden arka kapı kilitli; çözülünce düz yürüyüşle ulaşılır', () => {
    for (let d = 1; d <= 5; d++) {
      const h = setup(d, 40 + d, d % 4);
      expect(frontToBack(h.world, h.F, h.state.d)).toBe(false);
      for (let j = 0; j < h.state.m; j++) if (h.state.sol[j]) pull(h, j);
      expect(frontToBack(h.world, h.F, h.state.d)).toBe(true);
    }
  });
});
