/*
 * KEŞİF — sürüş mini haritası çizimi (vehicle_ui). Saf çizim mantığı: ctx enjekte edilir (node'da sahte bağlamla test edilir).
 * Aracın baktığı yön YUKARI; yollar vektör (roadNet kenarları, iki sınıf: cadde/sokak), POI simgeleri (şekil + renk), trafik noktaları,
 * rota işareti (görüş içinde iğne, dışında kenar oku) ve oyuncu aracı.
 *
 *   prepareCityMap(seed) → {edges:[{avenue,pts,minX,maxX,minZ,maxZ}], pois:[{type,x,z}], half}      tohum başına önbellekli
 *   drawCityMinimap(ctx, S, data)                                                                    S = css px kenar
 *      data = {map, pose:{x,z,yaw}, range (m), dots:{count,xz}|null, marker:{x,z}|null, calm, palette?}
 *   markerArrow(dx, dz, yaw, range) → {inside, sx, sy, ang, dist}   (sx,sy: yarıçapa göre −1..1 ekran konumu)
 *   POI_STYLE                                                                                        tür → {shape, color, label}
 */
import { roadNet } from '../../../../game/kesif/sim/city/roadNet.js';
import { pois as cityPois } from '../../../../game/kesif/sim/city/cityPlan.js';
import { projectHeadingUp } from './vehicleHudUtils.js';

export const POI_STYLE = Object.freeze({
  garage: { shape: 'kare', color: '#ffc24d', label: 'Garaj' },
  rental: { shape: 'elmas', color: '#38e8ff', label: 'Kiralık araç' },
  courier_desk: { shape: 'ucgen', color: '#ff4fd0', label: 'Kurye masası' },
  portal_terminal: { shape: 'halka', color: '#f4f8ff', label: 'Boyut Terminali' },
  race_gate: { shape: 'bayrak', color: '#b6ff3d', label: 'Yarış kapısı' },
});

export const PALETTE = Object.freeze({
  bg: '#0a1224',
  rim: 'rgba(56,232,255,0.55)',
  street: '#2b3a63',
  avenue: '#45598f',
  bound: 'rgba(255,79,208,0.35)',
  car: '#38e8ff',
  carEdge: '#06101c',
  dot: '#d7e2ff',
  marker: '#ffe14d',
  north: '#ff4fd0',
});

const CACHE = new Map();

export function prepareCityMap(seed) {
  const key = seed >>> 0;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const net = roadNet(seed);
  const edges = [];
  for (let i = 0; i < net.edges.length; i++) {
    const e = net.edges[i];
    const p = e.pts;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let k = 0; k < p.length; k += 3) {
      if (p[k] < minX) minX = p[k];
      if (p[k] > maxX) maxX = p[k];
      if (p[k + 2] < minZ) minZ = p[k + 2];
      if (p[k + 2] > maxZ) maxZ = p[k + 2];
    }
    edges.push({
      avenue: e.kind === 'avenue', pts: p, minX, maxX, minZ, maxZ,
    });
  }
  const list = [];
  const all = cityPois(seed);
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (Object.prototype.hasOwnProperty.call(POI_STYLE, p.type)) list.push({ type: p.type, x: p.x, z: p.z });
  }
  const out = { edges, pois: list, half: 800 };
  if (CACHE.size >= 3) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, out);
  return out;
}

const tmp = { x: 0, y: 0 };

/** Hedefin göreli konumu → ekran. Görüşün (range) içindeyse inside; dışındaysa kenara kıskaç. */
export function markerArrow(dx, dz, yaw, range) {
  projectHeadingUp(dx, dz, yaw, tmp);
  const dist = Math.sqrt(dx * dx + dz * dz);
  const r = range > 0 ? range : 1;
  const k = dist > 0 ? Math.max(1, dist / r) : 1;
  return {
    inside: dist <= r * 0.94,
    sx: tmp.x / r / k,
    sy: tmp.y / r / k,
    ang: Math.atan2(tmp.x, -tmp.y), // yukarıya göre saat yönü
    dist,
  };
}

function shapePath(ctx, shape, r) {
  ctx.beginPath();
  switch (shape) {
    case 'kare':
      ctx.rect(-r, -r, r * 2, r * 2);
      break;
    case 'elmas':
      ctx.moveTo(0, -r * 1.2);
      ctx.lineTo(r * 1.2, 0);
      ctx.lineTo(0, r * 1.2);
      ctx.lineTo(-r * 1.2, 0);
      ctx.closePath();
      break;
    case 'ucgen':
      ctx.moveTo(0, -r * 1.2);
      ctx.lineTo(r * 1.1, r);
      ctx.lineTo(-r * 1.1, r);
      ctx.closePath();
      break;
    case 'halka':
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'bayrak':
      ctx.moveTo(-r * 0.5, -r * 1.2);
      ctx.lineTo(r * 1.2, -r * 0.5);
      ctx.lineTo(-r * 0.5, r * 0.2);
      ctx.lineTo(-r * 0.5, r * 1.3);
      ctx.lineTo(-r * 0.8, r * 1.3);
      ctx.lineTo(-r * 0.8, -r * 1.2);
      ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
}

/**
 * Çizim. ctx: 2D bağlam (setTransform dpr çağıran tarafından yapılmış olmalı; burada css px kullanılır).
 * Maliyet: görünür yol kenarları iki toplu stroke (cadde/sokak) + ≤ 40 POI + ≤ 64 nokta.
 */
export function drawCityMinimap(ctx, S, data) {
  const P = (data && data.palette) || PALETTE;
  const pose = data.pose;
  if (!pose || !Number.isFinite(pose.x + pose.z + pose.yaw)) {
    ctx.clearRect(0, 0, S, S);
    return;
  }
  const range = data.range > 0 && Number.isFinite(data.range) ? data.range : 120;
  const half = S / 2;
  const cx = half;
  const cy = S * 0.58; // araç biraz aşağıda: önü daha çok görünür
  const R = half - 2;
  const k = (S * 0.46) / range; // px / m
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, S, S);

  // harita uzayı: araç merkezde, ileri yukarı
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(pose.yaw);
  ctx.scale(k, k);
  ctx.translate(-pose.x, -pose.z);
  const m = data.map;
  const reach = range * 1.25;
  const x0 = pose.x - reach;
  const x1 = pose.x + reach;
  const z0 = pose.z - reach;
  const z1 = pose.z + reach;
  if (m) {
    // şehir sınırı
    ctx.strokeStyle = P.bound;
    ctx.lineWidth = 3 / k;
    ctx.strokeRect(-m.half, -m.half, m.half * 2, m.half * 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      const avenue = pass === 1;
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < m.edges.length; i++) {
        const e = m.edges[i];
        if (e.avenue !== avenue) continue;
        if (e.maxX < x0 || e.minX > x1 || e.maxZ < z0 || e.minZ > z1) continue;
        const p = e.pts;
        ctx.moveTo(p[0], p[2]);
        for (let q = 3; q < p.length; q += 3) ctx.lineTo(p[q], p[q + 2]);
        any = true;
      }
      if (any) {
        ctx.strokeStyle = avenue ? P.avenue : P.street;
        ctx.lineWidth = Math.max(avenue ? 14 : 9, (avenue ? 2.6 : 1.8) / k);
        ctx.stroke();
      }
    }
    // POI'ler: dönmeyen simge (ters dönüşle dik tutulur)
    const ps = m.pois;
    const sr = Math.max(3.2, 2.6) / k;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
      const st = POI_STYLE[p.type];
      ctx.save();
      ctx.translate(p.x, p.z);
      ctx.rotate(-pose.yaw);
      shapePath(ctx, st.shape, sr);
      if (st.shape === 'halka') {
        ctx.strokeStyle = st.color;
        ctx.lineWidth = 1.4 / k;
        ctx.stroke();
      } else {
        ctx.fillStyle = st.color;
        ctx.fill();
        ctx.strokeStyle = P.carEdge;
        ctx.lineWidth = 0.8 / k;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  // trafik
  const dots = data.dots;
  if (dots && dots.count > 0) {
    ctx.fillStyle = P.dot;
    const dr = 1.5 / k;
    for (let i = 0; i < dots.count; i++) {
      const x = dots.xz[i * 2];
      const z = dots.xz[i * 2 + 1];
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      ctx.fillRect(x - dr, z - dr, dr * 2, dr * 2);
    }
  }
  ctx.restore();

  // rota işareti
  const mk = data.marker;
  if (mk && Number.isFinite(mk.x) && Number.isFinite(mk.z)) {
    const a = markerArrow(mk.x - pose.x, mk.z - pose.z, pose.yaw, range);
    ctx.save();
    if (a.inside) {
      ctx.translate(cx + (a.sx * range) * k, cy + (a.sy * range) * k);
      ctx.fillStyle = P.marker;
      ctx.strokeStyle = P.carEdge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = P.carEdge;
      ctx.fill();
    } else {
      // kenar oku: görünür dairenin kenarı üzerinde, hedefe doğru
      const ex = half + Math.sin(a.ang) * (R - 7);
      const ey = half - Math.cos(a.ang) * (R - 7);
      ctx.translate(ex, ey);
      ctx.rotate(a.ang);
      ctx.fillStyle = P.marker;
      ctx.strokeStyle = P.carEdge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // oyuncu aracı
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = P.car;
  ctx.strokeStyle = P.carEdge;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // kuzey işareti (dönen halka üzerinde)
  projectHeadingUp(0, -1, pose.yaw, tmp); // kuzey = −z
  const nx = half + tmp.x * (R - 7);
  const ny = half + tmp.y * (R - 7);
  ctx.fillStyle = P.north;
  ctx.beginPath();
  ctx.arc(nx, ny, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#06101c';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('K', nx, ny + 0.5);

  // halka
  ctx.strokeStyle = P.rim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(half, half, R, 0, Math.PI * 2);
  ctx.stroke();
}
