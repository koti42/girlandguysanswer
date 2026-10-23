import React, { memo, useEffect, useRef, useState } from 'react';
import { LuCompass, LuCrown } from 'react-icons/lu';
import { useFocusTrap, usePrefersReducedMotion } from './kxHooks.js';
import { formatCount, formatDuration } from './kxHudUtils.js';

const STAT_DEFS = [
  { key: 'playTime', label: 'Oynama süresi', fmt: (v) => formatDuration(v), count: false },
  { key: 'puzzlesSolved', label: 'Çözülen bulmaca' },
  { key: 'crystals', label: 'Anahtar kristali' },
  { key: 'achievements', label: 'Başarım' },
  { key: 'mobsKilled', label: 'Yenilen yaratık' },
  { key: 'blocksBroken', label: 'Kırılan blok' },
  { key: 'blocksPlaced', label: 'Yerleştirilen blok' },
  { key: 'distance', label: 'Yürünen mesafe', fmt: (v) => formatCount(v) + ' blok' },
  { key: 'deaths', label: 'Yenilgi' },
];

/** Hedefe doğru yumuşak sayım; hareket azaltmada doğrudan hedef. */
function useCount(target, reduced, ms = 1100) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  const still = reduced || typeof requestAnimationFrame !== 'function';
  useEffect(() => {
    if (still) return undefined;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(target * e));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, still, ms]);
  return still ? target : v;
}

const Stat = memo(function Stat({ def, value, reduced, index }) {
  const counted = useCount(def.count === false ? 0 : value, reduced);
  const shown = def.count === false ? value : counted;
  return (
    <li className="kx-stat" style={{ '--i': index }}>
      {/* Görsel değer sayarak yükselir; ekran okuyucu yalnız son değeri duyar. */}
      <span className="kx-stat-val" aria-hidden="true">
        {def.fmt ? def.fmt(shown) : formatCount(shown)}
      </span>
      <span className="kx-sr">{def.fmt ? def.fmt(value) : formatCount(value)} </span>
      <span className="kx-stat-label">{def.label}</span>
    </li>
  );
});

/**
 * "Dünya Fethedildi": son boss sonrası zafer ekranı. Konfeti yok; yavaş dönen ışık huzmeleri, taç ve sırayla
 * beliren istatistik kartları. Devam (sandbox) ya da çıkış.
 *
 * stats: { playTime(sn), puzzlesSolved, crystals, achievements, mobsKilled, blocksBroken, blocksPlaced,
 *          distance, deaths } — verilmeyen alanlar gösterilmez.
 */
const VictoryScreen = ({ stats, worldName, onContinue, onExit }) => {
  const boxRef = useRef(null);
  const btnRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const onKeyDown = useFocusTrap(boxRef, { initialRef: btnRef });
  const rows = STAT_DEFS.filter((d) => stats && typeof stats[d.key] === 'number' && Number.isFinite(stats[d.key]));

  return (
    <div className="kx-overlay kx-overlay-victory" data-reduced={reduced ? '1' : '0'}>
      <div className="kx-rays" aria-hidden="true" />
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="kx-win-title" aria-describedby="kx-win-desc" className="kx-card kx-victory" onKeyDown={onKeyDown}>
        <span className="kx-crown" aria-hidden="true">
          <LuCrown />
        </span>
        <h2 id="kx-win-title" className="kx-h kx-h-win">
          Dünya Fethedildi
        </h2>
        <p id="kx-win-desc" className="kx-sub">
          {worldName ? worldName + ' artık senin. ' : ''}Çekirdeğin bekçisi yenildi ve bütün mühürler kırıldı. İstersen keşfetmeye devam edebilirsin.
        </p>
        {rows.length > 0 && (
          <ul className="kx-stats" aria-label="Macera özeti">
            {rows.map((d, i) => (
              <Stat key={d.key} def={d} value={stats[d.key]} reduced={reduced} index={i} />
            ))}
          </ul>
        )}
        <div className="kx-stack kx-stack-row">
          <button ref={btnRef} type="button" className="kx-btn kx-btn-primary" onClick={onContinue}>
            <LuCompass aria-hidden="true" /> Keşfetmeye devam et
          </button>
          {onExit && (
            <button type="button" className="kx-btn kx-btn-quiet" onClick={onExit}>
              Çık
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(VictoryScreen);
