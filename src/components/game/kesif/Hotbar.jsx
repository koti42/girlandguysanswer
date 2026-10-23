import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { renderItemIcon } from '../../../game/kesif/render/itemIcons.js';
import { HOTBAR_SLOTS, formatCount, itemLabel } from './kxHudUtils.js';

const SWIPE_STEP_PX = 34;

function durColor(d) {
  // 0 → kırmızı, 0.5 → amber, 1 → yeşil (koyu zeminde okunur doygunluk).
  const hue = Math.round(Math.max(0, Math.min(1, d)) * 125);
  return 'hsl(' + hue + ' 78% 52%)';
}

const Slot = memo(function Slot({ index, item, count, dur, charge, ench, icon, selected, showKey, onSelect, iconFor, tabbable }) {
  const name = item ? itemLabel(item) : '';
  const src = useMemo(() => {
    if (!item) return '';
    if (icon) return icon;
    try {
      return iconFor ? iconFor(item, 56) : '';
    } catch {
      return '';
    }
  }, [item, icon, iconFor]);
  const hasDur = item && typeof dur === 'number' && dur < 0.999;
  const durPct = hasDur ? Math.round(dur * 100) : 100;
  const hasChg = item && typeof charge === 'number';
  const chgPct = hasChg ? Math.round(charge * 100) : 0;
  let label = index + 1 + '. yuva: ' + (item ? name : 'boş');
  if (item && count > 1) label += ', ' + count + ' adet';
  if (hasDur) label += ', dayanıklılık yüzde ' + durPct;
  if (hasChg) label += ', şarj yüzde ' + chgPct;
  if (ench > 0) label += ', büyülü (' + ench + ' büyü)';
  return (
    <button
      type="button"
      className="kx-slot"
      data-no-tap
      data-selected={selected ? '1' : '0'}
      data-empty={item ? '0' : '1'}
      data-ench={ench > 0 ? '1' : '0'}
      data-index={index}
      aria-label={label}
      aria-pressed={selected}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onSelect && onSelect(index)}
    >
      {showKey && (
        <span className="kx-slot-key" aria-hidden="true">
          {index + 1}
        </span>
      )}
      {item && (
        <span className="kx-slot-icon" aria-hidden="true">
          {src ? <img src={src} alt="" draggable={false} /> : <span className="kx-slot-glyph">{name.charAt(0).toLocaleUpperCase('tr-TR')}</span>}
          {src && ench > 0 && <span className="kx-slot-glint" style={{ '--kx-mask': 'url("' + src + '")' }} />}
        </span>
      )}
      {item && count > 1 && (
        <span className="kx-slot-count" aria-hidden="true">
          {formatCount(count)}
        </span>
      )}
      {hasChg && (
        <span className="kx-slot-chg" data-low={charge <= 0.1 ? '1' : '0'} data-has-dur={hasDur ? '1' : '0'} aria-hidden="true">
          <span style={{ width: chgPct + '%' }} />
        </span>
      )}
      {hasDur && (
        <span className="kx-slot-dur" aria-hidden="true">
          <span style={{ width: durPct + '%', background: durColor(dur) }} />
        </span>
      )}
    </button>
  );
});

/**
 * Çubuk sığmıyorsa (dar dikey telefon: 44 px yuva × 9) yatay şeride döner: `data-scroll="1"`, kenar solması `data-fade`.
 * Seçili yuva her zaman görünür kalır (kaydırma konumu seçimi izler); kullanıcı kaydırma jesti seçimi değiştirir.
 */
function revealSlot(bar, index) {
  const el = bar.querySelector('[data-index="' + index + '"]');
  if (!el) return;
  const pad = 30; // kenar solması + bir sonraki yuvanın ucu görünsün
  const left = el.offsetLeft;
  const right = left + el.offsetWidth;
  if (left - pad < bar.scrollLeft) bar.scrollLeft = Math.max(0, left - pad);
  else if (right + pad > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = right + pad - bar.clientWidth;
}

function useStripFit(rootRef, selected) {
  const selRef = useRef(selected);
  useEffect(() => {
    selRef.current = selected;
  });
  useEffect(() => {
    const bar = rootRef.current;
    if (!bar) return undefined;
    const sync = () => {
      const scrolling = bar.getAttribute('data-scroll') === '1';
      const fits = bar.scrollWidth <= bar.clientWidth + 1;
      if (fits) {
        if (scrolling) {
          bar.removeAttribute('data-scroll');
          bar.removeAttribute('data-fade');
        }
        return;
      }
      if (!scrolling) {
        bar.setAttribute('data-scroll', '1');
        revealSlot(bar, selRef.current);
      }
      const l = bar.scrollLeft > 2;
      const r = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2;
      const f = l && r ? 'lr' : l ? 'l' : r ? 'r' : '';
      if (f) bar.setAttribute('data-fade', f);
      else bar.removeAttribute('data-fade');
    };
    sync();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync);
      ro.observe(bar);
    }
    bar.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      if (ro) ro.disconnect();
      bar.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [rootRef]);
  useLayoutEffect(() => {
    const bar = rootRef.current;
    if (bar && bar.getAttribute('data-scroll') === '1') revealSlot(bar, selected);
  }, [rootRef, selected]);
}

/**
 * Eşya çubuğu (9 yuva). Masaüstünde rakam ipuçları; dokunmatikte yatay kaydırarak yuva değiştirilir
 * (her ~34 px bir yuva), dokunarak seçilir. Klavye: ←/→ ile gezinme (seçimi de değiştirir).
 *
 * slots: hudStore hotbar dizisi [{item,count,icon?,dur?}]; onSelect(i): yuva seçimi.
 */
const Hotbar = ({ slots, selected = 0, onSelect, showKeys = true, iconFor = renderItemIcon }) => {
  const rootRef = useRef(null);
  const swipe = useRef({ id: null, x: 0, acc: 0, moved: false });
  const list = slots && slots.length ? slots : [];
  useStripFit(rootRef, selected);

  const move = useCallback(
    (delta) => {
      if (!onSelect) return;
      const n = HOTBAR_SLOTS;
      onSelect(((selected + delta) % n + n) % n);
    },
    [onSelect, selected]
  );

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      move(delta);
      const next = (((selected + delta) % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS;
      const el = rootRef.current && rootRef.current.querySelector('[data-index="' + next + '"]');
      if (el) el.focus({ preventScroll: true });
    }
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return;
    swipe.current = { id: e.pointerId, x: e.clientX, acc: 0, moved: false };
  };
  const onPointerMove = (e) => {
    const s = swipe.current;
    if (s.id === null || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    s.x = e.clientX;
    s.acc += dx;
    while (Math.abs(s.acc) >= SWIPE_STEP_PX) {
      const d = s.acc > 0 ? -1 : 1; // sağa kaydır → önceki yuva (içerik parmakla gider)
      s.acc -= s.acc > 0 ? SWIPE_STEP_PX : -SWIPE_STEP_PX;
      s.moved = true;
      move(d);
    }
  };
  const endSwipe = (e) => {
    if (swipe.current.id !== null && e.pointerId === swipe.current.id) swipe.current.id = null;
  };
  // Kaydırma jesti dokunuşu seçime çevirmesin.
  const onClickCapture = (e) => {
    if (swipe.current.moved) {
      swipe.current.moved = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const cells = [];
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    const s = list[i] || {};
    cells.push(
      <Slot
        key={i}
        index={i}
        item={s.item || null}
        count={s.count || 0}
        dur={s.dur}
        charge={s.charge}
        ench={s.ench || 0}
        icon={s.icon}
        selected={i === selected}
        showKey={showKeys}
        onSelect={onSelect}
        iconFor={iconFor}
        tabbable={i === selected}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className="kx-hotbar"
      role="toolbar"
      aria-label="Eşya çubuğu"
      aria-orientation="horizontal"
      data-no-tap
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={endSwipe}
      onClickCapture={onClickCapture}
    >
      {cells}
    </div>
  );
};

export default memo(Hotbar);
