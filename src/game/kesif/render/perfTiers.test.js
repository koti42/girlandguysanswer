import { describe, it, expect } from 'vitest';
import { QUALITY, CITY_QUALITY } from './quality.js';
import { PROP_TIERS } from './props/propRenderer.js';
import { INTERIOR_TIERS } from './props/propRendererInterior.js';
import { RENDER_TIERS } from './city/vehicleModels.js';
import { FIGURE_TIERS } from './city/npcFigures.js';
import { TIER_CAPS } from '../sim/city/ped/pedData.js';
import { ROBOT_CAPS } from '../sim/city/ped/robotData.js';
import { NODE_CAP_BY_TIER } from '../audioVehicleMath.js';
import { TIER_CAP } from '../systems/traffic.js';
import { CITY_DRAW_BUDGET, CITY_DRAW_TARGET, CITY_DRAW_HARD, triangleBudget } from '../gameQuality.js';

// perf_tuner (Faz 5): tüm kademe tabloları için değişmezler — kademe tekdüzeliği, sözleşme §17 tavanları, hiçbir kademe bütçeyi aşmaz.
const ORDER = ['low', 'medium', 'high'];

function numericKeys(tbl) {
  return Object.keys(tbl.high).filter((k) => typeof tbl.high[k] === 'number');
}

function monotone(name, tbl, skip) {
  it(`${name}: low ≤ medium ≤ high (her sayısal alan)`, () => {
    numericKeys(tbl).filter((k) => !(skip || []).includes(k)).forEach((k) => {
      expect(tbl.low[k], `${name}.low.${k}`).toBeLessThanOrEqual(tbl.medium[k]);
      expect(tbl.medium[k], `${name}.medium.${k}`).toBeLessThanOrEqual(tbl.high[k]);
    });
  });
}

describe('kademe tablolarının tekdüzeliği', () => {
  monotone('QUALITY', QUALITY);
  monotone('CITY_QUALITY', CITY_QUALITY);
  monotone('PROP_TIERS', PROP_TIERS);
  monotone('INTERIOR_TIERS', INTERIOR_TIERS);
  monotone('RENDER_TIERS (araç)', RENDER_TIERS);
  monotone('FIGURE_TIERS', FIGURE_TIERS);
  monotone('ped TIER_CAPS', TIER_CAPS, ['despawnR', 'spawnMin', 'spawnMax']);
  monotone('ROBOT_CAPS', ROBOT_CAPS);
  it('trafik / ses düğümü tavanları low ≤ medium ≤ high', () => {
    [TIER_CAP, NODE_CAP_BY_TIER].forEach((t) => {
      expect(t.low).toBeLessThanOrEqual(t.medium);
      expect(t.medium).toBeLessThanOrEqual(t.high);
    });
  });
  it('tüm tablolar donuk ve üç kademeyi (low, medium, high) içerir', () => {
    [QUALITY, CITY_QUALITY, PROP_TIERS, INTERIOR_TIERS, RENDER_TIERS, FIGURE_TIERS, TIER_CAPS, ROBOT_CAPS, TIER_CAP, NODE_CAP_BY_TIER].forEach((t) => {
      expect(Object.isFrozen(t)).toBe(true);
      expect(Object.keys(t).sort()).toEqual(['high', 'low', 'medium']);
    });
  });
});

describe('sözleşme §17 sayıları', () => {
  it('görüş 9/7/5 (şehir), trafik 30/18/10, yaya 60/40/24, ses düğümü 24/18/12', () => {
    expect(ORDER.map((k) => CITY_QUALITY[k].viewDist)).toEqual([5, 7, 9]);
    expect(ORDER.map((k) => TIER_CAP[k])).toEqual([10, 18, 30]);
    expect(ORDER.map((k) => TIER_CAPS[k].total)).toEqual([24, 40, 60]);
    expect(ORDER.map((k) => NODE_CAP_BY_TIER[k])).toEqual([12, 18, 24]);
    expect(ORDER.map((k) => RENDER_TIERS[k].traffic)).toEqual([10, 18, 30]);
  });

  it('çizim çağrısı bölüşümü kademe başına toplamı 250’yi aşmaz (chunk 150 + prop + araç + yaya + gök/parçacık)', () => {
    const split = {
      high: [150, 40, 20, 12, 28], medium: [150, 36, 18, 10, 36], low: [150, 30, 14, 8, 48],
    };
    ORDER.forEach((k) => expect(split[k].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(CITY_DRAW_BUDGET));
    // yaya figür çağrı payı (NPC figürleri) bölüşümdeki yaya payını aşmaz
    ORDER.forEach((k) => expect(FIGURE_TIERS[k].draws).toBeLessThanOrEqual(split[k][3] + 4));
  });

  it('çizim çağrısı yönetici eşiği hedefin ve tavanın altında; üçgen bütçeleri 400k/300k/150k', () => {
    expect(CITY_DRAW_HARD).toBeLessThan(CITY_DRAW_TARGET);
    expect(CITY_DRAW_TARGET).toBeLessThan(CITY_DRAW_BUDGET);
    expect(ORDER.map((k) => triangleBudget(k))).toEqual([150000, 300000, 400000]);
  });

  it('prop kademeleri: üçgen tavanı toplam bütçenin prop payını (60k/40k/20k) aşmaz; holo ≤ 24/16/8', () => {
    expect(ORDER.map((k) => PROP_TIERS[k].maxTris)).toEqual([20000, 40000, 60000]);
    expect(ORDER.map((k) => PROP_TIERS[k].maxHolo)).toEqual([8, 16, 24]);
    ORDER.forEach((k) => expect(PROP_TIERS[k].maxTris + INTERIOR_TIERS[k].maxTris).toBeLessThanOrEqual(triangleBudget(k) * 0.4));
  });

  it('chunk yükleme tavanı (kare başına) ve işçi sayısı makul sınırlarda; telefonda ≤ 2 yükleme / 1 işçi', () => {
    expect(QUALITY.low.maxUploads).toBeLessThanOrEqual(2);
    expect(QUALITY.low.workers).toBe(1);
    ORDER.forEach((k) => {
      expect(QUALITY[k].maxUploads).toBeGreaterThanOrEqual(1);
      expect(QUALITY[k].maxUploads).toBeLessThanOrEqual(8);
      expect(QUALITY[k].workers).toBeLessThanOrEqual(3);
    });
  });

  it('düşük kademe: post-fx kapalı, bloom kapalı; telefon dpr tavanı 1', () => {
    expect(QUALITY.low.post).toBe(false);
    expect(QUALITY.low.bloom).toBe(false);
    expect(QUALITY.low.dprMax).toBe(1);
  });
});
