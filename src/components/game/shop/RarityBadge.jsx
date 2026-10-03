import React from 'react';
import { rarityOf } from '../../../game/shop';

/*
 * Nadirlik rozeti: RARITY renk gradyanı + yıldız sayısı (renk körlüğünde de
 * ayırt edilsin) + Türkçe etiket. Renkler titles.js'te AA kontrastlı.
 */
const RarityBadge = ({ rarity, size = 'sm', className = '' }) => {
    const r = rarityOf(rarity);
    const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-extrabold uppercase tracking-wide shadow-sm ${pad} ${className}`}
            style={{ backgroundImage: `linear-gradient(90deg, ${r.colors.join(', ')})`, color: r.textColor }}
            data-rarity={rarity || 'common'}
        >
            <span aria-hidden="true" className="tracking-tighter">{'★'.repeat(r.stars)}</span>
            {r.label}
        </span>
    );
};

export default RarityBadge;
