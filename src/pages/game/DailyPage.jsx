import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuCalendarCheck, LuPlay, LuCircleCheck } from 'react-icons/lu';
import GameLayout from '../../components/game/GameLayout';
import { GameError, GameLoading } from '../../components/game/GameStates';
import Countdown from '../../components/game/Countdown';
import useAsync from '../../components/game/useAsync';
import { formatNumber, nextIstanbulMidnight } from '../../components/game/gameUtils';
import { gameApi, gameErrorData, gameErrorMessage, gameErrorStatus } from '../../services/gameApi';

async function fetchDaily() {
    const ov = await gameApi.overview();
    const daily = ov.daily || {};
    let result = null;
    if (daily.played_today && daily.session_id) {
        try {
            result = (await gameApi.getResult(daily.session_id)).result;
        } catch {
            result = null; // Özet gelmese de seri ve geri sayım gösterilebilir.
        }
    }
    return { daily, player: ov.player, result };
}

const DailyPage = () => {
    const navigate = useNavigate();
    const { data: state, error: loadError, reload: load } = useAsync(fetchDaily);
    const error = loadError ? gameErrorMessage(loadError, 'Günün sorusu yüklenemedi.') : null;
    const [starting, setStarting] = useState(false);

    const start = async () => {
        if (starting) return;
        setStarting(true);
        try {
            const data = await gameApi.startDaily();
            navigate(`/oyun/oyna/${data.session.id}`);
        } catch (err) {
            if (gameErrorStatus(err) === 409) {
                // Bugün zaten bitirilmiş.
                const sid = gameErrorData(err)?.session_id;
                toast('Bugünün sorularını zaten çözdün!', { icon: '✅' });
                if (sid) navigate(`/oyun/sonuc/${sid}`);
                else load();
            } else {
                toast.error(gameErrorMessage(err, 'Başlatılamadı.'));
            }
            setStarting(false);
        }
    };

    const streak = state?.daily?.streak ?? state?.player?.daily_streak ?? 0;
    const best = state?.player?.best_daily_streak ?? 0;

    return (
        <GameLayout title="Günün Sorusu" subtitle="Her gün herkese aynı 5 soru. Günde bir kez." back={{ to: '/oyun', label: 'Oyun Merkezi' }} maxWidth="max-w-3xl">
            {error ? (
<GameError message={error} onRetry={load} />
            ) : !state ? (
                <GameLoading />
            ) : (
                <>
                    <section className="game-hero rounded-3xl p-6 sm:p-8 text-center shadow-2xl game-pop-in">
                        <div className="text-6xl" aria-hidden="true">
                            <span className={streak > 0 ? 'game-flame' : 'grayscale opacity-60'}>🔥</span>
                        </div>
                        <p className="mt-2 text-4xl font-black tabular-nums">{streak}</p>
                        <p className="text-sm text-white/70">günlük seri · en iyi {best}</p>

                        {state.daily.played_today ? (
                            <div className="mt-6">
                                <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-2 font-bold text-emerald-200">
                                    <LuCircleCheck aria-hidden="true" /> Bugünü tamamladın
                                </p>
                                {state.result && (
                                    <dl className="mt-5 grid grid-cols-3 gap-2">
                                        <div className="rounded-2xl bg-white/10 py-3">
                                            <dt className="text-[10px] uppercase tracking-wide text-white/60">Puan</dt>
                                            <dd className="text-lg font-extrabold tabular-nums">{formatNumber(state.result.score)}</dd>
                                        </div>
                                        <div className="rounded-2xl bg-white/10 py-3">
                                            <dt className="text-[10px] uppercase tracking-wide text-white/60">Doğru</dt>
                                            <dd className="text-lg font-extrabold tabular-nums">
                                                {state.result.correct_count}/{state.result.total}
                                            </dd>
                                        </div>
                                        <div className="rounded-2xl bg-white/10 py-3">
                                            <dt className="text-[10px] uppercase tracking-wide text-white/60">XP</dt>
                                            <dd className="text-lg font-extrabold tabular-nums text-gold">+{state.result.xp_earned}</dd>
                                        </div>
                                    </dl>
                                )}
                                <p className="mt-6 text-sm text-white/70">Yeni sorular için yarın tekrar gel</p>
                                <Countdown target={nextIstanbulMidnight()} onDone={load} className="mt-1 block text-3xl font-black game-text-gradient" />
                                {state.daily.session_id && (
                                    <Link
                                        to={`/oyun/sonuc/${state.daily.session_id}`}
                                        className="mt-5 inline-flex min-h-[48px] items-center rounded-2xl bg-white/15 px-5 py-3 font-bold ring-1 ring-white/25 hover:bg-white/25"
                                    >
                                        Soru soru özet
                                    </Link>
                                )}
                            </div>
                        ) : (
                            <div className="mt-6">
                                <p className="text-white/80">
                                    {streak > 0 ? `Serini ${streak + 1}. güne taşı!` : 'Bugün yeni bir seri başlat.'} Seri başına +5 XP bonus (en fazla 7 gün).
                                </p>
                                <button
                                    type="button"
                                    onClick={start}
                                    disabled={starting}
                                    className="mt-5 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral via-orange-400 to-gold px-8 py-4 min-h-[60px] text-lg font-extrabold text-white shadow-xl game-press game-glow-coral disabled:opacity-70"
                                >
                                    <LuPlay aria-hidden="true" />
                                    {starting ? 'Başlıyor…' : state.daily.session_id ? 'Kaldığın yerden devam et' : 'Bugünün 5 sorusunu çöz'}
                                </button>
                            </div>
                        )}
                    </section>

                    <section className="mt-5 game-card rounded-3xl p-5 text-sm text-slate-600 dark:text-slate-300">
                        <h2 className="mb-2 flex items-center gap-2 font-extrabold text-slate-900 dark:text-white">
                            <LuCalendarCheck className="text-gold" aria-hidden="true" /> Nasıl işler?
                        </h2>
                        <ul className="list-disc space-y-1 pl-5">
                            <li>Herkes aynı 5 soruyu çözer; gün İstanbul saatiyle gece yarısı döner.</li>
                            <li>Her gün oynarsan serin büyür, bir gün kaçırırsan sıfırlanır.</li>
                            <li>Kazanç: 30 XP + doğru başına 10 XP + seri bonusu.</li>
                        </ul>
                    </section>
                </>
            )}
        </GameLayout>
    );
};

export default DailyPage;
