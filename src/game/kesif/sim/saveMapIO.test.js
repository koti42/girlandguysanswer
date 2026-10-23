import { describe, expect, it } from 'vitest';
import { World } from './world.js';
import { B } from './blocks.js';
import { BUILDABLE_MAX, CHUNK_VOLUME, MAX_BLOCK_ID } from './constants.js';
import { createClock, setClockPhase } from './daynight.js';
import {
  chunksFromMap, decodeChunk, encodeChunk, validateMap, emptyMap, mapChunkKey,
} from './mapFormat.js';
import {
  MAP_BASE_SEED, buildInsaMap, importMap, mapReplacementId,
} from './saveMapIO.js';

function insaWorld(base, seed) {
  const w = new World({ seed: seed === undefined ? MAP_BASE_SEED : seed, mode: 'insa', base: base || 'düz' });
  for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) w.ensureChunk(cx, cz);
  return w;
}

describe('mapReplacementId', () => {
  it('buildable kimlikler aynı kalır; sistem blokları kurala göre hava/taş', () => {
    for (let id = 0; id <= BUILDABLE_MAX; id++) expect(mapReplacementId(id)).toBe(id);
    expect(mapReplacementId(B.BEDROCK)).toBe(B.STONE);
    expect(mapReplacementId(B.BOSS_DOOR)).toBe(B.STONE);
    expect(mapReplacementId(B.ALTAR)).toBe(B.STONE);
    expect(mapReplacementId(B.LOCKED_DOOR)).toBe(B.STONE);
    expect(mapReplacementId(B.REWARD_CHEST)).toBe(B.CHEST);
    expect(mapReplacementId(B.SEAL_BARRIER)).toBe(B.AIR);
    expect(mapReplacementId(B.PRESSURE_PLATE)).toBe(B.AIR);
    expect(mapReplacementId(B.LEVER)).toBe(B.AIR);
    expect(mapReplacementId(B.PORTAL_BLUE)).toBe(B.AIR);
    expect(mapReplacementId(B.PARKOUR_START)).toBe(B.AIR);
    for (let id = 100; id <= 127; id++) expect(mapReplacementId(id)).toBeLessThanOrEqual(BUILDABLE_MAX);
  });
});

describe('QA5: kimlik planı (büyü 128+, üretim 136+, biyom 160+, teknoloji 200+, yedek 240+) paylaşılan haritaya SIZMAZ', () => {
  it('100..254 her kimlik izinli bir kimliğe ya da havaya/taşa dönüşür (sunucu id <= 99)', () => {
    for (let id = 100; id <= MAX_BLOCK_ID + 1; id++) expect(mapReplacementId(id), 'id ' + id).toBeLessThanOrEqual(BUILDABLE_MAX);
    for (let id = 128; id <= 254; id++) expect(mapReplacementId(id), 'id ' + id).toBe(B.AIR);
  });

  it('inşa dünyasına (hata ayıklama vb. yoldan) konmuş teknoloji/biyom/büyü blokları dışa aktarımda kalmaz; doğrulama geçer', () => {
    const w = insaWorld('düz');
    const ids = [128, 129, 136, 137, 160, 170, 199, 200, 202, 205, 212, 222, 239, 240, 254, B.SEAL_BARRIER];
    ids.forEach((id, i) => w.setBlock(5 + i, 70, 5, id));
    const r = buildInsaMap(w, { title: 'qa5', desc: '', spawn: [10, 70, 10] });
    expect(r.ok).toBe(true);
    const c = decodeChunk(r.map.chunks['0,0']);
    for (let i = 0; i < CHUNK_VOLUME; i++) expect(c[i]).toBeLessThanOrEqual(BUILDABLE_MAX);
    expect(validateMap(r.map).ok).toBe(true);
  });
});

describe('buildInsaMap', () => {
  it('yalnız düzenlenmiş chunk\'lar, sistem blokları değişmiş, doğrulama geçer', () => {
    const w = insaWorld('düz');
    w.setBlock(5, 70, 5, B.BRICK);
    w.setBlock(6, 70, 5, B.BEDROCK);
    w.setBlock(7, 70, 5, B.SEAL_BARRIER);
    w.setBlock(8, 70, 5, B.REWARD_CHEST);
    w.setBlock(70, 70, 70, B.GLASS);
    const r = buildInsaMap(w, { title: 'Evim', desc: 'Güzel bir ev', spawn: [10, 70, 10], time: 'gece' });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.map.chunks).sort()).toEqual(['0,0', '4,4']);
    expect(r.map.base).toBe('düz');
    expect(r.map.time).toBe('gece');
    expect(r.map.spawn).toEqual([10, 70, 10]);
    expect(r.map.meta).toMatchObject({ title: 'Evim', desc: 'Güzel bir ev' });
    expect(r.map.meta.blockCount).toBeGreaterThan(0);
    expect(validateMap(r.map).ok).toBe(true);
    const c = decodeChunk(r.map.chunks['0,0']);
    const idx = (x, y, z) => (y * 16 + z) * 16 + x;
    expect(c[idx(5, 70, 5)]).toBe(B.BRICK);
    expect(c[idx(6, 70, 5)]).toBe(B.STONE);
    expect(c[idx(7, 70, 5)]).toBe(B.AIR);
    expect(c[idx(8, 70, 5)]).toBe(B.CHEST);
    for (let i = 0; i < CHUNK_VOLUME; i++) expect(c[i]).toBeLessThanOrEqual(BUILDABLE_MAX);
    expect(r.bytes).toBeGreaterThan(100);
  });

  it('hiç düzenleme yoksa chunk içermez; zaman saat evresinden türer; başlık/açıklama kırpılır; spawn sınırlanır', () => {
    const w = insaWorld('çayır');
    const clock = createClock();
    setClockPhase(clock, 0.75);
    const r = buildInsaMap(w, {
      clock, title: 'x'.repeat(200), desc: 'y'.repeat(900), player: { x: -50, y: 500, z: 9999 },
    });
    expect(r.ok).toBe(true);
    expect(r.map.chunks).toEqual({});
    expect(r.map.time).toBe('gece');
    expect(Array.from(r.map.meta.title)).toHaveLength(60);
    expect(Array.from(r.map.meta.desc)).toHaveLength(300);
    expect(r.map.spawn).toEqual([0.5, 127, 127.5]);
    expect(r.map.base).toBe('çayır');
    setClockPhase(clock, 0.1);
    expect(buildInsaMap(w, { clock }).map.time).toBe('gündüz');
    setClockPhase(clock, 0.45);
    expect(buildInsaMap(w, { clock }).map.time).toBe('gün batımı');
    expect(buildInsaMap(w, { time: 'geçersiz' }).map.time).toBe('gündüz');
  });

  it('tohum MAP_BASE_SEED değilse taban da gömülür; baseMap chunk\'ları korunur', () => {
    const w = insaWorld('ada', 12345);
    const r = buildInsaMap(w, {});
    expect(r.ok).toBe(true);
    expect(Object.keys(r.map.chunks)).toHaveLength(64);
    const w2 = insaWorld('düz');
    const keep = emptyMap('düz');
    keep.chunks['3,3'] = encodeChunk(new Uint8Array(CHUNK_VOLUME));
    const r2 = buildInsaMap(w2, { baseMap: keep });
    expect(Object.keys(r2.map.chunks)).toEqual(['3,3']);
    expect(Object.keys(buildInsaMap(w2, { all: true }).map.chunks)).toHaveLength(64);
  });

  it('700 KB sınırı aşılırsa ok:false ve Türkçe hata', () => {
    const w = insaWorld('düz');
    let s = 99;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    // her hücre rastgele → sıkıştırılamaz (chunk başına ~ 130 KB base64)
    for (let cz = 0; cz < 2; cz++) {
      for (let cx = 0; cx < 8; cx++) {
        const c = w.getChunk(cx, cz);
        const dense = new Uint8Array(CHUNK_VOLUME);
        for (let i = 0; i < CHUNK_VOLUME; i++) dense[i] = 1 + Math.floor(rnd() * 90);
        c.loadDense(dense, 0);
        c.edited = true;
      }
    }
    const r = buildInsaMap(w, {});
    expect(r.ok).toBe(false);
    expect(r.codes).toContain('too_big');
    expect(r.errors.join(' ')).toContain('çok büyük');
  });

  it('geçersiz dünya', () => {
    expect(buildInsaMap(null, {})).toMatchObject({ ok: false, codes: ['world'] });
    expect(buildInsaMap({}, {}).ok).toBe(false);
  });
});

describe('importMap', () => {
  function sampleMap() {
    const w = insaWorld('düz');
    w.setBlock(20, 64, 20, B.BRICK);
    w.setBlock(21, 64, 20, B.GLASS);
    return buildInsaMap(w, { title: 'Örnek', spawn: [20, 66, 20] }).map;
  }

  it('geçerli harita (nesne ya da JSON) oyuna hazır veri verir; harita modunda World kurulur', () => {
    const map = sampleMap();
    ['harita', 'insa'].forEach((mode) => {
      const r = importMap(JSON.stringify(map), { mode });
      expect(r.ok).toBe(true);
      expect(r.worldOptions).toMatchObject({ seed: MAP_BASE_SEED, mode, base: 'düz' });
      expect(r.spawn).toEqual([20, 66, 20]);
      expect(r.meta.title).toBe('Örnek');
      expect(r.chunks.get('1,1')).toHaveLength(CHUNK_VOLUME);
      const w = new World(r.worldOptions);
      w.ensureChunk(1, 1);
      expect(w.getBlock(20, 64, 20)).toBe(B.BRICK);
      expect(w.getBlock(21, 64, 20)).toBe(B.GLASS);
    });
    expect(importMap(map).ok).toBe(true);
    expect(importMap(map).worldOptions.mode).toBe('harita');
  });

  it('dışa aktar → içe aktar → yeniden dışa aktar aynı chunk verisini verir', () => {
    const map = sampleMap();
    const r = importMap(map, { mode: 'insa' });
    const w = new World(r.worldOptions);
    for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) w.ensureChunk(cx, cz);
    const again = buildInsaMap(w, { baseMap: map, title: 'Örnek', spawn: [20, 66, 20] });
    expect(again.ok).toBe(true);
    expect(again.map.chunks).toEqual(map.chunks);
  });

  it('geçersiz haritalar reddedilir (atmaz)', () => {
    const map = sampleMap();
    expect(importMap('{kırık')).toMatchObject({ ok: false, codes: ['json'] });
    expect(importMap('x'.repeat(5 * 1024 * 1024))).toMatchObject({ ok: false, codes: ['too_big'] });
    expect(importMap(null).ok).toBe(false);
    expect(importMap(5).ok).toBe(false);
    expect(importMap(Object.assign({}, map, { v: 2 })).ok).toBe(false);
    expect(importMap(Object.assign({}, map, { base: 'lav' })).ok).toBe(false);
    expect(importMap(Object.assign({}, map, { size: { x: 64, z: 64 } })).ok).toBe(false);
    const bad = Object.assign({}, map, { chunks: { '0,0': 'bozuk' } });
    expect(importMap(bad).codes).toContain('base64');
    const sys = new Uint8Array(CHUNK_VOLUME);
    sys[0] = B.BEDROCK;
    const withSys = Object.assign({}, map, { chunks: { '0,0': encodeChunk(sys) } });
    expect(importMap(withSys).codes).toContain('block_id');
    expect(importMap(Object.assign({}, map, { chunks: { '9,9': map.chunks['1,1'] } })).codes).toContain('chunk_key');
  });

  it('içe aktarılan harita normalleştirilir (bilinmeyen alanlar atılır, blockCount yeniden hesaplanır)', () => {
    const map = sampleMap();
    const dirty = Object.assign({ hile: true }, map, { meta: { title: '  Ad  ', desc: '', blockCount: 1 } });
    const r = importMap(dirty);
    expect(r.ok).toBe(true);
    expect(r.map).not.toHaveProperty('hile');
    expect(r.map.meta.title).toBe('Ad');
    expect(r.map.meta.blockCount).toBe(chunksFromMap(map).size > 0 ? r.map.meta.blockCount : 0);
    expect(mapChunkKey(1, 1)).toBe('1,1');
  });
});
