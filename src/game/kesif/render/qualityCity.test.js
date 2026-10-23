import { describe, it, expect } from 'vitest';
import { QUALITY, CITY_QUALITY, cityQualityFor } from './quality.js';

describe('şehir kalite tablosu (sözleşme §13, §17)', () => {
  it('görüş 9/7/5; ses düğümü 24/18/12; planar ayna hiçbir kademede yok', () => {
    expect(CITY_QUALITY.high.viewDist).toBe(9);
    expect(CITY_QUALITY.medium.viewDist).toBe(7);
    expect(CITY_QUALITY.low.viewDist).toBe(5);
    expect(CITY_QUALITY.high.audioNodes).toBe(24);
    expect(CITY_QUALITY.medium.audioNodes).toBe(18);
    expect(CITY_QUALITY.low.audioNodes).toBe(12);
    ['low', 'medium', 'high'].forEach((k) => expect(CITY_QUALITY[k].planarMirror).toBe(false));
  });

  it('siluet ≤600 kutu, holo ≤8 görünür; kademe arttıkça hiçbir ayar azalmaz (tekdüze)', () => {
    const order = ['low', 'medium', 'high'].map((k) => CITY_QUALITY[k]);
    expect(CITY_QUALITY.high.skylineBoxes).toBe(600);
    order.forEach((q) => {
      expect(q.skylineBoxes).toBeLessThanOrEqual(600);
      expect(q.holoVisible).toBeLessThanOrEqual(8);
    });
    ['viewDist', 'audioNodes', 'skylineBoxes', 'holoVisible', 'rings', 'steam', 'sparks', 'dust'].forEach((k) => {
      expect(order[0][k]).toBeLessThanOrEqual(order[1][k]);
      expect(order[1][k]).toBeLessThanOrEqual(order[2][k]);
    });
    expect(['fresnel', 'puddle', 'rings']).toEqual(order.map((q) => q.wet));
    expect(order.map((q) => q.windowGroupA)).toEqual([false, true, true]);
  });

  it('düşük kademede post-fx kapalı (neon emisyon + aCity ile okunur); orta/yüksek açık', () => {
    expect(QUALITY.low.post).toBe(false);
    expect(CITY_QUALITY.low.postBloom).toBe(false);
    expect(CITY_QUALITY.medium.postBloom).toBe(true);
    expect(CITY_QUALITY.high.postBloom).toBe(true);
    ['low', 'medium', 'high'].forEach((k) => expect(CITY_QUALITY[k].postBloom).toBe(QUALITY[k].post));
  });

  it('tablolar donuk; QUALITY (ana diyar) değişmedi', () => {
    expect(Object.isFrozen(CITY_QUALITY)).toBe(true);
    ['low', 'medium', 'high'].forEach((k) => expect(Object.isFrozen(CITY_QUALITY[k])).toBe(true));
    expect(QUALITY.high.viewDist).toBe(10);
    expect(QUALITY.medium.viewDist).toBe(7);
    expect(QUALITY.low.viewDist).toBe(5);
  });

  it('cityQualityFor: anahtar, QUALITY ayar nesnesi (effTier|key|tier), bilinmeyen → medium', () => {
    expect(cityQualityFor('low')).toBe(CITY_QUALITY.low);
    expect(cityQualityFor('high')).toBe(CITY_QUALITY.high);
    expect(cityQualityFor({ effTier: 'low', tier: 'high' })).toBe(CITY_QUALITY.low);
    expect(cityQualityFor({ key: 'high' })).toBe(CITY_QUALITY.high);
    expect(cityQualityFor({ tier: 'low' })).toBe(CITY_QUALITY.low);
    [null, undefined, 5, 'x', {}, '__proto__', 'constructor'].forEach((v) => expect(cityQualityFor(v)).toBe(CITY_QUALITY.medium));
  });

  it('şehir hava parçacıkları tek çizim çağrılık örnek bütçesi içinde (kademe başına < 1000 örnek)', () => {
    ['low', 'medium', 'high'].forEach((k) => {
      const q = CITY_QUALITY[k];
      expect(q.rings + q.steam + q.sparks + q.dust).toBeLessThan(1000);
    });
  });
});
