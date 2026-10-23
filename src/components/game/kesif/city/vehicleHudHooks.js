/*
 * KEŞİF — sürüş arayüzü React kancaları (vehicle_ui): bileşen dosyalarında yalnız bileşen dışa aktarılsın diye ayrı.
 *   useSlowValue(value, ms)   değeri en çok 1/ms sıklıkla yansıtır (ekran okuyucu etiketleri ≤ 0.5 Hz)
 *   useShortLandscape()       yatay ve alçak (< 460 px) ekran mı (telefon yatay): dinleyici resize/orientationchange
 */
import { useEffect, useRef, useState } from 'react';

function readShort() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth > window.innerHeight && window.innerHeight < 460;
}

export function useShortLandscape() {
  const [v, setV] = useState(readShort);
  useEffect(() => {
    const on = () => setV(readShort());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return v;
}

export function useSlowValue(value, ms = 2000) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setInterval(() => setV(ref.current), ms);
    return () => clearInterval(id);
  }, [ms]);
  return v;
}
