import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  TIERS, collectUnits, createSliceClock, createTierWarmer, needsUnit, planTierVariants, variantOf,
} from './gameWarmTiers.js';
import { QUALITY } from './render/quality.js';

describe('planTierVariants / variantOf / needsUnit (saf)', () => {
  it('geçerli kademe hariç, önce bir alt, sonra bir üst kademe', () => {
    expect(planTierVariants('high').map((v) => v.tier)).toEqual(['medium', 'low']);
    expect(planTierVariants('medium').map((v) => v.tier)).toEqual(['low', 'high']);
    expect(planTierVariants('low').map((v) => v.tier)).toEqual(['medium', 'high']);
    expect(planTierVariants('???').map((v) => v.tier)).toEqual(['low', 'high']); // bilinmeyen → orta sayılır
    expect(TIERS).toEqual(['low', 'medium', 'high']);
  });

  it('variantOf: program anahtarını etkileyen alanlar kalite tablosundan gelir', () => {
    for (const t of TIERS) {
      const v = variantOf(t);
      expect(v).toEqual({
        tier: t, post: QUALITY[t].post, material: QUALITY[t].material, clouds: QUALITY[t].clouds,
      });
    }
    // post açık/kapalı (hedef türü) yalnız low'da farklı; chunk tanımı ve bulut kipi üç kademede farklı
    expect(variantOf('low').post).toBe(false);
    expect(variantOf('medium').post).toBe(true);
    expect(new Set(TIERS.map((t) => variantOf(t).material)).size).toBe(3);
    expect(new Set(TIERS.map((t) => variantOf(t).clouds)).size).toBe(3);
  });

  it('needsUnit: hedef türü değişince her şey; yoksa yalnız tanımı/kipi değişenler', () => {
    const cur = { post: true, material: 'high', clouds: 'tam' };
    const lowV = variantOf('low');
    const medV = variantOf('medium');
    for (const kind of ['chunk', 'sky', 'other']) expect(needsUnit(kind, lowV, cur)).toBe(true);
    expect(needsUnit('chunk', medV, cur)).toBe(true);
    expect(needsUnit('sky', medV, cur)).toBe(true);
    expect(needsUnit('other', medV, cur)).toBe(false);
    const same = { post: true, material: 'medium', clouds: 'tam' };
    expect(needsUnit('chunk', medV, same)).toBe(false);
    expect(needsUnit('sky', medV, same)).toBe(true);
  });

  it('createSliceClock: bütçe dolunca over()', () => {
    let t = 100;
    const c = createSliceClock({ budgetMs: 6, now: () => t });
    c.start();
    expect(c.over()).toBe(false);
    t += 5.9;
    expect(c.over()).toBe(false);
    t += 0.2;
    expect(c.over()).toBe(true);
    expect(c.spent()).toBeCloseTo(6.1, 5);
    expect(createSliceClock({ now: () => 0 }).budget).toBe(6);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Sahte renderer + sahne ile ısıtıcı davranışı
 * ---------------------------------------------------------------------------------------------- */
const MESH_ATTRS = ['position', 'normal', 'uv', 'aColor', 'aLight', 'aFlags'];

function makeWorld(opts) {
  const o = opts || {};
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 10, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
  const mk = (name) => new THREE.MeshBasicMaterial({ name });
  const chunkMats = { opaque: mk('opak'), cutout: mk('kesik'), transparent: mk('saydam') };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  // chunk malzemeleri: opak + kesik sahnede, saydam sahnede YOK (kukla ağ gerekir)
  scene.add(new THREE.Mesh(geo, chunkMats.opaque));
  scene.add(new THREE.Mesh(geo, chunkMats.cutout));
  const sky = new THREE.Group();
  const skyMat = mk('gok');
  sky.add(new THREE.Mesh(geo, skyMat));
  scene.add(sky);
  const shared = mk('ortak');
  const others = [];
  for (let i = 0; i < (o.others || 6); i++) {
    const m = i < 2 ? shared : mk('diger' + i); // ilk ikisi AYNI malzeme → tek birim
    const mesh = new THREE.Mesh(geo, m);
    mesh.visible = i % 2 === 0; // görünmez nesneler de birimdir
    scene.add(mesh);
    others.push(mesh);
  }
  const events = [];
  let clock = 0;
  const readyAt = new Map(); // malzeme adı → hazır olacağı saat
  const renderer = {
    debug: { checkShaderErrors: true },
    autoClear: true,
    properties: { get: (m) => ({ currentProgram: { isReady: () => clock >= (readyAt.get(m.name) || 0) } }) },
    _rt: null,
    _scissor: false,
    getRenderTarget() { return this._rt; },
    setRenderTarget(rt) { this._rt = rt; events.push('rt:' + (rt ? 'rt' : 'null')); },
    getScissorTest() { return this._scissor; },
    setScissorTest(b) { this._scissor = !!b; },
    setScissor() {},
    compile(obj) {
      clock += o.compileCost || 1;
      events.push('compile:' + obj.material.name + ':' + (this._rt ? 'rt' : 'null') + ':' + this.debug.checkShaderErrors);
    },
    render(sc) {
      clock += o.drawCost || 1;
      sc.traverse((x) => { if (x.isMesh) events.push('draw:' + x.material.name + ':' + (this._rt ? 'rt' : 'null') + ':scissor=' + this._scissor); });
    },
  };
  const settings = { tier: 'high', post: true, material: 'high', clouds: 'tam' };
  const G = {
    THREE,
    scene,
    camera: new THREE.PerspectiveCamera(),
    renderer,
    materials: {
      opaque: chunkMats.opaque,
      cutout: chunkMats.cutout,
      transparent: chunkMats.transparent,
      setQuality(l) { events.push('mat:' + l); },
    },
    sky: { object3D: sky, setQuality(q) { events.push('sky:' + q.clouds); } },
    postfx: { warm() { events.push('postfx.warm'); return true; } },
    quality: { settings },
  };
  return {
    G, events, readyAt, settings, advance: (ms) => { clock += ms; }, getClock: () => clock,
  };
}

describe('collectUnits', () => {
  it('malzeme başına tek birim (görünmezler dahil); türler chunk/sky/other; eksik chunk malzemesi için kukla ağ', () => {
    const { G } = makeWorld({ others: 6 });
    const units = collectUnits(G);
    const kinds = {};
    units.forEach((u) => { kinds[u.kind] = (kinds[u.kind] || 0) + 1; });
    // chunk: opak + kesik (sahnede) + saydam (kukla) ; sky: 1 ; other: 5 (6 mesh, ilk ikisi aynı malzeme)
    expect(kinds).toEqual({ chunk: 3, sky: 1, other: 5 });
    const dummy = units.filter((u) => u.dummy);
    expect(dummy.length).toBe(1);
    expect(dummy[0].mat).toBe(G.materials.transparent);
    // kukla geometri gerçek chunk öznitelik kümesini taşır (three program anahtarı `normal` vb. varlığına bakar)
    expect(Object.keys(dummy[0].obj.geometry.attributes).sort()).toEqual(MESH_ATTRS.slice().sort());
    expect(new Set(units.map((u) => u.mat.uuid)).size).toBe(units.length);
  });
});

describe('createTierWarmer', () => {
  function runAll(w, budget, maxSteps) {
    const guard = maxSteps || 400;
    const slices = [];
    for (let i = 0; i < guard && !w.done; i++) {
      const r = w.step(budget);
      slices.push(r);
      w.G_advance && w.G_advance(); // (ihtiyaç halinde)
    }
    return slices;
  }

  it('her dilim bütçeyi (+ bir birim) aşmaz, durumu geri alır, hedef türünü geri koyar', () => {
    const world = makeWorld({ others: 8, compileCost: 1, drawCost: 1 });
    // dilim süresi için sahte saat: renderer'ın iç saatini kullan
    const warmer = createTierWarmer(world.G, { now: world.getClock });
    const slices = runAll(warmer, 4, 200);
    expect(warmer.done).toBe(true);
    expect(warmer.stats.errors).toBe(0);
    // bütçe 4 ms, birim maliyeti 1-2 ms: hiçbir dilim ~6 ms'yi aşmaz
    expect(Math.max(...slices.map((s) => s.ms))).toBeLessThanOrEqual(6);
    expect(slices.length).toBeGreaterThan(3); // gerçekten dilimlere bölündü
    // durum geçici kurulup geri alındı: her mat:X / sky:Y çifti yüksek durumla bitti
    const matEvents = world.events.filter((e) => e.startsWith('mat:'));
    expect(matEvents.length).toBeGreaterThan(0);
    expect(matEvents.length % 2).toBe(0);
    for (let i = 0; i < matEvents.length; i += 2) expect(matEvents[i + 1]).toBe('mat:high');
    const skyEvents = world.events.filter((e) => e.startsWith('sky:'));
    for (let i = 0; i < skyEvents.length; i += 2) expect(skyEvents[i + 1]).toBe('sky:tam');
    // hedef türü ve hata denetimi bayrağı geri geldi
    expect(world.G.renderer.getRenderTarget()).toBeNull();
    expect(world.G.renderer.debug.checkShaderErrors).toBe(true);
    expect(world.G.renderer.autoClear).toBe(true);
    expect(world.G.renderer.getScissorTest()).toBe(false);
  });

  it('low varyantı ekrana (hedef yok), medium/high varyantı ara hedefe derler; post-fx programları kapalıyken açığa geçişte ısıtılır', () => {
    const world = makeWorld({ others: 4 });
    world.settings.tier = 'low';
    world.settings.post = false;
    world.settings.material = 'low';
    world.settings.clouds = 'basit';
    const warmer = createTierWarmer(world.G, { now: world.getClock });
    runAll(warmer, 8);
    expect(warmer.done).toBe(true);
    expect(world.events).toContain('postfx.warm');
    // medium (post açık) için derleme ara hedefe
    expect(world.events.some((e) => e.startsWith('compile:') && e.includes(':rt:'))).toBe(true);
    // geçerli (low) durumun çizimleri hedefsiz
    expect(world.events.some((e) => e.startsWith('draw:') && e.includes(':null:'))).toBe(true);
  });

  it('çizim geçişi programı hazır değilse BEKLER (çizmez); hazır olunca 1×1 makasla çizer', () => {
    const world = makeWorld({ others: 3, compileCost: 0.1, drawCost: 0.1 });
    // tüm malzemeler 1000 ms sonra hazır
    ['opak', 'kesik', 'saydam', 'gok', 'ortak', 'diger2'].forEach((n) => world.readyAt.set(n, 1000));
    const warmer = createTierWarmer(world.G, { now: world.getClock, maxWaits: 1e6 });
    for (let i = 0; i < 60; i++) warmer.step(50);
    expect(world.events.some((e) => e.startsWith('draw:'))).toBe(false); // hazır değil → çizim yok
    expect(warmer.compiled).toBe(true); // derleme geçişi yine de bitti (yükleme ekranı bunu bekler)
    expect(warmer.done).toBe(false);
    world.advance(2000);
    for (let i = 0; i < 400 && !warmer.done; i++) warmer.step(50);
    expect(warmer.done).toBe(true);
    const draws = world.events.filter((e) => e.startsWith('draw:'));
    expect(draws.length).toBeGreaterThan(0);
    expect(draws.every((e) => e.endsWith('scissor=true'))).toBe(true);
    expect(warmer.stats.drawn).toBeGreaterThan(0);
  });

  it('maxWaits dolunca hazır olmayan birim atlanır (sonsuz bekleme yok)', () => {
    const world = makeWorld({ others: 2, compileCost: 0.1, drawCost: 0.1 });
    ['opak', 'kesik', 'saydam', 'gok', 'ortak'].forEach((n) => world.readyAt.set(n, 1e9));
    const warmer = createTierWarmer(world.G, { now: world.getClock, maxWaits: 3 });
    for (let i = 0; i < 400 && !warmer.done; i++) warmer.step(50);
    expect(warmer.done).toBe(true);
    expect(warmer.stats.skipped).toBeGreaterThan(0);
  });

  it('kalite durumu değişirse (otomatik adım) yeniden planlanır', () => {
    const world = makeWorld({ others: 4 });
    const warmer = createTierWarmer(world.G, { now: world.getClock });
    warmer.step(3);
    const before = warmer.stats.variants;
    world.settings.tier = 'medium';
    world.settings.material = 'medium';
    world.settings.clouds = 'orta';
    warmer.step(3);
    expect(warmer.stats.variants).toBeGreaterThan(before); // yeni plan için varyantlar yeniden başladı
    for (let i = 0; i < 400 && !warmer.done; i++) warmer.step(5);
    expect(warmer.done).toBe(true);
  });

  it('renderer.compile fırlatırsa hata sayılır, ısıtıcı donmaz, durum geri alınır', () => {
    const world = makeWorld({ others: 3 });
    world.G.renderer.compile = () => { throw new Error('derleme patladı'); };
    const warmer = createTierWarmer(world.G, { now: world.getClock });
    for (let i = 0; i < 100 && !warmer.done; i++) warmer.step(5);
    expect(warmer.done).toBe(true);
    expect(warmer.stats.errors).toBeGreaterThan(0);
    expect(world.G.renderer.debug.checkShaderErrors).toBe(true);
    expect(world.G.renderer.getRenderTarget()).toBeNull();
    const matEvents = world.events.filter((e) => e.startsWith('mat:'));
    for (let i = 0; i < matEvents.length; i += 2) expect(matEvents[i + 1]).toBe('mat:high');
  });

  it('renderer.compile yoksa (eksik ortam) hemen biter', () => {
    const world = makeWorld({});
    delete world.G.renderer.compile;
    const warmer = createTierWarmer(world.G, { now: world.getClock });
    expect(warmer.step(5).done).toBe(true);
    expect(warmer.done).toBe(true);
  });
});
