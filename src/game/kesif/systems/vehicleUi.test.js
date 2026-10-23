import { describe, expect, it } from 'vitest';
import { VEHICLE_UI_ORDER, createSystem } from './vehicleUi.js';
import { VEHICLES_ORDER } from './vehicles.js';
import { CITY_HUD_ORDER } from './cityHud.js';
import { VEHICLE_AUDIO_ORDER } from './vehicleAudio.js';
import { DIMENSION_ORDER } from './dimension.js';
import { CITY_LOCKS_ORDER } from './cityLocks.js';
import { CITY_LOOK_SYSTEM_ORDER } from '../render/city/cityLook.js';
import { resolveSystems, standardSystemFiles } from '../gameSystems.js';

function makeG(over) {
  return {
    dim: 'neon',
    world: { seed: 4242 },
    body: { x: 10, y: 64, z: -20 },
    player: { yaw: 1.25 },
    vehicles: { driven: null },
    traffic: null,
    ...over,
  };
}

describe('vehicleUi sistemi', () => {
  it('ad, sıra benzersiz (çalışan sistemlerle çakışmaz), gameSystems listesinde, onDimension kancası var', () => {
    const sys = createSystem(makeG());
    expect(sys.name).toBe('vehicleUi');
    expect(typeof sys.onDimension).toBe('function');
    const orders = [VEHICLES_ORDER, CITY_HUD_ORDER, VEHICLE_AUDIO_ORDER, DIMENSION_ORDER, CITY_LOCKS_ORDER, CITY_LOOK_SYSTEM_ORDER, 20, 22, 23, 25, 30, 40, 28, 10, 90];
    expect(orders).not.toContain(VEHICLE_UI_ORDER);
    expect(standardSystemFiles()).toContain('./systems/vehicleUi.js');
    expect(resolveSystems({ x: { createSystem } }, makeG()).length).toBe(1);
  });

  it('getDriveInfo: şehirde yürürken ve sürerken; şehir dışında null', () => {
    const G = makeG();
    const a = createSystem(G).api();
    let i = a.getDriveInfo();
    expect(i).toMatchObject({ dim: 'neon', driving: false, seed: 4242, x: 10, z: -20, yaw: 1.25, speed: 0 });
    G.vehicles = { driven: { v: { x: 3, z: 4, yaw: 0.5, vx: 3, vz: 4 } } };
    i = a.getDriveInfo();
    expect(i).toMatchObject({ driving: true, x: 3, z: 4, yaw: 0.5 });
    expect(i.speed).toBeCloseTo(5, 9);
    G.dim = 'overworld';
    expect(a.getDriveInfo()).toBeNull();
    G.dim = 'neon';
    G.world = null;
    expect(a.getDriveInfo()).toBeNull();
  });

  it('getTrafficDots: trafik sistemi yoksa boş; yarıçap süzgeci, saydam araçlar atlanır, 64 sınır, dizi yeniden kullanılır', () => {
    const G = makeG();
    const a = createSystem(G).api();
    expect(a.getTrafficDots().count).toBe(0);
    const n = 200;
    const view = {
      count: n, x: new Float32Array(n), z: new Float32Array(n), fade: new Float32Array(n).fill(1),
    };
    for (let k = 0; k < n; k++) {
      view.x[k] = 10 + k; // 0..199 m
      view.z[k] = -20;
    }
    view.fade[3] = 0.1; // saydam
    G.traffic = { view };
    const d = a.getTrafficDots(100);
    expect(d.count).toBe(64);
    expect(d.xz[0]).toBe(10);
    expect(d.xz[2]).toBe(11);
    expect(d.xz[4]).toBe(12);
    expect(d.xz[6]).toBe(14); // 3 atlandı
    const d2 = a.getTrafficDots(50);
    expect(d2).toBe(d);
    expect(d2.count).toBe(50);
    expect(a.getTrafficDots(NaN).count).toBeGreaterThan(0);
    G.dim = 'overworld';
    expect(a.getTrafficDots().count).toBe(0);
    G.dim = 'neon';
    G.traffic = { view: { count: 5, x: null, z: null } };
    expect(a.getTrafficDots().count).toBe(0);
  });

  it('rota işareti: doğrular, siler; boyut değişince kalkar; G.driveMarker görev paketinden de okunur', () => {
    const G = makeG();
    const s = createSystem(G);
    const a = s.api();
    expect(a.getDriveMarker()).toBeNull();
    expect(a.setDriveMarker({ x: 5, z: 6, label: 'Teslimat' })).toBe(true);
    expect(a.getDriveMarker()).toEqual({ x: 5, z: 6, label: 'Teslimat' });
    expect(a.setDriveMarker({ x: NaN, z: 1 })).toBe(false);
    expect(a.setDriveMarker('x')).toBe(false);
    expect(a.getDriveMarker().x).toBe(5);
    expect(a.setDriveMarker({ x: 1, z: 2, label: 'a'.repeat(99) })).toBe(true);
    expect(a.getDriveMarker().label).toHaveLength(40);
    s.onDimension();
    expect(a.getDriveMarker()).toBeNull();
    G.driveMarker = { x: 9, z: 8 };
    expect(a.getDriveMarker()).toEqual({ x: 9, z: 8 });
    expect(a.setDriveMarker(null)).toBe(true);
    expect(a.getDriveMarker()).toBeNull();
  });
});
