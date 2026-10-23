import React, { memo } from 'react';
import { LuCloudFog, LuCloudLightning, LuCloudRain, LuMapPin, LuMoon, LuOrbit, LuSun, LuSunrise, LuSunset } from 'react-icons/lu';
import { fmtCoord, timeKind } from '../kxHudUtils.js';
import { GATE_TEXT, parseTimeLabel } from '../../../../game/kesif/sim/city/cityHudData.js';
import LightShape from './LightShape.jsx';
import './cityHud.css';

/*
 * Neon Meridyen HUD parçaları (cityhud, minimal dilim — sözleşme §12). Veri: hudStore (dim, district, time, weather, city.light, portals.mode).
 *
 *   CityHud         bölge çipi (ad + hava simgesi + saat + koordinat) ve ışık ipucu çipi; yalnız hud.dim === 'neon' iken çizilir (yoksa null).
 *                   Üst-sol sütunda (.kx-tl-col) InfoChip'in yerine durur: aynı .kx-chip sınıfları → dokunmatik sıkışık kurallar otomatik geçerli.
 *   PortalModeChip  masaüstü: Portal Tabancası kipi + anahtar ipucu (T). Dokunmatikte aynı iş "Boyut kipi" düğmesindedir (TouchControls).
 * Renk tek başına bilgi taşımaz: ışık ipucu = şekil + metin + uzaklık, hava = simge + (geniş ekranda) kelime, kip = simge + kelime.
 */
const TIME_ICON = { day: LuSun, night: LuMoon, sunset: LuSunset, sunrise: LuSunrise };
const WEATHER = Object.freeze({
  yağmur: { Icon: LuCloudRain, label: 'Yağmur yağıyor' },
  fırtına: { Icon: LuCloudLightning, label: 'Fırtına var' },
  duman: { Icon: LuCloudFog, label: 'Hava dumanlı' },
});
const NEAR_BLOCKS = 12;

export const LightHintChip = memo(function LightHintChip({ light }) {
  if (!light) return null;
  const d = Math.round(light.dist);
  return (
    <div className="kx-chip kx-clight" data-testid="city-light" data-kind={light.kind} data-near={light.dist <= NEAR_BLOCKS ? '1' : '0'}>
      <LightShape kind={light.kind} />
      <span className="kx-clight-txt">{light.text}</span>
      <span className="kx-clight-d" aria-hidden="true">
        {d} m
      </span>
      {/* canlı bölge yalnız ipucu belirince/değişince okunur (uzaklık sayısı okunmaz) */}
      <span className="kx-sr" role="status">
        {light.text} yakında.
      </span>
    </div>
  );
});

const CityHud = ({ hud, showCoords = true }) => {
  if (!hud || hud.dim !== 'neon') return null;
  const clock = parseTimeLabel(hud.time);
  const TI = TIME_ICON[timeKind(hud.time)] || LuSun;
  const wx = WEATHER[hud.weather] || null;
  const light = hud.city ? hud.city.light : null;
  const c = hud.coords;
  const coordTxt = showCoords && c ? 'X ' + fmtCoord(c.x) + '  Y ' + fmtCoord(c.y) + '  Z ' + fmtCoord(c.z) : '';
  return (
    <>
      <div className="kx-chip kx-cchip" role="group" aria-label="Konum bilgisi" data-testid="city-chip" data-district={hud.city ? hud.city.district : ''}>
        <p className="kx-chip-zone">
          <LuMapPin aria-hidden="true" />
          <span>{hud.district || 'Neon Meridyen'}</span>
          {wx ? (
            <span className="kx-cwx" data-wx={hud.weather} role="img" aria-label={wx.label} title={wx.label} data-testid="city-weather">
              <wx.Icon aria-hidden="true" />
            </span>
          ) : null}
        </p>
        <p className="kx-chip-sub">
          <span className="kx-chip-time kx-cclock" data-testid="city-clock">
            <TI aria-hidden="true" />
            {clock.clock ? <b className="kx-cclock-t">{clock.clock}</b> : null}
            <span className="kx-cclock-p">{clock.phase}</span>
          </span>
          {wx ? <span className="kx-chip-time">{hud.weather}</span> : null}
        </p>
        {coordTxt ? (
          <p className="kx-chip-coords" aria-label={'Koordinatlar: ' + coordTxt}>
            {coordTxt}
          </p>
        ) : null}
      </div>
      <LightHintChip light={light} />
    </>
  );
};

/** Portal Tabancası kipi çipi (yalnız masaüstü; tabanca yoksa çizilmez). */
export const PortalModeChip = memo(function PortalModeChip({ portals, dim }) {
  if (!portals || !portals.held) return null;
  const on = portals.mode === 'boyut';
  const hint = on ? (dim === 'neon' ? GATE_TEXT.modeInCityHint : GATE_TEXT.modeOnHint) : GATE_TEXT.modeOffHint;
  const short = on ? (dim === 'neon' ? GATE_TEXT.shortInCity : GATE_TEXT.shortOn) : '';
  return (
    <div
      className="kx-cmode"
      data-testid="portal-mode"
      data-mode={on ? 'boyut' : 'normal'}
      title={GATE_TEXT.tooltip + '. ' + hint}
      role="group"
      aria-label={'Portal Tabancası: ' + (on ? GATE_TEXT.modeLabelOn : GATE_TEXT.modeLabelOff) + '. ' + hint}
    >
      <LuOrbit aria-hidden="true" />
      <span className="kx-cmode-name" aria-hidden="true">
        {on ? GATE_TEXT.modeLabelOn : GATE_TEXT.modeLabelOff}
      </span>
      {short ? (
        <span className="kx-cmode-hint" aria-hidden="true">
          {short}
        </span>
      ) : null}
      <kbd className="kx-kbd" aria-hidden="true">
        {GATE_TEXT.keyHint}
      </kbd>
    </div>
  );
});

export default memo(CityHud);
