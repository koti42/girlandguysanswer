import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, vibrate } from '../../../components/game/gameUtils';
import { createSpeaker } from '../../../components/game/speech';
import {
    HAPTIC_PATTERNS,
    MAX_END_TICK,
    TOWER_RETRY,
    TOWER_SIM_VERSION,
    clampInt,
    classifyFinishError,
    clearPending,
    createHudStore,
    finishFailureText,
    finishTowerOnce,
    isCoarsePointer,
    isRetryable,
    loadMusicEnabled,
    loadMuted,
    HINT_LEARN_FLOOR,
    markTapHintLearned,
    normalizeTowerRun,
    parseAnswerResult,
    randomSeed,
    recordGuestRun,
    sanitizeHud,
    saveMusicEnabled,
    saveMuted,
    savePending,
    shouldShowTapHint,
    withRetry,
} from '../../../components/game/tower/towerUtils';
import { towerApi } from '../../../services/towerApi';
import { gameErrorMessage } from '../../../services/gameApi';
import { loadTowerEngine } from './engineLoader';

/*
 * Herkesler Yükseliyor oturum kancası (şartname §E.5). SPA oyun sayfası
 * (TowerPlayPage) ve gömülü mod (embed) bunu ortak kullanır; yönlendirme
 * bilmez: çıkış `onExit`, titreşim `onHaptic`, sonuç `onResult` ile dışarı
 * verilir.
 *
 * Aşamalar: loading -> countdown -> running (-> paused) -> finishing ->
 * result | saved (kaydedildi ama yanıt okunamadı) | finish-failed | rejected.
 * Yan yollar: error (WebGL/motor), nowebgl, starting (yeni dereceli kule),
 * start-failed.
 *
 * Motor ömrü `session` nesnesine bağlı: canlı (live) oturum için effect
 * motoru kurar, oturum değişince ya da sayfa kapanınca destroy() çağrılır.
 * Geri çağrılar ref'ler üzerinden çalışır; React yeniden çizince motor
 * yeniden kurulmaz. StrictMode'un çift bağlaması async yüklemede iptal
 * bayrağıyla, terk kararı da bir sonraki tura bırakılarak korunur.
 *
 * Gömülü mod için:
 *  - api: towerApi ile aynı biçimde istemci ({ start, answer, finish, abandon });
 *    verilmezse sitenin towerApi'si (localStorage token'ı) kullanılır.
 *  - onSettings({ muted, music }): verilirse ses tercihleri buraya bildirilir
 *    (localStorage'a yazılmaz); initialMuted / initialMusic başlangıç değerleri.
 *  - actions.getPhase / isPausedNow: native geri tuşu kararı için anlık durum.
 *
 * Güvenlik: skor istemciden alınmaz; sunucu girdi kaydını yeniden oynatır.
 * Soru cevabı motor sim'inde kayda girer (A/B), aynı anda sunucuya kilitlenir;
 * doğruluk yalnızca sunucunun yanıtıyla bilinir.
 */

export const PLAYING = ['countdown', 'running'];
// Kule başladıktan sonra ipucunun en fazla kalma süresi (ms); ilk yerleşimle kalkar.
const HINT_MS = 15000;
// Erken/geç uyarısı ekranda bu kadar kalır (ms).
const NUDGE_MS = 1800;
// "Hazırlanıyor / doğrulanıyor" ekranında çıkış bu kadar bekleyince belirir.
const SLOW_EXIT_MS = 5000;
// Cevap sonucu ekranda bu kadar kalır (oyun bu sırada sürüyor).
const ANSWER_CLEAR_MS = 1700;
// İki titreşim arası en az (ms): seri mükemmelde motor arka arkaya ister.
const HAPTIC_GAP_MS = 70;

/*
 * Lobiden gelen geçiş durumu: `{ mode: 'ranked', run }` | `{ mode: 'practice' }`.
 * Sayfa yenilenince aynı kule baştan oynanmasın diye sayfa bunu "tüketildi"
 * olarak işaretler (consumed).
 */
export function readTowerEntry(state) {
    if (!state || typeof state !== 'object' || state.consumed) return null;
    if (state.mode === 'ranked') {
        const run = normalizeTowerRun(state.run);
        return run && run.simVersion === TOWER_SIM_VERSION ? { mode: 'ranked', run } : null;
    }
    if (state.mode === 'practice') return { mode: 'practice' };
    return null;
}

function makeSession(entry, key) {
    if (entry.mode === 'ranked') {
        return { key, mode: 'ranked', run: entry.run, seed: entry.run.seed, questions: entry.run.questions, live: true };
    }
    // Antrenman: sunucu yok, soru katı yok; tohum yalnızca renk paleti için.
    return { key, mode: 'practice', run: null, seed: randomSeed(), questions: [], live: true };
}

const safe = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

function defaultHaptic(style) {
    const p = HAPTIC_PATTERNS[style];
    if (p != null) vibrate(p);
}

export default function useTowerSession({
    entry,
    user,
    avatar,
    containerRef,
    onExit,
    onHaptic,
    onResult,
    onSettings,
    initialMuted,
    initialMusic,
    api = towerApi,
    loadEngine = loadTowerEngine,
    // Erişilebilirlik modu: soru seslendirilir, okunurken sim bekler (held).
    accessibility = false,
}) {
    const [session, setSessionState] = useState(() => makeSession(entry, 1));
    const [phase, setPhaseState] = useState('loading');
    const [paused, setPausedState] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [question, setQuestion] = useState(null);
    const [result, setResult] = useState(null);
    const [message, setMessage] = useState('');
    const [muted, setMutedState] = useState(() => (typeof initialMuted === 'boolean' ? initialMuted : loadMuted()));
    const [musicEnabled, setMusicState] = useState(() => (typeof initialMusic === 'boolean' ? initialMusic : loadMusicEnabled()));
    const [busy, setBusy] = useState(false);
    const [announce, setAnnounce] = useState('');
    const [held, setHeld] = useState(false);
    const [hudStore] = useState(() => createHudStore());
    const [reducedMotion] = useState(prefersReducedMotion);
    const [touch] = useState(isCoarsePointer);
    const [showHint, setShowHint] = useState(false);
    const [placeFx, setPlaceFx] = useState(null);
    const [nudge, setNudge] = useState(null);
    const [ctxLost, setCtxLost] = useState(false);
    const [slowFor, setSlowFor] = useState(null);

    const gameRef = useRef(null);
    const sessionRef = useRef(session);
    const phaseRef = useRef('loading');
    const pausedRef = useRef(false);
    const accessibilityRef = useRef(Boolean(accessibility));
    const speakerRef = useRef(null);
    useEffect(() => {
        accessibilityRef.current = Boolean(accessibility);
        speakerRef.current?.cancel();
        speakerRef.current = accessibility ? createSpeaker() : null;
        return () => {
            speakerRef.current?.cancel();
            speakerRef.current = null;
        };
    }, [accessibility]);

    /** Ekran okuyucu metni; erişilebilirlik modunda sesli de okunur. */
    const say = useCallback((text, opts) => {
        setAnnounce(text);
        if (speakerRef.current) speakerRef.current.speak(text, opts);
        else opts?.onEnd?.();
    }, []);

    const releaseHold = useCallback(() => {
        safe(() => gameRef.current?.release());
        setHeld(false);
    }, []);
    const mutedRef = useRef(muted);
    const musicRef = useRef(musicEnabled);
    const userIdRef = useRef(user?.id ?? null);
    const avatarRef = useRef(avatar);
    const genderRef = useRef(user?.gender ?? null);
    const mountedRef = useRef(false);
    // active: sunucuda açık dereceli kule var | ended: bitiş gönderiliyor | done | idle | starting | abandoned
    const runStatusRef = useRef(entry.mode === 'ranked' ? 'active' : 'idle');
    const answeredRef = useRef(new Set());
    const pendingAnswersRef = useRef(new Set());
    const answerResultsRef = useRef({});
    const payloadRef = useRef(null);
    const timersRef = useRef(new Set());
    const startingRef = useRef(false);
    const snapshotRef = useRef(null);
    const explicitExitRef = useRef(false);
    const hintSessionRef = useRef(null);
    const learnedSessionRef = useRef(null);
    const nudgeIdRef = useRef(0);
    const fxIdRef = useRef(0);
    const lastHapticRef = useRef(0);
    const onExitRef = useRef(onExit);
    const onHapticRef = useRef(onHaptic);
    const onResultRef = useRef(onResult);
    const onSettingsRef = useRef(onSettings);
    // İstemci oturum boyunca sabit kabul edilir (ref: geri çağrılar yeniden kurulmasın).
    const apiRef = useRef(api);

    useEffect(() => {
        userIdRef.current = user?.id ?? null;
        genderRef.current = user?.gender ?? null;
    }, [user?.id, user?.gender]);

    useEffect(() => {
        onExitRef.current = onExit;
        onHapticRef.current = onHaptic;
        onResultRef.current = onResult;
        onSettingsRef.current = onSettings;
        apiRef.current = api;
    }, [onExit, onHaptic, onResult, onSettings, api]);

    // Karakter değişti (gömülü modda native'den): motoru yeniden kurmadan güncelle.
    useEffect(() => {
        avatarRef.current = avatar;
        safe(() => gameRef.current?.setAvatar?.(avatar));
    }, [avatar]);

    const changePhase = useCallback((next) => {
        phaseRef.current = next;
        setPhaseState(next);
        setSlowFor(null);
    }, []);

    const setPaused = useCallback((v) => {
        pausedRef.current = v;
        setPausedState(v);
    }, []);

    const applySession = useCallback((next) => {
        sessionRef.current = next;
        setSessionState(next);
    }, []);

    const later = useCallback((fn, ms) => {
        const id = setTimeout(() => {
            timersRef.current.delete(id);
            fn();
        }, ms);
        timersRef.current.add(id);
    }, []);

    const focusStage = useCallback(() => {
        containerRef?.current?.focus({ preventScroll: true });
    }, [containerRef]);

    // Gövde kaydırma kilidi + çekip yenileme / sıçrama kapalı. Çıkışta geri alınır.
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const prev = { bo: body.style.overflow, bob: body.style.overscrollBehavior, ho: html.style.overflow, hob: html.style.overscrollBehavior };
        body.style.overflow = 'hidden';
        html.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';
        html.style.overscrollBehavior = 'none';
        return () => {
            body.style.overflow = prev.bo;
            body.style.overscrollBehavior = prev.bob;
            html.style.overflow = prev.ho;
            html.style.overscrollBehavior = prev.hob;
        };
    }, []);

    /*
     * Açık dereceli kulenin motordan anlık görüntüsü (oyunu bitirmeden): sim
     * CPU'da, girdi kaydı o ana kadar geçerli bir bitiş yükü.
     */
    const takeSnapshot = useCallback(() => {
        const s = sessionRef.current;
        if (s?.mode !== 'ranked' || !s.run || runStatusRef.current !== 'active') return null;
        const g = gameRef.current;
        if (!g || typeof g.snapshot !== 'function') return null;
        const snap = safe(() => g.snapshot());
        if (!snap || typeof snap !== 'object') return null;
        const out = {
            runId: s.run.id,
            endTick: clampInt(snap.endTick, 0, MAX_END_TICK, 0),
            inputs: typeof snap.inputs === 'string' ? snap.inputs : '',
            localScore: clampInt(snap.localScore, 0, Number.MAX_SAFE_INTEGER, 0),
        };
        snapshotRef.current = out;
        return out;
    }, []);

    const saveSnapshot = useCallback(
        (snap) => savePending({ userId: userIdRef.current, runId: snap.runId, endTick: snap.endTick, inputs: snap.inputs, clientScore: snap.localScore }),
        []
    );

    /*
     * Ekrandan çıkış. Kullanıcı bilerek çıktıysa ("Çık", "Vazgeç") açık kule
     * sessizce terk edilir. Bilmeden çıktıysa (geri hareketi, başka bağlantı)
     * ve oyun başlamışsa o ana kadarki girdiyle bitirilip kaydedilir: oyuncu
     * onaysız puan kaybetmesin. StrictMode'un deneme amaçlı söküp yeniden
     * bağlaması kuleyi terk etmesin diye karar bir sonraki tura bırakılır.
     */
    useEffect(() => {
        mountedRef.current = true;
        const timers = timersRef.current;
        return () => {
            mountedRef.current = false;
            timers.forEach((id) => clearTimeout(id));
            timers.clear();
            const s0 = sessionRef.current;
            if (explicitExitRef.current) {
                if (s0?.mode === 'ranked' && s0.run && runStatusRef.current === 'active') clearPending(s0.run.id);
            } else {
                const snap = takeSnapshot();
                if (snap && snap.endTick > 0) saveSnapshot(snap);
            }
            setTimeout(() => {
                if (mountedRef.current) return;
                const s = sessionRef.current;
                if (s?.mode !== 'ranked' || !s.run || runStatusRef.current !== 'active') return;
                const runId = s.run.id;
                const snap = !explicitExitRef.current && snapshotRef.current?.runId === runId ? snapshotRef.current : null;
                if (snap && snap.endTick > 0) {
                    runStatusRef.current = 'ended';
                    saveSnapshot(snap);
                    const payload = { end_tick: snap.endTick, inputs: snap.inputs, client_score: Math.min(snap.localScore, 2000000000) };
                    finishTowerOnce(runId, payload, apiRef.current).then(
                        () => clearPending(runId),
                        (err) => {
                            const kind = classifyFinishError(err);
                            if (kind === 'rejected' || kind === 'gone') clearPending(runId);
                        }
                    );
                    return;
                }
                runStatusRef.current = 'abandoned';
                clearPending(runId);
                apiRef.current.abandon(runId).catch(() => {});
            }, 0);
        };
    }, [takeSnapshot, saveSnapshot]);

    /*
     * Sekme gizlenince / sayfa kapanırken açık kulenin o anki girdileri
     * bekleyen kayıt olarak saklanır (bitirilmez: sayfa geri dönebilir).
     */
    useEffect(() => {
        const persist = () => {
            if (explicitExitRef.current) return;
            const snap = takeSnapshot();
            if (snap && snap.endTick > 0) saveSnapshot(snap);
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') persist();
        };
        window.addEventListener('pagehide', persist);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('pagehide', persist);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [takeSnapshot, saveSnapshot]);

    // ---- Motor geri çağrıları (yalnızca ref ve setter kullanır) ----

    const handleHud = useCallback(
        (h) => {
            if (sessionRef.current?.live) hudStore.set(sanitizeHud(h));
        },
        [hudStore]
    );

    const handleHaptic = useCallback((style) => {
        const now = Date.now();
        if (style !== 'heavy' && now - lastHapticRef.current < HAPTIC_GAP_MS) return;
        lastHapticRef.current = now;
        const fn = onHapticRef.current;
        safe(() => (typeof fn === 'function' ? fn(style) : defaultHaptic(style)));
    }, []);

    const handleCountdown = useCallback(
        (n) => {
            const s = sessionRef.current;
            if (!s?.live) return;
            const v = clampInt(n, 0, 9, 0);
            setCountdown(v);
            const first = phaseRef.current === 'loading' || phaseRef.current === 'countdown';
            if (first && hintSessionRef.current !== s.key) {
                hintSessionRef.current = s.key;
                if (shouldShowTapHint()) setShowHint(true);
            }
            if (v === 0) {
                if (first) {
                    changePhase('running');
                    later(() => setShowHint(false), HINT_MS);
                }
                later(() => setCountdown((c) => (c === 0 ? null : c)), 800);
                if (!pausedRef.current) focusStage();
            } else if (phaseRef.current === 'loading') {
                changePhase('countdown');
            }
        },
        [changePhase, later, focusStage]
    );

    const handlePlace = useCallback((info) => {
        const s = sessionRef.current;
        if (!s?.live) return;
        setShowHint(false);
        setNudge(null);
        if (Number(info?.floor) >= HINT_LEARN_FLOOR && learnedSessionRef.current !== s.key) {
            learnedSessionRef.current = s.key;
            markTapHintLearned();
        }
        if (info?.perfect) {
            fxIdRef.current += 1;
            setPlaceFx({ id: fxIdRef.current, combo: clampInt(info.combo, 0, 1_000_000, 1), grew: Boolean(info.grew) });
        }
    }, []);

    // İlk katlarda erken/geç dokunuş: motor katı bırakmadı, oyuncuya nedenini söyle.
    const handleNudge = useCallback(
        (info) => {
            if (!sessionRef.current?.live) return;
            const kind = info?.kind === 'late' ? 'late' : 'early';
            nudgeIdRef.current += 1;
            const id = nudgeIdRef.current;
            setNudge({ id, kind });
            say(kind === 'late' ? 'Geç kaldın. Kat geri dönüyor, kulenin üstüne gelince bas.' : 'Erken. Kat kulenin üstüne gelince bas.');
            later(() => setNudge((n) => (n && n.id === id ? null : n)), NUDGE_MS);
        },
        [later, say]
    );

    const patchQuestion = useCallback((sessionKey, index, patch) => {
        setQuestion((q) => (q && q.sessionKey === sessionKey && q.index === index ? { ...q, ...patch } : q));
    }, []);

    const clearQuestionLater = useCallback(
        (sessionKey, index, ms = ANSWER_CLEAR_MS) => {
            later(() => setQuestion((q) => (q && q.sessionKey === sessionKey && q.index === index ? null : q)), ms);
        },
        [later]
    );

    const handleQuestion = useCallback((info) => {
        const s = sessionRef.current;
        if (!s?.live || s.mode !== 'ranked') return;
        const index = info?.index;
        const item = Number.isInteger(index) ? s.questions[index] : null;
        if (!item) return;
        setQuestion({
            sessionKey: s.key,
            index,
            question: item.question,
            status: 'asking',
            seconds: Math.min(30, Math.max(1, Number(info?.seconds) || 8)),
            choice: null,
            correctChoice: null,
            reason: null,
        });
        const o = item.question.options;
        const text = `Soru ${index + 1}: ${item.question.text} A: ${o[0]}. B: ${o[1]}.`;
        if (accessibilityRef.current && safe(() => gameRef.current?.hold()) === true) {
            // Soru okunurken sim bekler: 8 saniyelik süre okuma bittikten sonra başlar.
            setHeld(true);
            say(text, { onEnd: () => { if (sessionRef.current === s) releaseHold(); else safe(() => gameRef.current?.release()); } });
        } else {
            say(text);
        }
    }, [say, releaseHold]);

    /*
     * Motor cevabı kayda aldı (A/B ya da süre doldu: -1). Seçilen şık sunucuya
     * kilitlenir; doğru şık yalnızca yanıtta gelir. Yeniden deneme yalnızca
     * ağ / 5xx / 429'da; 409/422 tekrar denenmez (sonuç "?" kalır, bitişte
     * sunucu replay'deki cevapla değerlendirir).
     */
    const handleAnswer = useCallback(
        (info) => {
            const s = sessionRef.current;
            if (!s?.live || s.mode !== 'ranked' || !s.run) return;
            const index = info?.index;
            if (!Number.isInteger(index) || !s.questions[index]) return;
            const key = `${s.key}:${index}`;
            if (answeredRef.current.has(key)) return;
            answeredRef.current.add(key);
            const choice = info?.choice === 0 || info?.choice === 1 ? info.choice : -1;
            releaseHold();
            if (choice < 0) {
                patchQuestion(s.key, index, { status: 'timeout', choice: null });
                say('Süre doldu.');
                clearQuestionLater(s.key, index);
                return;
            }
            patchQuestion(s.key, index, { status: 'sending', choice });
            const stale = () => sessionRef.current !== s;
            const p = withRetry(() => apiRef.current.answer(s.run.id, { q: index, choice }), TOWER_RETRY.answer, stale)
                .then(
                    (data) => {
                        const r = parseAnswerResult(data);
                        if (stale()) return;
                        answerResultsRef.current[index] = r.correct;
                        safe(() => gameRef.current?.setAnswerResult(index, r.correct, r.correctChoice));
                        patchQuestion(s.key, index, { status: r.correct ? 'correct' : 'wrong', correctChoice: r.correctChoice });
                        const correctText = r.correctChoice != null ? s.questions[index].question.options[r.correctChoice] : null;
                        say(r.correct ? 'Doğru!' : `Yanlış${correctText ? `. Doğru cevap: ${correctText}` : ''}.`);
                    },
                    (err) => {
                        if (stale()) return;
                        patchQuestion(s.key, index, { status: 'unknown', reason: isRetryable(err) ? 'network' : 'pending' });
                    }
                )
                .finally(() => {
                    pendingAnswersRef.current.delete(p);
                    if (!stale()) clearQuestionLater(s.key, index);
                });
            pendingAnswersRef.current.add(p);
        },
        [patchQuestion, clearQuestionLater, say, releaseHold]
    );

    const submitFinish = useCallback(async () => {
        const job = payloadRef.current;
        if (!job) return;
        changePhase('finishing');
        setMessage('');
        // Yoldaki cevaplar önce otursun (en fazla settle ms; askıda istek ekranı kilitlemesin).
        const inflight = [...pendingAnswersRef.current];
        if (inflight.length) {
            let timer;
            await Promise.race([Promise.allSettled(inflight), new Promise((r) => (timer = setTimeout(r, TOWER_RETRY.settle)))]);
            clearTimeout(timer);
        }
        try {
            const data = await finishTowerOnce(job.runId, job.payload, apiRef.current);
            clearPending(job.runId);
            runStatusRef.current = 'done';
            if (!mountedRef.current) return;
            const r = data?.result;
            if (!r || typeof r !== 'object') {
                setMessage('Sonuç okunamadı. Kulen kaydedildi; sonuçlarını lobide görebilirsin.');
                changePhase('saved');
                return;
            }
            setResult(r);
            changePhase('result');
            safe(() => onResultRef.current?.(r));
        } catch (err) {
            const kind = classifyFinishError(err);
            if (kind === 'rejected' || kind === 'gone') {
                clearPending(job.runId);
                runStatusRef.current = 'done';
            }
            if (!mountedRef.current) return;
            if (kind === 'rejected' || kind === 'gone') {
                setMessage(finishFailureText(err, kind));
                changePhase('rejected');
            } else if (kind === 'auth') {
                setMessage('Oturumun sona ermiş. Tekrar giriş yaptığında kulen lobide otomatik gönderilecek.');
                changePhase('finish-failed');
            } else {
                setMessage(gameErrorMessage(err, 'Kulen gönderilemedi.'));
                changePhase('finish-failed');
            }
        }
    }, [changePhase]);

    const handleEnd = useCallback(
        (data) => {
            const s = sessionRef.current;
            if (!s?.live) return;
            applySession({ ...s, live: false });
            setQuestion(null);
            setCountdown(null);
            setPaused(false);
            setShowHint(false);
            setNudge(null);

            const endTick = clampInt(data?.endTick, 0, MAX_END_TICK, 0);
            const inputs = typeof data?.inputs === 'string' ? data.inputs : '';
            const localScore = clampInt(data?.localScore, 0, Number.MAX_SAFE_INTEGER, 0);
            const floor = clampInt(data?.floor, 0, 1_000_000, 0);

            if (s.mode === 'practice') {
                const { best, newBest } = recordGuestRun({ score: localScore, floor });
                const r = {
                    practice: true,
                    score: localScore,
                    floors: floor,
                    perfects: clampInt(data?.perfects, 0, 1_000_000, 0),
                    max_combo: clampInt(data?.maxCombo, 0, 1_000_000, 0),
                    crashed: data?.crashed !== false,
                    new_best: newBest,
                    best_score: best.score,
                    best_floor: best.floor,
                };
                setResult(r);
                changePhase('result');
                safe(() => onResultRef.current?.(r));
                return;
            }

            runStatusRef.current = 'ended';
            // client_score yalnızca denetim için; sunucu sınırını aşmasın ki istek 422 olmasın.
            const payload = { end_tick: endTick, inputs, client_score: Math.min(localScore, 2000000000) };
            payloadRef.current = { runId: s.run.id, payload };
            savePending({ userId: userIdRef.current, runId: s.run.id, endTick, inputs, clientScore: localScore });
            submitFinish();
        },
        [applySession, setPaused, changePhase, submitFinish]
    );

    const failWith = useCallback(
        (nextPhase, text) => {
            const s = sessionRef.current;
            if (s?.live) applySession({ ...s, live: false });
            setQuestion(null);
            setCountdown(null);
            setPaused(false);
            setMessage(text);
            changePhase(nextPhase);
        },
        [applySession, setPaused, changePhase]
    );

    const handleEngineError = useCallback(() => {
        const s = sessionRef.current;
        if (!s?.live) return;
        if (!gameRef.current) return;
        // Dereceli: sim CPU'da, girdi kaydı sağlam; kuleyi bitirip kayda gönder.
        if (s.mode === 'ranked' && s.run && runStatusRef.current === 'active') {
            const ok = safe(() => {
                gameRef.current.quit();
                return true;
            });
            if (ok && !sessionRef.current?.live) {
                setCtxLost(true);
                return;
            }
        }
        failWith('error', '3D sahne beklenmedik şekilde durdu (grafik bağlamı kayboldu). Yeniden başlatabilir ya da lobiye dönebilirsin.');
    }, [failWith]);

    const handleNoWebGL = useCallback(() => {
        const s = sessionRef.current;
        if (s?.mode === 'ranked' && s.run && runStatusRef.current === 'active') {
            runStatusRef.current = 'abandoned';
            apiRef.current.abandon(s.run.id).catch(() => {});
        }
        failWith(
            'nowebgl',
            'Bu tarayıcıda 3D grafik (WebGL 2) kullanılamıyor. Donanım hızlandırmayı açıp ya da güncel bir tarayıcıyla tekrar dene. iOS kullanıyorsan iOS 15 veya üstüne güncelle.'
        );
    }, [failWith]);

    // ---- Motor yaşam döngüsü ----
    useEffect(() => {
        if (!session.live) return undefined;
        let cancelled = false;
        let game = null;
        const container = containerRef?.current;
        const guard =
            (fn) =>
            (...args) => {
                if (!cancelled) fn(...args);
            };
        const callbacks = {
            onHud: guard(handleHud),
            onPlace: guard(handlePlace),
            onNudge: guard(handleNudge),
            onQuestion: guard(handleQuestion),
            onAnswer: guard(handleAnswer),
            onCountdown: guard(handleCountdown),
            onEnd: guard(handleEnd),
            onError: guard(handleEngineError),
            onHaptic: guard(handleHaptic),
        };
        let loaded = false;
        loadEngine()
            .then(async (mod) => {
                loaded = true;
                if (cancelled) return;
                if (typeof mod.isWebGLAvailable === 'function' && !mod.isWebGLAvailable()) {
                    handleNoWebGL();
                    return;
                }
                const g = await mod.createTowerGame({
                    container,
                    questions: session.questions,
                    seed: session.seed,
                    avatar: avatarRef.current,
                    gender: genderRef.current,
                    muted: mutedRef.current,
                    music: musicRef.current,
                    reducedMotion,
                    callbacks,
                });
                if (cancelled) {
                    safe(() => g?.destroy());
                    return;
                }
                game = g;
                gameRef.current = g;
                g.start();
                if (phaseRef.current === 'loading') changePhase('countdown');
                container?.focus({ preventScroll: true });
            })
            .catch(() => {
                if (cancelled) return;
                if (loaded) {
                    handleNoWebGL();
                    return;
                }
                failWith('error', 'Oyun yüklenemedi. Bağlantını kontrol edip tekrar dene.');
            });

        return () => {
            cancelled = true;
            if (!mountedRef.current && !explicitExitRef.current) takeSnapshot();
            if (game) safe(() => game.destroy());
            if (gameRef.current === game) gameRef.current = null;
        };
    }, [
        session,
        containerRef,
        loadEngine,
        reducedMotion,
        handleHud,
        handlePlace,
        handleNudge,
        handleQuestion,
        handleAnswer,
        handleCountdown,
        handleEnd,
        handleEngineError,
        handleHaptic,
        handleNoWebGL,
        changePhase,
        failWith,
        takeSnapshot,
    ]);

    // ---- Kullanıcı eylemleri ----

    /*
     * Tüm mola yolları (Esc/P, HUD butonu, sekme değiştirme / pencere odağı
     * gidince, geri hareketi, native "pause") buradan geçer. Molada soru
     * paneli gizlenir, süre de durur (sim duruyor).
     */
    const pause = useCallback(() => {
        if (pausedRef.current || !gameRef.current || !PLAYING.includes(phaseRef.current)) return;
        safe(() => gameRef.current.pause());
        // Iska animasyonunda motor duraklamaz ve biraz sonra sonucu bildirir.
        if (safe(() => gameRef.current.isPaused()) === false) return;
        setPaused(true);
    }, [setPaused]);

    const resume = useCallback(() => {
        if (!pausedRef.current) return;
        safe(() => gameRef.current?.resume());
        setPaused(false);
        focusStage();
    }, [setPaused, focusStage]);

    const notifySettings = useCallback(() => {
        const fn = onSettingsRef.current;
        if (fn) safe(() => fn({ muted: mutedRef.current, music: musicRef.current }));
    }, []);

    /*
     * Ses / müzik değeri. notify: kullanıcı oyunda değiştirdi (tercih
     * saklanır ya da native'e bildirilir); native'den gelen değişiklik
     * (setMuted / setMusic mesajı) geri bildirilmez.
     */
    const setMutedTo = useCallback(
        (next, notify = true) => {
            const v = Boolean(next);
            mutedRef.current = v;
            setMutedState(v);
            safe(() => gameRef.current?.setMuted(v));
            if (!notify) return;
            if (onSettingsRef.current) notifySettings();
            else saveMuted(v);
        },
        [notifySettings]
    );

    const toggleMute = useCallback(
        (e) => {
            setMutedTo(!mutedRef.current);
            if (e?.detail > 0) focusStage();
        },
        [setMutedTo, focusStage]
    );

    const setMusicTo = useCallback(
        (next, notify = true) => {
            const v = Boolean(next);
            musicRef.current = v;
            setMusicState(v);
            safe(() => gameRef.current?.setMusicEnabled?.(v));
            if (!notify) return;
            if (onSettingsRef.current) notifySettings();
            else saveMusicEnabled(v);
        },
        [notifySettings]
    );

    const toggleMusic = useCallback(() => setMusicTo(!musicRef.current), [setMusicTo]);

    /** Şık butonu / tuşu: 0 | 1. Motor kabul ederse seçim panelde işaretlenir. */
    const answer = useCallback(
        (choice) => {
            const s = sessionRef.current;
            if (!s?.live || pausedRef.current || phaseRef.current !== 'running') return false;
            const ok = safe(() => gameRef.current?.answer?.(choice)) === true;
            if (ok) {
                setQuestion((q) => (q && q.sessionKey === s.key && q.status === 'asking' ? { ...q, status: 'locking', choice } : q));
                focusStage();
            }
            return ok;
        },
        [focusStage]
    );

    const resetRunUi = () => {
        setPaused(false);
        setQuestion(null);
        setCountdown(null);
        setResult(null);
        setMessage('');
        setAnnounce('');
        setShowHint(false);
        setNudge(null);
        setCtxLost(false);
        setPlaceFx(null);
        hudStore.reset();
        answeredRef.current = new Set();
        answerResultsRef.current = {};
        pendingAnswersRef.current = new Set();
        snapshotRef.current = null;
        payloadRef.current = null;
    };

    const playPractice = () => {
        const s = sessionRef.current;
        resetRunUi();
        runStatusRef.current = 'idle';
        applySession(makeSession({ mode: 'practice' }, (s?.key ?? 0) + 1));
        changePhase('loading');
    };

    const restart = async () => {
        const s = sessionRef.current;
        if (!s || busy || startingRef.current) return;
        resetRunUi();
        if (s.mode === 'practice') {
            applySession(makeSession({ mode: 'practice' }, s.key + 1));
            changePhase('loading');
            return;
        }
        // Dereceli: eski motor kapanır, sunucuda yeni kule açılır (yeni start eskisini terk eder).
        if (s.live) applySession({ ...s, live: false });
        const wasActive = runStatusRef.current === 'active';
        runStatusRef.current = 'starting';
        startingRef.current = true;
        setBusy(true);
        changePhase('starting');
        try {
            const data = await apiRef.current.start();
            const run = normalizeTowerRun(data?.run);
            if (!run || run.simVersion !== TOWER_SIM_VERSION) {
                if (data?.run?.id) apiRef.current.abandon(data.run.id).catch(() => {});
                const bad = new Error('bad-run');
                bad.badRun = true;
                throw bad;
            }
            if (!mountedRef.current) {
                apiRef.current.abandon(run.id).catch(() => {});
                return;
            }
            runStatusRef.current = 'active';
            if (wasActive) clearPending(s.run.id);
            applySession(makeSession({ mode: 'ranked', run }, s.key + 1));
            changePhase('loading');
        } catch (err) {
            if (wasActive && !err?.badRun) apiRef.current.abandon(s.run.id).catch(() => {});
            if (wasActive) clearPending(s.run.id);
            runStatusRef.current = 'idle';
            if (!mountedRef.current) return;
            setMessage(err?.badRun ? 'Oyun verisi okunamadı. Sayfayı yenileyip tekrar dene.' : gameErrorMessage(err, 'Yeni kule başlatılamadı.'));
            changePhase('start-failed');
        } finally {
            startingRef.current = false;
            if (mountedRef.current) setBusy(false);
        }
    };

    const exit = useCallback(() => {
        explicitExitRef.current = true;
        safe(() => onExitRef.current?.());
    }, []);

    const finishNow = () => {
        const g = gameRef.current;
        setPaused(false);
        // quit() motorun onEnd'ini tetikler (dereceli kule kaydedilir).
        const ok = g
            ? safe(() => {
                  g.quit();
                  return true;
              })
            : false;
        if (!ok) exit();
    };

    const getPhase = useCallback(() => phaseRef.current, []);
    const isPausedNow = useCallback(() => pausedRef.current, []);

    // "Hazırlanıyor / doğrulanıyor" uzarsa çıkış düğmesi (askıda istek ekranı kilitlemesin).
    useEffect(() => {
        if (phase !== 'starting' && phase !== 'finishing') return undefined;
        const t = setTimeout(() => setSlowFor(phase), SLOW_EXIT_MS);
        return () => clearTimeout(t);
    }, [phase]);

    // Klavye: Esc / P duraklat-devam.
    useEffect(() => {
        const onKey = (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
            if (pausedRef.current) {
                e.preventDefault();
                resume();
            } else if (PLAYING.includes(phaseRef.current)) {
                e.preventDefault();
                pause();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [pause, resume]);

    // Sekme gizlenince / pencere odağı gidince motor kendini durduruyor; menü de açılsın.
    useEffect(() => {
        const onVisibility = () => {
            if (document.hidden) pause();
        };
        window.addEventListener('blur', pause);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('blur', pause);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [pause]);

    return {
        session,
        ranked: session.mode === 'ranked',
        phase,
        playing: PLAYING.includes(phase),
        paused,
        countdown,
        question,
        result,
        message,
        muted,
        musicEnabled,
        busy,
        announce,
        held,
        accessibility: Boolean(accessibility),
        hudStore,
        touch,
        showHint,
        nudge,
        placeFx,
        ctxLost,
        slowExit: slowFor === phase,
        questionTotal: session.questions.length,
        actions: {
            pause,
            resume,
            toggleMute,
            setMuted: setMutedTo,
            toggleMusic,
            setMusic: setMusicTo,
            answer,
            restart,
            playPractice,
            finishNow,
            exit,
            submitFinish,
            getPhase,
            isPausedNow,
        },
    };
}
