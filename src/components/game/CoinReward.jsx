import React from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight, LuCoins } from 'react-icons/lu';
import { formatNumber } from './gameUtils';

const toCount = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/*
 * Sonuç ekranlarındaki (koşu + kule; SPA + gömme) jeton ödülü: "+N jeton",
 * güncel cüzdan bakiyesi ve "Mağazaya git" — kazanılan jetonun nereye
 * harcanacağını gösterir (amaç duygusu).
 *
 * onShop verilirse (mobil gömme, Router yok) bağlantı yerine buton olur ve
 * native'e openUrl gönderilir. Mağaza tasarımları (ShopArt) bilerek
 * kullanılmıyor: oyun ekranı parçasına tasarım verisi girmesin.
 *
 * capped: sunucu `coins_capped` döndürdüyse (oyun başı ya da günlük jeton
 * tavanı) kısa bir açıklama gösterilir; 0 jetonla tavan yalnızca günlük
 * sınırdan olabilir.
 */
const CoinReward = ({ coins, balance, capped = false, onShop, className = '' }) => {
    const earned = toCount(coins) ?? 0;
    const bal = toCount(balance);
    if (earned === 0 && bal == null && !capped) return null;
    const capNote = !capped
        ? null
        : earned > 0
            ? 'Jeton sınırına ulaşıldı; fazlası cüzdana eklenmedi.'
            : 'Bugünkü jeton sınırına ulaştın, yarın yeniden kazanabilirsin.';

    const ctaCls =
        'inline-flex min-h-[44px] items-center gap-1 rounded-full bg-white px-4 text-sm font-extrabold text-slate-900 shadow-lg game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
    const cta = (
        <>
            Mağazaya git <LuChevronRight aria-hidden="true" />
        </>
    );

    return (
        <div
            className={`mt-4 flex flex-col items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-amber-400/20 via-amber-300/10 to-coral/20 px-4 py-3 text-left ring-1 ring-amber-300/30 sm:flex-row ${className}`}
            data-testid="coin-reward"
        >
            <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-amber-500 text-xl text-amber-950 shadow-inner">
                    <LuCoins aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="font-extrabold tabular-nums text-amber-100">
                        {earned > 0 ? `+${formatNumber(earned)} jeton kazandın` : 'Bu oyunda jeton kazanılmadı'}
                    </p>
                    {capNote && (
                        <p className="text-xs font-semibold text-amber-200" data-testid="coin-reward-capped">
                            {capNote}
                        </p>
                    )}
                    {bal != null && (
                        <p className="text-xs text-white/75 tabular-nums">
                            Cüzdanın: <strong className="text-white">{formatNumber(bal)}</strong> jeton · çerçeve, mini avatar ve unvan al
                        </p>
                    )}
                </div>
            </div>
            {onShop ? (
                <button type="button" onClick={onShop} className={ctaCls}>
                    {cta}
                </button>
            ) : (
                <Link to="/oyun/magaza" className={ctaCls}>
                    {cta}
                </Link>
            )}
        </div>
    );
};

export default CoinReward;
