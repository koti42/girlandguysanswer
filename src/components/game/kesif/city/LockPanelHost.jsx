import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import LockPanel from './LockPanel.jsx';
import HackPanel from './HackPanel.jsx';

/*
 * Kilit / çözme / asansör panelinin ev sahibi (PanelHost `dialogue` durumunda çizer; sözleşme §12 "dialogue-style" küçük paneller).
 * Motor cephesinden `getLockPanel()` düz JSON görüntüsünü ~11 Hz yoklar (yalnız değişince yeniden çizer) ve girdiyi `lockInput(act)` ile gönderir.
 * Görüntü yoksa (başka bir `dialogue` panel türü, örn. NPC diyaloğu) hiçbir şey çizmez → bileşenler yan yana güvenle bulunur.
 *
 * Props: api ({getLockPanel, lockInput}), onClose, accessibility, reducedMotion, pollMs
 */
const LockPanelHost = ({
  api, onClose, accessibility = false, reducedMotion = false, pollMs = 90,
}) => {
  const [snap, setSnap] = useState(() => (api && typeof api.getLockPanel === 'function' ? api.getLockPanel() : null));
  const last = useRef(snap ? JSON.stringify(snap) : '');

  const read = useCallback(() => {
    const s = api && typeof api.getLockPanel === 'function' ? api.getLockPanel() : null;
    const k = s ? JSON.stringify(s) : '';
    if (k !== last.current) {
      last.current = k;
      setSnap(s);
    }
  }, [api]);

  useEffect(() => {
    const id = setInterval(read, pollMs);
    return () => clearInterval(id);
  }, [read, pollMs]);

  const onInput = useCallback(
    (act) => {
      const r = api && typeof api.lockInput === 'function' ? api.lockInput(act) : null;
      read();
      return r;
    },
    [api, read],
  );

  const close = useCallback(() => {
    if (api && typeof api.lockInput === 'function') api.lockInput({ op: 'close' });
    read();
    if (onClose) onClose();
  }, [api, onClose, read]);

  if (!snap) return null;
  if (snap.type === 'hack') return <HackPanel snap={snap} onInput={onInput} onClose={close} accessibility={accessibility} reducedMotion={reducedMotion} />;
  return <LockPanel snap={snap} onInput={onInput} onClose={close} accessibility={accessibility} reducedMotion={reducedMotion} />;
};

export default memo(LockPanelHost);
