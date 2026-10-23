/*
 * KEŞİF — ipucu kancaları (React).
 *
 *   useAutoHideHint(hint, ms)       etkileşim ipucu satırı ("[Sağ tık] Sandığı aç"): metin belirince `ms` süre görünür, sonra kendiliğinden gizlenir.
 *                                   Aynı metin sürerken (oyuncu durup bakmaya devam ederken) TEKRAR GÖRÜNMEZ; yalnızca metin değişir ya da boşalıp
 *                                   yeniden dolarsa (başka şeye bakıp dönme, yeni olay) yeniden çıkar.
 *   useControlsToast(opts)          tek seferlik "Kontroller için Esc → Ayarlar → Nasıl Oynanır" bildirimi (dünya başlığı bittikten sonra).
 */
import { useEffect, useRef, useState } from 'react';
import { markHintSeen, readHintSeen } from './kxHintSeen.js';

export const HINT_SHOW_MS = 6500;
const TOAST_FALLBACK_MS = 2600;
const TOAST_MIN_MS = 1200;
const AFTER_BANNER_MS = 700;

export function useAutoHideHint(hint, ms = HINT_SHOW_MS) {
  const raw = typeof hint === 'string' && hint.trim() ? hint : '';
  const [st, setSt] = useState({ hint: raw, key: 0, visible: Boolean(raw) });
  // Değişim render sırasında türetilir; yalnızca kapanış zamanlayıcısı efekttedir.
  if (raw !== st.hint) setSt({ hint: raw, key: st.key + 1, visible: Boolean(raw) });
  useEffect(() => {
    if (!st.visible) return undefined;
    const k = st.key;
    const t = setTimeout(() => setSt((s) => (s.key === k ? { ...s, visible: false } : s)), ms);
    return () => clearTimeout(t);
  }, [st.key, st.visible, ms]);
  return st.visible && st.hint ? st.hint : '';
}

/**
 * opts: { enabled, bannerUntil (epoch ms, 0 = başlık yok), show() → bool (bildirimi kuyruğa ekler; eklendiyse true) }
 * Oyun sürerken (enabled) ve daha önce görülmediyse, dünya başlığı bittikten sonra bir kez çalışır ve işaretler.
 */
export function useControlsToast({ enabled, bannerUntil = 0, show }) {
  const done = useRef(false);
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  });
  useEffect(() => {
    if (!enabled || done.current || readHintSeen()) return undefined;
    const wait = bannerUntil > 0 ? Math.max(0, bannerUntil - Date.now()) + AFTER_BANNER_MS : TOAST_FALLBACK_MS;
    const t = setTimeout(() => {
      if (done.current) return;
      let ok = false;
      try {
        ok = showRef.current() !== false;
      } catch {
        ok = false;
      }
      if (ok) {
        done.current = true;
        markHintSeen();
      }
    }, Math.max(TOAST_MIN_MS, wait));
    return () => clearTimeout(t);
  }, [enabled, bannerUntil]);
}
