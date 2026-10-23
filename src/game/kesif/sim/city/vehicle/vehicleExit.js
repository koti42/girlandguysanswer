/*
 * KEŞİF sim/city/vehicle — ARAÇTAN İNİŞ NOKTASI (saf; belirlenimci). "Oyuncu araçtan HER ZAMAN inebilir": aday sırası sol kapı, sağ kapı, arka, ön, sonra halkalar;
 * ilk uygun nokta: oyuncu kutusu (0,6×1,8) hiçbir katıyla (voxel + ColliderIndex) kesişmez, altında taşıyıcı zemin var (aracın ≤ 1,5 altında / ≤ 1,2 üstünde),
 * aracın kendi gövdesinin içinde değil. Uygun nokta yoksa null (çağıran yola ışınlama yedeğini kullanır).
 *
 *   findExitSpot(world, v, opts?) → {x,y,z,yaw} | null      opts {maxR=7, ignoreId (aracın collider kimliği), colliders}
 *   playerBoxFree(world, x, y, z, cc, ignoreId) → bool      aynı denetim (testler)
 */
import { BLOCKS } from '../../blocks.js';
import { groundHeight } from './vehicleWorld.js';

const HALF_W = 0.3;
const HEIGHT = 1.8;
const EPS = 1e-6;
const _q = new Float64Array(32 * 6);

function cellBoxesFree(world, x0, y0, z0, x1, y1, z1) {
  for (let x = Math.floor(x0 + EPS); x <= Math.floor(x1 - EPS); x++) {
    for (let y = Math.floor(y0 + EPS) - 1; y <= Math.floor(y1 - EPS); y++) {
      for (let z = Math.floor(z0 + EPS); z <= Math.floor(z1 - EPS); z++) {
        const id = world.getBlock(x, y, z);
        if (id === null || id === undefined) return false; // yüklenmemiş = katı
        if (id === 0) continue;
        const b = BLOCKS[id];
        if (!b || b.liquid) continue;
        const bx = b.collision;
        for (let i = 0; i < bx.length; i++) {
          const c = bx[i];
          if (x0 < x + c[3] - EPS && x1 > x + c[0] + EPS && y0 < y + c[4] - EPS && y1 > y + c[1] + EPS && z0 < z + c[5] - EPS && z1 > z + c[2] + EPS) return false;
        }
      }
    }
  }
  return true;
}

export function playerBoxFree(world, x, y, z, cc, ignoreId) {
  const x0 = x - HALF_W;
  const x1 = x + HALF_W;
  const z0 = z - HALF_W;
  const z1 = z + HALF_W;
  const y1 = y + HEIGHT;
  if (!cellBoxesFree(world, x0, y, z0, x1, y1, z1)) return false;
  if (cc && cc.size > 0) {
    const n = cc.queryRaw(x0, y, z0, x1, y1, z1, _q, 32);
    for (let i = 0; i < n; i++) {
      if (ignoreId !== undefined && cc.ids[i] === ignoreId) continue;
      const o = i * 6;
      if (x0 < _q[o + 3] - EPS && x1 > _q[o] + EPS && y < _q[o + 4] - EPS && y1 > _q[o + 1] + EPS && z0 < _q[o + 5] - EPS && z1 > _q[o + 2] + EPS) return false;
    }
  }
  return true;
}

export function findExitSpot(world, v, opts) {
  const o = opts || {};
  const cc = o.colliders !== undefined ? o.colliders : world.colliders || null;
  const d = v.def;
  const maxR = o.maxR > 0 ? o.maxR : 7;
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  const fx = -sy;
  const fz = -cy;
  const rx = cy;
  const rz = -sy;
  const hl = d.length * 0.5 + 0.45;
  const hw = d.width * 0.5 + 0.45;
  const tryAt = (x, z) => {
    // aracın içinde mi (OBB + pay)?
    const dx = x - v.x;
    const dz = z - v.z;
    if (Math.abs(dx * fx + dz * fz) < hl && Math.abs(dx * rx + dz * rz) < hw) return null;
    const g = groundHeight(world, x, z, v.y + 1.2, 2.9, false);
    if (!(g > -Infinity) || g !== g) return null; // NaN (yüklenmemiş) ya da zemin yok
    if (g < v.y - 1.5 || g > v.y + 1.2) return null;
    if (!playerBoxFree(world, x, g + 0.002, z, cc, o.ignoreId)) return null;
    return { x, y: g + 0.002, z, yaw: v.yaw };
  };
  const side = d.width * 0.5 + 0.75;
  const end = d.length * 0.5 + 0.75;
  const base = [
    [-rx * side, -rz * side], // sol kapı
    [rx * side, rz * side], // sağ kapı
    [-fx * end, -fz * end], // arka
    [fx * end, fz * end], // ön
    [-rx * (side + 1), -rz * (side + 1)],
    [rx * (side + 1), rz * (side + 1)],
  ];
  for (let i = 0; i < base.length; i++) {
    const r = tryAt(v.x + base[i][0], v.z + base[i][1]);
    if (r) return r;
  }
  const rings = Math.ceil(maxR / 0.8);
  for (let k = 1; k <= rings; k++) {
    const rad = Math.max(hw, hl) * 0.8 + k * 0.8;
    const n = 10 + k * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.53;
      const r = tryAt(v.x + Math.cos(a) * rad, v.z + Math.sin(a) * rad);
      if (r) return r;
    }
  }
  return null;
}
