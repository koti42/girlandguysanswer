/*
 * KEŞİF sim — teknoloji testleri için taklit dünya ve yardımcılar (yalnız testler kullanır).
 *
 *   makeWorld({yMin, yMax, floorY, loaded}) → {getBlock, setBlock, set, fill, onChange(cb), blocks, ensureSectionsNear}
 *     floorY: y ≤ floorY taş (varsayılan 59), floorY altı `bedrockY` (varsayılan 39) ve altı ana kaya. loaded(x,y,z) false → null.
 *   place(world, tech, x,y,z, id) → bloğu koyar ve tech.onBlockPlaced çağırır
 *   run(tech, world, seconds, ctx?, step?) → tüm olaylar (kopya)
 */
import { B } from './blocks.js';
import { TechState } from './techState.js';

export function makeWorld(o) {
  const opts = o || {};
  const yMin = opts.yMin !== undefined ? opts.yMin : 0;
  const yMax = opts.yMax !== undefined ? opts.yMax : 127;
  const floorY = opts.floorY !== undefined ? opts.floorY : 59;
  const bedrockY = opts.bedrockY !== undefined ? opts.bedrockY : -100000;
  const blocks = new Map();
  const listeners = [];
  const w = {
    yMin,
    yMax,
    blocks,
    loaded: opts.loaded || null,
    getBlock(x, y, z) {
      if (w.loaded && !w.loaded(x, y, z)) return null;
      const k = x + ',' + y + ',' + z;
      if (blocks.has(k)) return blocks.get(k);
      if (y < yMin) return B.BEDROCK;
      if (y > yMax) return 0;
      if (y <= bedrockY) return B.BEDROCK;
      if (y <= floorY) return B.STONE;
      return 0;
    },
    setBlock(x, y, z, id) {
      if (y < yMin || y > yMax) return false;
      const old = w.getBlock(x, y, z);
      if (old === null) return false;
      if (old === id) return false;
      blocks.set(x + ',' + y + ',' + z, id);
      listeners.forEach((cb) => cb({
        type: 'blockChange', x, y, z, id, newId: id, oldId: old,
      }));
      return true;
    },
    /** olay yaymadan koy. */
    set(x, y, z, id) {
      blocks.set(x + ',' + y + ',' + z, id);
    },
    fill(x0, y0, z0, x1, y1, z1, id) {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w.set(x, y, z, id);
    },
    onChange(cb) {
      listeners.push(cb);
    },
  };
  return w;
}

/** Bloğu koyar (olaysız) ve makine kaydını açar. */
export function place(world, tech, x, y, z, id) {
  world.set(x, y, z, id);
  tech.onBlockPlaced(x, y, z, id);
}

/** seconds sn'yi step'lik tick'lerle çalıştırır; tüm olayların kopyasını döner. */
export function run(tech, world, seconds, ctx, step) {
  const dt = step || 0.25;
  const c = Object.assign({ world, daylight: 1 }, ctx || {});
  const all = [];
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    const ev = tech.tick(dt, c);
    for (let k = 0; k < ev.length; k++) all.push(ev[k]);
  }
  return all;
}

export function newTech(seed) {
  return new TechState({ seed: seed === undefined ? 12345 : seed });
}
