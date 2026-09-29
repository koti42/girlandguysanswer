import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { LuArrowRight, LuHistory, LuSplit } from 'react-icons/lu';
import GameLayout from '../../components/game/GameLayout';
import { GameEmpty, GameError, GameLoading } from '../../components/game/GameStates';
import DilemmaBoard from '../../components/game/DilemmaBoard';
import { clampPct, vibrate } from '../../components/game/gameUtils';
import { gameApi, gameErrorMessage, gameErrorStatus } from '../../services/gameApi';

const HistoryItem = ({ d }) => {
    const r = d.results;
    const a = clampPct(r?.a_pct);
    return (
        <li className="game-card rounded-2xl p-3.5">
            <div className="flex items-start justify-between gap-3 text-sm font-semibold">
                <span className={`min-w-0 break-words ${d.my_vote === 'a' ? 'text-coral' : ''}`}>
                    {d.my_vote === 'a' && '✓ '}
                    {d.option_a}
                </span>
                <span className={`min-w-0 break-words text-right ${d.my_vote === 'b' ? 'text-indigo-500 dark:text-indigo-300' : ''}`}>
                    {d.option_b}
                    {d.my_vote === 'b' && ' ✓'}
                </span>
            </div>
            {r && (
                <>
                    <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-indigo-400/60" aria-hidden="true">
                        <div className="h-full bg-gradient-to-r from-coral to-pink-500" style={{ width: `${a}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                        <span>%{a}</span>
                        <span>
                            ♀ A %{clampPct(r.by_gender?.female?.a_pct)} · ♂ A %{clampPct(r.by_gender?.male?.a_pct)}
                        </span>
                        <span>%{clampPct(r.b_pct)}</span>
                    </div>
                </>
            )}
        </li>
    );
};

const DilemmaPage = () => {
    const [dilemma, setDilemma] = useState(undefined); // undefined: yükleniyor, null: yok
    const [isToday, setIsToday] = useState(true);
    const [error, setError] = useState(null);
    const [voting, setVoting] = useState(null);
    const [loadingNext, setLoadingNext] = useState(false);
    const [noMore, setNoMore] = useState(false);
    const [history, setHistory] = useState({ items: [], page: 0, last: 1, loading: false });

    const loadToday = useCallback(async () => {
        setError(null);
        try {
            const data = await gameApi.dilemmaToday();
            setDilemma(data.dilemma ?? null);
            setIsToday(true);
        } catch (err) {
            // Sunucu hiç ikilem yoksa 404 döner: hata değil, boş durum.
            if (gameErrorStatus(err) === 404) {
                setDilemma(null);
                setIsToday(true);
                return;
            }
            setError(gameErrorMessage(err, 'Günün ikilemi yüklenemedi.'));
        }
    }, []);

    const loadHistory = useCallback(async (page = 1) => {
        setHistory((h) => ({ ...h, loading: true }));
        try {
            const data = await gameApi.dilemmaHistory(page);
            setHistory((h) => ({
                items: page === 1 ? data.dilemmas || [] : [...h.items, ...(data.dilemmas || [])],
                page: data.pagination?.current_page ?? page,
                last: data.pagination?.last_page ?? page,
                loading: false,
            }));
        } catch {
            setHistory((h) => ({ ...h, loading: false }));
        }
    }, []);

    useEffect(() => {
        loadToday();
        loadHistory(1);
    }, [loadToday, loadHistory]);

    const vote = async (choice) => {
        if (!dilemma || voting || dilemma.my_vote) return;
        setVoting(choice);
        try {
            const data = await gameApi.voteDilemma(dilemma.id, choice);
            setDilemma(data.dilemma);
            vibrate(25);
            if (data.xp_earned) toast.success(`+${data.xp_earned} XP`, { icon: '✨' });
            (data.badges_earned || []).forEach((b) => toast.success(`Yeni rozet: ${b.name}`, { icon: '🏅' }));
            setHistory((h) => ({ ...h, items: [data.dilemma, ...h.items.filter((x) => x.id !== data.dilemma.id)] }));
        } catch (err) {
            if (gameErrorStatus(err) === 409) {
                toast('Bu ikileme zaten oy vermişsin.');
                if (isToday) loadToday();
                loadHistory(1);
            } else {
                toast.error(gameErrorMessage(err, 'Oy kaydedilemedi.'));
            }
        } finally {
            setVoting(null);
        }
    };

    const next = async () => {
        if (loadingNext) return;
        setLoadingNext(true);
        try {
            const data = await gameApi.dilemmaNext();
            if (data.dilemma) {
                setDilemma(data.dilemma);
                setIsToday(false);
                setNoMore(false);
                window.scrollTo?.({ top: 0, behavior: 'smooth' });
            } else {
                setNoMore(true);
            }
        } catch (err) {
            toast.error(gameErrorMessage(err, 'Sıradaki ikilem getirilemedi.'));
        } finally {
            setLoadingNext(false);
        }
    };

    return (
        <GameLayout title="İkilem" subtitle="Doğru cevap yok. Seç, sonra kadınların ve erkeklerin ne seçtiğini gör." back={{ to: '/oyun', label: 'Oyun Merkezi' }} maxWidth="max-w-4xl">
            {error ? (
                <GameError message={error} onRetry={loadToday} />
            ) : dilemma === undefined ? (
                <GameLoading label="İkilem geliyor" />
            ) : dilemma === null ? (
                <GameEmpty icon={LuSplit} title="Bugün için ikilem yok">
                    Aşağıdan başka bir ikilem oylayabilirsin.
                </GameEmpty>
            ) : (
                <>
                    <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {isToday ? 'Günün ikilemi' : 'İkilem'}
                        {dilemma.topic ? ` · ${dilemma.topic}` : ''}
                    </p>
                    <DilemmaBoard key={dilemma.id} dilemma={dilemma} onVote={vote} voting={voting} />
                    {!dilemma.results && !dilemma.my_vote && (
                        <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">Seçimini yap, sonuçlar oy verince açılır.</p>
                    )}
                </>
            )}

            <div className="mt-6">
                {noMore ? (
                    <GameEmpty title="Şimdilik oylanacak ikilem kalmadı">Yarın yeni ikilemler gelecek.</GameEmpty>
                ) : (
                    <button
                        type="button"
                        onClick={next}
                        disabled={loadingNext}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral via-fuchsia-500 to-indigo-500 px-6 py-4 min-h-[56px] text-base font-extrabold text-white shadow-xl game-press disabled:opacity-70"
                    >
                        {loadingNext ? 'Getiriliyor…' : 'Sıradaki ikilem'} <LuArrowRight aria-hidden="true" />
                    </button>
                )}
            </div>

            <section className="mt-8" aria-labelledby="dilemma-history">
                <h2 id="dilemma-history" className="mb-3 flex items-center gap-2 text-lg font-extrabold">
                    <LuHistory className="text-slate-500" aria-hidden="true" /> Oyladıkların
                </h2>
                {history.items.length === 0 && !history.loading ? (
                    <GameEmpty title="Henüz oy vermedin" />
                ) : (
                    <ul className="space-y-2.5">
                        {history.items.map((d) => (
                            <HistoryItem key={d.id} d={d} />
                        ))}
                    </ul>
                )}
                {history.page < history.last && (
                    <button
                        type="button"
                        onClick={() => loadHistory(history.page + 1)}
                        disabled={history.loading}
                        className="mt-3 w-full rounded-2xl game-card px-4 py-3 min-h-[48px] font-semibold game-press disabled:opacity-60"
                    >
                        {history.loading ? 'Yükleniyor…' : 'Daha fazla göster'}
                    </button>
                )}
            </section>
        </GameLayout>
    );
};

export default DilemmaPage;
