import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion, vibrate } from '../../../components/game/gameUtils';
import { isCoarsePointer } from '../../../components/game/runner/runnerUtils';
import { createSpeaker } from '../../../components/game/speech';
import { createAnnouncer } from '../../../components/game/kesif/kesifAnnouncer';
import { normalizeKesifSettings, sanitizePatch } from '../../../components/game/kesif/kxSettings';
import { cleanWorldCode } from '../../../components/game/kesif/kesifUtils';
import { createHudStore } from '../../../game/kesif/hudStore.js';
import { loadKesifEngine } from './engineLoader';
import useKesifEngine from './useKesifEngine';
import { createPanelApi } from './kesifPanelApi';
import {
    classifyEngineError,
    createVersionStore,
    deathInfoFrom,
    initialSettings,
    loadSaveStorage,
    pickStats,
    saveFailText,
    saveSettings,
    victoryStatsFrom,
    worldCodeOf,
    zoneIndexOf,
} from './kesifSessionUtils';
import useKesifMapFlow from './useKesifMapFlow';
import useKesifCosmetics from './useKesifCosmetics';

/*
 * Herkesler Keşfediyor oturum kancası. SPA oyun sayfası ve gömülü mod (embed) ortak kullanır;
 * yönlendirme bilmez: çıkış `onExit`, titreşim `onHaptic`, sonuç `onResult`, giriş `onLogin`.
 *
 * Motor ömrü bir efektte: modül yüklenir -> WebGL denetimi -> kayıt/harita hazırlanır ->
 * createKesifGame -> start. `cancelled` bayrağı StrictMode'un çift bağlamasını ve sayfadan
 * çıkışı korur (geç gelen motor hemen destroy edilir). Geri çağrılar ref'ler üzerinden
 * çalışır; React yeniden çizince motor yeniden kurulmaz.
 *
 * Aşamalar (phase): loading -> running | nowebgl | error | ctxlost. Duraklatma, ölüm, panel
 * ve zafer HUD'un `ui` alanından okunur (hudStore); sayfa ayrıca durum tutmaz.
 *
 * Kayıt: macera kaydı her `onSave`'de yerel yuvaya (IndexedDB/localStorage), üyeler için ayrıca
 * kısıtlı bulut kaydına; hata sessizdir. Ödül: motorun `reward` olayı sunucuya `claim` edilir,
 * motora `markRewardClaimed(key)` ile bildirilir. İnşa modunda kayıt = haritayı sunucuya yazmak.
 */

export const PHASES = ['loading', 'running', 'nowebgl', 'error', 'ctxlost'];

const HAPTIC_GAP_MS = 70;
const HAPTIC_PATTERNS = { light: 10, medium: 20, heavy: [30, 20, 40], success: [15, 40, 25], warning: [25, 40, 25], error: [40, 30, 60], selection: 6 };
const NOISY_EVENTS = { inventoryChanged: 1, uiChanged: 1, saved: 1, reward: 1 };

const safe = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

const now = () => Date.now();

function defaultHaptic(style) {
    const p = HAPTIC_PATTERNS[style];
    if (p != null) vibrate(p);
}

const MODE_LABEL = { macera: 'Dünya hazırlanıyor', insa: 'İnşa alanı hazırlanıyor', harita: 'Harita yükleniyor' };
export const loadingLabel = (mode) => MODE_LABEL[mode] || MODE_LABEL.macera;

// Panel/ayar açıkken oyun dışı sayılan ui değerleri.
// (enchant/brew: Büyü Masası ve Simya Kazanı panelleri; machine: Teknoloji makine paneli; eksik olunca Android geri tuşu onları kapatamazdı)
// (Neon Meridyen: dialogue/vendor/garage/photo; closeUi → uiChanged 'none' ile cityNpc diyaloğu/satıcıyı, cityPhoto foto modunu kapatır)
const PANEL_UI = {
  inventory: 1, crafting: 1, build: 1, map: 1, journal: 1, chest: 1, shop: 1, enchant: 1, brew: 1, machine: 1,
  dialogue: 1, vendor: 1, garage: 1, photo: 1,
};

export default function useKesifSession({
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
    accessibility = false,
    embedded = false,
    loadEngine = loadKesifEngine,
    loadStorage = loadSaveStorage,
}) {
    const [attempt, setAttempt] = useState(0);
    const [phase, setPhaseState] = useState('loading');
    const [message, setMessage] = useState('');
    const [retryable, setRetryable] = useState(false);
    const [needsLogin, setNeedsLogin] = useState(false);
    const [progress, setProgress] = useState({ value: 0, label: '' });
    const [settings, setSettingsState] = useState(() => initialSettings({ muted: initialMuted, music: initialMusic, accessibility }));
    const [info, setInfo] = useState({ worldCode: '', worldName: '', lostCount: 0, deathInfo: null, victoryStats: null, abilityStatus: null, gyroSupported: true });
    const [touch, setTouch] = useState(isCoarsePointer);
    const [announce, setAnnounce] = useState('');
    const [mapMeta, setMapMetaState] = useState(null);
    const [cloudState, setCloudState] = useState('idle');
    const [exitConfirm, setExitConfirm] = useState(false);
    const [reducedMotion] = useState(prefersReducedMotion);
    const [hudStore] = useState(() => createHudStore());
    const [announcer] = useState(() => createAnnouncer());
    const [versionStore] = useState(() => createVersionStore());

    const gameRef = useRef(null);
    const inputRef = useRef(null);
    const phaseRef = useRef('loading');
    const entryRef = useRef(entry);
    const apiRef = useRef(api);
    const userRef = useRef(user);
    const memberRef = useRef(Boolean(user));
    const avatarRef = useRef(avatar);
    const settingsRef = useRef(settings);
    const mapMetaRef = useRef(null);
    const mapCacheRef = useRef(null);
    const resumeRef = useRef(null);
    const storageRef = useRef(null);
    const slotRef = useRef(null);
    const lastSaveRef = useRef({ at: 0, seq: 0 });
    const countersRef = useRef({ puzzles: 0, zone: 0, bosses: 0, crystals: 0, victory: false });
    const claimerRef = useRef(null);
    const trackerRef = useRef(null);
    const cloudRef = useRef(null);
    const speakerRef = useRef(null);
    const mountedRef = useRef(false);
    const leavingRef = useRef(false);
    const explicitExitRef = useRef(false);
    const lastHapticRef = useRef(0);
    const recoverRef = useRef(null);
    const warnedRef = useRef({});
    const onExitRef = useRef(onExit);
    const onHapticRef = useRef(onHaptic);
    const onResultRef = useRef(onResult);
    const onSettingsRef = useRef(onSettings);
    const onLoginRef = useRef(onLogin);
    const touchRef = useRef(touch);

    const a11y = Boolean(accessibility) || settings.accessibility === true;
    const a11yRef = useRef(a11y);

    useEffect(() => {
        onExitRef.current = onExit;
        onHapticRef.current = onHaptic;
        onResultRef.current = onResult;
        onSettingsRef.current = onSettings;
        onLoginRef.current = onLogin;
        apiRef.current = api;
        userRef.current = user;
        memberRef.current = Boolean(user);
        touchRef.current = touch;
    }, [onExit, onHaptic, onResult, onSettings, onLogin, api, user, touch]);

    const setPhase = useCallback((next) => {
        phaseRef.current = next;
        setPhaseState(next);
    }, []);

    const setMapMeta = useCallback((m) => {
        mapMetaRef.current = m;
        setMapMetaState(m);
    }, []);

    const mapFlow = useKesifMapFlow({ gameRef, apiRef, memberRef, mapMetaRef, setMapMeta });
    // Mağaza görünümleri (Keşif Koleksiyonu): üye için arka planda bir kez okunur; oyun başlangıcını bekletmez, geç gelirse canlı uygulanır.
    const cosmeticsRef = useKesifCosmetics({ api, member: Boolean(user), gameRef });

    // Gövde kaydırması / çekip yenileme kapalı; çıkışta geri alınır.
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

    // Erişilebilirlik: seslendirme (web speechSynthesis ya da native TTS köprüsü).
    useEffect(() => {
        a11yRef.current = a11y;
        speakerRef.current?.cancel();
        speakerRef.current = a11y ? createSpeaker() : null;
        return () => {
            speakerRef.current?.cancel();
            speakerRef.current = null;
        };
    }, [a11y]);

    // Ekran okuyucu: duyuru kuyruğuna eklenen her yeni sessiz olmayan duyuru okunur.
    useEffect(() => {
        let lastId = 0;
        return announcer.subscribe(() => {
            const items = announcer.get();
            const last = items[items.length - 1];
            if (!last || last.id === lastId || last.quiet) return;
            lastId = last.id;
            setAnnounce(`${last.text}${last.sub ? `. ${last.sub}` : ''}`);
        });
    }, [announcer]);

    // Karakter canlı güncellenir (embed: native setAvatar).
    useEffect(() => {
        avatarRef.current = avatar;
        safe(() => gameRef.current?.setAvatar?.(avatar));
    }, [avatar]);

    const tell = useCallback(
        (text, key) => {
            // Kullanıcıya bir kez gösterilen kısa bildirim (kayıt hatası vb.).
            if (key) {
                if (warnedRef.current[key]) return;
                warnedRef.current[key] = true;
            }
            announcer.push({ kind: 'info', text, sub: '' });
        },
        [announcer]
    );

    /* ---------------------------------------------------------------- */
    /* Kayıt                                                             */
    /* ---------------------------------------------------------------- */

    const persistLocal = useCallback(
        async (save) => {
            const st = storageRef.current;
            const slot = slotRef.current;
            if (!st || !slot) return true;
            try {
                const r = await st.mod.saveToSlot(st.adapter, slot, save);
                if (!r.ok) {
                    tell(saveFailText(r.code), `save-${r.code}`);
                    return false;
                }
                return true;
            } catch {
                tell(saveFailText('storage'), 'save-storage');
                return false;
            }
        },
        [tell]
    );

    /** Motorun onSave'i (otomatik/elle/çıkış). Söz: kayıt başarılı mı. */
    const handleSave = useCallback(
        async (payload) => {
            const save = payload?.save;
            if (!save || typeof save !== 'object') return false;
            lastSaveRef.current = { at: now(), seq: lastSaveRef.current.seq + 1 };
            const mode = entryRef.current.mode;
            // Bağlam kaybında bu duruma dönülür.
            resumeRef.current = { ...(resumeRef.current || {}), save: mode === 'macera' ? save : undefined, slot: slotRef.current || undefined };
            if (mode !== 'macera') return true;
            const reason = payload.reason === 'manual' || payload.reason === 'exit' ? payload.reason : 'auto';
            const local = await persistLocal(save);
            let cloud = false;
            if (memberRef.current && cloudRef.current) cloud = await cloudRef.current.push(save, reason);
            return local || cloud;
        },
        [persistLocal]
    );

    /* ---------------------------------------------------------------- */
    /* Olaylar                                                           */
    /* ---------------------------------------------------------------- */

    const emitResult = useCallback((final = false) => {
        const g = gameRef.current;
        const stats = pickStats(g ? safe(() => g.getStats?.()) : null, countersRef.current);
        const cb = onResultRef.current;
        if (cb) safe(() => cb({ ...stats, mode: entryRef.current.mode, final }));
    }, []);

    const handleEvent = useCallback(
        (evt) => {
            if (!evt || typeof evt !== 'object') return;
            const c = countersRef.current;
            switch (evt.type) {
                case 'inventoryChanged':
                case 'uiChanged':
                    versionStore.bump();
                    return;
                case 'reward':
                    if (claimerRef.current) claimerRef.current.claim(evt.key);
                    return;
                case 'puzzleSolved':
                    c.puzzles += 1;
                    break;
                case 'crystal':
                    c.crystals += 1;
                    break;
                case 'bossDefeated':
                    c.bosses += 1;
                    break;
                case 'zoneEnter':
                case 'zoneUnlocked': {
                    const z = zoneIndexOf(evt);
                    if (z !== null && z > c.zone) {
                        c.zone = z;
                        if (evt.type === 'zoneUnlocked') emitResult(false);
                    }
                    break;
                }
                case 'death': {
                    const d = deathInfoFrom(evt);
                    setInfo((i) => ({ ...i, deathInfo: d.reason, lostCount: d.lostCount }));
                    break;
                }
                case 'victory': {
                    c.victory = true;
                    const g = gameRef.current;
                    const stats = victoryStatsFrom(evt.stats, g ? safe(() => g.getStats?.()) : null, c);
                    const summary = g ? safe(() => g.getSaveSummary?.()) : null;
                    setInfo((i) => ({ ...i, victoryStats: stats, worldName: (summary && summary.name) || i.worldName }));
                    emitResult(false);
                    break;
                }
                case 'saved':
                    return;
                default:
                    break;
            }
            if (!NOISY_EVENTS[evt.type]) announcer.push(evt);
        },
        [announcer, versionStore, emitResult]
    );

    const handleHud = useCallback(
        (h) => {
            hudStore.set(h);
        },
        [hudStore]
    );

    const handleHaptic = useCallback((style) => {
        const t = now();
        if (style !== 'heavy' && t - lastHapticRef.current < HAPTIC_GAP_MS) return;
        lastHapticRef.current = t;
        const fn = onHapticRef.current;
        safe(() => (typeof fn === 'function' ? fn(style) : defaultHaptic(style)));
    }, []);

    const handleSpeak = useCallback((text) => {
        if (a11yRef.current && speakerRef.current && typeof text === 'string' && text) speakerRef.current.speak(text);
    }, []);

    const handleReady = useCallback(() => {
        if (phaseRef.current !== 'loading') return;
        setPhase('running');
        announcer.begin(); // başlangıç sakinliği: ilk ~6 sn düşük öncelikli duyurular yığılmaz
        lastSaveRef.current = { ...lastSaveRef.current, at: now() };
        const g = gameRef.current;
        if (g) {
            const code = worldCodeOf(g);
            const summary = safe(() => g.getSaveSummary?.());
            setInfo((i) => ({ ...i, worldCode: cleanWorldCode(code) || code || i.worldCode, worldName: (summary && summary.name) || i.worldName }));
        }
        const inp = inputRef.current;
        if (inp && typeof inp.isTouch === 'boolean') setTouch(inp.isTouch);
        safe(() => containerRef?.current?.focus({ preventScroll: true }));
        // Sunucu ödül kapısı: macera oyun oturumu (üye; fire-and-forget, hatalar sessiz, yeniden denenir).
        if (entryRef.current.mode === 'macera' && memberRef.current) safe(() => trackerRef.current?.begin());
        // Üye: zaten alınmış ödülleri motora bildir (gereksiz 409 turu olmasın).
        const a = apiRef.current;
        if (memberRef.current && a && typeof a.overview === 'function' && g && typeof g.markRewardClaimed === 'function') {
            Promise.resolve(safe(() => a.overview())).then(
                (d) => {
                    if (gameRef.current === g && Array.isArray(d?.claimed)) d.claimed.forEach((k) => safe(() => g.markRewardClaimed(k)));
                },
                () => {}
            );
        }
    }, [setPhase, containerRef, announcer]);

    const handleEngineError = useCallback(
        (err) => {
            const cur = phaseRef.current;
            if (cur === 'nowebgl' || cur === 'error' || cur === 'ctxlost') return;
            const g = gameRef.current;
            const mode = entryRef.current.mode;
            if (g && cur === 'running') {
                // Ilerlemeyi kurtar: macera kaydı yerel + bulut, inşa haritası bellekte.
                if (mode === 'macera') {
                    const s = safe(() => g.save());
                    if (s && typeof s === 'object') handleSave({ save: s, reason: 'manual' });
                } else if (mode === 'insa') {
                    const res = safe(() => g.exportMap());
                    if (res && typeof res.then !== 'function' && (res.map || res.chunks)) resumeRef.current = { mapData: res.map || res };
                }
                safe(() => g.pause());
            }
            const kind = classifyEngineError(err);
            if (kind === 'webgl') {
                setMessage('Bu tarayıcıda 3D grafik (WebGL 2) kullanılamıyor. Donanım hızlandırmayı açıp ya da güncel bir tarayıcıyla tekrar dene. iOS kullanıyorsan iOS 15 veya üstüne güncelle.');
                setRetryable(false);
                setPhase('nowebgl');
            } else if (kind === 'contextlost') {
                const recoverable = Boolean(err && err.recoverable && g && cur === 'running');
                setMessage(
                    recoverable
                        ? 'Grafik bağlamı kayboldu. Geri gelirse oyun kendiliğinden devam eder; gelmezse "Yeniden dene". İlerlemen saklandı.'
                        : 'Grafik bağlamı kayboldu (ekran kartı sürücüsü ya da bellek). İlerlemen saklandı; yeniden deneyince kaldığın yerden devam edersin.'
                );
                setRetryable(true);
                setPhase('ctxlost');
                // Motor bağlamı geri alırsa (kare sayacı yeniden artar) panel kapanır; oyun duraklat menüsünde bekler.
                if (recoverable && typeof g.getStats === 'function') {
                    const frames0 = safe(() => g.getStats().frames) || 0;
                    let tries = 0;
                    clearInterval(recoverRef.current);
                    recoverRef.current = setInterval(() => {
                        tries += 1;
                        const f = safe(() => g.getStats().frames);
                        if (gameRef.current !== g || phaseRef.current !== 'ctxlost' || tries > 30) {
                            clearInterval(recoverRef.current);
                        } else if (typeof f === 'number' && f > frames0 + 20) {
                            clearInterval(recoverRef.current);
                            setPhase('running');
                        }
                    }, 1000);
                }
            } else if (cur === 'loading') {
                setMessage('Oyun yüklenemedi. Bağlantını kontrol edip tekrar dene.');
                setRetryable(true);
                setPhase('error');
            } else {
                setMessage('Oyun beklenmedik şekilde durdu. İlerlemen saklandı; yeniden başlatabilir ya da çıkabilirsin.');
                setRetryable(true);
                setPhase('error');
            }
        },
        [handleSave, setPhase]
    );

    /* ---------------------------------------------------------------- */
    /* Motor yaşam döngüsü                                               */
    /* ---------------------------------------------------------------- */

    const emitResultRef = useRef(emitResult);
    useEffect(() => {
        emitResultRef.current = emitResult;
    }, [emitResult]);

    const handleExitRef = useRef(null);

    useKesifEngine({
        attempt,
        containerRef,
        loadEngine,
        loadStorage,
        reducedMotion,
        announcer,
        refs: { entryRef, memberRef, userRef, apiRef, avatarRef, cosmeticsRef, settingsRef, a11yRef, resumeRef, mapCacheRef, storageRef, slotRef, mapMetaRef, gameRef, inputRef, phaseRef, claimerRef, trackerRef, cloudRef, explicitExitRef, mountedRef, exitRef: handleExitRef },
        handlers: { handleHud, handleEvent, handleSave, handleHaptic, handleSpeak, handleReady, handleEngineError },
        setters: { setPhase, setMessage, setRetryable, setNeedsLogin, setProgress, setMapMeta, setCloudState },
    });

    useEffect(
        () => () => {
            clearInterval(recoverRef.current);
            mountedRef.current = false;
        },
        []
    );

    /* ---------------------------------------------------------------- */
    /* Eylemler                                                          */
    /* ---------------------------------------------------------------- */

    const focusStage = useCallback(() => {
        safe(() => containerRef?.current?.focus({ preventScroll: true }));
    }, [containerRef]);

    const uiNow = useCallback(() => hudStore.get().ui, [hudStore]);

    const pause = useCallback(() => {
        const g = gameRef.current;
        if (!g || phaseRef.current !== 'running' || uiNow() !== 'none') return;
        safe(() => g.pause());
    }, [uiNow]);

    const resume = useCallback(() => {
        const g = gameRef.current;
        if (!g) return;
        safe(() => g.resume());
        // Düğme tıklaması bir kullanıcı jestidir: fare yakalaması geri alınır (masaüstü).
        if (!touchRef.current) safe(() => inputRef.current?.requestPointerLock?.());
        focusStage();
    }, [focusStage]);

    /** Çıkış: bekleyen bulut kaydı kısa süre beklenir, sonuç köprüye bildirilir, sonra üst katman çıkar. */
    const leave = useCallback(async () => {
        if (leavingRef.current) return;
        leavingRef.current = true;
        explicitExitRef.current = true;
        setExitConfirm(false);
        const cloud = cloudRef.current;
        if (cloud && cloud.hasPending()) await cloud.flush(2500);
        if (phaseRef.current === 'running') emitResultRef.current(true);
        safe(() => onExitRef.current?.());
    }, []);
    useEffect(() => {
        handleExitRef.current = leave;
    }, [leave]);

    /** Elle kaydet. Macera: yerel + bulut. İnşa: harita sunucuya (var olan güncellenir, yoksa form açılır). */
    const save = useCallback(async () => {
        const g = gameRef.current;
        if (!g) return false;
        const mode = entryRef.current.mode;
        if (mode === 'harita') return true;
        if (mode === 'insa') {
            if (!memberRef.current) {
                mapFlow.setDialog({ kind: 'login', why: 'save' });
                return false;
            }
            if (mapMetaRef.current) return mapFlow.saveExisting();
            await mapFlow.start('private');
            return true;
        }
        const before = lastSaveRef.current.seq;
        const result = await Promise.resolve(safe(() => g.save()));
        // Motor onSave'i kendisi tetiklediyse tekrar yazma; tetiklemediyse dönen kaydı yaz.
        if (lastSaveRef.current.seq !== before) return true;
        if (result && typeof result === 'object') return handleSave({ save: result, reason: 'manual' });
        return false;
    }, [handleSave, mapFlow]);

    const saveAndLeave = useCallback(async () => {
        if (entryRef.current.mode !== 'harita') await save();
        leave();
    }, [save, leave]);

    const requestExit = useCallback(() => {
        if (phaseRef.current !== 'running') {
            leave();
            return;
        }
        setExitConfirm(true);
    }, [leave]);

    /** Tarayıcı geri hareketi / native geri tuşu: açık pencere kapanır, oyunda menü, menüde çıkış onayı. */
    const handleBack = useCallback(() => {
        if (mapFlow.dialog) {
            mapFlow.close();
            return true;
        }
        if (exitConfirm) {
            setExitConfirm(false);
            return true;
        }
        if (phaseRef.current !== 'running') {
            leave();
            return true;
        }
        const ui = uiNow();
        if (ui === 'none') pause();
        else if (PANEL_UI[ui]) safe(() => gameRef.current?.closeUi());
        else if (ui === 'pause' || ui === 'victory') setExitConfirm(true);
        // Ölüm ekranında geri: yanlışlıkla çıkış olmasın.
        return true;
    }, [mapFlow, exitConfirm, leave, pause, uiNow]);

    const retry = useCallback(() => {
        if (phaseRef.current === 'loading') return;
        leavingRef.current = false;
        setMessage('');
        setProgress({ value: 0, label: '' });
        hudStore.reset();
        setPhase('loading');
        setAttempt((n) => n + 1);
    }, [hudStore, setPhase]);

    const changeSettings = useCallback((patch) => {
        const clean = sanitizePatch(patch);
        const keys = Object.keys(clean);
        if (!keys.length) return;
        const next = normalizeKesifSettings({ ...settingsRef.current, ...clean });
        settingsRef.current = next;
        setSettingsState(next);
        saveSettings(next);
        const g = gameRef.current;
        if (g) {
            if ('muted' in clean) safe(() => g.setMuted(clean.muted));
            if ('music' in clean) safe(() => g.setMusicEnabled?.(clean.music));
            safe(() => g.setSettings?.(clean));
        }
        if (('muted' in clean || 'music' in clean) && onSettingsRef.current) safe(() => onSettingsRef.current({ muted: next.muted, music: next.music }));
    }, []);

    // Native'den gelen ses tercihi: motora uygulanır, geri bildirilmez.
    const applyExternalAudio = useCallback((patch) => {
        const next = normalizeKesifSettings({ ...settingsRef.current, ...patch });
        settingsRef.current = next;
        setSettingsState(next);
        const g = gameRef.current;
        if (g) {
            if ('muted' in patch) safe(() => g.setMuted(patch.muted));
            if ('music' in patch) safe(() => g.setMusicEnabled?.(patch.music));
        }
    }, []);
    const setMuted = useCallback((v, notify = true) => (notify ? changeSettings({ muted: Boolean(v) }) : applyExternalAudio({ muted: Boolean(v) })), [changeSettings, applyExternalAudio]);
    const setMusic = useCallback((v, notify = true) => (notify ? changeSettings({ music: Boolean(v) }) : applyExternalAudio({ music: Boolean(v) })), [changeSettings, applyExternalAudio]);

    const login = useCallback(() => {
        const fn = onLoginRef.current;
        if (fn) safe(() => fn());
    }, []);

    // Oyun penceresi/sekme arka plana gidince duraklat (motor da kendini durdurur; menü açık beklesin).
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

    // Kaydedilmemiş ilerleme varken sekme kapatılırsa tarayıcı uyarır (yalnız SPA).
    useEffect(() => {
        if (embedded) return undefined;
        const onBeforeUnload = (ev) => {
            if (phaseRef.current !== 'running' || explicitExitRef.current) return;
            const mode = entryRef.current.mode;
            const unsaved = mode === 'insa' ? memberRef.current : mode === 'macera' && now() - lastSaveRef.current.at > 20000;
            if (!unsaved) return;
            ev.preventDefault();
            ev.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [embedded]);

    // J: görev günlüğünü aç/kapat (masaüstü; macera). Motor Esc/E/Tab'ı kendisi yönetir.
    useEffect(() => {
        const onKey = (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'j' && e.key !== 'J')) return;
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            if (phaseRef.current !== 'running' || entryRef.current.mode !== 'macera') return;
            const ui = hudStore.get().ui;
            const g = gameRef.current;
            if (!g) return;
            if (ui === 'none' && (typeof g.openJournal === 'function' || typeof g.openUi === 'function' || typeof g.openPanel === 'function')) {
                e.preventDefault();
                if (typeof g.openJournal === 'function') safe(() => g.openJournal());
                else if (typeof g.openUi === 'function') safe(() => g.openUi('journal'));
                else safe(() => g.openPanel('journal'));
            } else if (ui === 'journal') {
                e.preventDefault();
                safe(() => g.closeUi());
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [hudStore]);

    // Motor cephesi: paneller sabit bir nesneyle konuşur, motor ref'te değişse de yeniden bağlanmaz.
    // eslint-disable-next-line react-hooks/refs -- ref yalnızca çağrı anında (olay/efekt) okunur, çizimde değil
    const panelApi = useMemo(() => createPanelApi(() => gameRef.current), []);

    const press = useCallback((name, down) => {
        const g = gameRef.current;
        if (g && typeof g.pressButton === 'function') return g.pressButton(name, down);
        const inp = inputRef.current;
        if (inp && typeof inp.pressButton === 'function') return inp.pressButton(name, down);
        return false;
    }, []);

    const openUi = useCallback(
        (name, direct, button) => {
            const g = gameRef.current;
            if (!g) return;
            if (direct && typeof g[direct] === 'function') safe(() => g[direct]());
            else if (typeof g.openUi === 'function') safe(() => g.openUi(name));
            else if (typeof g.openPanel === 'function') safe(() => g.openPanel(name));
            else if (button) {
                press(button, true);
                press(button, false);
            }
        },
        [press]
    );

    const hasOpenJournal = useCallback(() => {
        const g = gameRef.current;
        return Boolean(g && (typeof g.openJournal === 'function' || typeof g.openUi === 'function' || typeof g.openPanel === 'function'));
    }, []);

    const publishMap = useCallback(() => {
        if (entryRef.current.mode !== 'insa') return false;
        mapFlow.start('public');
        return true;
    }, [mapFlow]);

    // Paylaşılan haritayı oynarken raporla (Play UGC kuralı: içerik oyun içinden de bildirilebilir). Üye gerekir.
    const member = Boolean(user);
    const reportMap = useCallback(async (reason) => {
        const e = entryRef.current;
        const a = apiRef.current;
        if (!e || e.mode !== 'harita' || !e.mapId || !a || typeof a.report !== 'function') return false;
        try {
            await a.report(e.mapId, { reason });
            return true;
        } catch {
            return false;
        }
    }, []);

    // HUD'a verilen eylemler: kimlikleri sabit (HUD memo'lu).
    const hudActions = useMemo(
        () => ({
            pause,
            resume,
            save,
            exit: leave,
            respawn: () => safe(() => gameRef.current?.respawn()),
            continuePlaying: () => safe(() => gameRef.current?.closeUi()),
            closeUi: () => safe(() => gameRef.current?.closeUi()),
            publishMap,
            reportMap: member ? reportMap : undefined,
            // İnşa: haritanın günün saati ('gündüz' | 'gün batımı' | 'gece'); dışa aktarılan haritaya yazılır.
            setMapTime: (name) => safe(() => gameRef.current?.setMapTime?.(name)) ?? null,
            changeSettings,
            openInventory: () => safe(() => gameRef.current?.toggleInventory()),
            openCrafting: () => safe(() => gameRef.current?.toggleCrafting()),
            openMap: () => openUi('map', 'openMap', 'map'),
            openJournal: () => openUi('journal', 'openJournal', null),
            toggleCamera: () => {
                const g = gameRef.current;
                if (!g) return;
                const cur = hudStore.get().cameraMode;
                if (typeof g.setCameraMode === 'function') safe(() => g.setCameraMode(cur === 'fp' ? 'tp' : 'fp'));
                else press('camera', true);
            },
            selectHotbar: (i) => safe(() => gameRef.current?.selectHotbar(i)),
            pressButton: press,
            getPuzzleHint: () => safe(() => gameRef.current?.getPuzzleHint?.()) ?? null,
        }),
        [pause, resume, save, leave, publishMap, member, reportMap, changeSettings, openUi, press, hudStore]
    );

    const actions = useMemo(
        () => ({
            pause,
            resume,
            save,
            saveAndLeave,
            exit: requestExit,
            leave,
            retry,
            login,
            setMuted,
            setMusic,
            handleBack,
            getPhase: () => phaseRef.current,
            isPausedNow: () => uiNow() === 'pause',
            hasOpenJournal,
        }),
        [pause, resume, save, saveAndLeave, requestExit, leave, retry, login, setMuted, setMusic, handleBack, uiNow, hasOpenJournal]
    );

    return {
        phase,
        message,
        retryable,
        needsLogin,
        progress,
        mode: entry.mode,
        member: Boolean(user),
        settings,
        info,
        touch,
        announce,
        mapMeta,
        cloudState,
        exitConfirm,
        setExitConfirm,
        reducedMotion,
        accessibility: a11y,
        hudStore,
        announcer,
        versionStore,
        panelApi,
        inputRef,
        hudActions,
        actions,
        mapFlow,
    };
}
