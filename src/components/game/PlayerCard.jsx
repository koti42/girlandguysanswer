import React from 'react';
import { Link } from 'react-router-dom';
import UserAvatar from '../UserAvatar';
import LeagueBadge from './LeagueBadge';
import { clampPct, formatNumber } from './gameUtils';

export const XpBar = ({ player, dark = true }) => {
    const lp = player?.level_progress || {};
    const pct = clampPct(lp.percent);
    return (
        <div>
            <div className={`flex justify-between text-[11px] font-semibold mb-1 ${dark ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                <span>Seviye {player?.level ?? 1}</span>
                <span className="tabular-nums">
                    {formatNumber(player?.xp)} / {formatNumber(lp.next_level_xp)} XP
                </span>
            </div>
            <div
                className={`h-3 rounded-full overflow-hidden ${dark ? 'bg-white/15' : 'bg-slate-200 dark:bg-white/10'}`}
                role="progressbar"
                aria-label="Seviye ilerlemesi"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
            >
                <div className="h-full rounded-full bg-gradient-to-r from-coral via-orange-400 to-gold game-bar-fill" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

export const StreakFlame = ({ streak = 0, className = '' }) => (
    <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
            streak > 0 ? 'bg-orange-500/20 text-orange-200' : 'bg-white/10 text-white/60'
        } ${className}`}
        title="Günlük seri"
    >
        <span className={streak > 0 ? 'game-flame' : ''} aria-hidden="true">🔥</span>
        <span className="tabular-nums">{streak}</span>
        <span className="sr-only">günlük seri</span>
        <span aria-hidden="true" className="font-medium">gün</span>
    </span>
);

/** Koyu degrade oyuncu kartı: seviye, XP çubuğu, lig, seri, özet sayılar. */
const PlayerCard = ({ user, player, showStats = true, linkToProfile = true }) => {
    if (!player) return null;
    const name = user?.username;
    return (
        <section className="game-hero rounded-3xl p-5 md:p-6 shadow-xl overflow-hidden relative game-pop-in" aria-label="Oyuncu kartı">
            <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                    <UserAvatar user={user} size="xl" className="ring-4 ring-white/20" />
                    <span className="absolute -bottom-1 -right-1 flex h-8 min-w-8 px-1 items-center justify-center rounded-full bg-gradient-to-br from-gold to-coral text-sm font-extrabold text-slate-950 ring-2 ring-[#1b1848] shadow-lg">
                        {player.level ?? 1}
                    </span>
                </div>
                <div className="min-w-0 flex-1">
                    {name && (
                        linkToProfile ? (
                            <Link to={`/oyun/profil/${name}`} className="block truncate text-lg font-extrabold hover:underline">
                                {name}
                            </Link>
                        ) : (
                            <p className="truncate text-lg font-extrabold">{name}</p>
                        )
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <LeagueBadge league={player.league} size="sm" />
                        <StreakFlame streak={player.daily_streak} />
                    </div>
                </div>
                <div className="hidden sm:block text-right">
                    <p className="text-[11px] uppercase tracking-wider text-white/60">Bu hafta</p>
                    <p className="text-2xl font-extrabold tabular-nums game-text-gradient">{formatNumber(player.weekly_score)}</p>
                </div>
            </div>

            <div className="mt-4">
                <XpBar player={player} />
            </div>

            {showStats && (
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                    <Stat label="Hafta" value={formatNumber(player.weekly_score)} className="sm:hidden" />
                    <Stat label="Oyun" value={formatNumber(player.total_games)} />
                    <Stat label="Doğruluk" value={`%${player.accuracy ?? 0}`} />
                    <Stat label="En iyi" value={formatNumber(player.best_arena_score)} className="hidden sm:block" />
                    <Stat label="Düello" value={`${player.duel_wins ?? 0}G`} />
                </dl>
            )}
        </section>
    );
};

const Stat = ({ label, value, className = '' }) => (
    <div className={`rounded-2xl bg-white/10 px-1 py-2 ${className}`}>
        <dt className="text-[10px] uppercase tracking-wide text-white/60">{label}</dt>
        <dd className="text-sm font-extrabold tabular-nums truncate">{value}</dd>
    </div>
);

export default PlayerCard;
