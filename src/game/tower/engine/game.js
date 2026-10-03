/*
 * Kule oyunu yöneticisi: sim + render döngüsü + girdi + ses + arayüz geri
 * çağrıları (şartname §B.2, sözleşme §E.5).
 *
 * Döngü: sim sabit 60 Hz (fixedStep), render ekran hızında. Hareketli kat
 * iki tick arasında kesirli t' ile akıcı çizilir (cameraMath.pingPongMm).
 * Sim gerçek zamandan hızlı koşamaz (kare süresi 250 ms ile sınırlı,
 * duraklatmada adım yok): sunucunun süre kontrolü buna dayanıyor.
 *
 * Güvenlik: istemci yalnızca girdi kaydını ve endTick'i üretir; puanı
 * sunucu replay'le yeniden hesaplar. Soru cevabının doğruluğunu arayüz
 * sunucudan öğrenip setAnswerResult ile bildirir; o zamana kadar HUD puanı
 * cevabı saymaz.
 *
 * Durumlar: idle -> countdown -> running -> crashing -> ended
 * (paused bayrağı countdown/running üstüne biner). Oyun bitince kamera
 * kulenin tamamını gösterecek şekilde geri çekilir ve birkaç saniye
 * etrafında döner (sonuç ekranının arka planı), sonra döngü durur.
 */
import * as THREE from 'three';
import { TC, computeTowerScore, createTowerSim } from '../sim/index.js';
import { createFixedStepper, MAX_FRAME_MS } from '../../runner/engine/fixedStep.js';
import { createQualityController, initialPixelRatio } from '../../runner/engine/quality.js';
import { isCoarsePointer } from '../../runner/engine/webgl.js';
import { clamp, damp, easeOutBack, lerp, smoothstep } from '../../runner/engine/mathUtils.js';
import { createStage, VFOV } from './stage.js';
import { createCity } from './city.js';
import { createTower } from './tower.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createAvatarTop } from './avatarTop.js';
import { createSkyState, paletteHue, skyAt } from './palette.js';
import {
    BASE_H,
    FLOOR_H,
    MM,
    PLAY_AZ,
    PLAY_EL,
    cameraDir,
    floorTopY,
    pingPongMm,
    playDistance,
    playLookLift,
    playPitch,
    playSway,
    rectCoversPoint,
    revealDistance,
} from './cameraMath.js';
import { GUIDE_FLOORS, alignment, tapDecision } from './tapAssist.js';

const COUNTDOWN_S = 3;
const CRASH_TO_END_S = 1.5;
const REVEAL_S = 2.2;
// Oyun bitince kamera bu kadar süre daha döner, sonra döngü durur (pil).
const AFTER_END_S = 7;
const INTRO_S = 2.6;
// Kamera: 45° azimut (iki eksen de yana kayar), alçak bakış (gökyüzü görünsün).
// Azimut salınımı ve kadraj cameraMath'te (playSway / playDistance).
const AZ0 = PLAY_AZ;
const EL = PLAY_EL;
const PITCH = 0.136;
const EL_REVEAL = 0.3;
const PITCH_REVEAL = 0.2;
// Erken/geç uyarısı en sık bu aralıkla (ms): basılı tutulan parmak titreşim yağdırmasın.
const NUDGE_GAP_MS = 350;
// Hareketli kat karakterin ayaklarına bu kadar (mm) yaklaşınca üstünden atlar.
const AVATAR_HOP_MARGIN_MM = 250;

function noop() {}

function validateQuestions(questions) {
    if (questions == null) return [];
    if (!Array.isArray(questions)) throw new TypeError('questions bir dizi olmalı.');
    const sorted = questions.slice().sort((a, b) => a.index - b.index);
    sorted.forEach((q, i) => {
        if (!q || q.index !== i) throw new TypeError('Soru indeksleri 0..n-1 olmalı.');
    });
    if (sorted.length > TC.MAX_QUESTIONS) throw new TypeError('Çok fazla soru.');
    return sorted;
}

export async function createTowerGame(options = {}) {
    const {
        container,
        questions: questionsIn,
        avatar = null,
        gender = null,
        seed = null,
        muted = false,
        reducedMotion = false,
        callbacks = {},
    } = options;
    const musicEnabled = options.music ?? options.musicEnabled ?? true;
    if (!container || typeof container.appendChild !== 'function') {
        throw new TypeError('createTowerGame: container bir DOM elemanı olmalı.');
    }
    const questions = validateQuestions(questionsIn);
    const sim = createTowerSim({ questionCount: questions.length });
    const cb = {
        onHud: callbacks.onHud || noop,
        onPlace: callbacks.onPlace || noop,
        onQuestion: callbacks.onQuestion || noop,
        onAnswer: callbacks.onAnswer || noop,
        onMiss: callbacks.onMiss || noop,
        onEnd: callbacks.onEnd || noop,
        onCountdown: callbacks.onCountdown || noop,
        onError: callbacks.onError || noop,
        onHaptic: callbacks.onHaptic || noop,
        onPause: callbacks.onPause || noop,
        onNudge: callbacks.onNudge || noop,
    };
    const safe = (fn, ...args) => {
        try {
            fn(...args);
        } catch (err) {
            // Arayüz geri çağrısındaki hata oyun döngüsünü öldürmesin.
            console.error('[tower] callback hatası', err);
        }
    };

    // --- Kurulum ---
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const coarse = isCoarsePointer();
    const quality = createQualityController({ dpr });
    const hue0 = paletteHue(seed);
    const built = [];
    let stage;
    let boxGeo;
    let city;
    let tower;
    let effects;
    let audio;
    let avatarTop;
    try {
        stage = createStage(container, { antialias: !coarse && dpr < 1.5, pixelRatio: initialPixelRatio(dpr) });
        built.push(stage);
        boxGeo = new THREE.BoxGeometry(1, 1, 1);
        built.push(boxGeo);
        city = createCity(stage.scene, { boxGeometry: boxGeo, seed: Number.isFinite(seed) ? seed : 7 });
        built.push(city);
        tower = createTower(stage.scene, { boxGeometry: boxGeo, hue0, questionCount: questions.length });
        built.push(tower);
        effects = createEffects(stage.scene, { reducedMotion });
        built.push(effects);
        audio = createAudio({ muted, musicEnabled });
        avatarTop = createAvatarTop(stage.scene, { avatar, gender, detail: coarse ? 'low' : 'high' });
        built.push(avatarTop);
    } catch (err) {
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
    const stepper = createFixedStepper();

    // --- Durum ---
    const st = sim.state;
    let phase = 'idle';
    let paused = false;
    let destroyed = false;
    let ended = false;
    let contextLost = false;
    let rafId = 0;
    let lastNow = -1;
    let time = 0;
    let countdownLeft = 0;
    let countdownShown = 0;
    let crashTimer = 0;
    let afterEnd = 0;
    let introT = -1;
    let revealT = -1;
    let spawnPop = 1;
    let lastTapTick = -1;
    let lastNudgeAt = -Infinity;
    let answerQueued = false;
    // Hareketli kat karakterin ayaklarının altında mı (ip atlama zıplaması için)
    let wasCovered = false;
    let warping = false;
    const correct = []; // soru index -> true / false (sunucudan)

    // Kamera ve görsel durum (her kare yeniden kullanılır)
    let camFloor = 0;
    let focusX = 0;
    let focusZ = 0;
    const dir = { x: 0, y: 0, z: 0 };
    const lookAt = new THREE.Vector3();
    const sky = createSkyState();
    const hud = { score: 0, floor: 0, combo: 0, perfect: 0, maxCombo: 0 };

    let liteOn = false;
    function applyLite(on) {
        if (on === liteOn) return;
        liteOn = on;
        stage.setLite(on);
        city.setLite(on);
        effects.setLite(on);
    }

    function resizeNow() {
        stage.resize();
    }

    function localScore() {
        return computeTowerScore({ basePoints: st.basePoints, answers: st.answers, correct }).score;
    }

    function emitHud() {
        hud.score = localScore();
        hud.floor = st.floor;
        hud.combo = st.combo;
        hud.perfect = st.perfects;
        hud.maxCombo = st.maxCombo;
        safe(cb.onHud, hud);
    }

    function haptic(style) {
        safe(cb.onHaptic, style);
    }

    // Son yerleşen katın merkezi / yarı boyları (metre).
    const top = { cx: 0, cz: 0, hx: 1.5, hz: 1.5 };
    function readTop() {
        const p = st.prev;
        top.cx = ((p.x0 + p.x1) / 2) * MM;
        top.cz = ((p.z0 + p.z1) / 2) * MM;
        top.hx = ((p.x1 - p.x0) / 2) * MM;
        top.hz = ((p.z1 - p.z0) / 2) * MM;
        return top;
    }

    // Hareketli katın aralıkları (mm), kesirli ofsetle.
    const mv = { x0: 0, x1: 0, z0: 0, z1: 0 };
    function movingRect(off) {
        const p = st.prev;
        const isX = st.axis === 'x';
        mv.x0 = p.x0 + (isX ? off : 0);
        mv.x1 = p.x1 + (isX ? off : 0);
        mv.z0 = p.z0 + (isX ? 0 : off);
        mv.z1 = p.z1 + (isX ? 0 : off);
        return mv;
    }

    // --- Olaylar ---
    function processEvents(events) {
        for (let i = 0; i < events.length; i++) {
            const e = events[i];
            if (warping) {
                if (e.type === 'place') tower.placeFloor(e.floor, st.prev.x0, st.prev.x1, st.prev.z0, st.prev.z1);
                continue;
            }
            switch (e.type) {
                case 'spawn':
                    spawnPop = 0;
                    wasCovered = false;
                    break;
                case 'place': {
                    const k = e.floor;
                    const p = st.prev;
                    tower.placeFloor(k, p.x0, p.x1, p.z0, p.z1);
                    const t = readTop();
                    const y = floorTopY(k);
                    if (e.cut) {
                        const c = e.cut;
                        const side = c.from >= (c.axis === 'x' ? p.x1 : p.z1) ? 1 : -1;
                        if (c.axis === 'x') tower.dropPiece(k, c.from, c.to, p.z0, p.z1, 'x', side);
                        else tower.dropPiece(k, p.x0, p.x1, c.from, c.to, 'z', side);
                        audio.play('place');
                        audio.play('cut');
                        effects.sparkle(t.cx, y, t.cz, t.hx, t.hz, 6, 'dust');
                        haptic('light');
                    } else if (e.perfect) {
                        tower.flash(k);
                        effects.ring(t.cx, y, t.cz, t.hx, t.hz, e.combo >= 5);
                        effects.sparkle(t.cx, y, t.cz, t.hx, t.hz, 12 + Math.min(e.combo, 10) * 3, 'perfect');
                        audio.play('perfect', e.combo);
                        if (e.grew > 0) {
                            audio.play('grow');
                            effects.sparkle(t.cx, y, t.cz, t.hx, t.hz, 10, 'grow');
                        }
                        if (e.combo >= 2) avatarTop.cheer();
                        haptic(e.combo >= 5 && e.combo % 5 === 0 ? 'success' : 'medium');
                    }
                    // Avatar yeni oturan kata tırmanır (kesikte merkez de kaymış olabilir).
                    avatarTop.hop(0.3, 0.5);
                    wasCovered = false;
                    safe(cb.onPlace, { perfect: e.perfect, combo: e.combo, floor: k, grew: e.grew > 0 });
                    emitHud();
                    break;
                }
                case 'miss': {
                    const k = e.floor;
                    const r = movingRect(st.off);
                    tower.dropPiece(k, r.x0, r.x1, r.z0, r.z1, st.axis, st.off >= 0 ? 1 : -1);
                    tower.setMoving(false);
                    audio.play('miss');
                    effects.addTrauma(0.75);
                    haptic('heavy');
                    // Karakter zaten sağlam katta: küçük bir sendeleme.
                    avatarTop.hop(0.25, 0.25);
                    avatarTop.setSad(true);
                    wasCovered = false;
                    phase = 'crashing';
                    crashTimer = 0;
                    revealT = 0;
                    audio.setMusic(false);
                    safe(cb.onMiss);
                    break;
                }
                case 'question':
                    audio.play('question');
                    haptic('selection');
                    safe(cb.onQuestion, { index: e.index, seconds: TC.QUESTION_TICKS / TC.TICK_RATE });
                    break;
                case 'answer':
                    answerQueued = false;
                    if (e.choice < 0) {
                        audio.play('wrong');
                        haptic('warning');
                    }
                    safe(cb.onAnswer, { index: e.index, choice: e.choice });
                    break;
                default:
                    break;
            }
        }
    }

    // Yalnızca geliştirme sunucusunda: test sayfası botla oynatabilsin (seçenekle
    // ya da sayfa üzerinden window.__TOWER_DEV__ ile). Üretim derlemesinde
    // import.meta.env.DEV false olur ve kanca tamamen elenir.
    const devHooks = import.meta.env?.DEV ? { ...(typeof window !== 'undefined' ? window.__TOWER_DEV__ : null), ...options } : null;
    const devBeforeStep = devHooks && typeof devHooks.__devBeforeStep === 'function' ? devHooks.__devBeforeStep : null;

    function doStep() {
        if (devBeforeStep) devBeforeStep(sim);
        processEvents(sim.step());
    }

    function snapshotPayload() {
        return { endTick: st.tick, inputs: sim.encodeInputs(), localScore: localScore() };
    }

    function finish(crashed) {
        if (ended) return;
        ended = true;
        phase = 'ended';
        afterEnd = 0;
        if (revealT < 0) revealT = 0;
        tower.setMoving(false);
        audio.setMusic(false);
        avatarTop.setSad(Boolean(crashed) && st.floor < 10);
        if (st.floor >= 10) avatarTop.cheer();
        const snap = snapshotPayload();
        emitHud();
        safe(cb.onEnd, {
            endTick: snap.endTick,
            inputs: snap.inputs,
            crashed: Boolean(crashed),
            floor: st.floor,
            perfects: st.perfects,
            maxCombo: st.maxCombo,
            answers: st.answers.map((a) => ({ index: a.index, choice: a.choice })),
            localScore: snap.localScore,
        });
    }

    // --- Girdi ---
    // tapG: tapDecision'ın girdisi (her dokunuşta yeniden doldurulur).
    const tapG = { phase: '', paused: false, ended: false, simPhase: '', tick: 0, lastTapTick: -1, floor: 0, off: 0, size: 0, t: 0, v: 0, R: TC.R };
    function tap() {
        if (destroyed) return;
        // Sim girdiyi bir sonraki adımda o anki st.off ile işler: karar onunla.
        const p = st.prev;
        tapG.phase = phase;
        tapG.paused = paused;
        tapG.ended = ended;
        tapG.simPhase = st.phase;
        tapG.tick = st.tick;
        tapG.lastTapTick = lastTapTick;
        tapG.floor = st.floor;
        tapG.off = st.off;
        tapG.size = st.axis === 'x' ? p.x1 - p.x0 : p.z1 - p.z0;
        tapG.t = st.t;
        tapG.v = st.v;
        const d = tapDecision(tapG);
        if (d === 'ignore') return;
        if (d === 'early' || d === 'late') {
            // İlk katlarda erken/geç dokunuş sim'e gitmez (kayda girmeyen girdi
            // uygulanmaz da: sunucu replay'i etkilenmez); oyun bitmez, uyarı çıkar.
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (now - lastNudgeAt >= NUDGE_GAP_MS) {
                lastNudgeAt = now;
                effects.addTrauma(0.12);
                haptic('light');
                safe(cb.onNudge, { kind: d, floor: st.floor + 1 });
            }
            return;
        }
        if (sim.input('T')) lastTapTick = st.tick;
    }

    function answer(choice) {
        if (paused || ended || destroyed || phase !== 'running') return false;
        if (st.phase !== 'question' || answerQueued) return false;
        if (choice !== 0 && choice !== 1) return false;
        const ok = sim.input(choice === 1 ? 'B' : 'A');
        if (ok) {
            answerQueued = true;
            audio.play('select');
        }
        return ok;
    }

    const input = createInput({
        container,
        canvas,
        isActive: () => !paused && !ended && (phase === 'running' || phase === 'countdown'),
        onGesture: () => audio.unlock(),
        onPauseKey: callbacks.onPause ? () => api.pause() : null,
        onTap: tap,
        onChoice: (c) => answer(c),
    });

    // --- Görünürlük / odak ---
    function autoPause() {
        if (!paused && !ended && (phase === 'running' || phase === 'countdown')) {
            doPause();
            safe(cb.onPause, { auto: true });
        }
    }
    function onVisibility() {
        if (document.visibilityState === 'hidden') autoPause();
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', autoPause);

    // --- Boyut ---
    let ro = null;
    const onWindowResize = () => {
        resizeNow();
        if (!rafId && !destroyed && !contextLost) renderFrame(0);
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
        const running = phase === 'running' && !paused;
        const aspect = stage.width / stage.height;

        // Hareketli kat (kesirli t': iki tick arası akıcı)
        let slabTopY = -1;
        if (st.phase === 'moving' && !ended && phase !== 'crashing') {
            const k = st.floor + 1;
            const t = st.t + (running ? Math.min(stepper.alpha, 1) : 0);
            const offNow = pingPongMm(t, st.v, TC.R);
            const r = movingRect(offNow);
            spawnPop = Math.min(1, spawnPop + dt / 0.14);
            // İlk katlarda hedef vurgusu: kulenin üst kenarı parlar, kat
            // üstüne geldikçe hem çerçeve hem kat aydınlanır.
            let glow = 0;
            if (k <= GUIDE_FLOORS) {
                const p = st.prev;
                const size = st.axis === 'x' ? p.x1 - p.x0 : p.z1 - p.z0;
                glow = alignment(offNow, size);
                tower.setGuide(true, p.x0, p.x1, p.z0, p.z1, floorTopY(st.floor), glow, time);
            } else {
                tower.setGuide(false);
            }
            tower.setMoving(true, k, r.x0, r.x1, r.z0, r.z1, easeOutBack(spawnPop), glow * 0.55);
            slabTopY = floorTopY(k);
        } else {
            tower.setMoving(false);
            tower.setGuide(false);
        }

        // Kamera hedefi: kulenin tepesi (yumuşak takip)
        const t0 = readTop();
        camFloor = dt > 0 ? damp(camFloor, st.floor, 6, dt) : camFloor;
        focusX = dt > 0 ? damp(focusX, t0.cx, 4, dt) : focusX;
        focusZ = dt > 0 ? damp(focusZ, t0.cz, 4, dt) : focusZ;
        let focusY = floorTopY(camFloor) + FLOOR_H * 0.5;
        let dist = playDistance(aspect, VFOV);
        let el = EL;
        // Bakış açısı: yatayda (aspect >= 1) pitchPlay ≈ PITCH; dikeyde kule
        // tepesi ekranın ortasına yaklaşır (cameraMath.playPitch).
        const pitchPlay = playPitch(aspect, VFOV, EL);
        const dPitch = pitchPlay - PITCH;
        let pitch = pitchPlay;
        const sway = playSway(aspect);
        let az = AZ0 + (reducedMotion ? 0 : sway * Math.sin(time * 0.085));

        if (introT >= 0) {
            introT += dt;
            const p = smoothstep(0, 1, clamp(introT / INTRO_S, 0, 1));
            dist = lerp(dist * 2.8, dist, p);
            el = lerp(0.62, EL, p);
            // Bakış da birlikte iner: kule geniş planda da ekranın ortasında kalsın.
            pitch = lerp(0.56 + dPitch, pitchPlay, p);
            az += lerp(1.1, 0, p);
            focusY = lerp(focusY + 6, focusY, p);
            if (p >= 1) introT = -1;
        }
        if (revealT >= 0) {
            revealT += dt;
            const p = smoothstep(0, 1, clamp(revealT / REVEAL_S, 0, 1));
            const topY = floorTopY(st.floor);
            dist = lerp(dist, revealDistance(topY, aspect, VFOV), p);
            focusY = lerp(focusY, (topY - BASE_H) / 2, p);
            focusX = lerp(focusX, 0, p * 0.5);
            focusZ = lerp(focusZ, 0, p * 0.5);
            el = lerp(el, EL_REVEAL, p);
            pitch = lerp(pitch, PITCH_REVEAL, p);
            if (!reducedMotion) az += Math.max(0, revealT - 0.6) * 0.16;
        }

        cameraDir(az, el, dir);
        const sh = effects.shake;
        camera.position.set(focusX + dir.x * dist + sh.x, focusY + dir.y * dist + sh.y, focusZ + dir.z * dist + sh.z);
        const lift = playLookLift(dist, el, pitch);
        lookAt.set(focusX + sh.x * 0.5, focusY + lift, focusZ + sh.z * 0.5);
        camera.lookAt(lookAt);

        // Gökyüzü ve sis: yükseklik (kat) ile
        skyAt(camFloor, sky);
        // Sis kameraya göre: şehir uzakta ufka karışır. Yükseldikçe sis açılır ki
        // aşağıdaki şehrin ışıkları (gece) pusun arasından seçilsin.
        const alt = camera.position.y + BASE_H;
        const fogNear = dist + 8 + alt * 0.5;
        const fogFar = dist + 160 + alt * 1.4;
        stage.setSky(sky, time, 0.075 - Math.min(0.2, camFloor * 0.0016));
        stage.followCamera();
        city.update(sky, fogNear, fogFar, time);
        tower.setEnv(sky, fogNear, fogFar);
        tower.update(dt, revealT >= 0 ? null : focusY);
        effects.update(dt, time);

        // Avatar: her zaman oturmuş en üst katın ortasında. Hareketli kat
        // (bir üst kat hacmini süpürür) ayaklarına gelince üstüne zıplar,
        // geçince geri iner: ip atlama gibi; kat bacaklarının içinden geçmez.
        avatarTop.update(dt, time, t0.cx, avatarTargetY(slabTopY, t0), t0.cz, az + Math.PI);

        renderer.render(scene, camera);
    }

    function avatarTargetY(slabTopY, t0) {
        const covered = slabTopY >= 0 && rectCoversPoint(mv, t0.cx / MM, t0.cz / MM, AVATAR_HOP_MARGIN_MM);
        if (covered !== wasCovered) {
            wasCovered = covered;
            avatarTop.hop(0.16, 0.3);
        }
        return covered ? slabTopY : floorTopY(st.floor);
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
                introT = -1;
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
                if (st.tick >= TC.MAX_TICKS) {
                    finish(false);
                    break;
                }
            }
        } else if (phase === 'crashing') {
            crashTimer += dt;
            if (crashTimer >= CRASH_TO_END_S) finish(true);
        } else if (phase === 'ended') {
            afterEnd += dt;
            if (afterEnd >= AFTER_END_S) {
                renderFrame(dt);
                stopLoop();
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
        if (rafId || destroyed || contextLost) return;
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
        stopLoop();
        audio.suspend();
        if (!destroyed && !contextLost) renderFrame(0);
    }

    // Yalnızca geliştirme: test sayfası belirli bir kata "ışınlanabilsin" (kat
    // 80/160 görünümleri). Bot kancasıyla sessizce oynatılır; üretimde elenir.
    const devWarp = devBeforeStep && Number.isInteger(devHooks.__devWarpFloors) ? devHooks.__devWarpFloors : 0;
    if (devWarp > 0) {
        warping = true;
        while (st.floor < devWarp && !st.crashed && st.tick < TC.MAX_TICKS) doStep();
        warping = false;
        camFloor = st.floor;
        readTop();
        focusX = top.cx;
        focusZ = top.cz;
    }

    // Başlangıç: avatar tabanın üstünde; kamera tanıtım (geniş plan) konumunda.
    avatarTop.snapTo(0, 0, 0);
    tower.prewarm();
    if (!reducedMotion) introT = 0;

    // Shader'ları önceden derle: ilk mükemmel/kesik anında takılma olmasın.
    try {
        renderer.compile(scene, camera);
    } catch {
        // Derleme ön ısıtması zorunlu değil.
    }

    const api = {
        start() {
            if (destroyed || ended || contextLost || phase !== 'idle') return;
            audio.unlock();
            beginCountdown();
            emitHud();
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
                introT = -1;
                beginCountdown();
            }
            startLoop();
        },
        quit() {
            if (destroyed || ended) return;
            paused = false;
            finish(phase === 'crashing' || st.crashed);
            startLoop();
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            stopLoop();
            canvas.removeEventListener('webglcontextlost', onContextLost);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('blur', autoPause);
            if (ro) ro.disconnect();
            else window.removeEventListener('resize', onWindowResize);
            input.dispose();
            audio.dispose();
            avatarTop.dispose();
            effects.dispose();
            tower.dispose();
            city.dispose();
            boxGeo.dispose();
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
        /** Arayüzün şık butonları: 0 | 1. Soru açık değilse false. */
        answer,
        /** Sunucunun cevap sonucu: HUD puanına girer, efekt/ses çalar. */
        setAnswerResult(index, isCorrect) {
            if (destroyed) return;
            if (!Number.isInteger(index) || index < 0 || index >= questions.length) return;
            if (correct[index] === true || correct[index] === false) return;
            const ok = Boolean(isCorrect);
            correct[index] = ok;
            if (!ended) {
                const t = readTop();
                const y = floorTopY(st.floor);
                if (ok) {
                    audio.play('correct');
                    effects.burst(t.cx, y + 0.6, t.cz, 36, 'gold');
                    effects.ring(t.cx, y, t.cz, t.hx, t.hz, true);
                    avatarTop.cheer();
                    haptic('success');
                } else {
                    audio.play('wrong');
                    effects.addTrauma(0.2);
                    haptic('error');
                }
            }
            emitHud();
        },
        /** Kullanıcının karakteri değişti (gömülü modda canlı güncelleme). */
        setAvatar(config) {
            if (destroyed) return;
            avatarTop.setConfig(config);
        },
        isPaused() {
            return paused;
        },
        /**
         * Oyunu bitirmeden o anki bitiş yükü: { endTick, inputs, localScore }.
         * Sayfa kapanırken / gizlenirken açık koşuyu kaydetmek için; sim
         * CPU'da olduğundan bağlam kaybında da geçerli.
         */
        snapshot() {
            return snapshotPayload();
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
                chunks: tower.chunkCount,
                phase,
                floor: st.floor,
            };
        },
    };

    // İlk kare: başlamadan önce sahne görünsün.
    renderFrame(0);
    return api;
}
