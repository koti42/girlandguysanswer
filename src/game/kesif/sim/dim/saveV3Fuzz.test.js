import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpuMs, scaled } from '../../../../test/perfScale.js';
import { seededRandom } from '../rng.js';
import { deserializeGame, serializeGame } from '../save.js';
import { DIM_SAVE_LIMITS } from './dimensions.js';
import {
  defaultDimMeta, jsonBytes, registerDimSanitizer, sanitizeDimMeta, sanitizeDims, sanitizeNeon, unregisterDimSanitizer,
} from './dimSanitize.js';
import { createDimCtxSim, serializeDim } from './dimState.js';
import {
  baseState, installFlatCity, makeCityWorld, playedNeonCtx, scatterEdits,
} from './dimTestKit.js';
import { unregisterDimGen } from './genRegistry.js';

let uninstall = null;
beforeEach(() => { uninstall = installFlatCity(); });
afterEach(() => { if (uninstall) uninstall(); unregisterDimSanitizer('neon', 'city'); unregisterDimGen('city'); });

/* ------------------------------------------------------------------------------------------------
 * Sıkı doğrulama + fuzz
 * ---------------------------------------------------------------------------------------------- */
/** 8 anahtar × 32 karakter ≈ 300 B: küçük-blob sınırını (160 B) aşar. */
const BIGOBJ = { k1: 'x'.repeat(32), k2: 'x'.repeat(32), k3: 'x'.repeat(32), k4: 'x'.repeat(32), k5: 'x'.repeat(32), k6: 'x'.repeat(32), k7: 'x'.repeat(32), k8: 'x'.repeat(32) };

describe('kimlik regex ve parça doğrulayıcıları', () => {
  it('prop/kilit kimlikleri ^[0-9a-z]{1,10}$; diğerleri atılır', () => {
    const good = ['a', 'z9', '0123456789', 'abcdefghij', '1'];
    const bad = ['', 'A1', 'a-b', 'a b', 'abcdefghijk', 'ğüş', '__proto__', 'a_b', '１２', 'a.b', 'ab\n'];
    const props = {};
    const locks = {};
    good.concat(bad).forEach((k) => { props[k] = [1, 2]; locks[k] = 3; });
    const n = sanitizeNeon({ v: 1, props, locks });
    expect(Object.keys(n.props).sort()).toEqual(good.slice().sort());
    expect(Object.keys(n.locks).sort()).toEqual(good.slice().sort());
  });

  it('prop kaydı [state,flags,extra?]: tamsayı kısma, bozuk kayıtlar atılır', () => {
    const n = sanitizeNeon({
      v: 1,
      props: {
        a: [300, 70000], b: [-5, -5], c: [1.9, 2.9], d: [1], e: 'x', f: null, g: [NaN, Infinity], h: [1, 2, BIGOBJ], i: [1, 2, 5],
      },
    });
    expect(n.props.a).toEqual([255, 65535]);
    expect(n.props.b).toEqual([0, 0]);
    expect(n.props.c).toEqual([1, 2]);
    expect(n.props.g).toEqual([0, 0]);
    expect(n.props.d).toBeUndefined();
    expect(n.props.e).toBeUndefined();
    expect(n.props.f).toBeUndefined();
    expect(n.props.h).toHaveLength(2); // 160 B'yi aşan extra atılır
    expect(n.props.i).toEqual([1, 2, 5]);
  });

  it('kilit durumları: sayı kısılır, boolean 0/1, küçük nesne korunur, büyük/bozuk atılır', () => {
    const n = sanitizeNeon({
      v: 1, locks: {
        a: 70000, b: true, c: false, d: -3, e: { t: 1 }, f: 'x', g: NaN, h: BIGOBJ, i: null,
      },
    });
    expect(n.locks).toEqual({
      a: 65535, b: 1, c: 0, d: 0, e: { t: 1 },
    });
  });

  it('düzenleme anahtarları: yalnız "cx,cz,si" ve şehir sınırı içinde; bozuk RLE atılır', () => {
    const good = scatterEdits(2, 5, 1);
    const k0 = Object.keys(good)[0];
    const n = sanitizeNeon({
      v: 1,
      edits: Object.assign({}, good, {
        '0,0,3': 'bozuk!!', '99,0,3': good[k0], '0,0,48': good[k0], 'x,y,z': good[k0], '0,0': good[k0], '0,0,3,4': 'AA', '__proto__': good[k0], '5,5,5': 12345, '-51,0,3': good[k0],
      }),
    }, []);
    expect(Object.keys(n.edits).sort()).toEqual(Object.keys(good).sort());
  });

  it('stash: yalnız bilinen eşyalar; sayı/dayanıklılık kısılır; ≤64 giriş', () => {
    const stash = [
      { item: 'item:küçük_anahtar', count: 1 }, { item: 'item:ok', count: 99999 }, { item: 'item:kazma_demir', count: 5, dur: 99999 }, { item: 'item:yok', count: 1 },
      { item: '__proto__', count: 1 }, { item: 'constructor', count: 1 }, 5, null, 'x', ['item:ok', 3], { item: 'item:ok', count: NaN },
    ];
    for (let i = 0; i < 100; i++) stash.push({ item: 'item:ok', count: 1 });
    const n = sanitizeNeon({ v: 1, stash });
    expect(n.stash.length).toBeLessThanOrEqual(64);
    n.stash.forEach((e) => {
      expect(typeof e.item).toBe('string');
      expect(['item:küçük_anahtar', 'item:ok', 'item:kazma_demir']).toContain(e.item);
      expect(e.count).toBeGreaterThanOrEqual(1);
    });
    expect(n.stash.find((e) => e.item === 'item:kazma_demir').count).toBe(1);
    expect(n.stash.find((e) => e.item === 'item:kazma_demir').dur).toBeLessThanOrEqual(250);
    expect(n.stash.some((e) => e.item === 'item:ok' && e.count === 64)).toBe(true);
  });

  it('city: ayrıntılı doğrulayıcı kaydedilmişse ona devredilir; çökerse null', () => {
    registerDimSanitizer('neon', 'city', (raw) => ({ v: 1, kredi: Math.min(9999, Math.max(0, Math.floor(Number(raw.kredi) || 0))) }));
    expect(sanitizeNeon({ v: 1, city: { v: 1, kredi: 1e9, evil: 1 } }).city).toEqual({ v: 1, kredi: 9999 });
    registerDimSanitizer('neon', 'city', () => { throw new Error('x'); });
    expect(sanitizeNeon({ v: 1, city: { v: 1 } }).city).toBeNull();
    registerDimSanitizer('neon', 'city', () => 5);
    expect(sanitizeNeon({ v: 1, city: { v: 1 } }).city).toBeNull();
    expect(unregisterDimSanitizer('neon', 'city')).toBe(true);
    expect(sanitizeNeon({ v: 1, city: { v: 1, a: [1, 2] } }).city).toEqual({ v: 1, a: [1, 2] });
  });

  it('city: dizi/ilkel atılır; terminal maskesi 16 bit; saat/hava sınırlanır', () => {
    expect(sanitizeNeon({ v: 1, city: [1] }).city).toBeNull();
    expect(sanitizeNeon({ v: 1, city: 'x' }).city).toBeNull();
    expect(sanitizeNeon({ v: 1, terminals: 1e12 }).terminals).toBe(65535);
    expect(sanitizeNeon({ v: 1, terminals: -4 }).terminals).toBe(0);
    expect(sanitizeNeon({ v: 1, terminals: 'x' }).terminals).toBe(0);
    const n = sanitizeNeon({ v: 1, clock: { time: 99999, day: -3, dayLengthSec: 5 }, weather: { seed: -1, t: 'x' } });
    expect(n.clock.dayLengthSec).toBe(60);
    expect(n.clock.time).toBeLessThan(60);
    expect(n.clock.day).toBe(0);
    expect(n.weather).toEqual({ seed: 0, t: 0 });
    expect(sanitizeNeon({ v: 1, clock: 'x', weather: 5 }).clock).toBeNull();
  });

  it('v alanı: gelecek/bozuk sürüm → null + uyarı; yok → 1 sayılır', () => {
    const w1 = [];
    expect(sanitizeNeon({ v: 2 }, w1)).toBeNull();
    expect(w1).toContain('neon:newer');
    const w2 = [];
    expect(sanitizeNeon({ v: 0 }, w2)).toBeNull();
    expect(sanitizeNeon({ v: 1.5 }, [])).toBeNull();
    expect(sanitizeNeon({ v: 'x' }, [])).toBeNull();
    expect(sanitizeNeon({}, [])).not.toBeNull();
    expect(sanitizeNeon(null)).toBeNull();
    expect(sanitizeNeon([])).toBeNull();
    expect(sanitizeNeon('x')).toBeNull();
  });

  it('sanitizeDims: yalnız neon; bilinmeyen boyut anahtarları atılır', () => {
    const d = sanitizeDims({ neon: { v: 1 }, mars: { v: 1 }, overworld: {}, __proto__: { x: 1 } });
    expect(Object.keys(d)).toEqual(['neon']);
    expect(sanitizeDims(null)).toEqual({});
    expect(sanitizeDims([])).toEqual({});
    expect(sanitizeDims({ neon: 5 })).toEqual({});
  });

  it('sanitizeNeon idempotent: temiz blob tekrar temizlenince aynı', () => {
    const blob = serializeDim(playedNeonCtx(5));
    const once = sanitizeNeon(JSON.parse(JSON.stringify(blob)));
    const twice = sanitizeNeon(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(once).toEqual(JSON.parse(JSON.stringify(blob)));
  });
});

describe('fuzz: prototip kirliliği, NaN, dev diziler, rastgele bozma', () => {
  const POLLUTE = '{"__proto__":{"polluted":"evet"},"constructor":{"prototype":{"polluted2":"evet"}},"prototype":{"polluted3":1}}';

  function expectClean() {
    expect({}.polluted).toBeUndefined();
    expect({}.polluted2).toBeUndefined();
    expect({}.polluted3).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
    expect([].polluted).toBeUndefined();
  }

  it('JSON.parse ile gelen __proto__/constructor/prototype anahtarları her alanda atılır', () => {
    const evil = JSON.parse(POLLUTE);
    const raw = {
      v: 1,
      edits: JSON.parse('{"__proto__":{"polluted":1},"0,0,30":"AA"}'),
      props: JSON.parse('{"__proto__":[1,2],"abc":[1,2,{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted2":1}}}]}'),
      locks: JSON.parse('{"__proto__":1,"prototype":2,"a":{"__proto__":{"polluted":1}}}'),
      chests: JSON.parse('{"__proto__":[],"1,64,1":[]}'),
      city: Object.assign({ v: 1 }, evil, { nested: JSON.parse(POLLUTE), arr: [JSON.parse(POLLUTE)] }),
      stash: [JSON.parse('{"item":"item:ok","count":2,"__proto__":{"polluted":1}}'), evil],
      entities: [JSON.parse('{"type":"gozdrone","x":1,"y":2,"z":3,"__proto__":{"polluted":1}}')],
      tech: evil,
      clock: evil,
      weather: evil,
    };
    const n = sanitizeNeon(raw);
    expectClean();
    const text = JSON.stringify(n);
    expect(text).not.toMatch(/__proto__/);
    expect(text).not.toMatch(/"constructor"/);
    expect(text).not.toMatch(/"prototype"/);
    expect(text).not.toMatch(/polluted/);
    ['edits', 'props', 'locks', 'chests', 'city', 'stash', 'entities'].forEach((k) => expect(k in n).toBe(true));
    expect(Object.getPrototypeOf(n.props)).toBe(Object.prototype);
  });

  it('kayıt düzeyinde: dimMeta/player/dims içinde kirletme denemesi sonuçsuz', () => {
    const sv = serializeGame(baseState({ dims: { neon: serializeDim(createDimCtxSim('neon', 1)) } }));
    const json = JSON.stringify(sv).replace('"dimMeta":{', '"dimMeta":' + POLLUTE.slice(0, -1) + ',')
      .replace('"dims":{', '"dims":{"__proto__":{"polluted":1},"constructor":{"x":1},');
    const r = deserializeGame(json);
    expect(r.ok).toBe(true);
    expectClean();
    expect(Object.keys(r.game.dims)).toEqual(['neon']);
    expect(JSON.stringify(r.game.dimMeta)).not.toMatch(/polluted|__proto__/);
  });

  it('NaN/Infinity/aşırı değerler her sayısal alanda güvenli', () => {
    const bad = [NaN, Infinity, -Infinity, 1e308, -1e308, '1e999', '  ', {}, [], true];
    bad.forEach((b) => {
      const n = sanitizeNeon({
        v: 1,
        clock: { time: b, day: b, dayLengthSec: b },
        weather: { seed: b, t: b },
        spawn: [b, b, b],
        terminals: b,
        props: { a: [b, b] },
        locks: { a: b },
        stash: [{ item: 'item:ok', count: b }],
        entities: [{ type: 'gozdrone', x: b, y: b, z: b }],
        city: { v: 1, x: b, arr: [b, b] },
      });
      expect(n).not.toBeNull();
      const text = JSON.stringify(n);
      expect(text).not.toMatch(/null,null|NaN|Infinity/);
      const nums = [];
      JSON.stringify(n, (k, v) => { if (typeof v === 'number') nums.push(v); return v; });
      nums.forEach((x) => expect(Number.isFinite(x)).toBe(true));
    });
    const m = sanitizeDimMeta({ visits: NaN, lastHopAt: Infinity, overworldPos: [NaN, 1, 2], link: { from: [1, 2, 3, NaN] } });
    expect(m.visits).toBe(0);
    expect(m.overworldPos).toBeNull();
    expect(m.link.from[3]).toBe(0);
  });

  it('dev diziler/nesneler sınırlanır ve hızlı işlenir', () => {
    const t0 = cpuMs();
    const huge = [];
    for (let i = 0; i < 200000; i++) huge.push({ type: 'gozdrone', x: i, y: 64, z: i });
    const stash = [];
    for (let i = 0; i < 100000; i++) stash.push({ item: 'item:ok', count: 1 });
    const props = {};
    for (let i = 0; i < 60000; i++) props[i.toString(36)] = [1, 2];
    const locks = {};
    for (let i = 0; i < 60000; i++) locks[i.toString(36)] = 1;
    const deep = {};
    let cur = deep;
    for (let i = 0; i < 5000; i++) { cur.a = {}; cur = cur.a; }
    const n = sanitizeNeon({
      v: 1, entities: huge, stash, props, locks, city: { v: 1, arr: new Array(100000).fill(1), deep, str: 'x'.repeat(1e6) },
    });
    expect(n.entities.length).toBeLessThanOrEqual(DIM_SAVE_LIMITS.entities);
    expect(n.stash.length).toBeLessThanOrEqual(64);
    expect(jsonBytes(n.props)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.props);
    expect(Object.keys(n.locks).length).toBeLessThanOrEqual(4096);
    expect(n.city === null || jsonBytes(n.city) <= DIM_SAVE_LIMITS.city).toBe(true);
    expect(jsonBytes(n)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.total);
    expect(cpuMs() - t0).toBeLessThan(scaled(8000));
  });

  it('2000 rastgele bozulmuş kayıt: asla atmaz; ok ise değişmezler korunur', () => {
    const ctx = playedNeonCtx(77);
    const sv = serializeGame(baseState({
      dim: 'neon', dimMeta: { calibrated: true, visits: 3, link: { from: [1, 70, 2, 0.5] }, overworldPos: [1, 70, 2] }, dims: { neon: serializeDim(ctx) },
    }));
    const text = JSON.stringify(sv);
    const rng = seededRandom(2026);
    const junk = ['null', '"x"', '{}', '[]', '-1', '1e999', '"__proto__"', '99999999999', 'true', '[1,2,3]', '{"a":1}', '"neon"', '0'];
    let oks = 0;
    for (let it = 0; it < 2000; it++) {
      let t = text;
      const muts = rng.int(1, 4);
      for (let m = 0; m < muts; m++) {
        const kind = rng.int(0, 2);
        if (kind === 0) {
          // rastgele değeri çöple değiştir: bir sayı/metin değerinin konumunda
          const pos = rng.int(0, t.length - 1);
          const m1 = /[:[,]("[^"]*"|-?[0-9.e+]+|true|false|null)/g;
          m1.lastIndex = pos;
          const mm = m1.exec(t);
          if (mm) t = t.slice(0, mm.index + 1) + junk[rng.int(0, junk.length - 1)] + t.slice(mm.index + mm[0].length);
        } else if (kind === 1) {
          const pos = rng.int(0, t.length - 1);
          t = t.slice(0, pos) + t.slice(pos + rng.int(1, 6));
        } else {
          const pos = rng.int(0, t.length - 1);
          t = t.slice(0, pos) + junk[rng.int(0, junk.length - 1)] + t.slice(pos);
        }
      }
      let r;
      expect(() => { r = deserializeGame(t); }).not.toThrow();
      expect(typeof r.ok).toBe('boolean');
      if (r.ok) {
        oks++;
        const g = r.game;
        expect(['overworld', 'neon']).toContain(g.player.dim);
        expect(Object.keys(g.dims).every((k) => k === 'neon')).toBe(true);
        if (g.player.dim === 'neon') expect(g.dims.neon).toBeTruthy();
        if (g.dims.neon) {
          expect(jsonBytes(g.dims.neon)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.total);
          Object.keys(g.dims.neon.props).forEach((k) => expect(/^[0-9a-z]{1,10}$/.test(k)).toBe(true));
          Object.keys(g.dims.neon.locks).forEach((k) => expect(/^[0-9a-z]{1,10}$/.test(k)).toBe(true));
          expect(Number.isInteger(g.dims.neon.terminals) && g.dims.neon.terminals >= 0 && g.dims.neon.terminals <= 65535).toBe(true);
        }
        expect(typeof g.dimMeta.calibrated).toBe('boolean');
        expect(Number.isFinite(g.dimMeta.visits) && g.dimMeta.visits >= 0).toBe(true);
        if (g.player.pos !== null) g.player.pos.forEach((n) => expect(Number.isFinite(n)).toBe(true));
        expectClean();
      }
    }
    expect(oks).toBeGreaterThan(200);
  });
});

describe('overworld kaydı v3 biçimi', () => {
  it('macera kaydı: player.dim overworld, dimMeta varsayılan, dims boş; diğer alanlar v2 ile aynı', () => {
    const sv = serializeGame(baseState());
    expect(sv.player.dim).toBe('overworld');
    expect(sv.dimMeta).toEqual(defaultDimMeta());
    expect(sv.dims).toEqual({});
    ['mode', 'seed', 'name', 'createdAt', 'savedAt', 'playTime', 'time', 'edits', 'editStats', 'progression', 'puzzleStates', 'entities', 'drops', 'chests', 'discovered']
      .forEach((k) => expect(k in sv).toBe(true));
  });

  it('serileştirme deterministik (aynı durum → aynı bayt)', () => {
    const blob = serializeDim(playedNeonCtx(5));
    const a = JSON.stringify(serializeGame(baseState({ dim: 'neon', dims: { neon: blob } })));
    const b = JSON.stringify(serializeGame(baseState({ dim: 'neon', dims: { neon: blob } })));
    expect(a).toBe(b);
    const c1 = JSON.stringify(serializeDim(playedNeonCtx(5)));
    const c2 = JSON.stringify(serializeDim(playedNeonCtx(5)));
    expect(c1).toBe(c2);
  });
});

describe('açık kapıyla kaydet (kapı kayda girmez)', () => {
  it('kayıtta kapı/geçiş nesnesi alanı yok; bilinmeyen dims.neon alanları atılır', () => {
    const blob = serializeDim(createDimCtxSim('neon', 2));
    const sv = serializeGame(baseState({ dims: { neon: Object.assign({}, blob, { gate: { x: 1 }, openGate: true }) } }));
    // serileştirme yolu bilinmeyen alanları taşımaz
    const r = deserializeGame(JSON.stringify(sv));
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r.game.dims.neon)).not.toMatch(/gate|openGate/);
  });
});

function same(x, y) {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

describe('makeCityWorld kiti (test aracı) kendi kendini doğrular', () => {
  it('düz şehir üretici bayt-belirlenimci', () => {
    const a = makeCityWorld(1);
    const b = makeCityWorld(1);
    a.ensureChunk(0, 0);
    b.ensureChunk(0, 0);
    expect(same(a.getChunk(0, 0).toDense(0, 128), b.getChunk(0, 0).toDense(0, 128))).toBe(true);
  });
});

