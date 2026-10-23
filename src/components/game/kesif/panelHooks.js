/*
 * KEŞİF paneller — ortak React kancaları (bileşen dosyalarında yalnız bileşen dışa aktarılsın diye ayrı).
 *  useApiSnapshot(read, version)   api'den okunan anlık görüntü; version değişince / bump() ile yenilenir
 *  useLiveMessage()                ekran okuyucu duyuru metni (aynı metin tekrar okunabilsin diye değişir)
 *  useRovingGrid(cols, firstAddr)  ızgara için ok tuşu gezinmesi + tek tab durağı
 *  useSlotDrag(opts)               pointer olaylarıyla sürükle-bırak + uzun basma (dokunmatik/fare), hayalet öğe
 *  useStackMover(opts)             yuva adresleri arası taşıma: dokun-seç-dokun, yarıya böl, hızlı taşı, bırak, zırh
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  armorIndexOf, gridNavTarget, isArmorItem, parseAddr, quickMovePlan, sameAddr, slotAtAddr,
} from './panelUtils.js';

/** Dokunmatikte sürükleme için basılı tutma süresi (ms): daha kısa kaydırma jesti panel gövdesini kaydırır, sürüklemeye dönmez. */
export const TOUCH_DRAG_HOLD_MS = 180;

/** api'den okur (hata olursa null); version veya bump() ile yeniden okunur. */
export function useApiSnapshot(read, version) {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const data = useMemo(() => {
    try {
      return read();
    } catch (_e) {
      return null;
    }
    // version ve tick yalnızca yeniden okuma tetikleyicisidir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, version, tick]);
  return [data, bump];
}

/** [mesaj, duyur]: aynı metin art arda duyurulursa görünmez karakter eklenir. */
export function useLiveMessage() {
  const [msg, setMsg] = useState('');
  const flip = useRef(false);
  const announce = useCallback((text) => {
    flip.current = !flip.current;
    setMsg(text ? text + (flip.current ? '​' : '') : '');
  }, []);
  return [msg, announce];
}

/** Duyarlı ızgarada gerçek sütun sayısı: ilk satırdaki (aynı offsetTop) öğe sayısı. */
function autoCols(items) {
  if (!items.length) return 1;
  const top = items[0].offsetTop;
  let n = 0;
  while (n < items.length && items[n].offsetTop === top) n++;
  return Math.max(1, n);
}

/** Ok tuşlarıyla ızgarada gezinme (cols: sayı | 'auto'). Kapsayıcıya onKeyDown, her öğeye itemProps(addr) ver. */
export function useRovingGrid(cols, firstAddr) {
  const [rove, setRove] = useState(null);
  const current = rove || firstAddr;
  const onKeyDown = useCallback((e) => {
    const item = e.target && e.target.closest ? e.target.closest('[data-grid-item]') : null;
    if (!item) return;
    const items = Array.from(e.currentTarget.querySelectorAll('[data-grid-item]'));
    const idx = items.indexOf(item);
    if (idx < 0) return;
    const n = gridNavTarget(e.key, idx, cols === 'auto' ? autoCols(items) : cols, items.length);
    if (n < 0) return;
    e.preventDefault();
    if (n !== idx && items[n]) items[n].focus();
  }, [cols]);
  const itemProps = useCallback((addr) => ({
    tabIndex: current === addr ? 0 : -1,
    'data-grid-item': '',
    onFocus: () => setRove(addr),
  }), [current]);
  return { onKeyDown, itemProps };
}

/**
 * Sürükle-bırak + uzun basma. Yuva düğmelerine bind(addr) yayılır: {onPointerDown, onContextMenu}.
 * Fare: 7 px hareketle hemen sürükler. Dokunmatik/kalem: yuva TOUCH_DRAG_HOLD_MS basılı tutulunca "hazır" olur (yuvada data-armed),
 * ardından hareket sürükler (touchmove kaydırması engellenir); tutmadan hareket = panel gövdesi kaydırılır (yuvalar kaydırmayı engellemez).
 * Bırakılan hedef: [data-slot-addr] (adres) veya [data-dropzone] (bölge adı).
 * opts: {canStart(addr)→bool, onDrop(from, toAddr|null, zone|null), onLongPress(addr), onContext(addr)}
 * Dönüş: {bind, dragging (addr|null), ghostRef, consumeClick()}
 * Hayalet öğenin konumu ref ile güncellenir (kare başı yeniden çizim yok).
 */
export function useSlotDrag(opts) {
  const [dragging, setDragging] = useState(null);
  const ghostRef = useRef(null);
  const optsRef = useRef(opts);
  const st = useRef(null);
  const pos = useRef({ x: 0, y: 0, touch: false });
  const hover = useRef(null);
  const suppress = useRef(0);
  const cleanup = useRef(null);

  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const place = useCallback(() => {
    const g = ghostRef.current;
    if (!g) return;
    const lift = pos.current.touch ? 34 : 0;
    // hayalet, örtünün (konumlu üst öğe) içinde mutlak konumlu: koordinatlar örtüye göre alınır
    const op = g.offsetParent;
    const r = op && op.getBoundingClientRect ? op.getBoundingClientRect() : { left: 0, top: 0 };
    g.style.transform = 'translate3d(' + (pos.current.x - r.left - 24) + 'px,' + (pos.current.y - r.top - 24 - lift) + 'px,0)';
  }, []);

  useLayoutEffect(() => {
    if (dragging) place();
  }, [dragging, place]);

  const setHover = useCallback((el) => {
    if (hover.current === el) return;
    if (hover.current) hover.current.removeAttribute('data-drop-hover');
    hover.current = el;
    if (el) el.setAttribute('data-drop-hover', '1');
  }, []);

  const targetAt = useCallback((x, y) => {
    if (typeof document === 'undefined' || !document.elementFromPoint) return null;
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest) return null;
    return el.closest('[data-slot-addr],[data-dropzone]');
  }, []);

  const end = useCallback(() => {
    const s = st.current;
    if (s && s.timer) clearTimeout(s.timer);
    st.current = null;
    setHover(null);
    setDragging(null);
    if (cleanup.current) {
      cleanup.current();
      cleanup.current = null;
    }
  }, [setHover]);

  const markSuppress = useCallback(() => {
    suppress.current = Date.now();
  }, []);

  const onPointerDown = useCallback((e, addr) => {
    if (e.button !== undefined && e.button !== 0) return;
    const o = optsRef.current;
    if (!o.canStart || !o.canStart(addr)) return;
    end();
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const s = { addr, pid: e.pointerId, x0: e.clientX, y0: e.clientY, started: false, long: false, timer: null, armed: !touch, armTimer: null, el: e.currentTarget || null };
    pos.current = { x: e.clientX, y: e.clientY, touch };
    const blockScroll = (ev) => {
      if (ev.cancelable) ev.preventDefault();
    };
    if (touch) {
      s.armTimer = setTimeout(() => {
        if (st.current !== s || s.started || s.long) return;
        s.armed = true;
        if (s.el && s.el.setAttribute) s.el.setAttribute('data-armed', '1');
        document.addEventListener('touchmove', blockScroll, { passive: false });
        s.blocked = true;
      }, TOUCH_DRAG_HOLD_MS);
    }
    s.timer = setTimeout(() => {
      if (st.current === s && !s.started) {
        s.long = true;
        markSuppress();
        if (optsRef.current.onLongPress) optsRef.current.onLongPress(addr);
      }
    }, 460);
    st.current = s;
    const move = (ev) => {
      if (st.current !== s || (ev.pointerId !== undefined && s.pid !== undefined && ev.pointerId !== s.pid)) return;
      pos.current.x = ev.clientX;
      pos.current.y = ev.clientY;
      if (!s.started) {
        if (s.long) return;
        const dx = ev.clientX - s.x0;
        const dy = ev.clientY - s.y0;
        if (dx * dx + dy * dy < 49) return;
        if (!s.armed) {
          // dokunmatik: tutmadan kaydırma → sürükleme değil, panel kaydırılır
          end();
          return;
        }
        s.started = true;
        if (s.timer) clearTimeout(s.timer);
        setDragging(addr);
      }
      place();
      const t = targetAt(ev.clientX, ev.clientY);
      setHover(t && (t.getAttribute('data-slot-addr') !== addr || t.hasAttribute('data-dropzone')) ? t : null);
    };
    const up = (ev) => {
      if (st.current !== s || (ev.pointerId !== undefined && s.pid !== undefined && ev.pointerId !== s.pid)) return;
      if (s.started) {
        markSuppress();
        const t = targetAt(ev.clientX, ev.clientY);
        const to = t ? t.getAttribute('data-slot-addr') : null;
        const zone = t ? t.getAttribute('data-dropzone') : null;
        end();
        if ((to && to !== addr) || zone) optsRef.current.onDrop(addr, to, zone);
        return;
      }
      end();
    };
    const cancel = (ev) => {
      if (st.current !== s || (ev.pointerId !== undefined && s.pid !== undefined && ev.pointerId !== s.pid)) return;
      end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      if (s.armTimer) clearTimeout(s.armTimer);
      if (s.blocked) document.removeEventListener('touchmove', blockScroll);
      if (s.el && s.el.removeAttribute) s.el.removeAttribute('data-armed');
    };
  }, [end, markSuppress, place, setHover, targetAt]);

  useEffect(() => () => {
    const s = st.current;
    if (s && s.timer) clearTimeout(s.timer);
    if (cleanup.current) cleanup.current();
  }, []);

  const bind = useCallback((addr) => ({
    onPointerDown: (e) => onPointerDown(e, addr),
    onContextMenu: (e) => {
      e.preventDefault();
      if (optsRef.current.onContext) optsRef.current.onContext(addr);
    },
  }), [onPointerDown]);

  /** Sürükleme/uzun basma sonrası gelen sahte tıklamayı yut (true → yutuldu). */
  const consumeClick = useCallback(() => {
    if (suppress.current && Date.now() - suppress.current < 700) {
      suppress.current = 0;
      return true;
    }
    suppress.current = 0;
    return false;
  }, []);

  return { bind, dragging, ghostRef, consumeClick };
}

/**
 * Yığın taşıyıcı (envanter + sandık ortak). api: motor yüzeyi; inv/chest: anlık görüntüler;
 * bump: yerel yeniden okuma; announce: ekran okuyucu duyurusu.
 */
export function useStackMover({ api, inv, chest, bump, announce }) {
  const [rawSel, setRawSel] = useState(null);
  const lastTap = useRef({ addr: null, t: 0 });
  // seçim elle değişince (eylem düğmeleri vb.) önceki dokunuş çift dokunma sayılmasın
  const setSel = (v) => {
    lastTap.current = { addr: null, t: 0 };
    setRawSel(v);
  };
  const sel = rawSel && slotAtAddr(rawSel.addr, inv, chest) ? rawSel : null;

  const call = (fn) => {
    let ok = false;
    try {
      ok = !!fn();
    } catch (_e) {
      ok = false;
    }
    bump();
    return ok;
  };

  const moveTo = (from, to, half) => {
    const pf = parseAddr(from);
    const pt = parseAddr(to);
    const fromSlot = slotAtAddr(from, inv, chest);
    if (!pf || !pt || !fromSlot || sameAddr(from, to)) return false;
    let ok;
    if (pt.kind === 'a') {
      if (pf.kind === 's' && armorIndexOf(fromSlot) === pt.index) {
        ok = call(() => api.equipArmor(from));
      } else {
        announce(isArmorItem(fromSlot) ? 'Bu zırh parçası o yuvaya takılamaz.' : 'Yalnızca zırh takılabilir.');
        return false;
      }
    } else if (pf.kind === 'a' && pt.kind === 's') {
      const targetFull = !!slotAtAddr(to, inv, chest);
      ok = call(() => api.moveStack(from, to, { half: false }));
      if (!ok && !targetFull) ok = call(() => api.unequipArmor(pf.index));
    } else {
      ok = call(() => api.moveStack(from, to, { half: !!half }));
    }
    if (!ok) announce('Taşınamadı.');
    return ok;
  };

  const quickMove = (addr) => {
    const plan = quickMovePlan(addr, inv, chest);
    if (!plan) {
      announce('Taşıyacak yer yok.');
      return false;
    }
    if (plan.action === 'equip') return call(() => api.equipArmor(addr));
    return moveTo(addr, plan.to, false);
  };

  const onSlotClick = (addr) => {
    const slot = slotAtAddr(addr, inv, chest);
    const now = Date.now();
    const lt = lastTap.current;
    if (slot && lt.addr === addr && now - lt.t < 320) {
      lastTap.current = { addr: null, t: 0 };
      setSel(null);
      quickMove(addr);
      return;
    }
    lastTap.current = { addr, t: now };
    if (!sel) {
      if (slot) setRawSel({ addr, half: false });
      return;
    }
    if (sameAddr(sel.addr, addr)) {
      setSel(null);
      return;
    }
    moveTo(sel.addr, addr, sel.half);
    setSel(null);
  };

  /** Sağ tık / uzun basma: yarısını seç (seçim varsa yarısını hedefe taşı). */
  const onSlotHalf = (addr) => {
    const slot = slotAtAddr(addr, inv, chest);
    if (!sel) {
      if (slot && slot.count > 1) {
        setSel({ addr, half: true });
        announce('Yığının yarısı seçildi. Hedef yuvaya dokun.');
      } else if (slot) {
        setSel({ addr, half: false });
      }
      return;
    }
    if (!sameAddr(sel.addr, addr)) moveTo(sel.addr, addr, true);
    setSel(null);
  };

  const dropAddr = (addr, count) => {
    const slot = slotAtAddr(addr, inv, chest);
    const p = parseAddr(addr);
    if (!slot || !p || p.kind === 'c') return false;
    const n = count === undefined ? slot.count : Math.max(1, Math.min(slot.count, Math.floor(count)));
    let ok = true;
    try {
      api.dropSlot(addr, n);
    } catch (_e) {
      ok = false;
    }
    bump();
    announce(ok ? 'Yere bırakıldı.' : 'Bırakılamadı.');
    setSel(null);
    return ok;
  };

  const onDrop = (from, to, zone) => {
    setSel(null);
    if (zone === 'drop') {
      dropAddr(from);
      return;
    }
    if (to) moveTo(from, to, false);
  };

  return {
    sel, setSel, moveTo, quickMove, onSlotClick, onSlotHalf, dropAddr, onDrop, call,
  };
}
