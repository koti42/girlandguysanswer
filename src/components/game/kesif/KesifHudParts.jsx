import React, { memo } from 'react';
import {
  LuAnchor,
  LuAperture,
  LuChevronsUp,
  LuCloudFog,
  LuCloudRain,
  LuCloudSnow,
  LuHand,
  LuMapPin,
  LuMoon,
  LuSun,
  LuSunrise,
  LuSunset,
  LuTimer,
  LuWind,
} from 'react-icons/lu';
import { ABILITY_META, ABILITY_ORDER, fmtCoord, formatClock, parkourTier, parseHint, timeKind, weatherKind } from './kxHudUtils.js';

const R_RING = 15;
const C_RING = 2 * Math.PI * R_RING;

/**
 * Artı imleç: hedef blok varken genişler, uzak menzilli silahta halka+nokta olur, blok kırılırken
 * ilerleme halkası dolar. Hedef adı imlecin altında görünür (yalnız hedef varken).
 */
export const Crosshair = memo(function Crosshair({ target, ranged }) {
  const has = Boolean(target && (target.block !== null && target.block !== undefined));
  const prog = has && target.progress > 0 ? Math.min(1, target.progress) : 0;
  const mode = ranged ? 'ranged' : has ? 'target' : 'idle';
  return (
    <div className="kx-cross" data-mode={mode} aria-hidden="true">
      <svg viewBox="-20 -20 40 40" className="kx-cross-svg" focusable="false">
        {ranged ? (
          <>
            <circle className="kx-cross-ring" r="9" />
            <circle className="kx-cross-dot" r="1.6" />
            <path className="kx-cross-tick" d="M0 -16v-5M0 16v5M-16 0h-5M16 0h5" transform="scale(.8)" />
          </>
        ) : (
          <>
            <path className="kx-cross-tick" d="M0 -11v-6M0 11v6M-11 0h-6M11 0h6" />
            <circle className="kx-cross-dot" r="1.5" />
          </>
        )}
        {prog > 0 && (
          <circle
            className="kx-cross-prog"
            r={R_RING}
            transform="rotate(-90)"
            strokeDasharray={C_RING}
            strokeDashoffset={C_RING * (1 - prog)}
          />
        )}
      </svg>
      {has && target.name ? <span className="kx-cross-name">{target.name}</span> : null}
    </div>
  );
});

const TIME_ICON = { day: LuSun, night: LuMoon, sunset: LuSunset, sunrise: LuSunrise };
const WEATHER_ICON = { rain: LuCloudRain, snow: LuCloudSnow, fog: LuCloudFog };

/** Bölge/biyom/saat/koordinat çipi (sıkışık). */
export const InfoChip = memo(function InfoChip({
  zone, biome, time, weather, coords, depth, showCoords = true,
}) {
  const TI = TIME_ICON[timeKind(time)] || LuSun;
  const wk = weatherKind(weather);
  const WI = wk ? WEATHER_ICON[wk] : null;
  const coordTxt = coords ? 'X ' + fmtCoord(coords.x) + '  Y ' + fmtCoord(coords.y) + '  Z ' + fmtCoord(coords.z) : '';
  const depthTxt = depth && depth.band
    ? (depth.rel >= 0 ? 'Yükseklik +' + depth.rel : 'Derinlik ' + -depth.rel) + ' blok · ' + depth.band
    : '';
  return (
    <div className="kx-chip" role="group" aria-label="Konum bilgisi">
      <p className="kx-chip-zone">
        <LuMapPin aria-hidden="true" />
        <span>{zone && zone.name ? zone.name : 'Bilinmeyen diyar'}</span>
      </p>
      <p className="kx-chip-sub">
        {biome ? <span>{biome}</span> : null}
        <span className="kx-chip-time">
          <TI aria-hidden="true" /> {time || 'gündüz'}
        </span>
        {WI ? (
          <span className="kx-chip-time">
            <WI aria-hidden="true" /> {weather}
          </span>
        ) : null}
      </p>
      {showCoords && coordTxt ? (
        <p className="kx-chip-coords" aria-label={'Koordinatlar: ' + coordTxt}>
          {coordTxt}
        </p>
      ) : null}
      {depthTxt ? (
        <p className="kx-chip-depth" data-band={depth.key} aria-label={'Deniz seviyesine göre: ' + depthTxt}>
          {depthTxt}
        </p>
      ) : null}
    </div>
  );
});

/** Etkileşim ipucu satırı ("[E] Kol'u çek"). Dokunmatikte tuş yerine el simgesi. */
export const HintLine = memo(function HintLine({ hint, touch }) {
  const p = parseHint(hint);
  if (!p) return null;
  return (
    <p className="kx-hint" role="status">
      {touch ? <LuHand aria-hidden="true" className="kx-hint-hand" /> : p.key ? <kbd className="kx-kbd">{p.key}</kbd> : null}
      <span>{p.text}</span>
    </p>
  );
});

/** Elde tutulan eşya adı (kısa süre görünür). */
export const HeldToast = memo(function HeldToast({ text, k, ench = false }) {
  if (!text) return null;
  return (
    <p className="kx-held" data-ench={ench ? '1' : '0'} key={k} role="status">
      {text}
    </p>
  );
});

const ABILITY_ICON = { jump: LuChevronsUp, grapple: LuAnchor, glide: LuWind, portal: LuAperture };

/**
 * Açık yeteneklerin simgeleri (masaüstü). `status[key]` = { cooldown: 0..1 (kalan oran), charges, max }.
 * Dokunmatikte aynı bilgi TouchControls düğmelerinde gösterilir.
 */
export const AbilityBar = memo(function AbilityBar({ abilities, status }) {
  const list = ABILITY_ORDER.filter((k) => abilities && abilities[k]);
  if (!list.length) return null;
  return (
    <ul className="kx-abilities" aria-label="Yetenekler">
      {list.map((k) => {
        const m = ABILITY_META[k];
        const st = (status && status[k]) || null;
        const Icon = ABILITY_ICON[m.icon] || LuWind;
        const cd = st && typeof st.cooldown === 'number' ? Math.max(0, Math.min(1, st.cooldown)) : 0;
        const charges = st && typeof st.charges === 'number' ? st.charges : null;
        const max = st && typeof st.max === 'number' ? st.max : charges;
        const label = m.label + (m.key ? ' (' + m.key + ')' : '') + (cd > 0 ? ', bekleniyor' : ', hazır') + (charges !== null ? ', ' + charges + ' şarj' : '');
        return (
          <li key={k} className="kx-ab" data-ready={cd > 0 ? '0' : '1'} aria-label={label} title={m.hint}>
            <Icon aria-hidden="true" />
            {cd > 0 && <span className="kx-ab-cd" style={{ '--cd': cd }} aria-hidden="true" />}
            {m.key ? (
              <span className="kx-ab-key" aria-hidden="true">
                {m.key}
              </span>
            ) : null}
            {charges !== null && max > 0 ? (
              <span className="kx-ab-pips" aria-hidden="true">
                {Array.from({ length: max }, (_, i) => (
                  <i key={i} data-on={i < charges ? '1' : '0'} />
                ))}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
});

const SHAPES = {
  circle: <circle cx="8" cy="8" r="5.5" />,
  square: <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />,
  triangle: <path d="M8 2l6.2 11H1.8z" />,
  diamond: <path d="M8 1.5l6.5 6.5L8 14.5 1.5 8z" />,
  star: <path d="M8 1.5l1.9 4.1 4.5.5-3.3 3.1.9 4.4L8 11.3l-4 2.3.9-4.4L1.6 6.1l4.5-.5z" />,
};

/** Parkur: kademe (renk + şekil + ad), süre ve kontrol noktası. */
export const ParkourChip = memo(function ParkourChip({ parkour }) {
  if (!parkour) return null;
  const tier = parkourTier(parkour.difficulty);
  return (
    <div className="kx-parkour" role="group" aria-label={'Parkur, ' + tier.name + ' kademe'}>
      <span className="kx-parkour-tier" style={{ color: tier.color }}>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="currentColor">
          {SHAPES[tier.shape]}
        </svg>
        {tier.name}
      </span>
      <span className="kx-parkour-time">
        <LuTimer aria-hidden="true" />
        <span className="kx-sr">Süre </span>
        {formatClock(parkour.timer)}
      </span>
      <span className="kx-parkour-cp">Kontrol noktası {parkour.checkpoint}</span>
    </div>
  );
});

/** İnşa/harita modu ve uçuş durumu hapları. */
export const StatusPills = memo(function StatusPills({ mode, flying }) {
  if (mode === 'macera' && !flying) return null;
  return (
    <p className="kx-pills">
      {mode === 'insa' ? <span className="kx-pill">İnşa Modu</span> : null}
      {mode === 'harita' ? <span className="kx-pill">Topluluk Haritası</span> : null}
      {flying ? <span className="kx-pill kx-pill-fly">Uçuş</span> : null}
    </p>
  );
});

/** Hasar vinyeti: can düşünce kısa kırmızı kenar; can azken kalıcı hafif nabız. */
export const DamageVignette = memo(function DamageVignette({ hurtKey, amount, low }) {
  return (
    <div className="kx-vignette" data-low={low ? '1' : '0'} aria-hidden="true">
      {hurtKey > 0 && <span key={hurtKey} className="kx-vignette-hit" style={{ '--amt': 0.35 + amount * 0.65 }} />}
    </div>
  );
});

export const FpsChip = memo(function FpsChip({ fps }) {
  return (
    <p className="kx-fps" aria-label={'Saniyedeki kare: ' + fps}>
      {fps} FPS
    </p>
  );
});
