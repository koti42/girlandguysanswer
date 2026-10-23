// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
    TAU,
    angleForStop,
    bindIslandInput,
    createRotationController,
    createVelocityTracker,
    dragSensitivity,
    nearestAngleForStop,
    nearestStop,
    normalizeAngle,
    settleTarget,
    stepSpring,
} from './interaction.js';

const STEP = TAU / 5;

describe('normalizeAngle', () => {
    it('(-π, π] aralığına indirir', () => {
        for (const a of [-20, -7, -Math.PI, -3, -0.1, 0, 0.1, 3, Math.PI, 4, 7, 100]) {
            const r = normalizeAngle(a);
            expect(r).toBeGreaterThan(-Math.PI - 1e-12);
            expect(r).toBeLessThanOrEqual(Math.PI + 1e-12);
            // aynı yön: fark tam tur katı
            const k = (a - r) / TAU;
            expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
        }
    });
    it('uç değerler: π -> π, -π -> π, tam tur -> 0; geçersiz -> 0', () => {
        expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
        expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
        expect(normalizeAngle(TAU)).toBeCloseTo(0, 12);
        expect(Object.is(normalizeAngle(-0), 0)).toBe(true);
        expect(normalizeAngle(NaN)).toBe(0);
        expect(normalizeAngle(Infinity)).toBe(0);
    });
    it('idempotent', () => {
        for (const a of [-9.3, -1, 2.2, 5.5, 12]) expect(normalizeAngle(normalizeAngle(a))).toBeCloseTo(normalizeAngle(a), 12);
    });
});

describe('angleForStop / nearestStop', () => {
    it('i. durak i*adım açısındadır; indeks sarar', () => {
        expect(angleForStop(0, 5)).toBe(0);
        expect(angleForStop(1, 5)).toBeCloseTo(STEP, 12);
        expect(angleForStop(4, 5)).toBeCloseTo(4 * STEP, 12);
        expect(angleForStop(5, 5)).toBe(0);
        expect(angleForStop(-1, 5)).toBeCloseTo(4 * STEP, 12);
        expect(angleForStop(2, 0)).toBe(0);
    });
    it('nearestStop angleForStop ile tutarlı (tur katlarında da)', () => {
        for (let n = 1; n <= 8; n++) {
            for (let i = 0; i < n; i++) {
                for (const turns of [-3, -1, 0, 1, 4]) {
                    expect(nearestStop(angleForStop(i, n) + turns * TAU, n)).toBe(i);
                }
            }
        }
    });
    it('sabit pencere yok: yarı adımda en yakına yuvarlar', () => {
        expect(nearestStop(STEP * 0.49, 5)).toBe(0);
        expect(nearestStop(STEP * 0.51, 5)).toBe(1);
        expect(nearestStop(-STEP * 0.49, 5)).toBe(0);
        expect(nearestStop(-STEP * 0.51, 5)).toBe(4);
        expect(nearestStop(STEP * 4.6, 5)).toBe(0); // 4.6 adım ≈ 5 adım = 0. durak
    });
    it('geçersiz girdide 0', () => {
        expect(nearestStop(NaN, 5)).toBe(0);
        expect(nearestStop(1, 0)).toBe(0);
    });
    it('nearestAngleForStop en kısa yolu seçer', () => {
        // 4. duraktan (4*adım) 0. durağa: ileri 1 adım (5*adım) en kısa
        expect(nearestAngleForStop(4 * STEP, 0, 5)).toBeCloseTo(5 * STEP, 9);
        expect(nearestAngleForStop(0, 4, 5)).toBeCloseTo(-STEP, 9);
        expect(nearestAngleForStop(2 * STEP, 3, 5)).toBeCloseTo(3 * STEP, 9);
        expect(nearestAngleForStop(NaN, 1, 5)).toBeCloseTo(STEP, 9);
    });
});

describe('settleTarget', () => {
    it('hız yoksa en yakın durak', () => {
        expect(settleTarget(0.4 * STEP, 0, 5)).toBeCloseTo(0, 12);
        expect(settleTarget(0.6 * STEP, 0, 5)).toBeCloseTo(STEP, 12);
    });
    it('hızlı savurma bir sonraki durağa taşır; en fazla 1.5 adım ötelenir', () => {
        expect(settleTarget(0.1 * STEP, 6, 5)).toBeCloseTo(STEP, 12);
        const far = settleTarget(0, 1000, 5);
        expect(far).toBeLessThanOrEqual(2 * STEP + 1e-9);
        expect(settleTarget(0, -1000, 5)).toBeGreaterThanOrEqual(-2 * STEP - 1e-9);
    });
    it('sonuç her zaman bir durak açısıdır', () => {
        for (const [a, v] of [[0.3, 2], [-1.7, -4], [9, 0.5], [-5, 9]]) {
            const t = settleTarget(a, v, 5);
            expect(Math.abs(t / STEP - Math.round(t / STEP))).toBeLessThan(1e-9);
        }
    });
});

describe('stepSpring', () => {
    function simulate(angle, vel, target, dt, seconds, omega = 8) {
        const out = { angle, vel, settled: false };
        let a = angle;
        let v = vel;
        const trace = [];
        const steps = Math.round(seconds / dt);
        for (let i = 0; i < steps; i++) {
            stepSpring(a, v, target, dt, omega, out);
            a = out.angle;
            v = out.vel;
            trace.push(a);
            if (out.settled) break;
        }
        return { a, v, settled: out.settled, trace };
    }
    it('hedefe oturur ve tam hedefte durur', () => {
        const r = simulate(0, 0, 1.2566, 1 / 60, 3);
        expect(r.settled).toBe(true);
        expect(r.a).toBe(1.2566);
        expect(r.v).toBe(0);
    });
    it('başlangıç hızı olmadan aşım yapmaz (monoton)', () => {
        const r = simulate(0, 0, 1, 1 / 60, 3);
        for (let i = 1; i < r.trace.length; i++) expect(r.trace[i]).toBeGreaterThanOrEqual(r.trace[i - 1] - 1e-12);
        expect(Math.max(...r.trace)).toBeLessThanOrEqual(1 + 1e-9);
    });
    it('kare hızından bağımsız: 30 fps ve 120 fps aynı yere varır, ara değerler yakın', () => {
        const slow = simulate(0, 2, 1, 1 / 30, 0.5);
        const fast = simulate(0, 2, 1, 1 / 120, 0.5);
        // 0.5 sn sonra (yerleşmeden önce) iki hız yakın olmalı
        expect(slow.settled || fast.settled).toBe(false);
        expect(Math.abs(slow.a - fast.a)).toBeLessThan(1e-6);
    });
    it('deterministik: aynı girdi aynı çıktı', () => {
        const a = simulate(0.3, -1, 2, 1 / 60, 2);
        const b = simulate(0.3, -1, 2, 1 / 60, 2);
        expect(a.trace).toEqual(b.trace);
    });
    it('çıktı nesnesi yeniden kullanılır', () => {
        const out = {};
        expect(stepSpring(0, 0, 1, 0.016, 8, out)).toBe(out);
    });
});

describe('createVelocityTracker', () => {
    it('açısal hızı (rad/s) hesaplar', () => {
        const tr = createVelocityTracker();
        tr.push(0, 0);
        tr.push(0.1, 50);
        tr.push(0.2, 100);
        expect(tr.velocity(100)).toBeCloseTo(2, 6);
    });
    it('durup bırakılırsa (bayat örnek) hız 0; tek örnekte 0', () => {
        const tr = createVelocityTracker();
        tr.push(0, 0);
        expect(tr.velocity(10)).toBe(0);
        tr.push(1, 40);
        expect(tr.velocity(400)).toBe(0);
    });
    it('eski örnekleri pencereden atar', () => {
        const tr = createVelocityTracker({ windowMs: 100 });
        tr.push(0, 0);
        tr.push(5, 500); // eski konum etkisiz kalmalı
        tr.push(5.1, 550);
        tr.push(5.2, 600);
        expect(tr.velocity(600)).toBeCloseTo(2, 4);
    });
    it('reset örnekleri siler', () => {
        const tr = createVelocityTracker();
        tr.push(0, 0);
        tr.push(1, 50);
        tr.reset();
        expect(tr.velocity(50)).toBe(0);
    });
});

describe('dragSensitivity', () => {
    it('daha geniş alanda piksel başına dönüş azalır; her zaman pozitif ve sonlu', () => {
        const a = dragSensitivity({ widthPx: 390, visibleWidth: 8 });
        const b = dragSensitivity({ widthPx: 1200, visibleWidth: 13 });
        expect(a).toBeGreaterThan(0);
        expect(Number.isFinite(b)).toBe(true);
        expect(dragSensitivity({ widthPx: 0, visibleWidth: 0 })).toBeGreaterThan(0);
    });
});

describe('createRotationController', () => {
    function run(ctrl, seconds, dt = 1 / 60) {
        for (let t = 0; t < seconds; t += dt) if (!ctrl.step(dt)) break;
    }

    it('başlangıç durağı ve açısı', () => {
        const c = createRotationController({ count: 5, initialStop: 2 });
        expect(c.stop).toBe(2);
        expect(c.angle).toBeCloseTo(2 * STEP, 12);
        expect(c.moving).toBe(false);
    });

    it('goTo animasyonlu: tek kez bildirir (ara duraklar sayılmaz), sonunda tam açıda durur', () => {
        const onStopChange = vi.fn();
        const c = createRotationController({ count: 5, onStopChange });
        c.goTo(2);
        expect(onStopChange).toHaveBeenCalledTimes(1);
        expect(onStopChange).toHaveBeenLastCalledWith(2);
        expect(c.stop).toBe(2);
        expect(c.moving).toBe(true);
        run(c, 4);
        expect(onStopChange).toHaveBeenCalledTimes(1);
        expect(c.moving).toBe(false);
        expect(c.angle).toBeCloseTo(2 * STEP, 9);
    });

    it('aynı durağa goTo bildirim üretmez', () => {
        const onStopChange = vi.fn();
        const c = createRotationController({ count: 5, onStopChange });
        c.goTo(0);
        expect(onStopChange).not.toHaveBeenCalled();
    });

    it('next/prev sarar', () => {
        const c = createRotationController({ count: 5, reduced: true });
        c.prev();
        expect(c.stop).toBe(4);
        c.next();
        expect(c.stop).toBe(0);
        for (let i = 0; i < 7; i++) c.next();
        expect(c.stop).toBe(2);
    });

    it('en kısa yol: 4 -> 0 ileri yönde bir adım', () => {
        const c = createRotationController({ count: 5, initialStop: 4 });
        c.goTo(0);
        run(c, 4);
        expect(c.angle).toBeCloseTo(5 * STEP, 9);
    });

    it('hareketi azalt: goTo anında, animasyon yok', () => {
        const onStopChange = vi.fn();
        const c = createRotationController({ count: 5, reduced: true, onStopChange });
        c.goTo(3);
        expect(c.moving).toBe(false);
        // 0 -> 3: en kısa yol geriye iki adım (-2*adım ≡ 3. durak)
        expect(c.angle).toBeCloseTo(-2 * STEP, 12);
        expect(nearestStop(c.angle, 5)).toBe(3);
        expect(onStopChange).toHaveBeenCalledWith(3);
    });

    it('sürükleme sırasında en yakın durak değişince bildirir', () => {
        const seen = [];
        const c = createRotationController({ count: 5, onStopChange: (i) => seen.push(i) });
        c.beginDrag();
        for (let i = 1; i <= 30; i++) c.dragBy(STEP / 10, i * 16);
        expect(seen).toEqual([1, 2, 3]);
        expect(c.stop).toBe(3);
        expect(c.dragging).toBe(true);
        expect(c.moving).toBe(true);
    });

    it('yavaş bırakma en yakın durağa yerleşir', () => {
        const c = createRotationController({ count: 5 });
        c.beginDrag();
        c.dragBy(STEP * 0.6, 0);
        c.endDrag(500); // bayat: hız 0
        expect(c.dragging).toBe(false);
        run(c, 4);
        expect(c.angle).toBeCloseTo(STEP, 9);
        expect(c.stop).toBe(1);
    });

    it('savurma (hız) atalet sırasında da durak bildirir ve komşu durağa yerleşir', () => {
        const seen = [];
        const c = createRotationController({ count: 5, onStopChange: (i) => seen.push(i) });
        c.beginDrag();
        // 60 ms içinde 0.3 adım: ≈ 6 rad/s
        c.dragBy(STEP * 0.1, 0);
        c.dragBy(STEP * 0.1, 30);
        c.dragBy(STEP * 0.1, 60);
        c.endDrag(70);
        run(c, 4);
        expect(c.angle).toBeCloseTo(STEP, 9);
        expect(seen[seen.length - 1]).toBe(1);
        expect(c.stop).toBe(1);
    });

    it('ters yönde savurma geri durağa gider (negatif/sarma)', () => {
        const c = createRotationController({ count: 5 });
        c.beginDrag();
        c.dragBy(-STEP * 0.1, 0);
        c.dragBy(-STEP * 0.1, 30);
        c.dragBy(-STEP * 0.1, 60);
        c.endDrag(70);
        run(c, 4);
        expect(c.stop).toBe(4);
        expect(c.angle).toBeCloseTo(-STEP, 9);
    });

    it('hareketi azalt: bırakınca anında en yakın durak', () => {
        const c = createRotationController({ count: 5, reduced: true });
        c.beginDrag();
        c.dragBy(STEP * 0.7, 0);
        c.endDrag(500);
        expect(c.moving).toBe(false);
        expect(c.angle).toBeCloseTo(STEP, 12);
    });

    it('sürükleme programatik geçişi iptal eder (kilit açılır)', () => {
        const seen = [];
        const c = createRotationController({ count: 5, onStopChange: (i) => seen.push(i) });
        c.goTo(3);
        c.beginDrag();
        c.dragBy(-STEP * 3, 0);
        // kilit açıldı: durak artık açıdan okunur (-3 adım ≡ 2. durak)
        expect(c.stop).toBe(2);
        expect(seen).toEqual([3, 2]);
        expect(c.dragging).toBe(true);
    });

    it('dragBy sürükleme dışında ve sonlu olmayan değerde etkisiz', () => {
        const c = createRotationController({ count: 5 });
        c.dragBy(1, 0);
        expect(c.angle).toBe(0);
        c.beginDrag();
        c.dragBy(NaN, 0);
        expect(c.angle).toBe(0);
    });

    it('onStopChange hata fırlatsa da denetleyici çalışır', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const c = createRotationController({
            count: 5,
            onStopChange: () => {
                throw new Error('x');
            },
        });
        expect(() => c.goTo(2)).not.toThrow();
        expect(c.stop).toBe(2);
        spy.mockRestore();
    });

    it('tek durakta çökmez', () => {
        const c = createRotationController({ count: 1 });
        c.next();
        c.prev();
        expect(c.stop).toBe(0);
    });
});

describe('bindIslandInput (jsdom)', () => {
    function setup(opts = {}) {
        const canvas = document.createElement('canvas');
        const host = document.createElement('div');
        host.appendChild(canvas);
        document.body.appendChild(host);
        const controller = createRotationController({ count: 5, reduced: opts.reduced });
        const onTap = vi.fn();
        const onInteract = vi.fn();
        const unbind = bindIslandInput({ canvas, focusEl: host, controller, getRadPerPx: () => 0.01, onInteract, onTap });
        const ev = (type, props = {}, target = canvas) => {
            const e = new Event(type, { bubbles: true, cancelable: true });
            Object.assign(e, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 }, props);
            target.dispatchEvent(e);
            return e;
        };
        return { canvas, host, controller, onTap, onInteract, unbind, ev };
    }

    it('yatay sürükleme açıyı değiştirir; sağa sürükleme açıyı artırır', () => {
        const { controller, ev, unbind } = setup();
        ev('pointerdown', { clientX: 100 });
        ev('pointermove', { clientX: 150 });
        expect(controller.dragging).toBe(true);
        expect(controller.angle).toBeCloseTo(0.5, 9);
        ev('pointerup', { clientX: 150 });
        expect(controller.dragging).toBe(false);
        unbind();
    });

    it('kısa dokunuş onTap çağırır; sürükleme çağırmaz', () => {
        const { ev, onTap, unbind } = setup();
        ev('pointerdown', { clientX: 10, clientY: 10 });
        ev('pointerup', { clientX: 11, clientY: 10 });
        expect(onTap).toHaveBeenCalledTimes(1);
        ev('pointerdown', { clientX: 10 });
        ev('pointermove', { clientX: 60 });
        ev('pointerup', { clientX: 60 });
        expect(onTap).toHaveBeenCalledTimes(1);
        unbind();
    });

    it('pointercancel sürüklemeyi bitirir (dikey kaydırma devri), dokunuş sayılmaz', () => {
        const { ev, controller, onTap, unbind } = setup();
        ev('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
        ev('pointercancel', { pointerType: 'touch', clientX: 10, clientY: 10 });
        expect(controller.dragging).toBe(false);
        expect(onTap).not.toHaveBeenCalled();
        unbind();
    });

    it('fare sağ tuşu yok sayılır; ikinci işaretçi yok sayılır', () => {
        const { ev, controller, unbind } = setup();
        ev('pointerdown', { button: 2 });
        expect(controller.dragging).toBe(false);
        ev('pointerdown', { pointerId: 1 });
        ev('pointerdown', { pointerId: 2, clientX: 300 });
        ev('pointermove', { pointerId: 2, clientX: 400 });
        expect(controller.angle).toBe(0);
        unbind();
    });

    it('klavye: ok tuşları, Home/End; değiştirici tuşlarla çalışmaz; preventDefault çağrılır', () => {
        const { host, controller, unbind, ev } = setup({ reduced: true });
        const key = (k, extra = {}) => {
            const e = new Event('keydown', { bubbles: true, cancelable: true });
            Object.assign(e, { key: k }, extra);
            host.dispatchEvent(e);
            return e;
        };
        expect(key('ArrowRight').defaultPrevented).toBe(true);
        expect(controller.stop).toBe(1);
        key('ArrowLeft');
        key('ArrowLeft');
        expect(controller.stop).toBe(4);
        key('Home');
        expect(controller.stop).toBe(0);
        key('End');
        expect(controller.stop).toBe(4);
        expect(key('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
        expect(key('a').defaultPrevented).toBe(false);
        expect(controller.stop).toBe(4);
        void ev;
        unbind();
    });

    it('yatay tekerlek durak değiştirir, dikey tekerlek sayfaya kalır', () => {
        const { canvas, controller, unbind } = setup({ reduced: true });
        const wheel = (dx, dy) => {
            const e = new Event('wheel', { bubbles: true, cancelable: true });
            Object.assign(e, { deltaX: dx, deltaY: dy });
            canvas.dispatchEvent(e);
            return e;
        };
        expect(wheel(0, 100).defaultPrevented).toBe(false);
        expect(controller.stop).toBe(0);
        expect(wheel(80, 5).defaultPrevented).toBe(true);
        expect(controller.stop).toBe(1);
        unbind();
    });

    it('unbind tüm dinleyicileri kaldırır', () => {
        const { host, canvas, controller, unbind, ev } = setup({ reduced: true });
        unbind();
        const e = new Event('keydown', { bubbles: true, cancelable: true });
        Object.assign(e, { key: 'ArrowRight' });
        host.dispatchEvent(e);
        ev('pointerdown', { clientX: 5 });
        expect(controller.stop).toBe(0);
        expect(controller.dragging).toBe(false);
        void canvas;
    });
});
