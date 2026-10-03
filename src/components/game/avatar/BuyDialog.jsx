import React from 'react';
import { Link } from 'react-router-dom';
import { LuCoins, LuShoppingBag } from 'react-icons/lu';
import GameDialog from './GameDialog';
import { formatNumber } from '../gameUtils';

/*
 * Satın alma onayı: fiyat, bakiye ve sonrası. Bakiye yetmiyorsa onay kapalı
 * ve eksik miktar + nereden kazanılacağı yazar. Sunucu hatası (ör. bakiye bu
 * arada değişti) pencerede gösterilir; pencere açık kalır.
 */
const BuyDialog = ({ open, item, balance = 0, busy = false, error = null, onConfirm, onClose, preview = null }) => {
    const price = item?.price ?? 0;
    const missing = Math.max(0, price - balance);
    const enough = missing === 0;

    return (
        <GameDialog open={open && !!item} title={item ? `${item.label} satın alınsın mı?` : ''} onClose={onClose} dismissable={!busy}>
            {item && (
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        {preview && (
                            <div className="game-hero flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl">{preview}</div>
                        )}
                        <dl className="min-w-0 flex-1 space-y-1.5 text-sm">
                            <div className="flex justify-between gap-3">
                                <dt className="text-slate-500 dark:text-slate-400">Fiyat</dt>
                                <dd className="inline-flex items-center gap-1 font-extrabold tabular-nums">
                                    <LuCoins className="text-amber-500" aria-hidden="true" /> {formatNumber(price)}
                                </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-slate-500 dark:text-slate-400">Bakiyen</dt>
                                <dd className="font-bold tabular-nums">{formatNumber(balance)}</dd>
                            </div>
                            {enough && (
                                <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 dark:border-white/10">
                                    <dt className="text-slate-500 dark:text-slate-400">Sonra kalan</dt>
                                    <dd className="font-bold tabular-nums">{formatNumber(balance - price)}</dd>
                                </div>
                            )}
                        </dl>
                    </div>

                    {!enough && (
                        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200" role="status">
                            Yeterli jetonun yok: <strong className="tabular-nums">{formatNumber(missing)}</strong> jeton daha gerekiyor.
                            Koşu ve kule oyunlarında topladığın jetonlar cüzdanına eklenir.
                        </p>
                    )}
                    {enough && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Satın aldığın parça hep senin olur; giymek için karakterini kaydetmeyi unutma.
                        </p>
                    )}
                    {error && (
                        <p className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-300" role="alert">
                            {error}
                        </p>
                    )}

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            data-autofocus={enough ? undefined : true}
                            className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                            Vazgeç
                        </button>
                        {enough ? (
                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={busy}
                                data-autofocus
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-coral px-6 font-bold text-slate-950 shadow-lg game-press disabled:opacity-60"
                            >
                                <LuShoppingBag aria-hidden="true" />
                                {busy ? 'Satın alınıyor…' : `${formatNumber(price)} jetona satın al`}
                            </button>
                        ) : (
                            <Link
                                to="/oyun/kosu"
                                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 font-bold text-white game-press"
                            >
                                Jeton kazanmaya git
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </GameDialog>
    );
};

export default BuyDialog;
