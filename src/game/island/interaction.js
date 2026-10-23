/*
 * Ada sahnesi etkileşimi: döndürme açısı, durak yakalama (snap), atalet ve
 * klavye/işaretçi bağlama.
 *
 * Açı ada grubunun Y dönüşüdür (radyan, sınırsız birikir). i. durağın
 * simgesi adanın yerel -i*adım azimutundadır; ada i*adım kadar döndüğünde
 * o simge kameraya bakan ön yüzde olur. Yani angleForStop(i, n) = i * 2π/n.
 *
 * Saf kısım (node'da test edilir): normalizeAngle, angleForStop, nearestStop,
 * nearestAngleForStop, settleTarget, stepSpring, createVelocityTracker,
 * dragSensitivity, createRotationController. DOM'a bağlanan kısım:
 * bindIslandInput.
 */

export const TAU = Math.PI * 2;

const SETTLE_TIME_S = 0.2; // bırakma hızının ne kadarlık yolu "atalet payı" sayılır
const MAX_FLICK_STEPS = 1.5; // bir hareketle en fazla bu kadar durak ilerlenir
const REST_ANGLE = 0.0004;
const REST_VEL = 0.01;
export const TAP_PX = 8;
export const TAP_MS = 350;

const wrapIndex = (i, n) => (((Math.round(i) % n) + n) % n) + 0;

/** Açıyı (-π, π] aralığına indirir. */
export function normalizeAngle(a) {
    if (!Number.isFinite(a)) return 0;
    let r = a % TAU;
    if (r > Math.PI) r -= TAU;
    else if (r <= -Math.PI) r += TAU;
    return r === 0 ? 0 : r;
}

/** i. durağı öne getiren ada açısı ([0, 2π) aralığında). */
export function angleForStop(i, n) {
    if (!(n > 0)) return 0;
    return (wrapIndex(i, n) * TAU) / n;
}

/** Verilen (sınırsız) açıya en yakın durak indeksi; sabit pencere yok. */
export function nearestStop(angle, n) {
    if (!(n > 0) || !Number.isFinite(angle)) return 0;
    return wrapIndex(angle / (TAU / n), n);
}

/** i. durağın, mevcut açıya en kısa yoldan ulaşılan sınırsız açısı. */
export function nearestAngleForStop(current, i, n) {
    const base = angleForStop(i, n);
    const cur = Number.isFinite(current) ? current : 0;
    return cur + normalizeAngle(base - cur);
}

/**
 * Bırakma anında yerleşilecek durağın (sınırsız) açısı: mevcut açı artı
 * hızdan gelen sınırlı atalet payı, en yakın durağa yuvarlanır.
 */
export function settleTarget(angle, vel, n) {
    if (!(n > 0)) return 0;
    const step = TAU / n;
    const v = Number.isFinite(vel) ? vel : 0;
    const carry = Math.max(-MAX_FLICK_STEPS * step, Math.min(MAX_FLICK_STEPS * step, v * SETTLE_TIME_S));
    return Math.round((angle + carry) / step) * step;
}

/**
 * Kritik sönümlü yay (tam çözüm; kare hızından bağımsız, kararlı).
 * out = { angle, vel, settled } verilirse yeniden kullanılır.
 */
export function stepSpring(angle, vel, target, dt, omega = 8, out = {}) {
    const x = angle - target;
    const e = Math.exp(-omega * dt);
    const c = vel + omega * x;
    const nx = (x + c * dt) * e;
    const nv = (vel - omega * c * dt) * e;
    if (Math.abs(nx) < REST_ANGLE && Math.abs(nv) < REST_VEL) {
        out.angle = target;
        out.vel = 0;
        out.settled = true;
    } else {
        out.angle = target + nx;
        out.vel = nv;
        out.settled = false;
    }
    return out;
}

/** Son ~120 ms'lik örneklerden açısal hız (rad/s). Saf: zaman dışarıdan verilir. */
export function createVelocityTracker({ windowMs = 120, staleMs = 90 } = {}) {
    let samples = [];
    return {
        reset() {
            samples = [];
        },
        push(angle, tMs) {
            samples.push({ a: angle, t: tMs });
            while (samples.length > 2 && tMs - samples[0].t > windowMs) samples.shift();
        },
        velocity(nowMs) {
            if (samples.length < 2) return 0;
            const first = samples[0];
            const last = samples[samples.length - 1];
            if (nowMs - last.t > staleMs) return 0; // durup bırakıldı: atalet yok
            const dt = (last.t - first.t) / 1000;
            if (dt <= 0.004) return 0;
            return (last.a - first.a) / dt;
        },
    };
}

/**
 * Piksel başına dönüş (rad/px): parmağın altındaki ön yüzey, parmağı
 * (gain oranında) izlesin. visibleWidth: ada merkezindeki görünür dünya genişliği.
 */
export function dragSensitivity({ widthPx, visibleWidth, radius = 3, gain = 0.8 }) {
    const w = Math.max(160, widthPx || 0);
    const pxPerUnit = w / Math.max(1, visibleWidth || 10);
    return gain / (Math.max(0.5, radius) * pxPerUnit);
}

/**
 * Durumlu ama DOM'suz denetleyici. Sürükleme açıyı doğrudan sürer; bırakınca
 * yay, atalet payıyla seçilen en yakın durağa yerleştirir. onStopChange,
 * sürükleme/atalet sırasında en yakın durak değiştikçe, programatik
 * geçişlerde ise hedef durakla bir kez tetiklenir (aradaki duraklar sayılmaz).
 */
export function createRotationController({ count = 5, initialStop = 0, reduced = false, omega = 8, onStopChange } = {}) {
    const n = Math.max(1, Math.round(count));
    let angle = angleForStop(initialStop, n);
    let vel = 0;
    let target = null;
    let dragging = false;
    let locked = false; // programatik geçiş sürerken en yakın durak izlenmez
    let stop = nearestStop(angle, n);
    const tracker = createVelocityTracker();
    const out = { angle: 0, vel: 0, settled: false };

    const fire = () => {
        try {
            onStopChange?.(stop);
        } catch (err) {
            console.error('[island] onStopChange hatası', err);
        }
    };
    const refreshStop = () => {
        if (locked) return;
        const s = nearestStop(angle, n);
        if (s !== stop) {
            stop = s;
            fire();
        }
    };

    function goTo(i, { instant = false } = {}) {
        if (dragging) {
            dragging = false;
            tracker.reset();
        }
        const idx = wrapIndex(i, n);
        const changed = idx !== stop;
        stop = idx;
        const t = nearestAngleForStop(angle, idx, n);
        if (reduced || instant) {
            angle = t;
            vel = 0;
            target = null;
            locked = false;
        } else {
            target = t;
            locked = true;
        }
        if (changed) fire();
    }

    return {
        count: n,
        get angle() {
            return angle;
        },
        get stop() {
            return stop;
        },
        get dragging() {
            return dragging;
        },
        /** Hâlâ hareket ediyor mu (sürükleme, atalet ya da yerleşme)? */
        get moving() {
            return dragging || target !== null;
        },
        beginDrag() {
            dragging = true;
            vel = 0;
            target = null;
            locked = false;
            tracker.reset();
        },
        dragBy(dAngle, tMs = 0) {
            if (!dragging || !Number.isFinite(dAngle)) return;
            angle += dAngle;
            tracker.push(angle, tMs);
            refreshStop();
        },
        endDrag(tMs = 0) {
            if (!dragging) return;
            dragging = false;
            const v = tracker.velocity(tMs);
            tracker.reset();
            const t = settleTarget(angle, reduced ? 0 : v, n);
            if (reduced) {
                angle = t;
                vel = 0;
                target = null;
                refreshStop();
                return;
            }
            vel = Math.max(-12, Math.min(12, v));
            target = t;
            // Atalet sırasında da en yakın durak izlenir (locked = false).
        },
        goTo,
        next() {
            goTo(stop + 1);
        },
        prev() {
            goTo(stop - 1);
        },
        /** dt saniye ilerlet; hareket sürüyorsa true. */
        step(dt) {
            if (dragging) return true;
            if (target === null) return false;
            const d = Math.min(0.1, Math.max(0, dt));
            stepSpring(angle, vel, target, d, omega, out);
            angle = out.angle;
            vel = out.vel;
            if (out.settled) {
                target = null;
                locked = false;
                refreshStop();
                return false;
            }
            refreshStop();
            return true;
        },
    };
}

/**
 * Elemana işaretçi (fare + dokunma), klavye ve yatay tekerlek girdisini bağlar.
 * Dikey kaydırma sayfaya kalır (touch-action pan-y CSS'te; yatay tekerlek
 * dışında preventDefault çağrılmaz). Döner: kaldırma fonksiyonu.
 */
export function bindIslandInput({ canvas, focusEl, controller, getRadPerPx, onInteract, onTap }) {
    let pid = -1;
    let lastX = 0;
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let wheelAcc = 0;
    let wheelT = 0;
    const touch = () => {
        try {
            onInteract?.();
        } catch {
            // yoksay
        }
    };

    function down(e) {
        if (pid !== -1) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pid = e.pointerId;
        lastX = startX = e.clientX;
        startY = e.clientY;
        startT = performance.now();
        controller.beginDrag();
        canvas.style.cursor = 'grabbing';
        try {
            canvas.setPointerCapture(e.pointerId);
        } catch {
            // yakalama desteklenmiyorsa sorun değil
        }
        try {
            focusEl?.focus?.({ preventScroll: true });
        } catch {
            // odak verilemedi
        }
        touch();
    }
    function move(e) {
        if (e.pointerId !== pid) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        controller.dragBy(dx * getRadPerPx(), performance.now());
        touch();
    }
    function up(e) {
        if (e.pointerId !== pid) return;
        pid = -1;
        canvas.style.cursor = 'grab';
        const now = performance.now();
        const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
        controller.endDrag(now);
        if (e.type === 'pointerup' && moved < TAP_PX && now - startT < TAP_MS) onTap?.(e);
        touch();
    }
    function key(e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        let handled = true;
        if (e.key === 'ArrowRight') controller.next();
        else if (e.key === 'ArrowLeft') controller.prev();
        else if (e.key === 'Home') controller.goTo(0);
        else if (e.key === 'End') controller.goTo(controller.count - 1);
        else handled = false;
        if (handled) {
            e.preventDefault();
            touch();
        }
    }
    function wheel(e) {
        // Yalnızca belirgin yatay kaydırma (izleme dörtgeni); dikey tekerlek sayfaya kalır.
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return;
        e.preventDefault();
        const now = performance.now();
        if (now - wheelT > 400) wheelAcc = 0;
        wheelT = now;
        wheelAcc += e.deltaX;
        if (Math.abs(wheelAcc) >= 60) {
            if (wheelAcc > 0) controller.next();
            else controller.prev();
            wheelAcc = 0;
            wheelT = now + 350; // art arda tetiklenmeyi sönümle
            touch();
        }
    }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const keyTarget = focusEl || canvas;
    keyTarget.addEventListener('keydown', key);
    return () => {
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
        canvas.removeEventListener('wheel', wheel);
        keyTarget.removeEventListener('keydown', key);
    };
}
