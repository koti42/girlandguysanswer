import React, {
  memo, useCallback, useEffect, useRef, useState,
} from 'react';
import {
  MEDAL_SHAPES, arrowDeg, bearingText, clockText, distText, timeText, trackerAria, trackerSig,
} from './missionUtils.js';
import './missions.css';

/*
 * Görev izleyici (HUD; Neon Meridyen). Etkin iş/yarış: başlık, adım etiketi, hedef oku (renk + yön metni), mesafe, süre, kapı sayacı, madalya hedefleri.
 * Yarış geri sayımı büyük rakamla (aria-live) gösterilir. Bitince sonuç kartı (≈12 sn; "Tamam" ile erken kapanır). Etkin görev yoksa hikâye görevi satırı
 * (hud.city.mission). Erişilebilirlik: ekran okuyucu metni yalnız etiket/geri sayım/kapı değişince güncellenir; ok yalnız süs (aria-hidden), yön metinle verilir;
 * düğmeler ≥ 44 px; reducedMotion/erişilebilirlik: animasyon yok. "Bırak" iki aşamalı (yanlışlıkla bırakmayı önler).
 *
 * Props: hud (hudStore: dim, city.mission), api ({getMissionTracker, abandonMission}), touch, accessibility, reducedMotion, pollMs
 */
const Arrow = memo(function Arrow({ bearing }) {
  const deg = arrowDeg(bearing);
  return (
    <svg className="kmt-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ transform: 'rotate(' + deg + 'deg)' }}>
      <path d="M12 2 L20 20 L12 15 L4 20 Z" fill="currentColor" stroke="#06101c" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
});

const Result = memo(function Result({ r, onDone }) {
  return (
    <section className="kmt kmt-result" data-ok={r.ok ? '1' : '0'} aria-label="Görev sonucu" data-testid="mission-result">
      <h3 className="kmt-title">
        {r.type === 'race' && r.ok ? <span className="kmt-medal" aria-hidden="true">{MEDAL_SHAPES[r.medal] || '○'}</span> : null}
        {r.title}
      </h3>
      <ul className="kmt-lines">
        {r.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <button type="button" className="kmt-btn" onClick={onDone}>Tamam</button>
    </section>
  );
});

const MissionTracker = ({
  hud, api, touch = false, accessibility = false, reducedMotion = false, pollMs = 200,
}) => {
  const readTracker = useCallback(() => {
    if (!api || typeof api.getMissionTracker !== 'function') return null;
    try {
      return api.getMissionTracker();
    } catch {
      return null;
    }
  }, [api]);
  const copyOf = (t) => (t ? { ...t, result: t.result ? { ...t.result } : null, target: t.target ? { ...t.target } : null } : null);
  const inCity = Boolean(hud && hud.dim === 'neon');
  const [vRaw, setV] = useState(() => (inCity ? copyOf(readTracker()) : null));
  const sig = useRef(trackerSig(vRaw));
  const [dismissed, setDismissed] = useState('');
  const [confirm, setConfirm] = useState(false);
  const timer = useRef(0);
  const calm = reducedMotion || accessibility;

  useEffect(() => {
    if (!inCity) return undefined;
    const read = () => {
      const t = readTracker();
      const s = trackerSig(t);
      if (s !== sig.current) {
        sig.current = s;
        setV(copyOf(t));
      }
    };
    const id = setInterval(read, pollMs);
    return () => clearInterval(id);
  }, [inCity, readTracker, pollMs]);
  const v = inCity ? vRaw : null;

  useEffect(() => () => clearTimeout(timer.current), []);

  const abandon = useCallback(() => {
    if (!confirm) {
      setConfirm(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setConfirm(false), 4000);
      return;
    }
    clearTimeout(timer.current);
    setConfirm(false);
    if (api && typeof api.abandonMission === 'function') api.abandonMission();
  }, [api, confirm]);

  if (!inCity) return null;
  const m = hud && hud.city ? hud.city.mission : null;
  const resKey = v && v.result ? v.result.title + '|' + v.result.time : '';

  if (v && v.kind && v.kind !== 'result') {
    const racing = v.kind === 'race';
    const running = v.stage === 'running';
    return (
      <section className="kmt" data-kind={v.kind} data-stage={v.stage} data-touch={touch ? '1' : '0'} data-calm={calm ? '1' : '0'} aria-label="Görev izleyici" data-testid="mission-tracker" data-no-tap>
        <header className="kmt-head">
          <h3 className="kmt-title">{v.title}</h3>
          <button type="button" className={'kmt-x' + (confirm ? ' kmt-x-ask' : '')} onClick={abandon} aria-label={confirm ? 'Emin misin? Görevi bırak' : 'Görevi bırak'} data-testid="mission-abandon">
            {confirm ? 'Bırak?' : '✕'}
          </button>
        </header>
        <p className="kmt-label">{v.label}</p>
        <div className="kmt-row">
          {v.target ? <Arrow bearing={v.bearing} /> : null}
          {v.dist > 0 ? <span className="kmt-dist">{distText(v.dist)}<span className="kmt-dir"> · {bearingText(v.bearing)}</span></span> : null}
          {v.timeLeft >= 0 && !racing ? <span className="kmt-time" data-low={v.timeLeft <= 20 ? '1' : '0'}>⏱ {clockText(v.timeLeft)}</span> : null}
          {racing && running ? <span className="kmt-time">⏱ {timeText(v.t)}</span> : null}
          {racing && running && v.gates > 0 ? <span className="kmt-gate">Kapı {Math.min(v.gate + 1, v.gates)}/{v.gates}</span> : null}
        </div>
        {racing && v.targets ? (
          <p className="kmt-medals">
            <span>{MEDAL_SHAPES[3]} {timeText(v.targets.gold)}</span>
            <span>{MEDAL_SHAPES[2]} {timeText(v.targets.silver)}</span>
            <span>{MEDAL_SHAPES[1]} {timeText(v.targets.bronze)}</span>
          </p>
        ) : null}
        {v.stage === 'countdown' && v.countdown > 0 ? <div className="kmt-count" aria-hidden="true" data-testid="mission-countdown">{v.countdown}</div> : null}
        <p className="kx-sr" role="status" aria-live="polite">{trackerAria(v)}</p>
      </section>
    );
  }

  if (v && v.result && dismissed !== resKey) {
    return (
      <>
        <Result r={v.result} onDone={() => setDismissed(resKey)} />
        <p className="kx-sr" role="status">{trackerAria({ result: v.result })}</p>
      </>
    );
  }

  if (m && m.title) {
    return (
      <section className="kmt kmt-quest" aria-label="Görev izleyici" data-testid="mission-quest" data-no-tap>
        <p className="kmt-qline"><span className="kmt-qmark" aria-hidden="true">◆</span> <b>{m.title}</b></p>
        {m.sub ? <p className="kmt-label">{m.sub}</p> : null}
      </section>
    );
  }
  return null;
};

export default memo(MissionTracker);
