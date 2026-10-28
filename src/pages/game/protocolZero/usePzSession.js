import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    breachResolve,
    buyTech,
    chooseDilemma,
    createSim,
    packetArrive,
    popBubble,
    purge,
    snapshot,
    summary,
    tick,
    toggleIsolate,
    upgradeFirewall,
} from '../../../game/protocolZero/sim';
import { computeScore } from '../../../game/protocolZero/score';
import { SoundEngine } from '../../../game/protocolZero/sound';
import { loadMuted, saveMuted } from '../../../components/game/protocolZero/pzUtils';

/*
 * Oyun oturumu: simülasyon döngüsü (rAF, gerçek dt × hız), HUD deposu (useSyncExternalStore; sayfa
 * state'ine yazmadan ~10 Hz), ses motoru, harita köprüsü ve oyuncu aksiyonları.
 *
 * Duraklama kaynakları: hız 0, brifing, menü, savunma ağacı, dünya durumu, mini oyun, bekleyen ikilem, oyun bitti.
 * Olaylar (sim.tick): dilemma → ses; breach → alarm + haritayı düğüme çevir; bubble → ses; alert günlük →
 * haber bandı kızıl + bülten sesi; victory/defeat → sonuç (summary + skor + gerçek süre).
 */

function createStore(initial) {
    let state = initial;
    const listeners = new Set();
    return {
        get: () => state,
        set(next) {
            state = next;
            listeners.forEach((l) => l());
        },
        subscribe(l) {
            listeners.add(l);
            return () => listeners.delete(l);
        },
    };
}

const MAX_STEP = 0.25;
const PUSH_MS = 100;
const ALERT_MS = 4000;

export default function usePzSession({ entry, reducedMotion = false }) {
    // Sim, ses motoru ve başlangıç tarihi bileşen ömrü boyunca tek örnek (useState başlatıcısı).
    const [sim] = useState(() => createSim(entry.difficulty, { seed: entry.seed, archetype: entry.archetype, genes: entry.genes }));
    const [sound] = useState(() => new SoundEngine({ muted: loadMuted() }));
    const [startDate] = useState(() => new Date());
    const store = useMemo(() => createStore(snapshot(sim)), [sim]);
    const snap = useSyncExternalStore(store.subscribe, store.get, store.get);

    const [speed, setSpeedState] = useState(1);
    // panel: null | 'threat' | 'research' | 'stats' | 'settings'  (menu = duraklatma penceresi)
    const [ui, setUi] = useState({ started: false, menu: false, panel: null, breachGame: false });
    const [selectedId, setSelectedId] = useState(null);
    const [countryName, setCountryName] = useState('');
    const [lastError, setLastError] = useState('');
    const [result, setResult] = useState(null);
    const [muted, setMuted] = useState(loadMuted);
    const [breachSeed, setBreachSeed] = useState(0);
    const [alert, setAlert] = useState(false);

    const mapRef = useRef(null);
    const worldRef = useRef(null);
    const startedAtRef = useRef(null);
    const pausedAccumRef = useRef(0);
    const pauseStartRef = useRef(null);
    const lastSpeedRef = useRef(1);
    const errTimer = useRef(0);
    const alertTimer = useRef(0);
    const lastLogRef = useRef(0);

    const finished = snap.status !== 'running';
    const paused = !ui.started || ui.menu || Boolean(ui.panel) || ui.breachGame || Boolean(snap.dilemma) || finished || speed === 0;

    const ctl = useRef({ speed, paused });
    useEffect(() => {
        ctl.current = { speed, paused };
    }, [speed, paused]);

    const push = useCallback(() => {
        const s = snapshot(sim);
        store.set(s);
        mapRef.current?.update(s);
    }, [store, sim]);

    const sfx = useCallback((name) => sound.play(name), [sound]);

    const showError = useCallback((msg) => {
        setLastError(msg || '');
        clearTimeout(errTimer.current);
        if (msg) errTimer.current = setTimeout(() => setLastError(''), 2500);
    }, []);

    const flashAlert = useCallback(() => {
        setAlert(true);
        clearTimeout(alertTimer.current);
        alertTimer.current = setTimeout(() => setAlert(false), ALERT_MS);
    }, []);

    /* ----------------------------- ses / harita ----------------------------- */
    const toggleMute = useCallback(() => {
        setMuted((m) => {
            const next = !m;
            saveMuted(next);
            sound.setMuted(next);
            if (!next && sim.status === 'running') {
                sound.unlock();
                sound.startAmbient();
                if (sim.breach) sound.startAlarm();
            }
            return next;
        });
    }, [sim, sound]);

    const onMapReady = useCallback(
        (map, world) => {
            mapRef.current = map;
            if (world) worldRef.current = world;
            if (map) {
                map.update(store.get());
                map.setSelected(selectedId);
            }
        },
        [store, selectedId]
    );

    useEffect(() => {
        mapRef.current?.setSelected(selectedId);
    }, [selectedId]);

    useEffect(() => {
        mapRef.current?.setPaused(paused);
    }, [paused]);

    useEffect(() => {
        const timers = [errTimer, alertTimer];
        return () => {
            sound.dispose();
            for (const t of timers) clearTimeout(t.current);
        };
    }, [sound]);

    /* -------------------------------- olaylar -------------------------------- */
    const handleEvents = useCallback(
        (events) => {
            for (const e of events) {
                switch (e.type) {
                    case 'dilemma':
                        sfx('dilemma');
                        flashAlert();
                        break;
                    case 'breach':
                        sound.startAlarm();
                        mapRef.current?.focusNode(e.nodeId);
                        flashAlert();
                        break;
                    case 'breachLost':
                        sound.stopAlarm();
                        sfx('fail');
                        flashAlert();
                        break;
                    case 'captured':
                        sfx('reseed');
                        flashAlert();
                        break;
                    case 'reseed':
                        flashAlert();
                        break;
                    case 'story':
                        if (e.kind === 'alert') flashAlert();
                        break;
                    case 'bubble':
                        sfx(e.bubble.kind === 'breach' ? 'popBad' : 'data');
                        if (e.bubble.kind === 'breach') flashAlert();
                        break;
                    case 'autoPatch':
                        sfx('data');
                        break;
                    case 'victory':
                    case 'defeat': {
                        sound.stopAlarm();
                        sound.stopAmbient();
                        sfx(e.type);
                        const sum = summary(sim);
                        const elapsed = startedAtRef.current ? (performance.now() - startedAtRef.current - pausedAccumRef.current) / 1000 : sim.time;
                        setResult({ summary: sum, score: computeScore(sum), elapsedSeconds: Math.max(1, elapsed) });
                        setSelectedId(null);
                        break;
                    }
                    default:
                        break;
                }
            }
        },
        [sfx, sim, sound, flashAlert]
    );

    /* -------------------------------- döngü -------------------------------- */
    useEffect(() => {
        let raf = 0;
        let last = performance.now();
        let lastPush = 0;
        const loop = (now) => {
            raf = requestAnimationFrame(loop);
            const realDt = Math.min(0.1, (now - last) / 1000);
            last = now;
            const { speed: sp, paused: pz } = ctl.current;
            if (pz || sim.status !== 'running') return;
            let simDt = realDt * sp;
            const events = [];
            while (simDt > 0) {
                const step = Math.min(MAX_STEP, simDt);
                events.push(...tick(sim, step));
                simDt -= step;
                if (sim.status !== 'running' || sim.dilemma) break;
            }
            if (events.length) handleEvents(events);
            if (sim.logSeq !== lastLogRef.current) {
                lastLogRef.current = sim.logSeq;
                const latest = sim.log[sim.log.length - 1];
                if (latest?.kind === 'alert') sfx('news');
            }
            if (now - lastPush > PUSH_MS || events.length) {
                lastPush = now;
                push();
            }
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [handleEvents, push, sim, sfx]);

    // Duraklatılan gerçek süre skora girmesin.
    useEffect(() => {
        if (!ui.started) return;
        if (paused) {
            pauseStartRef.current = performance.now();
        } else if (pauseStartRef.current != null) {
            pausedAccumRef.current += performance.now() - pauseStartRef.current;
            pauseStartRef.current = null;
        }
    }, [paused, ui.started]);

    /* ------------------------------- aksiyonlar ------------------------------- */
    const start = useCallback(() => {
        sound.unlock();
        sound.startAmbient();
        sfx('ping');
        startedAtRef.current = performance.now();
        setUi((u) => ({ ...u, started: true }));
        push();
    }, [sfx, push, sound]);

    const setSpeed = useCallback(
        (s) => {
            sfx('click');
            if (s > 0) lastSpeedRef.current = s;
            setSpeedState(s);
        },
        [sfx]
    );

    const togglePause = useCallback(() => {
        setSpeedState((s) => (s === 0 ? lastSpeedRef.current || 1 : ((lastSpeedRef.current = s), 0)));
    }, []);

    const select = useCallback(
        (id, countryId) => {
            if (id) sfx('ping');
            setSelectedId(id || null);
            const world = worldRef.current;
            setCountryName(id && countryId && world ? world.byId[countryId]?.name || '' : '');
            showError('');
        },
        [sfx, showError]
    );

    const act = useCallback(
        (fn, soundName) => (...args) => {
            const r = fn(sim, ...args);
            if (r.ok) {
                sfx(soundName);
                showError('');
            } else {
                sfx('miss');
                showError(r.reason);
            }
            push();
            return r;
        },
        [sfx, showError, push, sim]
    );

    const actions = useMemo(
        () => ({
            upgradeFirewall: act(upgradeFirewall, 'upgrade'),
            purge: act(purge, 'purge'),
            toggleIsolate: act(toggleIsolate, 'isolate'),
            buyTech: act(buyTech, 'tech'),
        }),
        [act]
    );

    const pop = useCallback(
        (id) => {
            const r = popBubble(sim, id);
            if (r.ok) sfx(r.kind === 'data' ? 'pop' : 'success');
            push();
            return r;
        },
        [sim, sfx, push]
    );

    const onPacketArrive = useCallback((from, to) => packetArrive(sim, from, to), [sim]);

    const choose = useCallback(
        (index) => {
            const r = chooseDilemma(sim, index);
            if (r.ok) sfx('click');
            push();
            return r;
        },
        [sfx, push, sim]
    );

    const openPanel = useCallback(
        (name) => {
            sfx('click');
            setUi((u) => ({ ...u, panel: u.panel === name ? null : name }));
        },
        [sfx]
    );
    const closePanel = useCallback(() => setUi((u) => ({ ...u, panel: null })), []);
    const resetView = useCallback(() => mapRef.current?.resetView(), []);
    const openMenu = useCallback(() => {
        sfx('click');
        setUi((u) => ({ ...u, menu: true }));
    }, [sfx]);
    const closeMenu = useCallback(() => setUi((u) => ({ ...u, menu: false })), []);

    const startBreachGame = useCallback(() => {
        if (!sim.breach) return;
        sound.stopAlarm();
        sfx('click');
        setBreachSeed(Date.now());
        setUi((u) => ({ ...u, breachGame: true }));
    }, [sfx, sim, sound]);

    const resolveBreach = useCallback(
        (success) => {
            const r = breachResolve(sim, success);
            if (r.ok && success) sfx('coin');
            setUi((u) => ({ ...u, breachGame: false }));
            push();
        },
        [sfx, push, sim]
    );

    const selectedNode = selectedId ? snap.nodes.find((n) => n.id === selectedId) || null : null;

    return {
        snap,
        sim,
        startDate,
        speed,
        setSpeed,
        togglePause,
        paused,
        finished,
        result,
        ui,
        alert,
        muted,
        toggleMute,
        selectedId,
        selectedNode,
        countryName,
        select,
        actions,
        pop,
        onPacketArrive,
        choose,
        openPanel,
        closePanel,
        resetView,
        openMenu,
        closeMenu,
        startBreachGame,
        resolveBreach,
        breachSeed,
        start,
        lastError,
        onMapReady,
        sfx,
        reducedMotion,
    };
}
