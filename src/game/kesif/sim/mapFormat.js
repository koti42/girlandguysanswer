/*
 * KEŞİF sim — paylaşılan harita biçimi, RLE/base64 kodlayıcılar ve doğrulayıcı (saf).
 *
 * BAYT BİÇİMİ (PHP doğrulayıcısı BİREBİR aynısını uygular; kurallar aşağıdaki RULES'ta)
 * ---------------------------------------------------------------------------------------
 * Harita nesnesi (JSON):
 *   {
 *     v: 1,
 *     base: 'düz' | 'ada' | 'boş' | 'çayır',   // chunks'ta olmayan chunk'lar bu tabandan üretilir
 *     size: { x: 128, z: 128 },                  // 8×8 chunk (1 chunk = 16×16×128)
 *     spawn: [x, y, z],                          // 0 <= x < 128, 0 <= y < 128, 0 <= z < 128
 *     chunks: { "cx,cz": "<base64 RLE>" },       // cx,cz = 0..7, başında sıfırsız tamsayı
 *     time: 'gündüz' | 'gece' | 'gün batımı',    // yoksa 'gündüz'
 *     meta: { title, desc, blockCount }          // isteğe bağlı; sunucu blockCount'u yeniden hesaplar
 *   }
 *
 * Chunk içeriği: 32768 bayt (16*16*128); indeks (y*16 + z)*16 + x; her bayt blok kimliği.
 *   (Bir chunk girdisi tabandaki chunk'ın TAMAMINI değiştirir; girdisi olmayan chunk tabandan gelir.)
 *
 * RLE: bayt dizisi, çiftler değil ÜÇLÜLER hâlinde, art arda:
 *     [değer: 1 bayt][uzunluk: 2 bayt, little-endian, 1..65535]
 *   Uzunlukların toplamı TAM 32768 olmalı (ne eksik ne fazla); uzunluk 0 geçersiz. Kodlayıcı aynı değerli
 *   komşu koşuları birleştirir (kanonik); ayrıştırıcı birleştirilmemiş koşulara da izin verir.
 *   Bayt dizisi standart base64 (RFC 4648, '+' '/', '=' dolgu; satır sonu/boşluk YOK) ile metne çevrilir.
 *   Ayrıştırıcı katıdır: uzunluk 4'ün katı, alfabe dışı karakter yok, '=' yalnız sonda (en çok 2).
 *
 * Doğrulama kuralları (validateMap): v===1; base/time kümeleri; size tam {128,128}; spawn 3 sonlu sayı
 * ve sınır içi; anahtar biçimi + 0..7 aralığı; en çok 64 chunk; her chunk geçerli base64+RLE (tam 32768);
 * her koşu değeri <= 99 (BUILDABLE_MAX; sistem blokları yasak); kodlanmış metinlerin toplam uzunluğu
 * <= 700*1024 = 716800 bayt; meta.title <= 60, meta.desc <= 300 karakter (Unicode kod noktası), blockCount
 * 0..2097152 tamsayı. Bilinmeyen üst düzey alanlar yok sayılır (normalizeMap atar).
 *
 * Makine okunur kural tablosu: RULES (düz nesne; PHP'ye birebir aktarılır).
 * btoa/atob KULLANILMAZ (worker/node uyumu): encodeBase64/decodeBase64 kendi Uint8Array uygulamasıdır.
 */
import { BUILDABLE_MAX, CHUNK_VOLUME, MAP_LIMITS, WORLD_H } from './constants.js';

export const MAP_VERSION = 1;
export const MAP_BASES = Object.freeze(['düz', 'ada', 'boş', 'çayır']);
export const MAP_TIMES = Object.freeze(['gündüz', 'gece', 'gün batımı']);

export const RULES = Object.freeze({
  version: MAP_VERSION,
  chunkSize: 16,
  chunkHeight: WORLD_H,
  chunkVolume: CHUNK_VOLUME,
  maxBlockId: BUILDABLE_MAX,
  sizeX: MAP_LIMITS.sizeX,
  sizeZ: MAP_LIMITS.sizeZ,
  chunksX: MAP_LIMITS.chunksX,
  chunksZ: MAP_LIMITS.chunksZ,
  maxChunks: MAP_LIMITS.maxChunks,
  maxEncodedBytes: MAP_LIMITS.maxEncodedBytes,
  maxRunLength: 65535,
  bases: MAP_BASES,
  times: MAP_TIMES,
  defaultTime: 'gündüz',
  titleMax: 60,
  descMax: 300,
  maxBlockCount: MAP_LIMITS.maxChunks * CHUNK_VOLUME,
  chunkKeyPattern: '^(0|[1-9][0-9]*),(0|[1-9][0-9]*)$',
  required: Object.freeze(['v', 'base', 'size', 'spawn', 'chunks']),
});

/* ------------------------------------------------------------------------------------------------
 * base64 (btoa/atob yok)
 * ---------------------------------------------------------------------------------------------- */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_CODES = new Uint8Array(64);
const B64_LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) {
  B64_CODES[i] = B64_CHARS.charCodeAt(i);
  B64_LOOKUP[B64_CODES[i]] = i;
}
const EQ = 61; // '='

/** Uint8Array (veya bayt dizisi) → base64 metni. */
export function encodeBase64(bytes) {
  const n = bytes.length;
  let out = '';
  const buf = [];
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = ((bytes[i] & 255) << 16) | ((bytes[i + 1] & 255) << 8) | (bytes[i + 2] & 255);
    buf.push(B64_CODES[v >> 18], B64_CODES[(v >> 12) & 63], B64_CODES[(v >> 6) & 63], B64_CODES[v & 63]);
    if (buf.length >= 4096) {
      out += String.fromCharCode.apply(null, buf);
      buf.length = 0;
    }
  }
  const rest = n - i;
  if (rest === 1) {
    const v = (bytes[i] & 255) << 16;
    buf.push(B64_CODES[v >> 18], B64_CODES[(v >> 12) & 63], EQ, EQ);
  } else if (rest === 2) {
    const v = ((bytes[i] & 255) << 16) | ((bytes[i + 1] & 255) << 8);
    buf.push(B64_CODES[v >> 18], B64_CODES[(v >> 12) & 63], B64_CODES[(v >> 6) & 63], EQ);
  }
  if (buf.length) out += String.fromCharCode.apply(null, buf);
  return out;
}

/** base64 metni → Uint8Array; katı biçim, geçersizse null. */
export function decodeBase64(str) {
  if (typeof str !== 'string') return null;
  const len = str.length;
  if (len % 4 !== 0) return null;
  if (len === 0) return new Uint8Array(0);
  let pad = 0;
  if (str.charCodeAt(len - 1) === EQ) pad++;
  if (str.charCodeAt(len - 2) === EQ) pad++;
  const outLen = (len / 4) * 3 - pad;
  const out = new Uint8Array(outLen);
  let o = 0;
  const fullEnd = pad ? len - 4 : len;
  let i = 0;
  for (; i < fullEnd; i += 4) {
    const a = str.charCodeAt(i);
    const b = str.charCodeAt(i + 1);
    const c = str.charCodeAt(i + 2);
    const d = str.charCodeAt(i + 3);
    if (a > 127 || b > 127 || c > 127 || d > 127) return null;
    const x = B64_LOOKUP[a];
    const y = B64_LOOKUP[b];
    const z = B64_LOOKUP[c];
    const w = B64_LOOKUP[d];
    if ((x | y | z | w) < 0) return null;
    const v = (x << 18) | (y << 12) | (z << 6) | w;
    out[o++] = v >> 16;
    out[o++] = (v >> 8) & 255;
    out[o++] = v & 255;
  }
  if (pad) {
    const a = str.charCodeAt(i);
    const b = str.charCodeAt(i + 1);
    const c = str.charCodeAt(i + 2);
    if (a > 127 || b > 127 || c > 127) return null;
    const x = B64_LOOKUP[a];
    const y = B64_LOOKUP[b];
    if ((x | y) < 0) return null;
    if (pad === 2) {
      if (c !== EQ) return null;
      out[o++] = ((x << 18) | (y << 12)) >> 16;
    } else {
      const z = B64_LOOKUP[c];
      if (z < 0) return null;
      const v = (x << 18) | (y << 12) | (z << 6);
      out[o++] = v >> 16;
      out[o++] = (v >> 8) & 255;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * RLE
 * ---------------------------------------------------------------------------------------------- */
/** Bayt dizisi → RLE baytları ([değer][uzunluk u16 LE] üçlüleri). */
export function encodeRleBytes(src) {
  const n = src.length;
  const out = new Uint8Array(n * 3);
  let o = 0;
  let i = 0;
  while (i < n) {
    const v = src[i] & 255;
    let j = i + 1;
    while (j < n && (src[j] & 255) === v && j - i < 65535) j++;
    const run = j - i;
    out[o++] = v;
    out[o++] = run & 255;
    out[o++] = run >> 8;
    i = j;
  }
  return out.slice(0, o);
}

/**
 * RLE baytlarını çözer; döner {ok, data?, error?}. expected: tam açılmış uzunluk (varsayılan chunk).
 * error kodları: 'rle_bos', 'rle_biçim' (3'ün katı değil), 'rle_sifir' (uzunluk 0), 'rle_fazla', 'rle_eksik'.
 */
export function parseRleBytes(bytes, expected = CHUNK_VOLUME) {
  const n = bytes.length;
  if (n === 0) return { ok: false, error: 'rle_bos' };
  if (n % 3 !== 0) return { ok: false, error: 'rle_biçim' };
  const data = new Uint8Array(expected);
  let total = 0;
  for (let i = 0; i < n; i += 3) {
    const len = bytes[i + 1] | (bytes[i + 2] << 8);
    if (len === 0) return { ok: false, error: 'rle_sifir' };
    if (total + len > expected) return { ok: false, error: 'rle_fazla' };
    if (bytes[i] !== 0) data.fill(bytes[i], total, total + len);
    total += len;
  }
  if (total !== expected) return { ok: false, error: 'rle_eksik' };
  return { ok: true, data };
}

/** Bayt dizisi → base64 RLE metni. */
export function encodeRle(src) {
  return encodeBase64(encodeRleBytes(src));
}

/** base64 RLE → {ok, data?, error?} (atmaz). error: 'base64' | rle_* */
export function decodeRleSafe(b64, expected = CHUNK_VOLUME) {
  const bytes = decodeBase64(b64);
  if (!bytes) return { ok: false, error: 'base64' };
  return parseRleBytes(bytes, expected);
}

/** base64 RLE → Uint8Array (expected uzunlukta); geçersizse Error (e.code) atar. */
export function decodeRle(b64, expected = CHUNK_VOLUME) {
  const r = decodeRleSafe(b64, expected);
  if (!r.ok) {
    const e = new Error('Geçersiz RLE: ' + r.error);
    e.code = r.error;
    throw e;
  }
  return r.data;
}

/** Chunk (tam 32768 bayt) → base64 RLE. */
export function encodeChunk(blocks) {
  if (!blocks || blocks.length !== CHUNK_VOLUME) {
    throw new RangeError('Chunk ' + CHUNK_VOLUME + ' bayt olmalı');
  }
  return encodeRle(blocks);
}
/** base64 RLE → Uint8Array(32768); geçersizse atar. */
export function decodeChunk(str) {
  return decodeRle(str, CHUNK_VOLUME);
}
/** Atmayan sürüm: geçersizse null. */
export function tryDecodeChunk(str) {
  const r = decodeRleSafe(str, CHUNK_VOLUME);
  return r.ok ? r.data : null;
}

/** Açılmış chunk'taki hava olmayan blok sayısı. */
export function countBlocks(blocks) {
  let n = 0;
  for (let i = 0; i < blocks.length; i++) if (blocks[i] !== 0) n++;
  return n;
}

/**
 * Açmadan RLE metnini tarar: {ok, error?, maxId, blocks}. Kural doğrulaması için (hız + bellek).
 */
export function inspectChunk(b64) {
  const bytes = decodeBase64(b64);
  if (!bytes) return { ok: false, error: 'base64' };
  const n = bytes.length;
  if (n === 0) return { ok: false, error: 'rle_bos' };
  if (n % 3 !== 0) return { ok: false, error: 'rle_biçim' };
  let total = 0;
  let maxId = 0;
  let blocks = 0;
  for (let i = 0; i < n; i += 3) {
    const len = bytes[i + 1] | (bytes[i + 2] << 8);
    if (len === 0) return { ok: false, error: 'rle_sifir' };
    total += len;
    if (total > CHUNK_VOLUME) return { ok: false, error: 'rle_fazla' };
    if (bytes[i] > maxId) maxId = bytes[i];
    if (bytes[i] !== 0) blocks += len;
  }
  if (total !== CHUNK_VOLUME) return { ok: false, error: 'rle_eksik' };
  return { ok: true, maxId, blocks };
}

/* ------------------------------------------------------------------------------------------------
 * Harita kurma / okuma yardımcıları
 * ---------------------------------------------------------------------------------------------- */
const KEY_RE = new RegExp(RULES.chunkKeyPattern);

export function mapChunkKey(cx, cz) {
  return cx + ',' + cz;
}
/** "cx,cz" → {cx,cz}; biçim ya da aralık geçersizse null. */
export function parseMapChunkKey(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return null;
  const i = key.indexOf(',');
  const cx = parseInt(key.slice(0, i), 10);
  const cz = parseInt(key.slice(i + 1), 10);
  if (cx >= RULES.chunksX || cz >= RULES.chunksZ) return null;
  return { cx, cz };
}

/** Boş bir harita iskeleti (chunk yok: tamamı tabandan). */
export function emptyMap(base = 'düz') {
  return {
    v: MAP_VERSION,
    base: MAP_BASES.indexOf(base) >= 0 ? base : 'düz',
    size: { x: RULES.sizeX, z: RULES.sizeZ },
    spawn: [RULES.sizeX / 2, 64, RULES.sizeZ / 2],
    chunks: {},
    time: RULES.defaultTime,
    meta: { title: '', desc: '', blockCount: 0 },
  };
}

function toEncodedChunk(v) {
  if (typeof v === 'string') return v;
  // sistem blokları (id > 99) haritada yasak: havaya çevrilir.
  let clean = v;
  for (let i = 0; i < v.length; i++) {
    if (v[i] > BUILDABLE_MAX) {
      if (clean === v) clean = Uint8Array.from(v);
      clean[i] = 0;
    }
  }
  return encodeChunk(clean);
}

/**
 * Chunk'lardan harita nesnesi kurar.
 *   opts: {base, spawn, time, title, desc, chunks}
 *   chunks: Map | düz nesne: "cx,cz" → Uint8Array(32768) | hazır base64 RLE metni
 * id > 99 olan bloklar havaya çevrilir. meta.blockCount kodlanmış chunk'lardan yeniden hesaplanır.
 * Geçersiz anahtarlı chunk'lar atlanır (sayısı döndürülen haritaya yansımaz).
 */
export function buildMap(opts = {}) {
  const map = emptyMap(opts.base);
  if (Array.isArray(opts.spawn) && opts.spawn.length === 3) map.spawn = opts.spawn.slice();
  if (MAP_TIMES.indexOf(opts.time) >= 0) map.time = opts.time;
  const src = opts.chunks;
  const entries = [];
  if (src instanceof Map) src.forEach((v, k) => entries.push([k, v]));
  else if (src && typeof src === 'object') Object.keys(src).forEach((k) => entries.push([k, src[k]]));
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let blockCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i][0];
    if (!parseMapChunkKey(key)) continue;
    const enc = toEncodedChunk(entries[i][1]);
    const info = inspectChunk(enc);
    if (!info.ok) continue;
    map.chunks[key] = enc;
    blockCount += info.blocks;
  }
  map.meta = {
    title: String(opts.title === undefined ? '' : opts.title),
    desc: String(opts.desc === undefined ? '' : opts.desc),
    blockCount,
  };
  return map;
}

/** Harita biçimi için chunk'ın düz 32768 baytlık görünümü (legacy Chunk → kopya; eski {blocks} nesnesi → kendisi); yoksa null. */
export function chunkDenseBlocks(c) {
  if (!c) return null;
  if (typeof c.toDense === 'function' && c.legacy) return c.toDense(0, WORLD_H);
  if (c.blocks && c.blocks.length === CHUNK_VOLUME) return c.blocks;
  return null;
}

/**
 * World örneğinden (getChunk(cx,cz) → Chunk | {blocks, edited?}) harita kurar. Varsayılan: yalnız düzenlenmiş
 * (edited) chunk'lar; opts.all=true ise var olan tüm chunk'lar. Harita koordinatları chunk 0..7'dir.
 */
export function buildMapFromWorld(world, opts = {}) {
  const chunks = new Map();
  for (let cz = 0; cz < RULES.chunksZ; cz++) {
    for (let cx = 0; cx < RULES.chunksX; cx++) {
      const c = world.getChunk(cx, cz);
      const dense = chunkDenseBlocks(c);
      if (!dense) continue;
      if (opts.all || c.edited) chunks.set(mapChunkKey(cx, cz), dense);
    }
  }
  return buildMap(Object.assign({}, opts, { chunks }));
}

/** Haritadaki geçerli chunk'ları açar: Map("cx,cz" → Uint8Array). Geçersizler atlanır. */
export function chunksFromMap(map) {
  const out = new Map();
  if (!map || !map.chunks || typeof map.chunks !== 'object') return out;
  Object.keys(map.chunks).forEach((k) => {
    if (!parseMapChunkKey(k)) return;
    const d = tryDecodeChunk(map.chunks[k]);
    if (d) out.set(k, d);
  });
  return out;
}

/** Kodlanmış chunk metinlerinin toplam uzunluğu (sınır: RULES.maxEncodedBytes). */
export function mapEncodedBytes(map) {
  let total = 0;
  if (!map || !map.chunks || typeof map.chunks !== 'object') return 0;
  Object.keys(map.chunks).forEach((k) => {
    const v = map.chunks[k];
    if (typeof v === 'string') total += v.length;
  });
  return total;
}

/** Haritadaki toplam (hava olmayan) blok sayısı; geçersiz chunk'lar sayılmaz. */
export function mapBlockCount(map) {
  let total = 0;
  if (!map || !map.chunks || typeof map.chunks !== 'object') return 0;
  Object.keys(map.chunks).forEach((k) => {
    const info = inspectChunk(map.chunks[k]);
    if (info.ok) total += info.blocks;
  });
  return total;
}

function codePoints(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) i++;
    n++;
  }
  return n;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Haritayı kurallara göre doğrular. Döner:
 *   {ok, errors:[Türkçe mesaj], codes:[kod], stats:{chunkCount, encodedBytes, blockCount}}
 * Asla atmaz.
 */
export function validateMap(map) {
  const errors = [];
  const codes = [];
  const fail = (code, msg) => {
    codes.push(code);
    errors.push(msg);
  };
  const stats = { chunkCount: 0, encodedBytes: 0, blockCount: 0 };
  if (!isPlainObject(map)) {
    fail('not_object', 'Harita bir nesne olmalı.');
    return { ok: false, errors, codes, stats };
  }
  if (map.v !== MAP_VERSION) fail('version', 'Harita sürümü desteklenmiyor.');
  if (MAP_BASES.indexOf(map.base) < 0) fail('base', 'Geçersiz harita tabanı.');
  if (map.time !== undefined && MAP_TIMES.indexOf(map.time) < 0) fail('time', 'Geçersiz gün zamanı.');

  const size = map.size;
  if (!isPlainObject(size) || size.x !== RULES.sizeX || size.z !== RULES.sizeZ) {
    fail('size', 'Harita boyutu ' + RULES.sizeX + 'x' + RULES.sizeZ + ' olmalı.');
  }

  const sp = map.spawn;
  if (!Array.isArray(sp) || sp.length !== 3 || !sp.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    fail('spawn', 'Doğma noktası [x, y, z] sayıları olmalı.');
  } else if (
    sp[0] < 0 || sp[0] >= RULES.sizeX || sp[1] < 0 || sp[1] >= RULES.chunkHeight || sp[2] < 0 || sp[2] >= RULES.sizeZ
  ) {
    fail('spawn_bounds', 'Doğma noktası harita sınırları dışında.');
  }

  if (map.meta !== undefined) {
    const m = map.meta;
    if (!isPlainObject(m)) {
      fail('meta', 'Harita bilgisi geçersiz.');
    } else {
      if (m.title !== undefined && (typeof m.title !== 'string' || codePoints(m.title) > RULES.titleMax)) {
        fail('meta_title', 'Başlık en çok ' + RULES.titleMax + ' karakter olabilir.');
      }
      if (m.desc !== undefined && (typeof m.desc !== 'string' || codePoints(m.desc) > RULES.descMax)) {
        fail('meta_desc', 'Açıklama en çok ' + RULES.descMax + ' karakter olabilir.');
      }
      if (
        m.blockCount !== undefined &&
        (typeof m.blockCount !== 'number' || !Number.isInteger(m.blockCount) || m.blockCount < 0 ||
          m.blockCount > RULES.maxBlockCount)
      ) {
        fail('meta_blockCount', 'Blok sayısı geçersiz.');
      }
    }
  }

  const chunks = map.chunks;
  if (!isPlainObject(chunks)) {
    fail('chunks', 'Chunk listesi bir nesne olmalı.');
    return { ok: errors.length === 0, errors, codes, stats };
  }
  const keys = Object.keys(chunks);
  stats.chunkCount = keys.length;
  if (keys.length > RULES.maxChunks) {
    fail('too_many_chunks', 'En çok ' + RULES.maxChunks + ' chunk olabilir.');
  }
  let encoded = 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!parseMapChunkKey(k)) {
      fail('chunk_key', 'Geçersiz chunk anahtarı: ' + String(k).slice(0, 20));
      continue;
    }
    const v = chunks[k];
    if (typeof v !== 'string') {
      fail('chunk_type', 'Chunk ' + k + ' metin olmalı.');
      continue;
    }
    encoded += v.length;
    const info = inspectChunk(v);
    if (!info.ok) {
      fail(info.error, 'Chunk ' + k + ' bozuk (' + info.error + ').');
      continue;
    }
    if (info.maxId > RULES.maxBlockId) {
      fail('block_id', 'Chunk ' + k + ' yasak blok içeriyor.');
      continue;
    }
    stats.blockCount += info.blocks;
  }
  stats.encodedBytes = encoded;
  if (encoded > RULES.maxEncodedBytes) {
    fail('too_big', 'Harita verisi çok büyük (en çok ' + Math.floor(RULES.maxEncodedBytes / 1024) + ' KB).');
  }
  return { ok: errors.length === 0, errors, codes, stats };
}

/**
 * Geçerli bir haritanın kanonik kopyası: yalnız bilinen alanlar, varsayılan time, blockCount yeniden hesaplı,
 * başlık/açıklama kırpılmış. Geçersiz haritada null döner.
 */
export function normalizeMap(map) {
  const v = validateMap(map);
  if (!v.ok) return null;
  const meta = isPlainObject(map.meta) ? map.meta : {};
  const out = {
    v: MAP_VERSION,
    base: map.base,
    size: { x: RULES.sizeX, z: RULES.sizeZ },
    spawn: map.spawn.slice(),
    chunks: {},
    time: map.time === undefined ? RULES.defaultTime : map.time,
    meta: {
      title: typeof meta.title === 'string' ? meta.title.trim() : '',
      desc: typeof meta.desc === 'string' ? meta.desc.trim() : '',
      blockCount: v.stats.blockCount,
    },
  };
  Object.keys(map.chunks).sort().forEach((k) => {
    out.chunks[k] = map.chunks[k];
  });
  return out;
}

/** PHP doğrulayıcısının aynalayacağı kural tablosu için açık takma ad (index.js'te RULES yerine). */
export const MAP_RULES = RULES;
