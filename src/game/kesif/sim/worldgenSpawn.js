/*
 * KEŞİF sim — doğuş noktası seçimi (saf, belirlenimci; yalnız tohum).
 *
 *   spawnPoint(seed)        → {x, y, z, biome}  oyuncunun başlangıç noktası: çimenli, düz, AÇIK (çukur/kuşatılmış değil)
 *   legacySpawnPoint(seed)  → {x, y, z, biome}  eski (açıklık denetimsiz) algoritma — yapı yerleşimi (kamp çapası, "spawn" diski)
 *                                               bunu kullanır; böylece mevcut seed'lerin yapı düzeni ve kayıtları DEĞİŞMEZ.
 *   evaluateSpawn(g, x, z, opts?) → {ok, openRatio, wallFrac, rise, sectors, ...}  açıklık ölçümü (testler + arama)
 *   nearestTree(seed, x, z, opts?) → {x, z, dist, species} | null   en yakın ağaç gövdesi (min..max blok aralığında)
 *   spawnYaw(seed, x, z)    → yaw (rad)   ilk bakış: en yakın ağaca (ilk görev "ağaç kes"); ağaç yoksa 0 (−Z)
 *
 * Açıklık (yarıçap 6 diski, 8 komşulu seller): ayak sütununa |Δh| ≤ 1 adımlarla ulaşılabilen yürünebilir sütun oranı ≥ minOpen;
 * diskte ayak yüksekliğine göre |Δh| ≤ 1 olan sütun oranı ≥ minFlat (basamaklı yamaç/teras reddi); ≥ 2 blok yüksek duvar sütunu oranı
 * ≤ maxWall (oyuk/çukur duvarı) ve 5–6 halkasının ortalama yükselişi ≤ maxRise (çukur reddi); ayrıca ≥ 20 blok ötesine (en çok 26)
 * yürünerek ulaşan yön dilimi (8 dilim) sayısı ≥ minSectors. Yürünemez sütun: su, ağaç gövdesi, çukur (sinkhole).
 * Arama: eski noktanın kendisi → eski noktanın çevresinde halka (≤ 24) → origin'den dışa halka sırası → gevşek eşikler → eski nokta.
 * Her adım sabit sırada taranır; sonuç yalnız tohuma bağlı.
 */
import { SEA_LEVEL, ZONES } from './constants.js';
import {
  BIOME_ID, getGen, makeCol, sampleColumn, sinkholeNear,
} from './worldgenTerrain.js';
import {
  TREE_CELL, treeCrownNear, treeInCell, treeNear,
} from './worldgenFlora.js';

export const SPAWN_OPEN = Object.freeze({
  radius: 6,
  minOpen: 0.8,
  minFlat: 0.85,
  maxWall: 0.05,
  wall: 2,
  maxRise: 0.6,
  escapeDist: 20,
  escapeMax: 26,
  sectors: 8,
  minSectors: 3,
});

const RELAXED = Object.freeze({
  ...SPAWN_OPEN, minOpen: 0.6, minFlat: 0.55, maxWall: 0.2, maxRise: 1.4, minSectors: 2,
});

const TAU = Math.PI * 2;
/** Doğuş için uygun (çimenli, açık) biyomlar. */
function isSpawnBiome(b) {
  return b === BIOME_ID.cayir || b === BIOME_ID.orman || b === BIOME_ID.cicek || b === BIOME_ID.kiraz || b === BIOME_ID.sonbahar;
}
const GRID = 2 * SPAWN_OPEN.escapeMax + 3; // BFS ızgara kenarı
const ZONE0_LIMIT = ZONES[0].rOut - 6;

/** Sütun önbelleği (arama boyunca yeniden kullanılır): yükseklik + yürünebilirlik. */
function makeCache(g) {
  const o = makeCol();
  const hs = new Map();
  const ws = new Map();
  const key = (x, z) => (x + 8192) * 16384 + (z + 8192);
  return {
    g,
    biome(x, z) {
      sampleColumn(g, x, z, o);
      return o.biome;
    },
    h(x, z) {
      const k = key(x, z);
      let v = hs.get(k);
      if (v === undefined) {
        sampleColumn(g, x, z, o);
        v = o.h;
        hs.set(k, v);
      }
      return v;
    },
    walk(x, z) {
      const k = key(x, z);
      let v = ws.get(k);
      if (v === undefined) {
        v = this.h(x, z) >= SEA_LEVEL + 1 && !sinkholeNear(g, x, z, 0) && !treeNear(g, x, z, 1.3);
        ws.set(k, v);
      }
      return v;
    },
  };
}

const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];

/** (cx,cz) çevresinde yarıçap R içinde |Δh| ≤ 1 adımlı 8 komşulu sel: ulaşılan dairesel sütun sayısı + toplam. */
function floodDisk(cache, cx, cz, R) {
  const side = 2 * R + 1;
  const seen = new Uint8Array(side * side);
  const qx = new Int16Array(side * side);
  const qz = new Int16Array(side * side);
  let head = 0;
  let tail = 0;
  let total = 0;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) total++;
  seen[R * side + R] = 1;
  qx[tail] = 0;
  qz[tail++] = 0;
  let reached = 0;
  while (head < tail) {
    const dx = qx[head];
    const dz = qz[head++];
    reached++;
    const h = cache.h(cx + dx, cz + dz);
    for (let k = 0; k < 8; k++) {
      const nx = dx + DX8[k];
      const nz = dz + DZ8[k];
      if (nx * nx + nz * nz > R * R) continue;
      const si = (nz + R) * side + (nx + R);
      if (seen[si]) continue;
      if (!cache.walk(cx + nx, cz + nz) || Math.abs(cache.h(cx + nx, cz + nz) - h) > 1) continue;
      if (k >= 4 && !(cache.walk(cx + dx + DX8[k], cz + dz) && cache.walk(cx + dx, cz + dz + DZ8[k]))) continue; // köşeden sızma yok
      seen[si] = 1;
      qx[tail] = nx;
      qz[tail++] = nz;
    }
  }
  return { reached, total };
}

/** Başlangıçtan yürünerek ≥ escapeDist uzağa ulaşılan yön dilimi sayısı (minSectors'ta erken çıkış). */
function escapeSectors(cache, cx, cz, P, stopAt) {
  const M = P.escapeMax;
  const side = GRID;
  const off = M + 1;
  const seen = new Uint8Array(side * side);
  const qx = new Int16Array(side * side);
  const qz = new Int16Array(side * side);
  let head = 0;
  let tail = 0;
  seen[off * side + off] = 1;
  qx[tail] = 0;
  qz[tail++] = 0;
  let mask = 0;
  let count = 0;
  const lim2 = M * M;
  const far2 = P.escapeDist * P.escapeDist;
  while (head < tail) {
    const dx = qx[head];
    const dz = qz[head++];
    const d2 = dx * dx + dz * dz;
    if (d2 >= far2) {
      const sec = Math.floor(((Math.atan2(dz, dx) + Math.PI) / TAU) * P.sectors) % P.sectors;
      if (!(mask & (1 << sec))) {
        mask |= 1 << sec;
        count++;
        if (stopAt && count >= stopAt) return count;
      }
    }
    const h = cache.h(cx + dx, cz + dz);
    for (let k = 0; k < 8; k++) {
      const nx = dx + DX8[k];
      const nz = dz + DZ8[k];
      if (nx * nx + nz * nz > lim2) continue;
      const si = (nz + off) * side + (nx + off);
      if (seen[si]) continue;
      if (!cache.walk(cx + nx, cz + nz) || Math.abs(cache.h(cx + nx, cz + nz) - h) > 1) continue;
      if (k >= 4 && !(cache.walk(cx + dx + DX8[k], cz + dz) && cache.walk(cx + dx, cz + dz + DZ8[k]))) continue;
      seen[si] = 1;
      qx[tail] = nx;
      qz[tail++] = nz;
    }
  }
  return count;
}

/** Disk (r ≤ radius) istatistikleri ayak yüksekliğine göre: düz oran, duvar oranı, 5–6 halkası ortalama yükselişi. */
function diskStats(cache, cx, cz, P) {
  const h0 = cache.h(cx, cz);
  let n = 0;
  let flat = 0;
  let wall = 0;
  let nr = 0;
  let rise = 0;
  const r0 = P.radius - 1;
  for (let dz = -P.radius; dz <= P.radius; dz++) {
    for (let dx = -P.radius; dx <= P.radius; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > P.radius * P.radius) continue;
      const d = cache.h(cx + dx, cz + dz) - h0;
      n++;
      if (d >= -1 && d <= 1) flat++;
      if (d >= P.wall) wall++;
      if (d2 >= r0 * r0) {
        nr++;
        rise += d;
      }
    }
  }
  return { flatFrac: flat / n, wallFrac: wall / n, rise: nr ? rise / nr : 0 };
}

/**
 * (x,z) tam sayı sütunu için açıklık ölçümü. opts: {cache?, params? (SPAWN_OPEN | RELAXED biçimi), early?: true → yön dilimleri
 * hesaplanmadan önce ucuz denetimler başarısızsa durur}.
 */
export function evaluateSpawn(g, x, z, opts) {
  const o = opts || {};
  const P = o.params || SPAWN_OPEN;
  const cache = o.cache || makeCache(g);
  const fl = floodDisk(cache, x, z, P.radius);
  const openRatio = fl.total ? fl.reached / fl.total : 0;
  const rs = diskStats(cache, x, z, P);
  const cheap = openRatio >= P.minOpen && rs.flatFrac >= P.minFlat && rs.wallFrac <= P.maxWall && rs.rise <= P.maxRise;
  const out = {
    ok: false, openRatio, flatFrac: rs.flatFrac, wallFrac: rs.wallFrac, rise: rs.rise, sectors: 0, cheap,
  };
  if (!cheap && o.early) return out;
  out.sectors = escapeSectors(cache, x, z, P, o.early ? P.minSectors : 0);
  out.ok = cheap && out.sectors >= P.minSectors;
  return out;
}

/** Eski algoritma (açıklık denetimi yok). yapı yerleşimi ve mevcut kayıtlar için DEĞİŞMEZ. */
export function legacySpawnPoint(seed) {
  const g = getGen(seed);
  const o = makeCol();
  const o2 = makeCol();
  const grassy = isSpawnBiome;
  const test = (x, z, tol, treeR) => {
    sampleColumn(g, x, z, o);
    if (o.h < SEA_LEVEL + 3 || !grassy(o.biome)) return false;
    const h0 = o.h;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        sampleColumn(g, x + dx, z + dz, o2);
        if (Math.abs(o2.h - h0) > tol || !grassy(o2.biome)) return false;
      }
    }
    if (sinkholeNear(g, x, z, 6)) return false;
    return !treeNear(g, x, z, treeR);
  };
  const found = (x, z) => {
    sampleColumn(g, x, z, o);
    return { x: x + 0.5, y: o.h + 1, z: z + 0.5, biome: o.biome };
  };
  const tries = [[1, 4], [2, 3]];
  for (let t = 0; t < tries.length; t++) {
    for (let ring = 0; ring <= 80; ring += 3) {
      const n = ring === 0 ? 1 : Math.ceil(ring * 0.8);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * ring);
        const z = Math.round(Math.sin(a) * ring);
        if (test(x, z, tries[t][0], tries[t][1])) return found(x, z);
      }
    }
  }
  for (let ring = 0; ring <= 90; ring += 2) {
    const n = ring === 0 ? 1 : Math.ceil(ring * 0.8);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * ring);
      const z = Math.round(Math.sin(a) * ring);
      sampleColumn(g, x, z, o);
      if (o.h >= SEA_LEVEL + 2 && o.h < 100) return found(x, z);
    }
  }
  return found(0, 0);
}

/**
 * Başlangıç Vadisi'nde güvenli, çimenli, düz VE açık doğuş noktası: {x, y, z, biome}
 * x,z blok merkezi (n + 0.5), y = ayakların durduğu yükseklik (zemin + 1).
 */
export function spawnPoint(seed) {
  const g = getGen(seed);
  const legacy = legacySpawnPoint(seed);
  const cache = makeCache(g);
  const o = makeCol();
  const grassy = isSpawnBiome;
  const inZone = (x, z) => x * x + z * z <= ZONE0_LIMIT * ZONE0_LIMIT;
  // temel: eski düzlük/ağaç/çukur denetimi (aynı eşikler)
  const base = (x, z, tol, treeR) => {
    if (!inZone(x, z)) return false;
    const h0 = cache.h(x, z);
    if (h0 < SEA_LEVEL + 3 || !grassy(cache.biome(x, z))) return false;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(cache.h(x + dx, z + dz) - h0) > tol || !grassy(cache.biome(x + dx, z + dz))) return false;
      }
    }
    if (sinkholeNear(g, x, z, 6)) return false;
    return !treeNear(g, x, z, treeR) && !treeCrownNear(g, x, z);
  };
  const result = (x, z) => {
    sampleColumn(g, x, z, o);
    return { x: x + 0.5, y: o.h + 1, z: z + 0.5, biome: o.biome };
  };
  const tries = [[1, 4], [2, 3]];
  const accept = (x, z, P, t) => base(x, z, tries[t][0], tries[t][1]) && evaluateSpawn(g, x, z, { cache, params: P, early: true }).ok;
  const lx = Math.floor(legacy.x);
  const lz = Math.floor(legacy.z);
  // eski noktanın çevresinde halkalar (kamp çapası eski noktaya bağlı: kampa yakın kalsın), sonra origin'den dışa halkalar
  const local = (P, maxRing) => {
    for (let t = 0; t < tries.length; t++) {
      if (accept(lx, lz, P, t)) return result(lx, lz);
      for (let ring = 2; ring <= maxRing; ring += 2) {
        const n = Math.ceil(ring * 1.2);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU;
          const x = lx + Math.round(Math.cos(a) * ring);
          const z = lz + Math.round(Math.sin(a) * ring);
          if (accept(x, z, P, t)) return result(x, z);
        }
      }
    }
    return null;
  };
  const global = (P) => {
    for (let t = 0; t < tries.length; t++) {
      for (let ring = 0; ring <= 80; ring += 3) {
        const n = ring === 0 ? 1 : Math.ceil(ring * 0.8);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU;
          const x = Math.round(Math.cos(a) * ring);
          const z = Math.round(Math.sin(a) * ring);
          if (accept(x, z, P, t)) return result(x, z);
        }
      }
    }
    return null;
  };
  return local(SPAWN_OPEN, 24) || local(SPAWN_OPEN, 40) || local(RELAXED, 40) || global(SPAWN_OPEN) || global(RELAXED) || legacy;
}

/**
 * (x,z) çevresinde minDist ≤ uzaklık ≤ maxDist aralığındaki en yakın ağaç gövdesi (eşitlikte küçük z, sonra küçük x).
 * Çok yakın ağaç (yüzüne bakmak) ve çok uzak ağaç elenir.
 */
export function nearestTree(seed, x, z, opts) {
  const o = opts || {};
  const minD = o.minDist > 0 ? o.minDist : 5;
  const maxD = o.maxDist > minD ? o.maxDist : 36;
  const g = getGen(seed);
  const a = Math.floor((x - maxD) / TREE_CELL);
  const b = Math.floor((x + maxD) / TREE_CELL);
  const c = Math.floor((z - maxD) / TREE_CELL);
  const d = Math.floor((z + maxD) / TREE_CELL);
  const t = {
    x: 0, z: 0, y: 0, species: 0, hash: 0, biome: 0,
  };
  let best = null;
  for (let cz = c; cz <= d; cz++) {
    for (let cx = a; cx <= b; cx++) {
      if (!treeInCell(g, cx, cz, t)) continue;
      const dist = Math.hypot(t.x - x, t.z - z);
      if (dist < minD || dist > maxD) continue;
      if (!best || dist < best.dist - 1e-9 || (Math.abs(dist - best.dist) <= 1e-9 && (t.z < best.z || (t.z === best.z && t.x < best.x)))) {
        best = {
          x: t.x, z: t.z, dist, species: t.species,
        };
      }
    }
  }
  return best;
}

/** Bakış yönü (yaw 0 = −Z, + sola): oyuncunun ilk karesi en yakın ağaca baksın; ağaç yoksa 0. 3 ondalık. */
export function spawnYaw(seed, x, z) {
  const t = nearestTree(seed, x, z);
  if (!t) return 0;
  const dx = t.x + 0.5 - x;
  const dz = t.z + 0.5 - z;
  return Math.round(Math.atan2(-dx, -dz) * 1000) / 1000;
}
