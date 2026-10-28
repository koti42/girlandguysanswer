import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCopy, LuHouse, LuMessageCircleQuestion, LuRotateCcw, LuSave, LuShare2, LuTrophy } from 'react-icons/lu';
import { FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { gameErrorMessage } from '../../../services/gameErrors';
import protocolZeroApiDefault from '../../../services/protocolZeroApi';
import { CLIENT_VERSION } from '../../../game/protocolZero/constants';
import { archetypeOf } from '../../../game/protocolZero/archetypes';
import { buildShareText, buildShareUrl, copyText, shareResult, whatsappLink, xLink } from '../../../game/protocolZero/share';
import { CANONICAL_ORIGIN } from '../../../config/site';
import PzLeaderboard from './PzLeaderboard';
import { defeatText, difficultyName, fmtNum, loadName, saveBestIfBetter, saveName, victoryText } from './pzUtils';

const Stat = ({ label, value, tone = 'text-white' }) => (
    <div className="rounded-2xl bg-white/5 px-3 py-2.5">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-white/60">{label}</dt>
        <dd className={`pz-mono mt-0.5 text-lg font-black ${tone}`}>{value}</dd>
    </div>
);

/**
 * Oyun sonu raporu: skor + istatistik, skoru kaydet (misafir ad girer / üye otomatik), paylaş
 * (Web Share · pano · WhatsApp · X), liderlik ve tartışma sorusuna çağrı.
 *
 * result: { summary (sim.summary), score, elapsedSeconds }; user: oturum sahibi | null.
 */
const ReportScreen = ({ result, user, api = protocolZeroApiDefault, onReplay, onExit, onSound }) => {
    const { summary, score, elapsedSeconds } = result;
    const victory = summary.outcome === 'victory';
    const member = Boolean(user);
    const [name, setName] = useState(() => (member ? user.username : loadName()));
    const [state, setState] = useState({ status: 'idle', error: '', data: null });
    const [overview, setOverview] = useState(null);
    const [shareMsg, setShareMsg] = useState('');
    const [lbKey, setLbKey] = useState(0);

    useEffect(() => {
        saveBestIfBetter({ score, days: summary.days, difficulty: summary.difficulty, outcome: summary.outcome });
    }, [score, summary]);

    useEffect(() => {
        let alive = true;
        api.overview(summary.difficulty).then(
            (d) => alive && setOverview(d || null),
            () => alive && setOverview(null)
        );
        return () => {
            alive = false;
        };
    }, [api, summary.difficulty]);

    const shareText = useMemo(
        () => buildShareText({ outcome: summary.outcome, days: summary.days, score, difficulty: summary.difficulty, archetype: summary.archetype }, buildShareUrl(CANONICAL_ORIGIN)),
        [summary, score]
    );

    const submit = useCallback(
        async (e) => {
            e?.preventDefault?.();
            const trimmed = String(name || '').trim();
            if (!member && trimmed.length < 2) {
                setState({ status: 'error', error: 'Komutan adı en az 2 karakter olmalı.', data: null });
                return;
            }
            setState({ status: 'saving', error: '', data: null });
            try {
                const data = await api.submitScore({
                    player_name: member ? undefined : trimmed,
                    difficulty: summary.difficulty,
                    outcome: summary.outcome,
                    victory_type: victory ? summary.victoryType : undefined,
                    score,
                    survival_days: summary.days,
                    decryption_progress: summary.decrypt,
                    nodes_saved: summary.nodesSaved,
                    elapsed_seconds: Math.max(1, Math.round(elapsedSeconds)),
                    client_version: CLIENT_VERSION,
                    meta: {
                        archetype: summary.archetype,
                        bubbles: summary.bubbles,
                        techs: summary.techs,
                        breaches_won: summary.breachesWon,
                        breaches_lost: summary.breachesLost,
                        purges: summary.purges,
                        isolations: summary.isolations,
                        dilemmas: summary.dilemmas,
                    },
                });
                if (!member) saveName(trimmed);
                onSound?.('coin');
                setState({ status: 'saved', error: '', data });
                setLbKey((k) => k + 1);
            } catch (err) {
                setState({ status: 'error', error: gameErrorMessage(err, 'Skor kaydedilemedi.'), data: null });
            }
        },
        [api, name, member, summary, score, victory, elapsedSeconds, onSound]
    );

    const doShare = useCallback(async () => {
        onSound?.('click');
        const r = await shareResult(shareText);
        setShareMsg(r === 'shared' ? 'Paylaşıldı!' : r === 'copied' ? 'Metin panoya kopyalandı.' : 'Paylaşım açılamadı; metni kopyalayabilirsin.');
    }, [shareText, onSound]);

    const doCopy = useCallback(async () => {
        onSound?.('click');
        setShareMsg((await copyText(shareText)) ? 'Metin panoya kopyalandı.' : 'Kopyalanamadı.');
    }, [shareText, onSound]);

    const discussion = state.data?.discussion ?? overview?.discussion ?? null;
    const rank = state.data?.rank;

    return (
        <div className="pz-modal-backdrop pz-scrollable">
            <div className="pz-modal pz-glass pz-scan max-w-2xl p-5 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="pz-report-title">
                <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] ring-1 ${victory ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/40' : 'bg-rose-500/15 text-rose-200 ring-rose-300/40'}`}>
                    Görev raporu · {difficultyName(summary.difficulty)} · {archetypeOf(summary.archetype).icon} {archetypeOf(summary.archetype).name}
                </p>
                <h2 id="pz-report-title" className="mt-2 text-3xl font-black leading-none text-white sm:text-4xl">
                    {victory ? '🏆 DÜNYA KURTARILDI' : '💀 GÖREV BAŞARISIZ'}
                </h2>
                <p className="mt-2 text-sm text-white/80">{victory ? victoryText(summary.victoryType) : defeatText(summary.defeatReason)}</p>

                <div className="mt-4 rounded-3xl bg-gradient-to-r from-cyan-400/15 to-fuchsia-500/15 p-4 text-center ring-1 ring-cyan-300/30">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">Skor</p>
                    <p className="pz-mono text-5xl font-black text-white">{fmtNum(score)}</p>
                    {rank && (
                        <p className="mt-1 text-sm font-bold text-amber-200">
                            <LuTrophy className="inline" aria-hidden="true" /> {difficultyName(summary.difficulty)} tablosunda #{rank}
                        </p>
                    )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Geçen gün" value={summary.days} />
                    <Stat label="Kurtarılan sunucu" value={`${summary.nodesSaved}/14`} tone={summary.nodesSaved === 14 ? 'text-emerald-300' : 'text-white'} />
                    <Stat label="Çekirdek deşifre" value={`%${summary.decrypt}`} tone="text-violet-200" />
                    <Stat label="Geliştirme" value={`${summary.techs}/9`} />
                    <Stat label="Saldırı püskürtme" value={`${summary.breachesWon}✓ ${summary.breachesLost}✗`} />
                    <Stat label="Temizlik" value={summary.purges} />
                    <Stat label="İzolasyon" value={summary.isolations} />
                    <Stat label="Kriz kararı" value={summary.dilemmas} />
                </dl>

                {/* Skoru kaydet */}
                <form onSubmit={submit} className="mt-4 rounded-2xl bg-white/5 p-3" aria-labelledby="pz-save-title">
                    <h3 id="pz-save-title" className="text-sm font-extrabold text-white">
                        {state.status === 'saved' ? 'Skorun liderlik tablosunda!' : member ? `Skoru ${user.username} olarak kaydet` : 'Küresel liderliğe adını yaz'}
                    </h3>
                    {state.status !== 'saved' && (
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            {!member && (
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    maxLength={24}
                                    placeholder="Komutan adın (2-24 karakter)"
                                    aria-label="Komutan adı"
                                    className="min-h-[48px] flex-1 rounded-xl border border-cyan-300/30 bg-black/30 px-3 text-sm font-semibold text-white placeholder:text-white/40 focus:border-cyan-300 focus:outline-none"
                                />
                            )}
                            <button type="submit" disabled={state.status === 'saving'} className="pz-btn pz-btn-primary !min-h-[48px]">
                                <LuSave aria-hidden="true" /> {state.status === 'saving' ? 'Kaydediliyor…' : 'Skoru kaydet'}
                            </button>
                        </div>
                    )}
                    {!member && state.status !== 'saved' && (
                        <p className="mt-2 text-[11px] text-white/60">
                            Misafir olarak kaydediyorsun.{' '}
                            <Link to="/login" className="font-bold text-cyan-200 underline">
                                Giriş yap
                            </Link>{' '}
                            ki skorların profiline bağlansın.
                        </p>
                    )}
                    {state.status === 'error' && (
                        <p role="alert" className="mt-2 text-xs font-semibold text-rose-200">
                            {state.error}
                        </p>
                    )}
                </form>

                {/* Paylaş */}
                <div className="mt-3 rounded-2xl bg-white/5 p-3">
                    <h3 className="text-sm font-extrabold text-white">Sonucunu paylaş, arkadaşlarına meydan oku</h3>
                    <p className="mt-1 line-clamp-2 text-[11px] text-white/60">{shareText}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={doShare} className="pz-btn pz-btn-primary">
                            <LuShare2 aria-hidden="true" /> Skorunu paylaş
                        </button>
                        <button type="button" onClick={doCopy} className="pz-btn pz-btn-ghost" aria-label="Metni kopyala">
                            <LuCopy aria-hidden="true" /> Kopyala
                        </button>
                        <a href={whatsappLink(shareText)} target="_blank" rel="noopener noreferrer" className="pz-btn pz-btn-ghost !text-emerald-200" aria-label="WhatsApp ile paylaş">
                            <FaWhatsapp aria-hidden="true" /> WhatsApp
                        </a>
                        <a href={xLink(shareText)} target="_blank" rel="noopener noreferrer" className="pz-btn pz-btn-ghost" aria-label="X ile paylaş">
                            <FaXTwitter aria-hidden="true" /> X
                        </a>
                    </div>
                    {shareMsg && (
                        <p role="status" className="mt-2 text-xs font-semibold text-cyan-200">
                            {shareMsg}
                        </p>
                    )}
                </div>

                {/* Tartışma */}
                {discussion?.path && (
                    <Link to={discussion.path} className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-fuchsia-500/20 to-cyan-400/20 p-3 ring-1 ring-fuchsia-300/30 hover:ring-fuchsia-300/60">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl text-fuchsia-200" aria-hidden="true">
                            <LuMessageCircleQuestion />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-sm font-extrabold text-white">Bu simülasyon hakkında ne düşünüyorsun? Sorulara katıl!</span>
                            <span className="block truncate text-[11px] text-white/70">{discussion.title}</span>
                        </span>
                    </Link>
                )}

                <div className="mt-4">
                    <PzLeaderboard api={api} initialDifficulty={summary.difficulty} limit={10} reloadKey={lbKey} dark title="Küresel Liderlik" />
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={onReplay} className="pz-btn pz-btn-primary flex-1 !min-h-[52px] text-sm">
                        <LuRotateCcw aria-hidden="true" /> Tekrar oyna
                    </button>
                    <button type="button" onClick={onExit} className="pz-btn pz-btn-ghost flex-1 !min-h-[52px] text-sm">
                        <LuHouse aria-hidden="true" /> Lobiye dön
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReportScreen;
