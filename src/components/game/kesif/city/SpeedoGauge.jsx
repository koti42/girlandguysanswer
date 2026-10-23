import React, { memo } from 'react';
import { arcFraction, gearLabel, speedoMaxKmh } from './vehicleHudUtils.js';
import { useSlowValue } from './vehicleHudHooks.js';

/*
 * Hız göstergesi (sürüş HUD'u): 270° yay + büyük km/sa sayısı, vites, nitro çubuğu (10 dilim: şekil + yüzde) ve kayma/yükleniyor bayrakları.
 * Renk tek başına bilgi taşımaz: kırmızı bölge taralı (kesikli), nitro dilimli + yüzde, bayraklar simge + metin.
 * Ekran okuyucu: role="img" aria-label="Hız N kilometre saat" — ≤ 0.5 Hz güncellenir (sürekli okunmaz). Hareket azaltma: yay geçişi yok.
 *
 * Props: vehicle (hud.vehicle: {cls,kmh,gear,nitro,drift,boost?,slow?}), compact (telefon), reducedMotion
 */
const R = 78;
const CX = 100;
const CY = 100;
const START = 135;
const SWEEP = 270;

function polar(angDeg, r) {
  const a = (angDeg * Math.PI) / 180;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
}
function arcPath(a0, a1, r) {
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
}
const TRACK = arcPath(START, START + SWEEP, R);
const RED = arcPath(START + SWEEP * 0.82, START + SWEEP, R);
const SEGMENTS = 10;
const TICKS = [];
for (let i = 0; i <= 8; i++) {
  const a = START + (SWEEP * i) / 8;
  const [x0, y0] = polar(a, R - 9);
  const [x1, y1] = polar(a, R + 5);
  TICKS.push({ i, x0, y0, x1, y1 });
}

const SpeedoGauge = ({ vehicle, compact = false, reducedMotion = false }) => {
  const kmh = vehicle ? vehicle.kmh : 0;
  const slow = useSlowValue(kmh);
  if (!vehicle) return null;
  const max = speedoMaxKmh(vehicle.cls);
  const frac = arcFraction(kmh, max);
  const nitroPct = Math.round(vehicle.nitro * 100);
  const lit = Math.round(vehicle.nitro * SEGMENTS);
  const gear = gearLabel(vehicle.gear, vehicle.cls);
  return (
    <div
      className="kv-gauge"
      data-testid="gauge"
      data-compact={compact ? '1' : '0'}
      data-calm={reducedMotion ? '1' : '0'}
      data-boost={vehicle.boost ? '1' : '0'}
      data-drift={vehicle.drift ? '1' : '0'}
      role="img"
      aria-label={'Hız ' + Math.round(slow) + ' kilometre saat'}
    >
      <svg className="kv-gauge-svg" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <path d={TRACK} className="kv-arc-track" pathLength="100" />
        <path d={RED} className="kv-arc-red" />
        <path d={TRACK} className="kv-arc-value" pathLength="100" strokeDasharray={(frac * 100).toFixed(2) + ' 100'} />
        {TICKS.map((t) => (
          <line key={t.i} x1={t.x0} y1={t.y0} x2={t.x1} y2={t.y1} className="kv-tick" />
        ))}
      </svg>
      <div className="kv-gauge-core" aria-hidden="true">
        <b className="kv-speed" data-testid="gauge-kmh">{kmh}</b>
        <span className="kv-unit">km/sa</span>
      </div>
      <div className="kv-gear" aria-hidden="true" data-testid="gauge-gear" data-reverse={vehicle.gear < 0 ? '1' : '0'}>
        <small>Vites</small>
        <b>{gear}</b>
      </div>
      <div
        className="kv-nitro"
        role="meter"
        aria-label="Nitro"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={nitroPct}
        data-testid="gauge-nitro"
        data-on={vehicle.boost ? '1' : '0'}
      >
        <span className="kv-nitro-label" aria-hidden="true">
          {vehicle.boost ? '»» NİTRO' : 'NİTRO'} <i>{nitroPct}%</i>
        </span>
        <span className="kv-nitro-segs" aria-hidden="true">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <u key={i} data-lit={i < lit ? '1' : '0'} />
          ))}
        </span>
      </div>
      <div className="kv-flags" aria-hidden="true">
        {vehicle.drift ? (
          <span className="kv-flag" data-flag="drift" data-testid="gauge-drift">
            <svg viewBox="0 0 16 16" focusable="false"><path d="M2 12c3 0 4-8 8-8m0 0l-2-2m2 2l-2 2M6 14c2 0 3-4 6-4" /></svg>
            KAYMA
          </span>
        ) : null}
        {vehicle.slow ? (
          <span className="kv-flag" data-flag="slow" data-testid="gauge-slow">
            <svg viewBox="0 0 16 16" focusable="false"><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.4l2.2 1.4" /></svg>
            YÜKLENİYOR
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default memo(SpeedoGauge);
