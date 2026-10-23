/*
 * KEŞİF sim — yapı testleri için yardımcılar (yalnız testler içe aktarır; üretim koduna girmez).
 *
 *   makeWorldGet(seed) → { get(x,y,z), chunk(cx,cz), clear() }   decorate'lı gerçek chunk üretimi (kilitler açık)
 *   standable(get,x,y,z), walkPath(get, from, to, box) → bool     yürünebilir yol (BFS: basamak ≤1 yukarı, ≤3 aşağı)
 */
import { SOLID_LUT, LIQUID_LUT } from './blocks.js';
import { generateChunk } from './worldgen.js';
import { decorateChunk } from './structures.js';

export function makeWorldGet(seed, opts) {
  const o = opts || {};
  const cache = new Map();
  const chunk = (cx, cz) => {
    const k = cx + ',' + cz;
    let c = cache.get(k);
    if (!c) {
      c = generateChunk(seed, cx, cz, {
        decorate: o.noDecorate ? undefined : decorateChunk, openRings: o.openRings === undefined ? 15 : o.openRings, light: false,
      });
      cache.set(k, c);
    }
    return c;
  };
  return {
    chunk,
    get(x, y, z) {
      if (y < 0 || y > 367) return 0;
      return chunk(x >> 4, z >> 4).get(x & 15, y, z & 15);
    },
    clear() {
      cache.clear();
    },
    size() {
      return cache.size;
    },
  };
}

export function isPassable(id) {
  return id === 0 || (!SOLID_LUT[id] && !LIQUID_LUT[id]);
}

export function isSolidId(id) {
  return SOLID_LUT[id] === 1;
}

/** Ayakta durulabilir hücre: ayak + baş boş (sıvı değil), altı katı. */
export function standable(get, x, y, z) {
  return isPassable(get(x, y, z)) && isPassable(get(x, y + 1, z)) && isSolidId(get(x, y - 1, z));
}

/**
 * from/to {x,y,z}: yürüyüş BFS'i. box: {x0,z0,x1,z1} sınır. Hareket: 4 komşu; yukarı +1 (zıplama: üstte boşluk),
 * aşağı ≤3. Kapılar (LOCKED_DOOR, BOSS_DOOR, SEAL_BARRIER) `pass` kümesiyle geçilebilir sayılır.
 */
export function walkPath(get, from, to, box, pass) {
  const open = (id) => isPassable(id) || (pass && pass.has(id));
  const stand = (x, y, z) => open(get(x, y, z)) && open(get(x, y + 1, z)) && isSolidId(get(x, y - 1, z));
  const key = (x, y, z) => x + ',' + y + ',' + z;
  if (!stand(from.x, from.y, from.z)) return { ok: false, reason: 'başlangıç ayakta durulamaz', visited: 0 };
  const seen = new Set([key(from.x, from.y, from.z)]);
  const queue = [[from.x, from.y, from.z]];
  let head = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (head < queue.length) {
    const [x, y, z] = queue[head++];
    if (x === to.x && z === to.z && Math.abs(y - to.y) <= 0) return { ok: true, visited: seen.size };
    for (let d = 0; d < 4; d++) {
      const nx = x + dirs[d][0];
      const nz = z + dirs[d][1];
      if (box && (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1)) continue;
      for (let dy = 1; dy >= -3; dy--) {
        const ny = y + dy;
        if (dy === 1 && !open(get(x, y + 2, z))) continue;
        if (!stand(nx, ny, nz)) continue;
        const k = key(nx, ny, nz);
        if (seen.has(k)) break;
        seen.add(k);
        queue.push([nx, ny, nz]);
        break;
      }
    }
    if (seen.size > 400000) return { ok: false, reason: 'çok geniş', visited: seen.size };
  }
  return { ok: false, reason: 'ulaşılamadı', visited: seen.size };
}
