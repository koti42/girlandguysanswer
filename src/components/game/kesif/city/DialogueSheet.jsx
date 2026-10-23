import React, {
  memo, useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { npcLook } from '../../../../game/kesif/sim/city/ped/npcData.js';
import {
  PAGE_MAX, choiceFromKey, moodHue, paginateText, portraitSpec, typewriterShown,
} from './npcPanelUtils.js';
import './npcPanels.css';

/*
 * Diyalog sayfası (hud.ui === 'dialogue'; NPC / sahip). Alt sayfa (bottom sheet): dünya arkada akmaya devam eder (trafik sürer), girdi kapalıdır.
 * Motor cephesi: getDialogue() düz JSON ~11 Hz yoklanır (yalnız değişince yeniden çizilir), seçim chooseDialogue(n), kapatma closeDialogue().
 * Erişilebilirlik: role="dialog" (aria-labelledby ad, aria-describedby metin), tam metin sürekli aria-live bölgesinde (daktilo yalnız görseldir, aria-hidden),
 * seçenekler ≥ 48 px, klavye 1–4 + Esc, Boşluk/Enter/dokunma metni atlar, odak tuzağı, reducedMotion/erişilebilirlik: daktilo ve kayma animasyonu yok.
 * Uzun metin sayfalanır (> PAGE_MAX kr): "Devam" ile ilerler; seçenekler son sayfada etkindir.
 *
 * Props: api ({getDialogue, chooseDialogue, closeDialogue}), onClose, accessibility, reducedMotion, pollMs, onSpeak
 * Dışa aktarımlar: default DialogueSheet (ev sahibi) · DialogueView (saf görünüm) · NpcPortrait
 */

/** SVG büst: kimlik görünümünden (avatar şeması) türetilir; renk + şekil, metin alternatifi gizli (ad başlıkta). */
export const NpcPortrait = memo(function NpcPortrait({ look, kind, mood }) {
  const p = useMemo(() => portraitSpec(look, kind), [look, kind]);
  const hue = moodHue(mood);
  const hs = p.hairStyle;
  const cap = 'M16.500 27 C16.500 11 47.500 11 47.500 27 C43 20.500 21 20.500 16.500 27Z';
  const longSide = 'M15.500 30 C13 10 51 10 48.500 30 L48.500 46 C44.500 42 45 32 44 27 L20 27 C19 32 19.500 42 15.500 46Z';
  let hairShape = null;
  if (hs === 'uzun' || hs === 'dalgali' || hs === 'orgu') hairShape = <path d={longSide} fill={p.hair} />;
  else hairShape = <path d={cap} fill={p.hair} />;
  return (
    <svg className="knp-portrait" viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false" data-kind={p.kind} style={{ '--knp-hue': hue }}>
      <defs>
        <radialGradient id="knp-bg" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={hue} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0b0f22" stopOpacity="1" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#knp-bg)" stroke={hue} strokeOpacity="0.7" strokeWidth="1.500" />
      <g transform={'translate(32 40) scale(' + p.scale + ') translate(-32 -40)'}>
        <path d="M7 64 C7 49 19 45 32 45 C45 45 57 49 57 64Z" fill={p.top} />
        <rect x="27.500" y="38" width="9" height="9" rx="3" fill={p.skin} />
        {p.robot ? (
          <g>
            <rect x="17" y="14" width="30" height="27" rx="9" fill={p.skin} stroke="#7fa0b4" strokeWidth="1.200" />
            <rect x="21" y="23" width="22" height="8" rx="4" fill="#0e1a2a" />
            <circle cx="27" cy="27" r="2.200" fill="#5af4ff" />
            <circle cx="37" cy="27" r="2.200" fill="#5af4ff" />
            <rect x="31" y="6" width="2" height="8" fill="#7fa0b4" />
            <circle cx="32" cy="6" r="2.800" fill={p.hair} />
          </g>
        ) : (
          <g>
            <ellipse cx="32" cy="28" rx="14" ry="16" fill={p.skin} />
            {hairShape}
            {hs === 'topuz' ? <circle cx="32" cy="10" r="6" fill={p.hair} /> : null}
            {hs === 'atkuyrugu' ? <ellipse cx="50.500" cy="34" rx="4.500" ry="9" fill={p.hair} /> : null}
            {hs === 'mohawk' ? <path d="M28 5 L36 5 L38.500 21 L25.500 21Z" fill={p.hair} /> : null}
            {hs === 'kivircik' ? (
              <g fill={p.hair}>
                <circle cx="20" cy="17" r="6" />
                <circle cx="32" cy="12" r="7" />
                <circle cx="44" cy="17" r="6" />
              </g>
            ) : null}
            <circle cx="26.500" cy="29" r="1.700" fill="#16142a" />
            <circle cx="37.500" cy="29" r="1.700" fill="#16142a" />
            <path d="M27 36 Q32 40 37 36" fill="none" stroke="#7a3d3d" strokeWidth="1.600" strokeLinecap="round" />
          </g>
        )}
        {p.acc === 'gozluk' ? (
          <g fill="none" stroke="#1d2540" strokeWidth="1.500">
            <circle cx="26.500" cy="29" r="4.500" />
            <circle cx="37.500" cy="29" r="4.500" />
            <path d="M31 29 H33" />
          </g>
        ) : null}
        {p.acc === 'gunes' ? <rect x="20" y="25.500" width="24" height="7" rx="3" fill="#10142a" /> : null}
        {p.acc === 'sapka' ? (
          <g fill="#f4f6ff">
            <path d="M16 20 C16 8 48 8 48 20Z" fill="#2c3563" />
            <rect x="14" y="19" width="26" height="3.500" rx="1.700" fill="#2c3563" />
          </g>
        ) : null}
        {p.acc === 'bere' ? <path d="M16 22 C16 7 48 7 48 22Z" fill="#e5496a" /> : null}
        {p.acc === 'kulaklik' ? (
          <g fill="none" stroke="#25e0ff" strokeWidth="2.200" strokeLinecap="round">
            <path d="M16.500 30 C14 8 50 8 47.500 30" />
            <rect x="12.500" y="27" width="6" height="11" rx="3" fill="#25e0ff" stroke="none" />
            <rect x="45.500" y="27" width="6" height="11" rx="3" fill="#25e0ff" stroke="none" />
          </g>
        ) : null}
        {p.acc === 'kedi' ? (
          <g fill={p.hair}>
            <path d="M17 18 L19 5 L29 14Z" />
            <path d="M47 18 L45 5 L35 14Z" />
          </g>
        ) : null}
        {p.acc === 'tac' ? <path d="M20 14 L24 6 L28 12 L32 5 L36 12 L40 6 L44 14Z" fill="#ffd44a" /> : null}
      </g>
    </svg>
  );
});

/** Daktilo satırı: yalnız görseldir (tam metin ayrı aria-live bölgesinde). Geri çağrılarla ilerler (efekt gövdesinde setState yok). */
const TypedLine = ({
  text, instant, onDone, skipRef,
}) => {
  const [ms, setMs] = useState(instant ? 1e9 : 0);
  useEffect(() => {
    let el = instant ? 1e9 : 0;
    let stopped = false;
    let raf = 0;
    let timer = 0;
    let last = null;
    skipRef.current = () => {
      el = 1e9;
      setMs(1e9);
    };
    if (instant) return undefined;
    function tick(now) {
      if (stopped) return;
      const t = typeof now === 'number' ? now : Date.now();
      if (last === null) last = t;
      const dt = t - last;
      last = t;
      if (el < 1e9) el += dt;
      if (typewriterShown(text, el).done) {
        el = 1e9;
        setMs(1e9);
        onDone();
        return;
      }
      setMs(el);
      if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
      else timer = setTimeout(() => tick(Date.now()), 33);
    }
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
    else timer = setTimeout(() => tick(Date.now()), 33);
    return () => {
      stopped = true;
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [text, instant, onDone, skipRef]);
  const r = typewriterShown(text, ms);
  return (
    <>
      {r.shown}
      {!r.done ? <span className="knp-caret" /> : null}
    </>
  );
};

const FOCUSABLE = 'button:not([disabled])';

const DialogueBody = ({
  view, onChoose, onClose, accessibility = false, reducedMotion = false,
}) => {
  const titleId = useId();
  const textId = useId();
  const boxRef = useRef(null);
  const instant = reducedMotion || accessibility;
  const full = view.lines.join(' ');
  const pages = useMemo(() => paginateText(full, accessibility ? 70 : PAGE_MAX), [full, accessibility]);
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(instant);
  const skipRef = useRef(null);
  const text = pages[Math.min(page, pages.length - 1)];
  const lastPage = page >= pages.length - 1;
  const finish = useCallback(() => setDone(true), []);
  const skip = useCallback(() => {
    if (skipRef.current) skipRef.current();
    setDone(true);
  }, []);
  const look = useMemo(() => npcLook(view.npc.id), [view.npc.id]);
  const [note, setNote] = useState('');

  // odak: açılışta/düğüm değişince ilk etkin seçenek
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const first = box.querySelector('.knp-choice[aria-disabled="false"]') || box.querySelector('.knp-close');
    if (first && first.focus) first.focus({ preventScroll: true });
  }, [view.node]);

  const choose = useCallback((n) => {
    const c = view.choices.find((x) => x.n === n);
    if (!c) return;
    if (!c.enabled) {
      setNote(c.why || 'Şu an olmaz.');
      return;
    }
    setNote('');
    onChoose(n);
  }, [view.choices, onChoose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      const n = choiceFromKey(e);
      if (n > 0 && lastPage) {
        e.preventDefault();
        e.stopPropagation();
        choose(n);
        return;
      }
      if (!done && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        skip();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [choose, onClose, done, skip, lastPage]);

  const onKeyDown = (e) => {
    if (e.key !== 'Tab' || !boxRef.current) return;
    const items = Array.from(boxRef.current.querySelectorAll(FOCUSABLE));
    if (!items.length) return;
    const a = items[0];
    const z = items[items.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };

  const onText = () => {
    if (!done) skip();
    else if (!lastPage) {
      setPage((p) => p + 1);
      setDone(instant);
    }
  };

  const cls = ['knp-dlg'];
  if (accessibility) cls.push('knp-a11y');
  if (reducedMotion) cls.push('knp-calm');
  return (
    <div className="knp-dock">
      <section
        ref={boxRef}
        className={cls.join(' ')}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={textId}
        data-testid="dialogue-sheet"
        data-mood={view.mood}
        data-kind={view.npc.kind}
        onKeyDown={onKeyDown}
        style={{ '--knp-hue': moodHue(view.mood) }}
      >
        <header className="knp-head">
          <NpcPortrait look={look} kind={view.npc.kind} mood={view.mood} />
          <div className="knp-who">
            <h2 id={titleId} className="knp-name">{view.npc.name}</h2>
            {view.npc.title ? <p className="knp-title">{view.npc.title}</p> : null}
          </div>
          <button type="button" className="knp-close" onClick={onClose} aria-label="Konuşmayı kapat" data-testid="dialogue-close">
            <span aria-hidden="true">✕</span>
          </button>
        </header>
        <div
          className="knp-text"
          role="button"
          tabIndex={-1}
          onClick={onText}
          onKeyDown={() => {}}
          aria-label={done && !lastPage ? 'Devamını göster' : 'Metni hızlandır'}
          data-testid="dialogue-text"
        >
          <p className="knp-line" aria-hidden="true">
            <TypedLine key={page} text={text} instant={instant} onDone={finish} skipRef={skipRef} />
          </p>
          {done && !lastPage ? <span className="knp-more" aria-hidden="true">Devam ▸</span> : null}
        </div>
        <p id={textId} className="knp-sr" role="status" aria-live="polite" data-testid="dialogue-live">
          {view.npc.name + ': ' + full}
        </p>
        <p className="knp-msg" role="status" aria-live="polite" data-testid="dialogue-msg">{note || view.msg || ''}</p>
        <ul className="knp-choices" aria-label="Cevaplar">
          {view.choices.map((c) => (
            <li key={c.n}>
              <button
                type="button"
                className={'knp-choice' + (c.enabled ? '' : ' is-off')}
                aria-disabled={c.enabled && lastPage ? 'false' : 'true'}
                aria-keyshortcuts={String(c.n)}
                data-testid={'choice-' + c.n}
                onClick={() => (lastPage ? choose(c.n) : onText())}
              >
                <kbd className="knp-key" aria-hidden="true">{c.n}</kbd>
                <span className="knp-choice-text">{c.t}</span>
                {!c.enabled && c.why ? <span className="knp-why">{c.why}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

/** Düğüm/metin değişince gövde yeniden kurulur (sayfa, daktilo, not durumları kendiliğinden sıfırlanır). */
export const DialogueView = memo(function DialogueView(props) {
  const { view } = props;
  return <DialogueBody key={view.node + '|' + view.lines.join(' ')} {...props} />;
});

const DialogueSheet = ({
  api, onClose, accessibility = false, reducedMotion = false, pollMs = 90,
}) => {
  const read = useCallback(() => (api && typeof api.getDialogue === 'function' ? api.getDialogue() : null), [api]);
  const [view, setView] = useState(read);
  const last = useRef(view ? JSON.stringify(view) : '');

  const refresh = useCallback(() => {
    const v = read();
    const k = v ? JSON.stringify(v) : '';
    if (k !== last.current) {
      last.current = k;
      setView(v);
    }
  }, [read]);

  useEffect(() => {
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  const choose = useCallback((n) => {
    if (api && typeof api.chooseDialogue === 'function') api.chooseDialogue(n);
    refresh();
  }, [api, refresh]);

  const close = useCallback(() => {
    if (api && typeof api.closeDialogue === 'function') api.closeDialogue();
    refresh();
    if (onClose) onClose();
  }, [api, onClose, refresh]);

  if (!view) return null;
  return <DialogueView view={view} onChoose={choose} onClose={close} accessibility={accessibility} reducedMotion={reducedMotion} />;
};

export default memo(DialogueSheet);
