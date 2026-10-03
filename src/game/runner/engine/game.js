/*
 * Oyun yöneticisi: sim + render döngüsü + girdi + ses + arayüz geri çağrıları.
 *
 * Döngü: sim sabit 60 Hz (fixedStep), render ekran hızında; oyuncu ve dünya
 * iki tick arası interpolasyonla çizilir. Tüm render konumları oyuncuya göre
 * göreli (nesne.z = -(dünyaZ - oyuncuZ) / 1000): büyük z'de float hassasiyeti
 * sorunu olmaz.
 *
 * Güvenlik: istemci yalnızca girdi kaydını (sim.encodeInputs) ve endTick'i
 * üretir; skor sunucuda yeniden hesaplanır. Sim gerçek zamandan hızlı
 * koşamaz (kare süresi 250 ms ile sınırlı, duraklatmada adım yok).
 *
 * Durumlar: idle -> countdown -> running -> crashing -> ended
 * (paused bayrağı countdown/running üstüne biner).
 */
import { createSim, computeScore, C } from '../sim/index.js';
import { createStage } from './stage.js';
import { createWorld } from './world.js';
import { createEntities } from './entities.js';
import { createGates } from './gates.js';
import { createPlayer } from './player.js';
import { createEffects } from './effects.js';
import { createCameraRig } from './cameraRig.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createFixedStepper, MAX_FRAME_MS } from './fixedStep.js';
import { runSnapshot } from './runSnapshot.js';
import { createQualityController, initialPixelRatio } from './quality.js';
import { normalizeCharacter } from './palette.js';
import { isCoarsePointer } from './webgl.js';
import {
    createBannerTexture,
    createCoinTexture,
    createCurtainTexture,
    createGlowTexture,
    createRoadTexture,
    createSignTexture,
    createWindowTextures,
    waitForFont,
} from './textures.js';

const COUNTDOWN_S = 3;
const CRASH_TO_END_S = 1.1;
const HUD_INTERVAL_MS = 100;
const GATE_APPROACH_S = 7;

function noop() {}

function validateGates(gates) {
    if (gates == null) return [];
    if (!Array.isArray(gates)) throw new TypeError('gates bir dizi olmalı.');
    // Sim kapı k'yı k. sırada bekler: index 0..n-1 ve sıralı olmalı.
    const sorted = gates.slice().sort((a, b) => a.index - b.index);
    sorted.forEach((g, i) => {
        if (!g || g.index !== i) throw new TypeError('Kapı indeksleri 0..n-1 olmalı.');
    });
    return sorted;
}

function randomSeed() {
    try {
        const a = new Uint32Array(1);
        window.crypto.getRandomValues(a);
        return a[0] || 1;
    } catch {
        return (Math.floor(Math.random() * 0xfffffffe) + 1) >>> 0;
    }
}

export async function createRunnerGame(options = {}) {
    const {
        container,
        seed: seedIn,
        gates: gatesIn,
        character,
        muted = false,
        musicEnabled = true,
        reducedMotion = false,
        callbacks = {},
    } = options;
    if (!container || typeof container.appendChild !== 'function') {
        throw new TypeError('createRunnerGame: container bir DOM elemanı olmalı.');
    }
    // Misafir antrenmanında seed verilmeyebilir; dereceli koşuda sunucunun seed'i zorunlu.
    const seed = seedIn == null ? randomSeed() : seedIn;
    const gates = validateGates(gatesIn);
    const sim = createSim({ seed, gateCount: gates.length });
    const cb = {
        onHud: callbacks.onHud || noop,
        onGateApproach: callbacks.onGateApproach || noop,
        onGateCross: callbacks.onGateCross || noop,
        onCountdown: callbacks.onCountdown || noop,
        onCrash: callbacks.onCrash || noop,
        onEnd: callbacks.onEnd || noop,
        onError: callbacks.onError || noop,
        onPause: callbacks.onPause || noop,
    };
    const safe = (fn, ...args) => {
        try {
            fn(...args);
        } catch (err) {
            // Arayüz geri çağrısındaki hata oyun döngüsünü öldürmesin.
            console.error('[runner] callback hatası', err);
        }
    };

    await waitForFont();

    // --- Kurulum ---
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const coarse = isCoarsePointer();
    const quality = createQualityController({ dpr });
    // Kurulum yarıda kalırsa (WebGL yok, bellek...) o ana kadar oluşturulanlar bırakılır.
    const built = [];
    let stage;
    let tex;
    let world;
    let entities;
    let gateView;
    let player;
    let effects;
    let audio;
    try {
        const glow = createGlowTexture();
        built.push(glow);
        stage = createStage(container, {
            antialias: !coarse && dpr < 1.5,
            pixelRatio: initialPixelRatio(dpr),
            glowTexture: glow,
        });
        built.push(stage);
        const anisotropy = Math.min(4, stage.renderer.capabilities.getMaxAnisotropy());
        tex = {
            glow,
            window: createWindowTextures(anisotropy),
            road: createRoadTexture(anisotropy),
            coin: createCoinTexture(),
            sign: createSignTexture(),
            curtain: createCurtainTexture(),
            banner: createBannerTexture(),
        };
        built.push(tex.window.map, tex.window.emissive, tex.road, tex.coin, tex.sign, tex.curtain, tex.banner);
        world = createWorld(stage.scene, tex, tex.glow);
        built.push(world);
        entities = createEntities(stage.scene, tex);
        built.push(entities);
        gateView = createGates(stage.scene, { gates, gateZ: sim.gateZ, curtainTexture: tex.curtain });
        built.push(gateView);
        const ch = normalizeCharacter(character);
        player = createPlayer(stage.scene, { body: ch.body, palette: ch.palette, glowTexture: tex.glow });
        built.push(player);
        effects = createEffects(stage.scene, stage.camera, { glowTexture: tex.glow, reducedMotion });
        built.push(effects);
        audio = createAudio({ muted, musicEnabled });
    } catch (err) {
        // Sahne ve bağlam dahil ters sırada bırak.
        for (let i = built.length - 1; i >= 0; i--) {
            try {
                built[i].dispose();
            } catch {
                // yut: zaten hata yolundayız
            }
        }
        const e = new Error('Oyun başlatılamadı: tarayıcın WebGL desteklemiyor olabilir.');
        e.cause = err;
        safe(cb.onError, e);
        throw e;
    }
    const { renderer, scene, camera, canvas } = stage;
    const rig = createCameraRig(camera, { reducedMotion });
    const stepper = createFixedStepper();

    // --- Durum ---
    const st = sim.state;
    let phase = 'idle';
    let paused = false;
    let destroyed = false;
    let ended = false;
    let rafId = 0;
    let lastNow = -1;
    let time = 0;
    let countdownLeft = 0;
    let countdownShown = 0;
    let crashTimer = 0;
    let hudAcc = 0;
    let approached = 0;
    let firstStart = true;
    let contextLost = false;
    const correct = []; // kapı index -> true/false/null
    // Interpolasyon için önceki tick
    let prevZ = 0;
    let prevX = 0;
    let prevY = 0;
    let laneVel = 0;

    // Render için yeniden kullanılan durum nesneleri (her kare allocation yok)
    const playerState = { x: 0, y: 0, vy: 0, speed: 0, sliding: false, slideProgress: 0, laneVel: 0, running: false, idle: true, invuln: false, time: 0 };
    const playerPos = { x: 0, y: 0, z: 0 };
    const fxState = { dt: 0, time: 0, pzM: 0, player: playerPos, speedNorm: 0, shield: false, magnetLeft: 0, running: false };
    const camState = { dt: 0, aspect: 1, px: 0, py: 0, speedNorm: 0, crashed: false, shake: effects.shake, idleTime: 0 };

    // Düşük kalite kademesi: pahalı efektleri kapat/azalt (bkz. quality.js).
    let liteOn = false;
    function applyLite(on) {
        if (on === liteOn) return;
        liteOn = on;
        stage.setLite(on);
        world.setLite(on);
        entities.setLite(on);
        effects.setLite(on);
    }

    function resizeNow() {
        stage.resize();
        effects.setPixelScale(stage.height * renderer.getPixelRatio(), camera.fov);
    }
    resizeNow();

    // --- Olaylar ---
    function speedMs() {
        return (sim.speed() * 60) / 1000;
    }

    function onCoinArrive(x, y) {
        effects.burst('sparkle', x, y, st.z / 1000, 5, speedMs(), 1);
    }

    function processEvents(events) {
        const pzM = st.z / 1000;
        const px = st.x / 1000;
        const py = st.y / 1000;
        for (let i = 0; i < events.length; i++) {
            const e = events[i];
            switch (e.type) {
                case 'coin':
                    entities.collectCoin(sim, e.id, st.z);
                    audio.play('coin');
                    break;
                case 'power':
                    audio.play('power');
                    effects.burst(e.kind === 'magnet' ? 'magnet' : 'shield', px, py + 1, pzM, 22, speedMs(), 0.8);
                    effects.flash(e.kind === 'magnet' ? 0xff5a6a : 0x5ad8ff, 0.45, 1.6);
                    break;
                case 'jump':
                    audio.play('jump');
                    effects.burst('dust', px, 0.1, pzM, 5, 0, 0.4);
                    break;
                case 'land':
                    audio.play('land');
                    player.land();
                    effects.burst('dust', px, 0.1, pzM, 7, 0, 0.4);
                    break;
                case 'slide':
                    audio.play('slide');
                    if (st.y === 0) effects.burst('dust', px, 0.1, pzM, 8, 0, 0.3);
                    break;
                case 'lane':
                    audio.play('lane');
                    break;
                case 'stumble':
                    audio.play('stumble');
                    player.stumble();
                    effects.addTrauma(0.5);
                    effects.flash(0xff3b5c, 0.4, 2);
                    effects.burst('dust', px, 0.5, pzM, 10, 0, 1);
                    break;
                case 'shieldBreak':
                    audio.play('shieldBreak');
                    entities.obstacleDestroyed(e.id);
                    effects.shieldBreak();
                    effects.addTrauma(0.45);
                    effects.flash(0x5ad8ff, 0.6, 1.6);
                    effects.burst('shards', px, py + 1, pzM, 28, speedMs(), 1);
                    break;
                case 'crash':
                    audio.play('crash');
                    player.crash();
                    effects.addTrauma(1);
                    effects.flash(0xff6b6b, 0.9, 1.1);
                    effects.burst('crash', px, py + 1, pzM, 30, 0, 1);
                    effects.burst('stars', px, py + 1.9, pzM + 0.8, 8, 0, 0.5);
                    phase = 'crashing';
                    crashTimer = 0;
                    audio.setMusic(false);
                    safe(cb.onCrash);
                    break;
                case 'gate':
                    audio.play('gate');
                    gateView.crossed(e.index, e.lane);
                    safe(cb.onGateCross, { index: e.index, lane: e.lane });
                    break;
                default:
                    break;
            }
        }
    }

    // Yalnızca geliştirme sunucusunda: test sayfası botla oynatabilsin. Üretim
    // derlemesinde import.meta.env.DEV false olur ve bu kanca tamamen elenir.
    const devBeforeStep = import.meta.env?.DEV && typeof options.__devBeforeStep === 'function' ? options.__devBeforeStep : null;

    function doStep() {
        if (devBeforeStep) devBeforeStep(sim);
        prevZ = st.z;
        prevX = st.x;
        prevY = st.y;
        const events = sim.step();
        laneVel = ((st.x - prevX) / 1000) * 60;
        processEvents(events);
    }

    function localScore() {
        return computeScore({ segMm: st.segMm, coins: st.coins, gates: st.gates, correct });
    }

    function emitHud() {
        const sc = localScore();
        safe(cb.onHud, {
            score: sc.score,
            distance: Math.floor(st.z / 1000),
            coins: st.coins,
            multiplier: sc.finalMult,
            speedKmh: Math.round(sim.speed() * 0.216),
            magnetPct: Math.round((st.magnetTicks / C.MAGNET_TICKS) * 100),
            shield: st.shield,
            stumbling: st.stumbleTicks > 0,
            tick: st.tick,
        });
    }

    function checkGateApproach() {
        if (approached >= gates.length) return;
        const v = sim.speed();
        const remaining = sim.gateZ(approached) - st.z;
        const seconds = remaining / (v * 60);
        if (seconds <= GATE_APPROACH_S) {
            const index = approached;
            approached++;
            safe(cb.onGateApproach, { index, seconds: Math.max(0, Math.round(seconds * 10) / 10) });
        }
    }

    function finish(crashed) {
        if (ended) return;
        ended = true;
        phase = 'ended';
        audio.setMusic(false);
        const snap = runSnapshot(sim, correct);
        const payload = {
            endTick: snap.endTick,
            inputs: snap.inputs,
            crashed: Boolean(crashed),
            distance: Math.floor(st.z / 1000),
            coins: st.coins,
            gates: st.gates.map((g) => ({ index: g.index, lane: g.lane })),
            localScore: snap.localScore,
        };
        stopLoop();
        // Bağlam kaybında çizim yok (kayıp bağlama render boşuna; three uyarı basar).
        if (!contextLost) renderFrame(0);
        safe(cb.onEnd, payload);
    }

    // --- Girdi ---
    const input = createInput({
        container,
        canvas,
        isActive: () => !paused && !ended && (phase === 'running' || phase === 'countdown'),
        onGesture: () => audio.unlock(),
        // Esc/P ile duraklatma yalnızca arayüz onPause'u dinliyorsa: aksi halde
        // oyun duraklar ama arayüz menüyü göstermez ve oyuncu takılı kalırdı.
        onPauseKey: callbacks.onPause ? () => api.pause() : null,
        onAction(code) {
            // Yalnızca koşarken ve duraklatılmamışken kaydedilir.
            if (paused || phase !== 'running' || destroyed) return;
            sim.input(code);
        },
    });

    // --- Görünürlük / odak ---
    function onVisibility() {
        if (document.visibilityState === 'hidden') autoPause();
    }
    function onBlur() {
        autoPause();
    }
    function autoPause() {
        if (!paused && (phase === 'running' || phase === 'countdown')) {
            doPause();
            safe(cb.onPause, { auto: true });
        }
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);

    // --- Boyut ---
    let ro = null;
    const onWindowResize = () => {
        resizeNow();
        if (!rafId) renderFrame(0);
    };
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(onWindowResize);
        ro.observe(container);
    } else {
        window.addEventListener('resize', onWindowResize);
    }

    // --- WebGL bağlam kaybı ---
    function onContextLost(e) {
        if (destroyed) return;
        e.preventDefault();
        contextLost = true;
        stopLoop();
        if (!ended && (phase === 'running' || phase === 'countdown')) paused = true;
        audio.suspend();
        safe(cb.onError, new Error('Grafik bağlamı kayboldu.'));
    }
    canvas.addEventListener('webglcontextlost', onContextLost);

    // --- Render ---
    function renderFrame(dt) {
        const alpha = phase === 'running' ? stepper.alpha : 1;
        const zMm = prevZ + (st.z - prevZ) * alpha;
        const xM = (prevX + (st.x - prevX) * alpha) / 1000;
        const yM = (prevY + (st.y - prevY) * alpha) / 1000;
        const pzM = zMm / 1000;
        const vNorm = (sim.speed() - C.V0) / (C.VMAX - C.V0);
        const running = phase === 'running' && !paused;

        world.update(pzM);
        // Kamera konumu bir önceki kareden (rig aşağıda güncellenir; fark ihmal edilir).
        gateView.update(zMm, dt, time, camera.position.z);
        playerPos.x = xM;
        playerPos.y = yM;
        playerPos.z = 0;
        entities.update(sim, zMm, dt, time, playerPos, onCoinArrive);

        playerState.x = xM;
        playerState.y = yM;
        playerState.vy = st.vy;
        playerState.speed = speedMs();
        playerState.sliding = st.slideTicks > 0 || st.slideBuffer;
        // slideTicks 40 -> 0 sayar; havadaki tamponlu kaymada ilerleme 0 (top pozu, dönüş yok)
        playerState.slideProgress = st.slideTicks > 0 ? 1 - (st.slideTicks - (phase === 'running' ? stepper.alpha : 0)) / C.SLIDE_TICKS : 0;
        playerState.laneVel = laneVel;
        playerState.running = running || phase === 'crashing';
        playerState.idle = phase === 'idle' || phase === 'countdown';
        playerState.invuln = st.invulnTicks > 0;
        playerState.time = time;
        player.update(dt, playerState);

        fxState.dt = dt;
        fxState.time = time;
        fxState.pzM = pzM;
        fxState.speedNorm = vNorm;
        fxState.shield = st.shield;
        fxState.magnetLeft = st.magnetTicks / 60;
        fxState.running = running;
        effects.update(fxState);

        camState.dt = dt;
        camState.aspect = stage.width / stage.height;
        camState.px = xM;
        camState.py = yM;
        camState.speedNorm = running ? vNorm : 0;
        camState.crashed = phase === 'crashing' || (ended && st.crashed);
        camState.idleTime = time;
        rig.update(camState);
        stage.sky.update(camera.position.x, camera.position.y);

        renderer.render(scene, camera);
    }

    function frame(now) {
        rafId = 0;
        if (destroyed) return;
        rafId = requestAnimationFrame(frame);
        const frameMs = lastNow < 0 ? 16.7 : Math.min(MAX_FRAME_MS, Math.max(0, now - lastNow));
        lastNow = now;
        const dt = frameMs / 1000;
        time += dt;

        if (phase === 'countdown') {
            countdownLeft -= dt;
            const n = Math.ceil(countdownLeft);
            if (n !== countdownShown && n >= 1) {
                countdownShown = n;
                audio.play('count');
                safe(cb.onCountdown, n);
            }
            if (countdownLeft <= 0) {
                phase = 'running';
                countdownShown = 0;
                stepper.reset();
                rig.skipIntro();
                audio.play('go');
                audio.setMusic(true);
                safe(cb.onCountdown, 0);
                emitHud();
            }
        } else if (phase === 'running') {
            const steps = stepper.advance(frameMs);
            for (let i = 0; i < steps; i++) {
                doStep();
                if (phase !== 'running') break;
                if (st.tick >= C.MAX_TICKS) {
                    finish(false);
                    return;
                }
            }
            if (phase === 'running') {
                checkGateApproach();
                hudAcc += frameMs;
                if (hudAcc >= HUD_INTERVAL_MS) {
                    hudAcc = 0;
                    emitHud();
                }
                // Sim'in chunk önbelleği sınırlı kalsın (motor zaten geriye 14 m bakıyor).
                if ((st.tick & 63) === 0) sim.pruneBehind();
            }
        } else if (phase === 'crashing') {
            crashTimer += dt;
            if (crashTimer >= CRASH_TO_END_S) {
                emitHud();
                finish(true);
                return;
            }
        }

        audio.tick();
        renderFrame(dt);

        const r = quality.sample(frameMs);
        if (r != null) {
            renderer.setPixelRatio(r);
            resizeNow();
            applyLite(quality.lite);
        }
    }

    function startLoop() {
        if (rafId || destroyed) return;
        lastNow = -1;
        quality.warmup();
        rafId = requestAnimationFrame(frame);
    }

    function stopLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
    }

    function beginCountdown() {
        phase = 'countdown';
        countdownLeft = COUNTDOWN_S;
        countdownShown = 0;
    }

    function doPause() {
        paused = true;
        input.reset();
        stopLoop();
        audio.suspend();
        // Duraklatma ekranının arkasında son kare kalsın; döngü durur (düşük maliyet).
        if (!destroyed) renderFrame(0);
    }

    // Shader'ları önceden derle: ilk kapı/güçlendirme göründüğünde takılma olmasın.
    try {
        const hidden = [];
        scene.traverse((o) => {
            if (!o.visible) {
                hidden.push(o);
                o.visible = true;
            }
        });
        renderer.compile(scene, camera);
        for (const o of hidden) o.visible = false;
    } catch {
        // Derleme ön ısıtması zorunlu değil.
    }

    const api = {
        start() {
            if (destroyed || ended || contextLost || phase !== 'idle') return;
            audio.unlock();
            beginCountdown();
            emitHud();
            if (firstStart) {
                firstStart = false;
                rig.startIntro();
            }
            if (!paused) startLoop();
        },
        pause() {
            if (destroyed || ended || paused) return;
            if (phase !== 'running' && phase !== 'countdown') return;
            doPause();
            safe(cb.onPause, { auto: false });
        },
        resume() {
            if (destroyed || ended || !paused || contextLost) return;
            paused = false;
            audio.unlock();
            audio.resume();
            if (phase === 'running' || phase === 'countdown') {
                rig.skipIntro();
                beginCountdown();
            }
            startLoop();
        },
        quit() {
            if (destroyed || ended) return;
            finish(phase === 'crashing' || st.crashed);
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            stopLoop();
            canvas.removeEventListener('webglcontextlost', onContextLost);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('blur', onBlur);
            if (ro) ro.disconnect();
            else window.removeEventListener('resize', onWindowResize);
            input.dispose();
            audio.dispose();
            world.dispose();
            entities.dispose();
            gateView.dispose();
            player.dispose();
            effects.dispose();
            tex.glow.dispose();
            tex.window.map.dispose();
            tex.window.emissive.dispose();
            tex.road.dispose();
            tex.coin.dispose();
            tex.sign.dispose();
            tex.curtain.dispose();
            tex.banner.dispose();
            stage.dispose();
        },
        setMuted(m) {
            if (destroyed) return;
            audio.setMuted(Boolean(m));
        },
        /** Yalnızca arka plan müziğini aç/kapat (efektler sürer). */
        setMusicEnabled(m) {
            if (destroyed) return;
            audio.setMusicEnabled(Boolean(m));
        },
        setGateResult(index, isCorrect, correctLane) {
            if (destroyed) return;
            if (!Number.isInteger(index) || index < 0 || index >= gates.length) return;
            if (correct[index] === true || correct[index] === false) return;
            const ok = Boolean(isCorrect);
            correct[index] = ok;
            const lane = Number.isInteger(correctLane) && correctLane >= 0 && correctLane <= 2 ? correctLane : -1;
            gateView.result(index, ok, lane);
            if (ended) return;
            const pzM = st.z / 1000;
            const px = st.x / 1000;
            const py = st.y / 1000;
            if (ok) {
                audio.play('correct');
                effects.flash(0x34f5a0, 0.7, 1.4);
                effects.burst('confetti', px, py + 1.2, pzM, 40, speedMs(), 1.4);
            } else {
                audio.play('wrong');
                effects.flash(0xff3b5c, 0.7, 1.4);
                effects.burst('wrong', px, py + 1.2, pzM, 16, speedMs(), 1);
                effects.addTrauma(0.25);
            }
            emitHud();
        },
        isPaused() {
            return paused;
        },
        /**
         * Oyunu bitirmeden o anki bitiş yükü: { endTick, inputs, localScore }.
         * Sayfa kapanırken / gizlenirken açık dereceli koşuyu kaydetmek için.
         * Sim CPU'da olduğundan bağlam kaybında da geçerli; arayüz bunu
         * destroy()'dan ÖNCE çağırmalı (sonra da çalışır ama motor kapanmıştır).
         */
        snapshot() {
            return runSnapshot(sim, correct);
        },
        /** Test/teşhis: render istatistikleri. */
        getStats() {
            const info = renderer.info;
            return {
                drawCalls: info.render.calls,
                triangles: info.render.triangles,
                geometries: info.memory.geometries,
                textures: info.memory.textures,
                pixelRatio: renderer.getPixelRatio(),
                quality: liteOn ? 'low' : 'normal',
                phase,
            };
        },
    };

    // İlk kare: başlamadan önce sahne (karakter tanıtımı) görünsün.
    startLoop();
    return api;
}
