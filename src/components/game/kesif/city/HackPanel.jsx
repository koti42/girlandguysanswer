import React, { memo, useCallback, useEffect, useRef } from 'react';
import PanelShell from '../PanelShell.jsx';
import { CooldownBar } from './LockPanel.jsx';
import { liveTextOf } from './lockPanelUtils.js';
import './lockPanel.css';

/*
 * Neon Meridyen ÇÖZME TERMİNALİ paneli (locks_hack; sözleşme §1.9, §8): üç saf mini oyunun arayüzü — Rün Dizisi (Simon türü), Renk Kolları (bağlantılı kol
 * bulmacası), Zar Mantığı (zar çıkarım bulmacası; kumar/şans yok). Veri: systems/cityLocks `api.getLockPanel()` ({type:'hack', game, phase, view, …}).
 *
 *   • Erişilebilirlik: renk + ŞEKİL + ses (rünler), kol adı + şekil + yazılı konum, zar sayısı + yazılı ipucu ✓/✗. Zaman baskısı kademe 0–1'de yok;
 *     erişilebilirlik modunda süreler ×2 ve dizi metni ekran okuyucuya açılır. "Başla"ya basana dek hiçbir süre işlemez.
 *   • Klavye: rünler 1–4, kollar 1–6, zarlar ↑/↓ ve 1–4 (zar seç), R = tekrar/sıfırla, Enter = doğrula. Dokunmatik: tüm hedefler ≥ 44 px.
 *   • Yanlış/başarısız deneme 20 sn soğuma getirir (kalıcı değil); soğumada düğmeler pasiftir.
 */
export function Shape({ kind, size = 28 }) {
  const common = { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor' };
  switch (kind) {
    case 'daire':
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="12" />
        </svg>
      );
    case 'ucgen':
      return (
        <svg {...common}>
          <polygon points="16,3 29,28 3,28" />
        </svg>
      );
    case 'kare':
      return (
        <svg {...common}>
          <rect x="5" y="5" width="22" height="22" rx="2" />
        </svg>
      );
    case 'yildiz':
      return (
        <svg {...common}>
          <polygon points="16,2 20,12 30,12 22,19 25,30 16,23 7,30 10,19 2,12 12,12" />
        </svg>
      );
    case 'besgen':
      return (
        <svg {...common}>
          <polygon points="16,3 29,12 24,28 8,28 3,12" />
        </svg>
      );
    case 'altigen':
      return (
        <svg {...common}>
          <polygon points="9,4 23,4 30,16 23,28 9,28 2,16" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="6" />
        </svg>
      );
  }
}

const TimerBar = ({ view }) => {
  if (!view || !(view.timeMax > 0)) return null;
  const pct = Math.max(0, Math.min(100, (view.timeLeft / view.timeMax) * 100));
  return (
    <div className="klh-timer" data-testid="hack-timer">
      <div
        className="klk-cool-bar"
        role="progressbar"
        aria-label="Kalan süre"
        aria-valuemin={0}
        aria-valuemax={Math.round(view.timeMax)}
        aria-valuenow={Math.ceil(view.timeLeft)}
        aria-valuetext={Math.ceil(view.timeLeft) + ' saniye'}
      >
        <span style={{ width: pct + '%' }} />
      </div>
    </div>
  );
};

const SimonView = memo(function SimonView({ snap, onInput }) {
  const v = snap.view;
  const canPress = v.phase === 'input' && snap.status === 'bekliyor';
  return (
    <div className="klh-simon" data-phase={v.phase}>
      <div className="klh-runes" role="group" aria-label="Rünler">
        {snap.symbols.map((s) => (
          <button
            key={s.id}
            type="button"
            className="klh-rune"
            style={{ '--c': s.color }}
            data-lit={v.lit === s.id ? '1' : '0'}
            data-last={v.last === s.id ? (v.lastOk ? 'ok' : 'bad') : ''}
            disabled={!canPress}
            aria-label={s.name + ', tuş ' + s.key}
            onClick={() => onInput({ op: 'press', index: s.id })}
            data-testid={'rune-' + s.id}
          >
            <Shape kind={s.shape} size={36} />
            <span className="klh-key" aria-hidden="true">
              {s.key}
            </span>
          </button>
        ))}
      </div>
      <p className="klh-status" data-testid="simon-status">
        Tur {v.round} / {v.len} ·{' '}
        {v.phase === 'show' ? 'İzle' : v.phase === 'input' ? 'Sıra sende (' + (v.inputIdx + 1) + '. rün)' : v.phase === 'won' ? 'Çözüldü' : 'Bozuldu'}
      </p>
      <TimerBar view={v.phase === 'input' ? v : null} />
      <button
        type="button"
        className="klk-btn klk-wide"
        disabled={!canPress || v.replays === 0}
        onClick={() => onInput({ op: 'replay' })}
        data-testid="simon-replay"
      >
        Diziyi tekrar göster {v.replays >= 0 ? '(' + v.replays + ' hak)' : ''}
      </button>
      {v.sequenceText ? (
        <p className="klk-sr" data-testid="simon-seqtext">
          Dizi: {v.sequenceText}
        </p>
      ) : null}
    </div>
  );
});

const LeversView = memo(function LeversView({ snap, onInput }) {
  const v = snap.view;
  const canPress = v.phase === 'run' && snap.status === 'bekliyor';
  return (
    <div className="klh-levers" data-phase={v.phase}>
      <ul className="klh-lever-list">
        {v.levers.map((l) => (
          <li key={l.index} className="klh-lever" data-ok={l.ok ? '1' : '0'} style={{ '--c': l.color }}>
            <span className="klh-lever-id">
              <Shape kind={l.shape} size={26} />
              <span className="klh-lever-name">{l.name}</span>
            </span>
            <span className="klh-lever-pos">
              Şimdi: <b>{l.posLabel}</b> · Hedef: <b>{l.targetLabel}</b> <span aria-hidden="true">{l.ok ? '✓' : '✗'}</span>
              <span className="klk-sr">{l.ok ? ' (tamam)' : ' (henüz değil)'}</span>
            </span>
            <button
              type="button"
              className="klk-btn klh-pull"
              disabled={!canPress}
              onClick={() => onInput({ op: 'press', index: l.index })}
              aria-label={l.name + ' kolunu çek. Şu an ' + l.posLabel + ', hedef ' + l.targetLabel + '. ' + l.linkText}
              data-testid={'lever-' + l.index}
            >
              Çek <span aria-hidden="true">({l.index + 1})</span>
            </button>
            <small className="klh-link">{l.linkText}</small>
          </li>
        ))}
      </ul>
      <p className="klh-status" data-testid="levers-status">
        {v.okCount} / {v.levers.length} kol hedefte · Çekme: {v.used}
        {v.budget >= 0 ? ' / ' + v.budget : ''}
      </p>
      <TimerBar view={v} />
      <button type="button" className="klk-btn klk-wide" disabled={!canPress} onClick={() => onInput({ op: 'reset' })} data-testid="levers-reset">
        Sıfırla (R)
      </button>
    </div>
  );
});

const DiceView = memo(function DiceView({ snap, onInput }) {
  const v = snap.view;
  const canAct = v.phase === 'run' && snap.status === 'bekliyor';
  const onDieKey = (e, i) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onInput({ op: 'step', index: i, dir: 1 });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onInput({ op: 'step', index: i, dir: -1 });
    }
  };
  return (
    <div className="klh-dice" data-phase={v.phase}>
      <div className="klh-dice-row" role="group" aria-label="Zarlar">
        {v.dice.map((d) => (
          <div key={d.index} className="klh-die">
            <button
              type="button"
              className="klk-btn klh-step"
              disabled={!canAct}
              aria-label={d.index + 1 + '. zarı artır'}
              onClick={() => onInput({ op: 'step', index: d.index, dir: 1 })}
            >
              ▲
            </button>
            <button
              type="button"
              className="klh-face"
              disabled={!canAct}
              aria-label={d.label + '. Değiştirmek için dokun ya da yukarı aşağı ok kullan'}
              onClick={() => onInput({ op: 'step', index: d.index, dir: 1 })}
              onKeyDown={(e) => onDieKey(e, d.index)}
              data-testid={'die-' + d.index}
            >
              {d.value}
            </button>
            <button
              type="button"
              className="klk-btn klh-step"
              disabled={!canAct}
              aria-label={d.index + 1 + '. zarı azalt'}
              onClick={() => onInput({ op: 'step', index: d.index, dir: -1 })}
            >
              ▼
            </button>
            <span className="klh-die-no" aria-hidden="true">
              {d.index + 1}. zar
            </span>
          </div>
        ))}
      </div>
      <ul className="klh-clues" aria-label="İpuçları">
        {v.clues.map((c) => (
          <li key={c.index} className="klh-clue" data-ok={c.ok === null ? 'n' : c.ok ? '1' : '0'}>
            <span className="klh-clue-mark" aria-hidden="true">
              {c.ok === null ? '•' : c.ok ? '✓' : '✗'}
            </span>
            <span>{c.text}</span>
            {c.ok !== null ? <span className="klk-sr">{c.ok ? ' (sağlanıyor)' : ' (sağlanmıyor)'}</span> : null}
          </li>
        ))}
      </ul>
      <p className="klh-status" data-testid="dice-status">
        Kalan hak: {v.lives} / {v.maxLives}
      </p>
      <button type="button" className="klk-btn klk-go klk-wide" disabled={!canAct} onClick={() => onInput({ op: 'submit' })} data-testid="dice-submit">
        Doğrula
      </button>
    </div>
  );
});

const HackPanel = ({ snap, onInput, onClose, accessibility = false, reducedMotion = false }) => {
  const bodyRef = useRef(null);
  const onKeyDown = useCallback(
    (e) => {
      if (!snap || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (snap.phase === 'ready') {
        if (e.key === 'Enter' && e.target && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          onInput({ op: 'start' });
        }
        return;
      }
      if (snap.game === 'simon') {
        if (e.key >= '1' && e.key <= '4') {
          e.preventDefault();
          onInput({ op: 'press', index: Number(e.key) - 1 });
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          onInput({ op: 'replay' });
        }
      } else if (snap.game === 'levers') {
        if (e.key >= '1' && e.key <= '6') {
          e.preventDefault();
          onInput({ op: 'press', index: Number(e.key) - 1 });
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          onInput({ op: 'reset' });
        }
      } else if (snap.game === 'dice') {
        if (e.key === 'Enter' && e.target && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          onInput({ op: 'submit' });
        } else if (e.key >= '1' && e.key <= '4') {
          const el = bodyRef.current && bodyRef.current.querySelector('[data-testid="die-' + (Number(e.key) - 1) + '"]');
          if (el) {
            e.preventDefault();
            el.focus();
          }
        }
      }
    },
    [snap, onInput],
  );

  const isReady = !!snap && snap.phase === 'ready';
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.focus({ preventScroll: true });
  }, [isReady]);

  if (!snap) return null;
  const cooling = snap.status === 'soguma';
  return (
    <PanelShell
      title={snap.name}
      subtitle={snap.short}
      onClose={onClose}
      accessibility={accessibility}
      reducedMotion={reducedMotion}
      testId="hack-panel"
      size="sm"
      className="klk-box"
    >
      <div className="klk klh" ref={bodyRef} tabIndex={-1} onKeyDown={onKeyDown} data-game={snap.game} data-phase={snap.phase} data-status={snap.status} data-reduced={reducedMotion ? '1' : '0'}>
        {snap.phase === 'ready' || (cooling && snap.phase !== 'play') ? (
          <div className="klh-ready">
            <ul className="klh-how">
              {snap.how.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {snap.accessibility ? <p className="klk-hint">Erişilebilirlik modu: süreler iki kat, dizi metni açık.</p> : null}
            <button
              type="button"
              className="klk-btn klk-go klk-wide"
              disabled={cooling || snap.status === 'cozuldu'}
              data-autofocus=""
              onClick={() => onInput({ op: 'start' })}
              data-testid="hack-start"
            >
              Başla
            </button>
          </div>
        ) : null}
        {snap.view && snap.phase !== 'ready' && snap.game === 'simon' ? <SimonView snap={snap} onInput={onInput} /> : null}
        {snap.view && snap.phase !== 'ready' && snap.game === 'levers' ? <LeversView snap={snap} onInput={onInput} /> : null}
        {snap.view && snap.phase !== 'ready' && snap.game === 'dice' ? <DiceView snap={snap} onInput={onInput} /> : null}
        <CooldownBar snap={snap} />
        {snap.status === 'cozuldu' ? (
          <p className="klk-ok" data-testid="lock-solved">
            ✓ {snap.message}
          </p>
        ) : snap.message ? (
          <p className="klk-msg">{snap.message}</p>
        ) : null}
        <p className="klk-sr" role="status" aria-live="polite" aria-atomic="true" data-testid="lock-live">
          {liveTextOf(snap)}
        </p>
      </div>
    </PanelShell>
  );
};

export default memo(HackPanel);
