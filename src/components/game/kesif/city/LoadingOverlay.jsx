import React, { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { LuOrbit } from 'react-icons/lu';
import {
  LOADING_DELAY_MS, LOADING_DONE_TEXT, LOADING_TIPS, TIP_EVERY_MS, loadingAnnouncement, loadingPercent, tipAt,
} from '../../../../game/kesif/sim/city/cityHudData.js';
import './cityHud.css';

/*
 * Boyut geçişi yükleme paneli (cityhud; sözleşme §5 "hold" + §12). Veri: hudStore.dimLoading {active, progress 0..1, label}
 * (gameTransition yazar) ya da ui === 'loading'.
 * Gecikme: geçiş makinesi `dimLoading`i zaten HOLD'un 0,6. saniyesinden sonra açar (kısa geçişte hiç etkinleşmez) → panel o andan itibaren
 * yalnız `guardMs` (150 ms; tek kareli yanıp sönmeyi önler) bekler, böylece çubuk "geçişin 0,6. saniyesinde" görünür. Genel `ui === 'loading'`
 * durumunda (geçiş makinesi gecikmesi yok) panel `delayMs` (0,6 sn) bekler.
 *
 *  - Ekran okuyucu: HER ZAMAN bağlı `role=status aria-live=polite` bölgesi: "Boyut geçişi yükleniyor, yüzde 50." (25'lik basamaklar), bitince
 *    "Boyut geçişi tamamlandı." (2,5 sn). Panelin kendisi `aria-busy` bir grup; ilerleme çubuğu role=progressbar.
 *  - İpuçları: aile dostu, Türkçe (cityHudData.LOADING_TIPS); her `tipMs`te döner, hareket azaltmada sabit kalır.
 *  - Hareket azaltma / erişilebilirlik: dönen simge ve çubuk geçişi kapalı (data-reduced), büyük yazı + opak zemin (data-a11y).
 *  - Tıklamayı engellemez (pointer-events: none); giriş zaten geçiş makinesince kilitlidir.
 * Props: store (hudStore), reducedMotion, accessibility, delayMs (ui=loading), guardMs (dimLoading), tipMs.
 */
const LOADING_GUARD_MS = 150;

const LoadingOverlay = ({
  store, reducedMotion = false, accessibility = false, delayMs = LOADING_DELAY_MS, guardMs = LOADING_GUARD_MS, tipMs = TIP_EVERY_MS,
}) => {
  const dl = useSyncExternalStore(store.subscribe, () => store.get().dimLoading, () => null);
  const ui = useSyncExternalStore(store.subscribe, () => store.get().ui, () => 'none');
  const active = Boolean(dl && dl.active) || ui === 'loading';
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  const [tip, setTip] = useState(() => Math.floor(Date.now() / 1000) % LOADING_TIPS.length);

  // etkinlik değişimi (render sırasında türetilmiş durum): biterse panel kapanır; görünmüşse "tamamlandı" duyurusu verilir
  if (prevActive !== active) {
    setPrevActive(active);
    if (!active) {
      if (shown) setDone(true);
      setShown(false);
    } else if (done) setDone(false);
  }

  const wait = dl && dl.active ? guardMs : delayMs;
  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => setShown(true), wait);
    return () => clearTimeout(t);
  }, [active, wait]);

  useEffect(() => {
    if (!shown || reducedMotion) return undefined;
    const id = setInterval(() => setTip((i) => i + 1), tipMs);
    return () => clearInterval(id);
  }, [shown, reducedMotion, tipMs]);

  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 2500);
    return () => clearTimeout(t);
  }, [done]);

  const hasProgress = Boolean(dl && dl.active);
  const progress = hasProgress ? dl.progress : 0;
  const pct = loadingPercent(progress);
  const indeterminate = !hasProgress || pct <= 0;
  const label = (dl && dl.label) || 'Boyut geçişi…';
  const live = shown ? loadingAnnouncement(hasProgress ? progress : 0) : done ? LOADING_DONE_TEXT : '';

  return (
    <>
      <div className="kx-sr" role="status" aria-live="polite" aria-atomic="true" data-testid="city-loading-live">
        {live}
      </div>
      {shown && active ? (
        <div
          className="kcl-scrim"
          data-testid="city-loading"
          data-a11y={accessibility ? '1' : '0'}
          data-reduced={reducedMotion ? '1' : '0'}
          role="group"
          aria-label="Boyut geçişi yükleniyor"
          aria-busy="true"
        >
          <div className="kcl-card">
            <span className="kcl-ico" aria-hidden="true">
              <LuOrbit />
            </span>
            <h2 className="kcl-title">{label}</h2>
            <div
              className="kcl-bar"
              role="progressbar"
              aria-label="Boyut geçişi ilerlemesi"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={indeterminate ? undefined : pct}
              aria-valuetext={indeterminate ? 'Hazırlanıyor' : 'Yüzde ' + pct}
              data-indeterminate={indeterminate ? '1' : '0'}
            >
              <span style={indeterminate ? undefined : { '--kcl-p': pct + '%' }} />
            </div>
            <p className="kcl-pct" aria-hidden="true">
              {indeterminate ? ' ' : '%' + pct}
            </p>
            <p className="kcl-tip" aria-hidden="true" data-testid="city-loading-tip">
              <b>İpucu · </b>
              {tipAt(tip)}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default memo(LoadingOverlay);
