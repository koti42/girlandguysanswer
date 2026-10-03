import React from 'react';
import ShopArt from './ShopArt';
import JetonAmount from './Jeton';
import { formatNumber } from '../gameUtils';

/*
 * Cüzdan çipi: bakiye; tıklanınca işlem geçmişi. `onClick` yoksa yalnızca
 * gösterim (span).
 */
const WalletChip = ({ balance = 0, onClick, className = '' }) => {
    const body = (
        <>
            <ShopArt icon="wallet" className="h-5 w-5 shrink-0" />
            <JetonAmount value={balance} className="font-extrabold" />
        </>
    );
    const base = `inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-3.5 text-sm game-card ${className}`;
    if (!onClick) {
        return (
            <span className={base} aria-label={`Cüzdan: ${formatNumber(balance)} jeton`}>
                {body}
            </span>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${base} game-press hover:ring-2 hover:ring-amber-300/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral`}
            aria-label={`Cüzdan: ${formatNumber(balance)} jeton. İşlem geçmişini aç`}
        >
            {body}
        </button>
    );
};

export default WalletChip;
