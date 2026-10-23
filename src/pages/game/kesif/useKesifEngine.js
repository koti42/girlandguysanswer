import { useEffect } from 'react';
import { cleanWorldCode } from '../../../components/game/kesif/kesifUtils';
import { prepareStart } from './kesifSessionStart';
import { createPlayTracker } from './kesifPlayTracker';
import { classifyEngineError, createCloudSaver, createRewardClaimer, normalizeProgress, worldCodeOf } from './kesifSessionUtils';

/*
 * Motor yaşam döngüsü (useKesifSession'dan ayrıldı): modül yüklenir -> WebGL denetimi -> kayıt/harita
 * hazırlanır -> createKesifGame -> start -> yükleme ilerlemesi yoklanır. Ödül ve bulut kaydı yürütücüleri
 * de burada, oturum (motor) başına kurulur.
 *
 * `cancelled` bayrağı StrictMode'un çift bağlamasını ve sayfadan çıkışı korur: geç gelen motor hemen
 * destroy edilir. Sökülürken bilerek çıkılmadıysa (geri hareketi, bağlantı) son durum yerel yuvaya bırakılır.
 * Tüm parametreler kararlıdır (ref, useCallback, state ayarlayıcı); `attempt` artınca yeniden kurulur.
 */

const POLL_MS = 120;

const safe = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

export default function useKesifEngine({
    attempt,
    containerRef,
    loadEngine,
    loadStorage,
    reducedMotion,
    announcer,
    refs,
    handlers,
    setters,
}) {
    const { entryRef, memberRef, userRef, apiRef, avatarRef, cosmeticsRef, settingsRef, a11yRef, resumeRef, mapCacheRef, storageRef, slotRef, mapMetaRef, gameRef, inputRef, phaseRef, claimerRef, trackerRef, cloudRef, explicitExitRef, mountedRef, exitRef } = refs;
    const { handleHud, handleEvent, handleSave, handleHaptic, handleSpeak, handleReady, handleEngineError } = handlers;
    const { setPhase, setMessage, setRetryable, setNeedsLogin, setProgress, setMapMeta, setCloudState } = setters;

    useEffect(() => {
        let cancelled = false;
        // Hızlı gir-çık: motor kurulurken sökülürsek kurulum yarıda kesilir (WebGL bağlamı sızmaz).
        const abortCtl = typeof AbortController === 'function' ? new AbortController() : null;
        let game = null;
        let pollTimer = null;
        // Motor, ilk chunk halkası yüklenince onReady'yi api dönmeden ÖNCE çağırır: işaretlenir, api gelince işlenir.
        let readyFired = false;
        const container = containerRef?.current;
        const e = entryRef.current;
        mountedRef.current = true;

        const guard =
            (fn) =>
            (...args) => {
                if (!cancelled) return fn(...args);
                return undefined;
            };
        const callbacks = {
            onHud: guard(handleHud),
            onEvent: guard(handleEvent),
            // Kayıt, motor destroy edilirken gelen son çıkış kaydını da almalı (guard yok).
            onSave: (p) => handleSave(p),
            onHaptic: guard(handleHaptic),
            onSpeak: guard(handleSpeak),
            onReady: guard(() => {
                readyFired = true;
                if (gameRef.current) handleReady();
            }),
            // İsteğe bağlı: motor yükleme ilerlemesini kendisi bildirirse çubuk gerçek ilerlemeyi gösterir.
            onProgress: guard((p) => {
                const v = normalizeProgress(p);
                setProgress((cur) => (Math.round(cur.value * 100) === Math.round(v.value * 100) && cur.label === v.label ? cur : v));
            }),
            onError: guard(handleEngineError),
            onPause: guard(() => {}),
            onUi: guard(() => {}),
            onExit: guard(() => exitRef.current && exitRef.current()),
        };

        const fail = (text, canRetry, login) => {
            setMessage(text);
            setRetryable(Boolean(canRetry));
            setNeedsLogin(Boolean(login));
            setPhase('error');
        };

        const startPoll = (g) => {
            pollTimer = setInterval(() => {
                if (cancelled || typeof g.getLoadProgress !== 'function') return;
                const p = normalizeProgress(safe(() => g.getLoadProgress()));
                setProgress((cur) => (Math.round(cur.value * 100) === Math.round(p.value * 100) && cur.label === p.label ? cur : p));
                if (p.value >= 1) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                    handleReady();
                }
            }, POLL_MS);
        };

        (async () => {
            try {
                const mod = await loadEngine();
                if (cancelled) return;
                if (typeof mod.isWebGLAvailable === 'function' && !mod.isWebGLAvailable()) {
                    handleEngineError({ code: 'webgl' });
                    return;
                }
                const prep = await prepareStart({
                    entry: e,
                    member: memberRef.current,
                    api: apiRef.current,
                    loadStorage,
                    resume: resumeRef.current,
                    mapCache: mapCacheRef.current,
                });
                if (cancelled) return;
                if (!prep.ok) {
                    fail(prep.text, prep.retry, prep.login);
                    return;
                }
                storageRef.current = prep.storage;
                slotRef.current = prep.slot;
                if (prep.mapCache) mapCacheRef.current = prep.mapCache;
                setMapMeta(prep.mapMeta || (e.mode === 'insa' ? mapMetaRef.current : null));

                const s = settingsRef.current;
                const u = userRef.current;
                const g = await mod.createKesifGame({
                    container,
                    mode: e.mode,
                    seed: prep.seed,
                    save: prep.save,
                    mapData: prep.mapData,
                    base: e.base || undefined,
                    avatar: avatarRef.current,
                    cosmetics: cosmeticsRef?.current || undefined,
                    gender: u?.gender ?? null,
                    muted: s.muted,
                    music: s.music,
                    haptics: s.haptics,
                    reducedMotion,
                    accessibility: a11yRef.current,
                    quality: s.quality,
                    controls: 'auto',
                    settings: { ...s },
                    callbacks,
                    signal: abortCtl ? abortCtl.signal : undefined,
                });
                if (cancelled) {
                    safe(() => g?.destroy());
                    return;
                }
                game = g;
                gameRef.current = g;
                inputRef.current = g.input || (typeof g.getInput === 'function' ? safe(() => g.getInput()) : null) || null;
                g.start();
                // Neon Meridyen jeton talepleri yalnız üye için (misafirde arayüz jeton satırlarını gizler)
                safe(() => g.setCityRewardsEnabled?.(memberRef.current));
                if (readyFired || typeof g.getLoadProgress !== 'function') handleReady();
                else startPoll(g);
            } catch (err) {
                if (cancelled) return;
                const kind = classifyEngineError(err);
                if (kind === 'webgl') handleEngineError(err);
                else fail('Oyun yüklenemedi. Bağlantını kontrol edip tekrar dene.', true);
            }
        })();

        // Ödül ve bulut kaydı yürütücüleri oturum başına bir kez kurulur.
        const fmt = (n) => Number(n).toLocaleString('tr-TR');
        // Sunucu ödül kapısı: macera oyun oturumu (play/start + ~60 sn ping). Yalnız macera + üye; hatalar sessiz.
        const tracker = createPlayTracker({
            getApi: () => apiRef.current,
            canTrack: () => entryRef.current.mode === 'macera' && memberRef.current,
            getWorldCode: () => cleanWorldCode(worldCodeOf(gameRef.current)) || '',
            getPlayTime: () => {
                const g = gameRef.current;
                const st = g && typeof g.getStats === 'function' ? safe(() => g.getStats()) : null;
                return st && Number.isFinite(Number(st.playTime)) ? Number(st.playTime) : 0;
            },
            onPingOk: () => safe(() => claimerRef.current?.retryDue()),
        });
        trackerRef.current = tracker;
        const claimer = createRewardClaimer({
            startSession: () => tracker.ensureStarted(),
            getApi: () => apiRef.current,
            isMember: () => memberRef.current,
            getSeed: () => {
                const g = gameRef.current;
                return cleanWorldCode(worldCodeOf(g)) || undefined;
            },
            markClaimed: (key) => safe(() => gameRef.current?.markRewardClaimed?.(key)),
            onGranted: (key, res) => {
                const granted = Number(res.granted);
                let sub = granted > 0 ? `${fmt(granted)} jeton` : '';
                if (res.capped) sub = granted > 0 ? `${fmt(granted)} jeton · günlük sınıra yaklaştın` : 'Günlük jeton sınırına ulaştın';
                announcer.push({ kind: 'reward', text: 'Ödül kazandın', sub });
            },
            onCapped: () => announcer.push({ kind: 'info', text: 'Günlük jeton sınırına ulaştın', sub: 'Ödülün yarın tekrar talep edilecek' }),
            onGuest: () => announcer.push({ kind: 'info', text: 'Ödül kazandın', sub: 'Jeton ödülleri için giriş yap' }),
            onStopped: () => announcer.push({ kind: 'info', text: 'Oturumun sona erdi', sub: 'Ödüller için yeniden giriş yap' }),
        });
        claimerRef.current = claimer;
        const cloud = createCloudSaver({
            getApi: () => apiRef.current,
            onState: (st) => {
                if (mountedRef.current) setCloudState(st);
            },
        });
        cloudRef.current = cloud;

        return () => {
            cancelled = true;
            if (abortCtl) safe(() => abortCtl.abort());
            if (pollTimer) clearInterval(pollTimer);
            claimer.dispose();
            tracker.dispose();
            cloud.dispose();
            claimerRef.current = null;
            trackerRef.current = null;
            cloudRef.current = null;
            if (game) {
                // Bilerek çıkılmadıysa (geri hareketi, bağlantı) son durumu bırakma: yerel kayıt.
                // eslint-disable-next-line react-hooks/exhaustive-deps -- sökülürken en güncel değer gerekir
                if (!explicitExitRef.current && phaseRef.current === 'running' && e.mode === 'macera') {
                    const s = safe(() => game.save());
                    if (s && typeof s === 'object') {
                        const st = storageRef.current;
                        const slot = slotRef.current;
                        if (st && slot) safe(() => st.mod.saveToSlot(st.adapter, slot, s));
                    }
                }
                safe(() => game.destroy());
            }
            if (gameRef.current === game) gameRef.current = null;
            inputRef.current = null;
        };
        // refs / handlers / setters: tümü kararlı (ref, useCallback, useState ayarlayıcıları); yalnız attempt yeniden kurar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt, containerRef, loadEngine, loadStorage, reducedMotion, announcer, handleHud, handleEvent, handleSave, handleHaptic, handleSpeak, handleReady, handleEngineError]);
}
