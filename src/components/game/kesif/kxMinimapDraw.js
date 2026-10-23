/*
 * KEŞİF mini harita çizim yardımcıları (saf canvas 2D işlemleri; Minimap.jsx kullanır).
 */
import { ZONES } from '../../../game/kesif/sim/constants.js';

function hexToRgb(h) {
  if (typeof h === 'number') return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  if (typeof h !== 'string') return [90, 98, 112];
  let s = h.trim().replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  if (!Number.isFinite(n) || s.length !== 6) return [90, 98, 112];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Dünya sınırları (blok): info.bounds ya da size ile merkezli. */
export function mapBounds(info) {
  if (info && info.bounds && typeof info.bounds.minX === 'number') {
    const b = info.bounds;
    return { minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ };
  }
  const sz = info ? info.size : null;
  let sx = 0;
  let sz2 = 0;
  if (typeof sz === 'number') {
    sx = sz;
    sz2 = sz;
  } else if (sz && typeof sz === 'object') {
    sx = sz.x || sz.w || sz.width || 0;
    sz2 = sz.z || sz.h || sz.height || sx;
  }
  if (!(sx > 0)) {
    const r = ZONES[ZONES.length - 1].rOut;
    sx = r * 2;
    sz2 = r * 2;
  }
  return { minX: -sx / 2, minZ: -sz2 / 2, maxX: sx / 2, maxZ: sz2 / 2 };
}

/** Döşeme tamponunu RGBA ekran dışı canvas'a boyar; (w,h) döner. */
export function paintTiles(off, tiles) {
  const w = tiles.w | 0;
  const h = tiles.h | 0;
  if (!(w > 0 && h > 0) || !tiles.data || tiles.data.length < w * h) return false;
  if (off.width !== w || off.height !== h) {
    off.width = w;
    off.height = h;
  }
  const ctx = off.getContext('2d');
  if (!ctx || typeof ctx.createImageData !== 'function') return false;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const pal = Array.isArray(tiles.palette) ? tiles.palette : [];
  const rgb = pal.map(hexToRgb);
  const src = tiles.data;
  for (let i = 0, o = 0; i < w * h; i++, o += 4) {
    const v = src[i];
    if (!v) {
      d[o + 3] = 0;
      continue;
    }
    const c = rgb[v] || rgb[v - 1] || [96, 108, 122];
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

function drawMarker(ctx, type, color, r) {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(8,10,18,.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  switch (type) {
    case 'boss':
      ctx.moveTo(0, -r * 1.2);
      ctx.lineTo(r * 1.1, r * 0.9);
      ctx.lineTo(-r * 1.1, r * 0.9);
      ctx.closePath();
      break;
    case 'parkur':
    case 'parkour':
      ctx.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      break;
    case 'tapinak':
    case 'turbe':
    case 'muhursunagi':
      ctx.moveTo(0, -r * 1.25);
      ctx.lineTo(r * 1.1, 0);
      ctx.lineTo(0, r * 1.25);
      ctx.lineTo(-r * 1.1, 0);
      ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}

/** Tek kare çizim (saf bağlam işlemleri; test edilebilir). */
export function drawMinimap(ctx, px, info, pose, off, opts) {
  const { radiusBlocks, dpr } = opts;
  const R = px / 2;
  const s = R / radiusBlocks; // piksel / blok
  const b = mapBounds(info);
  const yaw = pose.yaw || 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.save();
  ctx.beginPath();
  ctx.arc(R, R, R - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#0b1019';
  ctx.fillRect(0, 0, px, px);

  ctx.translate(R, R);
  ctx.rotate(yaw);
  ctx.translate(-pose.x * s, -pose.z * s);

  // Döşemeler (yalnız bilinen alan görünür).
  if (off && off.width > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, b.minX * s, b.minZ * s, (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);
  }

  // Bölge halkaları (mühür sınırları): şehirde (info.dim='neon') ana diyar halkaları çizilmez.
  const curZone = info && info.zone ? info.zone.id : 0;
  const ringN = info && info.dim === 'neon' ? 0 : ZONES.length - 1;
  for (let i = 0; i < ringN; i++) {
    const ro = ZONES[i].rOut;
    ctx.beginPath();
    ctx.arc(0, 0, ro * s, 0, Math.PI * 2);
    const sealed = i >= curZone;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(sealed ? [5, 4] : []);
    ctx.strokeStyle = sealed ? 'rgba(226,185,76,.75)' : 'rgba(120,200,255,.5)';
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Doğuş noktası.
  if (info && info.spawn && typeof info.spawn.x === 'number') {
    ctx.save();
    ctx.translate(info.spawn.x * s, info.spawn.z * s);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#9be7a8';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  // İşaretler.
  const markers = info && Array.isArray(info.markers) ? info.markers : [];
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    if (!m || !m.discovered || typeof m.x !== 'number') continue;
    const dx = m.x - pose.x;
    const dz = m.z - pose.z;
    const color = typeof m.color === 'string' ? m.color : '#e2b94c';
    ctx.save();
    if (Math.hypot(dx, dz) * s <= R - 6) {
      ctx.translate(m.x * s, m.z * s);
      ctx.rotate(-yaw);
      drawMarker(ctx, m.type, color, 4.2);
    } else if (m.track) {
      // Kenara sıkıştırılmış yön oku: (dx,dz) harita dönüşüyle aynı yaw kadar döndürülür.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const sy = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const len = Math.hypot(sx, sy) || 1;
      ctx.translate(R + (sx / len) * (R - 7), R + (sy / len) * (R - 7));
      ctx.rotate(Math.atan2(sy, sx) + Math.PI / 2);
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(8,10,18,.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4.5, 4);
      ctx.lineTo(-4.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  // Kuzey işareti (harita dönüşüne göre kenarda).
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Kuzey = −Z; ekranda (0,-1) vektörünün yaw kadar saat yönünde döndürülmüşü.
  const nx = R + Math.sin(yaw) * (R - 9);
  const ny = R - Math.cos(yaw) * (R - 9);
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.font = '700 ' + Math.round(R * 0.2) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('K', nx, ny);
  ctx.restore();

  // Oyuncu oku (merkez, her zaman yukarı).
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(R, R);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(8,10,18,.95)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -6.5);
  ctx.lineTo(4.6, 5.2);
  ctx.lineTo(0, 3);
  ctx.lineTo(-4.6, 5.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
