import React, { memo } from 'react';
import { LuDrumstick } from 'react-icons/lu';
import { bubbleStates, iconStates } from './kxHudUtils.js';

const HEART_PATH =
  'M12 21.2C5.2 15.8 2 12.2 2 8.2 2 5 4.4 2.6 7.3 2.6c1.9 0 3.7 1 4.7 2.7 1-1.7 2.8-2.7 4.7-2.7C19.6 2.6 22 5 22 8.2c0 4-3.2 7.6-10 13z';

const Heart = memo(function Heart({ state }) {
  return (
    <span className="kx-ico kx-heart" data-state={state} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="kx-ico-bg" focusable="false">
        <path d={HEART_PATH} />
      </svg>
      {state !== 'empty' && (
        <svg viewBox="0 0 24 24" className="kx-ico-fg" focusable="false">
          <path d={HEART_PATH} />
        </svg>
      )}
    </span>
  );
});

const Food = memo(function Food({ state }) {
  return (
    <span className="kx-ico kx-food" data-state={state} aria-hidden="true">
      <LuDrumstick className="kx-ico-bg" />
      {state !== 'empty' && <LuDrumstick className="kx-ico-fg" />}
    </span>
  );
});

const Bubble = memo(function Bubble({ state }) {
  return <span className="kx-bubble" data-state={state} aria-hidden="true" />;
});

/**
 * Can (kalpler), açlık (yemek simgeleri) ve — suda — oksijen baloncukları.
 * Her grup `role="meter"` ile ekran okuyucuya sayısal değer verir. Simge rengine ek olarak dolu/yarım/boş
 * biçimi de farklıdır (yalnız renge bağlı değil).
 */
const KesifVitals = ({ hp, maxHp, hunger, oxygen, showOxygen, low }) => {
  const hearts = iconStates(hp, maxHp, 20);
  const food = iconStates(hunger, 20, 10);
  const bubbles = showOxygen ? bubbleStates(oxygen) : null;
  const hpTxt = Math.ceil(hp) + ' / ' + Math.ceil(maxHp);
  return (
    <div className="kx-vitals">
      {bubbles && (
        <div className="kx-vrow kx-vrow-oxygen" role="meter" aria-label="Oksijen" aria-valuemin={0} aria-valuemax={15} aria-valuenow={Math.round(Math.min(15, oxygen))} aria-valuetext={Math.round(Math.min(15, oxygen)) + ' saniye nefes'}>
          {bubbles.map((s, i) => (
            <Bubble key={i} state={s} />
          ))}
        </div>
      )}
      <div className="kx-vrow-main">
        <div className="kx-vrow" data-low={low ? '1' : '0'} role="meter" aria-label="Can" aria-valuemin={0} aria-valuemax={Math.ceil(maxHp)} aria-valuenow={Math.ceil(hp)} aria-valuetext={hpTxt}>
          {hearts.map((s, i) => (
            <Heart key={i} state={s} />
          ))}
        </div>
        <div className="kx-vrow kx-vrow-food" role="meter" aria-label="Açlık" aria-valuemin={0} aria-valuemax={20} aria-valuenow={Math.ceil(hunger)} aria-valuetext={Math.ceil(hunger) + ' / 20'}>
          {food.map((s, i) => (
            <Food key={i} state={s} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default memo(KesifVitals);
