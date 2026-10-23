import { describe, expect, it } from 'vitest';
import { B, RUNES } from '../blocks.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeCtx, fakeManager, frame, getPuzzle, simulate,
} from './index.js';
import { frontToBack } from './kitP1Walk.js';
import impl from './runedizisi.js';

const TYPE = 'runedizisi';
const RUNE_X = [-6, -3, 0, 3, 6];

function setup(difficulty, seed, facing) {
  const world = new FakeWorld({ seed });
  const ctx = fakeCtx({
    world, seed, id: 'rd', origin: { x: 10, y: 30, z: 10 }, facing: facing || 0, difficulty, zone: 1,
  });
  const res = impl.build(ctx);
  const F = frame(ctx);
  const fxLog = [];
  return {
    world, ctx, state: res.state, F, res, fxLog,
  };
}

function apply(h, effects) {
  for (const e of effects) {
    if (e.kind === 'setBlock') h.world.setBlock(e.x, e.y, e.z, e.id, { record: false, silent: true });
    else h.fxLog.push(e);
  }
}

function touchRune(h, r) {
  const w = h.F.toWorld(RUNE_X[r], 0, 10);
  const out = impl.interact(h.ctx, h.state, {
    type: 'use', x: w.x, y: w.y, z: w.z,
  });
  apply(h, out.effects);
  return out;
}

function tickFor(h, seconds, collectRunes) {
  const heard = [];
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const out = impl.tick(h.ctx, h.state, dt);
    apply(h, out.effects);
    if (collectRunes) {
      for (const e of out.effects) {
        const m = e.kind === 'sound' && /^rune:(\d)$/.exec(e.name);
        if (m) heard.push(Number(m[1]));
      }
    }
  }
  return heard;
}

function touchLever(h) {
  const w = h.F.toWorld(h.state.x1, 0, 2);
  const out = impl.interact(h.ctx, h.state, {
    type: 'use', x: w.x, y: w.y, z: w.z,
  });
  apply(h, out.effects);
  return out;
}

/** Oyuncu gibi çöz: dizi çalınır, duyulanı tekrar et. */
function playThrough(h) {
  touchLever(h);
  let guard = 0;
  while (!impl.isSolved(h.state) && guard++ < 40) {
    const heard = tickFor(h, 12, true);
    if (h.state.mode === 'input') {
      expect(heard.length).toBe(h.state.round);
      for (const r of heard) touchRune(h, r);
    }
    tickFor(h, 0.5);
  }
}

describe('runedizisi: uyumluluk', () => {
  it('kit uyumluluk denetiminden geçer', () => {
    expect(getPuzzle(TYPE)).toBeTruthy();
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 120000);
});

describe('runedizisi: üretim', () => {
  it('dizi uzunluğu zorlukla 3..8; aynı tohum aynı dizi; üçlü tekrar yok', () => {
    const lens = [];
    for (let d = 1; d <= 5; d++) {
      const a = setup(d, 21);
      const b = setup(d, 21);
      expect(a.state.seq).toEqual(b.state.seq);
      expect(a.world.snapshot()).toBe(b.world.snapshot());
      lens.push(a.state.seq.length);
      for (let seed = 1; seed <= 30; seed++) {
        const s = setup(d, seed).state.seq;
        expect(s.every((v) => v >= 0 && v <= 4)).toBe(true);
        for (let i = 2; i < s.length; i++) expect(s[i] === s[i - 1] && s[i] === s[i - 2]).toBe(false);
      }
    }
    expect(lens).toEqual([3, 4, 5, 6, 8]);
    expect(setup(3, 1).state.seq).not.toEqual(setup(3, 2).state.seq);
  });

  it('beş rün taşı farklı kimlik/renk/şekil; zemin şekilleri farklı; ipucu Türkçe', () => {
    const h = setup(2, 5);
    const ids = RUNE_X.map((x) => {
      const w = h.F.toWorld(x, 0, 10);
      return h.world.getBlock(w.x, w.y, w.z);
    });
    expect(ids).toEqual(RUNES.map((r) => r.id));
    expect(new Set(RUNES.map((r) => r.symbol)).size).toBe(5);
    const sigs = new Set();
    for (let r = 0; r < 5; r++) {
      let sig = '';
      for (let dz = 0; dz < 3; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const w = h.F.toWorld(RUNE_X[r] + dx, -1, 7 + dz);
          sig += h.world.getBlock(w.x, w.y, w.z) === B.CONCRETE_BLACK ? '.' : 'X';
        }
      }
      sigs.add(sig);
    }
    expect(sigs.size).toBe(5);
    expect(impl.hint(h.state)).toMatch(/rün/);
    expect(impl.isSolved(h.state)).toBe(false);
  });
});

describe('runedizisi: oynanış', () => {
  it('rün taşına dokunmak diziyi başlatır; dizi sırayla ses+ışıkla oynatılır, sonra sıra oyuncuda', () => {
    const h = setup(2, 9);
    expect(h.state.mode).toBe('idle');
    touchRune(h, 0);
    expect(h.state.mode).toBe('show');
    const heard = tickFor(h, 15, true);
    expect(heard).toEqual(h.state.seq.slice(0, h.state.round));
    expect(h.state.mode).toBe('input');
  });

  it('doğru girişle turlar ilerler ve sonunda çözülür; arka kapı açılır (her zorluk)', () => {
    for (let d = 1; d <= 5; d++) {
      const h = setup(d, 100 + d, d % 4);
      playThrough(h);
      expect(impl.isSolved(h.state)).toBe(true);
      for (const c of h.res.anchors.door.cells) expect(h.world.getBlock(c.x, c.y, c.z)).toBe(0);
      expect(h.fxLog.some((e) => e.kind === 'message' && /uyum/.test(e.text))).toBe(true);
      // çözülmüş: yeniden restore aynı dünyayı verir
      const snap = h.world.snapshot();
      impl.restore(h.ctx, JSON.parse(JSON.stringify(h.state)));
      expect(h.world.snapshot()).toBe(snap);
    }
  });

  it('yanlış taş: yumuşak geri bildirim (ses+ileti), aynı tur yeniden oynatılır, hata sayacı artar', () => {
    const h = setup(3, 4);
    touchLever(h);
    tickFor(h, 15, true);
    expect(h.state.mode).toBe('input');
    const wrong = (h.state.seq[0] + 1) % 5;
    const out = touchRune(h, wrong);
    expect(out.effects.some((e) => e.kind === 'sound' && e.name === 'puzzle_wrong')).toBe(true);
    const msg = out.effects.find((e) => e.kind === 'message');
    expect(msg.text).toMatch(/sorun değil/i);
    expect(h.state.strikes).toBe(1);
    expect(h.state.mode).toBe('show');
    expect(h.state.round).toBe(h.state.k0);
    // yeniden oynatılan dizi aynı
    const heard = tickFor(h, 15, true);
    expect(heard).toEqual(h.state.seq.slice(0, h.state.round));
  });

  it('aynı turda üç hata → bir tur geri (başlangıcın altına inmez), asla kilitlenmez', () => {
    const h = setup(4, 6);
    touchLever(h);
    tickFor(h, 15, true);
    // tur 2'yi geç
    for (const r of h.state.seq.slice(0, 2)) touchRune(h, r);
    tickFor(h, 15, true);
    expect(h.state.round).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(h.state.mode).toBe('input');
      touchRune(h, (h.state.seq[0] + 1) % 5);
      tickFor(h, 15, true);
    }
    expect(h.state.round).toBe(2);
    expect(h.state.strikes).toBe(0);
    // başlangıç turunda üç hata: tur 2'de kalır
    for (let i = 0; i < 3; i++) {
      touchRune(h, (h.state.seq[0] + 1) % 5);
      tickFor(h, 15, true);
    }
    expect(h.state.round).toBe(2);
    // yine de çözülebilir
    playThrough(h);
    expect(impl.isSolved(h.state)).toBe(true);
  });

  it('izleme sırasında dokunmak yok sayılır; kol her an diziyi yeniden oynatır', () => {
    const h = setup(2, 3);
    touchRune(h, 1);
    tickFor(h, 0.1);
    expect(h.state.mode).toBe('show');
    const out = touchRune(h, 2);
    expect(out.effects.some((e) => e.kind === 'message' && /izle/.test(e.text))).toBe(true);
    tickFor(h, 15);
    expect(h.state.mode).toBe('input');
    touchRune(h, h.state.seq[0]);
    expect(h.state.pos).toBe(1);
    touchLever(h);
    expect(h.state.mode).toBe('show');
    expect(h.state.pos).toBe(0);
  });

  it('görünüm: ilerleme çubuğu ve ışıklı taş; ışık söner', () => {
    const h = setup(3, 8);
    touchLever(h);
    const first = h.state.seq[0];
    let litSeen = false;
    const dt = 1 / 60;
    for (let i = 0; i < 400; i++) {
      apply(h, impl.tick(h.ctx, h.state, dt).effects);
      const w = h.F.toWorld(RUNE_X[first], 1, 10);
      if (h.state.lit === first && h.world.getBlock(w.x, w.y, w.z) === B.LIGHT_BLOCK) litSeen = true;
    }
    expect(litSeen).toBe(true);
    const w = h.F.toWorld(RUNE_X[first], 1, 10);
    expect(h.world.getBlock(w.x, w.y, w.z)).toBe(0);
  });
});

describe('runedizisi: kayıt ve sıfırlama', () => {
  it('oyun ortasında serialize → restore: durum ve dünya aynı', () => {
    const h = fakeManager({ seed: 5 });
    const desc = {
      id: 'rd#1', type: TYPE, origin: { x: 40, y: 30, z: 40 }, facing: 3, difficulty: 3, zone: 2,
    };
    buildPuzzleRoom(desc, { seed: 5, setBlock: h.world.writer() });
    const view = h.mgr.register(desc.id, desc);
    const F = frame({ origin: desc.origin, facing: desc.facing, seed: 0, setBlock: () => {} });
    const lever = F.toWorld(view.state.x1, 0, 2);
    h.mgr.handleInteract({ type: 'use', ...lever });
    simulate(h.mgr, 15, F.toWorld(0, 0, 3));
    expect(h.mgr.get(desc.id).state.mode).toBe('input');
    const r0 = h.mgr.get(desc.id).state.seq[0];
    const rw = F.toWorld(RUNE_X[r0], 0, 10);
    h.mgr.handleInteract({ type: 'use', ...rw });
    simulate(h.mgr, 0.6, F.toWorld(0, 0, 3));
    const saved = JSON.parse(JSON.stringify(h.mgr.serialize()));
    const h2 = fakeManager({ seed: 5 });
    buildPuzzleRoom(desc, { seed: 5, setBlock: h2.world.writer() });
    h2.mgr.register(desc.id, desc);
    h2.mgr.restore(saved);
    expect(JSON.stringify(h2.mgr.serialize())).toBe(JSON.stringify(saved));
    expect(h2.world.snapshot()).toBe(h.world.snapshot());
    expect(h2.mgr.get(desc.id).state.pos).toBe(1);
  });

  it('manager reset: oyun başa döner (dünya ilk kurulumla özdeş)', () => {
    const h = fakeManager({ seed: 7 });
    const desc = {
      id: 'rd#2', type: TYPE, origin: { x: 0, y: 30, z: 0 }, facing: 0, difficulty: 2, zone: 0,
    };
    buildPuzzleRoom(desc, { seed: 7, setBlock: h.world.writer() });
    const initial = h.world.snapshot();
    h.mgr.register(desc.id, desc);
    const F = frame({ origin: desc.origin, facing: desc.facing, seed: 0, setBlock: () => {} });
    h.mgr.handleInteract({ type: 'use', ...F.toWorld(RUNE_X[2], 0, 10) });
    simulate(h.mgr, 1.2, F.toWorld(0, 0, 3));
    expect(h.world.snapshot()).not.toBe(initial);
    expect(h.mgr.reset(desc.id)).toBe(true);
    expect(h.world.snapshot()).toBe(initial);
    expect(h.mgr.get(desc.id).state.mode).toBe('idle');
  });
});

describe('runedizisi: erişim', () => {
  it('çözülmeden arka kapı kilitli; çözülünce düz yürüyüşle ulaşılır', () => {
    for (let d = 1; d <= 5; d++) {
      const h = setup(d, 40 + d, d % 4);
      expect(frontToBack(h.world, h.F, 13)).toBe(false);
      playThrough(h);
      expect(frontToBack(h.world, h.F, 13)).toBe(true);
    }
  });
});
