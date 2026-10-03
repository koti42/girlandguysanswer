/*
 * 3D karakter önizlemesi: karakter editörü (/oyun/karakter), profil "3D gör"
 * penceresi ve mobil uygulamanın gömülü önizlemesi (embed ?game=avatar).
 *
 * createAvatarViewer({ container, config, transparent, autoRotate, onReady })
 *   -> { setConfig(config), resize(), destroy() }
 *
 *  - Sürükleyerek döndürme (fare + dokunmatik; dikey kaydırma sayfaya kalır),
 *    bırakınca ataletle yavaşlar; bir süre dokunulmazsa yavaş tur (autoRotate).
 *  - Hafif bekleme animasyonu; dokununca kutlama + (varsa) koşu izi demosu;
 *    koşu izi değişince kısa demo.
 *  - Düşük maliyet: yalnızca animasyon/etkileşim varken çizilir; yalnızca
 *    bekleme animasyonu sürerken ~30 fps. Ekran dışında / sekme gizliyken
 *    döngü durur. "Hareketi azalt" tercihinde animasyon yok, yalnızca
 *    değişimde çizilir.
 *  - WebGL2 yoksa (ya da bağlam açılamazsa) onReady(false); dönen API boş
 *    işlemlerdir (çağıran 2D portreye düşer).
 */
import * as THREE from 'three';
import { buildAvatar, createPoseTarget, blendPose, poseIdle, poseRun, poseCheer } from './build3d.js';
import { normalizeAvatar } from './catalog.js';
import { isWebGLAvailable } from '../runner/engine/webgl.js';
import { createGlowTexture } from '../runner/engine/textures.js';
import { createTrail } from '../runner/engine/trail.js';

const FOV = 28;
const LOOK_Y = 0.9;
const FRAME_H = 2.1; // dikeyde sığacak yükseklik (m)
const FRAME_W = 1.0;
const IDLE_FRAME_MS = 1000 / 30;
const AUTO_ROTATE_SPEED = 0.35; // rad/s
const AUTO_ROTATE_AFTER_S = 3;
const DEMO_S = 2.4;
const CHEER_S = 1.6;
const TAP_PX = 8;
const DEMO_SPEED = 3.4; // sanal ileri hız (m/s): iz karakterin arkasına aksın

const NOOP_API = { setConfig() {}, resize() {}, destroy() {} };

function prefersReducedMotion() {
    try {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
        return false;
    }
}

/** Opak zemin: koyu lacivert -> mor dikey degrade (Oyun Merkezi ile uyumlu). */
function createBackdrop() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2a1a5e');
    gr.addColorStop(0.6, '#1a1240');
    gr.addColorStop(1, '#0f0b26');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

export function createAvatarViewer({ container, config, transparent = false, autoRotate = true, onReady } = {}) {
    if (!container || typeof container.appendChild !== 'function') {
        throw new TypeError('createAvatarViewer: container bir DOM elemanı olmalı.');
    }
    const ready = (ok) => {
        try {
            onReady?.(ok);
        } catch (err) {
            console.error('[avatar] onReady hatası', err);
        }
    };
    if (!isWebGLAvailable()) {
        Promise.resolve().then(() => ready(false));
        return NOOP_API;
    }

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: transparent, powerPreference: 'low-power', preserveDrawingBuffer: false });
    } catch {
        Promise.resolve().then(() => ready(false));
        return NOOP_API;
    }
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    renderer.setPixelRatio(Math.min(dpr, 2));
    renderer.setClearColor(0x000000, transparent ? 0 : 1);
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    // Yatay sürükleme döndürür; dikey kaydırma sayfanın (mobil editör).
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    canvas.style.userSelect = 'none';
    canvas.style.webkitTapHighlightColor = 'transparent';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Oyun karakteri önizlemesi; döndürmek için sürükle');
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const backdrop = transparent ? null : createBackdrop();
    if (backdrop) scene.background = backdrop;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    // Karakter -z'ye bakar; kamera önünde (-z) durup yüzüne bakar.
    camera.position.set(0, LOOK_Y + 0.1, -4.2);
    camera.lookAt(0, LOOK_Y, 0);

    scene.add(new THREE.HemisphereLight(0xe2d8ff, 0x6a4a5a, 1.7));
    const key = new THREE.DirectionalLight(0xfff1e6, 1.9);
    key.position.set(-2.2, 3.2, -3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8ad8, 1.3);
    rim.position.set(2.5, 2, 3);
    scene.add(rim);

    const glowTex = createGlowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: transparent ? 0.28 : 0.45, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.scale.set(0.95, 1, 0.95);
    shadow.position.y = 0.002;
    scene.add(shadow);
    // Opak zeminde altta yumuşak bir ışık halkası (sahne/podyum hissi).
    let ring = null;
    let ringGeo = null;
    let ringMat = null;
    if (!transparent) {
        ringGeo = new THREE.RingGeometry(0.42, 0.47, 48);
        ringGeo.rotateX(-Math.PI / 2);
        ringMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
        ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.004;
        scene.add(ring);
    }

    const yaw = new THREE.Group();
    scene.add(yaw);
    let cfg = normalizeAvatar(config);
    const avatar = buildAvatar(cfg, { detail: 'high' });
    yaw.add(avatar.root);
    const rig = avatar.rig;
    const target = createPoseTarget(rig);
    poseIdle(rig, 0);
    const trail = createTrail(yaw, { kind: cfg.trail });

    // --- Durum ---
    const reduced = prefersReducedMotion();
    let destroyed = false;
    let rafId = 0;
    let lastNow = -1;
    let lastDraw = -1;
    let time = 0;
    let angle = 0.5; // hafif yandan başla (3/4 görünüm)
    let angVel = 0;
    let idleFor = 0;
    let dragging = false;
    let dragId = -1;
    let dragX = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartT = 0;
    let lastMoveT = 0;
    let demoT = -1;
    let cheerT = -1;
    let runPhase = 0;
    let refZ = 0;
    let visible = true;
    let readySent = false;
    let dirty = true;
    yaw.rotation.y = angle;

    const _a = new THREE.Vector3();

    function fit() {
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Hem boy hem en sığsın.
        const t = Math.tan((FOV * Math.PI) / 360);
        const dH = FRAME_H / 2 / t;
        const dW = FRAME_W / 2 / (t * camera.aspect);
        const dist = Math.max(dH, dW);
        camera.position.set(0, LOOK_Y + 0.12, -dist);
        camera.lookAt(0, LOOK_Y, 0);
        camera.updateProjectionMatrix();
        trail.setPixelScale(h * renderer.getPixelRatio(), FOV);
        dirty = true;
    }
    fit();

    function animating() {
        if (dragging || Math.abs(angVel) > 0.01 || demoT >= 0 || cheerT >= 0) return true;
        if (reduced) return false;
        return true; // bekleme animasyonu / yavaş tur
    }

    function step(dt) {
        time += dt;
        // Döndürme: sürükleme > atalet > yavaş tur
        if (!dragging) {
            if (Math.abs(angVel) > 0.01) {
                angle += angVel * dt;
                angVel *= Math.exp(-3.5 * dt);
            } else {
                angVel = 0;
            }
            idleFor += dt;
            if (autoRotate && !reduced && idleFor > AUTO_ROTATE_AFTER_S) angle += AUTO_ROTATE_SPEED * dt;
        }
        yaw.rotation.y = angle;

        // Poz: demo (koşu) > kutlama > bekleme
        let lambda = 8;
        let emitting = false;
        if (demoT >= 0) {
            demoT += dt;
            runPhase += dt * 9;
            poseRun(target, runPhase, 0.4);
            lambda = 14;
            emitting = demoT < DEMO_S - 0.35;
            refZ += DEMO_SPEED * dt;
            if (demoT > DEMO_S) demoT = -1;
        } else if (cheerT >= 0) {
            cheerT += dt;
            poseCheer(target, cheerT);
            lambda = 12;
            if (cheerT > CHEER_S) cheerT = -1;
        } else {
            poseIdle(target, reduced ? 0 : time);
            refZ += DEMO_SPEED * dt; // söndürme sırasında iz geride kalsın
        }
        blendPose(rig, target, 1 - Math.exp(-lambda * dt));
        if (ring) ringMat.opacity = 0.4 + 0.15 * Math.sin(time * 2);

        // İz: çapa konumu dönen grubun uzayında
        yaw.updateMatrixWorld(true);
        rig.trailAnchor.getWorldPosition(_a);
        yaw.worldToLocal(_a);
        trail.update(dt, _a.x, _a.y, _a.z, refZ, emitting, DEMO_SPEED);
    }

    function draw() {
        renderer.render(scene, camera);
        dirty = false;
        if (!readySent) {
            readySent = true;
            ready(true);
        }
    }

    function frame(now) {
        rafId = 0;
        if (destroyed || !visible) return;
        const dtMs = lastNow < 0 ? 16.7 : Math.min(100, now - lastNow);
        lastNow = now;
        const anim = animating();
        const interactive = dragging || Math.abs(angVel) > 0.01 || demoT >= 0 || cheerT >= 0;
        // Yalnızca bekleme animasyonu sürüyorsa ~30 fps yeter.
        if (anim && !interactive && lastDraw >= 0 && now - lastDraw < IDLE_FRAME_MS - 2) {
            rafId = requestAnimationFrame(frame);
            return;
        }
        const dt = lastDraw < 0 ? dtMs / 1000 : Math.min(0.1, (now - lastDraw) / 1000);
        lastDraw = now;
        if (anim || dirty) {
            step(anim ? dt : 0);
            draw();
        }
        if (animating()) rafId = requestAnimationFrame(frame);
        else lastDraw = -1;
    }

    function requestFrame() {
        if (destroyed || rafId || !visible) return;
        lastNow = -1;
        rafId = requestAnimationFrame(frame);
    }

    function stopLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        lastDraw = -1;
    }

    // --- Etkileşim ---
    function onPointerDown(e) {
        if (dragging) return;
        dragging = true;
        dragId = e.pointerId;
        dragX = e.clientX;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartT = performance.now();
        lastMoveT = dragStartT;
        angVel = 0;
        idleFor = 0;
        canvas.style.cursor = 'grabbing';
        try {
            canvas.setPointerCapture(e.pointerId);
        } catch {
            // yakalama desteklenmiyorsa sorun değil
        }
        requestFrame();
    }
    function onPointerMove(e) {
        if (!dragging || e.pointerId !== dragId) return;
        const now = performance.now();
        const dx = e.clientX - dragX;
        dragX = e.clientX;
        const w = Math.max(200, container.clientWidth);
        const dAng = (dx / w) * Math.PI * 1.6;
        angle += dAng;
        const dts = Math.max(0.008, (now - lastMoveT) / 1000);
        angVel = angVel * 0.6 + (dAng / dts) * 0.4;
        lastMoveT = now;
        idleFor = 0;
        dirty = true;
        requestFrame();
    }
    function endDrag(e) {
        if (!dragging || e.pointerId !== dragId) return;
        dragging = false;
        dragId = -1;
        canvas.style.cursor = 'grab';
        const moved = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
        const quick = performance.now() - dragStartT < 350;
        if (performance.now() - lastMoveT > 80) angVel = 0;
        angVel = Math.max(-8, Math.min(8, angVel));
        if (e.type === 'pointerup' && moved < TAP_PX && quick) {
            // Dokunuş: kutlama, koşu izi varsa demo
            angVel = 0;
            if (cfg.trail !== 'none') startDemo();
            else cheerT = 0;
        }
        requestFrame();
    }
    function startDemo() {
        if (reduced) return;
        demoT = 0;
        cheerT = -1;
        requestFrame();
    }
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // --- Görünürlük, boyut, bağlam ---
    let io = null;
    if (typeof IntersectionObserver !== 'undefined') {
        io = new IntersectionObserver((entries) => {
            const v = entries.some((en) => en.isIntersecting);
            if (v === visible) return;
            visible = v && document.visibilityState !== 'hidden';
            if (visible) requestFrame();
            else stopLoop();
        });
        io.observe(container);
    }
    function onVisibility() {
        const hidden = document.visibilityState === 'hidden';
        if (hidden) {
            visible = false;
            stopLoop();
        } else {
            visible = true;
            dirty = true;
            requestFrame();
        }
    }
    document.addEventListener('visibilitychange', onVisibility);
    let ro = null;
    const onResize = () => {
        fit();
        requestFrame();
    };
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(onResize);
        ro.observe(container);
    } else {
        window.addEventListener('resize', onResize);
    }
    function onContextLost(e) {
        e.preventDefault();
        stopLoop();
    }
    function onContextRestored() {
        dirty = true;
        requestFrame();
    }
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // İlk görüntü; koşu izi varsa kısa demo.
    try {
        renderer.compile(scene, camera);
    } catch {
        // ön derleme zorunlu değil
    }
    requestFrame();
    if (cfg.trail !== 'none' && !reduced) setTimeout(() => !destroyed && startDemo(), 500);

    return {
        setConfig(next) {
            if (destroyed) return;
            const n = normalizeAvatar(next);
            const trailChanged = n.trail !== cfg.trail;
            cfg = n;
            avatar.setConfig(n);
            if (trailChanged) {
                trail.setKind(n.trail);
                if (n.trail !== 'none') startDemo();
            }
            dirty = true;
            requestFrame();
        },
        resize() {
            if (destroyed) return;
            onResize();
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            stopLoop();
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', endDrag);
            canvas.removeEventListener('pointercancel', endDrag);
            canvas.removeEventListener('webglcontextlost', onContextLost);
            canvas.removeEventListener('webglcontextrestored', onContextRestored);
            document.removeEventListener('visibilitychange', onVisibility);
            if (io) io.disconnect();
            if (ro) ro.disconnect();
            else window.removeEventListener('resize', onResize);
            trail.dispose();
            avatar.dispose();
            shadowGeo.dispose();
            shadowMat.dispose();
            glowTex.dispose();
            if (ring) {
                ringGeo.dispose();
                ringMat.dispose();
            }
            if (backdrop) backdrop.dispose();
            const gl = renderer.getContext();
            renderer.dispose();
            if (gl && !gl.isContextLost()) renderer.forceContextLoss();
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        },
    };
}
