import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LuCompass, LuDoorOpen, LuHammer, LuLogIn, LuMap, LuMonitorX, LuPlay, LuPlus, LuRotateCcw, LuUsers } from 'react-icons/lu';
import KesifGameScreen from '../pages/game/kesif/KesifGameScreen';
import MapBrowser from '../components/game/kesif/MapBrowser';
import MyMaps from '../components/game/kesif/MyMaps';
import SlotShop from '../components/game/kesif/SlotShop';
import { loadLocalSaves } from '../components/game/kesif/kesifSaves';
import {
    BASES,
    STORAGE_KEYS,
    buildEntry,
    detectWebGL,
    entryForSave,
    formatPlayTime,
    generateWorldCode,
    mergeSaves,
    parseLobbyMode,
    slotLabel,
    storageGet,
} from '../components/game/kesif/kesifUtils';
import { SAFE_AREA_PAD } from '../components/game/runner/runnerUtils';
import { normalizeAvatar } from '../game/avatar/catalog';
import { gameErrorStatus } from '../services/gameErrors';
import { onNativeMessage, postToNative } from './bridge';
import { summarizeKesifResult } from './embedResult';
import { createPauseShield, createPhotoSaver } from './photoBridge';
import '../components/game/kesif/kesifLobby.css';

const CHECK_MS = 4000;
const LOBBY_URL = '/oyun/kesif';

const withTimeout = (p, ms, fallback) =>
    Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((r) => setTimeout(() => r(fallback), ms))]);

const Spinner = ({ label }) => (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-coral border-t-transparent" />
        <span className="text-sm font-semibold text-white/80">{label}…</span>
    </div>
);

const Backdrop = ({ children, scroll = false }) => (
    <div
        className={`fixed inset-0 bg-gradient-to-b from-[#0a1226] via-[#14213f] to-[#1a2440] text-white ${scroll ? 'overflow-y-auto overscroll-contain' : 'flex flex-col items-center justify-center gap-6'} ${SAFE_AREA_PAD}`}
        data-testid="embed-kesif"
    >
        {children}
    </div>
);

/** Ortalanmış durum kartı (kx-* menü stilleri; oyun parçasıyla birlikte yüklenir). */
const Card = ({ icon: Icon, title, children, actions }) => {
    const ref = useRef(null);
    useEffect(() => {
        ref.current?.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    }, []);
    return (
        <div className="kx-root" style={{ position: 'fixed', inset: 0 }}>
            <div className="kx-overlay">
                <div role="alertdialog" aria-modal="true" aria-labelledby="embed-kesif-title" className="kx-card">
                    {Icon && (
                        <span className="kx-dead-ico" aria-hidden="true">
                            <Icon />
                        </span>
                    )}
                    <h2 id="embed-kesif-title" className="kx-h">
                        {title}
                    </h2>
                    {children && <div className="kx-sub">{children}</div>}
                    <div ref={ref} className="kx-stack">
                        {actions}
                    </div>
                </div>
            </div>
        </div>
    );
};

const Btn = ({ icon: Icon, primary = false, quiet = false, onClick, children, disabled }) => (
    <button type="button" className={`kx-btn${primary ? ' kx-btn-primary' : ''}${quiet ? ' kx-btn-quiet' : ''}`} onClick={onClick} disabled={disabled}>
        {Icon && <Icon aria-hidden="true" />} {children}
    </button>
);

/*
 * Oyun oturumu: SPA ile aynı KesifGameScreen + useKesifSession. Çıkış, sonuç, ses tercihleri,
 * titreşim, giriş ve harita bağlantısı native'e köprüyle gider; native'in pause / back / setMuted /
 * setMusic mesajları oturuma uygulanır. Karakter (setAvatar) motorda canlı güncellenir.
 */
const EmbedKesifSession = ({ entry, api, config, avatar, prefs, haptic, guest = false, onExit, onPrefs }) => {
    const sessionRef = useRef(null);
    const member = Boolean(config.token) && !guest;

    const onResult = useCallback((r) => postToNative('result', summarizeKesifResult(r)), []);
    const onSettings = useCallback(
        (v) => {
            onPrefs(v);
            postToNative('settings', v);
        },
        [onPrefs]
    );
    const onLogin = useCallback(() => postToNative('login'), []);
    const onOpenMaps = useCallback(() => postToNative('openUrl', { url: LOBBY_URL }), []);

    // Neon Meridyen foto modu: motorun `kesif:savephoto` olayını native `savePhoto` iletilerine çevirir; native yoksa olay iptal edilmez → motor indirmeye döner.
    useEffect(() => {
        const shield = createPauseShield(window);
        // Uygulama __HS_NATIVE__.photoSave:true ile foto kaydı işleyicisini bildirir; bildirmeyen eski sürümde yanıt beklemesi kısa tutulur.
        const isLegacy = () => !(window.__HS_NATIVE__ && window.__HS_NATIVE__.photoSave === true);
        const saver = createPhotoSaver({ post: postToNative, onMessage: onNativeMessage, shield, isLegacy });
        const onSave = (e) => saver.handler(e, Boolean(window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function'));
        window.addEventListener('kesif:savephoto', onSave);
        return () => {
            window.removeEventListener('kesif:savephoto', onSave);
            shield.dispose();
        };
    }, []);

    useEffect(
        () =>
            onNativeMessage((msg) => {
                const cur = sessionRef.current;
                if (!cur) return;
                const a = cur.actions;
                switch (msg.type) {
                    case 'pause':
                        // Uygulama arka plana gitti: duraklat menüsü açık kalır, oyuncu dönünce kendisi devam eder.
                        a.pause();
                        break;
                    case 'back':
                        // Android geri tuşu: açık pencere kapanır; oyunda menü, menüde çıkış onayı; yükleme/hata ekranında çıkış.
                        a.handleBack();
                        break;
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
        <KesifGameScreen
            entry={entry}
            user={member ? config.user : null}
            avatar={avatar}
            api={api}
            initialMuted={prefs.muted}
            initialMusic={prefs.music}
            accessibility={config.accessibility === true}
            onSettings={onSettings}
            onExit={onExit}
            onHaptic={haptic}
            onResult={onResult}
            onLogin={onLogin}
            onOpenMaps={member ? onOpenMaps : undefined}
            sessionRef={sessionRef}
            embedded
        />
    );
};

/*
 * Topluluk haritaları / haritalarım / harita hakkı (mobil derin bağlantı ?mode=topluluk|slots|haritalarim):
 * lobi bileşenleri gömme içinde çizilir. Oyun buradan başlayınca çıkışta bu ekrana dönülür.
 */
const LobbyView = ({ api, member, tab: initialTab, onPlay, onEdit, onBuild, onExit }) => {
    const [tab, setTab] = useState(initialTab === 'haritalarim' ? 'haritalarim' : 'topluluk');
    const [ov, setOv] = useState({ profile: null, wallet: null });
    const [slotsOpen, setSlotsOpen] = useState(() => member && initialTab === 'slots');

    useEffect(() => {
        if (!member) return undefined;
        let alive = true;
        api.overview().then(
            (d) => alive && setOv({ profile: d?.profile || null, wallet: d?.wallet || null }),
            () => {}
        );
        return () => {
            alive = false;
        };
    }, [api, member]);

    const onChange = useCallback(({ profile, wallet }) => setOv((o) => ({ profile: profile || o.profile, wallet: wallet || o.wallet })), []);
    const slotsText = member && ov.profile ? slotLabel(ov.profile.maps_used, ov.profile.map_slots) : null;
    const tabBtn = (key, label, Icon) => (
        <button
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl px-4 font-bold ${tab === key ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70'}`}
        >
            <Icon aria-hidden="true" /> {label}
        </button>
    );

    return (
        <Backdrop scroll>
            <div className="mx-auto w-full max-w-3xl px-4 py-4">
                <div className="flex items-center gap-2">
                    <h1 className="flex-1 text-xl font-black">Keşif Haritaları</h1>
                    {slotsText && (
                        <span className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/15 px-3 text-sm font-bold" aria-label={`Harita hakkı: ${slotsText}`}>
                            <LuMap aria-hidden="true" /> {slotsText}
                        </span>
                    )}
                    {member && (
                        <button type="button" onClick={() => setSlotsOpen(true)} className="inline-flex min-h-[44px] items-center gap-1 rounded-2xl bg-amber-300 px-3 text-sm font-black text-slate-950">
                            <LuPlus aria-hidden="true" /> Hak al
                        </button>
                    )}
                    <button type="button" onClick={onExit} className="inline-flex min-h-[44px] items-center gap-1 rounded-2xl bg-white/10 px-3 text-sm font-bold">
                        <LuDoorOpen aria-hidden="true" /> Çık
                    </button>
                </div>
                <div role="tablist" aria-label="Bölümler" className="mt-3 flex gap-2">
                    {tabBtn('topluluk', 'Topluluk', LuUsers)}
                    {tabBtn('haritalarim', 'Haritalarım', LuMap)}
                </div>
                <div className="mt-4" role="tabpanel">
                    {tab === 'topluluk' ? (
                        <MapBrowser api={api} member={member} onPlay={onPlay} />
                    ) : (
                        <MyMaps
                            api={api}
                            member={member}
                            profile={ov.profile}
                            onProfile={(p) => setOv((o) => ({ ...o, profile: p }))}
                            onBuySlots={() => (member ? setSlotsOpen(true) : postToNative('login'))}
                            onPlay={onPlay}
                            onEdit={onEdit}
                            onBuild={onBuild}
                        />
                    )}
                </div>
            </div>
            <SlotShop open={slotsOpen} api={api} profile={ov.profile} wallet={ov.wallet} onClose={() => setSlotsOpen(false)} onChange={onChange} />
            <Toaster position="top-center" />
        </Backdrop>
    );
};

const baseFromStorage = () => {
    const saved = storageGet(STORAGE_KEYS.base);
    return BASES.some((b) => b.key === saved) ? saved : BASES[0].key;
};

/**
 * Mobil gömmede Keşif (?game=kesif[&mode=macera|insa|topluluk|slots|haritalarim][&map=ID]).
 * Misafir macera ve inşa denemesini oynar (sunucuya yazılmaz); üye kayıtlı macerasını sürdürür,
 * ödül talep eder, harita yayınlar. WebGL 2 yoksa hiçbir istek atılmaz.
 */
const EmbedKesifInner = ({ config, api, haptic, search }) => {
    const member = Boolean(config.token);
    const client = api.kesif;
    const query = (() => {
        try {
            return new URLSearchParams(search || '');
        } catch {
            return new URLSearchParams('');
        }
    })();
    const rawMode = (query.get('mode') || '').toLowerCase();
    // ?mode=harita&map=ID: paylaşılan harita doğrudan oynanır (bildirim / derin bağlantı).
    const mode = rawMode === 'harita' || rawMode === 'map' ? 'harita' : parseLobbyMode(search);
    const mapId = query.get('map');
    const [webgl] = useState(detectWebGL);
    // stage: starting | choose | auth | lobby | play | nowebgl | exited
    const [stage, setStage] = useState(() => {
        if (!webgl) return { kind: 'nowebgl' };
        if (mode === 'topluluk' || mode === 'slots' || mode === 'haritalarim') return { kind: 'lobby', tab: mode };
        const direct = (m) => {
            const e = buildEntry(m);
            return e ? { kind: 'play', entry: e, key: 1, origin: 'direct' } : null;
        };
        if (mode === 'harita' && mapId) return direct({ mode: 'harita', mapId }) || { kind: 'starting' };
        if (mode === 'insa') return direct({ mode: 'insa', seed: generateWorldCode(), mapId: member ? mapId : null, base: baseFromStorage() }) || { kind: 'starting' };
        return { kind: 'starting' };
    });
    const [avatar, setAvatar] = useState(() => normalizeAvatar(config.avatar, config.user?.gender));
    const [prefs, setPrefs] = useState(() => ({ muted: config.muted, music: config.music }));
    const stageRef = useRef(stage);
    useEffect(() => {
        stageRef.current = stage;
    }, [stage]);

    const play = useCallback((entry, origin) => {
        if (entry) setStage((st) => ({ kind: 'play', entry, key: (st.key ?? 0) + 1, origin }));
    }, []);
    const startNew = useCallback(() => play(buildEntry({ mode: 'macera', seed: generateWorldCode() }), 'direct'), [play]);
    const exit = useCallback(() => {
        postToNative('exit');
        setStage({ kind: 'exited' });
    }, []);

    // Oyundan çıkış: lobiden başlatıldıysa lobiye dön, aksi halde native ekranı kapat.
    const onSessionExit = useCallback(() => {
        const cur = stageRef.current;
        if (cur.origin === 'lobby') {
            setStage({ kind: 'lobby', tab: cur.tab || 'topluluk' });
            return;
        }
        postToNative('exit');
        setStage({ kind: 'exited' });
    }, []);

    // Macera: kayıt varsa sor, yoksa yeni dünya.
    useEffect(() => {
        if (stage.kind !== 'starting') return undefined;
        let alive = true;
        (async () => {
            const [local, cloudOv] = await Promise.all([
                withTimeout(loadLocalSaves(), CHECK_MS, []),
                member ? withTimeout(client.overview().catch((err) => ({ __error: err })), CHECK_MS, null) : null,
            ]);
            if (!alive) return;
            // Oturum düşmüşse (401) üye işleri çalışmaz: giriş iste ya da misafir oyna.
            if (cloudOv?.__error && gameErrorStatus(cloudOv.__error) === 401) {
                setStage({ kind: 'auth' });
                return;
            }
            let cloud = null;
            if (cloudOv?.cloud_save?.exists) {
                const st = cloudOv.stats || {};
                cloud = { id: 'cloud', name: st.name || 'Bulut kaydı', seed: st.seed || null, playTime: st.playTime, zone: st.zonesUnlocked ? `${st.zonesUnlocked} bölge açık` : null, updatedAt: cloudOv.cloud_save.saved_at };
            }
            const saves = mergeSaves(local, cloud);
            if (saves.length) setStage({ kind: 'choose', saves });
            else startNew();
        })();
        return () => {
            alive = false;
        };
    }, [stage.kind, member, client, startNew]);

    // Karakter / tercihler her aşamada izlenir; geri tuşu yalnız oturum dışında (oturum kendisi dinler).
    useEffect(
        () =>
            onNativeMessage((msg) => {
                if (msg.type === 'setAvatar') setAvatar(normalizeAvatar(msg.avatar, config.user?.gender));
                else if (msg.type === 'setMuted') setPrefs((p) => ({ ...p, muted: msg.muted }));
                else if (msg.type === 'setMusic') setPrefs((p) => ({ ...p, music: msg.music }));
                else if (msg.type === 'back') {
                    const kind = stageRef.current.kind;
                    if (kind !== 'play' && kind !== 'exited') exit();
                }
            }),
        [config.user?.gender, exit]
    );

    if (stage.kind === 'play') {
        return (
            <EmbedKesifSession
                key={stage.key}
                entry={stage.entry}
                api={client}
                config={config}
                avatar={avatar}
                prefs={prefs}
                haptic={haptic}
                guest={stage.guest === true}
                onPrefs={setPrefs}
                onExit={onSessionExit}
            />
        );
    }

    if (stage.kind === 'lobby') {
        const fromLobby = (entry) => play(entry, 'lobby');
        const lobbyTab = stage.tab;
        const playMap = (map) => {
            if (client.play) client.play(map.id).catch(() => {});
            setStage((st) => ({ kind: 'play', entry: buildEntry({ mode: 'harita', mapId: map.id }), key: (st.key ?? 0) + 1, origin: 'lobby', tab: lobbyTab }));
        };
        const editMap = (map) => setStage((st) => ({ kind: 'play', entry: buildEntry({ mode: 'insa', mapId: map.id }), key: (st.key ?? 0) + 1, origin: 'lobby', tab: lobbyTab }));
        const buildNew = () => setStage((st) => ({ kind: 'play', entry: buildEntry({ mode: 'insa', seed: generateWorldCode(), base: baseFromStorage() }), key: (st.key ?? 0) + 1, origin: 'lobby', tab: lobbyTab }));
        if (!member) {
            return (
                <Backdrop>
                    <Card
                        icon={LuLogIn}
                        title="Topluluk haritaları için giriş yap"
                        actions={
                            <>
                                <Btn icon={LuLogIn} primary onClick={() => postToNative('login')}>
                                    Giriş yap
                                </Btn>
                                <Btn icon={LuPlay} onClick={() => fromLobby(buildEntry({ mode: 'macera', seed: generateWorldCode() }))}>
                                    Misafir olarak maceraya başla
                                </Btn>
                                <Btn icon={LuDoorOpen} quiet onClick={exit}>
                                    Oyundan çık
                                </Btn>
                            </>
                        }
                    >
                        <p>Arkadaşlarının ve diğer oyuncuların haritalarını gezmek, beğenmek ve oynamak için üye girişi gerekir.</p>
                    </Card>
                </Backdrop>
            );
        }
        return <LobbyView api={client} member tab={lobbyTab} onPlay={playMap} onEdit={editMap} onBuild={buildNew} onExit={exit} />;
    }

    if (stage.kind === 'starting') {
        return (
            <Backdrop>
                <Spinner label="Keşif hazırlanıyor" />
                <button type="button" onClick={exit} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-white/70 underline hover:text-white">
                    Vazgeç
                </button>
            </Backdrop>
        );
    }

    if (stage.kind === 'choose') {
        const latest = stage.saves[0];
        const details = [latest.zone, latest.playTime ? formatPlayTime(latest.playTime) : null].filter(Boolean).join(' · ');
        return (
            <Backdrop>
                <Card
                    icon={LuCompass}
                    title="Maceraya devam et"
                    actions={
                        <>
                            <Btn icon={LuPlay} primary onClick={() => play(entryForSave(latest), 'direct')}>
                                Kaldığın yerden devam et
                            </Btn>
                            <Btn icon={LuHammer} onClick={startNew}>
                                Yeni macera başlat
                            </Btn>
                            <Btn icon={LuDoorOpen} quiet onClick={exit}>
                                Oyundan çık
                            </Btn>
                        </>
                    }
                >
                    <p>
                        <strong>{latest.name}</strong>
                        {details ? ` · ${details}` : ''}
                    </p>
                    {stage.saves.length > 1 && <p>{stage.saves.length - 1} kayıt daha var; lobiden seçebilirsin.</p>}
                </Card>
            </Backdrop>
        );
    }

    if (stage.kind === 'auth') {
        return (
            <Backdrop>
                <Card
                    icon={LuLogIn}
                    title="Oturumun sona ermiş"
                    actions={
                        <>
                            <Btn icon={LuLogIn} primary onClick={() => postToNative('login')}>
                                Giriş yap
                            </Btn>
                            <Btn icon={LuPlay} onClick={() => setStage({ kind: 'play', entry: buildEntry({ mode: 'macera', seed: generateWorldCode() }), key: 1, origin: 'direct', guest: true })}>
                                Misafir olarak oyna
                            </Btn>
                            <Btn icon={LuDoorOpen} quiet onClick={exit}>
                                Oyundan çık
                            </Btn>
                        </>
                    }
                >
                    <p>Kayıtlı maceran, ödüller ve haritalar için yeniden giriş yapman gerekiyor.</p>
                </Card>
            </Backdrop>
        );
    }

    if (stage.kind === 'exited') {
        // Native ekranı kapatır; tarayıcıda (test) ya da kapanmazsa sade bir ekran kalır.
        return (
            <Backdrop>
                <p className="text-sm font-semibold text-white/70">Oyundan çıkıldı.</p>
                <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold text-white/80 underline">
                    <LuRotateCcw aria-hidden="true" /> Yeniden oyna
                </button>
            </Backdrop>
        );
    }

    return (
        <Backdrop>
            <Card
                icon={LuMonitorX}
                title="3D desteklenmiyor"
                actions={
                    <Btn icon={LuDoorOpen} primary onClick={exit}>
                        Oyundan çık
                    </Btn>
                }
            >
                <p>Bu cihazda 3D grafik (WebGL 2) kullanılamıyor. Cihazını ve uygulamayı güncelleyip tekrar dene.</p>
            </Card>
        </Backdrop>
    );
};

const EmbedKesif = ({ config, api, haptic, search = typeof window !== 'undefined' ? window.location.search : '' }) => (
    <MemoryRouter>
        <EmbedKesifInner config={config} api={api} haptic={haptic} search={search} />
    </MemoryRouter>
);

export default EmbedKesif;
