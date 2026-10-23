import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { seededRandom } from '../rng.js';
import {
  FakeWorld, buildPuzzleRoom, checkPuzzleConformance, fakeManager, frame, getPuzzle, simulate,
} from './index.js';
import terazi from './terazi.js';
import {
  PAN_CAPACITY, RACK_MAX, WEIGHTS, WEIGHT_BLOCK, WEIGHT_ITEM, findSolution, generateTerazi, panSum, scaleBalanced, solvable, targetLayers,
  teraziSize, tiltOf, visibleSum,
} from './teraziLogic.js';

const TYPE = 'terazi';
const ORIGIN = { x: 5, y: 60, z: -12 };
const POS = { x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z };

function setup(difficulty, facing, seed) {
  const sd = seed === undefined ? 4 : seed;
  const f = facing === undefined ? 0 : facing;
  const h = fakeManager({ seed: sd });
  const desc = {
    id: 'tz:' + difficulty + ':' + f + ':' + sd, type: TYPE, origin: ORIGIN, facing: f, difficulty, zone: 1,
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

function clickAt(ctx, lx, ly, lz) {
  return ctx.h.mgr.handleInteract(ev('use', ctx.F.toWorld(lx, ly, lz)));
}

function pickFromRack(ctx, k) {
  const lay = ctx.S().lay;
  return clickAt(ctx, lay.x0, 0, lay.rackLz[k]);
}

function putOnPan(ctx, i, side) {
  const lay = ctx.S().lay;
  return clickAt(ctx, side === 'L' ? -3 : 3, 1, lay.scales[i].lz);
}

function fresh(ctx) {
  const w = new FakeWorld({ seed: ctx.sd });
  buildPuzzleRoom(ctx.desc, { seed: ctx.sd, setBlock: w.writer() });
  return w;
}

function stepSettle(ctx, sec) {
  simulate(ctx.h.mgr, sec === undefined ? 4 : sec, POS);
}

/** findSolution çıktısını oyun olaylarıyla uygular. */
function playSolution(ctx, sol) {
  for (let i = 0; i < sol.length; i++) {
    for (const side of ['L', 'R']) {
      const v = sol[i][side];
      for (let k = 0; k < 4; k++) {
        for (let n = 0; n < v[k]; n++) {
          expect(pickFromRack(ctx, k)).toBe(true);
          expect(ctx.S().hand).toBe(WEIGHTS[k]);
          expect(putOnPan(ctx, i, side)).toBe(true);
          expect(ctx.S().hand).toBe(0);
        }
      }
    }
  }
}

function weightTotal(S) {
  let n = S.stock.reduce((a, b) => a + b, 0) + (S.hand ? 1 : 0);
  for (const sc of S.sc) n += sc.addL.length + sc.addR.length;
  return n;
}

describe('terazi — kayıt ve uyumluluk', () => {
  it('kayıtlı ve footprint tutarlı', () => {
    const impl = getPuzzle(TYPE);
    expect(impl).toBeTruthy();
    expect(terazi).toBe(impl);
    expect(impl.name).toBe('Denge Odası');
    for (let d = 1; d <= 5; d++) expect(impl.footprint(d)).toEqual(Object.assign(teraziSize(d), { margin: 2 }));
  });

  it('kit uyumluluk denetimi sorunsuz', () => {
    expect(checkPuzzleConformance(TYPE)).toEqual([]);
  }, 180000);
});

describe('terazi — üretici ve ölçü işlevleri', () => {
  it('tüm zorluklar × 40 tohum: çözülebilir (kaba kuvvet), başlangıçta dengesiz, sınırlar geçerli', () => {
    for (let d = 1; d <= 5; d++) {
      for (let s = 1; s <= 40; s++) {
        const g = generateTerazi(d, seededRandom(s * 31 + d));
        expect(solvable(g.lay, g.init), 'd' + d + ' s' + s).toBe(true);
        expect(g.lay.scales.length).toBe(d >= 5 ? 2 : 1);
        for (let i = 0; i < g.lay.scales.length; i++) {
          const spec = g.lay.scales[i];
          const sc = g.init.sc[i];
          expect(scaleBalanced(spec, sc)).toBe(false);
          if (spec.mode === 'target') {
            expect(spec.tL).toBeLessThanOrEqual(8);
            expect(spec.tR).toBeLessThanOrEqual(8);
            expect(spec.tL).toBeGreaterThan(panSum(sc, 'L'));
            expect(spec.tR).toBeGreaterThan(panSum(sc, 'R'));
          }
          for (const w of sc.fixL.concat(sc.fixR, sc.hidL, sc.hidR)) expect(WEIGHTS.indexOf(w)).toBeGreaterThanOrEqual(0);
          expect(sc.fixL.length + sc.hidL.length).toBeLessThanOrEqual(PAN_CAPACITY);
          const lay = targetLayers(sc);
          expect(sc.pL).toBe(lay[0]);
          expect(sc.pR).toBe(lay[1]);
        }
        for (const n of g.init.stock) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(RACK_MAX);
        }
        if (d >= 4) expect(g.lay.scales[0].hidden).toBe(true);
        if (d >= 4) expect(g.init.sc[0].hidL.length + g.init.sc[0].hidR.length).toBeGreaterThan(0);
        if (d === 5) expect(g.lay.scales[1].minKinds).toBe(2);
      }
    }
  });

  it('belirlenimli; farklı tohum farklı düzen', () => {
    const a = JSON.stringify(generateTerazi(3, seededRandom(8)));
    expect(JSON.stringify(generateTerazi(3, seededRandom(8)))).toBe(a);
    const seen = new Set();
    for (let s = 1; s <= 20; s++) seen.add(JSON.stringify(generateTerazi(3, seededRandom(s)).init.sc));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('ölçüler: toplam/görünür toplam/eğim/katmanlar ve denge kuralları', () => {
    const sc = {
      fixL: [2, 1], fixR: [3], hidL: [3], hidR: [], addL: [1], addR: [2, 1], pL: 2, pR: 2, anim: 0, ok: false,
    };
    expect(panSum(sc, 'L')).toBe(7);
    expect(visibleSum(sc, 'L')).toBe(4);
    expect(panSum(sc, 'R')).toBe(6);
    expect(tiltOf(sc)).toBe(1);
    expect(targetLayers(sc)).toEqual([1, 3]);
    expect(targetLayers({ ...sc, addL: [5, 5, 5] })).toEqual([0, 4]);
    expect(targetLayers({ ...sc, addR: [5, 5, 5] })).toEqual([4, 0]);
    const eq = { mode: 'equal', minKinds: 0 };
    expect(scaleBalanced(eq, { ...sc, addR: [2, 1, 1] })).toBe(true);
    expect(scaleBalanced(eq, sc)).toBe(false);
    // boş kefeler dengeli sayılmaz
    expect(scaleBalanced(eq, { ...sc, fixL: [], hidL: [], addL: [], fixR: [], hidR: [], addR: [] })).toBe(false);
    const tg = { mode: 'target', tL: 7, tR: 6, minKinds: 0 };
    expect(scaleBalanced(tg, sc)).toBe(true);
    expect(scaleBalanced({ ...tg, tL: 6, tR: 7 }, sc)).toBe(false);
    // çeşit kuralı: görünür ağırlıkların farklı türleri
    const kinds = { mode: 'equal', minKinds: 2 };
    const same = {
      fixL: [1], fixR: [1], hidL: [], hidR: [], addL: [1], addR: [1], pL: 2, pR: 2, anim: 0, ok: false,
    };
    expect(scaleBalanced({ mode: 'equal', minKinds: 0 }, same)).toBe(true);
    expect(scaleBalanced(kinds, same)).toBe(false);
    expect(scaleBalanced(kinds, { ...same, fixL: [2], addR: [1, 1], fixR: [] , addL: [] })).toBe(false);
    expect(scaleBalanced(kinds, {
      ...same, fixL: [2], addL: [1], fixR: [1], addR: [2],
    })).toBe(true);
  });

  it('kaba kuvvet çözücü gerçek çözüm döndürür ve ortak stoku aşmaz', () => {
    for (let d = 1; d <= 5; d++) {
      const g = generateTerazi(d, seededRandom(70 + d));
      const sol = findSolution(g.lay, g.init);
      expect(sol).not.toBeNull();
      const used = [0, 0, 0, 0];
      for (const s of sol) for (let k = 0; k < 4; k++) used[k] += s.L[k] + s.R[k];
      for (let k = 0; k < 4; k++) expect(used[k]).toBeLessThanOrEqual(g.init.stock[k]);
    }
  });
});

describe('terazi — oyun içi akış', () => {
  it('başlangıç: raf istifleri stoku yansıtır, ön yüklü ağırlıklar kefede, kapı kilitli, kollar kurulu', () => {
    for (let d = 1; d <= 5; d++) {
      const ctx = setup(d, d % 4);
      const S = ctx.S();
      const lay = S.lay;
      expect(S.done).toBe(false);
      expect(ctx.h.world.count(B.LOCKED_DOOR)).toBeGreaterThan(0);
      expect(ctx.h.world.count(B.LEVER)).toBe(2);
      for (let k = 0; k < 4; k++) {
        for (let ly = 0; ly < RACK_MAX; ly++) {
          const w = ctx.F.toWorld(lay.x0, ly, lay.rackLz[k]);
          expect(ctx.h.world.getBlock(w.x, w.y, w.z)).toBe(ly < S.stock[k] ? WEIGHT_BLOCK[WEIGHTS[k]] : 0);
        }
      }
      // kefeler katmanda: ağır kefe aşağıda
      for (let i = 0; i < lay.scales.length; i++) {
        const sc = S.sc[i];
        const wl = ctx.F.toWorld(-3, sc.pL, lay.scales[i].lz);
        const wr = ctx.F.toWorld(3, sc.pR, lay.scales[i].lz);
        expect(ctx.h.world.getBlock(wl.x, wl.y, wl.z)).toBe(B.MOVING_PLATFORM);
        expect(ctx.h.world.getBlock(wr.x, wr.y, wr.z)).toBe(B.MOVING_PLATFORM);
        const heavyLeft = panSum(sc, 'L') > panSum(sc, 'R');
        if (panSum(sc, 'L') !== panSum(sc, 'R')) expect(heavyLeft ? sc.pL < sc.pR : sc.pR < sc.pL).toBe(true);
        // gizli kutular mantık kapısı bloğu
        expect(ctx.h.world.count(B.LOGIC_GATE)).toBe(S.sc.reduce((n, s) => n + s.hidL.length + s.hidR.length, 0));
      }
      expect(ctx.h.mgr.hintFor(ctx.desc.id)).toMatch(/Kefe|kefe/);
    }
  });

  it('raftan al → kefeye koy: stok düşer, ağırlık bloğu kefede görünür, kefe aşağı iner (animasyonlu), mesaj eğimi söyler', () => {
    const ctx = setup(1, 1);
    const lay = ctx.S().lay;
    const msgs = [];
    ctx.h.mgr.on('message', (e) => msgs.push(e.text));
    const stock0 = ctx.S().stock.slice();
    expect(pickFromRack(ctx, 0)).toBe(true);
    expect(ctx.S().stock[0]).toBe(stock0[0] - 1);
    expect(ctx.S().hand).toBe(1);
    const top = ctx.F.toWorld(lay.x0, stock0[0] - 1, lay.rackLz[0]);
    expect(ctx.h.world.getBlock(top.x, top.y, top.z)).toBe(0);
    expect(msgs[msgs.length - 1]).toMatch(/Elinde: taş blok \(1\)/);
    const lamp = ctx.F.toWorld(lay.x0 - 1, 6, lay.rackLz[0]);
    expect(ctx.h.world.getBlock(lamp.x, lamp.y, lamp.z)).not.toBe(B.BASALT);
    // boş sağ kefeye koy
    expect(putOnPan(ctx, 0, 'R')).toBe(true);
    expect(ctx.S().sc[0].addR).toEqual([1]);
    expect(ctx.S().hand).toBe(0);
    expect(msgs[msgs.length - 1]).toMatch(/sağ kefeye kondu/);
    const slot = ctx.F.toWorld(2, ctx.S().sc[0].pR + 1, lay.scales[0].lz - 1);
    expect(ctx.h.world.getBlock(slot.x, slot.y, slot.z)).toBe(B.STONE);
    simulate(ctx.h.mgr, 3, POS);
    const sc = ctx.S().sc[0];
    expect([sc.pL, sc.pR]).toEqual(targetLayers(sc));
    // ağırlık kefeyle birlikte taşındı: yeni katmanın üstünde
    const slot2 = ctx.F.toWorld(2, sc.pR + 1, lay.scales[0].lz - 1);
    expect(ctx.h.world.getBlock(slot2.x, slot2.y, slot2.z)).toBe(B.STONE);
    expect(ctx.h.world.count(B.STONE)).toBeGreaterThanOrEqual(1);
    expect(weightTotal(ctx.S())).toBe(stock0.reduce((a, b) => a + b, 0));
  });

  it('geri alma, rafa bırakma, boşaltma kolu, kefe dolu ve tükenmiş stok', () => {
    const ctx = setup(1, 0);
    const lay = ctx.S().lay;
    const total0 = weightTotal(ctx.S());
    const stock0 = ctx.S().stock.slice();
    const msgs = [];
    ctx.h.mgr.on('message', (e) => msgs.push(e.text));
    // elin boşken boş kefe
    putOnPan(ctx, 0, 'L');
    expect(msgs[msgs.length - 1]).toMatch(/Kefede alabileceğin ağırlık yok/);
    // al, rafa geri bırak
    pickFromRack(ctx, 1);
    expect(ctx.S().hand).toBe(2);
    pickFromRack(ctx, 0);
    expect(ctx.S().hand).toBe(0);
    expect(msgs[msgs.length - 1]).toMatch(/rafa geri bırakıldı/);
    // koy, geri al
    pickFromRack(ctx, 2);
    putOnPan(ctx, 0, 'R');
    expect(ctx.S().sc[0].addR).toEqual([3]);
    putOnPan(ctx, 0, 'R');
    expect(ctx.S().hand).toBe(3);
    expect(ctx.S().sc[0].addR).toEqual([]);
    putOnPan(ctx, 0, 'L');
    expect(ctx.S().sc[0].addL).toEqual([3]);
    // ön yüklü ağırlık alınamaz (sol kefede fix var, add sıfır oldu): boşalt
    clickAt(ctx, lay.emptyLever.lx, 0, lay.emptyLever.lz);
    expect(ctx.S().sc[0].addL).toEqual([]);
    expect(ctx.S().stock).toEqual(stock0);
    expect(weightTotal(ctx.S())).toBe(total0);
    // stok tükenince
    for (let n = 0; n < 6; n++) {
      pickFromRack(ctx, 3);
      if (ctx.S().hand) putOnPan(ctx, 0, 'L');
    }
    pickFromRack(ctx, 3);
    expect(msgs[msgs.length - 1]).toMatch(/tükendi|Elinde/);
    // kefe doluluğu: stok yetersizse de PAN_CAPACITY aşılmaz
    expect(ctx.S().sc[0].addL.length).toBeLessThanOrEqual(PAN_CAPACITY);
  });

  it('rastgele işlem fuzz: ağırlık korunumu (stok+el+kefe sabit), blok durumu kayıtla tutarlı, kefe katmanları 0..4', () => {
    for (let d = 1; d <= 5; d++) {
      const ctx = setup(d, d % 4, 100 + d);
      const lay = ctx.S().lay;
      const total0 = weightTotal(ctx.S());
      const rnd = seededRandom(d * 17);
      for (let n = 0; n < 160; n++) {
        const r = rnd.int(0, 9);
        if (r <= 3) pickFromRack(ctx, rnd.int(0, 3));
        else if (r <= 7) putOnPan(ctx, rnd.int(0, lay.scales.length - 1), rnd.chance(0.5) ? 'L' : 'R');
        else if (r === 8) clickAt(ctx, lay.emptyLever.lx, 0, lay.emptyLever.lz);
        else simulate(ctx.h.mgr, 0.5, POS);
        if (n % 20 === 0) expect(weightTotal(ctx.S())).toBe(total0);
        for (const sc of ctx.S().sc) {
          expect(sc.pL).toBeGreaterThanOrEqual(0);
          expect(sc.pR).toBeLessThanOrEqual(4);
        }
      }
      expect(weightTotal(ctx.S())).toBe(total0);
      simulate(ctx.h.mgr, 5, POS);
      // dünya durumu = durumdan çizilen
      const fw = new FakeWorld({ seed: ctx.sd });
      buildPuzzleRoom(ctx.desc, { seed: ctx.sd, setBlock: fw.writer() });
      const b = fakeManager({ seed: ctx.sd });
      buildPuzzleRoom(ctx.desc, { seed: ctx.sd, setBlock: b.world.writer() });
      b.mgr.register(ctx.desc.id, ctx.desc);
      b.mgr.restore(JSON.parse(JSON.stringify(ctx.h.mgr.serialize())));
      expect(b.world.snapshot(), 'd' + d).toBe(ctx.h.world.snapshot());
    }
  });

  it('çözüm: kaba kuvvet çözümü oyun olaylarıyla uygulanır → dengede, 1 sn tutunca çözülür, kapı açılır, bir kez', () => {
    for (let d = 1; d <= 5; d++) {
      for (const f of [0, 2]) {
        const ctx = setup(d, f, 20 + d);
        const sol = findSolution(ctx.S().lay, { stock: ctx.S().stock, sc: ctx.S().sc });
        expect(sol).not.toBeNull();
        playSolution(ctx, sol);
        expect(ctx.S().done).toBe(false);
        stepSettle(ctx, 5);
        expect(ctx.S().sc.every((s) => s.ok)).toBe(true);
        expect(ctx.S().done).toBe(true);
        expect(ctx.h.solved.length).toBe(1);
        expect(ctx.h.world.count(B.LOCKED_DOOR)).toBe(0);
        expect(ctx.h.world.count(B.LIGHT_BLOCK)).toBe(ctx.S().lay.scales.length);
        stepSettle(ctx, 3);
        expect(ctx.h.solved.length).toBe(1);
        // çözülünce etkileşim kilitli
        const snap = ctx.h.world.snapshot();
        pickFromRack(ctx, 0);
        expect(ctx.h.world.snapshot()).toBe(snap);
      }
    }
  });

  it('dengede 1 sn tutulmazsa çözülmez: hemen bozulursa sayaç sıfırlanır', () => {
    const ctx = setup(1, 0, 3);
    const sol = findSolution(ctx.S().lay, { stock: ctx.S().stock, sc: ctx.S().sc });
    playSolution(ctx, sol);
    // kefeler yerleşene kadar bekle ama 1 sn dolmadan bozma
    let guard = 0;
    while (!ctx.S().sc[0].ok && guard++ < 400) simulate(ctx.h.mgr, 1 / 60, POS);
    expect(ctx.S().sc[0].ok).toBe(true);
    expect(ctx.S().done).toBe(false);
    simulate(ctx.h.mgr, 0.4, POS);
    // bir ağırlığı geri al
    const side = ctx.S().sc[0].addR.length > 0 ? 'R' : 'L';
    putOnPan(ctx, 0, side);
    expect(ctx.S().sc[0].ok).toBe(false);
    simulate(ctx.h.mgr, 3, POS);
    expect(ctx.S().done).toBe(false);
    expect(ctx.S().hold).toBe(0);
  });

  it('çeşit kuralı (d5): tek türle eşit toplam sağlansa da denge sayılmaz', () => {
    const g = generateTerazi(5, seededRandom(9));
    const spec = g.lay.scales[1];
    const sc = JSON.parse(JSON.stringify(g.init.sc[1]));
    sc.fixL = [1, 1, 1];
    sc.fixR = [1, 1];
    sc.addL = [];
    sc.addR = [];
    const s2 = { ...spec, tL: 3, tR: 2 };
    expect(scaleBalanced(s2, sc)).toBe(false);
    sc.fixL = [1, 2];
    sc.fixR = [1, 1, 1];
    expect(scaleBalanced({ ...spec, tL: 3, tR: 3 }, sc)).toBe(false);
  });

  it('kırma koruması: raf/kefe gösterim bloğu kırılırsa geri konur ve takeItem efekti üretilir', () => {
    const ctx = setup(2, 1, 6);
    const lay = ctx.S().lay;
    const effs = [];
    ctx.h.mgr.on('effect', (e) => effs.push(e));
    const k = ctx.S().stock.findIndex((n) => n > 0);
    const w = ctx.F.toWorld(lay.x0, 0, lay.rackLz[k]);
    expect(ctx.h.world.getBlock(w.x, w.y, w.z)).toBe(WEIGHT_BLOCK[WEIGHTS[k]]);
    ctx.h.world.setBlock(w.x, w.y, w.z, 0); // oyun bloğu kırdı
    ctx.h.mgr.handleInteract(ev('blockBroken', w));
    expect(ctx.h.world.getBlock(w.x, w.y, w.z)).toBe(WEIGHT_BLOCK[WEIGHTS[k]]);
    const take = effs.filter((e) => e.kind === 'takeItem');
    expect(take.length).toBe(1);
    expect(take[0].item).toBe(WEIGHT_ITEM[WEIGHTS[k]]);
    expect(take[0].count).toBe(1);
  });

  it('sıfırlama kolu: oda ilk kuruluma döner; çözülmüşken etkisiz', () => {
    const ctx = setup(3, 3, 14);
    const lay = ctx.S().lay;
    const fw = fresh(ctx);
    pickFromRack(ctx, 0);
    putOnPan(ctx, 0, 'L');
    simulate(ctx.h.mgr, 2, POS);
    expect(ctx.h.world.snapshot()).not.toBe(fw.snapshot());
    clickAt(ctx, lay.resetLever.lx, 0, lay.resetLever.lz);
    expect(ctx.h.world.snapshot()).toBe(fw.snapshot());
    const sol = findSolution(lay, { stock: ctx.S().stock, sc: ctx.S().sc });
    playSolution(ctx, sol);
    stepSettle(ctx, 6);
    expect(ctx.S().done).toBe(true);
    const snap = ctx.h.world.snapshot();
    clickAt(ctx, lay.resetLever.lx, 0, lay.resetLever.lz);
    expect(ctx.h.world.snapshot()).toBe(snap);
    expect(ctx.S().done).toBe(true);
  });

  it('serileştirme turu: kefe animasyonu sürerken kaydedip yüklemek dünyayı birebir geri getirir', () => {
    for (const d of [3, 5]) {
      const a = setup(d, 1, 55);
      const sol = findSolution(a.S().lay, { stock: a.S().stock, sc: a.S().sc });
      playSolution(a, sol);
      simulate(a.h.mgr, 0.45, POS);
      const saved = JSON.parse(JSON.stringify(a.h.mgr.serialize()));
      const b = fakeManager({ seed: 55 });
      buildPuzzleRoom(a.desc, { seed: 55, setBlock: b.world.writer() });
      b.mgr.register(a.desc.id, a.desc);
      b.mgr.restore(saved);
      expect(b.world.snapshot(), 'd' + d).toBe(a.h.world.snapshot());
      simulate(a.h.mgr, 6, POS);
      simulate(b.mgr, 6, POS);
      expect(b.world.snapshot(), 'd' + d + ' devam').toBe(a.h.world.snapshot());
      expect(a.S().done).toBe(true);
      expect(b.mgr.get(a.desc.id).state.done).toBe(true);
    }
  });
});
