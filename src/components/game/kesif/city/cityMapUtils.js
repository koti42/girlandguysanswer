/*
 * KEŞİF — şehir haritası saf yardımcıları (photo_map; DOM yok, test edilir). CityMap.jsx kullanır.
 *
 *   CITY_MARKER_TYPES            işaret türü → {label, shape, travel} (ana diyar MARKER_TYPES'a EK; şekil + ad = renk körlüğü)
 *   normalizeCityMarkers(list)   panelMap.normalizeMarkers + şehir türü adları/şekilleri
 *   travelIdOf(marker)           'terminal:3' → 't3' · 'metro:1' → 'm1' · diğer '' (hızlı seyahat düğümü)
 *   districtSummary(info)        'Bölgeler: 2/6 (Merkez, Gece Pazarı)'
 *   cityMapSummary(info, markers) ekran okuyucu özeti
 *   legendRows(markers)          göstergede görünecek türler (yalnız bulunmuşlar)
 *   knownBounds(tiles, bounds)   bulunmuş (0 olmayan) döşemelerin dünya dikdörtgeni | null
 *   cityOverview(info, markers, bounds, w, h) → {cx,cz,scale}   açılış görünümü: bulunmuş alan + oyuncu + işaretler sığar (%6 pay)
 *   drawCityUnder(ctx, st)       drawMap kancası: bölge etiketleri + rota çizgisi (st.cityRoute {pts:[[x,z]…], straight}, st.districts)
 *   travelRow(node)              hızlı seyahat satırı metni
 *   DISTRICT_TOTAL
 */
import { clampCenter, normalizeMarkers, scaleLimits, worldToScreen } from '../panelMap.js';

export const DISTRICT_TOTAL = 6;

export const CITY_MARKER_TYPES = Object.freeze({
  terminal: { label: 'Boyut Terminali', shape: 'diamond', travel: true },
  metro: { label: 'Metro durağı', shape: 'hex', travel: true },
  yaris: { label: 'Yarış başlangıcı', shape: 'flag', travel: false },
  kurye: { label: 'Kurye masası', shape: 'square', travel: false },
  kiralik: { label: 'Araç kiralama', shape: 'triangle', travel: false },
  foto: { label: 'Foto noktası', shape: 'star', travel: false },
  cati: { label: 'Çatı parkuru', shape: 'cross', travel: false },
  cip: { label: 'Veri çipi', shape: 'hex', travel: false },
  grafiti: { label: 'Grafiti', shape: 'triangle', travel: false },
  oda: { label: 'Gizli oda', shape: 'square', travel: false },
});

export function normalizeCityMarkers(list) {
  return normalizeMarkers(list).map((m) => {
    const c = Object.prototype.hasOwnProperty.call(CITY_MARKER_TYPES, m.type) ? CITY_MARKER_TYPES[m.type] : null;
    return c ? Object.assign({}, m, { label: c.label, shape: c.shape, travel: c.travel }) : Object.assign({}, m, { travel: false });
  });
}

export function travelIdOf(marker) {
  if (!marker || typeof marker.key !== 'string') return '';
  const m = /^(terminal|metro):(\d{1,2})$/.exec(marker.key);
  if (!m) return '';
  return (m[1] === 'terminal' ? 't' : 'm') + m[2];
}

export function districtSummary(info) {
  const d = info && Array.isArray(info.districts) ? info.districts : [];
  const names = d.map((x) => x.name).filter(Boolean);
  return 'Bölgeler: ' + names.length + '/' + DISTRICT_TOTAL + (names.length ? ' (' + names.join(', ') + ')' : '');
}

export function cityMapSummary(info, markers) {
  const zone = info && info.zone && info.zone.name ? info.zone.name : 'Neon Meridyen';
  const found = markers.filter((m) => m.discovered).length;
  return 'Şehir haritası. Bulunduğun yer: ' + zone + '. ' + districtSummary(info) + '. ' + found + ' keşfedilmiş yer. Ayrıntılar için Liste sekmesine geç.';
}

export function legendRows(markers) {
  const seen = new Map();
  (markers || []).forEach((m) => {
    if (m.discovered && !seen.has(m.type)) seen.set(m.type, m);
  });
  return Array.from(seen.values());
}

export function travelRow(node) {
  if (!node) return '';
  return node.name + ' · ' + (node.dist >= 1000 ? (Math.round(node.dist / 100) / 10).toString().replace('.', ',') + ' km' : node.dist + ' m');
}

/** Bulunmuş (0 olmayan) döşemelerin dünya dikdörtgeni; hiç yoksa null. tiles {w,h,data}; bounds {minX,minZ,maxX,maxZ}. */
export function knownBounds(tiles, bounds) {
  if (!tiles || !tiles.data || !(tiles.w > 0) || !(tiles.h > 0) || !bounds) return null;
  const { w, h, data } = tiles;
  let i0 = w;
  let i1 = -1;
  let j0 = h;
  let j1 = -1;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (data[j * w + i] > 0) {
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
      }
    }
  }
  if (i1 < 0) return null;
  const cw = (bounds.maxX - bounds.minX) / w;
  const ch = (bounds.maxZ - bounds.minZ) / h;
  return {
    x0: bounds.minX + i0 * cw, x1: bounds.minX + (i1 + 1) * cw, z0: bounds.minZ + j0 * ch, z1: bounds.minZ + (j1 + 1) * ch,
  };
}

/** Açılış görünümü: bulunmuş alan + oyuncu + bulunmuş işaretler ekrana sığar. */
export function cityOverview(info, markers, bounds, w, h) {
  const player = info && info.player ? info.player : null;
  const kb = knownBounds(info && info.tiles, bounds);
  let x0 = kb ? kb.x0 : Infinity;
  let x1 = kb ? kb.x1 : -Infinity;
  let z0 = kb ? kb.z0 : Infinity;
  let z1 = kb ? kb.z1 : -Infinity;
  const add = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  };
  if (player) add(player.x, player.z);
  (markers || []).forEach((m) => { if (m.discovered) add(m.x, m.z); });
  if (!(x1 >= x0) || !(z1 >= z0)) return { cx: 0, cz: 0, scale: scaleLimits(bounds, w, h).fit };
  const bw = Math.max(x1 - x0, 120) * 1.12;
  const bh = Math.max(z1 - z0, 120) * 1.12;
  const lim = scaleLimits(bounds, w, h);
  const scale = Math.max(lim.min, Math.min(lim.max, w / bw, h / bh));
  return clampCenter({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, scale }, bounds);
}

/** drawMap `drawUnder` kancası: bölge etiketleri (silik, büyük) + rota (kesikli çizgi + uç noktalar). */
export function drawCityUnder(ctx, st) {
  const { w, h, view } = st;
  const ds = Array.isArray(st.districts) ? st.districts : [];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const placed = [];
  ds.forEach((d) => {
    const p = worldToScreen(view, w, h, d.x, d.z);
    if (p[0] < -200 || p[0] > w + 200 || p[1] < -40 || p[1] > h + 40) return;
    const size = Math.max(10, Math.min(24, view.scale * 40));
    ctx.font = '800 ' + Math.round(size) + 'px system-ui, sans-serif';
    // üst üste binen bölge etiketi çizilmez (küçük ekran / uzak görünüm)
    let tw = 0;
    try {
      const m = typeof ctx.measureText === 'function' ? ctx.measureText(d.name) : null;
      tw = m && Number.isFinite(m.width) ? m.width : 0;
    } catch {
      tw = 0;
    }
    if (!(tw > 0)) tw = d.name.length * size * 0.58;
    const r = [p[0] - tw / 2 - 3, p[1] - size / 2 - 2, p[0] + tw / 2 + 3, p[1] + size / 2 + 2];
    if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return;
    placed.push(r);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(7,10,24,0.7)';
    ctx.strokeText(d.name, p[0], p[1]);
    ctx.fillStyle = 'rgba(255,236,170,0.55)';
    ctx.fillText(d.name, p[0], p[1]);
  });
  const r = st.cityRoute;
  if (r && Array.isArray(r.pts) && r.pts.length >= 2) {
    ctx.beginPath();
    r.pts.forEach((pt, i) => {
      const p = worldToScreen(view, w, h, pt[0], pt[1]);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = st.contrast ? 7 : 5;
    ctx.strokeStyle = 'rgba(7,10,24,0.85)';
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.lineWidth = st.contrast ? 4 : 3;
    ctx.strokeStyle = r.straight ? '#ffb86b' : '#38e8ff';
    ctx.setLineDash(r.straight ? [4, 8] : [10, 6]);
    ctx.stroke();
  }
  ctx.restore();
}

