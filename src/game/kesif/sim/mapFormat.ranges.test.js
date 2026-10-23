import { describe, expect, it } from 'vitest';
import { BUILDABLE_MAX, CHUNK_VOLUME, MAP_H, MAX_BLOCK_ID } from './constants.js';
import { buildMap, decodeChunk, emptyMap, encodeChunk, validateMap } from './mapFormat.js';
import { mapReplacementId } from './saveMapIO.js';

/* Paylaşılan harita biçimi (0..127, id <= 99) macera genişlemesinden (128–254 kimlik, derin dünya) etkilenmemeli.
 * PHP KesifMapValidatorTest aynı aralığı (100..255) tarar; iki taraf birlikte kırılır. */
describe('harita biçimi: macera kimlik aralıkları haritaya sızmaz', () => {
  it('harita yüksekliği ve chunk hacmi değişmedi (128 / 32768)', () => {
    expect(MAP_H).toBe(128);
    expect(CHUNK_VOLUME).toBe(16 * 16 * 128);
    expect(BUILDABLE_MAX).toBe(99);
    expect(MAX_BLOCK_ID).toBe(254);
  });

  it('100..255 arası HER kimlik validateMap tarafından reddedilir', () => {
    const bad = [];
    for (let id = BUILDABLE_MAX + 1; id <= 255; id++) {
      const b = new Uint8Array(CHUNK_VOLUME);
      b[77] = id;
      const m = Object.assign(emptyMap(), { chunks: { '1,1': encodeChunk(b) } });
      const v = validateMap(m);
      if (v.ok || v.codes.indexOf('block_id') < 0) bad.push(id);
    }
    expect(bad).toEqual([]);
  });

  it('buildMap 100..254 kimliklerini havaya çevirir; 1..99 aynen kalır', () => {
    const b = new Uint8Array(CHUNK_VOLUME);
    for (let id = 1; id <= 254; id++) b[id] = id;
    const m = buildMap({ chunks: { '0,0': b } });
    const back = decodeChunk(m.chunks['0,0']);
    for (let id = 1; id <= 254; id++) expect(back[id], 'id ' + id).toBe(id <= BUILDABLE_MAX ? id : 0);
    expect(validateMap(m).ok).toBe(true);
  });

  it('mapReplacementId her macera kimliğini haritada izinli bir kimliğe indirger', () => {
    for (let id = 0; id <= 255; id++) {
      const r = mapReplacementId(id);
      expect(r, 'id ' + id).toBeLessThanOrEqual(BUILDABLE_MAX);
      if (id <= BUILDABLE_MAX) expect(r).toBe(id);
    }
  });
});
