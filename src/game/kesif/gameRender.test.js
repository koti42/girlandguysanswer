import { describe, expect, it, vi } from 'vitest';

/*
 * Render yığını sayaçları: post-fx birden çok renderer.render geçişi yapar. three'nin varsayılan
 * info.autoReset'i her geçişte sayaçları sıfırlar; getStats() yalnız son (tam ekran dörtgen) geçişi
 * görüp orta/yüksek kalitede "1 üçgen, 1 çizim" bildirirdi. Kare başında elle sıfırlanmalı.
 */
const calls = [];
const renderer = {
  info: { autoReset: true, reset: vi.fn(() => calls.push('reset')), render: { calls: 0, triangles: 0 }, memory: {} },
  capabilities: { getMaxAnisotropy: () => 4 },
  getPixelRatio: () => 1,
  domElement: null,
};
const postfx = {
  setSize: vi.fn(),
  setEffects: vi.fn(),
  render: vi.fn(() => calls.push('postfx')),
  enabled: true,
};
const settings = { pixelRatio: 1, viewDist: 5, atlas: 'low', aniso: 1, material: 'low', effTier: 'low', tier: 'low' };

vi.mock('./render/index.js', async () => {
  const T = await import('three');
  const grp = () => new T.Group();
  return {
  QUALITY: { low: {}, medium: {}, high: {} },
  readRendererString: () => 'test',
  createKesifRenderer: () => ({
    renderer, setPixelRatio: vi.fn(), resize: () => false, width: 640, height: 360, contextLost: false, dispose: vi.fn(),
  }),
  createKesifQuality: () => ({ describe: () => settings, settings, sample: () => null, setTier: vi.fn(), setViewDist: vi.fn(), warmup: vi.fn() }),
  generateAtlasPixels: () => ({}),
  createAtlasTextures: () => ({ dispose: vi.fn() }),
  createChunkMaterials: () => ({ dispose: vi.fn() }),
  updateMaterialsFrame: vi.fn(),
  createChunkManager: () => ({ setViewDist: vi.fn(), getStats: () => ({ triangles: 0 }), dispose: vi.fn(), setAtlas: vi.fn() }),
  createSky: () => ({ object3D: grp(), update: vi.fn(), dispose: vi.fn() }),
  getFogParams: vi.fn(),
  createWeatherLayer: () => ({ object3D: grp(), update: vi.fn(), dispose: vi.fn() }),
  createPostFx: () => postfx,
  createParticleSystem: () => ({ update: vi.fn(), dispose: vi.fn() }),
  createBlockHighlight: () => ({ object3D: grp(), update: vi.fn(), dispose: vi.fn() }),
  };
});
vi.mock('./render/heldItems.js', () => ({ setHeldItemAtlas: vi.fn() }));
vi.mock('./render/itemIcons.js', () => ({ setAtlasPixels: vi.fn() }));

describe('createRenderStack: renderer.info sayaçları', () => {
  it('autoReset kapatılır; her karede postfx.render ÖNCESİ info.reset çağrılır', async () => {
    const { createRenderStack } = await import('./gameRender.js');
    const G = {
      opts: { controls: 'touch', quality: 'low' },
      container: { addEventListener() {}, removeEventListener() {} },
      settings: { fov: 70, viewDist: 5, quality: 'low' },
      world: { getLight: () => 0 },
      callbacks: {},
      seed: 1,
    };
    let stack;
    try {
      stack = createRenderStack(G);
    } catch (e) {
      // Sahte sahne düğümleri three Object3D değilse kurulum bu testte atlanır: yalnız kurulum hatasını göster.
      throw new Error('createRenderStack kurulamadı: ' + (e && e.message));
    }
    expect(renderer.info.autoReset).toBe(false);
    stack.render(0.016);
    stack.render(0.016);
    expect(calls).toEqual(['reset', 'postfx', 'reset', 'postfx']);
    stack.dispose();
  });
});
