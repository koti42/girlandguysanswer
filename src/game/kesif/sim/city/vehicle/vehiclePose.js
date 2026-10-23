/*
 * KEŞİF sim/city/vehicle — ARAÇ POZU: boş poz arama, zemine oturtma, yola ışınlama (saf; belirlenimci).
 *
 *   settleY(world, d, x, y, z, yaw) → taşıyıcı yüzeye oturan y | null (veri yok / zemin yok)
 *   findFreePose(world, d, x, y, z, yaw, opts) → {x,y,z,yaw} | null      opts {maxR=6, ignoreId, colliders}
 *   resetToRoad(v, world, ctx) → bool       ctx.roadSnap(x,z,y) → {x,y,z,yaw} | null; yoksa son sağlam poz, yoksa en yakın boş zemin
 */
import { obbFree } from './vehicleWorld.js';
import { GP, groundPlane } from './vehicleVertical.js';
import { setPose } from './vehicleState.js';

const NO_OPTS = Object.freeze({});
const NO_CTX = Object.freeze({});

export function settleY(world, d, x, y, z, yaw) {
  groundPlane(x, y, z, yaw, d, world, y + d.step[1], 3.5, d.hover > 0);
  if (GP.unknown || GP.count < 2) return null;
  return GP.gc + (d.hover > 0 ? d.hover : 0);
}

export function findFreePose(world, d, x, y, z, yaw, opts) {
  const o = opts || NO_OPTS;
  const cc = o.colliders !== undefined ? o.colliders : world.colliders || null;
  const maxR = o.maxR > 0 ? o.maxR : 6;
  const rings = Math.ceil(maxR / 0.75);
  const tryAt = (px, pz) => {
    const sy = settleY(world, d, px, y, pz, yaw);
    if (sy === null) return null;
    if (sy < y - 4 || sy > y + 4) return null;
    if (!obbFree(world, cc, px, sy, pz, yaw, d, o.ignoreId, d.step[0])) return null;
    return {
      x: px, y: sy, z: pz, yaw,
    };
  };
  let r = tryAt(x, z);
  if (r) return r;
  for (let k = 1; k <= rings; k++) {
    const rad = k * 0.75;
    const n = 8 + k * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.37;
      r = tryAt(x + Math.cos(a) * rad, z + Math.sin(a) * rad);
      if (r) return r;
    }
  }
  return null;
}

export function resetToRoad(v, world, ctx) {
  const c = ctx || NO_CTX;
  const d = v.def;
  let target = null;
  if (typeof c.roadSnap === 'function') {
    try {
      target = c.roadSnap(v.x, v.z, v.y);
    } catch {
      target = null;
    }
  }
  let free = null;
  if (target && Number.isFinite(target.x + target.z)) {
    const ty = Number.isFinite(target.y) ? target.y : v.y;
    const yaw = Number.isFinite(target.yaw) ? target.yaw : v.yaw;
    free = findFreePose(world, d, target.x, ty, target.z, yaw, { maxR: 9, ignoreId: v.propId });
  }
  if (!free && v.good.ok) free = findFreePose(world, d, v.good.x, v.good.y, v.good.z, v.good.yaw, { maxR: 9, ignoreId: v.propId });
  if (!free && Number.isFinite(v.x + v.y + v.z + v.yaw)) free = findFreePose(world, d, v.x, v.y, v.z, v.yaw, { maxR: 9, ignoreId: v.propId });
  if (!free) return false;
  setPose(v, free.x, free.y, free.z, free.yaw);
  v.events.push({ type: 'resetRoad', x: v.x, y: v.y, z: v.z });
  return true;
}
