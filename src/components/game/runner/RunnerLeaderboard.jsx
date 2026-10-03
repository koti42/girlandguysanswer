import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuTrophy } from 'react-icons/lu';
import UserAvatar from '../../UserAvatar';
import useAsync from '../useAsync';
import { formatNumber } from '../gameUtils';
import { gameApi } from '../../../services/gameApi';

const PERIODS = [
    { key: 'weekly', label: 'Haftalık' },
    { key: 'all', label: 'Tüm zamanlar' },
];

/** Lobideki mini koşu liderliği (ilk 5 + benim sıram). Uç giriş istiyor. */
const RunnerLeaderboard = ({ reloadKey = 0 }) => {
    const [period, setPeriod] = useState('weekly');
    const fetcher = useCallback(() => gameApi.runnerLeaderboard({ period, gender: 'all', limit: 5 }), [period]);
    const { data, error, loading, reload } = useAsync(fetcher, `${period}:${reloadKey}`);
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    const me = data?.me;

    return (
        <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="runner-lb-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="runner-lb-title" className="flex items-center gap-2 font-extrabold">
                    <LuTrophy className="text-gold" aria-hidden="true" /> Koşu Liderliği
                </h2>
                <div role="tablist" aria-label="Liderlik dönemi" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
                    {PERIODS.map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            role="tab"
                            aria-selected={period === p.key}
                            onClick={() => setPeriod(p.key)}
                            className={`rounded-lg px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                                period === p.key
                                    ? 'bg-gradient-to-r from-coral to-fuchsia-500 text-white shadow'
                                    : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/10'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            <div role="tabpanel" aria-label={PERIODS.find((p) => p.key === period)?.label}>
                {error ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Liderlik yüklenemedi.{' '}
                        <button type="button" onClick={reload} className="min-h-[44px] font-semibold text-coral underline">
                            Tekrar dene
                        </button>
                    </p>
                ) : loading ? (
                    <ul className="space-y-2" aria-hidden="true">
                        {[0, 1, 2].map((i) => (
                            <li key={i} className="h-9 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
                        ))}
                    </ul>
                ) : entries.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {period === 'weekly' ? 'Bu hafta henüz kimse koşmadı. İlk sen ol!' : 'Henüz kimse koşmadı. İlk sen ol!'}
                    </p>
                ) : (
                    <ol className="space-y-1.5">
                        {entries.map((e, i) => (
                            <li key={e.user?.id ?? `${e.rank}-${i}`}>
                                <Link
                                    to={e.user?.username ? `/oyun/profil/${encodeURIComponent(e.user.username)}` : '/oyun/kosu'}
                                    className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-indigo-50 dark:hover:bg-white/5"
                                >
                                    <span className="w-6 shrink-0 text-center font-extrabold text-slate-400">
                                        {e.rank >= 1 && e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}
                                    </span>
                                    <UserAvatar user={e.user} size="sm" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.user?.username || 'Oyuncu'}</span>
                                    <span className="shrink-0 text-right">
                                        <span className="block text-sm font-extrabold tabular-nums">{formatNumber(e.score)}</span>
                                        {e.distance != null && (
                                            <span className="block text-[10px] font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                                                {formatNumber(e.distance)} m
                                            </span>
                                        )}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ol>
                )}
                {!error && !loading && (
                    <p className="mt-3 rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">
                        {me?.rank ? `Senin sıran: #${me.rank} · ${formatNumber(me.score)} puan` : 'Henüz sıralamada değilsin. Bir koşu yap, yerini al!'}
                    </p>
                )}
            </div>
        </section>
    );
};

export default RunnerLeaderboard;
