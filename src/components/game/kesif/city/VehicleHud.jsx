import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { LuTimer } from 'react-icons/lu';
import CityMinimap from './CityMinimap.jsx';
import RadioChip from './RadioChip.jsx';
import SpeedoGauge from './SpeedoGauge.jsx';
import TouchDriveControls from './TouchDriveControls.jsx';
import {
  announceFor, formatClock, loadPrefs, sanitizePrefs, savePrefs,
} from './vehicleHudUtils.js';
import { useShortLandscape } from './vehicleHudHooks.js';
import './vehicleHud.css';

/*
 * Sürüş HUD'u kapsayıcısı (KesifHud, hud.vehicle varken çizer). Parçalar: hız göstergesi, mini harita, radyo çipi, kiralık sayacı, masaüstü tuş ipuçları,
 * dokunmatikte sürüş denetimleri. Şehir içindeyken HER ZAMAN bağlıdır (yalnız ekran okuyucu bölgesi): araca binme/inme duyuruları buradan okunur.
 *
 * Props: hud (hudStore durumu), api (panel cephesi: getDriveInfo, getTrafficDots, getDriveMarker, getVehicleRadio, nextRadioStation, prevRadioStation),
 *        inputRef, actions ({pause, openMap}), touch, settings ({leftHanded, reducedMotion, accessibility, buttonOpacity}), onSettings(patch)
 */
const HINT_MS = 14000;

const KEY_HINTS = [
  ['W / S', 'gaz · fren'], ['A / D', 'direksiyon'], ['Boşluk', 'el freni'], ['Shift', 'nitro'], ['C', 'kamera'], ['H', 'korna'], ['R', 'yola'], ['F', 'in'], ['1–6', 'radyo'],
];

const VehicleHud = ({
  hud, api, inputRef, actions, touch = false, settings, onSettings,
}) => {
  const v = hud ? hud.vehicle : null;
  const [prefs, setPrefsState] = useState(() => loadPrefs());
  const [said, setSaid] = useState('');
  const [hintOn, setHintOn] = useState(false);
  const prev = useRef(null);
  const flip = useRef(false);
  const reduced = Boolean(settings && (settings.reducedMotion || settings.accessibility));
  const shortLand = useShortLandscape();

  useEffect(() => {
    const msg = announceFor(prev.current, v);
    const entered = !prev.current && v;
    prev.current = v;
    if (msg) {
      flip.current = !flip.current;
      setSaid(msg + (flip.current ? '​' : ''));
    }
    if (entered) setHintOn(true);
    // yalnız geçişlerde (rent/slow eşikleri dahil) çalışır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v ? v.cls : null, v ? v.slow : null, v ? (v.rent > 0 && v.rent <= 60 ? 1 : 0) : null]);

  useEffect(() => {
    if (!hintOn) return undefined;
    const id = setTimeout(() => setHintOn(false), HINT_MS);
    return () => clearTimeout(id);
  }, [hintOn]);

  const onPrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const next = sanitizePrefs(Object.assign({}, p, patch));
      savePrefs(next);
      return next;
    });
  }, []);
  const onLeft = useCallback((on) => {
    if (onSettings) onSettings({ leftHanded: Boolean(on) });
  }, [onSettings]);

  const live = (
    <p className="kv-sr" role="status" aria-live="polite" data-testid="vehicle-live">
      {said}
    </p>
  );
  if (!v) return live;

  const rentSoon = v.rent > 0 && v.rent <= 60;
  return (
    <div className="kv-root" data-testid="vehicle-hud" data-touch={touch ? '1' : '0'} data-calm={reduced ? '1' : '0'} data-left={settings && settings.leftHanded ? '1' : '0'}>
      {live}
      <div className="kv-map-slot kx-hide-ui">
        <CityMinimap api={api} size={touch ? (shortLand ? 100 : 112) : 140} onOpen={actions && actions.openMap} />
      </div>
      <div className="kv-radio-slot kx-hide-ui">
        <RadioChip api={api} name={hud && hud.city ? hud.city.radio : ''} compact={touch} />
      </div>
      {v.rent > 0 ? (
        <div className="kv-rent kx-hide-ui" data-testid="rent-chip" data-soon={rentSoon ? '1' : '0'} role="group" aria-label={'Kiralık araç, kalan süre ' + formatClock(v.rent)}>
          <LuTimer aria-hidden="true" />
          <b aria-hidden="true">{formatClock(v.rent)}</b>
          <span aria-hidden="true">{rentSoon ? 'Süre doluyor' : 'Kiralık'}</span>
        </div>
      ) : null}
      <div className="kv-gauge-slot kx-hide-ui">
        <SpeedoGauge vehicle={v} compact={touch} reducedMotion={reduced} />
      </div>
      {!touch && hintOn && prefs.hints ? (
        <div className="kv-keys kx-hide-ui" data-testid="drive-keys" aria-hidden="true">
          {KEY_HINTS.map(([k, t]) => (
            <span key={k}>
              <kbd className="kx-kbd">{k}</kbd> {t}
            </span>
          ))}
        </div>
      ) : null}
      {touch ? (
        <TouchDriveControls inputRef={inputRef} cls={v.cls} actions={actions} settings={settings} prefs={prefs} onPrefs={onPrefs} onLeftHanded={onLeft} />
      ) : null}
    </div>
  );
};

export default memo(VehicleHud);
