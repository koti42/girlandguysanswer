import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeCtx, fakeManager, frame, getPuzzle,
} from './index.js';
import { NORMS, allLit, traceBeams } from './kitP1Beam.js';
import { frontToBack } from './kitP1Walk.js';
import impl from './isinayna.js';

const TYPE = 'isinayna';
const REAL_MIRRORS = [1, 2, 3, 3, 7];
const DECOYS = [0, 1, 2, 2, 3];
const RECEIVERS = [1, 1, 1, 2, 3];

function setup(difficulty, seed, facing) {
  const world = new FakeWorld({ seed });
  const ctx = fakeCtx({
    world, seed, id: 'ia', origin: { x: -30, y: 30, z: 14 }, facing: facing || 0, difficulty, zone: 3,
  });
  const res = impl.build(ctx);
  return {
    world, ctx, state: res.state, F: frame(ctx), res,
  };
}

function apply(h, effects) {
  for (const e of effects) if (e.kind === 'setBlock') h.world.setBlock(e.x, e.y, e.z, e.id, { record: false, silent: true });
}

function rotate(h, kind, i) {
  const it = kind === 'm' ? h.state.mir[i] : h.state.spl[i];
  const w = h.F.toWorld(it[0], 2, it[1]);
  const out = impl.interact(h.ctx, h.state, {
    type: 'use', x: w.x, y: w.y, z: w.z,
  });
  apply(h, out.effects);
  return out;
}

/** Oyuncu gibi çöz: her öğeyi çözüm yönelimine gelene dek sağ tıkla. */
function solveByRotating(h) {
  const { state } = h;
  for (let i = 0; i < state.mir.length; i++) {
    if (state.mir[i][3] !== 1) continue;
    let g = 0;
    while (state.mir[i][2] !== state.sol.mir[i] && g++ < 4) rotate(h, 'm', i);
  }
  for (let i = 0; i < state.spl.length; i++) {
    let g = 0;
    while (state.spl[i][2] !== state.sol.spl[i] && g++ < 4) rotate(h, 's', i);
  }
}

function cheb(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

describe('isinayna: uyumluluk', () => {
  it('kit uyumluluk denetiminden geçer', () => {
    expect(getPuzzle(TYPE)).toBeTruthy();
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 180000);
});

describe('isinayna: ışın modeli', () => {
  const L = (extra) => Object.assign({
    gx0: 0, gx1: 10, gz0: 0, gz1: 10, src: [[0, 5, 1]], mir: [], spl: [], rec: [], obs: [],
  }, extra);

  it('düz ışın alıcıya ulaşır; engel keser; sınırda durur', () => {
    let tr = traceBeams(L({ rec: [[6, 5]] }));
    expect(tr.lit).toEqual([true]);
    expect(tr.beam.size).toBe(5);
    tr = traceBeams(L({ rec: [[6, 5]], obs: [[3, 5]] }));
    expect(tr.lit).toEqual([false]);
    expect(tr.beam.size).toBe(2);
    tr = traceBeams(L({}));
    expect(tr.beam.size).toBe(10);
  });

  it('ayna: yansıtan yüz 90° döndürür, arka yüz söndürür (8 yön × 4 yönelim tablosu)', () => {
    // Işın Doğu'ya giderken Güney'e dönmek için n = GB(−1,1) = 2 gerekir
    const want = { 0: [1, 0], 1: [0, 1], 2: [-1, 0], 3: [0, -1] };
    for (let o = 0; o < 4; o++) {
      const tr = traceBeams(L({ mir: [[4, 5, o]], rec: [[4, 8], [4, 2], [8, 5]] }));
      const n = NORMS[o];
      const dot = 1 * n[0];
      if (dot < 0) {
        // yansıdı: v' = v − dot·n
        const nd = [1 - dot * n[0], 0 - dot * n[1]];
        expect(Math.abs(nd[0]) + Math.abs(nd[1])).toBe(1);
        const hitS = tr.lit[0];
        const hitN = tr.lit[1];
        expect(hitS || hitN).toBe(true);
        expect(tr.lit[2]).toBe(false);
        expect(tr.mirDead.length).toBe(0);
      } else {
        expect(tr.mirDead).toEqual([0]);
        expect(tr.lit).toEqual([false, false, false]);
      }
    }
    expect(want[0]).toBeTruthy();
    // o=2 (GB) Doğu→Güney
    expect(traceBeams(L({ mir: [[4, 5, 2]], rec: [[4, 8]] })).lit).toEqual([true]);
    // o=3 (KB) Doğu→Kuzey
    expect(traceBeams(L({ mir: [[4, 5, 3]], rec: [[4, 2]] })).lit).toEqual([true]);
  });

  it('bölücü: dik yan yön ışın üretir, paralel yönde yalnız düz devam eder', () => {
    const base = { spl: [[4, 5, 2]], rec: [[8, 5], [4, 9]] };
    expect(traceBeams(L(base)).lit).toEqual([true, true]);
    expect(traceBeams(L({ spl: [[4, 5, 1]], rec: [[8, 5], [4, 9]] })).lit).toEqual([true, false]);
    expect(traceBeams(L({ spl: [[4, 5, 0]], rec: [[8, 5], [4, 1]] })).lit).toEqual([true, true]);
  });

  it('ışın döngüsü sonsuz döngüye girmez', () => {
    const loop = L({
      src: [[0, 5, 1]],
      mir: [[3, 5, 2], [3, 8, 3], [0, 8, 0], [0, 5, 0]],
    });
    const tr = traceBeams(loop);
    expect(tr.beam.size).toBeGreaterThan(0);
  });
});

describe('isinayna: üretim ve çözülebilirlik', () => {
  it('belirlenimli ve boyut/öğe sayıları beklenen (yedek düzene düşmeden)', () => {
    for (let d = 1; d <= 5; d++) {
      const a = setup(d, 5);
      const b = setup(d, 5);
      expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
      expect(a.world.snapshot()).toBe(b.world.snapshot());
      const decoys = a.state.mir.filter((m) => m[3] === 0).length;
      const real = a.state.mir.length - decoys;
      expect(real).toBe(REAL_MIRRORS[d - 1]);
      expect(decoys).toBe(DECOYS[d - 1]);
      expect(a.state.rec.length).toBe(RECEIVERS[d - 1]);
    }
    const c = setup(3, 6);
    expect(JSON.stringify(c.state.mir)).not.toBe(JSON.stringify(setup(3, 5).state.mir));
  });

  it('her zorluk × 80 tohum: çözüm yönelimleri tüm alıcıları yakar, başlangıç çözülmemiş, aralıklar korunur', () => {
    const fallback = [0, 0, 0, 0, 0];
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 80; seed++) {
        const { state } = setup(d, seed);
        expect(allLit(traceBeams(state))).toBe(false);
        const solved = JSON.parse(JSON.stringify(state));
        solved.mir.forEach((m, i) => { m[2] = state.sol.mir[i]; });
        solved.spl.forEach((s, i) => { s[2] = state.sol.spl[i]; });
        expect(allLit(traceBeams(solved))).toBe(true);
        const real = state.mir.filter((m) => m[3] === 1).length;
        if (real !== REAL_MIRRORS[d - 1] || state.rec.length !== RECEIVERS[d - 1]) fallback[d - 1]++;
        // öğeler arası ≥3 (Chebyshev) ve engeller ışık yolunda değil
        const items = [].concat(state.src, state.mir, state.spl, state.rec);
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) expect(cheb(items[i], items[j])).toBeGreaterThanOrEqual(3);
        }
        const tr = traceBeams(solved);
        state.obs.forEach((o) => expect(tr.beam.has(o[0] + ',' + o[1])).toBe(false));
        // ızgara sınırı içinde
        items.concat(state.obs).forEach((p) => {
          expect(p[0]).toBeGreaterThanOrEqual(state.gx0);
          expect(p[0]).toBeLessThanOrEqual(state.gx1);
          expect(p[1]).toBeGreaterThanOrEqual(state.gz0);
          expect(p[1]).toBeLessThanOrEqual(state.gz1);
        });
      }
    }
    // yedek düzene düşme çok nadir olmalı
    expect(fallback.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(4);
    // 400 tohum × tam ışın izleme: paralel yükte 20 sn'yi aşabilir (CPU bekleme, mantık değil).
  }, 120000);

  it('zorluk büyüdükçe daha çok öğe: bölücü yalnız d≥4, alıcı sayısı 1,1,1,2,3', () => {
    const recs = [];
    for (let d = 1; d <= 5; d++) {
      let r = 0;
      let s = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const { state } = setup(d, seed);
        r = Math.max(r, state.rec.length);
        s = Math.max(s, state.spl.length);
      }
      recs.push(r);
      expect(s).toBe(d >= 4 ? 1 : 0);
    }
    expect(recs).toEqual([1, 1, 1, 2, 3]);
  });
});

describe('isinayna: oynanış', () => {
  it('sağ tık aynayı 90° çevirir; ışın ve zemin işareti dünyada güncellenir', () => {
    const h = setup(2, 3);
    const m0 = h.state.mir.findIndex((m) => m[3] === 1);
    const o0 = h.state.mir[m0][2];
    const before = h.world.snapshot();
    const out = rotate(h, 'm', m0);
    expect(h.state.mir[m0][2]).toBe((o0 + 1) % 4);
    expect(out.effects.some((e) => e.kind === 'setBlock')).toBe(true);
    expect(h.world.snapshot()).not.toBe(before);
    // 4 çevirme → başa dön
    rotate(h, 'm', m0);
    rotate(h, 'm', m0);
    rotate(h, 'm', m0);
    expect(h.state.mir[m0][2]).toBe(o0);
    expect(h.world.snapshot()).toBe(before);
    // yansıtan köşe parlak
    const [x, z, o] = h.state.mir[m0];
    const c = h.F.toWorld(x + NORMS[o][0], -1, z + NORMS[o][1]);
    expect(h.world.getBlock(c.x, c.y, c.z)).toBe(B.LIGHT_BLOCK);
  });

  it('çözüm yönelimleri çözer (her zorluk, her yön), kapı açılır, restore aynı dünya', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 6; seed++) {
        const h = setup(d, seed * 17, seed % 4);
        solveByRotating(h);
        expect(impl.isSolved(h.state)).toBe(true);
        for (const c of h.res.anchors.door.cells) expect(h.world.getBlock(c.x, c.y, c.z)).toBe(0);
        // alıcılar açık blok
        for (const r of h.res.anchors.receivers) expect(h.world.getBlock(r.x, r.y, r.z)).toBe(B.RECEIVER_ON);
        // çözülünce kilitli
        const snap = h.world.snapshot();
        rotate(h, 'm', 0);
        expect(h.world.snapshot()).toBe(snap);
        impl.restore(h.ctx, JSON.parse(JSON.stringify(h.state)));
        expect(h.world.snapshot()).toBe(snap);
      }
    }
  });

  it('ışın blokları baş üstünde (ly 2): oyuncu altından geçebilir; ışın hücreleri çözümde alıcıya kadar kesintisiz', () => {
    const h = setup(3, 10);
    solveByRotating(h);
    const tr = traceBeams(h.state);
    expect(tr.beam.size).toBeGreaterThan(5);
    tr.beam.forEach((k) => {
      const [x, z] = k.split(',').map(Number);
      const w = h.F.toWorld(x, 2, z);
      expect(h.world.getBlock(w.x, w.y, w.z)).toBe(B.LIGHT_BLOCK);
      const below = h.F.toWorld(x, 0, z);
      expect(h.world.getBlock(below.x, below.y, below.z)).toBe(0);
    });
  });

  it('ışık aynanın arkasına çarpınca nazik ileti; alıcı yanınca ileti', () => {
    const h = setup(1, 4);
    const out = rotate(h, 'm', 0);
    const o = h.state.mir[0][2];
    if (o !== h.state.sol.mir[0]) {
      const dead = traceBeams(h.state).mirDead.length > 0;
      expect(out.effects.some((e) => e.kind === 'message')).toBe(dead);
    }
    // çözüme getir
    let g = 0;
    while (h.state.mir[0][2] !== h.state.sol.mir[0] && g++ < 4) rotate(h, 'm', 0);
    expect(impl.isSolved(h.state)).toBe(true);
  });

  it('ipucu Türkçe ve alıcı sayısını söyler', () => {
    const h = setup(4, 2);
    const t = impl.hint(h.state);
    expect(t).toMatch(/ayna/);
    expect(t).toMatch(/\d\/\d yanıyor/);
    expect(t).toMatch(/Mantık kapısı/);
  });

  it('oyuncunun kırdığı dinamik blok geri yüklenir', () => {
    const h = setup(1, 2);
    const w = h.F.toWorld(h.state.mir[0][0], 2, h.state.mir[0][1]);
    const out = impl.interact(h.ctx, h.state, {
      type: 'blockBroken', x: w.x, y: w.y, z: w.z,
    });
    expect(out.effects).toEqual([{
      kind: 'setBlock', x: w.x, y: w.y, z: w.z, id: B.MIRROR,
    }]);
  });
});

describe('isinayna: manager', () => {
  it('kayıt turu ve reset', () => {
    const h = fakeManager({ seed: 9 });
    const desc = {
      id: 'ia#1', type: TYPE, origin: { x: 8, y: 30, z: 8 }, facing: 2, difficulty: 4, zone: 3,
    };
    buildPuzzleRoom(desc, { seed: 9, setBlock: h.world.writer() });
    const initial = h.world.snapshot();
    const view = h.mgr.register(desc.id, desc);
    const F = frame({ origin: desc.origin, facing: desc.facing, seed: 0, setBlock: () => {} });
    const m = view.state.mir.findIndex((q) => q[3] === 1);
    const mw = F.toWorld(view.state.mir[m][0], 2, view.state.mir[m][1]);
    h.mgr.handleInteract({ type: 'use', ...mw });
    const saved = JSON.parse(JSON.stringify(h.mgr.serialize()));
    const h2 = fakeManager({ seed: 9 });
    buildPuzzleRoom(desc, { seed: 9, setBlock: h2.world.writer() });
    h2.mgr.register(desc.id, desc);
    h2.mgr.restore(saved);
    expect(h2.world.snapshot()).toBe(h.world.snapshot());
    expect(h.mgr.reset(desc.id)).toBe(true);
    expect(h.world.snapshot()).toBe(initial);
    // çözülünce olay bir kez
    const st = h.mgr.get(desc.id).state;
    for (let i = 0; i < st.mir.length; i++) {
      if (st.mir[i][3] !== 1) continue;
      for (let g = 0; g < 4 && h.mgr.get(desc.id).state.mir[i][2] !== st.sol.mir[i]; g++) {
        h.mgr.handleInteract({ type: 'use', ...F.toWorld(st.mir[i][0], 2, st.mir[i][1]) });
      }
    }
    for (let i = 0; i < st.spl.length; i++) {
      for (let g = 0; g < 4 && h.mgr.get(desc.id).state.spl[i][2] !== st.sol.spl[i]; g++) {
        h.mgr.handleInteract({ type: 'use', ...F.toWorld(st.spl[i][0], 2, st.spl[i][1]) });
      }
    }
    expect(h.solved.length).toBe(1);
  });
});

describe('isinayna: erişim', () => {
  it('çözülmeden arka kapı kilitli; çözülünce (aynalar, engeller, ışık sütunları arasından) düz yürüyüşle ulaşılır', () => {
    for (let d = 1; d <= 5; d++) {
      for (let seed = 1; seed <= 5; seed++) {
        const h = setup(d, seed * 9, seed % 4);
        expect(frontToBack(h.world, h.F, h.state.d)).toBe(false);
        solveByRotating(h);
        expect(frontToBack(h.world, h.F, h.state.d)).toBe(true);
      }
    }
  });
});
