import React, { memo, useCallback, useEffect, useRef } from 'react';
import PanelShell from '../PanelShell.jsx';
import { liveTextOf } from './lockPanelUtils.js';
import './lockPanel.css';

/*
 * Neon Meridyen KİLİT PANELİ (locks_hack; sözleşme §8, §12): kod kilidi (tuş takımı), kart okuyucu ve asansör kat seçici. Veri: systems/cityLocks
 * `api.getLockPanel()` düz JSON görüntüsü; girdi `onInput({op, …})` (systems/cityLocksPanel.js sözleşmesi). Mini oyunlar HackPanel.jsx'tedir.
 *
 *   • Klavye: 1–6 hane · Backspace sil · Delete temizle · Enter gir · Esc kapat (PanelShell). Asansör: 1–9 kat, Esc kapat.
 *   • Dokunmatik: tüm düğmeler ≥ 44 px; çoklu dokunma gerekmez.
 *   • Ekran okuyucu: tek aria-live bölgesi (geri sayım saniyeleri OKUNMAZ: soğumada yalnız "Kilit dinleniyor"); renk tek başına bilgi taşımaz
 *     (kart: renk + ad + "Var/Yok"; geri bildirim: ✓ doğru yer / ≈ yanlış yer ve sözcük).
 *   • Yanlış deneme 20 sn soğuma getirir; panel soğuma çubuğu + kalan süre gösterir (kalıcı kilit yok).
 */
const KEY_DIGITS = ['1', '2', '3', '4', '5', '6'];

export function CooldownBar({ snap }) {
  if (!snap || snap.status !== 'soguma') return null;
  const max = snap.cooldownMax || 20;
  const pct = Math.max(0, Math.min(100, (snap.cooldown / max) * 100));
  return (
    <div className="klk-cool" data-testid="lock-cooldown">
      <div
        className="klk-cool-bar"
        role="progressbar"
        aria-label="Kilit dinlenme süresi"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={snap.cooldown}
        aria-valuetext={snap.cooldown + ' saniye kaldı'}
      >
        <span style={{ width: pct + '%' }} />
      </div>
      <p className="klk-cool-txt" aria-hidden="true">
        Kilit dinleniyor: {snap.cooldown} sn
      </p>
    </div>
  );
}

const CodePad = memo(function CodePad({ snap, onInput }) {
  const slots = [];
  for (let i = 0; i < snap.digits; i++) slots.push(snap.entered[i]);
  const locked = snap.status !== 'bekliyor';
  return (
    <div className="klk-code">
      <div className="klk-slots" role="group" aria-label={snap.digits + ' haneli kod'} data-testid="lock-slots">
        {slots.map((v, i) => (
          <span key={i} className="klk-slot" data-filled={v ? '1' : '0'} aria-label={v ? i + 1 + '. hane ' + v : i + 1 + '. hane boş'}>
            {v || '•'}
          </span>
        ))}
      </div>
      {snap.feedback ? (
        <p className="klk-fb" data-testid="lock-feedback">
          <span aria-hidden="true">✓</span> Doğru yerde: <b>{snap.feedback.exact}</b>
          <span className="klk-fb-sep" aria-hidden="true">
            ·
          </span>
          <span aria-hidden="true">≈</span> Yanlış yerde: <b>{snap.feedback.present}</b>
        </p>
      ) : null}
      <div className="klk-keys" role="group" aria-label="Rakamlar 1 ile 6 arası">
        {KEY_DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            className="klk-key"
            disabled={locked}
            data-autofocus={d === '1' ? '' : undefined}
            aria-label={'Rakam ' + d}
            onClick={() => onInput({ op: 'digit', value: Number(d) })}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="klk-row">
        <button type="button" className="klk-btn" disabled={locked} onClick={() => onInput({ op: 'back' })} aria-label="Son haneyi sil">
          ⌫ Sil
        </button>
        <button type="button" className="klk-btn" disabled={locked} onClick={() => onInput({ op: 'clear' })}>
          Temizle
        </button>
        <button
          type="button"
          className="klk-btn klk-go"
          disabled={locked || snap.entered.length !== snap.digits}
          onClick={() => onInput({ op: 'submit' })}
          data-testid="lock-submit"
        >
          Gir
        </button>
      </div>
      <p className="klk-hint">{snap.hasClue ? 'İpucu: bu binada bir kod notu var.' : 'Not bulamazsan geri bildirimlerle kodu çıkarabilirsin.'}</p>
    </div>
  );
});

const CardReader = memo(function CardReader({ snap, onInput }) {
  const locked = snap.status !== 'bekliyor';
  return (
    <div className="klk-card">
      <p className="klk-need">
        Gerekli: <b>{snap.needName}</b> <span className="klk-dim">(daha yüksek kart da açar)</span>
      </p>
      <ul className="klk-cards" aria-label="Kartların">
        {snap.cards.map((c) => (
          <li key={c.level} className="klk-cardrow" data-has={c.has ? '1' : '0'} data-level={c.level}>
            <span className="klk-cardchip" style={{ background: c.color }} aria-hidden="true">
              {c.level}
            </span>
            <span className="klk-cardname">{c.name}</span>
            <span className="klk-cardstate">{c.has ? 'Var' : 'Yok'}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="klk-btn klk-go klk-wide"
        disabled={locked || !snap.canRead}
        data-autofocus=""
        onClick={() => onInput({ op: 'card' })}
        data-testid="lock-card"
      >
        Kartı okut
      </button>
    </div>
  );
});

const ElevatorPad = memo(function ElevatorPad({ snap, onInput }) {
  return (
    <div className="klk-elev">
      <ol className="klk-stops" aria-label="Katlar">
        {snap.stops
          .slice()
          .reverse()
          .map((s, idx) => (
            <li key={s.i}>
              <button
                type="button"
                className="klk-stop"
                data-here={s.here ? '1' : '0'}
                data-target={s.target ? '1' : '0'}
                data-autofocus={idx === 0 ? '' : undefined}
                disabled={s.here || snap.status === 'cozuldu'}
                aria-label={s.name + (s.here ? ', buradasın' : s.target ? ', gidiliyor' : '')}
                onClick={() => onInput({ op: 'go', stop: s.i })}
              >
                <span className="klk-stop-no" aria-hidden="true">
                  {s.i + 1}
                </span>
                <span className="klk-stop-name">{s.name}</span>
                <span className="klk-stop-tag" aria-hidden="true">
                  {s.here ? 'Buradasın' : s.target ? 'Yolda' : ''}
                </span>
              </button>
            </li>
          ))}
      </ol>
      {snap.phase === 'moving' ? (
        <button type="button" className="klk-btn klk-wide" onClick={() => onInput({ op: 'halt' })} data-testid="lock-halt">
          Dur: en yakın kata in
        </button>
      ) : null}
    </div>
  );
});

const LockPanel = ({ snap, onInput, onClose, accessibility = false, reducedMotion = false }) => {
  const bodyRef = useRef(null);
  const onKeyDown = useCallback(
    (e) => {
      if (!snap || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (snap.type === 'kod') {
        if (e.key >= '1' && e.key <= '6') {
          e.preventDefault();
          onInput({ op: 'digit', value: Number(e.key) });
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          onInput({ op: 'back' });
        } else if (e.key === 'Delete') {
          e.preventDefault();
          onInput({ op: 'clear' });
        } else if (e.key === 'Enter' && e.target && e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          onInput({ op: 'submit' });
        }
      } else if (snap.type === 'asansor' && e.key >= '1' && e.key <= '9') {
        const i = Number(e.key) - 1;
        if (i < snap.stops.length) {
          e.preventDefault();
          onInput({ op: 'go', stop: i });
        }
      }
    },
    [snap, onInput],
  );

  const snapType = snap ? snap.type : '';
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.focus({ preventScroll: true });
  }, [snapType]);

  if (!snap) return null;
  const subtitle = snap.type === 'kod' ? 'Kodu gir: ' + snap.digits + ' hane, her biri 1–6' : snap.type === 'kart' ? 'Kimlik kartı gerekli' : snap.type === 'asansor' ? 'Gitmek istediğin katı seç' : '';
  return (
    <PanelShell
      title={snap.title}
      subtitle={subtitle}
      onClose={onClose}
      accessibility={accessibility}
      reducedMotion={reducedMotion}
      testId="lock-panel"
      size="sm"
      className="klk-box"
    >
      <div className="klk" ref={bodyRef} tabIndex={-1} onKeyDown={onKeyDown} data-type={snap.type} data-status={snap.status} data-reduced={reducedMotion ? '1' : '0'}>
        {snap.type === 'kod' ? <CodePad snap={snap} onInput={onInput} /> : null}
        {snap.type === 'kart' ? <CardReader snap={snap} onInput={onInput} /> : null}
        {snap.type === 'asansor' ? <ElevatorPad snap={snap} onInput={onInput} /> : null}
        <CooldownBar snap={snap} />
        {snap.status === 'cozuldu' && snap.type !== 'asansor' ? (
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

export default memo(LockPanel);
