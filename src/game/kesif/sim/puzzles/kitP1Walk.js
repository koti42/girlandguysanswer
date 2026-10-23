/*
 * KEŞİF bulmaca testleri için yürüme denetimi (yalnızca testler kullanır; saf).
 * Düz zeminde (basamak/zıplama YOK) 4 yönlü BFS: hücre yürünebilir = gövde (y, y+1) boş, ayak altı (y−1) katı.
 */
import { isSolid } from '../blocks.js';

function walkable(world, x, y, z) {
  const a = world.getBlock(x, y, z);
  const b = world.getBlock(x, y + 1, z);
  const c = world.getBlock(x, y - 1, z);
  return a !== null && !isSolid(a) && !isSolid(b) && c !== null && isSolid(c);
}

/** (from → to) düz yürüyüşle ulaşılabilir mi? from/to: {x,z}; y: zemin hücresi y'si; limit: arama yarıçapı. */
export function canWalk(world, y, from, to, limit) {
  const lim = limit || 80;
  const seen = new Set([from.x + ',' + from.z]);
  const q = [[from.x, from.z]];
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    if (x === to.x && z === to.z) return true;
    const nb = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
    for (let k = 0; k < 4; k++) {
      const [nx, nz] = nb[k];
      const key = nx + ',' + nz;
      if (seen.has(key) || Math.abs(nx - from.x) > lim || Math.abs(nz - from.z) > lim) continue;
      if (!walkable(world, nx, y, nz)) continue;
      seen.add(key);
      q.push([nx, nz]);
    }
  }
  return false;
}

/** Odanın ön yaklaşımından (lz=−4) arka yaklaşımına (lz=d+3) yürünebiliyor mu? F: frame(ctx); d: iç derinlik. */
export function frontToBack(world, F, d) {
  const a = F.toWorld(0, 0, -4);
  const b = F.toWorld(0, 0, d + 3);
  return canWalk(world, a.y, { x: a.x, z: a.z }, { x: b.x, z: b.z });
}
