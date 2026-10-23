/*
 * KEŞİF sim/props — OTURMA / YATMA geometrisi (saf). Davranış (propBehaviorsInterior 'sit') ve oyun sistemi (systems/propsSeat) kullanır.
 *
 *   seatPlacement(def, prop, actor?) → {x,y,z,yaw,pitch,eye,pose,spot,id}      oyuncunun AYAK konumu + bakış + göz yüksekliği (ayaktan)
 *       def.seat: {pose:'sit'|'lie', h, eye, fwd, spots[]}; spot = oyuncuya (actor.x,z) en yakın yerel x konumu.
 *   seatExits(def, prop, placement) → [{x,y,z}]       kalkış adayları (öncelik sırasıyla); sistem ilk boş olanı seçer, hiçbiri boş değilse yerinde kalkar
 *   yawOfProp(k) → oyuncu yaw'ı (prop ön yüzüne bakan: yerel +Z)       localToWorld(prop, lx, lz) → [x, z]
 * Konvansiyon: prop yaw k: yerel +Z'nin baktığı yön 0:+Z 1:+X 2:−Z 3:−X; oyuncu yaw 0 = −Z (bakış (−sin yaw, −cos yaw)).
 */
const HALF_PI = Math.PI / 2;
const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

function norm(a) {
  let y = a % (Math.PI * 2);
  if (y > Math.PI) y -= Math.PI * 2;
  if (y <= -Math.PI) y += Math.PI * 2;
  return y;
}

export function yawOfProp(k) {
  return norm((k & 3) * HALF_PI + Math.PI);
}

/** (lx, lz) yerel yatay konum → dünya [x, z] (prop çapasına göre; three rotation.y = k·π/2 ile aynı eşleme). */
export function localToWorld(prop, lx, lz) {
  const k = prop.yaw & 3;
  const c = COS[k];
  const s = SIN[k];
  return [prop.x + lx * c + lz * s, prop.z - lx * s + lz * c];
}

export function seatPlacement(def, prop, actor) {
  const seat = def && def.seat;
  if (!seat) return null;
  const spots = seat.spots && seat.spots.length > 0 ? seat.spots : [0];
  let best = spots[0];
  if (spots.length > 1 && actor && Number.isFinite(actor.x) && Number.isFinite(actor.z)) {
    let bd = Infinity;
    for (let i = 0; i < spots.length; i++) {
      const w = localToWorld(prop, spots[i], seat.fwd || 0);
      const d = (w[0] - actor.x) * (w[0] - actor.x) + (w[1] - actor.z) * (w[1] - actor.z);
      if (d < bd) {
        bd = d;
        best = spots[i];
      }
    }
  }
  const w = localToWorld(prop, best, seat.fwd || 0);
  return {
    id: prop.id,
    x: w[0],
    y: prop.y + seat.h,
    z: w[1],
    yaw: yawOfProp(prop.yaw),
    pitch: seat.pose === 'lie' ? 0.62 : 0,
    eye: seat.eye,
    pose: seat.pose,
    spot: best,
  };
}

export function seatExits(def, prop, placement) {
  const sx = def.size[0] / 2;
  const sz = def.size[2] / 2;
  const spot = placement ? placement.spot : 0;
  const fwd = def.seat && def.seat.fwd ? def.seat.fwd : 0;
  const lie = def.seat && def.seat.pose === 'lie';
  const front = [spot, sz + 0.55];
  const left = [-sx - 0.55, fwd];
  const right = [sx + 0.55, fwd];
  const back = [spot, -sz - 0.55];
  const order = lie ? [right, left, front, back] : [front, right, left, back];
  const out = [];
  for (let i = 0; i < order.length; i++) {
    const w = localToWorld(prop, order[i][0], order[i][1]);
    out.push({ x: w[0], y: prop.y, z: w[1] });
  }
  return out;
}
