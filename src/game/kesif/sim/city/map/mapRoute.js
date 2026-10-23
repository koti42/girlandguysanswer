/*
 * KEŞİF sim/city/map — HARİTA ROTASI (photo_map). SAF, es2020. Oyuncudan seçili yere araç yol ağı üzerinden (roadNet) en kısa rota çizgisi.
 * Yalnız ÇİZİM içindir (yol tarifi); hedef bulunmuş bir yer olmalıdır (çağıran sağlar). Yeraltı hedefleri (y < 56) için düz çizgi döner.
 *
 *   routePolyline(seed, from, to, maxPts?) → {pts:[[x,z]…], length, straight} | null
 *      from/to {x,y?,z}; pts ilk = from, son = to; rota çizgisi sokak düğümlerinden geçer; en çok maxPts (64) nokta.
 */
import { roadNet } from '../cityPlan.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

function lengthOf(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

export function routePolyline(seed, from, to, maxPts) {
  if (!from || !to || !num(from.x) || !num(from.z) || !num(to.x) || !num(to.z)) return null;
  const cap = maxPts > 4 ? Math.floor(maxPts) : 64;
  const a = [from.x, from.z];
  const b = [to.x, to.z];
  const underground = (num(to.y) && to.y < 56) || (num(from.y) && from.y < 56);
  if (underground) return { pts: [a, b], length: lengthOf([a, b]), straight: true };
  const net = roadNet(seed);
  const na = net.nearest(from.x, from.z);
  const nb = net.nearest(to.x, to.z);
  if (!na || !nb) return { pts: [a, b], length: lengthOf([a, b]), straight: true };
  const ids = net.routeNodes(na.node, nb.node);
  if (!ids) return { pts: [a, b], length: lengthOf([a, b]), straight: true };
  const pts = [a];
  for (let i = 0; i < ids.length; i++) {
    const n = net.nodes[ids[i]];
    if (n) pts.push([n.x, n.z]);
  }
  pts.push(b);
  // aşırı uzun rotayı eşit aralıklı seyrelt (uçlar korunur)
  let out = pts;
  if (pts.length > cap) {
    out = [];
    const step = (pts.length - 1) / (cap - 1);
    for (let i = 0; i < cap; i++) out.push(pts[Math.min(pts.length - 1, Math.round(i * step))]);
  }
  return { pts: out, length: lengthOf(out), straight: false };
}
