import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuCloudOff, LuDoorOpen, LuLogIn, LuMonitorX, LuPlay, LuRotateCcw } from 'react-icons/lu';
import RunnerStage, { Panel, primaryBtn, secondaryBtn } from '../components/game/runner/RunnerStage';
import {
    RUNNER_SIM_VERSION,
    SAFE_AREA_PAD,
    classifyFinishError,
    clearPending,
    detectWebGL,
    finishRunOnce,
    loadPending,
    normalizeRun,
} from '../components/game/runner/runnerUtils';
import useRunnerSession, { PLAYING } from '../pages/game/runner/useRunnerSession';
import { normalizeAvatar } from '../game/avatar/catalog';
import { gameErrorMessage, gameErrorStatus } from '../services/gameApi';
import { onNativeMessage, postToNative } from './bridge';
import { summarizeRunnerResult } from './embedResult';

// Bekleyen (yarım kalmış) koşunun gönderimi yeni koşuyu en fazla bu kadar bekletir.
const PENDING_WAIT_MS = 8000;

const Spinner = ({ label }) => (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-coral border-t-transparent" />
        <span className="text-sm font-semibold text-white/80">{label}…</span>
    </div>
);

const Backdrop = ({ children }) => (
    <div className={`fixed inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#0b1030] via-[#25185a] to-[#43195f] text-white ${SAFE_AREA_PAD}`}>
        {children}
    </div>
);

/*
 * Oyun oturumu: SPA ile aynı useRunnerSession + RunnerStage. Çıkış, sonuç,
 * ses tercihleri ve titreşim native'e köprüyle gider; native'in pause /
 * back / setMuted / setMusic mesajları oturuma uygulanır.
 */
const EmbedRunnerSession = ({ entry, api, config, avatar, prefs, haptic, onExited, onPrefs }) => {
    const s = useRunnerSession({
        entry,
        api,
        userId: config.user?.id ?? null,
        avatar,
        initialMuted: prefs.muted,
        initialMusic: prefs.music,
        onExit: () => {
            postToNative('exit');
            onExited();
        },
        onResult: (r) => postToNative('result', summarizeRunnerResult(r)),
        onHaptic: haptic,
        onSettings: (v) => {
            onPrefs(v);
            postToNative('settings', v);
        },
    });
    const sRef = useRef(s);
    useEffect(() => {
        sRef.current = s;
    });

    useEffect(
        () =>
            onNativeMessage((msg) => {
                const cur = sRef.current;
                switch (msg.type) {
                    case 'pause':
                        // Uygulama arka plana gitti: mola menüsü açık kalır, oyuncu dönünce kendisi devam eder.
                        cur.pause();
                        break;
                    case 'resume':
                        // Bilerek bir şey yapılmaz: motor kendi geri sayımıyla menüden devam eder.
                        break;
                    case 'back': {
                        // Android geri tuşu: oyunda mola menüsü, menüde / oyun dışında çıkış.
                        const phase = cur.getPhase();
                        if (PLAYING.includes(phase)) {
                            if (cur.isPausedNow()) cur.exit();
                            else cur.pause();
                            return;
                        }
                        // Koşu kaydedilirken / yeni koşu açılırken çıkış ancak "uzun sürdü" düğmesi çıkınca.
                        if ((phase === 'finishing' || phase === 'starting') && !cur.slowExit) return;
                        cur.exit();
                        break;
                    }
                    case 'setMuted':
                        cur.setMutedTo(msg.muted, false);
                        break;
                    case 'setMusic':
                        cur.setMusicTo(msg.music, false);
                        break;
                    default:
                        break;
                }
            }),
        []
    );

    return (
        <RunnerStage
            s={s}
            guest={!config.token}
            embedded
            onLogin={() => postToNative('login')}
            // Sonuçtaki "Mağazaya git": native mağaza ekranı (bridge openUrl, native doğrular).
            onShop={config.token ? () => postToNative('openUrl', { url: '/oyun/magaza' }) : undefined}
        />
    );
};

/**
 * Mobil gömmede koşu: token varsa dereceli koşu (önce yarım kalan koşu
 * gönderilir, sonra sunucuda yeni koşu açılır), yoksa misafir antrenmanı.
 * WebGL 2 yoksa sunucuda koşu hiç açılmaz.
 */
const EmbedRunner = ({ config, api, haptic }) => {
    const member = Boolean(config.token);
    const [webgl] = useState(detectWebGL);
    // stage: starting | auth | failed | nowebgl | play | exited
    const [stage, setStage] = useState(() => (!webgl ? { kind: 'nowebgl' } : member ? { kind: 'starting' } : { kind: 'play', entry: { mode: 'practice' }, key: 1 }));
    const [avatar, setAvatar] = useState(() => normalizeAvatar(config.avatar, config.user?.gender));
    const [prefs, setPrefs] = useState(() => ({ muted: config.muted, music: config.music }));
    const [attempt, setAttempt] = useState(0);
    const stageRef = useRef(stage);
    const mountedRef = useRef(false);
    const startedRef = useRef(-1);

    useEffect(() => {
        stageRef.current = stage;
    }, [stage]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const exit = useCallback(() => {
        postToNative('exit');
        setStage({ kind: 'exited' });
    }, []);

    const playPractice = () => setStage((st) => ({ kind: 'play', entry: { mode: 'practice' }, key: (st.key ?? 0) + 1 }));

    // Dereceli başlangıç (attempt her "Tekrar dene"de artar; StrictMode'un çift effect'i tek istek atar).
    useEffect(() => {
        if (stage.kind !== 'starting' || startedRef.current === attempt) return;
        startedRef.current = attempt;
        const userId = config.user?.id ?? null;
        (async () => {
            /*
             * Yarım kalan koşu (WebView kapanırken saklanan) önce gönderilir:
             * yeni start sunucuda açık koşuyu terk eder, sonra gönderilse 409 alırdı.
             */
            const pending = loadPending(userId);
            if (pending) {
                let timer;
                const send = finishRunOnce(
                    pending.run_id,
                    { end_tick: pending.end_tick, inputs: pending.inputs, client_score: pending.client_score ?? undefined },
                    api
                ).then(
                    (data) => {
                        clearPending(pending.run_id);
                        if (data?.result) postToNative('result', summarizeRunnerResult(data.result));
                    },
                    (err) => {
                        const kind = classifyFinishError(err);
                        if (kind === 'rejected' || kind === 'gone') clearPending(pending.run_id);
                    }
                );
                await Promise.race([send, new Promise((r) => (timer = setTimeout(r, PENDING_WAIT_MS)))]);
                clearTimeout(timer);
            }
            try {
                const data = await api.startRunner();
                const run = normalizeRun(data?.run);
                if (!run || run.simVersion !== RUNNER_SIM_VERSION) {
                    if (data?.run?.id) api.abandonRunner(data.run.id).catch(() => {});
                    if (!mountedRef.current) return;
                    setStage({
                        kind: 'failed',
                        message: run ? 'Oyun güncellendi. Uygulamayı kapatıp yeniden aç.' : 'Koşu verisi okunamadı. Birazdan tekrar dene.',
                    });
                    return;
                }
                if (!mountedRef.current || stageRef.current.kind !== 'starting') {
                    // Bu arada çıkıldı (geri tuşu): açılan koşu boşa açık kalmasın.
                    api.abandonRunner(run.id).catch(() => {});
                    return;
                }
                setStage((st) => ({ kind: 'play', entry: { mode: 'ranked', run }, key: (st.key ?? 0) + 1 }));
            } catch (err) {
                if (!mountedRef.current) return;
                if (gameErrorStatus(err) === 401) setStage({ kind: 'auth' });
                else setStage({ kind: 'failed', message: gameErrorMessage(err, 'Koşu başlatılamadı.') });
            }
        })();
    }, [stage.kind, attempt, api, config.user?.id]);

    // Oturum dışı aşamalarda native mesajları (oturum kendi mesajlarını ayrıca dinler).
    useEffect(
        () =>
            onNativeMessage((msg) => {
                if (msg.type === 'setAvatar') {
                    // Bir sonraki koşudan geçerli (motor koşu başında kurulur).
                    setAvatar(normalizeAvatar(msg.avatar, config.user?.gender));
                } else if (msg.type === 'setMuted') {
                    setPrefs((p) => ({ ...p, muted: msg.muted }));
                } else if (msg.type === 'setMusic') {
                    setPrefs((p) => ({ ...p, music: msg.music }));
                } else if (msg.type === 'back') {
                    const kind = stageRef.current.kind;
                    if (kind !== 'play' && kind !== 'exited') exit();
                }
            }),
        [config.user?.gender, exit]
    );

    const retry = () => {
        setAttempt((a) => a + 1);
        setStage({ kind: 'starting' });
    };

    if (stage.kind === 'play') {
        return (
            <EmbedRunnerSession
                key={stage.key}
                entry={stage.entry}
                api={api}
                config={config}
                avatar={avatar}
                prefs={prefs}
                haptic={haptic}
                onPrefs={setPrefs}
                onExited={() => setStage({ kind: 'exited' })}
            />
        );
    }

    if (stage.kind === 'starting') {
        return (
            <Backdrop>
                <Spinner label="Koşu hazırlanıyor" />
                <button type="button" onClick={exit} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/70 underline hover:text-white">
                    Vazgeç
                </button>
            </Backdrop>
        );
    }

    if (stage.kind === 'exited') {
        // Native ekranı kapatır; tarayıcıda (test) ya da kapanmazsa sade bir ekran kalır.
        return (
            <Backdrop>
                <p className="text-sm font-semibold text-white/70">Oyundan çıkıldı.</p>
                <button type="button" onClick={() => window.location.reload()} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/80 underline">
                    Yeniden oyna
                </button>
            </Backdrop>
        );
    }

    const exitBtn = (
        <button type="button" onClick={exit} className={secondaryBtn}>
            <LuDoorOpen aria-hidden="true" /> Oyundan çık
        </button>
    );

    return (
        <Backdrop>
            {stage.kind === 'nowebgl' && (
                <Panel
                    icon={LuMonitorX}
                    title="3D desteklenmiyor"
                    actions={
                        <button type="button" onClick={exit} className={primaryBtn}>
                            <LuDoorOpen aria-hidden="true" /> Oyundan çık
                        </button>
                    }
                >
                    <p>Bu cihazda 3D grafik (WebGL 2) kullanılamıyor. Cihazını ve uygulamayı güncelleyip tekrar dene.</p>
                </Panel>
            )}
            {stage.kind === 'auth' && (
                <Panel
                    icon={LuLogIn}
                    tone="amber"
                    title="Oturumun sona ermiş"
                    actions={
                        <>
                            <button type="button" onClick={() => postToNative('login')} className={primaryBtn}>
                                <LuLogIn aria-hidden="true" /> Giriş yap
                            </button>
                            <button type="button" onClick={playPractice} className={secondaryBtn}>
                                <LuPlay aria-hidden="true" /> Antrenman modunda oyna
                            </button>
                            {exitBtn}
                        </>
                    }
                >
                    <p>Dereceli koşu için yeniden giriş yapman gerekiyor.</p>
                </Panel>
            )}
            {stage.kind === 'failed' && (
                <Panel
                    icon={LuCloudOff}
                    tone="amber"
                    title="Koşu başlatılamadı"
                    actions={
                        <>
                            <button type="button" onClick={retry} className={primaryBtn}>
                                <LuRotateCcw aria-hidden="true" /> Tekrar dene
                            </button>
                            <button type="button" onClick={playPractice} className={secondaryBtn}>
                                <LuPlay aria-hidden="true" /> Antrenman modunda oyna
                            </button>
                            {exitBtn}
                        </>
                    }
                >
                    <p>{stage.message}</p>
                </Panel>
            )}
        </Backdrop>
    );
};

export default EmbedRunner;
