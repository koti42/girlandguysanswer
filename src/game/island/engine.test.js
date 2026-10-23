// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Çalışma zamanı testi: gerçek WebGL yok; three'nin WebGLRenderer'ı sahte bir
 * renderer ile değiştirilir (render sayısı, dispose, bağlam kaybı izlenir).
 * Gerçek çizim tarayıcıda (headless Chrome) doğrulandı.
 */
const renderers = [];
const flags = vi.hoisted(() => ({ failNext: false }));

vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal();
    class FakeRenderer {
        constructor() {
            if (flags.failNext) {
                flags.failNext = false;
                throw new Error('context yok');
            }
            this.domElement = document.createElement('canvas');
            this.renders = 0;
            this.disposed = false;
            this.lost = false;
            this.ratio = 1;
            this.sizes = [];
            this.info = { render: { calls: 40, triangles: 9000 } };
            this.gl = {
                isContextLost: () => this.lost,
            };
            renderers.push(this);
        }
        setPixelRatio(r) {
            this.ratio = r;
        }
        getPixelRatio() {
            return this.ratio;
        }
        setClearColor() {}
        setSize(w, h) {
            this.sizes.push([w, h]);
        }
        compile() {}
        render(scene, camera) {
            this.renders += 1;
            this.lastCamera = camera;
        }
        getContext() {
            return this.gl;
        }
        forceContextLoss() {
            this.lost = true;
            this.forced = true;
        }
        dispose() {
            this.disposed = true;
        }
    }
    return { ...actual, WebGLRenderer: FakeRenderer };
});

const { createIslandScene } = await import('./engine.js');
const { isIslandSupported, resetIslandSupportCache } = await import('./support.js');
const { ISLAND_STOPS } = await import('./layout.js');

const ctx2d = () => ({
    createLinearGradient: () => ({ addColorStop() {} }),
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillText() {},
    measureText: () => ({ width: 60 }),
});

let rafQueue = [];
let rafId = 0;
let nowMs = 1000;

function flush(frames = 1, stepMs = 17) {
    for (let i = 0; i < frames; i++) {
        nowMs += stepMs;
        const q = rafQueue;
        rafQueue = [];
        for (const item of q) if (!item.cancelled) item.cb(nowMs);
    }
}

function makeContainer() {
    const c = document.createElement('div');
    Object.defineProperty(c, 'clientWidth', { value: 600, configurable: true });
    Object.defineProperty(c, 'clientHeight', { value: 300, configurable: true });
    document.body.appendChild(c);
    return c;
}

beforeEach(() => {
    renderers.length = 0;
    rafQueue = [];
    rafId = 0;
    nowMs = 1000;
    resetIslandSupportCache();
    window.WebGL2RenderingContext = function WebGL2RenderingContext() {};
    HTMLCanvasElement.prototype.getContext = function getContext(type) {
        if (type === 'webgl2') return { getExtension: () => null, getParameter: () => '', isContextLost: () => false };
        if (type === '2d') return ctx2d();
        return null;
    };
    vi.stubGlobal('requestAnimationFrame', (cb) => {
        const item = { cb, cancelled: false, id: ++rafId };
        rafQueue.push(item);
        return item.id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
        for (const it of rafQueue) if (it.id === id) it.cancelled = true;
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    delete window.WebGL2RenderingContext;
    document.body.innerHTML = '';
});

describe('isIslandSupported', () => {
    it('WebGL2 yoksa false', () => {
        delete window.WebGL2RenderingContext;
        resetIslandSupportCache();
        expect(isIslandSupported()).toBe(false);
    });
    it('gerçek GPU true; yazılım sürücüsü false (allowSoftware ile true)', () => {
        const gl = {
            getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 1 } : null),
            getParameter: () => 'ANGLE (NVIDIA GeForce RTX 3060)',
        };
        HTMLCanvasElement.prototype.getContext = () => gl;
        resetIslandSupportCache();
        expect(isIslandSupported()).toBe(true);
        gl.getParameter = () => 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))';
        resetIslandSupportCache();
        expect(isIslandSupported()).toBe(false);
        expect(isIslandSupported({ allowSoftware: true })).toBe(true);
    });
    it('çok düşük bellekli cihaz desteklenmez', () => {
        const orig = Object.getOwnPropertyDescriptor(Navigator.prototype, 'deviceMemory');
        Object.defineProperty(navigator, 'deviceMemory', { value: 1, configurable: true });
        resetIslandSupportCache();
        expect(isIslandSupported()).toBe(false);
        delete navigator.deviceMemory;
        if (orig) Object.defineProperty(Navigator.prototype, 'deviceMemory', orig);
    });
    it('bağlam oluşturma patlarsa false', () => {
        HTMLCanvasElement.prototype.getContext = () => {
            throw new Error('boom');
        };
        resetIslandSupportCache();
        expect(isIslandSupported()).toBe(false);
    });
});

describe('createIslandScene: hata yolları', () => {
    it('geçersiz container TypeError', async () => {
        await expect(createIslandScene({ container: null })).rejects.toThrow(TypeError);
        await expect(createIslandScene({})).rejects.toThrow(TypeError);
    });

    it('WebGL2 yoksa onError çağrılır, boş API döner, DOM değişmez', async () => {
        delete window.WebGL2RenderingContext;
        resetIslandSupportCache();
        const container = makeContainer();
        const onError = vi.fn();
        const onReady = vi.fn();
        const api = await createIslandScene({ container, onError, onReady });
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].message).toBe('webgl2-unsupported');
        expect(onReady).not.toHaveBeenCalled();
        expect(container.children).toHaveLength(0);
        expect(container.hasAttribute('tabindex')).toBe(false);
        expect(() => {
            api.goTo(2);
            api.next();
            api.prev();
            api.resize();
            api.setPaused(true);
            api.destroy();
        }).not.toThrow();
        expect(api.getStop()).toBe(0);
    });

    it('onError hata fırlatsa da çökmez', async () => {
        delete window.WebGL2RenderingContext;
        resetIslandSupportCache();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(createIslandScene({ container: makeContainer(), onError: () => { throw new Error('x'); } })).resolves.toBeTruthy();
        spy.mockRestore();
    });
});

describe('createIslandScene: çalışma', () => {
    async function open(extra = {}) {
        const container = makeContainer();
        const onStopChange = vi.fn();
        const onReady = vi.fn();
        const onError = vi.fn();
        const api = await createIslandScene({
            container,
            profile: { username: 'ayse' },
            gender: 'female',
            stops: ISLAND_STOPS,
            quality: 'high',
            onStopChange,
            onReady,
            onError,
            ...extra,
        });
        return { container, api, onStopChange, onReady, onError, r: renderers[renderers.length - 1] };
    }

    it('canvas eklenir; erişilebilirlik öznitelikleri ve odaklanabilirlik; ilk karede onReady', async () => {
        const { container, onReady, r } = await open();
        const canvas = container.querySelector('canvas');
        expect(canvas).toBe(r.domElement);
        expect(canvas.style.touchAction).toBe('pan-y');
        expect(canvas.getAttribute('aria-hidden')).toBe('true');
        expect(container.getAttribute('tabindex')).toBe('0');
        expect(container.getAttribute('role')).toBe('group');
        expect(container.getAttribute('aria-label')).toContain('ayse');
        expect(container.getAttribute('aria-label')).toContain('ok tuşlarını');
        expect(container.style.position).toBe('relative');
        expect(onReady).not.toHaveBeenCalled();
        flush(2);
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(r.renders).toBeGreaterThan(0);
        expect(r.sizes[0]).toEqual([600, 300]);
    });

    it('çağıranın verdiği öznitelikler korunur ve destroy sonrası eklenenler geri alınır', async () => {
        const container = makeContainer();
        container.setAttribute('aria-label', 'Özel etiket');
        container.setAttribute('tabindex', '-1');
        const api = await createIslandScene({ container, quality: 'high' });
        expect(container.getAttribute('aria-label')).toBe('Özel etiket');
        expect(container.getAttribute('tabindex')).toBe('-1');
        expect(container.hasAttribute('aria-roledescription')).toBe(true);
        api.destroy();
        expect(container.hasAttribute('aria-roledescription')).toBe(false);
        expect(container.hasAttribute('role')).toBe(false);
        expect(container.getAttribute('aria-label')).toBe('Özel etiket');
        expect(container.style.position).toBe('');
    });

    it('goTo / next / prev: durak değişir, bildirim bir kez, sahne çizilir ve yerleşince döngü durur', async () => {
        const { api, onStopChange, r } = await open();
        flush(3);
        api.goTo(3);
        expect(api.getStop()).toBe(3);
        expect(onStopChange).toHaveBeenCalledTimes(1);
        expect(onStopChange).toHaveBeenCalledWith(3);
        const before = r.renders;
        flush(200);
        expect(r.renders).toBeGreaterThan(before);
        api.next();
        expect(api.getStop()).toBe(4);
        api.next();
        expect(api.getStop()).toBe(0);
        api.prev();
        expect(api.getStop()).toBe(4);
        expect(onStopChange.mock.calls.map((c) => c[0])).toEqual([3, 4, 0, 4]);
    });

    it('klavye: ok tuşları ve Home/End (container üzerinde)', async () => {
        const { container, api } = await open();
        flush(2);
        const key = (k) => container.dispatchEvent(Object.assign(new Event('keydown', { bubbles: true, cancelable: true }), { key: k }));
        key('ArrowRight');
        expect(api.getStop()).toBe(1);
        key('ArrowLeft');
        key('ArrowLeft');
        expect(api.getStop()).toBe(4);
        key('Home');
        expect(api.getStop()).toBe(0);
        key('End');
        expect(api.getStop()).toBe(4);
    });

    it('hareketi azalt: ambient döngü yok; durak değişince bir kez çizer, sonra durur', async () => {
        const { api, r, onStopChange } = await open({ reducedMotion: true });
        flush(5);
        const idle = r.renders;
        flush(60);
        expect(r.renders).toBe(idle); // sürekli çizim yok
        expect(rafQueue.filter((q) => !q.cancelled)).toHaveLength(0);
        api.goTo(2);
        expect(onStopChange).toHaveBeenCalledWith(2);
        flush(5);
        expect(r.renders).toBeGreaterThan(idle);
        const after = r.renders;
        flush(60);
        expect(r.renders).toBe(after);
    });

    it('ambient animasyon açıkken boşta ~30 fps (her kare çizilmez)', async () => {
        const { r } = await open();
        flush(3);
        const start = r.renders;
        flush(60, 16.7);
        const drawn = r.renders - start;
        expect(drawn).toBeGreaterThan(20);
        expect(drawn).toBeLessThan(40);
    });

    it('setPaused durdurur ve devam ettirir', async () => {
        const { api, r } = await open();
        flush(3);
        api.setPaused(true);
        const n = r.renders;
        flush(30);
        expect(r.renders).toBe(n);
        expect(rafQueue.filter((q) => !q.cancelled)).toHaveLength(0);
        api.setPaused(false);
        flush(5);
        expect(r.renders).toBeGreaterThan(n);
    });

    it('sekme gizlenince döngü durur, görününce sürer', async () => {
        const { r } = await open();
        flush(3);
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        const n = r.renders;
        flush(30);
        expect(r.renders).toBe(n);
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        flush(5);
        expect(r.renders).toBeGreaterThan(n);
    });

    it('webglcontextlost: onError çağrılır ve döngü durur; restore döngüyü sürdürür', async () => {
        const { container, onError, r } = await open();
        flush(3);
        const canvas = container.querySelector('canvas');
        const lost = Object.assign(new Event('webglcontextlost', { cancelable: true }), {});
        canvas.dispatchEvent(lost);
        expect(lost.defaultPrevented).toBe(true);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].message).toBe('webgl-context-lost');
        const n = r.renders;
        flush(10);
        expect(r.renders).toBe(n);
        canvas.dispatchEvent(new Event('webglcontextrestored'));
        flush(3);
        expect(r.renders).toBeGreaterThan(n);
    });

    it('resize: boyut güncellenir', async () => {
        const { container, api, r } = await open();
        flush(2);
        Object.defineProperty(container, 'clientWidth', { value: 390, configurable: true });
        Object.defineProperty(container, 'clientHeight', { value: 420, configurable: true });
        api.resize();
        expect(r.sizes[r.sizes.length - 1]).toEqual([390, 420]);
    });

    it('getStats ve setAvatar çalışır', async () => {
        const { api } = await open();
        flush(2);
        expect(api.getStats().calls).toBe(40);
        expect(() => api.setAvatar({ body: 'erkek', acc: 'tac' })).not.toThrow();
        flush(2);
    });

    it('destroy: canvas çıkar, renderer serbest, dinleyiciler gider, sonraki çağrılar zararsız', async () => {
        const { container, api, r, onStopChange } = await open();
        flush(3);
        api.destroy();
        expect(container.querySelector('canvas')).toBeNull();
        expect(r.disposed).toBe(true);
        expect(r.forced).toBe(true);
        const n = r.renders;
        flush(20);
        expect(r.renders).toBe(n);
        expect(rafQueue.filter((q) => !q.cancelled)).toHaveLength(0);
        container.dispatchEvent(Object.assign(new Event('keydown', { bubbles: true }), { key: 'ArrowRight' }));
        expect(onStopChange).not.toHaveBeenCalled();
        expect(() => {
            api.goTo(1);
            api.next();
            api.setPaused(true);
            api.setAvatar({});
            api.resize();
            api.destroy();
        }).not.toThrow();
    });

    it('WebGLRenderer kurulamazsa onError ve boş API; DOM temiz kalır', async () => {
        flags.failNext = true;
        const container = makeContainer();
        const onError = vi.fn();
        const api = await createIslandScene({ container, onError });
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].message).toBe('context yok');
        expect(container.children).toHaveLength(0);
        expect(() => api.destroy()).not.toThrow();
    });
});

describe('createIslandScene: görünüm kaydırması (telefonda kartın üstüne sığdırma)', () => {
    async function open(extra = {}) {
        const container = makeContainer(); // 600x300
        const api = await createIslandScene({ container, stops: ISLAND_STOPS, quality: 'high', ...extra });
        return { container, api, r: renderers[renderers.length - 1] };
    }
    const LOOK_Y = -1.1;
    const distOf = (cam) => Math.hypot(cam.position.x, cam.position.y - LOOK_Y, cam.position.z);

    it('immediate: kamera görünümü yukarı kayar ve kamera geri çekilir; 0 ile sıfırlanır', async () => {
        const { api, r } = await open();
        flush(3);
        const cam = r.lastCamera;
        const dist0 = distOf(cam);
        expect(cam.view?.enabled || false).toBe(false);

        api.setViewOffset({ y: 0.2, immediate: true });
        flush(2);
        expect(cam.view.enabled).toBe(true);
        expect(cam.view.offsetY).toBe(60); // 300 * 0.2
        expect(cam.view.offsetX).toBe(0);
        expect(cam.view.width).toBe(600);
        expect(cam.view.height).toBe(300);
        expect(api.getViewOffset()).toBe(0.2);
        expect(distOf(cam)).toBeGreaterThan(dist0); // görünür bölge küçüldüğü için geri çekilir

        api.setViewOffset({ y: 0, immediate: true });
        flush(2);
        expect(cam.view.enabled).toBe(false);
        expect(api.getViewOffset()).toBe(0);
        expect(distOf(cam)).toBeCloseTo(dist0, 3);
    });

    it('geçişli: kareler boyunca yumuşakça hedefe yaklaşır ve oturur', async () => {
        const { api } = await open();
        flush(3);
        api.setViewOffset({ y: 0.25 });
        flush(2);
        const mid = api.getViewOffset();
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(0.25);
        flush(120);
        expect(api.getViewOffset()).toBe(0.25);
        flush(5);
        expect(api.getViewOffset()).toBe(0.25); // oturdu, kıpırdamaz
    });

    it('hareketi azalt: geçiş yok, anında uygulanır', async () => {
        const { api, r } = await open({ reducedMotion: true });
        flush(2);
        api.setViewOffset({ y: 0.3 });
        expect(api.getViewOffset()).toBe(0.3);
        flush(2);
        expect(r.lastCamera.view.offsetY).toBe(90);
    });

    it('geçersiz/negatif/aşırı değerler güvenle sınırlanır; düz sayı da kabul edilir', async () => {
        const { api } = await open();
        flush(2);
        for (const bad of [undefined, null, NaN, -1, 'x', {}]) {
            api.setViewOffset(bad);
            flush(2);
            expect(api.getViewOffset()).toBe(0);
        }
        api.setViewOffset({ y: 5, immediate: true });
        expect(api.getViewOffset()).toBe(0.36);
        api.setViewOffset(0.1);
        flush(200);
        expect(api.getViewOffset()).toBe(0.1);
    });

    it('yeniden boyutlanınca kaydırma korunur; destroy sonrası ve boş API güvenli', async () => {
        const { api, container, r } = await open();
        flush(2);
        api.setViewOffset({ y: 0.2, immediate: true });
        Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
        api.resize();
        flush(2);
        expect(r.lastCamera.view.offsetY).toBe(80); // 400 * 0.2
        api.destroy();
        expect(() => api.setViewOffset({ y: 0.1 })).not.toThrow();

        delete window.WebGL2RenderingContext;
        resetIslandSupportCache();
        const noop = await createIslandScene({ container: makeContainer() });
        expect(() => noop.setViewOffset({ y: 0.2 })).not.toThrow();
    });
});
