import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuArrowDownLeft, LuArrowUpRight, LuRotateCcw } from 'react-icons/lu';
import GameDialog from '../avatar/GameDialog';
import JetonAmount from './Jeton';
import { getDesign } from '../../../game/shop';
import { shopApi } from '../../../services/shopApi';
import { formatDate, formatNumber } from '../gameUtils';
import { shopError, toInt, txLabel } from './shopUtils';

/*
 * Cüzdan işlem geçmişi (GET /game/wallet/transactions?page). Açılınca ilk
 * sayfa; "Daha fazla" ile sonraki sayfalar eklenir. Kapanıp açılınca baştan.
 * Yarışan yanıtlar (hızlı aç/kapa) istek sırasına göre yok sayılır.
 */
const WalletHistory = ({ open, wallet, onClose }) => {
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(0);
    const [lastPage, setLastPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const reqRef = useRef(0);

    const load = useCallback(async (nextPage) => {
        const req = ++reqRef.current;
        setLoading(true);
        setError(null);
        try {
            const data = await shopApi.transactions(nextPage);
            if (req !== reqRef.current) return;
            const list = Array.isArray(data?.transactions) ? data.transactions : [];
            setRows((prev) => (nextPage === 1 ? list : [...prev, ...list.filter((t) => !prev.some((p) => p.id === t.id))]));
            setPage(nextPage);
            setLastPage(Math.max(1, toInt(data?.pagination?.last_page, 1)));
        } catch (err) {
            if (req === reqRef.current) setError(shopError(err, 'İşlem geçmişi yüklenemedi.').message);
        } finally {
            if (req === reqRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        // Açılışta ilk sayfa (zamanlanmış: effect gövdesinde senkron setState yok)
        const t = setTimeout(() => load(1), 0);
        return () => {
            clearTimeout(t);
            reqRef.current += 1;
        };
    }, [open, load]);

    return (
        <GameDialog open={open} title="Cüzdan" onClose={onClose} size="max-w-lg">
            <div className="space-y-4" data-testid="wallet-history">
                <dl className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl bg-amber-500/10 p-2.5">
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Bakiye</dt>
                        <dd className="mt-0.5 flex justify-center font-extrabold">
                            <JetonAmount value={wallet?.balance ?? 0} />
                        </dd>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/10 p-2.5">
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Kazanılan</dt>
                        <dd className="mt-0.5 font-extrabold tabular-nums">{formatNumber(wallet?.earned_total ?? 0)}</dd>
                    </div>
                    <div className="rounded-2xl bg-rose-500/10 p-2.5">
                        <dt className="text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">Harcanan</dt>
                        <dd className="mt-0.5 font-extrabold tabular-nums">{formatNumber(wallet?.spent_total ?? 0)}</dd>
                    </div>
                </dl>

                <section aria-labelledby="wallet-tx-title">
                    <h3 id="wallet-tx-title" className="mb-2 text-sm font-extrabold">İşlem geçmişi</h3>
                    {rows.length === 0 && loading ? (
                        <ul className="space-y-2" aria-hidden="true">
                            {[0, 1, 2, 3].map((i) => (
                                <li key={i} className="h-12 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
                            ))}
                        </ul>
                    ) : rows.length === 0 && !error ? (
                        <p className="rounded-2xl bg-slate-100 px-3 py-4 text-center text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
                            Henüz bir hareket yok. Koşu ve kule oyunlarında topladığın jetonlar burada görünür.
                        </p>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-white/5">
                            {rows.map((t) => {
                                const amount = toInt(t.amount);
                                const plus = amount > 0;
                                // Karakter parçalarının tasarım kaydı yok: sunucunun verdiği ürün adına düş.
                                const itemName = t.item_key ? getDesign(t.item_key)?.name || (typeof t.item_name === 'string' ? t.item_name : null) : null;
                                return (
                                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                                        <span
                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${plus ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'}`}
                                            aria-hidden="true"
                                        >
                                            {plus ? <LuArrowDownLeft /> : <LuArrowUpRight />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-bold">{txLabel(t.type)}</span>
                                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                                {[itemName || t.note, formatDate(t.created_at)].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span className={`block text-sm font-extrabold tabular-nums ${plus ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>
                                                {plus ? '+' : '−'}
                                                {formatNumber(Math.abs(amount))}
                                            </span>
                                            {t.balance_after != null && (
                                                <span className="block text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
                                                    Bakiye {formatNumber(t.balance_after)}
                                                </span>
                                            )}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {error && (
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-rose-600 dark:text-rose-300" role="alert">
                            {error}
                            <button type="button" onClick={() => load(page + 1)} className="inline-flex min-h-[44px] items-center gap-1 font-bold underline">
                                <LuRotateCcw aria-hidden="true" /> Tekrar dene
                            </button>
                        </p>
                    )}
                    {page > 0 && page < lastPage && !error && (
                        <button
                            type="button"
                            onClick={() => load(page + 1)}
                            disabled={loading}
                            className="mt-3 w-full min-h-[44px] rounded-2xl bg-slate-100 text-sm font-bold text-slate-700 game-press disabled:opacity-60 dark:bg-white/10 dark:text-slate-200"
                        >
                            {loading ? 'Yükleniyor…' : 'Daha fazla göster'}
                        </button>
                    )}
                </section>
            </div>
        </GameDialog>
    );
};

export default WalletHistory;
