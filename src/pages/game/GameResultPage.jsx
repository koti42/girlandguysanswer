import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import ReactConfetti from 'react-confetti';
import toast from 'react-hot-toast';
import { LuCheck, LuRotateCcw, LuShare2, LuSwords, LuX, LuHourglass, LuTrophy } from 'react-icons/lu';
import GameLayout from '../../components/game/GameLayout';
import { GameError, GameLoading } from '../../components/game/GameStates';
import BadgeGrid from '../../components/game/BadgeGrid';
import { XpBar } from '../../components/game/PlayerCard';
import UserAvatar from '../../components/UserAvatar';
import {
    DUEL_RESULT_LABELS,
    MODE_LABELS,
    duelMine,
    formatNumber,
    prefersReducedMotion,
    shareOrCopy,
} from '../../components/game/gameUtils';
import { gameApi, gameErrorMessage, gameErrorStatus } from '../../services/gameApi';

const LETTERS = ['A', 'B', 'C', 'D'];

const GameResultPage = () => {
    const { sessionId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const passed = location.state?.result;

    const [result, setResult] = useState(passed || null);
    const [loading, setLoading] = useState(!passed);
    const [error, setError] = useState(null);
    const [notFinished, setNotFinished] = useState(false);
    const [starting, setStarting] = useState(false);
    const [confetti, setConfetti] = useState(false);
    const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!silent) {
            setLoading(true);
            setError(null);
        }
        try {
            const data = await gameApi.getResult(sessionId);
            setResult(data.result);
        } catch (err) {
            if (silent) return;
            if (gameErrorStatus(err) === 409) setNotFinished(true);
            else setError(gameErrorMessage(err, 'Sonuç yüklenemedi.'));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => {
        // Oyun ekranından gelen sonuç yeterli; yenilemede sunucudan çekilir.
        // Düelloda rakip durumu değişmiş olabileceği için sessizce tazelenir.
        if (!passed) load();
        else if (passed?.session?.mode === 'duel') load({ silent: true });
    }, [load, passed]);

    useEffect(() => {
        if (!result?.level_up || prefersReducedMotion()) return undefined;
        const t = setTimeout(() => setConfetti(true), 250);
        const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', onResize);
        };
    }, [result?.level_up]);

    const mode = result?.session?.mode;

    const playAgain = async () => {
        if (mode === 'daily') return navigate('/oyun/gunluk');
        if (mode === 'duel') return navigate('/oyun/duello');
        setStarting(true);
        try {
            const data = await gameApi.startArena(result?.session?.category?.slug);
            navigate(`/oyun/oyna/${data.session.id}`);
        } catch (err) {
            toast.error(gameErrorMessage(err, 'Yeni oyun başlatılamadı.'));
            setStarting(false);
        }
    };

    const share = async () => {
        const modeName = MODE_LABELS[mode] || 'Oyun Merkezi';
        const text = `Herkesler Soruyor ${modeName}'nda ${formatNumber(result.score)} puan yaptım (${result.correct_count}/${result.total} doğru)! Sen kaç yaparsın?`;
        const url = `${window.location.origin}/oyun`;
        const outcome = await shareOrCopy({ title: 'Herkesler Soruyor · Oyun Merkezi', text, url });
        if (outcome === 'copied') toast.success('Sonuç panoya kopyalandı!');
        else if (outcome === 'failed') toast.error('Paylaşılamadı.');
    };

    if (loading) {
        return (
            <GameLayout docTitle="Sonuç" maxWidth="max-w-3xl">
                <GameLoading label="Sonuçlar hesaplanıyor" />
            </GameLayout>
        );
    }

    if (notFinished) {
        return (
            <GameLayout docTitle="Sonuç" maxWidth="max-w-3xl">
                <div className="game-card rounded-3xl p-6 text-center">
                    <LuHourglass className="mx-auto text-3xl text-indigo-400" aria-hidden="true" />
                    <p className="mt-2 font-semibold">Bu oyun henüz bitmedi.</p>
                    <Link
                        to={`/oyun/oyna/${sessionId}`}
                        className="mt-4 inline-flex rounded-full bg-gradient-to-r from-coral to-orange-400 px-6 py-3 min-h-[48px] items-center font-semibold text-white game-press"
                    >
                        Oyuna devam et
                    </Link>
                </div>
            </GameLayout>
        );
    }

    if (error || !result) {
        return (
            <GameLayout docTitle="Sonuç" maxWidth="max-w-3xl">
                <GameError message={error || 'Sonuç bulunamadı.'} onRetry={() => load()} />
            </GameLayout>
        );
    }

    const duel = result.duel;
    const d = duelMine(duel);
    const perfect = result.total > 0 && result.correct_count === result.total;

    return (
        <GameLayout docTitle="Sonuç" maxWidth="max-w-3xl">
            {confetti && (
                <ReactConfetti
                    width={size.w}
                    height={size.h}
                    recycle={false}
                    numberOfPieces={350}
                    gravity={0.25}
                    style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }}
                    onConfettiComplete={() => setConfetti(false)}
                />
            )}

            <section className="game-hero rounded-3xl p-5 sm:p-7 text-center shadow-2xl game-pop-in" aria-labelledby="result-title">
                <p className="text-[11px] uppercase tracking-widest text-white/60">
                    {MODE_LABELS[mode] || 'Oyun'}
                    {result.session?.category?.name ? ` · ${result.session.category.name}` : ''}
                </p>
                <h1 id="result-title" className="mt-1 text-xl font-bold text-white">
                    {perfect ? 'Kusursuz! 🏆' : result.accuracy >= 70 ? 'Harika oyun! 🎉' : result.accuracy >= 40 ? 'İyi iş! 👏' : 'Bir dahaki sefere! 💪'}
                </h1>
                <p className="mt-3 text-5xl sm:text-6xl font-black tabular-nums game-text-gradient">{formatNumber(result.score)}</p>
                <p className="text-sm text-white/60">puan</p>

                <dl className="mt-5 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-white/10 py-3">
                        <dt className="text-[10px] uppercase tracking-wide text-white/60">Doğru</dt>
                        <dd className="text-lg font-extrabold text-white tabular-nums">
                            {result.correct_count}/{result.total}
                        </dd>
                    </div>
                    <div className="rounded-2xl bg-white/10 py-3">
                        <dt className="text-[10px] uppercase tracking-wide text-white/60">Doğruluk</dt>
                        <dd className="text-lg font-extrabold text-white tabular-nums">%{result.accuracy}</dd>
                    </div>
                    <div className="rounded-2xl bg-white/10 py-3">
                        <dt className="text-[10px] uppercase tracking-wide text-white/60">XP</dt>
                        <dd className="text-lg font-extrabold text-gold tabular-nums">+{result.xp_earned}</dd>
                    </div>
                </dl>

                {result.level_up && (
                    <div className="mt-4 rounded-2xl bg-gradient-to-r from-gold/30 to-coral/30 px-4 py-3 text-white game-pop-in" role="status">
                        <p className="font-extrabold">Seviye atladın! {result.level_before} → {result.level_after} 🚀</p>
                    </div>
                )}

                {result.player && (
                    <div className="mt-4 text-left">
                        <XpBar player={result.player} />
                    </div>
                )}
            </section>

            {duel && (
                <section className="mt-5 game-card rounded-3xl p-5" aria-label="Düello durumu">
                    <h2 className="flex items-center gap-2 font-bold">
                        <LuSwords className="text-coral" aria-hidden="true" /> Düello
                    </h2>
                    <div className="mt-3 flex items-center justify-between gap-2">
                        <DuelSide user={d.me} score={d.myScore ?? result.score} label="Sen" />
                        <span className="text-sm font-black text-slate-400">VS</span>
                        <DuelSide user={d.rival} score={d.theirScore} label={d.rival?.username || 'Rakip'} hidden={!d.rivalFinished} />
                    </div>
                    <div className="mt-4 text-center">
                        {duel.result ? (
                            <span className={`inline-block rounded-full px-4 py-1.5 text-sm font-bold ${DUEL_RESULT_LABELS[duel.result]?.className || ''}`}>
                                {DUEL_RESULT_LABELS[duel.result]?.text}
                            </span>
                        ) : (
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {d.rival ? `${d.rival.username} henüz oynamadı. Bitirince sonuç burada ve bildirimlerinde görünecek.` : 'Rakip aranıyor. Biri katılıp oynayınca sonuç belli olacak.'}
                            </p>
                        )}
                    </div>
                    <div className="mt-3 text-center">
                        <Link to={`/oyun/duello/${duel.id}`} className="text-sm font-semibold text-coral hover:underline">
                            Düello ayrıntıları
                        </Link>
                    </div>
                </section>
            )}

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                    type="button"
                    onClick={playAgain}
                    disabled={starting}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 py-3 min-h-[56px] font-bold text-white game-press game-glow-coral disabled:opacity-60"
                >
                    <LuRotateCcw aria-hidden="true" /> {mode === 'duel' ? 'Yeni düello' : mode === 'daily' ? 'Günlük özet' : starting ? 'Başlıyor…' : 'Tekrar oyna'}
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/oyun/duello?meydan=1')}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-5 py-3 min-h-[56px] font-bold text-white game-press"
                >
                    <LuSwords aria-hidden="true" /> Arkadaşına meydan oku
                </button>
                <button
                    type="button"
                    onClick={share}
                    className="flex items-center justify-center gap-2 rounded-2xl game-card px-5 py-3 min-h-[56px] font-bold text-slate-800 dark:text-white game-press"
                >
                    <LuShare2 aria-hidden="true" /> Paylaş
                </button>
            </div>

            {result.badges_earned?.length > 0 && (
                <section className="mt-6 game-card rounded-3xl p-5 game-fade-up">
                    <h2 className="flex items-center gap-2 font-bold mb-3">
                        <LuTrophy className="text-gold" aria-hidden="true" /> Yeni rozetler
                    </h2>
                    <BadgeGrid badges={result.badges_earned.map((b) => ({ ...b, earned_at: b.earned_at || 'now' }))} />
                </section>
            )}

            {result.answers?.length > 0 && (
                <section className="mt-6 game-card rounded-3xl p-4 sm:p-5">
                    <h2 className="font-bold mb-3">Soru soru özet</h2>
                    <ol className="space-y-2.5">
                        {result.answers.map((a) => (
                            <li key={a.index} className="rounded-2xl bg-slate-50 dark:bg-white/5 p-3">
                                <div className="flex items-start gap-3">
                                    <span
                                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${a.correct ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                    >
                                        {a.correct ? <LuCheck aria-hidden="true" /> : <LuX aria-hidden="true" />}
                                        <span className="sr-only">{a.correct ? 'Doğru' : 'Yanlış'}</span>
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold break-words">
                                            {a.index + 1}. {a.question}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 break-words">
                                            Doğru: <strong className="text-emerald-600 dark:text-emerald-400">{LETTERS[a.correct_index]}) {a.options?.[a.correct_index]}</strong>
                                            {!a.correct && (
                                                <>
                                                    {' · '}Senin:{' '}
                                                    <span className="text-rose-600 dark:text-rose-400">
                                                        {a.chosen_index == null ? 'Süre doldu' : `${LETTERS[a.chosen_index]}) ${a.options?.[a.chosen_index] ?? ''}`}
                                                    </span>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                                        {a.points > 0 ? `+${a.points}` : '0'}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </GameLayout>
    );
};

const DuelSide = ({ user, score, label, hidden }) => (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
        <UserAvatar user={user} size="lg" />
        <span className="mt-1 max-w-full truncate text-sm font-semibold">{label}</span>
        <span className="text-xl font-extrabold tabular-nums">{hidden || score == null ? '?' : formatNumber(score)}</span>
    </div>
);

export default GameResultPage;
