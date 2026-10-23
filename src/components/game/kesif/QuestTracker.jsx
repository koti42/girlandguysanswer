import React, { memo, useEffect, useRef, useState } from 'react';
import { LuCheck, LuChevronDown, LuLightbulb, LuScrollText } from 'react-icons/lu';
import { QUEST_COLLAPSE_KEY, parseQuestLine, storageGet, storageSet, touchText } from './kxHudUtils.js';

/**
 * Görev izleyici: başlık + en çok 6 satır; daraltılabilir (tercih yerel depoda). Daraltılmışken yeni görev
 * gelirse başlıkta "yeni" noktası yanar. `onHint` verilirse "İpucu" düğmesi çıkar (bulmaca/görev ipucu metni
 * döner; 9 sn gösterilir).
 *
 * quest: { title, lines[] } (hudStore); defaultCollapsed: kayıtlı tercih yoksa başlangıç durumu.
 */
const QuestTracker = ({ quest, onHint, defaultCollapsed = false }) => {
  const title = quest && quest.title ? quest.title : '';
  const lines = quest && Array.isArray(quest.lines) ? quest.lines : [];
  const [collapsed, setCollapsed] = useState(() => {
    const v = storageGet(QUEST_COLLAPSE_KEY, null);
    return v === null ? defaultCollapsed : v === '1';
  });
  const [fresh, setFresh] = useState(false);
  const [hint, setHint] = useState('');
  const [seenTitle, setSeenTitle] = useState(title);
  const hintTimer = useRef(0);

  // Görev değişince (render sırasında türetilmiş durum): daraltılmışsa "yeni" noktası yanar.
  if (title !== seenTitle) {
    setSeenTitle(title);
    if (title && collapsed) setFresh(true);
  }

  useEffect(() => () => clearTimeout(hintTimer.current), []);

  if (!title && !lines.length) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    storageSet(QUEST_COLLAPSE_KEY, next ? '1' : '0');
    if (!next) setFresh(false);
  };

  const askHint = () => {
    if (!onHint) return;
    let text = '';
    try {
      text = onHint() || '';
    } catch {
      text = '';
    }
    setHint(typeof text === 'string' && text.trim() ? touchText(text.trim()) : 'Şimdilik bir ipucu yok. Çevrene dikkatle bak.');
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(''), 9000);
  };

  return (
    <section className="kx-quest" data-collapsed={collapsed ? '1' : '0'} aria-label="Görev izleyici" data-no-tap>
      <button type="button" className="kx-quest-head" onClick={toggle} aria-expanded={!collapsed} aria-controls="kx-quest-body">
        <LuScrollText aria-hidden="true" className="kx-quest-ico" />
        <span className="kx-quest-title">{title || 'Görev'}</span>
        {fresh && (
          <span className="kx-quest-new" role="status">
            <span className="kx-sr">Yeni görev</span>
          </span>
        )}
        <LuChevronDown aria-hidden="true" className="kx-quest-chev" />
      </button>
      <div id="kx-quest-body" className="kx-quest-body" hidden={collapsed}>
        {lines.length > 0 && (
          <ul className="kx-quest-lines">
            {lines.map((l, i) => {
              const p = parseQuestLine(l);
              return (
                <li key={i} data-done={p.done ? '1' : '0'}>
                  <span className="kx-quest-mark" aria-hidden="true">
                    {p.done ? <LuCheck /> : null}
                  </span>
                  <span>
                    {p.done && <span className="kx-sr">Tamamlandı: </span>}
                    {p.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {onHint && (
          <button type="button" className="kx-quest-hintbtn" onClick={askHint}>
            <LuLightbulb aria-hidden="true" /> İpucu
          </button>
        )}
        {hint && (
          <p className="kx-quest-hint" role="status">
            {hint}
          </p>
        )}
      </div>
    </section>
  );
};

export default memo(QuestTracker);
