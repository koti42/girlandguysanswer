import React, { memo } from 'react';
import { EFFECT_ICON_PATHS, effectColor, effectLabel, fmtClock } from './panelMagicUtils.js';

/*
 * Durum etkileri (iksir/büyü): her etki için simge (RENGE EK OLARAK ŞEKİL), kalan süre (m:ss), seviye rozeti ve
 * kalan oranı gösteren halka. Son 10 saniyede yavaş soluk (hareket azaltmada soluk yok). Ekran okuyucu için liste etiketli;
 * etki başlayınca/bitince oyun motoru ayrıca G.speak ile duyurur.
 * Props: effects [{key,name,icon,level,secondsLeft,fraction}], calm
 */
const Effect = memo(function Effect({ e, calm }) {
  const color = effectColor(e.icon);
  const ending = e.secondsLeft <= 10;
  return (
    <li
      className="kx-fx-item"
      data-icon={e.icon}
      data-ending={ending && !calm ? '1' : '0'}
      style={{ '--kx-fx': color, '--kx-fx-deg': Math.round(e.fraction * 360) + 'deg' }}
      aria-label={effectLabel(e)}
      title={e.name}
    >
      <span className="kx-fx-ring" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="kx-fx-ico" focusable="false">
          <path d={EFFECT_ICON_PATHS[e.icon] || EFFECT_ICON_PATHS.kalp} />
        </svg>
      </span>
      {e.level > 1 ? <span className="kx-fx-lvl" aria-hidden="true">{e.level}</span> : null}
      <span className="kx-fx-time" aria-hidden="true">{fmtClock(e.secondsLeft)}</span>
    </li>
  );
});

const StatusEffects = ({ effects, calm = false }) => {
  if (!effects || effects.length === 0) return null;
  return (
    <ul className="kx-fx" aria-label="Aktif etkiler" data-testid="status-effects">
      {effects.map((e) => (
        <Effect key={e.key} e={e} calm={calm} />
      ))}
    </ul>
  );
};

export default memo(StatusEffects);
