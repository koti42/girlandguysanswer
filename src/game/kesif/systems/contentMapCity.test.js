import { describe, expect, it } from 'vitest';
import { cityMapInfo } from './contentMapCity.js';
import { nearestOfType } from './contentGuide.js';
import {
  CITY_MAP_BOUNDS, CITY_MAP_CELL, CITY_MAP_GRID, CITY_MAP_PALETTE, CITY_MAP_SIZE, cityMapRaster,
} from '../sim/city/cityMapRaster.js';
import { SURF, surfaceAt } from '../sim/city/cityRoads.js';
import { getCityPlan } from '../sim/city/cityPlan.js';
import { citySeed } from '../sim/city/cityPlanTestKit.js';
import { dimSeed } from '../sim/dim/dimensions.js';

/** qa_p1 G5: şehirde harita/mini harita ana diyar verisi değil ŞEHİR rasteridir; pusula hedefi ana diyar yapısı göstermez. */
const WORLD_SEED = 77;
const SEED = dimSeed(WORLD_SEED, 'neon');

function fakeG(opts) {
  const o = opts || {};
  return {
    dim: 'neon',
    body: { x: 3.5, y: 64, z: 12.5 },
    player: { yaw: 0.5 },
    spawn: { x: 0.5, y: 64, z: 2.5 },
    hud: { district: o.district === undefined ? 'Merkez' : o.district },
    dimMgr: {
      get(id) {
        return id === 'neon' ? { terminals: { found: o.found === undefined ? 0 : o.found, list: [{ x: 0, y: 64, z: 0 }, { x: -120, y: 64, z: -120 }, { x: 440, y: 64, z: 120 }] } } : null;
      },
    },
  };
}

describe('şehir harita rasteri', () => {
  it('200×200, 8 blok, ±800 sınır, palet 8 renk; her değer 1..7; belirlenimci ve önbellekli', () => {
    const a = cityMapRaster(SEED);
    expect(a.w).toBe(CITY_MAP_GRID);
    expect(a.h).toBe(CITY_MAP_GRID);
    expect(a.cell).toBe(CITY_MAP_CELL);
    expect(a.data.length).toBe(CITY_MAP_GRID * CITY_MAP_GRID);
    expect(CITY_MAP_SIZE).toBe(1600);
    expect(CITY_MAP_BOUNDS).toEqual({ minX: -800, minZ: -800, maxX: 800, maxZ: 800 });
    expect(a.palette).toBe(CITY_MAP_PALETTE);
    expect(a.paletteBase).toBe(1);
    let max = 0;
    let zero = 0;
    for (let i = 0; i < a.data.length; i++) { if (a.data[i] > max) max = a.data[i]; if (a.data[i] === 0) zero++; }
    expect(max).toBeLessThanOrEqual(7);
    expect(zero).toBe(0); // sis yok: şehir planı bilinen bir şeydir
    expect(cityMapRaster(SEED)).toBe(a);
  });

  it('içerik: merkez meydan kaldırım/meydan, kuzey-güney ana cadde asfalt, kenar su; yol ve bina oranları makul', () => {
    const a = cityMapRaster(SEED);
    const at = (x, z) => a.data[(Math.floor(z / CITY_MAP_CELL) + 100) * CITY_MAP_GRID + (Math.floor(x / CITY_MAP_CELL) + 100)];
    expect(at(2, 2)).toBe(3); // Kapı Meydanı (PLAZA)
    expect(at(-790, -790)).toBe(5); // harita kenarı: deniz
    const roads = getCityPlan(SEED).roads;
    // bir arter hücresinin asfalt çıkması
    let asphalt = 0;
    let building = 0;
    let water = 0;
    for (let i = 0; i < a.data.length; i++) { if (a.data[i] === 2) asphalt++; else if (a.data[i] === 6) building++; else if (a.data[i] === 5) water++; }
    expect(asphalt).toBeGreaterThan(1500);
    expect(building).toBeGreaterThan(2500);
    expect(water).toBeGreaterThan(1000);
    expect(surfaceAt(roads, 2, 2)).toBe(SURF.PLAZA);
  });

  it('farklı tohum farklı raster', () => {
    const b = cityMapRaster(citySeed(11));
    const a = cityMapRaster(SEED);
    let diff = 0;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++;
    expect(diff).toBeGreaterThan(0);
  });
});

describe('cityMapInfo', () => {
  it('biçim: dim neon, zone adı HUD bölgesi, bölge halkası yok, yalnız bulunmuş terminaller, rehber yok, keşif 0', () => {
    const G = fakeG({ found: 0b100 });
    const m = cityMapInfo({ G, seed: WORLD_SEED });
    expect(m.dim).toBe('neon');
    expect(m.zone.name).toBe('Merkez');
    expect(m.size).toBe(1600);
    expect(m.bounds).toEqual(CITY_MAP_BOUNDS);
    expect(m.zones).toEqual([]);
    expect(m.guide).toBeNull();
    expect(m.explored).toBe(0);
    expect(m.player).toMatchObject({ x: 3.5, z: 12.5, yaw: 0.5 });
    expect(m.spawn).toMatchObject({ x: 0.5, z: 2.5 });
    expect(m.tiles.w).toBe(200);
    expect(m.markers.map((k) => k.id)).toEqual(['terminal:0', 'terminal:2']); // 0 her zaman bulunmuş; 1 bulunmamış; 2 bulunmuş
    expect(m.markers.every((k) => k.type === 'terminal' && k.discovered === true)).toBe(true);
  });

  it('HUD bölgesi yoksa bölge planından; terminal listesi yoksa işaret yok (çökmez)', () => {
    const G = fakeG({ district: '' });
    G.dimMgr = { get: () => null };
    const m = cityMapInfo({ G, seed: WORLD_SEED });
    expect(m.zone.name.length).toBeGreaterThan(0);
    expect(m.markers).toEqual([]);
  });
});

describe('rehberlik şehirde', () => {
  it('nearestOfType: şehirde (dim neon) ana diyar yapısı bulunmaz', () => {
    const S = { G: { dim: 'neon', body: { x: 0, z: 0 } }, known: new Map(), _anchors: [{ id: 'a', type: 'anahtartapinagi', x: 10, z: 10, zone: 0 }] };
    expect(nearestOfType(S, 'anahtartapinagi')).toBeNull();
    const S2 = { G: { dim: 'overworld', body: { x: 0, z: 0 } }, known: new Map(), _anchors: [{ id: 'a', type: 'anahtartapinagi', x: 10, z: 10, zone: 0 }] };
    expect(nearestOfType(S2, 'anahtartapinagi')).toMatchObject({ id: 'a' });
  });
});
