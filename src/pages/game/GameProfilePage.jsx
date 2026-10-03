import React, { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuSwords, LuUserX } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import GameLayout from '../../components/game/GameLayout';
import { GameEmpty, GameError, GameLoading } from '../../components/game/GameStates';
import PlayerCard from '../../components/game/PlayerCard';
import BadgeGrid from '../../components/game/BadgeGrid';
import AvatarCard from '../../components/game/avatar/AvatarCard';
import ProfilePreview from '../../components/game/shop/ProfilePreview';
import { normalizeCosmetics } from '../../game/shop';
import useAsync from '../../components/game/useAsync';
import { MODE_LABELS, formatDate, formatNumber, mergeBadges } from '../../components/game/gameUtils';
import { gameApi, gameErrorMessage, gameErrorStatus } from '../../services/gameApi';

const StatTile = ({ label, value, hint }) => (
    <div className="game-card rounded-2xl p-3 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 text-xl font-extrabold tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
);

const GameProfilePage = () => {
    const { username } = useParams();
    const { user: me } = useAuth();
    const fetcher = useCallback(async () => {
        // Katalog (kazanılmamışlar dahil) overview'dan gelir; o düşerse
        // yalnızca kazanılanlar gösterilir.
        const [prof, overview] = await Promise.all([gameApi.profile(username), gameApi.overview().catch(() => null)]);
        return { ...prof, badges: mergeBadges(overview?.badges, prof.badges) };
    }, [username]);
    const { data, error: loadError, reload: load } = useAsync(fetcher, username);
    const notFound = gameErrorStatus(loadError) === 404;
    const error = loadError && !notFound ? gameErrorMessage(loadError, 'Profil yüklenemedi.') : null;

    const isMe = me?.username && me.username === username;
    const p = data?.player;
    const earned = (data?.badges || []).filter((b) => b.earned_at).length;
    // Mağaza kozmetikleri (çerçeve / mini avatar / unvan); kendi profilinde sunucu alanı yoksa oturumdaki
    const cosmetics = normalizeCosmetics(data?.cosmetics ?? (isMe ? me?.detail?.game_cosmetics : null));
    const hasCosmetics = !!(cosmetics.frame || cosmetics.mini_avatar || cosmetics.title);

    return (
        <GameLayout docTitle={`${username} oyuncu profili`} back={{ to: '/oyun', label: 'Oyun Merkezi' }} maxWidth="max-w-4xl">
            {notFound ? (
                <GameEmpty icon={LuUserX} title="Oyuncu bulunamadı">
                    @{username} adında bir oyuncu yok ya da profili görüntülenemiyor.
                </GameEmpty>
            ) : error ? (
                <GameError message={error} onRetry={load} />
            ) : !data ? (
                <GameLoading label="Profil yükleniyor" />
            ) : (
                <>
                    <PlayerCard user={data.user} player={p} showStats={false} linkToProfile={false} />

                    {(hasCosmetics || isMe) && (
                        <section className="mt-4 game-card rounded-3xl p-4" aria-labelledby="game-profile-cosmetics" data-testid="game-profile-cosmetics">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h2 id="game-profile-cosmetics" className="text-sm font-extrabold">Profil görünümü</h2>
                                {isMe && (
                                    <Link to="/oyun/magaza" className="inline-flex min-h-[44px] items-center text-sm font-bold text-coral hover:underline">
                                        {hasCosmetics ? 'Mağazada değiştir' : 'Mağazaya göz at'}
                                    </Link>
                                )}
                            </div>
                            <ProfilePreview user={{ username: data.user?.username || username, avatar: data.user?.avatar }} cosmetics={cosmetics} />
                        </section>
                    )}

                    {(data.game_avatar || isMe) && (
                        <div className="mt-4">
                            <AvatarCard variant="game" avatar={data.game_avatar ?? null} gender={data.user?.gender} username={username} isOwn={!!isMe} />
                        </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                        {!isMe && (
                            <Link
                                to={`/oyun/duello?kullanici=${encodeURIComponent(username)}`}
                                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-5 py-3 min-h-[48px] font-bold text-white game-press"
                            >
                                <LuSwords aria-hidden="true" /> Düelloya davet et
                            </Link>
                        )}
                        <Link
                            to={`/profile/${username}`}
                            className="inline-flex items-center rounded-2xl game-card px-5 py-3 min-h-[48px] font-semibold game-press"
                        >
                            Site profili
                        </Link>
                    </div>

                    <section className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="İstatistikler">
                        <StatTile label="Toplam oyun" value={formatNumber(p?.total_games)} />
                        <StatTile label="Doğruluk" value={`%${p?.accuracy ?? 0}`} hint={`${formatNumber(p?.total_correct)}/${formatNumber(p?.total_answered)}`} />
                        <StatTile label="En iyi arena" value={formatNumber(p?.best_arena_score)} />
                        <StatTile label="Günlük seri" value={`🔥 ${p?.daily_streak ?? 0}`} hint={`En iyi: ${p?.best_daily_streak ?? 0}`} />
                        <StatTile label="Düello G" value={p?.duel_wins ?? 0} />
                        <StatTile label="Düello M" value={p?.duel_losses ?? 0} />
                        <StatTile label="Beraberlik" value={p?.duel_draws ?? 0} />
                        <StatTile label="Haftalık" value={formatNumber(p?.weekly_score)} hint="puan" />
                    </section>

                    <section className="mt-6 game-card rounded-3xl p-4 sm:p-5">
                        <h2 className="mb-3 font-extrabold">
                            Rozetler <span className="text-sm font-semibold text-slate-500">({earned}/{data.badges?.length ?? 0})</span>
                        </h2>
                        <BadgeGrid badges={data.badges} />
                    </section>

                    <section className="mt-6">
                        <h2 className="mb-3 font-extrabold">Son oyunlar</h2>
                        {!data.recent?.length ? (
                            <GameEmpty title="Henüz oyun yok" />
                        ) : (
                            <ul className="space-y-2">
                                {data.recent.map((s) => {
                                    const row = (
                                        <>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-bold">
                                                    {MODE_LABELS[s.mode] || s.mode}
                                                    {s.category?.name ? ` · ${s.category.name}` : ''}
                                                </span>
                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                    {formatDate(s.finished_at || s.started_at)} · {s.correct_count}/{s.total_questions} doğru
                                                </span>
                                            </span>
                                            <span className="shrink-0 font-extrabold tabular-nums">{formatNumber(s.score)}</span>
                                        </>
                                    );
                                    return (
                                        <li key={s.id}>
                                            {isMe && s.status === 'finished' ? (
                                                <Link to={`/oyun/sonuc/${s.id}`} className="flex items-center gap-3 rounded-2xl game-card px-4 py-3 hover:-translate-y-0.5 transition-transform">
                                                    {row}
                                                </Link>
                                            ) : (
                                                <div className="flex items-center gap-3 rounded-2xl game-card px-4 py-3">{row}</div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </GameLayout>
    );
};

export default GameProfilePage;
