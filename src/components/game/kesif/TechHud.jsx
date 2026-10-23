import React, { memo } from 'react';
import {
  LuBatteryCharging, LuNavigation2, LuRadar, LuRocket, LuShield, LuZap,
} from 'react-icons/lu';
import { arrowDeg, chargeLevel, formatRate, pingText } from './panelTechUtils.js';

/*
 * KEŞİF HUD — teknoloji parçaları (macera): enerji ağı çipi, çubuktaki şarj/yakıt/kalkan/portal göstergeleri, tarayıcı yön okları.
 * Hepsi hud.energy / jetpack / charge / shield / portals / scanner alanlarını okur (null → çizilmez). Renk her zaman yüzde metniyle
 * birlikte (renk körlüğü); portal: mavi = DÜZ halka, turuncu = ÇİZGİLİ halka. `calm`: hareket azaltma (nabız/animasyon yok).
 */

const pct = (f) => Math.max(0, Math.min(100, Math.round((Number(f) || 0) * 100)));

const Meter = ({ fraction, kind, label, text, testId, extra, calm, thrusting }) => {
  const p = pct(fraction);
  const level = chargeLevel(fraction);
  return (
    <div className="kx-tech-pill" data-kind={kind} data-level={level} data-thrust={thrusting ? '1' : '0'} data-calm={calm ? '1' : '0'} data-testid={testId}>
      <span className="kx-tech-ico" aria-hidden="true">
        {kind === 'jetpack' ? <LuRocket /> : kind === 'shield' ? <LuShield /> : <LuBatteryCharging />}
      </span>
      <span className="kx-tech-label">{label}</span>
      <span className="kx-tech-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-valuetext={text}>
        <span className="kx-tech-fill" style={{ width: p + '%' }} />
      </span>
      <span className="kx-tech-val" aria-hidden="true">{p}%</span>
      {extra ? <span className="kx-tech-extra" aria-hidden="true">{extra}</span> : null}
      {level === 'crit' ? <b className="kx-tech-warn" aria-hidden="true">{kind === 'jetpack' ? 'Boş' : 'Düşük'}</b> : null}
    </div>
  );
};

const PortalDot = ({ color, open }) => (
  <span className={`kx-pdot kx-pdot-${color}${open ? ' is-open' : ''}`} aria-hidden="true">
    <i />
  </span>
);

/** Çubuktaki cihazların şarj/yakıt göstergeleri (alt blok, mana çubuğunun üstünde). */
export const TechStrip = memo(function TechStrip({
  jetpack, charge, shield, portals, calm = false,
}) {
  const showCharge = !!(charge && !/jetpack|portal_tabancası/.test(charge.item));
  if (!jetpack && !showCharge && !shield && !portals) return null;
  return (
    <div className="kx-tech" role="group" aria-label="Teknoloji göstergeleri" data-testid="tech-strip">
      {jetpack ? (
        <Meter
          kind="jetpack"
          label="Yakıt"
          fraction={jetpack.fraction}
          thrusting={jetpack.thrusting}
          calm={calm}
          testId="hud-jetpack"
          text={`Jetpack yakıtı yüzde ${pct(jetpack.fraction)}${jetpack.cells > 0 ? `, ${jetpack.cells} enerji hücresi` : ', enerji hücresi yok'}`}
          extra={jetpack.cells > 0 ? `Hücre ×${jetpack.cells}` : null}
        />
      ) : null}
      {showCharge ? (
        <Meter kind="charge" label={charge.name || 'Şarj'} fraction={charge.fraction} calm={calm} testId="hud-charge" text={`${charge.name} şarjı yüzde ${pct(charge.fraction)}`} />
      ) : null}
      {shield ? (
        <Meter kind="shield" label="Kalkan" fraction={shield.fraction} calm={calm} testId="hud-shield" text={`Enerji kalkanı yüzde ${pct(shield.fraction)}, ${shield.pieces} parça`} />
      ) : null}
      {portals ? (
        <div className="kx-tech-pill kx-tech-portals" data-kind="portal" data-level={portals.held && !portals.canFire ? 'crit' : 'ok'} data-testid="hud-portals">
          <span className="kx-tech-label">Portal</span>
          <span
            className="kx-pdots"
            role="img"
            aria-label={`Mavi portal ${portals.mavi ? 'açık' : 'kapalı'}, turuncu portal ${portals.turuncu ? 'açık' : 'kapalı'}`}
          >
            <PortalDot color="mavi" open={portals.mavi} />
            <PortalDot color="turuncu" open={portals.turuncu} />
          </span>
          {portals.held ? (
            <span className="kx-tech-val" data-testid="hud-portal-ammo">
              {portals.charge}/{portals.max}
              <small>{portals.cells > 0 ? ` · Hücre ×${portals.cells}` : ''}</small>
            </span>
          ) : null}
          {portals.held && !portals.canFire ? <b className="kx-tech-warn">Hücre gerekli</b> : null}
        </div>
      ) : null}
    </div>
  );
});

/** Yakındaki makinenin enerji ağı (8 blok): depo ve net üretim. */
export const EnergyChip = memo(function EnergyChip({ energy }) {
  if (!energy) return null;
  const store = energy.max > 0 ? `${energy.value}/${energy.max} EU` : 'pil yok';
  const level = !energy.live && !energy.standby ? 'dead' : energy.net < -0.01 && energy.value <= 0 ? 'short' : 'ok';
  return (
    <p className="kx-energy" data-level={level} role="status" aria-label={`Enerji ağı: ${store}, üretim ${energy.gen}, tüketim ${energy.use} EU/sn`} data-testid="hud-energy">
      <LuZap aria-hidden="true" />
      <span>{store}</span>
      <i aria-hidden="true">{formatRate(energy.net)}</i>
    </p>
  );
});

/** Tarayıcı: en yakın işaretler için yön oku + ad + mesafe (üst orta); tarama zamanlayıcısı. */
export const ScannerRadar = memo(function ScannerRadar({ scanner, calm = false }) {
  if (!scanner) return null;
  const list = scanner.pings.slice(0, 4);
  const cp = Math.round((scanner.charge / scanner.max) * 100);
  return (
    <div className="kx-radar" role="group" aria-label="Tarayıcı" data-calm={calm ? '1' : '0'} data-empty={scanner.empty ? '1' : '0'} data-testid="hud-scanner">
      <p className="kx-radar-head">
        <LuRadar aria-hidden="true" />
        <span>{scanner.empty ? 'Şarj bitti' : list.length ? `${list.length}+ hedef` : `Tarama ${Math.ceil(scanner.nextIn)} sn`}</span>
        <i aria-hidden="true">{cp}%</i>
      </p>
      {list.length ? (
        <ul className="kx-radar-list">
          {list.map((p, i) => (
            <li
              key={`${p.kind}-${i}-${p.dist}`}
              className="kx-ping"
              data-type={p.type}
              data-hostile={p.hostile ? '1' : '0'}
              style={{ '--kx-ping': '#' + (p.color >>> 0).toString(16).padStart(6, '0') }}
              aria-label={pingText(p)}
              data-testid="hud-ping"
            >
              <span className="kx-ping-arrow" style={{ transform: `rotate(${arrowDeg(p, scanner.heading)}deg)` }} aria-hidden="true">
                <LuNavigation2 />
              </span>
              <span className="kx-ping-name">{p.name}</span>
              <b>{Math.round(p.dist)} m</b>
              <small aria-hidden="true">{p.dy > 3 ? '▲' : p.dy < -3 ? '▼' : '●'}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
