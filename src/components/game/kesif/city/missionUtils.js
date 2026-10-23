/*
 * KEŞİF — görev arayüzü saf yardımcıları (discovery_missions; DOM/React yok, test edilir).
 *
 *   bearingText(rad) → 'önünde' | 'sağ önünde' | 'sağında' | 'sağ arkanda' | 'arkanda' | 'sol arkanda' | 'solunda' | 'sol önünde'
 *   arrowDeg(rad) → 0..360 (CSS dönüşü; 0 = yukarı/önde)
 *   MEDAL_SHAPES · medalText(m) → '★ Altın' (şekil + ad: renk körlüğü)
 *   trackerSig(v) → değişim imzası (gereksiz yeniden çizimi önler)
 *   trackerAria(v) → ekran okuyucu cümlesi (düşük sıklıkta değişir: etiket/geri sayım/kapı)
 *   clockText(sec) → 'm:ss' · timeText(sec) → 'm:ss.d' · distText(m)
 *   boardKeyIndex(e) → 1..3 | 0 (pano: 1–3 tuşları)   graffitiKey(e, state) → {k,...} | null
 */
const MEDAL_NAMES = ['Madalya yok', 'Bronz', 'Gümüş', 'Altın'];
export const MEDAL_SHAPES = Object.freeze(['○', '▲', '◆', '★']);
const DIRS = ['önünde', 'sağ önünde', 'sağında', 'sağ arkanda', 'arkanda', 'sol arkanda', 'solunda', 'sol önünde'];

export function arrowDeg(rad) {
  const d = (Number.isFinite(rad) ? (rad * 180) / Math.PI : 0) % 360;
  // oyun yaw'ı sola artar → hedef açısı (hedefYaw − bakışYaw) pozitifse hedef SOLDA; CSS saat yönü: negatif
  const cw = -d;
  return ((cw % 360) + 360) % 360;
}

export function bearingText(rad) {
  const d = arrowDeg(rad);
  return DIRS[Math.round(d / 45) % 8];
}

export function medalText(m) {
  const i = Number.isInteger(m) && m >= 0 && m <= 3 ? m : 0;
  return MEDAL_SHAPES[i] + ' ' + MEDAL_NAMES[i];
}

export function clockText(sec) {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function timeText(sec) {
  const s = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const w = Math.floor(r);
  return m + ':' + String(w).padStart(2, '0') + '.' + Math.floor((r - w) * 10 + 1e-9);
}

export function distText(m) {
  const v = Number.isFinite(m) && m > 0 ? m : 0;
  return v >= 1000 ? (Math.round(v / 100) / 10).toString().replace('.', ',') + ' km' : Math.round(v) + ' m';
}

export function trackerSig(v) {
  if (!v) return '';
  const r = v.result;
  return [
    v.kind, v.stage, v.title, v.label, v.dist, v.timeLeft, Math.floor((v.t || 0) * 10), v.gate, v.gates, v.countdown, Math.round(arrowDeg(v.bearing) / 10),
    r ? r.title + r.kredi + r.time : '',
  ].join('|');
}

export function trackerAria(v) {
  if (!v) return '';
  if (v.stage === 'countdown' && v.countdown > 0) return String(v.countdown);
  if (v.kind === 'race' && v.stage === 'running') return v.title + ': kapı ' + Math.min(v.gate + 1, v.gates) + ' / ' + v.gates + '. ' + (v.dist ? 'Sıradaki kapı ' + distText(v.dist) + ' ' + bearingText(v.bearing) + '.' : '');
  if (v.kind) return v.title + '. ' + v.label + '. ' + (v.dist ? 'Hedef ' + distText(v.dist) + ' ' + bearingText(v.bearing) + '.' : '') + (v.timeLeft >= 0 ? ' Kalan süre ' + clockText(v.timeLeft) + '.' : '');
  if (v.result) return v.result.title + '. ' + v.result.lines.join('. ');
  return '';
}

export function boardKeyIndex(e) {
  if (!e || e.altKey || e.ctrlKey || e.metaKey) return 0;
  const k = e.key;
  if (k >= '1' && k <= '3') return Number(k);
  return 0;
}

/** Grafiti seçici klavye: 1–6 kalıp, Q/E ya da ←/→ renk, Enter boya, Esc kapat. state {design,color}. */
export function graffitiKey(e, state) {
  if (!e || e.altKey || e.ctrlKey || e.metaKey) return null;
  const k = e.key;
  if (k >= '1' && k <= '6') return { k: 'pick', design: Number(k) - 1 };
  if (k === 'ArrowRight' || k === 'e' || k === 'E') return { k: 'pick', color: ((state.color || 0) + 1) % 8 };
  if (k === 'ArrowLeft' || k === 'q' || k === 'Q') return { k: 'pick', color: ((state.color || 0) + 7) % 8 };
  if (k === 'Enter') return { k: 'paint' };
  if (k === 'Escape') return { k: 'close' };
  return null;
}
