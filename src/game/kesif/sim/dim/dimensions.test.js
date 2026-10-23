import { describe, expect, it } from 'vitest';
import { WORLD_Y_MAX, WORLD_Y_MIN } from '../constants.js';
import { hash2, hash3 } from '../rng.js';
import {
  DIMS, DIM_IDS, DIM_SAVE_LIMITS, MISSION_BOARD_SEC, NEON_BOUNDS, NEON_DAY_SEC, NEON_SIZE, NEON_START_PHASE, TERMINAL_COUNT,
  cleanDimId, dimChunkInBounds, dimSeed, getDim, isDimId, missionDayN, neonCityDay, subHash,
} from './dimensions.js';

describe('DIMS tablosu', () => {
  it('overworld: idx 0, gen overworld; neon: idx 1, gen city, sözleşme alanları', () => {
    expect(DIMS.overworld).toMatchObject({ id: 'overworld', idx: 0, gen: 'overworld' });
    const n = DIMS.neon;
    expect(n).toMatchObject({
      id: 'neon', idx: 1, gen: 'city', yMin: -400, yMax: 362, groundY: 64, weather: 'neon', spawnProfile: 'neon', palette: 'neon', audio: 'neon',
    });
    expect(n.bounds).toEqual({
      minCx: -50, maxCx: 49, minCz: -50, maxCz: 49,
    });
    expect(n.day).toEqual({ lenSec: 600, startPhase: 0.8125 });
    expect(n.rules).toMatchObject({
      zones: false, structures: false, puzzles: false, beds: 'skipOnly', protected: true,
    });
    expect(DIM_IDS).toEqual(['overworld', 'neon']);
  });

  it('tablo donuk; y aralığı derin dünya ile aynı', () => {
    expect(Object.isFrozen(DIMS)).toBe(true);
    expect(Object.isFrozen(DIMS.neon)).toBe(true);
    expect(Object.isFrozen(DIMS.neon.bounds)).toBe(true);
    expect(DIMS.neon.yMin).toBe(WORLD_Y_MIN);
    expect(DIMS.neon.yMax).toBe(WORLD_Y_MAX);
  });

  it('şehir 1600×1600 blok: x,z ∈ [-800,800) ve chunk sınırları', () => {
    expect(NEON_SIZE).toBe(1600);
    expect((NEON_BOUNDS.maxCx - NEON_BOUNDS.minCx + 1) * 16).toBe(1600);
    expect(NEON_BOUNDS.minCx * 16).toBe(-800);
    expect((NEON_BOUNDS.maxCx + 1) * 16).toBe(800);
    expect(dimChunkInBounds('neon', -50, -50)).toBe(true);
    expect(dimChunkInBounds('neon', 49, 49)).toBe(true);
    expect(dimChunkInBounds('neon', 50, 0)).toBe(false);
    expect(dimChunkInBounds('neon', 0, -51)).toBe(false);
    expect(dimChunkInBounds('overworld', 99999, -99999)).toBe(true);
    expect(dimChunkInBounds('yok', 5, 5)).toBe(true);
  });

  it('terminal sayısı 16, şehir günü 600 sn, başlangıç 19:30, pano 1200 sn', () => {
    expect(TERMINAL_COUNT).toBe(16);
    expect(NEON_DAY_SEC).toBe(600);
    expect(NEON_START_PHASE).toBe(0.8125);
    expect(NEON_START_PHASE * 24).toBeCloseTo(19.5, 6);
    expect(MISSION_BOARD_SEC).toBe(1200);
  });

  it('kayıt sınırları sözleşmedeki gibi', () => {
    expect(DIM_SAVE_LIMITS.edits).toBe(250 * 1024);
    expect(DIM_SAVE_LIMITS.props).toBe(40 * 1024);
    expect(DIM_SAVE_LIMITS.city).toBe(60 * 1024);
    expect(DIM_SAVE_LIMITS.total).toBe(400 * 1024);
    expect(DIM_SAVE_LIMITS.editFullFrac).toBe(0.9);
    expect(Object.isFrozen(DIM_SAVE_LIMITS)).toBe(true);
  });
});

describe('getDim / isDimId / cleanDimId', () => {
  it('bilinen kimlik tanımı döner; bilinmeyen, prototip anahtarı ve tür dışı null', () => {
    expect(getDim('overworld')).toBe(DIMS.overworld);
    expect(getDim('neon')).toBe(DIMS.neon);
    ['', 'Neon', 'NEON', 'city', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype', null, undefined, 5, {}, [], ['neon']]
      .forEach((v) => {
        expect(getDim(v), String(v)).toBeNull();
        expect(isDimId(v), String(v)).toBe(false);
        expect(cleanDimId(v), String(v)).toBe('overworld');
      });
    expect(cleanDimId('neon')).toBe('neon');
  });
});

describe('dimSeed / subHash', () => {
  it("'neon' tohumu sözleşmedeki formül: hash2(seed|0, 0x4E454F4E, 0x4D455244) >>> 0", () => {
    [0, 1, 7, 20261016, 4294967295, 123456789].forEach((s) => {
      expect(dimSeed(s, 'neon')).toBe(hash2(s | 0, 0x4e454f4e, 0x4d455244) >>> 0);
    });
  });

  it('overworld tohumu dünya tohumunun kendisi', () => {
    [0, 1, 99, 4294967295].forEach((s) => expect(dimSeed(s, 'overworld')).toBe(s));
  });

  it('belirlenimci: aynı girdi aynı çıktı (1000 tohum); uint32; farklı tohum → farklı şehir', () => {
    const seen = new Set();
    for (let s = 0; s < 1000; s++) {
      const a = dimSeed(s * 7919 + 3, 'neon');
      expect(dimSeed(s * 7919 + 3, 'neon')).toBe(a);
      expect(Number.isInteger(a) && a >= 0 && a <= 4294967295).toBe(true);
      seen.add(a);
    }
    expect(seen.size).toBeGreaterThan(995); // 32 bit'te çakışma son derece nadir
  });

  it('neon tohumu overworld tohumundan ayrı (1000 tohumda hiç eşit değil)', () => {
    for (let s = 1; s <= 1000; s++) expect(dimSeed(s, 'neon')).not.toBe(dimSeed(s, 'overworld'));
  });

  it('metin tohumu ve NaN/Infinity/null güvenli', () => {
    expect(dimSeed('ABCD1234', 'neon')).toBe(dimSeed('ABCD1234', 'neon'));
    expect(dimSeed('ABCD1234', 'neon')).not.toBe(dimSeed('ABCD1235', 'neon'));
    [NaN, Infinity, -Infinity, null, undefined].forEach((v) => {
      const a = dimSeed(v, 'neon');
      expect(Number.isInteger(a) && a >= 0).toBe(true);
      expect(a).toBe(dimSeed(0, 'neon'));
    });
  });

  it('bilinmeyen boyut atar', () => {
    expect(() => dimSeed(1, 'yok')).toThrow(/Bilinmeyen boyut/);
    expect(() => dimSeed(1, '__proto__')).toThrow();
  });

  it('subHash = hash3(id|0, tag|0, 0, seed|0); akışlar bağımsız', () => {
    expect(subHash(5, 9, 3)).toBe(hash3(9, 3, 0, 5));
    expect(subHash(5, 9, 3)).not.toBe(subHash(5, 9, 4));
    expect(subHash(5, 9, 3)).not.toBe(subHash(5, 10, 3));
    expect(subHash(5, 9, 3)).not.toBe(subHash(6, 9, 3));
    expect(subHash(2.9, 9.9, 3.9)).toBe(subHash(2, 9, 3));
  });
});

describe('gün sayaçları', () => {
  it('şehir günü 600 sn; görev panosu 1200 sn şehir oyun süresi', () => {
    expect(neonCityDay(0)).toBe(0);
    expect(neonCityDay(599.9)).toBe(0);
    expect(neonCityDay(600)).toBe(1);
    expect(missionDayN(1199.9)).toBe(0);
    expect(missionDayN(1200)).toBe(1);
    expect(missionDayN(3600)).toBe(3);
    [NaN, -5, Infinity, 'x', null].forEach((v) => {
      expect(neonCityDay(v)).toBe(0);
      expect(missionDayN(v)).toBe(0);
    });
  });

  it('görev panosu günü saatten bağımsız (saat fazı etkilemez)', () => {
    for (let t = 0; t < 7200; t += 37) expect(missionDayN(t)).toBe(Math.floor(t / 1200));
  });
});
