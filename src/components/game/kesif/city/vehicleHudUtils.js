/*
 * KEŞİF — sürüş arayüzü saf yardımcıları (vehicle_ui, Neon Meridyen Faz 3). DOM/React yok; node'da test edilir.
 *
 *   MIN_TARGET (44)                      dokunmatik hedef alt sınırı (px)
 *   gearLabel(gear, cls)                 'R' | 'N' | '1'..'5' | 'H' (hover/tahta tek vites)
 *   speedoMaxKmh(cls)                    gösterge yayının tam ölçeği (km/sa): nitro dahil azami hızın üstü, 20'ye yuvarlı
 *   arcFraction(kmh, maxKmh)             0..1
 *   formatClock(sec)                     'd:ss'
 *   driveLayout({w,h,portrait,scale})    dokunmatik sürüş denetimlerinin boyutları (hepsi ≥ 44 px)
 *   announceFor(prev, next)              hud.vehicle geçişinden ekran okuyucu metni | ''
 *   classStats(cls)                      garaj paneli sınıf özellikleri [{key,label,text,frac}]
 *   projectHeadingUp(dx, dz, yaw, out)   dünya farkı → mini harita ekran farkı (ileri = yukarı)
 *   minimapRange(speed, big)             mini harita yarıçapı (m): hızla açılır
 *   sanitizePrefs(raw) / loadPrefs() / savePrefs(p)   sürüş tercihleri (localStorage, hata güvenli)
 */
import { VEHICLE_DEFS, getVehicleDef } from '../../../../game/kesif/sim/city/vehicle/vehicleData.js';

export const MIN_TARGET = 44;
export const PREFS_KEY = 'kesif.drive.v1';

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function gearLabel(gear, cls) {
  const d = getVehicleDef(cls);
  if (d && (d.kind === 'hover' || d.kind === 'tahta')) return gear < 0 ? 'R' : 'H';
  const g = Math.round(num(gear, 0));
  if (g < 0) return 'R';
  if (g === 0) return 'N';
  return String(Math.min(g, 9));
}

export function speedoMaxKmh(cls) {
  const d = getVehicleDef(cls);
  const base = d ? d.max * d.nitro.spd * 3.6 : 160;
  return Math.ceil(base / 20) * 20;
}

export function arcFraction(kmh, maxKmh) {
  const m = maxKmh > 0 ? maxKmh : 1;
  return clamp(num(kmh, 0) / m, 0, 1);
}

export function formatClock(sec) {
  const s = Math.max(0, Math.floor(num(sec, 0)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

/**
 * Dokunmatik sürüş düzeni boyutları. scale: kxTouchLayout.touchScale (0.78..1.15) — 1'in altı yok sayılır (şartname boyutu taban). Her boyut MIN_TARGET altına inmez.
 * gas/brake: {w,h} (dikey konum analog değer verir); steer: tekerlek çapı; nitro/hand/small: daire/kare kenarı.
 */
export function driveLayout(o) {
  const q = o || {};
  const portrait = Boolean(q.portrait);
  const s = clamp(num(q.scale, 1), 1, 1.3); // yalnız büyür: şartname boyutları (gaz 96, fren 72, nitro 64, el freni 56) taban
  const px = (v) => Math.max(MIN_TARGET, Math.round(v * s));
  const h = num(q.h, 400);
  const w = num(q.w, 0);
  const gas = { w: px(portrait ? 88 : 96), h: px(portrait ? 116 : 124) };
  const brake = { w: px(portrait ? 68 : 72), h: px(portrait ? 92 : 96) };
  const gap = Math.round(8 * s);
  let steer = px(portrait ? 144 : clamp(h * 0.4, 128, 176));
  // qa_gpu: dar dikey ekranda (320–360 px) direksiyon pedallarla çakışmasın: sol blok + pedaller + boşluk ekrana sığar
  let steerMaxW = Infinity;
  if (w > 0 && portrait) {
    steerMaxW = Math.max(96, w - 40 - (gas.w + brake.w + gap) - 6); // kenar boşlukları: safe 10 + pad 10, iki yanda
    steer = Math.min(steer, steerMaxW);
  }
  // qa_gpu: üst çubuk 7 düğme (İn · Yola · Korna · Kamera · Harita · Duraklat · Ayar) 360 px ve altında ekrandan taşıyordu: genişliğe sığdır (≥ 44 px; yalnız < 358 px ekranda 40'a kadar iner)
  let small = px(48);
  if (w > 0) {
    const fit = Math.floor((w - 16 - 6 * (portrait ? 3 : 5)) / 7);
    small = Math.max(40, Math.min(small, fit));
  }
  return {
    portrait,
    scale: s,
    steer,
    steerMaxW,
    gas,
    brake,
    nitro: px(64),
    hand: px(56),
    small,
    gap,
  };
}

/** hud.vehicle geçişi → sesli duyuru. prev/next: sanitize edilmiş hud.vehicle | null. */
export function announceFor(prev, next) {
  if (!prev && next) {
    const d = getVehicleDef(next.cls);
    return 'Araca bindin: ' + (d ? d.name : 'araç') + '.';
  }
  if (prev && !next) return 'Araçtan indin.';
  if (prev && next) {
    if (!(prev.rent > 0 && prev.rent <= 60) && next.rent > 0 && next.rent <= 60) return 'Kiralık aracın süresi dolmak üzere.';
    if (!prev.slow && next.slow) return 'Şehir yükleniyor: hız sınırlandı.';
  }
  return '';
}

const bar = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0.06, 1);

/** Garaj paneli özellikleri (karşılaştırma çubukları için aralıklar tüm sınıfları kapsar). */
export function classStats(cls) {
  const d = getVehicleDef(cls);
  if (!d) return [];
  return [
    { key: 'hiz', label: 'Hız', text: Math.round(d.max * 3.6) + ' km/sa', frac: bar(d.max, 18, 46) },
    { key: 'ivme', label: 'İvme', text: String(d.accel), frac: bar(d.accel, 5, 20) },
    { key: 'direksiyon', label: 'Dönüş', text: Math.round(d.steerDeg) + '°', frac: bar(d.steerDeg, 20, 48) },
    { key: 'fren', label: 'Fren', text: String(d.brake), frac: bar(d.brake, 12, 28) },
    { key: 'koltuk', label: 'Koltuk', text: String(d.seats) + (d.parcels > 0 ? ' + ' + d.parcels + ' koli' : ''), frac: bar(d.seats + d.parcels * 0.5, 0.5, 4.5) },
    { key: 'nitro', label: 'Nitro', text: 'x' + d.nitro.spd.toFixed(2).replace(/0$/, ''), frac: bar(d.nitro.spd, 1.1, 1.4) },
  ];
}

/**
 * Dünya farkı (dx → doğu, dz → güney) → ekran farkı (x sağ, y aşağı), aracın baktığı yön YUKARI.
 * Araç yönü yaw: ileri = (−sin yaw, −cos yaw), sağ = (cos yaw, −sin yaw).
 */
export function projectHeadingUp(dx, dz, yaw, out) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = dx * c - dz * s;
  out.y = dx * s + dz * c;
  return out;
}

/** Mini harita görüş yarıçapı (m): durağanda 90 m, hızlandıkça 220 m'ye açılır; büyük harita 1.25×. */
export function minimapRange(speed, big) {
  const r = 90 + clamp(num(speed, 0), 0, 44) * 3;
  return Math.round((big ? r * 1.25 : r) * 10) / 10;
}

export const DEFAULT_PREFS = Object.freeze({
  steerMode: 'wheel', autoThrottle: false, laneAssist: 'auto', hints: true,
});

export function sanitizePrefs(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    steerMode: r.steerMode === 'slider' ? 'slider' : 'wheel',
    autoThrottle: r.autoThrottle === true,
    laneAssist: r.laneAssist === 'on' || r.laneAssist === 'off' ? r.laneAssist : 'auto',
    hints: r.hints !== false,
  };
}

export function loadPrefs() {
  try {
    const t = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFS_KEY) : null;
    return sanitizePrefs(t ? JSON.parse(t) : null);
  } catch {
    return sanitizePrefs(null);
  }
}

export function savePrefs(p) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PREFS_KEY, JSON.stringify(sanitizePrefs(p)));
  } catch {
    // depolama kapalı: tercih bu oturumda kalır
  }
}

export { VEHICLE_DEFS };
