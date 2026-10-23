import { describe, expect, it, vi } from 'vitest';

/*
 * perf_tuner (Faz 5) — ön-derleme çağrıları gerçek çizim hedefiyle yapılır:
 *  - post-fx açık + hedef yok → renderer.compile/compileAsync geçici ara hedefle (HalfFloat) çalışır ve sonra hedef sıfırlanır;
 *  - aynı çağrıda dokular yüklenir (initTexture) ve gizli / boş örnekli nesneler geçici görünür kılınıp TEK küçük gerçek çizim yapılır, sonra geri alınır;
 *  - hedefi çağıran kurduysa (cityLook / araç) hedef değiştirilmez; post-fx kapalıyken çağrı olduğu gibi geçer.
 */
const T = await import('three');
const state = { calls: [], rt: null, drawSeen: null, opts: null, renderer: null, G: null, nested: false };
function makeRenderer() {
  return {
  info: { autoReset: true, reset() {}, render: { calls: 0, triangles: 0 }, memory: {}, programs: [] },
  capabilities: { getMaxAnisotropy: () => 4, maxSamples: 4 },
  extensions: { has: () => false, get: () => null },
  getPixelRatio: () => 1,
  getContext: () => ({}),
  domElement: null,
  getRenderTarget: () => state.rt,
  setRenderTarget(t) { state.rt = t; state.calls.push(t ? 'setRT' : 'setRT(null)'); },
  compile() { state.calls.push('compile:' + (state.rt ? 'rt' : 'screen')); },
  compileAsync() { state.calls.push('compileAsync:' + (state.rt ? 'rt' : 'screen')); if (state.nested) this.compile(); return Promise.resolve(); },
  getScissorTest: () => false,
  getScissor(v) { v.set(0, 0, 640, 360); return v; },
  setScissorTest(on) { state.calls.push('scissorTest:' + on); },
  setScissor(x, y, w, h) { state.calls.push('scissor:' + [x, y, w, h].join(',')); },
  initTexture(t) { state.calls.push('initTexture:' + (t.name || '?')); },
  render(scene, camera) {
    state.calls.push('render');
    if (state.drawSeen) state.drawSeen(scene, camera);
  },
  };
}
const postfx = { setSize() {}, setEffects() {}, render() {}, enabled: true, dispose() {} };
const settings = { pixelRatio: 1, viewDist: 5, atlas: 'low', aniso: 1, material: 'low', effTier: 'low', tier: 'low', msaa: 4, post: true };

vi.mock('./render/index.js', async () => {
  const THREE = await import('three');
  const grp = () => new THREE.Group();
  return {
    QUALITY: { low: {}, medium: {}, high: {} },
    readRendererString: () => 'test',
    createKesifRenderer: () => ({
      renderer: (state.renderer = makeRenderer()), setPixelRatio() {}, resize: () => false, width: 640, height: 360, contextLost: false, dispose() {},
    }),
    createKesifQuality: () => ({ describe: () => settings, settings, sample: () => null, setTier() {}, setViewDist() {}, warmup() {} }),
    generateAtlasPixels: () => ({}),
    createAtlasTextures: () => ({ dispose() {} }),
    createChunkMaterials: () => ({ dispose() {} }),
    updateMaterialsFrame() {},
    createChunkManager: () => ({ setViewDist() {}, getStats: () => ({ triangles: 0 }), dispose() {}, setAtlas() {} }),
    createSky: () => ({ object3D: grp(), update() {}, dispose() {} }),
    getFogParams() {},
    createWeatherLayer: () => ({ object3D: grp(), update() {}, dispose() {} }),
    createPostFx: (_THREE, o) => { state.opts = o; return postfx; },
    createParticleSystem: () => ({ update() {}, dispose() {} }),
    createBlockHighlight: () => ({ object3D: grp(), update() {}, dispose() {} }),
  };
});
vi.mock('./render/heldItems.js', () => ({ setHeldItemAtlas: vi.fn() }));
vi.mock('./render/itemIcons.js', () => ({ setAtlasPixels: vi.fn() }));

async function build() {
  const { createRenderStack } = await import('./gameRender.js');
  const G = {
    opts: { controls: 'touch', quality: 'low' },
    container: { addEventListener() {}, removeEventListener() {} },
    settings: { fov: 70, viewDist: 5, quality: 'low' },
    world: { getLight: () => 0 },
    callbacks: {},
    seed: 1,
    dim: 'neon',
  };
  const stack = createRenderStack(G);
  state.G = G;
  return { stack, scene: state.opts.scene, camera: state.opts.camera, renderer: state.renderer };
}

function reset() {
  state.calls.length = 0;
  state.rt = null;
  state.drawSeen = null;
  postfx.enabled = true;
  settings.post = true;
}

describe('createRenderStack: ön-derleme gerçek hedefle (perf_tuner)', () => {
  it('post-fx açık, hedef yok: ara hedefle derler, dokuları yükler, gizli/boş nesneleri görünür kılıp bir kez çizer, sonra her şeyi geri alır', async () => {
    const { stack, scene, camera, renderer } = await build();
    reset();
    const hiddenMesh = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ map: Object.assign(new T.Texture(), { name: 'tabela' }) }));
    hiddenMesh.visible = false;
    const inst = new T.InstancedMesh(new T.BufferGeometry(), new T.MeshBasicMaterial(), 8);
    inst.count = 0;
    scene.add(hiddenMesh, inst);
    const seen = {};
    state.drawSeen = () => { seen.hidden = hiddenMesh.visible; seen.count = inst.count; seen.rt = !!state.rt; };
    renderer.compile(scene, camera);
    expect(state.calls[0]).toBe('setRT');
    expect(state.calls).toContain('compile:rt');
    expect(state.calls).toContain('initTexture:tabela');
    expect(state.calls.filter((c) => c === 'render')).toHaveLength(1);
    expect(state.calls[state.calls.length - 1]).toBe('setRT(null)');
    expect(seen).toEqual({ hidden: true, count: 1, rt: true });
    expect(hiddenMesh.visible).toBe(false);
    expect(inst.count).toBe(0);
    stack.dispose();
  });

  it('compileAsync de aynı yoldan geçer', async () => {
    const { stack, scene, camera, renderer } = await build();
    reset();
    renderer.compileAsync(scene, camera);
    expect(state.calls[0]).toBe('setRT');
    expect(state.calls).toContain('compileAsync:rt');
    expect(state.calls[state.calls.length - 1]).toBe('setRT(null)');
    stack.dispose();
  });

  it('hedefi çağıran kurduysa hedef değişmez (yine de dokular + tek çizim)', async () => {
    const { stack, scene, camera, renderer } = await build();
    reset();
    state.rt = { own: true };
    renderer.compile(scene, camera);
    expect(state.calls).not.toContain('setRT');
    expect(state.calls).not.toContain('setRT(null)');
    expect(state.calls).toContain('compile:rt');
    expect(state.calls.filter((c) => c === 'render')).toHaveLength(1);
    expect(state.rt).toEqual({ own: true });
    stack.dispose();
  });

  it('post-fx kapalıyken (düşük kademe): ekran hedefiyle derler; ısınma çizimi 1×1 makas bölgesinde yapılır ve makas geri alınır', async () => {
    const { stack, scene, camera, renderer } = await build();
    reset();
    postfx.enabled = false;
    renderer.compile(scene, camera);
    expect(state.calls).toEqual(['compile:screen', 'scissorTest:true', 'scissor:0,0,1,1', 'render', 'scissor:0,0,640,360', 'scissorTest:false']);
    stack.dispose();
  });

  it('düşük kademe + geçiş/foto sırasında post-fx geçici açık: İKİ varyant derlenir (ara hedef + ekran) ve ikisi için de ısınma çizimi yapılır', async () => {
    const { stack, scene, camera, renderer } = await build();
    reset();
    settings.post = false; // düşük kademe: oyun ekrana çizer
    postfx.enabled = true; // geçiş: post-fx geçici açık
    renderer.compile(scene, camera);
    const c = state.calls;
    expect(c.indexOf('compile:rt')).toBeGreaterThan(-1);
    expect(c.indexOf('compile:screen')).toBeGreaterThan(c.indexOf('compile:rt'));
    expect(c.filter((x) => x === 'render')).toHaveLength(2);
    expect(c.indexOf('setRT(null)')).toBeLessThan(c.indexOf('compile:screen'));
    expect(state.rt).toBeNull();
    stack.dispose();
  });

  it('ana diyarda (G.dim !== neon) çağrı aynen geçer: hedef/ısınma çizimi/doku yükleme yok', async () => {
    const { stack, scene, camera, renderer } = await build();
    reset();
    state.G.dim = 'overworld';
    renderer.compile(scene, camera);
    expect(state.calls).toEqual(['compile:screen']);
    stack.dispose();
  });

  it('düşük kademe + kendi hedefini kuran çağıran (araç ısınması): ara hedef varyantı + hedefsiz (ekran) varyant, hedef geri konur', async () => {
    const { stack, scene, camera, renderer } = await build();
    reset();
    settings.post = false;
    const own = { own: true };
    state.rt = own;
    renderer.compile(scene, camera);
    const c = state.calls;
    expect(c.indexOf('compile:rt')).toBeGreaterThan(-1);
    expect(c.indexOf('compile:screen')).toBeGreaterThan(c.indexOf('compile:rt'));
    expect(state.rt).toBe(own);
    stack.dispose();
  });

  it('ana sahne dışındaki sahneyle derleme ısınma çizimi yapmaz (yalnız hedef + derleme)', async () => {
    const { stack, camera, renderer } = await build();
    reset();
    renderer.compile(new T.Scene(), camera);
    expect(state.calls.filter((c) => !c.startsWith('initTexture'))).toEqual(['setRT', 'compile:rt', 'setRT(null)']);
    stack.dispose();
  });

  it('yığın atılınca kanca bırakılır: sarmalayıcı özgün işlevi aynen çalıştırır ve işleyiciyi (yığın kapsamını) tutmaz; yeniden kurulumda zincir oluşmaz (bellek sızıntısı önlemi)', async () => {
    const { stack, scene, camera, renderer } = await build();
    const wrapper = renderer.compile;
    const hook = renderer.__kesifCompileHook;
    expect(typeof hook.handler).toBe('function');
    stack.dispose();
    expect(hook.handler).toBeNull();
    reset();
    renderer.compile(scene, camera);
    expect(state.calls).toEqual(['compile:screen']);
    expect(renderer.compile).toBe(wrapper);
  });

  it('three compileAsync içeriden this.compile çağırır: iç içe çağrı ikinci kez ısınma / ara hedef / çizim yapmaz', async () => {
    const { stack, scene, camera, renderer } = await build();
    reset();
    state.nested = true;
    renderer.compileAsync(scene, camera);
    expect(state.calls.filter((c) => c === 'render')).toHaveLength(1);
    expect(state.calls.filter((c) => c === 'setRT')).toHaveLength(1);
    expect(state.calls).toContain('compileAsync:rt');
    expect(state.calls).toContain('compile:rt'); // iç çağrı özgün compile'a aynen geçer
    stack.dispose();
  });
});
