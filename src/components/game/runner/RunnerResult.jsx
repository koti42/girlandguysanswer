import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CoinReward from '../CoinReward';
import ResultReviewNote from '../ResultReviewNote';
import useResultGuard from '../useResultGuard';
import ReactConfetti from 'react-confetti';
import toast from 'react-hot-toast';
import { LuCheck, LuCoins, LuDoorOpen, LuHouse, LuLogIn, LuRotateCcw, LuShare2, LuTrophy, LuX } from 'react-icons/lu';
import BadgeGrid from '../BadgeGrid';
import { XpBar } from '../PlayerCard';
import { formatNumber, prefersReducedMotion, shareOrCopy } from '../gameUtils';
import useCountUp from './useCountUp';
import { LANES } from './runnerUtils';

const Stat = ({ label, value, accent = 'text-white' }) => (
    <div className="rounded-2xl bg-white/10 px-2 py-3">
        <dt className="text-[10px] uppercase tracking-wide text-white/60">{label}</dt>
        <dd className={`text-lg font-extrabold tabular-nums ${accent}`}>{value}</dd>
    </div>
);

const ctaBtn = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 font-bold game-press';

const headline = (r) => {
    if (r.new_best) return 'Yeni rekor! 🏆';
    if (r.crashed === false) return 'Koşu tamam! 🏁';
    const d = Number(r.distance_m) || 0;
    if (d >= 2000) return 'Efsane koşu! 🔥';
    if (d >= 800) return 'Harika koşu! 🎉';
    if (d >= 300) return 'İyi gidiyorsun! 👏';
    return 'Bir dahaki sefere! 💪';
};

const questionText = (q) => (typeof q === 'string' ? q : q?.text || '');

const laneText = (options, lane) => {
    if (!Number.isInteger(lane) || lane < 0 || lane > 2) return '—';
    const opt = options?.[lane];
    return `${LANES[lane].label}${opt != null ? ` · ${opt}` : ''}`;
};

/**
 * Koşu sonu ekranı (dereceli ya da antrenman). Oyun katmanının içinde,
 * kendi kaydırmasıyla çizilir.
 */
/*
 * Konfeti tuvali görünür alan kadar olmalı: innerWidth masaüstünde dikey
 * kaydırma çubuğunu da sayar, tuval taşar. Küçük ekranda parça sayısı da
 * azalır (eski telefonlarda kare düşmesin).
 */
const viewportSize = () => {
    const el = document.documentElement;
    const w = Math.round(el?.clientWidth || window.innerWidth || 0);
    const h = Math.round(window.innerHeight || el?.clientHeight || 0);
    return { w: Math.max(1, w), h: Math.max(1, h) };
};

const confettiPieces = (w) => Math.max(120, Math.min(380, Math.round((Number(w) || 0) * 0.3)));

/*
 * lobbyLabel: çıkış butonunun metni (gömmede "Oyundan çık"). share: paylaş
 * butonu (mobil gömmede yok). onLogin: verilirse misafir çağrısı bağlantı
 * yerine bu işlevi çağıran butonlar olur (gömme, Router'sız). onShop: aynı
 * şekilde "Mağazaya git" (gömmede native'e openUrl).
 */
const RunnerResult = ({ result, explanations = {}, onAgain, onLobby, lobbyLabel = 'Lobiye dön', share: canShare = true, onLogin, onShop, busy = false, guest = false }) => {
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

    // Sonuç açılınca odak başlığa: ekran okuyucu sonucu okur, Tab butonlara iner.
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
            // Sonuç açıldıktan sonra yön değişmiş olabilir: boyutu başlarken tazele.
            setSize(viewportSize());
            setConfetti(true);
        }, 300);
        return () => clearTimeout(t);
    }, [result?.new_best, reduced]);

    if (!result) return null;
    const practice = Boolean(result.practice);
    const gates = Array.isArray(result.gates) ? result.gates : [];
    const badges = Array.isArray(result.badges_earned) ? result.badges_earned : [];
    const bd = result.breakdown || {};
    // Cüzdana eklenen jeton (sunucu; sayılmayan koşuda 0). Eski yanıtta alan yoksa toplanan jeton.
    const coinsEarned = result.coins_earned ?? (result.counted === false ? 0 : result.coins);

    /*
     * Paylaşım sayfası açıkken ikinci dokunuş navigator.share'i InvalidStateError
     * ile düşürür ve panoya kopyalamaya kayardı: tek paylaşım. Kullanıcı
     * sayfayı kapatırsa (AbortError -> 'cancelled') hiçbir şey gösterilmez.
     */
    const share = async () => {
        if (sharingRef.current) return;
        sharingRef.current = true;
        setSharing(true);
        try {
            const text = `Herkesler Koşuyor'da ${formatNumber(result.distance_m)} m koştum ve ${formatNumber(result.score)} puan yaptım! Sen kaç metre gidebilirsin?`;
            const url = `${window.location.origin}/oyun/kosu`;
            const outcome = await shareOrCopy({ title: 'Herkesler Koşuyor', text, url });
            if (outcome === 'copied') toast.success('Sonuç panoya kopyalandı!');
            else if (outcome === 'failed') toast.error('Paylaşılamadı.');
        } finally {
            sharingRef.current = false;
            if (mountedRef.current) setSharing(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-2xl pb-[max(1.5rem,var(--hs-safe-bottom,env(safe-area-inset-bottom)))] pl-[max(1rem,var(--hs-safe-left,env(safe-area-inset-left)))] pr-[max(1rem,var(--hs-safe-right,env(safe-area-inset-right)))] pt-[max(1rem,var(--hs-safe-top,env(safe-area-inset-top)))]" {...guardProps}>
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

            <section className="game-hero rounded-3xl p-5 sm:p-7 text-center shadow-2xl ring-1 ring-white/10 game-pop-in" aria-labelledby="runner-result-title">
                <p className="text-[11px] uppercase tracking-widest text-white/60">
                    Herkesler Koşuyor · {practice ? 'Antrenman' : 'Dereceli koşu'}
                </p>
                <h1 id="runner-result-title" ref={titleRef} tabIndex={-1} className="mt-1 text-xl font-bold text-white outline-none">
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

                <dl className={`mt-5 grid gap-2 ${practice ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
                    <Stat label="Mesafe" value={`${formatNumber(result.distance_m)} m`} />
                    <Stat
                        label="Jeton"
                        value={
                            <span className="inline-flex items-center gap-1">
                                <LuCoins className="text-amber-300" aria-hidden="true" />
                                {formatNumber(result.coins)}
                            </span>
                        }
                    />
                    {!practice && <Stat label="Doğru kapı" value={`${result.correct_count ?? 0}/${result.gates_passed ?? 0}`} />}
                    {!practice && <Stat label="En yüksek çarpan" value={`x${result.max_multiplier ?? 1}`} accent="text-gold" />}
                </dl>

                {/* Sunucu kısa koşuları (50 m altı) istatistiğe katmıyor; alan yoksa sayılmış varsayılır. */}
                {!practice && result.counted === false && (
                    <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-xs text-white/75" role="note">
                        50 metreden kısa koşular istatistiklere sayılmaz.
                    </p>
                )}

                <ResultReviewNote result={result} />

                {!practice && (bd.dist_points != null || bd.coin_points != null || bd.gate_points != null) && (
                    <p className="mt-3 text-xs text-white/60 tabular-nums" data-testid="runner-score-breakdown">
                        {/* Puan birimi: üstteki MESAFE (m) / JETON (adet) kartlarıyla karışmasın diye ayrı adlar */}
                        Puan dağılımı: Mesafe +{formatNumber(bd.dist_points)} · Jeton toplama +{formatNumber(bd.coin_points)} · Kapı +{formatNumber(bd.gate_points)}
                    </p>
                )}

                {practice ? (
                    <p className="mt-4 text-sm text-white/75">
                        Bu cihazdaki rekorun: <strong className="text-gold tabular-nums">{formatNumber(result.best_score)}</strong> puan ·{' '}
                        <strong className="tabular-nums">{formatNumber(result.best_distance)}</strong> m
                    </p>
                ) : (
                    <>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
                            <span className="rounded-full bg-white/10 px-3 py-1 font-bold text-gold tabular-nums">+{result.xp_earned ?? 0} XP</span>
                            {result.best_score != null && (
                                <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white/85 tabular-nums">
                                    En iyin: {formatNumber(result.best_score)}
                                </span>
                            )}
                            {result.weekly_rank != null && (
                                <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white/85 tabular-nums">Haftalık sıran: #{result.weekly_rank}</span>
                            )}
                        </div>
                        <CoinReward coins={coinsEarned} balance={result.wallet?.balance} capped={result.coins_capped === true} onShop={onShop} />
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
                    <p className="font-bold">Soru kapıları, XP ve haftalık sıralama seni bekliyor!</p>
                    <p className="mt-1 text-sm text-white/70">Giriş yap; doğru şeritten geç, çarpanı x5&apos;e çıkar, liderliğe yerleş.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                        {onLogin ? (
                            <button type="button" onClick={onLogin} className={`${ctaBtn} bg-gradient-to-r from-coral to-orange-400 text-white`}>
                                <LuLogIn aria-hidden="true" /> Giriş yap / Üye ol
                            </button>
                        ) : (
                            <>
                                <Link to="/login" className={`${ctaBtn} bg-gradient-to-r from-coral to-orange-400 text-white`}>
                                    <LuLogIn aria-hidden="true" /> Giriş yap
                                </Link>
                                <Link to="/signup" className={`${ctaBtn} bg-white/15 text-white ring-1 ring-white/20`}>
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
                    <LuRotateCcw aria-hidden="true" /> {busy ? 'Hazırlanıyor…' : 'Tekrar Koş'}
                </button>
                <button
                    type="button"
                    onClick={onLobby}
                    className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3 font-bold text-white ring-1 ring-white/15 game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                    {lobbyLabel === 'Lobiye dön' ? <LuHouse aria-hidden="true" /> : <LuDoorOpen aria-hidden="true" />} {lobbyLabel}
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

            {gates.length > 0 && (
                <section className="mt-5 rounded-3xl bg-white/5 p-4 text-white ring-1 ring-white/10 sm:p-5">
                    <h2 className="mb-3 font-bold">Kapı kapı özet</h2>
                    <ol className="space-y-2.5">
                        {gates.map((g) => {
                            // Canlı kapı yanıtındaki açıklama; yoksa (kapı isteği düştüyse) bitiş yanıtındaki.
                            const own = explanations[g.index] || g.explanation;
                            const explanation = typeof own === 'string' && own.trim() ? own : null;
                            return (
                                <li key={g.index} className="rounded-2xl bg-white/5 p-3">
                                    <div className="flex items-start gap-3">
                                        <span
                                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${
                                                g.correct ? 'bg-emerald-500' : 'bg-rose-500'
                                            }`}
                                        >
                                            {g.correct ? <LuCheck aria-hidden="true" /> : <LuX aria-hidden="true" />}
                                            <span className="sr-only">{g.correct ? 'Doğru' : 'Yanlış'}</span>
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-semibold">
                                                {g.index + 1}. {questionText(g.question)}
                                            </p>
                                            <p className="mt-1 break-words text-xs text-white/70">
                                                Doğru: <strong className="text-emerald-300">{laneText(g.options, g.correct_lane)}</strong>
                                                {!g.correct && (
                                                    <>
                                                        {' · '}Senin: <span className="text-rose-300">{laneText(g.options, g.chosen_lane)}</span>
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

export default RunnerResult;
