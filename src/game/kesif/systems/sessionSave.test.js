import { describe, expect, it, vi } from 'vitest';
import { makeTestG } from './sessionTestKit.js';
import {
  approxSaveSize, buildSave, insaBaseOf, createEditsCache, createSaver, normalizeReason, readExt, resolveRestorePosition, restoreFromSave,
} from './sessionSave.js';
import { encodeEdits } from '../sim/saveEdits.js';
import { serializeGame, deserializeGame } from '../sim/save.js';
import { B } from '../sim/blocks.js';
import { SAVE_VERSION } from '../sim/constants.js';
import { cpuMs, scaled } from '../../../test/perfScale.js';

function insaG(extra) {
  const G = makeTestG(Object.assign({ mode: 'insa', base: 'düz' }, extra || {}));
  G.worldReady = true;
  return G;
}

function ensureAll(world) {
  for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) world.ensureChunk(cx, cz);
}

function editSome(world, n, seed) {
  let s = seed || 7;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * 128);
    const z = Math.floor(rnd() * 128);
    const y = 20 + Math.floor(rnd() * 80);
    world.setBlock(x, y, z, 1 + Math.floor(rnd() * 60));
  }
}

describe('düzenleme önbelleği', () => {
  it('encodeEdits ile birebir aynı çıktı', () => {
    const G = insaG();
    ensureAll(G.world);
    editSome(G.world, 3000, 11);
    const cache = createEditsCache();
    const a = cache.build(G.world);
    const b = encodeEdits(G.world.edits, G.world.yMin);
    expect(a.count).toBe(b.count);
    expect(a.chunkCount).toBe(b.chunkCount);
    expect(a.chunks).toEqual(b.chunks);
    expect(Object.keys(a.chunks)).toEqual(Object.keys(b.chunks));
  });

  it('değişmeyen chunk yeniden kodlanmaz; değişen yenilenir', () => {
    const G = insaG();
    ensureAll(G.world);
    editSome(G.world, 1500, 3);
    const cache = createEditsCache();
    const a = cache.build(G.world);
    const a2 = cache.build(G.world);
    Object.keys(a.chunks).forEach((k) => expect(a2.chunks[k]).toBe(a.chunks[k]));
    // bir chunk'ta değişiklik
    G.world.setBlock(5, 70, 5, B.STONE === 1 ? 2 : 1);
    G.world.setBlock(5, 71, 5, 3);
    const a3 = cache.build(G.world);
    const b3 = encodeEdits(G.world.edits, G.world.yMin);
    expect(a3.chunks).toEqual(b3.chunks);
    const changed = Object.keys(a3.chunks).filter((k) => a3.chunks[k] !== a.chunks[k]);
    expect(changed.length).toBeLessThanOrEqual(1);
    expect(changed.length).toBe(1);
  });

  it('yüklü olmayan chunk\'ta aynı boyutlu üzerine yazma da yakalanır', () => {
    const G = insaG();
    ensureAll(G.world);
    G.world.setBlock(2, 40, 2, 5);
    G.world.setBlock(3, 40, 2, 6);
    const cache = createEditsCache();
    const a = cache.build(G.world);
    G.world.unloadChunk(0, 0);
    const u1 = cache.build(G.world); // imza yüklü → yüklü değil olarak değişir
    expect(u1.chunks).toEqual(a.chunks);
    G.world.applyEdits([[2, 40, 2, 9]]); // boyut aynı, değer değişti, chunk yüklü değil
    const u2 = cache.build(G.world);
    expect(u2.chunks).toEqual(encodeEdits(G.world.edits, G.world.yMin).chunks);
    expect(u2.chunks['0,0,2']).not.toBe(u1.chunks['0,0,2']);
  });

  it('düzenleme yoksa boş', () => {
    const G = insaG();
    const r = createEditsCache().build(G.world);
    expect(r).toEqual({ chunks: {}, count: 0, chunkCount: 0 });
  });

  it('çok düzenlenmiş dünya: soğuk ve sıcak kayıt süreleri', () => {
    const G = insaG();
    ensureAll(G.world);
    editSome(G.world, 120000, 5);
    const cache = createEditsCache();
    const t0 = cpuMs();
    const cold = cache.build(G.world);
    const tCold = cpuMs() - t0;
    // Sıcak yol çok kısa (<1 ms): 20 tur CPU zamanının ortalaması (CPU saati ~15 ms adımlı).
    let warm = null;
    const t1 = cpuMs();
    for (let i = 0; i < 20; i++) warm = cache.build(G.world);
    const tWarm = (cpuMs() - t1) / 20;
    console.log('[kayıt süresi] ' + G.world.edits.size + ' düzenleme / ' + cold.chunkCount + ' chunk: soğuk ' + tCold.toFixed(1) + ' ms, sıcak ' + tWarm.toFixed(2) + ' ms');
    expect(cold.chunkCount).toBe(64 * 6); // chunk başına y 20..99 → 6 kesit parçası
    expect(tWarm).toBeLessThan(scaled(10));
    expect(tCold).toBeLessThan(scaled(400));
    expect(warm.count).toBe(cold.count);
    // tek blok değişimi sonrası artımlı yeniden kodlama
    G.world.setBlock(10, 90, 10, 7);
    const t2 = cpuMs(); // CPU zamanı: paralel yükte duvar saati şişer (bkz. test/perfScale.js)
    cache.build(G.world);
    const tInc = cpuMs() - t2;
    console.log('[kayıt süresi] tek chunk değişimi sonrası artımlı: ' + tInc.toFixed(2) + ' ms');
    expect(tInc).toBeLessThan(scaled(30));
    // tüm kayıt nesnesi (sıcak önbellek) ve JSON metni
    const t3 = cpuMs();
    let full = null;
    for (let i = 0; i < 5; i++) full = buildSave(G, { now: 1, edits: cache });
    const tFull = (cpuMs() - t3) / 5;
    const t4 = performance.now();
    const json = JSON.stringify(full);
    const tJson = performance.now() - t4;
    console.log('[kayıt süresi] buildSave (sıcak) ' + tFull.toFixed(2) + ' ms; JSON.stringify ' + tJson.toFixed(1) + ' ms; ' + (json.length / 1024).toFixed(0) + ' KB');
    expect(tFull).toBeLessThan(scaled(30));
  }, 90000);
});

describe('önbellek ısıtma (boşta, bütçeli)', () => {
  it('warm: bütçe dolunca durur, kalan bayat sayısı azalır, sonunda sıfır; build ile uyumlu', () => {
    const G = insaG();
    ensureAll(G.world);
    editSome(G.world, 4000, 21);
    let t = 0;
    const cache = createEditsCache(() => { t += 3; return t; }); // her okuma 3 ms
    let left = cache.warm(G.world, 6);
    expect(left).toBeGreaterThan(0);
    let rounds = 1;
    while (left > 0 && rounds < 200) {
      const next = cache.warm(G.world, 6);
      expect(next).toBeLessThan(left);
      left = next;
      rounds++;
    }
    expect(left).toBe(0);
    expect(rounds).toBeGreaterThan(3);
    const a = cache.build(G.world);
    expect(a.chunks).toEqual(encodeEdits(G.world.edits, G.world.yMin).chunks);
    expect(cache.warm(G.world, 6)).toBe(0);
  });

  it('prewarm: boşta dilimlerle ısıtır, kayıt yapmaz; ardından ilk kayıt sıcak', () => {
    const G = insaG();
    ensureAll(G.world);
    editSome(G.world, 3000, 5);
    G.callbacks.onSave = vi.fn();
    const idleQ = [];
    const saver = createSaver(G, {
      now: () => 1, perf: () => 1, idle: (fn) => { idleQ.push(fn); return () => {}; },
      edits: createEditsCache(() => 0),
    });
    saver.prewarm();
    expect(idleQ).toHaveLength(1);
    saver.prewarm(); // bekleyen varken yeni dilim açılmaz
    expect(idleQ).toHaveLength(1);
    let guard = 0;
    while (idleQ.length > 0 && guard++ < 100) idleQ.shift()();
    expect(G.callbacks.onSave).not.toHaveBeenCalled();
    expect(saver.stats.cacheChunks).toBeGreaterThan(0);
  });
});

describe('buildSave', () => {
  it('serializeGame ile aynı alanları üretir (düzenleme dışında) ve sistem/ext ekler', () => {
    const G = insaG();
    ensureAll(G.world);
    editSome(G.world, 500, 2);
    G.inventory.setSlot(2, 'blok:taş', 7);
    G.progression.stats.blocksPlaced = 12;
    const ctx = {
      name: 'Deneme', createdAt: 1000, now: 2000, edits: createEditsCache(),
    };
    const save = buildSave(G, ctx);
    const ref = serializeGame({
      world: G.world,
      mode: 'insa',
      seed: G.seedInput,
      name: 'Deneme',
      createdAt: 1000,
      savedAt: 2000,
      playTime: 0,
      player: {
        pos: [G.body.x, G.body.y, G.body.z], yaw: 0, pitch: 0, spawn: [G.spawn.x, G.spawn.y, G.spawn.z], flags: { intro: false }, flying: false, cameraMode: 'fp',
      },
      inventory: G.inventory,
      survival: G.survival,
      clock: G.clock,
      weather: G.weatherSim,
      progression: G.progression,
      puzzleManager: G.puzzles,
      entities: G.em,
      chests: G.chests,
    });
    expect(save.edits).toEqual(ref.edits);
    expect(save.editStats).toEqual(ref.editStats);
    expect(save.player).toEqual(ref.player);
    expect(save.time).toEqual(ref.time);
    expect(save.progression).toEqual(ref.progression);
    expect(save.mode).toBe('insa');
    expect(save.name).toBe('Deneme');
    expect(save.savedAt).toBe(2000);
    expect(save.ext.v).toBe(1);
    expect(save.ext.insa.base).toBe('düz');
    expect(typeof save.systems).toBe('object');
    // JSON-güvenli
    expect(() => JSON.stringify(save)).not.toThrow();
    const back = deserializeGame(JSON.parse(JSON.stringify(save)));
    expect(back.ok).toBe(true);
  });

  it('ölüyken yeniden doğmuş hâli yazar (konum doğuş noktası, can dolu)', () => {
    const G = insaG();
    G.body.x = 100; G.body.y = 50; G.body.z = 100;
    G.survival.hp = 0.5;
    G.survival.hunger = 3;
    G.player.dead = true;
    G.bedSpawn = { x: 10.5, y: 41, z: 11.5 };
    const save = buildSave(G, { now: 5, edits: createEditsCache() });
    expect(save.player.pos).toEqual([10.5, 41, 11.5]);
    expect(save.player.hp).toBe(G.survival.maxHp);
    expect(save.player.hunger).toBeGreaterThanOrEqual(14);
    expect(save.ext.bed).toEqual([10.5, 41, 11.5]);
    expect(save.ext.spawn).toEqual([G.spawn.x, G.spawn.y, G.spawn.z]);
    // canlı durum değişmedi
    expect(G.survival.hp).toBe(0.5);
  });

  it('approxSaveSize düzenleme boyutuyla büyür', () => {
    const small = approxSaveSize({ edits: { '0,0': 'AAAA' } });
    const big = approxSaveSize({ edits: { '0,0': 'A'.repeat(50000) } });
    expect(big).toBeGreaterThan(small + 49000);
    expect(approxSaveSize(null)).toBeGreaterThan(0);
  });
});

describe('geri yükleme gidiş-dönüş (inşa)', () => {
  it('envanter, hayatta kalma, saat, sandık, düzenleme, konum, doğuş, oyun süresi', () => {
    const A = insaG();
    ensureAll(A.world);
    editSome(A.world, 800, 9);
    A.world.setBlock(40, 60, 40, B.STONE);
    A.inventory.setSlot(4, 'blok:taş', 9);
    A.inventory.selected = 3;
    A.survival.hp = 11;
    A.survival.hunger = 9;
    A.clock.time = 123.5;
    A.clock.day = 4;
    A.chests.set('3,50,3', [{ item: 'blok:taş', count: 5 }, null, { item: 'item:elma', count: 2 }]);
    A.body.x = 64.5; A.body.y = 70; A.body.z = 64.5;
    A.player.yaw = 1.25; A.player.pitch = -0.4;
    A.setSpawn = null;
    A.spawn = { x: 20.5, y: 41, z: 22.5 };
    A.bedSpawn = { x: 30.5, y: 41, z: 31.5 };
    A.time.playTime = 777.9;
    A.introDone = true;
    A.progression.stats.blocksPlaced = 31;
    const save = JSON.parse(JSON.stringify(buildSave(A, { name: 'X', createdAt: 5, now: 6, edits: createEditsCache() })));

    const Bg = insaG();
    const r = restoreFromSave(Bg, save);
    expect(r.ok).toBe(true);
    expect(r.name).toBe('X');
    expect(r.createdAt).toBe(5);
    expect(r.intro).toBe(true);
    expect(Bg.inventory.slots[4]).toEqual({ item: 'blok:taş', count: 9 });
    expect(Bg.inventory.selected).toBe(3);
    expect(Bg.survival.hp).toBeCloseTo(11, 1);
    expect(Bg.survival.hunger).toBeCloseTo(9, 1);
    expect(Bg.clock.time).toBeCloseTo(123.5, 1);
    expect(Bg.clock.day).toBe(4);
    expect(Bg.chests.get('3,50,3')[0]).toEqual({ item: 'blok:taş', count: 5 });
    expect(Bg.chests.get('3,50,3')[2]).toEqual({ item: 'item:elma', count: 2 });
    expect(Bg.time.playTime).toBe(777);
    expect(Bg.progression.stats.blocksPlaced).toBe(31);
    expect(Bg.spawn).toEqual({ x: 20.5, y: 41, z: 22.5 });
    expect(Bg.bedSpawn).toEqual({ x: 30.5, y: 41, z: 31.5 });
    expect(Bg.player.yaw).toBeCloseTo(1.25, 2);
    expect(Bg.player.pitch).toBeCloseTo(-0.4, 2);
    expect(Math.abs(Bg.body.x - 64.5)).toBeLessThan(1);
    expect(Math.abs(Bg.body.z - 64.5)).toBeLessThan(1);
    // düzenlemeler uygulandı (dünya yeniden üretilmiş olsa da)
    A.world.forEachChunk(() => {});
    let diff = 0;
    A.world.edits.forEach((id, key) => {
      const [x, y, z] = key.split(',').map(Number);
      Bg.world.ensureChunk(x >> 4, z >> 4);
      if (Bg.world.getBlock(x, y, z) !== id) diff++;
    });
    expect(diff).toBe(0);
    expect(Bg.world.edits.size).toBe(A.world.edits.size);
    // ikinci kayıt aynı düzenlemeleri yazar
    const save2 = buildSave(Bg, { now: 7, edits: createEditsCache() });
    expect(save2.edits).toEqual(save.edits);
  });

  it('bozuk kayıt: ok:false ve oyun bozulmaz', () => {
    const G = insaG();
    const before = G.inventory.toJSON();
    expect(restoreFromSave(G, '{bozuk').ok).toBe(false);
    expect(restoreFromSave(G, { v: 1, mode: 'macera' }).ok).toBe(false); // tohum yok
    expect(restoreFromSave(G, { v: 999, seed: 1 }).code).toBe('newer');
    expect(G.inventory.toJSON()).toEqual(before);
  });

  it('JSON metni de kabul edilir ve sistem durumları ertelenmiş döner', () => {
    const A = insaG();
    const save = buildSave(A, { now: 1, edits: createEditsCache() });
    save.systems = { blocks: { foo: 1 } };
    const r = restoreFromSave(insaG(), JSON.stringify(save));
    expect(r.ok).toBe(true);
    expect(r.systems).toEqual({ blocks: { foo: 1 } });
  });
});

describe('readExt / resolveRestorePosition', () => {
  it('insaBaseOf', () => {
    const G = insaG();
    expect(insaBaseOf(buildSave(G, { now: 1, edits: createEditsCache() }))).toBe('düz');
    expect(insaBaseOf({ ext: { insa: { base: 'hack' } } })).toBe(undefined);
    expect(insaBaseOf(null)).toBe(undefined);
    expect(insaBaseOf({ ext: { insa: { base: 'ada' } } })).toBe('ada');
  });

  it('ext güvenle okunur', () => {
    expect(readExt(null)).toEqual({
      em: null, bed: null, spawn: null, intro: false,
    });
    const e = readExt({
      em: {
        nextId: 12.7, time: -5, rng: 'x', difficulty: 'hack', populated: ['1,2', 5, 'x'.repeat(40), '3,4'],
      },
      bed: [1, 2, 3],
      spawn: [NaN, 1, 2],
      intro: 'evet',
    });
    expect(e.em.nextId).toBe(12);
    expect(e.em.time).toBeUndefined();
    expect(e.em.rng).toBeUndefined();
    expect(e.em.difficulty).toBeUndefined();
    expect(e.em.populated).toEqual(['1,2', '3,4']);
    expect(e.bed).toEqual({ x: 1, y: 2, z: 3 });
    expect(e.spawn).toBe(null);
    expect(e.intro).toBe(false);
    expect(readExt({ bed: [1e9, 2, 3] }).bed).toBe(null);
    expect(readExt({ bed: [1, 9999, 3] }).bed).toBe(null);
  });

  it('konum oturtma: havada → zemine, katıda → arama, sıvıda → olduğu gibi', () => {
    const G = insaG();
    ensureAll(G.world);
    const top = G.world.surfaceY(64, 64, { ignoreFoliage: true });
    const air = resolveRestorePosition(G.world, 64.5, top + 3.4, 64.5);
    expect(air.how).toBe('ground');
    expect(air.y).toBe(top + 1);
    expect(air.x).toBe(64.5);
    const off = resolveRestorePosition(G.world, 70.31, top + 1, 70.77);
    expect(off.how).toBe('ground');
    expect(off.x).toBe(70.31);
    expect(off.z).toBe(70.77);
    const far = resolveRestorePosition(G.world, 64.5, top + 30, 64.5);
    expect(['free', 'search', 'ground']).toContain(far.how);
    // katı bloğun içi
    const inside = resolveRestorePosition(G.world, 64.5, top - 3, 64.5);
    expect(inside.how === 'ground' || inside.how === 'search' || inside.how === 'free').toBe(true);
    expect(Number.isFinite(inside.y)).toBe(true);
    // sıvı
    G.world.setBlock(80, top + 1, 80, B.WATER);
    const wet = resolveRestorePosition(G.world, 80.5, top + 1.2, 80.5);
    expect(wet.how).toBe('liquid');
    expect(wet.y).toBeCloseTo(top + 1.2, 5);
  });
});

describe('kayıt zamanlayıcısı', () => {
  function rig(extra) {
    const G = insaG();
    const saves = [];
    G.callbacks.onSave = (p) => { saves.push(p); };
    const perf = { t: 0 };
    const idleQ = [];
    const saver = createSaver(G, Object.assign({
      now: () => 1700000000000 + perf.t,
      perf: () => perf.t,
      idle: (fn) => { idleQ.push(fn); return () => { const i = idleQ.indexOf(fn); if (i >= 0) idleQ.splice(i, 1); }; },
    }, extra || {}));
    return {
      G, saves, perf, idleQ, saver,
    };
  }

  it('manuel kayıt her zaman çalışır ve onSave yükü doğru', () => {
    const {
      G, saves, saver,
    } = rig();
    const emitted = [];
    G.emit = (e) => emitted.push(e);
    const r = saver.save('manual');
    expect(r.save.v).toBe(SAVE_VERSION);
    expect(saves).toHaveLength(1);
    expect(saves[0].reason).toBe('manual');
    expect(saves[0].save).toBe(r.save);
    expect(saves[0].summary.reason).toBe('manual');
    expect(saves[0].summary.mode).toBe('insa');
    expect(saves[0].summary.bytes).toBeGreaterThan(0);
    expect(emitted[0]).toMatchObject({ type: 'saved', reason: 'manual' });
    saver.save('manual');
    expect(saves).toHaveLength(2);
  });

  it('otomatik: değişmeyen durumda ve 4 sn içinde atlanır; force geçer', () => {
    const {
      G, saves, perf, saver,
    } = rig();
    G.time.tick = 10;
    expect(saver.save('auto')).not.toBe(null);
    expect(saver.save('auto')).toBe(null); // aynı tik
    G.time.tick = 20;
    perf.t += 1000;
    expect(saver.save('auto')).toBe(null); // 4 sn dolmadı
    expect(saver.save('auto', { force: true })).not.toBe(null);
    perf.t += 5000;
    G.time.tick = 30;
    expect(saver.save('auto')).not.toBe(null);
    expect(saves).toHaveLength(3);
  });

  it('minGap: duraklat+gizlen gibi çift tetikleme tek kayıt', () => {
    const {
      G, saves, perf, saver,
    } = rig();
    G.time.tick = 5;
    saver.save('auto', { force: true, minGap: 1500 });
    G.time.tick = 6;
    perf.t += 200;
    expect(saver.save('auto', { force: true, minGap: 1500 })).toBe(null);
    perf.t += 1500;
    expect(saver.save('auto', { force: true, minGap: 1500 })).not.toBe(null);
    expect(saves).toHaveLength(2);
  });

  it('tick: 60 sn oyun süresi sonra boşta kayıt ister ve birleştirir', () => {
    const {
      G, saves, idleQ, perf, saver,
    } = rig();
    G.time.tick = 1;
    for (let i = 0; i < 59; i++) saver.tick(1);
    expect(idleQ).toHaveLength(0);
    saver.tick(1);
    expect(idleQ).toHaveLength(1);
    for (let i = 0; i < 60; i++) saver.tick(1);
    expect(idleQ).toHaveLength(1); // bekleyen varken ikinci istek birleşti
    perf.t += 10000;
    idleQ[0]();
    expect(saves).toHaveLength(1);
    expect(saves[0].reason).toBe('auto');
  });

  it('tick: ölüyken / dünya hazır değilken / dt=0 iken sayılmaz; harita modunda kayıt yok', () => {
    const {
      G, idleQ, saver,
    } = rig();
    G.player.dead = true;
    for (let i = 0; i < 100; i++) saver.tick(1);
    G.player.dead = false;
    G.worldReady = false;
    for (let i = 0; i < 100; i++) saver.tick(1);
    G.worldReady = true;
    saver.tick(0);
    expect(idleQ).toHaveLength(0);
    G.mode = 'harita';
    expect(saver.save('manual')).toBe(null);
    expect(saver.request('auto', { idle: true })).toBe(null);
    expect(idleQ).toHaveLength(0);
  });

  it('onSave yoksa zamanlayıcı kayıt istemez; onSave hata/söz reddi çökertmez', async () => {
    const {
      G, idleQ, saver,
    } = rig();
    G.callbacks.onSave = undefined;
    for (let i = 0; i < 70; i++) saver.tick(1);
    expect(idleQ).toHaveLength(0);
    G.opts.strictSystems = false;
    G.callbacks.onSave = () => { throw new Error('x'); };
    expect(() => saver.save('manual')).not.toThrow();
    G.callbacks.onSave = () => Promise.reject(new Error('y'));
    expect(() => saver.save('manual')).not.toThrow();
    await Promise.resolve();
  });

  it('boyut koruması: sınırı aşan kayıt kesilir ve truncated işaretlenir', () => {
    const {
      G, saves, saver,
    } = rig({ maxBytes: 80000 });
    ensureAll(G.world);
    editSome(G.world, 60000, 4);
    const r = saver.save('manual');
    expect(r.bytes).toBeLessThanOrEqual(80000);
    expect(saves[0].save.truncated).toBe(true);
    expect(Object.keys(saves[0].save.edits).length).toBeLessThan(64);
  }, 60000);

  it('özet: ad/tohum/dünya kodu/bölge', () => {
    const { saver } = rig();
    const s = saver.summary();
    expect(s.mode).toBe('insa');
    expect(s.worldCode).toBe('');
    expect(s.zone.id).toBe(0);
    expect(typeof s.name).toBe('string');
  });

  it('normalizeReason', () => {
    expect(normalizeReason('manual')).toBe('manual');
    expect(normalizeReason('exit')).toBe('exit');
    expect(normalizeReason('bed')).toBe('auto');
    expect(normalizeReason(undefined)).toBe('auto');
  });
});

describe('varlık / ext gidiş-dönüş', () => {
  it('em durumu (kimlik sayacı, doldurulmuş chunk\'lar, varlıklar) korunur', () => {
    const A = insaG();
    ensureAll(A.world);
    A.em.populated.add('3,4');
    A.em.populated.add('5,6');
    const m = A.em.spawn('tavuk', 60.5, 60, 60.5, {});
    const spy = m ? 1 : 0;
    A.em.spawnItem('item:elma', 3, 61.5, 60, 61.5);
    const save = JSON.parse(JSON.stringify(buildSave(A, { now: 1, edits: createEditsCache() })));
    expect(save.ext.em.populated).toEqual(expect.arrayContaining(['3,4', '5,6']));
    const Bg = insaG();
    const restoreSpy = vi.spyOn(Bg.em, 'restore');
    const r = restoreFromSave(Bg, save);
    expect(r.ok).toBe(true);
    expect(restoreSpy).toHaveBeenCalledTimes(1);
    expect(Bg.em.populated.has('3,4')).toBe(true);
    expect(Bg.em.populated.has('5,6')).toBe(true);
    expect(Bg.em.nextId).toBeGreaterThanOrEqual(A.em.nextId);
    expect(Bg.em.items.size).toBe(A.em.items.size);
    expect(Bg.em.mobs.size).toBe(spy ? A.em.mobs.size : 0);
  });
});
