/*
 * KEŞİF — foto modu arayüzü saf yardımcıları (photo_map; DOM/React yok, test edilir).
 *
 *   SLIDERS                 kaydırıcı tanımları [{key, label, unit, min, max, step, group}]   (sınırlar sim/city/map/photoMath.PHOTO_LIMITS ile aynı: test çapraz denetler)
 *   TABS                    sekmeler [{key, name}]
 *   ORBIT_SENS              sürükleme duyarlılığı (rad/piksel)
 *   dragToOrbit(dx, dy)     → [dyaw, dpitch]   (dünyayı tut-sürükle: sağa sürükle = sahne sağa kayar)
 *   pinchToZoom(prev, cur)  → metre değişimi (parmaklar açılınca kamera yaklaşır = negatif)
 *   wheelToZoom(deltaY)     → metre
 *   photoKeyAction(e)       → {k:'orbit',dyaw,dpitch} | {k:'zoom',d} | {k:'fov',d} | {k:'capture'} | null
 *   formatBytes(n) · valueText(def, v) · shotSummary(shot) · shotAria(shot)
 */
export const SLIDERS = Object.freeze([
  { key: 'fov', label: 'Görüş açısı', unit: '°', min: 20, max: 90, step: 1, group: 'kamera' },
  { key: 'dist', label: 'Uzaklık', unit: ' m', min: 1.2, max: 25, step: 0.1, group: 'kamera' },
  { key: 'height', label: 'Hedef yüksekliği', unit: ' m', min: -1.5, max: 3, step: 0.1, group: 'kamera' },
  { key: 'exposure', label: 'Pozlama', unit: '', min: 0.55, max: 1.7, step: 0.05, group: 'isik' },
  { key: 'bloom', label: 'Neon parlaması', unit: '', min: 0, max: 1.8, step: 0.05, group: 'isik' },
  { key: 'vignette', label: 'Vinyet', unit: '', min: 0, max: 1, step: 0.05, group: 'isik' },
  { key: 'grain', label: 'Film greni', unit: '', min: 0, max: 0.6, step: 0.02, group: 'isik' },
  { key: 'filterAmount', label: 'Filtre gücü', unit: '', min: 0, max: 1, step: 0.05, group: 'stil' },
].map((s) => Object.freeze(s)));

export const TABS = Object.freeze([
  { key: 'kamera', name: 'Kamera' },
  { key: 'isik', name: 'Işık' },
  { key: 'stil', name: 'Stil' },
  { key: 'album', name: 'Albüm' },
]);

export const ORBIT_SENS = 0.006;
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function dragToOrbit(dx, dy) {
  return [num(dx, 0) * ORBIT_SENS, num(dy, 0) * ORBIT_SENS];
}

export function pinchToZoom(prev, cur) {
  if (!(num(prev, 0) > 0) || !(num(cur, 0) > 0)) return 0;
  return -(cur - prev) * 0.05;
}

export function wheelToZoom(deltaY) {
  return Math.max(-6, Math.min(6, num(deltaY, 0) * 0.01));
}

const STEP = 0.06;
export function photoKeyAction(e) {
  if (!e || typeof e.key !== 'string') return null;
  const fast = e.shiftKey ? 3 : 1;
  switch (e.key) {
    case 'ArrowLeft': return { k: 'orbit', dyaw: STEP * fast, dpitch: 0 };
    case 'ArrowRight': return { k: 'orbit', dyaw: -STEP * fast, dpitch: 0 };
    case 'ArrowUp': return { k: 'orbit', dyaw: 0, dpitch: -STEP * fast };
    case 'ArrowDown': return { k: 'orbit', dyaw: 0, dpitch: STEP * fast };
    case '+':
    case '=':
    case 'PageUp': return { k: 'zoom', d: -0.6 * fast };
    case '-':
    case '_':
    case 'PageDown': return { k: 'zoom', d: 0.6 * fast };
    case '[': return { k: 'fov', d: -3 * fast };
    case ']': return { k: 'fov', d: 3 * fast };
    case 'Enter': return { k: 'capture' };
    default: return null;
  }
}

export function formatBytes(n) {
  const v = num(n, 0);
  if (v < 1024) return Math.round(v) + ' bayt';
  if (v < 1024 * 1024) return Math.round(v / 102.4) / 10 + ' KB';
  return Math.round(v / 104857.6) / 10 + ' MB';
}

export function valueText(def, v) {
  const x = num(v, def.min);
  const s = def.step >= 1 ? String(Math.round(x)) : (Math.round(x * 100) / 100).toString().replace('.', ',');
  return s + def.unit;
}

export function shotSummary(shot) {
  if (!shot) return '';
  const subj = Array.isArray(shot.subjects) && shot.subjects.length ? ' · ' + shot.subjects.join(', ') : '';
  return shot.w + '×' + shot.h + ' · ' + formatBytes(shot.bytes) + subj;
}

export function shotAria(shot) {
  if (!shot) return '';
  const subj = Array.isArray(shot.subjects) && shot.subjects.length ? ' Kadrajda: ' + shot.subjects.join(', ') + '.' : ' Kadrajda albüm konusu yok.';
  const k = shot.kredi > 0 ? ' ' + shot.kredi + ' Kredi kazandın.' : '';
  return 'Kare yakalandı.' + subj + k;
}
