import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LuArrowRight, LuClock, LuFlagTriangleRight, LuLogOut } from 'react-icons/lu';
import GameLayout from '../../components/game/GameLayout';
import { GameError, GameLoading } from '../../components/game/GameStates';
import TimerRing from '../../components/game/TimerRing';
import OptionButton from '../../components/game/OptionButton';
import { MODE_LABELS, formatNumber, vibrate } from '../../components/game/gameUtils';
import { gameApi, gameErrorMessage, gameErrorStatus } from '../../services/gameApi';

/*
 * Ortak oyun ekranı (arena / günlük / düello).
 *
 * Süre sunucuda tutulur: soru ilk istendiğinde sunucu served_at yazar ve her
 * istekte kalan süreyi (remaining_ms) döner. İstemci bu değerden yerel bir
 * son tarih (deadline) hesaplar; sayfa yenilense de aynı soru azalmış
 * remaining_ms ile geleceği için kaldığı yerden devam eder. Süre bitince
 * `choice: null` gönderilir.
 *
 * Aşamalar: loading -> question -> submitting -> feedback -> (loading | sonuç)
 */
const GamePlayPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();

    const [phase, setPhase] = useState('loading');
    const [error, setError] = useState(null);
    const [session, setSession] = useState(null);
    const [question, setQuestion] = useState(null);
    const [deadline, setDeadline] = useState(null);
    const [frozenMs, setFrozenMs] = useState(null);
    const [selected, setSelected] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [hud, setHud] = useState({ score: 0, correct_count: 0, streak: 0 });
    const [notice, setNotice] = useState('');
    const [announcement, setAnnouncement] = useState('');

    const lockRef = useRef(false);
    const questionRef = useRef(null);
    const deadlineRef = useRef(null);
    const phaseRef = useRef(phase);
    const hiddenAtRef = useRef(null);
    const resultRef = useRef(null);
    const nextBtnRef = useRef(null);
    const headingRef = useRef(null);
    const mountedRef = useRef(true);

    // Aşama hem state'te (çizim) hem ref'te (olay işleyicileri) tutulur. Ref
    // effect'le değil burada eşzamanlı güncelleniyor: soru çizildiği anda
    // gelen dokunuş/tuş, effect henüz çalışmadı diye yutulmasın.
    const changePhase = useCallback((next) => {
        phaseRef.current = next;
        setPhase(next);
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const goToResult = useCallback(
        (result) => {
            navigate(`/oyun/sonuc/${sessionId}`, { replace: true, state: result ? { result } : undefined });
        },
        [navigate, sessionId]
    );

    const loadQuestion = useCallback(async () => {
        changePhase('loading');
        setError(null);
        try {
            const data = await gameApi.getQuestion(sessionId);
            if (!mountedRef.current) return;
            const q = data.question;
            const dl = Date.now() + Math.max(0, Number(q.remaining_ms) || 0);
            questionRef.current = q;
            deadlineRef.current = dl;
            lockRef.current = false;
            setQuestion(q);
            setDeadline(dl);
            setFrozenMs(null);
            setSelected(null);
            setFeedback(null);
            setNotice('');
            setAnnouncement(`Soru ${q.index + 1} / ${q.total}`);
            changePhase('question');
        } catch (err) {
            if (!mountedRef.current) return;
            if (gameErrorStatus(err) === 409) {
                // Oturum bitmiş: sonuç ekranına geç.
                goToResult();
                return;
            }
            setError(gameErrorMessage(err, 'Soru yüklenemedi.'));
            changePhase('error');
        }
    }, [sessionId, goToResult, changePhase]);

    // Oturumu çekip duruma göre soruya, sonuca ya da "terk edildi"ye yönlendirir.
    // (Promise geri çağrıları: effect'ten çağrıldığında gövdede senkron setState yok.)
    const init = useCallback(
        () =>
            gameApi.getSession(sessionId).then(
                (data) => {
                    if (!mountedRef.current) return undefined;
                    const s = data.session;
                    setSession(s);
                    setHud({ score: s.score ?? 0, correct_count: s.correct_count ?? 0, streak: s.streak ?? 0 });
                    if (s.status === 'finished') {
                        goToResult();
                        return undefined;
                    }
                    if (s.status === 'abandoned') {
                        changePhase('abandoned');
                        return undefined;
                    }
                    return loadQuestion();
                },
                (err) => {
                    if (!mountedRef.current) return;
                    setError(gameErrorMessage(err, 'Oyun yüklenemedi.'));
                    changePhase('error');
                }
            ),
        [sessionId, goToResult, loadQuestion, changePhase]
    );

    useEffect(() => {
        init();
    }, [init]);

    const submit = useCallback(
        async (choice) => {
            const q = questionRef.current;
            if (lockRef.current || !q || phaseRef.current !== 'question') return;
            lockRef.current = true;
            setSelected(choice);
            setFrozenMs(Math.max(0, (deadlineRef.current ?? Date.now()) - Date.now()));
            changePhase('submitting');
            try {
                const data = await gameApi.answer(sessionId, { index: q.index, choice });
                if (!mountedRef.current) return;
                const a = data.answer;
                setFeedback(a);
                setHud({ score: a.score, correct_count: a.correct_count, streak: a.streak });
                if (a.finished) resultRef.current = a.result || null;
                changePhase('feedback');
                const msg = a.correct
                    ? `Doğru! +${a.points} puan.`
                    : a.timed_out
                        ? `Süre doldu. Doğru cevap: ${q.question.options[a.correct_index]}.`
                        : `Yanlış. Doğru cevap: ${q.question.options[a.correct_index]}.`;
                setAnnouncement(msg);
                vibrate(a.correct ? 35 : [70, 50, 70]);
            } catch (err) {
                if (!mountedRef.current) return;
                if (gameErrorStatus(err) === 409) {
                    // Soru index'i sunucuyla uyuşmadı (başka sekme, yenileme...).
                    toast('Oyun sunucuyla eşitlendi.', { icon: '🔄' });
                    lockRef.current = false;
                    await init();
                    return;
                }
                lockRef.current = false;
                setSelected(null);
                setFrozenMs(null);
                changePhase('question');
                toast.error(gameErrorMessage(err, 'Cevap gönderilemedi, tekrar dene.'));
            }
        },
        [sessionId, init, changePhase]
    );

    // Süre bitince boş cevap. Arka plan sekmesinde zamanlayıcılar kısılabilir;
    // görünürlük dönüşünde ayrıca kontrol ediliyor.
    useEffect(() => {
        if (phase !== 'question' || !deadline) return undefined;
        const t = setTimeout(() => submit(null), Math.max(0, deadline - Date.now()));
        return () => clearTimeout(t);
    }, [phase, deadline, submit]);

    // Sekme görünmezken süre sunucuda işlemeye devam ediyor: kullanıcıya hissettir.
    useEffect(() => {
        let savedTitle = null;
        const restoreTitle = () => {
            if (savedTitle !== null) document.title = savedTitle;
            savedTitle = null;
        };
        const onVisibility = () => {
            if (document.hidden) {
                if (phaseRef.current === 'question') {
                    hiddenAtRef.current = Date.now();
                    savedTitle = document.title;
                    document.title = '⏳ Süren işliyor! · Oyun Merkezi';
                }
                return;
            }
            restoreTitle();
            const hiddenAt = hiddenAtRef.current;
            hiddenAtRef.current = null;
            if (hiddenAt && phaseRef.current === 'question') {
                const away = Date.now() - hiddenAt;
                if (away > 1000) {
                    setNotice(`Sen yokken ${Math.round(away / 1000)} sn geçti. Süre sunucuda işlemeye devam ediyor.`);
                }
                if (deadlineRef.current && Date.now() >= deadlineRef.current) submit(null);
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            restoreTitle();
        };
    }, [submit]);

    const goNext = useCallback(() => {
        if (phaseRef.current !== 'feedback') return;
        if (feedback?.finished) {
            goToResult(resultRef.current);
            return;
        }
        loadQuestion();
    }, [feedback, goToResult, loadQuestion]);

    // Klavye: 1-4 cevap, Enter sonraki soru.
    useEffect(() => {
        const onKey = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            if (phaseRef.current === 'question' && /^[1-4]$/.test(e.key)) {
                const idx = Number(e.key) - 1;
                if (idx < (questionRef.current?.question?.options?.length ?? 0)) {
                    e.preventDefault();
                    submit(idx);
                }
            } else if (phaseRef.current === 'feedback' && e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
                e.preventDefault();
                goNext();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [submit, goNext]);

    // Odak yönetimi
    useEffect(() => {
        if (phase === 'feedback') nextBtnRef.current?.focus({ preventScroll: true });
        if (phase === 'question') headingRef.current?.focus({ preventScroll: true });
    }, [phase]);

    const handleQuit = async () => {
        if (session?.mode === 'arena') {
            if (!window.confirm('Oyundan çıkarsan bu arena oturumu sona erer. Emin misin?')) return;
            try {
                await gameApi.abandon(sessionId);
            } catch {
                // Terk edilemese bile merkeze dönmek güvenli; yeni arena eskisini kapatıyor.
            }
        }
        navigate('/oyun');
    };

    if (phase === 'error') {
        return (
            <GameLayout docTitle="Oyun" showNav={false} maxWidth="max-w-2xl" back={{ to: '/oyun', label: 'Oyun Merkezi' }}>
                <GameError
                    message={error}
                    onRetry={() => {
                        setError(null);
                        changePhase('loading');
                        init();
                    }}
                />
            </GameLayout>
        );
    }

    if (phase === 'abandoned') {
        return (
            <GameLayout docTitle="Oyun" showNav={false} maxWidth="max-w-2xl" back={{ to: '/oyun', label: 'Oyun Merkezi' }}>
                <div className="game-card rounded-3xl p-6 text-center">
                    <LuFlagTriangleRight className="mx-auto text-3xl text-slate-400" aria-hidden="true" />
                    <p className="mt-2 font-semibold">Bu oyun yarıda bırakılmış.</p>
                    <button
                        type="button"
                        onClick={() => navigate(session?.duel_id ? `/oyun/duello/${session.duel_id}` : '/oyun/arena')}
                        className="mt-4 rounded-full bg-gradient-to-r from-coral to-orange-400 px-6 py-3 min-h-[48px] font-semibold text-white game-press"
                    >
                        {session?.duel_id ? 'Düelloya git' : 'Yeni oyun başlat'}
                    </button>
                </div>
            </GameLayout>
        );
    }

    const total = question?.total ?? session?.total_questions ?? 10;
    const index = question?.index ?? session?.current_index ?? 0;
    const timeLimit = question?.time_limit_ms ?? session?.time_limit_ms ?? 15000;
    const shownFrozen = frozenMs ?? (question ? Number(question.remaining_ms) : timeLimit);
    const options = question?.question?.options ?? [];
    const answered = phase === 'feedback' && feedback;
    const category = question?.question?.category || session?.category;

    const optionState = (i) => {
        if (answered) {
            if (i === feedback.correct_index) return 'correct';
            if (i === feedback.chosen_index) return 'wrong';
            return 'dim';
        }
        if (phase === 'submitting') return i === selected ? 'pending' : 'dim';
        return 'idle';
    };

    return (
        <GameLayout docTitle={MODE_LABELS[session?.mode] || 'Oyun'} showNav={false} maxWidth="max-w-3xl">
            <div className="sr-only" aria-live="assertive" aria-atomic="true">
                {announcement}
            </div>

            <section className="game-hero relative rounded-3xl p-4 sm:p-6 shadow-2xl overflow-hidden">
                {/* Üst şerit */}
                <div className="flex items-center justify-between gap-3 text-white">
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-widest text-white/60 truncate">
                            {MODE_LABELS[session?.mode] || 'Oyun'}
                            {category?.name ? ` · ${category.name}` : ''}
                        </p>
                        <p className="text-lg font-extrabold tabular-nums">
                            {Math.min(index + 1, total)}
                            <span className="text-white/50">/{total}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {hud.streak > 1 && (
                            <span className="rounded-full bg-orange-500/25 px-2.5 py-1 text-xs font-bold text-orange-200 game-pop-in" title="Doğru serisi">
                                <span className="game-flame" aria-hidden="true">🔥</span> x{hud.streak}
                            </span>
                        )}
                        <div className="text-right">
                            <p className="text-[11px] uppercase tracking-widest text-white/60">Skor</p>
                            <p className="text-lg font-extrabold tabular-nums game-text-gradient" aria-label={`Skor ${hud.score}`}>
                                {formatNumber(hud.score)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* İlerleme */}
                <div className="mt-3 flex gap-1" aria-hidden="true">
                    {Array.from({ length: total }).map((_, i) => (
                        <span
                            key={i}
                            className={`h-1.5 flex-1 rounded-full ${
                                i < index || (i === index && answered) ? 'bg-gradient-to-r from-coral to-gold' : i === index ? 'bg-white/60' : 'bg-white/15'
                            }`}
                        />
                    ))}
                </div>

                {phase === 'loading' || !question ? (
                    <div className="text-white">
                        <GameLoading label="Soru geliyor" />
                    </div>
                ) : (
                    <div key={question.index} className="game-pop-in">
                        <div className="mt-5 flex items-start gap-4">
                            <div className="relative">
                                <TimerRing deadline={deadline} running={phase === 'question'} frozenMs={shownFrozen} totalMs={timeLimit} />
                                {answered && feedback.points > 0 && (
                                    <span
                                        key={`pts-${question.index}`}
                                        className="game-float-up pointer-events-none absolute left-1/2 top-0 whitespace-nowrap text-xl font-extrabold text-gold drop-shadow"
                                        aria-hidden="true"
                                    >
                                        +{feedback.points}
                                    </span>
                                )}
                            </div>
                            <h2
                                ref={headingRef}
                                tabIndex={-1}
                                className="flex-1 min-w-0 break-words text-lg sm:text-xl font-bold leading-snug text-white outline-none"
                            >
                                {question.question.text}
                            </h2>
                        </div>

                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/50">
                            <LuClock aria-hidden="true" />
                            Süre sunucuda işler; sekmeyi değiştirsen de durmaz.
                        </p>

                        {notice && (
                            <p role="status" className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2 text-sm font-medium text-amber-200 game-fade-up">
                                {notice}
                            </p>
                        )}

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Şıklar">
                            {options.map((opt, i) => (
                                <OptionButton
                                    key={i}
                                    index={i}
                                    text={opt}
                                    state={optionState(i)}
                                    disabled={phase !== 'question'}
                                    onSelect={submit}
                                />
                            ))}
                        </div>

                        {answered && (
                            <div className="mt-5 game-fade-up">
                                <div
                                    className={`rounded-2xl px-4 py-3 ${
                                        feedback.correct ? 'bg-emerald-500/15 text-emerald-100' : 'bg-rose-500/15 text-rose-100'
                                    }`}
                                >
                                    <p className="text-lg font-extrabold">
                                        {feedback.correct ? 'Doğru!' : feedback.timed_out ? 'Süre doldu!' : 'Yanlış!'}
                                        {feedback.correct && <span className="ml-2 text-gold">+{feedback.points}</span>}
                                    </p>
                                    {feedback.explanation && <p className="mt-1 text-sm text-white/80">{feedback.explanation}</p>}
                                </div>
                                <button
                                    ref={nextBtnRef}
                                    type="button"
                                    onClick={goNext}
                                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-6 py-3.5 min-h-[56px] text-base font-bold text-white game-press game-glow-coral"
                                >
                                    {feedback.finished ? 'Sonuçları gör' : 'Sonraki soru'} <LuArrowRight aria-hidden="true" />
                                </button>
                                <p className="mt-2 hidden md:block text-center text-[11px] text-white/40">Enter ile devam et</p>
                            </div>
                        )}

                        {phase === 'question' && (
                            <p className="mt-3 hidden md:block text-center text-[11px] text-white/40">1-4 tuşlarıyla da cevap verebilirsin</p>
                        )}
                    </div>
                )}
            </section>

            <div className="mt-4 flex justify-center">
                <button
                    type="button"
                    onClick={handleQuit}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 min-h-[44px] text-sm font-semibold text-slate-500 hover:text-rose-500 dark:text-slate-400"
                >
                    <LuLogOut aria-hidden="true" />
                    {session?.mode === 'arena' ? 'Oyundan çık' : 'Merkeze dön'}
                </button>
            </div>
        </GameLayout>
    );
};

export default GamePlayPage;
