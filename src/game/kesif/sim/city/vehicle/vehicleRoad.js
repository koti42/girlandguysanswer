/*
 * KEŞİF sim/city/vehicle — YOLA ışınlama yardımcısı (saf): roadNet'in en yakın merkez çizgisinden sağ şerit konumu + yol yönü.
 *
 *   roadSnapFor(seed) → (x, z, y, yawHint) → {x, y, z, yaw}      fonksiyon tohum başına önbelleklenir (roadNet önbelleklidir)
 * Yön: yaw 0 = −Z (ileri = (−sin yaw, −cos yaw)); yol iki yönlüdür → ipucu yaw'a yakın olan yön seçilir. Konum merkez çizgisinin SAĞ şeridi (3,4 m şerit).
 */
import { roadNet, LANE_W } from '../roadNet.js';

const cache = new Map();

function segmentDir(pts, x, z) {
  let best = 0;
  let bd = Infinity;
  let dx0 = 0;
  let dz0 = -1;
  for (let k = 3; k < pts.length; k += 3) {
    const ax = pts[k - 3];
    const az = pts[k - 1];
    const bx = pts[k];
    const bz = pts[k + 2];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    if (l2 <= 0) continue;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < bd - 1e-9) {
      bd = d;
      best = k;
      dx0 = dx;
      dz0 = dz;
    }
  }
  void best;
  const l = Math.sqrt(dx0 * dx0 + dz0 * dz0) || 1;
  return { dx: dx0 / l, dz: dz0 / l };
}

export function roadSnapFor(seed) {
  const key = seed | 0;
  const hit = cache.get(key);
  if (hit) return hit;
  const net = roadNet(seed);
  const fn = (x, z, y, yawHint) => {
    let n = net.nearest(x, z);
    if (!n) return null;
    if (Number.isFinite(y) && Math.abs(n.y - y) > 4) {
      // en yakın merkez çizgisi başka katta (ör. Meydan tüneli: 56, oyuncu üstte 64): aynı kattaki en yakın yol noktasını ara
      let best = null;
      let bd = Infinity;
      for (let r = 12; r <= 96 && !best; r += 12) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const c = net.nearest(x + Math.cos(a) * r, z + Math.sin(a) * r);
          if (!c || Math.abs(c.y - y) > 4) continue;
          const d2 = (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z);
          if (d2 < bd) {
            bd = d2;
            best = c;
          }
        }
      }
      if (best) n = best;
    }
    const e = net.edges[n.edge];
    const d = segmentDir(e.pts, n.x, n.z);
    let yaw = Math.atan2(-d.dx, -d.dz);
    if (Number.isFinite(yawHint)) {
      const diff = Math.atan2(Math.sin(yaw - yawHint), Math.cos(yaw - yawHint));
      if (Math.abs(diff) > Math.PI / 2) yaw += Math.PI;
    }
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const off = LANE_W * 0.5;
    return {
      x: n.x + rx * off, y: Number.isFinite(n.y) ? n.y : y, z: n.z + rz * off, yaw, edge: n.edge,
    };
  };
  cache.set(key, fn);
  return fn;
}
