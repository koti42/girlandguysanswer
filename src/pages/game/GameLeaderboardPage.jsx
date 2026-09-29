import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuTrophy } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import GameLayout from '../../components/game/GameLayout';
import { GameEmpty, GameError, GameLoading } from '../../components/game/GameStates';
import LeagueBadge from '../../components/game/LeagueBadge';
import Countdown from '../../components/game/Countdown';
import useAsync from '../../components/game/useAsync';
import UserAvatar from '../../components/UserAvatar';
import { formatNumber, nextIstanbulMonday } from '../../components/game/gameUtils';
import { gameApi, gameErrorMessage } from '../../services/gameApi';

const PERIODS = [
    { key: 'weekly', label: 'Haftalık' },
    { key: 'all', label: 'Tüm zamanlar' },
];
const GENDERS = [
    { key: 'all', label: 'Tümü' },
    { key: 'female', label: 'Kadın' },
    { key: 'male', label: 'Erkek' },
];

const Segmented = ({ items, value, onChange, label }) => (
    <div role="tablist" aria-label={label} className="inline-flex w-full sm:w-auto gap-1 rounded-2xl p-1 game-card">
        {items.map((it) => (
            <button
                key={it.key}
                type="button"
                role="tab"
                aria-selected={value === it.key}
                onClick={() => onChange(it.key)}
                className={`flex-1 sm:flex-none rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-bold transition-colors ${
                    value === it.key
                        ? 'bg-gradient-to-r from-coral to-fuchsia-500 text-white shadow'
                        : 'text-slate-600 hover:bg-indigo-50 dark:text-slate-300 dark:hover:bg-white/10'
                }`}
            >
                {it.label}
            </button>
        ))}
    </div>
);

// Podyum sırası: 2. - 1. - 3. Eşit puana eşit sıra (1, 2, 2, 4) geldiği için
// basamaklar sıra numarasına göre değil listedeki konuma göre dolar.
const PODIUM = [
    { pos: 1, height: 'h-20', medal: '🥈', ring: 'ring-slate-300' },
    { pos: 0, height: 'h-28', medal: '🥇', ring: 'ring-gold' },
    { pos: 2, height: 'h-14', medal: '🥉', ring: 'ring-amber-600' },
];

const Podium = ({ entries, unit }) => (
    <div className="game-hero rounded-3xl px-3 pt-6 pb-0 shadow-2xl overflow-hidden">
        <div className="grid grid-cols-3 items-end gap-2">
            {PODIUM.map(({ pos, height, medal, ring }) => {
                const e = entries[pos];
                const place = e?.rank ?? pos + 1;
                const icon = ['🥇', '🥈', '🥉'][place - 1] || medal;
                return (
                    <div key={pos} className="flex min-w-0 flex-col items-center text-center game-pop-in">
                        {e ? (
                            <Link to={`/oyun/profil/${e.user?.username}`} className="flex min-w-0 max-w-full flex-col items-center">
                                <span className="text-2xl" aria-hidden="true">{icon}</span>
                                <UserAvatar user={e.user} size={pos === 0 ? 'xl' : 'lg'} className={`ring-4 ${ring}`} />
                                <span className="mt-1 max-w-full truncate text-sm font-bold">{e.user?.username}</span>
                                <span className="text-xs font-extrabold tabular-nums text-gold">
                                    {formatNumber(e.score)} {unit}
                                </span>
                            </Link>
                        ) : (
                            <span className="text-2xl opacity-30" aria-hidden="true">{medal}</span>
                        )}
                        <div className={`mt-2 w-full rounded-t-2xl bg-white/15 ${height} flex items-start justify-center pt-2 text-2xl font-black text-white/70`}>
                            {place}
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

const GameLeaderboardPage = () => {
    const { user } = useAuth();
    const [period, setPeriod] = useState('weekly');
    const [gender, setGender] = useState('all');
    const fetcher = useCallback(() => gameApi.leaderboard({ period, gender, limit: 50 }), [period, gender]);
    const { data, error: loadError, reload: load } = useAsync(fetcher, `${period}:${gender}`);
    const error = loadError ? gameErrorMessage(loadError, 'Liderlik tablosu yüklenemedi.') : null;

    const unit = period === 'weekly' ? 'puan' : 'XP';
    const entries = data?.entries || [];
    const rest = entries.slice(3);
    const me = data?.me;

    return (
        <GameLayout title="Liderlik" subtitle="Haftalık lig puanı ya da tüm zamanların XP'si." back={{ to: '/oyun', label: 'Oyun Merkezi' }} maxWidth="max-w-3xl">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <Segmented items={PERIODS} value={period} onChange={setPeriod} label="Dönem" />
                <Segmented items={GENDERS} value={gender} onChange={setGender} label="Cinsiyet" />
            </div>

            {period === 'weekly' && (
                <p className="mt-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Lig Pazartesi 00:00'da sıfırlanır · <Countdown target={nextIstanbulMonday()} className="font-extrabold text-slate-700 dark:text-slate-200" />
                </p>
            )}

            <div className="mt-5">
                {error ? (
                    <GameError message={error} onRetry={load} />
                ) : !data ? (
                    <GameLoading label="Sıralama yükleniyor" />
                ) : entries.length === 0 ? (
                    <GameEmpty icon={LuTrophy} title="Henüz sıralamada kimse yok">
                        Bir oyun oyna, listenin tepesine sen yerleş!
                    </GameEmpty>
                ) : (
                    <>
                        <Podium entries={entries} unit={unit} />
                        {rest.length > 0 && (
                            <ol className="mt-4 space-y-2">
                                {rest.map((e) => {
                                    const isMe = user && e.user?.id === user.id;
                                    return (
                                        <li key={e.user?.id ?? e.rank}>
                                            <Link
                                                to={`/oyun/profil/${e.user?.username}`}
                                                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 game-card hover:-translate-y-0.5 transition-transform ${
                                                    isMe ? 'ring-2 ring-coral' : ''
                                                }`}
                                            >
                                                <span className="w-7 text-center font-extrabold text-slate-400 tabular-nums">{e.rank}</span>
                                                <UserAvatar user={e.user} size="md" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-bold">{e.user?.username}</span>
                                                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                        Sv. {e.level}
                                                        {e.league && <LeagueBadge league={e.league} size="sm" className="scale-90 origin-left" />}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-right font-extrabold tabular-nums">
                                                    {formatNumber(e.score)}
                                                    <span className="block text-[10px] font-semibold text-slate-400">{unit}</span>
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </>
                )}
            </div>

            {data && me && (
                <div className="sticky bottom-3 z-20 mt-6">
                    <div className="game-hero flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl ring-1 ring-white/10" aria-live="polite">
                        <UserAvatar user={user} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">
                            {me.rank ? `Senin sıran: #${me.rank}` : 'Henüz sıralamada değilsin'}
                        </span>
                        <span className="shrink-0 text-sm font-extrabold tabular-nums text-gold">
                            {formatNumber(me.score)} {unit}
                        </span>
                    </div>
                </div>
            )}
        </GameLayout>
    );
};

export default GameLeaderboardPage;
