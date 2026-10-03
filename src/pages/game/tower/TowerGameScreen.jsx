import React, { useEffect, useRef } from 'react';
import { LuCircleCheck, LuCloudOff, LuDoorOpen, LuHouse, LuMonitorX, LuPlay, LuRotateCcw, LuShieldAlert, LuTriangleAlert } from 'react-icons/lu';
import TowerHud from '../../../components/game/tower/TowerHud';
import TowerQuestionPanel from '../../../components/game/tower/TowerQuestionPanel';
import TowerPauseMenu from '../../../components/game/tower/TowerPauseMenu';
import TowerCountdown from '../../../components/game/tower/TowerCountdown';
import TowerResult from '../../../components/game/tower/TowerResult';
import TowerPerfectPop from '../../../components/game/tower/TowerPerfectPop';
import TowerTapHint from '../../../components/game/tower/TowerTapHint';
import { SAFE_AREA_PAD } from '../../../components/game/tower/towerUtils';
import useTowerSession from './useTowerSession';
import '../../../components/game/game.css';
import '../../../components/game/tower/tower.css';

const Spinner = ({ label }) => (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-coral border-t-transparent" />
        <span className="text-sm font-semibold text-white/80">{label}…</span>
    </div>
);

/*
 * Tam ekran durum paneli. Açılınca odak ilk etkin butona taşınır: klavyeyle
 * oynayan Enter ile devam edebilsin, ekran okuyucu panele odaklansın.
 */
export const Panel = ({ icon: Icon, tone = 'rose', title, children, actions }) => {
    const actionsRef = useRef(null);
    useEffect(() => {
        actionsRef.current?.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    }, []);
    const toneClass =
        tone === 'amber' ? 'bg-amber-400/20 text-amber-200' : tone === 'emerald' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200';
    return (
        <div className={`absolute inset-0 z-50 flex overflow-y-auto overscroll-contain bg-slate-950/75 backdrop-blur-sm ${SAFE_AREA_PAD}`}>
            <div role="alert" className="game-hero m-auto w-full max-w-md rounded-3xl p-6 text-center shadow-2xl ring-1 ring-white/15 game-pop-in">
                {Icon && (
                    <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${toneClass}`}>
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

export const primaryBtn =
    'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 font-bold text-white game-press game-glow-coral disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
export const secondaryBtn =
    'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 font-bold text-white ring-1 ring-white/15 game-press disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
const linkBtn = 'min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/70 underline hover:text-white';

// Tarayıcı geri hareketine karşı geçmişe eklenen koruma kaydı.
const GUARD_STATE = 'towerGuard';

const pushGuard = () => {
    // idx / key alanları korunur: React Router'ın geçmiş sırası bozulmasın.
    window.history.pushState({ ...(window.history.state || {}), [GUARD_STATE]: true }, '');
};

/**
 * Herkesler Yükseliyor oyun ekranı (tam ekran katman). SPA sayfası ve
 * gömülü mod aynı bileşeni kullanır; yönlendirme bilmez (çıkış onExit).
 *
 * historyGuard: tarayıcı geri hareketi koruması (SPA). Oyun başlayınca
 * geçmişe aynı adreste bir koruma kaydı eklenir; geri hareketi önce onu
 * tüketir: oyun duraklar, koruma yeniden eklenir. Oyun dışındaki aşamalarda
 * geri hareketi doğrudan çıkar. Gömülü modda native geri tuşu kullanılır.
 *
 * Gömülü mod ek prop'ları: embedded (çıkış metni "Oyundan çık", paylaş yok),
 * onShop (sonuçtaki "Mağazaya git"), api (embedApi'nin kule istemcisi), initialMuted /
 * initialMusic + onSettings (tercihler native'de), sessionRef (oturuma
 * dışarıdan erişim: pause / exit / getPhase / setMuted).
 */
const TowerGameScreen = ({
    entry,
    user,
    avatar,
    onExit,
    onHaptic,
    onResult,
    onLogin,
    onShop,
    shareUrl,
    embedded = false,
    historyGuard = false,
    api,
    initialMuted,
    initialMusic,
    onSettings,
    sessionRef,
    className = 'fixed inset-0 z-[95] h-[100dvh]',
}) => {
    const containerRef = useRef(null);
    // Gömülü modda çıkış native lobiye döner; bekleyen kayıt bir sonraki oyunda gönderilir.
    const exitLabel = embedded ? 'Oyundan çık' : 'Lobiye dön';
    const ExitIcon = embedded ? LuDoorOpen : LuHouse;
    const laterWhere = embedded ? 'bir sonraki oyunda' : 'lobide';
    const s = useTowerSession({ entry, user, avatar, containerRef, onExit, onHaptic, onResult, onSettings, initialMuted, initialMusic, api });
    const { actions: a, phase, paused, playing, ranked, question, countdown } = s;
    const guardRef = useRef(false);
    const phaseRef = useRef(phase);
    const pauseRef = useRef(a.pause);
    const exitRef = useRef(onExit);

    useEffect(() => {
        phaseRef.current = phase;
        pauseRef.current = a.pause;
        exitRef.current = onExit;
        // Gömülü mod: native mesajları (back / pause / setMuted) oturuma buradan ulaşır.
        if (sessionRef) sessionRef.current = s;
    });

    useEffect(() => {
        if (!historyGuard || !playing || guardRef.current) return;
        try {
            pushGuard();
            guardRef.current = true;
        } catch {
            // geçmiş API'si kapalı: koruma yok, sorun değil
        }
    }, [historyGuard, playing]);

    useEffect(() => {
        if (!historyGuard) return undefined;
        const onPop = () => {
            if (!guardRef.current) return;
            guardRef.current = false;
            if (phaseRef.current === 'countdown' || phaseRef.current === 'running') {
                try {
                    pushGuard();
                    guardRef.current = true;
                } catch {
                    // yut
                }
                pauseRef.current();
                return;
            }
            exitRef.current?.();
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [historyGuard]);

    return (
        <div className={`${className} w-full overflow-hidden bg-gradient-to-b from-[#1b1650] via-[#55307f] to-[#f06d7e] text-white`}>
            <div
                ref={containerRef}
                tabIndex={-1}
                role="application"
                aria-roledescription="oyun"
                aria-label="Oyun alanı. Kat tam üstteyken dokun, tıkla ya da Boşluk / Enter'a bas. Esc ile duraklat."
                className="tower-stage absolute inset-0 outline-none"
                onContextMenu={(e) => e.preventDefault()}
                data-testid="tower-stage"
            />

            <div className="sr-only" aria-live="polite" aria-atomic="true">
                {s.announce}
            </div>

            {playing && <TowerHud store={s.hudStore} muted={s.muted} onToggleMute={a.toggleMute} onPause={a.pause} practice={!ranked} canPause={!paused} />}

            {playing && <TowerPerfectPop fx={s.placeFx} />}

            {playing && question && (
                <TowerQuestionPanel question={question} total={s.questionTotal} frozen={paused || (countdown != null && countdown > 0)} hidden={paused} onAnswer={a.answer} />
            )}

            {playing && <TowerCountdown value={countdown} />}

            {playing && s.showHint && !paused && !question && <TowerTapHint touch={s.touch} />}

            {phase === 'loading' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 ${SAFE_AREA_PAD}`}>
                    <Spinner label="Kule hazırlanıyor" />
                    <button type="button" onClick={a.exit} className={linkBtn}>
                        Vazgeç
                    </button>
                </div>
            )}

            {paused && playing && (
                <TowerPauseMenu
                    ranked={ranked}
                    muted={s.muted}
                    musicEnabled={s.musicEnabled}
                    onToggleMute={a.toggleMute}
                    onToggleMusic={a.toggleMusic}
                    onResume={a.resume}
                    onRestart={a.restart}
                    onFinish={a.finishNow}
                    onExit={a.exit}
                    busy={s.busy}
                />
            )}

            {phase === 'starting' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 ${SAFE_AREA_PAD}`}>
                    <Spinner label="Yeni kule hazırlanıyor" />
                    {s.slowExit && (
                        <button type="button" onClick={a.exit} className={linkBtn}>
                            {exitLabel}
                        </button>
                    )}
                </div>
            )}

            {phase === 'finishing' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-slate-950/50 text-center backdrop-blur-[2px] ${SAFE_AREA_PAD}`}>
                    <Spinner label="Kulen doğrulanıyor" />
                    {s.ctxLost && <p className="max-w-xs text-sm text-white/75">Grafik durdu; kulen buraya kadarki haliyle kaydediliyor.</p>}
                    {s.slowExit && (
                        <>
                            <p className="max-w-xs text-xs text-white/60">Kulen bu cihazda saklandı; {laterWhere} otomatik gönderilecek.</p>
                            <button type="button" onClick={a.exit} className={linkBtn}>
                                {exitLabel}
                            </button>
                        </>
                    )}
                </div>
            )}

            {phase === 'finish-failed' && (
                <Panel
                    icon={LuCloudOff}
                    tone="amber"
                    title="Kulen gönderilemedi"
                    actions={
                        <>
                            <button type="button" onClick={a.submitFinish} className={primaryBtn}>
                                <LuRotateCcw aria-hidden="true" /> Tekrar dene
                            </button>
                            <button type="button" onClick={a.exit} className={secondaryBtn}>
                                <ExitIcon aria-hidden="true" /> {exitLabel}
                            </button>
                        </>
                    }
                >
                    <p>{s.message}</p>
                    <p className="mt-2 text-white/60">
                        Kulen bu cihazda saklandı; {embedded ? 'bir sonraki oyunu açtığında' : 'lobiyi açtığında'} (2 saat içinde) otomatik gönderilir.
                    </p>
                </Panel>
            )}

            {(phase === 'rejected' || phase === 'saved') && (
                <Panel
                    icon={phase === 'saved' ? LuCircleCheck : LuShieldAlert}
                    tone={phase === 'saved' ? 'emerald' : 'rose'}
                    title={phase === 'saved' ? 'Kulen kaydedildi' : 'Kule kaydedilmedi'}
                    actions={
                        <>
                            <button type="button" onClick={a.restart} disabled={s.busy} className={primaryBtn}>
                                <LuRotateCcw aria-hidden="true" /> Tekrar Oyna
                            </button>
                            <button type="button" onClick={a.exit} className={secondaryBtn}>
                                <ExitIcon aria-hidden="true" /> {exitLabel}
                            </button>
                        </>
                    }
                >
                    <p>{s.message}</p>
                    {phase === 'rejected' && <p className="mt-2 text-white/60">Bu oyun için puan ve XP eklenmedi. Yeni bir kuleye başlayabilirsin.</p>}
                </Panel>
            )}

            {(phase === 'error' || phase === 'nowebgl') && (
                <Panel
                    icon={phase === 'nowebgl' ? LuMonitorX : LuTriangleAlert}
                    title={phase === 'nowebgl' ? '3D desteklenmiyor' : 'Bir aksilik oldu'}
                    actions={
                        <>
                            {phase === 'error' && (
                                <button type="button" onClick={a.restart} disabled={s.busy} className={primaryBtn}>
                                    <LuRotateCcw aria-hidden="true" /> Yeniden başlat
                                </button>
                            )}
                            <button type="button" onClick={a.exit} className={phase === 'error' ? secondaryBtn : primaryBtn}>
                                <ExitIcon aria-hidden="true" /> {exitLabel}
                            </button>
                        </>
                    }
                >
                    <p>{s.message}</p>
                </Panel>
            )}

            {phase === 'start-failed' && (
                <Panel
                    icon={LuCloudOff}
                    tone="amber"
                    title="Yeni kule başlatılamadı"
                    actions={
                        <>
                            <button type="button" onClick={a.playPractice} className={primaryBtn}>
                                <LuPlay aria-hidden="true" /> Antrenman modunda oyna
                            </button>
                            <button type="button" onClick={a.exit} className={secondaryBtn}>
                                <ExitIcon aria-hidden="true" /> {exitLabel}
                            </button>
                        </>
                    }
                >
                    <p>{s.message}</p>
                </Panel>
            )}

            {phase === 'result' && s.result && (
                <div className="absolute inset-0 z-50 overflow-y-auto overscroll-contain bg-gradient-to-b from-slate-950/10 via-slate-950/30 to-slate-950/70">
                    {s.ctxLost && !s.result.practice && (
                        <p role="status" className="mx-auto mt-[max(1rem,env(safe-area-inset-top))] w-fit max-w-[calc(100%-2rem)] rounded-full bg-amber-400/20 px-3 py-1.5 text-center text-xs font-semibold text-amber-100 ring-1 ring-amber-300/30">
                            Grafik durdu, kulen kaydedildi.
                        </p>
                    )}
                    <TowerResult
                        result={s.result}
                        onAgain={a.restart}
                        onLobby={a.exit}
                        busy={s.busy}
                        guest={!user}
                        onLogin={onLogin}
                        onShop={onShop}
                        shareUrl={shareUrl}
                        lobbyLabel={exitLabel}
                        share={!embedded}
                    />
                </div>
            )}
        </div>
    );
};

export default TowerGameScreen;
