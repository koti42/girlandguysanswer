import React, { memo } from 'react';

/*
 * Büyü bekleme göstergesi (asa elde iken): büyü adı, mana bedeli ve dairesel bekleme halkası.
 * Halka conic-gradient ile kalan orana göre kararır; hazırken parlak çerçeve + "Hazır" metni (renge ek olarak metin).
 * Props: spell {key,name,manaCost,cooldown01,ready}|null, calm
 */
const SPELL_COLORS = {
  ates_topu: '#ff8a3c', buz_mizragi: '#8fdcff', sifa_isigi: '#7dffb0', kuantum_sicrayisi: '#c07bff',
};

const SpellCooldown = ({ spell, calm = false }) => {
  if (!spell) return null;
  const left = Math.max(0, Math.min(1, spell.cooldown01));
  const color = SPELL_COLORS[spell.key] || '#c8b4ff';
  const state = left > 0 ? 'cd' : spell.ready ? 'ready' : 'mana';
  const status = state === 'cd' ? 'Bekliyor' : state === 'ready' ? 'Hazır' : 'Mana yetersiz';
  return (
    <div
      className="kx-spell"
      data-state={state}
      data-calm={calm ? '1' : '0'}
      style={{ '--kx-spell': color, '--kx-spell-left': left * 360 + 'deg' }}
      role="status"
      aria-label={`${spell.name}, ${spell.manaCost} mana, ${status}`}
      data-testid="spell-cooldown"
    >
      <span className="kx-spell-ring" aria-hidden="true">
        <span className="kx-spell-core" />
      </span>
      <span className="kx-spell-text">
        <b>{spell.name}</b>
        <small>
          {spell.manaCost} mana · {status}
        </small>
      </span>
    </div>
  );
};

export default memo(SpellCooldown);
