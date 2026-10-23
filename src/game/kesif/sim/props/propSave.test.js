import { describe, expect, it } from 'vitest';
import {
  PROP_SAVE_MAX_BYTES, PROP_SAVE_MAX_ENTRIES, decodeProps, encodeProps, idToStr, jsonBytes, sanitizeEntry, sanitizeExtra, strToId,
} from './propSave.js';
import { PropWorld } from './propWorld.js';
import { PROP_DEFS } from './propDefs.js';
import { hash32 } from '../rng.js';

describe('propSave — kimlik ve satır temizliği', () => {
  it('idToStr/strToId gidiş-dönüş (u32 sınırları dahil); geçersiz metin null', () => {
    [0, 1, 35, 36, 1295, 65535, 0x7fffffff, 0x80000000, 0xffffffff, 3735928559].forEach((id) => {
      const s = idToStr(id);
      expect(/^[0-9a-z]{1,7}$/.test(s)).toBe(true);
      expect(strToId(s)).toBe(id);
    });
    ['', 'A', 'zzzzzzzz', '__proto__', 'a b', '1.5', '-1', 'zzzzzz1', null, undefined, 5, {}, [], 'ß'].forEach((s) => expect(strToId(s)).toBeNull());
    expect(strToId('zzzzzzz')).toBeNull(); // 36^7-1 > u32
  });

  it('sanitizeEntry: geçerli satırlar korunur; aralık/tür dışı atılır', () => {
    expect(sanitizeEntry([1])).toEqual([1, 0]);
    expect(sanitizeEntry([1, 5])).toEqual([1, 5]);
    expect(sanitizeEntry([2, 0, 7])).toEqual([2, 0, 7]);
    expect(sanitizeEntry([2, 0, 'ok_1'])).toEqual([2, 0, 'ok_1']);
    expect(sanitizeEntry([2, 0, [1, 2, 3]])).toEqual([2, 0, [1, 2, 3]]);
    [null, undefined, 5, 'x', {}, [], [1, 2, 3, 4], [-1], [256], [1.5], [NaN], [1, -1], [1, 65536], [1, 0.5], [Infinity, 0], ['1', 0]].forEach((r) => {
      expect(sanitizeEntry(r), JSON.stringify(r)).toBeNull();
    });
    // geçersiz extra düşer ama satır kalır
    expect(sanitizeEntry([1, 0, { a: 1 }])).toEqual([1, 0]);
    expect(sanitizeEntry([1, 0, 'x'.repeat(30)])).toEqual([1, 0]);
    expect(sanitizeEntry([1, 0, '<script>'])).toEqual([1, 0]);
    expect(sanitizeEntry([1, 0, 1e300])).toEqual([1, 0]);
    expect(sanitizeEntry([1, 0, [1, 2, 3, 4, 5, 6, 7, 8, 9]])).toEqual([1, 0]);
    expect(sanitizeEntry([1, 0, [1, NaN]])).toEqual([1, 0]);
  });

  it('sanitizeExtra: sayı yuvarlanır (1e-3), Türkçe harfli kısa metin geçer', () => {
    expect(sanitizeExtra(1.23456)).toBe(1.235);
    expect(sanitizeExtra('çğıöşü')).toBe('çğıöşü');
    expect(sanitizeExtra(null)).toBeUndefined();
    expect(sanitizeExtra(undefined)).toBeUndefined();
    expect(sanitizeExtra(true)).toBeUndefined();
    expect(sanitizeExtra(() => 1)).toBeUndefined();
  });
});

describe('encodeProps / decodeProps', () => {
  it('encode: prototipsiz nesne, JSON düz nesne gibi yazılır; decode aynı satırları verir', () => {
    const m = new Map();
    m.set(10, { state: 1, rflags: 0, extra: undefined, order: 3 });
    m.set(11, { state: 2, rflags: 4, extra: 7, order: 5 });
    const enc = encodeProps(m);
    expect(Object.getPrototypeOf(enc)).toBeNull();
    const json = JSON.stringify(enc);
    const dec = decodeProps(JSON.parse(json));
    expect(dec.size).toBe(2);
    expect(dec.get(10)).toEqual([1, 0]);
    expect(dec.get(11)).toEqual([2, 4, 7]);
  });

  it('boyut sınırı: en yeni değişiklikler önce korunur; maxBytes ve 40 KB tavanı', () => {
    const m = new Map();
    for (let i = 0; i < 6000; i++) m.set(1000 + i, { state: 1, rflags: 0, extra: undefined, order: i });
    const enc = encodeProps(m);
    const bytes = jsonBytes(enc);
    expect(bytes).toBeLessThanOrEqual(PROP_SAVE_MAX_BYTES);
    expect(Object.keys(enc).length).toBeLessThanOrEqual(PROP_SAVE_MAX_ENTRIES);
    expect(enc[idToStr(1000 + 5999)]).toEqual([1, 0]);
    expect(enc[idToStr(1000)]).toBeUndefined();
    expect(jsonBytes(encodeProps(m, 500))).toBeLessThanOrEqual(500);
    expect(Object.keys(encodeProps(new Map())).length).toBe(0);
  });

  it('decode: zehirli anahtarlar/değerler atılır, tavan uygulanır', () => {
    const o = JSON.parse('{"__proto__":[1,0],"constructor":[1,0],"toString":[1,0],"ab":[1,0],"A":[1,0],"":[1,0],"zz":[1,0]}');
    const d = decodeProps(o);
    expect(Array.from(d.keys()).sort((a, b) => a - b)).toEqual([strToId('ab'), strToId('zz')].sort((a, b) => a - b));
    expect(Object.prototype.polluted).toBeUndefined();
    [null, undefined, 5, 'x', [], [[1, 0]], true].forEach((v) => expect(decodeProps(v).size).toBe(0));
    const big = {};
    for (let i = 0; i < PROP_SAVE_MAX_ENTRIES + 500; i++) big[idToStr(i + 100)] = [1, 0];
    expect(decodeProps(big).size).toBe(PROP_SAVE_MAX_ENTRIES);
  });

  it('fuzz: rastgele (hash) yapılar asla fırlatmaz ve çıktı her zaman temiz', () => {
    const pick = (h, arr) => arr[h % arr.length];
    const weird = [null, undefined, NaN, Infinity, -Infinity, -1, 0, 1, 255, 256, 65535, 65536, 1.5, 'a', 'zz', '__proto__', '', {}, [], [1, 2], { a: [1, 0] }, true, 1e300, 'x'.repeat(40)];
    let valid = 0;
    for (let i = 0; i < 3000; i++) {
      const h = hash32(i * 7919);
      const obj = {};
      const n = h % 6;
      for (let k = 0; k < n; k++) {
        const hk = hash32(i * 31 + k);
        const key = pick(hk, ['a', 'b', 'zz', '1', '__proto__', 'constructor', 'ab12', 'ZZ', '', idToStr(hk)]);
        const len = hk % 5;
        const row = [];
        for (let q = 0; q < len; q++) row.push(pick(hash32(hk + q), weird));
        obj[key] = hk % 7 === 0 ? pick(hk, weird) : row;
      }
      let d;
      expect(() => { d = decodeProps(obj); }).not.toThrow();
      d.forEach((row, id) => {
        valid++;
        expect(Number.isInteger(id) && id >= 0 && id <= 0xffffffff).toBe(true);
        expect(row[0] >= 0 && row[0] <= 255 && Number.isInteger(row[0])).toBe(true);
        expect(row[1] >= 0 && row[1] <= 65535 && Number.isInteger(row[1])).toBe(true);
        expect(row.length === 2 || row.length === 3).toBe(true);
      });
    }
    expect(valid).toBeGreaterThan(50);
  });

  it('PropWorld.restore bozuk kayıt fuzz: fırlatmaz, serialize her zaman geçerli ve ≤ 40 KB', () => {
    const list = [];
    for (let i = 0; i < 40; i++) {
      list.push({
        id: 500 + i, t: PROP_DEFS.terminal.t, x: 1 + (i % 12), y: 64, z: 1 + Math.floor(i / 12) * 3, yaw: 0, variant: 0, flags: i & 15,
      });
    }
    for (let i = 0; i < 400; i++) {
      const pw = new PropWorld({ citySeed: 1, planner: (s, cx, cz) => (cx === 0 && cz === 0 ? list : []) });
      pw.loadChunk(0, 0);
      const obj = {};
      for (let k = 0; k < 8; k++) {
        const hk = hash32(i * 13 + k);
        const id = 500 + (hk % 60);
        const row = [hk % 400 - 50, hk % 5 === 0 ? 70000 : hk % 9, hk % 3 === 0 ? 'ok' : undefined].slice(0, 1 + (hk % 3));
        obj[idToStr(id)] = row;
      }
      expect(() => pw.restore(obj)).not.toThrow();
      const out = pw.serialize();
      expect(jsonBytes(out)).toBeLessThanOrEqual(PROP_SAVE_MAX_BYTES);
      Object.keys(out).forEach((k) => expect(strToId(k)).not.toBeNull());
    }
  });
});
