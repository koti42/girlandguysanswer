import React, { memo, useCallback, useEffect, useState } from 'react';

/*
 * Radyo çipi: araçtayken seçili istasyon + parça bilgisi. Dokun = sonraki istasyon; ◂ ▸ düğmeleri (44 px) önceki/sonraki.
 * Sessiz istasyon "Radyo kapalı" gösterir (simge + metin; renk tek başına değil). Klavye: 1–6 (inputVehicle) ya da çipe odaklanıp Enter.
 * Veri: api.getVehicleRadio() {name, silent, title, artist, ticker} (~1 Hz yoklanır), eylem: api.nextRadioStation()/prevRadioStation().
 * Ekran okuyucu: yalnız İSTASYON DEĞİŞİNCE okunur (role="status"); parça yazısı okunmaz.
 *
 * Props: api, name (hud.city.radio; yedek), compact
 */
const POLL_MS = 1000;

function pickInfo(api) {
  let r = null;
  try {
    r = api && typeof api.getVehicleRadio === 'function' ? api.getVehicleRadio() : null;
  } catch {
    r = null;
  }
  if (!r) return null;
  return {
    name: r.name, silent: Boolean(r.silent), title: r.title || '', artist: r.artist || '', ticker: r.ticker || '',
  };
}
const same = (a, b) => (!a && !b) || (a && b && a.name === b.name && a.title === b.title && a.ticker === b.ticker && a.silent === b.silent);

const RadioChip = ({ api, name = '', compact = false }) => {
  const [info, setInfo] = useState(() => pickInfo(api));
  const [said, setSaid] = useState('');
  const [lastShown, setLastShown] = useState('');

  const read = useCallback(() => {
    const r = pickInfo(api);
    setInfo((prev) => (same(prev, r) ? prev : r));
  }, [api]);

  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) read();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [read]);

  const shown = info ? info.name : name;
  const silent = info ? info.silent : /^sessiz$/i.test(name);
  // istasyon değişince bir kez duyur (render sırasında durum ayarı: React'in önerdiği kalıp); ilk gösterim duyurulmaz
  if (shown && shown !== lastShown) {
    setLastShown(shown);
    if (lastShown) setSaid(/^sessiz$/i.test(shown) ? 'Radyo kapalı.' : 'Radyo: ' + shown + '.');
  }

  const next = () => {
    if (api && typeof api.nextRadioStation === 'function') api.nextRadioStation();
    read();
  };
  const prev = () => {
    if (api && typeof api.prevRadioStation === 'function') api.prevRadioStation();
    read();
  };
  if (!shown) return null;
  const line = silent ? 'Radyo kapalı' : info && info.title ? info.title + (info.artist ? ' · ' + info.artist : '') : '';
  return (
    <div className="kv-radio" role="group" aria-label="Radyo" data-testid="radio-chip" data-silent={silent ? '1' : '0'} data-compact={compact ? '1' : '0'} data-no-tap>
      <button type="button" className="kv-radio-arrow" aria-label="Önceki istasyon" onClick={prev} data-testid="radio-prev">
        <span aria-hidden="true">◂</span>
      </button>
      <button type="button" className="kv-radio-main" onClick={next} aria-label={'Radyo: ' + shown + '. Sonraki istasyon için dokun.'} data-testid="radio-next">
        <svg className="kv-radio-ico" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          {silent ? <path d="M3 8h3l4-3v10l-4-3H3zM13 7l4 6M17 7l-4 6" /> : <path d="M3 8h3l4-3v10l-4-3H3zM13 7c1.5 1.5 1.5 4.5 0 6M15.5 5c3 3 3 7 0 10" />}
        </svg>
        <span className="kv-radio-txt">
          <b>{shown}</b>
          {!compact && line ? <small>{line}</small> : null}
        </span>
      </button>
      <button type="button" className="kv-radio-arrow" aria-label="Sonraki istasyon" onClick={next} data-testid="radio-next2">
        <span aria-hidden="true">▸</span>
      </button>
      <span className="kv-sr" role="status" aria-live="polite">{said}</span>
    </div>
  );
};

export default memo(RadioChip);
