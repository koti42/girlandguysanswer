import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuCloudOff, LuLogIn, LuMonitorX, LuMusic, LuPlay, LuRoute, LuTrophy, LuVolume2, LuVolumeX } from 'react-icons/lu';
import { useAuth } from '../../../context/AuthContext';
import GameLayout from '../../../components/game/GameLayout';
import { GameLoading } from '../../../components/game/GameStates';
import useAsync from '../../../components/game/useAsync';
import { formatNumber } from '../../../components/game/gameUtils';
import CharacterPicker from '../../../components/game/runner/CharacterPicker';
import RunnerLeaderboard from '../../../components/game/runner/RunnerLeaderboard';
import RunnerHowTo from '../../../components/game/runner/RunnerHowTo';
import {
    RUNNER_SIM_VERSION,
    classifyFinishError,
    clearPending,
    detectWebGL,
    finishFailureText,
    finishRunOnce,
    loadCharacter,
    loadGuestBest,
    loadMusicEnabled,
    loadMuted,
    loadPending,
    normalizeRun,
    saveCharacter,
    saveMusicEnabled,
    saveMuted,
} from '../../../components/game/runner/runnerUtils';
import { gameApi, gameErrorMessage } from '../../../services/gameApi';

const PLAY_PATH = '/oyun/kosu/oyna';

const StatTile = ({ label, value, sub }) => (
    <div className="rounded-2xl bg-slate-50 px-3 py-3 dark:bg-white/5">
        <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">{value}</dd>
        {sub && <dd className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{sub}</dd>}
    </div>
);

const MemberStats = ({ data, error, onRetry }) => {
    const s = data?.stats || {};
    return (
        <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="runner-stats-title">
            <h2 id="runner-stats-title" className="mb-3 flex items-center gap-2 font-extrabold">
                <LuRoute className="text-coral" aria-hidden="true" /> Koşu karnen
            </h2>
            {error ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    İstatistiklerin yüklenemedi.{' '}
                    <button type="button" onClick={onRetry} className="min-h-[44px] font-semibold text-coral underline">
                        Tekrar dene
                    </button>
                </p>
            ) : !data ? (
                <div className="grid grid-cols-2 gap-2" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
                    ))}
                </div>
            ) : (
                <dl className="grid grid-cols-2 gap-2">
                    <StatTile label="En iyi skor" value={formatNumber(s.best_score)} />
                    <StatTile label="En uzun koşu" value={`${formatNumber(s.best_distance)} m`} />
                    <StatTile
                        label="Bu hafta"
                        value={formatNumber(s.weekly_best)}
                        sub={data.weekly_rank ? `Haftalık sıran #${data.weekly_rank}` : 'Henüz sıralamada değilsin'}
                    />
                    <StatTile label="Toplam" value={`${formatNumber(s.total_runs)} koşu`} sub={`${formatNumber(s.total_distance_m)} m · ${formatNumber(s.total_gates_correct)} doğru kapı`} />
                </dl>
            )}
        </section>
    );
};

const GuestStats = ({ best }) => (
    <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="runner-guest-stats">
        <h2 id="runner-guest-stats" className="mb-3 flex items-center gap-2 font-extrabold">
            <LuRoute className="text-coral" aria-hidden="true" /> Bu cihazdaki rekorun
        </h2>
        <dl className="grid grid-cols-2 gap-2">
            <StatTile label="En iyi skor" value={formatNumber(best.score)} />
            <StatTile label="En uzun koşu" value={`${formatNumber(best.distance)} m`} />
        </dl>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Antrenman rekorları yalnızca bu tarayıcıda saklanır.</p>
    </section>
);

const GuestLeaderboardCta = () => (
    <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="runner-guest-lb">
        <h2 id="runner-guest-lb" className="flex items-center gap-2 font-extrabold">
            <LuTrophy className="text-gold" aria-hidden="true" /> Koşu Liderliği
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Haftalık ve tüm zamanlar sıralamasında yer almak, XP ve rozet kazanmak için giriş yap.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
                to="/login"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 font-bold text-white game-press game-glow-coral"
            >
                <LuLogIn aria-hidden="true" /> Giriş yap
            </Link>
            <Link
                to="/signup"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-indigo-50 px-5 font-bold text-indigo-700 game-press dark:bg-white/10 dark:text-white"
            >
                Üye ol
            </Link>
        </div>
    </section>
);

/*
 * Lobi: kahraman alanı + karakter + karne + liderlik + nasıl oynanır.
 * Üye "Koşmaya Başla" ile sunucuda dereceli koşu açar; misafir doğrudan
 * antrenmana geçer (sunucuya hiçbir şey gitmez).
 */
const Lobby = ({ member, user }) => {
    const navigate = useNavigate();
    const [character, setCharacter] = useState(() => loadCharacter(user?.gender));
    const [muted, setMuted] = useState(loadMuted);
    const [musicEnabled, setMusicEnabled] = useState(loadMusicEnabled);
    const [webgl] = useState(detectWebGL);
    const [guestBest] = useState(loadGuestBest);
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState(null);
    const [pendingFailed, setPendingFailed] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [pendingAttempt, setPendingAttempt] = useState(0);
    // State bir sonraki çizime kadar eski kalır: hızlı çift tıklamada ikinci start gitmesin.
    const startingRef = useRef(false);
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const fetchOverview = useCallback(() => (member ? gameApi.runnerOverview() : Promise.resolve(null)), [member]);
    const overview = useAsync(fetchOverview, `${member ? 'm' : 'g'}:${reloadKey}`);
    const serverSim = overview.data?.sim_version;
    const outdated = member && serverSim != null && Number(serverSim) !== RUNNER_SIM_VERSION;

    // Gönderilemeyen bitiş varsa (2 saatten yeni) otomatik gönder ve bildir.
    useEffect(() => {
        if (!member) return undefined;
        const pending = loadPending(user?.id);
        if (!pending) return undefined;
        let alive = true;
        finishRunOnce(pending.run_id, {
            end_tick: pending.end_tick,
            inputs: pending.inputs,
            client_score: pending.client_score ?? undefined,
        }).then(
            (data) => {
                clearPending(pending.run_id);
                if (!alive) return;
                setPendingFailed(false);
                const r = data?.result;
                toast.success(
                    r ? `Yarım kalan koşun kaydedildi: ${formatNumber(r.score)} puan, ${formatNumber(r.distance_m)} m` : 'Yarım kalan koşun kaydedildi.',
                    { duration: 5000 }
                );
                setReloadKey((k) => k + 1);
            },
            (err) => {
                const kind = classifyFinishError(err);
                // 409 (koşu kapanmış) ve 422 kalıcı: kayıt silinir, yeniden denenmez.
                if (kind === 'rejected' || kind === 'gone') {
                    clearPending(pending.run_id);
                    if (alive) toast.error(`Yarım kalan koşun kaydedilemedi: ${finishFailureText(err, kind)}`, { duration: 6000 });
                    return;
                }
                if (alive) setPendingFailed(true);
            }
        );
        return () => {
            alive = false;
        };
    }, [member, user?.id, pendingAttempt]);

    const changeCharacter = (c) => {
        setCharacter(c);
        saveCharacter(c);
    };

    const toggleMute = () => {
        const next = !muted;
        setMuted(next);
        saveMuted(next);
    };

    // Yalnızca arka plan müziği; oyun içinde mola menüsünden de değişir.
    const toggleMusic = () => {
        const next = !musicEnabled;
        setMusicEnabled(next);
        saveMusicEnabled(next);
    };

    const playPractice = () => {
        saveCharacter(character);
        navigate(PLAY_PATH, { state: { mode: 'practice' } });
    };

    const start = async () => {
        if (starting || startingRef.current || !webgl) return;
        saveCharacter(character);
        if (!member) {
            playPractice();
            return;
        }
        if (outdated) return;
        startingRef.current = true;
        setStarting(true);
        setStartError(null);
        try {
            const data = await gameApi.startRunner();
            const run = normalizeRun(data?.run);
            if (!mountedRef.current) {
                // Kullanıcı yanıt gelmeden lobiden ayrıldı: onu oyuna geri çekme, koşu boşa açık kalmasın.
                if (data?.run?.id) gameApi.abandonRunner(data.run.id).catch(() => {});
                return;
            }
            if (!run || run.simVersion !== RUNNER_SIM_VERSION) {
                // Açılan koşu oynanamayacak: sunucuda boşa aktif kalmasın.
                if (data?.run?.id) gameApi.abandonRunner(data.run.id).catch(() => {});
                setStartError(run ? 'Oyun güncellendi. Sayfayı yenileyip tekrar dene.' : 'Koşu verisi okunamadı. Birazdan tekrar dene.');
                startingRef.current = false;
                setStarting(false);
                return;
            }
            navigate(PLAY_PATH, { state: { mode: 'ranked', run: data.run } });
        } catch (err) {
            if (!mountedRef.current) return;
            setStartError(gameErrorMessage(err, 'Koşu başlatılamadı.'));
            startingRef.current = false;
            setStarting(false);
        }
    };

    return (
        <>
            <section className="game-hero relative overflow-hidden rounded-3xl p-5 sm:p-8 shadow-2xl game-pop-in">
                <span className="runner-road pointer-events-none absolute inset-y-0 right-0 hidden w-2/5 sm:block" aria-hidden="true">
                    <span className="runner-road-plane" />
                </span>
                <div className="relative z-10 max-w-xl">
                    <span className="inline-flex items-center rounded-full bg-gradient-to-r from-gold to-coral px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950">
                        Yeni · 3D
                    </span>
                    <h1 className="mt-2 text-3xl sm:text-4xl font-black leading-tight">Herkesler Koşuyor</h1>
                    <p className="mt-2 text-white/80">
                        Gün batımında neon caddede koş; bariyerin üstünden zıpla, tabelanın altından kay, jetonları topla. Soru kapısında doğru
                        şıkkın şeridinden geç, çarpanını x5&apos;e çıkar!
                    </p>

                    {!member && (
                        <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/90 ring-1 ring-white/15">
                            Antrenman modunda oynuyorsun — soru kapıları ve sıralama için{' '}
                            <Link to="/login" className="font-bold text-gold underline">
                                giriş yap
                            </Link>
                            .
                        </p>
                    )}

                    {!webgl && (
                        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-500/20 px-3 py-2 text-sm text-rose-100 ring-1 ring-rose-300/30">
                            <LuMonitorX className="mt-0.5 shrink-0" aria-hidden="true" />
                            Bu tarayıcıda 3D grafik (WebGL 2) kullanılamıyor. Donanım hızlandırmayı açıp ya da güncel bir tarayıcıyla tekrar dene. iOS
                            kullanıyorsan iOS 15 veya üstüne güncelle.
                        </p>
                    )}

                    {outdated && (
                        <p role="alert" className="mt-4 rounded-2xl bg-amber-400/20 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-300/30">
                            Oyun güncellendi. Dereceli koşu için sayfayı yenile.
                        </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={start}
                            disabled={starting || !webgl || outdated}
                            className="inline-flex min-h-[56px] flex-1 sm:flex-none items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-4 text-base sm:px-7 sm:text-lg font-black text-white game-press game-glow-coral disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                        >
                            <LuPlay className="shrink-0" aria-hidden="true" />
                            {starting ? 'Hazırlanıyor…' : member ? 'Koşmaya Başla' : 'Antrenmana Başla'}
                        </button>
                        <button
                            type="button"
                            onClick={toggleMute}
                            aria-label={muted ? 'Oyun sesini aç' : 'Oyun sesini kapat'}
                            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl text-white ring-1 ring-white/20 hover:bg-white/25 game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                        >
                            {muted ? <LuVolumeX aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
                        </button>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={musicEnabled}
                            aria-label="Müzik"
                            title={musicEnabled ? 'Müzik: Açık' : 'Müzik: Kapalı'}
                            onClick={toggleMusic}
                            className={`relative flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ring-1 game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                                musicEnabled ? 'bg-white/15 text-white ring-white/20 hover:bg-white/25' : 'bg-white/5 text-white/50 ring-white/10 hover:bg-white/15'
                            }`}
                        >
                            <LuMusic aria-hidden="true" />
                            {/* Kapalıyken çapraz çizgi: yalnızca renge dayanmasın. */}
                            {!musicEnabled && <span className="absolute h-0.5 w-8 rotate-45 rounded-full bg-white/70" aria-hidden="true" />}
                        </button>
                    </div>
                    {member && <p className="mt-2 text-xs text-white/60">Dereceli koşu: sunucuda doğrulanır, XP, rozet ve haftalık sıralama kazandırır.</p>}
                    {/* Mobilde "Nasıl oynanır?" kartı ilk ekranın çok altında kalıyor. */}
                    <button
                        type="button"
                        onClick={() => document.getElementById('runner-howto')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="mt-2 min-h-[44px] text-sm font-semibold text-white/80 underline hover:text-white sm:hidden"
                    >
                        Nasıl oynanır? ↓
                    </button>

                    {startError && (
                        <div role="alert" className="mt-4 rounded-2xl bg-rose-500/20 px-3 py-3 text-sm text-rose-50 ring-1 ring-rose-300/30">
                            <p className="font-semibold">{startError}</p>
                            {webgl && (
                                <button type="button" onClick={playPractice} className="mt-2 min-h-[44px] font-bold text-gold underline">
                                    Bu arada antrenman modunda oyna
                                </button>
                            )}
                        </div>
                    )}

                    {pendingFailed && (
                        <div role="status" className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-400/20 px-3 py-2 text-sm text-amber-50 ring-1 ring-amber-300/30">
                            <LuCloudOff className="shrink-0" aria-hidden="true" />
                            <span className="flex-1">Yarım kalan koşun henüz gönderilemedi.</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setPendingFailed(false);
                                    setPendingAttempt((a) => a + 1);
                                }}
                                className="min-h-[44px] font-bold text-gold underline"
                            >
                                Tekrar dene
                            </button>
                        </div>
                    )}
                </div>
            </section>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CharacterPicker value={character} onChange={changeCharacter} />
                {member ? <MemberStats data={overview.data} error={overview.error} onRetry={overview.reload} /> : <GuestStats best={guestBest} />}
                {member ? <RunnerLeaderboard reloadKey={reloadKey} /> : <GuestLeaderboardCta />}
                <RunnerHowTo ranked={member} />
            </div>
        </>
    );
};

const RunnerLobbyPage = () => {
    const { isAuthenticated, user, loading } = useAuth();
    return (
        <GameLayout docTitle="Herkesler Koşuyor">
            {loading ? <GameLoading /> : <Lobby key={isAuthenticated ? `u:${user?.id ?? ''}` : 'guest'} member={Boolean(isAuthenticated)} user={user} />}
        </GameLayout>
    );
};

export default RunnerLobbyPage;
