import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { analyzeTemplate, createDropBatch, pairKeyOf } from './dropBatch.js';
import { createDroppedItem } from './heldItems.js';
import { ITEM_LIST } from '../sim/items.js';

const geoA = new THREE.BoxGeometry(1, 1, 1);
const geoB = new THREE.SphereGeometry(1, 6, 4);
const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const matB = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const shared = { shadowGeo: new THREE.CircleGeometry(0.5, 8), shadowMat: new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 }) };

/** createDroppedItem benzeri şablon: pivot (dönen) → gövde + (paylaşılan) gölge. */
function makeTemplate(kind, opts) {
  const o = opts || {};
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  const body = new THREE.Mesh(kind === 'a' ? geoA : geoB, kind === 'a' ? matA : matB);
  body.position.set(0.1, 0.2, 0.3);
  pivot.add(body);
  g.add(pivot);
  const shadow = new THREE.Mesh(shared.shadowGeo, shared.shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  g.add(shadow);
  pivot.position.y = 0.5;
  g.userData.update = (t) => { pivot.rotation.y = t * 2; pivot.position.y = 0.5 + Math.sin(t) * 0.1; };
  if (o.modelUpdate) body.userData.update = () => {};
  return g;
}

describe('analyzeTemplate', () => {
  it('düz Mesh şablonu toplu çizilebilir; parçalar (geometri, malzeme) çiftleriyle çıkar', () => {
    const a = analyzeTemplate(makeTemplate('a'));
    expect(a.parts.length).toBe(2);
    expect(a.parts[0].pk).toBe(pairKeyOf(geoA, matA));
    expect(a.parts[1].pk).toBe(pairKeyOf(shared.shadowGeo, shared.shadowMat));
  });

  it('model düzeyi animasyon / çoklu malzeme / özel gölgelendirici / deri / Points → toplu çizilemez', () => {
    expect(analyzeTemplate(makeTemplate('a', { modelUpdate: true }))).toBeNull();
    const multi = new THREE.Group();
    multi.add(new THREE.Mesh(geoA, [matA, matB]));
    expect(analyzeTemplate(multi)).toBeNull();
    const sh = new THREE.Group();
    sh.add(new THREE.Mesh(geoA, new THREE.ShaderMaterial()));
    expect(analyzeTemplate(sh)).toBeNull();
    const pts = new THREE.Group();
    pts.add(new THREE.Points(geoA, new THREE.PointsMaterial()));
    expect(analyzeTemplate(pts)).toBeNull();
    const sk = new THREE.Group();
    sk.add(new THREE.SkinnedMesh(geoA, matA));
    expect(analyzeTemplate(sk)).toBeNull();
    const own = new THREE.Group();
    const m = new THREE.Mesh(geoA, matA);
    m.onBeforeRender = () => {};
    own.add(m);
    expect(analyzeTemplate(own)).toBeNull();
    expect(analyzeTemplate(new THREE.Group())).toBeNull(); // parçasız
    expect(analyzeTemplate(null)).toBeNull();
  });
});

describe('createDropBatch', () => {
  function make(extra) {
    const root = new THREE.Group();
    const keys = { 'k:a': () => makeTemplate('a'), 'k:b': () => makeTemplate('b'), 'k:x': () => makeTemplate('a', { modelUpdate: true }) };
    const b = createDropBatch(Object.assign({ THREE, root, create: (k) => keys[k]() }, extra || {}));
    return { b, root };
  }

  it('aynı (geometri, malzeme) çifti tüm anahtarlarda tek InstancedMesh: 2 anahtar × 2 parça → 3 çift (gölge ortak)', () => {
    const { b, root } = make();
    b.begin();
    b.add('k:a', 0, 0, 0, 1, 0, 0.016);
    b.add('k:a', 2, 0, 0, 1, 0.5, 0.016);
    b.add('k:b', 4, 0, 0, 1, 1, 0.016);
    b.end();
    expect(b.pairCount).toBe(3);
    expect(b.stats.drawn).toBe(3);
    expect(b.stats.items).toBe(3);
    const ims = root.children.filter((c) => c.isInstancedMesh);
    expect(ims.length).toBe(3);
    const counts = ims.map((m) => m.count).sort();
    expect(counts).toEqual([1, 2, 3]); // gövde A: 2, gövde B: 1, ortak gölge: 3
    expect(ims.every((m) => m.frustumCulled === false && m.visible)).toBe(true);
  });

  it('örnek matrisi = şablon grubunun dünya matrisi (konum, ölçek, update dönmesi/salınımı) × parça yerel matrisi', () => {
    const { b, root } = make();
    const ref = makeTemplate('a');
    b.begin();
    b.add('k:a', 5, 6, 7, 1.3, 0.8, 0.016);
    b.end();
    ref.position.set(5, 6, 7);
    ref.scale.setScalar(1.3);
    ref.userData.update(0.8, 0.016);
    ref.updateMatrixWorld(true);
    let bodyMesh = null;
    ref.traverse((o) => { if (o.isMesh && o.geometry === geoA) bodyMesh = o; });
    const im = root.children.find((c) => c.isInstancedMesh && c.geometry === geoA);
    const m4 = new THREE.Matrix4();
    im.getMatrixAt(0, m4);
    for (let i = 0; i < 16; i++) expect(m4.elements[i]).toBeCloseTo(bodyMesh.matrixWorld.elements[i], 5);
  });

  it('kare başı sıfırlanır: begin() sonrası eklenmeyen çiftler görünmez olur', () => {
    const { b, root } = make();
    b.begin(); b.add('k:a', 0, 0, 0, 1, 0, 0.016); b.add('k:b', 1, 0, 0, 1, 0, 0.016); b.end();
    expect(root.children.filter((c) => c.visible).length).toBe(3);
    b.begin(); b.add('k:a', 0, 0, 0, 1, 0, 0.016); b.end();
    const vis = root.children.filter((c) => c.visible);
    expect(vis.length).toBe(2); // A gövdesi + ortak gölge; B gövdesi gizli
    expect(b.stats.drawn).toBe(2);
    b.begin(); b.end();
    expect(root.children.filter((c) => c.visible).length).toBe(0);
  });

  it('supports: toplu olmayan anahtar false (bireysel grup yolu); yalnız bir kez şablon kurulur', () => {
    let built = 0;
    const root = new THREE.Group();
    const b = createDropBatch({ THREE, root, create: (k) => { built++; return k === 'x' ? makeTemplate('a', { modelUpdate: true }) : makeTemplate('a'); } });
    expect(b.supports('x')).toBe(false);
    expect(b.supports('x')).toBe(false);
    expect(b.supports('y')).toBe(true);
    expect(b.supports('y')).toBe(true);
    expect(built).toBe(2);
    expect(b.add('x', 0, 0, 0, 1, 0, 0.016)).toBe(false);
  });

  it('kapasite aşılınca taşan örnekler atılır (çökme yok) ve sayılır', () => {
    const { b } = make({ cap: 3 });
    b.begin();
    const res = [];
    for (let i = 0; i < 5; i++) res.push(b.add('k:a', i, 0, 0, 1, 0, 0.016));
    b.end();
    expect(res).toEqual([true, true, true, false, false]);
    expect(b.stats.dropped).toBe(4); // 2 örnek × (gövde + gölge)
  });

  it('prime: görünmez InstancedMesh kurar (programların ısınması için); dispose hepsini kaldırır', () => {
    const { b, root } = make();
    expect(b.prime(['k:a', 'k:b', 'k:x'])).toBe(2);
    expect(b.pairCount).toBe(3);
    expect(root.children.filter((c) => c.isInstancedMesh).every((m) => m.count === 0 && m.visible === false)).toBe(true);
    b.dispose();
    expect(root.children.length).toBe(0);
    expect(b.supports('k:a')).toBe(false);
    expect(b.add('k:a', 0, 0, 0, 1, 0, 0.016)).toBe(false);
  });
});

describe('gerçek eşya modelleri', () => {
  it('çizim çağrısı: aynı çifti paylaşan gölge/parıltı/yüz ağları birleşir; çoğu eşya toplu çizilebilir', () => {
    const root = new THREE.Group();
    const b = createDropBatch({ THREE, root, create: (k) => createDroppedItem(THREE, k) });
    const keys = ITEM_LIST.map((it) => it.key);
    const batchable = keys.filter((k) => b.supports(k));
    expect(batchable.length).toBeGreaterThan(keys.length * 0.5);
    // 60 FARKLI eşya: bireysel mesh toplamı, toplu çift sayısının ≥ 2 katı (ortak gölge/parıltı/yüz geometrileri birleşir)
    const sample = batchable.slice(0, 60);
    let individual = 0;
    b.begin();
    sample.forEach((k, i) => {
      const g = createDroppedItem(THREE, k);
      g.traverse((o) => { if (o.isMesh) individual++; });
      b.add(k, i, 0, 0, 1, 0.3, 0.016);
    });
    b.end();
    expect(b.stats.drawn).toBeLessThan(individual / 2);
    // 60 eşya, 6 farklı anahtar (ganimet yığını): çift sayısı örnek sayısından bağımsız → ≥ 10× azalma
    const six = batchable.slice(0, 6);
    let indiv6 = 0;
    b.begin();
    for (let i = 0; i < 60; i++) {
      const k = six[i % 6];
      const g = createDroppedItem(THREE, k);
      g.traverse((o) => { if (o.isMesh) indiv6++; });
      b.add(k, i, 0, 0, 1, 0.3, 0.016);
    }
    b.end();
    expect(b.stats.drawn).toBeLessThan(indiv6 / 10);
    expect(b.stats.dropped).toBe(0);
  });
});
