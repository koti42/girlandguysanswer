import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuSwords, LuDices, LuInbox, LuHourglass, LuHistory } from 'react-icons/lu';
import GameLayout from '../../components/game/GameLayout';
import { GameEmpty, GameError, GameLoading } from '../../components/game/GameStates';
import DuelRow from '../../components/game/DuelRow';
import { duelMine } from '../../components/game/gameUtils';
import { gameApi, gameErrorData, gameErrorMessage, gameErrorStatus } from '../../services/gameApi';

const btn = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 min-h-[44px] text-sm font-bold game-press disabled:opacity-60';

const DuelsPage = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const inputRef = useRef(null);
    const [username, setUsername] = useState(params.get('kullanici') || '');
    const [busy, setBusy] = useState(null); // 'challenge' | 'random' | duel id
    const [lists, setLists] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await gameApi.listDuels();
            setLists({ incoming: data.incoming || [], active: data.active || [], history: data.history || [] });
        } catch (err) {
            setError(gameErrorMessage(err, 'Düellolar yüklenemedi.'));
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (params.get('meydan') || params.get('kullanici')) inputRef.current?.focus();
    }, [params]);

    const create = async (random) => {
        if (busy) return;
        const name = username.trim().replace(/^@/, '');
        if (!random && !name) {
            toast.error('Meydan okumak için bir kullanıcı adı yaz.');
            inputRef.current?.focus();
            return;
        }
        setBusy(random ? 'random' : 'challenge');
        try {
            const data = await gameApi.createDuel(random ? undefined : name);
            // Açık rastgele düellon zaten varsa sunucu onu döner; kendi payını
            // bitirdiysen oynanacak bir şey yok, düello sayfasına git.
            if (data.session?.status && data.session.status !== 'active') {
                toast('Açık rastgele düellon hâlâ rakip bekliyor.', { icon: '⏳' });
                navigate(`/oyun/duello/${data.duel.id}`);
                return;
            }
            const joined = data.duel?.my_role === 'opponent';
            toast.success(
                random
                    ? joined
                        ? `${data.duel?.challenger?.username || 'Bir rakip'} ile eşleştin!`
                        : 'Rastgele düello açıldı. Sen oyna, rakip gelince sonuç belli olacak.'
                    : `${name} kullanıcısına meydan okudun!`
            );
            navigate(`/oyun/oyna/${data.session.id}`);
        } catch (err) {
            const existing = gameErrorStatus(err) === 409 ? gameErrorData(err)?.duel_id : null;
            if (existing) {
                // Aynı kişiye zaten bekleyen davet var.
                toast(gameErrorMessage(err, 'Bu kullanıcıya zaten bekleyen bir davetin var.'), { icon: '⏳' });
                navigate(`/oyun/duello/${existing}`);
                return;
            }
            toast.error(gameErrorMessage(err, 'Düello oluşturulamadı.'));
            setBusy(null);
        }
    };

    const accept = async (duel) => {
        if (busy) return;
        setBusy(duel.id);
        try {
            const data = await gameApi.acceptDuel(duel.id);
            navigate(`/oyun/oyna/${data.session.id}`);
        } catch (err) {
            toast.error(gameErrorMessage(err, 'Davet kabul edilemedi.'));
            setBusy(null);
            load();
        }
    };

    const decline = async (duel) => {
        if (busy) return;
        setBusy(duel.id);
        try {
            await gameApi.declineDuel(duel.id);
            toast('Davet reddedildi.');
        } catch (err) {
            toast.error(gameErrorMessage(err, 'Davet reddedilemedi.'));
        } finally {
            setBusy(null);
            load();
        }
    };

    return (
        <GameLayout title="Bire Bir Düello" subtitle="Aynı 7 soru, ayrı ayrı çözülür. Yüksek puan kazanır." back={{ to: '/oyun', label: 'Oyun Merkezi' }} maxWidth="max-w-3xl">
            <section className="game-hero rounded-3xl p-5 sm:p-6 shadow-2xl game-pop-in">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        create(false);
                    }}
                >
                    <label htmlFor="duel-username" className="block text-sm font-bold text-white/80">
                        Kime meydan okuyorsun?
                    </label>
                    <div className="mt-2 flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">@</span>
                            <input
                                id="duel-username"
                                ref={inputRef}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                placeholder="kullaniciadi"
                                className="w-full rounded-2xl border border-white/20 bg-white/10 py-3.5 pl-9 pr-4 min-h-[52px] text-base text-white placeholder-white/40 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={Boolean(busy)}
                            className={`${btn} min-h-[52px] rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-6 text-base text-white game-glow-coral`}
                        >
                            <LuSwords aria-hidden="true" /> {busy === 'challenge' ? 'Gönderiliyor…' : 'Meydan oku'}
                        </button>
                    </div>
                </form>
                <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-white/40">
                    <span className="h-px flex-1 bg-white/15" /> ya da <span className="h-px flex-1 bg-white/15" />
                </div>
                <button
                    type="button"
                    onClick={() => create(true)}
                    disabled={Boolean(busy)}
                    className={`${btn} w-full min-h-[52px] rounded-2xl bg-white/15 text-base text-white ring-1 ring-white/25 hover:bg-white/25`}
                >
                    <LuDices aria-hidden="true" /> {busy === 'random' ? 'Rakip aranıyor…' : 'Rastgele rakip bul'}
                </button>
            </section>

            {error ? (
                <div className="mt-6">
                    <GameError message={error} onRetry={load} />
                </div>
            ) : !lists ? (
                <GameLoading label="Düellolar yükleniyor" />
            ) : (
                <>
                    <h2 className="mt-7 mb-3 flex items-center gap-2 text-lg font-extrabold">
                        <LuInbox className="text-coral" aria-hidden="true" /> Gelen davetler
                        {lists.incoming.length > 0 && (
                            <span className="rounded-full bg-coral px-2 py-0.5 text-xs text-white">{lists.incoming.length}</span>
                        )}
                    </h2>
                    {lists.incoming.length === 0 ? (
                        <GameEmpty title="Bekleyen davet yok" />
                    ) : (
                        <ul className="space-y-3">
                            {lists.incoming.map((duel) => (
                                <DuelRow key={duel.id} duel={duel}>
                                    <button
                                        type="button"
                                        onClick={() => decline(duel)}
                                        disabled={Boolean(busy)}
                                        className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15`}
                                    >
                                        Reddet
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => accept(duel)}
                                        disabled={Boolean(busy)}
                                        className={`${btn} bg-gradient-to-r from-emerald-500 to-teal-500 text-white`}
                                    >
                                        {busy === duel.id ? 'Açılıyor…' : 'Kabul et ve oyna'}
                                    </button>
                                </DuelRow>
                            ))}
                        </ul>
                    )}

                    <h2 className="mt-7 mb-3 flex items-center gap-2 text-lg font-extrabold">
                        <LuHourglass className="text-indigo-500" aria-hidden="true" /> Aktif düellolar
                    </h2>
                    {lists.active.length === 0 ? (
                        <GameEmpty title="Aktif düellon yok">Yukarıdan birine meydan oku!</GameEmpty>
                    ) : (
                        <ul className="space-y-3">
                            {lists.active.map((duel) => {
                                const d = duelMine(duel);
                                const myTurn = !d.finished && duel.my_session_id;
                                return (
                                    <DuelRow key={duel.id} duel={duel}>
                                        {myTurn ? (
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/oyun/oyna/${duel.my_session_id}`)}
                                                className={`${btn} bg-gradient-to-r from-coral to-orange-400 text-white game-glow-coral`}
                                            >
                                                Sıra sende · Oyna
                                            </button>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                                                <LuHourglass aria-hidden="true" />
                                                {d.rival ? 'Rakip bekleniyor' : 'Rakip aranıyor'}
                                            </span>
                                        )}
                                    </DuelRow>
                                );
                            })}
                        </ul>
                    )}

                    <h2 className="mt-7 mb-3 flex items-center gap-2 text-lg font-extrabold">
                        <LuHistory className="text-slate-500" aria-hidden="true" /> Geçmiş
                    </h2>
                    {lists.history.length === 0 ? (
                        <GameEmpty title="Henüz biten düello yok" />
                    ) : (
                        <ul className="space-y-3">
                            {lists.history.map((duel) => (
                                <DuelRow key={duel.id} duel={duel} showScores />
                            ))}
                        </ul>
                    )}
                </>
            )}
        </GameLayout>
    );
};

export default DuelsPage;
