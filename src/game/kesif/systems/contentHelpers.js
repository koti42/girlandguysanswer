/*
 * KEŞİF content sistemi — saf yardımcılar (DOM/three yok; node'da test edilir).
 *
 *   CELL                              yapı hücresi kenarı (64)
 *   cellOfBlock(v) → hücre indeksi     cellCenter(i) → blok
 *   cellsAround(x, z, r) → [{ci,cj,key,d}]   yarıçap r içine değen hücreler, yakından uzağa
 *   distToRect(x, z, r) → blok         (x,z) ile {x0,z0,x1,z1} dikdörtgeni arası yatay uzaklık (içeride 0)
 *   inBox(b, x, y, z, pad)             {x0..z1} kutusunda mı
 *   normAngle(a)                       −π..π
 *   yawToward(dx, dz)                  yaw: 0 = −Z'ye bakar, + sola (fizik sözleşmesi)
 *   compassLabel(dx, dz)               'kuzey' … 'kuzeybatı' (kuzey = −Z, doğu = +X)
 *   bearingInfo(px, pz, yaw, tx, tz)   {dist, relYaw (+sola), compass, text}
 *   splitMessage(text, max)            cümle sınırlarında ≤ max karakterlik parçalar
 *   messageSeconds(text)               okunma süresi (sn)
 *   parseCellId(id)                    'tür:ci,cj' → {type,ci,cj} | null
 *   itemName(key) / zoneCrystalKey(z)  eşya adı / bölge kristali eşya anahtarı
 */
import { ITEMS } from '../sim/items.js';

export const CELL = 64;

export function cellOfBlock(v) {
  return Math.floor((v + CELL / 2) / CELL);
}

export function cellCenter(i) {
  return i * CELL;
}

/** Yarıçap r (blok) içine değen yapı hücreleri; (x,z)'ye uzaklığa göre sıralı. */
export function cellsAround(x, z, r) {
  const out = [];
  const c0 = cellOfBlock(x - r);
  const c1 = cellOfBlock(x + r);
  const d0 = cellOfBlock(z - r);
  const d1 = cellOfBlock(z + r);
  for (let cj = d0; cj <= d1; cj++) {
    for (let ci = c0; ci <= c1; ci++) {
      const rect = {
        x0: ci * CELL - CELL / 2, z0: cj * CELL - CELL / 2, x1: ci * CELL + CELL / 2 - 1, z1: cj * CELL + CELL / 2 - 1,
      };
      const d = distToRect(x, z, rect);
      if (d <= r) out.push({ ci, cj, key: ci + ',' + cj, d });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

export function distToRect(x, z, r) {
  const dx = x < r.x0 ? r.x0 - x : (x > r.x1 ? x - r.x1 : 0);
  const dz = z < r.z0 ? r.z0 - z : (z > r.z1 ? z - r.z1 : 0);
  return dx === 0 && dz === 0 ? 0 : Math.sqrt(dx * dx + dz * dz);
}

export function inBox(b, x, y, z, pad) {
  const p = pad || 0;
  return x >= b.x0 - p && x <= b.x1 + p + 1 && z >= b.z0 - p && z <= b.z1 + p + 1 && y >= b.y0 - p && y <= b.y1 + p + 1;
}

export function normAngle(a) {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

export function yawToward(dx, dz) {
  return Math.atan2(-dx, -dz);
}

const COMPASS = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];

export function compassLabel(dx, dz) {
  if (!dx && !dz) return 'tam burada';
  const ang = Math.atan2(dx, -dz); // 0 = kuzey, saat yönünde
  const i = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS[i];
}

/** 'kuzey' → 'kuzeyde', 'doğu' → 'doğuda' (bulunma hâli, ünlü uyumu). */
export function compassAt(c) {
  return c === 'kuzey' || c === 'güney' ? c + 'de' : c + 'da';
}

/** Oyuncudan hedefe: uzaklık, bakışa göre göreli açı (+ = hedef solda), pusula ve Türkçe kısa metin. */
export function bearingInfo(px, pz, yaw, tx, tz) {
  const dx = tx - px;
  const dz = tz - pz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const rel = normAngle(yawToward(dx, dz) - yaw);
  const compass = compassLabel(dx, dz);
  const d = dist < 1000 ? Math.round(dist / 5) * 5 : Math.round(dist / 10) * 10;
  let side = 'karşında';
  const a = Math.abs(rel);
  if (a > Math.PI * 0.75) side = 'arkanda';
  else if (a > Math.PI * 0.2) side = rel > 0 ? 'solunda' : 'sağında';
  return {
    dist, relYaw: rel, compass, side, text: d < 8 ? 'çok yakında' : d + ' blok ' + compassAt(compass) + ', ' + side,
  };
}

/** Cümle sınırlarında ≤ max karakterlik parçalar (sonuncu eksik cümle kesilmez). */
export function splitMessage(text, max) {
  const t = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
  const lim = max > 20 ? max : 150;
  if (!t) return [];
  if (t.length <= lim) return [t];
  const parts = [];
  let cur = '';
  const sentences = t.match(/[^.!?:]+[.!?:]*\s*/g) || [t];
  for (let i = 0; i < sentences.length; i++) {
    let s = sentences[i].trim();
    while (s.length > lim) {
      let cut = s.lastIndexOf(' ', lim);
      if (cut < lim * 0.4) cut = lim;
      if (cur) {
        parts.push(cur);
        cur = '';
      }
      parts.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (!s) continue;
    if (cur && (cur.length + 1 + s.length) > lim) {
      parts.push(cur);
      cur = s;
    } else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Bir parçanın ekranda kalma süresi (sn): okuma hızına göre 2,6..7. */
export function messageSeconds(text) {
  const n = String(text || '').length;
  return Math.max(2.6, Math.min(7, 1.8 + n / 22));
}

export function parseCellId(id) {
  const m = /^([a-z]+):(-?\d+),(-?\d+)$/.exec(String(id));
  return m ? { type: m[1], ci: Number(m[2]), cj: Number(m[3]) } : null;
}

export function itemName(key) {
  const it = ITEMS[key];
  return it && it.name ? it.name : String(key);
}

export function zoneCrystalKey(zone) {
  return 'item:anahtar_kristali_z' + zone;
}

/** a ve b dizileri aynı mı (sığ). */
export function sameList(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
