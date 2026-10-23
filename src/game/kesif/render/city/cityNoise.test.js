import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildCityNoiseData, latticeValue, createCityNoiseTexture, CITY_NOISE_SIZE, CITY_NOISE_CELL, CITY_NOISE_CELLS,
} from './cityNoise.js';

describe('şehir gürültü dokusu', () => {
  const data = buildCityNoiseData();
  const S = CITY_NOISE_SIZE;
  const at = (x, y, c) => data[(((y % S) + S) % S * S + (((x % S) + S) % S)) * 4 + c];

  it('boyutlar: 256×256 RGBA8, 32×32 kafes, hücre başına 8 texel', () => {
    expect(CITY_NOISE_SIZE).toBe(256);
    expect(CITY_NOISE_CELL).toBe(8);
    expect(CITY_NOISE_CELLS).toBe(32);
    expect(data.length).toBe(256 * 256 * 4);
    expect(data).toBeInstanceOf(Uint8Array);
  });

  it('belirlenimci: iki üretim aynı bayt', () => {
    const b = buildCityNoiseData();
    let same = true;
    for (let i = 0; i < data.length; i++) if (data[i] !== b[i]) { same = false; break; }
    expect(same).toBe(true);
  });

  it('kafes noktalarında (texel i·8) değer TAM kafes değeridir — shader kHash4 bunu okur', () => {
    for (let j = 0; j < CITY_NOISE_CELLS; j += 3) {
      for (let i = 0; i < CITY_NOISE_CELLS; i += 3) {
        for (let c = 0; c < 4; c++) expect(at(i * 8, j * 8, c)).toBe(latticeValue(i, j, c));
      }
    }
  });

  it('periyodik: kafes değeri 32 hücrede sarar; doku kenarı karşı kenara kesintisiz bağlanır', () => {
    expect(latticeValue(32, 5, 0)).toBe(latticeValue(0, 5, 0));
    expect(latticeValue(-1, -1, 2)).toBe(latticeValue(31, 31, 2));
    expect(latticeValue(100, 7, 1)).toBe(latticeValue(4, 7, 1));
    // son texel ile ilk texel arasındaki fark komşu texel farkları büyüklüğünde (süreksizlik yok)
    let maxStep = 0;
    let maxWrap = 0;
    for (let y = 0; y < S; y += 5) {
      for (let c = 0; c < 4; c++) {
        maxWrap = Math.max(maxWrap, Math.abs(at(S - 1, y, c) - at(0, y, c)));
        for (let x = 0; x < S - 1; x++) maxStep = Math.max(maxStep, Math.abs(at(x, y, c) - at(x + 1, y, c)));
      }
    }
    expect(maxWrap).toBeLessThanOrEqual(maxStep);
  });

  it('smoothstep aradeğeri: hücre içinde tekdüze ve komşu kafes değerleri arasında; kanallar bağımsız', () => {
    for (let c = 0; c < 4; c++) {
      const a = latticeValue(3, 4, c);
      const b = latticeValue(4, 4, c);
      const lo = Math.min(a, b) - 1;
      const hi = Math.max(a, b) + 1;
      let prev = a;
      for (let k = 0; k <= 8; k++) {
        const v = at(24 + k, 32, c);
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
        if (b >= a) expect(v).toBeGreaterThanOrEqual(prev - 1);
        else expect(v).toBeLessThanOrEqual(prev + 1);
        prev = v;
      }
    }
    // kanallar bağımsız (aynı kafeste farklı değerler çoğunlukla)
    let diff = 0;
    for (let i = 0; i < 32; i++) for (let j = 0; j < 32; j++) if (latticeValue(i, j, 0) !== latticeValue(i, j, 1)) diff++;
    expect(diff).toBeGreaterThan(900);
  });

  it('dağılım: ortalama ≈ 128 (0..255 tam aralık kullanılır), düzgün; her kanal', () => {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < data.length; i += 4) {
        const v = data[i + c];
        sum += v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const mean = sum / (data.length / 4);
      expect(mean).toBeGreaterThan(110);
      expect(mean).toBeLessThan(146);
      expect(lo).toBeLessThan(25);
      expect(hi).toBeGreaterThan(230);
    }
  });

  it('latticeValue 0..255 tamsayı; negatif/taşan indeks güvenli', () => {
    [[0, 0, 0], [-999, 12345, 3], [1e6, -1e6, 1], [NaN, 0, 0]].forEach(([i, j, c]) => {
      const v = latticeValue(i, j, c);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    });
  });

  it('three dokusu: RGBA8, lineer, mipmap yok, periyodik sarma, veri dokusu (doğrusal renk)', () => {
    const tex = createCityNoiseTexture(THREE);
    expect(tex.isDataTexture).toBe(true);
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(256);
    expect(tex.format).toBe(THREE.RGBAFormat);
    expect(tex.type).toBe(THREE.UnsignedByteType);
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.minFilter).toBe(THREE.LinearFilter);
    expect(tex.generateMipmaps).toBe(false);
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);
    tex.dispose();
  });
});
