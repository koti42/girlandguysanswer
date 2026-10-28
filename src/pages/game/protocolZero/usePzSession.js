import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { breachResolve, buyTech, chooseDilemma, createSim, purge, snapshot, summary, tick, toggleIsolate, upgradeFirewall } from '../../../game/protocolZero/sim';
import { computeScore } from '../../../game/protocolZero/score';
import { SoundEngine } from '../../../game/protocolZero/sound';
import { loadMuted, saveMuted } from '../../../components/game/protocolZero/pzUtils';

/*
 * Oyun oturumu: simülasyon döngüsü (rAF, gerçek dt × hız), HUD deposu (useSyncExternalStore; sayfa
 * state'ine yazmadan ~10 Hz), ses motoru, küre köprüsü ve oyuncu aksiyonları.
 *
 * Duraklama kaynakları: hız 0, brifing, menü, savunma ağacı, mini oyun, bekleyen ikilem, oyun bitti.
 * Olaylar (sim.tick): dilemma → ses; breach → alarm + kamerayı düğüme çevir; breachLost/captured → ses;
 * victory/defeat → sonuç (summary + skor + gerçek süre).
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

export default function usePzSession({ entry, reducedMotion = false }) {
    // Sim ve ses motoru bileşen ömrü boyunca tek örnek (useState başlatıcısı: render'da ref yazmadan).
    const [sim] = useState(() => createSim(entry.difficulty, { seed: entry.seed }));
    const [sound] = useState(() => new SoundEngine({ muted: loadMuted() }));
    const store = useMemo(() => createStore(snapshot(sim)), [sim]);
    const snap = useSyncExternalStore(store.subscribe, store.get, store.get);

    const [speed, setSpeedState] = useState(1);
    const [ui, setUi] = useState({ started: false, menu: false, tech: false, breachGame: false });
    const [selectedId, setSelectedId] = useState(null);
    const [lastError, setLastError] = useState('');
    const [result, setResult] = useState(null);
    const [muted, setMuted] = useState(loadMuted);
    const [breachSeed, setBreachSeed] = useState(0);

    const globeRef = useRef(null);
    const startedAtRef = useRef(null);
    const pausedAccumRef = useRef(0);
    const pauseStartRef = useRef(null);
    const lastSpeedRef = useRef(1);
    const errTimer = useRef(0);

    const finished = snap.status !== 'running';
    const paused = !ui.started || ui.menu || ui.tech || ui.breachGame || Boolean(snap.dilemma) || finished || speed === 0;

    // Döngü (rAF) güncel hız/duraklamayı ref'ten okur; atama commit sonrası effect'te.
    const ctl = useRef({ speed, paused });
    useEffect(() => {
        ctl.current = { speed, paused };
    }, [speed, paused]);

    const push = useCallback(() => {
        const s = snapshot(sim);
        store.set(s);
        globeRef.current?.update(s);
    }, [store, sim]);

    const sfx = useCallback((name) => sound.play(name), [sound]);

    const showError = useCallback((msg) => {
        setLastError(msg || '');
        clearTimeout(errTimer.current);
        if (msg) errTimer.current = setTimeout(() => setLastError(''), 2500);
    }, []);

    /* ----------------------------- ses / küre ----------------------------- */
    const toggleMute = useCallback(() => {
        setMuted((m) => {
            const next = !m;
            saveMuted(next);
            sound.setMuted(next);
            if (!next && ctl.current && sim?.status === 'running') {
                sound.unlock();
                sound.startAmbient();
                if (sim.breach) sound.startAlarm();
            }
            return next;
        });
    }, [sim, sound]);

    const onGlobeReady = useCallback(
        (globe) => {
            globeRef.current = globe;
            if (globe) {
                globe.update(store.get());
                globe.setSelected(selectedId);
            }
        },
        [store, selectedId]
    );

    useEffect(() => {
        globeRef.current?.setSelected(selectedId);
    }, [selectedId]);

    useEffect(() => {
        globeRef.current?.setPaused(paused);
    }, [paused]);

    useEffect(() => {
        const timer = errTimer;
        return () => {
            sound.dispose();
            clearTimeout(timer.current);
        };
    }, [sound]);

    /* -------------------------------- olaylar -------------------------------- */
    const handleEvents = useCallback(
        (events) => {
            for (const e of events) {
                switch (e.type) {
                    case 'dilemma':
                        sfx('dilemma');
                        break;
                    case 'breach':
                        sound.startAlarm();
                        globeRef.current?.focusNode(e.nodeId);
                        break;
                    case 'breachLost':
                        sound.stopAlarm();
                        sfx('fail');
                        break;
                    case 'captured':
                        sfx('reseed');
                        break;
                    case 'reseed':
                        sfx('data');
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
        [sfx, sim, sound]
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
            if (now - lastPush > PUSH_MS || events.length) {
                lastPush = now;
                push();
            }
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [handleEvents, push, sim]);

    // Duraklatılan gerçek süre skora girmesin (elapsed_seconds gün sayısıyla karşılaştırılır; fazla olması sorun değil, ama dürüst ölçelim).
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
        (id) => {
            if (id) {
                sfx('ping');
                globeRef.current?.focusNode(id);
            }
            setSelectedId(id || null);
            showError('');
        },
        [sfx, showError]
    );

    const act = useCallback(
        (fn, sound) => (...args) => {
            const r = fn(sim, ...args);
            if (r.ok) {
                sfx(sound);
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

    const choose = useCallback(
        (index) => {
            const r = chooseDilemma(sim, index);
            if (r.ok) sfx('click');
            push();
            return r;
        },
        [sfx, push, sim]
    );

    const openTech = useCallback(() => {
        sfx('click');
        setUi((u) => ({ ...u, tech: true }));
    }, [sfx]);
    const closeTech = useCallback(() => setUi((u) => ({ ...u, tech: false })), []);
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
        speed,
        setSpeed,
        togglePause,
        paused,
        finished,
        result,
        ui,
        muted,
        toggleMute,
        selectedId,
        selectedNode,
        select,
        actions,
        choose,
        openTech,
        closeTech,
        openMenu,
        closeMenu,
        startBreachGame,
        resolveBreach,
        breachSeed,
        start,
        lastError,
        onGlobeReady,
        sfx,
        reducedMotion,
    };
}
