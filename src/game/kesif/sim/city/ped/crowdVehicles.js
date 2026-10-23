/*
 * KEŞİF sim/city/ped — YAYA ↔ ARAÇ FARKINDALIĞI (SAF, tahsissiz). Araç betimleyici: {x, z, vx, vz, yaw, hl, hw, kind} (kind 1 oyuncu aracı · 2 park/sergi · 5 trafik).
 *
 *   crossingConflict(c, veh, nv, T, step) → bool        geçit dikdörtgenine T sn içinde (doğrusal öngörü) araç girer ya da şu an üstünde mi
 *   pointInVehicle(x, z, r, veh, nv) → bool             nokta (yarıçap r) bir aracın gövdesinde mi (yaya araca girmez)
 *   vehicleThreat(x, z, veh, nv, out) → bool            araç yaya konumuna ≤1,6 sn içinde ulaşır mı; out {t, ex, ez (kaçış yönü, birim), d}
 * Yayalar asla araca çarpmaz: tehdit varsa kenara kaçar/zıplar; araç tarafı yumuşak çarpışma kutusu (systems/crowd.js) ve engel listesiyle yavaşlar.
 */
const MOVING = 1.2;

function rectHits(c, px, pz, vhl, vhw, yaw) {
  // geçit çerçevesi: a = yol ekseni boyunca değil, yaya YOLU boyunca (ux,uz); b = yol boyunca
  const dx = px - c.x;
  const dz = pz - c.z;
  const a = dx * c.ux + dz * c.uz;
  const b = dx * -c.uz + dz * c.ux;
  // araç yönü yol eksenine mi yaya yoluna mı daha yakın: genişlik/uzunluk payı
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const cosF = Math.abs(fx * -c.uz + fz * c.ux);
  const sinF = Math.abs(fx * c.ux + fz * c.uz);
  const padA = vhl * sinF + vhw * cosF;
  const padB = vhl * cosF + vhw * sinF;
  const halfA = (c.roadB - c.roadA) / 2 + 0.6;
  const halfB = c.hw + 0.5;
  return Math.abs(a) < halfA + padA && Math.abs(b) < halfB + padB;
}

export function crossingConflict(c, veh, nv, T, step) {
  for (let i = 0; i < nv; i++) {
    const v = veh[i];
    const sp = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
    if (rectHits(c, v.x, v.z, v.hl, v.hw, v.yaw)) return true;
    if (sp < MOVING) continue;
    // hızlı yaklaşan: ön uç öngörüsü
    const dx = v.x - c.x;
    const dz = v.z - c.z;
    if (dx * dx + dz * dz > (sp * T + 30) * (sp * T + 30)) continue;
    for (let t = step; t <= T; t += step) {
      if (rectHits(c, v.x + v.vx * t, v.z + v.vz * t, v.hl, v.hw, v.yaw)) return true;
    }
  }
  return false;
}

export function pointInVehicle(x, z, r, veh, nv) {
  for (let i = 0; i < nv; i++) {
    const v = veh[i];
    const dx = x - v.x;
    const dz = z - v.z;
    if (dx * dx + dz * dz > (v.hl + v.hw + r + 1) * (v.hl + v.hw + r + 1)) continue;
    const sy = Math.sin(v.yaw);
    const cy = Math.cos(v.yaw);
    const f = -(dx * sy + dz * cy);
    const l = dx * cy - dz * sy;
    if (Math.abs(f) < v.hl + r && Math.abs(l) < v.hw + r) return true;
  }
  return false;
}

/** Araç tehdidi: önündeki koridor (uzunluk = hız·1,6 + hl + 2,2, yarı genişlik hw + 0,95). out {t, ex, ez, d}. */
export function vehicleThreat(x, z, veh, nv, out, tie) {
  let best = 99;
  let found = false;
  for (let i = 0; i < nv; i++) {
    const v = veh[i];
    const sp = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
    if (sp < 1.6) continue;
    const dx = x - v.x;
    const dz = z - v.z;
    const reach = sp * 1.6 + v.hl + 2.2;
    if (dx * dx + dz * dz > (reach + 4) * (reach + 4)) continue;
    const fx = v.vx / sp;
    const fz = v.vz / sp;
    const fwd = dx * fx + dz * fz;
    if (fwd < -v.hl - 0.6 || fwd > reach) continue;
    const rx = -fz;
    const rz = fx;
    const lat = dx * rx + dz * rz;
    const lim = v.hw + 0.95;
    if (Math.abs(lat) > lim) continue;
    const t = Math.max(0, fwd - v.hl) / sp;
    if (t < best) {
      best = t;
      found = true;
      const sgn = Math.abs(lat) < 0.2 ? (tie < 0 ? -1 : 1) : lat >= 0 ? 1 : -1;
      out.ex = rx * sgn;
      out.ez = rz * sgn;
      out.d = Math.max(0, fwd - v.hl);
      out.lat = lat;
    }
  }
  out.t = best;
  return found;
}
