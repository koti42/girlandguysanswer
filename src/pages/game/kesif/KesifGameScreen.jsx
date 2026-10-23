import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import KesifHud from '../../../components/game/kesif/KesifHud';
import InventoryPanel from '../../../components/game/kesif/InventoryPanel';
import CraftingPanel from '../../../components/game/kesif/CraftingPanel';
import BuildPalette from '../../../components/game/kesif/BuildPalette';
import ChestPanel from '../../../components/game/kesif/ChestPanel';
import EnchantPanel from '../../../components/game/kesif/EnchantPanel';
import BrewPanel from '../../../components/game/kesif/BrewPanel';
import MachinePanel from '../../../components/game/kesif/MachinePanel';
import MapScreen from '../../../components/game/kesif/MapScreen';
import JournalPanel from '../../../components/game/kesif/JournalPanel';
import LoadingOverlay from '../../../components/game/kesif/city/LoadingOverlay';
import LockPanelHost from '../../../components/game/kesif/city/LockPanelHost';
import GaragePanel from '../../../components/game/kesif/city/GaragePanel';
import DialogueSheet from '../../../components/game/kesif/city/DialogueSheet';
import CityPanelHost from '../../../components/game/kesif/city/CityPanelHost';
import VendorPanel from '../../../components/game/kesif/city/VendorPanel';
import PhotoOverlay from '../../../components/game/kesif/city/PhotoOverlay';
import CityMap from '../../../components/game/kesif/city/CityMap';
import KesifMapDialogs from './KesifMapDialogs';
import { ExitConfirm, FullscreenButton, LoadingScreen, OrientationHint, PointerLockHint, StatusPanel } from './KesifOverlays';
import useKesifSession from './useKesifSession';
import '../../../components/game/kesif/kesif.css';
import './kesifPlay.css';

/*
 * Herkesler Keşfediyor oyun ekranı (tam ekran katman). SPA sayfası ve gömülü mod aynı bileşeni
 * kullanır; yönlendirme bilmez (çıkış onExit, giriş onLogin).
 *
 * Katmanlar (alttan üste): sahne (motor tuvali) -> HUD (+ duraklat/ölüm/zafer katmanları) -> paneller
 * (hud.ui'ye göre: envanter, üretim, inşa paleti, sandık, harita, günlük) -> yükleme / durum panelleri
 * -> pencereler (çıkış onayı, harita kaydet/yayınla, hak al, giriş çağrısı).
 *
 * Props:
 *  entry          { mode, seed, mapId, saveId, base } (kesifUtils.buildEntry)
 *  user, avatar   oturum sahibi (misafir: null) ve karakter yapılandırması
 *  api            kesifApi biçiminde istemci (SPA: services/kesifApi, embed: embedApi.kesif)
 *  onExit/onHaptic/onResult/onLogin/onOpenMaps   üst katmana bildirimler
 *  embedded       gömülü mod (çıkış metni, tam ekran düğmesi yok)
 *  historyGuard   tarayıcı geri hareketi = duraklat / çıkış onayı (SPA)
 *  initialMuted/initialMusic/onSettings   tercihler native'de ise (embed)
 *  sessionRef     oturuma dışarıdan erişim: { actions: pause/resume/handleBack/setMuted/setMusic/getPhase… }
 *  accessibility  erişilebilirlik modu (seslendirme, büyük yazı)
 */

const GUARD_STATE = 'kesifGuard';

const pushGuard = () => {
    // idx / key alanları korunur: React Router'ın geçmiş sırası bozulmasın.
    window.history.pushState({ ...(window.history.state || {}), [GUARD_STATE]: true }, '');
};

/** hud.ui'ye göre envanter sınıfı paneller (duraklat/ölüm/zafer HUD'un kendi katmanlarıdır). */
const PanelHost = ({ store, versionStore, panelApi, onClose, avatar, gender, accessibility, reducedMotion }) => {
    const ui = useSyncExternalStore(store.subscribe, () => store.get().ui, () => 'none');
    const dim = useSyncExternalStore(store.subscribe, () => store.get().dim, () => 'overworld');
    const version = useSyncExternalStore(versionStore.subscribe, versionStore.get, versionStore.get);
    const common = { api: panelApi, onClose, version, accessibility, reducedMotion };
    // Envanter ve Üret tek çalışma alanının sekmeleridir: sekme değişimi motorun paneli değiştirmesiyle olur (E / R ile aynı).
    const onSwitch = useCallback((name) => panelApi.openUi(name), [panelApi]);
    switch (ui) {
        case 'inventory':
            return <InventoryPanel {...common} onSwitch={onSwitch} avatar={avatar} gender={gender} />;
        case 'crafting':
            return <CraftingPanel {...common} onSwitch={onSwitch} />;
        case 'build':
            return <BuildPalette {...common} />;
        case 'chest':
            return <ChestPanel {...common} />;
        case 'enchant':
            return <EnchantPanel {...common} />;
        case 'brew':
            return <BrewPanel {...common} />;
        case 'machine':
            return <MachinePanel {...common} />;
        case 'map':
            // Neon Meridyen: yalnız bulunmuşları gösteren şehir haritası + hızlı seyahat; ana diyar haritası değişmez
            return dim === 'neon' ? <CityMap {...common} /> : <MapScreen {...common} />;
        case 'photo':
            return <PhotoOverlay {...common} />;
        case 'journal':
            return <JournalPanel {...common} />;
        case 'garage':
            return <GaragePanel {...common} />;
        case 'dialogue':
            // şehir kilit / çözme / asansör panelleri (systems/cityLocks) ve NPC diyalogu (systems/cityNpc): her host görüntü yokken hiçbir şey çizmez
            return (
                <>
                    <LockPanelHost api={panelApi} onClose={onClose} accessibility={accessibility} reducedMotion={reducedMotion} />
                    <DialogueSheet api={panelApi} onClose={onClose} accessibility={accessibility} reducedMotion={reducedMotion} />
                    <CityPanelHost api={panelApi} onClose={onClose} accessibility={accessibility} reducedMotion={reducedMotion} />
                </>
            );
        case 'vendor':
            return <VendorPanel {...common} />;
        default:
            return null;
    }
};

/** Çocuğu yalnızca hud.ui === 'none' iken (oyun sürerken) çizer. */
const WhenPlaying = ({ store, children }) => {
    const ui = useSyncExternalStore(store.subscribe, () => store.get().ui, () => 'none');
    return ui === 'none' ? children : null;
};

/** Fare yakalama ipucu yalnızca arayüz kapalıyken (oyun sürerken) etkindir. */
const LockGate = ({ store, touch, stageRef, inputRef, onLockLost }) => {
    const ui = useSyncExternalStore(store.subscribe, () => store.get().ui, () => 'none');
    const request = useCallback(() => {
        const inp = inputRef.current;
        if (inp && typeof inp.requestPointerLock === 'function') inp.requestPointerLock();
        else stageRef.current?.requestPointerLock?.();
    }, [inputRef, stageRef]);
    return <PointerLockHint active={!touch && ui === 'none'} stageRef={stageRef} onRequest={request} onLockLost={onLockLost} />;
};

const KesifGameScreen = ({
    entry,
    user,
    avatar,
    api,
    onExit,
    onHaptic,
    onResult,
    onLogin,
    onOpenMaps,
    embedded = false,
    historyGuard = false,
    initialMuted,
    initialMusic,
    onSettings,
    sessionRef,
    accessibility = false,
    loadEngine,
    loadStorage,
    className = 'fixed inset-0 z-[95] h-[100dvh]',
}) => {
    const rootRef = useRef(null);
    const containerRef = useRef(null);
    const guardRef = useRef(false);
    const s = useKesifSession({
        entry,
        user,
        avatar,
        containerRef,
        api,
        onExit,
        onHaptic,
        onResult,
        onSettings,
        onLogin,
        initialMuted,
        initialMusic,
        accessibility,
        embedded,
        ...(loadEngine ? { loadEngine } : null),
        ...(loadStorage ? { loadStorage } : null),
    });
    const { phase, actions, hudActions, mode } = s;
    const member = s.member;
    const running = phase === 'running';
    const exitLabel = embedded ? 'Oyundan çık' : 'Lobiye dön';

    const phaseRef = useRef(phase);
    const backRef = useRef(actions.handleBack);
    const leaveRef = useRef(actions.leave);
    useEffect(() => {
        phaseRef.current = phase;
        backRef.current = actions.handleBack;
        leaveRef.current = actions.leave;
        // Gömülü mod: native mesajları (back / pause / setMuted) oturuma buradan ulaşır.
        if (sessionRef) sessionRef.current = s;
    });

    // Tarayıcı geri hareketi: oyun başlayınca korumalı bir geçmiş kaydı eklenir; geri hareketi onu tüketir.
    useEffect(() => {
        if (!historyGuard || !running || guardRef.current) return;
        try {
            pushGuard();
            guardRef.current = true;
        } catch {
            // geçmiş API'si kapalı: koruma yok, sorun değil
        }
    }, [historyGuard, running]);

    useEffect(() => {
        if (!historyGuard) return undefined;
        const onPop = () => {
            if (!guardRef.current) return;
            guardRef.current = false;
            if (phaseRef.current === 'running') {
                try {
                    pushGuard();
                    guardRef.current = true;
                } catch {
                    // yut
                }
                backRef.current();
                return;
            }
            leaveRef.current();
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [historyGuard]);

    // Dokunmatik üst çubuğundaki günlük düğmesi yalnızca motor panelini açabiliyorsa çizilir; misafir inşa kaydı yok.
    // Neon Meridyen'de (hud.dim === 'neon') üst çubuğa «Foto» düğmesi eklenir (photo_map: foto modu).
    const cityDim = useSyncExternalStore(s.hudStore.subscribe, () => s.hudStore.get().dim === 'neon', () => false);
    const photoPanel = s.panelApi;
    const hud = useMemo(() => {
        const out = { ...hudActions };
        if (!actions.hasOpenJournal()) delete out.openJournal;
        if (mode === 'insa' && !member) delete out.save;
        if (cityDim) out.openPhoto = () => photoPanel.photoOpen();
        return out;
        // phase: motor hazır olunca (gameRef dolu) yeniden değerlendirilir
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hudActions, actions, mode, member, phase, cityDim, photoPanel]);

    const onLockLost = useCallback(() => actions.pause(), [actions]);
    const closePanel = hudActions.closeUi;
    const mapDialogLogin = useCallback(() => actions.login(), [actions]);
    const gender = user?.gender ?? null;
    const a11y = s.accessibility;
    // "Telefonunu çevir" ipucu dokunmatik HUD'un üst-orta öbeğinde (parkur/boss altı) akışta durur: çip, düğme ve duyurularla çakışmaz.
    const orientHint = useMemo(() => <OrientationHint active={s.touch} />, [s.touch]);

    const stageLabel = s.touch
        ? 'Oyun alanı. Sol yarıda parmağını kaydırarak yürü, sağ yarıda sürükleyerek etrafa bak. Düğmelerle kır, yerleştir, zıpla.'
        : 'Oyun alanı. W A S D ile yürü, fareyle etrafa bak, sol tıkla kır, sağ tıkla yerleştir, E envanter, Esc duraklat.';

    return (
        <div ref={rootRef} className={`${className} kxp-root w-full`} data-a11y={a11y ? '1' : '0'} data-testid="kesif-screen" data-phase={phase}>
            <div
                ref={containerRef}
                tabIndex={-1}
                role="application"
                aria-roledescription="oyun"
                aria-label={stageLabel}
                className="kxp-stage"
                onContextMenu={(e) => e.preventDefault()}
                data-testid="kesif-stage"
            />

            <div className="sr-only" aria-live="polite" aria-atomic="true">
                {s.announce}
            </div>

            {running && (
                <KesifHud
                    store={s.hudStore}
                    actions={hud}
                    touch={s.touch}
                    inputRef={s.inputRef}
                    getMapInfo={s.panelApi.getMapInfo}
                    settings={s.settings}
                    announcer={s.announcer}
                    info={s.info}
                    topSlot={orientHint}
                    driveApi={s.panelApi}
                />
            )}

            {running && (
                <PanelHost
                    store={s.hudStore}
                    versionStore={s.versionStore}
                    panelApi={s.panelApi}
                    onClose={closePanel}
                    avatar={avatar}
                    gender={gender}
                    accessibility={a11y}
                    reducedMotion={s.reducedMotion}
                />
            )}

            {running && <LoadingOverlay store={s.hudStore} reducedMotion={s.reducedMotion} accessibility={a11y} />}

            {running && !embedded && !s.touch && (
                <WhenPlaying store={s.hudStore}>
                    <FullscreenButton targetRef={rootRef} />
                </WhenPlaying>
            )}
            {running && <LockGate store={s.hudStore} touch={s.touch} stageRef={containerRef} inputRef={s.inputRef} onLockLost={onLockLost} />}

            {phase === 'loading' && <LoadingScreen mode={mode} progress={s.progress} onExit={actions.leave} exitLabel="Vazgeç" reducedMotion={s.reducedMotion} />}

            {(phase === 'nowebgl' || phase === 'error' || phase === 'ctxlost') && (
                <StatusPanel
                    kind={phase}
                    message={s.message}
                    retryable={s.retryable}
                    onRetry={actions.retry}
                    onExit={actions.leave}
                    onLogin={s.needsLogin ? actions.login : undefined}
                    exitLabel={exitLabel}
                />
            )}

            <div className="kxp-dialogs">
                {s.exitConfirm && (
                    <ExitConfirm mode={mode} member={member} onSaveExit={actions.saveAndLeave} onExit={actions.leave} onClose={() => s.setExitConfirm(false)} />
                )}
                <KesifMapDialogs flow={s.mapFlow} api={api} embedded={embedded} onLogin={mapDialogLogin} onOpenMaps={onOpenMaps} />
            </div>
        </div>
    );
};

export default KesifGameScreen;
