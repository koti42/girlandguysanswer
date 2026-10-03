import React, { useEffect, useRef } from 'react';
import { LuCircleCheck, LuCloudOff, LuDoorOpen, LuHouse, LuMonitorX, LuPlay, LuRotateCcw, LuShieldAlert, LuTriangleAlert } from 'react-icons/lu';
import RunnerHud from './RunnerHud';
import QuestionPanel from './QuestionPanel';
import PauseMenu from './PauseMenu';
import RunnerCountdown from './RunnerCountdown';
import RunnerResult from './RunnerResult';
import RunnerControlsHint from './RunnerControlsHint';
import { SAFE_AREA_PAD } from './runnerUtils';

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
export const Panel = ({ icon: Icon, tone = 'rose', title, children, actions }) => {
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

export const primaryBtn =
    'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-orange-400 px-5 font-bold text-white game-press game-glow-coral disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
export const secondaryBtn =
    'flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 font-bold text-white ring-1 ring-white/15 game-press disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

const linkBtn = 'min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/70 underline hover:text-white';

/**
 * Koşu oyununun tam ekran görünümü: 3D sahne, HUD, soru paneli, geri sayım,
 * mola menüsü, durum panelleri ve sonuç. Durum ve eylemler useRunnerSession
 * kancasından (`s`) gelir; SPA oyun sayfası ve mobil gömme aynı görünümü
 * kullanır.
 *
 * embedded: mobil uygulama içinde (çıkış "Oyundan çık", bekleyen kayıt
 * notu "bir sonraki oyunda", paylaşım yok, misafir CTA'sı onLogin ile).
 * onFinish: mola menüsündeki "Bitir"; verilmezse s.finishNow, motor yoksa çıkış.
 */
const RunnerStage = ({ s, guest = false, embedded = false, onFinish, onLogin, onShop }) => {
    const exitLabel = embedded ? 'Oyundan çık' : 'Lobiye dön';
    const ExitIcon = embedded ? LuDoorOpen : LuHouse;
    const laterWhere = embedded ? 'bir sonraki koşuda' : 'lobide';
    const finish = onFinish || (() => s.finishNow() || s.exit());
    const { stageRef } = s;

    return (
        <div className="fixed inset-0 z-[95] h-[100dvh] w-full overflow-hidden bg-gradient-to-b from-[#0b1030] via-[#25185a] to-[#43195f] text-white">
            {/*
              z-[95]: şartnamedeki z-[60] masaüstündeki mesaj kutusunun (z-[90]) altında
              kalıyordu; yaş doğrulaması ve bildirimler (z-[9999]) yine üstte.
            */}
            <div
                ref={stageRef}
                tabIndex={-1}
                role="application"
                aria-roledescription="oyun"
                aria-label="Oyun alanı. Ok tuşları ya da kaydırma ile oyna. Esc ile duraklat."
                className="runner-stage absolute inset-0 outline-none"
                onContextMenu={(e) => e.preventDefault()}
                data-testid="runner-stage"
            />

            <div className="sr-only" aria-live="polite" aria-atomic="true">
                {s.announce}
            </div>

            {s.playing && (
                <RunnerHud
                    store={s.hudStore}
                    muted={s.muted}
                    onToggleMute={s.toggleMute}
                    onPause={s.pause}
                    practice={!s.ranked}
                    canPause={!s.paused}
                />
            )}

            {/*
              frozen: mola ve devam geri sayımında sim duruyor, süre çubuğu da dursun.
              hidden: molada soru okunamasın (panel sökülmez, çubuk sıfırlanmasın).
            */}
            {s.playing && s.gate && (
                <QuestionPanel
                    gate={s.gate}
                    total={s.session.gates.length}
                    frozen={s.paused || (s.countdown != null && s.countdown > 0)}
                    hidden={s.paused}
                />
            )}

            {s.playing && <RunnerCountdown value={s.countdown} />}

            {s.playing && s.showHint && !s.paused && <RunnerControlsHint touch={s.touch} />}

            {s.phase === 'loading' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 ${SAFE_AREA_PAD}`}>
                    <Spinner label="Pist hazırlanıyor" />
                    <button type="button" onClick={s.exit} className={linkBtn}>
                        Vazgeç
                    </button>
                </div>
            )}

            {s.paused && s.playing && (
                <PauseMenu
                    ranked={s.ranked}
                    musicEnabled={s.musicEnabled}
                    onToggleMusic={s.toggleMusic}
                    onResume={s.resume}
                    onRestart={s.restart}
                    onFinish={finish}
                    onExit={s.exit}
                    busy={s.busy}
                />
            )}

            {s.phase === 'starting' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 ${SAFE_AREA_PAD}`}>
                    <Spinner label="Yeni koşu hazırlanıyor" />
                    {s.slowExit && (
                        <button type="button" onClick={s.exit} className={linkBtn}>
                            {exitLabel}
                        </button>
                    )}
                </div>
            )}

            {s.phase === 'finishing' && (
                <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-slate-950/60 text-center backdrop-blur-sm ${SAFE_AREA_PAD}`}>
                    <Spinner label="Koşun doğrulanıyor" />
                    {s.ctxLost && <p className="max-w-xs text-sm text-white/75">Grafik durdu; koşun buraya kadarki haliyle kaydediliyor.</p>}
                    {s.slowExit && (
                        <>
                            <p className="max-w-xs text-xs text-white/60">Koşun bu cihazda saklandı; {laterWhere} otomatik gönderilecek.</p>
                            <button type="button" onClick={s.exit} className={linkBtn}>
                                {exitLabel}
                            </button>
                        </>
                    )}
                </div>
            )}

            {s.phase === 'finish-failed' && (
                <Panel
                    icon={LuCloudOff}
                    tone="amber"
                    title="Koşun gönderilemedi"
                    actions={
                        <>
                            <button type="button" onClick={s.submitFinish} className={primaryBtn}>
                                <LuRotateCcw aria-hidden="true" /> Tekrar dene
                            </button>
                            <button type="button" onClick={s.exit} className={secondaryBtn}>
                                <ExitIcon aria-hidden="true" /> {exitLabel}
                            </button>
                        </>
                    }
                >
                    <p>{s.message}</p>
                    <p className="mt-2 text-white/60">
                        {embedded
                            ? 'Koşun bu cihazda saklandı; 2 saat içinde bir sonraki koşuda otomatik gönderilir.'
                            : 'Koşun bu cihazda saklandı; lobiyi açtığında (2 saat içinde) otomatik gönderilir.'}
                    </p>
                </Panel>
            )}

            {(s.phase === 'rejected' || s.phase === 'saved') && (
                <Panel
                    icon={s.phase === 'saved' ? LuCircleCheck : LuShieldAlert}
                    tone={s.phase === 'saved' ? 'emerald' : 'rose'}
                    title={s.phase === 'saved' ? 'Koşun kaydedildi' : 'Koşu kaydedilmedi'}
                    actions={
                        <>
                            <button type="button" onClick={s.restart} disabled={s.busy} className={primaryBtn}>
                                <LuRotateCcw aria-hidden="true" /> Tekrar Koş
                            </button>
                            <button type="button" onClick={s.exit} className={secondaryBtn}>
                                <ExitIcon aria-hidden="true" /> {exitLabel}
                            </button>
                        </>
                    }
                >
                    <p>{s.message}</p>
                    {s.phase === 'rejected' && <p className="mt-2 text-white/60">Bu koşu için puan ve XP eklenmedi. Yeni bir koşuya başlayabilirsin.</p>}
                </Panel>
            )}

            {(s.phase === 'error' || s.phase === 'nowebgl') && (
                <Panel
                    icon={s.phase === 'nowebgl' ? LuMonitorX : LuTriangleAlert}
                    title={s.phase === 'nowebgl' ? '3D desteklenmiyor' : 'Bir aksilik oldu'}
                    actions={
                        <>
                            {s.phase === 'error' && (
                                <button type="button" onClick={s.restart} disabled={s.busy} className={primaryBtn}>
                                    <LuRotateCcw aria-hidden="true" /> Yeniden başlat
                                </button>
                            )}
                            <button type="button" onClick={s.exit} className={s.phase === 'error' ? secondaryBtn : primaryBtn}>
                                <ExitIcon aria-hidden="true" /> {exitLabel}
                            </button>
                        </>
                    }
                >
                    <p>{s.message}</p>
                </Panel>
            )}

            {s.phase === 'start-failed' && (
                <Panel
                    icon={LuCloudOff}
                    tone="amber"
                    title="Yeni koşu başlatılamadı"
                    actions={
                        <>
                            <button type="button" onClick={s.playPractice} className={primaryBtn}>
                                <LuPlay aria-hidden="true" /> Antrenman modunda oyna
                            </button>
                            <button type="button" onClick={s.exit} className={secondaryBtn}>
                                <ExitIcon aria-hidden="true" /> {exitLabel}
                            </button>
                        </>
                    }
                >
                    <p>{s.message}</p>
                </Panel>
            )}

            {s.phase === 'result' && s.result && (
                <div className="absolute inset-0 z-50 overflow-y-auto overscroll-contain">
                    {s.ctxLost && !s.result.practice && (
                        <p
                            role="status"
                            className="mx-auto mt-[max(1rem,var(--hs-safe-top,env(safe-area-inset-top)))] w-fit max-w-[calc(100%-2rem)] rounded-full bg-amber-400/20 px-3 py-1.5 text-center text-xs font-semibold text-amber-100 ring-1 ring-amber-300/30"
                        >
                            Grafik durdu, koşun kaydedildi.
                        </p>
                    )}
                    <RunnerResult
                        result={s.result}
                        explanations={s.explanations}
                        onAgain={s.restart}
                        onLobby={s.exit}
                        lobbyLabel={exitLabel}
                        busy={s.busy}
                        guest={guest}
                        share={!embedded}
                        onLogin={onLogin}
                        onShop={onShop}
                    />
                </div>
            )}
        </div>
    );
};

export default RunnerStage;
