import React, { memo, useEffect, useRef, useState } from 'react';
import { LuDoorOpen, LuHeartPulse } from 'react-icons/lu';
import { useFocusTrap } from './kxHooks.js';
import { deathMessage } from './kxHudUtils.js';

/**
 * Yenilgi ekranı: neden (çocuk dostu, şiddet yok), kayıp eşya notu ve "Yeniden Doğ".
 *
 * Yanlışlıkla dokunmayı önlemek için ekran açılınca `guardMs` (varsayılan 700 ms) boyunca düğme hazırlanır;
 * bu sürede tıklama yok sayılır (saldırı düğmesine basılı parmak "Yeniden Doğ"u tetiklemesin).
 *
 * Props: reason (metin | {cause:'fall'|'lava'|'drown'|'hunger'|'void'|'fire'|'boss'|'mob', by?}),
 *   lostCount (düşen eşya yığını sayısı), easy (kolay mod: eşya kaybı yok), onRespawn(), onExit(), busy.
 */
const DeathScreen = ({ reason, lostCount = 0, easy = false, onRespawn, onExit, guardMs = 700, busy = false }) => {
  const boxRef = useRef(null);
  const btnRef = useRef(null);
  const [ready, setReady] = useState(guardMs <= 0);
  const onKeyDown = useFocusTrap(boxRef, { initialRef: btnRef });

  useEffect(() => {
    if (guardMs <= 0) return undefined;
    const t = setTimeout(() => setReady(true), guardMs);
    return () => clearTimeout(t);
  }, [guardMs]);

  const msg = deathMessage(reason);
  let note;
  if (easy || !(lostCount > 0)) note = 'Eşyaların yanında. Yeniden doğunca kaldığın yerden devam edebilirsin.';
  else note = 'Eşyaların düştüğü yerde 5 dakika bekliyor. Yeniden doğduktan sonra gidip toplayabilirsin.';

  const go = () => {
    if (!ready || busy) return;
    if (onRespawn) onRespawn();
  };

  return (
    <div className="kx-overlay kx-overlay-dead">
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="kx-dead-title" aria-describedby="kx-dead-desc" className="kx-card kx-dead" onKeyDown={onKeyDown}>
        <span className="kx-dead-ico" aria-hidden="true">
          <LuHeartPulse />
        </span>
        <h2 id="kx-dead-title" className="kx-h">
          Bitkin düştün
        </h2>
        <p id="kx-dead-desc" className="kx-sub">
          <span className="kx-dead-reason">{msg}</span>
          <br />
          {note}
        </p>
        <div className="kx-stack">
          <button
            ref={btnRef}
            type="button"
            className="kx-btn kx-btn-primary kx-btn-guard"
            onClick={go}
            aria-disabled={!ready || busy}
            data-ready={ready ? '1' : '0'}
            style={{ '--guard': guardMs + 'ms' }}
          >
            Yeniden Doğ
          </button>
          {onExit && (
            <button type="button" className="kx-btn kx-btn-quiet" onClick={onExit} disabled={busy}>
              <LuDoorOpen aria-hidden="true" /> Çıkış
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(DeathScreen);
