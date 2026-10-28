import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuTrophy } from 'react-icons/lu';
import UserAvatar from '../../UserAvatar';
import useAsync from '../useAsync';
import { formatNumber } from '../gameUtils';
import { DIFFICULTY_KEYS } from '../../../game/protocolZero/constants';
import protocolZeroApiDefault from '../../../services/protocolZeroApi';
import { difficultyName } from './pzUtils';

const PERIODS = [
    { key: 'all', label: 'Tüm zamanlar' },
    { key: 'weekly', label: 'Bu hafta' },
];

const Row = ({ e }) => {
    const name = e.user?.username || e.player_name;
    const inner = (
        <>
            <span className="w-6 shrink-0 text-center font-extrabold text-slate-400">{e.rank >= 1 && e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}</span>
            {e.user ? (
                <UserAvatar user={e.user} size="sm" />
            ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-black text-cyan-600 dark:text-cyan-300" aria-hidden="true">
                    {String(name || '?').slice(0, 1).toUpperCase()}
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                    {name}
                    {e.guest && <span className="ml-1 text-[10px] font-bold uppercase text-slate-400">misafir</span>}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {e.outcome === 'victory' ? '🏆 Zafer' : '💀 Yenilgi'} · {e.survival_days} gün · {difficultyName(e.difficulty)}
                </span>
            </span>
            <span className="text-sm font-extrabold tabular-nums">{formatNumber(e.score)}</span>
        </>
    );
    const cls = 'flex items-center gap-3 rounded-2xl px-2 py-1.5';
    return e.user?.username ? (
        <Link to={`/oyun/profil/${encodeURIComponent(e.user.username)}`} className={`${cls} hover:bg-indigo-50 dark:hover:bg-white/5`}>
            {inner}
        </Link>
    ) : (
        <div className={cls}>{inner}</div>
    );
};

/**
 * PROTOCOL: ZERO liderliği (herkese açık). Zorluk ve dönem sekmeleri; `dark` oyun içi rapor ekranı için koyu tema.
 */
const PzLeaderboard = ({ api = protocolZeroApiDefault, initialDifficulty = '', limit = 10, reloadKey = 0, dark = false, title = 'Küresel Liderlik' }) => {
    const [difficulty, setDifficulty] = useState(initialDifficulty);
    const [period, setPeriod] = useState('all');
    const fetcher = useCallback(() => api.leaderboard({ difficulty: difficulty || undefined, period, limit }), [api, difficulty, period, limit]);
    const { data, error, loading, reload } = useAsync(fetcher, `${difficulty}:${period}:${reloadKey}`);
    const entries = Array.isArray(data?.entries) ? data.entries : [];

    const tab = (active) =>
        `rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
            active ? 'bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-white shadow' : dark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/10'
        }`;

    return (
        <section className={`${dark ? 'pz-glass text-slate-100' : 'game-card'} rounded-3xl p-4 sm:p-5`} aria-labelledby="pz-lb-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="pz-lb-title" className="flex items-center gap-2 font-extrabold">
                    <LuTrophy className="text-gold" aria-hidden="true" /> {title}
                </h2>
                <div role="tablist" aria-label="Dönem" className={`inline-flex gap-1 rounded-xl p-1 ${dark ? 'bg-white/5' : 'bg-slate-100 dark:bg-white/5'}`}>
                    {PERIODS.map((p) => (
                        <button key={p.key} type="button" role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)} className={tab(period === p.key)}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Zorluk">
                <button type="button" aria-pressed={difficulty === ''} onClick={() => setDifficulty('')} className={tab(difficulty === '')}>
                    Hepsi
                </button>
                {DIFFICULTY_KEYS.map((k) => (
                    <button key={k} type="button" aria-pressed={difficulty === k} onClick={() => setDifficulty(k)} className={tab(difficulty === k)}>
                        {difficultyName(k)}
                    </button>
                ))}
            </div>

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
                        <li key={i} className={`h-10 animate-pulse rounded-2xl ${dark ? 'bg-white/5' : 'bg-slate-100 dark:bg-white/5'}`} />
                    ))}
                </ul>
            ) : entries.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Henüz kimse bu tabloya girmedi. İlk komutan sen ol!</p>
            ) : (
                <ol className="space-y-1">
                    {entries.map((e) => (
                        <li key={e.id ?? `${e.rank}-${e.player_name}`}>
                            <Row e={e} />
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
};

export default PzLeaderboard;
