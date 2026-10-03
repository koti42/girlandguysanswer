import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CoinReward from '../CoinReward';
import ResultReviewNote from '../ResultReviewNote';
import useResultGuard from '../useResultGuard';
import ReactConfetti from 'react-confetti';
import toast from 'react-hot-toast';
import { LuCheck, LuHouse, LuLogIn, LuRotateCcw, LuShare2, LuTrophy, LuX } from 'react-icons/lu';
import BadgeGrid from '../BadgeGrid';
import { XpBar } from '../PlayerCard';
import { formatNumber, prefersReducedMotion, shareOrCopy } from '../gameUtils';
import useCountUp from '../runner/useCountUp';
import { CHOICES, LOBBY_PATH } from './towerUtils';

const Stat = ({ label, value, accent = 'text-white' }) => (
    <div className="rounded-2xl bg-white/10 px-2 py-3">
        <dt className="text-[10px] uppercase tracking-wide text-white/60">{label}</dt>
        <dd className={`text-lg font-extrabold tabular-nums ${accent}`}>{value}</dd>
    </div>
);

const floorsOf = (r) => Number(r?.floors ?? r?.floor) || 0;

const headline = (r) => {
    if (r.new_best) return 'Yeni rekor! 🏆';
    const f = floorsOf(r);
    if (f >= 150) return 'Kuzey ışıklarına dokundun! 🌌';
    if (f >= 100) return 'Bulutların üstündesin! ☁️';
    if (f >= 50) return 'Tam bir gökdelen! 🏙️';
    if (f >= 20) return 'Harika kule! 🎉';
    if (f >= 8) return 'İyi gidiyorsun! 👏';
    return 'Bir dahaki sefere! 💪';
};

const questionText = (q) => (typeof q === 'string' ? q : q?.text || '');

const choiceText = (options, c) => {
    if (c !== 0 && c !== 1) return '—';
    const opt = options?.[c];
    return `${CHOICES[c].label}${opt != null ? ` · ${opt}` : ''}`;
};

/*
 * Konfeti tuvali görünür alan kadar olmalı (masaüstünde kaydırma çubuğu
 * innerWidth'e dahil); küçük ekranda parça sayısı da azalır.
 */
const viewportSize = () => {
    const el = document.documentElement;
    const w = Math.round(el?.clientWidth || window.innerWidth || 0);
    const h = Math.round(window.innerHeight || el?.clientHeight || 0);
    return { w: Math.max(1, w), h: Math.max(1, h) };
};

const confettiPieces = (w) => Math.max(120, Math.min(380, Math.round((Number(w) || 0) * 0.3)));

/**
 * Kule sonu ekranı (dereceli ya da antrenman). Oyun katmanının içinde kendi
 * kaydırmasıyla çizilir; arkada kamera kulenin tamamını gösteriyor.
 * onLogin verilirse (gömülü mod) giriş bağlantısı yerine o çağrılır; onShop
 * aynı şekilde "Mağazaya git" (gömmede native'e openUrl). lobbyLabel: çıkış
 * butonunun metni (gömmede "Oyundan çık"); share=false paylaş butonunu gizler.
 */
const TowerResult = ({ result, onAgain, onLobby, busy = false, guest = false, onLogin, onShop, shareUrl, lobbyLabel = 'Lobiye dön', share: canShare = true }) => {
    const reduced = prefersReducedMotion();
    const score = useCountUp(result?.score, { animate: !reduced });
    // İlk 600 ms düğmeler tıklamaya kapalı: oyunun son dokunuşları yanlış düğmeye gitmesin.
    const { guardProps } = useResultGuard();
    const [confetti, setConfetti] = useState(false);
    const [size, setSize] = useState(viewportSize);
    const [sharing, setSharing] = useState(false);
    const sharingRef = useRef(false);
    const titleRef = useRef(null);
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        titleRef.current?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        if (!confetti) return undefined;
        const onResize = () => setSize(viewportSize());
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, [confetti]);

    useEffect(() => {
        if (!result?.new_best || reduced) return undefined;
        const t = setTimeout(() => {
            setSize(viewportSize());
            setConfetti(true);
        }, 300);
        return () => clearTimeout(t);
    }, [result?.new_best, reduced]);

    if (!result) return null;
    const practice = Boolean(result.practice);
    const floors = floorsOf(result);
    const questions = Array.isArray(result.questions) ? result.questions : [];
    const badges = Array.isArray(result.badges_earned) ? result.badges_earned : [];
    const answered = Number(result.questions_answered ?? result.answered_count ?? questions.length) || 0;
    const counted = result.counted !== false;
    const coins = Number(result.coins_earned ?? result.jeton_earned ?? (counted ? floors : 0)) || 0;

    // Tek paylaşım: paylaşım sayfası açıkken ikinci dokunuş panoya kaymasın.
    const share = async () => {
        if (sharingRef.current) return;
        sharingRef.current = true;
        setSharing(true);
        try {
            const text = `Herkesler Yükseliyor'da ${formatNumber(floors)} katlı kule diktim ve ${formatNumber(result.score)} puan yaptım! Sen kaç kat çıkabilirsin?`;
            const url = shareUrl || `${window.location.origin}${LOBBY_PATH}`;
            const outcome = await shareOrCopy({ title: 'Herkesler Yükseliyor', text, url });
            if (outcome === 'copied') toast.success('Sonuç panoya kopyalandı!');
            else if (outcome === 'failed') toast.error('Paylaşılamadı.');
        } finally {
            sharingRef.current = false;
            if (mountedRef.current) setSharing(false);
        }
    };

    const loginBtn = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 font-bold text-white game-press';

    return (
        <div className="mx-auto w-full max-w-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))]" {...guardProps}>
            {confetti && (
                <ReactConfetti
                    width={size.w}
                    height={size.h}
                    recycle={false}
                    numberOfPieces={confettiPieces(size.w)}
                    gravity={0.25}
                    style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none' }}
                    onConfettiComplete={() => setConfetti(false)}
                />
            )}

            <section className="game-hero rounded-3xl p-5 sm:p-7 text-center shadow-2xl ring-1 ring-white/10 game-pop-in" aria-labelledby="tower-result-title">
                <p className="text-[11px] uppercase tracking-widest text-white/60">Herkesler Yükseliyor · {practice ? 'Antrenman' : 'Dereceli oyun'}</p>
                <h1 id="tower-result-title" ref={titleRef} tabIndex={-1} className="mt-1 text-xl font-bold text-white outline-none">
                    {headline(result)}
                </h1>
                {result.new_best && (
                    <p className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-gold to-coral px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-950 game-pop-in">
                        <LuTrophy aria-hidden="true" /> Kişisel rekor
                    </p>
                )}
                <p className="mt-3 text-5xl sm:text-6xl font-black tabular-nums game-text-gradient" aria-hidden="true">
                    {formatNumber(score)}
                </p>
                <p className="sr-only">{formatNumber(result.score)} puan</p>
                <p className="text-sm text-white/60" aria-hidden="true">
                    puan
                </p>

                <dl className={`mt-5 grid gap-2 ${practice ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                    <Stat label="Kat" value={formatNumber(floors)} />
                    <Stat label="Mükemmel" value={formatNumber(result.perfects ?? 0)} accent="text-gold" />
                    <Stat label="En uzun kombo" value={`x${formatNumber(result.max_combo ?? 0)}`} />
                    {!practice && <Stat label="Doğru cevap" value={`${result.correct_count ?? 0}/${answered}`} accent="text-emerald-300" />}
                </dl>

                {!practice && !counted && (
                    <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-xs text-white/75" role="note">
                        5 kattan kısa kuleler istatistiklere ve ödüllere sayılmaz.
                    </p>
                )}

                <ResultReviewNote result={result} />

                {practice ? (
                    <p className="mt-4 text-sm text-white/75">
                        Bu cihazdaki rekorun: <strong className="text-gold tabular-nums">{formatNumber(result.best_score)}</strong> puan ·{' '}
                        <strong className="tabular-nums">{formatNumber(result.best_floor)}</strong> kat
                    </p>
                ) : (
                    <>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
                            <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-gold tabular-nums">+{result.xp_earned ?? 0} XP</span>
                            {result.best_score != null && (
                                <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white/85 tabular-nums">En iyin: {formatNumber(result.best_score)}</span>
                            )}
                            {result.weekly_rank != null && (
                                <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white/85 tabular-nums">Haftalık sıran: #{result.weekly_rank}</span>
                            )}
                        </div>
                        <CoinReward coins={coins} balance={result.wallet?.balance} capped={result.coins_capped === true} onShop={onShop} />
                        {result.level_up && (
                            <div className="mt-4 rounded-2xl bg-gradient-to-r from-gold/30 to-coral/30 px-4 py-3 text-white game-pop-in" role="status">
                                <p className="font-extrabold">
                                    Seviye atladın! {result.level_before} → {result.level_after} 🚀
                                </p>
                            </div>
                        )}
                        {result.player && (
                            <div className="mt-4 text-left">
                                <XpBar player={result.player} />
                            </div>
                        )}
                    </>
                )}
            </section>

            {practice && guest && (
                <section className="mt-4 rounded-3xl bg-white/5 p-4 text-center text-white ring-1 ring-white/10">
                    <p className="font-bold">Soru katları, XP, jeton ve haftalık sıralama seni bekliyor!</p>
                    <p className="mt-1 text-sm text-white/70">Giriş yap; her 12 katta bir soru, doğru cevaba +150 puan.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                        {onLogin ? (
                            <button type="button" onClick={onLogin} className={loginBtn}>
                                <LuLogIn aria-hidden="true" /> Giriş yap
                            </button>
                        ) : (
                            <>
                                <Link to="/login" className={loginBtn}>
                                    <LuLogIn aria-hidden="true" /> Giriş yap
                                </Link>
                                <Link to="/signup" className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-white/15 px-5 font-bold text-white ring-1 ring-white/20 game-press">
                                    Üye ol
                                </Link>
                            </>
                        )}
                    </div>
                </section>
            )}

            <div className={`mt-4 grid grid-cols-1 gap-3 ${canShare ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <button
                    type="button"
                    onClick={onAgain}
                    disabled={busy}
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 py-3 font-bold text-white game-press game-glow-coral disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                    <LuRotateCcw aria-hidden="true" /> {busy ? 'Hazırlanıyor…' : 'Tekrar Oyna'}
                </button>
                <button
                    type="button"
                    onClick={onLobby}
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-bold text-white ring-1 ring-white/15 game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                    <LuHouse aria-hidden="true" /> {lobbyLabel}
                </button>
                {canShare && (
                <button
                    type="button"
                    onClick={share}
                    disabled={sharing}
                    aria-busy={sharing || undefined}
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-bold text-white ring-1 ring-white/15 game-press disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                    <LuShare2 aria-hidden="true" /> Paylaş
                </button>
                )}
            </div>

            {badges.length > 0 && (
                <section className="mt-5 game-card rounded-3xl p-5 text-slate-900 dark:text-white game-fade-up">
                    <h2 className="mb-3 flex items-center gap-2 font-bold">
                        <LuTrophy className="text-gold" aria-hidden="true" /> Yeni rozetler
                    </h2>
                    <BadgeGrid badges={badges.map((b) => ({ ...b, earned_at: b.earned_at || 'now' }))} />
                </section>
            )}

            {questions.length > 0 && (
                <section className="mt-5 rounded-3xl bg-white/5 p-4 text-white ring-1 ring-white/10 sm:p-5">
                    <h2 className="mb-3 font-bold">Soru katları</h2>
                    <ol className="space-y-2.5">
                        {questions.map((q) => {
                            const explanation = typeof q.explanation === 'string' && q.explanation.trim() ? q.explanation : null;
                            const chosen = q.chosen ?? q.choice;
                            return (
                                <li key={q.index} className="rounded-2xl bg-white/5 p-3">
                                    <div className="flex items-start gap-3">
                                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${q.correct ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                            {q.correct ? <LuCheck aria-hidden="true" /> : <LuX aria-hidden="true" />}
                                            <span className="sr-only">{q.correct ? 'Doğru' : 'Yanlış'}</span>
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-semibold">
                                                {(Number(q.index) + 1) * 12}. kat · {questionText(q.question)}
                                            </p>
                                            <p className="mt-1 break-words text-xs text-white/70">
                                                Doğru: <strong className="text-emerald-300">{choiceText(q.options, q.correct_choice)}</strong>
                                                {!q.correct && (
                                                    <>
                                                        {' · '}Senin: <span className="text-rose-300">{chosen === 0 || chosen === 1 ? choiceText(q.options, chosen) : 'cevapsız'}</span>
                                                    </>
                                                )}
                                            </p>
                                            {explanation && <p className="mt-1 break-words text-xs text-white/55">{explanation}</p>}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            )}
        </div>
    );
};

export default TowerResult;
