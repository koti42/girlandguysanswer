import { describe, expect, it } from 'vitest';
import { B, isSolid } from './blocks.js';
import { SEA_LEVEL, ZONES } from './constants.js';
import { generateChunk, heightAt } from './worldgen.js';
import {
  SPAWN_OPEN, evaluateSpawn, legacySpawnPoint, nearestTree, spawnPoint, spawnYaw,
} from './worldgenSpawn.js';
import { getGen, sinkholeNear } from './worldgenTerrain.js';
import { treeNear } from './worldgenFlora.js';
import { clearLayoutCache, getState } from './structuresLayout.js';
import { resolveSeed } from '../gameWorld.js';

/** Sentetik arazi: h(x,z) fonksiyonu → evaluateSpawn önbelleği (su = h < SEA_LEVEL + 1). */
function fake(hf, blocked) {
  return {
    h: (x, z) => hf(x, z),
    walk: (x, z) => hf(x, z) >= SEA_LEVEL + 1 && !(blocked && blocked(x, z)),
    biome: () => 0,
  };
}
const GROUND = SEA_LEVEL + 10;
const evalAt = (cache, x, z, params) => evaluateSpawn(null, x, z, { cache, params });

describe('evaluateSpawn (sentetik arazi)', () => {
  it('düz ova açıktır', () => {
    const r = evalAt(fake(() => GROUND), 0, 0);
    expect(r.ok).toBe(true);
    expect(r.openRatio).toBe(1);
    expect(r.flatFrac).toBe(1);
    expect(r.wallFrac).toBe(0);
    expect(r.sectors).toBe(SPAWN_OPEN.sectors);
  });

  it('1 derinlikte çukur: çevresi 2+ yüksek duvar → reddedilir', () => {
    // merkezde yarıçap 3 çukur, etrafı 2 blok yüksek halka (4..6)
    const hf = (x, z) => {
      const d = Math.hypot(x, z);
      return d <= 3.5 ? GROUND : GROUND + (d <= 6.5 ? 2 : 0);
    };
    const r = evalAt(fake(hf), 0, 0);
    expect(r.ok).toBe(false);
    expect(r.wallFrac).toBeGreaterThan(SPAWN_OPEN.maxWall);
  });

  it('2 yüksek duvarlı kuşatılmış oyuk: tek çıkış yönü → reddedilir (yön dilimi < 3)', () => {
    // her yer 3 yüksek duvar (r ≥ 7) ama +x yönünde 3 genişliğinde koridor
    const hf = (x, z) => {
      const d = Math.hypot(x, z);
      if (d < 7) return GROUND;
      return Math.abs(z) <= 1 && x > 0 ? GROUND : GROUND + 3;
    };
    const r = evalAt(fake(hf), 0, 0);
    expect(r.ok).toBe(false);
    expect(r.sectors).toBeLessThan(SPAWN_OPEN.minSectors);
  });

  it('düz ama yönlerin çoğu su ile kapalı: yürünerek ≥ 20 blok uzağa ulaşan yön azdır → reddedilir', () => {
    const hf = (x, z) => (Math.hypot(x, z) >= 8 && !(x > 0 && Math.abs(z) <= 4) ? SEA_LEVEL - 3 : GROUND);
    const r = evalAt(fake(hf), 0, 0);
    expect(r.ok).toBe(false);
    expect(r.sectors).toBeLessThan(SPAWN_OPEN.minSectors);
  });

  it('basamaklı teras (her 2 sütunda +1): düz oran düşük → reddedilir', () => {
    const stairs = (x) => GROUND + Math.floor(Math.abs(x) / 2);
    const r = evalAt(fake(stairs), 0, 0);
    expect(r.flatFrac).toBeLessThan(SPAWN_OPEN.minFlat);
    expect(r.ok).toBe(false);
  });

  it('ağaç gövdeleriyle çevrili alan: açık oran düşük → reddedilir', () => {
    const blocked = (x, z) => {
      const d = Math.hypot(x, z);
      return d >= 3 && d <= 4.2;
    };
    const r = evalAt(fake(() => GROUND, blocked), 0, 0);
    expect(r.ok).toBe(false);
    expect(r.openRatio).toBeLessThan(SPAWN_OPEN.minOpen);
  });

  it('hafif eğimli açık arazi kabul edilir (|Δh| ≤ 1 her adımda)', () => {
    const r = evalAt(fake((x) => GROUND + (x > 3 ? 1 : 0)), 0, 0);
    expect(r.ok).toBe(true);
  });
});

describe('spawnPoint — 200+ tohum', () => {
  const seeds = [];
  for (let i = 0; i < 220; i++) seeds.push(i * 7919 + 13);
  const hello = resolveSeed('hello').seed;
  seeds.push(hello);

  it('belirlenimci, vadi içinde, su/ağaç/çukur yok, çimenli, açık (≥ %98 sıkı eşik, hepsi gevşek)', () => {
    let strict = 0;
    seeds.forEach((seed) => {
      const sp = spawnPoint(seed);
      expect(sp, 'seed ' + seed).toEqual(spawnPoint(seed));
      expect(sp.x - Math.floor(sp.x)).toBe(0.5);
      expect(sp.z - Math.floor(sp.z)).toBe(0.5);
      expect(Math.hypot(sp.x, sp.z), 'seed ' + seed).toBeLessThanOrEqual(ZONES[0].rOut - 6);
      const bx = Math.floor(sp.x);
      const bz = Math.floor(sp.z);
      const g = getGen(seed);
      expect(sp.y).toBe(heightAt(seed, bx, bz) + 1);
      expect(sp.y, 'seed ' + seed).toBeGreaterThan(SEA_LEVEL + 3); // su yok
      expect(treeNear(g, bx, bz, 2), 'ağaç seed ' + seed).toBe(false);
      expect(sinkholeNear(g, bx, bz, 3), 'çukur seed ' + seed).toBe(false);
      const e = evaluateSpawn(g, bx, bz);
      if (e.ok) strict++;
      // gevşek taban: ayak sütununun çevresi yürünebilir ve en az 2 yöne açık
      expect(e.openRatio, 'seed ' + seed).toBeGreaterThanOrEqual(0.6);
      expect(e.sectors, 'seed ' + seed).toBeGreaterThanOrEqual(2);
    });
    expect(strict / seeds.length).toBeGreaterThanOrEqual(0.98);
  }, 120000);

  it('eski noktadan fazla uzaklaşmaz (kamp yakın kalır): medyan ≤ 2, en çok 45 blok', () => {
    const ds = seeds.map((s) => {
      const a = spawnPoint(s);
      const b = legacySpawnPoint(s);
      return Math.hypot(a.x - b.x, a.z - b.z);
    }).sort((p, q) => p - q);
    expect(ds[ds.length >> 1]).toBeLessThanOrEqual(2);
    expect(ds[ds.length - 1]).toBeLessThanOrEqual(45);
  });

  it('gerçek bloklar: ayak altı çimen, üstü boş, ≥ 3 kalın kabuk, çevrede mağara ağzı yok (60 tohum)', () => {
    seeds.slice(0, 60).forEach((seed) => {
      const sp = spawnPoint(seed);
      const bx = Math.floor(sp.x);
      const bz = Math.floor(sp.z);
      const c = generateChunk(seed, Math.floor(bx / 16), Math.floor(bz / 16), { light: false });
      const lx = bx & 15;
      const lz = bz & 15;
      expect([B.GRASS, B.GRASS_SNOW]).toContain(c.get(lx, sp.y - 1, lz));
      for (let k = 0; k < 3; k++) expect(isSolid(c.get(lx, sp.y + k, lz)), 'üst seed ' + seed).toBe(false);
      for (let k = 1; k <= 3; k++) expect(isSolid(c.get(lx, sp.y - k, lz)), 'mağara seed ' + seed).toBe(true); // ≥ 3 kalın kabuk
      // çevrede mağara/çukur ağzı yok: yarıçap 3'te doğal yüzey bozulmamış
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const x = bx + dx;
          const z = bz + dz;
          const cc = generateChunk(seed, Math.floor(x / 16), Math.floor(z / 16), { light: false });
          expect(isSolid(cc.get(x & 15, heightAt(seed, x, z), z & 15)), 'yüzey seed ' + seed).toBe(true);
        }
      }
    });
  }, 120000);

  it('hello tohumu: yeni nokta sıkı açıklık eşiğini geçer ve eski noktaya yakındır', () => {
    expect(hello).toBe(3359751142);
    const g = getGen(hello);
    const sp = spawnPoint(hello);
    const e = evaluateSpawn(g, Math.floor(sp.x), Math.floor(sp.z));
    expect(e.ok).toBe(true);
    expect(e.wallFrac).toBeLessThanOrEqual(SPAWN_OPEN.maxWall);
    expect(e.flatFrac).toBeGreaterThanOrEqual(SPAWN_OPEN.minFlat);
    expect(e.sectors).toBe(SPAWN_OPEN.sectors);
    const old = legacySpawnPoint(hello);
    // (derin dünya arazisinde eski algoritmanın noktası da geçebilir; yeni nokta eskiye yakın kalmalı)
    expect(Math.hypot(sp.x - old.x, sp.z - old.z)).toBeLessThan(30);
  });
});

describe('legacySpawnPoint ve yapı düzeni (mevcut kayıtlar bozulmaz)', () => {
  // legacySpawnPoint çıktıları (biyom genişletmesi arazisiyle yeniden kaydedildi: hücre biyomları; algoritma değişmedi)
  const OLD = {
    1: [0.5, 55, 0.5, 0],
    2: [0.5, 58, 0.5, 0],
    7: [0.5, 54, 0.5, 0],
    42: [0.5, 57, 0.5, 0],
    2024: [0.5, 57, 0.5, 0],
    12345: [0.5, 52, 0.5, 0],
    100001: [0.5, 56, 0.5, 0],
    555555: [0.5, 55, 0.5, 0],
    987654321: [0.5, 54, 0.5, 0],
    3359751142: [0.5, 58, 0.5, 0],
  };

  it('legacySpawnPoint eski algoritmayla birebir aynı', () => {
    Object.keys(OLD).forEach((k) => {
      const p = legacySpawnPoint(Number(k));
      expect([p.x, p.y, p.z, p.biome], 'seed ' + k).toEqual(OLD[k]);
    });
  });

  it('yapı yerleşimi (spawn diski, kamp çapası) eski doğuş noktasına bağlı kalır', () => {
    Object.keys(OLD).slice(0, 5).forEach((k) => {
      clearLayoutCache();
      const S = getState(Number(k));
      expect(S.spawn, 'seed ' + k).toEqual({ x: Math.floor(OLD[k][0]), z: Math.floor(OLD[k][2]) });
    });
    clearLayoutCache();
  });
});

describe('spawnYaw (ilk bakış yönü)', () => {
  const seeds = [];
  for (let i = 0; i < 80; i++) seeds.push(i * 7919 + 13);

  it('belirlenimci, (-π, π] aralığında ve ağaç yoksa 0', () => {
    seeds.forEach((seed) => {
      const sp = spawnPoint(seed);
      const y = spawnYaw(seed, sp.x, sp.z);
      expect(y).toBe(spawnYaw(seed, sp.x, sp.z));
      expect(y).toBeGreaterThan(-Math.PI - 1e-3);
      expect(y).toBeLessThanOrEqual(Math.PI + 1e-3);
      if (!nearestTree(seed, sp.x, sp.z)) expect(y).toBe(0);
    });
  });

  it('ağaç varsa bakış vektörü (−sin yaw, −cos yaw) en yakın ağaca çevrilir (< 0,02 rad)', () => {
    let withTree = 0;
    seeds.forEach((seed) => {
      const sp = spawnPoint(seed);
      const t = nearestTree(seed, sp.x, sp.z);
      if (!t) return;
      withTree++;
      expect(t.dist).toBeGreaterThanOrEqual(5);
      expect(t.dist).toBeLessThanOrEqual(36);
      const y = spawnYaw(seed, sp.x, sp.z);
      const fx = -Math.sin(y);
      const fz = -Math.cos(y);
      const dx = t.x + 0.5 - sp.x;
      const dz = t.z + 0.5 - sp.z;
      const l = Math.hypot(dx, dz);
      const dot = (fx * dx + fz * dz) / l;
      expect(Math.acos(Math.min(1, dot)), 'seed ' + seed).toBeLessThan(0.02);
    });
    expect(withTree).toBeGreaterThan(50); // çoğu başlangıçta 36 blok içinde ağaç var
  });

  it('hello tohumu bir ağaca bakar', () => {
    const seed = resolveSeed('hello').seed;
    const sp = spawnPoint(seed);
    const t = nearestTree(seed, sp.x, sp.z);
    expect(t).not.toBeNull();
    expect(spawnYaw(seed, sp.x, sp.z)).not.toBe(0);
  });
});
