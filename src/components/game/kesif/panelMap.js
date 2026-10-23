/*
 * KEŞİF harita ekranı — saf geometri ve veri yardımcıları (DOM/canvas yok).
 *
 * api.getMapInfo() → { zone, size, player:{x,z,yaw}, spawn:{x,z}, tiles:{w,h,data:Uint8Array,palette:[hex]},
 *                      markers:[{type,name,x,z,discovered,color}] }
 * Varsayımlar (sözleşme ayrıntı vermediği yerler):
 *  - Kareler dünyanın kare bir bölgesini doğrusal kaplar; bölge `info.bounds {minX,minZ,maxX,maxZ}` ile verilir,
 *    yoksa `info.size` (sayı = kenar uzunluğu blok, ya da {x,z}/{w,h}) ile (0,0) merkezli, o da yoksa dünya yarıçapı.
 *  - tiles.data: 0 = bilinmiyor; v ≥ 1 → palette[v - 1 + paletteBase] (paletteBase varsayılan 0; palette[0] "bilinmiyor"
 *    rengi ise tiles.paletteBase = 1 verilmeli).
 *  - Dünya +X = harita sağı, −Z = harita yukarısı (kuzey).
 */
import { WORLD_RADIUS, ZONES } from '../../../game/kesif/sim/constants.js';

/** Yer işareti türleri: etiket + şekil (renk körlüğü için renge ek) + kısa açıklama. */
export const MARKER_TYPES = Object.freeze({
  spawn: { label: 'Başlangıç', shape: 'star' },
  yatak: { label: 'Yatak', shape: 'square' },
  anahtartapinagi: { label: 'Anahtar Tapınağı', shape: 'diamond' },
  muhursunagi: { label: 'Mühür Sunağı', shape: 'hex' },
  bossarena: { label: 'Boss Arenası', shape: 'cross' },
  turbe: { label: 'Bulmaca Türbesi', shape: 'square' },
  kamp: { label: 'Kamp', shape: 'triangle' },
  koy: { label: 'Köy', shape: 'triangle' },
  gozcukulesi: { label: 'Gözcü Kulesi', shape: 'flag' },
  harabe: { label: 'Harabe', shape: 'diamond' },
  yuzenada: { label: 'Yüzen Ada', shape: 'circle' },
  gizlimagara: { label: 'Gizli Mağara', shape: 'circle' },
  hazine: { label: 'Hazine', shape: 'star' },
  parkur: { label: 'Parkur', shape: 'flag' },
  oyuncu: { label: 'Sen', shape: 'arrow' },
  terminal: { label: 'Boyut Terminali', shape: 'diamond' },
  // Neon Meridyen keşifleri (yalnız bulunmuşlar; systems/cityDiscovery)
  cip: { label: 'Veri çipi', shape: 'hex' },
  grafiti: { label: 'Grafiti', shape: 'triangle' },
  oda: { label: 'Gizli oda', shape: 'square' },
});
const DEFAULT_MARKER = { label: 'Yer', shape: 'circle' };

export function markerInfo(type) {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(MARKER_TYPES, type) ? MARKER_TYPES[type] : DEFAULT_MARKER;
}

/** Şekil çokgeni (cx,cy merkezli yarıçap r): [[x,y],...]; daire/ok için null. */
export function shapePoints(shape, cx, cy, r) {
  switch (shape) {
    case 'square':
      return [[cx - r * 0.8, cy - r * 0.8], [cx + r * 0.8, cy - r * 0.8], [cx + r * 0.8, cy + r * 0.8], [cx - r * 0.8, cy + r * 0.8]];
    case 'diamond':
      return [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
    case 'triangle':
      return [[cx, cy - r], [cx + r * 0.95, cy + r * 0.75], [cx - r * 0.95, cy + r * 0.75]];
    case 'hex': {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return pts;
    }
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      return pts;
    }
    case 'cross': {
      const t = r * 0.38;
      return [
        [cx - t, cy - r], [cx + t, cy - r], [cx + t, cy - t], [cx + r, cy - t], [cx + r, cy + t], [cx + t, cy + t],
        [cx + t, cy + r], [cx - t, cy + r], [cx - t, cy + t], [cx - r, cy + t], [cx - r, cy - t], [cx - t, cy - t],
      ];
    }
    case 'flag':
      return [[cx - r * 0.6, cy - r], [cx + r * 0.9, cy - r * 0.45], [cx - r * 0.6, cy + r * 0.1], [cx - r * 0.6, cy + r], [cx - r * 0.8, cy + r], [cx - r * 0.8, cy - r]];
    case 'arrow':
      return [[cx, cy - r], [cx + r * 0.75, cy + r * 0.8], [cx, cy + r * 0.4], [cx - r * 0.75, cy + r * 0.8]];
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Bölge ve dönüşümler
 * ---------------------------------------------------------------------------------------------- */
function finite(n, d) {
  return typeof n === 'number' && Number.isFinite(n) ? n : d;
}

/** Karelerin kapladığı dünya dikdörtgeni. */
export function mapBounds(info) {
  const b = info && info.bounds;
  if (b && [b.minX, b.minZ, b.maxX, b.maxZ].every((v) => typeof v === 'number' && Number.isFinite(v)) && b.maxX > b.minX && b.maxZ > b.minZ) {
    return { minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ };
  }
  const s = info && info.size;
  let sx = 0;
  let sz = 0;
  if (typeof s === 'number') {
    sx = s;
    sz = s;
  } else if (s && typeof s === 'object') {
    sx = finite(s.x, finite(s.w, 0));
    sz = finite(s.z, finite(s.h, 0));
  }
  if (!(sx > 0 && sz > 0)) {
    sx = WORLD_RADIUS * 2;
    sz = WORLD_RADIUS * 2;
  }
  return { minX: -sx / 2, minZ: -sz / 2, maxX: sx / 2, maxZ: sz / 2 };
}

/** Görünüm: {cx,cz} dünya merkezi, scale = piksel/blok. */
export function fitScale(bounds, w, h) {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxZ - bounds.minZ;
  return Math.max(0.05, Math.min(w / bw, h / bh));
}
export function scaleLimits(bounds, w, h) {
  const fit = fitScale(bounds, w, h);
  return { min: fit * 0.6, max: Math.max(fit * 24, 12), fit };
}
export function clampScale(scale, limits) {
  return Math.max(limits.min, Math.min(limits.max, scale));
}
export function worldToScreen(view, w, h, x, z) {
  return [w / 2 + (x - view.cx) * view.scale, h / 2 + (z - view.cz) * view.scale];
}
export function screenToWorld(view, w, h, sx, sy) {
  return [view.cx + (sx - w / 2) / view.scale, view.cz + (sy - h / 2) / view.scale];
}
/** Merkezi bölge sınırları içinde tut (biraz taşmaya izin ver). */
export function clampCenter(view, bounds) {
  const padX = (bounds.maxX - bounds.minX) * 0.1;
  const padZ = (bounds.maxZ - bounds.minZ) * 0.1;
  return {
    cx: Math.max(bounds.minX - padX, Math.min(bounds.maxX + padX, view.cx)),
    cz: Math.max(bounds.minZ - padZ, Math.min(bounds.maxZ + padZ, view.cz)),
    scale: view.scale,
  };
}
/** (sx,sy) ekran noktası sabit kalacak şekilde ölçeği factor kat değiştir. */
export function zoomAt(view, factor, sx, sy, w, h, limits, bounds) {
  const scale = clampScale(view.scale * factor, limits);
  const [wx, wz] = screenToWorld(view, w, h, sx, sy);
  const next = { cx: wx - (sx - w / 2) / scale, cz: wz - (sy - h / 2) / scale, scale };
  return bounds ? clampCenter(next, bounds) : next;
}
/** Ekranda (dx,dy) piksel sürükleme → merkezi kaydır. */
export function panBy(view, dx, dy, bounds) {
  const next = { cx: view.cx - dx / view.scale, cz: view.cz - dy / view.scale, scale: view.scale };
  return bounds ? clampCenter(next, bounds) : next;
}
export function centerOn(view, x, z, bounds) {
  const next = { cx: x, cz: z, scale: view.scale };
  return bounds ? clampCenter(next, bounds) : next;
}

/** Yakından bakış ölçeği: genişlikte ~240 blok görünür. */
export function localScale(w) {
  return Math.min(12, Math.max(0.5, w / 240));
}

/**
 * Açılış görünümü: oyuncu + keşfedilmiş yerleri kapsayan bölge (pay 50 blok); kapsanacak bir şey yoksa oyuncuda yakın plan.
 * markers: normalizeMarkers çıktısı. → {cx,cz,scale}
 */
export function overviewView(bounds, w, h, player, markers) {
  const px = player && Number.isFinite(player.x) ? player.x : 0;
  const pz = player && Number.isFinite(player.z) ? player.z : 0;
  const lim = scaleLimits(bounds, w, h);
  const found = (markers || []).filter((m) => m.discovered);
  if (!found.length) return { cx: px, cz: pz, scale: Math.max(lim.min, Math.min(lim.max, localScale(w))) };
  let x0 = px;
  let x1 = px;
  let z0 = pz;
  let z1 = pz;
  found.forEach((m) => {
    x0 = Math.min(x0, m.x);
    x1 = Math.max(x1, m.x);
    z0 = Math.min(z0, m.z);
    z1 = Math.max(z1, m.z);
  });
  const bw = Math.max(x1 - x0 + 100, 160);
  const bh = Math.max(z1 - z0 + 100, 160);
  const scale = Math.max(lim.min, Math.min(lim.max, localScale(w) * 1.6, w / bw, h / bh));
  return clampCenter({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, scale }, bounds);
}

/* ------------------------------------------------------------------------------------------------
 * Renk ve kare dokusu
 * ---------------------------------------------------------------------------------------------- */
/** '#rrggbb' | 'rrggbb' | 0xRRGGBB → [r,g,b]; bozuksa gri. */
export function parseColor(c) {
  if (typeof c === 'number' && Number.isFinite(c)) return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  if (typeof c === 'string') {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(c.trim());
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const s = /^#?([0-9a-fA-F]{3})$/.exec(c.trim());
    if (s) {
      const h = s[1];
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
  }
  return [128, 128, 128];
}
export function toCssColor(c, fallback = '#ffd36b') {
  if (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.trim())) return c.trim();
  if (typeof c === 'number' && Number.isFinite(c)) return '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  return fallback;
}

export const FOG_RGB = Object.freeze([11, 15, 32]);

/** tiles → RGBA tamponu (w*h*4). Bilinmeyen (0) kareler sis rengi, hafif dama deseniyle. */
export function buildTileRGBA(tiles) {
  const w = tiles && tiles.w | 0;
  const h = tiles && tiles.h | 0;
  if (!(w > 0 && h > 0) || !tiles.data) return { w: 0, h: 0, rgba: new Uint8ClampedArray(0), known: 0 };
  const data = tiles.data;
  const pal = (tiles.palette || []).map(parseColor);
  const base = tiles.paletteBase === 1 ? 1 : 0;
  const rgba = new Uint8ClampedArray(w * h * 4);
  let known = 0;
  for (let i = 0; i < w * h; i++) {
    const v = data[i] | 0;
    const o = i * 4;
    if (v <= 0) {
      const chk = ((i % w) + ((i / w) | 0)) & 1 ? 3 : 0;
      rgba[o] = FOG_RGB[0] + chk;
      rgba[o + 1] = FOG_RGB[1] + chk;
      rgba[o + 2] = FOG_RGB[2] + chk;
      rgba[o + 3] = 255;
    } else {
      const c = pal[v - 1 + base] || [128, 128, 128];
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = 255;
      known++;
    }
  }
  return { w, h, rgba, known };
}

/* ------------------------------------------------------------------------------------------------
 * İşaretler ve metin listesi
 * ---------------------------------------------------------------------------------------------- */
const COMPASS = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];
/** (dx,dz) dünya farkı → Türkçe yön (kuzey = −Z, doğu = +X). */
export function bearingLabel(dx, dz) {
  if (!dx && !dz) return 'tam burada';
  const ang = Math.atan2(dx, -dz); // 0 = kuzey, saat yönünde artar
  const i = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS[i];
}
export function formatDistance(m) {
  const d = Math.max(0, Number(m) || 0);
  if (d < 1000) return Math.round(d) + ' m';
  return (Math.round(d / 100) / 10).toString().replace('.', ',') + ' km';
}

/** Ham işaretleri temizler. */
export function normalizeMarkers(markers) {
  const out = [];
  (Array.isArray(markers) ? markers : []).forEach((m, i) => {
    if (!m || typeof m !== 'object') return;
    const x = Number(m.x);
    const z = Number(m.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const info = markerInfo(m.type);
    out.push({
      key: String(m.id || m.type + ':' + Math.round(x) + ',' + Math.round(z) + ':' + i),
      type: typeof m.type === 'string' ? m.type : 'yer',
      label: info.label,
      shape: info.shape,
      name: typeof m.name === 'string' && m.name ? m.name.slice(0, 60) : info.label,
      x,
      z,
      discovered: m.discovered !== false,
      color: toCssColor(m.color),
    });
  });
  return out;
}

/** Keşfedilmiş yerler, oyuncuya yakından uzağa: [{...marker, dist, dir}]. */
export function listPlaces(markers, player) {
  const px = finite(player && player.x, 0);
  const pz = finite(player && player.z, 0);
  return markers
    .filter((m) => m.discovered)
    .map((m) => {
      const dx = m.x - px;
      const dz = m.z - pz;
      return Object.assign({}, m, { dist: Math.sqrt(dx * dx + dz * dz), dir: bearingLabel(dx, dz) });
    })
    .sort((a, b) => a.dist - b.dist);
}

/** Ekran noktasına en yakın işaret (yarıçap içinde) | null. Keşfedilmemişler de seçilir (adı gizli kalır). */
export function hitTestMarker(markers, view, w, h, sx, sy, radius = 14) {
  let best = null;
  let bd = radius * radius;
  markers.forEach((m) => {
    const p = worldToScreen(view, w, h, m.x, m.z);
    const d = (p[0] - sx) * (p[0] - sx) + (p[1] - sy) * (p[1] - sy);
    if (d <= bd) {
      bd = d;
      best = m;
    }
  });
  return best;
}

/** Bölge halkaları: [{id,name,r}] (dünya merkezi 0,0). unlocked verilirse kilit durumu eklenir. */
export function zoneRings(info) {
  if (info && info.dim === 'neon') return []; // şehirde ana diyar bölge halkaları yok
  const unlocked = info && Array.isArray(info.zones) ? info.zones : null;
  return ZONES.map((z) => {
    const u = unlocked ? unlocked.find((q) => q && q.id === z.id) : null;
    return { id: z.id, name: z.name, r: z.rOut, unlocked: u ? u.unlocked !== false : null };
  });
}

/** Haritanın ekran okuyucu özeti. */
export function mapSummary(info, markers) {
  const zone = info && info.zone && info.zone.name ? info.zone.name : 'bilinmeyen bölge';
  const found = markers.filter((m) => m.discovered).length;
  const hidden = markers.length - found;
  let s = 'Harita. Bulunduğun bölge: ' + zone + '. ' + found + ' keşfedilmiş yer';
  if (hidden > 0) s += ', ' + hidden + ' keşfedilmemiş yer';
  return s + '. Ayrıntılar için Liste sekmesine geç.';
}
