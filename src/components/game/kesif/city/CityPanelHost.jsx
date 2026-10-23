import React, {
  memo, useCallback, useEffect, useId, useRef, useState,
} from 'react';
import { boardKeyIndex, graffitiKey } from './missionUtils.js';
import './missions.css';

/*
 * Neon Meridyen görev panelleri (hud.ui === 'dialogue' paylaşımlı kabuğu; her host görüntü yokken hiçbir şey çizmez):
 *   Kurye Panosu / Taksi Durağı (api.getBoard → teklifler; api.acceptJob(id); api.closeBoard()) — 3 teklif, kademe + ödül + süre + yaya/araç etiketi, tuşlar 1–3
 *   Grafiti Seçici (api.getGraffitiPicker → 6 kalıp × 8 renk; api.graffitiAct({k:'pick'|'paint'|'close'})) — tuşlar 1–6 kalıp, ←/→ (Q/E) renk, Enter boya, Esc kapat
 * Erişilebilirlik: role="dialog", odak tuzağı, Esc, hedefler ≥ 44 px, renk + ad + şekil, ekran okuyucu özeti; reducedMotion/erişilebilirlik: animasyon yok.
 */
const FOCUSABLE = 'button:not([disabled])';

function useTrap(boxRef) {
  return useCallback((e) => {
    if (e.key !== 'Tab' || !boxRef.current) return;
    const items = Array.from(boxRef.current.querySelectorAll(FOCUSABLE));
    if (!items.length) return;
    const a = items[0];
    const z = items[items.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }, [boxRef]);
}

const TIER_SHAPE = Object.freeze({ caylak: '●', usta: '◆', efsane: '★' });

export const BoardView = memo(function BoardView({
  view, onAccept, onClose, calm = false,
}) {
  const titleId = useId();
  const boxRef = useRef(null);
  const onKeyDown = useTrap(boxRef);

  useEffect(() => {
    const box = boxRef.current;
    const first = box && (box.querySelector('.kmb-offer button:not([disabled])') || box.querySelector('.kmb-close'));
    if (first && first.focus) first.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      const n = boardKeyIndex(e);
      if (n > 0 && view.offers[n - 1]) {
        e.preventDefault();
        e.stopPropagation();
        if (view.offers[n - 1].available) onAccept(view.offers[n - 1].id);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [view, onAccept, onClose]);

  return (
    <div className="kmb-dock" data-testid="board-host">
      <section ref={boxRef} className={'kmb' + (calm ? ' kmb-calm' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} data-kind={view.kind}>
        <header className="kmb-head">
          <div>
            <h2 id={titleId} className="kmb-name">{view.title}</h2>
            <p className="kmb-sub">{view.subtitle}{view.driving ? ' · araçtasın' : ' · yaya'}</p>
          </div>
          <button type="button" className="kmb-close" onClick={onClose} aria-label="Panoyu kapat" data-testid="board-close">✕</button>
        </header>
        {view.msg ? <p className="kmb-msg" role="status">{view.msg}</p> : null}
        <ul className="kmb-offers">
          {view.offers.map((o, i) => (
            <li key={o.id} className="kmb-offer" data-tier={o.tier} data-available={o.available ? '1' : '0'} data-testid={'offer-' + i}>
              <div className="kmb-top">
                <span className="kmb-tier"><span aria-hidden="true">{TIER_SHAPE[o.tier] || '●'}</span> {o.tierName}</span>
                <span className="kmb-reward">+{o.reward} Kredi</span>
              </div>
              <p className="kmb-title">{o.name}</p>
              <p className="kmb-meta">
                {o.fromText} → {o.toText} · {o.distText}{o.stops ? ' · 3 durak' : ''} · {o.limitText}
                {o.fragile ? ' · kırılgan paket' : ''}{o.canWalk ? ' · yayayla olur' : ' · araç gerekir'}
              </p>
              <button type="button" className="kmb-take" disabled={!o.available} onClick={() => onAccept(o.id)} aria-label={'İşi al ' + (i + 1) + ': ' + o.name}>
                <kbd aria-hidden="true">{i + 1}</kbd> {o.available ? 'Kabul et' : o.why}
              </button>
            </li>
          ))}
        </ul>
        {view.decay < 1 ? <p className="kmb-note">Art arda iş aldın: ödüller %{Math.round(view.decay * 100)}. Biraz bekleyince eski değerine döner.</p> : null}
        <p className="kx-sr" role="status">{view.title}. {view.offers.length} teklif.</p>
      </section>
    </div>
  );
});

export const GraffitiView = memo(function GraffitiView({
  view, onAct, calm = false,
}) {
  const titleId = useId();
  const boxRef = useRef(null);
  const onKeyDown = useTrap(boxRef);
  useEffect(() => {
    const box = boxRef.current;
    const first = box && box.querySelector('.kmg-paint');
    if (first && first.focus) first.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const a = graffitiKey(e, view);
      if (a) {
        e.preventDefault();
        e.stopPropagation();
        onAct(a);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [view, onAct]);
  return (
    <div className="kmb-dock" data-testid="graffiti-host">
      <section ref={boxRef} className={'kmb kmg' + (calm ? ' kmb-calm' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <header className="kmb-head">
          <div>
            <h2 id={titleId} className="kmb-name">Grafiti</h2>
            <p className="kmb-sub">Bir kalıp ve renk seç; {view.seconds} saniye duvarın yanında kal.</p>
          </div>
          <button type="button" className="kmb-close" onClick={() => onAct({ k: 'close' })} aria-label="Kapat" data-testid="graffiti-close">✕</button>
        </header>
        <div className="kmg-grid" role="radiogroup" aria-label="Kalıp">
          {view.stencils.map((s) => (
            <button key={s.i} type="button" role="radio" aria-checked={view.design === s.i} className="kmg-opt" data-on={view.design === s.i ? '1' : '0'} onClick={() => onAct({ k: 'pick', design: s.i })}>
              <kbd aria-hidden="true">{s.i + 1}</kbd> {s.name}
            </button>
          ))}
        </div>
        <div className="kmg-grid kmg-colors" role="radiogroup" aria-label="Renk">
          {view.colors.map((c) => (
            <button key={c.i} type="button" role="radio" aria-checked={view.color === c.i} className="kmg-sw" data-on={view.color === c.i ? '1' : '0'} onClick={() => onAct({ k: 'pick', color: c.i })} aria-label={c.name}>
              <span className="kmg-chip" style={{ background: c.hex }} aria-hidden="true">{view.color === c.i ? '✓' : ''}</span>
              <span className="kmg-sw-name">{c.name}</span>
            </button>
          ))}
        </div>
        {view.msg ? <p className="kmb-msg" role="status">{view.msg}</p> : null}
        <button type="button" className="kmg-paint" onClick={() => onAct({ k: 'paint' })} data-testid="graffiti-paint">Boya <kbd aria-hidden="true">Enter</kbd></button>
        <p className="kx-sr" role="status">Seçili: {view.stencils[view.design] ? view.stencils[view.design].name : ''}, {view.colors[view.color] ? view.colors[view.color].name : ''}.</p>
      </section>
    </div>
  );
});

/** Şehir panelleri ev sahibi: pano ve grafiti seçici (görüntü yokken null). */
const CityPanelHost = ({
  api, onClose, accessibility = false, reducedMotion = false, pollMs = 120,
}) => {
  const readBoth = useCallback(() => {
    let b = null;
    let g = null;
    try {
      b = api && typeof api.getBoard === 'function' ? api.getBoard() : null;
      g = b ? null : api && typeof api.getGraffitiPicker === 'function' ? api.getGraffitiPicker() : null;
    } catch {
      b = null;
      g = null;
    }
    return { b, g };
  }, [api]);
  const [cur, setCur] = useState(readBoth);
  const last = useRef(JSON.stringify(cur));
  const { b: board, g: gr } = cur;

  const refresh = useCallback(() => {
    const v = readBoth();
    const k = JSON.stringify(v);
    if (k !== last.current) {
      last.current = k;
      setCur(v);
    }
  }, [readBoth]);

  useEffect(() => {
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const accept = useCallback((id) => {
    const r = api && typeof api.acceptJob === 'function' ? api.acceptJob(id) : null;
    refresh();
    if (r && r.ok && onClose) onClose();
  }, [api, refresh, onClose]);

  const closeBoard = useCallback(() => {
    if (api && typeof api.closeBoard === 'function') api.closeBoard();
    refresh();
    if (onClose) onClose();
  }, [api, refresh, onClose]);

  const act = useCallback((a) => {
    const r = api && typeof api.graffitiAct === 'function' ? api.graffitiAct(a) : null;
    refresh();
    if (a && (a.k === 'close' || (a.k === 'paint' && r && r.ok)) && onClose) onClose();
  }, [api, refresh, onClose]);

  const calm = accessibility || reducedMotion;
  if (board) return <BoardView view={board} onAccept={accept} onClose={closeBoard} calm={calm} />;
  if (gr) return <GraffitiView view={gr} onAct={act} calm={calm} />;
  return null;
};

export default memo(CityPanelHost);
