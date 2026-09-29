import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuCheck, LuHourglass } from 'react-icons/lu';
import GameLayout from '../../components/game/GameLayout';
import { GameError, GameLoading } from '../../components/game/GameStates';
import Countdown from '../../components/game/Countdown';
import UserAvatar from '../../components/UserAvatar';
import { DUEL_RESULT_LABELS, DUEL_STATUS_LABELS, duelMine, formatDate, formatNumber } from '../../components/game/gameUtils';
import { gameApi, gameErrorMessage } from '../../services/gameApi';

const Side = ({ user, score, finished, label, winner }) => (
    <div className={`flex min-w-0 flex-1 flex-col items-center rounded-3xl p-4 text-center ${winner ? 'bg-gold/20 ring-2 ring-gold' : 'bg-white/10'}`}>
        <div className="relative">
            <UserAvatar user={user || { username: '?' }} size="xl" />
            {winner && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl" aria-label="Kazanan">
                    👑
                </span>
            )}
        </div>
        <p className="mt-2 max-w-full truncate font-bold">{user?.username || label}</p>
        <p className="text-[11px] uppercase tracking-wider text-white/60">{label}</p>
        <p className="mt-2 text-3xl font-black tabular-nums">{score != null ? formatNumber(score) : '?'}</p>
        <p className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${finished ? 'text-emerald-300' : 'text-white/60'}`}>
            {finished ? <LuCheck aria-hidden="true" /> : <LuHourglass aria-hidden="true" />}
            {finished ? 'Bitirdi' : 'Oynamadı'}
        </p>
    </div>
);

const DuelDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [duel, setDuel] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await gameApi.getDuel(id);
            setDuel(data.duel);
        } catch (err) {
            setError(gameErrorMessage(err, 'Düello yüklenemedi.'));
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const act = async (fn, okMsg) => {
        if (busy) return;
        setBusy(true);
        try {
            const data = await fn(id);
            if (data.session?.id) {
                navigate(`/oyun/oyna/${data.session.id}`);
                return;
            }
            if (okMsg) toast(okMsg);
            if (data.duel) setDuel(data.duel);
        } catch (err) {
            toast.error(gameErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const d = duelMine(duel);
    const res = duel?.result ? DUEL_RESULT_LABELS[duel.result] : null;
    const iAmInvitee = duel?.my_role === 'opponent' && duel?.status === 'pending';

    return (
        <GameLayout docTitle="Düello" back={{ to: '/oyun/duello', label: 'Düellolar' }} maxWidth="max-w-3xl">
            {error ? (
                <GameError message={error} onRetry={load} />
            ) : !duel ? (
                <GameLoading />
            ) : (
                <>
                    <section className="game-hero rounded-3xl p-5 sm:p-7 shadow-2xl game-pop-in">
                        <div className="text-center">
                            <p className="text-[11px] uppercase tracking-widest text-white/60">
                                {duel.is_random ? 'Rastgele düello' : 'Bire bir düello'} · {formatDate(duel.created_at)}
                            </p>
                            {res ? (
                                <p className={`mt-2 inline-block rounded-full px-4 py-1.5 text-sm font-extrabold ${res.className}`}>{res.text}</p>
                            ) : (
                                <p className="mt-2 font-bold">{DUEL_STATUS_LABELS[duel.status] || duel.status}</p>
                            )}
                        </div>
                        <div className="relative mt-5 flex items-stretch gap-3">
                            <Side user={d.me} score={d.myScore} finished={d.finished} label="Sen" winner={duel.winner_id && duel.winner_id === d.me?.id} />
                            <span className="self-center text-lg font-black text-gold" aria-hidden="true">VS</span>
                            <Side
                                user={d.rival}
                                score={d.finished && d.rivalFinished ? d.theirScore : null}
                                finished={d.rivalFinished}
                                label={d.rival ? 'Rakip' : 'Aranıyor'}
                                winner={duel.winner_id && duel.winner_id === d.rival?.id}
                            />
                        </div>
                        {['pending', 'active'].includes(duel.status) && duel.expires_at && (
                            <p className="mt-4 text-center text-sm text-white/70">
                                {duel.status === 'pending' ? 'Davetin bitmesine' : 'Düellonun kapanmasına'}: <Countdown target={new Date(duel.expires_at).getTime()} className="font-bold text-white" />
                            </p>
                        )}
                    </section>

                    <div className="mt-5 flex flex-col sm:flex-row gap-3">
                        {iAmInvitee && (
                            <>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => act(gameApi.acceptDuel)}
                                    className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 min-h-[56px] font-bold text-white game-press disabled:opacity-60"
                                >
                                    Kabul et ve oyna
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => act(gameApi.declineDuel, 'Davet reddedildi.')}
                                    className="flex-1 rounded-2xl game-card px-5 py-3 min-h-[56px] font-bold game-press disabled:opacity-60"
                                >
                                    Reddet
                                </button>
                            </>
                        )}
                        {!iAmInvitee && duel.my_session_id && !d.finished && ['active', 'pending'].includes(duel.status) && (
                            <button
                                type="button"
                                onClick={() => navigate(`/oyun/oyna/${duel.my_session_id}`)}
                                className="flex-1 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 py-3 min-h-[56px] font-bold text-white game-press game-glow-coral"
                            >
                                Sıra sende · Oyna
                            </button>
                        )}
                        {duel.my_session_id && d.finished && (
                            <Link
                                to={`/oyun/sonuc/${duel.my_session_id}`}
                                className="flex flex-1 items-center justify-center rounded-2xl game-card px-5 py-3 min-h-[56px] font-bold game-press"
                            >
                                Cevaplarımı gör
                            </Link>
                        )}
                        {d.rival?.username && ['finished', 'declined', 'expired'].includes(duel.status) && (
                            <Link
                                to={`/oyun/duello?kullanici=${encodeURIComponent(d.rival.username)}`}
                                className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-5 py-3 min-h-[56px] font-bold text-white game-press"
                            >
                                Rövanş iste
                            </Link>
                        )}
                    </div>
                </>
            )}
        </GameLayout>
    );
};

export default DuelDetailPage;
