import React, { memo } from 'react';
import SpellCooldown from './SpellCooldown.jsx';

/*
 * Mana çubuğu (macera, büyü kullanılırken görünür): mavi dolgu + sayı. Asa elde ve mana büyü bedelinden azsa
 * kırmızımsı uyarı çerçevesi ve "mana yetersiz" etiketi (renge ek olarak metin). Mana yenilenirken yumuşak parıltı.
 *
 * Props: mana {value,max}, spell {manaCost,…}|null, calm (hareket azaltma: parıltı/nabız yok)
 * Elde asa varsa büyü bekleme göstergesi (SpellCooldown) çubuğun solunda, aynı satırda durur (ek yükseklik yok).
 * Görünürlük: azami mana 0 ise (insa/harita) ya da mana dolu ve elde asa yoksa gizli (HUD'u kalabalıklaştırmaz).
 */
const ManaBar = ({ mana, spell, calm = false }) => {
  const max = mana ? mana.max : 0;
  if (!(max > 0)) return null;
  const value = Math.max(0, Math.min(max, mana.value));
  const full = value >= max;
  if (full && !spell) return null;
  const pct = Math.round((value / max) * 100);
  const short = !!(spell && value < spell.manaCost);
  const castable = spell ? Math.floor(value / Math.max(1, spell.manaCost)) : 0;
  const label = 'Mana ' + value + ' / ' + max + (short ? ', büyü için yetersiz' : '');
  return (
    <div className="kx-mana" data-short={short ? '1' : '0'} data-full={full ? '1' : '0'} data-calm={calm ? '1' : '0'} data-testid="mana-bar">
      <SpellCooldown spell={spell} calm={calm} />
      <div className="kx-mana-track" role="meter" aria-label="Mana" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={label}>
        <span className="kx-mana-fill" style={{ width: pct + '%' }} />
        {spell && max > 0 ? <span className="kx-mana-mark" style={{ left: Math.min(100, Math.round((spell.manaCost / max) * 100)) + '%' }} aria-hidden="true" /> : null}
      </div>
      <span className="kx-mana-text" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="kx-mana-ico" focusable="false"><path d="M12 2l6.500 9L12 22 5.500 11 12 2z" /></svg>
        {value}
        <i>/{max}</i>
        {short ? <b>Yetersiz</b> : castable > 0 && spell ? <em>{castable}×</em> : null}
      </span>
    </div>
  );
};

export default memo(ManaBar);
