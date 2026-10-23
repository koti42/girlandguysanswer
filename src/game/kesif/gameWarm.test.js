import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createWarmSteps, heldKindKeys, precompileForState, warmCharacterPass, warmHeldKinds, warmRenderPrograms } from './gameWarm.js';
import { ITEMS } from './sim/items.js';
import { isGlintKey, baseKey } from './render/enchantGlint.js';

function makeG(opts = {}) {
  const calls = [];
  const rtCreated = [];
  class RT {
    constructor(w, h, o) { this.w = w; this.h = h; this.o = o; this.disposed = false; rtCreated.push(this); }
    dispose() { this.disposed = true; }
  }
  let currentRT = 'ekran';
  const renderer = {
    getRenderTarget: () => currentRT,
    setRenderTarget: (t) => { currentRT = t; calls.push(['rt', t && t.w ? 'ara' : t]); },
    render: vi.fn(() => {
      calls.push(['render', { ch: G.character.root.visible, vm: G.viewModel.group.visible, world: G.worldRoot.visible, ent: G.entityRoot.visible, rt: currentRT && currentRT.w ? 'ara' : currentRT }]);
      if (opts.throwOnRender) throw new Error('çizim hatası');
    }),
  };
  const G = {
    THREE: { WebGLRenderTarget: RT, HalfFloatType: 1016, Vector3: THREE.Vector3 },
    renderer,
    scene: {},
    camera: { position: { x: 10, y: 70, z: -5 }, getWorldDirection: (v) => v.set(0, 0, -1) },
    highlight: { log: [], setTarget(h) { this.log.push(['target', h && h.blockId]); }, setBreakProgress(p) { this.log.push(['break', p]); }, setPlacementGhost(id) { this.log.push(['ghost', id]); }, update() { this.log.push(['update']); } },
    postfx: { enabled: opts.post !== false },
    character: { root: { visible: false } },
    viewModel: { group: { visible: true }, held: [], setHeld(k) { this.held.push(k); } },
    worldRoot: { visible: true },
    entityRoot: Object.assign(new THREE.Group(), { visible: true }),
  };
  return { G, calls, rtCreated, getRT: () => currentRT };
}

describe('heldKindKeys', () => {
  it('her model türü için tek bir temsilci + büyülü parıltı örneği', () => {
    const keys = heldKindKeys();
    const plain = keys.filter((k) => !isGlintKey(k));
    const kinds = plain.map((k) => ITEMS[k].model || 'flat');
    expect(new Set(kinds).size).toBe(kinds.length);
    ['tool', 'sword', 'cube', 'torch', 'flat', 'compass', 'gun', 'staff'].forEach((k) => expect(kinds).toContain(k));
    const glint = keys.filter((k) => isGlintKey(k));
    expect(glint.length).toBe(1);
    expect(['sword', 'tool']).toContain(ITEMS[baseKey(glint[0])].model);
  });
});

describe('warmCharacterPass', () => {
  it('karakter görünür, kol/dünya/varlıklar gizli, ara hedefe çizer; sonra her şeyi geri koyar', () => {
    const { G, calls, rtCreated, getRT } = makeG();
    const ms = warmCharacterPass(G);
    expect(ms).toBeGreaterThanOrEqual(0);
    const draw = calls.find((c) => c[0] === 'render')[1];
    expect(draw).toEqual({ ch: true, vm: false, world: false, ent: false, rt: 'ara' });
    expect(G.character.root.visible).toBe(false);
    expect(G.viewModel.group.visible).toBe(true);
    expect(G.worldRoot.visible).toBe(true);
    expect(G.entityRoot.visible).toBe(true);
    expect(getRT()).toBe('ekran');
    expect(rtCreated).toHaveLength(1);
    expect(rtCreated[0].disposed).toBe(true);
    expect(rtCreated[0].o.type).toBe(1016);
  });
  it('QA5: sırttaki jetpack ısınma karesinde görünür kılınır, çizimden sonra gizlenir (ilk TP itişinde derleme takılması yok); hata olsa da gizlenir', () => {
    const { G } = makeG();
    const log = [];
    G.techVisuals = { backpack: { update: (show) => log.push(show) } };
    G.renderer.render.mockImplementationOnce(() => { log.push('render'); });
    warmCharacterPass(G);
    expect(log).toEqual([true, 'render', false]);
    const bad = makeG({ throwOnRender: true });
    const log2 = [];
    bad.G.techVisuals = { backpack: { update: (show) => log2.push(show) } };
    expect(warmCharacterPass(bad.G)).toBe(-1);
    expect(log2).toEqual([true, false]);
  });
  it('son işleme kapalıyken ekrana çizer (ara hedef yok)', () => {
    const { G, calls, rtCreated } = makeG({ post: false });
    warmCharacterPass(G);
    expect(rtCreated).toHaveLength(0);
    expect(calls.find((c) => c[0] === 'render')[1].rt).toBe(null);
  });
  it('çizim hata verirse durumu geri koyar ve -1 döner (oyun açılışı bozulmaz)', () => {
    const { G, getRT, rtCreated } = makeG({ throwOnRender: true });
    expect(warmCharacterPass(G)).toBe(-1);
    expect(G.character.root.visible).toBe(false);
    expect(G.viewModel.group.visible).toBe(true);
    expect(G.worldRoot.visible).toBe(true);
    expect(getRT()).toBe('ekran');
    expect(rtCreated[0].disposed).toBe(true);
  });
  it('eksik parçalarda (karakter yok) sessizce -1', () => {
    const { G } = makeG();
    G.character = null;
    expect(warmCharacterPass(G)).toBe(-1);
    expect(warmCharacterPass({})).toBe(-1);
  });
});

describe('warmHeldKinds / warmRenderPrograms', () => {
  it('her tür için kol modeli kurulur ve çizilir; sonda kol boşaltılır, görünürlükler eski haline döner', () => {
    const { G, calls } = makeG();
    const r = warmHeldKinds(G);
    expect(r.kinds).toBe(heldKindKeys().length);
    expect(G.viewModel.held.slice(0, -1)).toEqual(heldKindKeys());
    expect(G.viewModel.held[G.viewModel.held.length - 1]).toBe(null);
    const draws = calls.filter((c) => c[0] === 'render');
    expect(draws.length).toBe(r.kinds);
    draws.forEach((d) => expect(d[1]).toMatchObject({ ch: false, vm: true, world: false, ent: true }));
    expect(G.character.root.visible).toBe(false);
  });
  it('hedef çerçevesi/çatlak/hayalet çizilir ve sonra temizlenir; yere düşen eşyalar sahneden kalkar', () => {
    const { G, calls } = makeG();
    const seen = [];
    G.renderer.render = vi.fn(() => { seen.push(G.entityRoot.children.length); });
    warmHeldKinds(G);
    expect(G.highlight.log.slice(0, 3)).toEqual([['target', 1], ['break', 0.5], ['ghost', 1]]);
    expect(G.highlight.log.slice(-3)).toEqual([['break', 0], ['target', null], ['ghost', null]]);
    expect(seen.length).toBe(heldKindKeys().length);
    seen.forEach((n) => expect(n).toBeGreaterThanOrEqual(1));
    expect(G.entityRoot.children.length).toBe(0);
    expect(G.entityRoot.visible).toBe(true);
    expect(calls).toBeTruthy();
  });
  it('hata olursa kol boşaltılır, {ms:-1}', () => {
    const { G } = makeG({ throwOnRender: true });
    expect(warmHeldKinds(G)).toEqual({ ms: -1, kinds: 0 });
    expect(G.viewModel.held[G.viewModel.held.length - 1]).toBe(null);
  });
  it('warmRenderPrograms ikisini de çalıştırır', () => {
    const { G } = makeG();
    const r = warmRenderPrograms(G);
    expect(r.characterMs).toBeGreaterThanOrEqual(0);
    expect(r.heldMs).toBeGreaterThanOrEqual(0);
    expect(r.kinds).toBeGreaterThan(5);
  });
});

describe('precompileForState (kalite değişimi sonrası paralel bağlama)', () => {
  function fake(throwCompile) {
    const log = [];
    let cur = 'ekran';
    const created = [];
    class RT { constructor(w, h, o) { this.o = o; this.disposed = false; created.push(this); } dispose() { this.disposed = true; } }
    const renderer = {
      getRenderTarget: () => cur,
      setRenderTarget: (t) => { cur = t; log.push(t === null ? 'null' : t === 'ekran' ? 'ekran' : 'rt'); },
      compile: () => { log.push('compile@' + (cur === null ? 'null' : cur && cur.o ? 'rt' : cur)); if (throwCompile) throw new Error('x'); },
    };
    return { renderer, log, created, THREE: { WebGLRenderTarget: RT, HalfFloatType: 1016 }, get cur() { return cur; } };
  }
  it('son işleme açıkken yarı-kayan noktalı ara hedefle derler, hedefi geri koyar ve ara hedefi atar', () => {
    const f = fake(false);
    expect(precompileForState(f.THREE, f.renderer, {}, {}, true)).toBe(true);
    expect(f.log).toContain('compile@rt');
    expect(f.cur).toBe('ekran');
    expect(f.created[0].o.type).toBe(1016);
    expect(f.created[0].disposed).toBe(true);
  });
  it('kapalıyken ekran hedefiyle (null) derler', () => {
    const f = fake(false);
    expect(precompileForState(f.THREE, f.renderer, {}, {}, false)).toBe(true);
    expect(f.log).toContain('compile@null');
    expect(f.created).toHaveLength(0);
    expect(f.cur).toBe('ekran');
  });
  it('derleme hata verirse yutar, hedefi geri koyar', () => {
    const f = fake(true);
    expect(precompileForState(f.THREE, f.renderer, {}, {}, true)).toBe(false);
    expect(f.cur).toBe('ekran');
    expect(f.created[0].disposed).toBe(true);
  });
  it('compile yoksa (sahte renderer) sessizce false', () => {
    expect(precompileForState({}, {}, {}, {}, true)).toBe(false);
  });
});

describe('createWarmSteps (yükleme döngüsüne yayılmış ısınma)', () => {
  it('karakter + eşya türleri dörderli adımlar; her adım hata fırlatmaz ve tüm anahtarları kapsar', () => {
    const { G } = makeG();
    const steps = createWarmSteps(G, 4);
    const keys = heldKindKeys();
    expect(steps.length).toBe(1 + Math.ceil(keys.length / 4));
    const res = steps.map((st) => st());
    expect(res[0].what).toBe('karakter');
    expect(res.slice(1).reduce((n, r) => n + r.kinds, 0)).toBe(keys.length);
    res.forEach((r) => expect(r.ms).toBeGreaterThanOrEqual(0));
    expect(G.viewModel.held.filter((k) => k !== null)).toEqual(keys);
  });
  it('sahte/eksik G ile adımlar -1 döner ama fırlatmaz', () => {
    const steps = createWarmSteps({});
    steps.forEach((st) => expect(() => st()).not.toThrow());
  });
});
