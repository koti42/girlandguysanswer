/*
 * KEŞİF harita ekranı — canvas çizimi (yalnızca 2D bağlama yazar; panelMap.js geometrisini kullanır).
 * drawMap(ctx, st): st = {w,h,view,bounds,tileCanvas,markers,rings,player,spawn,selectedKey,contrast, drawUnder?(ctx, st)}
 * Çizim sırası: zemin → kareler (keşfedilmemiş = sis) → bölge halkaları → işaretler → oyuncu oku → ölçek/pusula.
 */
import { shapePoints, worldToScreen } from './panelMap.js';

const BG = '#070a18';
const INK = '#0b0f22';

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Tek işaret şekli (cx,cy,r). discovered=false → silik halka + '?'. */
export function drawMarkerShape(ctx, shape, cx, cy, r, color, discovered, contrast) {
  ctx.save();
  ctx.lineJoin = 'round';
  if (!discovered) {
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,26,52,0.9)';
    ctx.fill();
    ctx.lineWidth = contrast ? 2.5 : 1.5;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#8f9bc2';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#c3cbe6';
    ctx.font = 'bold ' + Math.round(r * 1.25) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + 0.5);
    ctx.restore();
    return;
  }
  const pts = shapePoints(shape, cx, cy, r);
  if (pts) poly(ctx, pts);
  else {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = contrast ? 3 : 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  ctx.restore();
}

function label(ctx, text, x, y, color) {
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(7,10,24,0.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color || '#eef1ff';
  ctx.fillText(text, x, y);
}

function niceScaleLength(scale) {
  const targets = [10, 25, 50, 100, 250, 500, 1000];
  for (let i = 0; i < targets.length; i++) if (targets[i] * scale >= 56) return targets[i];
  return targets[targets.length - 1];
}

export function drawMap(ctx, st) {
  const { w, h, view, bounds } = st;
  ctx.setTransform(st.dpr || 1, 0, 0, st.dpr || 1, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // kareler
  if (st.tileCanvas) {
    const a = worldToScreen(view, w, h, bounds.minX, bounds.minZ);
    const b = worldToScreen(view, w, h, bounds.maxX, bounds.maxZ);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(st.tileCanvas, a[0], a[1], b[0] - a[0], b[1] - a[1]);
    ctx.strokeStyle = 'rgba(160,175,230,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(a[0] + 0.5, a[1] + 0.5, b[0] - a[0], b[1] - a[1]);
  }

  // şehir katmanı (CityMap): bölge etiketleri ve rota çizgisi — işaretlerin ALTINDA
  if (typeof st.drawUnder === 'function') st.drawUnder(ctx, st);

  // bölge halkaları
  const o = worldToScreen(view, w, h, 0, 0);
  (st.rings || []).forEach((ring) => {
    const r = ring.r * view.scale;
    if (r < 4 || r > 20000) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(o[0], o[1], r, 0, Math.PI * 2);
    ctx.setLineDash(ring.unlocked === false ? [4, 6] : [10, 6]);
    ctx.lineWidth = st.contrast ? 2.5 : 1.5;
    ctx.strokeStyle = ring.unlocked === false ? 'rgba(255,120,120,0.75)' : 'rgba(255,207,90,0.7)';
    ctx.stroke();
    ctx.restore();
    const ly = o[1] - r;
    if (ly > 6 && ly < h - 18 && o[0] > 30 && o[0] < w - 30) label(ctx, ring.name + (ring.unlocked === false ? ' (kilitli)' : ''), o[0], ly + 3, '#ffd98a');
  });

  // işaretler
  const R = st.contrast ? 9 : 7;
  const showNames = view.scale >= 1.1;
  const markers = st.markers || [];
  markers.forEach((m) => {
    const p = worldToScreen(view, w, h, m.x, m.z);
    if (p[0] < -20 || p[0] > w + 20 || p[1] < -20 || p[1] > h + 20) return;
    const sel = st.selectedKey === m.key;
    drawMarkerShape(ctx, m.shape, p[0], p[1], sel ? R + 3 : R, m.color, m.discovered, st.contrast);
    if (sel) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], R + 8, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
    if ((showNames && m.discovered) || sel) label(ctx, m.discovered ? m.name : 'Keşfedilmemiş yer', p[0], p[1] + R + 3);
  });

  // başlangıç noktası (işaret olarak verilmediyse)
  if (st.spawn && !markers.some((m) => m.type === 'spawn')) {
    const p = worldToScreen(view, w, h, st.spawn.x, st.spawn.z);
    drawMarkerShape(ctx, 'star', p[0], p[1], R, '#ffe066', true, st.contrast);
    if (showNames) label(ctx, 'Başlangıç', p[0], p[1] + R + 3);
  }

  // oyuncu oku (yaw 0 = −Z/kuzey; + sola → ekranda saat yönünün tersi = −yaw)
  if (st.player) {
    const p = worldToScreen(view, w, h, st.player.x, st.player.z);
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.rotate(-(st.player.yaw || 0));
    const pts = shapePoints('arrow', 0, 0, st.contrast ? 13 : 11);
    poly(ctx, pts);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#2a7fff';
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(p[0], p[1], 17, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(80,160,255,0.55)';
    ctx.stroke();
  }

  // pusula (K) ve ölçek çubuğu
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.beginPath();
  ctx.arc(w - 26, 26, 15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(11,15,34,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('K', w - 26, 27);
  ctx.beginPath();
  ctx.moveTo(w - 26, 8);
  ctx.lineTo(w - 22, 14);
  ctx.lineTo(w - 30, 14);
  ctx.closePath();
  ctx.fillStyle = '#ff6a5a';
  ctx.fill();

  const len = niceScaleLength(view.scale);
  const px = len * view.scale;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(14, h - 18);
  ctx.lineTo(14 + px, h - 18);
  ctx.moveTo(14, h - 23);
  ctx.lineTo(14, h - 13);
  ctx.moveTo(14 + px, h - 23);
  ctx.lineTo(14 + px, h - 13);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(7,10,24,0.9)';
  const txt = len >= 1000 ? len / 1000 + ' km' : len + ' m';
  ctx.strokeText(txt, 14, h - 25);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(txt, 14, h - 25);
}
