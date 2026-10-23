/*
 * KEŞİF sim/city/vehicle — MOTOR / VİTES KUTUSU (saf; belirlenimci). Otomatik 5 vitesli güç aktarımı (hover/tahta: tek devir bandı).
 *
 *   torqueFactor(rpm) → ~0,85..1,15       motor tork eğrisi (orta devirde tepe)
 *   updateGearbox(v, d, u, throttle, h, events)   v.gear / v.rpm / v.shiftT güncellenir; vites değişince {type:'shift', from, to} olayı
 *   shiftFactor(v) → 0..1                 vites boşalması: değişimden sonra 90 ms tork düşüşü
 *
 * Vites üst hızı = d.gears[i]·d.max. Devir (0..1) = rölanti + (kırmızı çizgi − rölanti)·(vites içindeki konum). Geri vites: gear −1.
 * Vites yukarı: devir ≥ 0,93 ve gaz; aşağı: devir ≤ 0,10 (histerezis); aynı anda tek vites değişir. Ses/gösterge bu alanları okur.
 */
export const SHIFT_DIP_SEC = 0.09;
const UP_RPM = 0.93;
const DOWN_RPM = 0.1;

export function torqueFactor(rpm) {
  const r = rpm < 0 ? 0 : rpm > 1 ? 1 : rpm;
  return 0.85 + 0.3 * Math.sin(Math.PI * r);
}

export function shiftFactor(v) {
  return v.shiftT > 0 ? 0.4 : 1;
}

function lowOf(d, i) {
  return i <= 1 ? 0 : d.gears[i - 2] * d.max * 0.62;
}

/** i (1 tabanlı) vitesin içindeki konum 0..1. */
function posInGear(d, i, s) {
  const top = d.gears[i - 1] * d.max;
  const lo = lowOf(d, i);
  const span = top - lo;
  if (!(span > 0.01)) return 0;
  const p = (s - lo) / span;
  return p < 0 ? 0 : p > 1.2 ? 1.2 : p;
}

export function updateGearbox(v, d, u, throttle, h, events) {
  const n = d.gears.length;
  const idle = d.rpm.idle;
  const red = d.rpm.red;
  if (v.shiftT > 0) v.shiftT = v.shiftT > h ? v.shiftT - h : 0;
  const s = u < 0 ? -u : u;
  if (u < -0.6) {
    // geri vites
    if (v.gear !== -1) {
      if (events) events.push({ type: 'shift', from: v.gear, to: -1 });
      v.gear = -1;
      v.shiftT = SHIFT_DIP_SEC;
    }
    const p = s / (0.3 * d.max);
    v.rpm = idle + (red - idle) * (p > 1 ? 1 : 0.15 + 0.85 * p);
    return v;
  }
  if (v.gear < 1) {
    v.gear = 1;
    if (events && s > 0.7) events.push({ type: 'shift', from: -1, to: 1 });
  }
  if (n === 1) {
    v.gear = 1;
    const p = s / d.max;
    v.rpm = idle + (red - idle) * Math.min(1, 0.2 * throttle + 0.8 * Math.min(1, p));
    return v;
  }
  let g = v.gear;
  let pos = posInGear(d, g, s);
  if (g < n && pos >= UP_RPM && throttle > 0.05) {
    if (events) events.push({ type: 'shift', from: g, to: g + 1 });
    g += 1;
    v.shiftT = SHIFT_DIP_SEC;
    pos = posInGear(d, g, s);
  } else if (g > 1 && pos <= DOWN_RPM) {
    if (events) events.push({ type: 'shift', from: g, to: g - 1 });
    g -= 1;
    v.shiftT = SHIFT_DIP_SEC * 0.6;
    pos = posInGear(d, g, s);
  }
  v.gear = g;
  const base = idle + (red - idle) * (0.25 + 0.75 * (pos > 1 ? 1 : pos));
  const rev = idle + (red - idle) * 0.35 * throttle;
  const target = s < 0.6 ? Math.max(rev, idle + (red - idle) * 0.25 * pos) : base;
  // devir hızla değişmez ama düzgün izler (ses/gösterge): 24/sn
  v.rpm += (target - v.rpm) * Math.min(1, 24 * h);
  if (v.shiftT > 0) v.rpm = Math.max(idle, v.rpm - 0.18 * (v.shiftT / SHIFT_DIP_SEC));
  return v;
}
