import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuCloudOff, LuDoorOpen, LuLogIn, LuMonitorX, LuPlay, LuRotateCcw } from 'react-icons/lu';
import TowerGameScreen, { Panel, primaryBtn, secondaryBtn } from '../pages/game/tower/TowerGameScreen';
import { PLAYING } from '../pages/game/tower/useTowerSession';
import {
    SAFE_AREA_PAD,
    TOWER_SIM_VERSION,
    classifyFinishError,
    clearPending,
    detectWebGL,
    finishTowerOnce,
    loadPending,
    normalizeTowerRun,
} from '../components/game/tower/towerUtils';
import { normalizeAvatar } from '../game/avatar/catalog';
import { gameErrorMessage, gameErrorStatus } from '../services/gameApi';
import { onNativeMessage, postToNative } from './bridge';
import { summarizeTowerResult } from './embedResult';

// Bekleyen (yarım kalmış) kulenin gönderimi yeni kuleyi en fazla bu kadar bekletir.
const PENDING_WAIT_MS = 8000;
// Sonuç ekranındaki "Mağazaya git": native mağaza ekranını açar (bridge openUrl, native doğrular).
const SHOP_PATH = '/oyun/magaza';

const Spinner = ({ label }) => (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-coral border-t-transparent" />
        <span className="text-sm font-semibold text-white/80">{label}…</span>
    </div>
);

const Backdrop = ({ children }) => (
    <div
        className={`fixed inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#1b1650] via-[#3a2470] to-[#55307f] text-white ${SAFE_AREA_PAD}`}
        data-testid="embed-tower"
    >
        {children}
    </div>
);

/*
 * Oyun oturumu: SPA ile aynı TowerGameScreen + useTowerSession. Çıkış,
 * sonuç, ses tercihleri, titreşim ve mağaza bağlantısı native'e köprüyle
 * gider; native'in pause / back / setMuted / setMusic mesajları oturuma
 * uygulanır. Karakter (setAvatar) motorda canlı güncellenir.
 */
const EmbedTowerSession = ({ entry, api, config, avatar, prefs, haptic, onExited, onPrefs }) => {
    const sessionRef = useRef(null);
    const member = Boolean(config.token);

    const onExit = useCallback(() => {
        postToNative('exit');
        onExited();
    }, [onExited]);
    const onResult = useCallback((r) => postToNative('result', summarizeTowerResult(r)), []);
    const onSettings = useCallback(
        (v) => {
            onPrefs(v);
            postToNative('settings', v);
        },
        [onPrefs]
    );
    const onLogin = useCallback(() => postToNative('login'), []);
    const onShop = useCallback(() => postToNative('openUrl', { url: SHOP_PATH }), []);

    useEffect(
        () =>
            onNativeMessage((msg) => {
                const cur = sessionRef.current;
                if (!cur) return;
                const a = cur.actions;
                switch (msg.type) {
                    case 'pause':
                        // Uygulama arka plana gitti: mola menüsü açık kalır, oyuncu dönünce kendisi devam eder.
                        a.pause();
                        break;
                    case 'resume':
                        // Bilerek bir şey yapılmaz: oyuncu menüden devam eder (soru süresi haksız işlemesin).
                        break;
                    case 'back': {
                        // Android geri tuşu: oyunda mola menüsü, menüde / oyun dışında çıkış.
                        const phase = a.getPhase();
                        if (PLAYING.includes(phase)) {
                            if (a.isPausedNow()) a.exit();
                            else a.pause();
                            return;
                        }
                        // Kule kaydedilirken / yeni kule açılırken çıkış ancak "uzun sürdü" düğmesi çıkınca.
                        if ((phase === 'finishing' || phase === 'starting') && !cur.slowExit) return;
                        a.exit();
                        break;
                    }
                    case 'setMuted':
                        a.setMuted(msg.muted, false);
                        break;
                    case 'setMusic':
                        a.setMusic(msg.music, false);
                        break;
                    default:
                        break;
                }
            }),
        []
    );

    return (
        <TowerGameScreen
            entry={entry}
            user={member ? config.user : null}
            avatar={avatar}
            api={api}
            initialMuted={prefs.muted}
            initialMusic={prefs.music}
            onSettings={onSettings}
            onExit={onExit}
            onHaptic={haptic}
            onResult={onResult}
            onLogin={onLogin}
            onShop={member ? onShop : undefined}
            sessionRef={sessionRef}
            embedded
        />
    );
};

/**
 * Mobil gömmede kule (?game=kule): token varsa dereceli oyun (önce yarım
 * kalan kule gönderilir, sonra sunucuda yeni kule açılır), yoksa misafir
 * antrenmanı. WebGL 2 yoksa sunucuda kule hiç açılmaz.
 */
const EmbedTower = ({ config, api, haptic }) => {
    const member = Boolean(config.token);
    const towerClient = api.tower;
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

    const onExited = useCallback(() => setStage({ kind: 'exited' }), []);

    const playPractice = () => setStage((st) => ({ kind: 'play', entry: { mode: 'practice' }, key: (st.key ?? 0) + 1 }));

    // Dereceli başlangıç (attempt her "Tekrar dene"de artar; StrictMode'un çift effect'i tek istek atar).
    useEffect(() => {
        if (stage.kind !== 'starting' || startedRef.current === attempt) return;
        startedRef.current = attempt;
        const userId = config.user?.id ?? null;
        (async () => {
            /*
             * Yarım kalan kule (WebView kapanırken saklanan) önce gönderilir:
             * yeni start sunucuda açık kuleyi terk eder, sonra gönderilse 409 alırdı.
             */
            const pending = loadPending(userId);
            if (pending) {
                let timer;
                const send = finishTowerOnce(
                    pending.run_id,
                    { end_tick: pending.end_tick, inputs: pending.inputs, client_score: pending.client_score ?? undefined },
                    towerClient
                ).then(
                    (data) => {
                        clearPending(pending.run_id);
                        if (data?.result) postToNative('result', summarizeTowerResult(data.result));
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
                const data = await towerClient.start();
                const run = normalizeTowerRun(data?.run);
                if (!run || run.simVersion !== TOWER_SIM_VERSION) {
                    if (data?.run?.id) towerClient.abandon(data.run.id).catch(() => {});
                    if (!mountedRef.current) return;
                    setStage({
                        kind: 'failed',
                        message: run ? 'Oyun güncellendi. Uygulamayı kapatıp yeniden aç.' : 'Oyun verisi okunamadı. Birazdan tekrar dene.',
                    });
                    return;
                }
                if (!mountedRef.current || stageRef.current.kind !== 'starting') {
                    // Bu arada çıkıldı (geri tuşu): açılan kule boşa açık kalmasın.
                    towerClient.abandon(run.id).catch(() => {});
                    return;
                }
                setStage((st) => ({ kind: 'play', entry: { mode: 'ranked', run }, key: (st.key ?? 0) + 1 }));
            } catch (err) {
                if (!mountedRef.current) return;
                if (gameErrorStatus(err) === 401) setStage({ kind: 'auth' });
                else setStage({ kind: 'failed', message: gameErrorMessage(err, 'Oyun başlatılamadı.') });
            }
        })();
    }, [stage.kind, attempt, towerClient, config.user?.id]);

    // Karakter / tercihler her aşamada izlenir; geri tuşu yalnız oturum dışında (oturum kendisi dinler).
    useEffect(
        () =>
            onNativeMessage((msg) => {
                if (msg.type === 'setAvatar') {
                    // Kulenin tepesindeki karakter oyun sürerken de güncellenir.
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
            <EmbedTowerSession
                key={stage.key}
                entry={stage.entry}
                api={towerClient}
                config={config}
                avatar={avatar}
                prefs={prefs}
                haptic={haptic}
                onPrefs={setPrefs}
                onExited={onExited}
            />
        );
    }

    if (stage.kind === 'starting') {
        return (
            <Backdrop>
                <Spinner label="Kule hazırlanıyor" />
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
                    <p>Dereceli oyun için yeniden giriş yapman gerekiyor.</p>
                </Panel>
            )}
            {stage.kind === 'failed' && (
                <Panel
                    icon={LuCloudOff}
                    tone="amber"
                    title="Kule başlatılamadı"
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

export default EmbedTower;
