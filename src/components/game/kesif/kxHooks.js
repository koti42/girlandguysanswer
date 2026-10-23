/*
 * KEŞİF arayüz kancaları: odak tuzağı, hareket azaltma, kapsayıcı ölçüsü, hasar yanıp sönmesi,
 * elde tutulan eşya bildirimi. React bileşenleri dışında DOM'a modül yüklenirken dokunmaz.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Kapsayıcıdaki odaklanabilir öğeler (görünmeyenler [hidden] ile elenir). */
export function focusablesIn(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const list = root.querySelectorAll(FOCUSABLE);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.hasAttribute('hidden') || el.closest('[hidden]') || el.getAttribute('aria-hidden') === 'true') continue;
    out.push(el);
  }
  return out;
}

/**
 * Odak tuzağı: açılınca odak `initialRef` (yoksa ilk öğe) üzerine gider, Tab/Shift+Tab kapsayıcıda döner,
 * kapanınca odak eski öğeye döner. Dönen `onKeyDown` iletişim kutusu düğümüne verilir.
 */
export function useFocusTrap(containerRef, { active = true, initialRef = null, restore = true } = {}) {
  useEffect(() => {
    if (!active) return undefined;
    const prev = typeof document !== 'undefined' ? document.activeElement : null;
    const root = containerRef.current;
    const target = (initialRef && initialRef.current) || focusablesIn(root)[0] || root;
    if (target && typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch {
        // odak verilemedi (düğüm ayrılmış olabilir)
      }
    }
    return () => {
      if (restore && prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try {
          prev.focus({ preventScroll: true });
        } catch {
          // yut
        }
      }
    };
    // Yalnızca açılış/kapanışta çalışır: odak her render'da çalınmasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return useCallback(
    (e) => {
      if (!active || e.key !== 'Tab') return;
      const items = focusablesIn(containerRef.current);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || !containerRef.current.contains(cur))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (cur === last || !containerRef.current.contains(cur))) {
        e.preventDefault();
        first.focus();
      }
    },
    [active, containerRef]
  );
}

/** prefers-reduced-motion (canlı). */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    let mq;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return undefined;
    }
    const on = () => setReduced(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', on);
    else if (mq.addListener) mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else if (mq.removeListener) mq.removeListener(on);
    };
  }, []);
  return reduced;
}

/** Kapsayıcı boyutu ve yönü (ResizeObserver; yoksa window resize). */
export function useContainerSize(ref, fallback = { w: 800, h: 450 }) {
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width) || fallback.w;
      const h = Math.round(r.height) || fallback.h;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(read);
      ro.observe(el);
    }
    window.addEventListener('resize', read);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', read);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
  return { w: size.w, h: size.h, portrait: size.h > size.w };
}

/**
 * Hasar yanıp sönmesi: can düşünce `hurtKey` artar (CSS animasyonunu yeniden başlatmak için `key`
 * olarak kullanılır); `low` can azken kalıcı hafif vinyet içindir. Can yenilenince (ölüm sonrası)
 * yanıp sönme tetiklenmez.
 */
export function useDamageFlash(hp, maxHp, onHurt) {
  const prev = useRef(hp);
  const [hurtKey, setHurtKey] = useState(0);
  const [amount, setAmount] = useState(0);
  const cb = useRef(onHurt);
  useEffect(() => {
    cb.current = onHurt;
  });
  useEffect(() => {
    const p = prev.current;
    prev.current = hp;
    if (hp < p) {
      const lost = p - hp;
      setAmount(Math.min(1, lost / Math.max(2, maxHp * 0.5)));
      setHurtKey((k) => k + 1);
      if (cb.current) {
        try {
          cb.current({ lost, hp });
        } catch {
          // dinleyici hatası arayüzü bozmasın
        }
      }
    }
  }, [hp, maxHp]);
  return { hurtKey, amount, low: hp > 0 && hp <= Math.max(4, maxHp * 0.2) };
}

/**
 * Elde tutulan eşya değişince kısa süre görünen bildirim (ilk değer gösterilmez).
 * Değişim render sırasında türetilir; yalnızca kapanış zamanlayıcısı efekttedir.
 */
export function useHeldToast(held, ms = 1900) {
  const [st, setSt] = useState({ held, key: 0, visible: false });
  if (held !== st.held) setSt({ held, key: st.key + 1, visible: Boolean(held) });
  useEffect(() => {
    if (!st.visible) return undefined;
    const k = st.key;
    const t = setTimeout(() => setSt((s) => (s.key === k ? { ...s, visible: false } : s)), ms);
    return () => clearTimeout(t);
  }, [st.key, st.visible, ms]);
  return { text: st.visible && st.held ? st.held : '', key: st.key };
}
