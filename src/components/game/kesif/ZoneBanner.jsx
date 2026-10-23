import React, { memo, useEffect, useState } from 'react';
import { toastDuration } from './toastTiming.js';
import { LuAward, LuCompass, LuCrown, LuGem, LuLightbulb, LuMapPin, LuPuzzle, LuScrollText, LuSparkles, LuStar, LuTimer, LuZap, LuSwords } from 'react-icons/lu';

const KIND_ICON = {
  zone: LuMapPin,
  unlock: LuSparkles,
  puzzle: LuPuzzle,
  crystal: LuGem,
  boss: LuSwords,
  achievement: LuAward,
  ability: LuZap,
  parkour: LuTimer,
  discover: LuCompass,
  quest: LuScrollText,
  reward: LuStar,
  info: LuCrown,
  hint: LuLightbulb,
};

const Toast = memo(function Toast({ item, onDismiss, touch = false, a11y = false }) {
  const ms = toastDuration(item, { touch, a11y });
  const id = item.id;
  useEffect(() => {
    const t = setTimeout(() => onDismiss && onDismiss(id), ms);
    return () => clearTimeout(t);
  }, [id, ms, onDismiss]);
  const Icon = KIND_ICON[item.kind] || LuStar;
  return (
    <div className="kx-toast" data-kind={item.kind} data-quiet={item.quiet ? '1' : '0'} data-no-tap onClick={touch ? () => onDismiss && onDismiss(item.id) : undefined}>
      <span className="kx-toast-ico" aria-hidden="true">
        <Icon />
      </span>
      <span className="kx-toast-txt">
        <strong>{item.text}</strong>
        {item.sub ? <span>{item.sub}</span> : null}
      </span>
    </div>
  );
});

/**
 * Duyuru yığını (en çok 2, kesifAnnouncer sınırı). Dokunmatikte HUD'un üst-orta öbeğinde (`.kx-tc`) akışta durur
 * (düğme yayı/joystick/üst çubukla çakışmaz), dokununca kapanır; masaüstünde sol altta yüzer.
 */
export const ToastStack = memo(function ToastStack({ toasts, onDismiss, touch = false, a11y = false, live = false }) {
  const list = toasts || [];
  if (!list.length) return null;
  return (
    <div className="kx-toasts" data-touch={touch ? '1' : '0'} aria-live={live ? 'polite' : undefined} aria-atomic={live ? 'false' : undefined}>
      {list.map((t) => (
        <Toast key={t.id} item={t} onDismiss={onDismiss} touch={touch} a11y={a11y} />
      ))}
    </div>
  );
});

/**
 * Duyuru katmanı: (1) büyük "bölge girişi" başlığı — hudStore.banner {text,sub,until} — ve
 * (2) olay bildirimi yığını (bulmaca çözüldü, başarım, kristal…; kesifAnnouncer kuyruğundan).
 * Tüm içerik `aria-live="polite"` bölgesinde; hareket azaltmada animasyonlar CSS'te kapanır.
 */
const ZoneBanner = ({ banner, toasts, onDismiss, showToasts = true, touch = false, a11y = false }) => {
  const bannerKey = banner ? banner.text + '|' + (banner.sub || '') + '|' + (banner.until || 0) : '';
  const [expired, setExpired] = useState('');

  useEffect(() => {
    if (!banner || !banner.until) return undefined;
    const wait = Math.max(0, banner.until - Date.now());
    const t = setTimeout(() => setExpired(bannerKey), wait);
    return () => clearTimeout(t);
  }, [banner, bannerKey]);

  const showBanner = Boolean(banner) && expired !== bannerKey;

  return (
    <div className="kx-announce" aria-live="polite" aria-atomic="false">
      {showBanner && (
        <div className="kx-banner" key={bannerKey}>
          <span className="kx-banner-rule" aria-hidden="true" />
          <h2 className="kx-banner-title">{banner.text}</h2>
          {banner.sub ? <p className="kx-banner-sub">{banner.sub}</p> : null}
          <span className="kx-banner-rule" aria-hidden="true" />
        </div>
      )}
      {showToasts && <ToastStack toasts={toasts} onDismiss={onDismiss} touch={touch} a11y={a11y} />}
    </div>
  );
};

export default memo(ZoneBanner);
