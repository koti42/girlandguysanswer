import React from 'react';
import { Link } from 'react-router-dom';
import { LuBrain, LuCalendarCheck, LuSwords, LuSplit, LuTrophy, LuSparkles, LuCircleCheck } from 'react-icons/lu';
import { useAuth } from '../../context/AuthContext';
import GameLayout from '../../components/game/GameLayout';
import { GameError, GameLoading } from '../../components/game/GameStates';
import PlayerCard from '../../components/game/PlayerCard';
import ModeCard from '../../components/game/ModeCard';
import BadgeGrid from '../../components/game/BadgeGrid';
import Countdown from '../../components/game/Countdown';
import LeagueBadge from '../../components/game/LeagueBadge';
import RunnerFeatureCard from '../../components/game/runner/RunnerFeatureCard';
import TowerFeatureCard from '../../components/game/tower/TowerFeatureCard';
import ShopHubCard from '../../components/game/shop/ShopHubCard';
import AvatarHubCard from '../../components/game/avatar/AvatarHubCard';
import UserAvatar from '../../components/UserAvatar';
import { categoryIcon } from '../../components/game/gameIcons';
import { formatNumber, nextIstanbulMidnight } from '../../components/game/gameUtils';
import { gameApi, gameErrorMessage } from '../../services/gameApi';
import useAsync from '../../components/game/useAsync';

const CategoryChips = ({ categories = [], linkable }) => (
    <ul className="flex flex-wrap gap-2">
        {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const chip = (
                <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                    style={{ background: c.color || '#8B5CF6' }}
                >
                    <Icon aria-hidden="true" /> {c.name}
                </span>
            );
            return (
                <li key={c.id ?? c.slug}>
                    {linkable ? (
                        <Link to={`/oyun/arena?kategori=${encodeURIComponent(c.slug)}`} className="inline-block game-press hover:brightness-110">
                            {chip}
                        </Link>
                    ) : (
                        chip
                    )}
                </li>
            );
        })}
    </ul>
);

const MiniLeaderboard = ({ entries, me }) => (
    <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="mini-lb">
        <div className="flex items-center justify-between mb-3">
            <h2 id="mini-lb" className="flex items-center gap-2 font-extrabold">
                <LuTrophy className="text-gold" aria-hidden="true" /> Haftalık Lig
            </h2>
            <Link to="/oyun/liderlik" className="text-sm font-semibold text-coral hover:underline min-h-[44px] inline-flex items-center">
                Tümü
            </Link>
        </div>
        {entries.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Bu hafta henüz kimse puan almadı. İlk sen ol!</p>
        ) : (
            <ol className="space-y-1.5">
                {entries.map((e) => (
                    <li key={e.user?.id ?? e.rank}>
                        <Link
                            to={`/oyun/profil/${e.user?.username}`}
                            className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-indigo-50 dark:hover:bg-white/5"
                        >
                            <span className="w-6 text-center font-extrabold text-slate-400">
                                {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}
                            </span>
                            <UserAvatar user={e.user} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.user?.username}</span>
                            <span className="text-sm font-extrabold tabular-nums">{formatNumber(e.score)}</span>
                        </Link>
                    </li>
                ))}
            </ol>
        )}
        {me?.rank && (
            <p className="mt-3 rounded-2xl bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">
                Senin sıran: #{me.rank} · {formatNumber(me.score)} puan
            </p>
        )}
    </section>
);

/*
 * Öne çıkan bölüm (misafir + üye): iki 3D oyun yan yana (dar ekranda alt
 * alta), altında "kazan -> harca" döngüsünü gösteren Mağaza ve Karakterim.
 * Karakter: user.detail.game_avatar (yoksa cinsiyete göre varsayılan).
 */
const FeaturedGames = ({ guest = false, user = null }) => {
    const avatar = user?.detail?.game_avatar ?? null;
    const gender = guest ? 'female' : user?.gender;
    return (
        <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <RunnerFeatureCard guest={guest} avatar={avatar} gender={gender} />
                <TowerFeatureCard guest={guest} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ShopHubCard member={!guest} />
                <AvatarHubCard guest={guest} avatar={avatar} gender={gender} />
            </div>
        </>
    );
};

const GuestHub = () => {
    const { data, error: catError, reload } = useAsync(gameApi.categories);
    const categories = data?.categories || [];

    return (
        <>
            <section className="game-hero relative overflow-hidden rounded-3xl p-6 sm:p-10 shadow-2xl game-pop-in">
                <span className="absolute -right-6 -top-6 text-[120px] opacity-10 game-float select-none" aria-hidden="true">
                    🎮
                </span>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Herkesler Soruyor</p>
                <h1 className="mt-2 text-3xl sm:text-4xl font-black leading-tight">Oyun Merkezi</h1>
                <p className="mt-2 max-w-xl text-white/80">
                    Tek hesap, farklı oyunlar, ortak oyuncu profili. 3D koşuda ve kulede jeton kazan, mağazada harca; bilgini yarıştır,
                    düelloda arkadaşını yen, ikilemlerde kadınlar ve erkekler neyi seçiyor gör.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <Link
                        to="/login"
                        className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-6 py-3.5 min-h-[52px] font-bold text-white game-press game-glow-coral"
                    >
                        Giriş yap ve oyna
                    </Link>
                    <Link
                        to="/signup"
                        className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-6 py-3.5 min-h-[52px] font-bold text-white ring-1 ring-white/25 hover:bg-white/25 game-press"
                    >
                        Üye ol
                    </Link>
                </div>
            </section>

            <h2 className="mt-8 mb-3 text-lg font-extrabold">3D oyunlar</h2>
            {/* Yeni 3D oyunlar misafire de açık: antrenman modunda oynanır. */}
            <FeaturedGames guest />
            <h2 className="mt-8 mb-3 text-lg font-extrabold">Bilgi oyunları</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModeCard locked title="Bilgi Arenası" description="10 soru, soru başına 15 saniye. Kategori seç ya da karışık oyna." icon={LuBrain} gradient="from-coral to-orange-400" />
                <ModeCard locked title="Günün Sorusu" description="Her gün herkese aynı 5 soru. Serini bozma!" icon={LuCalendarCheck} gradient="from-amber-400 to-gold" />
                <ModeCard locked title="Bire Bir Düello" description="Arkadaşına ya da rastgele bir rakibe meydan oku." icon={LuSwords} gradient="from-indigo-500 to-fuchsia-500" />
                <ModeCard locked title="İkilem" description="İki seçenek, tek oy. Sonra kadınların ve erkeklerin ne seçtiğini gör." icon={LuSplit} gradient="from-pink-500 to-sky-500" />
            </div>

            <section className="mt-8 game-card rounded-3xl p-5">
                <h2 className="mb-3 flex items-center gap-2 font-extrabold">
                    <LuSparkles className="text-coral" aria-hidden="true" /> Kategoriler
                </h2>
                {catError ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Kategoriler şu an yüklenemedi.{' '}
                        <button type="button" onClick={reload} className="font-semibold text-coral underline min-h-[44px]">
                            Tekrar dene
                        </button>
                    </p>
                ) : categories.length ? (
                    <CategoryChips categories={categories} />
                ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{data ? 'Kategoriler yakında.' : 'Kategoriler yükleniyor…'}</p>
                )}
            </section>
        </>
    );
};

const fetchWeeklyTop = () => gameApi.leaderboard({ period: 'weekly', gender: 'all', limit: 5 });

const PlayerHub = ({ user }) => {
    const { data, error: loadError, reload: load } = useAsync(gameApi.overview);
    // Mini liderlik ayrı çekilir; düşerse hub yine çalışır.
    const { data: board } = useAsync(fetchWeeklyTop);

    if (loadError) return <GameError message={gameErrorMessage(loadError, 'Oyun Merkezi yüklenemedi.')} onRetry={load} />;
    if (!data) return <GameLoading label="Oyun Merkezi hazırlanıyor" />;

    const { player, daily = {}, dilemma_today: dilemma, pending_duels: pendingDuels = 0, categories = [], badges = [] } = data;

    return (
        <>
            <PlayerCard user={user} player={player} />

            <h2 className="mt-7 mb-3 text-lg font-extrabold">Ne oynamak istersin?</h2>
            <FeaturedGames user={user} />
            <h2 className="mt-8 mb-3 text-lg font-extrabold">Bilgi oyunları</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModeCard
                    to="/oyun/arena"
                    title="Bilgi Arenası"
                    description="10 soru · 15 sn · kategori seç ya da karışık"
                    icon={LuBrain}
                    gradient="from-coral to-orange-400"
                    cta="Arenaya gir"
                >
                    {player?.best_arena_score > 0 && (
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            En iyi skorun: <span className="text-slate-800 dark:text-white">{formatNumber(player.best_arena_score)}</span>
                        </p>
                    )}
                </ModeCard>

                <ModeCard
                    to="/oyun/gunluk"
                    title="Günün Sorusu"
                    description="Her gün 5 soru, herkese aynı"
                    icon={LuCalendarCheck}
                    gradient="from-amber-400 to-gold"
                    cta={daily.played_today ? 'Sonucunu gör' : daily.session_id ? 'Devam et' : 'Bugünü oyna'}
                    badge={
                        <span className="rounded-full bg-orange-500/15 px-2 py-1 text-xs font-bold text-orange-600 dark:text-orange-300" title="Günlük seri">
                            🔥 {daily.streak ?? player?.daily_streak ?? 0}
                        </span>
                    }
                >
                    {daily.played_today ? (
                        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <LuCircleCheck aria-hidden="true" /> Bugün tamam! Yarın tekrar gel:
                            <Countdown target={nextIstanbulMidnight()} onDone={load} className="font-extrabold text-slate-800 dark:text-white" />
                        </p>
                    ) : (
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Serini sürdürmek için bugünü kaçırma.</p>
                    )}
                </ModeCard>

                <ModeCard
                    to="/oyun/duello"
                    title="Bire Bir Düello"
                    description="Aynı 7 soru, yüksek puan kazanır"
                    icon={LuSwords}
                    gradient="from-indigo-500 to-fuchsia-500"
                    cta="Meydan oku"
                    badge={
                        pendingDuels > 0 ? (
                            <span className="rounded-full bg-coral px-2.5 py-1 text-xs font-extrabold text-white shadow animate-pulse">
                                {pendingDuels} davet
                            </span>
                        ) : null
                    }
                >
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {player?.duel_wins ?? 0} galibiyet · {player?.duel_losses ?? 0} mağlubiyet · {player?.duel_draws ?? 0} beraberlik
                    </p>
                </ModeCard>

                <ModeCard
                    to="/oyun/ikilem"
                    title="İkilem"
                    description="Kadınlar ne seçti, erkekler ne seçti?"
                    icon={LuSplit}
                    gradient="from-pink-500 to-sky-500"
                    cta={dilemma?.my_vote ? 'Sonuçları gör' : 'Oy ver'}
                >
                    {dilemma ? (
                        <div className="flex items-stretch gap-2 text-xs font-semibold">
                            <span className="flex-1 min-w-0 rounded-xl bg-pink-500/10 px-2 py-2 text-pink-700 dark:text-pink-200 line-clamp-2">{dilemma.option_a}</span>
                            <span className="self-center font-black text-slate-400">VS</span>
                            <span className="flex-1 min-w-0 rounded-xl bg-sky-500/10 px-2 py-2 text-sky-700 dark:text-sky-200 line-clamp-2">{dilemma.option_b}</span>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Günün ikilemi yakında.</p>
                    )}
                </ModeCard>
            </div>

            <div className="mt-7 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {board ? (
                    <MiniLeaderboard entries={board.entries || []} me={board.me} />
                ) : (
                    <section className="game-card rounded-3xl p-5">
                        <h2 className="flex items-center gap-2 font-extrabold">
                            <LuTrophy className="text-gold" aria-hidden="true" /> Haftalık Lig
                        </h2>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            Ligin: <LeagueBadge league={player?.league} size="sm" />{' '}
                            <Link to="/oyun/liderlik" className="font-semibold text-coral hover:underline">Sıralamayı gör</Link>
                        </p>
                    </section>
                )}

                <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="hub-badges">
                    <div className="flex items-center justify-between mb-3">
                        <h2 id="hub-badges" className="font-extrabold">Rozetler</h2>
                        {user?.username && (
                            <Link to={`/oyun/profil/${user.username}`} className="text-sm font-semibold text-coral hover:underline min-h-[44px] inline-flex items-center">
                                Koleksiyon
                            </Link>
                        )}
                    </div>
                    <BadgeGrid badges={badges} limit={8} compact />
                </section>
            </div>

            {categories.length > 0 && (
                <section className="mt-7 game-card rounded-3xl p-5">
                    <h2 className="mb-3 flex items-center gap-2 font-extrabold">
                        <LuSparkles className="text-coral" aria-hidden="true" /> Hızlı başla
                    </h2>
                    <CategoryChips categories={categories} linkable />
                </section>
            )}
        </>
    );
};

const GameHubPage = () => {
    const { isAuthenticated, user, loading } = useAuth();

    return (
        <GameLayout docTitle="Oyun Merkezi">
            {loading ? <GameLoading /> : isAuthenticated ? <PlayerHub user={user} /> : <GuestHub />}
        </GameLayout>
    );
};

export default GameHubPage;
