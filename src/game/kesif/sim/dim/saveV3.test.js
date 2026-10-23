import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { SAVE_VERSION } from '../constants.js';
import { Inventory } from '../inventory.js';
import {
  deserializeGame, migrateSave, serializeGame, summarizeSave,
} from '../save.js';
import { cleanDimId } from './dimensions.js';
import { defaultDimMeta, sanitizeDimMeta, unregisterDimSanitizer } from './dimSanitize.js';
import {
  createDimCtxSim, restoreDim, serializeDim, splitEntities,
} from './dimState.js';
import {
  baseState, fakeWorld, installFlatCity, playedNeonCtx, v2Save,
} from './dimTestKit.js';
import { unregisterDimGen } from './genRegistry.js';

let uninstall = null;
beforeEach(() => { uninstall = installFlatCity(); });
afterEach(() => { if (uninstall) uninstall(); unregisterDimSanitizer('neon', 'city'); unregisterDimGen('city'); });

/* ------------------------------------------------------------------------------------------------
 * v2 → v3 göçü
 * ---------------------------------------------------------------------------------------------- */
describe('v2 → v3 sessiz göç', () => {
  it('SAVE_VERSION 3; serileştirme v3 yazar', () => {
    expect(SAVE_VERSION).toBe(3);
    expect(serializeGame(baseState()).v).toBe(3);
  });

  it('migrateSave sözleşmedeki biçimi üretir; v2 alanları aynen kalır; girdi değişmez', () => {
    const v2 = v2Save();
    const snap = JSON.stringify(v2);
    const m = migrateSave(v2);
    expect(m.ok).toBe(true);
    expect(m.from).toBe(2);
    expect(m.data.v).toBe(3);
    expect(m.data.player.dim).toBe('overworld');
    expect(m.data.dimMeta).toEqual({
      calibrated: false, visits: 0, link: null, lastHopAt: 0, overworldPos: null,
    });
    expect(m.data.dims).toEqual({});
    const back = JSON.parse(JSON.stringify(m.data));
    delete back.dimMeta;
    delete back.dims;
    delete back.player.dim;
    back.v = 2;
    expect(back).toEqual(v2);
    expect(JSON.stringify(v2)).toBe(snap);
  });

  it('deserializeGame v2 kaydı sessizce açar: uyarı yok, migratedFrom 2, overworld, varsayılan dimMeta, boş dims', () => {
    const r = deserializeGame(JSON.stringify(v2Save()));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.game.v).toBe(3);
    expect(r.game.migratedFrom).toBe(2);
    expect(r.game.player.dim).toBe('overworld');
    expect(r.game.dimMeta).toEqual(defaultDimMeta());
    expect(r.game.dims).toEqual({});
    expect(r.game.player.pos).toEqual([10.5, 70, 20.5]);
  });

  it('v1 insa ve v0 kayıtları zincirle v3 olur; v1 macera hâlâ "oldworld" reddedilir', () => {
    const ins = { v: 1, mode: 'insa', seed: 5, name: 'Ev', pos: undefined, edits: {} };
    const r1 = deserializeGame(ins);
    expect(r1.ok).toBe(true);
    expect(r1.game.v).toBe(3);
    expect(r1.game.migratedFrom).toBe(1);
    const r0 = deserializeGame({ seed: 5, mode: 'insa', pos: [1, 70, 2], edits: {} });
    expect(r0.ok).toBe(true);
    expect(r0.game.migratedFrom).toBe(0);
    expect(deserializeGame({ v: 1, seed: 5, mode: 'macera' }).code).toBe('oldworld');
  });

  it('insa/harita kaydı: dim alanları yazılmaz, okunurken yok sayılır', () => {
    const sv = serializeGame(baseState({ mode: 'insa' }));
    expect(sv.dims).toBeUndefined();
    expect(sv.dimMeta).toBeUndefined();
    expect(sv.player.dim).toBeUndefined();
    const smuggled = Object.assign({}, sv, {
      dims: { neon: { v: 1 } }, dimMeta: { calibrated: true }, player: Object.assign({}, sv.player, { dim: 'neon' }),
    });
    const r = deserializeGame(smuggled);
    expect(r.ok).toBe(true);
    expect(r.game.player.dim).toBe('overworld');
    expect(r.game.dims).toEqual({});
    expect(r.game.dimMeta).toEqual(defaultDimMeta());
  });

  it('player bozuk (metin) v2 kaydı da göç eder, atmaz', () => {
    const v2 = v2Save();
    v2.player = 'bozuk';
    const r = deserializeGame(v2);
    expect(r.ok).toBe(true);
    expect(r.game.player.dim).toBe('overworld');
  });

  it('göçten geçen kayıt tekrar serileştirilince v3 olur ve dims boş', () => {
    const r = deserializeGame(v2Save());
    const sv = serializeGame(baseState({ dim: r.game.player.dim, dimMeta: r.game.dimMeta, dims: r.game.dims }));
    expect(sv.v).toBe(3);
    expect(sv.dims).toEqual({});
    expect(sv.player.dim).toBe('overworld');
  });
});

/* ------------------------------------------------------------------------------------------------
 * Eski istemci reddi
 * ---------------------------------------------------------------------------------------------- */
describe('eski istemci (v2) v3 kaydını mevcut "daha yeni sürüm" iletisiyle reddeder', () => {
  /** v2 sürümündeki kapı: save.js deserializeGame içindeki sürüm denetiminin aynısı (SAVE_VERSION = 2). */
  const OLD_SAVE_VERSION = 2;
  function oldClientDeserialize(data) {
    if (Number.isInteger(data.v) && data.v > OLD_SAVE_VERSION) {
      return { ok: false, code: 'newer', error: 'Bu kayıt daha yeni bir sürümden. Uygulamayı güncelle.' };
    }
    return { ok: true };
  }

  it('v3 kayıt eski kapıdan geçemez; ileti yeni istemcideki "newer" iletisiyle aynı', () => {
    const sv = serializeGame(baseState());
    const old = oldClientDeserialize(JSON.parse(JSON.stringify(sv)));
    expect(old.ok).toBe(false);
    expect(old.code).toBe('newer');
    const now = deserializeGame(Object.assign({}, sv, { v: SAVE_VERSION + 1 }));
    expect(now.ok).toBe(false);
    expect(now.code).toBe('newer');
    expect(now.error).toBe(old.error);
    expect(now.error).toBe('Bu kayıt daha yeni bir sürümden. Uygulamayı güncelle.');
  });

  it('v2 kayıt eski kapıdan hâlâ geçer; yeni istemci v3 ve daha eskiyi açar', () => {
    expect(oldClientDeserialize(v2Save()).ok).toBe(true);
    expect(deserializeGame(serializeGame(baseState())).ok).toBe(true);
  });
});

/* ------------------------------------------------------------------------------------------------
 * dimMeta / player.dim
 * ---------------------------------------------------------------------------------------------- */
describe('sanitizeDimMeta', () => {
  it('geçerli girdiyi korur', () => {
    const m = {
      calibrated: true, visits: 7, firstArrival: 1700000123456, link: { from: [10.5, 70, 20.5, 1.234] }, overworldPos: [1, 2, 3], lastHopAt: 321.5,
    };
    expect(sanitizeDimMeta(m)).toEqual(m);
  });

  it('bozuk/bilinmeyen alanları atar, sınırlar', () => {
    const t = [
      [undefined, defaultDimMeta()],
      [null, defaultDimMeta()],
      ['x', defaultDimMeta()],
      [[], defaultDimMeta()],
      [{ calibrated: 'true', visits: -5, lastHopAt: 'x', link: 5, overworldPos: [1, 2] }, defaultDimMeta()],
    ];
    t.forEach(([inp, out]) => expect(sanitizeDimMeta(inp)).toEqual(out));
    const m = sanitizeDimMeta({
      calibrated: 1, visits: 1e12, firstArrival: -5, link: { from: [NaN, 0, 0, 0] }, lastHopAt: 1e15, extra: 1, __proto__: { x: 1 },
    });
    expect(m.calibrated).toBe(false);
    expect(m.visits).toBe(1000000);
    expect(m.firstArrival).toBeNull();
    expect(m.link).toBeNull();
    expect(m.lastHopAt).toBe(1e9);
    expect(Object.keys(m).sort()).toEqual(['calibrated', 'firstArrival', 'lastHopAt', 'link', 'overworldPos', 'visits']);
  });

  it('link.from: yaw yoksa 0; derin y korunur (Kasa y≈-100)', () => {
    expect(sanitizeDimMeta({ link: { from: [1, -100, 2] } }).link).toEqual({ from: [1, -100, 2, 0] });
    expect(sanitizeDimMeta({ overworldPos: [5, -300, 5] }).overworldPos).toEqual([5, -300, 5]);
  });

  it('cleanDimId', () => {
    expect(cleanDimId('neon')).toBe('neon');
    ['city', '', null, 3, {}, '__proto__'].forEach((v) => expect(cleanDimId(v)).toBe('overworld'));
  });
});

/* ------------------------------------------------------------------------------------------------
 * Boyut bağlamı + gidiş-dönüş
 * ---------------------------------------------------------------------------------------------- */
describe('createDimCtxSim', () => {
  it('neon bağlamı: tohum, saat (600 sn, 19:30), terminaller, boş durum', () => {
    const ctx = createDimCtxSim('neon', 4242);
    expect(ctx.id).toBe('neon');
    expect(ctx.world.dim).toBe('neon');
    expect(ctx.seed).toBe(ctx.world.seed);
    expect(ctx.clock.dayLengthSec).toBe(600);
    expect(ctx.clock.time / ctx.clock.dayLengthSec).toBeCloseTo(0.8125, 9);
    expect(ctx.terminals).toEqual({ found: 0, list: null });
    expect(ctx.locks).toEqual({});
    expect(ctx.stash).toEqual([]);
    expect(ctx.city).toBeNull();
    expect(ctx.puzzles).toBeNull();
    expect(ctx.chests).toBeInstanceOf(Map);
    expect(ctx.tech).toBeTruthy();
    ['props', 'colliders', 'crowd', 'vehicles', 'em', 'spawner'].forEach((k) => expect(ctx[k]).toBeNull());
  });

  it('belirlenimci: aynı dünya tohumu → aynı bağlam tohumu/hava; farklı tohum → farklı', () => {
    const a = createDimCtxSim('neon', 1);
    const b = createDimCtxSim('neon', 1);
    const c = createDimCtxSim('neon', 2);
    expect(a.seed).toBe(b.seed);
    expect(a.weatherSim.seed).toBe(b.weatherSim.seed);
    expect(a.seed).not.toBe(c.seed);
    expect(a.weatherSim.seed).not.toBe(c.weatherSim.seed);
  });

  it('overworld bağlamı ve bilinmeyen boyut', () => {
    const o = createDimCtxSim('overworld', 9);
    expect(o.world.dim).toBe('overworld');
    expect(o.seed).toBe(9);
    expect(serializeDim(o)).toBeNull();
    expect(() => createDimCtxSim('yok', 1)).toThrow(/Bilinmeyen boyut/);
  });

  it('makeEm ile varlık yöneticisi verilir', () => {
    const ctx = createDimCtxSim('neon', 1, { makeEm: (w, seed) => ({ w, seed }) });
    expect(ctx.em.w).toBe(ctx.world);
    expect(ctx.em.seed).toBe(ctx.seed);
  });
});

describe('dims.neon gidiş-dönüş (serileştir → JSON → doğrula → geri yükle)', () => {
  it('tam durum aynen geri gelir; overworld verisi ve oyuncu konumu korunur', () => {
    const ctx = playedNeonCtx(4242);
    const blob = serializeDim(ctx);
    expect(blob.v).toBe(1);
    expect(Object.keys(blob).sort()).toEqual(['chests', 'city', 'clock', 'edits', 'entities', 'locks', 'props', 'spawn', 'stash', 'tech', 'terminals', 'v', 'weather']);
    const dimMeta = {
      calibrated: true, visits: 2, firstArrival: 1700000000000, link: { from: [100.5, 70, -40.5, 0.5] }, overworldPos: [100.5, 70, -40.5], lastHopAt: 55,
    };
    const ow = new Map([['3,70,3', B.STONE]]);
    const inv = new Inventory();
    inv.add('blok:taş', 5);
    const sv = serializeGame(baseState({
      world: fakeWorld(ow),
      dim: 'neon',
      dimMeta,
      dims: { neon: blob },
      inventory: inv,
      player: { pos: [0.5, 64, 2.5], yaw: 3, pitch: 0 },
    }));
    expect(sv.player.dim).toBe('neon');
    expect(sv.player.pos).toEqual([0.5, 64, 2.5]);
    const json = JSON.stringify(sv);
    const r = deserializeGame(json);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.game.player.dim).toBe('neon');
    expect(r.game.dimMeta).toEqual(dimMeta);
    expect(r.game.dims.neon).toEqual(JSON.parse(JSON.stringify(blob)));
    expect(r.game.edits.count).toBe(1); // overworld düzenlemesi
    expect(r.game.player.inventory.slots.some((s) => Array.isArray(s) && s[0] === 'blok:taş')).toBe(true);

    // geri yükle
    const ctx2 = createDimCtxSim('neon', 4242);
    ctx2.world.cityRules = ctx.world.cityRules;
    ctx2.props = { data: null, serialize() { return this.data; }, restore(o) { this.data = o; } };
    ctx2.em = { last: null, serialize() { return this.last || {}; }, restore(o) { this.last = o; } };
    const w2 = ctx2.world;
    const res = restoreDim(ctx2, r.game.dims.neon);
    expect(res.ok).toBe(true);
    expect(res.warnings).toEqual([]);
    expect(Array.from(w2.edits.entries()).sort()).toEqual(Array.from(ctx.world.edits.entries()).sort());
    expect(ctx2.clock.time).toBeCloseTo(123.5, 1);
    expect(ctx2.clock.day).toBe(3);
    expect(ctx2.weatherSim.t).toBeCloseTo(77.7, 1);
    expect(ctx2.spawn).toEqual([0.5, 64, 2.5]);
    expect(ctx2.terminals.found).toBe((1 << 3) | (1 << 9));
    expect(ctx2.locks).toEqual({ abc12: 2, z9: 1 });
    expect(ctx2.chests.get('4,64,4')[2]).toEqual({ item: 'item:kazma_demir', count: 1, dur: 80 });
    expect(ctx2.stash).toEqual([{ item: 'item:küçük_anahtar', count: 1 }, { item: 'item:ok', count: 12 }]);
    expect(ctx2.city).toEqual(JSON.parse(JSON.stringify(ctx.city)));
    expect(ctx2.props.data).toEqual({ abc12: [1, 0], q7: [2, 3, { open: true }] });
    expect(ctx2.em.last.mobs).toHaveLength(1);
    expect(ctx2.em.last.mobs[0]).toMatchObject({ type: 'gozdrone', x: 10, hp: 6 });
    expect(ctx2.em.last.items[0]).toMatchObject({ item: 'item:ok', count: 3 });
    // düzenlemeler üretimden sonra da uygulanır
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) w2.ensureChunk(cx, cz);
    expect(w2.getBlock(5, 62, 5)).toBe(0);
    expect(w2.getBlock(6, 64, 6)).toBe(B.DIRT);
    expect(w2.getBlock(-7, 70, 20)).toBe(B.GLASS);
    // ikinci tur: aynı blob (idempotent)
    expect(serializeDim(ctx2)).toEqual(blob);
  });

  it('restoreDim nesne kimliklerini korur (clock/tech/chests/locks/terminals/stash yerinde)', () => {
    const ctx = createDimCtxSim('neon', 7);
    const ids = {
      clock: ctx.clock, tech: ctx.tech, chests: ctx.chests, locks: ctx.locks, terminals: ctx.terminals, stash: ctx.stash, weather: ctx.weatherSim, world: ctx.world,
    };
    const src = playedNeonCtx(7);
    const r = restoreDim(ctx, JSON.parse(JSON.stringify(serializeDim(src))));
    expect(r.ok).toBe(true);
    expect(ctx.clock).toBe(ids.clock);
    expect(ctx.tech).toBe(ids.tech);
    expect(ctx.chests).toBe(ids.chests);
    expect(ctx.locks).toBe(ids.locks);
    expect(ctx.terminals).toBe(ids.terminals);
    expect(ctx.stash).toBe(ids.stash);
    expect(ctx.weatherSim).toBe(ids.weather);
    expect(ctx.world).toBe(ids.world);
    expect(ctx.locks).toEqual({ abc12: 2, z9: 1 });
    expect(ctx.chests.size).toBe(1);
  });

  it('geçersiz blob: ok:false ve bağlama dokunulmaz', () => {
    const ctx = createDimCtxSim('neon', 7);
    ctx.locks.keep = 1;
    ['x', null, [], 5, { v: 99 }, { v: -1 }, { v: 'a' }].forEach((bad) => {
      const r = restoreDim(ctx, bad);
      expect(r.ok).toBe(false);
    });
    expect(ctx.locks).toEqual({ keep: 1 });
    expect(restoreDim(null, {}).ok).toBe(false);
    expect(restoreDim(createDimCtxSim('overworld', 1), {}).ok).toBe(false);
  });

  it('boş/yeni bağlam serileştirilir ve geri yüklenir (taze şehir)', () => {
    const ctx = createDimCtxSim('neon', 11);
    const blob = serializeDim(ctx);
    expect(blob.edits).toEqual({});
    expect(blob.terminals).toBe(0);
    expect(blob.stash).toEqual([]);
    expect(blob.city).toBeNull();
    const c2 = createDimCtxSim('neon', 11);
    expect(restoreDim(c2, JSON.parse(JSON.stringify(blob))).ok).toBe(true);
  });

  it('splitEntities: tür alanı olanlar yaratık, eşya alanı olanlar düşen eşya', () => {
    const s = splitEntities([{ type: 'a' }, { item: 'x' }, null, 5, { z: 1 }]);
    expect(s.mobs).toEqual([{ type: 'a' }]);
    expect(s.items).toEqual([{ item: 'x' }]);
    expect(splitEntities('x')).toEqual({ mobs: [], items: [] });
  });
});

describe('yükleme güvenliği: player.dim ve dims tutarlılığı', () => {
  it('player.dim neon ama dims.neon yok → overworld konumuna dönülür + uyarı', () => {
    const sv = serializeGame(baseState({
      dim: 'neon', dimMeta: { overworldPos: [100, 70, 100] }, dims: { neon: serializeDim(playedNeonCtx(1)) }, player: { pos: [0.5, 64, 2.5] },
    }));
    const tampered = JSON.parse(JSON.stringify(sv));
    delete tampered.dims;
    const r = deserializeGame(tampered);
    expect(r.ok).toBe(true);
    expect(r.game.player.dim).toBe('overworld');
    expect(r.game.player.pos).toEqual([100, 70, 100]);
    expect(r.warnings).toContain('dim:neon');
  });

  it('serializeGame: dim neon ama dims.neon verilmemiş → overworld olarak yazılır (overworldPos)', () => {
    const sv = serializeGame(baseState({ dim: 'neon', dimMeta: { overworldPos: [9, 70, 9] }, player: { pos: [0.5, 64, 2.5] } }));
    expect(sv.player.dim).toBe('overworld');
    expect(sv.player.pos).toEqual([9, 70, 9]);
    expect(sv.dims).toEqual({});
  });

  it('bilinmeyen boyut kimliği → overworld', () => {
    ['mars', '', null, 7, '__proto__'].forEach((d) => {
      const sv = serializeGame(baseState());
      sv.player.dim = d;
      expect(deserializeGame(sv).game.player.dim).toBe('overworld');
    });
  });

  it('şehir konumu sınırlara kısılır; derin y (Kasa) kayıpsız', () => {
    const blob = serializeDim(createDimCtxSim('neon', 3));
    const sv = serializeGame(baseState({ dim: 'neon', dims: { neon: blob }, player: { pos: [5000, -100, -9000] } }));
    expect(sv.player.pos[1]).toBe(-100);
    const r = deserializeGame(sv);
    expect(r.game.player.dim).toBe('neon');
    expect(r.game.player.pos[0]).toBeLessThanOrEqual(798);
    expect(r.game.player.pos[2]).toBeGreaterThanOrEqual(-799);
    expect(r.game.player.pos[1]).toBe(-100);
  });

  it('özet (summarizeSave) boyutu gösterir', () => {
    const sv = serializeGame(baseState({ dim: 'neon', dims: { neon: serializeDim(createDimCtxSim('neon', 3)) } }));
    expect(summarizeSave(sv).dim).toBe('neon');
    expect(summarizeSave(serializeGame(baseState())).dim).toBe('overworld');
    expect(summarizeSave(null).dim).toBe('overworld');
    expect(summarizeSave({ player: { dim: 'neon' } }).dim).toBe('neon');
    expect(summarizeSave({ player: { dim: 'x' } }).dim).toBe('overworld');
  });
});

