import React from 'react';
import ShopArt from './ShopArt';
import { formatNumber } from '../gameUtils';

/** Altın jeton ikonu (ICONS.jeton) — süs. */
export const JetonIcon = ({ className = 'h-4 w-4' }) => <ShopArt icon="jeton" className={`inline-block shrink-0 ${className}`} />;

/** Jeton miktarı: ikon + sayı; ekran okuyucuya "N jeton". */
const JetonAmount = ({ value, className = '', iconClassName = 'h-4 w-4' }) => (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
        <JetonIcon className={iconClassName} />
        <span>{formatNumber(value)}</span>
        <span className="sr-only"> jeton</span>
    </span>
);

export default JetonAmount;
