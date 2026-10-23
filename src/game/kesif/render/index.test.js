import { describe, it, expect } from 'vitest';
import * as api from './index.js';

function fakeThree(log) {
  class WebGLRenderer {
    constructor(opts) {
      log.opts = opts;
      this.shadowMap = {};
      this.listeners = {};
      this.domElement = {
        style: {},
        attrs: {},
        parentNode: null,
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener: (t, f) => { this.listeners[t] = f; },
        removeEventListener: (t) => { delete this.listeners[t]; },
      };
      this.gl = { lost: false, isContextLost() { return this.lost; } };
      log.renderer = this;
    }

    setPixelRatio(r) { this.pixelRatio = r; }
    setClearColor(c, a) { this.clear = [c, a]; }
    setSize(w, h, u) { this.size = [w, h, u]; log.sizes.push([w, h]); }
    getContext() { return this.gl; }
    dispose() { log.disposed = true; }
    forceContextLoss() { log.forced = true; }
  }
  return {
    WebGLRenderer, NoToneMapping: 0, ACESFilmicToneMapping: 4, NeutralToneMapping: 7, SRGBColorSpace: 'srgb',
  };
}

function fakeContainer() {
  const c = {
    clientWidth: 800,
    clientHeight: 450,
    children: [],
    appendChild(el) { this.children.push(el); el.parentNode = this; },
    removeChild(el) { this.children = this.children.filter((x) => x !== el); el.parentNode = null; },
  };
  return c;
}

describe('render/index dışa aktarımları', () => {
  it('altyapı API\'si dışa aktarılır', () => {
    [
      'createChunkManager', 'adoptChunk', 'createSky', 'getFogParams', 'createWeatherLayer', 'createPostFx', 'createKesifQuality',
      'QUALITY', 'pickInitialTier', 'createKesifRenderer', 'generateAtlasPixels', 'createChunkMaterials', 'updateMaterialsFrame',
      'meshChunk', 'createParticleSystem', 'createFirstPerson', 'createCharacter', 'createMobModel', 'spiralOffsets',
    ].forEach((k) => expect(typeof api[k] === 'function' || typeof api[k] === 'object').toBe(true));
    expect(typeof api.atlasModule.generateAtlasPixels).toBe('function');
    expect(typeof api.particlesModule.KIND).toBe('object');
    expect(typeof api.mesherModule.KIND).toBe('object');
  });
});

describe('createKesifRenderer', () => {
  it('tuvali ekler, boyutlar, ton eşleme/renk uzayı ayarlar; dokunmatikte antialias kapalı', () => {
    const log = { sizes: [] };
    const T = fakeThree(log);
    const c = fakeContainer();
    const r = api.createKesifRenderer(T, { container: c, coarse: true, pixelRatio: 1.5 });
    expect(log.opts.antialias).toBe(false);
    expect(log.opts.stencil).toBe(false);
    expect(log.opts.powerPreference).toBe('high-performance');
    expect(c.children[0]).toBe(r.canvas);
    expect(r.canvas.attrs['aria-hidden']).toBe('true');
    expect(r.canvas.style.touchAction).toBe('none');
    expect(r.renderer.toneMapping).toBe(T.NeutralToneMapping);
    expect(r.renderer.outputColorSpace).toBe('srgb');
    expect(r.renderer.pixelRatio).toBe(1.5);
    expect(r.getSize()).toEqual({ width: 800, height: 450 });
    expect(r.resize()).toBe(false);
    c.clientWidth = 640;
    expect(r.resize()).toBe(true);
    expect(r.width).toBe(640);
    r.setPixelRatio(2);
    expect(r.renderer.pixelRatio).toBe(2);
    r.dispose();
  });

  it('masaüstünde antialias açık; ton eşleme seçilebilir', () => {
    const log = { sizes: [] };
    const T = fakeThree(log);
    const r = api.createKesifRenderer(T, { container: fakeContainer(), coarse: false, toneMapping: 'aces', exposure: 1.2 });
    expect(log.opts.antialias).toBe(true);
    expect(r.renderer.toneMapping).toBe(T.ACESFilmicToneMapping);
    expect(r.renderer.toneMappingExposure).toBe(1.2);
    r.dispose();
  });

  it('bağlam kaybı: önlenir, bayrak ve geri çağrılar çalışır; geri gelince bayrak düşer', () => {
    const log = { sizes: [] };
    const T = fakeThree(log);
    const events = [];
    const r = api.createKesifRenderer(T, {
      container: fakeContainer(), onContextLost: () => events.push('lost'), onContextRestored: () => events.push('restored'),
    });
    let prevented = false;
    log.renderer.listeners.webglcontextlost({ preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);
    expect(r.contextLost).toBe(true);
    log.renderer.listeners.webglcontextrestored({});
    expect(r.contextLost).toBe(false);
    expect(events).toEqual(['lost', 'restored']);
    r.dispose();
  });

  it('dispose: dinleyicileri kaldırır, bağlamı bırakır, tuvali çıkarır (iki kez güvenli)', () => {
    const log = { sizes: [] };
    const T = fakeThree(log);
    const c = fakeContainer();
    const r = api.createKesifRenderer(T, { container: c });
    r.dispose();
    expect(log.disposed).toBe(true);
    expect(log.forced).toBe(true);
    expect(c.children.length).toBe(0);
    expect(Object.keys(log.renderer.listeners).length).toBe(0);
    r.dispose();
  });

  it('bağlam zaten kayıpsa forceContextLoss çağrılmaz; container zorunlu', () => {
    const log = { sizes: [] };
    const T = fakeThree(log);
    const r = api.createKesifRenderer(T, { container: fakeContainer() });
    log.renderer.gl.lost = true;
    r.dispose();
    expect(log.forced).toBeUndefined();
    expect(() => api.createKesifRenderer(T, {})).toThrow(TypeError);
  });
});
