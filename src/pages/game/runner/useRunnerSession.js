import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, vibrate } from '../../../components/game/gameUtils';
import { createSpeaker } from '../../../components/game/speech';
import { createHudStore, sanitizeHud } from '../../../components/game/runner/hudStore';
import {
    RUNNER_RETRY,
    RUNNER_SIM_VERSION,
    clampInt,
    classifyFinishError,
    clearPending,
    finishFailureText,
    finishRunOnce,
    gateFailureReason,
    isCoarsePointer,
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

/*
 * Herkesler Koşuyor oturum kancası: SPA oyun sayfası (/oyun/kosu/oyna) ve
 * mobil uygulama gömmesi (embed.html?game=kosu) aynı akışı kullanır
 * (şartname v2 §D.1, E.6). Burada yalnızca oturum/akış mantığı var:
 * motorun kurulup sökülmesi, kapı istekleri, bitiş + yeniden deneme,
 * bekleyen kayıt, mola, ses tercihleri. Yönlendirme (lobi, tarayıcı geri
 * hareketi) ve çizim çağıranın işi.
 *
 * Seçenekler:
 *  - entry: { mode: 'ranked', run } | { mode: 'practice' } (run normalizeRun'dan geçmiş)
 *  - api: { startRunner, runnerGate, finishRunner, abandonRunner } — SPA'da
 *    gameApi, gömmede token'ı bellekte tutan kendi axios örneği.
 *  - userId: bekleyen kaydın sahibi
 *  - avatar: motorun karakteri (normalizeAvatar'dan geçmiş); motor kurulurken okunur
 *  - onExit(): bilerek çıkış ("Çık", "Vazgeç", "Lobiye dön"); açık dereceli koşu terk edilmiştir
 *  - onResult(result): sonuç ekranı / "kaydedildi" (result null) açıldı
 *  - onHaptic(style): verilirse motorun titreşim bildirimleri (jeton, zıplama,
 *    kapı, çarpma...) buraya gider; verilmezse yalnızca kapı sonucu ve çarpmada
 *    navigator.vibrate
 *  - onSettings({ muted, music }): verilirse ses tercihleri buraya bildirilir
 *    (localStorage'a yazılmaz); initialMuted / initialMusic başlangıç değerleri
 *
 * Aşamalar: loading -> countdown -> running (-> paused) -> finishing ->
 * result | saved (kaydedildi ama yanıt okunamadı) | finish-failed | rejected. Yan yollar: error (WebGL/motor),
 * nowebgl, starting (yeni dereceli koşu açılıyor), start-failed.
 *
 * Motor ömrü `session` nesnesine bağlı: canlı (live) oturum için effect motoru
 * kurar, oturum değişince ya da bileşen sökülünce destroy() çağrılır. Motor
 * geri çağrıları ref'ler üzerinden çalışır; böylece React yeniden çizince
 * motor yeniden kurulmaz. StrictMode'da effect iki kez bağlansa da async
 * yükleme iptal bayrağıyla korunur, ikinci motor oluşmaz.
 */

export const MAX_END_TICK = 108000;
export const PLAYING = ['countdown', 'running'];
// Koşu başladıktan sonra kontrol ipucunun ekranda kalma süresi (ms).
const HINT_MS = 5000;
// "Hazırlanıyor / doğrulanıyor" ekranında çıkış düğmesi bu kadar beklenince çıkar (yanlışlıkla dokunulmasın).
export const SLOW_EXIT_MS = 5000;
// Kapı sonucu panelde bu kadar kalır: yüksek hızda bile ilk engel görünür alana girmeden kalksın.
const GATE_CLEAR_MS = 1500;
// Sunucu client_score'u 2e9 ile sınırlıyor: aşan istek 422 olmasın.
const CLIENT_SCORE_MAX = 2000000000;

// Varsayılan (tarayıcı) titreşim desenleri; yalnızca eskiden de titreşen anlar.
const VIBRATE = { success: 30, error: [60, 40, 60], heavy: [90, 50, 90] };

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

export default function useRunnerSession({
    entry,
    api = gameApi,
    userId = null,
    avatar = null,
    onExit,
    onResult,
    onHaptic,
    onSettings,
    initialMuted,
    initialMusic,
    // Erişilebilirlik modu: kapı sorusu seslendirilir, okunurken koşu bekler (held).
    accessibility = false,
}) {
    const [session, setSessionState] = useState(() => makeSession(entry, 1));
    const [phase, setPhaseState] = useState('loading');
    const [paused, setPausedState] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [gate, setGate] = useState(null);
    const [result, setResult] = useState(null);
    const [explanations, setExplanations] = useState({});
    const [message, setMessage] = useState('');
    const [muted, setMuted] = useState(() => (typeof initialMuted === 'boolean' ? initialMuted : loadMuted()));
    const [musicEnabled, setMusicEnabled] = useState(() => (typeof initialMusic === 'boolean' ? initialMusic : loadMusicEnabled()));
    const [busy, setBusy] = useState(false);
    const [announce, setAnnounce] = useState('');
    const [held, setHeld] = useState(false);
    const [hudStore] = useState(() => createHudStore());
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
    const userIdRef = useRef(userId);
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
    // Kontrol ipucu hangi oturum için sayıldı (devam geri sayımı yeniden saymasın).
    const hintSessionRef = useRef(null);

    // Çağıranın her çizimde yeni kimlikle verdiği seçenekler: effect'leri yeniden bağlamasın.
    const apiRef = useRef(api);
    const avatarRef = useRef(avatar);
    const hooksRef = useRef({ onExit, onResult, onHaptic, onSettings });
    useEffect(() => {
        apiRef.current = api;
        avatarRef.current = avatar;
        hooksRef.current = { onExit, onResult, onHaptic, onSettings };
    });

    useEffect(() => {
        userIdRef.current = userId ?? null;
    }, [userId]);

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

    // Oyun alanı elemanı (callback ref): görünüm `ref={s.stageRef}` ile bağlar.
    const stageRef = useCallback((el) => {
        containerRef.current = el;
    }, []);

    const focusStage = useCallback(() => {
        containerRef.current?.focus({ preventScroll: true });
    }, []);

    /*
     * Kapı sonucu ve çarpma titreşimi (tarayıcı). Native köprüsü dinliyorsa
     * (onHaptic) bu anları motorun kendi onHaptic'i zaten bildiriyor
     * (gateCorrect/gateWrong/crash): ikinci kez gönderilmez.
     */
    const haptic = useCallback((style) => {
        if (hooksRef.current.onHaptic) return;
        if (VIBRATE[style]) vibrate(VIBRATE[style]);
    }, []);

    const emitResult = useCallback((r) => {
        const fn = hooksRef.current.onResult;
        if (fn) safe(() => fn(r));
    }, []);

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
     * Sökülme. Kullanıcı bilerek çıktıysa ("Çık", "Vazgeç") açık dereceli
     * koşu çıkışta zaten terk edildi. Bilmeden çıktıysa (tarayıcı geri
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
                const client = apiRef.current;
                const snap = !explicitExitRef.current && snapshotRef.current?.runId === runId ? snapshotRef.current : null;
                if (snap && snap.endTick > 0) {
                    runStatusRef.current = 'ended';
                    saveSnapshot(snap);
                    const payload = { end_tick: snap.endTick, inputs: snap.inputs, client_score: Math.min(snap.localScore, CLIENT_SCORE_MAX) };
                    finishRunOnce(runId, payload, client).then(
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
                client.abandonRunner(runId).catch(() => {});
            }, 0);
        };
    }, [takeSnapshot, saveSnapshot]);

    /*
     * Sekme gizlenince / sayfa kapanırken (yenileme, uygulama değiştirme)
     * açık dereceli koşunun o anki girdileri bekleyen kayıt olarak saklanır.
     * Koşu bitirilmez: sayfa bfcache'ten dönüp oyun sürebilir; o zaman
     * sonraki bitiş aynı koşunun kaydını ezer. Dönülmezse lobi (gömmede bir
     * sonraki açılış) 2 saat içinde gönderir.
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
        const text = `Kapı ${index + 1}: ${g.question.text} Sol: ${o[0]}. Orta: ${o[1]}. Sağ: ${o[2]}.`;
        if (accessibilityRef.current && safe(() => gameRef.current?.hold()) === true) {
            // Soru okunurken koşu bekler; okuma bitince kapıya kalan süre normal akar.
            setHeld(true);
            say(text, { onEnd: () => { if (sessionRef.current === s) releaseHold(); else safe(() => gameRef.current?.release()); } });
        } else {
            say(text);
        }
    }, [say, releaseHold]);

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
            releaseHold();
            const stale = () => sessionRef.current !== s;
            /*
             * Açıklamalar bu koşunun kovasına yazılır: "Tekrar Koş" sonrası geç
             * gelen eski yanıt yeni koşunun aynı index'li kapısına yazılmasın.
             * Yazım stale() kontrolünün önünde: handleEnd oturumu live:false ile
             * yenilediği için aynı koşunun geç gelen meşru yanıtı da stale sayılır.
             */
            const bucket = explanationsRef.current;
            const client = apiRef.current;
            const p = withRetry(() => client.runnerGate(s.run.id, { gate: index, lane }), RUNNER_RETRY.gate, stale)
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
                        // Sonuç metni soru panelinin canlı bölgesinde duyurulur; erişilebilirlik modunda sesli de okunur.
                        patchGate(s.key, index, { status: correct ? 'correct' : 'wrong', correctLane, multiplier: mult });
                        haptic(correct ? 'success' : 'error');
                        if (speakerRef.current) {
                            const correctText = correctLane != null ? g.question.options[correctLane] : null;
                            speakerRef.current.speak(correct ? `Doğru! Çarpan ${mult}.` : `Yanlış${correctText ? `. Doğru cevap: ${correctText}` : ''}.`);
                        }
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
        [later, patchGate, haptic, releaseHold]
    );

    const handleCrash = useCallback(() => haptic('heavy'), [haptic]);

    // Motorun kendi titreşim anları (jeton, zıplama, çatıya iniş...): yalnızca native köprüsü dinliyorsa.
    const handleEngineHaptic = useCallback((style) => {
        const h = hooksRef.current.onHaptic;
        if (h && typeof style === 'string') safe(() => h(style));
    }, []);

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
            const data = await finishRunOnce(job.runId, job.payload, apiRef.current);
            clearPending(job.runId);
            runStatusRef.current = 'done';
            if (!mountedRef.current) return;
            const r = data?.result;
            if (!r || typeof r !== 'object') {
                // Kayıt başarılı, yalnızca yanıt bozuk: "kaydedilmedi" paneli yanlış olurdu.
                setMessage('Sonuç okunamadı. Koşun kaydedildi; sonuçlarını lobide görebilirsin.');
                changePhase('saved');
                emitResult(null);
                return;
            }
            setExplanations({ ...explanationsRef.current });
            setResult(r);
            changePhase('result');
            emitResult(r);
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
    }, [changePhase, emitResult]);

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
                const r = {
                    practice: true,
                    score: localScore,
                    distance_m: distance,
                    coins,
                    crashed: data?.crashed !== false,
                    new_best: newBest,
                    best_score: best.score,
                    best_distance: best.distance,
                };
                setResult(r);
                changePhase('result');
                emitResult(r);
                return;
            }

            runStatusRef.current = 'ended';
            const payload = { end_tick: endTick, inputs, client_score: Math.min(localScore, CLIENT_SCORE_MAX) };
            payloadRef.current = { runId: s.run.id, payload };
            // Sekme kapanırsa ya da ağ düşerse lobi 2 saat içinde yeniden gönderir.
            savePending({ userId: userIdRef.current, runId: s.run.id, endTick, inputs, clientScore: localScore });
            submitFinish();
        },
        [applySession, setPaused, changePhase, submitFinish, emitResult]
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
        failWith('error', '3D sahne beklenmedik şekilde durdu (grafik bağlamı kayboldu). Yeniden başlatabilir ya da çıkabilirsin.');
    }, [failWith]);

    const handleNoWebGL = useCallback(() => {
        const s = sessionRef.current;
        // Oynanamayacak dereceli koşu sunucuda açık kalmasın.
        if (s?.mode === 'ranked' && s.run && runStatusRef.current === 'active') {
            runStatusRef.current = 'abandoned';
            apiRef.current.abandonRunner(s.run.id).catch(() => {});
        }
        failWith(
            'nowebgl',
            'Bu cihazda 3D grafik (WebGL 2) kullanılamıyor. Donanım hızlandırmayı açıp ya da güncel bir tarayıcıyla tekrar dene. iOS kullanıyorsan iOS 15 veya üstüne güncelle.'
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
            onHaptic: guard(handleEngineHaptic),
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
                    avatar: avatarRef.current,
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
        reducedMotion,
        handleHud,
        handleGateApproach,
        handleGateCross,
        handleCountdown,
        handleCrash,
        handleEnd,
        handleEngineError,
        handleEngineHaptic,
        handleNoWebGL,
        changePhase,
        failWith,
        takeSnapshot,
    ]);

    // ---- Kullanıcı eylemleri ----

    /*
     * Tüm mola yolları (Esc/P, HUD butonu, sekme değiştirme / pencere odağı
     * gidince motorun kendiliğinden durması, geri hareketi, native "pause")
     * buradan geçer. Molada soru paneli gizlenir ve süre çubuğu durur; kapı
     * cezası yok (bildirimle / sekme değişimiyle duraklayan dürüst oyuncu
     * cezalanmasın).
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

    const notifySettings = useCallback(() => {
        const fn = hooksRef.current.onSettings;
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
            setMuted(v);
            safe(() => gameRef.current?.setMuted(v));
            if (!notify) return;
            if (hooksRef.current.onSettings) notifySettings();
            else saveMuted(v);
        },
        [notifySettings]
    );

    // Yalnızca arka plan müziği (efektler sürer); mola menüsünden açılıp kapanır.
    const setMusicTo = useCallback(
        (next, notify = true) => {
            const v = Boolean(next);
            musicRef.current = v;
            setMusicEnabled(v);
            safe(() => gameRef.current?.setMusicEnabled?.(v));
            if (!notify) return;
            if (hooksRef.current.onSettings) notifySettings();
            else saveMusicEnabled(v);
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

    const toggleMusic = useCallback(() => setMusicTo(!musicRef.current), [setMusicTo]);

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
        const client = apiRef.current;
        runStatusRef.current = 'starting';
        startingRef.current = true;
        setBusy(true);
        changePhase('starting');
        try {
            const data = await client.startRunner();
            const run = normalizeRun(data?.run);
            if (!run || run.simVersion !== RUNNER_SIM_VERSION) {
                if (data?.run?.id) client.abandonRunner(data.run.id).catch(() => {});
                const bad = new Error('bad-run');
                bad.badRun = true;
                throw bad;
            }
            // Yanıt gelmeden sayfadan / oyundan çıkıldı: açılan koşu boşa açık kalmasın.
            if (!mountedRef.current || explicitExitRef.current) {
                client.abandonRunner(run.id).catch(() => {});
                return;
            }
            runStatusRef.current = 'active';
            // Eski koşu sunucuda yeni start ile terk edildi; gizlenirken saklanan ara kaydı lobide gönderilmesin.
            if (wasActive) clearPending(s.run.id);
            applySession(makeSession({ mode: 'ranked', run }, s.key + 1));
            changePhase('loading');
        } catch (err) {
            // Yeni koşu açılamadıysa eskisi hâlâ açık: oynanamayacağı için kapat.
            if (wasActive && !err?.badRun) client.abandonRunner(s.run.id).catch(() => {});
            if (wasActive) clearPending(s.run.id);
            runStatusRef.current = 'idle';
            if (!mountedRef.current) return;
            setMessage(err?.badRun ? 'Koşu verisi okunamadı. Birazdan tekrar dene.' : gameErrorMessage(err, 'Yeni koşu başlatılamadı.'));
            changePhase('start-failed');
        } finally {
            startingRef.current = false;
            if (mountedRef.current) setBusy(false);
        }
    };

    /** Koşuyu şimdi bitir (dereceliyse kaydedilir). Motor yoksa false döner; çağıran çıkışı seçer. */
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
        return Boolean(ok);
    };

    /*
     * Bilerek çıkış. Açık dereceli koşu hemen terk edilir: gömmede native
     * WebView'i kapatınca bileşen sökülme fırsatı bulamayabilir. Motor da
     * durdurulur (SPA'da zaten sayfa sökülür).
     */
    const exit = () => {
        explicitExitRef.current = true;
        const s = sessionRef.current;
        if (s?.mode === 'ranked' && s.run && runStatusRef.current === 'active') {
            runStatusRef.current = 'abandoned';
            clearPending(s.run.id);
            apiRef.current.abandonRunner(s.run.id).catch(() => {});
        }
        if (s?.live) applySession({ ...s, live: false });
        setPaused(false);
        const fn = hooksRef.current.onExit;
        if (fn) fn();
    };

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

    const getPhase = useCallback(() => phaseRef.current, []);
    const isPausedNow = useCallback(() => pausedRef.current, []);

    return {
        stageRef,
        hudStore,
        session,
        phase,
        paused,
        countdown,
        gate,
        result,
        explanations,
        message,
        muted,
        musicEnabled,
        busy,
        announce,
        held,
        accessibility: Boolean(accessibility),
        touch,
        showHint,
        ctxLost,
        ranked: session.mode === 'ranked',
        playing: PLAYING.includes(phase),
        slowExit: slowFor === phase,
        getPhase,
        isPausedNow,
        focusStage,
        pause,
        resume,
        toggleMute,
        toggleMusic,
        setMutedTo,
        setMusicTo,
        submitFinish,
        playPractice,
        restart,
        finishNow,
        exit,
    };
}
