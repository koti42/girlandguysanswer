import { describe, expect, it } from 'vitest';
import { bestOf, cpuMs, scaled } from '../../../../test/perfScale.js';
import * as THREE from 'three';
import { INTERIOR_TIERS, createInteriorPropRenderer, moodRgb } from './propRendererInterior.js';
import { createSignAtlas } from './signAtlas.js';
import { PropWorld } from '../../sim/props/propWorld.js';
import { INTERIOR_BY_KEY, INTERIOR_DEFS } from '../../sim/props/propDefsInterior.js';
import { createMaterialUniforms } from '../materials.js';

function fakeCanvas() {
  const state = { font: '' };
  const ctx = {
    set font(v) { state.font = v; },
    get font() { return state.font; },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, fillText() {},
    measureText(t) {
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      return { width: t.length * (m ? parseFloat(m[1]) : 10) * 0.56 };
    },
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

let nextId = 1000;
function prop(key, x, y, z, yaw, o) {
  const d = INTERIOR_BY_KEY[key];
  return {
    id: (o && o.id) || ++nextId, t: d.t, x, y, z, yaw: yaw || 0, variant: (o && o.variant) || 0, flags: (o && o.flags) || 0,
  };
}

/** Her chunk için sabit prop listesi: planner(seed,cx,cz) → liste. */
function makeWorld(props) {
  const by = new Map();
  props.forEach((p) => {
    const k = Math.floor(p.x / 16) + ',' + Math.floor(p.z / 16);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(p);
  });
  const pw = new PropWorld({ citySeed: 4242, planner: (s, cx, cz) => by.get(cx + ',' + cz) || [] });
  by.forEach((v, k) => { const [cx, cz] = k.split(',').map(Number); pw.loadChunk(cx, cz); });
  return pw;
}

function room(cx, cz, extra) {
  const x = cx * 16 + 8;
  const z = cz * 16 + 8;
  const list = [
    prop('masa', x, 64, z, 0), prop('sandalye', x + 2, 64, z, 1), prop('kanepe', x - 3, 64, z + 2, 2), prop('kapi', x + 4, 64, z - 3, 0),
    prop('holo_ekran', x, 66, z - 5, 0), prop('buzdolabi', x + 5, 64, z + 4, 3), prop('menu_tahtasi', x - 5, 65, z - 6, 0),
    prop('kitaplik', x - 6, 64, z + 5, 0), prop('arcade_makinesi', x + 3, 64, z + 5, 2),
  ];
  return extra ? list.concat(extra) : list;
}

function camAt(x, y, z) {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 1600);
  cam.position.set(x, y, z);
  cam.updateMatrixWorld(true);
  return cam;
}

function make(quality, opts) {
  const uniforms = createMaterialUniforms(THREE);
  return createInteriorPropRenderer(Object.assign({
    THREE, uniforms, quality, createCanvas: () => fakeCanvas(),
  }, opts || {}));
}

function run(ir, cam, frames, dt) {
  for (let i = 0; i < (frames || 30); i++) ir.update(dt === undefined ? 1 / 60 : dt, cam);
}

describe('createInteriorPropRenderer — yapı ve pişirme', () => {
  it('başlangıçta boş; bağlanınca chunk\'lar kare başı en çok 1 pişer; her chunk TEK ağ; çağrı ≤ bütçe', () => {
    const props = [];
    for (let cx = 0; cx < 3; cx++) for (let cz = 0; cz < 3; cz++) props.push(...room(cx, cz));
    const pw = makeWorld(props);
    const ir = make('high');
    expect(ir.group.children.length).toBe(0);
    ir.setWorld(pw);
    const cam = camAt(24, 65.6, 24);
    ir.update(1 / 60, cam);
    expect(ir.stats.bakes).toBe(1);
    run(ir, cam, 40);
    expect(ir.stats.bakes).toBe(9);
    expect(ir.stats.queue).toBe(0);
    const meshes = ir.group.children.filter((c) => c.isMesh && c.name.indexOf('ic-') === 0 && c.name !== 'ic-holo');
    expect(meshes.length).toBe(9);
    meshes.forEach((m) => {
      expect(m.material).toBe(meshes[0].material);
      expect(m.frustumCulled).toBe(true);
      expect(m.geometry.getAttribute('position').count % 3).toBe(0);
    });
    expect(ir.stats.draws).toBeLessThanOrEqual(INTERIOR_TIERS.high.maxChunks + 1);
    expect(ir.stats.instances).toBe(props.length);
    // qa5: maxBakeMs duvar saatiyle ürün kodunda ölçülür; CPU doygunluğunda tek kesinti şişirir -> eşik aşılırsa taze çizicide en çok 3 kez yeniden ölçülür
    let bakeMs = ir.stats.maxBakeMs;
    for (let a = 0; a < 3 && bakeMs >= scaled(250); a++) {
      const r2 = make('high');
      r2.setWorld(pw);
      r2.update(1 / 60, cam);
      run(r2, cam, 40);
      bakeMs = Math.min(bakeMs, r2.stats.maxBakeMs);
      r2.dispose();
    }
    expect(bakeMs).toBeLessThan(scaled(250));
    ir.dispose();
  });

  it('geometri öznitelikleri ve türleri sözleşmeye uyar', () => {
    const pw = makeWorld(room(1, 1));
    const ir = make('high');
    ir.setWorld(pw);
    run(ir, camAt(24, 65.6, 24), 5);
    const g = ir.group.children.find((c) => c.name === 'ic-1,1').geometry;
    const spec = {
      position: [Float32Array, 3, false], normal: [Int8Array, 4, true], uv: [Uint16Array, 2, true], aCol: [Uint8Array, 4, true], aMat: [Uint8Array, 4, false],
      aInst: [Uint8Array, 4, false], aTint: [Uint8Array, 4, true], aSign: [Uint16Array, 4, true], aLight: [Uint8Array, 4, true], aAnim: [Int8Array, 4, true],
    };
    Object.keys(spec).forEach((k) => {
      const a = g.getAttribute(k);
      expect(a, k).toBeTruthy();
      expect(a.array instanceof spec[k][0], k).toBe(true);
      expect(a.itemSize, k).toBe(spec[k][1]);
      expect(a.normalized, k).toBe(spec[k][2]);
      expect(a.count, k).toBe(g.getAttribute('position').count);
    });
    expect(g.boundingSphere.radius).toBeGreaterThan(3);
    expect(g.boundingBox.min.x).toBeLessThan(g.boundingBox.max.x);
    ir.dispose();
  });

  it('kademe tavanları: yarıçap dışı chunk çizilmez; chunk sayısı ve üçgen bütçesi aşılmaz (low)', () => {
    const props = [];
    for (let cx = 0; cx < 8; cx++) for (let cz = 0; cz < 8; cz++) props.push(...room(cx, cz));
    const pw = makeWorld(props);
    const ir = make('low');
    ir.setWorld(pw);
    const cam = camAt(8, 65.6, 8);
    run(ir, cam, 120);
    expect(ir.stats.shown).toBeLessThanOrEqual(INTERIOR_TIERS.low.maxChunks);
    expect(ir.stats.tris).toBeLessThanOrEqual(INTERIOR_TIERS.low.maxTris);
    ir.group.children.forEach((c) => {
      if (!c.visible || c.name === 'ic-holo') return;
      const [cx, cz] = c.name.slice(3).split(',').map(Number);
      const dx = Math.max(cx * 16 - 8, 0, 8 - cx * 16 - 16);
      const dz = Math.max(cz * 16 - 8, 0, 8 - cz * 16 - 16);
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(INTERIOR_TIERS.low.radius + 1e-6);
    });
    ir.setQuality('high');
    expect(ir.quality).toBe('high');
    run(ir, cam, 140);
    expect(ir.stats.shown).toBeLessThanOrEqual(INTERIOR_TIERS.high.maxChunks);
    expect(ir.stats.shown).toBeGreaterThan(INTERIOR_TIERS.low.maxChunks);
    ir.setQuality('yok');
    expect(ir.quality).toBe('high');
    ir.dispose();
  });

  it('kamera uzaklaşınca chunk gizlenir, yaklaşınca geri gelir; uzun süre görünmeyen pişmiş chunk\'lar atılır (bellek)', () => {
    const props = [];
    for (let cx = 0; cx < 12; cx++) props.push(...room(cx, 0));
    const pw = makeWorld(props);
    const ir = make('low');
    ir.setWorld(pw);
    run(ir, camAt(8, 65.6, 8), 60);
    const first = ir.group.children.find((c) => c.name === 'ic-0,0');
    expect(first.visible).toBe(true);
    run(ir, camAt(11 * 16 + 8, 65.6, 8), 120);
    expect(first.visible === false || !ir.group.children.includes(first)).toBe(true);
    expect(ir.stats.chunks).toBeLessThanOrEqual(INTERIOR_TIERS.low.maxChunks + 8);
    run(ir, camAt(8, 65.6, 8), 80);
    expect(ir.group.children.find((c) => c.name === 'ic-0,0').visible).toBe(true);
    ir.dispose();
  });
});

describe('durum, kapı animasyonu, holo, ışık', () => {
  it('durum değişimi bayt olarak yazılır (kapı/dolap); kayan kapı açıklığı kareler boyunca yumuşak artar ve 1\'e yerleşir', () => {
    const door = prop('kapi', 40, 64, 40, 0, { id: 777 });
    const pw = makeWorld(room(2, 2, [door]));
    const ir = make('high');
    ir.setWorld(pw);
    const cam = camAt(40, 65.6, 46);
    run(ir, cam, 20);
    const en = ir.entries.get(2 * 4096 + 2);
    const rec = en.doors.find((d) => d.r.id === 777);
    expect(rec).toBeTruthy();
    const aInst = en.geometry.getAttribute('aInst');
    const aAnim = en.geometry.getAttribute('aAnim');
    expect(aInst.array[rec.r.v0 * 4]).toBe(0);
    pw.use(777, { x: 40, y: 64, z: 46 });
    expect(pw.state(777)).toBe(1);
    const vals = [];
    for (let i = 0; i < 40; i++) {
      ir.update(1 / 60, cam);
      vals.push(aAnim.array[rec.r.v0 * 4 + 3]);
    }
    expect(aInst.array[rec.r.v0 * 4]).toBe(1);
    expect(vals[vals.length - 1]).toBe(127);
    expect(vals.some((v) => v > 0 && v < 127)).toBe(true);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
    pw.use(777, { x: 40, y: 64, z: 50 });
    run(ir, cam, 40);
    expect(aAnim.array[rec.r.v0 * 4 + 3]).toBe(0);
    expect(aInst.array[rec.r.v0 * 4]).toBe(0);
    ir.dispose();
  });

  it('holo yüzleri tek ağda toplanır (≤ kademe tavanı), güç durumu bayt olarak yazılır', () => {
    const holos = [];
    for (let i = 0; i < 12; i++) holos.push(prop('holo_ekran', 20 + i * 2, 66, 30, 0));
    const pw = makeWorld(holos);
    const ir = make('low');
    ir.setWorld(pw);
    const cam = camAt(30, 65.6, 36);
    run(ir, cam, 40);
    const h = ir.group.children.find((c) => c.name === 'ic-holo');
    expect(h).toBeTruthy();
    expect(h.material.transparent).toBe(true);
    expect(h.material.blending).toBe(THREE.AdditiveBlending);
    expect(ir.stats.holo).toBeLessThanOrEqual(INTERIOR_TIERS.low.maxHolo);
    expect(ir.stats.holo).toBeGreaterThan(0);
    const before = ir.group.children.find((c) => c.name === 'ic-holo');
    const id = holos[0].id;
    pw.setState(id, 2);
    run(ir, cam, 20);
    const after = ir.group.children.find((c) => c.name === 'ic-holo');
    expect(after === before).toBe(false); // durum değişince yeniden kuruldu
    ir.dispose();
  });

  it('ışık tazeleme: getLight değerleri aLight baytlarına yazılır', () => {
    const pw = makeWorld(room(1, 1));
    const ir = make('high');
    let L = (12 << 4) | 3;
    ir.setWorld(pw, { getLight: () => L });
    const cam = camAt(24, 65.6, 24);
    run(ir, cam, 6);
    const g = ir.group.children.find((c) => c.name === 'ic-1,1').geometry;
    const a = g.getAttribute('aLight').array;
    expect(a[0]).toBe(Math.round(12 / 15 * 255));
    expect(a[1]).toBe(Math.round(3 / 15 * 255));
    L = (4 << 4) | 15;
    run(ir, cam, 60);
    expect(a[0]).toBe(Math.round(4 / 15 * 255));
    expect(a[1]).toBe(255);
    ir.dispose();
  });

  it('boşaltılan chunk meshi siler; yeniden yüklenince yeniden pişer; geometriler dispose edilir', () => {
    const pw = makeWorld(room(1, 1).concat(room(2, 1)));
    const ir = make('high');
    ir.setWorld(pw);
    const cam = camAt(32, 65.6, 24);
    run(ir, cam, 20);
    expect(ir.group.children.filter((c) => c.name.indexOf('ic-') === 0 && c.name !== 'ic-holo').length).toBe(2);
    const g = ir.group.children.find((c) => c.name === 'ic-2,1').geometry;
    let disposed = 0;
    g.addEventListener('dispose', () => { disposed++; });
    pw.unloadChunk(2, 1);
    run(ir, cam, 10);
    expect(ir.group.children.find((c) => c.name === 'ic-2,1')).toBeUndefined();
    expect(disposed).toBe(1);
    pw.loadChunk(2, 1);
    run(ir, cam, 10);
    expect(ir.group.children.find((c) => c.name === 'ic-2,1')).toBeTruthy();
    ir.dispose();
  });
});

describe('atlas ve ömür', () => {
  it('paylaşılan ana atlas dispose edilmez; pano atlası yalnız pano propu varken kurulur ve dispose edilir', () => {
    const shared = createSignAtlas({ THREE, createCanvas: () => fakeCanvas() });
    let sharedDisposed = false;
    shared.texture.addEventListener('dispose', () => { sharedDisposed = true; });
    const pw = makeWorld([prop('masa', 20, 64, 20, 0)]);
    const ir = make('high', { signAtlas: shared });
    ir.setWorld(pw);
    run(ir, camAt(20, 65.6, 24), 10);
    expect(ir.boardAtlas).toBeNull();
    const pw2 = makeWorld([prop('menu_tahtasi', 20, 65, 20, 0), prop('neon_tabela_ic', 24, 66, 20, 0, { flags: 3 })]);
    ir.setWorld(pw2);
    run(ir, camAt(20, 65.6, 26), 10);
    expect(ir.boardAtlas).toBeTruthy();
    expect(ir.boardAtlas.size).toBe(1024);
    const bt = ir.boardAtlas.texture;
    let boardDisposed = false;
    bt.addEventListener('dispose', () => { boardDisposed = true; });
    ir.dispose();
    expect(boardDisposed).toBe(true);
    expect(sharedDisposed).toBe(false);
    expect(() => ir.dispose()).not.toThrow();
    expect(() => ir.update(0.016, camAt(0, 0, 0))).not.toThrow();
  });

  it('setWorld(null) her şeyi boşaltır; dünya yokken update güvenli; moodRgb sınırlı tablo', () => {
    const pw = makeWorld(room(1, 1));
    const ir = make('high');
    expect(() => ir.update(0.016, camAt(0, 64, 0))).not.toThrow();
    ir.setWorld(pw);
    run(ir, camAt(24, 65.6, 24), 10);
    expect(ir.stats.chunks).toBeGreaterThan(0);
    ir.setWorld(null);
    expect(ir.stats.chunks).toBe(0);
    expect(ir.group.children.filter((c) => c.name !== '').length).toBe(0);
    expect(() => ir.update(0.016, camAt(0, 64, 0))).not.toThrow();
    ['mor', 'camgobegi', 'mavi', 'yesil', 'pembe', 'kehribar', 'beyaz', 'mint', 'turuncu', 'sicak', 'renkli', 'yok', undefined].forEach((h) => {
      const c = moodRgb(h, 5);
      expect(c.length).toBe(3);
      c.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); });
    });
    ir.dispose();
  });

  it('şablon ısınması: tüm tanımlar ilk saniyelerde kurulur', () => {
    const ir = make('high');
    ir.setWorld(makeWorld([prop('masa', 20, 64, 20, 0)]));
    run(ir, camAt(20, 65.6, 24), Math.ceil(INTERIOR_DEFS.length / 2) + 2);
    expect(ir.stats.warm).toBe(INTERIOR_DEFS.length);
    ir.dispose();
  });

  it('bütçe: 1000 kare güncelleme CPU\'su küçük (ortalama < 1 ms), pişirmeler kare başı 1', () => {
    const props = [];
    for (let cx = 0; cx < 5; cx++) for (let cz = 0; cz < 5; cz++) props.push(...room(cx, cz));
    const pw = makeWorld(props);
    const ir = make('high');
    ir.setWorld(pw);
    const cam = camAt(40, 65.6, 40);
    run(ir, cam, 60);
    // qa5: CPU zamanı + en iyi 3 parti; eşik yük ölçeğiyle (bkz. test/perfScale.js)
    const ms = bestOf(3, () => {
      const t0 = cpuMs();
      for (let i = 0; i < 500; i++) ir.update(1 / 60, cam);
      return (cpuMs() - t0) / 500;
    });
    expect(ms).toBeLessThan(scaled(1.0));
    ir.dispose();
  });

  it('warmBegin: gövde ve holo programları için görünür örnek mesh ekler, warmEnd her şeyi geri alır (ilk giriş derleme takılması)', () => {
    const ir = make('high');
    const scene = new THREE.Scene();
    const outer = new THREE.Group();
    outer.visible = false;
    outer.add(ir.group);
    scene.add(outer);
    const before = ir.group.children.length;
    const end = ir.warmBegin();
    expect(typeof end).toBe('function');
    expect(ir.group.children.length).toBe(before + 2);
    const seen = [];
    scene.traverseVisible((o) => { if (o.isMesh && o.name === 'ic-warm') seen.push(o.material.name || o.material.type); });
    expect(seen.length).toBe(2);
    expect(new Set(ir.group.children.filter((c) => c.name === 'ic-warm').map((c) => c.material)).size).toBe(2);
    end();
    expect(ir.group.children.length).toBe(before);
    expect(outer.visible).toBe(false);
    expect(ir.group.visible).toBe(true);
    ir.dispose();
    expect(ir.warmBegin()).toBe(null);
  });
});
