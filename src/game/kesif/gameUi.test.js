import { describe, expect, it } from 'vitest';
import { uiForAction, nextCameraMode } from './gameUi.js';
import { weatherName, weatherLabel, ambientParticlesFor, ambientAudioFor } from './gameEnv.js';
import { fitSize } from './gameApi.js';
import { timeLabel } from './gameHud.js';
import {
  physicsInputFrom, applyLook, clampBodyToWorld, CEILING_Y,
} from './gamePlayer.js';
import { resolveSystems } from './gameSystems.js';

describe('uiForAction', () => {
  it('Esc: oyun → duraklat, panel/menü → kapat; ölüyken yok sayılır', () => {
    expect(uiForAction('pause', 'macera', 'none', false)).toBe('pause');
    expect(uiForAction('pause', 'macera', 'pause', false)).toBe('none');
    expect(uiForAction('pause', 'macera', 'inventory', false)).toBe('none');
    expect(uiForAction('pause', 'macera', 'dead', true)).toBeUndefined();
  });
  it('envanter: macera → inventory, insa → build paleti, harita → yok; açıkken kapatır', () => {
    expect(uiForAction('inventory', 'macera', 'none', false)).toBe('inventory');
    expect(uiForAction('inventory', 'insa', 'none', false)).toBe('build');
    expect(uiForAction('inventory', 'harita', 'none', false)).toBeUndefined();
    expect(uiForAction('inventory', 'macera', 'inventory', false)).toBe('none');
    expect(uiForAction('inventory', 'insa', 'build', false)).toBe('none');
    expect(uiForAction('inventory', 'macera', 'pause', false)).toBeUndefined();
  });
  it('üretim/harita/günlük yalnız macerada; başka panel açıkken açılmaz', () => {
    expect(uiForAction('craft', 'macera', 'none', false)).toBe('crafting');
    expect(uiForAction('craft', 'macera', 'crafting', false)).toBe('none');
    expect(uiForAction('craft', 'insa', 'none', false)).toBeUndefined();
    expect(uiForAction('map', 'macera', 'none', false)).toBe('map');
    expect(uiForAction('map', 'harita', 'none', false)).toBeUndefined();
    expect(uiForAction('journal', 'macera', 'inventory', false)).toBeUndefined();
    expect(uiForAction('bilinmeyen', 'macera', 'none', false)).toBeUndefined();
  });
  it('envanter ve üretim tek çalışma alanının sekmeleri: R/E aralarında geçiş yapar', () => {
    expect(uiForAction('craft', 'macera', 'inventory', false)).toBe('crafting');
    expect(uiForAction('inventory', 'macera', 'crafting', false)).toBe('inventory');
    expect(uiForAction('craft', 'macera', 'crafting', false)).toBe('none');
    expect(uiForAction('inventory', 'macera', 'inventory', false)).toBe('none');
    // inşa paletinde üret yok; harita modunda hiçbiri
    expect(uiForAction('craft', 'insa', 'build', false)).toBeUndefined();
    expect(uiForAction('craft', 'harita', 'inventory', false)).toBeUndefined();
    // ölüyken değişmez
    expect(uiForAction('craft', 'macera', 'inventory', true)).toBeUndefined();
    // diğer panellerden (sandık, harita) üretime geçilmez
    expect(uiForAction('craft', 'macera', 'chest', false)).toBeUndefined();
    expect(uiForAction('craft', 'macera', 'map', false)).toBeUndefined();
  });
  it('kamera modu döngüsü fp → tp → tpf → fp', () => {
    expect(nextCameraMode('fp')).toBe('tp');
    expect(nextCameraMode('tp')).toBe('tpf');
    expect(nextCameraMode('tpf')).toBe('fp');
    expect(nextCameraMode('x')).toBe('fp');
  });
});

describe('çevre yardımcıları', () => {
  it('weatherName/weatherLabel', () => {
    expect(weatherName(null)).toBe('clear');
    expect(weatherName({ intensity: 0.1, renderKind: 'rain' })).toBe('clear');
    expect(weatherName({ intensity: 0.5, renderKind: 'rain' })).toBe('rain');
    expect(weatherName({ intensity: 0.9, renderKind: 'rain' })).toBe('storm');
    expect(weatherName({ intensity: 0.5, renderKind: 'snow' })).toBe('snow');
    expect(weatherLabel({ intensity: 0.5, renderKind: 'snow' })).toBe('kar');
    expect(weatherLabel({ intensity: 0.5, renderKind: 'rain' })).toBe('yağmur');
    expect(weatherLabel(null)).toBe('');
  });
  const base = {
    zone: 0, biomeKey: 'orman', underground: false, night: true, weather: 'clear', water: 0, lava: 0, underwater: false,
  };
  it('parçacık ortamı: gece ormanda ateş böceği, yağmurda yok, yeraltında toz/spor', () => {
    expect(ambientParticlesFor(base).fireflies).toBeGreaterThan(0.4);
    expect(ambientParticlesFor({ ...base, weather: 'rain' }).fireflies).toBe(0);
    expect(ambientParticlesFor({ ...base, night: false }).pollen).toBeGreaterThan(0);
    const cave = ambientParticlesFor({ ...base, underground: true });
    expect(cave.dust).toBeGreaterThanOrEqual(0.5);
    expect(cave.fireflies).toBe(0);
    expect(ambientParticlesFor({ ...base, zone: 4 }).embers).toBeGreaterThan(0);
    Object.values(ambientParticlesFor(base)).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
  it('ses ortamı girdisi audio.setAmbient alanlarını taşır', () => {
    const a = ambientAudioFor({ ...base, combat: 0.5 });
    expect(a).toMatchObject({ zone: 0, biome: 'orman', underground: false, night: true, weather: 'clear', combat: 0.5 });
  });
});

describe('küçük saf yardımcılar', () => {
  it('fitSize 16:9 ve alt sınır', () => {
    expect(fitSize(1920, 1080, 320)).toEqual({ w: 320, h: 180 });
    expect(fitSize(100, 56, 320)).toEqual({ w: 100, h: 56 });
    expect(fitSize(4, 4, 320).w).toBeGreaterThanOrEqual(16);
  });
  it('timeLabel faz adı + saat', () => {
    expect(timeLabel(0.25)).toBe('gündüz 12:00');
    expect(timeLabel(0.75)).toBe('gece 00:00');
    expect(timeLabel(0.5)).toBe('gün batımı 18:00');
    expect(timeLabel(0.0)).toBe('şafak 06:00');
  });
  it('physicsInputFrom alanları eşler; applyLook yaw/pitch kuralları', () => {
    const out = {};
    physicsInputFrom({
      moveX: 1, moveZ: -1, jump: true, jumpPressed: true, sprint: true, crouch: false,
    }, out, 1.5);
    expect(out).toMatchObject({ moveX: 1, moveZ: -1, yaw: 1.5, jump: true, jumpPressed: true, sprint: true, crouch: false });
    const p = { yaw: 0, pitch: 0 };
    applyLook(p, 0.5, 0.2); // sağa dön → yaw azalır; yukarı bak → pitch artar
    expect(p.yaw).toBeCloseTo(-0.5, 6);
    expect(p.pitch).toBeCloseTo(0.2, 6);
    applyLook(p, 0, 10);
    expect(p.pitch).toBeLessThan(Math.PI / 2);
    applyLook(p, 0, -20);
    expect(p.pitch).toBeGreaterThan(-Math.PI / 2);
    p.yaw = 100;
    applyLook(p, 0, 0);
    expect(Math.abs(p.yaw)).toBeLessThan(Math.PI * 4);
  });
});

describe('resolveSystems', () => {
  it('createSystem / createSystems / default / system biçimlerini çözer, diziyi düzleştirir', () => {
    const G = { id: 1 };
    const out = resolveSystems({
      './systems/blocks.js': { createSystem: (g) => ({ name: 'blocks', g }) },
      './systems/content.js': { createSystems: () => [{ name: 'c1' }, { name: 'c2' }] },
      './systems/mobs.js': { default: (g) => ({ name: 'mobs', g }) },
      './systems/session.js': { system: { name: 'session' } },
      './systems/x.js': {},
    }, G);
    expect(out.map((s) => s.name)).toEqual(['blocks', 'c1', 'c2', 'mobs', 'session']);
    expect(out[0].g).toBe(G);
    expect(out[3].g).toBe(G);
  });
  it('boş/null girdi güvenli', () => {
    expect(resolveSystems({}, {})).toEqual([]);
    expect(resolveSystems(null, {})).toEqual([]);
    expect(resolveSystems({ a: null }, {})).toEqual([]);
  });
});

describe('clampBodyToWorld', () => {
  const bounds = {
    minCx: 0, maxCx: 7, minCz: 0, maxCz: 7,
  };
  const mk = (o) => Object.assign({
    w: 0.6, x: 64, y: 64, z: 64, vx: 0, vy: 0, vz: 0,
  }, o);
  it('sınır içinde dokunmaz', () => {
    const b = mk({});
    expect(clampBodyToWorld(b, bounds)).toBe(false);
    expect(b.x).toBe(64);
  });
  it('dışarı çıkanı içeri alır ve o eksenin hızını sıfırlar; öbür eksen korunur', () => {
    const b = mk({ x: -5, vx: -3, vz: 2 });
    expect(clampBodyToWorld(b, bounds)).toBe(true);
    expect(b.x).toBeGreaterThan(0.29);
    expect(b.x).toBeLessThan(0.32);
    expect(b.vx).toBe(0);
    expect(b.vz).toBe(2);
    const c = mk({ z: 400, vz: 5 });
    clampBodyToWorld(c, bounds);
    expect(c.z).toBeLessThan(128);
    expect(c.z).toBeGreaterThan(127.6);
    expect(c.vz).toBe(0);
  });
  it('sınırsız dünyada yalnız tavan uygulanır', () => {
    const b = mk({ x: 9999, y: CEILING_Y + 50, vy: 8 });
    expect(clampBodyToWorld(b, null)).toBe(true);
    expect(b.x).toBe(9999);
    expect(b.y).toBe(CEILING_Y);
    expect(b.vy).toBe(0);
  });
});
