/*
 * Ada sahnesi çalışma zamanı: renderer, döngü, görünürlük/bağlam yönetimi ve
 * DOM bağlama. Dünya (scene.js) ve etkileşim (interaction.js) buraya bağlanır.
 *
 * createIslandScene({ container, profile, avatarConfig, gender, stops,
 *   reducedMotion, quality, onStopChange, onReady, onError })
 *   -> Promise<{ goTo(i), next(), prev(), getStop(), resize(), setPaused(b),
 *                setViewOffset({ y, immediate }), destroy(), setAvatar(cfg), getStats() }>
 *
 *  - Yalnızca animasyon/etkileşim varken çizer; boşta ~30 fps; ekran dışında
 *    ya da sekme gizliyken döngü durur. "Hareketi azalt": ortam animasyonu
 *    yok, yalnızca durak değişimi / sürüklemede çizilir; otomatik dönüş yok.
 *  - WebGL2 yoksa ya da bağlam kaybolursa onError çağrılır.
 */
import * as THREE from 'three';
import { createIslandWorld } from './scene.js';
import { bindIslandInput, createRotationController, dragSensitivity } from './interaction.js';
import { createIslandQuality } from './quality.js';
import { isCoarsePointer, isIslandSupported, prefersReducedMotion } from './support.js';
import { waitForLabelFont } from './labels.js';
import { sanitizeStops } from './layout.js';
import { clampViewOffset, stepViewOffset } from './viewOffset.js';

const IDLE_FRAME_MS = 1000 / 30;

const NOOP_API = {
    goTo() {},
    next() {},
    prev() {},
    getStop: () => 0,
    resize() {},
    setViewOffset() {},
    setPaused() {},
    destroy() {},
    setAvatar() {},
    getStats: () => ({ calls: 0, triangles: 0, tier: 0, ema: 0 }),
};

export async function createIslandScene({
    container,
    profile,
    avatarConfig,
    gender,
    stops,
    reducedMotion,
    quality = 'auto',
    onStopChange,
    onReady,
    onError,
} = {}) {
    if (!container || typeof container.appendChild !== 'function') {
        throw new TypeError('createIslandScene: container bir DOM elemanı olmalı.');
    }
    const fail = (err) => {
        try {
            onError?.(err);
        } catch (e) {
            console.error('[island] onError hatası', e);
        }
    };
    // WebGL2 denemesi (yazılım sürücü yasağı burada YOK: kapıyı çağıran isIslandSupported ile koyar).
    if (!isIslandSupported({ allowSoftware: true })) {
        fail(new Error('webgl2-unsupported'));
        return NOOP_API;
    }
    await waitForLabelFont();

    const stopList = sanitizeStops(stops);
    const reduced = reducedMotion === undefined || reducedMotion === null ? prefersReducedMotion() : Boolean(reducedMotion);
    const coarse = isCoarsePointer();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const qc = createIslandQuality({ dpr, coarse, quality });

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    } catch (err) {
        fail(err);
        return NOOP_API;
    }
    renderer.setPixelRatio(qc.tier.ratio);
    renderer.setClearColor(0x9fd0f0, 1);

    let world;
    try {
        world = createIslandWorld({ stops: stopList, avatarConfig, gender: gender || profile?.gender, coarse, tier: qc.tier });
    } catch (err) {
        renderer.dispose();
        fail(err);
        return NOOP_API;
    }

    // --- DOM ---
    const canvas = renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'pan-y'; // yatay sürükleme döndürür; dikey kaydırma sayfanın
    canvas.style.cursor = 'grab';
    canvas.style.userSelect = 'none';
    canvas.style.webkitTapHighlightColor = 'transparent';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-island-canvas', '');

    const restore = [];
    const setAttrIfAbsent = (name, value) => {
        if (!container.hasAttribute(name)) {
            container.setAttribute(name, value);
            restore.push(() => container.removeAttribute(name));
        }
    };
    try {
        if (window.getComputedStyle(container).position === 'static') {
            const prev = container.style.position;
            container.style.position = 'relative';
            restore.push(() => {
                container.style.position = prev;
            });
        }
    } catch {
        // stil okunamadı
    }
    const name = profile?.username || profile?.name;
    setAttrIfAbsent('tabindex', '0');
    setAttrIfAbsent('role', 'group');
    setAttrIfAbsent('aria-roledescription', 'üç boyutlu ada sahnesi');
    setAttrIfAbsent(
        'aria-label',
        `${name ? `${name} kullanıcısının ` : ''}Ada Profili. Bölümler arasında gezinmek için sol ve sağ ok tuşlarını kullan.`,
    );
    setAttrIfAbsent('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
    container.insertBefore(canvas, container.firstChild);

    // --- Durum ---
    let destroyed = false;
    let paused = false;
    let visible = true;
    let rafId = 0;
    let lastDraw = -1;
    let prevRaf = 0;
    let time = 0;
    let dirty = true;
    let readySent = false;
    let radPerPx = 0.004;
    // Görünüm kaydırması (telefonda kartın üstüne sığdırma): hedef ve yumuşatılmış değer
    let viewTarget = 0;
    let viewCur = 0;

    const controller = createRotationController({
        count: stopList.length,
        initialStop: 0,
        reduced,
        onStopChange: (i) => {
            dirty = true;
            try {
                onStopChange?.(i);
            } catch (err) {
                console.error('[island] onStopChange hatası', err);
            }
        },
    });

    let widthPx = 1;
    function applyMetrics(m) {
        radPerPx = dragSensitivity({ widthPx, visibleWidth: m.visibleWidth, radius: 2.9, gain: 0.8 });
        dirty = true;
    }
    function fit() {
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        widthPx = w;
        renderer.setSize(w, h, false);
        const m = world.frame(w, h);
        world.setPixelScale(h * renderer.getPixelRatio());
        applyMetrics(m);
    }
    fit();
    function viewMoving() {
        return viewCur !== viewTarget;
    }

    function ambient() {
        return !reduced && visible && !paused;
    }
    function wantsLoop() {
        return !destroyed && visible && !paused && (controller.moving || ambient() || dirty || viewMoving());
    }

    function draw() {
        renderer.render(world.scene, world.camera);
        dirty = false;
        if (!readySent) {
            readySent = true;
            try {
                onReady?.();
            } catch (err) {
                console.error('[island] onReady hatası', err);
            }
        }
    }

    function frame(now) {
        rafId = 0;
        if (destroyed || !visible || paused) return;
        // Kalite: RAF-RAF aralığı (atlanan kareler dahil)
        if (prevRaf > 0) {
            const next = qc.sample(now - prevRaf);
            if (next) {
                renderer.setPixelRatio(next.ratio);
                world.applyTier(next);
                fit();
            }
        }
        prevRaf = now;
        const moving = controller.moving || viewMoving();
        if (!moving && !dirty && lastDraw >= 0 && now - lastDraw < IDLE_FRAME_MS - 2) {
            if (wantsLoop()) rafId = requestAnimationFrame(frame);
            return;
        }
        const dt = lastDraw < 0 ? 1 / 60 : Math.min(0.1, (now - lastDraw) / 1000);
        lastDraw = now;
        controller.step(dt);
        if (viewMoving()) {
            viewCur = stepViewOffset(viewCur, viewTarget, dt, { immediate: reduced });
            const m = world.setViewOffset(viewCur);
            if (m) applyMetrics(m);
        }
        if (!reduced) time += dt;
        world.update({ time, dt, angle: controller.angle, animate: !reduced });
        draw();
        if (wantsLoop()) rafId = requestAnimationFrame(frame);
        else {
            lastDraw = -1;
            prevRaf = 0;
        }
    }
    function requestFrame() {
        if (destroyed || rafId || !visible || paused) return;
        rafId = requestAnimationFrame(frame);
    }
    function stopLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        lastDraw = -1;
        prevRaf = 0;
    }
    const wake = () => {
        dirty = true;
        requestFrame();
    };

    const unbind = bindIslandInput({
        canvas,
        focusEl: container,
        controller,
        getRadPerPx: () => radPerPx,
        onInteract: wake,
        onTap: () => {
            world.cheer();
            wake();
        },
    });

    // --- Görünürlük, boyut, bağlam ---
    let io = null;
    if (typeof IntersectionObserver !== 'undefined') {
        io = new IntersectionObserver((entries) => {
            const v = entries.some((en) => en.isIntersecting) && document.visibilityState !== 'hidden';
            if (v === visible) return;
            visible = v;
            if (visible) {
                qc.reset();
                wake();
            } else stopLoop();
        });
        io.observe(container);
    }
    function onVisibility() {
        if (document.visibilityState === 'hidden') {
            visible = false;
            stopLoop();
        } else {
            visible = true;
            qc.reset();
            wake();
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
        fail(new Error('webgl-context-lost'));
    }
    function onContextRestored() {
        wake();
    }
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // İlk görüntü
    world.update({ time: 0, dt: 0, angle: controller.angle, animate: false });
    try {
        renderer.compile(world.scene, world.camera);
    } catch {
        // ön derleme zorunlu değil
    }
    requestFrame();

    return {
        goTo(i) {
            if (destroyed) return;
            controller.goTo(i);
            wake();
        },
        next() {
            if (destroyed) return;
            controller.next();
            wake();
        },
        prev() {
            if (destroyed) return;
            controller.prev();
            wake();
        },
        getStop: () => controller.stop,
        resize() {
            if (destroyed) return;
            onResize();
        },
        /**
         * Ada merkezini sahne yüksekliğinin y kesri kadar yukarı kaydırır ve kamerayı
         * görünür bölgeye (1 - 2y) göre uzaklaştırır; 0 sıfırlar. Geçiş yumuşaktır
         * (azaltılmış harekette anında); immediate: true her zaman anında uygular.
         */
        setViewOffset(arg) {
            if (destroyed) return;
            const y = clampViewOffset(typeof arg === 'number' ? arg : arg?.y);
            const immediate = Boolean(arg && typeof arg === 'object' && arg.immediate);
            if (y === viewTarget && !(immediate && viewCur !== y)) return;
            viewTarget = y;
            if (immediate || reduced) {
                viewCur = y;
                const m = world.setViewOffset(viewCur);
                if (m) applyMetrics(m);
            }
            wake();
        },
        getViewOffset: () => viewCur,
        setPaused(p) {
            if (destroyed) return;
            const v = Boolean(p);
            if (v === paused) return;
            paused = v;
            if (paused) stopLoop();
            else {
                qc.reset();
                wake();
            }
        },
        setAvatar(cfg) {
            if (destroyed) return;
            world.setAvatar(cfg);
            wake();
        },
        getStats() {
            const info = renderer.info.render;
            return { calls: info.calls, triangles: info.triangles, tier: qc.level, ema: qc.ema, pixelRatio: renderer.getPixelRatio() };
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            stopLoop();
            unbind();
            canvas.removeEventListener('webglcontextlost', onContextLost);
            canvas.removeEventListener('webglcontextrestored', onContextRestored);
            document.removeEventListener('visibilitychange', onVisibility);
            if (io) io.disconnect();
            if (ro) ro.disconnect();
            else window.removeEventListener('resize', onResize);
            world.dispose();
            const gl = renderer.getContext();
            renderer.dispose();
            if (gl && !gl.isContextLost()) renderer.forceContextLoss();
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            for (const r of restore) {
                try {
                    r();
                } catch {
                    // yoksay
                }
            }
        },
    };
}
