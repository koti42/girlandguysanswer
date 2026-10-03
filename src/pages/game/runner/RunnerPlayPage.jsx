import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LuCircleCheck, LuCloudOff, LuHouse, LuMonitorX, LuPlay, LuRotateCcw, LuShieldAlert, LuTriangleAlert } from 'react-icons/lu';
import { useAuth } from '../../../context/AuthContext';
import { useGameTitle } from '../../../components/game/useNow';
import { prefersReducedMotion, vibrate } from '../../../components/game/gameUtils';
import RunnerHud from '../../../components/game/runner/RunnerHud';
import QuestionPanel from '../../../components/game/runner/QuestionPanel';
import PauseMenu from '../../../components/game/runner/PauseMenu';
import RunnerCountdown from '../../../components/game/runner/RunnerCountdown';
import RunnerResult from '../../../components/game/runner/RunnerResult';
import RunnerControlsHint from '../../../components/game/runner/RunnerControlsHint';
import ErrorBoundary from '../../../components/game/ErrorBoundary';
import useViewportFitCover from '../../../components/game/runner/useViewportFitCover';
import { createHudStore, sanitizeHud } from '../../../components/game/runner/hudStore';
import {
    RUNNER_RETRY,
    RUNNER_SIM_VERSION,
    SAFE_AREA_PAD,
    clampInt,
    classifyFinishError,
    clearPending,
    finishFailureText,
    finishRunOnce,
    gateFailureReason,
    isCoarsePointer,
    loadCharacter,
    loadMusicEnabled,
    loadMuted,
    markControlsHintShown,
    multiplierFrom,
    normalizeRun,
    randomSeed,
    recordGuestRun,
    saveMusicEnabled,
    saveMuted,
    savePending,
    shouldShowControlsHint,
    withRetry,
} from '../../../components/game/runner/runnerUtils';
import { gameApi, gameErrorMessage } from '../../../services/gameApi';
import { loadRunnerEngine } from './engineLoader';
import '../../../components/game/game.css';

const LOBBY = '/oyun/kosu';
const MAX_END_TICK = 108000;
const PLAYING = ['countdown', 'running'];
// Koşu başladıktan sonra kontrol ipucunun ekranda kalma süresi (ms).
const HINT_MS = 5000;
// "Hazırlanıyor / doğrulanıyor" ekranında "Lobiye dön" bu kadar beklenince çıkar (yanlışlıkla dokunulmasın).
const SLOW_EXIT_MS = 5000;
// Kapı sonucu panelde bu kadar kalır: yüksek hızda bile ilk engel görünür alana girmeden kalksın.
const GATE_CLEAR_MS = 1500;
// Tarayıcı geri hareketine karşı geçmişe eklenen koruma kaydı.
const GUARD_STATE = 'runnerGuard';

const pushGuard = () => {
    // idx / key alanları korunur: React Router'ın geçmiş sırası bozulmasın.
    window.history.pushState({ ...(window.history.state || {}), [GUARD_STATE]: true }, '');
};

/*
 * Lobiden gelen geçiş durumu. Yalnızca ilk girişte okunur; sayfa yenilenince
 * (tarayıcı history.state'i korur) koşu baştan oynanmasın diye giriş anında
 * "tüketildi" olarak işaretlenir ve lobiye dönülür.
 */
function readEntry(state) {
    if (!state || typeof state !== 'object' || state.consumed) return null;
    if (state.mode === 'ranked') {
        const run = normalizeRun(state.run);
        return run && run.simVersion === RUNNER_SIM_VERSION ? { mode: 'ranked', run } : null;
    }
    if (state.mode === 'practice') return { mode: 'practice' };
    return null;
}

function makeSession(entry, key) {
    if (entry.mode === 'ranked') {
        return { key, mode: 'ranked', run: entry.run, seed: entry.run.seed, gates: entry.run.gates, live: true };
    }
    // Antrenman: sunucu yok, tohum tarayıcıda, kapı yok.
    return { key, mode: 'practice', run: null, seed: randomSeed(), gates: [], live: true };
}

const safe = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

const Spinner = ({ label }) => (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-coral border-t-transparent" />
        <span className="text-sm font-semibold text-white/80">{label}…</span>
    </div>
);

/*
 * Tam ekran durum paneli. Açılınca odak ilk etkin butona taşınır: klavyeyle
 * oynayan kullanıcı Tab'a basmadan Enter ile devam edebilsin, ekran okuyucu
 * da kalkan butonun yerine panele odaklansın.
 */
const Panel = ({ icon: Icon, tone = 'rose', title, children, actions }) => {
    const actionsRef = useRef(null);
    useEffect(() => {
        actionsRef.current?.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    }, []);
    return (
        <div className={`absolute inset-0 z-50 flex overflow-y-auto overscroll-contain bg-slate-950/75 backdrop-blur-sm ${SAFE_AREA_PAD}`}>
            <div role="alert" className="game-hero m-auto w-full max-w-md rounded-3xl p-6 text-center shadow-2xl ring-1 ring-white/15 game-pop-in">
                {Icon && (
                    <div
                        className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                            tone === 'amber'
                                ? 'bg-amber-400/20 text-amber-200'
                                : tone === 'emerald'
                                  ? 'bg-emerald-400/20 text-emerald-200'
                                  : 'bg-rose-500/20 text-rose-200'
                        }`}
                    >
                        <Icon aria-hidden="true" />
                    </div>
                )}
                <h2 className="text-xl font-black text-white">{title}</h2>
                {children && <div className="mt-2 text-sm text-white/75 break-words">{children}</div>}
                {actions && (
                    <div ref={actionsRef} className="mt-5 flex flex-col gap-2.5">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};

const primaryBtn =
    'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 font-bold text-white game-press game-glow-coral disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
const secondaryBtn =
    'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 font-bold text-white ring-1 ring-white/15 game-press disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

/*
 * Oyun ekranı.
 *
 * Aşamalar: loading -> countdown -> running (-> paused) -> finishing ->
 * result | saved (kaydedildi ama yanıt okunamadı) | finish-failed | rejected. Yan yollar: error (WebGL/motor),
 * starting (yeni dereceli koşu açılıyor), start-failed.
 *
 * Motor ömrü `session` nesnesine bağlı: canlı (live) oturum için effect motoru
 * kurar, oturum değişince ya da sayfa kapanınca destroy() çağrılır. Motor
 * geri çağrıları ref'ler üzerinden çalışır; böylece React yeniden çizince
 * motor yeniden kurulmaz. StrictMode'da effect iki kez bağlansa da async
 * yükleme iptal bayrağıyla korunur, ikinci motor oluşmaz.
 */
const RunnerGame = ({ entry }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    useGameTitle('Herkesler Koşuyor');
    useViewportFitCover();

    const [session, setSessionState] = useState(() => makeSession(entry, 1));
    const [phase, setPhaseState] = useState('loading');
    const [paused, setPausedState] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [gate, setGate] = useState(null);
    const [result, setResult] = useState(null);
    const [explanations, setExplanations] = useState({});
    const [message, setMessage] = useState('');
    const [muted, setMuted] = useState(loadMuted);
    const [musicEnabled, setMusicEnabled] = useState(loadMusicEnabled);
    const [busy, setBusy] = useState(false);
    const [announce, setAnnounce] = useState('');
    const [hudStore] = useState(() => createHudStore());
    const [character] = useState(() => loadCharacter(user?.gender));
    const [reducedMotion] = useState(prefersReducedMotion);
    const [touch] = useState(isCoarsePointer);
    const [showHint, setShowHint] = useState(false);
    // Grafik bağlamı kaybolup dereceli koşu kaydedilmeye gönderildi (kısa not için).
    const [ctxLost, setCtxLost] = useState(false);
    // "Hazırlanıyor / doğrulanıyor" ekranı uzun sürünce çıkış düğmesi gösterilir.
    const [slowFor, setSlowFor] = useState(null);

    const containerRef = useRef(null);
    const gameRef = useRef(null);
    const sessionRef = useRef(session);
    const phaseRef = useRef('loading');
    const pausedRef = useRef(false);
    const mutedRef = useRef(muted);
    const musicRef = useRef(musicEnabled);
    const userIdRef = useRef(user?.id ?? null);
    const mountedRef = useRef(false);
    // active: sunucuda açık dereceli koşu var | ended: bitiş gönderiliyor/bekliyor | done | idle
    const runStatusRef = useRef(entry.mode === 'ranked' ? 'active' : 'idle');
    const gateResultsRef = useRef({});
    const explanationsRef = useRef({});
    const crossedRef = useRef(new Set());
    const pendingGatesRef = useRef(new Set());
    const payloadRef = useRef(null);
    const timersRef = useRef(new Set());
    // Çift tıklama / Enter tekrarında ikinci bir start isteği gitmesin (state henüz güncellenmemiş olabilir).
    const startingRef = useRef(false);
    // Motorun son okunan anlık görüntüsü (sayfa kapanırken / gizlenirken kayıt için).
    const snapshotRef = useRef(null);
    // Kullanıcı bilerek çıktı ("Çık", "Vazgeç", "Lobiye dön"): koşu kaydedilmez, terk edilir.
    const explicitExitRef = useRef(false);
    // Geçmişte en üstte geri hareketi koruma kaydımız var mı?
    const guardRef = useRef(false);
    // Kontrol ipucu hangi oturum için sayıldı (devam geri sayımı yeniden saymasın).
    const hintSessionRef = useRef(null);

    useEffect(() => {
        userIdRef.current = user?.id ?? null;
    }, [user?.id]);

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
        containerRef.current?.focus({ preventScroll: true });
    }, []);

    // Geçiş durumunu tüket: yenilemede aynı koşu baştan oynanmasın.
    useEffect(() => {
        if (location.state && !location.state.consumed) {
            navigate(location.pathname, { replace: true, state: { consumed: true } });
        }
    }, [location.pathname, location.state, navigate]);

    // Gövde kaydırma kilidi + çekip yenileme / sıçrama kapalı. Çıkışta geri alınır.
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const prev = {
            bo: body.style.overflow,
            bob: body.style.overscrollBehavior,
            ho: html.style.overflow,
            hob: html.style.overscrollBehavior,
        };
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
     * Açık dereceli koşunun motordan anlık görüntüsü (oyunu bitirmeden):
     * sim CPU'da, girdi kaydı o ana kadar geçerli bir bitiş yükü. Motor
     * snapshot() sunmuyorsa ya da koşu açık değilse null.
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
     * Sayfadan çıkış. Kullanıcı bilerek çıktıysa ("Çık", "Vazgeç") açık
     * dereceli koşu sessizce terk edilir. Bilmeden çıktıysa (tarayıcı geri
     * hareketi, başka bir bağlantı) ve koşu başlamışsa o ana kadarki girdiyle
     * bitirilip kaydedilir: oyuncu onaysız puan kaybetmesin. Lobinin bekleyen
     * kaydı gönderen effect'i bu karardan önce çalışmış olur; bu yüzden bitiş
     * burada doğrudan gönderilir (finishRunOnce lobiyle çakışmayı önler).
     * Oyun bittiyse ve bitiş bekleniyorsa (ended) dokunulmaz. StrictMode'un
     * deneme amaçlı söküp yeniden bağlaması koşuyu terk etmesin diye karar
     * bir sonraki tura bırakılıyor.
     */
    useEffect(() => {
        mountedRef.current = true;
        const timers = timersRef.current;
        return () => {
            mountedRef.current = false;
            timers.forEach((id) => clearTimeout(id));
            timers.clear();
            /*
             * Motor (sonraki effect'in temizliğinde) kapanmadan önce son durumu al.
             * Bekleyen kayıt burada, eşzamanlı güncellenir: aynı commit'te bağlanan
             * lobi aşağıdaki setTimeout'tan önce kaydı okuyup gönderiyor. Sekme
             * gizlenirken saklanan eski ara kayıt orada okunursa koşu eski
             * girdilerle biterdi (ikinci finish sunucuda kayıtlı sonucu döner);
             * "Çık"ta ise kaydedilmemesi gereken koşu bitirilirdi.
             */
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
                    finishRunOnce(runId, payload).then(
                        () => clearPending(runId),
                        (err) => {
                            const kind = classifyFinishError(err);
                            // Ağ / oturum sorununda kayıt kalır; lobi 2 saat içinde gönderir.
                            if (kind === 'rejected' || kind === 'gone') clearPending(runId);
                        }
                    );
                    return;
                }
                runStatusRef.current = 'abandoned';
                // Gizlenirken saklanan ara kayıt, terk edilen koşuyu lobide bitirmesin.
                clearPending(runId);
                gameApi.abandonRunner(runId).catch(() => {});
            }, 0);
        };
    }, [takeSnapshot, saveSnapshot]);

    /*
     * Sekme gizlenince / sayfa kapanırken (yenileme, uygulama değiştirme)
     * açık dereceli koşunun o anki girdileri bekleyen kayıt olarak saklanır.
     * Koşu bitirilmez: sayfa bfcache'ten dönüp oyun sürebilir; o zaman
     * sonraki bitiş aynı koşunun kaydını ezer. Dönülmezse lobi 2 saat içinde
     * gönderir.
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

    // ---- Motor geri çağrıları (yalnızca ref ve setter kullanır: kimlikleri sabit) ----

    // Kapanmakta olan motorun son HUD'u yeni koşunun sıfırlanmış HUD'unu ezmesin.
    const handleHud = useCallback(
        (h) => {
            if (sessionRef.current?.live) hudStore.set(sanitizeHud(h));
        },
        [hudStore]
    );

    const handleCountdown = useCallback(
        (n) => {
            const s = sessionRef.current;
            if (!s?.live) return;
            const v = clampInt(n, 0, 9, 0);
            setCountdown(v);
            const first = phaseRef.current === 'loading' || phaseRef.current === 'countdown';
            // İlk geri sayım (devam sayacı değil): ilk birkaç koşuda kontrol ipucu.
            if (first && hintSessionRef.current !== s.key) {
                hintSessionRef.current = s.key;
                if (shouldShowControlsHint()) {
                    markControlsHintShown();
                    setShowHint(true);
                }
            }
            if (v === 0) {
                if (first) {
                    changePhase('running');
                    later(() => setShowHint(false), HINT_MS);
                }
                later(() => setCountdown((c) => (c === 0 ? null : c)), 800);
                // Mola menüsü açıksa odağı ondan çalma.
                if (!pausedRef.current) focusStage();
            } else if (phaseRef.current === 'loading') {
                changePhase('countdown');
            }
        },
        [changePhase, later, focusStage]
    );

    const patchGate = useCallback((sessionKey, index, patch) => {
        setGate((g) => (g && g.sessionKey === sessionKey && g.index === index ? { ...g, ...patch } : g));
    }, []);

    const handleGateApproach = useCallback((info) => {
        const s = sessionRef.current;
        if (!s?.live || s.mode !== 'ranked') return;
        const index = info?.index;
        const g = Number.isInteger(index) ? s.gates[index] : null;
        if (!g) return;
        setGate({
            sessionKey: s.key,
            index,
            question: g.question,
            status: 'asking',
            // Motor 0.1 sn hassasiyetle gönderiyor: yuvarlamak çubuğu kapıdan kaydırırdı.
            seconds: Math.min(20, Math.max(0, Number(info?.seconds) || 0)),
            chosenLane: null,
            correctLane: null,
            multiplier: null,
        });
        const o = g.question.options;
        setAnnounce(`Kapı ${index + 1}: ${g.question.text} Sol: ${o[0]}. Orta: ${o[1]}. Sağ: ${o[2]}.`);
    }, []);

    const handleGateCross = useCallback(
        (info) => {
            const s = sessionRef.current;
            if (!s?.live || s.mode !== 'ranked' || !s.run) return;
            const index = info?.index;
            const g = Number.isInteger(index) ? s.gates[index] : null;
            if (!g) return;
            const crossKey = `${s.key}:${index}`;
            if (crossedRef.current.has(crossKey)) return;
            crossedRef.current.add(crossKey);
            const lane = clampInt(info?.lane, 0, 2, 1);

            setGate((prev) =>
                prev && prev.sessionKey === s.key && prev.index === index
                    ? { ...prev, status: 'sending', chosenLane: lane }
                    : { sessionKey: s.key, index, question: g.question, status: 'sending', seconds: 0, chosenLane: lane, correctLane: null, multiplier: null }
            );

            /*
             * Yeniden deneme yalnızca ağ / 5xx / 429'da (withRetry). 409 ("Çok
             * erken.", sunucu tarafı tutarsızlık) ve 422 tekrar denense de aynı
             * cevabı alır: kapı "?" kalır, bitişte sunucu replay şeridiyle
             * değerlendirir. Kapılar birbirinden bağımsız; biri düşse de
             * sonrakiler normal gönderilir.
             */
            const stale = () => sessionRef.current !== s;
            /*
             * Açıklamalar bu koşunun kovasına yazılır: "Tekrar Koş" sonrası geç
             * gelen eski yanıt yeni koşunun aynı index'li kapısına yazılmasın.
             * Yazım stale() kontrolünün önünde: handleEnd oturumu live:false ile
             * yenilediği için aynı koşunun geç gelen meşru yanıtı da stale sayılır.
             */
            const bucket = explanationsRef.current;
            const p = withRetry(() => gameApi.runnerGate(s.run.id, { gate: index, lane }), RUNNER_RETRY.gate, stale)
                .then(
                    (data) => {
                        const r = data?.gate || {};
                        const correct = r.correct === true;
                        const correctLane = Number.isInteger(r.correct_lane) && r.correct_lane >= 0 && r.correct_lane <= 2 ? r.correct_lane : null;
                        if (typeof r.explanation === 'string' && r.explanation.trim()) bucket[index] = r.explanation;
                        if (stale()) return;
                        gateResultsRef.current[index] = correct;
                        safe(() => gameRef.current?.setGateResult(index, correct, correctLane));
                        const mult = multiplierFrom(gateResultsRef.current);
                        // Sonuç metni soru panelinin canlı bölgesinde duyurulur.
                        patchGate(s.key, index, { status: correct ? 'correct' : 'wrong', correctLane, multiplier: mult });
                        vibrate(correct ? 30 : [60, 40, 60]);
                    },
                    (err) => {
                        // Sonuç "?" kalır; bitişte sunucu replay şeridiyle değerlendirir.
                        if (stale()) return;
                        patchGate(s.key, index, { status: 'unknown', reason: gateFailureReason(err) });
                    }
                )
                .finally(() => {
                    pendingGatesRef.current.delete(p);
                    if (!stale()) later(() => setGate((cur) => (cur && cur.sessionKey === s.key && cur.index === index ? null : cur)), GATE_CLEAR_MS);
                });
            pendingGatesRef.current.add(p);
        },
        [later, patchGate]
    );

    const handleCrash = useCallback(() => vibrate([90, 50, 90]), []);

    const submitFinish = useCallback(async () => {
        const job = payloadRef.current;
        if (!job) return;
        changePhase('finishing');
        setMessage('');
        /*
         * Yoldaki kapı cevapları önce otursun, ama en fazla RUNNER_RETRY.settle
         * ms: zaman aşımı olmayan, takılmış bir istek "Koşun doğrulanıyor"
         * ekranını kilitlemesin. Cevaplanmamış kapıyı sunucu replay şeridiyle
         * değerlendirir.
         */
        const inflight = [...pendingGatesRef.current];
        if (inflight.length) {
            let timer;
            await Promise.race([Promise.allSettled(inflight), new Promise((r) => (timer = setTimeout(r, RUNNER_RETRY.settle)))]);
            clearTimeout(timer);
        }
        try {
            const data = await finishRunOnce(job.runId, job.payload);
            clearPending(job.runId);
            runStatusRef.current = 'done';
            if (!mountedRef.current) return;
            const r = data?.result;
            if (!r || typeof r !== 'object') {
                // Kayıt başarılı, yalnızca yanıt bozuk: "kaydedilmedi" paneli yanlış olurdu.
                setMessage('Sonuç okunamadı. Koşun kaydedildi; sonuçlarını lobide görebilirsin.');
                changePhase('saved');
                return;
            }
            setExplanations({ ...explanationsRef.current });
            setResult(r);
            changePhase('result');
        } catch (err) {
            const kind = classifyFinishError(err);
            if (kind === 'rejected' || kind === 'gone') {
                clearPending(job.runId);
                runStatusRef.current = 'done';
            }
            if (!mountedRef.current) return;
            // 409 (koşu yarıda bırakılmış / reddedilmiş / süresi dolmuş) ve 422 yeniden denenmez.
            if (kind === 'rejected' || kind === 'gone') {
                setMessage(finishFailureText(err, kind));
                changePhase('rejected');
            } else if (kind === 'auth') {
                setMessage('Oturumun sona ermiş. Tekrar giriş yaptığında koşun lobide otomatik gönderilecek.');
                changePhase('finish-failed');
            } else {
                setMessage(gameErrorMessage(err, 'Koşun gönderilemedi.'));
                changePhase('finish-failed');
            }
        }
    }, [changePhase]);

    const handleEnd = useCallback(
        (data) => {
            const s = sessionRef.current;
            if (!s?.live) return;
            applySession({ ...s, live: false });
            setGate(null);
            setCountdown(null);
            setPaused(false);

            const endTick = clampInt(data?.endTick, 0, MAX_END_TICK, 0);
            const inputs = typeof data?.inputs === 'string' ? data.inputs : '';
            const localScore = clampInt(data?.localScore, 0, Number.MAX_SAFE_INTEGER, 0);
            const distance = clampInt(data?.distance, 0, Number.MAX_SAFE_INTEGER, 0);
            const coins = clampInt(data?.coins, 0, Number.MAX_SAFE_INTEGER, 0);

            if (s.mode === 'practice') {
                const { best, newBest } = recordGuestRun({ score: localScore, distance });
                setResult({
                    practice: true,
                    score: localScore,
                    distance_m: distance,
                    coins,
                    crashed: data?.crashed !== false,
                    new_best: newBest,
                    best_score: best.score,
                    best_distance: best.distance,
                });
                changePhase('result');
                return;
            }

            runStatusRef.current = 'ended';
            // client_score yalnızca denetim için; sunucu sınırını (2e9) aşmasın ki istek 422 olmasın.
            const payload = { end_tick: endTick, inputs, client_score: Math.min(localScore, 2000000000) };
            payloadRef.current = { runId: s.run.id, payload };
            // Sekme kapanırsa ya da ağ düşerse lobi 2 saat içinde yeniden gönderir.
            savePending({ userId: userIdRef.current, runId: s.run.id, endTick, inputs, clientScore: localScore });
            submitFinish();
        },
        [applySession, setPaused, changePhase, submitFinish]
    );

    const failWith = useCallback(
        (nextPhase, text) => {
            const s = sessionRef.current;
            if (s?.live) applySession({ ...s, live: false });
            setGate(null);
            setCountdown(null);
            setPaused(false);
            setMessage(text);
            changePhase(nextPhase);
        },
        [applySession, setPaused, changePhase]
    );

    const handleEngineError = useCallback(() => {
        const s = sessionRef.current;
        // Koşu bitip bitiş gönderilirken gelen bağlam kaybı sonucu etkilemez.
        if (!s?.live) return;
        // Motor henüz kurulmadı: kurulum hatası, motor effect'inin .catch'i (nowebgl) ele alıyor.
        if (!gameRef.current) return;
        /*
         * Dereceli koşu: sim CPU'da, grafik bağlamı gitse de girdi kaydı
         * sağlam. Koşuyu bitirip kayda gönder, düşürme.
         * quit() -> onEnd -> handleEnd: live=false, savePending, submitFinish.
         */
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
        // Oynanamayacak dereceli koşu sunucuda açık kalmasın.
        if (s?.mode === 'ranked' && s.run && runStatusRef.current === 'active') {
            runStatusRef.current = 'abandoned';
            gameApi.abandonRunner(s.run.id).catch(() => {});
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
        const container = containerRef.current;
        const guard =
            (fn) =>
            (...args) => {
                if (!cancelled) fn(...args);
            };
        const callbacks = {
            onHud: guard(handleHud),
            onGateApproach: guard(handleGateApproach),
            onGateCross: guard(handleGateCross),
            onCountdown: guard(handleCountdown),
            onCrash: guard(handleCrash),
            onEnd: guard(handleEnd),
            onError: guard(handleEngineError),
        };

        // Modül indi mi? İndiyse sonraki hata ağ değil kurulum (WebGL bağlamı, bellek) hatası.
        let loaded = false;
        loadRunnerEngine()
            .then(async (mod) => {
                loaded = true;
                if (cancelled) return;
                if (typeof mod.isWebGLAvailable === 'function' && !mod.isWebGLAvailable()) {
                    handleNoWebGL();
                    return;
                }
                const g = await mod.createRunnerGame({
                    container,
                    seed: session.seed,
                    gates: session.gates,
                    character,
                    muted: mutedRef.current,
                    musicEnabled: musicRef.current,
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
                // Modül indi ama motor kurulamadı: ağ sorunu değil, bu cihazda 3D açılamıyor.
                if (loaded) {
                    handleNoWebGL();
                    return;
                }
                failWith('error', 'Oyun yüklenemedi. Bağlantını kontrol edip tekrar dene.');
            });

        return () => {
            cancelled = true;
            // Sayfa kapanıyorsa motor kapanmadan son anlık görüntüyü al (kayıt için).
            if (!mountedRef.current && !explicitExitRef.current) takeSnapshot();
            if (game) safe(() => game.destroy());
            if (gameRef.current === game) gameRef.current = null;
        };
    }, [
        session,
        character,
        reducedMotion,
        handleHud,
        handleGateApproach,
        handleGateCross,
        handleCountdown,
        handleCrash,
        handleEnd,
        handleEngineError,
        handleNoWebGL,
        changePhase,
        failWith,
        takeSnapshot,
    ]);

    // ---- Kullanıcı eylemleri ----

    /*
     * Tüm mola yolları (Esc/P, HUD butonu, sekme değiştirme / pencere odağı
     * gidince motorun kendiliğinden durması, geri hareketi) buradan geçer.
     * Molada soru paneli gizlenir ve süre çubuğu durur; kapı cezası yok
     * (bildirimle / sekme değişimiyle duraklayan dürüst oyuncu cezalanmasın).
     */
    const pause = useCallback(() => {
        if (pausedRef.current || !gameRef.current || !PLAYING.includes(phaseRef.current)) return;
        safe(() => gameRef.current.pause());
        // Çarpma animasyonu sırasında (motor 'crashing') motor duraklamaz ve ~1 sn sonra
        // sonucu bildirir; menü açılıp hemen kapanmasın, "Yeniden başlat" biten koşuyu yutmasın.
        if (safe(() => gameRef.current.isPaused()) === false) return;
        setPaused(true);
    }, [setPaused]);

    const resume = useCallback(() => {
        if (!pausedRef.current) return;
        safe(() => gameRef.current?.resume());
        setPaused(false);
        // Odak HUD butonunda kalırsa Boşluk (zıpla) butona basardı.
        focusStage();
    }, [setPaused, focusStage]);

    const toggleMute = (e) => {
        const next = !mutedRef.current;
        mutedRef.current = next;
        setMuted(next);
        saveMuted(next);
        safe(() => gameRef.current?.setMuted(next));
        if (e?.detail > 0) focusStage();
    };

    // Yalnızca arka plan müziği (efektler sürer); mola menüsünden açılıp kapanır.
    const toggleMusic = () => {
        const next = !musicRef.current;
        musicRef.current = next;
        setMusicEnabled(next);
        saveMusicEnabled(next);
        safe(() => gameRef.current?.setMusicEnabled?.(next));
    };

    const resetRunUi = () => {
        setPaused(false);
        setGate(null);
        setCountdown(null);
        setResult(null);
        setExplanations({});
        setMessage('');
        setAnnounce('');
        setShowHint(false);
        setCtxLost(false);
        hudStore.reset();
        gateResultsRef.current = {};
        explanationsRef.current = {};
        crossedRef.current = new Set();
        // Eski koşunun askıdaki kapı istekleri yeni koşunun bitişini bekletmesin.
        pendingGatesRef.current = new Set();
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
        // Dereceli: eski motor kapanır, sunucuda yeni koşu açılır (yeni start eskisini terk eder).
        if (s.live) applySession({ ...s, live: false });
        const wasActive = runStatusRef.current === 'active';
        runStatusRef.current = 'starting';
        startingRef.current = true;
        setBusy(true);
        changePhase('starting');
        try {
            const data = await gameApi.startRunner();
            const run = normalizeRun(data?.run);
            if (!run || run.simVersion !== RUNNER_SIM_VERSION) {
                if (data?.run?.id) gameApi.abandonRunner(data.run.id).catch(() => {});
                const bad = new Error('bad-run');
                bad.badRun = true;
                throw bad;
            }
            if (!mountedRef.current) {
                gameApi.abandonRunner(run.id).catch(() => {});
                return;
            }
            runStatusRef.current = 'active';
            // Eski koşu sunucuda yeni start ile terk edildi; gizlenirken saklanan ara kaydı lobide gönderilmesin.
            if (wasActive) clearPending(s.run.id);
            applySession(makeSession({ mode: 'ranked', run }, s.key + 1));
            changePhase('loading');
        } catch (err) {
            // Yeni koşu açılamadıysa eskisi hâlâ açık: oynanamayacağı için kapat.
            if (wasActive && !err?.badRun) gameApi.abandonRunner(s.run.id).catch(() => {});
            if (wasActive) clearPending(s.run.id);
            runStatusRef.current = 'idle';
            if (!mountedRef.current) return;
            setMessage(err?.badRun ? 'Koşu verisi okunamadı. Sayfayı yenileyip tekrar dene.' : gameErrorMessage(err, 'Yeni koşu başlatılamadı.'));
            changePhase('start-failed');
        } finally {
            startingRef.current = false;
            if (mountedRef.current) setBusy(false);
        }
    };

    const finishNow = () => {
        const g = gameRef.current;
        setPaused(false);
        // quit() motorun onEnd'ini tetikler (dereceli koşu kaydedilir).
        const ok = g
            ? safe(() => {
                  g.quit();
                  return true;
              })
            : false;
        if (!ok) navigate(LOBBY, { replace: true });
    };

    // replace: geri hareketi koruma kaydı geçmişte kalmasın (lobiden geri -> boş oyun ekranı).
    const exitToLobby = () => {
        explicitExitRef.current = true;
        navigate(LOBBY, { replace: true });
    };

    /*
     * Tarayıcı geri hareketi koruması. Oyun yatay kaydırmayla oynanıyor;
     * Android hareketli gezinme ve iOS Safari kenar kaydırması Geri yapıyor
     * ve sayfa bunu engelleyemiyor. Koşu başlayınca geçmişe aynı adreste bir
     * koruma kaydı eklenir; geri hareketi önce onu tüketir: oyun duraklar,
     * koruma yeniden eklenir. Oyun dışındaki aşamalarda (sonuç, hata) geri
     * hareketi doğrudan lobiye götürür.
     */
    useEffect(() => {
        if (!PLAYING.includes(phase) || guardRef.current) return;
        if (safe(() => (pushGuard(), true))) guardRef.current = true;
    }, [phase]);

    useEffect(() => {
        const onPop = () => {
            if (!guardRef.current) return;
            // Koruma kaydı tüketildi: artık asıl oyun kaydındayız.
            guardRef.current = false;
            if (PLAYING.includes(phaseRef.current)) {
                if (safe(() => (pushGuard(), true))) guardRef.current = true;
                pause();
                return;
            }
            navigate(LOBBY, { replace: true });
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [pause, navigate]);

    // Kontrol ipucu: oyuncunun ilk hareketiyle (tuş ya da kaydırma) hemen kalkar.
    useEffect(() => {
        if (!showHint || phase !== 'running') return undefined;
        const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's', 'A', 'D', 'W', 'S']);
        const hide = () => setShowHint(false);
        const onKey = (e) => {
            if (KEYS.has(e.key)) hide();
        };
        const el = containerRef.current;
        window.addEventListener('keydown', onKey, true);
        el?.addEventListener('touchmove', hide, { passive: true });
        return () => {
            window.removeEventListener('keydown', onKey, true);
            el?.removeEventListener('touchmove', hide);
        };
    }, [showHint, phase]);

    // "Hazırlanıyor / doğrulanıyor" uzarsa çıkış düğmesi (askıda kalan istek ekranı kilitlemesin).
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

    const ranked = session.mode === 'ranked';
    const playing = PLAYING.includes(phase);
    const slowExit = slowFor === phase;

    return (
        <div className="fixed inset-0 z-[95] h-[100dvh] w-full overflow-hidden bg-gradient-to-b from-[#0b1030] via-[#25185a] to-[#43195f] text-white">
            {/*
              z-[95]: şartnamedeki z-[60] masaüstündeki mesaj kutusunun (z-[90]) altında
              kalıyordu; yaş doğrulaması ve bildirimler (z-[9999]) yine üstte.
            */}
            <div
                ref={containerRef}
                tabIndex={-1}
                role="application"
                aria-roledescription="oyun"
                aria-label="Oyun alanı. Ok tuşları ya da kaydırma ile oyna. Esc ile duraklat."
                className="runner-stage absolute inset-0 outline-none"
                onContextMenu={(e) => e.preventDefault()}
                data-testid="runner-stage"
            />

            <div className="sr-only" aria-live="polite" aria-atomic="true">
                {announce}
            </div>

            {playing && (
                <RunnerHud
                    store={hudStore}
                    muted={muted}
                    onToggleMute={toggleMute}
                    onPause={pause}
                    practice={!ranked}
                    canPause={!paused}
                />
            )}

            {/*
              frozen: mola ve devam geri sayımında sim duruyor, süre çubuğu da dursun.
              hidden: molada soru okunamasın (panel sökülmez, çubuk sıfırlanmasın).
            */}
            {playing && gate && (
                <QuestionPanel gate={gate} total={session.gates.length} frozen={paused || (countdown != null && countdown > 0)} hidden={paused} />
            )}

            {playing && <RunnerCountdown value={countdown} />}

            {playing && showHint && !paused && <RunnerControlsHint touch={touch} />}

            {phase === 'loading' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 ${SAFE_AREA_PAD}`}>
                    <Spinner label="Pist hazırlanıyor" />
                    <button type="button" onClick={exitToLobby} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/70 underline hover:text-white">
                        Vazgeç
                    </button>
                </div>
            )}

            {paused && playing && (
                <PauseMenu
                    ranked={ranked}
                    musicEnabled={musicEnabled}
                    onToggleMusic={toggleMusic}
                    onResume={resume}
                    onRestart={restart}
                    onFinish={finishNow}
                    onExit={exitToLobby}
                    busy={busy}
                />
            )}

            {phase === 'starting' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 ${SAFE_AREA_PAD}`}>
                    <Spinner label="Yeni koşu hazırlanıyor" />
                    {slowExit && (
                        <button type="button" onClick={exitToLobby} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/70 underline hover:text-white">
                            Lobiye dön
                        </button>
                    )}
                </div>
            )}

            {phase === 'finishing' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-slate-950/60 text-center backdrop-blur-sm ${SAFE_AREA_PAD}`}>
                    <Spinner label="Koşun doğrulanıyor" />
                    {ctxLost && <p className="max-w-xs text-sm text-white/75">Grafik durdu; koşun buraya kadarki haliyle kaydediliyor.</p>}
                    {slowExit && (
                        <>
                            <p className="max-w-xs text-xs text-white/60">Koşun bu cihazda saklandı; lobide otomatik gönderilecek.</p>
                            <button type="button" onClick={exitToLobby} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/70 underline hover:text-white">
                                Lobiye dön
                            </button>
                        </>
                    )}
                </div>
            )}

            {phase === 'finish-failed' && (
                <Panel
                    icon={LuCloudOff}
                    tone="amber"
                    title="Koşun gönderilemedi"
                    actions={
                        <>
                            <button type="button" onClick={submitFinish} className={primaryBtn}>
                                <LuRotateCcw aria-hidden="true" /> Tekrar dene
                            </button>
                            <button type="button" onClick={exitToLobby} className={secondaryBtn}>
                                <LuHouse aria-hidden="true" /> Lobiye dön
                            </button>
                        </>
                    }
                >
                    <p>{message}</p>
                    <p className="mt-2 text-white/60">Koşun bu cihazda saklandı; lobiyi açtığında (2 saat içinde) otomatik gönderilir.</p>
                </Panel>
            )}

            {(phase === 'rejected' || phase === 'saved') && (
                <Panel
                    icon={phase === 'saved' ? LuCircleCheck : LuShieldAlert}
                    tone={phase === 'saved' ? 'emerald' : 'rose'}
                    title={phase === 'saved' ? 'Koşun kaydedildi' : 'Koşu kaydedilmedi'}
                    actions={
                        <>
                            <button type="button" onClick={restart} disabled={busy} className={primaryBtn}>
                                <LuRotateCcw aria-hidden="true" /> Tekrar Koş
                            </button>
                            <button type="button" onClick={exitToLobby} className={secondaryBtn}>
                                <LuHouse aria-hidden="true" /> Lobiye dön
                            </button>
                        </>
                    }
                >
                    <p>{message}</p>
                    {phase === 'rejected' && <p className="mt-2 text-white/60">Bu koşu için puan ve XP eklenmedi. Yeni bir koşuya başlayabilirsin.</p>}
                </Panel>
            )}

            {(phase === 'error' || phase === 'nowebgl') && (
                <Panel
                    icon={phase === 'nowebgl' ? LuMonitorX : LuTriangleAlert}
                    title={phase === 'nowebgl' ? '3D desteklenmiyor' : 'Bir aksilik oldu'}
                    actions={
                        <>
                            {phase === 'error' && (
                                <button type="button" onClick={restart} disabled={busy} className={primaryBtn}>
                                    <LuRotateCcw aria-hidden="true" /> Yeniden başlat
                                </button>
                            )}
                            <button type="button" onClick={exitToLobby} className={phase === 'error' ? secondaryBtn : primaryBtn}>
                                <LuHouse aria-hidden="true" /> Lobiye dön
                            </button>
                        </>
                    }
                >
                    <p>{message}</p>
                </Panel>
            )}

            {phase === 'start-failed' && (
                <Panel
                    icon={LuCloudOff}
                    tone="amber"
                    title="Yeni koşu başlatılamadı"
                    actions={
                        <>
                            <button type="button" onClick={playPractice} className={primaryBtn}>
                                <LuPlay aria-hidden="true" /> Antrenman modunda oyna
                            </button>
                            <button type="button" onClick={exitToLobby} className={secondaryBtn}>
                                <LuHouse aria-hidden="true" /> Lobiye dön
                            </button>
                        </>
                    }
                >
                    <p>{message}</p>
                </Panel>
            )}

            {phase === 'result' && result && (
                <div className="absolute inset-0 z-50 overflow-y-auto overscroll-contain">
                    {ctxLost && !result.practice && (
                        <p role="status" className="mx-auto mt-[max(1rem,env(safe-area-inset-top))] w-fit max-w-[calc(100%-2rem)] rounded-full bg-amber-400/20 px-3 py-1.5 text-center text-xs font-semibold text-amber-100 ring-1 ring-amber-300/30">
                            Grafik durdu, koşun kaydedildi.
                        </p>
                    )}
                    <RunnerResult result={result} explanations={explanations} onAgain={restart} onLobby={exitToLobby} busy={busy} guest={!user} />
                </div>
            )}
        </div>
    );
};

const RunnerPlayPage = () => {
    const location = useLocation();
    // Yalnızca ilk çizimde okunur; sonradan "tüketildi" olarak işaretlenen durum bunu etkilemez.
    const [entry] = useState(() => readEntry(location.state));
    if (!entry) return <Navigate to={LOBBY} replace />;
    // Arayüzdeki beklenmedik bir çizim hatası beyaz ekran yerine lobiye dönüş sunsun.
    return (
        <ErrorBoundary homeHref={LOBBY} homeLabel="Lobiye dön">
            <RunnerGame entry={entry} />
        </ErrorBoundary>
    );
};

export default RunnerPlayPage;
