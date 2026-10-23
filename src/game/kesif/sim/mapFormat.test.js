import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { BUILDABLE_MAX, CHUNK_VOLUME } from './constants.js';
import {
  MAP_BASES, MAP_RULES, MAP_TIMES, RULES, buildMap, buildMapFromWorld, chunksFromMap, countBlocks,
  decodeBase64, decodeChunk, decodeRle, decodeRleSafe, emptyMap, encodeBase64, encodeChunk, encodeRle,
  encodeRleBytes, inspectChunk, mapBlockCount, mapChunkKey, mapEncodedBytes, normalizeMap, parseMapChunkKey,
  parseRleBytes, tryDecodeChunk, validateMap,
} from './mapFormat.js';
import { seededRandom } from './rng.js';

/** Büyük bayt dizileri için hızlı eşitlik (toEqual çok yavaş). */
function same(a, b) {
  return !!a && !!b && a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

function randomBytes(rng, n) {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = rng.int(0, 255);
  return a;
}

/** Gerçekçi chunk: katmanlar + gürültü + boş bölgeler (id <= 99). */
function fakeChunk(rng, density = 0.2) {
  const b = new Uint8Array(CHUNK_VOLUME);
  for (let y = 0; y < 128; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const i = ((y * 16) + z) * 16 + x;
        if (y < 40) b[i] = y < 30 ? 1 : 3;
        else if (y < 42) b[i] = 4;
        else if (rng.chance(density * 0.05)) b[i] = rng.int(1, 99);
      }
    }
  }
  return b;
}

function noisyChunk(rng) {
  const b = new Uint8Array(CHUNK_VOLUME);
  for (let i = 0; i < b.length; i++) b[i] = rng.int(1, 99);
  return b;
}

function validMap(extra = {}) {
  const rng = seededRandom(1);
  return buildMap(Object.assign({
    base: 'düz',
    spawn: [64, 50, 64],
    time: 'gün batımı',
    title: 'Deneme Haritası',
    desc: 'Açıklama',
    chunks: { '0,0': fakeChunk(rng), '3,4': fakeChunk(rng, 0.5) },
  }, extra));
}

describe('base64', () => {
  it('Buffer ile aynı sonuç (rastgele uzunluklar)', () => {
    const rng = seededRandom(3);
    for (let n = 0; n <= 40; n++) {
      const data = randomBytes(rng, n);
      const mine = encodeBase64(data);
      expect(mine).toBe(Buffer.from(data).toString('base64'));
      const back = decodeBase64(mine);
      expect(Array.from(back)).toEqual(Array.from(data));
    }
    for (let i = 0; i < 50; i++) {
      const data = randomBytes(rng, rng.int(1000, 20000));
      expect(encodeBase64(data)).toBe(Buffer.from(data).toString('base64'));
      expect(Array.from(decodeBase64(Buffer.from(data).toString('base64')))).toEqual(Array.from(data));
    }
  });
  it('bilinen değerler', () => {
    expect(encodeBase64(new Uint8Array([]))).toBe('');
    expect(encodeBase64(new Uint8Array([77]))).toBe('TQ==');
    expect(encodeBase64(new Uint8Array([77, 97]))).toBe('TWE=');
    expect(encodeBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu');
    expect(encodeBase64(new Uint8Array([255, 255, 255]))).toBe('////');
    expect(Array.from(decodeBase64('TQ=='))).toEqual([77]);
    expect(decodeBase64('')).toHaveLength(0);
  });
  it('geçersiz girdiyi reddeder', () => {
    for (const bad of ['TQ=', 'TQ', 'T===', '=Q==', 'TQ=A', 'T Q==', 'TW\nu', 'TWF$', 'TWFuTQ==TWFu', 'ğğğğ', null, 5, undefined, 'A=AA']) {
      expect(decodeBase64(bad), String(bad)).toBeNull();
    }
  });
  it('büyük diziler yığın taşırmaz', () => {
    const rng = seededRandom(8);
    const data = randomBytes(rng, 300000);
    expect(same(decodeBase64(encodeBase64(data)), data)).toBe(true);
  });
});

describe('RLE', () => {
  it('küçük örnek: bayt biçimi [değer][uzunluk LE]', () => {
    const src = new Uint8Array(CHUNK_VOLUME); // hepsi 0
    src[0] = 5;
    const bytes = encodeRleBytes(src);
    expect(Array.from(bytes)).toEqual([5, 1, 0, 0, 0xff, 0x7f]); // 32767 = 0x7fff
    const full = new Uint8Array(CHUNK_VOLUME).fill(7);
    expect(Array.from(encodeRleBytes(full))).toEqual([7, 0x00, 0x80]); // 32768 = 0x8000
  });
  it('gidiş-dönüş fuzz (rastgele koşu uzunlukları ve değerler)', () => {
    const rng = seededRandom(555);
    for (let round = 0; round < 60; round++) {
      const b = new Uint8Array(CHUNK_VOLUME);
      let i = 0;
      const maxRun = [1, 3, 20, 300, 5000][round % 5];
      while (i < b.length) {
        const run = Math.min(b.length - i, rng.int(1, maxRun));
        const v = rng.int(0, round % 2 === 0 ? 99 : 255);
        b.fill(v, i, i + run);
        i += run;
      }
      const enc = encodeChunk(b);
      expect(same(decodeChunk(enc), b)).toBe(true);
      expect(same(tryDecodeChunk(enc), b)).toBe(true);
      const info = inspectChunk(enc);
      expect(info.ok).toBe(true);
      expect(info.blocks).toBe(countBlocks(b));
      expect(info.maxId).toBe(Math.max(...b));
    }
  });
  it('uç durumlar: tümü hava, tümü aynı, en kötü (dönüşümlü)', () => {
    const zero = new Uint8Array(CHUNK_VOLUME);
    expect(same(decodeChunk(encodeChunk(zero)), zero)).toBe(true);
    expect(encodeChunk(zero).length).toBeLessThan(10);
    const alt = new Uint8Array(CHUNK_VOLUME);
    for (let i = 0; i < alt.length; i++) alt[i] = i & 1 ? 9 : 4;
    expect(same(decodeChunk(encodeChunk(alt)), alt)).toBe(true);
    const rng = seededRandom(9);
    const rand = randomBytes(rng, CHUNK_VOLUME);
    expect(same(decodeChunk(encodeChunk(rand)), rand)).toBe(true);
  });
  it('kanonik: komşu koşular birleşir; ayrıştırıcı birleşmemişi de kabul eder', () => {
    const b = new Uint8Array(CHUNK_VOLUME).fill(2);
    const bytes = encodeRleBytes(b);
    expect(bytes.length).toBe(3);
    // el yapımı birleşmemiş: 2×16384 + 2×16384
    const manual = new Uint8Array([2, 0x00, 0x40, 2, 0x00, 0x40]);
    const parsed = parseRleBytes(manual);
    expect(parsed.ok).toBe(true);
    expect(same(parsed.data, b)).toBe(true);
  });
  it('genel uzunluk: >65535 koşu bölünür, expected ile çözülür', () => {
    const big = new Uint8Array(70000).fill(3);
    const bytes = encodeRleBytes(big);
    expect(bytes.length).toBe(6);
    expect(Array.from(bytes.slice(0, 3))).toEqual([3, 0xff, 0xff]);
    const dec = decodeRle(encodeRle(big), 70000);
    expect(same(dec, big)).toBe(true);
    expect(decodeRleSafe(encodeRle(big)).error).toBe('rle_fazla');
  });
  it('bozuk RLE hata kodları', () => {
    const b64 = (arr) => encodeBase64(new Uint8Array(arr));
    expect(decodeRleSafe('!!!!').error).toBe('base64');
    expect(decodeRleSafe('').error).toBe('rle_bos');
    expect(decodeRleSafe(b64([1, 0])).error).toBe('rle_biçim');
    expect(decodeRleSafe(b64([1, 0, 0])).error).toBe('rle_sifir');
    expect(decodeRleSafe(b64([1, 0xff, 0x7f])).error).toBe('rle_eksik'); // 32767
    expect(decodeRleSafe(b64([1, 0x00, 0x80, 1, 1, 0])).error).toBe('rle_fazla'); // 32769
    expect(decodeRleSafe(b64([1, 0x01, 0x80])).error).toBe('rle_fazla'); // 32769 tek koşu
    expect(decodeRleSafe(b64([1, 0x00, 0x40, 2, 0xff, 0x3f])).error).toBe('rle_eksik');
    expect(decodeRleSafe(b64([1, 0x00, 0x40, 2, 0x00, 0x40])).ok).toBe(true);
    expect(() => decodeRle('!!!!')).toThrow();
    try {
      decodeRle(b64([1, 0, 0]));
    } catch (e) {
      expect(e.code).toBe('rle_sifir');
    }
    expect(tryDecodeChunk('x')).toBeNull();
    expect(inspectChunk('x').ok).toBe(false);
  });
  it('encodeChunk uzunluk denetler', () => {
    expect(() => encodeChunk(new Uint8Array(10))).toThrow(RangeError);
    expect(() => encodeChunk(null)).toThrow();
  });
});

describe('harita anahtarı ve iskelet', () => {
  it('mapChunkKey / parseMapChunkKey', () => {
    expect(mapChunkKey(3, 4)).toBe('3,4');
    expect(parseMapChunkKey('3,4')).toEqual({ cx: 3, cz: 4 });
    expect(parseMapChunkKey('0,0')).toEqual({ cx: 0, cz: 0 });
    expect(parseMapChunkKey('7,7')).toEqual({ cx: 7, cz: 7 });
    for (const bad of ['8,0', '0,8', '-1,0', '01,0', '0,00', '1.5,0', 'a,b', '1,', ',1', '1,2,3', '', ' 1,1', null, 5]) {
      expect(parseMapChunkKey(bad), String(bad)).toBeNull();
    }
  });
  it('emptyMap geçerli', () => {
    MAP_BASES.forEach((b) => {
      const m = emptyMap(b);
      expect(m.base).toBe(b);
      expect(validateMap(m).ok).toBe(true);
    });
    expect(emptyMap('yok').base).toBe('düz');
  });
  it('RULES sözleşme değerleri', () => {
    expect(MAP_RULES).toBe(RULES);
    expect(RULES.maxBlockId).toBe(99);
    expect(RULES.maxChunks).toBe(64);
    expect(RULES.maxEncodedBytes).toBe(716800);
    expect(RULES.chunkVolume).toBe(32768);
    expect(RULES.sizeX).toBe(128);
    expect(Object.isFrozen(RULES)).toBe(true);
    expect(JSON.parse(JSON.stringify(RULES)).bases).toEqual(['düz', 'ada', 'boş', 'çayır']);
    expect(MAP_TIMES).toEqual(['gündüz', 'gece', 'gün batımı']);
  });
});

describe('validateMap kabul', () => {
  it('geçerli harita', () => {
    const m = validMap();
    const v = validateMap(m);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.codes).toEqual([]);
    expect(v.stats.chunkCount).toBe(2);
    expect(v.stats.blockCount).toBe(m.meta.blockCount);
    expect(v.stats.encodedBytes).toBe(mapEncodedBytes(m));
    expect(mapBlockCount(m)).toBe(m.meta.blockCount);
  });
  it('JSON gidiş-dönüşü sonrası hâlâ geçerli', () => {
    const m = JSON.parse(JSON.stringify(validMap()));
    expect(validateMap(m).ok).toBe(true);
  });
  it('zaman yoksa varsayılan, meta yoksa olur, 64 chunk tam sınırda', () => {
    const m = validMap();
    delete m.time;
    delete m.meta;
    expect(validateMap(m).ok).toBe(true);
    const flat = new Uint8Array(CHUNK_VOLUME).fill(1);
    const chunks = {};
    for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) chunks[mapChunkKey(cx, cz)] = flat;
    const full = buildMap({ chunks });
    expect(Object.keys(full.chunks)).toHaveLength(64);
    const v = validateMap(full);
    expect(v.ok).toBe(true);
    expect(v.stats.blockCount).toBe(64 * CHUNK_VOLUME);
    expect(full.meta.blockCount).toBe(64 * CHUNK_VOLUME);
  });
  it('en büyük kimlik 99 serbest, tüm 1..99 kimlikleri kabul', () => {
    const b = new Uint8Array(CHUNK_VOLUME);
    for (let i = 0; i < 99; i++) b[i] = i + 1;
    const m = buildMap({ chunks: { '0,0': b } });
    expect(validateMap(m).ok).toBe(true);
    expect(same(chunksFromMap(m).get('0,0'), b)).toBe(true);
  });
  it('spawn sınırları: 0 ve 127.99 serbest', () => {
    expect(validateMap(validMap({ spawn: [0, 0, 0] })).ok).toBe(true);
    expect(validateMap(validMap({ spawn: [127.9, 127, 127.9] })).ok).toBe(true);
  });
});

describe('validateMap ret', () => {
  const codesOf = (m) => validateMap(m).codes;
  it('nesne değil', () => {
    for (const bad of [null, undefined, 5, 'x', [], true]) {
      const v = validateMap(bad);
      expect(v.ok).toBe(false);
      expect(v.codes).toEqual(['not_object']);
      expect(v.errors[0].length).toBeGreaterThan(5);
    }
  });
  it('sürüm, taban, zaman', () => {
    expect(codesOf({ ...validMap(), v: 2 })).toContain('version');
    expect(codesOf({ ...validMap(), v: '1' })).toContain('version');
    expect(codesOf({ ...validMap(), base: 'okyanus' })).toContain('base');
    expect(codesOf({ ...validMap(), time: 'öğle' })).toContain('time');
  });
  it('boyut', () => {
    expect(codesOf({ ...validMap(), size: { x: 256, z: 128 } })).toContain('size');
    expect(codesOf({ ...validMap(), size: { x: 128 } })).toContain('size');
    expect(codesOf({ ...validMap(), size: null })).toContain('size');
    expect(codesOf({ ...validMap(), size: undefined })).toContain('size');
  });
  it('doğma noktası', () => {
    expect(codesOf({ ...validMap(), spawn: [1, 2] })).toContain('spawn');
    expect(codesOf({ ...validMap(), spawn: [1, 2, NaN] })).toContain('spawn');
    expect(codesOf({ ...validMap(), spawn: ['1', 2, 3] })).toContain('spawn');
    expect(codesOf({ ...validMap(), spawn: undefined })).toContain('spawn');
    expect(codesOf({ ...validMap(), spawn: [-1, 10, 10] })).toContain('spawn_bounds');
    expect(codesOf({ ...validMap(), spawn: [128, 10, 10] })).toContain('spawn_bounds');
    expect(codesOf({ ...validMap(), spawn: [10, 128, 10] })).toContain('spawn_bounds');
    expect(codesOf({ ...validMap(), spawn: [10, 10, 128] })).toContain('spawn_bounds');
    expect(codesOf({ ...validMap(), spawn: [10, -0.5, 10] })).toContain('spawn_bounds');
  });
  it('chunk anahtarları ve türleri', () => {
    const m = validMap();
    const good = m.chunks['0,0'];
    for (const key of ['8,0', '0,8', '-1,0', '01,0', 'x', '1,1,1']) {
      expect(codesOf({ ...m, chunks: { [key]: good } }), key).toContain('chunk_key');
    }
    expect(codesOf({ ...m, chunks: { '0,0': 5 } })).toContain('chunk_type');
    expect(codesOf({ ...m, chunks: { '0,0': null } })).toContain('chunk_type');
    expect(codesOf({ ...m, chunks: [] })).toContain('chunks');
    expect(codesOf({ ...m, chunks: undefined })).toContain('chunks');
    expect(codesOf({ ...m, chunks: 'abc' })).toContain('chunks');
  });
  it('çok fazla chunk (>64)', () => {
    const m = validMap();
    const chunks = {};
    for (let i = 0; i < 65; i++) chunks['bozuk' + i] = m.chunks['0,0'];
    const c = codesOf({ ...m, chunks });
    expect(c).toContain('too_many_chunks');
    expect(c).toContain('chunk_key');
  });
  it('chunk bozuk: base64, kısa, uzun, sıfır uzunluk', () => {
    const m = validMap();
    const b64 = (arr) => encodeBase64(new Uint8Array(arr));
    expect(codesOf({ ...m, chunks: { '0,0': '###' } })).toContain('base64');
    expect(codesOf({ ...m, chunks: { '0,0': b64([1, 0xff, 0x7f]) } })).toContain('rle_eksik');
    expect(codesOf({ ...m, chunks: { '0,0': b64([1, 0x01, 0x80]) } })).toContain('rle_fazla');
    expect(codesOf({ ...m, chunks: { '0,0': b64([1, 0, 0, 1, 0x00, 0x80]) } })).toContain('rle_sifir');
    expect(codesOf({ ...m, chunks: { '0,0': b64([1, 0]) } })).toContain('rle_biçim');
    expect(codesOf({ ...m, chunks: { '0,0': '' } })).toContain('rle_bos');
    // uzunluk: 32767 tek hava + ... eksik chunk
    const shortChunk = encodeRle(new Uint8Array(1000));
    expect(codesOf({ ...m, chunks: { '0,0': shortChunk } })).toContain('rle_eksik');
  });
  it('sistem blokları (id > 99) yasak', () => {
    const m = validMap();
    for (const id of [100, 101, 127, 200, 255]) {
      const b = new Uint8Array(CHUNK_VOLUME);
      b[1234] = id;
      const bad = { ...m, chunks: { '2,2': encodeChunk(b) } };
      const v = validateMap(bad);
      expect(v.ok, 'id ' + id).toBe(false);
      expect(v.codes).toContain('block_id');
    }
    const edge = new Uint8Array(CHUNK_VOLUME);
    edge[5] = BUILDABLE_MAX;
    expect(validateMap({ ...m, chunks: { '2,2': encodeChunk(edge) } }).ok).toBe(true);
  });
  it('toplam kodlanmış boyut 700 KB üstü', () => {
    const rng = seededRandom(31);
    const chunks = {};
    let k = 0;
    for (let cz = 0; cz < 8 && k < 8; cz++) {
      for (let cx = 0; cx < 8 && k < 8; cx++, k++) chunks[mapChunkKey(cx, cz)] = noisyChunk(rng);
    }
    const m = buildMap({ chunks });
    const v = validateMap(m);
    expect(mapEncodedBytes(m)).toBeGreaterThan(RULES.maxEncodedBytes);
    expect(v.ok).toBe(false);
    expect(v.codes).toContain('too_big');
    // 4 gürültülü chunk (~520 KB) hâlâ sığar
    const four = {};
    ['0,0', '1,0', '2,0', '3,0'].forEach((key) => {
      four[key] = chunks[key];
    });
    const m4 = buildMap({ chunks: four });
    expect(mapEncodedBytes(m4)).toBeLessThan(RULES.maxEncodedBytes);
    expect(validateMap(m4).ok).toBe(true);
  });
  it('700 KB sınırı tam: 716800 karakter geçerli, 4 karakter fazlası "too_big" (PHP ile aynı karar)', () => {
    const rng = seededRandom(32);
    const chunks = {};
    ['0,0', '1,0', '2,0', '3,0', '4,0'].forEach((key) => {
      chunks[key] = encodeChunk(noisyChunk(rng));
    });
    const used = Object.keys(chunks).reduce((s, k) => s + chunks[k].length, 0);
    // n koşulu küçük chunk: ilk n-1 koşu 1 uzunluklu, sonuncu kalanı doldurur → 4n karakter.
    const filler = (n) => {
      const bytes = [];
      let left = CHUNK_VOLUME;
      for (let r = 0; r < n; r++) {
        const len = r === n - 1 ? left : 1;
        bytes.push(1 + (r % 2), len & 255, len >> 8);
        left -= len;
      }
      return encodeBase64(Uint8Array.from(bytes));
    };
    const need = RULES.maxEncodedBytes - used;
    expect(need % 4).toBe(0);
    const exact = { ...validMap(), chunks: { ...chunks, '5,0': filler(need / 4) } };
    expect(mapEncodedBytes(exact)).toBe(RULES.maxEncodedBytes);
    expect(validateMap(exact).ok).toBe(true);
    const over = { ...validMap(), chunks: { ...chunks, '5,0': filler(need / 4 + 1) } };
    expect(mapEncodedBytes(over)).toBe(RULES.maxEncodedBytes + 4);
    const v = validateMap(over);
    expect(v.ok).toBe(false);
    expect(v.codes).toContain('too_big');
  });
  it('meta sınırları (kod noktası sayımı dahil)', () => {
    const base = validMap();
    expect(codesOf({ ...base, meta: { title: 'a'.repeat(61) } })).toContain('meta_title');
    expect(codesOf({ ...base, meta: { title: 'a'.repeat(60) } })).toEqual([]);
    expect(codesOf({ ...base, meta: { title: '😀'.repeat(60) } })).toEqual([]); // 60 kod noktası (120 UTF-16)
    expect(codesOf({ ...base, meta: { title: '😀'.repeat(61) } })).toContain('meta_title');
    expect(codesOf({ ...base, meta: { title: 5 } })).toContain('meta_title');
    expect(codesOf({ ...base, meta: { desc: 'b'.repeat(301) } })).toContain('meta_desc');
    expect(codesOf({ ...base, meta: { desc: 'ç'.repeat(300) } })).toEqual([]);
    expect(codesOf({ ...base, meta: { blockCount: -1 } })).toContain('meta_blockCount');
    expect(codesOf({ ...base, meta: { blockCount: 1.5 } })).toContain('meta_blockCount');
    expect(codesOf({ ...base, meta: { blockCount: 99999999 } })).toContain('meta_blockCount');
    expect(codesOf({ ...base, meta: 'x' })).toContain('meta');
    expect(codesOf({ ...base, meta: [] })).toContain('meta');
  });
  it('birden çok hata birikir, asla atmaz', () => {
    const v = validateMap({ v: 9, base: 'x', size: 1, spawn: 1, chunks: 1, meta: 1, time: 'x' });
    expect(v.ok).toBe(false);
    expect(v.codes.length).toBeGreaterThanOrEqual(6);
    expect(v.errors).toHaveLength(v.codes.length);
    const evil = JSON.parse('{"v":1,"base":"düz","size":{"x":128,"z":128},"spawn":[1,1,1],"chunks":{"__proto__":"x","constructor":"y"}}');
    expect(() => validateMap(evil)).not.toThrow();
    expect(validateMap(evil).ok).toBe(false);
  });
});

describe('buildMap ve yardımcılar', () => {
  it('id > 99 havaya çevrilir, blockCount yeniden hesaplanır, anahtarlar sıralı', () => {
    const b = new Uint8Array(CHUNK_VOLUME);
    b[0] = 5;
    b[1] = 100;
    b[2] = 127;
    b[3] = 99;
    const m = buildMap({ chunks: { '1,0': b, '0,0': b }, title: 'T', desc: 'D' });
    expect(Object.keys(m.chunks)).toEqual(['0,0', '1,0']);
    expect(m.meta).toEqual({ title: 'T', desc: 'D', blockCount: 4 });
    const back = decodeChunk(m.chunks['0,0']);
    expect(back[0]).toBe(5);
    expect(back[1]).toBe(0);
    expect(back[2]).toBe(0);
    expect(back[3]).toBe(99);
    expect(b[1]).toBe(100); // kaynak değişmez
    expect(validateMap(m).ok).toBe(true);
  });
  it('geçersiz anahtar/bozuk hazır metin atlanır; hazır metin kabul', () => {
    const rng = seededRandom(4);
    const enc = encodeChunk(fakeChunk(rng));
    const m = buildMap({ chunks: new Map([['0,0', enc], ['9,9', enc], ['1,1', 'bozuk!'], ['2,2', enc]]) });
    expect(Object.keys(m.chunks)).toEqual(['0,0', '2,2']);
    expect(validateMap(m).ok).toBe(true);
  });
  it('seçenekler: base, spawn, time; geçersizler varsayılana düşer', () => {
    const m = buildMap({ base: 'ada', spawn: [10, 70, 20], time: 'gece', chunks: {} });
    expect(m.base).toBe('ada');
    expect(m.spawn).toEqual([10, 70, 20]);
    expect(m.time).toBe('gece');
    const d = buildMap({ base: 'zzz', spawn: [1], time: 'zzz' });
    expect(d.base).toBe('düz');
    expect(d.time).toBe('gündüz');
    expect(d.spawn).toEqual([64, 64, 64]);
    expect(validateMap(d).ok).toBe(true);
  });
  it('buildMapFromWorld: yalnız düzenlenmiş ya da all', () => {
    const rng = seededRandom(6);
    const mk = (edited) => ({ blocks: fakeChunk(rng), edited });
    const world = {
      getChunk(cx, cz) {
        if (cx === 0 && cz === 0) return mk(true);
        if (cx === 1 && cz === 0) return mk(false);
        if (cx === 2 && cz === 2) return mk(true);
        if (cx === 3 && cz === 3) return { blocks: new Uint8Array(5), edited: true }; // bozuk uzunluk
        return undefined;
      },
    };
    const m = buildMapFromWorld(world, { title: 'Dünya', spawn: [5, 60, 5] });
    expect(Object.keys(m.chunks)).toEqual(['0,0', '2,2']);
    expect(m.meta.title).toBe('Dünya');
    expect(validateMap(m).ok).toBe(true);
    const all = buildMapFromWorld(world, { all: true });
    expect(Object.keys(all.chunks)).toEqual(['0,0', '1,0', '2,2']);
  });
  it('chunksFromMap geçerlileri açar', () => {
    const m = validMap();
    const ch = chunksFromMap(m);
    expect([...ch.keys()].sort()).toEqual(['0,0', '3,4']);
    ch.forEach((v) => expect(v).toHaveLength(CHUNK_VOLUME));
    expect(chunksFromMap(null).size).toBe(0);
    expect(chunksFromMap({ chunks: { '0,0': 'x', '99,0': m.chunks['0,0'] } }).size).toBe(0);
  });
  it('normalizeMap: kanonik kopya; geçersizde null', () => {
    const m = validMap();
    m.extra = 'fazla';
    m.meta.title = '  Başlık  ';
    m.meta.blockCount = 1; // yalan: yeniden hesaplanır
    delete m.time;
    const n = normalizeMap(m);
    expect(n.extra).toBeUndefined();
    expect(n.time).toBe('gündüz');
    expect(n.meta.title).toBe('Başlık');
    expect(n.meta.blockCount).toBe(mapBlockCount(m));
    expect(validateMap(n).ok).toBe(true);
    expect(normalizeMap({ ...m, v: 3 })).toBeNull();
    expect(Object.keys(n.chunks)).toEqual(['0,0', '3,4']);
  });
  it('gerçekçi chunk iyi sıkışır (700 KB sınırının çok altında)', () => {
    const rng = seededRandom(12);
    const enc = encodeChunk(fakeChunk(rng, 0.3));
    expect(enc.length).toBeLessThan(40000);
    const flat = encodeChunk(fakeChunk(seededRandom(1), 0));
    expect(flat.length).toBeLessThan(200);
  });
});
