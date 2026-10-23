import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { DenseChunk } from '../denseChunk.js';
import { unregisterPuzzle, registerPuzzle } from './kitRegistry.js';
import {
  FakeWorld, PuzzleManager, buildChamber, buildPuzzleRoom, chamberSize, chunkWriter,
  checkPuzzleConformance, doorEffects, fakeManager, frame, fx, simulate,
} from './kit.js';

/*
 * Sahte bulmaca "testkol": kolu AÇ + plakaya 0,5 sn bas → çözülür, arka kapı açılır.
 * Kol kapalıyken plakaya 3 kez basılırsa yanlış hamle → otomatik sıfırlama + ileti.
 * (Kit API'sinin uçtan uca sözleşmesini sınar: build → interact → tick → serialize → restore → solved.)
 */
const TYPE = 'testkol';
const POS = { lever: [0, 0, 3], plate: [2, 0, 3] };

// Kapı hücreleri build'in belirlenimliliğinden yeniden hesaplanır (ctx başına önbellek).
const DOORS = new WeakMap();
function getDoor(ctx) {
  let d = DOORS.get(ctx);
  if (!d) {
    const dry = Object.assign({}, ctx, { setBlock: () => {} });
    d = buildChamber(dry, { w: 7, d: 7, h: 5, doorBack: 'locked' }).doorBack;
    DOORS.set(ctx, d);
  }
  return d;
}

const impl = {
  type: TYPE,
  name: 'Test Kolu',
  summary: 'Kolu aç, plakaya bas.',
  difficultyRange: [1, 3],
  footprint() {
    return Object.assign(chamberSize(7, 7, 5), { margin: 2 });
  },
  build(ctx) {
    const ch = buildChamber(ctx, { w: 7, d: 7, h: 5, doorBack: 'locked' });
    const F = frame(ctx);
    F.lever(...POS.lever, false);
    F.plate(...POS.plate, false);
    return {
      state: {
        lever: false, held: 0, lastStep: -1, wrong: 0, done: false, level: ctx.difficulty,
        pick: ctx.rng.int(0, 1000),
      },
      anchors: {
        lever: F.toWorld(...POS.lever),
        plate: F.toWorld(...POS.plate),
        door: ch.doorBack,
      },
    };
  },
  restore(ctx, state) {
    const F = frame(ctx);
    F.lever(...POS.lever, state.lever);
    F.plate(...POS.plate, state.held > 0);
    for (const c of getDoor(ctx).cells) ctx.setBlock(c.x, c.y, c.z, state.done ? 0 : B.LOCKED_DOOR);
  },
  interact(ctx, state, ev) {
    const F = frame(ctx);
    const lever = F.toWorld(...POS.lever);
    const plate = F.toWorld(...POS.plate);
    const effects = [];
    if (ev.type === 'use' && ev.x === lever.x && ev.y === lever.y && ev.z === lever.z) {
      state.lever = !state.lever;
      effects.push(fx.setBlock(lever.x, lever.y, lever.z, state.lever ? B.LEVER_ON : B.LEVER));
      effects.push(fx.sound('kol', lever.x, lever.y, lever.z));
      effects.push(fx.particles('kıvılcım', lever.x, lever.y + 1, lever.z, 0xffcc00));
    } else if (ev.type === 'step' && ev.x === plate.x && ev.y === plate.y && ev.z === plate.z) {
      if (!state.lever) {
        if (state.lastStep < 0 || ctx.time - state.lastStep > 0.4) state.wrong++;
        state.lastStep = ctx.time;
        if (state.wrong >= 3) {
          effects.push(fx.message('Önce kolu çek!'));
          effects.push(fx.reset());
        }
      } else {
        state.lastStep = ctx.time;
        if (state.held === 0) state.held = 0.0001;
        effects.push(fx.setBlock(plate.x, plate.y, plate.z, B.PRESSURE_PLATE_ON));
      }
    }
    return { state, effects };
  },
  tick(ctx, state, dt) {
    const effects = [];
    if (state.held > 0 && !state.done) {
      if (ctx.time - state.lastStep > 0.3) {
        state.held = 0;
        const p = frame(ctx).toWorld(...POS.plate);
        effects.push(fx.setBlock(p.x, p.y, p.z, B.PRESSURE_PLATE));
      } else {
        state.held += dt;
        if (state.held >= 0.5) {
          state.done = true;
          effects.push(...doorEffects(getDoor(ctx), true));
          effects.push(fx.message('Kapı açıldı!'));
          effects.push(fx.giveItem('item:elma', 2));
          effects.push(fx.spawn('kelebek', 0, 25, 0));
        }
      }
    }
    return { state, effects };
  },
  isSolved(state) {
    return state.done === true;
  },
  hint(state) {
    return state.lever ? 'Şimdi plakaya bas.' : 'Önce kolu çek.';
  },
};

beforeAll(() => registerPuzzle(TYPE, impl));
afterAll(() => unregisterPuzzle(TYPE));

const DESC = {
  id: 'tapinak:0,0#0', type: TYPE, origin: { x: 40, y: 30, z: 40 }, facing: 1, difficulty: 2, zone: 1,
  structureId: 'tapinak:0,0',
};

function setup(seed) {
  const h = fakeManager({ seed });
  buildPuzzleRoom(DESC, { seed, setBlock: h.world.writer() });
  const view = h.mgr.register(DESC.id, DESC);
  return { h, view };
}

describe('PuzzleManager uçtan uca (sahte bulmaca)', () => {
  it('build → register → interact → tick → çözüldü; olaylar ve bloklar', () => {
    const { h, view } = setup(11);
    expect(view.type).toBe(TYPE);
    expect(view.solved).toBe(false);
    expect(view.state.lever).toBe(false);
    expect(h.mgr.has(DESC.id)).toBe(true);
    expect(h.mgr.get('yok')).toBeNull();
    const F = frame({ origin: DESC.origin, facing: DESC.facing, seed: 0, setBlock: () => {} });
    const lever = F.toWorld(...POS.lever);
    const plate = F.toWorld(...POS.plate);
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER);

    // 'use' kola: işlendi, blok değişti, ses/parçacık efekti geldi
    expect(h.mgr.handleInteract({ type: 'use', ...lever })).toBe(true);
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER_ON);
    expect(h.effects.map((e) => e.kind)).toEqual(['sound', 'particles']);
    expect(h.effects[0].puzzleId).toBe(DESC.id);
    // odanın başka bir yerine 'use': bulmaca sahibi ama bir şey değişmez → işlenmedi (false)
    expect(h.mgr.handleInteract({ type: 'use', x: lever.x, y: lever.y + 1, z: lever.z })).toBe(false);
    // oda dışı → false
    expect(h.mgr.handleInteract({ type: 'use', x: 0, y: 0, z: 0 })).toBe(false);
    expect(h.mgr.ownerAt(plate.x, plate.y, plate.z)).toBe(DESC.id);

    // plakaya 0,5+ sn basılı tut (her kare 'step'); oyuncu yakın
    const pp = { x: plate.x, y: plate.y, z: plate.z };
    for (let i = 0; i < 60 && !h.solved.length; i++) {
      h.mgr.step(plate.x, plate.y, plate.z, { playerId: 'p1' });
      h.mgr.update(1 / 60, pp);
    }
    expect(h.solved.length).toBe(1);
    expect(h.emitted).toEqual([{
      type: 'puzzleSolved', id: DESC.id, puzzleType: TYPE, zone: 1, structureId: 'tapinak:0,0',
    }]);
    expect(h.mgr.get(DESC.id).solved).toBe(true);
    expect(h.mgr.isSolved(DESC.id)).toBe(true);
    expect(h.messages.map((m) => m.text)).toEqual(['Kapı açıldı!']);
    expect(h.effects.some((e) => e.kind === 'giveItem' && e.item === 'item:elma' && e.count === 2)).toBe(true);
    expect(h.spawned).toEqual([{ type: 'kelebek', x: 0, y: 25, z: 0, opts: undefined }]);
    const door = h.mgr.get(DESC.id).anchors.door;
    for (const c of door.cells) expect(h.world.getBlock(c.x, c.y, c.z)).toBe(0);
    // sonraki karelerde olay tekrar yayılmaz
    simulate(h.mgr, 1, pp);
    expect(h.solved.length).toBe(1);
    expect(h.mgr.hintFor(DESC.id)).toBe('Şimdi plakaya bas.');
    expect(h.mgr.hintNear(plate.x, plate.y, plate.z)).toBe('Şimdi plakaya bas.');
    expect(h.mgr.hintNear(900, 30, 900)).toBeNull();
  });

  it('serialize → JSON → yeni dünya + restore: durum, bloklar ve çözüm geri gelir', () => {
    const a = setup(11);
    const F = frame({ origin: DESC.origin, facing: DESC.facing, seed: 0, setBlock: () => {} });
    const lever = F.toWorld(...POS.lever);
    const plate = F.toWorld(...POS.plate);
    a.h.mgr.handleInteract({ type: 'use', ...lever });
    for (let i = 0; i < 60 && !a.h.solved.length; i++) {
      a.h.mgr.step(plate.x, plate.y, plate.z);
      a.h.mgr.update(1 / 60, plate);
    }
    const saved = JSON.parse(JSON.stringify(a.h.mgr.serialize()));
    expect(Object.keys(saved)).toEqual([DESC.id]);
    expect(saved[DESC.id].solved).toBe(true);
    expect(saved[DESC.id].type).toBe(TYPE);

    // yeni oturum: dünya yalnızca build ile kurulu (düzenlemeler ayrı kayıtlı olurdu), restore blokları durumdan kurar
    const b = setup(11);
    expect(b.h.mgr.get(DESC.id).solved).toBe(false);
    expect(b.h.mgr.restore(saved)).toBe(1);
    expect(b.h.mgr.get(DESC.id).solved).toBe(true);
    expect(b.h.mgr.get(DESC.id).state.lever).toBe(true);
    expect(b.h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER_ON);
    for (const c of b.h.mgr.get(DESC.id).anchors.door.cells) expect(b.h.world.getBlock(c.x, c.y, c.z)).toBe(0);
    expect(b.h.solved.length).toBe(0); // yüklemede çözüm olayı yeniden yayılmaz
    expect(b.h.mgr.serialize()).toEqual(saved);
  });

  it('restore register\'dan ÖNCE: bekleyen durum register anında uygulanır; serialize bekleyeni de yazar', () => {
    const a = setup(3);
    const F = frame({ origin: DESC.origin, facing: DESC.facing, seed: 0, setBlock: () => {} });
    const lever = F.toWorld(...POS.lever);
    a.h.mgr.handleInteract({ type: 'use', ...lever });
    const saved = a.h.mgr.serialize();

    const h = fakeManager({ seed: 3 });
    expect(h.mgr.restore(saved)).toBe(1);
    expect(h.mgr.has(DESC.id)).toBe(false);
    expect(h.mgr.serialize()[DESC.id].state.lever).toBe(true);
    buildPuzzleRoom(DESC, { seed: 3, setBlock: h.world.writer() });
    const v = h.mgr.register(DESC.id, DESC);
    expect(v.state.lever).toBe(true);
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER_ON);

    // unregister: değişmiş durum kaybolmaz
    expect(h.mgr.unregister(DESC.id)).toBe(true);
    expect(h.mgr.has(DESC.id)).toBe(false);
    expect(h.mgr.serialize()[DESC.id].state.lever).toBe(true);
    // değişmemiş bulmaca unregister'da bellekten düşer
    const c = setup(3);
    c.h.mgr.unregister(DESC.id);
    expect(c.h.mgr.serialize()).toEqual({});
    // bozuk kayıtlar yok sayılır
    expect(c.h.mgr.restore({ x: null, y: { type: 5 }, z: { type: 'a' }, ok: { type: 'a', state: {} } })).toBe(1);
    expect(c.h.mgr.restore(null)).toBe(0);
  });

  it('yanlış hamle → otomatik sıfırlama (reset efekti) ve elle reset; çözülmüş sıfırlanmaz', () => {
    const { h } = setup(5);
    const F = frame({ origin: DESC.origin, facing: DESC.facing, seed: 0, setBlock: () => {} });
    const lever = F.toWorld(...POS.lever);
    const plate = F.toWorld(...POS.plate);
    h.mgr.handleInteract({ type: 'use', ...lever }); // aç
    h.mgr.handleInteract({ type: 'use', ...lever }); // kapat
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER);
    for (let i = 0; i < 3; i++) {
      h.mgr.step(plate.x, plate.y, plate.z);
      simulate(h.mgr, 0.6, plate); // her adım arası >0,4 sn → 3 ayrı yanlış
    }
    expect(h.messages.map((m) => m.text)).toEqual(['Önce kolu çek!']);
    expect(h.mgr.get(DESC.id).state.wrong).toBe(0); // sıfırlandı
    expect(h.mgr.get(DESC.id).state.lever).toBe(false);

    // elle: kolu aç → reset → blok başlangıç görünümüne döner
    h.mgr.handleInteract({ type: 'use', ...lever });
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER_ON);
    expect(h.mgr.resetNearest(lever.x, lever.y, lever.z)).toBe(true);
    expect(h.world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER);
    expect(h.mgr.get(DESC.id).state.lever).toBe(false);
    expect(h.mgr.reset('yok')).toBe(false);
    expect(h.mgr.resetNearest(900, 30, 900)).toBe(false);

    // çözülmüşü force olmadan sıfırlama
    h.mgr.handleInteract({ type: 'use', ...lever });
    for (let i = 0; i < 60 && !h.solved.length; i++) {
      h.mgr.step(plate.x, plate.y, plate.z);
      h.mgr.update(1 / 60, plate);
    }
    expect(h.mgr.isSolved(DESC.id)).toBe(true);
    expect(h.mgr.reset(DESC.id)).toBe(false);
    expect(h.mgr.reset(DESC.id, { force: true })).toBe(true);
    expect(h.mgr.isSolved(DESC.id)).toBe(false);
  });

  it('yakınlık: uzaktaki bulmaca tick\'lenmez; playerPos yoksa hepsi', () => {
    const { h } = setup(7);
    const F = frame({ origin: DESC.origin, facing: DESC.facing, seed: 0, setBlock: () => {} });
    const lever = F.toWorld(...POS.lever);
    const plate = F.toWorld(...POS.plate);
    h.mgr.handleInteract({ type: 'use', ...lever });
    h.mgr.step(plate.x, plate.y, plate.z);
    const held0 = h.mgr.get(DESC.id).state.held;
    simulate(h.mgr, 0.2, { x: plate.x + 500, y: plate.y, z: plate.z });
    expect(h.mgr.get(DESC.id).state.held).toBe(held0);
    expect(h.mgr.nearest(plate.x + 500, plate.y, plate.z)).toBeNull();
    expect(h.mgr.nearest(plate.x + 10, plate.y, plate.z, 20)).toBe(DESC.id);
    h.mgr.update(0.05); // konumsuz → hepsi
    expect(h.mgr.get(DESC.id).state.held).toBeGreaterThan(held0);
    // aşırı büyük dt 0,25'e sıkıştırılır
    const t0 = h.mgr.time;
    h.mgr.update(30, plate);
    expect(h.mgr.time - t0).toBeCloseTo(0.25, 5);
  });

  it('chunk yüklü değilken efekt bekleyen düzenleme olur, chunk gelince uygulanır', () => {
    const world = new FakeWorld({ seed: 2 });
    const h = fakeManager({ world, seed: 2 });
    buildPuzzleRoom(DESC, { seed: 2, setBlock: world.writer() });
    h.mgr.register(DESC.id, DESC);
    const F = frame({ origin: DESC.origin, facing: DESC.facing, seed: 0, setBlock: () => {} });
    const lever = F.toWorld(...POS.lever);
    const cx = lever.x >> 4;
    const cz = lever.z >> 4;
    world.setLoaded([[cx + 10, cz + 10]]); // oda chunk'ı yüklü değil
    expect(world.getBlock(lever.x, lever.y, lever.z)).toBeNull();
    expect(h.mgr.handleInteract({ type: 'use', ...lever })).toBe(true);
    expect(world.pendingEdits.size).toBe(1);
    world.loadChunk(cx, cz);
    expect(world.getBlock(lever.x, lever.y, lever.z)).toBe(B.LEVER_ON);
  });

  it('bilinmeyen tip / geçersiz origin → null ve skipped; handleInteract kötü girdiye dayanıklı', () => {
    const h = fakeManager({ seed: 1 });
    expect(h.mgr.register('a', { type: 'yokboyle', origin: { x: 0, y: 0, z: 0 } })).toBeNull();
    expect(h.mgr.register('b', { type: TYPE, origin: { x: NaN, y: 0, z: 0 } })).toBeNull();
    expect(h.mgr.skipped.length).toBe(2);
    expect(h.mgr.handleInteract(null)).toBe(false);
    expect(h.mgr.handleInteract({ type: 'use' })).toBe(false);
    expect(h.mgr.handleInteract({ type: 'use', puzzleId: 'yok', x: 1, y: 1, z: 1 })).toBe(false);
    expect(h.mgr.on('bilinmeyen', () => {})).toBeTypeOf('function');
  });

  it('hata yalıtımı: strict değilken bulmaca hatası oyunu çökertmez, errors\'a yazılır', () => {
    registerPuzzle('testpatla', {
      name: 'Patlayan',
      difficultyRange: [1, 1],
      footprint: () => chamberSize(5, 5, 4),
      build: () => ({ state: { n: 0 }, anchors: {} }),
      restore: () => {},
      interact: () => { throw new Error('interact patladı'); },
      tick: () => { throw new Error('tick patladı'); },
      isSolved: () => false,
    });
    try {
      const errs = [];
      const mgr = new PuzzleManager({ seed: 1, onError: (e, info) => errs.push([e.message, info.phase]) });
      mgr.register('x', { type: 'testpatla', origin: { x: 0, y: 10, z: 0 } });
      expect(mgr.handleInteract({ type: 'use', x: 0, y: 10, z: 1 })).toBe(false);
      mgr.update(0.1);
      mgr.update(0.1); // başarısız bulmaca bir daha tick'lenmez
      expect(mgr.errors.map((e) => e.phase)).toEqual(['interact', 'tick']);
      expect(errs).toEqual([['interact patladı', 'interact'], ['tick patladı', 'tick']]);
      const strict = new PuzzleManager({ seed: 1, strict: true });
      strict.register('x', { type: 'testpatla', origin: { x: 0, y: 10, z: 0 } });
      expect(() => strict.handleInteract({ type: 'use', x: 0, y: 10, z: 1 })).toThrow('interact patladı');
    } finally {
      unregisterPuzzle('testpatla');
    }
  });

  it('iç içe odalarda sahiplik: iç kutu dış kutuya, anchor ikisine de üstün', () => {
    registerPuzzle('testkutu', {
      name: 'Kutu',
      difficultyRange: [1, 1],
      footprint: () => chamberSize(5, 5, 4),
      build: (ctx) => ({ state: {}, anchors: { k: { x: ctx.origin.x + 100, y: 1, z: 1 } } }),
      restore: () => {},
      interact: (ctx, s) => ({ state: s, effects: [fx.message('benim')], handled: true }),
      isSolved: () => false,
    });
    try {
      const h = fakeManager({ seed: 1 });
      h.mgr.register('A', { type: 'testkutu', origin: { x: 0, y: 10, z: 0 } });
      h.mgr.register('B', { type: 'testkutu', origin: { x: 20, y: 10, z: 0 } });
      expect(h.mgr.ownerAt(0, 10, 2)).toBe('A');
      expect(h.mgr.ownerAt(20, 10, 2)).toBe('B');
      expect(h.mgr.ownerAt(120, 1, 1)).toBe('B'); // anchor, oda kutusu dışında olsa da
      expect(h.mgr.ownerAt(100, 1, 1)).toBe('A');
      expect(h.mgr.handleInteract({ type: 'use', x: 100, y: 1, z: 1 })).toBe(true);
      expect(h.messages[0].puzzleId).toBe('A');
    } finally {
      unregisterPuzzle('testkutu');
    }
  });
});

describe('uyumluluk denetimi', () => {
  it('sahte bulmaca tüm zorluk × facing için uyumlu', () => {
    registerPuzzle(TYPE, impl);
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  });

  it('bozuk bulmacayı yakalar (belirlenimsiz build, oda dışı yazım, geçersiz efekt)', () => {
    let n = 0;
    registerPuzzle('testbozuk', {
      name: 'Bozuk',
      difficultyRange: [1, 1],
      footprint: () => chamberSize(5, 5, 4),
      build: (ctx) => {
        buildChamber(ctx, { w: 5, d: 5, h: 4 });
        n++;
        ctx.setBlock(ctx.origin.x + 80, ctx.origin.y, ctx.origin.z, B.STONE);
        ctx.setBlock(ctx.origin.x, ctx.origin.y + n, ctx.origin.z + 2, B.BRICK);
        return { state: { f: () => 1 }, anchors: {} };
      },
      restore: () => {},
      interact: (c, s) => ({ state: s, effects: [{ kind: 'setBlock', x: 1.5, y: 1, z: 1, id: 1 }] }),
      isSolved: () => false,
    });
    try {
      const p = checkPuzzleConformance('testbozuk', { facings: [0] }).join(' | ');
      expect(p).toContain('belirlenimli değil');
      expect(p).toContain('dışına yazılmış');
      expect(p).toContain('geçersiz efekt');
    } finally {
      unregisterPuzzle('testbozuk');
    }
    expect(checkPuzzleConformance('yokboyle')).toEqual(['yokboyle: kayıtlı değil']);
  });
});

describe('chunkWriter + buildPuzzleRoom', () => {
  it('bilinmeyen tip → null; zorluk aralığa sıkıştırılır; Chunk\'a yazar', () => {
    expect(buildPuzzleRoom({ id: 'x', type: 'hicbirsey', origin: { x: 0, y: 0, z: 0 } }, { seed: 1 })).toBeNull();
    registerPuzzle(TYPE, impl);
    const chunk = new DenseChunk(2, 2, 128);
    const wr = chunkWriter(chunk);
    const res = buildPuzzleRoom(
      { id: 'q', type: TYPE, origin: { x: 36, y: 20, z: 36 }, facing: 0, difficulty: 9 },
      { seed: 4, ...wr },
    );
    expect(res.difficulty).toBe(3);
    expect(res.state.level).toBe(3);
    expect(chunk.blocks.some((v) => v === B.LEVER)).toBe(true);
    expect(wr.setBlock(0, 0, 0, 5)).toBe(false); // başka chunk
    expect(wr.getBlock(0, 0, 0)).toBeNull();
  });
});
