/*
 * qa5 (Faz 5, qa_logic) — PAYLAŞILAN HARİTA DOĞRULAYICISI ÇAPRAZ TESTİ (web `validateMap` ↔ PHP `KesifMapValidator`), DOĞRULAYICILAR DEĞİŞMEDİ.
 * Bu test belirlenimci bir KORPUS üretir (geçerli/geçersiz/rastgele bozulmuş ~230 harita) ve web doğrulayıcısının kararını (ok + normalleştirilmiş harita)
 * kaydeder. PHP tarafı (tests/Feature/Game/KesifMapCorpusTest.php) AYNI korpusu kendi doğrulayıcısıyla koşturup kararları karşılaştırır.
 *   - Korpus dosyası: API deposu `tests/Fixtures/kesif_map_corpus.json`. Web deposu yanındaysa/API deposu yanındaysa dosya ÜRETİLEN korpusla birebir aynı olmalı
 *     (doğrulayıcı ya da korpus değişirse test kırılır → iki taraf birlikte güncellenir): yenilemek için KESIF_QA5_CORPUS_WRITE=1.
 *   - Bilinen, belgelenmiş ve ZARARSIZ sapmalar phpLenient() kurallarındadır (PHP'nin yalnız daha GEVŞEK olduğu JSON-düzeyi ayrıntılar); yeni sapma testi kırar.
 *   - ID aralığı: id ≤ 99 (BUILDABLE_MAX) değişmez; 100–254 (şehir/macera blokları) ve 255 paylaşılan haritaya sızamaz (web ve PHP).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILDABLE_MAX, MAX_BLOCK_ID } from '../sim/constants.js';
import {
  RULES, encodeBase64, normalizeMap, validateMap,
} from '../sim/mapFormat.js';
import { seededRandom } from '../sim/rng.js';

const ENV = (globalThis.process && globalThis.process.env) || {};
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url)); // …/Desktop/
const API_FIXTURE = ROOT + 'girlsandguys-api-v10/tests/Fixtures/kesif_map_corpus.json'; // ROOT = masaüstü (web ve API depoları yan yana)
const VOX = 16 * 16 * 128;

/** Koşu listesi [[değer, uzunluk]…] → base64 RLE (birleştirmeden, olduğu gibi). */
function rle(runs) {
  const b = [];
  runs.forEach(([v, n]) => { b.push(v & 255, n & 255, n >> 8); });
  return encodeBase64(Uint8Array.from(b));
}
const AIR = rle([[0, VOX]]);
const STONE = rle([[1, 4 * 256], [0, VOX - 4 * 256]]);
const MIXED = rle([[1, 1000], [50, 20], [99, 5], [0, VOX - 1025]]);
const UNMERGED = rle([[0, 100], [0, VOX - 100]]);

function base(over) {
  return Object.assign({
    v: 1, base: 'düz', size: { x: 128, z: 128 }, spawn: [8, 5, 8], chunks: { '0,0': STONE, '1,0': MIXED }, time: 'gündüz', meta: { title: 'Deneme', desc: 'Açıklama', blockCount: 0 },
  }, over);
}

/** Her durum: [kimlik, açıklama, harita]. */
function buildCases() {
  const out = [];
  const add = (id, desc, map) => out.push([id, desc, map]);

  // ---- geçerli
  add('v_min', 'en küçük: boş chunk listesi', base({ chunks: {}, meta: undefined, time: undefined }));
  add('v_basic', 'iki chunk, meta', base());
  ['düz', 'ada', 'boş', 'çayır'].forEach((b) => ['gündüz', 'gece', 'gün batımı'].forEach((t) => add('v_bt_' + b + '_' + t, 'taban/zaman ' + b + '/' + t, base({ base: b, time: t }))));
  add('v_time_absent', 'time yok → gündüz', base({ time: undefined }));
  [[0, 0, 0], [127.999, 127.999, 127.999], [64.5, 100.25, 3.75], [0, 127, 127]].forEach((sp, i) => add('v_spawn_' + i, 'doğma ' + sp, base({ spawn: sp })));
  const full = {};
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) full[x + ',' + z] = (x + z) % 3 === 0 ? STONE : AIR;
  add('v_full64', '64 chunk (8×8)', base({ chunks: full }));
  add('v_unmerged', 'birleşmemiş koşular', base({ chunks: { '3,3': UNMERGED } }));
  add('v_ids', 'id 0/1/50/99', base({ chunks: { '7,7': MIXED } }));
  add('v_extra_top', 'bilinmeyen üst düzey anahtar atılır', base({ extra: { a: 1 } }));
  add('v_extra_meta', 'bilinmeyen meta anahtarı', base({ meta: { title: 'x', note: 'y', blockCount: 0 } }));
  add('v_meta_empty', 'meta boş nesne', base({ meta: {} }));
  add('v_title60', 'başlık 60 karakter', base({ meta: { title: 'a'.repeat(60) } }));
  add('v_desc300', 'açıklama 300 karakter', base({ meta: { desc: 'ç'.repeat(300) } }));
  add('v_title60_emoji', 'başlık 60 emoji (kod noktası)', base({ meta: { title: '😀'.repeat(60) } }));
  add('v_title_trim', 'başlık boşlukla çevrili (kırpılır)', base({ meta: { title: '  boşluklu  ', desc: '\n x \n' } }));
  add('v_blockcount_max', 'blockCount 2097152', base({ meta: { blockCount: 2097152 } }));
  add('v_blockcount_zero', 'blockCount 0', base({ meta: { blockCount: 0 } }));

  // ---- geçersiz: üst düzey
  [0, 2, '1', null, true, 1.5, [], {}].forEach((v, i) => add('i_version_' + i, 'v=' + JSON.stringify(v), base({ v })));
  { const m = base(); delete m.v; add('i_version_absent', 'v yok', m); }
  ['', 'Düz', 'duz', null, 5, [], 'DÜZ', 'ada '].forEach((b, i) => add('i_base_' + i, 'base=' + JSON.stringify(b), base({ base: b })));
  { const m = base(); delete m.base; add('i_base_absent', 'base yok', m); }
  [null, 'Gündüz', 'öğle', 5, [], ''].forEach((t, i) => add('i_time_' + i, 'time=' + JSON.stringify(t), base({ time: t })));
  [{ x: 128 }, { x: 128, z: 127 }, { x: 127, z: 128 }, { x: '128', z: 128 }, { x: 256, z: 256 }, { x: 16, z: 16 }, [], null, 128, { x: -128, z: 128 }, { z: 128, x: 128, y: 1 }]
    .forEach((s, i) => add('i_size_' + i, 'size=' + JSON.stringify(s), base({ size: s })));
  { const m = base(); delete m.size; add('i_size_absent', 'size yok', m); }
  [[8, 5], [8, 5, 8, 1], ['8', 5, 8], [null, 5, 8], [-1, 5, 8], [8, -1, 8], [8, 5, -0.01], [128, 5, 8], [8, 128, 8], [8, 5, 128], 'x', null, {}, [8, 5, true]]
    .forEach((s, i) => add('i_spawn_' + i, 'spawn=' + JSON.stringify(s), base({ spawn: s })));
  { const m = base(); delete m.spawn; add('i_spawn_absent', 'spawn yok', m); }
  ['x', null, 5, [], ['0,0'], 0].forEach((c, i) => add('i_chunks_' + i, 'chunks=' + JSON.stringify(c), base({ chunks: c })));
  { const m = base(); delete m.chunks; add('i_chunks_absent', 'chunks yok', m); }
  add('i_not_object_array', 'harita dizi', [1, 2, 3]);
  add('i_not_object_null', 'harita null', null);
  add('i_not_object_string', 'harita metin', 'x');
  add('i_not_object_num', 'harita sayı', 5);

  // ---- geçersiz: chunk anahtarları
  ['00,0', '0,00', '0,0 ', '0,0\n', ' 0,0', '-1,0', '0,-1', '8,0', '0,8', '8,8', '0,0,0', '0;0', 'a,b', '1e0,0', '٠,٠', '０,０', ',', '0,', ',0', '0,0\u0000', '+1,0', '1.0,0', '0x1,0', '007,0']
    .forEach((k, i) => add('i_key_' + i, 'anahtar ' + JSON.stringify(k), base({ chunks: { [k]: STONE } })));
  // ---- geçersiz: chunk değerleri
  [5, null, [], {}, '', 'AAAA', true, ['AAAA']].forEach((c, i) => add('i_chunkval_' + i, 'chunk değeri ' + JSON.stringify(c), base({ chunks: { '0,0': c } })));
  // ---- RLE
  add('i_rle_zero_run', 'sıfır uzunluklu koşu', base({ chunks: { '0,0': rle([[1, 0], [0, VOX]]) } }));
  add('i_rle_short', 'toplam 32767', base({ chunks: { '0,0': rle([[0, VOX - 1]]) } }));
  add('i_rle_long', 'toplam 32769', base({ chunks: { '0,0': rle([[0, VOX], [1, 1]]) } }));
  add('i_rle_long2', 'toplam 65535 (tek koşu)', base({ chunks: { '0,0': rle([[1, 65535]]) } }));
  add('i_rle_empty', 'boş dizi base64', base({ chunks: { '0,0': '' } }));
  [100, 127, 128, 200, 254, 255].forEach((id) => add('i_id_' + id, 'blok kimliği ' + id + ' (>99)', base({ chunks: { '0,0': rle([[id, 10], [0, VOX - 10]]) } })));
  add('i_id_first', 'ilk koşuda 100', base({ chunks: { '0,0': rle([[100, VOX]]) } }));
  add('i_id_99_ok', 'kimlik 99 geçerli', base({ chunks: { '0,0': rle([[99, VOX]]) } }));
  const okB64 = STONE;
  [okB64.slice(0, -1), okB64 + 'A', okB64.replace(/[+/]/, '-'), okB64.slice(0, 8) + '\n' + okB64.slice(8), okB64.slice(0, 8) + ' ' + okB64.slice(8), 'AA==AA==', okB64 + '===', okB64.replace(/A/, '='), 'A', 'AA', 'AAA', 'AAAAA', '****']
    .forEach((s, i) => add('i_b64_' + i, 'base64 bozukluğu #' + i, base({ chunks: { '0,0': s } })));
  add('i_b64_urlsafe', 'URL güvenli alfabe', base({ chunks: { '0,0': rle([[1, 1000], [0, VOX - 1000]]).replace(/\+/g, '-').replace(/\//g, '_') + '-_' } }));
  // ---- meta
  [{ title: 5 }, { title: 'a'.repeat(61) }, { title: '😀'.repeat(61) }, { desc: 'a'.repeat(301) }, { desc: 7 }, { blockCount: -1 }, { blockCount: 1.5 }, { blockCount: '5' }, { blockCount: 2097153 }, { blockCount: null }, { title: null }, { desc: null }, [], 'x', 5, null]
    .forEach((m, i) => add('i_meta_' + i, 'meta=' + JSON.stringify(m), base({ meta: m })));
  // ---- sınırlar
  const many = {};
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) many[x + ',' + z] = AIR;
  many['8,0'] = AIR;
  add('i_65_chunks', '65 anahtar (biri aralık dışı)', base({ chunks: many }));
  // not: 700 KB toplam sınırı her iki tarafın kendi testlerinde (web mapFormat.test.js, PHP KesifMapValidatorTest/KesifAbuseTest) sınanır; korpus dosyası küçük kalsın diye burada yok.

  // ---- rastgele yapısal bozma (belirlenimli)
  const rng = seededRandom(0xc0de);
  const hostile = [null, true, false, 0, -1, 1, 2 ** 31, 1e308, '', 'x', '😀', [], {}, [1], { a: 1 }, 99, 100, 127, 128, 255, 256];
  const walk = (node, p, out) => {
    if (!node || typeof node !== 'object') return out;
    Object.keys(node).forEach((k) => { out.push(p.concat([k])); walk(node[k], p.concat([k]), out); });
    return out;
  };
  for (let i = 0; i < 90; i++) {
    const m = JSON.parse(JSON.stringify(base({ chunks: { '0,0': STONE, '2,3': MIXED, '7,7': AIR } })));
    for (let q = rng.int(1, 3); q > 0; q--) {
      const ps = walk(m, [], []);
      const p = rng.pick(ps);
      let par = m;
      for (let j = 0; j < p.length - 1; j++) par = par[p[j]];
      const key = p[p.length - 1];
      const op = rng.int(0, 4);
      if (op === 0) delete par[key];
      else if (op === 1) par[key] = rng.pick(hostile);
      else if (op === 2 && typeof par[key] === 'string') par[key] = par[key].slice(0, rng.int(0, par[key].length));
      else if (op === 3 && typeof par[key] === 'string') par[key] = par[key] + rng.pick(['A', '=', '==', '\n', ' ', '-', '😀', 'AAAA']);
      else if (typeof par[key] === 'number') par[key] = par[key] + rng.pick([-1, 1, 0.5, -0.5, 128, 1e6]);
      else par[key] = rng.pick(hostile);
    }
    add('r_' + i, 'rastgele bozma #' + i, m);
  }
  return out;
}

/**
 * Bilinen, ZARARSIZ JSON-düzeyi sapmalar (PHP'nin KARARI web'den farklı olduğunda korpusta php_ok=true): PHP json_decode "{}" ile "[]" yi ayırt edemez ve isset() null'ı yok sayar →
 *  (A) chunks = [] (boş dizi): PHP kabul eder, "{}" olarak saklar;  (B) meta = null / [] : PHP "meta yok" sayar;  (C) meta.title/desc/blockCount = null: PHP yok sayar
 * ve sunucu meta'yı KENDİ alanlarıyla yeniden yazar. Web istemcisi bu biçimleri hiç üretmez; PHP'nin gevşekliği yalnız kabul yönündedir ve saklanan veri normalleşir.
 * Başka hiçbir sapma yoktur (test kırılır).
 */
function phpLenient(map, codes) {
  if (codes.length === 0) return false;
  const only = (allowed) => codes.every((c) => allowed.indexOf(c) >= 0);
  const m = map && typeof map === 'object' ? map : null;
  if (!m) return false;
  const emptyArr = (v) => Array.isArray(v) && v.length === 0;
  if (only(['chunks']) && emptyArr(m.chunks)) return true;
  if (only(['meta']) && (m.meta === null || emptyArr(m.meta))) return true;
  if (only(['meta_title', 'meta_desc', 'meta_blockCount']) && m.meta && typeof m.meta === 'object') {
    const bad = codes.map((c) => c.slice(5));
    return bad.every((k) => m.meta[k === 'blockCount' ? 'blockCount' : k] === null);
  }
  // birleşik: chunks=[] + meta kusuru aynı haritada
  if (only(['chunks', 'meta', 'meta_title', 'meta_desc', 'meta_blockCount']) && emptyArr(m.chunks)) {
    const metaCodes = codes.filter((c) => c !== 'chunks');
    if (metaCodes.length === 0) return true;
    return phpLenient(Object.assign({}, m, { chunks: {} }), metaCodes);
  }
  return false;
}

function corpus() {
  return buildCases().map(([id, desc, map]) => {
    const m = map === undefined ? null : JSON.parse(JSON.stringify(map === null ? null : map));
    const v = validateMap(m);
    const entry = {
      id, desc, map: m, web: { ok: v.ok, codes: v.codes },
    };
    if (v.ok) entry.normalized = JSON.parse(JSON.stringify(normalizeMap(m)));
    if (!v.ok && phpLenient(m, v.codes)) entry.php_ok = true;
    return entry;
  });
}

describe('qa5 harita korpusu — web doğrulayıcı (DEĞİŞMEDİ) ve çapraz denetim', () => {
  it('kural tablosu değişmedi: id ≤ 99 (BUILDABLE_MAX), 128×128, ≤64 chunk, 700 KB; şehir blokları (≥223) haritaya sızamaz; MAX_BLOCK_ID 254', () => {
    expect(RULES.maxBlockId).toBe(99);
    expect(BUILDABLE_MAX).toBe(99);
    expect(MAX_BLOCK_ID).toBe(254);
    expect(RULES.sizeX).toBe(128);
    expect(RULES.sizeZ).toBe(128);
    expect(RULES.maxChunks).toBe(64);
    expect(RULES.maxEncodedBytes).toBe(700 * 1024);
    [100, 127, 128, 200, 223, 234, 240, 241, 249, 250, 253, 254, 255].forEach((id) => {
      const v = validateMap(base({ chunks: { '0,0': rle([[id, VOX]]) } }));
      expect(v.ok, 'id ' + id).toBe(false);
      expect(v.codes).toContain('block_id');
    });
    [0, 1, 50, 99].forEach((id) => expect(validateMap(base({ chunks: { '0,0': rle([[id, VOX]]) } })).ok, 'id ' + id).toBe(true));
  });

  it('korpus yeterince geniş ve dengeli (geçerli + geçersiz + rastgele); kimlikler benzersiz; JSON güvenli', () => {
    const c = corpus();
    expect(c.length).toBeGreaterThan(220);
    expect(new Set(c.map((e) => e.id)).size).toBe(c.length);
    const ok = c.filter((e) => e.web.ok).length;
    expect(ok).toBeGreaterThan(30);
    expect(c.length - ok).toBeGreaterThan(150);
    c.forEach((e) => expect(JSON.parse(JSON.stringify(e))).toEqual(e));
    // bilinen sapma sınıfları korpusta temsil edilir
    expect(c.filter((e) => e.php_ok === true).length).toBeGreaterThanOrEqual(5);
  });

  it('API deposundaki korpus dosyası (varsa) üretilen korpusla BİREBİR aynı; KESIF_QA5_CORPUS_WRITE=1 ile yenilenir', () => {
    const text = '{"version":1,"cases":[\n' + corpus().map((e) => JSON.stringify(e)).join(',\n') + '\n]}\n';
    if (ENV.KESIF_QA5_CORPUS_WRITE === '1') writeFileSync(API_FIXTURE, text);
    if (!existsSync(API_FIXTURE)) return; // API deposu yanında değil (CI): atla
    const disk = readFileSync(API_FIXTURE, 'utf8').replace(/\r\n/g, '\n');
    expect(disk === text, 'korpus dosyası güncel değil: KESIF_QA5_CORPUS_WRITE=1 npx vitest run src/game/kesif/qa5/qa5MapCorpus.test.js').toBe(true);
  });
});
